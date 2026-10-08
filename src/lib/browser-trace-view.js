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
import { t, tc, deviceLocale } from './i18n.js';
import { fetchJson, createModalShell, showToast, showConfirmDialog, showInputDialog, showContextMenu, escHtml, attachPopoverClose } from './utils.js';
import { registerWindowType, svgIcon16 } from './window-types.js';
import { registerMenuItem } from './contributions.js';
import { btn, el as chromeEl, icon as chromeIcon } from './channel-chrome.js';
import { createBackendIcon } from './agent-meta.js';
import { whoChips, foldChips, CHIPS_WIDE } from './browser-who-model.js';
import { openWhoDialog, nameHelpers } from './browser-who-dialog.js';
import { openNewProfileDialog } from './browser-new-profile.js'; // lane browser-admin: the panel's New profile…
import { openBuildDialog } from './browser-build-dialog.js'; // lane browser-admin 2a: a row's Change build…
import { cardBuildLine } from './browser-build-model.js'; // lane browser-admin 2a: the row's Chrome build line (PURE words)
import { cliRowWords, cliOfferLabel, cliConfirmWords, cliOutcomeWords } from './browser-cli-model.js'; // lane browser-admin 2b: the Browser CLI row
import { UI_ICONS } from './icons.js';
import { memoryText } from '../runaway-guard.js';
import { stuckWords, unresponsiveWords } from '../browser-stuck.js'; // lane browser-stuck: a profile row whose page waits on a dialog / does not respond
import { frameUrl, bytesText, traceSummary, timelineLabel, positionText, overlayGeometry, traceWindowFor, unionWindow, assignEntriesToWindows, armGapFor, EPHEMERAL_SCOPE, TRACE_BYTES_PER_PROFILE, foldFits, visibleEntries, isFitEntry, fitCount } from '../browser-trace.js'; // lane trace-fits: the page-size fold
import { sessionOfEntry, sessionOrdinals } from '../browser-sessions.js'; // 2026-09-27: the live view's session dividers + Sessions list (PURE)
import { humanStateLine, humanRefusalText } from '../browser-human.js'; // BROWSE YOURSELF (B-6ae8): the row's "You are browsing it" line (PURE)
import { dividerText, sessionRowText, sessionReplays, retentionText, sizeText } from './browser-session-words.js'; // the words every session surface shares
import { displayFactText } from './browser-display-words.js';
import { rowLine, rowFold, rowMenu, gridNeed, orphanOrder, usageLine as usageCell, diskFold } from './browser-panel-model.js'; // design 015 (lane browser-panel-tidy): the row's line / fold / menu (PURE)
import { barLayout } from './live-bar-layout.js'; // design 015 §2b: a cell's line never wraps — what does not fit folds by width (the bar-fold rule) // lane headless-fallback: a browser that runs headless because the machine has no desktop session says so

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
  if (k === 'viewport') return t('page size'); // lane S4 verify r1 F6: the live view's own resize
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
/** 2026-09-27 (the owner: "按照容量，每个浏览器 profile 最多保留 1GB 记录"): by SIZE only — the limit the server
 *  answered (`limit`, the setting), else the 1 GiB default; the oldest frames go first, every action list stays. */
let knownLimit = TRACE_BYTES_PER_PROFILE; // the last limit the server answered (the housekeeping view / a sessions list)
export function noteTraceLimit(n) { if (Number(n) > 0) knownLimit = Number(n); }
export function retentionSentence(limitBytes = null) {
  return retentionText(Number(limitBytes) > 0 ? Number(limitBytes) : knownLimit);
}

// ── lane trace-fits (2026-10-01): THE PAGE-SIZE FOLD every surface draws ──
// The owner: every resize / move of the live view re-fits the page and was a row of its own — the Actions list was all
// "view fit". The recorder already folds a storm into one entry (src/browser-trace.js F1); here CONSECUTIVE fit entries
// fold into ONE dim row (PURE `foldFits`), the counts say agent actions with the fits beside, and ONE per-device
// preference (this toggle, localStorage, default OFF) expands them wherever a list is drawn.
const SHOW_FITS_KEY = 'vibespace.browserTrace.showFits';
export function showFitsPref() { try { return localStorage.getItem(SHOW_FITS_KEY) === '1'; } catch { return false; } }
export function setShowFitsPref(on) { try { if (on) localStorage.setItem(SHOW_FITS_KEY, '1'); else localStorage.removeItem(SHOW_FITS_KEY); } catch { /* a device without storage keeps the default */ } }
/** The toggle — a <label> wrapping its checkbox (a named control); `onChange(on)` runs after the preference is written. */
export function fitsToggle({ onChange = null } = {}) {
  const lab = el('label', 'browser-trace-fits-toggle');
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = showFitsPref();
  lab.title = t('Every resize or move of the live view fits the page to it and is recorded. Off: consecutive page-size changes are one dim row. On: each is its own row with its frames.');
  cb.onchange = () => { setShowFitsPref(cb.checked); onChange && onChange(cb.checked); };
  lab.append(cb, document.createTextNode(' ' + t('Show page-size changes')));
  return { el: lab, input: cb, sync: () => { cb.checked = showFitsPref(); } };
}
/** The fold row's words: "Live view fitted ×N · 1072×907 (last)". */
export function fitRowText(row) {
  const size = positionText(row && row.last && row.last.position) || '';
  return row && row.n > 1 ? t('Live view fitted ×{n} · {size} (last)', { n: row.n, size }) : t('Live view fitted · {size}', { size });
}
export function fitRowTitle(row) { return t('{n} page-size change(s) between {from} and {to} — the live view was resized or moved and the page fitted to it; click for the last one.', { n: row ? row.n : 0, from: clockText(row ? row.at : 0), to: clockText(row ? row.lastAt : 0) }); }
/** The count line: "N action(s)[ · M failed][ · K page-size change(s)]" — fits beside, never in N. */
export function countText(s) {
  const base = s.n ? t('{n} action(s)', { n: s.n }) + (s.failed ? ' · ' + t('{n} failed', { n: s.failed }) : '') : '';
  const fits = s.fits ? t('{n} page-size change(s)', { n: s.fits }) : '';
  return base && fits ? base + ' · ' + fits : base || fits;
}

// ── the thumbnail strip ──
/** A strip of after-frame thumbnails (the before-frame when nothing repainted, or when the action failed before anything
 *  could); a run of page-size changes is ONE dim thumb (its last frame, "×N") unless the toggle expands them. */
export function renderTraceStrip(container, entries, { onOpen = null, max = STRIP_MAX, expand = showFitsPref() } = {}) {
  container.replaceChildren();
  const rows = foldFits((entries || []).filter(Boolean), { expand });
  const list = visibleEntries(rows);
  const shown = rows.slice(Math.max(0, rows.length - max));
  for (const r of shown) {
    const e = r.kind === 'fits' ? r.last : r.entry;
    const b = el('button', 'browser-trace-thumb' + (e.ok === false ? ' failed' : '') + (r.kind === 'fits' || r.fit ? ' fits' : ''));
    b.type = 'button';
    b.dataset.traceId = e.id;
    b.title = r.kind === 'fits' ? fitRowTitle(r) : `${clockText(e.at)} · ${timelineLabel(e)} · ${statusText(e)}`;
    const which = e.after ? 'after' : (e.before ? 'before' : null);
    if (which) { const img = el('img', 'browser-trace-thumb-img'); img.alt = ''; img.loading = 'lazy'; img.draggable = false; img.src = frameUrl(e.id, which) + (isFitEntry(e) && e.n > 1 ? `?v=${e.n}` : ''); b.appendChild(img); }
    else b.appendChild(el('span', 'browser-trace-thumb-empty', t('no frame')));
    b.appendChild(el('span', 'browser-trace-thumb-label', r.kind === 'fits' ? (r.n > 1 ? `×${r.n}` : t('page size')) : String(e.action || '?')));
    b.onclick = (ev) => { ev.stopPropagation(); onOpen && onOpen(e, list); };
    container.appendChild(b);
  }
  if (rows.length > shown.length) { const more = el('span', 'browser-trace-thumb-more', t('+{n} earlier', { n: rows.length - shown.length })); container.appendChild(more); }
  return shown.length;
}

