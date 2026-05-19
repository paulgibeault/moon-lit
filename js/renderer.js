// Thin orchestrator over the renderer submodules. Drawing concerns live in
// renderer/world.js (sky + board + launcher), renderer/hud.js (HUD/overlay),
// and renderer/effects.js (bursts + score floats). Layout math is in
// layout.js. This file just sequences the per-frame draw calls.

import { PHASE } from './game.js';
import {
  drawBackground, drawMoon, drawMoonBleed, drawBamboo, drawReflections, drawWaterline,
  drawBoard, drawLauncher, drawShotQueue, drawAimLine, drawProjectile,
} from './renderer/world.js';
import { drawBursts, drawFloats } from './renderer/effects.js';
import {
  tweenHud, drawScoreHud, drawDescentMeter, drawEndOverlay, resetHudState,
  isHudSettled,
} from './renderer/hud.js';
import { drawMenu } from './renderer/menu.js';

export { computeLayout } from './layout.js';
export { resetHudState, isHudSettled };

export function render(ctx, layout, game, settings, stats, scores) {
  tweenHud(game, settings);

  const { viewW, viewH } = layout;
  drawBackground(ctx, layout, settings);
  drawMoon(ctx, layout, game, settings);
  drawReflections(ctx, layout, game, settings);
  drawWaterline(ctx, layout);
  drawBamboo(ctx, viewW, viewH, game, settings);
  drawBoard(ctx, layout, game, settings);
  // The bleed masks bamboo out of itself before compositing, so bamboo stays
  // fully opaque and never overdraws lanterns. See drawMoonBleed for details.
  drawMoonBleed(ctx, layout, settings);
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
  // Menu (button + panels) draws last so it sits above the end-overlay too —
  // the player can open the stage selector from a game-over screen to pick a
  // different stage instead of being forced to retry the same one.
  drawMenu(ctx, layout, game, settings, stats, scores);
}
