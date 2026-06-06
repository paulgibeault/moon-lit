// Rasterizes the SVG lantern markup from lantern-svg.js to offscreen canvases
// at startup so per-frame drawing is a plain drawImage. Each canvas is then
// alpha-bbox measured so the renderer can crop transparent margin and draw the
// lamp at a size driven by its painted silhouette, not the rasterizer canvas.

import { COLOR_KEYS } from './constants.js';
import { buildLanternSvg, LANTERN_SVG_VIEWBOX } from './lantern-svg.js';
import { STENCIL_PACKS } from './stencil-packs.js';

// Raster resolution. 2x oversample of the SVG viewBox so the lamp stays crisp
// when scaled to most viewport sizes (lantern radius typically peaks around
// ~64px = 128px diameter; rasterizing at 200px width gives headroom).
const RASTER_SCALE = 2;

// Horizontal flipbook for the match-pop burst. The sheet is BURST_FRAMES wide
// and one frame tall; each frame is a square of size `sheet.height`.
const BURST_SRC = 'img/lantern-burst.png';
let burstSheet = null;

// Horizontal flipbook for the hub flame at the wheel axis. Hand-painted source
// has 8 frames laid out in a row, non-square (artist gave each cell horizontal
// room for flicker drift), so we compute frame width explicitly from the
// declared frame count instead of inferring it from height.
const FLAME_SRC = 'img/flame-sprite.png';
const FLAME_FRAMES = 8;
let flameSheet = null;

const BUG_STENCIL_OPACITY = 0.55;


// Bamboo silhouette sprite library. Source PNGs are black-on-white at modest
// resolution; loadBambooSprites() bakes each to a tinted alpha silhouette and
// crops to its painted bbox so the renderer can place them by anchor without
// guessing margins. Categorized so the renderer can pick stalks vs. clusters
// vs. accent leaves independently — stalks form the trunk, clusters add
// midground volume, leaves are fine accents.
const BAMBOO_SOURCES = {
  // Full-height bamboo with natural leaf branches at varied heights — the
  // primary foreground framing element.
  tall: [
    'img/bamboo-tall-a.png',
    'img/bamboo-tall-b.png',
    'img/bamboo-tall-c.png',
  ],
  // Bare tileable cane segments — no leaves, designed to stack vertically.
  // Used for slim background trunks where the foliage from the `tall` pool
  // would compete with the play area.
  cane: [
    'img/bamboo-cane-tall.png',
    'img/bamboo-cane-short.png',
  ],
  // Bamboo base with grass — anchors the bottom of a cane stack so the trunk
  // doesn't read as floating or chopped off at the waterline.
  base: [
    'img/bamboo-base-a.png',
    'img/bamboo-base-b.png',
  ],
  // Bamboo culm tips — natural tapering crowns that slot on top of cane
  // stacks. Each shows a trunk extending off the BOTTOM edge (to match cane
  // tile-ability) with a whippy curving tip reaching above varied leaf
  // branches. Used as the topper when present (replaces the cluster cap).
  tip: [
    'img/bamboo-tip-a.png',
    'img/bamboo-tip-b.png',
    'img/bamboo-tip-c.png',
  ],
  // Smaller leafy branch sprites — used as midground/foreground accents.
  stalk: [
    'img/bamboo-stalk-a.png',
    'img/bamboo-stalk-b.png',
  ],
  // Detached leaf clusters for corner accents and additional foliage volume.
  cluster: [
    'img/bamboo-cluster-dense.png',
    'img/bamboo-cluster-multi.png',
    'img/bamboo-cluster-wide.png',
    'img/bamboo-cluster-fan.png',
  ],
  // Single leaf for fine particle/accent use.
  leaf: [
    'img/bamboo-leaf-single.png',
  ],
};
// Brightness above this counts as "background" and goes fully transparent;
// below the OPAQUE threshold stays at full silhouette alpha; between them we
// ramp so brush-stroke greys read as translucent dark instead of hard edges.
const BAMBOO_TRANSPARENT_AT = 235;
const BAMBOO_OPAQUE_BELOW   = 60;
// Tint the silhouette pixels to a deep night-indigo so they composite over
// the sky gradient as bamboo-in-shadow rather than pure black ink.
const BAMBOO_TINT = [10, 18, 48];
const bambooSprites = { tall: [], cane: [], base: [], tip: [], stalk: [], cluster: [], leaf: [] };

