// Shared typography, opacity tokens, and color-mix helpers used across the
// HUD and world renderers. Kept in one place so font swaps / opacity tweaks
// don't have to chase every drawing call.

export const SERIF = '"Georgia", "Times New Roman", serif';
export const SANS  = '"Segoe UI", system-ui, sans-serif';

// Cream-and-orange opacity tokens — soft, secondary, hint, ghost. Used so the
// HUD reads as ornament against the night sky rather than UI chrome.
export const HUD_OPACITY = Object.freeze({
  primary:   0.95,
  strong:    0.85,
  secondary: 0.65,
  soft:      0.55,
  faint:     0.25,
  hairline:  0.12,
});

export { easeOut } from '../geometry.js';


export function mixWithWhite(hex, t) { return mixHex(hex, '#FFFFFF', t); }
export function mixWithBlack(hex, t) { return mixHex(hex, '#000000', t); }
export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
export function mixHex(a, b, t) {
  const ra = parseInt(a.slice(1, 3), 16), ga = parseInt(a.slice(3, 5), 16), ba = parseInt(a.slice(5, 7), 16);
  const rb = parseInt(b.slice(1, 3), 16), gb = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba + (bb - ba) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function formatScore(n) {
  return n.toLocaleString('en-US');
}

// Common HUD text sizing: layout-relative with a floor, multiplied by the
// SDK's font-scale setting so the launcher's accessibility slider works.
export function hudPx(layout, factor, floor, settings) {
  const fs = Math.max(0.5, settings && settings.fontScale ? settings.fontScale : 1);
  return Math.max(floor, Math.round(layout.size * factor * fs));
}

export function fontScaleOf(settings) {
  return Math.max(0.5, settings && settings.fontScale ? settings.fontScale : 1);
}

// Touch-primary devices (phones, tablets) get a softer DPR cap and a halved
// frame rate. The visual cost is small — at arm's length a 1.5× backbuffer is
// indistinguishable from native 2-3× on a modern OLED panel — and the GPU/CPU
// savings are large enough to noticeably extend battery life. Mouse-primary
// devices keep full DPR / 60fps since they sit at typing distance.
export let PERF_MODE =
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function setPerfModeOverride(override) {
  if (override === 'default') {
    PERF_MODE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  } else if (override === 'high') {
    PERF_MODE = false;
  } else if (override === 'low') {
    PERF_MODE = true;
  }
}

const DPR_CAP = 1.5;
export function getEffectiveDpr() {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return PERF_MODE ? Math.min(dpr, DPR_CAP) : dpr;
}
