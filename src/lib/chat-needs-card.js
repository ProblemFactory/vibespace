// WHAT THIS CONVERSATION ASKS OF YOU, AS CARDS IN ITS CHAT (lane chat-needs-you-card, the owner 2026-10-26: «这个界面里是不是
// 应该有个地方能让我看到需要approve？» — a channel watch the agent set up waited on an approval that sat only in the tray).
//
// THE LAW (S1's helper permission card, generalized): what a conversation asks of you is ANSWERABLE WHERE IT APPEARS. Every
// open For-you item this conversation produced or that addresses it (PURE src/foryou-actions.js needsOf — THE registry's rows
// decides which: S1's helper asks, the permission card's main asks, the chat's proposal / API / wall cards are already
// answered in the chat and are never drawn twice) is a CARD in the chat:
//   · WHERE — inside the record that filed it (placementOf: the tool card whose result names it, else the producer's CLI
//     call just before it, else the record at the filing, else the end of the last turn), like S1's box inside its Agent
//     card: it trims, pages and folds WITH that record (a run never folds a card that waits — chat-view.js's fold rule);
//   · THE TAIL (lane needs-card-tail, the owner 2026-10-28 on 2.369.360: «这个应该同时堆叠在页面最下吗？» — six asks filed
//     days ago stood stacked under the newest message): a card whose record is NOT on screen is not drawn at the end — at
//     most ONE docks there (PURE tailPlan: the person's pick, else the NEWEST of them; the next newest takes the dock when
//     it is answered; none in a window that ends mid-history) and says so (its dock line: where it was asked, how many
//     wait, where — the chip); every other one waits in the chip;
//   · WHAT — THE row (src/lib/user-todos-row.js renderRow / patchRow through the panel's app.foryouRows — the mini inbox's
//     context): the row's words, its detail fold, its options as chips, its Reply / Allow / Deny / Mark done / Dismiss —
//     and the SAME verbs and routes (the panel's rowClick({mini: true}), wired per card) — never a second implementation;
//   · LIVE — the For-you store's broadcast (inboxModel 'todos') is the signal on every client, no polling: a card answered
//     anywhere (the tray, a phone, another page) is PATCHED in place — keyed by the item id, never the transcript
//     re-rendered — and stays a quiet one-line record («approved · 2 min ago», settledWords) while the snapshot's resolved
//     tail holds it;
//   · THE CHIP — the status bar's «waiting for you · N» (chipWords) — THE INDEX (lane needs-card-tail): it counts and
//     lists EVERY open ask of the conversation, newest first (the question · its age); one ⇒ its click lands it, several ⇒
//     its click lists them and choosing one lands it (THE ONE LANDING, `land` — also every For-you door to this
//     conversation, user-todos-actions.js jump: its card where it stands, else the history read upward to its record and
//     the window loaded there, else the dock at the end saying it has none) whole, flashed (S1's attention flash); it
//     stands after a reload (the store is fetched on boot). ONE PASS (acceptance round 2, P3): the chip's list and the cards
//     come from the same pass, so they change in the same frame (a filing ⇒ N+1 and its card, an answer ⇒ N and the dock
//     moved);
//   · THE ACCORDION (acceptance round 2, P2 — the owner's accordion law in the chat): ONE card is open — the NEWEST, or the
//     one the person opened — and every other waiting card of the conversation is a folded one-line row (its question +
//     « · age»; on a touch screen the sheet's 44 px folded row), the whole row the tap that opens it in place and folds the
//     one before; a filing opens the new one. A card whose reply box is in use is never folded under the typist. THE SLOT
//     MOVES ONLY ON A FILING (acceptance round 3, #3): an id this view has not seen waiting takes it (the newest of them), a
//     tap or the chip moves it, a resolution NEVER does — the newest answered elsewhere leaves the person's pick open, and
//     the pick answered leaves its quiet line with every other card still folded (none opens by itself under the pointer);
//     a tap holds its row under the pointer on a pinned view too (round 3, #2: the view's own door cancels the bottom-follow
//     chain, and the pass an open runs starts none);
//   · A BOX IN USE SURVIVES A RESOLVE (round 3, #4 — THE row's keep rule): a card answered on another client while its reply
//     box holds focus or text keeps the box (the quiet line above it, the row resolved around it); the box folds, its text a
//     draft, when the person leaves it — and every quiet-line write saves the typed text to the drafts first. EVERY ROAD OUT
//     OF A BOX (round 4, #2: Esc, a blur, a sent reply, the fold verb) is the panel's ONE exit (foldBox — the draft, the box
//     gone, `ut-box-left` from its row), and this module's next pass ends the kept state; A KEPT CARD STAYS IN THE PASS
//     (round 4, #4) while its box is in use — the store's resolved tail yields to it — so it is patched, never frozen;
//   · THE OPEN AT THE BOTTOM EDGE (round 4, #1): the hold anchors the row's TEXT LINE under the pointer (the head and the
//     padding an open adds grow above it), then answers the lowest verb left below the list with the MINIMUM scroll — what
//     moved under the pointer answers nothing for ARM_MS (the press arm's law). ROUND 5: what moved is MEASURED, never planned
//     (#1 — after the scroll the line is read again; a hold the list could not honour — a transcript that does not scroll, a
//     scrollTop clamped at 0 — moved the chips under the pointer with no refusal; and what now stands inside the row that was
//     pressed counts too: at a desk Mark done / Dismiss share the question's line), the reveal never takes the question's own
//     line past the list's top (#2 — a card taller than the list shows its question first), and the room a hold borrowed at
//     the end — measured to the content's end: a list its content does not fill reports its own height — goes back on every
//     road that makes it unnecessary, through ONE _giveBack (#3). ROUND 6: that room is lent for what lies BELOW the card
//     (the tail, the list's edge) — the card's OWN size (its «detail» opened, its reply box shown, then gone again) neither
//     returns it nor needs it, so a grow-then-shrink inside the card never drops the line;
//   · A PASS THAT CHANGED NO CARD READS NO LAYOUT (round 4, #3): the pass records its own DOM writes (a MutationObserver over
//     the list, taken synchronously) — none ⇒ no re-stamp of an Allow, no bottom-follow; a pass that changed one stamps the
//     armed buttons of THIS list only.
import { t } from './i18n.js';
import { escHtml, showToast } from './utils.js';
import { pressVerdict } from './press-arm.js'; // round 4 (#1): what an open moved under the pointer answers nothing for ARM_MS
import { UI_ICONS } from './icons.js';
import { inboxModel } from './user-todos-actions.js';
import { agoText, boxInUse, endCodeOf } from './user-todos-row.js';
import { needsOf, recordsOf, placementOf, tailPlan, drawnAt, filingIndex, chipWords, settledWords, KIND_WORDS, decidedStamp, decisionCard, VIEWER_ROLE } from '../foryou-actions.js'; // PURE: THE For-you action registry — which items, where, the words

/** A chat record as the PURE placement reads it: {id, ts, role, tool, cmd (a Bash call's command), out (its result)}. */
export function leanRecord(m) {
  const c = m && Array.isArray(m.content) ? m.content[0] : null;
  const input = c && c.input && typeof c.input === 'object' ? c.input : null;
  let out = c ? c.output : null;
  if (Array.isArray(out)) out = out.map((x) => (typeof x === 'string' ? x : x && typeof x.text === 'string' ? x.text : '')).join('\n');
  return { id: m.id, ts: Number(m.ts) || 0, role: m.role, tool: m.toolName || null, cmd: input && typeof input.command === 'string' ? input.command : '', out: typeof out === 'string' ? out.slice(-8000) : '' };
}

