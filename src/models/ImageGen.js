const mongoose = require('mongoose');

// One turn of a chat: the admin's request + the resulting image (stored in S3, never in Mongo).
const imageGenSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'ImageChat', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    prompt: { type: String, required: true, maxlength: 2000 }, // what the admin typed
    mode: { type: String, enum: ['generate', 'edit', 'animate'], default: 'generate' },
    baseGen: { type: mongoose.Schema.Types.ObjectId, ref: 'ImageGen', default: null }, // edit source
    settings: {
      style: String,
      mood: String,
      language: String,
      size: String,
      quality: String,
      verseReference: { type: String, default: '' },
      effect: { type: String, default: '' }, // animate mode: zoom | pan | glow | flicker
    },
    // Links into the platform's read-only Ramayana data (set when the scene came from a verse).
    kanda: { type: mongoose.Schema.Types.ObjectId, default: null },
    verse: { type: mongoose.Schema.Types.ObjectId, default: null },
    model: { type: String, default: '' },
    status: { type: String, enum: ['generating', 'completed', 'failed', 'canceled'], default: 'generating', index: true },
    errorCode: { type: String, default: '' },
    errorMessage: { type: String, default: '' },
    s3Key: { type: String, default: null },
    mime: { type: String, default: 'image/jpeg' },
    fileSize: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'voicegen_image_gens' }
);
imageGenSchema.index({ chat: 1, createdAt: 1 });
imageGenSchema.index({ createdBy: 1, createdAt: -1 });

module.exports = mongoose.model('ImageGen', imageGenSchema);
