// Fast checks for the puzzle-rubric metric functions (tools/puzzle-metrics.js).
// The full rubric over all puzzles is far too slow for npm test; run
// `node tools/measure-difficulty.js --rubric` for that (docs/puzzle-rubric.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickObvious, summarizeSteps, chapterMap, checkRubric, measurePuzzle,
  formatIntent, TIGHT_RATIO, INTENT_CAP,
} from '../tools/puzzle-metrics.js';
import { PUZZLE_COUNT } from '../js/puzzles.js';

test('pickObvious: max removal, then targets, then closest to straight up', () => {
  const p = (removed, removedTargets, angle, viable = true) => ({ removed, removedTargets, angle, viable });
  assert.equal(pickObvious([p(0, 0, 0), p(0, 0, 5)]), null, 'nothing removed -> no obvious move');
  const big = p(5, 0, -40);
  assert.equal(pickObvious([p(3, 0, 0), big, p(4, 2, 1)]), big);
  const tgt = p(3, 1, 30);
  assert.equal(pickObvious([p(3, 0, 0), tgt]), tgt);
  const straight = p(3, 0, -2);
  assert.equal(pickObvious([p(3, 0, 10), straight, p(3, 0, 8)]), straight);
  const left = p(3, 0, -6);
  assert.equal(pickObvious([p(3, 0, 6), left]), left, 'exact tie -> lowest angle');
});

test('summarizeSteps: luck, depth, late insight (ties -> later), temptation', () => {
  const s = summarizeSteps([
    { viable: 1, total: 4, temptation: false },  // 0.25 tight
    { viable: 3, total: 6, temptation: true },   // 0.5
    { viable: 1, total: 4, temptation: false },  // 0.25 tight, ties -> later
  ]);
  assert.equal(s.depth, 2);
  assert.equal(s.lateInsight, 3);
  assert.equal(s.frontLoaded, false);
  assert.equal(s.temptation, 1);
  assert.deepEqual(s.temptationShots, [2]);
  assert.ok(Math.abs(s.luck - 0.25 * 0.5 * 0.25) < 1e-12);

  const front = summarizeSteps([{ viable: 1, total: 10 }, { viable: 2, total: 2 }]);
  assert.equal(front.lateInsight, 1);
  assert.equal(front.frontLoaded, true);
  // The threshold is inclusive: exactly a third counts as tight.
  assert.equal(summarizeSteps([{ viable: 1, total: 3 }]).depth, 1 / 3 <= TIGHT_RATIO ? 1 : 0);
  assert.equal(formatIntent(INTENT_CAP), `${INTENT_CAP}+`);
});

test('chapterMap reads chapter boundaries from js/puzzles.js headers', () => {
  const src = [
    '  // ── Chapter 1 · First Light — basics ────',
    '  { id: 1,', '    id: 2,',
    '  // ── Chapter 2 · Golden Targets — more ───',
    '    id: 3,',
  ].join('\n');
  const m = chapterMap(src);
  assert.deepEqual(m.get(2), { chapter: 1, title: 'First Light' });
  assert.deepEqual(m.get(3), { chapter: 2, title: 'Golden Targets' });
  const real = chapterMap();
  assert.equal(real.size, PUZZLE_COUNT);
  assert.equal(real.get(1).chapter, 1);
});

test('checkRubric reports each failed target', () => {
  const r = { solvable: true, queueLength: 1, luck: 0.5, depth: 0, temptation: 0, intent: 20, frontLoaded: true };
  const { pass, fails } = checkRubric(r, { minShots: 2, maxLuck: 0.1, minDepth: 2, minTemptation: 1, maxIntent: 3, notFrontLoaded: true });
  assert.equal(pass, false);
  assert.equal(fails.length, 6);
  assert.equal(checkRubric(r, {}).pass, true);
});

test('measurePuzzle on puzzle 3 (fast): one intent, tight first shot', () => {
  const originalLog = console.log;
  console.log = () => {};
  let r;
  try { r = measurePuzzle(3); } finally { console.log = originalLog; }
  assert.ok(r.solvable);
  assert.equal(r.steps.length, r.shotsUsed);
  assert.ok(r.depth >= 1);
  assert.ok(r.intent >= 1 && r.intent <= INTENT_CAP);
  for (const s of r.steps) assert.equal(s.greedyTrap, s.temptation);
});
