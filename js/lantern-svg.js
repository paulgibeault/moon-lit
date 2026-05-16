// Lantern SVG markup, generated per color from a shared body so every lamp
// has identical geometry and only the gradient stops differ. Authored in
// img/lamps.html and ported here so loadLanterns can rasterize them to
// canvases at startup.

const BODY_PATH = 'M25 25 Q 50 20 75 25 Q 95 30 90 65 Q 86 90 83 105 Q 84 112 84 114 L 16 114 Q 16 112 17 105 Q 14 90 10 65 Q 5 30 25 25 Z';

const RIBS = '<path d="M35 25 C 20 30 25 65 30 112" /><path d="M65 25 C 80 30 75 65 70 112" />';

const TEXTURE = '<path d="M30 40 Q 50 38 70 40" /><path d="M20 70 Q 50 68 80 70" /><path d="M32 98 Q 50 100 68 98" />';

// Three-stop radial gradient for the paper face (highlight → midtone → shadow).
const PAPER_STOPS = {
  red:    ['#ff5252', '#d32f2f', '#8e0000'],
  orange: ['#ffb74d', '#f57c00', '#bf360c'],
  yellow: ['#fff59d', '#fdd835', '#fbc02d'],
  green:  ['#81c784', '#388e3c', '#1b5e20'],
  blue:   ['#4fc3f7', '#0288d1', '#01579b'],
  white:  ['#ffffff', '#f5f5f5', '#e0e0e0'],
};

// Two-stop gradient for the internal reflection visible through the mouth.
const REFLECT_STOPS = {
  red:    ['#8e0000', '#5a0000'],
  orange: ['#f57c00', '#bf360c'],
  yellow: ['#fdd835', '#fbc02d'],
  green:  ['#388e3c', '#1b5e20'],
  blue:   ['#0288d1', '#01579b'],
  white:  ['#eeeeee', '#bdbdbd'],
};

export const LANTERN_SVG_VIEWBOX = { w: 100, h: 125 };

export function buildLanternSvg(color) {
  const g = PAPER_STOPS[color] || PAPER_STOPS.white;
  const r = REFLECT_STOPS[color] || REFLECT_STOPS.white;
  const uid = `mg-${color}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 125">`
    + `<defs>`
      + `<radialGradient id="${uid}-p" cx="50%" cy="65%" r="85%">`
        + `<stop offset="0%" stop-color="${g[0]}"/>`
        + `<stop offset="50%" stop-color="${g[1]}"/>`
        + `<stop offset="100%" stop-color="${g[2]}"/>`
      + `</radialGradient>`
      + `<radialGradient id="${uid}-r" cx="50%" cy="100%" r="100%">`
        + `<stop offset="0%" stop-color="${r[0]}" stop-opacity="0.4"/>`
        + `<stop offset="100%" stop-color="${r[1]}"/>`
      + `</radialGradient>`
    + `</defs>`
    + `<path d="${BODY_PATH}" fill="url(#${uid}-p)"/>`
    + `<g opacity="0.18" fill="none" stroke="#000" stroke-width="1">${RIBS}</g>`
    + `<g opacity="0.05" fill="none" stroke="#000" stroke-width="0.5">${TEXTURE}</g>`
    + `<ellipse cx="50" cy="114" rx="34" ry="6" fill="url(#${uid}-r)"/>`
    + `<ellipse cx="50" cy="114" rx="35" ry="6.5" fill="none" stroke="#3e2723" stroke-width="1.2"/>`
  + `</svg>`;
}
