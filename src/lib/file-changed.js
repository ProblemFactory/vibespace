// THE FILE-CHANGED SIGNAL on this page (docs/design-desktop-apps.zh.md §7.9): the server's ONE
// `file-changed {host, path, mtime}` broadcast (src/server/desktop-app-keeper.js — a document's
// LibreOffice session ended and the machine that holds the file saw its mtime move) is re-said
// here as a window event, so every surface showing a file listens with its OWN listener signal
// and nothing registers a ws handler per window. Imports nothing (DOM-free except the dispatch).
//   · src/lib/open-with.js relays the broadcast (`relayFileChanged`)
//   · src/lib/code-editor.js runs its freshness check on a match (a clean editor reloads, a dirty
//     one shows its disk chip — edits are never discarded)
//   · a file viewer may do the same (`onFileChanged(fn, {signal})` + `sameFile`)
export const FILE_CHANGED_EVENT = 'vibespace:file-changed';

/** The broadcast → the event's detail (null when it names no path). `host` null = this machine. */
export function fileChangedDetail(m) {
  if (!m || typeof m !== 'object' || typeof m.path !== 'string' || !m.path) return null;
  return {
    host: m.host ? String(m.host) : null,
    path: m.path,
    mtime: Number.isFinite(m.mtime) ? m.mtime : null,
    by: m.by ? String(m.by) : null,
    label: m.label ? String(m.label) : null,
    appId: m.appId ? String(m.appId) : null,
  };
}

/** A slash path with `//`, `/./` and `/../` folded (the explorer at `/` names a child `//name`; the signal carries the
 *  machine's folded path). A relative path is returned as is. */
export function foldPath(p) {
  const s = String(p || '');
  if (!s.startsWith('/')) return s;
  const out = [];
  for (const seg of s.split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg); }
  return '/' + out.join('/');
}
/** Does a signal name THIS file (same machine — '' / null / 'local' are this one — and the same folded path)? */
export function sameFile(detail, { host = null, path = '' } = {}) {
  if (!detail) return false;
  const k = (h) => (!h || h === 'local' ? null : String(h));
  return k(detail.host) === k(host) && foldPath(detail.path) === foldPath(path);
}

/** Listen for the signal; bound to `signal` (a window's `_listenerCtl.signal`) so it goes with its window. */
export function onFileChanged(fn, { signal } = {}) {
  const h = (e) => { try { fn(e.detail); } catch (err) { console.warn('[file-changed] a listener failed:', err); } };
  window.addEventListener(FILE_CHANGED_EVENT, h, signal ? { signal } : undefined);
  return () => window.removeEventListener(FILE_CHANGED_EVENT, h);
}

/** Re-say one broadcast as the window event. */
export function relayFileChanged(m) {
  const detail = fileChangedDetail(m);
  if (!detail) return false;
  window.dispatchEvent(new CustomEvent(FILE_CHANGED_EVENT, { detail }));
  return true;
}
