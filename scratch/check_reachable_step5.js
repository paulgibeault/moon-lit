import { createGame, step, PHASE, fire } from '../js/game.js';
import { serializeGame, restoreGame } from '../js/serialization.js';
import { syncLanternPixels } from '../js/board.js';
import { traceAimLine } from '../js/projectile.js';
import { normalizePos } from '../js/board.js';

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

let game = createGame({ layout, isPuzzleMode: true, puzzleId: 16 });
let initSteps = 0;
while (game.phase !== PHASE.AIMING && initSteps < 100) {
  step(game, 0.016, layout);
  initSteps++;
}

// Shot 1
game.aimAngle = (-47.7 * Math.PI) / 180;
fire(game, layout);
runSimulation(game, layout);
game.queue.current = "green";
game.queue.next = "red";
game.queue.afterNext = "green";

// Shot 2
game.aimAngle = (-54.1 * Math.PI) / 180;
fire(game, layout);
runSimulation(game, layout);
game.queue.current = "red";
game.queue.next = "green";
game.queue.afterNext = "green";

// Shot 3
game.aimAngle = (-35.1 * Math.PI) / 180;
fire(game, layout);
runSimulation(game, layout);
game.queue.current = "green";
game.queue.next = "green";
game.queue.afterNext = "orange";

// Shot 4
game.aimAngle = (-47.8 * Math.PI) / 180;
fire(game, layout);
runSimulation(game, layout);
game.queue.current = "orange";
game.queue.next = "orange";
game.queue.afterNext = "green";

console.log('Board state at Step 5:');
const rows = [];
for (let r = 0; r < 6; r++) {
  const isOdd = r & 1;
  const cols = 8 - isOdd;
  rows.push(Array(cols).fill('.'));
}
for (const l of game.board.lanterns) {
  const r = Math.round(l.ny / Math.sqrt(3));
  if (r >= 0 && r < 6) {
    const odd = r & 1;
    const c = Math.round((l.nx - odd) / 2);
    if (c >= 0 && c < rows[r].length) rows[r][c] = l.isTarget ? 'T' : l.color[0].toUpperCase();
  }
}
rows.forEach((r, idx) => console.log(`${idx}: ${idx & 1 ? ' ' : ''}${r.join(' ')}`));

// Sweep
console.log('\nSweeping angles at Step 5...');
const reachable = new Set();
for (let angleDeg = -85; angleDeg <= 85; angleDeg += 0.5) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const trace = traceAimLine(layout, game.board, angleRad, 2);
  if (trace.settle) {
    const l = { x: trace.settle.x, y: trace.settle.y };
    normalizePos(l, layout);
    const row = Math.round(l.ny / Math.sqrt(3));
    const odd = row & 1;
    const col = Math.round((l.nx - odd) / 2);
    reachable.add(`(${col}, ${row})`);
  }
}
console.log('Reachable cells:', Array.from(reachable).join(', '));
