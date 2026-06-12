import { GRID, COLOR_KEYS, getActivePackId } from './constants.js';
import { pick } from './prng.js';
import { getRandomDesignForColor } from './stencil-packs.js';

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
    // Rows the trellis itself has sunk (puzzle-mode seedless descents). The
    // physical ceiling and anchor band follow it — see effectiveTrellisY().
    anchorOffsetRows: 0,
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
export function populateInitial(board, layout, rng, rows = GRID.initialRows, colors = COLOR_KEYS, level = 1) {
  const r = layout.size;
  const rowH = SQRT3 * r;
  const activePackId = getActivePackId();
  for (let row = 0; row < rows; row++) {
    const odd = row & 1;
    const count = layout.cols - odd;
    for (let i = 0; i < count; i++) {
      const nx = i * 2 + odd;
      const ny = row * SQRT3;
      const x = layout.originX + nx * r;
      const y = layout.trellisY + r + row * rowH;
      const color = pick(rng, colors);
      const designId = activePackId === 'random' ? getRandomDesignForColor(color, rng) : null;
      board.lanterns.push({ x, y, nx, ny, color, designId });
    }
  }

  // Blocker placement for level >= 16
  if (level >= 16) {
    const eligible = board.lanterns.filter(l => Math.round(l.ny / SQRT3) >= 1);
    if (eligible.length > 0) {
      let numBlockers = 0;
      const roll = rng();
      if (level <= 25) {
        numBlockers = roll < 0.5 ? 1 : 2;
      } else if (level <= 40) {
        numBlockers = roll < 0.4 ? 2 : 3;
      } else {
        numBlockers = roll < 0.3 ? 2 : (roll < 0.8 ? 3 : 4);
      }

      const tempEligible = [...eligible];
      const countToPlace = Math.min(numBlockers, tempEligible.length);
      const chosen = [];
      for (let k = 0; k < countToPlace; k++) {
        const idx = Math.floor(rng() * tempEligible.length);
        chosen.push(tempEligible.splice(idx, 1)[0]);
      }
      for (const l of chosen) {
        l.isBlocker = true;
        l.color = 'paper';
        l.designId = 'flowers_bamboo';
      }
    }
  }
}

// Shift every lantern down by one packed-row height and seed a fresh top row
// touching the trellis. Returns false (treated as a loss by the caller) if
// any lantern would be pushed past the dead line.
//
// opts.seedRow=false (puzzle mode) skips the fresh top row: a puzzle descent
// is deterministic pressure — the hand-crafted board sinks toward the water —
// rather than a stream of new random lanterns, which would break the puzzle's
// fixed shot-queue logic.
export function descend(board, layout, rng, colors = COLOR_KEYS, level = 1, opts = {}) {
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
  if (opts.seedRow === false) {
    // No fresh top row: the trellis sinks with the board, keeping the same
    // lanterns anchored (anchor band + ceiling follow via effectiveTrellisY).
    board.anchorOffsetRows = (board.anchorOffsetRows || 0) + 1;
    board.descentCount++;
    return true;
  }
  // Stagger the new top row opposite to whichever row sits directly below it,
  // so the two interlock at exactly 2r center-distance instead of overlapping.
  const oddStagger = (board.descentCount & 1) === 0 ? 1 : 0;
  const count = layout.cols - oddStagger;
  const activePackId = getActivePackId();

  // Calculate blocker probability per top-row cell
  let blockerProb = 0;
  if (level >= 16) {
    blockerProb = Math.min(0.08, 0.02 + (level - 16) * 0.0015);
  }

  for (let i = 0; i < count; i++) {
    const nx = i * 2 + oddStagger;
    const ny = 0;
    const x = layout.originX + nx * r;
    const y = layout.trellisY + r;

    // Check if this lantern should be a blocker
    const isBlocker = (level >= 16 && rng() < blockerProb);
    const color = isBlocker ? 'paper' : pick(rng, colors);
    const designId = isBlocker ? 'flowers_bamboo' : (activePackId === 'random' ? getRandomDesignForColor(color, rng) : null);

    board.lanterns.push({ x, y, nx, ny, color, designId, isBlocker: !!isBlocker });
  }
  board.descentCount++;
  return true;
}

export function isCleared(board) {
  return board.lanterns.length === 0;
}

export function addLantern(board, x, y, color, layout, designId = null) {
  const l = { x, y, color, designId };
  normalizePos(l, layout);
  board.lanterns.push(l);
  return l;
}

export function populatePuzzle(board, layout, pattern, pz = null) {
  const r = layout.size;
  const rowH = SQRT3 * r;

  // Leading blank rows sink the whole puzzle (and its trellis) toward the
  // water: the anchor band and physical ceiling start at the first real row.
  // Used by pressure puzzles that begin low with little room to descend.
  let leadingBlank = 0;
  while (leadingBlank < pattern.length && !/[A-Za-z]/.test(pattern[leadingBlank])) {
    leadingBlank++;
  }
  board.anchorOffsetRows = (board.anchorOffsetRows || 0) + leadingBlank;

  const charToKey = {
    'R': 'red',
    'O': 'orange',
    'Y': 'yellow',
    'G': 'green',
    'B': 'blue',
    'P': 'paper'
  };

  for (let row = 0; row < pattern.length; row++) {
    const odd = row & 1;
    // Trim before tokenizing: odd rows are often written with a leading space
    // for visual hex alignment, which must not shift their tokens a column.
    const rowStr = pattern[row].trim();
    const tokens = rowStr.includes(' ') ? rowStr.split(/\s+/) : rowStr.split('');
    const count = Math.min(layout.cols - odd, tokens.length);
    
    for (let i = 0; i < count; i++) {
      const char = tokens[i].toUpperCase();
      if (char === '.' || char === ' ') continue;
      
      let color = charToKey[char];
      let isTarget = false;
      let isBlocker = false;
      let designId = null;

      if (char === 'T') {
        color = (pz && pz.targetColor) ? pz.targetColor : 'red';
        isTarget = true;
        designId = 'dragons_dragon_head';
      } else if (char === 'X') {
        color = 'paper';
        isBlocker = true;
        designId = 'flowers_bamboo';
      }

      if (!color) continue;

      const nx = i * 2 + odd;
      const ny = row * SQRT3;
      const x = layout.originX + nx * r;
      const y = layout.trellisY + r + row * rowH;

      board.lanterns.push({
        x, y, nx, ny, color, designId, isTarget, isBlocker
      });
    }
  }
}

