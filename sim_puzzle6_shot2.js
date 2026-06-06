import { createGame, step, PHASE, fire } from './js/game.js';
import { puzzleConfig } from './js/puzzles.js';

const layout = {
  size: 16, originX: 88, trellisY: 64, deadLineY: 631, cols: 8, maxRows: 19,
  viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 633,
};

const game = createGame({ layout, isPuzzleMode: true, puzzleId: 6 });

// Shot 1
game.aimAngle = 0;
fire(game, layout);
let steps = 0;
while (game.phase !== PHASE.AIMING && steps < 2000) {
  step(game, 0.016, layout);
  steps++;
}

console.log('--- After Shot 1 ---');
console.log('Game phase:', game.phase);
console.log('Queue:', game.queue);

// Shot 2 (Yellow)
game.aimAngle = 0;
console.log('\n--- Firing Yellow Shot 2 ---');
fire(game, layout);
console.log('Game phase:', game.phase);
console.log('Shots in flight:', game.shots.length);

steps = 0;
while (game.phase !== PHASE.WIN && game.phase !== PHASE.GAME_OVER && game.phase !== PHASE.AIMING && steps < 2000) {
  step(game, 0.016, layout);
  steps++;
}

console.log('\n--- State After Shot 2 Settles ---');
console.log('Game phase:', game.phase);
console.log('Score:', game.score);
console.log('Pops:', game.breakdown.pop);
console.log('Clusters:', game.breakdown.cluster);
console.log('Drops:', game.breakdown.drop);
console.log('Combos:', game.breakdown.combo);
console.log('Clear:', game.breakdown.clear);
console.log('Total lanterns:', game.board.lanterns.length);
console.log('Target lanterns:', game.board.lanterns.filter(l => l.isTarget).length);
console.log('Remaining lanterns list:');
game.board.lanterns.forEach((l, idx) => {
  console.log(`  [${idx}] nx=${l.nx}, ny=${l.ny.toFixed(2)}, color=${l.color}, isTarget=${l.isTarget}`);
});
