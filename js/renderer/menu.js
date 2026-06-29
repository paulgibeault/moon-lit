// Themed in-canvas menu: a small bamboo-segment button in the top strip
// opens a translucent panel offering three destinations — Stages (level
// picker), Records (leaderboard + lifetime stats), and Continue (close).
//
// State lives in this module (mirrors hud.js's hudState pattern). Each draw
// rebuilds `hits[]` so hitTestPointer can resolve taps against exactly what
// the player sees. Animation: a single 0→1 fade drives both the dim backdrop
// and panel opacity; reduced motion snaps. The fade is included in
// isMenuSettled so main.js's rAF idle check waits for it to land.

import { PALETTE, COLORS, COLOR_KEYS, LEVELS, levelConfig, PERF_CONFIG } from '../constants.js';
import {
  SERIF, SANS, HUD_OPACITY, hexToRgba, fontScaleOf, PERF_MODE,
} from './style.js';
import { STENCIL_PACKS } from '../stencil-packs.js';
import { changeStencilPack } from '../assets.js';
import { puzzleConfig, PUZZLE_COUNT } from '../puzzles.js';
import {
  exploreState, ensureExplore, shuffleBoard, shuffleSettings, setSeeds, setOverride, loadSeedHistory,
  effectiveConfig,
} from '../seed-explore.js';
import { SEED_PATTERNS } from '../seed-pattern.js';
import { loadTelemetry } from '../telemetry.js';
import { seedTierMap, seedKey, difficultyRating, fairnessLabel } from '../difficulty.js';

const PANEL_BG    = 'rgba(20, 26, 50, 0.94)';
const SCRIM_BG    = 'rgba(10, 15, 34, 0.62)';
const BORDER      = `rgba(232, 183, 112, 0.32)`;   // PALETTE.moonHalo @ 32%
const BORDER_SOFT = `rgba(232, 183, 112, 0.18)`;
const RULE        = `rgba(232, 183, 112, 0.16)`;
const CREAM       = PALETTE.moon;
const GOLD        = PALETTE.moonHalo;
const EMBER       = '#e0796b';   // warm danger tint — flags a lost-cause seed

// Intrinsic-difficulty badge palette, easiest → hardest. Keyed by the tier
// names from js/difficulty.js. A calm green ramps to deep orange; lost-cause
// (an OUTCOME, not a difficulty) stays the separate EMBER accent above.
const DIFFICULTY_BADGE = {
  gentle: { label: 'Gentle', color: '#86c98f' },
  easy:   { label: 'Easy',   color: '#b6d27a' },
  medium: { label: 'Medium', color: '#e6c267' },
  hard:   { label: 'Hard',   color: '#e29a55' },
  expert: { label: 'Expert', color: '#dd7a5a' },
};

const menuState = {
  panel: 'hidden',     // 'hidden' | 'root' | 'records' | 'stages' | 'puzzles' | 'options' | 'explore' | 'seeds' | 'seed-detail'
  detailSeed: null,    // the seed-history entry the 'seed-detail' panel describes
  fade: 0,             // 0..1
  fadeTarget: 0,
  hits: [],            // [{x, y, w, h, action, value}]
  // Rebuilt every draw — geometry the input layer reads.
  buttonRect: null,
  cardRect: null,      // Bounding box of the active card

  // Scrolling state
  scrollY: 0,
  isDragging: false,
  dragStartY: 0,
  dragStartScrollY: 0,
  dragMoved: false,
  maxScrollY: 0,
  viewportY: 0,
  viewportH: 0,
  pointerDownActive: false,
  cameFromRoot: false,
};

if (typeof window !== 'undefined') {
  window.menuState = menuState;
}

export function isMenuOpen() {
  return menuState.panel !== 'hidden' || menuState.fade > 0;
}
export function isMenuPanelOpen() {
  return menuState.panel !== 'hidden';
}
export function isMenuSettled() {
  return menuState.fade === menuState.fadeTarget;
}

export function openMenu() {
  menuState.panel = 'root';
  menuState.fadeTarget = 1;
  menuState.scrollY = 0;
  menuState.isDragging = false;
  menuState.needsScrollToCurrent = false;
  menuState.cameFromRoot = false;
}
export function closeMenu() {
  menuState.fadeTarget = 0;
}
export function setMenuPanel(panel) {
  if (panel === 'hidden') { closeMenu(); return; }
  if (menuState.panel === 'root') {
    menuState.cameFromRoot = true;
  }
  menuState.panel = panel;
  menuState.fadeTarget = 1;
  menuState.scrollY = 0;
  menuState.isDragging = false;
  menuState.needsScrollToCurrent = false;
}
export function openMenuToLevelSelector(game) {
  const isPuzzle = !!game?.isPuzzleMode;
  menuState.panel = isPuzzle ? 'puzzles' : 'stages';
  menuState.fadeTarget = 1;
  menuState.isDragging = false;
  menuState.needsScrollToCurrent = true;
  menuState.cameFromRoot = false;
}
// Seed Explorer: jump straight to the build screen (variant mining) or the
// completed-variant history. ensureExplore() guarantees a candidate to preview.
export function openMenuToExplore() {
  ensureExplore();
  menuState.panel = 'explore';
  menuState.fadeTarget = 1;
  menuState.scrollY = 0;
  menuState.isDragging = false;
  menuState.cameFromRoot = false;
  menuState.explorePicker = null;   // no setting picker open
}
export function openMenuToSeeds() {
  menuState.panel = 'seeds';
  menuState.fadeTarget = 1;
  menuState.scrollY = 0;
  menuState.isDragging = false;
  menuState.needsScrollToCurrent = false;
  menuState.cameFromRoot = false;
}

// Per-frame tick. Easing is a fixed step per call — main.js drives this from
// the rAF loop, so it scales naturally with frame cadence (60fps vs 30fps
// PERF_MODE). Reduced motion snaps to the target.
export function tickMenu(settings) {
  const reduced = !!(settings && settings.reducedMotion);
  if (reduced) {
    menuState.fade = menuState.fadeTarget;
  } else {
    const step = 0.25;
    if (menuState.fade < menuState.fadeTarget) {
      menuState.fade = Math.min(1, menuState.fade + step);
    } else if (menuState.fade > menuState.fadeTarget) {
      menuState.fade = Math.max(0, menuState.fade - step);
    }
  }
  if (menuState.fade === 0 && menuState.fadeTarget === 0 && menuState.panel !== 'hidden') {
    menuState.panel = 'hidden';
  }
}

export function handleMenuPointerDown(x, y, clientY) {
  const btn = menuState.buttonRect;
  if (btn && pointIn(x, y, btn)) {
    if (isMenuPanelOpen()) closeMenu();
    else openMenu();
    menuState.pointerDownActive = true;
    return true;
  }
  if (!isMenuPanelOpen() || menuState.fadeTarget === 0) {
    menuState.pointerDownActive = false;
    return false;
  }

  const card = menuState.cardRect;
  // If we press outside the card, it is a scrim click, so don't drag-scroll
  if (card && !pointIn(x, y, card)) {
    menuState.pointerDownActive = true;
    return true;
  }

  // Start drag scroll
  menuState.isDragging = true;
  menuState.dragStartY = clientY;
  menuState.dragStartScrollY = menuState.scrollY;
  menuState.dragMoved = false;
  menuState.pointerDownActive = true;
  return true;
}

export function handleMenuPointerMove(x, y, clientY) {
  if (!isMenuPanelOpen() || menuState.fadeTarget === 0) return false;

  if (menuState.isDragging) {
    const deltaY = clientY - menuState.dragStartY;
    if (Math.abs(deltaY) > 8) {
      menuState.dragMoved = true;
    }
    menuState.scrollY = Math.max(0, Math.min(menuState.maxScrollY, menuState.dragStartScrollY - deltaY));
    return true;
  }
  return false;
}

// Mouse-wheel / trackpad scroll for the active list (a two-finger trackpad
// swipe arrives here as wheel deltas). Returns true if it actually scrolled.
export function handleMenuWheel(deltaY) {
  if (!isMenuPanelOpen() || menuState.fadeTarget === 0) return false;
  if (menuState.maxScrollY <= 0) return false;
  const before = menuState.scrollY;
  menuState.scrollY = Math.max(0, Math.min(menuState.maxScrollY, menuState.scrollY + deltaY));
  return menuState.scrollY !== before;
}

