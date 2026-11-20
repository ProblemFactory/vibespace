'use strict';
/**
 * B-69a7 — THE HUB'S HALF of «what a stopped turn's command tool left running» (src/left-behind.js reads; this file asks and
 * answers). ONE read when a person's Stop SETTLES (claude-stream-json: the CLI's idle while `_stopAskedAt` is set) — never a loop:
 * this machine through src/left-behind.js (the hub's own records — src/proc-identity.js keptOut — held out; THIS conversation's
 * own chain KNOWN BY RECORD: the wrapper's own meta `<buffers>/<id>.json` (`pid`, `childPid` — the file the pid refresh reads),
 * the recorded CLI pid; the pty beside them, never proof alone — unknown ⇒ «could not be read», nothing named, no door), a
 * paired machine through the device agent's READ-ONLY op (asked only of an agent that says it has it; the conversation's
 * keeper sid names its record there). THE TURN'S START is the later of the hub's input stamps and the instant the CLI's own
 * init opened the turn (session-brain `_turnBy.at`); neither known ⇒ «could not be read». Said ONCE in the conversation (a meta
 * line); nothing said when nothing is left; «could not be read» is said once per conversation and reason, never at every Stop.
 * THE END DOOR (this machine only — on a paired machine ending is a device act, a later unit): a PERSON's press (the owner's page
 * verdict at the socket's handshake, ws-handler `_personPage` — anything else refused by name) on ONE said line (its `at`; a
 * later Stop never replaces an earlier line's list), each listed pid read AGAIN at the press with the scan's own bound (the same
 * start time, not under anything the hub holds NOW, still this conversation's mark and no job's), then src/proc-identity.js
 * endTree — the pid alone (never a group), judged again at the signal, SIGTERM then SIGKILL — and says what ended, what still
 * runs, what the hub or a job holds now, what could not be read again (kept listed for another press) — the whole press under
 * ONE deadline. A press that does not finish is said and keeps its list; one press at a time on a line.
 */
const path = require('path');
const LB = require('../left-behind.js');
const PI = require('../proc-identity.js');
const { turnStartOf } = require('../stop-nudge.js');

const LISTS = 4;   // the End lists a conversation keeps (one per said line, newest last)
const PRESS_MS = 1500;   // ONE deadline for a whole press's re-checks (each row gets what is left; past it a row answers «unread»)
const BUFFERS = path.join(__dirname, '..', '..', 'data', 'session-buffers');   // the wrapper's own meta (server.js BUFFERS_DIR)
const SAID = new WeakMap();   // conversation → the «could not be read» reasons already said to it
const PRESSING = new WeakMap();   // conversation → the lines (`at`) whose press is running now
const markOf = (id) => `CLAUDE_WEBUI_SESSION_ID=${id}`;
const nameOfHost = (hosts, id) => { try { const h = hosts && typeof hosts.get === 'function' ? hosts.get(id) : null; return (h && h.name) || String(id); } catch { return String(id); } };
/** A WALL-CLOCK STEP SINCE THE TURN OPENED (主开发 r274 / r541): the hub's wall clock minus its monotonic one (against its time
 *  origin), sampled when the turn opened (session-brain setTurnBy → `_turnBy.step`) and now. Their difference is the step a clock
 *  set DURING the turn made — taken out of the turn's age, so the birth-time cut (src/left-behind.js: the kernel's btime, derived
 *  from the wall clock at each read) names the turn's own start: a forward step no longer lists an earlier turn's process as this
 *  turn's, a backward one no longer hides this turn's. A turn with no sample (an older record) is aged as before. */
const wallStepNow = () => Math.round(Date.now() - (performance.timeOrigin + performance.now()));
function stepSince(session, nowStep) { const s = session && session._turnBy && session._turnBy.step; return Number.isFinite(s) && Number.isFinite(nowStep) ? nowStep - s : 0; }
/** the start of the turn that stopped: the later of the input stamps and the CLI's own opening of the turn — or null */
function startOf(session) {
  const a = turnStartOf(session) || 0, b = Number(session && session._turnBy && session._turnBy.at) || 0;
  return Math.max(a, b) || null;
}
const pidOk = (p) => Number.isInteger(p) && p > 1;
const ptyOf = (session) => [Number(session && session.pty && session.pty.pid)].filter(pidOk);
const recordedOf = (session) => [Number(session && session._childPid)].filter(pidOk);
const recordFileOf = (buffersDir, id) => { const root = path.resolve(buffersDir), f = path.resolve(root, `${id}.json`); return path.dirname(f) === root ? f : null; };
/** «could not be read» once per conversation and reason — when it is ALL the line would say; beside named rows the caveat is
 *  always carried (a partial list never reads as a whole one) → the reasons to say now (and now marked said) */
function fresh(session, reasons, withRows) {
  const s = SAID.get(session) || new Set();
  SAID.set(session, s);
  const out = reasons.filter((r) => r && (withRows || !s.has(r)));
  for (const r of out) s.add(r);
  return out;
}

