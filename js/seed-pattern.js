// Seed Explorer board patterns. Pure random boards are fine, but sometimes a
// little structure — horizontal bands, columns, diagonals, a mirror — reads as
// far more interesting and gives the player something to "solve". The pattern
// is one editable setting on the build screen; this module turns it into actual
// color and stone layouts.
//
// A pattern is deterministic given (type, color set, RNG). Its state lives on
// the board (board.seedPattern) and is serialized, so descents keep extending
// the same pattern after a reload. Colors are assigned a whole row at a time so
// mirror/band patterns line up; stones are chosen as a coherent shape (a line,
// a diagonal) rather than scattered.

import { pick } from './prng.js';

const SQRT3 = Math.sqrt(3);
const mod = (n, m) => ((n % m) + m) % m;

export const SEED_PATTERNS = ['random', 'rows', 'columns', 'diagonal', 'checker', 'mirror'];

// Weighted pick for seededConfig — random is the common case.
export function pickPattern(roll) {
  return roll < 0.55 ? 'random'
       : roll < 0.64 ? 'rows'
       : roll < 0.73 ? 'columns'
       : roll < 0.82 ? 'diagonal'
       : roll < 0.91 ? 'checker'
       : 'mirror';
}

// Build the pattern state (shuffled palette + band params) for a board. `nextTop`
// tracks the absolute row index handed to the next descent-seeded top row: the
// initial fill uses rows 0..n-1 (top = 0), so the next row above is -1.
export function makePatternState(type, rng, colors) {
  const order = colors.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    type: SEED_PATTERNS.includes(type) ? type : 'random',
    colors: colors.slice(),
    order,
    k: colors.length,
    bandH: rng() < 0.4 ? 2 : 1,   // rows per horizontal band
    bandW: rng() < 0.4 ? 2 : 1,   // cols per vertical band
    diagDir: rng() < 0.5 ? 1 : -1,
    nextTop: -1,
  };
}

// Colors for one row of `count` lanterns at absolute row `A` (0 = first created,
// growing downward; descent rows are negative). Returns an array aligned to the
// row's columns left→right.
export function patternRowColors(ps, A, count, rng, liveColors = null) {
  const out = new Array(count);
  // When given the live palette (descents), restrict the pattern to colors still
  // on the board so a new row can't reintroduce a color the player already
  // cleared. RNG draw counts are unchanged (mirror/random still draw `count`
  // picks), so the seed stream stays aligned.
  let { order, colors } = ps;
  if (liveColors && liveColors.length) {
    const liveSet = new Set(liveColors);
    const fOrder = order.filter(c => liveSet.has(c));
    if (fOrder.length) { order = fOrder; colors = colors.filter(c => liveSet.has(c)); }
  }
  const k = order.length;
  switch (ps.type) {
    case 'rows':
      out.fill(order[mod(Math.floor(A / ps.bandH), k)]);
      break;
    case 'columns':
      for (let i = 0; i < count; i++) out[i] = order[mod(Math.floor(i / ps.bandW), k)];
      break;
    case 'diagonal':
      for (let i = 0; i < count; i++) out[i] = order[mod(ps.diagDir * A + i, k)];
      break;
    case 'checker': {
      const m = Math.min(k, 3);
      for (let i = 0; i < count; i++) out[i] = order[mod(A + i, m)];
      break;
    }
    case 'mirror': {
      // Left half random, right half mirrors it — palindromic rows.
      const cache = {};
      for (let i = 0; i < count; i++) {
        const key = Math.min(i, count - 1 - i);
        if (cache[key] === undefined) cache[key] = pick(rng, colors);
        out[i] = cache[key];
      }
      break;
    }
    default:
      for (let i = 0; i < count; i++) out[i] = pick(rng, colors);
  }
  return out;
}

// Hand the next descent-seeded top row its absolute row index, advancing state.
export function nextDescentRow(ps) {
  const A = ps.nextTop;
  ps.nextTop -= 1;
  return A;
}

// Stone motif per pattern: structured patterns get a matching stone shape; the
// rest scatter. Returns the chosen lanterns (from `eligible`) to turn to stone.
export function chooseStoneCells(ps, eligible, count, rng) {
  count = Math.min(count | 0, eligible.length);
  if (count <= 0) return [];

  const meta = eligible.map(l => {
    const row = Math.round(l.ny / SQRT3);
    const col = Math.round((l.nx - (row & 1)) / 2);
    return { l, row, col };
  });

  // A score per cell; the `count` lowest scores become stones. Anchors are
  // chosen from RNG up front; a small jitter keeps edges organic. All RNG is
  // consumed in a fixed order so the result is deterministic.
  const rows = meta.map(m => m.row), cols = meta.map(m => m.col), diags = meta.map(m => m.row + m.col);
  const between = (arr) => { const lo = Math.min(...arr), hi = Math.max(...arr); return lo + Math.floor(rng() * (hi - lo + 1)); };

  let target;
  let score;
  switch (ps.type) {
    case 'rows':    { target = between(rows);  score = m => Math.abs(m.row - target); break; }
    case 'columns': { target = between(cols);  score = m => Math.abs(m.col - target); break; }
    case 'diagonal':{ target = between(diags); score = m => Math.abs((m.row + m.col) - target); break; }
    default:        { score = () => 0; }   // scatter (checker / mirror / random)
  }

  const scored = meta.map(m => ({ l: m.l, s: score(m) + rng() * 0.49 }));
  scored.sort((a, b) => a.s - b.s);
  return scored.slice(0, count).map(x => x.l);
}
