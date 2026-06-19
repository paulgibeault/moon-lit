export const GAME_ID = 'moon-lit';

// Paper-lantern palette tuned to traditional festival colors (Yi Peng, Loy
// Krathong, Mid-Autumn) — clear, distinct hues, not muddy. Slightly pulled
// off pure primaries so they read at night, but each color stays unmistakably
// itself. No pure white (too stark against the moon).
export const COLORS = Object.freeze({
  red:    '#D63D3D',  // festival red
  orange: '#E8843E',  // tangerine persimmon
  yellow: '#E8C055',  // auspicious gold
  green:  '#5FA47C',  // jade
  blue:   '#4D81B8',  // celestial blue
  paper:  '#DBC49A',  // natural unbleached tissue/rice paper, undyed
});

export const COLOR_KEYS = Object.freeze(Object.keys(COLORS));

export const PALETTE = Object.freeze({
  bgTop:        '#0E1538',
  bgBottom:     '#1B274D',
  moon:         '#F5E9C9',
  moonHalo:     '#E8B770',
  trellis:      '#8C6B3A',
  trellisKnot:  '#5C4322',
  // Flat night-indigo silhouette used by the bamboo grove. The launcher
  // cradle reuses this so the wooden harness reads as part of the same
  // painted backdrop instead of popping out as a separate warm element.
  bambooSilhouette: '#0A1230',
  river:        '#0A0F22',
  riverRipple:  '#3D5681',
  ember:        '#2A2A2A',
  emberRing:    '#5C2010',
  deadLine:     '#E8B770',
  launcher:     '#3A2916',
  launcherRim:  '#8C6B3A',
  aimLine:      '#F5E9C9',
});

// Lanterns are circles, not hexes. cols sets the number per top row;
// odd rows are offset by one radius so circles snuggle (close-pack).
// initialRows is how many full rows are populated when a fresh game starts.
// maxRows sizes the canvas so this many rows fit between trellis and dead-line.
// 19 fills tall portrait viewports without leaving a dead air-gap below the
// bottom row; on wide viewports the height-cap shrinks lanterns to keep all
// 19 rows visible, so the play field has a consistent vertical depth.
export const GRID = Object.freeze({
  cols: 8,
  initialRows: 5,
  maxRows: 19,
});

export const BOARD_MARGIN_TOP = 56;
export const BOARD_MARGIN_BOTTOM = 96;
export const BOARD_MARGIN_SIDE = 16;

// Bounce-lane width on each side of the lantern columns, in lantern diameters.
// Keeps the play area visibly wider than the lantern column extent so shots
// can curve past the rightmost/leftmost stack instead of bouncing flush.
export const LANE_LANTERNS = 1.0;

// Two lanterns are treated as adjacent (for matching / anchoring) when their
// centers are within (2 * radius * this factor). >1 forgives small float gaps
// and the fact that lamp sprites are drawn taller than 2*radius, so visually
// overlapping lamps can sit slightly past pure circle-contact.
export let ADJACENCY_TOLERANCE = 1.22;

// Scale factor for projectile-to-lantern collision checking. <1 allows the
// projectile to "sneak" through tight visual gaps slightly before registering
// a collision, reducing frustrating "snags" on nearby corners.
export let COLLISION_TOLERANCE = 0.95;


// Local settle: when a new lantern lands, its 2-hop neighborhood is allowed
// to slide to absorb the impact. Top-row lanterns are pinned (anchored to
// the bamboo trellis). The solver is positional Jacobi relaxation.
export const SETTLE_HOPS = 2;
export const SETTLE_ITERATIONS = 12;
export const SETTLE_MIN_PEN_PX = 0.5;
// How long the visual slide takes (seconds). Resolution (pops/drops) runs
// immediately against post-settle positions; this is purely cosmetic.
export const SETTLE_ANIM_SEC = 0.12;

// On contact, the projectile may slide along the hit lantern's surface up to
// this angular distance to find a snug 3-way pocket. Larger = more snapping
// to neighbors (less skill expression). Smaller = more free-placement gaps.
// 0 = pure stop-at-contact.
export const SETTLE_NUDGE_RAD = Math.PI / 6;

export const TRELLIS_HEIGHT = 18;
export const DEAD_LINE_OFFSET = 36;
// Lower bound on the lantern radius. Floored at a small value so phone-sized
// viewports can shrink lanterns enough to fit the full cols/rows grid rather
// than overflow horizontally.
export const MIN_LANTERN_RADIUS = 4;

