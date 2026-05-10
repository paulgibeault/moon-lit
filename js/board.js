import { GRID, COLOR_KEYS } from './constants.js';
import { pick } from './prng.js';

const SQRT3 = Math.sqrt(3);

// Lanterns are stored as a flat list. Each entry is { x, y, color }.
// There is no grid backing store — settled positions are wherever the
// projectile collided with another lantern or the trellis.
//
// `descentCount` counts how many descents have occurred. Each descent shifts
// existing lanterns down by sqrt(3)*r, which lands them on the opposite
// hex-packing stagger from where they started. So the freshly-seeded top row
// must alternate stagger every descent to interlock with the row beneath it.
export function createBoard() {
  return {
    lanterns: [],
    descentAnimY: 0,
    descentCount: 0,
  };
}

// Place `rows` rows of lanterns close-packed against the trellis. Even rows
// span `cols` lanterns, odd rows are offset by one radius (and one fewer
// lantern, so the right edge stays aligned). Used for fresh-game seeding.
export function populateInitial(board, layout, rng, rows = GRID.initialRows) {
  const r = layout.size;
  const rowH = SQRT3 * r;
  for (let row = 0; row < rows; row++) {
    const odd = row & 1;
    const count = layout.cols - odd;
    for (let i = 0; i < count; i++) {
      const x = layout.originX + (i * 2 + odd) * r;
      const y = layout.trellisY + r + row * rowH;
      board.lanterns.push({ x, y, color: pick(rng, COLOR_KEYS) });
    }
  }
}

// Shift every lantern down by one packed-row height and seed a fresh top row
// touching the trellis. Returns false (treated as a loss by the caller) if
// any lantern would be pushed past the dead line.
export function descend(board, layout, rng) {
  const r = layout.size;
  const rowH = SQRT3 * r;
  const limitY = layout.deadLineY - r;
  for (const l of board.lanterns) {
    if (l.y + rowH > limitY) return false;
  }
  for (const l of board.lanterns) l.y += rowH;
  // Stagger the new top row opposite to whichever row sits directly below it,
  // so the two interlock at exactly 2r center-distance instead of overlapping.
  const oddStagger = (board.descentCount & 1) === 0 ? 1 : 0;
  const count = layout.cols - oddStagger;
  for (let i = 0; i < count; i++) {
    const x = layout.originX + (i * 2 + oddStagger) * r;
    const y = layout.trellisY + r;
    board.lanterns.push({ x, y, color: pick(rng, COLOR_KEYS) });
  }
  board.descentCount++;
  return true;
}

export function isCleared(board) {
  return board.lanterns.length === 0;
}

export function addLantern(board, x, y, color) {
  board.lanterns.push({ x, y, color });
}
