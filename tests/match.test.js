import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard } from '../js/board.js';
import {
  findCluster, popMatches, dropFloating,
  popScore, dropScore, POP_POINTS,
} from '../js/match.js';

function paint(board, list, color) {
  for (const [c, r] of list) board.cells[r][c] = { color };
}

test('findCluster returns just the seed when no same-color neighbours', () => {
  const b = createBoard();
  b.cells[3][3] = { color: 'red' };
  b.cells[3][4] = { color: 'jade' };
  const cluster = findCluster(b, 3, 3);
  assert.equal(cluster.length, 1);
  assert.deepEqual(cluster[0], { col: 3, row: 3 });
});

test('findCluster walks across same-color neighbours regardless of row parity', () => {
  const b = createBoard();
  // Odd-r adjacency: (3,3) is on an odd row, so its neighbours include
  // (3,2) and (4,2) on the row above and (3,4)/(4,4) below.
  paint(b, [[3,3],[3,2],[4,2],[3,4]], 'red');
  const cluster = findCluster(b, 3, 3);
  assert.equal(cluster.length, 4);
});

test('popMatches clears clusters of 3+ and returns them', () => {
  const b = createBoard();
  paint(b, [[2,0],[3,0],[4,0]], 'red');
  const popped = popMatches(b, 3, 0);
  assert.equal(popped.length, 3);
  assert.equal(b.cells[0][2], null);
  assert.equal(b.cells[0][3], null);
  assert.equal(b.cells[0][4], null);
});

test('popMatches leaves the board untouched for clusters under 3', () => {
  const b = createBoard();
  paint(b, [[2,0],[3,0]], 'red');
  const popped = popMatches(b, 3, 0);
  assert.deepEqual(popped, []);
  assert.ok(b.cells[0][2]);
  assert.ok(b.cells[0][3]);
});

test('dropFloating clears anything not connected to row 0', () => {
  const b = createBoard();
  // Anchored: (0,0). Floating cluster: (3,5)-(4,5).
  b.cells[0][0] = { color: 'red' };
  b.cells[5][3] = { color: 'jade' };
  b.cells[5][4] = { color: 'jade' };
  const dropped = dropFloating(b);
  assert.equal(dropped.length, 2);
  assert.ok(b.cells[0][0]);
  assert.equal(b.cells[5][3], null);
  assert.equal(b.cells[5][4], null);
});

test('dropFloating keeps a chain that hangs from the ceiling', () => {
  const b = createBoard();
  // Vertical-ish chain: (3,0)→(3,1)→(3,2). With odd-r, (3,1) on odd row
  // has neighbours including (3,0) above and (3,2) below.
  b.cells[0][3] = { color: 'red' };
  b.cells[1][3] = { color: 'red' };
  b.cells[2][3] = { color: 'red' };
  const dropped = dropFloating(b);
  assert.deepEqual(dropped, []);
  assert.ok(b.cells[0][3]);
  assert.ok(b.cells[1][3]);
  assert.ok(b.cells[2][3]);
});

test('dropFloating returns nothing on an empty board', () => {
  const b = createBoard();
  assert.deepEqual(dropFloating(b), []);
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
