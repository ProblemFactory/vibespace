// PRESENT · PRINT ALL · DOWNLOADS (lane design-present — design 003 §2.6 S7; mounted by design-window.js in one line).
//
//   · PRESENT: the bar's ▶ (⋯ when the bar folds it) — the canvas core's own present mode (src/lib/design-canvas.js):
//     the page's artboards in READING order (rows top to bottom, each left to right — design-canvas-model.js
//     presentOrder), one at a time, fitted to the screen, fullscreen on this press; ← → Space / a click / a swipe
//     step, Esc or × ends and the canvas comes back as it was. Comment mode ends first (a presented frame is shielded).
//   · PRINT ALL: ⋯ "Print all artboards on this page" (and Print itself on a page of several when no artboard is
//     open) — ONE print document (printAllSrcdoc: one PDF page per artboard at its own size, each artboard in its own
//     script-only frame, the text kept as text by the browser's Save as PDF) in a transient frame sandboxed
//     `allow-scripts allow-modals`, exactly like Print's; a refused artboard is left out and said.
//   · DOWNLOAD HTML: GET /api/design/bundle — the publish bundle as a FILE (one self-contained page: it opens offline
//     and presents; nothing is hosted); a refusal is the window's chip in the hub's words. DOWNLOAD FOLDER (.zip): the
//     File Explorer's own act (GET /api/download-zip?path=<dir>&host=…).
import { t } from './i18n.js';
import { presentOrder, printAllSrcdoc } from './design-canvas-model.js';

const PRINT_FRAME_MS = 10 * 60 * 1000;
const hostKey = (h) => (!h || h === 'local' ? '' : String(h));
const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

/** The present chrome's labels in this client's language (the canvas core has no i18n — the window hands them in). */
export function presentWords() {
  return { prev: t('Previous artboard'), next: t('Next artboard'), exit: t('End the presentation'), bar: t('Presentation') };
}
/** A download's file name from the hub's Content-Disposition (src/file-disposition.js): the UTF-8 form first (a CJK
 *  folder keeps its name), then the ASCII one, else `fallback`; never a path or a control character. */
export function downloadName(cd, fallback = 'design.html') {
  const s = String(cd || '');
  const bad = /[\\/\x00-\x1f\x7f]/;
  const ext = /filename\*=UTF-8''([^;\s]+)/i.exec(s);
  if (ext) { try { const n = decodeURIComponent(ext[1]); if (n && !bad.test(n)) return n.slice(0, 200); } catch { /* a bad escape: the ASCII form */ } }
  const m = /filename="([^"]{1,200})"/.exec(s);
  return m && !bad.test(m[1]) ? m[1] : fallback;
}

/** Mount Present / Print all / the downloads on one Design window. → { start, printAll, downloadHtml, downloadZip } */
export function mountDesignPresent({ winInfo, canvas, button = null, signal, host = '', dir = '', sayChip = () => {}, stopPick = () => {} } = {}) {
  const L = { signal };
  function start() {
    stopPick();
    if (!canvas.present(true, { words: presentWords() })) sayChip(t('Nothing to present on this page yet'));
  }
  if (button) button.addEventListener('click', start, L);

  // ── print all: a transient frame of its own (Print's twin) ──
  let frame = null, timer = 0;
  const drop = () => { clearTimeout(timer); if (frame) { frame.remove(); frame = null; } };
  signal.addEventListener('abort', drop, { once: true });
  /** → whether a print started. */
  function printAll() {
    const all = canvas.frames();
    const order = presentOrder(all, canvas.page());
    const list = order.map((f) => all.find((x) => x.file === f)).filter((f) => f && f.html != null);
    if (!list.length) { sayChip(order.length ? t('Every artboard on this page was refused — there is nothing to print') : t('No artboards on this page yet — there is nothing to print')); return false; }
    drop();
    const ifr = mk('iframe', 'design-print-frame design-print-all');
    ifr.setAttribute('sandbox', 'allow-scripts allow-modals'); // print() needs allow-modals; never allow-same-origin
    ifr.setAttribute('aria-hidden', 'true');
    ifr.tabIndex = -1;
    ifr.style.width = Math.max(...list.map((f) => f.w)) + 'px';
    ifr.style.height = Math.max(...list.map((f) => f.h)) + 'px';
    ifr.srcdoc = printAllSrcdoc(list);
    document.body.appendChild(ifr);
    frame = ifr;
    timer = setTimeout(drop, PRINT_FRAME_MS);
    const left = order.length - list.length;
    if (left) sayChip(t('{n} refused artboards are left out of the print', { n: left }));
    return true;
  }

  // ── downloads ──
  function save(href, name) {
    const a = mk('a');
    a.href = href;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  let fetching = false;
  async function downloadHtml() {
    if (fetching) return;
    fetching = true;
    try {
      const q = new URLSearchParams();
      if (hostKey(host)) q.set('host', hostKey(host));
      q.set('dir', dir);
      let res = null;
      try { res = await fetch('/api/design/bundle?' + q.toString()); } catch { res = null; }
      if (signal.aborted) return;
      if (!res || !res.ok) {
        let j = null;
        try { j = res ? await res.json() : null; } catch { j = null; }
        sayChip(j && j.error ? t('Download failed: {why}', { why: String(j.error).slice(0, 300) }) : t('Download failed — the server did not answer'));
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      save(url, downloadName(res.headers.get('content-disposition')));
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } finally { fetching = false; }
  }
  function downloadZip() {
    const q = new URLSearchParams();
    q.set('path', dir);
    if (hostKey(host)) q.set('host', hostKey(host));
    save('/api/download-zip?' + q.toString(), '');
  }

  // ⋯ rows (the window's ⋯ builder reads `_designMoreRows`)
  if (winInfo) (winInfo._designMoreRows = winInfo._designMoreRows || []).push(
    () => ({ label: t('Print all artboards on this page'), action: () => printAll() }),
    () => ({ label: t('Download HTML'), action: () => { downloadHtml(); } }),
    () => ({ label: t('Download folder (.zip)'), action: () => downloadZip() }),
  );
  return { start, printAll, downloadHtml, downloadZip };
}
