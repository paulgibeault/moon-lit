import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard } from '../js/board.js';
import { clearRadius } from '../js/match.js';
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

test('clearRadius removes lanterns within the burst radius and keeps those outside', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  // Seed at center; a tight neighbour well inside the radius; a far lantern
  // many rows away, comfortably outside.
  const seed = place(b, layout, 3, 3, 'red');
  const near = place(b, layout, 3, 2, 'blue'); // one packed row up — ~1 diameter
  const far = place(b, layout, 3, 12, 'green'); // 9 rows down — far outside

  const cleared = clearRadius(b, seed, layout);

  assert.ok(cleared.includes(seed), 'seed is always cleared');
  assert.ok(cleared.includes(near), 'near neighbour inside radius is cleared');
  assert.ok(!cleared.includes(far), 'far lantern is untouched');
  assert.deepEqual(b.lanterns, [far], 'only the far lantern remains on the board');
});

test('clearRadius is colour-blind and clears blockers too', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  const seed = place(b, layout, 3, 3, 'red');
  const blocker = place(b, layout, 4, 3, 'paper', { isBlocker: true });

  const cleared = clearRadius(b, seed, layout);

  assert.ok(cleared.includes(blocker), 'a stone blocker within radius is cleared');
  assert.equal(b.lanterns.length, 0);
});

test('clearRadius radius matches the configured reach', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  const seed = place(b, layout, 3, 3, 'red');
  // Place a lantern just inside and just outside the configured reach along x.
  const reachPx = COMBO_POWERS.moonburstRadius * 2 * layout.size;
  const inside = { x: seed.x + reachPx * 0.9, y: seed.y, color: 'blue' };
  const outside = { x: seed.x + reachPx * 1.1, y: seed.y, color: 'blue' };
  b.lanterns.push(inside, outside);

  const cleared = clearRadius(b, seed, layout);
  assert.ok(cleared.includes(inside));
  assert.ok(!cleared.includes(outside));
});
