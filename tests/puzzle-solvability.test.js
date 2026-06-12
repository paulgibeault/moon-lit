// Every puzzle must be beatable by a human: solvable within its full shot
// queue, using only shots whose aim window is at least MIN_WINDOW_DEG wide
// (no pixel-perfect flicks), with the found solution replay-validated through
// the real createGame()/fire()/step() loop.
//
// The solver lives in tools/solver.js and is shared with the CLI runner
// (node tools/test-puzzles.js), which prints solution detail for design work.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyPuzzle } from '../tools/solver.js';
import { puzzleConfig, PUZZLE_COUNT } from '../js/puzzles.js';

const MIN_WINDOW_DEG = 2.0;

for (let id = 1; id <= PUZZLE_COUNT; id++) {
  test(`puzzle ${id} ("${puzzleConfig(id).name}") is solvable with forgiving aim windows`, () => {
    const originalLog = console.log;
    console.log = () => {};
    let result;
    try {
      result = verifyPuzzle(id, { minWindowDeg: MIN_WINDOW_DEG });
    } finally {
      console.log = originalLog;
    }
    assert.ok(
      result.solvable,
      `Puzzle ${id} ("${result.name}") has no solution with every aim window >= ${MIN_WINDOW_DEG} deg.`
    );
    assert.ok(
      result.replayWon,
      `Puzzle ${id} ("${result.name}") solver line did not win when replayed through the real game loop.`
    );
  });
}
