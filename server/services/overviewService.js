const ErrorGroup = require('../models/ErrorGroup');
const ErrorEvent = require('../models/ErrorEvent');
const Project = require('../models/Project');
const Deployment = require('../models/Deployment');
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
// Task 40.5: dashboard deployment timeline strip — a fixed recent-N
// cap, not real pagination (GET /:id/deployments' cursor pagination
// covers full history; this is just the summary strip), same
// "trimmed shape for a widget, full detail lives behind its own
// endpoint" split as releases.recent above.
const OVERVIEW_RECENT_DEPLOYMENTS_LIMIT = 8;

/**
 * Cross-project dashboard overview for the logged-in user — Task 36.
 * Aggregates three things across every project the user owns, not
 * scoped to a single project like the rest of this file:
 *
 *  - trend: hourly ErrorEvent counts for the trailing 24h, for a
 *    small chart. Bucketed server-side via a $dateTrunc aggregation
 *    (timezone: 'UTC'), matching trendService.startOfHour's same
 *    UTC-safe truncation per-group spike detection uses — not a
 *    second, parallel implementation of "start of hour", just done
 *    in the DB instead of by pulling every matching event into Node.
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
      deployments: { recent: [] },
    };
  }

  const projectIds = projects.map((p) => p._id);
  const projectNameById = new Map(projects.map((p) => [String(p._id), p.name]));

  const { currentHourStart, baselineWindowStart } = trendService.getWindowBounds();

  // Find all error group IDs owned by these projects to query ErrorEvents
  const userGroupDocs = await ErrorGroup.find({ projectId: { $in: projectIds } }).select('_id').lean();
  const groupIds = userGroupDocs.map((g) => g._id);

  // Hourly bucketing done in the aggregation pipeline, not by pulling
  // every matching ErrorEvent doc into Node and looping over it. The
  // old approach (ErrorEvent.find(...).lean() over the full 25h
  // window, no limit) returned a result set that scaled with total
  // event *volume* across every owned project — for a busy account
  // that's tens or hundreds of thousands of docs deserialized into
  // memory on every dashboard load, just to produce 25 hourly counts.
  // $group/$dateTrunc does the counting server-side and returns at
  // most 25 rows regardless of volume. $dateTrunc with timezone:
  // 'UTC' matches trendService.startOfHour's setUTCMinutes(0,0,0)
  // truncation exactly — same hour-boundary semantics, not a second,
  // subtly different implementation of "start of hour". Requires
  // MongoDB 5.0+ ($dateTrunc); this app already targets Mongo 7 (see
  // docker-compose.yml).
  const [eventAgg, spikingCount, spikingGroups, recentReleaseGroups, unresolvedCount, recentDeployments] = await Promise.all([
    ErrorEvent.aggregate([
      { $match: { errorGroupId: { $in: groupIds }, receivedAt: { $gte: baselineWindowStart } } },
      {
        $facet: {
          hourly: [
            {
              $group: {
                _id: { $dateTrunc: { date: '$receivedAt', unit: 'hour', timezone: 'UTC' } },
                count: { $sum: 1 },
              },
            },
          ],
          lastEvent: [{ $group: { _id: null, lastEventAt: { $max: '$receivedAt' } } }],
        },
      },
    ]),
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
    // Task 40.5: most recent deployments across all owned projects,
    // for the dashboard's timeline strip. correlation.status may
    // still be 'pending' for a deployment whose after-window hasn't
    // elapsed yet — the client shows that as-is rather than the
    // overview waiting on it.
    Deployment.find({ projectId: { $in: projectIds } })
      .sort({ deployedAt: -1 })
      .limit(OVERVIEW_RECENT_DEPLOYMENTS_LIMIT)
      .select('projectId sha ref deployedAt source correlation')
      .lean(),
  ]);

  const series = buildEmptySeries(baselineWindowStart, currentHourStart);
  const bucketIndexByHour = new Map(series.map((bucket, i) => [bucket.hour.getTime(), i]));

  const hourlyBuckets = eventAgg[0]?.hourly || [];
  for (const bucket of hourlyBuckets) {
    // bucket._id comes back as a real Date from $dateTrunc — same
    // hour-boundary Date the JS-side series was built from, so no
    // re-truncation needed here, just a lookup.
    const index = bucketIndexByHour.get(new Date(bucket._id).getTime());
    if (index !== undefined) series[index].count += bucket.count;
  }
  const lastEventAt = eventAgg[0]?.lastEvent?.[0]?.lastEventAt || null;

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
    deployments: {
      recent: recentDeployments.map((d) => ({
        deploymentId: d._id,
        projectId: d.projectId,
        projectName: projectNameById.get(String(d.projectId)) || 'Unknown project',
        sha: d.sha,
        ref: d.ref,
        deployedAt: d.deployedAt,
        source: d.source,
        correlation: d.correlation,
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
