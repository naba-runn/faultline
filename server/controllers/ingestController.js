const { recordEvent, enrichErrorGroup } = require('../services/errorGroupService');
const { sendSuccess, sendError } = require('../utils/httpResponse');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

/**
 * Ingestion endpoint. Validates, fingerprints, atomically upserts the
 * owning ErrorGroup (dedup), and records the individual ErrorEvent. On
 * a brand-new group only, AI enrichment is dispatched fire-and-forget
 * — kicked off after the response is sent, never `await`-ed in the
 * request/response cycle (AI_CONTEXT.md's Dispatch Model). Controller
 * stays thin: parse req, call the service, shape the response — no
 * Mongoose calls happen directly in this file.
 */
const ingestEvent = catchAsync(async (req, res) => {
  const { message, stack, env, metadata } = req.body;

  if (!message || typeof message !== 'string') {
    return sendError(res, 400, 'message is required and must be a string');
  }

  if (!stack || typeof stack !== 'string') {
    return sendError(res, 400, 'stack is required and must be a string');
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
  // (the other half of "processing") is about to be dispatched below
  // — but not awaited, so it never delays this response.
  sendSuccess(res, 202, {
    received: true,
    projectId: req.project._id,
    errorGroupId: errorGroup._id,
    isNewGroup,
  });

  if (isNewGroup) {
    // Fire-and-forget: intentionally not awaited. enrichErrorGroup
    // catches all of its own failures internally, so there's nothing
    // to .catch() here — see errorGroupService.js.
    enrichErrorGroup({ errorGroup, project: req.project, message, stack });
  }
});

module.exports = { ingestEvent };