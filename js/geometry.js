// Shared spatial helpers used by physics, matching, and projectile code.
// All routines are O(n) linear scans — fine for the ~100 lanterns we ever
// have on the board. A spatial hash can drop in here if that ever changes.

export const SQRT3 = Math.sqrt(3);

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Cubic ease-out — every animation in this codebase uses it for the same
// "no bounce, no overshoot" feel.
export function easeOut(t) {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - (1 - c) ** 3;
}

// Iterate every lantern within `radiusSq` of (x, y), invoking `cb(lantern, distSq)`.
// `exclude` (optional) skips one lantern (typically the seed).
export function forEachLanternWithinSq(board, x, y, radiusSq, cb, exclude = null) {
  for (const l of board.lanterns) {
    if (l === exclude) continue;
    const dx = l.x - x, dy = l.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= radiusSq) cb(l, d2);
  }
}

// "Anchor band" — vertical distance from the trellis line within which a
// lantern's top edge is treated as pinned to the bamboo. Used both for the
// drop-floating check (match.js) and for fixing the pinned set during the
// post-placement settle (physics.js).
export function anchorBandPx(layout) {
  return layout.size * 0.6;
}

// The trellis itself sinks in puzzle mode: each seedless descent lowers the
// physical ceiling (collision, anchoring, settle pinning) by one packed-row
// height. Campaign/zen/speed boards never set anchorOffsetRows, so this is
// layout.trellisY verbatim for them.
export function effectiveTrellisY(board, layout) {
  const rows = (board && board.anchorOffsetRows) || 0;
  return layout.trellisY + rows * SQRT3 * layout.size;
}
