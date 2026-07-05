// server/tests/errorGroupService.test.js
//
// Approach taken and why: a focused unit test against the
// upsert-payload logic and retry behavior in errorGroupService.js,
// using Node's built-in node:test + assert — NOT a real/in-memory
// Mongo integration test. This environment has no MongoDB Atlas
// credentials and no network access to download a
// mongodb-memory-server binary, so a real-DB integration test isn't
// feasible here without adding a new dependency unjustified for one
// test (see PROJECT_RULES.md's restraint-over-premature-infrastructure
// philosophy). Instead, ErrorGroup.findOneAndUpdate and
// ErrorEvent.create are monkey-patched with in-memory fakes that
// mimic Mongo's real result shapes (including the
// `includeResultMetadata: true` / `lastErrorObject.upserted` shape
// and an E11000 duplicate-key error), so the actual logic under test
// — first-occurrence detection, $setOnInsert-only semantics, and the
// retry-once-on-E11000 behavior — runs unmodified.
//
// This does NOT exercise Mongoose's own query execution, network
// layer, or the real unique index. If a real Mongo/Atlas instance is
// available, the manual verification steps in this pass's summary
// (duplicate event collapses into one ErrorGroup, distinct event
// produces a separate ErrorGroup) are the higher-fidelity check for
// that — this test is a fast, CI-friendly complement to it, not a
// replacement.

const test = require('node:test');
const assert = require('node:assert/strict');

const ErrorGroup = require('../models/ErrorGroup');
const ErrorEvent = require('../models/ErrorEvent');
const Project = require('../models/Project');
const githubService = require('../services/githubService');
const aiService = require('../services/aiService');
const {
  recordEvent,
  enrichErrorGroup,
  listErrorGroups,
  updateGroupStatus,
  getGroupDetail,
} = require('../services/errorGroupService');
function fakeObjectId(seed) {
  // Mongoose ObjectIds aren't needed for real here — recordEvent only
  // ever reads _id off whatever upsertErrorGroup/ErrorEvent.create
  // return, never constructs one itself.
  return `fake-object-id-${seed}`;
}

function withMockedModels(mocks, fn) {
  const originalFindOneAndUpdate = ErrorGroup.findOneAndUpdate;
  const originalCreate = ErrorEvent.create;
  ErrorGroup.findOneAndUpdate = mocks.findOneAndUpdate;
  ErrorEvent.create = mocks.create;
  return fn().finally(() => {
    ErrorGroup.findOneAndUpdate = originalFindOneAndUpdate;
    ErrorEvent.create = originalCreate;
  });
}

test('recordEvent: detects a brand-new group via lastErrorObject.upserted', async () => {
  const groupId = fakeObjectId('new-group');
  let callCount = 0;

  await withMockedModels(
    {
      findOneAndUpdate: async (filter, update) => {
        callCount += 1;
        assert.equal(filter.projectId, 'project-1');
        assert.ok(update.$setOnInsert.message);
        assert.ok(update.$setOnInsert.stackSample);
        return {
          value: { _id: groupId, count: 1 },
          lastErrorObject: { updatedExisting: false, upserted: groupId },
        };
      },
      create: async (doc) => ({ _id: fakeObjectId('event-1'), ...doc }),
    },
    async () => {
      const result = await recordEvent({
        projectId: 'project-1',
        message: 'TypeError: x is not a function',
        stack: 'at foo (/app/server/index.js:1:1)',
        env: 'test',
        metadata: {},
      });

      assert.equal(callCount, 1, 'upsert should only be attempted once on success');
      assert.equal(result.isNewGroup, true);
      assert.equal(result.errorGroup._id, groupId);
    }
  );
});

test('recordEvent: detects a duplicate (existing) group via absence of upserted', async () => {
  const groupId = fakeObjectId('existing-group');

  await withMockedModels(
    {
      findOneAndUpdate: async () => ({
        value: { _id: groupId, count: 4 },
        lastErrorObject: { updatedExisting: true },
      }),
      create: async (doc) => ({ _id: fakeObjectId('event-2'), ...doc }),
    },
    async () => {
      const result = await recordEvent({
        projectId: 'project-1',
        message: 'TypeError: x is not a function',
        stack: 'at foo (/app/server/index.js:1:1)',
        env: 'test',
        metadata: {},
      });

      assert.equal(result.isNewGroup, false);
      assert.equal(result.errorGroup.count, 4);
    }
  );
});

