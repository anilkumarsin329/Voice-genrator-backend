const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    verse: { type: mongoose.Schema.Types.ObjectId, ref: 'Verse', required: true },
    label: String,
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed', 'skipped'], default: 'pending' },
    audio: { type: mongoose.Schema.Types.ObjectId, ref: 'Audio', default: null },
    error: { type: String, default: '' },
  },
  { _id: false }
);

const bulkJobSchema = new mongoose.Schema(
  {
    kanda: { type: mongoose.Schema.Types.ObjectId, ref: 'Kanda' },
    sargaNumber: { type: Number, default: null },
    language: String,
    voiceId: String,
    voiceName: String,
    modelId: String,
    speed: Number,
    stability: Number,
    similarityBoost: Number,
    items: [itemSchema],
    status: { type: String, enum: ['running', 'completed', 'completed_with_errors', 'interrupted'], default: 'running' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true, collection: 'voicegen_bulkjobs' }
);

module.exports = mongoose.model('BulkJob', bulkJobSchema);
