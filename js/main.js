import { GAME_ID } from './constants.js';
import { createGame, step, PHASE } from './game.js';
import { computeLayout, render } from './renderer.js';
import { attachInput } from './input.js';

await Arcade.ready;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let layout = null;
let game = null;
let suspended = false;
let dirty = true;
let lastTime = 0;

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
  // Lazy-init: the game needs a layout to seed its initial lantern positions.
  if (!game) game = createGame({ layout, level: 1 });
  dirty = true;
}

function nextLevel() {
  game = createGame({ layout, level: game.level + 1 });
  dirty = true;
}
function restartLevel() {
  game = createGame({ layout, level: game.level });
  dirty = true;
}

function frame(now) {
  if (!suspended && layout) {
    const dt = lastTime === 0 ? 0 : Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (game.phase === PHASE.FLYING || game.phase === PHASE.DESCENDING) {
      step(game, dt, layout);
      dirty = true;
    }
    if (dirty) {
      render(ctx, layout, game, settings);
      dirty = false;
    }
  } else {
    lastTime = 0;
  }
  requestAnimationFrame(frame);
}

Arcade.onSuspend(() => { suspended = true; });
Arcade.onResume(() => { suspended = false; lastTime = 0; dirty = true; });
Arcade.onStateReplaced(() => location.reload());
Arcade.onSettingsChange(() => { settings = readSettings(); dirty = true; });

window.addEventListener('resize', resize);
attachInput(canvas, () => game, () => layout, () => { dirty = true; }, {
  onWinClick: nextLevel,
  onLossClick: restartLevel,
});
resize();
requestAnimationFrame(frame);

console.info(`[${GAME_ID}] M5 pressure+win/loss ready — framed=${Arcade.context.framed}`);
