// Scoring resolution for a single shot. Pure functions — no game-state
// mutation. Returned breakdown drives both the score total and the floating
// spark labels the renderer draws.
//
// Components:
//   pop          = 10 * n           (n = lanterns in the popped cluster)
//   clusterBonus = 10 * (n-3)^2     (zero for n<=3; rewards big clusters)
//   drop         = 20 * m^2         (m = lanterns dropped after the pop)
//   chainMult    = 1.5x on (pop+clusterBonus+drop) when both pop and drop fired
//   comboBonus   = 5 * combo        (combo = consecutive scoring shots so far)
//
// Stage clear adds a bonus separate from per-shot resolution:
//   clearBonus   = 100 + 10 * shotsRemainingInDescentMeter

export const POP_POINTS = 10;
export const CLUSTER_BONUS_COEF = 10;
export const DROP_COEF = 20;
export const CHAIN_MULT = 1.5;
export const COMBO_COEF = 5;
export const CLEAR_BASE = 100;
export const CLEAR_PER_SHOT = 10;
export const MILESTONE_STEP = 1000;

export function popScore(popped) {
  return popped.length * POP_POINTS;
}

export function clusterBonus(popped) {
  const n = popped.length;
  if (n <= 3) return 0;
  return CLUSTER_BONUS_COEF * (n - 3) * (n - 3);
}

export function dropScore(dropped) {
  const m = dropped.length;
  return DROP_COEF * m * m;
}

// Resolve a single shot's score. Returns a breakdown the renderer can use
// to spawn floating labels and the HUD can display in the end overlay.
export function resolveShot(popped, dropped, prevCombo) {
  const pop = popScore(popped);
  const cluster = clusterBonus(popped);
  const drop = dropScore(dropped);
  const chained = popped.length > 0 && dropped.length > 0;
  const baseSum = pop + cluster + drop;
  const chainGain = chained ? Math.round(baseSum * (CHAIN_MULT - 1)) : 0;
  const scored = baseSum > 0;
  const nextCombo = scored ? prevCombo + 1 : 0;
  const comboBonus = scored ? COMBO_COEF * nextCombo : 0;
  const total = baseSum + chainGain + comboBonus;
  return {
    pop, cluster, drop,
    chainMult: chained ? CHAIN_MULT : 1,
    chainGain,
    comboBonus,
    combo: nextCombo,
    total,
  };
}

export function clearBonus(shotsRemaining) {
  return CLEAR_BASE + CLEAR_PER_SHOT * Math.max(0, shotsRemaining | 0);
}

// True when the score crossed a multiple of MILESTONE_STEP this shot.
// Drives the moon-halo pulse in the renderer.
export function crossedMilestone(prevScore, nextScore) {
  return Math.floor(nextScore / MILESTONE_STEP) > Math.floor(prevScore / MILESTONE_STEP);
}

// True when a counter ticked past a fresh multiple of `step` (and is non-zero).
// The combo increments by 1 per scoring shot, so this fires exactly on the
// shot that reaches a Moonburst milestone (×5, ×10, …).
export function crossedMultiple(prev, next, step) {
  if (next <= 0) return false;
  return Math.floor(next / step) > Math.floor(prev / step);
}
