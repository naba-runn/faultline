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
const { recordEvent } = require('../services/errorGroupService');

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
