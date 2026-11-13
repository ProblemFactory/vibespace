'use strict';
// THE CONNECTION NOTICE (lane connection-notice-once; the owner on a phone, 2026-11-06: «以后别拿这个刷屏了吧» — a chat's
// tail was nothing but alternating «已与服务器断开» / «已重新连接»). A connection state is ONE live notice, never a log line
// per event: every socket cycle used to append two system rows to the transcript.
//
//   ① ONE ROW, PATCHED IN PLACE. A drop shows one row; the reconnect rewrites THAT row («已重新连接 · 断开 12 秒»); a later
//     cycle with no message in between rewrites it again and counts («连接不稳定：断开 N 次，最近 21:01 已重连»). A new row
//     is born only when real messages arrived since the last one — the view's `_total`, the very number the pager reads, is
//     the witness, so a message the reader has not scrolled to (counted, not drawn) starts a new stretch too.
//   ② A STATUS ROW IS NOT A MESSAGE. DOM only: never persisted, never sent, gone on a reload (the server's messages re-render).
//     The row deliberately does NOT carry `.chat-msg`: every reader of the window's cards selects on that class — the trim's
//     count and its bounds arithmetic (`_trimEdge`: 2 rows per cycle counted toward the DOM ceiling, and a trim of nothing
//     but rows moved `_windowStart` / `_windowEnd` by the rows it dropped — a pager that lied), the index landings of search
//     and jumpToIndex, the nearest-timestamp walks. It DOES carry `.chat-msg-system`, so every rebuild's sweep takes it.
//   ③ IT KEEPS ITS AGE. A patch does not re-stamp the row, and moves it only when history was paged in below it:
//     `data-first-at` + the tooltip stay the first drop's time, the words carry the latest.
//   ④ A CYCLE NOBODY COULD HAVE NOTICED IS NOT A NOTICE (round 2). Measured on Chrome: a frozen page loses its socket and hears the
//     close at the resume, however short the freeze (10 / 40 / 70 s), back in 2–3 s, nothing lost. Counting those made
//     «断开 N 次» a count of unlocks. So a cycle that BEGINS while the page is hidden or frozen says nothing and counts nothing, unless:
//       – the re-attach asked to resume by seq and the hub could not (`answered(true)`): the frames fell off its ring. One row, at the resume.
//       – the socket is still down WAKE_RETRY_WINDOW_MS after the page woke: the person is looking at a chat with no server. One row.
//     A drop while the page is awake is always the notice, whoever cut it. A hub's cut of a sleeping page is NOT a miss by itself:
//     a radio that sleeps answers no ping, so the heartbeat cuts it within 60 s on any long lock (the two-miss rule; not measured on a
//     phone), and the seq resume still loses nothing. The close lands around the wake (measured at a CDP resume: «hidden freeze resume down
//     visible up»), so a drop within WAKE_GRACE_MS of waking still began asleep. A row's length is the outage it measured: from the freeze's own start
//     only for the first close heard at its end (no code ran), else the socket's own clock. NOT covered: a page that sleeps with no event at all (a laptop lid with the tab still
//     «visible») reads as awake and is counted.
//
// PURE where it can be: `noticeStep` is the whole verdict. The controller owns one element and touches only `list`.

const NOTICE_CLASS = 'chat-conn-notice';
const WAKE_GRACE_MS = 5000;
const WAKE_RETRY_WINDOW_MS = 10000; // ws.js retries every 2–3 s, so this is three tries or so, room for a phone's radio to come up

/** st = null | {n, firstAt, downAt, upAt, outMs, down, mark, born}; ev = {kind: 'down'|'up', at, total} → the next state.
 *  `mark` = the real-message count this notice last spoke at; `born` = this step starts a NEW row. */
