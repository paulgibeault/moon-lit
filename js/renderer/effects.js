import { BURST_SCALE } from '../constants.js';
import { getBurstSheet } from '../assets.js';
import { SERIF, easeOut, fontScaleOf } from './style.js';

// Per-kind text style for the floating bonus labels. The vertical-rise factor
// in this table multiplies (layout.size * easeOut(tt)) — the model side
// (effects.js) controls each kind's lifetime and initial offset.
const FLOAT_STYLES = Object.freeze({
  pop:     { color: '245, 233, 201', weight: 600, size: 0.65, italic: true,  riseFactor: 1.4 },
  cluster: { color: '232, 183, 112', weight: 500, size: 0.78, italic: false, riseFactor: 2.2 },
  drop:    { color: '232, 183, 112', weight: 600, size: 0.95, italic: false, riseFactor: 2.2 },
  chain:   { color: '245, 233, 201', weight: 600, size: 0.85, italic: false, riseFactor: 2.2 },
  combo:   { color: '232, 183, 112', weight: 700, size: 0.95, italic: false, riseFactor: 2.2 },
  // Combo-power callouts — brighter cream, larger, rising farther so the
  // "you earned something" beat reads above the ordinary score floats.
  moonburst: { color: '255, 240, 205', weight: 700, size: 1.15, italic: false, riseFactor: 2.6 },
  moonrise:  { color: '248, 206, 140', weight: 700, size: 1.05, italic: true,  riseFactor: 2.8 },
});

// Match-pop bursts: a flipbook drawn additively so the sheet's black
// background drops out against the night sky. Reduced-motion skips the
// animation; the pop+drop still register through the board state change.
export function drawBursts(ctx, layout, game, settings) {
  if (!game.effects || !game.effects.length) return;
  if (settings && settings.reducedMotion) return;
  const sheet = getBurstSheet();
  if (!sheet) return;
  const frameSize = sheet.frameSize;
  const totalFrames = sheet.frames;
  const baseDw = layout.size * 2 * BURST_SCALE;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const fx of game.effects) {
    const tt = fx.t / fx.life;
    if (tt < 0 || tt >= 1) continue;
    const frame = Math.min(totalFrames - 1, Math.floor(tt * totalFrames));
    const dw = baseDw * (fx.scale || 1);
    ctx.drawImage(
      sheet.image,
      frame * frameSize, 0, frameSize, frameSize,
      fx.x - dw / 2, fx.y - dw / 2, dw, dw,
    );
  }
  ctx.restore();
}

// Floating spark labels rising from popped lanterns and centroids. Pop labels
// drift up like embers; cluster/drop/chain/combo labels rise farther and live
// longer so the player can read the bonus reason. Reduced motion: stationary
// fade in place.
export function drawFloats(ctx, layout, game, settings) {
  if (!game.floats || !game.floats.length) return;
  const fs = fontScaleOf(settings);
  const reducedMotion = settings.reducedMotion;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of game.floats) {
    const tt = f.t / f.life;
    if (tt < 0 || tt >= 1) continue;
    const style = FLOAT_STYLES[f.kind];
    if (!style) continue;
    const e = easeOut(tt);
    const dy = reducedMotion ? 0 : -layout.size * style.riseFactor * e;
    const fadeIn  = Math.min(1, tt / 0.1);
    const fadeOut = Math.min(1, (1 - tt) / 0.4);
    const alpha = Math.min(fadeIn, fadeOut);
    const fontPx = Math.max(11, Math.round(layout.size * style.size * fs));
    ctx.fillStyle = `rgba(${style.color}, ${0.95 * alpha})`;
    const italic = style.italic ? 'italic ' : '';
    ctx.font = `${italic}${style.weight} ${fontPx}px ${SERIF}`;
    ctx.fillText(f.text, f.x, f.y + dy);
  }
  ctx.restore();
}
