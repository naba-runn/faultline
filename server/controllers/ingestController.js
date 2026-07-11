const { recordEvent } = require('../services/errorGroupService');
const { enqueueEnrichment } = require('../services/enrichmentQueue');
const { sendSuccess, sendError } = require('../utils/httpResponse');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Field-level payload caps (Task 21). Separate concern from the
// global express.json({ limit: '100kb' }) body cap in app.js — that
// bounds the whole request; these bound the two fields that would
// otherwise persist unbounded into ErrorGroup.stackSample /
// ErrorEvent.rawStack. env/metadata are deliberately left out of this
// task — their lack of validation is an existing, separate decision
// (accept-but-ignore, forward-compatible — see DECISIONS.md), not
// something Task 21 reopens.
const MAX_MESSAGE_LENGTH = 1000;
const MAX_STACK_LENGTH = 10000;

/**
 * Ingestion endpoint. Validates, fingerprints, atomically upserts the
 * owning ErrorGroup (dedup), and records the individual ErrorEvent. On
 * a brand-new group only, AI enrichment is enqueued as a BullMQ job
 * (Task 25) — kicked off after the response is sent, never `await`-ed
 * in the request/response cycle (AI_CONTEXT.md's Dispatch Model, since
 * updated for Task 25's queue). Controller stays thin: parse req, call
 * the service, shape the response — no Mongoose calls happen directly
 * in this file.
 */
const ingestEvent = catchAsync(async (req, res) => {
  const { message, stack, env, metadata } = req.body;

  if (!message || typeof message !== 'string') {
    return sendError(res, 400, 'message is required and must be a string');
  }

  if (!stack || typeof stack !== 'string') {
    return sendError(res, 400, 'stack is required and must be a string');
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return sendError(
      res,
      400,
      `message must not exceed ${MAX_MESSAGE_LENGTH} characters`
    );
  }

  if (stack.length > MAX_STACK_LENGTH) {
    return sendError(
      res,
      400,
      `stack must not exceed ${MAX_STACK_LENGTH} characters`
    );
  }

  // req.project comes from apiKeyMiddleware — the event belongs to
  // whichever project the API key authenticated as.
  let errorGroup, isNewGroup;
  try {
    ({ errorGroup, isNewGroup } = await recordEvent({
      projectId: req.project._id,
      message,
      stack,
      env,
      metadata,
    }));
  } catch (err) {
    // Local catch kept deliberately (not just a bare catchAsync
    // forward): logs with ingest-specific context, then rethrows as a
    // fixed, safe AppError — same message this endpoint has always
    // returned for any persistence failure, regardless of environment
    // or what the underlying driver/Mongo error actually said.
    console.error('[ingest] failed to persist event:', err);
    throw new AppError('Failed to process event', 500);
  }

  console.log(
    `[ingest] ${isNewGroup ? 'new group' : 'duplicate'} for project ${req.project._id}: ${message} (group ${errorGroup._id}, count ${errorGroup.count})`
  );

  // 202 Accepted, not 201 Created — this endpoint's contract has
  // always been "accepted for processing," and now that's literally
  // true: the event was persisted, and for a new group AI enrichment
  // (the other half of "processing") is about to be enqueued below —
  // but not awaited, so it never delays this response.
  sendSuccess(res, 202, {
    received: true,
    projectId: req.project._id,
    errorGroupId: errorGroup._id,
    isNewGroup,
  });

  if (isNewGroup) {
    // Task 25: enqueue, don't call enrichErrorGroup directly. The
    // actual AI call now happens in the separate worker.js process,
    // with BullMQ retry/backoff on transient failures — see
    // enrichmentQueue.js and DECISIONS.md's "Task 25" entry. Enqueuing
    // itself is fast (a single Redis write), so it's still safe to
    // fire without delaying this response, but a queue-enqueue
    // failure (e.g. Redis unreachable) is a distinct, worth-logging
    // failure mode from an AI-enrichment failure — caught here, not
    // inside enqueueEnrichment itself.
    enqueueEnrichment({
      errorGroupId: errorGroup._id,
      projectId: req.project._id,
      message,
      stack,
    }).catch((err) => {
      console.error(`[ingest] failed to enqueue enrichment job for group ${errorGroup._id}:`, err.message);
    });
  }
});

module.exports = { ingestEvent };