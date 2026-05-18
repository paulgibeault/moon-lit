import {
  GRID,
  BOARD_MARGIN_TOP, BOARD_MARGIN_BOTTOM, BOARD_MARGIN_SIDE,
  TRELLIS_HEIGHT, DEAD_LINE_OFFSET, LANE_LANTERNS,
  MIN_LANTERN_RADIUS,
} from './constants.js';
import { SQRT3 } from './geometry.js';

// Margins are absolute pixels tuned for desktop viewports; on a 600px-tall
// phone the default 56+96=152px is 25% of the height. Scale each margin
// proportionally on small viewports (with floors to keep the HUD and launcher
// from being clipped) so the play area can grow on phones.
function scaledMargins(viewW, viewH) {
  const marginTop    = Math.round(Math.max(28, Math.min(BOARD_MARGIN_TOP,    viewH * 0.06)));
  const marginBottom = Math.round(Math.max(56, Math.min(BOARD_MARGIN_BOTTOM, viewH * 0.12)));
  const marginSide   = Math.round(Math.max( 8, Math.min(BOARD_MARGIN_SIDE,   viewW * 0.04)));
  return { marginTop, marginBottom, marginSide };
}

// Build a viewport-derived layout. Lantern radius is sized to fit `cols`
// lanterns plus LANE_LANTERNS bounce-lanes on each side, and `maxRows`
// close-packed rows between trellis and dead-line. maxRows is fixed (not
// viewport-derived) so the play field has a consistent vertical depth across
// device sizes — on tall portrait viewports the row count fills the height,
// on wide viewports the height cap shrinks lanterns to keep all rows visible.
export function computeLayout(viewW, viewH, cols = GRID.cols, maxRows = GRID.maxRows) {
  const { marginTop, marginBottom, marginSide } = scaledMargins(viewW, viewH);
  const availW = viewW - marginSide * 2;
  const availH = viewH - marginTop - marginBottom;
  // Width budget: 2r per lantern in the widest (even) row + 2r*LANE_LANTERNS
  // per side. Odd rows are narrower (cols-1 lanterns offset by r), so they
  // sit fully within the even-row strip and contribute no extra width.
  const sizeFromW = availW / (2 * (cols + 2 * LANE_LANTERNS));
  // Height budget: 2r (top row) + (maxRows-1)*sqrt(3)*r + DEAD_LINE_OFFSET.
  const sizeFromH = (availH - DEAD_LINE_OFFSET) / (2 + (maxRows - 1) * SQRT3);
  const size = Math.max(MIN_LANTERN_RADIUS, Math.floor(Math.min(sizeFromW, sizeFromH)));
  const r = size;

  const lanternStripW = 2 * r * cols;
  const laneW = 2 * r * LANE_LANTERNS;
  const totalPlayW = lanternStripW + 2 * laneW;
  const playLeft = marginSide + (availW - totalPlayW) / 2;

  const wallLeft  = playLeft;
  const wallRight = playLeft + totalPlayW;
  const originX   = playLeft + laneW + r;  // center of (col 0, even row 0)

  // Natural top-anchored positions: trellis sits just under the top margin
  // and the grid grows downward.
  const naturalTrellisY = marginTop + TRELLIS_HEIGHT;
  const gridHeight = r + (maxRows - 1) * SQRT3 * r + r + DEAD_LINE_OFFSET;
  // Residual slack between the grid and the desired waterline. With maxRows
  // sized for tall portrait viewports, this is small everywhere; split 50/50
  // so neither the trellis nor the waterline gets pixel-jammed against an edge.
  const naturalDeadLineY = naturalTrellisY + gridHeight;
  const desiredDeadLineY = viewH - marginBottom;
  const verticalShift = Math.max(0, desiredDeadLineY - naturalDeadLineY) / 2;
  const trellisY = naturalTrellisY + verticalShift;
  const deadLineY = naturalDeadLineY + verticalShift;
  // Sink the launcher so the cradled lantern's bottom hovers just above
  // the waterline — the post enters the water, and the visible lamp reads
  // as resting on the lake surface before it fires. The cradle sits ~0.18r
  // above tipY, so a small additional offset (0.08r) leaves a hairline
  // between the lantern and the water.
  const tipY = deadLineY + r * 0.1;

  return {
    size: r, originX, trellisY, deadLineY, tipY,
    cols, maxRows,
    viewW, viewH,
    wallLeft, wallRight,
  };
}
