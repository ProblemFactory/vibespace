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
//   · WHAT — THE row (src/lib/user-todos-row.js renderRow / patchRow through the panel's app.foryouRows — the mini inbox's
//     context): the row's words, its detail fold, its options as chips, its Reply / Allow / Deny / Mark done / Dismiss —
//     and the SAME verbs and routes (the panel's rowClick({mini: true}), wired per card) — never a second implementation;
//   · LIVE — the For-you store's broadcast (inboxModel 'todos') is the signal on every client, no polling: a card answered
//     anywhere (the tray, a phone, another page) is PATCHED in place — keyed by the item id, never the transcript
//     re-rendered — and stays a quiet one-line record («approved · 2 min ago», settledWords) while the snapshot's resolved
//     tail holds it;
//   · THE CHIP — the status bar's «waiting for you · N» (chipWords): its click lands the newest card whole and flashes it
//     (S1's jump); it stands after a reload (the store is fetched on boot). ONE SOURCE (acceptance round 2, P3): the chip
//     counts the open cards THIS pass drew — never the store's list beside them — so it and the cards change in the same
//     frame (a filing ⇒ N+1 both, an answer ⇒ N both);
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
import { agoText, boxInUse } from './user-todos-row.js';
import { needsOf, recordsOf, placementOf, chipWords, settledWords, KIND_WORDS } from '../foryou-actions.js'; // PURE: THE For-you action registry — which items, where, the words

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
    try { placed = this._pass(); } finally { recs = probe.takeRecords(); probe.disconnect(); }
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
  _pass() {
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
    for (const c of view._messageList.querySelectorAll(':scope > * > .cn-cards > .cn-card')) {
      if (listed.has(c.dataset.item) || !c._item || !boxInUse(c.querySelector('.ut-reply'))) continue;
      done.push({ item: todos.resolved.find((i) => i.id === c.dataset.item) || todos.open.find((i) => i.id === c.dataset.item) || c._item, kind: c.dataset.kind || 'check' });
    }
    // the common case — nothing of this conversation's: no transcript walk on every appended record, only what is left to clear
    if (!open.length && !done.length) {
      for (const c of view._messageList.querySelectorAll(':scope > * > .cn-cards')) if (!boxInUse(c.querySelector('.ut-reply'))) c.remove();
      view._statusBar?.setNeeds?.(null);
      this._seen.clear(); // nothing waits: whatever is filed next is a filing
      if (this._openIds) { this._openIds = ''; try { view._updateRuns?.(); } catch { } }
      return 0;
    }
    const transcript = (view._messages || []).map(leanRecord);
    const lastId = transcript.length ? transcript[transcript.length - 1].id : null;
    // THE ACCORDION: the open slot moves on a FILING only — an id this view has not seen waiting (the newest of them; a
    // view's first pass sees every one as new); a resolution never moves it (round 3, #3)
    const fresh = open.filter((e) => !this._seen.has(e.item.id));
    if (fresh.length) this._slot = newestOf(fresh).item.id;
    this._seen = new Set(open.map((e) => e.item.id));
    const openSlot = this._slot;
    // every card → its anchor element (an anchor not rendered = no card there; an open card's fallback is the end)
    const want = new Map(); // anchor element → [{item, kind, resolved}]
    for (const e of [...open.map((x) => ({ ...x, resolved: false, fold: x.item.id !== openSlot })), ...done.map((x) => ({ ...x, resolved: true }))]) {
      const p = placementOf(e.item, transcript, { resolved: e.resolved });
      let el = p.at != null ? view._elements.get(p.at) : null;
      if ((!el || !el.isConnected) && !e.resolved && lastId != null) el = view._elements.get(lastId);
      if (!el || !el.isConnected || el.parentNode !== view._messageList) continue;
      if (!want.has(el)) want.set(el, []);
      want.get(el).push(e);
    }
    // the cards on screen now, by item id
    const have = new Map();
    for (const c of view._messageList.querySelectorAll(':scope > * > .cn-cards > .cn-card')) have.set(c.dataset.item, c);
    const placed = new Set();
    const shown = []; // THE CHIP's rows: the open cards this pass drew (one source — never the list beside them)
    for (const [el, entries] of want) {
      let holder = el.querySelector(':scope > .cn-cards');
      if (!holder) { holder = document.createElement('div'); holder.className = 'cn-cards'; el.append(holder); }
      let prev = null;
      for (const e of entries) {
        let card = have.get(e.item.id);
        // a card whose reply box is in use is never moved under the typist (moving a focused box blurs it) — it waits
        if (card && card.parentNode !== holder && boxInUse(card.querySelector('.ut-reply'))) { placed.add(e.item.id); if (!e.resolved) shown.push(e); continue; }
        // ONE card that fails to draw is said and skipped — the pass goes on to the chip (a throw here once left the chip at
        // the last pass's count beside the cards this pass had already drawn)
        try { if (!card) card = this._create(e); else this._patch(card, e); } catch (err) { console.warn('[chat-needs] a card failed to draw:', e.item.id, err); continue; }
        const slot = prev ? prev.nextElementSibling : holder.firstElementChild;
        if (card !== slot) holder.insertBefore(card, slot);
        prev = card;
        placed.add(e.item.id);
        if (!e.resolved) shown.push(e);
      }
    }
    for (const [id, card] of have) if (!placed.has(id) && !boxInUse(card.querySelector('.ut-reply'))) card.remove();
    for (const h of view._messageList.querySelectorAll(':scope > * > .cn-cards')) if (!h.firstElementChild) h.remove();
    // THE CHIP (the status bar) — the cards just drawn, in the same pass — + a fold that must open for a card that waits
    view._statusBar?.setNeeds?.(chipWords(shown, t));
    // the run fold keeps a record holding an open card or a kept box (chat-view.js) — re-decided when either set changes
    const openIds = open.map((e) => e.item.id).join('|') + '#' + [...view._messageList.querySelectorAll(':scope > * > .cn-cards > .cn-card.cn-kept')].map((c) => c.dataset.item).join('|');
    if (openIds !== this._openIds) {
      this._openIds = openIds;
      try { view._updateRuns?.(); } catch { }
    }
    return placed.size;
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
      const sig = `done\u0000${e.item.status}\u0000${e.item.resolvedBy || ''}\u0000${words}`;
      const verb = settledWords(e.item, t, kind);
      const ago = agoText(e.item.resolvedAt || e.item.createdAt, t);
      const line = `<span class="cn-line-mark" aria-hidden="true">${e.item.status === 'dismissed' ? '✕' : '✓'}</span><span class="cn-line-verb">${escHtml(verb)}</span><span class="cn-line-ago"> · ${escHtml(ago)}</span><span class="cn-line-words"> — ${escHtml(words)}</span>`;
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

  /** THE CHIP's click: the newest waiting card, landed whole and flashed (S1's jump). → whether it landed. */
  jumpToNewest() {
    const view = this.view;
    const cards = [...view._messageList.querySelectorAll(':scope > * > .cn-cards > .cn-card.cn-open')];
    if (!cards.length) return false;
    const el = cards.reduce((a, b) => (Number(b.dataset.at) >= Number(a.dataset.at) ? b : a));
    if (el.classList.contains('cn-fold')) { this._slot = el.dataset.item; this.render({ hold: true }); } // the newest takes the open slot (the accordion; the card is patched in place)
    view._noteUserNav?.('jumpToAsk');
    view._setPinned(false, 'jumpToAsk');
    const host = el.closest('.chat-msg');
    if (host) host.style.contentVisibility = 'visible';
    view._scrollElStable ? view._scrollElStable(el, { fit: true }) : el.scrollIntoView({ block: 'center' });
    el.classList.remove('chat-ask-flash'); void el.offsetWidth; el.classList.add('chat-ask-flash');
    setTimeout(() => el.classList.remove('chat-ask-flash'), 1800);
    return true;
  }
}
