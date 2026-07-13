// Bamboo and Game Tuning Admin Panel.
// Toggle with backtick (`) on keyboard, or load page with ?admin=1.
// Redesigned with premium glassmorphism, collapsible categories, wind,
// moon phase, handedness, performance mode, and gameplay tuning controls.

import { BAMBOO_PARAMS, MOON_PARAMS, LANTERN_PARAMS, invalidateBambooCache, applyBambooProfile } from './renderer/world.js';
import {
  MOON_OVERRIDE, ENV_PARAMS, SYSTEM_OVERRIDES, updateTuningParam,
  PROJECTILE_SPEED, DESCENT_DRIFT_SPEED, ADJACENCY_TOLERANCE, COLLISION_TOLERANCE, DESCENT_SHOTS
} from './constants.js';

// Slider specs grouped by purpose.
const PARAM_GROUPS = [
  {
    title: 'Moon Aspect',
    params: [
      {
        key: 'position',
        label: 'Position',
        target: MOON_OVERRIDE,
        min: -0.05, max: 1.0, step: 0.005,
        display: (v) => v < 0 ? 'live' : v.toFixed(3)
      },
      {
        key: 'phase',
        label: 'Phase',
        target: MOON_OVERRIDE,
        min: -0.05, max: 1.0, step: 0.01,
        display: (v) => v < 0 ? 'live' : v.toFixed(2)
      }
    ]
  },
  {
    title: 'Environmental',
    params: [
      {
        key: 'windSpeed',
        label: 'Wind Speed',
        target: ENV_PARAMS,
        min: 0.0, max: 2.0, step: 0.05
      },
      {
        key: 'windFrequency',
        label: 'Wind Freq',
        target: ENV_PARAMS,
        min: 0.1, max: 3.0, step: 0.05
      },
      {
        key: 'glowIntensity',
        label: 'Glow Mult',
        target: ENV_PARAMS,
        min: 0.0, max: 3.0, step: 0.05
      },
      {
        key: 'rippleSpeedScale',
        label: 'Ripple Speed',
        target: ENV_PARAMS,
        min: 0.2, max: 3.0, step: 0.05
      }
    ]
  },
  {
    title: 'Game Physics & Timing',
    params: [
      {
        key: 'PROJECTILE_SPEED',
        label: 'Proj Speed',
        isTuning: true,
        min: 5, max: 50, step: 1, int: true
      },
      {
        key: 'DESCENT_DRIFT_SPEED',
        label: 'Descent Spd',
        isTuning: true,
        min: 2, max: 20, step: 0.5
      },
      {
        key: 'ADJACENCY_TOLERANCE',
        label: 'Adjacency Tol',
        isTuning: true,
        min: 0.5, max: 2.0, step: 0.01
      },
      {
        key: 'COLLISION_TOLERANCE',
        label: 'Collision Tol',
        isTuning: true,
        min: 0.5, max: 1.5, step: 0.01
      },
      {
        key: 'DESCENT_SHOTS',
        label: 'Descent Shots',
        isTuning: true,
        min: 1, max: 15, step: 1, int: true
      }
    ]
  },
  {
    title: 'Bamboo Silhouette',
    target: BAMBOO_PARAMS,
    onChange: () => invalidateBambooCache(),
    params: [
      { key: 'edgeBand',  label: 'Edge band',   min: 0.10, max: 0.40, step: 0.01 },
      { key: 'bankYFrac', label: 'Bank Y',      min: 0.85, max: 1.00, step: 0.005, decimals: 3 },
      { key: 'towersPerSide',    label: 'FG stalks',   min: 0, max: 6, step: 1, int: true },
      { key: 'trunksPerSide',    label: 'BG trunks',   min: 0, max: 5, step: 1, int: true },
      { key: 'midgroundPerSide', label: 'Midground',   min: 0, max: 6, step: 1, int: true },
      { key: 'cornerPerSide',    label: 'Corners',     min: 0, max: 5, step: 1, int: true },
      { key: 'caneTopperScale',  label: 'Cane topper', min: 0, max: 2, step: 0.05 },
      { key: 'canopyPxPerCluster', label: 'Px/cluster', min: 20, max: 120, step: 2, int: true },
      { key: 'canopyMin',          label: 'Min count',  min: 4,  max: 60,  step: 2, int: true },
      { key: 'canopyMax',          label: 'Max count',  min: 12, max: 96,  step: 2, int: true },
      { key: 'baseTrunkFrac', label: 'Base trunk', min: 0.10, max: 0.40, step: 0.01 },
      { key: 'caneTrunkFrac', label: 'Cane trunk', min: 0.40, max: 1.00, step: 0.01 },
      { key: 'tallTrunkFrac', label: 'Tall trunk', min: 0.06, max: 0.30, step: 0.01 },
      { key: 'baseGrassFrac', label: 'Base grass', min: 0.15, max: 0.50, step: 0.01 }
    ]
  },
  {
    title: 'Lantern & Level Overrides',
    params: [
      { key: 'opacity', label: 'Opacity', target: LANTERN_PARAMS, min: 0.30, max: 1.00, step: 0.01 },
      { key: 'backing', label: 'Backing', target: LANTERN_PARAMS, min: 0.00, max: 1.00, step: 0.02 },
      { key: 'levelOverride', label: 'Force level', target: BAMBOO_PARAMS, onChange: () => invalidateBambooCache(), min: 0, max: 12, step: 1, int: true }
    ]
  }
];

