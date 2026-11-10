// Brahmakosh image generation prompt builder.

const SYSTEM_PROMPT = `You are a world-class AI image generation assistant. Generate exactly what the user describes with maximum visual quality and realism.

CORE RULES:
- Generate precisely what is described — do not add or remove subjects
- No text, watermarks, or signatures in the image
- Ultra high detail, sharp, cinematic quality
- Match the mood and atmosphere of the scene naturally

When the scene involves Hindu deities or Ramayana:
- Use correct iconography (arms, weapons, vahana, mudras)
- Maintain cultural authenticity and religious reverence`;

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
  Tanjore: 'Tanjore painting style: gold-leaf relief, gem inlays, ornate arch frame, rich flat colors',
  Miniature: 'Traditional Indian miniature painting: fine linework, flat vivid color fields, decorative borders',
  Photorealistic: 'photorealistic, cinematic lighting, hyper-detailed',
  Sketch: 'fine hand-drawn ink and pencil sketch on aged paper',
};

/** Full prompt for a brand-new image. */
const buildGeneratePrompt = ({ scene, language, verseReference, style, mood, verseText }) => {
  const isDevotional = /rama|sita|hanuman|lakshmana|krishna|shiva|vishnu|devi|deity|temple|ramayana|kanda|verse|sanskrit/i.test(scene);
  return [
    SYSTEM_PROMPT,
    '',
    scene,
    verseReference && `Context: ${verseReference}`,
    verseText && `Verse: ${verseText}`,
    isDevotional && style !== 'Photorealistic' && `Art style: ${STYLE_HINTS[style] || style}`,
    isDevotional && `Mood: ${mood}`,
    !isDevotional && style === 'Photorealistic' && 'Style: photorealistic, cinematic, ultra detailed',
    !isDevotional && style === 'Sketch' && 'Style: hand-drawn sketch, detailed linework',
  ]
    .filter(Boolean)
    .join('\n');
};

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
