const mongoose = require('mongoose');
const { LANGUAGES } = require('../utils/constants');

const audioSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    language: { type: String, enum: LANGUAGES, required: true, index: true },
    text: { type: String, required: true },
    voiceId: { type: String, required: true },
    voiceName: { type: String, default: '' },
    voiceStyle: { type: String, default: '' },
    modelId: { type: String, required: true },
    speed: { type: Number, default: 1 },
    stability: { type: Number, default: 0.5 },
    similarityBoost: { type: Number, default: 0.75 },
    s3Key: { type: String, default: null },
    duration: { type: Number, default: 0 }, // seconds
    fileSize: { type: Number, default: 0 }, // bytes
    format: { type: String, default: 'mp3' },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing', index: true },
    errorMessage: { type: String, default: '' },
    saved: { type: Boolean, default: false, index: true }, // false = draft preview, true = in library
    contentHash: { type: String, index: true }, // duplicate protection
    // Links into the platform's existing Ramayana data (ramayanas / ramayanaverses)
    kanda: { type: mongoose.Schema.Types.ObjectId, ref: 'Kanda', default: null, index: true },
    sargaNumber: { type: Number, default: null },
    verse: { type: mongoose.Schema.Types.ObjectId, ref: 'Verse', default: null, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  { timestamps: true, collection: 'voicegen_audios' }
);

audioSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Audio', audioSchema);
