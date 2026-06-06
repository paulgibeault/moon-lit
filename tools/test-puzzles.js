import { createGame, step, PHASE, fire } from '../js/game.js';
import { puzzleConfig } from '../js/puzzles.js';
import { serializeGame, restoreGame } from '../js/serialization.js';
import { syncLanternPixels } from '../js/board.js';

function fixtureLayout() {
  return {
    size: 16, originX: 88, trellisY: 64, deadLineY: 631, cols: 8, maxRows: 19,
    viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 633,
  };
}

// Suppress normal game console logs during simulation
const originalLog = console.log;
function suppressLogs() { console.log = () => {}; }
function restoreLogs() { console.log = originalLog; }

// Helper to simulate a fired shot until it settles or the game transitions phase
// In speed mode, game.phase remains AIMING, so we must also check game.shots.length > 0
function runSimulation(game, layout) {
  let steps = 0;
  while ((game.phase === PHASE.FLYING || game.phase === PHASE.SETTLING || game.phase === PHASE.DESCENDING || game.shots.length > 0) && steps < 4000) {
    step(game, 0.016, layout);
    steps++;
  }
}

// DFS solver that returns the array of winning angles if solvable, or null
function solvePuzzleDFS(gameState, layout, depth, maxDepth, angleStep) {
  if (gameState.phase === PHASE.WIN) {
    return [];
  }
  if (gameState.phase === PHASE.GAME_OVER || gameState.phase === PHASE.DROWNING || depth >= maxDepth) {
    return null;
  }

  // Generate aiming angles to test
  const angles = [];
  for (let angleDeg = -80; angleDeg <= 80; angleDeg += angleStep) {
    angles.push(angleDeg);
  }

  const snapshot = serializeGame(gameState);

  for (const angleDeg of angles) {
    const gameCopy = restoreGame(snapshot);
    syncLanternPixels(gameCopy.board, layout);
    gameCopy.aimAngle = (angleDeg * Math.PI) / 180;

    // Fire the shot
    fire(gameCopy, layout);
    runSimulation(gameCopy, layout);

    if (gameCopy.phase === PHASE.WIN) {
      return [angleDeg];
    }

    // If still in AIMING phase, we can continue to the next shot
    if (gameCopy.phase === PHASE.AIMING && depth + 1 < maxDepth) {
      const rest = solvePuzzleDFS(gameCopy, layout, depth + 1, maxDepth, angleStep);
      if (rest !== null) {
        return [angleDeg, ...rest];
      }
    }
  }

  return null;
}

function verifyPuzzle(puzzleId) {
  const layout = fixtureLayout();
  const pz = puzzleConfig(puzzleId);
  const game = createGame({ layout, isPuzzleMode: true, puzzleId });

  const queueLength = pz.queue.length;
  // Choose search parameters based on queue length/depth
  let maxDepth = Math.min(queueLength, 3); // Cap DFS at depth 3 for performance
  let angleStep = 0.5;
  if (maxDepth === 2) angleStep = 1.0;
  if (maxDepth === 3) angleStep = 2.0;

  suppressLogs();
  const solution = solvePuzzleDFS(game, layout, 0, maxDepth, angleStep);
  restoreLogs();

  return {
    id: puzzleId,
    name: pz.name,
    queueLength,
    searchDepth: maxDepth,
    solvable: solution !== null,
    solution
  };
}

console.log("=== Moon Lit Puzzle Solvability Test Runner ===");
console.log("Verifying all 15 hand-crafted puzzles...");

let allPass = true;
for (let id = 1; id <= 15; id++) {
  const result = verifyPuzzle(id);
  if (result.solvable) {
    console.log(`[PASS] Puzzle ${id} ("${result.name}"): Solvable in ${result.solution.length} shots. Angles: ${result.solution.map(a => a + "°").join(", ")}`);
  } else {
    allPass = false;
    console.log(`[FAIL] Puzzle ${id} ("${result.name}"): UNSOLVABLE (searched depth ${result.searchDepth} with step ${result.queueLength > result.searchDepth ? 'truncated queue' : 'full queue'})`);
  }
}

if (allPass) {
  console.log("\nAll tested levels are solvable! Ready to ship.");
  process.exit(0);
} else {
  console.log("\nSome levels are unsolvable. Please check their layouts or queue configuration.");
  process.exit(1);
}
