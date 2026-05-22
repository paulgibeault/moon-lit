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

const PANEL_BG    = 'rgba(20, 26, 50, 0.94)';
const SCRIM_BG    = 'rgba(10, 15, 34, 0.62)';
const BORDER      = `rgba(232, 183, 112, 0.32)`;   // PALETTE.moonHalo @ 32%
const BORDER_SOFT = `rgba(232, 183, 112, 0.18)`;
const RULE        = `rgba(232, 183, 112, 0.16)`;
const CREAM       = PALETTE.moon;
const GOLD        = PALETTE.moonHalo;

const menuState = {
  panel: 'hidden',     // 'hidden' | 'root' | 'records' | 'stages'
  stagesPage: 0,
  fade: 0,             // 0..1
  fadeTarget: 0,
  hits: [],            // [{x, y, w, h, action, value}]
  // Rebuilt every draw — geometry the input layer reads.
  buttonRect: null,
};

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
  if (menuState.panel === 'hidden') menuState.stagesPage = 0;
  menuState.panel = 'root';
  menuState.fadeTarget = 1;
}
export function closeMenu() {
  menuState.fadeTarget = 0;
}
export function setMenuPanel(panel) {
  if (panel === 'hidden') { closeMenu(); return; }
  menuState.panel = panel;
  menuState.fadeTarget = 1;
}

