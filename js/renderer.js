import {
  COLORS, PALETTE, GRID,
  BOARD_MARGIN_TOP, BOARD_MARGIN_BOTTOM, BOARD_MARGIN_SIDE,
  TRELLIS_HEIGHT, DEAD_LINE_OFFSET,
} from './constants.js';
import { hexToPixel, hexCorners, gridPixelSize } from './hex-math.js';

export function computeLayout(viewW, viewH, cols = GRID.cols, rows = GRID.rows) {
  const availW = viewW - BOARD_MARGIN_SIDE * 2;
  const availH = viewH - BOARD_MARGIN_TOP - BOARD_MARGIN_BOTTOM;
  const SQRT3 = Math.sqrt(3);
  const sizeFromW = availW / (SQRT3 * (cols + 0.5));
  const sizeFromH = availH / (1.5 * (rows - 1) + 2);
  const size = Math.max(8, Math.floor(Math.min(sizeFromW, sizeFromH)));

  const grid = gridPixelSize(cols, rows, size);
  const originX = BOARD_MARGIN_SIDE + size * SQRT3 * 0.5 + (availW - grid.width) / 2;
  const originY = BOARD_MARGIN_TOP + size;

  return { size, originX, originY, cols, rows, viewW, viewH };
}

export function render(ctx, layout, board, settings) {
  const { viewW, viewH } = layout;
  drawBackground(ctx, viewW, viewH);
  drawMoon(ctx, viewW, viewH, settings.reducedMotion);
  drawTrellis(ctx, layout);
  drawBoard(ctx, layout, board);
  drawDeadLine(ctx, layout);
}

function drawBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, PALETTE.bgTop);
  grad.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawMoon(ctx, w, h, reducedMotion) {
  const cx = w * 0.78;
  const cy = h * 0.14;
  const r = Math.min(w, h) * 0.07;

  if (!reducedMotion) {
    const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.4);
    halo.addColorStop(0, PALETTE.moonHalo + '33');
    halo.addColorStop(1, PALETTE.moonHalo + '00');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = PALETTE.moon;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrellis(ctx, layout) {
  const { viewW, size, originY } = layout;
  const top = originY - size - TRELLIS_HEIGHT;
  ctx.fillStyle = PALETTE.trellis;
  ctx.fillRect(0, top, viewW, TRELLIS_HEIGHT);

  ctx.strokeStyle = PALETTE.trellisKnot;
  ctx.lineWidth = 1;
  const knotSpacing = size * Math.sqrt(3);
  for (let x = knotSpacing * 0.5; x < viewW; x += knotSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + TRELLIS_HEIGHT);
    ctx.stroke();
  }
}

function drawDeadLine(ctx, layout) {
  const { viewW, size, originY, rows } = layout;
  const lastRowY = originY + (rows - 1) * 1.5 * size;
  const y = lastRowY + size + DEAD_LINE_OFFSET;
  ctx.strokeStyle = PALETTE.deadLine;
  ctx.setLineDash([6, 8]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(viewW, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawBoard(ctx, layout, board) {
  const { size } = layout;
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      const { x, y } = hexToPixel(col, row, layout);
      const cell = board.cells[row][col];
      if (cell) drawLantern(ctx, x, y, size, cell.color);
      else drawEmptyCell(ctx, x, y, size);
    }
  }
}

function drawEmptyCell(ctx, cx, cy, size) {
  const corners = hexCorners(cx, cy, size * 0.92);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const c = corners[i];
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawLantern(ctx, cx, cy, size, colorKey) {
  const r = size * 0.78;
  const fill = COLORS[colorKey] || PALETTE.ember;

  const grad = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
  grad.addColorStop(0, mixWithWhite(fill, 0.35));
  grad.addColorStop(0.7, fill);
  grad.addColorStop(1, mixWithBlack(fill, 0.4));

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = mixWithBlack(fill, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
}

function mixWithWhite(hex, t) {
  return mixHex(hex, '#FFFFFF', t);
}
function mixWithBlack(hex, t) {
  return mixHex(hex, '#000000', t);
}
function mixHex(a, b, t) {
  const ra = parseInt(a.slice(1, 3), 16), ga = parseInt(a.slice(3, 5), 16), ba = parseInt(a.slice(5, 7), 16);
  const rb = parseInt(b.slice(1, 3), 16), gb = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba + (bb - ba) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}
