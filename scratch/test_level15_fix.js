import { createGame, step, PHASE, fire } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

const pz = puzzleConfig(15);
const oldBoard = pz.board;

// Modify board: Row 1 has center gap
pz.board = [
  "G G G G G G G G",
  " X X . . X X ",
  "P P P . . P P P",
  " P P . . P P "
];

const layout = fixtureLayout();
const game = createGame({ layout, isPuzzleMode: true, puzzleId: 15 });

console.log("Testing Puzzle 15 with center gap in blockers...");
let solvable = false;
let winningAngle = null;

for (let angleDeg = -10; angleDeg <= 10; angleDeg += 0.5) {
  const gameCopy = createGame({ layout, isPuzzleMode: true, puzzleId: 15 });
  gameCopy.aimAngle = (angleDeg * Math.PI) / 180;
  
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

console.log(`Proposed Puzzle 15 Solvable: ${solvable}, Winning Angle: ${winningAngle}°`);
pz.board = oldBoard;