// Re-anchor an in-progress drag to a new pointer centroid without moving the
// list — used when a finger lifts or lands during a two-finger scroll so the
// list doesn't jump as the average touch point shifts.
export function rebaseMenuDrag(clientY) {
  if (!menuState.isDragging) return;
  menuState.dragStartY = clientY;
  menuState.dragStartScrollY = menuState.scrollY;
}

export function handleMenuPointerUp(x, y, actions, game) {
  if (!isMenuPanelOpen() || menuState.fadeTarget === 0) return false;
  if (!menuState.pointerDownActive) return false;
  menuState.pointerDownActive = false;

  const btn = menuState.buttonRect;
  if (btn && pointIn(x, y, btn)) {
    return true;
  }

  if (menuState.isDragging) {
    menuState.isDragging = false;
    if (menuState.dragMoved) {
      return true; // consumed as scroll drag, no click
    }
  }

  const handleClose = () => {
    closeMenu();
    const targetMode = Arcade.state.get('gameMode') || 'campaign';
    const currentIsPuzzle = !!game?.isPuzzleMode;
    const currentMode = game?.gameMode || (currentIsPuzzle ? 'puzzle' : 'campaign');
    if (currentMode !== targetMode) {
      actions?.onChangeGameMode?.(targetMode);
    } else {
      actions?.onResume?.();
    }
  };

  const handleDismiss = () => {
    closeMenu();
    const currentIsPuzzle = !!game?.isPuzzleMode;
    const currentMode = game?.gameMode || (currentIsPuzzle ? 'puzzle' : 'campaign');
    Arcade.state.set('gameMode', currentMode);
    actions?.onResume?.();
  };

  // Check buttons / hits
  for (const h of menuState.hits) {
    if (!pointIn(x, y, h)) continue;
    switch (h.action) {
      case 'show-root': {
        if (menuState.cameFromRoot) {
          setMenuPanel('root');
        } else {
          handleDismiss();
        }
        return true;
      }
      case 'show-stages':  setMenuPanel('stages'); return true;
      case 'show-puzzles': setMenuPanel('puzzles'); return true;
      case 'show-options': setMenuPanel('options'); return true;
      case 'show-records': setMenuPanel('records'); return true;
      case 'show-explore': { ensureExplore(); setMenuPanel('explore'); actions?.onInteract?.(); return true; }
      case 'show-seeds':   setMenuPanel('seeds'); return true;
      case 'shuffle-board':    { shuffleBoard(); actions?.onInteract?.(); return true; }
      case 'shuffle-settings': { menuState.explorePicker = null; shuffleSettings(); actions?.onInteract?.(); return true; }
      case 'explore-pick-field':  { menuState.explorePicker = h.value; actions?.onInteract?.(); return true; }
      case 'explore-set-option':  { setOverride(h.value.field, h.value.value); menuState.explorePicker = null; actions?.onInteract?.(); return true; }
      case 'explore-close-picker': { menuState.explorePicker = null; actions?.onInteract?.(); return true; }
      case 'seed-play':        { closeMenu(); actions?.onStartSeed?.(); return true; }
      case 'seed-manual-settings':
      case 'seed-manual-board': {
        // Manual seed entry. Canvas has no DOM inputs, so prompt() for v1.
        const isBoard = h.action === 'seed-manual-board';
        const cur = isBoard ? exploreState.boardSeed : exploreState.settingsSeed;
        const raw = (typeof window !== 'undefined' && window.prompt)
          ? window.prompt(`Enter ${isBoard ? 'board' : 'settings'} seed (number):`, String(cur >>> 0))
          : null;
        if (raw != null) {
          const n = parseInt(String(raw).trim(), 10);
          if (Number.isFinite(n)) {
            if (isBoard) setSeeds(exploreState.settingsSeed, n);
            else setSeeds(n, exploreState.boardSeed);
          }
        }
        actions?.onInteract?.();
        return true;
      }
      case 'pick-seed-history': { closeMenu(); actions?.onPickSeedHistory?.(h.value); return true; }
      case 'show-seed-detail': { menuState.detailSeed = h.value; setMenuPanel('seed-detail'); actions?.onInteract?.(); return true; }
      case 'seed-detail-play': { closeMenu(); actions?.onPickSeedHistory?.(menuState.detailSeed); return true; }
      case 'pick-stencil': {
        const gameMode = Arcade.state.get('gameMode') || 'campaign';
        if (gameMode === 'zen' || gameMode === 'speed') {
          Arcade.state.set('customStencilPack', h.value);
          changeStencilPack(h.value);
          actions?.onInteract?.(); // wakes up the draw loop instantly
        }
        return true;
      }
      case 'change-gamemode': {
        const targetMode = h.value;
        const currentMode = Arcade.state.get('gameMode') || 'campaign';
        if (currentMode !== targetMode) {
          Arcade.state.set('gameMode', targetMode);
          actions?.onInteract?.();
        }
        return true;
      }
      case 'toggle-fast-launch': {
        const current = !!Arcade.state.get('fastLaunch');
        const target = !current;
        Arcade.state.set('fastLaunch', target);
        actions?.onToggleFastLaunch?.(target);
        return true;
      }
      case 'close':        handleDismiss(); return true;
      case 'play-confirm': handleClose(); return true;
      case 'pick-stage':   closeMenu(); actions?.onStartLevel?.(h.value); return true;
      case 'pick-puzzle':  closeMenu(); actions?.onStartPuzzle?.(h.value); return true;
    }
  }

  // Tap fell inside the scrim but outside the card - dismiss
  const card = menuState.cardRect;
  if (card && !pointIn(x, y, card)) {
    handleDismiss();
    return true;
  }

  return true;
}

