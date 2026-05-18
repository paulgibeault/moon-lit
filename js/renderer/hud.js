import { PALETTE } from '../constants.js';
import { PHASE } from '../game.js';
import {
  SERIF, SANS, HUD_OPACITY,
  formatScore, hudPx, fontScaleOf,
} from './style.js';

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

export function drawDescentMeter(ctx, layout, game, settings) {
  if (game.shotsUntilDescent == null) return;
  const fontPx = hudPx(layout, 0.55, 11, settings);
  // Lives opposite the score panel: score on the dominant side, descent
  // meter on the other corner.
  const handed = settings.handedness === 'left';
  const x = handed ? 12 : layout.viewW - 12;
  ctx.save();
  ctx.fillStyle = `rgba(245, 233, 201, ${HUD_OPACITY.soft})`;
  ctx.font = `500 ${fontPx}px ${SANS}`;
  ctx.textAlign = handed ? 'left' : 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`descent in ${game.shotsUntilDescent}`, x, 10);
  ctx.restore();
}

// Score panel anchored to the left (or right under handedness=left). Shows:
//   ☾ <score>          — moon glyph + tween-counted total
//     stage N · best M  — small subtext
//     ●●○○○            — combo dots, fill from cream to ember as combo grows
export function drawScoreHud(ctx, layout, game, settings) {
  const handed = settings.handedness === 'left';
  const fontPx = hudPx(layout, 0.95, 14, settings);
  const subPx  = hudPx(layout, 0.55, 11, settings);
  const align  = handed ? 'right' : 'left';
  const glyphPad = subPx * 0.7;

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'top';

  ctx.font = `600 ${fontPx}px Georgia, ${SANS}`;
  const scoreText = formatScore(hudState.displayScore | 0);
  const scoreW = ctx.measureText(scoreText).width;

  const moonR = fontPx * 0.32;
  const moonY = 8 + fontPx * 0.5;
  const moonX = handed
    ? layout.viewW - 12 - scoreW - glyphPad - moonR
    : 12 + moonR;
  ctx.fillStyle = PALETTE.moon;
  ctx.globalAlpha = HUD_OPACITY.strong;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = PALETTE.moon;
  const scoreTextX = handed ? layout.viewW - 12 : 12 + moonR * 2 + glyphPad;
  ctx.fillText(scoreText, scoreTextX, 8);

  // Subtext: "stage N · best M"
  let sub = `stage ${game.level}`;
  if (settings.bestScore) sub += ` · best ${formatScore(settings.bestScore)}`;
  ctx.fillStyle = `rgba(245, 233, 201, ${HUD_OPACITY.soft})`;
  ctx.font = `400 ${subPx}px Georgia, ${SANS}`;
  const subX = handed ? layout.viewW - 12 : 12;
  ctx.fillText(sub, subX, 8 + fontPx + 2);

  // Combo dots — five slots that fill cream → ember as the combo grows. At
  // combo ≥ 6 each filled dot becomes a four-point sparkle.
  drawComboDots(ctx, layout, game, settings, subX, 8 + fontPx + subPx + 6, align);

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

function drawComboDots(ctx, layout, game, settings, x, y, align) {
  const combo = game.combo | 0;
  const slots = 5;
  const dotR = hudPx(layout, 0.18, 3, settings);
  const gap  = dotR * 2.4;
  ctx.save();
  ctx.textBaseline = 'top';
  for (let i = 0; i < slots; i++) {
    const dx = align === 'right'
      ? x - i * gap - dotR
      : x + i * gap + dotR;
    const filled = i < combo;
    const sparkle = combo >= 6 && filled;
    if (sparkle) {
      drawSparkle(ctx, dx, y + dotR, dotR * 1.6, PALETTE.moonHalo);
    } else if (filled) {
      ctx.fillStyle = combo >= 3 ? PALETTE.moonHalo : PALETTE.moon;
      ctx.beginPath();
      ctx.arc(dx, y + dotR, dotR, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = `rgba(245, 233, 201, ${HUD_OPACITY.faint})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(dx, y + dotR, dotR * 0.95, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
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
