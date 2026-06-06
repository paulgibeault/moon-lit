import { createGame, step, PHASE, fire } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';
import { traceAimLine } from '../js/projectile.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

function find1BounceSolution(boardPattern) {
  const layout = fixtureLayout();
  const pz = puzzleConfig(4);
  const oldBoard = pz.board;
  pz.board = boardPattern;
  
  let solutions = [];

  for (let angleDeg = -85; angleDeg <= 85; angleDeg += 0.5) {
    const angleRad = (angleDeg * Math.PI) / 180;
    const trace = traceAimLine(layout, populateBoardPattern(boardPattern), angleRad, 1);
    if (trace.settle) {
      const game = createGame({ layout, isPuzzleMode: true, puzzleId: 4 });
      game.aimAngle = angleRad;
      fire(game, layout);
      
      let steps = 0;
      while ((game.phase === PHASE.FLYING || game.phase === PHASE.SETTLING) && steps < 3000) {
        step(game, 0.016, layout);
        steps++;
      }
      
      if (game.board.lanterns.length === 0) {
        const bounces = trace.points.length - 2;
        solutions.push({ angleDeg, bounces });
      }
    }
  }
  
  pz.board = oldBoard;
  return solutions;
}

import { createBoard, populatePuzzle } from '../js/board.js';
function populateBoardPattern(boardPattern) {
  const board = createBoard();
  populatePuzzle(board, fixtureLayout(), boardPattern);
  return board;
}

const pattern = [
  ". . Y Y . . . .",
  " . . R R R R . ",
  ". . R R R R R .",
  " . . R R R R . "
];

const originalLog = console.log;
console.log = () => {};
const sols = find1BounceSolution(pattern);
console.log = originalLog;
console.log(`Pattern "4, 5, 4 red lanterns": found ${sols.length} 1-bounce solutions:`);
for (const s of sols) {
  console.log(`  - Angle: ${s.angleDeg}°, Bounces: ${s.bounces}`);
}
