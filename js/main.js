import { GAME_ID } from './constants.js';
import { createGame, step, PHASE, hasActiveEffects } from './game.js';
import { serializeGame, restoreGame } from './serialization.js';
import { computeLayout } from './layout.js';
import { render, resetHudState } from './renderer.js';
import { attachInput } from './input.js';
import { loadLanterns, loadBackgrounds } from './assets.js';
import { syncLanternPixels } from './board.js';

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

// Persisted state keys. `gameState` is the full snapshot used to resume
// between sessions; `bestScore` is the all-time best across launches.
// `progress` was the original "next level to start on" — now derived from
// the snapshot, but the key is preserved so a roaming save knows where to
// resume even if the snapshot is dropped by eviction.
const PROGRESS_KEY = 'progress';
const BEST_KEY = 'bestScore';
const GAME_STATE_KEY = 'gameState';
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

function loadProgressLevel() {
  const p = Arcade.state.getOrInit(PROGRESS_KEY, { level: 1 });
  return (p && p.level) | 0 || 1;
}
function saveProgress(game) {
  Arcade.state.set(PROGRESS_KEY, { level: game.level });
}
function loadBest() {
  return Arcade.state.get(BEST_KEY) | 0;
}
function loadGameState() {
  return Arcade.state.get(GAME_STATE_KEY);
}
function saveGameState(g) {
  if (!g) return;
  try {
    Arcade.state.set(GAME_STATE_KEY, serializeGame(g));
  } catch (e) {
    console.warn(`[${GAME_ID}] failed to persist game state`, e);
  }
}
function clearGameState() {
  Arcade.state.remove(GAME_STATE_KEY);
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
let lastPhase = null;

// Any phase except FLYING carries a fully resolved game state we can resume
// from. FLYING is the only transient one (live projectile trajectory isn't
// serialized); SETTLING/DESCENDING run only visual anims on top of an
// already-updated board, so saving there means a mid-anim refresh still
// keeps the just-landed shot.
function isResumablePhase(p) {
  return p !== PHASE.FLYING;
}

// Snapshot the game whenever the phase first re-enters a resumable state.
// Triggered after the shot lands (FLYING → SETTLING) and again at each
// subsequent transition, so a refresh during animations keeps progress.
function maybePersistOnPhaseChange() {
  if (!game) return;
  if (game.phase !== lastPhase) {
    if (isResumablePhase(game.phase)) saveGameState(game);
    lastPhase = game.phase;
  }
}

function startGame(g) {
  game = g;
  lastPhase = null;
  if (game.board && layout) syncLanternPixels(game.board, layout);
  saveGameState(game);
  lastPhase = game.phase;
}

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

// Remap an in-flight shot from one layout's pixel basis to another, using the
// same normalized origin (layout.originX, trellisY + size) and unit (size) as
// lanterns. Direction (vx, vy) is a unit vector and stays put.
function remapShotToLayout(shot, prev, next) {
  if (!shot || !prev || !next) return;
  const nx = (shot.x - prev.originX) / prev.size;
  const ny = (shot.y - prev.trellisY - prev.size) / prev.size;
  shot.x = next.originX + nx * next.size;
  shot.y = next.trellisY + next.size + ny * next.size;
}

// First-time game bootstrap: restore the full snapshot if there is one,
// otherwise create a fresh game at the saved progress level. Pulled out of
// resize() so the viewport path stays single-purpose.
function bootstrapGame() {
  const saved = loadGameState();
  let restored = null;
  if (saved) {
    try { restored = restoreGame(saved); }
    catch (e) {
      console.warn(`[${GAME_ID}] saved game state was corrupt, starting fresh`, e);
      clearGameState();
    }
  }
  if (restored) {
    startGame(restored);
  } else {
    startGame(createGame({ layout, level: loadProgressLevel() }));
  }
  resetHudState(game.score, bestScore);
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const prevLayout = layout;
  layout = computeLayout(w, h);
  if (!game) {
    bootstrapGame();
    return;
  }
  // Live game: re-derive pixel positions under the new layout. Lanterns own
  // their normalized (nx, ny); the in-flight shot uses prev→next remapping
  // since it's transient and isn't normalized.
  syncLanternPixels(game.board, layout);
  remapShotToLayout(game.shot, prevLayout, layout);
}

// On stage transition we save the new resume point — eviction or a refresh
// after this point will restore the player to the new stage.
function nextLevel() {
  recordOutcome(game, /*won=*/true);
  startGame(createGame({ layout, level: game.level + 1 }));
  saveProgress(game);
  resetHudState(0, bestScore);
}
function restartLevel() {
  recordOutcome(game, /*won=*/false);
  startGame(createGame({ layout, level: game.level }));
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
    maybePersistOnPhaseChange();
    // Always render: the HUD counter tween, combo dots, and moon halo respond
    // to view-only state that lives outside hasActiveEffects(). At this canvas
    // size a 60fps redraw is cheap; the rAF is fully cancelled while suspended.
    render(ctx, layout, game, settings);
  }
  rafId = requestAnimationFrame(frame);
}

// Last-chance flush before the page goes away. onSuspend only fires from a
// launcher-driven suspend; a plain browser refresh / tab-close needs the DOM
// lifecycle hooks. pagehide is the reliable cross-browser trigger; we mirror
// it on visibilitychange so mobile backgrounding also flushes.
function flushPersist() {
  if (!game) return;
  saveProgress(game);
  if (isResumablePhase(game.phase)) saveGameState(game);
}

// Lifecycle: cancel the rAF entirely while hidden so we hold no slot in the
// browser's animation budget. Flush progress to localStorage at the same
// moment so an LRU eviction can't lose state set in the last few frames.
Arcade.onSuspend(() => {
  suspended = true;
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  flushPersist();
});
Arcade.onResume(() => {
  suspended = false;
  lastTime = 0;
  if (!rafId) rafId = requestAnimationFrame(frame);
});
window.addEventListener('pagehide', flushPersist);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPersist();
});

// When the launcher imports a save, re-hydrate in place. Reset HUD tween
// state so the new score doesn't appear to "count down" from the old one.
Arcade.onStateReplaced(() => {
  bestScore = loadBest();
  playerName = Arcade.player.name() || '';
  bootstrapGame();
  settings = readSettings();
  resetHudState(game.score, bestScore);
  Arcade.ui.toast('save loaded', { kind: 'info' });
});

Arcade.onSettingsChange(() => { settings = readSettings(); });

window.addEventListener('resize', resize);
attachInput(canvas, () => game, () => layout, {
  onWinClick: nextLevel,
  onLossClick: restartLevel,
});
resize();
rafId = requestAnimationFrame(frame);

console.info(`[${GAME_ID}] M5 pressure+win/loss ready — framed=${Arcade.context.framed}`);
