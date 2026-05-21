// Projectile flight, collision, and aim-line prediction. All routines are
// pure with respect to game state — they read board/layout and return new
// positions, never mutate. The trellis (top wall) and side walls live in
// `layout`; lantern positions live in `board.lanterns`.

import { SETTLE_NUDGE_RAD } from './constants.js';
import { forEachLanternWithinSq } from './geometry.js';

// Center of the launcher tip — origin of every shot.
export function launcherTip(layout) {
  const handedness = layout.handedness || 'right';
  const offset = handedness === 'left' ? -layout.size * 1.0 : layout.size * 1.0;
  return { x: layout.viewW / 2 + offset, y: layout.tipY };
}

// Find the nearest lantern that overlaps a circle of radius r centered at
// (x, y). Returns null if none. Used for both flight collision and the
// in-arc sweep when nudging into a pocket.
export function lanternCollision(board, x, y, r) {
  const overlapSq = (2 * r) * (2 * r);
  const reachSq = (3 * r) * (3 * r);
  let best = null, bestDistSq = Infinity;
  forEachLanternWithinSq(board, x, y, reachSq, (l, d2) => {
    if (d2 < overlapSq && d2 < bestDistSq) {
      best = l;
      bestDistSq = d2;
    }
  });
  return best;
}

function nearestOverlapping(board, x, y, r, exclude) {
  const overlapSq = (2 * r) * (2 * r) - 1e-3;
  const reachSq = (3 * r) * (3 * r);
  let best = null, bestDistSq = Infinity;
  forEachLanternWithinSq(board, x, y, reachSq, (l, d2) => {
    if (d2 < overlapSq && d2 < bestDistSq) {
      best = l;
      bestDistSq = d2;
    }
  }, exclude);
  return best;
}

// True iff the segment from (x0,y0) to (x1,y1) reaches the lantern's circle
// before crossing the trellis line. Used to disambiguate when a step crosses
// both: the projectile should resolve against whichever it touched first.
function hitsBeforeTrellis(x0, y0, x1, y1, lantern, r, trellisY) {
  const lanternT = segmentToCircleT(x0, y0, x1, y1, lantern.x, lantern.y, 2 * r);
  if (lanternT == null) return false;
  const dy = y1 - y0;
  if (Math.abs(dy) < 1e-9) return true;
  const trellisT = (trellisY + r - y0) / dy;
  return lanternT <= trellisT;
}

function segmentToCircleT(x0, y0, x1, y1, cx, cy, radius) {
  const dx = x1 - x0, dy = y1 - y0;
  const ex = x0 - cx, ey = y0 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return null;
  const b = 2 * (ex * dx + ey * dy);
  const c = ex * ex + ey * ey - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  return (-b - Math.sqrt(disc)) / (2 * a);
}

function backupSegmentToCircle(x0, y0, x1, y1, cx, cy, radius) {
  const t = segmentToCircleT(x0, y0, x1, y1, cx, cy, radius);
  if (t == null) return { x: x0, y: y0 };
  const tc = Math.max(0, Math.min(1, t));
  return { x: x0 + tc * (x1 - x0), y: y0 + tc * (y1 - y0) };
}

// Position a circle of radius r touching both A and B (each at distance 2r).
// Two solutions exist when |AB| < 4r — pick whichever is closer to `hint`.
function twoCircleContact(A, B, r, hint) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6 || d > 4 * r) return { x: hint.x, y: hint.y };
  const a = d / 2;
  const h = Math.sqrt(Math.max(0, 4 * r * r - a * a));
  const mx = A.x + dx * (a / d);
  const my = A.y + dy * (a / d);
  const px = -dy / d * h, py = dx / d * h;
  const c1 = { x: mx + px, y: my + py };
  const c2 = { x: mx - px, y: my - py };
  const d1 = (c1.x - hint.x) ** 2 + (c1.y - hint.y) ** 2;
  const d2 = (c2.x - hint.x) ** 2 + (c2.y - hint.y) ** 2;
  return d1 <= d2 ? c1 : c2;
}

// After first contact, slide along the hit lantern's surface for a short arc
// (SETTLE_NUDGE_RAD) in the direction of motion. If we encounter the trellis
// or a second lantern within that arc, settle there — closes small slivers
// without erasing the player's choice of placement. If nothing is found
// within the arc, return the original contact point unchanged.
function nudgeIntoPocket(layout, board, hit, contact, vx, vy) {
  const r = layout.size;
  const cx = hit.x, cy = hit.y;
  const ringR = 2 * r;
  const dx0 = contact.x - cx, dy0 = contact.y - cy;
  const theta0 = Math.atan2(dy0, dx0);

  const tCCW = { x: -Math.sin(theta0), y: Math.cos(theta0) };
  const direction = (tCCW.x * vx + tCCW.y * vy) >= 0 ? +1 : -1;

  const stepRad = 0.04;
  const maxSteps = Math.ceil(SETTLE_NUDGE_RAD / stepRad);

  for (let i = 1; i <= maxSteps; i++) {
    const theta = theta0 + direction * i * stepRad;
    const px = cx + ringR * Math.cos(theta);
    const py = cy + ringR * Math.sin(theta);

    if (py - r <= layout.trellisY) {
      const dyT = (layout.trellisY + r) - cy;
      if (Math.abs(dyT) <= ringR) {
        const dxT = Math.sqrt(ringR * ringR - dyT * dyT);
        const sideX = px >= cx ? cx + dxT : cx - dxT;
        return { x: sideX, y: layout.trellisY + r };
      }
      return { x: px, y: layout.trellisY + r };
    }
    if (px - r < layout.wallLeft || px + r > layout.wallRight) {
      return contact;
    }
    const other = nearestOverlapping(board, px, py, r, hit);
    if (other) {
      return twoCircleContact(hit, other, r, { x: px, y: py });
    }
  }
  return contact;
}

