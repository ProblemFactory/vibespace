'use strict';
/**
 * AN UNEXPECTED EXIT IS RESUMED ONCE, BY ITSELF (B-f698) — the ORCH half; the
 * rule is PURE in src/exit-facts.js (`unexpectedExitVerdict`, over the same
 * facts the "[session] exited" line prints).
 *
 * 2026-09-24 08:11Z three conversations with work in flight died together and
 * nobody knew for six hours. Owner 2026-10-02: a chat conversation that exits
 * while it is working, without a kill the user or VibeSpace asked for, is
 * resumed ONCE by itself — NOTHING is sent into it (no continue), so no turn
 * is billed — and the owner gets ONE For-you item naming the conversation and
 * the time; a second unexpected exit (within RESPAWN_ONCE_MS) only notifies.
 *
 * HOW IT IS RESUMED: by the same resume a sidebar Resume runs — a CLIENT's
 * `resumeSession` (src/lib/session-lifecycle.js `_respawnAfterExit`), because
 * the conversation's resume settings (model, permission mode, account, pool
 * pin, output style, window place) live in the client; a server-built create
 * would resume it with other settings. Exactly ONE client is asked (every
 * client acting would race duplicate resumes — the pool cold restart's rule):
 * one that had the conversation open, else any open one. With no client open
 * the respawn WAITS (ticked every `tickMs`) for the first one to connect, at
 * most `pendMaxMs`.
 *
 * THE ONE ITEM is filed when the outcome is KNOWN, never ahead of it: a live
 * session carries the conversation again ⇒ "… was restarted; say continue if
 * you need it"; no live session `landMs` after the ask ⇒ "restarting it did
 * not work"; no client within `pendMaxMs` ⇒ "no VibeSpace window was open";
 * a second exit ⇒ "exited unexpectedly again … not restarted". The item is
 * worded per device (`i18n`), origin `agent`, under the conversation's own key.
 */
const fs = require('fs');
const path = require('path');
const { unexpectedExitVerdict, RESPAWN_ONCE_MS } = require('../exit-facts.js');
const { readPpid, readChildPids } = require('../cli-identity.js');

const WS_OPEN = 1;
const RESPAWNED_MAX = 500; // conversation ids remembered for the once-rule (oldest fall off)
let deps = null;
const respawnedAt = new Map(); // conversation id → when VibeSpace asked for its respawn
const pending = new Map();     // conversation id → the respawn waiting for a client / for its landing
let ticker = null;

function install({ userTodos = null, sessionKeyFor = null, activeSessions = null, clients = () => [], log = console, buffersDir = null,
  now = () => Date.now(), tickMs = 5000, landMs = 60 * 1000, pendMaxMs = RESPAWN_ONCE_MS } = {}) {
  deps = { userTodos, sessionKeyFor, activeSessions, clients, log, buffersDir, now, tickMs, landMs, pendMaxMs };
  respawnedAt.clear(); pending.clear();
  if (ticker) { clearInterval(ticker); ticker = null; }
}

// HH:MM on this server's clock — the owner's words ("… exited unexpectedly at HH:MM")
function hhmm(ms) { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

// the item's words — English t() keys the client words per device (i18nKey = the extraction marker)
const i18nKey = (s) => s;
const TEXTS = Object.freeze({
  respawned: i18nKey('"{name}" exited unexpectedly at {time} and was restarted; say continue if you need it'),
  again: i18nKey('"{name}" exited unexpectedly again at {time} and was not restarted (it restarts by itself once); resume it if you need it'),
  failed: i18nKey('"{name}" exited unexpectedly at {time}; restarting it did not work — resume it if you need it'),
  'no-window': i18nKey('"{name}" exited unexpectedly at {time}; no VibeSpace window was open to restart it — resume it if you need it'),
  'no-conversation': i18nKey('"{name}" exited unexpectedly at {time}, before it had a conversation to resume'),
});
const fill = (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? String(p[k]) : m));

function file(entry, outcome) {
  const { userTodos, log } = deps || {};
  if (!userTodos || !entry.key) return null;
  const params = { name: entry.name, time: hhmm(entry.exitedAt) };
  const text = fill(TEXTS[outcome], params);
  try {
    const item = userTodos.add(entry.key, {
      origin: 'agent', by: 'agent', urgency: outcome === 'respawned' ? 'normal' : 'high', sessionName: entry.name, text,
      detail: `Exit record: ${entry.record.trim()}\n`
        + (outcome === 'respawned' ? 'It was resumed with nothing sent into it, so no turn was billed; it waits for you.' : 'Nothing was sent into it.'),
      i18n: { text: { key: TEXTS[outcome], params } },
    });
    log?.log?.(`[unexpected-exit] ${entry.deadId} "${entry.name}": ${outcome} — filed in For you`);
    return item;
  } catch (e) { log?.warn?.(`[unexpected-exit] ${entry.deadId}: For-you item not filed — ${e && e.message}`); return null; }
}

/** A live session other than the dead one carries the conversation again. */
function liveCarrier(entry) {
  for (const [sid, s] of deps.activeSessions || []) {
    if (sid !== entry.deadId && s && (s.claudeSessionId || s.backendSessionId) === entry.cid) return sid;
  }
  return null;
}
const isOpen = (ws) => !!ws && ws.readyState === WS_OPEN && typeof ws.send === 'function';
function pickClient(entry) {
  for (const ws of entry.preferred) if (isOpen(ws)) return ws;
  for (const ws of deps.clients() || []) if (isOpen(ws)) return ws;
  return null;
}

