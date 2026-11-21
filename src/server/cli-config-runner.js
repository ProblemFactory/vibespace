'use strict';
// THE HUB'S OWN MACHINE THROUGH THE SHIPPED HELPER (row B-ddf3 unit 2, line 1, lane bl-scratch, the coordinator's r1404 /
// r1407). The CLI's own config files on this machine (~/.claude/settings.json's hooks and managed keys, ~/.codex/hooks.json,
// ~/.codex/config.toml) were written IN-PROCESS by two synchronous writers on the hub's loop (harness-config-sync
// applyConfigPlan, agent-tool-generators ensureAgentHooks): on a home that stalls, the hub frozen at its start. Now ONE
// implementation serves every machine: the shipped helper (data/bin/vibespace-hook-register.mjs, the same file a paired
// machine runs) is started for THIS machine through THE STARTER (src/server/child-starter.js: a direct start forks the whole
// hub), with the plan in VIBESPACE_CLI_CONFIG, and its CFG| receipt lines are read as for any machine (parseReceiptLines).
// THE LAWS (r1407):
//   · ONE RUN IN FLIGHT, THE REQUESTS WAITING IN THE ORDER ASKED: two helpers never write one file at once. A request NEVER
//     replaces one of another KIND (the full round w4utz2bqb's must, r1518): a removal of our hook rows ('strip'), an apply that
//     registers them ('apply+hooks') and an apply of the managed keys alone ('apply') are different operations — each kind
//     asked RUNS, in the order asked, and a caller is told «landed» only by a run of ITS OWN kind. A request joins only the LAST
//     waiting one, and only when it is of the same kind (two saves in quick succession: one run, the newest plan winning — the
//     plan is read when the run starts).
//   · NO SECOND WRITER: the starter down, slow or not up yet — the request waits for it within its bound and FAILS BY NAME
//     («the starter did not answer»); the release's in-process road is never a silent fallback. A failed landing is asked
//     again at the next request.
//   · A LANDING IS SAID: `landedWithin(ms)` answers { landed } / { late } / { failed, why } for the spawn gate (a conversation
//     is never refused for a late apply: it starts, and says once what may be missing); `last()` the newest landing.
//   · «CREATED» is read off the loop: each plan file's existence before and after the run (fs.promises), since the helper
//     prints key receipts only.
//   · THE ENV (f): the starter's own service env + the names this site sets (VIBESPACE_CLI_CONFIG, HOME): no secret shape,
//     nothing on argv but the helper's path and its flag.
const fsp = require('fs').promises;
const path = require('path');
const { parseReceiptLines, decodePlan } = require('../harness-config');

const BOUND_MS = 10000;      // how long a start waits for a landing (r1407: «within your bound»)
const RUN_TIMEOUT_MS = 30000; // one helper run's own bound (the starter answers `unknown` past it + its guard)

