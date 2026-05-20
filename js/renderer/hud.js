import { PALETTE } from '../constants.js';
import { PHASE } from '../game.js';
import {
  SERIF, SANS, HUD_OPACITY,
  formatScore, hudPx, fontScaleOf, hexToRgba,
} from './style.js';
import { getMoonState, drawPhaseShadow } from './world.js';
import { MENU_RESERVE_PX } from './menu.js';

// View-only state that lives outside the game model: the HUD score counter
// tweens from `displayScore` toward `game.score` so a big swing reads as a
// satisfying climb instead of a jump. Reset when the launcher imports a save.
const hudState = {
  displayScore: 0,
  bestFlash: 0,        // 0..1, fades after a new-best moment
  prevBest: 0,
};

export function resetHudState(score = 0, best = 0) {
  hudState.displayScore = score;
  hudState.bestFlash = 0;
  hudState.prevBest = best;
}

// True when the score counter has converged on game.score and the best-flash
// has decayed to zero — i.e. the next tweenHud call would be a no-op. main.js
// uses this as part of the "is anything still animating?" check before
// suspending the rAF loop.
export function isHudSettled(game) {
  return (hudState.displayScore | 0) === (game.score | 0)
      && hudState.bestFlash === 0;
}

// Closes ~12% of the gap each frame at 60fps; instant under reducedMotion.
// Good enough for a counter — no need for a real spring.
export function tweenHud(game, settings) {
  if (settings.reducedMotion) {
    hudState.displayScore = game.score;
  } else if (hudState.displayScore !== game.score) {
    const diff = game.score - hudState.displayScore;
    const stepRaw = diff * 0.12;
    const step = stepRaw === 0 ? 0
      : (Math.abs(stepRaw) < 1 ? Math.sign(diff) : stepRaw);
    hudState.displayScore += step;
    if ((diff > 0 && hudState.displayScore > game.score) ||
        (diff < 0 && hudState.displayScore < game.score)) {
      hudState.displayScore = game.score;
    }
  }
  if (settings.bestScore != null && settings.bestScore > hudState.prevBest) {
    hudState.bestFlash = 1;
    hudState.prevBest = settings.bestScore;
  }
  if (hudState.bestFlash > 0) {
    hudState.bestFlash = settings.reducedMotion ? 0 : Math.max(0, hudState.bestFlash - 0.012);
  }
}

// Descent meter — a small visual countdown rather than text. A trellis bar
// at the top slides down toward a faint waterline as shots tick away; the
// number sits between them and tints cream → ember as the descent approaches.
// Anchored opposite the score panel so the chrome reads as two clusters with
// the river in between.
const DESCENT_ICON_W = 44;
const DESCENT_BAR_TOP = 10;
const DESCENT_LINE_Y = 44;
const DESCENT_BAR_W = 24;

