import {
  COLORS, PALETTE, GRID,
  BOARD_MARGIN_TOP, BOARD_MARGIN_BOTTOM, BOARD_MARGIN_SIDE,
  TRELLIS_HEIGHT, DEAD_LINE_OFFSET, LANE_LANTERNS,
  BURST_SCALE,
} from './constants.js';
import { launcherTip, traceAimLine, PHASE } from './game.js';
import { getLanternSprite, getBurstSheet } from './assets.js';

const SQRT3 = Math.sqrt(3);

// Build a viewport-derived layout. Lantern radius is sized to fit `cols`
// lanterns plus LANE_LANTERNS bounce-lanes on each side, and to fit
// `maxRows` close-packed rows between trellis and dead-line.
export function computeLayout(viewW, viewH, cols = GRID.cols, maxRows = GRID.maxRows) {
  const availW = viewW - BOARD_MARGIN_SIDE * 2;
  const availH = viewH - BOARD_MARGIN_TOP - BOARD_MARGIN_BOTTOM;
  // Width budget: 2r per lantern in the widest (even) row + 2r*LANE_LANTERNS
  // per side. Odd rows are narrower (cols-1 lanterns offset by r), so they
  // sit fully within the even-row strip and contribute no extra width.
  const sizeFromW = availW / (2 * (cols + 2 * LANE_LANTERNS));
  // Height budget: 2r (top row) + (maxRows-1)*sqrt(3)*r + DEAD_LINE_OFFSET.
  const sizeFromH = (availH - DEAD_LINE_OFFSET) / (2 + (maxRows - 1) * SQRT3);
  const size = Math.max(8, Math.floor(Math.min(sizeFromW, sizeFromH)));
  const r = size;

  const lanternStripW = 2 * r * cols;
  const laneW = 2 * r * LANE_LANTERNS;
  const totalPlayW = lanternStripW + 2 * laneW;
  const playLeft = BOARD_MARGIN_SIDE + (availW - totalPlayW) / 2;

  const wallLeft  = playLeft;
  const wallRight = playLeft + totalPlayW;
  const originX   = playLeft + laneW + r;  // center of (col 0, even row 0)

  const trellisY = BOARD_MARGIN_TOP + TRELLIS_HEIGHT;
  const lastRowCenterY = trellisY + r + (maxRows - 1) * SQRT3 * r;
  const deadLineY = lastRowCenterY + r + DEAD_LINE_OFFSET;

  return {
    size: r, originX, trellisY, deadLineY,
    cols, maxRows,
    viewW, viewH,
    wallLeft, wallRight,
  };
}

export function render(ctx, layout, game, settings) {
  const { viewW, viewH } = layout;
  drawBackground(ctx, viewW, viewH);
  drawMoon(ctx, viewW, viewH, settings.reducedMotion);
  drawTrellis(ctx, layout);
  drawBoard(ctx, layout, game.board);
  drawDeadLine(ctx, layout);
  if (game.phase === PHASE.AIMING) {
    drawAimLine(ctx, layout, game);
  }
  drawLauncher(ctx, layout, game);
  drawShotQueue(ctx, layout, game);
  if (game.shot) drawProjectile(ctx, game.shot, layout);
  drawBursts(ctx, layout, game, settings);
  drawScore(ctx, layout, game);
  drawDescentMeter(ctx, layout, game);
  if (game.phase === PHASE.WIN || game.phase === PHASE.GAME_OVER) {
    drawEndOverlay(ctx, layout, game);
  }
}

