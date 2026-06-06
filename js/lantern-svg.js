// Lantern SVG markup, generated per color from a shared body so every lamp
// has identical geometry and only the gradient stops differ. Authored in
// img/lamps.html and ported here so loadLanterns can rasterize them to
// canvases at startup.

const BODY_PATH = 'M25 25 Q 50 20 75 25 Q 95 30 90 65 Q 86 90 83 105 Q 84 112 84 114 L 16 114 Q 16 112 17 105 Q 14 90 10 65 Q 5 30 25 25 Z';

const RIBS = '<path d="M35 25 C 20 30 25 65 30 112" /><path d="M65 25 C 80 30 75 65 70 112" />';

const TEXTURE = '<path d="M30 40 Q 50 38 70 40" /><path d="M20 70 Q 50 68 80 70" /><path d="M32 98 Q 50 100 68 98" />';

// Three-stop radial gradient for the paper face: highlight (lit side of the
// paper) → midtone (the lantern's base shade, kept in sync with COLORS) →
// shadow (darker edge). Highlights stay inside each lantern's own hue family
// rather than tilting toward cream — that way a red lantern still reads red
// when lit, not peachy-tan.
const PAPER_STOPS = {
  red:    ['#F26E6E', '#D63D3D', '#8A1F1F'],
  orange: ['#F2A871', '#E8843E', '#8C4818'],
  yellow: ['#F2DA8A', '#E8C055', '#8C6F25'],
  green:  ['#97C9AA', '#5FA47C', '#2F5E45'],
  blue:   ['#87ADD2', '#4D81B8', '#254868'],
  paper:  ['#EDDDBA', '#DBC49A', '#8C7850'],
};

// Two-stop gradient for the interior glow seen through the lantern's mouth.
// Darker versions of the paper shadow — the inside of the lantern catches
// less direct flame light than the paper does.
const REFLECT_STOPS = {
  red:    ['#8A1F1F', '#4A0F0F'],
  orange: ['#8C4818', '#4A2510'],
  yellow: ['#8C6F25', '#4D3B18'],
  green:  ['#2F5E45', '#163024'],
  blue:   ['#254868', '#122436'],
  paper:  ['#8C7850', '#4A3E26'],
};

export const LANTERN_SVG_VIEWBOX = { w: 100, h: 125 };

export function buildLanternSvg(color) {
  if (color === 'stone_blocker') {
    const bodyPath = 'M25 25 Q 50 20 75 25 Q 95 30 90 65 Q 86 90 83 105 Q 84 112 84 114 L 16 114 Q 16 112 17 105 Q 14 90 10 65 Q 5 30 25 25 Z';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 125">`
      + `<defs>`
        + `<radialGradient id="stone-grad" cx="40%" cy="40%" r="85%">`
          + `<stop offset="0%" stop-color="#A5A5A5"/>`   // Muted moonlit sheen
          + `<stop offset="25%" stop-color="#707070"/>`  // Medium-dark stone grey
          + `<stop offset="60%" stop-color="#444444"/>`  // Dark grey stone
          + `<stop offset="88%" stop-color="#262626"/>`  // Deep charcoal shadow
          + `<stop offset="100%" stop-color="#121212"/>` // Edge border shadow
        + `</radialGradient>`
        + `<radialGradient id="reflect-grad" cx="50%" cy="100%" r="100%">`
          + `<stop offset="0%" stop-color="#282828" stop-opacity="0.6"/>`
          + `<stop offset="100%" stop-color="#0E0E0E"/>`
        + `</radialGradient>`
        + `<radialGradient id="warm-glow-l" cx="15%" cy="90%" r="75%">`
          + `<stop offset="0%" stop-color="#FFAA54" stop-opacity="0.32"/>`
          + `<stop offset="50%" stop-color="#FF7F35" stop-opacity="0.12"/>`
          + `<stop offset="100%" stop-color="#FF7F35" stop-opacity="0"/>`
        + `</radialGradient>`
        + `<radialGradient id="warm-glow-r" cx="85%" cy="90%" r="75%">`
          + `<stop offset="0%" stop-color="#FFAA54" stop-opacity="0.32"/>`
          + `<stop offset="50%" stop-color="#FF7F35" stop-opacity="0.12"/>`
          + `<stop offset="100%" stop-color="#FF7F35" stop-opacity="0"/>`
        + `</radialGradient>`
      + `</defs>`
      + `<path d="${bodyPath}" fill="url(#stone-grad)" stroke="#121212" stroke-width="1.8" stroke-linejoin="round"/>`
      + `<path d="M 32 30 Q 36 60 44 75 T 38 108" fill="none" stroke="#E0E0E0" stroke-width="0.8" opacity="0.18"/>`
      + `<path d="M 66 28 Q 58 64 68 88 T 62 110" fill="none" stroke="#E0E0E0" stroke-width="0.8" opacity="0.18"/>`
      + `<ellipse cx="50" cy="114" rx="34" ry="6" fill="url(#reflect-grad)"/>`
      + `<ellipse cx="50" cy="114" rx="35" ry="6.5" fill="none" stroke="#121212" stroke-width="1.8"/>`
      + `<path d="${bodyPath}" fill="url(#warm-glow-l)" opacity="0.95"/>`
      + `<path d="${bodyPath}" fill="url(#warm-glow-r)" opacity="0.95"/>`
    + `</svg>`;
  }

  const g = PAPER_STOPS[color] || PAPER_STOPS.paper;
  const r = REFLECT_STOPS[color] || REFLECT_STOPS.paper;
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
