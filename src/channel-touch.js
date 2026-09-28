'use strict';
/**
 * FROM THE CHAT TO THE CONVERSATION — THE PASSIVE WITNESS'S DECISIONS
 * (docs/design-communication-panel.zh.md §26, backlog B-099e; owner
 * 2026-09-27: "那就按照这个做吧" — plan A, passive: no agent tool, no
 * injected context).
 *
 * With hundreds of mails and Lark chats, FINDING the conversation an agent is
 * working on is the slow part — and the agent already knows. Every agent
 * read / search / reply / compose / refresh / request / status of a channel
 * conversation goes through OUR agent routes, so the server WITNESSES it
 * (src/server/channel-touches.js) and the chat draws it: a clickable row on
 * the tool call's card, a status-bar chip for the turn, and a reverse link in
 * the conversation window. This module is every DECISION of that, PURE
 * (imports nothing; CommonJS so the server witness and the bundle share ONE
 * spelling of every rule — the task-color-seq / quota-model pattern):
 *
 *  - `normalizeTouch` / `touchKey` / `appendTouch`: the touch record, its
 *    conversation key (a composed message has none yet: `<account>/~compose/
 *    <proposal>`), the ring (RING_MAX, the newest kept; a repeat of the same
 *    op on the same conversation inside MERGE_MS folds into the previous
 *    touch — an agent's read loop is one touch, not 200 that evict the rest).
 *  - `bindToCall`: WHICH TOOL CARD A TOUCH BELONGS TO. A call RUNS from its
 *    own instant until the next call that is not part of its parallel batch
 *    starts (a sequential agent issues the next call only after the previous
 *    returned) or until the next non-tool message; a touch whose instant a
 *    running call contains belongs to it — among several, one whose command
 *    NAMES the touch (its conversation key, `vibespace-channels search`, a
 *    compose on that account, the proposal id) first, else the latest to
 *    start. Nothing contains it ⇒ the view's LATEST card when the view shows
 *    the conversation's tail (the spec's "the session's latest tool card"),
 *    else unbound (its card is not rendered here; it binds when it is).
 *  - `foldTouches` / `foldView`: one ROW per conversation — the ops counted
 *    (read = messages read, search = hits, reply / compose / refresh /
 *    request / status = calls), replied or composed first, then by the last
 *    touch; FOLD_SHOWN rows shown, the rest behind "+N more".
 *  - `rowWords`, `chipView` / `chipText`, `touchedBy` / `touchedByWords`,
 *    `agoText`, `glyphFor`: the words, through an INJECTED translator (the
 *    server sends structure; the device's language speaks it).
 *
 * Gate: scripts/test-channel-touch.mjs (fast) + scripts/test-channel-jump.mjs
 * (heavy, chrome).
 */

/** The closed op set, in the order a row SAYS them (a draft outranks a read). */
const OPS = Object.freeze(['reply', 'compose', 'read', 'search', 'refresh', 'request', 'status']);
/** The ops that make a row a DRAFT row (sorted first; the reverse link says "Drafted by"). */
const DRAFT_OPS = Object.freeze(['reply', 'compose']);
/** The per-session ring (the witness keeps the newest). */
const RING_MAX = 200;
/** A repeat of the same op on the same conversation inside this window folds into the previous touch. */
const MERGE_MS = 2000;
/** A touch may land this much before its card's own instant (the server's clock vs a transcript's). */
const SKEW_MS = 1500;
/** Calls started within this of each other are ONE parallel batch (they may run together). */
const BATCH_MS = 1500;
/** Rows shown before "+N more". */
const FOLD_SHOWN = 3;
/** One search records at most this many conversations (by hits) — a search is one card, not a ring flush. */
const SEARCH_MAX_CONVS = 20;
const TITLE_MAX = 200;
const LABEL_MAX = 120;
const ID_MAX = 300;

const str = (v, max) => {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/[\r\n\t]+/g, ' ');
  return s.length > max ? s.slice(0, max) : s;
};
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** The conversation a touch is about: `<adapter>/<conv>`, or `<account>/~compose/<proposal>` for a message not yet sent. */
function touchKey(t) {
  if (!t) return '';
  if (t.convId) return `${t.adapterId}/${t.convId}`;
  return `${t.adapterId}/~compose/${t.proposalId || t.id || ''}`;
}

