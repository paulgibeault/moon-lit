import { createGame } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';
import { traceAimLine } from '../js/projectile.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

const board = [
  ". . . Y Y . . .",
  " . R R R R R ",
  ". R R R R R R .",
  " . R R R R R "
];

const pz = puzzleConfig(4);
pz.board = board;

const game = createGame({ layout: fixtureLayout(), isPuzzleMode: true, puzzleId: 4 });
const layout = fixtureLayout();

const angleRad = (60 * Math.PI) / 180;
const trace = traceAimLine(layout, game.board, angleRad, 3);

console.log("Points in path:");
for (let i = 0; i < trace.points.length; i++) {
  const p = trace.points[i];
  const pnx = (p.x - layout.originX) / layout.size;
  const pny = (p.y - layout.trellisY - layout.size) / layout.size;
  console.log(`- Point ${i}: x=${p.x.toFixed(1)}, y=${p.y.toFixed(1)} (nx=${pnx.toFixed(2)}, ny=${pny.toFixed(2)})`);
}

if (trace.settle) {
  const sx = trace.settle.x;
  const sy = trace.settle.y;
  const snx = (sx - layout.originX) / layout.size;
  const sny = (sy - layout.trellisY - layout.size) / layout.size;
  console.log(`Settle: nx=${snx.toFixed(2)}, ny=${sny.toFixed(2)} (x=${sx.toFixed(1)}, y=${sy.toFixed(1)})`);
} else {
  console.log("No settle");
}
