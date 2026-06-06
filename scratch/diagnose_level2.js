import { createGame, step, PHASE, fire } from '../js/game.js';
import { traceAimLine } from '../js/projectile.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

const layout = fixtureLayout();
const game = createGame({ layout, isPuzzleMode: true, puzzleId: 2 });

for (let angleDeg = -80; angleDeg <= 80; angleDeg += 0.5) {
  const angleRad = (angleDeg * Math.PI) / 180;
  
  // Create game and test if it clears
  const gameCopy = createGame({ layout, isPuzzleMode: true, puzzleId: 2 });
  gameCopy.aimAngle = angleRad;
  
  // Temporarily override console.log
  const originalLog = console.log;
  console.log = () => {};
  
  fire(gameCopy, layout);
  
  let steps = 0;
  while ((gameCopy.phase === PHASE.FLYING || gameCopy.phase === PHASE.SETTLING) && steps < 3000) {
    step(gameCopy, 0.016, layout);
    steps++;
  }
  
  console.log = originalLog;
  
  if (gameCopy.board.lanterns.length === 0) {
    console.log(`WIN found! Angle = ${angleDeg}°, final phase = ${gameCopy.phase}`);
  }
}
