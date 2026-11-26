// Puzzle quality metrics for Moon Lit — the library behind
// tools/measure-difficulty.js (CLI) and its --rubric checklist.
// Definitions and per-chapter targets are documented in
// docs/puzzle-rubric.md; keep the two in sync.
//
// Every metric is measured along the CANONICAL SOLUTION LINE: the solver's
// first-found fair solution (tools/solver.js, >= MIN_WINDOW_DEG aim windows,
// <= 1 bounce). At each state on that line (a "decision point", one per shot
// actually used) every fair pocket for the current lantern is classified as
// viable (the puzzle stays winnable) or losing, using one memoized
// win-from-here search shared by all metrics.
//
//   openings  viable/total fair pockets at a decision point.
//   luck      product of viable/total over the line: the win chance of a
//             player who picks a uniformly random fair pocket every shot.
//   obvious   the fair pocket a board-reader would grab first: maximum
//             immediate removal (popped + dropped); ties -> most targets
//             removed; ties -> smallest |aim angle| (closest to straight up);
//             ties -> lowest angle. A decision point whose best removal is 0
//             has NO obvious move (nothing on the board is tempting).
//   temptation  number of decision points whose obvious move LOSES. This is
//             the generalisation of the old "greedy trap" flag (same idea:
//             the biggest immediate pop/drop loses), now with a documented
//             deterministic tie-break; greedyTrap is kept as an alias of the
//             per-step temptation flag. The old flag took the first
//             max-removal pocket in sweep order (leftmost aim); when tied
//             pockets disagree that made it arbitrary. Those tied losing
//             pockets are now reported separately as `bait` (not gated).
//   depth     number of decision points with viable/total <= TIGHT_RATIO
//             (a "tight" decision).
//   lateInsight  1-based index of the tightest decision (lowest
//             viable/total; ties -> the later shot). frontLoaded = the
//             tightest decision is shot 1 of a multi-shot line.
//   intent    number of distinct winning lines from the start, where two
//             lines are the same if they produce the same sequence of board
//             states after each shot (solver stateKey + descent phase), so
//             neighbouring pockets that land in equivalent spots collapse.
//             Counted up to INTENT_CAP (reported as "20+").

import { readFileSync } from 'node:fs';
import {
  fixtureLayout, enumerateCandidates, solvePuzzle,
  cloneBoard, applyShot, applyPuzzleDescent, isWon, stateKey,
} from './solver.js';
import { populatePuzzle } from '../js/board.js';
import { puzzleConfig } from '../js/puzzles.js';
import { SQRT3, effectiveTrellisY, anchorBandPx } from '../js/geometry.js';

export const MIN_WINDOW_DEG = 2.0;
// A decision is "tight" when at most about a third of the fair pockets keep
// the puzzle winnable (1 of 3, 2 of 6, 3 of 9 ...).
export const TIGHT_RATIO = 0.34;
export const INTENT_CAP = 20;

// ── Search core ─────────────────────────────────────────────────────────────