// Moon surface texture. Optional — the renderer falls back to a flat warm
// disc if the file is missing. Source is expected to be a square image; the
// renderer samples it inside a circular clip with a warm overlay so the moon
// stays harmonized with the night palette regardless of source color cast.
const MOON_TEXTURE_SRC = 'img/moon.png';
let moonTexture = null;

// Pixel below this alpha is treated as transparent margin when measuring bbox.
const ALPHA_THRESHOLD = 8;

const sprites = {};
let plainCanvases = {};
let plainBboxes = {};
let stencilImages = {};
let stencilCache = {};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

// Returns { sx, sy, sw, sh } of the smallest rect covering all pixels with
// alpha >= ALPHA_THRESHOLD. Falls back to the full image if the scan fails
// (e.g. cross-origin canvas tainting — shouldn't happen for local files).
function measureBbox(image) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d');
  cx.drawImage(image, 0, 0);
  let data;
  try {
    data = cx.getImageData(0, 0, w, h).data;
  } catch (_) {
    return { sx: 0, sy: 0, sw: w, sh: h };
  }
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] >= ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { sx: 0, sy: 0, sw: w, sh: h };
  return { sx: minX, sy: minY, sw: maxX - minX + 1, sh: maxY - minY + 1 };
}

function record(key, image, bbox) {
  sprites[key] = { image, ...bbox };
}

