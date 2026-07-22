// server/services/trendService.js
//
// Task 29.1 — pure baseline/spike calculation. Deliberately takes only
// plain data (an array of event timestamps) rather than an ErrorEvent
// query itself, so it stays unit-testable in isolation with no Mongo
// connection — the caller (29.2's route/page wiring, or a future
// scheduled job) is responsible for fetching timestamps and passing
// them in. No I/O, no Mongoose, no req/res — matches the layering
// convention services already follow elsewhere (PROJECT_RULES.md §5),
// just one step further removed from persistence than most of them.

const MS_PER_HOUR = 60 * 60 * 1000;
const BASELINE_WINDOW_HOURS = 24;

// Defaults per TASKS.md's Task 29 spec: 3x the trailing-24h average
// hourly rate, and the current hour's absolute count must also clear
// this floor — otherwise a group going from 1 event/hour to 3 would
// register as "a 3x spike" purely on noise.
const DEFAULT_SPIKE_MULTIPLIER = 3;
const DEFAULT_MIN_COUNT_FLOOR = 5;

function startOfHour(date) {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/**
 * Determines whether an error group's current (in-progress) hour is
 * spiking relative to its trailing 24-hour baseline hourly rate.
 *
 * Algorithm (locked in TASKS.md's Task 29 entry):
 * - baseline = count of events in the 24 full hours immediately
 *   preceding the current hour, divided by 24
 * - currentHourCount = count of events from the start of the current
 *   hour up to `now` (the hour is still in progress, so this is a
 *   count, not itself normalized to a rate)
 * - isSpiking = currentHourCount > baseline * spikeMultiplier
 *               AND currentHourCount >= minCountFloor
 * - a group whose earliest known event is younger than the 24h
 *   baseline window has no trustworthy baseline yet — reported as
 *   'insufficient_history', never silently treated as a 0 baseline
 *   (which would make any early activity look like an infinite spike)
 *
 * @param {Array<Date|number|string>} eventTimestamps - every
 *   ErrorEvent.receivedAt (or equivalent) for one error group, any
 *   order, any mix of Date/epoch-ms/ISO-string.
 * @param {object} [options]
 * @param {Date|number} [options.now] - reference "current" time.
 *   Defaults to `Date.now()`. Always pass this explicitly in tests —
 *   that's the whole point of keeping it injectable.
 * @param {number} [options.spikeMultiplier] - default 3
 * @param {number} [options.minCountFloor] - default 5
 * @returns {{
 *   status: 'insufficient_history' | 'ok',
 *   isSpiking: boolean,
 *   currentHourCount: number,
 *   baselineHourlyRate: number|null,
 *   multiplierObserved: number|null,
 *   currentHourStart: Date,
 *   baselineWindowStart: Date,
 * }}
 */
function computeTrend(eventTimestamps, options = {}) {
  const now = options.now !== undefined ? new Date(options.now) : new Date();
  const spikeMultiplier = options.spikeMultiplier ?? DEFAULT_SPIKE_MULTIPLIER;
  const minCountFloor = options.minCountFloor ?? DEFAULT_MIN_COUNT_FLOOR;

  const currentHourStart = startOfHour(now);
  const baselineWindowStart = new Date(
    currentHourStart.getTime() - BASELINE_WINDOW_HOURS * MS_PER_HOUR
  );

  const timestamps = (eventTimestamps || [])
    .map((t) => new Date(t))
    .filter((d) => !Number.isNaN(d.getTime()));

  if (timestamps.length === 0) {
    return {
      status: 'insufficient_history',
      isSpiking: false,
      currentHourCount: 0,
      baselineHourlyRate: null,
      multiplierObserved: null,
      currentHourStart,
      baselineWindowStart,
    };
  }

  const earliestTimestamp = timestamps.reduce(
    (min, t) => (t < min ? t : min),
    timestamps[0]
  );

  const currentHourCount = timestamps.filter(
    (t) => t >= currentHourStart && t <= now
  ).length;

  // Not enough history to trust a 24h baseline yet — report this
  // distinctly rather than computing a baseline over a partial/empty
  // window, which would make a brand-new group's very first events
  // look like an immediate, permanent spike.
  if (earliestTimestamp > baselineWindowStart) {
    return {
      status: 'insufficient_history',
      isSpiking: false,
      currentHourCount,
      baselineHourlyRate: null,
      multiplierObserved: null,
      currentHourStart,
      baselineWindowStart,
    };
  }

  const baselineCount = timestamps.filter(
    (t) => t >= baselineWindowStart && t < currentHourStart
  ).length;
  const baselineHourlyRate = baselineCount / BASELINE_WINDOW_HOURS;

  const multiplierObserved =
    baselineHourlyRate > 0
      ? currentHourCount / baselineHourlyRate
      : currentHourCount > 0
      ? Infinity
      : 0;

  const isSpiking =
    currentHourCount >= minCountFloor &&
    currentHourCount > baselineHourlyRate * spikeMultiplier;

  return {
    status: 'ok',
    isSpiking,
    currentHourCount,
    baselineHourlyRate,
    multiplierObserved,
    currentHourStart,
    baselineWindowStart,
  };
}

module.exports = {
  computeTrend,
  DEFAULT_SPIKE_MULTIPLIER,
  DEFAULT_MIN_COUNT_FLOOR,
};