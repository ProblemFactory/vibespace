// THE `desktop-app` WINDOW (docs/design-desktop-apps.zh.md §2 row 7; P8-1,
// 2026-09-13): one window per app session, tab-group capable, restored from
// its openSpec `{ action:'openDesktopApp', id }` on reload / on every other
// client (N browsers watch ONE display — the picture server is `-shared`).
// The picture is the SHARED component (vnc-view.js) on the ONE bridge
// (/api/desktop/<id>/stream); this file only adds what an app session has
// that the singleton desktop does not: the backend rung + why it fell back
// (the user must know whether they are looking at one window or a whole
// display), CPU/RSS from the keeper's broadcast, the idle countdown, "Keep
// running" and Stop. It never fetches process facts itself — it READS the
// `desktop-apps-updated` broadcast (one GET at open for the first record).
import { t } from './i18n.js';
import { escHtml, fetchJson, showToast } from './utils.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { createVncView, streamUrl } from './vnc-view.js';

const ICON = svgIcon16('<rect x="1.5" y="2.5" width="13" height="10" rx="1"/><path d="M1.5 5.5h13M4 4h.01M6 4h.01"/>');

/** The status-chip text for a record: "vnc-display (xpra not on PATH)". */
export function backendChipText(rec) {
  if (!rec || !rec.backend) return '';
  return rec.fallbackWhy ? `${rec.backend} (${rec.fallbackWhy})` : rec.backend;
}
/** "CPU 3% · 120 MB" or '' when the keeper has not sampled yet. */
export function liveChipText(rec) {
  const l = rec && rec.live;
  if (!l || !Number.isFinite(l.rssBytes)) return '';
  const cpu = Number.isFinite(l.cpuPct) ? `CPU ${Math.max(0, Math.round(l.cpuPct))}% · ` : '';
  return `${cpu}${Math.round(l.rssBytes / 1048576)} MB`;
}
/** Idle countdown text from the record's own clock, computed locally each
 *  second between broadcasts; '' when the app never times out. */
export function idleChipText(rec, now = Date.now()) {
  if (!rec || !(rec.idleTimeoutMs > 0) || rec.state !== 'ready') return '';
  const remaining = Math.max(0, (Number(rec.lastInputAt) || Number(rec.startedAt) || now) + rec.idleTimeoutMs - now);
  const min = Math.ceil(remaining / 60000);
  return min > 1 ? t('idle stop in {n} min', { n: min }) : t('idle stop in under a minute');
}
/** The terminal-state sentence. */
export function endedText(rec) {
  if (!rec) return '';
  if (rec.state === 'failed') return rec.lastError ? t('Failed: {why}', { why: rec.lastError }) : t('Failed');
  if (rec.state === 'exited') {
    if (rec.stoppedBy === 'user') return t('Stopped');
    if (rec.lastError) return t('Exited: {why}', { why: rec.lastError });
    return Number.isInteger(rec.exitCode) ? t('Exited (code {code})', { code: rec.exitCode }) : t('Exited');
  }
  return '';
}

