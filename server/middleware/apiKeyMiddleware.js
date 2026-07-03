const crypto = require('crypto');
const Project = require('../models/Project');
const { hashApiKey } = require('../utils/apiKey');

/**
 * Verifies an API key (Authorization: Bearer flt_...) sent by client
 * apps against the ingestion endpoint. Deliberately separate from
 * authMiddleware (JWT) — this authenticates a program, not a dashboard
 * user. See PROJECT_CONTEXT.md's "Key Architectural Decisions" #5.
 *
 * On success, attaches req.project (the matched Project doc).
 * Rejects with 401 for any failure mode — missing header, malformed
 * key, or no matching hash — without distinguishing which, same
 * enumeration-avoidance reasoning used throughout auth/projects.
 */
async function apiKeyMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized, no API key provided',
    });
  }

  const rawKey = authHeader.split(' ')[1];

  if (!rawKey || !rawKey.startsWith('flt_')) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized, invalid API key',
    });
  }

  try {
    const incomingHash = hashApiKey(rawKey);

    // Look up by hash directly rather than fetching all projects and
    // comparing in a loop — this is the hot path (every ingestion
    // request), so it needs to be a single indexed query, not O(n).
    const project = await Project.findOne({ apiKeyHash: incomingHash });

    if (!project) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized, invalid API key',
      });
    }

    // Defense in depth: even though the lookup above already matched
    // on the hash, do an explicit timing-safe comparison rather than
    // trusting the DB query result alone. timingSafeEqual requires
    // equal-length buffers — both sides here are fixed 64-char hex
    // SHA-256 digests, so lengths always match and this can't throw.
    const match = crypto.timingSafeEqual(
      Buffer.from(incomingHash, 'utf8'),
      Buffer.from(project.apiKeyHash, 'utf8')
    );

    if (!match) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized, invalid API key',
      });
    }

    req.project = project;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized, invalid API key',
    });
  }
}

module.exports = apiKeyMiddleware;