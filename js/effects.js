// Short-lived visual effects: pop bursts (sprite flipbook), floating score
// labels, and the moon halo pulse. The renderer reads these arrays and
// draws them — this module is the model side: spawn, tick, and decide when
// they're done.

import { BURST_DURATION_SEC, ENV_PARAMS } from './constants.js';

// Per-kind presentation tuning for floating score labels. Vertical rise and
// life come from here; the renderer reads each kind's text/x/y/t/life.
const FLOAT_STYLES = Object.freeze({
  pop:     { offsetR: 0.4, life: 1.1 },
  cluster: { offsetR: 1.2, life: 1.4 },
  drop:    { offsetR: 0.6, life: 1.6 },
  chain:   { offsetR: 2.0, life: 1.7 },
  combo:   { offsetR: 2.6, life: 1.8 },
});

export function hasActiveEffects(game) {
  if (game.effects && game.effects.length > 0) return true;
  if (game.floats && game.floats.length > 0) return true;
  if (game.ripples && game.ripples.length > 0) return true;
  if (game.moonPulse && game.moonPulse.t < game.moonPulse.life) return true;
  return false;
}

export function tickEffects(game, dtSec) {
  if (game.effects && game.effects.length) {
    const kept = [];
    for (const fx of game.effects) {
      fx.t += dtSec;
      if (fx.t < fx.life) kept.push(fx);
    }
    game.effects = kept;
  }
  if (game.floats && game.floats.length) {
    const kept = [];
    for (const f of game.floats) {
      f.t += dtSec;
      if (f.t < f.life) kept.push(f);
    }
    game.floats = kept;
  }
  if (game.ripples && game.ripples.length) {
    const kept = [];
    for (const r of game.ripples) {
      r.t += dtSec;
      if (r.t < r.life) kept.push(r);
    }
    game.ripples = kept;
  }
  if (game.moonPulse && game.moonPulse.t < game.moonPulse.life) {
    game.moonPulse.t += dtSec;
  }
}

export function spawnBurst(game, x, y) {
  game.effects.push({ x, y, t: 0, life: BURST_DURATION_SEC });
}

export function pulseMoon(game) {
  game.moonPulse = { t: 0, life: 1.4 };
}

// Ripples are short-lived wavefronts that travel outward through the lantern
// field. Adjacent lamps flare in sequence as the wavefront passes through
// them, so a big combo or drop feels like a stone dropped in still water.
//
// Origin is stored in normalized board coordinates (same basis as lantern
// nx/ny), so a viewport resize keeps the wave anchored to the same point on
// the board. Speed and reach are in lantern-diameter units so the wave reads
// at the same physical scale on tiny phone viewports and full desktop alike.
const RIPPLE_SPEED = 12;   // lantern diameters per second
const RIPPLE_PASS  = 0.45; // seconds each lamp stays lit as the wavefront passes
const RIPPLE_TAIL  = 0.4;  // extra time the trailing edge fades after reaching the rim

export function spawnRipple(game, x, y, layout, { strength = 0.6, reach = 8 } = {}) {
  if (!game.ripples) game.ripples = [];
  const nx = (x - layout.originX) / layout.size;
  const ny = (y - layout.trellisY - layout.size) / layout.size;
  const speedScale = ENV_PARAMS.rippleSpeedScale || 1.0;
  const speed = RIPPLE_SPEED * speedScale;
  const pass = RIPPLE_PASS / speedScale;
  const life = reach / speed + pass + RIPPLE_TAIL;
  game.ripples.push({
    nx, ny, t: 0, life, strength, reach, speed, pass,
  });
}

// Per-lantern boost from all active ripples. Each ripple contributes only
// while the wavefront is currently passing over the lamp: distance/speed sets
// when the wave arrives, `pass` how long it lingers. A bell envelope across
// that window keeps the flare smooth, and distance attenuation makes the
// far-out lamps glow gently rather than blowing out near the rim.
export function rippleBoost(game, lnx, lny) {
  const ripples = game && game.ripples;
  if (!ripples || !ripples.length) return 0;
  let boost = 0;
  for (const r of ripples) {
    const dx = lnx - r.nx;
    const dy = lny - r.ny;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > r.reach) continue;
    const arrive = dist / r.speed;
    const delta = r.t - arrive;
    if (delta < 0 || delta > r.pass) continue;
    const u = delta / r.pass;
    const env = Math.sin(u * Math.PI);
    const atten = 1 - dist / r.reach;
    boost += env * atten * r.strength;
  }
  return boost;
}

function centroidOf(items) {
  if (!items.length) return { x: 0, y: 0 };
  let sx = 0, sy = 0;
  for (const it of items) { sx += it.x; sy += it.y; }
  return { x: sx / items.length, y: sy / items.length };
}

function pushFloat(game, kind, text, x, y, r) {
  const s = FLOAT_STYLES[kind];
  game.floats.push({ kind, text, x, y: y - r * s.offsetR, t: 0, life: s.life });
}

// Stamp positions, kinds, and lifetimes for one shot's bonus callouts.
// The renderer owns presentation; we only model the events.
export function emitFloats(game, popped, dropped, breakdown, layout) {
  const r = layout.size;

  if (popped.length > 0) {
    const per = breakdown.pop / popped.length;
    for (const l of popped) {
      pushFloat(game, 'pop', `+${per | 0}`, l.x, l.y, r);
    }
    if (breakdown.cluster > 0) {
      const c = centroidOf(popped);
      pushFloat(game, 'cluster', `cluster +${breakdown.cluster}`, c.x, c.y, r);
    }
  }
  if (dropped.length > 0) {
    const c = centroidOf(dropped);
    pushFloat(game, 'drop', `drop +${breakdown.drop}`, c.x, c.y, r);
  }
  if (breakdown.chainGain > 0) {
    const c = centroidOf(popped.concat(dropped));
    pushFloat(game, 'chain', `chain ×${breakdown.chainMult}`, c.x, c.y, r);
  }
  if (breakdown.combo >= 2 && breakdown.comboBonus > 0) {
    const c = centroidOf(popped.length ? popped : dropped);
    pushFloat(game, 'combo', `combo ×${breakdown.combo}`, c.x, c.y, r);
  }
}

// Spawn a ripple for a shot that earned a "big" callout — a chunky pop, a
// drop, or a building combo. Smaller pops are intentionally skipped so the
// effect stays a celebration rather than constant ambient noise.
export function emitRipple(game, popped, dropped, breakdown, layout) {
  const popN = popped.length;
  const dropN = dropped.length;
  const combo = (breakdown && breakdown.combo) || 0;
  const big = popN >= 4 || dropN >= 2 || combo >= 2;
  if (!big) return;
  const points = popN ? popped : dropped;
  if (!points.length) return;
  const c = centroidOf(points);
  // Strength controls peak brightness at the wavefront; reach controls how
  // many lamp-diameters the wave travels before fading. Both grow with the
  // size of the event so a 7-pop chained combo feels larger than a 4-pop.
  const strength = Math.min(1.0,
    0.35 +
    0.08 * Math.max(0, popN - 3) +
    0.10 * Math.max(0, dropN - 1) +
    0.07 * Math.max(0, combo - 1),
  );
  const reach = Math.min(14,
    4 +
    1.0 * popN +
    1.5 * dropN +
    0.6 * combo,
  );
  spawnRipple(game, c.x, c.y, layout, { strength, reach });
}
