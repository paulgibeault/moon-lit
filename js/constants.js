export const GAME_ID = 'moon-glow';

export const COLORS = Object.freeze({
  red:    '#D9434A',
  orange: '#E89B4F',
  yellow: '#F2D26A',
  jade:   '#7AB89C',
  indigo: '#5A7AC9',
  white:  '#F4ECDA',
});

export const COLOR_KEYS = Object.freeze(Object.keys(COLORS));

export const PALETTE = Object.freeze({
  bgTop:        '#0E1538',
  bgBottom:     '#1B274D',
  moon:         '#F5E9C9',
  moonHalo:     '#E8B770',
  trellis:      '#8C6B3A',
  trellisKnot:  '#5C4322',
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
export const GRID = Object.freeze({
  cols: 8,
  initialRows: 5,
  maxRows: 13,
});

export const BOARD_MARGIN_TOP = 56;
export const BOARD_MARGIN_BOTTOM = 96;
export const BOARD_MARGIN_SIDE = 16;

// Bounce-lane width on each side of the lantern columns, in lantern diameters.
// Keeps the play area visibly wider than the lantern column extent so shots
// can curve past the rightmost/leftmost stack instead of bouncing flush.
export const LANE_LANTERNS = 1.0;

// Two lanterns are treated as adjacent (for matching / anchoring) when their
// centers are within (2 * radius * this factor). >1 forgives small float gaps.
export const ADJACENCY_TOLERANCE = 1.08;

export const TRELLIS_HEIGHT = 18;
export const DEAD_LINE_OFFSET = 36;
export const LAUNCHER_OFFSET_FROM_DEAD_LINE = 64;

export const PROJECTILE_SPEED = 720;        // px/sec
export const AIM_MIN_ANGLE = -85 * Math.PI / 180;
export const AIM_MAX_ANGLE =  85 * Math.PI / 180;

export const M3_DEFAULT_SEED = 0x4D6F6F6E;   // 'Moon' in ASCII; placeholder until M7

export const DESCENT_SHOTS = 6;
