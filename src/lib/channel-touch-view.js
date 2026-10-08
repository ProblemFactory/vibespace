// FROM THE CHAT TO THE CONVERSATION — THE CLIENT HALF OF THE PASSIVE WITNESS
// (docs/design-communication-panel.zh.md §26, backlog B-099e; owner
// 2026-09-27 "那就按照这个做吧"). The server records every agent read /
// search / reply / compose of a channel conversation (src/server/
// channel-touches.js); this module draws it and decides nothing — every rule is
// PURE src/channel-touch.js:
//
//  ① THE CARD ROW (`createChannelTouchView(view)`, ONE per ChatView): the
//     session's ring is fetched ONCE (`GET /api/channel-touches`), grown by the
//     `channel-touch` broadcast (upsert by id — a merged touch comes back under
//     its id), and bound to the rendered tool cards by `bindToCall` (the call
//     running at the touch's instant; a command naming the conversation wins;
//     nothing running ⇒ the latest card when the view shows the tail). Each
//     card that holds touches gets ONE keyed `.chat-channel-touches` box (the
//     renderer's hidden holder on a `vibespace-channels` card, else created at
//     the card's end): one row per conversation — the vendor glyph, `account ›
//     title`, the words, a time — replied / composed first, three shown, the
//     rest behind "+N more". Rows are PATCHED IN PLACE by key (a broadcast
//     never re-creates a row — the live-card rule); a click opens the
//     conversation through the ONE door (`app.openChannel` — a window already
//     open is revealed), a composed message not yet sent opens the Outbox.
//     `observe(el)` is called from ChatView `_applyElementMarks` — the ONE hook
//     every element-making path passes (create / swap / gap) — so a rebuilt
//     history, a paged-in slab and a live card all get their rows.
//  ② THE CHIP: this turn's touches (at or after the turn's start — the
//     server's, or the newest live user message) → the status bar's keyed
//     `channels` chip ("Channels · <latest title>"), gone when a new turn
//     starts without touches.
//  ③ THE REVERSE LINK (`touchedByRow(app, winInfo, adapterId, convId)`): the
//     conversation window's "Drafted by <agent> · 3 min ago" chips, one per
//     live session, a click reveals that session's chat window.
//
// Every string here is a conversation title, an account label, a composed
// subject or a session name — vendor-, agent- or user-controlled, synced to
// every client — so it is drawn through textContent (channel-chrome's `el`);
// the ONLY innerHTML is the library's own SVG through `icon()`.
import { fetchJson, showToast } from './utils.js';
import { t } from './i18n.js';
import { icon, el } from './channel-chrome.js';
import { toolCommandText } from '../browser-trace.js';
import * as T from '../channel-touch.js';
import { showApiAccessDialog } from './channel-api-dialog.js';   // B-2198
import { chatApiCards } from './channel-api-card-view.js';   // B-2198 part 2: the proposal's card at its call row


