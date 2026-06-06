import { createGame } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';
import { traceAimLine } from '../js/projectile.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

const pz = puzzleConfig(8);
pz.board = [
  ". . . . . O O O",
  " . . . . . . ",
  ". . B B B B . .",
  " . . . . . . ",
  "B B B B B B . ."
];

const layout = fixtureLayout();
const game = createGame({ layout, isPuzzleMode: true, puzzleId: 8 });

const trace = traceAimLine(layout, game.board, (14 * Math.PI) / 180, 3);
const p1 = trace.points[1];
console.log(`Point 1: x=${p1.x.toFixed(2)}, y=${p1.y.toFixed(2)}`);

for (const l of game.board.lanterns) {
  const d = Math.hypot(p1.x - l.x, p1.y - l.y);
  console.log(`Lantern ${l.color} at nx=${l.nx.toFixed(2)}, ny=${l.ny.toFixed(2)}: dist=${d.toFixed(2)} px (dist/r = ${(d/layout.size).toFixed(2)})`);
}
