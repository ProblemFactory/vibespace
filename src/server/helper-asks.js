'use strict';
/**
 * A HELPER'S PERMISSION ASK — the ORCH half (lane S1, B-6e95; the PURE model is
 * src/helper-ask.js, the cards are the normalizers' — src/message-manager.js
 * hangs the ask on the helper's Agent card, src/normalizers.js feeds the
 * helper's own view the same control records). Two jobs, both keyed on the
 * PARENT session's normalizer as the one truth:
 *
 *   · THE FOR-YOU INBOX: a helper's ask left unanswered for HELPER_ASK_INBOX_MS
 *     (60 s) is filed ONCE (origin `agent`, action `helper-ask` naming the
 *     request) — the studies' users looked there and read "nothing needs you"
 *     while a helper sat paused for 4–18 minutes. The item is resolved the
 *     moment the ask is settled (answered from either window, withdrawn by the
 *     CLI, or the helper ended), and a restart reconciles the store with the
 *     rebuilt cards (an item whose ask is gone is resolved, never left open).
 *   · WHICH SESSION ANSWERS: a helper's View Log window sends its OWN virtual
 *     id (`sub-<tool_use_id>`); the answer belongs on the PARENT's stdin (the
 *     CLI's request ids are process-wide — measured: the helper resumed 1.1 s
 *     after a control_response on the parent's stdin).
 *
 *   · A SESSION THAT IS GONE (verify r1): the kill path and the exit path call
 *     `forget(session)` — its timers die with it (a 60 s timer armed before a
 *     kill used to fire on the dead normalizer and file an item for a session
 *     nobody can answer in), every open helper-ask item of it is resolved (a
 *     helper that no longer exists waits for nobody), and a late sync is a
 *     no-op.
 *   · A STALE ANSWER (verify r1): `settledState(session, requestId)` = what
 *     the PARENT's normalizer already knows about the request — answered from
 *     the other window, withdrawn by the CLI (control_cancel_request), its
 *     — so the ws case writes NOTHING to stdin for it (measured before the fix:
 *     a second control_response for one request id, an allow after a
 *     withdrawal) and says so; an UNKNOWN request passes (a request older than
 *     the buffer is still the CLI's to answer), and so does a helper card's
 *     DERIVED `ended` (a guessed close — the CLI decides).
 *
 * State lives in a WeakMap keyed by the live session object (timers are a
 * statement about this process; the store is the durable half). Installed once
 * by server.js; before install every call is a no-op (the suites that build a
 * normalizer alone never file).
 */
const H = require('../helper-ask.js');
const { setAsksObserver } = require('../normalizers');
const { answerPermission } = require('./permission-answer'); // THE one permission answer (lane J r2) — written only after the table says so

let deps = null;               // { userTodos, sessionKeyFor, activeSessions, log, persistAskedAt }
const perSession = new WeakMap(); // session → Map<requestId, {timer, filed}>
const forgotten = new WeakSet();  // sessions the kill / exit path ended — a late sync files nothing

function install({ userTodos = null, sessionKeyFor = null, activeSessions = null, log = console, persistAskedAt = null } = {}) {
  deps = { userTodos, sessionKeyFor, activeSessions, log, persistAskedAt };
  setAsksObserver((session) => sync(session));
  return { sync, sessionForAnswer, reconcileAll, forget, settledState, answerFrame };
}

const helperAsksOf = (session) => {
  const mm = session && session._normalizer;
  if (!mm || typeof mm.pendingAsks !== 'function') return [];
  try { return mm.pendingAsks().filter((a) => a.kind === 'helper'); } catch { return []; }
};
const idOf = (session) => (session && session._webuiId) || null;
function keyOf(session) {
  if (!deps || typeof deps.sessionKeyFor !== 'function') return null;
  try { return deps.sessionKeyFor(session, idOf(session)); } catch { return null; }
}

function fileItem(session, ask) {
  const { userTodos, log } = deps || {};
  const key = keyOf(session);
  if (!userTodos || !key) return false;
  try {
    const it = H.inboxItemFor(ask, { label: ask.label || '', sessionId: idOf(session) });
    userTodos.add(key, { ...it, origin: 'agent', by: 'agent', kind: 'action', urgency: 'high', sessionName: session.name || session.webuiName || null });
    log?.log?.(`[helper-ask] ${idOf(session)}: ${ask.label || 'a helper'} waits for approval (${ask.toolName}) — filed in For you`);
    return true;
  } catch (e) { log?.warn?.(`[helper-ask] inbox item not filed — ${e && e.message}`); return false; }
}

