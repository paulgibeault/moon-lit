import { COLOR_KEYS, GRID, AIM_MIN_ANGLE, AIM_MAX_ANGLE, M3_DEFAULT_SEED } from './constants.js';
import { mulberry32, pick } from './prng.js';
import { createBoard, fillRandomTop } from './board.js';
import { hexToPixel, pixelToHex, getNeighbors, inBounds } from './hex-math.js';
import { popMatches, dropFloating, popScore, dropScore } from './match.js';

export const PHASE = Object.freeze({
  AIMING: 'aiming',
  FLYING: 'flying',
  SETTLING: 'settling',
});

export function createGame({ seed = M3_DEFAULT_SEED } = {}) {
  const rng = mulberry32(seed);
  const board = createBoard();
  fillRandomTop(board, rng, 5);
  return {
    rng,
    board,
    phase: PHASE.AIMING,
    aimAngle: 0,
    queue: {
      current: pick(rng, COLOR_KEYS),
      next:    pick(rng, COLOR_KEYS),
    },
    shot: null,
    score: 0,
    lastResolution: null,
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

// Step the in-flight projectile by dtSec. Returns true if a render-affecting
// state change happened (movement, settle).
export function step(game, dtSec, layout) {
  if (game.phase !== PHASE.FLYING || !game.shot) return false;
  const speed = projectileSpeed();
  const distance = speed * dtSec;
  const trace = traceFromShot(layout, game.board, game.shot, distance);

  if (trace.settled) {
    placeLantern(game.board, trace.snap, game.shot.color);
    resolvePlacement(game, trace.snap);
    game.shot = null;
    advanceQueue(game);
    game.phase = PHASE.AIMING;
  } else {
    game.shot.x = trace.endX;
    game.shot.y = trace.endY;
    game.shot.vx = trace.endVx;
    game.shot.vy = trace.endVy;
  }
  return true;
}

function resolvePlacement(game, snap) {
  if (!snap) {
    game.lastResolution = { popped: [], dropped: [], gained: 0 };
    return;
  }
  const popped = popMatches(game.board, snap.col, snap.row);
  const dropped = popped.length ? dropFloating(game.board) : [];
  const gained = popScore(popped) + dropScore(dropped);
  game.score += gained;
  game.lastResolution = { popped, dropped, gained };
}

function advanceQueue(game) {
  game.queue.current = game.queue.next;
  game.queue.next    = pick(game.rng, COLOR_KEYS);
}

function placeLantern(board, hex, color) {
  if (!hex) return;
  if (!inBounds(hex.col, hex.row, board.cols, board.rows)) return;
  board.cells[hex.row][hex.col] = { color };
}

function projectileSpeed() {
  // Imported lazily so tests can stub if needed; here just return constant.
  // Kept as a function for future per-shot speed mods (e.g. Twin Lanterns).
  return 720;
}

// ─── Trajectory: continuous step until settle ────────────────────────────

// Single short-duration step along the projectile path, with early-out on
// collision. Returns either { settled: false, endX, endY, endVx, endVy }
// or { settled: true, snap: {col,row}, endX, endY }.
function traceFromShot(layout, board, shot, distance) {
  const r = layout.size * 0.78;
  const stepSize = Math.max(1, r * 0.25);
  const SQRT3 = Math.sqrt(3);
  const halfHexW = SQRT3 * layout.size * 0.5;
  const boardLeft  = layout.originX - halfHexW;
  const boardRight = layout.originX + (board.cols - 1) * SQRT3 * layout.size + halfHexW;
  const trellisY   = layout.originY - layout.size;

  let x = shot.x, y = shot.y, vx = shot.vx, vy = shot.vy;
  let remaining = distance;

  while (remaining > 0) {
    const s = Math.min(stepSize, remaining);
    let nx = x + vx * s;
    let ny = y + vy * s;

    if (nx - r < boardLeft) {
      nx = boardLeft + r + ((boardLeft + r) - nx);
      vx = -vx;
    } else if (nx + r > boardRight) {
      nx = boardRight - r - (nx - (boardRight - r));
      vx = -vx;
    }

    if (ny - r <= trellisY) {
      const snap = snapNearestEmpty(layout, board, nx, Math.max(ny, trellisY + r));
      return { settled: true, snap, endX: nx, endY: ny };
    }

    const hit = lanternCollision(layout, board, nx, ny, r);
    if (hit) {
      const snap = snapNearestEmpty(layout, board, nx, ny);
      return { settled: true, snap, endX: nx, endY: ny };
    }

    x = nx; y = ny;
    remaining -= s;
  }
  return { settled: false, endX: x, endY: y, endVx: vx, endVy: vy };
}

// ─── Aim-line preview: full trajectory for HUD ───────────────────────────

// Simulate a shot from the launcher tip at the given angle. Returns the
// list of segment endpoints (including bounce points) and the final snap
// target, without mutating the board. Used for the aim-line preview.
export function traceAimLine(layout, board, angle, maxBounces = 1) {
  const origin = launcherTip(layout);
  const r = layout.size * 0.78;
  const SQRT3 = Math.sqrt(3);
  const halfHexW = SQRT3 * layout.size * 0.5;
  const boardLeft  = layout.originX - halfHexW;
  const boardRight = layout.originX + (board.cols - 1) * SQRT3 * layout.size + halfHexW;
  const trellisY   = layout.originY - layout.size;
  const stepSize   = Math.max(1, r * 0.4);
  const maxSteps   = 4000;

  const points = [{ x: origin.x, y: origin.y }];
  let x = origin.x, y = origin.y;
  let vx = Math.sin(angle), vy = -Math.cos(angle);
  let bounces = 0;

  for (let i = 0; i < maxSteps; i++) {
    let nx = x + vx * stepSize;
    let ny = y + vy * stepSize;

    let bounced = false;
    if (nx - r < boardLeft) {
      nx = boardLeft + r + ((boardLeft + r) - nx);
      vx = -vx; bounced = true;
    } else if (nx + r > boardRight) {
      nx = boardRight - r - (nx - (boardRight - r));
      vx = -vx; bounced = true;
    }
    if (bounced) {
      points.push({ x: nx, y: ny });
      bounces++;
      if (bounces > maxBounces) {
        return { points, snap: null, bounced: true };
      }
    }

    if (ny - r <= trellisY) {
      const snap = snapNearestEmpty(layout, board, nx, Math.max(ny, trellisY + r));
      points.push({ x: nx, y: ny });
      return { points, snap };
    }
    const hit = lanternCollision(layout, board, nx, ny, r);
    if (hit) {
      const snap = snapNearestEmpty(layout, board, nx, ny);
      points.push({ x: nx, y: ny });
      return { points, snap };
    }
    x = nx; y = ny;
  }
  points.push({ x, y });
  return { points, snap: null };
}

// ─── Geometry helpers ────────────────────────────────────────────────────

export function launcherTip(layout) {
  const lastRowY = layout.originY + (layout.rows - 1) * 1.5 * layout.size;
  return {
    x: layout.viewW / 2,
    y: lastRowY + layout.size + 64,
  };
}

function lanternCollision(layout, board, x, y, r) {
  const lr = layout.size * 0.78;
  const sq = (r + lr) * (r + lr);
  // Bounding-box prefilter: only check cells within ~3 cell widths.
  const SQRT3 = Math.sqrt(3);
  const reach = SQRT3 * layout.size * 1.5;
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      const cell = board.cells[row][col];
      if (!cell) continue;
      const p = hexToPixel(col, row, layout);
      const dx = p.x - x, dy = p.y - y;
      if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
      if (dx * dx + dy * dy < sq) return { col, row };
    }
  }
  return null;
}

export function snapNearestEmpty(layout, board, x, y) {
  const home = pixelToHex(x, y, layout);
  const candidates = [home, ...getNeighbors(home.col, home.row)];
  let best = null, bestDist = Infinity;
  for (const c of candidates) {
    if (!inBounds(c.col, c.row, board.cols, board.rows)) continue;
    if (board.cells[c.row][c.col]) continue;
    const p = hexToPixel(c.col, c.row, layout);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
