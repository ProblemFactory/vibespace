// THE DOC WINDOW — the door (lane doc-window, 2.369.215; docs/design-artifacts.zh.md §Doc window). Window type `doc`:
// a markdown file read, edited and annotated in ONE rendered view; the chat that owns it learns the edit by itself.
//   · openSpec `{action:'openDoc', host, path, from}` (`from` = the chat session the open came from — the owner
//     witness until the artifact registry names one); ONE window per (host, path) per client (`revealWindow`).
//   · app.openFile routes `.md` / `.markdown` here (a `:line` link and the hex view keep their own doors).
//   · THIS module is all the main bundle carries: the editor (ProseMirror + prosemirror-markdown) and the window's UI
//     live in the LAZY second esbuild entry public/doc-editor.js (src/doc-editor-entry.js), imported on the first Doc
//     window; the main bundle's helpers are handed to it (`deps`) so it carries no second copy of utils / i18n (nor of the
//     bar fold and the glyphs — design 020's bar).
//   · Raw = the existing CodeEditor for the same file, mounted IN this window (`makeRaw`).
import { showToast, fetchJson, createModalShell, showConfirmDialog, showInputDialog, createPopover, showContextMenu, uiScale, copyText, saveDraft, loadDraft, getStateSync } from './utils.js';
import { sanitizeHtml } from './safe-html.js';
import { Marked } from 'marked'; // the house renderer's class (chat's marked) — the Doc window's export / print READS the source with it
import { t } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { onFileChanged, sameFile, foldPath } from './file-changed.js';
import { CodeEditor } from './code-editor.js';
import { createBarFold } from './bar-fold.js';
import { UI_ICONS } from './icons.js';

let editorLoad = null;
const loadEditor = () => editorLoad || (editorLoad = import(new URL('/doc-editor.js', location.origin).href).catch((e) => { editorLoad = null; throw e; }));

export function openDoc(app, { host = '', path = '', from = '', syncId, intoChain, quiet = false, attended = false } = {}) { // `quiet`: app.openFile's (an automatic open — never the focus)
  const p = foldPath(path), h = host && host !== 'local' ? String(host) : '';
  if (!p.startsWith('/')) return null;
  for (const w of app.wm.windows.values()) {
    if (w.type !== 'doc' || w._filePath !== p || (w._docHost || '') !== h) continue;
    if (!quiet) app.wm.revealWindow(w.id, { replay: !!syncId });
    if (from && !w._openSpec?.from && typeof w._docAdopt === 'function') w._docAdopt(from);
    return w;
  }
  app._hideWelcome?.();
  const name = p.slice(p.lastIndexOf('/') + 1);
  const openSpec = { action: 'openDoc', host: h, path: p, from: from || '' };
  const winInfo = app.wm.createWindow({ title: (h ? app.hostName(h) + ': ' : '') + name, type: 'doc', syncId, openSpec, intoChain, quiet, width: 900, height: 680 });
  winInfo._filePath = p; winInfo._fileName = name; winInfo._docHost = h;
  const root = document.createElement('div'); root.className = 'doc-window'; root.textContent = t('Loading…');
  winInfo.content.appendChild(root);
  const signal = winInfo._listenerCtl.signal;
  const makeRaw = (pane, { attended = false } = {}) => { const sub = Object.create(winInfo); sub.content = pane; return new CodeEditor(sub, p, name, app, { host: h, attended }); };   // B-23e5: a raw pane opened by a press reads once marked
  const deps = { t, showToast, fetchJson, createModalShell, showConfirmDialog, showInputDialog, createPopover, showContextMenu, uiScale, onFileChanged, sameFile, makeRaw, createBarFold, icons: UI_ICONS, sanitizeHtml, copyText, Marked, saveDraft, loadDraft, getStateSync, isPhone: () => !!app.isMobile }; // the class's live answer (lane duo-build-1)
  loadEditor().then((mod) => { if (!signal.aborted) { root.textContent = ''; mod.mountDocWindow({ root, winInfo, host: h, path: p, name, from: from || '', signal, deps, attended }); } },
    () => { root.textContent = t('Could not load the document editor — reload the page'); });
  winInfo.onClose = () => { try { winInfo._docClose?.(); } catch { } app._checkWelcome?.(); };
  // B-23e5's remainder (r1378 (3)): a doc window holding unsaved text ASKS before it closes (its ✕, a group's close-all) — never a silent loss
  winInfo.onCloseRequest = (o) => {
    const dirty = typeof winInfo._editorDirty === 'function' && winInfo._editorDirty();
    if (!dirty || (o && o.discardAsked)) return true;
    showConfirmDialog({ title: t('Close without saving?'), message: t('{name} has unsaved changes — they are only in this window. Close it and discard them?', { name }), confirmText: t('Discard'), danger: true })
      .then((ok) => { if (ok) app.wm.requestClose(winInfo.id, { discardAsked: true }); });
    return false;
  };
  return winInfo;
}

registerWindowType({
  type: 'doc', label: 'Doc',
  icon: svgIcon16('<path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M9.5 1.5V5H13M6 8h5M6 10.5h5"/>'),
  action: 'openDoc', replay: (app, spec, { syncId } = {}) => app.openDoc({ host: spec.host || '', path: spec.path, from: spec.from || '', syncId }),
});
