import { COLORS, PALETTE } from '../constants.js';
import { launcherTip, traceAimLine, PHASE } from '../game.js';
import { rippleBoost } from '../effects.js';
import { getLanternSprite, getBackgroundFrame } from '../assets.js';
import { mulberry32 } from '../prng.js';
import {
  SERIF, SANS, HUD_OPACITY,
  easeOut, mixWithWhite, mixWithBlack,
} from './style.js';

// ─── Sky, moon, bamboo ──────────────────────────────────────────────────────

// Moon anchor: same math used by drawMoon, exposed here so the warm sky band
// can sit centered under the moon — including when handedness flips it to
// the opposite corner.
function moonAnchor(w, h, handed) {
  return {
    cx: handed ? w * 0.22 : w * 0.78,
    cy: h * 0.14,
    r: Math.min(w, h) * 0.07,
  };
}

// Stable starfield, cached per viewport so resizing recomputes but per-frame
// draws don't. The seed is fixed (not derived from the game's RNG) so this
// is THE sky — the same constellation every reload, regardless of seed/level.
const STAR_SEED = 0xC0FFEE;
const STAR_COUNT = 110;
let starsCache = { w: 0, h: 0, stars: null };

function getStars(w, h) {
  if (starsCache.w === w && starsCache.h === h && starsCache.stars) {
    return starsCache.stars;
  }
  const rng = mulberry32(STAR_SEED);
  // Confine stars to the upper ~70% — the lake/dead-line region below sits
  // closer to camera and shouldn't read as starry water.
  const skyH = h * 0.70;
  const stars = new Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    const big = rng() < 0.22;
    stars[i] = {
      x: rng() * w,
      y: rng() * skyH,
      r: big ? 1.2 : 0.7,
      alpha: big ? 0.85 : 0.45,
      twinkle: rng() < 0.06,         // ~7 stars twinkle
      phase: rng() * Math.PI * 2,
      freq: 0.25 + rng() * 0.35,     // 0.25..0.6 Hz — slow, not blinky
    };
  }
  starsCache = { w, h, stars };
  return stars;
}

