module.exports = {
  LANGUAGES: ['sanskrit', 'hindi', 'english'],
  // ISO 639 codes. Sanskrit 'sa' is accepted by eleven_v3 and turbo/flash models.
  LANGUAGE_CODES: { sanskrit: 'sa', hindi: 'hi', english: 'en' },
  // Models that accept language_code hint
  LANGUAGE_CODE_MODELS: /turbo|flash/,
  VOICE_STYLES: ['devotional_male', 'calm_male', 'deep_male', 'soft_female', 'devotional_female', 'calm_female', 'narrator'],
  // Tuned for Indic clarity: slower speed, higher stability for Sanskrit/Hindi
  STYLE_PRESETS: {
    devotional_male:   { stability: 0.75, similarityBoost: 0.75, speed: 0.85 },
    calm_male:         { stability: 0.80, similarityBoost: 0.75, speed: 0.90 },
    deep_male:         { stability: 0.75, similarityBoost: 0.80, speed: 0.85 },
    soft_female:       { stability: 0.70, similarityBoost: 0.70, speed: 0.90 },
    devotional_female: { stability: 0.75, similarityBoost: 0.75, speed: 0.85 },
    calm_female:       { stability: 0.78, similarityBoost: 0.72, speed: 0.90 },
    narrator:          { stability: 0.75, similarityBoost: 0.70, speed: 0.95 },
  },
  MODELS: [
    { id: 'eleven_v3',              name: 'Eleven v3',        note: 'Best for Sanskrit & Hindi — widest Devanagari coverage, most expressive. No language hint needed.' },
    { id: 'eleven_multilingual_v2', name: 'Multilingual v2',  note: 'Excellent for Hindi & English. Sanskrit pronunciation may vary.' },
    { id: 'eleven_turbo_v2_5',      name: 'Turbo v2.5',       note: 'Fast with language hint support. Good for Hindi/English.' },
    { id: 'eleven_flash_v2_5',      name: 'Flash v2.5',       note: 'Lowest latency and cost. Use for drafts.' },
  ],
};
