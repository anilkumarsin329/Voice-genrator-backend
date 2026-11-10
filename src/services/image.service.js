const OpenAI = require('openai');
const config = require('../config');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const s3 = require('./s3.service');
const ImageChat = require('../models/ImageChat');
const ImageGen = require('../models/ImageGen');
const { Kanda, Verse, kandaEnglishName } = require('../models/Scripture');
const { buildGeneratePrompt, buildEditPrompt } = require('./imagePrompt');
const gifService = require('./gif.service');

let client;
const getClient = () => {
  if (!config.image.apiKey) throw new ApiError(500, 'OPENAI_API_KEY is not configured on the server', 'CONFIG_ERROR');
  return (client ||= new OpenAI({ apiKey: config.image.apiKey, maxRetries: 1 }));
};

/* ------------------------------------------------------------------ limits */

const running = new Map(); // adminId -> in-flight generations (single-process; fine for one API instance)
const acquire = (userId) => {
  const key = String(userId);
  const n = running.get(key) || 0;
  if (n >= config.image.maxConcurrent) {
    throw new ApiError(429, `You already have ${n} images generating. Wait for one to finish.`, 'TOO_MANY_CONCURRENT');
  }
  running.set(key, n + 1);
};
const release = (userId) => {
  const key = String(userId);
  const n = (running.get(key) || 1) - 1;
  if (n <= 0) running.delete(key);
  else running.set(key, n);
};

const assertDailyQuota = async (userId) => {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const used = await ImageGen.countDocuments({ createdBy: userId, createdAt: { $gte: start }, status: { $ne: 'failed' }, mode: { $ne: 'animate' } }); // GIFs cost nothing
  if (used >= config.image.dailyLimit) {
    throw new ApiError(429, `Daily image limit reached (${config.image.dailyLimit}). It resets at 00:00 UTC.`, 'DAILY_LIMIT');
  }
  return { used, limit: config.image.dailyLimit };
};

/* ------------------------------------------------------------------ helpers */

/** Map provider errors to messages that are safe and useful to show in the UI. */
const friendlyError = (err) => {
  if (err?.name === 'AbortError' || err?.constructor?.name === 'APIUserAbortError') return { code: 'CANCELED', message: 'Generation was canceled.' };
  const code = err?.code || err?.error?.code || '';
  const status = err?.status;
  if (code === 'moderation_blocked' || /safety system/i.test(err?.message || ''))
    return { code: 'MODERATION', message: "The image request was blocked by OpenAI's safety system. Try rewording the scene." };
  if (code === 'insufficient_quota' || code === 'billing_hard_limit_reached')
    return { code: 'QUOTA', message: 'The OpenAI account is out of credit or at its billing limit.' };
  if (status === 429) return { code: 'PROVIDER_RATE_LIMIT', message: 'OpenAI is rate-limiting requests. Please retry in a moment.' };
  if (status === 401) return { code: 'CONFIG_ERROR', message: 'The OpenAI API key is invalid.' };
  if (err instanceof OpenAI.APIConnectionTimeoutError) return { code: 'TIMEOUT', message: 'Image generation timed out. Try the Fast quality setting.' };
  if (err instanceof ApiError) return { code: err.code, message: err.message };
  return { code: 'GENERATION_FAILED', message: status && status < 500 ? err.message : 'Image generation failed. Please try again.' };
};

const imageKey = (gen, ext) => {
  const d = new Date();
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const e = ext || (gen.mode === 'animate' ? 'gif' : 'jpg');
  return `${config.image.s3Prefix}/${ym}/${gen.chat}/${gen._id}.${e}`;
};

