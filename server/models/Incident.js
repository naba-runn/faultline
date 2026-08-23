// server/models/Incident.js
//
// Task 41.1: auto-created (or manually opened) record tying together
// a deployment regression (Task 40) or an error spike (Task 29) with
// the ErrorGroups it affects, a running timeline, and an AI-generated
// hypothesis. Deliberately its own collection, not folded into
// Deployment or ErrorGroup — an incident can span multiple affected
// groups and, via the dedup window (Task 41.2), multiple triggers
// over time, which neither of those per-resource documents can
// represent on their own.

const mongoose = require('mongoose');

const timelineEntrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'created', // the triggering event that opened the incident
        'deployment_regression', // a later deployment-regression trigger appended to an already-open incident
        'spike_detected', // a later spike trigger appended to an already-open incident
        'status_changed',
        'ai_diagnosis',
        'note', // reserved for a future manual-note feature; not written by any code yet
      ],
      required: true,
    },
    message: { type: String, required: true },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const incidentSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'projectId is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'title is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved'],
      default: 'open',
    },
    // Derived from affectedGroups' aiSummary.severity (the highest
    // among them) whenever a group is added — not asked of the LLM,
    // same "derived server-side" principle as ErrorGroup.aiSummary's
    // own confidence/affectedFile/affectedFunction fields (Task 14).
    // Null until at least one affected group has a severity to derive
    // from (a group's own AI enrichment may still be pending).
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: null,
    },
    // Task 41.1's spec: "triggeredBy (deployment ref | spike ref |
    // manual)" — modeled as one discriminated {type, refId} pair
    // rather than two separate optional ref fields, so a caller never
    // has to reason about which of two fields is meaningful for a
    // given incident. This is the ORIGINATING trigger only (what
    // first opened the incident) — later triggers that dedup into
    // this same incident are recorded in `timeline`, not here.
    triggeredBy: {
      type: {
        type: String,
        enum: ['deployment', 'spike', 'manual'],
        required: true,
      },
      refId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
      },
    },
    affectedGroups: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ErrorGroup' }],
      default: [],
    },
    timeline: {
      type: [timelineEntrySchema],
      default: [],
    },
    // One-paragraph hypothesis text (Task 41.3's spec) — a plain
    // string, not the structured { rootCause, severity, suggestedFix }
    // shape ErrorGroup.aiSummary uses. An incident's AI diagnosis
    // answers a different question ("what's the likely connection
    // between these events") than a single error group's enrichment
    // does, so reusing that exact schema would force an artificial
    // fit. Null until the (delayed, queued — see
    // services/incidentDiagnosisQueue.js) diagnosis job completes.
    aiSummary: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

// Powers Task 41.2's dedup lookup (find an open incident for this
// project, most recent first, to check against the 30-min window) and
// Task 41.4's listing endpoint — same compound-index-covers-both-
// access-patterns reasoning as Deployment's own index.
incidentSchema.index({ projectId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Incident', incidentSchema);
