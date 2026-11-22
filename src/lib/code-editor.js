import { wireFileDownload } from './file-download.js';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json as jsonLang } from '@codemirror/lang-json';
import { markdown as mdLang } from '@codemirror/lang-markdown';
import { html as htmlLang } from '@codemirror/lang-html';
import { css as cssLang } from '@codemirror/lang-css';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState, Compartment, EditorSelection } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { marked } from 'marked';
import { escHtml, showConfirmDialog, showToast, isTouchDevice } from './utils.js';
import { lineDelta } from '../artifacts.js'; // lane artifacts-model: the save's "+a −b lines"
import { t, tc } from './i18n.js';
import { needLine } from './need-line.js'; // lane ui-needs-a-button (desktop-apps-30): a state + both ways on one line
import { sanitizeHtml } from './safe-html.js';
import { mountDiagrams } from './mermaid-render.js'; // lane chat-mermaid: the preview's diagrams
import * as prettier from 'prettier/standalone';
import prettierBabel from 'prettier/plugins/babel';
import prettierEstree from 'prettier/plugins/estree';
import prettierHtml from 'prettier/plugins/html';
import prettierCss from 'prettier/plugins/postcss';
import prettierMarkdown from 'prettier/plugins/markdown';
import prettierTypescript from 'prettier/plugins/typescript';
import prettierYaml from 'prettier/plugins/yaml';
import prettierGraphql from 'prettier/plugins/graphql';
import { onFileChanged, sameFile } from './file-changed.js'; // §7.9: the server's file-changed signal
import { writeFrame, hostAddress } from './frame-host.js'; // lane frame-host-preview: the HTML preview's frame
import { fsErrorText, ATTENDED_HEADERS, namesText, stillSavingWords } from './file-explorer-ops.js'; // lane file-preview-mount r2: a load / save refusal in the reader's language; B-23e5: a person's press marked
import { saveCloseDoors } from './refusal-doors.js'; // B-3b03 follow-up: a save-and-close window closes only after its save landed

const PRETTIER_PLUGINS = [prettierBabel, prettierEstree, prettierHtml, prettierCss, prettierMarkdown, prettierTypescript, prettierYaml, prettierGraphql];

// Map language id → prettier parser name (null = not supported client-side)
const PRETTIER_PARSERS = {
  javascript: 'babel', json: 'json', html: 'html', css: 'css',
  markdown: 'markdown', plain: null, python: null, auto: null,
};

// Languages that can be formatted server-side via CLI tools (ruff/black, shfmt, gofmt, rustfmt)
const SERVER_FORMATTERS = { python: 'python', shell: 'shell', go: 'go', rust: 'rust' };
// File extensions that map to server-side formatter languages
const EXT_TO_SERVER_FMT = { py: 'python', sh: 'shell', bash: 'shell', zsh: 'shell', go: 'go', rs: 'rust' };

// Map file extension → prettier parser (for extensions not covered by language id)
const EXT_TO_PARSER = {
  ts: 'typescript', tsx: 'typescript', jsx: 'babel',
  scss: 'scss', less: 'less', yaml: 'yaml', yml: 'yaml',
  graphql: 'graphql', gql: 'graphql', vue: 'vue', svelte: 'html',
};

// lane file-preview-mount (userW inc-mvq7sdky-j0ed: «窗口内打开 HTML 的时候，默认不展示 preview，总是展示这个 raw»): an HTML
// page opened to be LOOKED AT (the view door: a chat link, a Files double-click / Open — opts.view) shows its preview
// first; the editor door (Edit, the code-editor door) its source. The mode a person last chose for a file is kept for the
// page's life — reopened, the file opens as they left it.
const HTML_MODE = new Map();   // `${host}|${path}` → 'preview' | 'source' (the oldest goes past 200)
const htmlModeKey = (host, p) => `${host || ''}|${p}`;

const LANGUAGES = [
  { id: 'auto', label: 'Auto' },
  { id: 'javascript', label: 'JavaScript', ext: ['js','jsx','ts','tsx','mjs','cjs'] },
  { id: 'python', label: 'Python', ext: ['py'] },
  { id: 'json', label: 'JSON', ext: ['json'] },
  { id: 'markdown', label: 'Markdown', ext: ['md'] },
  { id: 'html', label: 'HTML', ext: ['html','htm','vue','svelte'] },
  { id: 'css', label: 'CSS', ext: ['css','scss','less'] },
  { id: 'plain', label: 'Plain Text', ext: ['txt','log'] },
];

