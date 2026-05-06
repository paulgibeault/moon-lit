import { GRID, COLOR_KEYS } from './constants.js';

// Board cells: cells[row][col] = { color: string } | null.
// M2 has no gameplay; this is a static placeholder fill for renderer testing.
export function createBoard(cols = GRID.cols, rows = GRID.rows) {
  const cells = Array.from({ length: rows }, () => Array(cols).fill(null));
  fillTopRowsStaticPattern(cells, cols, 5);
  return { cols, rows, cells };
}

function fillTopRowsStaticPattern(cells, cols, fillRows) {
  for (let row = 0; row < fillRows; row++) {
    for (let col = 0; col < cols; col++) {
      if (row === fillRows - 1 && (col === 1 || col === cols - 2)) continue;
      const idx = (col + row * 2) % COLOR_KEYS.length;
      cells[row][col] = { color: COLOR_KEYS[idx] };
    }
  }
}
