import {
  COLOR_KEYS, AIM_MIN_ANGLE, AIM_MAX_ANGLE, M3_DEFAULT_SEED,
  SETTLE_NUDGE_RAD, PROJECTILE_SPEED,
  SETTLE_ANIM_SEC, BURST_DURATION_SEC,
  SHOT_SWAY_FREQ_MIN, SHOT_SWAY_FREQ_MAX,
  SHOT_SWAY_AMP_MIN, SHOT_SWAY_AMP_MAX,
  levelConfig,
} from './constants.js';
import { mulberry32, pick } from './prng.js';
import { createBoard, populateInitial, descend, isCleared, addLantern } from './board.js';
import { popMatches, dropFloating } from './match.js';
import { resolveShot, clearBonus, crossedMilestone } from './scoring.js';
import { settleAround, tickAnims } from './physics.js';

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
    effects: [],
    floats: [],
    lastResolution: null,
    breakdown: { pop: 0, cluster: 0, drop: 0, chain: 0, combo: 0, clear: 0 },
    counts: { popped: 0, dropped: 0 },
    combo: 0,
    bestCombo: 0,
    moonPulse: { t: 0, life: 0 },
    shotsUntilDescent: config.descentShots,
    pendingDescent: false,
    level,
    colors,
    descentShots: config.descentShots,
  };
}

// Snapshot the game to a plain JSON-safe object. Captures everything needed
// to resume between shots: board, queue, score, level, phase, RNG state.
// In-flight projectiles and per-frame anim/effect lifetimes are intentionally
// omitted — callers should only snapshot when phase is stable (AIMING / WIN /
// GAME_OVER), and restoration starts a clean frame with no live effects.
export const SAVE_VERSION = 1;
export function serializeGame(g) {
  return {
    version: SAVE_VERSION,
    level: g.level,
    score: g.score,
    aimAngle: g.aimAngle,
    phase: g.phase,
    queue: { current: g.queue.current, next: g.queue.next },
    breakdown: { ...g.breakdown },
    counts: { ...g.counts },
    combo: g.combo,
    bestCombo: g.bestCombo,
    shotsUntilDescent: g.shotsUntilDescent,
    pendingDescent: g.pendingDescent,
    board: {
      descentCount: g.board.descentCount,
      lanterns: g.board.lanterns.map(l => ({ nx: l.nx, ny: l.ny, color: l.color })),
    },
    rngState: g.rng.getState(),
  };
}

