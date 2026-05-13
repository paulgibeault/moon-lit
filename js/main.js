import { GAME_ID } from './constants.js';
import { createGame, step, PHASE, hasActiveEffects } from './game.js';
import { computeLayout, render, resetHudState } from './renderer.js';
import { attachInput } from './input.js';
import { loadLanterns, loadBackgrounds } from './assets.js';

await Arcade.ready;

// Migration sentinel: nothing to migrate yet, but acceptance §13 looks for
// arcade.v1.<gameId>._migrated.v1, and laying it down now means future
// schema bumps slot in cleanly.
Arcade.state.migrate('v1', () => { /* nothing yet */ });

try {
  await Promise.all([loadLanterns(), loadBackgrounds()]);
} catch (e) {
  console.warn(`[${GAME_ID}] sprite/background load failed — falling back`, e);
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Persisted progress shape — keep this small and additive. `level` is the
// stage to start on; `bestScore` is the all-time best across launches.
const PROGRESS_KEY = 'progress';
const BEST_KEY = 'bestScore';
const STATS_KEY = 'campaign';
const SCORES_CATEGORY = 'campaign';
const STATS_DEFAULTS = {
  played: 0,
  won: 0,
  bestLevel: 1,
  bestScore: 0,
  bestCombo: 0,
  totalPops: 0,
  totalDrops: 0,
  totalPlayMs: 0,
};

function loadProgress() {
  return Arcade.state.getOrInit(PROGRESS_KEY, { level: 1 });
}
function saveProgress(game) {
  Arcade.state.set(PROGRESS_KEY, { level: game.level });
}
function loadBest() {
  return Arcade.state.get(BEST_KEY) | 0;
}
function commitBestIfHigher(score) {
  const prev = loadBest();
  if (score > prev) {
    Arcade.state.set(BEST_KEY, score | 0);
    return true;
  }
  return false;
}

// Wall-time tracker, persisted across launches via the SDK's session helper.
// Auto-pauses on suspend; the cumulative elapsed feeds totalPlayMs in stats.
const sessionTimer = Arcade.session.start({ persistKey: 'sessionElapsed' });
let lastReportedMs = sessionTimer.elapsedMs();

let layout = null;
let game = null;
let suspended = false;
let lastTime = 0;
let rafId = 0;
let bestScore = loadBest();
let playerName = Arcade.player.name() || '';

function readSettings() {
  return {
    fontScale:     Arcade.settings.fontScale(),
    reducedMotion: Arcade.settings.reducedMotion(),
    handedness:    Arcade.settings.handedness(),
    bestScore,
    playerName,
  };
}
let settings = readSettings();

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout = computeLayout(w, h);
  if (!game) {
    const progress = loadProgress();
    game = createGame({ layout, level: progress.level || 1 });
    resetHudState(game.score, bestScore);
  }
}

// On stage transition we save the new resume point — eviction or a refresh
// after this point will restore the player to the new stage.
function nextLevel() {
  recordOutcome(game, /*won=*/true);
  game = createGame({ layout, level: game.level + 1 });
  saveProgress(game);
  resetHudState(0, bestScore);
}
function restartLevel() {
  recordOutcome(game, /*won=*/false);
  game = createGame({ layout, level: game.level });
  saveProgress(game);
  resetHudState(0, bestScore);
}

// End-of-stage bookkeeping: leaderboard entry, stats update, best-score
// promotion, and a celebratory toast when the player sets a new personal best.
function recordOutcome(g, won) {
  if (!g || g.score <= 0) return;
  const score = g.score | 0;
  Arcade.scores.add(SCORES_CATEGORY, {
    score,
    meta: { level: g.level, won, combo: g.bestCombo | 0 },
  });
  // Charge the wall time accumulated since the last outcome to play time.
  // sessionTimer auto-pauses on onSuspend, so hidden iframe time isn't billed.
  const nowMs = sessionTimer.elapsedMs();
  const playDelta = Math.max(0, nowMs - lastReportedMs);
  lastReportedMs = nowMs;
  Arcade.stats.update(STATS_KEY, (prev) => {
    const s = { ...STATS_DEFAULTS, ...(prev || {}) };
    s.played       += 1;
    if (won) s.won += 1;
    s.bestLevel    = Math.max(s.bestLevel, g.level + (won ? 1 : 0));
    s.bestScore    = Math.max(s.bestScore, score);
    s.bestCombo    = Math.max(s.bestCombo, g.bestCombo | 0);
    s.totalPops   += g.counts.popped  | 0;
    s.totalDrops  += g.counts.dropped | 0;
    s.totalPlayMs += playDelta | 0;
    return s;
  });
  const wasBest = commitBestIfHigher(score);
  if (wasBest) {
    bestScore = score;
    settings = readSettings();
    Arcade.ui.toast(`new best — ${score.toLocaleString('en-US')}`, { kind: 'success' });
  }
}

function frame(now) {
  if (!suspended && layout) {
    const dt = lastTime === 0 ? 0 : Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const phaseAnimating =
      game.phase === PHASE.FLYING ||
      game.phase === PHASE.DESCENDING ||
      game.phase === PHASE.SETTLING;
    if (phaseAnimating || hasActiveEffects(game)) {
      step(game, dt, layout);
    }
    // Always render: the HUD counter tween, combo dots, and moon halo respond
    // to view-only state that lives outside hasActiveEffects(). At this canvas
    // size a 60fps redraw is cheap; the rAF is fully cancelled while suspended.
    render(ctx, layout, game, settings);
  }
  rafId = requestAnimationFrame(frame);
}

// Lifecycle: cancel the rAF entirely while hidden so we hold no slot in the
// browser's animation budget. Flush progress to localStorage at the same
// moment so an LRU eviction can't lose state set in the last few frames.
Arcade.onSuspend(() => {
  suspended = true;
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  if (game) saveProgress(game);
});
Arcade.onResume(() => {
  suspended = false;
  lastTime = 0;
  if (!rafId) rafId = requestAnimationFrame(frame);
});

// When the launcher imports a save, re-hydrate in place: rebuild the game
// from the new persisted level, refresh best score, and reset HUD tween
// state so the new score doesn't appear to "count down" from the old one.
Arcade.onStateReplaced(() => {
  bestScore = loadBest();
  playerName = Arcade.player.name() || '';
  const progress = loadProgress();
  game = createGame({ layout, level: progress.level || 1 });
  settings = readSettings();
  resetHudState(0, bestScore);
  Arcade.ui.toast('save loaded', { kind: 'info' });
});

Arcade.onSettingsChange(() => { settings = readSettings(); dirty = true; });

window.addEventListener('resize', resize);
// requestRender is a no-op now that the frame loop redraws unconditionally.
attachInput(canvas, () => game, () => layout, () => {}, {
  onWinClick: nextLevel,
  onLossClick: restartLevel,
});
resize();
rafId = requestAnimationFrame(frame);

console.info(`[${GAME_ID}] M5 pressure+win/loss ready — framed=${Arcade.context.framed}`);
