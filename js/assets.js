// Loads sky-lantern PNGs. At load time we measure each sprite's painted
// bounding box (alpha > 0) so the renderer can crop away transparent margin
// and draw the lamp at a size driven by the silhouette, not the PNG canvas.

const SOURCES = {
  red:    'img/sky-lantern-red.png',
  orange: 'img/sky-lantern-orange.png',
  yellow: 'img/sky-lantern-yellow.png',
  green:  'img/sky-lantern-green.png',
  blue:   'img/sky-lantern-blue.png',
  white:  'img/sky-lantern-white.png',
};

// Horizontal flipbook for the match-pop burst. The sheet is BURST_FRAMES wide
// and one frame tall; each frame is a square of size `sheet.height`.
const BURST_SRC = 'img/lantern-burst.png';
let burstSheet = null;

// Bamboo framing — square for portrait-ish viewports, wide for landscape.
// Pre-processed at load so the white sky inside the arch becomes transparent
// and the gradient + moon show through behind the bamboo.
const BACKGROUND_SOURCES = {
  square: 'img/background.png',
  wide:   'img/background-wide.png',
};
const BACKGROUND_WIDE_AR_THRESHOLD = 1.3;
let backgrounds = { square: null, wide: null };

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

export async function loadLanterns() {
  const entries = await Promise.all(
    Object.entries(SOURCES).map(async ([key, src]) => [key, await loadImage(src)])
  );
  for (const [key, img] of entries) {
    record(key, img, measureBbox(img));
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

// Maps the source PNG's white sky to transparent and keeps bamboo opaque so
// the rendered frame composites over the gradient + moon. Anti-aliased edges
// between bamboo and sky get a soft alpha ramp in the 200..245 brightness
// band so leaves don't develop a hard halo.
function makeBambooFrame(img) {
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
  const TRANSPARENT_AT = 245;
  const OPAQUE_BELOW = 200;
  const RAMP = TRANSPARENT_AT - OPAQUE_BELOW;
  for (let i = 0; i < d.length; i += 4) {
    const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (brightness >= TRANSPARENT_AT) {
      d[i + 3] = 0;
    } else if (brightness > OPAQUE_BELOW) {
      const t = (TRANSPARENT_AT - brightness) / RAMP;
      d[i + 3] = Math.round(d[i + 3] * t);
    }
  }
  cx.putImageData(imgData, 0, 0);
  return c;
}

export async function loadBackgrounds() {
  const entries = await Promise.all(
    Object.entries(BACKGROUND_SOURCES).map(async ([key, src]) => {
      try {
        const img = await loadImage(src);
        return [key, makeBambooFrame(img)];
      } catch (_) {
        return [key, null];
      }
    })
  );
  for (const [key, canvas] of entries) backgrounds[key] = canvas;
}

export function getBackgroundFrame(viewW, viewH) {
  if (!viewW || !viewH) return backgrounds.square || backgrounds.wide || null;
  const wide = viewW / viewH >= BACKGROUND_WIDE_AR_THRESHOLD;
  return (wide ? backgrounds.wide : backgrounds.square)
      || backgrounds.square || backgrounds.wide || null;
}
