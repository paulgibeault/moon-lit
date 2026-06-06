import { createGame } from '../js/game.js';
import { traceAimLine } from '../js/projectile.js';
import { normalizePos } from '../js/board.js';

const layout = {
  size: 16, originX: 88, trellisY: 64, deadLineY: 631, cols: 8, maxRows: 19,
  viewW: 400, viewH: 720, wallLeft: 40, wallRight: 360, tipY: 633,
};

const game = createGame({ layout, isPuzzleMode: true, puzzleId: 16 });
const board = game.board;

console.log('Sweeping aim angles...');
const results = [];
for (let angleDeg = -85; angleDeg <= 85; angleDeg += 0.1) {
  const angleRad = (angleDeg * Math.PI) / 180;
  // traceAimLine predicts where a shot would land
  const trace = traceAimLine(layout, board, angleRad, 2); // allow up to 2 bounces
  if (trace.settle) {
    const l = { x: trace.settle.x, y: trace.settle.y };
    normalizePos(l, layout);
    
    // Check if it's close to integer coordinates on the grid
    // nx = col * 2 + odd, ny = row * SQRT3
    const row = Math.round(l.ny / Math.sqrt(3));
    const odd = row & 1;
    const col = Math.round((l.nx - odd) / 2);
    
    results.push({
      angle: angleDeg.toFixed(1),
      nx: l.nx.toFixed(3),
      ny: l.ny.toFixed(3),
      grid: `(${col}, ${row})`,
      bounced: trace.bounced ? 'Yes' : 'No',
    });
  }
}

// Group by grid coordinate to see what cells are reachable
const grouped = {};
for (const r of results) {
  if (!grouped[r.grid]) {
    grouped[r.grid] = [];
  }
  grouped[r.grid].push(r);
}

console.log('\nReachable grid cells and their angles:');
for (const [grid, list] of Object.entries(grouped)) {
  console.log(`Cell ${grid}:`);
  console.log(`  Count of angles: ${list.length}`);
  console.log(`  Sample angles: ${list.slice(0, 5).map(x => x.angle + '°' + (x.bounced === 'Yes' ? '(bounce)' : '')).join(', ')}${list.length > 5 ? ' ...' : ''}`);
}