/** Did a pass's mutation records change the DOM? An attribute that ENDS the pass with the value it had is no write (a
 *  card's class is set whole, then its fold toggled back on — the same class it began with). */
function wroteAny(recs) {
  const was = new Map();
  for (const r of recs) {
    if (r.type !== 'attributes') return true;
    if (!was.has(r.target)) was.set(r.target, new Map());
    if (!was.get(r.target).has(r.attributeName)) was.get(r.target).set(r.attributeName, r.oldValue);
  }
  for (const [el, m] of was) for (const [a, v] of m) if (el.getAttribute(a) !== v) return true;
  return false;
}

/** A card's question line — what a pointer open holds (round 4, #1); the card itself when it has none. */
const lineOf = (c) => (c && c.querySelector(':scope > .cn-rows > .ut-item .ut-text')) || c;

/** The newest of `entries` ({item}) by its filing time (a tie: the later in the list). */
const newestOf = (entries) => entries.reduce((a, e) => (!a || (Number(e.item.createdAt) || 0) >= (Number(a.item.createdAt) || 0) ? e : a), null);

/** A FILING, not an item (r4): the store re-files a resolved ask under the SAME id with a new createdAt (user-todos.js «REOPENS
 *  the same item») — what a read proved about the old filing says nothing about the new one. */
const filingOf = (item) => `${item.id}@${Number(item.createdAt) || 0}`;

export class NeedsCards {
  /** @param view the ChatView (its _messageList, _messages, _elements, _statusBar) */
  constructor(view) {
    this.view = view;
    this.app = view.app;
    this._queued = false;
    this._sig = '';
    this._openIds = '';
    this._seen = new Set(); // the open ids the last pass saw — an id not in it is a FILING (it takes the open slot)
    this._slot = null;      // THE ACCORDION's open slot: the id of the one open card (a resolved id ⇒ every card folded)
    this._dockPick = null;  // THE TAIL's dock when the person landed an ask with no record there (else the newest loose one)
    this._dockNoRecord = false; // …and that landing's read reached the conversation's first record: it has none (judged per landing, r2)
    this._landGen = 0;      // THE DISPLACEMENT LAW (r2): the newest landing's generation — an older one never moves the reader
    this._placeSig = '';    // what the last pass placed where — a pass that moves no card reads no layout
    this._filed = new Map(); // what a landing's read PROVED: a FILING (id + createdAt, r4) → the record that filed it (r3 — a fact
                             // of the transcript, kept while that filing is listed or is the newest landing's; «no record» never is)
    this._flying = null;     // the newest landing's filing — the pass never prunes its proof (r4)
    // WHO IS LOOKING (lane wake-approve-card — an IDENTITY fact, never this view's: the owner decides from every view they
    // open, history and sub-agent viewers included). THE one place a card asks it: the registry's VIEWER_ROLE today; the
    // day an instance gains a non-owner viewer (VIEWERS' deferred row) it is answered here, and its cards read «waiting
    // for the owner» with no buttons (decisionCard's false branch)
    this._role = () => VIEWER_ROLE;
  }

  /** The loaded records in DISPLAY order, lean (the view's ordered accessor — _messages' insertion order put an older page's
   *  last record at the end, r2). */
  _records() {
    const v = this.view;
    return (typeof v.loadedRecords === 'function' ? v.loadedRecords() : v._messages || []).map(leanRecord);
  }

  /** Subscribe for the VIEW's life: its own controller, aborted by the window's (`signal`) or by the view's dispose (stop) —
   *  a view can be replaced while its window lives on. */
  start(signal) {
    if (this._ctl || !this.app || !this.app.ws) return;
    this._ctl = new AbortController();
    const own = this._ctl.signal;
    // the window's abort stops the view; the listener itself goes with the VIEW's controller (round 3, m1: a once-listener
    // on the window's signal held every replaced view, with its transcript, until the window closed)
    if (signal) { if (signal.aborted) { this._ctl.abort(); return; } signal.addEventListener('abort', () => this.stop(), { once: true, signal: own }); }
    const model = inboxModel(this.app);
    const go = () => this.schedule();
    model.on('todos', go, { signal: own });
    model.on('live', go, { signal: own }); // the reply verdict (a conversation that ended / runs again) — patched, never rebuilt
    // round 4 (#2): a box left by ANY road (Esc, a blur, a sent reply, the fold verb — the panel's one exit) ends a kept state
    this.view._messageList.addEventListener('ut-box-left', go, { signal: own });
    // a record landing, a page loading, a trim: the cards' anchors may have arrived or left
    this._mo = new MutationObserver(() => { if (this._lent) this._watchTail(); go(); });
    this._mo.observe(this.view._messageList, { childList: true });
    this.schedule();
  }

  stop() {
    try { this._giveBack(); } catch { } // the room a hold borrowed never outlives the view (round 5, #3)
    try { this._ctl?.abort(); } catch { }
    try { this._mo?.disconnect(); } catch { }
    this._mo = null;
  }

  /** ONE pass a frame (acceptance round 3, #1): a burst of broadcasts — eight filings in a row — is one pass, never one
   *  inside each socket message (each delayed the next broadcast, and the tray's fresh open read a store still filling: its
   *  first screen drew 8 rows and no fold under load); a timer beside the frame — a page with no frames (hidden, or a
   *  background page that still reads visible) is drawn within 100 ms all the same. */
  schedule() {
    if (this._queued) return;
    this._queued = true;
    let raf = 0;
    const run = () => { if (!this._queued) return; this._queued = false; cancelAnimationFrame(raf); clearTimeout(tm); try { this.render(); } catch (e) { console.warn('[chat-needs] render failed:', e); } };
    if (!document.hidden) raf = requestAnimationFrame(run);
    const tm = setTimeout(run, document.hidden ? 0 : 100);
  }

  /** The item keys this conversation answers for (the panel's window rule: its live key, its openSpec key, its webui twin). */
  keys() {
    const rows = this.app.foryouRows;
    if (!rows || typeof rows.keysForWin !== 'function') return null;
    let winId = this.view.winInfo && this.view.winInfo.id;
    for (const [id, v] of this.app.sessions || []) if (v === this.view) { winId = id; break; }
    return winId ? rows.keysForWin(winId) : null;
  }