function pointIn(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// ─── Top-level draw ─────────────────────────────────────────────────────────

export function drawMenu(ctx, layout, game, settings, stats, scores) {
  menuState.hits.length = 0;
  drawMenuButton(ctx, layout, settings);
  if (menuState.fade <= 0 && menuState.panel === 'hidden') return;

  const fade = menuState.fade;
  ctx.save();
  ctx.fillStyle = scrimColor(fade);
  ctx.fillRect(0, 0, layout.viewW, layout.viewH);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = fade;
  if (menuState.panel === 'root')         drawRootPanel(ctx, layout, game, settings);
  else if (menuState.panel === 'records') drawRecordsPanel(ctx, layout, settings, stats, scores);
  else if (menuState.panel === 'stages')  drawStagesPanel(ctx, layout, game, settings, stats);
  else if (menuState.panel === 'puzzles') drawPuzzlesPanel(ctx, layout, game, settings, stats);
  else if (menuState.panel === 'options') drawOptionsPanel(ctx, layout, settings);
  else if (menuState.panel === 'explore') drawExplorePanel(ctx, layout, settings);
  else if (menuState.panel === 'seeds')   drawSeedsPanel(ctx, layout, game, settings);
  else if (menuState.panel === 'seed-detail') drawSeedDetailPanel(ctx, layout, game, settings);
  ctx.restore();
}

function scrimColor(fade) {
  // 0.62 is the full strength of the dim — fade it in/out smoothly with the
  // panel so opening doesn't snap the whole frame to a darker exposure.
  return `rgba(10, 15, 34, ${0.62 * fade})`;
}

// ─── Menu button ────────────────────────────────────────────────────────────

// Anchored to the left edge of the screen, same as the score panel, so the
// menu and score read as one cluster. The UI_SAFE_TOP_PX dead-zone in input.js keeps regular shots from
// firing here, and our own hitTest grabs taps on the button before they reach
// the game. The score HUD reserves matching room (MENU_RESERVE_PX) so it
// starts immediately after this button.
export const MENU_BUTTON_SIZE = 38;
export const MENU_RESERVE_PX = 12 + MENU_BUTTON_SIZE + 8;   // 58
function drawMenuButton(ctx, layout, settings) {
  const size = MENU_BUTTON_SIZE;
  const x = 12;
  const y = 8;
  menuState.buttonRect = { x, y, w: size, h: size };

  const cx = x + size / 2;
  const cy = y + size / 2;
  const open = isMenuPanelOpen();
  const glow = open ? 0.85 : 0.45;

  ctx.save();
  // Soft moon-halo halo behind the icon when open.
  if (glow > 0.5 && !(PERF_CONFIG.disableMobileShadows && PERF_MODE)) {
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 12;
  }
  // Three calligraphic strokes — short, long, medium — drawn as rounded
  // segments. The varying widths read as bamboo segments more than a generic
  // hamburger.
  ctx.strokeStyle = hexToRgba(CREAM, glow);
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.2;
  const widths = [10, 14, 12];
  const ys = [cy - 6, cy, cy + 6];
  for (let i = 0; i < 3; i++) {
    const w = widths[i];
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, ys[i]);
    ctx.lineTo(cx + w / 2, ys[i]);
    ctx.stroke();
  }
  // A tiny ember dot to the right of the middle stroke — small color note
  // that hints "more inside".
  ctx.fillStyle = hexToRgba(GOLD, glow + 0.1);
  ctx.beginPath();
  ctx.arc(cx + 9, cy, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─── Panels ─────────────────────────────────────────────────────────────────

// Layout helper: returns the centered card rect, given a max-width.
function cardRect(layout, maxW, maxH) {
  const margin = 16;
  const w = Math.min(maxW, layout.viewW - margin * 2);
  const h = Math.min(maxH, layout.viewH - margin * 2);
  const x = Math.round((layout.viewW - w) / 2);
  const y = Math.round((layout.viewH - h) / 2);
  return { x, y, w, h };
}

function drawCard(ctx, rect) {
  ctx.save();
  ctx.fillStyle = PANEL_BG;
  roundedRectPath(ctx, rect.x, rect.y, rect.w, rect.h, 12);
  ctx.fill();
  // Hairline gold border + a faint inner stroke for depth.
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = BORDER_SOFT;
  roundedRectPath(ctx, rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6, 10);
  ctx.stroke();
  ctx.restore();
}

// ── Reusable game-card primitives (shared by every mode's listing) ───────────
// A small filled pill naming the board's intrinsic difficulty tier. Returns its
// width so callers can lay out text after it. `ratingKey` is a DIFFICULTY_BADGE
// key; unknown keys draw nothing.
function drawDifficultyBadge(ctx, x, cy, ratingKey, fs, opts = {}) {
  const badge = DIFFICULTY_BADGE[ratingKey];
  if (!badge) return 0;
  const { alpha = 1, scale = 1 } = opts;
  const px = Math.round(8.5 * fs * scale);
  ctx.save();
  ctx.font = `700 ${px}px ${SANS}`;
  const label = badge.label.toUpperCase();
  const padX = Math.round(5 * fs * scale);
  const w = ctx.measureText(label).width + padX * 2;
  const h = Math.round(13 * fs * scale);
  ctx.fillStyle = hexToRgba(badge.color, 0.18 * alpha);
  roundedRectPath(ctx, x, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(badge.color, 0.55 * alpha);
  ctx.lineWidth = 1;
  roundedRectPath(ctx, x, cy - h / 2, w, h, h / 2);
  ctx.stroke();
  ctx.fillStyle = hexToRgba(badge.color, 0.95 * alpha);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + padX, cy + 0.5);
  ctx.restore();
  return w;
}

// A circled "i" affordance. Stateless — the caller registers the hit rect so
// tapping it can open a detail screen without stealing the row's play tap.
function drawInfoButton(ctx, cx, cy, r, color, alpha = 0.6) {
  ctx.save();
  ctx.strokeStyle = hexToRgba(color, alpha);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = hexToRgba(color, alpha + 0.15);
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.42, r * 0.16, 0, Math.PI * 2);   // dot of the i
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.22);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.12);
  ctx.lineTo(cx, cy + r * 0.45);                          // stem of the i
  ctx.stroke();
  ctx.restore();
}

function drawTitleBar(ctx, rect, title, opts = {}) {
  const { showBack = false, backAction = 'show-root' } = opts;
  const padX = 18;
  const titleY = rect.y + 18;
  const titlePx = 18;
  const fs = opts.fs || 1;

  ctx.save();
  // Small moon glyph or back-arrow on the left.
  if (showBack) {
    const bx = rect.x + padX;
    const by = titleY + 10;
    const back = { x: bx - 6, y: by - 14, w: 28, h: 28, action: backAction };
    menuState.hits.push(back);
    ctx.strokeStyle = hexToRgba(CREAM, 0.85);
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx + 8, by - 5);
    ctx.lineTo(bx, by + 1);
    ctx.lineTo(bx + 8, by + 7);
    ctx.stroke();
  } else {
    const cx = rect.x + padX + 6;
    const cy = titleY + 8;
    ctx.fillStyle = hexToRgba(CREAM, 0.92);
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = CREAM;
  ctx.font = `600 ${Math.round(titlePx * fs)}px ${SERIF}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(title, rect.x + padX + 22, titleY);

  // Close ✕ on the right.
  const closeR = { x: rect.x + rect.w - padX - 22, y: titleY - 6, w: 30, h: 30, action: 'close' };
  menuState.hits.push(closeR);
  const ccx = closeR.x + closeR.w / 2;
  const ccy = closeR.y + closeR.h / 2;
  ctx.strokeStyle = hexToRgba(CREAM, 0.7);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ccx - 6, ccy - 6); ctx.lineTo(ccx + 6, ccy + 6);
  ctx.moveTo(ccx + 6, ccy - 6); ctx.lineTo(ccx - 6, ccy + 6);
  ctx.stroke();

  // Gold hairline rule below title.
  const ruleY = titleY + Math.round(titlePx * fs) + 12;
  drawDashedRule(ctx, rect.x + padX, ruleY, rect.w - padX * 2);

  ctx.restore();
  return ruleY + 8;  // y-position to begin body
}

function drawDashedRule(ctx, x, y, w) {
  ctx.save();
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
  ctx.restore();
}

// ─── Root panel ─────────────────────────────────────────────────────────────

function drawRootPanel(ctx, layout, game, settings) {
  const fs = fontScaleOf(settings);
  const gameMode = Arcade.state.get('gameMode') || 'campaign';
  
  const currentIsPuzzle = !!game?.isPuzzleMode;
  const currentMode = game?.gameMode || (currentIsPuzzle ? 'puzzle' : 'campaign');
  const isSameMode = (gameMode === currentMode);

  let targetLevel = 1;
  if (isSameMode && game) {
    targetLevel = game.isPuzzleMode ? game.puzzleId : game.level;
  } else {
    const progress = Arcade.state.get('progress_' + gameMode);
    targetLevel = (progress && progress.level) | 0 || 1;
  }

  let playLabel = '';
  let playSub = '';
  const actionWord = isSameMode ? 'resume' : 'start';

  if (gameMode === 'puzzle') {
    playLabel = `Play Puzzle ${targetLevel}`;
    playSub = `${actionWord} puzzle ${targetLevel}`;
  } else if (gameMode !== 'seed') {
    playLabel = `Play Stage ${targetLevel}`;
    const modeName = gameMode === 'campaign' ? 'campaign' : gameMode === 'zen' ? 'zen' : 'speed';
    playSub = `${actionWord} ${modeName} stage ${targetLevel}`;
  }

  const items = [];
  // Seed mode has no "play current variant" shortcut — playing happens from the
  // Explore build screen instead.
  if (gameMode !== 'seed') {
    items.push({ label: playLabel, sub: playSub, action: 'play-confirm', glyph: 'play' });
  }
  if (gameMode === 'puzzle') {
    items.push({ label: 'Puzzles', sub: `${PUZZLE_COUNT} brain-teaser challenges`, action: 'show-puzzles', glyph: 'puzzles' });
  } else if (gameMode === 'seed') {
    items.push(
      { label: 'Explore', sub: 'mine new board & rule seeds', action: 'show-explore', glyph: 'explore' },
      { label: 'Seeds',   sub: 'your completed variants',     action: 'show-seeds',   glyph: 'records' }
    );
  } else {
    items.push({ label: 'Stages', sub: 'select or revisit a stage', action: 'show-stages', glyph: 'stages' });
  }

  // Options (art/launch config) don't apply to seed mode — its art comes from
  // the seeded variant, set on the Explore build screen.
  if (gameMode !== 'seed') {
    items.push({ label: 'Options', sub: 'configure art and launch', action: 'show-options', glyph: 'stencils' });
  }
  items.push({ label: 'Records', sub: 'lanterns lit, best scores', action: 'show-records', glyph: 'records' });

  const modeRows = Math.ceil(5 / 2);
  // Compute card height dynamically: title + mode selector + divider + items
  const cardH = Math.round((210 + (modeRows - 2) * (48 + 8) + items.length * 48) * fs);
  const rect = cardRect(layout, 320 * fs, cardH);
  menuState.cardRect = rect;
  drawCard(ctx, rect);
  const startY = drawTitleBar(ctx, rect, 'Moon Lit', { fs });

  const padX = 20;
  const innerW = rect.w - padX * 2;
  let y = startY + 6;

  // ─── Game Mode Grid (2 columns) ───
  y = drawSectionHeader(ctx, rect.x + padX, y, 'Game Mode', fs);

  const colW = Math.floor((innerW - 12) / 2);
  const colH = Math.round(48 * fs);

  const modeOpts = [
    { id: 'campaign', label: 'Campaign', sub: 'Default levels', glyph: 'stages' },
    { id: 'zen',      label: 'Zen',      sub: 'Classic play',   glyph: 'moon' },
    { id: 'speed',    label: 'Speed',    sub: 'Rapid fire',     glyph: 'speed' },
    { id: 'puzzle',   label: 'Puzzle',   sub: 'Teaser puzzles',  glyph: 'puzzles' },
    { id: 'seed',     label: 'Explore',  sub: 'Seed variants',   glyph: 'explore' }
  ];

  const modeStartY = y;
  for (let i = 0; i < modeOpts.length; i++) {
    const opt = modeOpts[i];
    const isSelected = (opt.id === gameMode);
    const rowIndex = Math.floor(i / 2);
    const colIndex = i % 2;
    const tx = rect.x + padX + colIndex * (colW + 12);
    const ty = modeStartY + rowIndex * (colH + 8);

    ctx.save();
    ctx.fillStyle = isSelected ? 'rgba(245, 233, 201, 0.08)' : 'rgba(245, 233, 201, 0.03)';
    roundedRectPath(ctx, tx, ty, colW, colH, 6);
    ctx.fill();

    ctx.strokeStyle = isSelected ? GOLD : hexToRgba(CREAM, 0.15);
    ctx.lineWidth = isSelected ? 1.4 : 1;
    ctx.stroke();

    const cx = tx + 14 * fs;
    const cy = ty + colH / 2;
    drawGlyph(ctx, opt.glyph, cx, cy);

    const titlePx = Math.round(11.5 * fs);
    const subPx = Math.round(8.5 * fs);

    ctx.fillStyle = CREAM;
    ctx.font = `600 ${titlePx}px ${SERIF}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(opt.label, tx + 26 * fs, ty + colH * 0.22);

    ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
    ctx.font = `400 ${subPx}px ${SERIF}`;
    ctx.fillText(opt.sub, tx + 26 * fs, ty + colH * 0.58);

    ctx.restore();

    menuState.hits.push({ x: tx, y: ty, w: colW, h: colH, action: 'change-gamemode', value: opt.id });
  }

  y += modeRows * colH + (modeRows - 1) * 8 + 10;
  drawDashedRule(ctx, rect.x + padX, y, innerW);
  y += 10;

  // ─── Menu Items ───
  const rowH = Math.round(44 * fs);
  for (const it of items) {
    drawMenuRow(ctx, rect.x + padX, y, rect.w - padX * 2, rowH, it, settings);
    menuState.hits.push({ x: rect.x + padX, y, w: rect.w - padX * 2, h: rowH, action: it.action });
    y += rowH + 4;
  }
}

