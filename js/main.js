import { GAME_ID, SYSTEM_OVERRIDES, levelConfig, ENV_PARAMS, MOON_OVERRIDE } from './constants.js';
import { createGame, step, PHASE, hasActiveEffects } from './game.js';
import { puzzleConfig } from './puzzles.js';
import { serializeGame, restoreGame } from './serialization.js';
import { computeLayout } from './layout.js';
import { render, resetHudState, isHudSettled } from './renderer.js';
import { getEffectiveDpr, PERF_MODE, setPerfModeOverride } from './renderer/style.js';
import { attachInput } from './input.js';
import { loadLanterns, loadBambooSprites, loadMoonTexture, loadHarnessSprite, triggerNewRandomMapping, changeStencilPack } from './assets.js';
import { syncLanternPixels } from './board.js';
import { initAdminPanel } from './admin-panel.js';
import { getRandomDesignForColor } from './stencil-packs.js';
import {
  isMenuOpen, isMenuPanelOpen, isMenuSettled, tickMenu, closeMenu, openMenuToLevelSelector,
} from './renderer/menu.js';

await Arcade.ready;

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
  // Per-level summary, keyed by stage number as a string. Powers the stage
  // selector — shows per-stage best score, whether the stage has ever been
  // cleared, and how many attempts the player has made.
  levels: {},
};

function loadProgressLevel(mode) {
  const m = mode || Arcade.state.get('gameMode') || 'campaign';
  const key = `progress_${m}`;
  const p = Arcade.state.getOrInit(key, { level: 1 });
  return (p && p.level) | 0 || 1;
}
function saveProgress(game) {
  if (!game) return;
  const m = game.gameMode || Arcade.state.get('gameMode') || 'campaign';
  const key = `progress_${m}`;
  const level = game.isPuzzleMode ? game.puzzleId : game.level;
  Arcade.state.set(key, { level });
}
function loadBest() {
  return Arcade.state.get(BEST_KEY) | 0;
}
function loadGameState(mode) {
  const m = mode || Arcade.state.get('gameMode') || 'campaign';
  const key = `gameState_${m}`;
  return Arcade.state.get(key) || Arcade.state.get(GAME_STATE_KEY);
}
function saveGameState(g) {
  if (!g) return;
  try {
    const m = g.gameMode || Arcade.state.get('gameMode') || 'campaign';
    const key = `gameState_${m}`;
    const serialized = serializeGame(g);
    Arcade.state.set(key, serialized);
    Arcade.state.set(GAME_STATE_KEY, serialized);
  } catch (e) {
    console.warn(`[${GAME_ID}] failed to persist game state`, e);
  }
}
function commitBestIfHigher(score) {
  const prev = loadBest();
  if (score > prev) {
    Arcade.state.set(BEST_KEY, score | 0);
    return true;
  }
  return false;
}
function clearGameState() {
  const m = Arcade.state.get('gameMode') || 'campaign';
  Arcade.state.remove(`gameState_${m}`);
  Arcade.state.remove(GAME_STATE_KEY);
}

// Migration sentinel: nothing to migrate yet, but acceptance §13 looks for
// arcade.v1.<gameId>._migrated.v1, and laying it down now means future
// schema bumps slot in cleanly.
Arcade.state.migrate('v1', () => { /* nothing yet */ });

// Initialize state keys and handle migrations
const legacySaved = Arcade.state.get(GAME_STATE_KEY);
if (!Arcade.state.get('gameMode')) {
  if (legacySaved && legacySaved.isPuzzleMode) {
    Arcade.state.set('gameMode', 'puzzle');
  } else if (Arcade.state.get('speedMode')) {
    Arcade.state.set('gameMode', 'speed');
  } else {
    Arcade.state.set('gameMode', 'campaign');
  }
}
const gameMode = Arcade.state.get('gameMode') || 'campaign';

// Migrate legacy progress to progress_campaign
const legacyProgress = Arcade.state.get(PROGRESS_KEY);
if (legacyProgress && !Arcade.state.get('progress_campaign')) {
  Arcade.state.set('progress_campaign', legacyProgress);
}

