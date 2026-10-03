// OPEN WITH LIBREOFFICE — THE CLIENT DOOR (docs/design-desktop-apps.zh.md §7.9; the owner's
// ruling 2026-09-27, option ②: a Word file is EDITED in LibreOffice running as a VibeSpace
// desktop app — the xpra rung, the highest fidelity; the in-browser viewer stays read-only).
//
//   app.openWithDesktopApp({catalogId, file, host})   THE ONE door — the file explorer's row calls it,
//        and so does the Word viewer's "Open in LibreOffice" button (file-viewer.js). `file` = the
//        absolute path ON `host` (the explorer's / the viewer's real path, never a host-labelled
//        title), `host` = the machine that holds it (null = this one);
//        the app runs THERE (the PURE verdict's machine rule — src/office-open.js). One POST: the
//        route checks the machine rule, the machine checks its catalog, the window opens. A refusal
//        is never silent: the launch dialog in FILE MODE says it where the user is (the machine
//        pinned to the file's, the plain sentence, "Install LibreOffice on <machine>…"); anything
//        else is a toast with its words.
//   app.officeVerdictFor(host, file)   the open-with verdict for the explorer's menu row WITHOUT
//        launching (GET /api/desktop/open-with — cached per machine and module for AVAIL_TTL_MS;
//        a machine that did not answer is never cached)
//   officeMenuItems(app, verdict, …)    the menu rows by that verdict: "Open with LibreOffice", or —
//        LibreOffice absent on that machine — ONE plain sentence saying so + "Install LibreOffice on
//        <machine>…" (the owner's rule: never a greyed row with a hint)
//   app.officeOfferAt(anchor, {host, file})   the Word viewer's "Open in LibreOffice" button asks it
//        first: LibreOffice ABSENT on the file's machine ⇒ THOSE SAME ROWS (the sentence + the install
//        offer) in a popover under the button, and true; anything else ⇒ false (the viewer goes through
//        the door, which says its own refusals)
//   the `file-changed` broadcast → the page's window event (src/lib/file-changed.js)
import { t } from './i18n.js';
import { fetchJson, showToast, createPopover } from './utils.js';
import { fileVerdict, moduleForFile, OFFICE_MODULES, FONTS_ID } from '../office-open.js';
import { rememberedShareFor, announceRememberedShare, launchKeyOf } from './window-share.js'; // B-04da ⑥
import { launchDpr, launchUiScale, showLaunchDialog, showInstallDialog, openWithRefusalText, officeInstallLabel, officeFontsLabel } from './desktop-app-launcher.js';
import { SCALE_PREF_KEY, launchScaleChoice } from './desktop-app-scale.js';
import { wireAppPrefs, appPrefs, appPrefsReady } from './desktop-app-prefs.js';
import { relayFileChanged } from './file-changed.js';

export const AVAIL_TTL_MS = 60000;
/** Codes the launch dialog's FILE MODE says (with the machine picker and the install offer); anything else is a toast. */
export const DIALOG_CODES = Object.freeze(['app-absent', 'host-unreachable', 'host_unavailable', 'host_needs_daemon', 'machine-mismatch', 'no-backend']);
/** Verdicts worth remembering for the menu (a machine's LibreOffice state); an unreachable machine is asked again. */
const CACHEABLE = new Set([null, 'app-absent', 'host_needs_daemon']);

const hostOf = (h) => (h && h !== 'local' ? String(h) : null);

/** A machine's name for a sentence: this machine, or the paired machine's name the sidebar knows (a DISPLAY string —
 *  it only reaches textContent, never a request). */
export function machineLabelFor(app, host) {
  const h = hostOf(host);
  if (!h) return t('this machine');
  const hosts = app?.sidebar?._hostsData?.hosts || [];
  const rec = hosts.find((x) => x && x.id === h);
  return String((rec && rec.name) || h);
}

/** The menu rows for one office file (PURE given `verdict`; the explorer calls it): `key` lets the explorer patch the
 *  rows in place when the verdict arrives after the menu opened. */