function drawMenuRow(ctx, x, y, w, h, item, settings) {
  const fs = fontScaleOf(settings);
  ctx.save();
  // Hairline tile to give a tap target footprint.
  ctx.fillStyle = 'rgba(245, 233, 201, 0.04)';
  roundedRectPath(ctx, x, y, w, h, 8);
  ctx.fill();

  // Glyph on the left.
  const gx = x + 22;
  const gy = y + h / 2;
  drawGlyph(ctx, item.glyph, gx, gy);

  // Title + subtitle.
  const titlePx = Math.round(15 * fs);
  const subPx = Math.round(11 * fs);
  ctx.fillStyle = CREAM;
  ctx.font = `500 ${titlePx}px ${SERIF}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(item.label, x + 46, y + h * 0.42);
  ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
  ctx.font = `400 ${subPx}px ${SERIF}`;
  ctx.fillText(item.sub, x + 46, y + h * 0.72);

  // Chevron on the right.
  ctx.strokeStyle = hexToRgba(CREAM, 0.55);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  const cx = x + w - 20;
  const cy = y + h / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy - 5);
  ctx.lineTo(cx + 2, cy);
  ctx.lineTo(cx - 4, cy + 5);
  ctx.stroke();
  ctx.restore();
}

function drawGlyph(ctx, kind, cx, cy) {
  ctx.save();
  switch (kind) {
    case 'stages': {
      // 2×2 tile cluster — schematic of the grid.
      ctx.strokeStyle = hexToRgba(GOLD, 0.9);
      ctx.lineWidth = 1.4;
      const s = 5;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          roundedRectPath(ctx, cx - s - 1 + i * (s + 2), cy - s - 1 + j * (s + 2), s, s, 1.5);
          ctx.stroke();
        }
      }
      break;
    }
    case 'puzzles': {
      // Draw a cute puzzle grid representation
      ctx.strokeStyle = hexToRgba(GOLD, 0.9);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.rect(cx - 5, cy - 5, 10, 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy);
      ctx.lineTo(cx + 5, cy);
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx, cy + 5);
      ctx.stroke();
      break;
    }
    case 'stencils': {
      // Small painter palette/outline glyph for art selection
      ctx.strokeStyle = hexToRgba(GOLD, 0.9);
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Handle / Brush
      ctx.moveTo(cx - 5, cy + 5);
      ctx.lineTo(cx + 1, cy - 1);
      ctx.lineTo(cx + 4, cy - 4);
      ctx.lineTo(cx + 6, cy - 3);
      ctx.lineTo(cx + 3, cy + 0);
      ctx.lineTo(cx - 5, cy + 5);
      ctx.stroke();

      ctx.fillStyle = hexToRgba(GOLD, 0.85);
      ctx.beginPath();
      ctx.arc(cx + 4, cy + 4, 1.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'records': {
      // Three rising bars + a star above — leaderboard signal.
      ctx.fillStyle = hexToRgba(GOLD, 0.85);
      for (let i = 0; i < 3; i++) {
        const bw = 3;
        const bh = 4 + i * 2;
        const bx = cx - 6 + i * 5;
        ctx.fillRect(bx, cy + 6 - bh, bw, bh);
      }
      drawStar(ctx, cx + 6, cy - 5, 2.5, hexToRgba(CREAM, 0.95));
      break;
    }
    case 'speed': {
      // Lightning bolt
      ctx.fillStyle = hexToRgba(GOLD, 0.9);
      ctx.beginPath();
      ctx.moveTo(cx + 1, cy - 7);
      ctx.lineTo(cx - 3, cy + 0);
      ctx.lineTo(cx - 1, cy + 0);
      ctx.lineTo(cx - 2, cy + 7);
      ctx.lineTo(cx + 3, cy - 0);
      ctx.lineTo(cx + 1, cy - 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'play': {
      // Draw a right-pointing play triangle
      ctx.fillStyle = hexToRgba(GOLD, 0.95);
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy - 6);
      ctx.lineTo(cx + 5, cy);
      ctx.lineTo(cx - 3, cy + 6);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'explore': {
      // A bright sparkle + two smaller ones — "discover variants".
      drawStar(ctx, cx - 1, cy - 1, 5, hexToRgba(GOLD, 0.95));
      drawStar(ctx, cx + 5, cy + 4, 2.2, hexToRgba(CREAM, 0.9));
      drawStar(ctx, cx + 5, cy - 5, 1.8, hexToRgba(CREAM, 0.7));
      break;
    }
    case 'moon':
    default: {
      ctx.fillStyle = hexToRgba(CREAM, 0.95);
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
      // crescent shadow
      ctx.fillStyle = PANEL_BG;
      ctx.beginPath();
      ctx.arc(cx + 3, cy - 1, 6.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.2, cy - r * 0.2, cx + r, cy);
  ctx.quadraticCurveTo(cx + r * 0.2, cy + r * 0.2, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.2, cy + r * 0.2, cx - r, cy);
  ctx.quadraticCurveTo(cx - r * 0.2, cy - r * 0.2, cx, cy - r);
  ctx.fill();
}

// ─── Records panel ──────────────────────────────────────────────────────────

function drawRecordsPanel(ctx, layout, settings, stats, scores) {
  const fs = fontScaleOf(settings);
  const rect = cardRect(layout, 360 * fs, 480 * fs);
  menuState.cardRect = rect;
  drawCard(ctx, rect);
  const startY = drawTitleBar(ctx, rect, 'Records', { showBack: true, fs });

  const padX = 24;
  const innerW = rect.w - padX * 2;
  let y = startY + 4;

  // ── Leaderboard ──
  y = drawSectionHeader(ctx, rect.x + padX, y, 'Leaderboard', fs);
  const list = Array.isArray(scores) ? scores.slice(0, 5) : [];
  const rowPx = Math.max(13, Math.round(13 * fs));
  if (list.length === 0) {
    ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
    ctx.font = `italic 400 ${rowPx}px ${SERIF}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('no lanterns yet — light the river', rect.x + padX, y);
    y += rowPx * 1.8;
  } else {
    for (let i = 0; i < list.length; i++) {
      y = drawLeaderboardRow(ctx, rect.x + padX, y, innerW, i + 1, list[i], fs);
    }
    y += 4;
  }

  // ── Lifetime ──
  y = drawSectionHeader(ctx, rect.x + padX, y + 10, 'Lifetime', fs);
  const s = stats || {};
  const lines = [
    ['Stages cleared',    fmtInt(s.won)],
    ['Lanterns lit',      fmtInt(s.totalPops)],
    ['Lanterns drifted',  fmtInt(s.totalDrops)],
    ['Best chain',        s.bestCombo ? `×${s.bestCombo}` : '—'],
    ['Best score',        s.bestScore ? fmtInt(s.bestScore) : '—'],
    ['Time tending',      fmtTime(s.totalPlayMs || 0)],
  ];
  for (const [label, value] of lines) {
    y = drawStatRow(ctx, rect.x + padX, y, innerW, label, value, fs);
  }
}