// Snapshot of starting values so Reset can restore them.
const DEFAULTS = new Map([
  [BAMBOO_PARAMS, JSON.parse(JSON.stringify(BAMBOO_PARAMS))],
  [LANTERN_PARAMS, JSON.parse(JSON.stringify(LANTERN_PARAMS))],
  [MOON_PARAMS, JSON.parse(JSON.stringify(MOON_PARAMS))]
]);

function injectStyles() {
  if (document.getElementById('bamboo-admin-styles')) return;
  const style = document.createElement('style');
  style.id = 'bamboo-admin-styles';
  style.textContent = `
    #bamboo-admin {
      position: fixed;
      top: 12px;
      right: 12px;
      width: 320px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      background: rgba(11, 16, 33, 0.85);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      color: #F5E9C9;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      font-size: 12px;
      border: 1px solid rgba(245, 233, 201, 0.25);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px rgba(255, 255, 255, 0.1);
      z-index: 100000;
      overflow: hidden;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    #bamboo-admin.ba-hidden { display: none; }

    #bamboo-admin .ba-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.4);
      border-bottom: 1px solid rgba(245, 233, 201, 0.15);
    }
    #bamboo-admin .ba-title {
      flex: 1;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #F5E9C9;
      text-shadow: 0 0 8px rgba(245, 233, 201, 0.4);
    }
    #bamboo-admin .ba-header button {
      background: rgba(245, 233, 201, 0.1);
      color: #F5E9C9;
      border: 1px solid rgba(245, 233, 201, 0.3);
      border-radius: 6px;
      padding: 4px 8px;
      cursor: pointer;
      font: inherit;
      font-size: 10px;
      font-weight: 600;
      transition: all 0.2s;
    }
    #bamboo-admin .ba-header button:hover {
      background: rgba(245, 233, 201, 0.25);
      box-shadow: 0 0 8px rgba(245, 233, 201, 0.3);
    }
    #bamboo-admin .ba-header button[data-action="hide"] {
      padding: 4px 8px;
      font-size: 14px;
      line-height: 1;
    }

    #bamboo-admin .ba-profile-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(245, 233, 201, 0.1);
    }
    #bamboo-admin .ba-profile-label {
      flex: 1;
      font-size: 11px;
      opacity: 0.8;
      font-weight: 600;
    }
    #bamboo-admin .ba-profile-row button {
      background: rgba(95, 164, 124, 0.15);
      color: #DBC49A;
      border: 1px solid rgba(95, 164, 124, 0.4);
      border-radius: 6px;
      padding: 4px 12px;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      transition: all 0.2s;
    }
    #bamboo-admin .ba-profile-row button:hover {
      background: rgba(95, 164, 124, 0.3);
    }

    #bamboo-admin .ba-body {
      flex: 1;
      overflow-y: auto;
      padding: 8px 16px 16px;
    }

    #bamboo-admin .ba-group {
      margin-top: 8px;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(245, 233, 201, 0.08);
      border-radius: 8px;
      overflow: hidden;
    }
    #bamboo-admin .ba-group-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: rgba(245, 233, 201, 0.05);
      cursor: pointer;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      transition: background 0.2s;
    }
    #bamboo-admin .ba-group-header:hover {
      background: rgba(245, 233, 201, 0.1);
    }
    #bamboo-admin .ba-group-header::after {
      content: '▼';
      font-size: 8px;
      opacity: 0.7;
      transition: transform 0.2s;
    }
    #bamboo-admin .ba-group.collapsed .ba-group-header::after {
      transform: rotate(-90deg);
    }
    #bamboo-admin .ba-group-body {
      padding: 8px 12px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #bamboo-admin .ba-group.collapsed .ba-group-body {
      display: none;
    }

    #bamboo-admin .ba-row {
      display: grid;
      grid-template-columns: 100px 1fr 48px;
      align-items: center;
      gap: 8px;
      padding: 3px 0;
    }
    #bamboo-admin .ba-row label {
      font-size: 11px;
      opacity: 0.85;
    }
    #bamboo-admin .ba-row input[type="range"] {
      width: 100%;
      accent-color: #E8B770;
      height: 18px;
      background: transparent;
      cursor: pointer;
    }
    #bamboo-admin .ba-row .ba-val {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      font-weight: 600;
      color: #E8B770;
      text-shadow: 0 0 4px rgba(232, 183, 112, 0.2);
    }

    #bamboo-admin .ba-btn-row {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }
    #bamboo-admin .ba-btn-row button {
      flex: 1;
      background: rgba(95, 164, 124, 0.15);
      color: #DBC49A;
      border: 1px solid rgba(95, 164, 124, 0.35);
      border-radius: 6px;
      padding: 6px 0;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      transition: all 0.2s;
    }
    #bamboo-admin .ba-btn-row button:hover {
      background: rgba(95, 164, 124, 0.3);
      box-shadow: 0 0 6px rgba(95, 164, 124, 0.2);
    }
    #bamboo-admin .ba-btn-row button.active {
      background: rgba(95, 164, 124, 0.45);
      color: #FFF;
      border-color: rgba(95, 164, 124, 0.8);
    }

    @media (max-width: 560px) {
      #bamboo-admin {
        top: auto;
        right: 8px;
        left: 8px;
        bottom: 8px;
        width: auto;
        max-height: 55vh;
      }
      #bamboo-admin .ba-row {
        padding: 8px 0;
      }
      #bamboo-admin .ba-row input[type="range"] {
        height: 28px;
      }
    }
  `;
}

