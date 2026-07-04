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
const githubService = require('../services/githubService');
const aiService = require('../services/aiService');
const { recordEvent, enrichErrorGroup } = require('../services/errorGroupService');

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

test('enrichErrorGroup: no githubRepo configured — skips snippet fetch, still saves aiSummary', async () => {
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
      });
    }
  );
});

test('enrichErrorGroup: githubRepo configured — fetches snippet for the top app frame', async () => {
  let fetchArgs = null;

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
      findByIdAndUpdate: async () => ({}),
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