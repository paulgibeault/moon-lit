// Exact puzzle solver for Moon Lit's Puzzle Mode.
//
// Searches the full shot queue (not a capped depth) by enumerating *distinct
// landing positions* per board state instead of treating every aim angle as a
// separate branch: a fine angle sweep is deduped into landing bins, so the
// branching factor is the number of reachable pockets (~10-40), not the
// number of angles (341). Placement resolution reuses the game's own
// primitives (addLantern / popMatches / settleAround / dropFloating), so a
// solution found here is a solution in the real game — and replaySolution()
// re-validates it through the authentic createGame()/fire()/step() loop.
//
// "Fair" solutions only: candidate shots are restricted to trajectories with
// at most one wall bounce, because the in-game aim preview caps at one bounce.
// A puzzle verified here never requires a blind multi-bounce shot.

import {
  PROJECTILE_SPEED, SPEED_MODE_PROJECTILE_SPEED,
} from '../js/constants.js';
import { populatePuzzle, addLantern, syncLanternPixels } from '../js/board.js';
import { popMatches, dropFloating } from '../js/match.js';
import { settleAround } from '../js/physics.js';
import { traceFromShot, launcherTip } from '../js/projectile.js';
import { SQRT3 } from '../js/geometry.js';
import { puzzleConfig } from '../js/puzzles.js';
import { createGame, step, fire, PHASE } from '../js/game.js';

// Same fixture the unit tests use. Geometry in lantern-radius units is
// viewport-invariant (see layout.js), so solvability here carries over.
export function fixtureLayout() {
  return {
    size: 16, originX: 88, trellisY: 64, deadLineY: 631, cols: 8, maxRows: 19,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 633,
  };
}

const FRAME_DT = 0.016;
const ANGLE_MIN = -84.5;
const ANGLE_MAX = 84.5;
const ANGLE_STEP = 0.5;

export function cloneBoard(board) {
  return {
    lanterns: board.lanterns.map(l => ({
      x: l.x, y: l.y, nx: l.nx, ny: l.ny, color: l.color,
      isTarget: !!l.isTarget, isBlocker: !!l.isBlocker,
    })),
    descentAnimY: 0,
    descentCount: board.descentCount | 0,
    anchorOffsetRows: board.anchorOffsetRows | 0,
  };
}

// Fly a shot to rest using the exact same frame stepping the game loop uses,
// so landing positions match the real game bit-for-bit. Returns null if the
// trajectory needs more than `maxBounces` wall bounces (unfair / invisible
// to the aim preview) or never lands.
export function simulateLanding(layout, board, angleDeg, { fast = false, maxBounces = 1 } = {}) {
  const tip = launcherTip(layout);
  const rad = (angleDeg * Math.PI) / 180;
  const shot = { x: tip.x, y: tip.y, vx: Math.sin(rad), vy: -Math.cos(rad), flightT: 0 };
  const dist = (fast ? SPEED_MODE_PROJECTILE_SPEED : PROJECTILE_SPEED) * layout.size * FRAME_DT;
  let bounces = 0;
  let prevVx = shot.vx;
  for (let i = 0; i < 4000; i++) {
    const t = traceFromShot(layout, board, shot, dist, FRAME_DT);
    if (t.settled) {
      return { x: t.x, y: t.y, bounces };
    }
    if (Math.sign(t.vx) !== Math.sign(prevVx) && t.vx !== 0) {
      bounces++;
      if (bounces > maxBounces) return null;
      prevVx = t.vx;
    }
    shot.x = t.x; shot.y = t.y; shot.vx = t.vx; shot.vy = t.vy; shot.flightT = t.flightT;
  }
  return null;
}

// Mirror of game.js resolvePlacement(), minus scoring and effects.
export function applyShot(board, layout, x, y, color) {
  const placed = addLantern(board, x, y, color, layout);
  const popped = popMatches(board, placed, layout);
  if (popped.length === 0) {
    settleAround(board, layout, placed);
  }
  const dropped = dropFloating(board, layout);
  return { popped, dropped, placed };
}

export function isWon(board, goalType) {
  if (goalType === 'clear-targets') return !board.lanterns.some(l => l.isTarget);
  return board.lanterns.length === 0;
}

