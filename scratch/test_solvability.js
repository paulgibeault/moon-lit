import { createGame, step, PHASE, fire } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

// We want to test puzzleId 4 under the original layout vs our proposed layout
const originalBoard = [
  ". . Y Y . . . .",
  " R R R R R . ",
  "R R R R R R . .",
  " R R R R R . "
];

const proposedBoard = [
  ". . Y Y . . . .",
  " R R R R R . ",
  ". R R R R R . .",
  " R R R R R . "
];

function testBoard(boardPattern) {
  const layout = fixtureLayout();
  
  // Override puzzle 4 board in puzzles config for the test
  const pz = puzzleConfig(4);
  const oldBoard = pz.board;
  pz.board = boardPattern;
  
  let solvable = false;
  let winningAngle = null;

  // Search through all possible aiming angles (e.g. from -80 to 80 degrees)
  for (let angleDeg = -85; angleDeg <= 85; angleDeg += 0.5) {
    const angleRad = (angleDeg * Math.PI) / 180;
    
    // Create game
    const game = createGame({ layout, isPuzzleMode: true, puzzleId: 4 });
    game.aimAngle = angleRad;
    
    // Fire the shot
    fire(game, layout);
    
    // Simulate until shot finishes flying and settles / pops
    let steps = 0;
    while ((game.phase === PHASE.FLYING || game.phase === PHASE.SETTLING) && steps < 5000) {
      step(game, 0.016, layout);
      steps++;
    }
    
    // Check if the board is cleared
    if (game.board.lanterns.length === 0) {
      solvability = true;
      solvable = true;
      winningAngle = angleDeg;
      break;
    }
  }
  
  // Restore
  pz.board = oldBoard;
  
  return { solvable, winningAngle };
}

console.log("Testing original board pattern...");
const originalResult = testBoard(originalBoard);
console.log(`Original: Solvable = ${originalResult.solvable}, Winning Angle = ${originalResult.winningAngle}`);

console.log("Testing proposed board pattern...");
const proposedResult = testBoard(proposedBoard);
console.log(`Proposed: Solvable = ${proposedResult.solvable}, Winning Angle = ${proposedResult.winningAngle}`);