function createCliConfigRunner({ starter, nodeBin = process.execPath, helperPath, home = null, journal = (l) => console.log(l), warn = (l) => console.warn(l), timeoutMs = RUN_TIMEOUT_MS, boundMs = BOUND_MS, stat = (p) => fsp.stat(p) } = {}) {
  if (!starter || typeof starter.run !== 'function') throw new Error('cli-config-runner: a starter (run) is required');
  if (!helperPath) throw new Error('cli-config-runner: the helper path is required');
  let inFlight = null;          // the run in flight: Promise<landing>
  const queue = [];             // the requests waiting, IN THE ORDER ASKED: { kind, planOf, reason, uninstall, before, resolvers }
  let last = null;              // the newest landing: { at, reason, ok, receipts, created, why }
  const watchers = new Set();   // landedWithin's waiters: (landing) => void

  const filesOf = (planB64) => { const plan = decodePlan(planB64); return plan && Array.isArray(plan.files) ? plan.files.filter((f) => Array.isArray(f.rel)).map((f) => ({ rel: f.rel.join('/'), file: path.join(home || require('os').homedir(), ...f.rel), harness: f.harness })) : []; };
  const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

  /** ONE helper run (never two at once — the queue below guarantees it). → a landing */
  async function runOnce(planB64, { reason, uninstall = false, status = false } = {}) {
    const files = status ? [] : filesOf(planB64);
    const before = await Promise.all(files.map((f) => exists(f.file)));
    const args = [helperPath, ...(uninstall ? ['--uninstall'] : []), ...(status ? ['--status'] : [])];
    const envAdd = { VIBESPACE_CLI_CONFIG: String(planB64 || ''), ...(home ? { HOME: home } : {}) };
    let r;
    try { r = await starter.run(nodeBin, args, { timeoutMs, capture: true, maxBuffer: 1024 * 1024, envAdd }); }
    catch (e) { r = { unknown: true, why: (e && e.message) || String(e) }; }
    const at = Date.now();
    const failed = (why) => ({ at, reason, ok: false, receipts: [], created: [], why });
    if (!r || r.unknown) return failed(`the starter did not answer${r && r.why ? ` (${r.why})` : ''} — nothing was written by this hub, asked again at the next change`);
    if (r.timedOut) return failed(`the helper ran past its ${timeoutMs} ms bound and was ended`);
    if (r.started === false || r.error) return failed(`the helper could not start (${r.error || 'no start'})`);
    const receipts = parseReceiptLines(r.stdout || '');
    const whole = receipts.find((x) => x.harness === null && x.state !== 'unknown');
    if (r.code !== 0) return failed(`the helper exited ${r.code}${r.stderr ? `: ${String(r.stderr).trim().split('\n').pop().slice(0, 200)}` : ''}`);
    if (whole) return { ...failed(`the helper refused the plan: ${String(whole.reason || whole.state).slice(0, 200)}`), receipts };
    const after = await Promise.all(files.map((f) => exists(f.file)));
    const created = files.filter((f, k) => !before[k] && after[k]);
    const bad = receipts.filter((x) => x.state === 'error' || x.state === 'refused');
    return { at, reason, ok: bad.length === 0, receipts, created, why: bad.length ? bad.map((x) => `${x.harness}.${x.key}: ${x.reason || x.state}`).join('; ') : null };
  }

  // the spawn gate's waiters hear the landing that leaves the queue EMPTY (this machine's config as every request asked it)
  function settle(landing) { for (const w of [...watchers]) { try { w(landing); } catch { } } return landing; }

  /** APPLY a plan on this machine → resolves at the landing of a run of ITS OWN KIND that started after this call. `planOf()` is
   *  read when the run starts (the newest settings win); `kind` names what the run does ('strip' | 'apply+hooks' | 'apply');
   *  `before()` (optional) runs at the run's start, before the helper, its answer handed back on the landing (`landing.before`). */
  function apply(planOf, reason = 'apply', { uninstall = false, kind = uninstall ? 'strip' : 'apply', before = null } = {}) {
    return new Promise((resolve) => {
      const tail = queue[queue.length - 1];
      if (tail && tail.kind === kind) { tail.planOf = planOf; tail.reason = reason; if (before) tail.before = before; tail.resolvers.push(resolve); return; }
      queue.push({ kind, planOf, reason, uninstall, before, resolvers: [resolve] });
      pump();
    });
  }
  const broke = (job, why) => ({ at: Date.now(), reason: job.reason, ok: false, receipts: [], created: [], why });
  function pump() {
    if (inFlight || !queue.length) return;
    const job = queue.shift();
    inFlight = (async () => {
      let before;
      if (typeof job.before === 'function') { try { before = await job.before(); } catch { before = undefined; } }
      let planB64 = null;
      try { planB64 = typeof job.planOf === 'function' ? job.planOf() : job.planOf; } catch { planB64 = null; }
      if (planB64 == null) return broke(job, 'the plan could not be built');
      const landing = await runOnce(planB64, { reason: job.reason, uninstall: job.uninstall });
      return before === undefined ? landing : { ...landing, before };
    })()
      .catch((e) => broke(job, `the run broke (${(e && e.message) || e}) — nothing is known to have landed`))
      .then((landing) => {
        landing.kind = job.kind;
        last = landing;
        if (landing.ok) for (const c of landing.created) journal(`[cli-config] created ~/${c.rel} (the CLI had never written one) (${job.reason})`);
        else warn(`[cli-config] not applied on this machine (${job.reason}): ${landing.why}`);
        for (const res of job.resolvers) res(landing);
        return landing;
      })
      .finally(() => { inFlight = null; if (!queue.length) settle(last); pump(); });
  }
  /** --status: the managed keys read off disk BY THE HELPER (nothing written). Never queued behind an apply's waiter list:
   *  a read beside a write is a read. */
  function status(planB64) { return runOnce(planB64, { reason: 'status', status: true }); }
  /** the spawn gate's question: has a landing (newer than `since`) come within `ms`? → { landed } | { failed, why } | { late } */
  function landedWithin(ms = boundMs, { since = 0 } = {}) {
    const idle = !inFlight && !queue.length;
    if (idle && last && last.at >= since) return Promise.resolve(last.ok ? { landed: true, landing: last } : { failed: true, why: last.why, landing: last });
    if (idle && !last) return Promise.resolve({ late: true, why: 'no apply was asked yet on this machine' });
    return new Promise((resolve) => {
      const w = (landing) => { if (!landing || landing.at < since) return; clearTimeout(t); watchers.delete(w); resolve(landing.ok ? { landed: true, landing } : { failed: true, why: landing.why, landing }); };
      const t = setTimeout(() => { watchers.delete(w); resolve({ late: true, why: `the CLI config did not land within ${ms} ms` }); }, ms);
      t.unref?.();
      watchers.add(w);
    });
  }
  return { apply, status, landedWithin, last: () => last, busy: () => !!(inFlight || queue.length), BOUND_MS: boundMs };
}

module.exports = { createCliConfigRunner, BOUND_MS, RUN_TIMEOUT_MS };
