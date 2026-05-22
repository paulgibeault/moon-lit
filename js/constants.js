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
export const ADJACENCY_TOLERANCE = 1.22;

// Scale factor for projectile-to-lantern collision checking. <1 allows the
// projectile to "sneak" through tight visual gaps slightly before registering
// a collision, reducing frustrating "snags" on nearby corners.
export const COLLISION_TOLERANCE = 0.95;


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
export const PROJECTILE_SPEED = 22;         // radii/sec
// Sized to one packed-row height (sqrt(3)*r) so the move reads as "shift
// down by one row" — about 0.20s per row at this value.
export const DESCENT_DRIFT_SPEED = 8.5;     // radii/sec
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

export const DESCENT_SHOTS = 6;

// Beginner-friendly opening curve. Stage 1 should be clearable on a
// cold-start playthrough with no instructions; later stages ramp toward
// the historical defaults (6 colors, 5 rows, descent every 6 shots).
// Stages beyond the table clamp to the last entry.
export const LEVELS = Object.freeze([
  { colors: 3, initialRows: 3, descentShots: 12 },
  { colors: 3, initialRows: 4, descentShots: 10 },
  { colors: 4, initialRows: 4, descentShots: 9  },
  { colors: 4, initialRows: 5, descentShots: 8  },
  { colors: 5, initialRows: 5, descentShots: 7  },
  { colors: 6, initialRows: 5, descentShots: 6  },
  { colors: 6, initialRows: 6, descentShots: 6  },
  { colors: 6, initialRows: 7, descentShots: 6  },
]);

export function levelConfig(level) {
  const idx = Math.max(0, Math.min(LEVELS.length - 1, (level | 0) - 1));
  return LEVELS[idx];
}
