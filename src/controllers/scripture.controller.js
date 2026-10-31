const Audio = require('../models/Audio');
const { Kanda, Verse, kandaEnglishName } = require('../models/Scripture');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Read-only access to the platform's Ramayana collections.

const kandas = asyncHandler(async (req, res) => {
  const list = await Kanda.find({ status: { $ne: 'inactive' } }).sort({ kandaNumber: 1 }).lean();
  const counts = await Verse.aggregate([{ $group: { _id: '$kandaId', n: { $sum: 1 } } }]);
  const byKanda = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({
    success: true,
    kandas: list.map((k) => ({
      id: String(k._id),
      number: k.kandaNumber,
      title: k.title,
      name: kandaEnglishName(k),
      verseCount: byKanda.get(String(k._id)) || 0,
    })),
  });
});

/** Distinct Sarga numbers in a Kanda. Empty when the platform data has no Sarga level. */
const sargas = asyncHandler(async (req, res) => {
  const numbers = await Verse.distinct('sargaNumber', { kandaId: req.params.id, sargaNumber: { $ne: null } });
  res.json({ success: true, sargas: numbers.filter(Number.isFinite).sort((a, b) => a - b).map((n) => ({ number: n })) });
});

/** Verses of a Kanda (optionally one Sarga). With ?language= each verse reports `hasText` and whether saved audio already exists. */
const verses = asyncHandler(async (req, res) => {
  if (!(await Kanda.exists({ _id: req.params.id }))) throw new ApiError(404, 'Kanda not found', 'NOT_FOUND');
  const { language, sarga } = req.query;
  const filter = { kandaId: req.params.id };
  if (sarga) filter.sargaNumber = sarga;
  const list = await Verse.find(filter).sort({ verseNumber: 1 }).lean();

  let done = new Set();
  if (language) {
    const audios = await Audio.find({ verse: { $in: list.map((v) => v._id) }, language, status: 'completed', saved: true }).select('verse').lean();
    done = new Set(audios.map((a) => String(a.verse)));
  }
  res.json({
    success: true,
    verses: list.map((v) => ({
      id: String(v._id),
      number: v.verseNumber,
      sargaNumber: v.sargaNumber || null,
      sanskrit: v.sanskrit || '',
      hindi: v.hindi || '',
      english: v.english || '',
      ...(language ? { hasText: !!(v[language] || '').trim(), hasAudio: done.has(String(v._id)) } : {}),
    })),
  });
});

module.exports = { kandas, sargas, verses };
