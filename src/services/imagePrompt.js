// Brahmakosh sacred-art guidelines + the structured prompt template.

const SYSTEM_PROMPT = `You are an expert AI image generation assistant specialized in sacred Hindu scripture visualization for the Brahmakosh digital platform.

Generate photorealistic or artistic images based on the following strict guidelines:

STYLE RULES:
- Art style: Traditional Indian miniature painting, Tanjore art, or photorealistic devotional imagery
- Color palette: Rich golds, deep saffrons, royal blues, sacred whites, vermillion reds
- Lighting: Divine, ethereal, soft golden hour or temple lamp glow
- Composition: Centered, balanced, symmetrical, following classical Indian aesthetic principles

CONTENT RULES:
- Subject: Hindu deities, Ramayana scenes, Sanskrit scripture illustrations, temple architecture
- Always depict deities with correct iconography (correct number of arms, weapons, vahana, mudras)
- Maintain cultural authenticity and religious reverence
- No modern elements, no western clothing, no anachronistic objects

QUALITY RULES:
- Ultra high detail, 8K quality
- Sharp edges, no blur
- Museum-quality artwork standard
- Suitable for digital publication and print

OUTPUT FORMAT:
- Single focused subject
- Clean background or appropriate sacred setting (temple, forest, celestial realm)
- No text or watermarks in image`;

const OPTIONS = {
  styles: ['Tanjore', 'Miniature', 'Photorealistic', 'Sketch'],
  moods: ['Devotional', 'Epic', 'Peaceful', 'Majestic'],
  languages: ['Sanskrit', 'Hindi', 'English'],
  sizes: [
    { id: '1024x1024', label: 'Square' },
    { id: '1536x1024', label: 'Landscape' },
    { id: '1024x1536', label: 'Portrait' },
  ],
  qualities: [
    { id: 'low', label: 'Fast', note: '~15s' },
    { id: 'medium', label: 'Balanced', note: '~35s' },
    { id: 'high', label: 'Best', note: '60s+' },
  ],
};

const STYLE_HINTS = {
  Tanjore: 'Tanjore painting: gold-leaf relief, gem inlays, ornate arch frame, rich flat colors',
  Miniature: 'Traditional Indian miniature painting: fine linework, flat vivid color fields, decorative borders',
  Photorealistic: 'photorealistic devotional imagery, cinematic divine lighting',
  Sketch: 'fine hand-drawn ink and pencil sketch on aged paper, classical Indian line art',
};

/** Full prompt for a brand-new image. `verseText` is optional scripture context. */
const buildGeneratePrompt = ({ scene, language, verseReference, style, mood, verseText }) =>
  [
    SYSTEM_PROMPT,
    '',
    `[SCENE]: ${scene}`,
    `[LANGUAGE CONTEXT]: ${language}`,
    verseReference && `[VERSE REFERENCE]: ${verseReference}`,
    verseText && `[VERSE TEXT]: ${verseText}`,
    `[STYLE]: ${style} (${STYLE_HINTS[style] || style})`,
    `[MOOD]: ${mood}`,
    '',
    'Generate a sacred Hindu devotional image strictly following the system guidelines.',
  ]
    .filter(Boolean)
    .join('\n');

/** Prompt for refining the previous image: keep what works, change only what was asked. */
const buildEditPrompt = ({ instruction, style, mood }) =>
  [
    'Edit the provided sacred Hindu devotional artwork according to the instruction below.',
    'Keep the composition, deity identity, correct iconography (arms, weapons, vahana, mudras), art style and overall quality unless the instruction says otherwise.',
    'No modern elements, no western clothing, no text or watermarks.',
    `Style: ${style}. Mood: ${mood}.`,
    '',
    `[INSTRUCTION]: ${instruction}`,
  ].join('\n');

module.exports = { SYSTEM_PROMPT, OPTIONS, buildGeneratePrompt, buildEditPrompt };
