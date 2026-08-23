// server/services/incidentService.js
//
// Task 41: Incident CRUD + the auto-creation/dedup-append logic
// (41.2). Two entry points into that logic exist — the spike trigger
// (ingestController, on maybeEvaluateSpike's justStartedSpiking) and
// the deployment-regression trigger (worker.js's deployment-
// correlation job, on regressionSuspected) — both call the single
// `recordTrigger` function below rather than duplicating the dedup
// check, so the two trigger paths can never drift out of sync with
// each other on what "dedup" means.

const Incident = require('../models/Incident');
const ErrorGroup = require('../models/ErrorGroup');
const Project = require('../models/Project');
const sseHub = require('../services/sseHub');
// Namespace object, not destructured — same reasoning as
// errorGroupService.js's githubService/aiService/sourceMapService
// imports (see that file's comment): tests mock this by reassigning
// the object's own method, which only works if this file calls
// through the object (incidentDiagnosisQueue.enqueueIncidentDiagnosis(...))
// rather than a destructured local that captured the reference at
// require time.
const incidentDiagnosisQueue = require('./incidentDiagnosisQueue');

// Task 40/41 DECISIONS.md: "Incident dedup window — fixed 30 min, not
// configurable" — same reasoning as Task 29's spike multiplier/floor,
// an internal tuning constant, not a product setting.
const DEDUP_WINDOW_MINUTES = 30;

// Duplicated here rather than imported from worker.js (which requires
// this module, not the other way around) — same small-enum-
// duplication precedent as groupController.js's VALID_STATUSES.
const SEVERITY_ORDER = ['low', 'medium', 'high', 'critical'];

/**
 * Derives an incident's overall severity as the highest severity among
 * its currently-affected ErrorGroups — not asked of the LLM (matches
 * Task 14's "derived server-side" principle for ErrorGroup's own
 * confidence/affectedFile/affectedFunction). Null if none of the
 * affected groups have an aiSummary yet (enrichment may still be
 * pending for a brand-new group).
 */
function deriveSeverity(groups) {
  let highest = null;
  let highestRank = -1;
  for (const g of groups) {
    const sev = g.aiSummary?.severity;
    if (!sev) continue;
    const rank = SEVERITY_ORDER.indexOf(sev);
    if (rank > highestRank) {
      highestRank = rank;
      highest = sev;
    }
  }
  return highest;
}

/**
 * Task 41.2: records one trigger (a deployment regression or a spike
 * transition) against a project, deduping into an already-open
 * incident from the last DEDUP_WINDOW_MINUTES if one exists, or
 * creating a new one. Always enqueues (or re-enqueues, on append) the
 * AI diagnosis job — see incidentDiagnosisQueue.js — and publishes an
 * SSE event (Task 41.5) either way.
 *
 * Deliberately NOT gated on any alertConfig flag (unlike Task 28/30's
 * email alerts) — an Incident is an internal record of "something
 * happened," not a notification a user opted into receiving. See
 * DECISIONS.md, "Task 41: incident triggers are not alertConfig-gated."
 *
 * @param {object} params
 * @param {string|ObjectId} params.projectId
 * @param {'deployment'|'spike'} params.triggerType
 * @param {string|ObjectId|null} params.refId - the Deployment or
 *   ErrorGroup id that triggered this, stored on `triggeredBy` only
 *   when creating a new incident (an appended trigger's own ref lives
 *   in its timeline entry instead — see the timeline `message` below).
 * @param {Array<string|ObjectId>} params.affectedGroupIds - merged
 *   (deduped) into the incident's affectedGroups array.
 * @param {string} params.title - used only when creating a new
 *   incident; an appended trigger doesn't rename an already-open one.
 * @param {string} params.timelineType - 'created' | 'deployment_regression' | 'spike_detected'
 * @param {string} params.timelineMessage
 * @param {Date} [params.now]
 */
