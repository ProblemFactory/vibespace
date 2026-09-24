// THE ACTION TRACE'S CLIENT HALF (agent browser P5 — docs/design-agent-browser-v2.md
// §4.5, D7 / D35). Nothing is decided here: the server's recorder writes the
// entries (src/server/browser-trace.js), the PURE model names every rule
// (src/browser-trace.js), and this module DRAWS them on three surfaces:
//
//   · THE TOOL CARD (the transcript): a shell tool call whose command drives
//     the agent browser (`commandDrivesBrowser`) carries a `.chat-browser-trace`
//     holder (chat-renderers); `createCardTraceLoader(view)` fills it — ONE
//     batched fetch for every holder a render produced (the union of their
//     windows, then `assignEntriesToWindows` gives each card exactly its own
//     actions), thumbnails ALWAYS (D7 (c): the after-frame of every action as a
//     strip), the full entry list behind the card's own expander (D35), and a
//     live `browser-trace-appended` re-queues the newest cards. A STOPPED
//     conversation's cards still find their actions: the ask carries the
//     conversation id and the route resolves the key through the bindings
//     store — a review is done after the fact, which is the point.
//   · THE ENTRY DIALOG: before / after side by side, the position DRAWN on the
//     picture (a dot for a point, a rectangle for the element's box — geometry
//     from `overlayGeometry`, in the drawn picture's CSS px, so the overlay is
//     right at any window size), the command, the position line, the result
//     and duration; ← / → step through the list the click came from.
//   · THE TIMELINE (the live view's third pane, `createTraceTimeline`): the
//     session's actions on the pane you are looking at (the profile's scope),
//     seeded by one GET and grown by the stream's `trace` records.
//   · THE AGENT BROWSER WINDOW (window type `browser-profiles`, ⚙ → Tools →
//     Agent browser…, the rail's window-with-a-dot, `app.openBrowserProfiles({focus})`;
//     titled "Browser profiles" before the faces rename): the housekeeping
//     view — states with their why, sizes, trace digests, recordings and the
//     per-profile screencast opt-in (D7), the orphans to adopt or set aside
//     (§8 step 3), the set-aside ledger where the ONE permanent deletion is
//     the user's click (D8), the sweep. Nothing here proposes a deletion.
//
// The frames are drawn through `img.src` (never markup — the image-overlay
// law); every string from the wire goes through textContent; theme vars only,
// SVG icons only. A frame is a SECRET of a logged-in page (§6.4): the dialog
// says how long it is kept, and nothing here caches a byte.
import { t } from './i18n.js';
import { fetchJson, createModalShell, showToast, showConfirmDialog, showInputDialog } from './utils.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerMenuItem } from './contributions.js';
import { UI_ICONS } from './icons.js';
import { frameUrl, bytesText, traceSummary, timelineLabel, positionText, overlayGeometry, traceWindowFor, unionWindow, assignEntriesToWindows, EPHEMERAL_SCOPE, TRACE_RETENTION_MS, TRACE_BYTES_PER_PROFILE } from '../browser-trace.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const STRIP_MAX = 12;
const FLUSH_MS = 150;
const APPEND_DEBOUNCE_MS = 600;

/** takeover C3: an ephemeral browser's state in the device's words. */
export function ephemeralStateText(e) {
  if (!e) return '';
  if (e.state === 'ready') return e.adopted ? t('running (adopted)') : t('running');
  if (e.state === 'starting') return t('starting');
  if (e.state === 'failed') return t('failed');
  if (e.state === 'stopped') return e.stoppedBy === 'idle' ? t('idled out') : t('stopped');
  return t('not started');
}

