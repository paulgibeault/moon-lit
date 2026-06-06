import { createGame, step, PHASE, fire } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

const layout = fixtureLayout();
const game = createGame({ layout, isPuzzleMode: true, puzzleId: 14 });

// Angles to hit:
// Row 2 red is at index 0 and 1. Col 0 center is nx=0. Col 1 center is nx=2.
// Row 2 yellow is at index 3 and 4. Col 3 center is nx=6. Col 4 center is nx=8.
// Row 2 blue is at index 6 and 7. Col 6 center is nx=12. Col 7 center is nx=14.
// Let's shoot Red at -30°, Yellow at 0°, Blue at 30°
const seq = [-23, 0, 23, -23, 0, 23];

for (let i = 0; i < seq.length; i++) {
  const angleDeg = seq[i];
  console.log(`\n--- Shot ${i}: Aiming at ${angleDeg}° ---`);
  
  game.aimAngle = (angleDeg * Math.PI) / 180;
  fire(game, layout);
  
  // Simulate until all shots are resolved
  let steps = 0;
  while ((game.phase === PHASE.FLYING || game.phase === PHASE.SETTLING || game.phase === PHASE.DESCENDING || game.shots.length > 0) && steps < 5000) {
    step(game, 0.016, layout);
    steps++;
  }
  
  console.log(`After shot ${i} settles: phase = ${game.phase}, Lantern count = ${game.board.lanterns.length}, Descent count = ${game.board.descentCount}`);
  for (const l of game.board.lanterns) {
    console.log(`- ${l.color} at nx=${l.nx.toFixed(2)}, ny=${l.ny.toFixed(2)}`);
  }
  
  if (game.phase === PHASE.DROWNING || game.phase === PHASE.GAME_OVER) {
    console.log("LOST.");
    break;
  }
  if (game.phase === PHASE.WIN) {
    console.log("WON!");
    break;
  }
}
