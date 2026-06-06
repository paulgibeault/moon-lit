import { createGame, step, PHASE, fire } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';
import { traceAimLine } from '../js/projectile.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

const proposedBoard = [
  ". . G G . . . .",
  " G . . G . . ",
  "P P P . P P P P",
  " P . . P P P ",
  "P P P . P P P P"
];

const pz = puzzleConfig(5);
const oldBoard = pz.board;
pz.board = proposedBoard;

const layout = fixtureLayout();
const game = createGame({ layout, isPuzzleMode: true, puzzleId: 5 });

console.log("Testing proposed Level 5 board...");
let solvable = false;
let winningAngle = null;

for (let angleDeg = -10; angleDeg <= 10; angleDeg += 0.5) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const gameCopy = createGame({ layout, isPuzzleMode: true, puzzleId: 5 });
  gameCopy.aimAngle = angleRad;
  
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
    solvable = true;
    winningAngle = angleDeg;
    break;
  }
}

console.log(`Proposed Level 5 Solvable: ${solvable}, Winning Angle: ${winningAngle}°`);
pz.board = oldBoard;
