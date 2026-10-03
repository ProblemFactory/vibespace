// THREADS IN THE CHANNEL WINDOW (lane channel-threads, 2026-09-28 — the owner: "我发现你似乎不支持 lark 的内嵌回复
// (thread) 功能"; spec §4.1 / §4.2 W1–W2 / §4.5).
//
// THE CHOICE (§4.1): a thread opens as a SIDE PANE beside the list on a desktop and as a PUSHED VIEW over it on a
// phone (PURE `paneMode`, the inbox window's 620 px rule) — NEVER an inline expansion: the list's paging machine
// (`pageUpVerdict`, the keep zone, the serial queue) assumes every row is a message at its `(at, vendorId)` place,
// and a thread needs its OWN composer, its own upward page (a separately-listed thread's older replies are a second
// metered belt) and its own viewport for the reaction trickle — a second list is a pane.
//
// THIS MODULE: the row's two PLACE facts (the quote line of what a reply answers, the thread chip on a root, the
// "in thread" tag on a reply the main list shows) and the pane itself. Every vendor string is textContent; the
// only icons are the library's SVG. The pane is ONE per window (another thread REPLACES its content, keyed by
// thread; each thread keeps its scroll and its draft), never persisted in the layout (a replayed window opens on
// its list — a persisted pane would replay a vendor walk at boot).
import { fetchJson, showToast } from './utils.js';
import { t, tc } from './i18n.js';
import { icon, el, btn } from './channel-chrome.js';
import { routeErrorText } from './channel-words.js';
import * as chanCaps from '../channel-caps.js';
import { paneMode, firstLine } from '../channel-thread.js';
import { composerMode } from './channel-groups-view.js';
// the window's ONE paging verdict (a scroll event is displacement; the person's input is intent) — the pane's older
// page is a metered vendor walk where replies are listed separately, so it is asked of the same PURE rule
import { pageUpVerdict, isUpKey, isTypingTarget, wheelTowardOlder } from './channel-paging.js';

/** W1 — THE QUOTE LINE above a reply's body: `↩ author: first line` as a button (a click jumps to the parent);
 *  a parent not loaded / in another chat is said in words, never a blank. `onJump(vendorId, place)`. */
export function quoteLine(place, { onJump = null } = {}) {
  const q = place && place.quote;
  if (!q) return null;
  // quote-vs-topic (owner 2026-09-28): a QUOTE (and a quote inside a topic) says it QUOTES — the classifier's kind; a
  // topic reply answers its root. The strip is the same button either way (a click jumps to the original)
  const quoting = !!(place && (place.kind === 'quote' || place.kind === 'topic-quote'));
  if (q.external) {
    const s = el('div', 'chanmsg-replyq chanmsg-replyq-dim');
    s.dataset.placeKind = (place && place.kind) || '';
    s.appendChild(icon('reply', 11));
    s.appendChild(el('span', 'chanmsg-replyq-text', quoting ? t('quoting a message in another chat') : t('replying to a message in another chat')));
    return s;
  }
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chanmsg-replyq' + (q.loaded ? '' : ' chanmsg-replyq-dim');
  b.dataset.replyOf = q.of || '';
  b.dataset.placeKind = (place && place.kind) || '';
  b.appendChild(icon('reply', 11));
  if (q.loaded) {
    b.appendChild(el('b', 'chanmsg-replyq-who', q.author || t('unknown')));
    b.appendChild(el('span', 'chanmsg-replyq-text', q.text || ''));
    b.title = quoting ? t('Show the quoted message') : t('Show the message this one answers');
  } else {
    b.appendChild(el('span', 'chanmsg-replyq-text', quoting ? t('quoting a message not loaded') : t('replying to a message not loaded')));
    b.title = t('That message is older than what is loaded — scroll up to load it');
  }
  b.onclick = (ev) => { ev.stopPropagation(); onJump && onJump(q.of, place); };
  return b;
}

/** A place the ONE classifier calls a topic (`topic-root` / `topic-reply` / `topic-quote`) — a quote never is. */
export const isTopicPlace = (place) => !!(place && typeof place.kind === 'string' && place.kind.startsWith('topic-') && place.thread);
/** W2 — THE THREAD CHIP in a root's head: `N replies · last 5m` (a separately-listed thread never walked says
 *  "in thread · open to load" — never a number the vendor did not confirm); null when there is nothing to open. */
