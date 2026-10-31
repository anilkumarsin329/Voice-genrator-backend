module.exports = {
  LANGUAGES: ['sanskrit', 'hindi', 'english'],
  // ISO codes ElevenLabs accepts as `language_code` on turbo/flash models. Sanskrit has no code: auto-detected.
  LANGUAGE_CODES: { hindi: 'hi', english: 'en' },
  VOICE_STYLES: ['devotional_male', 'calm_male', 'deep_male', 'soft_female', 'devotional_female', 'calm_female', 'narrator'],
  // Starting points for the sliders when a style is chosen
  STYLE_PRESETS: {
    devotional_male: { stability: 0.6, similarityBoost: 0.8, speed: 0.9 },
    calm_male: { stability: 0.75, similarityBoost: 0.75, speed: 0.95 },
    deep_male: { stability: 0.65, similarityBoost: 0.85, speed: 0.9 },
    soft_female: { stability: 0.55, similarityBoost: 0.75, speed: 1.0 },
    devotional_female: { stability: 0.6, similarityBoost: 0.8, speed: 0.9 },
    calm_female: { stability: 0.7, similarityBoost: 0.75, speed: 0.95 },
    narrator: { stability: 0.7, similarityBoost: 0.7, speed: 1.0 },
  },
  MODELS: [
    { id: 'eleven_multilingual_v2', name: 'Multilingual v2', note: 'Best quality, 29 languages incl. Hindi. Recommended.' },
    { id: 'eleven_v3', name: 'Eleven v3', note: 'Most expressive, widest language coverage.' },
    { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', note: 'Fast, supports language hint.' },
    { id: 'eleven_flash_v2_5', name: 'Flash v2.5', note: 'Lowest latency and cost.' },
  ],
};