function noticeStep(st, { kind, at, total } = {}) {
  if (kind === 'down') {
    if (st && st.down) return { ...st, born: false }; // already down (ws.js tells one transition; the belt costs nothing)
    if (!st || st.mark !== total) return { n: 1, firstAt: at, downAt: at, upAt: null, outMs: null, down: true, mark: total, born: true };
    return { ...st, n: st.n + 1, downAt: at, down: true, born: false };
  }
  if (kind !== 'up' || !st || !st.down) return st ? { ...st, born: false } : null; // an up that answers no drop has nothing to say
  // the mark moves to NOW: what this reconnect's catch-up brings lands below the row and is what the next drop will read as new
  return { ...st, down: false, upAt: at, outMs: Math.max(0, at - st.downAt), mark: total, born: false };
}

function durationWords(ms, t) {
  const s = Math.max(1, Math.round((Number(ms) || 0) / 1000));
  if (s < 60) return t('{n}s', { n: s });
  const m = Math.round(s / 60);
  return m < 60 ? t('{n} min', { n: m }) : t('{n} h', { n: Math.round(m / 60) });
}

const clockWords = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The row's one line — it says what is true NOW: a second drop that has not come back never reads «已重连». */
function noticeText(st, { t, clock = clockWords }) {
  if (st.n <= 1) return st.down ? t('Disconnected from server') : t('Reconnected · down {duration}', { duration: durationWords(st.outMs, t) });
  return st.down
    ? t('Connection unstable: dropped {n} times, disconnected since {time}', { n: st.n, time: clock(st.downAt) })
    : t('Connection unstable: dropped {n} times, last reconnected {time}', { n: st.n, time: clock(st.upAt) });
}

const cardBelow = (el) => { for (let s = el.nextElementSibling; s; s = s.nextElementSibling) if (s.classList.contains('chat-msg')) return true; return false; };

/** The page's own lifecycle: asleep = hidden or frozen. One per document (every chat view shares a socket, so they share this too). */
function createPageLife({ doc = globalThis.document, now = Date.now } = {}) {
  let frozen = false, freezeOwed = false, frozeAt = null, wokeAt = null, resumedAt = null; // freezeOwed: a freeze whose close has not been answered by a reconnect; frozeAt: when it began
  const wakers = new Set();
  const asleep = () => frozen || doc.visibilityState === 'hidden';
  let was = asleep();
  const step = () => {
    const is = asleep();
    if (is === was) return;
    was = is;
    if (is) { freezeOwed = frozen; return; }
    wokeAt = now();
    for (const f of [...wakers]) f();
  };
  doc.addEventListener?.('freeze', () => { frozen = freezeOwed = true; frozeAt = now(); step(); }); // every freeze dates from its own start (r5: a second one read from the first hide)
  doc.addEventListener?.('resume', () => { frozen = false; resumedAt = now(); step(); });
  doc.addEventListener?.('visibilitychange', step);
  return {
    asleep,
    /** Did a drop heard NOW begin while the page slept? */
    beganAsleep: () => asleep() || (wokeAt != null && now() - wokeAt <= WAKE_GRACE_MS),
    /** When that outage began, as near as the page can know. A freeze dates the FIRST close heard at its end, and only that one, from the freeze's OWN start: no code ran
     *  from then, so that close comes late (the socket's own clock reads 3 s). Before it the page was hidden and running, its socket live. After a reconnect (`spend`),
     *  or past the grace after the resume, or in a sleep that never froze, the page's code ran, so a close is on time. */
    outageFrom: () => (freezeOwed && frozeAt != null && (frozen || (resumedAt != null && now() - resumedAt <= WAKE_GRACE_MS)) ? frozeAt : now()),
    /** A reconnect: the freeze's close has been heard and answered. Every view shares the socket, so all their drops read this before any of their ups spends it. */
    spend: () => { freezeOwed = false; },
    onWake: (f) => { wakers.add(f); return () => wakers.delete(f); },
  };
}
const LIVES = new WeakMap();
const pageLifeOf = (doc) => { let l = LIVES.get(doc); if (!l) { l = createPageLife({ doc }); LIVES.set(doc, l); } return l; };

/** One view's notice. `list()` = the message list, `total()` = the view's real-message count, `onPaint()` after every write
 *  (the view follows it when pinned: a new row below the fold, or longer words wrapping, must not sit under the composer). */
