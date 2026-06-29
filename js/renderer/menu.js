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

// ─── Stages panel ───────────────────────────────────────────────────────────

function drawStagesPanel(ctx, layout, game, settings, stats) {
  const fs = fontScaleOf(settings);
  const rect = cardRect(layout, 360 * fs, 480 * fs);
  menuState.cardRect = rect;
  drawCard(ctx, rect);
  const startY = drawTitleBar(ctx, rect, 'Choose a stage', { showBack: true, fs });

  const padX = 20;
  const totalStages = LEVELS.length;
  const reached = totalStages; // temporarily unlocked for testing

  const subPx = Math.max(11, Math.round(11 * fs));
  ctx.save();
  ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
  ctx.font = `italic 400 ${subPx}px ${SERIF}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(
    `currently on stage ${game.level} · ${reached} reached`,
    rect.x + padX, startY
  );
  ctx.restore();

  const viewportX = rect.x + padX;
  const viewportY = startY + subPx + 12;
  const viewportW = rect.w - padX * 2;
  const viewportH = rect.y + rect.h - viewportY - 16;

  const rowHeight = Math.round(58 * fs);
  const totalHeight = totalStages * rowHeight;

  menuState.viewportY = viewportY;
  menuState.viewportH = viewportH;
  menuState.maxScrollY = Math.max(0, totalHeight - viewportH);
  if (menuState.needsScrollToCurrent) {
    menuState.needsScrollToCurrent = false;
    const targetY = (game.level - 1) * rowHeight;
    menuState.scrollY = Math.max(0, Math.min(menuState.maxScrollY, targetY - viewportH / 2 + rowHeight / 2));
  } else {
    menuState.scrollY = Math.max(0, Math.min(menuState.maxScrollY, menuState.scrollY));
  }

  // Content Area
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewportX - 4, viewportY, viewportW + 8, viewportH);
  ctx.clip();

  for (let i = 1; i <= totalStages; i++) {
    const rowY = viewportY + (i - 1) * rowHeight - menuState.scrollY;

    // Viewport cull
    if (rowY + rowHeight < viewportY || rowY > viewportY + viewportH) {
      continue;
    }

    const isCurrent = i === game.level;
    const isLocked = i > reached;
    const levelData = (stats && stats.levels && stats.levels[String(i)]) || null;
    const cleared = !!(levelData && levelData.cleared);
    const played = !!(levelData && levelData.plays);
    const bestScore = levelData ? levelData.bestScore | 0 : 0;

    // Draw background
    ctx.save();
    const baseAlpha = isCurrent ? 0.08 : cleared ? 0.05 : played ? 0.03 : isLocked ? 0.015 : 0.02;
    ctx.fillStyle = hexToRgba(CREAM, baseAlpha);
    roundedRectPath(ctx, viewportX, rowY + 2, viewportW, rowHeight - 4, 6);
    ctx.fill();

    // Border
    if (isCurrent) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.4;
    } else if (cleared) {
      ctx.strokeStyle = hexToRgba(GOLD, 0.4);
      ctx.lineWidth = 1;
    } else if (isLocked) {
      ctx.strokeStyle = hexToRgba(CREAM, 0.06);
      ctx.lineWidth = 1;
    } else {
      ctx.strokeStyle = hexToRgba(CREAM, 0.12);
      ctx.lineWidth = 1;
    }
    roundedRectPath(ctx, viewportX, rowY + 2, viewportW, rowHeight - 4, 6);
    ctx.stroke();

    const cfg = levelConfig(i);
    const cy1 = rowY + rowHeight * 0.36;   // top line baseline
    const cy2 = rowY + rowHeight * 0.69;   // bottom line baseline
    ctx.textBaseline = 'middle';

    // ── Top line: stage name · status · difficulty, with best score on the
    // far right in its own lane (the old layout let the score collide here).
    ctx.fillStyle = isCurrent ? GOLD : isLocked ? hexToRgba(CREAM, 0.3) : CREAM;
    ctx.font = `600 ${Math.round(16 * fs)}px ${SERIF}`;
    ctx.textAlign = 'left';
    const labelText = `Stage ${i}`;
    ctx.fillText(labelText, viewportX + 14, cy1);
    let cursorX = viewportX + 14 + ctx.measureText(labelText).width + 11 * fs;

    // Status marker: cleared star / lock / played ring.
    if (isLocked) {
      ctx.save();
      ctx.strokeStyle = hexToRgba(CREAM, 0.28);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(cursorX + 4 * fs, cy1 - 2.6 * fs, 2.7 * fs, Math.PI, 0);   // shackle
      ctx.stroke();
      ctx.fillStyle = hexToRgba(CREAM, 0.22);
      ctx.fillRect(cursorX + 0.5 * fs, cy1 - 1.6 * fs, 7 * fs, 5.6 * fs);  // body
      ctx.restore();
      cursorX += 15 * fs;
    } else if (cleared) {
      drawStar(ctx, cursorX + 4 * fs, cy1, 3.8 * fs, GOLD);
      cursorX += 15 * fs;
    } else if (played) {
      ctx.strokeStyle = hexToRgba(CREAM, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cursorX + 3 * fs, cy1, 2.7 * fs, 0, Math.PI * 2);
      ctx.stroke();
      cursorX += 13 * fs;
    }

    // Intrinsic difficulty badge.
    drawDifficultyBadge(ctx, cursorX, cy1, difficultyRating(cfg).key, fs, { alpha: isLocked ? 0.4 : 1 });

    // Best score — right-aligned, alone on the top line.
    ctx.font = `600 ${Math.round(13 * fs)}px ${SERIF}`;
    ctx.fillStyle = hexToRgba(CREAM, isLocked ? 0.18 : played ? 0.9 : 0.32);
    ctx.textAlign = 'right';
    const scoreRightX = viewportX + viewportW - (menuState.maxScrollY > 0 ? 16 : 10);
    ctx.fillText(bestScore ? fmtInt(bestScore) : '—', scoreRightX, cy1);

    // ── Bottom line: palette dots + pack · mode (larger, on its own line).
    const dotR = 2.7 * fs;
    const gap = dotR * 2.5;
    ctx.textAlign = 'left';
    const dotX0 = viewportX + 14 + dotR;
    for (let c = 0; c < cfg.colors; c++) {
      const key = COLOR_KEYS[c];
      ctx.fillStyle = hexToRgba(COLORS[key], isCurrent || cleared ? 0.95 : isLocked ? 0.18 : 0.6);
      ctx.beginPath();
      ctx.arc(dotX0 + c * gap, cy2, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
    const packName = STENCIL_PACKS[cfg.stencilPack]?.name || cfg.stencilPack;
    const modeName = cfg.isSpeedMode ? 'Timed' : 'Classic';
    ctx.font = `400 ${Math.round(11.5 * fs)}px ${SANS}`;
    ctx.fillStyle = isCurrent ? hexToRgba(GOLD, 0.85) : hexToRgba(CREAM, isLocked ? 0.2 : 0.55);
    ctx.fillText(`${packName} · ${modeName}`, dotX0 + (cfg.colors - 1) * gap + dotR + 12 * fs, cy2);

    ctx.restore();

    // Register hit target with scrolled coordinates (if unlocked)
    if (!isLocked) {
      menuState.hits.push({ x: viewportX, y: rowY, w: viewportW, h: rowHeight, action: 'pick-stage', value: i });
    }
  }
  ctx.restore();

  // Scrollbar
  if (menuState.maxScrollY > 0) {
    const sbW = 4;
    const sbX = viewportX + viewportW - sbW - 2;
    const thumbH = Math.max(20, Math.round((viewportH / totalHeight) * viewportH));
    const thumbY = viewportY + Math.round((menuState.scrollY / menuState.maxScrollY) * (viewportH - thumbH));

    ctx.save();
    ctx.fillStyle = 'rgba(232, 183, 112, 0.05)';
    roundedRectPath(ctx, sbX, viewportY, sbW, viewportH, 2);
    ctx.fill();

    ctx.fillStyle = hexToRgba(GOLD, 0.7);
    roundedRectPath(ctx, sbX, thumbY, sbW, thumbH, 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawPuzzlesPanel(ctx, layout, game, settings, stats) {
  const fs = fontScaleOf(settings);
  const rect = cardRect(layout, 360 * fs, 480 * fs);
  menuState.cardRect = rect;
  drawCard(ctx, rect);
  const startY = drawTitleBar(ctx, rect, 'Choose a puzzle', { showBack: true, fs });

  const padX = 20;
  
  // Determine how many puzzles are unlocked
  let maxCleared = 0;
  if (stats && stats.puzzles) {
    for (let i = 1; i <= PUZZLE_COUNT; i++) {
      if (stats.puzzles[String(i)] && stats.puzzles[String(i)].cleared) {
        maxCleared = Math.max(maxCleared, i);
      }
    }
  }
  const unlockedCount = PUZZLE_COUNT; // temporarily unlocked for testing

  const subPx = Math.max(11, Math.round(11 * fs));
  ctx.save();
  ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
  ctx.font = `italic 400 ${subPx}px ${SERIF}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const puzzleText = game.isPuzzleMode ? `currently on puzzle ${game.puzzleId}` : "select a puzzle to play";
  ctx.fillText(
    `${puzzleText} · ${maxCleared} cleared`,
    rect.x + padX, startY
  );
  ctx.restore();

  const viewportX = rect.x + padX;
  const viewportY = startY + subPx + 12;
  const viewportW = rect.w - padX * 2;
  const viewportH = rect.y + rect.h - viewportY - 16;

  const rowHeight = Math.round(44 * fs);
  const totalHeight = PUZZLE_COUNT * rowHeight;

  menuState.viewportY = viewportY;
  menuState.viewportH = viewportH;
  menuState.maxScrollY = Math.max(0, totalHeight - viewportH);
  if (menuState.needsScrollToCurrent) {
    menuState.needsScrollToCurrent = false;
    const targetY = (game.puzzleId - 1) * rowHeight;
    menuState.scrollY = Math.max(0, Math.min(menuState.maxScrollY, targetY - viewportH / 2 + rowHeight / 2));
  } else {
    menuState.scrollY = Math.max(0, Math.min(menuState.maxScrollY, menuState.scrollY));
  }

  // Content Area
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewportX - 4, viewportY, viewportW + 8, viewportH);
  ctx.clip();

  for (let i = 1; i <= PUZZLE_COUNT; i++) {
    const rowY = viewportY + (i - 1) * rowHeight - menuState.scrollY;

    // Viewport cull
    if (rowY + rowHeight < viewportY || rowY > viewportY + viewportH) {
      continue;
    }

    const cfg = puzzleConfig(i);
    const isCurrent = game.isPuzzleMode && (i === game.puzzleId);
    const isLocked = i > unlockedCount;
    const pzData = (stats && stats.puzzles && stats.puzzles[String(i)]) || null;
    const cleared = !!(pzData && pzData.cleared);
    const played = !!(pzData && pzData.plays);
    const bestScore = pzData ? pzData.bestScore | 0 : 0;

    // Draw background
    ctx.save();
    const baseAlpha = isCurrent ? 0.08 : cleared ? 0.05 : played ? 0.03 : isLocked ? 0.015 : 0.02;
    ctx.fillStyle = hexToRgba(CREAM, baseAlpha);
    roundedRectPath(ctx, viewportX, rowY + 2, viewportW, rowHeight - 4, 6);
    ctx.fill();

    // Border
    if (isCurrent) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.4;
    } else if (cleared) {
      ctx.strokeStyle = hexToRgba(GOLD, 0.4);
      ctx.lineWidth = 1;
    } else if (isLocked) {
      ctx.strokeStyle = hexToRgba(CREAM, 0.06);
      ctx.lineWidth = 1;
    } else {
      ctx.strokeStyle = hexToRgba(CREAM, 0.12);
      ctx.lineWidth = 1;
    }
    roundedRectPath(ctx, viewportX, rowY + 2, viewportW, rowHeight - 4, 6);
    ctx.stroke();

    // Label
    const labelPx = Math.round(13 * fs);
    ctx.fillStyle = isCurrent ? GOLD : isLocked ? hexToRgba(CREAM, 0.25) : CREAM;
    ctx.font = `600 ${labelPx}px ${SERIF}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    
    let displayName = `${i}. ${cfg.name}`;
    ctx.fillText(displayName, viewportX + 10, rowY + rowHeight / 2);
    const labelW = ctx.measureText(displayName).width;

    // Mini icons next to name
    const iconColor = isCurrent ? GOLD : isLocked ? hexToRgba(CREAM, 0.2) : hexToRgba(CREAM, 0.75);
    const modeCx = viewportX + 10 + labelW + 10 * fs;
    const stencilCx = modeCx + 14 * fs;
    drawMiniModeIcon(ctx, cfg.descentType === 'time', modeCx, rowY + rowHeight / 2, fs, iconColor);
    drawMiniStencilIcon(ctx, cfg.stencilPack, stencilCx, rowY + rowHeight / 2, fs, iconColor);

    // Cleared Star or Lock
    const lockX = viewportX + 130 * fs;
    if (isLocked) {
      const lockY = rowY + rowHeight / 2;
      ctx.save();
      ctx.strokeStyle = hexToRgba(CREAM, 0.25);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(lockX, lockY - 2.5 * fs, 2.5 * fs, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = hexToRgba(CREAM, 0.2);
      ctx.fillRect(lockX - 3.5 * fs, lockY - 1.5 * fs, 7 * fs, 5 * fs);
      ctx.restore();
    } else if (cleared) {
      drawStar(ctx, lockX, rowY + rowHeight / 2, 3 * fs, GOLD);
    } else if (played) {
      ctx.strokeStyle = hexToRgba(CREAM, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(lockX, rowY + rowHeight / 2, 2.4 * fs, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Colors preview dots
    const dotR = 2 * fs;
    const gap = dotR * 2.4;
    const totalDots = cfg.colors.length;
    const startDotX = viewportX + 155 * fs;
    for (let c = 0; c < totalDots; c++) {
      const key = cfg.colors[c];
      const cx = startDotX + c * gap;
      ctx.fillStyle = hexToRgba(COLORS[key], isCurrent || cleared ? 0.95 : isLocked ? 0.15 : 0.55);
      ctx.beginPath();
      ctx.arc(cx, rowY + rowHeight / 2, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Detail text: e.g. "Target Goal" vs "Clear All"
    if (viewportW > 280 * fs) {
      const detailPx = Math.round(9 * fs);
      ctx.font = `400 ${detailPx}px ${SANS}`;
      ctx.fillStyle = isCurrent ? GOLD : isLocked ? hexToRgba(CREAM, 0.2) : hexToRgba(CREAM, 0.45);
      ctx.textAlign = 'left';
      const goalText = cfg.goalType === 'clear-targets' ? "Target" : "Clear All";
      ctx.fillText(goalText, viewportX + 205 * fs, rowY + rowHeight / 2);
    }

    // Best Score / Completed
    const scorePx = Math.round(10 * fs);
    ctx.font = `500 ${scorePx}px ${SERIF}`;
    ctx.fillStyle = hexToRgba(CREAM, isLocked ? 0.15 : played ? 0.85 : 0.3);
    ctx.textAlign = 'right';
    const scoreRightX = viewportX + viewportW - (menuState.maxScrollY > 0 ? 18 : 12);
    ctx.fillText(bestScore ? fmtInt(bestScore) : '—', scoreRightX, rowY + rowHeight / 2);

    ctx.restore();

    // Register hit target
    if (!isLocked) {
      menuState.hits.push({
        x: viewportX,
        y: rowY,
        w: viewportW,
        h: rowHeight,
        action: 'pick-puzzle',
        value: i
      });
    }
  }
  ctx.restore();

  // Scrollbar
  if (menuState.maxScrollY > 0) {
    ctx.save();
    const sbW = 3;
    const sbX = viewportX + viewportW - sbW;
    const trackH = viewportH;
    const thumbH = Math.max(16, trackH * (viewportH / totalHeight));
    const thumbY = viewportY + (trackH - thumbH) * (menuState.scrollY / menuState.maxScrollY);

    ctx.fillStyle = 'rgba(245, 233, 201, 0.05)';
    roundedRectPath(ctx, sbX, viewportY, sbW, viewportH, 2);
    ctx.fill();

    ctx.fillStyle = hexToRgba(GOLD, 0.7);
    roundedRectPath(ctx, sbX, thumbY, sbW, thumbH, 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── Explore (Seed build) panel ─────────────────────────────────────────────

const SEED_SQRT3 = Math.sqrt(3);

// Editable settings shown as chips on the build screen. Tapping a chip opens a
// picker listing that field's alternatives. Order = display order.
const PACK_SHORT = { plain: 'Plain', bugs: 'Insects', flowers: 'Flora', dragons: 'Dragons', random: 'Random' };
const PATTERN_LABEL = { random: 'Random', rows: 'Rows', columns: 'Columns', diagonal: 'Diagonal', checker: 'Checker', mirror: 'Mirror' };
const SETTING_DEFS = [
  { field: 'colors',       label: 'Colors',  values: [3, 4, 5, 6],                                  fmt: v => `${v} colors` },
  { field: 'initialRows',  label: 'Rows',    values: [3, 4, 5, 6, 7],                               fmt: v => `${v} rows` },
  { field: 'descentShots', label: 'Descent', values: [5, 6, 7, 8, 9, 10, 12],                       fmt: v => `descent ${v}` },
  { field: 'isSpeedMode',  label: 'Pace',    values: [false, true],                                 fmt: v => (v ? 'Timed' : 'Classic') },
  { field: 'stencilPack',  label: 'Art',     values: ['plain', 'bugs', 'flowers', 'dragons', 'random'], fmt: v => (PACK_SHORT[v] || v) },
  { field: 'blockerPct',   label: 'Stones',  values: [0, 10, 20, 30, 40, 50],                       fmt: v => (v === 0 ? 'No stones' : `${v}% stones`) },
  { field: 'pattern',      label: 'Pattern', values: SEED_PATTERNS,                                 fmt: v => (PATTERN_LABEL[v] || v) },
];

// Draw a generated board's lanterns as colored dots, mapped from their
// layout-independent (nx, ny) into the given box. nx runs 0..14 across 8
// close-packed columns; ny is one packed-row (√3) per row.
function drawBoardPreview(ctx, box, preview) {
  ctx.save();
  // Box background — a slice of night sky.
  ctx.fillStyle = 'rgba(10, 15, 34, 0.55)';
  roundedRectPath(ctx, box.x, box.y, box.w, box.h, 8);
  ctx.fill();
  ctx.strokeStyle = BORDER_SOFT;
  ctx.lineWidth = 1;
  ctx.stroke();

  const lanterns = (preview && preview.lanterns) || [];
  if (lanterns.length) {
    let maxRow = 0;
    for (const l of lanterns) maxRow = Math.max(maxRow, Math.round(l.ny / SEED_SQRT3));
    // The board spans 14 nx-units wide and maxRow*√3 ny-units tall; add a
    // 1-unit (one radius) margin all round so lanterns never kiss the border.
    const spanW = 14 + 2;
    const spanH = (maxRow * SEED_SQRT3) + 2;
    const unit = Math.min(box.w / spanW, box.h / Math.max(spanH, 6));
    const dotR = unit * 0.92;
    // Center the board both axes so short boards sit in the middle, not the top.
    const contentW = 14 * unit;
    const contentH = maxRow * SEED_SQRT3 * unit;
    const originX = box.x + (box.w - contentW) / 2;
    const originY = box.y + (box.h - contentH) / 2;

    // Clip so a tall board can't spill past the box.
    roundedRectPath(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.clip();

    for (const l of lanterns) {
      const px = originX + l.nx * unit;
      const py = originY + l.ny * unit;
      ctx.fillStyle = l.isBlocker ? 'rgba(120, 120, 130, 0.85)' : (COLORS[l.color] || CREAM);
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
    ctx.font = `italic 400 12px ${SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('shuffle to generate a board', box.x + box.w / 2, box.y + box.h / 2);
  }
  ctx.restore();
}

