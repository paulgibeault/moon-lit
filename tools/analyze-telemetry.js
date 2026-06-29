#!/usr/bin/env node
// analyze-telemetry.js — turn an exported telemetry bundle into a difficulty
// report and a set of curation candidates for puzzle / campaign design.
//
// Source data: the JSON produced by the launcher's "Export to File" feature
// (a `pauls-arcade-save` bundle whose `data` maps namespaced localStorage keys
// to raw JSON strings). The moon-lit telemetry lives at the key
// `arcade.v1.moon-lit.telemetryLog`. A bare `{telemetry:[...]}` object or a
// bare array of records is also accepted.
//
// Usage:
//   node tools/analyze-telemetry.js <export.json>
//   node tools/analyze-telemetry.js <export.json> --mode seed
//   node tools/analyze-telemetry.js <export.json> --min-plays 3 --out scratch/candidates.json
//
// Empirical difficulty here is observed (how often YOU lose, how long it takes,
// how many shots). It says what *feels* hard. Before promoting a seed into a
// real puzzle, confirm it's *fair* (solvable, luck within target) with the
// existing tools/solver.js + tools/measure-difficulty.js.

import { readFileSync, writeFileSync } from 'node:fs';
import { fairnessLabel, TIER_RANK } from '../js/difficulty.js';

// ─── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = { minPlays: 2, mode: null, out: null, top: 20 };
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--min-plays') opts.minPlays = parseInt(argv[++i], 10) || 1;
  else if (a === '--mode') opts.mode = argv[++i];
  else if (a === '--out') opts.out = argv[++i];
  else if (a === '--top') opts.top = parseInt(argv[++i], 10) || 20;
  else positional.push(a);
}
const file = positional[0];
if (!file) {
  console.error('usage: node tools/analyze-telemetry.js <export.json> [--mode seed] [--min-plays N] [--out file.json]');
  process.exit(1);
}

// ─── load ────────────────────────────────────────────────────────────────────
let bundle;
try {
  bundle = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`could not read/parse ${file}: ${e.message}`);
  process.exit(1);
}
// Pull the per-game records out of whatever shape we were handed.
function extractGames(b) {
  // Launcher save bundle: data maps namespaced keys → raw JSON strings.
  if (b && b.format === 'pauls-arcade-save' && b.data && typeof b.data === 'object') {
    const key = Object.keys(b.data).find(k => /^arcade\.v1\..+\.telemetryLog$/.test(k));
    if (!key) return [];
    let v = b.data[key];
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { return []; } }
    return Array.isArray(v) ? v : [];
  }
  if (Array.isArray(b?.telemetry)) return b.telemetry;   // bare telemetry bundle
  if (Array.isArray(b)) return b;                         // bare array of records
  return [];
}
let games = extractGames(bundle);
if (opts.mode) games = games.filter(g => g.gameMode === opts.mode);
if (!games.length) {
  console.error('no telemetry records found (after mode filter).');
  process.exit(1);
}

// ─── stats helpers ───────────────────────────────────────────────────────────
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

// Difficulty index 0–100 from a group's records. Loss rate is the spine;
// shots-used and duration nudge it so two equally-lost configs are ordered by
// how grindy the wins were. Low confidence (few plays) is pulled toward 50 so a
// single fluke loss doesn't top the chart.
function difficultyIndex(rows) {
  const plays = rows.length;
  const wins = rows.filter(r => r.won).length;
  // Never beaten = the hardest, full stop. Pin to the top so a trophy seed
  // always outranks anything you've cleared (more attempts breaks ties in rank()).
  if (wins === 0) return 100;
  const lossRate = 1 - wins / plays;
  const winRows = rows.filter(r => r.won);
  const grind = winRows.length
    ? Math.min(1, median(winRows.map(r => r.shotsFired || 0)) / 30)  // 30 shots ≈ a long clear
    : 1;
  const raw = 0.75 * lossRate + 0.25 * grind;
  const confidence = Math.min(1, plays / 6);
  return Math.round(100 * (0.5 + confidence * (raw - 0.5)));
}

// Difficulty tiers (incl. the lost-cause top tier) live in js/difficulty.js so
// the in-app Seeds panel and this offline report agree. See that file for the
// tier definitions.

function summarize(rows) {
  const wins = rows.filter(r => r.won);
  const losses = rows.filter(r => !r.won);
  return {
    plays: rows.length,
    wins: wins.length,
    winRate: +(wins.length / rows.length).toFixed(3),
    difficulty: difficultyIndex(rows),
    fairness: fairnessLabel(rows),
    medScore: Math.round(median(rows.map(r => r.score || 0))),
    medShotsToWin: wins.length ? Math.round(median(wins.map(r => r.shotsFired || 0))) : null,
    medDurationSec: Math.round(median(rows.map(r => (r.durationMs || 0) / 1000))),
    avgRowsLeftOnLoss: losses.length ? +mean(losses.map(r => r.rowsRemaining || 0)).toFixed(1) : null,
  };
}

// ─── grouping ────────────────────────────────────────────────────────────────
function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

const sig = (r) => [r.colors, r.initialRows, r.descentShots, r.isSpeedMode ? 'T' : 'C',
  r.blockerPct || 0, r.pattern || '-'].join('/');
const seedPair = (r) => (r.settingsSeed != null && r.boardSeed != null)
  ? `${r.settingsSeed >>> 0}:${r.boardSeed >>> 0}` : null;

