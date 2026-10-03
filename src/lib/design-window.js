// THE DESIGN WINDOW (lane design-window L2, 2026-10-02; SharedContext/vibespace-design-window-design.md §3.5) — window
// type `design`: the conversation's `designs/<slug>/` artboards on a canvas, live while the agent writes them, a click
// on an element → a quoted comment the agent receives as the user's own message, Print, Publish….
//
//   · openSpec `{action:'openDesign', host, dir, sessionId}` — layout restore, cross-client sync, desktops, the phone;
//     ONE window per (host, dir) per client (`revealWindow` when it exists — §62).
//   · THE READ: `GET /api/design?host&dir` (the hub's read: the manifest, the artboards inlined, a verdict per frame)
//     through the PURE `normalizeRead`; a failure is a NAMED card (never a blank canvas), a refused frame a named card
//     in its place. Single-flight: a change during a read re-reads once after it.
//   · LIVE: `design-watch {host, dir}` on open (and on every ws reconnect — the hub's refcount is per socket),
//     `design-unwatch` on close; the hub's `file-changed` broadcast, relayed as the window event (src/lib/file-changed.js
//     `onFileChanged`, bound to the window's listener signal), for any file under the dir ⇒ ONE coalesced re-read whose
//     result swaps only the frames whose document changed (pan / zoom / page / focus kept; a manifest change
//     re-layouts) — the canvas core decides per frame.
//   · COMMENT (pick mode): the canvas lifts its shields and tells its frames; a fenced pick opens the composer (the
//     quote line read-only, a textarea, Send / Cancel — floating at the frame on a desktop, a createModalShell sheet on
//     a phone) → `POST /api/design/comment {sessionId, quote:{file, path, tag, text}, text}`; the hub spells the line
//     (design-model pickQuote / commentText) and belts it (peer-text). A refusal is a floating CHIP in plain words —
//     never a greyed control.
//   · PRINT: the focused artboard in a transient frame sandboxed `allow-scripts allow-modals` (print() needs
//     allow-modals; still never allow-same-origin) with the row's @page.
//   · PUBLISH…: the explorer's publish dialog twin (title + public) → `POST /api/design/publish {host, dir, title,
//     public}`; the hub bundles server-side; the link dialog after.
//   · The bar folds into ⋯ by priority (bar-fold.js — never wraps); a phone (≤ 768) keeps 44 px targets, Publish in ⋯,
//     a bottom sheet of artboards (tap = focused).
import { showToast, fetchJson, createModalShell, showContextMenu, copyText, absUrl, uiScale, COUNTER_ZOOM } from './utils.js';
import { t, deviceLocale } from './i18n.js';
import { registerWindowType } from './window-types.js';
import { UI_ICONS } from './icons.js';
import { createBarFold } from './bar-fold.js';
import { onFileChanged, foldPath } from './file-changed.js';
import { createDesignCanvas } from './design-canvas.js';
import { pickerSource } from './design-pick.js';
import { normalizeRead, quoteLine, printSrcdoc, zoomPercent } from './design-canvas-model.js';
import { mountDesignAsk } from './design-ask.js';
import { mountDesignChanges } from './design-changes.js';
import { mountDesignPresent } from './design-present.js';
import { mountDesignTweaks } from './design-tweaks.js';
import { openDesignHome } from './design-home.js'; // lane design-systems-home: the window with no folder = the home

const RELOAD_COALESCE_MS = 250;
const CHIP_MS = 10000;
// accept-fixes F1: a comment's answer is waited for with words — "Still sending…" after SLOW, the composer's own Send back
// (and the words for a late answer) at WAIT; a server busy for 15 s (owner-seen) or a lost answer never pins "Sending…" again
const COMMENT_SLOW_MS = 4000;
const COMMENT_WAIT_MS = 30000;
const PRINT_FRAME_MS = 10 * 60 * 1000;

const hostKey = (h) => (!h || h === 'local' ? '' : String(h));
const baseName = (d) => { const p = foldPath(String(d || '')).replace(/\/+$/, ''); return p.slice(p.lastIndexOf('/') + 1) || p; };
const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
const qs = (host, dir) => { const q = new URLSearchParams(); if (hostKey(host)) q.set('host', hostKey(host)); q.set('dir', dir); return q.toString(); };