export function threadChip(place, { onOpen = null, now = Date.now() } = {}) {
  const th = place && place.thread;
  // quote-vs-topic (owner 2026-09-28): only a TOPIC's root — the ONE classifier's word (`placeKindOf`, the kind the
  // server's `placeOf` carries), never "has a thread fact": a message quotes answer heads nothing
  if (!th || !th.isRoot || !isTopicPlace(place)) return null;
  const unwalked = th.separate && !th.walked && th.kind === 'vendor';
  if (!(th.count > 0) && !unwalked) return null;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chanmsg-thread-chip';
  b.dataset.threadKey = th.key;
  b.appendChild(icon('thread', 11));
  b.appendChild(el('span', 'chanmsg-thread-words', threadChipText(th, now)));
  b.title = t('Open the thread');
  b.onclick = (ev) => { ev.stopPropagation(); onOpen && onOpen(th); };
  return b;
}
/** The chip's words (re-spelled in place by a `threads` broadcast). */
export function threadChipText(th, now = Date.now()) {
  if (!(th.count > 0) && th.separate && !th.walked) return t('in thread · open to load');
  const age = th.lastAt ? chanCaps.humanAge(Math.max(0, (now - Number(th.lastAt)) / 1000)) : '';
  const n = t('{n} replies', { n: th.count });
  return age ? `${n} · ${t('last {age}', { age })}` : n;
}
/** The dim "in thread" tag on a reply the main list shows INSIDE A TOPIC (a click opens the pane on its root). A QUOTE
 *  (a Lark reply without reply_in_thread) gets none — it is a quote, shown in the list with its quoted original. */
export function inThreadTag(place, { onOpen = null } = {}) {
  const th = place && place.thread;
  if (!th || th.isRoot || th.kind === 'conversation' || !isTopicPlace(place) || place.kind === 'topic-root') return null;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chanmsg-in-thread';
  b.dataset.threadKey = th.key;
  b.appendChild(icon('thread', 10));
  b.appendChild(el('span', '', t('in thread')));
  b.title = t('Open the thread');
  b.onclick = (ev) => { ev.stopPropagation(); onOpen && onOpen(th); };
  return b;
}

const PANE_PAGE = 50;
/**
 * THE THREAD PANE (§4.5). `host` = the window's split container; `ctx` = { app, base, adapterId, convId,
 * renderRecord(rec, {cont, inPane, rootVid}), getConv() (the conversation view the window last drew — offers,
 * policy), observe(rowsRoot) (the reaction trickle's second viewport), onClose(key) }. Returns the pane handle:
 * `{open(th), close(), refresh(), applyPatches(map), applyThreads(map), onConversation(), key(), el, mode()}`.
 */