function drawSectionHeader(ctx, x, y, label, fs) {
  const px = Math.max(10, Math.round(10 * fs));
  ctx.save();
  ctx.fillStyle = hexToRgba(GOLD, 0.85);
  ctx.font = `500 ${px}px ${SANS}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(label.toUpperCase(), x, y);
  // Letter-spacing fake: width plus a small gold mark.
  const w = ctx.measureText(label.toUpperCase()).width;
  ctx.fillStyle = hexToRgba(GOLD, 0.4);
  ctx.beginPath();
  ctx.arc(x + w + 8, y + px / 2 + 1, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return y + px + 8;
}

function drawLeaderboardRow(ctx, x, y, w, rank, entry, fs) {
  const px = Math.max(13, Math.round(13 * fs));
  const subPx = Math.max(10, Math.round(10 * fs));
  ctx.save();
  ctx.textBaseline = 'top';
  // Rank — italic, gold, narrow column.
  ctx.fillStyle = hexToRgba(GOLD, rank === 1 ? 0.95 : 0.7);
  ctx.font = `italic 500 ${px}px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.fillText(String(rank), x, y);
  // Score — cream, tabular.
  ctx.fillStyle = CREAM;
  ctx.font = `500 ${px}px ${SERIF}`;
  ctx.fillText(fmtInt(entry.score | 0), x + 24, y);
  // Stage + combo metadata — right-aligned.
  const meta = entry.meta || {};
  const tags = [];
  if (meta.level) tags.push(`stage ${meta.level}`);
  if (meta.combo > 1) tags.push(`×${meta.combo}`);
  ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
  ctx.font = `400 ${subPx}px ${SERIF}`;
  ctx.textAlign = 'right';
  ctx.fillText(tags.join(' · '), x + w, y + (px - subPx) * 0.4);
  ctx.restore();
  return y + px + 6;
}

function drawStatRow(ctx, x, y, w, label, value, fs) {
  const px = Math.max(12, Math.round(12 * fs));
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.font = `400 ${px}px ${SERIF}`;
  ctx.fillStyle = hexToRgba(CREAM, 0.82);
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y);
  ctx.fillStyle = CREAM;
  ctx.font = `500 ${px}px ${SERIF}`;
  ctx.textAlign = 'right';
  ctx.fillText(value, x + w, y);
  ctx.restore();
  return y + px + 6;
}