test('recordEvent: retries exactly once on a MongoDB E11000 duplicate-key error, then succeeds', async () => {
  const groupId = fakeObjectId('race-group');
  let attempts = 0;

  await withMockedModels(
    {
      findOneAndUpdate: async () => {
        attempts += 1;
        if (attempts === 1) {
          const err = new Error('E11000 duplicate key error');
          err.code = 11000;
          throw err;
        }
        // Second attempt (the retry): the other concurrent request's
        // insert has settled, so this resolves as a normal update.
        return {
          value: { _id: groupId, count: 2 },
          lastErrorObject: { updatedExisting: true },
        };
      },
      create: async (doc) => ({ _id: fakeObjectId('event-3'), ...doc }),
    },
    async () => {
      const result = await recordEvent({
        projectId: 'project-1',
        message: 'RangeError: invalid array length',
        stack: 'at bar (/app/server/index.js:2:2)',
        env: 'test',
        metadata: {},
      });

      assert.equal(attempts, 2, 'exactly one retry (two total attempts) expected');
      assert.equal(result.isNewGroup, false);
      assert.equal(result.errorGroup._id, groupId);
    }
  );
});

test('recordEvent: a non-E11000 error is not retried and propagates to the caller', async () => {
  let attempts = 0;

  await withMockedModels(
    {
      findOneAndUpdate: async () => {
        attempts += 1;
        throw new Error('connection reset');
      },
      create: async () => {
        throw new Error('should not be called');
      },
    },
    async () => {
      await assert.rejects(
        () =>
          recordEvent({
            projectId: 'project-1',
            message: 'Error: boom',
            stack: 'at baz (/app/server/index.js:3:3)',
            env: 'test',
            metadata: {},
          }),
        /connection reset/
      );
      assert.equal(attempts, 1, 'no retry for a non-duplicate-key error');
    }
  );
});

// --- enrichErrorGroup (Task 13) ---
//
// Same reasoning as above: no live Gemini/GitHub credentials or
// network access in this environment, so githubService/aiService's
// exported functions are monkey-patched with in-memory fakes rather
// than hit for real. This exercises enrichErrorGroup's own wiring
// logic (frame selection, conditional snippet fetch, save-on-success,
// leave-null-on-failure) — it does not verify the real Gemini/GitHub
// calls themselves, which is what the live manual test (this task's
// handoff notes) is for.

function withMockedEnrichmentDeps(mocks, fn) {
  const originalFetchCodeSnippet = githubService.fetchCodeSnippet;
  const originalBuildPrompt = aiService.buildPrompt;
  const originalCallGemini = aiService.callGemini;
  const originalParseAndValidate = aiService.parseAndValidate;
  const originalFindByIdAndUpdate = ErrorGroup.findByIdAndUpdate;

  githubService.fetchCodeSnippet = mocks.fetchCodeSnippet || originalFetchCodeSnippet;
  aiService.buildPrompt = mocks.buildPrompt || originalBuildPrompt;
  aiService.callGemini = mocks.callGemini || originalCallGemini;
  aiService.parseAndValidate = mocks.parseAndValidate || originalParseAndValidate;
  ErrorGroup.findByIdAndUpdate = mocks.findByIdAndUpdate || originalFindByIdAndUpdate;

  return fn().finally(() => {
    githubService.fetchCodeSnippet = originalFetchCodeSnippet;
    aiService.buildPrompt = originalBuildPrompt;
    aiService.callGemini = originalCallGemini;
    aiService.parseAndValidate = originalParseAndValidate;
    ErrorGroup.findByIdAndUpdate = originalFindByIdAndUpdate;
  });
}

test('enrichErrorGroup: no githubRepo configured — skips snippet fetch, saves aiSummary with low confidence and no affectedFile/Function', async () => {
  let snippetFetchCalled = false;
  let savedUpdate = null;

  await withMockedEnrichmentDeps(
    {
      fetchCodeSnippet: async () => {
        snippetFetchCalled = true;
        return 'should not be called';
      },
      buildPrompt: ({ codeSnippet }) => {
        assert.equal(codeSnippet, null, 'no githubRepo means codeSnippet must stay null');
        return 'prompt';
      },
      callGemini: async () => '{"rootCause":"x","severity":"low","suggestedFix":["do x"]}',
      parseAndValidate: (raw) => JSON.parse(raw),
      findByIdAndUpdate: async (id, update) => {
        savedUpdate = update;
        return { _id: id };
      },
    },
    async () => {
      await enrichErrorGroup({
        errorGroup: { _id: fakeObjectId('group-no-repo') },
        project: { githubRepo: null },
        message: 'TypeError: x is not a function',
        stack: 'at foo (/app/server/index.js:1:1)',
      });

      assert.equal(snippetFetchCalled, false);
      assert.deepEqual(savedUpdate.$set.aiSummary, {
        rootCause: 'x',
        severity: 'low',
        suggestedFix: ['do x'],
        confidence: 0.4,
        affectedFile: '/app/server/index.js',
        affectedFunction: 'foo',
      });
    }
  );
});

