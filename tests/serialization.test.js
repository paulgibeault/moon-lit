import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreGame, SAVE_VERSION } from '../js/serialization.js';

test('restore v5 (current version) save state succeeds with identical values', () => {
  const save = {
    version: 5,
    level: 2,
    score: 1500,
    aimAngle: 0.5,
    phase: 'aiming',
    queue: {
      current: 'red',
      currentDesign: 'bugs_red',
      next: 'green',
      nextDesign: 'flowers_green',
      afterNext: 'blue',
      afterNextDesign: 'dragons_blue'
    },
    breakdown: { pop: 200, cluster: 100, drop: 300, chain: 50, combo: 20, clear: 0 },
    counts: { popped: 10, dropped: 15 },
    combo: 3,
    bestCombo: 5,
    shotsUntilDescent: 4,
    pendingDescent: false,
    board: {
      descentCount: 1,
      lanterns: [
        { nx: 0, ny: 0, color: 'red', designId: 'bugs_red' },
        { nx: 1, ny: 0, color: 'green', designId: 'flowers_green' }
      ]
    },
    rngState: 12345
  };

  const game = restoreGame(save);
  assert.ok(game);
  assert.equal(game.level, 2);
  assert.equal(game.score, 1500);
  assert.equal(game.aimAngle, 0.5);
  assert.equal(game.queue.current, 'red');
  assert.equal(game.queue.currentDesign, 'bugs_red');
  assert.equal(game.queue.next, 'green');
  assert.equal(game.queue.nextDesign, 'flowers_green');
  assert.equal(game.queue.afterNext, 'blue');
  assert.equal(game.queue.afterNextDesign, 'dragons_blue');
  assert.equal(game.board.lanterns.length, 2);
  assert.equal(game.board.lanterns[0].color, 'red');
  assert.equal(game.board.lanterns[0].designId, 'bugs_red');
  assert.equal(game.board.lanterns[1].color, 'green');
  assert.equal(game.board.lanterns[1].designId, 'flowers_green');
  assert.equal(game.combo, 3);
  assert.equal(game.bestCombo, 5);
  assert.equal(game.shotsUntilDescent, 4);
});

test('restore legacy v4 save upgrades to version 5', () => {
  const save = {
    version: 4,
    level: 1,
    score: 500,
    aimAngle: 0.1,
    phase: 'aiming',
    queue: { current: 'red', next: 'green', afterNext: 'blue' },
    board: {
      descentCount: 0,
      lanterns: [
        { nx: 0, ny: 0, color: 'red' },
        { nx: 1, ny: 0, color: 'green' }
      ]
    },
    rngState: 9999
  };

  const game = restoreGame(save);
  assert.ok(game);
  assert.equal(game.level, 1);
  assert.equal(game.queue.current, 'red');
  assert.equal(game.queue.next, 'green');
  assert.equal(game.queue.afterNext, 'blue');
  assert.equal(game.board.lanterns.length, 2);
  assert.equal(game.board.lanterns[0].color, 'red');
  assert.equal(game.board.lanterns[1].color, 'green');
});

test('restore legacy v3 save with pink maps pink to paper and upgrades to version 4', () => {
  const save = {
    version: 3,
    level: 1,
    score: 500,
    aimAngle: -0.2,
    phase: 'aiming',
    queue: { current: 'pink', next: 'blue' },
    board: {
      descentCount: 0,
      lanterns: [
        { nx: 2, ny: 1, color: 'pink' },
        { nx: 3, ny: 1, color: 'orange' }
      ]
    },
    rngState: 98765
  };

  const game = restoreGame(save);
  assert.ok(game);
  assert.equal(game.level, 1);
  assert.equal(game.queue.current, 'paper'); // pink -> paper
  assert.equal(game.queue.next, 'blue');
  assert.equal(game.board.lanterns[0].color, 'paper'); // pink -> paper
  assert.equal(game.board.lanterns[1].color, 'orange');
});

test('restore legacy v2 save with plum maps plum to pink to paper and upgrades to version 4', () => {
  const save = {
    version: 2,
    level: 1,
    score: 120,
    queue: { current: 'plum', next: 'yellow' },
    board: {
      descentCount: 2,
      lanterns: [
        { nx: 0, ny: 0, color: 'plum' }
      ]
    }
  };

  const game = restoreGame(save);
  assert.ok(game);
  assert.equal(game.queue.current, 'paper'); // plum -> pink -> paper
  assert.equal(game.queue.next, 'yellow');
  assert.equal(game.board.lanterns[0].color, 'paper'); // plum -> pink -> paper
});

test('restore legacy v1 save with white maps white to plum to pink to paper and upgrades to version 4', () => {
  const save = {
    version: 1,
    level: 1,
    score: 0,
    queue: { current: 'white', next: 'red' },
    board: {
      descentCount: 0,
      lanterns: [
        { nx: 1, ny: 0, color: 'white' }
      ]
    }
  };

  const game = restoreGame(save);
  assert.ok(game);
  assert.equal(game.queue.current, 'paper'); // white -> plum -> pink -> paper
  assert.equal(game.queue.next, 'red');
  assert.equal(game.board.lanterns[0].color, 'paper');
});

test('restore handles completely missing optional fields gracefully', () => {
  const save = {
    version: 4,
    // level, score, aimAngle, phase, breakdown, counts, combo, bestCombo, rngState missing
    queue: { current: 'red', next: 'blue' },
    board: {
      descentCount: 0,
      lanterns: []
    }
  };

  const game = restoreGame(save);
  assert.ok(game);
  assert.equal(game.level, 1);
  assert.equal(game.score, 0);
  assert.equal(game.aimAngle, 0);
  assert.equal(game.phase, 'aiming');
  assert.deepEqual(game.breakdown, { pop: 0, cluster: 0, drop: 0, chain: 0, combo: 0, clear: 0 });
  assert.deepEqual(game.counts, { popped: 0, dropped: 0 });
  assert.equal(game.combo, 0);
  assert.equal(game.bestCombo, 0);
});
