const mongoose = require('mongoose');

// Admin-managed settings for each ElevenLabs voice: style tag and per-language approval.
// Sanskrit pronunciation is never assumed, so a voice must be explicitly approved per language.
const voiceConfigSchema = new mongoose.Schema(
  {
    voiceId: { type: String, required: true, unique: true },
    name: { type: String, default: '' },
    style: { type: String, default: '' },
    approved: {
      sanskrit: { type: Boolean, default: false },
      hindi: { type: Boolean, default: false },
      english: { type: Boolean, default: false },
    },
    notes: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
  },
  // NB: the platform already owns a `voiceconfigs` collection (chat voices), so this module uses its own.
  { timestamps: true, collection: 'voicegen_voiceconfigs' }
);

module.exports = mongoose.model('VoiceConfig', voiceConfigSchema);
