// server/services/deploymentService.js
//
// Task 40: Deployment CRUD/query + the DB-touching half of
// correlation (the pure math lives in deploymentCorrelationService.js
// — this file queries ErrorEvent counts and calls that). Mirrors
// errorGroupService.js's own split with trendService.js: pure
// calculation in one file, the Mongo query that feeds it in the
// service that owns the resource.

const mongoose = require('mongoose');
const Deployment = require('../models/Deployment');
const ErrorGroup = require('../models/ErrorGroup');
const ErrorEvent = require('../models/ErrorEvent');
const { computeCorrelation, DEFAULT_WINDOW_MINUTES } = require('./deploymentCorrelationService');
const incidentService = require('./incidentService');
const { enqueueDeploymentCorrelation } = require('./deploymentCorrelationQueue');

/**
 * Records a new Deployment and enqueues its (delayed) correlation
 * job. Called only from the GitHub webhook receiver (Task 40.2) once
 * its signature has been verified — see controllers/webhookController.js.
 * No ownership check here (there's no authenticated user on a
 * webhook, only a shared secret proving "this came from GitHub" — see
 * DECISIONS.md's "Task 40: Webhook secret" entry); the caller is
 * responsible for the `Project.findById` existence check before
 * calling this.
 *
 * `githubDeliveryId` (the webhook's `X-GitHub-Delivery` header, absent
 * for manually-created deployments) is how this stays idempotent
 * against GitHub's own at-least-once redelivery behavior — a retried
 * delivery reuses the same id, hits the model's sparse unique index,
 * and this returns the original Deployment (duplicate: true) instead
 * of creating a second document and enqueueing a second correlation
 * job for the same real-world deploy.
 */
async function recordDeployment({ projectId, sha, ref, deployedAt, source, githubDeliveryId }) {
  let deployment;
  try {
    deployment = await Deployment.create({
      projectId,
      sha,
      ref: ref || null,
      deployedAt: deployedAt || new Date(),
      source,
      githubDeliveryId: githubDeliveryId || null,
    });
  } catch (err) {
    if (err.code === 11000 && githubDeliveryId) {
      const existing = await Deployment.findOne({ githubDeliveryId });
      if (existing) {
        return { deployment: existing, duplicate: true };
      }
    }
    throw err;
  }

  // Enqueue, don't compute inline — same "no synchronous slow/timing-
  // dependent work in the request path" rule as Task 25/28, with the
  // added constraint here that the after-window genuinely hasn't
  // elapsed yet (see deploymentCorrelationQueue.js's doc comment). A
  // failure to enqueue is logged, not thrown — matches
  // ingestController's fire-and-forget-with-catch pattern for its own
  // enqueue calls: the Deployment row itself is already durably
  // saved, so a queue hiccup here means correlation stays pending
  // rather than the whole webhook request failing.
  enqueueDeploymentCorrelation({
    deploymentId: deployment._id,
    deployedAt: deployment.deployedAt,
  }).catch((err) => {
    console.error(`[deploymentService] failed to enqueue correlation for deployment ${deployment._id}:`, err.message);
  });

  return { deployment, duplicate: false };
}

// Task 40.5: same cursor pagination shape as errorGroupService.js's
// listErrorGroups — encodeCursor/decodeCursor duplicated locally
// rather than extracted into a shared util. Two call sites doing the
// same ~15 lines isn't worth a shared abstraction yet (see
// PROJECT_RULES.md §11's restraint-over-premature-abstraction
// stance, already invoked for smaller cases than this elsewhere in
// this codebase) — revisit if a third cursor-paginated resource shows
// up and the duplication starts drifting.
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function encodeCursor(deployment) {
  return Buffer.from(
    JSON.stringify({ deployedAt: deployment.deployedAt.toISOString(), id: String(deployment._id) })
  ).toString('base64');
}

function decodeCursor(cursor) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  } catch (err) {
    throw new Error('INVALID_CURSOR');
  }

  const deployedAt = new Date(parsed && parsed.deployedAt);
  if (!parsed || Number.isNaN(deployedAt.getTime()) || typeof parsed.id !== 'string') {
    throw new Error('INVALID_CURSOR');
  }

  return { deployedAt, id: parsed.id };
}

/**
 * Lists Deployments for a project, most recent first, cursor-paginated
 * — same pattern as errorGroupService.listErrorGroups. Ownership is
 * NOT checked here (caller's responsibility, same separation of
 * concerns as that function).
 */
