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
