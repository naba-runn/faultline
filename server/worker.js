// server/worker.js
//
// Task 25: a genuinely separate process from server.js/app.js — its
// own entry point, run as its own Render Background Worker service in
// deployment (see DECISIONS.md's "Task 25" entry for why a separate
// process, not a Worker folded into the API's Express process: queue
// processing shouldn't compete with request handling for CPU on a
// free instance, and it's the more accurate answer to "how would this
// scale").
//
// Needs its own MongoDB connection (reuses config/db.js — the exact
// same connectDB the API process uses) since job processing re-fetches
// ErrorGroup/Project fresh by ID rather than trusting the serialized
// job payload for anything beyond IDs/message/stack (see
// enrichmentQueue.js's doc comment for why).
//
// Run locally with: node worker.js (or: npm run worker / npm run worker:dev)
// Must be running for AI enrichment to happen at all — without it,
// jobs simply queue up in Redis and wait; nothing is lost, but no
// ErrorGroup gets an aiSummary until this process is running. This is
// a deliberate, correct consequence of a durable queue, not a bug —
// see this task's manual test (kill the worker mid-queue, confirm
// jobs wait and resume).

const { Worker } = require('bullmq');
const config = require('./config/env');
const connectDB = require('./config/db');
const { getBullConnection } = require('./config/redis');
const { QUEUE_NAME } = require('./services/enrichmentQueue');
const { QUEUE_NAME: ALERT_QUEUE_NAME } = require('./services/alertQueue');
const { enrichErrorGroup } = require('./services/errorGroupService');
const alertService = require('./services/alertService');
const sseHub = require('./services/sseHub');
const ErrorGroup = require('./models/ErrorGroup');
const Project = require('./models/Project');
const { enqueueSeverityThresholdAlert } = require('./services/alertQueue');

// Task 28.3: severity ordering for the >= comparison below. Not the
// same array as models/Project.js's SEVERITY_LEVELS or
// aiService.js's VALID_SEVERITIES (both just validate membership) —
// this one specifically encodes ordering, which only this comparison
// needs.
const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical'];

async function processEnrichmentJob(job) {
  const { errorGroupId, projectId, message, stack } = job.data;

  // Re-fetch fresh rather than trust the serialized job payload for
  // anything beyond the IDs/message/stack — see enrichmentQueue.js.
  const errorGroup = await ErrorGroup.findById(errorGroupId);
  if (!errorGroup) {
    // The group was deleted between enqueue and processing. Nothing to
    // enrich — this is not a failure, and retrying won't change the
    // outcome, so log and return rather than throw.
    console.warn(`[worker] ErrorGroup ${errorGroupId} no longer exists — skipping job ${job.id}`);
    return;
  }

  // Project.findById, not projectService.getProject — the latter also
  // enforces ownerId scoping, which doesn't apply here: this job was
  // already authorized at enqueue time (either by apiKeyMiddleware for
  // real ingestion, or by the JWT ownership check in
  // projectController.simulateError). Re-deriving ownership here would
  // be redundant, not an extra safety check.
  const project = await Project.findById(projectId);

  // enrichErrorGroup throws on retryable failures (Gemini API errors,
  // a transient Mongo write failure) — deliberately not caught here,
  // so BullMQ's retry/backoff (enrichmentQueue.js's JOB_OPTIONS) can
  // do its job. See errorGroupService.js's doc comment on
  // enrichErrorGroup for the full contract.
  await enrichErrorGroup({ errorGroup, project, message, stack });

  // Task 28.3: severity-threshold alert trigger. enrichErrorGroup
  // writes aiSummary via its own findByIdAndUpdate — it does NOT
  // mutate the `errorGroup` object above, and doesn't return the
  // computed summary either (see its doc comment: its contract is
  // deliberately narrow, changed once already for Task 25). So this
  // re-fetches fresh rather than reading a stale in-memory value —
  // the same re-fetch-don't-trust-the-snapshot approach this file
  // already uses for errorGroupId/projectId above, just applied again
  // after a second write.
  //
  // Also handles the case where enrichErrorGroup returned early
  // without writing anything (Gemini response failed validation —
  // aiSummary stays null): freshErrorGroup.aiSummary is then still
  // null, severity is undefined, and the >= comparison below simply
  // never fires. No separate null-check needed beyond the optional
  // chaining already here.
  if (project?.alertConfig?.severityThreshold?.enabled) {
    const freshErrorGroup = await ErrorGroup.findById(errorGroupId);
    const severity = freshErrorGroup?.aiSummary?.severity;
    const minSeverity = project.alertConfig.severityThreshold.minSeverity;

    if (severity && SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(minSeverity)) {
      enqueueSeverityThresholdAlert({ errorGroupId, projectId }).catch((err) => {
        console.error(`[worker] failed to enqueue severity-threshold alert for group ${errorGroupId}:`, err.message);
      });
    }
  }

  // Task 26: dashboard live-update signal, published from this
  // separate process via the same Redis pub/sub channel sseHub.js
  // uses — the API process's SSE connections don't know or care which
  // process an event came from, they just get whatever's published on
  // "sse:events". Only reached on SUCCESS (enrichErrorGroup throwing
  // means this line never runs, and a failed job after all retries are
  // exhausted has nothing meaningful to announce to a live viewer —
  // aiSummary stays null, same as it would have before Task 25).
  await sseHub.publish(projectId, 'enrichment_completed', { errorGroupId }).catch((err) => {
    console.error(`[worker] failed to publish SSE event for group ${errorGroupId}:`, err.message);
  });
}

