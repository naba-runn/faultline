// server/tests/overviewService.test.js
//
// Task 36 — errorGroupService.getDashboardOverview. Same reasoning as
// errorGroupService.test.js: no MongoDB Atlas credentials or network
// access in this environment, so Project/ErrorEvent/ErrorGroup's
// query methods are monkey-patched with chainable fakes that mimic
// Mongoose's real shapes (.select/.sort/.limit/.lean chains,
// countDocuments resolving directly) rather than spinning up a real
// or in-memory Mongo instance. This exercises getDashboardOverview's
// own aggregation/bucketing/shaping logic, not Mongoose's query
// execution or a real 24h window against real data — see
// errorGroupService.test.js's header comment for the fuller
// rationale and this pass's manual-test complement to it.

const test = require('node:test');
const assert = require('node:assert/strict');

const Project = require('../models/Project');
const ErrorEvent = require('../models/ErrorEvent');
const ErrorGroup = require('../models/ErrorGroup');
const Deployment = require('../models/Deployment');
const trendService = require('../services/trendService');
const { getDashboardOverview } = require('../services/errorGroupService');

// A chainable fake matching the subset of the real Mongoose Query
// interface this file's queries actually use (.select/.sort/.limit,
// terminated by .lean() resolving to the given array) — same pattern
// as errorGroupService.test.js's withMockedFind, generalized to cover
// the extra .select()/.sort()/.limit() combinations
// getDashboardOverview chains in different orders across its three
// queries.
function chainable(result) {
  const chain = {
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: () => Promise.resolve(result),
  };
  return chain;
}

// getDashboardOverview now buckets/aggregates event counts server-side
// via ErrorEvent.aggregate([...]) (a $match + $facet with $dateTrunc),
// not by pulling every matching event doc into Node and looping —
// see overviewService.js's comment on why. This fake replicates that
// pipeline's actual semantics (the receivedAt >= $gte filter from the
// $match stage, then grouping by UTC hour and finding the max
// receivedAt) against the plain `events` fixture array, so these
// tests still exercise real filtering/bucketing behavior rather than
// just trusting whatever the mock is told to return.
function fakeEventAggregate(events, pipeline) {
  const match = pipeline[0].$match;
  const gte = match.receivedAt.$gte;
  const filtered = events.filter((e) => new Date(e.receivedAt) >= new Date(gte));

  const hourlyMap = new Map();
  let lastEventAt = null;
  for (const e of filtered) {
    const hour = trendService.startOfHour(e.receivedAt);
    const key = hour.getTime();
    hourlyMap.set(key, (hourlyMap.get(key) || 0) + 1);
    if (!lastEventAt || new Date(e.receivedAt) > lastEventAt) {
      lastEventAt = new Date(e.receivedAt);
    }
  }

  const hourly = [...hourlyMap.entries()].map(([time, count]) => ({ _id: new Date(time), count }));
  const lastEvent = lastEventAt ? [{ _id: null, lastEventAt }] : [];

  return Promise.resolve([{ hourly, lastEvent }]);
}

function withMocks({ projects, events, spikingCount, spikingGroups, recentReleaseGroups, unresolvedCount, recentDeployments }, fn) {
  const originals = {
    projectFind: Project.find,
    eventAggregate: ErrorEvent.aggregate,
    groupFind: ErrorGroup.find,
    groupCount: ErrorGroup.countDocuments,
    deploymentFind: Deployment.find,
  };

  Project.find = () => chainable(projects);
  ErrorEvent.aggregate = (pipeline) => fakeEventAggregate(events, pipeline);
  Deployment.find = () => chainable(recentDeployments || []);

  // countDocuments is now called twice: once for spikingCount
  // (filter has isSpiking), once for unresolvedCount (filter has
  // status: 'open'). Distinguish by filter shape.
  ErrorGroup.countDocuments = (filter) => {
    if (filter.isSpiking !== undefined) return Promise.resolve(spikingCount);
    if (filter.status !== undefined) return Promise.resolve(unresolvedCount ?? 0);
    return Promise.resolve(0);
  };

  // ErrorGroup.find is called twice (spiking groups, then recent
  // releases) with different filters — distinguish by the filter's
  // own shape rather than call order, so the mock doesn't silently
  // depend on getDashboardOverview's internal Promise.all ordering.
  ErrorGroup.find = (filter) => {
    if (filter.isSpiking !== undefined) return chainable(spikingGroups);
    if (filter.firstSeenRelease !== undefined) return chainable(recentReleaseGroups);
    if (filter.projectId !== undefined) return chainable(spikingGroups.concat(recentReleaseGroups));
    throw new Error(`Unexpected ErrorGroup.find filter in test: ${JSON.stringify(filter)}`);
  };

  return fn().finally(() => {
    Project.find = originals.projectFind;
    ErrorEvent.aggregate = originals.eventAggregate;
    ErrorGroup.find = originals.groupFind;
    ErrorGroup.countDocuments = originals.groupCount;
    Deployment.find = originals.deploymentFind;
  });
}

