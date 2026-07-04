const Project = require('../models/Project');
const { hashApiKey } = require('../utils/apiKey');

/**
 * Verifies an API key (Authorization: Bearer flt_...) sent by client
 * apps against the ingestion endpoint. Deliberately separate from
 * authMiddleware (JWT) — this authenticates a program, not a dashboard
 * user. See DECISIONS.md's "API key hashing" entry for the separate-
 * middleware rationale.
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
    // This lookup IS the security boundary: Mongo's equality match on
    // the indexed apiKeyHash is what actually determines whether the
    // incoming key is valid. (An earlier version of this file also
    // ran crypto.timingSafeEqual against the just-matched document's
    // own apiKeyHash after this query succeeded — that comparison
    // could never be false, since it compared a value against itself,
    // and was removed as dead code. See DECISIONS.md, "apiKeyMiddleware:
    // removal of inert timingSafeEqual check.")
    const project = await Project.findOne({ apiKeyHash: incomingHash });

    if (!project) {
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