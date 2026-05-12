import {
  COLOR_KEYS, AIM_MIN_ANGLE, AIM_MAX_ANGLE, M3_DEFAULT_SEED,
  LAUNCHER_OFFSET_FROM_DEAD_LINE, SETTLE_NUDGE_RAD, PROJECTILE_SPEED,
  levelConfig,
} from './constants.js';
import { mulberry32, pick } from './prng.js';
import { createBoard, populateInitial, descend, isCleared, addLantern } from './board.js';
import { popMatches, dropFloating, popScore, dropScore } from './match.js';

export const PHASE = Object.freeze({
  AIMING: 'aiming',
  FLYING: 'flying',
  SETTLING: 'settling',
  DESCENDING: 'descending',
  WIN: 'win',
  GAME_OVER: 'gameOver',
});

const DESCENT_DRIFT_SPEED = 240;  // px/sec; sized to a packed-row height (sqrt(3)*r)

export function createGame({ seed, layout, level = 1 } = {}) {
  const config = levelConfig(level);
  const colors = COLOR_KEYS.slice(0, config.colors);
  // Each level gets a distinct deterministic seed unless one is passed in.
  const effectiveSeed = (seed ?? (M3_DEFAULT_SEED + level * 1009)) >>> 0;
  const rng = mulberry32(effectiveSeed);
  const board = createBoard();
  if (layout) populateInitial(board, layout, rng, config.initialRows, colors);
  return {
    rng,
    board,
    phase: PHASE.AIMING,
    aimAngle: 0,
    queue: {
      current: pick(rng, colors),
      next:    pick(rng, colors),
    },
    shot: null,
    score: 0,
    lastResolution: null,
    shotsUntilDescent: config.descentShots,
    level,
    colors,
    descentShots: config.descentShots,
  };
}

export function setAim(game, angleRad) {
  if (game.phase !== PHASE.AIMING) return;
  game.aimAngle = clamp(angleRad, AIM_MIN_ANGLE, AIM_MAX_ANGLE);
}

export function fire(game, layout) {
  if (game.phase !== PHASE.AIMING) return;
  const origin = launcherTip(layout);
  const angle = game.aimAngle;
  game.shot = {
    x: origin.x,
    y: origin.y,
    vx: Math.sin(angle),
    vy: -Math.cos(angle),
    color: game.queue.current,
  };
  game.phase = PHASE.FLYING;
}

export function step(game, dtSec, layout) {
  if (game.phase === PHASE.DESCENDING) {
    const stepPx = DESCENT_DRIFT_SPEED * dtSec;
    game.board.descentAnimY = Math.min(0, game.board.descentAnimY + stepPx);
    if (game.board.descentAnimY >= 0) {
      game.board.descentAnimY = 0;
      const postDrop = dropFloating(game.board, layout);
      if (postDrop.length) game.score += dropScore(postDrop);
      game.phase = PHASE.AIMING;
    }
    return true;
  }

  if (game.phase !== PHASE.FLYING || !game.shot) return false;
  const speed = projectileSpeed();
  const distance = speed * dtSec;
  const trace = traceFromShot(layout, game.board, game.shot, distance);

  if (trace.settled) {
    const placed = { x: trace.x, y: trace.y, color: game.shot.color };
    addLantern(game.board, placed.x, placed.y, placed.color);
    resolvePlacement(game, placed, layout);
    game.shot = null;
    advanceQueue(game);
    if (isCleared(game.board)) {
      game.phase = PHASE.WIN;
      return true;
    }
    game.shotsUntilDescent--;
    if (game.shotsUntilDescent <= 0) {
      const ok = descend(game.board, layout, game.rng, game.colors);
      if (!ok) {
        game.phase = PHASE.GAME_OVER;
        return true;
      }
      const r = layout.size;
      game.board.descentAnimY = -(Math.sqrt(3) * r);
      game.phase = PHASE.DESCENDING;
      game.shotsUntilDescent = game.descentShots;
    } else {
      game.phase = PHASE.AIMING;
    }
  } else {
    game.shot.x = trace.x;
    game.shot.y = trace.y;
    game.shot.vx = trace.vx;
    game.shot.vy = trace.vy;
  }
  return true;
}

