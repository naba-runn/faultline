const mongoose = require('mongoose');
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
const trendService = require('./trendService');

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
 * "new error group" enrichment path.
 *
 * Task 25 changed this function's error contract — read this before
 * changing it again. It used to be called fire-and-forget directly
 * from the request/response cycle and had to swallow every failure
 * itself, since there was nowhere to send one. It is now called from
 * worker.js's BullMQ job processor instead, and the opposite is true:
 * BullMQ's retry/backoff (see enrichmentQueue.js's JOB_OPTIONS) only
 * works if failures are thrown, not swallowed. So:
 *
 *   - A thrown error here (Gemini API failure, a transient Mongo write
 *     failure on the final save) propagates out to the worker, which
 *     is exactly what triggers a retry. This is the RETRYABLE case —
 *     the same input might succeed on a later attempt because the
 *     failure was about the network/service being unavailable, not
 *     about what came back.
 *   - `githubService.fetchCodeSnippet` never throws by its own
 *     documented contract (best-effort — returns null on any failure,
 *     see githubService.js) — grounding failing just means falling
 *     back to ungrounded enrichment, not a job failure.
 *   - A Gemini response that comes back but fails
 *     `aiService.parseAndValidate` (`parsed === null`, below) is
 *     deliberately NOT thrown/retried — retrying the identical prompt
 *     against the identical input is very unlikely to produce a
 *     different, valid result, so retrying would just burn Gemini API
 *     quota three times for the same outcome. This stays a terminal
 *     "log a warning, leave aiSummary null" case, exactly like before
 *     Task 25.
 *
 * Task 14 adds confidence/affectedFile/affectedFunction on top of
 * Task 13's rootCause/severity/suggestedFix — all three derived
 * server-side from data this function already has, never asked of
 * the LLM (AI_CONTEXT.md's "Fields Derived Server-Side, Not From the
 * LLM"). See DECISIONS.md for the exact confidence values chosen.
 */
async function enrichErrorGroup({ errorGroup, project, message, stack }) {
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
    // Terminal, not retryable — see the doc comment above for why.
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

  // Errors thrown here (e.g. a transient Mongo write failure) are
  // deliberately NOT caught — they propagate out to the worker's job
  // processor, which is what makes them retryable. See the doc
  // comment above.
  await ErrorGroup.findByIdAndUpdate(errorGroup._id, { $set: { aiSummary } });
}

// Task 22 pagination defaults/caps. DEFAULT_PAGE_SIZE is what applies
// when the caller passes no `limit` at all — see the Known Open
// Issues note in STATUS.md: the current frontend doesn't send
// cursor/limit or read nextCursor back, so any project with more than
// DEFAULT_PAGE_SIZE groups will only surface the first page in the UI
// until the client is updated to paginate. That's a real, currently-
// open consequence of this task being backend-only, not an oversight.
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Encodes a cursor from a group's sort-key fields. Opaque to the
 * caller by design (base64 JSON) — callers must treat it as a token,
 * not construct or inspect one themselves.
 */
function encodeCursor(group) {
  return Buffer.from(
    JSON.stringify({ lastSeen: group.lastSeen.toISOString(), id: String(group._id) })
  ).toString('base64');
}

/**
 * Decodes and shape-validates a cursor token. Throws a plain Error
 * (not AppError — this is a service, which never touches req/res per
 * PROJECT_RULES.md §5) with a recognizable message the controller
 * translates into a 400.
 */
function decodeCursor(cursor) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  } catch (err) {
    throw new Error('INVALID_CURSOR');
  }

  const lastSeen = new Date(parsed && parsed.lastSeen);
  if (!parsed || Number.isNaN(lastSeen.getTime()) || typeof parsed.id !== 'string') {
    throw new Error('INVALID_CURSOR');
  }

  return { lastSeen, id: parsed.id };
}

