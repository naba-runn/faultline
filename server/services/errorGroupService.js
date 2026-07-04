const ErrorGroup = require('../models/ErrorGroup');
const ErrorEvent = require('../models/ErrorEvent');
const { generateFingerprint } = require('./fingerprintService');

/**
 * Performs the atomic ErrorGroup upsert. Split out from recordEvent()
 * so it can be retried in isolation (see the E11000 handling below)
 * without re-running fingerprinting or the ErrorEvent write.
 */
async function upsertErrorGroup({ projectId, fingerprint, message, stack, now }) {
  return ErrorGroup.findOneAndUpdate(
    { projectId, fingerprint },
    {
      $set: { lastSeen: now },
      $inc: { count: 1 },
      $setOnInsert: {
        message,
        stackSample: stack,
        firstSeen: now,
        status: 'open',
        statusHistory: [],
        aiSummary: null,
      },
    },
    { upsert: true, new: true, includeResultMetadata: true }
  );
}

/**
 * Records one incoming error event: fingerprints it, atomically
 * upserts the owning ErrorGroup (creating it on first occurrence,
 * bumping count/lastSeen on every subsequent one), and writes the
 * per-occurrence ErrorEvent linked to that group.
 *
 * The ErrorGroup upsert is a single atomic findOneAndUpdate — never a
 * read-then-write — so two concurrent requests for the same new bug
 * can never create two ErrorGroups; the unique compound index on
 * { projectId, fingerprint } plus this atomic op is what guarantees
 * that. First-occurrence is detected from the upsert result's
 * `lastErrorObject.upserted`, not a separate existence check.
 *
 * Rare edge case: two truly simultaneous upserts on a brand-new
 * fingerprint can still both attempt an insert before the unique
 * index has fully settled, surfacing as a MongoDB E11000 duplicate-key
 * error on the upsert itself rather than being resolved cleanly by
 * upsert semantics. If that happens, retry the findOneAndUpdate
 * exactly once — by the second attempt the index has settled and the
 * retry resolves into a normal update of the document the other
 * request just inserted. See DECISIONS.md ("errorGroupService:
 * retry-once on duplicate-key error") for the full reasoning on why
 * once (not a loop, not left unhandled).
 *
 * message/stackSample are only ever set on insert ($setOnInsert) —
 * they're the group's one representative sample, not overwritten by
 * later occurrences. count/lastSeen update on every call regardless.
 */
async function recordEvent({ projectId, message, stack, env, metadata }) {
  const fingerprint = generateFingerprint({ message, stack });
  const now = new Date();

  let result;
  try {
    result = await upsertErrorGroup({ projectId, fingerprint, message, stack, now });
  } catch (err) {
    if (err.code === 11000) {
      // Retry exactly once — see the doc comment above and
      // DECISIONS.md for why one retry, not a loop or a silent skip.
      result = await upsertErrorGroup({ projectId, fingerprint, message, stack, now });
    } else {
      throw err;
    }
  }

  const errorGroup = result.value;
  const isNewGroup = Boolean(result.lastErrorObject && result.lastErrorObject.upserted);

  const errorEvent = await ErrorEvent.create({
    errorGroupId: errorGroup._id,
    rawStack: stack,
    env,
    metadata,
    receivedAt: now,
  });

  return { errorGroup, isNewGroup, errorEvent };
}

module.exports = { recordEvent };