/** Resolve every OPEN helper-ask item of this session whose request no longer
 *  waits. `live` = a Map requestId → the waiting ask (or a Set of ids — the
 *  forget path passes an empty one).
 *  ONE ITEM, MANY REQUESTS (verify r2, measured): the store is idempotent BY
 *  TEXT per session, so two waiting asks with the same words — one helper's
 *  PARALLEL tool calls (two WebFetch in one turn), two helpers with one
 *  description — share ONE item, re-pointed at the newest request. When that
 *  request settled, the item was resolved while its twin still waited (the
 *  pointer gone, the helper blocked — round 1's M1 class). An item whose own
 *  request is gone is now RE-POINTED at a live twin with the same words and
 *  stays open; it is resolved only when no request with its words waits. */
function resolveItems(session, live, st = null, now = Date.now()) {
  const { userTodos, log } = deps || {};
  const key = keyOf(session);
  if (!userTodos || !key || typeof userTodos.forSession !== 'function') return 0;
  const waiting = live instanceof Map ? live : new Map([...(live || [])].map((rid) => [String(rid), null]));
  const textOf = (ask) => { try { return H.inboxItemFor(ask, { label: ask.label || '' }).text; } catch { return null; } };
  let n = 0;
  for (const it of userTodos.forSession(key) || []) {
    const a = it && it.action;
    if (!a || a.type !== 'helper-ask' || waiting.has(String(a.requestId))) continue;
    const twin = [...waiting.values()].find((x) => x && textOf(x) === it.text);
    if (twin && fileItem(session, twin)) {
      if (st) { const e = st.get(String(twin.requestId)) || { timer: null, filed: false, at: twin.at || now }; if (e.timer) { clearTimeout(e.timer); e.timer = null; } e.filed = true; st.set(String(twin.requestId), e); }
      continue;
    }
    try { userTodos.setStatus(it.id, 'done', 'agent'); n++; } catch (e) { log?.warn?.(`[helper-ask] inbox item ${it.id} not resolved — ${e && e.message}`); }
  }
  return n;
}

/** THE ONE RECONCILIATION: the parent's pending helper asks vs the timers and
 *  the store. Called by the normalizer gate whenever the pending set changed,
 *  after a rebuild, and at attach. Never throws. */
function sync(session, now = Date.now()) {
  if (!deps || !session || forgotten.has(session)) return;
  try {
    const asks = helperAsksOf(session);
    const live = new Map(asks.map((a) => [String(a.requestId), a]));
    const st = perSession.get(session) || new Map();
    perSession.set(session, st);
    for (const [rid, e] of st) {
      if (live.has(rid)) continue;
      if (e.timer) clearTimeout(e.timer);
      st.delete(rid);
    }
    // RESOLVE BEFORE FILING (verify r2): the store caps a session at 20 open
    // items, so an ask past the cap waits for room — resolving the settled ones
    // first gives it that room in THIS sync, not one answer late
    resolveItems(session, live, st, now);
    for (const [rid, a] of live) {
      const e = st.get(rid) || { timer: null, filed: false, at: a.at || now };
      st.set(rid, e);
      if (e.filed) continue;
      const fire = () => {
        if (e.timer) { clearTimeout(e.timer); e.timer = null; }
        // a session that is gone waits for nobody (the kill / exit path forgets it; this is the belt to that brace)
        if (forgotten.has(session) || (deps.activeSessions && idOf(session) && deps.activeSessions.get(idOf(session)) !== session)) return;
        // still waiting? (the ask may have been settled while the timer ran — the store is told only about a live ask)
        const still = helperAsksOf(session).find((x) => String(x.requestId) === rid);
        if (still && !e.filed && H.askTransition(H.ASK_INITIAL, 'timer').effects.includes('file-item')) e.filed = fileItem(session, still); // the table's timer row on `asked`
      };
      // a sync is also a TICK: an ask already due is filed now (the timer is the idle path)
      const wait = Math.max(0, H.inboxDueAt(e.at) - now);
      if (wait === 0) fire();
      else if (!e.timer) { e.timer = setTimeout(fire, wait); if (e.timer.unref) e.timer.unref(); }
    }
    persistAskedAt(session, st);
  } catch (e) { deps.log?.warn?.(`[helper-ask] sync failed — ${e && e.message}`); }
}

