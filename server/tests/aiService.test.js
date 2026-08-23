// server/tests/aiService.test.js
//
// Task 41.3 addition only — buildIncidentDiagnosisPrompt and
// validateIncidentHypothesis are pure functions (no network, no
// Gemini client), so they're unit-testable directly. callGemini/
// callGeminiText themselves are NOT unit tested here (same existing
// convention as this file's absence before Task 41 — the real Gemini
// call is exercised via manual testing, e.g. Task 13/14's live
// verification, not mocked network calls in this suite).

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildIncidentDiagnosisPrompt, validateIncidentHypothesis } = require('../services/aiService');

test('buildIncidentDiagnosisPrompt: includes every affected group and their known severity/root cause', () => {
  const prompt = buildIncidentDiagnosisPrompt({
    affectedGroups: [
      { message: 'Payment timeout', severity: 'high', rootCause: 'Gateway connection pool exhausted' },
      { message: 'Null pointer in cart', severity: null, rootCause: null },
    ],
    deployment: null,
  });

  assert.match(prompt, /Payment timeout/);
  assert.match(prompt, /severity: high/);
  assert.match(prompt, /Gateway connection pool exhausted/);
  assert.match(prompt, /Null pointer in cart/);
  // No deployment section when deployment is null.
  assert.doesNotMatch(prompt, /Triggering deployment/);
});

test('buildIncidentDiagnosisPrompt: includes deployment commit metadata when a deployment triggered the incident', () => {
  const prompt = buildIncidentDiagnosisPrompt({
    affectedGroups: [{ message: 'Checkout crash', severity: 'critical', rootCause: null }],
    deployment: { sha: 'abc123def456', ref: 'refs/heads/main', deployedAt: '2026-08-23T08:04:24.366Z' },
  });

  assert.match(prompt, /Triggering deployment/);
  assert.match(prompt, /abc123def456/);
  assert.match(prompt, /refs\/heads\/main/);
});

test('validateIncidentHypothesis: accepts non-empty trimmed text', () => {
  assert.equal(
    validateIncidentHypothesis('  A likely cause is the recent deployment.  '),
    'A likely cause is the recent deployment.'
  );
});

test('validateIncidentHypothesis: rejects empty, whitespace-only, or non-string responses', () => {
  assert.equal(validateIncidentHypothesis(''), null);
  assert.equal(validateIncidentHypothesis('   '), null);
  assert.equal(validateIncidentHypothesis(null), null);
  assert.equal(validateIncidentHypothesis(undefined), null);
  assert.equal(validateIncidentHypothesis({ text: 'not a string' }), null);
});
