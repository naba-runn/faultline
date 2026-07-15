// server/services/alertQueue.js
//
// Task 28.2: the producer side of the alert-delivery job queue --
// same Queue/Worker split as enrichmentQueue.js/worker.js (Task 25),
// and for the same reason: a Resend API blip shouldn't block the
// ingestion request (new-group trigger) or the enrichment worker
// (severity-threshold trigger) that enqueues it. Consumer side is
// wired into the existing worker.js process (28.3) rather than a
// third process -- alert jobs are lightweight and infrequent (opt-in,
// per-project) enough that a dedicated process isn't justified; see
// DECISIONS.md's "Task 25" entry for the cost/complexity reasoning
// this extends.
//
// Job payload is deliberately just IDs + a `kind` discriminator, never
// a Mongoose document or pre-rendered email -- same reasoning as
// enrichmentQueue.js: BullMQ persists job data as JSON, and the
// worker re-fetches ErrorGroup/Project fresh by ID so the email
// reflects whatever's true at send time (e.g. aiSummary having
// finished enriching), not a stale snapshot from enqueue time.

const { Queue } = require('bullmq');
const { getBullConnection } = require('../config/redis');

const QUEUE_NAME = 'alerts';

let queue = null;
function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getBullConnection() });
  }
  return queue;
}

// Retry/backoff (Task 28.2): same policy as enrichmentQueue.js's
// JOB_OPTIONS and for the same reason -- covers a transient Resend API
// blip without hammering it. A slightly shorter removeOnFail window
// than enrichment's (12h vs 24h): a failed alert email is lower-stakes
// to lose track of than a failed AI enrichment (the ErrorGroup itself
// is never at risk either way -- only whether a notification went
// out), so there's less value in a long audit trail here.
const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 43200 },
};

/**
 * Enqueues a "new error group" alert job. Called from wherever a new
 * ErrorGroup is created (ingestController, projectController's
 * simulateError -- see Task 28.3), gated on that project's
 * alertConfig.newGroup being enabled. Caller is responsible for that
 * gating check; this function itself has no opinion on whether the
 * alert *should* fire, only on queuing it once asked.
 */
async function enqueueNewGroupAlert({ errorGroupId, projectId }) {
  await getQueue().add(
    'new-group',
    { kind: 'newGroup', errorGroupId: String(errorGroupId), projectId: String(projectId) },
    JOB_OPTIONS
  );
}

/**
 * Enqueues a "severity threshold crossed" alert job. Called only from
 * worker.js's processEnrichmentJob, after aiSummary.severity is
 * written -- see that file's Task 28.3 changes -- since that's the
 * only point where both a fresh aiSummary.severity and the project's
 * configured threshold are available together.
 */
async function enqueueSeverityThresholdAlert({ errorGroupId, projectId }) {
  await getQueue().add(
    'severity-threshold',
    { kind: 'severityThreshold', errorGroupId: String(errorGroupId), projectId: String(projectId) },
    JOB_OPTIONS
  );
}

module.exports = { enqueueNewGroupAlert, enqueueSeverityThresholdAlert, QUEUE_NAME };