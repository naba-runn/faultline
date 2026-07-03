// server/services/fingerprintService.js

const crypto = require('crypto');
const { normalizeStack } = require('../utils/stackNormalizer');

// Matches a leading "SomeError:" or "SomeError " token that follows
// the conventional JS error-name pattern (ends in "Error"). Deliberately
// narrower than "any word before a colon" — a message like
// "Failed: could not connect" would otherwise be misread as an error
// type named "Failed", which isn't a real error class and would create
// a bogus, overly-specific fingerprint bucket.
const ERROR_TYPE_PATTERN = /^([A-Za-z_$][A-Za-z0-9_$]*Error)\b/;

// Used when no recognizable error-type prefix is found (e.g. a plain
// string was thrown, or a custom error class doesn't follow the
// "...Error" naming convention). Bucketing these together under one
// generic type is a deliberate simplification — see DECISIONS.md.
const UNKNOWN_ERROR_TYPE = 'Error';

/**
 * Extracts the error type/class name from an error message, if the
 * message follows the conventional "TypeName: rest of message" shape
 * Node/V8 errors use (e.g. "TypeError: Cannot read properties of
 * undefined"). Pure string parsing — never throws.
 *
 * @param {string} message
 * @returns {string}
 */
function extractErrorType(message) {
  if (!message || typeof message !== 'string') return UNKNOWN_ERROR_TYPE;

  const match = message.match(ERROR_TYPE_PATTERN);
  return match ? match[1] : UNKNOWN_ERROR_TYPE;
}

/**
 * Produces a stable fingerprint for an incoming error event, combining
 * the extracted error type with stackNormalizer's normalized stack
 * signature before hashing. This is the value Task 9's ErrorGroup
 * upsert will key on (alongside projectId) to decide "is this the same
 * bug we've already seen, or a new one."
 *
 * If the normalized stack signature is empty (e.g. an unparseable or
 * missing stack), falls back to hashing the type + raw message instead
 * of type-only — otherwise every stackless error in a project would
 * collapse into a single fingerprint regardless of how different the
 * underlying bugs actually are. This mirrors stackNormalizer's own
 * "fall back rather than lose fidelity" pattern from 8.1.
 *
 * @param {{ message: string, stack: string }} event
 * @returns {string} a SHA-256 hex digest
 */
function generateFingerprint({ message, stack }) {
  const errorType = extractErrorType(message);
  const { signature } = normalizeStack(stack);

  const basis = signature
    ? `${errorType}::${signature}`
    : `${errorType}::${message || ''}`;

  return crypto.createHash('sha256').update(basis).digest('hex');
}

module.exports = { generateFingerprint, extractErrorType };