/** The ONE touch record (bounded strings; null when it names no op or no account). The witness makes the
 *  strings frame-inert BEFORE it calls this (src/channel-record.js inertFrames — this module imports nothing). */
function normalizeTouch(x) {
  if (!x || typeof x !== 'object') return null;
  const op = String(x.op || '');
  if (!OPS.includes(op)) return null;
  const adapterId = str(x.adapterId, ID_MAX);
  if (!adapterId) return null;
  const convId = x.convId ? str(x.convId, ID_MAX) : null;
  const proposalId = x.proposalId ? str(x.proposalId, ID_MAX) : null;
  if (!convId && op !== 'compose') return null;   // only a message not yet sent has no conversation
  const at = num(x.at);
  if (!(at > 0)) return null;
  return {
    id: str(x.id, 80) || null,
    op, adapterId, convId, proposalId,
    title: str(x.title, TITLE_MAX),
    account: str(x.account, LABEL_MAX),
    kind: str(x.kind, 40) || null,
    count: Math.max(0, Math.floor(num(x.count))),
    at,
  };
}

/** Append to a ring IN PLACE: a repeat of the newest touch's op + conversation inside MERGE_MS folds into it
 *  (counts summed, its instant moved, its id kept); the ring keeps the newest RING_MAX.
 *  @returns {{touch, merged}} — the touch as stored (the one to broadcast). */
function appendTouch(ring, t, { mergeMs = MERGE_MS, max = RING_MAX } = {}) {
  const last = ring.length ? ring[ring.length - 1] : null;
  if (last && last.op === t.op && touchKey(last) === touchKey(t) && t.at >= last.at && t.at - last.at < mergeMs) {
    last.count = num(last.count) + num(t.count);
    last.at = t.at;
    if (t.title) last.title = t.title;
    if (t.account) last.account = t.account;
    return { touch: last, merged: true };
  }
  ring.push(t);
  if (ring.length > max) ring.splice(0, ring.length - max);
  return { touch: t, merged: false };
}

/** Upsert by id (the client's copy of the ring: a merged touch arrives again under its id). The copy keeps the
 *  newest `max` like the server's ring (channel-jump verify r4 — measured: an agent reading two conversations in
 *  turn is a FRESH touch per read, and the client's list grew by every one for the window's life while the server
 *  kept 200; the oldest by instant fall off). */
function upsertTouch(list, t, { max = RING_MAX } = {}) {
  const i = t && t.id ? list.findIndex((x) => x && x.id === t.id) : -1;
  if (i >= 0) list[i] = t; else list.push(t);
  if (list.length > max) {
    list.sort((a, b) => (Number(a && a.at) || 0) - (Number(b && b.at) || 0));
    list.splice(0, list.length - max);
  }
  return list;
}

