// Configuration for all paper-lantern stencil packs.
// Swapping packs will reload the images and re-rasterize the lanterns dynamically.

export const STENCIL_PACKS = {
  plain: {
    id: 'plain',
    name: 'Plain Paper',
    description: 'Clean paper lanterns with simple ambient glow.',
    sources: {}
  },
  bugs: {
    id: 'bugs',
    name: 'Insects Pack',
    description: 'Traditional woodblock insect sketches.',
    sources: {
      red:    'img/stencils/bugs/ant.png',
      orange: 'img/stencils/bugs/butterfly.png',
      yellow: 'img/stencils/bugs/dragonfly.png',
      green:  'img/stencils/bugs/mantis.png',
      blue:   'img/stencils/bugs/beetle.png',
      paper:  'img/stencils/bugs/moth.png',
    }
  },
  flowers: {
    id: 'flowers',
    name: 'Flora Pack',
    description: 'Beautiful sumi-e ink floral sketches.',
    sources: {
      red:    'img/stencils/flowers/lotus.png',
      orange: 'img/stencils/flowers/plum_blossom.png',
      yellow: 'img/stencils/flowers/marigold.png',
      green:  'img/stencils/flowers/orchid.png',
      blue:   'img/stencils/flowers/chrysanthemum.png',
      paper:  'img/stencils/flowers/bamboo.png',
    }
  },
  dragons: {
    id: 'dragons',
    name: 'Dragon Pack',
    description: 'Majestic Eastern ink dragon sketches.',
    sources: {
      red:    'img/stencils/dragons/fire_dragon.png',
      orange: 'img/stencils/dragons/flying_dragon.png',
      yellow: 'img/stencils/dragons/dragon_pearl.png',
      green:  'img/stencils/dragons/jade_dragon.png',
      blue:   'img/stencils/dragons/water_dragon.png',
      paper:  'img/stencils/dragons/dragon_head.png',
    }
  },
  random: {
    id: 'random',
    name: 'Random Mosaic',
    description: 'Randomized designs grouped by color, favoring plain.',
    sources: {}
  }
};

/**
 * ============================================================================
 * TEMPLATE & PROMPT GUIDE FOR CREATING NEW ICON SETS
 * ============================================================================
 * 
 * To add a new stencil pack to Moon Lit, follow this 3-step process:
 * 
 * ----------------------------------------------------------------------------
 * STEP 1: Generate the stencil images using Midjourney or DALL-E 3
 * ----------------------------------------------------------------------------
 * To match the hand-painted, sumi-e wash silhouette aesthetic, use the following
 * prompt template for each of your 6 design assets:
 * 
 *   "Clean high-contrast black ink sketch of a [SUBJECT], minimalist sumi-e style, 
 *    isolated on a solid pure white background, no gradients, no borders"
 * 
 * Recommended subjects for Loy Krathong, Mid-Autumn, or lantern themes:
 * - Constellations Pack: "crescent moon and stars", "polaris star map", "aquarius constellation"
 * - Origami Pack: "origami crane folded paper", "origami frog", "origami koi fish"
 * - Marine Life Pack: "koi fish swimming", "sea turtle silhouette", "jellyfish sketch"
 * 
 * ----------------------------------------------------------------------------
 * STEP 2: Save the assets in the img/ directory
 * ----------------------------------------------------------------------------
 * - Format: 512x512 PNG, RGB or RGBA, with the design in dark ink centered on
 *   a pure white background (RGB #FFF).
 * - Create a folder at: `img/stencils/[pack-id]/`
 * - Place your 6 images inside it (e.g. `img/stencils/my-pack/red.png`, etc.).
 * 
 * ----------------------------------------------------------------------------
 * STEP 3: Register your pack in this config file (STENCIL_PACKS)
 * ----------------------------------------------------------------------------
 * Add an entry to the STENCIL_PACKS object:
 * 
 *   [pack-id]: {
 *     id: '[pack-id]',
 *     name: '[Display Name]',
 *     description: '[Short subtitle describing the style]',
 *     sources: {
 *       red:    'img/stencils/[pack-id]/[image1].png',
 *       orange: 'img/stencils/[pack-id]/[image2].png',
 *       yellow: 'img/stencils/[pack-id]/[image3].png',
 *       green:  'img/stencils/[pack-id]/[image4].png',
 *       blue:   'img/stencils/[pack-id]/[image5].png',
 *       paper:  'img/stencils/[pack-id]/[image6].png',
 *     }
 *   }
 * 
 * The asset loading pipeline in assets.js and the menu view in menu.js will
 * automatically load and list your new pack in the game menu!
 */

// Deterministic stencil pick for the 'random' pack, keyed by a stable per-item
// value (board position / queue ordinal) instead of drawing from the gameplay
// RNG. Designs are purely cosmetic, so decoupling them this way keeps the board
// layout, blockers, and queue color sequence fully deterministic to the seed
// regardless of which stencil pack is active. Mirrors getRandomDesignForColor's
// ~40%-plain ratio and {bugs,flowers,dragons} spread.
export function designForCell(seed, key, color) {
  let h = (Math.imul(((seed >>> 0) ^ 0x9E3779B9), 0x85EBCA77) ^ (key >>> 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0xC2B2AE3D) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x27D4EB2F) >>> 0;
  h ^= h >>> 16;
  if ((h % 100) < 40) return null;
  const packs = ['bugs', 'flowers', 'dragons'];
  return `${packs[(h >>> 8) % packs.length]}_${color}`;
}

export function getRandomDesignForColor(color, rng) {
  if (!rng || typeof rng !== 'function') {
    // Fallback if rng is not provided/valid
    if (Math.random() < 0.40) return null;
    const packs = ['bugs', 'flowers', 'dragons'];
    const chosenPack = packs[Math.floor(Math.random() * packs.length)];
    return `${chosenPack}_${color}`;
  }
  
  if (rng() < 0.40) {
    return null;
  }
  const packs = ['bugs', 'flowers', 'dragons'];
  const chosenPack = packs[Math.floor(rng() * packs.length)];
  return `${chosenPack}_${color}`;
}

