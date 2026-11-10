const { z } = require('zod');
const config = require('../config');
const { LANGUAGES, VOICE_STYLES } = require('../utils/constants');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const voiceId = z.string().regex(/^[A-Za-z0-9]{10,40}$/, 'Invalid voice id');
const language = z.enum(LANGUAGES);
const modelId = z.string().regex(/^eleven_[a-z0-9_]+$/, 'Invalid model id');

const settings = {
  modelId: modelId.default(config.elevenlabs.defaultModel),
  speed: z.coerce.number().min(0.7).max(1.2).default(1),
  stability: z.coerce.number().min(0).max(1).default(0.5),
  similarityBoost: z.coerce.number().min(0).max(1).default(0.75),
};

const text = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, 'Text is required').max(config.limits.maxTextLength, `Text must be at most ${config.limits.maxTextLength} characters`));

const generate = z.object({
  title: z.string().trim().min(1).max(200),
  language,
  text,
  voiceId,
  voiceName: z.string().trim().max(100).optional().default(''),
  voiceStyle: z.enum(VOICE_STYLES).optional(),
  ...settings,
  kandaId: objectId.optional(),
  verseId: objectId.optional(),
});

const regenerate = z.object({
  voiceId: voiceId.optional(),
  voiceName: z.string().trim().max(100).optional(),
  modelId: modelId.optional(),
  speed: z.coerce.number().min(0.7).max(1.2).optional(),
  stability: z.coerce.number().min(0).max(1).optional(),
  similarityBoost: z.coerce.number().min(0).max(1).optional(),
});

const bulkGenerate = z.object({
  kandaId: objectId,
  sargaNumber: z.coerce.number().int().min(1).optional(),
  verseIds: z.array(objectId).min(1).max(config.limits.maxBulkVerses),
  language,
  voiceId,
  voiceName: z.string().trim().max(100).optional().default(''),
  ...settings,
});

const history = z.object({
  q: z.string().trim().max(100).optional(),
  language: language.optional(),
  status: z.enum(['processing', 'completed', 'failed']).optional(),
  saved: z.enum(['true', 'false']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const idParam = z.object({ id: objectId });
const voiceIdParam = z.object({ voiceId });

const voiceConfigUpdate = z.object({
  name: z.string().trim().max(100).optional(),
  style: z.enum(VOICE_STYLES).or(z.literal('')).optional(),
  approved: z.object({ sanskrit: z.boolean(), hindi: z.boolean(), english: z.boolean() }).partial().optional(),
  notes: z.string().trim().max(500).optional(),
  enabled: z.boolean().optional(),
});

const voiceTest = z.object({
  voiceId,
  language,
  text: z.string().trim().min(1).max(400),
  modelId: modelId.default(config.elevenlabs.defaultModel),
  speed: z.coerce.number().min(0.7).max(1.2).default(0.9),
  stability: z.coerce.number().min(0).max(1).default(0.75),
  similarityBoost: z.coerce.number().min(0).max(1).default(0.75),
});

const login = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

const scriptureVerses = z.object({ language: language.optional(), sarga: z.coerce.number().int().min(1).optional() });

module.exports = {
  generate, regenerate, bulkGenerate, history, idParam, voiceIdParam, voiceConfigUpdate, voiceTest, login, scriptureVerses,
};