test('enrichErrorGroup: githubRepo configured — fetches snippet for the top app frame, saves aiSummary with high confidence', async () => {
  let fetchArgs = null;
  let savedUpdate = null;

  await withMockedEnrichmentDeps(
    {
      fetchCodeSnippet: async (args) => {
        fetchArgs = args;
        return '1: const x = 1;';
      },
      buildPrompt: ({ codeSnippet }) => {
        assert.equal(codeSnippet, '1: const x = 1;');
        return 'prompt';
      },
      callGemini: async () => '{"rootCause":"y","severity":"high","suggestedFix":["do y"]}',
      parseAndValidate: (raw) => JSON.parse(raw),
      findByIdAndUpdate: async (id, update) => {
        savedUpdate = update;
        return {};
      },
    },
    async () => {
      await enrichErrorGroup({
        errorGroup: { _id: fakeObjectId('group-with-repo') },
        project: { githubRepo: 'owner/repo' },
        message: 'TypeError: x is not a function',
        stack: 'at foo (/app/server/routes/foo.js:10:2)',
      });

      assert.equal(fetchArgs.githubRepo, 'owner/repo');
      assert.equal(fetchArgs.filePath, '/app/server/routes/foo.js');
      assert.equal(fetchArgs.line, 10);
      assert.equal(savedUpdate.$set.aiSummary.confidence, 0.8);
      assert.equal(savedUpdate.$set.aiSummary.affectedFile, '/app/server/routes/foo.js');
      assert.equal(savedUpdate.$set.aiSummary.affectedFunction, 'foo');
    }
  );
});

test('enrichErrorGroup: unparseable stack (no frames) — affectedFile/affectedFunction saved as null, confidence stays low', async () => {
  let savedUpdate = null;

  await withMockedEnrichmentDeps(
    {
      fetchCodeSnippet: async () => {
        throw new Error('should not be called — no top frame to fetch for');
      },
      buildPrompt: ({ codeSnippet }) => {
        assert.equal(codeSnippet, null);
        return 'prompt';
      },
      callGemini: async () => '{"rootCause":"z","severity":"medium","suggestedFix":["do z"]}',
      parseAndValidate: (raw) => JSON.parse(raw),
      findByIdAndUpdate: async (id, update) => {
        savedUpdate = update;
        return {};
      },
    },
    async () => {
      await enrichErrorGroup({
        errorGroup: { _id: fakeObjectId('group-no-frames') },
        project: { githubRepo: 'owner/repo' },
        message: 'Error: totally unstructured',
        stack: 'this is not a real stack trace at all',
      });

      assert.deepEqual(savedUpdate.$set.aiSummary, {
        rootCause: 'z',
        severity: 'medium',
        suggestedFix: ['do z'],
        confidence: 0.4,
        affectedFile: null,
        affectedFunction: null,
      });
    }
  );
});

test('enrichErrorGroup: invalid/unparseable Gemini response — leaves aiSummary untouched, does not throw', async () => {
  let saveCalled = false;

  await withMockedEnrichmentDeps(
    {
      fetchCodeSnippet: async () => null,
      buildPrompt: () => 'prompt',
      callGemini: async () => 'not valid json',
      parseAndValidate: () => null,
      findByIdAndUpdate: async () => {
        saveCalled = true;
      },
    },
    async () => {
      await enrichErrorGroup({
        errorGroup: { _id: fakeObjectId('group-bad-response') },
        project: { githubRepo: null },
        message: 'Error: boom',
        stack: 'at baz (/app/server/index.js:3:3)',
      });

      assert.equal(saveCalled, false, 'must not save when parseAndValidate returns null');
    }
  );
});

