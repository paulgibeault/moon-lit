// Difficulty meter for Moon Lit puzzles — the design-time companion to
// tools/test-puzzles.js. Solvability says a puzzle CAN be beaten; this tool
// measures how likely a player is to beat it without reading the board:
//
//   - openings: at each step of the canonical solution, how many of the
//     reachable landing pockets still lead to a win (viable / total). A hard
//     puzzle has few viable pockets among many tempting ones.
//   - luck: product of the per-step ratios — the win probability of a player
//     who picks a uniformly random fair pocket every shot.
//   - greedy trap: at any step, does the pocket with the BIGGEST immediate
//     pop/drop lose the puzzle? The classic "won the battle, lost the war".
//
//   node tools/measure-difficulty.js            # all puzzles
//   node tools/measure-difficulty.js 31         # one puzzle
//   node tools/measure-difficulty.js 31 40      # a range
//   node tools/measure-difficulty.js 31 --candidates   # dump root pockets
//
// Only fair shots count (>= MIN_WINDOW_DEG aim window, <= 1 bounce), matching
// the solvability bar, so "openings 1/12" means: of twelve honest places the
// player can put this lantern, exactly one keeps the puzzle winnable.

import {
  fixtureLayout, enumerateCandidates, solvePuzzle,
  cloneBoard, applyShot, applyPuzzleDescent, isWon, stateKey,
} from './solver.js';
import { populatePuzzle } from '../js/board.js';
import { puzzleConfig, PUZZLE_COUNT } from '../js/puzzles.js';
import { SQRT3 } from '../js/geometry.js';

const MIN_WINDOW_DEG = 2.0;

// Boolean win-from-here search with memoization, mirroring the solver's DFS
// (win is checked before any descent, descent fires only on non-winning
// shots, landing past the dead line is an immediate loss).
function makeWinnableFrom(pz, layout) {
  const fast = pz.descentType === 'time';
  const goalType = pz.goalType || 'clear-all';
  const descentEvery = pz.descentType === 'shot' ? (pz.descentEvery || 2) : 0;
  const memo = new Map();

  function rec(board, qi, shotsSinceDescent) {
    if (isWon(board, goalType)) return true;
    if (qi >= pz.queue.length) return false;
    const key = stateKey(board, qi) + ':' + shotsSinceDescent;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, false); // cycle guard; real value set below
    let won = false;
    for (const c of enumerateCandidates(layout, board, { fast })) {
      if (c.angleHi - c.angleLo < MIN_WINDOW_DEG) continue;
      const next = cloneBoard(board);
      const { placed } = applyShot(next, layout, c.x, c.y, pz.queue[qi]);
      if (placed.y >= layout.deadLineY) continue;
      if (isWon(next, goalType)) { won = true; break; }
      let nextShots = shotsSinceDescent + 1;
      if (descentEvery > 0 && nextShots >= descentEvery) {
        if (!applyPuzzleDescent(next, layout)) continue;
        nextShots = 0;
      }
      if (rec(next, qi + 1, nextShots)) { won = true; break; }
    }
    memo.set(key, won);
    return won;
  }
  return rec;
}

function cellOf(layout, x, y) {
  const nx = Math.round((x - layout.originX) / layout.size);
  const row = Math.round((y - layout.trellisY - layout.size) / (SQRT3 * layout.size));
  return `r${row} nx${nx}`;
}