// Speeds are in lantern-radii per second and multiplied by layout.size at
// the call site. Keeping them viewport-relative means the projectile and
// descent read at the same visual pace on a tiny phone canvas as on a full
// desktop one — a fixed px/sec runs ~2× faster on phones where lanterns are
// half the size. Calibrated so a typical laptop r≈28 reproduces the
// historical feel (PROJECTILE_SPEED ≈ 620 px/sec, DESCENT ≈ 240 px/sec).
export let PROJECTILE_SPEED = 22;         // radii/sec
// Sized to one packed-row height (sqrt(3)*r) so the move reads as "shift
// down by one row" — about 0.20s per row at this value.
export let DESCENT_DRIFT_SPEED = 8.5;     // radii/sec
export const AIM_MIN_ANGLE = -85 * Math.PI / 180;
export const AIM_MAX_ANGLE =  85 * Math.PI / 180;

// Per-shot visual wobble while a lantern rises. Purely cosmetic — the lamp's
// actual trajectory follows the aim indicator exactly, so the indicator is a
// reliable predictor of where the lamp lands. Each shot pulls a fresh phase,
// freq, and amplitude from the seeded RNG so successive lanterns don't trace
// the same wobble. Amplitude is in pixels of perpendicular offset.
export const SHOT_SWAY_FREQ_MIN = 0.7;       // Hz
export const SHOT_SWAY_FREQ_MAX = 1.4;
export const SHOT_SWAY_AMP_MIN = 3;          // px
export const SHOT_SWAY_AMP_MAX = 6;

// Match-pop burst: a flipbook played at each popped lantern using additive
// blending. Kept short on purpose — the goal is a snappy hit, not a cutscene.
export const BURST_FRAMES = 12;
export const BURST_DURATION_SEC = 0.28;
// Scale of the burst sprite relative to the lantern diameter. >1 lets the
// flame overflow the cell so the hit reads bigger than the lantern itself.
export const BURST_SCALE = 2.0;

export const M3_DEFAULT_SEED = 0x4D6F6F6E;   // 'Moon' in ASCII; placeholder until M7

export let DESCENT_SHOTS = 6;

function generateLevelConfig(level) {
  if (level === 1) {
    return { colors: 3, initialRows: 3, descentShots: 12, isSpeedMode: false, stencilPack: 'plain' };
  }
  if (level === 2) {
    return { colors: 3, initialRows: 4, descentShots: 10, isSpeedMode: false, stencilPack: 'plain' };
  }
  if (level === 3) {
    return { colors: 4, initialRows: 4, descentShots: 9, isSpeedMode: false, stencilPack: 'bugs' };
  }
  if (level === 4) {
    return { colors: 4, initialRows: 4, descentShots: 8, isSpeedMode: false, stencilPack: 'bugs' };
  }
  if (level === 5) {
    return { colors: 5, initialRows: 5, descentShots: 8, isSpeedMode: false, stencilPack: 'flowers' };
  }
  if (level === 6) {
    return { colors: 5, initialRows: 5, descentShots: 7, isSpeedMode: false, stencilPack: 'flowers' };
  }
  if (level === 7) {
    return { colors: 6, initialRows: 5, descentShots: 7, isSpeedMode: false, stencilPack: 'dragons' };
  }
  if (level === 8) {
    return { colors: 6, initialRows: 6, descentShots: 6, isSpeedMode: false, stencilPack: 'dragons' };
  }
  if (level === 9) {
    return { colors: 6, initialRows: 6, descentShots: 6, isSpeedMode: false, stencilPack: 'random' };
  }
  if (level === 10) {
    return { colors: 5, initialRows: 5, descentShots: 8, isSpeedMode: true, stencilPack: 'bugs' };
  }

  // Consistent randomization for level 11 to 1000
  // LCG generator seeded by level
  let s = (level * 104729 + 7919) >>> 0;
  const nextRng = () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return (s & 0x7fffffff) / 2147483648;
  };

  // Determine colors: starts around 4-5, ramps up to 6
  let colors = 5;
  const colorsRoll = nextRng();
  if (level <= 20) {
    colors = colorsRoll < 0.4 ? 4 : 5;
  } else if (level <= 40) {
    colors = colorsRoll < 0.3 ? 5 : 6;
  } else {
    colors = colorsRoll < 0.15 ? 5 : 6;
  }

  // Determine initialRows: starts around 4-5, ramps up to 7
  let initialRows = 5;
  const rowsRoll = nextRng();
  if (level <= 25) {
    initialRows = rowsRoll < 0.3 ? 4 : (rowsRoll < 0.8 ? 5 : 6);
  } else if (level <= 60) {
    initialRows = rowsRoll < 0.2 ? 5 : (rowsRoll < 0.7 ? 6 : 7);
  } else {
    initialRows = rowsRoll < 0.3 ? 6 : 7;
  }

  // Determine descentShots: 5 to 9
  let descentShots = 6;
  const shotsRoll = nextRng();
  if (shotsRoll < 0.15) descentShots = 5;
  else if (shotsRoll < 0.5) descentShots = 6;
  else if (shotsRoll < 0.8) descentShots = 7;
  else if (shotsRoll < 0.95) descentShots = 8;
  else descentShots = 9;

  // Determine stencil pack: randomized among all 5 options
  const packs = ['plain', 'bugs', 'flowers', 'dragons', 'random'];
  const stencilPack = packs[Math.floor(nextRng() * packs.length)];

  // Determine isSpeedMode: 50% chance of timed mode
  const isSpeedMode = nextRng() < 0.5;

  return { colors, initialRows, descentShots, isSpeedMode, stencilPack };
}

