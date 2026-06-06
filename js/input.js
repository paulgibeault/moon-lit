import { setAim, fire, launcherTip, PHASE } from './game.js';
import {
  handleMenuPointerDown, handleMenuPointerMove, handleMenuPointerUp, isMenuPanelOpen,
  openMenu, closeMenu,
} from './renderer/menu.js';
import { getEndOverlayHit, getQuickRestartButtonRect } from './renderer/hud.js';


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
  const {
    onWinClick, onLossClick, onInteract, onStartLevel, onStartPuzzle, onMenuChange, onToggleSpeed,
    onPrevClick, onRestartClick, onNextClick,
    onChangeGameMode, onToggleFastLaunch,
  } = callbacks;
  
  // Notify main.js when the menu opens/closes so the rAF loop can wake up.
  const fireMenuChange = () => onMenuChange?.();
  // Bump on every pointer event so main.js can keep ambient animations
  // (twinkle, moon halo breath) alive while the player is actively touching
  // the interface, and let the rAF loop idle out shortly after they stop.
  const bump = () => onInteract && onInteract();

  const menuActions = {
    onStartLevel: (lv) => onStartLevel?.(lv),
    onStartPuzzle: (pz) => onStartPuzzle?.(pz),
    onResume:     () => {},
    onToggleSpeed: (active) => onToggleSpeed?.(active),
    onInteract:   () => { bump(); fireMenuChange(); },
    onChangeGameMode: (mode) => onChangeGameMode?.(mode),
    onToggleFastLaunch: (active) => onToggleFastLaunch?.(active),
  };

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

  const handleEndClick = (game, localX, localY) => {
    const action = getEndOverlayHit(localX, localY);
    if (action === 'prev') {
      onPrevClick?.();
    } else if (action === 'restart') {
      onRestartClick?.();
    } else if (action === 'next') {
      onNextClick?.();
    }
  };

  // Track the pointer that started an aim gesture, so a stray pointerup from
  // an end-screen dismiss can't accidentally fire in the new game.
  let aimingPointerId = null;

  const onPointerMove = (e) => {
    bump();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    if (isMenuPanelOpen()) {
      if (handleMenuPointerMove(localX, localY, e.clientY)) {
        fireMenuChange();
      }
      e.preventDefault();
      return;
    }
    if (isGameOver(getGame())) return;
    aimAt(e.clientX, e.clientY);
  };

  const onPointerDown = (e) => {
    bump();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    if (handleMenuPointerDown(localX, localY, e.clientY)) {
      aimingPointerId = e.pointerId;
      canvas.setPointerCapture?.(e.pointerId);
      fireMenuChange();
      e.preventDefault();
      return;
    }
    const game = getGame();
    const layout = getLayout();
    if (game && layout && game.phase !== PHASE.WIN && game.phase !== PHASE.GAME_OVER && !game.showModeIntroCard) {
      const btn = getQuickRestartButtonRect(layout);
      if (localX >= btn.x && localX <= btn.x + btn.w && localY >= btn.y && localY <= btn.y + btn.h) {
        const now = performance.now();
        if (!game.quickRestartArmed || (now - game.quickRestartArmedTime > 3000)) {
          game.quickRestartArmed = true;
          game.quickRestartArmedTime = now;
        } else {
          game.quickRestartArmed = false;
          onRestartClick?.();
        }
        fireMenuChange();
        e.preventDefault();
        return;
      }
    }

    if (game.showModeIntroCard) {
      game.showModeIntroCard = false;
      e.preventDefault();
      return;
    }
    if (isGameOver(game)) {
      handleEndClick(game, localX, localY);
      e.preventDefault();
      return;
    }
    if (inSafeZone(e.clientY)) return;
    aimingPointerId = e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);
    aimAt(e.clientX, e.clientY);
    e.preventDefault();
  };

  const onPointerUp = (e) => {
    bump();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    if (isMenuPanelOpen()) {
      if (aimingPointerId === e.pointerId) {
        canvas.releasePointerCapture?.(e.pointerId);
        aimingPointerId = null;
      }
      const game = getGame();
      if (handleMenuPointerUp(localX, localY, menuActions, game)) {
        fireMenuChange();
      }
      e.preventDefault();
      return;
    }
    if (aimingPointerId !== e.pointerId) return;
    aimingPointerId = null;
    const game = getGame();
    if (isGameOver(game)) return;
    aimAt(e.clientX, e.clientY);
    if (game.phase === PHASE.AIMING) {
      fire(game, getLayout());
    }
    e.preventDefault();
  };

  const onPointerCancel = (e) => {
    if (aimingPointerId === e.pointerId) aimingPointerId = null;
  };

  const onKeyDown = (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.closest?.('#bamboo-admin'))) return;

    e.preventDefault();
    bump();
    if (isMenuPanelOpen()) {
      closeMenu();
      const game = getGame();
      const targetMode = Arcade.state.get('gameMode') || 'campaign';
      const currentIsPuzzle = !!game?.isPuzzleMode;
      const currentMode = game?.gameMode || (currentIsPuzzle ? 'puzzle' : 'campaign');
      if (currentMode !== targetMode) {
        onChangeGameMode?.(targetMode);
      }
    } else {
      openMenu();
    }
    fireMenuChange();
  };

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('resize', refreshRect);
  window.addEventListener('scroll', refreshRect, { passive: true });
  window.addEventListener('keydown', onKeyDown);
}