function resolvePlacement(game, placed, layout) {
  const lantern = game.board.lanterns[game.board.lanterns.length - 1];
  const popped = popMatches(game.board, lantern, layout);
  const dropped = dropFloating(game.board, layout);
  const gained = popScore(popped) + dropScore(dropped);
  game.score += gained;
  game.lastResolution = { popped, dropped, gained };
}

function advanceQueue(game) {
  game.queue.current = game.queue.next;
  game.queue.next    = pick(game.rng, game.colors);
}

function projectileSpeed() {
  return PROJECTILE_SPEED;
}

// ─── Trajectory: continuous step until settle ────────────────────────────

function traceFromShot(layout, board, shot, distance) {
  const r = layout.size;
  const stepSize = Math.max(1, r * 0.25);

  let x = shot.x, y = shot.y, vx = shot.vx, vy = shot.vy;
  let remaining = distance;

  while (remaining > 0) {
    const s = Math.min(stepSize, remaining);
    let nx = x + vx * s;
    let ny = y + vy * s;

    if (nx - r < layout.wallLeft) {
      nx = layout.wallLeft + r + ((layout.wallLeft + r) - nx);
      vx = -vx;
    } else if (nx + r > layout.wallRight) {
      nx = layout.wallRight - r - (nx - (layout.wallRight - r));
      vx = -vx;
    }

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
  return { settled: false, x, y, vx, vy };
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

function nearestOverlapping(board, x, y, r, exclude) {
  const sq = (2 * r) * (2 * r) - 1e-3;
  const reachSq = (3 * r) * (3 * r);
  let best = null, bestDistSq = Infinity;
  for (const l of board.lanterns) {
    if (l === exclude) continue;
    const dx = l.x - x, dy = l.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > reachSq) continue;
    if (d2 < sq && d2 < bestDistSq) { best = l; bestDistSq = d2; }
  }
  return best;
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

// ─── Aim-line preview ────────────────────────────────────────────────────

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
    let nx = x + vx * stepSize;
    let ny = y + vy * stepSize;

    let bounced = false;
    if (nx - r < layout.wallLeft) {
      nx = layout.wallLeft + r + ((layout.wallLeft + r) - nx);
      vx = -vx; bounced = true;
    } else if (nx + r > layout.wallRight) {
      nx = layout.wallRight - r - (nx - (layout.wallRight - r));
      vx = -vx; bounced = true;
    }
    if (bounced) {
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

// ─── Geometry helpers ────────────────────────────────────────────────────

export function launcherTip(layout) {
  return {
    x: layout.viewW / 2,
    y: layout.deadLineY + LAUNCHER_OFFSET_FROM_DEAD_LINE,
  };
}

function lanternCollision(board, x, y, r) {
  const sq = (2 * r) * (2 * r);
  const reachSq = (3 * r) * (3 * r);
  let best = null, bestDistSq = Infinity;
  for (const l of board.lanterns) {
    const dx = l.x - x, dy = l.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > reachSq) continue;
    if (d2 < sq && d2 < bestDistSq) {
      best = l;
      bestDistSq = d2;
    }
  }
  return best;
}

// True iff the segment from (x0,y0) to (x1,y1) reaches the lantern's circle
// before crossing the trellis line. Used to disambiguate when a step crosses
// both: the projectile should resolve against whichever it touched first.
function hitsBeforeTrellis(x0, y0, x1, y1, lantern, r, trellisY) {
  const lanternT = segmentToCircleT(x0, y0, x1, y1, lantern.x, lantern.y, 2 * r);
  if (lanternT == null) return false;
  // Trellis hit at t where y0 + t*dy = trellisY + r
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

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
