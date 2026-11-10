const mongoose = require('mongoose');

// A conversation in the Image Studio. Owned by one admin; the images live in ImageGen.
const imageChatSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: 'voicegen_image_chats' }
);
imageChatSchema.index({ createdBy: 1, lastMessageAt: -1 });

module.exports = mongoose.model('ImageChat', imageChatSchema);