// Migrate legacy gameState to the specific mode's gameState key if it matches
if (legacySaved && !Arcade.state.get(`gameState_${gameMode}`)) {
  const isPuzzle = legacySaved.isPuzzleMode;
  const isSpeed = !!Arcade.state.get('speedMode');
  const matchedMode = isPuzzle ? 'puzzle' : isSpeed ? 'speed' : 'campaign';
  Arcade.state.set(`gameState_${matchedMode}`, legacySaved);
}

const saved = loadGameState(gameMode);

if (!Arcade.state.get('customStencilPack')) {
  Arcade.state.set('customStencilPack', Arcade.state.get('stencilPack') || 'bugs');
}
if (Arcade.state.get('fastLaunch') === undefined) {
  Arcade.state.set('fastLaunch', false);
}

const initialLevel = (() => {
  if (saved && saved.level) return saved.level | 0;
  return loadProgressLevel(gameMode);
})();
const initialConfig = levelConfig(initialLevel);
if (initialConfig) {
  if (gameMode === 'campaign') {
    Arcade.state.set('stencilPack', initialConfig.stencilPack);
    Arcade.state.set('speedMode', initialConfig.isSpeedMode);
  } else if (gameMode === 'zen') {
    Arcade.state.set('stencilPack', Arcade.state.get('customStencilPack') || 'bugs');
    Arcade.state.set('speedMode', false);
  } else if (gameMode === 'speed') {
    Arcade.state.set('stencilPack', Arcade.state.get('customStencilPack') || 'bugs');
    Arcade.state.set('speedMode', true);
  }
}

try {
  await Promise.all([loadLanterns(), loadBambooSprites(), loadMoonTexture(), loadHarnessSprite()]);
} catch (e) {
  console.warn(`[${GAME_ID}] sprite load failed — falling back`, e);
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

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
let wasMenuOpen = false;
// Last pointer activity timestamp. While this is recent, the rAF loop keeps
// running so ambient animations (star twinkle, moon halo breath, slow moon
// traverse) play under the player's fingers. After INTERACTION_TAIL_MS of
// quiet — and only if gameplay/effects/HUD tweens are all settled — the loop
// stops scheduling frames at all, dropping the canvas's CPU/GPU load to zero
// until something happens.
const INTERACTION_TAIL_MS = 1200;
let lastInteractionMs = 0;
let lastFrameTimeMs = performance.now();

// Touch-primary devices target ~30fps instead of the browser's default 60fps
// rAF cadence. The rAF callback still fires every screen refresh, but most
// ticks return early without stepping or drawing — halving GPU/CPU work on
// phones for an animation-quality tradeoff that's near-invisible at arm's
// length. The -1ms slack ensures refreshes that land just under the boundary
// still count toward the next render.
const targetFrameMs = () => (PERF_MODE ? 33 : 0);
let lastFrameMs = 0;

// Any phase except FLYING carries a fully resolved game state we can resume
// from. FLYING is the only transient one (live projectile trajectory isn't
// serialized); SETTLING/DESCENDING run only visual anims on top of an
// already-updated board, so saving there means a mid-anim refresh still
// keeps the just-landed shot.
function isResumablePhase(p) {
  return p !== PHASE.FLYING && p !== PHASE.DROWNING;
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

function resetEnvAndMoonOverrides() {
  ENV_PARAMS.windSpeed = 0.0;
  ENV_PARAMS.windFrequency = 1.0;
  ENV_PARAMS.glowIntensity = 1.0;
  ENV_PARAMS.rippleSpeedScale = 1.0;
  MOON_OVERRIDE.phase = -1;
  MOON_OVERRIDE.position = -1;
}

function startGame(g) {
  game = g;
  lastPhase = null;
  if (game.board && layout) syncLanternPixels(game.board, layout);

  // Apply look & feel parameters
  resetEnvAndMoonOverrides();
  if (game.isPuzzleMode) {
    const pz = puzzleConfig(game.puzzleId);
    if (pz.env) {
      if (pz.env.windSpeed !== undefined) ENV_PARAMS.windSpeed = pz.env.windSpeed;
      if (pz.env.windFrequency !== undefined) ENV_PARAMS.windFrequency = pz.env.windFrequency;
      if (pz.env.glowIntensity !== undefined) ENV_PARAMS.glowIntensity = pz.env.glowIntensity;
      if (pz.env.rippleSpeedScale !== undefined) ENV_PARAMS.rippleSpeedScale = pz.env.rippleSpeedScale;
    }
    if (pz.moon) {
      if (pz.moon.phase !== undefined) MOON_OVERRIDE.phase = pz.moon.phase;
      if (pz.moon.position !== undefined) MOON_OVERRIDE.position = pz.moon.position;
    }
  }

  saveGameState(game);
  lastPhase = game.phase;

  if (typeof window !== 'undefined') {
    window.game = game;
  }
}

function readSettings() {
  return {
    fontScale:     Arcade.settings.fontScale(),
    reducedMotion: Arcade.settings.reducedMotion(),
    handedness:    (Arcade.settings && typeof Arcade.settings.handedness === 'function') ? Arcade.settings.handedness() : 'right',
    bestScore,
    playerName,
  };
}
let settings = readSettings();

// Cached menu inputs. The Records panel reads from these without going back
// to localStorage every frame — they're refreshed when the menu opens and
// after recordOutcome. Same defaults as the on-disk stats so the panel never
// renders against a partial shape.
let cachedStats  = Arcade.stats.getOrInit(STATS_KEY, STATS_DEFAULTS);
let cachedScores = Arcade.scores.list(SCORES_CATEGORY, { limit: 10 });
function refreshMenuData() {
  cachedStats  = Arcade.stats.getOrInit(STATS_KEY, STATS_DEFAULTS);
  cachedScores = Arcade.scores.list(SCORES_CATEGORY, { limit: 10 });
}

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
  const gameMode = Arcade.state.get('gameMode') || 'campaign';
  const saved = loadGameState(gameMode);
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
    if (gameMode === 'puzzle') {
      startGame(createGame({ layout, isPuzzleMode: true, puzzleId: loadProgressLevel('puzzle'), gameMode: 'puzzle' }));
    } else {
      startGame(createGame({ layout, level: loadProgressLevel(gameMode), gameMode }));
    }
  }
  resetHudState(game.score, bestScore);
}