// Builds the memoized searches for one puzzle. Mirrors the solver's DFS:
// win is checked before any descent, descent fires only on non-winning
// shots, landing past the dead line is an immediate loss.
export function makeSearch(pz, layout = fixtureLayout(), { prune = true } = {}) {
  const fast = pz.descentType === 'time';
  const goalType = pz.goalType || 'clear-all';
  const descentEvery = pz.descentType === 'shot' ? (pz.descentEvery || 2) : 0;
  const queue = pz.queue;
  const memo = new Map();       // state -> winnable?
  const candCache = new Map();  // board@qi -> fair candidates (winnable states only)
  const intentMemo = new Map(); // state -> capped count of distinct winning lines

  function fairCandidates(board, qi) {
    const bk = stateKey(board, qi);
    const hit = candCache.get(bk);
    if (hit) return hit;
    return enumerateCandidates(layout, board, { fast })
      .filter(c => c.angleHi - c.angleLo >= MIN_WINDOW_DEG);
  }

  // Apply one shot from (board, qi, ssd). Returns the outcome; `next` is the
  // post-descent board for non-winning, non-lost shots.
  function shoot(board, qi, ssd, c) {
    const next = cloneBoard(board);
    const { popped, dropped, placed } = applyShot(next, layout, c.x, c.y, queue[qi]);
    const removed = popped.length + dropped.length;
    const removedTargets = popped.filter(l => l.isTarget).length + dropped.filter(l => l.isTarget).length;
    const out = { c, popped: popped.length, dropped: dropped.length, removed, removedTargets, next, nextShots: 0, won: false, lost: false };
    if (placed.y >= layout.deadLineY) { out.lost = true; return out; }
    if (isWon(next, goalType)) { out.won = true; return out; }
    let nextShots = ssd + 1;
    if (descentEvery > 0 && nextShots >= descentEvery) {
      if (!applyPuzzleDescent(next, layout)) { out.lost = true; return out; }
      nextShots = 0;
    }
    out.nextShots = nextShots;
    if (qi + 1 >= queue.length) out.lost = true; // out of shots, not won
    return out;
  }

  // Sound dead-state prune: an anchored lantern (top edge in the trellis
  // band, which sinks with puzzle descent) can never drop, only pop, and a
  // pop needs a shot of its color. So if some lantern the goal requires
  // removing is anchored and its color is absent from the rest of the queue
  // (or it is an anchored stone in clear-all), the state is lost. This cuts
  // the spare-shot subtrees that dominate long-queue puzzles (#26, #37).
  const remainingColors = queue.map((_, i) => new Set(queue.slice(i)));
  function deadByAnchors(board, qi) {
    const anchorY = effectiveTrellisY(board, layout) + anchorBandPx(layout);
    const left = remainingColors[qi];
    for (const l of board.lanterns) {
      if (l.y - layout.size > anchorY) continue;
      if (goalType === 'clear-targets' && !l.isTarget) continue;
      if (l.isBlocker || !left.has(l.color)) return true;
    }
    return false;
  }

  function winnableFrom(board, qi, ssd) {
    if (isWon(board, goalType)) return true;
    if (qi >= queue.length) return false;
    if (prune && deadByAnchors(board, qi)) return false;
    const key = stateKey(board, qi) + ':' + ssd;
    if (memo.has(key)) return memo.get(key);
    memo.set(key, false); // cycle guard; real value set below
    const cands = fairCandidates(board, qi);
    let won = false;
    for (const c of cands) {
      const r = shoot(board, qi, ssd, c);
      if (r.won) { won = true; break; }
      if (r.lost) continue;
      if (winnableFrom(r.next, qi + 1, r.nextShots)) { won = true; break; }
    }
    memo.set(key, won);
    if (won) candCache.set(stateKey(board, qi), cands);
    return won;
  }

  // Distinct winning lines from (board, qi, ssd), capped at INTENT_CAP.
  // Children are deduplicated by their resulting state, so two pockets that
  // produce the same board are one line; terminal wins dedupe on the final
  // board (in clear-all every win is the empty board, so all finishing
  // pockets of a state collapse into one).
  function countIntent(board, qi, ssd) {
    if (qi >= queue.length) return 0;
    const key = stateKey(board, qi) + ':' + ssd;
    if (intentMemo.has(key)) return intentMemo.get(key);
    if (!winnableFrom(board, qi, ssd)) { intentMemo.set(key, 0); return 0; }
    const seen = new Set();
    let total = 0;
    for (const c of fairCandidates(board, qi)) {
      const r = shoot(board, qi, ssd, c);
      if (r.lost) continue;
      const ck = r.won ? 'W|' + stateKey(r.next, qi + 1) : stateKey(r.next, qi + 1) + ':' + r.nextShots;
      if (seen.has(ck)) continue;
      seen.add(ck);
      total += r.won ? 1 : countIntent(r.next, qi + 1, r.nextShots);
      if (total >= INTENT_CAP) { total = INTENT_CAP; break; }
    }
    intentMemo.set(key, total);
    return total;
  }

  return { fairCandidates, shoot, winnableFrom, countIntent, goalType, descentEvery };
}

// ── Pure helpers (unit-tested) ──────────────────────────────────────────────

