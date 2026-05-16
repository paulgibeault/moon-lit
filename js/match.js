import { ADJACENCY_TOLERANCE } from './constants.js';
import { anchorBandPx, forEachLanternWithinSq } from './geometry.js';

const MIN_MATCH = 3;

// Two lanterns touch when their centers are within (2r * tolerance).
function adjThresholdSq(layout) {
  const d = layout.size * 2 * ADJACENCY_TOLERANCE;
  return d * d;
}

function neighborsOf(board, lantern, layout) {
  const out = [];
  forEachLanternWithinSq(board, lantern.x, lantern.y, adjThresholdSq(layout),
    (other) => out.push(other), lantern);
  return out;
}

// BFS from `seed` over same-color touching lanterns. Returns the cluster
// (always includes the seed). Pure read — does not mutate.
export function findCluster(board, seed, layout) {
  if (!seed) return [];
  const color = seed.color;
  const seen = new Set([seed]);
  const out = [seed];
  const queue = [seed];
  while (queue.length) {
    const cur = queue.shift();
    for (const n of neighborsOf(board, cur, layout)) {
      if (seen.has(n)) continue;
      if (n.color !== color) continue;
      seen.add(n);
      out.push(n);
      queue.push(n);
    }
  }
  return out;
}

// If `seed`'s cluster is at least MIN_MATCH, remove the cluster from the
// board and return the popped lanterns. Otherwise return [].
export function popMatches(board, seed, layout) {
  const cluster = findCluster(board, seed, layout);
  if (cluster.length < MIN_MATCH) return [];
  const set = new Set(cluster);
  board.lanterns = board.lanterns.filter(l => !set.has(l));
  return cluster;
}

// A lantern is "anchored" when its top edge is within the trellis anchor
// band. Anything that can't reach an anchored lantern through a chain of
// touches falls. Mutates the board; returns the dropped lanterns.
export function dropFloating(board, layout) {
  const r = layout.size;
  const anchorY = layout.trellisY + anchorBandPx(layout);
  const seen = new Set();
  const queue = [];
  for (const l of board.lanterns) {
    if (l.y - r <= anchorY) {
      seen.add(l);
      queue.push(l);
    }
  }
  while (queue.length) {
    const cur = queue.shift();
    for (const n of neighborsOf(board, cur, layout)) {
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  const dropped = [];
  const kept = [];
  for (const l of board.lanterns) {
    if (seen.has(l)) kept.push(l);
    else dropped.push(l);
  }
  board.lanterns = kept;
  return dropped;
}