function resize() {
  const dpr = getEffectiveDpr();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const prevLayout = layout;
  layout = computeLayout(w, h);
  layout.handedness = SYSTEM_OVERRIDES.handedness !== 'default'
    ? SYSTEM_OVERRIDES.handedness
    : (settings ? settings.handedness : 'right');
  if (!game) {
    bootstrapGame();
    return;
  }
  // Live game: re-derive pixel positions under the new layout. Lanterns own
  // their normalized (nx, ny); the in-flight shots use prev→next remapping
  // since they are transient and aren't normalized.
  syncLanternPixels(game.board, layout);
  if (game.shots && game.shots.length > 0) {
    for (const shot of game.shots) {
      remapShotToLayout(shot, prevLayout, layout);
    }
  }
}

// On stage transition we save the new resume point — eviction or a refresh
// after this point will restore the player to the new stage.
async function loadAndStartLevel(level, keepCurrentSettings = false) {
  if (game) {
    game.loading = true;
    game.endOverlayDismissed = true;
    forceRequestFrame();
  }
  const cfg = levelConfig(level);
  const gameMode = Arcade.state.get('gameMode') || 'campaign';
  
  let activePack = 'bugs';
  if (gameMode === 'campaign') {
    activePack = cfg.stencilPack;
    Arcade.state.set('speedMode', cfg.isSpeedMode);
  } else {
    // zen or speed
    activePack = Arcade.state.get('customStencilPack') || 'bugs';
    Arcade.state.set('speedMode', gameMode === 'speed');
  }

  if (!keepCurrentSettings) {
    await changeStencilPack(activePack);
  } else {
    await loadLanterns();
  }
  
  startGame(createGame({ layout, level, gameMode }));
  saveProgress(game);
  resetHudState(0, bestScore);
  refreshMenuData();
  forceRequestFrame();
}

