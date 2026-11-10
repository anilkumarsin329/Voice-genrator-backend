const asyncHandler = require('../utils/asyncHandler');
const config = require('../config');
const images = require('../services/image.service');
const { OPTIONS } = require('../services/imagePrompt');
const { EFFECTS } = require('../services/gif.service');

/** UI configuration, so the frontend never hard-codes styles / sizes / limits. */
const options = asyncHandler(async (req, res) => {
  const quota = await images.assertDailyQuota(req.user._id).catch(() => ({ used: config.image.dailyLimit, limit: config.image.dailyLimit }));
  res.json({ success: true, options: { ...OPTIONS, gifEffects: EFFECTS }, model: config.image.model, quota });
});

/**
 * POST /admin/image/generate  (Server-Sent Events)
 *   start   -> { chat, generation }            records created, work begins
 *   partial -> { url }                         progressively sharper preview (data URL)
 *   done    -> { generation }                  final image stored in S3 (presigned URL)
 *   error   -> { code, message, generation }
 * Validation / quota / ownership problems are returned as an ordinary JSON error *before* the stream opens.
 */
const generate = asyncHandler(async (req, res) => {
  const ctx = await images.prepare(req.user, req.body); // throws -> normal JSON error; holds a concurrency slot on success
  let released = false;
  const free = () => { if (!released) { released = true; images.release(req.user._id); } };

  try {
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: do not buffer the stream
    });
    res.flushHeaders();

    const send = (obj) => {
      if (res.writableEnded || res.destroyed) return;
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
      res.flush?.(); // compression() middleware would otherwise hold the frames back
    };

    // Client closed the tab / pressed Stop -> abort the upstream request so we stop paying for it.
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    const heartbeat = setInterval(() => !res.writableEnded && res.write(': keep-alive\n\n') && res.flush?.(), 15000);

    send({ type: 'start', chat: { id: String(ctx.chat._id), title: ctx.chat.title }, generation: await images.serialize(ctx.gen) });
    try {
      await images.execute(ctx, send, abort.signal);
    } finally {
      clearInterval(heartbeat);
    }
    res.end();
  } finally {
    free();
  }
});

const animate = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, generation: await images.animate(req.user, req.params.id, req.body.effect) });
});

const listChats = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await images.listChats(req.user._id, req.query)) });
});
const getChat = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await images.getChat(req.user._id, req.params.id)) });
});
const renameChat = asyncHandler(async (req, res) => {
  res.json({ success: true, chat: await images.renameChat(req.user._id, req.params.id, req.body.title) });
});
const removeChat = asyncHandler(async (req, res) => {
  await images.deleteChat(req.user._id, req.params.id);
  res.json({ success: true });
});
const removeGeneration = asyncHandler(async (req, res) => {
  await images.deleteGeneration(req.user._id, req.params.id);
  res.json({ success: true });
});

module.exports = { options, generate, animate, listChats, getChat, renameChat, removeChat, removeGeneration };
