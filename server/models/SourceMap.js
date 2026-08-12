const mongoose = require('mongoose');

const sourceMapSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'projectId is required'],
      index: true,
    },
    filename: {
      type: String,
      required: [true, 'filename is required'],
      trim: true,
    },
    release: {
      type: String,
      trim: true,
      default: null,
    },
    map: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'map is required'],
    },
    uploadedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    // No Mongoose timestamps needed — uploadedAt already tracks creation.
  }
);

// Compound unique index — guarantees only one source map per filename/release combination per project.
sourceMapSchema.index({ projectId: 1, release: 1, filename: 1 }, { unique: true });

module.exports = mongoose.model('SourceMap', sourceMapSchema);
