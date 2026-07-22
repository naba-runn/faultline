// server/tests/trendService.test.js
//
// trendService.computeTrend is a pure function (no Mongo, no I/O), so
// unlike errorGroupService.test.js there's no mocking needed here —
// straightforward node:test cases with a fixed injected `now`.

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeTrend } = require('../services/trendService');

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

// Fixed reference "now": deliberately mid-hour (12:30), not on the
// hour boundary — the "current hour" bucket is [12:00, 13:00) and
// NOW sits inside it, same as any real in-progress hour would.
const NOW = new Date('2025-01-02T12:30:00.000Z').getTime();
const CURRENT_HOUR_START = new Date('2025-01-02T12:00:00.000Z').getTime();

// Baseline-window fixtures: `n` hours before the *current hour's
// start* (not before NOW) — this is what actually determines whether
// a timestamp lands inside/outside the 24h baseline window or counts
// as "old enough" history, so anchoring to NOW's mid-hour offset would
// make the boundary math depend on NOW's minute, which is incidental.
function beforeCurrentHour(n) {
  return new Date(CURRENT_HOUR_START - n * HOUR);
}

// Current-hour fixtures: `m` minutes before NOW, landing inside the
// in-progress [12:00, 12:30] range actually being measured.
function minutesIntoCurrentHour(m) {
  return new Date(NOW - m * MINUTE);
}

test('computeTrend: no events at all -> insufficient_history, not a false spike', () => {
  const result = computeTrend([], { now: NOW });
  assert.equal(result.status, 'insufficient_history');
  assert.equal(result.isSpiking, false);
  assert.equal(result.currentHourCount, 0);
  assert.equal(result.baselineHourlyRate, null);
});

test('computeTrend: group younger than 24h -> insufficient_history even with heavy current-hour activity', () => {
  // Group's very first event was only 2 hours ago. Six events land in
  // the current hour — that's well past the default floor (5), but
  // with no trustworthy 24h baseline this must not be reported as a
  // spike.
  const timestamps = [
    beforeCurrentHour(2), // earliest event, defines the group's age
    ...Array.from({ length: 6 }, (_, i) => minutesIntoCurrentHour(i + 1)),
  ];

  const result = computeTrend(timestamps, { now: NOW });
  assert.equal(result.status, 'insufficient_history');
  assert.equal(result.isSpiking, false);
  assert.equal(result.baselineHourlyRate, null);
});

test('computeTrend: steady low-rate group, no spike', () => {
  // Exactly 1 event/hour for the full trailing 24h window, plus 1 in
  // the current (in-progress) hour — a flat rate, not a spike.
  const timestamps = [];
  for (let h = 24; h >= 1; h -= 1) {
    timestamps.push(beforeCurrentHour(h));
  }
  timestamps.push(minutesIntoCurrentHour(6)); // one event so far this hour

  const result = computeTrend(timestamps, { now: NOW });
  assert.equal(result.status, 'ok');
  assert.equal(result.baselineHourlyRate, 1); // 24 events / 24 hours
  assert.equal(result.currentHourCount, 1);
  assert.equal(result.isSpiking, false);
});

test('computeTrend: noise case — 1/hr baseline jumping to 3 in the current hour does NOT spike (floor blocks it)', () => {
  // This is the exact scenario called out in TASKS.md's Task 29 spec:
  // baseline 1/hr, current hour count 3 (a real 3x multiplier), but
  // 3 is under the default minCountFloor of 5, so it must not flag.
  const timestamps = [];
  for (let h = 24; h >= 1; h -= 1) {
    timestamps.push(beforeCurrentHour(h));
  }
  timestamps.push(
    minutesIntoCurrentHour(18),
    minutesIntoCurrentHour(12),
    minutesIntoCurrentHour(6)
  );

  const result = computeTrend(timestamps, { now: NOW });
  assert.equal(result.status, 'ok');
  assert.equal(result.baselineHourlyRate, 1);
  assert.equal(result.currentHourCount, 3);
  assert.equal(result.multiplierObserved, 3);
  assert.equal(result.isSpiking, false);
});

test('computeTrend: real spike — baseline 1/hr, current hour count 6 (>3x AND clears the floor)', () => {
  const timestamps = [];
  for (let h = 24; h >= 1; h -= 1) {
    timestamps.push(beforeCurrentHour(h));
  }
  for (let i = 0; i < 6; i += 1) {
    timestamps.push(minutesIntoCurrentHour(i + 1));
  }

  const result = computeTrend(timestamps, { now: NOW });
  assert.equal(result.status, 'ok');
  assert.equal(result.baselineHourlyRate, 1);
  assert.equal(result.currentHourCount, 6);
  assert.equal(result.isSpiking, true);
});

test('computeTrend: zero baseline — a group with no events in the trailing 24h but a burst now spikes once it clears the floor', () => {
  // 24h+ of history exists (so it's not "insufficient_history"), but
  // the baseline window itself is empty — baseline is legitimately 0.
  const timestamps = [
    beforeCurrentHour(30), // establishes >24h of age, but sits before the baseline window
  ];
  for (let i = 0; i < 5; i += 1) {
    timestamps.push(minutesIntoCurrentHour(i + 1)); // 5 events this hour == the floor
  }

  const result = computeTrend(timestamps, { now: NOW });
  assert.equal(result.status, 'ok');
  assert.equal(result.baselineHourlyRate, 0);
  assert.equal(result.currentHourCount, 5);
  assert.equal(result.multiplierObserved, Infinity);
  assert.equal(result.isSpiking, true); // 5 >= floor AND 5 > 0 * multiplier
});

test('computeTrend: zero baseline but below the floor does not spike', () => {
  const timestamps = [
    beforeCurrentHour(30),
    minutesIntoCurrentHour(6),
    minutesIntoCurrentHour(12),
  ]; // only 2 this hour
  const result = computeTrend(timestamps, { now: NOW });
  assert.equal(result.baselineHourlyRate, 0);
  assert.equal(result.currentHourCount, 2);
  assert.equal(result.isSpiking, false); // below default floor of 5
});

test('computeTrend: custom multiplier/floor options override the defaults', () => {
  const timestamps = [];
  for (let h = 24; h >= 1; h -= 1) {
    timestamps.push(beforeCurrentHour(h)); // baseline stays 1/hr
  }
  timestamps.push(minutesIntoCurrentHour(18), minutesIntoCurrentHour(12)); // 2 events this hour

  // With a lowered floor of 2 and multiplier of 1.5x, 2 events against
  // a 1/hr baseline (1.5x threshold = 1.5) now qualifies.
  const result = computeTrend(timestamps, {
    now: NOW,
    spikeMultiplier: 1.5,
    minCountFloor: 2,
  });
  assert.equal(result.currentHourCount, 2);
  assert.equal(result.isSpiking, true);
});

test('computeTrend: accepts ISO strings and epoch-ms, not just Date objects', () => {
  const timestamps = [
    beforeCurrentHour(25).toISOString(),
    beforeCurrentHour(2).getTime(),
    minutesIntoCurrentHour(6),
  ];
  const result = computeTrend(timestamps, { now: NOW });
  assert.equal(result.status, 'ok');
});