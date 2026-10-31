const VoiceConfig = require('../models/VoiceConfig');
const eleven = require('../services/elevenlabs.service');
const config = require('../config');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { MODELS, VOICE_STYLES, STYLE_PRESETS, LANGUAGES } = require('../utils/constants');

/** Voices from the ElevenLabs account (falling back to env-configured ones) merged with admin approvals. */
const list = asyncHandler(async (req, res) => {
  let remote = [];
  let warning = null;
  try {
    remote = await eleven.listVoices();
  } catch (err) {
    logger.warn('voice list failed, using env voices', { error: err.message });
    warning = `Could not load voices from ElevenLabs (${err.message}). Showing configured voices only.`;
  }
  const known = new Set(remote.map((v) => v.voiceId));
  for (const v of config.elevenlabs.envVoices) {
    if (v.voiceId && !known.has(v.voiceId)) remote.push({ voiceId: v.voiceId, name: v.name || v.voiceId, category: 'configured', labels: {}, previewUrl: null, envStyle: v.style });
  }
  const configs = await VoiceConfig.find().lean();
  const byId = new Map(configs.map((c) => [c.voiceId, c]));

  const voices = remote
    .map((v) => {
      const c = byId.get(v.voiceId);
      return {
        ...v,
        style: c?.style || v.envStyle || '',
        approved: { sanskrit: !!c?.approved?.sanskrit, hindi: !!c?.approved?.hindi, english: !!c?.approved?.english },
        notes: c?.notes || '',
        enabled: c ? c.enabled : true,
      };
    })
    .filter((v) => v.enabled);

  res.json({ success: true, voices, warning, models: MODELS, styles: VOICE_STYLES, stylePresets: STYLE_PRESETS, languages: LANGUAGES });
});

/** Tag a voice with a style and approve / unapprove it per language after listening to a test. */
const update = asyncHandler(async (req, res) => {
  const { approved, ...rest } = req.body;
  const set = { ...rest };
  for (const [lang, val] of Object.entries(approved || {})) set[`approved.${lang}`] = val;
  const doc = await VoiceConfig.findOneAndUpdate(
    { voiceId: req.params.voiceId },
    { $set: set, $setOnInsert: { voiceId: req.params.voiceId } },
    { upsert: true, new: true }
  );
  res.json({ success: true, config: doc });
});

/** Short test render, streamed straight back to the admin: not stored in S3 or the library. */
const test = asyncHandler(async (req, res) => {
  const { voiceId, language, text, modelId, speed, stability, similarityBoost } = req.body;
  const buf = await eleven.textToSpeech({ text, voiceId, language, modelId, speed, stability, similarityBoost });
  res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': buf.length, 'Cache-Control': 'no-store' }).send(buf);
});

module.exports = { list, update, test };