// One ray-step: advance (x, y) along (vx, vy) by up to `stepSize`, bouncing
// off side walls. Returns the new position, possibly-flipped velocity, and a
// `bounced` flag. Used by both projectile flight and the aim preview.
function stepRay(layout, x, y, vx, vy, stepSize) {
  const r = layout.size;
  let nx = x + vx * stepSize;
  let ny = y + vy * stepSize;
  let bounced = false;
  if (nx - r < layout.wallLeft) {
    nx = layout.wallLeft + r + ((layout.wallLeft + r) - nx);
    vx = -vx;
    bounced = true;
  } else if (nx + r > layout.wallRight) {
    nx = layout.wallRight - r - (nx - (layout.wallRight - r));
    vx = -vx;
    bounced = true;
  }
  return { nx, ny, vx, vy, bounced };
}

// Advance an in-flight projectile by `distance` pixels along its current
// heading. Returns either { settled: true, x, y } when it lands, or
// { settled: false, x, y, vx, vy, flightT } to keep flying.
export function traceFromShot(layout, board, shot, distance, dtSec) {
  const r = layout.size;
  const stepSize = Math.max(1, r * 0.25);

  let x = shot.x, y = shot.y, vx = shot.vx, vy = shot.vy;
  let remaining = distance;

  while (remaining > 0) {
    const s = Math.min(stepSize, remaining);
    const step = stepRay(layout, x, y, vx, vy, s);
    const nx = step.nx, ny = step.ny;
    vx = step.vx; vy = step.vy;

    const hit = lanternCollision(board, nx, ny, r);
    const trellisHit = ny - r <= layout.trellisY;
    if (hit && (!trellisHit || hitsBeforeTrellis(x, y, nx, ny, hit, r, layout.trellisY))) {
      const contact = backupSegmentToCircle(x, y, nx, ny, hit.x, hit.y, 2 * r);
      const settled = nudgeIntoPocket(layout, board, hit, contact, vx, vy);
      return { settled: true, x: settled.x, y: settled.y };
    }
    if (trellisHit) {
      return { settled: true, x: nx, y: layout.trellisY + r };
    }

    x = nx; y = ny;
    remaining -= s;
  }
  return { settled: false, x, y, vx, vy, flightT: (shot.flightT || 0) + dtSec };
}

// Predict where the current aim will land, returning the polyline (for the
// dashed indicator) plus the final settle position (for the ghost lantern).
// Capped at `maxBounces` wall hits — if the path would need more, settle is
// null and `bounced: true`.
export function traceAimLine(layout, board, angle, maxBounces = 1) {
  const origin = launcherTip(layout);
  const r = layout.size;
  const stepSize = Math.max(1, r * 0.4);
  const maxSteps = 4000;

  const points = [{ x: origin.x, y: origin.y }];
  let x = origin.x, y = origin.y;
  let vx = Math.sin(angle), vy = -Math.cos(angle);
  let bounces = 0;

  for (let i = 0; i < maxSteps; i++) {
    const step = stepRay(layout, x, y, vx, vy, stepSize);
    const nx = step.nx, ny = step.ny;
    vx = step.vx; vy = step.vy;

    if (step.bounced) {
      points.push({ x: nx, y: ny });
      bounces++;
      if (bounces > maxBounces) {
        return { points, settle: null, bounced: true };
      }
    }

    const hit = lanternCollision(board, nx, ny, r);
    const trellisHit = ny - r <= layout.trellisY;
    if (hit && (!trellisHit || hitsBeforeTrellis(x, y, nx, ny, hit, r, layout.trellisY))) {
      const contact = backupSegmentToCircle(x, y, nx, ny, hit.x, hit.y, 2 * r);
      const settled = nudgeIntoPocket(layout, board, hit, contact, vx, vy);
      points.push({ x: contact.x, y: contact.y });
      return { points, settle: settled };
    }
    if (trellisHit) {
      points.push({ x: nx, y: ny });
      return { points, settle: { x: nx, y: layout.trellisY + r } };
    }
    x = nx; y = ny;
  }
  points.push({ x, y });
  return { points, settle: null };
}