/** Client shape for a generation, with fresh presigned URLs (the S3 key is never exposed). */
const serialize = async (g) => {
  const o = g.toObject ? g.toObject() : g;
  const out = {
    id: String(o._id),
    chatId: String(o.chat),
    prompt: o.prompt,
    mode: o.mode,
    baseGenId: o.baseGen ? String(o.baseGen) : null,
    settings: o.settings,
    verseId: o.verse ? String(o.verse) : null,
    status: o.status,
    errorCode: o.errorCode,
    errorMessage: o.errorMessage,
    fileSize: o.fileSize,
    durationMs: o.durationMs,
    createdAt: o.createdAt,
  };
  if (o.status === 'completed' && o.s3Key) {
    const fname = `brahmakosh-${String(o._id).slice(-6)}.${o.mime === 'image/gif' ? 'gif' : 'jpg'}`;
    [out.imageUrl, out.downloadUrl] = await Promise.all([
      s3.presignedUrl(o.s3Key, { contentType: o.mime }),
      s3.presignedUrl(o.s3Key, { contentType: o.mime, filename: fname }),
    ]);
  }
  return out;
};

const serializeChat = (c) => ({ id: String(c._id), title: c.title, lastMessageAt: c.lastMessageAt, createdAt: c.createdAt });

/* ------------------------------------------------------------------ generation */

/**
 * Validates everything that can fail with a normal JSON error (ownership, quota, S3 read) and creates the
 * chat + generation records. Call before opening the SSE stream. The caller must `release(userId)` when done.
 */
const prepare = async (user, body) => {
  const { chatId, scene, baseGenId, verseId, style, mood, language, size, quality } = body;
  await assertDailyQuota(user._id);

  let chat = null;
  if (chatId) {
    chat = await ImageChat.findOne({ _id: chatId, createdBy: user._id });
    if (!chat) throw new ApiError(404, 'Chat not found', 'NOT_FOUND');
  }

  let baseBuffer = null;
  let baseGen = null;
  if (baseGenId) {
    baseGen = await ImageGen.findOne({ _id: baseGenId, createdBy: user._id, status: 'completed', s3Key: { $ne: null } });
    if (!baseGen) throw new ApiError(404, 'The image to edit was not found', 'NOT_FOUND');
    if (chat && String(baseGen.chat) !== String(chat._id)) throw new ApiError(400, 'That image belongs to a different chat', 'VALIDATION_ERROR');
    baseBuffer = await s3.getBuffer(baseGen.s3Key);
  }

  // Scripture context (read-only access to the platform's Ramayana collections).
  let verseRef = body.verseReference || '';
  let verseText = '';
  let links = { kanda: null, verse: null };
  if (verseId) {
    const verse = await Verse.findById(verseId).lean();
    if (!verse) throw new ApiError(404, 'Verse not found', 'NOT_FOUND');
    const kanda = await Kanda.findById(verse.kandaId).lean();
    verseText = (verse.english || verse.hindi || verse.sanskrit || '').trim().slice(0, 600);
    if (!verseRef) verseRef = `${kandaEnglishName(kanda)} ${verse.sargaNumber ? `${verse.sargaNumber}.` : ''}${verse.verseNumber}`;
    links = { kanda: verse.kandaId, verse: verse._id };
  }

  acquire(user._id);
  try {
    if (!chat) chat = await ImageChat.create({ title: scene.slice(0, 60), createdBy: user._id });
    const gen = await ImageGen.create({
      chat: chat._id,
      createdBy: user._id,
      prompt: scene,
      mode: baseGen ? 'edit' : 'generate',
      baseGen: baseGen?._id || null,
      settings: { style, mood, language, size, quality, verseReference: verseRef },
      ...links,
      model: config.image.model,
    });
    return { chat, gen, baseBuffer, verseText, verseRef };
  } catch (err) {
    release(user._id);
    throw err;
  }
};

/**
 * Streams the image from OpenAI. `emit({type, ...})` is called for partial frames and the final result.
 * Never throws: failures are recorded on the generation and emitted as an `error` event.
 */