const REBIND_MS = 80;
const REFETCH_MS = 250;
const clock = (at) => { const d = new Date(Number(at) || 0); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** The ONE way a touched conversation is opened (the card row, the chip's menu). The verdict is PURE
 *  (T.openVerdict): an agent's SEARCH row opens the search results scoped to that conversation — the agent's query,
 *  its hits (lane channel-search-view, .212; the owner 2026-10-04: a click opened the first hit's conversation, the
 *  hits were nowhere to be seen); a read / a reply opens the conversation; a composed message not yet sent the Outbox. */
export function openTouchRow(app, row) {
  if (!app || !row) return;
  if (row.ops && row.ops.api) { showApiAccessDialog(app, row.adapterId); return; }   // B-2198: a raw API call row opens its credential's API access (the waiting card, the log)
  const v = T.openVerdict(row);
  if (v.open === 'search' && typeof app.openChannelSearch === 'function') app.openChannelSearch({ adapterIds: [v.adapterId], q: v.query, convId: v.convId, convTitle: v.title, hits: v.hits, memo: v.memo, searchedAt: v.searchedAt });
  else if (v.open !== 'outbox') app.openChannel(v.adapterId, v.convId);
  else if (typeof app.openChannelOutbox === 'function') app.openChannelOutbox();   // a composed message has no conversation until it is sent
}

/** What a card's call RAN (its command, or an agent call's prompt) — the evidence `bindToCall` prefers. */
function callText(cardEl) {
  const m = cardEl && cardEl._rawMsg;
  const b = m && m.content && m.content[0];
  const input = b && b.input;
  if (!input || typeof input !== 'object') return '';
  return toolCommandText(input) || String(input.prompt || input.description || '');
}

export function createChannelTouchView(view) {
  const sid = String(view.sessionId || '');
  const live = !!sid && !sid.startsWith('view-') && !sid.startsWith('sub-');
  const st = { touches: [], loaded: !live, loading: null, turnAtServer: 0, turnAtLocal: 0, timer: null, refetch: null, disposed: false, chipKey: '', lastByCall: {} };

  async function load() {
    if (!live || st.disposed) return;
    const r = await fetchJson(`/api/channel-touches?sessionId=${encodeURIComponent(sid)}`);
    if (st.disposed) return;
    st.loaded = true;
    if (!r || r.error) { console.warn('[channel-touches] the touches could not be read:', r && r.error); return; }
    // union by id: a broadcast that crossed this answer on the other channel is kept
    const byId = new Map((r.touches || []).map((x) => [x.id, x]));
    for (const x of st.touches) if (x && x.id && !byId.has(x.id)) byId.set(x.id, x);
    st.touches = [...byId.values()].sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
    st.turnAtServer = Math.max(st.turnAtServer, Number(r.turnAt) || 0);
    schedule();
  }
  function ensureLoaded() {
    if (st.loaded || st.loading) return;
    st.loading = load().finally(() => { st.loading = null; });
  }
  function schedule() {
    if (st.disposed || st.timer) return;
    st.timer = setTimeout(() => { st.timer = null; rebind(); }, REBIND_MS);
  }
  /** Every rendered tool card as a call: its instant, the next non-tool message's instant, what it ran. */
  function callsOf(list) {
    const cards = [...list.querySelectorAll('.chat-msg[data-tool-id]')];
    return cards.map((c) => {
      const start = Number(c.dataset.ts) || 0;
      let end = null;
      for (let n = c.nextElementSibling; n; n = n.nextElementSibling) {
        if (!n.classList || !n.classList.contains('chat-msg') || n.dataset.toolId) continue;
        const v = Number(n.dataset.ts);
        if (v > start) { end = v; break; }
      }
      return { id: c.dataset.toolId, start, end, text: callText(c), el: c };
    });
  }
  function rebind() {
    if (st.disposed) return;
    const list = view._messageList;
    if (list && st.touches.length) {
      const calls = callsOf(list);
      const tail = !view._teleported && !(view._windowEnd < view._total);
      const { byCall } = T.bindToCall(st.touches, calls, { tail });
      st.lastByCall = byCall;
      let flipped = false;
      for (const c of calls) {
        const mine = byCall[c.id];
        const had = c.el.classList.contains('chat-channel-touched');
        if (mine && mine.length) renderBox(c.el, mine);
        else clearBox(c.el);
        if (had !== c.el.classList.contains('chat-channel-touched')) flipped = true;
      }
      // a card that gained / lost rows leaves / joins the fold (ChatView's run pass keeps a touched card inline —
      // the image-member rule); the pass only watches the list's children, so it is asked here
      if (flipped && typeof view._updateRuns === 'function') view._updateRuns();
    }
    updateChip();
  }
  function boxOf(cardEl, create) {
    let box = cardEl.querySelector('.chat-channel-touches');
    if (!box && create) {
      box = document.createElement('div');
      box.className = 'chat-channel-touches';
      (cardEl.querySelector('.chat-tool-use') || cardEl.querySelector('.chat-compact-content') || cardEl).appendChild(box);
    }
    return box;
  }
  function clearBox(cardEl) {
    cardEl.classList.remove('chat-channel-touched');
    const box = boxOf(cardEl, false);
    if (box && !box.hidden) { box.hidden = true; box.replaceChildren(); }
    chatApiCards(null, cardEl, []);
  }
  /** ONE box per card, rows KEYED by conversation and patched in place. */
  function renderBox(cardEl, touches) {
    const box = boxOf(cardEl, true);
    box.hidden = false;
    cardEl.classList.add('chat-channel-touched');   // stays visible inside a folded run (ChatView _updateRuns)
    box.setAttribute('aria-label', t('Channel conversations this call read or drafted'));
    const rows = T.foldTouches(touches);
    const expanded = box.dataset.expanded === '1';
    const { shown, hidden } = T.foldView(rows, { expanded });
    const have = new Map([...box.querySelectorAll(':scope > .chat-channel-touch')].map((e) => [e.dataset.key, e]));
    let i = 0;
    for (const r of shown) {
      let rowEl = have.get(r.key);
      if (!rowEl) {
        rowEl = document.createElement('button');
        rowEl.type = 'button';
        rowEl.className = 'chat-channel-touch';
        rowEl.dataset.key = r.key;
        const g = el('span', 'cct-glyph'); g.dataset.glyph = '';
        rowEl.append(g, el('span', 'cct-name', ''), el('span', 'cct-words chat-status-dim', ''), el('span', 'cct-time chat-status-dim', ''));
        rowEl.addEventListener('click', (ev) => { ev.stopPropagation(); openTouchRow(view.app, rowEl._row); });
      }
      rowEl._row = r;
      const verdict = T.openVerdict(r).open;
      const tip = r.ops && r.ops.api ? t('Open API access and its log') : verdict === 'search' ? t('Show the search results') : verdict === 'outbox' ? t('Not sent yet — open the Outbox') : t('Open this conversation');   // B-2198: a raw API call row opens its credential's API access
      if (rowEl.title !== tip) rowEl.title = tip;
      const glyph = T.glyphFor(r.icon);
      const g = rowEl.querySelector('.cct-glyph');
      if (g.dataset.glyph !== glyph) { g.replaceChildren(icon(glyph, 12)); g.dataset.glyph = glyph; }
      const set = (sel, text) => { const n = rowEl.querySelector(sel); if (n.textContent !== text) n.textContent = text; };
      set('.cct-name', T.rowName(r));
      set('.cct-words', T.rowWords(r, t));
      set('.cct-time', clock(r.last));
      rowEl.classList.toggle('drafted', T.DRAFT_OPS.some((o) => r.ops[o] > 0));
      if (box.children[i] !== rowEl) box.insertBefore(rowEl, box.children[i] || null);
      have.delete(r.key);
      i++;
    }
    for (const gone of have.values()) gone.remove();
    // the fold: "+N more" / "Show less", one keyed control after the rows
    let more = box.querySelector(':scope > .chat-channel-touches-more');
    if (rows.length > T.FOLD_SHOWN) {
      if (!more) {
        more = document.createElement('button');
        more.type = 'button';
        more.className = 'chat-channel-touches-more chat-status-dim';
        more.addEventListener('click', (ev) => {
          ev.stopPropagation();
          // .212: the tail of ONE search's rows is that search, unscoped (every conversation, grouped) — not more rows
          const tv = box.dataset.expanded === '1' ? { open: 'expand' } : T.tailVerdict(more._rows || []);
          if (tv.open === 'search-all' && typeof view.app?.openChannelSearch === 'function') { view.app.openChannelSearch({ adapterIds: tv.adapterIds, q: tv.query, group: true, memo: tv.memo || null, searchedAt: tv.searchedAt || 0 }); return; }
          box.dataset.expanded = box.dataset.expanded === '1' ? '0' : '1'; rebind();
        });
      }
      more._rows = rows;
      const text = expanded ? t('Show less') : t('+{n} more', { n: hidden });
      if (more.textContent !== text) more.textContent = text;
      const moreTip = !expanded && T.tailVerdict(rows).open === 'search-all' ? t('Show every conversation this search found') : '';
      if (more.title !== moreTip) more.title = moreTip;
      if (box.lastElementChild !== more) box.appendChild(more);
    } else if (more) more.remove();
    chatApiCards(view.app, cardEl, rows.filter((r) => r.ops && r.ops.api && r.proposalId).map((r) => r.proposalId));
  }
  function turnAt() { return Math.max(st.turnAtServer, st.turnAtLocal); }
  function updateChip() {
    const v = T.chipView(st.touches, turnAt());
    const key = v ? JSON.stringify([v.latest.key, v.latest.title, v.rows.map((r) => [r.key, r.title, r.account, r.last, r.ops])]) : '';
    if (key === st.chipKey) return;
    st.chipKey = key;
    view._statusBar?.setChannelTouches?.(v);
  }

  function observe(root) {
    if (st.disposed || !root) return;
    ensureLoaded();
    // a card RE-MADE for a message whose rows were already bound (a tool completion's swap, a page-in) gets them
    // at once — before the fold pass's frame, so it never folds and un-folds; the debounced rebind confirms
    const id = root.dataset && root.dataset.toolId;
    const had = id ? st.lastByCall[id] : null;
    if (had && had.length) renderBox(root, had);
    if (st.touches.length) schedule();
  }
  /** `channel-touch` for this session: upsert, then rebind (debounced). */
  function onTouch(msg) {
    if (st.disposed || !msg || msg.sessionId !== sid) return;
    for (const x of Array.isArray(msg.touches) ? msg.touches : []) if (x && x.id) T.upsertTouch(st.touches, x);
    st.turnAtServer = Math.max(st.turnAtServer, Number(msg.turnAt) || 0);
    schedule();
  }
  /** Every attach (a reconnect, a restarted server): read the ring again — it is the server's, and it survived. */
  function onAttached() {
    if (!live || st.disposed) return;
    if (st.refetch) clearTimeout(st.refetch);
    st.refetch = setTimeout(() => { st.refetch = null; st.loaded = false; ensureLoaded(); }, REFETCH_MS);
  }
  /** A live user message = a new turn: the chip keeps only what this turn touches. */
  function noteTurn(ts) {
    const v = Number(ts) || 0;
    if (v <= st.turnAtLocal) return;
    st.turnAtLocal = v;
    updateChip();
  }
  function dispose() {
    st.disposed = true;
    if (st.timer) clearTimeout(st.timer);
    if (st.refetch) clearTimeout(st.refetch);
  }
  return { observe, onTouch, onAttached, noteTurn, dispose, rebind, state: () => ({ touches: st.touches.length, loaded: st.loaded, turnAt: turnAt(), chip: st.chipKey }) };
}

// ── ③ THE REVERSE LINK ────────────────────────────────────────────────────
const TOUCHED_BY = new WeakMap();   // winInfo → its row (created ONCE per window; the bar re-appends the same node)
/**
 * The conversation window's "Read by / Drafted by <agent> · <ago>" chips: ONE
 * element per window, created on the first call and returned by every later
 * one (the window's bar is rebuilt on every repaint; the node moves, its chips
 * are patched in place). It reads `GET /api/channels/:a/:c/touches` and again
 * on a `channel-touch` naming this conversation; a click reveals the session's
 * chat window (`app.attachSession` — `_focusExistingSession` is the door).
 */
export function touchedByRow(app, winInfo, adapterId, convId) {
  const had = TOUCHED_BY.get(winInfo);
  if (had) return had.el;
  const key = `${adapterId}/${convId}`;
  const row = el('div', 'chanwin-touched');
  row.hidden = true;
  const st = { timer: null, list: [], disposed: false };
  async function load() {
    const r = await fetchJson(`/api/channels/${encodeURIComponent(adapterId)}/${encodeURIComponent(convId)}/touches`);
    if (st.disposed) return;
    if (!r || r.error) { console.warn('[channel-touches] who touched this conversation could not be read:', r && r.error); return; }
    st.list = Array.isArray(r.touches) ? r.touches.slice(0, 3) : [];
    paint();
  }
  function paint() {
    const have = new Map([...row.children].map((c) => [c.dataset.session, c]));
    const now = Date.now();
    let i = 0;
    for (const s of st.list) {
      let chip = have.get(s.sessionId);
      if (!chip) {
        chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chanwin-touched-chip';
        chip.dataset.session = s.sessionId;
        chip.title = t('Open that agent’s chat');
        chip.append(icon('robot', 11), el('span', 'chanwin-touched-text', ''));
        chip.addEventListener('click', (ev) => { ev.stopPropagation(); openSessionOf(app, chip.dataset.session); });
      }
      const text = T.touchedByWords(s, t, now);
      const tx = chip.querySelector('.chanwin-touched-text');
      if (tx.textContent !== text) tx.textContent = text;
      chip.classList.toggle('drafted', T.DRAFT_OPS.includes(s.op));
      if (row.children[i] !== chip) row.insertBefore(chip, row.children[i] || null);
      have.delete(s.sessionId);
      i++;
    }
    for (const gone of have.values()) gone.remove();
    row.hidden = !st.list.length;
  }
  const onMsg = (msg) => {
    if (!msg || msg.type !== 'channel-touch' || !Array.isArray(msg.touches)) return;
    if (!msg.touches.some((x) => x && T.touchKey(x) === key)) return;
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(() => { st.timer = null; load(); }, REFETCH_MS);
  };
  app.ws.onGlobal(onMsg);
  const tick = setInterval(() => { if (st.list.length) paint(); }, 60e3);   // "3 min ago" moves
  winInfo._listenerCtl?.signal.addEventListener('abort', () => { st.disposed = true; clearInterval(tick); if (st.timer) clearTimeout(st.timer); try { app.ws.offGlobal(onMsg); } catch {} TOUCHED_BY.delete(winInfo); });
  TOUCHED_BY.set(winInfo, { el: row });
  load();
  return row;
}

/** Reveal (or attach) a live session's chat window by its webui id; a session that ended says so. */
export function openSessionOf(app, sessionId) {
  const s = (app.sidebar?._webuiSessions || []).find((x) => x && x.id === sessionId);
  if (!s) { showToast(t('That agent session is no longer running'), { type: 'warn' }); return; }
  app.attachSession(s.id, s.name, s.cwd, { mode: s.mode || 'chat', backend: s.backend || 'claude', backendSessionId: s.backendSessionId || s.claudeSessionId || undefined });
}