test('getDashboardOverview: no owned projects -> empty shape, still a full zero-filled series', async () => {
  await withMocks(
    { projects: [], events: [], spikingCount: 0, spikingGroups: [], recentReleaseGroups: [], unresolvedCount: 0 },
    async () => {
      const result = await getDashboardOverview('owner-1');
      assert.equal(result.alerts.totalProjects, 0);
      assert.equal(result.alerts.projectsConfigured, 0);
      assert.equal(result.alerts.spikingCount, 0);
      assert.deepEqual(result.alerts.spikingGroups, []);
      assert.deepEqual(result.releases.recent, []);
      assert.deepEqual(result.deployments.recent, []);
      assert.equal(result.unresolvedCount, 0);
      assert.equal(result.trend.windowHours, 24);
      // 24 trailing full hours + the in-progress current hour = 25 points.
      assert.equal(result.trend.series.length, 25);
      assert.ok(result.trend.series.every((b) => b.count === 0));
    }
  );
});

test('getDashboardOverview: counts projects with any alert trigger enabled, not just newGroup', async () => {
  const projects = [
    { _id: 'p1', name: 'API', alertConfig: { newGroup: true } },
    { _id: 'p2', name: 'Worker', alertConfig: { severityThreshold: { enabled: true } } },
    { _id: 'p3', name: 'Web', alertConfig: { spikeDetection: { enabled: true } } },
    { _id: 'p4', name: 'Idle', alertConfig: { newGroup: false, severityThreshold: { enabled: false }, spikeDetection: { enabled: false } } },
    { _id: 'p5', name: 'NoConfig', alertConfig: null },
  ];

  await withMocks(
    { projects, events: [], spikingCount: 0, spikingGroups: [], recentReleaseGroups: [] },
    async () => {
      const result = await getDashboardOverview('owner-1');
      assert.equal(result.alerts.totalProjects, 5);
      assert.equal(result.alerts.projectsConfigured, 3);
    }
  );
});

test('getDashboardOverview: buckets events into the correct trailing hour, ignores events outside the window', async () => {
  const { currentHourStart, baselineWindowStart } = trendService.getWindowBounds();
  const twoHoursAgo = new Date(currentHourStart.getTime() - 2 * 60 * 60 * 1000 + 5 * 60 * 1000); // 2h ago, 5 min into that hour
  const thisHour = new Date(currentHourStart.getTime() + 60 * 1000); // 1 min into the current hour
  const wayOutsideWindow = new Date(baselineWindowStart.getTime() - 60 * 60 * 1000); // 1h before the fetched window starts

  const projects = [{ _id: 'p1', name: 'API', alertConfig: {} }];
  const events = [
    { receivedAt: twoHoursAgo },
    { receivedAt: twoHoursAgo },
    { receivedAt: thisHour },
    { receivedAt: wayOutsideWindow },
  ];

  await withMocks(
    { projects, events, spikingCount: 0, spikingGroups: [], recentReleaseGroups: [] },
    async () => {
      const result = await getDashboardOverview('owner-1');
      const totalBucketed = result.trend.series.reduce((sum, b) => sum + b.count, 0);
      // The out-of-window event must not land in any bucket (and must
      // not throw) — only the 3 in-window events get counted.
      assert.equal(totalBucketed, 3);

      const twoHoursAgoBucket = result.trend.series.find(
        (b) => b.hour.getTime() === trendService.startOfHour(twoHoursAgo).getTime()
      );
      assert.equal(twoHoursAgoBucket.count, 2);

      const currentHourBucket = result.trend.series.find(
        (b) => b.hour.getTime() === currentHourStart.getTime()
      );
      assert.equal(currentHourBucket.count, 1);
    }
  );
});

