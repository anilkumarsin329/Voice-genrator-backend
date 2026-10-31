const Audio = require('../models/Audio');
const BulkJob = require('../models/BulkJob');
const { Kanda, Verse } = require('../models/Scripture');
const audioService = require('../services/audio.service');
const bulkService = require('../services/bulk.service');
const eleven = require('../services/elevenlabs.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const generate = asyncHandler(async (req, res) => {
  const { kandaId, verseId, ...params } = req.body;
  const links = {};
  if (verseId) {
    // Derive the hierarchy from the verse itself so a client-supplied kanda cannot disagree with it.
    const verse = await Verse.findById(verseId).lean();
    if (!verse) throw new ApiError(404, 'Verse not found', 'NOT_FOUND');
    Object.assign(links, { verse: verse._id, kanda: verse.kandaId, sargaNumber: verse.sargaNumber || null });
  } else if (kandaId) {
    if (!(await Kanda.exists({ _id: kandaId }))) throw new ApiError(404, 'Kanda not found', 'NOT_FOUND');
    links.kanda = kandaId;
  }
  const { audio, duplicate } = await audioService.generate({ ...params, ...links }, req.user._id);
  res.status(duplicate ? 200 : 201).json({ success: true, duplicate, audio: await audioService.serialize(audio) });
});

const regenerate = asyncHandler(async (req, res) => {
  const audio = await audioService.regenerate(req.params.id, req.body);
  res.json({ success: true, audio: await audioService.serialize(audio) });
});

const history = asyncHandler(async (req, res) => {
  const { q, language, status, saved, from, to, page, limit } = req.query;
  const filter = {};
  if (q) filter.title = { $regex: escapeRegex(q), $options: 'i' };
  if (language) filter.language = language;
  if (status) filter.status = status;
  if (saved) filter.saved = saved === 'true';
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) { const end = new Date(to); end.setUTCHours(23, 59, 59, 999); filter.createdAt.$lte = end; }
  }
  const [items, total] = await Promise.all([
    Audio.find(filter).select('-text').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Audio.countDocuments(filter),
  ]);
  res.json({
    success: true,
    items: await Promise.all(items.map(audioService.serialize)),
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

const getOne = asyncHandler(async (req, res) => {
  const audio = await Audio.findById(req.params.id);
  if (!audio) throw new ApiError(404, 'Audio not found', 'NOT_FOUND');
  res.json({ success: true, audio: await audioService.serialize(audio) });
});

const save = asyncHandler(async (req, res) => {
  const audio = await Audio.findById(req.params.id);
  if (!audio) throw new ApiError(404, 'Audio not found', 'NOT_FOUND');
  if (audio.status !== 'completed') throw new ApiError(400, 'Only completed audio can be saved', 'INVALID_STATE');
  audio.saved = true;
  await audio.save();
  res.json({ success: true, audio: await audioService.serialize(audio) });
});

const remove = asyncHandler(async (req, res) => {
  await audioService.remove(req.params.id);
  res.json({ success: true });
});

const usage = asyncHandler(async (req, res) => {
  const [agg] = await Audio.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        successful: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        duration: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$duration', 0] } },
        storage: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$fileSize', 0] } },
      },
    },
  ]);
  const byLanguage = await Audio.aggregate([
    { $match: { status: 'completed' } },
    { $group: { _id: '$language', count: { $sum: 1 } } },
  ]);
  const t = agg || {};
  res.json({
    success: true,
    totals: {
      totalAudio: t.successful || 0,
      totalAttempts: t.total || 0,
      successful: t.successful || 0,
      failed: t.failed || 0,
      totalDurationSeconds: Math.round(t.duration || 0),
      storageBytes: t.storage || 0,
    },
    byLanguage: Object.fromEntries(byLanguage.map((l) => [l._id, l.count])),
    elevenlabs: await eleven.getSubscription(), // null if the API key lacks user_read
  });
});

/* ---------- bulk ---------- */

const serializeJob = async (job) => {
  const o = job.toObject();
  const counts = o.items.reduce((a, i) => ({ ...a, [i.status]: (a[i.status] || 0) + 1 }), {});
  return {
    id: String(o._id),
    status: o.status,
    language: o.language,
    kanda: o.kanda,
    sargaNumber: o.sargaNumber,
    total: o.items.length,
    counts,
    items: o.items.map((i) => ({ verse: String(i.verse), label: i.label, status: i.status, error: i.error, audio: i.audio ? String(i.audio) : null })),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
};

const bulkGenerate = asyncHandler(async (req, res) => {
  const job = await bulkService.start(req.body, req.user._id);
  res.status(202).json({ success: true, job: await serializeJob(job) });
});

const bulkStatus = asyncHandler(async (req, res) => {
  const job = await BulkJob.findById(req.params.id);
  if (!job) throw new ApiError(404, 'Bulk job not found', 'NOT_FOUND');
  res.json({ success: true, job: await serializeJob(job) });
});

const bulkRetry = asyncHandler(async (req, res) => {
  const job = await bulkService.retryFailed(req.params.id);
  res.status(202).json({ success: true, job: await serializeJob(job) });
});

const bulkLatest = asyncHandler(async (req, res) => {
  const job = await BulkJob.findOne().sort({ createdAt: -1 });
  res.json({ success: true, job: job ? await serializeJob(job) : null });
});

module.exports = { generate, regenerate, history, getOne, save, remove, usage, bulkGenerate, bulkStatus, bulkRetry, bulkLatest };
