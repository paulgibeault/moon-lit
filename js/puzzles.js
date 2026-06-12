// Hand-crafted puzzles for Moon Lit's Puzzle Mode.
//
// Every puzzle is verified solvable by tools/test-puzzles.js, which searches
// the full shot queue with the exact game physics and replays the found
// solution through the real game loop. Run it after editing ANY board here:
//
//   node tools/test-puzzles.js          # all puzzles
//   node tools/test-puzzles.js 12       # one puzzle, with solution detail
//
// Board notation (rows are trimmed before parsing, so leading spaces are
// purely cosmetic):
//   even rows: 8 tokens at nx = 0,2,4,...,14
//   odd rows:  7 tokens at nx = 1,3,5,...,13
//   R/O/Y/G/B/P = lantern colors, X = stone blocker (unmatchable, must be
//   dropped), T = target lantern (tinted targetColor), '.' = empty.
// Rows containing no letters sink the puzzle: the trellis (anchor line and
// physical ceiling) starts at the first real row — used by the late
// "pressure" puzzles that begin low over the water.
//
// Design language (what the solver taught us):
//   - Only the top row hangs from the trellis; everything else must chain to
//     it. Pop an anchor pair and its whole tail drops.
//   - A lantern hanging under a cluster shields the aim lanes past it —
//     hangers are walls. Leave one flank open on purpose, or don't.
//   - A pocket between a row-N lantern and a row-N+1 lantern two columns
//     over touches both: the "bridge" — one shot can join two families.
//   - Same-row groups 4 columns apart can only be bridged through a
//     pixel-perfect trellis needle. Never require it.
//   - In clear-all, a wasted shot parked on an anchored lantern is a loss;
//     parked on a doomed (hanging) structure it sinks with it.

import { COLOR_KEYS, COLORS } from './constants.js';

export const DEFAULT_CHAR_MAP = Object.freeze({
  'R': { color: 'red' },
  'O': { color: 'orange' },
  'Y': { color: 'yellow' },
  'G': { color: 'green' },
  'B': { color: 'blue' },
  'P': { color: 'paper' },

  // Blocker / Stone lanterns (unmatchable, must be dropped)
  'X': { color: 'paper', isBlocker: true, designId: 'flowers_bamboo' },

  // Target / Spirit lanterns (must be cleared to win)
  'T': { color: 'red', isTarget: true, designId: null }
});

// n rows of open sky — sinks the trellis for the pressure puzzles.
const SUNK = (n) => Array(n).fill('.');