function createConnectionNotice({ list, t, total, now = Date.now, clock = clockWords, doc = globalThis.document, onPaint = () => {}, life = pageLifeOf(doc), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let st = null, el = null, line = null;
  let quiet = null, timer = null, offWake = null; // quiet = {at, down, upAt}: a cycle that began asleep, nothing said yet
  const paint = () => {
    // a rebuild's sweep or a trim took the row: the same stretch comes back at the tail with its count, a new one starts over
    if (st.born || !el || !el.isConnected) {
      el = doc.createElement('div');
      el.className = `chat-msg-system ${NOTICE_CLASS}`;
      el.dataset.firstAt = String(st.firstAt);
      el.title = t('First dropped at {time}', { time: clock(st.firstAt) });
      line = doc.createElement('div');
      line.className = 'chat-system';
      el.appendChild(line);
      list().appendChild(el);
    } else if (cardBelow(el)) {
      // the count did not move, so what lies below it is history paged in under a row the reader left at a window's end: it goes
      // back to the tail, or the rest of the stretch would be told somewhere nobody is looking
      list().appendChild(el);
    }
    line.textContent = noticeText(st, { t, clock });
    onPaint();
  };
  const tell = (kind, at = now()) => {
    const next = noticeStep(st, { kind, at, total: total() });
    if (!next) return;
    st = next;
    paint();
  };
  const standDown = () => { if (timer != null) clearTimer(timer); timer = null; offWake?.(); offWake = null; };
  /** The retry window runs only while someone can be looking: asleep it waits for the wake, and it starts again from there. */
  const armWindow = () => {
    standDown();
    if (!quiet?.down) return;
    if (life.asleep()) { offWake = life.onWake(armWindow); return; }
    timer = setTimer(() => {
      timer = null;
      if (!quiet?.down) return;
      if (life.asleep()) { armWindow(); return; }
      const { at } = quiet;
      quiet = null;
      tell('down', at);
    }, WAKE_RETRY_WINDOW_MS);
  };
  return {
    down() {
      if (quiet?.down) return;
      if (!st?.down && life.beganAsleep()) {
        quiet = { at: life.outageFrom(), down: true, upAt: null }; // its own start: one nobody answered (a read-only view never does) does not outlive its cycle; the next answer speaks for this one
        armWindow();
        return;
      }
      quiet = null; // awake: said out loud, and what this reconnect's answer says no longer matters
      tell('down');
    },
    up() {
      life.spend?.();
      if (quiet?.down) { quiet.down = false; quiet.upAt = now(); standDown(); return; }
      tell('up');
    },
    /** The re-attach's answer for a quiet cycle. `missed` = it asked to resume by seq and the hub could not. */
    answered(missed) {
      if (!quiet || quiet.down) return;
      const { at, upAt } = quiet;
      quiet = null;
      if (!missed) return;
      tell('down', at);
      tell('up', upAt);
    },
    dispose() { standDown(); quiet = null; },
    dropStranded: (side) => dropStrandedNotices(list(), side),
    get state() { return st; },
    get element() { return el; },
    get quiet() { return quiet; },
  };
}

/** After a trim: a row left outside the cards belongs to no window — above the first card the next page would land below it,
 *  below the last the reader's own page down would. The state stays: the next cycle brings the row back at the tail. */
function dropStrandedNotices(list, side) {
  for (const n of list.querySelectorAll(`:scope > .${NOTICE_CLASS}`)) {
    let s = side === 'bottom' ? n.nextElementSibling : n.previousElementSibling, card = false;
    while (s && !card) { card = s.classList.contains('chat-msg') && !s.classList.contains('chat-gap-msg'); s = side === 'bottom' ? s.nextElementSibling : s.previousElementSibling; }
    if (!card) n.remove();
  }
}

module.exports = { NOTICE_CLASS, WAKE_GRACE_MS, WAKE_RETRY_WINDOW_MS, noticeStep, noticeText, durationWords, createPageLife, createConnectionNotice, dropStrandedNotices };