// Rebuild a game from a snapshot. Caller must run syncLanternPixels(board, layout)
// after this so the lantern (x, y) cache matches the current viewport.
export function restoreGame(saved) {
  if (!saved || saved.version !== SAVE_VERSION) return null;
  const config = levelConfig(saved.level);
  const colors = COLOR_KEYS.slice(0, config.colors);
  const rng = mulberry32(0);
  rng.setState(saved.rngState >>> 0);
  const board = createBoard();
  board.descentCount = saved.board.descentCount | 0;
  for (const l of saved.board.lanterns) {
    board.lanterns.push({ nx: l.nx, ny: l.ny, color: l.color, x: 0, y: 0 });
  }
  return {
    rng,
    board,
    phase: saved.phase,
    aimAngle: saved.aimAngle,
    queue: { current: saved.queue.current, next: saved.queue.next },
    shot: null,
    score: saved.score | 0,
    effects: [],
    floats: [],
    lastResolution: null,
    breakdown: { ...saved.breakdown },
    counts: { ...saved.counts },
    combo: saved.combo | 0,
    bestCombo: saved.bestCombo | 0,
    moonPulse: { t: 0, life: 0 },
    shotsUntilDescent: saved.shotsUntilDescent | 0,
    pendingDescent: !!saved.pendingDescent,
    level: saved.level,
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
  const swayFreq = SHOT_SWAY_FREQ_MIN +
    game.rng() * (SHOT_SWAY_FREQ_MAX - SHOT_SWAY_FREQ_MIN);
  const swayAmp = SHOT_SWAY_AMP_MIN +
    game.rng() * (SHOT_SWAY_AMP_MAX - SHOT_SWAY_AMP_MIN);
  game.shot = {
    x: origin.x,
    y: origin.y,
    vx: Math.sin(angle),
    vy: -Math.cos(angle),
    color: game.queue.current,
    flightT: 0,
    swayPhase: game.rng() * Math.PI * 2,
    swayFreq,
    swayAmp,
  };
  game.phase = PHASE.FLYING;
}

export function hasActiveEffects(game) {
  if (game.effects && game.effects.length > 0) return true;
  if (game.floats && game.floats.length > 0) return true;
  if (game.moonPulse && game.moonPulse.t < game.moonPulse.life) return true;
  return false;
}

function tickEffects(game, dtSec) {
  if (game.effects && game.effects.length) {
    const kept = [];
    for (const fx of game.effects) {
      fx.t += dtSec;
      if (fx.t < fx.life) kept.push(fx);
    }
    game.effects = kept;
  }
  if (game.floats && game.floats.length) {
    const kept = [];
    for (const f of game.floats) {
      f.t += dtSec;
      if (f.t < f.life) kept.push(f);
    }
    game.floats = kept;
  }
  if (game.moonPulse && game.moonPulse.t < game.moonPulse.life) {
    game.moonPulse.t += dtSec;
  }
}

export function step(game, dtSec, layout) {
  tickEffects(game, dtSec);
  if (game.phase === PHASE.DESCENDING) {
    const stepPx = DESCENT_DRIFT_SPEED * dtSec;
    game.board.descentAnimY = Math.min(0, game.board.descentAnimY + stepPx);
    if (game.board.descentAnimY >= 0) {
      game.board.descentAnimY = 0;
      const postDrop = dropFloating(game.board, layout);
      if (postDrop.length) {
        // A descent that knocks lanterns past the trellis edge is a quiet
        // gift, not a player-driven combo: score it as a drop without
        // touching the combo counter or chain multiplier.
        const gain = postDrop.length * postDrop.length * 20;
        game.score += gain;
        game.breakdown.drop += gain;
        for (const l of postDrop) spawnBurst(game, l.x, l.y);
      }
      game.phase = PHASE.AIMING;
    }
    return true;
  }

  if (game.phase === PHASE.SETTLING) {
    const stillActive = tickAnims(game.board, dtSec, SETTLE_ANIM_SEC);
    if (!stillActive) finishSettle(game, layout);
    return true;
  }

  if (game.phase !== PHASE.FLYING || !game.shot) return false;
  const speed = projectileSpeed();
  const trace = traceFromShot(layout, game.board, game.shot, speed * dtSec, dtSec);

  if (trace.settled) {
    const placed = { x: trace.x, y: trace.y, color: game.shot.color };
    addLantern(game.board, placed.x, placed.y, placed.color, layout);
    resolvePlacement(game, placed, layout);
    game.shot = null;
    advanceQueue(game);
    if (isCleared(game.board)) {
      const bonus = clearBonus(game.shotsUntilDescent);
      game.score += bonus;
      game.breakdown.clear += bonus;
      game.phase = PHASE.WIN;
      return true;
    }
    game.shotsUntilDescent--;
    game.pendingDescent = game.shotsUntilDescent <= 0;
    const anyAnim = game.board.lanterns.some(l => l.anim);
    if (anyAnim) {
      game.phase = PHASE.SETTLING;
    } else {
      finishSettle(game, layout);
    }
  } else {
    game.shot.x = trace.x;
    game.shot.y = trace.y;
    game.shot.vx = trace.vx;
    game.shot.vy = trace.vy;
    game.shot.flightT = trace.flightT;
  }
  return true;
}

function finishSettle(game, layout) {
  if (game.pendingDescent) {
    game.pendingDescent = false;
    const ok = descend(game.board, layout, game.rng, game.colors);
    if (!ok) {
      game.phase = PHASE.GAME_OVER;
      return;
    }
    const r = layout.size;
    game.board.descentAnimY = -(Math.sqrt(3) * r);
    game.phase = PHASE.DESCENDING;
    game.shotsUntilDescent = game.descentShots;
  } else {
    game.phase = PHASE.AIMING;
  }
}

function resolvePlacement(game, placed, layout) {
  const lantern = game.board.lanterns[game.board.lanterns.length - 1];
  // Match against the placement position. Running settleAround first can
  // drift the new lantern off its same-color anchors past the tight 1.04
  // adjacency tolerance, silently failing visually-valid matches. Settle
  // is only meaningful when the new lantern stays on the board.
  const popped = popMatches(game.board, lantern, layout);
  if (popped.length === 0) {
    settleAround(game.board, layout, lantern);
  }
  const dropped = dropFloating(game.board, layout);
  const breakdown = resolveShot(popped, dropped, game.combo);

  const prevScore = game.score;
  game.score += breakdown.total;
  game.combo = breakdown.combo;
  if (game.combo > game.bestCombo) game.bestCombo = game.combo;
  game.breakdown.pop     += breakdown.pop;
  game.breakdown.cluster += breakdown.cluster;
  game.breakdown.drop    += breakdown.drop;
  game.breakdown.chain   += breakdown.chainGain;
  game.breakdown.combo   += breakdown.comboBonus;
  game.counts.popped     += popped.length;
  game.counts.dropped    += dropped.length;

  for (const l of popped) spawnBurst(game, l.x, l.y);
  for (const l of dropped) spawnBurst(game, l.x, l.y);

  emitFloats(game, popped, dropped, breakdown, layout);

  if (crossedMilestone(prevScore, game.score)) pulseMoon(game);

  game.lastResolution = { popped, dropped, breakdown };
}

function spawnBurst(game, x, y) {
  game.effects.push({ x, y, t: 0, life: BURST_DURATION_SEC });
}

// Emit short-lived "spark" labels that drift up from the popped lanterns
// (and a centroid label for drops + chain/combo callouts). The renderer
// owns presentation; here we only stamp positions, kinds, and lifetimes.
function emitFloats(game, popped, dropped, breakdown, layout) {
  const r = layout.size;
  if (popped.length > 0) {
    const per = breakdown.pop / popped.length;
    for (const l of popped) {
      game.floats.push({
        kind: 'pop', text: `+${per | 0}`,
        x: l.x, y: l.y - r * 0.4,
        t: 0, life: 1.1,
      });
    }
    if (breakdown.cluster > 0) {
      const centroid = centroidOf(popped);
      game.floats.push({
        kind: 'cluster', text: `cluster +${breakdown.cluster}`,
        x: centroid.x, y: centroid.y - r * 1.2,
        t: 0, life: 1.4,
      });
    }
  }
  if (dropped.length > 0) {
    const centroid = centroidOf(dropped);
    game.floats.push({
      kind: 'drop', text: `drop +${breakdown.drop}`,
      x: centroid.x, y: centroid.y - r * 0.6,
      t: 0, life: 1.6,
    });
  }
  if (breakdown.chainGain > 0) {
    const centroid = centroidOf(popped.concat(dropped));
    game.floats.push({
      kind: 'chain', text: `chain ×${breakdown.chainMult}`,
      x: centroid.x, y: centroid.y - r * 2.0,
      t: 0, life: 1.7,
    });
  }
  if (breakdown.combo >= 2 && breakdown.comboBonus > 0) {
    const centroid = centroidOf(popped.length ? popped : dropped);
    game.floats.push({
      kind: 'combo', text: `combo ×${breakdown.combo}`,
      x: centroid.x, y: centroid.y - r * 2.6,
      t: 0, life: 1.8,
    });
  }
}

function centroidOf(items) {
  if (!items.length) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const it of items) { sx += it.x; sy += it.y; }
  return { x: sx / items.length, y: sy / items.length };
}

function pulseMoon(game) {
  game.moonPulse = { t: 0, life: 1.4 };
}

function advanceQueue(game) {
  game.queue.current = game.queue.next;
  game.queue.next    = pick(game.rng, game.colors);
}

function projectileSpeed() {
  return PROJECTILE_SPEED;
}

// ─── Trajectory: continuous step until settle ────────────────────────────

function traceFromShot(layout, board, shot, distance, dtSec) {
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
  return { settled: false, x, y, vx, vy, flightT: (shot.flightT || 0) + dtSec };
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
    y: layout.tipY,
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
