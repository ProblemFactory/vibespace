import { THEMES, BUILTIN_THEMES } from './themes.js';
import { showToast, showConfirmDialog, uiScale, escHtml, heldWordsOf, storeHeldWords } from './utils.js';
import { heldBodyOf, noteStoreHeld } from './store-held.js'; // B-225b: a held custom-themes file — no editor rows, its words
import { t, tc } from './i18n.js'; // lane ui-language (the walk's gear-and-system-2: the Theme Editor was English in every language)
import { themeWord } from './value-words.js'; // a built-in theme's name in the reader's words (lane ui-language)
import { startPointerDrag } from './drag-feed.js'; // THE feed for every drag door (lane-drag-release verify r2 census)

// All CSS custom properties that themes define
const CSS_VAR_DEFS = [
  // Backgrounds
  { key: '--bg-root', label: tc('theme-color', 'Root'), group: 'Backgrounds' },
  { key: '--bg-workspace', label: t('Workspace'), group: 'Backgrounds' },
  { key: '--bg-window', label: t('Window'), group: 'Backgrounds' },
  { key: '--bg-titlebar', label: t('Title Bar'), group: 'Backgrounds' },
  { key: '--bg-titlebar-active', label: t('Title Bar (active)'), group: 'Backgrounds' },
  { key: '--bg-toolbar', label: t('Toolbar'), group: 'Backgrounds' },
  { key: '--bg-taskbar', label: t('Taskbar'), group: 'Backgrounds' },
  { key: '--bg-input', label: t('Input'), group: 'Backgrounds' },
  { key: '--bg-dialog', label: t('Dialog'), group: 'Backgrounds' },
  { key: '--bg-sidebar', label: t('Sidebar'), group: 'Backgrounds' },
  // Text
  { key: '--text', label: tc('theme-color', 'Primary'), group: 'Text' },
  { key: '--text-secondary', label: t('Secondary'), group: 'Text' },
  { key: '--text-dim', label: t('Dim'), group: 'Text' },
  // Accent
  { key: '--accent', label: t('Accent'), group: 'Accent' },
  { key: '--accent-hover', label: t('Accent Hover'), group: 'Accent' },
  { key: '--accent-dim', label: t('Accent Dim'), group: 'Accent', isRgba: true },
  // Status
  { key: '--green', label: t('Green'), group: 'Status' },
  { key: '--red', label: t('Red'), group: 'Status' },
  { key: '--yellow', label: t('Yellow'), group: 'Status' },
  { key: '--blue', label: t('Blue'), group: 'Status' },
  // lane cache-warmth-tiles: the five warmth tokens. `derived` = the theme's own default (public/style.css derives each
  // from the theme's raw status hues — q-059 r5: green → blue → amber → red, expired = dim text at 45 %) — a row starts as
  // that text, so a theme saved from a built-in base keeps deriving from ITS hues instead of freezing the base's; any CSS
  // colour typed here overrides it
  { key: '--warmth-fresh', label: t('Fresh (0–20 of 60 min)'), group: 'Cache warmth', isText: true, derived: 'var(--green)' },
  { key: '--warmth-mid', label: t('Mid (20–40)'), group: 'Cache warmth', isText: true, derived: 'var(--blue, #3b82f6)' },
  { key: '--warmth-late', label: t('Late (40–50)'), group: 'Cache warmth', isText: true, derived: 'var(--yellow)' },
  { key: '--warmth-critical', label: t('Critical (50–60)'), group: 'Cache warmth', isText: true, derived: 'var(--red)' },
  { key: '--warmth-expired', label: t('Expired'), group: 'Cache warmth', isText: true, derived: 'color-mix(in srgb, var(--text-dim) 45%, transparent)' },
  // Borders
  { key: '--border', label: t('Border'), group: 'Borders', isRgba: true },
  { key: '--border-active', label: t('Border Active'), group: 'Borders', isRgba: true },
  { key: '--bg-hover', label: t('Hover'), group: 'Borders', isRgba: true },
  // Terminal
  { key: '--terminal-bg', label: t('Terminal BG'), group: 'Terminal CSS' },
  { key: '--terminal-fg', label: t('Terminal FG'), group: 'Terminal CSS' },
  { key: '--terminal-cursor', label: t('Terminal Cursor'), group: 'Terminal CSS' },
  // Effects
  { key: '--shadow-window', label: t('Window Shadow'), group: 'Effects', isText: true },
  { key: '--shadow-active', label: t('Active Shadow'), group: 'Effects', isText: true },
  // Dimensions
  { key: '--radius', label: t('Border Radius'), group: 'Dimensions', isText: true },
  { key: '--radius-sm', label: t('Border Radius (sm)'), group: 'Dimensions', isText: true },
];

