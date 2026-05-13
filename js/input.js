import { setAim, fire, launcherTip, PHASE } from './game.js';

// Top-of-canvas dead-zone for taps. The launcher's topbar (menu, quit, etc.)
// sits in a ~40px strip above the iframe — taps that just barely miss those
// buttons land at the very top of the canvas and used to fire a lantern.
// Aiming via mousemove/touchmove is still allowed inside the zone so drag-up
// gestures keep working; only the commit-tap is suppressed here.
const UI_SAFE_TOP_PX = 56;

export function attachInput(canvas, getGame, getLayout, requestRender, callbacks = {}) {
  const { onWinClick, onLossClick } = callbacks;

  const canvasY = (clientY) => clientY - canvas.getBoundingClientRect().top;

  const aimAt = (clientX, clientY) => {
    const layout = getLayout();
    if (!layout) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const tip = launcherTip(layout);
    const angle = Math.atan2(x - tip.x, tip.y - y);
    setAim(getGame(), angle);
    requestRender();
  };

  const isGameOver = (g) => g.phase === PHASE.WIN || g.phase === PHASE.GAME_OVER;
  const inSafeZone = (clientY) => canvasY(clientY) < UI_SAFE_TOP_PX;

  const handleEndClick = (game) => {
    if (game.phase === PHASE.WIN) onWinClick?.();
    else if (game.phase === PHASE.GAME_OVER) onLossClick?.();
  };

  const onMove = (e) => {
    if (isGameOver(getGame())) return;
    aimAt(e.clientX, e.clientY);
  };
  const onDown = (e) => {
    const game = getGame();
    if (isGameOver(game)) {
      handleEndClick(game);
      return;
    }
    if (inSafeZone(e.clientY)) return;
    aimAt(e.clientX, e.clientY);
    if (game.phase === PHASE.AIMING) {
      fire(game, getLayout());
      requestRender();
    }
  };
  const onTouchMove = (e) => {
    if (isGameOver(getGame())) return;
    if (e.touches.length > 0) aimAt(e.touches[0].clientX, e.touches[0].clientY);
  };
  const onTouchEnd = (e) => {
    const t = e.changedTouches[0];
    if (!t) return;
    const game = getGame();
    if (isGameOver(game)) {
      handleEndClick(game);
      e.preventDefault();
      return;
    }
    if (inSafeZone(t.clientY)) return;
    aimAt(t.clientX, t.clientY);
    if (game.phase === PHASE.AIMING) {
      fire(game, getLayout());
      requestRender();
    }
    e.preventDefault();
  };

  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('touchmove',  onTouchMove, { passive: true });
  canvas.addEventListener('touchend',   onTouchEnd,  { passive: false });
}
