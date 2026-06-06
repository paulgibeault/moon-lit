import { createGame, step, PHASE, fire } from '../js/game.js';
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
  // Run step one more time if we are in AIMING to let transitions happen
  step(game, 0.016, layout);
}

const game = createGame({ layout, isPuzzleMode: true, puzzleId: 16 });

// Initial step to initialize launcher
let initSteps = 0;
while (game.phase !== PHASE.AIMING && initSteps < 100) {
  step(game, 0.016, layout);
  initSteps++;
}

console.log('Start state:');
console.log('Phase:', game.phase);
console.log('Queue:', JSON.stringify(game.queue));

for (let shot = 1; shot <= 10; shot++) {
  console.log(`\n--- Shot ${shot} ---`);
  console.log('Bullet to fire:', game.queue.current);
  fire(game, layout);
  console.log('Phase right after fire:', game.phase);
  runSimulation(game, layout);
  console.log('Phase after sim:', game.phase);
  console.log('Queue after sim:', JSON.stringify(game.queue));
}