export const LEVELS = Object.freeze(
  Array.from({ length: 1000 }, (_, i) => generateLevelConfig(i + 1))
);

export function levelConfig(level) {
  const idx = Math.max(0, Math.min(LEVELS.length - 1, (level | 0) - 1));
  return LEVELS[idx];
}

// Seed Explorer: deterministically derive a full settings config from a single
// 32-bit `settingsSeed`. Mirrors generateLevelConfig's shape so createGame,
// serialization, and the menu can treat a seeded config exactly like a level
// config — but the ranges here are curated to stay playable (no degenerate
// 1-color or wall-of-blockers boards) while still feeling varied. The board
// itself comes from a *separate* boardSeed; this function only decides the
// rules. env/moon get gentle nudges so each variant has its own mood without
// wrecking readability.
export function seededConfig(settingsSeed) {
  // Same LCG generateLevelConfig uses, seeded off the explorer's settingsSeed.
  let s = (((settingsSeed >>> 0) || 1) * 2246822519 + 3266489917) >>> 0;
  const next = () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return (s & 0x7fffffff) / 2147483648;
  };

  // Colors 3..6 — center on 4-5 so matches stay findable.
  const cr = next();
  const colors = cr < 0.15 ? 3 : cr < 0.5 ? 4 : cr < 0.85 ? 5 : 6;

  // Starting rows 3..7.
  const rr = next();
  const initialRows = rr < 0.2 ? 3 : rr < 0.45 ? 4 : rr < 0.75 ? 5 : rr < 0.92 ? 6 : 7;

  // Descent pressure 5..12 (higher = more breathing room).
  const dr = next();
  const descentShots = dr < 0.12 ? 5 : dr < 0.32 ? 6 : dr < 0.55 ? 7 : dr < 0.72 ? 8 : dr < 0.85 ? 9 : dr < 0.95 ? 10 : 12;

  // ~35% timed (speed) mode — the minority so most variants are relaxed.
  const isSpeedMode = next() < 0.35;

  const packs = ['plain', 'bugs', 'flowers', 'dragons', 'random'];
  const stencilPack = packs[Math.min(packs.length - 1, Math.floor(next() * packs.length))];

  // Stone blockers on ~30% of variants, and never on the gentlest (3-color,
  // shallow) boards where they'd feel punishing.
  const hasBlockers = colors >= 4 && initialRows >= 4 && next() < 0.3;

  // Subtle ambience. windSpeed 0..0.9, glow 0.85..1.35, ripple 0.7..1.6.
  const env = {
    windSpeed: Math.round(next() * 0.9 * 100) / 100,
    windFrequency: 0.7 + Math.round(next() * 1.3 * 100) / 100,
    glowIntensity: 0.85 + Math.round(next() * 0.5 * 100) / 100,
    rippleSpeedScale: 0.7 + Math.round(next() * 0.9 * 100) / 100,
  };
  // Half the time pin the moon to a seeded phase/position for visual variety;
  // otherwise leave it live (-1).
  const moon = next() < 0.5
    ? { phase: Math.round(next() * 100) / 100, position: Math.round(next() * 100) / 100 }
    : { phase: -1, position: -1 };

  return { colors, initialRows, descentShots, isSpeedMode, stencilPack, hasBlockers, env, moon };
}

