import { COLORS, PALETTE, PERF_CONFIG, MOON_OVERRIDE, ENV_PARAMS, SYSTEM_OVERRIDES } from '../constants.js';
import { launcherTip, traceAimLine, PHASE } from '../game.js';
import { rippleBoost } from '../effects.js';
import {
  getLanternSprite,
  getBambooTallSprites, getBambooCaneSprites, getBambooBaseSprites,
  getBambooTipSprites, getBambooStalkSprites, getBambooClusterSprites,
  getMoonTexture,
  getLauncherWheelSprite,
  getFlameSheet,
} from '../assets.js';
import { mulberry32 } from '../prng.js';
import {
  SERIF, SANS, HUD_OPACITY,
  easeOut, mixWithWhite, mixWithBlack, hexToRgba,
  getEffectiveDpr, PERF_MODE,
} from './style.js';

// ─── Sky, moon, bamboo ──────────────────────────────────────────────────────

// Moon phase math. UTC-based synodic cycle from a known new-moon reference;
// accurate to ~24h which is plenty for a game's celestial dressing.
const MOON_REF_NEW_MOON_MS = 1704974220000; // Epoch: Jan 11, 2024 11:57:00 UTC
const MOON_SYNODIC_MS = 29.530588 * 86400000;

// Rising/setting cycle. Compressed vs. real time so players see the moon
// arc within a session, but slow enough to feel ambient rather than
// theatrical. MOON_VISIBLE_FRAC of the cycle is above the horizon; the
// remainder is a quick dip below the waterline before the next rise from
// the opposite side.
const MOON_TRAVERSE_MS = 48 * 60 * 1000;
const MOON_VISIBLE_FRAC = 0.85;

// Tuning knob exposed to the admin panel for scrubbing through positions
// while iterating on the moon-bleed look on lanterns. Negative values mean
// "use real time" (the default cycle); 0..1 locks the moon to that point in
// the traverse cycle. Persists in module state so admin edits take effect
// immediately without restart.
export const MOON_PARAMS = {
  positionOverride: -1,
};

// Lantern body tuning, exposed to admin for quick iteration.
//   * opacity: scales globalAlpha on the lantern sprite drawImage. 1.0 keeps
//     the sprite's natural alpha (the SVG has translucent paper); below 1
//     fades the lamp toward the sky.
//   * backing: alpha of a solid color-keyed disc drawn behind the sprite.
//     0 = sprite-only (translucent paper reads as paper-over-sky). >0 paints
//     the lantern's color underneath so the body reads more solid against
//     the moon-bleed / sky behind. Useful when the bleed makes lamps look
//     washed out.
export const LANTERN_PARAMS = {
  opacity: 1.0,
  backing: 0.0,
};

// Returns the moon's current screen position, radius, altitude (sin of arc
// angle: 1 at zenith, 0 at horizon, negative when dipped below the waterline),
// and lunar phase (0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last
// quarter). All callers — sky wash, disc render, reflection — share this so
// the moon, its glow, and its reflection stay locked together.
//
// Direction: rises right, traverses to the left, sets, then re-emerges on
// the right. The moon is its own independent ambient element.
//
// Reduced motion: position freezes near the upper-right zenith of the arc so
// the scene still reads as moonlit without any movement. Phase is still
// computed from real time (changes slowly day-to-day; not "motion" in the
// preference's sense).
//
// Per-frame memoization: drawBackground, drawMoon, drawMoonBleed and
// drawReflections all call this with `Date.now()` during one render pass —
// without caching that's four full re-runs of the phase + position math each
// frame. The cache key includes everything computeMoonState reads (layout
// dims, reduced motion, admin override) plus a 16ms time bucket, so the four
// callsites' drift in Date.now() within one animation frame still hits the
// cache. Moon position changes over minutes, so 16ms quantization is
// imperceptible.
let _moonStateCache = null;
function moonState(layout, settings, nowMs) {
  const reducedMotion = !!(settings && settings.reducedMotion);
  const bucket = nowMs - (nowMs % 16);
  const c = _moonStateCache;
  if (c &&
      c.bucket === bucket &&
      c.w === layout.viewW &&
      c.h === layout.viewH &&
      c.deadLineY === layout.deadLineY &&
      c.reducedMotion === reducedMotion &&
      c.override === MOON_PARAMS.positionOverride &&
      c.overridePos === MOON_OVERRIDE.position &&
      c.overridePhase === MOON_OVERRIDE.phase) {
    return c.value;
  }
  const value = computeMoonState(layout, reducedMotion, nowMs);
  _moonStateCache = {
    bucket,
    w: layout.viewW,
    h: layout.viewH,
    deadLineY: layout.deadLineY,
    reducedMotion,
    override: MOON_PARAMS.positionOverride,
    overridePos: MOON_OVERRIDE.position,
    overridePhase: MOON_OVERRIDE.phase,
    value,
  };
  return value;
}

function computeMoonState(layout, reducedMotion, nowMs) {
  const { viewW: w, viewH: h, deadLineY } = layout;
  const r = Math.min(w, h) * 0.07;
  const horizonY = deadLineY;
  const peakY = h * 0.10;
  const peakRise = horizonY - peakY;
  const overridePhase = MOON_OVERRIDE.phase;
  const phase01 = overridePhase >= 0
    ? Math.min(1.0, overridePhase)
    : (((nowMs - MOON_REF_NEW_MOON_MS) / MOON_SYNODIC_MS) % 1 + 1) % 1;

  if (reducedMotion) {
    return {
      cx: w * 0.55, cy: peakY, r,
      altitude: 1, phase01, horizonY,
    };
  }

  // tCycle ∈ [0, 1). Visible arc occupies [0, MOON_VISIBLE_FRAC]; the rest
  // is the off-screen dip below the waterline. Admin override pins the
  // cycle to a specific point so the moon's position can be scrubbed in the
  // admin panel while iterating on the bleed/transparency look.
  const overridePos = MOON_OVERRIDE.position >= 0 ? MOON_OVERRIDE.position : MOON_PARAMS.positionOverride;
  const tCycle = overridePos >= 0
    ? Math.min(1, overridePos)
    : ((nowMs / MOON_TRAVERSE_MS) % 1 + 1) % 1;
  let theta;
  if (tCycle <= MOON_VISIBLE_FRAC) {
    theta = (tCycle / MOON_VISIBLE_FRAC) * Math.PI;
  } else {
    theta = Math.PI + ((tCycle - MOON_VISIBLE_FRAC) / (1 - MOON_VISIBLE_FRAC)) * Math.PI;
  }
  const altitude = Math.sin(theta);
  // cos(theta): +1 at rise (right edge offscreen) → 0 at zenith (center) →
  // -1 at set (left edge offscreen). Pad the swing by +r so the disc fully
  // leaves the frame at horizon rather than clipping in half mid-air.
  const cx = w * 0.5 + (w * 0.5 + r) * Math.cos(theta);
  const cy = altitude >= 0
    ? horizonY - peakRise * altitude
    : horizonY + (-altitude) * r * 1.4;   // brief dip below water during set
  return { cx, cy, r, altitude, phase01, horizonY };
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

// The base indigo gradient depends only on viewport height and constant
// palette colors, yet fills the whole screen every frame — cache it and
// rebuild only on a resize. The warm amber band tracks the moon, so it caches
// against a bucketed position/altitude key (the moon drifts ~0.27 px/sec, so
// rounding to integer px rebuilds it only every few seconds). drawBackgroundSky
// only ever paints on the main canvas, so a single slot per gradient is safe.
let skyBaseGrad = { ctx: null, h: 0, grad: null };
let skyBandGrad = { ctx: null, key: '', grad: null };

export function drawBackgroundSky(ctx, layout, settings) {
  const { viewW: w, viewH: h } = layout;
  // Base indigo gradient — unchanged look, now reused across frames.
  if (skyBaseGrad.ctx !== ctx || skyBaseGrad.h !== h) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, PALETTE.bgTop);
    grad.addColorStop(1, PALETTE.bgBottom);
    skyBaseGrad = { ctx, h, grad };
  }
  ctx.fillStyle = skyBaseGrad.grad;
  ctx.fillRect(0, 0, w, h);

  // Warm amber wash radiating from the moon's CURRENT position. Tracks the
  // moon as it traverses so the brightest part of the sky always sits under
  // the moon. Modulated by altitude so the wash dims at horizon — a setting
  // moon shouldn't paint the entire sky just as bright as a moon at zenith.
  const m = moonState(layout, settings, Date.now());
  const altGate = Math.max(0, m.altitude);
  if (altGate > 0.02) {
    const a0 = (0.18 * altGate * ENV_PARAMS.glowIntensity).toFixed(3);
    const a1 = (0.06 * altGate * ENV_PARAMS.glowIntensity).toFixed(3);
    const bandR = Math.max(w, h) * 0.55;
    const key = `${Math.round(m.cx)}|${Math.round(m.cy)}|${Math.round(m.r)}|${a0}|${a1}|${w}|${h}`;
    if (skyBandGrad.ctx !== ctx || skyBandGrad.key !== key) {
      const band = ctx.createRadialGradient(m.cx, m.cy, m.r * 0.6, m.cx, m.cy, bandR);
      band.addColorStop(0,   `rgba(232, 183, 112, ${a0})`);
      band.addColorStop(0.5, `rgba(232, 183, 112, ${a1})`);
      band.addColorStop(1,   'rgba(232, 183, 112, 0)');
      skyBandGrad = { ctx, key, grad: band };
    }
    ctx.fillStyle = skyBandGrad.grad;
    ctx.fillRect(0, 0, w, h);
  }
}

let starfieldCanvasCache = null;