const TERMINAL_COLOR_DEFS = [
  { key: 'background', label: t('Background'), group: 'Base' },
  { key: 'foreground', label: t('Foreground'), group: 'Base' },
  { key: 'cursor', label: t('Cursor'), group: 'Base' },
  { key: 'cursorAccent', label: t('Cursor Accent'), group: 'Base' },
  { key: 'selectionBackground', label: t('Selection'), group: 'Base', isRgba: true },
  // Normal
  { key: 'black', label: t('Black'), group: 'Normal' },
  { key: 'red', label: t('Red'), group: 'Normal' },
  { key: 'green', label: t('Green'), group: 'Normal' },
  { key: 'yellow', label: t('Yellow'), group: 'Normal' },
  { key: 'blue', label: t('Blue'), group: 'Normal' },
  { key: 'magenta', label: t('Magenta'), group: 'Normal' },
  { key: 'cyan', label: t('Cyan'), group: 'Normal' },
  { key: 'white', label: t('White'), group: 'Normal' },
  // Bright
  { key: 'brightBlack', label: t('Bright Black'), group: 'Bright' },
  { key: 'brightRed', label: t('Bright Red'), group: 'Bright' },
  { key: 'brightGreen', label: t('Bright Green'), group: 'Bright' },
  { key: 'brightYellow', label: t('Bright Yellow'), group: 'Bright' },
  { key: 'brightBlue', label: t('Bright Blue'), group: 'Bright' },
  { key: 'brightMagenta', label: t('Bright Magenta'), group: 'Bright' },
  { key: 'brightCyan', label: t('Bright Cyan'), group: 'Bright' },
  { key: 'brightWhite', label: t('Bright White'), group: 'Bright' },
];

// B-2e7b (lane cache-warmth-ramp r2 found it): a save stored EVERY row as the person's choice — a derived row nobody touched
// too, so its derivation froze in the theme and every later change of the derivation needed a migration (2026-11-warmth-ramp-
// derived). THE CSS A SAVE STORES: the rows minus each derived row whose value is still its derivation (the theme's default,
// not a choice — the theme keeps deriving from its own hues); THE CSS THE EDITOR SHOWS for a saved theme: a derived row it
// did not store reads as its derivation again
const storedCss = (values) => Object.fromEntries(Object.entries(values || {}).filter(([k, v]) => !CSS_VAR_DEFS.some((d) => d.key === k && d.derived && String(v).trim() === d.derived)));
const shownCss = (saved) => { const css = { ...(saved || {}) }; for (const d of CSS_VAR_DEFS) if (d.derived && !Object.prototype.hasOwnProperty.call(css, d.key)) css[d.key] = d.derived; return css; };

const CSS_VAR_GROUPS = [...new Set(CSS_VAR_DEFS.map(d => d.group))];
const TERM_COLOR_GROUPS = [...new Set(TERMINAL_COLOR_DEFS.map(d => d.group))];

class ThemeEditor {
  constructor(app) {
    this.app = app;
    this._cssValues = {};
    this._termValues = {};
    this._customThemes = {};
    this._previewActive = false;
    this._originalTheme = null;
  }

  open(startFrom) {
    this._originalTheme = this.app.themeManager.current;
    // B-225b R4: a HELD custom-themes file — the editor shows no rows (nothing this page holds is the hub's list), only its words
    this._loadCustomThemes().then(() => { if (this._held) { showToast(storeHeldWords(this._held), { type: 'error' }); return; } this._showDialog(startFrom); });
  }

