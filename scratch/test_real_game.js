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

function printBoard(game) {
  console.log(`Lanterns count: ${game.board.lanterns.length}`);
  const rows = [];
  for (let r = 0; r < 6; r++) {
    const isOdd = r & 1;
    const cols = 8 - isOdd;
    const rowStr = Array(cols).fill('.');
    rows.push(rowStr);
  }
  
  for (const l of game.board.lanterns) {
    const r = Math.round(l.ny / Math.sqrt(3));
    if (r >= 0 && r < 6) {
      const odd = r & 1;
      const c = Math.round((l.nx - odd) / 2);
      if (c >= 0 && c < rows[r].length) {
        rows[r][c] = l.isTarget ? 'T' : l.color[0].toUpperCase();
      }
    }
  }

  rows.forEach((r, idx) => {
    const prefix = idx & 1 ? ' ' : '';
    console.log(`${idx}: ${prefix}${r.join(' ')}`);
  });
}

function findAngleForCell(game, targetCol, targetRow) {
  const snapshot = serializeGame(game);
  for (let angleDeg = -85; angleDeg <= 85; angleDeg += 0.1) {
    const gameCopy = restoreGame(snapshot);
    syncLanternPixels(gameCopy.board, layout);
    const angleRad = (angleDeg * Math.PI) / 180;
    const trace = traceAimLine(layout, gameCopy.board, angleRad, 2);
    if (trace.settle) {
      const l = { x: trace.settle.x, y: trace.settle.y };
      normalizePos(l, layout);
      const row = Math.round(l.ny / Math.sqrt(3));
      const odd = row & 1;
      const col = Math.round((l.nx - odd) / 2);
      if (col === targetCol && row === targetRow) {
        return angleDeg;
      }
    }
  }
  return null;
}

let game = createGame({ layout, isPuzzleMode: true, puzzleId: 16 });

let initSteps = 0;
while (game.phase !== PHASE.AIMING && initSteps < 100) {
  step(game, 0.016, layout);
  initSteps++;
}

console.log('Initial Queue:', game.queue.current, game.queue.next, game.queue.afterNext);
console.log('--- Initial Board ---');
printBoard(game);

console.log('\n--- STEP 1: Shoot Yellow ---');
let angle1 = findAngleForCell(game, 6, 3);
if (angle1 === null) angle1 = findAngleForCell(game, 7, 0);
console.log('Selected yellow angle:', angle1);
game.aimAngle = (angle1 * Math.PI) / 180;
fire(game, layout);
runSimulation(game, layout);
printBoard(game);

console.log('\n--- STEP 2: Shoot Green ---');
let angle2 = findAngleForCell(game, 2, 3);
if (angle2 === null) angle2 = findAngleForCell(game, 4, 3);
console.log('Selected green angle:', angle2);
game.aimAngle = (angle2 * Math.PI) / 180;
fire(game, layout);
runSimulation(game, layout);
printBoard(game);

console.log('\n--- STEP 3: Shoot Red ---');
let angle3 = findAngleForCell(game, 5, 2);
console.log('Selected red angle:', angle3);
game.aimAngle = (angle3 * Math.PI) / 180;
fire(game, layout);
runSimulation(game, layout);
printBoard(game);

console.log('\n--- STEP 4: Shoot Green to Target (1st green) ---');
let angle4 = findAngleForCell(game, 4, 1);
console.log('Selected 1st green angle:', angle4);
game.aimAngle = (angle4 * Math.PI) / 180;
fire(game, layout);
runSimulation(game, layout);
printBoard(game);

console.log('\n--- STEP 5: Shoot Orange ---');
let angle5 = findAngleForCell(game, 7, 0);
console.log('Selected orange angle:', angle5);
game.aimAngle = (angle5 * Math.PI) / 180;
fire(game, layout);
runSimulation(game, layout);
printBoard(game);

console.log('\n--- STEP 6: Shoot Orange ---');
let angle6 = findAngleForCell(game, 6, 1);
console.log('Selected orange angle:', angle6);
game.aimAngle = (angle6 * Math.PI) / 180;
fire(game, layout);
runSimulation(game, layout);
printBoard(game);

console.log('\n--- STEP 7: Shoot Orange ---');
let angle7 = findAngleForCell(game, 7, 0);
if (angle7 === null) angle7 = findAngleForCell(game, 6, 1);
console.log('Selected orange angle:', angle7);
game.aimAngle = (angle7 * Math.PI) / 180;
fire(game, layout);
runSimulation(game, layout);
printBoard(game);

console.log('\n--- STEP 8: Shoot Final Green to Target ---');
let angle8 = findAngleForCell(game, 5, 0);
if (angle8 === null) angle8 = findAngleForCell(game, 4, 1);
console.log('Selected final green angle:', angle8);
game.aimAngle = (angle8 * Math.PI) / 180;
fire(game, layout);
runSimulation(game, layout);
printBoard(game);
console.log('Phase after Step 8:', game.phase);
if (game.phase === PHASE.WIN) {
  console.log('WINNER WINNER LOTUS DINNER!');
}