export function openDesktopApp(app, id, { syncId } = {}) {
  if (typeof id !== 'string' || !id) return null;
  for (const [wid, win] of app.wm.windows) {
    if (win._desktopAppId === id) { app.wm.focusWindow(wid); return win; }
  }
  app._hideWelcome();
  const winInfo = app.wm.createWindow({
    title: t('Desktop app'), type: 'desktop-app', syncId, width: 900, height: 620,
    openSpec: { action: 'openDesktopApp', id },
  });
  winInfo._desktopAppId = id;

  let rec = null;
  let gone = false;
  const readyGate = async () => {
    if (!rec) { const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}`); if (r && !r.error) rec = r; }
    if (!rec) return { ok: false, error: t('This desktop app no longer exists') };
    if (rec.state === 'launching') return { ok: false, error: t('Starting application…') };
    if (rec.state !== 'ready') return { ok: false, error: endedText(rec) };
    return { ok: true };
  };
  const view = createVncView(winInfo.content, {
    url: streamUrl(`/api/desktop/${encodeURIComponent(id)}/stream`),
    labels: { starting: t('Starting application…'), unavailable: t('Desktop app unavailable') },
    before: readyGate, autoReconnect: true,
  });

  // ── the bar: backend rung, CPU/RSS, idle countdown, Keep running, Stop ──
  const backendChip = document.createElement('span'); backendChip.className = 'desktop-app-chip desktop-app-chip-backend';
  const liveChip = document.createElement('span'); liveChip.className = 'desktop-app-chip desktop-app-chip-live';
  const idleChip = document.createElement('span'); idleChip.className = 'desktop-app-chip desktop-app-chip-idle';
  const keepBtn = document.createElement('button'); keepBtn.className = 'file-tool-btn'; keepBtn.style.cssText = 'width:auto;padding:0 8px;font-size:10px';
  keepBtn.textContent = t('Keep running'); keepBtn.title = t('Never stop this app for being idle');
  const stopBtn = document.createElement('button'); stopBtn.className = 'file-tool-btn desktop-app-stop'; stopBtn.style.cssText = 'width:auto;padding:0 8px;font-size:10px';
  stopBtn.textContent = t('Stop'); stopBtn.title = t('Stop this application and its display');
  for (const el of [backendChip, liveChip, idleChip, keepBtn, stopBtn]) view.addControl(el);

  const render = () => {
    if (!rec) return;
    app.wm.setTitle(winInfo.id, rec.label || t('Desktop app'));
    backendChip.textContent = backendChipText(rec);
    backendChip.title = rec.fallbackWhy ? t('Backend: {backend} — fell back because {why}', { backend: rec.backend, why: rec.fallbackWhy }) : t('Backend: {backend}', { backend: rec.backend || '' });
    const lt = liveChipText(rec); liveChip.textContent = lt; liveChip.style.display = lt ? '' : 'none';
    const it = idleChipText(rec); idleChip.textContent = it; idleChip.style.display = it ? '' : 'none';
    keepBtn.style.display = rec.state === 'ready' && rec.idleTimeoutMs > 0 ? '' : 'none';
    stopBtn.style.display = rec.state === 'ready' || rec.state === 'launching' ? '' : 'none';
    if (rec.state === 'exited' || rec.state === 'failed') {
      if (!gone) { gone = true; view.disconnect(); }
      view.setStatus(endedText(rec), { error: rec.state === 'failed', reconnect: false });
    }
  };
  const applyRecord = (r) => {
    rec = r; render();
    // the keeper's answer is the fact: ready (just came up, or ADOPTED after a
    // restart) and the picture is not up ⇒ connect; the view's own ladder
    // covers a dropped transport in between
    if (r.state === 'ready' && !gone && view.state !== 'connected' && view.state !== 'connecting' && view.state !== 'starting') view.connect();
  };
  const refetch = async () => { const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}`); if (r && !r.error) applyRecord(r); };

  keepBtn.onclick = async () => {
    const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/keep-alive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!r || r.error) { showToast(r?.error || t('Could not change the idle timeout'), { type: 'error' }); return; }
    applyRecord(r); showToast(t('This app will keep running until you stop it'));
  };
  stopBtn.onclick = async () => {
    stopBtn.disabled = true;
    const r = await fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    stopBtn.disabled = false;
    if (!r || r.error) { showToast(r?.error || t('Could not stop the app'), { type: 'error' }); return; }
    applyRecord(r);
  };

  const off = app.ws.onGlobal((m) => {
    if (m.type !== 'desktop-apps-updated') return;
    const r = (m.apps || []).find((a) => a.id === id);
    if (r) applyRecord(r);
  });
  // a server restart ADOPTS the session before any client reconnects, so the
  // adoption broadcast reaches nobody — re-read the record on every reconnect
  const onWs = (connected) => { if (connected) refetch(); };
  app.ws.onStateChange(onWs);
  const tick = setInterval(() => { if (rec && rec.state === 'ready') { const it = idleChipText(rec); idleChip.textContent = it; idleChip.style.display = it ? '' : 'none'; } }, 1000);
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { try { off?.(); } catch {} try { app.ws.offStateChange?.(onWs); } catch {} clearInterval(tick); });
  winInfo.onClose = () => view.dispose();

  // first record, then the connect (the gate re-reads if the GET raced the launch)
  fetchJson(`/api/desktop/apps/${encodeURIComponent(id)}`).then((r) => {
    if (r && !r.error) { rec = r; render(); }
    else { view.setStatus(t('This desktop app no longer exists'), { error: true, reconnect: false }); return; }
    if (rec.state === 'launching') {
      view.setStatus(t('Starting application…'));
      // the broadcast flips it to ready; connect then (applyRecord)
    } else if (rec.state === 'ready') view.connect();
  });
  return winInfo;
}

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) ── one window per app session
registerWindowType({
  type: 'desktop-app', label: 'Desktop app', icon: ICON,
  action: 'openDesktopApp', replay: (app, spec, { syncId } = {}) => app.openDesktopApp(spec?.id, { syncId }),
});

/** A one-line HTML label for lists (escaped — labels come from the user's own
 *  command line and sync to every client). */
export function appRowHtml(rec) {
  return `<span class="desktop-app-row-label">${escHtml(rec.label || rec.exec || rec.id)}</span> <span class="desktop-app-row-state">${escHtml(rec.state === 'ready' ? t('running') : rec.state === 'launching' ? t('starting') : endedText(rec))}</span>`;
}
