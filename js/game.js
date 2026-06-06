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
import { getRandomDesignForColor } from './stencil-packs.js';

function getActivePackId() {
  if (typeof Arcade !== 'undefined' && Arcade.state) {
    return Arcade.state.get('stencilPack') || 'bugs';
  }
  return 'bugs';
}
import { popMatches, dropFloating } from './match.js';
import { resolveShot, clearBonus, crossedMilestone } from './scoring.js';
import { settleAround, tickAnims } from './physics.js';
import { clamp, SQRT3 } from './geometry.js';
import { traceFromShot, launcherTip } from './projectile.js';
import {
  emitFloats, emitRipple, hasActiveEffects, pulseMoon, spawnBurst, spawnRipple,
  tickEffects, spawnWindSwept,
} from './effects.js';

export const PHASE = Object.freeze({
  AIMING: 'aiming',
  FLYING: 'flying',
  SETTLING: 'settling',
  DESCENDING: 'descending',
  DROWNING: 'drowning',
  WIN: 'win',
  GAME_OVER: 'gameOver',
});

// Drowning sequence tuning. All speeds/accels are in lantern-radii per second
// so the cinematic reads the same on a phone or full desktop viewport.
const DROWN_INITIAL_VY      = 3.5;  // radii/sec — base downward kick
const DROWN_INITIAL_VY_JIT  = 2.0;  // additional 0..N random downward push
const DROWN_INITIAL_VX_RANGE = 1.8; // radii/sec horizontal drift (±)
const DROWN_INITIAL_SPIN_RANGE = 5.0; // rad/sec tumble (±)
const DROWN_AIR_ACCEL       = 18.0; // radii/sec² — heavier gravity, real drop
const DROWN_SPLASH_DRAG     = 0.22; // vy multiplier on splash — water decelerates
                                    // the lamp sharply but does not reverse it
const DROWN_SPLASH_SPIN_DAMP = 0.4;  // spin multiplier on splash (water resists)
const DROWN_WATER_ACCEL     = 4.0;  // radii/sec² — slow sink so the bubbles and
                                    // sway underwater get screen time
const DROWN_WATER_SWAY_AMP  = 0.35; // radii — horizontal wobble underwater
const DROWN_WATER_SWAY_FREQ = 3.5;  // base sway rad/sec
const DROWN_BUBBLE_MIN_INT  = 0.18; // seconds between bubble ripples (per lamp)
const DROWN_BUBBLE_MAX_INT  = 0.5;
const DROWN_BUBBLE_DEPTH    = 10.0; // radii past waterline at which bubbles stop
const DROWN_END_PAUSE_SEC   = 0.3;

export function createGame({ seed, layout, level = 1 } = {}) {
  const config = levelConfig(level);
  const colors = COLOR_KEYS.slice(0, config.colors);
  // Each level gets a distinct deterministic seed unless one is passed in.
  const effectiveSeed = (seed ?? (M3_DEFAULT_SEED + level * 1009)) >>> 0;
  const rng = mulberry32(effectiveSeed);
  const board = createBoard();
  if (layout) populateInitial(board, layout, rng, config.initialRows, colors);
  const activePackId = getActivePackId();
  const queueCurrent = pick(rng, colors);
  const queueNext = pick(rng, colors);
  const queueAfterNext = pick(rng, colors);
  const currentDesign = activePackId === 'random' ? getRandomDesignForColor(queueCurrent, rng) : null;
  const nextDesign = activePackId === 'random' ? getRandomDesignForColor(queueNext, rng) : null;
  const afterNextDesign = activePackId === 'random' ? getRandomDesignForColor(queueAfterNext, rng) : null;
  const SPECIAL_TYPES = ['lunar_burst', 'celestial_ray', 'stardust_prism'];
  const currentSpecial = (rng() < 0.10) ? pick(rng, SPECIAL_TYPES) : null;
  const nextSpecial = (rng() < 0.10) ? pick(rng, SPECIAL_TYPES) : null;
  const afterNextSpecial = (rng() < 0.10) ? pick(rng, SPECIAL_TYPES) : null;

  return {
    rng,
    board,
    phase: PHASE.AIMING,
    aimAngle: 0,
    queue: {
      current:   queueCurrent,
      currentDesign,
      currentSpecial,
      next:      queueNext,
      nextDesign,
      nextSpecial,
      afterNext: queueAfterNext,
      afterNextDesign,
      afterNextSpecial,
    },
    shot: null,
    score: 0,
    effects: [],
    floats: [],
    ripples: [],
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
    lastLaunchTime: 0,
    recoilTime: 0,
    lastQueueAdvanceTime: 0,
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
    designId: game.queue.currentDesign,
    isSpecial: !!game.queue.currentSpecial,
    specialType: game.queue.currentSpecial || null,
    flightT: 0,
    swayPhase: game.rng() * Math.PI * 2,
    swayFreq,
    swayAmp,
  };
  game.phase = PHASE.FLYING;
  const tSec = performance.now() / 1000;
  game.lastLaunchTime = tSec;
  game.recoilTime = tSec;
}

