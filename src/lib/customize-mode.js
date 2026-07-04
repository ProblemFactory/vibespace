// CustomizeMode — Firefox-style "Customize Toolbar" edit mode for the chrome.
//
// Instead of hunting through the Settings dialog for abstract toggle names,
// the user enters an edit mode where every customizable element is outlined
// ON the real UI: click an element to hide/show it (hidden elements stay
// visible at low opacity while editing, so nothing ever disappears from the
// canvas), DRAG an element to move it — reorder within a bar or move it to a
// different bar entirely (e.g. usage donuts into the toolbar before hiding
// the taskbar). Structural choices (taskbar top/bottom + visibility, sidebar
// left/right) are segmented pills floating next to the bar they control.
// Everything writes settings keys, so persistence + multi-client sync come
// for free.
//
// References: Firefox Customize Toolbar (direct-manipulation canvas + drag
// between toolbar/palette + done bar), KDE Plasma panel edit mode (in-place
// outlines + per-bar controls), iOS jiggle mode (tap/drag the element itself).
//
// ── Arrangement model ──
// Zones are flex containers tagged data-zone in index.html:
//   toolbar-center · toolbar-right · taskbar-tray
// Movable elements live in exactly one zone; `chrome.arrangement` persists
// { zoneId: [elementId, …] }. applyArrangement() re-parents elements
// (appendChild preserves listeners) — fixed elements (⚙ gear, ☰+title,
// taskbar window items, [CMD]) are NOT part of the model and keep their DOM
// slots as anchors: movables are always appended after them. Core elements
// whose relocation would break the program (sidebar toggle glued to the
// sidebar edge, the window-item strip that IS the taskbar) are simply not
// registered here.

// Registry: one entry per customizable chrome element.
// hideKey: settings key for show/hide (null = core, always visible, still movable).
// Adding an element = one line here (+ a show() call in applyChromeSettings
// if it's hideable).
export const CHROME_ELEMENTS = [
  { id: 'layout-presets',    label: 'Layout presets',     hideKey: 'toolbar.showLayoutPresets',      defaultZone: 'toolbar-center' },
  { id: 'btn-presets',       label: 'Presets button',     hideKey: 'toolbar.showPresetsButton',      defaultZone: 'toolbar-right' },
  { id: 'btn-new-session',   label: 'New Session button', hideKey: null,                             defaultZone: 'toolbar-right' },
  { id: 'btn-terminal',      label: 'Terminal button',    hideKey: 'toolbar.showTerminalButton',     defaultZone: 'toolbar-right' },
  { id: 'btn-file-explorer', label: 'Files button',       hideKey: 'toolbar.showFileExplorerButton', defaultZone: 'toolbar-right' },
  { id: 'btn-browser',       label: 'Browser button',     hideKey: 'toolbar.showBrowserButton',      defaultZone: 'toolbar-right' },
  { id: 'desktop-previews',  label: 'Desktop previews',   hideKey: 'taskbar.showDesktopPreviews',    defaultZone: 'taskbar-tray' },
  { id: 'taskbar-usage',     label: 'Usage meters',       hideKey: 'taskbar.showUsage',              defaultZone: 'taskbar-tray' },
  { id: 'taskbar-status',    label: 'Window count',       hideKey: 'taskbar.showWindowCount',        defaultZone: 'taskbar-tray' },
];

export const ZONE_IDS = ['toolbar-center', 'toolbar-right', 'taskbar-tray'];

const ELEMENT_BY_ID = new Map(CHROME_ELEMENTS.map(e => [e.id, e]));
const STRUCT_KEYS = ['taskbar.position', 'taskbar.visibility', 'sidebar.position', 'chrome.zoneAlign'];

// Alignment targets (chrome.zoneAlign) — each gets a mini icon chip anchored
// to the element it aligns while editing.
const ALIGN_ICON = {
  left:   '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3v10M5 6h8M5 10h5"/></svg>',
  center: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3v10M3 6h10M5 10h6"/></svg>',
  right:  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M14 3v10M3 6h8M6 10h5"/></svg>',
};
const ALIGN_TARGETS = [
  { key: 'taskbar-items',  el: () => document.getElementById('taskbar-items'),
    label: 'Window items', options: ['left', 'center'], default: 'left',
    tips: { left: 'Window items left-aligned', center: 'Window items centered (Windows-11 style)' } },
  { key: 'toolbar-center', el: () => document.querySelector('[data-zone="toolbar-center"]'),
    label: 'Center area',  options: ['left', 'center', 'right'], default: 'center',
    tips: { left: 'Align left', center: 'Align center', right: 'Align right' } },
  { key: 'taskbar-tray',   el: () => document.getElementById('taskbar-tray'),
    label: 'Tray',         options: ['left', 'right'], default: 'right',
    tips: { left: 'Tray at the left end', right: 'Tray at the right end' } },
];