// A pill button used on the build screen. Registers its own hit.
function drawSeedButton(ctx, r, label, action, opts = {}) {
  const { primary = false, value } = opts;
  ctx.save();
  ctx.fillStyle = primary ? hexToRgba(GOLD, 0.16) : 'rgba(245, 233, 201, 0.05)';
  roundedRectPath(ctx, r.x, r.y, r.w, r.h, 7);
  ctx.fill();
  ctx.strokeStyle = primary ? GOLD : hexToRgba(CREAM, 0.18);
  ctx.lineWidth = primary ? 1.4 : 1;
  ctx.stroke();
  ctx.fillStyle = primary ? GOLD : CREAM;
  ctx.font = `${primary ? 600 : 500} ${Math.round(r.fs ? 13 * r.fs : 13)}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
  ctx.restore();
  menuState.hits.push({ x: r.x, y: r.y, w: r.w, h: r.h, action, value });
}

function drawExplorePanel(ctx, layout, settings) {
  const fs = fontScaleOf(settings);
  ensureExplore();
  const preview = exploreState.preview;
  const cfg = preview ? preview.config : null;

  // Roomy on desktop (so big boards read clearly), full-width-ish on phones.
  const maxW = Math.max(360 * fs, Math.min(580 * fs, layout.viewW * 0.6));
  const rect = cardRect(layout, maxW, 720 * fs);
  menuState.cardRect = rect;
  menuState.maxScrollY = 0;   // fixed layout — no scrolling
  drawCard(ctx, rect);
  const startY = drawTitleBar(ctx, rect, 'Explore', { showBack: true, fs });

  const padX = 24;
  const innerW = rect.w - padX * 2;
  let y = startY + 4;

  // Subtitle.
  ctx.save();
  ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
  ctx.font = `italic 400 ${Math.round(11 * fs)}px ${SERIF}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('shuffle a variant, then play — keepers are saved', rect.x + padX, y);
  ctx.restore();
  y += 20 * fs;

  // Hits pushed up to here belong to the title bar. Everything the body adds
  // below is discarded if a setting picker is open, so only the picker is live.
  const titleHitCount = menuState.hits.length;

  // Controls block lives at the bottom; the preview gets all the space between
  // the subtitle and it — so large boards fill the card instead of cramping.
  const rowH = Math.round(32 * fs);
  const shufW = Math.round(96 * fs);
  const valW = innerW - shufW - 8;
  const playH = Math.round(44 * fs);

  // ── Lay out the editable settings chips (wrap into rows within innerW) ──
  const chipH = Math.round(28 * fs);
  const chipGap = Math.round(8 * fs);
  const chipPadX = Math.round(13 * fs);
  ctx.font = `500 ${Math.round(12 * fs)}px ${SERIF}`;
  const overrides = exploreState.overrides || {};
  const chipItems = (cfg ? SETTING_DEFS : []).map(def => {
    const label = def.fmt(cfg[def.field]);
    const w = Math.ceil(ctx.measureText(label).width) + chipPadX * 2 + 10 * fs; // +caret room
    return { def, label, w, overridden: def.field in overrides };
  });
  const chipRows = [];
  let curRow = [], curW = 0;
  for (const it of chipItems) {
    if (curRow.length && curW + it.w > innerW) { chipRows.push(curRow); curRow = []; curW = 0; }
    curRow.push(it); curW += it.w + chipGap;
  }
  if (curRow.length) chipRows.push(curRow);
  const chipsH = chipRows.length ? chipRows.length * chipH + (chipRows.length - 1) * chipGap : 0;

  const bottomBlockH = chipsH + 14 * fs + 2 * (rowH + 8 * fs) + 10 * fs + playH + 18 * fs;
  const previewTop = y;
  const previewBottom = rect.y + rect.h - bottomBlockH;
  const previewH = Math.max(150 * fs, previewBottom - previewTop);
  drawBoardPreview(ctx, { x: rect.x + padX, y: previewTop, w: innerW, h: previewH }, preview);
  y = previewTop + previewH + 12 * fs;

  // ── Draw the chips ──
  const chipsTop = y;
  for (const row of chipRows) {
    let cx = rect.x + padX;
    for (const it of row) {
      drawSettingChip(ctx, { x: cx, y, w: it.w, h: chipH, fs }, it.label, it.overridden);
      menuState.hits.push({ x: cx, y, w: it.w, h: chipH, action: 'explore-pick-field', value: it.def.field });
      cx += it.w + chipGap;
    }
    y += chipH + chipGap;
  }
  y = chipsTop + chipsH + 14 * fs;

  // ── Seed rows: [value (tap = manual entry)] [Shuffle] ──
  const seedRow = (label, seed, manualAction, shuffleAction) => {
    ctx.save();
    ctx.fillStyle = 'rgba(245, 233, 201, 0.05)';
    roundedRectPath(ctx, rect.x + padX, y, valW, rowH, 7);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(CREAM, 0.16);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = hexToRgba(CREAM, 0.55);
    ctx.font = `400 ${Math.round(9 * fs)}px ${SANS}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label.toUpperCase(), rect.x + padX + 10, y + rowH / 2);
    ctx.fillStyle = CREAM;
    ctx.font = `500 ${Math.round(12 * fs)}px ${SERIF}`;
    ctx.textAlign = 'right';
    ctx.fillText(`#${seed >>> 0}`, rect.x + padX + valW - 10, y + rowH / 2);
    ctx.restore();
    menuState.hits.push({ x: rect.x + padX, y, w: valW, h: rowH, action: manualAction });
    drawSeedButton(ctx, { x: rect.x + padX + valW + 8, y, w: shufW, h: rowH, fs }, '⟳ Shuffle', shuffleAction);
    y += rowH + 8 * fs;
  };
  seedRow('Settings', exploreState.settingsSeed, 'seed-manual-settings', 'shuffle-settings');
  seedRow('Board', exploreState.boardSeed, 'seed-manual-board', 'shuffle-board');

  // Play button.
  y += 6 * fs;
  drawSeedButton(ctx, { x: rect.x + padX, y, w: innerW, h: playH, fs }, '▶  Play', 'seed-play', { primary: true });

  // ── Setting picker overlay ── makes the body inert and lists alternatives.
  if (menuState.explorePicker && cfg) {
    const def = SETTING_DEFS.find(d => d.field === menuState.explorePicker);
    if (def) {
      menuState.hits.length = titleHitCount;   // discard body hits
      drawSettingPicker(ctx, rect, startY, def, cfg, fs);
    } else {
      menuState.explorePicker = null;
    }
  }
}

