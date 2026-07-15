const rateLimit = require('express-rate-limit');

/**
 * Strict limiter for POST /api/auth/login. 5 attempts / 15 minutes
 * per IP — generous enough that a human mistyping their password a
 * few times in a row is never incorrectly blocked, strict enough that
 * online brute-forcing a single account becomes impractical. See
 * DECISIONS.md, "Rate limiting: login and ingestion" for the full
 * reasoning.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts, please try again later',
  },
});

/**
 * Generous limiter for POST /api/events. 100 requests / minute per
 * PROJECT (API key), not per IP. See DECISIONS.md, "Rate limiting:
 * login and ingestion" for the original reasoning on the 100/min
 * figure, and "Task 27: per-API-key ingestion rate limiting" for why
 * the key changed from IP to project.
 *
 * keyGenerator reads req.project, which apiKeyMiddleware guarantees is
 * set before calling next() on any request that reaches this limiter
 * (see routes/ingestRoutes.js -- apiKeyMiddleware runs first). The
 * req.ip fallback is defensive only, for if that ordering ever
 * changes; it should never actually trigger in normal operation.
 */
const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.project ? String(req.project._id) : req.ip),
  message: {
    success: false,
    error: 'Too many requests, please slow down',
  },
});

module.exports = { loginLimiter, ingestLimiter };