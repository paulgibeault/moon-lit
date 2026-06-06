import { createGame, step, PHASE, fire } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

const pz = puzzleConfig(13);
pz.queue = ['blue', 'red'];

const layout = fixtureLayout();
const game = createGame({ layout, isPuzzleMode: true, puzzleId: 13 });

console.log("Firing blue shot straight up...");
game.aimAngle = 0;
fire(game, layout);

let steps = 0;
while ((game.phase === PHASE.FLYING || game.phase === PHASE.SETTLING) && steps < 1000) {
  step(game, 0.016, layout);
  steps++;
}

console.log(`Firing red shot straight up... Next queue color: ${game.queue.current}`);
game.aimAngle = 0;
fire(game, layout);

steps = 0;
while ((game.phase === PHASE.FLYING || game.phase === PHASE.SETTLING || game.phase === PHASE.WIN) && steps < 1000) {
  step(game, 0.016, layout);
  steps++;
}

console.log(`Red shot finished. Phase = ${game.phase}, Lantern count = ${game.board.lanterns.length}`);
