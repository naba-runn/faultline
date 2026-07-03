const crypto = require('crypto');

const KEY_PREFIX = 'flt_';

/**
 * Generates a new raw API key. Pure function: no req/res, no DB, no
 * side effects — the caller is responsible for hashing it (via
 * hashApiKey) before persisting, and for returning the raw value to
 * the user exactly once. Faultline never stores or logs this raw
 * value anywhere.
 */
function generateApiKey() {
  const randomPart = crypto.randomBytes(32).toString('hex');
  return `${KEY_PREFIX}${randomPart}`;
}

/**
 * Hashes a raw API key for storage/comparison. SHA-256, not bcrypt —
 * deliberately different from password hashing. A raw key here is
 * 256 bits of crypto-random entropy, not a low-entropy human-chosen
 * secret, so bcrypt's deliberate slowness buys no real brute-force
 * resistance and would cost ~250-300ms on every ingestion request in
 * Task 6's apiKeyMiddleware, which sits on a hot path. SHA-256 is
 * fast and deterministic, which is exactly what a hot-path lookup
 * needs. See DECISIONS.md.
 */
function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

module.exports = { generateApiKey, hashApiKey, KEY_PREFIX };