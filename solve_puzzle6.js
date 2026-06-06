import { createGame, step, PHASE, fire } from './js/game.js';
import { serializeGame, restoreGame } from './js/serialization.js';
import { syncLanternPixels } from './js/board.js';

const layout = {
  size: 16, originX: 88, trellisY: 64, deadLineY: 631, cols: 8, maxRows: 19,
  viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 633,
};

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
  }

  return null;
}

const game = createGame({ layout, isPuzzleMode: true, puzzleId: 6 });
const solution = solvePuzzleDFS(game, layout, 0, 1, 0.5);
console.log('Single shot solution for Puzzle 6:', solution);
