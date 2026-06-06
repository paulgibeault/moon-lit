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

function solveDFS(gameState, depth, maxDepth, angleStep) {
  if (gameState.phase === PHASE.WIN) return true;
  if (gameState.phase === PHASE.GAME_OVER || gameState.phase === PHASE.DROWNING || depth >= maxDepth) return false;
  
  const snapshot = serializeGame(gameState);
  
  for (let angleDeg = -80; angleDeg <= 80; angleDeg += angleStep) {
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
    
    if (gameCopy.phase === PHASE.WIN) return true;
    if (gameCopy.phase === PHASE.AIMING) {
      if (solveDFS(gameCopy, depth + 1, maxDepth, angleStep)) return true;
    }
  }
  return false;
}

// We want to test failed puzzles with angleStep = 0.5
const failedIds = [5, 7, 8, 12, 13, 14, 15];

for (const id of failedIds) {
  const pz = puzzleConfig(id);
  const game = createGame({ layout, isPuzzleMode: true, puzzleId: id });
  
  // For depth 3, 0.5 step is too slow, so we use 0.5 for depth <= 2 and 1.5 for depth 3
  const queueLength = pz.queue.length;
  const maxDepth = Math.min(queueLength, 3);
  const step = maxDepth === 3 ? 1.5 : 0.5;
  
  const solvable = solveDFS(game, 0, maxDepth, step);
  console.log(`Puzzle ${id} ("${pz.name}") solvable: ${solvable} (depth: ${maxDepth}, step: ${step})`);
}