const HAND_CRAFTED_PUZZLES = [

  // ── Chapter 1 · First Light — the festival fundamentals ──────────────────

  {
    id: 1,
    name: 'Yi Peng Path',
    description: 'Three pairs, three lanterns. Match each color directly.',
    colors: ['red', 'yellow', 'blue'],
    queue: ['red', 'yellow', 'blue'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      'R R . Y Y . B B',
    ],
  },
  {
    id: 2,
    name: 'Cut the Stem',
    description: 'The whole vine hangs from two green leaves. Snip them.',
    colors: ['green', 'orange', 'blue', 'yellow'],
    queue: ['green'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      '. . . G G . . .',
      ' . . . O . . . ',
      '. . . . B . . .',
      ' . . . Y . . . ',
    ],
  },
  {
    id: 3,
    name: 'Twin Wings',
    description: 'Each wing carries a green passenger. Clear both perches.',
    colors: ['blue', 'orange', 'green'],
    queue: ['blue', 'orange'],
    stencilPack: 'dragons',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      'B B . . . . O O',
      ' G . . . . . G ',
    ],
  },
  {
    id: 4,
    name: 'Lantern Heart',
    description: 'The heart guards its left side. Come in from the right.',
    colors: ['red', 'yellow'],
    queue: ['red'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      '. . . R R . . .',
      ' . . Y Y . . . ',
    ],
  },
  {
    id: 5,
    name: 'The Go-Between',
    description: 'One lantern can belong to two families — find the seat between them.',
    colors: ['yellow'],
    queue: ['yellow'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      '. . Y Y . Y . .',
      ' . . . . Y Y . ',
    ],
  },
  {
    id: 6,
    name: 'Paper Chandelier',
    description: 'Two pairs, two tails. Snuff both flames and the night goes quiet.',
    colors: ['red', 'blue', 'yellow'],
    queue: ['red', 'blue'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      '. R R . . B B .',
      ' Y . . . . . Y ',
      'Y . . . . . . Y',
    ],
  },

  // ── Chapter 2 · Golden Targets — clear the spirit lanterns ───────────────

  {
    id: 7,
    name: 'Spirit Lights',
    description: 'Only the glowing targets matter. Pop them directly.',
    colors: ['red', 'paper'],
    queue: ['red', 'red'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'red',
    introCard: 'targets',
    board: [
      'P P . T T . P P',
      ' . P . . . P . ',
    ],
  },
  {
    id: 8,
    name: 'Behind the Veil',
    description: 'The shield must fall before the spirits can be touched.',
    colors: ['green', 'blue', 'paper'],
    queue: ['blue', 'green'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'green',
    board: [
      'P P P T T P P P',
      ' . . B B B . . ',
    ],
  },
  {
    id: 9,
    name: 'Cut Lanterns Free',
    description: 'Spirits need not be matched. Cut the branch they hang from.',
    colors: ['red', 'paper'],
    queue: ['paper'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'red',
    board: [
      '. . . P P . . .',
      ' . . . T . . . ',
      '. . . . T . . .',
    ],
  },
  {
    id: 10,
    name: 'Off the Wall',
    description: 'The alcove opens only toward the river wall. Bounce in.',
    colors: ['red', 'paper'],
    queue: ['red'],
    stencilPack: 'dragons',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'red',
    board: [
      'P P P P P P P P',
      ' P P P P P . T ',
      '. . . . . P T .',
      ' . . . . . P . ',
    ],
  },
  {
    id: 11,
    name: 'Do No Harm',
    description: 'The spare lantern must rest where it blocks nothing.',
    colors: ['yellow', 'green', 'paper'],
    queue: ['green', 'yellow'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'yellow',
    moon: { phase: 0.4, position: 0.3 },
    board: [
      'P P . T . P . P',
      ' . . . . T . . ',
    ],
  },
  {
    id: 12,
    name: 'Falling Petals',
    description: 'Every petal hangs from the same yellow bough.',
    colors: ['yellow', 'red', 'paper'],
    queue: ['yellow'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'red',
    env: { windSpeed: 1.2, windFrequency: 1.4, glowIntensity: 1.6 },
    board: [
      '. . . Y Y . . .',
      ' . . P T . . . ',
      '. . T . . . . .',
      ' . T . . . . . ',
    ],
  },

  // ── Chapter 3 · Stone Lanterns — what cannot burn must sink ──────────────

  {
    id: 13,
    name: 'Stone Garden',
    description: 'Stones cannot be matched. Break their anchor and let them sink.',
    colors: ['green', 'paper'],
    queue: ['green'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    introCard: 'blockers',
    board: [
      '. . . G G . . .',
      ' . . . X . . . ',
      '. . . . X . . .',
    ],
  },
  {
    id: 14,
    name: 'Stone Curtain',
    description: 'The stones wall off the outer lanes. Slip through the middle seam.',
    colors: ['blue', 'orange', 'paper'],
    queue: ['blue', 'orange'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      '. B B . . O O .',
      ' X X . . . X X ',
    ],
  },
  {
    id: 15,
    name: 'The Stone Arch',
    description: 'The arch stands on two colored pillars. It falls with the second.',
    colors: ['red', 'yellow', 'paper'],
    queue: ['red', 'yellow'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      '. R R . . Y Y .',
      ' . . X X X . . ',
    ],
  },
  {
    id: 16,
    name: 'The Millstone',
    description: 'A wasted lantern must still sink. Rest it on what will fall.',
    colors: ['red', 'blue', 'paper'],
    queue: ['blue', 'red'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      '. . . R R . . .',
      ' . . X X . . . ',
      '. . X X . . . .',
    ],
  },
  {
    id: 17,
    name: 'Hanging by a Thread',
    description: 'Nine stones hang from a single green thread. Find its loose end.',
    colors: ['green', 'paper'],
    queue: ['green'],
    stencilPack: 'dragons',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      '. . . . . G G .',
      ' X X X X X . G ',
      '. X X . . . . .',
    ],
  },
  {
    id: 18,
    name: 'Atlas Sets Down the Sky',
    description: 'The stone sky rests on two shoulders. Relieve them both.',
    colors: ['red', 'blue', 'paper'],
    queue: ['red', 'blue'],
    stencilPack: 'dragons',
    descentType: 'none',
    goalType: 'clear-all',
    moon: { phase: 0.85, position: 0.5 },
    board: [
      '. R R . . B B .',
      ' . . X X X . . ',
      '. . . X X . . .',
    ],
  },

  // ── Chapter 4 · Deep Water — read the whole board first ──────────────────

  {
    id: 19,
    name: 'Shield and Spear',
    description: 'Two blue clusters pop — only one of them opens the path.',
    colors: ['green', 'blue', 'paper'],
    queue: ['blue', 'green'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'green',
    board: [
      '. . . T T . B B',
      ' . . B B B . . ',
    ],
  },
  {
    id: 20,
    name: 'Keystone',
    description: 'Six oranges, two families, one pocket that joins them all.',
    colors: ['orange', 'paper'],
    queue: ['orange'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      '. . O O . O . .',
      ' . P . . O O P ',
      '. P . . . . P .',
    ],
  },
  {
    id: 21,
    name: 'Switchback',
    description: 'Both alcoves open only toward the river walls.',
    colors: ['red', 'paper'],
    queue: ['red', 'red'],
    stencilPack: 'dragons',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'red',
    board: [
      'P P P P P P P P',
      ' T T P . P T T ',
      '. P P . . P P .',
    ],
  },
  {
    id: 22,
    name: 'Ash Before Ember',
    description: 'First a bed for the ash, then the veil, then the flame.',
    colors: ['orange', 'paper'],
    queue: ['orange', 'paper', 'orange'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      '. . . O O . . .',
      ' . . P P P . . ',
      '. . X X . . . .',
    ],
  },
  {
    id: 23,
    name: 'The Ferry Crossing',
    description: 'Blue opens green; green opens blue. Begin on the correct shore.',
    colors: ['green', 'blue'],
    queue: ['blue', 'green', 'green', 'blue'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    // Each pair is sealed behind a full shield of the other color: blue must
    // open the greens, green must open the blues. Parking anywhere safe is
    // impossible — every shot has exactly one productive use.
    board: [
      '. G G . . B B .',
      ' B B B . G G G ',
    ],
  },
  {
    id: 24,
    name: 'Three Locks',
    description: 'A bed for the spare, a red cork in the keyhole, and one seat that joins every yellow.',
    colors: ['yellow', 'red', 'paper'],
    queue: ['paper', 'red', 'yellow'],
    stencilPack: 'random',
    descentType: 'none',
    goalType: 'clear-all',
    // The red pair plugs the only pocket that bridges both yellow families.
    // Park the paper on the doomed stones, pull the cork, take the seat.
    // Popping either yellow family alone strands the other.
    board: [
      '. . Y Y . Y . .',
      ' . X . R Y Y . ',
      '. X . . R . . .',
    ],
  },

  // ── Chapter 5 · Night Pressure — the river rises ─────────────────────────

  {
    id: 25,
    name: 'The Sinking Trellis',
    description: 'The trellis slips with your shots. Three colors, no waste.',
    colors: ['red', 'yellow', 'blue'],
    queue: ['red', 'yellow', 'blue'],
    stencilPack: 'plain',
    descentType: 'shot',
    descentEvery: 2,
    goalType: 'clear-all',
    introCard: 'sinking',
    board: [
      ...SUNK(10),
      '. . R R . B B .',
      ' . . Y Y Y . . ',
    ],
  },
  {
    id: 26,
    name: 'Ember Rush',
    description: 'The river runs fast tonight. Five clusters before the water.',
    colors: ['red', 'yellow', 'blue', 'green'],
    queue: ['red', 'yellow', 'blue', 'green', 'green', 'red', 'yellow'],
    stencilPack: 'bugs',
    descentType: 'time',
    goalType: 'clear-all',
    introCard: 'timed',
    board: [
      ...SUNK(4),
      'R R . Y Y . B B',
      ' G G . . . G G ',
    ],
  },
  {
    id: 27,
    name: 'Midnight Cascade',
    description: 'Two anchors, two falling tails, and a clock made of water.',
    colors: ['red', 'blue', 'yellow'],
    queue: ['red', 'blue', 'red', 'blue'],
    stencilPack: 'dragons',
    descentType: 'time',
    goalType: 'clear-all',
    env: { glowIntensity: 2.0 },
    board: [
      ...SUNK(6),
      '. R R . . B B .',
      ' Y . . . . . Y ',
      '. Y . . . . Y .',
    ],
  },
  {
    id: 28,
    name: 'Stones in the River',
    description: 'Bed the spare on the stones — the trellis will not wait.',
    colors: ['red', 'blue', 'paper'],
    queue: ['blue', 'red'],
    stencilPack: 'bugs',
    descentType: 'shot',
    descentEvery: 1,
    goalType: 'clear-all',
    board: [
      ...SUNK(10),
      '. . . R R . . .',
      ' . . X X . . . ',
      '. . X X . . . .',
    ],
  },
  {
    id: 29,
    name: 'Last Light',
    description: 'Lift the veil and free the spirits before the moon sets.',
    colors: ['green', 'blue', 'paper'],
    queue: ['blue', 'green', 'green'],
    stencilPack: 'flowers',
    descentType: 'time',
    goalType: 'clear-targets',
    targetColor: 'green',
    moon: { phase: 0.07, position: 0.8 },
    board: [
      ...SUNK(5),
      'P P P T T P P P',
      ' . . B B B . . ',
    ],
  },
  {
    id: 30,
    name: 'Moonset',
    description: 'Everything you have learned, two rows above the water.',
    colors: ['yellow', 'red', 'paper'],
    queue: ['paper', 'red', 'yellow'],
    stencilPack: 'random',
    descentType: 'shot',
    descentEvery: 1,
    goalType: 'clear-all',
    env: { glowIntensity: 2.5, windSpeed: 1.5 },
    moon: { phase: 0.02, position: 0.5 },
    board: [
      ...SUNK(11),
      ' . . Y Y . . . ',
      '. . R R R . . .',
      ' X X . . . . . ',
    ],
  },
];

export const PUZZLE_COUNT = HAND_CRAFTED_PUZZLES.length;

export function puzzleConfig(puzzleId) {
  const id = puzzleId | 0;
  if (id >= 1 && id <= PUZZLE_COUNT) {
    return HAND_CRAFTED_PUZZLES[id - 1];
  }
  // Fallback to first puzzle
  return HAND_CRAFTED_PUZZLES[0];
}
