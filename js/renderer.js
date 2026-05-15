import {
  COLORS, PALETTE, GRID,
  BOARD_MARGIN_TOP, BOARD_MARGIN_BOTTOM, BOARD_MARGIN_SIDE,
  TRELLIS_HEIGHT, DEAD_LINE_OFFSET, LANE_LANTERNS,
  LAUNCHER_BOTTOM_MARGIN, MIN_LANTERN_RADIUS,
  BURST_SCALE,
} from './constants.js';
import { launcherTip, traceAimLine, PHASE } from './game.js';
import { getLanternSprite, getBurstSheet, getBackgroundFrame } from './assets.js';

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

const SQRT3 = Math.sqrt(3);

// Build a viewport-derived layout. Lantern radius is sized to fit `cols`
// lanterns plus LANE_LANTERNS bounce-lanes on each side, and to fit
// `maxRows` close-packed rows between trellis and dead-line.
export function computeLayout(viewW, viewH, cols = GRID.cols, maxRows = GRID.maxRows) {
  const availW = viewW - BOARD_MARGIN_SIDE * 2;
  const availH = viewH - BOARD_MARGIN_TOP - BOARD_MARGIN_BOTTOM;
  // Width budget: 2r per lantern in the widest (even) row + 2r*LANE_LANTERNS
  // per side. Odd rows are narrower (cols-1 lanterns offset by r), so they
  // sit fully within the even-row strip and contribute no extra width.
  const sizeFromW = availW / (2 * (cols + 2 * LANE_LANTERNS));
  // Height budget: 2r (top row) + (maxRows-1)*sqrt(3)*r + DEAD_LINE_OFFSET.
  const sizeFromH = (availH - DEAD_LINE_OFFSET) / (2 + (maxRows - 1) * SQRT3);
  const size = Math.max(MIN_LANTERN_RADIUS, Math.floor(Math.min(sizeFromW, sizeFromH)));
  const r = size;

  const lanternStripW = 2 * r * cols;
  const laneW = 2 * r * LANE_LANTERNS;
  const totalPlayW = lanternStripW + 2 * laneW;
  const playLeft = BOARD_MARGIN_SIDE + (availW - totalPlayW) / 2;

  const wallLeft  = playLeft;
  const wallRight = playLeft + totalPlayW;
  const originX   = playLeft + laneW + r;  // center of (col 0, even row 0)

  const trellisY = BOARD_MARGIN_TOP + TRELLIS_HEIGHT;
  const lastRowCenterY = trellisY + r + (maxRows - 1) * SQRT3 * r;
  const deadLineY = lastRowCenterY + r + DEAD_LINE_OFFSET;
  const tipY = viewH - LAUNCHER_BOTTOM_MARGIN;

  return {
    size: r, originX, trellisY, deadLineY, tipY,
    cols, maxRows,
    viewW, viewH,
    wallLeft, wallRight,
  };
}

export function render(ctx, layout, game, settings) {
  tweenHud(game, settings);

  const { viewW, viewH } = layout;
  drawBackground(ctx, viewW, viewH);
  drawMoon(ctx, viewW, viewH, game, settings);
  drawFrame(ctx, viewW, viewH);
  drawBoard(ctx, layout, game.board);
  drawDeadLine(ctx, layout);
  if (game.phase === PHASE.AIMING) {
    drawAimLine(ctx, layout, game);
  }
  drawLauncher(ctx, layout, game);
  drawShotQueue(ctx, layout, game);
  if (game.shot) drawProjectile(ctx, game.shot, layout);
  drawBursts(ctx, layout, game, settings);
  drawFloats(ctx, layout, game, settings);
  drawScoreHud(ctx, layout, game, settings);
  drawDescentMeter(ctx, layout, game, settings);
  if (game.phase === PHASE.WIN || game.phase === PHASE.GAME_OVER) {
    drawEndOverlay(ctx, layout, game, settings);
  }
}

// Cubic ease-out — every animation in this file uses it for consistency
// with the game's "no bounce, no overshoot" feel.
function easeOut(t) { return 1 - (1 - t) ** 3; }

