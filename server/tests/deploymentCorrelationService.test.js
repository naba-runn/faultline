// server/tests/deploymentCorrelationService.test.js
//
// computeCorrelation is a pure function (no Mongo, no I/O) — same
// reasoning as trendService.test.js: straightforward node:test cases,
// no mocking needed.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeCorrelation,
  DEFAULT_WINDOW_MINUTES,
  DEFAULT_REGRESSION_MULTIPLIER,
  DEFAULT_MIN_COUNT_FLOOR,
} = require('../services/deploymentCorrelationService');

test('computeCorrelation: no events before or after -> zero rates, no regression', () => {
  const result = computeCorrelation({ beforeCount: 0, afterCount: 0 });
  assert.equal(result.beforeRate, 0);
  assert.equal(result.afterRate, 0);
  assert.equal(result.multiplierObserved, 0);
  assert.equal(result.regressionSuspected, false);
});

test('computeCorrelation: after-rate exactly at the multiplier boundary is NOT a regression (strictly greater required)', () => {
  // before=10 over 15min -> rate 0.667/min; after must be > 3x that,
  // not >=, to count. afterCount chosen so afterRate === beforeRate * 3
  // exactly.
  const result = computeCorrelation({
    beforeCount: 10,
    afterCount: 30, // 30/15=2/min === (10/15)*3 exactly
    windowMinutes: 15,
  });
  assert.equal(result.regressionSuspected, false);
});

test('computeCorrelation: after-rate clearing the multiplier AND the count floor -> regression suspected', () => {
  const result = computeCorrelation({
    beforeCount: 10, // 0.667/min
    afterCount: 40, // 2.667/min — 4x before-rate, clears default floor of 5
    windowMinutes: 15,
  });
  assert.equal(result.regressionSuspected, true);
  assert.ok(result.multiplierObserved > DEFAULT_REGRESSION_MULTIPLIER);
});

test('computeCorrelation: zero before-count with low after-count stays under the floor -> not flagged as an infinite-multiplier false positive', () => {
  // beforeRate is 0, so ANY positive afterRate exceeds beforeRate * multiplier
  // (0) — without the floor, afterCount=1 would register as "infinite
  // regression" on pure noise. This is exactly the case
  // DEFAULT_MIN_COUNT_FLOOR exists to guard against (same reasoning as
  // trendService's floor for the current-hour-vs-baseline case).
  const result = computeCorrelation({ beforeCount: 0, afterCount: 1, windowMinutes: 15 });
  assert.equal(result.multiplierObserved, Infinity);
  assert.equal(result.regressionSuspected, false);
});

test('computeCorrelation: zero before-count with after-count clearing the floor IS flagged', () => {
  const result = computeCorrelation({
    beforeCount: 0,
    afterCount: DEFAULT_MIN_COUNT_FLOOR,
    windowMinutes: 15,
  });
  assert.equal(result.regressionSuspected, true);
});

test('computeCorrelation: after-rate below before-rate (traffic dropped) is never a regression', () => {
  const result = computeCorrelation({ beforeCount: 50, afterCount: 5, windowMinutes: 15 });
  assert.equal(result.regressionSuspected, false);
  assert.ok(result.afterRate < result.beforeRate);
});

test('computeCorrelation: defaults match Task 40.3/40.4 spec (15min windows, 3x multiplier)', () => {
  const result = computeCorrelation({ beforeCount: 15, afterCount: 15 * DEFAULT_REGRESSION_MULTIPLIER + 10 });
  assert.equal(result.beforeRate, 15 / DEFAULT_WINDOW_MINUTES);
});

test('computeCorrelation: custom windowMinutes/multiplier/minCountFloor are honored, not silently ignored', () => {
  const result = computeCorrelation({
    beforeCount: 10,
    afterCount: 12,
    windowMinutes: 30,
    multiplier: 1.1,
    minCountFloor: 2,
  });
  assert.equal(result.beforeRate, 10 / 30);
  assert.equal(result.afterRate, 12 / 30);
  // 12/30=0.4 vs (10/30)*1.1=0.3667 -> after exceeds -> and 12 >= floor 2
  assert.equal(result.regressionSuspected, true);
});
