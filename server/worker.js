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
const { getRedisConnection } = require('./config/redis');
const { QUEUE_NAME } = require('./services/enrichmentQueue');
const { enrichErrorGroup } = require('./services/errorGroupService');
const ErrorGroup = require('./models/ErrorGroup');
const Project = require('./models/Project');

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
}

async function start() {
  await connectDB();

  const worker = new Worker(QUEUE_NAME, processEnrichmentJob, {
    connection: getRedisConnection(),
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

  console.log(`[worker] Faultline enrichment worker listening on queue "${QUEUE_NAME}" (${config.nodeEnv})`);

  process.on('unhandledRejection', (err) => {
    console.error('[worker] Unhandled Rejection:', err);
    worker.close().finally(() => process.exit(1));
  });

  process.on('uncaughtException', (err) => {
    console.error('[worker] Uncaught Exception:', err);
    worker.close().finally(() => process.exit(1));
  });
}

start();