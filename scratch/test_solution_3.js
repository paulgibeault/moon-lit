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

console.log('--- Initial Board ---');
printBoard(game);

console.log('\n--- STEP 1: Park Yellow on the Right ---');
// Let's park yellow on the far right. Cell (6, 3) or (7, 0)
let angle1 = findAngleForCell(game, 6, 3);
console.log('Selected yellow angle:', angle1);
if (angle1 !== null) {
  game.aimAngle = (angle1 * Math.PI) / 180;
  fire(game, layout);
  runSimulation(game, layout);
  printBoard(game);
}

console.log('\n--- STEP 2: Park Green on the Right ---');
// Let's park green on the far right. Cell (5, 4) or (6, 4)
let angle2 = findAngleForCell(game, 5, 4);
if (angle2 === null) {
  angle2 = findAngleForCell(game, 6, 4);
}
console.log('Selected green angle:', angle2);
if (angle2 !== null) {
  game.aimAngle = (angle2 * Math.PI) / 180;
  fire(game, layout);
  runSimulation(game, layout);
  printBoard(game);
}

console.log('\n--- STEP 3: Pop Red Cluster ---');
// We want to hit Row 2 Col 5 (5, 2)
let angle3 = findAngleForCell(game, 5, 2);
console.log('Selected red angle:', angle3);
if (angle3 !== null) {
  game.aimAngle = (angle3 * Math.PI) / 180;
  fire(game, layout);
  runSimulation(game, layout);
  printBoard(game);
}

console.log('\n--- STEP 4: Shoot Green to Target ---');
// We want to hit Row 1 Col 4 (4, 1)
let angle4 = findAngleForCell(game, 4, 1);
console.log('Selected target green angle:', angle4);
if (angle4 !== null) {
  game.aimAngle = (angle4 * Math.PI) / 180;
  fire(game, layout);
  runSimulation(game, layout);
  printBoard(game);
  console.log('Phase after Step 4:', game.phase);
  if (game.phase === PHASE.WIN) {
    console.log('WINNER WINNER LOTUS DINNER!');
  }
}