/** THE 60 s CLOCK SURVIVES A RESTART (verify r3; round 1's F8): each waiting
 *  ask's first-seen instant rides the session meta (`helperAskedAt`, beside
 *  `taskRecords`) — a rebuild stamps the ask with it, so an ask already 60 s
 *  old at boot is filed by the first sync instead of waiting another minute.
 *  Written only when the map changed. */
function persistAskedAt(session, st) {
  if (!deps || typeof deps.persistAskedAt !== 'function') return;
  const map = {};
  for (const [rid, e] of st) if (e && Number.isFinite(e.at) && e.at > 0) map[rid] = e.at;
  // verify r4: the "changed?" key is ORDER-INSENSITIVE — the live map is inserted in arrival order,
  // the rebuilt one in the pending list's order (by `at`, then card index), so two asks that
  // arrived in one tick swapped places after a restart and every boot wrote an unchanged map
  const keyOf = (m) => JSON.stringify(Object.keys(m || {}).sort().map((k) => [k, m[k]]));
  const key = keyOf(map);
  // the last persisted map is the meta's (a restored session) or the last write's — a session that
  // never had a helper ask writes nothing at attach (every session syncs after its rebuild)
  const prevKey = session._helperAskedAtKey != null ? session._helperAskedAtKey : keyOf(session._helperAskedAt && typeof session._helperAskedAt === 'object' ? session._helperAskedAt : {});
  if (prevKey === key) { session._helperAskedAtKey = key; return; }
  session._helperAskedAtKey = key;
  session._helperAskedAt = map;
  try { deps.persistAskedAt(session, map); } catch (e) { deps.log?.warn?.(`[helper-ask] askedAt not persisted — ${e && e.message}`); }
}

/** After a restart: every live session reconciles once its cards exist (an
 *  item filed before the restart whose ask has since settled is resolved). */
function reconcileAll() {
  if (!deps || !deps.activeSessions) return;
  for (const [, s] of deps.activeSessions) if (s && s._historyLoaded) sync(s);
}

/** THE SESSION IS GONE (the kill path, the exit path): its timers are cleared,
 *  every open helper-ask item of it is resolved, and a late sync is a no-op.
 *  Returns how many items were resolved. Never throws. */
function forget(session) {
  if (!session) return 0;
  forgotten.add(session);
  const st = perSession.get(session);
  if (st) { for (const e of st.values()) if (e && e.timer) clearTimeout(e.timer); perSession.delete(session); }
  if (!deps) return 0;
  // the table's parent-end row on `asked`: the effect is resolve-item (never a write)
  if (!H.askTransition(H.ASK_INITIAL, 'parent-end').effects.includes('resolve-item')) return 0;
  try { return resolveItems(session, new Set()); } catch (e) { deps.log?.warn?.(`[helper-ask] forget failed — ${e && e.message}`); return 0; }
}

/** What this session already knows about `requestId`, in THE TABLE's vocabulary
 *  (src/helper-ask.js ASK_STATES): a helper's ask by `askState` (its own record,
 *  else `ended` when its helper card carries a REAL terminal status — verify r3:
 *  r1 let a derived end pass "for the CLI to decide", but a helper that is over
 *  by task_notification / a killed patch / its Agent result holds no request, and
 *  the level set's soft close is `level-drop`, not `ended`), a main card by its
 *  resolution (`asked` while it waits); null when the request is UNKNOWN here
 *  (then the CLI decides — an answer for a request older than the buffer must
 *  still reach it). Never throws. */
function settledState(session, requestId) {
  if (!session || requestId == null) return null;
  const mm = session._normalizer;
  if (!mm) return null;
  const rid = String(requestId);
  try {
    const hit = typeof mm.helperAskById === 'function' ? mm.helperAskById(rid) : null;
    if (hit) return H.askState(hit.ask, hit.card);
    const list = Array.isArray(mm.messages) ? mm.messages : [];
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i] && list[i].permission;
      // a main card's own resolution in the table's vocabulary (claude / codex / ACP all write allowed|denied);
      // a harness word the table does not know is NOT ours to judge (null: the CLI decides — never a throw here)
      if (p && p.requestId != null && String(p.requestId) === rid) return !p.resolved ? H.ASK_INITIAL : (H.ASK_STATES.includes(String(p.resolved)) ? String(p.resolved) : null);
    }
  } catch { }
  return null;
}

