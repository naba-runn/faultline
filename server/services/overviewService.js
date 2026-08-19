const ErrorGroup = require('../models/ErrorGroup');
const ErrorEvent = require('../models/ErrorEvent');
const Project = require('../models/Project');
const trendService = require('./trendService');

// Task 36: how many hourly buckets the dashboard trend chart shows.
// 24 full trailing hours plus the in-progress current hour, same
// baseline window trendService.getWindowBounds already defines for
// per-group spike detection — reused here, not redefined, so the
// dashboard's "last 24h" and a group's spike baseline always agree
// on where an hour starts.
const OVERVIEW_TREND_HOURS = 24;
const OVERVIEW_RECENT_RELEASES_LIMIT = 8;
const OVERVIEW_SPIKING_GROUPS_LIMIT = 5;

/**
 * Cross-project dashboard overview for the logged-in user — Task 36.
 * Aggregates three things across every project the user owns, not
 * scoped to a single project like the rest of this file:
 *
 *  - trend: hourly ErrorEvent counts for the trailing 24h, for a
 *    small chart. Bucketed in JS with trendService.startOfHour, the
 *    same UTC-safe truncation per-group spike detection already uses
 *    — not a second, parallel implementation of "start of hour".
 *  - alerts: how many owned projects have any alert trigger enabled,
 *    plus the groups currently flagged isSpiking (Task 30's
 *    persisted state — this reads it, doesn't recompute a trend for
 *    every group on every dashboard load, which is exactly the
 *    unthrottled-check problem Task 30's DECISIONS.md entry already
 *    rejected once for the alert-firing path itself).
 *  - releases: the most recent distinct error groups that carry a
 *    firstSeenRelease tag (Task 31), across all owned projects.
 *
 * Deliberately a read-only aggregation with no new persisted model —
 * everything here is derived from ErrorGroup/ErrorEvent/Project
 * fields that already exist from Tasks 28/29/30/31.
 */
async function getDashboardOverview(ownerId) {
  const projects = await Project.find({ ownerId }).select('name alertConfig').lean();

  if (projects.length === 0) {
    const { currentHourStart, baselineWindowStart } = trendService.getWindowBounds();
    return {
      lastEventAt: null,
      unresolvedCount: 0,
      trend: { windowHours: OVERVIEW_TREND_HOURS, series: buildEmptySeries(baselineWindowStart, currentHourStart) },
      alerts: { totalProjects: 0, projectsConfigured: 0, spikingCount: 0, spikingGroups: [] },
      releases: { recent: [] },
    };
  }

  const projectIds = projects.map((p) => p._id);
  const projectNameById = new Map(projects.map((p) => [String(p._id), p.name]));

  const { currentHourStart, baselineWindowStart } = trendService.getWindowBounds();

  // Find all error group IDs owned by these projects to query ErrorEvents
  const userGroupDocs = await ErrorGroup.find({ projectId: { $in: projectIds } }).select('_id').lean();
  const groupIds = userGroupDocs.map((g) => g._id);

  const [recentEvents, spikingCount, spikingGroups, recentReleaseGroups, unresolvedCount] = await Promise.all([
    ErrorEvent.find(
      { errorGroupId: { $in: groupIds }, receivedAt: { $gte: baselineWindowStart } },
      { receivedAt: 1 }
    ).lean(),
    ErrorGroup.countDocuments({ projectId: { $in: projectIds }, isSpiking: true, status: 'open' }),
    ErrorGroup.find({ projectId: { $in: projectIds }, isSpiking: true, status: 'open' })
      .sort({ lastSeen: -1 })
      .limit(OVERVIEW_SPIKING_GROUPS_LIMIT)
      .select('projectId message lastSeen count')
      .lean(),
    ErrorGroup.find({ projectId: { $in: projectIds }, firstSeenRelease: { $ne: null } })
      .sort({ lastSeen: -1 })
      .limit(OVERVIEW_RECENT_RELEASES_LIMIT)
      .select('projectId message firstSeen lastSeen firstSeenRelease status count aiSummary.severity')
      .lean(),
    ErrorGroup.countDocuments({ projectId: { $in: projectIds }, status: 'open' }),
  ]);

  let lastEventAt = null;
  const series = buildEmptySeries(baselineWindowStart, currentHourStart);
  const bucketIndexByHour = new Map(series.map((bucket, i) => [bucket.hour.getTime(), i]));
  for (const event of recentEvents) {
    const hourStart = trendService.startOfHour(event.receivedAt).getTime();
    const index = bucketIndexByHour.get(hourStart);
    if (index !== undefined) series[index].count += 1;
    if (!lastEventAt || event.receivedAt > lastEventAt) {
      lastEventAt = event.receivedAt;
    }
  }

  const projectsConfigured = projects.filter((p) => alertingEnabled(p.alertConfig)).length;

  return {
    lastEventAt,
    unresolvedCount,
    trend: { windowHours: OVERVIEW_TREND_HOURS, series },
    alerts: {
      totalProjects: projects.length,
      projectsConfigured,
      spikingCount,
      spikingGroups: spikingGroups.map((g) => ({
        groupId: g._id,
        projectId: g.projectId,
        projectName: projectNameById.get(String(g.projectId)) || 'Unknown project',
        message: g.message,
        lastSeen: g.lastSeen,
        count: g.count,
      })),
    },
    releases: {
      recent: recentReleaseGroups.map((g) => ({
        groupId: g._id,
        projectId: g.projectId,
        projectName: projectNameById.get(String(g.projectId)) || 'Unknown project',
        release: g.firstSeenRelease,
        message: g.message,
        firstSeen: g.firstSeen,
        lastSeen: g.lastSeen,
        status: g.status || 'open',
        count: g.count || 0,
        severity: g.aiSummary?.severity || null,
      })),
    },
  };
}

/**
 * A project counts as "alerts configured" if any of its three
 * independent triggers (Task 28's newGroup/severityThreshold, Task
 * 30's spikeDetection) is switched on — matches the OR the dashboard
 * badge is meant to answer ("is anything watching this project"),
 * not a per-trigger breakdown.
 */
function alertingEnabled(alertConfig) {
  if (!alertConfig) return false;
  return Boolean(
    alertConfig.newGroup ||
    alertConfig.severityThreshold?.enabled ||
    alertConfig.spikeDetection?.enabled
  );
}

/** Builds a zero-filled hourly series from baselineWindowStart through
 * currentHourStart inclusive (25 points: 24 full trailing hours plus
 * the in-progress current hour), for the caller to fill in by
 * counting real events per bucket. Kept separate from the counting
 * loop so the no-projects early return above can share it. */
function buildEmptySeries(baselineWindowStart, currentHourStart) {
  const HOUR_MS = 60 * 60 * 1000;
  const series = [];
  for (let t = baselineWindowStart.getTime(); t <= currentHourStart.getTime(); t += HOUR_MS) {
    series.push({ hour: new Date(t), count: 0 });
  }
  return series;
}


module.exports = { getDashboardOverview };
