// Bamboo tuning admin panel. Toggle with backtick (`) on keyboard, or load
// the page with ?admin=1 to have it visible at start. Edits BAMBOO_PARAMS
// live and calls invalidateBambooCache() so changes show up on the next
// frame. The "Copy" button writes the current params object to the clipboard
// as JSON for pasting back into world.js defaults.

import { BAMBOO_PARAMS, invalidateBambooCache, applyBambooProfile } from './renderer/world.js';

// Slider specs grouped by purpose. `int: true` snaps to integer values.
// `format` controls the displayed value string (default: 2 decimals for
// floats, integer-cast for ints).
const PARAM_GROUPS = [
  {
    title: 'Layout',
    params: [
      { key: 'edgeBand',  label: 'Edge band',   min: 0.10, max: 0.40, step: 0.01 },
      { key: 'bankYFrac', label: 'Bank Y',      min: 0.85, max: 1.00, step: 0.005, decimals: 3 },
    ],
  },
  {
    title: 'Side density',
    params: [
      { key: 'towersPerSide',    label: 'FG stalks',   min: 0, max: 6, step: 1, int: true },
      { key: 'trunksPerSide',    label: 'BG trunks',   min: 0, max: 5, step: 1, int: true },
      { key: 'midgroundPerSide', label: 'Midground',   min: 0, max: 6, step: 1, int: true },
      { key: 'cornerPerSide',    label: 'Corners',     min: 0, max: 5, step: 1, int: true },
      { key: 'caneTopperScale',  label: 'Cane topper', min: 0, max: 2, step: 0.05 },
    ],
  },
  {
    title: 'Canopy',
    params: [
      { key: 'canopyPxPerCluster', label: 'Px/cluster', min: 20, max: 120, step: 2, int: true },
      { key: 'canopyMin',          label: 'Min count',  min: 4,  max: 60,  step: 2, int: true },
      { key: 'canopyMax',          label: 'Max count',  min: 12, max: 96,  step: 2, int: true },
    ],
  },
  {
    title: 'Sprite trunk ratios',
    params: [
      { key: 'baseTrunkFrac', label: 'Base trunk', min: 0.10, max: 0.40, step: 0.01 },
      { key: 'caneTrunkFrac', label: 'Cane trunk', min: 0.40, max: 1.00, step: 0.01 },
      { key: 'tallTrunkFrac', label: 'Tall trunk', min: 0.06, max: 0.30, step: 0.01 },
      { key: 'baseGrassFrac', label: 'Base grass', min: 0.15, max: 0.50, step: 0.01 },
    ],
  },
  {
    title: 'Preview',
    params: [
      { key: 'levelOverride', label: 'Force level', min: 0, max: 12, step: 1, int: true },
    ],
  },
];

// Snapshot of starting values so Reset can restore them. JSON round-trip
// gives a real copy (params are flat primitives).
const DEFAULTS = JSON.parse(JSON.stringify(BAMBOO_PARAMS));

function fmtValue(spec, v) {
  if (spec.int) return String(v | 0);
  const d = spec.decimals != null ? spec.decimals : 2;
  return v.toFixed(d);
}

// Walks every slider in the panel and snaps both the input value and the
// displayed text to the current BAMBOO_PARAMS state. Called after Reset and
// after switching profiles, so the UI reflects the new values.
function syncSliders(root) {
  for (const group of PARAM_GROUPS) {
    for (const spec of group.params) {
      const inp = root.querySelector(`input[data-key="${spec.key}"]`);
      if (!inp) continue;
      inp.value = BAMBOO_PARAMS[spec.key];
      const val = inp.parentElement.querySelector('.ba-val');
      if (val) val.textContent = fmtValue(spec, BAMBOO_PARAMS[spec.key]);
    }
  }
}

let root = null;

function buildPanel() {
  const r = document.createElement('div');
  r.id = 'bamboo-admin';
  r.innerHTML = `
    <div class="ba-header">
      <span class="ba-title">Bamboo Tuning</span>
      <button type="button" data-action="copy" title="Copy JSON to clipboard">Copy</button>
      <button type="button" data-action="reset" title="Reset to defaults">Reset</button>
      <button type="button" data-action="hide" title="Hide (press \` to toggle)">×</button>
    </div>
    <div class="ba-profile-row">
      <span class="ba-profile-label">Load profile:</span>
      <button type="button" data-profile="small">Small</button>
      <button type="button" data-profile="wide">Wide</button>
    </div>
    <div class="ba-body"></div>
  `;
  const body = r.querySelector('.ba-body');

  // Profile-switch buttons: load the named profile values into BAMBOO_PARAMS,
  // then walk every slider in the panel and snap it to the new value.
  r.querySelectorAll('button[data-profile]').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyBambooProfile(btn.dataset.profile);
      syncSliders(r);
    });
  });

  for (const group of PARAM_GROUPS) {
    const g = document.createElement('div');
    g.className = 'ba-group';
    const title = document.createElement('div');
    title.className = 'ba-group-title';
    title.textContent = group.title;
    g.appendChild(title);
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
      inp.value = BAMBOO_PARAMS[spec.key];
      inp.dataset.key = spec.key;
      const val = document.createElement('span');
      val.className = 'ba-val';
      val.textContent = fmtValue(spec, BAMBOO_PARAMS[spec.key]);
      inp.addEventListener('input', () => {
        let v = parseFloat(inp.value);
        if (spec.int) v = v | 0;
        BAMBOO_PARAMS[spec.key] = v;
        val.textContent = fmtValue(spec, v);
        invalidateBambooCache();
      });
      row.appendChild(lbl);
      row.appendChild(inp);
      row.appendChild(val);
      g.appendChild(row);
    }
    body.appendChild(g);
  }

  // Button actions
  r.querySelector('[data-action="copy"]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const json = JSON.stringify(BAMBOO_PARAMS, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1400);
    } catch (_) {
      // Clipboard API can fail on http:// or in iframes — fall back to
      // dumping to console so the user can still grab the values.
      console.log('[BAMBOO_PARAMS]', json);
      btn.textContent = 'See console';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1400);
    }
  });
  r.querySelector('[data-action="reset"]').addEventListener('click', () => {
    Object.assign(BAMBOO_PARAMS, DEFAULTS);
    invalidateBambooCache();
    syncSliders(r);
  });
  r.querySelector('[data-action="hide"]').addEventListener('click', () => {
    r.classList.add('ba-hidden');
  });

  // Stop input events on the panel from bubbling to the canvas underneath
  // — without this, dragging a slider can also fire an aim/launch on the
  // game canvas because input.js listens at the window/document level.
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

// Public entry point — call once at startup from main.js.
export function initAdminPanel() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('admin') === '1') {
    ensurePanel();
  }
  // Backtick toggle for laptop use. Avoid when typing in any input/textarea.
  window.addEventListener('keydown', (e) => {
    if (e.key !== '`' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    togglePanel();
  });
}