// The "obvious" move among classified pockets ({ removed, removedTargets,
// angle }): max removal, then most targets, then closest to straight up,
// then lowest angle. Returns null when nothing removes anything.
export function pickObvious(pockets) {
  let best = null;
  for (const p of pockets) {
    if (p.removed <= 0) continue;
    if (!best) { best = p; continue; }
    if (p.removed !== best.removed) { if (p.removed > best.removed) best = p; continue; }
    if (p.removedTargets !== best.removedTargets) { if (p.removedTargets > best.removedTargets) best = p; continue; }
    const da = Math.abs(p.angle), db = Math.abs(best.angle);
    if (da !== db) { if (da < db) best = p; continue; }
    if (p.angle < best.angle) best = p;
  }
  return best;
}

// Summarise per-step openings into the line metrics. steps: [{ viable,
// total, temptation }].
export function summarizeSteps(steps) {
  const ratios = steps.map(s => s.viable / Math.max(1, s.total));
  const luck = ratios.reduce((p, r) => p * r, 1);
  const depth = ratios.filter(r => r <= TIGHT_RATIO).length;
  let lateInsight = 0, tightest = Infinity;
  ratios.forEach((r, i) => { if (r <= tightest) { tightest = r; lateInsight = i + 1; } });
  const temptationShots = steps.map((s, i) => s.temptation ? i + 1 : 0).filter(Boolean);
  return {
    luck, depth, lateInsight,
    tightestRatio: steps.length ? tightest : null,
    frontLoaded: steps.length > 1 && lateInsight === 1,
    temptation: temptationShots.length,
    temptationShots,
  };
}

export function formatIntent(n) {
  return n >= INTENT_CAP ? `${INTENT_CAP}+` : String(n);
}

function cellOf(layout, x, y) {
  const nx = Math.round((x - layout.originX) / layout.size);
  const row = Math.round((y - layout.trellisY - layout.size) / (SQRT3 * layout.size));
  return `r${row} nx${nx}`;
}

// ── Per-puzzle measurement ──────────────────────────────────────────────────

export function measurePuzzle(id, { intent = true, prune = true } = {}) {
  const pz = puzzleConfig(id);
  const layout = fixtureLayout();
  const t0 = Date.now();

  const { solution } = solvePuzzle(pz, layout, { minWindowDeg: MIN_WINDOW_DEG });
  if (!solution) return { id, name: pz.name, solvable: false };

  const search = makeSearch(pz, layout, { prune });
  const root = { lanterns: [], descentAnimY: 0, descentCount: 0, anchorOffsetRows: 0 };
  populatePuzzle(root, layout, pz.board, pz);
  const board = cloneBoard(root);

  const steps = [];
  let ssd = 0;
  for (let qi = 0; qi < solution.length; qi++) {
    const detail = [];
    let viable = 0;
    for (const c of search.fairCandidates(board, qi)) {
      const r = search.shoot(board, qi, ssd, c);
      const ok = r.won || (!r.lost && search.winnableFrom(r.next, qi + 1, r.nextShots));
      if (ok) viable++;
      detail.push({
        cell: cellOf(layout, c.x, c.y), angle: c.angleDeg, window: c.angleHi - c.angleLo,
        popped: r.popped, dropped: r.dropped, removed: r.removed, removedTargets: r.removedTargets,
        viable: ok,
      });
    }
    const obvious = pickObvious(detail);
    const temptation = !!(obvious && !obvious.viable);
    // Losing pockets tied with the obvious one on removal: the tie-break
    // hides these, so they are reported (not gated) as "bait".
    const bait = obvious ? detail.filter(d => d.removed === obvious.removed && !d.viable).length : 0;
    const s = solution[qi];
    steps.push({
      color: pz.queue[qi], viable, total: detail.length,
      obvious: obvious ? { cell: obvious.cell, angle: obvious.angle, removed: obvious.removed, viable: obvious.viable } : null,
      played: { cell: cellOf(layout, s.x, s.y), angle: s.angleDeg, removed: s.popped + s.dropped },
      temptation, greedyTrap: temptation, bait,
      detail,
    });

    // Advance along the canonical line.
    applyShot(board, layout, s.x, s.y, pz.queue[qi]);
    if (isWon(board, search.goalType)) break;
    ssd++;
    if (search.descentEvery > 0 && ssd >= search.descentEvery) {
      applyPuzzleDescent(board, layout);
      ssd = 0;
    }
  }

  const summary = summarizeSteps(steps);
  const intentCount = intent ? search.countIntent(root, 0, 0) : null;
  return {
    id, name: pz.name, solvable: true,
    queueLength: pz.queue.length, shotsUsed: solution.length,
    goalType: search.goalType, descentType: pz.descentType || 'none',
    steps, ...summary, intent: intentCount,
    ms: Date.now() - t0,
  };
}