const execute = async (ctx, emit, signal) => {
  const { chat, gen, baseBuffer, verseText, verseRef } = ctx;
  const { style, mood, language, size, quality } = gen.settings;
  const started = Date.now();
  const isDalle3 = config.image.model === 'dall-e-3';
  const reqOpts = { signal, timeout: config.image.timeoutMs };

  try {
    const oai = getClient().images;
    let finalB64 = null;

    if (isDalle3) {
      // dall-e-3 does not support streaming or editing; always generates fresh
      const dalle3Size = ['1024x1024', '1792x1024', '1024x1792'].includes(size) ? size
        : size === '1536x1024' ? '1792x1024'
        : size === '1024x1536' ? '1024x1792'
        : '1024x1024';
      const resp = await oai.generate({
        model: 'dall-e-3',
        prompt: buildGeneratePrompt({ scene: gen.prompt, language, verseReference: verseRef, style, mood, verseText }).slice(0, 4000),
        size: dalle3Size,
        quality: quality === 'high' ? 'hd' : 'standard',
        n: 1,
      }, reqOpts);
      // dall-e-3 returns a URL by default; download it to buffer for S3 upload
      const imgUrl = resp.data[0]?.url;
      if (!imgUrl) throw new ApiError(502, 'The image service returned no image', 'GENERATION_FAILED');
      const imgRes = await fetch(imgUrl);
      const arrBuf = await imgRes.arrayBuffer();
      finalB64 = Buffer.from(arrBuf).toString('base64');
    } else {
      const common = { model: config.image.model, size, quality, output_format: 'jpeg', output_compression: 85, stream: true, partial_images: 2, n: 1 };
      const stream = baseBuffer
        ? await oai.edit({ ...common, image: await OpenAI.toFile(baseBuffer, 'source.jpg', { type: 'image/jpeg' }), prompt: buildEditPrompt({ instruction: gen.prompt, style, mood }) }, reqOpts)
        : await oai.generate({ ...common, prompt: buildGeneratePrompt({ scene: gen.prompt, language, verseReference: verseRef, style, mood, verseText }) }, reqOpts);
      for await (const ev of stream) {
        if (ev.type.endsWith('.partial_image')) emit({ type: 'partial', url: `data:image/jpeg;base64,${ev.b64_json}` });
        else if (ev.type.endsWith('.completed')) finalB64 = ev.b64_json;
      }
    }
    if (!finalB64 && !isDalle3) throw new ApiError(502, 'The image service returned no image', 'GENERATION_FAILED');

    const mime = isDalle3 ? 'image/png' : 'image/jpeg';
    const ext = isDalle3 ? 'png' : 'jpg';
    const buf = Buffer.from(finalB64, 'base64');
    gen.s3Key = imageKey(gen, ext);
    await s3.upload(gen.s3Key, buf, mime);
    gen.set({ status: 'completed', fileSize: buf.length, mime, durationMs: Date.now() - started });
    await gen.save();
    await ImageChat.updateOne({ _id: chat._id }, { lastMessageAt: new Date() });
    logger.info('image generated', { gen: String(gen._id), model: config.image.model, quality, mode: gen.mode, ms: gen.durationMs, bytes: buf.length });
    emit({ type: 'done', generation: await serialize(gen) });
  } catch (err) {
    const { code, message } = friendlyError(err);
    const canceled = code === 'CANCELED';
    if (!canceled) logger.error('image generation failed', { gen: String(gen._id), code, error: err.message });
    if (gen.s3Key && gen.status !== 'completed') s3.remove(gen.s3Key).catch(() => {}); // orphan cleanup if DB save failed after upload
    gen.set({ status: canceled ? 'canceled' : 'failed', errorCode: code, errorMessage: message, durationMs: Date.now() - started });
    await gen.save().catch((e) => logger.error('could not record failure', { error: e.message }));
    emit({ type: 'error', code, message, generation: await serialize(gen).catch(() => null) });
  }
};

/**
 * Turn a finished image into a looping GIF (camera / light effect). No AI call: takes a few seconds, costs nothing.
 * Stored as its own turn in the chat so it can be downloaded or deleted like any image.
 */