function drawDescentMeter(ctx, layout, game) {
  if (game.shotsUntilDescent == null) return;
  const fontPx = Math.max(11, Math.round(layout.size * 0.55));
  ctx.save();
  ctx.fillStyle = 'rgba(245, 233, 201, 0.55)';
  ctx.font = `500 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(`descent in ${game.shotsUntilDescent}`, layout.viewW - 12, 10);
  ctx.restore();
}

function drawEndOverlay(ctx, layout, game) {
  const { viewW, viewH } = layout;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 15, 34, 0.78)';
  ctx.fillRect(0, 0, viewW, viewH);

  const won = game.phase === PHASE.WIN;
  const title = won ? `Stage ${game.level} cleared` : 'Trellis collapsed';
  const titleColor = won ? PALETTE.moon : PALETTE.deadLine;
  const titlePx = Math.max(28, Math.round(layout.size * 1.6));
  const subPx   = Math.max(14, Math.round(layout.size * 0.7));

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = titleColor;
  ctx.font = `700 ${titlePx}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(title, viewW / 2, viewH / 2 - titlePx * 0.6);

  ctx.fillStyle = PALETTE.moon;
  ctx.font = `500 ${subPx}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(`Score ${game.score | 0}`, viewW / 2, viewH / 2 + subPx * 0.4);
  ctx.fillStyle = 'rgba(245, 233, 201, 0.7)';
  const cta = won ? `click for stage ${game.level + 1}` : 'click to retry';
  ctx.fillText(cta, viewW / 2, viewH / 2 + subPx * 2.2);
  ctx.restore();
}

function drawScore(ctx, layout, game) {
  const fontPx = Math.max(14, Math.round(layout.size * 0.95));
  const subPx  = Math.max(11, Math.round(layout.size * 0.55));
  ctx.save();
  ctx.fillStyle = PALETTE.moon;
  ctx.font = `600 ${fontPx}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(String(game.score | 0), 12, 8);

  ctx.fillStyle = 'rgba(245, 233, 201, 0.55)';
  ctx.font = `500 ${subPx}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(`stage ${game.level}`, 12, 8 + fontPx + 2);
  ctx.restore();
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
  const { viewW, size, trellisY } = layout;
  const top = trellisY - TRELLIS_HEIGHT;
  ctx.fillStyle = PALETTE.trellis;
  ctx.fillRect(0, top, viewW, TRELLIS_HEIGHT);

  ctx.strokeStyle = PALETTE.trellisKnot;
  ctx.lineWidth = 1;
  const knotSpacing = size * 2;
  for (let x = knotSpacing * 0.5; x < viewW; x += knotSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + TRELLIS_HEIGHT);
    ctx.stroke();
  }
}

function drawDeadLine(ctx, layout) {
  const { viewW, deadLineY } = layout;
  ctx.strokeStyle = PALETTE.deadLine;
  ctx.setLineDash([6, 8]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, deadLineY);
  ctx.lineTo(viewW, deadLineY);
  ctx.stroke();
  ctx.setLineDash([]);
}

// Match-pop bursts: a flipbook drawn additively so the sheet's black
// background drops out against the night sky. Reduced-motion skips the
// animation; the pop+drop still register through the board state change.
function drawBursts(ctx, layout, game, settings) {
  if (!game.effects || !game.effects.length) return;
  if (settings && settings.reducedMotion) return;
  const sheet = getBurstSheet();
  if (!sheet) return;
  const frameSize = sheet.frameSize;
  const totalFrames = sheet.frames;
  const dw = layout.size * 2 * BURST_SCALE;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const fx of game.effects) {
    const tt = fx.t / fx.life;
    if (tt < 0 || tt >= 1) continue;
    const frame = Math.min(totalFrames - 1, Math.floor(tt * totalFrames));
    ctx.drawImage(
      sheet.image,
      frame * frameSize, 0, frameSize, frameSize,
      fx.x - dw / 2, fx.y - dw / 2, dw, dw,
    );
  }
  ctx.restore();
}

function drawBoard(ctx, layout, board) {
  const { size } = layout;
  const animY = board.descentAnimY || 0;
  for (const l of board.lanterns) {
    let dx = l.x, dy = l.y;
    if (l.anim) {
      const t = l.anim.t < 0 ? 0 : l.anim.t > 1 ? 1 : l.anim.t;
      const e = 1 - (1 - t) ** 3;  // ease-out cubic
      dx = l.anim.fromX + (l.x - l.anim.fromX) * e;
      dy = l.anim.fromY + (l.y - l.anim.fromY) * e;
    }
    drawLantern(ctx, dx, dy + animY, size, l.color);
  }
}

function drawLantern(ctx, cx, cy, size, colorKey) {
  const sprite = getLanternSprite(colorKey);
  if (sprite) {
    // Fit the painted silhouette so its width fills 2*size (the cell width).
    // Height is proportional to the lamp's aspect ratio, so taller-than-wide
    // sprites overflow the cell vertically and look closer together.
    const { image, sx, sy, sw, sh } = sprite;
    const dw = 2 * size;
    const dh = dw * (sh / sw);
    ctx.drawImage(image, sx, sy, sw, sh, cx - dw / 2, cy - dh / 2, dw, dh);
    return;
  }
  // Fallback: procedural circle if the sprite failed to load.
  const r = size;
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

// Bamboo cradle: a short post + curved "U" that holds the loaded lantern
// above the tip, fully visible. Rotates with aim. The static base sits at the
// tip and does not rotate, so the launcher feels anchored on the river.
function drawLauncher(ctx, layout, game) {
  const tip = launcherTip(layout);
  const r = layout.size;
  const postLen   = r * 0.5;
  const cradleW   = r * 1.4;
  const cradleDip = r * 0.32;
  const baseR     = r * 0.55;
  const stroke    = Math.max(2, r * 0.2);

  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(game.aimAngle);

  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.launcher;
  ctx.lineWidth = stroke;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -postLen);
  ctx.stroke();

  // Cradle: quadratic curve dipping down at the middle so the lantern rests in it.
  const sideY   = -postLen;
  const middleY = -postLen + cradleDip;
  const ctrlY   = sideY + 2 * cradleDip;
  ctx.strokeStyle = PALETTE.launcherRim;
  ctx.lineWidth = Math.max(2, r * 0.18);
  ctx.beginPath();
  ctx.moveTo(-cradleW / 2, sideY);
  ctx.quadraticCurveTo(0, ctrlY, cradleW / 2, sideY);
  ctx.stroke();

  // Lantern sits in the cradle: its bottom touches the dip.
  const lanternY = middleY - r;
  drawLantern(ctx, 0, lanternY, r, game.queue.current);

  ctx.restore();

  // Static base anchored at tip — does not rotate.
  ctx.fillStyle = PALETTE.launcher;
  ctx.strokeStyle = PALETTE.launcherRim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, baseR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawShotQueue(ctx, layout, game) {
  const tip = launcherTip(layout);
  const off = layout.size * 3.0;
  const nx = tip.x + off;
  const ny = tip.y;
  ctx.save();
  ctx.globalAlpha = 0.85;
  drawLantern(ctx, nx, ny, layout.size * 0.7, game.queue.next);
  ctx.restore();

  ctx.fillStyle = 'rgba(245, 233, 201, 0.6)';
  ctx.font = `${10 * 1}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('next', nx, ny + layout.size * 0.95);
}

function drawAimLine(ctx, layout, game) {
  const trace = traceAimLine(layout, game.board, game.aimAngle, 1);
  if (!trace || trace.points.length < 2) return;

  ctx.save();
  ctx.strokeStyle = PALETTE.aimLine;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([3, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(trace.points[0].x, trace.points[0].y);
  for (let i = 1; i < trace.points.length; i++) {
    ctx.lineTo(trace.points[i].x, trace.points[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  if (trace.settle) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    drawLantern(ctx, trace.settle.x, trace.settle.y, layout.size, game.queue.current);
    ctx.restore();
  }
}

function drawProjectile(ctx, shot, layout) {
  drawLantern(ctx, shot.x, shot.y, layout.size, shot.color);
}

function mixWithWhite(hex, t) { return mixHex(hex, '#FFFFFF', t); }
function mixWithBlack(hex, t) { return mixHex(hex, '#000000', t); }
function mixHex(a, b, t) {
  const ra = parseInt(a.slice(1, 3), 16), ga = parseInt(a.slice(3, 5), 16), ba = parseInt(a.slice(5, 7), 16);
  const rb = parseInt(b.slice(1, 3), 16), gb = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba + (bb - ba) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}
