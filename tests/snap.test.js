import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard } from '../js/board.js';
import { snapNearestEmpty, traceAimLine } from '../js/game.js';
import { hexToPixel } from '../js/hex-math.js';

const layout = { size: 20, originX: 100, originY: 60, cols: 8, rows: 13, viewW: 400, viewH: 720 };

function emptyBoard() {
  const b = createBoard();
  for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) b.cells[r][c] = null;
  return b;
}

test('snapNearestEmpty picks the cell whose center is closest', () => {
  const b = emptyBoard();
  // Place a lantern adjacent so the target has an anchor.
  b.cells[3][3] = { color: 'red' };
  // Stand right on top of cell (3, 4) — empty and adjacent to (3, 3).
  const target = hexToPixel(3, 4, layout);
  const snap = snapNearestEmpty(layout, b, target.x, target.y);
  assert.deepEqual(snap, { col: 3, row: 4 });
});

test('snapNearestEmpty skips populated cells and falls back to nearest empty neighbor', () => {
  const b = emptyBoard();
  b.cells[4][3] = { color: 'red' };
  // Aim slightly towards (4, 4) but center is on (3, 4) — populated, so falls back.
  const c = hexToPixel(3, 4, layout);
  const nearby = hexToPixel(4, 4, layout);
  const x = (c.x + nearby.x) / 2 - 2;  // slight bias towards (3,4)
  const y = (c.y + nearby.y) / 2;
  const snap = snapNearestEmpty(layout, b, x, y);
  // Either (3, 4) if open, but it is populated → should land on a neighbor.
  assert.notDeepEqual(snap, { col: 3, row: 4 });
  // Snap target must be empty.
  assert.equal(b.cells[snap.row][snap.col], null);
});

test('snapNearestEmpty returns null if all nearby cells are populated', () => {
  const b = emptyBoard();
  // Fill a dense block so no empty cell within 2 rings is available.
  for (let r = 2; r <= 6; r++) {
    for (let c = 1; c <= 5; c++) b.cells[r][c] = { color: 'red' };
  }
  const center = hexToPixel(3, 4, layout);
  const snap = snapNearestEmpty(layout, b, center.x, center.y);
  assert.equal(snap, null);
});

test('traceAimLine straight up lands at the trellis on an empty board', () => {
  const b = emptyBoard();
  const trace = traceAimLine(layout, b, 0, 1);
  assert.ok(trace.snap, 'expected a snap target for straight-up shot');
  assert.equal(trace.snap.row, 0);
});

test('traceAimLine bouncing off a side wall still lands on the board', () => {
  const b = emptyBoard();
  // Aim 30° right of vertical — needs exactly one wall bounce on this layout.
  const trace = traceAimLine(layout, b, Math.PI / 6, 1);
  assert.ok(trace.snap, 'expected a snap target for bouncing shot');
  assert.ok(trace.points.length >= 3, 'expected at least one bounce point');
});

test('traceAimLine returns no snap when the shot needs more bounces than allowed', () => {
  const b = emptyBoard();
  // Steep angle on a narrow board — needs >1 bounce, so the 1-bounce preview gives up.
  const trace = traceAimLine(layout, b, Math.PI / 3, 1);
  assert.equal(trace.snap, null);
  assert.equal(trace.bounced, true);
});

test('traceAimLine snaps near a populated cell when the path collides with one', () => {
  const b = emptyBoard();
  // Block the top center.
  b.cells[0][4] = { color: 'red' };
  const trace = traceAimLine(layout, b, 0, 1);
  assert.ok(trace.snap, 'expected a snap target');
  assert.notDeepEqual(trace.snap, { col: 4, row: 0 });
});
