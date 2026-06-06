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
}

const ANGLE_STEP = 5;
const angles = [];
for (let angleDeg = -80; angleDeg <= 80; angleDeg += ANGLE_STEP) {
  angles.push(angleDeg);
}

let statesVisited = 0;
const MAX_STATES = 50000;

function solve(game, depth = 0, path = []) {
  statesVisited++;
  if (statesVisited > MAX_STATES) {
    return 'TIMEOUT';
  }

  if (game.phase === PHASE.WIN) {
    return path;
  }
  if (game.phase === PHASE.GAME_OVER || game.phase === PHASE.DROWNING) {
    return null;
  }
  if (game.queue.current === null && game.shots.length === 0 && game.phase === PHASE.AIMING) {
    return null;
  }

  const snapshot = serializeGame(game);

  for (const angleDeg of angles) {
    const gameCopy = restoreGame(snapshot);
    syncLanternPixels(gameCopy.board, layout);
    gameCopy.aimAngle = (angleDeg * Math.PI) / 180;

    const bulletColor = gameCopy.queue.current;
    
    fire(gameCopy, layout);
    runSimulation(gameCopy, layout);

    const newPath = [...path, { shot: depth + 1, color: bulletColor, angle: angleDeg, phase: gameCopy.phase }];
    
    const result = solve(gameCopy, depth + 1, newPath);
    if (result) {
      return result;
    }
  }

  return null;
}

console.log('Running DFS solver for Puzzle 16...');
const game = createGame({ layout, isPuzzleMode: true, puzzleId: 16 });

let initSteps = 0;
while (game.phase !== PHASE.AIMING && initSteps < 100) {
  step(game, 0.016, layout);
  initSteps++;
}

const solution = solve(game);
console.log(`Visited ${statesVisited} states.`);
if (solution === 'TIMEOUT') {
  console.log('Search timed out (reached state limit).');
} else if (solution) {
  console.log('SUCCESS! Found solution:', solution);
} else {
  console.log('FAILED! No solution exists.');
}
