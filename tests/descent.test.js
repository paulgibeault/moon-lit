import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, descend, isCleared } from '../js/board.js';
import { mulberry32 } from '../js/prng.js';

test('descend shifts every populated cell down by one row', () => {
  const b = createBoard();
  b.cells[0][2] = { color: 'red' };
  b.cells[3][5] = { color: 'jade' };
  const ok = descend(b, mulberry32(1));
  assert.equal(ok, true);
  assert.equal(b.cells[1][2].color, 'red');
  assert.equal(b.cells[4][5].color, 'jade');
});

test('descend seeds a fresh top row from the rng', () => {
  const b = createBoard();
  descend(b, mulberry32(42));
  for (let col = 0; col < b.cols; col++) {
    assert.ok(b.cells[0][col], `row 0 col ${col} should be populated`);
  }
});

test('descend returns false when the bottom row already holds lanterns', () => {
  const b = createBoard();
  b.cells[b.rows - 1][0] = { color: 'red' };
  const ok = descend(b, mulberry32(1));
  assert.equal(ok, false);
  // Board should be untouched on failure.
  assert.equal(b.cells[b.rows - 1][0].color, 'red');
  assert.equal(b.cells[0][0], null);
});

test('isCleared is true only when no cells are populated', () => {
  const b = createBoard();
  assert.equal(isCleared(b), true);
  b.cells[2][3] = { color: 'red' };
  assert.equal(isCleared(b), false);
  b.cells[2][3] = null;
  assert.equal(isCleared(b), true);
});
