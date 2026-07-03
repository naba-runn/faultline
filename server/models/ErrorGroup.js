// server/models/ErrorGroup.js

const mongoose = require('mongoose');

const aiSummarySchema = new mongoose.Schema(
  {
    rootCause: { type: String },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
    },
    suggestedFix: [{ type: String }],
    // Written by the server based on whether the GitHub file fetch
    // succeeded — never taken from the LLM's own self-reported
    // confidence. See DECISIONS.md (locked in for Task 13/14).
    confidence: { type: Number, min: 0, max: 1 },
    affectedFile: { type: String },
    affectedFunction: { type: String },
  },
  { _id: false } // embedded, not a separate collection — no need for its own _id
);

const statusHistoryEntrySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['open', 'resolved', 'ignored'],
      required: true,
    },
    changedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const errorGroupSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'projectId is required'],
      index: true,
    },
    fingerprint: {
      type: String,
      required: [true, 'fingerprint is required'],
    },
    message: {
      type: String,
      required: [true, 'message is required'],
    },
    stackSample: {
      type: String,
      required: [true, 'stackSample is required'],
    },
    status: {
      type: String,
      enum: ['open', 'resolved', 'ignored'],
      default: 'open',
    },
    // Appended to, never overwritten, on every status PATCH (Task 18).
    // This is the data source for later "resolved vs. reopened"
    // analysis — see DATABASE.md's locked-in design decisions.
    statusHistory: {
      type: [statusHistoryEntrySchema],
      default: [],
    },
    aiSummary: {
      type: aiSummarySchema,
      default: null,
    },
    count: {
      type: Number,
      default: 1,
    },
    firstSeen: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastSeen: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    // Deliberately no { timestamps: true } here. firstSeen/lastSeen
    // already cover createdAt/updatedAt's role, but with dedup-specific
    // semantics: lastSeen bumps on every duplicate event (via $set in
    // the Task 9.3 upsert), not just on document field edits. Adding
    // Mongoose's own updatedAt alongside would be redundant and could
    // drift out of sync with what lastSeen is actually tracking.
    // See DECISIONS.md.
  }
);

// Compound unique index — the core of dedup. Task 9.3's atomic
// findOneAndUpdate(..., { upsert: true }) keyed on
// { projectId, fingerprint } relies on this to guarantee no two
// documents for the same bug in the same project can ever exist,
// even under concurrent writes at the same millisecond.
errorGroupSchema.index({ projectId: 1, fingerprint: 1 }, { unique: true });

module.exports = mongoose.model('ErrorGroup', errorGroupSchema);