function fmtValue(spec, v) {
  if (spec.display) return spec.display(v);
  if (spec.int) return String(v | 0);
  const d = spec.decimals != null ? spec.decimals : 2;
  return v.toFixed(d);
}

function getValOf(spec, group) {
  if (spec.isTuning) {
    if (spec.key === 'PROJECTILE_SPEED') return PROJECTILE_SPEED;
    if (spec.key === 'DESCENT_DRIFT_SPEED') return DESCENT_DRIFT_SPEED;
    if (spec.key === 'ADJACENCY_TOLERANCE') return ADJACENCY_TOLERANCE;
    if (spec.key === 'COLLISION_TOLERANCE') return COLLISION_TOLERANCE;
    if (spec.key === 'DESCENT_SHOTS') return DESCENT_SHOTS;
  }
  const target = spec.target || group.target || BAMBOO_PARAMS;
  return target[spec.key];
}

function setValOf(spec, group, value) {
  if (spec.isTuning) {
    updateTuningParam(spec.key, value);
  } else {
    const target = spec.target || group.target || BAMBOO_PARAMS;
    target[spec.key] = value;
  }
  if (spec.onChange) spec.onChange();
  if (group.onChange) group.onChange();
  
  if (window.triggerAdminUpdate) {
    window.triggerAdminUpdate();
  }
}

// Walks every slider in the panel and snaps both the input value and the
// displayed text to the current params state.
function syncSliders(root) {
  for (const group of PARAM_GROUPS) {
    for (const spec of group.params) {
      const inp = root.querySelector(`input[data-key="${spec.key}"]`);
      if (!inp) continue;
      const val = getValOf(spec, group);
      inp.value = val;
      const valSpan = inp.parentElement.querySelector('.ba-val');
      if (valSpan) valSpan.textContent = fmtValue(spec, val);
    }
  }
}

function syncButtons(root) {
  const handVal = SYSTEM_OVERRIDES.handedness;
  root.querySelectorAll('#ba-handedness-row button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.val === handVal);
  });

  const perfVal = SYSTEM_OVERRIDES.perfMode;
  root.querySelectorAll('#ba-perf-row button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.val === perfVal);
  });
}

