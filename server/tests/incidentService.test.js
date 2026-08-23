// server/tests/incidentService.test.js
//
// Same approach as errorGroupService.test.js: Incident/ErrorGroup/
// Project's query methods are monkey-patched with in-memory fakes
// mimicking Mongoose's real shapes (no real Mongo/Atlas available
// here — see that file's header comment for the fuller rationale).
// sseHub.publish and incidentDiagnosisQueue.enqueueIncidentDiagnosis
// are also mocked so these tests never touch real Redis.

const test = require('node:test');
const assert = require('node:assert/strict');

const Incident = require('../models/Incident');
const ErrorGroup = require('../models/ErrorGroup');
const Project = require('../models/Project');
const sseHub = require('../services/sseHub');
const incidentDiagnosisQueue = require('../services/incidentDiagnosisQueue');
const { recordTrigger, getIncidentDetail, updateIncidentStatus, DEDUP_WINDOW_MINUTES } = require('../services/incidentService');

function fakeIncidentDoc(overrides = {}) {
  const doc = {
    _id: overrides._id || 'incident-1',
    projectId: overrides.projectId || 'project-1',
    status: overrides.status || 'open',
    affectedGroups: overrides.affectedGroups || [],
    timeline: overrides.timeline || [],
    severity: overrides.severity || null,
    triggeredBy: overrides.triggeredBy || { type: 'spike', refId: 'group-1' },
    createdAt: overrides.createdAt || new Date(),
    save: async function save() {
      return this;
    },
  };
  return doc;
}

function withMocks(mocks, fn) {
  const originals = {
    incidentFindOne: Incident.findOne,
    incidentCreate: Incident.create,
    incidentFindById: Incident.findById,
    errorGroupFind: ErrorGroup.find,
    projectFindOne: Project.findOne,
    sseHubPublish: sseHub.publish,
    enqueueIncidentDiagnosis: incidentDiagnosisQueue.enqueueIncidentDiagnosis,
  };

  Incident.findOne = mocks.findOne || (() => ({ sort: () => Promise.resolve(null) }));
  Incident.create = mocks.create || (async (doc) => fakeIncidentDoc(doc));
  Incident.findById = mocks.findById || (async () => null);
  ErrorGroup.find = mocks.errorGroupFind || (() => ({ select: () => Promise.resolve([]) }));
  Project.findOne = mocks.projectFindOne || (async () => null);
  sseHub.publish = mocks.sseHubPublish || (async () => {});
  incidentDiagnosisQueue.enqueueIncidentDiagnosis = mocks.enqueueIncidentDiagnosis || (async () => {});

  return fn().finally(() => {
    Incident.findOne = originals.incidentFindOne;
    Incident.create = originals.incidentCreate;
    Incident.findById = originals.incidentFindById;
    ErrorGroup.find = originals.errorGroupFind;
    Project.findOne = originals.projectFindOne;
    sseHub.publish = originals.sseHubPublish;
    incidentDiagnosisQueue.enqueueIncidentDiagnosis = originals.enqueueIncidentDiagnosis;
  });
}

test('recordTrigger: no existing open incident in the dedup window -> creates a new one', async () => {
  let createCalledWith = null;
  let publishedType = null;

  await withMocks(
    {
      findOne: () => ({ sort: () => Promise.resolve(null) }),
      create: async (doc) => {
        createCalledWith = doc;
        return fakeIncidentDoc({ _id: 'new-incident', ...doc });
      },
      errorGroupFind: () => ({ select: () => Promise.resolve([{ aiSummary: { severity: 'high' } }]) }),
      sseHubPublish: async (projectId, type) => {
        publishedType = type;
      },
    },
    async () => {
      const incident = await recordTrigger({
        projectId: 'project-1',
        triggerType: 'spike',
        refId: 'group-1',
        affectedGroupIds: ['group-1'],
        title: 'Error spike: boom',
        timelineType: 'spike_detected',
        timelineMessage: 'Spike detected.',
      });

      assert.equal(incident._id, 'new-incident');
      assert.equal(createCalledWith.status, 'open');
      assert.equal(createCalledWith.severity, 'high');
      assert.equal(createCalledWith.triggeredBy.type, 'spike');
      assert.equal(createCalledWith.timeline.length, 1);
      assert.equal(createCalledWith.timeline[0].type, 'spike_detected');
      assert.equal(publishedType, 'incident_created');
    }
  );
});

