import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard } from '../js/board.js';
import { traceAimLine } from '../js/game.js';

const SQRT3 = Math.sqrt(3);

function fixtureLayout() {
  return {
    size: 20,
    originX: 100,
    trellisY: 60,
    deadLineY: 600,
    tipY: 684,
    cols: 8,
    maxRows: 13,
    viewW: 400,
    viewH: 720,
    wallLeft: 40,
    wallRight: 360,
  };
}

test('traceAimLine straight up lands against the trellis on an empty board', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  const trace = traceAimLine(layout, b, 0, 1);
  assert.ok(trace.settle, 'expected a settle target for straight-up shot');
  // Lantern should sit with its top edge on the trellis line.
  assert.ok(Math.abs(trace.settle.y - (layout.trellisY + layout.size)) < 1,
    `settle y=${trace.settle.y}, expected ~${layout.trellisY + layout.size}`);
});

test('traceAimLine bouncing off a side wall still settles', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  // Aim 30° right of vertical — needs at least one wall bounce on this layout.
  const trace = traceAimLine(layout, b, Math.PI / 6, 1);
  assert.ok(trace.settle, 'expected a settle target for bouncing shot');
  assert.ok(trace.points.length >= 3, 'expected at least one bounce point');
});

test('traceAimLine returns no settle when more bounces than allowed are needed', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  const trace = traceAimLine(layout, b, Math.PI / 3, 1);
  assert.equal(trace.settle, null);
  assert.equal(trace.bounced, true);
});

test('traceAimLine settles touching an existing lantern when the path collides', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  // Block the top center directly above the launcher.
  const blockerX = layout.viewW / 2;
  const blockerY = layout.trellisY + layout.size;
  b.lanterns.push({ x: blockerX, y: blockerY, color: 'red' });
  const trace = traceAimLine(layout, b, 0, 1);
  assert.ok(trace.settle, 'expected a settle target');
  // Settled lantern should be touching the blocker (centers ~2r apart).
  const dx = trace.settle.x - blockerX;
  const dy = trace.settle.y - blockerY;
  const dist = Math.hypot(dx, dy);
  assert.ok(Math.abs(dist - 2 * layout.size) < 1,
    `settle distance from blocker=${dist}, expected ~${2 * layout.size}`);
});

test('settled lanterns do not overlap the blocker', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  const blockerX = layout.viewW / 2;
  const blockerY = layout.trellisY + layout.size;
  b.lanterns.push({ x: blockerX, y: blockerY, color: 'red' });
  const trace = traceAimLine(layout, b, 0, 1);
  const dx = trace.settle.x - blockerX;
  const dy = trace.settle.y - blockerY;
  // Centers must be ≥ 2r (touching but not overlapping).
  assert.ok(Math.hypot(dx, dy) >= 2 * layout.size - 1e-6);
});

test('shot fired into a same-color cluster pops the cluster (match-3)', async () => {
  const { createBoard } = await import('../js/board.js');
  const { popMatches } = await import('../js/match.js');
  const layout = fixtureLayout();
  const b = createBoard();
  const r = layout.size;
  // Place three reds touching in the top row, centered on viewW/2.
  const cx = layout.viewW / 2;
  const topY = layout.trellisY + r;
  b.lanterns.push({ x: cx - 2 * r, y: topY, color: 'red' });
  b.lanterns.push({ x: cx,         y: topY, color: 'red' });
  b.lanterns.push({ x: cx + 2 * r, y: topY, color: 'red' });
  // Fire a fourth red straight up from the center of the launcher.
  const trace = traceAimLine(layout, b, 0, 1);
  assert.ok(trace.settle, 'expected a settle target');
  // Add the projectile and run the match check.
  const placed = { x: trace.settle.x, y: trace.settle.y, color: 'red' };
  b.lanterns.push(placed);
  const popped = popMatches(b, placed, layout);
  assert.ok(popped.length >= 3,
    `expected match-3+, got cluster of ${popped.length}; settle=(${trace.settle.x.toFixed(2)}, ${trace.settle.y.toFixed(2)})`);
});
