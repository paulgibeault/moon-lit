import { COLORS, PALETTE } from '../constants.js';
import { launcherTip, traceAimLine, PHASE } from '../game.js';
import { rippleBoost } from '../effects.js';
import {
  getLanternSprite,
  getBambooTallSprites, getBambooCaneSprites, getBambooBaseSprites,
  getBambooTipSprites, getBambooStalkSprites, getBambooClusterSprites,
} from '../assets.js';
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

// ─── Bamboo frame ──────────────────────────────────────────────────────────
//
// Sprite-based side bamboo, composed into an offscreen canvas keyed by
// viewport + handedness + dpr. Per-frame cost is one drawImage; the cache
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

let bambooCache = { key: '', canvas: null };

// Called by the admin panel when a BAMBOO_PARAMS value changes. Drops the
// cached canvas so the next render rebuilds with the new params.
export function invalidateBambooCache() {
  bambooCache = { key: '', canvas: null };
}

function getBambooCanvas(w, h, handed, dpr, level) {
  const key = `${w}|${h}|${handed ? 1 : 0}|${dpr}|${level}`;
  if (bambooCache.key === key && bambooCache.canvas) return bambooCache.canvas;
  const c = document.createElement('canvas');
  c.width  = Math.max(1, Math.floor(w * dpr));
  c.height = Math.max(1, Math.floor(h * dpr));
  const cx = c.getContext('2d');
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintBamboo(cx, w, h, handed, level);
  bambooCache = { key, canvas: c };
  return c;
}

export function drawBamboo(ctx, w, h, game, settings) {
  const handed = !!(settings && settings.handedness === 'left');
  const dpr = window.devicePixelRatio || 1;
  const gameLevel = ((game && game.level) | 0) || 1;
  const level = (BAMBOO_PARAMS.levelOverride | 0) || gameLevel;
  const c = getBambooCanvas(w, h, handed, dpr, level);
  ctx.drawImage(c, 0, 0, w, h);
}

// Right-handed launcher → moon on the right; left-handed → moon on the left.
// Each side flags whether it sits on the moon side, so clusters there avoid
// the upper region where the moon's halo lives. Painted in passes so the
// top canopy can layer over the side stalks at the corners (where the real
// bamboo grove would have leaves spilling from above the trunks).
//
// The seed mixes BAMBOO_SEED with the level number so each stage gets its
// own grove composition — different stalk count picks, different cluster
// placements, different canopy density patterns — while remaining stable on
// refresh within a level.
function paintBamboo(ctx, w, h, handed, level) {
  const seed = (BAMBOO_SEED ^ (((level | 0) || 1) * BAMBOO_LEVEL_MULT)) >>> 0;
  const rng = mulberry32(seed);
  paintSide(ctx, rng, w, h, 'left',  handed,  handed);
  paintSide(ctx, rng, w, h, 'right', !handed, handed);
  paintTopCanopy(ctx, rng, w, h, handed);
}

// Returns true when the canvas point (cx, cy) sits inside a generous
// exclusion zone around the moon. The radius is sized to the moon's halo at
// peak combo so the canopy never crowds the celebration meter, and so the
// moon itself stays the obvious focal point at the top of the scene.
function inMoonExclusion(cx, cy, w, h, handed) {
  const moonX = handed ? w * 0.22 : w * 0.78;
  const moonY = h * 0.14;
  const moonR = Math.min(w, h) * 0.07;
  // 3.6 ≈ peak halo (2.4 base + 0.55 comboLift) * a small safety margin so
  // the band of "almost touching the halo" reads as clean sky, not crowded.
  const exclusionR = moonR * 3.6;
  const dx = cx - moonX;
  const dy = cy - moonY;
  return (dx * dx + dy * dy) < (exclusionR * exclusionR);
}