// Task 28.2: consumer side of the alert-delivery queue (see
// alertQueue.js's producer side and alertService.js for the actual
// Resend call). Runs in this same process rather than a third one --
// see alertQueue.js's doc comment for why a dedicated process wasn't
// justified.
//
// Deliberately does NOT re-decide whether an alert *should* fire
// (config.newGroup / config.severityThreshold gating, or the severity
// >= minSeverity comparison) -- that decision is made once, at
// enqueue time, by whichever caller enqueues the job (Task 28.3:
// ingestController/simulateError for 'newGroup', this same worker's
// processEnrichmentJob for 'severityThreshold'). This function only
// re-fetches fresh data (same reasoning as processEnrichmentJob: the
// job payload is IDs only) and sends -- re-deciding here would
// duplicate that logic in two places that could drift apart.
async function processAlertJob(job) {
  const { kind, errorGroupId, projectId } = job.data;

  const errorGroup = await ErrorGroup.findById(errorGroupId);
  const project = await Project.findById(projectId);

  if (!errorGroup || !project) {
    // Same non-failure skip as processEnrichmentJob: deleted between
    // enqueue and processing, nothing meaningful left to alert about.
    console.warn(`[worker] alert job ${job.id}: group or project no longer exists — skipping`);
    return;
  }

  const recipient = project.alertConfig?.email;
  if (!recipient) {
    // Config was cleared between enqueue and processing (e.g. the
    // recipient email was removed via PATCH /alerts). Not a failure —
    // there's simply nowhere to send it now.
    console.warn(`[worker] alert job ${job.id}: no recipient configured for project ${projectId} — skipping`);
    return;
  }

  const { subject, html } =
    kind === 'severityThreshold'
      ? alertService.buildSeverityThresholdEmail({ project, errorGroup })
      : alertService.buildNewGroupEmail({ project, errorGroup });

  // Not caught here, same reasoning as enrichErrorGroup in
  // processEnrichmentJob — a rejected promise lets BullMQ's
  // retry/backoff (alertQueue.js's JOB_OPTIONS) do its job.
  await alertService.sendAlertEmail({ to: recipient, subject, html });
}


async function start() {
  await connectDB();

  const worker = new Worker(QUEUE_NAME, processEnrichmentJob, {
    connection: getBullConnection(),
  });

  // Task 28.2: a second, independent Worker instance for the 'alerts'
  // queue in this same process. Separate Worker objects (not one
  // Worker handling both queues) because BullMQ's Worker is
  // inherently single-queue -- this mirrors having two independently
  // failing/completing job streams with their own concurrency, not a
  // shared one.
  const alertWorker = new Worker(ALERT_QUEUE_NAME, processAlertJob, {
    connection: getBullConnection(),
  });

  // Failed-job visibility (Task 25.4) — logged, not silently dropped.
  // After JOB_OPTIONS.attempts (3) are exhausted, BullMQ stops
  // retrying and this fires one last time for the final failure.
  worker.on('failed', (job, err) => {
    console.error(
      `[worker] job ${job.id} (group ${job.data.errorGroupId}) failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`,
      err.message
    );
  });

  worker.on('completed', (job) => {
    console.log(`[worker] job ${job.id} (group ${job.data.errorGroupId}) completed`);
  });

  // Task 28.2: same failed/completed visibility pattern for the alert
  // queue, kept as its own listener pair rather than sharing the
  // enrichment worker's — the two logs need different labels and the
  // job.data shape differs (kind/errorGroupId/projectId here, vs.
  // errorGroupId/projectId/message/stack above).
  alertWorker.on('failed', (job, err) => {
    console.error(
      `[worker] alert job ${job.id} (${job.data.kind}, group ${job.data.errorGroupId}) failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`,
      err.message
    );
  });

  alertWorker.on('completed', (job) => {
    console.log(`[worker] alert job ${job.id} (${job.data.kind}, group ${job.data.errorGroupId}) completed`);
  });

  console.log(`[worker] Faultline enrichment worker listening on queue "${QUEUE_NAME}" (${config.nodeEnv})`);
  console.log(`[worker] Faultline alert worker listening on queue "${ALERT_QUEUE_NAME}" (${config.nodeEnv})`);

  process.on('unhandledRejection', (err) => {
    console.error('[worker] Unhandled Rejection:', err);
    Promise.all([worker.close(), alertWorker.close()]).finally(() => process.exit(1));
  });

  process.on('uncaughtException', (err) => {
    console.error('[worker] Uncaught Exception:', err);
    Promise.all([worker.close(), alertWorker.close()]).finally(() => process.exit(1));
  });
}

start();