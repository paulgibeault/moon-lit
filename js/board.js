import { GRID, COLOR_KEYS } from './constants.js';
import { pick } from './prng.js';

const SQRT3 = Math.sqrt(3);

// Lanterns are stored as a flat list. Each entry is { x, y, nx, ny, color }.
//
// (nx, ny) is the source of truth, in normalized units relative to the layout
// origin: nx = (x - originX) / size, ny = (y - trellisY - size) / size. These
// are layout-independent, so a viewport resize never moves a lantern off its
// logical grid cell — call `syncLanternPixels(board, layout)` after the new
// layout is computed and (x, y) re-derive from (nx, ny) under the new origin.
//
// (x, y) is the working pixel cache used by physics, matching, and render.
// Anything that mutates (x, y) (physics settle, shot placement, descend) must
// re-normalize via `normalizePos(l, layout)` before the next resize.
//
// `descentCount` counts how many descents have occurred. Each descent shifts
// existing lanterns down by sqrt(3) (one packed-row in normalized units), which
// flips their hex-pack stagger. The freshly-seeded top row therefore
// alternates stagger every descent so it interlocks with the row beneath it.
export function createBoard() {
  return {
    lanterns: [],
    descentAnimY: 0,
    descentCount: 0,
  };
}

// Convert a lantern's (x, y) pixel position into the normalized (nx, ny) form
// under `layout`. Call after physics/placement so the lantern survives resize.
export function normalizePos(l, layout) {
  l.nx = (l.x - layout.originX) / layout.size;
  l.ny = (l.y - layout.trellisY - layout.size) / layout.size;
}

// Re-derive (x, y) from (nx, ny) under `layout`. Idempotent — call after any
// resize so the pixel cache matches the new viewport.
export function denormalizePos(l, layout) {
  l.x = layout.originX + l.nx * layout.size;
  l.y = layout.trellisY + layout.size + l.ny * layout.size;
}

// Refresh the pixel cache for every lantern (and any in-flight settle anim)
// against the current layout. Cheap and idempotent; main.js calls this on
// every resize so the board automatically re-centers around the new origin.
export function syncLanternPixels(board, layout) {
  if (!board || !layout) return;
  for (const l of board.lanterns) {
    denormalizePos(l, layout);
    if (l.anim) {
      l.anim.fromX = layout.originX + l.anim.fromNx * layout.size;
      l.anim.fromY = layout.trellisY + layout.size + l.anim.fromNy * layout.size;
    }
  }
}

// Place `rows` rows of lanterns close-packed against the trellis. Even rows
// span `cols` lanterns, odd rows are offset by one radius (and one fewer
// lantern, so the right edge stays aligned). Used for fresh-game seeding.
export function populateInitial(board, layout, rng, rows = GRID.initialRows, colors = COLOR_KEYS) {
  const r = layout.size;
  const rowH = SQRT3 * r;
  for (let row = 0; row < rows; row++) {
    const odd = row & 1;
    const count = layout.cols - odd;
    for (let i = 0; i < count; i++) {
      const nx = i * 2 + odd;
      const ny = row * SQRT3;
      const x = layout.originX + nx * r;
      const y = layout.trellisY + r + row * rowH;
      board.lanterns.push({ x, y, nx, ny, color: pick(rng, colors) });
    }
  }
}

// Shift every lantern down by one packed-row height and seed a fresh top row
// touching the trellis. Returns false (treated as a loss by the caller) if
// any lantern would be pushed past the dead line.
export function descend(board, layout, rng, colors = COLOR_KEYS) {
  const r = layout.size;
  const rowH = SQRT3 * r;
  const limitY = layout.deadLineY - r;
  for (const l of board.lanterns) {
    if (l.y + rowH > limitY) return false;
  }
  for (const l of board.lanterns) {
    l.y += rowH;
    l.ny += SQRT3;
  }
  // Stagger the new top row opposite to whichever row sits directly below it,
  // so the two interlock at exactly 2r center-distance instead of overlapping.
  const oddStagger = (board.descentCount & 1) === 0 ? 1 : 0;
  const count = layout.cols - oddStagger;
  for (let i = 0; i < count; i++) {
    const nx = i * 2 + oddStagger;
    const ny = 0;
    const x = layout.originX + nx * r;
    const y = layout.trellisY + r;
    board.lanterns.push({ x, y, nx, ny, color: pick(rng, colors) });
  }
  board.descentCount++;
  return true;
}

export function isCleared(board) {
  return board.lanterns.length === 0;
}

export function addLantern(board, x, y, color, layout) {
  const l = { x, y, color };
  if (layout) normalizePos(l, layout);
  board.lanterns.push(l);
  return l;
}