// Pick a sprite from a pool by seed-driven index. Returns null if pool empty.
function pickSprite(rng, pool) {
  if (!pool || pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

// Draws a sprite anchored at (xCenter, yBottom) with the given draw height,
// optionally flipped horizontally. Width preserves native aspect.
function drawSpriteAnchored(ctx, sprite, xCenter, yBottom, drawH, flip) {
  const drawW = drawH * (sprite.sw / sprite.sh);
  const yTop = yBottom - drawH;
  ctx.save();
  if (flip) {
    ctx.translate(xCenter + drawW / 2, yTop);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh,
      0, 0, drawW, drawH);
  } else {
    ctx.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh,
      xCenter - drawW / 2, yTop, drawW, drawH);
  }
  ctx.restore();
}

function paintSide(ctx, rng, w, h, side, isMoonSide, handed) {
  const tall     = getBambooTallSprites();
  const cane     = getBambooCaneSprites();
  const base     = getBambooBaseSprites();
  const stalks   = getBambooStalkSprites();
  const clusters = getBambooClusterSprites();

  // Fall back entirely to procedural if we have no tall sprites — keeps the
  // game playable on a fresh checkout before assets load.
  if (tall.length === 0 && stalks.length === 0) {
    paintFallbackStalks(ctx, rng, w, h, side, isMoonSide);
    return;
  }

  // Layer 1 — background slim trunks: cane sprites stacked on root bases,
  // placed further inside the edge band. Multiple per side so the "depth"
  // beyond the foreground reads as a real grove rather than a single trunk.
  // Root bases visible at the canvas bottom — the camera sits at ground level
  // and the player should see the bamboo growing from the bank in front.
  if (cane.length > 0 && base.length > 0) {
    for (let i = 0; i < BAMBOO_PARAMS.trunksPerSide; i++) {
      // Distribute trunks across the inner half of the edge band so they sit
      // behind the foreground towers. Inner trunks are skinnier and shorter
      // to read as further back in space.
      const tBand = (i + 0.4 + rng() * 0.5) / BAMBOO_PARAMS.trunksPerSide;
      paintBackgroundTrunk(ctx, rng, w, h, side, isMoonSide, cane, base, tBand, handed);
    }
  }

  // Layer 2 — foreground tall stalks: multiple per side, distributed across
  // the outer part of the edge band so they form a cluster of trunks rather
  // than one isolated stalk. Each stalk also gets its own small root base so
  // the grove is anchored at the ground.
  const stalkPool = tall.length > 0 ? tall : stalks;
  if (stalkPool.length > 0) {
    for (let i = 0; i < BAMBOO_PARAMS.towersPerSide; i++) {
      // tTower=0 nearest canvas edge, tTower=1 furthest in. Edge stalk biggest,
      // inner ones progressively shorter to read as receding into the grove.
      const tTower = i / Math.max(1, BAMBOO_PARAMS.towersPerSide - 1);
      paintForegroundStalk(ctx, rng, w, h, side, isMoonSide, stalkPool, tTower, base);
    }
  }

  // Layer 3 — midground clusters: extra clusters at varied heights along the
  // edge band. The increased count (was 1, now BAMBOO_PARAMS.midgroundPerSide)
  // fills the gaps between the trunks so the side reads as a thicket.
  if (clusters.length > 0) {
    for (let i = 0; i < BAMBOO_PARAMS.midgroundPerSide; i++) {
      paintMidgroundCluster(ctx, rng, w, h, side, isMoonSide, clusters);
    }
  }

  // Layer 4 — bottom corner accents: clusters at the foreground sitting on
  // the bank. Two per side give a "grass + leaves at your feet" lushness now
  // that the camera is at ground level.
  if (clusters.length > 0) {
    for (let i = 0; i < BAMBOO_PARAMS.cornerPerSide; i++) {
      paintCornerCluster(ctx, rng, w, h, side, clusters, i);
    }
  }
}

