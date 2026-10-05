// Download the file a window shows (lane viewer-download, 2.369.212 — the owner, a Word file open: "这个界面怎么无法下载文件").
// THE one place a file window's Download is built and started: every FileViewer kind (file-viewer.js), the hex
// viewer, the code editor, the title-bar menu (taskbar.js window.download) and the Files row menu. What is saved
// is the file ON DISK of the machine it lives on — /api/download with the file's machine as `&host=<id>` (ssh
// hosts, paired and Windows devices alike: the route resolves the id); the route's Content-Disposition names it.
import { showToast } from './utils.js';
import { t } from './i18n.js';
import { UI_ICONS } from './icons.js';
import { fsErrorText } from './file-explorer-ops.js';

/** The file's machine as a query parameter — THE spelling (Files' `_hp()` is this). '' = this machine. */
export function hostParam(host) { return host ? '&host=' + encodeURIComponent(host) : ''; }

/** The URL that saves `path` from `host`'s disk (DOM-free; scripts/test-viewer-download.mjs). */
export function fileDownloadUrl(path, host = '') { return `/api/download?path=${encodeURIComponent(path)}${hostParam(host)}`; }

/**
 * Start the download of target = { path, host, dirty?: () => boolean }: a stat of the file on its machine first
 * (a refusal — gone, unreachable machine — is a toast, never a silent nothing), then a temporary `<a download>`
 * click (no blank tab). A dirty editor saves its SAVED copy and says so once. → true when started.
 */
export async function startFileDownload(target) {
  const { path, host = '' } = target;
  let why = null;
  try {
    const r = await fetch(`/api/file/info?path=${encodeURIComponent(path)}${hostParam(host)}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) why = fsErrorText(d) || `HTTP ${r.status}`;
  } catch (e) { why = e.message || String(e); }
  if (why) { showToast(t('Download failed: {msg}', { msg: why }), { type: 'error' }); return false; }
  const a = document.createElement('a');
  a.href = fileDownloadUrl(path, host); a.download = ''; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  if (target.dirty?.()) showToast(t('Downloaded the saved version — unsaved changes are not included'));
  return true;
}

/** The Download button (SVG icon, named by title + aria-label) — one per file window. */
export function fileDownloadButton(target, className = 'file-tool-btn media-btn') {
  const b = document.createElement('button');
  b.type = 'button'; b.className = className + ' file-download-btn';
  b.innerHTML = UI_ICONS.download; b.title = t('Download'); b.setAttribute('aria-label', t('Download'));
  b.addEventListener('click', (e) => { e.stopPropagation(); startFileDownload(target); });
  return b;
}

/** A file window's download: the target rides on the window record (the title-bar menu reads `_fileDownload`)
 *  and the button comes back for the window to seat in its toolbar. */
export function wireFileDownload(winInfo, target, className) {
  winInfo._fileDownload = target;
  return fileDownloadButton(target, className);
}