export function step(game, dtSec, layout) {
  tickEffects(game, dtSec);

  if (game.phase === PHASE.DESCENDING) {
    const stepPx = DESCENT_DRIFT_SPEED * layout.size * dtSec;
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
        // Treat the gift drop as a "big" event for the ripple — the player
        // didn't earn it with a placement, but seeing the field shimmer in
        // response sells the cascade.
        emitRipple(game, [], postDrop, { combo: 0 }, layout);
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

  if (game.phase === PHASE.DROWNING) {
    return stepDrowning(game, dtSec, layout);
  }

  if (game.phase !== PHASE.FLYING || !game.shot) return false;

  const trace = traceFromShot(layout, game.board, game.shot, PROJECTILE_SPEED * layout.size * dtSec, dtSec);
  if (trace.settled) {
    const placed = {
      x: trace.x,
      y: trace.y,
      color: game.shot.color,
      designId: game.shot.designId,
      isSpecial: game.shot.isSpecial,
      specialType: game.shot.specialType
    };
    addLantern(game.board, placed.x, placed.y, placed.color, layout, placed.designId, placed.isSpecial, placed.specialType);
    game.shot = null;
    if (placed.y >= layout.deadLineY) {
      startDrowning(game);
      return true;
    }
    resolvePlacement(game, layout);
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

// End-of-game cinematic: every lantern gets a per-lamp drop state so the
// renderer can show the field tumbling into the water with varied speeds,
// rotations, and a small horizontal drift. The upward wave of dimming
// emerges naturally — bottom rows hit the waterline first.
function startDrowning(game) {
  const rng = game.rng;
  for (const l of game.board.lanterns) {
    l.drown = {
      extinguished: false,
      offsetX: 0,
      offsetY: 0,
      vx: (rng() - 0.5) * 2 * DROWN_INITIAL_VX_RANGE,
      vy: DROWN_INITIAL_VY + rng() * DROWN_INITIAL_VY_JIT,
      spin: 0,
      spinVy: (rng() - 0.5) * 2 * DROWN_INITIAL_SPIN_RANGE,
      // Underwater sway. Frequency and phase per-lamp so the surface doesn't
      // pulse in lockstep.
      swayPhase: rng() * Math.PI * 2,
      swayFreq: DROWN_WATER_SWAY_FREQ * (0.7 + rng() * 0.6),
      swayAmp: 0,        // grows on splash
      preSplashX: 0,     // sway anchor at moment of splash
      bubbleTimer: DROWN_BUBBLE_MIN_INT + rng() *
        (DROWN_BUBBLE_MAX_INT - DROWN_BUBBLE_MIN_INT),
    };
  }
  game.drown = { t: 0, doneAt: null };
  game.phase = PHASE.DROWNING;
  console.log('[moon-lit] drowning cinematic started, lanterns=', game.board.lanterns.length);
}

function stepDrowning(game, dtSec, layout) {
  const r = layout.size;
  const { deadLineY, viewH } = layout;
  game.drown.t += dtSec;
  const airAccel = DROWN_AIR_ACCEL * r;
  const waterAccel = DROWN_WATER_ACCEL * r;
  const bubbleStopDepth = DROWN_BUBBLE_DEPTH * r;
  const rng = game.rng;
  let anyVisible = false;

  for (const l of game.board.lanterns) {
    const d = l.drown;
    if (!d) continue;

    // Vertical: gravity in air, gentler accel underwater (so they bob and sway
    // a moment before sinking out of view).
    const accel = d.extinguished ? waterAccel : airAccel;
    d.vy += accel * dtSec;
    d.offsetY += d.vy * dtSec;

    // Horizontal: linear drift in air, sinusoidal wobble underwater anchored
    // at the splash position so the lamp visibly rocks side-to-side.
    if (d.extinguished) {
      d.swayPhase += d.swayFreq * dtSec;
      d.offsetX = d.preSplashX + Math.sin(d.swayPhase) * d.swayAmp;
    } else {
      d.offsetX += d.vx * dtSec;
    }

    // Tumble. Spin continues throughout — water resistance is applied at the
    // splash moment, not as a continuous drag (cheaper, and the residual spin
    // reads as "wobbling as it sinks").
    d.spin += d.spinVy * dtSec;

    const displayY = l.y + d.offsetY;
    const displayX = l.x + d.offsetX;

    // Splash: when the lamp's center first crosses the waterline, kick the
    // velocity slightly upward (bounce off the surface), damp the spin, lock
    // in the sway anchor, and emit a chunky ripple at the impact point.
    if (!d.extinguished && displayY >= deadLineY) {
      d.extinguished = true;
      d.vy *= DROWN_SPLASH_DRAG;
      d.spinVy *= DROWN_SPLASH_SPIN_DAMP;
      d.preSplashX = d.offsetX;
      d.swayAmp = DROWN_WATER_SWAY_AMP * r * (0.7 + rng() * 0.6);
      spawnRipple(game, displayX, deadLineY, layout,
        { strength: 0.85, reach: 6.5 });
    }

    // Bubbles: tiny rising ripples emitted from the lamp's current X position,
    // pinned to the waterline (where the air pocket would escape). Tapers off
    // once the lamp has sunk well below the surface.
    if (d.extinguished) {
      const depth = displayY - deadLineY;
      if (depth < bubbleStopDepth) {
        d.bubbleTimer -= dtSec;
        if (d.bubbleTimer <= 0) {
          d.bubbleTimer = DROWN_BUBBLE_MIN_INT + rng() *
            (DROWN_BUBBLE_MAX_INT - DROWN_BUBBLE_MIN_INT);
          const bx = displayX + (rng() - 0.5) * r * 0.8;
          spawnRipple(game, bx, deadLineY, layout,
            { strength: 0.18, reach: 1.6 });
        }
      }
    }

    if (displayY - r * 2 < viewH) anyVisible = true;
  }

  if (!anyVisible) {
    if (game.drown.doneAt == null) game.drown.doneAt = game.drown.t;
    if (game.drown.t - game.drown.doneAt > DROWN_END_PAUSE_SEC) {
      game.phase = PHASE.GAME_OVER;
    }
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
      startDrowning(game);
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
  const popped = popMatches(game.board, lantern, layout, game.rng);
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

  for (const l of popped) {
    if (l.isWindSwept) {
      spawnWindSwept(game, l, layout);
    } else {
      spawnBurst(game, l.x, l.y);
    }
  }
  for (const l of dropped) spawnBurst(game, l.x, l.y);

  emitFloats(game, popped, dropped, breakdown, layout);
  emitRipple(game, popped, dropped, breakdown, layout);

  if (crossedMilestone(prevScore, game.score)) pulseMoon(game);

  game.lastResolution = { popped, dropped, breakdown };
}

function advanceQueue(game) {
  // Three-stage magazine: current fires, next promotes to current, afterNext
  // promotes to next (it rotated into the on-deck position during the firing
  // animation), and a fresh lantern is loaded into the afterNext slot (hidden
  // beneath the wheel until the next shot rotates it up).
  game.queue.current = game.queue.next;
  game.queue.currentDesign = game.queue.nextDesign;
  game.queue.currentSpecial = game.queue.nextSpecial;
  game.queue.next = game.queue.afterNext;
  game.queue.nextDesign = game.queue.afterNextDesign;
  game.queue.nextSpecial = game.queue.afterNextSpecial;
  // The freshly-loaded lantern (the future on-deck) should never reintroduce
  // a color the board no longer contains. Already-visible lanterns keep
  // whatever color they were drawn with.
  const live = new Set(game.board.lanterns.map(l => l.color));
  const palette = game.colors.filter(c => live.has(c));
  const nextColor = pick(game.rng, palette.length ? palette : game.colors);
  game.queue.afterNext = nextColor;
  
  const activePackId = getActivePackId();
  game.queue.afterNextDesign = activePackId === 'random' ? getRandomDesignForColor(nextColor, game.rng) : null;

  let isSpecial = false;
  if (game.combo >= 5) {
    isSpecial = true;
  } else if (game.rng() < 0.10) {
    isSpecial = true;
  }
  const SPECIAL_TYPES = ['lunar_burst', 'celestial_ray', 'stardust_prism'];
  game.queue.afterNextSpecial = isSpecial ? pick(game.rng, SPECIAL_TYPES) : null;

  game.lastQueueAdvanceTime = performance.now() / 1000;
}

// Re-exports so existing callers (renderer.js, tests) don't need to track
// where the geometry/effects code moved to.
export { hasActiveEffects };
export { launcherTip, traceAimLine } from './projectile.js';
