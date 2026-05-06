import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToPixel, pixelToHex,
  offsetToAxial, axialToOffset,
  getNeighbors, hexCorners, gridPixelSize,
} from '../js/hex-math.js';

const layout = { size: 20, originX: 100, originY: 100 };

test('hexToPixel places (0, 0) at the layout origin', () => {
  const p = hexToPixel(0, 0, layout);
  assert.equal(p.x, 100);
  assert.equal(p.y, 100);
});

test('hexToPixel offsets odd rows by half a hex width', () => {
  const SQRT3 = Math.sqrt(3);
  const evenRow = hexToPixel(0, 2, layout);
  const oddRow  = hexToPixel(0, 1, layout);
  assert.equal(evenRow.x, 100);
  assert.ok(Math.abs(oddRow.x - (100 + SQRT3 * 20 * 0.5)) < 1e-9);
  assert.equal(evenRow.y, 100 + 1.5 * 20 * 2);
  assert.equal(oddRow.y,  100 + 1.5 * 20);
});

test('pixelToHex is the inverse of hexToPixel for cell centers', () => {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const p = hexToPixel(col, row, layout);
      const h = pixelToHex(p.x, p.y, layout);
      assert.deepEqual(h, { col, row }, `roundtrip failed at (${col}, ${row})`);
    }
  }
});

test('pixelToHex snaps near-center jitter to the same cell', () => {
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const p = hexToPixel(col, row, layout);
      const jittered = pixelToHex(p.x + 2, p.y - 1, layout);
      assert.deepEqual(jittered, { col, row });
    }
  }
});

test('offsetToAxial roundtrips through axialToOffset for both row parities', () => {
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const a = offsetToAxial(col, row);
      const back = axialToOffset(a.q, a.r);
      assert.deepEqual(back, { col, row });
    }
  }
});

test('getNeighbors returns 6 distinct cells for an even row', () => {
  const ns = getNeighbors(3, 4);
  assert.equal(ns.length, 6);
  const set = new Set(ns.map(n => `${n.col},${n.row}`));
  assert.equal(set.size, 6);
  assert.ok(set.has('4,4'));   // E
  assert.ok(set.has('2,4'));   // W
  assert.ok(set.has('3,3'));   // NE
  assert.ok(set.has('2,3'));   // NW
});

test('getNeighbors returns the right pattern for an odd row', () => {
  const ns = getNeighbors(3, 5);
  const set = new Set(ns.map(n => `${n.col},${n.row}`));
  assert.equal(set.size, 6);
  assert.ok(set.has('4,5'));   // E
  assert.ok(set.has('2,5'));   // W
  assert.ok(set.has('3,4'));   // NW for odd rows
  assert.ok(set.has('4,4'));   // NE for odd rows
  assert.ok(set.has('3,6'));
  assert.ok(set.has('4,6'));
});

test('neighbor relation is symmetric across row-parity boundary', () => {
  for (let row = 0; row < 6; row++) {
    for (let col = 1; col < 6; col++) {
      for (const n of getNeighbors(col, row)) {
        const back = getNeighbors(n.col, n.row);
        const found = back.some(b => b.col === col && b.row === row);
        assert.ok(found, `(${col},${row}) -> (${n.col},${n.row}) not symmetric`);
      }
    }
  }
});

test('hexCorners returns 6 corners equidistant from center', () => {
  const corners = hexCorners(50, 50, 10);
  assert.equal(corners.length, 6);
  for (const c of corners) {
    const d = Math.hypot(c.x - 50, c.y - 50);
    assert.ok(Math.abs(d - 10) < 1e-9);
  }
  // Pointy-top: first corner is at angle -30°, so above-right of center.
  assert.ok(corners[0].y < 50);
  assert.ok(corners[0].x > 50);
});

test('gridPixelSize accounts for odd-row half-hex overhang', () => {
  const SQRT3 = Math.sqrt(3);
  const single = gridPixelSize(1, 1, 10);
  assert.equal(single.width, SQRT3 * 10);
  assert.equal(single.height, 20);

  const tworow = gridPixelSize(3, 2, 10);
  assert.equal(tworow.width, SQRT3 * 10 * 3 + SQRT3 * 10 * 0.5);
});