export function officeMenuItems(app, verdict, { host = null, file = '' } = {}) {
  const machine = machineLabelFor(app, host);
  if (verdict && verdict.ok === false && verdict.code === 'app-absent') {
    const what = (verdict.remedy && verdict.remedy.what) || verdict.catalogId || (OFFICE_MODULES[moduleForFile(file)] || {}).id || 'libreoffice-writer';
    const appLabel = (OFFICE_MODULES[verdict.module || moduleForFile(file)] || {}).label || 'LibreOffice';
    return [
      { key: 'office-note', note: true, label: openWithRefusalText('app-absent', { app: appLabel, machine }) },
      { key: 'office-install', label: officeInstallLabel(machine), action: () => installOffice(app, { host, what }) },
    ];
  }
  if (verdict && verdict.ok === false && verdict.code === 'host_needs_daemon') {
    return [{ key: 'office-note', note: true, label: openWithRefusalText('host_needs_daemon', { machine }) }];
  }
  const open = { key: 'office-open', label: t('Open with LibreOffice'), action: () => app.openWithDesktopApp({ file, host }) };
  // B-04da ②: LibreOffice is there but the Calibri / Cambria look-alikes are not — a .docx lays out in other faces
  // (other line breaks, another page count): offer the faces alone, on the file's machine
  if (verdict && verdict.ok && Array.isArray(verdict.fontsMissing) && verdict.fontsMissing.length) {
    return [open, { key: 'office-fonts', label: officeFontsLabel(machine), title: t('{fonts} missing — Word documents lay out with other fonts until they are installed', { fonts: verdict.fontsMissing.join(', ') }), action: () => installOffice(app, { host, what: FONTS_ID }) }];
  }
  return [open];
}

/** §7.9 the Word viewer's button: LibreOffice ABSENT on the file's machine (or its agent too old to know it) ⇒ the
 *  explorer row's rows — `officeMenuItems`, the ONE spelling of the plain sentence + "Install LibreOffice on
 *  <machine>…" — as a popover under `anchor` (a note is text, the install is a real menu item: focusable, Enter /
 *  Space), → true. Anything else (present, not asked, the machine not answering, a transport failure) → false: the
 *  caller goes through the door. Never a greyed button. */
