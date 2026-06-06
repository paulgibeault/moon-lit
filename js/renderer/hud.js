import { PALETTE, PERF_CONFIG, levelConfig, COLOR_KEYS, COLORS } from '../constants.js';
import { STENCIL_PACKS } from '../stencil-packs.js';
import { PHASE } from '../game.js';
import {
  SERIF, SANS, HUD_OPACITY,
  formatScore, hudPx, fontScaleOf, hexToRgba, PERF_MODE,
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
  const isSpeed = !!game.isSpeedMode;
  
  if (isSpeed) {
    if (game.timeUntilDescent == null) return;
  } else {
    if (game.shotsUntilDescent == null) return;
  }

  const n = isSpeed ? Math.ceil(game.timeUntilDescent) : (game.shotsUntilDescent | 0);
  const cap = isSpeed ? game.descentTimeLimit : ((game.descentShots | 0) || 8);
  const progress = Math.max(0, Math.min(1, (cap - (isSpeed ? game.timeUntilDescent : n)) / cap));

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
  ctx.fillText(isSpeed ? 'time drop' : 'descent', cx, DESCENT_LINE_Y + 3);
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
    if (!(PERF_CONFIG.disableMobileShadows && PERF_MODE)) {
      ctx.shadowColor = PALETTE.moonHalo;
      ctx.shadowBlur = 20 * a;
    }
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
  // Apply Southern Hemisphere 180-degree rotation around the glyph's center
  if (layout && layout.handedness === 'left') {
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI);
    ctx.translate(-cx, -cy);
  }
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
  if (!settings.reducedMotion && !(PERF_CONFIG.disableMobileShadows && PERF_MODE)) {
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
export function drawEndOverlay(ctx, layout, game, settings, stats) {
  const { viewW, viewH } = layout;
  const won = game.phase === PHASE.WIN;
  const fs = fontScaleOf(settings);

  ctx.save();
  ctx.fillStyle = 'rgba(10, 15, 34, 0.85)';
  ctx.fillRect(0, 0, viewW, viewH);

  // Card layout dimensions
  const cardW = Math.min(350 * fs, viewW - 32);
  const cardH = Math.min(480 * fs, viewH - 40);
  const cardX = (viewW - cardW) / 2;
  const cardY = (viewH - cardH) / 2;

  // Draw card background (deep indigo panel)
  const cardBg = 'rgba(20, 26, 50, 0.96)';
  ctx.fillStyle = cardBg;
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, 12);
  ctx.fill();

  // Card gold border
  ctx.strokeStyle = '#E8B770'; // Gold
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Soft secondary inner border for visual depth
  ctx.strokeStyle = 'rgba(232, 183, 112, 0.15)';
  ctx.lineWidth = 1;
  roundedRectPath(ctx, cardX + 3 * fs, cardY + 3 * fs, cardW - 6 * fs, cardH - 6 * fs, 10);
  ctx.stroke();

  const cx = viewW / 2;
  let y = cardY + 28 * fs;

  // Outcome Title
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const titlePx = Math.max(16, Math.round(18 * fs));
  ctx.fillStyle = won ? '#E8B770' : '#E8843E'; // Gold for win, warm orange for game over
  ctx.font = `600 ${titlePx}px ${SERIF}`;
  ctx.fillText(won ? `Stage ${game.level} Cleared` : 'Trellis Touched the Water', cx, y);
  y += titlePx + 10 * fs;

  // Player Name (if set)
  if (settings.playerName) {
    ctx.fillStyle = 'rgba(245, 233, 201, 0.6)';
    ctx.font = `italic 400 ${Math.round(11 * fs)}px Georgia, serif`;
    ctx.fillText(settings.playerName, cx, y);
    y += 16 * fs;
  }

  // Score Display
  const scorePx = Math.max(36, Math.round(42 * fs));
  ctx.fillStyle = '#F5E9C9'; // Cream
  ctx.font = `300 ${scorePx}px Georgia, serif`;
  ctx.fillText(String(hudState.displayScore | 0), cx, y);
  y += scorePx * 0.75;

  // Personal Best line
  const isNewBest = settings.bestScore != null && game.score >= settings.bestScore && game.score > 0;
  const linePx = Math.max(11, Math.round(11 * fs));
  ctx.font = `italic 400 ${linePx}px Georgia, serif`;
  if (isNewBest) {
    ctx.fillStyle = '#E8B770'; // Gold
    ctx.fillText(`✦ new personal best ✦`, cx, y);
  } else if (settings.bestScore) {
    ctx.fillStyle = 'rgba(245, 233, 201, 0.4)';
    ctx.fillText(`best ${settings.bestScore}`, cx, y);
  }
  y += 22 * fs;

  // Divider 1
  drawDashedRule(ctx, cardX + 20 * fs, y, cardW - 40 * fs);
  y += 12 * fs;

  // Stats Grid (2 rows of 3 columns)
  const b = game.breakdown || {};
  const metrics = [
    { label: 'pops', value: b.pop || 0 },
    { label: 'clusters', value: b.cluster || 0 },
    { label: 'drops', value: b.drop || 0 },
    { label: 'chains', value: b.chain || 0 },
    { label: 'combos', value: b.combo || 0 },
    { label: 'clear', value: b.clear || 0 },
  ];
  const gridX = cardX + 20 * fs;
  const colW = (cardW - 40 * fs - 16 * fs) / 3;
  const colH = 34 * fs;
  const gridGap = 8 * fs;

  for (let i = 0; i < 6; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const bx = gridX + col * (colW + gridGap);
    const by = y + row * (colH + gridGap);

    const m = metrics[i];
    const active = m.value > 0;

    ctx.save();
    ctx.fillStyle = active ? 'rgba(245, 233, 201, 0.05)' : 'rgba(245, 233, 201, 0.02)';
    roundedRectPath(ctx, bx, by, colW, colH, 4 * fs);
    ctx.fill();

    ctx.strokeStyle = active ? 'rgba(232, 183, 112, 0.2)' : 'rgba(245, 233, 201, 0.05)';
    ctx.lineWidth = 1;
    roundedRectPath(ctx, bx, by, colW, colH, 4 * fs);
    ctx.stroke();

    // Value
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `600 ${Math.round(11 * fs)}px ${SANS}`;
    ctx.fillStyle = active ? '#F5E9C9' : 'rgba(245, 233, 201, 0.25)';
    ctx.fillText(String(m.value), bx + colW / 2, by + 4 * fs);

    // Label
    ctx.font = `400 ${Math.round(9 * fs)}px ${SANS}`;
    ctx.fillStyle = active ? 'rgba(245, 233, 201, 0.6)' : 'rgba(245, 233, 201, 0.18)';
    ctx.fillText(m.label, bx + colW / 2, by + 18 * fs);
    ctx.restore();
  }
  y += 2 * colH + gridGap + 14 * fs;

  // Divider 2
  drawDashedRule(ctx, cardX + 20 * fs, y, cardW - 40 * fs);
  y += 12 * fs;

  // Next Level Preview Box
  const boxX = cardX + 20 * fs;
  const boxW = cardW - 40 * fs;
  const boxH = 72 * fs;
  const boxY = y;

  ctx.save();
  ctx.fillStyle = 'rgba(245, 233, 201, 0.02)';
  roundedRectPath(ctx, boxX, boxY, boxW, boxH, 6 * fs);
  ctx.fill();
  ctx.strokeStyle = 'rgba(232, 183, 112, 0.12)';
  ctx.lineWidth = 1;
  roundedRectPath(ctx, boxX, boxY, boxW, boxH, 6 * fs);
  ctx.stroke();
  ctx.restore();

  const nextLevelNum = game.level + 1;
  const nextCfg = levelConfig(nextLevelNum);

  ctx.save();
  ctx.fillStyle = 'rgba(232, 183, 112, 0.85)';
  ctx.font = `600 ${Math.max(9, Math.round(9 * fs))}px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  if (nextLevelNum <= 1000 && nextCfg) {
    ctx.fillText(`STAGE ${nextLevelNum} PREVIEW`, boxX + 10 * fs, boxY + 8 * fs);

    const innerW = boxW - 20 * fs;
    const colCenter1 = boxX + 10 * fs + innerW / 6;
    const colCenter2 = boxX + 10 * fs + innerW / 2;
    const colCenter3 = boxX + 10 * fs + 5 * innerW / 6;
    const contentCenterY = boxY + 42 * fs;

    // Col 1: Mode
    drawMiniModeIcon(ctx, nextCfg.isSpeedMode, colCenter1, contentCenterY - 8 * fs, fs, '#F5E9C9', cardBg);
    ctx.fillStyle = 'rgba(245, 233, 201, 0.8)';
    ctx.font = `500 ${Math.round(10 * fs)}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nextCfg.isSpeedMode ? 'Timed' : 'Classic', colCenter1, contentCenterY + 12 * fs);

    // Col 2: Stencil Pack
    drawMiniStencilIcon(ctx, nextCfg.stencilPack, colCenter2, contentCenterY - 8 * fs, fs, '#F5E9C9');
    ctx.fillStyle = 'rgba(245, 233, 201, 0.8)';
    ctx.font = `500 ${Math.round(10 * fs)}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shortNames = { plain: 'Plain', bugs: 'Insects', flowers: 'Flora', dragons: 'Dragons', random: 'Random' };
    ctx.fillText(shortNames[nextCfg.stencilPack] || nextCfg.stencilPack, colCenter2, contentCenterY + 12 * fs);

    // Col 3: Palette Colors
    const dotR = 2.4 * fs;
    const dotGap = dotR * 2.5;
    const startDotX = colCenter3 - ((nextCfg.colors - 1) * dotGap) / 2;
    for (let c = 0; c < nextCfg.colors; c++) {
      const key = COLOR_KEYS[c];
      ctx.fillStyle = COLORS[key];
      ctx.beginPath();
      ctx.arc(startDotX + c * dotGap, contentCenterY - 8 * fs, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(245, 233, 201, 0.8)';
    ctx.font = `500 ${Math.round(10 * fs)}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${nextCfg.colors} Colors`, colCenter3, contentCenterY + 12 * fs);
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 600 ${Math.round(13 * fs)}px ${SERIF}`;
    ctx.fillStyle = '#E8B770';
    ctx.fillText('All stages completed! ✦', boxX + boxW / 2, boxY + boxH / 2);
  }
  ctx.restore();

  // Navigation Buttons
  endOverlayHits.length = 0;

  const btnY = cardY + cardH - 52 * fs;
  const btnH = 36 * fs;
  const btnGap = 8 * fs;
  const btnPadX = 20 * fs;
  const btnW = (cardW - btnPadX * 2 - btnGap * 2) / 3;

  const reached = Math.max(1, (stats && stats.bestLevel) | 0 || 1, game.level | 0) + (won ? 1 : 0);

  const prevBtn = {
    x: cardX + btnPadX,
    y: btnY,
    w: btnW,
    h: btnH,
    label: 'Previous',
    action: 'prev',
    enabled: game.level > 1,
  };

  const restartBtn = {
    x: cardX + btnPadX + btnW + btnGap,
    y: btnY,
    w: btnW,
    h: btnH,
    label: 'Restart',
    action: 'restart',
    enabled: true,
  };

  const nextBtn = {
    x: cardX + btnPadX + (btnW + btnGap) * 2,
    y: btnY,
    w: btnW,
    h: btnH,
    label: 'Next',
    action: 'next',
    enabled: nextLevelNum <= 1000 && nextLevelNum <= reached,
  };

  // Push all to hit list so coordinates are checked on click
  endOverlayHits.push(prevBtn, restartBtn, nextBtn);

  // Render the buttons
  drawButton(ctx, prevBtn, /*isPrimary=*/false, fs);
  drawButton(ctx, restartBtn, /*isPrimary=*/!won, fs); // Primary restart on loss
  drawButton(ctx, nextBtn, /*isPrimary=*/won, fs);     // Primary next on win

  ctx.restore();
}