// A tappable chip showing one editable setting's current value. Overridden
// (hand-picked) settings get a gold tint so the player sees what they changed.
function drawSettingChip(ctx, r, label, overridden) {
  const fs = r.fs || 1;
  ctx.save();
  ctx.fillStyle = overridden ? hexToRgba(GOLD, 0.14) : 'rgba(245, 233, 201, 0.05)';
  roundedRectPath(ctx, r.x, r.y, r.w, r.h, r.h / 2);
  ctx.fill();
  ctx.strokeStyle = overridden ? GOLD : hexToRgba(CREAM, 0.2);
  ctx.lineWidth = overridden ? 1.3 : 1;
  ctx.stroke();
  ctx.fillStyle = overridden ? GOLD : CREAM;
  ctx.font = `500 ${Math.round(12 * fs)}px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, r.x + 13 * fs, r.y + r.h / 2 + 0.5);
  // Down-caret hint that it opens a list.
  const caretX = r.x + r.w - 11 * fs;
  const caretY = r.y + r.h / 2;
  ctx.strokeStyle = hexToRgba(overridden ? GOLD : CREAM, 0.6);
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(caretX - 3 * fs, caretY - 1.5 * fs);
  ctx.lineTo(caretX, caretY + 1.8 * fs);
  ctx.lineTo(caretX + 3 * fs, caretY - 1.5 * fs);
  ctx.stroke();
  ctx.restore();
}

// Popover listing the alternatives for one setting. Tapping a value applies it
// (setOverride); tapping anywhere else dismisses. Caller has already discarded
// the body hits, so only what we push here is live.
function drawSettingPicker(ctx, rect, bodyTop, def, cfg, fs) {
  // Dim the whole card body.
  ctx.save();
  ctx.fillStyle = 'rgba(10, 15, 34, 0.62)';
  roundedRectPath(ctx, rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4, 11);
  ctx.fill();
  ctx.restore();

  const optH = Math.round(36 * fs);
  const headerH = Math.round(34 * fs);
  const padV = Math.round(12 * fs);
  const boxW = Math.min(rect.w - 48, Math.round(300 * fs));
  const boxH = headerH + def.values.length * optH + padV;
  const boxX = Math.round(rect.x + (rect.w - boxW) / 2);
  let boxY = Math.round(rect.y + (rect.h - boxH) / 2);
  boxY = Math.max(Math.round(bodyTop), Math.min(boxY, Math.round(rect.y + rect.h - boxH - 12 * fs)));

  // Box.
  ctx.save();
  ctx.fillStyle = 'rgba(24, 30, 56, 0.98)';
  roundedRectPath(ctx, boxX, boxY, boxW, boxH, 10);
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Header.
  ctx.fillStyle = GOLD;
  ctx.font = `600 ${Math.round(13 * fs)}px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Choose ${def.label}`, boxX + 16 * fs, boxY + headerH / 2);
  drawDashedRule(ctx, boxX + 14 * fs, boxY + headerH - 2, boxW - 28 * fs);
  ctx.restore();

  // Options.
  const current = cfg[def.field];
  let oy = boxY + headerH;
  for (const value of def.values) {
    const isCur = current === value;
    ctx.save();
    if (isCur) {
      ctx.fillStyle = hexToRgba(GOLD, 0.1);
      roundedRectPath(ctx, boxX + 8 * fs, oy + 3, boxW - 16 * fs, optH - 6, 6);
      ctx.fill();
    }
    ctx.fillStyle = isCur ? GOLD : CREAM;
    ctx.font = `${isCur ? 600 : 400} ${Math.round(13 * fs)}px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.fmt(value), boxX + 20 * fs, oy + optH / 2);
    if (isCur) {
      // Check mark.
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      const kx = boxX + boxW - 22 * fs, ky = oy + optH / 2;
      ctx.beginPath();
      ctx.moveTo(kx - 4 * fs, ky);
      ctx.lineTo(kx - 1 * fs, ky + 3 * fs);
      ctx.lineTo(kx + 4 * fs, ky - 3 * fs);
      ctx.stroke();
    }
    ctx.restore();
    menuState.hits.push({ x: boxX, y: oy, w: boxW, h: optH, action: 'explore-set-option', value: { field: def.field, value } });
    oy += optH;
  }

  // Backdrop close — pushed LAST so option taps win.
  menuState.hits.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, action: 'explore-close-picker' });
}