/** after a person's Stop settled: read once, say once → the said line's data (null when nothing was said) */
async function afterStop(session, id, { broadcastToSession, hosts = null, read = LB.leftBehind, now = Date.now, buffersDir = BUFFERS, wallStep = wallStepNow } = {}) {
  if (!session || !id || typeof broadcastToSession !== 'function') return null;
  const started = startOf(session), mark = markOf(id);
  const ageOf = () => Math.max(0, now() - started - stepSince(session, wallStep()));   // the turn's age with a step made during it taken out
  let r;
  if (!started) r = { unread: 'no-turn-start' };
  else if (session.host) {
    const ageMs = ageOf(), sid = typeof session.keeperSid === 'string' && /^[\w-]+$/.test(session.keeperSid) ? session.keeperSid : null;
    try {
      const dm = hosts && typeof hosts.deviceBounded === 'function' ? await hosts.deviceBounded(session.host, 6000) : null;
      r = dm && typeof dm.leftBehind === 'function' ? await dm.leftBehind({ mark, ageMs, sid }) : { unread: 'no-agent-op' };
    } catch (e) { r = { unread: /lacks left-behind/.test(String(e && e.message)) ? 'no-agent-op' : e && e.code === 'hosts-unread' ? 'hosts-unread' : 'machine-unreachable' }; }   // the B-f276 stores chain: a HELD machines list is its own reason — VibeSpace cannot read its record of the machine, never «unreachable»
  } else {
    const own = [...recordedOf(session), ...ptyOf(session)], file = recordFileOf(buffersDir, id);
    r = await read({ mark, ageMs: ageOf(), keep: PI.keptOut(own), own: ptyOf(session), recordPids: recordedOf(session), records: file ? [file] : [] });
  }
  const left = Array.isArray(r && r.left) ? r.left : [], kept = Array.isArray(r && r.kept) ? r.kept : [], jobs = Array.isArray(r && r.jobs) ? r.jobs : [];
  const n = Math.max(0, Number(r && r.scan && r.scan.unreadable) || 0);
  const said = fresh(session, [(r && r.unread) || (r && r.scan && r.scan.cut ? 'cut' : null), n > 0 ? 'unreadable' : null], left.length + kept.length + jobs.length > 0);
  const unread = said.find((x) => x !== 'unreadable') || null, unreadable = said.includes('unreadable') ? n : 0;
  if (!left.length && !kept.length && !jobs.length && !unread && !unreadable) return null;
  const at = now(), door = !session.host && left.length > 0 && !(r && r.unread);
  if (door) {
    const lists = (Array.isArray(session._leftBehind) ? session._leftBehind : []).concat([{ at, mark, rows: left.map((x) => ({ pid: x.pid, start: x.start, comm: x.comm })) }]);
    session._leftBehind = lists.slice(-LISTS);
  }
  const names = (l) => l.map((x) => ({ pid: x.pid, comm: x.comm }));
  const data = { at, left: names(left), kept: names(kept), jobs: names(jobs), machine: session.host ? nameOfHost(hosts, session.host) : null, door, unread, unreadable };
  try { broadcastToSession(session, id, { type: 'msg', sessionId: id, op: 'meta', subtype: 'left-behind', data }); } catch { }
  return data;
}

/** THE END DOOR: a person's press on the line said at `at` → {ok, ended: [comm], still: [comm], gone: n, unread: n} | {ok: false, reason} */
async function endLeft(session, { by = null, at = null, end = PI.endTree, still = LB.stillLeft, graceMs = 3000 } = {}) {
  if (!by || by.kind !== 'human') return { ok: false, reason: 'not-the-person' };
  if (!session) return { ok: false, reason: 'stopped' };
  if (session.host) return { ok: false, reason: 'paired-machine' };
  const lists = Array.isArray(session._leftBehind) ? session._leftBehind : [];
  const lb = lists.find((l) => l && Number(l.at) === Number(at)) || null;
  if (!lb || !Array.isArray(lb.rows) || !lb.rows.length) return { ok: false, reason: 'nothing-listed' };
  const setList = (rows) => {   // this line's list: kept (rows left to end) or gone; the other lines' lists untouched
    const others = (Array.isArray(session._leftBehind) ? session._leftBehind : []).filter((l) => l !== lb);
    const next = (rows.length ? others.concat([{ ...lb, rows }]).sort((a, b) => a.at - b.at) : others).slice(-LISTS);
    session._leftBehind = next.length ? next : null;
  };
  const running = PRESSING.get(session) || new Set();
  PRESSING.set(session, running);
  if (running.has(lb.at)) return { ok: false, reason: 'already-pressed' };   // one press at a time on a line, said
  running.add(lb.at);
  try {
    const own = [...recordedOf(session), ...ptyOf(session)];
    const keep = PI.keptOut(own).concat(own.map((p) => [p, 0]));   // what the hub holds NOW, and the conversation's own
    const members = [], unread = [], t0 = Date.now();
    let gone = 0, held = 0;
    for (const row of lb.rows) {
      const rest = PRESS_MS - (Date.now() - t0);
      const v = !(Number(row.pid) > 1 && Number(row.pid) !== process.pid) ? 'gone' : rest > 0 ? await still(row, lb.mark, { keep, maxMs: rest }) : 'unread';
      if (v && typeof v === 'object') members.push({ ...v, bootId: PI.bootIdOf ? PI.bootIdOf() : undefined });
      else if (v === 'unread') unread.push(row); else if (v === 'held') held++; else gone++;
    }
    const r = members.length ? await end(members, { graceMs }) : { ended: [], left: [], stale: 0 };
    const names = (l) => (Array.isArray(l) ? l : []).map((x) => (x && typeof x === 'object' ? x.comm : x)).filter(Boolean).map(String);
    setList(unread.length ? unread : []);   // what could not be read again stays listed for another press
    return { ok: true, ended: names(r.ended), still: names(r.left), gone: gone + (Number(r.stale) || 0), held, unread: unread.length };
  } catch {
    setList(lb.rows);   // a press that did not finish vouches for nothing: the list is kept (a second press re-checks every row), said
    return { ok: false, reason: 'press-failed' };
  } finally { running.delete(lb.at); }
}

module.exports = { afterStop, endLeft, markOf, startOf };