function zoneEl(zoneId) {
  return document.querySelector(`[data-zone="${zoneId}"]`);
}

/** Fill in a complete zone→ids map from a possibly partial/stale stored one. */
function normalizeArrangement(raw) {
  const out = {};
  for (const z of ZONE_IDS) out[z] = [];
  const seen = new Set();
  if (raw && typeof raw === 'object') {
    for (const z of ZONE_IDS) {
      for (const id of (Array.isArray(raw[z]) ? raw[z] : [])) {
        if (ELEMENT_BY_ID.has(id) && !seen.has(id)) { out[z].push(id); seen.add(id); }
      }
    }
  }
  // Anything unmentioned (fresh install, or an element added in an update)
  // goes to its default zone in registry order
  for (const e of CHROME_ELEMENTS) {
    if (!seen.has(e.id)) out[e.defaultZone].push(e.id);
  }
  return out;
}

/** Re-parent movable elements into their zones. Idempotent; listeners survive. */
export function applyArrangement(raw) {
  const norm = normalizeArrangement(raw);
  for (const [zoneId, ids] of Object.entries(norm)) {
    const zone = zoneEl(zoneId);
    if (!zone) continue;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) zone.appendChild(el);
    }
  }
}

export class CustomizeMode {
  constructor(app) {
    this.app = app;
    this.active = false;
    this._cleanup = [];
    this._justDragged = false;
  }

  enter() {
    if (this.active || this.app.isMobile) return;
    this.active = true;
    document.body.classList.add('customize-mode');

    // Dim + block the workspace (windows stay visible underneath as context)
    const overlay = document.createElement('div');
    overlay.className = 'cz-overlay';
    document.body.appendChild(overlay);
    this._cleanup.push(() => overlay.remove());

    // Sidebar position control lives on the sidebar — make sure it's on screen
    const sidebar = this.app.sidebar;
    this._sidebarWasOpen = sidebar?.isOpen;
    if (sidebar && !sidebar.isOpen) sidebar.toggle();

    // Re-render chrome with hidden items forced visible (cz-off dimmed)
    this.app._applyChromeSettings?.();

    // Item outlines: click toggles visibility, drag moves between/within zones
    for (const meta of CHROME_ELEMENTS) {
      const el = document.getElementById(meta.id);
      if (!el) continue;
      el.classList.add('cz-item');
      if (!meta.hideKey) el.classList.add('cz-core');
      const onClick = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (this._justDragged) return;
        if (!meta.hideKey) return; // core element: movable but not hideable
        const s = this.app.settings;
        s.set(meta.hideKey, !s.get(meta.hideKey));
      };
      el.addEventListener('click', onClick, true);
      const offDrag = this._setupDrag(el, meta);
      this._cleanup.push(() => {
        el.classList.remove('cz-item', 'cz-off', 'cz-core', 'cz-drag-src');
        el.removeAttribute('data-cz-tip');
        el.removeEventListener('click', onClick, true);
        offDrag();
      });
    }

    this._buildTaskbarPill();
    this._buildSidebarPill();
    this._buildPanel();
    this._buildAlignChips();

