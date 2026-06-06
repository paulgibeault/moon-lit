import { createGame, step, PHASE, fire } from './js/game.js';
import { puzzleConfig } from './js/puzzles.js';

const layout = {
  size: 16, originX: 88, trellisY: 64, deadLineY: 631, cols: 8, maxRows: 19,
  viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 633,
};

const game = createGame({ layout, isPuzzleMode: true, puzzleId: 6 });

console.log('--- Initial State ---');
console.log('isPuzzleMode:', game.isPuzzleMode);
console.log('puzzleGoalType:', game.puzzleGoalType);
console.log('queue:', game.queue);
console.log('Total lanterns:', game.board.lanterns.length);
console.log('Target lanterns:', game.board.lanterns.filter(l => l.isTarget).length);
console.log('Lanterns list:');
game.board.lanterns.forEach((l, idx) => {
  console.log(`  [${idx}] nx=${l.nx}, ny=${l.ny.toFixed(2)}, color=${l.color}, isTarget=${l.isTarget}`);
});

// Set aim straight up (0)
game.aimAngle = 0;

console.log('\n--- Firing Red Shot ---');
fire(game, layout);
console.log('Game phase:', game.phase);
console.log('Shots in flight:', game.shots.length);

let steps = 0;
while (game.phase !== PHASE.AIMING && game.phase !== PHASE.WIN && game.phase !== PHASE.GAME_OVER && steps < 2000) {
  step(game, 0.016, layout);
  steps++;
}

console.log('\n--- State After Shot 1 Settles ---');
console.log('Game phase:', game.phase);
console.log('Score:', game.score);
console.log('Pops:', game.breakdown.pop);
console.log('Clusters:', game.breakdown.cluster);
console.log('Drops:', game.breakdown.drop);
console.log('Total lanterns:', game.board.lanterns.length);
console.log('Target lanterns:', game.board.lanterns.filter(l => l.isTarget).length);
console.log('Remaining lanterns list:');
game.board.lanterns.forEach((l, idx) => {
  console.log(`  [${idx}] nx=${l.nx}, ny=${l.ny.toFixed(2)}, color=${l.color}, isTarget=${l.isTarget}`);
});
