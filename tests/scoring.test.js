import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  popScore, clusterBonus, dropScore, resolveShot, clearBonus, crossedMilestone,
  POP_POINTS, MILESTONE_STEP,
} from '../js/scoring.js';

const fakes = (n) => Array.from({ length: n }, () => ({}));

test('popScore is flat per popped lantern', () => {
  assert.equal(popScore([]), 0);
  assert.equal(popScore(fakes(3)), 3 * POP_POINTS);
});

test('clusterBonus is zero for clusters of 3 or fewer, quadratic above', () => {
  assert.equal(clusterBonus(fakes(3)), 0);
  assert.equal(clusterBonus(fakes(4)), 10);
  assert.equal(clusterBonus(fakes(5)), 40);
  assert.equal(clusterBonus(fakes(7)), 160);
});

test('dropScore scales quadratically', () => {
  assert.equal(dropScore([]), 0);
  assert.equal(dropScore(fakes(1)), 20);
  assert.equal(dropScore(fakes(3)), 180);
});

test('resolveShot sums components and resets combo on a no-score shot', () => {
  // 3-pop, no drop, fresh combo
  const r = resolveShot(fakes(3), [], 0);
  assert.equal(r.pop, 30);
  assert.equal(r.cluster, 0);
  assert.equal(r.drop, 0);
  assert.equal(r.chainMult, 1);
  assert.equal(r.chainGain, 0);
  assert.equal(r.combo, 1);
  assert.equal(r.comboBonus, 5);
  assert.equal(r.total, 35);

  // No pops resets combo
  const miss = resolveShot([], [], 4);
  assert.equal(miss.combo, 0);
  assert.equal(miss.total, 0);
});

test('resolveShot applies the chain multiplier when both pop and drop fire', () => {
  // 4-pop (40 + 10 cluster) plus 2-drop (80) at combo=2
  const r = resolveShot(fakes(4), fakes(2), 1);
  // base = 40 + 10 + 80 = 130
  // chainGain = round(130 * 0.5) = 65
  // combo becomes 2 → comboBonus = 10
  assert.equal(r.chainMult, 1.5);
  assert.equal(r.chainGain, 65);
  assert.equal(r.combo, 2);
  assert.equal(r.comboBonus, 10);
  assert.equal(r.total, 130 + 65 + 10);
});

test('clearBonus rewards leftover descent shots', () => {
  assert.equal(clearBonus(0), 100);
  assert.equal(clearBonus(6), 160);
  assert.equal(clearBonus(-3), 100);
});

test('crossedMilestone fires only when the threshold flips', () => {
  assert.equal(crossedMilestone(900, 950), false);
  assert.equal(crossedMilestone(950, MILESTONE_STEP + 10), true);
  assert.equal(crossedMilestone(MILESTONE_STEP, MILESTONE_STEP + 10), false);
  assert.equal(crossedMilestone(0, 0), false);
});
