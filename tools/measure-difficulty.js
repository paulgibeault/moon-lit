// Difficulty meter and quality checklist for Moon Lit puzzles — the
// design-time companion to tools/test-puzzles.js. Solvability says a puzzle
// CAN be beaten; this tool measures how it plays. Metric definitions live in
// tools/puzzle-metrics.js and docs/puzzle-rubric.md:
//
//   - openings: viable/total fair pockets at each step of the solution line
//   - luck: product of those ratios (random-fair-pocket win probability)
//   - temptation: steps where the "obvious" (biggest immediate pop/drop)
//     pocket loses — formerly reported as "greedy trap"
//   - depth: tight decisions (viable/total <= TIGHT_RATIO)
//   - late insight: which shot is the tightest decision
//   - intent: distinct winning lines (board-state sequences), capped at 20
//
//   node tools/measure-difficulty.js                 # all puzzles
//   node tools/measure-difficulty.js 31              # one puzzle
//   node tools/measure-difficulty.js 31 40           # a range
//   node tools/measure-difficulty.js 31 --candidates # dump every step's pockets
//   node tools/measure-difficulty.js --rubric [from] [to] [--json out.json] [--strict]
//   node tools/measure-difficulty.js ... --jobs 4    # worker threads (default: cores-1)
//   node tools/measure-difficulty.js ... --no-intent # skip the intent count
//   node tools/measure-difficulty.js ... --no-prune  # disable the anchored-color
//                                    # dead-state prune (validation only; very slow
//                                    # on long spare-shot queues such as #26, #37)
//   node tools/measure-difficulty.js --rubric --regrade docs/puzzle-rubric-baseline.json
//                                    # re-grade saved metrics against the current
//                                    # CHAPTER_TARGETS without re-measuring (instant)
//
// --rubric prints the per-chapter checklist (targets in CHAPTER_TARGETS).
// It exits 0 even when puzzles fail (report mode) unless --strict is given.
//
// Only fair shots count (>= MIN_WINDOW_DEG aim window, <= 1 bounce), matching
// the solvability bar, so "openings 1/12" means: of twelve honest places the
// player can put this lantern, exactly one keeps the puzzle winnable.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import {
  measurePuzzle, chapterMap, CHAPTER_TARGETS, checkRubric, formatIntent, INTENT_CAP,
} from './puzzle-metrics.js';
import { PUZZLE_COUNT } from '../js/puzzles.js';

function quietly(fn) {
  const originalLog = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = originalLog; }
}

if (!isMainThread) {
  // Worker: measure puzzles on request until told to stop.
  parentPort.on('message', (id) => {
    if (id === null) { process.exit(0); }
    const r = quietly(() => measurePuzzle(id, workerData));
    parentPort.postMessage(r);
  });
} else {
  await main();
}

async function measureAll(ids, opts, jobs) {
  if (jobs <= 1 || ids.length <= 1) {
    return ids.map(id => quietly(() => measurePuzzle(id, opts)));
  }
  // Slowest (late, pressure) puzzles first so the pool drains evenly.
  const pending = [...ids].sort((a, b) => b - a);
  const results = new Map();
  await Promise.all(Array.from({ length: Math.min(jobs, ids.length) }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: opts });
    const next = () => {
      const id = pending.shift();
      if (id === undefined) { w.postMessage(null); return; }
      w.postMessage(id);
    };
    w.on('message', (r) => {
      results.set(r.id, r);
      process.stderr.write(`  measured ${String(r.id).padStart(2)} (${((r.ms || 0) / 1000).toFixed(1)}s)\n`);
      next();
    });
    w.on('error', reject);
    w.on('exit', resolve);
    next();
  })));
  return ids.map(id => results.get(id));
}

function pct(x) { return `${(x * 100).toFixed(1)}%`; }

