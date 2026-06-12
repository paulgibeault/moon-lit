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
//
// Difficulty is tuned with tools/measure-difficulty.js, which reports each
// puzzle's blind-luck win probability (random fair pocket every shot) and
// per-shot viable-opening counts. Chapter 6 targets luck <= ~8%, Chapter 7
// targets <= ~4% (most below 1.5%); the campaign chapters sit anywhere up
// to 100% (tutorials should be forgiving).
//
// More solver-taught geometry (learned tuning Chapter 6):
//   - A shot's flight path is blocked by any lantern within 2 radii of the
//     line. Hangers spaced 4 columns apart leave a zero-width slit: pockets
//     behind them are pixel shots. Fair corridors need a 6-column mouth.
//   - Ceiling landings stick at the shot's own x, NOT snapped to grid
//     columns — a lantern can rest on the trellis touching nothing. Top-row
//     gap cells are therefore unreliable seats; never require one.
//   - In clear-all, popping a hanging structure can never strand anything —
//     drops only help. Strands come from popping ANCHORED families out of
//     order, so traps must be built from anchored bait.
//   - Parking on anything that eventually pops or drops is always safe; a
//     park only loses if it rests anchored (top row) or seals a needed lane.
//     "Find the one safe park" puzzles therefore don't exist; "spend every
//     shot productively" (zero-slack) puzzles do.
//
// Chapter 7 lessons (the cruelty set):
//   - SUNK(n) must keep n EVEN: an odd count flips row parity and every
//     8-token row silently re-parses as a 7-token odd row.
//   - Stones chain sideways: a skirt of adjacent stones is ONE hanging body,
//     and it survives if any link still touches something anchored. Leave
//     gaps wherever a skirt section must fall with its own family.
//   - Orphan singles (anchored, no same-color neighbor) can only leave via a
//     seam shot that joins them to a companion family — the strongest strand
//     trap available. Seams against the LEFT wall get fair windows; the
//     right-wall mirror lands off-lattice and touches nothing. A seam's top
//     contact face needs a pair (or wall) — a lone single above the seam
//     gives a sub-2 degree window.
//   - Tendrils (a family snaking along row 1) occupy every seat of the pair
//     beside them; popping the tendril vacates exactly those seats. This is
//     the clean way to force strict pop order in one color.
//   - Deep pressure boards: after descents, pockets below ~row 19 of the
//     fixture become unreachable or land in the water. Keep the final pop's
//     pocket on an open flank at most one row under the structure.

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

  // ── Chapter 6 · The Weaver's Knots — every lantern has one true home ──────
  //
  // The master set. No new mechanics — only composition: bridges that must be
  // taken in order, baits that pop big and lose bigger, parks with exactly one
  // safe bed, and queues with zero slack. Read the whole board, then shoot.

  {
    id: 31,
    name: 'Three Birds',
    description: 'Two families, one tail, one shot. Five wrong pops and one right one.',
    colors: ['yellow', 'paper'],
    queue: ['yellow'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    // A (left pair) and B (right L) bridge only at the center seam. Each
    // family carries a paper-and-yellow tail — popping either side alone
    // strands the other, and both dangling passengers are 2-cluster decoys.
    board: [
      '. . Y Y . Y . .',
      ' . P . . Y . . ',
      '. Y . . . P Y .',
    ],
  },
  {
    id: 32,
    name: 'False Feast',
    description: 'The lowest fruit is the bait. Cut the branch it grew from.',
    colors: ['red', 'paper'],
    queue: ['red', 'red'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-all',
    // The fat red triangle at the bottom begs to be popped — and popping it
    // wastes the stone above it. Pop the anchor pair instead and the whole
    // chain sinks; the right pair and its stones need the other shot.
    board: [
      '. R R . . . R R',
      ' . . X . . . X ',
      '. . R R . . . X',
      ' . . R . . . . ',
    ],
  },
  {
    id: 33,
    name: 'Toll Gate',
    description: 'The spare coin must rest on the stones — and off the road.',
    colors: ['red', 'paper'],
    queue: ['paper', 'red'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-all',
    // The paper spare has to bed on the doomed stone tail without sealing
    // either flank seat of the red pair.
    board: [
      '. . . R R . . .',
      ' . . . X . . . ',
      '. . . . X . . .',
    ],
  },
  {
    id: 34,
    name: 'The Ferry Returns',
    description: 'The same crossing, but the river has grown stones.',
    colors: ['green', 'blue', 'paper'],
    queue: ['blue', 'green', 'green', 'blue'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    // Ferry Crossing with stone ballast under each shield: the stones sink
    // with their shields, but they wall off the low pockets, and every shot
    // still has exactly one productive use.
    board: [
      '. G G . . B B .',
      ' B B B . G G G ',
      '. X . . . . X .',
    ],
  },
  {
    id: 35,
    name: 'The Keyhole',
    description: 'A fortress with one red cork. Pull it, then thread the lock.',
    colors: ['red', 'green', 'paper'],
    queue: ['red', 'green'],
    stencilPack: 'dragons',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'green',
    // The spirits hang in a sealed vault: paper above, paper cheeks beside,
    // and a red cork wearing a paper skirt plugging the only shaft. Pull the
    // cork — the skirt falls with it — then send the green up the shaft.
    board: [
      'P P P P P P P P',
      ' P P T T P P P ',
      '. P . . P . . .',
      ' . R R R . . . ',
      '. P P P . . . .',
    ],
  },
  {
    id: 36,
    name: 'Cold Hearth',
    description: 'Three flames, three hearths — and the middle hearth is walled in.',
    colors: ['blue', 'green', 'paper'],
    queue: ['blue', 'green', 'blue'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-all',
    // The right blue pair is sealed behind the green wall, so the first blue
    // must burn the far bait and sink its stone. Green opens the hearth, and
    // the last blue takes it. Zero slack: every park is a loss.
    board: [
      '. B B . G B B .',
      ' . X . . G G G ',
    ],
  },
  {
    id: 37,
    name: 'The Procession',
    description: 'Three shrines, three veils, six lanterns. One order of service.',
    colors: ['red', 'green', 'blue'],
    queue: ['green', 'blue', 'red', 'red', 'green', 'blue'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    // A triple ferry: each anchored pair wears a veil of the next color.
    // Every shot in the queue has exactly one shrine it can serve.
    board: [
      'R R . G G . B B',
      ' G G . B B R R ',
    ],
  },
  {
    id: 38,
    name: 'Hungry Ghosts',
    description: 'Two spirits, two perches, and a feast laid out to tempt you.',
    colors: ['green', 'yellow'],
    queue: ['green', 'yellow'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'yellow',
    // Two green pairs — only the right one carries a spirit. The yellow pair
    // under the left perch is a feast for wasted shots: the second spirit
    // pops only with its corner companion.
    board: [
      'Y . G G . . G G',
      ' T . Y Y . T . ',
    ],
  },
  {
    id: 39,
    name: 'The Ninth Wave',
    description: 'Park, pull, thread — one row above the rising water.',
    colors: ['yellow', 'red', 'paper'],
    queue: ['paper', 'red', 'yellow'],
    stencilPack: 'random',
    descentType: 'shot',
    descentEvery: 1,
    goalType: 'clear-all',
    env: { glowIntensity: 2.0, windSpeed: 1.3 },
    moon: { phase: 0.12, position: 0.6 },
    // The red pair corks the needle between the yellow families and carries
    // the stone. Park low and the descent drowns you; park high and the
    // trellis keeps your coin forever.
    board: [
      ...SUNK(14),
      '. . Y Y . Y Y .',
      ' . . . R R . . ',
      '. . . . X . . .',
    ],
  },
  {
    id: 40,
    name: "The Weaver's Knot",
    description: 'Four shots, four duties, and a single seam holding the night together.',
    colors: ['yellow', 'blue', 'red', 'paper'],
    queue: ['paper', 'blue', 'red', 'yellow'],
    stencilPack: 'random',
    descentType: 'shot',
    descentEvery: 2,
    goalType: 'clear-all',
    env: { glowIntensity: 2.2, windSpeed: 1.4 },
    moon: { phase: 0.04, position: 0.5 },
    // Everything at once: the paper beds on the hanging stone, the blue
    // clears the wall, the red pulls the cork out of the one seam that joins
    // both yellow families, and the last yellow takes the vacated seat.
    // One true home per shot.
    board: [
      ...SUNK(12),
      '. . Y Y . Y Y .',
      ' . B B R Y . . ',
      '. . . . R . . .',
      ' . . . . X . . ',
    ],
  },

  // ── Chapter 7 · The Moonless Hour — no light but your own ────────────────
  //
  // The cruelty set. New trap species: orphan singles that can only pop with
  // a companion (strand them and the night is lost), poisoned bridge seats
  // that pop five and lose, tendrils whose pop vacates the only seats of the
  // family beside them, nested corks, and water that swallows low parks.

  {
    id: 41,
    name: 'The Orphan',
    description: 'Three yellow families, two shots — and one of them cannot stand alone.',
    colors: ['yellow', 'paper'],
    queue: ['yellow', 'yellow'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    // The corner yellow pops only through the wall seam it shares with the
    // middle family. The center seat joins middle and right — five lanterns
    // popped, and a stranded orphan. Take the wall seam first: the middle
    // family leaves, and the poisoned center seat becomes the right
    // family's only honest seat.
    board: [
      'Y . Y . Y . . .',
      ' . Y . Y X . . ',
      '. . . . X . . .',
    ],
  },
  {
    id: 42,
    name: 'Double Lock',
    description: 'Two corks in one shaft. The red one comes out first.',
    colors: ['red', 'blue', 'green', 'paper'],
    queue: ['red', 'blue', 'green'],
    stencilPack: 'dragons',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'green',
    // The vault from The Keyhole, locked twice: a red outer cork wearing the
    // paper skirt, a blue inner cork above it, and only then the shaft to
    // the spirits. Each color has exactly one duty.
    board: [
      'P P P P P P P P',
      ' P P T T P P P ',
      '. P . . P . . .',
      ' P B B B P . . ',
      '. . R R R . . .',
      ' . . P P P . . ',
    ],
  },
  {
    id: 43,
    name: 'Drowned Bell',
    description: 'Three bells over the flood. Park beside them, never below them.',
    colors: ['yellow', 'blue', 'paper'],
    queue: ['paper', 'blue', 'blue', 'yellow'],
    stencilPack: 'bugs',
    descentType: 'shot',
    descentEvery: 1,
    goalType: 'clear-all',
    env: { glowIntensity: 1.8, windSpeed: 1.2 },
    // Three descents come before the last shot, so every bed below the
    // bells' own row drowns. The spare must rest in a bell's unused seat,
    // and the stone keeps the yellow seats narrow until the end.
    board: [
      ...SUNK(14),
      '. Y Y . B B . B',
      ' . X . . . . B ',
      '. X . . . . B .',
    ],
  },
  {
    id: 44,
    name: 'The Vine',
    description: 'Four duties on one stem. Prune from the root outward.',
    colors: ['blue', 'red', 'yellow', 'paper'],
    queue: ['blue', 'red', 'blue', 'yellow'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-all',
    // A red tendril crawls along the second row, sitting in every seat of
    // the blue pair beside it; the blue vine on the left sits in the
    // tendril's seats, and the stones skirt the rest. Each pop vacates
    // exactly the seats the next shot needs.
    board: [
      'B B R R B B Y Y',
      ' X B B R R R X ',
      '. . . X X . . .',
    ],
  },
  {
    id: 45,
    name: 'The Poisoned Seat',
    description: 'The seat that joins two families betrays the third.',
    colors: ['green', 'blue', 'paper'],
    queue: ['green', 'blue', 'green'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    // A go-between seat sits between the two green families — and taking it
    // pops them both, stranding the corner orphan whose only companion just
    // left. One family at a time, and the orphan goes with its neighbor.
    board: [
      'G . G . G . B B',
      ' . G . G . . X ',
      '. . . X . . . .',
    ],
  },
  {
    id: 46,
    name: 'The Inner Gate',
    description: 'A red gate before the green cork, and the vault behind both.',
    colors: ['red', 'green', 'paper'],
    queue: ['red', 'green', 'green'],
    stencilPack: 'dragons',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'green',
    // The cork is green this time, flush against the left wall — and its
    // only open seats are held by the red gate pair. Topple the gate, pull
    // the cork, thread the shaft.
    board: [
      'P P P P P P P P',
      ' P P T T P P P ',
      'P P . . P . . .',
      ' G G G R . . . ',
      'P P P R . . . .',
    ],
  },
  {
    id: 47,
    name: 'Twin Rivers',
    description: 'Two loners on two shores, and no shot to spare between them.',
    colors: ['yellow', 'red', 'paper'],
    queue: ['yellow', 'red'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-all',
    // Two orphans: the corner yellow pops only through the wall seam, the
    // inland red only through the seam beside its family. Popping a family
    // alone strands its loner; parking on the far seam seals the other
    // color's only seat.
    board: [
      'Y . Y R . R . .',
      ' . Y . . R . . ',
    ],
  },
  {
    id: 48,
    name: 'The Last Pillar',
    description: 'The red pillar sits in every seat the far family owns.',
    colors: ['yellow', 'red', 'paper'],
    queue: ['yellow', 'red', 'yellow'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-all',
    // The right yellow pair is sealed: a red tendril in two of its seats, a
    // stone in the third. Clear the left pair, topple the pillar, and take
    // the seats it vacates. Stones skirt every shortcut.
    board: [
      'Y Y R R . Y Y .',
      ' . . . R R R X ',
      '. . . X X . . .',
    ],
  },
  {
    id: 49,
    name: "Widow's Lantern",
    description: 'One seam, one bed, one breath above the water.',
    colors: ['yellow', 'paper'],
    queue: ['yellow', 'paper', 'yellow'],
    stencilPack: 'random',
    descentType: 'shot',
    descentEvery: 1,
    goalType: 'clear-all',
    env: { glowIntensity: 2.0, windSpeed: 1.4 },
    moon: { phase: 0.08, position: 0.3 },
    // The Orphan again, sinking this time. The wall seam pops the loner and
    // her companion; the spare beds on the right family's stones without
    // sealing its one seat; the last yellow takes that seat. Low beds drown.
    board: [
      ...SUNK(14),
      'Y . Y . Y . . .',
      ' . Y . Y X . . ',
      '. . . . X . . .',
    ],
  },
  {
    id: 50,
    name: 'The Moonless Hour',
    description: 'Five shots, five duties, and the river rising under all of them.',
    colors: ['blue', 'red', 'yellow', 'paper'],
    queue: ['blue', 'red', 'blue', 'paper', 'yellow'],
    stencilPack: 'random',
    descentType: 'shot',
    descentEvery: 2,
    goalType: 'clear-all',
    env: { glowIntensity: 2.5, windSpeed: 1.6 },
    moon: { phase: 0.01, position: 0.5 },
    // Everything the night has taught: the blue vine first, then the red
    // tendril whose pop opens the blue pair, a bed for the spare on the
    // stones that only the last pop releases, and the yellow wall seat that
    // stays open for the end. The trellis slips twice along the way.
    board: [
      ...SUNK(14),
      'B B R R B B Y Y',
      ' . . . R R X X ',
      '. . . X X . . .',
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
