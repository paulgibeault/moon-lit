import {
  GRID,
  BOARD_MARGIN_TOP, BOARD_MARGIN_BOTTOM, BOARD_MARGIN_SIDE,
  TRELLIS_HEIGHT, DEAD_LINE_OFFSET, LANE_LANTERNS,
  MIN_LANTERN_RADIUS,
} from './constants.js';
import { SQRT3 } from './geometry.js';

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
  const size = Math.max(MIN_LANTERN_RADIUS, Math.floor(Math.min(sizeFromW, sizeFromH)));
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