async function main() {
  const rawArgs = process.argv.slice(2);
  const flag = (name) => rawArgs.includes(name);
  const option = (name) => {
    const i = rawArgs.indexOf(name);
    return i >= 0 ? rawArgs[i + 1] : undefined;
  };
  const rubric = flag('--rubric');
  const strict = flag('--strict');
  const dumpCandidates = flag('--candidates');
  const jsonOut = option('--json');
  const jobsOpt = option('--jobs');
  const regrade = option('--regrade');
  const optionValues = new Set([jsonOut, jobsOpt, regrade].filter(v => v !== undefined));
  const nums = rawArgs.filter(a => !a.startsWith('--') && !optionValues.has(a)).map(Number).filter(n => !Number.isNaN(n));
  let from = 1, to = PUZZLE_COUNT;
  if (nums.length === 1) { from = to = nums[0]; }
  if (nums.length >= 2) { [from, to] = nums; }
  const jobs = jobsOpt ? Math.max(1, Number(jobsOpt)) : Math.max(1, availableParallelism() - 1);

  const ids = [];
  for (let id = from; id <= to; id++) ids.push(id);
  const t0 = Date.now();
  let reports, elapsed;
  if (regrade) {
    const saved = JSON.parse(readFileSync(regrade, 'utf8'));
    reports = saved.puzzles
      .filter(p => p.id >= from && p.id <= to)
      .map(p => ({ solvable: true, ...p }));
    elapsed = saved.elapsedSec ?? 0;
  } else {
    reports = await measureAll(ids, { intent: !flag('--no-intent'), prune: !flag('--no-prune') }, jobs);
    elapsed = (Date.now() - t0) / 1000;
  }
  const chapters = chapterMap();

  for (const r of reports) {
    const ch = chapters.get(r.id) || { chapter: 0, title: '' };
    r.chapter = ch.chapter;
    r.chapterTitle = ch.title;
    const verdict = checkRubric(r, CHAPTER_TARGETS[ch.chapter]);
    r.pass = verdict.pass;
    r.fails = verdict.fails;
  }

  if (!rubric) {
    console.log('=== Moon Lit Puzzle Difficulty ===');
    for (const r of reports) {
      if (!r.solvable) {
        console.log(`[----] ${String(r.id).padStart(2)} "${r.name}" — unsolvable, nothing to measure`);
        continue;
      }
      const openings = r.steps.map(s => `${s.viable}/${s.total}`).join(' → ');
      const trapNote = r.temptation ? `, temptation (greedy trap) at shot ${r.temptationShots.join(', ')}` : '';
      const intentNote = r.intent != null ? `, intent ${formatIntent(r.intent)}` : '';
      const bait = r.steps.map((s, i) => s.bait ? `${i + 1}(${s.bait})` : null).filter(Boolean);
      const baitNote = bait.length ? `, bait at shot ${bait.join(', ')}` : '';
      console.log(`${String(r.id).padStart(2)} "${r.name}" — luck ${pct(r.luck)}, openings ${openings}, depth ${r.depth}, tightest shot ${r.lateInsight}${intentNote}${trapNote}${baitNote}`);
    }
  } else {
    console.log('=== Moon Lit Puzzle Rubric ===');
    const head = ` id  ${'name'.padEnd(22)} ch shots  luck    depth late  tempt intent  result`;
    console.log(head);
    console.log('-'.repeat(head.length + 20));
    let lastCh = null;
    for (const r of reports) {
      if (r.chapter !== lastCh) {
        lastCh = r.chapter;
        const t = CHAPTER_TARGETS[r.chapter] || {};
        const tgt = Object.entries(t).map(([k, v]) => `${k}=${v}`).join(' ') || 'no targets';
        console.log(`  · Chapter ${r.chapter} ${r.chapterTitle} [${tgt}]`);
      }
      const name = r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name;
      if (!r.solvable) {
        console.log(`${String(r.id).padStart(3)}  ${name.padEnd(22)} ${String(r.chapter).padStart(2)}  —  unsolvable                                      FAIL`);
        continue;
      }
      const late = `${r.lateInsight}${r.frontLoaded ? '*' : ' '}`;
      console.log(
        `${String(r.id).padStart(3)}  ${name.padEnd(22)} ${String(r.chapter).padStart(2)} ` +
        `${`${r.shotsUsed}/${r.queueLength}`.padStart(5)} ${pct(r.luck).padStart(6)}  ` +
        `${String(r.depth).padStart(5)} ${late.padStart(4)}  ${String(r.temptation).padStart(5)} ` +
        `${(r.intent == null ? '-' : formatIntent(r.intent)).padStart(6)}  ` +
        `${r.pass ? 'PASS' : 'FAIL ' + r.fails.join('; ')}`
      );
    }
    const fails = reports.filter(r => !r.pass).length;
    const multi = reports.filter(r => r.solvable && r.shotsUsed > 1);
    const front = multi.filter(r => r.frontLoaded).length;
    console.log(`\n${reports.length - fails}/${reports.length} pass. Tightest decision at shot 1 (*) in ${front}/${multi.length} multi-shot puzzles. ${regrade ? `Regraded from ${regrade}.` : `${elapsed.toFixed(0)}s with ${jobs} job(s).`}`);
  }

  if (from === to && !regrade && reports[0].solvable && dumpCandidates) {
    const r = reports[0];
    for (const [i, s] of r.steps.entries()) {
      console.log(`\nShot ${i + 1} (${s.color}) pockets — played ${s.played.cell}${s.obvious ? `, obvious ${s.obvious.cell}` : ''}:`);
      for (const d of s.detail) {
        console.log(`  ${d.viable ? 'WIN ' : 'lose'} ${d.cell.padEnd(10)} aim ${d.angle.toFixed(1).padStart(6)}°, window ${d.window.toFixed(1)}°, pops ${d.popped}, drops ${d.dropped}`);
      }
    }
  }

  if (jsonOut) {
    const out = {
      generated: new Date().toISOString(),
      elapsedSec: Math.round(elapsed),
      jobs,
      targets: CHAPTER_TARGETS,
      puzzles: reports.map(r => r.solvable ? {
        id: r.id, name: r.name, chapter: r.chapter, chapterTitle: r.chapterTitle,
        goalType: r.goalType, descentType: r.descentType,
        queueLength: r.queueLength, shotsUsed: r.shotsUsed,
        luck: Number(r.luck.toFixed(5)), depth: r.depth, lateInsight: r.lateInsight,
        frontLoaded: r.frontLoaded, temptation: r.temptation, temptationShots: r.temptationShots,
        intent: r.intent, intentCapped: r.intent != null && r.intent >= INTENT_CAP,
        openings: r.steps.map(s => `${s.viable}/${s.total}`),
        baitShots: r.steps.map((s, i) => s.bait ? i + 1 : 0).filter(Boolean),
        steps: r.steps.map(s => ({ color: s.color, viable: s.viable, total: s.total, played: s.played, obvious: s.obvious, temptation: s.temptation, bait: s.bait })),
        pass: r.pass, fails: r.fails, ms: r.ms,
      } : { id: r.id, name: r.name, chapter: r.chapter, solvable: false, pass: false, fails: r.fails }),
    };
    writeFileSync(jsonOut, JSON.stringify(out, null, 2) + '\n');
    console.log(`wrote ${jsonOut}`);
  }

  process.exit(rubric && strict && reports.some(r => !r.pass) ? 1 : 0);
}
