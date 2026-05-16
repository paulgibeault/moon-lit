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
    drawLantern(ctx, dx, dy + animY, size, l.color, { lit: true, phase: phaseOf(l) });
  }
}

// Stable [0, 2π) per-lantern phase so neighbors flicker out of sync. Derived
// from the lantern's normalized grid position so it survives serialization
// without needing a new persisted field.
function phaseOf(l) {
  const nx = l.nx || 0;
  const ny = l.ny || 0;
  const v = Math.sin(nx * 12.9898 + ny * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * Math.PI * 2;
}

// Combined slow + fast pulse, clamped so the lamp never goes fully dark.
// `intensity` (0..1) scales the whole ember — used by the ignite ramp on the
// in-flight shot so it brightens up after launch.
function emberLevel(phase, intensity) {
  const t = performance.now() / 1000;
  const slow = 0.10 * Math.sin(t * 1.8 + phase);
  const fast = 0.05 * Math.sin(t * 5.3 + phase * 1.7);
  return Math.max(0, Math.min(1.2, (0.88 + slow + fast) * intensity));
}

export function drawLantern(ctx, cx, cy, size, colorKey, opts) {
  const lit = opts ? !!opts.lit : false;
  const intensity = opts && opts.intensity != null ? opts.intensity : 1;
  const phase = opts && opts.phase != null ? opts.phase : 0;
  const level = lit ? emberLevel(phase, intensity) : 0;

  const sprite = getLanternSprite(colorKey);
  if (sprite) {
    // Fit the painted silhouette so its width fills 2*size (the cell width).
    // Height is proportional to the lamp's aspect ratio, so taller-than-wide
    // sprites overflow the cell vertically and look closer together.
    const { image, sx, sy, sw, sh } = sprite;
    const dw = 2 * size;
    const dh = dw * (sh / sw);
    // The mouth ellipse sits at SVG y=114 inside a viewBox that runs 0..125,
    // and the painted bbox starts around y=17. That puts the rim center at
    // (114-17) / (120.5-17) ≈ 0.94 of the painted height — i.e. dh*0.44 below
    // the lantern center in screen space. Anchor the fuel/flame there so they
    // sit at the flared mouth.
    const rimY = cy + dh * 0.44;
    if (lit) drawEmberHalo(ctx, cx, rimY, size, level);
    ctx.drawImage(image, sx, sy, sw, sh, cx - dw / 2, cy - dh / 2, dw, dh);
    if (lit) {
      // Soft ambient warmth in the lower body, sitting around the flame.
      drawEmberCore(ctx, cx, cy + dh * 0.28, size, level);
      // Vertical flame rising from the top of the puck. Drawn BEFORE the
      // puck so the puck covers the flame's base — only the portion above
      // the puck's top edge stays visible, reading as fire emerging from
      // the tar. The flame's upper body shines through the paper above
      // (via 'lighter' compositing) so the lower lantern looks fully alight.
      drawFlame(ctx, cx, rimY, size, level);
    }
    // Hockey-puck of burning tar — drawn last so it sits in front of the
    // flame's base. Always visible, lit or not.
    drawFuelCore(ctx, cx, rimY, size);
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

// Ambient warm bloom around the lantern, anchored at the flame so the bloom
// hangs from the mouth instead of haloing the lantern body uniformly. The
// reach is slightly larger than the lamp itself so neighboring lanterns share
// in the warmth — that's the visual "lift" of a lit field.
function drawEmberHalo(ctx, gx, gy, size, level) {
  const r = size * (2.0 + 0.3 * level);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(gx, gy, size * 0.1, gx, gy, r);
  grad.addColorStop(0,    `rgba(255, 220, 150, ${0.50 * level})`);
  grad.addColorStop(0.40, `rgba(255, 175, 95,  ${0.20 * level})`);
  grad.addColorStop(1,    'rgba(255, 140, 50, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(gx, gy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Hot pocket of light inside the lantern body, sitting just above the rim
// where the flame burns. 'lighter' compositing brightens the paper face from
// within without overpainting it.
function drawEmberCore(ctx, gx, gy, size, level) {
  const r = size * (1.0 + 0.18 * level);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
  grad.addColorStop(0,   `rgba(255, 245, 200, ${0.6 * level})`);
  grad.addColorStop(0.5, `rgba(255, 180, 90,  ${0.3 * level})`);
  grad.addColorStop(1,   'rgba(255, 140, 50, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(gx, gy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Hockey-puck fuel pellet drawn in three layers: a back-rim ellipse hidden
// behind the side wall, the cylindrical side wall bounded by the front arcs
// of both rims, and a warm-lit top face. Viewed slightly from above so the
// top reads as the up-facing surface caught by the lantern's interior light.
function drawFuelCore(ctx, gx, gy, size) {
  const w = size * 0.36;
  const halfW = w / 2;
  const topRy = size * 0.065;
  const sideH = size * 0.08;

  ctx.save();

  // Bottom rim. Drawn first; only its front-bottom arc remains visible after
  // the side wall is painted on top.
  ctx.fillStyle = '#070302';
  ctx.beginPath();
  ctx.ellipse(gx, gy + sideH, halfW, topRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cylindrical side wall. The path runs:
  //   left edge ↓ → bottom-rim front arc → right edge ↑ → top-rim front arc.
  // A vertical gradient dims the wall toward its base so the cylinder reads
  // as receding from the light above.
  const sideGrad = ctx.createLinearGradient(gx, gy, gx, gy + sideH);
  sideGrad.addColorStop(0, '#1d0e06');
  sideGrad.addColorStop(1, '#070302');
  ctx.fillStyle = sideGrad;
  ctx.beginPath();
  ctx.moveTo(gx - halfW, gy);
  ctx.lineTo(gx - halfW, gy + sideH);
  ctx.ellipse(gx, gy + sideH, halfW, topRy, 0, Math.PI, 0, true);
  ctx.lineTo(gx + halfW, gy);
  ctx.ellipse(gx, gy, halfW, topRy, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();

  // Top face — lit from above. A radial gradient anchored at the back-center
  // of the top ellipse gives a warm copper highlight that fades to deep char
  // toward the front edge, suggesting the lamp's interior glow falling on it.
  const topGrad = ctx.createRadialGradient(
    gx, gy - topRy * 0.55, 0,
    gx, gy + topRy * 0.35, halfW * 1.35,
  );
  topGrad.addColorStop(0,    '#9c5128');
  topGrad.addColorStop(0.45, '#552410');
  topGrad.addColorStop(1,    '#180a04');
  ctx.fillStyle = topGrad;
  ctx.beginPath();
  ctx.ellipse(gx, gy, halfW, topRy, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Vertical two-layer flame rising from the top of the fuel puck. The outer
// body fades through yellow → orange; the inner core stays hot white at the
// base. Both layers use 'lighter' compositing so the flame brightens both
// the lantern paper above (its upper body sits behind the paper) and the
// dark mouth interior between the puck and the rim's back edge.
function drawFlame(ctx, gx, gy, size, level) {
  const outerW = size * (0.13 + 0.025 * level);
  const outerLen = size * (0.65 + 0.20 * level);
  const innerW = outerW * 0.55;
  const innerLen = outerLen * 0.62;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Outer body
  const outer = ctx.createLinearGradient(gx, gy, gx, gy - outerLen);
  outer.addColorStop(0,    `rgba(255, 220, 140, ${0.65 * level})`);
  outer.addColorStop(0.35, `rgba(255, 185, 90,  ${0.50 * level})`);
  outer.addColorStop(0.75, `rgba(255, 135, 55,  ${0.22 * level})`);
  outer.addColorStop(1,    'rgba(255, 100, 30, 0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.ellipse(gx, gy - outerLen / 2, outerW, outerLen / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner hot core
  const inner = ctx.createLinearGradient(gx, gy, gx, gy - innerLen);
  inner.addColorStop(0,    `rgba(255, 255, 240, ${0.95 * level})`);
  inner.addColorStop(0.40, `rgba(255, 240, 180, ${0.70 * level})`);
  inner.addColorStop(0.80, `rgba(255, 200, 110, ${0.30 * level})`);
  inner.addColorStop(1,    'rgba(255, 180, 80, 0)');
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.ellipse(gx, gy - innerLen / 2, innerW, innerLen / 2, 0, 0, Math.PI * 2);
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
  // visually upright while the cradle tilts with aim. Stays unlit — the lamp
  // catches on launch, not while it waits in the cradle.
  if (game.phase === PHASE.AIMING) {
    const lanternY = middleY - r;
    ctx.save();
    ctx.translate(0, lanternY);
    ctx.rotate(-game.aimAngle);
    drawLantern(ctx, 0, 0, r, game.queue.current, { lit: false });
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
  drawLantern(ctx, nx, ny, layout.size * 0.7, game.queue.next, { lit: false });
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
    drawLantern(ctx, trace.settle.x, trace.settle.y, layout.size, game.queue.current, { lit: false });
    ctx.restore();
  }
}

// Seconds for a freshly-launched lamp to ramp from dark to a full flicker.
const IGNITE_SEC = 0.35;

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
  const ignite = Math.min(1, t / IGNITE_SEC);
  drawLantern(ctx, drawX, drawY, layout.size, shot.color,
    { lit: true, intensity: ignite, phase });
}