async function rasterizeSvg(svg, width, height) {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('svg rasterize failed'));
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    c.getContext('2d').drawImage(img, 0, 0, width, height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadLanterns() {
  const w = LANTERN_SVG_VIEWBOX.w * RASTER_SCALE;
  const h = LANTERN_SVG_VIEWBOX.h * RASTER_SCALE;

  const activePackId = Arcade.state.get('stencilPack') || 'bugs';
  const pack = STENCIL_PACKS[activePackId] || STENCIL_PACKS.bugs;
  
  // Clear old cached sprites and stencil/canvas caches
  for (const key of Object.keys(sprites)) {
    if (key !== 'launcher_wheel') {
      delete sprites[key];
    }
  }
  stencilImages = {};
  plainCanvases = {};
  plainBboxes = {};
  stencilCache = {};
  
  // Collect all designs from bugs, flowers, dragons packs
  const allDesigns = [];
  for (const [packId, p] of Object.entries(STENCIL_PACKS)) {
    if (packId === 'random' || packId === 'plain') continue;
    if (p.sources) {
      for (const [colorKey, src] of Object.entries(p.sources)) {
        if (src) {
          allDesigns.push({
            designId: `${packId}_${colorKey}`,
            src,
            packId
          });
        }
      }
    }
  }

  // Load stencil images
  if (activePackId === 'random') {
    await Promise.all(
      allDesigns.map(async (d) => {
        try {
          stencilImages[d.designId] = await loadImage(d.src);
        } catch (e) {
          console.warn(`[moon-lit] failed to load stencil ${d.src} for ${d.designId}`, e);
        }
      })
    );
  } else {
    const stencilSources = pack.sources || {};
    await Promise.all(
      Object.entries(stencilSources).map(async ([color, src]) => {
        if (!src) return; // skip plain paper / no stencil
        try {
          stencilImages[color] = await loadImage(src);
        } catch (e) {
          console.warn(`[moon-lit] failed to load stencil ${src} for ${color}`, e);
        }
      })
    );
  }

  await Promise.all(
    COLOR_KEYS.map(async (colorKey) => {
      plainCanvases[colorKey] = await rasterizeSvg(buildLanternSvg(colorKey), w, h);
      plainBboxes[colorKey] = measureBbox(plainCanvases[colorKey]);
    })
  );

  function copyCanvas(srcCanvas) {
    const dst = document.createElement('canvas');
    dst.width = srcCanvas.width;
    dst.height = srcCanvas.height;
    dst.getContext('2d').drawImage(srcCanvas, 0, 0);
    return dst;
  }

  if (activePackId === 'random') {
    // 1. Record plain paper versions (recorded as sprites[colorKey])
    for (const colorKey of COLOR_KEYS) {
      record(colorKey, plainCanvases[colorKey], plainBboxes[colorKey]);
    }
    // 2. Pre-rasterize all color + stencil combinations (normal and golden) to avoid runtime stutters
    const packs = ['bugs', 'flowers', 'dragons'];
    for (const colorKey of COLOR_KEYS) {
      for (const packId of packs) {
        const designId = `${packId}_${colorKey}`;
        rasterizeSingleLantern(colorKey, designId, false);
        rasterizeSingleLantern(colorKey, designId, true);
      }
    }
  } else {
    // Standard pack logic (original flow, but optimized with stencil caching and bbox reuse)
    for (const colorKey of COLOR_KEYS) {
      const plainCanvas = plainCanvases[colorKey];
      const stencilImg = stencilImages[colorKey];

      // Normal version
      {
        const canvas = copyCanvas(plainCanvas);
        if (stencilImg) {
          const stencil = getStencil(colorKey, stencilImg, false);
          const ctx = canvas.getContext('2d');
          ctx.save();
          ctx.globalCompositeOperation = 'source-atop';

          const cx = 50 * RASTER_SCALE;
          const cy = 65 * RASTER_SCALE;
          const d = 56 * RASTER_SCALE;
          const offsetY = 5 * RASTER_SCALE;

          const opacity = activePackId === 'flowers' ? 0.85 : BUG_STENCIL_OPACITY;
          ctx.globalAlpha = opacity;
          ctx.drawImage(stencil, cx - d/2, cy - d/2 + offsetY, d, d);
          ctx.restore();
        }
        record(colorKey, canvas, plainBboxes[colorKey]);
      }

      // Golden version
      {
        const canvas = copyCanvas(plainCanvas);
        if (stencilImg) {
          const stencil = getStencil(colorKey, stencilImg, true);
          const ctx = canvas.getContext('2d');
          ctx.save();
          ctx.globalCompositeOperation = 'source-atop';

          const cx = 50 * RASTER_SCALE;
          const cy = 65 * RASTER_SCALE;
          const d = 56 * RASTER_SCALE;
          const offsetY = 5 * RASTER_SCALE;

          const opacity = activePackId === 'flowers' ? 0.85 : BUG_STENCIL_OPACITY;
          ctx.globalAlpha = opacity;
          ctx.drawImage(stencil, cx - d/2, cy - d/2 + offsetY, d, d);
          ctx.restore();
        }
        record(`${colorKey}_golden`, canvas, plainBboxes[colorKey]);
      }
    }
  }
  try {
    const img = await loadImage(BURST_SRC);
    const frameSize = img.naturalHeight || img.height;
    const frames = Math.max(1, Math.round((img.naturalWidth || img.width) / frameSize));
    burstSheet = { image: img, frameSize, frames };
  } catch (e) {
    burstSheet = null;
  }
  try {
    const img = await loadImage(FLAME_SRC);
    const sheetW = img.naturalWidth  || img.width;
    const sheetH = img.naturalHeight || img.height;
    // Source PNG paints flames on a solid black field. Luminance-key it: each
    // pixel's brightest channel becomes its alpha, so black → transparent and
    // the painter's bronze/cream gradients keep their full hue when drawn with
    // ordinary source-over (no 'lighter' wash, no grey AA halo bleeding onto
    // the wheel). Done once at load; per-frame draws stay as plain drawImage.
    const baked = document.createElement('canvas');
    baked.width = sheetW;
    baked.height = sheetH;
    const bctx = baked.getContext('2d');
    bctx.drawImage(img, 0, 0);
    const px = bctx.getImageData(0, 0, sheetW, sheetH);
    const d = px.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      d[i + 3] = r > g ? (r > b ? r : b) : (g > b ? g : b);
    }
    bctx.putImageData(px, 0, 0);
    flameSheet = {
      image: baked,
      frames: FLAME_FRAMES,
      frameW: sheetW / FLAME_FRAMES,
      frameH: sheetH,
    };
  } catch (e) {
    flameSheet = null;
  }
}

