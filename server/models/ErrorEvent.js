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
    // Task 31: now actively used — surfaced on the group detail page's
    // events table and aggregated into a per-group `environments`
    // array. Still free-form, no enum — callers can send whatever
    // label they use (e.g. "production", "staging", "canary").
    env: {
      type: String,
      trim: true,
      default: null,
      maxlength: 50,
    },
    // Task 31: free-form build/version tag (e.g. "v1.4.2", "abc123",
    // "2026.08.13"). `env` answers "which deployment," `release`
    // answers "which build." Same constraints as env — no enum, no
    // validation beyond maxlength. Surfaced per-event in the group
    // detail page and, via ErrorGroup.firstSeenRelease, as "introduced
    // in vX.Y.Z" on new groups.
    release: {
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