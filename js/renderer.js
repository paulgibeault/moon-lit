// Thin orchestrator over the renderer submodules. Drawing concerns live in
// renderer/world.js (sky + board + launcher), renderer/hud.js (HUD/overlay),
// and renderer/effects.js (bursts + score floats). Layout math is in
// layout.js. This file just sequences the per-frame draw calls.

import { PHASE } from './game.js';
import {
  drawBackgroundSky, drawCelestialLayer, drawMoonBleed, drawBamboo,
  drawBoard, drawLauncher, drawShotQueue, drawAimLine, drawProjectile,
  drawMoonriseWash,
} from './renderer/world.js';
import { drawBursts, drawFloats } from './renderer/effects.js';
import {
  tweenHud, drawScoreHud, drawDescentMeter, drawEndOverlay, resetHudState,
  isHudSettled, drawModeIntroCard, drawLanternInventory, drawQuickRestartButton,
  drawLoadingOverlay, drawStatusMessage,
} from './renderer/hud.js';
import { drawMenu } from './renderer/menu.js';

export { computeLayout } from './layout.js';
export { resetHudState, isHudSettled };

export function render(ctx, layout, game, settings, stats, scores) {
  tweenHud(game, settings);

  const { viewW, viewH } = layout;
  drawBackgroundSky(ctx, layout, settings);
  drawCelestialLayer(ctx, layout, game, settings);
  drawBamboo(ctx, viewW, viewH, game, settings);
  drawBoard(ctx, layout, game, settings);
  // The bleed masks bamboo out of itself before compositing, so bamboo stays
  // fully opaque and never overdraws lanterns. See drawMoonBleed for details.
  drawMoonBleed(ctx, layout, settings);
  if (game.phase === PHASE.AIMING && game.queue.current) {
    drawAimLine(ctx, layout, game);
  }
  drawLauncher(ctx, layout, game);
  drawShotQueue(ctx, layout, game, settings);
  if (game.shots && game.shots.length > 0) {
    for (const shot of game.shots) {
      drawProjectile(ctx, shot, layout);
    }
  }
  drawBursts(ctx, layout, game, settings);
  drawFloats(ctx, layout, game, settings);
  // Moonlight wash for the Moonrise rescue — over the world + effects, under the
  // HUD so the chrome stays readable while the screen bathes in moonlight.
  drawMoonriseWash(ctx, layout, game, settings);
  drawScoreHud(ctx, layout, game, settings);
  drawDescentMeter(ctx, layout, game, settings);
  // After drawScoreHud (which draws the combo-power pips and publishes their
  // geometry) so the status line anchors to the meter. The spent charge reads
  // as the emptied pip's flash plus the moon swelling — no flying sprite.
  drawStatusMessage(ctx, layout, game, settings);
  drawLanternInventory(ctx, layout, game, settings);
  drawQuickRestartButton(ctx, layout, game, settings);
  if ((game.phase === PHASE.WIN || game.phase === PHASE.GAME_OVER) && !game.endOverlayDismissed) {
    drawEndOverlay(ctx, layout, game, settings, stats);
  }
  if (game.showModeIntroCard) {
    drawModeIntroCard(ctx, layout, game, settings);
  }
  if (game.loading) {
    drawLoadingOverlay(ctx, layout, game, settings);
  }
  // Menu (button + panels) draws last so it sits above the end-overlay too —
  // the player can open the stage selector from a game-over screen to pick a
  // different stage instead of being forced to retry the same one.
  drawMenu(ctx, layout, game, settings, stats, scores);
}