// Light theme for CodeMirror (used when editor theme is 'light').
// Accent-derived colors follow the app theme's `--accent` (CM6 theme values are
// plain CSS strings, so var()/color-mix resolve at paint time). The mixes go
// into the theme's own light surfaces (#ffffff / #f8fafc) — NOT transparent —
// so the palette stays light even when this theme runs inside a dark app theme
// (the external editor's Light toggle is independent of the app theme). The
// neutral scaffolding (bg/panels/gutters/borders/text) IS the light palette and
// deliberately stays literal.
const editorLightTheme = EditorView.theme({
  '&': { backgroundColor: '#ffffff', color: '#1e293b' },
  '.cm-content': { caretColor: 'var(--accent, #0f766e)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent, #0f766e)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'color-mix(in srgb, var(--accent, #0f766e) 22%, #ffffff)' },
  '.cm-panels': { backgroundColor: '#f5f5fa', color: '#1e293b' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid #e0e0e8' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #e0e0e8' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--yellow, #e5c07b) 45%, #ffffff)', outline: '1px solid var(--yellow, #e5c07b)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--green, #3fb950) 30%, #ffffff)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--accent, #0f766e) 6%, #ffffff)' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--green, #3fb950) 25%, #ffffff)' },
  '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'color-mix(in srgb, var(--accent, #0f766e) 15%, #ffffff)' },
  '.cm-gutters': { backgroundColor: '#f8fafc', color: '#94a3b8', borderRight: '1px solid #e2e8f0' },
  '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent, #0f766e) 10%, #f8fafc)' },
  '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: 'var(--accent, #0f766e)' },
  '.cm-tooltip': { border: '1px solid #e2e8f0', backgroundColor: '#f5f5fa' },
  '.cm-tooltip .cm-tooltip-arrow:before': { borderTopColor: 'transparent', borderBottomColor: 'transparent' },
  '.cm-tooltip .cm-tooltip-arrow:after': { borderTopColor: '#f5f5fa', borderBottomColor: '#f5f5fa' },
  '.cm-tooltip-autocomplete': { '& > ul > li[aria-selected]': { backgroundColor: 'color-mix(in srgb, var(--accent, #0f766e) 22%, #ffffff)', color: '#1e293b' } },
}, { dark: false });

// Active-line highlight competes with multi-line selection: `highlightActiveLine`
// (from basicSetup) decorates the line under the selection HEAD — i.e. the first
// or last selected line, depending on drag direction — and the active-line
// background paints on `.cm-line`, ABOVE the selection layer (z-index:-1), hiding
// the selection rect on that one line. VS Code-style fix: suppress the active-line
// highlight whenever there's a non-empty selection. We tag the editor with a
// `cm-has-selection` class and the theme zeroes the background for both light +
// oneDark (the `.cm-has-selection` selector outranks each theme's plain
// `.cm-activeLine`).
//
// The class is contributed via the `editorAttributes` FACET, NOT by mutating
// `view.dom.classList`: CodeMirror rebuilds `view.dom.className` from scratch on
// every focus change (`updateAttrs` → `"cm-editor" + (cm-focused) + themeClasses`),
// which wiped a directly-added class and made the bug reappear once the editor
// lost focus. `attrsFromFacet` re-evaluates this function on every update (incl.
// selection + focus changes) and merges the class into the className CM builds,
// so it survives blur.
const suppressActiveLineOnSelection = EditorView.editorAttributes.of((view) =>
  view.state.selection.ranges.some(r => !r.empty) ? { class: 'cm-has-selection' } : null
);
const activeLineSelectionFix = EditorView.theme({
  '&.cm-has-selection .cm-activeLine': { backgroundColor: 'transparent' },
  '&.cm-has-selection .cm-activeLineGutter': { backgroundColor: 'transparent' },
});

// B-9b12 — THE FINGER RULE IN THE EDITOR (public/style.css «EVERY FIELD AT 16 PX ON A FINGER», lane phone-six): on a touch
// screen a field's text is never under 16 px — a phone zooms the whole page into a smaller one and does not zoom back. The
// editor DRAWS max(16, the chosen size) there and SAYS so: the size it shows is the size drawn, «−» at 16 says why it goes no
// lower. The size is written on the scroller too: the rule's `1em` is the PARENT's size, so a chosen 18 or 24 drew 16 as well.
// The Ctrl+G pane under a terminal (external-editor.js) reads the same stored size and uses the same three helpers.
const FINGER_MQ = '(hover: none) and (pointer: coarse)';   // utils.js isTouchDevice()'s own query (the listener needs its text)
/** PURE: the editor's font as drawn — `chosen` px, `finger` = a touch screen (FINGER_MQ) → { drawn, floor } (floor: «−» stops) */
export function editorFontFace(chosen, finger) {
  const drawn = finger ? Math.max(16, chosen) : chosen;
  return { drawn, floor: !!finger && drawn <= 16 };
}
/** the size DRAWN, written on the scroller, the content and the gutters (the content's 1em is then the size; the numbers match the text) */
export function editorFontTheme(chosen, finger) {
  const { drawn } = editorFontFace(chosen, finger);
  return EditorView.theme({ '.cm-scroller, .cm-content, .cm-gutters': { fontSize: drawn + 'px' } });
}
let fingerFloorToast = null;
/** «−» at the touch floor says why — ONE toast at a time (a second press while it stands adds none to the stack or the history) */
export function sayFingerFloor() {
  if (fingerFloorToast && fingerFloorToast.isConnected) return;
  fingerFloorToast = showToast(t('On a touch screen the editor shows at least 16 px, so a phone does not zoom the page'), { duration: 4000 });
}

// Editor settings persistence
function loadEditorSettings() {
  // theme defaults to 'dark' (matches the app default) — when it was absent,
  // external-editor's `theme === 'dark'` check fell to the light theme on
  // first use, blinding dark-theme users
  const defaults = { wordWrap: false, fontSize: 14, theme: 'dark' };
  try {
    const raw = localStorage.getItem('editorSettings');
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {}
  return defaults;
}

function saveEditorSettings(settings) {
  localStorage.setItem('editorSettings', JSON.stringify(settings));
}

function getLangExtension(langId) {
  const map = { javascript: javascript(), python: python(), json: jsonLang(), markdown: mdLang(), html: htmlLang(), css: cssLang() };
  return map[langId] ? [map[langId]] : [];
}

function detectLang(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  for (const lang of LANGUAGES) {
    if (lang.ext?.includes(ext)) return lang.id;
  }
  return 'plain';
}

class CodeEditor {
  constructor(winInfo, filePath, fileName, app, opts = {}) {
    this.winInfo = winInfo; this.filePath = filePath; this.app = app;
    this._host = opts.host || ''; // '' = local; else host id (Files cross-host)
    // B-23e5: opened by a PERSON's press (a double-click, the context menu's Open / Edit, the doc window's Raw press) — its first load is
    // marked, ONCE (a layout restore, a replay, the doc window's automatic raw view, the Ctrl+G pane pass no `attended`: no press)
    this._openPressed = !!opts.attended;
    this._fromWin = opts.fromWin || null; // lane artifacts-model: the chat window this file was opened from (its save → artifact-touch)
    // Stage/layout machinery reads dirty state through the window record —
    // an editor with unsaved changes must never be auto-closed (LRU eviction).
    winInfo._editorDirty = () => !!this.modified;
    this.onSaveAndClose = opts.onSaveAndClose || null;
    this._gotoLine = opts.line || null;
    this._isReadOnly = opts._tempFile || false;
    this._viewDoor = !!opts.view; // lane file-preview-mount: opened to be looked at — an HTML page starts as its preview
    this.modified = false;
    this._diskMtime = 0; // on-disk mtime of the loaded copy (freshness watch)
    this._reloading = false;
    this._settings = loadEditorSettings();

    const container = document.createElement('div'); container.className = 'editor-container';

    // Editor toolbar — left: save indicator, right: controls
    const toolbar = document.createElement('div'); toolbar.className = 'editor-toolbar';

    const toolbarLeft = document.createElement('div'); toolbarLeft.className = 'editor-toolbar-left';
    this.saveIndicator = document.createElement('span'); this.saveIndicator.className = 'save-indicator';
    // Disk-change notice: shown when the on-disk file is newer than the loaded
    // copy AND the editor holds unsaved edits (clean editors auto-reload).
    // Click = reload, which confirms the discard — edits are never silently lost.
    // lane ui-needs-a-button (desktop-apps-30): the state AND both ways on its line — «Reload from disk» (confirms the discard)
    // or «Keep my changes» (the notice goes until the file changes on disk again; the next save writes these edits)
    this._diskChip = needLine({ words: '⚠ ' + t('Another program changed this file on disk'), tone: 'need', cls: 'code-editor-disk-need', doors: [
      { label: t('Reload from disk'), kind: 'primary', door: 'disk-reload', run: () => this.reloadFromDisk() },
      { label: t('Keep my changes'), kind: 'secondary', door: 'disk-keep', run: () => { this._diskKept = this._diskSeen || Date.now(); this._diskChip.style.display = 'none'; } }] });
    this._diskChip.style.display = 'none';
    // B-23e5 r2299 A3: ONE standing line after a save that ended UNKNOWN — until the file is reloaded or the editor closed
    this._unknownLine = document.createElement('div'); this._unknownLine.className = 'code-editor-unknown-line';
    this._unknownLine.style.cssText = 'display:none;padding:2px 8px;font-size:12px;color:var(--yellow);';
    this._unknownLine.textContent = t('An earlier save of this file never replied — if it lands late it can replace newer text: reload to check');
    toolbarLeft.append(this.saveIndicator);   // the disk notice is its OWN row under the toolbar (the 500 px picture: one toolbar row crushed its doors)

    const toolbarRight = document.createElement('div'); toolbarRight.className = 'editor-toolbar-right';

    // Language selector
    this.langSelect = document.createElement('select');
    this.langSelect.className = 'toolbar-select';
    for (const lang of LANGUAGES) {
      const opt = document.createElement('option'); opt.value = lang.id; opt.textContent = lang.label;
      this.langSelect.appendChild(opt);
    }
    this.langSelect.onchange = () => this._changeLang(this.langSelect.value);

    // Preview toggle (markdown/html)
    this._btnPreview = this._btn(t('Preview'));
    this._btnPreview.classList.add('editor-preview-toggle');
    this._btnPreview.style.display = 'none';
    this._previewing = false;
    this._previewType = null;
    this._btnPreview.onclick = () => { this._setPreviewing(!this._previewing); this._keepHtmlMode(); };

    const sep = () => { const s = document.createElement('span'); s.className = 'editor-toolbar-sep'; return s; };

    // Word wrap toggle
    const btnWrap = this._btn('\u21A9'); btnWrap.title = t('Toggle word wrap');
    if (this._settings.wordWrap) btnWrap.classList.add('active');
    btnWrap.onclick = () => {
      this._settings.wordWrap = !this._settings.wordWrap;
      btnWrap.classList.toggle('active', this._settings.wordWrap);
      this._applyWrap();
      saveEditorSettings(this._settings);
    };

    // Format button
    const btnFormat = this._btn('\u2261'); btnFormat.title = t('Format document (Shift+Alt+F)');
    btnFormat.onclick = () => this.format();

    // Font size
    const sizeDown = this._btn('\u2212'); sizeDown.title = t('Decrease font size');
    this.fontSizeDisplay = document.createElement('span');
    this.fontSizeDisplay.className = 'editor-font-size-display';
    const sizeUp = this._btn('+'); sizeUp.title = t('Increase font size');
    this._sizeDown = sizeDown; this._paintFontSize();
    sizeDown.onclick = () => this._changeFontSize(-1);
    sizeUp.onclick = () => this._changeFontSize(1);

    // Save + download
    const btnSave = this._btn(''); btnSave.innerHTML = '<svg style="width:12px;height:12px;vertical-align:-1px" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 1h8l3 3v9a2 2 0 01-2 2H3a2 2 0 01-2-2V3a2 2 0 012-2z"/><path d="M5 1v4h5V1M4 9h8"/></svg>'; btnSave.title = t('Save (Ctrl+S)');
    btnSave.onclick = () => this.save();
    if (this._isReadOnly) btnSave.style.display = 'none';
    // the file's machine rides along (lane raw-filename r2: without `&host=` a REMOTE file's Download asked THIS
    // machine for a path of the same name) — through the ONE file-window download (file-download.js, lane
    // viewer-download): the SAVED copy on disk; with unsaved edits it says so once
    const self = this;
    const btnDownload = wireFileDownload(winInfo, { get path() { return self.filePath; }, host: this._host, dirty: () => !!this.modified });

    // Reload from disk (2.341.0): the editor loaded once and never looked back
    // \u2014 files rewritten by agents/other windows were unreachable without
    // closing and reopening (owner report, html case).
    const btnReload = this._btn('\u27F3'); btnReload.title = t('Reload from disk');
    btnReload.onclick = () => this.reloadFromDisk();

    if (this._isReadOnly) btnFormat.style.display = 'none';
    toolbarRight.append(this.langSelect, this._btnPreview, sep(), btnWrap, btnFormat, sizeDown, this.fontSizeDisplay, sizeUp, sep(), btnReload, btnSave, btnDownload);
    toolbar.append(toolbarLeft, toolbarRight);

    this.editorBody = document.createElement('div'); this.editorBody.className = 'editor-body';
    this._previewBody = document.createElement('div'); this._previewBody.className = 'markdown-preview editor-body'; this._previewBody.style.display = 'none'; this._previewBody.style.overflow = 'auto';
    container.append(toolbar, this._diskChip, this._unknownLine, this.editorBody, this._previewBody);
    winInfo.content.appendChild(container);

    this._langCompartment = new Compartment();
    this._wrapCompartment = new Compartment();
    this._themeCompartment = new Compartment();
    this._fontSizeCompartment = new Compartment();
    this.editorView = null;
    this._loadFile(opts.content);

    // Follow global theme changes
    this._themeObserver = new MutationObserver(() => this._applyTheme());
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    // closeWindow aborts _listenerCtl on EVERY close path — the onClose chain
    // alone missed windows closed during the initial async file load, leaking
    // this document-level observer (and the full file text via a detached
    // EditorView) permanently (audit round-3).
    winInfo._listenerCtl?.signal.addEventListener('abort', () => this._themeObserver?.disconnect());
    // B-9b12: a screen that turns to touch (or back) redraws the size by the finger rule
    if (typeof matchMedia === 'function') matchMedia(FINGER_MQ).addEventListener?.('change', () => this._applyFontSize(), winInfo._listenerCtl ? { signal: winInfo._listenerCtl.signal } : undefined);
  }

  _finger() { return isTouchDevice(); }

  /** the size control's words: the size DRAWN; on a touch screen under the floor, why (B-9b12 — a title is for a mouse; «−» says it in a toast) */
  _paintFontSize() {
    const chosen = this._settings.fontSize, { drawn, floor } = editorFontFace(chosen, this._finger());
    this.fontSizeDisplay.textContent = drawn + 'px';
    this.fontSizeDisplay.title = drawn !== chosen ? t('Chosen: {n} px — on a touch screen the editor shows at least 16 px, so a phone does not zoom the page', { n: chosen }) : t('Font size');
    if (this._sizeDown) { this._sizeDown.title = floor ? t('On a touch screen the editor shows at least 16 px, so a phone does not zoom the page') : t('Decrease font size'); this._sizeDown.setAttribute('aria-label', t('Decrease font size')); }
  }

  _btn(text) {
    const b = document.createElement('button'); b.className = 'file-tool-btn media-btn'; b.textContent = text;
    return b;
  }

  _getThemeExtension() {
    // Follow global app theme — light theme uses light editor, all others use dark
    const globalTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    return globalTheme === 'light' ? editorLightTheme : oneDark;
  }

  _getWrapExtension() {
    return this._settings.wordWrap ? EditorView.lineWrapping : [];
  }

  _getFontSizeExtension() {
    return editorFontTheme(this._settings.fontSize, this._finger());   // B-9b12: the size drawn, the scroller too (the finger rule's 1em)
  }

  _applyWrap() {
    if (!this.editorView) return;
    this.editorView.dispatch({ effects: this._wrapCompartment.reconfigure(this._getWrapExtension()) });
  }

  _applyTheme() {
    if (!this.editorView) return;
    this.editorView.dispatch({ effects: this._themeCompartment.reconfigure(this._getThemeExtension()) });
  }

  _applyFontSize() {
    if (!this.editorView) return;
    this.editorView.dispatch({ effects: this._fontSizeCompartment.reconfigure(this._getFontSizeExtension()) });
    this._paintFontSize();
  }

  _changeFontSize(delta) {
    const { drawn, floor } = editorFontFace(this._settings.fontSize, this._finger());
    if (delta < 0 && floor) { sayFingerFloor(); return; }   // B-9b12: at the touch floor «−» says why (never a silent override)
    const newSize = Math.max(8, Math.min(32, drawn + delta));   // from the size DRAWN (a touch screen's 16 over a chosen 14: «+» is 17)
    if (newSize === this._settings.fontSize) return;
    this._settings.fontSize = newSize;
    this._applyFontSize();
    saveEditorSettings(this._settings);
  }

  async _loadFile(initialContent) {
    let content = initialContent;
    if (content === undefined) {
      try {
        const pressed = this._openPressed; this._openPressed = false;
        const res = await fetch(`/api/file/content?path=${encodeURIComponent(this.filePath)}${this._host ? '&host=' + encodeURIComponent(this._host) : ''}`, pressed ? { headers: ATTENDED_HEADERS } : undefined);
        const data = await res.json();
        if (data.error) {
          this.editorBody.innerHTML = `<div class="empty-hint" style="color:var(--red)">${escHtml(fsErrorText(data))}</div>`;
          this._themeObserver?.disconnect(); // load failed — editor never constructed, observer would leak
          return;
        }
        content = data.content || '';
      } catch (err) {
        this.editorBody.innerHTML = `<div class="empty-hint" style="color:var(--red)">${escHtml(t('Failed to load file: {error}', { error: err.message }))}</div>`;
        this._themeObserver?.disconnect();
        return;
      }
    }

    const detectedLang = detectLang(this.filePath);
    this.langSelect.value = detectedLang === 'plain' ? 'auto' : detectedLang;

    const self = this;
    this._savedText = content; // lane artifacts-model: the save's "+a −b lines" is counted against this
    this.editorView = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          suppressActiveLineOnSelection,
          activeLineSelectionFix,
          this._themeCompartment.of(this._getThemeExtension()),
          this._wrapCompartment.of(this._getWrapExtension()),
          this._fontSizeCompartment.of(this._getFontSizeExtension()),
          this._langCompartment.of(getLangExtension(detectedLang)),
          keymap.of([
            indentWithTab,
            { key: 'Mod-s', run: () => { self.save(); return true; } },
            { key: 'Shift-Alt-f', run: () => { self.format(); return true; } },
          ]),
          // the dirty mark is t('Unsaved') — not t('Modified'): that row is the file list's «修改时间» column (lane ui-language)
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !self._reloading) { self.modified = true; self.saveIndicator.textContent = self._saveOut ? '● ' + t('Saving…') : '● ' + t('Unsaved'); self.saveIndicator.style.color = 'var(--yellow)'; }   // r2221 LAW C: typing while a save is out keeps the saving word, the mark beside it
          }),
          ...(this._isReadOnly ? [EditorState.readOnly.of(true)] : []),
        ],
      }),
      parent: this.editorBody,
    });

    this._updatePreviewSupport(detectedLang);
    // the view door (lane file-preview-mount): an .html / .htm opens as its preview unless the person last left it as source
    if (this._viewDoor && this._previewType === 'html' && /\.html?$/i.test(this.filePath) && HTML_MODE.get(htmlModeKey(this._host, this.filePath)) !== 'source') this._setPreviewing(true);

    // Jump to line if requested — and keep the verb on the window: a `path:line`
    // link opened again from the same chat shows THIS tab (app._focusOpenInChain,
    // split tabs v2 F2) and moves it to the new line
    const gotoLine = (n) => {
      if (!this.editorView || !(Number(n) > 0)) return;
      // lane file-preview-mount r2: the line rule holds for an OPEN window too — a page shown as its preview leaves the
      // preview first (the mode kept for the file, as a press would), then jumps
      if (this._previewing) { this._setPreviewing(false); this._keepHtmlMode(); }
      const line = Math.min(Math.trunc(Number(n)), this.editorView.state.doc.lines);
      const lineInfo = this.editorView.state.doc.line(line);
      this.editorView.dispatch({
        selection: EditorSelection.cursor(lineInfo.from),
        effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
      });
    };
    if (this._gotoLine) gotoLine(this._gotoLine);
    this.winInfo._gotoLine = gotoLine;

    // Chain, don't clobber: app.openEditor installs its own onClose (temp-file
    // cleanup + welcome check) BEFORE this async load completes — overwriting
    // it leaked temp files and never restored the welcome screen.
    const prevOnClose = this.winInfo.onClose;
    // B-3b03 follow-up (a MUST of its round's point 5): a save-and-close window's ✕ saves first; a refused save asks before it
    // closes — never a close or a «done» over a refused save the person did not choose (src/lib/refusal-doors.js)
    const doors = this.onSaveAndClose ? saveCloseDoors({ save: () => this.save(), busy: () => !!this._saveOut, sayBusy: () => { this.saveIndicator.textContent = stillSavingWords(String(this.filePath).split('/').pop() || this.filePath); this.saveIndicator.style.color = ''; }, settled: () => this._saveSettled || Promise.resolve(!this.modified), text: () => this.editorView.state.doc.toString(), signal: () => this.onSaveAndClose(), close: () => this.app?.wm?.closeWindow?.(this.winInfo.id), ready: () => !!this.editorView,
      confirmDiscard: () => showConfirmDialog({ title: t('Close without saving?'), message: this._saveUnknown ? t('{name}: the last save did not reply — it may have been saved. Close the editor anyway?', { name: String(this.filePath).split('/').pop() || this.filePath }) : t('Your edits were not saved: {msg}. Close the editor and discard them?', { msg: this._lastSaveError || t('Error') }), confirmText: t('Discard'), danger: true, cancelDefault: true }) }) : null;   // r2299 A3: an UNKNOWN save asked as unknown, never «not saved»
    if (doors) { const prevAsk = this.winInfo.onCloseRequest; this.winInfo.onCloseRequest = (o) => (typeof prevAsk === 'function' && prevAsk(o) === false ? false : doors.onCloseRequest()); }
    // B-23e5's remainder (r1378 (3)): THE DIRTY MARK STAYS ON THE WINDOW — a window holding unsaved text ASKS before it closes (its ✕, a
    // tab's ✕, a group's close-all, whose question names no unsaved text): never a silent loss; a save-and-close window asks by its doors
    else { const prevAsk = this.winInfo.onCloseRequest; this.winInfo.onCloseRequest = (o) => {
      if (typeof prevAsk === 'function' && prevAsk(o) === false) return false;
      if (this._saveOut && !(o && o.discardAsked)) { this.saveIndicator.textContent = stillSavingWords(String(this.filePath).split('/').pop() || this.filePath); this.saveIndicator.style.color = ''; return false; }   // r2221 LAW C: a save still out answers the ✕ first
      if (!this.modified || (o && o.discardAsked)) return true;
      showConfirmDialog({ title: t('Close without saving?'), message: t('{name} has unsaved changes — they are only in this window. Close it and discard them?', { name: String(this.filePath).split('/').pop() || this.filePath }), confirmText: t('Discard'), danger: true, cancelDefault: true })   // r1733 (2): Enter keeps (the safe default)
        .then((ok) => { const wm = this.app && this.app.wm; if (ok && wm) wm.requestClose(this.winInfo.id, { discardAsked: true }); });
      return false;
    }; }
    this.winInfo.onClose = () => {
      if (this._themeObserver) this._themeObserver.disconnect();
      if (doors) doors.onClose();
      if (prevOnClose) prevOnClose();
    };

    this._baselineMtime();
    this._startFreshnessWatch();
  }

  // ── Disk freshness (2.341.0) ──────────────────────────────────────────────
  // Baseline the on-disk mtime at load/save, then watch for the file changing
  // underneath the editor: clean editor → auto-reload; dirty editor → show the
  // disk chip (edits are never silently discarded).

  async _baselineMtime() {
    try {
      const res = await fetch(`/api/file/info?path=${encodeURIComponent(this.filePath)}${this._host ? '&host=' + encodeURIComponent(this._host) : ''}`);
      const info = await res.json();
      if (info && !info.error && info.modified) this._diskMtime = new Date(info.modified).getTime() || 0;
    } catch {}
  }

  _startFreshnessWatch() {
    if (this._freshTimer || this._isReadOnly) return;
    const check = async () => {
      if (document.hidden || this._reloading || !this._diskMtime || !this.editorView) return;
      try {
        const res = await fetch(`/api/file/info?path=${encodeURIComponent(this.filePath)}${this._host ? '&host=' + encodeURIComponent(this._host) : ''}`);
        const info = await res.json();
        const m = info && !info.error && info.modified ? new Date(info.modified).getTime() : 0;
        if (!m || m <= this._diskMtime || m <= (this._diskKept || 0)) return;
        if (this.modified) { this._diskSeen = m; this._diskChip.style.display = ''; }
        else await this.reloadFromDisk({ auto: true });
      } catch {}
    };
    const signal = this.winInfo._listenerCtl?.signal;
    // Local files: light stat poll. Remote hosts are ssh-per-op — polling
    // would spawn an ssh every tick forever; they check on tab refocus only
    // (and always via the explicit ⟳ button).
    if (!this._host) this._freshTimer = setInterval(check, 15000);
    window.addEventListener('focus', check, signal ? { signal } : undefined);
    // §7.9: the server SAID this file changed (a LibreOffice session on it ended with its mtime moved — the
    // `file-changed` broadcast, relayed by src/lib/file-changed.js): the same check at once, on either transport —
    // a clean editor reloads, a dirty one shows its disk chip (edits are never discarded)
    onFileChanged((d) => { if (sameFile(d, { host: this._host || null, path: this.filePath })) check(); }, { signal });
    signal?.addEventListener('abort', () => clearInterval(this._freshTimer));
  }

  async reloadFromDisk(opts = {}) {
    if (this._reloading || !this.editorView) return;
    if (this._saveOut) { if (!opts.auto) { this.saveIndicator.textContent = stillSavingWords(String(this.filePath).split('/').pop() || this.filePath); this.saveIndicator.style.color = ''; } return; }   // r2221 LAW C: a save still out answers a Reload first (the freshness watch's auto reload waits too)
    if (this.modified) {
      if (opts.auto) return; // never auto-discard edits
      const ok = await showConfirmDialog({ title: t('Reload from disk'), message: t('This file has unsaved changes. Reloading from disk will discard them. Continue?'), confirmText: t('Reload'), danger: true });
      if (!ok) return;
    }
    this._reloading = true;
    try {
      // B-23e5: a PRESSED reload (the button, the disk chip) is a person's press — marked; the freshness watch's `{auto}` reload never
      const res = await fetch(`/api/file/content?path=${encodeURIComponent(this.filePath)}${this._host ? '&host=' + encodeURIComponent(this._host) : ''}`, opts.auto ? undefined : { headers: ATTENDED_HEADERS });
      const data = await res.json();
      if (data.error) throw new Error(fsErrorText(data));
      const content = data.content || '';
      const view = this.editorView;
      const prevScroll = view.scrollDOM.scrollTop;
      const prevHead = Math.min(view.state.selection.main.head, content.length);
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content }, selection: EditorSelection.cursor(prevHead) });
      view.scrollDOM.scrollTop = prevScroll;
      this.modified = false; this._saveUnknown = false; this._unknownLine.style.display = 'none';   // r2299 A3: reloaded — the standing line goes
      this._diskChip.style.display = 'none';
      if (this._previewing) this._renderPreviewNow();
      this._formatStatus('⟳ ' + t('Reloaded from disk'), 'var(--green)', 2000);
      await this._baselineMtime();
    } catch (err) {
      this._formatStatus(t('Reload failed: {msg}', { msg: err.message || 'error' }), 'var(--red)', 4000);
    } finally {
      this._reloading = false;
    }
  }

  _changeLang(langId) {
    if (!this.editorView) return;
    const actualId = langId === 'auto' ? detectLang(this.filePath) : langId;
    this.editorView.dispatch({ effects: this._langCompartment.reconfigure(getLangExtension(actualId)) });
    this._updatePreviewSupport(actualId);
  }

  /** The person's choice for an HTML page — the mode it shows now — kept for the page's life (lane file-preview-mount). */
  _keepHtmlMode() {
    if (this._previewType !== 'html') return;
    const k = htmlModeKey(this._host, this.filePath);
    HTML_MODE.delete(k); HTML_MODE.set(k, this._previewing ? 'preview' : 'source');
    if (HTML_MODE.size > 200) HTML_MODE.delete(HTML_MODE.keys().next().value);
  }

  /** Preview ⇄ the source (the toggle and the view door). The button names where a press goes: «Preview», or back —
   *  «Source» on an HTML page, «Edit» on markdown. */
  _setPreviewing(on) {
    this._previewing = !!on;
    this._btnPreview.textContent = this._previewing ? (this._previewType === 'html' ? tc('editor', 'Source') : t('Edit')) : t('Preview');
    this._btnPreview.classList.toggle('active', this._previewing);
    if (this._previewing) {
      this.editorBody.style.display = 'none';
      this._renderPreviewNow();
      this._previewBody.style.display = 'block';
    } else {
      this._previewBody.style.display = 'none';
      this.editorBody.style.display = '';
    }
  }

  /** (Re)render the preview pane from the CURRENT document. Shared by the
   * Preview toggle and reloadFromDisk — a reload must refresh a visible preview. */
  _renderPreviewNow() {
    const src = this.editorView?.state.doc.toString() || '';
    if (this._previewType === 'html') {
      this._renderHtmlPreview(src);
      // Re-render on resize so JS-computed layouts recalculate at new size
      if (!this._previewRO) {
        this._previewRO = new ResizeObserver(() => {
          if (!this._previewing || this._previewType !== 'html') return;
          if (this._previewResizeTimer) clearTimeout(this._previewResizeTimer);
          this._previewResizeTimer = setTimeout(() => {
            const s = this.editorView?.state.doc.toString() || '';
            this._renderHtmlPreview(s);
          }, 300);
        });
        this._previewRO.observe(this._previewBody);
      }
    } else {
      this._previewBody.innerHTML = sanitizeHtml(marked.parse(src)); // previewed files may be untrusted (cloned repos)
      // lane chat-mermaid: a ```mermaid fence draws through THE one diagram door (public/mermaid.js from this origin,
      // sanitized) — it replaced a CDN <script> (a third-party origin; the app page's CSP is script-src 'self')
      mountDiagrams(this._previewBody, { app: this.app });
    }
  }

  // lane frame-host-preview (B-5b2c): the previewed page is an agent's (or a cloned repo's) — it runs in an OPAQUE frame,
  // never `allow-same-origin` (it ran AS THE APP: the cookie, storage, every API). The frame navigates to the hub's frame
  // host (the preview policy, a real header — src/server/frame-host.js) and the page is posted in; a LOCAL file's folder
  // is handed to the host, which serves the frame that folder's files at the folder's own address (relative links,
  // stylesheets, scripts and pictures resolve there — no <base> is written into the page); a remote file has none.
  _renderHtmlPreview(src) {
    if (!this._previewIframe) {
      this._previewIframe = document.createElement('iframe');
      this._previewIframe.setAttribute('sandbox', 'allow-scripts');
      this._previewIframe.style.cssText = 'width:100%;height:100%;border:none';
      this._previewBody.appendChild(this._previewIframe);
    }
    const dir = this._host ? '' : (this.filePath.replace(/\/[^/]*$/, '') || '/');
    writeFrame(this._previewIframe, src, hostAddress('preview', { base: dir }));
  }

  /** Show/hide Preview button based on current language. Single source of truth. */
  _updatePreviewSupport(langId) {
    const hasPreview = langId === 'markdown' || langId === 'html';
    this._btnPreview.style.display = hasPreview ? '' : 'none';
    this._previewType = hasPreview ? langId : null;
    if (!hasPreview && this._previewing) {
      this._previewing = false;
      this._btnPreview.textContent = t('Preview');
      this._btnPreview.classList.remove('active');
      this._previewBody.style.display = 'none';
      this.editorBody.style.display = '';
    }
  }

  async save() {
    const name = String(this.filePath).split('/').pop() || this.filePath;
    // r2198 law 1: ONE save of this editor is out at a time — a press while one is out SENDS NOTHING and says so; nothing waits, nothing is
    // queued, nothing is sent later by itself (r2221 LAW C: answered by that fact, never by the mark; the hub orders the file's writes, law A)
    if (this._saveOut) { this.saveIndicator.textContent = stillSavingWords(name); this.saveIndicator.style.color = ''; this._wordsOf = 0; return false; }   // r2221 LAW C: answered by that fact, never by the mark
    const content = this.editorView.state.doc.toString();
    const seq = this._saveSeq = (this._saveSeq || 0) + 1;
    this._saveOut = true; let settle = null; this._saveSettled = new Promise((r) => { settle = r; });   // r2299 ★14: a close while it is out waits on its answer
    this.saveIndicator.textContent = t('Saving…'); this.saveIndicator.style.color = ''; this._wordsOf = seq;   // B-3b03 follow-up: a save that is out says so
    // r2222 (4): the page's 45 s is the LAST guard — for a write that started and has not replied (the hub answers within its own 30 s);
    // ended, it says «no reply — it may still have been saved», the mark stays, and presses work again
    const ctl = new AbortController(), end = setTimeout(() => ctl.abort(), 45000);
    try {
      // fetch only rejects on network errors — server-side write failures
      // (permission denied, read-only fs) return 400 with {error} and used to
      // show "✓ Saved" while silently dropping the edits
      // B-23e5: a save is a person's press (the button, Mod-s, save-and-close) — marked: tried once despite the pool's memory
      const res = await fetch('/api/file/write', { method:'POST', headers:{'Content-Type':'application/json', ...ATTENDED_HEADERS}, body:JSON.stringify({path:this.filePath,content,host:this._host||undefined}), signal: ctl.signal });
      const data = await res.json().catch(() => ({}));
      // r2198 law 3: «still trying» — another press on this file or its folder holds it (this editor's own saves never overlap): NOT saved
      if (data && data.code === 'storage_path_trying') throw new Error(t('another press on this file or its folder is still being tried'));
      if (data && data.code === 'write_unknown') throw Object.assign(new Error('unknown'), { noReply: true });   // r2299 A1/A3: the hub could not know — said as unknown
      if (!res.ok || data.error) throw new Error(data.error ? fsErrorText(data) : `HTTP ${res.status}`);
      if (!namesText(data, content)) throw Object.assign(new Error('no reply'), { noReply: true });   // r2221 item 6: «saved» names the text it saved; a body that does not is no reply
      this.saveIndicator.title = '';   // B-23e5: a refusal's hover goes with the good save
      // r2198 law 2: THE MARK IS CLEARED BY ONE THING ONLY — this «saved» reply, when its text is what the box holds AT THIS MOMENT; text typed
      // while the save was out is not saved, and its mark stays (law 4: the person kept typing)
      if (this.editorView.state.doc.toString() === content) { this.modified = false; this.saveIndicator.textContent = '✓ ' + t('Saved'); this.saveIndicator.style.color = 'var(--green)'; }
      else { this.saveIndicator.textContent = '● ' + t('{name} is saved as it was when you pressed save — what you typed after is not saved yet: save again', { name }); this.saveIndicator.style.color = 'var(--yellow)'; }
      this._wordsOf = seq;   // these words are this save's: its timer clears them unless a later press has spoken since
      this._diskChip.style.display = 'none';
      this._noteArtifactSave(content);
      this._baselineMtime(); // our own write moved the disk mtime — re-baseline so the freshness watch doesn't see it as a foreign change
      setTimeout(() => { if (!this.modified && this._wordsOf === seq) this.saveIndicator.textContent = ''; }, 2000);
      return !this.modified;   // the save-and-close door reads the mark (never «done» over text the disk does not hold)
    } catch (err) {
      // r2222 (4): the page's 45 s guard, or a reply that names no text — it may still have been saved; the mark stays, no «not saved»
      if (ctl.signal.aborted || (err && err.noReply)) { this.saveIndicator.textContent = t('{name}: no reply — it may still have been saved', { name }); this.saveIndicator.style.color = 'var(--yellow)'; this.saveIndicator.title = ''; this._lastSaveError = ''; this._saveUnknown = true; this._unknownLine.style.display = ''; this._wordsOf = seq; return false; }   // r2299 A3: UNKNOWN, its own words and colour, never «not saved»; the standing line
      const why = err.message || t('Error'); this._saveUnknown = false;
      // B-23e5 (the save law): the text stays in the editor, the editor stays open, and the words say WHERE it is not saved
      this.saveIndicator.textContent = '✕ ' + t('{name} is not saved — {why}', { name, why }); this.saveIndicator.style.color = 'var(--red)';
      this.saveIndicator.title = t('{path} is not saved — {why}', { path: this.filePath, why });
      // r1378 (3): where the text IS and what the person can do — said once as a toast while there IS unsaved text (law 2: the mark is the mark)
      if (this.modified) showToast(t('{name} is not saved — {why}. Your text is still here, unsaved: save again, or copy it to keep it elsewhere.', { name, why }), { type: 'error', duration: 8000 });
      this._lastSaveError = why; this._wordsOf = seq;
      return !this.modified;   // B-3b03 follow-up: the save-and-close door reads it (never «done» over a refused save with unsaved text)
    } finally { clearTimeout(end); this._saveOut = false; settle(!this.modified); }
  }

  // lane artifacts-model: a save in an editor opened FROM a chat counts on that conversation's deliverable row (by: user)
  // and the agent hears ONE next-turn note ("[Doc edit] <path>: +a −b lines") — the ws `artifact-touch`, free (the stash)
  _noteArtifactSave(content) {
    const before = this._savedText;
    this._savedText = content;
    const cv = this._fromWin ? this.app.sessions?.get?.(this._fromWin) : null;
    if (!cv || !cv.sessionId || before === content) return;
    try { this.app.ws?.send({ type: 'artifact-touch', sessionId: cv.sessionId, host: this._host || '', path: this.filePath, summary: lineDelta(before ?? '', content).text }); } catch { }
  }

  async format() {
    if (!this.editorView || this._isReadOnly) return;
    const currentLang = this.langSelect.value === 'auto' ? detectLang(this.filePath) : this.langSelect.value;
    const ext = this.filePath.split('.').pop().toLowerCase();
    const parser = PRETTIER_PARSERS[currentLang] ?? EXT_TO_PARSER[ext] ?? null;
    const serverLang = SERVER_FORMATTERS[currentLang] ?? EXT_TO_SERVER_FMT[ext] ?? null;

    if (!parser && !serverLang) {
      this._formatStatus(t('No formatter for this language'), 'var(--text-dim)', 2000);
      return;
    }

    const source = this.editorView.state.doc.toString();
    this._formatStatus(t('Formatting…'), 'var(--text-dim)');

    try {
      let formatted;
      if (parser) {
        // Client-side: Prettier
        formatted = await prettier.format(source, {
          parser, plugins: PRETTIER_PLUGINS,
          singleQuote: true, trailingComma: 'all', printWidth: 100,
        });
      } else {
        // Server-side: CLI formatter (ruff/black, shfmt, gofmt, rustfmt)
        const res = await fetch('/api/format', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: source, language: serverLang, filePath: this.filePath }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        formatted = data.formatted;
      }
      if (formatted && formatted !== source) {
        const cursor = this.editorView.state.selection.main.head;
        const ratio = source.length > 0 ? cursor / source.length : 0;
        const newCursor = Math.min(Math.round(ratio * formatted.length), formatted.length);
        this.editorView.dispatch({
          changes: { from: 0, to: source.length, insert: formatted },
          selection: EditorSelection.cursor(newCursor),
        });
      }
      this._formatStatus('\u2713 ' + t('Formatted'), 'var(--green)', 2000);
    } catch (err) {
      this._formatStatus(t('Format error: {error}', { error: err.message?.split('\n')[0]?.substring(0, 80) || t('unknown') }), 'var(--red)', 4000);
    }
  }

  _formatStatus(text, color, clearAfter) {
    this.saveIndicator.textContent = text;
    this.saveIndicator.style.color = color;
    if (clearAfter) setTimeout(() => { if (this.saveIndicator.textContent === text) this.saveIndicator.textContent = ''; }, clearAfter);
  }
}

// Bundle both halves of the active-line/selection fix so external-editor (its own
// EditorView) gets identical behavior.
const activeLineSelectionPatch = [suppressActiveLineOnSelection, activeLineSelectionFix];

export { CodeEditor, detectLang, getLangExtension, loadEditorSettings, saveEditorSettings, editorLightTheme, activeLineSelectionPatch };
