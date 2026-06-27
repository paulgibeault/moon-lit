import { ADJACENCY_TOLERANCE, COMBO_POWERS } from './constants.js';
import { anchorBandPx, effectiveTrellisY, forEachLanternWithinSq } from './geometry.js';

const MIN_MATCH = 3;

// Two lanterns touch when their centers are within (2r * tolerance).
function adjThresholdSq(layout) {
  const d = layout.size * 2 * ADJACENCY_TOLERANCE;
  return d * d;
}

// BFS from `seed` over same-color touching lanterns. Returns the cluster
// (always includes the seed). Pure read — does not mutate.
//
// The neighbor scan is inlined (rather than via a neighborsOf() helper that
// returns an array) so the BFS allocates nothing per node: the threshold is
// hoisted out of the loop and a single visitor closure pushes touching
// same-color lanterns straight into the queue. On a board that grows with
// descents this is the per-shot hot path, so the per-node array + closure +
// repeated threshold multiply it used to do are exactly what we want gone.
export function findCluster(board, seed, layout) {
  if (!seed || seed.isBlocker) return [];
  const color = seed.color;
  const thresholdSq = adjThresholdSq(layout);
  const seen = new Set([seed]);
  const out = [seed];
  const queue = [seed];
  const visit = (n) => {
    if (seen.has(n) || n.color !== color || n.isBlocker) return;
    seen.add(n);
    out.push(n);
    queue.push(n);
  };
  while (queue.length) {
    const cur = queue.shift();
    forEachLanternWithinSq(board, cur.x, cur.y, thresholdSq, visit, cur);
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

// Moonburst clear. The burst always blows a hole around the impact point, but
// it also follows the shot's color match when there is one: every lantern in
// the match becomes its own epicenter, so the explosion traces the match's
// shape and the match is guaranteed to clear in full — including the parts that
// reach beyond the impact radius (the old radius-only clear used to strand
// those). Around each epicenter the burst is color-blind: it takes any lantern
// (any color, blockers included) within COMBO_POWERS.moonburstRadius
// lantern-diameters.
//
// Returns { cleared, epicenters }: `cleared` is every removed lantern (always
// includes seed), `epicenters` is the points the blast detonates from (the
// match when one formed, otherwise just the impact) so callers can spread the
// explosive effect across them.
export function clearMoonburst(board, seed, layout) {
  const cluster = findCluster(board, seed, layout);
  const epicenters = cluster.length >= MIN_MATCH ? cluster : [seed];
  const reach = COMBO_POWERS.moonburstRadius * 2 * layout.size;
  const reachSq = reach * reach;
  const cleared = [];
  const kept = [];
  for (const l of board.lanterns) {
    let hit = false;
    for (const c of epicenters) {
      const dx = l.x - c.x;
      const dy = l.y - c.y;
      if (dx * dx + dy * dy <= reachSq) { hit = true; break; }
    }
    (hit ? cleared : kept).push(l);
  }
  board.lanterns = kept;
  return { cleared, epicenters };
}

// A lantern is "anchored" when its top edge is within the trellis anchor
// band. Anything that can't reach an anchored lantern through a chain of
// touches falls. Mutates the board; returns the dropped lanterns.
export function dropFloating(board, layout) {
  const r = layout.size;
  const anchorY = effectiveTrellisY(board, layout) + anchorBandPx(layout);
  const thresholdSq = adjThresholdSq(layout);
  const seen = new Set();
  const queue = [];
  for (const l of board.lanterns) {
    if (l.y - r <= anchorY) {
      seen.add(l);
      queue.push(l);
    }
  }
  // Same inlined, allocation-free neighbor scan as findCluster: one hoisted
  // threshold, one visitor closure, no per-node array.
  const visit = (n) => {
    if (seen.has(n)) return;
    seen.add(n);
    queue.push(n);
  };
  while (queue.length) {
    const cur = queue.shift();
    forEachLanternWithinSq(board, cur.x, cur.y, thresholdSq, visit, cur);
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
