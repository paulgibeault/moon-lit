// Hand-crafted and generated puzzles for Moon Lit's Puzzle Mode.
// Support up to 50 puzzles initially, with room to add more in the future.

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

const HAND_CRAFTED_PUZZLES = [
  {
    id: 1,
    name: "Yi Peng Path",
    description: "Match colors directly to clear the line.",
    colors: ['red', 'yellow', 'blue'],
    queue: ['red', 'yellow', 'blue'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      "R R . Y Y . B B"
    ]
  },
  {
    id: 2,
    name: "Hanging Trellis",
    description: "Pop the anchor to drop the lower branches.",
    colors: ['orange', 'green', 'paper'],
    queue: ['orange'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      "O O . . . . . .",
      ". G G . . . .",
      ". . P P . . ."
    ]
  },
  {
    id: 3,
    name: "Twin Wings",
    description: "Clear left, then clear right.",
    colors: ['blue', 'orange', 'green'],
    queue: ['blue', 'orange'],
    stencilPack: 'dragons',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      "B B . . . . O O",
      " G G . . . G G "
    ]
  },
  {
    id: 4,
    name: "Riverside Rebound",
    description: "Bounce off the side wall to hit the yellow core.",
    colors: ['red', 'yellow'],
    queue: ['yellow'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      ". . Y Y . . . .",
      " . . R R R R . ",
      ". . R R R R R .",
      " . . R R R R . "
    ]
  },
  {
    id: 5,
    name: "Thread the Needle",
    description: "Shoot straight up the center gap to burst the ceiling.",
    colors: ['green', 'paper'],
    queue: ['green'],
    stencilPack: 'dragons',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      ". . . G G . . .",
      " G G . G G ",
      "P P P . . P P P",
      " P P . P P ",
      "P P P . . P P P"
    ]
  },
  {
    id: 6,
    name: "Lotus Target",
    description: "Pop or drop the target lanterns in the center.",
    colors: ['yellow', 'red', 'paper'],
    queue: ['yellow', 'red'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'red',
    board: [
      "P P T T T T P P",
      " P Y Y Y Y P ",
      "R R R . . R R R"
    ]
  },
  {
    id: 7,
    name: "Blocker Shield",
    description: "Shatter the anchors holding up the stony blockers.",
    colors: ['red', 'blue'],
    queue: ['red'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      ". . . R R . . .",
      " X . . X X . ",
      "B B B . . B B B"
    ]
  },
  {
    id: 8,
    name: "Bouncing Labyrinth",
    description: "Double-rebound to drop the blue maze.",
    colors: ['orange', 'blue'],
    queue: ['orange'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      "O O O . . . . .",
      "B . . . . . .",
      ". B B B B . . .",
      " . . . . . B ",
      ". . . B B B B B"
    ]
  },
  {
    id: 9,
    name: "Heart of Gold",
    description: "Free the target cluster locked inside the heart.",
    colors: ['yellow', 'red', 'paper'],
    queue: ['yellow', 'red', 'paper'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'red',
    board: [
      ". P P . . P P .",
      " P T T . T T P ",
      "P P T T T T P P",
      " P Y Y T T Y P ",
      "  . Y T T Y .  ",
      "   . Y Y . .   "
    ]
  },
  {
    id: 10,
    name: "The Stone Arch",
    description: "Break the blue foundations to drop the stone arch.",
    colors: ['blue', 'orange'],
    queue: ['blue'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      ". . B B . . . .",
      " X X . X X . ",
      "O O . . . O O O",
      " O . . . . O "
    ]
  },
  {
    id: 11,
    name: "Gale Force",
    description: "Aesthetic wind drifts the leaves, but target remains.",
    colors: ['red', 'yellow'],
    queue: ['red', 'yellow'],
    stencilPack: 'dragons',
    descentType: 'none',
    goalType: 'clear-all',
    env: { windSpeed: 2.0, windFrequency: 2.0, glowIntensity: 1.5 },
    board: [
      "R R R . . Y Y Y",
      " . . . . . . "
    ]
  },
  {
    id: 12,
    name: "Crescent Canopy",
    description: "Clear the target lanterns under a slim moon.",
    colors: ['green', 'orange', 'paper'],
    queue: ['green', 'orange'],
    stencilPack: 'bugs',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'red',
    moon: { phase: 0.15, position: 0.7 },
    board: [
      "G G . . . . O O",
      " T . . . . T ",
      "P . . . . . . P"
    ]
  },
  {
    id: 13,
    name: "Lotus Pond",
    description: "Supercharged firelight under the canopy. Target the center.",
    colors: ['yellow', 'blue', 'paper'],
    queue: ['blue', 'yellow'],
    stencilPack: 'flowers',
    descentType: 'none',
    goalType: 'clear-targets',
    targetColor: 'red',
    env: { glowIntensity: 3.0 },
    board: [
      ". . Y Y Y Y . .",
      " . T T T T . ",
      "B B B B B B B B"
    ]
  },
  {
    id: 14,
    name: "Midnight Cascade",
    description: "Rapid fire timed challenge! Clear before time runs out.",
    colors: ['red', 'yellow', 'blue'],
    queue: ['red', 'yellow', 'blue', 'red', 'yellow', 'blue'],
    stencilPack: 'dragons',
    descentType: 'time',
    goalType: 'clear-all',
    board: [
      "R R . Y Y . B B",
      " R . . Y . . B ",
      "R R . Y Y . B B"
    ]
  },
  {
    id: 15,
    name: "The Gateway",
    description: "Shatter the green ceiling to collapse the blocker gateway.",
    colors: ['paper', 'green'],
    queue: ['green'],
    stencilPack: 'plain',
    descentType: 'none',
    goalType: 'clear-all',
    board: [
      "G G G G G G G G",
      " X X . . X X ",
      "P P P . . P P P",
      " P P . . P P "
    ]
  }
];

// LCG random generator helper seeded by puzzle ID to create reproducible levels
function createLcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return (s & 0x7fffffff) / 2147483648;
  };
}

