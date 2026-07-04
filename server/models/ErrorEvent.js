// server/models/ErrorEvent.js

const mongoose = require('mongoose');

const errorEventSchema = new mongoose.Schema(
  {
    errorGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ErrorGroup',
      required: [true, 'errorGroupId is required'],
      index: true,
    },
    // The occurrence's own raw stack, as received — distinct from
    // ErrorGroup.stackSample, which stores one representative sample
    // for the whole group. Kept un-normalized here; normalization is
    // fingerprintService's job at ingest time, not something this
    // model redoes.
    rawStack: {
      type: String,
      required: [true, 'rawStack is required'],
    },
    // Accepted but unvalidated per API.md ("env and metadata are
    // accepted but currently unused") — no enum locked in anywhere,
    // so none is invented here. Free-form caller-supplied label
    // (e.g. "production", "staging").
    env: {
      type: String,
      trim: true,
      default: null,
      maxlength: 50,
    },
    // Free-form, caller-supplied context (e.g. { userId: "abc123" }).
    // Stored as-is; no shape enforced, matching env above.
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    receivedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    // Deliberately no { timestamps: true } — receivedAt already covers
    // that role for a per-occurrence record, same reasoning as
    // ErrorGroup's firstSeen/lastSeen. Adding Mongoose's own createdAt
    // alongside would be a redundant, always-identical field.
  }
);

// Index for timeline queries: recent events per group, most recent
// first. Powers the "recent events per group" query pattern behind
// the Dashboard's Error Detail View.
errorEventSchema.index({ errorGroupId: 1, receivedAt: -1 });

module.exports = mongoose.model('ErrorEvent', errorEventSchema);