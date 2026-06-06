import { createGame } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';
import { traceAimLine } from '../js/projectile.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

const proposedBoard = [
  ". . Y Y . . . .",
  " R R R R R . ",
  ". R R R R R . .",
  " R R R R R . "
];

const pz = puzzleConfig(4);
pz.board = proposedBoard;

const game = createGame({ layout: fixtureLayout(), isPuzzleMode: true, puzzleId: 4 });
const layout = fixtureLayout();

for (let angleDeg = -85; angleDeg <= 85; angleDeg += 1) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const trace = traceAimLine(layout, game.board, angleRad, 3);
  if (trace.settle) {
    const sx = trace.settle.x;
    const sy = trace.settle.y;
    const snx = (sx - layout.originX) / layout.size;
    const sny = (sy - layout.trellisY - layout.size) / layout.size;
    
    console.log(`Angle ${angleDeg.toFixed(1)}°: nx=${snx.toFixed(2)}, ny=${sny.toFixed(2)}, bounces=${trace.points.length - 2}`);
  } else {
    console.log(`Angle ${angleDeg.toFixed(1)}°: no settle`);
  }
}
