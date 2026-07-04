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
 * IP — comfortably above the demo app's burst pattern (a handful of
 * requests across 3 routes in a tight loop), while still capping a
 * client sending at a rate no legitimate error-reporting integration
 * would sustain. Abuse protection, not throttling of normal use.
 */
const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please slow down',
  },
});

module.exports = { loginLimiter, ingestLimiter };
