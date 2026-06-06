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
import { puzzleConfig } from '../puzzles.js';

const PANEL_BG    = 'rgba(20, 26, 50, 0.94)';
const SCRIM_BG    = 'rgba(10, 15, 34, 0.62)';
const BORDER      = `rgba(232, 183, 112, 0.32)`;   // PALETTE.moonHalo @ 32%
const BORDER_SOFT = `rgba(232, 183, 112, 0.18)`;
const RULE        = `rgba(232, 183, 112, 0.16)`;
const CREAM       = PALETTE.moon;
const GOLD        = PALETTE.moonHalo;

const menuState = {
  panel: 'hidden',     // 'hidden' | 'root' | 'records' | 'stages' | 'puzzles' | 'options'
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
}
export function closeMenu() {
  menuState.fadeTarget = 0;
}
export function setMenuPanel(panel) {
  if (panel === 'hidden') { closeMenu(); return; }
  menuState.panel = panel;
  menuState.fadeTarget = 1;
  menuState.scrollY = 0;
  menuState.isDragging = false;
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
    return true;
  }
  if (!isMenuPanelOpen() || menuState.fadeTarget === 0) return false;

  const card = menuState.cardRect;
  // If we press outside the card, it is a scrim click, so don't drag-scroll
  if (card && !pointIn(x, y, card)) {
    return true;
  }

  // Start drag scroll
  menuState.isDragging = true;
  menuState.dragStartY = clientY;
  menuState.dragStartScrollY = menuState.scrollY;
  menuState.dragMoved = false;
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

  // Check buttons / hits
  for (const h of menuState.hits) {
    if (!pointIn(x, y, h)) continue;
    switch (h.action) {
      case 'show-root':    setMenuPanel('root'); return true;
      case 'show-stages':  setMenuPanel('stages'); return true;
      case 'show-puzzles': setMenuPanel('puzzles'); return true;
      case 'show-options': setMenuPanel('options'); return true;
      case 'show-records': setMenuPanel('records'); return true;
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
      case 'close':        handleClose(); return true;
      case 'pick-stage':   closeMenu(); actions?.onStartLevel?.(h.value); return true;
      case 'pick-puzzle':  closeMenu(); actions?.onStartPuzzle?.(h.value); return true;
    }
  }

  // Tap fell inside the scrim but outside the card - dismiss
  const card = menuState.cardRect;
  if (card && !pointIn(x, y, card)) {
    handleClose();
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
  if (menuState.panel === 'root')         drawRootPanel(ctx, layout, settings);
  else if (menuState.panel === 'records') drawRecordsPanel(ctx, layout, settings, stats, scores);
  else if (menuState.panel === 'stages')  drawStagesPanel(ctx, layout, game, settings, stats);
  else if (menuState.panel === 'puzzles') drawPuzzlesPanel(ctx, layout, game, settings, stats);
  else if (menuState.panel === 'options') drawOptionsPanel(ctx, layout, settings);
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

function drawTitleBar(ctx, rect, title, opts = {}) {
  const { showBack = false } = opts;
  const padX = 18;
  const titleY = rect.y + 18;
  const titlePx = 18;
  const fs = opts.fs || 1;

  ctx.save();
  // Small moon glyph or back-arrow on the left.
  if (showBack) {
    const bx = rect.x + padX;
    const by = titleY + 10;
    const back = { x: bx - 6, y: by - 14, w: 28, h: 28, action: 'show-root' };
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

function drawRootPanel(ctx, layout, settings) {
  const fs = fontScaleOf(settings);
  const gameMode = Arcade.state.get('gameMode') || 'campaign';
  
  const items = [];
  items.push({ label: 'Play', sub: 'resume game from last level', action: 'close', glyph: 'play' });
  if (gameMode === 'puzzle') {
    items.push({ label: 'Puzzles', sub: '50 brain-teaser challenges', action: 'show-puzzles', glyph: 'puzzles' });
  } else {
    items.push({ label: 'Stages', sub: 'select or revisit a stage', action: 'show-stages', glyph: 'stages' });
  }
  
  items.push(
    { label: 'Options',     sub: 'configure art and launch',  action: 'show-options',  glyph: 'stencils' },
    { label: 'Records',     sub: 'lanterns lit, best scores', action: 'show-records',  glyph: 'records' }
  );

  // Compute card height dynamically: title + mode selector + divider + items
  const cardH = Math.round((210 + items.length * 48) * fs);
  const rect = cardRect(layout, 320 * fs, cardH);
  menuState.cardRect = rect;
  drawCard(ctx, rect);
  const startY = drawTitleBar(ctx, rect, 'Moon Lit', { fs });

  const padX = 20;
  const innerW = rect.w - padX * 2;
  let y = startY + 6;

  // ─── Game Mode Grid (2x2) ───
  y = drawSectionHeader(ctx, rect.x + padX, y, 'Game Mode', fs);

  const colW = Math.floor((innerW - 12) / 2);
  const colH = Math.round(48 * fs);

  const modeOpts = [
    { id: 'campaign', label: 'Campaign', sub: 'Default levels', glyph: 'stages' },
    { id: 'zen',      label: 'Zen',      sub: 'Classic play',   glyph: 'moon' },
    { id: 'speed',    label: 'Speed',    sub: 'Rapid fire',     glyph: 'speed' },
    { id: 'puzzle',   label: 'Puzzle',   sub: 'Teaser puzzles',  glyph: 'puzzles' }
  ];

  const modeStartY = y;
  for (let i = 0; i < 4; i++) {
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

  y += 2 * colH + 8 + 10;
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

  const rowHeight = Math.round(42 * fs);
  const totalHeight = totalStages * rowHeight;

  menuState.viewportY = viewportY;
  menuState.viewportH = viewportH;
  menuState.maxScrollY = Math.max(0, totalHeight - viewportH);
  menuState.scrollY = Math.max(0, Math.min(menuState.maxScrollY, menuState.scrollY));

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

    // Label
    const labelPx = Math.round(14 * fs);
    ctx.fillStyle = isCurrent ? GOLD : isLocked ? hexToRgba(CREAM, 0.25) : CREAM;
    ctx.font = `600 ${labelPx}px ${SERIF}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const labelText = `Stage ${i}`;
    ctx.fillText(labelText, viewportX + 12, rowY + rowHeight / 2);
    const labelW = ctx.measureText(labelText).width;

    const cfg = levelConfig(i);

    // Draw Mini Icons next to number
    const iconColor = isCurrent ? GOLD : isLocked ? hexToRgba(CREAM, 0.2) : hexToRgba(CREAM, 0.75);
    const modeCx = viewportX + 12 + labelW + 10 * fs;
    const stencilCx = modeCx + 14 * fs;
    drawMiniModeIcon(ctx, cfg.isSpeedMode, modeCx, rowY + rowHeight / 2, fs, iconColor);
    drawMiniStencilIcon(ctx, cfg.stencilPack, stencilCx, rowY + rowHeight / 2, fs, iconColor);

    // Cleared Star or Lock (shifted right to make room for mini icons)
    const lockX = viewportX + 115 * fs;
    if (isLocked) {
      const lockY = rowY + rowHeight / 2;
      ctx.save();
      ctx.strokeStyle = hexToRgba(CREAM, 0.25);
      ctx.lineWidth = 1.2;
      // draw lock shackle (loop)
      ctx.beginPath();
      ctx.arc(lockX, lockY - 2.5 * fs, 2.5 * fs, Math.PI, 0);
      ctx.stroke();
      // draw lock body
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

    // Palette Preview (shifted right to make room)
    const dotR = 2 * fs;
    const gap = dotR * 2.4;
    const totalDots = cfg.colors;
    const startDotX = viewportX + 145 * fs;
    for (let c = 0; c < totalDots; c++) {
      const key = COLOR_KEYS[c];
      const cx = startDotX + c * gap;
      ctx.fillStyle = hexToRgba(COLORS[key], isCurrent || cleared ? 0.95 : isLocked ? 0.15 : 0.55);
      ctx.beginPath();
      ctx.arc(cx, rowY + rowHeight / 2, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Text details (e.g. Insects · Timed) if viewport width allows it
    if (viewportW > 280 * fs) {
      const detailPx = Math.round(10 * fs);
      ctx.font = `400 ${detailPx}px ${SANS}`;
      ctx.fillStyle = isCurrent ? GOLD : isLocked ? hexToRgba(CREAM, 0.2) : hexToRgba(CREAM, 0.45);
      ctx.textAlign = 'left';
      const packName = STENCIL_PACKS[cfg.stencilPack]?.name || cfg.stencilPack;
      const modeName = cfg.isSpeedMode ? 'Timed' : 'Classic';
      ctx.fillText(`${packName} · ${modeName}`, viewportX + 190 * fs, rowY + rowHeight / 2);
    }

    // Best Score
    const scorePx = Math.round(11 * fs);
    ctx.font = `500 ${scorePx}px ${SERIF}`;
    ctx.fillStyle = hexToRgba(CREAM, isLocked ? 0.15 : played ? 0.85 : 0.3);
    ctx.textAlign = 'right';
    const scoreRightX = viewportX + viewportW - (menuState.maxScrollY > 0 ? 18 : 12);
    ctx.fillText(bestScore ? fmtInt(bestScore) : '—', scoreRightX, rowY + rowHeight / 2);

    ctx.restore();

    // Register hit target with scrolled coordinates (if unlocked)
    if (!isLocked) {
      menuState.hits.push({
        x: viewportX,
        y: rowY,
        w: viewportW,
        h: rowHeight,
        action: 'pick-stage',
        value: i
      });
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
    for (let i = 1; i <= 50; i++) {
      if (stats.puzzles[String(i)] && stats.puzzles[String(i)].cleared) {
        maxCleared = Math.max(maxCleared, i);
      }
    }
  }
  const unlockedCount = 50; // temporarily unlocked for testing

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
  const totalHeight = 50 * rowHeight;

  menuState.viewportY = viewportY;
  menuState.viewportH = viewportH;
  menuState.maxScrollY = Math.max(0, totalHeight - viewportH);
  menuState.scrollY = Math.max(0, Math.min(menuState.maxScrollY, menuState.scrollY));

  // Content Area
  ctx.save();
  ctx.beginPath();
  ctx.rect(viewportX - 4, viewportY, viewportW + 8, viewportH);
  ctx.clip();

  for (let i = 1; i <= 50; i++) {
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
