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
//     lane touch-chip-cause (the owner 2026-10-28, 「这个展开方式对吗？」): a row
//     hangs on the act that CAUSED it — a call is a candidate only when it could
//     have run the channels CLI (PURE callCauses); a touch no rendered call could
//     have caused hangs on the turn's VibeSpace NOTE row («VibeSpace gave the
//     assistant its task context»), which draws the SAME keyed box. In a closed
//     run's one-line strip a chip never goes below its READABLE MINIMUM (glyph +
//     account + 12 characters of the title, measured): what does not fit folds
//     into "+N more", and "+N more" expands into ROWS — one ResizeObserver per
//     view re-fits a strip when its width changes. A lone call that could have
//     run the CLI (a script, an interpreter, a helper by its TOOL NAME) is the
//     cause; a call's text is its command read through agentCommandText (a
//     codex argv is its `-c` script) and the binder hears whether its work
//     outlives the card (`run_in_background`, the task notification's end); a
//     turn is the normalizer's (T.opensTurn over each record: a steer or a hub
//     card that entered a running turn never starts one; a note row starts one
//     only when it is the turn's first record); every width is measured in CSS
//     px (a rect ÷ the zoom it is drawn at — the UI scale × the chat's font
//     scale); the fold control is never clipped (chip 0 gives its name first).
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
import { agentCommandText } from '../agent-tool-rules.js';   // r3: THE unwrapper — codex's argv `["bash","-lc","…"]` is its script, never a re-joined string
import * as T from '../channel-touch.js';
import { showApiAccessDialog } from './channel-api-dialog.js';   // B-2198
import { chatApiCards } from './channel-api-card-view.js';   // B-2198 part 2: the proposal's card at its call row
import { chatProposalCards, refreshChatProposals } from './channel-outbox.js';   // lane chat-proposal-card: a reply / compose / react / recall's card at its call row — the Outbox's own card


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
  else if (v.open === 'connect') { if (typeof app.openChannelConnect === 'function') app.openChannelConnect(v.kind); }   // lane pod-oauth-callback: the agent's «Connect <type>» — the Connect dialog on that type
  else if (v.open !== 'outbox') app.openChannel(v.adapterId, v.convId);
  else if (typeof app.openChannelOutbox === 'function') app.openChannelOutbox();   // a composed message has no conversation until it is sent
}

/** lane touch-chip-cause: what a card's call IS for the cause rule (PURE T.callKindOf): a `command` (a shell call), a
 *  `helper` BY ITS TOOL NAME (T.HELPER_TOOLS — Agent / Task, codex's Sub-agent card; r2: never by a `prompt` field — a
 *  WebFetch carries one), anything else. */
function callKind(cardEl) {
  const m = cardEl && cardEl._rawMsg;
  const b = m && m.content && m.content[0];
  const input = b && b.input;
  return T.callKindOf({ name: (b && (b.toolName || b.name)) || (m && m.toolName) || '', collapseKind: m && m.collapseKind, command: input && typeof input === 'object' ? agentCommandText(input) : '' });
}
/** A VibeSpace note row's key (its message id — never a tool id). */
const noteKey = (n) => (n && n.dataset && n.dataset.msgId ? `note:${n.dataset.msgId}` : '');
const isNote = (n) => !!(n && n.classList && n.classList.contains('chat-vs-note'));

/** What a card's call RAN (its command — an argv's script, read from the argv — or an agent call's prompt) — the evidence
 *  `bindToCall` prefers. */
function callText(cardEl) {
  const m = cardEl && cardEl._rawMsg;
  const b = m && m.content && m.content[0];
  const input = b && b.input;
  if (!input || typeof input !== 'object') return '';
  return agentCommandText(input) || String(input.prompt || input.description || '');
}
/** r3: does a card's work OUTLIVE the card (Bash / an Agent with `run_in_background`)? — and the instant its end was seen
 *  (the task notification that names it closes the card's task: `taskInfo.endedAt`), 0 while unseen. */