export function getFlameSheet() {
  return flameSheet;
}

function rasterizeSingleLantern(colorKey, designId, isGolden) {
  const plainCanvas = plainCanvases[colorKey];
  if (!plainCanvas) return null;

  const stencilImg = stencilImages[designId];
  if (!stencilImg) return sprites[colorKey] || null;

  const key = isGolden ? `${colorKey}_${designId}_golden` : `${colorKey}_${designId}`;

  const dst = document.createElement('canvas');
  dst.width = plainCanvas.width;
  dst.height = plainCanvas.height;
  const ctx = dst.getContext('2d');
  ctx.drawImage(plainCanvas, 0, 0);

  const stencil = getStencil(designId, stencilImg, isGolden);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';

  const cx = 50 * RASTER_SCALE;
  const cy = 65 * RASTER_SCALE;
  const dSize = 56 * RASTER_SCALE;
  const offsetY = 5 * RASTER_SCALE;

  const packId = designId.split('_')[0];
  const opacity = packId === 'flowers' ? 0.85 : BUG_STENCIL_OPACITY;
  ctx.globalAlpha = opacity;
  ctx.drawImage(stencil, cx - dSize/2, cy - dSize/2 + offsetY, dSize, dSize);
  ctx.restore();

  record(key, dst, plainBboxes[colorKey] || measureBbox(dst));
  return sprites[key];
}

export function getLanternSprite(colorKey, designId = null, isSpecial = false) {
  if (isSpecial) {
    if (designId) {
      const key = `${colorKey}_${designId}_golden`;
      if (sprites[key]) return sprites[key];
      const sprite = rasterizeSingleLantern(colorKey, designId, true);
      if (sprite) return sprite;
    }
    const key = `${colorKey}_golden`;
    if (sprites[key]) return sprites[key];
  } else {
    if (designId) {
      const key = `${colorKey}_${designId}`;
      if (sprites[key]) return sprites[key];
      const sprite = rasterizeSingleLantern(colorKey, designId, false);
      if (sprite) return sprite;
    }
  }
  return sprites[colorKey] || null;
}

export function getBurstSheet() {
  return burstSheet;
}

// Converts a silhouette source image into a tinted, alpha-masked offscreen
// canvas. Handles two source-encoding conventions:
//
//   RGB sources (older bamboo sprites): solid white background, dark
//   silhouette. We derive alpha from brightness — white pixels become
//   transparent, dark pixels become opaque, greys ramp.
//
//   RGBA sources (new bamboo sprites — cane, base, tall, tip): transparent
//   background, painted silhouette with anti-aliased edges AND artistic
//   white highlights inside the silhouette (e.g., reflective node bands on
//   the cane). For these we trust the source alpha channel — using
//   brightness would wrongly transparentize the interior white highlights
//   and leave visible "splits" through the bamboo trunk.
//
function getStencil(stencilKey, img, isGolden = false) {
  const key = `${stencilKey}_${isGolden}`;
  if (!stencilCache[key]) {
    stencilCache[key] = makeBugStencil(img, isGolden);
  }
  return stencilCache[key];
}

// Converts a black-on-white bug drawing into a black stencil with transparent background,
// where brightness determines transparency (white -> transparent, black -> opaque).
function makeBugStencil(img, isGolden = false) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  let imgData;
  try {
    imgData = cx.getImageData(0, 0, w, h);
  } catch (_) {
    return c;
  }
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    const brightness = (r + g + b) / 3;
    // Derive alpha: white background (255) -> 0 alpha, dark lines (0) -> 255 alpha (boosted by 1.8x for visibility)
    d[i+3] = Math.min(255, Math.round((255 - brightness) * 1.8));
    if (isGolden) {
      d[i] = 255;
      d[i+1] = 195;
      d[i+2] = 45;
    } else {
      // Make the stencil color completely black
      d[i] = 0;
      d[i+1] = 0;
      d[i+2] = 0;
    }
  }
  cx.putImageData(imgData, 0, 0);
  return c;
}