// Speed Mode Tuning parameters
export const SPEED_MODE_PROJECTILE_SPEED = 65;
export const SPEED_MODE_DESCENT_DRIFT_SPEED = 35;
export const SPEED_MODE_SETTLE_ANIM_SEC = 0.03;
export const SPEED_MODE_DESCENT_TIME_FACTOR = 1.5;
export const SPEED_MODE_FIRE_COOLDOWN = 0.15;

// ─── Combo powers (campaign/zen/speed) ───────────────────────────────────────
// Two combo-fed resources that turn the combo counter from a vanity number
// into the late-game's relief valve. They run in every freeplay mode —
// campaign, zen, and speed (where the time pressure makes the relief most
// valuable). Only puzzles opt out (see comboPowersActive), since they're
// hand-tuned for a fixed shot queue and a luck target.
//
//   Moonrise — a meter charged by the combo magnitude of each scoring shot.
//   Filling it banks a charge (cap moonriseMaxCharges). A banked charge is
//   spent automatically to CANCEL a descent, but only once the field has sunk
//   into the danger band near the water — so charges earned in the easy
//   mid-game become the lifeline that holds the line in the end game.
//
//   Moonburst — every moonburstStep consecutive scoring shots loads a special
//   shot. The next shot fired clears every lantern within moonburstRadius of
//   where it lands (color-blind, blockers included), blowing a hole in a
//   cramped board.
export const COMBO_POWERS = Object.freeze({
  moonriseFull: 110,       // meter units to bank one Moonrise charge. Tuned up
                           // from 80 so charges accrue more gradually — the
                           // mid-game no longer hands you a full bank of three
                           // before the end game asks for them.
  moonriseScoreDivisor: 12, // each scoring shot adds combo + total/this, so a
                            // big cluster or drop charges far faster than a
                            // string of small pops
  moonriseMaxCharges: 3,
  moonriseDangerRows: 4,   // auto-spend a charge to cancel a descent only when
                           // the lowest lantern is within this many rows of water
  moonburstStep: 5,        // every Nth combo loads a Moonburst shot
  moonburstRadius: 2.6,    // clear radius, in lantern-diameters, around impact
  moonGlowTiers: 10,       // combo at which the moon-bloom celebration saturates
});

// Performance and rendering optimizations configuration.
export const PERF_CONFIG = {
  // Controls whether hardware canvas shadowBlur is disabled on mobile/touch screens (pointer: coarse).
  // Set to true to fully disable shadow blur on mobile for massive rendering speedups.
  // Set to false to retain shadow blur on mobile despite potential thermal issues.
  disableMobileShadows: true,
};

// ─── Admin and Tuning overrides ──────────────────────────────────────────────
export const MOON_OVERRIDE = {
  phase: -1,     // -1 = live, 0..1 = synodic phase
  position: -1,  // -1 = live, 0..1 = traverse-cycle position
};

export const ENV_PARAMS = {
  windSpeed: 0.0,        // 0..2
  windFrequency: 1.0,    // 0.1..3
  glowIntensity: 1.0,    // 0..3
  rippleSpeedScale: 1.0, // 0.2..3
};

export const SYSTEM_OVERRIDES = {
  handedness: 'default', // 'default', 'left', 'right'
  perfMode: 'default',   // 'default', 'high', 'low'
};

export function updateTuningParam(key, value) {
  if (key === 'PROJECTILE_SPEED') PROJECTILE_SPEED = value;
  else if (key === 'DESCENT_DRIFT_SPEED') DESCENT_DRIFT_SPEED = value;
  else if (key === 'ADJACENCY_TOLERANCE') ADJACENCY_TOLERANCE = value;
  else if (key === 'COLLISION_TOLERANCE') COLLISION_TOLERANCE = value;
  else if (key === 'DESCENT_SHOTS') DESCENT_SHOTS = value;
}

export function getActivePackId() {
  if (typeof Arcade !== 'undefined' && Arcade.state) {
    return Arcade.state.get('stencilPack') || 'bugs';
  }
  return 'bugs';
}

