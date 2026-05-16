import { setAim, fire, launcherTip, PHASE } from './game.js';

// Top-of-canvas dead-zone for taps. The launcher's topbar (menu, quit, etc.)
// sits in a ~40px strip above the iframe — taps that just barely miss those
// buttons land at the very top of the canvas and used to fire a lantern.
// Aiming via pointer-move is still allowed inside the zone so drag-up
// gestures keep working; only the commit-tap is suppressed here.
const UI_SAFE_TOP_PX = 56;

// Single Pointer-Events handler that covers mouse, touch, and stylus.
// Replaces the previous mouse + touch duplication. The bounding-rect is
// cached and only refreshed on window resize / scroll.
export function attachInput(canvas, getGame, getLayout, callbacks = {}) {
  const { onWinClick, onLossClick } = callbacks;

  let rect = canvas.getBoundingClientRect();
  const refreshRect = () => { rect = canvas.getBoundingClientRect(); };

  const aimAt = (clientX, clientY) => {
    const layout = getLayout();
    if (!layout) return;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const tip = launcherTip(layout);
    setAim(getGame(), Math.atan2(x - tip.x, tip.y - y));
  };

  const isGameOver = (g) => g.phase === PHASE.WIN || g.phase === PHASE.GAME_OVER;
  const inSafeZone = (clientY) => (clientY - rect.top) < UI_SAFE_TOP_PX;

  const handleEndClick = (game) => {
    if (game.phase === PHASE.WIN) onWinClick?.();
    else if (game.phase === PHASE.GAME_OVER) onLossClick?.();
  };

  const onPointerMove = (e) => {
    if (isGameOver(getGame())) return;
    aimAt(e.clientX, e.clientY);
  };

  const onPointerDown = (e) => {
    const game = getGame();
    if (isGameOver(game)) {
      handleEndClick(game);
      e.preventDefault();
      return;
    }
    if (inSafeZone(e.clientY)) return;
    aimAt(e.clientX, e.clientY);
    if (game.phase === PHASE.AIMING) {
      fire(game, getLayout());
    }
    e.preventDefault();
  };

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('resize', refreshRect);
  window.addEventListener('scroll', refreshRect, { passive: true });
}