// Detection: any near-corner pixel with alpha < 255 → RGBA. Otherwise RGB.
function bakeSilhouette(img) {
  const w = img.naturalWidth  || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  let imgData;
  try {
    imgData = cx.getImageData(0, 0, w, h);
  } catch (_) {
    return c;
  }
  const d = imgData.data;
  const isRGBA = sourceIsRGBA(d, w, h);
  const [tr, tg, tb] = BAMBOO_TINT;
  const ramp = BAMBOO_TRANSPARENT_AT - BAMBOO_OPAQUE_BELOW;
  for (let i = 0; i < d.length; i += 4) {
    let finalA;
    if (isRGBA) {
      // Boost source alpha to be fully opaque for pixels above threshold,
      // ensuring the bamboo is solid and blocks elements behind it,
      // while keeping a smooth ramp below the threshold for anti-aliasing.
      if (d[i + 3] >= 30) {
        finalA = 255;
      } else {
        finalA = Math.round(255 * (d[i + 3] / 30));
      }
    } else {
      // RGB: derive alpha from brightness. Source alpha is uniformly 255.
      const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (brightness >= BAMBOO_TRANSPARENT_AT) finalA = 0;
      else if (brightness <= BAMBOO_OPAQUE_BELOW) finalA = 255;
      else finalA = Math.round(255 * (BAMBOO_TRANSPARENT_AT - brightness) / ramp);
    }
    d[i]     = tr;
    d[i + 1] = tg;
    d[i + 2] = tb;
    d[i + 3] = finalA;
  }
  cx.putImageData(imgData, 0, 0);
  return c;
}

// Sample the 4 image corners. Any corner with alpha < 255 means the source
// uses a transparent background (RGBA). All corners opaque means the source
// uses a solid background (RGB, treat brightness as the alpha source).
function sourceIsRGBA(d, w, h) {
  const idx = (x, y) => (y * w + x) * 4 + 3;
  const corners = [
    d[idx(0, 0)],
    d[idx(w - 1, 0)],
    d[idx(0, h - 1)],
    d[idx(w - 1, h - 1)],
  ];
  return corners.some((a) => a < 255);
}