// Deterministic puzzle descent: shift everything one packed row toward the
// water (puzzle mode never seeds new rows — see board.js descend()).
export function applyPuzzleDescent(board, layout) {
  const rowH = SQRT3 * layout.size;
  const limitY = layout.deadLineY - layout.size;
  for (const l of board.lanterns) {
    if (l.y + rowH > limitY) return false; // pushed past the dead line
  }
  for (const l of board.lanterns) {
    l.y += rowH;
    l.ny += SQRT3;
  }
  board.anchorOffsetRows = (board.anchorOffsetRows || 0) + 1;
  board.descentCount++;
  return true;
}

export function stateKey(board, queueIndex) {
  const parts = board.lanterns.map(l =>
    `${Math.round(l.nx * 4)},${Math.round(l.ny * 4)},${l.color}${l.isTarget ? 'T' : ''}${l.isBlocker ? 'X' : ''}`
  );
  parts.sort();
  return queueIndex + '|' + parts.join(';');
}

// Enumerate distinct landing positions for the current board. Returns a list
// of { angleDeg, x, y, angleLo, angleHi } — one entry per landing bin.
// angleLo/angleHi bound the LONGEST CONTIGUOUS run of swept angles that lands
// in the bin (an honest "how forgiving is this shot" measure — disjoint
// slivers that happen to share a bin don't add up), and angleDeg is that
// run's first sample (its landing position is the bin's stored x,y exactly).
export function enumerateCandidates(layout, board, { fast = false, maxBounces = 1 } = {}) {
  // 1. Sweep angles and build runs: maximal contiguous angle intervals whose
  //    consecutive samples land near each other (same pocket).
  const nearSq = (layout.size * 0.8) ** 2;
  const runs = [];
  let cur = null;
  let prev = null;
  for (let a = ANGLE_MIN; a <= ANGLE_MAX + 1e-9; a += ANGLE_STEP) {
    const land = simulateLanding(layout, board, a, { fast, maxBounces });
    if (!land) { cur = null; prev = null; continue; }
    if (cur && prev) {
      const dx = land.x - prev.x, dy = land.y - prev.y;
      if (dx * dx + dy * dy <= nearSq) {
        cur.hi = a;
        cur.samples.push({ a, x: land.x, y: land.y });
        prev = land;
        continue;
      }
    }
    cur = { lo: a, hi: a, samples: [{ a, x: land.x, y: land.y }] };
    runs.push(cur);
    prev = land;
  }

  // 2. Group runs that land in the same pocket; keep the longest (most
  //    forgiving) run as each pocket's representative. The representative
  //    angle is the run's middle sample — its landing is exact (simulated).
  const out = [];
  for (const run of runs) {
    const mid = run.samples[Math.floor(run.samples.length / 2)];
    const existing = out.find(c => {
      const dx = c.x - mid.x, dy = c.y - mid.y;
      return dx * dx + dy * dy <= nearSq;
    });
    if (!existing) {
      out.push({ angleDeg: mid.a, x: mid.x, y: mid.y, angleLo: run.lo, angleHi: run.hi });
    } else if (run.hi - run.lo > existing.angleHi - existing.angleLo) {
      existing.angleDeg = mid.a;
      existing.x = mid.x; existing.y = mid.y;
      existing.angleLo = run.lo; existing.angleHi = run.hi;
    }
  }
  return out;
}

