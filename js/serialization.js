// JSON-safe snapshot/restore for a Moon Lit game. Captures everything
// needed to resume between shots: board, queue, score, level, phase, RNG
// state. In-flight projectiles and per-frame anim/effect lifetimes are
// intentionally omitted — callers may snapshot in any phase except FLYING.
// SETTLING/DESCENDING have a resolved board underneath their visual anims,
// so restoring skips straight to the post-anim state cleanly.

import {
  COLOR_KEYS, levelConfig,
  PROJECTILE_SPEED, DESCENT_DRIFT_SPEED, SETTLE_ANIM_SEC,
  SPEED_MODE_PROJECTILE_SPEED, SPEED_MODE_DESCENT_DRIFT_SPEED,
  SPEED_MODE_SETTLE_ANIM_SEC, SPEED_MODE_DESCENT_TIME_FACTOR
} from './constants.js';
import { mulberry32FromState } from './prng.js';
import { createBoard } from './board.js';
import { getRandomDesignForColor } from './stencil-packs.js';
import { puzzleConfig } from './puzzles.js';

function getActivePackId() {
  if (typeof Arcade !== 'undefined' && Arcade.state) {
    return Arcade.state.get('stencilPack') || 'bugs';
  }
  return 'bugs';
}

// Bumped each time the lantern color-key set changes — old saves reference
// keys that may no longer exist, so restoreGame rejects them and the player
// starts fresh. v1: original (red, orange, yellow, green, blue, white).
// v2: muted palette with plum. v3: traditional festival palette with pink.
// v4: pink replaced by paper (natural undyed tissue paper).
export const SAVE_VERSION = 5;

export function serializeGame(g) {
  return {
    version: SAVE_VERSION,
    level: g.level,
    score: g.score,
    aimAngle: g.aimAngle,
    phase: g.phase,
    isPuzzleMode: g.isPuzzleMode,
    puzzleId: g.puzzleId,
    puzzleQueueIndex: g.puzzleQueueIndex,
    puzzleGoalType: g.puzzleGoalType,
    puzzleDescentType: g.puzzleDescentType,
    queue: {
      current:   g.queue.current,
      currentDesign: g.queue.currentDesign,
      next:      g.queue.next,
      nextDesign: g.queue.nextDesign,
      afterNext: g.queue.afterNext,
      afterNextDesign: g.queue.afterNextDesign,
    },
    breakdown: { ...g.breakdown },
    counts: { ...g.counts },
    combo: g.combo,
    bestCombo: g.bestCombo,
    shotsUntilDescent: g.shotsUntilDescent,
    pendingDescent: g.pendingDescent,
    isSpeedMode: g.isSpeedMode,
    timeUntilDescent: g.timeUntilDescent,
    descentTimeLimit: g.descentTimeLimit,
    showModeIntroCard: g.showModeIntroCard,
    endOverlayDismissed: g.endOverlayDismissed,
    shots: (g.shots || []).map(s => ({
      x: s.x,
      y: s.y,
      vx: s.vx,
      vy: s.vy,
      color: s.color,
      designId: s.designId,
      flightT: s.flightT,
      swayPhase: s.swayPhase,
      swayFreq: s.swayFreq,
      swayAmp: s.swayAmp
    })),
    board: {
      descentCount: g.board.descentCount,
      lanterns: g.board.lanterns.map(l => ({ nx: l.nx, ny: l.ny, color: l.color, designId: l.designId, isTarget: l.isTarget, isBlocker: l.isBlocker })),
    },
    rngState: g.rng.getState(),
  };
}

function migrateSaveState(saved) {
  if (!saved) return null;
  // Deep clone to avoid mutating the original object
  let state = JSON.parse(JSON.stringify(saved));
  
  if (typeof state.version !== 'number') {
    state.version = 1;
  }
  
  while (state.version < SAVE_VERSION) {
    if (state.version === 1) {
      // v1: original (red, orange, yellow, green, blue, white)
      // white was replaced by plum in v2
      state = migrateV1ToV2(state);
    } else if (state.version === 2) {
      // v2: muted palette with plum
      // plum was replaced by pink in v3
      state = migrateV2ToV3(state);
    } else if (state.version === 3) {
      // v3: traditional festival palette with pink
      // pink was replaced by paper in v4
      state = migrateV3ToV4(state);
    } else if (state.version === 4) {
      // v4: pink replaced by paper (natural undyed tissue paper)
      state = migrateV4ToV5(state);
    } else {
      // Fallback to prevent infinite loop
      state.version = SAVE_VERSION;
    }
  }
  
  return state;
}

