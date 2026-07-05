const ErrorGroup = require('../models/ErrorGroup');
const ErrorEvent = require('../models/ErrorEvent');
const Project = require('../models/Project');
const { generateFingerprint } = require('./fingerprintService');
const { normalizeStack } = require('../utils/stackNormalizer');
// Required as namespace objects, not destructured — same reasoning as
// ErrorGroup/ErrorEvent above: tests mock these by reassigning the
// object's own methods, which only works if this file calls through
// the object (githubService.fetchCodeSnippet(...)) rather than a
// destructured local that captured the reference at require time.
const githubService = require('./githubService');
const aiService = require('./aiService');

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

// Task 14: confidence is binary based on whether the GitHub snippet
// was actually included in the prompt (grounded) or not (stack-trace-
// only) — not a continuous score computed from anything more granular.
// See DECISIONS.md, "Task 14: confidence values and
// affectedFile/affectedFunction source" for why these two values.
const GROUNDED_CONFIDENCE = 0.8;
const UNGROUNDED_CONFIDENCE = 0.4;

/**
 * Task 13: wires aiService + githubService together for the
 * "new error group" enrichment path. Called fire-and-forget from
 * ingestController — never awaited inside the request/response cycle
 * (AI_CONTEXT.md's Dispatch Model) — so this function must never
 * throw out to its caller; every failure mode is caught and logged
 * here instead, leaving `aiSummary: null` on the group untouched.
 *
 * Task 14 adds confidence/affectedFile/affectedFunction on top of
 * Task 13's rootCause/severity/suggestedFix — all three derived
 * server-side from data this function already has, never asked of
 * the LLM (AI_CONTEXT.md's "Fields Derived Server-Side, Not From the
 * LLM"). See DECISIONS.md for the exact confidence values chosen.
 */
async function enrichErrorGroup({ errorGroup, project, message, stack }) {
  try {
    const { frames } = normalizeStack(stack);
    const topFrame = frames[0] || null;

    let codeSnippet = null;
    if (project && project.githubRepo && topFrame) {
      codeSnippet = await githubService.fetchCodeSnippet({
        githubRepo: project.githubRepo,
        filePath: topFrame.file,
        line: topFrame.line,
      });
    }

    const prompt = aiService.buildPrompt({ message, stack, codeSnippet });
    const rawResponse = await aiService.callGemini(prompt);
    const parsed = aiService.parseAndValidate(rawResponse);

    if (!parsed) {
      console.warn(
        `[errorGroupService] AI enrichment returned no valid summary for group ${errorGroup._id} — leaving aiSummary null`
      );
      return;
    }

    const aiSummary = {
      ...parsed,
      // Higher when the model actually saw real source (grounded),
      // lower when it only had the error message + stack to go on.
      // Never the LLM's own self-reported confidence — see
      // AI_CONTEXT.md and DECISIONS.md's "Task 14: confidence values
      // and affectedFile/affectedFunction source" entry.
      confidence: codeSnippet ? GROUNDED_CONFIDENCE : UNGROUNDED_CONFIDENCE,
      affectedFile: topFrame ? topFrame.file : null,
      affectedFunction: topFrame ? topFrame.functionName : null,
    };

    await ErrorGroup.findByIdAndUpdate(errorGroup._id, { $set: { aiSummary } });
  } catch (err) {
    // Enrichment must never break ingestion — by the time this runs,
    // the 202 has already been sent. Log and stop; aiSummary stays
    // null on the group, same as the parseAndValidate-failure case.
    console.error(
      `[errorGroupService] AI enrichment failed for group ${errorGroup._id}:`,
      err.message
    );
  }
}

/**
 * Lists all ErrorGroups for a project, most recently seen first.
 * Ownership is NOT checked here — the caller (controller) is
 * responsible for verifying the requesting user owns the project
 * first (via projectService.getProject), same separation of concerns
 * projectController already uses. Shaped to a plain object per group,
 * same reasoning as projectService's shaping (never return raw
 * Mongoose docs) — stackSample is deliberately omitted here since the
 * table view (Task 17) doesn't need it; the full document is what
 * Task 19's ErrorGroupDetail will fetch via the (not yet built)
 * GET /api/groups/:id.
 */
async function listErrorGroups(projectId) {
  const groups = await ErrorGroup.find({ projectId }).sort({ lastSeen: -1 });

  return groups.map((group) => ({
    id: group._id,
    message: group.message,
    status: group.status,
    count: group.count,
    firstSeen: group.firstSeen,
    lastSeen: group.lastSeen,
    aiSummary: group.aiSummary
      ? { severity: group.aiSummary.severity, rootCause: group.aiSummary.rootCause }
      : null,
  }));
}

/**
 * Updates an ErrorGroup's status (Task 18), scoped to the project's
 * owner, and appends a `statusHistory` entry — never overwrites it
 * (see DATABASE.md's locked design, DECISIONS.md for the "why").
 * Deliberately never touches `lastSeen` — that field's semantics are
 * dedup-specific (bumps only on a duplicate *event*), and a status
 * change is an unrelated edit (see DECISIONS.md's
 * "ErrorGroup uses firstSeen/lastSeen instead of Mongoose timestamps").
 *
 * Ownership check: `ErrorGroup` doesn't carry `ownerId` directly (its
 * dedup key is `{ projectId, fingerprint }`, not tied to a user), so
 * this can't be a single ownership-scoped query on ErrorGroup itself
 * the way `projectService.getProject` scopes directly on Project.
 * Instead: fetch the group to learn its `projectId`, then make the
 * actual authorization decision via a scoped `Project.findOne({ _id,
 * ownerId })` — the same query shape used everywhere else in this
 * codebase — rather than fetching the project unscoped and comparing
 * `ownerId` in application code. See DECISIONS.md, "Task 18:
 * ownership check for group status updates" for the full reasoning.
 *
 * Returns null under the same not-found-or-not-yours collapse used
 * throughout (group doesn't exist, or its project isn't owned by
 * `ownerId`) — the caller (controller) maps this to a single 404.
 */
async function updateGroupStatus({ ownerId, groupId, status }) {
  const group = await ErrorGroup.findById(groupId);
  if (!group) return null;

  const project = await Project.findOne({ _id: group.projectId, ownerId });
  if (!project) return null;

  group.status = status;
  group.statusHistory.push({ status, changedAt: new Date() });
  await group.save();

  return {
    id: group._id,
    status: group.status,
    statusHistory: group.statusHistory,
  };
}

module.exports = { recordEvent, enrichErrorGroup, listErrorGroups, updateGroupStatus };