/** THE ws `permission-response` case, as one lookup (verify r3): which live
 *  session answers (sessionForAnswer — a helper View Log's frame reaches the
 *  parent), what that session knows (settledState), and what the TABLE says a
 *  press does from that state (answerVerdict: write from `asked` / unknown,
 *  refuse by code otherwise). Only then answerPermission writes the ONE frame.
 *  Returns `{ok:true, state, payload}` or `{ok:false, code, state, words, why}` —
 *  the ws case sends the refusal to the window that pressed the button (its card
 *  flipped itself optimistically; silence would be a lie). The SAME lookup
 *  answers the browser takeover's stale sweep (src/server/mounts-plugins-wiring.js
 *  — `serverDeny: true` keeps the sweep's own `denyMessage`, browser_paused, the
 *  card's words after a restart); a CLIENT frame never spells the deny's text
 *  (stripped, as before). */
function answerFrame(data, { activeSessions = deps && deps.activeSessions, adapterRegistry, feedLive } = {}, { serverDeny = false } = {}) {
  const target = sessionForAnswer(data, activeSessions);
  const state = target ? settledState(target.session, data.requestId) : 'unrouted';
  const v = H.answerVerdict(state);
  if (!v.write) return { ok: false, code: v.code, state: v.state, words: v.words, why: v.words };
  const res = answerPermission(target.session, serverDeny ? { ...data } : { ...data, denyMessage: undefined }, { adapterRegistry, feedLive });
  if (!res || !res.ok) { const words = `This answer did not reach the agent: ${(res && res.why) || 'no running session holds this request'}. Nothing was sent.`; return { ok: false, code: 'permission-unrouted', state: 'unrouted', words, why: words }; }
  return { ok: true, state: v.state, payload: res.payload };
}

/** Does this live session know the request — a helper's ask on its parent
 *  card, an ORPHAN ask (no card adopted it yet), a main card, or a card in one
 *  of its helper views (verify r2)? The view-id rung of `sessionForAnswer`
 *  routes only a request the session knows. */
function knowsRequest(session, requestId) {
  if (!session || requestId == null) return false;
  const rid = String(requestId);
  const hasCard = (mm) => !!mm && Array.isArray(mm.messages) && mm.messages.some((m) => m && m.permission && m.permission.requestId != null && String(m.permission.requestId) === rid);
  try {
    const mm = session._normalizer;
    if (mm && typeof mm.helperAskById === 'function' && mm.helperAskById(rid)) return true;
    if (mm && mm._helperOrphans) for (const list of mm._helperOrphans.values()) if ((list || []).some((a) => a && a.requestId === rid)) return true;
    if (hasCard(mm)) return true;
    if (session._subNormalizers) for (const sub of session._subNormalizers.values()) if (hasCard(sub)) return true;
  } catch { }
  return false;
}

/** Which LIVE session answers this `permission-response` — `{id, session}` or
 *  null. The frame's own session when it is live; else the parent of the
 *  helper view that sent it (by request id, then by the view's own id).
 *  THE VIEW-ID RUNG ROUTES ONLY A REQUEST THAT SESSION KNOWS (verify r2): a
 *  helper's Agent call id (`sub-<tool_use_id>`) is the CONVERSATION's, so after
 *  a Terminate + Resume (or beside a fork) a stale View Log window's answer for
 *  the DEAD process's request matched the NEW process by its view id and was
 *  forwarded into it — inert on 2.1.281 (a response to an unknown request id
 *  without `toolUseID` is dropped), but a request the new process never issued
 *  is never its to receive. Refused by name (permission-unrouted) instead. */
function sessionForAnswer(data, activeSessions = deps && deps.activeSessions) {
  if (!data || !activeSessions) return null;
  const direct = activeSessions.get?.(data.sessionId);
  if (direct) return { id: data.sessionId, session: direct };
  const list = [];
  for (const [id, s] of activeSessions) {
    if (!s) continue;
    const requestIds = new Set();
    const mm = s._normalizer;
    const hit = mm && typeof mm.helperAskById === 'function' && data.requestId != null ? mm.helperAskById(data.requestId) : null;
    if (hit) requestIds.add(String(data.requestId));
    const subIds = new Set();
    if (s._subNormalizers) for (const k of s._subNormalizers.keys()) subIds.add('sub-' + k);
    list.push({ id, requestIds, subIds });
  }
  const id = H.answerSessionFor(data, list);
  if (!id) return null;
  const session = activeSessions.get(id);
  if (data.requestId != null && !knowsRequest(session, data.requestId)) return null;
  return { id, session };
}

module.exports = { install, sync, sessionForAnswer, knowsRequest, reconcileAll, forget, settledState, answerFrame };