function callBackground(cardEl) {
  const m = cardEl && cardEl._rawMsg;
  const input = m && m.content && m.content[0] && m.content[0].input;
  const ti = m && m.taskInfo;
  return { background: !!(input && typeof input === 'object' && input.run_in_background === true), bgEnd: ti && ti.status !== 'running' ? Number(ti.endedAt) || 0 : 0 };
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
      return { id: c.dataset.toolId, start, end, text: callText(c), kind: callKind(c), ...callBackground(c), el: c };
    });
  }
  /** lane touch-chip-cause: the VibeSpace note rows (where a touch no call caused hangs) and the instants TURNS start (a
   *  note of an earlier turn never takes a later turn's touch). r2: a turn is the TRANSCRIPT's (PURE T.opensTurn over
   *  each record and the one before it — the person's message, a wake, a peer message, a task notification), never the
   *  CSS class of a user bubble: a steer typed mid-turn belongs to its turn. */
  function notesOf(list) {
    return [...list.querySelectorAll('.chat-msg.chat-vs-note')].map((n) => ({ id: noteKey(n), at: Number(n.dataset.ts) || 0, el: n })).filter((n) => n.id && n.at > 0);
  }
  function turnsOf(list) {
    const out = [];
    let prev = null;
    // the RECORD each element draws, read through the view's own message list (a card drawn from its text alone — the
    // task-notification wake — carries a stand-in `_rawMsg` with no turn); `_rawMsg` only where the list has none
    const byId = new Map((Array.isArray(view._messages) ? view._messages : []).map((x) => [x && x.id, x]));
    for (const el of list.children) {
      if (!el.classList || !el.classList.contains('chat-msg')) continue;
      const m = (el.dataset.msgId && byId.get(el.dataset.msgId)) || el._rawMsg;
      if (!m) continue;
      // a note row opens a turn only when it is the turn's FIRST record (r3: `turnStart` — a held message's delivery)
      if ((!isNote(el) || m.turnStart === true) && T.opensTurn(m, prev)) { const v = Number(el.dataset.ts) || 0; if (v > 0) out.push(v); }
      prev = m;
    }
    return out;
  }
  function rebind() {
    if (st.disposed) return;
    const list = view._messageList;
    if (list && st.touches.length) {
      const calls = callsOf(list), notes = notesOf(list);
      const tail = !view._teleported && !(view._windowEnd < view._total);
      const { byCall, byNote } = T.bindToCall(st.touches, calls, { tail, notes, turns: turnsOf(list) });
      const bound = { ...byCall, ...byNote };
      st.lastByCall = bound;
      let flipped = false;
      for (const c of [...calls, ...notes]) {
        const mine = bound[c.id];
        const had = c.el.classList.contains('chat-channel-touched');
        if (mine && mine.length) renderBox(c.el, mine);
        else clearBox(c.el);
        if (had !== c.el.classList.contains('chat-channel-touched')) flipped = true;
      }
      // a card that gained / lost rows leaves / joins the fold (ChatView's run pass keeps a touched card inline —
      // the image-member rule); the pass only watches the list's children, so it is asked here
      if (flipped && typeof view._updateRuns === 'function') view._updateRuns();
      sweepBoxes();
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
    chatProposalCards(null, cardEl, []);
  }
  /** ONE box per card, rows KEYED by conversation and patched in place. */
  function renderBox(cardEl, touches) {
    const box = boxOf(cardEl, true);
    box.hidden = false;
    cardEl.classList.add('chat-channel-touched');   // stays visible inside a folded run (ChatView _updateRuns)
    box.setAttribute('aria-label', isNote(cardEl) ? t('Channel conversations of this turn that no call shown here ran') : t('Channel conversations this call read or drafted'));
    const rows = T.foldTouches(touches);
    const expanded = box.dataset.expanded === '1';
    const { shown } = T.foldView(rows, { expanded });
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
      const tip = r.ops && r.ops.api ? t('Open API access and its log') : verdict === 'connect' ? t('Sign in — the Connect dialog opens on this account type') : verdict === 'search' ? t('Show the search results') : verdict === 'outbox' ? t('Not sent yet — open the Outbox') : t('Open this conversation');   // B-2198: a raw API call row opens its credential's API access
      if (rowEl.title !== tip) rowEl.title = tip;
      const glyph = T.glyphFor(r.icon);
      const g = rowEl.querySelector('.cct-glyph');
      if (g.dataset.glyph !== glyph) { g.replaceChildren(icon(glyph, 12)); g.dataset.glyph = glyph; }
      const set = (sel, text) => { const n = rowEl.querySelector(sel); if (n.textContent !== text) n.textContent = text; };
      set('.cct-name', T.rowName(r));
      set('.cct-words', T.rowWords(r, t));
      set('.cct-time', clock(r.last));
      rowEl.classList.toggle('drafted', T.DRAFT_OPS.some((o) => r.ops[o] > 0));
      rowEl.classList.toggle('connect', verdict === 'connect');   // lane pod-oauth-callback: the Connect card wears the accent
      if (box.children[i] !== rowEl) box.insertBefore(rowEl, box.children[i] || null);
      have.delete(r.key);
      i++;
    }
    for (const gone of have.values()) gone.remove();
    // the fold: "+N more" / "Show less", one keyed control after the rows — its count is the fit's (fitStrip)
    box._rows = rows;
    fitStrip(box);
    watchBox(box);
    chatApiCards(view.app, cardEl, rows.filter((r) => r.ops && r.ops.api && r.proposalId).map((r) => r.proposalId));
    // lane chat-proposal-card: the proposals THIS call filed — the card after the rows, a chip on its row; a decision
    // moves the run fold's count («· 1 条提案待批准»), so the ChatView re-words its heads
    chatProposalCards(view.app, cardEl, T.filedProposals(touches), { onCount: () => { if (typeof view._updateRuns === 'function') view._updateRuns(); } });
  }
  /** The box's ONE "+N more" / "Show less" control (created on demand, keyed by its class; its click reads the box). */
  function moreOf(box, create) {
    let more = box.querySelector(':scope > .chat-channel-touches-more');
    if (!more && create) {
      more = document.createElement('button');
      more.type = 'button';
      more.className = 'chat-channel-touches-more chat-status-dim';
      more.addEventListener('click', (ev) => {
        ev.stopPropagation();
        // .212: the tail of ONE search's rows is that search, unscoped (every conversation, grouped) — not more rows
        const tv = box.dataset.expanded === '1' ? { open: 'expand' } : T.tailVerdict(more._rows || [], { max: more._shown ?? T.FOLD_SHOWN });
        if (tv.open === 'search-all' && typeof view.app?.openChannelSearch === 'function') { view.app.openChannelSearch({ adapterIds: tv.adapterIds, q: tv.query, group: true, memo: tv.memo || null, searchedAt: tv.searchedAt || 0 }); return; }
        box.dataset.expanded = box.dataset.expanded === '1' ? '0' : '1'; rebind();
      });
    }
    return more;
  }
  /** Say the fold: `shown` chips are on screen, the rest are "+N more" (or "Show less" while expanded). A box with no
   *  hidden row and no expansion has no control at all (three rows need no fold). */
  function setMore(box, rows, shown) {
    const expanded = box.dataset.expanded === '1';
    const hidden = Math.max(0, rows.length - shown);
    const more = moreOf(box, expanded || hidden > 0);
    if (!more) return;
    if (!expanded && !hidden) { more.remove(); return; }
    more._rows = rows;
    more._shown = shown;
    const text = expanded ? t('Show less') : t('+{n} more', { n: hidden });
    if (more.textContent !== text) more.textContent = text;
    const moreTip = !expanded && T.tailVerdict(rows, { max: shown }).open === 'search-all' ? t('Show every conversation this search found') : '';
    if (more.title !== moreTip) more.title = moreTip;
    if (box.lastElementChild !== more) box.appendChild(more);
  }
  /** The ZOOM the box is drawn at (the UI scale × the chat's font scale): a rect is ON-SCREEN px, a CSS width is not —
   *  measured as the on-screen width of a 1000 CSS px ruler in the box's own tree (the codebase's uiScale rule for
   *  viewport → CSS px, with the list's zoom in it). */
  function zoomOf(ruler) {
    ruler.textContent = '';
    ruler.style.width = '1000px';
    const z = ruler.getBoundingClientRect().width / 1000;
    ruler.style.width = '';
    return z > 0 ? z : 1;
  }
  /** A chip's MINIMUM (CSS px) keeping `cut` UTF-16 units of its name (+ the «…» a longer name is cut with): from its
   *  left edge to the end of that prefix, laid out by `ruler` in the name's own font, + the gap before its words, its
   *  right padding and border. Every rect is divided by `z` — ONE unit (r2: on-screen px added to CSS px gave 129 px
   *  for a 156 px minimum at 80 %). 0 when it cannot be measured (the CSS floor stands). */
  function minFor(chip, ruler, z, cut) {
    const name = chip.querySelector('.cct-name');
    if (!name || !ruler || !chip._row) return 0;
    const text = name.textContent || '';
    const n = Math.min(text.length, cut);
    const cs = getComputedStyle(chip), ns = getComputedStyle(name);
    for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing']) ruler.style[p] = ns[p];
    ruler.textContent = text.slice(0, n) + (n < text.length ? '…' : '');
    const w = ruler.getBoundingClientRect().width / z;
    const left = (name.getBoundingClientRect().left - chip.getBoundingClientRect().left) / z;
    const words = chip.querySelector('.cct-words');
    const gap = words && getComputedStyle(words).display !== 'none' ? parseFloat(cs.columnGap) || 0 : 0;
    return Math.ceil(left + w + gap + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderRightWidth) || 0) + 1);
  }
  /** A chip's READABLE MINIMUM: the account whole + 12 code points of the title (T.readableCut). */
  const readableMin = (chip, ruler, z) => minFor(chip, ruler, z, T.readableCut(chip._row));
  /**
   * A STRIP NEVER SQUEEZES A CHIP UNREADABLE (lane touch-chip-cause — the owner's screenshot: «+14 more» pressed, ten
   * chips squeezed to «Lar…» / «Gm…» on one line). While the card is COMPACT (a closed run's one line) and the box is
   * not expanded, every chip's min-width is its measured readable minimum; the chips that fit the box beside the fold
   * stay, the rest join "+N more" (always at least one chip — the box drops under its head, the card's flex-wrap, when
   * one readable chip and the fold do not fit beside it). Expanded, or not compact, the rows are ROWS (CSS) and every
   * inline width this pass set is cleared. Re-run on every render and on every width change (the view's ONE observer).
   * r2: every width in CSS px (zoomOf); THE FOLD CONTROL IS NEVER CLIPPED — when chip 0's readable minimum and the
   * control do not fit the line, chip 0 gives its name down to T.tightCut (the glyph + 6 characters + «…»; a long
   * account label at phone width) before the control leaves the box.
   */
  function fitStrip(box) {
    const chips = [...box.querySelectorAll(':scope > .chat-channel-touch')];
    const rows = box._rows || [];
    const card = box.closest('.chat-msg');
    const strip = !!card && card.classList.contains('chat-channel-compact') && box.dataset.expanded !== '1';
    if (!strip) {
      for (const c of chips) { if (c.hidden) c.hidden = false; if (c.style.minWidth) c.style.minWidth = ''; }
      if (box.style.minWidth) box.style.minWidth = '';
      setMore(box, rows, chips.length);
      return;
    }
    if (!box.getClientRects().length) { setMore(box, rows, chips.length); return; }   // not laid out: the observer fits it when it is
    for (const c of chips) if (c.hidden) c.hidden = false;
    // ONE ruler for this fit: a hidden span laid out like the name (the browser's own shaping — CJK, a fallback font) IN
    // THE BOX'S OWN TREE (its zoom is the names' zoom), out of the flow, gone after
    const ruler = document.createElement('span');
    ruler.style.cssText = 'position:absolute;left:0;top:0;display:inline-block;visibility:hidden;white-space:pre;pointer-events:none';
    box.appendChild(ruler);
    const z = zoomOf(ruler);
    const mins = chips.map((c) => readableMin(c, ruler, z));
    const tight0 = chips.length ? minFor(chips[0], ruler, z, T.tightCut(chips[0]._row)) : 0;
    ruler.remove();
    const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
    // the fold's widest words: one chip shown, the rest behind it
    let moreW = 0;
    if (rows.length > 1) {
      const more = moreOf(box, true);
      const keep = more.textContent;
      more.textContent = t('+{n} more', { n: rows.length - 1 });
      if (box.lastElementChild !== more) box.appendChild(more);
      moreW = Math.ceil(more.getBoundingClientRect().width / z);
      more.textContent = keep;
    }
    const line = box.parentElement;
    const ls = line ? getComputedStyle(line) : null;
    const lineW = line ? Math.max(0, line.clientWidth - (parseFloat(ls.paddingLeft) || 0) - (parseFloat(ls.paddingRight) || 0)) : 0;
    const tail = rows.length > 1 ? gap + moreW : 0;
    // the control has priority over chip 0: its name gives way down to the tight cut before the control leaves the line
    if (lineW && mins[0] && mins[0] + tail > lineW) mins[0] = Math.max(Math.min(tight0 || mins[0], mins[0]), Math.floor(lineW - tail));
    chips.forEach((c, i) => { const v = mins[i] ? `${mins[i]}px` : ''; if (c.style.minWidth !== v) c.style.minWidth = v; });
    const floor = Math.ceil((mins[0] || 0) + tail);
    const bm = floor > 0 ? `${lineW ? Math.min(floor, lineW) : floor}px` : '';
    if (box.style.minWidth !== bm) box.style.minWidth = bm;
    const avail = box.clientWidth;
    let k = 0, used = 0;
    for (; k < chips.length; k++) {
      const w = used + (k ? gap : 0) + (mins[k] || 0);
      if (k > 0 && w + (rows.length > k + 1 ? gap + moreW : 0) > avail) break;
      used = w;
    }
    chips.forEach((c, i) => { const h = i >= k; if (c.hidden !== h) c.hidden = h; });
    setMore(box, rows, k);
  }
  // ONE ResizeObserver per view (the listener-lifecycle law: never a per-render listener): a strip re-fits when its box
  // changes width — a resize, its run closing / opening, the box dropping under its head. Fitted in the next frame
  // (never inside the observer's own delivery); a box no longer in the document is let go at the next rebind.
  const watched = new Set(), fitDue = new Set();
  let fitFrame = 0;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
    if (st.disposed) return;
    for (const e of entries) fitDue.add(e.target);
    if (!fitFrame) fitFrame = requestAnimationFrame(() => { fitFrame = 0; const due = [...fitDue]; fitDue.clear(); if (!st.disposed) for (const b of due) if (b.isConnected) fitStrip(b); });
  }) : null;
  function watchBox(box) { if (ro && !watched.has(box)) { watched.add(box); ro.observe(box); } }
  function sweepBoxes() { if (ro) for (const b of [...watched]) if (!b.isConnected) { ro.unobserve(b); watched.delete(b); fitDue.delete(b); } }
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
    const id = root.dataset && (root.dataset.toolId || (isNote(root) ? noteKey(root) : ''));
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
    refreshChatProposals();   // lane chat-proposal-card: a decision taken while this page was away is read again
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
    if (ro) ro.disconnect();
    if (fitFrame) cancelAnimationFrame(fitFrame);
    watched.clear(); fitDue.clear();
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