export function drawModeIntroCard(ctx, layout, game, settings) {
  const { viewW, viewH } = layout;
  const fs = fontScaleOf(settings);

  ctx.save();
  // Translucent dark backdrop
  ctx.fillStyle = 'rgba(10, 15, 34, 0.88)';
  ctx.fillRect(0, 0, viewW, viewH);

  // Layout calculations
  const cardW = Math.min(340 * fs, viewW - 32);
  const cardH = Math.min(330 * fs, viewH - 32);
  const cardX = (viewW - cardW) / 2;
  const cardY = (viewH - cardH) / 2;

  // Draw card background
  ctx.fillStyle = 'rgba(20, 26, 50, 0.96)'; // Dark indigo card body
  roundedRectPath(ctx, cardX, cardY, cardW, cardH, 12);
  ctx.fill();

  // Card border
  ctx.strokeStyle = '#E8B770'; // Gold border
  ctx.lineWidth = 1.6;
  ctx.stroke();

  const cx = viewW / 2;
  let y = cardY + 28 * fs;

  // Title: "TIMED MODE"
  const titlePx = Math.max(18, Math.round(18 * fs));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#F5E9C9'; // Cream
  ctx.font = `600 ${titlePx}px ${SERIF}`;
  ctx.fillText('Timed Mode Introduced', cx, y);
  y += titlePx + 16 * fs;

  // Large glowing lightning bolt icon!
  const iconSize = 32 * fs;
  ctx.save();
  ctx.translate(cx, y + iconSize / 2);
  // Add a soft glow behind lightning bolt
  if (!(PERF_CONFIG.disableMobileShadows && PERF_MODE)) {
    ctx.shadowColor = '#E8B770';
    ctx.shadowBlur = 15;
  }
  ctx.fillStyle = '#E8B770';
  ctx.beginPath();
  ctx.moveTo(1 * fs, -15 * fs);
  ctx.lineTo(-7 * fs, 0 * fs);
  ctx.lineTo(-2 * fs, 0 * fs);
  ctx.lineTo(-4 * fs, 15 * fs);
  ctx.lineTo(6 * fs, 0 * fs);
  ctx.lineTo(1 * fs, 0 * fs);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  y += iconSize + 22 * fs;

  // Explanation text
  const linePx = Math.max(12, Math.round(12.5 * fs));
  ctx.fillStyle = 'rgba(245, 233, 201, 0.85)';
  ctx.font = `400 ${linePx}px ${SERIF}`;
  
  const lines = [
    "The river flows faster now.",
    "Under the speed of the rising moon, the trellis",
    "descends automatically over time instead",
    "of counting your shots.",
    "",
    "Aim quickly and clear the lanterns",
    "before they touch the water!"
  ];

  for (const line of lines) {
    if (line === "") {
      y += linePx * 0.6;
    } else {
      ctx.fillText(line, cx, y);
      y += linePx * 1.35;
    }
  }

  y = cardY + cardH - 32 * fs;
  
  // CTA
  const ctaPx = Math.max(11, Math.round(11 * fs));
  ctx.fillStyle = '#E8B770'; // Gold
  ctx.font = `italic 500 ${ctaPx}px ${SERIF}`;
  ctx.fillText('tap anywhere to begin', cx, y);

  ctx.restore();
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}