  async _loadCustomThemes() {
    this._held = null;
    try {
      const res = await fetch('/api/custom-themes');
      if (!res.ok) {
        let b = null;
        try { b = await res.json(); } catch { b = null; }
        const h = heldBodyOf(b);
        if (h) { this._held = h; noteStoreHeld(h); }
        throw new Error();
      }
      this._customThemes = await res.json();
    } catch { this._customThemes = {}; }
  }

  _populateFromTheme(themeName) {
    // CSS vars
    const varNames = CSS_VAR_DEFS.map(d => d.key);
    // For custom themes, read from saved data
    if (themeName.startsWith('custom-')) {
      const name = themeName.slice(7);
      const saved = this._customThemes[name];
      if (saved) {
        this._cssValues = shownCss(saved.css);   // B-2e7b: a derived row the save left out shows its derivation
        this._termValues = { ...saved.terminal };
        return;
      }
    }
    this._cssValues = this.app.themeManager.extractThemeValues(themeName, varNames);
    for (const d of CSS_VAR_DEFS) if (d.derived) this._cssValues[d.key] = d.derived; // a derived token starts as its derivation (lane cache-warmth-tiles)
    // Terminal colors from THEMES
    const term = THEMES[themeName]?.terminal || THEMES.dark.terminal;
    this._termValues = { ...term };
  }

  _showDialog(startFrom) {
    // Remove existing panel
    document.querySelectorAll('.theme-editor-panel').forEach(el => el.remove());
    this._panel = null;

    const baseTheme = startFrom || this._originalTheme;
    this._populateFromTheme(baseTheme);

    const panel = document.createElement('div');
    panel.className = 'theme-editor-panel';
    this._panel = panel;

    // Header (draggable)
    const header = document.createElement('div');
    header.className = 'theme-editor-header';
    const title = document.createElement('h3');
    title.textContent = t('Theme Editor');
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dialog-close';
    closeBtn.textContent = '\u2715';
    closeBtn.onclick = () => this._close();
    header.append(title, closeBtn);

    // Make header draggable
    this._setupDrag(header, panel);

    // Controls bar
    const controls = document.createElement('div');
    controls.className = 'theme-editor-controls';

    // "Start from" selector
    const fromLabel = document.createElement('label');
    fromLabel.textContent = t('Base:');
    const fromSel = document.createElement('select');
    fromSel.className = 'theme-editor-select';
    for (const name of BUILTIN_THEMES) {
      const o = document.createElement('option');
      o.value = name; o.textContent = themeWord(name, t);
      fromSel.appendChild(o);
    }
    const customNames = Object.keys(this._customThemes);
    if (customNames.length) {
      const sep = document.createElement('option');
      sep.disabled = true; sep.textContent = '\u2500\u2500 ' + t('Custom') + ' \u2500\u2500';
      fromSel.appendChild(sep);
      for (const name of customNames) {
        const o = document.createElement('option');
        o.value = 'custom-' + name; o.textContent = name;
        fromSel.appendChild(o);
      }
    }
    fromSel.value = baseTheme;
    fromSel.onchange = () => {
      this._populateFromTheme(fromSel.value);
      this._renderBody(body);
      this._applyLivePreview();
    };

    // Theme name input
    const nameLabel = document.createElement('label');
    nameLabel.textContent = t('Name:');
    const nameInput = document.createElement('input');
    nameInput.className = 'theme-editor-name';
    nameInput.placeholder = t('My Theme');
    if (baseTheme.startsWith('custom-')) {
      nameInput.value = baseTheme.slice(7);
    }

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'theme-editor-save';
    saveBtn.textContent = t('Save');
    saveBtn.onclick = () => this._save(nameInput.value.trim());

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'theme-editor-delete';
    deleteBtn.textContent = t('Delete');
    deleteBtn.onclick = () => this._delete(fromSel, nameInput);

    controls.append(fromLabel, fromSel, nameLabel, nameInput, saveBtn, deleteBtn);

    // Preview (fixed, not scrollable)
    const preview = document.createElement('div');
    preview.className = 'theme-editor-preview';
    preview.appendChild(this._buildPreviewCard());
    this._previewEl = preview;

    // Body (scrollable)
    const body = document.createElement('div');
    body.className = 'theme-editor-body';
    this._renderBody(body);

    // Resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'theme-editor-resize';
    this._setupResize(resizeHandle, panel);

    panel.append(header, controls, preview, body, resizeHandle);
    document.body.appendChild(panel);

    // Start live preview
    this._applyLivePreview();
  }