// Per-frame tick. Easing is a fixed step per call — main.js drives this from
// the rAF loop, so it scales naturally with frame cadence (60fps vs 30fps
// PERF_MODE). Reduced motion snaps to the target.
export function tickMenu(settings) {
  const reduced = !!(settings && settings.reducedMotion);
  if (reduced) {
    menuState.fade = menuState.fadeTarget;
  } else {
    const step = 0.18;
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

// Hit-test a pointer at canvas-local (x, y). Returns true if the event was
// consumed (the menu took it). `actions` is { onStartLevel(n), onResume() }.
export function hitTestMenu(x, y, actions) {
  // The menu button is always present; check first.
  const btn = menuState.buttonRect;
  if (btn && pointIn(x, y, btn)) {
    if (isMenuPanelOpen()) closeMenu();
    else openMenu();
    return true;
  }
  if (!isMenuPanelOpen()) return false;
  // Mid-dismissal: panel is fading out (fadeTarget=0). Swallow taps so the
  // player can't trigger a stale menu item that's already on its way out,
  // but don't fall through to the game underneath either — the dim scrim is
  // still visible and a tap should belong to it.
  if (menuState.fadeTarget === 0) return true;

  for (const h of menuState.hits) {
    if (!pointIn(x, y, h)) continue;
    switch (h.action) {
      case 'show-root':    menuState.panel = 'root'; return true;
      case 'show-stages':  menuState.panel = 'stages'; return true;
      case 'show-records': menuState.panel = 'records'; return true;
      case 'close':        closeMenu(); actions?.onResume?.(); return true;
      case 'pick-stage':   closeMenu(); actions?.onStartLevel?.(h.value); return true;
      case 'page-prev':    menuState.stagesPage = Math.max(0, menuState.stagesPage - 1); return true;
      case 'page-next':    menuState.stagesPage = h.value; return true;
    }
  }
  // Tap fell inside the scrim but outside any control — dismiss.
  closeMenu();
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
  const rect = cardRect(layout, 320 * fs, 320 * fs);
  drawCard(ctx, rect);
  const startY = drawTitleBar(ctx, rect, 'Moon Lit', { fs });

  const padX = 24;
  const rowH = Math.round(48 * fs);
  const items = [
    { label: 'Stages',    sub: 'pick or revisit a stage', action: 'show-stages',  glyph: 'stages' },
    { label: 'Records',   sub: 'lanterns lit, best scores', action: 'show-records', glyph: 'records' },
    { label: 'Continue',  sub: 'back to the river',         action: 'close',         glyph: 'moon' },
  ];

  let y = startY + 6;
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

const TILES_PER_PAGE = 12;     // 3 columns × 4 rows

function drawStagesPanel(ctx, layout, game, settings, stats) {
  const fs = fontScaleOf(settings);
  const rect = cardRect(layout, 360 * fs, 480 * fs);
  drawCard(ctx, rect);
  const startY = drawTitleBar(ctx, rect, 'Choose a stage', { showBack: true, fs });

  const padX = 20;
  const innerW = rect.w - padX * 2;
  const cols = 3;
  const tileW = Math.floor((innerW - 12 * (cols - 1)) / cols);
  const tileH = Math.round(tileW * 1.15);

  // Range of stages the player can pick. bestLevel in stats is highest reached
  // (set to game.level + 1 on a clear), so anything <= bestLevel is unlocked.
  const reached = Math.max(1, (stats && stats.bestLevel) | 0 || 1, game.level | 0);
  const totalStages = Math.max(reached, 1);
  const pages = Math.max(1, Math.ceil(totalStages / TILES_PER_PAGE));
  if (menuState.stagesPage >= pages) menuState.stagesPage = pages - 1;
  const page = menuState.stagesPage;
  const first = page * TILES_PER_PAGE + 1;
  const last  = Math.min(totalStages, (page + 1) * TILES_PER_PAGE);

  // Subhead — current stage + progress hint.
  const subPx = Math.max(11, Math.round(11 * fs));
  ctx.save();
  ctx.fillStyle = hexToRgba(CREAM, HUD_OPACITY.soft);
  ctx.font = `italic 400 ${subPx}px ${SERIF}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(
    `currently on stage ${game.level} · ${reached} reached`,
    rect.x + padX, startY,
  );
  ctx.restore();

  const gridY = startY + subPx + 12;
  for (let i = first; i <= last; i++) {
    const idx = i - first;
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const tx = rect.x + padX + col * (tileW + 12);
    const ty = gridY + row * (tileH + 10);
    const data = (stats && stats.levels && stats.levels[String(i)]) || null;
    drawStageTile(ctx, tx, ty, tileW, tileH, i, game.level, data, fs);
    menuState.hits.push({ x: tx, y: ty, w: tileW, h: tileH, action: 'pick-stage', value: i });
  }

  // Pagination — only if more than one page.
  if (pages > 1) {
    const navY = rect.y + rect.h - 36;
    const cx = rect.x + rect.w / 2;
    drawPagination(ctx, cx, navY, page, pages, fs);
  }
}

function drawStageTile(ctx, x, y, w, h, level, currentLevel, data, fs) {
  const cleared = !!(data && data.cleared);
  const played  = !!(data && data.plays);
  const isCurrent = level === currentLevel;
  const bestScore = data ? data.bestScore | 0 : 0;
  const cfg = levelConfig(level);

  ctx.save();
  // Base tile — slightly warmer for cleared, dim for never-played.
  const baseAlpha = cleared ? 0.10 : played ? 0.07 : 0.05;
  ctx.fillStyle = hexToRgba(CREAM, baseAlpha);
  roundedRectPath(ctx, x, y, w, h, 9);
  ctx.fill();

  // Border — cream hairline; current stage gets a gold ring with a small glow.
  if (isCurrent) {
    if (!(PERF_CONFIG.disableMobileShadows && PERF_MODE)) {
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 8;
    }
    ctx.strokeStyle = hexToRgba(GOLD, 0.75);
    ctx.lineWidth = 1.4;
  } else if (cleared) {
    ctx.strokeStyle = hexToRgba(GOLD, 0.45);
    ctx.lineWidth = 1;
  } else {
    ctx.strokeStyle = hexToRgba(CREAM, 0.22);
    ctx.lineWidth = 1;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Stage number — large serif, italic feels lantern-paper.
  const numPx = Math.max(22, Math.round(w * 0.36 * fs));
  ctx.fillStyle = cleared ? CREAM : hexToRgba(CREAM, 0.78);
  ctx.font = `300 ${numPx}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), x + w / 2, y + h * 0.36);

  // Best score (or em-dash for never-played).
  const scorePx = Math.max(10, Math.round(10 * fs));
  ctx.font = `500 ${scorePx}px ${SERIF}`;
  ctx.fillStyle = hexToRgba(CREAM, played ? 0.85 : 0.35);
  ctx.fillText(bestScore ? fmtInt(bestScore) : '—', x + w / 2, y + h * 0.66);

  // Palette ribbon — tiny color dots showing which lantern colors this stage
  // uses. A fine touch that previews difficulty at a glance.
  const dotR = 2.2;
  const gap = dotR * 2.4;
  const totalDots = cfg.colors;
  const stripW = (totalDots - 1) * gap;
  const dotY = y + h * 0.84;
  for (let i = 0; i < totalDots; i++) {
    const key = COLOR_KEYS[i];
    const cx = x + w / 2 - stripW / 2 + i * gap;
    ctx.fillStyle = hexToRgba(COLORS[key], cleared ? 0.95 : 0.55);
    ctx.beginPath();
    ctx.arc(cx, dotY, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Top-right corner: ✦ for cleared, ◦ for attempted-not-cleared.
  if (cleared) {
    drawStar(ctx, x + w - 10, y + 10, 3, hexToRgba(GOLD, 0.95));
  } else if (played) {
    ctx.strokeStyle = hexToRgba(CREAM, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + w - 10, y + 10, 2.4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPagination(ctx, cx, y, page, pages, fs) {
  const px = Math.max(11, Math.round(11 * fs));
  const gap = 14;
  const dotR = 3;
  const totalW = (pages - 1) * gap;
  // Prev arrow.
  if (page > 0) {
    const r = { x: cx - totalW / 2 - 36, y: y - 12, w: 24, h: 24, action: 'page-prev' };
    menuState.hits.push(r);
    ctx.save();
    ctx.strokeStyle = hexToRgba(CREAM, 0.7);
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.6, r.y + 6);
    ctx.lineTo(r.x + r.w * 0.3, r.y + 12);
    ctx.lineTo(r.x + r.w * 0.6, r.y + 18);
    ctx.stroke();
    ctx.restore();
  }
  // Page dots.
  for (let i = 0; i < pages; i++) {
    const dx = cx - totalW / 2 + i * gap;
    ctx.save();
    ctx.fillStyle = hexToRgba(i === page ? CREAM : CREAM, i === page ? 0.95 : 0.3);
    ctx.beginPath();
    ctx.arc(dx, y, dotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Each dot is a tap target that jumps to that page.
    menuState.hits.push({ x: dx - 10, y: y - 12, w: 20, h: 24, action: 'page-next', value: i });
  }
  // Next arrow.
  if (page < pages - 1) {
    const r = { x: cx + totalW / 2 + 12, y: y - 12, w: 24, h: 24, action: 'page-next', value: page + 1 };
    menuState.hits.push(r);
    ctx.save();
    ctx.strokeStyle = hexToRgba(CREAM, 0.7);
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(r.x + r.w * 0.4, r.y + 6);
    ctx.lineTo(r.x + r.w * 0.7, r.y + 12);
    ctx.lineTo(r.x + r.w * 0.4, r.y + 18);
    ctx.stroke();
    ctx.restore();
  }
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
