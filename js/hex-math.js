// Pointy-top hexagons with odd-r offset coordinates.
// Reference: redblobgames.com/grids/hexagons (Conventions: "pointy", "odd-r").

const SQRT3 = Math.sqrt(3);

export function hexWidth(size) {
  return SQRT3 * size;
}

export function hexHeight(size) {
  return 2 * size;
}

// Center pixel of cell (col, row). Layout = { size, originX, originY }.
// originX/originY locate the center of cell (0, 0).
export function hexToPixel(col, row, layout) {
  const { size, originX, originY } = layout;
  const xOffset = (row & 1) ? SQRT3 * size * 0.5 : 0;
  return {
    x: originX + col * SQRT3 * size + xOffset,
    y: originY + row * 1.5 * size,
  };
}

// Inverse of hexToPixel. Returns the nearest cell (col, row) — may be
// outside the playable bounds; caller checks with inBounds.
export function pixelToHex(x, y, layout) {
  const { size, originX, originY } = layout;
  const px = (x - originX) / size;
  const py = (y - originY) / size;
  const qFrac = (SQRT3 / 3) * px - (1 / 3) * py;
  const rFrac = (2 / 3) * py;
  const { q, r } = axialRound(qFrac, rFrac);
  return axialToOffset(q, r);
}

function axialRound(qFrac, rFrac) {
  const sFrac = -qFrac - rFrac;
  let q = Math.round(qFrac);
  let r = Math.round(rFrac);
  let s = Math.round(sFrac);
  const dq = Math.abs(q - qFrac);
  const dr = Math.abs(r - rFrac);
  const ds = Math.abs(s - sFrac);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

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

// Neighbor deltas for odd-r offset, indexed by (row & 1).
const NEIGHBORS_EVEN_ROW = [
  [+1,  0], [ 0, -1], [-1, -1],
  [-1,  0], [-1, +1], [ 0, +1],
];
const NEIGHBORS_ODD_ROW = [
  [+1,  0], [+1, -1], [ 0, -1],
  [-1,  0], [ 0, +1], [+1, +1],
];

export function getNeighbors(col, row) {
  const table = (row & 1) ? NEIGHBORS_ODD_ROW : NEIGHBORS_EVEN_ROW;
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