test('getDashboardOverview: shapes spiking groups and recent releases with project names attached', async () => {
  const projects = [{ _id: 'p1', name: 'Checkout Service', alertConfig: {} }];
  const spikingGroups = [
    { _id: 'g1', projectId: 'p1', message: 'Payment timeout', lastSeen: new Date('2026-08-13T10:00:00Z'), count: 42 },
  ];
  const recentReleaseGroups = [
    {
      _id: 'g2', projectId: 'p1', message: 'Null pointer in cart',
      firstSeen: new Date('2026-08-12T09:00:00Z'), firstSeenRelease: 'v1.4.2',
      status: 'open', count: 18, aiSummary: { severity: 'high' },
    },
  ];

  await withMocks(
    { projects, events: [], spikingCount: 1, spikingGroups, recentReleaseGroups, unresolvedCount: 5 },
    async () => {
      const result = await getDashboardOverview('owner-1');

      assert.equal(result.alerts.spikingCount, 1);
      assert.equal(result.alerts.spikingGroups.length, 1);
      assert.equal(result.alerts.spikingGroups[0].projectName, 'Checkout Service');
      assert.equal(result.alerts.spikingGroups[0].message, 'Payment timeout');
      assert.equal(result.alerts.spikingGroups[0].count, 42);

      assert.equal(result.releases.recent.length, 1);
      assert.equal(result.releases.recent[0].projectName, 'Checkout Service');
      assert.equal(result.releases.recent[0].release, 'v1.4.2');
      assert.equal(result.releases.recent[0].status, 'open');
      assert.equal(result.releases.recent[0].count, 18);
      assert.equal(result.releases.recent[0].severity, 'high');

      assert.equal(result.unresolvedCount, 5);
    }
  );
});

test('getDashboardOverview: shapes recent deployments with project names attached, including a still-pending correlation', async () => {
  const projects = [{ _id: 'p1', name: 'Checkout Service', alertConfig: {} }];
  const recentDeployments = [
    {
      _id: 'd1', projectId: 'p1', sha: 'abc123', ref: 'refs/heads/main',
      deployedAt: new Date('2026-08-13T10:00:00Z'), source: 'github-webhook',
      correlation: { status: 'pending', windowMinutes: null, beforeCount: null, afterCount: null, beforeRate: null, afterRate: null, regressionSuspected: false, computedAt: null },
    },
    {
      _id: 'd2', projectId: 'p1', sha: 'def456', ref: 'refs/heads/main',
      deployedAt: new Date('2026-08-12T09:00:00Z'), source: 'github-webhook',
      correlation: { status: 'computed', windowMinutes: 15, beforeCount: 2, afterCount: 20, beforeRate: 0.133, afterRate: 1.333, regressionSuspected: true, computedAt: new Date('2026-08-12T09:15:00Z') },
    },
  ];

  return withMocks(
    { projects, events: [], spikingCount: 0, spikingGroups: [], recentReleaseGroups: [], unresolvedCount: 0, recentDeployments },
    async () => {
      const result = await getDashboardOverview('owner-1');

      assert.equal(result.deployments.recent.length, 2);
      assert.equal(result.deployments.recent[0].projectName, 'Checkout Service');
      assert.equal(result.deployments.recent[0].sha, 'abc123');
      assert.equal(result.deployments.recent[0].correlation.status, 'pending');
      assert.equal(result.deployments.recent[1].correlation.regressionSuspected, true);
    }
  );
});

