import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, PHASE, fire } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';
import { serializeGame, restoreGame } from '../js/serialization.js';
import { syncLanternPixels } from '../js/board.js';

function fixtureLayout() {
  return {
    size: 16, originX: 88, trellisY: 64, deadLineY: 631, cols: 8, maxRows: 19,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 633,
  };
}

function runSimulation(game, layout) {
  let steps = 0;
  while ((game.phase === PHASE.FLYING || game.phase === PHASE.SETTLING || game.phase === PHASE.DESCENDING || game.shots.length > 0) && steps < 4000) {
    step(game, 0.016, layout);
    steps++;
  }
}

function solvePuzzleDFS(gameState, layout, depth, maxDepth, angleStep) {
  if (gameState.phase === PHASE.WIN) {
    return [];
  }
  if (gameState.phase === PHASE.GAME_OVER || gameState.phase === PHASE.DROWNING || depth >= maxDepth) {
    return null;
  }

  const angles = [];
  for (let angleDeg = -80; angleDeg <= 80; angleDeg += angleStep) {
    angles.push(angleDeg);
  }

  const snapshot = serializeGame(gameState);

  for (const angleDeg of angles) {
    const gameCopy = restoreGame(snapshot);
    syncLanternPixels(gameCopy.board, layout);
    gameCopy.aimAngle = (angleDeg * Math.PI) / 180;

    fire(gameCopy, layout);
    runSimulation(gameCopy, layout);

    if (gameCopy.phase === PHASE.WIN) {
      return [angleDeg];
    }

    if (gameCopy.phase === PHASE.AIMING && depth + 1 < maxDepth) {
      const rest = solvePuzzleDFS(gameCopy, layout, depth + 1, maxDepth, angleStep);
      if (rest !== null) {
        return [angleDeg, ...rest];
      }
    }
  }

  return null;
}

function verifyPuzzle(puzzleId) {
  const layout = fixtureLayout();
  const pz = puzzleConfig(puzzleId);
  const game = createGame({ layout, isPuzzleMode: true, puzzleId });
  game.showModeIntroCard = false; // Dismiss intro so step() isn't blocked

  const queueLength = pz.queue.length;
  let maxDepth = Math.min(queueLength, 3);
  let angleStep = 0.5;
  if (maxDepth === 2) angleStep = 1.0;
  if (maxDepth === 3) angleStep = 2.0;

  // Temporarily suppress console.log during solver search
  const originalLog = console.log;
  console.log = () => {};
  const solution = solvePuzzleDFS(game, layout, 0, maxDepth, angleStep);
  console.log = originalLog;

  return {
    id: puzzleId,
    name: pz.name,
    solvable: solution !== null,
    solution
  };
}

for (let id = 1; id <= 15; id++) {
  test(`puzzle ${id} ("${puzzleConfig(id).name}") should be solvable`, () => {
    const result = verifyPuzzle(id);
    assert.ok(result.solvable, `Puzzle ${id} ("${result.name}") is unsolvable.`);
  });
}
