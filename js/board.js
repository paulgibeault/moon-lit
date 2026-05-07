import { GRID, COLOR_KEYS } from './constants.js';
import { pick } from './prng.js';

// Board cells: cells[row][col] = { color: string } | null.
export function createBoard(cols = GRID.cols, rows = GRID.rows) {
  const cells = Array.from({ length: rows }, () => Array(cols).fill(null));
  return { cols, rows, cells };
}

// Fill the top `fillRows` rows with rng-picked colors. Used for fresh games
// until M6 introduces level loaders. Cells already populated are preserved.
export function fillRandomTop(board, rng, fillRows = 5) {
  for (let row = 0; row < fillRows && row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      if (board.cells[row][col]) continue;
      board.cells[row][col] = { color: pick(rng, COLOR_KEYS) };
    }
  }
}

// Shift every row down by one and seed a fresh top row from rng. Returns
// true if the descent succeeded; false if any populated cell in the bottom
// row would have been pushed past the dead-line — caller treats that as a
// loss and does not apply the shift.
export function descend(board, rng) {
  for (let col = 0; col < board.cols; col++) {
    if (board.cells[board.rows - 1][col]) return false;
  }
  for (let row = board.rows - 1; row > 0; row--) {
    for (let col = 0; col < board.cols; col++) {
      board.cells[row][col] = board.cells[row - 1][col];
    }
  }
  for (let col = 0; col < board.cols; col++) {
    board.cells[0][col] = { color: pick(rng, COLOR_KEYS) };
  }
  return true;
}

export function isCleared(board) {
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      if (board.cells[row][col]) return false;
    }
  }
  return true;
}