function migrateV4ToV5(state) {
  return {
    ...state,
    version: 5
  };
}

function migrateV1ToV2(state) {
  const mapColor = c => c === 'white' ? 'plum' : c;
  return {
    ...state,
    version: 2,
    queue: state.queue ? {
      current: mapColor(state.queue.current),
      next: mapColor(state.queue.next),
      afterNext: state.queue.afterNext ? mapColor(state.queue.afterNext) : undefined
    } : undefined,
    board: state.board ? {
      ...state.board,
      lanterns: (state.board.lanterns || []).map(l => ({ ...l, color: mapColor(l.color) }))
    } : undefined
  };
}

function migrateV2ToV3(state) {
  const mapColor = c => c === 'plum' ? 'pink' : c;
  return {
    ...state,
    version: 3,
    queue: state.queue ? {
      current: mapColor(state.queue.current),
      next: mapColor(state.queue.next),
      afterNext: state.queue.afterNext ? mapColor(state.queue.afterNext) : undefined
    } : undefined,
    board: state.board ? {
      ...state.board,
      lanterns: (state.board.lanterns || []).map(l => ({ ...l, color: mapColor(l.color) }))
    } : undefined
  };
}

function migrateV3ToV4(state) {
  const mapColor = c => c === 'pink' ? 'paper' : c;
  return {
    ...state,
    version: 4,
    queue: state.queue ? {
      current: mapColor(state.queue.current),
      next: mapColor(state.queue.next),
      afterNext: state.queue.afterNext ? mapColor(state.queue.afterNext) : undefined
    } : undefined,
    board: state.board ? {
      ...state.board,
      lanterns: (state.board.lanterns || []).map(l => ({ ...l, color: mapColor(l.color) }))
    } : undefined
  };
}

