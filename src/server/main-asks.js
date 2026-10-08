'use strict';
/**
 * A MAIN CONVERSATION'S OWN ASK — the ORCH half (lane parked-ask-inbox; the
 * PURE half is src/main-ask.js). The twin of src/server/helper-asks.js for the
 * asks a conversation's OWN turn is parked on (a permission card, a question,
 * the plan approval — any harness), keyed on the session's normalizer as the
 * one truth (`mm.pendingAsks()`, else helper-ask.js pendingAsksOf over its
 * cards — codex / ACP keep no pending level):
 *
 *   · an ask open for MAIN_ASK_INBOX_MS (60 s) files ONE For-you item (origin
 *     `agent`, kind `action`, urgency `high`, action `main-ask` naming the
 *     request — user-todos ACTION_IDENTITY makes it one item PER ASK). No
 *     "visible ⇒ skip": a focused window on the active desktop still files
 *     (the owner may have walked away) — the item is the record.
 *   · resolved by the product the moment the ask leaves the pending list
 *     (answered from any window, withdrawn, the turn ended) and when the
 *     session is gone (`forget`, the kill / exit path).
 *   · THE CLOCK LIVES IN THE RECORD: each waiting ask's first-seen instant
 *     rides the session meta (`mainAskedAt`, written on change) — a restart's
 *     rebuilt card files at 60 s from the ASK's instant, under the same key
 *     (an open item for the request is the filing: never a second item).
 *
 * Installed once by server.js; before install every call is a no-op.
 */
const M = require('../main-ask.js');
const { pendingAsksOf } = require('../helper-ask.js');
const { addAsksObserver } = require('../normalizers');

let deps = null;                   // { userTodos, sessionKeyFor, activeSessions, log, readAskedAt, persistAskedAt }
const perSession = new WeakMap();  // session → Map<requestId, {timer, filed, at}>
const persistedKey = new WeakMap(); // session → the last persisted map's key (write only on change)
const forgotten = new WeakSet();   // sessions the kill / exit path ended — a late sync files nothing

function install({ userTodos = null, sessionKeyFor = null, activeSessions = null, log = console, readAskedAt = null, persistAskedAt = null } = {}) {
  deps = { userTodos, sessionKeyFor, activeSessions, log, readAskedAt, persistAskedAt };
  addAsksObserver((session) => sync(session));
  return { sync, forget, reconcileAll };
}

const idOf = (session) => (session && session._webuiId) || null;
function keyOf(session) {
  if (!deps || typeof deps.sessionKeyFor !== 'function') return null;
  try { return deps.sessionKeyFor(session, idOf(session)); } catch { return null; }
}
const nameOf = (session) => String((session && (session.name || session.webuiName)) || '').trim();

/** The session's waiting MAIN asks (helpers' are helper-asks.js's), normalized by the PURE table. */
function mainAsksOf(session) {
  const mm = session && session._normalizer;
  if (!mm) return [];
  try {
    const list = typeof mm.pendingAsks === 'function' ? mm.pendingAsks() : pendingAsksOf(mm.messages);
    const out = [];
    for (const a of list) {
      if (!a || a.kind === 'helper') continue;
      const card = mm.messageIndex && typeof mm.messageIndex.get === 'function' ? mm.messageIndex.get(a.msgId) : null;
      const ask = M.mainAskOf(card && card.permission ? card.permission : { requestId: a.requestId, toolName: a.toolName }, a);
      if (ask) out.push(ask);
    }
    return out;
  } catch { return []; }
}

const openItemsOf = (key) => {
  const { userTodos } = deps || {};
  if (!userTodos || !key || typeof userTodos.forSession !== 'function') return [];
  try { return (userTodos.forSession(key) || []).filter((it) => it && it.action && it.action.type === M.MAIN_ASK_ACTION); } catch { return []; }
};

function fileItem(session, ask) {
  const { userTodos, log } = deps || {};
  const key = keyOf(session);
  if (!userTodos || !key) return false;
  // KEYED BY THE ASK: an open item for this request IS the filing (a restart's rebuilt card re-arms the same key)
  if (openItemsOf(key).some((it) => String(it.action.requestId) === ask.requestId)) return true;
  try {
    const it = M.inboxItemFor(ask, { name: nameOf(session), sessionId: idOf(session) });
    userTodos.add(key, { ...it, origin: 'agent', by: 'agent', kind: 'action', urgency: 'high', sessionName: nameOf(session) || null });
    log?.log?.(`[main-ask] ${idOf(session)}: ${ask.row} ask ${ask.requestId} (${ask.tool}) unanswered for ${M.MAIN_ASK_INBOX_MS / 1000} s — filed in For you`);
    return true;
  } catch (e) { log?.warn?.(`[main-ask] inbox item not filed — ${e && e.message}`); return false; }
}

