// The living grove: everything that makes the scene feel organic rather than
// ruled. None of it touches gameplay. The physics walls, the dead line and the
// hex lattice stay exactly where they were; this module only paints around
// them.
//
// Two tiers, matching the two clocks (see js/clock.js):
//
//   Cached tier, on the 10Hz ambient clock, painted inside the scene prefix:
//     - bamboo sway: the grove is blitted in horizontal strips, each nudged
//       sideways by a bottom-anchored wind curve, so stalks bend from the
//       root instead of the whole layer sliding.
//     - the waterline: a gently undulating surface with moon glints flowing
//       downstream, replacing the ruled 1px line.
//
//   Live tier, on the render clock, drawn over the cached scene every frame
//   the loop is awake. These move too fast to step at 10Hz without
//   juddering, and they are a few dozen draw calls, so they skip the cache:
//     - the stream: faint current streaks drifting downstream.
//     - fish rising: rare ring ripples spreading on the water.
//     - fireflies: slow drifting glows that blink on and off.
//     - falling leaves: a bamboo leaf now and then, fluttering down to settle
//       on the stream and float away.
//
// Everything is deterministic in time (slot hashing, no Math.random and no
// per-frame state), so a parked loop resumes exactly where it stopped, and the
// gameplay RNG is never touched. Stillness (reduced motion or power saver)
// holds the cached tier at t = 0 and hides the live tier entirely.

import { PERF_MODE, ambientStill } from './style.js';

// ─── Deterministic noise ────────────────────────────────────────────────────