async function loadAndStartPuzzle(puzzleId) {
  if (game) {
    game.loading = true;
    game.endOverlayDismissed = true;
    forceRequestFrame();
  }
  const id = Math.max(1, Math.min(50, puzzleId | 0));
  const cfg = puzzleConfig(id);
  
  // Automatically switch gameMode to puzzle
  Arcade.state.set('gameMode', 'puzzle');
  
  if (cfg.stencilPack) {
    await changeStencilPack(cfg.stencilPack);
  } else {
    await loadLanterns();
  }
  startGame(createGame({ layout, isPuzzleMode: true, puzzleId: id, gameMode: 'puzzle' }));
  saveProgress(game);
  resetHudState(0, bestScore);
  refreshMenuData();
  forceRequestFrame();
}

function nextLevel() {
  recordOutcome(game, /*won=*/true);
  if (game.isPuzzleMode) {
    loadAndStartPuzzle(game.puzzleId + 1);
  } else {
    loadAndStartLevel(game.level + 1);
  }
}
function restartLevel() {
  recordOutcome(game, /*won=*/false);
  if (game.isPuzzleMode) {
    loadAndStartPuzzle(game.puzzleId);
  } else {
    loadAndStartLevel(game.level);
  }
}
// Menu-driven stage switch. Treated as a deliberate revisit rather than a
// run abandonment, so we don't record an outcome against the current game —
// the player isn't trying to win, they're choosing where to play.
function startLevel(level) {
  const currentMode = Arcade.state.get('gameMode') || 'campaign';
  if (currentMode === 'puzzle') {
    Arcade.state.set('gameMode', 'campaign');
  }
  loadAndStartLevel(Math.max(1, level | 0));
}

// End-of-stage bookkeeping: leaderboard entry, stats update, best-score
// promotion, and a celebratory toast when the player sets a new personal best.
function recordOutcome(g, won) {
  if (!g || g.score <= 0) return;
  const score = g.score | 0;

  if (g.isPuzzleMode) {
    Arcade.scores.add(SCORES_CATEGORY, {
      score,
      meta: { puzzleId: g.puzzleId, won, combo: g.bestCombo | 0, isPuzzleMode: true },
    });
    const nowMs = sessionTimer.elapsedMs();
    const playDelta = Math.max(0, nowMs - lastReportedMs);
    lastReportedMs = nowMs;
    Arcade.stats.update(STATS_KEY, (prev) => {
      const s = { ...STATS_DEFAULTS, ...(prev || {}) };
      s.totalPlayMs += playDelta | 0;
      s.totalPops   += g.counts.popped  | 0;
      s.totalDrops  += g.counts.dropped | 0;

      if (!s.puzzles) s.puzzles = {};
      const pzKey = String(g.puzzleId);
      const cur = s.puzzles[pzKey] || { bestScore: 0, cleared: false, plays: 0 };
      s.puzzles[pzKey] = {
        bestScore: Math.max(cur.bestScore | 0, score),
        cleared:   cur.cleared || won,
        plays:     (cur.plays | 0) + 1,
      };
      return s;
    });
  } else {
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
      // Per-stage rollup. cleared sticks once set (replaying a cleared stage
      // never unclears it); bestScore is the high water-mark for that stage.
      const lvKey = String(g.level | 0);
      const levels = { ...(s.levels || {}) };
      const cur = levels[lvKey] || { bestScore: 0, cleared: false, plays: 0 };
      levels[lvKey] = {
        bestScore: Math.max(cur.bestScore | 0, score),
        cleared:   cur.cleared || won,
        plays:     (cur.plays | 0) + 1,
      };
      s.levels = levels;
      return s;
    });
  }

  const wasBest = commitBestIfHigher(score);
  if (wasBest) {
    bestScore = score;
    settings = readSettings();
    Arcade.ui.toast(`new best — ${score.toLocaleString('en-US')}`, { kind: 'success' });
  }
}

function isQuiescent() {
  if (!game || !layout) return false;
  if (game.loading) return false;
  if (game.showModeIntroCard) return false;
  if (game.isPuzzleMode && game.queue.current === null && game.phase !== PHASE.WIN && game.phase !== PHASE.GAME_OVER) return false;
  if (isMenuPanelOpen()) {
    if (!isMenuSettled()) return false;
    return true;
  }
  if (game.isSpeedMode && game.phase === PHASE.AIMING) return false;
  if (game.shots && game.shots.length > 0) return false;
  if (performance.now() - lastInteractionMs < INTERACTION_TAIL_MS) return false;
  if (game.phase !== PHASE.AIMING) return false;
  if (hasActiveEffects(game)) return false;
  if (!isHudSettled(game)) return false;
  // Menu fade in/out needs the loop alive — fade tween is view-only state outside the game model.
  if (!isMenuSettled()) return false;
  return true;
}