test('recordTrigger: an open incident within the dedup window -> appends instead of creating a new one', async () => {
  const existing = fakeIncidentDoc({
    _id: 'existing-incident',
    status: 'open',
    affectedGroups: ['group-1'],
    timeline: [{ type: 'spike_detected', message: 'first', timestamp: new Date() }],
  });
  let saved = false;
  existing.save = async function save() {
    saved = true;
    return this;
  };

  let createCalled = false;
  let publishedType = null;

  await withMocks(
    {
      findOne: () => ({ sort: () => Promise.resolve(existing) }),
      create: async () => {
        createCalled = true;
        throw new Error('should not create a new incident');
      },
      errorGroupFind: () => ({ select: () => Promise.resolve([{ aiSummary: { severity: 'critical' } }]) }),
      sseHubPublish: async (projectId, type) => {
        publishedType = type;
      },
    },
    async () => {
      const incident = await recordTrigger({
        projectId: 'project-1',
        triggerType: 'deployment',
        refId: 'deployment-1',
        affectedGroupIds: ['group-2'],
        title: 'Regression suspected',
        timelineType: 'deployment_regression',
        timelineMessage: 'Second trigger.',
      });

      assert.equal(createCalled, false);
      assert.equal(saved, true);
      assert.equal(incident._id, 'existing-incident');
      // Merged, deduped affected groups — group-1 (already there) + group-2 (new).
      assert.deepEqual(incident.affectedGroups.map(String).sort(), ['group-1', 'group-2']);
      assert.equal(incident.timeline.length, 2);
      assert.equal(incident.timeline[1].type, 'deployment_regression');
      assert.equal(incident.severity, 'critical');
      assert.equal(publishedType, 'incident_updated');
    }
  );
});

test('recordTrigger: an incident outside the dedup window is NOT matched -> creates a new one', async () => {
  let findOneFilter = null;

  await withMocks(
    {
      findOne: (filter) => {
        findOneFilter = filter;
        return { sort: () => Promise.resolve(null) };
      },
    },
    async () => {
      const now = new Date('2026-01-01T12:00:00.000Z');
      await recordTrigger({
        projectId: 'project-1',
        triggerType: 'spike',
        refId: 'group-1',
        affectedGroupIds: ['group-1'],
        title: 'title',
        timelineType: 'spike_detected',
        timelineMessage: 'msg',
        now,
      });

      const expectedWindowStart = new Date(now.getTime() - DEDUP_WINDOW_MINUTES * 60 * 1000);
      assert.equal(findOneFilter.status, 'open');
      assert.equal(findOneFilter.createdAt.$gte.getTime(), expectedWindowStart.getTime());
    }
  );
});

test('recordTrigger: a resolved incident within the window is NOT matched -> creates a new one (literal Task 41.2 spec: "open status" only)', async () => {
  // The mock's findOne is queried with status: 'open' in its filter —
  // a resolved incident would never be returned by a real Mongo query
  // with that filter, so this test asserts the filter shape itself
  // rather than needing a fake "resolved incident that Mongo would
  // exclude" — see the dedicated filter-shape assertion above for the
  // window boundary; this one asserts the status value.
  let findOneFilter = null;
  await withMocks(
    {
      findOne: (filter) => {
        findOneFilter = filter;
        return { sort: () => Promise.resolve(null) };
      },
    },
    async () => {
      await recordTrigger({
        projectId: 'project-1',
        triggerType: 'spike',
        refId: 'group-1',
        affectedGroupIds: ['group-1'],
        title: 'title',
        timelineType: 'spike_detected',
        timelineMessage: 'msg',
      });
      assert.equal(findOneFilter.status, 'open');
    }
  );
});

