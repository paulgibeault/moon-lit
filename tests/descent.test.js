import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, populateInitial, descend, isCleared } from '../js/board.js';
import { mulberry32 } from '../js/prng.js';

const SQRT3 = Math.sqrt(3);

function fixtureLayout() {
  // Fixed test layout: r=20, trellis at y=40, plenty of room above the dead line.
  return {
    size: 20,
    originX: 100,
    trellisY: 40,
    deadLineY: 600,
    cols: 8,
    maxRows: 13,
  };
}

test('descend translates every lantern down by one packed-row height', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  b.lanterns.push({ x: 200, y: 100, color: 'red' });
  b.lanterns.push({ x: 240, y: 200, color: 'jade' });
  const ok = descend(b, layout, mulberry32(1));
  assert.equal(ok, true);
  const rowH = SQRT3 * layout.size;
  const red  = b.lanterns.find(l => l.color === 'red');
  const jade = b.lanterns.find(l => l.color === 'jade');
  assert.ok(Math.abs(red.x - 200) < 1e-9);
  assert.ok(Math.abs(red.y - (100 + rowH)) < 1e-9);
  assert.ok(Math.abs(jade.x - 240) < 1e-9);
  assert.ok(Math.abs(jade.y - (200 + rowH)) < 1e-9);
});

test('descend seeds a fresh top row touching the trellis', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  descend(b, layout, mulberry32(42));
  const topRow = b.lanterns.filter(l => Math.abs(l.y - (layout.trellisY + layout.size)) < 1e-6);
  // The first descend seeds an odd-staggered row (so it would mesh with a
  // descended even-staggered row below it). Odd rows hold cols-1 lanterns.
  assert.equal(topRow.length, layout.cols - 1);
  for (const l of topRow) {
    assert.ok(typeof l.color === 'string' && l.color.length > 0);
  }
});

test('descend preserves x-coordinates exactly (no horizontal drift)', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  populateInitial(b, layout, mulberry32(1), 3);
  const before = b.lanterns.map(l => ({ x: l.x, y: l.y }));
  descend(b, layout, mulberry32(2));
  // The original lanterns are still the first N entries (descend pushes new
  // ones at the end). Their x must be unchanged.
  for (let i = 0; i < before.length; i++) {
    assert.ok(Math.abs(b.lanterns[i].x - before[i].x) < 1e-9,
      `lantern ${i} x drifted: ${before[i].x} → ${b.lanterns[i].x}`);
  }
});

test('descend returns false when a lantern would cross the dead line', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  // Place a lantern that's exactly one row-height above the dead line.
  const rowH = SQRT3 * layout.size;
  b.lanterns.push({ x: 200, y: layout.deadLineY - layout.size, color: 'red' });
  const ok = descend(b, layout, mulberry32(1));
  assert.equal(ok, false);
  // Board must be untouched on failure.
  assert.equal(b.lanterns.length, 1);
  assert.equal(b.lanterns[0].y, layout.deadLineY - layout.size);
});

test('isCleared reflects the lantern list emptiness', () => {
  const b = createBoard();
  assert.equal(isCleared(b), true);
  b.lanterns.push({ x: 0, y: 0, color: 'red' });
  assert.equal(isCleared(b), false);
  b.lanterns.length = 0;
  assert.equal(isCleared(b), true);
});

test('populateInitial close-packs N rows so each row touches the next', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  populateInitial(b, layout, mulberry32(7), 2);
  const rowH = SQRT3 * layout.size;
  const top  = b.lanterns.filter(l => Math.abs(l.y - (layout.trellisY + layout.size)) < 1e-6);
  const next = b.lanterns.filter(l => Math.abs(l.y - (layout.trellisY + layout.size + rowH)) < 1e-6);
  assert.equal(top.length, layout.cols);
  assert.equal(next.length, layout.cols - 1); // odd row has one fewer
});

test('descend seeds new top row staggered to mesh with the row below it', () => {
  const layout = fixtureLayout();
  const b = createBoard();
  populateInitial(b, layout, mulberry32(1), 1); // one even-staggered row
  // After 1 descend, the descended row sits one packed-row down with
  // even-stagger x; the new top row must be odd-staggered (offset by r)
  // so each new lantern's distance to its descended neighbour is exactly 2r.
  descend(b, layout, mulberry32(2));
  const r = layout.size;
  const newTop = b.lanterns.filter(l => Math.abs(l.y - (layout.trellisY + r)) < 1e-6);
  assert.ok(newTop.length > 0, 'expected freshly seeded top row');
  for (const top of newTop) {
    let nearest = Infinity;
    for (const l of b.lanterns) {
      if (l === top) continue;
      const dx = l.x - top.x, dy = l.y - top.y;
      const d = Math.hypot(dx, dy);
      if (d < nearest) nearest = d;
    }
    // Closest lantern should be ~2r away (touching, not overlapping).
    assert.ok(nearest >= 2 * r - 1e-6,
      `new top row lantern overlaps a neighbour: nearest=${nearest}, expected >= ${2 * r}`);
  }
});