const endOverlayHits = [];

export function getEndOverlayHit(x, y) {
  for (const h of endOverlayHits) {
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
      return h.enabled ? h.action : null;
    }
  }
  return null;
}

function drawDashedRule(ctx, x, y, w) {
  ctx.save();
  ctx.strokeStyle = 'rgba(232, 183, 112, 0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.restore();
}

function drawButton(ctx, btn, isPrimary, fs) {
  ctx.save();
  if (btn.enabled) {
    if (isPrimary) {
      ctx.fillStyle = '#E8B770'; // Gold
      roundedRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 6 * fs);
      ctx.fill();
      ctx.fillStyle = '#0A0F22'; // Dark blue/black text
      ctx.font = `600 ${Math.round(13 * fs)}px ${SANS}`;
    } else {
      ctx.fillStyle = 'rgba(245, 233, 201, 0.04)';
      roundedRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 6 * fs);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245, 233, 201, 0.25)';
      ctx.lineWidth = 1;
      roundedRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 6 * fs);
      ctx.stroke();
      ctx.fillStyle = '#F5E9C9'; // Cream
      ctx.font = `500 ${Math.round(13 * fs)}px ${SANS}`;
    }
  } else {
    ctx.fillStyle = 'rgba(245, 233, 201, 0.01)';
    roundedRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 6 * fs);
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 233, 201, 0.06)';
    ctx.lineWidth = 1;
    roundedRectPath(ctx, btn.x, btn.y, btn.w, btn.h, 6 * fs);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245, 233, 201, 0.15)';
    ctx.font = `500 ${Math.round(13 * fs)}px ${SANS}`;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
  ctx.restore();
}

