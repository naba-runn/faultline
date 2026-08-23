// server/services/deploymentCorrelationQueue.js
//
// Task 40.3/40.4: the producer side of the deployment-correlation job
// queue — same Queue/Worker split as enrichmentQueue.js/alertQueue.js
// (Task 25/28.2), for the same fundamental reason (don't do slow or
// timing-dependent work in a request/webhook handler). This one has
// an extra wrinkle those don't: the "after" error-rate window can't
// be measured until it has actually elapsed, so this job is enqueued
// with a BullMQ `delay` — the correlation genuinely cannot run any
// earlier, not just "shouldn't block the response."
//
// Job payload is deliberately just the Deployment's own _id, same
// re-fetch-don't-trust-a-snapshot principle as the other two queues —
// see enrichmentQueue.js's doc comment for the full reasoning.

const { Queue } = require('bullmq');
const { getBullConnection } = require('../config/redis');
const { DEFAULT_WINDOW_MINUTES } = require('./deploymentCorrelationService');

const QUEUE_NAME = 'deployment-correlation';

let queue = null;
function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getBullConnection() });
  }
  return queue;
}

// Same retry/backoff shape as enrichmentQueue.js/alertQueue.js — a
// transient Mongo hiccup on the correlation read/write shouldn't
// silently leave a Deployment stuck at correlation.status: 'pending'
// forever.
const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
};

/**
 * Enqueues a delayed correlation job for a Deployment. `delay` is
 * computed relative to `deployedAt`, not to "now" — deploymentAt plus
 * the after-window length is the earliest moment the after-count is
 * actually complete. Clamped to >= 0: a `deployedAt` that's already
 * older than the window (e.g. a manually-backdated test deployment,
 * see Task 40.6) enqueues for immediate processing rather than a
 * negative delay, which BullMQ would otherwise just treat as 0 anyway
 * — clamping here makes that explicit rather than relying on BullMQ's
 * own handling of a negative number.
 */
async function enqueueDeploymentCorrelation({ deploymentId, deployedAt, windowMinutes = DEFAULT_WINDOW_MINUTES }) {
  const readyAt = new Date(deployedAt).getTime() + windowMinutes * 60 * 1000;
  const delay = Math.max(0, readyAt - Date.now());

  await getQueue().add(
    'correlate',
    { deploymentId: String(deploymentId) },
    { ...JOB_OPTIONS, delay }
  );
}

module.exports = { enqueueDeploymentCorrelation, QUEUE_NAME };