// Foreground tall stalk. Placed with its trunk centered inside the canvas
// edge band so the bare side of the stalk extends off-canvas and the leafy
// side fans inward. Height is bounded so the inward foliage never crosses
// the BAMBOO_PARAMS.edgeBand boundary. Each stalk also drops a small root base at
// its foot so the camera-at-ground-level view shows where the bamboo grows
// from rather than the trunk just disappearing into the bottom edge.
//
// tTower (0..1): 0 = stalk nearest the canvas edge (biggest, foreground),
// 1 = stalk furthest into the band (smallest, recedes into grove).
function paintForegroundStalk(ctx, rng, w, h, side, isMoonSide, pool, tTower, basePool) {
  const sprite = pickSprite(rng, pool);
  if (!sprite) return;

  // Height target falls off with tower depth — edge stalks are tallest,
  // inner ones are progressively shorter so the eye reads depth/recession.
  // Moon side is uniformly shorter so leaves don't crowd the moon halo.
  const baseHeight = isMoonSide ? 0.58 : 0.85;
  const depthDrop  = 0.18;  // edge tallest, inner ~18% shorter
  const heightFrac = baseHeight - tTower * depthDrop + (rng() - 0.5) * 0.06;
  let drawH = h * heightFrac;
  let drawW = drawH * (sprite.sw / sprite.sh);

  // Trunk center: edge stalk at ~4% in, inner stalks at ~10%, ~16%. Within
  // each slot, a small jitter keeps the line of trunks from being too regular.
  const trunkOffsetFrac = 0.04 + tTower * 0.08 + rng() * 0.02;
  const trunkOffset = w * trunkOffsetFrac;
  const xCenter = side === 'left' ? trunkOffset : w - trunkOffset;

  // Constrain inward extent: sprite's inward edge must not cross past
  // BAMBOO_PARAMS.edgeBand from the canvas edge. If it would, shrink uniformly.
  const maxInward = w * BAMBOO_PARAMS.edgeBand;
  const inwardEdge = side === 'left'
    ? (xCenter + drawW / 2)
    : (w - (xCenter - drawW / 2));
  if (inwardEdge > maxInward) {
    const scale = maxInward / inwardEdge;
    drawH *= scale;
    drawW *= scale;
  }

  // Pick the base sprite up front so we can size and position the tall stalk
  // to terminate cleanly in the base's internal-trunk region. Without this
  // up-front coupling, the base's trunk width and the tall stalk's visible
  // trunk width disagree and the two look stacked rather than continuous.
  const baseSprite = (basePool && basePool.length > 0)
    ? pickSprite(rng, basePool) : null;

  // Size the base so its internal trunk equals the tall stalk's visible trunk
  // width. The tall sprite is ~14% trunk; the base sprite is ~23% trunk —
  // so the base's full draw-width is drawW * (TALL_TRUNK / BASE_TRUNK).
  let baseDrawW = 0, baseDrawH = 0;
  if (baseSprite) {
    baseDrawW = drawW * (BAMBOO_PARAMS.tallTrunkFrac / BAMBOO_PARAMS.baseTrunkFrac);
    baseDrawH = baseDrawW * (baseSprite.sh / baseSprite.sw);
  }

  // Anchor the base at the bank line so the grass sits visibly on the ground.
  const baseYBottom = h * BAMBOO_PARAMS.bankYFrac;
  const baseYTop = baseYBottom - baseDrawH;

  // Anchor the tall stalk's bottom at the top of the base's grass region —
  // i.e., the point where the base's internal trunk ends and grass begins.
  // The base's internal trunk runs from baseYTop down through (1 - GRASS_FRAC)
  // of its height; the stalk's trunk continues from above and meets that
  // point. Since the trunk widths match (see baseDrawW above), the seam is
  // invisible. The base, drawn on top, occludes any trunk that overshoots.
  const trunkMeetY = baseSprite
    ? baseYTop + baseDrawH * (1 - BAMBOO_PARAMS.baseGrassFrac)
    : h * 0.97;
  // Slight vertical recession with tower depth keeps inner stalks reading as
  // further away.
  const groundY = trunkMeetY - h * 0.005 * tTower;

  // Flip orientation so leaves preferentially point INWARD on each side. The
  // tall sprites have asymmetric leaf placement; flipping the left side
  // aligns inward-facing leaves with the play area on both sides.
  const flip = (side === 'left');
  drawSpriteAnchored(ctx, sprite, xCenter, groundY, drawH, flip);

  // Draw the base AFTER the stalk so the grass occludes any cane that
  // overshoots, making the trunk read as growing OUT OF the grass clump
  // rather than poking through it like a stick.
  if (baseSprite) {
    const baseFlip = rng() < 0.5;
    drawSpriteAnchored(ctx, baseSprite, xCenter, baseYBottom, baseDrawH, baseFlip);
  }
}

