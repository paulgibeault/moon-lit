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

// Rebuild a game from a snapshot. Caller must run syncLanternPixels(board, layout)
// after this so the lantern (x, y) cache matches the current viewport.
export function restoreGame(saved) {
  if (!saved || saved.version !== SAVE_VERSION) return null;
  const config = levelConfig(saved.level);
  const colors = COLOR_KEYS.slice(0, config.colors);
  const rng = mulberry32FromState(saved.rngState >>> 0);
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
    ripples: [],
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