/** The kind word for a position (the wire's closed kinds → the device's words). */
export function positionKindText(position) {
  const k = position && position.kind;
  if (k === 'point') return t('click at');
  if (k === 'box') return t('element');
  if (k === 'target') return t('target');
  if (k === 'keys') return t('keys');
  if (k === 'scroll') return t('scroll');
  if (k === 'navigation') return t('navigate to');
  return t('input');
}
/** hh:mm:ss for a row. */
export function clockText(at) { const d = new Date(Number(at) || 0); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`; }
/** The one-line status of an entry. */
export function statusText(e) {
  if (!e) return '';
  if (e.ok === false) return t('failed') + (e.error ? `: ${String(e.error)}` : '');
  if (e.ok === true) return t('ok') + (Number.isFinite(e.durationMs) ? ` · ${Math.round(e.durationMs)} ms` : '');
  return t('no result');
}
/** The retention sentence every surface repeats (§6.4: the UI says so). */
export function retentionSentence() {
  return t('Frames of a logged-in page are secrets: kept {days} days or {mb} MB per profile, whichever comes first, then removed by the sweep.', { days: Math.round(TRACE_RETENTION_MS / 86400000), mb: Math.round(TRACE_BYTES_PER_PROFILE / 1048576) });
}

// ── the thumbnail strip ──
/** A strip of after-frame thumbnails (the before-frame when nothing repainted, or when the action failed before anything could). */
export function renderTraceStrip(container, entries, { onOpen = null, max = STRIP_MAX } = {}) {
  container.replaceChildren();
  const list = (entries || []).filter(Boolean);
  const shown = list.slice(Math.max(0, list.length - max));
  for (const e of shown) {
    const b = el('button', 'browser-trace-thumb' + (e.ok === false ? ' failed' : ''));
    b.type = 'button';
    b.dataset.traceId = e.id;
    b.title = `${clockText(e.at)} · ${timelineLabel(e)} · ${statusText(e)}`;
    const which = e.after ? 'after' : (e.before ? 'before' : null);
    if (which) { const img = el('img', 'browser-trace-thumb-img'); img.alt = ''; img.loading = 'lazy'; img.draggable = false; img.src = frameUrl(e.id, which); b.appendChild(img); }
    else b.appendChild(el('span', 'browser-trace-thumb-empty', t('no frame')));
    b.appendChild(el('span', 'browser-trace-thumb-label', String(e.action || '?')));
    b.onclick = (ev) => { ev.stopPropagation(); onOpen && onOpen(e, list); };
    container.appendChild(b);
  }
  if (list.length > shown.length) { const more = el('span', 'browser-trace-thumb-more', t('+{n} earlier', { n: list.length - shown.length })); container.appendChild(more); }
  return shown.length;
}

// ── the entry dialog: before / after with the overlay ──
/** Draw the position on a picture: after the image lands, the dot / rect in the drawn picture's px. */
function drawOverlay(pane, img, entry, which) {
  const frame = entry && entry[which];
  const old = pane.querySelector('.browser-trace-overlay'); if (old) old.remove();
  if (!frame || !entry.position) return;
  const place = () => {
    const prev = pane.querySelector('.browser-trace-overlay'); if (prev) prev.remove();
    // the img is `width:100%; height:auto` inside the pane — the picture IS the box, offset by the img's position in the pane
    const g = overlayGeometry({ position: entry.position, frame, drawn: { left: img.offsetLeft, top: img.offsetTop, width: img.clientWidth, height: img.clientHeight } });
    if (!g) return;
    const o = el('div', 'browser-trace-overlay ' + g.shape);
    o.style.left = `${g.left}px`; o.style.top = `${g.top}px`;
    if (g.shape === 'rect') { o.style.width = `${g.width}px`; o.style.height = `${g.height}px`; }
    pane.appendChild(o);
  };
  if (img.complete && img.naturalWidth) place(); else img.addEventListener('load', place, { once: true });
}
/** Open ONE entry; `list` = the entries it came from (← / → step through them). */
export function openTraceEntryDialog(app, entry, list = null) {
  const entries = Array.isArray(list) && list.length ? list : [entry];
  let index = Math.max(0, entries.findIndex((e) => e && e.id === entry.id));
  const shell = createModalShell({ id: 'browser-trace-entry-dialog', title: t('Browser action'), dialogClass: 'browser-trace-dialog', minWidth: '520px', escapeToClose: true });
  const { body, overlay, close } = shell;
  const head = el('div', 'browser-trace-dialog-head');
  const prev = el('button', 'file-tool-btn', '←'); prev.title = t('Previous action');
  const next = el('button', 'file-tool-btn', '→'); next.title = t('Next action');
  const pos = el('span', 'browser-trace-dialog-pos');
  const cmd = el('code', 'browser-trace-dialog-cmd');
  head.append(prev, pos, next, cmd);
  const pics = el('div', 'browser-trace-dialog-pics');
  const mk = (label) => { const w = el('div', 'browser-trace-dialog-pane'); w.appendChild(el('div', 'browser-trace-dialog-cap', label)); const box = el('div', 'browser-trace-dialog-box'); const img = el('img', 'browser-trace-dialog-img'); img.alt = ''; img.draggable = false; box.appendChild(img); w.appendChild(box); return { w, box, img, cap: w.firstChild }; };
  const before = mk(t('Before')), after = mk(t('After'));
  pics.append(before.w, after.w);
  const meta = el('div', 'browser-trace-dialog-meta');
  const note = el('div', 'browser-trace-dialog-note chat-status-dim', retentionSentence());
  body.append(head, pics, meta, note);
  function show(i) {
    index = Math.max(0, Math.min(entries.length - 1, i));
    const e = entries[index];
    pos.textContent = t('{i} of {n}', { i: index + 1, n: entries.length }) + ' · ' + clockText(e.at);
    cmd.textContent = String(e.text || e.action || '');
    prev.disabled = index === 0; next.disabled = index >= entries.length - 1;
    for (const [pane, which] of [[before, 'before'], [after, 'after']]) {
      const f = e[which];
      pane.box.classList.toggle('empty', !f);
      pane.img.style.display = f ? '' : 'none';
      const missing = pane.box.querySelector('.browser-trace-dialog-missing'); if (missing) missing.remove();
      if (f) { pane.img.src = frameUrl(e.id, which); drawOverlay(pane.box, pane.img, e, which); }
      else { pane.box.appendChild(el('div', 'browser-trace-dialog-missing', which === 'after' ? t('no after frame (the stream ended first)') : t('no before frame (the first action after the stream opened)'))); }
    }
    after.cap.textContent = e.afterSame ? t('After (nothing repainted)') : t('After');
    meta.replaceChildren();
    const row = (k, v) => { if (!v) return; const r = el('div', 'browser-trace-dialog-row'); r.appendChild(el('span', 'browser-trace-dialog-k', k)); r.appendChild(el('span', 'browser-trace-dialog-v', v)); meta.appendChild(r); };
    row(t('Action'), `${String(e.action || '')} · ${positionKindText(e.position)} ${positionText(e.position)}`.trim());
    row(t('Result'), statusText(e));
    if (e.url) row(t('Page'), String(e.url));
    if (e.profileId) row(t('Profile'), (app && app._browserProfiles && (app._browserProfiles.profiles || []).find((p) => p.id === e.profileId) || {}).label || e.profileId);
    else row(t('Profile'), t('ephemeral (no profile)'));
  }
  prev.onclick = () => show(index - 1);
  next.onclick = () => show(index + 1);
  overlay.addEventListener('keydown', (ev) => { if (ev.key === 'ArrowLeft') { ev.preventDefault(); show(index - 1); } else if (ev.key === 'ArrowRight') { ev.preventDefault(); show(index + 1); } });
  show(index);
  return { ...shell, show, close, index: () => index };
}

// ── the tool card loader ──
/**
 * One per ChatView. `observe(el)` = a rendered message element (every path
 * that makes one calls it through `_applyElementMarks`, so a rebuilt history,
 * a live card and a paged-in slab all get their strip); `onAppended(msg)` =
 * the `browser-trace-appended` broadcast; `dispose()`.
 */
export function createCardTraceLoader(view) {
  const st = { queued: new Set(), timer: null, appendTimer: null, key: null, disposed: false, loads: 0 };
  const holders = () => [...(view._messageList?.querySelectorAll?.('.chat-browser-trace') || [])];
  /** The ids the ask carries: the live webui id, and the conversation id for a stopped one. */
  function askParams() {
    const q = new URLSearchParams();
    const sid = String(view.sessionId || '');
    if (sid && !sid.startsWith('view-')) q.set('sessionId', sid);
    let ids = null; try { ids = view._getSessionIds ? view._getSessionIds() : null; } catch { ids = null; }
    const conv = ids && (ids.claudeId || ids.backendSessionId || ids.claudeSessionId);
    if (conv) q.set('conversation', String(conv));
    if (st.key) q.set('browserKey', st.key);
    return q;
  }
  /** The card's window: its own ts back 2 s, forward to the next message's ts (+2 s) or now. */
  function windowOf(holder) {
    const ts = Number(holder.dataset.traceTs) || 0;
    let nextTs = null;
    const msgEl = holder.closest('.chat-msg');
    let n = msgEl ? msgEl.nextElementSibling : null;
    while (n) { const v = Number(n.dataset && n.dataset.ts); if (v > ts) { nextTs = v; break; } n = n.nextElementSibling; }
    return { id: holder.dataset.traceKey, ts, ...traceWindowFor({ ts, nextTs, now: Date.now() }) };
  }
  function observe(root) {
    if (st.disposed || !root || !root.querySelectorAll) return;
    const found = root.classList && root.classList.contains('chat-browser-trace') ? [root] : [...root.querySelectorAll('.chat-browser-trace')];
    for (const h of found) {
      if (h.dataset.traceState) continue;
      h.dataset.traceState = 'queued';
      h.dataset.traceKey = h.dataset.traceKey || ('c' + (++st.loads) + '-' + Math.random().toString(36).slice(2, 7));
      wireHolder(h);
      st.queued.add(h);
    }
    if (st.queued.size && !st.timer) st.timer = setTimeout(flush, FLUSH_MS);
  }
  function wireHolder(h) {
    const btn = h.querySelector('.chat-browser-trace-btn');
    if (btn && !btn._traceWired) { btn._traceWired = true; btn.addEventListener('click', (ev) => { ev.stopPropagation(); toggleList(h); }); }
  }
  async function flush() {
    st.timer = null;
    if (st.disposed) return;
    const hs = [...st.queued].filter((h) => h.isConnected); st.queued.clear();
    if (!hs.length) return;
    const windows = hs.map((h) => ({ h, w: windowOf(h) }));
    const u = unionWindow(windows.map((x) => x.w));
    if (!u) return;
    const q = askParams();
    if (![...q.keys()].length) { for (const { h } of windows) render(h, [], { off: false, unknown: true }); return; }
    q.set('from', String(u.from)); q.set('to', String(u.to)); q.set('limit', '1000');
    const r = await fetchJson(`/api/browser/actions?${q}`);
    if (st.disposed) return;
    if (!r || r.error) { for (const { h } of windows) render(h, [], { error: (r && r.error) || t('server unreachable') }); return; }
    if (r.browserKey && !st.key) st.key = String(r.browserKey);
    // no key to match by (a browser the keeper never started — an agent's own agent-browser profile, an
    // unregistered directory): the honest word is NOT "no actions", it is "not traced" (2.369.145, owner
    // "为啥都是没有记录到操作" — every card on an instance whose agents drive their own profiles read that)
    const untraced = !r.browserKey && !r.sessionId;
    const byCard = assignEntriesToWindows(windows.map((x) => x.w), r.entries || []);
    for (const { h, w } of windows) render(h, byCard[w.id] || [], { off: r.traceOn === false, untraced });
  }
  function render(h, entries, { off = false, error = null, unknown = false, untraced = false } = {}) {
    h.dataset.traceState = error ? 'error' : 'loaded';
    h.dataset.traceUntraced = untraced && !entries.length ? '1' : '';
    h._traceEntries = entries;
    const sum = h.querySelector('.chat-browser-trace-sum');
    const strip = h.querySelector('.chat-browser-trace-strip');
    const s = traceSummary(entries);
    if (sum) {
      if (error) sum.textContent = t('trace unavailable: {why}', { why: String(error) });
      else if (s.n) sum.textContent = t('{n} action(s)', { n: s.n }) + (s.failed ? ' · ' + t('{n} failed', { n: s.failed }) : '');
      else if (off) sum.textContent = t('action trace is off (Settings → Agent browser)');
      else if (unknown) sum.textContent = t('no conversation id to look up');
      else if (untraced) sum.textContent = t('not traced — this browser was not started through VibeSpace (Agent browser)');
      else sum.textContent = h.closest('.chat-msg')?.querySelector('.chat-tool-output-pending') ? t('waiting for actions…') : t('no recorded actions in this call');
      sum.classList.toggle('empty', !s.n);
    }
    if (strip) { const n = renderTraceStrip(strip, entries, { onOpen: (e, list) => openTraceEntryDialog(view.app, e, list) }); strip.style.display = n ? '' : 'none'; }
    if (h.dataset.traceOpen === '1') renderList(h);
  }
  function renderList(h) {
    const list = h.querySelector('.chat-browser-trace-list'); if (!list) return;
    list.replaceChildren();
    const entries = h._traceEntries || [];
    if (!entries.length) { list.appendChild(el('div', 'chat-status-dim', h.dataset.traceUntraced === '1' ? t('Actions are recorded only for browsers VibeSpace started (profiles) — this call drove a browser of its own.') : t('No actions were recorded in this call.'))); return; }
    for (const e of entries) {
      const row = el('div', 'browser-trace-row' + (e.ok === false ? ' failed' : ''));
      const top = el('div', 'browser-trace-row-top');
      top.appendChild(el('span', 'browser-trace-row-time', clockText(e.at)));
      top.appendChild(el('code', 'browser-trace-row-cmd', String(e.text || e.action || '')));
      top.appendChild(el('span', 'browser-trace-row-status', statusText(e)));
      const pos = el('div', 'browser-trace-row-pos', `${positionKindText(e.position)} ${positionText(e.position)}`.trim());
      const pics = el('div', 'browser-trace-row-pics');
      for (const which of ['before', 'after']) {
        const b = el('button', 'browser-trace-thumb'); b.type = 'button'; b.title = which === 'before' ? t('Before') : t('After');
        if (e[which]) { const img = el('img', 'browser-trace-thumb-img'); img.alt = ''; img.loading = 'lazy'; img.draggable = false; img.src = frameUrl(e.id, which); b.appendChild(img); }
        else b.appendChild(el('span', 'browser-trace-thumb-empty', t('no frame')));
        b.appendChild(el('span', 'browser-trace-thumb-label', which === 'before' ? t('before') : (e.afterSame ? t('after (same)') : t('after'))));
        b.onclick = (ev) => { ev.stopPropagation(); openTraceEntryDialog(view.app, e, entries); };
        pics.appendChild(b);
      }
      row.append(top, pos, pics);
      list.appendChild(row);
    }
    list.appendChild(el('div', 'browser-trace-row-note chat-status-dim', retentionSentence()));
  }
  function toggleList(h) {
    const list = h.querySelector('.chat-browser-trace-list'); if (!list) return;
    const open = h.dataset.traceOpen === '1';
    h.dataset.traceOpen = open ? '0' : '1';
    list.style.display = open ? 'none' : '';
    const btn = h.querySelector('.chat-browser-trace-btn'); if (btn) btn.classList.toggle('active', !open);
    if (!open) renderList(h);
  }
  /** A new entry for this conversation: the newest cards whose window may hold it are asked again (debounced). */
  function onAppended(msg) {
    if (st.disposed || !msg || !msg.entry) return;
    const mine = (msg.sessionId && msg.sessionId === view.sessionId) || (st.key && msg.browserKey === st.key);
    if (!mine) return;
    const at = Number(msg.entry.at) || Date.now();
    for (const h of holders()) { const w = windowOf(h); if (at >= w.from - 2000 && at <= w.to + 2000) { delete h.dataset.traceState; } }
    if (st.appendTimer) clearTimeout(st.appendTimer);
    st.appendTimer = setTimeout(() => { st.appendTimer = null; observe(view._messageList); }, APPEND_DEBOUNCE_MS);
  }
  function dispose() { st.disposed = true; if (st.timer) clearTimeout(st.timer); if (st.appendTimer) clearTimeout(st.appendTimer); st.queued.clear(); }
  return { observe, onAppended, dispose, flush, state: () => ({ queued: st.queued.size, key: st.key, loads: st.loads }) };
}

// ── the live view's timeline pane ──
/**
 * The session's actions on ONE pane (the profile's scope, or the ephemeral
 * one): `load({profileId, ephemeral})` seeds from GET, `push(entry)` grows it
 * from the stream's `trace` record (deduped by id), `clear()` on a pane switch.
 */
export function createTraceTimeline(app, { sessionId } = {}) {
  const root = el('div', 'browser-live-trace');
  const head = el('div', 'browser-live-trace-head');
  const count = el('span', 'browser-live-trace-count', '');
  head.appendChild(count);
  const listEl = el('div', 'browser-live-trace-list');
  const empty = el('div', 'browser-live-trace-empty chat-status-dim', t('No actions yet — every agent action lands here with its before / after frames.'));
  root.append(head, listEl, empty);
  const st = { entries: [], ids: new Set(), scope: undefined, off: false, loading: false, error: null };
  function scopeQuery() { if (st.scope === undefined) return ''; return st.scope === null ? EPHEMERAL_SCOPE : String(st.scope); }
  function renderHead() {
    if (st.error) count.textContent = t('trace unavailable: {why}', { why: String(st.error) });
    else if (st.off) count.textContent = t('action trace is off (Settings → Agent browser)');
    else count.textContent = t('{n} action(s)', { n: st.entries.length }) + ' · ' + t('newest last');
    empty.style.display = st.entries.length || st.off || st.error ? 'none' : '';
  }
  function rowFor(e) {
    const row = el('button', 'browser-live-trace-row' + (e.ok === false ? ' failed' : '')); row.type = 'button'; row.dataset.traceId = e.id;
    const which = e.after ? 'after' : (e.before ? 'before' : null);
    const thumb = el('span', 'browser-live-trace-thumb');
    if (which) { const img = el('img', 'browser-trace-thumb-img'); img.alt = ''; img.loading = 'lazy'; img.draggable = false; img.src = frameUrl(e.id, which); thumb.appendChild(img); }
    const text = el('span', 'browser-live-trace-text');
    text.appendChild(el('span', 'browser-live-trace-time', clockText(e.at)));
    text.appendChild(el('span', 'browser-live-trace-label', timelineLabel(e)));
    text.appendChild(el('span', 'browser-live-trace-status', statusText(e)));
    row.append(thumb, text);
    row.title = String(e.text || '');
    row.onclick = () => openTraceEntryDialog(app, e, st.entries);
    return row;
  }
  function push(entry) {
    if (!entry || !entry.id || st.ids.has(entry.id)) return false;
    st.ids.add(entry.id); st.entries.push(entry);
    listEl.appendChild(rowFor(entry));
    renderHead();
    listEl.scrollTop = listEl.scrollHeight;
    return true;
  }
  function clear() { st.entries = []; st.ids = new Set(); listEl.replaceChildren(); st.error = null; renderHead(); }
  /** Seed (or re-seed after a reconnect — same scope keeps what it has, `push` dedups; a pane switch clears first). */
  async function load({ profileId = undefined } = {}) {
    if (st.scope !== profileId || st.error) { st.scope = profileId; clear(); }
    if (!sessionId) return;
    st.loading = true;
    const q = new URLSearchParams({ sessionId, limit: '300' });
    const sc = scopeQuery(); if (sc) q.set('profile', sc);
    const r = await fetchJson(`/api/browser/actions?${q}`);
    st.loading = false;
    if (!r || r.error) { st.error = (r && r.error) || t('server unreachable'); renderHead(); return; }
    st.off = r.traceOn === false;
    for (const e of r.entries || []) push(e);
    renderHead();
  }
  renderHead();
  return { el: root, load, push, clear, count: () => st.entries.length, state: () => ({ n: st.entries.length, off: st.off, error: st.error, scope: st.scope }) };
}

// ── THE BROWSER PROFILES PANEL (§6.4 / §8 step 3 / D7 / D8) ──
// The panel over `GET /api/browser/housekeeping`: every profile with its
// STATE and WHY, its size (measured in a child, cached), its trace digest and
// its recordings, the per-profile screencast opt-in (D7), the orphans under
// ~/.agent-browser for the user to ADOPT or set aside (§8 step 3), the
// set-aside ledger where THE one permanent deletion is the user's click (D8),
// the sweep. Nothing here proposes a deletion; a cookie jar is somebody's
// login. Re-rendered from the three broadcasts while open; the ws handler is
// removed on close.
const PANEL_TYPE = 'browser-profiles';
const PANEL_REFRESH_DEBOUNCE_MS = 1200;
/** The state words — one per entry of the PURE closed set (pinned by the suite). */
export function stateText(state) {
  switch (state) {
    case 'not-ours': return t('not ours');
    case 'in-use': return t('in use');
    case 'live': return t('running');
    case 'recent': return t('recent');
    case 'stale': return t('stale');
    case 'kept': return t('kept');
    default: return String(state || '');
  }
}
/** `3 d ago` / `5 h ago` / `12 min ago` / `just now`; '' for unknown. */
export function agoText(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) return '';
  const s = Math.max(0, Math.round(Number(ms) / 1000));
  if (s < 60) return t('just now');
  if (s < 5400) return t('{n} min ago', { n: Math.round(s / 60) });
  if (s < 172800) return t('{n} h ago', { n: Math.round(s / 3600) });
  return t('{n} d ago', { n: Math.round(s / 86400) });
}
/** A user-action call: fetchJson never throws, so `{error}` IS the failure and must reach the user. */
async function act(url, init, what) {
  const r = await fetchJson(url, init);
  if (!r || r.error) { showToast(t('{what} — {reason}', { what, reason: (r && r.error) || t('server unreachable') }), { type: 'error', duration: 9000 }); return null; }
  return r;
}
const jsonInit = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

export function openBrowserProfilesWindow(app, { syncId, focus = null } = {}) {
  for (const [, w] of app.wm.windows) if (w.type === PANEL_TYPE) { app.wm.focusWindow(w.id); if (focus && w._browserProfiles) w._browserProfiles.focusRow(focus); return w; }
  app._hideWelcome?.();
  const winInfo = app.wm.createWindow({ title: t('Agent browser'), type: PANEL_TYPE, syncId, openSpec: { action: 'openBrowserProfiles' }, width: 860, height: 600 });
  const st = { view: null, error: null, busy: false, closed: false, timer: null, focus };
  const root = el('div', 'bprof');
  const bar = el('div', 'bprof-bar');
  const summary = el('span', 'bprof-summary', t('Loading…'));
  const spacer = el('span'); spacer.style.flex = '1';
  const sweepBtn = el('button', 'file-tool-btn bprof-btn', t('Sweep now')); sweepBtn.title = t('Apply the retention plan now: traces and recordings older than the limit, or over the per-profile size, are removed — profiles are never touched');
  const refreshBtn = el('button', 'file-tool-btn bprof-btn', '⟳'); refreshBtn.title = t('Refresh');
  bar.append(summary, spacer, sweepBtn, refreshBtn);
  const hint = el('div', 'bprof-hint chat-status-dim');
  const body = el('div', 'bprof-body');
  root.append(bar, hint, body);
  winInfo.content.appendChild(root);

  const section = (title, sub) => { const s = el('div', 'bprof-section'); const h = el('div', 'bprof-section-head'); h.appendChild(el('span', 'bprof-section-title', title)); if (sub) h.appendChild(el('span', 'bprof-section-sub chat-status-dim', sub)); s.appendChild(h); body.appendChild(s); return s; };
  const cell = (row, cls, text, title) => { const c = el('span', 'bprof-cell ' + cls, text); if (title) c.title = title; row.appendChild(c); return c; };

  function renderHint(v) {
    const days = Math.round((v?.limits?.retentionMs || TRACE_RETENTION_MS) / 86400000), mb = Math.round((v?.limits?.bytesPerProfile || TRACE_BYTES_PER_PROFILE) / 1048576);
    hint.textContent = t('Traces and recordings are kept {days} days or {mb} MB per profile, whichever comes first; frames of a logged-in page are secrets. Nothing here deletes a profile by itself: setting one aside moves its directory beside itself, and only your click on a set-aside row deletes it.', { days, mb }) + (v && v.traceOn === false ? ' ' + t('The action trace is OFF (Settings → Agent browser → Action trace).') : '');
  }
  function renderSummary(v) {
    const rows = v?.profiles || [];
    const bytes = rows.reduce((s, r) => s + (Number(r.bytes) || 0), 0);
    const traces = rows.reduce((s, r) => s + (r.trace ? r.trace.n : 0), 0) + (v?.ephemeral?.trace?.n || 0);
    const recs = rows.reduce((s, r) => s + (r.recordings ? r.recordings.length : 0), 0);
    summary.textContent = t('{n} profile(s) · {size} on disk · {traces} traced action(s) · {recs} recording(s)', { n: rows.length, size: bytesText(bytes), traces, recs }) + (v?.orphans?.length ? ' · ' + t('{n} unregistered director(ies)', { n: v.orphans.length }) : '');
  }
  function profileRow(r, v) {
    const row = el('div', 'bprof-row bprof-profile'); row.dataset.profileId = r.id;
    const ident = el('div', 'bprof-ident');
    ident.appendChild(el('span', 'bprof-label', String(r.label || r.id)));
    if (r.legacy) ident.appendChild(el('span', 'bprof-chip', t('legacy')));
    // P6 (§6.2): an instance-shared profile is MEDIATED — every session on it sees and drives only its own tabs
    if (r.mediated) { const c = el('span', 'bprof-chip', t('shared')); c.title = t('Shared with every session on this instance: each one sees and drives only its own tabs through a mediated CDP endpoint; while you drive, its input and navigation are refused.'); ident.appendChild(c); }
    if (r.host) ident.appendChild(el('span', 'bprof-chip', String(r.host)));
    const chip = app.browserChipFor ? app.browserChipFor(r.id) : null;
    ident.appendChild(el('span', 'browser-chip', chip || String(r.provider || '')));
    row.appendChild(ident);
    const state = cell(row, 'bprof-state state-' + String(r.state || '').replace(/[^a-z-]/g, ''), stateText(r.state), String(r.why || ''));
    state.appendChild(el('span', 'bprof-why', String(r.why || '')));
    cell(row, 'bprof-size', r.bytes === null || r.bytes === undefined ? t('not measured') : bytesText(r.bytes), r.dir ? String(r.dir) : '');
    const tr = r.trace || { n: 0, bytes: 0 };
    cell(row, 'bprof-trace', tr.n ? t('{n} action(s)', { n: tr.n }) + ' · ' + bytesText(tr.bytes) : t('no actions'), tr.last ? t('last {ago}', { ago: agoText(Date.now() - tr.last) }) : '');
    const recs = Array.isArray(r.recordings) ? r.recordings : [];
    const recCell = cell(row, 'bprof-recs', recs.length ? t('{n} recording(s)', { n: recs.length }) + ' · ' + bytesText(r.recordingBytes || 0) : t('no recordings'));
    if (r.recording) { const live = el('span', 'bprof-rec-live', t('recording')); live.title = String(r.recording.file || ''); recCell.appendChild(live); }
    if (r.recordingRefused) { const ref = el('span', 'bprof-rec-refused', t('refused: {why}', { why: String(r.recordingRefused.error || r.recordingRefused.code || '') })); recCell.appendChild(ref); }
    // D7: the per-profile screencast opt-in — a checkbox the keeper's PATCH answers; not ours / remote ⇒ disabled with the reason
    const recWrap = el('label', 'bprof-record');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!r.record;
    const ours = r.state !== 'not-ours' && !r.host;
    cb.disabled = !ours || st.busy;
    recWrap.title = ours ? t('Record this profile\'s screen (30 fps WebM, needs agent-browser ≥ {floor}) whenever its browser is live — a video of a logged-in profile is a secret with a storage bill', { floor: String(v?.limits?.recordingFloor || '0.37.0') }) : String(r.why || '');
    cb.onchange = async () => { st.busy = true; cb.disabled = true; const ok = await act(`/api/browser/profiles/${encodeURIComponent(r.id)}`, jsonInit('PATCH', { record: cb.checked }), t('Could not change recording')); st.busy = false; if (!ok) cb.checked = !cb.checked; load(); };
    recWrap.append(cb, document.createTextNode(' ' + t('record')));
    row.appendChild(recWrap);
    const forget = el('button', 'file-tool-btn bprof-btn bprof-forget', t('Set aside'));
    forget.disabled = !r.canForget || st.busy;
    forget.title = r.canForget ? t('Move this profile\'s directory beside itself and remove the record — nothing is deleted until you click Delete permanently below') : String(r.why || '');
    forget.onclick = async () => {
      const yes = await showConfirmDialog({ title: t('Set aside {label}?', { label: String(r.label || r.id) }), message: t('The directory is moved beside itself (…forgotten-<time>) and listed under "Set aside" below; the profile disappears from every picker. Nothing is deleted until you click Delete permanently.'), confirmText: t('Set aside') });
      if (!yes) return;
      const res = await act(`/api/browser/profiles/${encodeURIComponent(r.id)}/forget`, jsonInit('POST'), t('Could not set aside'));
      if (res) showToast(t('Set aside: {from} → {to}', { from: String(res.from || ''), to: String(res.to || '') }), { duration: 7000 });
      load();
    };
    row.appendChild(forget);
    return row;
  }
  /** takeover C3 (design-browser-takeover §5.3): one managed EPHEMERAL browser —
   *  the record, whose conversation, its state, and the user's Stop (the
   *  profile stop route; the conversation's next command starts it again). */
  function ephemeralRow(e) {
    const row = el('div', 'bprof-row bprof-ephemeral-browser');
    row.dataset.profileId = String(e.profileId || '');
    const ident = el('div', 'bprof-ident'); ident.appendChild(el('span', 'bprof-label', String(e.label || e.profileId || ''))); if (e.child) ident.appendChild(el('span', 'bprof-chip', t('sub-agent'))); ident.title = String(e.profileId || ''); row.appendChild(ident);
    cell(row, 'bprof-conv bprof-mono', String(e.browserKey || ''), e.sessionId ? t('session {id}', { id: String(e.sessionId) }) : '');
    const st = cell(row, 'bprof-state state-' + (e.live ? 'live' : 'kept'), ephemeralStateText(e));
    if (e.lastError) st.title = String(e.lastError);
    cell(row, 'bprof-age', e.startedAt ? t('started {ago}', { ago: agoText(Date.now() - Number(e.startedAt)) }) : '');
    const stop = el('button', 'file-tool-btn bprof-btn bprof-stop', t('Stop'));
    stop.disabled = !e.live;
    stop.title = e.live ? t('Stop this browser now — the conversation\'s next command starts it again (a login in it is gone)') : t('Not running');
    stop.onclick = async () => { stop.disabled = true; const r = await act(`/api/browser/profiles/${encodeURIComponent(String(e.profileId || ''))}/stop`, jsonInit('POST'), t('Could not stop the browser')); if (r) showToast(t('Stopped {label}', { label: String(e.label || '') }), { duration: 4000 }); load(); };
    row.appendChild(stop);
    return row;
  }
  function orphanRow(o) {
    const row = el('div', 'bprof-row bprof-orphan');
    const ident = el('div', 'bprof-ident'); ident.appendChild(el('span', 'bprof-label bprof-mono', String(o.name || ''))); ident.title = String(o.dir || ''); row.appendChild(ident);
    cell(row, 'bprof-size', o.bytes === null || o.bytes === undefined ? t('not measured') : bytesText(o.bytes));
    cell(row, 'bprof-age', o.ageMs === null || o.ageMs === undefined ? '' : t('last used {ago}', { ago: agoText(o.ageMs) }));
    const adopt = el('button', 'file-tool-btn bprof-btn', t('Adopt…')); adopt.title = t('Give this directory a name and keep it as a profile, in place');
    adopt.onclick = async () => {
      const label = await showInputDialog({ title: t('Adopt {name}', { name: String(o.name || '') }), label: t('Profile label'), placeholder: t('e.g. Shopping (old)'), confirmText: t('Adopt') });
      if (!label || !String(label).trim()) return;
      const res = await act('/api/browser/orphans/adopt', jsonInit('POST', { dir: o.dir, label: String(label).trim() }), t('Could not adopt'));
      if (res) showToast(t('Adopted as {label}', { label: String(res.profile?.label || label) }), { duration: 5000 });
      load();
    };
    const aside = el('button', 'file-tool-btn bprof-btn bprof-forget', t('Set aside')); aside.title = t('Move it beside itself and list it below — nothing is deleted until you click Delete permanently');
    aside.onclick = async () => {
      const yes = await showConfirmDialog({ title: t('Set aside {name}?', { name: String(o.name || '') }), message: t('The directory is moved beside itself (…forgotten-<time>) and listed under "Set aside" below. Nothing is deleted until you click Delete permanently.'), confirmText: t('Set aside') });
      if (!yes) return;
      const res = await act('/api/browser/orphans/forget', jsonInit('POST', { dir: o.dir }), t('Could not set aside'));
      if (res) showToast(t('Set aside: {from} → {to}', { from: String(res.from || ''), to: String(res.to || '') }), { duration: 7000 });
      load();
    };
    row.append(adopt, aside);
    return row;
  }
  function forgottenRow(f) {
    const row = el('div', 'bprof-row bprof-forgotten' + (f.deletedAt ? ' deleted' : ''));
    const ident = el('div', 'bprof-ident'); ident.appendChild(el('span', 'bprof-label', String(f.label || f.name || f.from || ''))); ident.appendChild(el('span', 'bprof-mono chat-status-dim', String(f.dir || f.to || ''))); ident.title = `${String(f.from || '')} → ${String(f.dir || f.to || '')}`; row.appendChild(ident);
    cell(row, 'bprof-size', f.bytes === null || f.bytes === undefined ? '' : bytesText(f.bytes));
    cell(row, 'bprof-age', f.at ? t('set aside {ago}', { ago: agoText(Date.now() - Number(f.at)) }) : '');
    if (f.deletedAt) { cell(row, 'bprof-deleted', t('deleted {ago}', { ago: agoText(Date.now() - Number(f.deletedAt)) })); return row; }
    const del = el('button', 'file-tool-btn bprof-btn bprof-delete', t('Delete permanently')); del.title = t('The ONE permanent deletion — the directory and its cookies are gone for good');
    del.onclick = async () => {
      const yes = await showConfirmDialog({ title: t('Delete {name} permanently?', { name: String(f.label || f.name || f.from || '') }), message: t('This removes the set-aside directory for good — its cookies and logins with it. There is no undo.'), confirmText: t('Delete permanently'), danger: true });
      if (!yes) return;
      const res = await act(`/api/browser/forgotten/${encodeURIComponent(f.id)}/delete`, jsonInit('POST'), t('Could not delete'));
      if (res) showToast(t('Deleted permanently'), { duration: 4000 });
      load();
    };
    row.appendChild(del);
    return row;
  }
  function render() {
    body.replaceChildren();
    if (st.error) { body.appendChild(el('div', 'bprof-error', t('Browser profiles unavailable: {why}', { why: String(st.error) }))); return; }
    const v = st.view; if (!v) return;
    renderHint(v); renderSummary(v);
    const prof = section(t('Profiles'), t('state · size on disk · traced actions · recordings · the per-profile screencast opt-in'));
    const rows = v.profiles || [];
    if (!rows.length) prof.appendChild(el('div', 'bprof-empty chat-status-dim', t('No profiles yet — an agent gets one with `vibespace-browser new <label>`, or pin one from a session card.')));
    for (const r of rows) prof.appendChild(profileRow(r, v));
    const eph = el('div', 'bprof-row bprof-ephemeral');
    const ei = el('div', 'bprof-ident'); ei.appendChild(el('span', 'bprof-label', t('Browsers without a profile'))); ei.appendChild(el('span', 'bprof-chip', t('ephemeral'))); eph.appendChild(ei);
    cell(eph, 'bprof-state', ''); cell(eph, 'bprof-size', '');
    const et = v.ephemeral?.trace || { n: 0, bytes: 0 };
    cell(eph, 'bprof-trace', et.n ? t('{n} action(s)', { n: et.n }) + ' · ' + bytesText(et.bytes) : t('no actions'));
    prof.appendChild(eph);
    // takeover C3: every conversation's managed ephemeral browser — watched like a profile, gone with its conversation
    const ephs = section(t('Ephemeral browsers'), t('one per conversation that browses without a profile — started by its first command, stopped after its idle timeout, removed with the conversation'));
    const erows = Array.isArray(v.ephemeralBrowsers) ? v.ephemeralBrowsers : [];
    if (!erows.length) ephs.appendChild(el('div', 'bprof-empty chat-status-dim', t('None — no conversation has browsed without a profile since its start.')));
    for (const e of erows) ephs.appendChild(ephemeralRow(e));
    const orph = section(t('Unregistered directories'), v.orphansBase ? t('under {base} — a Chromium profile no record names; adopt the ones worth keeping, set the rest aside', { base: String(v.orphansBase) }) : '');
    if (v.orphansWhy) orph.appendChild(el('div', 'bprof-empty chat-status-dim', String(v.orphansWhy)));
    else if (!(v.orphans || []).length) orph.appendChild(el('div', 'bprof-empty chat-status-dim', t('None — every profile directory here is named by a record.')));
    for (const o of v.orphans || []) orph.appendChild(orphanRow(o));
    const fg = section(t('Set aside'), t('moved beside themselves, never deleted by a sweep — only by your click'));
    if (!(v.forgotten || []).length) fg.appendChild(el('div', 'bprof-empty chat-status-dim', t('Nothing set aside.')));
    for (const f of v.forgotten || []) fg.appendChild(forgottenRow(f));
    const sw = section(t('Sweep'), '');
    const s = v.sweep;
    sw.appendChild(el('div', 'bprof-sweep chat-status-dim', s ? t('Last sweep {ago}: removed {n} trace entr(ies) ({bytes}) and {r} recording(s) ({rbytes}).', { ago: agoText(Date.now() - Number(s.at || 0)), n: s.removed || 0, bytes: bytesText(s.bytesRemoved || 0), r: s.recordingsRemoved || 0, rbytes: bytesText(s.recordingBytesRemoved || 0) }) : t('No sweep has run yet (it runs at boot and every hour).')));
    if (st.focus) focusRow(st.focus);
  }
  function focusRow(profileId) {
    st.focus = null;
    const row = body.querySelector(`.bprof-profile[data-profile-id="${String(profileId).replace(/[^a-z0-9-]/gi, '')}"]`);
    if (row) { row.classList.add('focus'); row.scrollIntoView({ block: 'center' }); setTimeout(() => row.classList.remove('focus'), 2500); }
  }
  async function load() {
    if (st.closed) return;
    const r = await fetchJson('/api/browser/housekeeping');
    if (st.closed) return;
    if (!r || r.error) { st.error = (r && r.error) || t('server unreachable'); render(); return; }
    st.error = null; st.view = r; render();
  }
  const scheduleLoad = () => { if (st.timer) clearTimeout(st.timer); st.timer = setTimeout(() => { st.timer = null; load(); }, PANEL_REFRESH_DEBOUNCE_MS); };
  const onGlobal = (m) => { if (st.closed || !m) return; if (m.type === 'browser-housekeeping-updated' || m.type === 'browser-profiles-updated' || m.type === 'browser-trace-appended') scheduleLoad(); };
  app.ws?.onGlobal?.(onGlobal);
  sweepBtn.onclick = async () => { sweepBtn.disabled = true; const r = await act('/api/browser/housekeeping/sweep', jsonInit('POST'), t('Sweep failed')); sweepBtn.disabled = false; if (r) showToast(t('Sweep: removed {n} trace entr(ies) ({bytes}) and {r} recording(s) ({rbytes})', { n: r.removed || 0, bytes: bytesText(r.bytesRemoved || 0), r: r.recordingsRemoved || 0, rbytes: bytesText(r.recordingBytesRemoved || 0) }), { duration: 6000 }); load(); };
  refreshBtn.onclick = () => load();
  winInfo.onClose = () => { st.closed = true; if (st.timer) clearTimeout(st.timer); try { app.ws?.offGlobal?.(onGlobal); } catch { /* optional */ } };
  winInfo._browserProfiles = { focusRow, load, state: () => ({ error: st.error, profiles: (st.view?.profiles || []).length, orphans: (st.view?.orphans || []).length, forgotten: (st.view?.forgotten || []).length }) };
  load();
  return winInfo;
}

export function installBrowserTrace(App) {
  /** THE profiles panel, one window: `{syncId?, focus?: profileId}`. */
  App.prototype.openBrowserProfiles = function (opts) { return openBrowserProfilesWindow(this, opts || {}); };
}

// ── WINDOW-TYPE REGISTRATION (Plugin Ph1) + the ⚙ row (Tools ▸ Agent browser…; the window was "Browser profiles" before the faces rename) ──
registerWindowType({
  type: 'browser-profiles', label: 'Agent browser', singleton: true, // a LITERAL type: the window-types census reads it (a constant reads as a dynamic plugin kind)
  icon: svgIcon16('<rect x="1.5" y="2.5" width="13" height="10" rx="1.5"/><path d="M1.5 5.5h13M4 4h.01M6 4h.01M4 8h4M4 10.5h6"/>'),
  action: 'openBrowserProfiles', replay: (app, spec, { syncId } = {}) => app.openBrowserProfiles({ syncId }),
});
registerMenuItem({ menu: 'gear', parent: 'tools', order: 35, icon: UI_ICONS.browserLive, /* under Tools ▸ (Usage 10 · Background Work 20 · Desktop apps 30 · this 35 · Plugins 40); the agent's face on its window-with-a-dot glyph — the globe is the web view's (design-browser-faces B) */ when: (c) => !!c.app._browserProfiles, label: () => t('Agent browser…'), run: (c) => c.app.openBrowserProfiles() });
