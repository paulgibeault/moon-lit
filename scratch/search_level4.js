import { createGame, step, PHASE, fire } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

function isSolvable(boardPattern) {
  const layout = fixtureLayout();
  const pz = puzzleConfig(4);
  const oldBoard = pz.board;
  pz.board = boardPattern;
  
  let solvable = false;
  let winningAngle = null;

  for (let angleDeg = -85; angleDeg <= 85; angleDeg += 0.5) {
    const angleRad = (angleDeg * Math.PI) / 180;
    const game = createGame({ layout, isPuzzleMode: true, puzzleId: 4 });
    game.aimAngle = angleRad;
    
    // Fire the shot
    fire(game, layout);
    
    // Simulate
    let steps = 0;
    while ((game.phase === PHASE.FLYING || game.phase === PHASE.SETTLING) && steps < 3000) {
      step(game, 0.016, layout);
      steps++;
    }
    
    if (game.board.lanterns.length === 0) {
      solvable = true;
      winningAngle = angleDeg;
      break;
    }
  }
  
  pz.board = oldBoard;
  return { solvable, winningAngle };
}

const patternsToTest = [
  {
    name: "Shift red block right by 1",
    board: [
      ". . Y Y . . . .",
      " . R R R R R ",
      ". R R R R R R .",
      " . R R R R R "
    ]
  },
  {
    name: "Shift red block right by 2",
    board: [
      ". . Y Y . . . .",
      " . . R R R R R",
      ". . R R R R R R",
      " . . R R R R R"
    ]
  },
  {
    name: "Shift red block right by 2, Yellow shifted right by 1",
    board: [
      ". . . Y Y . . .",
      " . . R R R R R",
      ". . R R R R R R",
      " . . R R R R R"
    ]
  },
  {
    name: "Yellow shifted right by 1, Red block original",
    board: [
      ". . . Y Y . . .",
      " R R R R R . ",
      "R R R R R R . .",
      " R R R R R . "
    ]
  },
  {
    name: "Red block has column 1 removed (narrower block of 4)",
    board: [
      ". . Y Y . . . .",
      " . R R R R . ",
      ". . R R R R . .",
      " . R R R R . "
    ]
  },
  {
    name: "Red block shifted right by 1, Yellow at 3,4",
    board: [
      ". . . Y Y . . .",
      " . R R R R R ",
      ". R R R R R R .",
      " . R R R R R "
    ]
  },
  {
    name: "Red block shifted right by 1, Yellow at 4,5",
    board: [
      ". . . . Y Y . .",
      " . R R R R R ",
      ". R R R R R R .",
      " . R R R R R "
    ]
  }
];

// Temporarily override console.log to suppress game logs
const originalLog = console.log;
const results = [];

for (const p of patternsToTest) {
  console.log = () => {};
  const res = isSolvable(p.board);
  console.log = originalLog;
  results.push(`Pattern: "${p.name}" -> Solvable: ${res.solvable}, Angle: ${res.winningAngle}`);
}

for (const r of results) {
  console.log(r);
}