function tick() {
  if (!deps) return;
  const t = deps.now();
  for (const [cid, entry] of [...pending]) {
    if (liveCarrier(entry)) { pending.delete(cid); file(entry, 'respawned'); continue; }
    if (entry.askedAt) {
      if (t - entry.askedAt >= deps.landMs) { pending.delete(cid); file(entry, 'failed'); }
      continue;
    }
    const ws = pickClient(entry);
    if (ws) {
      try {
        ws.send(JSON.stringify({ type: 'unexpected-exit-respawn', session: entry.target }));
        entry.askedAt = t;
        deps.log?.log?.(`[unexpected-exit] ${entry.deadId} "${entry.name}": a client was asked to resume ${cid}`);
      } catch { /* the next tick tries another */ }
    } else if (t - entry.exitedAt >= deps.pendMaxMs) { pending.delete(cid); file(entry, 'no-window'); }
  }
  if (pending.size && !ticker) { ticker = setInterval(tick, deps.tickMs); ticker.unref?.(); }
  if (!pending.size && ticker) { clearInterval(ticker); ticker = null; }
}

/** A USER's kill through a pid door (the System panel's signal — sysinfo-wiring signalProc; /api/kill-pid) marks
 *  every session whose process tree it hits — the wrapper (meta.pid), its CLI (meta.childPid) or a child of it, the
 *  dtach master above the wrapper — so the exit record names the actor (verify r1: the panel's SIGTERM of a WORKING
 *  conversation's CLI read as a crash and was respawned). → how many sessions were marked.
 *  `refreshOnly` (verify r2, the panel's CONT): a signal sent to a STOPPED process is delivered only when it is
 *  continued — STOP, TERM, then CONT a minute later killed it with a mark long stale, read as a crash and respawned —
 *  so a CONT re-stamps a mark the session already carries and marks nothing new. */
function markAskedByPid(pid, by, { refreshOnly = false } = {}) {
  const n = Number(pid);
  if (!deps || !deps.activeSessions || !Number.isInteger(n) || n <= 1) return 0;
  let marked = 0;
  for (const [id, s] of deps.activeSessions) {
    let meta = null;
    try { if (deps.buffersDir) meta = JSON.parse(fs.readFileSync(path.join(deps.buffersDir, id + '.json'), 'utf8')); } catch { }
    const wrapper = meta && Number(meta.pid), cli = (meta && Number(meta.childPid)) || (s && s._childPid);
    const tree = new Set([wrapper, cli].filter((p) => Number.isInteger(p) && p > 1));
    try { if (cli) for (const c of readChildPids(cli)) tree.add(c); } catch { }
    try { const up = wrapper ? readPpid(wrapper) : null; if (up && up > 1 && up !== process.pid) tree.add(up); } catch { }
    if (s && tree.has(n) && !(refreshOnly && !s._exitAsked)) { s._exitAsked = { by: refreshOnly ? s._exitAsked.by : by, at: deps.now() }; marked++; }
  }
  return marked;
}

/** The teardown's call (src/server/session-stdout.js), after the exit line:
 *  judge the exit and, when it is unexpected, respawn once or notify. */
function onExit(session, id, facts, { midTurn = false } = {}) {
  if (!deps || !session) return null;
  const t = deps.now();
  const cid = session.claudeSessionId || session.backendSessionId || null;
  const v = unexpectedExitVerdict({ mode: session.mode, backend: session.backend || 'claude', midTurn, facts, remote: !!session.host, conversationId: cid,
    respawnedAt: cid ? respawnedAt.get(cid) : null, askedBy: facts && facts.askedBy, now: t });
  if (!v.unexpected) return v;
  let key = null;
  try { key = deps.sessionKeyFor ? deps.sessionKeyFor(session, id) : null; } catch { }
  const name = session.name || session.webuiName || cid || id;
  const entry = { cid, deadId: id, exitedAt: t, key, name, askedAt: 0,
    record: `code=${facts && facts.code != null ? facts.code : '-'}${(facts && facts.suffix) || ''}`,
    preferred: session.clients && typeof session.clients.keys === 'function' ? [...session.clients.keys()] : [],
    target: { serverId: id, backend: session.backend || 'claude', backendSessionId: cid, cwd: session.cwd || null, name: session.name || null, host: session.host || null, mode: session.mode } };
  deps.log?.log?.(`[unexpected-exit] ${id} "${name}" exited while working (${entry.record.trim()}) — ${v.action === 'respawn' ? 'restarting it once' : 'notify only (' + v.why + ')'}`);
  if (v.action === 'notify') { if (cid) pending.delete(cid); file(entry, v.why === 'again' ? 'again' : 'no-conversation'); return v; } // a respawn still pending is superseded: ONE item says it
  respawnedAt.delete(cid); respawnedAt.set(cid, t);
  if (respawnedAt.size > RESPAWNED_MAX) respawnedAt.delete(respawnedAt.keys().next().value);
  pending.set(cid, entry);
  tick();
  return v;
}

module.exports = { install, onExit, tick, markAskedByPid, TEXTS };
