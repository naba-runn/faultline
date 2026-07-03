const { recordEvent } = require('../services/errorGroupService');

/**
 * Ingestion endpoint — Task 9.3 wires real persistence in. Validates,
 * fingerprints, atomically upserts the owning ErrorGroup (dedup), and
 * records the individual ErrorEvent. AI enrichment is NOT triggered
 * here — that's Task 13's fire-and-forget dispatch, which will read
 * `isNewGroup` (already computed by errorGroupService) once aiService
 * exists. Controller stays thin: parse req, call the service, shape
 * the response — no Mongoose calls happen directly in this file.
 */
async function ingestEvent(req, res) {
  const { message, stack, env, metadata } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'message is required and must be a string',
    });
  }

  if (!stack || typeof stack !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'stack is required and must be a string',
    });
  }

  // req.project comes from apiKeyMiddleware — the event belongs to
  // whichever project the API key authenticated as.
  try {
    const { errorGroup, isNewGroup } = await recordEvent({
      projectId: req.project._id,
      message,
      stack,
      env,
      metadata,
    });

    console.log(
      `[ingest] ${isNewGroup ? 'new group' : 'duplicate'} for project ${req.project._id}: ${message} (group ${errorGroup._id}, count ${errorGroup.count})`
    );

    // 202 Accepted, not 201 Created — this endpoint's contract has
    // always been "accepted for processing," and now that's literally
    // true: the event was persisted, but AI enrichment (the other half
    // of "processing") hasn't run yet and won't for existing groups.
    res.status(202).json({
      success: true,
      data: {
        received: true,
        projectId: req.project._id,
        errorGroupId: errorGroup._id,
        isNewGroup,
      },
    });
  } catch (err) {
    // Plain try/catch, matching PROJECT_RULES.md §18 — AppError/
    // catchAsync is Task 20, not retrofitted early.
    console.error('[ingest] failed to persist event:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to process event',
    });
  }
}

module.exports = { ingestEvent };