// Rebuild a game from a snapshot. Caller must run syncLanternPixels(board, layout)
// after this so the lantern (x, y) cache matches the current viewport.
export function restoreGame(saved) {
  if (!saved) return null;

  let migrated = saved;
  if (saved.version !== SAVE_VERSION) {
    try {
      migrated = migrateSaveState(saved);
    } catch (e) {
      console.warn('[moon-lit] failed to migrate saved game:', e);
      return null;
    }
  }

  if (!migrated || migrated.version !== SAVE_VERSION) return null;

  const isPuzzleMode = !!migrated.isPuzzleMode;
  const puzzleId = migrated.puzzleId || 1;
  const level = migrated.level ?? 1;
  
  let config = null;
  let colors = null;
  let descentShots = 0;
  let descentTimeLimit = 0;
  let puzzleGoalType = 'clear-all';
  let puzzleDescentType = 'none';

  if (isPuzzleMode) {
    const pz = puzzleConfig(puzzleId);
    colors = pz.colors;
    puzzleGoalType = migrated.puzzleGoalType || pz.goalType || 'clear-all';
    puzzleDescentType = migrated.puzzleDescentType || pz.descentType || 'none';
    descentShots = puzzleDescentType === 'shot' ? pz.queue.length : 0;
    descentTimeLimit = puzzleDescentType === 'time' ? (pz.queue.length * SPEED_MODE_DESCENT_TIME_FACTOR) : 0;
  } else {
    config = levelConfig(level);
    colors = COLOR_KEYS.slice(0, config.colors);
    descentShots = config.descentShots;
    descentTimeLimit = config.descentShots * SPEED_MODE_DESCENT_TIME_FACTOR;
  }
  
  const rngState = migrated.rngState !== undefined ? migrated.rngState : 0x4D6F6F6E;
  const rng = mulberry32FromState(rngState >>> 0);
  
  const activePackId = getActivePackId();

  const board = createBoard();
  if (migrated.board) {
    board.descentCount = (migrated.board.descentCount || 0) | 0;
    
    // Safety check color mapping to current active palette
    const VALID_COLORS = new Set(COLOR_KEYS);
    const mapColor = c => VALID_COLORS.has(c) ? c : 'paper';
    
    if (migrated.board.lanterns) {
      for (const l of migrated.board.lanterns) {
        const mappedColor = mapColor(l.color);
        let designId = l.designId !== undefined ? l.designId : (activePackId === 'random' ? getRandomDesignForColor(mappedColor, rng) : null);
        if (!!l.isTarget && !designId) {
          designId = 'dragons_dragon_head';
        }
        board.lanterns.push({
          nx: l.nx ?? 0,
          ny: l.ny ?? 0,
          color: mappedColor,
          designId,
          isTarget: !!l.isTarget,
          isBlocker: !!l.isBlocker,
          x: 0,
          y: 0
        });
      }
    }
  }

  const VALID_COLORS = new Set(COLOR_KEYS);
  const mapColor = c => VALID_COLORS.has(c) ? c : 'paper';
  
  const queueCurrent = (migrated.queue && migrated.queue.current !== undefined)
    ? (migrated.queue.current === null ? null : mapColor(migrated.queue.current))
    : COLOR_KEYS[0];
  const queueNext = (migrated.queue && migrated.queue.next !== undefined)
    ? (migrated.queue.next === null ? null : mapColor(migrated.queue.next))
    : COLOR_KEYS[1];
  const queueAfterNext = (migrated.queue && migrated.queue.afterNext !== undefined)
    ? (migrated.queue.afterNext === null ? null : mapColor(migrated.queue.afterNext))
    : COLOR_KEYS[2];

  let currentDesign = migrated.queue?.currentDesign;
  if (currentDesign === undefined) {
    currentDesign = activePackId === 'random' ? getRandomDesignForColor(queueCurrent, rng) : null;
  }
  let nextDesign = migrated.queue?.nextDesign;
  if (nextDesign === undefined) {
    nextDesign = activePackId === 'random' ? getRandomDesignForColor(queueNext, rng) : null;
  }
  let afterNextDesign = migrated.queue?.afterNextDesign;
  if (afterNextDesign === undefined) {
    afterNextDesign = activePackId === 'random' ? getRandomDesignForColor(queueAfterNext, rng) : null;
  }

  const isSpeedMode = !!migrated.isSpeedMode;
  descentTimeLimit = migrated.descentTimeLimit ?? descentTimeLimit;
  const timeUntilDescent = migrated.timeUntilDescent ?? descentTimeLimit;
  const showModeIntroCard = !!migrated.showModeIntroCard;
  const endOverlayDismissed = !!migrated.endOverlayDismissed;
  const shots = (migrated.shots || []).map(s => ({
    x: s.x,
    y: s.y,
    vx: s.vx,
    vy: s.vy,
    color: s.color,
    designId: s.designId,
    flightT: s.flightT ?? 0,
    swayPhase: s.swayPhase ?? 0,
    swayFreq: s.swayFreq ?? 0,
    swayAmp: s.swayAmp ?? 0
  }));

  return {
    rng,
    board,
    phase: migrated.phase || 'aiming',
    aimAngle: migrated.aimAngle || 0,
    queue: { 
      current: queueCurrent, 
      currentDesign,
      next: queueNext, 
      nextDesign,
      afterNext: queueAfterNext,
      afterNextDesign
    },
    shots,
    get shot() { return this.shots[0] || null; },
    set shot(val) {
      if (val === null) {
        this.shots.shift();
      } else {
        this.shots[0] = val;
      }
    },
    score: migrated.score | 0,
    effects: [],
    floats: [],
    ripples: [],
    lastResolution: null,
    breakdown: {
      pop: 0, cluster: 0, drop: 0, chain: 0, combo: 0, clear: 0,
      ...(migrated.breakdown || {})
    },
    counts: {
      popped: 0, dropped: 0,
      ...(migrated.counts || {})
    },
    combo: migrated.combo | 0,
    bestCombo: migrated.bestCombo | 0,
    moonPulse: { t: 0, life: 0 },
    shotsUntilDescent: migrated.shotsUntilDescent !== undefined ? (migrated.shotsUntilDescent | 0) : descentShots,
    pendingDescent: !!migrated.pendingDescent,
    level,
    colors,
    descentShots,
    isSpeedMode,
    projectileSpeed: isSpeedMode ? SPEED_MODE_PROJECTILE_SPEED : PROJECTILE_SPEED,
    descentDriftSpeed: isSpeedMode ? SPEED_MODE_DESCENT_DRIFT_SPEED : DESCENT_DRIFT_SPEED,
    settleAnimSec: isSpeedMode ? SPEED_MODE_SETTLE_ANIM_SEC : SETTLE_ANIM_SEC,
    descentTimeLimit,
    timeUntilDescent,
    fireCooldown: 0,
    showModeIntroCard,
    endOverlayDismissed,
    
    // Puzzle Mode properties
    isPuzzleMode,
    puzzleId,
    puzzleQueueIndex: migrated.puzzleQueueIndex !== undefined ? migrated.puzzleQueueIndex : 3,
    puzzleGoalType,
    puzzleDescentType,
  };
}