function rank(map, label) {
  const out = [];
  for (const [key, rows] of map) {
    if (rows.length < opts.minPlays) continue;
    out.push({ key, ...summarize(rows) });
  }
  out.sort((a, b) =>
    b.difficulty - a.difficulty ||
    TIER_RANK[a.fairness] - TIER_RANK[b.fairness] ||
    b.plays - a.plays);
  return out;
}

// ─── report ──────────────────────────────────────────────────────────────────
const overall = summarize(games);
console.log(`\n${'═'.repeat(72)}`);
console.log(`moon-lit telemetry — ${games.length} games${opts.mode ? ` (mode: ${opts.mode})` : ''}`);
console.log(`overall: ${overall.wins}/${overall.plays} won (${(overall.winRate * 100).toFixed(0)}%), median ${overall.medDurationSec}s/game`);
console.log('═'.repeat(72));

const bySig = rank(groupBy(games, sig));
console.log(`\n▸ Hardest CONFIG signatures  (colors/rows/descent/mode/blocker%/pattern, ≥${opts.minPlays} plays)`);
if (!bySig.length) console.log('  (none meet the play threshold)');
for (const g of bySig.slice(0, opts.top)) {
  console.log(`  [${String(g.difficulty).padStart(3)}] ${g.fairness.padEnd(12)} ${g.key.padEnd(22)} ` +
    `${g.wins}/${g.plays} won  med ${g.medShotsToWin ?? '–'} shots / ${g.medDurationSec}s${g.fairness === 'lost-cause' ? '  💀' : g.wins === 0 ? '  🏆' : ''}`);
}

const seedRows = games.filter(g => seedPair(g));
const bySeed = rank(groupBy(seedRows, seedPair));   // sorted hardest → easiest
const isHard = (g) => g.fairness === 'lost-cause' || g.fairness === 'unbeaten' || g.fairness === 'challenging' || g.fairness === 'brutal';
const isEasy = (g) => g.fairness === 'easy' || g.fairness === 'trivial';

const lostCauses = bySeed.filter(g => g.fairness === 'lost-cause');
const unbeaten = bySeed.filter(g => g.fairness === 'unbeaten');
console.log(`\n▸ Curation candidates — hardest SEED PAIRS  (settingsSeed:boardSeed, ≥${opts.minPlays} plays)`);
if (lostCauses.length) {
  console.log(`  💀 ${lostCauses.length} LOST CAUSE${lostCauses.length > 1 ? 'S' : ''} — the hardest tier: seeds you tried again and again`);
  console.log(`     and abandoned every time. Confirm each is actually solvable before authoring it.`);
}
if (unbeaten.length) {
  console.log(`  🏆 ${unbeaten.length} UNBEATEN seed${unbeaten.length > 1 ? 's' : ''} — never won, but not yet a lost cause; wear it as a badge,`);
  console.log(`     then confirm each is actually solvable before authoring it into a puzzle.`);
}
console.log('  late-level material — verify solvability with the solver before promoting.');
if (!bySeed.length) console.log('  (no seed pairs meet the play threshold — play more Explore variants)');
for (const g of bySeed.filter(isHard).slice(0, opts.top)) {
  const [s, b] = g.key.split(':');
  const flag = g.fairness === 'lost-cause' ? '  💀 LOST CAUSE' : g.wins === 0 ? '  🏆 UNBEATEN' : '';
  console.log(`  [${String(g.difficulty).padStart(3)}] ${g.fairness.padEnd(12)} s#${s} b#${b}  ` +
    `${g.wins}/${g.plays} won  rows-left-on-loss ${g.avgRowsLeftOnLoss ?? '–'}${flag}`);
}

// Easiest end of the curve — warm-up / early-level material.
console.log(`\n▸ Curation candidates — easiest SEED PAIRS  (warm-up / early-level material, ≥${opts.minPlays} plays)`);
const easySeeds = [...bySeed].reverse().filter(isEasy);   // easiest first
if (!easySeeds.length) console.log('  (none meet the play threshold)');
for (const g of easySeeds.slice(0, opts.top)) {
  const [s, b] = g.key.split(':');
  console.log(`  [${String(g.difficulty).padStart(3)}] ${g.fairness.padEnd(12)} s#${s} b#${b}  ` +
    `${g.wins}/${g.plays} won  med ${g.medShotsToWin ?? '–'} shots / ${g.medDurationSec}s`);
}

// ─── candidates out ──────────────────────────────────────────────────────────
// Capture BOTH ends of the difficulty curve: hard seeds for late levels, easy
// seeds for warm-ups / early levels. Unbeaten seeds are kept (not dropped) but
// flagged — confirm they're solvable, not unwinnable, before promoting.
function toCandidate(g, bucket) {
  const [settingsSeed, boardSeed] = g.key.split(':').map(Number);
  return { settingsSeed, boardSeed, bucket, needsSolverCheck: g.wins === 0, ...g, key: undefined };
}
const hardCandidates = bySeed.filter(isHard).slice(0, opts.top).map(g => toCandidate(g, 'hard'));
const easyCandidates = easySeeds.slice(0, opts.top).map(g => toCandidate(g, 'easy'));
const candidates = [...hardCandidates, ...easyCandidates];

if (opts.out) {
  const payload = { source: file, generatedAt: new Date().toISOString(), overall, configRanking: bySig, candidates };
  writeFileSync(opts.out, JSON.stringify(payload, null, 2));
  console.log(`\n✓ wrote ${candidates.length} candidate(s) — ${hardCandidates.length} hard, ${easyCandidates.length} easy → ${opts.out}`);
}
console.log(`\nNext: verify a candidate's board is solvable & fair before authoring it as a puzzle.`);
console.log(`      (build the board from its seeds, then run tools/solver.js / measure-difficulty.js)\n`);
