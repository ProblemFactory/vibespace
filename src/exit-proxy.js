/**
 * ExitProxyManager (task #164; lane-pairing ⑥ 2026-09-28) — ON-DEMAND egress through a paired machine, and
 * WHO may use it.
 *
 * An agent (running in a session on THIS instance) can borrow a remote machine's network for a SINGLE command
 * when it needs that machine's network position (a region, an internal network, a fixed IP) — NOT a
 * session-wide proxy. Two tiers:
 *   • BORROW (`use`, SOCKS): the machine's daemon serves a SOCKS5 proxy on its loopback; we reach it via
 *     device.tcpForward and bind a local 127.0.0.1:<port>. The tool stays local, only its egress is remote.
 *   • RUN (`run`, native): execute the command ON the machine via device.runCmd — as the machine's user, bounded
 *     by the daemon's 30 s cap (EXIT_RUN_TIMEOUT_MS; the route's old 120 s was never honoured).
 *
 * WHO (lane-pairing ⑥): each machine carries TWO lists (`use`, `run`), each nobody | everyone | only
 * [conversations / Task Groups], `run` with "ask me each time" — PURE src/exit-reach.js decides, this module
 * holds state and does the I/O:
 *   · the verdict is asked at EVERY call with the caller's CURRENT context (`ctxFor`: its keys through
 *     `addressableId` — a pending fork answers only to its webui key — and its Task Groups read NOW; a store
 *     that throws is `groups_unreadable`);
 *   · "ask me each time": ONE pending ask per (conversation, machine), a For-you item (origin `machines`) with
 *     Allow / Deny answerable where it appears, 60 s ⇒ `ask_expired`; the verdict is asked AGAIN after the wait
 *     (`stillGranted`) — a revoke during the wait refuses `not_granted` and the answer is never spent;
 *   · every use / run / ask / refusal = ONE audit line (data/exit-audit.jsonl) + a console line; every run
 *     attempt = a display-only card in the calling chat ("Machines · <machine>", never billed) + the machine
 *     row's `lastRun`; a revoke that narrows `use` closes the live forward when no live conversation still
 *     holds it (the browser lane's §3.1 rule).
 * The device SOCKS binds the machine's loopback, so the tunnel stays loopback↔loopback.
 */
'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const E = require('./exit-reach.js');
const XS = require('./exit-shell.js');
const R = require('./window-reach.js');
const { addressableId, liveForkPending } = require('./claude-lock-capture.js');

const AUDIT_FILE = 'exit-audit.jsonl';
// verify r1 F2 (2026-10-01): the audit is a RING of two files (exit-audit.jsonl → .1 at AUDIT_MAX_BYTES, usage-probe-log's
// shape) — with 8 KiB of output heads per `run` line it grew 8 MB per thousand runs for ever (measured: 10 000 runs = 79 MB)
const AUDIT_MAX_BYTES = 8 * 1024 * 1024;
const AUDIT_READ_CHUNK = 512 * 1024;
// the For-you item's words as STRUCTURE (the client words them in the device's language); i18nKey is the extraction
// marker scripts/i18n-extract.mjs reads (the key lives in the zh / ja dictionaries)
const i18nKey = (k) => k;
const ASK_KEY = i18nKey('Allow "{name}" to run a command on {machine}?');
const ORIGIN = 'exit';

function namedError(code, message, extra = {}) { return Object.assign(new Error(message), { code, ...extra }); }
/** Constant-time equality of two secrets (r1's LOW: `===` leaks the first differing byte to a timing observer). */
function safeEq(a, b) { const A = Buffer.from(String(a == null ? '' : a)), B = Buffer.from(String(b == null ? '' : b)); return A.length === B.length && crypto.timingSafeEqual(A, B); }

/**
 * RFC 1928/1929 on the LOCAL forward (verify-r1 A3): the client's greeting must offer username/password (0x02) —
 * else `05 FF` (no acceptable method) and the socket ends; then `01 ULEN USER PLEN PASS` is judged by `check(user,
 * pass)` — `01 00` and the username resolves, else `01 01` and the socket ends. Bounded: 8 s, ≤ 600 bytes.
 */
function socksAuth(sock, check) {
  return new Promise((resolve, reject) => {
    let acc = Buffer.alloc(0), stage = 0, done = false;
    const end = (e) => { if (done) return; done = true; sock.removeListener('data', onData); clearTimeout(t); if (e) { try { sock.end(); } catch {} reject(e); } };
    const t = setTimeout(() => end(new Error('socks auth timeout')), 8000);
    const onData = (b) => {
      if (done) return;
      acc = Buffer.concat([acc, b]);
      if (acc.length > 600) return end(new Error('socks auth too long'));
      if (stage === 0) {
        if (acc.length < 2) return;
        const n = acc[1];
        if (acc.length < 2 + n) return;
        if (acc[0] !== 0x05 || !acc.subarray(2, 2 + n).includes(0x02)) { try { sock.write(Buffer.from([0x05, 0xff])); } catch {} return end(new Error('socks: username/password not offered')); }
        try { sock.write(Buffer.from([0x05, 0x02])); } catch {}
        acc = acc.subarray(2 + n); stage = 1;
      }
      if (stage === 1) {
        if (acc.length < 2) return;
        const ul = acc[1];
        if (acc.length < 2 + ul + 1) return;
        const pl = acc[2 + ul];
        if (acc.length < 3 + ul + pl) return;
        const user = acc.subarray(2, 2 + ul).toString('utf8'), pass = acc.subarray(3 + ul, 3 + ul + pl).toString('utf8');
        const rest = acc.subarray(3 + ul + pl);
        if (acc[0] !== 0x01 || !check(user, pass)) { try { sock.write(Buffer.from([0x01, 0x01])); } catch {} return end(new Error('socks: refused')); }
        try { sock.write(Buffer.from([0x01, 0x00])); } catch {}
        done = true; sock.removeListener('data', onData); clearTimeout(t);
        sock.pause(); // a flowing socket with no 'data' listener DROPS bytes — the caller resumes once it pipes
        if (rest.length) sock.unshift(rest);
        resolve(user);
      }
    };
    sock.on('data', onData);
    sock.once('close', () => end(new Error('closed during socks auth')));
  });
}