    // Live refresh on any relevant change (incl. remote clients while editing)
    const refresh = () => this._refresh();
    for (const k of [...CHROME_ELEMENTS.filter(e => e.hideKey).map(e => e.hideKey), ...STRUCT_KEYS]) {
      this.app.settings.on(k, refresh);
      this._cleanup.push(() => this.app.settings.off(k, refresh));
    }

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.exit(); }
    };
    document.addEventListener('keydown', onKey, true);
    this._cleanup.push(() => document.removeEventListener('keydown', onKey, true));

    this._refresh();
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove('customize-mode');
    for (const fn of this._cleanup.splice(0)) { try { fn(); } catch {} }
    if (this._sidebarWasOpen === false && this.app.sidebar?.isOpen) this.app.sidebar.toggle();
    // Re-render chrome normally (hidden items go back to display:none)
    this.app._applyChromeSettings?.();
  }

  // ── Drag to move / reorder ──
  // Pointer-based (project convention, rAF-coalesced), 5px threshold so a
  // plain click still toggles visibility. While dragging: a ghost follows the
  // cursor, allowed zones light up, an insertion marker shows the drop slot.
  _setupDrag(el, meta) {
    const onDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const startX = e.clientX, startY = e.clientY;
      let dragging = false, ghost = null, marker = null, raf = 0, last = e;

      const clearMarker = () => { marker?.remove(); marker = null; };
      const process = () => {
        raf = 0;
        const ev = last;
        if (!dragging) {
          if (Math.abs(ev.clientX - startX) < 5 && Math.abs(ev.clientY - startY) < 5) return;
          dragging = true;
          this._justDragged = true;
          ghost = el.cloneNode(true);
          ghost.classList.add('cz-ghost-drag');
          ghost.classList.remove('cz-item', 'cz-off');
          ghost.removeAttribute('id');
          document.body.appendChild(ghost);
          el.classList.add('cz-drag-src');
          for (const z of ZONE_IDS) zoneEl(z)?.classList.add('cz-zone-allowed');
        }
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        // Zone hit-test (ghost is pointer-events:none via CSS)
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const zone = under?.closest('[data-zone]');
        for (const z of ZONE_IDS) zoneEl(z)?.classList.remove('cz-zone-hover');
        clearMarker();
        if (!zone) return;
        zone.classList.add('cz-zone-hover');
        // Insertion slot among the zone's MOVABLE children (never before a
        // fixed anchor like the ⚙ gear — those aren't part of the model)
        marker = document.createElement('div');
        marker.className = 'cz-drop-marker';
        const siblings = [...zone.children].filter(c => c !== el && ELEMENT_BY_ID.has(c.id));
        let ref = null;
        for (const sib of siblings) {
          const r = sib.getBoundingClientRect();
          if (ev.clientX < r.left + r.width / 2) { ref = sib; break; }
        }
        if (ref) zone.insertBefore(marker, ref); else zone.appendChild(marker);
      };
      const onMove = (ev) => { last = ev; if (!raf) raf = requestAnimationFrame(process); };
      const onUp = () => {
        if (raf) cancelAnimationFrame(raf);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (!dragging) return; // plain click → the click handler toggles visibility
        ghost.remove();
        el.classList.remove('cz-drag-src');
        for (const z of ZONE_IDS) zoneEl(z)?.classList.remove('cz-zone-allowed', 'cz-zone-hover');
        if (marker) { marker.replaceWith(el); marker = null; }
        this._saveArrangement();
        // let the trailing click event fire (and be swallowed) first
        setTimeout(() => { this._justDragged = false; }, 0);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
    el.addEventListener('mousedown', onDown, true);
    return () => el.removeEventListener('mousedown', onDown, true);
  }

  /** Read the live DOM back into a zone→ids map and persist it. */
  _saveArrangement() {
    const arr = {};
    for (const z of ZONE_IDS) {
      const zone = zoneEl(z);
      arr[z] = zone ? [...zone.children].map(c => c.id).filter(id => ELEMENT_BY_ID.has(id)) : [];
    }
    this.app.settings.set('chrome.arrangement', arr);
  }

  // ── UI pieces ──

  _seg(label, key, options) {
    const wrap = document.createElement('span');
    wrap.className = 'cz-seg-wrap';
    const lab = document.createElement('span');
    lab.className = 'cz-seg-label';
    lab.textContent = label;
    const seg = document.createElement('span');
    seg.className = 'cz-seg';
    seg.dataset.czKey = key;
    for (const o of options) {
      const b = document.createElement('button');
      b.textContent = o.label;
      b.dataset.value = o.value;
      b.onclick = (e) => { e.stopPropagation(); this.app.settings.set(key, o.value); };
      seg.appendChild(b);
    }
    wrap.append(lab, seg);
    return wrap;
  }

  _buildTaskbarPill() {
    const taskbar = document.getElementById('taskbar');
    if (!taskbar) return;
    const pill = document.createElement('div');
    pill.className = 'cz-pill cz-pill-taskbar';
    pill.addEventListener('contextmenu', (e) => e.stopPropagation());
    pill.append(
      this._seg('Taskbar', 'taskbar.position', [
        { value: 'bottom', label: 'Bottom' }, { value: 'top', label: 'Top' },
      ]),
      this._seg('', 'taskbar.visibility', [
        { value: 'show', label: 'Show' }, { value: 'autohide', label: 'Auto-hide' }, { value: 'hidden', label: 'Hidden' },
      ]),
    );
    taskbar.appendChild(pill);
    this._cleanup.push(() => pill.remove());
  }

  _buildSidebarPill() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const pill = document.createElement('div');
    pill.className = 'cz-pill cz-pill-sidebar';
    pill.appendChild(this._seg('Sidebar', 'sidebar.position', [
      { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
    ]));
    sidebar.appendChild(pill);
    this._cleanup.push(() => pill.remove());
  }

  // Mini alignment chips — body-fixed (a chip inside #taskbar-items would be
  // clipped by its overflow-x scroll context), repositioned by _refresh on
  // every relevant change + window resize.
  _buildAlignChips() {
    this._alignChips = [];
    for (const t of ALIGN_TARGETS) {
      if (!t.el()) continue;
      const chip = document.createElement('div');
      chip.className = 'cz-align';
      chip.dataset.czAlignKey = t.key;
      const lab = document.createElement('span');
      lab.className = 'cz-align-label';
      lab.textContent = t.label;
      chip.appendChild(lab);
      for (const opt of t.options) {
        const b = document.createElement('button');
        b.innerHTML = ALIGN_ICON[opt];
        b.title = t.tips[opt];
        b.dataset.value = opt;
        b.onclick = (e) => {
          e.stopPropagation();
          const za = { ...(this.app.settings.get('chrome.zoneAlign') || {}) };
          if (opt === t.default) delete za[t.key]; else za[t.key] = opt;
          this.app.settings.set('chrome.zoneAlign', Object.keys(za).length ? za : null);
        };
        chip.appendChild(b);
      }
      document.body.appendChild(chip);
      this._alignChips.push({ target: t, chip });
      this._cleanup.push(() => chip.remove());
    }
    const onResize = () => this._positionAlignChips();
    window.addEventListener('resize', onResize);
    this._cleanup.push(() => { window.removeEventListener('resize', onResize); this._alignChips = []; });
  }

  _positionAlignChips() {
    if (!this._alignChips) return;
    const taskbarTop = document.body.classList.contains('taskbar-top');
    for (const { target, chip } of this._alignChips) {
      const el = target.el();
      if (!el) { chip.style.display = 'none'; continue; }
      const r = el.getBoundingClientRect();
      chip.style.display = '';
      const ch = chip.offsetHeight || 26;
      const inTaskbar = !!el.closest('#taskbar');
      // toolbar targets: chip below the bar; taskbar targets: above (flipped
      // when the taskbar is docked top)
      const below = inTaskbar ? taskbarTop : true;
      chip.style.top = (below ? r.bottom + 6 : r.top - ch - 6) + 'px';
      // taskbar-items spans most of the bar — centering its chip would collide
      // with the (centered) taskbar pill, so anchor it at the strip's left end
      const anchorX = target.key === 'taskbar-items' ? r.left + 8 : r.left + r.width / 2 - chip.offsetWidth / 2;
      chip.style.left = Math.max(8, Math.min(anchorX, innerWidth - chip.offsetWidth - 8)) + 'px';
    }
  }

  _buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'cz-panel';
    const hint = document.createElement('span');
    hint.className = 'cz-hint';
    hint.innerHTML = '<b>Customize mode</b> — click an outlined element to show / hide it, drag to move it';
    const btn = (label, cls, onClick) => {
      const b = document.createElement('button');
      b.className = 'cz-btn' + (cls ? ' ' + cls : '');
      b.textContent = label;
      b.onclick = onClick;
      return b;
    };
    panel.append(
      hint,
      btn('Reset', '', () => {
        const s = this.app.settings;
        for (const k of [...CHROME_ELEMENTS.filter(e => e.hideKey).map(e => e.hideKey), ...STRUCT_KEYS]) s.reset(k);
        s.reset('chrome.arrangement');
      }),
      btn('All settings…', '', () => { this.exit(); this.app._settingsUI?.open(); }),
      btn('Done', 'cz-done', () => this.exit()),
    );
    document.body.appendChild(panel);
    this._cleanup.push(() => panel.remove());
  }

  _refresh() {
    if (!this.active) return;
    const s = this.app.settings;
    for (const meta of CHROME_ELEMENTS) {
      const el = document.getElementById(meta.id);
      if (!el) continue;
      const on = meta.hideKey ? !!s.get(meta.hideKey) : true;
      el.classList.toggle('cz-off', !on);
      el.dataset.czTip = meta.hideKey
        ? `${meta.label} — click to ${on ? 'hide' : 'show'}, drag to move`
        : `${meta.label} — drag to move`;
    }
    for (const seg of document.querySelectorAll('.cz-seg')) {
      const val = s.get(seg.dataset.czKey);
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('active', b.dataset.value === val);
    }
    // Alignment chips: active states + reposition (bars may have moved)
    const za = s.get('chrome.zoneAlign') || {};
    for (const chip of document.querySelectorAll('.cz-align')) {
      const t = ALIGN_TARGETS.find(t => t.key === chip.dataset.czAlignKey);
      const val = za[t.key] || t.default;
      for (const b of chip.querySelectorAll('button')) b.classList.toggle('active', b.dataset.value === val);
    }
    this._positionAlignChips();
    // Whole-taskbar ghost when set to Hidden (kept on canvas while editing)
    document.getElementById('taskbar')?.classList.toggle('cz-ghost', s.get('taskbar.visibility') === 'hidden');
  }
}
