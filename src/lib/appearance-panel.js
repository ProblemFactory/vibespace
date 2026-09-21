// APPEARANCE PANEL — the quick per-DEVICE preference controls of the ⚙ menu
// (Theme + ✎, Font size, Font, UI scale, UI font size, "All Settings...").
// Moved VERBATIM out of App._showGlobalSettings (2.369.124, docs/design-
// gear-menu-hierarchy.md §2c): the popover used to open with these eleven
// elements ABOVE the row list; now they are the content of the "Appearance ▸"
// head (a flyout panel on desktop, an inline accordion section on phones)
// and gear-menu.js's renderer asks for them through the head's `panel` hint.
//
// These are NOT duplicates of the Settings window: theme / termFontSize /
// termFontFamily / vibespace.uiScale / vibespace.uiFontScale are localStorage
// keys (CLIENT_PREF_KEYS in app.js — per device, exported with the config)
// and SETTINGS_CATEGORIES has no Appearance category, so this panel is their
// ONLY entry point. `pop` is the popover the panel lives in: the "All
// Settings..." link closes it before opening the Settings window, exactly
// as the old inline link did. Every control keeps the popover OPEN
// (keepOpen semantics — the head row's own click handler ignores clicks
// that land inside the panel).
import { ThemeEditor } from './theme-editor.js';
import { getAvailableFonts } from './terminal.js';
import { applyUiPrefs, getUiPref, UI_SCALE_MIN, UI_SCALE_MAX, UI_FONT_MIN, UI_FONT_MAX } from './utils.js';
import { t } from './i18n.js';

/** The head row's live caption: `Dark · 14px · 100%` — theme, terminal font
 *  size and UI scale, so the common state is visible without opening it. */
export function appearanceCaption(app) {
  const cur = String(app?.themeManager?.current || '');
  const theme = cur.startsWith('custom-') ? cur.slice(7) : (cur ? cur.charAt(0).toUpperCase() + cur.slice(1) : '');
  const parts = [theme, app?._fontSize ? `${app._fontSize}px` : '', `${getUiPref('vibespace.uiScale')}%`].filter(Boolean);
  return parts.join(' · ');
}

/** Build the panel element (a column of label/control pairs + the All
 *  Settings link). `app` is the App mediator, `pop` the popover to close
 *  when the user leaves for the Settings window. */
