import { createGame, step, PHASE, fire } from '../js/game.js';
import { traceAimLine } from '../js/projectile.js';

function fixtureLayout() {
  return {
    size: 20, originX: 100, trellisY: 40, deadLineY: 600, cols: 8, maxRows: 13,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 684,
  };
}

const layout = fixtureLayout();
const game = createGame({ layout, isPuzzleMode: true, puzzleId: 12 });

console.log("Testing Puzzle 12...");
import { serializeGame, restoreGame } from '../js/serialization.js';
import { syncLanternPixels } from '../js/board.js';

function solveDFS(gameState, depth, maxDepth) {
  if (gameState.phase === PHASE.WIN) return true;
  if (gameState.phase === PHASE.GAME_OVER || gameState.phase === PHASE.DROWNING || depth >= maxDepth) return false;
  
  const snapshot = serializeGame(gameState);
  
  for (let angleDeg = -80; angleDeg <= 80; angleDeg += 0.5) {
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
    
    if (gameCopy.phase === PHASE.WIN) {
      console.log(`  Winning shot at depth ${depth}: angle = ${angleDeg}°`);
      return true;
    }
    if (gameCopy.phase === PHASE.AIMING) {
      if (solveDFS(gameCopy, depth + 1, maxDepth)) {
        console.log(`  Shot at depth ${depth}: angle = ${angleDeg}°`);
        return true;
      }
    }
  }
  return false;
}

const solvable = solveDFS(game, 0, 2);
console.log(`Puzzle 12 Solvable: ${solvable}`);
