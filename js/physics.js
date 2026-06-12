import {
  SETTLE_HOPS, SETTLE_ITERATIONS, SETTLE_MIN_PEN_PX,
} from './constants.js';
import { normalizePos } from './board.js';
import { anchorBandPx, effectiveTrellisY, forEachLanternWithinSq } from './geometry.js';

// Local positional-relaxation settle. When a lantern lands, we let the
// nearby cluster slide a bit so the board "absorbs" the new arrival.
//
// Scope: 2-hop BFS neighborhood of the newly placed lantern. Lanterns outside
// the movable set still act as collision walls but won't displace.
// Anchoring: lanterns whose top edge sits within the trellis anchor band are
// pinned — they're tied to the bamboo and don't move.
// Mass: the new lantern is treated as heavier so its neighbors yield to it
// (75/25 split). This keeps player aim mostly intact while still letting
// existing lanterns make room.
export function settleAround(board, layout, newLantern, opts = {}) {
  const hops = opts.hops ?? SETTLE_HOPS;
  const iters = opts.iterations ?? SETTLE_ITERATIONS;
  const minPen = opts.minPenPx ?? SETTLE_MIN_PEN_PX;

  const r = layout.size;
  const r2 = 2 * r;
  const reachSq = (r2 * 1.15) ** 2;

  const movable = new Set([newLantern]);
  let frontier = [newLantern];
  for (let h = 0; h < hops; h++) {
    const next = [];
    for (const a of frontier) {
      forEachLanternWithinSq(board, a.x, a.y, reachSq, (b) => {
        if (movable.has(b)) return;
        movable.add(b);
        next.push(b);
      });
    }
    frontier = next;
    if (!frontier.length) break;
  }

  const trellisY = effectiveTrellisY(board, layout);
  const anchorY = trellisY + anchorBandPx(layout);
  const pinned = new Set();
  for (const l of movable) {
    if (l.y - r <= anchorY) pinned.add(l);
  }

  const origin = new Map();
  for (const l of movable) {
    origin.set(l, { x: l.x, y: l.y });
  }

  for (let it = 0; it < iters; it++) {
    let maxPen = 0;
    for (const a of movable) {
      if (pinned.has(a)) continue;
      for (const b of board.lanterns) {
        if (a === b) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= r2 || d < 1e-6) continue;
        const pen = r2 - d;
        const nx = dx / d, ny = dy / d;
        const bMovable = movable.has(b) && !pinned.has(b);
        let aShare, bShare;
        if (!bMovable) { aShare = 1.0; bShare = 0.0; }
        else if (a === newLantern) { aShare = 0.25; bShare = 0.75; }
        else if (b === newLantern) { aShare = 0.75; bShare = 0.25; }
        else { aShare = 0.5; bShare = 0.5; }
        a.x -= nx * pen * aShare;
        a.y -= ny * pen * aShare;
        if (bMovable) {
          b.x += nx * pen * bShare;
          b.y += ny * pen * bShare;
        }
        if (pen > maxPen) maxPen = pen;
      }
      if (a.x < layout.wallLeft + r) a.x = layout.wallLeft + r;
      if (a.x > layout.wallRight - r) a.x = layout.wallRight - r;
      if (a.y < trellisY + r) a.y = trellisY + r;
    }
    if (maxPen < minPen) break;
  }

  // Tag moved lanterns with a per-particle anim handle the renderer can
  // interpolate. Skip the new lantern itself — it animates as the projectile
  // landing, not a settle response. We also normalize anim.from and the
  // mutated position so they survive a resize through syncLanternPixels.
  for (const [l, o] of origin) {
    if (l === newLantern) {
      normalizePos(l, layout);
      continue;
    }
    const dx = l.x - o.x, dy = l.y - o.y;
    if (dx * dx + dy * dy > 0.25) {
      l.anim = {
        fromX: o.x, fromY: o.y,
        fromNx: (o.x - layout.originX) / layout.size,
        fromNy: (o.y - layout.trellisY - layout.size) / layout.size,
        t: 0,
      };
    }
    normalizePos(l, layout);
  }
}

// Advance every active anim by dt seconds. Removes finished anims. Returns
// true while at least one anim is still in progress.
export function tickAnims(board, dtSec, durationSec) {
  let active = false;
  for (const l of board.lanterns) {
    if (!l.anim) continue;
    l.anim.t += dtSec / durationSec;
    if (l.anim.t >= 1) {
      delete l.anim;
    } else {
      active = true;
    }
  }
  return active;
}
