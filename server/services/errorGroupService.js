const ErrorGroup = require('../models/ErrorGroup');
const ErrorEvent = require('../models/ErrorEvent');
const { generateFingerprint } = require('./fingerprintService');

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
 * message/stackSample are only ever set on insert ($setOnInsert) —
 * they're the group's one representative sample, not overwritten by
 * later occurrences. count/lastSeen update on every call regardless.
 */
async function recordEvent({ projectId, message, stack, env, metadata }) {
  const fingerprint = generateFingerprint({ message, stack });
  const now = new Date();

  const result = await ErrorGroup.findOneAndUpdate(
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