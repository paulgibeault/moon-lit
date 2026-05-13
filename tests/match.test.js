import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, addLantern } from '../js/board.js';
import { findCluster, popMatches, dropFloating } from '../js/match.js';
import { popScore, dropScore, POP_POINTS } from '../js/scoring.js';
import { settleAround } from '../js/physics.js';

const SQRT3 = Math.sqrt(3);

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360,
  };
}

// Helper: place a lantern at (col, row) using close-packed positions
// (mirrors what populateInitial would produce, without touching rng).
function place(board, layout, col, row, color) {
  const r = layout.size;
  const odd = row & 1;
  const x = layout.originX + (col * 2 + odd) * r;
  const y = layout.trellisY + r + row * SQRT3 * r;
  const lantern = { x, y, color };
  board.lanterns.push(lantern);
  return lantern;
}

test('findCluster returns just the seed when no same-color neighbours touch', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  const seed = place(b, layout, 3, 3, 'red');
  place(b, layout, 4, 3, 'jade');
  const cluster = findCluster(b, seed, layout);
  assert.equal(cluster.length, 1);
  assert.equal(cluster[0], seed);
});

test('findCluster walks across same-color touching lanterns', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  // Pack 4 reds in close-pack positions at (3,3), (3,2), (4,2), (3,4).
  const seed = place(b, layout, 3, 3, 'red');
  place(b, layout, 3, 2, 'red');
  place(b, layout, 4, 2, 'red');
  place(b, layout, 3, 4, 'red');
  const cluster = findCluster(b, seed, layout);
  assert.equal(cluster.length, 4);
});

test('popMatches clears clusters of 3+ and returns them', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  const a = place(b, layout, 2, 0, 'red');
  place(b, layout, 3, 0, 'red');
  place(b, layout, 4, 0, 'red');
  const popped = popMatches(b, a, layout);
  assert.equal(popped.length, 3);
  assert.equal(b.lanterns.length, 0);
});

test('popMatches leaves the board untouched for clusters under 3', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  const a = place(b, layout, 2, 0, 'red');
  place(b, layout, 3, 0, 'red');
  const popped = popMatches(b, a, layout);
  assert.deepEqual(popped, []);
  assert.equal(b.lanterns.length, 2);
});

test('dropFloating clears anything not connected to the trellis', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  // Anchored: (0, 0) on the trellis. Floating cluster: two reds at row 5.
  place(b, layout, 0, 0, 'red');
  place(b, layout, 3, 5, 'jade');
  place(b, layout, 4, 5, 'jade');
  const dropped = dropFloating(b, layout);
  assert.equal(dropped.length, 2);
  assert.equal(b.lanterns.length, 1);
});

test('dropFloating keeps a chain that hangs from the trellis', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  place(b, layout, 3, 0, 'red');
  place(b, layout, 3, 1, 'red');
  place(b, layout, 3, 2, 'red');
  const dropped = dropFloating(b, layout);
  assert.deepEqual(dropped, []);
  assert.equal(b.lanterns.length, 3);
});

test('dropFloating returns nothing on an empty board', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  assert.deepEqual(dropFloating(b, layout), []);
});

test('popScore is flat per popped lantern', () => {
  assert.equal(popScore([]), 0);
  assert.equal(popScore([{}, {}, {}]), 3 * POP_POINTS);
});

test('dropScore scales quadratically with cluster size', () => {
  assert.equal(dropScore([]), 0);
  assert.equal(dropScore([{}]), 20);
  assert.equal(dropScore([{}, {}, {}]), 180);
  assert.equal(dropScore([{}, {}, {}, {}, {}]), 500);
});

// Regression: settle used to run *before* popMatches, which let it drift
// the new lantern off its same-color anchors past the tight 1.04 adjacency
// tolerance — the player saw a clear visual match that didn't pop. The
// contract now: match against the placement position, settle only when the
// lantern stays on the board.
test('match still triggers when settle would absorb a tight pocket', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  const r = layout.size;
  const rowH = SQRT3 * r;
  const topY = layout.trellisY + r;

  // Two reds in row 0 (pinned to the trellis), tangent to each other.
  b.lanterns.push({ x: 140, y: topY, color: 'red' });
  b.lanterns.push({ x: 180, y: topY, color: 'red' });

  // A jade obstacle sits inside the row-1 pocket — close enough that the
  // settler has to relax it. Mirrors a board that drifted off-grid from
  // prior placements or a descent.
  b.lanterns.push({ x: 160, y: topY + rowH * 0.55, color: 'jade' });

  // Player fires a red into the row-1 pocket: at the close-pack apex it
  // sits tangent to both row-0 reds.
  addLantern(b, 160, topY + rowH, 'red');
  const newLantern = b.lanterns[b.lanterns.length - 1];

  // Mirror the placement pipeline: pop first, settle only on a miss.
  const popped = popMatches(b, newLantern, layout);
  if (popped.length === 0) settleAround(b, layout, newLantern);

  assert.ok(popped.length >= 3,
    `expected 3+ pop, got ${popped.length}; new at (${newLantern.x.toFixed(2)}, ${newLantern.y.toFixed(2)})`);
});