// ─── Seeds history panel ────────────────────────────────────────────────────

function drawSeedsPanel(ctx, layout, game, settings) {
  const fs = fontScaleOf(settings);
  const rect = cardRect(layout, 360 * fs, 480 * fs);
  menuState.cardRect = rect;
  drawCard(ctx, rect);
  const startY = drawTitleBar(ctx, rect, 'Seeds', { showBack: true, fs });

  const padX = 20;
  const history = loadSeedHistory();
  // Difficulty tier per seed pair, from the richer telemetry log (it carries
  // endPhase, so a repeatedly-abandoned seed reads as the lost-cause top tier).
  const tierMap = seedTierMap(loadTelemetry());

  const subPx = Math.max(11, Math.round(11 * fs));
  ctx.save();
  ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
  ctx.font = `italic 400 ${subPx}px ${SERIF}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(
    history.length ? `${history.length} variant${history.length === 1 ? '' : 's'} mined · tap to replay, ⓘ for details` : 'no variants yet — play one in Explore',
    rect.x + padX, startY
  );
  ctx.restore();

  const viewportX = rect.x + padX;
  const viewportY = startY + subPx + 12;
  const viewportW = rect.w - padX * 2;
  const viewportH = rect.y + rect.h - viewportY - 16;

  const rowHeight = Math.round(48 * fs);
  const totalHeight = history.length * rowHeight;

  menuState.viewportY = viewportY;
  menuState.viewportH = viewportH;
  menuState.maxScrollY = Math.max(0, totalHeight - viewportH);
  menuState.scrollY = Math.max(0, Math.min(menuState.maxScrollY, menuState.scrollY));

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewportX - 4, viewportY, viewportW + 8, viewportH);
  ctx.clip();

  for (let i = 0; i < history.length; i++) {
    const rowY = viewportY + i * rowHeight - menuState.scrollY;
    if (rowY + rowHeight < viewportY || rowY > viewportY + viewportH) continue;
    const e = history[i];
    const isLostCause = seedKey(e) ? tierMap.get(seedKey(e)) === 'lost-cause' : false;

    ctx.save();
    ctx.fillStyle = isLostCause ? hexToRgba(EMBER, 0.06) : hexToRgba(CREAM, e.won ? 0.05 : 0.025);
    roundedRectPath(ctx, viewportX, rowY + 2, viewportW, rowHeight - 4, 6);
    ctx.fill();
    ctx.strokeStyle = isLostCause ? hexToRgba(EMBER, 0.5) : e.won ? hexToRgba(GOLD, 0.4) : hexToRgba(CREAM, 0.12);
    ctx.lineWidth = 1;
    roundedRectPath(ctx, viewportX, rowY + 2, viewportW, rowHeight - 4, 6);
    ctx.stroke();

    // Win star / loss dot — a lost cause gets a filled ember dot.
    if (e.won) drawStar(ctx, viewportX + 14, rowY + rowHeight / 2, 3.4 * fs, GOLD);
    else if (isLostCause) {
      ctx.fillStyle = hexToRgba(EMBER, 0.85);
      ctx.beginPath();
      ctx.arc(viewportX + 14, rowY + rowHeight / 2, 2.8 * fs, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = hexToRgba(CREAM, 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(viewportX + 14, rowY + rowHeight / 2, 2.6 * fs, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Score.
    ctx.fillStyle = CREAM;
    ctx.font = `600 ${Math.round(15 * fs)}px ${SERIF}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const scoreText = fmtInt(e.score | 0);
    ctx.fillText(scoreText, viewportX + 28, rowY + rowHeight * 0.38);
    const scoreW = ctx.measureText(scoreText).width;

    // Intrinsic difficulty badge — board hardness, just after the score. (The
    // lost-cause accent above is the OUTCOME; these two read independently.)
    const rating = difficultyRating(effectiveConfig(e.settingsSeed >>> 0, e.overrides));
    drawDifficultyBadge(ctx, viewportX + 28 + scoreW + 8, rowY + rowHeight * 0.38, rating.key, fs);

    // Summary line. Lost causes lead with a red tag, then a compact config.
    const packName = STENCIL_PACKS[e.stencilPack]?.name || e.stencilPack || '';
    const summaryY = rowY + rowHeight * 0.7;
    let summaryX = viewportX + 28;
    if (isLostCause) {
      ctx.fillStyle = hexToRgba(EMBER, 0.95);
      ctx.font = `700 ${Math.round(9.5 * fs)}px ${SANS}`;
      const tag = 'LOST CAUSE';
      ctx.fillText(tag, summaryX, summaryY);
      summaryX += ctx.measureText(tag).width + 6;
    }
    ctx.fillStyle = hexToRgba(CREAM, 0.5);
    ctx.font = `400 ${Math.round(9.5 * fs)}px ${SANS}`;
    const summary = isLostCause
      ? `· ${e.colors}c ${e.isSpeedMode ? 'Timed' : 'Classic'}`
      : `${e.colors} colors · ${e.isSpeedMode ? 'Timed' : 'Classic'}${packName ? ' · ' + packName : ''}`;
    ctx.fillText(summary, summaryX, summaryY);

    // Info button (opens the detail card) on the far right; seeds tuck left of it.
    const rightPad = menuState.maxScrollY > 0 ? 16 : 10;
    const infoR = 9 * fs;
    const infoCx = viewportX + viewportW - rightPad - infoR;
    const infoCy = rowY + rowHeight / 2;
    drawInfoButton(ctx, infoCx, infoCy, infoR, isLostCause ? EMBER : CREAM, 0.55);

    // Seeds, right-aligned to the left of the info button.
    ctx.fillStyle = hexToRgba(CREAM, 0.45);
    ctx.font = `400 ${Math.round(9 * fs)}px ${SANS}`;
    ctx.textAlign = 'right';
    const seedRightX = infoCx - infoR - 8;
    ctx.fillText(`s#${e.settingsSeed >>> 0}`, seedRightX, rowY + rowHeight * 0.38);
    ctx.fillText(`b#${e.boardSeed >>> 0}`, seedRightX, rowY + rowHeight * 0.7);
    ctx.restore();

    // Info hit pushed FIRST (first match wins) so tapping ⓘ opens detail; the
    // rest of the row still plays the seed instantly.
    const infoPad = 4 * fs;
    menuState.hits.push({ x: infoCx - infoR - infoPad, y: infoCy - infoR - infoPad,
      w: (infoR + infoPad) * 2, h: (infoR + infoPad) * 2, action: 'show-seed-detail', value: e });
    menuState.hits.push({ x: viewportX, y: rowY, w: viewportW, h: rowHeight, action: 'pick-seed-history', value: e });
  }
  ctx.restore();

  // Scrollbar.
  if (menuState.maxScrollY > 0) {
    const sbW = 3;
    const sbX = viewportX + viewportW - sbW;
    const thumbH = Math.max(16, viewportH * (viewportH / totalHeight));
    const thumbY = viewportY + (viewportH - thumbH) * (menuState.scrollY / menuState.maxScrollY);
    ctx.save();
    ctx.fillStyle = 'rgba(245, 233, 201, 0.05)';
    roundedRectPath(ctx, sbX, viewportY, sbW, viewportH, 2);
    ctx.fill();
    ctx.fillStyle = hexToRgba(GOLD, 0.7);
    roundedRectPath(ctx, sbX, thumbY, sbW, thumbH, 2);
    ctx.fill();
    ctx.restore();
  }
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

