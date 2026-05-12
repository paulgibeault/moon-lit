// Loads sky-lantern PNGs and synthesizes tinted variants for the two colors
// (indigo, white) we don't have hand-painted art for. Tinting recolors the
// flame too — accepted trade-off documented in the plan.
//
// At load time we also measure each sprite's painted bounding box (alpha > 0)
// so the renderer can crop away transparent margin and draw the lamp at a
// size driven by the silhouette, not the PNG canvas.

const SOURCES = {
  red:    'img/sky-lantern-red.png',
  orange: 'img/sky-lantern-orange.png',
  yellow: 'img/sky-lantern-yellow.png',
  green:  'img/sky-lantern-green.png',
};

// Horizontal flipbook for the match-pop burst. The sheet is BURST_FRAMES wide
// and one frame tall; each frame is a square of size `sheet.height`.
const BURST_SRC = 'img/lantern-burst.png';
let burstSheet = null;

// Tinted variants: { base: <source colorKey>, tint: <hex> }
const TINTS = {
  indigo: { base: 'green',  tint: '#5A7AC9' },
  white:  { base: 'yellow', tint: '#F4ECDA' },
};

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

function makeTinted(baseImg, tintHex) {
  const c = document.createElement('canvas');
  c.width = baseImg.naturalWidth || baseImg.width;
  c.height = baseImg.naturalHeight || baseImg.height;
  const cx = c.getContext('2d');

  cx.drawImage(baseImg, 0, 0);
  cx.globalCompositeOperation = 'source-in';
  cx.fillStyle = tintHex;
  cx.fillRect(0, 0, c.width, c.height);

  cx.globalCompositeOperation = 'multiply';
  cx.drawImage(baseImg, 0, 0);

  cx.globalCompositeOperation = 'destination-in';
  cx.drawImage(baseImg, 0, 0);

  cx.globalCompositeOperation = 'source-over';
  return c;
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
  for (const [key, { base, tint }] of Object.entries(TINTS)) {
    const tinted = makeTinted(sprites[base].image, tint);
    // Tinted variants share the base silhouette, so they share its bbox.
    const { sx, sy, sw, sh } = sprites[base];
    record(key, tinted, { sx, sy, sw, sh });
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
