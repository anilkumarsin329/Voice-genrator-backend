const sharp = require('sharp');

// Turns a finished image into a looping animated GIF with a camera / light effect.
// This is motion design on the generated artwork (no extra AI cost, takes a few seconds), not new AI video.

const EFFECTS = [
  { id: 'zoom', label: 'Slow zoom', note: 'gentle push-in' },
  { id: 'pan', label: 'Drift', note: 'slow sideways pan' },
  { id: 'glow', label: 'Divine glow', note: 'pulsing golden aura' },
  { id: 'flicker', label: 'Diya flicker', note: 'warm lamp-light shimmer' },
];

const MAX_SIDE = 560; // GIFs get large fast; this keeps detailed artwork around 2 MB
const FRAMES = 12; // played forward then backward => seamless loop
const DELAY_MS = 90;
const OVERSCAN = 1.18; // extra pixels to crop/pan inside without showing edges

const ease = (t) => (1 - Math.cos(Math.PI * t)) / 2;

// Deterministic jitter so the same image + effect always renders the same GIF.
const jitter = (i) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** Per-frame camera + colour for progress t in [0,1]. `zoom` is 1 = no zoom; `pan` is -1..1 across the free space. */
const frameParams = (effect, t, i) => {
  const e = ease(t);
  switch (effect) {
    case 'zoom': return { zoom: 1 + 0.14 * e, px: 0, py: 0, brightness: 1, saturation: 1 };
    case 'pan': return { zoom: 1.14, px: -1 + 2 * e, py: 0, brightness: 1, saturation: 1 };
    case 'glow': return { zoom: 1 + 0.03 * e, px: 0, py: 0, brightness: 1 + 0.1 * Math.sin(Math.PI * t), saturation: 1 + 0.18 * Math.sin(Math.PI * t) };
    case 'flicker': return { zoom: 1 + 0.02 * e, px: 0, py: 0, brightness: 0.94 + 0.13 * jitter(i), saturation: 1.04 + 0.06 * jitter(i + 99) };
    default: throw new Error(`Unknown effect ${effect}`);
  }
};

/** @returns {Promise<{buffer: Buffer, width: number, height: number, frames: number}>} */
const makeGif = async (input, effect) => {
  const meta = await sharp(input).metadata();
  const scale = Math.min(1, MAX_SIDE / Math.max(meta.width, meta.height));
  const W = Math.round((meta.width * scale) / 2) * 2;
  const H = Math.round((meta.height * scale) / 2) * 2;
  const BW = Math.round(W * OVERSCAN);
  const BH = Math.round(H * OVERSCAN);

  // One oversized, opaque copy to crop every frame from.
  const big = await sharp(input).removeAlpha().resize(BW, BH, { fit: 'fill' }).raw().toBuffer();
  const bigInfo = { raw: { width: BW, height: BH, channels: 3 } };

  const render = async (i) => {
    const t = i / (FRAMES - 1);
    const p = frameParams(effect, t, i);
    // Crop window shrinks as zoom grows; the leftover space is where the window can pan.
    const winW = Math.min(BW, Math.round(BW / p.zoom));
    const winH = Math.min(BH, Math.round(BH / p.zoom));
    const freeX = BW - winW;
    const freeY = BH - winH;
    const left = Math.round(freeX / 2 + (p.px * freeX) / 2);
    const top = Math.round(freeY / 2 + (p.py * freeY) / 2);
    return sharp(big, bigInfo)
      .extract({ left, top, width: winW, height: winH })
      .resize(W, H, { kernel: 'lanczos3' })
      .modulate({ brightness: p.brightness, saturation: p.saturation })
      .png({ compressionLevel: 1 })
      .toBuffer();
  };

  const forward = [];
  for (let i = 0; i < FRAMES; i += 1) forward.push(await render(i)); // sequential: keeps memory flat
  const order = [...forward, ...forward.slice(1, -1).reverse()]; // ping-pong

  // `join` stacks the frames as pages of one animated image.
  const buffer = await sharp(order, { join: { animated: true } })
    .gif({ loop: 0, delay: order.map(() => DELAY_MS), effort: 4, colours: 256, dither: 0.6, reuse: false })
    .toBuffer();
  return { buffer, width: W, height: H, frames: order.length };
};

module.exports = { EFFECTS, makeGif };