// Measures the painted silhouette near one horizontal edge of the cropped
// bbox and returns { widthFrac, centerFrac } — width and center-x relative
// to the bbox. Used by the renderer to size sprites so their painted
// trunks match seamlessly at the seam (e.g. a culm-tip drawn directly
// above a cane segment), AND to anchor them by trunk-center rather than
// bbox-center — important for sprites where the AI placed the trunk
// off-center inside the foliage spread.
//
// We sample a small band (a few rows) and take the median so a single
// anti-aliased edge row doesn't skew the result.
function measureEdge(canvas, bbox, edge) {
  if (bbox.sw <= 0 || bbox.sh <= 0) return { widthFrac: 0, centerFrac: 0.5 };
  const cw = canvas.width;
  const ctx = canvas.getContext('2d');
  let data;
  try { data = ctx.getImageData(0, 0, cw, canvas.height).data; }
  catch (_) { return { widthFrac: 0, centerFrac: 0.5 }; }
  const bandH = Math.max(1, Math.min(bbox.sh, Math.floor(bbox.sh * 0.03)));
  const y0 = edge === 'top' ? bbox.sy : bbox.sy + bbox.sh - bandH;
  const widths = [];
  const centers = [];
  for (let y = y0; y < y0 + bandH; y++) {
    let minX = bbox.sx + bbox.sw, maxX = -1;
    for (let x = bbox.sx; x < bbox.sx + bbox.sw; x++) {
      if (data[(y * cw + x) * 4 + 3] >= ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (maxX >= 0) {
      widths.push(maxX - minX + 1);
      centers.push((minX + maxX) / 2 - bbox.sx);
    }
  }
  if (widths.length === 0) return { widthFrac: 0, centerFrac: 0.5 };
  widths.sort((a, b) => a - b);
  centers.sort((a, b) => a - b);
  const mid = widths.length >> 1;
  return {
    widthFrac:  widths[mid]  / bbox.sw,
    centerFrac: centers[mid] / bbox.sw,
  };
}

async function loadBambooEntry(src) {
  const img = await loadImage(src);
  const canvas = bakeSilhouette(img);
  const bbox = measureBbox(canvas);
  const top    = measureEdge(canvas, bbox, 'top');
  const bottom = measureEdge(canvas, bbox, 'bottom');
  return {
    image: canvas,
    sx: bbox.sx, sy: bbox.sy, sw: bbox.sw, sh: bbox.sh,
    topFrac:          top.widthFrac,
    topCenterFrac:    top.centerFrac,
    bottomFrac:       bottom.widthFrac,
    bottomCenterFrac: bottom.centerFrac,
  };
}

// Loads every sprite category in parallel. A failed sprite is skipped so a
// missing file doesn't take down the rest — the renderer treats each pool as
// "use what's available; fall back to procedural if a pool is empty."
export async function loadBambooSprites() {
  await Promise.all(
    Object.entries(BAMBOO_SOURCES).map(async ([category, paths]) => {
      const loaded = await Promise.all(paths.map(async (p) => {
        try { return await loadBambooEntry(p); }
        catch (_) { return null; }
      }));
      bambooSprites[category] = loaded.filter(Boolean);
    })
  );
}

export function getBambooTallSprites()    { return bambooSprites.tall;    }
export function getBambooCaneSprites()    { return bambooSprites.cane;    }
export function getBambooBaseSprites()    { return bambooSprites.base;    }
export function getBambooTipSprites()     { return bambooSprites.tip;     }
export function getBambooStalkSprites()   { return bambooSprites.stalk;   }
export function getBambooClusterSprites() { return bambooSprites.cluster; }
export function getBambooLeafSprites()    { return bambooSprites.leaf;    }

// Returns the loaded moon surface image (or null if not yet loaded / missing).
// The renderer checks this each frame and draws a flat warm disc as fallback.
export function getMoonTexture() { return moonTexture; }

// Bake the moon source into a tight square crop centered on the disc.
// Source images typically have a black background with the disc inset by a
// few percent; the renderer draws the texture at ~2× the moon radius, so any
// margin baked into the source would show up as a dark ring inside the
// rendered moon. Measure the bright-pixel bbox once, then redraw onto a
// square canvas sized to the longer side and centered on the bbox so a
// non-square disc still ends up axis-aligned and edge-to-edge.
function cropMoonToDisc(img) {
  const w = img.naturalWidth  || img.width;
  const h = img.naturalHeight || img.height;
  const probe = document.createElement('canvas');
  probe.width = w; probe.height = h;
  const pcx = probe.getContext('2d');
  pcx.drawImage(img, 0, 0);
  let data;
  try { data = pcx.getImageData(0, 0, w, h).data; }
  catch (_) { return img; }
  // 32 on a 0..255 brightness scale: above this counts as "moon surface,"
  // below counts as background black. Generous enough to include the
  // shadowed limb yet still reject the pure-black margin.
  const THRESH = 32;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      const b = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (b >= THRESH) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return img;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const side = Math.max(bw, bh);
  // Center the disc in a square — bw and bh may differ by a pixel or two
  // even for a "round" disc due to anti-aliasing/lighting.
  const sx = minX - Math.floor((side - bw) / 2);
  const sy = minY - Math.floor((side - bh) / 2);
  const out = document.createElement('canvas');
  out.width = side; out.height = side;
  const ocx = out.getContext('2d');
  ocx.drawImage(img, sx, sy, side, side, 0, 0, side, side);

  // Shadow-lift pass. Source photos of the moon are very high contrast —
  // the maria sit near black. At the warm-lit size we render the moon, that
  // contrast reads as a dark "smudge." Compress shadows toward a neutral
  // mid-grey so the maria become visible-but-subdued surface detail, and
  // also blank the background pixels around the disc to fully transparent
  // so the renderer's circular clip composites cleanly even at oversample.
  const LIFT = 95;          // floor each in-disc channel gets lifted to
  const RANGE = 255 - LIFT; // compressed dynamic range above the floor
  let imgData;
  try { imgData = ocx.getImageData(0, 0, side, side); }
  catch (_) { return out; }
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const b = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (b < THRESH) {
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
    } else {
      d[i]     = LIFT + Math.round(d[i]     * RANGE / 255);
      d[i + 1] = LIFT + Math.round(d[i + 1] * RANGE / 255);
      d[i + 2] = LIFT + Math.round(d[i + 2] * RANGE / 255);
    }
  }
  ocx.putImageData(imgData, 0, 0);
  return out;
}

export async function loadMoonTexture() {
  try {
    const img = await loadImage(MOON_TEXTURE_SRC);
    moonTexture = cropMoonToDisc(img);
  } catch (_) { moonTexture = null; }
}

const WHEEL_SRC = 'img/cradle-wheel.png';

// Source PNGs are realistic black-ink wash drawings. We collapse luminance
// onto the same flat night-indigo tint the bamboo grove sprites use, so the
// cradle reads as part of the painted silhouette backdrop rather than a
// separately-lit warm-brown object. Alpha still varies smoothly along the
// edges (see bakeHarness), so the harness retains its drawn shape — just in
// one flat color matching the trees behind it.
const HARNESS_TONES = [
  { t: 256, r: 10, g: 18, b: 48 }, // PALETTE.bambooSilhouette / BAMBOO_TINT
];

function bakeHarness(img) {
  const w = img.naturalWidth  || img.width;
  const h = img.naturalHeight || img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  let imgData;
  try {
    imgData = cx.getImageData(0, 0, w, h);
  } catch (_) {
    return c;
  }
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const br = (d[i] + d[i+1] + d[i+2]) / 3;
    let alpha = d[i+3];
    if (br < 12) {
      alpha = 0;
    } else if (br < 30) {
      const t = (br - 12) / 18;
      alpha = Math.round(alpha * t);
    }
    if (alpha === 0) {
      d[i+3] = 0;
      continue;
    }
    let tone = HARNESS_TONES[HARNESS_TONES.length - 1];
    for (let k = 0; k < HARNESS_TONES.length; k++) {
      if (br < HARNESS_TONES[k].t) { tone = HARNESS_TONES[k]; break; }
    }
    d[i]   = tone.r;
    d[i+1] = tone.g;
    d[i+2] = tone.b;
    d[i+3] = alpha;
  }
  cx.putImageData(imgData, 0, 0);
  return c;
}

