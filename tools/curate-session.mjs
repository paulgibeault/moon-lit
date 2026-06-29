#!/usr/bin/env node
// curate-session.mjs — bucket one play session's Explore seeds into difficulty
// tiers for curation: easy / medium / hard, plus `lost-cause` (the new highest
// tier — seeds tried repeatedly and abandoned without a win).
//
// Win-rate can't separate seeds you each played once, so for the *won* seeds we
// rank by a composite of intrinsic config difficulty (more colors / rows / less
// descent room / speed mode / stone blockers = harder) plus the effort the win
// actually took (shots fired, descents survived). `lost-cause` is decided by
// outcome, not the score: 0 wins across ≥2 abandoned attempts.
//
// Usage: node tools/curate-session.mjs <export.json> [--out scratch/curation.json]

import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const positional = [];
let out = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') out = argv[++i];
  else positional.push(argv[i]);
}
const file = positional[0];
if (!file) { console.error('usage: node tools/curate-session.mjs <export.json> [--out file.json]'); process.exit(1); }

const bundle = JSON.parse(readFileSync(file, 'utf8'));
function extractGames(b) {
  if (b && b.format === 'pauls-arcade-save' && b.data) {
    const key = Object.keys(b.data).find(k => /^arcade\.v1\..+\.telemetryLog$/.test(k));
    let v = key ? b.data[key] : '[]';
    if (typeof v === 'string') v = JSON.parse(v);
    return Array.isArray(v) ? v : [];
  }
  if (Array.isArray(b?.telemetry)) return b.telemetry;
  return Array.isArray(b) ? b : [];
}

const games = extractGames(bundle);
const seedPair = (r) => (r.settingsSeed != null && r.boardSeed != null)
  ? `${r.settingsSeed >>> 0}:${r.boardSeed >>> 0}` : null;
const abandoned = (r) => !r.won && r.endPhase === 'aiming';
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const median = (xs) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Group seed-mode games by their seed pair (zen has no seed → not curatable).
const bySeed = new Map();
for (const g of games) {
  const k = seedPair(g);
  if (!k) continue;
  if (!bySeed.has(k)) bySeed.set(k, []);
  bySeed.get(k).push(g);
}

// Intrinsic difficulty of a config, 0..1. Each lever normalized to its real range.
function configHardness(r) {
  const colors = clamp01((r.colors - 3) / 3);            // 3 → 0, 6 → 1
  const rows = clamp01((r.initialRows - 3) / 4);          // 3 → 0, 7 → 1
  const descent = clamp01((12 - r.descentShots) / 7);     // 12 shots' grace → 0, 5 → 1
  const speed = r.isSpeedMode ? 1 : 0;
  const blockers = clamp01((r.blockerPct || 0) / 30);     // 0 → 0, 30% stones → 1
  return 0.26 * colors + 0.20 * rows + 0.20 * descent + 0.14 * speed + 0.20 * blockers;
}
// How much the win actually cost you, 0..1 — a tie-breaker on top of config.
function effort(rows) {
  const shots = clamp01(median(rows.map(r => r.shotsFired || 0)) / 120);
  const descents = clamp01(median(rows.map(r => r.descentsSurvived || 0)) / 30);
  return 0.6 * shots + 0.4 * descents;
}

const seeds = [];
for (const [key, rows] of bySeed) {
  const [settingsSeed, boardSeed] = key.split(':').map(Number);
  const r0 = rows[0];
  const wins = rows.filter(r => r.won).length;
  const abandons = rows.filter(abandoned).length;
  const lostCause = wins === 0 && rows.length >= 2 && abandons >= 2;
  const hardness = lostCause ? 1 : 0.78 * configHardness(r0) + 0.22 * effort(rows.filter(r => r.won));
  seeds.push({
    settingsSeed, boardSeed,
    config: { colors: r0.colors, initialRows: r0.initialRows, descentShots: r0.descentShots,
      isSpeedMode: !!r0.isSpeedMode, blockerPct: r0.blockerPct || 0, pattern: r0.pattern || 'random',
      stencilPack: r0.stencilPack },
    plays: rows.length, wins, abandons,
    bestScore: Math.max(...rows.map(r => r.score || 0)),
    bestCombo: Math.max(...rows.map(r => r.bestCombo || 0)),
    medShots: wins ? Math.round(median(rows.filter(r => r.won).map(r => r.shotsFired || 0))) : null,
    hardness: +hardness.toFixed(3),
    lostCause,
  });
}

// Tier the *won* seeds into easy / medium / hard by hardness tertiles.
const won = seeds.filter(s => !s.lostCause).sort((a, b) => a.hardness - b.hardness);
const t1 = Math.floor(won.length / 3), t2 = Math.floor((won.length * 2) / 3);
won.forEach((s, i) => { s.tier = i < t1 ? 'easy' : i < t2 ? 'medium' : 'hard'; });
seeds.filter(s => s.lostCause).forEach(s => { s.tier = 'lost-cause'; });

const ORDER = { 'lost-cause': 0, hard: 1, medium: 2, easy: 3 };
const tiers = { 'lost-cause': [], hard: [], medium: [], easy: [] };
for (const s of seeds) tiers[s.tier].push(s);
for (const k of Object.keys(tiers)) tiers[k].sort((a, b) => b.hardness - a.hardness);

// ── report ──
const EMOJI = { 'lost-cause': '💀', hard: '🔥', medium: '🌗', easy: '🌱' };
console.log(`\nmoon-lit session curation — ${file.split('/').pop()}`);
console.log(`${seeds.length} unique Explore seeds (${games.filter(seedPair).length} seed games, ${games.length} total incl. zen)\n`);
for (const tier of Object.keys(tiers)) {
  const list = tiers[tier];
  console.log(`${EMOJI[tier]} ${tier.toUpperCase()}  (${list.length})`);
  for (const s of list) {
    const c = s.config;
    const sig = `c${c.colors} r${c.initialRows} ds${c.descentShots}${c.isSpeedMode ? ' speed' : ''}${c.blockerPct ? ` blk${c.blockerPct}` : ''}`;
    const tag = s.lostCause ? `0/${s.plays} won, ${s.abandons} abandoned` : `${s.wins}/${s.plays} won, ${s.medShots} shots`;
    console.log(`   s#${s.settingsSeed} b#${s.boardSeed}  [${sig}]  ${tag}  (h=${s.hardness})`);
  }
  console.log('');
}

if (out) {
  const flat = Object.values(tiers).flat().sort((a, b) => ORDER[a.tier] - ORDER[b.tier] || b.hardness - a.hardness);
  writeFileSync(out, JSON.stringify({
    source: file, game: 'moon-lit',
    note: 'Session difficulty curation. lost-cause = repeatedly abandoned, never won (new highest tier). ' +
      'easy/medium/hard = won seeds tiered by config + effort hardness. Verify solvability before authoring.',
    counts: Object.fromEntries(Object.entries(tiers).map(([k, v]) => [k, v.length])),
    seeds: flat,
  }, null, 2));
  console.log(`✓ wrote ${flat.length} seeds → ${out}`);
}