/** The words a comment refusal is said in (the hub's code first; its own sentence when the code is unknown). */
export function commentRefusalText(r) {
  if (!r) return t('Could not send the comment — the server did not answer');
  const code = r.code || '';
  if (code === 'no_session' || code === 'session_required' || code === 'unknown_session') return t('This design is not linked to a conversation — open it from the conversation\'s design chip to comment');
  if (code === 'empty') return t('Write what should change first');
  if (code === 'too_long') return t('The comment is too long — keep it under 4000 characters');
  return r.error ? t('The comment was not sent: {why}', { why: String(r.error).slice(0, 300) }) : t('The comment was not sent');
}
/** The words a delivered comment is confirmed in (the hub says HOW it went: typed now / queued behind the turn / waiting). */
export function commentSentText(r) {
  const how = String((r && (r.delivered || r.via || r.lane || r.how)) || '');
  if (/stash|wait|held/i.test(how)) return t('The conversation is not running — your comment waits above its composer');
  if (/queue/i.test(how)) return t('Comment queued — the agent reads it after its current turn');
  return t('Comment sent to the agent');
}

/** The publish dialog (the explorer's twin): title + public → POST /api/design/publish → the link. Also the chip's door. */
export function openDesignPublishDialog(app, { host = '', dir = '', title = '' } = {}) {
  const { body, close } = createModalShell({ title: t('Publish design'), escapeToClose: true, minWidth: '380px', dialogClass: 'design-publish-dialog' });
  const nameLab = mk('label', 'design-publish-field');
  nameLab.append(document.createTextNode(t('Page title')));
  const name = mk('input', 'dialog-input');
  name.value = title || baseName(dir);
  nameLab.appendChild(name);
  const pubLab = mk('label', 'design-publish-public');
  const pub = mk('input');
  pub.type = 'checkbox';
  pubLab.append(pub, document.createTextNode(' ' + t('Public — anyone with the link can view (no login)')));
  const state = mk('div', 'design-publish-state');
  state.textContent = t('Checking whether this design was published before…');
  const where = mk('div', 'design-publish-where');
  where.textContent = (hostKey(host) ? hostKey(host) + ':' : '') + dir;
  const foot = mk('div', 'dialog-footer');
  const cancel = mk('button', 'btn-cancel'); cancel.type = 'button'; cancel.textContent = t('Cancel');
  const go = mk('button', 'btn-create'); go.type = 'button'; go.textContent = t('Publish');
  foot.append(cancel, go);
  body.append(nameLab, pubLab, state, where, foot);
  cancel.onclick = close;
  // THE PAGE AS IT IS (L4 B⑤): a republish keeps the URL AND the visibility the user left it with — the box pre-fills
  // from the existing page and `public` rides only when the user changed it (an untouched box = the hub keeps the rest;
  // before this the box always started unticked and a republish from the window turned a public page private, unsaid)
  let page = null, known = false;
  const info = fetchJson('/api/designs').then((r) => {
    const rows = r && Array.isArray(r.designs) ? r.designs : null;
    known = !!rows;
    const row = rows && rows.find((x) => hostKey(x.host) === hostKey(host) && foldPath(String(x.dir || '')) === foldPath(dir));
    page = (row && row.page) || null;
    if (page) { pub.checked = !!page.public; state.textContent = page.public ? t('Published before as a public page — publishing again keeps its link and leaves it public unless you untick the box') : t('Published before as a private page — publishing again keeps its link and leaves it private unless you tick the box'); }
    else state.textContent = known ? t('Not published yet — a new link, private unless you tick the box') : t('Could not check whether this design was published before — the box decides');
  });
  let busy = false;
  go.onclick = async () => {
    if (busy) return;
    busy = true;
    go.textContent = t('Publishing…');
    await info;
    const wantPublic = (!page || !known || pub.checked !== !!page.public) ? pub.checked : undefined;   // untouched = kept as it is
    const r = await fetchJson('/api/design/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host: hostKey(host), dir, title: name.value.trim(), ...(wantPublic === undefined ? {} : { public: wantPublic }) }) });
    busy = false;
    go.textContent = t('Publish');
    if (!r || !r.page) { showToast(t('Publish failed: {err}', { err: (r && (r.why || r.error)) || t('server unreachable') }), { type: 'error' }); return; }
    close();
    const url = absUrl(r.page.url || r.page.path || '');
    const { body: b2, close: c2 } = createModalShell({ title: t('Page published'), escapeToClose: true, minWidth: '380px' });
    const u = mk('div', 'design-publish-url'); u.textContent = url;
    const v = mk('div', 'design-publish-where'); v.textContent = r.page.public ? t('Public — anyone with the link can view (no login)') : t('Private — viewers need a VibeSpace login');
    const f2 = mk('div', 'dialog-footer');
    const cp = mk('button', 'btn-cancel'); cp.type = 'button'; cp.textContent = t('Copy link');
    const op = mk('button', 'btn-create'); op.type = 'button'; op.textContent = t('Open');
    cp.onclick = () => { copyText(url); showToast(t('Link copied')); };
    op.onclick = () => { if (app?.openBrowser) app.openBrowser(url); else window.open(url, '_blank', 'noopener'); c2(); };
    f2.append(cp, op);
    b2.append(u, v, f2);
  };
  setTimeout(() => { name.focus(); name.select(); }, 0);
}

/** Open (or reveal) the Design window for one design folder. */
export function openDesign(app, { host = '', dir = '', sessionId = '', syncId } = {}) {
  const h = hostKey(host);
  const d = String(dir || '');
  if (!d) return openDesignHome(app, { syncId }); // no folder = the home: every design and design system (lane design-systems-home)
  const existing = [...app.wm.windows.values()].find((w) => w._design && w._design.host === h && foldPath(w._design.dir) === foldPath(d));
  if (existing) {
    if (sessionId && !existing._design.sessionId) { existing._design.sessionId = sessionId; if (existing._openSpec) existing._openSpec.sessionId = sessionId; }
    app.wm.revealWindow(existing.id, { replay: !!syncId });
    existing._designRewatch?.(); // accept-fixes F3: the agent's open / new re-asserts THIS window's watch (the hub counts it for sync)
    return existing;
  }
  const openSpec = { action: 'openDesign', host: h, dir: d, sessionId: sessionId || '' };
  const winInfo = app.wm.createWindow({ title: baseName(d) || t('Design'), type: 'design', syncId, openSpec, width: 1000, height: 680 });
  winInfo._design = { host: h, dir: d, sessionId: sessionId || '' };
  const signal = winInfo._listenerCtl.signal;
  const L = { signal };
  const phone = !!app.isMobile;

  const root = mk('div', 'design-window' + (phone ? ' design-phone' : ''));
  const bar = mk('div', 'design-bar');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', t('Design'));
  const stage = mk('div', 'design-stage');
  const canvasHost = mk('div', 'design-canvas-host');
  const status = mk('div', 'design-status empty-hint');
  status.textContent = t('Loading design…');
  stage.append(canvasHost, status);
  root.append(bar, stage);
  winInfo.content.appendChild(root);

  // ── the bar: built once, every item keyed; priorities = the fold order (0 never folds, higher folds first) ──
  const KEYS = new Map(); // el → { key, priority }
  const btn = (key, icon, label, priority, { words = false } = {}) => {
    const b = mk('button', 'design-btn design-btn-' + key);
    b.type = 'button';
    b.innerHTML = UI_ICONS[icon];
    if (words) { const s = mk('span'); s.textContent = label; b.appendChild(s); }
    b.title = label;
    b.setAttribute('aria-label', label);
    KEYS.set(b, { key, priority, label });
    bar.appendChild(b);
    return b;
  };
  const backBtn = btn('back', 'chevronLeft', t('Back to canvas'), 0, { words: !phone });
  backBtn.style.display = 'none';
  const fitBtn = btn('fit', 'fit', t('Fit'), 0);
  const outBtn = btn('out', 'zoomOut', t('Zoom out'), 0);
  const zoomLbl = mk('button', 'design-btn design-zoom');
  zoomLbl.type = 'button';
  zoomLbl.textContent = '100%';
  zoomLbl.title = t('Zoom to 100%');
  zoomLbl.setAttribute('aria-label', t('Zoom to 100%'));
  KEYS.set(zoomLbl, { key: 'zoom', priority: 4, label: t('Zoom') });
  bar.appendChild(zoomLbl);
  const inBtn = btn('in', 'zoomIn', t('Zoom in'), 0);
  const pageSel = mk('select', 'design-pages');
  pageSel.setAttribute('aria-label', t('Page'));
  pageSel.title = t('Page');
  pageSel.style.display = 'none';
  KEYS.set(pageSel, { key: 'pages', priority: 3, label: t('Page') });
  bar.appendChild(pageSel);
  const boardsBtn = btn('boards', 'columns', t('Artboards'), 2);
  const commentBtn = btn('comment', 'chat', t('Comment'), 0, { words: !phone });
  commentBtn.setAttribute('aria-pressed', 'false');
  const presentBtn = btn('present', 'play', t('Present'), 1, { words: !phone }); // lane design-present (src/lib/design-present.js wires it)
  const tweaksBtn = btn('tweaks', 'sliders', t('Tweaks'), 1, { words: !phone }); // lane design-tweaks: the free knobs
  const reloadBtn = btn('reload', 'refresh', t('Reload'), 5);
  const printBtn = btn('print', 'print', t('Print'), 6);
  const publishBtn = btn('publish', 'upload', t('Publish…'), 6, { words: true });
  if (phone) publishBtn.style.display = 'none'; // the phone: Publish lives in ⋯
  const stamp = mk('span', 'design-stamp');
  KEYS.set(stamp, { key: 'stamp', priority: 7, label: '' });
  bar.appendChild(stamp);
  const more = mk('button', 'design-btn design-more bar-folded');
  more.type = 'button';
  more.innerHTML = UI_ICONS.more;
  more.title = t('More');
  more.setAttribute('aria-label', t('More'));
  more.setAttribute('aria-haspopup', 'menu');
  bar.appendChild(more);
  const fold = createBarFold(bar, {
    more,
    moreAlways: () => phone || !!(winInfo._designMoreRows && winInfo._designMoreRows.length),
    items: () => [...bar.children].filter((el) => el !== more && KEYS.has(el)).map((el) => ({ key: KEYS.get(el).key, el, priority: KEYS.get(el).priority })),
    signal,
    onLayout: (v) => { winInfo._designBarLayout = v; },
  });
  const ROW_ACTS = { fit: () => canvas.fit(), out: () => canvas.zoomBy(-1), in: () => canvas.zoomBy(+1), boards: () => openBoards(), reload: () => load(), print: () => doPrint(), comment: () => togglePick(), back: () => canvas.focus(null) };
  ROW_ACTS.present = () => present.start();
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    const folded = new Set(fold.folded());
    const rows = [];
    for (const [el, k] of KEYS) {
      if (!folded.has(k.key) || el.style.display === 'none') continue;
      if (k.key === 'pages') { for (const p of canvas.pages()) rows.push({ label: (p.id === canvas.page() ? '✓ ' : '') + (p.name || t('Page')), action: () => canvas.setPage(p.id) }); continue; }
      if (k.key === 'zoom') { rows.push({ label: t('Zoom: {pct}', { pct: zoomLbl.textContent }), action: () => canvas.zoomTo(1) }); continue; }
      if (k.key === 'stamp') { if (stamp.textContent) rows.push({ label: stamp.textContent, action: () => load() }); continue; }
      if (ROW_ACTS[k.key]) rows.push({ label: k.label, action: ROW_ACTS[k.key] });
    }
    if (phone || folded.has('publish')) rows.push({ label: t('Publish…'), action: () => publish() });
    for (const extra of winInfo._designMoreRows || []) { const row = extra(); if (row) rows.push(row); } // the lanes' own ⋯ rows (design-ask: Copy hand-off prompt)
    if (!rows.length) return;
    const r = more.getBoundingClientRect();
    showContextMenu(r.left, r.bottom + 2, rows);
  }, L);

  // ── the canvas ──
  const words = {
    refused: (code, why) => t('artboard refused: {why}', { why: why || code }),
    missing: t('artboard refused: listed in design.json but not in the folder'),
  };
  let composer = null; // the open composer: { el|close, pick, ta }
  const canvas = createDesignCanvas(canvasHost, {
    signal, counterZoom: COUNTER_ZOOM, pickerSrc: pickerSource(), words,
    onPick: (msg) => openComposer(msg),
    onKey: (msg, frame) => frameEscape(frame),
    onActivate: (file) => { if (!canvas.pick()) canvas.focus(file); },
    onChange: (s) => {
      zoomLbl.textContent = zoomPercent(s.view.z);
      backBtn.style.display = s.focused ? '' : 'none';
      commentBtn.classList.toggle('active', s.pick);
      commentBtn.setAttribute('aria-pressed', s.pick ? 'true' : 'false');
      if (pageSel.value !== s.page && [...pageSel.options].some((o) => o.value === s.page)) pageSel.value = s.page;
    },
  });
  winInfo._designCanvas = canvas; // the raw handle the heavy suite reads (never the DOM)
  pageSel.addEventListener('change', () => canvas.setPage(pageSel.value), L);
  fitBtn.addEventListener('click', () => canvas.fit(), L);
  outBtn.addEventListener('click', () => canvas.zoomBy(-1), L);
  inBtn.addEventListener('click', () => canvas.zoomBy(+1), L);
  zoomLbl.addEventListener('click', () => canvas.zoomTo(1), L);
  backBtn.addEventListener('click', () => canvas.focus(null), L);
  boardsBtn.addEventListener('click', () => openBoards(), L);
  reloadBtn.addEventListener('click', () => load(), L);
  printBtn.addEventListener('click', () => doPrint(), L);
  publishBtn.addEventListener('click', () => publish(), L);
  commentBtn.addEventListener('click', () => togglePick(), L);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && (canvas.pick() || canvas.focused())) { e.stopPropagation(); escape(); } }, L);

  // ── the floating chip: a refusal in plain words (never a greyed control) ──
  let chipTimer = 0;
  const chip = mk('div', 'design-chip');
  chip.setAttribute('role', 'status');
  const chipText = mk('span');
  const chipX = mk('button', 'design-chip-x'); chipX.type = 'button'; chipX.innerHTML = UI_ICONS.close; chipX.title = t('Dismiss'); chipX.setAttribute('aria-label', t('Dismiss'));
  chip.append(chipText, chipX);
  chip.style.display = 'none';
  stage.appendChild(chip);
  const hideChip = () => { chip.style.display = 'none'; clearTimeout(chipTimer); };
  chipX.addEventListener('click', hideChip, L);
  const sayChip = (text) => { chipText.textContent = text; chip.style.display = ''; clearTimeout(chipTimer); chipTimer = setTimeout(hideChip, CHIP_MS); };
  winInfo._designAsk = mountDesignAsk({ app, win: winInfo, stage, host: h, dir: d, signal, phone }); // lane design-ask: the questions sheet + ⋯ Copy hand-off prompt
  const changes = mountDesignChanges({ winInfo, canvas, stage, signal, phone, host: h, dir: d, sayChip, closeComposer, composer: () => composer }); // the changes strip (lane design-changes)
  const present = mountDesignPresent({ winInfo, canvas, button: presentBtn, signal, host: h, dir: d, sayChip, stopPick: () => { if (canvas.pick()) togglePick(); } }); // lane design-present: ▶ Present, Print all, Download HTML / .zip
  winInfo._designTweaks = mountDesignTweaks({ winInfo, canvas, stage, button: tweaksBtn, signal, phone, host: h, dir: d, sayChip }); // the Tweaks panel (lane design-tweaks)
  ROW_ACTS.tweaks = () => winInfo._designTweaks.toggle();

  // ── the read ──
  let loading = null, again = false, loadedOnce = false, lastRead = null, lastAt = null;
  const showError = (err) => {
    status.replaceChildren();
    const head = mk('div', 'design-status-head');
    head.textContent = err.code === 'unreachable' ? t('Could not read this design — the server did not answer. Press Reload to try again.') : t('Could not read this design: {why}', { why: err.why || err.code });
    status.appendChild(head);
    if (err.refusals && err.refusals.length) {
      const list = mk('ul', 'design-status-list');
      for (const r of err.refusals.slice(0, 12)) { const li = mk('li'); li.textContent = r.why || r.code; list.appendChild(li); }
      status.appendChild(list);
    }
    status.style.display = '';
  };
  async function load() {
    if (loading) { again = true; return loading; }
    loading = (async () => {
      do {
        again = false;
        const r = normalizeRead(await fetchJson('/api/design?' + qs(h, d)));
        if (signal.aborted) return;
        if (r.error) { if (!loadedOnce) showError(r.error); else sayChip(r.error.code === 'unreachable' ? t('Could not re-read the design — the server did not answer') : t('Could not read this design: {why}', { why: r.error.why || r.error.code })); continue; }
        lastRead = r;
        canvas.setFrames(r, { keepView: loadedOnce });
        loadedOnce = true;
        app.wm.setTitle(winInfo.id, r.title || baseName(d));
        drawPages();
        if (r.frames.length) status.style.display = 'none';
        else { status.textContent = t('No artboards yet — the agent writes them into {dir}', { dir: d }); status.style.display = ''; }
        lastAt = new Date();
        drawStamp(lastAt);
        stamp.title = (liveOff ? t('This window is not watching its folder: {why}. Press Reload to re-read it.', { why: liveOff }) + '\n' : '') + t('Last read from {dir} at {time}', { dir: d, time: lastAt.toLocaleString(deviceLocale()) }) + (r.warnings.length ? '\n' + r.warnings.map((w) => w.why || w.code).join('\n') : '');
      } while (again && !signal.aborted);
    })().finally(() => { loading = null; });
    return loading;
  }
  function drawPages() {
    const pages = canvas.pages();
    const sig = pages.map((p) => p.id + '\u0001' + p.name).join('\u0002');
    if (pageSel.dataset.sig !== sig) {
      pageSel.dataset.sig = sig;
      pageSel.replaceChildren(...pages.map((p) => { const o = mk('option'); o.value = p.id; o.textContent = p.name || t('Page'); return o; }));
    }
    pageSel.value = canvas.page();
    pageSel.style.display = pages.length > 1 ? '' : 'none';
  }

  // ── live: the hub's watch + the file-changed relay ──
  let liveOff = null; // the hub's refusal of the watch, in its words (watch_limit: 16 designs per window set, 32 per server; not_registered)
  const drawStamp = (at) => {
    const time = at.toLocaleTimeString(deviceLocale());
    stamp.textContent = liveOff ? t('Live repaint off · read {time}', { time }) : t('Read {time}', { time });
    stamp.classList.toggle('design-stamp-off', !!liveOff);
  };
  const watch = () => { try { app.ws.send({ type: 'design-watch', host: h, dir: d }); } catch { /* the socket queues */ } };
  // THE ACK IS SAID (L4 B③): a refused watch leaves the window on the page with no live repaint — the stamp and the chip
  // name the limit and the way out (Reload re-reads by hand). The ack carries no sessionId (a session-scoped error would
  // flip a chat window read-only), so it is matched on (host, dir).
  const offAck = app.ws.onGlobal?.((m) => {
    if (!m || m.type !== 'design-watch-ack' || m.op !== 'watch' || hostKey(m.host) !== h || foldPath(String(m.dir || '')) !== foldPath(d) || signal.aborted) return;
    if (m.ok) { if (liveOff) { liveOff = null; load(); } return; }
    liveOff = String(m.error || m.code || 'refused');
    if (lastAt) drawStamp(lastAt);
    stamp.title = t('This window is not watching its folder: {why}. Press Reload to re-read it.', { why: liveOff });
    sayChip(t('Live repaint is off for this design — {why}. Press Reload to re-read it.', { why: liveOff }));
  });
  watch();
  winInfo._designRewatch = watch; // the hub refcounts per socket — a second watch from the same window is a no-op
  const onState = (connected) => { if (connected && !signal.aborted) { watch(); load(); } };
  app.ws.onStateChange?.(onState);
  let reloadTimer = 0;
  const under = foldPath(d).replace(/\/+$/, '') + '/';
  onFileChanged((det) => {
    if (!det || hostKey(det.host) !== h || !foldPath(det.path).startsWith(under)) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => load(), RELOAD_COALESCE_MS);
  }, { signal });

  // ── comment (pick mode) ──
  const accent = () => { try { return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); } catch { return ''; } };
  function togglePick() {
    const on = !canvas.pick();
    if (on && !winInfo._design.sessionId) { sayChip(t('This design is not linked to a conversation — open it from the conversation\'s design chip to comment')); return; }
    canvas.setPick(on, accent());
    if (on) sayChip(phone ? t('Tap an element to comment on it') : t('Click an element to comment on it — Esc to stop'));
    else { hideChip(); closeComposer(); }
  }
  function escape() {
    if (composer) { closeComposer(); return; }
    if (canvas.pick()) { canvas.setPick(false); hideChip(); return; }
    if (canvas.focused()) canvas.focus(null);
  }
  /** Escape said by an artboard frame (the picker's keydown — the canvas admits it only from the frame that has the
   *  keyboard, at a human rate): it ends Comment mode, or leaves the focused view when it IS that frame — never the
   *  composer (its textarea takes the user's own Esc; typed words are never lost on a frame's say-so). L4 B①. */
  function frameEscape(frame) {
    if (composer) return;
    if (canvas.pick()) { canvas.setPick(false); hideChip(); return; }
    if (canvas.focused() && frame && frame.file === canvas.focused()) canvas.focus(null);
  }
  function closeComposer() {
    if (!composer) return;
    const c = composer;
    composer = null;
    if (c.close) c.close(); else c.el.remove();
  }
  function composerBody(pick) {
    const box = mk('div', 'design-composer-body');
    const quote = mk('div', 'design-quote');
    quote.textContent = quoteLine(pick); // the frame's facts — text, never markup
    const ta = mk('textarea', 'design-comment-input');
    ta.rows = 3;
    ta.placeholder = t('What should change?');
    ta.setAttribute('aria-label', t('What should change?'));
    const foot = mk('div', 'design-composer-foot');
    const cancel = mk('button', 'btn-cancel'); cancel.type = 'button'; cancel.textContent = t('Cancel');
    const send = mk('button', 'btn-create'); send.type = 'button'; send.textContent = t('Send');
    foot.append(cancel, send);
    box.append(quote, ta, foot);
    changes.composer(box, foot, ta); // "Add" beside Send + the Style row (src/lib/design-changes.js)
    cancel.onclick = () => closeComposer();
    send.onclick = () => sendComment();
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeComposer(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); sendComment(); }
    });
    return { box, quote, ta, send };
  }
  function openComposer(pick) {
    if (composer) { composer.pick = pick; composer.quote.textContent = quoteLine(pick); composer.ta.focus(); return; } // a second pick re-points it; the words typed stay
    const parts = composerBody(pick);
    if (phone) {
      const shell = createModalShell({ title: t('Comment on this element'), escapeToClose: true, dialogClass: 'design-composer-sheet', onClose: () => { composer = null; } });
      shell.body.appendChild(parts.box);
      composer = { ...parts, pick, close: shell.close };
    } else {
      const el = mk('div', 'design-composer');
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', t('Comment on this element'));
      el.appendChild(parts.box);
      stage.appendChild(el);
      composer = { ...parts, pick, el };
      placeComposer(el, pick);
    }
    setTimeout(() => composer && composer.ta.focus(), 0);
  }
  function placeComposer(el, pick) {
    // the canvas reports viewport px (it sits at net zoom 1); the composer lives in the stage, at the body's UI zoom
    const z = uiScale() || 1;
    const fr = canvas.frameScreenRect(pick.file);
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const W = Math.min(340, Math.max(220, sw - 24));
    let x = 12, y = 12;
    if (fr) {
      const ex = (fr.x + (pick.rect.x + pick.rect.w) * fr.z) / z + 12, ey = (fr.y + pick.rect.y * fr.z) / z;
      x = ex + W <= sw - 8 ? ex : Math.max(8, (fr.x + pick.rect.x * fr.z) / z - W - 12);
      y = ey;
    }
    el.style.width = W + 'px';
    el.style.left = Math.max(8, Math.min(x, sw - W - 8)) + 'px';
    el.style.top = Math.max(8, Math.min(y, sh - 180)) + 'px';
  }
  let sending = null; // the composer whose comment is on its way
  async function sendComment() {
    if (!composer || sending) return;
    const text = composer.ta.value.trim();
    if (!text) { composer.ta.focus(); sayChip(t('Write what should change first')); return; }
    const c = composer, p = c.pick; // accept-fixes F1: THIS composer sent it — its button is the one that says so, whatever happens meanwhile
    sending = c;
    c.send.textContent = t('Sending…');
    const ctl = new AbortController();
    const slow = setTimeout(() => { c.send.textContent = t('Still sending…'); }, COMMENT_SLOW_MS);
    const late = setTimeout(() => ctl.abort(), COMMENT_WAIT_MS);
    // host + dir ride along (L4 A③b): when no live chat process can take the comment, they name the design whose
    // conversation the STASH entry waits for — without them a killed conversation's comment was refused `no_conversation`
    const r = await fetchJson('/api/design/comment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: winInfo._design.sessionId, host: h, dir: d, quote: { file: p.file, path: p.path, tag: p.tag, text: p.text }, text }), signal: ctl.signal });
    clearTimeout(slow); clearTimeout(late);
    sending = null;
    c.send.textContent = t('Send');
    if (ctl.signal.aborted) { sayChip(t('No answer from the server yet — the comment may still reach the agent: look at the chat before sending it again')); return; } // the words stay
    if (!r || r.error || r.ok === false) { sayChip(commentRefusalText(r)); return; } // the typed words stay in the box
    if (composer !== c) { showToast(commentSentText(r)); return; } // closed or re-opened meanwhile: never close the NEXT composer's words
    closeComposer();
    canvas.setPick(false);
    hideChip();
    showToast(commentSentText(r));
  }

  // ── the artboards list (a bottom sheet on the phone) ──
  function openBoards() {
    const { body, close } = createModalShell({ title: t('Artboards'), escapeToClose: true, dialogClass: 'design-sheet' });
    const pages = canvas.pages();
    if (pages.length > 1) {
      const row = mk('div', 'design-sheet-pages');
      for (const p of pages) {
        const b = mk('button', 'design-sheet-page' + (p.id === canvas.page() ? ' active' : ''));
        b.type = 'button'; b.textContent = p.name || t('Page');
        b.onclick = () => { canvas.setPage(p.id); close(); openBoards(); };
        row.appendChild(b);
      }
      body.appendChild(row);
    }
    const list = mk('div', 'design-sheet-list');
    const whole = mk('button', 'design-sheet-row'); whole.type = 'button'; whole.textContent = t('Whole canvas');
    whole.onclick = () => { canvas.focus(null); canvas.fit(); close(); };
    list.appendChild(whole);
    for (const f of canvas.frames().filter((x) => x.page === canvas.page())) {
      const b = mk('button', 'design-sheet-row' + (f.file === canvas.focused() ? ' active' : ''));
      b.type = 'button';
      const n = mk('span', 'design-sheet-name'); n.textContent = f.title;
      const m = mk('span', 'design-sheet-meta'); m.textContent = `${f.file} · ${f.w}×${f.h}` + (f.refused ? ' · ' + t('refused') : '');
      b.append(n, m);
      b.onclick = () => { canvas.focus(f.file); close(); };
      list.appendChild(b);
    }
    body.appendChild(list);
  }

  // ── print: the focused artboard, in a transient frame of its own ──
  let printFrame = null, printTimer = 0;
  const dropPrint = () => { clearTimeout(printTimer); if (printFrame) { printFrame.remove(); printFrame = null; } };
  signal.addEventListener('abort', dropPrint, { once: true });
  function doPrint() {
    const frames = canvas.frames().filter((f) => f.page === canvas.page());
    const file = canvas.focused() || (frames.length === 1 ? frames[0].file : null);
    const f = file && canvas.frames().find((x) => x.file === file);
    if (!f && frames.length > 1) { present.printAll(); return; } // lane design-present: nothing open on a page of several = all of them
    if (!f) { sayChip(phone ? t('Open an artboard first (Artboards), then Print') : t('Open an artboard first (double-click it), then Print')); return; }
    if (f.html == null) { sayChip(t('This artboard was refused — there is nothing to print')); return; }
    dropPrint();
    const ifr = mk('iframe', 'design-print-frame');
    ifr.setAttribute('sandbox', 'allow-scripts allow-modals'); // print() needs allow-modals; never allow-same-origin
    ifr.setAttribute('aria-hidden', 'true');
    ifr.tabIndex = -1;
    ifr.style.width = f.w + 'px';
    ifr.style.height = f.h + 'px';
    ifr.srcdoc = printSrcdoc(f.html, f);
    document.body.appendChild(ifr);
    printFrame = ifr;
    printTimer = setTimeout(dropPrint, PRINT_FRAME_MS);
  }
  function publish() { openDesignPublishDialog(app, { host: h, dir: d, title: lastRead?.title || '' }); }

  winInfo.onClose = () => {
    clearTimeout(reloadTimer);
    clearTimeout(chipTimer);
    app.ws.offStateChange?.(onState);
    try { offAck?.(); } catch { /* already gone */ }
    try { app.ws.send({ type: 'design-unwatch', host: h, dir: d }); } catch { /* the socket is gone: the hub unwatches on close */ }
    closeComposer();
    app._checkWelcome?.();
  };
  load();
  return winInfo;
}

/** The hub's push (`design-open {sessionId, openSpec}` — the agent's `vibespace-design new|open`): this client opens or
 *  raises the window when it shows that conversation. Wired once on the App (the mediator). */
export function installDesignWindow(app) {
  app.ws?.onGlobal?.((m) => {
    if (!m || m.type !== 'design-open') return;
    const spec = m.openSpec;
    if (!spec || spec.action !== 'openDesign' || typeof spec.dir !== 'string' || !spec.dir) return;
    const sid = String(m.sessionId || spec.sessionId || '');
    const shows = sid && [...(app.sessions?.values?.() || [])].some((s) => s && s.sessionId === sid);
    if (!shows) return;
    openDesign(app, { host: spec.host || '', dir: spec.dir, sessionId: sid });
  });
}

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) ── one window per (host, dir)
registerWindowType({
  type: 'design', label: 'Design',
  icon: UI_ICONS.design,
  action: 'openDesign', replay: (app, spec, { syncId } = {}) => app.openDesign({ host: spec.host || '', dir: spec.dir, sessionId: spec.sessionId || '', syncId }),
});