export function drawDescentMeter(ctx, layout, game, settings) {
  if (game.shotsUntilDescent == null) return;
  const n = game.shotsUntilDescent | 0;
  const cap = (game.descentShots | 0) || 8;
  // 0 at a fresh descent, 1 right before it triggers. Used for both the bar
  // drop and the cream → ember color blend.
  const progress = Math.max(0, Math.min(1, (cap - n) / cap));
  const iconLeft = layout.viewW - 12 - DESCENT_ICON_W;
  const cx = iconLeft + DESCENT_ICON_W / 2;
  const lineSpan = DESCENT_LINE_Y - DESCENT_BAR_TOP - 14;  // bar travel range
  const barY = DESCENT_BAR_TOP + lineSpan * progress;
  const tint = hexLerpRgba(PALETTE.moon, PALETTE.moonHalo, progress, HUD_OPACITY.strong);
  const tintSoft = hexLerpRgba(PALETTE.moon, PALETTE.moonHalo, progress, HUD_OPACITY.soft);

  ctx.save();
  // Trellis bar — the thing actually descending. A rounded stroke reads as
  // a bamboo segment rather than a generic UI line.
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - DESCENT_BAR_W / 2, barY);
  ctx.lineTo(cx + DESCENT_BAR_W / 2, barY);
  ctx.stroke();
  // Two short strings hanging from the bar — implies the lanterns it carries.
  ctx.lineWidth = 1;
  ctx.strokeStyle = tintSoft;
  for (const xo of [-6, 6]) {
    ctx.beginPath();
    ctx.moveTo(cx + xo, barY + 2);
    ctx.lineTo(cx + xo, barY + 6);
    ctx.stroke();
  }

  // Countdown number — italic serif so it feels lantern-paper, not UI.
  const numPx = hudPx(layout, 0.78, 14, settings);
  ctx.font = `italic 500 ${numPx}px Georgia, serif`;
  ctx.fillStyle = tint;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), cx, (barY + DESCENT_LINE_Y) / 2 + 1);

  // Waterline — what the descent is closing on. Dashed and faint so it reads
  // as ambient threat rather than a hard UI element.
  ctx.strokeStyle = `rgba(245, 233, 201, ${HUD_OPACITY.faint})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cx - DESCENT_BAR_W / 2 - 2, DESCENT_LINE_Y);
  ctx.lineTo(cx + DESCENT_BAR_W / 2 + 2, DESCENT_LINE_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  // "descent" label sits under the waterline at hairline opacity — present
  // for first-time players, invisible to anyone who already knows the icon.
  const subPx = hudPx(layout, 0.42, 9, settings);
  ctx.font = `400 ${subPx}px ${SANS}`;
  ctx.fillStyle = `rgba(245, 233, 201, ${HUD_OPACITY.faint})`;
  ctx.textBaseline = 'top';
  ctx.fillText('descent', cx, DESCENT_LINE_Y + 3);
  ctx.restore();
}

// Linear interpolation between two hex colors, returning an rgba() string.
// Local to hud.js since both the descent tint and combo tier color need it.
function hexLerpRgba(hexA, hexB, t, alpha) {
  const ra = parseInt(hexA.slice(1, 3), 16), ga = parseInt(hexA.slice(3, 5), 16), ba = parseInt(hexA.slice(5, 7), 16);
  const rb = parseInt(hexB.slice(1, 3), 16), gb = parseInt(hexB.slice(3, 5), 16), bb = parseInt(hexB.slice(5, 7), 16);
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const b = Math.round(ba + (bb - ba) * t);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Score panel anchored to the left edge. The menu button claims the first 12+38+8 px of that
// edge, so the panel starts at MENU_RESERVE_PX. Shows:
//   ☾ <score>          — moon glyph mirrors current sky-moon phase
//     stage N · best M  — small subtext
//     ×N ✦              — combo badge (only when combo ≥ 2)
export function drawScoreHud(ctx, layout, game, settings) {
  const fontPx = hudPx(layout, 0.95, 14, settings);
  const subPx  = hudPx(layout, 0.55, 11, settings);
  const align  = 'left';
  const glyphPad = subPx * 0.7;
  const edge = MENU_RESERVE_PX;

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'top';

  ctx.font = `600 ${fontPx}px Georgia, ${SANS}`;
  const scoreText = formatScore(hudState.displayScore | 0);

  const moonR = fontPx * 0.32;
  const moonY = 8 + fontPx * 0.5;
  const moonX = edge + moonR;
  drawMoonGlyph(ctx, layout, settings, moonX, moonY, moonR);

  ctx.fillStyle = PALETTE.moon;
  const scoreTextX = edge + moonR * 2 + glyphPad;
  ctx.fillText(scoreText, scoreTextX, 8);

  // Subtext: "stage N · best M"
  let sub = `stage ${game.level}`;
  if (settings.bestScore) sub += ` · best ${formatScore(settings.bestScore)}`;
  ctx.fillStyle = `rgba(245, 233, 201, ${HUD_OPACITY.soft})`;
  ctx.font = `400 ${subPx}px Georgia, ${SANS}`;
  const subX = edge;
  ctx.fillText(sub, subX, 8 + fontPx + 2);

  // Combo badge — silent until the player is actually chaining. When the
  // chain ends, the badge disappears with the next render and the celebration
  // lives entirely in the world-side "combo ×N" float.
  drawComboBadge(ctx, layout, game, settings, subX, 8 + fontPx + subPx + 6, align);

  // Best-flash glow: a soft moonHalo ring under the score for ~1.5s after a
  // new best lands. Honors reduced motion via tweenHud's instant-clear.
  if (hudState.bestFlash > 0) {
    const a = hudState.bestFlash;
    ctx.save();
    ctx.shadowColor = PALETTE.moonHalo;
    ctx.shadowBlur = 20 * a;
    ctx.fillStyle = `rgba(232, 183, 112, ${0.35 * a})`;
    ctx.font = `600 ${fontPx}px ${SERIF}`;
    ctx.fillText(scoreText, scoreTextX, 8);
    ctx.restore();
  }
  ctx.restore();
}

// Tiny moon icon next to the score that mirrors the sky-moon's current phase.
// Same phase math as drawMoon — the HUD glyph waxes and wanes alongside the
// real moon overhead, so the chrome is part of the world, not pasted on it.
function drawMoonGlyph(ctx, layout, settings, cx, cy, r) {
  ctx.save();
  ctx.globalAlpha = HUD_OPACITY.strong;
  ctx.fillStyle = PALETTE.moon;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Clip to the disc so the phase-shadow ellipse can't paint outside the
  // moon's circular silhouette at small scales (1-px overshoot would look
  // like a chipped icon).
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const m = getMoonState(layout, settings);
  drawPhaseShadow(ctx, cx, cy, r, m.phase01);
  ctx.restore();
}

// Combo badge — silent at combo 0-1 (no UI furniture for nothing-is-happening),
// then crescent → haloed crescent → sparkle as the chain climbs. Reads as an
// italic-serif `×N` followed by a tier glyph: a small "you're on a streak"
// note rather than five clickable-looking dots.
function drawComboBadge(ctx, layout, game, settings, x, y, align) {
  const combo = game.combo | 0;
  if (combo < 2) return;
  const px = hudPx(layout, 0.62, 12, settings);
  const glyphR = px * 0.42;
  const gap = px * 0.35;
  const isPeak = combo >= 6;
  const color = combo >= 3 ? PALETTE.moonHalo : PALETTE.moon;

  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  ctx.font = `italic 600 ${px}px ${SERIF}`;
  const text = `×${combo}`;
  const textW = ctx.measureText(text).width;

  // Soft glow that intensifies with combo — never bright enough to overpower
  // the score text above, just enough to register peripherally.
  if (!settings.reducedMotion) {
    ctx.shadowColor = PALETTE.moonHalo;
    ctx.shadowBlur = isPeak ? 10 : combo >= 4 ? 6 : 3;
  }
  ctx.fillStyle = hexToRgba(color, HUD_OPACITY.strong);
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;

  // Glyph position: opposite side of the text from the anchor.
  const gx = align === 'right' ? x - textW - gap - glyphR : x + textW + gap + glyphR;
  const gy = y + px * 0.5;
  if (isPeak) {
    drawSparkle(ctx, gx, gy, glyphR * 1.5, PALETTE.moonHalo);
  } else {
    drawCrescent(ctx, gx, gy, glyphR, color, combo >= 4);
  }
  ctx.restore();
}

// Mini-crescent glyph used by the combo badge. `haloed` paints a faint
// outer ring for the mid-combo tier so the progression reads at a glance.
function drawCrescent(ctx, cx, cy, r, color, haloed) {
  ctx.save();
  if (haloed) {
    const halo = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 2.0);
    halo.addColorStop(0, hexToRgba(PALETTE.moonHalo, 0.32));
    halo.addColorStop(1, hexToRgba(PALETTE.moonHalo, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = hexToRgba(color, HUD_OPACITY.primary);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Crescent bite — overpaint with bg-tinted disc shifted to the right.
  ctx.fillStyle = 'rgba(14, 21, 56, 0.95)';
  ctx.beginPath();
  ctx.arc(cx + r * 0.45, cy - r * 0.05, r * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Four-point sparkle ✦ — drawn rather than text-rendered so it scales cleanly
// with hudPx and reads as ornament rather than UI copy.
function drawSparkle(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.18, cy - r * 0.18, cx + r, cy);
  ctx.quadraticCurveTo(cx + r * 0.18, cy + r * 0.18, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.18, cy + r * 0.18, cx - r, cy);
  ctx.quadraticCurveTo(cx - r * 0.18, cy - r * 0.18, cx, cy - r);
  ctx.fill();
}

// Stage-clear / game-over panel. Shows a tween-counted score, the per-component
// breakdown, the player name, and a "new best" ribbon if the score is fresh.
export function drawEndOverlay(ctx, layout, game, settings) {
  const { viewW, viewH } = layout;
  const won = game.phase === PHASE.WIN;
  const fs = fontScaleOf(settings);

  ctx.save();
  ctx.fillStyle = 'rgba(10, 15, 34, 0.82)';
  ctx.fillRect(0, 0, viewW, viewH);

  const titlePx = Math.max(26, Math.round(layout.size * 1.45 * fs));
  const scorePx = Math.max(36, Math.round(layout.size * 2.2  * fs));
  const linePx  = Math.max(12, Math.round(layout.size * 0.55 * fs));
  const ctaPx   = Math.max(12, Math.round(layout.size * 0.6  * fs));

  const cx = viewW / 2;
  let y = viewH * 0.30;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = won ? PALETTE.moon : PALETTE.deadLine;
  ctx.font = `600 ${titlePx}px ${SERIF}`;
  ctx.fillText(won ? `Stage ${game.level} cleared` : 'The trellis touched the water', cx, y);
  y += titlePx * 1.2;

  if (settings.playerName) {
    ctx.fillStyle = `rgba(245, 233, 201, ${HUD_OPACITY.secondary})`;
    ctx.font = `italic 400 ${linePx * 1.2}px Georgia, serif`;
    ctx.fillText(settings.playerName, cx, y);
    y += linePx * 1.6;
  } else {
    y += linePx * 0.4;
  }

  // The headline number — counts up via the tween in tweenHud().
  ctx.fillStyle = PALETTE.moon;
  ctx.font = `300 ${scorePx}px Georgia, serif`;
  ctx.fillText(String(hudState.displayScore | 0), cx, y);
  y += scorePx * 0.85;

  // Breakdown line: only shows non-zero components, joined by interpunct.
  const parts = [];
  const b = game.breakdown || {};
  if (b.pop)     parts.push(`pops ${b.pop}`);
  if (b.cluster) parts.push(`clusters ${b.cluster}`);
  if (b.drop)    parts.push(`drops ${b.drop}`);
  if (b.chain)   parts.push(`chains ${b.chain}`);
  if (b.combo)   parts.push(`combos ${b.combo}`);
  if (b.clear)   parts.push(`clear ${b.clear}`);
  if (parts.length) {
    ctx.fillStyle = `rgba(245, 233, 201, ${HUD_OPACITY.secondary})`;
    ctx.font = `400 ${linePx}px Georgia, serif`;
    ctx.fillText(parts.join(' · '), cx, y);
    y += linePx * 1.6;
  }

  // Best line. If we just set a new best, the ribbon glows in moonHalo orange.
  const isNewBest = settings.bestScore != null && game.score >= settings.bestScore && game.score > 0;
  ctx.font = `italic 400 ${linePx * 1.05}px Georgia, serif`;
  if (isNewBest) {
    ctx.fillStyle = PALETTE.moonHalo;
    ctx.fillText(`✦ new personal best ✦`, cx, y);
  } else if (settings.bestScore) {
    ctx.fillStyle = `rgba(245, 233, 201, ${HUD_OPACITY.soft})`;
    ctx.fillText(`best ${settings.bestScore}`, cx, y);
  }
  y += linePx * 2.2;

  ctx.fillStyle = `rgba(245, 233, 201, ${HUD_OPACITY.secondary})`;
  ctx.font = `400 ${ctaPx}px Georgia, serif`;
  const cta = won ? `tap for stage ${game.level + 1}` : 'tap to try again';
  ctx.fillText(cta, cx, y);
  ctx.restore();
}
