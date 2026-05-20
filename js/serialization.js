// JSON-safe snapshot/restore for a Moon Lit game. Captures everything
// needed to resume between shots: board, queue, score, level, phase, RNG
// state. In-flight projectiles and per-frame anim/effect lifetimes are
// intentionally omitted — callers may snapshot in any phase except FLYING.
// SETTLING/DESCENDING have a resolved board underneath their visual anims,
// so restoring skips straight to the post-anim state cleanly.

import { COLOR_KEYS, levelConfig } from './constants.js';
import { mulberry32FromState } from './prng.js';
import { createBoard } from './board.js';

// Bumped each time the lantern color-key set changes — old saves reference
// keys that may no longer exist, so restoreGame rejects them and the player
// starts fresh. v1: original (red, orange, yellow, green, blue, white).
// v2: muted palette with plum. v3: traditional festival palette with pink.
// v4: pink replaced by paper (natural undyed tissue paper).
export const SAVE_VERSION = 4;

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
    } else {
      // Fallback to prevent infinite loop
      state.version = SAVE_VERSION;
    }
  }
  
  return state;
}

function migrateV1ToV2(state) {
  const mapColor = c => c === 'white' ? 'plum' : c;
  return {
    ...state,
    version: 2,
    queue: state.queue ? {
      current: mapColor(state.queue.current),
      next: mapColor(state.queue.next)
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
      next: mapColor(state.queue.next)
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
      next: mapColor(state.queue.next)
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

  const level = migrated.level ?? 1;
  const config = levelConfig(level);
  const colors = COLOR_KEYS.slice(0, config.colors);
  
  const rngState = migrated.rngState !== undefined ? migrated.rngState : 0x4D6F6F6E;
  const rng = mulberry32FromState(rngState >>> 0);
  
  const board = createBoard();
  if (migrated.board) {
    board.descentCount = (migrated.board.descentCount || 0) | 0;
    
    // Safety check color mapping to current active palette
    const VALID_COLORS = new Set(COLOR_KEYS);
    const mapColor = c => VALID_COLORS.has(c) ? c : 'paper';
    
    if (migrated.board.lanterns) {
      for (const l of migrated.board.lanterns) {
        board.lanterns.push({
          nx: l.nx ?? 0,
          ny: l.ny ?? 0,
          color: mapColor(l.color),
          x: 0,
          y: 0
        });
      }
    }
  }

  const VALID_COLORS = new Set(COLOR_KEYS);
  const mapColor = c => VALID_COLORS.has(c) ? c : 'paper';
  
  const queueCurrent = mapColor(migrated.queue?.current || COLOR_KEYS[0]);
  const queueNext = mapColor(migrated.queue?.next || COLOR_KEYS[1]);

  return {
    rng,
    board,
    phase: migrated.phase || 'aiming',
    aimAngle: migrated.aimAngle || 0,
    queue: { current: queueCurrent, next: queueNext },
    shot: null,
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
    shotsUntilDescent: migrated.shotsUntilDescent !== undefined ? (migrated.shotsUntilDescent | 0) : config.descentShots,
    pendingDescent: !!migrated.pendingDescent,
    level,
    colors,
    descentShots: config.descentShots,
  };
}