// Collapsed/expanded state per group, namespaced under the game's Arcade
// state instead of raw localStorage keys — `admin-group-collapsed-<title>`
// isn't namespaced by gameId, so it collides with the same panel in sibling
// games on the shared origin.
function loadCollapsed() {
  return Arcade.state.get('adminCollapsed') || {};
}
function setCollapsed(key, collapsed) {
  const c = loadCollapsed();
  c[key] = collapsed;
  Arcade.state.set('adminCollapsed', c, { exportable: false });
}

let root = null;

function buildPanel() {
  injectStyles();

  const r = document.createElement('div');
  r.id = 'bamboo-admin';
  r.innerHTML = `
    <div class="ba-header">
      <span class="ba-title">Game Overrides & Tuning</span>
      <button type="button" data-action="copy" title="Copy configuration JSON">Copy</button>
      <button type="button" data-action="reset" title="Reset all overrides">Reset</button>
      <button type="button" data-action="hide" title="Hide panel (press \` to toggle)">×</button>
    </div>
    <div class="ba-profile-row">
      <span class="ba-profile-label">Layout Preset:</span>
      <button type="button" data-profile="small">Small</button>
      <button type="button" data-profile="wide">Wide</button>
    </div>
    <div class="ba-body"></div>
  `;
  const body = r.querySelector('.ba-body');

  r.querySelectorAll('button[data-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyBambooProfile(btn.dataset.profile);
      syncSliders(r);
      if (window.triggerAdminUpdate) window.triggerAdminUpdate();
    });
  });

  // Build slider groups
  for (const group of PARAM_GROUPS) {
    const g = document.createElement('div');
    g.className = 'ba-group';
    
    // Check persisted group expanded states
    const isCollapsed = !!loadCollapsed()[group.title];
    if (isCollapsed) {
      g.classList.add('collapsed');
    }

    const header = document.createElement('div');
    header.className = 'ba-group-header';
    header.textContent = group.title;
    header.addEventListener('click', () => {
      g.classList.toggle('collapsed');
      setCollapsed(group.title, g.classList.contains('collapsed'));
    });
    g.appendChild(header);

    const groupBody = document.createElement('div');
    groupBody.className = 'ba-group-body';

    for (const spec of group.params) {
      const row = document.createElement('div');
      row.className = 'ba-row';
      const lbl = document.createElement('label');
      lbl.textContent = spec.label;
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = spec.min;
      inp.max = spec.max;
      inp.step = spec.step;
      inp.value = getValOf(spec, group);
      inp.dataset.key = spec.key;
      const val = document.createElement('span');
      val.className = 'ba-val';
      val.textContent = fmtValue(spec, getValOf(spec, group));
      
      inp.addEventListener('input', () => {
        let v = parseFloat(inp.value);
        if (spec.int) v = v | 0;
        setValOf(spec, group, v);
        val.textContent = fmtValue(spec, v);
      });
      row.appendChild(lbl);
      row.appendChild(inp);
      row.appendChild(val);
      groupBody.appendChild(row);
    }
    g.appendChild(groupBody);
    body.appendChild(g);
  }

  // System controls group
  const sysGroup = document.createElement('div');
  sysGroup.className = 'ba-group';
  if (loadCollapsed().system) {
    sysGroup.classList.add('collapsed');
  }
  
  sysGroup.innerHTML = `
    <div class="ba-group-header">System Settings</div>
    <div class="ba-group-body">
      <div class="ba-row-label" style="font-size: 11px; opacity: 0.75; margin-bottom: 2px;">Handedness:</div>
      <div class="ba-btn-row" id="ba-handedness-row">
        <button type="button" data-val="default">Default</button>
        <button type="button" data-val="left">Left</button>
        <button type="button" data-val="right">Right</button>
      </div>
      <div class="ba-row-label" style="font-size: 11px; opacity: 0.75; margin-top: 8px; margin-bottom: 2px;">Performance Mode:</div>
      <div class="ba-btn-row" id="ba-perf-row">
        <button type="button" data-val="default">Default</button>
        <button type="button" data-val="high">High Q</button>
        <button type="button" data-val="low">Eco Mode</button>
      </div>
    </div>
  `;
  sysGroup.querySelector('.ba-group-header').addEventListener('click', () => {
    sysGroup.classList.toggle('collapsed');
    setCollapsed('system', sysGroup.classList.contains('collapsed'));
  });

  // Handedness buttons event listeners
  sysGroup.querySelectorAll('#ba-handedness-row button').forEach((btn) => {
    btn.addEventListener('click', () => {
      SYSTEM_OVERRIDES.handedness = btn.dataset.val;
      syncButtons(r);
      if (window.triggerAdminUpdate) window.triggerAdminUpdate();
    });
  });

  // Perf mode buttons event listeners
  sysGroup.querySelectorAll('#ba-perf-row button').forEach((btn) => {
    btn.addEventListener('click', () => {
      SYSTEM_OVERRIDES.perfMode = btn.dataset.val;
      syncButtons(r);
      if (window.triggerAdminUpdate) window.triggerAdminUpdate();
    });
  });

  body.appendChild(sysGroup);
  syncButtons(r);

  // Copy Action
  r.querySelector('[data-action="copy"]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const config = {
      BAMBOO_PARAMS,
      LANTERN_PARAMS,
      MOON_OVERRIDE,
      ENV_PARAMS,
      SYSTEM_OVERRIDES,
      TUNING: {
        PROJECTILE_SPEED,
        DESCENT_DRIFT_SPEED,
        ADJACENCY_TOLERANCE,
        COLLISION_TOLERANCE,
        DESCENT_SHOTS
      }
    };
    const json = JSON.stringify(config, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1400);
    } catch (_) {
      console.log('[GAME_CONFIG]', json);
      btn.textContent = 'See console';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1400);
    }
  });

  // Reset Action
  r.querySelector('[data-action="reset"]').addEventListener('click', () => {
    for (const [target, defaults] of DEFAULTS) {
      Object.assign(target, defaults);
    }
    // Restore initial physics tuning params
    updateTuningParam('PROJECTILE_SPEED', 22);
    updateTuningParam('DESCENT_DRIFT_SPEED', 8.5);
    updateTuningParam('ADJACENCY_TOLERANCE', 1.22);
    updateTuningParam('COLLISION_TOLERANCE', 0.95);
    updateTuningParam('DESCENT_SHOTS', 6);
    
    // Restore overrides
    MOON_OVERRIDE.phase = -1;
    MOON_OVERRIDE.position = -1;
    ENV_PARAMS.windSpeed = 0.0;
    ENV_PARAMS.windFrequency = 1.0;
    ENV_PARAMS.glowIntensity = 1.0;
    ENV_PARAMS.rippleSpeedScale = 1.0;
    SYSTEM_OVERRIDES.handedness = 'default';
    SYSTEM_OVERRIDES.perfMode = 'default';
    
    invalidateBambooCache();
    syncSliders(r);
    syncButtons(r);
    if (window.triggerAdminUpdate) window.triggerAdminUpdate();
  });

  r.querySelector('[data-action="hide"]').addEventListener('click', () => {
    r.classList.add('ba-hidden');
  });

  // Stop input propagation
  for (const ev of ['pointerdown', 'pointerup', 'pointermove', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click']) {
    r.addEventListener(ev, (e) => e.stopPropagation());
  }

  return r;
}