  _setupDrag(handle, panel) {
    let startX, startY, startLeft, startTop;
    const onMove = (e) => {
      panel.style.left = (startLeft + (e.clientX - startX) / uiScale()) + 'px';
      panel.style.top = (startTop + (e.clientY - startY) / uiScale()) + 'px';
    };
    handle.addEventListener('pointerdown', (e) => { // THE DOOR (verify r2 census): captured on the handle, fed by the one feed
      if (e.target.tagName === 'BUTTON' || e.button !== 0 || e.isPrimary === false) return;
      const rect = panel.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      // rect is viewport px; the fixed panel's style takes layout px (F5)
      startLeft = rect.left / uiScale(); startTop = rect.top / uiScale();
      // Switch from right-positioned to left-positioned on first drag
      panel.style.right = 'auto';
      panel.style.left = (rect.left / uiScale()) + 'px';
      panel.style.top = (rect.top / uiScale()) + 'px';
      startPointerDrag(handle, e, { onMove, onEnd: () => {}, shield: 'theme-editor:move' });
    });
    handle.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'BUTTON' && e.button === 0) e.preventDefault(); }); // the compat press: no selection
  }

  _setupResize(handle, panel) {
    let startX, startY, startW, startH;
    const onMove = (e) => {
      const w = Math.max(320, startW + (e.clientX - startX) / uiScale());
      const h = Math.max(300, startH + (e.clientY - startY) / uiScale());
      panel.style.width = w + 'px';
      panel.style.height = h + 'px';
    };
    handle.addEventListener('pointerdown', (e) => { // THE DOOR (verify r2 census)
      if (e.button !== 0 || e.isPrimary === false) return;
      startX = e.clientX; startY = e.clientY;
      startW = panel.offsetWidth; startH = panel.offsetHeight;
      startPointerDrag(handle, e, { onMove, onEnd: () => {}, shield: 'theme-editor:size' });
    });
    handle.addEventListener('mousedown', (e) => { if (e.button === 0) e.preventDefault(); });
  }

  _renderBody(body) {
    body.innerHTML = '';

    // CSS Variables section
    const cssSection = document.createElement('div');
    cssSection.className = 'theme-editor-section';
    const cssSectionTitle = document.createElement('h4');
    cssSectionTitle.textContent = t('UI Colors');
    cssSectionTitle.className = 'theme-editor-section-title';
    cssSection.appendChild(cssSectionTitle);

    for (const group of CSS_VAR_GROUPS) {
      const groupEl = this._buildGroup(group,
        CSS_VAR_DEFS.filter(d => d.group === group),
        this._cssValues, 'css');
      cssSection.appendChild(groupEl);
    }
    body.appendChild(cssSection);

    // Terminal Colors section
    const termSection = document.createElement('div');
    termSection.className = 'theme-editor-section';
    const termTitle = document.createElement('h4');
    termTitle.textContent = t('Terminal ANSI Colors');
    termTitle.className = 'theme-editor-section-title';
    termSection.appendChild(termTitle);

    for (const group of TERM_COLOR_GROUPS) {
      const groupEl = this._buildGroup(group,
        TERMINAL_COLOR_DEFS.filter(d => d.group === group),
        this._termValues, 'terminal');
      termSection.appendChild(groupEl);
    }
    body.appendChild(termSection);
  }

  _buildPreviewCard() {
    const card = document.createElement('div');
    card.className = 'theme-preview-card';
    const w = (x) => escHtml(t(x)), a = (x) => escHtml(tc('ansi', x)); // the preview's words, in the reader's language
    card.innerHTML = `
      <div class="tp-row">
        <div class="tp-bg" style="background:var(--bg-root)" title="--bg-root">
          <div class="tp-bg" style="background:var(--bg-sidebar);flex:0 0 60px;padding:6px" title="--bg-sidebar">
            <div style="font-size:9px;color:var(--text-dim)">${w('Sidebar')}</div>
            <div style="font-size:10px;color:var(--text);margin-top:3px">${w('Session')}</div>
            <div style="font-size:9px;color:var(--text-secondary);margin-top:1px">~/project</div>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;gap:4px;padding:4px">
            <div class="tp-bg" style="background:var(--bg-toolbar);padding:4px 8px;border-radius:var(--radius-sm)" title="--bg-toolbar">
              <span style="font-size:9px;color:var(--text-dim)">${w('Toolbar')}</span>
              <span style="font-size:9px;color:var(--accent);margin-left:8px;cursor:default" title="--accent">${w('Accent')}</span>
              <span style="font-size:9px;color:var(--accent-hover);margin-left:4px" title="--accent-hover">${w('Hover')}</span>
            </div>
            <div style="flex:1;display:flex;gap:4px">
              <div class="tp-bg" style="background:var(--bg-window);flex:1;border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;flex-direction:column" title="--bg-window">
                <div style="background:var(--bg-titlebar);padding:3px 6px;border-radius:var(--radius-sm) var(--radius-sm) 0 0;font-size:9px;color:var(--text-dim);display:flex;justify-content:space-between" title="--bg-titlebar">
                  <span>${w('Window')}</span><span style="color:var(--green)" title="--green">${w('Live')}</span>
                </div>
                <div style="background:var(--bg-titlebar-active);padding:3px 6px;font-size:9px;color:var(--text);border-bottom:1px solid var(--border-active)" title="--bg-titlebar-active + --border-active">${w('Active Title')}</div>
                <div style="flex:1;padding:6px;font-size:9px">
                  <span style="color:var(--text)" title="--text">${w('Primary text')}</span><br>
                  <span style="color:var(--text-secondary)" title="--text-secondary">${w('Secondary text')}</span><br>
                  <span style="color:var(--text-dim)" title="--text-dim">${w('Dim text')}</span>
                </div>
              </div>
              <div style="flex:1;display:flex;flex-direction:column;gap:4px">
                <div class="tp-bg" style="background:var(--bg-dialog);flex:1;border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px" title="--bg-dialog">
                  <div style="font-size:9px;color:var(--text)">${w('Dialog')}</div>
                  <input style="margin-top:3px;width:calc(100% - 12px);background:var(--bg-input);border:1px solid var(--border);color:var(--text);padding:2px 4px;border-radius:var(--radius-sm);font-size:9px" value="${w('Input field')}" readonly title="--bg-input">
                  <div style="margin-top:4px;display:flex;gap:3px;flex-wrap:wrap">
                    <span class="tp-badge" style="background:var(--green);color:#fff" title="--green">${w('Live')}</span>
                    <span class="tp-badge" style="background:var(--red);color:#fff" title="--red">${w('Error')}</span>
                    <span class="tp-badge" style="background:var(--yellow);color:#000" title="--yellow">${w('Warn')}</span>
                    <span class="tp-badge" style="background:var(--blue);color:#fff" title="--blue">${w('Info')}</span>
                  </div>
                  <div style="margin-top:4px;padding:3px 6px;background:var(--bg-hover);border-radius:var(--radius-sm);font-size:9px;color:var(--text-secondary)" title="--bg-hover">${w('Hover state')}</div>
                </div>
              </div>
            </div>
            <div class="tp-bg" style="background:var(--bg-taskbar);padding:3px 8px;border-radius:var(--radius-sm);font-size:9px;color:var(--text-dim)" title="--bg-taskbar">${w('Taskbar')}</div>
          </div>
        </div>
      </div>
      <div class="tp-row" style="margin-top:6px">
        <div class="tp-terminal" style="background:var(--terminal-bg);border-radius:var(--radius-sm);padding:6px;font-family:'SF Mono','Fira Code',monospace;font-size:10px;line-height:1.5" title="${w('Terminal')}">
          <span style="color:var(--terminal-fg)" title="--terminal-fg">$ </span><span style="color:var(--terminal-cursor);text-decoration:underline" title="--terminal-cursor">_</span><br>
          <span style="color:var(--terminal-fg)">${w('Normal')} </span>
          <span class="tp-ansi" style="color:var(--t-black,#000)" data-c="black">${a('Blk')}</span>
          <span class="tp-ansi" style="color:var(--t-red,red)" data-c="red">${a('Red')}</span>
          <span class="tp-ansi" style="color:var(--t-green,green)" data-c="green">${a('Grn')}</span>
          <span class="tp-ansi" style="color:var(--t-yellow,yellow)" data-c="yellow">${a('Yel')}</span>
          <span class="tp-ansi" style="color:var(--t-blue,blue)" data-c="blue">${a('Blu')}</span>
          <span class="tp-ansi" style="color:var(--t-magenta,magenta)" data-c="magenta">${a('Mag')}</span>
          <span class="tp-ansi" style="color:var(--t-cyan,cyan)" data-c="cyan">${a('Cyn')}</span>
          <span class="tp-ansi" style="color:var(--t-white,white)" data-c="white">${a('Wht')}</span><br>
          <span style="color:var(--terminal-fg)">${w('Bright')} </span>
          <span class="tp-ansi" data-c="brightBlack">${a('Blk')}</span>
          <span class="tp-ansi" data-c="brightRed">${a('Red')}</span>
          <span class="tp-ansi" data-c="brightGreen">${a('Grn')}</span>
          <span class="tp-ansi" data-c="brightYellow">${a('Yel')}</span>
          <span class="tp-ansi" data-c="brightBlue">${a('Blu')}</span>
          <span class="tp-ansi" data-c="brightMagenta">${a('Mag')}</span>
          <span class="tp-ansi" data-c="brightCyan">${a('Cyn')}</span>
          <span class="tp-ansi" data-c="brightWhite">${a('Wht')}</span>
        </div>
      </div>`;

    // Apply terminal ANSI colors to preview spans
    this._updatePreviewTermColors(card);
    return card;
  }

  _updatePreviewTermColors(card) {
    if (!card) card = this._previewEl?.querySelector('.theme-preview-card');
    if (!card) return;
    const spans = card.querySelectorAll('.tp-ansi[data-c]');
    for (const span of spans) {
      const key = span.dataset.c;
      if (this._termValues[key]) span.style.color = this._termValues[key];
    }
  }

  _buildGroup(groupName, defs, values, type) {
    const wrapper = document.createElement('div');
    wrapper.className = 'theme-editor-group';

    const label = document.createElement('div');
    label.className = 'theme-editor-group-label';
    label.textContent = t(groupName);
    wrapper.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'theme-editor-grid';

    for (const def of defs) {
      const row = document.createElement('div');
      row.className = 'theme-editor-row';

      const lbl = document.createElement('span');
      lbl.className = 'theme-editor-label';
      lbl.textContent = def.label;

      const val = values[def.key] || '';

      if (def.isText) {
        // Text-only input (shadows, dimensions)
        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'theme-editor-text';
        textInput.value = val;
        textInput.oninput = () => {
          values[def.key] = textInput.value;
          this._applyLivePreview();
        };
        row.append(lbl, textInput);
      } else if (def.isRgba) {
        // rgba value: color picker (for hex part) + text input
        const hexVal = this._rgbaToHex(val);
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'theme-editor-color';
        colorInput.value = hexVal;

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'theme-editor-hex';
        textInput.value = val;

        colorInput.oninput = () => {
          // When user picks color from picker, keep original alpha if rgba
          const alpha = this._extractAlpha(values[def.key]);
          const hex = colorInput.value;
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          const newVal = alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : hex;
          values[def.key] = newVal;
          textInput.value = newVal;
          this._applyLivePreview();
        };
        textInput.oninput = () => {
          values[def.key] = textInput.value;
          const hex = this._rgbaToHex(textInput.value);
          if (hex !== '#000000' || textInput.value.includes('0,0,0')) colorInput.value = hex;
          this._applyLivePreview();
        };
        row.append(lbl, colorInput, textInput);
      } else {
        // Standard hex color
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'theme-editor-color';
        colorInput.value = this._normalizeHex(val);

        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'theme-editor-hex';
        hexInput.value = val;

        colorInput.oninput = () => {
          values[def.key] = colorInput.value;
          hexInput.value = colorInput.value;
          this._applyLivePreview();
        };
        hexInput.oninput = () => {
          values[def.key] = hexInput.value;
          const n = this._normalizeHex(hexInput.value);
          if (/^#[0-9a-f]{6}$/i.test(n)) colorInput.value = n;
          this._applyLivePreview();
        };
        row.append(lbl, colorInput, hexInput);
      }

      // Hover-to-highlight: flash the variable so user sees what it affects
      if (type === 'css' && !def.isText) {
        row.addEventListener('mouseenter', () => this._startHighlight(def.key, values[def.key]));
        row.addEventListener('mouseleave', () => this._stopHighlight(def.key, values[def.key]));
      } else if (type === 'terminal' && !def.isText) {
        row.addEventListener('mouseenter', () => this._startTermHighlight(def.key, values[def.key]));
        row.addEventListener('mouseleave', () => this._stopTermHighlight(def.key, values[def.key]));
      }

      grid.appendChild(row);
    }
    wrapper.appendChild(grid);
    return wrapper;
  }

  _applyLivePreview() {
    this._previewActive = true;
    // CSS variables
    this.app.themeManager.setLivePreview(this._cssValues);
    // Terminal colors
    for (const [, session] of this.app.sessions) {
      if (session.updateTheme) session.updateTheme(this._termValues);
    }
    // Update preview card terminal colors
    this._updatePreviewTermColors();
  }

  _revertPreview() {
    if (!this._previewActive) return;
    this._previewActive = false;
    this.app.themeManager._clearInlineOverrides();
    // Restore original theme's terminal colors
    this.app.themeManager.apply(this.app.themeManager.current);
    const termTheme = this.app.themeManager.getTerminalTheme();
    for (const [, session] of this.app.sessions) {
      if (session.updateTheme) session.updateTheme(termTheme);
    }
  }

  async _save(name) {
    if (!name) { showToast(t('Please enter a theme name.'), { type: 'error' }); return; }
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) { showToast(t('Name must be letters, digits, spaces, hyphens or underscores.'), { type: 'error' }); return; }
    if (name.length > 50) { showToast(t('Name too long (max 50 characters).'), { type: 'error' }); return; }
    const builtIn = ['dark', 'light', 'dracula', 'nord', 'solarized', 'monokai'];
    if (builtIn.includes(name.toLowerCase())) { showToast(t('Cannot use a built-in theme name.'), { type: 'error' }); return; }

    const css = storedCss(this._cssValues);   // B-2e7b: only what the person chose — a derived row still at its derivation is left out
    try {
      const res = await fetch('/api/custom-themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, css, terminal: this._termValues }),
      });
      if (!res.ok) { const e = await res.json(); if (heldBodyOf(e)) noteStoreHeld(e.held); showToast(heldWordsOf(e) || e.error || t('Save failed'), { type: 'error' }); return; }
    } catch (e) { showToast(t('Save failed: {error}', { error: e.message }), { type: 'error' }); return; }

    // Register locally
    this.app.themeManager.registerCustomTheme(name, css, this._termValues);
    this._previewActive = false;
    this.app.themeManager.apply('custom-' + name);
    const termTheme = this.app.themeManager.getTerminalTheme();
    for (const [, session] of this.app.sessions) {
      if (session.updateTheme) session.updateTheme(termTheme);
    }
    if (this.app._refreshThemeDropdown) this.app._refreshThemeDropdown();
    this._close();
  }

  async _delete(fromSel, nameInput) {
    const current = fromSel.value;
    if (!current.startsWith('custom-')) { showToast(t('Can only delete custom themes.'), { type: 'error' }); return; }
    const name = current.slice(7);
    if (!(await showConfirmDialog({ title: t('Delete theme'), message: t('Delete custom theme “{name}”?', { name }), confirmText: t('Delete'), danger: true }))) return;

    try {
      const res = await fetch('/api/custom-themes/' + encodeURIComponent(name), { method: 'DELETE' });
      if (!res.ok) { const e = await res.json(); if (heldBodyOf(e)) noteStoreHeld(e.held); showToast(heldWordsOf(e) || e.error || t('Delete failed'), { type: 'error' }); return; }
    } catch (e) { showToast(t('Delete failed: {error}', { error: e.message }), { type: 'error' }); return; }

    const wasActive = this.app.themeManager.current === name;
    this.app.themeManager.unregisterCustomTheme(name);
    delete this._customThemes[name];
    if (this.app._refreshThemeDropdown) this.app._refreshThemeDropdown();
    this._previewActive = false;
    // Only switch themes if the DELETED theme was the active one — deleting an
    // unused custom theme used to reset the user's current theme to dark
    if (wasActive) this.app.themeManager.apply('dark');
    const termTheme = this.app.themeManager.getTerminalTheme();
    for (const [, session] of this.app.sessions) {
      if (session.updateTheme) session.updateTheme(termTheme);
    }
    // Refresh editor state
    fromSel.value = 'dark';
    nameInput.value = '';
    this._populateFromTheme('dark');
    const body = this._panel?.querySelector('.theme-editor-body');
    if (body) this._renderBody(body);
    this._applyLivePreview();
  }

  _close() {
    this._stopHighlightTimer();
    this._revertPreview();
    if (this._panel) { this._panel.remove(); this._panel = null; }
  }

  // ── Hover-to-highlight: pulse a CSS variable between its value and a highlight color ──

  _startHighlight(varKey, originalVal) {
    this._stopHighlightTimer();
    const root = document.documentElement;
    const highlight = this._contrastHighlight(originalVal);
    let on = true;
    // Immediate first flash
    root.style.setProperty(varKey, highlight);
    this._highlightTimer = setInterval(() => {
      on = !on;
      root.style.setProperty(varKey, on ? highlight : originalVal);
    }, 400);
    this._highlightKey = varKey;
    this._highlightOriginal = originalVal;
  }

  _stopHighlight(varKey, originalVal) {
    this._stopHighlightTimer();
    // Restore the current edited value
    document.documentElement.style.setProperty(varKey, originalVal);
  }

  _startTermHighlight(termKey, originalVal) {
    this._stopHighlightTimer();
    const highlight = this._contrastHighlight(originalVal);
    let on = true;
    const apply = (val) => {
      const theme = { ...this._termValues, [termKey]: val };
      for (const [, session] of this.app.sessions) {
        if (session.updateTheme) session.updateTheme(theme);
      }
    };
    apply(highlight);
    this._highlightTimer = setInterval(() => {
      on = !on;
      apply(on ? highlight : originalVal);
    }, 400);
    this._highlightKey = termKey;
    this._highlightOriginal = originalVal;
  }

  _stopTermHighlight(termKey, originalVal) {
    this._stopHighlightTimer();
    // Restore full terminal theme
    for (const [, session] of this.app.sessions) {
      if (session.updateTheme) session.updateTheme(this._termValues);
    }
  }

  _stopHighlightTimer() {
    if (this._highlightTimer) {
      clearInterval(this._highlightTimer);
      this._highlightTimer = null;
    }
  }

  // Pick a highlight color that contrasts with the original
  _contrastHighlight(val) {
    const hex = this._normalizeHex(val);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // Luminance check: if dark, flash bright magenta; if light, flash dark magenta
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.5 ? '#ff00ff' : '#ff66ff';
  }

  // ── Color conversion helpers ──

  _normalizeHex(val) {
    if (!val) return '#000000';
    val = val.trim();
    if (/^#[0-9a-f]{6}$/i.test(val)) return val;
    if (/^#[0-9a-f]{3}$/i.test(val)) {
      return '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
    }
    // Try parsing rgb/rgba
    const m = val.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      const hex = (n) => parseInt(n).toString(16).padStart(2, '0');
      return '#' + hex(m[1]) + hex(m[2]) + hex(m[3]);
    }
    return '#000000';
  }

  _rgbaToHex(val) {
    return this._normalizeHex(val);
  }

  _extractAlpha(val) {
    if (!val) return 1;
    const m = val.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/);
    return m ? parseFloat(m[1]) : 1;
  }
}

export { ThemeEditor };
