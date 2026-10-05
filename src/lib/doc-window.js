// THE DOC WINDOW — the door (lane doc-window, 2.369.215; docs/design-artifacts.zh.md §Doc window). Window type `doc`:
// a markdown file read, edited and annotated in ONE rendered view; the chat that owns it learns the edit by itself.
//   · openSpec `{action:'openDoc', host, path, from}` (`from` = the chat session the open came from — the owner
//     witness until the artifact registry names one); ONE window per (host, path) per client (`revealWindow`).
//   · app.openFile routes `.md` / `.markdown` here (a `:line` link and the hex view keep their own doors).
//   · THIS module is all the main bundle carries: the editor (ProseMirror + prosemirror-markdown) and the window's UI
//     live in the LAZY second esbuild entry public/doc-editor.js (src/doc-editor-entry.js), imported on the first Doc
//     window; the main bundle's helpers are handed to it (`deps`) so it carries no second copy of utils / i18n.
//   · Raw = the existing CodeEditor for the same file, mounted IN this window (`makeRaw`).
import { showToast, fetchJson, createModalShell, showConfirmDialog, createPopover, uiScale } from './utils.js';
import { t } from './i18n.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { onFileChanged, sameFile, foldPath } from './file-changed.js';
import { CodeEditor } from './code-editor.js';

let editorLoad = null;
const loadEditor = () => editorLoad || (editorLoad = import(new URL('/doc-editor.js', location.origin).href).catch((e) => { editorLoad = null; throw e; }));

export function openDoc(app, { host = '', path = '', from = '', syncId, intoChain } = {}) {
  const p = foldPath(path), h = host && host !== 'local' ? String(host) : '';
  if (!p.startsWith('/')) return null;
  for (const w of app.wm.windows.values()) {
    if (w.type !== 'doc' || w._filePath !== p || (w._docHost || '') !== h) continue;
    app.wm.revealWindow(w.id, { replay: !!syncId });
    if (from && !w._openSpec?.from && typeof w._docAdopt === 'function') w._docAdopt(from);
    return w;
  }
  app._hideWelcome?.();
  const name = p.slice(p.lastIndexOf('/') + 1);
  const openSpec = { action: 'openDoc', host: h, path: p, from: from || '' };
  const winInfo = app.wm.createWindow({ title: (h ? app.hostName(h) + ': ' : '') + name, type: 'doc', syncId, openSpec, intoChain, width: 900, height: 680 });
  winInfo._filePath = p; winInfo._fileName = name; winInfo._docHost = h;
  const root = document.createElement('div'); root.className = 'doc-window'; root.textContent = t('Loading…');
  winInfo.content.appendChild(root);
  const signal = winInfo._listenerCtl.signal;
  const makeRaw = (pane) => { const sub = Object.create(winInfo); sub.content = pane; return new CodeEditor(sub, p, name, app, { host: h }); };
  const deps = { t, showToast, fetchJson, createModalShell, showConfirmDialog, createPopover, uiScale, onFileChanged, sameFile, makeRaw, isPhone: () => !!app.isMobile || window.innerWidth <= 768 };
  loadEditor().then((mod) => { if (!signal.aborted) { root.textContent = ''; mod.mountDocWindow({ root, winInfo, host: h, path: p, name, from: from || '', signal, deps }); } },
    () => { root.textContent = t('Could not load the document editor — reload the page'); });
  winInfo.onClose = () => { try { winInfo._docClose?.(); } catch { } app._checkWelcome?.(); };
  return winInfo;
}

registerWindowType({
  type: 'doc', label: 'Doc',
  icon: svgIcon16('<path d="M4 1.5h5.5L13 5v9.5H4z"/><path d="M9.5 1.5V5H13M6 8h5M6 10.5h5"/>'),
  action: 'openDoc', replay: (app, spec, { syncId } = {}) => app.openDoc({ host: spec.host || '', path: spec.path, from: spec.from || '', syncId }),
});
