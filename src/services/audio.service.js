const crypto = require('crypto');
const { parseBuffer } = require('music-metadata');
const Audio = require('../models/Audio');
const { Kanda, Verse, kandaEnglishName } = require('../models/Scripture');
const eleven = require('./elevenlabs.service');
const s3 = require('./s3.service');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { slugify, pad } = require('../utils/slug');

const hashContent = ({ language, text, voiceId, modelId, speed, stability, similarityBoost }) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify([language, text.trim(), voiceId, modelId, speed, stability, similarityBoost]))
    .digest('hex');

// Object keys are built here from validated data only; clients never supply them.
// Layout: <prefix>/<language>/<kanda-slug>/[sarga-001/]verse-001-<uid>.mp3
const buildKey = async (audio) => {
  const uid = crypto.randomBytes(4).toString('hex');
  if (audio.verse && audio.kanda) {
    const [kanda, verse] = await Promise.all([Kanda.findById(audio.kanda).lean(), Verse.findById(audio.verse).lean()]);
    if (kanda && verse) {
      const sarga = audio.sargaNumber ? `sarga-${pad(audio.sargaNumber)}/` : '';
      return s3.withPrefix(
        `${audio.language}/${slugify(kandaEnglishName(kanda))}/${sarga}verse-${pad(verse.verseNumber)}-${uid}.mp3`
      );
    }
  }
  return s3.withPrefix(`${audio.language}/general/${slugify(audio.title).slice(0, 40)}-${uid}.mp3`);
};

const measure = async (buffer) => {
  try {
    const meta = await parseBuffer(buffer, { mimeType: 'audio/mpeg' }, { duration: true });
    if (meta.format.duration) return meta.format.duration;
  } catch { /* fall through */ }
  return (buffer.length * 8) / 128000; // 128 kbps estimate
};

/** Run TTS -> S3 for an existing Audio doc, updating it in place. Failure is recorded on the doc, then rethrown. */
const synthesize = async (audio, { replaceKey } = {}) => {
  try {
    audio.status = 'processing';
    audio.errorMessage = '';
    await audio.save();

    const buffer = await eleven.textToSpeech(audio.toObject());
    const key = await buildKey(audio);
    await s3.upload(key, buffer);

    audio.s3Key = key;
    audio.fileSize = buffer.length;
    audio.duration = Math.round((await measure(buffer)) * 100) / 100;
    audio.format = 'mp3';
    audio.status = 'completed';
    await audio.save();

    if (replaceKey && replaceKey !== key) s3.remove(replaceKey).catch(() => {}); // failure already logged
    return audio;
  } catch (err) {
    logger.error('synthesis failed', { audioId: String(audio._id), error: err.message, code: err.code });
    audio.status = 'failed';
    audio.errorMessage = err.message;
    await audio.save();
    err.audio = audio;
    throw err;
  }
};

/**
 * Create + generate audio. If an identical completed generation already exists (same text, voice,
 * model, settings, language) it is returned instead, so no ElevenLabs credits are spent twice.
 */
const generate = async (params, userId, { saved = false } = {}) => {
  const hash = hashContent(params);
  const existing = await Audio.findOne({ contentHash: hash, status: 'completed', s3Key: { $ne: null } });
  if (existing) {
    if (saved && !existing.saved) {
      existing.saved = true;
      await existing.save();
    }
    return { audio: existing, duplicate: true };
  }
  const audio = await Audio.create({ ...params, contentHash: hash, createdBy: userId, saved, status: 'processing' });
  await synthesize(audio);
  return { audio, duplicate: false };
};

/** Regenerate in place (new settings optional), replacing the S3 object. */
const regenerate = async (id, overrides = {}) => {
  const audio = await Audio.findById(id);
  if (!audio) throw new ApiError(404, 'Audio not found', 'NOT_FOUND');
  const oldKey = audio.s3Key;
  Object.assign(audio, overrides);
  audio.contentHash = hashContent(audio);
  await synthesize(audio, { replaceKey: oldKey });
  return audio;
};

const remove = async (id) => {
  const audio = await Audio.findById(id);
  if (!audio) throw new ApiError(404, 'Audio not found', 'NOT_FOUND');
  if (audio.s3Key) await s3.remove(audio.s3Key); // fail before touching the DB
  await audio.deleteOne();
};

/** Shape an audio document for the client, with fresh presigned URLs (the S3 key itself is never exposed). */
const serialize = async (audio) => {
  const o = typeof audio.toObject === 'function' ? audio.toObject() : audio;
  const { _id, __v, contentHash, s3Key, ...rest } = o;
  const out = { ...rest, id: String(_id) };
  if (o.status === 'completed' && s3Key) {
    const fname = `${slugify(o.title)}.mp3`;
    [out.playUrl, out.downloadUrl] = await Promise.all([s3.presignedUrl(s3Key), s3.presignedUrl(s3Key, { filename: fname })]);
  }
  return out;
};

module.exports = { generate, regenerate, remove, synthesize, serialize, hashContent };
