import { createGame, step, PHASE, fire } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';
import { serializeGame, restoreGame } from '../js/serialization.js';
import { syncLanternPixels } from '../js/board.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

const layout = fixtureLayout();
const game = createGame({ layout, isPuzzleMode: true, puzzleId: 14 });

// For Level 14:
// Queue: red, yellow, blue, red, yellow, blue
// We know that the red shots should aim left (around -20° to -30°),
// yellow shots should aim center (around -5° to 5°),
// and blue shots should aim right (around 20° to 30°).
// Let's define the targeted search angles for each queue index:
const targetAngles = [
  [-25, -24, -23, -22, -21], // Shot 0: red
  [-2, -1, 0, 1, 2],         // Shot 1: yellow
  [21, 22, 23, 24, 25],      // Shot 2: blue
  [-25, -24, -23, -22, -21], // Shot 3: red
  [-2, -1, 0, 1, 2],         // Shot 4: yellow
  [21, 22, 23, 24, 25],      // Shot 5: blue
];

function solveTargeted(gameState, depth) {
  if (gameState.phase === PHASE.WIN) return [];
  if (gameState.phase === PHASE.GAME_OVER || gameState.phase === PHASE.DROWNING || depth >= 6) return null;
  
  const snapshot = serializeGame(gameState);
  const anglesToTry = targetAngles[depth];
  
  for (const angleDeg of anglesToTry) {
    const gameCopy = restoreGame(snapshot);
    syncLanternPixels(gameCopy.board, layout);
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
    
    if (gameCopy.phase === PHASE.WIN) return [angleDeg];
    if (gameCopy.phase === PHASE.AIMING) {
      const rest = solveTargeted(gameCopy, depth + 1);
      if (rest !== null) return [angleDeg, ...rest];
    }
  }
  return null;
}

console.log("Testing targeted search for Puzzle 14...");
const solution = solveTargeted(game, 0);
console.log(`Puzzle 14 Solution:`, solution);