// ── Shared game-selection list ───────────────────────────────────────────────
// One card layout for every mode (Stages, Puzzles, Seeds). Each panel builds an
// array of row descriptors and hands them here; this owns the card, title bar,
// subtitle, scroll math, hit registration, and scrollbar so all modes look and
// behave identically. A descriptor:
//   { state, accent, label, statusMarker, difficultyKey, dots:[hex],
//     subTag:{text,color}, subLabel, rightLines:[{text,line:'top'|'bottom',small}],
//     hasInfo, action, value, infoAction, infoValue, enabled }
function drawSelectionList(ctx, layout, settings, opts) {
  const { title, subtitle, items, scrollToIndex = -1 } = opts;
  const fs = fontScaleOf(settings);
  const rect = cardRect(layout, 360 * fs, 480 * fs);
  menuState.cardRect = rect;
  drawCard(ctx, rect);
  const startY = drawTitleBar(ctx, rect, title, { showBack: true, fs });

  const padX = 20;
  const subPx = Math.max(11, Math.round(11 * fs));
  if (subtitle) {
    ctx.save();
    ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
    ctx.font = `italic 400 ${subPx}px ${SERIF}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(subtitle, rect.x + padX, startY);
    ctx.restore();
  }

  const viewportX = rect.x + padX;
  const viewportY = startY + (subtitle ? subPx + 12 : 8);
  const viewportW = rect.w - padX * 2;
  const viewportH = rect.y + rect.h - viewportY - 16;

  const rowHeight = Math.round(58 * fs);
  const totalHeight = items.length * rowHeight;

  menuState.viewportY = viewportY;
  menuState.viewportH = viewportH;
  menuState.maxScrollY = Math.max(0, totalHeight - viewportH);
  if (menuState.needsScrollToCurrent) {
    menuState.needsScrollToCurrent = false;
    if (scrollToIndex >= 0) {
      const targetY = scrollToIndex * rowHeight;
      menuState.scrollY = Math.max(0, Math.min(menuState.maxScrollY, targetY - viewportH / 2 + rowHeight / 2));
    }
  }
  menuState.scrollY = Math.max(0, Math.min(menuState.maxScrollY, menuState.scrollY));

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewportX - 4, viewportY, viewportW + 8, viewportH);
  ctx.clip();

  const rightPad = menuState.maxScrollY > 0 ? 16 : 10;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rowY = viewportY + i * rowHeight - menuState.scrollY;
    if (rowY + rowHeight < viewportY || rowY > viewportY + viewportH) continue;
    const infoHit = drawSelectionRow(ctx, item, viewportX, rowY, viewportW, rowHeight, rightPad, fs);
    if (item.enabled === false) continue;
    // Info hit pushed FIRST (first match wins) so tapping ⓘ opens the detail
    // card; the rest of the row still triggers its primary action.
    if (infoHit && item.infoAction) {
      const pad = 4 * fs;
      menuState.hits.push({
        x: infoHit.cx - infoHit.r - pad, y: infoHit.cy - infoHit.r - pad,
        w: (infoHit.r + pad) * 2, h: (infoHit.r + pad) * 2,
        action: item.infoAction, value: item.infoValue,
      });
    }
    if (item.action) {
      menuState.hits.push({ x: viewportX, y: rowY, w: viewportW, h: rowHeight, action: item.action, value: item.value });
    }
  }
  ctx.restore();

  drawListScrollbar(ctx, viewportX, viewportY, viewportW, viewportH, totalHeight);
}

// Draws one selection card. Returns the info-button geometry ({cx,cy,r}) when the
// row has one (so the list can register its hit); otherwise null.
function drawSelectionRow(ctx, item, x, rowY, w, h, rightPad, fs) {
  const state = item.state || 'default';
  const isCurrent = state === 'current';
  const isLocked = state === 'locked';
  const isEmber = item.accent === 'ember';
  const strong = isCurrent || state === 'cleared' || state === 'played';

  // ── Chrome: background + border.
  ctx.save();
  if (isEmber) {
    ctx.fillStyle = hexToRgba(EMBER, 0.06);
  } else {
    const baseAlpha = isCurrent ? 0.08 : state === 'cleared' ? 0.05 : state === 'played' ? 0.03 : isLocked ? 0.015 : 0.02;
    ctx.fillStyle = hexToRgba(CREAM, baseAlpha);
  }
  roundedRectPath(ctx, x, rowY + 2, w, h - 4, 6);
  ctx.fill();
  if (isEmber) { ctx.strokeStyle = hexToRgba(EMBER, 0.5); ctx.lineWidth = 1; }
  else if (isCurrent) { ctx.strokeStyle = GOLD; ctx.lineWidth = 1.4; }
  else if (state === 'cleared') { ctx.strokeStyle = hexToRgba(GOLD, 0.4); ctx.lineWidth = 1; }
  else if (isLocked) { ctx.strokeStyle = hexToRgba(CREAM, 0.06); ctx.lineWidth = 1; }
  else { ctx.strokeStyle = hexToRgba(CREAM, 0.12); ctx.lineWidth = 1; }
  roundedRectPath(ctx, x, rowY + 2, w, h - 4, 6);
  ctx.stroke();

  const cy1 = rowY + h * 0.36;   // top line
  const cy2 = rowY + h * 0.69;   // bottom line
  ctx.textBaseline = 'middle';

  // ── Info button (far right). Right-aligned text tucks to its left.
  let rightAnchorX = x + w - rightPad;
  let infoHit = null;
  if (item.hasInfo) {
    const infoR = 9 * fs;
    const infoCx = x + w - rightPad - infoR;
    const infoCy = rowY + h / 2;
    drawInfoButton(ctx, infoCx, infoCy, infoR, isEmber ? EMBER : CREAM, 0.55);
    rightAnchorX = infoCx - infoR - 8;
    infoHit = { cx: infoCx, cy: infoCy, r: infoR };
  }

  // ── Top line: label · status marker · difficulty badge.
  const labelX = x + 14;
  ctx.fillStyle = isCurrent ? GOLD : isLocked ? hexToRgba(CREAM, 0.3) : CREAM;
  ctx.font = `600 ${Math.round(16 * fs)}px ${SERIF}`;
  ctx.textAlign = 'left';
  let label = item.label || '';
  const maxLabelW = rightAnchorX - labelX - 80 * fs;
  if (maxLabelW > 24 && ctx.measureText(label).width > maxLabelW) {
    while (label.length > 2 && ctx.measureText(label + '…').width > maxLabelW) label = label.slice(0, -1);
    label += '…';
  }
  ctx.fillText(label, labelX, cy1);
  let cursorX = labelX + ctx.measureText(label).width + 11 * fs;

  cursorX += drawStatusMarker(ctx, item.statusMarker, cursorX, cy1, fs);

  if (item.difficultyKey) {
    drawDifficultyBadge(ctx, cursorX, cy1, item.difficultyKey, fs, { alpha: isLocked ? 0.4 : 1 });
  }

  // ── Right-aligned values (best score, or seed ids on two lines).
  for (const rl of item.rightLines || []) {
    if (!rl || rl.text == null) continue;
    const cyR = rl.line === 'bottom' ? cy2 : cy1;
    if (rl.small) {
      ctx.font = `400 ${Math.round(9 * fs)}px ${SANS}`;
      ctx.fillStyle = hexToRgba(CREAM, isLocked ? 0.18 : 0.45);
    } else {
      ctx.font = `600 ${Math.round(13 * fs)}px ${SERIF}`;
      ctx.fillStyle = hexToRgba(CREAM, isLocked ? 0.18 : strong ? 0.9 : 0.4);
    }
    ctx.textAlign = 'right';
    ctx.fillText(rl.text, rightAnchorX, cyR);
  }

  // ── Bottom line: palette dots + optional tag + sub-label.
  const dots = item.dots || [];
  const dotR = 2.7 * fs;
  const gap = dotR * 2.5;
  const dotX0 = labelX + dotR;
  for (let c = 0; c < dots.length; c++) {
    ctx.fillStyle = hexToRgba(dots[c], strong ? 0.95 : isLocked ? 0.18 : 0.6);
    ctx.beginPath();
    ctx.arc(dotX0 + c * gap, cy2, dotR, 0, Math.PI * 2);
    ctx.fill();
  }
  let subX = dots.length ? dotX0 + (dots.length - 1) * gap + dotR + 12 * fs : labelX;
  ctx.textAlign = 'left';
  if (item.subTag) {
    ctx.fillStyle = hexToRgba(item.subTag.color, 0.95);
    ctx.font = `700 ${Math.round(9.5 * fs)}px ${SANS}`;
    ctx.fillText(item.subTag.text, subX, cy2);
    subX += ctx.measureText(item.subTag.text).width + 6;
  }
  if (item.subLabel) {
    ctx.font = `400 ${Math.round(11.5 * fs)}px ${SANS}`;
    ctx.fillStyle = isCurrent ? hexToRgba(GOLD, 0.85) : hexToRgba(CREAM, isLocked ? 0.2 : 0.55);
    ctx.fillText(item.subLabel, subX, cy2);
  }

  ctx.restore();
  return infoHit;
}

// Status pip drawn just after a row's label; returns its x-advance so the caller
// can place the difficulty badge after it.
function drawStatusMarker(ctx, kind, x, cy, fs) {
  if (kind === 'lock') {
    ctx.save();
    ctx.strokeStyle = hexToRgba(CREAM, 0.28);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(x + 4 * fs, cy - 2.6 * fs, 2.7 * fs, Math.PI, 0);    // shackle
    ctx.stroke();
    ctx.fillStyle = hexToRgba(CREAM, 0.22);
    ctx.fillRect(x + 0.5 * fs, cy - 1.6 * fs, 7 * fs, 5.6 * fs); // body
    ctx.restore();
    return 15 * fs;
  }
  if (kind === 'star') {
    drawStar(ctx, x + 4 * fs, cy, 3.8 * fs, GOLD);
    return 15 * fs;
  }
  if (kind === 'ring') {
    ctx.strokeStyle = hexToRgba(CREAM, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + 3 * fs, cy, 2.7 * fs, 0, Math.PI * 2);
    ctx.stroke();
    return 13 * fs;
  }
  if (kind === 'emberDot') {
    ctx.fillStyle = hexToRgba(EMBER, 0.9);
    ctx.beginPath();
    ctx.arc(x + 3 * fs, cy, 2.8 * fs, 0, Math.PI * 2);
    ctx.fill();
    return 13 * fs;
  }
  return 0;
}

function drawListScrollbar(ctx, vx, vy, vw, vh, totalHeight) {
  if (menuState.maxScrollY <= 0) return;
  const sbW = 4;
  const sbX = vx + vw - sbW - 2;
  const thumbH = Math.max(20, Math.round((vh / totalHeight) * vh));
  const thumbY = vy + Math.round((menuState.scrollY / menuState.maxScrollY) * (vh - thumbH));
  ctx.save();
  ctx.fillStyle = 'rgba(232, 183, 112, 0.05)';
  roundedRectPath(ctx, sbX, vy, sbW, vh, 2);
  ctx.fill();
  ctx.fillStyle = hexToRgba(GOLD, 0.7);
  roundedRectPath(ctx, sbX, thumbY, sbW, thumbH, 2);
  ctx.fill();
  ctx.restore();
}

// ─── Stages panel ───────────────────────────────────────────────────────────

function drawStagesPanel(ctx, layout, game, settings, stats) {
  const totalStages = LEVELS.length;
  const reached = totalStages; // temporarily unlocked for testing

  const items = [];
  for (let i = 1; i <= totalStages; i++) {
    const cfg = levelConfig(i);
    const isCurrent = i === game.level;
    const isLocked = i > reached;
    const ld = (stats && stats.levels && stats.levels[String(i)]) || null;
    const cleared = !!(ld && ld.cleared);
    const played = !!(ld && ld.plays);
    const bestScore = ld ? ld.bestScore | 0 : 0;
    const dots = [];
    for (let c = 0; c < cfg.colors; c++) dots.push(COLORS[COLOR_KEYS[c]]);
    items.push({
      state: isCurrent ? 'current' : isLocked ? 'locked' : cleared ? 'cleared' : played ? 'played' : 'default',
      statusMarker: isLocked ? 'lock' : cleared ? 'star' : played ? 'ring' : null,
      label: `Stage ${i}`,
      difficultyKey: difficultyRating(cfg).key,
      dots,
      subLabel: `${STENCIL_PACKS[cfg.stencilPack]?.name || cfg.stencilPack} · ${cfg.isSpeedMode ? 'Timed' : 'Classic'}`,
      rightLines: [{ text: bestScore ? fmtInt(bestScore) : '—', line: 'top' }],
      enabled: !isLocked,
      action: 'pick-stage', value: i,
    });
  }

  drawSelectionList(ctx, layout, settings, {
    title: 'Choose a stage',
    subtitle: `currently on stage ${game.level} · ${reached} reached`,
    items,
    scrollToIndex: game.level - 1,
  });
}

// ─── Puzzles panel ──────────────────────────────────────────────────────────

// Hand-crafted puzzles carry an authored board rather than generation params,
// so difficultyRating()'s numeric inputs aren't present. Normalize a puzzle into
// the shape difficultyRating expects (color count, board rows, blocker density,
// timed flag) so its badge reads on the same scale as Stages and Seeds.
function puzzleRatingKey(cfg) {
  const board = cfg.board || [];
  let cells = 0, blockers = 0;
  for (const row of board) {
    for (const ch of row.replace(/\s/g, '')) {
      if (ch === '.') continue;
      cells++;
      if (ch === 'X') blockers++;
    }
  }
  return difficultyRating({
    colors: cfg.colors.length,
    initialRows: board.length,
    // 'none' descent has no time pressure → full grace; timed puzzles bite.
    descentShots: cfg.descentType === 'time' ? 6 : 12,
    isSpeedMode: cfg.descentType === 'time',
    blockerPct: cells ? (blockers / cells) * 100 : 0,
  }).key;
}

function drawPuzzlesPanel(ctx, layout, game, settings, stats) {
  const unlockedCount = PUZZLE_COUNT; // temporarily unlocked for testing
  let maxCleared = 0;
  if (stats && stats.puzzles) {
    for (let i = 1; i <= PUZZLE_COUNT; i++) {
      if (stats.puzzles[String(i)] && stats.puzzles[String(i)].cleared) maxCleared = Math.max(maxCleared, i);
    }
  }

  const items = [];
  for (let i = 1; i <= PUZZLE_COUNT; i++) {
    const cfg = puzzleConfig(i);
    const isCurrent = game.isPuzzleMode && (i === game.puzzleId);
    const isLocked = i > unlockedCount;
    const pz = (stats && stats.puzzles && stats.puzzles[String(i)]) || null;
    const cleared = !!(pz && pz.cleared);
    const played = !!(pz && pz.plays);
    const bestScore = pz ? pz.bestScore | 0 : 0;
    const dots = cfg.colors.map(key => COLORS[key]);
    items.push({
      state: isCurrent ? 'current' : isLocked ? 'locked' : cleared ? 'cleared' : played ? 'played' : 'default',
      statusMarker: isLocked ? 'lock' : cleared ? 'star' : played ? 'ring' : null,
      label: `${i}. ${cfg.name}`,
      difficultyKey: puzzleRatingKey(cfg),
      dots,
      subLabel: `${STENCIL_PACKS[cfg.stencilPack]?.name || cfg.stencilPack} · ${cfg.goalType === 'clear-targets' ? 'Targets' : 'Clear all'}`,
      rightLines: [{ text: bestScore ? fmtInt(bestScore) : '—', line: 'top' }],
      enabled: !isLocked,
      action: 'pick-puzzle', value: i,
    });
  }

  const puzzleText = game.isPuzzleMode ? `currently on puzzle ${game.puzzleId}` : 'select a puzzle to play';
  drawSelectionList(ctx, layout, settings, {
    title: 'Choose a puzzle',
    subtitle: `${puzzleText} · ${maxCleared} cleared`,
    items,
    scrollToIndex: game.puzzleId - 1,
  });
}

// ─── Seeds panel ────────────────────────────────────────────────────────────

function drawSeedsPanel(ctx, layout, game, settings) {
  const history = loadSeedHistory();
  // Difficulty tier per seed pair, from the richer telemetry log (it carries
  // endPhase, so a repeatedly-abandoned seed reads as the lost-cause top tier).
  const tierMap = seedTierMap(loadTelemetry());

  const items = history.map(e => {
    const isLostCause = seedKey(e) ? tierMap.get(seedKey(e)) === 'lost-cause' : false;
    const cfg = effectiveConfig(e.settingsSeed >>> 0, e.overrides);
    const dots = [];
    for (let c = 0; c < (cfg.colors || 0); c++) dots.push(COLORS[COLOR_KEYS[c]]);
    const packName = STENCIL_PACKS[e.stencilPack]?.name || e.stencilPack || '';
    return {
      state: e.won ? 'cleared' : 'played',
      accent: isLostCause ? 'ember' : null,
      statusMarker: e.won ? 'star' : isLostCause ? 'emberDot' : 'ring',
      label: fmtInt(e.score | 0),
      difficultyKey: difficultyRating(cfg).key,
      dots,
      subTag: isLostCause ? { text: 'LOST CAUSE', color: EMBER } : null,
      subLabel: `${e.isSpeedMode ? 'Timed' : 'Classic'}${packName ? ' · ' + packName : ''}`,
      rightLines: [
        { text: `s#${e.settingsSeed >>> 0}`, line: 'top', small: true },
        { text: `b#${e.boardSeed >>> 0}`, line: 'bottom', small: true },
      ],
      hasInfo: true,
      action: 'pick-seed-history', value: e,
      infoAction: 'show-seed-detail', infoValue: e,
    };
  });

  drawSelectionList(ctx, layout, settings, {
    title: 'Seeds',
    subtitle: history.length
      ? `${history.length} variant${history.length === 1 ? '' : 's'} mined · tap to replay, ⓘ for details`
      : 'no variants yet — play one in Explore',
    items,
    scrollToIndex: -1,
  });
}

