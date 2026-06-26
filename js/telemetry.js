// Gameplay telemetry: a rich per-game record written on EVERY finished game —
// win or loss, including 0-score quick losses — across all modes. This is the
// raw material for difficulty analysis and seed curation: the leaderboard
// (capped, score>0 only, single shared category) and the 50-entry Seeds history
// are too thin and too lossy to tell us which settings are actually hard.
//
// Records live in a ring buffer under the Arcade.state key 'telemetryLog' (cap
// below) — which the SDK persists to localStorage as 'arcade.v1.moon-lit.
// telemetryLog'. That namespacing means the launcher's "Export to File" feature
// bundles this log automatically; no game-side export UI is needed. Feed the
// resulting pauls-arcade-save JSON to tools/analyze-telemetry.js.

import { seededConfig, levelConfig } from './constants.js';
import { puzzleConfig } from './puzzles.js';

const LOG_KEY = 'telemetryLog';
const LOG_CAP = 500;            // ring buffer; most-recent first
export const TELEMETRY_SCHEMA = 1;

// ─── Store ───────────────────────────────────────────────────────────────────

export function loadTelemetry() {
  if (typeof Arcade === 'undefined' || !Arcade.state) return [];
  const list = Arcade.state.get(LOG_KEY);
  return Array.isArray(list) ? list : [];
}

export function recordGame(record) {
  if (typeof Arcade === 'undefined' || !Arcade.state) return;
  const list = loadTelemetry();
  list.unshift(record);
  Arcade.state.set(LOG_KEY, list.slice(0, LOG_CAP));
}

export function clearTelemetry() {
  if (typeof Arcade !== 'undefined' && Arcade.state) Arcade.state.remove(LOG_KEY);
}

// ─── Record builder ──────────────────────────────────────────────────────────

// The rules snapshot for a finished game, normalized across modes so the
// analyzer can group by a single config signature. Seed mode carries the full
// seeded config; campaign reads its level config; puzzle reads its puzzle def.
function configSnapshot(g) {
  const base = {
    colors: Array.isArray(g.colors) ? g.colors.length : null,
    initialRows: null,
    descentShots: g.descentShots ?? null,
    isSpeedMode: !!g.isSpeedMode,
    blockerPct: null,
    pattern: null,
    stencilPack: g.stencilPack || null,
  };
  try {
    if (g.gameMode === 'seed') {
      const c = g.seedConfig || seededConfig((g.settingsSeed ?? 0) >>> 0);
      return {
        colors: c.colors,
        initialRows: c.initialRows,
        descentShots: c.descentShots,
        isSpeedMode: !!c.isSpeedMode,
        blockerPct: c.blockerPct || 0,
        pattern: c.pattern || null,
        stencilPack: c.stencilPack || base.stencilPack,
      };
    }
    if (g.isPuzzleMode) {
      const pz = puzzleConfig(g.puzzleId);
      if (pz) {
        base.colors = Array.isArray(pz.colors) ? pz.colors.length : base.colors;
        base.goalType = pz.goalType || null;
        base.descentType = pz.descentType || null;
      }
      return base;
    }
    const lc = levelConfig(g.level | 0);
    if (lc) {
      base.colors = lc.colors ?? base.colors;
      base.initialRows = lc.initialRows ?? null;
      base.descentShots = lc.descentShots ?? base.descentShots;
      base.isSpeedMode = !!(lc.isSpeedMode ?? base.isSpeedMode);
      base.stencilPack = lc.stencilPack || base.stencilPack;
    }
  } catch (_) { /* fall back to base */ }
  return base;
}

// Build the per-game record from the live game object at WIN/GAME_OVER.
// durationMs is wall-clock for THIS play session of the game object (resumed
// games understate, single-session — the common case for Explore — are exact).
export function buildGameRecord(g, won, durationMs) {
  const board = g.board || { lanterns: [] };
  const lanterns = Array.isArray(board.lanterns) ? board.lanterns : [];
  const live = lanterns.filter(l => l && !l.isBlocker);
  const rows = new Set(live.map(l => Math.round(l.ny)));
  return {
    schema: TELEMETRY_SCHEMA,
    ts: Date.now(),
    gameMode: g.gameMode || null,
    // identity — exactly what's needed to replay/reconstruct
    settingsSeed: g.settingsSeed != null ? (g.settingsSeed >>> 0) : null,
    boardSeed: g.boardSeed != null ? (g.boardSeed >>> 0) : null,
    overrides: (g.settingsOverrides && Object.keys(g.settingsOverrides).length) ? { ...g.settingsOverrides } : null,
    level: g.isPuzzleMode ? null : (g.level ?? null),
    puzzleId: g.isPuzzleMode ? (g.puzzleId ?? null) : null,
    // config snapshot
    ...configSnapshot(g),
    // outcome
    won: !!won,
    endPhase: g.phase || null,
    score: g.score | 0,
    bestCombo: g.bestCombo | 0,
    shotsFired: g.shotsFired | 0,
    popped: g.counts ? (g.counts.popped | 0) : 0,
    dropped: g.counts ? (g.counts.dropped | 0) : 0,
    descentsSurvived: board.descentCount | 0,
    lanternsRemaining: live.length,   // loss severity (0 on a win)
    rowsRemaining: rows.size,
    moonriseUsed: g.moonriseUsed | 0,
    moonburstUsed: g.moonburstUsed | 0,
    durationMs: durationMs | 0,
  };
}

