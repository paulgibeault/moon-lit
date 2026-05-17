// Rasterizes the SVG lantern markup from lantern-svg.js to offscreen canvases
// at startup so per-frame drawing is a plain drawImage. Each canvas is then
// alpha-bbox measured so the renderer can crop transparent margin and draw the
// lamp at a size driven by its painted silhouette, not the rasterizer canvas.

import { COLOR_KEYS } from './constants.js';
import { buildLanternSvg, LANTERN_SVG_VIEWBOX } from './lantern-svg.js';

// Raster resolution. 2x oversample of the SVG viewBox so the lamp stays crisp
// when scaled to most viewport sizes (lantern radius typically peaks around
// ~64px = 128px diameter; rasterizing at 200px width gives headroom).
const RASTER_SCALE = 2;

// Horizontal flipbook for the match-pop burst. The sheet is BURST_FRAMES wide
// and one frame tall; each frame is a square of size `sheet.height`.
const BURST_SRC = 'img/lantern-burst.png';
let burstSheet = null;

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

// Pixel below this alpha is treated as transparent margin when measuring bbox.
const ALPHA_THRESHOLD = 8;

const sprites = {};

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
  const entries = await Promise.all(
    COLOR_KEYS.map(async (key) => [key, await rasterizeSvg(buildLanternSvg(key), w, h)])
  );
  for (const [key, canvas] of entries) {
    record(key, canvas, measureBbox(canvas));
  }
  try {
    const img = await loadImage(BURST_SRC);
    const frameSize = img.naturalHeight || img.height;
    const frames = Math.max(1, Math.round((img.naturalWidth || img.width) / frameSize));
    burstSheet = { image: img, frameSize, frames };
  } catch (e) {
    burstSheet = null;
  }
}

export function getLanternSprite(colorKey) {
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
      // Trust source alpha — preserves anti-aliased silhouette edges and
      // keeps any interior white highlights opaque (they're part of the
      // brushwork, not background).
      finalA = d[i + 3];
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
