import {
  COLOR_KEYS, AIM_MIN_ANGLE, AIM_MAX_ANGLE, M3_DEFAULT_SEED,
  PROJECTILE_SPEED, DESCENT_DRIFT_SPEED,
  SETTLE_ANIM_SEC,
  SHOT_SWAY_FREQ_MIN, SHOT_SWAY_FREQ_MAX,
  SHOT_SWAY_AMP_MIN, SHOT_SWAY_AMP_MAX,
  levelConfig,
} from './constants.js';
import { mulberry32, pick } from './prng.js';
import { createBoard, populateInitial, descend, isCleared, addLantern } from './board.js';
import { popMatches, dropFloating } from './match.js';
import { resolveShot, clearBonus, crossedMilestone } from './scoring.js';
import { settleAround, tickAnims } from './physics.js';
import { clamp, SQRT3 } from './geometry.js';
import { traceFromShot, launcherTip } from './projectile.js';
import {
  emitFloats, hasActiveEffects, pulseMoon, spawnBurst, tickEffects,
} from './effects.js';

export const PHASE = Object.freeze({
  AIMING: 'aiming',
  FLYING: 'flying',
  SETTLING: 'settling',
  DESCENDING: 'descending',
  WIN: 'win',
  GAME_OVER: 'gameOver',
});

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

  const trace = traceFromShot(layout, game.board, game.shot, PROJECTILE_SPEED * dtSec, dtSec);
  if (trace.settled) {
    const placed = { x: trace.x, y: trace.y, color: game.shot.color };
    addLantern(game.board, placed.x, placed.y, placed.color, layout);
    resolvePlacement(game, layout);
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
    // Pull the new top row only from colors currently in play, so a descent
    // can't re-introduce a color the player has already cleared from the board.
    const live = new Set(game.board.lanterns.map(l => l.color));
    const palette = game.colors.filter(c => live.has(c));
    const ok = descend(game.board, layout, game.rng, palette.length ? palette : game.colors);
    if (!ok) {
      game.phase = PHASE.GAME_OVER;
      return;
    }
    const r = layout.size;
    game.board.descentAnimY = -(SQRT3 * r);
    game.phase = PHASE.DESCENDING;
    game.shotsUntilDescent = game.descentShots;
  } else {
    game.phase = PHASE.AIMING;
  }
}

function resolvePlacement(game, layout) {
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

function advanceQueue(game) {
  game.queue.current = game.queue.next;
  game.queue.next    = pick(game.rng, game.colors);
}

// Re-exports so existing callers (renderer.js, tests) don't need to track
// where the geometry/effects code moved to.
export { hasActiveEffects };
export { launcherTip, traceAimLine } from './projectile.js';
