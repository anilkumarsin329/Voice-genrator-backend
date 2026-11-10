const config = require('../config');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { LANGUAGE_CODES, LANGUAGE_CODE_MODELS } = require('../utils/constants');

const { baseUrl, apiKey, timeoutMs, outputFormat } = config.elevenlabs;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Translate ElevenLabs failures into errors the admin UI can act on.
const mapError = async (res) => {
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  const detail = body?.detail;
  const status = detail?.status || '';
  const msg = (typeof detail === 'string' ? detail : detail?.message) || res.statusText || 'ElevenLabs request failed';
  if (res.status === 401 && /quota/i.test(status + msg)) return new ApiError(402, `ElevenLabs quota exceeded: ${msg}`, 'ELEVENLABS_QUOTA');
  if (res.status === 401) return new ApiError(502, `ElevenLabs rejected the request (API key invalid or missing permission): ${msg}`, 'ELEVENLABS_AUTH');
  if (res.status === 429) return new ApiError(429, 'ElevenLabs rate limit / concurrency limit reached. Try again shortly.', 'ELEVENLABS_RATE_LIMIT');
  if (res.status === 422 || res.status === 400) return new ApiError(422, `ElevenLabs could not process the request: ${msg}`, 'ELEVENLABS_INVALID');
  if (res.status === 404) return new ApiError(404, 'Voice not found in ElevenLabs account', 'ELEVENLABS_VOICE_NOT_FOUND');
  return new ApiError(502, `ElevenLabs error (${res.status}): ${msg}`, 'ELEVENLABS_ERROR');
};

const request = async (path, init = {}, { retries = 0 } = {}) => {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { 'xi-api-key': apiKey, ...(init.headers || {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res;
      const retryable = res.status >= 500 || res.status === 429;
      if (retryable && attempt < retries) {
        logger.warn('elevenlabs retry', { status: res.status, attempt });
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw await mapError(res);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      if (attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new ApiError(
        timedOut ? 504 : 502,
        timedOut ? 'ElevenLabs request timed out' : `Could not reach ElevenLabs: ${err.message}`,
        'ELEVENLABS_UNREACHABLE'
      );
    }
  }
};

/** Convert text to MP3. Returns a Buffer. */
const textToSpeech = async ({ text, voiceId, modelId, language, speed, stability, similarityBoost }) => {
  const body = {
    text,
    model_id: modelId,
    voice_settings: { stability, similarity_boost: similarityBoost, speed, use_speaker_boost: true },
  };
  // language_code improves Indic pronunciation on v3, turbo and flash models
  if (LANGUAGE_CODES[language] && LANGUAGE_CODE_MODELS.test(modelId)) body.language_code = LANGUAGE_CODES[language];
  // Lower speaker_boost for non-English to reduce artifacts on Devanagari text
  if (language !== 'english') body.voice_settings.use_speaker_boost = false;

  const res = await request(
    `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${outputFormat}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(body) },
    { retries: 2 }
  );
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new ApiError(502, 'ElevenLabs returned empty audio', 'ELEVENLABS_EMPTY');
  return buf;
};

/** Voices available in the account (own + library voices added to it). */
const listVoices = async () => {
  const res = await request('/v1/voices', {}, { retries: 1 });
  const data = await res.json();
  return (data.voices || []).map((v) => ({
    voiceId: v.voice_id,
    name: v.name,
    category: v.category,
    labels: v.labels || {},
    previewUrl: v.preview_url || null,
  }));
};

/** Character quota. Needs the `user_read` permission on the key; returns null if unavailable. */
const getSubscription = async () => {
  try {
    const res = await request('/v1/user/subscription');
    const s = await res.json();
    return {
      tier: s.tier,
      characterCount: s.character_count,
      characterLimit: s.character_limit,
      resetsAt: s.next_character_count_reset_unix ? new Date(s.next_character_count_reset_unix * 1000) : null,
    };
  } catch (err) {
    logger.warn('subscription lookup failed', { error: err.message });
    return null;
  }
};

module.exports = { textToSpeech, listVoices, getSubscription };