test('recordTrigger: enqueues AI diagnosis and does not let a queue failure block the returned incident', async () => {
  let enqueued = false;
  await withMocks(
    {
      enqueueIncidentDiagnosis: async () => {
        enqueued = true;
        throw new Error('queue unreachable');
      },
    },
    async () => {
      const incident = await recordTrigger({
        projectId: 'project-1',
        triggerType: 'spike',
        refId: 'group-1',
        affectedGroupIds: ['group-1'],
        title: 'title',
        timelineType: 'spike_detected',
        timelineMessage: 'msg',
      });
      // recordTrigger itself must not throw/reject even though the
      // enqueue rejected — same fire-and-forget-with-catch contract as
      // every other queue-enqueue call site in this codebase.
      assert.ok(incident);
      // Give the fire-and-forget .catch() a tick to run.
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(enqueued, true);
    }
  );
});

test('getIncidentDetail: not found -> null, never queries Project', async () => {
  let projectQueried = false;
  await withMocks(
    {
      findById: async () => null,
      projectFindOne: async () => {
        projectQueried = true;
        return null;
      },
    },
    async () => {
      const result = await getIncidentDetail({ ownerId: 'owner-1', incidentId: 'missing' });
      assert.equal(result, null);
      assert.equal(projectQueried, false);
    }
  );
});

test('getIncidentDetail: found but not owned -> null (not-found-or-not-yours collapse)', async () => {
  await withMocks(
    {
      findById: async () => fakeIncidentDoc({ projectId: 'project-1' }),
      projectFindOne: async () => null, // ownership check fails
    },
    async () => {
      const result = await getIncidentDetail({ ownerId: 'someone-else', incidentId: 'incident-1' });
      assert.equal(result, null);
    }
  );
});

test('getIncidentDetail: owned -> returns shaped detail with affected groups', async () => {
  const incident = fakeIncidentDoc({
    projectId: 'project-1',
    title: 'Test incident',
    affectedGroups: ['group-1'],
    aiSummary: 'A hypothesis.',
  });
  incident.title = 'Test incident';
  incident.aiSummary = 'A hypothesis.';

  await withMocks(
    {
      findById: async () => incident,
      projectFindOne: async () => ({ _id: 'project-1' }),
      errorGroupFind: () => ({
        select: () =>
          Promise.resolve([
            { _id: 'group-1', message: 'Boom', status: 'open', aiSummary: { severity: 'high' }, lastSeen: new Date(), count: 3 },
          ]),
      }),
    },
    async () => {
      const result = await getIncidentDetail({ ownerId: 'owner-1', incidentId: 'incident-1' });
      assert.equal(result.title, 'Test incident');
      assert.equal(result.aiSummary, 'A hypothesis.');
      assert.equal(result.affectedGroups.length, 1);
      assert.equal(result.affectedGroups[0].message, 'Boom');
      assert.equal(result.affectedGroups[0].severity, 'high');
    }
  );
});

test('updateIncidentStatus: appends a status_changed timeline entry, never overwrites timeline', async () => {
  const incident = fakeIncidentDoc({
    projectId: 'project-1',
    status: 'open',
    timeline: [{ type: 'created', message: 'first', timestamp: new Date() }],
  });

  let publishedType = null;

  await withMocks(
    {
      findById: async () => incident,
      projectFindOne: async () => ({ _id: 'project-1' }),
      sseHubPublish: async (projectId, type) => {
        publishedType = type;
      },
    },
    async () => {
      const result = await updateIncidentStatus({ ownerId: 'owner-1', incidentId: 'incident-1', status: 'resolved' });
      assert.equal(result.status, 'resolved');
      assert.equal(result.timeline.length, 2);
      assert.equal(result.timeline[0].type, 'created'); // original entry preserved
      assert.equal(result.timeline[1].type, 'status_changed');
      assert.equal(publishedType, 'incident_updated');
    }
  );
});

test('updateIncidentStatus: not owned -> null, no mutation', async () => {
  const incident = fakeIncidentDoc({ projectId: 'project-1', status: 'open' });
  await withMocks(
    {
      findById: async () => incident,
      projectFindOne: async () => null,
    },
    async () => {
      const result = await updateIncidentStatus({ ownerId: 'someone-else', incidentId: 'incident-1', status: 'resolved' });
      assert.equal(result, null);
      assert.equal(incident.status, 'open'); // untouched
    }
  );
});
