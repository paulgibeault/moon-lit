import { createGame, step, PHASE, fire } from '../js/game.js';
import { serializeGame, restoreGame } from '../js/serialization.js';
import { syncLanternPixels } from '../js/board.js';

const layout = {
  size: 16, originX: 88, trellisY: 64, deadLineY: 631, cols: 8, maxRows: 19,
  viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 633,
};

function runSimulation(game, layout) {
  let steps = 0;
  while (
    (game.phase === PHASE.FLYING ||
     game.phase === PHASE.SETTLING ||
     game.phase === PHASE.DESCENDING) &&
    steps < 4000
  ) {
    step(game, 0.016, layout);
    steps++;
  }
  return steps;
}

const game = createGame({ layout, isPuzzleMode: true, puzzleId: 16 });
let initSteps = 0;
while (game.phase !== PHASE.AIMING && initSteps < 100) {
  step(game, 0.016, layout);
  initSteps++;
}

console.log('Initial state:');
console.log('Phase:', game.phase);
console.log('Queue current:', game.queue.current);

const snapshot = serializeGame(game);

// Try firing at 0 degrees
const gameCopy = restoreGame(snapshot);
syncLanternPixels(gameCopy.board, layout);
gameCopy.aimAngle = 0;

console.log('\n--- Firing shot at 0 degrees ---');
fire(gameCopy, layout);
console.log('Phase immediately after fire:', gameCopy.phase);
const stepsTaken = runSimulation(gameCopy, layout);
console.log('Simulation steps:', stepsTaken);
console.log('Phase after simulation:', gameCopy.phase);
console.log('Queue current after simulation:', gameCopy.queue.current);
console.log('Queue next after simulation:', gameCopy.queue.next);
console.log('Queue afterNext after simulation:', gameCopy.queue.afterNext);
console.log('Shots list length:', gameCopy.shots.length);
