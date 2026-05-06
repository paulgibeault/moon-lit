import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, pickIndex, pick } from '../js/prng.js';

test('mulberry32 produces values in [0, 1)', () => {
  const rng = mulberry32(0xDEADBEEF);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('mulberry32 is deterministic for the same seed', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 50; i++) {
    assert.equal(a(), b());
  }
});

test('mulberry32 diverges for different seeds', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  let same = 0;
  for (let i = 0; i < 50; i++) {
    if (a() === b()) same++;
  }
  assert.ok(same < 5, `streams should diverge, got ${same} matches`);
});

test('pickIndex stays within [0, n)', () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 200; i++) {
    const idx = pickIndex(rng, 6);
    assert.ok(Number.isInteger(idx) && idx >= 0 && idx < 6);
  }
});

test('pick returns one of the list elements', () => {
  const rng = mulberry32(99);
  const list = ['a', 'b', 'c'];
  for (let i = 0; i < 30; i++) {
    assert.ok(list.includes(pick(rng, list)));
  }
});