export function drawBackground(ctx, w, h, settings) {
  // Base indigo gradient — unchanged.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, PALETTE.bgTop);
  grad.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Warm amber wash radiating from the moon's position. Low alpha so it
  // never reads as a discrete object — it just makes the sky around the
  // moon feel "lit." Sits under the moon and its halo so the moon's own
  // gradient stops paint cleanly over the band's center.
  const handed = !!(settings && settings.handedness === 'left');
  const m = moonAnchor(w, h, handed);
  const bandR = Math.max(w, h) * 0.55;
  const band = ctx.createRadialGradient(m.cx, m.cy, m.r * 0.6, m.cx, m.cy, bandR);
  band.addColorStop(0,   'rgba(232, 183, 112, 0.18)');
  band.addColorStop(0.5, 'rgba(232, 183, 112, 0.06)');
  band.addColorStop(1,   'rgba(232, 183, 112, 0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, w, h);

  // Starfield. ~110 cached dots, two size/alpha tiers, with ~7 slow twinklers.
  // Drawn behind the moon (moon draws after this), so the moon overpaints any
  // stars that happen to fall on its disc.
  const reducedMotion = !!(settings && settings.reducedMotion);
  const t = reducedMotion ? 0 : performance.now() / 1000;
  const stars = getStars(w, h);
  ctx.fillStyle = PALETTE.moon;
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    let a = s.alpha;
    if (s.twinkle && !reducedMotion) {
      // Modulate 60..100% of baseline so twinklers never blink fully out.
      a *= 0.6 + 0.4 * Math.sin(2 * Math.PI * s.freq * t + s.phase);
    }
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// The moon is the game's quiet celebration meter: its halo grows with the
// current combo, and a one-shot pulse expands when the player crosses a
// score milestone. Reduced motion skips the halo entirely.
export function drawMoon(ctx, w, h, game, settings) {
  const reducedMotion = settings.reducedMotion;
  const handed = settings.handedness === 'left';
  const { cx, cy, r } = moonAnchor(w, h, handed);
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
// reads as glowing behind the bamboo. Stretches to fill the viewport so the
// side trunks flank the full play area and the shore hills sit at the bottom
// of the lake, regardless of viewport aspect — the painted elements live at
// the image's edges, so anamorphic scaling just lengthens/widens the bamboo
// without cropping the frame.
export function drawFrame(ctx, viewW, viewH) {
  const img = getBackgroundFrame(viewW, viewH);
  if (!img) return;
  ctx.drawImage(img, 0, 0, viewW, viewH);
}

// Mirror each in-air lantern across the waterline as a faded, vertically
// flipped copy. The reflection's height-below-waterline equals the lantern's
// height-above, so a lamp drifting down toward the dead-line visibly closes
// the gap with its own reflection — a strong "how close to water" cue.
//
// Lit reflections (rather than dark silhouettes) keep the flame's warm glow
// shimmering on the surface; reduced intensity + low global alpha keeps the
// effect subordinate to the real lanterns above.
export function drawReflections(ctx, layout, game, settings) {
  const { viewW, viewH, deadLineY } = layout;
  if (deadLineY >= viewH) return;
  const board = game.board;
  const animY = board.descentAnimY || 0;
  const reducedMotion = !!(settings && settings.reducedMotion);
  const fadeDepth = viewH * 0.5;

  ctx.save();
  // Clip so the reflection's halo can't bleed back above the waterline.
  ctx.beginPath();
  ctx.rect(0, deadLineY, viewW, viewH - deadLineY);
  ctx.clip();

  for (const l of board.lanterns) {
    if (l.drown && l.drown.extinguished) continue;
    let dx = l.x, dy = l.y;
    if (l.anim) {
      const e = easeOut(l.anim.t);
      dx = l.anim.fromX + (l.x - l.anim.fromX) * e;
      dy = l.anim.fromY + (l.y - l.anim.fromY) * e;
    }
    if (l.drown) { dx += l.drown.offsetX; dy += l.drown.offsetY; }
    const sourceY = dy + animY;
    const height = deadLineY - sourceY;
    if (height <= 0) continue;
    const fade = Math.max(0, 1 - height / fadeDepth);
    if (fade <= 0.05) continue;
    const reflectY = deadLineY + height;
    const boost = reducedMotion ? 0 : rippleBoost(game, l.nx, l.ny);
    ctx.save();
    ctx.globalAlpha = 0.32 * fade;
    ctx.translate(dx, reflectY);
    ctx.scale(1, -1);
    drawLantern(ctx, 0, 0, layout.size, l.color,
      { lit: true, intensity: 0.55, phase: phaseOf(l), boost });
    ctx.restore();
  }

  // Reflect the in-flight shot too, with the same ignite ramp as the real one.
  const shot = game.shot;
  if (shot) {
    const t = shot.flightT || 0;
    const amp = shot.swayAmp || 0;
    const freq = shot.swayFreq || 0;
    const phase = shot.swayPhase || 0;
    const wobble = amp * (Math.sin(2 * Math.PI * freq * t + phase) - Math.sin(phase));
    const drawX = shot.x + (-shot.vy) * wobble;
    const drawY = shot.y + ( shot.vx) * wobble;
    const height = deadLineY - drawY;
    if (height > 0) {
      const fade = Math.max(0, 1 - height / fadeDepth);
      if (fade > 0.05) {
        const ignite = Math.min(1, t / IGNITE_SEC);
        ctx.save();
        ctx.globalAlpha = 0.32 * fade;
        ctx.translate(drawX, deadLineY + height);
        ctx.scale(1, -1);
        drawLantern(ctx, 0, 0, layout.size, shot.color,
          { lit: true, intensity: ignite * 0.55, phase });
        ctx.restore();
      }
    }
  }

  ctx.restore();
}

// ─── Board + lanterns ──────────────────────────────────────────────────────

export function drawBoard(ctx, layout, game, settings) {
  const board = game.board;
  const { size, viewH } = layout;
  const animY = board.descentAnimY || 0;
  const reducedMotion = settings && settings.reducedMotion;
  for (const l of board.lanterns) {
    let dx = l.x, dy = l.y;
    if (l.anim) {
      const e = easeOut(l.anim.t);
      dx = l.anim.fromX + (l.x - l.anim.fromX) * e;
      dy = l.anim.fromY + (l.y - l.anim.fromY) * e;
    }
    let lit = true;
    let spin = 0;
    if (l.drown) {
      dx += l.drown.offsetX;
      dy += l.drown.offsetY;
      if (dy - size * 2 > viewH) continue;
      lit = !l.drown.extinguished;
      spin = l.drown.spin;
    }
    const boost = reducedMotion ? 0 : rippleBoost(game, l.nx, l.ny);
    if (spin) {
      ctx.save();
      ctx.translate(dx, dy + animY);
      ctx.rotate(spin);
      drawLantern(ctx, 0, 0, size, l.color,
        { lit, phase: phaseOf(l), boost });
      ctx.restore();
    } else {
      drawLantern(ctx, dx, dy + animY, size, l.color,
        { lit, phase: phaseOf(l), boost });
    }
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

// Combined slow + fast pulse plus a sparse per-lantern flare, clamped so the
// lamp never goes fully dark. The flare term (sin raised to a high power) sits
// near zero most of the time and briefly peaks on its own cycle per lamp, so
// the field reads as twinkling rather than uniformly flickering.
// Baseline is intentionally low (0.55) so the lantern's paper color reads as
// itself, not as cream-wash from flame light; the slow/fast modulations are
// wide (±0.32 combined) so the flame visibly breathes between dim and bright
// — the dynamic range, not the peak brightness, is where life lives.
// `intensity` (0..1) scales the natural ember — used by the ignite ramp on the
// in-flight shot so it brightens up after launch.
// `boost` is an additive flare-up from external events (ripples) and is
// applied after intensity so it stays visible even on a half-lit shot.
function emberLevel(phase, intensity, boost) {
  const t = performance.now() / 1000;
  const slow = 0.20 * Math.sin(t * 1.5 + phase);
  const fast = 0.12 * Math.sin(t * 4.7 + phase * 1.7);
  const flareSin = Math.sin(t * 0.55 + phase * 3.7 + 1.3);
  const flare = 0.30 * Math.pow(Math.max(0, flareSin), 5);
  const base = (0.55 + slow + fast + flare) * intensity;
  return Math.max(0.05, Math.min(1.3, base + (boost || 0)));
}

export function drawLantern(ctx, cx, cy, size, colorKey, opts) {
  const lit = opts ? !!opts.lit : false;
  const intensity = opts && opts.intensity != null ? opts.intensity : 1;
  const phase = opts && opts.phase != null ? opts.phase : 0;
  const boost = opts && opts.boost != null ? opts.boost : 0;
  const level = lit ? emberLevel(phase, intensity, boost) : 0;

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
  grad.addColorStop(0,    `rgba(255, 220, 150, ${0.32 * level})`);
  grad.addColorStop(0.40, `rgba(255, 175, 95,  ${0.13 * level})`);
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
  grad.addColorStop(0,   `rgba(255, 245, 200, ${0.38 * level})`);
  grad.addColorStop(0.5, `rgba(255, 180, 90,  ${0.18 * level})`);
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
// body fades through amber → orange; the inner core peaks at warm cream
// (intentionally not pure white — a candle flame reads as cream/honey, and
// a white peak would clash with the moon and make the lamps feel stark).
// Both layers use 'lighter' compositing so the flame brightens both the
// lantern paper above (its upper body sits behind the paper) and the dark
// mouth interior between the puck and the rim's back edge.
function drawFlame(ctx, gx, gy, size, level) {
  const outerW = size * (0.13 + 0.025 * level);
  const outerLen = size * (0.65 + 0.20 * level);
  const innerW = outerW * 0.55;
  const innerLen = outerLen * 0.62;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Outer body
  const outer = ctx.createLinearGradient(gx, gy, gx, gy - outerLen);
  outer.addColorStop(0,    `rgba(255, 220, 140, ${0.45 * level})`);
  outer.addColorStop(0.35, `rgba(255, 185, 90,  ${0.32 * level})`);
  outer.addColorStop(0.75, `rgba(255, 135, 55,  ${0.14 * level})`);
  outer.addColorStop(1,    'rgba(255, 100, 30, 0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.ellipse(gx, gy - outerLen / 2, outerW, outerLen / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner hot core — warm cream, not white. The peak sits around 255,235,190
  // (a candle's hottest yellow-cream) so the flame harmonizes with the moon
  // (#F5E9C9) and reads as lit-by-fuel rather than lit-by-LED.
  const inner = ctx.createLinearGradient(gx, gy, gx, gy - innerLen);
  inner.addColorStop(0,    `rgba(255, 235, 190, ${0.55 * level})`);
  inner.addColorStop(0.40, `rgba(255, 215, 150, ${0.40 * level})`);
  inner.addColorStop(0.80, `rgba(255, 185, 100, ${0.18 * level})`);
  inner.addColorStop(1,    'rgba(255, 165, 75, 0)');
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
