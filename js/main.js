import { GAME_ID } from './constants.js';
import { createBoard } from './board.js';
import { computeLayout, render } from './renderer.js';

await Arcade.ready;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const board = createBoard();

let layout = null;
let suspended = false;
let dirty = true;

function readSettings() {
  return {
    fontScale:     Arcade.settings.fontScale(),
    reducedMotion: Arcade.settings.reducedMotion(),
  };
}
let settings = readSettings();

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout = computeLayout(w, h);
  dirty = true;
}

function frame() {
  if (!suspended && dirty && layout) {
    render(ctx, layout, board, settings);
    dirty = false;
  }
  requestAnimationFrame(frame);
}

Arcade.onSuspend(() => { suspended = true; });
Arcade.onResume(() => { suspended = false; dirty = true; });
Arcade.onStateReplaced(() => location.reload());
Arcade.onSettingsChange(() => { settings = readSettings(); dirty = true; });

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);

console.info(`[${GAME_ID}] M2 board renderer ready — framed=${Arcade.context.framed}`);
