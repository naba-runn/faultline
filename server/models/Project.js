const mongoose = require('mongoose');

// Task 28.1: per-project alert configuration. Embedded, not a
// separate collection — this is 1:1 with Project and never queried
// independently, same reasoning as ErrorGroup's aiSummarySchema.
// Two independent triggers, matching Task 28's two distinct firing
// points (see DECISIONS.md's "Task 28" entry): newGroup fires
// synchronously at ingestion; severityThreshold can only fire later,
// once the async AI enrichment worker (Task 25) writes
// ErrorGroup.aiSummary.severity — there is no severity to compare
// against at ingestion time.
const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'];

const alertConfigSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      trim: true,
      default: null,
    },
    newGroup: {
      type: Boolean,
      default: false,
    },
    severityThreshold: {
      enabled: {
        type: Boolean,
        default: false,
      },
      // Minimum severity (inclusive) that fires this trigger, compared
      // against SEVERITY_LEVELS' ordering below — not a Mongoose enum
      // ordering guarantee, so services/alertService.js (28.2) is what
      // actually does the >= comparison.
      minSeverity: {
        type: String,
        enum: SEVERITY_LEVELS,
        default: 'high',
      },
    },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'ownerId is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: [100, 'Project name cannot exceed 100 characters'],
    },
    apiKeyHash: {
      type: String,
      required: [true, 'apiKeyHash is required'],
      unique: true,
    },
    githubRepo: {
      type: String,
      trim: true,
      default: null,
      match: [
        /^[\w.-]+\/[\w.-]+$/,
        'githubRepo must be in "owner/repo" form',
      ],
    },
    // Task 28.1: defaults to everything off / no recipient — alerting
    // is opt-in per project, not on by default for existing projects
    // created before this task.
    alertConfig: {
      type: alertConfigSchema,
      default: () => ({}),
    },
  },
  {
    // Unlike User (createdAt only), Project also tracks updatedAt —
    // needed because Update is part of this task's CRUD scope (5.4).
    // See DECISIONS.md.
    timestamps: { createdAt: true, updatedAt: true },
  }
);

module.exports = mongoose.model('Project', projectSchema);