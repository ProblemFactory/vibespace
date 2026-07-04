// CustomizeMode — Firefox-style "Customize Toolbar" edit mode for the chrome.
//
// Instead of hunting through the Settings dialog for abstract toggle names,
// the user enters an edit mode where every customizable element is outlined
// ON the real UI: click an element to hide/show it (hidden elements stay
// visible at low opacity while editing, so nothing ever disappears from the
// canvas), and structural choices (taskbar top/bottom + visibility, sidebar
// left/right) are segmented pills floating next to the bar they control.
// Everything writes the SAME settings keys as the Settings dialog, so
// persistence + multi-client sync come for free.
//
// References: Firefox Customize Toolbar (direct-manipulation canvas + done
// bar), KDE Plasma panel edit mode (in-place outlines + per-bar controls),
// iOS jiggle mode (tap the element itself to remove).

// Registry: settings key → element id + human label. Adding a new
// customizable chrome element = one line here + the show() call in
// applyChromeSettings (app.js).
export const CHROME_ITEMS = [
  { key: 'toolbar.showLayoutPresets',      id: 'layout-presets',    label: 'Layout presets' },
  { key: 'toolbar.showPresetsButton',      id: 'btn-presets',       label: 'Presets button' },
  { key: 'toolbar.showTerminalButton',     id: 'btn-terminal',      label: 'Terminal button' },
  { key: 'toolbar.showFileExplorerButton', id: 'btn-file-explorer', label: 'Files button' },
  { key: 'toolbar.showBrowserButton',      id: 'btn-browser',       label: 'Browser button' },
  { key: 'taskbar.showDesktopPreviews',    id: 'desktop-previews',  label: 'Desktop previews' },
  { key: 'taskbar.showUsage',              id: 'taskbar-usage',     label: 'Usage meters' },
  { key: 'taskbar.showWindowCount',        id: 'taskbar-status',    label: 'Window count' },
];

const STRUCT_KEYS = ['taskbar.position', 'taskbar.visibility', 'sidebar.position'];

export class CustomizeMode {
  constructor(app) {
    this.app = app;
    this.active = false;
    this._cleanup = [];
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

    // Item outlines + click-to-toggle (capture phase so the button's real
    // action never fires while editing)
    for (const it of CHROME_ITEMS) {
      const el = document.getElementById(it.id);
      if (!el) continue;
      el.classList.add('cz-item');
      const onClick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const s = this.app.settings;
        s.set(it.key, !s.get(it.key));
      };
      el.addEventListener('click', onClick, true);
      this._cleanup.push(() => { el.classList.remove('cz-item', 'cz-off'); el.removeAttribute('data-cz-tip'); el.removeEventListener('click', onClick, true); });
    }

    this._buildTaskbarPill();
    this._buildSidebarPill();
    this._buildPanel();

    // Live refresh on any relevant change (incl. remote clients while editing)
    const refresh = () => this._refresh();
    for (const k of [...CHROME_ITEMS.map(i => i.key), ...STRUCT_KEYS]) {
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

  _buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'cz-panel';
    const hint = document.createElement('span');
    hint.className = 'cz-hint';
    hint.innerHTML = '<b>Customize mode</b> — click any outlined element to show / hide it';
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
        for (const k of [...CHROME_ITEMS.map(i => i.key), ...STRUCT_KEYS]) s.reset(k);
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
    for (const it of CHROME_ITEMS) {
      const el = document.getElementById(it.id);
      if (!el) continue;
      const on = !!s.get(it.key);
      el.classList.toggle('cz-off', !on);
      el.dataset.czTip = `${it.label} — click to ${on ? 'hide' : 'show'}`;
    }
    for (const seg of document.querySelectorAll('.cz-seg')) {
      const val = s.get(seg.dataset.czKey);
      for (const b of seg.querySelectorAll('button')) b.classList.toggle('active', b.dataset.value === val);
    }
    // Whole-taskbar ghost when set to Hidden (kept on canvas while editing)
    document.getElementById('taskbar')?.classList.toggle('cz-ghost', s.get('taskbar.visibility') === 'hidden');
  }
}