// ── the entry dialog: before / after with the overlay ──
/** Draw the position on a picture: after the image lands, the dot / rect in the drawn picture's px. */
export function drawOverlay(pane, img, entry, which) {
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
    pos.textContent = tc('replay', '{i} of {n}', { i: index + 1, n: entries.length }) + ' · ' + clockText(e.at); // "action k of n" — the replay window's words
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
    else row(t('Profile'), t('no profile (temporary browser)')); // lane S2: plain words
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
  // r2 L5: `armFail` = the recorder's last `browser-trace-status` arm_failed for this conversation (null once `armed`)
  const st = { queued: new Set(), timer: null, appendTimer: null, key: null, disposed: false, loads: 0, armFail: null };
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
    // a browser SESSION card (2026-09-27) is not the next message: it lands INSIDE the call that started the browser
    // (the launch happens while the command runs) — ending the card's window there cut off the call's own actions
    while (n) { const v = n.classList && n.classList.contains('chat-browser-session') ? 0 : Number(n.dataset && n.dataset.ts); if (v > ts) { nextTs = v; break; } n = n.nextElementSibling; }
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
    for (const { h, w } of windows) render(h, byCard[w.id] || [], { off: r.traceOn === false, untraced, gap: armGapFor(w, st.armFail) });
  }
  function render(h, entries, { off = false, error = null, unknown = false, untraced = false, gap = null } = {}) {
    h.dataset.traceState = error ? 'error' : 'loaded';
    h.dataset.traceUntraced = untraced && !entries.length ? '1' : '';
    h._traceEntries = entries;
    const sum = h.querySelector('.chat-browser-trace-sum');
    const strip = h.querySelector('.chat-browser-trace-strip');
    const s = traceSummary(entries);
    if (sum) {
      if (error) sum.textContent = t('trace unavailable: {why}', { why: String(error) });
      else if (s.n || s.fits) sum.textContent = countText(s); // lane trace-fits: agent actions, the page-size changes beside
      else if (off) sum.textContent = t('action trace is off (Settings → Agent browser)');
      else if (unknown) sum.textContent = t('no conversation id to look up');
      // r2 L5: the recorder could not tap this browser — its actions in [at, until] were NOT recorded, and that is said
      else if (gap) sum.textContent = t('not recorded until {time}: {why}', { time: clockText(gap.until), why: gap.error });
      else if (untraced) sum.textContent = t('not traced — this browser was not started through VibeSpace (Agent browser)');
      else sum.textContent = h.closest('.chat-msg')?.querySelector('.chat-tool-output-pending') ? t('waiting for actions…') : t('no recorded actions in this call');
      sum.classList.toggle('empty', !s.n);
    }
    if (strip) { const n = renderTraceStrip(strip, entries, { expand: showFitsPref(), onOpen: (e, list) => openTraceEntryDialog(view.app, e, list) }); strip.style.display = n ? '' : 'none'; }
    if (h.dataset.traceOpen === '1') renderList(h);
  }
  function renderList(h) {
    const list = h.querySelector('.chat-browser-trace-list'); if (!list) return;
    list.replaceChildren();
    const entries = h._traceEntries || [];
    if (!entries.length) { list.appendChild(el('div', 'chat-status-dim', h.dataset.traceUntraced === '1' ? t('Actions are recorded only for browsers VibeSpace started (profiles) — this call drove a browser of its own.') : t('No actions were recorded in this call.'))); return; }
    // lane trace-fits: consecutive page-size changes are ONE dim row (the toggle in the live view's Actions pane expands them)
    const rows = foldFits(entries, { expand: showFitsPref() });
    const open = visibleEntries(rows);
    for (const r of rows) {
      if (r.kind === 'fits') {
        const fr = el('button', 'browser-trace-row fits chat-status-dim'); fr.type = 'button'; fr.dataset.traceId = r.id; fr.dataset.fits = String(r.n);
        const top = el('div', 'browser-trace-row-top');
        top.appendChild(el('span', 'browser-trace-row-time', clockText(r.at) + (r.n > 1 ? '–' + clockText(r.lastAt) : '')));
        top.appendChild(el('span', 'browser-trace-row-fits', fitRowText(r)));
        fr.appendChild(top);
        fr.title = fitRowTitle(r);
        fr.onclick = (ev) => { ev.stopPropagation(); openTraceEntryDialog(view.app, r.last, open); };
        list.appendChild(fr);
        continue;
      }
      const e = r.entry;
      const row = el('div', 'browser-trace-row' + (e.ok === false ? ' failed' : '') + (r.fit ? ' fits' : ''));
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
        b.onclick = (ev) => { ev.stopPropagation(); openTraceEntryDialog(view.app, e, open); };
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
  /** r2 L5: the recorder's `browser-trace-status` for this conversation — `arm_failed` (its verbs until `until` are
   *  not recorded, and why) or `armed` (cleared); the cards whose window it covers are asked again (debounced). */
  function onStatus(msg) {
    if (st.disposed || !msg || msg.type !== 'browser-trace-status') return;
    const mine = (msg.sessionId && msg.sessionId === view.sessionId) || (st.key && msg.browserKey === st.key);
    if (!mine) return;
    st.armFail = msg.code === 'arm_failed' ? { code: 'arm_failed', at: Number(msg.at) || Date.now(), until: Number(msg.until) || 0, error: String(msg.error || '') } : null;
    for (const h of holders()) delete h.dataset.traceState;
    if (st.appendTimer) clearTimeout(st.appendTimer);
    st.appendTimer = setTimeout(() => { st.appendTimer = null; observe(view._messageList); }, APPEND_DEBOUNCE_MS);
  }
  function dispose() { st.disposed = true; if (st.timer) clearTimeout(st.timer); if (st.appendTimer) clearTimeout(st.appendTimer); st.queued.clear(); }
  return { observe, onAppended, onStatus, dispose, flush, state: () => ({ queued: st.queued.size, key: st.key, loads: st.loads, armFail: st.armFail }) };
}

// ── the live view's timeline pane ──
/**
 * The session's actions on ONE pane (the profile's scope, or the ephemeral
 * one): `load({profileId, ephemeral})` seeds from GET, `push(entry)` grows it
 * from the stream's `trace` record (deduped by id), `clear()` on a pane switch.
 * 2026-09-27 (browser SESSIONS): the pane opens with a `Sessions` list (newest
 * first — when · how long · how many actions, each with Replay) and the actions
 * below it carry a DIVIDER where a session begins ("Session 3 · started 10:02");
 * the list is re-read when a session starts or ends (`onSessions`), and a view
 * of a STOPPED browser still has it (`sessionsCount`, the live window opens the
 * pane then).
 */
export function createTraceTimeline(app, { sessionId, browserKey: ownKey = null } = {}) {
  // BROWSE YOURSELF (B-6ae8): the user's own browsing window has no session — its pane reads HIS key (`hu-…`, the route's
  // `browserKey`), the profile's scope
  const askBy = () => (sessionId ? { sessionId } : ownKey ? { browserKey: ownKey } : null);
  const root = el('div', 'browser-live-trace');
  const sessBox = el('div', 'browser-live-sessions');
  const sessHead = el('div', 'browser-live-sessions-head', t('Sessions'));
  const sessList = el('div', 'browser-live-sessions-list');
  sessBox.append(sessHead, sessList);
  sessBox.style.display = 'none';
  const head = el('div', 'browser-live-trace-head');
  const count = el('span', 'browser-live-trace-count', '');
  // lane trace-fits: the toggle expands the folded page-size changes (shown once there are any)
  const toggle = fitsToggle({ onChange: () => { st.showFits = showFitsPref(); renderList(); renderHead(); } });
  toggle.el.style.display = 'none';
  head.append(count, toggle.el);
  const listEl = el('div', 'browser-live-trace-list');
  const empty = el('div', 'browser-live-trace-empty chat-status-dim', t('No actions yet — every agent action lands here with its before / after frames.'));
  root.append(sessBox, head, listEl, empty);
  const st = { entries: [], ids: new Set(), scope: undefined, off: false, loading: false, error: null, sessions: [], ordinals: new Map(), browserKey: ownKey || null, lastSid: undefined, sessTimer: null, rows: new Map(), sessRows: new Map(), folds: new Map(), divs: new Map(), showFits: showFitsPref() };
  function scopeQuery() { if (st.scope === undefined) return ''; return st.scope === null ? EPHEMERAL_SCOPE : String(st.scope); }
  const agentCount = () => st.entries.filter((e) => !isFitEntry(e)).length;
  const fitTotal = () => st.entries.reduce((n, e) => n + fitCount(e), 0);
  function renderHead() {
    const fits = fitTotal();
    if (st.error) count.textContent = t('trace unavailable: {why}', { why: String(st.error) });
    else if (st.off) count.textContent = t('action trace is off (Settings → Agent browser)');
    else count.textContent = countText({ n: agentCount(), failed: 0, fits }) + ' · ' + t('newest last');
    toggle.el.style.display = fits && !st.error ? '' : 'none';
    toggle.sync();
    empty.style.display = st.entries.length || st.off || st.error ? 'none' : '';
  }
  const openList = () => visibleEntries(foldFits(st.entries, { expand: st.showFits }));
  function rowFor(e) {
    const row = el('button', 'browser-live-trace-row' + (e.ok === false ? ' failed' : '') + (isFitEntry(e) ? ' fits' : '')); row.type = 'button'; row.dataset.traceId = e.id;
    const which = e.after ? 'after' : (e.before ? 'before' : null);
    const thumb = el('span', 'browser-live-trace-thumb');
    if (which) { const img = el('img', 'browser-trace-thumb-img'); img.alt = ''; img.loading = 'lazy'; img.draggable = false; img.src = frameUrl(e.id, which) + (isFitEntry(e) && e.n > 1 ? `?v=${e.n}` : ''); thumb.appendChild(img); }
    const text = el('span', 'browser-live-trace-text');
    text.appendChild(el('span', 'browser-live-trace-time', clockText(e.at)));
    text.appendChild(el('span', 'browser-live-trace-label', timelineLabel(e) + (isFitEntry(e) && e.n > 1 ? ` ×${e.n}` : ''))); // a coalesced fit, expanded, says how many it stands for
    text.appendChild(el('span', 'browser-live-trace-status', statusText(e)));
    row.append(thumb, text);
    row.title = String(e.text || '');
    row.onclick = () => openTraceEntryDialog(app, e, openList());
    return row;
  }
  /** lane trace-fits: ONE dim row per run of page-size changes, keyed by its first fit and patched in place. */
  function foldRow(r) {
    let node = st.folds.get(r.id);
    if (!node) { node = el('button', 'browser-live-trace-row fits fold chat-status-dim'); node.type = 'button'; node.dataset.traceId = r.id; st.folds.set(r.id, node); }
    const sig = JSON.stringify([r.n, r.lastAt, r.last.id, positionText(r.last.position), r.failed]);
    if (node.dataset.sig !== sig) {
      node.dataset.sig = sig; node.dataset.fits = String(r.n);
      const e = r.last;
      const which = e.after ? 'after' : (e.before ? 'before' : null);
      const thumb = el('span', 'browser-live-trace-thumb');
      if (which) { const img = el('img', 'browser-trace-thumb-img'); img.alt = ''; img.loading = 'lazy'; img.draggable = false; img.src = frameUrl(e.id, which) + (e.n > 1 ? `?v=${e.n}` : ''); thumb.appendChild(img); }
      const text = el('span', 'browser-live-trace-text');
      text.appendChild(el('span', 'browser-live-trace-time', clockText(r.at) + (r.n > 1 ? '–' + clockText(r.lastAt) : '')));
      text.appendChild(el('span', 'browser-live-trace-label', fitRowText(r)));
      node.replaceChildren(thumb, text);
      node.title = fitRowTitle(r);
      node.onclick = () => openTraceEntryDialog(app, r.last, openList());
    }
    return node;
  }
  /** The session an entry belongs to (its tag, else the implicit session of a pre-session record). */
  const sidOf = (e) => sessionOfEntry(e, st.sessions);
  function dividerFor(sid) {
    const s = st.sessions.find((x) => x.id === sid) || null;
    const words = s ? dividerText(st.ordinals.get(sid) || 1, s.startAt) : t('Session {k} · started {time}', { k: st.ordinals.size + 1, time: '…' });
    let d = st.divs.get(sid || '');
    if (!d) { d = el('div', 'browser-live-trace-divider'); d.dataset.session = sid || ''; st.divs.set(sid || '', d); }
    if (d.textContent !== words) d.textContent = words;
    return d;
  }
  /** Rebuild the list from the entries, the SAME row nodes kept (keyed by id), a divider where a session begins;
   *  consecutive page-size changes are ONE dim row unless the toggle expands them (lane trace-fits). */
  function renderList() {
    const nodes = [];
    let prev;
    for (const r of foldFits(st.entries, { expand: st.showFits })) {
      const first = r.kind === 'fits' ? r.entries[0] : r.entry;
      const sid = sidOf(first);
      if (sid !== prev && sid) nodes.push(dividerFor(sid));
      prev = sid;
      if (r.kind === 'fits') { nodes.push(foldRow(r)); continue; }
      let n = st.rows.get(r.entry.id); if (!n) { n = rowFor(r.entry); st.rows.set(r.entry.id, n); }
      nodes.push(n);
    }
    st.lastSid = prev;
    listEl.replaceChildren(...nodes);
  }
  function renderSessions() {
    const list = st.sessions;
    sessBox.style.display = list.length ? '' : 'none';
    sessHead.textContent = `${t('Sessions')} (${list.length})`;
    const out = list.map((x) => {
      let r = st.sessRows.get(x.id);
      if (!r) {
        r = el('div', 'browser-live-session'); r.dataset.session = x.id;
        const txt = el('span', 'browser-live-session-text');
        const b = btn(t('Replay'), () => app.openBrowserReplay?.({ browserKey: st.browserKey || x.browserKey || null, session: x.id }), 'browser-live-session-replay');
        b.title = t('Watch this browser session again, action by action');
        r.append(txt, b);
        st.sessRows.set(x.id, r);
      }
      const words = sessionRowText(x);
      const txt = r.firstChild;
      if (txt.textContent !== words) txt.textContent = words;
      // BROWSE YOURSELF (B-6ae8): the user's own session offers Replay only once something of his was recorded
      { const rb = r.lastChild; const show = x.holder !== 'user' || sessionReplays(x); if (rb && rb.style.display !== (show ? '' : 'none')) rb.style.display = show ? '' : 'none'; }
      r.classList.toggle('open', !!x.open);
      return r;
    });
    const kids = sessList.childNodes;
    for (let i = 0; i < out.length; i++) if (kids[i] !== out[i]) sessList.insertBefore(out[i], kids[i] || null);
    while (kids.length > out.length) sessList.removeChild(kids[kids.length - 1]);
    for (const k of [...st.sessRows.keys()]) if (!list.some((x) => x.id === k)) st.sessRows.delete(k);
  }
  async function loadSessions() {
    if (!askBy()) return;
    const q = new URLSearchParams(askBy());
    const sc = scopeQuery(); if (sc) q.set('profile', sc);
    const r = await fetchJson(`/api/browser/sessions?${q}`);
    if (!r || r.error) return; // the actions still show; the list is an addition, its absence says nothing false
    noteTraceLimit(r.limit);
    st.sessions = Array.isArray(r.sessions) ? r.sessions : [];
    st.browserKey = r.browserKey || st.browserKey;
    st.ordinals = sessionOrdinals(st.sessions);
    renderSessions(); renderList();
  }
  /** A new entry (or, lane trace-fits, a REPLACED fit row under its run's id — patched in place); `render: false` while
   *  a load seeds many at once. */
  function push(entry, { render = true } = {}) {
    if (!entry || !entry.id) return false;
    if (st.ids.has(entry.id)) {
      const i = st.entries.findIndex((e) => e.id === entry.id);
      if (i < 0) return false;
      st.entries[i] = entry; st.rows.delete(entry.id);
    } else { st.ids.add(entry.id); st.entries.push(entry); }
    const sid = sidOf(entry);
    if (sid && !st.sessions.some((x) => x.id === sid)) onSessions(); // a session the list has not heard of yet — re-read it
    if (render) { renderList(); renderHead(); listEl.scrollTop = listEl.scrollHeight; }
    return true;
  }
  function clear() { st.entries = []; st.ids = new Set(); st.rows = new Map(); st.folds = new Map(); st.divs = new Map(); st.lastSid = undefined; listEl.replaceChildren(); st.error = null; st.sessions = []; st.ordinals = new Map(); st.sessRows = new Map(); sessList.replaceChildren(); sessBox.style.display = 'none'; renderHead(); }
  /** A session started or ended on this conversation's browser: re-read the list (debounced). */
  function onSessions() { if (st.sessTimer) clearTimeout(st.sessTimer); st.sessTimer = setTimeout(() => { st.sessTimer = null; loadSessions(); }, 500); }
  /** Seed (or re-seed after a reconnect — same scope keeps what it has, `push` dedups; a pane switch clears first). */
  async function load({ profileId = undefined } = {}) {
    if (st.scope !== profileId || st.error) { st.scope = profileId; clear(); }
    if (!askBy()) return;
    st.loading = true;
    const q = new URLSearchParams({ ...askBy(), limit: '300' });
    const sc = scopeQuery(); if (sc) q.set('profile', sc);
    const [r] = await Promise.all([fetchJson(`/api/browser/actions?${q}`), loadSessions()]);
    st.loading = false;
    if (!r || r.error) { st.error = (r && r.error) || t('server unreachable'); renderHead(); return; }
    st.off = r.traceOn === false;
    if (r.browserKey) st.browserKey = r.browserKey;
    for (const e of r.entries || []) push(e, { render: false });
    renderList();
    renderHead();
    listEl.scrollTop = listEl.scrollHeight;
  }
  renderHead();
  // lane trace-fits: `count()` = the agent's actions (the window's "Actions (N)"); the fits are `fits()`
  return { el: root, load, push, clear, onSessions, count: () => st.entries.filter((e) => !isFitEntry(e)).length, fits: fitTotal, sessionsCount: () => st.sessions.length, browserKey: () => st.browserKey, state: () => ({ n: agentCount(), entries: st.entries.length, fits: fitTotal(), folds: listEl.querySelectorAll('.browser-live-trace-row.fold').length, fitRows: listEl.querySelectorAll('.browser-live-trace-row.fits:not(.fold)').length, showFits: st.showFits, off: st.off, error: st.error, scope: st.scope, sessions: st.sessions.length, dividers: listEl.querySelectorAll('.browser-live-trace-divider').length }) };
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
/** lane browser-profile-clone: a day in the device's locale ("copied from X on 8 Oct 2026" / "2026年10月8日"). */
function cloneDateText(ms) { try { return new Date(ms).toLocaleDateString(deviceLocale(), { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return new Date(ms).toISOString().slice(0, 10); } }
export function agoText(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) return '';
  const s = Math.max(0, Math.round(Number(ms) / 1000));
  if (s < 60) return t('just now');
  if (s < 5400) return t('{n} min ago', { n: Math.round(s / 60) });
  if (s < 172800) return t('{n} h ago', { n: Math.round(s / 3600) });
  return t('{n} d ago', { n: Math.round(s / 86400) });
}
/**
 * A profile row's state in the device's words, from the row's STRUCTURE (2026-09-28, the naive-user verifier: the server's
 * English `why` — "attached by 2 session(s)", "last used 0 h ago" — sat inside the zh / ja panel; `why` stays the agent's
 * and the CLI's sentence).
 */
export function rowWhyText(r) {
  const x = r || {};
  const closed = x.browserClosed === 'browser_unstable' ? (x.closedHow === 'failing' ? t('its browser could not be started; VibeSpace stopped trying (Stop resets it)') : t('its browser keeps closing; VibeSpace stopped starting it (Stop resets it)'))
    : x.browserClosed === 'profile_locked' ? t('its folder is held by another browser')
      : x.browserClosed ? t('its browser is closed (the next command starts it again)') : '';
  const age = Number.isFinite(Number(x.ageMs)) && x.ageMs !== null ? Number(x.ageMs) : null;
  switch (x.state) {
    case 'in-use': { const n = Number(x.held) || 0; const head = n === 1 ? t('1 conversation uses it') : t('{n} conversations use it', { n }); return closed ? `${head} · ${closed}` : head; }
    case 'live': return closed || t('its browser is running');
    case 'recent': return t('written {ago}; it may still be in use', { ago: agoText(age) });
    case 'stale': return t('unused for {n} days; listed, never deleted by itself', { n: Math.round((age || 0) / 86400000) });
    case 'kept': return age === null ? t('never used yet') : t('last used {ago}', { ago: agoText(age) });
    case 'not-ours': return t("VibeSpace doesn't keep this profile's folder here, so it is only listed");
    default: return String(x.why || '');
  }
}
/**
 * design 015 §2b (lane browser-panel-tidy): ONE cell line that never wraps — every item keeps its width; what does not
 * fit folds, from the end, into the line's "+n" pill (the bar-fold rule, PURE barLayout: priority 0 never folds).
 * `items` = [{el, priority}] in DOM order (the line's flex items, one gap). → the folded items ([] while unlaid).
 */
export function fitLine(line, items, more, moreText) {
  const width = line.getBoundingClientRect().width;
  if (!(width > 0)) return [];
  for (const it of items) it.el.style.display = '';
  more.textContent = moreText(items.filter((it) => it.priority > 0).length); more.style.display = '';
  const px = (e) => e.getBoundingClientRect().width;
  const gap = parseFloat(getComputedStyle(line).columnGap) || 0;
  const plan = barLayout({ widthPx: width, items: items.map((it, i) => ({ key: String(i), px: px(it.el), priority: it.priority })), gapPx: gap, overflowPx: px(more) });
  const folded = new Set(plan.overflow.map(Number));
  items.forEach((it, i) => { it.el.style.display = folded.has(i) ? 'none' : ''; });
  more.style.display = 'none';
  return items.filter((_, i) => folded.has(i));
}
// ── OWNER RULING A (2026-09-26): WHO CAN USE a profile — the row's "Who can use it" cell, Rename…, Delete… ──
/**
 * THE "WHO CAN USE IT" CELL of one profile row (2026-09-27 — a LIST of conversations and Task Groups; design 015: the
 * table's third column): l1 = the VALUE ("All agents" — lane everyone-principal: the All chip, "(N more rows)" when
 * rows are kept beside it — or one chip per row of the list — a conversation by its backend glyph and name, dim with a
 * hollow dot when not running; a Task Group by the people glyph and its title, amber when deleted — at most CHIPS_WIDE,
 * then folded by WIDTH into "+N more" (`fit`, the bar-fold rule: nothing wraps, nothing is cut) and the house text
 * button "Change…" (never folds; the dialog, src/lib/browser-who-dialog.js); l2 = the amber "Nobody can use it now…"
 * line when every row is dead. KEYED IN PLACE: the cell element and its chips are kept across loads and broadcasts —
 * chips reconciled by `data-key`, a text replaced only when it changed — so a who-change never re-creates the row or a
 * chip that did not change. Returns `{el, patch(row), fit()}`.
 */
export function whoCell(app, { onChange = null } = {}) {
  const root = chromeEl('div', 'bprof-cell bprof-who');
  const line = chromeEl('div', 'bprof-l1 bprof-who-line');
  const value = chromeEl('span', 'bprof-who-value');
  // ALL AGENTS (lane everyone-principal): the value's first chip — the everyone glyph + "All agents"
  const allText = chromeEl('span', 'bprof-who-all bprof-who-chip is-everyone');
  allText.appendChild(chromeIcon('everyone', 12, 'bprof-who-glyph'));
  const allWords = chromeEl('span', 'bprof-who-name');
  allText.appendChild(allWords);
  const chips = chromeEl('span', 'bprof-who-chips');
  const more = chromeEl('span', 'bprof-who-more');
  value.append(allText, chips, more);
  let rowNow = null, countRest = [];
  const change = btn(t('Change…'), () => { if (rowNow) openWhoDialog(app, rowNow.id, { label: String(rowNow.label || rowNow.id), onSaved: onChange }); }, 'bprof-who-change');
  line.append(value, change);
  const note = chromeEl('div', 'bprof-l2 bprof-who-nobody');
  note.appendChild(chromeIcon('alert', 11));
  const noteText = chromeEl('span', '');
  note.appendChild(noteText);
  root.append(line, note);
  const nodes = new Map();   // chip key → node
  const setText = (n, v) => { if (n.textContent !== v) n.textContent = v; };
  function chipNode(c) {
    let n = nodes.get(c.key);
    const sig = JSON.stringify([c.kind, c.name, c.live, c.amber, c.tooltip, c.backend]);
    if (n && n.dataset.sig === sig) return n;
    if (!n) { n = chromeEl('span', 'bprof-who-chip'); n.dataset.key = c.key; nodes.set(c.key, n); }
    n.dataset.sig = sig;
    n.textContent = '';
    n.className = 'bprof-who-chip' + (c.kind === 'task' ? ' is-group' : ' is-session') + (c.kind === 'session' && !c.live ? ' is-stopped' : '') + (c.amber ? ' is-amber' : '');
    if (c.kind === 'task') n.appendChild(chromeIcon('users', 12, 'bprof-who-glyph'));
    else if (c.live) { const bi = createBackendIcon(c.backend || 'claude', { className: 'bprof-who-glyph' }); bi.setAttribute('aria-hidden', 'true'); n.appendChild(bi); }
    else n.appendChild(chromeEl('span', 'bprof-who-dot'));
    n.appendChild(chromeEl('span', 'bprof-who-name', c.name));
    n.title = c.tooltip ? c.name + ' — ' + c.tooltip : c.name;
    return n;
  }
  function patch(r) {
    rowNow = r;
    const h = nameHelpers(app);
    const m = whoChips(r && r.use, { t, nameOfConversation: h.nameOfConversation, taskOf: h.taskOf });
    const f = foldChips(m.chips, CHIPS_WIDE, { t }); // CHIPS_WIDE is the upper bound; the cell's WIDTH folds the rest (fit)
    allText.style.display = m.mode === 'all' ? '' : 'none';
    setText(allWords, m.mode === 'all' ? (m.allText || t('All agents')) : '');
    allText.title = allWords.textContent; // design 015: a narrow column ellipsizes the one value before Change… is cut
    const out = f.shown.map(chipNode);
    const kids = chips.childNodes;
    for (let i = 0; i < out.length; i++) if (kids[i] !== out[i]) chips.insertBefore(out[i], kids[i] || null);
    while (kids.length > out.length) chips.removeChild(kids[kids.length - 1]);
    for (const k of [...nodes.keys()]) if (!m.chips.some((c) => c.key === k)) nodes.delete(k);
    chips.style.display = out.length ? '' : 'none';
    countRest = m.chips.slice(f.shown.length);
    setText(noteText, m.nobody || '');
    note.style.display = m.nobody ? '' : 'none';
    // BROWSE YOURSELF (B-6ae8): the list names conversations and Task Groups — never the user, who may always browse it
    const tip = (m.mode === 'all' ? t('Any of your conversations can use this browser and its logins — one browser, each conversation in its own tab.') : t('Only the conversations and Task Groups listed here can use it. Picking it for another conversation (New Session, Session properties) adds that conversation.')) + ' ' + t('You can always browse it yourself.');
    if (root.title !== tip) root.title = tip;
    root.dataset.mode = m.mode;
    fit();
  }
  /** design 015 §2b: the chips fold by WIDTH into "+N more" (its title names every folded row); Change… never folds. */
  function fit() {
    const shown = [...chips.childNodes];
    const items = [...(allText.style.display === 'none' ? [] : [{ el: allText, priority: 0 }]), ...shown.map((el) => ({ el, priority: 1 })), { el: change, priority: 0 }];
    const folded = fitLine(line, items, more, (n) => '+' + (n + countRest.length));
    const rest = [...folded.filter((it) => it.priority > 0).map((it) => (it.el.querySelector('.bprof-who-name') || it.el).textContent), ...countRest.map((c) => c.name)];
    more.style.display = rest.length ? '' : 'none';
    setText(more, rest.length ? '+' + rest.length : ''); // the mockup's "+n" pill (its title names every folded row)
    more.title = rest.join('\n');
    more.setAttribute('aria-label', rest.length ? t('+{n} more', { n: rest.length }) : '');
  }
  return { el: root, patch, fit, chipNodes: nodes };
}
/** The live conversations that USE a profile (a lease or a pin) — the Delete… warning's and the narrowing's count. */
export function usersOf(row) { return (Array.isArray(row && row.usedBy) ? row.usedBy : []).filter((u) => u && (u.leased || u.pinned)); }
/** A user-action call: fetchJson never throws, so `{error}` IS the failure and must reach the user. */
async function act(url, init, what) {
  const r = await fetchJson(url, init);
  if (!r || r.error) { showToast(t('{what} — {reason}', { what, reason: (r && r.error) || t('server unreachable') }), { type: 'error', duration: 9000 }); return null; }
  return r;
}
const jsonInit = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

export function openBrowserProfilesWindow(app, { syncId, focus = null } = {}) {
  for (const [, w] of app.wm.windows) if (w.type === PANEL_TYPE) { app.wm.revealWindow(w.id, { replay: !!syncId }); if (focus && w._browserProfiles) w._browserProfiles.focusRow(focus); return w; }
  app._hideWelcome?.();
  const winInfo = app.wm.createWindow({ title: t('Agent browser'), type: PANEL_TYPE, syncId, openSpec: { action: 'openBrowserProfiles' }, width: 860, height: 600 });
  const st = { view: null, error: null, busy: false, closed: false, timer: null, focus, orphansOpen: false };
  // KEYED (2026-09-27): each profile's "Who can use it" cell and its row are kept across loads — a load whose only change
  // for a row is its list PATCHES the cell in place; a row whose other facts moved is rebuilt around the SAME cell
  const whoCells = new Map();   // profileId → whoCell
  const rowsById = new Map();   // profileId → { row, sig }
  const whoCellFor = (id) => { let c = whoCells.get(id); if (!c) { c = whoCell(app, { onChange: () => load() }); whoCells.set(id, c); } return c; };
  /** What a profile row draws OTHER than its list — equal ⇒ the row element is kept (its who cell patched). */
  // lane browser-admin: the row's AGE enters the signature as the words it prints (rowWhyText — minutes / hours), never the
  // raw `ageMs`, which moves every millisecond and rebuilt every row on every load (the keyed reuse never held: a click
  // across a load hit a detached node; the heavy UI suite caught it keeping the row a New profile… create must leave alone)
  const rowSig = (r, v) => { const { use, ageMs, disk, ...rest } = r || {}; /* lane browser-disk-sample: `disk` is patched in place (patchDisk) */ return JSON.stringify([rest, rowWhyText(r), app.browserChipFor ? app.browserChipFor(r.id) : null, v?.limits?.recordingFloor || null, st.busy, pageStuckOf(r.id), autoDialogsOf(r), runningBuildOf(r.id)]); }; // lane browser-admin 2a: + the build its browser reports // lane browser-stuck: the page's state is part of what the row prints (+ verify r1 A6: its dialog mode)
  const root = el('div', 'bprof');
  const bar = el('div', 'bprof-bar');
  const summary = el('span', 'bprof-summary', t('Loading…'));
  // design 015 (c): the header is ONE line — the summary, an ⓘ that says how long records are kept (opened on press,
  // closed on an outside press), New profile… and ⟳; the Browser CLI row, the sweep and the retention text in full live
  // in the Maintenance section at the bottom
  const info = el('button', 'file-tool-btn bprof-info'); info.type = 'button';
  info.appendChild(chromeIcon('info', 13)); info.title = t('How long records are kept'); info.setAttribute('aria-label', info.title);
  const spacer = el('span'); spacer.style.flex = '1';
  const sweepBtn = el('button', 'file-tool-btn bprof-btn', t('Sweep now')); sweepBtn.title = t('Apply the size limit now: over it, the oldest sessions\' frames are removed and every action list stays; recordings keep their own limit — profiles are never touched');
  const refreshBtn = el('button', 'file-tool-btn bprof-btn', '⟳'); refreshBtn.title = t('Refresh');
  // lane browser-admin: THE create a person can reach without a conversation (the owner: "不能手动创建profile") — the
  // New profile… dialog (name · browser · machine · build · who can use it); the new row appears in place and is focused
  const newBtn = el('button', 'file-tool-btn bprof-btn bprof-new', t('New profile…'));
  newBtn.title = t('Create a profile: its name, which browser, the computer it runs on and who can use it');
  newBtn.onclick = () => openNewProfileDialog(app, { onCreated: (p) => { if (p && p.id) st.focus = p.id; load(); } });
  bar.append(summary, info, spacer, newBtn, refreshBtn);
  const hint = el('div', 'bprof-hint chat-status-dim');
  // lane browser-admin 2b: THE BROWSER CLI ROW — which agent-browser VibeSpace drives (the measured version, the one on
  // PATH, drift) and its ONE act; a keyed line, patched in place (its own fetch, GET /api/browser/cli); design 015: it
  // sits in the Maintenance section
  const cliRow = el('div', 'bprof-cli');
  const cliText = el('span', 'bprof-cli-text');
  const cliBtn = el('button', 'file-tool-btn bprof-btn bprof-cli-btn', '');
  cliRow.append(cliText, cliBtn);
  cliRow.style.display = 'none';
  const body = el('div', 'bprof-body');
  root.append(bar, body);
  winInfo.content.appendChild(root);
  info.onclick = (ev) => {
    ev.stopPropagation();
    const had = root.querySelector('.bprof-info-pop');
    if (had) { had.remove(); return; }
    const pop = el('div', 'bprof-info-pop', hint.textContent);
    pop.dataset.popover = '1'; // the global Escape closes it
    root.appendChild(pop);
    pop.style.top = (bar.offsetTop + bar.offsetHeight + 2) + 'px';
    pop.style.left = Math.max(8, Math.min(info.offsetLeft - 8, root.clientWidth - pop.offsetWidth - 8)) + 'px';
    attachPopoverClose(pop, info);
  };

  const section = (title, sub) => { const s = el('div', 'bprof-section'); const h = el('div', 'bprof-section-head'); h.appendChild(el('span', 'bprof-section-title', title)); if (sub) h.appendChild(el('span', 'bprof-section-sub chat-status-dim', sub)); s.appendChild(h); body.appendChild(s); return s; };
  const cell = (row, cls, text, title) => { const c = el('span', 'bprof-cell ' + cls, text); if (title) c.title = title; row.appendChild(c); return c; };
  // 2026-09-25: the keeper's live resource reading (memBytes labelled by its metric — "412 MB (PSS)"), and its REPORT
  // sentence as the tooltip when over the threshold; the keeper never stops a browser for it
  const usageLine = (host, u) => { const txt = u ? memoryText(u.memBytes, u.memMetric) : ''; if (!txt) return; const s = el('span', 'bprof-usage' + (u.over ? ' bprof-usage-over' : ''), txt); if (u.over) s.title = String(u.over); host.appendChild(s); };
  // lane headless-fallback: the launch's DISPLAY FACT under the state (no desktop session ⇒ headless; the window is back)
  const displayLine = (host, fact) => { const txt = displayFactText(fact); if (!txt) return; const s = el('span', 'bprof-display', txt); s.title = txt; host.appendChild(s); };

  /** lane trace-fits: the live view's own page-size frames, beside the row's {used} of {size} (they go first in a sweep). */
  const fitsLine = (host, tr) => {
    if (!(Number(tr && tr.fitBytes) > 0)) return;
    const fl = el('span', 'bprof-trace-fits chat-status-dim', t('page-size frames: {size}', { size: bytesText(Number(tr.fitBytes) || 0) }));
    fl.title = t('{n} page-size change(s)', { n: Number(tr.fits) || 0 }) + ' — ' + t('Every resize or move of the live view fits the page to it and is recorded. Off: consecutive page-size changes are one dim row. On: each is its own row with its frames.');
    host.appendChild(fl);
  };
  function renderHint(v) {
    // 2026-09-27: by SIZE only (the setting, 1 GB by default) — the recordings keep their own days / MB bound
    const size = sizeText(v?.limits?.bytesPerProfile || TRACE_BYTES_PER_PROFILE);
    const days = Math.round((v?.limits?.recordingRetentionMs || 7 * 86400000) / 86400000), mb = Math.round((v?.limits?.recordingBytesPerProfile || 200 * 1048576) / 1048576);
    noteTraceLimit(v?.limits?.bytesPerProfile);
    hint.textContent = t('Each profile keeps its records up to {size}; over it, the oldest sessions\' frames are removed first and every action list stays. Recordings are kept {days} days or {mb} MB. Frames of a logged-in page are secrets. Nothing here deletes a profile by itself: setting one aside moves its directory beside itself, and only your click on a set-aside row deletes it.', { size, days, mb }) + (v && v.traceOn === false ? ' ' + t('The action trace is OFF (Settings → Agent browser → Action trace).') : '');
  }
  function renderSummary(v) {
    const rows = v?.profiles || [];
    const bytes = rows.reduce((s, r) => s + (Number(r.bytes) || 0), 0);
    const traces = rows.reduce((s, r) => s + (r.trace ? r.trace.n : 0), 0) + (v?.ephemeral?.trace?.n || 0);
    const recs = rows.reduce((s, r) => s + (r.recordings ? r.recordings.length : 0), 0);
    summary.textContent = t('{n} profile(s) · {size} on disk', { n: rows.length, size: bytesText(bytes) }) + (v?.orphans?.length ? ' · ' + t('{n} unregistered director(ies)', { n: v.orphans.length }) : '');
    summary.dataset.traces = String(traces); summary.dataset.recordings = String(recs); // design 015: the counts live on the rows
    summary.title = summary.textContent; // a narrow window ellipsizes the line; the whole of it is here (a phone wraps it — style.css)
  }
  /** lane browser-admin 2a: the build a profile's browser REPORTS (the digest's browser record — the fact, not the choice). */
  function runningBuildOf(id) { const b = app._browserProfiles && app._browserProfiles.browsers ? app._browserProfiles.browsers[id] : null; return b && typeof b.runningBuild === 'string' ? b.runningBuild : null; }
  /** lane browser-stuck: the digest's `pageStuck` row fact (a dialog holds its page / it does not respond). */
  function pageStuckOf(id) { const m = app._browserProfiles && app._browserProfiles.pageStuck; return m && typeof m === 'object' && m[id] && typeof m[id] === 'object' ? m[id] : null; }
  /** verify r1 A6: a running local browser launched BEFORE the lane (its record carries no `holdDialogs` launch stamp) still
   *  has 0.38.1 accept alert + leave-page dialogs by itself until its next start — the row SAYS which mode it runs in. */
  function autoDialogsOf(r) { const b = r && app._browserProfiles && app._browserProfiles.browsers ? app._browserProfiles.browsers[r.id] : null; return !!(r && r.live && !r.host && b && b.state === 'ready' && !b.holdDialogs); }
  // design 015 (lane browser-panel-tidy): THE PROFILE ROW — one grid line of five cells (each two lines: `l1` the
  // one-glance fact, `l2` the secondary), a chevron fold for everything else, ONE primary act and ONE ⋯ menu. The words
  // and which acts exist come from the PURE model (src/lib/browser-panel-model.js); the acts themselves stay here (RUN,
  // below). A fold's open state is per row and survives a rebuild (it is not in the row signature).
  const WORDS = { t, state: stateText, why: rowWhyText, ago: agoText, bytes: bytesText, size: sizeText, memory: memoryText, display: displayFactText, human: humanStateLine, date: cloneDateText };
  const openFolds = new Set();   // profileId → its fold is open
  /** lane browser-disk-sample: a new disk sample PATCHES the kept row (its size cell + the fold's On disk) — never a rebuild */
  const patchDisk = (row, r) => {
    const x = { w: WORDS }, c = row.querySelector('.bprof-size'), f = diskFold(r, x), fv = row.querySelector('.bprof-fold-disk');
    if (c) c.textContent = usageCell(r, x).l1; // usageCell: openBrowserProfilesWindow's own `usageLine` (the live memory cell) shadows the model's name
    if (fv) { fv.textContent = f.v; fv.title = f.title || ''; fv.classList.toggle('warn', f.tone === 'warn'); }
  };
  function profileRow(r, v) {
    const row = el('div', 'bprof-row bprof-profile'); row.dataset.profileId = r.id;
    const ps = pageStuckOf(r.id);
    const psw = ps ? stuckWords(ps, t) : null;
    const autoText = autoDialogsOf(r) ? t('Accepts leave-page dialogs by itself (typed input is lost) until its next start') : null;
    // lane browser-admin 2a: WHICH CHROME BUILD — the choice and, while it runs, the build the browser itself reports (the fold)
    const buildLine = cardBuildLine({ buildChoice: r.buildChoice, choice: r.browser, running: runningBuildOf(r.id), missing: r.buildMissing, live: !!r.live }, t);
    // lane browser-unresponsive: the keeper's verdict, in the viewer's clock ("Not answering since 16:34")
    const uw = r.unresponsive && Number.isFinite(r.unresponsive.since) ? unresponsiveWords({ since: r.unresponsive.since, label: String(r.label || r.id), clock: new Date(r.unresponsive.since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, t) : null;
    const x = { unresponsive: uw, w: WORDS, chip: app.browserChipFor ? app.browserChipFor(r.id) : null, mine: app._browserProfiles && app._browserProfiles.machine ? String(app._browserProfiles.machine.host || '') : '', stuck: psw, autoDialogs: !!autoText, autoText, buildLine, limits: v?.limits || null, now: Date.now() };
    const L = rowLine(r, x);
    const isOpen = openFolds.has(r.id);
    // ① the profile: the chevron + the name (cut, never wrapped — whole in its title and the fold), then its chips
    const ident = el('div', 'bprof-cell bprof-ident');
    const n1 = el('div', 'bprof-l1');
    const chev = el('button', 'bprof-chev'); chev.type = 'button'; chev.appendChild(chromeIcon('chevronRight', 12));
    const name = el('span', 'bprof-label', L.name.l1); name.title = L.name.title;
    n1.append(chev, name);
    const n2 = el('div', 'bprof-l2 bprof-chips');
    for (const c of L.name.chips) { const s = el('span', c.cls || 'bprof-chip', c.text); s.dataset.key = c.key; if (c.title) s.title = c.title; n2.appendChild(s); }
    n2.appendChild(el('span', 'bprof-chip bprof-chip-more'));
    ident.append(n1, n2);
    // ② the state: the dot + the word, then its ONE secondary sentence by priority (the fold lists every one)
    const state = el('div', 'bprof-cell bprof-state state-' + L.state.tone); state.title = L.state.title;
    const s1 = el('div', 'bprof-l1'); s1.append(el('span', 'bprof-dot'), el('span', 'bprof-state-word', L.state.l1));
    state.append(s1, el('div', 'bprof-l2 bprof-why' + (L.state.l2 && L.state.l2.tone ? ' ' + L.state.l2.tone : ''), L.state.l2 ? L.state.l2.text : ''));
    // ③ "WHO CAN USE IT" (2026-09-27, a LIST): the KEPT cell (patched in place, never re-created for a who-change); the
    // legacy record has no list — its words say so
    let who;
    if (L.who.kind === 'list') { const wc = whoCellFor(r.id); wc.patch(r); who = wc.el; }
    else { who = el('div', 'bprof-cell bprof-who bprof-who-legacy'); who.append(el('div', 'bprof-l1 chat-status-dim', L.who.l1), el('div', 'bprof-l2')); }
    // ④ the size on disk (never cut) and the counts (cut at the cell's end; "recording" in red)
    const use = el('div', 'bprof-cell bprof-use'); use.title = r.dir ? String(r.dir) : '';
    const u2 = el('div', 'bprof-l2 bprof-trace');
    L.usage.l2.forEach((p, i) => { if (i) u2.appendChild(document.createTextNode(' · ')); u2.appendChild(el('span', p.tone === 'rec' ? 'bprof-rec-live' : p.tone === 'warn' ? 'bprof-rec-refused' : '', p.text)); });
    use.append(el('div', 'bprof-l1 bprof-size', L.usage.l1), u2);
    // ⑤ the acts: BROWSE YOURSELF (B-6ae8, the owner 2026-09-28) — his own tab in its browser, or his open browsing
    // window — ABSENT (never greyed) where it cannot run; then the ⋯ menu with every other act
    const acts = el('div', 'bprof-cell bprof-act');
    if (L.primary) {
      const bb = el('button', 'file-tool-btn bprof-btn bprof-browse' + (L.primary.open ? ' open' : ''), L.primary.label);
      bb.title = L.primary.title;
      bb.onclick = () => { if (app.browseYourself) app.browseYourself(r.id, { label: String(r.label || r.id) }); };
      if (L.primary.id === 'restart') { bb.className = 'file-tool-btn bprof-btn bprof-restart bprof-restart-primary'; bb.onclick = () => RUN.restart(r); } // lane browser-unresponsive: the hung browser's ONE way out
      acts.appendChild(bb);
    }
    const menuBtn = el('button', 'file-tool-btn bprof-more'); menuBtn.type = 'button';
    menuBtn.appendChild(chromeIcon('more', 14)); menuBtn.title = t('More actions'); menuBtn.setAttribute('aria-label', menuBtn.title);
    menuBtn.onclick = (ev) => { ev.stopPropagation(); openRowMenu(r, x, menuBtn); };
    acts.appendChild(menuBtn);
    row.append(ident, state, who, use, acts);
    // the FOLD: every fact the line leaves out, each under its label
    const fold = el('div', 'bprof-fold');
    for (const f of rowFold(r, x)) { const it = el('div', 'bprof-fold-item'); const fv = el('span', 'bprof-fold-v bprof-fold-' + f.key + (f.key === 'build' ? ' bprof-build' : '') + (f.mono ? ' bprof-mono' : '') + (f.tone ? ' ' + f.tone : ''), f.v); if (f.title) fv.title = f.title; it.dataset.key = f.key; it.append(el('span', 'bprof-fold-k', f.k), fv); fold.appendChild(it); }
    const setOpen = (on) => { fold.hidden = !on; row.classList.toggle('open', on); chev.setAttribute('aria-expanded', String(on)); chev.title = on ? t('Hide details') : t('Show details'); };
    setOpen(isOpen);
    chev.onclick = () => { const on = !openFolds.has(r.id); if (on) openFolds.add(r.id); else openFolds.delete(r.id); setOpen(on); };
    row.appendChild(fold);
    return row;
  }
  /** The ⋯ menu (showContextMenu): the model's items in order — the record switches as check rows, Delete… last in the
   *  warn colour; each row carries its act's class (`bprof-replay`, `bprof-stop`, `bprof-restart`, `bprof-forget`, …). */
  const ACT_CLASS = { record: 'bprof-record', 'record-mine': 'bprof-record-mine', replay: 'bprof-replay', build: 'bprof-build-btn', rename: 'bprof-rename', stop: 'bprof-stop', restart: 'bprof-restart', 'restart-hold': 'bprof-restart-hold', delete: 'bprof-forget' };
  function openRowMenu(r, x, anchor) {
    const items = rowMenu(r, x).map((m) => {
      if (m.sep) return { separator: true };
      const check = m.check === undefined ? '' : `<span class="chan-menu-check${m.check ? ' chan-menu-check-on' : ''}">${m.check ? UI_ICONS.check : ''}</span>`;
      return { label: m.label, labelHtml: `${check}<span class="bprof-mi ${ACT_CLASS[m.id] || ''}" data-act="${escHtml(m.id)}">${escHtml(m.label)}</span>`, title: m.title || '', style: m.warn ? 'color: var(--red, #e55)' : '', action: () => { if (!st.busy && RUN[m.id]) RUN[m.id](r); } };
    });
    const rc = anchor.getBoundingClientRect();
    showContextMenu(rc.left, rc.bottom + 2, items);
  }
  /** One PATCH of a profile's switch (D7: the screencast opt-in; BROWSE YOURSELF (the owner, 4): "Also record my own
   *  actions"); the keeper answers and the row re-reads. */
  const patchSwitch = async (r, body) => { st.busy = true; await act(`/api/browser/profiles/${encodeURIComponent(r.id)}`, jsonInit('PATCH', body), t('Could not change recording')); st.busy = false; load(); };
  // THE ACTS by the model's ids — the ⋯ menu's rows run these (the primary and the who cell's Change… are their own buttons)
  const RUN = {
    record: (r) => patchSwitch(r, { record: !r.record }),
    'record-mine': (r) => patchSwitch(r, { recordMine: r.recordMine === false }),
    // 2026-09-27: every browser session on this profile, each with its replay (the replay window, this profile's list)
    replay: (r) => app.openBrowserReplay?.({ profileId: r.id }),
    // lane browser-admin 2a: Change build… — a Chromium profile's Chrome build (a running browser restarts; its
    // conversations are told; the dialog says so before the button)
    build: (r) => openBuildDialog(app, r.id, { label: String(r.label || r.id), onDone: () => load() }),
    // Rename… — validated like a new profile's name (unique, a human name, never a path)
    rename: async (r) => {
      const name = await showInputDialog({ title: t('Rename {label}', { label: String(r.label || r.id) }), label: t('Name'), value: String(r.label || ''), confirmText: t('Rename') });
      if (name === null || name === undefined || !String(name).trim() || String(name).trim() === String(r.label || '')) return;
      const res = await act(`/api/browser/profiles/${encodeURIComponent(r.id)}`, jsonInit('PATCH', { label: String(name).trim() }), t('Could not rename'));
      if (res) showToast(t('Renamed to {label}', { label: String(res.profile?.label || name) }), { duration: 4000 });
      load();
    },
    // lane H verify r5: a live NAMED profile's browser can be stopped here — the remedy the "keeps closing" notice names
    // (a Stop ends the record and its restart count); its logins stay in the profile, the next command starts it again
    stop: async (r) => { const res = await act(`/api/browser/profiles/${encodeURIComponent(r.id)}/stop`, jsonInit('POST'), t('Could not stop the browser')); if (res) showToast(t('Stopped {label}', { label: String(r.label || r.id) }), { duration: 4000 }); load(); },
    // lane browser-stuck: a page that does not respond — the user's Restart (never automatic)
    restart: async (r) => { const res = await act(`/api/browser/profiles/${encodeURIComponent(r.id)}/restart`, jsonInit('POST'), t('Could not restart the browser')); if (res) showToast(t('Restarted {label}', { label: String(r.label || r.id) }), { duration: 4000 }); load(); },
    // verify r2 (the builder's open question 2): a browser launched before the lane still accepts leave-page dialogs
    // itself until its next start — ONE click starts that next start (the same human Restart; its tabs close, logins stay)
    'restart-hold': async (r) => {
      const yes = await showConfirmDialog({ title: t('Restart {label}?', { label: String(r.label || r.id) }), message: t('Its open tabs close (logins in the profile stay). From its next start VibeSpace holds leave-page dialogs for a decision, so nothing typed on a page is lost without a word.'), confirmText: t('Restart') });
      if (!yes) return;
      const res = await act(`/api/browser/profiles/${encodeURIComponent(r.id)}/restart`, jsonInit('POST'), t('Could not restart the browser'));
      if (res) showToast(t('Restarted {label}', { label: String(r.label || r.id) }), { duration: 4000 });
      load();
    },
    // Delete… — the existing two steps (set aside now, "Delete permanently" below later), and it no longer waits for you to
    // detach anything: every conversation using it is told, loses it, and its pin is cleared (owner ruling A (6))
    delete: async (r) => {
      // verify r1 (H4): Delete… while he browses it himself is refused by name (the server too) — his Close / Quit first
      if (r.human) { showToast(humanRefusalText('browsing_yourself', { label: String(r.label || r.id) }, t), { type: 'warn', duration: 9000 }); return; }
      const users = usersOf(r);
      const names = users.map((u) => u.name).filter(Boolean);
      const warn = users.length ? t('{n} conversation(s) use it — they go back to a temporary browser.', { n: users.length }) + (names.length ? ' (' + names.slice(0, 8).join(', ') + ')' : '') + ' ' : '';
      // lane remote-profile-start: a paired machine's profile is deleted WITH its folder there (no set-aside on another machine) — said before the click
      const yes = await showConfirmDialog({ title: t('Delete {label}?', { label: String(r.label || r.id) }), message: warn + (r.host ? t('Its folder on {machine} is deleted with its logins — this cannot be undone.', { machine: String(r.host) }) : t('Its logins are kept aside under “Deleted profiles” until you press Delete permanently there.')), confirmText: t('Delete'), danger: users.length > 0 || !!r.host });
      if (!yes) return;
      const res = await act(`/api/browser/profiles/${encodeURIComponent(r.id)}/forget`, jsonInit('POST', { release: true, unpin: true }), t('Could not delete'));
      if (res && res.machine && res.machine.left) showToast(t('Deleted {label}, but its folder on {machine} was left there: {why}', { label: String(r.label || r.id), machine: String(res.machine.host || r.host || ''), why: String(res.machine.left) }), { type: 'warn', duration: 12000 });
      else if (res && res.machine) showToast(t('Deleted {label} and its folder on {machine}', { label: String(r.label || r.id), machine: String(res.machine.host || r.host || '') }), { duration: 7000 });
      else if (res) showToast(t('Deleted {label} — kept aside until you delete it permanently', { label: String(r.label || r.id) }) + (res.detached || res.unpinned ? ' · ' + t('{n} conversation(s) no longer use it', { n: Math.max(Number(res.detached) || 0, Number(res.unpinned) || 0) }) : ''), { duration: 7000 });
      load();
    },
  };
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
    if (e.live) usageLine(st, e.usage);
    displayLine(st, e.display);
    cell(row, 'bprof-age', e.startedAt ? t('started {ago}', { ago: agoText(Date.now() - Number(e.startedAt)) }) : '');
    const stop = el('button', 'file-tool-btn bprof-btn bprof-stop', t('Stop'));
    stop.disabled = !e.live;
    // lane browser-resume (§3.9): what a stop keeps is said from the kept fact (its logins + tabs, tabs only, or nothing)
    stop.title = !e.live ? t('Not running') : (e.kept && e.kept.kind === 'full' ? t('Stop this browser now — its logins and tabs are kept; the conversation\'s next command starts it again') : (e.kept ? t('Stop this browser now — its tabs are kept, a login in it is not; the conversation\'s next command starts it again') : t('Stop this browser now — the conversation\'s next command starts it again (a login in it is gone)')));
    stop.onclick = async () => { stop.disabled = true; const r = await act(`/api/browser/profiles/${encodeURIComponent(String(e.profileId || ''))}/stop`, jsonInit('POST'), t('Could not stop the browser')); if (r) showToast(t('Stopped {label}', { label: String(e.label || '') }), { duration: 4000 }); load(); };
    row.appendChild(stop);
    return row;
  }
  /** lane browser-resume (§3.9): why a kept browser stopped, in the device's words (the store's closed vocabulary). */
  const keptWhyText = (w) => ({ 'turn-idle': t('released after its turn'), idle: t('idled out'), heal: t('its browser was restarted'), restart: t('VibeSpace restarted'), 'conversation-gone': t('its session ended'), user: t('stopped by you'), agent: t('closed by the agent') }[w] || '');
  /** lane browser-resume (§3.9): ONE kept browser — a conversation's own browser's logins + tabs after it stopped. KEYED
   *  (by its browser key, rebuilt only when what it prints moved); Forget only on a stopped one (a running one says so). */
  const keptRows = new Map(); // browserKey → { row, sig }
  function keptRow(k) {
    const row = el('div', 'bprof-row bprof-kept');
    row.dataset.browserKey = String(k.browserKey || '');
    const ident = el('div', 'bprof-ident');
    ident.appendChild(el('span', 'bprof-label', String(k.label || k.browserKey || '')));
    if (k.kind !== 'full') { const c = el('span', 'bprof-chip', t('tabs only')); c.title = k.kind === 'fenced' ? t('tabs only — this conversation is fenced to allowed domains, its logins are not kept') : t('tabs only — this browser had no folder of its own, its logins are not kept'); ident.appendChild(c); }
    ident.title = String(k.browserKey || '');
    row.appendChild(ident);
    const tabs = Array.isArray(k.tabs) ? k.tabs : [];
    const tc0 = cell(row, 'bprof-kept-tabs', t('{n} tab(s)', { n: tabs.length }), tabs.map((x) => (x.active ? t('on show') + ': ' : '') + (x.title ? x.title + ' — ' : '') + x.url).join('\n'));
    tc0.dataset.tabs = String(tabs.length);
    cell(row, 'bprof-size', k.kind !== 'full' ? '' : (k.bytes === null || k.bytes === undefined ? t('not measured') : bytesText(k.bytes)));
    const state = k.live ? t('running') : [k.stoppedAt ? t('kept since {ago}', { ago: agoText(Date.now() - Number(k.stoppedAt)) }) : '', keptWhyText(k.stoppedWhy), k.restore && k.restore.mode === 'auto' ? t('its next start reopens its tabs') : ''].filter(Boolean).join(' · ');
    cell(row, 'bprof-state state-' + (k.live ? 'live' : 'kept'), state);
    // lane browser-resume B (§3.9, the owner's ruling 2): RESUME — only while a live session carries the key (the route
    // resolves that session; a stopped conversation's row says what to do instead: never a dead button)
    if (!k.live && k.carried) {
      const rs = el('button', 'file-tool-btn bprof-btn bprof-kept-resume', t('Resume'));
      rs.title = t('Reopen this browser with its last tabs');
      rs.onclick = async () => {
        rs.disabled = true;
        const res = await act(`/api/browser/kept/${encodeURIComponent(String(k.browserKey || ''))}/resume`, jsonInit('POST'), t('Could not resume the browser'));
        rs.disabled = false;
        if (res) {
          const n = Number(res.restored) || 0;
          showToast(res.already ? t('The browser is running — reconnecting') : n ? t('Resumed — {n} tab(s) reopened', { n }) : t('Resumed — the browser runs again'), { duration: 4000 });
          if (res.sessionId) { try { app.openBrowserLive?.({ sessionId: res.sessionId }); } catch { /* the live view is optional */ } }
        }
        load();
      };
      row.appendChild(rs);
    } else if (!k.live) row.appendChild(el('span', 'bprof-cell bprof-kept-resume-hint chat-status-dim', t('Resume the conversation to reopen its browser')));
    if (!k.live) {
      const fg = el('button', 'file-tool-btn bprof-btn bprof-kept-forget', t('Forget'));
      fg.title = t('Remove this browser\'s kept logins and tabs now');
      fg.onclick = async () => {
        const yes = await showConfirmDialog({ title: t('Forget this browser?'), message: t('Its logins and its {n} kept tab(s) are removed. The conversation\'s next browser command starts a fresh one.', { n: tabs.length }), confirmText: t('Forget'), danger: true });
        if (!yes) return;
        fg.disabled = true;
        const res = await act(`/api/browser/kept/${encodeURIComponent(String(k.browserKey || ''))}`, jsonInit('DELETE'), t('Could not forget the browser'));
        if (res) showToast(t('Forgotten {label}', { label: String(k.label || k.browserKey || '') }), { duration: 4000 });
        load();
      };
      row.appendChild(fg);
    } else row.appendChild(el('span', 'bprof-cell bprof-kept-live chat-status-dim', t('stop it to forget it')));
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
      const yes = await showConfirmDialog({ title: t('Set aside {name}?', { name: String(o.name || '') }), message: t('The directory is moved beside itself (…forgotten-<time>) and listed under “Deleted profiles (kept aside)” below. Nothing is deleted until you click Delete permanently.'), confirmText: t('Set aside') });
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
    const prof = section(t('Profiles'), '');
    // design 015 §2b: THE TABLE — one template; the column titles and every row are subgrids of it
    const table = el('div', 'bprof-table');
    const head = el('div', 'bprof-head');
    for (const h of [t('Profile'), t('State'), t('Who can use it'), t('Disk · records'), '']) head.appendChild(el('span', 'bprof-th', h));
    table.appendChild(head);
    const rows = v.profiles || [];
    if (!rows.length) prof.appendChild(el('div', 'bprof-empty chat-status-dim', t('No profiles yet — create one with New profile… above; an agent can make one too, or keep a conversation\'s browser from its session card.')));
    const seen = new Set();
    for (const r of rows) {
      seen.add(r.id);
      const sig = rowSig(r, v), had = rowsById.get(r.id);
      let row;
      if (had && had.sig === sig) { row = had.row; if (!r.legacy) whoCellFor(r.id).patch(r); }
      else { row = profileRow(r, v); rowsById.set(r.id, { row, sig }); }
      patchDisk(row, r);
      table.appendChild(row);
    }
    if (rows.length) prof.appendChild(table);
    for (const id of [...rowsById.keys()]) if (!seen.has(id)) { rowsById.delete(id); whoCells.delete(id); openFolds.delete(id); }
    // takeover C3: every conversation's managed ephemeral browser — watched like a profile, gone with its conversation
    // design 015 (a): the browsers without a profile — their records' count and size in this section's head (no pseudo-row)
    const et = v.ephemeral?.trace || { n: 0, bytes: 0 };
    const ephs = section(t('Ephemeral browsers'), t('one per conversation that browses without a profile — started by its first command, stopped after its idle timeout, removed with the conversation') + ' · ' + (et.n ? t('{n} action(s)', { n: et.n }) : t('no actions')) + ' · ' + t('{used} of {size}', { used: bytesText(Number(et.used) || 0), size: sizeText(Number(et.limit) || v?.limits?.bytesPerProfile || TRACE_BYTES_PER_PROFILE) }));
    fitsLine(ephs.firstChild, et);
    const erows = Array.isArray(v.ephemeralBrowsers) ? v.ephemeralBrowsers : [];
    if (!erows.length) ephs.appendChild(el('div', 'bprof-empty chat-status-dim', t('None — no conversation has browsed without a profile since its start.')));
    for (const e of erows) ephs.appendChild(ephemeralRow(e));
    // lane browser-resume (§3.9): the KEPT browsers — keyed rows (a broadcast never rebuilds a row whose words did not move)
    const kl = v.limits || {};
    const keptSec = section(t('Kept browsers'), kl.keptTotal ? t('Kept until the conversation ends or the kept browsers pass {size} (each at most {per})', { size: sizeText(kl.keptTotal), per: sizeText(kl.keptPerConversation || 0) }) + (kl.keptOn === false ? ' · ' + t('keeping is off (Settings → Agent browser)') : '') : '');
    // verify r2 (Y2): the kept sweep's report reaches the user, not only the journal — the total bound held open by
    // running conversations (never removed) is SAID here with what frees it (a per-row Forget); nothing to free is said too
    const ksw = v.keptSweep;
    if (ksw && Number(ksw.used) > Number(ksw.limit) && Array.isArray(ksw.reported)) {
      const held = ksw.reported.filter((r) => r && r.key && /conversation is running/.test(String(r.why || ''))).length;
      const p = { used: bytesText(Number(ksw.used) || 0), limit: sizeText(Number(ksw.limit) || 0), n: held };
      keptSec.appendChild(el('div', 'bprof-kept-report chat-status-dim', held ? t('{used} of {limit} kept — {n} kept browser(s) past the bound are held because their conversations run; Forget frees one', p) : t('{used} of {limit} kept — the running browsers alone pass the bound; nothing can be freed until one stops', p)));
    }
    const krows = Array.isArray(v.kept) ? v.kept : [];
    if (!krows.length) keptSec.appendChild(el('div', 'bprof-empty chat-status-dim', t('None — no conversation\'s browser has stopped with something to keep.')));
    const kseen = new Set();
    for (const k of krows) {
      kseen.add(k.browserKey);
      const sig = JSON.stringify([k, Math.floor((Date.now() - Number(k.stoppedAt || 0)) / 60000)]);
      const had = keptRows.get(k.browserKey);
      let row;
      if (had && had.sig === sig) row = had.row; else { row = keptRow(k); keptRows.set(k.browserKey, { row, sig }); }
      keptSec.appendChild(row);
    }
    for (const kk of [...keptRows.keys()]) if (!kseen.has(kk)) keptRows.delete(kk);
    // design 015 (d): the unregistered directories FOLD by default — the head says how many and how much; open, they
    // list by size (largest first), each with Adopt… / Set aside
    const ol = orphanOrder(v.orphans || []);
    const orph = section(t('Unregistered directories'), ol.length ? t('{n} director(ies) · {size}', { n: ol.length, size: bytesText(ol.reduce((s2, o) => s2 + (Number(o.bytes) || 0), 0)) }) : '');
    if (ol.length) {
      const oh = orph.firstChild; oh.classList.add('bprof-section-fold');
      const oc = el('button', 'bprof-chev'); oc.type = 'button'; oc.appendChild(chromeIcon('chevronRight', 12));
      oc.setAttribute('aria-expanded', String(!!st.orphansOpen)); oc.title = st.orphansOpen ? t('Hide details') : t('Show details');
      oh.prepend(oc); oh.classList.toggle('open', !!st.orphansOpen);
      oh.onclick = () => { st.orphansOpen = !st.orphansOpen; render(); };
    }
    if (v.orphansWhy) orph.appendChild(el('div', 'bprof-empty chat-status-dim', String(v.orphansWhy)));
    else if (!ol.length) orph.appendChild(el('div', 'bprof-empty chat-status-dim', t('None — every profile directory here is named by a record.')));
    else if (st.orphansOpen) {
      if (v.orphansBase) orph.appendChild(el('div', 'bprof-empty chat-status-dim', t('under {base} — a Chromium profile no record names; adopt the ones worth keeping, set the rest aside', { base: String(v.orphansBase) })));
      for (const o of ol) orph.appendChild(orphanRow(o));
    }
    const fg = section(t('Deleted profiles (kept aside)'), t('moved beside themselves, never deleted by a sweep — only by your click'));
    if (!(v.forgotten || []).length) fg.appendChild(el('div', 'bprof-empty chat-status-dim', t('Nothing set aside.')));
    for (const f of v.forgotten || []) fg.appendChild(forgottenRow(f));
    // design 015 (c): MAINTENANCE — the Browser CLI row, the last sweep + Sweep now, the retention text in full
    const mt = section(t('Maintenance'), '');
    const s = v.sweep;
    const swl = el('div', 'bprof-sweep');
    swl.append(el('span', 'chat-status-dim', s ? t('Last sweep {ago}: removed the frames of {n} action(s) ({bytes}) and {r} recording(s) ({rbytes}); every action list is kept.', { ago: agoText(Date.now() - Number(s.at || 0)), n: s.removed || 0, bytes: bytesText(s.bytesRemoved || 0), r: s.recordingsRemoved || 0, rbytes: bytesText(s.recordingBytesRemoved || 0) }) : t('No sweep has run yet (it runs at boot and every hour).')), sweepBtn);
    mt.append(cliRow, swl, hint);
    if (st.focus) focusRow(st.focus);
    layout();
  }
  /** design 015 §2b: what the CSS cannot know — the stacked re-flow when the grid's minimums plus the widest row's acts
   *  pass the list's width (a phone, a narrow window), and every line that folds by WIDTH (a row's chips past the
   *  browser chip into "+n"; the who chips into "+N more"). Run after each render and on every resize. */
  function layout() {
    const table = body.querySelector('.bprof-table');
    if (!table || !table.clientWidth) return;
    const actsPx = Math.max(0, ...[...table.querySelectorAll('.bprof-act')].map((a) => [...a.children].reduce((sum, c) => sum + Math.ceil(c.getBoundingClientRect().width), 0) + 6 * Math.max(0, a.children.length - 1)));
    root.classList.toggle('bprof-stacked', table.clientWidth < gridNeed(actsPx));
    for (const line of table.querySelectorAll('.bprof-profile .bprof-chips')) {
      const kids = [...line.children], tail = kids.pop();
      const folded = fitLine(line, kids.map((c) => ({ el: c, priority: c.dataset.key === 'browser' ? 0 : 1 })), tail, (n) => '+' + n);
      tail.style.display = folded.length ? '' : 'none';
      tail.textContent = folded.length ? '+' + folded.length : '';
      tail.title = folded.map((f) => f.el.textContent).join('\n');
    }
    for (const [, wc] of whoCells) wc.fit();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => layout()) : null;
  if (ro) ro.observe(body);
  function focusRow(profileId) {
    st.focus = null;
    const row = body.querySelector(`.bprof-profile[data-profile-id="${String(profileId).replace(/[^a-z0-9-]/gi, '')}"]`);
    if (row) { row.classList.add('focus'); row.scrollIntoView({ block: 'center' }); setTimeout(() => row.classList.remove('focus'), 2500); }
  }
  function renderCli() {
    const w = cliRowWords(st.cli, t);
    cliRow.style.display = w ? '' : 'none';
    if (!w) return;
    if (cliText.textContent !== w.text) cliText.textContent = w.text;
    cliText.title = w.title || '';
    cliRow.classList.toggle('warn', !!w.warn);
    const label = cliOfferLabel(w.offer, t, { version: w.version, table: st.cli && st.cli.table }); // verify r1 (F10): a named version by its number
    cliBtn.style.display = label ? '' : 'none';
    if (label && cliBtn.textContent !== label) cliBtn.textContent = label;
    cliBtn.dataset.offer = w.offer || '';
  }
  cliBtn.onclick = async () => {
    const offer = cliBtn.dataset.offer;
    const f = st.cli;
    if (!offer || !f) return;
    // the setting is THE choice (`browser.cli`): the keeper re-reads it on its next resolve of the CLI
    if (offer === 'use-path') { app.settings?.set?.('browser.cli', 'path'); showToast(t('VibeSpace drives the agent-browser on PATH from its next command.'), { duration: 6000 }); setTimeout(loadCli, 1500); return; }
    if (offer === 'use-pinned') { app.settings?.set?.('browser.cli', 'pinned'); showToast(t('VibeSpace drives its own agent-browser {version} from its next command.', { version: f.table }), { duration: 6000 }); setTimeout(loadCli, 1500); return; }
    const version = f.pinned && f.pinned.version ? f.pinned.version : f.table;
    if (!(await showConfirmDialog({ ...cliConfirmWords(f, t, { version }) }))) return;
    cliBtn.disabled = true;
    const r = await fetchJson('/api/browser/cli/install', jsonInit('POST', { version }));
    cliBtn.disabled = false;
    const o = cliOutcomeWords(r, t);
    showToast(o.text, { type: o.tone === 'error' ? 'error' : o.tone === 'warn' ? 'warn' : 'info', duration: 9000 });
    if (r && r.ok && !r.error && (f.choice || {}).mode === 'path') app.settings?.set?.('browser.cli', version === f.table ? 'pinned' : version);
    loadCli();
  };
  async function loadCli() {
    const c = await fetchJson('/api/browser/cli');
    if (st.closed) return;
    st.cli = c && !c.error ? c : null;
    renderCli();
  }
  async function load() {
    if (st.closed) return;
    loadCli();
    const r = await fetchJson('/api/browser/housekeeping');
    if (st.closed) return;
    if (!r || r.error) { st.error = (r && r.error) || t('server unreachable'); render(); return; }
    st.error = null; st.view = r; render();
  }
  const scheduleLoad = () => { if (st.timer) clearTimeout(st.timer); st.timer = setTimeout(() => { st.timer = null; load(); }, PANEL_REFRESH_DEBOUNCE_MS); };
  // (+ tasks-updated: a Task Group's title / membership on a "Who can use it" chip follows the store)
  const onGlobal = (m) => { if (st.closed || !m) return; if (m.type === 'browser-housekeeping-updated' || m.type === 'browser-profiles-updated' || m.type === 'browser-trace-appended' || m.type === 'tasks-updated' || m.type === 'browser-kept-updated') scheduleLoad(); }; // lane browser-resume: + the kept browsers
  app.ws?.onGlobal?.(onGlobal);
  sweepBtn.onclick = async () => { sweepBtn.disabled = true; const r = await act('/api/browser/housekeeping/sweep', jsonInit('POST'), t('Sweep failed')); sweepBtn.disabled = false; if (r) showToast(t('Sweep: removed the frames of {n} action(s) ({bytes}) and {r} recording(s) ({rbytes})', { n: r.removed || 0, bytes: bytesText(r.bytesRemoved || 0), r: r.recordingsRemoved || 0, rbytes: bytesText(r.recordingBytesRemoved || 0) }), { duration: 6000 }); load(); };
  refreshBtn.onclick = () => load();
  winInfo.onClose = () => { st.closed = true; if (st.timer) clearTimeout(st.timer); try { ro?.disconnect(); } catch { /* optional */ } try { app.ws?.offGlobal?.(onGlobal); } catch { /* optional */ } };
  winInfo._browserProfiles = { focusRow, load, layout, whoCell: (id) => whoCells.get(id) || null, keptRow: (bk) => (keptRows.get(bk) || {}).row || null, state: () => ({ error: st.error, profiles: (st.view?.profiles || []).length, orphans: (st.view?.orphans || []).length, forgotten: (st.view?.forgotten || []).length, kept: (st.view?.kept || []).map((k) => ({ browserKey: k.browserKey, tabs: (k.tabs || []).length, kind: k.kind, live: !!k.live })) }) };
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
