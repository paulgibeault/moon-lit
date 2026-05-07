// Pointy-top hexagons with odd-r offset coordinates.
// Reference: redblobgames.com/grids/hexagons (Conventions: "pointy", "odd-r").
//
// parityFlip (0 or 1) adjusts which rows are staggered. After each single-row
// descent the parity flips so adjacency relationships remain consistent even
// though cells physically shifted in the array.

const SQRT3 = Math.sqrt(3);

export function hexWidth(size) {
  return SQRT3 * size;
}

export function hexHeight(size) {
  return 2 * size;
}

// Center pixel of cell (col, row). Layout = { size, originX, originY, parityFlip }.
// originX/originY locate the center of cell (0, 0).
export function hexToPixel(col, row, layout) {
  const { size, originX, originY } = layout;
  const pf = layout.parityFlip || 0;
  const xOffset = ((row + pf) & 1) ? SQRT3 * size * 0.5 : 0;
  return {
    x: originX + col * SQRT3 * size + xOffset,
    y: originY + row * 1.5 * size,
  };
}

// Inverse of hexToPixel. Returns the nearest cell (col, row) — may be
// outside the playable bounds; caller checks with inBounds.
export function pixelToHex(x, y, layout) {
  const { size, originX, originY } = layout;
  const pf = layout.parityFlip || 0;

  // Estimate row from y, then determine parity-aware offset.
  const approxRow = Math.round((y - originY) / (1.5 * size));
  const xOffset = ((approxRow + pf) & 1) ? SQRT3 * size * 0.5 : 0;

  // Try a few candidate rows around the estimate and pick closest center.
  let best = null, bestDist = Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    const r = approxRow + dr;
    const rOffset = ((r + pf) & 1) ? SQRT3 * size * 0.5 : 0;
    const cy = originY + r * 1.5 * size;
    const approxCol = Math.round((x - originX - rOffset) / (SQRT3 * size));
    for (let dc = -1; dc <= 1; dc++) {
      const c = approxCol + dc;
      const cx = originX + c * SQRT3 * size + rOffset;
      const dx = x - cx, dy = y - cy;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = { col: c, row: r }; }
    }
  }
  return best;
}

// Neighbor deltas for odd-r offset, indexed by (row & 1).
const NEIGHBORS_EVEN_ROW = [
  [+1,  0], [ 0, -1], [-1, -1],
  [-1,  0], [-1, +1], [ 0, +1],
];
const NEIGHBORS_ODD_ROW = [
  [+1,  0], [+1, -1], [ 0, -1],
  [-1,  0], [ 0, +1], [+1, +1],
];

export function offsetToAxial(col, row) {
  const q = col - ((row - (row & 1)) >> 1);
  const r = row;
  return { q, r };
}

export function axialToOffset(q, r) {
  const col = (q + ((r - (r & 1)) >> 1)) | 0;
  const row = r | 0;
  return { col, row };
}

export function getNeighbors(col, row, parityFlip = 0) {
  const table = ((row + parityFlip) & 1) ? NEIGHBORS_ODD_ROW : NEIGHBORS_EVEN_ROW;
  return table.map(([dc, dr]) => ({ col: col + dc, row: row + dr }));
}

export function inBounds(col, row, cols, rows) {
  return col >= 0 && col < cols && row >= 0 && row < rows;
}

// Six corner pixel positions of a pointy-top hex centered at (cx, cy).
export function hexCorners(cx, cy, size) {
  const corners = new Array(6);
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners[i] = { x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) };
  }
  return corners;
}

// Pixel extent of a populated cols×rows odd-r grid whose (0,0) center sits
// at originX/originY. Useful for fitting the board on a canvas.
export function gridPixelSize(cols, rows, size) {
  const w = SQRT3 * size * cols + (rows > 1 ? SQRT3 * size * 0.5 : 0);
  const h = 1.5 * size * (rows - 1) + 2 * size;
  return { width: w, height: h };
}