function drawMiniModeIcon(ctx, isSpeedMode, cx, cy, fs, color, bg = 'rgba(20, 26, 50, 0.96)') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (isSpeedMode) {
    // Lightning bolt
    ctx.beginPath();
    ctx.moveTo(cx + 1 * fs, cy - 5 * fs);
    ctx.lineTo(cx - 3 * fs, cy + 0 * fs);
    ctx.lineTo(cx - 1 * fs, cy + 0 * fs);
    ctx.lineTo(cx - 2 * fs, cy + 5 * fs);
    ctx.lineTo(cx + 3 * fs, cy - 0 * fs);
    ctx.lineTo(cx + 1 * fs, cy - 0 * fs);
    ctx.closePath();
    ctx.fill();
  } else {
    // Crescent Moon
    ctx.beginPath();
    ctx.arc(cx, cy, 3.8 * fs, 0, Math.PI * 2);
    ctx.fill();
    // crescent shadow
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx + 1.8 * fs, cy - 0.4 * fs, 3.6 * fs, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMiniStencilIcon(ctx, stencilPack, cx, cy, fs, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1 * fs;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stencilPack === 'plain') {
    // Circle outline
    ctx.beginPath();
    ctx.arc(cx, cy, 3.8 * fs, 0, Math.PI * 2);
    ctx.stroke();
  } else if (stencilPack === 'bugs') {
    // Bug outline
    ctx.beginPath();
    // Body line
    ctx.moveTo(cx, cy - 3.8 * fs);
    ctx.lineTo(cx, cy + 3.8 * fs);
    // Legs
    ctx.moveTo(cx - 3.2 * fs, cy - 1 * fs);
    ctx.lineTo(cx + 3.2 * fs, cy - 1 * fs);
    ctx.moveTo(cx - 3.2 * fs, cy + 1.5 * fs);
    ctx.lineTo(cx + 3.2 * fs, cy + 1.5 * fs);
    ctx.stroke();
    // Head dot
    ctx.beginPath();
    ctx.arc(cx, cy - 3.8 * fs, 0.9 * fs, 0, Math.PI * 2);
    ctx.fill();
  } else if (stencilPack === 'flowers') {
    // Simple flower
    for (let a = 0; a < Math.PI * 2; a += (Math.PI * 2) / 5) {
      const px = cx + Math.cos(a) * 2.2 * fs;
      const py = cy + Math.sin(a) * 2.2 * fs;
      ctx.beginPath();
      ctx.arc(px, py, 1 * fs, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 0.9 * fs, 0, Math.PI * 2);
    ctx.fill();
  } else if (stencilPack === 'dragons') {
    // Wave/Snake
    ctx.beginPath();
    ctx.moveTo(cx - 2.8 * fs, cy - 2.8 * fs);
    ctx.bezierCurveTo(cx + 2.8 * fs, cy - 2.8 * fs, cx - 2.8 * fs, cy + 2.8 * fs, cx + 2.8 * fs, cy + 2.8 * fs);
    ctx.stroke();
  } else if (stencilPack === 'random') {
    // 2x2 dot grid
    ctx.fillRect(cx - 2.2 * fs, cy - 2.2 * fs, 1.8 * fs, 1.8 * fs);
    ctx.fillRect(cx + 0.4 * fs, cy - 2.2 * fs, 1.8 * fs, 1.8 * fs);
    ctx.fillRect(cx - 2.2 * fs, cy + 0.4 * fs, 1.8 * fs, 1.8 * fs);
    ctx.fillRect(cx + 0.4 * fs, cy + 0.4 * fs, 1.8 * fs, 1.8 * fs);
  }
  ctx.restore();
}
