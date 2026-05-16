import { COLORS, PALETTE } from '../constants.js';
import { launcherTip, traceAimLine, PHASE } from '../game.js';
import { getLanternSprite, getBackgroundFrame } from '../assets.js';
import {
  SERIF, SANS, HUD_OPACITY,
  easeOut, mixWithWhite, mixWithBlack,
} from './style.js';

// ─── Sky, moon, bamboo ──────────────────────────────────────────────────────

export function drawBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, PALETTE.bgTop);
  grad.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// The moon is the game's quiet celebration meter: its halo grows with the
// current combo, and a one-shot pulse expands when the player crosses a
// score milestone. Reduced motion skips the halo entirely.
export function drawMoon(ctx, w, h, game, settings) {
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
export function drawFrame(ctx, viewW, viewH) {
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

export function drawDeadLine(ctx, layout) {
  const { viewW, deadLineY } = layout;
  ctx.save();
  ctx.strokeStyle = `rgba(245, 233, 201, ${HUD_OPACITY.hairline})`;
  ctx.setLineDash([2, 10]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, deadLineY);
  ctx.lineTo(viewW, deadLineY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ─── Board + lanterns ──────────────────────────────────────────────────────

export function drawBoard(ctx, layout, board) {
  const { size } = layout;
  const animY = board.descentAnimY || 0;
  for (const l of board.lanterns) {
    let dx = l.x, dy = l.y;
    if (l.anim) {
      const e = easeOut(l.anim.t);
      dx = l.anim.fromX + (l.x - l.anim.fromX) * e;
      dy = l.anim.fromY + (l.y - l.anim.fromY) * e;
    }
    drawLantern(ctx, dx, dy + animY, size, l.color);
  }
}

export function drawLantern(ctx, cx, cy, size, colorKey) {
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

// ─── Launcher, shot queue, aim line, projectile ─────────────────────────────

// Bamboo cradle: a short post + curved "U" that holds the loaded lantern
// above the tip, fully visible. Rotates with aim. The static base sits at the
// tip and does not rotate, so the launcher feels anchored on the river.
export function drawLauncher(ctx, layout, game) {
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

export function drawShotQueue(ctx, layout, game, settings) {
  const tip = launcherTip(layout);
  const off = layout.size * 3.0;
  const nx = tip.x + off;
  const ny = tip.y;
  ctx.save();
  ctx.globalAlpha = HUD_OPACITY.strong;
  drawLantern(ctx, nx, ny, layout.size * 0.7, game.queue.next);
  ctx.restore();

  const fs = Math.max(0.5, settings && settings.fontScale ? settings.fontScale : 1);
  ctx.fillStyle = `rgba(245, 233, 201, ${HUD_OPACITY.secondary})`;
  ctx.font = `${Math.round(10 * fs)}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('next', nx, ny + layout.size * 0.95);
}

export function drawAimLine(ctx, layout, game) {
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
    ctx.globalAlpha = HUD_OPACITY.faint;
    drawLantern(ctx, trace.settle.x, trace.settle.y, layout.size, game.queue.current);
    ctx.restore();
  }
}

export function drawProjectile(ctx, shot, layout) {
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
