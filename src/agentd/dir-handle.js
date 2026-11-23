'use strict';
// THE FOLDER FIELD COLLECTOR'S HANDLE ON A PAIRED MACHINE (the agent's half — src/agentd/agentd.js hands it the collector's own pool).
// THE LAWS it keeps, in their numbers:
//  · r2752 — A LISTING NEVER COSTS A PERSON THEIR FILES ON THAT MACHINE: the reads ride the collector's OWN pool (one worker, no
//    replacement while a stuck read is out — agentd.js), never the person's; ONE read out at a time: a read asked while another is out
//    WAITS ITS TURN HERE — never in a worker and never on the pool's clock (its deadline starts when it is sent). The line's stats (a
//    bare `pathStat`) go to the FRONT of the turn (still one read out): the verdict never waits behind a listing, a walk or a fact.
//    A read whose turn comes after every ask on this machine has ENDED is not sent when it answers only that ask (a bare stat, a
//    listing — refused as busy, nobody waits for it); the kids' facts and the index walk still go (kept here for the next ask: the
//    page's quiet re-ask joins them).
//  · r2974 — A MACHINE's LISTING IS NEVER WORSE THAN THE RELEASE's: the handle SAYS whether it can serve (`state({ boundMs })`): no
//    usable worker (its one thread left in the kernel, ended at its deadline, or respawning) — `gone`; its one read out longer than
//    THIS ask's budget (the reply could not come in time) — `held`. The agent then refuses the ask BY NAME (`collector-stuck`, with the
//    state) and the hub serves it by the release's road (a child a call, touching neither pool) — a `gone` machine stays on that road
//    until it says it has a live worker again. One thread stuck for good stays the bound.
// node builtins only (the device bundle carries it).
const STUCK_MS = 2000;   // an ask with no budget of its own: a read out longer than this has outlived any reply's (the agent clamps a plan's budget to 2 s)

const busyErr = () => Object.assign(new Error('the folder field\'s read was not sent: nobody asks for it any more'), { code: 'no-idle-worker' });

/** createDirHandle({ poolOf, hung, callMs, stuckMs, now }) — poolOf(): the collector's own worker pool (lazy); hung: its
 *  dc.hungMemory (B-23e5's law); callMs: a read's deadline in its worker. → { call(op, payload), turn(send, kind), state(), begin(),
 *  end(), stats() } */
function createDirHandle({ poolOf, hung, callMs = 15000, stuckMs = STUCK_MS, now = () => performance.now() }) {
  const q = [];               // { send, front, bounded, resolve, reject } — the reads waiting their turn
  let out = null;             // { at } while ONE read is out
  let asking = 0;             // the asks on this machine still running (begin / end)
  const counts = { sent: 0, notSent: 0, front: 0 };
  const next = () => {
    if (out) return;
    while (q.length) {
      const e = q.shift();
      if (e.bounded && asking === 0) { counts.notSent++; e.reject(busyErr()); continue; }   // its asker ended: nobody waits for it
      out = { at: now() }; counts.sent++;
      Promise.resolve().then(e.send).then(e.resolve, e.reject).finally(() => { out = null; next(); });
      return;
    }
  };
  /** one read in its turn: `front` = a line's stat (ahead of every other waiting read), `bounded` = it answers only its ask */
  function turn(send, { front = false, bounded = false } = {}) {
    return new Promise((resolve, reject) => {
      const e = { send, front, bounded, resolve, reject };
      if (front) { const i = q.findIndex((x) => !x.front); if (i < 0) q.push(e); else q.splice(i, 0, e); counts.front++; } else q.push(e);
      next();
    });
  }
  /** the collector's door (src/dir-collect.js `call`): in its turn, IDLE-ONLY, on the collector's OWN pool */
  function call(op, payload) {
    const p = payload || {};
    const bare = op === 'pathStat' && !p.facts;
    return turn(async () => {
      const pool = poolOf();
      if (!pool || !pool.alive()) throw Object.assign(new Error('no folder-field worker of this agent is running'), { code: 'no-worker' });
      const refused = hung.refusal(op, p); if (refused) throw refused;   // a dead path is never sent to a fresh worker (judged at its turn)
      let r;
      try { r = await pool.run(op, { ...p, dirOp: true }, callMs, { idleOnly: true }); } catch (e) {
        if (e && /^fs deadline \(/.test(String(e.message))) { e.safeFsTimeout = true; hung.deadline(op, p); }   // the pool's deadline ended it: its folder's mark, and the pool's memory of it
        else if (e && !e.code && /^(worker died|no workers)$/.test(String(e.message))) e.code = 'no-worker';   // no answer, no mark: asked again
        throw e;
      }
      hung.landed(op, p);   // it answered: forgotten
      if (r.error) throw Object.assign(new Error(r.error), { code: r.code });
      return r.result;
    }, { front: bare, bounded: bare || op === 'dirSlice' });
  }
  /** can the collector serve an ask whose budget is `boundMs` now? → { live: true } | { live: false, why: 'gone' | 'held', ms? } */
  function state({ boundMs = stuckMs } = {}) {
    const pool = poolOf();
    if (!pool || !pool.alive()) return { live: false, why: 'gone' };
    const st = pool.stats();
    const unusable = Math.max(0, (st.stuck || 0) - (st.wedged || 0) - (out ? 1 : 0));   // live threads held by no read of the turn (terminated at a deadline)
    if ((st.live || 0) - unusable <= 0) return { live: false, why: 'gone' };
    if (out && now() - out.at > (Number(boundMs) > 0 ? Number(boundMs) : stuckMs)) return { live: false, why: 'held', ms: Math.round(now() - out.at) };
    return { live: true };
  }
  return { call, turn, state, begin: () => { asking++; }, end: () => { asking = Math.max(0, asking - 1); }, stats: () => ({ ...counts, waiting: q.length, out: !!out, asking }) };
}

module.exports = { createDirHandle, STUCK_MS };