export async function officeOfferAt(app, anchor, { host = null, file } = {}) {
  const h = hostOf(host);
  const q = officeVerdictFor(app, h, file);
  const v = q.cached || await q.promise;
  if (!v || v.ok !== false || (v.code !== 'app-absent' && v.code !== 'host_needs_daemon')) return false;
  const rows = officeMenuItems(app, v, { host: h, file });
  if (!anchor || !anchor.isConnected) return true; // the viewer closed while the verdict was on its way — said nowhere, nothing to do
  const pop = createPopover(anchor, 'context-menu office-offer');
  pop.setAttribute('role', 'menu');
  let first = null;
  for (const it of rows) {
    const el = document.createElement('div');
    if (it.key) el.dataset.key = it.key;
    el.textContent = it.label; // a DISPLAY string (the machine's name) — textContent only
    if (it.note) { el.className = 'context-menu-note'; el.setAttribute('role', 'note'); }
    else {
      el.className = 'context-menu-item';
      el.setAttribute('role', 'menuitem');
      el.tabIndex = 0;
      const go = () => { pop.remove(); it.action?.(); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
      first = first || el;
    }
    pop.appendChild(el);
  }
  if (first) requestAnimationFrame(() => { if (first.isConnected) first.focus({ preventScroll: true }); });
  return true;
}

/** "Install LibreOffice on <machine>…" — the SAME install dialog as xpra's (the plan first), for this module. */
export function installOffice(app, { host = null, what = 'libreoffice-writer', onDone = null } = {}) {
  const h = hostOf(host);
  return showInstallDialog({ hostId: h || 'local', label: h ? machineLabelFor(app, h) : null }, { what, onDone: () => { app._officeVerdicts?.clear(); onDone?.(); } });
}

/** The verdict for a file on a machine WITHOUT launching → `{ cached, promise }` (cached = a remembered answer, else null). */
export function officeVerdictFor(app, host, file) {
  const mod = moduleForFile(file);
  if (!mod) return { cached: null, promise: Promise.resolve(null) };
  const h = hostOf(host);
  const cache = app._officeVerdicts || (app._officeVerdicts = new Map());
  const key = `${h || 'local'}|${mod}`;
  const hit = cache.get(key);
  if (hit && hit.v && Date.now() - hit.at < AVAIL_TTL_MS) return { cached: hit.v, promise: Promise.resolve(hit.v) };
  if (hit && hit.p) return { cached: null, promise: hit.p };
  const p = fetchJson(`/api/desktop/open-with?peek=1&path=${encodeURIComponent(file)}${h ? `&host=${encodeURIComponent(h)}` : ''}`).then((v) => {
    const ok = !!v && typeof v.ok === 'boolean'; // a verdict (a refusal carries `error` too); anything else is a transport failure
    if (ok && !v.unchecked && CACHEABLE.has(v.ok ? null : v.code)) cache.set(key, { at: Date.now(), v }); // `unchecked` = the machine was not asked (a menu never connects): asked again next time
    else cache.delete(key);
    return ok ? v : null;
  }, () => { cache.delete(key); return null; });
  cache.set(key, { at: Date.now(), p });
  return { cached: null, promise: p };
}

/** THE DOOR. → the launch record, or null (refused — said where the user is). */
export async function openWithDesktopApp(app, { catalogId = null, file, host = null } = {}) {
  const h = hostOf(host);
  const machine = machineLabelFor(app, h);
  const fv = fileVerdict(file);
  if (!fv.ok) { showToast(openWithRefusalText(fv.code, { file: String(file || '').split('/').pop(), machine }) || fv.error, { type: 'error' }); return null; }
  // the app's own default scale (a window's "Make n× the default"), like every launch — the user state read once per page
  wireAppPrefs(app);
  await Promise.race([appPrefsReady(), new Promise((r) => setTimeout(r, 3000))]);
  const appId = catalogId || OFFICE_MODULES[fv.module].id;
  const scaleChoice = launchScaleChoice(appPrefs(SCALE_PREF_KEY), { appId });
  // B-04da ⑥: the share this app REMEMBERS rides the door too (the launcher's untouched row applies it; a document
  // opened from the explorer was hidden from agents however the person had shared LibreOffice) — this machine only
  const share = h ? null : await rememberedShareFor(app, launchKeyOf({ appId }));
  const r = await fetchJson('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId, file: fv.file, fileHost: h || 'local', ...(h ? { host: h } : {}), dpr: launchDpr(), uiScale: launchUiScale(), ...(scaleChoice != null ? { scaleChoice } : {}), ...(share ? { share } : {}) }) });
  if (r && !r.error && r.id) {
    app.openDesktopApp(r.id);
    announceRememberedShare(app, share, r);
    if (r.reachError) showToast(t('The app started, but sharing it failed: {why}', { why: r.reachError.error || '' }), { type: 'error' });
    return r;
  }
  const code = (r && r.code) || null;
  app._officeVerdicts?.clear(); // what the menu remembered is stale now
  if (DIALOG_CODES.includes(code)) {
    showLaunchDialog(app, { file: { path: fv.file, host: h, module: fv.module, label: fv.label, hostLabel: h ? machine : null }, refusal: { code, error: (r && r.error) || '' } });
    return null;
  }
  showToast(openWithRefusalText(code, { file: fv.label, machine, app: OFFICE_MODULES[fv.module].label }) || (r && r.error) || t('Could not open the document in LibreOffice'), { type: 'error' });
  return null;
}

/** Wire the door, the verdict lookup and the file-changed relay onto the App (the mediator). */
export function installOpenWith(app) {
  app.openWithDesktopApp = (opts) => openWithDesktopApp(app, opts);
  app.officeVerdictFor = (host, file) => officeVerdictFor(app, host, file);
  app.officeMenuItems = (verdict, opts) => officeMenuItems(app, verdict, opts);
  app.officeOfferAt = (anchor, opts) => officeOfferAt(app, anchor, opts);
  app.ws?.onGlobal?.((m) => { if (m && m.type === 'file-changed') relayFileChanged(m); });
}
