import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard } from '../js/board.js';
import { clearMoonburst } from '../js/match.js';
import { crossedMultiple } from '../js/scoring.js';
import { COMBO_POWERS } from '../js/constants.js';

const SQRT3 = Math.sqrt(3);

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360,
  };
}

function place(board, layout, col, row, color, extra = {}) {
  const r = layout.size;
  const odd = row & 1;
  const x = layout.originX + (col * 2 + odd) * r;
  const y = layout.trellisY + r + row * SQRT3 * r;
  const lantern = { x, y, color, ...extra };
  board.lanterns.push(lantern);
  return lantern;
}

test('crossedMultiple fires exactly on each Moonburst milestone', () => {
  const step = COMBO_POWERS.moonburstStep; // 5
  assert.equal(crossedMultiple(step - 1, step, step), true);   // 4 -> 5
  assert.equal(crossedMultiple(step, step + 1, step), false);  // 5 -> 6
  assert.equal(crossedMultiple(2 * step - 1, 2 * step, step), true); // 9 -> 10
  assert.equal(crossedMultiple(0, 0, step), false);            // whiff, no combo
  assert.equal(crossedMultiple(1, 0, step), false);            // combo reset
});

test('clearMoonburst removes lanterns within the burst radius and keeps those outside', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  // Seed at center; a tight neighbour well inside the radius; a far lantern
  // many rows away, comfortably outside. Distinct colours so no match forms —
  // the burst is a lone radius clear around impact.
  const seed = place(b, layout, 3, 3, 'red');
  const near = place(b, layout, 3, 2, 'blue'); // one packed row up — ~1 diameter
  const far = place(b, layout, 3, 12, 'green'); // 9 rows down — far outside

  const { cleared, epicenters } = clearMoonburst(b, seed, layout);

  assert.ok(cleared.includes(seed), 'seed is always cleared');
  assert.ok(cleared.includes(near), 'near neighbour inside radius is cleared');
  assert.ok(!cleared.includes(far), 'far lantern is untouched');
  assert.deepEqual(b.lanterns, [far], 'only the far lantern remains on the board');
  assert.deepEqual(epicenters, [seed], 'no match → the only epicenter is impact');
});

test('clearMoonburst is colour-blind and clears blockers too', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  const seed = place(b, layout, 3, 3, 'red');
  const blocker = place(b, layout, 4, 3, 'paper', { isBlocker: true });

  const { cleared } = clearMoonburst(b, seed, layout);

  assert.ok(cleared.includes(blocker), 'a stone blocker within radius is cleared');
  assert.equal(b.lanterns.length, 0);
});

test('clearMoonburst radius matches the configured reach', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  const seed = place(b, layout, 3, 3, 'red');
  // Place a lantern just inside and just outside the configured reach along x.
  const reachPx = COMBO_POWERS.moonburstRadius * 2 * layout.size;
  const inside = { x: seed.x + reachPx * 0.9, y: seed.y, color: 'blue' };
  const outside = { x: seed.x + reachPx * 1.1, y: seed.y, color: 'blue' };
  b.lanterns.push(inside, outside);

  const { cleared } = clearMoonburst(b, seed, layout);
  assert.ok(cleared.includes(inside));
  assert.ok(!cleared.includes(outside));
});

// Regression + enhancement: a Moonburst that also completes a colour match must
// clear the WHOLE match, not just the part inside the impact radius. Each match
// lantern becomes its own epicenter so the burst follows the match's shape.
test('clearMoonburst clears the full colour match even beyond the impact radius', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  // A touching vertical chain of six reds. Rows 4 and 5 sit beyond the burst
  // radius from the seed at row 0, so an impact-only radius clear would strand
  // them — the bug this fixes.
  const chain = [];
  for (let row = 0; row < 6; row++) chain.push(place(b, layout, 3, row, 'red'));
  const seed = chain[0];
  const reachPx = COMBO_POWERS.moonburstRadius * 2 * layout.size;
  const farFromSeed = chain.filter(l => Math.hypot(l.x - seed.x, l.y - seed.y) > reachPx);
  assert.ok(farFromSeed.length > 0, 'fixture must put some match lanterns beyond the radius');

  const { cleared, epicenters } = clearMoonburst(b, seed, layout);

  for (const l of chain) assert.ok(cleared.includes(l), 'every match lantern is cleared');
  assert.equal(b.lanterns.length, 0, 'nothing from the match is left behind');
  assert.equal(epicenters.length, chain.length, 'the whole match becomes epicenters');
});