test('enrichErrorGroup: Gemini call throws — caught internally, never propagates', async () => {
  await withMockedEnrichmentDeps(
    {
      fetchCodeSnippet: async () => null,
      buildPrompt: () => 'prompt',
      callGemini: async () => {
        throw new Error('Gemini API unavailable');
      },
    },
    async () => {
      await assert.doesNotReject(() =>
        enrichErrorGroup({
          errorGroup: { _id: fakeObjectId('group-gemini-down') },
          project: { githubRepo: null },
          message: 'Error: boom',
          stack: 'at qux (/app/server/index.js:4:4)',
        })
      );
    }
  );
});

test('recordEvent: message/stackSample only ever go through $setOnInsert, never $set', async () => {
  await withMockedModels(
    {
      findOneAndUpdate: async (filter, update) => {
        assert.equal(update.$set.message, undefined);
        assert.equal(update.$set.stackSample, undefined);
        assert.equal(update.$setOnInsert.message, 'Error: only-on-insert check');
        return {
          value: { _id: fakeObjectId('setoninsert-check'), count: 1 },
          lastErrorObject: { upserted: fakeObjectId('setoninsert-check') },
        };
      },
      create: async (doc) => ({ _id: fakeObjectId('event-4'), ...doc }),
    },
    async () => {
      await recordEvent({
        projectId: 'project-1',
        message: 'Error: only-on-insert check',
        stack: 'at qux (/app/server/index.js:4:4)',
        env: 'test',
        metadata: {},
      });
    }
  );
});

// --- listErrorGroups (Task 17) ---
//
// Same monkey-patching approach as above (no live Mongo in this
// environment). ErrorGroup.find(...).sort(...) is chained, so the fake
// returns an object exposing a .sort() method rather than a bare array
// — matching the real Mongoose Query chain shape closely enough for
// this function's own logic (the .map() shaping) to run unmodified.

function withMockedFind(groups, fn) {
  const originalFind = ErrorGroup.find;
  let capturedFilter = null;
  let capturedSort = null;

  ErrorGroup.find = (filter) => {
    capturedFilter = filter;
    return {
      sort: (sortArg) => {
        capturedSort = sortArg;
        return Promise.resolve(groups);
      },
    };
  };

  return fn(() => ({ filter: capturedFilter, sort: capturedSort })).finally(() => {
    ErrorGroup.find = originalFind;
  });
}

test('listErrorGroups: filters by projectId and sorts by lastSeen descending', async () => {
  await withMockedFind([], async (getCaptured) => {
    await listErrorGroups('project-42');
    const { filter, sort } = getCaptured();
    assert.deepEqual(filter, { projectId: 'project-42' });
    assert.deepEqual(sort, { lastSeen: -1 });
  });
});

test('listErrorGroups: shapes each group, omitting stackSample, and nulls aiSummary when absent', async () => {
  const fakeGroups = [
    {
      _id: fakeObjectId('group-a'),
      message: 'TypeError: x',
      stackSample: 'should not appear in output',
      status: 'open',
      count: 3,
      firstSeen: new Date('2026-01-01'),
      lastSeen: new Date('2026-01-05'),
      aiSummary: null,
    },
  ];

  await withMockedFind(fakeGroups, async () => {
    const result = await listErrorGroups('project-1');
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], {
      id: fakeObjectId('group-a'),
      message: 'TypeError: x',
      status: 'open',
      count: 3,
      firstSeen: new Date('2026-01-01'),
      lastSeen: new Date('2026-01-05'),
      aiSummary: null,
    });
    assert.equal('stackSample' in result[0], false);
  });
});

test('listErrorGroups: when aiSummary exists, includes only severity and rootCause (not suggestedFix/confidence/affected*)', async () => {
  const fakeGroups = [
    {
      _id: fakeObjectId('group-b'),
      message: 'RangeError: y',
      stackSample: 'irrelevant',
      status: 'resolved',
      count: 1,
      firstSeen: new Date('2026-02-01'),
      lastSeen: new Date('2026-02-01'),
      aiSummary: {
        rootCause: 'bad input',
        severity: 'high',
        suggestedFix: ['fix it'],
        confidence: 0.8,
        affectedFile: 'foo.js',
        affectedFunction: 'foo',
      },
    },
  ];

  await withMockedFind(fakeGroups, async () => {
    const result = await listErrorGroups('project-1');
    assert.deepEqual(result[0].aiSummary, { severity: 'high', rootCause: 'bad input' });
  });
});

// --- updateGroupStatus (Task 18) ---
//
// Same monkey-patching approach as the rest of this file. ErrorGroup
// is faked as a plain object with a `.statusHistory` array and a
// `.save()` spy — close enough to a real Mongoose document for this
// function's own logic (push-then-save, never $set/overwrite) to run
// unmodified. Project.findOne is faked separately to exercise the
// ownership-scoping branch independently of whether the group itself
// was found.

