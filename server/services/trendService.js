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
  // UTC, not local — ErrorEvent.receivedAt is an absolute UTC instant,
  // and this function must return the same hour boundary regardless
  // of which timezone the Node process happens to be running in.
  // setMinutes() (no UTC prefix) truncates using the host machine's
  // local timezone instead, which for any offset that isn't a whole
  // number of hours from UTC (e.g. IST, UTC+5:30) silently shifts
  // every hour boundary by the fractional part — a real bug, not a
  // test-only issue: two servers/dev machines in different timezones
  // would disagree on where "the current hour" starts for the exact
  // same timestamp.
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/**
 * Returns the current-hour and baseline-window boundaries for a given
 * `now`. Exported so callers building the actual Mongo query (29.2)
 * can fetch only the bounded ~25h window this function needs, rather
 * than a group's entire lifetime of events, without duplicating the
 * hour-math here and in the query-building code.
 *
 * @param {Date|number} [now] - defaults to `Date.now()`
 * @returns {{ currentHourStart: Date, baselineWindowStart: Date }}
 */
function getWindowBounds(now) {
  const currentHourStart = startOfHour(now !== undefined ? new Date(now) : new Date());
  const baselineWindowStart = new Date(
    currentHourStart.getTime() - BASELINE_WINDOW_HOURS * MS_PER_HOUR
  );
  return { currentHourStart, baselineWindowStart };
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
 * @param {Array<Date|number|string>} eventTimestamps - ErrorEvent
 *   timestamps for one error group, any order, any mix of
 *   Date/epoch-ms/ISO-string. **Does not need to cover the group's
 *   entire lifetime** — 29.2's caller only fetches the ~25h window
 *   `getWindowBounds` reports as relevant, for query efficiency on
 *   high-volume groups. Pass `options.earliestKnownTimestamp` (e.g.
 *   `ErrorGroup.firstSeen`, already stored, no extra query) so the
 *   insufficient-history check isn't blind to history outside this
 *   array — without it, a windowed query would make every group look
 *   perpetually under-24h-old, since it would never see anything
 *   older than the window start.
 * @param {object} [options]
 * @param {Date|number} [options.now] - reference "current" time.
 *   Defaults to `Date.now()`. Always pass this explicitly in tests —
 *   that's the whole point of keeping it injectable.
 * @param {Date|number|string} [options.earliestKnownTimestamp] - the
 *   group's true earliest event (e.g. `ErrorGroup.firstSeen`), used
 *   for the insufficient-history check instead of the minimum of
 *   `eventTimestamps`. Falls back to deriving from `eventTimestamps`
 *   itself when omitted (the original 29.1 behavior, still exercised
 *   by 29.1's own unit tests, which pass a full-lifetime array with
 *   no separate "true earliest" available).
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

  const { currentHourStart, baselineWindowStart } = getWindowBounds(now);

  const timestamps = (eventTimestamps || [])
    .map((t) => new Date(t))
    .filter((d) => !Number.isNaN(d.getTime()));

  const earliestKnownTimestamp =
    options.earliestKnownTimestamp !== undefined
      ? new Date(options.earliestKnownTimestamp)
      : null;
  const hasValidEarliestOverride =
    earliestKnownTimestamp !== null && !Number.isNaN(earliestKnownTimestamp.getTime());

  if (timestamps.length === 0 && !hasValidEarliestOverride) {
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

  // Prefer the caller-supplied true earliest event (e.g.
  // ErrorGroup.firstSeen) over deriving one from eventTimestamps —
  // the array may only cover a bounded recent window (29.2's query),
  // which on its own can never prove a group is *older* than that
  // window, only that it isn't younger.
  const earliestTimestamp = hasValidEarliestOverride
    ? earliestKnownTimestamp
    : timestamps.reduce((min, t) => (t < min ? t : min), timestamps[0]);

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
  getWindowBounds,
  // Task 36: exported for the dashboard overview's hourly trend
  // bucketing (errorGroupService.getDashboardOverview). Reuses this
  // exact UTC-truncation logic rather than re-deriving hour
  // boundaries a second time elsewhere — see the setUTCMinutes
  // comment above for why a second, subtly different implementation
  // of "start of hour" would be a real correctness risk, not just
  // duplication.
  startOfHour,
  DEFAULT_SPIKE_MULTIPLIER,
  DEFAULT_MIN_COUNT_FLOOR,
};