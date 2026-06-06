import { createGame, step, PHASE, fire } from '../js/game.js';
import { traceAimLine } from '../js/projectile.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

const layout = fixtureLayout();
const game = createGame({ layout, isPuzzleMode: true, puzzleId: 5 });
console.log("Level 5 initialized. Lanterns:", game.board.lanterns.length);

for (let angleDeg = -80; angleDeg <= 80; angleDeg += 0.5) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const trace = traceAimLine(layout, game.board, angleRad, 3);
  if (trace.settle) {
    const sx = trace.settle.x;
    const sy = trace.settle.y;
    const snx = (sx - layout.originX) / layout.size;
    const sny = (sy - layout.trellisY - layout.size) / layout.size;
    
    // We want to see if any shot gets to Row 0 (sny = 0)
    if (sny < 1.0) {
      console.log(`Angle ${angleDeg}°: settled at nx=${snx.toFixed(2)}, ny=${sny.toFixed(2)}, bounces=${trace.points.length - 2}`);
      
      const gameCopy = createGame({ layout, isPuzzleMode: true, puzzleId: 5 });
      gameCopy.aimAngle = angleRad;
      fire(gameCopy, layout);
      
      let steps = 0;
      while ((gameCopy.phase === PHASE.FLYING || gameCopy.phase === PHASE.SETTLING) && steps < 3000) {
        step(gameCopy, 0.016, layout);
        steps++;
      }
      if (gameCopy.board.lanterns.length === 0) {
        console.log(`  -> WIN!`);
      }
    }
  }
}
