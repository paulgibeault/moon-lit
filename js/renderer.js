// Thin orchestrator over the renderer submodules. Drawing concerns live in
// renderer/world.js (sky + board + launcher), renderer/hud.js (HUD/overlay),
// and renderer/effects.js (bursts + score floats). Layout math is in
// layout.js. This file just sequences the per-frame draw calls.

import { PHASE } from './game.js';
import {
  drawBackground, drawMoon, drawFrame, drawDeadLine,
  drawBoard, drawLauncher, drawShotQueue, drawAimLine, drawProjectile,
} from './renderer/world.js';
import { drawBursts, drawFloats } from './renderer/effects.js';
import {
  tweenHud, drawScoreHud, drawDescentMeter, drawEndOverlay, resetHudState,
} from './renderer/hud.js';

export { computeLayout } from './layout.js';
export { resetHudState };

export function render(ctx, layout, game, settings) {
  tweenHud(game, settings);

  const { viewW, viewH } = layout;
  drawBackground(ctx, viewW, viewH);
  drawMoon(ctx, viewW, viewH, game, settings);
  drawFrame(ctx, viewW, viewH);
  drawBoard(ctx, layout, game.board);
  drawDeadLine(ctx, layout);
  if (game.phase === PHASE.AIMING) {
    drawAimLine(ctx, layout, game);
  }
  drawLauncher(ctx, layout, game);
  drawShotQueue(ctx, layout, game, settings);
  if (game.shot) drawProjectile(ctx, game.shot, layout);
  drawBursts(ctx, layout, game, settings);
  drawFloats(ctx, layout, game, settings);
  drawScoreHud(ctx, layout, game, settings);
  drawDescentMeter(ctx, layout, game, settings);
  if (game.phase === PHASE.WIN || game.phase === PHASE.GAME_OVER) {
    drawEndOverlay(ctx, layout, game, settings);
  }
}