/**
 * Lists ErrorGroups for a project, most recently seen first, cursor-
 * paginated (Task 22). Ownership is NOT checked here — the caller
 * (controller) is responsible for verifying the requesting user owns
 * the project first (via projectService.getProject), same separation
 * of concerns projectController already uses. Shaped to a plain
 * object per group, same reasoning as projectService's shaping (never
 * return raw Mongoose docs) — stackSample is deliberately omitted
 * here since the table view (Task 17) doesn't need it; the full
 * document is what Task 19's ErrorGroupDetail fetches via
 * getGroupDetail/GET /api/groups/:id, below.
 *
 * Sorted on { lastSeen: -1, _id: -1 }, not lastSeen alone — two groups
 * can legitimately share the same lastSeen millisecond (e.g. two
 * distinct errors deduped/updated in the same upsert batch), and a
 * cursor built on a non-unique sort key can skip or repeat rows across
 * pages. `_id` is guaranteed unique and monotonically ordered by
 * insertion, so it's a correct tie-breaker.
 */
async function listErrorGroups(projectId, { limit, cursor } = {}) {
  let pageSize = DEFAULT_PAGE_SIZE;
  if (limit !== undefined) {
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      throw new Error('INVALID_LIMIT');
    }
    pageSize = Math.min(parsedLimit, MAX_PAGE_SIZE);
  }

  const filter = { projectId };

  if (cursor !== undefined) {
    const { lastSeen, id } = decodeCursor(cursor);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error('INVALID_CURSOR');
    }
    // Strictly-less-than on the compound key, matching the -1/-1 sort
    // order: everything "after" the cursor in that same descending
    // order.
    filter.$or = [
      { lastSeen: { $lt: lastSeen } },
      { lastSeen: lastSeen, _id: { $lt: id } },
    ];
  }

  // Fetch one extra row to detect "is there a next page" without a
  // separate count query.
  const groups = await ErrorGroup.find(filter)
    .sort({ lastSeen: -1, _id: -1 })
    .limit(pageSize + 1);

  const hasMore = groups.length > pageSize;
  const page = hasMore ? groups.slice(0, pageSize) : groups;

  return {
    groups: page.map((group) => ({
      id: group._id,
      message: group.message,
      status: group.status,
      count: group.count,
      firstSeen: group.firstSeen,
      lastSeen: group.lastSeen,
      aiSummary: group.aiSummary
        ? { severity: group.aiSummary.severity, rootCause: group.aiSummary.rootCause }
        : null,
    })),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  };
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
    projectId: group.projectId,
    status: group.status,
    statusHistory: group.statusHistory,
  };
}

// Task 19: bound on how many recent ErrorEvents are fetched for the
// ErrorGroupDetail page's event list + sparkline. This is a fixed
// recent-window cap, not real pagination (Task 22's cursor pagination
// covers the groups list only, never events) — it matches the
// existing { errorGroupId: 1, receivedAt: -1 } index's "recent events
// per group" access pattern. If a group has more occurrences than
// this, older ones simply aren't shown; there's no UI affordance to
// page further back yet. See DECISIONS.md, "Task 19: GET
// /api/groups/:id returns group + events combined."
const RECENT_EVENTS_LIMIT = 50;

// Task 29.2: bound on how many ErrorEvent timestamps are fetched
// within trendService's ~25h relevant window (baseline window +
// current in-progress hour) to feed computeTrend. This is a separate
// cap from RECENT_EVENTS_LIMIT above — that one bounds the page's
// display list, this one bounds a time-range query that could
// otherwise return an unbounded number of rows for a genuinely
// hot/spiking group in a 25h window. Sorted most-recent-first before
// capping, so a truncated sample still skews toward the most relevant
// (current-hour) end rather than an arbitrary storage-order slice.
// Known, deliberate limitation: a group with more than this many
// events in 25h will have its baseline *undercounted* (rate reported
// lower than reality) once truncation kicks in — acceptable for a
// portfolio-grade MVP's demo/manual-test volumes, not something a
// production system would leave uncounted. See DECISIONS.md.
const TREND_EVENT_QUERY_CAP = 5000;