export async function loadHarnessSprite() {
  try {
    const imgWheel = await loadImage(WHEEL_SRC);
    const canvasWheel = bakeHarness(imgWheel);
    record('launcher_wheel', canvasWheel, measureBbox(canvasWheel));
  } catch (e) {
    console.warn('[moon-lit] failed to load mechanical launcher wheel sprite', e);
  }
}

export function getLauncherWheelSprite() {
  return sprites['launcher_wheel'] || null;
}

export function generateRandomMapping() {
  const allSources = [];
  const packs = ['bugs', 'flowers', 'dragons'];
  for (const packId of packs) {
    const pack = STENCIL_PACKS[packId];
    if (pack && pack.sources) {
      allSources.push(...Object.values(pack.sources));
    }
  }

  const mapping = {};
  for (const color of COLOR_KEYS) {
    // 40% chance of being plain paper (empty source)
    if (Math.random() < 0.40) {
      mapping[color] = '';
    } else if (allSources.length > 0) {
      const randomSrc = allSources[Math.floor(Math.random() * allSources.length)];
      mapping[color] = randomSrc;
    } else {
      mapping[color] = '';
    }
  }
  return mapping;
}

export function triggerNewRandomMapping() {
  const newMapping = generateRandomMapping();
  Arcade.state.set('randomMapping', JSON.stringify(newMapping));
}

export async function changeStencilPack(packId) {
  Arcade.state.set('stencilPack', packId);
  if (packId === 'random') {
    triggerNewRandomMapping();
  }
  await loadLanterns();
}

