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