/**
 * Task 29.2/30 shared helper: computes trendService's baseline/spike
 * result for one group, from its own separate, time-bounded
 * `ErrorEvent` query — never `getGroupDetail`'s `events` list, which
 * is capped at RECENT_EVENTS_LIMIT with no time bound and can be far
 * narrower than 24h for a busy group. Used by both getGroupDetail
 * (29.2's on-demand badge) and maybeEvaluateSpike (30's alert
 * trigger) — kept as one function rather than two near-identical
 * query blocks so they can never quietly drift out of sync with each
 * other.
 *
 * `group.firstSeen` is passed as trendService's earliestKnownTimestamp
 * — already known with no extra query, and the only way the
 * insufficient-history check can see past the bounded query's own
 * window start (which, by construction, never includes anything older
 * than that).
 */
async function computeGroupTrend(group, now = new Date()) {
  const { baselineWindowStart } = trendService.getWindowBounds(now);
  const trendEvents = await ErrorEvent.find(
    { errorGroupId: group._id, receivedAt: { $gte: baselineWindowStart } },
    { receivedAt: 1, _id: 0 }
  )
    .sort({ receivedAt: -1 })
    .limit(TREND_EVENT_QUERY_CAP);

  return trendService.computeTrend(
    trendEvents.map((e) => e.receivedAt),
    { now, earliestKnownTimestamp: group.firstSeen }
  );
}

// Task 30: gates how often maybeEvaluateSpike actually pays for
// computeGroupTrend's query, independent of event volume — without
// this, a genuinely hot/spiking group (the exact case this feature
// cares about) would run the query on every single duplicate event,
// concentrating the most expensive check exactly on the busiest
// path. See DECISIONS.md's "Task 30" entry for the full option
// comparison (a scheduled/polling job and Redis-based live counters
// were both considered and rejected in favor of this simpler,
// consistent-with-Task-28's-existing-triggers approach).
//
// Originally 60s; reduced to 10s after a real manual-test failure: a
// fast click-burst can exhaust its ONE check opportunity within the
// first cooldown window, at a moment when too few events have
// accumulated yet to cross the floor — every later click in that same
// burst then gets silently skipped by the cooldown, even as the real
// count climbs past the threshold in the database. 10s still bounds a
// genuinely hot group to at most 6 background queries/minute (the
// actual cost concern), while being short enough that a realistic
// click-burst — which naturally spans well over 10s from click/network
// latency alone — gets more than one look.
const SPIKE_CHECK_COOLDOWN_MS = 10 * 1000;

/**
 * Task 30: re-evaluates one group's spike status (via
 * computeGroupTrend) and updates its persisted isSpiking/
 * trendLastCheckedAt state, returning whether THIS call is the one
 * that caused a genuine false->true transition — the only condition
 * under which an alert should fire. Callers are responsible for the
 * alertConfig.spikeDetection.enabled gate (this function has no
 * opinion on whether alerting is turned on, same division of
 * responsibility as alertQueue.js's enqueue* functions) and for
 * actually enqueuing the alert job.
 *
 * Concurrency: when the trend check says "spiking," the state flip
 * uses an atomic `findOneAndUpdate({ isSpiking: { $ne: true } })`
 * rather than a read-then-write — MongoDB guarantees only one
 * concurrent call against the same document can match and perform
 * that update, so two near-simultaneous events for the same group
 * crossing the threshold around the same moment can never both
 * report `justStartedSpiking: true` and double-alert. Recovery
 * (true -> false) and "still spiking, no transition" both update
 * state silently — per the user's own confirmed decision, recovery
 * never sends a notification (matches new-group/severity-threshold's
 * one-shot-per-transition pattern; see DECISIONS.md).
 *
 * @param {object} errorGroup - a full ErrorGroup Mongoose document
 *   (needs _id, firstSeen, isSpiking, trendLastCheckedAt).
 * @param {Date|number} [now] - reference "current" time, same
 *   injectable-for-tests convention as computeGroupTrend/computeTrend.
 *   Defaults to `Date.now()`.
 * @returns {Promise<{ justStartedSpiking: boolean }>}
 */
