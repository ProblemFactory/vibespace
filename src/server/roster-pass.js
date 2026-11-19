'use strict';
// ONE ROSTER PER PASS (lane roster-per-pass, 2026-11-11; the owner's hub held its main thread 85–93 % of the time: one
// list() of the owner's 358 pair groups built the WHOLE live roster — every live conversation × its Task Groups — 1 432 times,
// 280–410 ms, and announce() lists on every post / marker / create / rename). The live roster is built HERE, and every
// reader of the channels side shares it:
//   · `read()` hands out the roster: a fresh ARRAY of FROZEN entries (each entry and its `groups` frozen — no reader can
//     change another's; `reachability` is the session's own override — a string or null, a value, so freezing loses nothing). `sessionOf(cid)`
//     is the roster's index (a Map by cid, the first entry of a cid as `find` answered).
//   · THE MEMO IS NEVER THE ANSWER WHEN SOMETHING THE ROSTER READS HAS CHANGED SINCE IT WAS BUILT: every read checks the
//     FINGERPRINT — exactly the session fields the builder reads (the map's ids and order, the addressable id, the status
//     key, the name, the cwd, the initial groups, the reachability) and the Task Groups' change counter (TaskGroupManager
//     rev(): every save and notify moves it) — a few µs over the live conversations, against a build's Task-Group walk per
//     conversation. A write is seen by the very next read — before any broadcast, inside one synchronous run, in a
//     continuation queued before the write.
//   · `pass(fn)`: a synchronous pass (list, listFor, announce, noteRoster) checks ONCE at its start and reads that one
//     roster throughout — nothing inside a synchronous pass writes a session or a Task Group.
//   · ITS LIFE ENDS at the end of the synchronous run that built it (a queued microtask), and at `invalidate()` (the
//     session list's notify point, the Task Groups' change) — so a fact the fingerprint does not cover (a folder's realpath
//     the Task Groups resolve) is never older than the run that read it.
//   · A builder that throws is not kept: the throw reaches the reader exactly as before.
// `builds()` counts the builds (the drill's counting roster).

/** The live roster of the session map (moved from server.js `liveSessions`, unchanged): every addressable conversation, its
 *  Task Groups, its webui id and reachability — and the FINGERPRINT of what it reads. */
function sessionRoster({ sessions, tasks, addressableId, statusKey }) {
  const heads = () => {
    const out = [];
    for (const [id, s] of sessions()) {
      // verify r5 (channel-withdraw): a BORROWED id (a pending fork) is nobody's address — listed under its parent's id it
      // let a third session mint the pair under the parent and bill it; ONE predicate with agent-routes' _msgEndpoints
      const cid = addressableId(s);
      if (!cid) continue;
      out.push([id, s, cid]);
    }
    return out;
  };
  // B-43bc (the B-55dc residual): an entry whose Task Groups answer is STILL BEING READ (the drawing door's `unread`) says so —
  // `groupsUnread: true`, set only then (a read entry is byte-identical to before) — so the channels readers can wait for the
  // read (readUnread below) instead of judging «not a member» on it and dropping a delivery
  const build = () => heads().map(([id, s, cid]) => {
    let groups = [], unread = false;
    try { const gs = tasks().groupsForSession({ sessionKey: statusKey(s, id), cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }) || []; groups = gs.map((g) => g.id); unread = !!gs.unread; } catch { }
    return { cid, name: s.name || null, groups, webuiId: id, reachability: s._msgReachability || null, ...(unread ? { groupsUnread: true } : {}) };
  });
  /** B-43bc — THE DECIDING DOOR FOR THE ROSTER: before a channels delivery judges a member (a wake, a recall note, a reaction
   *  digest), the live conversations (`cids`, or all) whose membership facts were never read are READ — the Task Groups'
   *  bounded `membershipRead` (off the loop; a mount that does not answer passes its bound). → how many reads were waited
   *  for (0: nothing to read — the caller goes straight on). The caller invalidates the roster when one was. */
  const readUnread = async (cids = null) => {
    const want = Array.isArray(cids) ? new Set(cids.map(String)) : null;
    let tk = null; try { tk = tasks(); } catch { tk = null; }
    if (!tk || typeof tk.membershipRead !== 'function') return 0;
    const waits = [];
    for (const [id, s, cid] of heads()) {
      if (want && !want.has(String(cid))) continue;
      let p = null;
      try { p = tk.membershipRead({ sessionKey: statusKey(s, id), cwd: s.cwd, hostId: s.host || null, initialGroupId: s._initialGroupId, initialGroupIds: s._initialGroupIds }); } catch { p = null; }
      if (p) waits.push(Promise.resolve(p).catch(() => false));
    }
    if (!waits.length) return 0;
    await Promise.all(waits);
    return waits.length;
  };
  const fingerprint = () => {
    let t = 0;
    try { const tk = tasks(); t = tk && typeof tk.rev === 'function' ? tk.rev() : 0; } catch { t = 0; }
    let fp = String(t);
    for (const [id, s, cid] of heads()) {
      fp += '\n' + JSON.stringify([id, cid, statusKey(s, id), s.name || null, s.cwd == null ? null : s.cwd, s._initialGroupId == null ? null : s._initialGroupId, s._initialGroupIds || null, s._msgReachability || null]);
    }
    return fp;
  };
  return { build, fingerprint, readUnread };
}

function createRosterPass(build, { fingerprint = null } = {}) {
  let memo = null;     // { list, byCid, fp }
  let pinned = null;   // the roster of the synchronous pass in progress
  let builds = 0;
  const freeze = (e) => {
    if (!e || typeof e !== 'object') return e;
    if (Array.isArray(e.groups)) Object.freeze(e.groups);
    return Object.freeze(e);
  };
  const load = () => {
    if (pinned) return pinned;
    const fp = typeof fingerprint === 'function' ? fingerprint() : null;
    if (memo && memo.fp === fp && fp !== null) return memo;
    builds++;
    const list = build() || [];
    const mine = { list: (Array.isArray(list) ? list : []).map(freeze), byCid: null, fp };
    memo = mine;
    queueMicrotask(() => { if (memo === mine) memo = null; }); // the end of THIS synchronous run
    return mine;
  };
  const read = () => load().list.slice();
  const sessionOf = (cid) => {
    const m = load();
    if (!m.byCid) { m.byCid = new Map(); for (const s of m.list) if (s && s.cid && !m.byCid.has(s.cid)) m.byCid.set(s.cid, s); }
    return m.byCid.get(cid) || null;
  };
  /** A synchronous pass reads ONE roster: checked once at its start. Nested passes share the outer one. */
  const pass = (fn) => {
    if (pinned) return fn();
    pinned = load();
    try { return fn(); } finally { pinned = null; }
  };
  const invalidate = () => { memo = null; };
  read.sessionOf = sessionOf;
  read.pass = pass;
  return { read, sessionOf, pass, invalidate, builds: () => builds };
}

module.exports = { createRosterPass, sessionRoster };
