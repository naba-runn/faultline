// server/services/deploymentCorrelationService.js
//
// Task 40.3/40.4 — pure before/after regression calculation. Same
// layering choice as trendService.js: takes plain counts, no Mongo,
// no I/O, so it's unit-testable in isolation. The caller
// (deploymentService.correlateDeployment) is responsible for querying
// ErrorEvent counts in the before/after windows and persisting the
// result — this file has no opinion on how those counts were obtained.

// Task 40.4 spec: "regressionSuspected when after-rate exceeds
// before-rate by a configurable multiplier (default 3x, matches Task
// 29's spike multiplier)."
const DEFAULT_WINDOW_MINUTES = 15;
const DEFAULT_REGRESSION_MULTIPLIER = 3;

// Not in Task 40.4's literal text, but added for the same reason
// trendService.DEFAULT_MIN_COUNT_FLOOR exists (see that file's
// comment): without an absolute floor, a project going from 0 events
// before a deploy to 1 event after would register as an infinite-
// multiplier "regression" on pure noise, since any positive afterRate
// exceeds a zero beforeRate by any multiplier. Reusing the exact same
// floor value as Task 29's spike detection, not a new number invented
// for this task — see DECISIONS.md, "Task 40: regression floor."
const DEFAULT_MIN_COUNT_FLOOR = 5;

/**
 * Computes whether a deployment's after-window error rate represents
 * a suspected regression relative to its before-window rate.
 *
 * @param {object} params
 * @param {number} params.beforeCount - ErrorEvent count in the window
 *   immediately preceding the deployment.
 * @param {number} params.afterCount - ErrorEvent count in the window
 *   immediately following the deployment.
 * @param {number} [params.windowMinutes] - length of both windows, in
 *   minutes. Default 15 (Task 40.3's spec). Both windows are always
 *   the same length — an asymmetric before/after comparison would
 *   make the rate comparison meaningless.
 * @param {number} [params.multiplier] - default 3, same as Task 29.
 * @param {number} [params.minCountFloor] - default 5, same as Task 29
 *   — see the comment above DEFAULT_MIN_COUNT_FLOOR for why this
 *   exists despite not being in Task 40.4's literal text.
 * @returns {{
 *   beforeRate: number,
 *   afterRate: number,
 *   multiplierObserved: number,
 *   regressionSuspected: boolean,
 * }}
 */
function computeCorrelation({
  beforeCount,
  afterCount,
  windowMinutes = DEFAULT_WINDOW_MINUTES,
  multiplier = DEFAULT_REGRESSION_MULTIPLIER,
  minCountFloor = DEFAULT_MIN_COUNT_FLOOR,
}) {
  const beforeRate = beforeCount / windowMinutes;
  const afterRate = afterCount / windowMinutes;

  // Same shape as trendService.computeTrend's multiplierObserved:
  // Infinity when there's truly nothing to divide by but real
  // after-activity exists, 0 when both are zero (no change, not an
  // undefined one).
  const multiplierObserved =
    beforeRate > 0 ? afterRate / beforeRate : afterCount > 0 ? Infinity : 0;

  const regressionSuspected =
    afterCount >= minCountFloor && afterRate > beforeRate * multiplier;

  return { beforeRate, afterRate, multiplierObserved, regressionSuspected };
}

module.exports = {
  computeCorrelation,
  DEFAULT_WINDOW_MINUTES,
  DEFAULT_REGRESSION_MULTIPLIER,
  DEFAULT_MIN_COUNT_FLOOR,
};
