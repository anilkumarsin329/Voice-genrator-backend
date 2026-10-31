const BulkJob = require('../models/BulkJob');
const Audio = require('../models/Audio');
const { Kanda, Verse, kandaEnglishName } = require('../models/Scripture');
const audioService = require('./audio.service');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

// Strictly sequential: ElevenLabs enforces concurrency limits per plan.
const runJob = async (jobId) => {
  const job = await BulkJob.findById(jobId);
  if (!job) return;
  job.status = 'running';
  await job.save();
  const kanda = await Kanda.findById(job.kanda).lean();

  for (const item of job.items) {
    if (item.status !== 'pending' && item.status !== 'failed') continue;
    item.status = 'processing';
    item.error = '';
    await job.save();
    try {
      const verse = await Verse.findById(item.verse).lean();
      const text = verse && (verse[job.language] || '').trim();
      if (!text) throw new ApiError(422, `Verse has no ${job.language} text`, 'EMPTY_TEXT');

      const { audio, duplicate } = await audioService.generate(
        {
          title: `${kandaEnglishName(kanda)} ${job.sargaNumber ? `${job.sargaNumber}.` : ''}${verse.verseNumber}`.trim(),
          language: job.language,
          text,
          voiceId: job.voiceId,
          voiceName: job.voiceName,
          modelId: job.modelId,
          speed: job.speed,
          stability: job.stability,
          similarityBoost: job.similarityBoost,
          kanda: job.kanda,
          sargaNumber: job.sargaNumber,
          verse: item.verse,
        },
        job.createdBy,
        { saved: true }
      );
      item.audio = audio._id;
      item.status = duplicate ? 'skipped' : 'completed';
    } catch (err) {
      item.status = 'failed';
      item.error = err.message;
      if (err.audio) item.audio = err.audio._id;
      logger.warn('bulk item failed', { jobId: String(job._id), verse: String(item.verse), error: err.message });
      // Quota exhausted: the remaining items would fail too. Stop early; they stay retryable.
      if (err.code === 'ELEVENLABS_QUOTA') {
        await job.save();
        break;
      }
    }
    await job.save();
  }
  job.status = job.items.some((i) => i.status === 'failed' || i.status === 'pending') ? 'completed_with_errors' : 'completed';
  await job.save();
};

const assertIdle = async () => {
  if (await BulkJob.findOne({ status: 'running' })) throw new ApiError(409, 'Another bulk generation is already running', 'BULK_BUSY');
};

const start = async ({ kandaId, sargaNumber, verseIds, ...settings }, userId) => {
  const kanda = await Kanda.findById(kandaId).lean();
  if (!kanda) throw new ApiError(404, 'Kanda not found', 'NOT_FOUND');

  const filter = { _id: { $in: verseIds }, kandaId };
  if (sargaNumber) filter.sargaNumber = sargaNumber;
  const verses = await Verse.find(filter).sort({ verseNumber: 1 }).lean();
  if (!verses.length) throw new ApiError(404, 'No matching verses found for this selection', 'NOT_FOUND');
  await assertIdle();

  const job = await BulkJob.create({
    kanda: kandaId,
    sargaNumber: sargaNumber || null,
    ...settings,
    createdBy: userId,
    items: verses.map((v) => ({ verse: v._id, label: `Verse ${v.verseNumber}` })),
  });
  runJob(job._id).catch((err) => logger.error('bulk job crashed', { error: err.message }));
  return job;
};

const retryFailed = async (jobId) => {
  const job = await BulkJob.findById(jobId);
  if (!job) throw new ApiError(404, 'Bulk job not found', 'NOT_FOUND');
  await assertIdle();
  if (!job.items.some((i) => i.status === 'failed' || i.status === 'pending')) throw new ApiError(400, 'Nothing to retry', 'NOTHING_TO_RETRY');
  job.status = 'running';
  await job.save();
  runJob(job._id).catch((err) => logger.error('bulk job crashed', { error: err.message }));
  return job;
};

/** Jobs that were mid-flight when the server stopped become retryable. */
const markInterrupted = async () => {
  const jobs = await BulkJob.find({ status: 'running' });
  for (const job of jobs) {
    job.items.forEach((i) => { if (i.status === 'processing') i.status = 'pending'; });
    job.status = 'interrupted';
    await job.save();
  }
  await Audio.updateMany({ status: 'processing' }, { status: 'failed', errorMessage: 'Interrupted by server restart' });
};

module.exports = { start, retryFailed, markInterrupted };