/** Every OPEN main-ask item of the session whose request no longer waits is resolved `done` (by `agent`). */
function resolveItems(session, live) {
  const { userTodos, log } = deps || {};
  let n = 0;
  for (const it of openItemsOf(keyOf(session))) {
    if (live.has(String(it.action.requestId))) continue;
    try { userTodos.setStatus(it.id, 'done', 'agent'); n++; } catch (e) { log?.warn?.(`[main-ask] inbox item ${it.id} not resolved — ${e && e.message}`); }
  }
  return n;
}

/** THE ONE RECONCILIATION (the normalizers' pending-asks observer, the rebuild's end, a timer): the session's
 *  waiting main asks vs the timers and the store. A sync is also a TICK (an ask already due is filed now). Never throws. */
function sync(session, now = Date.now()) {
  if (!deps || !session || forgotten.has(session)) return;
  try {
    const live = new Map(mainAsksOf(session).map((a) => [a.requestId, a]));
    const firstLook = !perSession.has(session);
    const st = perSession.get(session) || new Map();
    perSession.set(session, st);
    for (const [rid, e] of st) {
      if (live.has(rid)) continue;
      if (e.timer) clearTimeout(e.timer);
      st.delete(rid);
    }
    resolveItems(session, live); // resolve before filing: the store caps a session's open items
    let saved = null;
    for (const [rid, a] of live) {
      let e = st.get(rid);
      if (!e) {
        if (saved === null) saved = readSaved(session);
        e = { timer: null, filed: false, at: M.firstSeenAt(saved[rid], a.at, now, firstLook) };
        st.set(rid, e);
      }
      if (e.filed) continue;
      const fire = () => {
        if (e.timer) { clearTimeout(e.timer); e.timer = null; }
        // a session that is gone waits for nobody (the kill / exit path forgets it; this is the belt)
        if (forgotten.has(session) || (deps.activeSessions && idOf(session) && deps.activeSessions.get(idOf(session)) !== session)) return;
        const still = mainAsksOf(session).find((x) => x.requestId === rid);
        if (still && !e.filed) e.filed = fileItem(session, still);
      };
      const wait = Math.max(0, M.inboxDueAt(e.at) - now);
      if (wait === 0) fire();
      else if (!e.timer) { e.timer = setTimeout(fire, wait); if (e.timer.unref) e.timer.unref(); }
    }
    persistAskedAt(session, st);
  } catch (e) { deps.log?.warn?.(`[main-ask] sync failed — ${e && e.message}`); }
}

function readSaved(session) {
  if (!deps || typeof deps.readAskedAt !== 'function') return {};
  try { const m = deps.readAskedAt(session); return m && typeof m === 'object' ? m : {}; } catch { return {}; }
}

/** The waiting asks' first-seen instants → session meta `mainAskedAt`, written only when the map changed
 *  (order-insensitive — helper-asks' verify r4). */
function persistAskedAt(session, st) {
  if (!deps || typeof deps.persistAskedAt !== 'function') return;
  const map = {};
  for (const [rid, e] of st) if (e && Number.isFinite(e.at) && e.at > 0) map[rid] = e.at;
  const key = JSON.stringify(Object.keys(map).sort().map((k) => [k, map[k]]));
  if (!persistedKey.has(session)) { const prev = readSaved(session); persistedKey.set(session, JSON.stringify(Object.keys(prev).sort().map((k) => [k, prev[k]]))); }
  if (persistedKey.get(session) === key) return;
  persistedKey.set(session, key);
  try { deps.persistAskedAt(session, map); } catch (e) { deps.log?.warn?.(`[main-ask] askedAt not persisted — ${e && e.message}`); }
}

/** After a restart: every live session whose history is loaded reconciles once. */
function reconcileAll() {
  if (!deps || !deps.activeSessions) return;
  for (const [, s] of deps.activeSessions) if (s && s._historyLoaded) sync(s);
}

/** THE SESSION IS GONE (kill / exit): timers cleared, every open main-ask item resolved, a late sync a no-op. */
function forget(session) {
  if (!session) return 0;
  forgotten.add(session);
  const st = perSession.get(session);
  if (st) { for (const e of st.values()) if (e && e.timer) clearTimeout(e.timer); perSession.delete(session); }
  if (!deps) return 0;
  try { return resolveItems(session, new Map()); } catch (e) { deps.log?.warn?.(`[main-ask] forget failed — ${e && e.message}`); return 0; }
}

module.exports = { install, sync, forget, reconcileAll, mainAsksOf };