async function recordTrigger({
  projectId,
  triggerType,
  refId,
  affectedGroupIds,
  title,
  timelineType,
  timelineMessage,
  now = new Date(),
}) {
  const dedupWindowStart = new Date(now.getTime() - DEDUP_WINDOW_MINUTES * 60 * 1000);

  // Task 41.2's literal spec: "dedup keyed on project + open status
  // within a fixed 30-min window" — matches status === 'open' only,
  // not 'investigating'. A trigger landing while an incident is
  // already being actively investigated opens a fresh incident rather
  // than silently folding into one someone is midway through
  // resolving; if that turns out to be the wrong call in practice
  // (e.g. investigating incidents splitting unnecessarily), broadening
  // this to `{ $ne: 'resolved' }` is a one-line change, not a
  // redesign.
  const existing = await Incident.findOne({
    projectId,
    status: 'open',
    createdAt: { $gte: dedupWindowStart },
  }).sort({ createdAt: -1 });

  let incident;
  if (existing) {
    // Deduped, but left as plain id values (not manually re-wrapped
    // into `new mongoose.Types.ObjectId(...)`) — Mongoose already
    // casts this array on assignment/save according to the schema's
    // `[ObjectId]` type, same as the `Incident.create({ affectedGroups:
    // affectedGroupIds })` branch below does with no manual wrapping
    // either. Re-wrapping here was redundant and, worse, fragile: it
    // required every id already be ObjectId-constructible at this
    // point in the code, a constraint the create branch never needed.
    const mergedGroupIds = Array.from(
      new Set([...existing.affectedGroups.map(String), ...affectedGroupIds.map(String)])
    );

    existing.affectedGroups = mergedGroupIds;
    existing.timeline.push({ type: timelineType, message: timelineMessage, timestamp: now });

    const groups = await ErrorGroup.find({ _id: { $in: mergedGroupIds } }).select('aiSummary.severity');
    existing.severity = deriveSeverity(groups);

    await existing.save();
    incident = existing;
  } else {
    const groups = await ErrorGroup.find({ _id: { $in: affectedGroupIds } }).select('aiSummary.severity');
    incident = await Incident.create({
      projectId,
      title,
      status: 'open',
      severity: deriveSeverity(groups),
      triggeredBy: { type: triggerType, refId: refId || null },
      affectedGroups: affectedGroupIds,
      timeline: [{ type: timelineType, message: timelineMessage, timestamp: now }],
    });
  }

  // Task 41.3: enqueue, don't call Gemini inline — same rule as Task
  // 13/25. Re-enqueued on every trigger (create or append), not just
  // creation — a newly-appended trigger (more affected groups, or a
  // second regression) is new information worth re-diagnosing against.
  incidentDiagnosisQueue.enqueueIncidentDiagnosis({ incidentId: incident._id }).catch((err) => {
    console.error(`[incidentService] failed to enqueue diagnosis for incident ${incident._id}:`, err.message);
  });

  // Task 41.5: push over the existing SSE channel — no second
  // real-time mechanism. Same fire-and-forget-with-catch pattern as
  // every other SSE publish call in this codebase.
  sseHub
    .publish(projectId, existing ? 'incident_updated' : 'incident_created', { incidentId: incident._id })
    .catch((err) => {
      console.error(`[incidentService] failed to publish SSE event for incident ${incident._id}:`, err.message);
    });

  return incident;
}

/**
 * Task 41.4: ownership-scoped listing for a project. Not cursor-
 * paginated (Task 41.4's spec names only "Task 18's pattern" for
 * ownership scoping, unlike Task 40.5 which explicitly named Task
 * 22's cursor style for deployments) — a simple bounded recent-N list,
 * same reasoning as RECENT_EVENTS_LIMIT elsewhere in this codebase:
 * incidents are expected to be rare relative to raw events, so a fixed
 * cap is enough until real usage says otherwise.
 */
const LIST_LIMIT = 50;

async function listIncidents(projectId) {
  const incidents = await Incident.find({ projectId }).sort({ createdAt: -1 }).limit(LIST_LIMIT);

  return incidents.map((i) => ({
    id: i._id,
    projectId: i.projectId,
    title: i.title,
    status: i.status,
    severity: i.severity,
    triggeredBy: i.triggeredBy,
    affectedGroupsCount: i.affectedGroups.length,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  }));
}

/**
 * Task 41.4: full incident detail. Ownership enforced with the
 * identical two-step pattern as errorGroupService.getGroupDetail —
 * fetch the incident to learn its projectId, then a scoped
 * Project.findOne({ _id, ownerId }) — see that function's doc comment
 * for the full reasoning, not re-derived here. Returns null under the
 * same not-found-or-not-yours collapse.
 */
async function getIncidentDetail({ ownerId, incidentId }) {
  const incident = await Incident.findById(incidentId);
  if (!incident) return null;

  const project = await Project.findOne({ _id: incident.projectId, ownerId });
  if (!project) return null;

  const affectedGroups = await ErrorGroup.find({ _id: { $in: incident.affectedGroups } })
    .select('message status aiSummary.severity lastSeen count');

  return {
    id: incident._id,
    projectId: incident.projectId,
    title: incident.title,
    status: incident.status,
    severity: incident.severity,
    triggeredBy: incident.triggeredBy,
    timeline: incident.timeline,
    aiSummary: incident.aiSummary,
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
    affectedGroups: affectedGroups.map((g) => ({
      id: g._id,
      message: g.message,
      status: g.status,
      severity: g.aiSummary?.severity || null,
      lastSeen: g.lastSeen,
      count: g.count,
    })),
  };
}

const VALID_STATUSES = ['open', 'investigating', 'resolved'];

/**
 * Task 41.4: PATCH /api/incidents/:id/status. Same ownership pattern
 * as getIncidentDetail above; appends a status_changed timeline entry
 * (never overwrites timeline — same append-only convention as
 * ErrorGroup.statusHistory, Task 18) and publishes the SSE update.
 */
async function updateIncidentStatus({ ownerId, incidentId, status }) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error('INVALID_STATUS');
  }

  const incident = await Incident.findById(incidentId);
  if (!incident) return null;

  const project = await Project.findOne({ _id: incident.projectId, ownerId });
  if (!project) return null;

  incident.status = status;
  incident.timeline.push({ type: 'status_changed', message: `Status changed to ${status}`, timestamp: new Date() });
  await incident.save();

  sseHub.publish(incident.projectId, 'incident_updated', { incidentId: incident._id }).catch((err) => {
    console.error(`[incidentService] failed to publish SSE event for incident ${incident._id}:`, err.message);
  });

  return {
    id: incident._id,
    projectId: incident.projectId,
    status: incident.status,
    timeline: incident.timeline,
  };
}

module.exports = {
  recordTrigger,
  listIncidents,
  getIncidentDetail,
  updateIncidentStatus,
  DEDUP_WINDOW_MINUTES,
};
