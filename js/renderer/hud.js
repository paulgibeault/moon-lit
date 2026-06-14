import { PALETTE, PERF_CONFIG, levelConfig, COLOR_KEYS, COLORS, COMBO_POWERS } from '../constants.js';
import { STENCIL_PACKS } from '../stencil-packs.js';
import { PHASE, comboPowersActive } from '../game.js';
import { puzzleConfig } from '../puzzles.js';
import {
  SERIF, SANS, HUD_OPACITY,
  formatScore, hudPx, fontScaleOf, hexToRgba, PERF_MODE,
} from './style.js';
import { getMoonState, drawPhaseShadow, drawLantern } from './world.js';
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
  if (game && game.quickRestartArmed) {
    const elapsed = performance.now() - game.quickRestartArmedTime;
    if (elapsed < 3050) {
      return false;
    }
  }
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

// Descent meter — a right-anchored row of little moons, one extinguishing as
// each shot (or second) ticks away. The lit moons tint cream → amber as the
// row empties and throb toward ember in the final beat; the exact count sits
// subtly beneath, present but never shifting the layout. Anchored opposite the
// score panel so the chrome reads as two clusters with the river in between.
const DESCENT_BAR_TOP = 10;
const DESCENT_MAX_PIPS = 8;

export function drawDescentMeter(ctx, layout, game, settings) {
  if (game.isPuzzleMode && game.puzzleDescentType === 'none') {
    return;
  }
  const isSpeed = !!game.isSpeedMode;

  if (isSpeed) {
    if (game.timeUntilDescent == null) return;
  } else {
    if (game.shotsUntilDescent == null) return;
  }

  const n = isSpeed ? Math.ceil(game.timeUntilDescent) : (game.shotsUntilDescent | 0);
  const cap = (isSpeed ? game.descentTimeLimit : (game.descentShots | 0)) || 8;
  const remaining = isSpeed ? game.timeUntilDescent : n;
  const frac = Math.max(0, Math.min(1, remaining / cap));

  // One pip per shot up to the cap; above it (only the low-pressure early
  // levels and timed modes run that high) the row caps out and each pip stands
  // for a fraction, so the meter never overruns the corner.
  const capUnits = Math.max(1, Math.round(cap));
  const pipCount = Math.min(capUnits, DESCENT_MAX_PIPS);
  const lit = Math.max(0, Math.min(pipCount, Math.ceil(frac * pipCount)));

  // Imminent-descent warning: in the final beat the lit moons throb toward a
  // warm ember and swell, so the threat registers in peripheral vision during
  // a frantic end game. Timed (≤2s) and shot-based (last shot) each trigger it.
  const reduced = !!(settings && settings.reducedMotion);
  const imminent = isSpeed ? (game.timeUntilDescent <= 2.0) : (n <= 1);
  const pulse = (imminent && !reduced)
    ? 0.5 + 0.5 * Math.sin(performance.now() / 1000 * (isSpeed ? 7 : 5))
    : 0;
  const canGlow = !reduced && !(PERF_CONFIG.disableMobileShadows && PERF_MODE);

  // Lit moons: cream when the meter is full, amber as it empties, ember on the
  // imminent throb.
  const lowHex = hexLerpHex(PALETTE.moonHalo, DESCENT_DANGER, imminent ? pulse : 0);
  const moonHex = hexLerpHex(PALETTE.moon, lowHex, 1 - frac);

  const pipR = hudPx(layout, 0.22, 3.5, settings);
  const gap = pipR * 1.3;
  const step = pipR * 2 + gap;
  const rowW = pipCount * pipR * 2 + (pipCount - 1) * gap;
  const right = layout.viewW - 12;
  const left = right - rowW;
  const cy = DESCENT_BAR_TOP + pipR + 2;
  const rowCx = (left + right) / 2;

  ctx.save();
  for (let i = 0; i < pipCount; i++) {
    const px = left + pipR + i * step;
    if (i < lit) {
      // A lit moon: soft halo + glowing disc. The edge moon (next to go) and,
      // in the imminent beat, the whole row swells on the pulse.
      const isEdge = i === lit - 1;
      const rr = pipR * ((imminent || isEdge) ? 1 + 0.16 * pulse : 1);
      if (canGlow) {
        ctx.shadowColor = imminent ? DESCENT_DANGER : PALETTE.moonHalo;
        ctx.shadowBlur = imminent ? 5 * (0.5 + pulse) : 3;
      }
      const halo = ctx.createRadialGradient(px, cy, 0, px, cy, rr * 2.1);
      halo.addColorStop(0, hexToRgba(moonHex, 0.45));
      halo.addColorStop(1, hexToRgba(moonHex, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(px, cy, rr * 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = hexToRgba(moonHex, HUD_OPACITY.strong);
      ctx.beginPath();
      ctx.arc(px, cy, rr, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // A spent moon: a faint empty ring holding its place in the row.
      ctx.strokeStyle = hexToRgba(PALETTE.moon, HUD_OPACITY.faint);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, cy, pipR, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;

  // Exact count — kept visible but subtle, tucked beneath the row so it never
  // shifts the layout. n is shots remaining, or whole seconds in timed modes.
  const numPx = hudPx(layout, 0.40, 9, settings);
  const numY = cy + pipR + 2;
  ctx.font = `italic 500 ${numPx}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = hexToRgba(imminent ? DESCENT_DANGER : PALETTE.moon, HUD_OPACITY.soft);
  ctx.fillText(String(n), rowCx, numY);

  // Hairline mode hint under the count — semantic for first-timers, invisible
  // to anyone who already knows the icon.
  const subPx = hudPx(layout, 0.32, 7.5, settings);
  ctx.font = `400 ${subPx}px ${SANS}`;
  ctx.fillStyle = `rgba(245, 233, 201, ${HUD_OPACITY.faint})`;
  ctx.fillText(isSpeed ? 'time drop' : 'descent', rowCx, numY + numPx + 1);
  ctx.restore();
}

// Warm ember the descent readout throbs toward in its final beat — past the
// ambient moon→amber tint into a clear "about to drop" warning.
const DESCENT_DANGER = '#E8843E';

// Linear interpolation between two hex colors, returning a hex string.
function hexLerpHex(hexA, hexB, t) {
  const ra = parseInt(hexA.slice(1, 3), 16), ga = parseInt(hexA.slice(3, 5), 16), ba = parseInt(hexA.slice(5, 7), 16);
  const rb = parseInt(hexB.slice(1, 3), 16), gb = parseInt(hexB.slice(3, 5), 16), bb = parseInt(hexB.slice(5, 7), 16);
  const to2 = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${to2(ra + (rb - ra) * t)}${to2(ga + (gb - ga) * t)}${to2(ba + (bb - ba) * t)}`;
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

  // Subtext: "stage N · best M" or "puzzle N · name · goal"
  let sub = `stage ${game.level}`;
  if (game.isPuzzleMode) {
    const pz = puzzleConfig(game.puzzleId);
    const goalName = pz.goalType === 'clear-targets' ? 'target' : 'clear all';
    sub = `puzzle ${game.puzzleId} · ${pz.name} · ${goalName}`;
  } else if (settings.bestScore) {
    sub += ` · best ${formatScore(settings.bestScore)}`;
  }
  ctx.fillStyle = `rgba(245, 233, 201, ${HUD_OPACITY.soft})`;
  ctx.font = `400 ${subPx}px Georgia, ${SANS}`;
  const subX = edge;
  ctx.fillText(sub, subX, 8 + fontPx + 2);

  // Combo badge — silent until the player is actually chaining. When the
  // chain ends, the badge disappears with the next render and the celebration
  // lives entirely in the world-side "combo ×N" float.
  const comboY = 8 + fontPx + subPx + 6;
  drawComboBadge(ctx, layout, game, settings, subX, comboY, align);
  // Combo-power readout (Moonrise meter + charges, Moonburst-ready) sits a
  // line below the combo badge. Persists after a chain breaks — banked
  // charges and a loaded burst outlive the combo that earned them.
  drawComboPowers(ctx, layout, game, settings, subX, comboY + hudPx(layout, 0.62, 12, settings) * 1.3, align);

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

// Last-drawn pip geometry (screen space), published by drawComboPowers so the
// spent-charge flight can launch from the exact slot it left.
let comboPowerGeom = null;

// Bright departure flash on a just-spent Moonrise pip. `fp` is flight progress
// 0→1. A hot white core (brightest at ignition) inside a warm bloom, plus an
// expanding shockwave ring — punchy enough to catch the eye even though the
// pip itself is tiny. Additive so it reads as light, not paint.
function drawPipFlash(ctx, cx, cy, pipR, fp) {
  const k = Math.max(0, 1 - fp);            // overall brightness 1 → 0
  const e = 1 - (1 - fp) * (1 - fp);        // ease-out expansion 0 → 1
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Warm bloom.
  const R = pipR * (1.6 + e * 3.0);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0,   `rgba(255, 248, 230, ${(0.95 * k).toFixed(3)})`);
  g.addColorStop(0.4, `rgba(248, 206, 140, ${(0.55 * k).toFixed(3)})`);
  g.addColorStop(1,   'rgba(248, 206, 140, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();
  // Hot white core — peaks hard at ignition, gone by mid-flight.
  ctx.fillStyle = `rgba(255, 255, 252, ${(0.9 * k * k).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(cx, cy, pipR * (0.9 + 0.4 * k), 0, Math.PI * 2);
  ctx.fill();
  // Expanding shockwave ring.
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `rgba(255, 244, 214, ${(0.85 * k).toFixed(3)})`;
  ctx.lineWidth = 2.2 * k + 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, pipR * (1 + e * 2.4), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Combo-power readout: the Moonrise charge pips + filling meter, then a
// Moonburst-ready sparkle. Drawn only in modes that run the powers, and only
// once there's something to show, so it stays invisible during early/quiet
// play. Left-anchored to match the score panel.
function drawComboPowers(ctx, layout, game, settings, x, y, align) {
  if (!comboPowersActive(game)) return;
  const charges = game.moonriseCharges | 0;
  const meter = game.moonMeter || 0;
  const ready = !!game.moonburstReady;
  const spend = game.moonriseSpend;
  const spendActive = !!(spend && spend.t < spend.life);
  const labelActive = !!(game.statusMsg && game.statusMsg.t < game.statusMsg.life);
  // Keep the row up while a charge is flying out or a status message is
  // showing, so the readout doesn't blink away under its own callout.
  if (charges === 0 && meter <= 0 && !ready && !spendActive && !labelActive) return;

  const px = hudPx(layout, 0.52, 10, settings);
  const maxCharges = COMBO_POWERS.moonriseMaxCharges;
  const frac = charges >= maxCharges ? 1 : Math.max(0, Math.min(1, meter / COMBO_POWERS.moonriseFull));
  const pipR = px * 0.34;
  const gap = px * 0.5;
  const cy = y + px * 0.5;
  const pipX0 = x + pipR;
  const pipStep = pipR * 2 + gap * 0.5;
  // Publish pip geometry so the emptied-pip flash and the "tide held" label
  // anchor to exactly the right slot.
  comboPowerGeom = { pipX0, pipStep, pipR, cy };
  let cx = pipX0;

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  // Charge pips — a filled crescent per banked Moonrise, faint ring for empty.
  // The just-emptied slot during a spend gets a bright flash (drawPipFlash) so
  // the eye is unmistakably drawn to where the charge departed.
  for (let i = 0; i < maxCharges; i++) {
    if (i < charges) {
      drawCrescent(ctx, cx, cy, pipR, PALETTE.moonHalo, true);
    } else {
      ctx.strokeStyle = hexToRgba(PALETTE.moon, HUD_OPACITY.faint);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, pipR, 0, Math.PI * 2);
      ctx.stroke();
      if (spendActive && i === spend.pipIndex) {
        drawPipFlash(ctx, cx, cy, pipR, spend.t / spend.life);
      }
    }
    cx += pipStep;
  }

  // Meter bar — fills toward the next charge, tinting moon→halo as it nears full.
  cx += gap * 0.3;
  const barW = px * 4.2;
  const barH = px * 0.42;
  const barY = cy - barH / 2;
  ctx.fillStyle = hexToRgba(PALETTE.moon, HUD_OPACITY.faint);
  roundRectPath(ctx, cx, barY, barW, barH, barH / 2);
  ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = hexLerpRgba(PALETTE.moon, PALETTE.moonHalo, frac, HUD_OPACITY.strong);
    roundRectPath(ctx, cx, barY, Math.max(barH, barW * frac), barH, barH / 2);
    ctx.fill();
  }
  cx += barW + gap;

  // Moonburst-ready sparkle — a soft pulse so it reads as "armed, fire when ready".
  if (ready) {
    const tt = settings.reducedMotion ? 1 : 0.65 + 0.35 * Math.sin(performance.now() / 1000 * 4);
    ctx.globalAlpha = tt;
    drawSparkle(ctx, cx + pipR, cy, pipR * 1.6, PALETTE.moonHalo);
    ctx.globalAlpha = 1;
    ctx.font = `italic 600 ${px}px ${SERIF}`;
    ctx.fillStyle = hexToRgba(PALETTE.moonHalo, HUD_OPACITY.strong * tt);
    ctx.fillText('burst', cx + pipR * 2.6, cy);
  }
  ctx.restore();
}

// Unified status line for combo-power announcements (moonrise charged / tide
// held, moonburst ready / fired). One slot, one place to read it: anchored in
// HUD space just below the combo-power pip row, holding position while it fades
// in and out — no rise, so it never climbs into the readout above and the
// atmosphere stays calm. All such messages funnel through game.statusMsg.
export function drawStatusMessage(ctx, layout, game, settings) {
  const msg = game.statusMsg;
  if (!msg || msg.t >= msg.life) return;
  const geom = comboPowerGeom;
  const ax = geom ? geom.pipX0 - geom.pipR : MENU_RESERVE_PX;
  const rowY = geom ? geom.cy : hudPx(layout, 0.95, 14, settings) * 3.2;
  const pipR = geom ? geom.pipR : hudPx(layout, 0.52, 10, settings) * 0.34;

  const tt = msg.t / msg.life;
  const px = hudPx(layout, 0.62, 12, settings);
  const fadeIn = Math.min(1, tt / 0.18);
  const fadeOut = Math.min(1, (1 - tt) / 0.35);
  const alpha = Math.min(fadeIn, fadeOut);

  // Fixed position just below the pip row — fades in place, never moves.
  const y = rowY + pipR + px * 0.9;

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 700 ${px}px ${SERIF}`;
  if (!settings.reducedMotion && !(PERF_CONFIG.disableMobileShadows && PERF_MODE)) {
    ctx.shadowColor = PALETTE.moonHalo;
    ctx.shadowBlur = 8;
  }
  ctx.fillStyle = hexToRgba(PALETTE.moonHalo, 0.96 * alpha);
  ctx.fillText(msg.text, ax, y);
  ctx.restore();
}

// Rounded-rectangle path helper for the meter bar. Falls back to a plain rect
// where roundRect isn't available.
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
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

  // Close ✕ button hit area in top-right of the card
  const closeBtnSize = 28 * fs;
  const closeBtn = {
    x: cardX + cardW - closeBtnSize - 16 * fs,
    y: cardY + 16 * fs,
    w: closeBtnSize,
    h: closeBtnSize,
    label: '✕',
    action: 'dismiss',
    enabled: true
  };

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

  // Render close button (✕)
  ctx.save();
  const ccx = closeBtn.x + closeBtn.w / 2;
  const ccy = closeBtn.y + closeBtn.h / 2;
  
  // A subtle circular hover-like boundary to make it look premium
  ctx.fillStyle = 'rgba(245, 233, 201, 0.03)';
  ctx.beginPath();
  ctx.arc(ccx, ccy, closeBtnSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(232, 183, 112, 0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // The ✕ itself
  ctx.strokeStyle = 'rgba(245, 233, 201, 0.7)';
  ctx.lineWidth = 1.8 * fs;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const offset = 4.5 * fs;
  ctx.moveTo(ccx - offset, ccy - offset); ctx.lineTo(ccx + offset, ccy + offset);
  ctx.moveTo(ccx + offset, ccy - offset); ctx.lineTo(ccx - offset, ccy + offset);
  ctx.stroke();
  ctx.restore();

  const cx = viewW / 2;
  let y = cardY + 28 * fs;

  // Outcome Title
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const titlePx = Math.max(16, Math.round(18 * fs));
  ctx.fillStyle = won ? '#E8B770' : '#E8843E'; // Gold for win, warm orange for game over
  ctx.font = `600 ${titlePx}px ${SERIF}`;
  let titleText = "";
  if (game.isPuzzleMode) {
    titleText = won ? `Puzzle ${game.puzzleId} Cleared` : "Puzzle Failed";
  } else {
    titleText = won ? `Stage ${game.level} Cleared` : "Trellis Touched the Water";
  }
  ctx.fillText(titleText, cx, y);
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
  y += scorePx + 8 * fs;

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
  const boxH = 88 * fs; // Increased from 72 for better elegance and size
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

  const isPuzzle = game.isPuzzleMode;
  const nextNum = isPuzzle ? game.puzzleId + 1 : game.level + 1;
  let nextCfg = null;
  if (isPuzzle) {
    nextCfg = nextNum <= 50 ? puzzleConfig(nextNum) : null;
  } else {
    nextCfg = nextNum <= 1000 ? levelConfig(nextNum) : null;
  }

  ctx.save();
  ctx.fillStyle = 'rgba(232, 183, 112, 0.85)';
  ctx.font = `600 ${Math.round(10 * fs)}px ${SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  if ((!isPuzzle && nextNum <= 1000 && nextCfg) || (isPuzzle && nextNum <= 50 && nextCfg)) {
    ctx.fillText(isPuzzle ? `PUZZLE ${nextNum} PREVIEW` : `STAGE ${nextNum} PREVIEW`, boxX + 12 * fs, boxY + 10 * fs);

    const innerW = boxW - 20 * fs;
    const colCenter1 = boxX + 10 * fs + innerW / 6;
    const colCenter2 = boxX + 10 * fs + innerW / 2;
    const colCenter3 = boxX + 10 * fs + 5 * innerW / 6;
    const contentCenterY = boxY + 50 * fs;

    // Col 1: Mode
    const isNextSpeed = isPuzzle ? (nextCfg.descentType === 'time') : nextCfg.isSpeedMode;
    drawMiniModeIcon(ctx, isNextSpeed, colCenter1, contentCenterY - 10 * fs, fs * 2.4, '#F5E9C9', cardBg);
    ctx.fillStyle = 'rgba(245, 233, 201, 0.8)';
    ctx.font = `500 ${Math.round(11 * fs)}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isNextSpeed ? 'Timed' : 'Classic', colCenter1, contentCenterY + 16 * fs);

    // Col 2: Stencil Pack
    drawMiniStencilIcon(ctx, nextCfg.stencilPack, colCenter2, contentCenterY - 10 * fs, fs * 2.4, '#F5E9C9');
    ctx.fillStyle = 'rgba(245, 233, 201, 0.8)';
    ctx.font = `500 ${Math.round(11 * fs)}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shortNames = { plain: 'Plain', bugs: 'Insects', flowers: 'Flora', dragons: 'Dragons', random: 'Random' };
    ctx.fillText(shortNames[nextCfg.stencilPack] || nextCfg.stencilPack, colCenter2, contentCenterY + 16 * fs);

    // Col 3: Palette Colors
    const dotR = 4.5 * fs;
    const dotGap = dotR * 2.5;
    const nextColorsArray = isPuzzle ? nextCfg.colors : COLOR_KEYS.slice(0, nextCfg.colors);
    const startDotX = colCenter3 - ((nextColorsArray.length - 1) * dotGap) / 2;
    for (let c = 0; c < nextColorsArray.length; c++) {
      const key = nextColorsArray[c];
      ctx.fillStyle = COLORS[key];
      ctx.beginPath();
      ctx.arc(startDotX + c * dotGap, contentCenterY - 10 * fs, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(245, 233, 201, 0.8)';
    ctx.font = `500 ${Math.round(11 * fs)}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${nextColorsArray.length} Colors`, colCenter3, contentCenterY + 16 * fs);
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 600 ${Math.round(13 * fs)}px ${SERIF}`;
    ctx.fillStyle = '#E8B770';
    ctx.fillText(isPuzzle ? 'All puzzles completed! ✦' : 'All stages completed! ✦', boxX + boxW / 2, boxY + boxH / 2);
  }
  ctx.restore();

  // Navigation Buttons
  endOverlayHits.length = 0;

  const btnY = cardY + cardH - 52 * fs;
  const btnH = 36 * fs;
  const btnGap = 8 * fs;
  const btnPadX = 20 * fs;
  const btnW = (cardW - btnPadX * 2 - btnGap * 2) / 3;

  let reached = 1;
  if (isPuzzle) {
    let maxCleared = 0;
    if (stats && stats.puzzles) {
      for (let i = 1; i <= 50; i++) {
        if (stats.puzzles[String(i)] && stats.puzzles[String(i)].cleared) {
          maxCleared = Math.max(maxCleared, i);
        }
      }
    }
    reached = 50; // temporarily unlocked for testing
  } else {
    reached = 1000; // temporarily unlocked for testing
  }

  const prevBtn = {
    x: cardX + btnPadX,
    y: btnY,
    w: btnW,
    h: btnH,
    label: isPuzzle ? 'Puzzles' : 'Stages',
    action: 'prev',
    enabled: true,
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
    enabled: isPuzzle ? (nextNum <= 50 && nextNum <= reached) : (nextNum <= 1000 && nextNum <= reached),
  };

  // Push all to hit list so coordinates are checked on click
  endOverlayHits.push(prevBtn, restartBtn, nextBtn, closeBtn);

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

  let title = 'Timed Mode Introduced';
  let lines = [
    "The river flows faster now.",
    "Under the speed of the rising moon, the trellis",
    "descends automatically over time instead",
    "of counting your shots.",
    "",
    "Aim quickly and clear the lanterns",
    "before they touch the water!"
  ];
  let drawIcon = (ctx) => {
    ctx.save();
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
  };

  if (game.isPuzzleMode) {
    if (game.puzzleIntroCard === 'targets') {
      title = 'Target Mode Introduced';
      lines = [
        "Your goal is to clear the golden target lanterns.",
        "",
        "You can pop them directly or drop them.",
        "Unlike classic stages, you do NOT need",
        "to clear other lanterns on the board to win!",
        "",
        "Look for the glowing gold circles around targets."
      ];
      drawIcon = (ctx) => {
        ctx.save();
        ctx.strokeStyle = '#E8B770'; // Gold border
        ctx.lineWidth = 4 * fs;
        ctx.beginPath();
        ctx.arc(0, 0, 18 * fs, 0, Math.PI * 2);
        ctx.stroke();
        // Inner glowing core
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 18 * fs);
        grad.addColorStop(0, 'rgba(255, 220, 150, 0.6)');
        grad.addColorStop(1, 'rgba(255, 140, 50, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, 18 * fs, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
    } else if (game.puzzleIntroCard === 'blockers') {
      title = 'Stone Blockers Introduced';
      lines = [
        "Stone lanterns cannot be matched.",
        "",
        "To clear them, you must pop the normal lanterns",
        "holding them up so they drop into the water!",
        "",
        "Plan your shots to break their anchors."
      ];
      drawIcon = (ctx) => {
        ctx.save();
        drawLantern(ctx, 0, 0, 14 * fs, 'paper', { isBlocker: true });
        ctx.restore();
      };
    } else if (game.puzzleIntroCard === 'timed') {
      title = 'Timed Descent Introduced';
      lines = [
        "The river flows faster now.",
        "The trellis descends automatically",
        "over time — the whole board sinks",
        "toward the water.",
        "",
        "Aim quickly and finish the puzzle",
        "before the lanterns touch the water!"
      ];
      drawIcon = (ctx) => {
        ctx.save();
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
      };
    } else if (game.puzzleIntroCard === 'sinking') {
      title = 'Sinking Trellis Introduced';
      lines = [
        "The trellis slips as you launch.",
        "Every few shots, the whole board",
        "sinks one row toward the water.",
        "",
        "Waste no lanterns — solve the puzzle",
        "before the trellis reaches the river!"
      ];
      drawIcon = (ctx) => {
        ctx.save();
        ctx.strokeStyle = '#E8B770';
        ctx.lineWidth = 3 * fs;
        ctx.lineCap = 'round';
        // Three descending chevrons
        for (let i = 0; i < 3; i++) {
          const yy = (-12 + i * 9) * fs;
          ctx.globalAlpha = 0.4 + i * 0.3;
          ctx.beginPath();
          ctx.moveTo(-10 * fs, yy);
          ctx.lineTo(0, yy + 6 * fs);
          ctx.lineTo(10 * fs, yy);
          ctx.stroke();
        }
        ctx.restore();
      };
    }
  } else {
    if (game.level === 16) {
      title = 'Stone Blockers Introduced';
      lines = [
        "Stone lanterns cannot be matched.",
        "",
        "To clear them, you must pop the normal lanterns",
        "holding them up so they drop into the water!",
        "",
        "Plan your shots to break their anchors."
      ];
      drawIcon = (ctx) => {
        ctx.save();
        drawLantern(ctx, 0, 0, 14 * fs, 'paper', { isBlocker: true });
        ctx.restore();
      };
    }
  }

  // Title text
  const titlePx = Math.max(18, Math.round(18 * fs));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#F5E9C9'; // Cream
  ctx.font = `600 ${titlePx}px ${SERIF}`;
  ctx.fillText(title, cx, y);
  y += titlePx + 16 * fs;

  // Icon drawing
  const iconSize = 32 * fs;
  ctx.save();
  ctx.translate(cx, y + iconSize / 2);
  drawIcon(ctx);
  ctx.restore();
  y += iconSize + 22 * fs;

  // Explanation text
  const linePx = Math.max(12, Math.round(12.5 * fs));
  ctx.fillStyle = 'rgba(245, 233, 201, 0.85)';
  ctx.font = `400 ${linePx}px ${SERIF}`;

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

export function drawLanternInventory(ctx, layout, game, settings) {
  if (!game.isPuzzleMode) return;

  const pz = puzzleConfig(game.puzzleId);
  if (!pz || !pz.queue) return;

  // Gather all remaining lanterns (including current shot, next, after-next, and the rest of the queue)
  const list = [];
  if (game.queue.current) list.push(game.queue.current);
  if (game.queue.next) list.push(game.queue.next);
  if (game.queue.afterNext) list.push(game.queue.afterNext);
  for (let i = game.puzzleQueueIndex; i < pz.queue.length; i++) {
    list.push(pz.queue[i]);
  }

  if (list.length === 0) return;

  ctx.save();

  // Position in the top right, below the descent meter if one is active
  const hasDescentMeter = !game.isSpeedMode && game.puzzleDescentType !== 'none';
  const hasSpeedMeter = game.isSpeedMode;
  const topY = (hasDescentMeter || hasSpeedMeter) ? 68 : 12;
  const rightX = layout.viewW - 12;

  const lanternR = hudPx(layout, 0.44, 8, settings);
  const gap = lanternR * 2.8;
  const maxDisplay = 5;
  const displayCount = Math.min(maxDisplay, list.length);

  // Draw "Supply" label
  const labelPx = hudPx(layout, 0.42, 9, settings);
  ctx.font = `italic 500 ${labelPx}px Georgia, ${SANS}`;
  ctx.fillStyle = `rgba(245, 233, 201, ${HUD_OPACITY.soft})`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('supply', rightX, topY);

  const dotsY = topY + labelPx + 6;

  // Draw dots from right to left
  const totalDotsW = (displayCount - 1) * gap + lanternR * 2;
  const startX = rightX - totalDotsW;

  for (let i = 0; i < displayCount; i++) {
    const colorKey = list[i];
    const cx = startX + i * gap + lanternR;
    const cy = dotsY + lanternR;
    const isActive = i === 0;

    // Trailing lanterns recede — reduced alpha so they read as
    // "waiting in line" rather than competing for attention.
    if (!isActive) { ctx.save(); ctx.globalAlpha *= 0.4; }

    drawLantern(ctx, cx, cy, lanternR, colorKey, {
      lit: isActive,
      intensity: isActive ? 1.0 : 0.0,
      designId: null
    });

    if (!isActive) { ctx.restore(); }

    // Subtle warmth bleed for the active lantern — the same ember-halo
    // language used by board lanterns, just at HUD scale. The warm glow
    // bleeds slightly into its neighbors, selling "this one is alive."
    if (isActive) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glowR = lanternR * 2.2;
      const grad = ctx.createRadialGradient(cx, cy, lanternR * 0.2, cx, cy, glowR);
      grad.addColorStop(0,   'rgba(255, 220, 150, 0.18)');
      grad.addColorStop(0.5, 'rgba(255, 175, 95, 0.06)');
      grad.addColorStop(1,   'rgba(255, 140, 50, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Draw "+" if there are more
  if (list.length > maxDisplay) {
    const plusText = `+${list.length - maxDisplay}`;
    const plusPx = hudPx(layout, 0.46, 10, settings);
    ctx.font = `600 ${plusPx}px ${SANS}`;
    ctx.fillStyle = PALETTE.moon;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(plusText, rightX - totalDotsW + (displayCount * gap) + 2, dotsY + lanternR);
  }

  ctx.restore();
}

// Padding (px) added around the visible button when hit-testing taps, so a
// thumb that lands just shy of the glyph still restarts instead of falling
// through to the aim path and firing a lantern. See input.js.
export const QUICK_RESTART_HIT_PAD = 14;

export function getQuickRestartButtonRect(layout) {
  const size = layout.size;
  // Lantern-relative, but never smaller than a comfortable thumb target —
  // on small viewports size*1.2 collapsed to ~20px, which was hard to hit.
  const btnSize = Math.max(size * 1.2, 48);
  const margin = size * 0.6;
  const handedness = layout.handedness || 'right';
  const y = layout.viewH - margin - btnSize;
  // Place opposite the player's aiming hand.
  const x = handedness === 'left'
    ? layout.viewW - margin - btnSize  // bottom-right
    : margin;                          // bottom-left

  return { x, y, w: btnSize, h: btnSize };
}

export function drawQuickRestartButton(ctx, layout, game, settings) {
  if (!game || !layout) return;
  // Don't draw if game is over or intro card is active
  if (game.phase === PHASE.WIN || game.phase === PHASE.GAME_OVER || game.showModeIntroCard) return;

  const btn = getQuickRestartButtonRect(layout);
  const now = performance.now();
  
  // Auto-disarm check
  if (game.quickRestartArmed && (now - game.quickRestartArmedTime > 3000)) {
    game.quickRestartArmed = false;
  }

  const armed = game.quickRestartArmed;
  const fs = fontScaleOf(settings);
  
  ctx.save();
  
  // Coordinates
  const cx = btn.x + btn.w / 2;
  const cy = btn.y + btn.h / 2;
  const r = btn.w / 2;

  // Draw background circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (armed) {
    ctx.fillStyle = 'rgba(232, 183, 112, 0.08)'; // Subtle gold background
  } else {
    ctx.fillStyle = 'rgba(245, 233, 201, 0.02)'; // Extremely faint cream background
  }
  ctx.fill();

  // Draw border
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (armed) {
    ctx.strokeStyle = '#E8B770'; // Gold border
    ctx.lineWidth = 1.5;
    
    // Add gold glow
    if (typeof PERF_CONFIG !== 'undefined' && !(PERF_CONFIG.disableMobileShadows && PERF_MODE)) {
      ctx.shadowColor = '#E8B770';
      ctx.shadowBlur = 8;
    }
  } else {
    ctx.strokeStyle = 'rgba(245, 233, 201, 0.2)'; // Faint border
    ctx.lineWidth = 1.0;
  }
  ctx.stroke();
  ctx.shadowBlur = 0; // reset shadow

  // Draw reload/restart circular arrow icon
  ctx.beginPath();
  ctx.strokeStyle = armed ? '#E8B770' : 'rgba(245, 233, 201, 0.4)';
  ctx.lineWidth = armed ? 2.0 : 1.5;
  ctx.lineCap = 'round';
  
  // Circular arc (3/4 of a circle)
  const startAngle = -Math.PI / 2;
  const endAngle = Math.PI;
  const iconR = r * 0.45;
  ctx.arc(cx, cy, iconR, startAngle, endAngle, false);
  ctx.stroke();

  // Arrow head at start of arc (facing down/left)
  ctx.beginPath();
  ctx.fillStyle = armed ? '#E8B770' : 'rgba(245, 233, 201, 0.4)';
  const arrowSize = r * 0.18;
  
  // Arrow head triangle at (cx, cy - iconR) pointing right (clockwise)
  ctx.moveTo(cx, cy - iconR);
  ctx.lineTo(cx - arrowSize, cy - iconR - arrowSize * 0.5);
  ctx.lineTo(cx - arrowSize * 0.3, cy - iconR + arrowSize * 0.8);
  ctx.closePath();
  ctx.fill();

  // Draw "tap again" confirmation text (positioned above the button at the bottom of the screen)
  if (armed) {
    ctx.font = `italic 500 ${Math.round(9.5 * fs)}px Georgia, serif`;
    ctx.fillStyle = '#E8B770';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('tap again', cx, btn.y - 4);
  }

  ctx.restore();
}

export function drawLoadingOverlay(ctx, layout, game, settings) {
  if (!layout) return;
  const { viewW, viewH } = layout;
  const fs = fontScaleOf(settings);

  ctx.save();
  // Translucent dark backdrop
  ctx.fillStyle = 'rgba(10, 15, 34, 0.75)';
  ctx.fillRect(0, 0, viewW, viewH);

  const cx = viewW / 2;
  const cy = viewH / 2;

  // Pulse effect based on wall time
  const time = performance.now() / 1000;
  const pulse = Math.sin(time * 3) * 0.1 + 0.9; // 0.8 to 1.0 pulse

  // Soft glowing core
  const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40 * fs * pulse);
  glowGrad.addColorStop(0, 'rgba(232, 183, 112, 0.25)');
  glowGrad.addColorStop(1, 'rgba(232, 183, 112, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 40 * fs * pulse, 0, Math.PI * 2);
  ctx.fill();

  // Golden ring representing a moon / lantern outline
  ctx.strokeStyle = `rgba(232, 183, 112, ${0.4 + Math.sin(time * 3) * 0.15})`;
  ctx.lineWidth = 2 * fs;
  ctx.beginPath();
  ctx.arc(cx, cy, 18 * fs, 0, Math.PI * 2);
  ctx.stroke();

  // Serif text aligned with the game style
  const textPx = Math.max(14, Math.round(14 * fs));
  ctx.font = `italic 500 ${textPx}px Georgia, serif`;
  ctx.fillStyle = 'rgba(245, 233, 201, 0.8)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText("Drawing lanterns...", cx, cy + 30 * fs);

  ctx.restore();
}
