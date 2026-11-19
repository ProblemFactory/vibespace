'use strict';
/**
 * B-69a7 — THE HUB'S HALF of «what a stopped turn's command tool left running» (src/left-behind.js reads; this file asks and
 * answers). ONE read when a person's Stop SETTLES (claude-stream-json: the CLI's idle while `_stopAskedAt` is set) — never a loop:
 * this machine through src/left-behind.js (the hub's own records — src/proc-identity.js keptOut — held out; THIS conversation's
 * own processes — its pty and the CLI's recorded pid, with their marked ancestors — named apart as kept), a paired machine
 * through the device agent's READ-ONLY op (asked only of an agent that says it has it). THE TURN'S START is the later of the
 * hub's input stamps and the instant the CLI's own init opened the turn (session-brain `_turnBy.at` — a turn the CLI opens itself
 * has no input stamp); neither known ⇒ «could not be read». Said ONCE in the conversation (a meta line); nothing said when
 * nothing is left; a cut read or a process of this user that could not be read is SAID, never «nothing left».
 * THE END DOOR (this machine only — on a paired machine ending is a device act, a later unit): a PERSON's press (the owner's page
 * verdict at the socket's handshake, ws-handler `_personPage` — anything else refused by name) on ONE said line (its `at`; a
 * later Stop's line never replaces an earlier one's list), each listed pid read AGAIN at the press (the same start time, not
 * under anything the hub holds NOW, still this conversation's mark), then src/proc-identity.js endTree — which signals the pid
 * alone (never a group), judged again at the signal, SIGTERM then SIGKILL — and says what ended and what did not. Never the
 * hub, a wrapper, pid 1: none of them can carry a listed row (held out at the read and the press, pid > 1).
 */
const LB = require('../left-behind.js');
const PI = require('../proc-identity.js');
const { turnStartOf } = require('../stop-nudge.js');

const LISTS = 4;   // the End lists a conversation keeps (one per said line, newest last)
const markOf = (id) => `CLAUDE_WEBUI_SESSION_ID=${id}`;
const nameOfHost = (hosts, id) => { try { const h = hosts && typeof hosts.get === 'function' ? hosts.get(id) : null; return (h && h.name) || String(id); } catch { return String(id); } };
/** the start of the turn that stopped: the later of the input stamps and the CLI's own opening of the turn — or null */
function startOf(session) {
  const a = turnStartOf(session) || 0, b = Number(session && session._turnBy && session._turnBy.at) || 0;
  return Math.max(a, b) || null;
}
const ownOf = (session) => [session.pty && session.pty.pid, session._childPid].map(Number).filter((p) => Number.isInteger(p) && p > 1);

/** after a person's Stop settled: read once, say once → the said line's data (null when nothing was said) */
async function afterStop(session, id, { broadcastToSession, hosts = null, read = LB.leftBehind, now = Date.now } = {}) {
  if (!session || !id || typeof broadcastToSession !== 'function') return null;
  const started = startOf(session), mark = markOf(id);
  let r;
  if (!started) r = { unread: 'no-turn-start' };
  else if (session.host) {
    const ageMs = Math.max(0, now() - started);
    try {
      const dm = hosts && typeof hosts.deviceBounded === 'function' ? await hosts.deviceBounded(session.host, 6000) : null;
      r = dm && typeof dm.leftBehind === 'function' ? await dm.leftBehind({ mark, ageMs }) : { unread: 'no-agent-op' };
    } catch (e) { r = { unread: /lacks left-behind/.test(String(e && e.message)) ? 'no-agent-op' : 'machine-unreachable' }; }
  } else {
    const own = ownOf(session);
    r = await read({ mark, ageMs: Math.max(0, now() - started), keep: PI.keptOut(own), own });
  }
  const left = Array.isArray(r && r.left) ? r.left : [], kept = Array.isArray(r && r.kept) ? r.kept : [];
  const unreadable = Math.max(0, Number(r && r.scan && r.scan.unreadable) || 0);
  const unread = (r && r.unread) || (r && r.scan && r.scan.cut ? 'cut' : null);
  if (!left.length && !kept.length && !unread && !unreadable) return null;
  const at = now(), door = !session.host && left.length > 0;
  if (door) {
    const lists = (Array.isArray(session._leftBehind) ? session._leftBehind : []).concat([{ at, mark, rows: left.map((x) => ({ pid: x.pid, start: x.start, comm: x.comm })) }]);
    session._leftBehind = lists.slice(-LISTS);
  }
  const data = { at, left: left.map((x) => ({ pid: x.pid, comm: x.comm })), kept: kept.map((x) => ({ pid: x.pid, comm: x.comm })), machine: session.host ? nameOfHost(hosts, session.host) : null, door, unread, unreadable };
  try { broadcastToSession(session, id, { type: 'msg', sessionId: id, op: 'meta', subtype: 'left-behind', data }); } catch { }
  return data;
}

/** THE END DOOR: a person's press on the line said at `at` → {ok, ended: [comm], still: [comm], gone: n} | {ok: false, reason} */
async function endLeft(session, { by = null, at = null, end = PI.endTree, still = LB.stillLeft, graceMs = 3000 } = {}) {
  if (!by || by.kind !== 'human') return { ok: false, reason: 'not-the-person' };
  if (!session) return { ok: false, reason: 'stopped' };
  if (session.host) return { ok: false, reason: 'paired-machine' };
  const lists = Array.isArray(session._leftBehind) ? session._leftBehind : [];
  const k = lists.findIndex((l) => l && Number(l.at) === Number(at));
  const lb = k >= 0 ? lists[k] : null;
  if (!lb || !Array.isArray(lb.rows) || !lb.rows.length) return { ok: false, reason: 'nothing-listed' };
  session._leftBehind = lists.filter((l, j) => j !== k);   // one press, one list
  if (!session._leftBehind.length) session._leftBehind = null;
  const keep = PI.keptOut(ownOf(session)).concat(ownOf(session).map((p) => [p, 0]));   // what the hub holds NOW, and the conversation's own
  const members = [];
  let gone = 0;
  for (const row of lb.rows) {
    const m = Number(row.pid) > 1 && Number(row.pid) !== process.pid ? await still(row, lb.mark, { keep }) : null;
    if (m) members.push({ ...m, bootId: PI.bootIdOf ? PI.bootIdOf() : undefined }); else gone++;
  }
  const r = members.length ? await end(members, { graceMs }) : { ended: [], left: [], stale: 0 };
  const names = (l) => (Array.isArray(l) ? l : []).map((x) => (x && typeof x === 'object' ? x.comm : x)).filter(Boolean).map(String);
  return { ok: true, ended: names(r.ended), still: names(r.left), gone: gone + (Number(r.stale) || 0) };
}

module.exports = { afterStop, endLeft, markOf, startOf };