// Background slim trunk. A cane segment scaled to a target trunk width,
// anchored on a root-base sprite at the bottom so the trunk doesn't read as
// chopped. Sits further inside the edge band than the foreground stalks so
// the two layers read as different depths.
//
// tBand (0..1): position within the band. 0 = closer to canvas edge, 1 =
// further inside. Inner trunks are thinner and shorter to read as receding.
function paintBackgroundTrunk(ctx, rng, w, h, side, isMoonSide, canePool, basePool, tBand, handed) {
  const base = pickSprite(rng, basePool);
  if (!base) return;

  // Place further inside the edge band — but still outside the clearing.
  // tBand pushes inner trunks deeper into the band (12–20% in).
  const trunkOffsetFrac = 0.12 + tBand * 0.08 + (rng() - 0.5) * 0.02;
  const xCenter = side === 'left'
    ? w * trunkOffsetFrac
    : w - w * trunkOffsetFrac;

  // Slim trunk width with min — inner trunks are slightly thinner.
  const widthFrac = 0.022 - tBand * 0.006;
  const trunkW = Math.max(7, w * widthFrac);

  // Size the base so its internal trunk equals the cane's visible trunk
  // width. The cane sprite is ~82% trunk (it mostly IS the trunk); the base
  // sprite is ~23% trunk. So when we draw the cane at trunkW wide, the
  // visible trunk is trunkW * CANE_TRUNK_FRAC; to match, the base width is
  // (trunkW * CANE_TRUNK_FRAC) / BASE_TRUNK_FRAC.
  const baseDrawW = trunkW * (BAMBOO_PARAMS.caneTrunkFrac / BAMBOO_PARAMS.baseTrunkFrac);
  const baseDrawH = baseDrawW * (base.sh / base.sw);
  const baseYBottom = h * BAMBOO_PARAMS.bankYFrac;
  const baseYTop = baseYBottom - baseDrawH;

  // Cane stack runs from the top of the moon-clear ceiling down to just past
  // the top of the base's grass region — so the cane terminates inside the
  // base's internal-trunk area where the base (drawn next) will cover any
  // overshoot. This makes the cane appear to grow OUT of the grass.
  const stackHeightFrac = (isMoonSide ? 0.55 : 0.78) - tBand * 0.10;
  const stackTop = h * (1 - stackHeightFrac);
  const stackBottom = baseYTop + baseDrawH * (1 - BAMBOO_PARAMS.baseGrassFrac) * 0.85;
  let y = stackBottom;
  let safety = 32;
  let segTopY = stackBottom;  // tracks the top of the highest-drawn cane segment
  while (y > stackTop && safety-- > 0) {
    const seg = pickSprite(rng, canePool);
    if (!seg) break;
    const segH = trunkW * (seg.sh / seg.sw);
    drawSpriteAnchored(ctx, seg, xCenter, y, segH, false);
    segTopY = y - segH;
    y -= segH * 0.95;  // slight overlap so node seams blend
  }

  // Mask the cane stack's blunt top with a leaf cluster cap. Without this the
  // tileable cane's top edge shows a node band that reads as "sawed off"
  // instead of "growing past the frame." Skipped on moon side if it would
  // cross the exclusion zone.
  if (BAMBOO_PARAMS.caneTopperScale > 0) {
    paintCaneTopper(ctx, rng, w, h, xCenter, segTopY, trunkW, handed, canePool);
  }

  // Draw base LAST so the grass clump occludes any cane that extends past
  // the grass line. Without this the cane looks like a stick poking through
  // the grass instead of bamboo growing from it.
  drawSpriteAnchored(ctx, base, xCenter, baseYBottom, baseDrawH, rng() < 0.5);
}

