import { ADJACENCY_TOLERANCE } from './constants.js';
import { anchorBandPx, forEachLanternWithinSq } from './geometry.js';

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
export function findCluster(board, seed, layout, mode = 'color') {
  if (!seed) return [];
  const thresholdSq = adjThresholdSq(layout);
  const seen = new Set([seed]);
  const out = [seed];
  const queue = [seed];
  
  if (mode === 'color') {
    const color = seed.color;
    const visit = (n) => {
      if (seen.has(n) || n.color !== color) return;
      seen.add(n);
      out.push(n);
      queue.push(n);
    };
    while (queue.length) {
      const cur = queue.shift();
      forEachLanternWithinSq(board, cur.x, cur.y, thresholdSq, visit, cur);
    }
  } else if (mode === 'design') {
    const designId = seed.designId;
    if (!designId) return [seed];
    const visit = (n) => {
      if (seen.has(n) || n.designId !== designId) return;
      seen.add(n);
      out.push(n);
      queue.push(n);
    };
    while (queue.length) {
      const cur = queue.shift();
      forEachLanternWithinSq(board, cur.x, cur.y, thresholdSq, visit, cur);
    }
  }
  return out;
}

export function popMatches(board, seed, layout, rng = null) {
  const colorCluster = findCluster(board, seed, layout, 'color');
  const designCluster = findCluster(board, seed, layout, 'design');

  const hasColorMatch = colorCluster.length >= MIN_MATCH;
  const hasDesignMatch = designCluster.length >= MIN_MATCH;

  if (!hasColorMatch && !hasDesignMatch) return [];

  const poppedSet = new Set();
  if (hasColorMatch) {
    for (const l of colorCluster) poppedSet.add(l);
  }
  if (hasDesignMatch) {
    for (const l of designCluster) poppedSet.add(l);
  }

  // Find all golden pieces in the initial matched cluster
  const goldenPieces = Array.from(poppedSet).filter(l => l.isSpecial);
  
  if (goldenPieces.length > 0) {
    // Determine the maximum matching stencils in the matched cluster
    let maxMatchingCount = 0;
    let targetColor = seed.color;
    
    for (const g of goldenPieces) {
      if (g.designId) {
        // Count how many other lanterns in the initial matched cluster share this stencil
        const count = Array.from(poppedSet).filter(l => l !== g && l.designId === g.designId).length;
        if (count > maxMatchingCount) {
          maxMatchingCount = count;
          targetColor = g.color; // use the color of the golden piece with the most matching stencils
        }
      }
    }
    
    if (maxMatchingCount === 0) {
      // Clears as normal
    } else if (maxMatchingCount === 1 || maxMatchingCount === 2) {
      // 1.5 radius clear
      const thresholdSq = (1.5 * 2 * layout.size) * (1.5 * 2 * layout.size);
      for (const g of goldenPieces) {
        forEachLanternWithinSq(board, g.x, g.y, thresholdSq, (other) => {
          poppedSet.add(other);
        });
      }
    } else if (maxMatchingCount === 3 || maxMatchingCount === 4) {
      // All lamps of the same color are cleared
      for (const other of board.lanterns) {
        if (other.color === targetColor) {
          poppedSet.add(other);
        }
      }
    } else if (maxMatchingCount >= 5) {
      // Wind sweeps to the left carrying 3/4 of the lamps away
      const candidates = board.lanterns.filter(l => !poppedSet.has(l));
      const countToClear = Math.ceil(candidates.length * 0.75);
      const randomFn = rng || Math.random;
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(randomFn() * (i + 1));
        const temp = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = temp;
      }
      for (let i = 0; i < Math.min(countToClear, candidates.length); i++) {
        candidates[i].isWindSwept = true;
        poppedSet.add(candidates[i]);
      }
    }
  }

  const poppedArray = Array.from(poppedSet);
  board.lanterns = board.lanterns.filter(l => !poppedSet.has(l));
  return poppedArray;
}

// A lantern is "anchored" when its top edge is within the trellis anchor
// band. Anything that can't reach an anchored lantern through a chain of
// touches falls. Mutates the board; returns the dropped lanterns.
export function dropFloating(board, layout) {
  const r = layout.size;
  const anchorY = layout.trellisY + anchorBandPx(layout);
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
