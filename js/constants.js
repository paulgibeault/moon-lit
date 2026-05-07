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

export const GRID = Object.freeze({
  cols: 8,
  rows: 13,
  orientation: 'pointy-top',
  offset: 'odd-r',
});

export const BOARD_MARGIN_TOP = 56;
export const BOARD_MARGIN_BOTTOM = 96;
export const BOARD_MARGIN_SIDE = 16;

export const TRELLIS_HEIGHT = 18;
export const DEAD_LINE_OFFSET = 36;
export const LAUNCHER_OFFSET_FROM_DEAD_LINE = 64;

export const PROJECTILE_SPEED = 720;        // px/sec
export const AIM_MIN_ANGLE = -85 * Math.PI / 180;
export const AIM_MAX_ANGLE =  85 * Math.PI / 180;

export const M3_DEFAULT_SEED = 0x4D6F6F6E;   // 'Moon' in ASCII; placeholder until M7

export const DESCENT_SHOTS = 6;