function ensureStarfieldCanvas(w, h, dpr, allStatic) {
  const pw = Math.max(1, Math.floor(w * dpr));
  const ph = Math.max(1, Math.floor(h * dpr));
  if (starfieldCanvasCache &&
      starfieldCanvasCache.canvas.width === pw &&
      starfieldCanvasCache.canvas.height === ph &&
      starfieldCanvasCache.allStatic === allStatic) {
    return starfieldCanvasCache.canvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = pw;
  canvas.height = ph;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const stars = getStars(w, h);
  ctx.fillStyle = PALETTE.moon;
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    if (!allStatic && s.twinkle) {
      continue;
    }
    ctx.globalAlpha = s.alpha;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  starfieldCanvasCache = { canvas, allStatic };
  return canvas;
}

export function drawStars(ctx, layout, settings) {
  const { viewW: w, viewH: h } = layout;
  const dpr = getEffectiveDpr();
  const reducedMotion = !!(settings && settings.reducedMotion);
  const useAllStatic = PERF_MODE || reducedMotion;

  const starfieldCanvas = ensureStarfieldCanvas(w, h, dpr, useAllStatic);
  ctx.drawImage(starfieldCanvas, 0, 0, w, h);

  if (!useAllStatic) {
    const t = performance.now() / 1000;
    const stars = getStars(w, h);
    ctx.fillStyle = PALETTE.moon;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      if (s.twinkle) {
        let a = s.alpha;
        a *= 0.6 + 0.4 * Math.sin(2 * Math.PI * s.freq * t + s.phase);
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

let celestialCache = null;

function ensureCelestialCanvas(w, h, dpr) {
  const pw = Math.max(1, Math.floor(w * dpr));
  const ph = Math.max(1, Math.floor(h * dpr));
  if (celestialCache && celestialCache.canvas.width === pw && celestialCache.canvas.height === ph) {
    return celestialCache.canvas;
  }
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  celestialCache = { canvas: c };
  return c;
}

// Cache shape mirrors bleedCache: { canvas, key }. The painted glow is fully
// determined by moon position/phase/combo, the breath + pulse animation, and
// the viewport, so drawMoon hashes those into `key` and only repaints the
// offscreen when it changes — otherwise the per-frame cost is a single
// drawImage composite instead of an offscreen clear + 3-4 radial gradients +
// a directional mask. `key` resets to '' whenever the canvas is reallocated.
let glowCanvasCache = null;

function ensureGlowCanvas(w, h, dpr) {
  const pw = Math.max(1, Math.floor(w * dpr));
  const ph = Math.max(1, Math.floor(h * dpr));
  if (glowCanvasCache && glowCanvasCache.canvas.width === pw && glowCanvasCache.canvas.height === ph) {
    return glowCanvasCache;
  }
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  glowCanvasCache = { canvas: c, key: '' };
  return glowCanvasCache;
}


export function drawCelestialLayer(ctx, layout, game, settings) {
  const { viewW, viewH } = layout;
  const dpr = getEffectiveDpr();

  if (PERF_MODE) {
    // A. Draw Stars, Moon, Reflections, and Waterline directly onto the main canvas
    drawStars(ctx, layout, settings);
    drawMoon(ctx, layout, game, settings);
    drawReflections(ctx, layout, game, settings);
    drawWaterline(ctx, layout);
    return;
  }

  const cCanvas = ensureCelestialCanvas(viewW, viewH, dpr);
  const cCtx = cCanvas.getContext('2d');
  cCtx.clearRect(0, 0, viewW, viewH);

  // A. Draw Stars, Moon, Reflections, and Waterline onto the offscreen celestial canvas
  drawStars(cCtx, layout, settings);
  drawMoon(cCtx, layout, game, settings);
  drawReflections(cCtx, layout, game, settings);
  drawWaterline(cCtx, layout);

  // B. Erase the bamboo silhouette perfectly
  const level = (BAMBOO_PARAMS.levelOverride | 0) || ((game && game.level) | 0) || 1;
  const mask = getBambooMaskCanvas(viewW, viewH, dpr, level);

  cCtx.save();
  cCtx.globalCompositeOperation = 'destination-out';
  cCtx.drawImage(mask, 0, 0, viewW, viewH);
  cCtx.restore();

  // C. Draw the celestial layers back onto the main screen
  ctx.drawImage(cCanvas, 0, 0, viewW, viewH);
}


// Exposed so future gameplay hooks (e.g. "moon-lit lanterns earn bonus
// effects when within the moon's halo") can read the same numbers the
// renderer uses without recomputing the cycle math.
export function getMoonState(layout, settings) {
  return moonState(layout, settings, Date.now());
}

// Trace the unlit portion of the disc as a Path2D and fill it with a deep
// indigo. The terminator (lit/dark boundary) is a half-ellipse with vertical
// semi-axis r and horizontal semi-axis r * |1 - 2k|, where k is the
// illuminated fraction. Whether the terminator bulges toward the lit or dark
// side of the disc depends on crescent vs. gibbous — together that means:
//
//   waxing crescent: dark = left limb arc + terminator bulging RIGHT (into lit)
//   waxing gibbous : dark = left limb arc + terminator bulging LEFT  (into dark)
//   waning gibbous : dark = right limb arc + terminator bulging RIGHT (into dark)
//   waning crescent: dark = right limb arc + terminator bulging LEFT  (into lit)
//
// Fill is a translucent deep indigo (not black) so the dark side keeps
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

// semi-axis r and horizontal semi-axis r * |1 - 2k|, where k is the
// illuminated fraction. Whether the terminator bulges toward the lit or dark
// side of the disc depends on crescent vs. gibbous — together that means:
//
//   waxing crescent: dark = left limb arc + terminator bulging RIGHT (into lit)
//   waxing gibbous : dark = left limb arc + terminator bulging LEFT  (into dark)
//   waning gibbous : dark = right limb arc + terminator bulging RIGHT (into dark)
//   waning crescent: dark = right limb arc + terminator bulging LEFT  (into lit)
//
// Fill is a translucent deep indigo (not black) so the dark side keeps
// some sky-color presence — visually equivalent to "earthshine" without the
// real-world astronomy.
export function drawPhaseShadow(ctx, cx, cy, r, phase01, layout, customColor) {
  const phaseAngle = phase01 * 2 * Math.PI;
  const k = (1 - Math.cos(phaseAngle)) / 2;   // illuminated fraction 0..1
  if (k >= 0.995) return;                     // full moon — no shadow
  ctx.save();

  // If layout is provided and no customColor is defined, we are drawing the main moon
  // phase shadow on the celestial offscreen canvas. Using destination-out erases the
  // unlit part of the moon (and any background stars behind it), allowing the actual
  // sky background (including its base gradient and warm radial wash) to show through perfectly.
  const isMainMoon = !customColor && layout;

  if (isMainMoon) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
  } else {
    ctx.fillStyle = customColor || 'rgba(20, 28, 52, 0.78)';
  }

  if (k <= 0.005) {
    // New moon — whole disc dark/erased.
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const a = r * Math.abs(1 - 2 * k);
  const waxing = phase01 < 0.5;
  const crescent = k < 0.5;
  // Limb arc traces the dark side of the disc; terminator on whichever side
  // the geometry prescribes. Canvas y is down, so angles -π/2 = top,
  // +π/2 = bottom; ccw=true sweeps via x<0 (left), ccw=false via x>0 (right).
  const limbDarkOnLeft = waxing;
  // Invert terminator sweep direction to fix crescent/gibbous geometry.
  // Passing terminatorOnLeft as the anticlockwise parameter sweeps:
  // - true (anticlockwise) sweeps through x > 0 (right side).
  // - false (clockwise) sweeps through x < 0 (left side).
  const terminatorOnLeft = waxing ? crescent : !crescent;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r + 1.2, r + 1.2, 0, -Math.PI / 2, Math.PI / 2, limbDarkOnLeft);
  ctx.ellipse(cx, cy, a + 1.2, r + 1.2, 0,  Math.PI / 2, -Math.PI / 2, terminatorOnLeft);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// The moon is the game's quiet celebration meter AND the warm focal point of
// the sky. Behaviors layered together:
//   * Always-on warm halo (multi-stop radial) that "breathes" — a slow
//     low-amplitude sinusoid on radius + alpha so it reads as alive even at
//     idle. Lifts further with combo.
//   * Surface disc — either the loaded moon texture (clipped to a circle,
//     slowly rotating, warm-overlay tinted) or a flat warm fallback.
//   * Phase shadow — a deep-indigo path covering the unlit portion of the
//     disc, computed from real-world lunar phase.
//   * Inner glow rim — a soft luminous edge that makes the disc feel lit
//     from within rather than pasted on.
// All passes share the moon's current traverse position so a setting moon
// dips into the water with its halo and rim still attached; the disc is
// clipped at the horizon so the lower limb appears to slip below the surface
// rather than sit on it.
export function drawMoon(ctx, layout, game, settings) {
  const reducedMotion = !!settings.reducedMotion;
  const m = moonState(layout, settings, Date.now());
  const { cx, cy, r, altitude, horizonY, phase01 } = m;
  // Bail entirely once the disc + halo are fully below horizon. The very
  // brief offscreen portion of the cycle skips rendering altogether.
  if (cy - r * 4 > horizonY) return;
  const combo = game.combo | 0;
  const t = reducedMotion ? 0 : performance.now() / 1000;

  // Slow breath: ±6% radius, ±15% alpha, ~12s period. Even without combo
  // the halo never sits perfectly still — keeps the moon "alive."
  const breath = reducedMotion ? 0 : Math.sin(2 * Math.PI * t / 12);
  const breathR = 1 + 0.06 * breath;
  const breathA = 1 + 0.15 * breath;

  // Phase math for directional glow and illumination shifting
  const phaseAngle = phase01 * 2 * Math.PI;
  const k = (1 - Math.cos(phaseAngle)) / 2;   // illuminated fraction 0..1
  const phaseGlowMod = 0.15 + 0.85 * k;       // dim glow as moon thins
  
  // Shift the radial gradients toward the illuminated crescent limb
  const hx = cx + (phase01 < 0.5 ? 1 : -1) * r * (1 - k) * 0.95;

  if (PERF_MODE) {
    // Halos always paint — even in reduced motion the moon must read as
    // "vivid and warm." Only the breath modulation is suppressed in that mode.
    ctx.save();
    // Apply Southern Hemisphere 180-degree rotation around the moon's center for shifted halos
    if (layout && layout.handedness === 'left') {
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI);
      ctx.translate(-cx, -cy);
    }

    // Outer warm wash — wide, low-alpha amber that bleeds into the sky.
    const outerR = r * (1.6 + 2.2 * k) * (reducedMotion ? 1 : breathR);
    const outer = ctx.createRadialGradient(hx, cy, r * 0.5, hx, cy, outerR);
    outer.addColorStop(0,    `rgba(248, 206, 140, ${(0.34 * phaseGlowMod * ENV_PARAMS.glowIntensity).toFixed(3)})`);
    outer.addColorStop(0.35, `rgba(232, 183, 112, ${(0.16 * phaseGlowMod * ENV_PARAMS.glowIntensity).toFixed(3)})`);
    outer.addColorStop(1,    'rgba(232, 183, 112, 0)');
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(hx, cy, outerR, 0, Math.PI * 2);
    ctx.fill();

    // Inner halo — tighter, hotter ring riding on the combo lift + breath.
    const comboLift = Math.min(1, combo / 6) * 0.55;
    const haloBaseR = r * (1.1 + 1.1 * k + comboLift);
    const haloR = haloBaseR * (reducedMotion ? 1 : breathR);
    const baseAlpha = 0x44 + Math.round(0x40 * Math.min(1, combo / 6));
    const haloAlpha = Math.max(0, Math.min(255, Math.round(baseAlpha * phaseGlowMod * (reducedMotion ? 1 : breathA) * ENV_PARAMS.glowIntensity)));
    const rgbHalo = hexToRgb(PALETTE.moonHalo);
    const stop0Alpha = (haloAlpha / 255).toFixed(3);
    const stop1Alpha = ((haloAlpha * 0.13) / 255).toFixed(3);
    const halo = ctx.createRadialGradient(hx, cy, r * 0.7, hx, cy, haloR);
    halo.addColorStop(0,    `rgba(${rgbHalo}, ${stop0Alpha})`);
    halo.addColorStop(0.55, `rgba(${rgbHalo}, ${stop1Alpha})`);
    halo.addColorStop(1,    `rgba(${rgbHalo}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(hx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();

    // Milestone pulse: a single one-shot halo riding outward over its life.
    const pulse = game.moonPulse;
    if (!reducedMotion && pulse && pulse.life > 0 && pulse.t < pulse.life) {
      const tt = pulse.t / pulse.life;
      const pulseR = r * (2.4 + 1.6 * easeOut(tt));
      const pulseAlpha = Math.round(0x66 * (1 - tt) * phaseGlowMod * ENV_PARAMS.glowIntensity);
      const rgbMoon = hexToRgb(PALETTE.moon);
      const pHalo = ctx.createRadialGradient(hx, cy, r * 0.8, hx, cy, pulseR);
      pHalo.addColorStop(0, `rgba(${rgbMoon}, ${(pulseAlpha / 255).toFixed(3)})`);
      pHalo.addColorStop(1, `rgba(${rgbMoon}, 0)`);
      ctx.fillStyle = pHalo;
      ctx.beginPath();
      ctx.arc(hx, cy, pulseR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else {
    // Halos always paint — even in reduced motion the moon must read as
    // "vivid and warm." Only the breath modulation is suppressed in that mode.
    const dpr = getEffectiveDpr();
    const cache = ensureGlowCanvas(layout.viewW, layout.viewH, dpr);
    const gCanvas = cache.canvas;
    const gCtx = gCanvas.getContext('2d');

    // Cache key over every input the painting reads. Position rounds to integer
    // px (the moon drifts sub-pixel/sec); the continuously-animated breath and
    // the rare milestone pulse are bucketed so the offscreen rebuild is skipped
    // on most frames. The breath quantum (1/60 ≈ 0.017) matches the 1% fidelity
    // bleedCache uses — it moves the halo radius by 0.1% and its alpha by 0.25%
    // per step, imperceptible — while collapsing the steady-state cost to one
    // blit on the frames the breath sits near its turning points.
    const pulse = game.moonPulse;
    const pulseActive = !reducedMotion && pulse && pulse.life > 0 && pulse.t < pulse.life;
    const breathBucket = Math.round(breath * 60);
    const pulseBucket = pulseActive ? Math.round((pulse.t / pulse.life) * 90) : -1;
    const handed = (layout && layout.handedness === 'left') ? 'L' : 'R';
    const key = `${Math.round(cx)}|${Math.round(cy)}|${Math.round(r)}|${phase01.toFixed(4)}|${combo}|${breathBucket}|${pulseBucket}|${reducedMotion ? 1 : 0}|${ENV_PARAMS.glowIntensity}|${handed}|${layout.viewW}|${layout.viewH}|${dpr}`;

    if (cache.key !== key) {
      gCtx.clearRect(0, 0, layout.viewW, layout.viewH);

      gCtx.save();
      // Apply Southern Hemisphere 180-degree rotation around the moon's center for shifted halos
      if (layout && layout.handedness === 'left') {
        gCtx.translate(cx, cy);
        gCtx.rotate(Math.PI);
        gCtx.translate(-cx, -cy);
      }

      // Outer warm wash — wide, low-alpha amber that bleeds into the sky.
      const outerR = r * (1.6 + 2.2 * k) * (reducedMotion ? 1 : breathR);
      const outer = gCtx.createRadialGradient(hx, cy, r * 0.5, hx, cy, outerR);
      outer.addColorStop(0,    `rgba(248, 206, 140, ${(0.34 * phaseGlowMod * ENV_PARAMS.glowIntensity).toFixed(3)})`);
      outer.addColorStop(0.35, `rgba(232, 183, 112, ${(0.16 * phaseGlowMod * ENV_PARAMS.glowIntensity).toFixed(3)})`);
      outer.addColorStop(1,    'rgba(232, 183, 112, 0)');
      gCtx.fillStyle = outer;
      gCtx.beginPath();
      gCtx.arc(hx, cy, outerR, 0, Math.PI * 2);
      gCtx.fill();

      // Inner halo — tighter, hotter ring riding on the combo lift + breath.
      const comboLift = Math.min(1, combo / 6) * 0.55;
      const haloBaseR = r * (1.1 + 1.1 * k + comboLift);
      const haloR = haloBaseR * (reducedMotion ? 1 : breathR);
      const baseAlpha = 0x44 + Math.round(0x40 * Math.min(1, combo / 6));
      const haloAlpha = Math.max(0, Math.min(255, Math.round(baseAlpha * phaseGlowMod * (reducedMotion ? 1 : breathA) * ENV_PARAMS.glowIntensity)));
      const rgbHalo = hexToRgb(PALETTE.moonHalo);
      const stop0Alpha = (haloAlpha / 255).toFixed(3);
      const stop1Alpha = ((haloAlpha * 0.13) / 255).toFixed(3);
      const halo = gCtx.createRadialGradient(hx, cy, r * 0.7, hx, cy, haloR);
      halo.addColorStop(0,    `rgba(${rgbHalo}, ${stop0Alpha})`);
      halo.addColorStop(0.55, `rgba(${rgbHalo}, ${stop1Alpha})`);
      halo.addColorStop(1,    `rgba(${rgbHalo}, 0)`);
      gCtx.fillStyle = halo;
      gCtx.beginPath();
      gCtx.arc(hx, cy, haloR, 0, Math.PI * 2);
      gCtx.fill();

      // Milestone pulse: a single one-shot halo riding outward over its life.
      if (pulseActive) {
        const tt = pulse.t / pulse.life;
        const pulseR = r * (2.4 + 1.6 * easeOut(tt));
        const pulseAlpha = Math.round(0x66 * (1 - tt) * phaseGlowMod * ENV_PARAMS.glowIntensity);
        const rgbMoon = hexToRgb(PALETTE.moon);
        const pHalo = gCtx.createRadialGradient(hx, cy, r * 0.8, hx, cy, pulseR);
        pHalo.addColorStop(0, `rgba(${rgbMoon}, ${(pulseAlpha / 255).toFixed(3)})`);
        pHalo.addColorStop(1, `rgba(${rgbMoon}, 0)`);
        gCtx.fillStyle = pHalo;
        gCtx.beginPath();
        gCtx.arc(hx, cy, pulseR, 0, Math.PI * 2);
        gCtx.fill();
      }

      // Now apply the linear gradient mask on gCtx to make the glow directional.
      // The glow fades out towards the unlit (dark) limb.
      gCtx.globalCompositeOperation = 'destination-in';

      const litSign = phase01 < 0.5 ? 1 : -1;
      const x_dark = cx - litSign * r * 1.4;
      const x_lit = cx + litSign * r * 0.7;

      const maskGrad = gCtx.createLinearGradient(x_dark, cy, x_lit, cy);
      // At x_dark, the mask alpha is k (illuminated fraction) to ensure that a full moon remains
      // uniformly backlit, whereas a crescent or new moon has zero backlight on its dark side.
      maskGrad.addColorStop(0, `rgba(0, 0, 0, ${k.toFixed(3)})`);
      maskGrad.addColorStop(1, 'rgba(0, 0, 0, 1.0)');

      gCtx.fillStyle = maskGrad;
      gCtx.fillRect(cx - r * 6, cy - r * 6, r * 12, r * 12);
      gCtx.restore();

      cache.key = key;
    }

    // Composite the masked offscreen glow canvas onto the main context
    ctx.drawImage(gCanvas, 0, 0, layout.viewW, layout.viewH);
  }

  // Disc surface. Texture if loaded; otherwise a flat warm cream circle.
  // Clipped to (above waterline) ∩ (disc circle) so a setting/rising moon
  // dips into the water with its lower limb hidden, rather than sitting
  // visibly on top of the surface. Consecutive clip() calls intersect, so
  // the rect-then-arc stack gives the half-disc when the moon straddles the
  // horizon and the full disc otherwise. Halos above are intentionally NOT
  // clipped — atmospheric glow lingers in the sky even when the disc itself
  // is half-submerged.
  const tex = getMoonTexture();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, layout.viewW, horizonY);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // Apply Southern Hemisphere 180-degree rotation around the moon's center
  if (layout && layout.handedness === 'left') {
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI);
    ctx.translate(-cx, -cy);
  }

  if (tex && tex.width > 0) {
    // Slow rotation (~8 min/turn) keeps surface detail drifting subtly. Skip
    // when reduced motion is on so the disc reads as completely still.
    const rot = reducedMotion ? 0 : (2 * Math.PI * t / 480);
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    // Slight oversample so rotation can't reveal an unpainted corner of the
    // bounding box — 1.06 covers a 45° tilt comfortably.
    const d = r * 2.12;
    ctx.drawImage(tex, -d / 2, -d / 2, d, d);
    ctx.rotate(-rot);
    ctx.translate(-cx, -cy);

    // Warm tint pass — multiply a soft amber over the texture so its
    // mid-tones lean toward the palette's warm cream instead of staying
    // pure white/grey from the source. Kept low alpha so the shadow-lifted
    // texture (see cropMoonToDisc) reads as warmly luminous, not dim.
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(255, 222, 178, 0.30)';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // "Lit from within" lift — a screen-blended radial that brightens the
    // disc center toward warm cream, breathing with the same sinusoid as
    // the halo so disc and halo feel like one organism.
    ctx.globalCompositeOperation = 'screen';
    const liftAlpha = (0.18 + (reducedMotion ? 0 : 0.06 * breath)) * phaseGlowMod * ENV_PARAMS.glowIntensity;
    const lift = ctx.createRadialGradient(hx, cy, 0, hx, cy, r);
    lift.addColorStop(0,    `rgba(255, 236, 198, ${liftAlpha.toFixed(3)})`);
    lift.addColorStop(0.65, `rgba(255, 220, 170, ${(0.05 * phaseGlowMod * ENV_PARAMS.glowIntensity).toFixed(3)})`);
    lift.addColorStop(1,    'rgba(255, 220, 170, 0)');
    ctx.fillStyle = lift;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    // Fallback: flat warm disc with a soft warm center lift.
    ctx.fillStyle = PALETTE.moon;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    const lift = ctx.createRadialGradient(hx, cy, 0, hx, cy, r);
    lift.addColorStop(0, `rgba(255, 240, 205, ${(0.40 * phaseGlowMod * ENV_PARAMS.glowIntensity).toFixed(3)})`);
    lift.addColorStop(1, 'rgba(255, 240, 205, 0)');
    ctx.fillStyle = lift;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // Inner rim glow — additive amber ring just inside the disc edge. Stays
  // inside the same clip so a horizon-clipped moon's rim is also clipped.
  // Drawn BEFORE the phase shadow so the shadow can cleanly cover and mask
  // the rim glow on the dark/unlit side of the moon, avoiding any backlit glow.
  ctx.globalCompositeOperation = 'lighter';
  const rim = ctx.createRadialGradient(cx, cy, r * 0.78, cx, cy, r * 1.0);
  rim.addColorStop(0, 'rgba(255, 220, 170, 0)');
  rim.addColorStop(1, `rgba(255, 220, 170, ${(0.45 * ENV_PARAMS.glowIntensity).toFixed(3)})`);
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  // Phase shadow — covers the unlit portion of the disc. Drawn AFTER the
  // disc, lift, and rim so it cleanly masks all of them.
  drawPhaseShadow(ctx, cx, cy, r, phase01, PERF_MODE ? null : layout);

  // Mark altitude unused-on-purpose for ESLint-style readers; it's consumed
  // by the background wash and the reflection pass.
  void altitude;
  ctx.restore();
}

// Additive post-pass painted on top of the lantern board. Two layers:
//   * A wide warm radial centered on the moon — "moonlight catching the
//     lanterns and the air" — adds a subtle glow to anything sitting in
//     the moon's hemisphere of the sky.
//   * A faint disc bleed (texture re-painted at low alpha) — lanterns
//     that physically overlap the moon disc get a ghosted hint of the
//     surface showing through, which sets up the future "moon-lit lantern"
//     gameplay hook by making the affordance visible to the player before
//     any mechanics exist.
// Both layers gate on altitude so a submerged moon casts no light.
//
// To keep bamboo silhouettes opaque AND let the bleed lighten the lanterns
// behind them, we composite via an offscreen canvas: paint the bleed
// normally, cut out the bamboo silhouettes (destination-out with the cached
// bamboo canvas as a mask), then drawImage the result onto the main canvas
// with 'lighter' so it acts as an additive layer everywhere except where
// bamboo previously drew.
// Cache shape: { canvas, key }. The painted content is fully determined by
// moon position/altitude, viewport, dpr, and the bamboo mask identity; the
// hash key encodes all of these (with moon position rounded to integer px
// and altitude bucketed to 1%) so the expensive offscreen rebuild — clear,
// wash gradient, optional texture blit, destination-out bamboo mask — runs
// only when one of those inputs actually changes. The moon traverses
// ~0.27 px/sec, so in practice the offscreen is rebuilt every few seconds
// and the per-frame cost drops to a single drawImage composite.
let bleedCache = null;

function ensureBleedCanvas(w, h, dpr) {
  const pw = Math.max(1, Math.floor(w * dpr));
  const ph = Math.max(1, Math.floor(h * dpr));
  if (bleedCache && bleedCache.canvas.width === pw && bleedCache.canvas.height === ph) {
    return bleedCache;
  }
  const c = document.createElement('canvas');
  c.width = pw;
  c.height = ph;
  // Apply DPR transform once; the same 2d context is returned on subsequent
  // getContext calls, so this scaling sticks for the lifetime of the canvas.
  c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  bleedCache = { canvas: c, key: '' };
  return bleedCache;
}

function paintBleed(canvas, m, viewW, viewH, deadLineY, handedness) {
  const bx = canvas.getContext('2d');
  bx.clearRect(0, 0, viewW, viewH);

  const phaseAngle = m.phase01 * 2 * Math.PI;
  const k = (1 - Math.cos(phaseAngle)) / 2;
  const phaseGlowMod = 0.15 + 0.85 * k;
  const hx = m.cx + (m.phase01 < 0.5 ? 1 : -1) * m.r * (1 - k) * 0.95;

  // Wide warm radial — atmospheric moonlight catching everything in the
  // moon's hemisphere. Clipped above the waterline so it doesn't paint into
  // the reflection (which has its own moon-driven warm column).
  bx.save();
  bx.beginPath();
  bx.rect(0, 0, viewW, deadLineY);
  bx.clip();
  const washR = m.r * (2.2 + 3.3 * k);
  const washAlpha = 0.11 * m.altitude * phaseGlowMod * ENV_PARAMS.glowIntensity;
  const wash = bx.createRadialGradient(hx, m.cy, m.r * 0.4, hx, m.cy, washR);
  wash.addColorStop(0,    `rgba(255, 220, 170, ${washAlpha.toFixed(3)})`);
  wash.addColorStop(0.45, `rgba(255, 200, 140, ${(washAlpha * 0.45).toFixed(3)})`);
  wash.addColorStop(1,    'rgba(255, 200, 140, 0)');
  bx.fillStyle = wash;
  bx.fillRect(0, 0, viewW, deadLineY);

  // Faint disc bleed — moon surface ghosting through anything in front of it.
  const tex = getMoonTexture();
  if (tex && tex.width > 0) {
    bx.save();
    bx.beginPath();
    bx.arc(m.cx, m.cy, m.r, 0, Math.PI * 2);
    bx.clip();

    // Apply Southern Hemisphere 180-degree rotation around the moon's center
    if (handedness === 'left') {
      bx.translate(m.cx, m.cy);
      bx.rotate(Math.PI);
      bx.translate(-m.cx, -m.cy);
    }

    bx.globalAlpha = 0.22 * m.altitude * ENV_PARAMS.glowIntensity;
    const d = m.r * 2.12;
    bx.drawImage(tex, m.cx - d / 2, m.cy - d / 2, d, d);
    bx.restore();

    // Erase the dark side of the moon from the offscreen bleed canvas so it doesn't catch lanterns.
    bx.save();
    bx.globalCompositeOperation = 'destination-out';
    bx.globalAlpha = 1.0;
    drawPhaseShadow(bx, m.cx, m.cy, m.r, m.phase01, null, '#000');
    bx.restore();
  }
  bx.restore();

  // Cut out bamboo silhouettes. destination-out erases bleed pixels wherever
  // the bamboo mask cache has non-transparent alpha, so bamboo's repaint of itself
  // at full opacity is no longer needed — the bleed simply doesn't reach
  // those pixels.
  if (bambooCache.maskCanvas) {
    bx.globalCompositeOperation = 'destination-out';
    bx.drawImage(bambooCache.maskCanvas, 0, 0, viewW, viewH);
    bx.globalCompositeOperation = 'source-over';
  }
}

export function drawMoonBleed(ctx, layout, settings) {
  const m = moonState(layout, settings, Date.now());
  if (m.altitude <= 0.02) return;
  const { viewW, viewH } = layout;
  const dpr = getEffectiveDpr();
  const cache = ensureBleedCanvas(viewW, viewH, dpr);
  // Bucket the inputs that vary frame-to-frame: integer px for position,
  // 1% steps for altitude. Bamboo identity is included so a profile or level
  // switch invalidates the cached cutout. Include handedness to invalidate
  // cache instantly when switching hemispheres.
  const key = `${Math.round(m.cx)}|${Math.round(m.cy)}|${(m.altitude * 100) | 0}|${viewW}|${viewH}|${dpr}|${bambooCache.key || ''}|${layout.handedness || 'right'}|${ENV_PARAMS.glowIntensity}|${m.phase01}`;
  if (cache.key !== key) {
    paintBleed(cache.canvas, m, viewW, viewH, layout.deadLineY, layout.handedness);
    cache.key = key;
  }

  // Composite the (possibly cached) masked bleed onto the main canvas additively.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(cache.canvas, 0, 0, viewW, viewH);
  ctx.restore();
}

// ─── Bamboo frame ──────────────────────────────────────────────────────────
//
// Sprite-based side bamboo, composed into an offscreen canvas keyed by
// viewport + dpr. Per-frame cost is one drawImage; the cache
// only rebuilds on resize or settings change.
//
// Composition strategy: each side gets one foreground tall stalk (pushed
// partially off-canvas so foliage frames inward without crowding) plus one
// background slim cane trunk further inside the edge band for depth. The
// center CLEARING_FRAC of the viewport stays clear of foliage so the play
// area is unambiguously the focal point.

const BAMBOO_SEED = 0xBA70BAA;
const BAMBOO_FALLBACK_FILL = '#0A1230';
const BAMBOO_FALLBACK_RING = '#040814';
// Pixel floor for the procedural-fallback stalk width. The earlier ~0.6% of
// viewport read as scratchy hair on a 390px iPhone; 6px is the smallest
// width that still reads as bamboo and not as a thread.
const BAMBOO_FALLBACK_MIN_PX = 6;
// Per-level seed multiplier (large odd 32-bit). Mixing level into the seed
// gives each stage a visibly distinct grove composition without changing any
// other rendering inputs. Stable per level so a refresh shows the same grove.
const BAMBOO_LEVEL_MULT = 0x9E3779B9;

// Mutable tuning parameters — exposed so the admin panel can tweak them live
// during playtesting. After any change, call invalidateBambooCache() so the
// next frame rebuilds the cached canvas with the new values.
//
// Two viewport profiles live below: a SMALL profile tuned for phone-portrait
// (dense canopy, more trunks to fill the narrow frame) and a WIDE profile
// for landscape/desktop (sparser canopy, fewer foreground stalks). The
// active profile is selected automatically on first load based on viewport
// width; both are also accessible from the admin panel "Load profile" row.
//
//   edgeBand          — inward limit for side stalks as fraction of viewport
//                       width; center (1 - 2*edgeBand) stays clear of bamboo.
//   towersPerSide     — # of foreground tall stalks per side.
//   trunksPerSide     — # of background slim cane+base trunks per side.
//   midgroundPerSide  — # of midground clusters hanging in the edge band.
//   cornerPerSide     — # of bottom-corner cluster accents per side.
//   canopyPxPerCluster — divisor for canopy cluster count (smaller = denser).
//   canopyMin/Max     — bounds on canopy cluster count regardless of viewport.
//   baseTrunkFrac     — fraction of base sprite width that is the internal
//                       trunk. Drives base sizing so trunks visually align.
//   caneTrunkFrac     — same for the cane sprite.
//   tallTrunkFrac     — same for the tall stalk sprite.
//   baseGrassFrac     — fraction of base sprite height that is the grass
//                       clump (rest is the internal trunk above).
//   bankYFrac         — y-position of the visible bank as fraction of h.
//   caneTopperScale   — scale of cane-top mask (0 = off, 1 = trunk-match,
//                       >1 = oversize tip for emphasis).
//   levelOverride     — 0 = use game.level; >0 = force this level seed.

// Viewport-aware profiles. Source-of-truth for the values used at startup —
// tuned via the bamboo admin panel (backtick toggle, or ?admin=1) and
// copied here from its "Copy JSON" button after playtesting.
// The non-profile keys (caneTopperScale, tipTrunkFrac) are appended via
// COMMON_DEFAULTS so both profiles share them.
export const BAMBOO_PROFILE_SMALL = Object.freeze({
  edgeBand:           0.26,
  towersPerSide:      1,
  trunksPerSide:      4,
  midgroundPerSide:   3,
  cornerPerSide:      3,
  canopyPxPerCluster: 24,
  canopyMin:          20,
  canopyMax:          46,
  baseTrunkFrac:      0.27,
  caneTrunkFrac:      0.80,
  tallTrunkFrac:      0.17,
  baseGrassFrac:      0.47,
  bankYFrac:          0.995,
});
export const BAMBOO_PROFILE_WIDE = Object.freeze({
  edgeBand:           0.26,
  towersPerSide:      2,
  trunksPerSide:      3,
  midgroundPerSide:   2,
  cornerPerSide:      3,
  canopyPxPerCluster: 20,
  canopyMin:          4,
  canopyMax:          12,
  baseTrunkFrac:      0.20,
  caneTrunkFrac:      0.80,
  tallTrunkFrac:      0.22,
  baseGrassFrac:      0.36,
  bankYFrac:          1.0,
});
const COMMON_DEFAULTS = {
  caneTopperScale: 1.0,
  levelOverride:   0,
};

// Below this viewport width, the SMALL profile is the default. Picked once
// at module load — resizing the window doesn't switch profiles automatically
// (use the admin panel "Profile" buttons to switch by hand).
const BAMBOO_SMALL_VIEWPORT_PX = 768;

function pickStartupProfile() {
  // Pull viewport width safely — fall back to wide if window is unavailable
  // (e.g. during a Node import for static analysis).
  const w = (typeof window !== 'undefined' && window.innerWidth) || 1024;
  return w < BAMBOO_SMALL_VIEWPORT_PX ? BAMBOO_PROFILE_SMALL : BAMBOO_PROFILE_WIDE;
}

export const BAMBOO_PARAMS = Object.assign({},
  pickStartupProfile(),
  COMMON_DEFAULTS,
);

// Loads a named profile into BAMBOO_PARAMS in-place and invalidates the
// cache. The admin panel uses this for its profile-switch buttons.
export function applyBambooProfile(name) {
  const profile = name === 'small' ? BAMBOO_PROFILE_SMALL
                : name === 'wide'  ? BAMBOO_PROFILE_WIDE
                : null;
  if (!profile) return;
  Object.assign(BAMBOO_PARAMS, profile);
  invalidateBambooCache();
}

let bambooCache = { key: '', canvas: null, maskCanvas: null };

// Called by the admin panel when a BAMBOO_PARAMS value changes. Drops the
// cached canvas so the next render rebuilds with the new params.
export function invalidateBambooCache() {
  bambooCache = { key: '', canvas: null, maskCanvas: null };
}

function ensureBambooCache(w, h, dpr, level) {
  const key = `${w}|${h}|${dpr}|${level}`;
  if (bambooCache.key === key && bambooCache.canvas && bambooCache.maskCanvas) {
    return bambooCache;
  }
  
  // 1. Build Visual Canvas (with atmospheric transparencies/depth)
  const c = document.createElement('canvas');
  c.width  = Math.max(1, Math.floor(w * dpr));
  c.height = Math.max(1, Math.floor(h * dpr));
  const cx = c.getContext('2d');
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintBamboo(cx, w, h, level, false); // isMask = false

  // 2. Build Mask Canvas (solid silhouettes for blocking the moon/stars/water/etc.)
  const mc = document.createElement('canvas');
  mc.width  = Math.max(1, Math.floor(w * dpr));
  mc.height = Math.max(1, Math.floor(h * dpr));
  const mcx = mc.getContext('2d');
  mcx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintBamboo(mcx, w, h, level, true); // isMask = true

  bambooCache = { key, canvas: c, maskCanvas: mc };
  return bambooCache;
}

export function getBambooMaskCanvas(w, h, dpr, level) {
  const cache = ensureBambooCache(w, h, dpr, level);
  return cache.maskCanvas;
}

export function drawBamboo(ctx, w, h, game, settings) {
  const dpr = getEffectiveDpr();
  const gameLevel = ((game && game.level) | 0) || 1;
  const level = (BAMBOO_PARAMS.levelOverride | 0) || gameLevel;
  const cache = ensureBambooCache(w, h, dpr, level);
  ctx.drawImage(cache.canvas, 0, 0, w, h);
}

// Moon on the right.
// Each side flags whether it sits on the moon side. Painted in passes so the
// top canopy can layer over the side stalks at the corners (where the real
// bamboo grove would have leaves spilling from above the trunks).
//
// The seed mixes BAMBOO_SEED with the level number so each stage gets its
// own grove composition — different stalk count picks, different cluster
// placements, different canopy density patterns — while remaining stable on
// refresh within a level.
function paintBamboo(ctx, w, h, level, isMask) {
  const seed = (BAMBOO_SEED ^ (((level | 0) || 1) * BAMBOO_LEVEL_MULT)) >>> 0;
  const rng = mulberry32(seed);
  paintSide(ctx, rng, w, h, 'left',  false, isMask);
  paintSide(ctx, rng, w, h, 'right', true, isMask);
  paintTopCanopy(ctx, rng, w, h, isMask);
}

// Returns true when the canvas point (cx, cy) sits inside a generous
// exclusion zone around the moon. The radius is sized to the moon's halo at
// peak combo so the canopy never crowds the celebration meter, and so the
// moon itself stays the obvious focal point at the top of the scene.
function inMoonExclusion(cx, cy, w, h) {
  // Disabled: the moon moving behind the bamboo is nice!
  return false;
}

// Pick a sprite from a pool by seed-driven index. Returns null if pool empty.
function pickSprite(rng, pool) {
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}
function paintSpriteStalk(ctx, rng, startX, startY, wBase, height, side, isMoonSide, isForeground, isMask) {
  const basePool = getBambooBaseSprites();
  const canePool = getBambooCaneSprites();
  const tipPool = getBambooTipSprites();
  const stalkPool = getBambooStalkSprites();
  const clusterPool = getBambooClusterSprites();

  const baseSprite = pickSprite(rng, basePool);
  if (!baseSprite) return;

  ctx.save();
  ctx.globalAlpha = isMask ? 1.0 : (isForeground ? 1.0 : 0.45);

  ctx.translate(startX, startY);
  
  let currentSprite = baseSprite;
  const bottomW = baseSprite.sw * (baseSprite.bottomFrac || 0.5);
  let currentScale = wBase / bottomW;

  const avgCaneSprite = canePool[0] || baseSprite;
  const avgCaneH = avgCaneSprite.sh * currentScale;
  const segmentCount = Math.max(3, Math.min(8, Math.round((height - baseSprite.sh * currentScale) / avgCaneH)));

  // Draw the base
  ctx.save();
  ctx.scale(currentScale, currentScale);
  ctx.drawImage(currentSprite.image, currentSprite.sx, currentSprite.sy, currentSprite.sw, currentSprite.sh,
                -currentSprite.sw * currentSprite.bottomCenterFrac, -currentSprite.sh, currentSprite.sw, currentSprite.sh);
  ctx.restore();

  const getNextTransition = (parent, child, parentScale) => {
    const parentTopW = parent.sw * (parent.topFrac || 0.1);
    const childBottomW = child.sw * (child.bottomFrac || 0.1);
    return parentScale * (parentTopW / childBottomW);
  };

  for (let s = 0; s < segmentCount; s++) {
    const isLast = (s === segmentCount - 1);
    const nextSprite = isLast ? pickSprite(rng, tipPool) : pickSprite(rng, canePool);
    if (!nextSprite) break;

    // Move translation to current top seam
    const tx = currentSprite.sw * (currentSprite.topCenterFrac - currentSprite.bottomCenterFrac) * currentScale;
    const ty = -currentSprite.sh * currentScale;
    ctx.translate(tx, ty);

    // Apply lean
    const lean = (rng() - 0.5) * (isForeground ? 0.03 : 0.06);
    ctx.rotate(lean);

    // Update scale
    const nextScale = getNextTransition(currentSprite, nextSprite, currentScale);
    currentScale = nextScale;
    currentSprite = nextSprite;

    // Draw
    ctx.save();
    ctx.scale(currentScale, currentScale);
    ctx.drawImage(currentSprite.image, currentSprite.sx, currentSprite.sy, currentSprite.sw, currentSprite.sh,
                  -currentSprite.sw * currentSprite.bottomCenterFrac, -currentSprite.sh, currentSprite.sw, currentSprite.sh);
    ctx.restore();

    // Sprout branches/clusters on upper joints
    if (s >= 1 && rng() < 0.65) {
      const branchOnLeft = rng() < 0.5;
      const foliageSprite = rng() < 0.4 ? pickSprite(rng, clusterPool) : pickSprite(rng, stalkPool);
      if (foliageSprite) {
        ctx.save();
        const baseAngle = branchOnLeft ? -Math.PI * 0.32 : Math.PI * 0.32;
        const finalAngle = baseAngle + (rng() - 0.5) * 0.15;
        
        ctx.rotate(finalAngle);
        // Scale foliage proportional to stalk scale
        const folScale = currentScale * (1.1 + rng() * 0.7);
        ctx.scale(folScale, folScale);
        
        const fx = -foliageSprite.sw * foliageSprite.bottomCenterFrac;
        const fy = -foliageSprite.sh;
        ctx.drawImage(foliageSprite.image, foliageSprite.sx, foliageSprite.sy, foliageSprite.sw, foliageSprite.sh,
                      fx, fy, foliageSprite.sw, foliageSprite.sh);
        ctx.restore();
      }
    }
  }

  ctx.restore();
}

function paintTallStalk(ctx, rng, startX, startY, wBase, height, side, isMoonSide, isForeground, isMask) {
  const tallPool = getBambooTallSprites();
  const tallSprite = pickSprite(rng, tallPool);
  if (!tallSprite) return;

  ctx.save();
  ctx.globalAlpha = isMask ? 1.0 : (isForeground ? 1.0 : 0.45);

  ctx.translate(startX, startY);
  
  // Apply minor lean angle
  const lean = (rng() - 0.5) * (isForeground ? 0.02 : 0.05);
  ctx.rotate(lean);

  // We want the tall sprite to span the desired height
  const scale = height / tallSprite.sh;

  ctx.scale(scale, scale);
  ctx.drawImage(tallSprite.image, tallSprite.sx, tallSprite.sy, tallSprite.sw, tallSprite.sh,
                -tallSprite.sw * tallSprite.bottomCenterFrac, -tallSprite.sh, tallSprite.sw, tallSprite.sh);
  ctx.restore();
}

function paintSide(ctx, rng, w, h, side, isMoonSide, isMask) {
  const isLeft = side === 'left';
  const edgeFrac = 1 / 3; // Exactly cover left/right thirds (leaving center third open)
  const shoreW = w * edgeFrac;

  const colorBg = isMask ? '#000000' : '#0A122E'; // Deep background mound
  const colorFg = isMask ? '#000000' : '#040816'; // Very dark foreground mound

  // 1. Draw Background Shore Mound (Minor height adjustment to h * 0.88)
  ctx.save();
  ctx.fillStyle = colorBg;
  ctx.globalAlpha = isMask ? 1.0 : 0.65;
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-10, h * 1.05);
    ctx.lineTo(-10, h * 0.88); // Elegantly raised background hill
    ctx.quadraticCurveTo(shoreW * 0.40, h * 0.88, shoreW, h * 1.05);
  } else {
    ctx.moveTo(w + 10, h * 1.05);
    ctx.lineTo(w + 10, h * 0.88);
    ctx.quadraticCurveTo(w - shoreW * 0.40, h * 0.88, w - shoreW, h * 1.05);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const basePool = getBambooBaseSprites();
  const canePool = getBambooCaneSprites();
  const tipPool = getBambooTipSprites();
  const tallPool = getBambooTallSprites();
  const hasSprites = basePool.length > 0 && canePool.length > 0 && tipPool.length > 0 && tallPool.length > 0;

  // 2. Draw Layer 1: Background Bamboo Forest (Thin, dense, dark, atmospheric)
  if (hasSprites) {
    const bgStalks = 4;
    const bgBandWidth = w * BAMBOO_PARAMS.edgeBand * 0.85;
    for (let i = 0; i < bgStalks; i++) {
      const tBand = (i + 0.3 + rng() * 0.4) / bgStalks;
      const xBase = side === 'left' ? tBand * bgBandWidth : w - tBand * bgBandWidth;
      const wBase = Math.max(6, w * (0.007 + rng() * 0.003));
      const height = h * (0.75 + rng() * 0.15);
      
      if (rng() < 0.5) {
        paintSpriteStalk(ctx, rng, xBase, h * 1.05, wBase, height, side, isMoonSide, false, isMask);
      } else {
        paintTallStalk(ctx, rng, xBase, h * 1.05, wBase, height, side, isMoonSide, false, isMask);
      }
    }
  } else {
    const bgStalks = 4;
    const bgBandWidth = w * BAMBOO_PARAMS.edgeBand * 0.85;
    for (let i = 0; i < bgStalks; i++) {
      const tBand = (i + 0.3 + rng() * 0.4) / bgStalks;
      const xBase = side === 'left' ? tBand * bgBandWidth : w - tBand * bgBandWidth;
      const wBase = Math.max(7, w * (0.008 + rng() * 0.004));
      const height = h * (0.75 + rng() * 0.15);
      const bow = (side === 'left' ? 1 : -1) * w * (0.01 + rng() * 0.015);
      const xOffsetTop = (side === 'left' ? 1 : -1) * w * (-0.02 + rng() * 0.035);
      
      paintProceduralStalk(ctx, rng, w, h, xBase, wBase, height, bow, xOffsetTop, side, isMoonSide, false, isMask);
    }
  }

  // 3. Draw Foreground Shore Mound (Minor height adjustment to h * 0.91)
  ctx.save();
  ctx.fillStyle = colorFg;
  ctx.globalAlpha = 1.0;
  ctx.beginPath();
  if (isLeft) {
    ctx.moveTo(-10, h * 1.05);
    ctx.lineTo(-10, h * 0.91); // Elegantly raised foreground hill
    ctx.quadraticCurveTo(shoreW * 0.45, h * 0.91, shoreW, h * 1.05);
  } else {
    ctx.moveTo(w + 10, h * 1.05);
    ctx.lineTo(w + 10, h * 0.91);
    ctx.quadraticCurveTo(w - shoreW * 0.45, h * 0.91, w - shoreW, h * 1.05);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 4. Draw Layer 2: Foreground Bamboo Flanks (Thick, highly textured, moonlit)
  if (hasSprites) {
    const fgStalks = 3;
    const fgBandWidth = w * BAMBOO_PARAMS.edgeBand * 0.72;
    for (let i = 0; i < fgStalks; i++) {
      const tBand = (i + 0.25 + rng() * 0.50) / fgStalks;
      const xBase = side === 'left' ? tBand * fgBandWidth : w - tBand * fgBandWidth;
      const wBase = Math.max(12, w * (0.015 + rng() * 0.005));
      const heightFrac = isMoonSide ? 0.58 + rng() * 0.08 : 0.80 + rng() * 0.10;
      const height = h * heightFrac;
      
      if (rng() < 0.6) {
        paintSpriteStalk(ctx, rng, xBase, h * 1.05, wBase, height, side, isMoonSide, true, isMask);
      } else {
        paintTallStalk(ctx, rng, xBase, h * 1.05, wBase, height, side, isMoonSide, true, isMask);
      }
    }
  } else {
    const fgStalks = 3;
    const fgBandWidth = w * BAMBOO_PARAMS.edgeBand * 0.72;
    for (let i = 0; i < fgStalks; i++) {
      const tBand = (i + 0.25 + rng() * 0.50) / fgStalks;
      const xBase = side === 'left' ? tBand * fgBandWidth : w - tBand * fgBandWidth;
      const wBase = Math.max(11, w * (0.015 + rng() * 0.005));
      const heightFrac = isMoonSide ? 0.58 + rng() * 0.08 : 0.80 + rng() * 0.10;
      const height = h * heightFrac;
      const bow = (side === 'left' ? 1 : -1) * w * (0.012 + rng() * 0.02);
      const xOffsetTop = (side === 'left' ? 1 : -1) * w * (-0.01 + rng() * 0.04);
      
      paintProceduralStalk(ctx, rng, w, h, xBase, wBase, height, bow, xOffsetTop, side, isMoonSide, true, isMask);
    }
  }

  // 5. Draw Layer 3: Bottom Ground Accents (Lush ground shrubbery/shading)
  if (hasSprites) {
    const groundAccents = 4;
    const clusterPool = getBambooClusterSprites();
    if (clusterPool.length > 0) {
      for (let i = 0; i < groundAccents; i++) {
        const tBand = (i + 0.25 + rng() * 0.5) / groundAccents;
        const xOffset = w * (0.01 + tBand * 0.15);
        const cx = side === 'left' ? xOffset : w - xOffset;
        const cy = h * (0.96 + rng() * 0.035);
        
        const groundSprite = pickSprite(rng, clusterPool);
        if (groundSprite) {
          ctx.save();
          // Draw background ground accent
          ctx.globalAlpha = isMask ? 1.0 : 0.5;
          ctx.translate(cx, cy);
          const angle = side === 'left' ? -Math.PI * 0.15 : -Math.PI * 0.85;
          ctx.rotate(angle + (rng() - 0.5) * 0.1);
          const scale1 = Math.min(w, h) * (0.035 + rng() * 0.02) / groundSprite.sh * 2.0;
          ctx.scale(scale1, scale1);
          ctx.drawImage(groundSprite.image, groundSprite.sx, groundSprite.sy, groundSprite.sw, groundSprite.sh,
                        -groundSprite.sw * groundSprite.bottomCenterFrac, -groundSprite.sh, groundSprite.sw, groundSprite.sh);
          ctx.restore();

          ctx.save();
          // Draw foreground ground accent
          ctx.globalAlpha = 1.0;
          ctx.translate(cx, cy + h * 0.01);
          ctx.rotate(angle + (rng() - 0.5) * 0.15);
          const scale2 = scale1 * 1.35;
          ctx.scale(scale2, scale2);
          ctx.drawImage(groundSprite.image, groundSprite.sx, groundSprite.sy, groundSprite.sw, groundSprite.sh,
                        -groundSprite.sw * groundSprite.bottomCenterFrac, -groundSprite.sh, groundSprite.sw, groundSprite.sh);
          ctx.restore();
        }
      }
    }
  } else {
    const groundAccents = 4;
    for (let i = 0; i < groundAccents; i++) {
      const tBand = (i + 0.25 + rng() * 0.5) / groundAccents;
      const xOffset = w * (0.01 + tBand * 0.15);
      const cx = side === 'left' ? xOffset : w - xOffset;
      const cy = h * (0.96 + rng() * 0.035);
      const leafScale = Math.min(w, h) * (0.035 + rng() * 0.02);
      const leafAngle = side === 'left' ? -Math.PI * 0.28 : -Math.PI * 0.72;
      
      // Draw background accents first
      paintProceduralLeafCluster(ctx, rng, w, h, cx, cy, leafScale, leafAngle, side, isMoonSide, false, isMask);
      // Draw foreground accents
      paintProceduralLeafCluster(ctx, rng, w, h, cx, cy, leafScale * 1.3, leafAngle + (rng() - 0.5) * 0.2, side, isMoonSide, true, isMask);
    }
  }
}

function paintProceduralStalk(ctx, rng, w, h, xBase, wBase, height, bow, xOffsetTop, side, isMoonSide, isForeground, isMask) {
  const segments = 16;
  const segLen = height / segments;
  const wTop = wBase * 0.45;
  const yBottom = h * 1.05;

  const getCenter = (t) => {
    const cx = xBase + t * xOffsetTop + Math.sin(t * Math.PI) * bow;
    const cy = yBottom - t * height;
    return { cx, cy };
  };

  let baseColor, shadowColor, highlightColor;
  if (isForeground) {
    baseColor = '#0b162f';
    shadowColor = '#030710';
    highlightColor = isMoonSide ? '#d4b785' : '#314b7e'; // Moon-facing side gets a warm gold/rice paper or rich blue tint
  } else {
    baseColor = '#050a16';
    shadowColor = '#010307';
    highlightColor = '#0f1f3a';
  }

  // Draw segment-by-segment
  for (let i = 0; i < segments; i++) {
    const tStart = i / segments;
    const tEnd = (i + 1) / segments;
    
    const pStart = getCenter(tStart);
    const pEnd = getCenter(tEnd);
    
    const wStart = wBase - (wBase - wTop) * tStart;
    const wEnd = wBase - (wBase - wTop) * tEnd;

    ctx.save();
    ctx.globalAlpha = isMask ? 1.0 : (isForeground ? 1.0 : 0.55);

    const dx = pEnd.cx - pStart.cx;
    const dy = pEnd.cy - pStart.cy;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;

    const xLStart = pStart.cx + nx * (wStart / 2);
    const yLStart = pStart.cy + ny * (wStart / 2);
    const xRStart = pStart.cx - nx * (wStart / 2);
    const yRStart = pStart.cy - ny * (wStart / 2);

    const xLEnd = pEnd.cx + nx * (wEnd / 2);
    const yLEnd = pEnd.cy + ny * (wEnd / 2);
    const xREnd = pEnd.cx - nx * (wEnd / 2);
    const yREnd = pEnd.cy - ny * (wEnd / 2);

    const moonX = w * 0.78; // Always right-hand moon position
    const highlightOnLeft = (moonX < pStart.cx);

    const grad = ctx.createLinearGradient(xLStart, yLStart, xRStart, yRStart);
    if (highlightOnLeft) {
      grad.addColorStop(0, highlightColor);
      grad.addColorStop(0.35, baseColor);
      grad.addColorStop(1, shadowColor);
    } else {
      grad.addColorStop(0, shadowColor);
      grad.addColorStop(0.65, baseColor);
      grad.addColorStop(1, highlightColor);
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xLStart, yLStart);
    ctx.lineTo(xRStart, yRStart);
    ctx.lineTo(xREnd, yREnd);
    ctx.lineTo(xLEnd, yLEnd);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Node joint/knuckle ring
    if (i < segments - 1) {
      ctx.save();
      ctx.globalAlpha = isMask ? 1.0 : (isForeground ? 1.0 : 0.55);

      const kWidth = wEnd * 1.28;
      const kHeight = wEnd * 0.35;

      ctx.translate(pEnd.cx, pEnd.cy);
      const angle = Math.atan2(dy, dx);
      ctx.rotate(angle + Math.PI / 2);

      // Shadowed crease line
      ctx.fillStyle = shadowColor;
      ctx.beginPath();
      ctx.ellipse(0, 0, kWidth / 2, kHeight / 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Moonlit edge shelf highlight
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = Math.max(1, wEnd * 0.12);
      ctx.beginPath();
      if (highlightOnLeft) {
        ctx.ellipse(0, 0, kWidth / 2, kHeight / 2, 0, Math.PI * 0.5, Math.PI * 1.5);
      } else {
        ctx.ellipse(0, 0, kWidth / 2, kHeight / 2, 0, -Math.PI * 0.5, Math.PI * 0.5);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // Branching: upper 65% of the stalk has a chance to sprout branch clusters
  let branchLeft = rng() < 0.5;
  for (let i = Math.floor(segments * 0.35); i < segments; i++) {
    const t = i / segments;
    const pNode = getCenter(t);
    const wNode = wBase - (wBase - wTop) * t;

    if (rng() < 0.42) {
      const bAngle = branchLeft ? -Math.PI * 0.28 : Math.PI * 0.28;
      const bLen = height * (0.28 - t * 0.12) * (0.8 + rng() * 0.4);
      paintProceduralBranch(ctx, rng, w, h, pNode.cx, pNode.cy, bLen, bAngle, wNode * 0.28, side, isMoonSide, isForeground, isMask);
      branchLeft = !branchLeft;
    }
  }

  // Top of the stalk terminates in a lush leaf cluster
  const pTip = getCenter(1.0);
  const pPrev = getCenter(0.9);
  const tipAngle = Math.atan2(pTip.cy - pPrev.cy, pTip.cx - pPrev.cx);
  paintProceduralLeafCluster(ctx, rng, w, h, pTip.cx, pTip.cy, wBase * 1.8, tipAngle, side, isMoonSide, isForeground, isMask);
}

function paintProceduralBranch(ctx, rng, w, h, xStart, yStart, length, angleOffset, wStart, side, isMoonSide, isForeground, isMask) {
  const segments = 4;
  const getPoint = (t) => {
    const baseAngle = -Math.PI / 2 + angleOffset;
    // Curves downward gently as it extends away from the main stalk
    const cx = xStart + Math.sin(baseAngle) * length * t;
    const cy = yStart + Math.cos(baseAngle) * length * t + Math.pow(t, 2) * (length * 0.16);
    return { cx, cy, angle: baseAngle + t * 0.28 };
  };

  let baseColor = isForeground ? '#081329' : '#030812';
  
  ctx.save();
  ctx.globalAlpha = isMask ? 1.0 : (isForeground ? 1.0 : 0.55);
  ctx.strokeStyle = baseColor;
  ctx.lineWidth = wStart;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(xStart, yStart);
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const p = getPoint(t);
    ctx.lineTo(p.cx, p.cy);
  }
  ctx.stroke();
  ctx.restore();

  // Leaves along the branch and at the tip
  for (let i = 2; i <= segments; i++) {
    const t = i / segments;
    const p = getPoint(t);
    const scale = wStart * (5.8 - t * 2.2);
    const isTip = (i === segments);
    const leafScale = isTip ? scale * 1.25 : scale * 0.8;
    paintProceduralLeafCluster(ctx, rng, w, h, p.cx, p.cy, leafScale, p.angle, side, isMoonSide, isForeground, isMask);
  }
}

function paintProceduralLeafCluster(ctx, rng, w, h, x, y, scale, angle, side, isMoonSide, isForeground, isMask) {
  if (inMoonExclusion(x, y, w, h)) {
    return;
  }

  const numLeaves = 3 + Math.floor(rng() * 4);
  let baseColor, highlightColor;
  if (isForeground) {
    baseColor = '#0a1a38';
    highlightColor = isMoonSide ? '#dfcfb0' : '#3c5a98'; // Glistening gold or rich blue moonlight highlight
  } else {
    baseColor = '#040916';
    highlightColor = '#0b162f';
  }

  for (let i = 0; i < numLeaves; i++) {
    const t = numLeaves > 1 ? i / (numLeaves - 1) : 0.5;
    const spread = (t - 0.5) * 1.08;
    const leafAngle = angle + spread + 0.22; // Fan out with natural droop
    
    const leafLen = scale * (0.85 + rng() * 0.35) * (isForeground ? 1.0 : 0.8);
    const leafWidth = leafLen * (0.13 + rng() * 0.04);
    
    const ox = x + (rng() - 0.5) * (scale * 0.1);
    const oy = y + (rng() - 0.5) * (scale * 0.1);
    
    paintProceduralLeaf(ctx, ox, oy, leafLen, leafWidth, leafAngle, baseColor, highlightColor, isForeground, isMask);
  }
}

function paintProceduralLeaf(ctx, x, y, len, width, angle, color, highlightColor, isForeground, isMask) {
  ctx.save();
  ctx.globalAlpha = isMask ? 1.0 : (isForeground ? 1.0 : 0.55);
  ctx.translate(x, y);
  ctx.rotate(angle);

  const grad = ctx.createLinearGradient(0, -width * 0.5, 0, width * 0.5);
  grad.addColorStop(0, highlightColor || color);
  grad.addColorStop(0.3, color);
  grad.addColorStop(1, '#010307'); // Elegant shadow side of the leaf

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.35, -width * 0.58, len, len * 0.12);
  ctx.quadraticCurveTo(len * 0.32, width * 0.58, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Top canopy — overhead bamboo foliage in 3 organic passes. Replaces the
// earlier uniform-top-edge band (which read "square") with a varied-depth
// composition:
//
//   Pass 1 (back canopy): small, high — drape clusters from the top edge,
//   forming a sparse ceiling that fades toward the moon.
//
//   Pass 2 (mid canopy): medium, jittered depth — clusters anchored along
//   an arch curve so the visual baseline of the canopy dips toward center
//   like a real arching grove rather than a flat horizontal band.
//
//   Pass 3 (low hangers): a few large leaf branches reaching well into the
//   upper play area, anchored near the canvas corners. These break the
//   "top band" silhouette by adding a few visible stragglers and tie the
//   side stalks together with the canopy.
//
// All passes respect the moon exclusion. Density scales with viewport width.
function paintTopCanopy(ctx, rng, w, h, isMask) {
  const clusters = getBambooClusterSprites();
  const branches = getBambooStalkSprites();
  if (clusters.length === 0 && branches.length === 0) return;

  // Sprite pool combining clusters + branches with branches less common but
  // present — branches read as "branch + leaves" hanging down (visible stem),
  // mixed with the leaf-only clusters this gives the canopy real variety.
  function pickCanopySprite() {
    if (clusters.length === 0) return pickSprite(rng, branches);
    if (branches.length === 0) return pickSprite(rng, clusters);
    return rng() < 0.25 ? pickSprite(rng, branches) : pickSprite(rng, clusters);
  }

  // Total canopy element count. Higher density and wider min/max ranges than
  // before so the canopy reads as a real grove ceiling rather than a sparse
  // strip of decorations.
  const total = Math.min(BAMBOO_PARAMS.canopyMax,
    Math.max(BAMBOO_PARAMS.canopyMin, Math.floor(w / BAMBOO_PARAMS.canopyPxPerCluster)));

  // ── Pass 1: back canopy (sparse high band) ────────────────────────────
  // ~40% of the total count. Hang from top edge with shallow depth — these
  // form the "ceiling" you see between gaps in the foreground leaves.
  const backN = Math.floor(total * 0.40);
  for (let i = 0; i < backN; i++) {
    const sprite = pickCanopySprite();
    if (!sprite) continue;
    const tx = (i + 0.2 + rng() * 0.6) / backN;
    const cx = tx * w;
    const sizeFrac = 0.05 + rng() * 0.04;        // small (5–9% of h)
    const drawH = h * sizeFrac;
    const drawW = drawH * (sprite.sw / sprite.sh);
    const yAnchor = -drawH * (0.05 + rng() * 0.15);  // stem above canvas
    const cyApprox = yAnchor + drawH * 0.5;
    if (inMoonExclusion(cx, cyApprox, w, h)) continue;
    const randAlpha = 0.65 + rng() * 0.20;
    const alpha = isMask ? 1.0 : randAlpha;
    drawHangingSprite(ctx, sprite, cx, yAnchor, drawW, drawH,
      (rng() - 0.5) * 0.4, rng() < 0.5, alpha);
  }

  // ── Pass 2: mid canopy (arch-curve baseline) ──────────────────────────
  // ~45% of the total count. Anchored along an arched baseline — clusters
  // near the corners hang shallower (close to top edge); clusters near the
  // center hang deeper (because the arch dips toward the middle). Sin curve
  // yields the natural drape.
  const midN = Math.floor(total * 0.45);
  for (let i = 0; i < midN; i++) {
    const sprite = pickCanopySprite();
    if (!sprite) continue;
    const tx = (i + 0.1 + rng() * 0.8) / midN;
    const cx = tx * w;
    // Arch baseline: top of canvas (0) at the corners, dipping to about
    // 18% of canvas height at center via a sin curve.
    const archDepth = Math.sin(tx * Math.PI) * h * 0.16;
    const sizeFrac = 0.07 + rng() * 0.06;        // medium (7–13% of h)
    const drawH = h * sizeFrac;
    const drawW = drawH * (sprite.sw / sprite.sh);
    // y anchor: stem sits at archDepth minus part of cluster height, so the
    // *visible body bottom* lands roughly on the arch line.
    const yAnchor = archDepth - drawH * (0.75 + rng() * 0.2);
    const cyApprox = yAnchor + drawH * 0.5;
    if (inMoonExclusion(cx, cyApprox, w, h)) continue;
    // Tilt: clusters near corners lean inward to follow the arch gesture.
    const leanDir = tx < 0.5 ? 1 : -1;
    const cornerCloseness = 1 - Math.abs(tx - 0.5) * 2;
    const leanMag = (1 - cornerCloseness) * 0.45;
    const rotation = leanDir * leanMag + (rng() - 0.5) * 0.35;
    const randAlpha = 0.75 + rng() * 0.20;
    const alpha = isMask ? 1.0 : randAlpha;
    drawHangingSprite(ctx, sprite, cx, yAnchor, drawW, drawH,
      rotation, rng() < 0.5, alpha);
  }

  // ── Pass 3: low hangers (corner-anchored long branches) ───────────────
  // ~15% of the total count, clamped to a small absolute count. These are
  // larger branches reaching down into the upper play area from the corners
  // — they tie the side stalks together with the canopy and break the
  // "horizontal band of foliage" silhouette.
  const lowN = Math.min(6, Math.max(2, Math.floor(total * 0.15)));
  for (let i = 0; i < lowN; i++) {
    const sprite = pickCanopySprite();
    if (!sprite) continue;
    // Concentrate near the corners (left third or right third only).
    const fromLeft = rng() < 0.5;
    const tx = fromLeft ? rng() * 0.30 : 1 - rng() * 0.30;
    const cx = tx * w;
    const sizeFrac = 0.12 + rng() * 0.07;        // large (12–19% of h)
    const drawH = h * sizeFrac;
    const drawW = drawH * (sprite.sw / sprite.sh);
    // Hang from the corner — start at top edge, reach down to ~22–35% of h.
    const yAnchor = -drawH * 0.08;
    const cyApprox = yAnchor + drawH * 0.5;
    if (inMoonExclusion(cx, cyApprox, w, h)) continue;
    // Lean strongly inward — these are the "draping branches at the corner."
    const leanDir = fromLeft ? 1 : -1;
    const rotation = leanDir * (0.6 + rng() * 0.3);
    const randAlpha = 0.80 + rng() * 0.18;
    const alpha = isMask ? 1.0 : randAlpha;
    drawHangingSprite(ctx, sprite, cx, yAnchor, drawW, drawH,
      rotation, fromLeft ? false : true, alpha);
  }
}

// Draws a sprite "hanging" from a stem point at (cx, yAnchor). The sprite is
// flipped vertically so its painted stem (sprite-bottom) appears at the
// anchor and the leaves cascade downward into the canvas. Rotation pivots
// around the anchor point for the arch gesture; hFlip mirrors horizontally
// for variety.
function drawHangingSprite(ctx, sprite, cx, yAnchor, drawW, drawH, rotation, hFlip, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, yAnchor);
  if (rotation) ctx.rotate(rotation);
  ctx.scale(hFlip ? -1 : 1, -1);
  ctx.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh,
    -drawW / 2, -drawH, drawW, drawH);
  ctx.restore();
}


// The dead-line IS the water surface. A 1px moonlit specular line, fading
// to invisible at the screen edges so the bamboo-flanked banks read as
// natural shoreline rather than meeting a hard horizon. Subtle by design —
// the reflections below carry most of the "this is water" cue.
// The specular line's gradient depends only on viewport width, so it's fully
// static between resizes — cache it instead of rebuilding 60×/sec for a 1px
// line. Keyed by context too, since the celestial offscreen (non-PERF) and the
// main canvas (PERF) are distinct; only one is used per session.
let waterlineGrad = { ctx: null, w: 0, grad: null };

export function drawWaterline(ctx, layout) {
  const { viewW, deadLineY } = layout;
  ctx.save();
  if (waterlineGrad.ctx !== ctx || waterlineGrad.w !== viewW) {
    const g = ctx.createLinearGradient(0, 0, viewW, 0);
    g.addColorStop(0.00, 'rgba(230, 240, 255, 0)');
    g.addColorStop(0.35, 'rgba(230, 240, 255, 0.28)');
    g.addColorStop(0.65, 'rgba(230, 240, 255, 0.28)');
    g.addColorStop(1.00, 'rgba(230, 240, 255, 0)');
    waterlineGrad = { ctx, w: viewW, grad: g };
  }
  ctx.fillStyle = waterlineGrad.grad;
  ctx.fillRect(0, deadLineY, viewW, 1);
  ctx.restore();
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

  // Moon reflection — warm vertical column on the water, anchored under the
  // moon's current X. Length and intensity scale with altitude (faint at
  // horizon, brightest at zenith). Phase modulates intensity (a new moon
  // reflects almost nothing; a full moon glows brightly). Painted FIRST so
  // lantern reflections sit on top.
  const m = moonState(layout, settings, Date.now());
  if (m.altitude > 0.02) {
    const k = (1 - Math.cos(m.phase01 * 2 * Math.PI)) / 2;  // illuminated frac
    const intensity = m.altitude * (0.35 + 0.65 * k);
    const length = Math.min(viewH - deadLineY, m.r * 3 + m.r * 9 * m.altitude);
    const reflectionTop = deadLineY + 1;
    const tNow = reducedMotion ? 0 : performance.now() / 1000;
    const SLICES = PERF_MODE ? 12 : 24;
    const sliceH = length / SLICES;
    for (let i = 0; i < SLICES; i++) {
      const f = i / (SLICES - 1);
      const vAlpha = Math.pow(1 - f, 1.6);   // bias the brightness to the top
      if (vAlpha < 0.02) continue;
      const sliceY = reflectionTop + i * sliceH;
      // Per-slice horizontal jitter sells "water rippling" without needing a
      // real shader. Amplitude grows downstream; phase advances with time.
      const shimmer = reducedMotion ? 0 : Math.sin(f * 6.0 + tNow * 1.2) * m.r * 0.18 * f;
      const cxJ = m.cx + shimmer;
      // Widen toward the base — the reflection spreads as it crosses the
      // moon's distance over the water surface.
      const halfW = m.r * (0.9 + f * 0.7);
      const a = (0.50 * vAlpha * intensity).toFixed(3);
      const grad = ctx.createLinearGradient(cxJ - halfW, 0, cxJ + halfW, 0);
      grad.addColorStop(0,   'rgba(245, 198, 132, 0)');
      grad.addColorStop(0.5, `rgba(245, 198, 132, ${a})`);
      grad.addColorStop(1,   'rgba(245, 198, 132, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(cxJ - halfW, sliceY, halfW * 2, sliceH + 1);
    }
  }

  const jitterTSec = reducedMotion ? 0 : performance.now() / 1000;
  for (const l of board.lanterns) {
    if (l.drown && l.drown.extinguished) continue;
    let dx = l.x, dy = l.y;
    if (l.anim) {
      const e = easeOut(l.anim.t);
      dx = l.anim.fromX + (l.x - l.anim.fromX) * e;
      dy = l.anim.fromY + (l.y - l.anim.fromY) * e;
    }
    if (l.drown) { dx += l.drown.offsetX; dy += l.drown.offsetY; }
    if (animY !== 0 && !reducedMotion && !l.drown) {
      const j = descentJitter(l, layout, board, jitterTSec);
      if (j) { dx += j.dx; dy += j.dy; }
    }
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
      { lit: true, intensity: 0.55, phase: phaseOf(l), boost, isReflection: true, designId: l.designId });
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
          { lit: true, intensity: ignite * 0.55, phase, isReflection: true, designId: shot.designId });
        ctx.restore();
      }
    }
  }

  ctx.restore();
}

// ─── Board + lanterns ──────────────────────────────────────────────────────

const DESCENT_TOTAL_NY = Math.sqrt(3);   // one packed-row in normalized units

// Visual-only sway applied to each lantern while the descent animation is
// running. Returns {dx, dy} pixel offsets that should be ADDED to the lantern's
// grid position. The envelope is zero at both endpoints of the descent so the
// next phase always begins with lanterns exactly on their grid cells — this
// never mutates board state, only what the player sees.
//
// Each lantern gets its own phase via phaseOf(); the nx/ny couplings make the
// sway travel across the field like a connected system reacting to the push
// from above, rather than every lantern dancing solo. The incommensurate
// frequencies (3.1, 4.2, 5.3, 6.9) avoid the lockstep that read as mechanical.
function ambientWindSway(l, layout, tSec) {
  const windSpeed = ENV_PARAMS.windSpeed || 0;
  if (windSpeed <= 0) return null;
  const phase = phaseOf(l);
  const nx = l.nx || 0;
  const ny = l.ny || 0;
  const freq = ENV_PARAMS.windFrequency || 1.0;

  // Compound sines for natural organic swaying motion
  const swayX = Math.sin(tSec * 2.1 * freq + phase + ny * 1.2) * 0.50
              + Math.sin(tSec * 3.7 * freq + phase * 1.5 + nx * 0.5) * 0.30;
  const swayY = Math.cos(tSec * 1.8 * freq + phase * 0.8 + nx * 0.4) * 0.25;

  const r = layout.size;
  return {
    dx: swayX * r * 0.12 * windSpeed,
    dy: swayY * r * 0.05 * windSpeed,
  };
}

function descentJitter(l, layout, board, tSec) {
  const animY = board.descentAnimY || 0;
  if (animY === 0) return null;
  const progress = 1 + animY / (DESCENT_TOTAL_NY * layout.size);
  if (progress <= 0 || progress >= 1) return null;
  const env = Math.sin(Math.PI * progress);

  const phase = phaseOf(l);
  const nx = l.nx || 0;
  const ny = l.ny || 0;
  const swayX = Math.sin(tSec * 3.1 + phase + ny * 1.7) * 0.65
              + Math.sin(tSec * 5.3 + phase * 1.7 + nx * 0.43) * 0.45;
  const swayY = Math.sin(tSec * 4.2 + phase * 0.9 + nx * 0.31) * 0.55
              + Math.cos(tSec * 6.9 + phase * 1.3 + ny * 0.9) * 0.40;
  const r = layout.size;
  return {
    // Horizontal sway is more pronounced (lanterns hang freely on their cords);
    // vertical bobble is smaller (the cord resists stretching).
    dx: swayX * r * 0.14 * env,
    dy: swayY * r * 0.07 * env,
  };
}

export function drawBoard(ctx, layout, game, settings) {
  const board = game.board;
  const { size, viewH } = layout;
  const animY = board.descentAnimY || 0;
  const reducedMotion = settings && settings.reducedMotion;
  const tSec = reducedMotion ? 0 : performance.now() / 1000;
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
    if (animY !== 0 && !reducedMotion && !l.drown) {
      const j = descentJitter(l, layout, board, tSec);
      if (j) { dx += j.dx; dy += j.dy; }
    } else if (!reducedMotion && !l.drown && ENV_PARAMS.windSpeed > 0) {
      const wSway = ambientWindSway(l, layout, tSec);
      if (wSway) { dx += wSway.dx; dy += wSway.dy; }
    }
    const boost = reducedMotion ? 0 : rippleBoost(game, l.nx, l.ny);
    if (spin) {
      ctx.save();
      ctx.translate(dx, dy + animY);
      ctx.rotate(spin);
      drawLantern(ctx, 0, 0, size, l.color,
        { lit, phase: phaseOf(l), boost, designId: l.designId });
      ctx.restore();
    } else {
      drawLantern(ctx, dx, dy + animY, size, l.color,
        { lit, phase: phaseOf(l), boost, designId: l.designId });
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
  const isReflection = opts && opts.isReflection;
  const designId = opts && opts.designId;

  const sprite = getLanternSprite(colorKey, designId);
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
    if (isReflection) {
      if (lit) drawEmberHalo(ctx, cx, rimY, size, level);
      const prevAlpha = ctx.globalAlpha;
      ctx.globalAlpha = prevAlpha * LANTERN_PARAMS.opacity;
      ctx.drawImage(image, sx, sy, sw, sh, cx - dw / 2, cy - dh / 2, dw, dh);
      ctx.globalAlpha = prevAlpha;
      return;
    }
    if (lit) drawEmberHalo(ctx, cx, rimY, size, level);
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * LANTERN_PARAMS.opacity;
    ctx.drawImage(image, sx, sy, sw, sh, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.globalAlpha = prevAlpha;
    // Optional opacity backing — overlays the lantern's color onto the sprite
    // silhouette using 'source-atop' so only the painted pixels gain saturation.
    // backing=0 (default) preserves the natural translucent paper look;
    // backing=1 pushes the body fully toward the flat color.
    //
    // The overlay is a vertical gradient, NOT a flat fill: full strength at
    // the top of the lantern body, tapering to a small fraction at the rim.
    // Physical motivation — moonlight hits the lantern from above, so the
    // top of the paper is exposed to the most direct light and blocks the
    // sky behind most effectively; the bottom is where the flame's own warm
    // glow takes over and the paper reads as backlit/translucent. The
    // gradient sells "lit from outside above, lit from within below."
    if (LANTERN_PARAMS.backing > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      const baseAlpha = prevAlpha * LANTERN_PARAMS.backing;
      const color = COLORS[colorKey] || PALETTE.ember;
      const top = cy - dh / 2;
      const bot = cy + dh / 2;
      const grad = ctx.createLinearGradient(0, top, 0, bot);
      grad.addColorStop(0.0, hexToRgba(color, baseAlpha));
      grad.addColorStop(0.6, hexToRgba(color, baseAlpha * 0.55));
      grad.addColorStop(1.0, hexToRgba(color, baseAlpha * 0.20));
      ctx.fillStyle = grad;
      ctx.fillRect(cx - dw / 2, top, dw, dh);
      ctx.restore();
    }
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

// Per-lantern glow gradients (ember halo, ember core, flame body + core) are
// built at a LOCAL origin and reused via ctx.translate, so a single gradient
// object serves every lantern at a given brightness instead of allocating ~6
// gradients per lantern per frame. On a full board, drawn across both the
// board pass and the reflection pass, that was hundreds of allocations (and
// color-stop string parses) every frame — the dominant steady-state GC load.
//
// A canvas gradient is painted in the coordinate space active when it's USED,
// not when created, so an origin-built gradient lands wherever we translate to.
// The only per-lantern variable is the ember `level`, which scales alpha
// linearly and grows the radius slightly; we quantize it to LEVEL_STEPS buckets
// so near-identical brightnesses share a cached gradient. At 240 steps across
// emberLevel's [0.05, 1.3] range the alpha/size quantum is far below
// perceptible — the flicker still reads as smooth and continuous.
//
// Gradients are bound to the context that paints them, and in the non-PERF
// path lanterns draw on BOTH the celestial offscreen (reflections) and the
// main canvas (board) within one frame, so the cache is keyed by context via a
// WeakMap. Each entry rebuilds only when the lantern `size` changes (a resize);
// otherwise it fills buckets on demand and stays warm for the session.
const LEVEL_STEPS = 240;
const LEVEL_MIN = 0.05;
const LEVEL_MAX = 1.3;
const lanternGradCaches = new WeakMap();

function lanternGrads(ctx, size) {
  let c = lanternGradCaches.get(ctx);
  if (!c || c.size !== size) {
    c = {
      size,
      halo: new Array(LEVEL_STEPS + 1),
      core: new Array(LEVEL_STEPS + 1),
      flameOuter: new Array(LEVEL_STEPS + 1),
      flameInner: new Array(LEVEL_STEPS + 1),
      fuelSide: null,
      fuelTop: null,
    };
    lanternGradCaches.set(ctx, c);
  }
  return c;
}

function levelBucket(level) {
  const clamped = level < LEVEL_MIN ? LEVEL_MIN : level > LEVEL_MAX ? LEVEL_MAX : level;
  return Math.round(((clamped - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN)) * LEVEL_STEPS);
}

function bucketLevel(bucket) {
  return LEVEL_MIN + (bucket / LEVEL_STEPS) * (LEVEL_MAX - LEVEL_MIN);
}

// Ambient warm bloom around the lantern, anchored at the flame so the bloom
// hangs from the mouth instead of haloing the lantern body uniformly. The
// reach is slightly larger than the lamp itself so neighboring lanterns share
// in the warmth — that's the visual "lift" of a lit field.
function drawEmberHalo(ctx, gx, gy, size, level) {
  const cache = lanternGrads(ctx, size);
  const b = levelBucket(level);
  const ql = bucketLevel(b);
  const r = size * (2.0 + 0.3 * ql);
  let grad = cache.halo[b];
  if (!grad) {
    grad = ctx.createRadialGradient(0, 0, size * 0.1, 0, 0, r);
    grad.addColorStop(0,    `rgba(255, 220, 150, ${0.32 * ql})`);
    grad.addColorStop(0.40, `rgba(255, 175, 95,  ${0.13 * ql})`);
    grad.addColorStop(1,    'rgba(255, 140, 50, 0)');
    cache.halo[b] = grad;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(gx, gy);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Hot pocket of light inside the lantern body, sitting just above the rim
// where the flame burns. 'lighter' compositing brightens the paper face from
// within without overpainting it.
function drawEmberCore(ctx, gx, gy, size, level) {
  const cache = lanternGrads(ctx, size);
  const b = levelBucket(level);
  const ql = bucketLevel(b);
  const r = size * (1.0 + 0.18 * ql);
  let grad = cache.core[b];
  if (!grad) {
    grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0,   `rgba(255, 245, 200, ${0.38 * ql})`);
    grad.addColorStop(0.5, `rgba(255, 180, 90,  ${0.18 * ql})`);
    grad.addColorStop(1,   'rgba(255, 140, 50, 0)');
    cache.core[b] = grad;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(gx, gy);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
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

  // The fuel puck has no flicker dependence — its two gradients are fully
  // determined by `size`, so build them once at the local origin and reuse
  // them for every lantern, lit or not (this runs for the whole board each
  // frame). The lanternGrads cache already invalidates on a size change.
  const cache = lanternGrads(ctx, size);
  if (!cache.fuelSide) {
    const sideGrad = ctx.createLinearGradient(0, 0, 0, sideH);
    sideGrad.addColorStop(0, '#1d0e06');
    sideGrad.addColorStop(1, '#070302');
    cache.fuelSide = sideGrad;
    const topGrad = ctx.createRadialGradient(
      0, -topRy * 0.55, 0,
      0,  topRy * 0.35, halfW * 1.35,
    );
    topGrad.addColorStop(0,    '#9c5128');
    topGrad.addColorStop(0.45, '#552410');
    topGrad.addColorStop(1,    '#180a04');
    cache.fuelTop = topGrad;
  }

  ctx.save();
  ctx.translate(gx, gy);

  // Bottom rim. Drawn first; only its front-bottom arc remains visible after
  // the side wall is painted on top.
  ctx.fillStyle = '#070302';
  ctx.beginPath();
  ctx.ellipse(0, sideH, halfW, topRy, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cylindrical side wall. The path runs:
  //   left edge ↓ → bottom-rim front arc → right edge ↑ → top-rim front arc.
  // A vertical gradient dims the wall toward its base so the cylinder reads
  // as receding from the light above.
  ctx.fillStyle = cache.fuelSide;
  ctx.beginPath();
  ctx.moveTo(-halfW, 0);
  ctx.lineTo(-halfW, sideH);
  ctx.ellipse(0, sideH, halfW, topRy, 0, Math.PI, 0, true);
  ctx.lineTo(halfW, 0);
  ctx.ellipse(0, 0, halfW, topRy, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();

  // Top face — lit from above. A radial gradient anchored at the back-center
  // of the top ellipse gives a warm copper highlight that fades to deep char
  // toward the front edge, suggesting the lamp's interior glow falling on it.
  ctx.fillStyle = cache.fuelTop;
  ctx.beginPath();
  ctx.ellipse(0, 0, halfW, topRy, 0, 0, Math.PI * 2);
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
  const cache = lanternGrads(ctx, size);
  const b = levelBucket(level);
  const ql = bucketLevel(b);
  const outerW = size * (0.13 + 0.025 * ql);
  const outerLen = size * (0.65 + 0.20 * ql);
  const innerW = outerW * 0.55;
  const innerLen = outerLen * 0.62;

  // Both flame layers are built at the local origin (rising from y=0 upward)
  // and reused per brightness bucket. Their vertical extent is baked into the
  // gradient, so the bucket also fixes outerLen/innerLen — consistent with the
  // ellipse geometry below.
  let outer = cache.flameOuter[b];
  if (!outer) {
    outer = ctx.createLinearGradient(0, 0, 0, -outerLen);
    outer.addColorStop(0,    `rgba(255, 220, 140, ${0.45 * ql})`);
    outer.addColorStop(0.35, `rgba(255, 185, 90,  ${0.32 * ql})`);
    outer.addColorStop(0.75, `rgba(255, 135, 55,  ${0.14 * ql})`);
    outer.addColorStop(1,    'rgba(255, 100, 30, 0)');
    cache.flameOuter[b] = outer;
  }
  let inner = cache.flameInner[b];
  if (!inner) {
    inner = ctx.createLinearGradient(0, 0, 0, -innerLen);
    inner.addColorStop(0,    `rgba(255, 235, 190, ${0.55 * ql})`);
    inner.addColorStop(0.40, `rgba(255, 215, 150, ${0.40 * ql})`);
    inner.addColorStop(0.80, `rgba(255, 185, 100, ${0.18 * ql})`);
    inner.addColorStop(1,    'rgba(255, 165, 75, 0)');
    cache.flameInner[b] = inner;
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(gx, gy);

  // Outer body
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.ellipse(0, -outerLen / 2, outerW, outerLen / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner hot core — warm cream, not white. The peak sits around 255,235,190
  // (a candle's hottest yellow-cream) so the flame harmonizes with the moon
  // (#F5E9C9) and reads as lit-by-fuel rather than lit-by-LED.
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.ellipse(0, -innerLen / 2, innerW, innerLen / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ─── Launcher, shot queue, aim line, projectile ─────────────────────────────

// Bamboo cradle: a short post + curved "U" that holds the loaded lantern
// above the tip, fully visible. Rotates with aim. The static base sits at the
// tip and does not rotate, so the launcher feels anchored on the river.
// Beautiful oriental fantasy cradle harness that holds and ignites the lantern.
// Sits at the launcher tip, rotates with aim, sways gently on the water waterline
// as a mirror reflection, and ignites the loaded lantern with an active pilot burner.
function drawProceduralLauncherFallback(ctx, layout, game) {
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
  ctx.strokeStyle = PALETTE.bambooSilhouette;
  ctx.lineWidth = stroke;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -postLen);
  ctx.stroke();

  const sideY   = -postLen;
  const middleY = -postLen + cradleDip;
  const ctrlY   = sideY + 2 * cradleDip;
  ctx.lineWidth = Math.max(2, r * 0.18);
  ctx.beginPath();
  ctx.moveTo(-cradleW / 2, sideY);
  ctx.quadraticCurveTo(0, ctrlY, cradleW / 2, sideY);
  ctx.stroke();

  if (game.phase === PHASE.AIMING) {
    const lanternY = middleY - r;
    ctx.save();
    ctx.translate(0, lanternY);
    ctx.rotate(-game.aimAngle);
    drawLantern(ctx, 0, 0, r, game.queue.current, { lit: false, designId: game.queue.currentDesign });
    ctx.restore();
  }

  ctx.restore();
}

// Draws two parallel bamboo sticks (the fork) that grip the lantern by its rim.
// The fuel pellet hangs below through the center gap.
function drawBambooFork(ctx, r) {
  const tineLen = r * 1.5;      // each tine extends this far from center
  const thick   = r * 0.14;     // bamboo stick thickness
  const gapHalf = r * 0.18;     // half the center gap (fuel pellet hangs through)

  ctx.save();

  // Flat silhouette matching the bamboo grove backdrop. No highlights, no
  // node-bands, no lashings — just the cane shapes filled in the same dark
  // indigo tint the trees use, so the forks read as part of the painted
  // background rather than a separately-lit prop.
  ctx.fillStyle = PALETTE.bambooSilhouette;
  for (const sign of [-1, 1]) {
    const x0 = sign < 0 ? -tineLen : gapHalf;
    const w  = tineLen - gapHalf;
    ctx.beginPath();
    ctx.roundRect(x0, -thick / 2, w, thick, thick / 3);
    ctx.fill();
  }

  ctx.restore();
}

function drawLauncherAssembly(ctx, layout, game, tSec, isReflection) {
  const wheelSprite = getLauncherWheelSprite();

  const r = layout.size;
  const handedness = layout.handedness || 'right';

  // 1. Recoil state & Bobbing offset — a subtle settle, not a bounce. The
  //   launcher should feel anchored, so amplitudes are kept small and the
  //   decay envelope is steep enough that the cradle is essentially still
  //   within ~0.6s of firing.
  const t_recoil = tSec - (game.recoilTime || 0);
  let bobY = 0;
  let swayX = 0;
  if (t_recoil >= 0 && t_recoil < 1.0) {
    const decay = Math.exp(-7.5 * t_recoil);
    bobY = 0.28 * r * decay * Math.sin(16.0 * t_recoil);
    swayX = 0.10 * r * decay * Math.sin(8.0 * t_recoil);
  }

  // 2. Wheel rotation progress (smooth 90-degree transition)
  //   The wheel turns through a quarter revolution while the shot is airborne.
  //   Quintic ease-out gives a heavy, deliberate "settles into place" feel —
  //   it accelerates immediately on launch and decelerates gracefully into the
  //   docked position. Holds at ±π/2 until landing snaps the queue forward.
  const WHEEL_ROTATE_SEC = 2.2;
  const t_launch = tSec - (game.lastLaunchTime || 0);
  let wheelAngle = 0;
  if (game.phase === PHASE.FLYING) {
    const p = Math.min(1, t_launch / WHEEL_ROTATE_SEC);
    const ease = 1 - Math.pow(1 - p, 5); // quintic ease out
    wheelAngle = (handedness === 'right' ? -Math.PI / 2 : Math.PI / 2) * ease;
  }

  // 3. Physical geometries & scaling
  // Bamboo fork geometry — two sticks at each spoke end grip the lantern rim.
  // The lantern rim rests on the fork; the fuel pellet hangs below through the gap.
  // d_hinge_lantern = distance from the fork (spoke tip) upward to the lantern center.
  // The fork grips the rim at the very bottom of the lantern, so the center
  // is approximately 0.65r above the fork level.
  const d_hinge_lantern = r * 0.65;

  // Wheel scaling
  const dw = r * 6.2;
  const R_wheel = dw / 2;
  const R_mount = R_wheel * 0.85; // mounting radius

  // Lift the entire cradle so the wheel hub and axle peg sit above the
  // waterline. tipY is intentionally a touch below deadLineY (lantern hovers
  // on the surface); without this lift the wheel and stand are submerged.
  const cradleLift = r * 0.6;

  // Axle center position relative to tip
  const x_wheel = bobY === 0 ? 0 : swayX;
  const y_wheel = d_hinge_lantern + R_mount + bobY - cradleLift;

  // B. Draw the Spoked Bamboo Wheel
  ctx.save();
  ctx.translate(x_wheel, y_wheel);
  ctx.rotate(wheelAngle);
  ctx.drawImage(
    wheelSprite.image,
    wheelSprite.sx, wheelSprite.sy, wheelSprite.sw, wheelSprite.sh,
    -dw / 2, -dw / 2, dw, dw
  );
  ctx.restore();

  // B2. Open hub flame — hand-painted sprite flipbook at the wheel axis,
  //   plus a soft warm halo behind it. The flame body sells the ignition
  //   visually; the halo bleeds warmth onto the spokes and the next-fork
  //   lantern as it rotates into view.
  if (!isReflection) {
    const flickerPulse = 1.0 + 0.06 * Math.sin(tSec * 5.0) + 0.04 * Math.cos(tSec * 8.0);
    const haloR = r * 1.8 * flickerPulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(x_wheel, y_wheel, 0, x_wheel, y_wheel, haloR);
    halo.addColorStop(0,    'rgba(255, 205, 135, 0.50)');
    halo.addColorStop(0.35, 'rgba(255, 165,  85, 0.22)');
    halo.addColorStop(1,    'rgba(255, 120,  50, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x_wheel, y_wheel, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawHubFlame(ctx, x_wheel, y_wheel, r, tSec);
  }

  // C. Draw 4 bamboo forks at 90-degree offsets on the Wheel
  ctx.save();
  ctx.translate(x_wheel, y_wheel);

  // Scale interpolation: as the wheel rotates, the outgoing top fork shrinks
  // 1.0 → 0.70 and the incoming "next" fork grows 0.70 → 1.0, so the lantern
  // arrives at the top already at full size instead of popping.
  const SCALE_TOP = 1.0;
  const SCALE_SIDE = 0.70;
  const rotProgress = Math.abs(wheelAngle) / (Math.PI / 2);

  const mountAngles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  for (let i = 0; i < 4; i++) {
    const theta_mount = mountAngles[i];
    // World mounting position relative to wheel center
    const theta_world = theta_mount + wheelAngle;
    const px = R_mount * Math.cos(theta_world);
    const py = R_mount * Math.sin(theta_world);

    const isTopFork = theta_mount === -Math.PI / 2;
    const isNextFork = (handedness === 'right' && theta_mount === 0) ||
                       (handedness === 'left' && theta_mount === Math.PI);

    // Save context to draw this fork
    ctx.save();
    ctx.translate(px, py);

    let pScale;
    if (isTopFork) {
      pScale = SCALE_TOP + (SCALE_SIDE - SCALE_TOP) * rotProgress;
    } else if (isNextFork) {
      pScale = SCALE_SIDE + (SCALE_TOP - SCALE_SIDE) * rotProgress;
    } else {
      pScale = SCALE_SIDE;
    }
    ctx.scale(pScale, pScale);

    // If this is the Top/Active fork, aim-align it!
    let activeAim = 0;
    if (isTopFork) {
      activeAim = game.aimAngle;
      ctx.rotate(activeAim);
    }

    // Draw the bamboo fork (two parallel sticks gripping the lantern rim)
    drawBambooFork(ctx, r);

    // Draw lantern held by the fork
    if (isTopFork) {
      // Top fork: contains the active loaded lantern (current). Show it in
      // every "between shots" phase, not just AIMING — settling and descending
      // are brief, but the loaded lantern shouldn't pop out and back in.
      const loadedVisible =
        game.phase === PHASE.AIMING ||
        game.phase === PHASE.SETTLING ||
        game.phase === PHASE.DESCENDING;
      if (loadedVisible) {
        ctx.save();
        ctx.translate(0, -d_hinge_lantern);
        ctx.rotate(-activeAim); // Keep lantern visually upright
        
        // Lantern is lit — fuel pellet was ignited by the pilot flame
        const litVal = !isReflection;
        drawLantern(ctx, 0, 0, r, game.queue.current, {
          lit: litVal,
          intensity: 0.40 + 0.12 * Math.sin(tSec * 4.0),
          phase: 0,
          designId: game.queue.currentDesign
        });
        ctx.restore();

        // Rising heat sparks from the ignited fuel pellet
        if (!isReflection) {
          drawSparks(ctx, -d_hinge_lantern, r, tSec);
        }
      }
    } else if (isNextFork) {
      // Next fork holds game.queue.next — stays dark until it docks at the
      // top, then ignites over IGNITE_AT_TOP_SEC. The hub flame visually
      // catches the wick; the ramp lands on the same flicker envelope the
      // seated top fork uses so the wheel's snap-back has no brightness pop.
      // A catch-light pulse (boost field, Gaussian peaked mid-ignition)
      // briefly drives the lantern above its resting glow so the player
      // sees the wick "take" from the hub flame rather than fade in.
      ctx.save();
      ctx.translate(0, -d_hinge_lantern);
      const IGNITE_AT_TOP_SEC = 0.45;
      const t_at_top = (game.phase === PHASE.FLYING)
        ? Math.max(0, t_launch - WHEEL_ROTATE_SEC)
        : 0;
      const igniteRaw = Math.min(1, t_at_top / IGNITE_AT_TOP_SEC);
      const igniteEase = igniteRaw * igniteRaw * (3 - 2 * igniteRaw);
      const seatedIntensity = 0.40 + 0.12 * Math.sin(tSec * 4.0);
      // Catch-light: peaks just before ignition completes, then decays. Width
      // is narrow enough that it's faded to near-zero by the wheel snap-back,
      // preserving the existing no-pop transition into the active fork.
      const catchTau = (t_at_top - 0.32) / 0.16;
      const catchPulse = Math.exp(-catchTau * catchTau);
      drawLantern(ctx, 0, 0, r, game.queue.next, {
          lit: !isReflection && igniteEase > 0,
          intensity: igniteEase * seatedIntensity * (1 + 0.5 * catchPulse),
          boost: 0.55 * catchPulse,
          phase: 0,
          designId: game.queue.nextDesign
      });
      ctx.restore();
    } else if (theta_mount === Math.PI / 2) {
      // After-next fork at the bottom of the wheel — holds game.queue.afterNext.
      // Between shots it sits below the waterline (hidden); during firing it
      // rotates up into the on-deck side position.
      ctx.save();
      ctx.translate(0, -d_hinge_lantern);
      drawLantern(ctx, 0, 0, r, game.queue.afterNext, { lit: false, designId: game.queue.afterNextDesign });
      ctx.restore();
    }

    ctx.restore(); // restore fork context
  }

  ctx.restore(); // restore wheel center context
}

export function drawLauncher(ctx, layout, game) {
  const tip = launcherTip(layout);
  const r = layout.size;
  const tSec = performance.now() / 1000;
  
  const wheelSprite = getLauncherWheelSprite();

  // If the wheel sprite hasn't loaded, fall back to procedural launcher. The
  // fork is drawn procedurally either way, so the wheel is the only sprite
  // that gates the painted path.
  if (!wheelSprite) {
    drawProceduralLauncherFallback(ctx, layout, game);
    return;
  }

  // 1. Water Reflection (below waterline)
  ctx.save();
  // Clip reflection to the water area only!
  ctx.beginPath();
  ctx.rect(0, layout.deadLineY, layout.viewW, layout.viewH - layout.deadLineY);
  ctx.clip();

  // Mirror across the local waterline (yLocal = deadLineY - tip.y)
  const yLocal = layout.deadLineY - tip.y;
  ctx.translate(tip.x, yLocal);
  ctx.scale(1, -1);
  ctx.translate(-tip.x, -yLocal);

  // Apply a gentle sinusoidal water ripple drift
  const rippleSway = Math.sin(tSec * 2.4) * r * 0.04;
  ctx.translate(tip.x + rippleSway, tip.y);
  ctx.globalAlpha = 0.26; // Soft water reflection alpha

  drawLauncherAssembly(ctx, layout, game, tSec, /*isReflection=*/true);
  ctx.restore();

  // 2. Main Launcher Assembly (Above Water)
  ctx.save();
  ctx.translate(tip.x, tip.y);
  drawLauncherAssembly(ctx, layout, game, tSec, /*isReflection=*/false);
  ctx.restore();
}

// Draw a double-layered flickering gas pilot flame at the burner tip
// Hand-painted flame flipbook at the wheel hub. Holds each frame for
// FLAME_FRAME_MS and cross-fades into the next so the flicker reads as a
// continuous flow rather than discrete frames. Frames are pulled in a
// shuffled sequence so the loop never repeats in a detectable pattern.
// Falls back to the procedural pilot flame if the sheet hasn't loaded yet.
const FLAME_FRAME_MS = 230;

// Stateless integer hash → pseudo-random frame index. Same i always returns
// the same frame, so consecutive draws agree on what "the current frame" is
// while still appearing random across the run. Constrains adjacent frames to
// be non-equal so the cross-fade always has something to interpolate.
function rawHash(i, total) {
  let h = (i + 0x9E3779B9) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
  h ^= h >>> 16;
  return (h >>> 0) % total;
}

function flameFrameForCycle(i, total) {
  if (i <= 0) return rawHash(0, total);
  let prevResolved = rawHash(0, total);
  for (let k = 1; k <= i; k++) {
    const f = rawHash(k, total);
    if (f === prevResolved) {
      prevResolved = (f + 1) % total;
    } else {
      prevResolved = f;
    }
  }
  return prevResolved;
}

function drawHubFlame(ctx, cx, cy, r, tSec) {
  const sheet = getFlameSheet();
  if (!sheet) {
    drawPilotFlame(ctx, cx, cy + r * 0.08, r * 0.55, tSec);
    return;
  }
  const phase = (tSec * 1000) / FLAME_FRAME_MS;
  const cycle = Math.floor(phase) % 256;
  const nextCycle = (cycle + 1) % 256;
  const frameA = flameFrameForCycle(cycle,     sheet.frames);
  const frameB = flameFrameForCycle(nextCycle, sheet.frames);
  const blend  = phase - cycle;
  // Smoothstep keeps each held frame "stable" through its middle and pushes
  // the perceived motion into the transition — feels less linear, more like
  // breathing fire.
  const t = blend * blend * (3 - 2 * blend);

  // Tall enough that the painted tip reaches the top-fork lantern's fuel
  // puck (R_mount + ~0.88r above the hub) so the spoke flame visibly licks
  // the wick rather than floating below it. Width scales from the source
  // aspect to preserve the painted shape. A subtle vertical bob keeps it
  // from feeling stamped to the hub between frame transitions.
  const bob = Math.sin(tSec * 4.2) * r * 0.015;
  const dh = r * 2.5;
  const dw = dh * (sheet.frameW / sheet.frameH);
  const dx = cx - dw / 2;
  const dy = cy - dh * 0.82 + bob;

  // Sprite is luminance-keyed to alpha at load time (see loadAssets in
  // assets.js), so default source-over draws preserve the painter's bronze
  // shading. The surrounding warm halo is drawn separately by the caller and
  // handles the additive bloom — keeping the sprite itself out of 'lighter'
  // stops the grey AA aura from washing the wheel.
  ctx.save();
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = prevAlpha * (1 - t);
  ctx.drawImage(sheet.image, frameA * sheet.frameW, 0, sheet.frameW, sheet.frameH, dx, dy, dw, dh);
  ctx.globalAlpha = prevAlpha * t;
  ctx.drawImage(sheet.image, frameB * sheet.frameW, 0, sheet.frameW, sheet.frameH, dx, dy, dw, dh);
  ctx.globalAlpha = prevAlpha;
  ctx.restore();
}

function drawPilotFlame(ctx, cx, cy, r, tSec) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Rapid height and width flicker term
  const flicker = 1.0 + 0.14 * Math.sin(tSec * 16.0) + 0.08 * Math.cos(tSec * 28.0);
  const outerW = r * 0.11 * flicker;
  const outerH = r * 0.26 * flicker;
  const innerW = outerW * 0.55;
  const innerH = outerH * 0.62;

  // Outer warm amber flame
  const outerGrad = ctx.createLinearGradient(cx, cy, cx, cy - outerH);
  outerGrad.addColorStop(0,   'rgba(255, 140, 50, 0.45)');
  outerGrad.addColorStop(0.4, 'rgba(255, 190, 80, 0.28)');
  outerGrad.addColorStop(1,   'rgba(255, 100, 30, 0)');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy - outerH / 2, outerW, outerH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner hot celestial-blue core
  const innerGrad = ctx.createLinearGradient(cx, cy, cx, cy - innerH);
  innerGrad.addColorStop(0,   'rgba(90, 210, 255, 0.82)');
  innerGrad.addColorStop(0.5, 'rgba(120, 230, 255, 0.40)');
  innerGrad.addColorStop(1,   'rgba(255, 255, 255, 0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy - innerH / 2, innerW, innerH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Draw a steady stream of procedurally rising amber spark embers
function drawSparks(ctx, burnerY, r, tSec) {
  const numSparks = 5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < numSparks; i++) {
    // Stagger starts
    const progress = ((tSec * 0.5 + i / numSparks) % 1.0);
    // Sparks rise from the burner up through the canopy
    const sparkY = burnerY - progress * r * 1.5;
    // Gentle sway horizontally
    const sway = Math.sin(tSec * 2.8 + i * 2.1) * r * 0.16;
    const sparkX = sway;
    // Shrink and fade as they ascend
    const sparkR = r * 0.05 * (1.0 - progress);
    const alpha = 0.75 * (1.0 - progress);

    ctx.fillStyle = `rgba(255, 175, 75, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, sparkR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawShotQueue(ctx, layout, game, settings) {
  // Redundant HUD queue disabled: the next lantern is now beautifully scoop-loaded
  // directly onto the rotating wheel plate in drawLauncherAssembly.
}


// The aim preview re-runs a ray-march (up to thousands of steps, allocating a
// points array) every frame while aiming, even when nothing has changed. It's
// a pure function of (aim angle, board, layout), and during AIMING the board
// is static — lanterns only move when a shot resolves, which always replaces
// board.lanterns with a fresh array (pop/drop filter) or changes its length
// (placement/descent push). So we memoize the trace and recompute only when
// the angle moves or that board signature changes: a steadily-held aim hits
// the cache every frame, while dragging recomputes exactly as before. This is
// a render-only cache; the live shot still uses traceFromShot, so the actual
// landing is never affected.
let aimTraceCache = { angle: NaN, lanterns: null, count: -1, size: 0, handed: '', trace: null };

export function drawAimLine(ctx, layout, game) {
  const handed = layout.handedness || 'right';
  const lanterns = game.board.lanterns;
  if (aimTraceCache.angle !== game.aimAngle ||
      aimTraceCache.lanterns !== lanterns ||
      aimTraceCache.count !== lanterns.length ||
      aimTraceCache.size !== layout.size ||
      aimTraceCache.handed !== handed) {
    aimTraceCache = {
      angle: game.aimAngle,
      lanterns,
      count: lanterns.length,
      size: layout.size,
      handed,
      trace: traceAimLine(layout, game.board, game.aimAngle, 1),
    };
  }
  const trace = aimTraceCache.trace;
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
    drawLantern(ctx, trace.settle.x, trace.settle.y, layout.size, game.queue.current, { lit: false, designId: game.queue.currentDesign });
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
    { lit: true, intensity: ignite, phase, designId: shot.designId });
}