class ExitProxyManager {
  /** @param deps { hosts, log, groupsOf(session, webuiId), userTodos, emitCard(session, card), dataDir, now, sessionsMap(), bcastAll } */
  constructor({ hosts, log, groupsOf = null, userTodos = null, emitCard = null, dataDir = null, now = () => Date.now(), sessionsMap = null, bcastAll = null, auditMaxBytes = AUDIT_MAX_BYTES,
    timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) } } = {}) {
    this.timers = timers; // the ask's 60 s clock (a suite drives it with a fake one)
    this.hosts = hosts;
    this.log = log || (() => {});
    this.groupsOf = groupsOf;
    this.userTodos = userTodos;
    this.emitCard = emitCard;
    this.dataDir = dataDir;
    this.now = now;
    this.sessionsMap = sessionsMap || (() => new Map());
    this.bcastAll = bcastAll || (() => {});
    this.auditMaxBytes = Math.max(64 * 1024, Number(auditMaxBytes) || AUDIT_MAX_BYTES);
    this._live = new Map(); // hostId → { server, sockets:Set, localPort, deviceSocksPort, users:Set<sessionId> }
    this._asks = new Map(); // askId → { askId, hostId, machine, sessionKey, sessionId, name, cmd, askedAt, timer, resolve, todoId }
    this._settled = new Map(); // askId → outcome — a SECOND answer says settled / expired by name (bounded: the last 256)
    // THE ITEM AND THE ASK ARE ONE STATE (verify-r2 ask-b): the For-you item leaving 'open' by any door but our own
    // answer (the ✓ on the row, Mark all seen, a reply, the agent's `vibespace-ask done`, the store's expiry sweep)
    // settles the ask as NOT allowed — before, the item was done while the ask waited its 60 s and could still be
    // ALLOWED through its id afterwards
    if (this.userTodos && typeof this.userTodos.onStatus === 'function') {
      this.userTodos.onStatus((it, { status, by }) => {
        if (!it || !it.action || it.action.type !== 'exit-run-ask') return;
        // verify-r6 W2: ↺ REOPEN of an ask that is over (answered, expired, its conversation gone) drew live Allow / Deny
        // that could only answer 410 — and the item stayed open until the next boot. A request is its ask: one that is
        // over goes straight back to done, said so ("over — the agent can ask again")
        if (status === 'open') {
          if (!this._asks.has(String(it.action.askId || ''))) { try { this.userTodos.setStatus(it.id, 'done', 'ask-over'); } catch { } }
          return;
        }
        const k = this._asks.get(String(it.action.askId || ''));
        if (!k || k.todoId !== it.id) return;
        this._settleAsk(k, by === 'expired' ? 'expired' : 'denied', by === 'expired' ? 'timeout' : `item-${String(status)}-by-${String(by || 'user')}`);
      });
    }
  }

  // ── context + facts ───────────────────────────────────────────────────────
  /** Who the caller IS (window-targets-engine's ctxOf): every key it answers to — a pending fork only its
   *  `webui:<id>` — and the Task Groups it belongs to RIGHT NOW (a throw ⇒ `unreadable`, never "no groups"). */
  ctxFor(session, sessionId) {
    const s = session || {};
    const keys = addressableId(s) ? R.callerKeys(s, sessionId) : [`webui:${sessionId}`];
    let groupIds = [], unreadable = false;
    if (typeof this.groupsOf === 'function') {
      try { groupIds = (this.groupsOf(s, sessionId) || []).map((g) => String(g && typeof g === 'object' ? g.id : g)); }
      catch (e) { unreadable = true; this.log(`group membership unreadable for ${sessionId}: ${e.message}`); }
    }
    return { sessionKeys: keys, groupIds, ...(unreadable ? { unreadable: true } : {}), ...(liveForkPending(s) ? { forkPending: true } : {}) };
  }
  keyOf(session, sessionId) { return addressableId(session) ? R.sessionKeyOf(session, sessionId) : `webui:${sessionId}`; }
  _hosts() { try { return this.hosts.list?.() || []; } catch { return []; } }
  _raw(hostId) { try { return this.hosts.get(hostId); } catch { return null; } }
  access(hostId) { return E.exitAccessOf(this._raw(hostId)); }
  _online(h) { return h.transport === 'dial' ? !!h.online : true; } // ssh probed at use time

  // ── the audit ─────────────────────────────────────────────────────────────
  audit(line) {
    // verify r2 F7: every line carries its own `id` — the command list keyed its rows by (instant, conversation, command) and
    // two runs of one command in the same millisecond collapsed into one row (the second re-worded the first)
    const rec = { at: this.now(), id: crypto.randomBytes(6).toString('hex'), origin: ORIGIN, ...line };
    // the audit line is the ONE durable record of what ran: the WHOLE command (≤ CMD_MAX bytes, control characters
    // as spaces) — verify-r1 A1: cut at 120 chars, a 4 KB command's payload past the head was in no record at all
    // (the row's lastRun and the card keep their 120 / 80-char heads by design)
    // lane exit-see-whole: its LINES and tabs kept (the owner's Commands list shows the command as itself; JSON holds them)
    if (typeof rec.cmd === 'string') rec.cmd = E.cleanLines(rec.cmd, E.CMD_MAX);
    if (this.dataDir) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
        const f = path.join(this.dataDir, AUDIT_FILE), text = JSON.stringify(rec) + '\n';
        // verify r1 F2: the ring — the live file rotates to `.1` when this line would carry it past the bound (the
        // previous `.1` is gone: the history is the last ~16 MB of lines, said in the owner's list)
        let size = 0; try { size = fs.statSync(f).size; } catch { }
        if (size > 0 && size + Buffer.byteLength(text) > this.auditMaxBytes) { try { fs.renameSync(f, f + '.1'); } catch (e) { this.log(`audit not rotated: ${e.message}`); } }
        fs.appendFileSync(f, text);
      } catch (e) { this.log(`audit line not written: ${e.message}`); }
    }
    // lane-exit-run-output E4: the ONE audit writer NOTIFIES — an open command list (the machine's "Commands…" dialog)
    // patches its keyed row in place off this broadcast instead of re-reading the tail (the 2.309.0 rule)
    try { this.bcastAll({ type: 'exit-audit', line: rec }); } catch { }
    return rec;
  }
  /** THE ONE run/attempt history: `run` lines with a command, newest first, ≤ RUNS_MAX (verify: a hand-written
   *  line is re-bounded by E.runRow). `agent: true` drops names / keys. */
  _runs({ hostId = null, sessionKeys = null, machine = null, limit = E.RUNS_DEFAULT, agent = false } = {}) {
    const n = Math.max(1, Math.min(E.RUNS_MAX, Number(limit) || E.RUNS_DEFAULT));
    const keys = sessionKeys ? new Set(sessionKeys.map(String)) : null;
    const ref = machine == null || machine === '' ? null : String(machine).toLowerCase();
    const out = [];
    // verify r1 F2: the predicate rides INTO the tail read — a quiet machine's (or conversation's) rows are found behind
    // another machine's storm (the old 2 MiB window held ~240 lines of 8 KiB heads: the owner's list of B read 0 of 1)
    const want = (l) => !!l && l.verb === 'run' && typeof l.cmd === 'string'
      && (!keys || keys.has(String(l.sessionKey || '')))
      && (!ref || String(l.hostId || '') === String(machine) || String(l.machine || '').toLowerCase().includes(ref) || String(l.hostId || '').toLowerCase().includes(ref));
    // verify r2 F6: the agent's read carries its keys as RAW marks too — without them every line of the ring was JSON.parsed
    // before the predicate said no (16 MB ⇒ 2 000 parses ⇒ ~100 ms on the event loop for a conversation with no rows)
    const marks = keys ? [...keys].map((k) => `"sessionKey":${JSON.stringify(k)}`) : null;
    const lines = this.auditTail({ hostId, limit: n, filter: want, marks });
    for (let i = lines.length - 1; i >= 0 && out.length < n; i--) {
      const row = E.runRow(lines[i], { agent });
      if (row) out.push(row);
    }
    return out;
  }
  /** The OWNER's list for one machine (GET /api/hosts/:id/exit-runs): every conversation's runs there. */
  runsOf(hostId, { limit } = {}) { return this._runs({ hostId, limit }); }
  /** The AGENT's list (vibespace-exit runs): THIS conversation's own runs only — never another's (its keys through
   *  addressableId, like every verb). */
  runsFor(session, sessionId, { machine = null, limit } = {}) {
    const keys = this.ctxFor(session, sessionId).sessionKeys;
    return this._runs({ sessionKeys: keys, machine, limit, agent: true });
  }
  /** What the daemon told us about itself at its hello (capabilities, platform) — a fake device may say nothing. */
  _daemonInfo(dm) {
    try { const st = typeof dm.status === 'function' ? dm.status() : null; return (st && st.info) || {}; } catch { return {}; }
  }
  /** The newest `limit` audit lines that match (oldest first), read BACKWARDS in chunks over the ring (the live file,
   *  then `.1`) and stopped at `limit` matches — verify r1 F2: the old read took the last 2 MiB whole and filtered
   *  after, so a machine's 8 KiB-head lines pushed every other machine's history out of the window. A line is parsed
   *  only after a raw substring check for `hostId` (and for one of `marks` — verify r2 F6); `filter(line)` is the
   *  caller's predicate (the run list's). */
  auditTail({ hostId = null, limit = 50, filter = null, marks = null } = {}) {
    if (!this.dataDir) return [];
    const n = Math.max(1, Math.min(E.RUNS_MAX, Number(limit) || 50));
    const hostMark = hostId ? `"hostId":${JSON.stringify(String(hostId))}` : null;
    // verify r2 F6: `marks` = raw substrings of which a line must carry at least ONE before it is parsed (the agent's
    // session keys); the parse then re-checks every fact — a mark inside a stored stdout admits a line to the parse only
    const anyMark = Array.isArray(marks) && marks.length ? marks.map(String) : null;
    const judge = (raw, out) => {
      if (!raw || (hostMark && !raw.includes(hostMark)) || (anyMark && !anyMark.some((m) => raw.includes(m)))) return;
      let j = null; try { j = JSON.parse(raw); } catch { return; }
      if (!j || typeof j !== 'object' || (hostId && j.hostId !== hostId) || (filter && !filter(j))) return;
      out.push(j);
    };
    const out = []; // newest first while collecting
    for (const name of [AUDIT_FILE, AUDIT_FILE + '.1']) {
      if (out.length >= n) break;
      const f = path.join(this.dataDir, name);
      let fd = null;
      try {
        const st = fs.statSync(f); fd = fs.openSync(f, 'r');
        let pos = st.size, carry = Buffer.alloc(0);
        while (pos > 0 && out.length < n) {
          const len = Math.min(AUDIT_READ_CHUNK, pos); pos -= len;
          const b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, pos);
          const buf = carry.length ? Buffer.concat([b, carry]) : b;
          const firstNl = buf.indexOf(0x0a);
          if (firstNl < 0) { carry = buf; continue; }                 // no whole line yet: keep reading backwards
          const lines = buf.subarray(firstNl + 1).toString('utf8').split('\n');
          for (let i = lines.length - 1; i >= 0 && out.length < n; i--) judge(lines[i], out);
          carry = buf.subarray(0, firstNl);                            // the head is a partial line (unless at the start)
        }
        if (pos === 0 && out.length < n && carry.length) judge(carry.toString('utf8'), out);
      } catch { /* no such file: the next ring file, or nothing */ }
      finally { if (fd !== null) { try { fs.closeSync(fd); } catch { } } }
    }
    return out.reverse();
  }

  // ── the user's side ───────────────────────────────────────────────────────
  /** Every machine for the cookie route (GET /api/exits): its summary + last run (words are the client's). */
  list() {
    return this._hosts().map((h) => {
      const a = E.exitAccessOf(this._raw(h.id) || h);
      return { id: h.id, name: h.name || h.id, transport: h.transport || 'ssh', online: this._online(h), active: this._live.has(h.id), localPort: this._live.get(h.id)?.localPort || null, summary: E.summaryOf(a), lastRun: a.lastRun || null };
    });
  }
  /** GET /api/hosts/:id/exit-access — drawn FRESH by the dialog (never the row's broadcast copy; mirror-193). */
  view(hostId, { roster = null } = {}) {
    const h = this._raw(hostId);
    if (!h) throw namedError('not-found', 'no such machine');
    const listed = this._hosts().find((x) => x.id === hostId) || h;
    const a = E.exitAccessOf(h);
    const withNames = (g) => (g && Array.isArray(g.who) ? { ...g, who: roster ? R.principalsNow(g.who, roster) : g.who } : g);
    const access = a.mode === 'unknown' ? a : { ...a, use: withNames(a.use), run: withNames(a.run) };
    const live = this._live.get(hostId);
    const sm = this.sessionsMap();
    const nameOf = (sid) => { const s = sm.get(sid); return s ? (s.name || s.webuiName || sid) : sid; };
    return {
      machine: { id: h.id, name: h.name || h.id, online: this._online(listed) },
      access, base: E.exitStamp(a),
      usedBy: {
        use: live ? [...live.users].filter((sid) => sm.has(sid)).map((sid) => ({ sessionId: sid, name: nameOf(sid) })) : [],
        run: [...this._asks.values()].filter((k) => k.hostId === hostId).map((k) => ({ askId: k.askId, sessionId: k.sessionId, name: k.name, cmd: k.cmd.slice(0, 120) })),
      },
      lastRun: a.lastRun || null,
      audit: this.auditTail({ hostId, limit: 10 }),
    };
  }
  /**
   * PATCH /api/hosts/:id/exit-access — ONE whole-list write with the `base` it read (409 list_changed otherwise),
   * then the RE-JUDGE: a live `use` forward nobody live still holds closes; a waiting ask whose conversation lost
   * `run` is settled `ask_denied` (why `revoked`) and its For-you item resolved. → `{access, base, changed,
   * stopped, settled}` | throws a named error (the route maps the code).
   */
  async setAccess(hostId, body, { by = 'user' } = {}) {
    const h = this._raw(hostId);
    if (!h) throw namedError('not-found', 'no such machine');
    const cur = E.exitAccessOf(h);
    const v = E.patchVerdict(cur, body, { now: this.now(), by });
    if (!v.ok) throw namedError(v.code, v.error || v.code, v.code === 'list_changed' ? { added: v.added, removed: v.removed } : { grant: v.grant });
    // what this machine lends RIGHT NOW (the report is the difference, whichever re-judge did the cutting: in server.js
    // the store's own write already calls rejudgeAll through hosts.onReachChange — verify-r3 A-r3a)
    const liveBefore = this._live.get(hostId);
    const heldBefore = liveBefore ? [...new Set([...liveBefore.users, ...(liveBefore.bySession ? liveBefore.bySession.keys() : [])])] : [];
    const asksBefore = [...this._asks.values()].filter((k) => k.hostId === hostId).map((k) => k.askId);
    this.hosts.setExitAccess(hostId, E.storedExit(v.access));
    const now = E.exitAccessOf(this._raw(hostId));
    this.audit({ hostId, machine: h.name || h.id, verb: 'access-changed', by, ok: true, changed: v.changed, summary: E.summaryOf(now) });
    this.log(`${h.name || h.id}: who can use it changed by ${by} — network ${now.use.mode}${now.use.mode === 'only' ? ` (${now.use.who.length})` : ''}, commands ${now.run.mode}${now.run.mode === 'only' ? ` (${now.run.who.length})` : ''}${now.run.ask ? ' (ask)' : ''}`);
    // THE ONE RE-JUDGE (verify-r3 census) — never a second loop of its own
    await this.rejudgeAll('access-changed').done;
    const liveAfter = this._live.get(hostId);
    const stopped = { use: heldBefore.filter((sid) => !(liveAfter && (liveAfter.users.has(sid) || (liveAfter.bySession && liveAfter.bySession.has(sid))))) };
    const settled = asksBefore.filter((id) => !this._asks.has(id));
    try { this.bcastAll({ type: 'hosts-updated' }); } catch { }
    return { access: now, base: E.exitStamp(now), changed: v.changed, stopped, settled };
  }

  /**
   * A GRANT CAN BE LOST WITHOUT A WRITE ON THE MACHINE (verify-r2, the open connection): a Task Group grant goes when
   * the conversation is unbound, the group deleted or archived, its folders edited — no PATCH, so the two re-judges
   * that existed (setAccess above, and A3-r2's per-NEW-connection check) left an OPEN connection carrying bytes for as
   * long as the agent kept it (reproduced: 1.5 s after leaving the granting group, bytes still through; a PATCH cuts at
   * once). The Task Group store's change hook calls this (server.js): every live forward's holders and every waiting
   * ask are judged against the access NOW, exactly as a PATCH judges them — a holder that lost `use` loses its pair
   * and its open connections, a forward nobody holds stops, an ask that lost `run` is settled `revoked`. Cheap when
   * nothing is borrowed (the hook fires on every Task Group write). Never throws. → `{stopped, settled}`.
   *
   * THE ONE RE-JUDGE (verify-r3, the authority-change census): EVERY writer that can withdraw a conversation's reach
   * to a machine ends here — the machine's PATCH (setAccess), any hosts.json write (hosts.onReachChange: an import,
   * a removal, a reshape — A-r3a), every Task Group write (tasks onChange), a session's own facts moving (its
   * conversation key: a fork's adoption, a codex / ACP thread change; its cwd: the folder rule — server.js's
   * broadcastActiveSessions, the session list's one notify point), the conversation's END (`onSessionEnd` — the kill
   * and exit paths, BEFORE the session leaves the map: `goneSessions`), the machine's un-pairing (`onMachineUnpaired`
   * — before its record goes: `goneHosts`). scripts/test-exit-rejudge.mjs is the grep-derived census of those writers
   * and drives one runtime leg per event. A conversation gone ⇒ its asks settle `conversation-gone`; a grant gone ⇒
   * `revoked`. → `{stopped: [{hostId, sessionId}], settled: [askId], asks: [{askId, hostId, why}], hosts: [hostId]}`
   * with a non-enumerable `done` (the stops' device-side unserve).
   */
  rejudgeAll(why = 'task-groups', { goneSessions = [], goneHosts = [] } = {}) {
    const out = { stopped: [], settled: [], asks: [], hosts: [] };
    const stopping = [];
    try {
      const sm = this.sessionsMap();
      const endedS = new Set((goneSessions || []).filter((x) => x != null && x !== '').map(String));
      const endedH = new Set((goneHosts || []).filter(Boolean).map(String));
      const liveSession = (sid) => (endedS.has(String(sid)) ? null : sm.get(sid) || null);
      for (const [hostId, live] of [...this._live]) {
        const hostGone = endedH.has(hostId);
        const now = hostGone ? null : this.access(hostId);
        for (const sid of new Set([...live.users, ...(live.bySession ? live.bySession.keys() : [])])) {
          const s = hostGone ? null : liveSession(sid);
          if (!s || !E.exitVerdict(now, 'use', this.ctxFor(s, sid)).ok) { live.users.delete(sid); this._dropCred(live, sid); out.stopped.push({ hostId, sessionId: sid }); }
        }
        if (!live.users.size) { out.hosts.push(hostId); stopping.push(this.stop(hostId).catch(() => {})); }
      }
      for (const k of [...this._asks.values()]) {
        const s = liveSession(k.sessionId);
        const kwhy = !s ? 'conversation-gone' : (endedH.has(k.hostId) || !E.exitVerdict(this.access(k.hostId), 'run', this.ctxFor(s, k.sessionId)).ok) ? 'revoked' : null;
        if (kwhy) { this._settleAsk(k, 'denied', kwhy); out.settled.push(k.askId); out.asks.push({ askId: k.askId, hostId: k.hostId, why: kwhy }); }
      }
      if (out.stopped.length || out.settled.length) {
        this.log(`who can use a machine re-judged (${why}): ${out.stopped.length} network holder(s) dropped with their connections, ${out.settled.length} waiting ask(s) settled`);
        try { this.bcastAll({ type: 'hosts-updated' }); } catch { }
      }
    } catch (e) { this.log(`re-judge (${why}) failed: ${e.message}`); }
    Object.defineProperty(out, 'done', { value: Promise.all(stopping), enumerable: false });
    return out;
  }

  // ── the agent's side ──────────────────────────────────────────────────────
  /** The machines THIS conversation may use (either grant) — never another principal, never a name. */
  listFor(session, sessionId) {
    const ctx = this.ctxFor(session, sessionId);
    const out = [];
    for (const h of this._hosts()) {
      const v = E.agentView(E.exitAccessOf(this._raw(h.id) || h), ctx);
      if (!v.use.you && !v.run.you) continue;
      out.push({ id: h.id, name: h.name || h.id, transport: h.transport || 'ssh', online: this._online(h), active: this._live.has(h.id), localPort: this._live.get(h.id)?.localPort || null, grants: { use: v.use.you, run: v.run.you, runAsk: v.run.ask } });
    }
    return out;
  }
  /** Resolve + judge. A named ref resolves over EVERY machine (so a refusal names the grant it lacks, never
   *  "no such machine"); a bare ref over the machines open to this caller for `grant`. */
  _judge(session, sessionId, ref, grant) {
    const ctx = this.ctxFor(session, sessionId);
    const all = this._hosts();
    const pool = (ref == null || ref === '') ? all.filter((h) => E.exitVerdict(E.exitAccessOf(this._raw(h.id) || h), grant, ctx).ok) : all;
    const m = E.resolveMachine(ref, pool);
    if (!m.ok) return { refusal: { code: m.code, error: m.error } };
    const h = m.host;
    const access = E.exitAccessOf(this._raw(h.id) || h);
    const verdict = E.exitVerdict(access, grant, ctx);
    const other = grant === 'use' ? 'run' : 'use';
    const has = { [other]: !!E.exitVerdict(access, other, ctx).ok };
    return { h, access, verdict, ctx, has };
  }
  _refused(session, sessionId, { code, grant, h = null, has = {}, cmd = '', error = '', where = '', same = false }) {
    const machine = h ? (h.name || h.id) : '';
    const sentence = E.refusalText(code, { machine, grant, has, cmd, error, where, same });
    this.audit({ hostId: h ? h.id : null, machine, sessionId, sessionKey: this.keyOf(session, sessionId), name: session && session.name || null, grant, verb: grant, ...(cmd ? { cmd } : {}), ok: false, refusal: code });
    return namedError(code, sentence, { grant, has });
  }
  /** vibespace-exit use / url: ensure the SOCKS forward to the machine → its local proxy URL. */
  async use(session, sessionId, ref) {
    const j = this._judge(session, sessionId, ref, 'use');
    if (j.refusal) throw this._refused(session, sessionId, { code: j.refusal.code, grant: 'use', error: j.refusal.error });
    if (!j.verdict.ok) throw this._refused(session, sessionId, { code: j.verdict.code, grant: 'use', h: j.h, has: j.has });
    const h = j.h;
    // verify-r4 F2 — WHOSE FACT IS THE URL: `use` hands back socks5h://…@127.0.0.1:<port>, a port on THIS machine's
    // loopback. A conversation running on another machine (session.host — ws-create stamps it on every ssh / dial
    // spawn) reads 127.0.0.1 as ITS OWN loopback: nothing listens there, or an unrelated service receives the SOCKS
    // greeting and the conversation's credentials (reproduced with the real manager: a conversation on "gpu-box" got
    // the hub's socks5h://…@127.0.0.1:33569). Refused by name, before a forward is opened; `run` works from anywhere.
    if (session && session.host) {
      const where = (() => { try { const r = this._raw(session.host); return r ? (r.name || r.id) : String(session.host); } catch { return String(session.host); } })();
      throw this._refused(session, sessionId, { code: 'remote_session', grant: 'use', h, has: j.has, where, same: session.host === h.id });
    }
    if (h.transport === 'dial' && !h.online) throw this._refused(session, sessionId, { code: 'offline', grant: 'use', h });
    const r = await this._forward(h);
    const live = this._live.get(h.id);
    if (live && sessionId) live.users.add(sessionId);
    // THE FORWARD IS A LOOPBACK PORT EVERY LOCAL PROCESS CAN REACH (verify-r1 A3): the list gated only who may OPEN
    // it. Each conversation gets its OWN SOCKS5 username/password (the same pair on every `use` while it holds the
    // grant); the local listener demands them before a byte reaches the machine, a revoke drops them (and the
    // connections they opened) at once. The url carries them: socks5h://<user>:<pass>@127.0.0.1:<port>.
    const cred = this._credFor(live, sessionId);
    const url = `socks5h://${cred.user}:${cred.pass}@127.0.0.1:${r.localPort}`;
    this.audit({ hostId: h.id, machine: h.name || h.id, sessionId, sessionKey: this.keyOf(session, sessionId), name: session && session.name || null, grant: 'use', verb: 'use', ok: true, via: j.verdict.via, localPort: r.localPort });
    this.log(`${h.name || h.id}: network lent to ${(session && session.name) || sessionId} (socks5h://127.0.0.1:${r.localPort}, its own credentials)`);
    return { ...r, url };
  }
  /** The conversation's credentials on a machine's forward — minted once per (machine, conversation), dropped with the grant. */
  _credFor(live, sessionId) {
    if (!live.creds) live.creds = new Map(); // user → { pass, sessionId }
    if (!live.bySession) live.bySession = new Map(); // sessionId → user
    const had = live.bySession.get(sessionId);
    if (had && live.creds.has(had)) return { user: had, pass: live.creds.get(had).pass };
    const user = 's' + crypto.randomBytes(6).toString('hex'), pass = crypto.randomBytes(18).toString('hex');
    live.creds.set(user, { pass, sessionId }); live.bySession.set(sessionId, user);
    return { user, pass };
  }
  /** A conversation lost `use`: its credentials go and every connection it opened is cut. */
  _dropCred(live, sessionId) {
    const user = live.bySession?.get(sessionId);
    if (user) { live.creds.delete(user); live.bySession.delete(sessionId); }
    for (const sock of live.sockets) if (sock._exitUser && sock._exitUser === user) { try { sock.destroy(); } catch { } }
  }
  /**
   * A CONNECTION IS JUDGED LIKE A CALL (verify-r2 A3-r2). r1's port checked only that the pair existed — and a pair
   * lived until the forward stopped, so a conversation that lost `use` through a Task Group change (unbound, the
   * group deleted — no PATCH on the machine, the only place r1 re-judged) or that had DIED kept every connection it
   * could open (reproduced: `auth:0` + bytes through after both). Now: the pair (constant-time), then the
   * conversation it was minted for must be LIVE and GRANTED `use` on this machine right now; otherwise the pair is
   * dropped with its connections and the client hears `01 01`.
   */
  _credOk(hostId, user, pass) {
    const live = this._live.get(hostId);
    const c = live && live.creds && live.creds.get(user);
    if (!c || !safeEq(c.pass, pass)) return false;
    const s = this.sessionsMap().get(c.sessionId);
    if (!s || !E.exitVerdict(this.access(hostId), 'use', this.ctxFor(s, c.sessionId)).ok) {
      this.log(`exit ${hostId}: a connection with ${s ? 'a revoked' : 'a dead'} conversation's credentials refused — its pair dropped`);
      this._dropCred(live, c.sessionId); live.users.delete(c.sessionId);
      return false;
    }
    return true;
  }
  /** THE CONVERSATION IS GONE (the kill path, the exit path — verify-r2): its pairs go with their connections, a
   *  forward nobody holds any more stops. Never throws. */
  onSessionEnd(session, sessionId) {
    if (!sessionId) return;
    // verify-r2 ask-a: an ask waiting for a conversation that is gone waits for nobody — an Allow after its death
    // used to RUN the command on the machine (the captured session object still answered every key). verify-r3: THE
    // ONE re-judge, told the conversation is gone (the kill path calls this BEFORE the session leaves the map)
    return this.rejudgeAll('session-ended', { goneSessions: [sessionId] });
  }
  /** Is the conversation an ask / a run was started for still the LIVE one (verify-r2 ask-a)? The same object under
   *  the same id — a killed conversation leaves the map, and its id is never reused. */
  _stillLive(session, sessionId) { const s = this.sessionsMap().get(sessionId); return !!s && (!session || s === session); }
  async _forward(h) {
    const existing = this._live.get(h.id);
    if (existing && existing.server.listening) return { machine: h.name || h.id, hostId: h.id, localPort: existing.localPort, url: `socks5h://127.0.0.1:${existing.localPort}` };
    const dm = await this.hosts.deviceBounded(h.id, 8000); // throws if offline
    const { port: socksPort } = await dm.serveSocks();
    const sockets = new Set();
    const server = net.createServer({ allowHalfOpen: true }, async (sock) => {
      sockets.add(sock);
      sock.on('close', () => sockets.delete(sock));
      sock.on('error', () => { try { sock.destroy(); } catch {} });
      // SOCKS5 username/password FIRST (RFC 1929) — the credentials `use` minted for THIS conversation; anything
      // else (no auth offered, an unknown user, a wrong password) is refused before the machine is touched
      let user;
      try { user = await socksAuth(sock, (u, p) => this._credOk(h.id, u, p)); }
      catch { try { sock.destroy(); } catch {} return; }
      sock._exitUser = user;
      let ch;
      try {
        // resolve the device PER CONNECTION (a dial re-dial stop()s the old DeviceManager — port-forward's lesson)
        const d = await this.hosts.deviceBounded(h.id, 8000);
        ch = await d.tcpForward(socksPort);
      } catch { try { sock.destroy(); } catch {} return; }
      if (sock.destroyed) { try { ch.close(); } catch {} return; }
      // greet the device's SOCKS (no-auth on its own loopback) on the client's behalf, then pipe
      let greeted = false, pend = [];
      ch.onData = (b) => {
        if (!greeted) { greeted = true; for (const q of pend) { try { ch.write(q); } catch {} } pend = []; return; } // its `05 00`
        try { sock.write(b); } catch {}
      };
      ch.onClose = () => { try { sock.end(); } catch {} };
      sock.on('data', (b) => { if (!greeted) pend.push(b); else { try { ch.write(b); } catch {} } });
      sock.on('close', () => { try { ch.close(); } catch {} });
      sock.resume();
      try { ch.write(Buffer.from([0x05, 0x01, 0x00])); } catch {}
    });
    const localPort = await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
    this._live.set(h.id, { server, sockets, localPort, deviceSocksPort: socksPort, users: new Set(), creds: new Map(), bySession: new Map() });
    this.log(`exit ${h.name || h.id}: socks5h://127.0.0.1:${localPort} → device SOCKS ${socksPort} (per-conversation credentials)`);
    return { machine: h.name || h.id, hostId: h.id, localPort, url: `socks5h://127.0.0.1:${localPort}` };
  }

  /**
   * vibespace-exit run: judge → (ask and WAIT, then judge AGAIN) → run ON the machine (≤ 30 s) → record: the
   * machine row's lastRun, an audit line, a card in the calling chat. → `{machine, code, stdout, stderr, ms,
   * timedOut, asked}` | throws a named error whose message is the agent-facing sentence.
   */
  async run(session, sessionId, ref, cmd, { signal = null } = {}) {
    if (typeof cmd !== 'string' || !cmd.trim() || E.cmdBytes(cmd) > E.CMD_MAX) throw namedError('bad_command', E.refusalText('bad_command'));
    // verify-r5 X2: a command whose DISPLAY order differs from what runs (bidi controls) is never asked about, run or shown
    const hidden = E.hiddenOrderOf(cmd);
    if (hidden.length) throw namedError('bad_command', E.refusalText('bad_command', { hidden }), { hidden });
    const j = this._judge(session, sessionId, ref, 'run');
    if (j.refusal) throw this._refused(session, sessionId, { code: j.refusal.code, grant: 'run', cmd, error: j.refusal.error });
    const h = j.h, machine = h.name || h.id;
    const card = (rec) => this._card(session, machine, rec);
    if (!j.verdict.ok) {
      if (j.verdict.code === 'not_granted') card({ outcome: 'not_granted', cmd });
      throw this._refused(session, sessionId, { code: j.verdict.code, grant: 'run', h, has: j.has, cmd });
    }
    if (h.transport === 'dial' && !h.online) { card({ outcome: 'offline', cmd }); throw this._refused(session, sessionId, { code: 'offline', grant: 'run', h, cmd }); }
    let asked = false;
    if (j.access.run.ask) {
      asked = true;
      const answer = await this._ask(session, sessionId, h, cmd, { signal }); // resolves 'allowed' | 'denied' | 'expired' | 'revoked' | 'gone' | refusal
      if (answer && answer.refusal) { if (answer.refusal === 'ask_unfiled') card({ outcome: 'unfiled', cmd }); throw this._refused(session, sessionId, { code: answer.refusal, grant: 'run', h, cmd, error: answer.error || '' }); }
      if (answer === 'gone') throw this._refused(session, sessionId, { code: 'conversation_gone', grant: 'run', h, cmd }); // nobody is waiting: no card, no run
      if (answer === 'denied') { card({ outcome: 'denied', cmd }); throw this._refused(session, sessionId, { code: 'ask_denied', grant: 'run', h, cmd }); }
      if (answer === 'changed') { card({ outcome: 'changed', cmd }); throw this._refused(session, sessionId, { code: 'ask_changed', grant: 'run', h, cmd }); } // verify-r6 W1
      if (answer === 'expired') { card({ outcome: 'expired', cmd }); throw this._refused(session, sessionId, { code: 'ask_expired', grant: 'run', h, cmd }); }
      if (answer === 'revoked') { card({ outcome: 'not_granted', cmd }); throw this._refused(session, sessionId, { code: 'not_granted', grant: 'run', h, has: j.has, cmd }); }
    }
    // stillGranted: the verdict AGAIN after the await (a revoke during the wait refuses and the answer is not spent)
    // — and the CALLER again (verify-r2 ask-a): a conversation that died while its ask waited is nobody to run for
    if (!this._stillLive(session, sessionId)) throw this._refused(session, sessionId, { code: 'conversation_gone', grant: 'run', h, cmd });
    const again = E.exitVerdict(this.access(h.id), 'run', this.ctxFor(session, sessionId));
    if (!again.ok) { card({ outcome: 'not_granted', cmd }); throw this._refused(session, sessionId, { code: again.code, grant: 'run', h, has: j.has, cmd }); }
    const t0 = this.now();
    let r, interpreter = XS.POSIX_SHELL, platform = null, outdated = null;
    try {
      const dm = await this.hosts.deviceBounded(h.id, 8000);
      // lane-exit-run-output E1: THE SHELL IS THE DEVICE'S FACT. A daemon that advertises `run-shell` is handed the LINE
      // and picks its own interpreter (cmd.exe on Windows, sh elsewhere — PURE src/exit-shell.js, run where it lives);
      // an older daemon is never asked an op it lacks (the three-touch rule): it gets the `sh -lc` form it always ran,
      // and the reply + the audit say which. The owner's four commands on a Windows box were `sh -lc` chosen HERE.
      const info = this._daemonInfo(dm);
      const caps = Array.isArray(info.capabilities) ? info.capabilities : [];
      platform = typeof info.platform === 'string' ? info.platform.replace(/[^a-z0-9]/gi, '').slice(0, 16) || null : null; // verify r1 F5a: a daemon's word, bounded to a platform name's shape
      const useShell = caps.includes(XS.RUN_SHELL_CAP);
      const opts = { timeoutMs: E.EXIT_RUN_TIMEOUT_MS, waitMs: E.EXIT_RUN_TIMEOUT_MS + 10000 };
      // lane device-upgrade-stuck: a Windows agent WITHOUT run-shell can run no line (no `sh` there) — the hub KNOWS it from
      // the hello and refuses by name below; pre-fix it sent `sh -lc` anyway and the card read "exit 1 · 0.0 s · no output"
      if (!XS.canRunLine(platform, caps)) outdated = { agentVersion: E.agentVersionOf(info.daemonVersion) };
      else {
        r = useShell ? await dm.runShell(cmd, opts) : await dm.runCmd(XS.POSIX_SHELL, ['-lc', cmd], opts);
        // verify r1 F5a: the reply's `interpreter` is read through the CLOSED set — a daemon's raw string (`<system-reminder`,
        // an RLO) reached the agent's sentence, the card, the audit and the history as itself; off the set ⇒ what the hub asked for
        interpreter = XS.knownInterpreter(r && r.interpreter) || (useShell ? XS.interpreterOf(platform) : XS.POSIX_SHELL);
      }
    } catch (e) {
      const offline = /offline|not dialed in|unreachable|timed out connecting|ECONNREFUSED/i.test(String(e && e.message));
      const outcome = offline ? 'offline' : 'run_failed';
      card({ outcome, cmd });
      this.hosts.setLastRun?.(h.id, E.runRecord({ cmd, code: null, ms: this.now() - t0, by: { key: this.keyOf(session, sessionId), name: session && session.name || '' }, at: t0, outcome }));
      throw this._refused(session, sessionId, { code: offline ? 'offline' : 'run_failed', grant: 'run', h, cmd, error: e && e.message });
    }
    const ms = this.now() - t0;
    if (outdated) {
      const { agentVersion } = outdated, by0 = { key: this.keyOf(session, sessionId), name: (session && session.name) || '' };
      try { this.hosts.setLastRun?.(h.id, E.runRecord({ cmd, code: null, ms, by: by0, at: t0, outcome: 'agent_outdated', agentVersion })); } catch (e) { this.log(`last run not recorded: ${e.message}`); }
      this.audit({ hostId: h.id, machine, sessionId, sessionKey: by0.key, name: session && session.name || null, grant: 'run', verb: 'run', cmd, code: null, ms, ok: false, refusal: 'device_agent_outdated', ...(platform ? { platform } : {}), ...(agentVersion ? { agentVersion } : {}), via: again.via, asked });
      this.log(`${machine}: did not run "${cmd.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80)}" for ${(session && session.name) || sessionId} — agent ${agentVersion || '?'} on ${platform} has no run-shell (needs ${XS.RUN_SHELL_SINCE}+)`);
      card({ outcome: 'agent_outdated', cmd, agentVersion });
      try { this.bcastAll({ type: 'hosts-updated' }); } catch { }
      throw namedError('device_agent_outdated', E.refusalText('device_agent_outdated', { machine, cmd, agentVersion }), { grant: 'run', platform, agentVersion, needVersion: XS.RUN_SHELL_SINCE });
    }
    // a revoke DURING the daemon's run cannot stop the command (no cancel op; ≤ 30 s) — it is recorded as such
    const revokedDuringRun = !E.exitVerdict(this.access(h.id), 'run', this.ctxFor(session, sessionId)).ok;
    const by = { key: this.keyOf(session, sessionId), name: (session && session.name) || '' };
    // lane-exit-run-output E2: the child NEVER STARTED (`cmd-result.spawnError`, the daemon's judge) — distinct from a
    // non-zero exit: the row, the audit line, the card and the agent all say WHY (pre-fix: "exit 1 · 0.0 s", a guess)
    const sf = E.spawnErrorOf(r.spawnError);
    if (sf) {
      const rec = E.runRecord({ cmd, code: null, ms, by, at: t0, outcome: 'spawn_failed', spawnError: sf, interpreter });
      try { this.hosts.setLastRun?.(h.id, rec); } catch (e) { this.log(`last run not recorded: ${e.message}`); }
      this.audit({ hostId: h.id, machine, sessionId, sessionKey: by.key, name: session && session.name || null, grant: 'run', verb: 'run', cmd, code: null, ms, ok: false, refusal: 'spawn_failed', spawnError: sf, interpreter, ...(platform ? { platform } : {}), via: again.via, asked });
      this.log(`${machine}: could not start "${cmd.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80)}" for ${(session && session.name) || sessionId} — ${XS.spawnFailureText(sf, { interpreter })} (${sf.code}, ${ms} ms)`);
      card({ outcome: 'spawn_failed', cmd, spawnError: sf, interpreter, ms, exitRun: E.cardOutput({ cmd, code: null, ms, spawnError: sf, interpreter }) });
      try { this.bcastAll({ type: 'hosts-updated' }); } catch { }
      throw namedError('spawn_failed', E.refusalText('spawn_failed', { machine, cmd, spawnError: sf, interpreter, platform }), { grant: 'run', spawnError: sf, interpreter, platform, exitCode: XS.spawnExitCode(sf) });
    }
    const timedOut = r.timedOut === undefined ? null : !!r.timedOut;
    // verify-r1 A5: the code is a NUMBER here whatever an older daemon sent (node's maxBuffer overflow named a string);
    // an output the daemon cut (1 MiB / 64 KiB / its 2 MiB maxBuffer) is said — `truncated` rides the reply, the audit
    // and the CLI's line (an old daemon omits it ⇒ null: unknown, never "whole")
    const code = Number.isInteger(r.code) ? r.code : (r.code == null ? 0 : 1);
    const truncated = r.truncated === undefined ? null : !!r.truncated;
    // lane-exit-run-output E3: OUTPUT WHERE THE USER LOOKS — the first 4 KiB of each stream (URL secrets cut, THE belt:
    // text a machine wrote, toward the user and, through `vibespace-exit runs`, toward agents) on the audit line, the
    // card and the history row; a cut is said. The whole streams still ride the API back to the agent as before.
    const heads = E.outputHeads({ stdout: r.stdout, stderr: r.stderr });
    const anyCut = heads.cut.stdout || heads.cut.stderr;
    const rec = E.runRecord({ cmd, code, ms, by, at: t0, outcome: 'ran', timedOut: !!timedOut, revokedDuringRun, interpreter });
    try { this.hosts.setLastRun?.(h.id, rec); } catch (e) { this.log(`last run not recorded: ${e.message}`); }
    this.audit({ hostId: h.id, machine, sessionId, sessionKey: by.key, name: session && session.name || null, grant: 'run', verb: 'run', cmd, code, ms, ok: true, via: again.via, asked, interpreter, ...(platform ? { platform } : {}), ...(timedOut ? { timedOut: true } : {}), ...(truncated ? { truncated: true } : {}), ...(revokedDuringRun ? { 'revoked-during-run': true } : {}), stdout: heads.stdout, stderr: heads.stderr, ...(anyCut ? { cut: heads.cut } : {}) });
    this.log(`${machine}: ran "${cmd.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80)}" for ${(session && session.name) || sessionId} — ${timedOut ? 'timed out' : 'exit ' + code}, ${ms} ms (${interpreter})`);
    card({ outcome: 'ran', cmd, code, ms, timedOut: !!timedOut, revokedDuringRun, exitRun: E.cardOutput({ cmd, code, ms, timedOut: !!timedOut, truncated: !!truncated, interpreter, heads }) });
    try { this.bcastAll({ type: 'hosts-updated' }); } catch { }
    return { machine, code, stdout: String(r.stdout || ''), stderr: String(r.stderr || ''), ms, timedOut, truncated, asked, revokedDuringRun, interpreter, platform, line: E.cliLine({ outcome: 'ran', code, ms, timedOut: !!timedOut, truncated: !!truncated }, { machine }) };
  }
  /** The display-only card in the calling chat; `rec.exitRun` (E.cardOutput) rides beside the words so the renderer
   *  draws the exit line + the first lines of output + "Show output" — never a second card, never re-created. */
  _card(session, machine, rec) {
    if (!this.emitCard || !session) return false;
    try { return !!this.emitCard(session, { fromName: `Machines · ${machine}`, kind: 'notification', text: E.cardText(rec, { machine }), ...(rec && rec.exitRun ? { exitRun: rec.exitRun } : {}) }); }
    catch (e) { this.log(`card not shown: ${e.message}`); return false; }
  }

  // ── "ask me each time" ────────────────────────────────────────────────────
  _ask(session, sessionId, h, cmd, { signal = null } = {}) {
    const sessionKey = this.keyOf(session, sessionId);
    for (const k of this._asks.values()) if (k.sessionKey === sessionKey && k.hostId === h.id) return Promise.resolve({ refusal: 'ask_pending' });
    const askId = crypto.randomBytes(16).toString('hex');
    const machine = h.name || h.id;
    const name = (session && (session.name || session.webuiName)) || sessionId;
    const askedAt = this.now();
    return new Promise((resolve) => {
      const k = { askId, hostId: h.id, machine, sessionKey, sessionId, name, cmd, askedAt, resolve, todoId: null, timer: null };
      this._asks.set(askId, k);
      if (this.userTodos) {
        try {
          const text = `Allow "${String(name).slice(0, 80)}" to run a command on ${machine}?`;
          const it = this.userTodos.add(sessionKey, {
            text, detail: cmd, // the WHOLE command (the store caps a detail at 8 000); the row words the rest itself
            urgency: 'high', kind: 'action', by: 'agent', origin: 'machines', sessionName: String(name).slice(0, 120),
            expiresAt: askedAt + E.ASK_TTL_MS,
            action: { type: 'exit-run-ask', askId, hostId: h.id, machine, cmd: cmd.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120) },
            i18n: { text: { key: ASK_KEY, params: { name: String(name).slice(0, 80), machine } } },
          });
          k.todoId = it && it.id;
        } catch (e) {
          // the store refused (the conversation's 20 open items): an ask nobody can see must not wait 60 s — refused NOW
          this.log(`ask not filed in For you: ${e.message}`);
          this._asks.delete(askId);
          this.audit({ hostId: h.id, machine, sessionId, sessionKey, name, grant: 'run', verb: 'ask-opened', cmd, ok: false, refusal: 'ask_unfiled', askId });
          resolve({ refusal: 'ask_unfiled', error: e.message });
          return;
        }
      }
      this.audit({ hostId: h.id, machine, sessionId, sessionKey, name, grant: 'run', verb: 'ask-opened', cmd, ok: true, askId });
      this.log(`${machine}: ${name} asks to run "${cmd.slice(0, 80)}" — waiting for the user (≤ 60 s)`);
      k.timer = this.timers.set(() => this._settleAsk(k, 'expired', 'timeout'), E.ASK_TTL_MS);
      k.timer?.unref?.();
      // verify-r2 ask-a: the CLI's call gave up (the process ended, its own timeout, the conversation killed) — the
      // answer would reach nobody; the ask settles and the item says so (the route hands the response's close in)
      if (signal && typeof signal.addEventListener === 'function') {
        if (signal.aborted) this._settleAsk(k, 'denied', 'caller-gone');
        else signal.addEventListener('abort', () => this._settleAsk(k, 'denied', 'caller-gone'), { once: true });
      }
    });
  }
  _settleAsk(k, outcome, why) {
    if (!this._asks.has(k.askId)) return false;
    this._asks.delete(k.askId);
    this._settled.set(k.askId, outcome === 'expired' ? 'expired' : 'settled');
    while (this._settled.size > 256) this._settled.delete(this._settled.keys().next().value);
    try { this.timers.clear(k.timer); } catch { }
    if (k.todoId && this.userTodos) {
      // resolved BY its outcome (the row words it: allowed / denied / access removed / expired (no answer in 60 s))
      try { const it = this.userTodos.get?.(k.todoId); if (it && it.status === 'open') this.userTodos.setStatus(k.todoId, 'done', why === 'revoked' ? 'revoked' : (why === 'conversation-gone' || why === 'caller-gone') ? 'conversation-gone' : outcome === 'expired' ? 'ask-expired' : outcome === 'changed' ? 'ask-changed' : outcome); } catch { }
    }
    this.audit({ hostId: k.hostId, machine: k.machine, sessionId: k.sessionId, sessionKey: k.sessionKey, name: k.name, grant: 'run', verb: outcome === 'expired' ? 'ask-expired' : 'ask-answered', cmd: k.cmd, ok: outcome === 'allowed', answer: outcome, why, askId: k.askId });
    try { k.resolve(why === 'revoked' ? 'revoked' : (why === 'conversation-gone' || why === 'caller-gone') ? 'gone' : outcome); } catch { }
    return true;
  }
  /** POST /api/exits/asks/:askId — a PERSON's answer (cookie only; the route refuses a bearer before this). */
  answerAsk(askId, { answer, by }) {
    if (by !== 'user') throw namedError('human_only', 'only the user answers this — an agent cannot approve its own command');
    const k = this._asks.get(String(askId || ''));
    if (!k) {
      // answered before ⇒ 409 ask_settled; refused after 60 s ⇒ 410 ask_expired; never heard of (a guessed id, or one
      // from before a restart) ⇒ 404 ask_unknown
      const was = this._settled.get(String(askId || ''));
      if (was === 'settled') throw namedError('ask_settled', 'already answered');
      if (was === 'expired') throw namedError('ask_expired', 'too late — it was refused after 60 s');
      throw namedError('ask_unknown', 'that request is gone');
    }
    const v = E.answerVerdict({ askedAt: k.askedAt }, { answer, by, now: this.now() });
    if (!v.ok) {
      if (v.code === 'ask_expired') this._settleAsk(k, 'expired', 'timeout');
      throw namedError(v.code, v.error || v.code);
    }
    // verify-r5 X1 (the belt): an ALLOW is for the command the user was SHOWN — the item must still be this ask's own,
    // open, and carry the command verbatim as its detail (what the row and the window display). Any door that changed
    // it (a merge, a re-file, an edit) ⇒ refused, nothing runs, the ask settles as not allowed
    if (v.state === 'allowed' && k.todoId && this.userTodos && typeof this.userTodos.get === 'function') {
      let it = null; try { it = this.userTodos.get(k.todoId); } catch { }
      const shown = !!(it && it.status === 'open' && it.action && it.action.type === 'exit-run-ask' && it.action.askId === k.askId && String(it.detail || '') === String(k.cmd).trim());
      // verify-r6 W1: settled as CHANGED, never "denied" — the chat card said "you denied it" and the CLI "the user did not
      // allow" while the user had pressed Allow on a request that changed under it
      if (!shown) { this._settleAsk(k, 'changed', 'item-changed'); throw namedError('ask_changed', 'the request changed after it was shown — nothing ran; the agent can ask again'); }
    }
    // verify-r2 ask-a: the conversation that asked is gone (the session-end hook missed it, or a race with it) —
    // an Allow for a conversation that no longer exists runs nothing; the item resolves by name
    if (!this._stillLive(null, k.sessionId)) { this._settleAsk(k, 'denied', 'conversation-gone'); throw namedError('conversation_gone', 'the conversation that asked has ended — nothing to run it for'); }
    this._settleAsk(k, v.state, 'answered');
    return { ok: true, state: v.state };
  }
  listAsks() {
    return [...this._asks.values()].map((k) => ({ askId: k.askId, hostId: k.hostId, machine: k.machine, sessionId: k.sessionId, name: k.name, cmd: k.cmd.slice(0, 120), askedAt: k.askedAt, expiresAt: k.askedAt + E.ASK_TTL_MS }));
  }
  /** Boot: an ask item a previous process filed can never be answered (its waiting call died with it) — resolved
   *  `expired` (helper-asks' reconcile precedent). → how many. */
  reconcileAsks() {
    if (!this.userTodos) return 0;
    let n = 0;
    try {
      const snap = this.userTodos.snapshot?.() || {};
      for (const it of snap.open || []) {
        if (it && it.action && it.action.type === 'exit-run-ask' && !this._asks.has(it.action.askId)) { try { this.userTodos.setStatus(it.id, 'done', 'ask-expired'); n++; } catch { } }
      }
    } catch (e) { this.log(`ask reconcile failed: ${e.message}`); }
    return n;
  }

  /** Tear down a machine's exit forward (best-effort remote SOCKS stop). */
  async stop(hostId) {
    const l = this._live.get(hostId);
    if (!l) return;
    for (const s of l.sockets) { try { s.destroy(); } catch {} }
    try { l.server.close(); } catch {}
    this._live.delete(hostId);
    try { const dm = await this.hosts.deviceBounded(hostId); await dm.unserveSocks(l.deviceSocksPort); } catch {}
  }

  /** A machine was unpaired — drop its forward and settle its waiting asks: THE ONE re-judge, told the machine is gone
   *  (the routes call this BEFORE its record is removed; the removal's own hosts.onReachChange re-judges again). */
  onMachineUnpaired(hostId) {
    if (!hostId) return;
    return this.rejudgeAll('machine-unpaired', { goneHosts: [hostId] });
  }
}

module.exports = { ExitProxyManager, AUDIT_FILE, AUDIT_MAX_BYTES };