// Closes ~12% of the gap each frame at 60fps; instant under reducedMotion.
// Good enough for a counter — no need for a real spring.
function tweenHud(game, settings) {
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

function drawDescentMeter(ctx, layout, game, settings) {
  if (game.shotsUntilDescent == null) return;
  const fontPx = hudPx(layout, 0.55, 11, settings);
  // Lives opposite the score panel: score on the dominant side, descent
  // meter on the other corner.
  const handed = settings.handedness === 'left';
  const x = handed ? 12 : layout.viewW - 12;
  ctx.save();
  ctx.fillStyle = 'rgba(245, 233, 201, 0.55)';
  ctx.font = `500 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = handed ? 'left' : 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`descent in ${game.shotsUntilDescent}`, x, 10);
  ctx.restore();
}

// Stage-clear / game-over panel. Shows a tween-counted score, the per-component
// breakdown, the player name, and a "new best" ribbon if the score is fresh.
function drawEndOverlay(ctx, layout, game, settings) {
  const { viewW, viewH } = layout;
  const won = game.phase === PHASE.WIN;
  const fs = Math.max(0.5, settings.fontScale || 1);

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
  ctx.font = `600 ${titlePx}px "Georgia", "Times New Roman", serif`;
  ctx.fillText(won ? `Stage ${game.level} cleared` : 'The trellis touched the water', cx, y);
  y += titlePx * 1.2;

  if (settings.playerName) {
    ctx.fillStyle = 'rgba(245, 233, 201, 0.6)';
    ctx.font = `italic 400 ${linePx * 1.2}px "Georgia", serif`;
    ctx.fillText(settings.playerName, cx, y);
    y += linePx * 1.6;
  } else {
    y += linePx * 0.4;
  }

  // The headline number — counts up via the tween in tweenHud().
  ctx.fillStyle = PALETTE.moon;
  ctx.font = `300 ${scorePx}px "Georgia", serif`;
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
    ctx.fillStyle = 'rgba(245, 233, 201, 0.65)';
    ctx.font = `400 ${linePx}px "Georgia", serif`;
    ctx.fillText(parts.join(' · '), cx, y);
    y += linePx * 1.6;
  }

  // Best line. If we just set a new best, the ribbon glows in moonHalo orange.
  const isNewBest = settings.bestScore != null && game.score >= settings.bestScore && game.score > 0;
  ctx.font = `italic 400 ${linePx * 1.05}px "Georgia", serif`;
  if (isNewBest) {
    ctx.fillStyle = PALETTE.moonHalo;
    ctx.fillText(`✦ new personal best ✦`, cx, y);
  } else if (settings.bestScore) {
    ctx.fillStyle = 'rgba(245, 233, 201, 0.55)';
    ctx.fillText(`best ${settings.bestScore}`, cx, y);
  }
  y += linePx * 2.2;

  ctx.fillStyle = 'rgba(245, 233, 201, 0.65)';
  ctx.font = `400 ${ctaPx}px "Georgia", serif`;
  const cta = won ? `tap for stage ${game.level + 1}` : 'tap to try again';
  ctx.fillText(cta, cx, y);
  ctx.restore();
}

// Score panel anchored to the left (or right under handedness=left). Shows:
//   ☾ <score>          — moon glyph + tween-counted total
//     stage N · best M  — small subtext
//     ●●○○○            — combo dots, fill from cream to ember as combo grows
function drawScoreHud(ctx, layout, game, settings) {
  const handed = settings.handedness === 'left';
  const fontPx = hudPx(layout, 0.95, 14, settings);
  const subPx  = hudPx(layout, 0.55, 11, settings);
  const x      = handed ? layout.viewW - 12 : 12;
  const align  = handed ? 'right' : 'left';
  const glyphPad = subPx * 0.7;

  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'top';

  // Subtle moon glyph next to the score; on the left side under default
  // handedness, on the right side under handedness=left.
  const moonR = fontPx * 0.32;
  const moonY = 8 + fontPx * 0.5;
  const moonX = handed
    ? layout.viewW - 12 - measureScoreWidth(ctx, fontPx) - glyphPad - moonR
    : 12 + moonR;
  ctx.fillStyle = PALETTE.moon;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = PALETTE.moon;
  ctx.font = `600 ${fontPx}px "Georgia", "Segoe UI", serif`;
  const scoreTextX = handed ? layout.viewW - 12 : 12 + moonR * 2 + glyphPad;
  ctx.fillText(formatScore(hudState.displayScore | 0), scoreTextX, 8);

  // Subtext: "stage N · best M"
  let sub = `stage ${game.level}`;
  if (settings.bestScore) sub += ` · best ${formatScore(settings.bestScore)}`;
  ctx.fillStyle = 'rgba(245, 233, 201, 0.55)';
  ctx.font = `400 ${subPx}px "Georgia", "Segoe UI", serif`;
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
    ctx.font = `600 ${fontPx}px "Georgia", serif`;
    ctx.fillText(formatScore(hudState.displayScore | 0), scoreTextX, 8);
    ctx.restore();
  }
  ctx.restore();
}

// Approximates score width without an extra measureText() call — keeps the
// HUD layout stable as the counter ticks up.
function measureScoreWidth(ctx, fontPx) {
  // Mid-width digit ~0.55em in Georgia; 5 digits is a fine default.
  return fontPx * 0.55 * 5;
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
      ctx.strokeStyle = 'rgba(245, 233, 201, 0.25)';
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

function formatScore(n) {
  return n.toLocaleString('en-US');
}

// Common HUD text sizing: layout-relative with a floor, multiplied by the
// SDK's font-scale setting so the launcher's accessibility slider works.
function hudPx(layout, factor, floor, settings) {
  const fs = Math.max(0.5, settings && settings.fontScale ? settings.fontScale : 1);
  return Math.max(floor, Math.round(layout.size * factor * fs));
}

// Floating spark labels rising from popped lanterns and centroids. Pop labels
// drift up like embers; cluster/drop/chain/combo labels rise farther and live
// longer so the player can read the bonus reason. Reduced motion: stationary
// fade in place.
function drawFloats(ctx, layout, game, settings) {
  if (!game.floats || !game.floats.length) return;
  const fs = Math.max(0.5, settings.fontScale || 1);
  const reducedMotion = settings.reducedMotion;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of game.floats) {
    const tt = f.t / f.life;
    if (tt < 0 || tt >= 1) continue;
    const e = easeOut(tt);
    const dy = reducedMotion ? 0 : -layout.size * (f.kind === 'pop' ? 1.4 : 2.2) * e;
    const fadeIn  = Math.min(1, tt / 0.1);
    const fadeOut = Math.min(1, (1 - tt) / 0.4);
    const alpha = Math.min(fadeIn, fadeOut);

    let color, weight, sizeFactor;
    if (f.kind === 'pop') {
      color = `rgba(245, 233, 201, ${0.95 * alpha})`;
      weight = 600; sizeFactor = 0.65;
    } else if (f.kind === 'cluster') {
      color = `rgba(232, 183, 112, ${0.95 * alpha})`;
      weight = 500; sizeFactor = 0.78;
    } else if (f.kind === 'drop') {
      color = `rgba(232, 183, 112, ${0.95 * alpha})`;
      weight = 600; sizeFactor = 0.95;
    } else if (f.kind === 'chain') {
      color = `rgba(245, 233, 201, ${0.95 * alpha})`;
      weight = 600; sizeFactor = 0.85;
    } else { // combo
      color = `rgba(232, 183, 112, ${0.95 * alpha})`;
      weight = 700; sizeFactor = 0.95;
    }
    const fontPx = Math.max(11, Math.round(layout.size * sizeFactor * fs));
    ctx.fillStyle = color;
    const italic = f.kind === 'pop' ? 'italic ' : '';
    ctx.font = `${italic}${weight} ${fontPx}px "Georgia", serif`;
    ctx.fillText(f.text, f.x, f.y + dy);
  }
  ctx.restore();
}

function drawBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, PALETTE.bgTop);
  grad.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// The moon is the game's quiet celebration meter: its halo grows with the
// current combo, and a one-shot pulse expands when the player crosses a
// score milestone. Reduced motion skips the halo entirely.
function drawMoon(ctx, w, h, game, settings) {
  const reducedMotion = settings.reducedMotion;
  const handed = settings.handedness === 'left';
  const cx = handed ? w * 0.22 : w * 0.78;
  const cy = h * 0.14;
  const r = Math.min(w, h) * 0.07;
  const combo = game.combo | 0;

  if (!reducedMotion) {
    // Combo lifts the halo from 1.0x at combo 0 to ~1.55x at combo 6+.
    const comboLift = Math.min(1, combo / 6) * 0.55;
    const haloR = r * (2.4 + comboLift);
    const haloAlpha = 0x33 + Math.round(0x40 * Math.min(1, combo / 6));
    const haloHex = ('00' + haloAlpha.toString(16)).slice(-2);
    const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, haloR);
    halo.addColorStop(0, PALETTE.moonHalo + haloHex);
    halo.addColorStop(1, PALETTE.moonHalo + '00');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();

    // Milestone pulse: a second halo expands and fades over its lifetime.
    const pulse = game.moonPulse;
    if (pulse && pulse.life > 0 && pulse.t < pulse.life) {
      const tt = pulse.t / pulse.life;
      const pulseR = r * (2.4 + 1.6 * easeOut(tt));
      const pulseAlpha = Math.round(0x55 * (1 - tt));
      const pulseHex = ('00' + pulseAlpha.toString(16)).slice(-2);
      const pHalo = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, pulseR);
      pHalo.addColorStop(0, PALETTE.moon + pulseHex);
      pHalo.addColorStop(1, PALETTE.moon + '00');
      ctx.fillStyle = pHalo;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = PALETTE.moon;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

// Bamboo frame overlay. Sits on top of the gradient sky and moon so the moon
// reads as glowing behind the bamboo. Cover-fits the viewport so the bamboo
// always fills the frame — sides crop in portrait viewports, which is
// preferable to letterboxing the sky.
function drawFrame(ctx, viewW, viewH) {
  const img = getBackgroundFrame(viewW, viewH);
  if (!img) return;
  const imgAr = img.width / img.height;
  const targetAr = viewW / viewH;
  let dw, dh, dx, dy;
  if (imgAr > targetAr) {
    dh = viewH;
    dw = viewH * imgAr;
    dx = (viewW - dw) / 2;
    dy = 0;
  } else {
    dw = viewW;
    dh = viewW / imgAr;
    dx = 0;
    dy = (viewH - dh) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawDeadLine(ctx, layout) {
  const { viewW, deadLineY } = layout;
  ctx.save();
  ctx.strokeStyle = 'rgba(245, 233, 201, 0.12)';
  ctx.setLineDash([2, 10]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, deadLineY);
  ctx.lineTo(viewW, deadLineY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// Match-pop bursts: a flipbook drawn additively so the sheet's black
// background drops out against the night sky. Reduced-motion skips the
// animation; the pop+drop still register through the board state change.
function drawBursts(ctx, layout, game, settings) {
  if (!game.effects || !game.effects.length) return;
  if (settings && settings.reducedMotion) return;
  const sheet = getBurstSheet();
  if (!sheet) return;
  const frameSize = sheet.frameSize;
  const totalFrames = sheet.frames;
  const dw = layout.size * 2 * BURST_SCALE;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const fx of game.effects) {
    const tt = fx.t / fx.life;
    if (tt < 0 || tt >= 1) continue;
    const frame = Math.min(totalFrames - 1, Math.floor(tt * totalFrames));
    ctx.drawImage(
      sheet.image,
      frame * frameSize, 0, frameSize, frameSize,
      fx.x - dw / 2, fx.y - dw / 2, dw, dw,
    );
  }
  ctx.restore();
}

function drawBoard(ctx, layout, board) {
  const { size } = layout;
  const animY = board.descentAnimY || 0;
  for (const l of board.lanterns) {
    let dx = l.x, dy = l.y;
    if (l.anim) {
      const t = l.anim.t < 0 ? 0 : l.anim.t > 1 ? 1 : l.anim.t;
      const e = 1 - (1 - t) ** 3;  // ease-out cubic
      dx = l.anim.fromX + (l.x - l.anim.fromX) * e;
      dy = l.anim.fromY + (l.y - l.anim.fromY) * e;
    }
    drawLantern(ctx, dx, dy + animY, size, l.color);
  }
}

function drawLantern(ctx, cx, cy, size, colorKey) {
  const sprite = getLanternSprite(colorKey);
  if (sprite) {
    // Fit the painted silhouette so its width fills 2*size (the cell width).
    // Height is proportional to the lamp's aspect ratio, so taller-than-wide
    // sprites overflow the cell vertically and look closer together.
    const { image, sx, sy, sw, sh } = sprite;
    const dw = 2 * size;
    const dh = dw * (sh / sw);
    drawWarmGlow(ctx, cx, cy + dh * 0.32, size);
    ctx.drawImage(image, sx, sy, sw, sh, cx - dw / 2, cy - dh / 2, dw, dh);
    return;
  }
  // Fallback: procedural circle if the sprite failed to load.
  const r = size;
  const fill = COLORS[colorKey] || PALETTE.ember;
  const grad = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
  grad.addColorStop(0, mixWithWhite(fill, 0.35));
  grad.addColorStop(0.7, fill);
  grad.addColorStop(1, mixWithBlack(fill, 0.4));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = mixWithBlack(fill, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Bamboo cradle: a short post + curved "U" that holds the loaded lantern
// above the tip, fully visible. Rotates with aim. The static base sits at the
// tip and does not rotate, so the launcher feels anchored on the river.
function drawLauncher(ctx, layout, game) {
  const tip = launcherTip(layout);
  const r = layout.size;
  const postLen   = r * 0.5;
  const cradleW   = r * 1.4;
  const cradleDip = r * 0.32;
  const stroke    = Math.max(2, r * 0.2);

  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(game.aimAngle);

  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.launcher;
  ctx.lineWidth = stroke;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -postLen);
  ctx.stroke();

  // Cradle: quadratic curve dipping down at the middle so the lantern rests in it.
  const sideY   = -postLen;
  const middleY = -postLen + cradleDip;
  const ctrlY   = sideY + 2 * cradleDip;
  ctx.strokeStyle = PALETTE.launcherRim;
  ctx.lineWidth = Math.max(2, r * 0.18);
  ctx.beginPath();
  ctx.moveTo(-cradleW / 2, sideY);
  ctx.quadraticCurveTo(0, ctrlY, cradleW / 2, sideY);
  ctx.stroke();

  // Lantern sits in the cradle while aiming. Once released, the staging area
  // is empty until the next lantern is queued up. Counter-rotate so it stays
  // visually upright while the cradle tilts with aim.
  if (game.phase === PHASE.AIMING) {
    const lanternY = middleY - r;
    ctx.save();
    ctx.translate(0, lanternY);
    ctx.rotate(-game.aimAngle);
    drawLantern(ctx, 0, 0, r, game.queue.current);
    ctx.restore();
  }

  ctx.restore();
}

function drawShotQueue(ctx, layout, game) {
  const tip = launcherTip(layout);
  const off = layout.size * 3.0;
  const nx = tip.x + off;
  const ny = tip.y;
  ctx.save();
  ctx.globalAlpha = 0.85;
  drawLantern(ctx, nx, ny, layout.size * 0.7, game.queue.next);
  ctx.restore();

  ctx.fillStyle = 'rgba(245, 233, 201, 0.6)';
  ctx.font = `${10 * 1}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('next', nx, ny + layout.size * 0.95);
}

function drawAimLine(ctx, layout, game) {
  const trace = traceAimLine(layout, game.board, game.aimAngle, 1);
  if (!trace || trace.points.length < 2) return;

  ctx.save();
  ctx.strokeStyle = PALETTE.aimLine;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([3, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(trace.points[0].x, trace.points[0].y);
  for (let i = 1; i < trace.points.length; i++) {
    ctx.lineTo(trace.points[i].x, trace.points[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  if (trace.settle) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    drawLantern(ctx, trace.settle.x, trace.settle.y, layout.size, game.queue.current);
    ctx.restore();
  }
}

function drawProjectile(ctx, shot, layout) {
  // Wobble is a render-only perpendicular offset, anchored to 0 at launch so
  // the lamp leaves the launcher cleanly. Physics follows the aim indicator.
  const t = shot.flightT || 0;
  const amp = shot.swayAmp || 0;
  const freq = shot.swayFreq || 0;
  const phase = shot.swayPhase || 0;
  const wobble = amp * (Math.sin(2 * Math.PI * freq * t + phase) - Math.sin(phase));
  const drawX = shot.x + (-shot.vy) * wobble;
  const drawY = shot.y + ( shot.vx) * wobble;
  drawLantern(ctx, drawX, drawY, layout.size, shot.color);
}

// Soft warm radial gradient painted under the lantern body so every lamp,
// regardless of its painted hue, reads as if lit by a warm flame inside.
// Uses 'lighter' compositing so the glow brightens the scene (and any
// neighboring lanterns) rather than overpainting them.
function drawWarmGlow(ctx, gx, gy, size) {
  const r = size * 1.7;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(gx, gy, size * 0.1, gx, gy, r);
  grad.addColorStop(0,    'rgba(255, 220, 150, 0.45)');
  grad.addColorStop(0.45, 'rgba(255, 170, 90, 0.18)');
  grad.addColorStop(1,    'rgba(255, 140, 50, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(gx, gy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function mixWithWhite(hex, t) { return mixHex(hex, '#FFFFFF', t); }
function mixWithBlack(hex, t) { return mixHex(hex, '#000000', t); }
function mixHex(a, b, t) {
  const ra = parseInt(a.slice(1, 3), 16), ga = parseInt(a.slice(3, 5), 16), ba = parseInt(a.slice(5, 7), 16);
  const rb = parseInt(b.slice(1, 3), 16), gb = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba + (bb - ba) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}