async function listDeployments(projectId, { limit, cursor } = {}) {
  let pageSize = DEFAULT_PAGE_SIZE;
  if (limit !== undefined) {
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      throw new Error('INVALID_LIMIT');
    }
    pageSize = Math.min(parsedLimit, MAX_PAGE_SIZE);
  }

  const filter = { projectId };

  if (cursor !== undefined) {
    const { deployedAt, id } = decodeCursor(cursor);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error('INVALID_CURSOR');
    }
    filter.$or = [
      { deployedAt: { $lt: deployedAt } },
      { deployedAt, _id: { $lt: id } },
    ];
  }

  const deployments = await Deployment.find(filter)
    .sort({ deployedAt: -1, _id: -1 })
    .limit(pageSize + 1);

  const hasMore = deployments.length > pageSize;
  const page = hasMore ? deployments.slice(0, pageSize) : deployments;

  return {
    deployments: page.map((d) => ({
      id: d._id,
      projectId: d.projectId,
      sha: d.sha,
      ref: d.ref,
      deployedAt: d.deployedAt,
      source: d.source,
      correlation: d.correlation,
    })),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  };
}

/**
 * Task 40.3/40.4: computes and persists one Deployment's before/after
 * correlation. Called only from worker.js's deployment-correlation job
 * processor, once the after-window has elapsed (guaranteed by the
 * job's own delay — see deploymentCorrelationQueue.js). Re-fetches the
 * Deployment fresh by ID rather than trusting anything from the job
 * payload beyond the ID itself, same principle as
 * processEnrichmentJob/processAlertJob in worker.js.
 *
 * ErrorEvent has no projectId of its own (only errorGroupId — see
 * that model's comment), so scoping "this project's events" requires
 * first resolving the project's own ErrorGroup ids, same two-step
 * query overviewService.getDashboardOverview already uses for the
 * same reason — not reinvented here.
 */
async function correlateDeployment(deploymentId, now = new Date()) {
  const deployment = await Deployment.findById(deploymentId);
  if (!deployment) {
    // Deleted between enqueue and processing (e.g. its project was
    // deleted, cascading). Nothing to correlate — not a failure.
    console.warn(`[deploymentService] Deployment ${deploymentId} no longer exists — skipping correlation`);
    return null;
  }

  const windowMinutes = DEFAULT_WINDOW_MINUTES;
  const windowMs = windowMinutes * 60 * 1000;
  const deployedAt = deployment.deployedAt;
  const beforeStart = new Date(deployedAt.getTime() - windowMs);
  const afterEnd = new Date(deployedAt.getTime() + windowMs);

  const groupIds = await ErrorGroup.find({ projectId: deployment.projectId }).distinct('_id');

  const [beforeCount, afterCount] = await Promise.all([
    ErrorEvent.countDocuments({
      errorGroupId: { $in: groupIds },
      receivedAt: { $gte: beforeStart, $lt: deployedAt },
    }),
    ErrorEvent.countDocuments({
      errorGroupId: { $in: groupIds },
      receivedAt: { $gte: deployedAt, $lt: afterEnd },
    }),
  ]);

  const { beforeRate, afterRate, regressionSuspected } = computeCorrelation({
    beforeCount,
    afterCount,
    windowMinutes,
  });

  const updated = await Deployment.findByIdAndUpdate(
    deploymentId,
    {
      $set: {
        correlation: {
          status: 'computed',
          windowMinutes,
          beforeCount,
          afterCount,
          beforeRate,
          afterRate,
          regressionSuspected,
          computedAt: now,
        },
      },
    },
    { new: true }
  );

  // Task 41.2: deployment-regression trigger. Only when this
  // correlation run actually found a regression — a routine "no
  // regression" result never opens or touches an incident. Affected
  // groups are the ones with events in the after-window specifically
  // (not every group in the project), so the incident's
  // affectedGroups reflects what actually regressed, not the
  // project's whole error surface.
  if (regressionSuspected) {
    const affectedGroupIds = await ErrorEvent.find({
      errorGroupId: { $in: groupIds },
      receivedAt: { $gte: deployedAt, $lt: afterEnd },
    }).distinct('errorGroupId');

    const shortSha = (deployment.sha || '').slice(0, 7);
    await incidentService
      .recordTrigger({
        projectId: deployment.projectId,
        triggerType: 'deployment',
        refId: deployment._id,
        affectedGroupIds,
        title: `Regression suspected after deployment ${shortSha}`,
        timelineType: 'deployment_regression',
        timelineMessage: `Deployment ${shortSha}${deployment.ref ? ` (${deployment.ref})` : ''} correlated with a ${afterCount}-event spike (baseline ${beforeCount}) in the ${windowMinutes} minutes after deploy.`,
        now,
      })
      .catch((err) => {
        console.error(`[deploymentService] failed to record incident trigger for deployment ${deployment._id}:`, err.message);
      });
  }

  return updated;
}

module.exports = {
  recordDeployment,
  listDeployments,
  correlateDeployment,
};
