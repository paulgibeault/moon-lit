// CLI verifier for Moon Lit puzzles. Solves every puzzle at full queue depth
// with the exact solver (tools/solver.js), then replay-validates each found
// solution through the real game loop.
//
//   node tools/test-puzzles.js          # verify all puzzles
//   node tools/test-puzzles.js 7        # verify one puzzle, print solution detail
//   node tools/test-puzzles.js 1 20     # verify a range

import { verifyPuzzle } from './solver.js';
import { puzzleConfig, PUZZLE_COUNT } from '../js/puzzles.js';

// Human-playability bar: a verified solution must exist in which EVERY shot
// has at least this wide a contiguous aim-angle window. Technically-solvable
// puzzles that demand pixel-perfect flicks are treated as failures.
const MIN_WINDOW_DEG = 2.0;

const args = process.argv.slice(2).map(Number).filter(n => !Number.isNaN(n));
let from = 1, to = PUZZLE_COUNT;
if (args.length === 1) { from = to = args[0]; }
if (args.length >= 2) { [from, to] = args; }

const originalLog = console.log;
console.log = () => {};
const results = [];
for (let id = from; id <= to; id++) {
  results.push(verifyPuzzle(id, { minWindowDeg: MIN_WINDOW_DEG }));
}
console.log = originalLog;

console.log('=== Moon Lit Puzzle Solvability ===');
let allPass = true;
for (const r of results) {
  if (r.solvable && r.replayWon) {
    const angles = r.solution.map(s => `${s.angleDeg.toFixed(1)}°`).join(', ');
    const windows = r.solution.map(s => (s.angleHi - s.angleLo).toFixed(1)).join('/');
    console.log(`[PASS] ${String(r.id).padStart(2)} "${r.name}" — ${r.solution.length}/${r.queueLength} shots, angles [${angles}], windows ${windows}°, ${r.nodes} nodes, ${r.ms}ms`);
  } else if (r.solvable && !r.replayWon) {
    allPass = false;
    console.log(`[WARN] ${String(r.id).padStart(2)} "${r.name}" — solver found a line but replay diverged (${r.nodes} nodes, ${r.ms}ms)`);
  } else {
    allPass = false;
    const note = r.exhausted ? 'search exhausted: UNSOLVABLE' : 'node budget hit: unknown';
    console.log(`[FAIL] ${String(r.id).padStart(2)} "${r.name}" — ${note} (${r.nodes} nodes, ${r.ms}ms)`);
  }
}

if (from === to && results[0].solution) {
  console.log('\nSolution detail:');
  for (const [i, s] of results[0].solution.entries()) {
    const pz = puzzleConfig(from);
    console.log(`  shot ${i + 1} (${pz.queue[i]}): aim ${s.angleDeg.toFixed(2)}° (window ${s.angleLo.toFixed(1)}..${s.angleHi.toFixed(1)}), lands (${s.x.toFixed(0)}, ${s.y.toFixed(0)}), pops ${s.popped}, drops ${s.dropped}`);
  }
}

console.log(allPass ? '\nAll puzzles verified solvable.' : '\nSome puzzles failed verification.');
process.exit(allPass ? 0 : 1);