// Full-queue DFS with memoization on (board, queueIndex). Returns
// { solution, nodes, exhausted } where solution is an array of
// { angleDeg, angleLo, angleHi, x, y, popped, dropped } or null.
export function solvePuzzle(pz, layout = fixtureLayout(), opts = {}) {
  const maxNodes = opts.maxNodes ?? 60000;
  const fast = pz.descentType === 'time';
  const maxBounces = opts.maxBounces ?? 1;
  const minWindowDeg = opts.minWindowDeg ?? 0;

  const root = { lanterns: [], descentAnimY: 0, descentCount: 0, anchorOffsetRows: 0 };
  populatePuzzle(root, layout, pz.board, pz);

  const queue = pz.queue;
  const goalType = pz.goalType || 'clear-all';
  const descentEvery = pz.descentType === 'shot' ? (pz.descentEvery || 2) : 0;

  const failed = new Set();
  let nodes = 0;
  let aborted = false;

  function dfs(board, qi, shotsSinceDescent) {
    if (nodes++ > maxNodes) { aborted = true; return null; }
    if (qi >= queue.length) return null;

    const cands = enumerateCandidates(layout, board, { fast, maxBounces });

    // Score candidates by immediate outcome so promising lines search first.
    const scored = [];
    for (const c of cands) {
      if (minWindowDeg > 0 && (c.angleHi - c.angleLo) < minWindowDeg) continue;
      const next = cloneBoard(board);
      const { popped, dropped, placed } = applyShot(next, layout, c.x, c.y, queue[qi]);
      if (placed.y >= layout.deadLineY) continue; // lands in the water: loss
      const removedTargets =
        popped.filter(l => l.isTarget).length + dropped.filter(l => l.isTarget).length;
      const won = isWon(next, goalType);
      scored.push({
        c, next, popped, dropped, won,
        score: (won ? 1e9 : 0) + removedTargets * 1000 + (popped.length + dropped.length) * 10,
      });
    }
    scored.sort((a, b) => b.score - a.score);

    for (const s of scored) {
      const stepRec = {
        angleDeg: s.c.angleDeg, angleLo: s.c.angleLo, angleHi: s.c.angleHi,
        x: s.c.x, y: s.c.y,
        popped: s.popped.length, dropped: s.dropped.length,
      };
      if (s.won) return [stepRec];

      // Descent (shot-type) fires only after a non-winning shot.
      let nextShots = shotsSinceDescent + 1;
      const nextBoard = s.next;
      if (descentEvery > 0 && nextShots >= descentEvery) {
        if (!applyPuzzleDescent(nextBoard, layout)) continue; // descent loss
        nextShots = 0;
      }

      if (qi + 1 >= queue.length) continue; // out of shots, not won

      const key = stateKey(nextBoard, qi + 1) + ':' + nextShots;
      if (failed.has(key)) continue;
      const rest = dfs(nextBoard, qi + 1, nextShots);
      if (rest) return [stepRec, ...rest];
      failed.add(key);
      if (aborted) return null;
    }
    return null;
  }

  const solution = dfs(root, 0, 0);
  return { solution, nodes, exhausted: !aborted };
}

// Replay a solved angle sequence through the real game loop. Returns
// { won, phase } — the ultimate ground truth for solvability.
export function replaySolution(puzzleId, angles, layout = fixtureLayout()) {
  const game = createGame({ layout, isPuzzleMode: true, puzzleId });
  game.showModeIntroCard = false;
  for (const angleDeg of angles) {
    if (game.phase === PHASE.WIN) break;
    let guard = 0;
    // Wait for an aimable state (fast-launch can fire during SETTLING).
    while (!(game.phase === PHASE.AIMING ||
             (game.isFastLaunch && game.phase === PHASE.SETTLING && game.fireCooldown <= 0)) && guard < 4000) {
      step(game, FRAME_DT, layout);
      guard++;
    }
    if (game.phase === PHASE.WIN) break;
    game.aimAngle = (angleDeg * Math.PI) / 180;
    fire(game, layout);
    guard = 0;
    while ((game.phase === PHASE.FLYING || game.phase === PHASE.SETTLING ||
            game.phase === PHASE.DESCENDING || game.shots.length > 0) && guard < 4000) {
      step(game, FRAME_DT, layout);
      guard++;
    }
  }
  // Let any trailing state (e.g. queue-exhausted drowning check) resolve.
  let guard = 0;
  while (game.phase !== PHASE.WIN && game.phase !== PHASE.GAME_OVER &&
         game.phase !== PHASE.AIMING && guard < 4000) {
    step(game, FRAME_DT, layout);
    guard++;
  }
  return { won: game.phase === PHASE.WIN, phase: game.phase };
}

// Convenience: solve + replay-validate one puzzle id. Returns a report object.
export function verifyPuzzle(puzzleId, opts = {}) {
  const pz = puzzleConfig(puzzleId);
  const layout = fixtureLayout();
  const t0 = Date.now();
  const { solution, nodes, exhausted } = solvePuzzle(pz, layout, opts);
  const ms = Date.now() - t0;
  let replayWon = false;
  if (solution) {
    const angles = solution.map(s => s.angleDeg);
    replayWon = replaySolution(puzzleId, angles, layout).won;
    if (!replayWon) {
      // Window midpoints can straddle a bin edge; retry with the angles the
      // search actually simulated (the low edge of each window).
      const lows = solution.map(s => s.angleLo);
      replayWon = replaySolution(puzzleId, lows, layout).won;
      if (replayWon) solution.forEach(s => { s.angleDeg = s.angleLo; });
    }
  }
  return {
    id: puzzleId,
    name: pz.name,
    queueLength: pz.queue.length,
    solvable: !!solution,
    replayWon,
    exhausted,
    nodes,
    ms,
    solution,
  };
}
