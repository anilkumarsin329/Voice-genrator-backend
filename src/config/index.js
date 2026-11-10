require('dotenv').config();

const required = ['MONGODB_URI', 'JWT_SECRET', 'ELEVENLABS_API_KEY', 'AWS_BUCKET_NAME', 'AWS_REGION'];

const parseVoices = () => {
  if (!process.env.ELEVENLABS_VOICES) return [];
  try {
    const v = JSON.parse(process.env.ELEVENLABS_VOICES);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false,
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean),
  mongoUri: process.env.MONGODB_URI,
  jwt: { secret: process.env.JWT_SECRET, expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    baseUrl: 'https://api.elevenlabs.io',
    defaultModel: process.env.ELEVENLABS_DEFAULT_MODEL || 'eleven_v3',
    timeoutMs: Number(process.env.ELEVENLABS_TIMEOUT_MS) || 90000,
    outputFormat: 'mp3_44100_128',
    envVoices: parseVoices(),
  },
  image: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    timeoutMs: Number(process.env.IMAGE_TIMEOUT_MS) || 240000,
    dailyLimit: Number(process.env.IMAGE_DAILY_LIMIT) || 200, // generations per admin per UTC day
    maxConcurrent: Number(process.env.IMAGE_MAX_CONCURRENT) || 2, // simultaneous generations per admin
    // Own S3 prefix so images never mix with audio (`S3_KEY_PREFIX`) or the platform's other uploads.
    s3Prefix: (process.env.S3_IMAGE_PREFIX || 'brahmakosh-images').replace(/^\/+|\/+$/g, ''),
  },
  aws: {
    region: process.env.AWS_REGION,
    bucket: process.env.AWS_BUCKET_NAME,
    prefix: (process.env.S3_KEY_PREFIX || '').replace(/^\/+|\/+$/g, ''),
    presignTtl: Number(process.env.PRESIGN_TTL_SECONDS) || 3600,
  },
  limits: { maxTextLength: 5000, maxBulkVerses: 200 },
};

config.assertValid = () => {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
};

module.exports = config;