// ── Chapters and the rubric ─────────────────────────────────────────────────

// Chapter boundaries are read from the `// ── Chapter N · Title` comment
// headers in js/puzzles.js, so re-ordering or adding chapters needs no edit
// here. Returns Map id -> { chapter, title }.
export function chapterMap(source = readFileSync(new URL('../js/puzzles.js', import.meta.url), 'utf8')) {
  const map = new Map();
  let cur = { chapter: 0, title: '' };
  for (const line of source.split('\n')) {
    const h = line.match(/^\s*\/\/\s*──\s*Chapter\s+(\d+)\s*·\s*([^—–-]+?)\s*(?:[—–-]|$)/);
    if (h) { cur = { chapter: Number(h[1]), title: h[2].trim() }; continue; }
    const m = line.match(/^\s*id:\s*(\d+),/);
    if (m) map.set(Number(m[1]), cur);
  }
  return map;
}

// Per-chapter targets — the one place to tune the checklist. A null/absent
// field is not checked. See docs/puzzle-rubric.md for the reasoning.
//   minShots       queue length >= (single-shot puzzles are spot-the-pocket)
//   maxLuck        luck <= (blind random play should rarely win)
//   minDepth       tight decisions >= on the solution line
//   minTemptation  decision points whose obvious move loses >=
//   maxIntent      distinct winning lines <= (one idea, not a free-for-all)
//   notFrontLoaded the tightest decision must not be shot 1
export const CHAPTER_TARGETS = {
  1: {},                                                    // First Light: tutorial, ungated
  2: {},                                                    // Golden Targets: tutorial, ungated
  3: { maxLuck: 0.25, minDepth: 1 },                        // Stone Lanterns: first real reads
  4: { minShots: 2, maxLuck: 0.20, minDepth: 2, minTemptation: 1, maxIntent: 3 },
  5: { minShots: 2, maxLuck: 0.12, minDepth: 2, minTemptation: 1, maxIntent: 3 },
  6: { minShots: 2, maxLuck: 0.08, minDepth: 2, minTemptation: 1, maxIntent: 3, notFrontLoaded: true },
  7: { minShots: 2, maxLuck: 0.04, minDepth: 2, minTemptation: 1, maxIntent: 3, notFrontLoaded: true },
};

export function checkRubric(r, targets) {
  const fails = [];
  if (!r.solvable) return { pass: false, fails: ['unsolvable'] };
  const t = targets || {};
  if (t.minShots != null && r.queueLength < t.minShots) fails.push(`shots ${r.queueLength}<${t.minShots}`);
  if (t.maxLuck != null && r.luck > t.maxLuck + 1e-9) fails.push(`luck ${(r.luck * 100).toFixed(1)}%>${(t.maxLuck * 100).toFixed(0)}%`);
  if (t.minDepth != null && r.depth < t.minDepth) fails.push(`depth ${r.depth}<${t.minDepth}`);
  if (t.minTemptation != null && r.temptation < t.minTemptation) fails.push(`temptation ${r.temptation}<${t.minTemptation}`);
  if (t.maxIntent != null && r.intent != null && r.intent > t.maxIntent) fails.push(`intent ${formatIntent(r.intent)}>${t.maxIntent}`);
  if (t.notFrontLoaded && r.frontLoaded) fails.push('tightest at shot 1');
  return { pass: fails.length === 0, fails };
}
