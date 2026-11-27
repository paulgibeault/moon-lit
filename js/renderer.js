// Thin orchestrator over the renderer submodules. Drawing concerns live in
// renderer/world.js (sky + board + launcher), renderer/hud.js (HUD/overlay),
// and renderer/effects.js (bursts + score floats). Layout math is in
// layout.js. This file just sequences the per-frame draw calls.

import { PHASE } from './game.js';
import {
  drawScene, drawLauncher, drawShotQueue, drawAimLine, drawProjectile,
  drawMoonriseWash,
} from './renderer/world.js';
import { drawBursts, drawFloats } from './renderer/effects.js';
import { drawLivingWorld } from './renderer/nature.js';
import { renderClock } from './clock.js';
import {
  tweenHud, drawScoreHud, drawDescentMeter, drawComboMeter, drawEndOverlay, resetHudState,
  isHudSettled, drawModeIntroCard, drawLanternInventory, drawQuickRestartButton,
  drawLoadingOverlay, drawRightNotices, quickRestartWakeMs,
} from './renderer/hud.js';
import { drawMenu } from './renderer/menu.js';

export { computeLayout } from './layout.js';
export { resetHudState, isHudSettled, quickRestartWakeMs };

// `dtMs` is the time this frame is allowed to admit — 0 on the first frame
// after a park, capped otherwise. It comes from js/clock.js via main.js, which
// winds the clocks before stepping the game so gameplay stamps and the drawing
// below agree on what time it is. Everything here that animates on elapsed
// time takes it from that clock rather than reading the wall clock for itself.
export function render(ctx, layout, game, settings, stats, scores, dtMs) {
  tweenHud(game, settings, dtMs);

  // Sky, celestial layer, bamboo, the lantern field and the moon bleed, drawn
  // as one unit so they can be cached as one. See renderer/world.js — on a
  // settled board this is a single blit instead of several hundred blended
  // draw calls.
  drawScene(ctx, layout, game, settings);
  // The grove's live tier — stream, rising fish, fireflies, falling leaves —
  // on the render clock, over the cached scene. Nothing under stillness.
  drawLivingWorld(ctx, layout, settings, renderClock());
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
  // The Moonrise/combo meter sits top-right above the descent meter; draw it
  // first so it publishes its pip geometry, then the descent readout (which
  // reserves room beneath the strip), then the status line that anchors to it.
  drawComboMeter(ctx, layout, game, settings);
  drawDescentMeter(ctx, layout, game, settings);
  // ×N combo badge + Moonrise/Moonburst announcements, stacked on the right
  // below the descent meter.
  drawRightNotices(ctx, layout, game, settings);
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
