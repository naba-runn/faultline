// server/services/incidentDiagnosisQueue.js
//
// Task 41.3: the producer side of the incident AI-diagnosis job queue
// — same Queue/Worker split as enrichmentQueue.js/alertQueue.js/
// deploymentCorrelationQueue.js (Tasks 25/28/40), for the same
// fundamental reason: no synchronous Gemini calls in the trigger path
// (ingestController's spike check, or worker.js's deployment-
// correlation job). Unlike deploymentCorrelationQueue.js, there's no
// hard timing constraint here — this is a plain enqueue-immediately
// job, not a delayed one.
//
// Job payload is deliberately just the Incident's own _id, same
// re-fetch-don't-trust-a-snapshot principle as every other queue in
// this codebase.

const { Queue } = require('bullmq');
const { getBullConnection } = require('../config/redis');

const QUEUE_NAME = 'incident-diagnosis';

let queue = null;
function getQueue() {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: getBullConnection() });
  }
  return queue;
}

// Same retry/backoff shape as the other three queues.
const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
};

async function enqueueIncidentDiagnosis({ incidentId }) {
  await getQueue().add('diagnose', { incidentId: String(incidentId) }, JOB_OPTIONS);
}

module.exports = { enqueueIncidentDiagnosis, QUEUE_NAME };
