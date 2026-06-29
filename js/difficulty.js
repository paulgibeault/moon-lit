// Shared difficulty tiers for finished games — the single source of truth for
// how hard a seed turned out to be, used both in-app (the Explore Seeds panel)
// and offline (tools/analyze-telemetry.js). Pure: no Arcade, DOM, or canvas
// deps, so it imports cleanly in the browser and under bare Node.
//
// Tiers, hardest → easiest:
//   lost-cause  💀  never won across ≥2 attempts you ABANDONED (walked away mid-aim)
//   unbeaten    🏆  never won, but not (yet) a repeated surrender
//   brutal          won < 15% of the time
//   challenging     won 15–60% — the design sweet spot
//   easy            won 60–90%
//   trivial         won > 90%
//
// A record is a telemetry-shaped object: at minimum { won, endPhase }, plus
// { settingsSeed, boardSeed } for the per-seed map. Seed-history entries lack
// `endPhase`, so feed this the telemetry log (which carries it) to get
// lost-cause; without endPhase a 0-win seed reads as `unbeaten`, never worse.

// Walked away rather than played to a loss: ended while still aiming, not on a
// gameOver. That distinction is what separates a lost cause from a hard loss.
export const abandoned = (r) => !r.won && r.endPhase === 'aiming';

// Tier order, hardest → easiest. Used to break ties when two tiers share a
// difficulty index (lost-cause and unbeaten both pin to the top).
export const TIER_RANK = { 'lost-cause': 0, unbeaten: 1, brutal: 2, challenging: 3, easy: 4, trivial: 5 };

export function fairnessLabel(rows) {
  const plays = rows.length;
  const wins = rows.filter(r => r.won).length;
  const winRate = wins / plays;
  if (wins === 0) {
    // The highest difficulty: a seed you tried again and again and walked away
    // from every time. A lost cause isn't a single unlucky loss — it's repeated
    // surrender. Stricter than `unbeaten`, so it ranks above it.
    if (plays >= 2 && rows.filter(abandoned).length >= 2) return 'lost-cause';
    return 'unbeaten';
  }
  if (winRate > 0.9) return 'trivial';
  if (winRate >= 0.15 && winRate <= 0.6) return 'challenging';
  if (winRate < 0.15) return 'brutal';
  return 'easy';
}

// ─── Intrinsic difficulty ────────────────────────────────────────────────────
// How hard the BOARD is, from its resolved config — independent of how you
// actually fared. The same levers the seed curator scores: more colors, more
// starting rows, less descent breathing room, speed mode, and stone blockers
// all push a board harder. Outcome (cleared / lost-cause) is layered on top by
// the caller, never folded in here. Used for the badge shown on every mode's
// game listing, so the vocabulary is identical across campaign / seed / puzzle.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// 0..1 intrinsic difficulty. Weights mirror tools/curate-session.mjs so the
// in-app badge and the offline session curation agree on "how hard".
export function difficultyScore(config) {
  if (!config) return 0;
  const colors = clamp01(((config.colors ?? 4) - 3) / 3);            // 3 → 0, 6 → 1
  const rows = clamp01(((config.initialRows ?? 4) - 3) / 4);          // 3 → 0, 7 → 1
  const descent = clamp01((12 - (config.descentShots ?? 8)) / 7);     // 12 shots' grace → 0, 5 → 1
  const speed = config.isSpeedMode ? 1 : 0;
  const blockers = clamp01((config.blockerPct || 0) / 30);            // 0 → 0, 30% stones → 1
  return 0.26 * colors + 0.20 * rows + 0.20 * descent + 0.14 * speed + 0.20 * blockers;
}

// Named tiers, easiest → hardest. Thresholds chosen so a real session spreads
// across all five (gentle warm-ups through expert speed/blocker boards).
export const DIFFICULTY_TIERS = ['gentle', 'easy', 'medium', 'hard', 'expert'];

export function difficultyRating(config) {
  const score = difficultyScore(config);
  const key = score < 0.20 ? 'gentle'
    : score < 0.34 ? 'easy'
    : score < 0.48 ? 'medium'
    : score < 0.62 ? 'hard'
    : 'expert';
  return { key, score: +score.toFixed(3) };
}

// Identity key for a seed variant. Mirrors the analyzer's seedPair so labels
// line up across the in-app and offline views.
export const seedKey = (r) => (r.settingsSeed != null && r.boardSeed != null)
  ? `${r.settingsSeed >>> 0}:${r.boardSeed >>> 0}` : null;

// Group finished games by seed pair → fairness label. Pass the telemetry log
// (carries endPhase) to surface lost-cause; pass thinner seed-history entries
// and 0-win seeds simply read as unbeaten.
export function seedTierMap(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = seedKey(r);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = new Map();
  for (const [k, rs] of groups) out.set(k, fairnessLabel(rs));
  return out;
}