function ensurePanel() {
  if (root) return root;
  root = buildPanel();
  document.body.appendChild(root);
  return root;
}

function togglePanel() {
  ensurePanel().classList.toggle('ba-hidden');
}

// One-shot: fold any pre-existing raw `admin-group-collapsed-*` keys (left
// over from before this state was namespaced) into 'adminCollapsed', then
// remove them so they stop sitting unnamespaced on the shared origin.
function migrateLegacyCollapsedKeys() {
  Arcade.state.migrate('admin-panel-v1', () => {
    const collapsed = loadCollapsed();
    const legacyTitles = [...PARAM_GROUPS.map(g => g.title), 'system'];
    for (const title of legacyTitles) {
      const legacyKey = `admin-group-collapsed-${title}`;
      // Guarded: in a launcher-sandboxed (opaque-origin) frame localStorage
      // access throws — legacy raw keys are unreachable there by design,
      // so there is nothing to fold in.
      let raw = null;
      try { raw = localStorage.getItem(legacyKey); } catch (e) {}
      if (raw !== null) {
        collapsed[title] = raw === 'true';
        try { localStorage.removeItem(legacyKey); } catch (e) {}
      }
    }
    Arcade.state.set('adminCollapsed', collapsed, { exportable: false });
  });
}

export function initAdminPanel() {
  migrateLegacyCollapsedKeys();
  const params = new URLSearchParams(window.location.search);
  if (params.get('admin') === '1') {
    ensurePanel();
  }
  
  window.addEventListener('keydown', (e) => {
    if (e.key !== '`' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    togglePanel();
  });
}
