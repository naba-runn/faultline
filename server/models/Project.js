const mongoose = require('mongoose');

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
  },
  {
    // Unlike User (createdAt only), Project also tracks updatedAt —
    // needed because Update is part of this task's CRUD scope (5.4).
    // See DECISIONS.md.
    timestamps: { createdAt: true, updatedAt: true },
  }
);

module.exports = mongoose.model('Project', projectSchema);