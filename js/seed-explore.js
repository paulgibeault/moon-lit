// Seed Explorer: the "mining" workshop behind the Explore game mode.
//
// A variant is defined by two independent 32-bit seeds:
//   - settingsSeed → seededConfig() → the rules (colors, rows, descent, mode…)
//   - boardSeed    → the starting board layout + queue + designs
// so the player can shuffle "how it plays" and "what it looks like" separately.
//
// This module owns the *candidate* variant currently on the build screen plus
// the completed-game history. The menu renderer reads exploreState to draw the
// preview; main.js reads the seeds to actually start a game. Nothing here
// touches the live game — buildPreview generates a throwaway board purely for
// the on-screen thumbnail.

import { seededConfig, COLOR_KEYS } from './constants.js';
import { mulberry32, pick } from './prng.js';
import { createBoard, populateInitial } from './board.js';

const HISTORY_KEY = 'seedHistory';
const HISTORY_CAP = 50;

// A fixed, layout-independent space the preview board is generated in. Lanterns
// carry normalized (nx, ny), so the menu maps these into any preview rect. nx
// runs 0..14 (8 cols, odd rows offset), ny is one packed-row per row.
const PREVIEW_W = 320;
const PREVIEW_H = 420;
const previewLayout = {
  size: 16,
  originX: 32,
  trellisY: 28,
  deadLineY: PREVIEW_H,
  cols: 8,
  maxRows: 19,
  viewW: PREVIEW_W,
  viewH: PREVIEW_H,
  wallLeft: 8,
  wallRight: PREVIEW_W - 8,
};

// The variant currently being browsed on the build screen.
export const exploreState = {
  settingsSeed: 0,
  boardSeed: 0,
  preview: null,   // { config, lanterns: [{ nx, ny, color, isBlocker }] }
};

function randomSeed() {
  // Math.random is fine in app code (only workflow scripts forbid it). 32-bit.
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

// Build a throwaway board for the thumbnail. Mirrors createGame's seed branch
// (settingsSeed → config, boardSeed → board RNG) but keeps nothing alive.
export function buildPreview(settingsSeed, boardSeed) {
  const config = seededConfig(settingsSeed >>> 0);
  const colors = COLOR_KEYS.slice(0, config.colors);
  const rng = mulberry32(boardSeed >>> 0);
  const board = createBoard();
  populateInitial(board, previewLayout, rng, config.initialRows, colors, config.hasBlockers ? 16 : 0);
  // Preview the upcoming queue colors too, so the summary can hint at them.
  const queue = [pick(rng, colors), pick(rng, colors), pick(rng, colors)];
  const lanterns = board.lanterns.map(l => ({ nx: l.nx, ny: l.ny, color: l.color, isBlocker: !!l.isBlocker }));
  return { config, lanterns, queue };
}

function refreshPreview() {
  exploreState.preview = buildPreview(exploreState.settingsSeed, exploreState.boardSeed);
}

// Ensure there's a candidate variant to show (first time the build screen opens).
export function ensureExplore() {
  if (!exploreState.preview) {
    if (!exploreState.settingsSeed) exploreState.settingsSeed = randomSeed();
    if (!exploreState.boardSeed) exploreState.boardSeed = randomSeed();
    refreshPreview();
  }
}

export function shuffleBoard() {
  exploreState.boardSeed = randomSeed();
  refreshPreview();
}

export function shuffleSettings() {
  exploreState.settingsSeed = randomSeed();
  refreshPreview();
}

// Roll a brand-new variant (both seeds). Used when skipping to a fresh board.
export function shuffleAll() {
  exploreState.settingsSeed = randomSeed();
  exploreState.boardSeed = randomSeed();
  refreshPreview();
}

// Point the build screen at specific seeds — manual entry or history replay.
export function setSeeds(settingsSeed, boardSeed) {
  exploreState.settingsSeed = (settingsSeed >>> 0);
  exploreState.boardSeed = (boardSeed >>> 0);
  refreshPreview();
}

// ─── Completed-game history ──────────────────────────────────────────────────

export function loadSeedHistory() {
  if (typeof Arcade === 'undefined' || !Arcade.state) return [];
  const list = Arcade.state.get(HISTORY_KEY);
  return Array.isArray(list) ? list : [];
}

// Record a completed (won OR lost) variant. Most-recent first, capped. Callers
// only invoke this on a real end state — skips/un-started variants never land
// here.
export function pushSeedHistory(entry) {
  if (typeof Arcade === 'undefined' || !Arcade.state) return;
  const list = loadSeedHistory();
  list.unshift(entry);
  Arcade.state.set(HISTORY_KEY, list.slice(0, HISTORY_CAP));
}