// Draws a cap at the top of a cane stack to mask the cane sprite's blunt
// node band. Prefers a dedicated tip sprite (purpose-built bamboo culm tip
// that continues the trunk and tapers upward) when one is available, falling
// back to a leaf cluster otherwise.
function paintCaneTopper(ctx, rng, w, h, xCenter, caneTopY, trunkW, handed, canePool) {
  const tipPool = getBambooTipSprites();
  if (tipPool.length > 0) {
    paintTipTopper(ctx, rng, w, h, xCenter, caneTopY, trunkW, handed, tipPool, canePool);
    return;
  }
  paintClusterTopper(ctx, rng, w, h, xCenter, caneTopY, trunkW, handed);
}

// Tip-sprite topper: drawn so the tip's PAINTED bottom-trunk width equals
// the cane's PAINTED top-trunk width AND the tip's trunk-center sits
// directly above the cane's trunk-center. Both width and center-x are
// measured per-sprite at load time, so the seam aligns regardless of how
// the generator placed the trunk inside the bbox (some tip sprites have
// the trunk off-center, with foliage spread to one side).
//
// HEIGHT IS CONSTRAINED to the visible canvas area above the cane top.
// Without this clamp, the tip's natural aspect (tall — bottom 60% is
// trunk, top 40% is taper+foliage) puts the tapering portion off-screen,
// so the visible part of the tip looks identical to the cane below
// it and the trunk reads as blunt. Vertical squish keeps the taper +
// leaves inside the visible area.
//
// No moon-exclusion check here — the cane stack already reached this
// height; the tip is just its natural extension upward, not extra
// foliage that could crowd the moon halo.
//
// caneTopperScale (BAMBOO_PARAMS) lets the user dial the tip width up
// or down; 1.0 = exact trunk-width match.
function paintTipTopper(ctx, rng, w, h, xCenter, caneTopY, trunkW, handed, pool, canePool) {
  const sprite = pickSprite(rng, pool);
  if (!sprite) return;
  const caneTopFrac    = avgEdgeFrac(canePool, 'topFrac')       || 0.7;
  const caneTopCenter  = avgEdgeFrac(canePool, 'topCenterFrac') || 0.5;
  const tipBottomFrac  = sprite.bottomFrac;
  const tipBottomCenter = sprite.bottomCenterFrac;
  if (!tipBottomFrac) return;

  // Width: painted tip-bottom = painted cane-top.
  const canePaintedW = trunkW * caneTopFrac;
  const drawW = (canePaintedW / tipBottomFrac) * BAMBOO_PARAMS.caneTopperScale;

  // Height: prefer the sprite's natural aspect, but cap so the entire tip
  // (including the tapering + leaves in its upper portion) sits inside
  // the visible canvas above the cane. A small top buffer keeps the very
  // tip from kissing the canvas edge.
  const yBottom = caneTopY + trunkW * 0.4;
  const naturalH = drawW * (sprite.sh / sprite.sw);
  const availableH = Math.max(drawW * 1.5, yBottom - 12);
  const drawH = Math.min(naturalH, availableH);

  // Anchor by trunk-center, not bbox-center. Some tip sprites have their
  // trunk pushed left or right inside the bbox; we want it directly above
  // the cane trunk regardless of where the generator placed it.
  const flip = rng() < 0.5;
  const caneTrunkX = xCenter + (caneTopCenter - 0.5) * trunkW;
  const tipCenterFrac = flip ? (1 - tipBottomCenter) : tipBottomCenter;
  const tipDrawXCenter = caneTrunkX - (tipCenterFrac - 0.5) * drawW;
  const yTop = yBottom - drawH;

  ctx.save();
  ctx.globalAlpha = 0.92 + rng() * 0.08;
  if (flip) {
    ctx.translate(tipDrawXCenter + drawW / 2, yTop);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh,
      0, 0, drawW, drawH);
  } else {
    ctx.drawImage(sprite.image, sprite.sx, sprite.sy, sprite.sw, sprite.sh,
      tipDrawXCenter - drawW / 2, yTop, drawW, drawH);
  }
  ctx.restore();
}

function avgEdgeFrac(pool, key) {
  if (!pool || pool.length === 0) return 0;
  let sum = 0, n = 0;
  for (const s of pool) {
    const v = s && s[key];
    if (v > 0) { sum += v; n++; }
  }
  return n === 0 ? 0 : sum / n;
}

