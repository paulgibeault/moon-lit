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

// One formatter for the life of the page: toLocaleString builds (and throws
// away) a fresh one on every call, and the score HUD formats every frame.
const SCORE_FORMAT = new Intl.NumberFormat('en-US');
export function formatScore(n) {
  return SCORE_FORMAT.format(n);
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

// Ambience — star twinkle, the moon's halo breath, the water shimmer, the
// launcher's idle flame and sparks, wind sway over a settled field — is
// decoration. It is the motion that keeps running when nothing is happening,
// which is exactly the motion GAME_INTEGRATION §6d says a visible-but-idle
// game should give up. Reduced motion has always frozen it; power saver
// (SDK 3.13.0+, §5 "Canvas-rendered games") is the player's own battery lever
// and freezes the same set. Everything the player needs to READ the game —
// the shot in flight, the descent, pops, the recoil that answers their own
// tap, HUD tweens — is gameplay-essential and keeps moving under power saver.
export function ambientStill(settings) {
  return !!(settings && (settings.reducedMotion || settings.powerSaver));
}

// The ambient clock — the single time source every decorative effect reads
// instead of calling performance.now() for itself. main.js winds it once per
// rendered frame; when the player has asked for stillness it holds at zero,
// which settles the lantern flames, the burner flicker and its sparks, the
// star twinkle, the halo breath and the water shimmer onto one resting frame
// at a stroke. One clock also means every effect in a frame agrees on what
// time it is.
//
// It lives in js/clock.js, alongside the render clock that gameplay stamps
// measure against and the quantized ember clock the field cache is keyed on —
// what belongs *here* is the policy question of which motion is decoration.
// Re-exported so the renderer keeps reading its clock from the module that
// also tells it what stillness means.
export { ambientClock, ambientTickIndex } from '../clock.js';

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
