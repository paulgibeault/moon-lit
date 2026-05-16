// Short-lived visual effects: pop bursts (sprite flipbook), floating score
// labels, and the moon halo pulse. The renderer reads these arrays and
// draws them — this module is the model side: spawn, tick, and decide when
// they're done.

import { BURST_DURATION_SEC } from './constants.js';

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