async function maybeEvaluateSpike(errorGroup, now = new Date()) {
  if (
    errorGroup.trendLastCheckedAt &&
    now - errorGroup.trendLastCheckedAt < SPIKE_CHECK_COOLDOWN_MS
  ) {
    return { justStartedSpiking: false };
  }

  const trend = await computeGroupTrend(errorGroup, now);
  // trend.isSpiking is only ever true when trend.status === 'ok' (see
  // trendService.computeTrend's own contract) — no separate status
  // check needed here.
  const newIsSpiking = trend.isSpiking;

  if (!newIsSpiking) {
    // Covers both genuinely-normal and insufficient-history cases —
    // recovery is silent by design (see doc comment above).
    await ErrorGroup.updateOne(
      { _id: errorGroup._id },
      { $set: { isSpiking: false, trendLastCheckedAt: now } }
    );
    return { justStartedSpiking: false };
  }

  const transitioned = await ErrorGroup.findOneAndUpdate(
    { _id: errorGroup._id, isSpiking: { $ne: true } },
    { $set: { isSpiking: true, trendLastCheckedAt: now } }
  );

  if (transitioned) {
    return { justStartedSpiking: true };
  }

  // Already spiking — no transition, no alert, but this call already
  // paid for the query, so still worth refreshing the cooldown clock.
  await ErrorGroup.updateOne({ _id: errorGroup._id }, { $set: { trendLastCheckedAt: now } });
  return { justStartedSpiking: false };
}

/**
 * Fetches the full ErrorGroup document plus its most recent
 * ErrorEvents, for Task 19's ErrorGroupDetail page. Ownership is
 * enforced with the identical two-step pattern as
 * updateGroupStatus — fetch the group to learn its projectId, then a
 * scoped Project.findOne({ _id, ownerId }) — see that function's doc
 * comment and DECISIONS.md's "Task 18" entry for the full reasoning;
 * not re-derived here.
 *
 * Unlike listErrorGroups' deliberately trimmed shape (severity +
 * rootCause only), this returns the FULL aiSummary — this is the one
 * place in the app that needs suggestedFix/confidence/affectedFile/
 * affectedFunction (see DECISIONS.md's "Task 17" entry, which reserved
 * those fields for this endpoint). projectId is included so the
 * client can link back to the owning project without a second GET.
 *
 * A single combined { group, events } response, not two separate
 * endpoints — see DECISIONS.md, "Task 19" for why this differs from
 * the Project/its-groups split.
 *
 * Returns null under the same not-found-or-not-yours collapse used
 * throughout when the group doesn't exist or isn't owned by ownerId.
 */
async function getGroupDetail({ ownerId, groupId }) {
  const group = await ErrorGroup.findById(groupId);
  if (!group) return null;

  const project = await Project.findOne({ _id: group.projectId, ownerId });
  if (!project) return null;

  const events = await ErrorEvent.find({ errorGroupId: group._id })
    .sort({ receivedAt: -1 })
    .limit(RECENT_EVENTS_LIMIT);

  const trend = await computeGroupTrend(group);

  return {
    group: {
      id: group._id,
      projectId: group.projectId,
      message: group.message,
      stackSample: group.stackSample,
      status: group.status,
      statusHistory: group.statusHistory,
      aiSummary: group.aiSummary,
      count: group.count,
      firstSeen: group.firstSeen,
      lastSeen: group.lastSeen,
    },
    events: events.map((event) => ({
      id: event._id,
      receivedAt: event.receivedAt,
      env: event.env,
    })),
    trend: {
      status: trend.status,
      isSpiking: trend.isSpiking,
      currentHourCount: trend.currentHourCount,
      baselineHourlyRate: trend.baselineHourlyRate,
    },
  };
}

module.exports = {
  recordEvent,
  enrichErrorGroup,
  listErrorGroups,
  updateGroupStatus,
  getGroupDetail,
  computeGroupTrend,
  maybeEvaluateSpike,
};