function withMockedStatusDeps(mocks, fn) {
  const originalFindById = ErrorGroup.findById;
  const originalProjectFindOne = Project.findOne;

  ErrorGroup.findById = mocks.findById;
  Project.findOne = mocks.findOne;

  return fn().finally(() => {
    ErrorGroup.findById = originalFindById;
    Project.findOne = originalProjectFindOne;
  });
}

test('updateGroupStatus: owned group — pushes a statusHistory entry, saves, and returns the shaped result', async () => {
  let saveCalled = false;
  const fakeGroup = {
    _id: fakeObjectId('owned-group'),
    projectId: 'project-1',
    status: 'open',
    statusHistory: [],
    save: async () => {
      saveCalled = true;
    },
  };

  await withMockedStatusDeps(
    {
      findById: async (id) => {
        assert.equal(id, fakeObjectId('owned-group'));
        return fakeGroup;
      },
      findOne: async (filter) => {
        assert.deepEqual(filter, { _id: 'project-1', ownerId: 'user-1' });
        return { _id: 'project-1', ownerId: 'user-1' };
      },
    },
    async () => {
      const result = await updateGroupStatus({
        ownerId: 'user-1',
        groupId: fakeObjectId('owned-group'),
        status: 'resolved',
      });

      assert.equal(saveCalled, true);
      assert.equal(fakeGroup.status, 'resolved');
      assert.equal(fakeGroup.statusHistory.length, 1);
      assert.equal(fakeGroup.statusHistory[0].status, 'resolved');
      assert.ok(fakeGroup.statusHistory[0].changedAt instanceof Date);
      assert.equal(result.status, 'resolved');
      assert.equal(result.statusHistory.length, 1);
    }
  );
});

test('updateGroupStatus: group does not exist — returns null, never queries Project', async () => {
  let projectQueried = false;

  await withMockedStatusDeps(
    {
      findById: async () => null,
      findOne: async () => {
        projectQueried = true;
        return null;
      },
    },
    async () => {
      const result = await updateGroupStatus({
        ownerId: 'user-1',
        groupId: fakeObjectId('missing-group'),
        status: 'resolved',
      });

      assert.equal(result, null);
      assert.equal(projectQueried, false, 'must not query Project when the group itself was not found');
    }
  );
});

test('updateGroupStatus: group exists but belongs to a different owner — returns null, never saves', async () => {
  let saveCalled = false;
  const fakeGroup = {
    _id: fakeObjectId('not-your-group'),
    projectId: 'project-2',
    status: 'open',
    statusHistory: [],
    save: async () => {
      saveCalled = true;
    },
  };

  await withMockedStatusDeps(
    {
      findById: async () => fakeGroup,
      // Ownership-scoped query correctly finds nothing for this ownerId.
      findOne: async () => null,
    },
    async () => {
      const result = await updateGroupStatus({
        ownerId: 'someone-else',
        groupId: fakeObjectId('not-your-group'),
        status: 'ignored',
      });

      assert.equal(result, null);
      assert.equal(saveCalled, false, 'must not mutate/save a group the caller does not own');
      assert.equal(fakeGroup.status, 'open', 'status must be untouched on the not-yours path');
    }
  );
});

// --- getGroupDetail (Task 19) ---
//
// Same two-step ownership pattern as updateGroupStatus, plus a third
// dependency (ErrorEvent.find) that's only ever reached once ownership
// is confirmed. ErrorEvent.find is faked as a chainable
// { sort, limit } object, matching how the real Mongoose Query is used
// in getGroupDetail (find().sort().limit()) — not a full Query
// implementation, just enough surface for this call shape.

function withMockedDetailDeps(mocks, fn) {
  const originalFindById = ErrorGroup.findById;
  const originalProjectFindOne = Project.findOne;
  const originalEventFind = ErrorEvent.find;

  ErrorGroup.findById = mocks.findById;
  Project.findOne = mocks.findOne;
  ErrorEvent.find = mocks.find;

  return fn().finally(() => {
    ErrorGroup.findById = originalFindById;
    Project.findOne = originalProjectFindOne;
    ErrorEvent.find = originalEventFind;
  });
}

