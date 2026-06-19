import { setAim, fire, launcherTip, PHASE } from './game.js';
import {
  handleMenuPointerDown, handleMenuPointerMove, handleMenuPointerUp, isMenuPanelOpen,
  openMenu, closeMenu,
} from './renderer/menu.js';
import { getEndOverlayHit, getQuickRestartButtonRect, QUICK_RESTART_HIT_PAD } from './renderer/hud.js';


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
    onPrevClick, onRestartClick, onNextClick, onDismissClick, onRestoreClick,
    onChangeGameMode, onToggleFastLaunch,
    onStartSeed, onShuffleBoard, onShuffleSettings, onSetSeeds, onPickSeedHistory,
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
    // Seed Explorer build screen / history actions.
    onStartSeed: (seeds) => onStartSeed?.(seeds),
    onShuffleBoard: () => onShuffleBoard?.(),
    onShuffleSettings: () => onShuffleSettings?.(),
    onSetSeeds: (which) => onSetSeeds?.(which),
    onPickSeedHistory: (entry) => onPickSeedHistory?.(entry),
  };

  let rect = canvas.getBoundingClientRect();
  const refreshRect = () => { rect = canvas.getBoundingClientRect(); };

  // Release latch (touch/pen only). As a thumb leaves the glass it tends to
  // roll, firing a burst of pointermove events that swing the aim off the line
  // the player was actually holding — the classic "my shot went sideways the
  // instant I lifted" frustration on phones. We keep a short timestamped
  // history of aim angles and, on a touch release, fire using the angle as it
  // was RELEASE_LATCH_MS before lift — discarding the involuntary roll without
  // touching the live aim line, so rapid-fire and responsiveness are untouched.
  // Mouse is precise and left exactly as-is.
  const RELEASE_LATCH_MS = 70;
  let aimHistory = [];

  const angleAt = (clientX, clientY) => {
    const layout = getLayout();
    if (!layout) return null;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const tip = launcherTip(layout);
    return Math.atan2(x - tip.x, tip.y - y);
  };

  const aimAt = (clientX, clientY) => {
    const a = angleAt(clientX, clientY);
    if (a == null) return;
    setAim(getGame(), a);
    aimHistory.push({ t: performance.now(), angle: a });
    if (aimHistory.length > 32) aimHistory.shift();
  };

  // The aim a beat before release: walk back to the most recent sample at least
  // RELEASE_LATCH_MS old, falling back to the oldest sample in the gesture.
  const latchedAngle = () => {
    if (!aimHistory.length) return null;
    const cutoff = performance.now() - RELEASE_LATCH_MS;
    for (let i = aimHistory.length - 1; i >= 0; i--) {
      if (aimHistory[i].t <= cutoff) return aimHistory[i].angle;
    }
    return aimHistory[0].angle;
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
    } else if (action === 'dismiss') {
      onDismissClick?.();
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
      // Inflate the hit area so a near-miss restarts rather than falling through
      // to the aim path and accidentally launching a lantern on touchscreens.
      const pad = QUICK_RESTART_HIT_PAD;
      if (localX >= btn.x - pad && localX <= btn.x + btn.w + pad &&
          localY >= btn.y - pad && localY <= btn.y + btn.h + pad) {
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
      if (game.endOverlayDismissed) {
        onRestoreClick?.();
        e.preventDefault();
        return;
      }
      handleEndClick(game, localX, localY);
      e.preventDefault();
      return;
    }
    if (inSafeZone(e.clientY)) return;
    aimingPointerId = e.pointerId;
    canvas.setPointerCapture?.(e.pointerId);
    aimHistory = [];   // fresh gesture: don't latch onto a previous shot's aim
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
    if (e.pointerType === 'mouse') {
      // Desktop is precise — commit exactly where the cursor sits.
      aimAt(e.clientX, e.clientY);
    } else {
      // Touch/pen — ignore the lift position and the roll just before it.
      const a = latchedAngle();
      if (a != null) setAim(game, a);
    }
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

