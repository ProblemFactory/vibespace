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
// r2109: the runner waits on the starter PAST the starter's own fault (its bound + two of its guards) with a real margin, so the
// starter's answer — or its fault — always comes first (it was about one second apart)
const STARTER_GUARD_MS = 2 * require('./child-starter.js').GUARD_MS + 10000;

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
    // r1876: EVERY LOOK UNDER THE PERSON's HOME IS BOUNDED — one that does not come back counts as «not known», said by name
    // r2109: while an earlier read of the home is still out, a look asks NOTHING (no new read): it fails at once, by name
    const look = async () => { if (homeStuck > 0) return { held: true }; const r = await bounded(() => Promise.all(files.map((f) => exists(f.file)))); return r.timedOut ? { timedOut: true } : { value: r.value }; };
    const heldWhy = (then) => `the home still has not answered an earlier read (${homeStuck} still out) — ${then}`;
    const lb = await look();
    if (!lb.value) return { at: Date.now(), reason, ok: false, receipts: [], created: [], why: lb.held ? heldWhy('the helper was not run, nothing written by this hub, asked again at the next request') : `the plan's files under the home could not be read within ${timeoutMs} ms (a home that does not answer) — the helper was not run, nothing written by this hub` };
    const before = lb.value;
    const args = [helperPath, ...(uninstall ? ['--uninstall'] : []), ...(status ? ['--status'] : [])];
    const envAdd = { VIBESPACE_CLI_CONFIG: String(planB64 || ''), ...(home ? { HOME: home } : {}) };
    // the starter's answer is bounded too (its own bound + its guard): a starter that never answers is «did not answer»
    const ran = await bounded(() => starter.run(nodeBin, args, { timeoutMs, capture: true, maxBuffer: 1024 * 1024, envAdd }), timeoutMs + STARTER_GUARD_MS, { home: false });
    const r = ran.timedOut ? { unknown: true, why: `no answer within ${timeoutMs + STARTER_GUARD_MS} ms` } : ran.error ? { unknown: true, why: said(ran.error) } : ran.value;
    const at = Date.now();
    const failed = (why) => ({ at, reason, ok: false, receipts: [], created: [], why });
    if (!r || r.unknown) return failed(`the starter did not answer${r && r.why ? ` (${r.why})` : ''} — nothing was written by this hub, asked again at the next change`);
    if (r.timedOut) return failed(`the helper ran past its ${timeoutMs} ms bound and was ended`);
    if (r.started === false || r.error) return failed(`the helper could not start (${r.error || 'no start'})`);
    const receipts = parseReceiptLines(r.stdout || '');
    const whole = receipts.find((x) => x.harness === null && x.state !== 'unknown');
    if (r.code !== 0) return failed(`the helper exited ${r.code}${r.stderr ? `: ${String(r.stderr).trim().split('\n').pop().slice(0, 200)}` : ''}`);
    if (whole) return { ...failed(`the helper refused the plan: ${String(whole.reason || whole.state).slice(0, 200)}`), receipts };
    const la = await look();
    if (!la.value) return { ...failed(la.held ? heldWhy('what landed is not known') : `the plan's files under the home could not be read within ${timeoutMs} ms after the helper ran (a home that does not answer) — what landed is not known`), receipts };
    const after = la.value;
    const created = files.filter((f, k) => !before[k] && after[k]);
    const bad = receipts.filter((x) => x.state === 'error' || x.state === 'refused');
    return { at, reason, ok: bad.length === 0, receipts, created, why: bad.length ? bad.map((x) => `${x.harness}.${x.key}: ${x.reason || x.state}`).join('; ') : null };
  }

  // the spawn gate's waiters hear the landing that leaves the queue EMPTY (this machine's config as every request asked it)
  function settle(landing) { for (const w of [...watchers]) { try { w(landing); } catch { } } return landing; }

  /** APPLY a plan on this machine → resolves at the landing of a run of ITS OWN KIND that started after this call. `planOf()` is
   *  read when the run starts (the newest settings win); `kind` names what the run does ('strip' | 'apply+hooks' | 'apply');
   *  `before()` (optional) runs at the run's start, before the helper, its answer handed back on the landing (`landing.before`);
   *  `after(landing)` (optional, r1675) runs INSIDE the job, after the helper and BEFORE the next queued request starts — a
   *  request's own check of the files reads them as ITS run left them (`landing.after`). Two requests of one kind that join
   *  share one run, so they share one `before` / `after` answer: the later caller's functions are the ones run. `when()`
   *  (optional, r1813) is asked at the job's own start: anything but true and the helper is NOT run (the landing says
   *  `skipped` — a request that was no longer wanted by its turn); a request with a `when` is its own kind (the caller names it).
   *  A JOB ENDS WITHIN ABOUT SIX BOUNDS WHATEVER THE HOME DOES (r1813 / r1876 / r2109): EVERY await inside it is bounded — the
   *  «still asked» reads, `before`, the look at the plan's files before the helper, the starter's answer (its own bound +
   *  STARTER_GUARD_MS, past the starter's own fault), the look after it, `after` — each step within the run's bound, the job
   *  within their sum, and nothing else in a job awaits; a step that does not answer is said by name. While a home read
   *  abandoned at its bound is still out, a job asks the home nothing more and fails at once, by name. */
  function apply(planOf, reason = 'apply', { uninstall = false, kind = uninstall ? 'strip' : 'apply', before = null, after = null, when = null } = {}) {
    return new Promise((resolve) => {
      const tail = queue[queue.length - 1];
      if (tail && tail.kind === kind) { tail.planOf = planOf; tail.reason = reason; if (before) tail.before = before; if (after) tail.after = after; tail.whens.push(when); tail.resolvers.push(resolve); return; }   // r1876: a joining request carries its own «still asked» read
      queue.push({ kind, planOf, reason, uninstall, before, after, whens: [when], resolvers: [resolve] });
      pump();
    });
  }
  const broke = (job, why) => ({ at: Date.now(), reason: job.reason, ok: false, receipts: [], created: [], why });
  // one step inside a job, bounded by the run's own bound → { value } | { error } | { timedOut }
  // r2109: A HOME READ ABANDONED AT ITS BOUND STAYS in the hub's file thread pool until the home answers. Each one is counted
  // (`homeStuck`) until it settles; while one is out a job asks the home nothing more — it fails at once, by name — so a hung home
  // strands one job's reads, never one job's more each turn (a full pool waits every file read of the hub)
  let homeStuck = 0;
  const bounded = (fn, ms = timeoutMs, { home = true } = {}) => new Promise((resolve) => {
    let done = false;
    const end = (r) => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
    const p = Promise.resolve().then(fn);
    const t = setTimeout(() => { if (home) { homeStuck++; const back = () => { homeStuck--; }; p.then(back, back); } end({ timedOut: true }); }, ms);
    t.unref?.();
    p.then((value) => end({ value }), (error) => end({ error }));
  });
  const said = (e) => (e && e.message) || String(e);
  function pump() {
    if (inFlight || !queue.length) return;
    const job = queue.shift();
    inFlight = (async () => {
      // «is it still asked?» — every joined request's own read (r1876); a request with no condition, or ONE read that says yes, runs
      // the job; a read that ran out of time or failed (and none said yes) is a FAILED landing with its reason, never a skip
      if (homeStuck > 0) return broke(job, `not run: the home still has not answered an earlier read (${homeStuck} still out) — nothing written by this hub, asked again at the next request`);   // r2109: no new read
      if (!job.whens.some((w) => typeof w !== 'function')) {
        const reads = await Promise.all(job.whens.map((w) => bounded(w)));
        if (!reads.some((x) => x.value === true)) {
          const bad = reads.find((x) => x.timedOut || x.error);
          if (bad) return broke(job, bad.timedOut ? `not run: whether it was still asked did not answer within ${timeoutMs} ms` : `not run: whether it was still asked could not be read (${said(bad.error)})`);
          return { at: Date.now(), reason: job.reason, ok: true, receipts: [], created: [], why: null, skipped: 'not run: no longer asked when its turn came' };
        }
      }
      let before;
      if (typeof job.before === 'function') { const b = await bounded(job.before); before = b.value; }   // a before that did not answer in the bound: the run goes on without it
      let planB64 = null;
      try { planB64 = typeof job.planOf === 'function' ? job.planOf() : job.planOf; } catch { planB64 = null; }
      if (planB64 == null) return broke(job, 'the plan could not be built');
      const ran = await runOnce(planB64, { reason: job.reason, uninstall: job.uninstall });
      const landing = before === undefined ? ran : { ...ran, before };
      if (typeof job.after === 'function') {
        const a = homeStuck > 0 ? { held: true } : await bounded(() => job.after(landing));   // r2109: no new read while one is out
        landing.after = a.held ? { error: `the check of the files was not asked: the home still has not answered an earlier read (${homeStuck} still out)` } : a.timedOut ? { error: `the check of the files did not finish within ${timeoutMs} ms (a home that does not answer)` } : a.error ? { error: `the check after the landing broke: ${said(a.error)}` } : a.value;
      }
      return landing;
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