test('getGroupDetail: owned group — returns full group shape (incl. projectId + full aiSummary) and shaped, sorted/limited events', async () => {
  let sortArg = null;
  let limitArg = null;
  const fakeGroup = {
    _id: fakeObjectId('detail-group'),
    projectId: 'project-1',
    message: 'TypeError: x is not a function',
    stackSample: 'at foo (/app/index.js:1:1)',
    status: 'open',
    statusHistory: [{ status: 'open', changedAt: new Date('2026-01-01') }],
    aiSummary: {
      rootCause: 'x is undefined',
      severity: 'high',
      suggestedFix: ['Add a null check', 'Add a regression test'],
      confidence: 0.8,
      affectedFile: 'index.js',
      affectedFunction: 'foo',
    },
    count: 3,
    firstSeen: new Date('2026-01-01'),
    lastSeen: new Date('2026-01-03'),
  };
  const fakeEvents = [
    { _id: fakeObjectId('event-2'), receivedAt: new Date('2026-01-03'), env: 'production', rawStack: 'irrelevant' },
    { _id: fakeObjectId('event-1'), receivedAt: new Date('2026-01-01'), env: null, rawStack: 'irrelevant' },
  ];

  await withMockedDetailDeps(
    {
      findById: async (id) => {
        assert.equal(id, fakeObjectId('detail-group'));
        return fakeGroup;
      },
      findOne: async (filter) => {
        assert.deepEqual(filter, { _id: 'project-1', ownerId: 'user-1' });
        return { _id: 'project-1', ownerId: 'user-1' };
      },
      find: (filter) => {
        assert.deepEqual(filter, { errorGroupId: fakeObjectId('detail-group') });
        return {
          sort: (arg) => {
            sortArg = arg;
            return {
              limit: (arg2) => {
                limitArg = arg2;
                return Promise.resolve(fakeEvents);
              },
            };
          },
        };
      },
    },
    async () => {
      const result = await getGroupDetail({
        ownerId: 'user-1',
        groupId: fakeObjectId('detail-group'),
      });

      assert.deepEqual(sortArg, { receivedAt: -1 });
      assert.equal(limitArg, 50);

      assert.equal(result.group.id, fakeObjectId('detail-group'));
      assert.equal(result.group.projectId, 'project-1');
      assert.equal(result.group.stackSample, fakeGroup.stackSample);
      assert.equal(result.group.statusHistory.length, 1);
      // Full aiSummary — unlike listErrorGroups, nothing trimmed.
      assert.equal(result.group.aiSummary.suggestedFix.length, 2);
      assert.equal(result.group.aiSummary.confidence, 0.8);
      assert.equal(result.group.aiSummary.affectedFile, 'index.js');
      assert.equal(result.group.count, 3);

      // Events shaped down to id/receivedAt/env — rawStack not exposed.
      assert.equal(result.events.length, 2);
      assert.equal(result.events[0].id, fakeObjectId('event-2'));
      assert.equal(result.events[0].env, 'production');
      assert.equal(result.events[0].rawStack, undefined);
    }
  );
});

test('getGroupDetail: group does not exist — returns null, never queries Project or ErrorEvent', async () => {
  let projectQueried = false;
  let eventsQueried = false;

  await withMockedDetailDeps(
    {
      findById: async () => null,
      findOne: async () => {
        projectQueried = true;
        return null;
      },
      find: () => {
        eventsQueried = true;
        return { sort: () => ({ limit: () => Promise.resolve([]) }) };
      },
    },
    async () => {
      const result = await getGroupDetail({
        ownerId: 'user-1',
        groupId: fakeObjectId('missing-group'),
      });

      assert.equal(result, null);
      assert.equal(projectQueried, false, 'must not query Project when the group itself was not found');
      assert.equal(eventsQueried, false, 'must not query ErrorEvent when the group itself was not found');
    }
  );
});

test('getGroupDetail: group exists but belongs to a different owner — returns null, never queries ErrorEvent', async () => {
  let eventsQueried = false;
  const fakeGroup = {
    _id: fakeObjectId('not-your-group'),
    projectId: 'project-2',
  };

  await withMockedDetailDeps(
    {
      findById: async () => fakeGroup,
      findOne: async () => null,
      find: () => {
        eventsQueried = true;
        return { sort: () => ({ limit: () => Promise.resolve([]) }) };
      },
    },
    async () => {
      const result = await getGroupDetail({
        ownerId: 'someone-else',
        groupId: fakeObjectId('not-your-group'),
      });

      assert.equal(result, null);
      assert.equal(eventsQueried, false, 'must not query ErrorEvent for a group the caller does not own');
    }
  );
});