export function createThreadPane(host, ctx) {
  const pane = el('div', 'chanthread');
  pane.hidden = true;
  pane.setAttribute('role', 'region');
  const bar = el('div', 'chanthread-bar');
  const list = el('div', 'chanthread-list');
  list.tabIndex = -1;
  const foot = el('div', 'chanthread-foot');
  pane.append(bar, list, foot);
  host.appendChild(pane);
  let cur = null;             // {key, root, count, separate, walked}
  let returnFocus = null;
  const drafts = new Map();   // threadKey → the composer's text (per thread, survives a switch, a minimize)
  const scrolls = new Map();  // threadKey → scrollTop
  const targets = new Map();  // threadKey → the reply being answered (null = the root)
  const drawn = new Set();
  let queue = Promise.resolve();
  const serial = (fn) => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };
  let oldest = null;
  let beat = null;

  const mode = () => paneMode(host.clientWidth || 0);
  const applyMode = () => { pane.classList.toggle('chanthread-stacked', mode() === 'stacked'); pane.classList.toggle('chanthread-side', mode() === 'side'); host.classList.toggle('chanwin-split-open', !pane.hidden && mode() === 'side'); drawBar(); };
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(() => { if (!pane.hidden) applyMode(); }); ro.observe(host); }

  function drawBar(rootRec) {
    if (!cur) return;
    bar.textContent = '';
    if (mode() === 'stacked') {
      const back = document.createElement('button');
      back.type = 'button'; back.className = 'icon-btn chanthread-back';
      back.appendChild(icon('chevronLeft', 13));
      back.title = t('Back'); back.setAttribute('aria-label', t('Back'));
      back.onclick = () => close();
      bar.appendChild(back);
    }
    bar.appendChild(icon('thread', 12));
    const head = el('div', 'chanthread-head');
    head.appendChild(el('b', '', tc('channel', 'Thread')));
    const r = rootRec || cur.rootRec;
    if (r) head.appendChild(el('span', 'chanthread-root', `${(r.author && (r.author.name || r.author.id)) || ''}: ${firstLine(r.text, 60)}`));
    const n = el('span', 'chanthread-count', t('{n} replies', { n: cur.count || 0 }));
    n.dataset.threadCount = '1';
    head.appendChild(n);
    bar.appendChild(head);
    if (mode() === 'side') {
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'icon-btn chanthread-close';
      x.appendChild(icon('close', 12));
      x.title = t('Close'); x.setAttribute('aria-label', t('Close'));
      x.onclick = () => close();
      bar.appendChild(x);
    }
  }

  function rowsOf(recs, rootVid) {
    const frag = document.createDocumentFragment();
    for (const rec of recs) {
      if (!rec || !rec.vendorId || drawn.has(rec.vendorId)) continue;
      drawn.add(rec.vendorId);
      const row = ctx.renderRecord(rec, { cont: false, inPane: true, rootVid });
      if (rec.vendorId === rootVid) { row.classList.add('chanthread-rootrow'); frag.appendChild(row); frag.appendChild(el('div', 'chanthread-rule')); continue; }
      // a reply to answer (a nested reply — Lark keeps parent_id inside a topic) is picked from the row's hover action
      // bar (lane reaction-hover: "Reply to this message in the thread" — `pick(rec)` below), never a button in the row
      frag.appendChild(row);
    }
    return frag;
  }

  async function load({ prepend = false } = {}) {
    if (!cur) return 0;
    const q = new URLSearchParams({ limit: String(PANE_PAGE) });
    if (prepend && oldest) { q.set('before', String(oldest.at)); q.set('beforeId', oldest.vendorId); }
    const r = prepend
      ? await fetchJson(`${ctx.base}/thread/${encodeURIComponent(cur.root || cur.key)}/older`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ before: oldest ? oldest.at : null, beforeId: oldest ? oldest.vendorId : null, limit: PANE_PAGE }) })
      : await fetchJson(`${ctx.base}/thread/${encodeURIComponent(cur.root || cur.key)}?${q}`);
    if (!r || r.error) { if (r && r.error && !prepend) list.appendChild(el('div', 'chanwin-empty', routeErrorText(r))); return 0; }
    // verify r3: a REFUSED older page (the per-thread floor, the budget) is not the thread's start — it is asked again
    // on the next input; a walk that stopped at the channel's own bound says so at the top of the replies
    if (prepend && (r.exhausted || r.vendorHasNoOlder) && !(r.records || []).length && !r.refused) {
      exhausted = true;
      if (r.olderBeyondReach && !list.querySelector('.chanthread-beyond')) {
        const rule = list.querySelector('.chanthread-rule');
        list.insertBefore(el('div', 'chanthread-note chanthread-beyond', t("Older replies of this thread cannot be loaded here — the channel lists a thread from its newest replies; open it in the channel's own app to read further back")), rule ? rule.nextSibling : list.firstChild);
      }
    }
    if (r.thread) { cur.count = r.thread.count; cur.separate = !!r.thread.separate; cur.walked = !!r.thread.walked; if (r.thread.root) cur.root = r.thread.root; if (r.thread.key) cur.key = r.thread.key; }
    const recs = r.records || [];
    if (!prepend && recs[0] && recs[0].vendorId === cur.root) cur.rootRec = recs[0];
    const replies = recs.filter((x) => x.vendorId !== cur.root);
    if (replies.length) oldest = { at: replies[0].at, vendorId: replies[0].vendorId };
    // a reply that arrived under a "No replies yet." line (a new thread's first reply) takes the line's place
    if (!prepend && recs.some((x) => x && x.vendorId && !drawn.has(x.vendorId))) for (const e of list.querySelectorAll(':scope > .chanwin-empty')) e.remove();
    if (prepend) { const rule = list.querySelector('.chanthread-rule'); list.insertBefore(rowsOf(recs, cur.root), rule ? rule.nextSibling : list.firstChild); }
    else list.appendChild(rowsOf(recs, cur.root));
    // lane reaction-hover: a NEW thread (Reply in thread on a message that heads none yet) — the message it answers is
    // drawn as its root from the record the window holds, and the pane says there are no replies (never "not loaded")
    const fresh = !prepend && !recs.length && !!cur.fresh && !!cur.rootRec;
    if (fresh && !drawn.has(cur.rootRec.vendorId)) list.appendChild(rowsOf([cur.rootRec], cur.root));
    if (recs.length) cur.fresh = false;
    if (!prepend && r.code === 'thread-not-loaded' && !fresh) list.appendChild(el('div', 'chanwin-empty', t('this thread is not loaded yet — opening it loads it')));
    if (!prepend && !recs.length && (r.code !== 'thread-not-loaded' || fresh)) list.appendChild(el('div', 'chanwin-empty', t('No replies yet.')));
    if (r.refused && !recs.length) showToast(routeErrorText({ code: r.refused, retryAfterSec: r.retryAfterSec }), { type: 'warn' });
    ctx.observe && ctx.observe(list);
    drawBar();
    return recs.length;
  }

  async function renderNow() {
    list.textContent = '';
    drawn.clear();
    oldest = null;
    exhausted = false;
    await load({});
    drawFoot();
    const s = scrolls.get(cur.key);
    list.scrollTop = s === undefined ? list.scrollHeight : s;
  }

  /** The walk (spec §3.1 a): the pane's open asks the vendor for a separately-listed thread (floored server-side). */
  async function walk() {
    if (!cur || !cur.separate) return;
    const r = await fetchJson(`${ctx.base}/thread/${encodeURIComponent(cur.root || cur.key)}/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (r && r.error && r.code !== 'thread-floor') {
      // the refusal's sentence, never a spinner forever (§6.5): the local replies stay drawn
      const note = el('div', 'chanthread-note', routeErrorText(r));
      list.appendChild(note);
    }
    if (r && r.ok && r.appended) await serial(renderNow);
  }

  function drawFoot(keepFocus = false) {
    const conv = ctx.getConv ? ctx.getConv() : null;
    const typed = (foot.querySelector('textarea') || {}).value;
    if (cur && typed !== undefined) drafts.set(cur.key, typed);
    foot.textContent = '';
    if (!cur) return;
    const offer = conv && conv.offers && conv.offers.threadReply;
    // naive-user pass (2026-09-28): the per-reply ↩ "reply to this message in the thread" is a composer control — where
    // the composer is the read-only line (a read-only / disabled account, a group without topic replies) it did
    // nothing at all (on a touch device it is always shown). The foot is where the offer is judged, so it says it here.
    pane.classList.toggle('chanthread-noreply', !(offer && offer.offered));
    if (!offer || !offer.offered) {
      const ro = el('div', 'chanwin-readonly');
      ro.dataset.threadReadonly = '1';
      ro.appendChild(el('span', '', t('Read-only here ({why})', { why: chanCaps.threadWhyText((offer && offer.why) || 'unknown', { t }) })));
      foot.appendChild(ro);
      return;
    }
    const cm = composerMode({ conv });
    const direct = cm.mode === 'direct';
    const comp = el('div', 'chanwin-composer chanthread-composer');
    const target = targets.get(cur.key);
    if (target) {
      const tl = el('div', 'chanthread-target');
      tl.appendChild(icon('reply', 10));
      tl.appendChild(el('span', '', t('Replying to {who}', { who: target.who || t('unknown') })));
      const x = document.createElement('button'); x.type = 'button'; x.className = 'icon-btn'; x.appendChild(icon('close', 10));
      x.title = t('Reply to the thread instead'); x.setAttribute('aria-label', t('Reply to the thread instead'));
      x.onclick = () => { targets.delete(cur.key); drawFoot(true); };
      tl.appendChild(x);
      comp.appendChild(tl);
    }
    const ta = document.createElement('textarea');
    ta.placeholder = t('Reply in thread…');
    ta.rows = 2;
    ta.value = drafts.get(cur.key) || '';
    ta.addEventListener('input', () => drafts.set(cur.key, ta.value));
    const row = el('div', 'chanwin-composer-row');
    const note = el('div', 'chanwin-note');
    note.appendChild(el('span', 'chanwin-note-text', `${t('Lands inside this thread')} · ${direct ? t('Sent at once, as you') : t('Proposed — sending as you is not offered here')}`));
    const send = btn(direct ? t('Send') : t('Propose'), null, 'mounts-btn-primary');
    send.dataset.threadSend = '1';
    if (direct) send.prepend(icon('send', 11));
    send.onclick = async () => {
      const text = ta.value.trim();
      if (!text || !cur) return;
      send.disabled = true;
      const replyTo = (targets.get(cur.key) || {}).vid || cur.root || cur.key;
      const r = await fetchJson(`${ctx.base}/${direct ? 'send' : 'propose'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, replyTo, placement: 'thread', expectWakes: 0 }) });   // 2026-09-28: the PLACEMENT (the old `inThread` is its alias)
      send.disabled = false;
      // a refusal keeps the draft (the heldDraft rule — attack 19)
      if (!r || r.error) { showToast(routeErrorText(r), { type: 'error' }); if (r && r.code === 'topic-forbidden') drawFoot(); return; }
      const st = r.proposal && r.proposal.state;
      if (st === 'failed') { showToast(t('The channel refused the send: {error}', { error: (r.proposal && r.proposal.reason) || '' }), { type: 'error' }); return; }
      // the SENT text leaves every box of this thread — a broadcast that redrew the foot while the send was in flight
      // made a new box from the draft (the text would come back after a successful send)
      drafts.delete(cur.key); targets.delete(cur.key);
      for (const x of foot.querySelectorAll('textarea')) if (x.value === ta.value || x.value.trim() === text) x.value = '';
      ta.value = '';
      showToast(st === 'sent' ? t('Sent') : st === 'awaiting-approval' ? t('Held in the outbox for your approval ({why})', { why: '' }) : t('Proposal {state}', { state: st || '?' }));
      drawFoot();
    };
    ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send.click(); } });
    row.append(note, send);
    comp.append(ta, row);
    foot.appendChild(comp);
    if (keepFocus) ta.focus();
  }

  /** THE REPLY TARGET (lane reaction-hover — the row's hover bar): `rec` = the reply this one answers inside the
   *  thread, null = the thread itself (its root). Where the thread cannot be answered the foot says so; nothing here. */
  const whoOf = (rec) => (rec && rec.author && (rec.author.name || rec.author.id)) || '';
  function pick(rec) {
    if (!cur || pane.classList.contains('chanthread-noreply')) return;
    if (rec && rec.vendorId && rec.vendorId !== cur.root) targets.set(cur.key, { vid: rec.vendorId, who: whoOf(rec) });
    else targets.delete(cur.key);
    drawFoot(true);
  }
  /** `th` = the thread (`fresh` + `rootRec`: a new thread on a message that heads none — the vendor mints it with the
   *  first reply); `target` = the reply to answer inside it (a message the main list shows inside a topic), null = the
   *  thread itself, undefined (a chip's open) = the target this thread last had. */
  function open(th, { from = null, target = undefined, focus = false } = {}) {
    if (!th) return;
    if (cur) { scrolls.set(cur.key, list.scrollTop); const ta = foot.querySelector('textarea'); if (ta) drafts.set(cur.key, ta.value); }
    returnFocus = from || null;
    cur = { key: th.key, root: th.root || null, count: th.count || 0, separate: !!th.separate, walked: !!th.walked, rootRec: th.rootRec || null, fresh: !!th.fresh };
    if (target && target.vendorId && target.vendorId !== cur.root) targets.set(cur.key, { vid: target.vendorId, who: whoOf(target) });
    else if (target !== undefined) targets.delete(cur.key);
    pane.hidden = false;
    pane.dataset.threadKey = th.key;
    applyMode();
    // the bar's Reply in thread hands the keyboard to the pane's composer (a chip's open leaves it where it was)
    serial(renderNow).then(() => { if (focus) { const ta = foot.querySelector('textarea'); if (ta) ta.focus({ preventScroll: true }); } return walk(); }).catch(() => {});
    if (beat) clearInterval(beat);
    // the pane's heartbeat (§3.1 b): a separately-listed thread is walked again while it is open (floored server-side)
    beat = setInterval(() => { if (!pane.hidden) walk().catch(() => {}); }, 60e3);
  }
  function close() {
    if (!cur) return;
    scrolls.set(cur.key, list.scrollTop);
    const ta = foot.querySelector('textarea'); if (ta) drafts.set(cur.key, ta.value);
    const key = cur.key;
    pane.hidden = true;
    host.classList.remove('chanwin-split-open');
    if (beat) { clearInterval(beat); beat = null; }
    cur = null;
    ctx.onClose && ctx.onClose(key);
    // focus returns to where the thread was opened from (the lane-J keyboard rule)
    // …WITHOUT scrolling the list to it (the reading position is the list's own — a Back never moves it)
    if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
  }
  pane.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.target.closest('.rx-picker')) { e.stopPropagation(); close(); } });
  // AN UPWARD PAGE INSIDE THE PANE — the window's PURE `pageUpVerdict` (the render verify rounds 3–6): a scroll event
  // pages only with the person's input toward older on record, on a room no smaller than it saw; a wheel up / an up
  // key at the top asks directly; a page that landed nothing holds. Server-side the pane's older page is the rule-19
  // shape (the per-thread floor) — this is the client's half of the same belt.
  let paging = false, inputAt = 0, roomAtInput = null, holdUntil = 0, exhausted = false;
  const roomOf = () => list.scrollHeight - list.clientHeight;
  const noteInput = () => { inputAt = Date.now(); roomAtInput = roomOf(); };
  function pageUp(cause) {
    if (!cur || !oldest) return;
    const v = pageUpVerdict({ cause, scrollTop: list.scrollTop, prepending: paging, listReady: true, historyExhausted: exhausted, inputAt, now: Date.now(), room: roomOf(), roomAtInput, holdUntil });
    if (!v.page) return;
    paging = true;
    serial(async () => {
      const before = list.scrollHeight;
      const n = await load({ prepend: true });
      if (n) list.scrollTop = list.scrollHeight - before;
      else holdUntil = Date.now() + 1500;
    }).finally(() => { paging = false; });
  }
  list.addEventListener('scroll', () => pageUp('scroll'));
  list.addEventListener('wheel', (e) => { if (wheelTowardOlder({ deltaY: e.deltaY, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, innerScrollTop: 0 })) { noteInput(); pageUp('wheel'); } }, { passive: true });
  list.addEventListener('touchmove', () => noteInput(), { passive: true });
  list.addEventListener('keydown', (e) => { if (isUpKey(e.key) && !isTypingTarget({ tagName: e.target && e.target.tagName, type: e.target && e.target.type, editable: !!(e.target && e.target.isContentEditable) })) { noteInput(); pageUp('key'); } });

  return {
    el: pane, mode, open, close, pick,
    key: () => (cur ? cur.key : null),
    isOpen: () => !pane.hidden,
    /** A conversation broadcast: new replies are appended (drawn rows untouched); the composer follows the offers. */
    onConversation: () => { if (!cur) return; serial(async () => { const before = drawn.size; await load({}); if (drawn.size !== before && list.scrollHeight - list.scrollTop - list.clientHeight < 60) list.scrollTop = list.scrollHeight; }); drawFoot(); },
    /** The window's reaction patches reach the pane's drawn rows too (the same record may be drawn in both). */
    rows: () => list,
    applyThreads: (map) => { if (!cur || !map || !map[cur.key]) return; cur.count = map[cur.key].count; const n = bar.querySelector('[data-thread-count]'); if (n) n.textContent = t('{n} replies', { n: cur.count }); },
    redrawFoot: () => drawFoot(),
  };
}
