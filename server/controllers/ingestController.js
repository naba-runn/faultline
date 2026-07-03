/**
 * Ingestion skeleton — Task 7. Validates and acknowledges an incoming
 * error event. Deliberately does NOT persist, fingerprint, or dedup
 * yet: ErrorGroup/ErrorEvent models don't exist until Task 9, and
 * fingerprintService doesn't exist until Task 8. This is scaffolding
 * those tasks build on, not a shortcut around them.
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
  console.log(
    `[ingest] received event for project ${req.project._id} (${req.project.name}): ${message}`
  );

  // 202 Accepted, not 201 Created — nothing was actually created yet
  // (no ErrorGroup/ErrorEvent model to create it in), and this
  // reflects that honestly rather than implying persistence that
  // doesn't exist yet.
  res.status(202).json({
    success: true,
    data: {
      received: true,
      projectId: req.project._id,
    },
  });
}

module.exports = { ingestEvent };