const animate = async (user, genId, effect) => {
  const label = gifService.EFFECTS.find((e) => e.id === effect)?.label;
  if (!label) throw new ApiError(400, 'Unknown GIF effect', 'VALIDATION_ERROR');
  const base = await ImageGen.findOne({ _id: genId, createdBy: user._id, status: 'completed', s3Key: { $ne: null } });
  if (!base || base.mode === 'animate') throw new ApiError(404, 'Image not found (GIFs cannot be animated again)', 'NOT_FOUND');

  acquire(user._id);
  const started = Date.now();
  let gen;
  try {
    const source = await s3.getBuffer(base.s3Key);
    gen = await ImageGen.create({
      chat: base.chat, createdBy: user._id, prompt: `GIF · ${label}`, mode: 'animate', baseGen: base._id,
      settings: { ...base.settings.toObject(), effect }, kanda: base.kanda, verse: base.verse, model: 'sharp', mime: 'image/gif',
    });
    const { buffer } = await gifService.makeGif(source, effect);
    gen.s3Key = imageKey(gen);
    await s3.upload(gen.s3Key, buffer, 'image/gif');
    gen.set({ status: 'completed', fileSize: buffer.length, durationMs: Date.now() - started });
    await gen.save();
    await ImageChat.updateOne({ _id: base.chat }, { lastMessageAt: new Date() });
    logger.info('gif created', { gen: String(gen._id), effect, ms: gen.durationMs, bytes: buffer.length });
    return serialize(gen);
  } catch (err) {
    if (gen) {
      if (gen.s3Key) s3.remove(gen.s3Key).catch(() => {});
      await gen.deleteOne().catch(() => {}); // a failed GIF leaves no half-made record behind
    }
    logger.error('gif failed', { base: String(base._id), effect, error: err.message });
    throw err instanceof ApiError ? err : new ApiError(500, 'Could not create the GIF. Please try again.', 'GIF_FAILED');
  } finally {
    release(user._id);
  }
};

/* ------------------------------------------------------------------ chats */

const listChats = async (userId, { q, page, limit }) => {
  const filter = { createdBy: userId };
  if (q) filter.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const [items, total] = await Promise.all([
    ImageChat.find(filter).sort({ lastMessageAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ImageChat.countDocuments(filter),
  ]);
  return { items: items.map(serializeChat), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
};

const getChat = async (userId, chatId) => {
  const chat = await ImageChat.findOne({ _id: chatId, createdBy: userId });
  if (!chat) throw new ApiError(404, 'Chat not found', 'NOT_FOUND');
  // A server restart mid-generation leaves "generating" rows behind; surface them as failed.
  await ImageGen.updateMany(
    { chat: chat._id, status: 'generating', createdAt: { $lt: new Date(Date.now() - config.image.timeoutMs - 60000) } },
    { status: 'failed', errorCode: 'INTERRUPTED', errorMessage: 'Generation was interrupted. Please retry.' }
  );
  const gens = await ImageGen.find({ chat: chat._id }).sort({ createdAt: 1 });
  return { chat: serializeChat(chat), generations: await Promise.all(gens.map(serialize)) };
};

const renameChat = async (userId, chatId, title) => {
  const chat = await ImageChat.findOneAndUpdate({ _id: chatId, createdBy: userId }, { title }, { new: true });
  if (!chat) throw new ApiError(404, 'Chat not found', 'NOT_FOUND');
  return serializeChat(chat);
};

const throwIfS3Failed = (failed) => {
  if (failed) throw new ApiError(502, 'Could not delete some images from storage. Nothing was removed; please retry.', 'S3_DELETE_FAILED');
};

const deleteChat = async (userId, chatId) => {
  const chat = await ImageChat.findOne({ _id: chatId, createdBy: userId });
  if (!chat) throw new ApiError(404, 'Chat not found', 'NOT_FOUND');
  const gens = await ImageGen.find({ chat: chat._id }).select('s3Key').lean();
  throwIfS3Failed(await s3.removeMany(gens.map((g) => g.s3Key).filter(Boolean))); // fail before touching the DB
  await ImageGen.deleteMany({ chat: chat._id });
  await chat.deleteOne();
};

const deleteGeneration = async (userId, genId) => {
  const gen = await ImageGen.findOne({ _id: genId, createdBy: userId });
  if (!gen) throw new ApiError(404, 'Image not found', 'NOT_FOUND');
  if (gen.status === 'generating') throw new ApiError(409, 'This image is still generating', 'CONFLICT');
  if (gen.s3Key) await s3.remove(gen.s3Key);
  await gen.deleteOne();
};

module.exports = { prepare, execute, animate, release, serialize, listChats, getChat, renameChat, deleteChat, deleteGeneration, friendlyError, assertDailyQuota };