function drawMiniModeIcon(ctx, isSpeedMode, cx, cy, fs, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (isSpeedMode) {
    // Lightning bolt
    ctx.beginPath();
    ctx.moveTo(cx + 1 * fs, cy - 5 * fs);
    ctx.lineTo(cx - 3 * fs, cy + 0 * fs);
    ctx.lineTo(cx - 1 * fs, cy + 0 * fs);
    ctx.lineTo(cx - 2 * fs, cy + 5 * fs);
    ctx.lineTo(cx + 3 * fs, cy - 0 * fs);
    ctx.lineTo(cx + 1 * fs, cy - 0 * fs);
    ctx.closePath();
    ctx.fill();
  } else {
    // Crescent Moon
    ctx.beginPath();
    ctx.arc(cx, cy, 3.8 * fs, 0, Math.PI * 2);
    ctx.fill();
    // crescent shadow
    ctx.fillStyle = PANEL_BG;
    ctx.beginPath();
    ctx.arc(cx + 1.8 * fs, cy - 0.4 * fs, 3.6 * fs, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMiniStencilIcon(ctx, stencilPack, cx, cy, fs, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1 * fs;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stencilPack === 'plain') {
    // Circle outline
    ctx.beginPath();
    ctx.arc(cx, cy, 3.8 * fs, 0, Math.PI * 2);
    ctx.stroke();
  } else if (stencilPack === 'bugs') {
    // Bug outline
    ctx.beginPath();
    // Body line
    ctx.moveTo(cx, cy - 3.8 * fs);
    ctx.lineTo(cx, cy + 3.8 * fs);
    // Legs
    ctx.moveTo(cx - 3.2 * fs, cy - 1 * fs);
    ctx.lineTo(cx + 3.2 * fs, cy - 1 * fs);
    ctx.moveTo(cx - 3.2 * fs, cy + 1.5 * fs);
    ctx.lineTo(cx + 3.2 * fs, cy + 1.5 * fs);
    ctx.stroke();
    // Head dot
    ctx.beginPath();
    ctx.arc(cx, cy - 3.8 * fs, 0.9 * fs, 0, Math.PI * 2);
    ctx.fill();
  } else if (stencilPack === 'flowers') {
    // Simple flower
    for (let a = 0; a < Math.PI * 2; a += (Math.PI * 2) / 5) {
      const px = cx + Math.cos(a) * 2.2 * fs;
      const py = cy + Math.sin(a) * 2.2 * fs;
      ctx.beginPath();
      ctx.arc(px, py, 1 * fs, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 0.9 * fs, 0, Math.PI * 2);
    ctx.fill();
  } else if (stencilPack === 'dragons') {
    // Wave/Snake
    ctx.beginPath();
    ctx.moveTo(cx - 2.8 * fs, cy - 2.8 * fs);
    ctx.bezierCurveTo(cx + 2.8 * fs, cy - 2.8 * fs, cx - 2.8 * fs, cy + 2.8 * fs, cx + 2.8 * fs, cy + 2.8 * fs);
    ctx.stroke();
  } else if (stencilPack === 'random') {
    // 2x2 dot grid
    ctx.fillRect(cx - 2.2 * fs, cy - 2.2 * fs, 1.8 * fs, 1.8 * fs);
    ctx.fillRect(cx + 0.4 * fs, cy - 2.2 * fs, 1.8 * fs, 1.8 * fs);
    ctx.fillRect(cx - 2.2 * fs, cy + 0.4 * fs, 1.8 * fs, 1.8 * fs);
    ctx.fillRect(cx + 0.4 * fs, cy + 0.4 * fs, 1.8 * fs, 1.8 * fs);
  }
  ctx.restore();
}

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
