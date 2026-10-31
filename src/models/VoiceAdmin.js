const mongoose = require('mongoose');

// Admin accounts owned by the Voice Studio module itself (separate from the platform `admins` collection).
// Created with scripts/create-admin.js.
const voiceAdminSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    role: { type: String, default: 'admin' },
    isActive: { type: Boolean, default: true },
    loginApproved: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'voicegen_admins' }
);

module.exports = mongoose.model('VoiceAdmin', voiceAdminSchema);