function frame(now) {
  lastFrameTimeMs = performance.now();
  if (suspended || !layout) { rafId = 0; return; }
  const limitMs = targetFrameMs();
  if (limitMs && (now - lastFrameMs) < limitMs - 1) {
    rafId = requestAnimationFrame(frame);
    return;
  }
  lastFrameMs = now;
  const dt = lastTime === 0 ? 0 : Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const menuOpen = isMenuPanelOpen();
  const phaseAnimating =
    game.phase === PHASE.FLYING ||
    game.phase === PHASE.DESCENDING ||
    game.phase === PHASE.SETTLING ||
    game.phase === PHASE.DROWNING;
  const shotsInFlight = game.shots && game.shots.length > 0;
  const needsStep = phaseAnimating || shotsInFlight || hasActiveEffects(game) || (game.isSpeedMode && game.phase === PHASE.AIMING) || (game.isPuzzleMode && game.queue.current === null && game.phase === PHASE.AIMING);
  if (!menuOpen && needsStep) {
    step(game, dt, layout);
  }
  maybePersistOnPhaseChange();
  tickMenu(settings);
  // Always render while the loop is alive: HUD counter tween, combo dots,
  // and moon halo respond to view-only state that lives outside
  // hasActiveEffects(). Once everything settles, isQuiescent() pulls the loop
  // off the scheduler entirely until requestFrame() wakes it up.
  render(ctx, layout, game, settings, cachedStats, cachedScores);

  if (isQuiescent()) {
    rafId = 0;
    lastTime = 0;
  } else {
    rafId = requestAnimationFrame(frame);
  }
}

// Wake the rAF loop. Idempotent — safe to call from any input/lifecycle
// callback. Anything that mutates view-relevant state while the loop is
// asleep MUST call this so the change is actually drawn.
function requestFrame() {
  if (suspended) return;
  if (rafId) {
    if (performance.now() - lastFrameTimeMs > 500) {
      console.warn(`[${GAME_ID}] rAF loop appears stuck (rafId=${rafId}, last frame ${Math.round(performance.now() - lastFrameTimeMs)}ms ago). Forcing wake-up.`);
      forceRequestFrame();
    }
    return;
  }
  lastTime = 0;
  rafId = requestAnimationFrame(frame);
}

// Force-wake the rAF loop, cancelling any potentially stale or discarded
// requestAnimationFrame ID from the browser before scheduling a new one.
// Essential for resuming reliably after device locks / tab suspensions.
function forceRequestFrame() {
  if (suspended) return;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  lastTime = 0;
  rafId = requestAnimationFrame(frame);
}

function bumpInteraction() {
  lastInteractionMs = performance.now();
  requestFrame();
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
function stopLoop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  lastTime = 0;
}

Arcade.onSuspend(() => {
  suspended = true;
  stopLoop();
  flushPersist();
});
Arcade.onResume(() => {
  suspended = false;
  forceRequestFrame();
});
window.addEventListener('pagehide', () => {
  flushPersist();
  stopLoop();
});
// Tell the OS we're cooperative when the tab/iframe goes hidden: cancel the
// rAF outright rather than relying on the browser's hidden-tab throttle, and
// wake the loop the moment we're visible again. (Browsers already throttle
// rAF in hidden tabs, but explicitly cancelling drops us off the animation
// budget entirely and lets the system schedule other work.)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    flushPersist();
    stopLoop();
  } else {
    suspended = false;
    forceRequestFrame();
  }
});

window.addEventListener('pageshow', () => {
  suspended = false;
  forceRequestFrame();
});

window.addEventListener('focus', () => {
  suspended = false;
  forceRequestFrame();
});

// When the launcher imports a save, re-hydrate in place. Reset HUD tween
// state so the new score doesn't appear to "count down" from the old one.
Arcade.onStateReplaced(() => {
  bestScore = loadBest();
  playerName = Arcade.player.name() || '';
  bootstrapGame();
  settings = readSettings();
  resetHudState(game.score, bestScore);
  refreshMenuData();
  closeMenu();
  Arcade.ui.toast('save loaded', { kind: 'info' });
  forceRequestFrame();
});