/** Does a shell call run the agent's channels CLI? (the renderer's holder gate — harness-neutral: the command TEXT). */
function commandTouchesChannels(cmd) { return /(^|[\s;&|(`/])vibespace-channels(\s|$)/.test(String(cmd || '')); }

/** Does this call's command (or prompt) NAME the touch? The strongest evidence of which card a touch is. */
function namesTouch(text, t) {
  const s = String(text || '');
  if (!s || !t) return false;
  if (t.convId && s.includes(`${t.adapterId}/${t.convId}`)) return true;
  if (t.op === 'search' && /vibespace-channels\s+search\b/.test(s)) return true;
  if (t.op === 'compose' && /vibespace-channels\s+compose\b/.test(s) && s.includes(t.adapterId)) return true;
  if (t.proposalId && s.includes(t.proposalId)) return true;
  return false;
}

/**
 * WHICH CARD EACH TOUCH BELONGS TO.
 * @param touches [{…touch}]
 * @param calls   [{id, start, end: number|null, text}] — the view's tool cards in conversation order; `end` = the
 *                next non-tool message's instant (null: nothing after it yet)
 * @param opts    {tail: the view shows the conversation's newest message, skewMs, batchMs}
 * @returns {{byCall: Object<string, touch[]>, unbound: touch[]}}
 */
function bindToCall(touches, calls, { tail = false, skewMs = SKEW_MS, batchMs = BATCH_MS } = {}) {
  const cs = (Array.isArray(calls) ? calls : [])
    .map((c, i) => ({ id: String(c.id), start: num(c.start), end: c.end === null || c.end === undefined ? null : num(c.end), text: c.text || '', i }))
    .filter((c) => c.id && c.start > 0)
    .sort((a, b) => a.start - b.start || a.i - b.i);
  // the instant each call stops RUNNING: the next call outside its batch, or its own end, whichever is first
  for (let i = 0; i < cs.length; i++) {
    let stop = cs[i].end !== null && cs[i].end > cs[i].start ? cs[i].end : null;
    for (let j = i + 1; j < cs.length; j++) {
      if (cs[j].start > cs[i].start + batchMs) { stop = stop === null ? cs[j].start : Math.min(stop, cs[j].start); break; }
    }
    cs[i].stop = stop;
  }
  const byCall = {};
  const unbound = [];
  for (const t of Array.isArray(touches) ? touches : []) {
    if (!t) continue;
    const at = num(t.at);
    const running = cs.filter((c) => c.start - skewMs <= at && (c.stop === null || at < c.stop + skewMs));
    let pick = null;
    if (running.length) {
      const named = running.filter((c) => namesTouch(c.text, t));
      const pool = named.length ? named : running;
      pick = pool[pool.length - 1];
    } else if (tail && cs.length && at >= cs[cs.length - 1].start - skewMs) {
      pick = cs[cs.length - 1];
    }
    if (!pick) { unbound.push(t); continue; }
    (byCall[pick.id] || (byCall[pick.id] = [])).push(t);
  }
  return { byCall, unbound };
}

/** One ROW per conversation: ops counted, replied / composed first, then by the last touch (newest first). */
function foldTouches(touches) {
  const rows = new Map();
  for (const t of Array.isArray(touches) ? touches : []) {
    if (!t || !OPS.includes(t.op)) continue;
    const key = touchKey(t);
    let r = rows.get(key);
    if (!r) {
      r = { key, adapterId: t.adapterId, convId: t.convId || null, proposalId: t.proposalId || null, title: '', account: '', kind: t.kind || null, ops: Object.fromEntries(OPS.map((o) => [o, 0])), readCalls: 0, calls: 0, first: num(t.at), last: 0, lastAt: {} };
      rows.set(key, r);
    }
    const at = num(t.at);
    r.calls += 1;
    r.ops[t.op] += t.op === 'read' || t.op === 'search' ? Math.max(t.op === 'search' ? 1 : 0, num(t.count)) : 1;
    if (t.op === 'read') r.readCalls += 1;
    if (at >= r.last) {
      r.last = at;
      if (t.title) r.title = t.title;
      if (t.account) r.account = t.account;
      if (t.kind) r.kind = t.kind;
      if (t.proposalId) r.proposalId = t.proposalId;
    } else {
      if (!r.title && t.title) r.title = t.title;
      if (!r.account && t.account) r.account = t.account;
    }
    if (at < r.first) r.first = at;
    r.lastAt[t.op] = Math.max(num(r.lastAt[t.op]), at);
  }
  const drafted = (r) => DRAFT_OPS.some((o) => r.ops[o] > 0);
  return [...rows.values()].sort((a, b) => (drafted(b) - drafted(a)) || (b.last - a.last) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The fold: the first `max` rows shown, the rest counted behind "+N more" (all shown when expanded). */
function foldView(rows, { max = FOLD_SHOWN, expanded = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (expanded || list.length <= max) return { shown: list.slice(), hidden: 0 };
  return { shown: list.slice(0, max), hidden: list.length - max };
}

/** A row's words ("drafted a reply · read 12 messages"), in OPS order, through the injected `t`. */
function rowWords(row, t) {
  const o = (row && row.ops) || {};
  const out = [];
  if (o.reply) out.push(o.reply === 1 ? t('drafted a reply') : t('drafted {n} replies', { n: o.reply }));
  if (o.compose) out.push(o.compose === 1 ? t('wrote a new message') : t('wrote {n} new messages', { n: o.compose }));
  if (o.read || row.readCalls) out.push(o.read === 1 ? t('read 1 message') : t('read {n} messages', { n: o.read || 0 }));
  if (o.search) out.push(o.search === 1 ? t('1 search hit') : t('{n} search hits', { n: o.search }));
  if (o.refresh) out.push(t('refreshed'));
  if (o.request) out.push(t('asked for access'));
  if (o.status) out.push(t('checked its draft'));
  return out.join(' · ');
}

/** The row's name: `account › title` (the title alone when the account is unknown). */
function rowName(row) {
  const title = (row && (row.title || row.convId)) || '';
  return row && row.account ? `${row.account} › ${title}` : title;
}

/** Which library glyph a row wears (a mailbox or a chat; an agent for the built-in Agents adapter). */
function glyphFor(kindOrAdapterId) {
  const k = String(kindOrAdapterId || '').split(':')[0];
  if (k === 'gmail') return 'mail';
  if (k === 'agents') return 'robot';
  return 'chat';
}

/** THE CHIP: the touches of the CURRENT turn (at or after `turnAt`), folded; `latest` = the row of the newest
 *  touch. null when the turn touched nothing (the chip is not drawn). */
function chipView(touches, turnAt) {
  const since = num(turnAt);
  const mine = (Array.isArray(touches) ? touches : []).filter((x) => x && num(x.at) >= since);
  if (!mine.length) return null;
  const rows = foldTouches(mine);
  let newest = mine[0];
  for (const x of mine) if (num(x.at) >= num(newest.at)) newest = x;
  const latest = rows.find((r) => r.key === touchKey(newest)) || rows[0];
  return { rows, latest };
}
function chipText(view, t) {
  if (!view || !view.latest) return '';
  return `${t('Channels')} · ${view.latest.title || view.latest.convId || ''}`;
}

/** THE REVERSE LINK's facts: per session, over its ring, the touches of ONE conversation key → the strongest op
 *  (a draft outranks a read) and the newest instant. null when the session never touched it. */
function sessionSummary(ring, key) {
  let op = null, at = 0, n = 0;
  for (const x of Array.isArray(ring) ? ring : []) {
    if (!x || touchKey(x) !== key) continue;
    n++;
    if (num(x.at) > at) at = num(x.at);
    if (!op || OPS.indexOf(x.op) < OPS.indexOf(op)) op = x.op;
  }
  return n ? { op, at, n } : null;
}
/** The reverse link's word for a summary's op. */
function touchedByWords(s, t, now) {
  const ago = agoText(num(now) - num(s && s.at), t);
  const name = (s && s.name) || t('an agent');
  if (s && DRAFT_OPS.includes(s.op)) return t('Drafted by {name} · {ago}', { name, ago });
  if (s && s.op === 'request') return t('Access asked by {name} · {ago}', { name, ago });
  return t('Read by {name} · {ago}', { name, ago });
}

/** `just now` / `12 min ago` / `5 h ago` / `3 d ago` (the existing keys). */
function agoText(ms, t) {
  const s = Math.max(0, num(ms) / 1000);
  if (s < 60) return t('just now');
  if (s < 5400) return t('{n} min ago', { n: Math.round(s / 60) });
  if (s < 172800) return t('{n} h ago', { n: Math.round(s / 3600) });
  return t('{n} d ago', { n: Math.round(s / 86400) });
}

/** A search's answer → the touches it records: one per conversation (hits counted), the SEARCH_MAX_CONVS with the
 *  most hits. `results` = the engine's `searchFor` rows ({adapterId, adapter, convId, title}). */
function searchTouches(results, { max = SEARCH_MAX_CONVS } = {}) {
  const by = new Map();
  for (const r of Array.isArray(results) ? results : []) {
    if (!r || !r.adapterId || !r.convId) continue;
    const k = `${r.adapterId}/${r.convId}`;
    const x = by.get(k) || { op: 'search', adapterId: r.adapterId, convId: r.convId, title: r.title || '', account: r.adapter || '', count: 0 };
    x.count += 1;
    by.set(k, x);
  }
  return [...by.values()].sort((a, b) => b.count - a.count).slice(0, max);
}

module.exports = {
  OPS, DRAFT_OPS, RING_MAX, MERGE_MS, SKEW_MS, BATCH_MS, FOLD_SHOWN, SEARCH_MAX_CONVS, TITLE_MAX, LABEL_MAX,
  touchKey, normalizeTouch, appendTouch, upsertTouch, commandTouchesChannels, namesTouch, bindToCall, foldTouches, foldView, rowWords, rowName,
  glyphFor, chipView, chipText, sessionSummary, touchedByWords, agoText, searchTouches,
};