// Fallback topper using a leaf cluster — used when no tip sprites are loaded.
// The cluster's stem anchors at the cane top; leaves spray outward to hide
// the blunt node band underneath.
function paintClusterTopper(ctx, rng, w, h, xCenter, caneTopY, trunkW, handed) {
  const pool = getBambooClusterSprites();
  if (pool.length === 0) return;
  const sprite = pickSprite(rng, pool);
  if (!sprite) return;
  const drawH = trunkW * 7 * BAMBOO_PARAMS.caneTopperScale;
  const drawW = drawH * (sprite.sw / sprite.sh);
  const yBottom = caneTopY + trunkW * 0.4;
  const cyApprox = yBottom - drawH * 0.5;
  if (inMoonExclusion(xCenter, cyApprox, w, h, handed)) return;
  const flip = rng() < 0.5;
  ctx.save();
  ctx.globalAlpha = 0.85 + rng() * 0.15;
  drawSpriteAnchored(ctx, sprite, xCenter, yBottom, drawH, flip);
  ctx.restore();
}

// Corner accent cluster — at the bottom corner sitting on the bank. Multiple
// per side (index varies x-offset) so the foreground reads as a cluster of
// grass-and-leaves, not a single accent. Visible at canvas-bottom because the
// camera is now at ground level.
function paintCornerCluster(ctx, rng, w, h, side, pool, index) {
  const sprite = pickSprite(rng, pool);
  if (!sprite) return;
  const drawH = h * (0.10 + rng() * 0.05);
  // Index spreads multiple corner clusters across the edge band.
  const xFrac = 0.04 + index * 0.07 + rng() * 0.02;
  const xCenter = side === 'left' ? w * xFrac : w - w * xFrac;
  const yBottom = h * (0.95 + rng() * 0.04);
  // Flip so inward leaves point toward play area.
  const flip = (side === 'left');
  ctx.save();
  ctx.globalAlpha = 0.88 + rng() * 0.10;
  drawSpriteAnchored(ctx, sprite, xCenter, yBottom, drawH, flip);
  ctx.restore();
}