// Walk the canonical solution; at each step classify every fair pocket.
export function measurePuzzle(id, { dumpCandidates = false } = {}) {
  const pz = puzzleConfig(id);
  const layout = fixtureLayout();
  const fast = pz.descentType === 'time';
  const goalType = pz.goalType || 'clear-all';
  const descentEvery = pz.descentType === 'shot' ? (pz.descentEvery || 2) : 0;

  const { solution } = solvePuzzle(pz, layout, { minWindowDeg: MIN_WINDOW_DEG });
  if (!solution) return { id, name: pz.name, solvable: false };

  const winnableFrom = makeWinnableFrom(pz, layout);
  const board = { lanterns: [], descentAnimY: 0, descentCount: 0, anchorOffsetRows: 0 };
  populatePuzzle(board, layout, pz.board, pz);

  const steps = [];
  let shotsSinceDescent = 0;
  for (let qi = 0; qi < solution.length; qi++) {
    const cands = enumerateCandidates(layout, board, { fast })
      .filter(c => c.angleHi - c.angleLo >= MIN_WINDOW_DEG);
    let viable = 0;
    let greedy = null; // biggest immediate removal
    const detail = [];
    for (const c of cands) {
      const next = cloneBoard(board);
      const { popped, dropped, placed } = applyShot(next, layout, c.x, c.y, pz.queue[qi]);
      let ok;
      if (placed.y >= layout.deadLineY) {
        ok = false;
      } else if (isWon(next, goalType)) {
        ok = true;
      } else {
        let nextShots = shotsSinceDescent + 1;
        let descentLoss = false;
        if (descentEvery > 0 && nextShots >= descentEvery) {
          if (!applyPuzzleDescent(next, layout)) descentLoss = true;
          nextShots = 0;
        }
        ok = !descentLoss && winnableFrom(next, qi + 1, nextShots);
      }
      if (ok) viable++;
      const removed = popped.length + dropped.length;
      if (!greedy || removed > greedy.removed) {
        greedy = { removed, ok };
      }
      detail.push({ cell: cellOf(layout, c.x, c.y), angle: c.angleDeg, window: c.angleHi - c.angleLo, popped: popped.length, dropped: dropped.length, viable: ok });
    }
    steps.push({
      color: pz.queue[qi],
      viable, total: cands.length,
      greedyTrap: !!(greedy && greedy.removed > 0 && !greedy.ok),
      detail,
    });

    // Advance along the canonical line.
    const s = solution[qi];
    applyShot(board, layout, s.x, s.y, pz.queue[qi]);
    if (isWon(board, goalType)) break;
    shotsSinceDescent++;
    if (descentEvery > 0 && shotsSinceDescent >= descentEvery) {
      applyPuzzleDescent(board, layout);
      shotsSinceDescent = 0;
    }
  }

  const luck = steps.reduce((p, s) => p * (s.viable / Math.max(1, s.total)), 1);
  return { id, name: pz.name, solvable: true, queueLength: pz.queue.length, shotsUsed: solution.length, steps, luck, dumpCandidates };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const dumpCandidates = rawArgs.includes('--candidates');
const nums = rawArgs.map(Number).filter(n => !Number.isNaN(n));
let from = 1, to = PUZZLE_COUNT;
if (nums.length === 1) { from = to = nums[0]; }
if (nums.length >= 2) { [from, to] = nums; }

const originalLog = console.log;
console.log = () => {};
const reports = [];
for (let id = from; id <= to; id++) {
  reports.push(measurePuzzle(id, { dumpCandidates }));
}
console.log = originalLog;

console.log('=== Moon Lit Puzzle Difficulty ===');
for (const r of reports) {
  if (!r.solvable) {
    console.log(`[----] ${String(r.id).padStart(2)} "${r.name}" — unsolvable, nothing to measure`);
    continue;
  }
  const openings = r.steps.map(s => `${s.viable}/${s.total}`).join(' → ');
  const traps = r.steps.map((s, i) => s.greedyTrap ? i + 1 : null).filter(n => n !== null);
  const trapNote = traps.length ? `, greedy trap at shot ${traps.join(', ')}` : '';
  console.log(`${String(r.id).padStart(2)} "${r.name}" — luck ${(r.luck * 100).toFixed(1)}%, openings ${openings}${trapNote}`);
}

if (from === to && reports[0].solvable && dumpCandidates) {
  const r = reports[0];
  console.log('\nRoot pockets (shot 1):');
  for (const d of r.steps[0].detail) {
    console.log(`  ${d.viable ? 'WIN ' : 'lose'} ${d.cell.padEnd(10)} aim ${d.angle.toFixed(1).padStart(6)}°, window ${d.window.toFixed(1)}°, pops ${d.popped}, drops ${d.dropped}`);
  }
}