export function buildAppearancePanel(app, pop) {
  const panel = document.createElement('div');
  panel.className = 'gs-appearance';
  const opt = (v, l) => { const o = document.createElement('option'); o.value = v; o.textContent = l; return o; };

  // Theme
  const themeLabel = document.createElement('label'); themeLabel.textContent = t('Theme');
  const themeSel = document.createElement('select');
  themeSel.id = 'global-theme-select';
  app._populateThemeSelect(themeSel);
  themeSel.value = app.themeManager.current;
  themeSel.onchange = () => {
    app.themeManager.apply(themeSel.value);
    for (const [, session] of app.sessions) {
      if (session.updateTheme) session.updateTheme(app.themeManager.getTerminalTheme());
    }
  };

  // Theme editor button
  const editBtn = document.createElement('button');
  editBtn.className = 'file-tool-btn';
  editBtn.textContent = '✎';
  editBtn.title = t('Theme Editor');
  editBtn.onclick = (e) => { e.stopPropagation(); if (!app._themeEditor) app._themeEditor = new ThemeEditor(app); app._themeEditor.open(); };

  // Font size
  const sizeLabel = document.createElement('label'); sizeLabel.textContent = t('Font Size');
  const sizeRow = document.createElement('div'); sizeRow.className = 'font-size-ctrl';
  const sizeDown = document.createElement('button'); sizeDown.textContent = 'A-';
  const sizeVal = document.createElement('span'); sizeVal.textContent = app._fontSize;
  const sizeUp = document.createElement('button'); sizeUp.textContent = 'A+';
  sizeRow.append(sizeDown, sizeVal, sizeUp);

  const applyFontSize = () => {
    localStorage.setItem('termFontSize', app._fontSize);
    sizeVal.textContent = app._fontSize;
    for (const [, session] of app.sessions) {
      if (session._applyFontSize) {
        // ChatView
        session._applyFontSize(app._fontSize);
      } else if (session.overrides && !session.overrides.fontSize) {
        // TerminalSession — through applyOverride so the size passes _xtermPx
        // (visual px × UI scale; a raw options.fontSize write is 1/scale too small)
        session.applyOverride('fontSize', null);
      }
    }
  };
  sizeDown.onclick = () => { if (app._fontSize > 8) { app._fontSize--; applyFontSize(); } };
  sizeUp.onclick = () => { if (app._fontSize < 28) { app._fontSize++; applyFontSize(); } };

  // Font family
  const fontLabel = document.createElement('label'); fontLabel.textContent = t('Font');
  const fontSel = document.createElement('select');
  for (const f of getAvailableFonts()) {
    const o = opt(f.value === '_sep' ? '' : f.value, f.label);
    if (f.disabled) { o.disabled = true; o.style.fontSize = '9px'; o.style.color = 'var(--text-dim)'; }
    fontSel.appendChild(o);
  }
  fontSel.value = app._fontFamily;
  // A stored font that matches no option (stale localStorage, font list not
  // yet loaded, uninstalled font) left the select BLANK — surface it instead
  if (fontSel.selectedIndex === -1) {
    const curLabel = (app._fontFamily.split(',')[0] || t('Current')).replace(/"/g, '').trim() || t('Current');
    const cur = opt(app._fontFamily, t('{name} (current)', { name: curLabel }));
    fontSel.insertBefore(cur, fontSel.firstChild);
    fontSel.value = app._fontFamily;
  }
  fontSel.onchange = () => {
    app._fontFamily = fontSel.value;
    localStorage.setItem('termFontFamily', app._fontFamily);
    for (const [, session] of app.sessions) {
      if (!session.overrides) continue; // ChatView, not TerminalSession
      if (!session.overrides.fontFamily) {
        session.terminal.options.fontFamily = app._fontFamily;
        try { session.terminal.clearTextureAtlas(); } catch {}
        session.fit();
      }
    }
  };

  // UI scale (DPI) + UI font size — per-DEVICE like the language (a phone
  // and a 4K desktop viewing the same instance want different scales, so
  // these live in localStorage, never the synced settings store). Scale =
  // whole-app CSS zoom (terminals refit + atlas-clear on change; 100% keeps
  // them sharpest); font size = text-only multiplier on chrome labels
  // (sidebar/taskbar/desktop-preview names/menus) via --ui-font-scale.
  const mkPctRow = (labelText, key, min, max, onApply) => {
    const lab = document.createElement('label'); lab.textContent = labelText;
    const row = document.createElement('div'); row.className = 'font-size-ctrl';
    const down = document.createElement('button'); down.textContent = '−';
    const val = document.createElement('span');
    const up = document.createElement('button'); up.textContent = '+';
    const cur = () => getUiPref(key);
    const render = () => { val.textContent = cur() + '%'; };
    const set = (v) => {
      const nv = Math.max(min, Math.min(max, v));
      if (nv === 100) localStorage.removeItem(key); else localStorage.setItem(key, String(nv));
      render(); applyUiPrefs(); onApply?.();
    };
    down.onclick = () => set(cur() - 5);
    up.onclick = () => set(cur() + 5);
    val.style.cursor = 'pointer'; val.title = t('Click to reset to 100%');
    val.onclick = () => set(100);
    render();
    row.append(down, val, up);
    return [lab, row];
  };
  const [scaleLab, scaleRow] = mkPctRow(t('UI scale (DPI)'), 'vibespace.uiScale', UI_SCALE_MIN, UI_SCALE_MAX, () => app._refitAllTerminals());
  const [fscaleLab, fscaleRow] = mkPctRow(t('UI font size'), 'vibespace.uiFontScale', UI_FONT_MIN, UI_FONT_MAX);

  // "All Settings" link
  const allSettingsLink = document.createElement('div');
  allSettingsLink.className = 'settings-all-link';
  allSettingsLink.textContent = t('All Settings...');
  allSettingsLink.onclick = () => { pop.remove(); app._settingsUI.open(); };

  const themeRow = document.createElement('div');
  themeRow.style.cssText = 'display:flex;align-items:center;gap:4px';
  themeRow.append(themeSel, editBtn);
  panel.append(themeLabel, themeRow, sizeLabel, sizeRow, fontLabel, fontSel, scaleLab, scaleRow, fscaleLab, fscaleRow, allSettingsLink);
  return panel;
}