// Midground cluster — sits hanging off the foreground stalk at mid-canvas
// height. Smaller than a corner cluster but larger than canopy elements, so
// it reads as a leaf branch belonging to the visible trunk. Constrained to
// the edge band; moon-side variant is smaller and pushed below the halo.
function paintMidgroundCluster(ctx, rng, w, h, side, isMoonSide, pool) {
  const sprite = pickSprite(rng, pool);
  if (!sprite) return;
  const drawH = h * (isMoonSide ? 0.08 + rng() * 0.03 : 0.10 + rng() * 0.04);
  const xCenter = side === 'left' ? w * 0.09 : w - w * 0.09;
  const yBand = isMoonSide
    ? h * (0.55 + rng() * 0.25)   // lower half only on moon side
    : h * (0.30 + rng() * 0.45);  // mid-canvas, with jitter
  const flip = (side === 'left');
  ctx.save();
  ctx.globalAlpha = 0.85;
  drawSpriteAnchored(ctx, sprite, xCenter, yBand, drawH, flip);
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
function paintTopCanopy(ctx, rng, w, h, handed) {
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
    if (inMoonExclusion(cx, cyApprox, w, h, handed)) continue;
    drawHangingSprite(ctx, sprite, cx, yAnchor, drawW, drawH,
      (rng() - 0.5) * 0.4, rng() < 0.5, 0.65 + rng() * 0.20);
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
    if (inMoonExclusion(cx, cyApprox, w, h, handed)) continue;
    // Tilt: clusters near corners lean inward to follow the arch gesture.
    const leanDir = tx < 0.5 ? 1 : -1;
    const cornerCloseness = 1 - Math.abs(tx - 0.5) * 2;
    const leanMag = (1 - cornerCloseness) * 0.45;
    const rotation = leanDir * leanMag + (rng() - 0.5) * 0.35;
    drawHangingSprite(ctx, sprite, cx, yAnchor, drawW, drawH,
      rotation, rng() < 0.5, 0.75 + rng() * 0.20);
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
    if (inMoonExclusion(cx, cyApprox, w, h, handed)) continue;
    // Lean strongly inward — these are the "draping branches at the corner."
    const leanDir = fromLeft ? 1 : -1;
    const rotation = leanDir * (0.6 + rng() * 0.3);
    drawHangingSprite(ctx, sprite, cx, yAnchor, drawW, drawH,
      rotation, fromLeft ? false : true, 0.80 + rng() * 0.18);
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

// Procedural fallback when no stalk sprites loaded. Wider than the previous
// version (BAMBOO_FALLBACK_MIN_PX floor) so iPhones don't get scratchy lines.
function paintFallbackStalks(ctx, rng, w, h, side, isMoonSide) {
  const STALKS = 4;
  const bandW = Math.max(64, w * 0.16);
  for (let i = 0; i < STALKS; i++) {
    const tBand = (i + 0.3 + rng() * 0.5) / STALKS;
    const fromEdge = tBand * bandW;
    const xBase = side === 'left' ? fromEdge : w - fromEdge;
    const leanAmount = (1 - tBand) * (w * 0.04);
    const xCurve = side === 'left' ? leanAmount : -leanAmount;
    const wBase = Math.max(BAMBOO_FALLBACK_MIN_PX,
                           w * 0.012 + rng() * w * 0.006);
    paintFallbackStalk(ctx, rng, xBase, xCurve, wBase, h * (0.9 + rng() * 0.12), h, isMoonSide);
  }
}

function paintFallbackStalk(ctx, rng, xBase, xCurve, wBase, height, viewH, isMoonSide) {
  const wTop = wBase * (0.6 + rng() * 0.15);
  const xTop = xBase + xCurve;
  const yBottom = viewH + viewH * 0.04;
  const yTop = viewH - height;
  const SEGMENTS = 14;

  ctx.fillStyle = BAMBOO_FALLBACK_FILL;
  ctx.beginPath();
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const arc = Math.sin(t * Math.PI) * (xCurve * 0.35);
    const cx = xBase + (xTop - xBase) * t + arc;
    const w = wBase + (wTop - wBase) * t;
    const y = yBottom + (yTop - yBottom) * t;
    if (i === 0) ctx.moveTo(cx - w / 2, y);
    else ctx.lineTo(cx - w / 2, y);
  }
  for (let i = SEGMENTS; i >= 0; i--) {
    const t = i / SEGMENTS;
    const arc = Math.sin(t * Math.PI) * (xCurve * 0.35);
    const cx = xBase + (xTop - xBase) * t + arc;
    const w = wBase + (wTop - wBase) * t;
    const y = yBottom + (yTop - yBottom) * t;
    ctx.lineTo(cx + w / 2, y);
  }
  ctx.closePath();
  ctx.fill();

  // Knuckle bands
  const nKnuckles = 6 + Math.floor(rng() * 3);
  ctx.fillStyle = BAMBOO_FALLBACK_RING;
  for (let k = 0; k < nKnuckles; k++) {
    const t = (k + 0.5) / nKnuckles;
    const arc = Math.sin(t * Math.PI) * (xCurve * 0.35);
    const cx = xBase + (xTop - xBase) * t + arc;
    const w = wBase + (wTop - wBase) * t;
    const y = yBottom + (yTop - yBottom) * t;
    const ringH = Math.max(2, w * 0.22);
    ctx.fillRect(cx - w / 2, y - ringH / 2, w, ringH);
  }
  void isMoonSide;
}

// The dead-line IS the water surface. A 1px moonlit specular line, fading
// to invisible at the screen edges so the bamboo-flanked banks read as
// natural shoreline rather than meeting a hard horizon. Subtle by design —
// the reflections below carry most of the "this is water" cue.
export function drawWaterline(ctx, layout) {
  const { viewW, deadLineY } = layout;
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, viewW, 0);
  g.addColorStop(0.00, 'rgba(230, 240, 255, 0)');
  g.addColorStop(0.35, 'rgba(230, 240, 255, 0.28)');
  g.addColorStop(0.65, 'rgba(230, 240, 255, 0.28)');
  g.addColorStop(1.00, 'rgba(230, 240, 255, 0)');
  ctx.fillStyle = g;
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