function generatePuzzle(id) {
  const rng = createLcg(id * 7919 + 104729);
  
  // Choose stencil pack
  const packs = ['plain', 'bugs', 'flowers', 'dragons', 'random'];
  const stencilPack = packs[Math.floor(rng() * packs.length)];
  
  // Decide descent type (15% chance of timed descent, otherwise none)
  const descentType = rng() < 0.15 ? 'time' : 'none';
  
  // Goal type (40% targets, 60% clear-all)
  const goalType = rng() < 0.40 ? 'clear-targets' : 'clear-all';
  
  // Environment overrides
  const env = {
    windSpeed: parseFloat((rng() * 1.5).toFixed(2)),
    windFrequency: parseFloat((0.5 + rng() * 1.5).toFixed(2)),
    glowIntensity: parseFloat((0.5 + rng() * 2.0).toFixed(2))
  };
  
  // Moon overrides
  const moon = {
    phase: parseFloat(rng().toFixed(2)),
    position: parseFloat(rng().toFixed(2))
  };

  // Determine active colors
  const colorCount = rng() < 0.35 ? 3 : rng() < 0.75 ? 4 : 5;
  const colors = COLOR_KEYS.slice(0, colorCount);

  // Decide target color if goal is clear-targets
  const targetColor = goalType === 'clear-targets' ? colors[Math.floor(rng() * colors.length)] : null;

  // Generate board pattern
  const rowCount = 4 + Math.floor(rng() * 3); // 4 to 6 rows
  const board = [];
  const colKeys = ['R', 'O', 'Y', 'G', 'B', 'P'].slice(0, colorCount);

  // Design layout based on template type (0..3)
  const templateType = Math.floor(rng() * 4);
  
  for (let r = 0; r < rowCount; r++) {
    const isOdd = r & 1;
    const cols = 8 - isOdd;
    let rowStr = "";
    
    for (let c = 0; c < cols; c++) {
      if (c > 0) rowStr += " ";
      
      // Determine what to place in this cell
      if (templateType === 0) {
        // Shield template: Blockers on lower rows, targets/colors at top
        if (r === 0) {
          rowStr += goalType === 'clear-targets' ? 'T' : colKeys[Math.floor(rng() * colKeys.length)];
        } else if (r === 1 || r === 2) {
          rowStr += rng() < 0.4 ? 'X' : colKeys[Math.floor(rng() * colKeys.length)];
        } else {
          rowStr += rng() < 0.75 ? colKeys[Math.floor(rng() * colKeys.length)] : '.';
        }
      } else if (templateType === 1) {
        // Triangle/V template
        const center = cols / 2;
        const distToCenter = Math.abs(c - center);
        if (distToCenter < r * 0.8) {
          rowStr += colKeys[Math.floor(rng() * colKeys.length)];
        } else {
          rowStr += '.';
        }
      } else if (templateType === 2) {
        // Double Wing template
        if (c < 2 || c >= cols - 2) {
          rowStr += colKeys[Math.floor(rng() * colKeys.length)];
        } else if (r === 0 && goalType === 'clear-targets') {
          rowStr += 'T';
        } else {
          rowStr += '.';
        }
      } else {
        // Checkerboard/Stripe template
        if ((r + c) % 2 === 0) {
          rowStr += colKeys[Math.floor(rng() * colKeys.length)];
        } else {
          rowStr += '.';
        }
      }
    }
    board.push(rowStr);
  }

  // Ensure there's at least one target if goalType is clear-targets
  if (goalType === 'clear-targets') {
    let hasTarget = false;
    for (const r of board) {
      if (r.includes('T')) {
        hasTarget = true;
        break;
      }
    }
    if (!hasTarget) {
      // Force top center to be target
      const r0Tokens = board[0].split(' ');
      r0Tokens[Math.floor(r0Tokens.length / 2)] = 'T';
      board[0] = r0Tokens.join(' ');
    }
  }

  // Generate solvable-ish queue
  const queueSize = descentType === 'time' ? 12 : 5 + Math.floor(rng() * 5); // 5 to 9 shots
  const queue = [];
  
  // Find which colors are actually on the board
  const boardColorsSet = new Set();
  const charToColor = { 'R': 'red', 'O': 'orange', 'Y': 'yellow', 'G': 'green', 'B': 'blue', 'P': 'paper', 'T': targetColor || 'red' };
  for (const row of board) {
    for (const char of row.split(' ')) {
      if (charToColor[char]) {
        boardColorsSet.add(charToColor[char]);
      }
    }
  }
  const boardColors = Array.from(boardColorsSet);
  const queueColors = boardColors.length > 0 ? boardColors : colors;

  for (let q = 0; q < queueSize; q++) {
    queue.push(queueColors[Math.floor(rng() * queueColors.length)]);
  }

  // Ensure targetColor has sufficient representation in clear-targets mode so it is solvable
  if (goalType === 'clear-targets' && targetColor) {
    const targetCount = queue.filter(c => c === targetColor).length;
    if (targetCount < 3) {
      let needed = 3 - targetCount;
      for (let i = queue.length - 1; i >= 0 && needed > 0; i--) {
        if (queue[i] !== targetColor) {
          queue[i] = targetColor;
          needed--;
        }
      }
    }
  }

  // Format naming
  const nameTemplates = [
    "Bamboo Whispers", "Loy Krathong Breeze", "River Glow", "Midnight Shadow",
    "Sumi-e Path", "Lantern Cascade", "Ember Dance", "Mid-Autumn Halo"
  ];
  const name = `${nameTemplates[Math.floor(rng() * nameTemplates.length)]} ${id}`;
  const description = goalType === 'clear-targets' 
    ? "Pop or drop only the golden target lanterns." 
    : "Clear the trellis of all floating paper lanterns.";

  return {
    id,
    name,
    description,
    colors,
    queue,
    stencilPack,
    descentType,
    goalType,
    targetColor,
    env,
    moon,
    board
  };
}

export function puzzleConfig(puzzleId) {
  const id = puzzleId | 0;
  if (id >= 1 && id <= 15) {
    return HAND_CRAFTED_PUZZLES[id - 1];
  } else if (id >= 16 && id <= 50) {
    return generatePuzzle(id);
  }
  // Fallback to first puzzle
  return HAND_CRAFTED_PUZZLES[0];
}
