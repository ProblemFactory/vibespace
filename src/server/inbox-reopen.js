'use strict';
/**
 * A REPLY TO A CONVERSATION THAT ENDED REOPENS IT — the ORCH half (lane inbox-reply-dead-session; the create message is
 * PURE src/inbox-reopen.js reopenCreate, the caller src/routes/user-todos-reply.js). userW inc-mvfuzlom-nwav
 * (2026-10-19, 2.369.318): 「在 inbox 里面回复 session 的时候, 如果那个 session 已经挂了, 就回不了了.」
 *
 * `create(deps).reopen(item, {by})` → Promise<{ok:true, sessionId, conversation, already?} | {ok:false, why}>.
 * THE RESUME ROAD is the ws `create {resume:true, resumeId}` case itself (src/ws-create.js handleCreate — what every
 * Resume press, sidebar card and resume bar sends), handed the message the page's own resume road would build
 * (reopenCreate over the same facts: the discovery row, user-state's per-conversation config, the harness defaults,
 * the conversation's first Task Group) and a HEADLESS creator — a socket stand-in that keeps the frames the create
 * answers ('created' / an 'error' by name) and leaves the session's clients the moment it answered; the window the
 * page then opens attaches like any other. NOTHING is sent into the conversation here: the reply route types the reply
 * through THE typing path once this answered. ONE reopen per conversation in flight — a second reply (a double press,
 * a second device) waits for the first's answer and lands in the same session.
 */
const { reopenCreate, conversationOfKey } = require('../inbox-reopen.js');

const WS_OPEN = 1;

/** A creator socket nobody holds: the create's frames land in `frames`; `open` false once it answered. */
function headlessCreator(by = null) {
  const frames = [];
  const sock = {
    readyState: WS_OPEN, _actBy: by, _headless: true, frames,
    send(s) { try { frames.push(typeof s === 'string' ? JSON.parse(s) : s); } catch { } },
    on() { }, once() { }, ping() { }, terminate() { }, close() { },
  };
  return sock;
}

/** user-state's per-conversation maps are keyed by the state key, or (older entries) the bare conversation id. */
const stateOf = (map, key) => {
  if (!map || typeof map !== 'object') return null;
  if (Object.hasOwn(map, key)) return map[key];
  const id = key.split(':').slice(1).join(':');
  return id && Object.hasOwn(map, id) ? map[id] : null;
};

function create({ getHandleCreate, activeSessions, discover = async () => null, locate = () => null, readUserState = () => ({}), defaultsFor = () => ({}),
  taskFor = () => null, log = console.log } = {}) {
  const inflight = new Map(); // conversation key → the reopen in flight

  async function run(item, by) {
    const key = String(item.sessionKey || '');
    if (!conversationOfKey(key)) return reopenCreate({ key }); // the PURE refusal by name
    const handleCreate = typeof getHandleCreate === 'function' ? getHandleCreate() : null;
    if (typeof handleCreate !== 'function') return { ok: false, why: 'this server cannot start conversations yet (still booting) — try again in a moment' };
    const conv = conversationOfKey(key);
    let entry = null;
    try { entry = await discover(key); } catch (e) { log(`[inbox-reopen] ${key}: discovery failed (${e.message}) — asking the harness's own store`); }
    // not listed by discovery (paused, a cwd it does not list): the harness's OWN transcript lookup is the evidence a local
    // conversation exists, in the folder the ask was filed from — never a remote copy cached here (that one resumes on its host)
    if (!entry && !item.hostId && typeof item.cwd === 'string' && item.cwd) {
      let fp = null;
      try { fp = locate(conv.backend, conv.id, item.cwd); } catch { }
      if (fp && !/[\\/]remote-jsonl[\\/]/.test(String(fp))) entry = { cwd: item.cwd, located: true };
    }
    let us = {};
    try { us = readUserState() || {}; } catch { }
    const name = stateOf(us.customNames, key) || (entry && entry.name) || item.sessionName || '';
    let taskId = null;
    try { taskId = taskFor(key) || null; } catch { }
    let defaults = {};
    try { defaults = defaultsFor(conv.backend) || {}; } catch { }
    const reqId = `reopen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const spec = reopenCreate({ key, entry, item, cfg: stateOf(us.sessionConfigs, key), defaults, name, taskId, reqId });
    if (!spec.ok) return spec;
    const sock = headlessCreator(by);
    try { await handleCreate(sock, spec.data, new Set()); }
    catch (e) { return { ok: false, why: 'the conversation did not start: ' + e.message }; }
    const made = sock.frames.find((f) => f && f.type === 'created' && f.sessionId);
    const err = sock.frames.find((f) => f && f.type === 'error');
    if (made) {
      const s = activeSessions.get(made.sessionId);
      if (s && s.clients && typeof s.clients.delete === 'function') s.clients.delete(sock); // nobody looks through this socket
      log(`[inbox-reopen] ${key}: reopened as ${made.sessionId} for a For-you reply`);
      return { ok: true, sessionId: made.sessionId, conversation: { ...spec.conversation, name: made.name || spec.conversation.name } };
    }
    // a page resumed it a moment ago under another id: THAT session carries the reply
    if (err && err.code === 'resume-already-live' && err.existingId && activeSessions.has(err.existingId)) {
      return { ok: true, sessionId: err.existingId, already: true, conversation: spec.conversation };
    }
    const why = err ? String(err.message || err.code || 'the create was refused') : 'the conversation did not start (no answer from the create)';
    log(`[inbox-reopen] ${key}: the resume failed — ${why.slice(0, 300)}`);
    return { ok: false, why };
  }

  function reopen(item, { by = null } = {}) {
    const key = String((item && item.sessionKey) || '');
    if (inflight.has(key)) return inflight.get(key);
    const p = run(item || {}, by).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  return { reopen, inflightCount: () => inflight.size };
}

module.exports = { create, headlessCreator };