// ─── Seed detail card ────────────────────────────────────────────────────────
// The expanded game card for one Explore seed — difficulty, full config, and
// your record on it — reached via the ⓘ on a Seeds row. Play replays the seed.
const OUTCOME_ACCENT = {
  'lost-cause': { label: 'Lost cause', color: EMBER },
  unbeaten:     { label: 'Unbeaten',   color: EMBER },
  brutal:       { label: 'Brutal',     color: '#e29a55' },
  challenging:  { label: 'Challenging', color: GOLD },
  easy:         { label: 'Cleared',    color: GOLD },
  trivial:      { label: 'Cleared',    color: GOLD },
};

function drawSeedDetailPanel(ctx, layout, game, settings) {
  const fs = fontScaleOf(settings);
  const rect = cardRect(layout, 360 * fs, 480 * fs);
  menuState.cardRect = rect;
  drawCard(ctx, rect);
  const startY = drawTitleBar(ctx, rect, 'Seed details', { showBack: true, backAction: 'show-seeds', fs });

  const e = menuState.detailSeed;
  const padX = 22;
  const x = rect.x + padX;
  const rightX = rect.x + rect.w - padX;
  if (!e) {
    ctx.save();
    ctx.fillStyle = hexToRgba(CREAM, 0.5);
    ctx.font = `400 ${Math.round(13 * fs)}px ${SANS}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('No seed selected.', x, startY + 8);
    ctx.restore();
    return;
  }

  const config = effectiveConfig(e.settingsSeed >>> 0, e.overrides);
  const rating = difficultyRating(config);

  // This seed's record, from the richer telemetry log.
  const telem = loadTelemetry().filter(r => seedKey(r) === seedKey(e));
  const plays = telem.length;
  const wins = telem.filter(r => r.won).length;
  const abandons = telem.filter(r => !r.won && r.endPhase === 'aiming').length;
  const tier = plays ? fairnessLabel(telem) : null;
  const bestScore = Math.max(e.score | 0, 0, ...telem.map(r => r.score | 0));
  const bestCombo = Math.max(e.combo | 0, 0, ...telem.map(r => r.bestCombo | 0));

  let y = startY + 6;

  // Hero row: big difficulty badge + outcome accent.
  ctx.save();
  const badgeW = drawDifficultyBadge(ctx, x, y + 10 * fs, rating.key, fs, { scale: 1.7 });
  const accent = tier ? OUTCOME_ACCENT[tier] : null;
  if (accent) {
    ctx.font = `700 ${Math.round(11 * fs)}px ${SANS}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = hexToRgba(accent.color, 0.95);
    ctx.fillText(accent.label.toUpperCase(), x + badgeW + 12, y + 10 * fs);
  }
  // Seeds, right-aligned in the hero row.
  ctx.fillStyle = hexToRgba(CREAM, 0.5);
  ctx.font = `400 ${Math.round(10 * fs)}px ${SANS}`;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(`s#${e.settingsSeed >>> 0}`, rightX, y + 3 * fs);
  ctx.fillText(`b#${e.boardSeed >>> 0}`, rightX, y + 17 * fs);
  ctx.restore();
  y += 34 * fs;

  drawDashedRule(ctx, x, y, rect.w - padX * 2);
  y += 14 * fs;

  // Config + record as label/value rows.
  const packName = STENCIL_PACKS[config.stencilPack]?.name || config.stencilPack || '—';
  const patternName = SEED_PATTERNS[config.pattern]?.name || config.pattern || 'random';
  const rows = [
    ['Difficulty', DIFFICULTY_BADGE[rating.key]?.label || rating.key],
    ['Colors', `${config.colors}`],
    ['Starting rows', `${config.initialRows}`],
    ['Descent', `${config.descentShots} shots`],
    ['Mode', config.isSpeedMode ? 'Timed' : 'Classic'],
    ['Blockers', `${config.blockerPct || 0}%`],
    ['Pattern', patternName],
    ['Stencils', packName],
    ['rule', ''],
    ['Plays', plays ? `${plays} (${wins} won${abandons ? `, ${abandons} abandoned` : ''})` : 'first time'],
    ['Best score', bestScore ? fmtInt(bestScore) : '—'],
    ['Best combo', bestCombo ? `×${bestCombo}` : '—'],
  ];
  const lineH = 21 * fs;
  ctx.save();
  ctx.textBaseline = 'middle';
  for (const [label, value] of rows) {
    if (label === 'rule') { drawDashedRule(ctx, x, y + lineH / 2, rect.w - padX * 2); y += lineH; continue; }
    ctx.font = `400 ${Math.round(11 * fs)}px ${SANS}`;
    ctx.fillStyle = hexToRgba(CREAM, 0.5);
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y + lineH / 2);
    ctx.font = `500 ${Math.round(11.5 * fs)}px ${SERIF}`;
    ctx.fillStyle = hexToRgba(CREAM, 0.92);
    ctx.textAlign = 'right';
    ctx.fillText(value, rightX, y + lineH / 2);
    y += lineH;
  }
  ctx.restore();

  // Play button, pinned near the card bottom.
  const btnH = 44 * fs;
  const btnY = rect.y + rect.h - btnH - 18 * fs;
  const btnW = rect.w - padX * 2;
  ctx.save();
  ctx.fillStyle = hexToRgba(GOLD, 0.92);
  roundedRectPath(ctx, x, btnY, btnW, btnH, 10);
  ctx.fill();
  ctx.fillStyle = '#1a1430';
  ctx.font = `700 ${Math.round(15 * fs)}px ${SERIF}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Play this seed', x + btnW / 2, btnY + btnH / 2);
  ctx.restore();
  menuState.hits.push({ x, y: btnY, w: btnW, h: btnH, action: 'seed-detail-play' });
}

// ─── Options panel ──────────────────────────────────────────────────────────

function drawOptionsPanel(ctx, layout, settings) {
  const fs = fontScaleOf(settings);
  const gameMode = Arcade.state.get('gameMode') || 'campaign';
  
  // Compute card height dynamically: title + stencils disabled notice/packs + fast launch
  const isZen = gameMode === 'zen';
  const stencilsDisabled = (gameMode === 'campaign' || gameMode === 'puzzle');
  const cardH = Math.round((200 + (isZen ? 50 : 0) + (stencilsDisabled ? 34 : 0) + 5 * 44) * fs);
  
  const rect = cardRect(layout, 350 * fs, cardH);
  menuState.cardRect = rect;
  drawCard(ctx, rect);
  const startY = drawTitleBar(ctx, rect, 'Options', { showBack: true, fs });

  const padX = 20;
  const innerW = rect.w - padX * 2;
  let y = startY + 10;

  // Fast Launch Option (Zen mode only)
  if (isZen) {
    const fastLaunch = !!Arcade.state.get('fastLaunch');
    const rowH = Math.round(38 * fs);
    ctx.save();
    ctx.fillStyle = fastLaunch ? 'rgba(245, 233, 201, 0.08)' : 'rgba(245, 233, 201, 0.03)';
    roundedRectPath(ctx, rect.x + padX, y, innerW, rowH, 6);
    ctx.fill();

    ctx.strokeStyle = fastLaunch ? GOLD : hexToRgba(CREAM, 0.12);
    ctx.lineWidth = fastLaunch ? 1.4 : 1;
    ctx.stroke();

    const titlePx = Math.round(13 * fs);
    const subPx = Math.round(9 * fs);

    ctx.fillStyle = CREAM;
    ctx.font = `500 ${titlePx}px ${SERIF}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('Fast Launch', rect.x + padX + 12 * fs, y + rowH * 0.18);

    ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
    ctx.font = `400 ${subPx}px ${SERIF}`;
    ctx.fillText('Rapid fire launching mechanics', rect.x + padX + 12 * fs, y + rowH * 0.58);

    // Toggle switch checkbox indicator
    const cx = rect.x + padX + innerW - 16 * fs;
    const cy = y + rowH / 2;
    if (fastLaunch) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 1);
      ctx.lineTo(cx - 1, cy + 2);
      ctx.lineTo(cx + 4, cy - 4);
      ctx.stroke();
    } else {
      ctx.strokeStyle = hexToRgba(CREAM, 0.3);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    menuState.hits.push({ x: rect.x + padX, y, w: innerW, h: rowH, action: 'toggle-fast-launch' });
    y += rowH + 16;
  }

  // Lantern Art Section
  y = drawSectionHeader(ctx, rect.x + padX, y, 'Lantern Art', fs);

  const activePackId = Arcade.state.get('stencilPack') || 'bugs';
  const rowH = Math.round(38 * fs);

  if (stencilsDisabled) {
    ctx.save();
    const noticeH = Math.round(34 * fs);
    ctx.fillStyle = 'rgba(232, 183, 112, 0.04)';
    ctx.strokeStyle = 'rgba(232, 183, 112, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    roundedRectPath(ctx, rect.x + padX, y, innerW, noticeH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = hexToRgba(GOLD, 0.85);
    ctx.font = `italic 400 ${Math.round(10 * fs)}px ${SERIF}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Art is determined by level config in Campaign and Puzzle modes.',
      rect.x + rect.w / 2,
      y + noticeH / 2
    );
    ctx.restore();
    y += noticeH + 10;
  }

  ctx.save();
  if (stencilsDisabled) {
    ctx.globalAlpha = 0.35;
  }

  for (const pack of Object.values(STENCIL_PACKS)) {
    const isSelected = pack.id === activePackId;
    drawCompactStencilRow(ctx, rect.x + padX, y, innerW, rowH, pack, isSelected, fs);
    if (!stencilsDisabled) {
      menuState.hits.push({ x: rect.x + padX, y, w: innerW, h: rowH, action: 'pick-stencil', value: pack.id });
    }
    y += rowH + 6;
  }
  ctx.restore();
}

function drawCompactStencilRow(ctx, x, y, w, h, pack, isSelected, fs) {
  ctx.save();
  ctx.fillStyle = isSelected ? 'rgba(245, 233, 201, 0.08)' : 'rgba(245, 233, 201, 0.03)';
  roundedRectPath(ctx, x, y, w, h, 6);
  ctx.fill();

  ctx.strokeStyle = isSelected ? GOLD : hexToRgba(CREAM, 0.12);
  ctx.lineWidth = isSelected ? 1.4 : 1;
  ctx.stroke();

  const titlePx = Math.round(13 * fs);
  const subPx = Math.round(9 * fs);

  ctx.fillStyle = CREAM;
  ctx.font = `500 ${titlePx}px ${SERIF}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(pack.name, x + 12 * fs, y + h * 0.18);

  ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
  ctx.font = `400 ${subPx}px ${SERIF}`;
  ctx.textBaseline = 'top';

  const maxTextW = w - 44 * fs;
  let descText = pack.description;
  if (ctx.measureText(descText).width > maxTextW) {
    while (descText.length > 0 && ctx.measureText(descText + '...').width > maxTextW) {
      descText = descText.slice(0, -1);
    }
    descText += '...';
  }
  ctx.fillText(descText, x + 12 * fs, y + h * 0.58);

  // Selection indicator
  ctx.save();
  const cx = x + w - 16 * fs;
  const cy = y + h / 2;

  if (isSelected) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 1);
    ctx.lineTo(cx - 1, cy + 2);
    ctx.lineTo(cx + 4, cy - 4);
    ctx.stroke();
  } else {
    ctx.strokeStyle = hexToRgba(CREAM, 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function roundedRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}

function fmtInt(n) {
  return (n | 0).toLocaleString('en-US');
}

function fmtTime(ms) {
  const totalMin = Math.floor((ms || 0) / 60000);
  if (totalMin < 1) return '< 1m';
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