  /** One pass. `hold` = the pass an open in place runs (openCard): it starts no bottom-follow — the open holds its row.
   *  A PASS THAT CHANGED NO CARD READS NO LAYOUT (round 4, #3 — every card's reconcile re-stamped every Allow of the page,
   *  a rect per hit, on every broadcast): the pass's own DOM writes are recorded (wroteAny — an attribute that ends with the
   *  value it had is no write) — none ⇒ nothing stamped, nothing followed. */
  render({ hold = false } = {}) {
    const view = this.view;
    if (view._disposed || !view._messageList) return;
    const probe = this._probe || (this._probe = new MutationObserver(() => { }));
    probe.observe(view._messageList, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true });
    let placed = 0, recs = [];
    try { placed = this._pass({ hold }); } finally { recs = probe.takeRecords(); probe.disconnect(); }
    if (!wroteAny(recs)) return;
    this._roomCheck(); // the room a hold borrowed: its card folded, resolved or gone ⇒ given back (round 5, #3)
    // what the pass showed or hid moved the Allows below it: re-stamped where they now are — THIS list's (press-arm)
    this.app.foryouRows?.arm?.(view._messageList);
    if (view._pinned && placed && !hold) view._scrollToBottom?.();
  }

  /** THE ROOM A HOLD BORROWED (round 4, #1): a line held at the very END of the transcript — the list cannot scroll past its
   *  end, and the head and the padding an open adds above the line (≈ 24 px) would push it down — is given the missing room
   *  below the last record (the list's bottom padding, inline). ONE ROAD BACK, TAKEN BY EVERY WAY IT STOPS BEING NEEDED (round
   *  5, #3 — a scroll was the only one, and while it stood it widened the view's unpin band by its height): `_roomCheck` on
   *  every scroll, every resize of the list, of the card that borrowed or of the last record (a record landing, the stream),
   *  and after every pass that wrote — the card folded, resolved or gone ⇒ all of it; else what lies out of sight below the
   *  bottom edge, and what the content grew below the card (a record landing on a pinned view fills the room in place of
   *  the follow) — neither moves anything on screen; the view's dispose ⇒ all of it. While it stands the view is AT its
   *  very bottom, so the chat's PINNED ⇔ AT THE LIVE TAIL is measured from the content's end, never the room's. THE CARD'S
   *  OWN SIZE IS NOT ITS BUSINESS (round 6): the room is lent for what lies below the card (the tail, the list's edge) — the
   *  card growing (its «detail» opened, its reply box shown) put nothing there that stays, and returning the room for it
   *  dropped the line by it when the card shrank back; the growth is counted out of both measures, and a shrink below
   *  what the card was is its new size (what the next growth is counted from). */
  _lend(list, px, card) {
    if (!this._lent) {
      this._lentBase = parseFloat(getComputedStyle(list).paddingBottom) || 0;
      list.addEventListener('scroll', this._onLentScroll = () => this._roomCheck(), { passive: true, signal: this._ctl?.signal });
      // the list by its BORDER box: the padding the room writes is not a resize of it (no observer loop)
      (this._roomRO = this._roomRO || new ResizeObserver(() => this._roomCheck())).observe(list, { box: 'border-box' });
    }
    this._lent = (this._lent || 0) + px;
    list.style.paddingBottom = `${this._lentBase + this._lent}px`;
    this._ownRoom(card);
  }

  /** The room now holds `card`'s line (the open that relies on it — a later open moved the scroll past any earlier hold). */
  _ownRoom(card) {
    if (this._lentBy !== card) { if (this._lentBy) this._roomRO?.unobserve(this._lentBy); this._lentBy = card; this._roomRO?.observe(card); }
    this._watchTail();
    const g = this._roomGeom();
    this._lentFill = g.fill; this._lentH = g.h;
  }

  /** The room's watch on the list's LAST record (a record landing, the stream into it). */
  _watchTail() {
    const tail = this.view._messageList?.lastElementChild;
    if (tail === this._lentTail) return;
    if (this._lentTail && this._lentTail !== this._lentBy) this._roomRO?.unobserve(this._lentTail);
    this._lentTail = tail;
    if (tail) this._roomRO?.observe(tail);
  }

  /** → { fill: the content below the CARD that borrowed (the room aside; the card's own box never counts), below: px of the
   *  list out of sight below its bottom edge, h: the card's own height } */
  _roomGeom() {
    const list = this.view._messageList, box = this._lentBy.getBoundingClientRect();
    const end = box.bottom - list.getBoundingClientRect().top + list.scrollTop;
    return { fill: list.scrollHeight - this._lent - end, below: list.scrollHeight - list.scrollTop - list.clientHeight, h: box.height };
  }

  /** Every road's one question: how much of the room is no longer needed? → given back through `_giveBack`. */
  _roomCheck() {
    if (!this._lent) return;
    const card = this._lentBy;
    if (this.view._disposed || !card || !card.isConnected || !card.classList.contains('cn-open') || card.classList.contains('cn-fold')) { this._giveBack(); return; }
    const { fill, below, h } = this._roomGeom();
    // what the card's OWN growth put below the bottom edge stays lent (its shrink back would need it again, round 6)
    const grew = Math.max(0, h - this._lentH);
    const give = Math.floor(Math.max(fill - this._lentFill, below - grew));
    this._lentFill = fill; this._lentH = Math.min(this._lentH, h);
    if (give >= 1) this._giveBack(give);
  }

  /** THE ONE ROAD BACK: `px` of the room (all of it by default). */
  _giveBack(px = Infinity) {
    const list = this.view._messageList;
    if (!this._lent || !list) return;
    this._lent = Math.max(0, this._lent - px);
    if (this._lent >= 1) { list.style.paddingBottom = `${this._lentBase + this._lent}px`; return; }
    this._lent = 0; this._lentBy = null; this._lentTail = null; this._lentFill = 0; this._lentH = 0;
    list.removeEventListener('scroll', this._onLentScroll);
    this._roomRO?.disconnect();
    list.style.removeProperty('padding-bottom');
  }

  /** The pass's DOM work → how many cards it placed. */
  _pass({ hold = false } = {}) {
    const view = this.view;
    const model = inboxModel(this.app);
    const keys = model.loaded ? this.keys() : null;
    const todos = model.todos || { open: [], resolved: [] };
    const open = keys ? needsOf(todos.open, keys) : [];
    const done = keys ? recordsOf(todos.resolved, keys) : [];
    // A KEPT CARD STAYS IN THE PASS (round 4, #4 — one whose item left the snapshot's resolved tail, the newest 15 + the last
    // hour, was never patched or removed again): a card whose reply box is in use is drawn from the snapshot's copy (a clear
    // rewrites it there), else from the copy it last drew; once the box is left, the normal removal applies
    const listed = new Set([...open, ...done].map((e) => e.item.id));
    const filings = new Set([...open, ...done].map((e) => filingOf(e.item)));
    for (const k of this._filed?.keys() || []) if (!filings.has(k) && k !== this._flying) this._filed.delete(k);
    for (const c of view._messageList.querySelectorAll(':scope > * > .cn-cards > .cn-card')) {
      if (listed.has(c.dataset.item) || !c._item || !boxInUse(c.querySelector('.ut-reply'))) continue;
      done.push({ item: todos.resolved.find((i) => i.id === c.dataset.item) || todos.open.find((i) => i.id === c.dataset.item) || c._item, kind: c.dataset.kind || 'check' });
    }
    // the common case — nothing of this conversation's: no transcript walk on every appended record, only what is left to clear
    if (!open.length && !done.length) {
      const drop = [...view._messageList.querySelectorAll(':scope > * > .cn-cards')].filter((c) => !boxInUse(c.querySelector('.ut-reply')));
      const keep = drop.length && !hold && !view._pinned ? this._readerLine() : null;
      for (const c of drop) c.remove();
      view._statusBar?.setNeeds?.(null);
      this._seen.clear(); // nothing waits: whatever is filed next is a filing
      this._placeSig = '';
      for (const k of this._filed?.keys() || []) if (k !== this._flying) this._filed.delete(k);
      if (this._openIds) { this._openIds = ''; try { view._updateRuns?.(); } catch { } }
      this._keepReader(keep);
      return 0;
    }
    // THE END is the DISPLAY order's last DRAWN record (r2 — the insertion order's last was an older page's, mid-history; a
    // record drawn as nothing at the end left the dock nowhere)
    const transcript = this._records();
    const drawn = (id) => this._onScreen(id);
    let lastId = null;
    for (let k = transcript.length - 1; k >= 0 && lastId == null; k--) if (drawn(transcript[k].id)) lastId = transcript[k].id;
    // THE TAIL (lane needs-card-tail — the base docked EVERY card whose record was not on screen: six old asks stacked under
    // the newest message): a card whose record is on screen stands there; of the rest at most ONE docks at the END (the
    // person's pick, else the newest) and only in a window that reaches the live end; every one is in the chip
    const atEnd = !view._teleported && !(view._windowEnd < view._total);
    const plan = tailPlan(open, transcript, { rendered: drawn, atEnd, pick: this._dockPick, known: this._provedOf(open) });
    if (this._dockPick != null && !plan.loose.includes(this._dockPick)) { this._dockPick = null; this._dockNoRecord = false; } // the pick answered, or its record on screen: the newest docks again
    // THE ACCORDION: the open slot moves on a FILING only — an id this view has not seen waiting (the newest of them; a
    // view's first pass sees every one as new); a resolution never moves it (round 3, #3)
    const fresh = open.filter((e) => !this._seen.has(e.item.id));
    if (fresh.length) this._slot = newestOf(fresh).item.id;
    this._seen = new Set(open.map((e) => e.item.id));
    const openSlot = this._slot;
    // every card → its element: its record when on screen, the END for the ONE docked (its dock line says so), none for the
    // rest (the chip lists them); a resolved one only at its record (history stays history)
    const want = new Map(); // anchor element → [{item, kind, resolved, dock}]
    for (const e of [...open.map((x) => ({ ...x, resolved: false, fold: x.item.id !== openSlot })), ...done.map((x) => ({ ...x, resolved: true }))]) {
      let el = null;
      if (e.resolved) { const p = placementOf(e.item, transcript, { resolved: true, more: !atEnd }); const at = drawnAt(transcript, p.at != null ? p.at : this._knownAt(e.item, transcript), drawn); el = at != null ? view._elements.get(at) : null; }
      else if (plan.at.has(e.item.id)) el = view._elements.get(plan.at.get(e.item.id));
      else if (plan.dock === e.item.id && lastId != null) {
        el = view._elements.get(lastId);
        // no record at all: the whole conversation is loaded (a tail window from its first record), or THIS landing's read
        // reached the first record — judged per landing, never kept (r2: a set of «no record» ids lived for the view's life)
        e.dock = { n: open.length, noRecord: (this._dockPick === e.item.id && this._dockNoRecord) || !(view._windowStart > 0) };
      }
      if (!el || !el.isConnected || el.parentNode !== view._messageList) continue;
      if (!want.has(el)) want.set(el, []);
      want.get(el).push(e);
    }
    // the cards on screen now, by item id
    const have = new Map();
    for (const c of view._messageList.querySelectorAll(':scope > * > .cn-cards > .cn-card')) have.set(c.dataset.item, c);
    // THE READER STAYS WHERE THEY ARE (r2 — the reader-position law for a swap: the docked ask answered from another client
    // moved a scrolled reader 87 px): a pass that moves, adds, removes or re-states a card while the reader is scrolled away
    // (not following the tail, not a landing's own pass) keeps the reader's top record where it stood — read only when the
    // placement changed, so a pass that changes no card still reads no layout
    const sig = [...want].map(([el, es]) => `${el.dataset.msgId}=${es.map((e) => `${e.item.id}:${e.resolved ? 'r' + (e.item.status || '') : e.fold ? 'f' : 'o'}${e.dock ? ':d' + e.dock.n + (e.dock.noRecord ? 'x' : '') : ''}`).join(',')}`).join('|') + '#' + [...have.keys()].join(',');
    const keep = sig !== this._placeSig && !hold && !view._pinned ? this._readerLine() : null;
    this._placeSig = sig;
    const placed = new Set();
    for (const [el, entries] of want) {
      let holder = el.querySelector(':scope > .cn-cards');
      if (!holder) { holder = document.createElement('div'); holder.className = 'cn-cards'; el.append(holder); }
      let prev = null;
      for (const e of entries) {
        let card = have.get(e.item.id);
        // a card whose reply box is in use is never moved under the typist (moving a focused box blurs it) — it waits
        if (card && card.parentNode !== holder && boxInUse(card.querySelector('.ut-reply'))) { placed.add(e.item.id); continue; }
        // ONE card that fails to draw is said and skipped — the pass goes on to the chip (a throw here once left the chip at
        // the last pass's count beside the cards this pass had already drawn)
        try { if (!card) card = this._create(e); else this._patch(card, e); } catch (err) { console.warn('[chat-needs] a card failed to draw:', e.item.id, err); continue; }
        const slot = prev ? prev.nextElementSibling : holder.firstElementChild;
        if (card !== slot) holder.insertBefore(card, slot);
        prev = card;
        placed.add(e.item.id);
      }
    }
    for (const [id, card] of have) if (!placed.has(id) && !boxInUse(card.querySelector('.ut-reply'))) card.remove();
    for (const h of view._messageList.querySelectorAll(':scope > * > .cn-cards')) if (!h.firstElementChild) h.remove();
    // THE CHIP (the status bar) — THE INDEX of every open ask, newest first, from this same pass as the cards (lane
    // needs-card-tail) — + a fold that must open for a card that waits
    view._statusBar?.setNeeds?.(this._chipOf(plan));
    // the run fold keeps a record holding an open card or a kept box (chat-view.js) — re-decided when either set changes, and
    // when an open card now stands in ANOTHER record (lane needs-card-tail: a landing's jumpToIndex folds the new window's runs
    // before its cards are drawn — the landed card stood inside a folded run, out of sight)
    const at = (c) => c.parentNode && c.parentNode.parentNode ? c.parentNode.parentNode.dataset.msgId || '' : '';
    const openIds = open.map((e) => e.item.id).join('|') + '@' + [...view._messageList.querySelectorAll(':scope > * > .cn-cards > .cn-card.cn-open')].map((c) => `${c.dataset.item}:${at(c)}`).join('|') + '#' + [...view._messageList.querySelectorAll(':scope > * > .cn-cards > .cn-card.cn-kept')].map((c) => c.dataset.item).join('|');
    if (openIds !== this._openIds) {
      this._openIds = openIds;
      try { view._updateRuns?.(); } catch { }
    }
    this._keepReader(keep);
    return placed.size;
  }

  /** …and puts it back where it stood (absolute: whatever the browser's own scroll anchoring already did). */
  _keepReader(keep) {
    if (!keep || !keep.el.isConnected || !keep.el.getClientRects().length) return;
    const d = keep.el.getBoundingClientRect().top - keep.top;
    if (Math.abs(d) >= 1) { this.view._traceExpect?.('needsKeep'); this.view._messageList.scrollTop += d; }
  }

  /** The reader's top record — the first record whose bottom is below the list's top edge — and where it stands. */
  _readerLine() {
    const list = this.view._messageList, top = list.getBoundingClientRect().top;
    for (const el of list.children) {
      if (!el.classList.contains('chat-msg') || !el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > top) return { el, top: r.top };
    }
    return null;
  }

  /** The record a landing's read proved filed `item` — THIS filing (r4) — when it is loaded (r3) → its id | null. */
  _knownAt(item, rows) {
    const rec = item ? this._filed?.get(filingOf(item)) : null;
    return rec != null && rows.some((r) => r && r.id === rec) ? rec : null;
  }

  /** What landings' reads proved for `entries` ({item}) → Map(item id → record id), each item's CURRENT filing only (r4). */
  _provedOf(entries) {
    const out = new Map();
    if (this._filed?.size) for (const e of entries) { const rec = this._filed.get(filingOf(e.item)); if (rec != null) out.set(e.item.id, rec); }
    return out;
  }

  /** Is the record `id` on screen (its element in this list)? */
  _onScreen(id) {
    const el = id != null ? this.view._elements.get(id) : null;
    return !!el && el.isConnected && el.parentNode === this.view._messageList;
  }

  /** THE CHIP's words + its rows (the index): every open ask, newest first — {id, words, ago, where: 'here' | 'end' | 'away'}. */
  _chipOf(plan) {
    const w = chipWords(plan.waiting, t);
    if (!w) return null;
    const model = inboxModel(this.app);
    w.rows = plan.waiting.map((e) => ({ id: e.item.id, words: model.wordsOf(e.item), ago: agoText(e.item.createdAt, t), where: plan.at.has(e.item.id) ? 'here' : plan.dock === e.item.id ? 'end' : 'away' }));
    return w;
  }

  /** The card of item `id` in this list, or null. */
  _cardOf(id) {
    return [...this.view._messageList.querySelectorAll(':scope > * > .cn-cards > .cn-card')].find((c) => c.dataset.item === id) || null;
  }

  _create(e) {
    const card = document.createElement('div');
    card.dataset.item = e.item.id;
    this._patch(card, e);
    // THE ACCORDION's tap: a folded card is ONE target — the whole row opens it in place (capture: before the row's verbs,
    // a link in its words, a door item's jump — nothing inside a folded row answers or leaves)
    const unfold = (ev) => {
      if (!card.classList.contains('cn-fold')) return false;
      ev.stopPropagation(); ev.preventDefault();
      this.openCard(card.dataset.item, { keys: ev.type === 'keydown' });
      return true;
    };
    // …and what an open MOVED under the pointer (round 4, #1: the reveal at the bottom edge; a keyboard open's focus) answers
    // nothing for ARM_MS — a double click's second press lands where the first opened the row (the press arm's law)
    card.addEventListener('click', (ev) => {
      if (unfold(ev) || card._openedAt == null || !ev.target.closest('button')) return;
      if (pressVerdict({ since: card._openedAt, now: performance.now() }).ok) { card._openedAt = null; return; }
      ev.stopPropagation(); ev.preventDefault();
      showToast(t('That button moved under the pointer just now — read it, then press it again'));
    }, { capture: true });
    card.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && !ev.isComposing) unfold(ev); }, { capture: true });
    // THE verbs: the panel's row wiring (rowClick({mini: true}) — the tray's routes), one card = one root
    this.app.foryouRows?.wire(card, { close: () => {} });
    card.addEventListener('click', (ev) => {
      if (!ev.target.closest('.cn-line')) return;
      this.app.openInbox?.({ itemId: e.item.id }); // a quiet record opens the item whole in the For-you window
    });
    // a box KEPT on an answered card (round 3, #4) folds when the person leaves it — through the panel's ONE exit (foldBox:
    // its text a draft, `ut-box-left` → this module's next pass), as Esc, a sent reply and the fold verb do (round 4, #2)
    card.addEventListener('focusout', () => setTimeout(() => {
      if (!card.classList.contains('cn-done')) return;
      const box = card.querySelector('.ut-reply');
      if (!box || box.contains(document.activeElement) || !document.hasFocus()) return;
      this.app.foryouRows?.fold?.(box);
    }, 0));
    return card;
  }

  /** Bring `card` to `e`: an open card = its head + THE row (reconciled — a reply box on it survives); resolved = one line. */
  _patch(card, e) {
    const kind = e.kind || 'check';
    card.className = `cn-card ${e.resolved ? 'cn-done' : 'cn-open'}`;
    card.dataset.kind = kind;
    card.dataset.at = String(Number(e.item.createdAt) || 0);
    card._item = e.item; // the copy it draws — a kept card is drawn from it once the snapshot's tail no longer carries it
    const model = inboxModel(this.app);
    if (e.resolved) {
      const words = model.wordsOf(e.item);
      // lane wake-approve-card: a decision only a person's click makes says WHO and WHEN — «approved by you · 09:41» (the
      // tray row's words, decidedStamp); every other record keeps «approved · 2 min ago»
      const stamp = decidedStamp(e.item, { t });
      const sig = `done\u0000${e.item.status}\u0000${e.item.resolvedBy || ''}\u0000${stamp ? stamp.text : ''}\u0000${words}`;   // r6: a grant's life (ended / revoked) redraws the line
      const verb = stamp ? stamp.verb : settledWords(e.item, t, kind);
      const ago = stamp ? stamp.time : agoText(e.item.resolvedAt || e.item.createdAt, t);
      const code = endCodeOf(e.item); // r8: an end this client cannot classify — «outcome unknown · <code>», never «done»
      const line = `<span class="cn-line-mark" aria-hidden="true">${code ? '?' : e.item.status === 'dismissed' || (stamp && stamp.denied) ? '✕' : '✓'}</span><span class="cn-line-verb">${escHtml(verb)}</span>${code ? ` · <code class="ut-end-code">${escHtml(code)}</code>` : ''}<span class="cn-line-ago"> · ${escHtml(ago)}</span><span class="cn-line-words"> — ${escHtml(words)}</span>`;
      // THE row's keep rule (round 3, #4 — an answer from another client wiped the lines being typed here): a box in use
      // stays — the quiet line above it, the row resolved AROUND it (patchRow keeps a box in use); it folds on leaving
      const rows = card.querySelector(':scope > .cn-rows');
      if (rows && boxInUse(rows.querySelector('.ut-reply'))) {
        card.classList.add('cn-kept'); // its record never folds into a run under the typist (chat-view.js's fold rule)
        card.querySelector(':scope > .cn-head')?.remove();
        let btn = card.querySelector(':scope > .cn-line');
        if (!btn) { btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cn-line'; btn.title = t('Open in the For-you window'); card.prepend(btn); }
        if (btn.dataset.sig !== sig + ago) { btn.dataset.sig = sig + ago; btn.innerHTML = line; }
        this.app.foryouRows?.reconcile(rows, [{ item: e.item, resolved: true }]);
        delete card.dataset.sig; // the quiet line alone is drawn once the box is gone
        return;
      }
      if (card.dataset.sig !== sig || card.dataset.ago !== ago) {
        this.app.foryouRows?.stash?.(card); // what was typed is a draft before the card's words are replaced
        card.dataset.sig = sig; card.dataset.ago = ago;
        card.innerHTML = `<button type="button" class="cn-line" title="${escHtml(t('Open in the For-you window'))}">${line}</button>`;
      }
      return;
    }
    // lane wake-approve-card: a viewer who may NOT decide (decisionCard's 'waiting-owner' — no role has it today, the
    // registry's VIEWERS) reads who decides, the item's words, and NO verb: never the row (its buttons)
    const dc = decisionCard(e.item, { role: this._role(), t });
    if (dc.state === 'waiting-owner') {
      const words = model.wordsOf(e.item);
      card.classList.add('cn-wait');
      if (card.dataset.sig !== `wait\u0000${words}`) {
        this.app.foryouRows?.stash?.(card);
        card.dataset.sig = `wait\u0000${words}`;
        card.innerHTML = `<div class="cn-head"><span class="cn-icon" aria-hidden="true">${UI_ICONS.inbox}</span><span class="cn-head-words">${escHtml(dc.waiting)}</span></div><div class="cn-wait-words">${escHtml(words)}</div>`;
      }
      return;
    }
    if (card.dataset.sig && card.dataset.sig.startsWith('wait\u0000')) { delete card.dataset.sig; card.replaceChildren(); }
    let head = card.querySelector(':scope > .cn-head');
    let rows = card.querySelector(':scope > .cn-rows');
    card.querySelector(':scope > .cn-line')?.remove(); // a quiet line (a reopen; a card kept for its box) leaves — the row stays
    if (!rows) {
      card.replaceChildren();
      rows = document.createElement('div'); rows.className = 'cn-rows';
      card.append(rows);
      head = null;
    }
    if (!head) { head = document.createElement('div'); head.className = 'cn-head'; card.prepend(head); }
    const hw = t('Waiting for you — {what}', { what: t(KIND_WORDS[kind] || KIND_WORDS.check) });
    if (head.dataset.words !== hw) {
      head.dataset.words = hw;
      head.innerHTML = `<span class="cn-icon" aria-hidden="true">${UI_ICONS.inbox}</span><span class="cn-head-words">${escHtml(hw)}</span><span class="cn-head-also">${escHtml(t('also in For you'))}</span>`;
    }
    // THE DOCK (lane needs-card-tail): the one card standing at the end for an ask whose record is not on screen says so —
    // where it was asked, how many wait and where (the chip) — open or folded (the fold hides the head, never this line)
    let dock = card.querySelector(':scope > .cn-dock');
    if (e.dock) {
      const where = e.dock.noRecord ? t('Docked here — asked before this conversation\'s record was kept') : t('Docked here — it was asked further up the conversation');
      const words = e.dock.n > 1 ? `${where} · ${t('{n} waiting — the status bar lists them all', { n: e.dock.n })}` : where;
      if (!dock) { dock = document.createElement('div'); dock.className = 'cn-dock'; head.after(dock); }
      if (dock.textContent !== words) dock.textContent = words;
    } else dock?.remove();
    card.classList.toggle('cn-docked', !!e.dock);
    this.app.foryouRows?.reconcile(rows, [{ item: e.item }]);
    // THE ACCORDION: folded = the row's question + « · age», the whole row one button (style.css / chat.css .cn-fold); open =
    // the row whole (.ut-open — the tray's own open state). A reply box in use is never folded under the typist.
    const fold = !!e.fold && !boxInUse(card.querySelector('.ut-reply'));
    card.classList.toggle('cn-fold', fold);
    const row = rows.querySelector(':scope > .ut-item');
    if (row) {
      row.classList.toggle('ut-open', !fold);
      if (fold) { row.setAttribute('role', 'button'); row.tabIndex = 0; row.setAttribute('aria-expanded', 'false'); row.title = t('Open it here'); }
      else if (row.getAttribute('role') === 'button') { row.removeAttribute('role'); row.removeAttribute('tabindex'); row.removeAttribute('aria-expanded'); row.removeAttribute('title'); }
    }
  }

  /** THE ACCORDION's open: `id`'s card opens in place and the open one folds — the tapped row's TEXT LINE stays where the
   *  pointer is (a card above it folding would pull it up; round 4, #1: the head and the padding the open adds grow ABOVE
   *  it — holding the card's box dropped the line ~25 px), on a pinned view too (round 3, #2: the view's bottom-follow chain
   *  cancelled through its own door). THEN THE ANSWERS (round 4, #1): the opened card's lowest verb left below the list's
   *  bottom is brought inside by the MINIMUM scroll — the line moves up by that much, never past the list's top (round 5, #2:
   *  capped as the keyboard's — a card taller than the list shows its question first, the person scrolls to its verbs) — and
   *  what moved under the pointer answers nothing for ARM_MS (the press arm refuses a moved Allow; this card refuses every
   *  verb of its own), keyed on the MEASURED landing (round 5, #1: the line read again after the scroll — a hold the list
   *  could not honour moved the chips under the pointer while the plan said nothing moved). Opened from the KEYBOARD (`keys`)
   *  no pointer is held: the card is brought whole into view and the focus moves to its first answer. */
  openCard(id, { keys = false } = {}) {
    const view = this.view, list = view._messageList;
    const at = () => list && [...list.querySelectorAll(':scope > * > .cn-cards > .cn-card')].find((c) => c.dataset.item === id);
    const was = at(), before = lineOf(was)?.getBoundingClientRect().top, row = was?.getBoundingClientRect(); // the line, the row pressed
    // a READER act: the view's own door cancels a bottom-follow chain already running (round 3, #2 — the pinned view's
    // chain wrote scrollTop = scrollHeight one frame after the hold), and the pass below starts none
    view._noteUserNav?.('needsOpen');
    this._slot = id;
    this.render({ hold: true });
    const el = at();
    if (!el || !list) return;
    const lr = list.getBoundingClientRect(), line = lineOf(el);
    const shift = before == null ? 0 : line.getBoundingClientRect().top - before;
    const rc = el.getBoundingClientRect();
    const top = rc.top - shift, bottom = rc.bottom - shift; // where it lands once the line is held
    let reveal = 0;
    if (keys) {
      if (bottom > lr.bottom) reveal = Math.min(bottom - lr.bottom, Math.max(0, top - lr.top));
      else if (top < lr.top) reveal = top - lr.top;
    } else {
      const verbs = [...el.querySelectorAll(':scope > .cn-rows :is(button, textarea)')].filter((b) => b.getClientRects().length);
      const low = verbs.length ? Math.max(...verbs.map((b) => b.getBoundingClientRect().bottom)) - shift : bottom;
      const lineTop = line.getBoundingClientRect().top - shift; // where the held line lands — the reveal never takes it past the list's top
      if (low > lr.bottom) reveal = Math.min(Math.ceil(low - lr.bottom), Math.max(0, Math.floor(lineTop - lr.top)));
    }
    const move = shift + reveal;
    // how far the list can still go down, measured to its CONTENT's end (round 5: a list its content does not fill has a
    // scrollHeight of its own height — the room borrowed there fell short and the line dropped by the head). A hold that
    // misses ABOVE (scrollTop clamped at 0) stays missed — and is measured just below
    const tail = list.lastElementChild, pad = parseFloat(getComputedStyle(list).paddingBottom) || 0;
    const end = tail ? tail.getBoundingClientRect().bottom - lr.top - list.clientTop + list.scrollTop + pad : list.scrollHeight;
    const room = Math.min(list.scrollHeight, end) - list.clientHeight - list.scrollTop;
    if (move > room + 1) this._lend(list, Math.ceil(move - room), el);
    if (Math.abs(move) > 1) list.scrollTop += move;
    if (this._lent) this._ownRoom(el); // the room now holds THIS line (and what it no longer needs goes: _roomCheck)
    // WHAT MOVED IS MEASURED (round 5, #1): the line where it LANDED, against where the pointer pressed — and any verb of the
    // card now inside the row that was pressed; either ⇒ its verbs answer nothing for ARM_MS (a keyboard open: always)
    const landed = line.getBoundingClientRect().top;
    const under = row && [...el.querySelectorAll('button')].some((b) => { const r = b.getBoundingClientRect(); return r.width && r.bottom > row.top && r.top < row.bottom && r.right > row.left && r.left < row.right; });
    if (keys || before == null || Math.abs(landed - before) > 1 || under) el._openedAt = performance.now();
    // THE PIN FOLLOWS THE LANDING HONESTLY (the chat's own law — PINNED ⇔ AT THE LIVE TAIL, < 50 px; the run bar's landing
    // keeps it the same way, inc-mvl02dkn-gop0): an open that leaves the view off the live tail (the card grown below the
    // edge) is a reader's position; one that leaves it AT the tail (the line held by the borrowed room) stays a tail
    if (view._pinned && !(view._atLiveTail ? view._atLiveTail(list.scrollTop, list.scrollHeight, list.clientHeight) : list.scrollHeight - list.scrollTop - list.clientHeight <= 1)) view._setPinned?.(false, 'needsOpen');
    this.app.foryouRows?.arm?.(list);
    if (keys) el.querySelector('.ut-opt:not(:disabled), .ut-actions > button:not(:disabled)')?.focus({ preventScroll: true });
  }

  /** THE CHIP's click with no row chosen: the newest waiting ask, landed (THE ONE LANDING). → a promise of where. */
  jumpToNewest() {
    const model = inboxModel(this.app), keys = this.keys();
    const open = keys && model.loaded ? needsOf((model.todos || {}).open || [], keys) : [];
    return open.length ? this.land(open[open.length - 1].item) : Promise.resolve(null);
  }

  /** THE ONE LANDING (lane needs-card-tail — R2: the chip's rows; R5: every For-you door to this conversation, the owner
   *  2026-10-28: «inbox点消息跳转会对话的时候，可以考虑直接跳转到对应的上下文»): `x` = an item (or its id), landed at the
   *  record that filed it, opened, flashed:
   *   ① its card where it stands now (at its record) → opened, the others folded;
   *   ② its record on screen with no card (a notice, an answered item out of the quiet tail) → that record;
   *   ③ its record ABOVE what is loaded → the history read upward to the filing (PURE placementOf over each page, `_anchorIndex`)
   *     and the window loaded there (jumpToIndex — the road S1's waiting chip takes), then ① / ②;
   *   ④ no record at all (filed before the conversation's first record) → an open card takes the dock at the END (the live
   *     end loaded first) and its dock line says why; anything else lands at the end.
   *  A press is intent (the view's door, _noteUserNav): no resume re-tail or bottom-follow overrules it — and nothing but a
   *  press calls it (a broadcast never moves a reader).
   *  THE DISPLACEMENT LAW (r2 — a slow read upward finished after a newer press and dragged the view to the stale target):
   *  every landing carries a generation; a newer landing, the reader's own move (a wheel, a key, a drag, the minimap, a
   *  search, a jump) or the view's dispose cancels it — its read may finish, its jump never fires. `since` = a door's press
   *  time: a move made while its window opened cancels it the same way. EVERY ROAD obeys it (r3 — the tail road's
   *  jumpToBottom took no `stale`: an older press's tail fetch replaced the window a newer press had landed in): both jumps
   *  take `{land, stale}` and ask `stale` before the window is replaced; every await is followed by the same guard.
   *  A RECORD THE READ FINDS IN THE WINDOW IS A HIT (r3 — a window ending inside the skew margin of the filing could not
   *  place the card alone; the read past it proved the record, and the landing said «not drawn» and took the tail): the card
   *  stands at that record (`_filed`). A FAILED SHOW LEAVES NO MARK (r3): a target with no box is said («the record is not
   *  drawn»), the reader left where they are, the pin kept. THE PROOF TRAVELS WITH THE LANDING (r4 — here()'s own pass pruned
   *  the proof of anything it does not list, a notice or an answered ask past the resolved tail, and the hit took the tail
   *  road): here() reads the record the read found directly, and the pass never prunes the newest landing's filing; the
   *  proof is the FILING's (id + createdAt — a re-filed ask was placed at its old filing's record). A road that fails moves
   *  nothing (r4): a page that could not be read is said by the jump and ends the landing (no tail road after it, no
   *  scroll, no pick kept); a show that fails after a jump rebuilt the window puts back what the jump changed — on ③'s
   *  index road and on ④'s tail road (r5: the tail road left a mid-history reader at the live end): a pinned reader at the
   *  live tail again, any other at the record they were reading — a record inside a run they had opened, its run opened
   *  again (r5: the rebuilt window folds every run; the record had no box and nothing was put back), else its run's fold
   *  line, else the nearest drawn record. THE ONE ROAD THAT DOES NOT PUT BACK is a teleported reader's (a seek slab has no
   *  index space to return to): the live end the jump loaded stays, and the toast says the record is not drawn. The
   *  accordion's slot moves only for a show that lands (_show). → 'card' | 'record' | 'dock' | 'end' | null */
  async land(x, { since = null } = {}) {
    const view = this.view;
    if (view._disposed || !view._messageList) return null;
    const model = inboxModel(this.app), todos = model.todos || { open: [], resolved: [] };
    const id = typeof x === 'string' ? x : x && x.id;
    const item = [...(todos.open || []), ...(todos.resolved || [])].find((i) => i && i.id === id) || (x && typeof x === 'object' ? x : null);
    if (!item) return null;
    if (since != null && view._navigatedSince?.(since)) return null;
    const gen = this._landGen = (this._landGen || 0) + 1;
    const filing = this._flying = filingOf(item);
    view._noteUserNav?.('needsLand');
    let mark = Date.now();
    const gone = () => gen !== this._landGen || !!view._disposed || !!view._navigatedSince?.(mark);
    const ours = (p) => { mark = Date.now(); return p; }; // this landing's own jump stamps the view's navigation as it starts
    const keys = this.keys() || [];
    const isCard = item.status === 'open' && needsOf([item], keys).length > 0;
    let missed = false; // a target found with no box (r3: said once, nothing moved)
    let proved = null;  // the record THIS landing's read found (r4: read directly, never through a map the pass may prune)
    const show = (el) => { if (this._show(el)) return true; if (el && el.isConnected) missed = true; return false; };
    const said = () => { showToast(t('The record that filed it is not drawn in this chat'), { type: 'info' }); return null; };
    // ① / ② what is loaded — a record drawn as nothing stands for the nearest drawn record after it (r2); the record a read
    //   proved stands for itself (r3)
    const here = () => {
      this.render({ hold: true });
      const card = this._cardOf(item.id);
      if (card && !card.classList.contains('cn-docked')) return show(card) ? 'card' : null;
      const rows = this._records();
      const atEnd = !view._teleported && !(view._windowEnd < view._total);
      const p = placementOf(item, rows, { resolved: true, more: !atEnd });
      const known = proved != null && rows.some((r) => r && r.id === proved) ? proved : this._knownAt(item, rows);
      const at = drawnAt(rows, p.at != null ? p.at : known, (rid) => this._onScreen(rid));
      return at != null && show(view._elements.get(at)) ? 'record' : null;
    };
    // what a jump changes, to put back when the show after it fails: the pin, else the record the reader was reading
    const backOf = () => {
      let line = null;
      if (!view._pinned) try { line = this._readerLine(); } catch { } // (a layout that cannot be read: nothing to put back)
      const rid = line ? line.el.dataset.msgId : null;
      const k = rid != null ? this._records().findIndex((r) => r.id === rid) : -1;
      return { pinned: !!view._pinned, idx: k >= 0 ? (view._windowStart || 0) + k : null, id: rid, top: line ? line.top : null };
    };
    const putBack = async (b) => {
      if (b.pinned) { await ours(view.jumpToBottom?.({ user: false, stale: gone })); return; }
      if (b.idx == null || typeof view.jumpToIndex !== 'function') return;
      await ours(view.jumpToIndex(b.idx, { stale: gone, land: () => {
        if (gone() || b.id == null) return;
        // the rebuilt window folds every run (r5): the record the reader read inside a run they had opened opens it again;
        // still not drawn — its run's fold line stands where the record stood, else the nearest drawn record
        const boxed = (rid) => { const e = view._elements.get(rid); return !!e && e.isConnected && e.getClientRects().length > 0; };
        let el = view._elements.get(b.id) || null;
        if (el && !boxed(b.id)) view.revealRecord?.(el);
        if (el && !boxed(b.id)) {
          const fold = view._runs?.find((r) => r.members?.includes(el))?.header, at = drawnAt(this._records(), b.id, boxed);
          el = fold && fold.isConnected && fold.getClientRects().length ? fold : at != null ? view._elements.get(at) : null;
        }
        if (!el) return;
        const d = el.getBoundingClientRect().top - b.top;
        if (Math.abs(d) >= 1) { view._traceExpect?.('needsPutBack'); view._messageList.scrollTop += d; }
      } }));
    };
    const now = here();
    if (now) return now;
    if (missed) return said();
    // a seek slab has no index space: the live end first
    if (view._teleported && typeof view.jumpToBottom === 'function') {
      let landed = null;
      const moved = await ours(view.jumpToBottom({ land: () => !gone() && !!(landed = here()), stale: gone }));
      if (landed) return landed;
      if (gone() || moved === false) return null; // (a tail that could not be read: said by the jump, nothing moved — r4)
      if (missed) return said();                  // (the jump positioned the tail it loaded — no put-back: the doc above)
    }
    // ③ its record outside what is loaded: the history read TOWARD it — up or down (r2: only upward, and an ask filed BELOW
    //   a window loaded mid-history was called «no record») — and the window loaded there (jumpToIndex, S1's road)
    let idx = null, back = null; // (what the reader had before the first jump that rebuilt the window — ③'s or ④'s)
    if (view._canPaginate !== false && typeof view.jumpToIndex === 'function') {
      let rec = null;
      idx = await this._anchorIndex(item, (r) => { rec = r; });
      if (gone()) return null;
      if (rec && idx >= 0) { proved = rec.id; (this._filed || (this._filed = new Map())).set(filing, rec.id); }
      if (rec && this._records().some((r) => r.id === rec.id)) { // in the window: a hit, never «not drawn» (r3)
        const t2 = here();
        if (t2) return t2;
        if (missed) return said();
      } else if (idx != null && idx >= 0) {
        let landed = null;
        back = backOf();
        const moved = await ours(view.jumpToIndex(idx, { land: () => { if (!gone()) landed = here(); }, stale: gone }));
        if (landed) return landed;
        if (gone() || moved === false) return null; // (a page that could not be read: said by the jump, nothing moved — r4)
        if (missed) { await putBack(back); return gone() ? null : said(); } // the jump rebuilt the window, the show failed: put back (r4)
      }
    }
    // ④ no record (−1: filed before the conversation's first record — a fact of THIS read), or unknown: an open card takes
    //   the dock at the END (the live end loaded first) and its dock line says which; anything else, the end
    const tail = () => {
      const t3 = here();
      if (t3 || !isCard || missed) return t3;
      const was = [this._dockPick, this._dockNoRecord];
      this._dockPick = item.id;
      this._dockNoRecord = idx === -1;
      this.render({ hold: true });
      const card = this._cardOf(item.id);
      if (card && show(card)) return 'dock';
      [this._dockPick, this._dockNoRecord] = was; this.render({ hold: true }); // a dock that did not land keeps no pick (r4)
      return null;
    };
    let tried = false;
    if (view._teleported || view._windowEnd < view._total) {
      let landed = null;
      if (!back && !view._teleported) back = backOf(); // (a seek slab has no index space to put back — the doc above)
      const moved = await ours(view.jumpToBottom?.({ land: () => { if (gone()) return false; tried = true; landed = tail(); return !!landed; }, stale: gone }));
      if (landed) return landed;
      if (gone() || moved === false) return null; // a tail that could not be read: said ONCE by the jump — no scroll, no pick (r4)
      if (missed && back) { await putBack(back); return gone() ? null : said(); } // the tail loaded, the show failed: put back (r5)
    }
    if (!tried) { const t4 = tail(); if (t4) return t4; }
    if (missed) return said();
    view._scrollToBottom?.();
    return 'end';
  }

  /** Land `el` whole (fit) and flash it once — the product's attention flash (S1's jump); a card first takes the open slot. */
  _show(el) {
    const view = this.view;
    if (!el || !el.isConnected) return false;
    const host = el.closest('.chat-msg');
    // A LANDING UNFOLDS WHAT IT LANDS ON (r2 — a resolved ask's record sat in a closed run, display:none, and the list ran to
    // scrollTop 0): the run that holds it opened; a target with no box is never landed on — and A FAILED SHOW LEAVES NO MARK
    // (r3 — it stamped the view's navigation and unpinned before this check: the landing's own gone() read the stamp as the
    // reader's move, said nothing, docked nothing, and a pinned reader stopped following the tail): the press is stamped and
    // the pin let go only for a show that lands
    if (host && !host.getClientRects().length) view.revealRecord?.(host);
    if (!el.getClientRects().length) return false;
    if (el.classList.contains('cn-fold')) { this._slot = el.dataset.item; this.render({ hold: true }); } // the landed card takes the open slot (the accordion; the card is patched in place)
    view._noteUserNav?.('jumpToAsk');
    view._setPinned(false, 'jumpToAsk');
    if (host) host.style.contentVisibility = 'visible';
    view._scrollElStable ? view._scrollElStable(el, { fit: true }) : el.scrollIntoView({ block: 'center' });
    el.classList.remove('chat-ask-flash'); void el.offsetWidth; el.classList.add('chat-ask-flash');
    setTimeout(() => el.classList.remove('chat-ask-flash'), 1800);
    return true;
  }

  /** THE LANDING's read: the history outside the loaded window, toward the filing — up or down — through the view's own page
   *  read (the road its paging takes) → the server index of the record that filed `item`, -1 = none (the conversation's
   *  first record is after it), null = unknown (PURE filingIndex); `onHit(row)` = the record it names (r3: a hit inside the
   *  window lands there by its id). */
  _anchorIndex(item, onHit = null) {
    const view = this.view;
    if (typeof view._fetchMessages !== 'function') return Promise.resolve(null);
    const readPage = async (offset, limit) => {
      const msgs = await view._fetchMessages(offset, limit);
      if (view._disposed) throw new Error('the view is gone');
      return (msgs || []).map(leanRecord);
    };
    const start = view._windowStart || 0;
    return filingIndex(item, readPage, { start, end: Number.isFinite(view._windowEnd) ? view._windowEnd : null, total: Number.isFinite(view._total) ? view._total : null, rows: this._records(), onHit });
  }
}