// Integer hash → [0, 1). Cheap, stateless, stable across sessions.
export function hash01(a, b = 0) {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x9e3779b9, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ─── Shore outline ──────────────────────────────────────────────────────────
//
// The background shore mound is painted into the bamboo cache, but the live
// stream has to stop at its edge. The painter records the outline it drew
// here (viewport px, sampled left→right along the mound's crest) and the
// stream clips against it, so the water and the bank always agree.

let shoreOutline = { w: 0, h: 0, left: null, right: null };

export function setShoreOutline(w, h, side, points) {
  if (shoreOutline.w !== w || shoreOutline.h !== h) {
    shoreOutline = { w, h, left: null, right: null };
  }
  shoreOutline[side] = points;
}

// Build an irregular mound crest from the old quadratic. `jitter` is a seeded
// rng used only for the bump phases, so the grove composition (which reads
// the main bamboo rng) is unchanged by the shape of the bank.
export function shoreCrest(side, w, h, topFrac, ctrlFrac, jitter, steps = 40) {
  const shoreW = w / 3;
  const isLeft = side === 'left';
  const x0 = isLeft ? -10 : w + 10;
  const x2 = isLeft ? shoreW : w - shoreW;
  const cx = isLeft ? shoreW * ctrlFrac : w - shoreW * ctrlFrac;
  const y0 = h * topFrac, y2 = h * 1.05;
  const p1 = jitter() * Math.PI * 2, p2 = jitter() * Math.PI * 2, p3 = jitter() * Math.PI * 2;
  const amp = Math.min(w, h) * 0.008;
  const pts = new Array(steps + 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x2;
    const y = u * u * y0 + 2 * u * t * y0 + t * t * y2;
    // Bumps fade out at both ends so the crest still meets the screen edge
    // and the water where the quadratic did.
    const env = Math.sin(Math.PI * Math.min(1, t * 1.15));
    const bump = amp * env * (
      Math.sin(t * 9.0 + p1) * 0.55 +
      Math.sin(t * 23.0 + p2) * 0.30 +
      Math.sin(t * 51.0 + p3) * 0.15);
    pts[i] = [x, y - Math.abs(bump) * 0.6 + bump * 0.4];
  }
  return pts;
}

export function fillCrest(ctx, pts, side, w, h) {
  const edgeX = side === 'left' ? -10 : w + 10;
  ctx.beginPath();
  ctx.moveTo(edgeX, h * 1.05);
  for (let i = 0; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

// Reeds and cattails where the bank meets the water. Painted into the bamboo
// cache (so they sway with it). `rng` is the bank's own jitter rng.
export function paintReeds(ctx, rng, pts, side, w, h, isMoonSide, isMask) {
  const n = PERF_MODE ? 7 : 11;
  const isLeft = side === 'left';
  const inward = isLeft ? 1 : -1;
  const scale = Math.min(w, h);
  const body = isMask ? '#000' : '#03060f';
  const rim = isMoonSide ? 'rgba(255, 214, 160, 0.20)' : 'rgba(190, 210, 255, 0.14)';
  for (let k = 0; k < n; k++) {
    // Cluster along the outer two-thirds of the crest, densest near the water.
    const t = 0.35 + 0.6 * Math.pow(rng(), 0.7);
    const idx = Math.min(pts.length - 1, Math.floor(t * (pts.length - 1)));
    const [bx, by] = pts[idx];
    const blades = 2 + Math.floor(rng() * 3);
    for (let b = 0; b < blades; b++) {
      const len = scale * (0.035 + rng() * 0.06);
      const lean = inward * (0.15 + rng() * 0.45) + (rng() - 0.5) * 0.4;
      const curl = inward * (0.2 + rng() * 0.5);
      const wBase = Math.max(1.2, scale * 0.0035);
      const x = bx + (rng() - 0.5) * scale * 0.012;
      const y = by + 2;
      const tipX = x + Math.sin(lean) * len + curl * len * 0.25;
      const tipY = y - Math.cos(lean) * len;
      const midX = x + Math.sin(lean) * len * 0.55;
      const midY = y - Math.cos(lean) * len * 0.6;
      ctx.beginPath();
      ctx.moveTo(x - wBase, y);
      ctx.quadraticCurveTo(midX - wBase * 0.6, midY, tipX, tipY);
      ctx.quadraticCurveTo(midX + wBase * 0.6, midY, x + wBase, y);
      ctx.closePath();
      ctx.fillStyle = body;
      ctx.fill();
      if (!isMask && rng() < 0.6) {
        ctx.strokeStyle = rim;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x + wBase * 0.5, y);
        ctx.quadraticCurveTo(midX + wBase * 0.3, midY, tipX, tipY);
        ctx.stroke();
      }
      // The odd cattail head on a taller blade.
      if (b === 0 && len > scale * 0.07 && rng() < 0.5) {
        const hx = x + Math.sin(lean) * len * 0.8;
        const hy = y - Math.cos(lean) * len * 0.8;
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(lean * 0.8);
        ctx.beginPath();
        ctx.ellipse(0, 0, wBase * 1.6, len * 0.11, 0, 0, Math.PI * 2);
        ctx.fillStyle = isMask ? '#000' : '#0a0a14';
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

// ─── Bamboo sway (cached tier) ──────────────────────────────────────────────

// Horizontal padding painted either side of the bamboo cache, so a strip
// nudged sideways never exposes an empty sliver at the screen edge.
export function bambooPad(w, h) {
  return Math.ceil(Math.min(w, h) * 0.012) + 2;
}

function swayOffset(yFrac, t, amp) {
  // Anchored at the ground (yFrac = 1), largest at the canopy; two slow
  // incommensurate waves so the wind never visibly loops, plus a gust term
  // that travels down the stalks.
  const lift = Math.pow(1 - yFrac, 1.6);
  return amp * lift * (
    0.62 * Math.sin(t * 0.52 + yFrac * 1.4) +
    0.38 * Math.sin(t * 1.31 + 0.9 - yFrac * 2.2));
}

/**
 * Blit a padded bamboo-layer canvas (painted at an x offset of `pad`) onto
 * `dst` at viewport size, bent by the wind at ambient time `t`. t = 0 (or
 * stillness) is the plain blit, so the mask and the bleed can share the call.
 */
export function blitSwayed(dst, src, w, h, pad, t) {
  const pw = w + pad * 2;
  if (!t) {
    dst.drawImage(src, 0, 0, src.width, src.height, -pad, 0, pw, h);
    return;
  }
  const amp = Math.min(w, h) * 0.008;
  const sy = src.height / h;               // device px per css px
  // The lower 40% barely moves (the lift curve is anchored at the ground), so
  // it goes down in one blit; only the upper grove is cut into strips.
  const bend = Math.floor(h * 0.6);
  const strips = PERF_MODE ? 8 : 14;
  // Offsets snap to whole device pixels: a fractional offset sends every
  // strip through the resampling path, which costs far more than the copy
  // it replaces, and the wind's per-tick step is well under a pixel anyway.
  const snap = (v) => Math.round(v * sy) / sy;
  for (let i = 0; i <= strips; i++) {
    const last = i === strips;
    const y0 = Math.floor((i / strips) * bend);
    const y1 = last ? h : Math.floor(((i + 1) / strips) * bend);
    if (y1 <= y0) continue;
    const dx = last ? 0 : snap(swayOffset((y0 + y1) * 0.5 / h, t, amp));
    // One px of overlap hides the seam between strips at fractional DPRs.
    const sh = Math.min(h - y0, y1 - y0 + (last ? 0 : 1));
    dst.drawImage(src, 0, Math.round(y0 * sy), src.width, Math.round(sh * sy),
                  -pad + dx, y0, pw, sh);
  }
}

// ─── Waterline (cached tier) ────────────────────────────────────────────────

let waterlineGrad = { ctx: null, w: 0, grad: null, glint: null };

export function drawLivingWaterline(ctx, layout, t) {
  const { viewW, deadLineY } = layout;
  if (waterlineGrad.ctx !== ctx || waterlineGrad.w !== viewW) {
    const g = ctx.createLinearGradient(0, 0, viewW, 0);
    g.addColorStop(0.00, 'rgba(230, 240, 255, 0)');
    g.addColorStop(0.30, 'rgba(230, 240, 255, 0.24)');
    g.addColorStop(0.70, 'rgba(230, 240, 255, 0.24)');
    g.addColorStop(1.00, 'rgba(230, 240, 255, 0)');
    const gl = ctx.createLinearGradient(0, 0, viewW, 0);
    gl.addColorStop(0.00, 'rgba(255, 244, 220, 0)');
    gl.addColorStop(0.35, 'rgba(255, 244, 220, 0.38)');
    gl.addColorStop(0.65, 'rgba(255, 244, 220, 0.38)');
    gl.addColorStop(1.00, 'rgba(255, 244, 220, 0)');
    waterlineGrad = { ctx, w: viewW, grad: g, glint: gl };
  }
  const step = PERF_MODE ? 10 : 6;
  ctx.save();
  ctx.beginPath();
  for (let x = 0; x <= viewW + step; x += step) {
    // Small enough (~1.5px) that the dead line still reads as a line.
    const y = deadLineY + 0.5 +
      0.9 * Math.sin(x * 0.021 - t * 1.6) +
      0.55 * Math.sin(x * 0.057 + t * 0.9 + 1.3);
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = waterlineGrad.grad;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  // Moon glints riding the surface downstream.
  // An irregular dash so the glints scatter rather than read as a dotted rule.
  ctx.setLineDash([3, 37, 1, 23, 5, 61, 2, 29]);
  ctx.lineDashOffset = -t * 14;
  ctx.strokeStyle = waterlineGrad.glint;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.restore();
}

// ─── Live tier ──────────────────────────────────────────────────────────────

let fireflySprite = null;
function getFireflySprite() {
  if (fireflySprite) return fireflySprite;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.00, 'rgba(250, 255, 205, 1)');
  grad.addColorStop(0.10, 'rgba(232, 250, 150, 0.85)');
  grad.addColorStop(0.35, 'rgba(190, 235, 110, 0.22)');
  grad.addColorStop(1.00, 'rgba(160, 220, 90, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  fireflySprite = c;
  return c;
}

// Top of the bank (smallest y on the mound) at viewport x, or +Infinity when
// x is over open water.
function bankYAt(x) {
  let best = Infinity;
  for (const side of ['left', 'right']) {
    const pts = shoreOutline[side];
    if (!pts) continue;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      if (ax === bx || x < Math.min(ax, bx) || x > Math.max(ax, bx)) continue;
      const y = ay + (by - ay) * ((x - ax) / (bx - ax));
      if (y < best) best = y;
    }
  }
  return best;
}

function waterClip(ctx, layout) {
  const { viewW, viewH, deadLineY } = layout;
  const step = 12;
  ctx.beginPath();
  ctx.moveTo(0, deadLineY + 1.5);
  ctx.lineTo(viewW, deadLineY + 1.5);
  for (let x = viewW; x >= -step; x -= step) {
    const xx = Math.max(0, x);
    const y = Math.max(deadLineY + 1.5, Math.min(viewH, bankYAt(xx)));
    ctx.lineTo(xx, y);
  }
  ctx.closePath();
  ctx.clip();
}

function isOpenWater(x, y, layout) {
  return y > layout.deadLineY + 2 && y < Math.min(layout.viewH - 2, bankYAt(x) - 3);
}

function drawStream(ctx, layout, t) {
  const { viewW, viewH, deadLineY } = layout;
  const depth = viewH - deadLineY;
  const n = PERF_MODE ? 9 : 15;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const d = hash01(i, 11);
    const y = deadLineY + 4 + Math.pow(d, 1.15) * (depth - 8) + Math.sin(t * 0.7 + i * 1.9) * 1.2;
    const speed = 7 + 24 * d;                    // nearer water runs faster
    const len = 10 + 46 * d * (0.6 + 0.4 * hash01(i, 12));
    const span = viewW + len * 2;
    const travel = (hash01(i, 13) * span + speed * t) % span;
    const x = travel - len;
    const env = Math.sin(Math.PI * (travel / span));
    const a = (0.05 + 0.12 * d) * env;
    if (a < 0.01) continue;
    const sag = Math.sin(t * 1.1 + i) * 1.2;
    ctx.globalAlpha = a;
    ctx.lineWidth = 0.8 + d * 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + len * 0.5, y + sag, x + len, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const RISE_SLOT = 3.6, RISE_LIFE = 3.2;
function drawRises(ctx, layout, t) {
  const { viewW, viewH, deadLineY } = layout;
  const depth = viewH - deadLineY;
  const first = Math.floor((t - RISE_LIFE) / RISE_SLOT);
  const last = Math.floor(t / RISE_SLOT);
  for (let s = Math.max(0, first); s <= last; s++) {
    if (hash01(s, 21) > 0.55) continue;
    const age = t - (s * RISE_SLOT + hash01(s, 22) * 1.2);
    if (age < 0 || age > RISE_LIFE) continue;
    const x = viewW * (0.18 + 0.64 * hash01(s, 23));
    const y = deadLineY + 8 + depth * 0.7 * hash01(s, 24);
    if (!isOpenWater(x, y, layout)) continue;
    const scale = Math.min(viewW, viewH) * (0.045 + 0.03 * hash01(s, 25));
    for (let k = 0; k < 2; k++) {
      const e = (age - k * 0.45) / (RISE_LIFE - 0.45);
      if (e <= 0 || e >= 1) continue;
      const r = 2 + scale * Math.sqrt(e);
      ctx.globalAlpha = 0.32 * Math.pow(1 - e, 1.6) * (k ? 0.6 : 1);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFireflies(ctx, layout, t) {
  const sprite = getFireflySprite();
  if (!sprite) return;
  const { viewW, viewH, deadLineY } = layout;
  const n = PERF_MODE ? 7 : 11;
  const size = Math.max(20, layout.size * 1.7);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0;
    const band = 0.05 + 0.24 * hash01(i, 31);
    const hx = left ? viewW * band : viewW * (1 - band);
    const hy = viewH * 0.4 + (deadLineY - viewH * 0.4) * hash01(i, 32) + 6;
    const a = hash01(i, 33), b = hash01(i, 34), c = hash01(i, 35);
    const x = hx + 26 * Math.sin(t * (0.11 + 0.09 * a) + a * 40) + 9 * Math.sin(t * (0.43 + 0.2 * b) + b * 40);
    const y = hy + 18 * Math.sin(t * (0.15 + 0.08 * c) + c * 40) + 6 * Math.sin(t * 0.61 + a * 17);
    // Blink: dark most of the time, a slow swell and fade when lit.
    const s = Math.sin(t * (0.45 + 0.35 * b) + c * 31);
    if (s <= 0.25) continue;
    const glow = Math.pow((s - 0.25) / 0.75, 1.5);
    const sz = size * (0.75 + 0.25 * glow);
    ctx.globalAlpha = Math.min(1, 1.1 * glow);
    ctx.drawImage(sprite, x - sz / 2, y - sz / 2, sz, sz);
  }
  ctx.restore();
}

const LEAF_SLOT = 5.2, LEAF_FALL = 8.5, LEAF_FLOAT = 6;
function leafPath(ctx, len) {
  ctx.beginPath();
  ctx.moveTo(-len * 0.5, 0);
  ctx.quadraticCurveTo(0, -len * 0.22, len * 0.5, 0);
  ctx.quadraticCurveTo(0, len * 0.16, -len * 0.5, 0);
  ctx.closePath();
}

function drawLeaves(ctx, layout, t) {
  const { viewW, viewH, deadLineY } = layout;
  const life = LEAF_FALL + LEAF_FLOAT;
  const first = Math.floor((t - life) / LEAF_SLOT);
  const last = Math.floor(t / LEAF_SLOT);
  const len = Math.max(11, Math.min(viewW, viewH) * 0.038);
  for (let s = Math.max(0, first); s <= last; s++) {
    if (hash01(s, 41) > 0.6) continue;
    const age = t - s * LEAF_SLOT;
    if (age < 0 || age > life) continue;
    const left = hash01(s, 42) < 0.5;
    const band = 0.06 + 0.22 * hash01(s, 43);
    const x0 = left ? viewW * band : viewW * (1 - band);
    const y0 = viewH * (0.05 + 0.2 * hash01(s, 44));
    const drift = (left ? 1 : -1) * (6 + 10 * hash01(s, 45));   // drifts inward
    const flutter = 0.9 + 0.8 * hash01(s, 46);
    const fallT = Math.min(age, LEAF_FALL);
    const e = fallT / LEAF_FALL;
    const fx = x0 + drift * fallT + 22 * Math.sin(fallT * flutter + s);
    const fy = y0 + (deadLineY + 3 - y0) * (e * (0.6 + 0.4 * e));
    let x = fx, y = fy, rot = Math.sin(fallT * flutter * 1.3 + s) * 0.9 + (left ? 0.3 : -0.3);
    let alpha = Math.min(1, age / 0.8);
    let flatten = 1;
    if (age > LEAF_FALL) {
      if (!isOpenWater(fx, deadLineY + 4, layout)) continue;   // landed on the bank
      const fa = age - LEAF_FALL;
      x = fx + fa * 11;                                         // carried downstream
      y = deadLineY + 4 + fa * 1.4 + Math.sin(fa * 1.7) * 0.8;
      rot = rot * Math.max(0, 1 - fa) + Math.sin(fa * 0.8) * 0.15;
      flatten = 0.55;
      alpha = Math.max(0, 1 - fa / LEAF_FLOAT);
      // The touchdown ring.
      if (fa < 2.2) {
        const re = fa / 2.2;
        const r = 2 + len * 1.6 * Math.sqrt(re);
        ctx.globalAlpha = 0.3 * (1 - re);
        ctx.strokeStyle = 'rgba(210, 225, 255, 1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(fx, deadLineY + 4, r, r * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (alpha <= 0.02) continue;
    ctx.save();
    ctx.globalAlpha = alpha * 0.92;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, flatten * (0.55 + 0.45 * Math.abs(Math.cos(fallT * flutter))));
    leafPath(ctx, len);
    ctx.fillStyle = '#071027';
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 210, 255, 0.28)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/**
 * Draw the live tier over the cached scene. Call once per rendered frame,
 * after drawScene and before the aim line / launcher.
 */
export function drawLivingWorld(ctx, layout, settings, tSec) {
  if (ambientStill(settings)) return;
  const { viewH, deadLineY } = layout;
  if (deadLineY < viewH - 6) {
    ctx.save();
    waterClip(ctx, layout);
    ctx.strokeStyle = 'rgba(205, 222, 255, 1)';
    drawStream(ctx, layout, tSec);
    drawRises(ctx, layout, tSec);
    ctx.restore();
  }
  drawFireflies(ctx, layout, tSec);
  drawLeaves(ctx, layout, tSec);
}
