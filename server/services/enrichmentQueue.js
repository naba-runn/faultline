// server/services/enrichmentQueue.js
//
// Task 25: the producer side of the AI enrichment job queue. Runs
// inside the API process (called from ingestController and
// projectController's simulateError) — the consumer side lives in the
// separate worker.js process. See DECISIONS.md's "Task 25" entry for
// why these are two processes, not a worker folded into the API one.
//
// Job payload is deliberately just three serializable primitives
// (errorGroupId, projectId, message, stack) — never a Mongoose
// document. BullMQ persists job data as JSON in Redis; a Mongoose doc
// would either fail to serialize cleanly or silently lose its methods
// on the far side. The worker re-fetches ErrorGroup/Project fresh by
// ID instead of trusting a serialized snapshot, which also sidesteps
// staleness if something changed between enqueue and processing.

const { Queue } = require('bullmq');
const { getBullConnection } = require('../config/redis');

const QUEUE_NAME = 'enrichment';

let queue = null;
function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getBullConnection() });
  }
  return queue;
}

// Retry/backoff policy (Task 25.4): 3 attempts total, exponential
// backoff starting at 5s (5s, 10s, 20s between attempts). This covers
// transient failures — a Gemini API blip, a momentary Mongo hiccup —
// without hammering either service. See errorGroupService.js's
// enrichErrorGroup for which failures are actually retryable (a
// Gemini response that fails our own validation is NOT retried here —
// that's a terminal outcome decided inside the job itself, not a
// queue-level retry).
const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  // Once a job succeeds or exhausts its retries, don't keep it around
  // indefinitely — this is a resume-scale queue, not one that needs a
  // long audit trail. Keeps Render's free Key Value tier's storage
  // from filling with completed job records over time.
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
};

/**
 * Enqueues an AI enrichment job for a newly created ErrorGroup.
 * Replaces the old direct, fire-and-forget call to
 * errorGroupService.enrichErrorGroup() from ingestController and
 * projectController.simulateError — see DECISIONS.md's "Task 25" entry.
 *
 * This function itself is fast (a single Redis write) and is safe to
 * await without meaningfully delaying a response — unlike the old
 * direct call, awaiting this does NOT wait for the AI call itself,
 * only for the job to be durably queued.
 */
async function enqueueEnrichment({ errorGroupId, projectId, message, stack }) {
  await getQueue().add(
    'enrich',
    { errorGroupId: String(errorGroupId), projectId: String(projectId), message, stack },
    JOB_OPTIONS
  );
}

module.exports = { enqueueEnrichment, QUEUE_NAME };