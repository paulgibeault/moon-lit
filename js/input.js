import { setAim, fire, launcherTip, PHASE } from './game.js';

export function attachInput(canvas, getGame, getLayout, requestRender) {
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

  const onMove = (e) => {
    if (isGameOver(getGame())) return;
    aimAt(e.clientX, e.clientY);
  };
  const onDown = (e) => {
    const game = getGame();
    if (isGameOver(game)) {
      location.reload();
      return;
    }
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
      location.reload();
      e.preventDefault();
      return;
    }
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
