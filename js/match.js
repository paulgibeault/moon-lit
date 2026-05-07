import { getNeighbors, inBounds } from './hex-math.js';

const MIN_MATCH = 3;

// BFS from (col, row) over same-color contiguous neighbours. Returns the
// list of {col, row} cells in the cluster (always includes the seed if it
// is non-empty). Pure read — does not mutate the board.
export function findCluster(board, col, row) {
  if (!inBounds(col, row, board.cols, board.rows)) return [];
  const seed = board.cells[row][col];
  if (!seed) return [];
  const color = seed.color;
  const pf = board.parityFlip || 0;
  const seen = new Set();
  const out = [];
  const queue = [{ col, row }];
  seen.add(key(col, row));
  while (queue.length) {
    const c = queue.shift();
    out.push(c);
    for (const n of getNeighbors(c.col, c.row, pf)) {
      if (!inBounds(n.col, n.row, board.cols, board.rows)) continue;
      const k = key(n.col, n.row);
      if (seen.has(k)) continue;
      const cell = board.cells[n.row][n.col];
      if (!cell || cell.color !== color) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return out;
}

// If the cluster anchored at (col, row) has at least MIN_MATCH cells, clear
// them from the board and return the cleared list. Otherwise return [].
export function popMatches(board, col, row) {
  const cluster = findCluster(board, col, row);
  if (cluster.length < MIN_MATCH) return [];
  for (const c of cluster) board.cells[c.row][c.col] = null;
  return cluster;
}

// BFS from every populated cell in row 0 across all populated neighbours
// (any color). Any populated cell not reached is "floating" and falls.
// Mutates the board: cleared cells are returned as {col, row, color}.
export function dropFloating(board) {
  const pf = board.parityFlip || 0;
  const seen = new Set();
  const queue = [];
  for (let col = 0; col < board.cols; col++) {
    if (board.cells[0][col]) {
      const k = key(col, 0);
      seen.add(k);
      queue.push({ col, row: 0 });
    }
  }
  while (queue.length) {
    const c = queue.shift();
    for (const n of getNeighbors(c.col, c.row, pf)) {
      if (!inBounds(n.col, n.row, board.cols, board.rows)) continue;
      const k = key(n.col, n.row);
      if (seen.has(k)) continue;
      if (!board.cells[n.row][n.col]) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  const dropped = [];
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      const cell = board.cells[row][col];
      if (!cell) continue;
      if (seen.has(key(col, row))) continue;
      dropped.push({ col, row, color: cell.color });
      board.cells[row][col] = null;
    }
  }
  return dropped;
}

// Score: pops are flat per lantern; drops scale with cluster size to
// reward setup play. drop = 20 * n total ⇒ per-lantern bonus rises with n.
export const POP_POINTS = 10;
export function popScore(popped) {
  return popped.length * POP_POINTS;
}
export function dropScore(dropped) {
  const n = dropped.length;
  return 20 * n * n;
}

function key(col, row) {
  return row * 1000 + col;
}