Arcade.onSettingsChange(() => {
  settings = readSettings();
  if (layout) {
    layout.handedness = SYSTEM_OVERRIDES.handedness !== 'default'
      ? SYSTEM_OVERRIDES.handedness
      : settings.handedness;
  }
  requestFrame();
});

window.addEventListener('resize', () => { resize(); requestFrame(); });
attachInput(canvas, () => game, () => layout, {
  onWinClick: nextLevel,
  onLossClick: restartLevel,
  onPrevClick: () => {
    const won = game.phase === PHASE.WIN;
    recordOutcome(game, won);
    openMenuToLevelSelector(game);
  },
  onRestartClick: () => {
    const won = game.phase === PHASE.WIN;
    recordOutcome(game, won);
    if (game.isPuzzleMode) {
      loadAndStartPuzzle(game.puzzleId);
    } else {
      loadAndStartLevel(game.level);
    }
  },
  onNextClick: () => {
    const won = game.phase === PHASE.WIN;
    recordOutcome(game, won);
    if (game.isPuzzleMode) {
      loadAndStartPuzzle(game.puzzleId + 1);
    } else {
      loadAndStartLevel(game.level + 1);
    }
  },
  onDismissClick: () => {
    game.endOverlayDismissed = true;
    saveGameState(game);
    requestFrame();
  },
  onRestoreClick: () => {
    game.endOverlayDismissed = false;
    saveGameState(game);
    requestFrame();
  },
  onInteract: bumpInteraction,
  onStartLevel: startLevel,
  onStartPuzzle: loadAndStartPuzzle,
  onChangeGameMode: (mode) => {
    let msg = 'Campaign mode active';
    if (mode === 'zen') msg = 'Zen mode active — untimed';
    else if (mode === 'speed') msg = 'Speed mode active — timed';
    else if (mode === 'puzzle') msg = 'Puzzle mode active — teasers';
    
    Arcade.ui.toast(msg, { kind: 'info' });
    
    if (mode === 'puzzle') {
      const puzzleId = loadProgressLevel('puzzle');
      loadAndStartPuzzle(puzzleId);
    } else {
      const lvl = loadProgressLevel(mode);
      loadAndStartLevel(lvl);
    }
  },
  onToggleFastLaunch: (active) => {
    Arcade.ui.toast(active ? 'Fast launch enabled' : 'Fast launch disabled', { kind: 'info' });
    restartLevel();
  },
  // Menu open/close needs to wake the rAF loop so the fade tween + panel
  // body actually draw. Also refresh the cached leaderboard/stats on every
  // open so the panel reflects the latest run without a reload.
  onMenuChange: () => {
    const isMenuOpenNow = isMenuPanelOpen();
    if (isMenuOpenNow && !wasMenuOpen) {
      refreshMenuData();
    }
    wasMenuOpen = isMenuOpenNow;

    if (game && game.stencilPack === 'random') {
      for (const l of game.board.lanterns) {
        if (!l.designId) {
          l.designId = getRandomDesignForColor(l.color, game.rng);
        }
      }
      if (game.queue) {
        if (!game.queue.currentDesign) game.queue.currentDesign = getRandomDesignForColor(game.queue.current, game.rng);
        if (!game.queue.nextDesign) game.queue.nextDesign = getRandomDesignForColor(game.queue.next, game.rng);
        if (!game.queue.afterNextDesign) game.queue.afterNextDesign = getRandomDesignForColor(game.queue.afterNext, game.rng);
      }
    }
    requestFrame();
  },
});
window.triggerAdminUpdate = () => {
  settings = readSettings();
  setPerfModeOverride(SYSTEM_OVERRIDES.perfMode);
  if (layout) {
    layout.handedness = SYSTEM_OVERRIDES.handedness !== 'default'
      ? SYSTEM_OVERRIDES.handedness
      : settings.handedness;
  }
  resize();
  forceRequestFrame();
};

initAdminPanel();
resize();
requestFrame();

console.info(`[${GAME_ID}] M5 pressure+win/loss ready — framed=${Arcade.context.framed}`);
