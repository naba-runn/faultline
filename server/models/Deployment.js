// server/models/Deployment.js
//
// Task 40.1: one document per deployment event, either received via
// GitHub's deployment_status webhook or created manually (e.g. for
// testing without a real deploying repo — see Task 40.6's manual
// test notes). Correlation fields (below/count/rate/regressionSuspected)
// are computed once by deploymentCorrelationQueue.js's delayed job and
// stored here, never recomputed on read — see Task 40.4 and
// services/deploymentCorrelationService.js.

const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'projectId is required'],
      index: true,
    },
    sha: {
      type: String,
      required: [true, 'sha is required'],
      trim: true,
    },
    ref: {
      type: String,
      trim: true,
      default: null,
    },
    deployedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    source: {
      type: String,
      enum: ['github-webhook', 'manual'],
      required: true,
    },
    // Task 40.3/40.4: populated once the correlation job runs (delayed
    // until the "after" window has actually elapsed — see
    // deploymentCorrelationQueue.js). Null/pending until then, not a
    // zero — a genuinely-zero-events-after-deploy result is a real,
    // different fact from "not computed yet."
    correlation: {
      status: {
        type: String,
        enum: ['pending', 'computed'],
        default: 'pending',
      },
      windowMinutes: { type: Number, default: null },
      beforeCount: { type: Number, default: null },
      afterCount: { type: Number, default: null },
      beforeRate: { type: Number, default: null }, // events/minute
      afterRate: { type: Number, default: null }, // events/minute
      regressionSuspected: { type: Boolean, default: false },
      computedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Compound index on (projectId, deployedAt) — Task 40.1's spec.
// Powers both the ownership-scoped, cursor-paginated listing
// (GET /api/projects/:id/deployments, most-recent-first) and the
// dashboard overview's cross-project "recent deployments" query
// (overviewService.js), same access pattern as ErrorGroup's
// { projectId, lastSeen } sort.
deploymentSchema.index({ projectId: 1, deployedAt: -1 });

module.exports = mongoose.model('Deployment', deploymentSchema);
