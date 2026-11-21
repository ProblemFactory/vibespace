'use strict';
// THE HUB'S OWN MACHINE THROUGH THE SHIPPED HELPER (row B-ddf3 unit 2, line 1, lane bl-scratch, the coordinator's r1404 /
// r1407). The CLI's own config files on this machine (~/.claude/settings.json's hooks and managed keys, ~/.codex/hooks.json,
// ~/.codex/config.toml) were written IN-PROCESS by two synchronous writers on the hub's loop (harness-config-sync
// applyConfigPlan, agent-tool-generators ensureAgentHooks): on a home that stalls, the hub frozen at its start. Now ONE
// implementation serves every machine: the shipped helper (data/bin/vibespace-hook-register.mjs, the same file a paired
// machine runs) is started for THIS machine through THE STARTER (src/server/child-starter.js: a direct start forks the whole
// hub), with the plan in VIBESPACE_CLI_CONFIG, and its CFG| receipt lines are read as for any machine (parseReceiptLines).
// THE LAWS (r1407):
//   · ONE APPLY IN FLIGHT, THE NEWEST WAITING: a request made while a run is in flight resolves at the landing of the run that
//     STARTS after it (with the plan as it stands then): two writes in quick succession land in order, the last one winning,
//     and two helpers never write one file at once.
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

function createCliConfigRunner({ starter, nodeBin = process.execPath, helperPath, home = null, journal = (l) => console.log(l), warn = (l) => console.warn(l), timeoutMs = RUN_TIMEOUT_MS, stat = (p) => fsp.stat(p) } = {}) {
  if (!starter || typeof starter.run !== 'function') throw new Error('cli-config-runner: a starter (run) is required');
  if (!helperPath) throw new Error('cli-config-runner: the helper path is required');
  let inFlight = null;          // the run in flight: Promise<landing>
  let waiting = null;           // { planB64, reason, uninstall, resolvers: [] } — the newest request, its plan read when it starts
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

  function settle(landing) { last = landing; for (const w of [...watchers]) { try { w(landing); } catch { } } return landing; }

  /** APPLY the plan on this machine: resolves at the landing of a run that STARTED after this call. `planOf()` is read when the
   *  run starts (the newest settings win). */
  function apply(planOf, reason = 'apply', { uninstall = false } = {}) {
    return new Promise((resolve) => {
      if (waiting) { waiting.planOf = planOf; waiting.reason = reason; waiting.uninstall = uninstall; waiting.resolvers.push(resolve); return; }
      waiting = { planOf, reason, uninstall, resolvers: [resolve] };
      pump();
    });
  }
  function pump() {
    if (inFlight || !waiting) return;
    const job = waiting; waiting = null;
    let planB64 = null;
    try { planB64 = typeof job.planOf === 'function' ? job.planOf() : job.planOf; } catch (e) { planB64 = null; }
    inFlight = (planB64 == null
      ? Promise.resolve({ at: Date.now(), reason: job.reason, ok: false, receipts: [], created: [], why: 'the plan could not be built' })
      : runOnce(planB64, { reason: job.reason, uninstall: job.uninstall }))
      .then((landing) => {
        settle(landing);
        if (landing.ok) for (const c of landing.created) journal(`[cli-config] created ~/${c.rel} (the CLI had never written one) (${job.reason})`);
        else warn(`[cli-config] not applied on this machine (${job.reason}): ${landing.why}`);
        for (const res of job.resolvers) res(landing);
        return landing;
      })
      .finally(() => { inFlight = null; pump(); });
  }
  /** --status: the managed keys read off disk BY THE HELPER (nothing written). Never queued behind an apply's waiter list:
   *  a read beside a write is a read. */
  function status(planB64) { return runOnce(planB64, { reason: 'status', status: true }); }
  /** the spawn gate's question: has a landing (newer than `since`) come within `ms`? → { landed } | { failed, why } | { late } */
  function landedWithin(ms = BOUND_MS, { since = 0 } = {}) {
    const now = () => (last && last.at >= since ? last : null);
    const done = now();
    if (done && !inFlight && !waiting) return Promise.resolve(done.ok ? { landed: true, landing: done } : { failed: true, why: done.why, landing: done });
    if (!inFlight && !waiting && !last) return Promise.resolve({ late: true, why: 'no apply was asked yet on this machine' });
    return new Promise((resolve) => {
      const w = (landing) => { if (landing.at < since) return; clearTimeout(t); watchers.delete(w); resolve(landing.ok ? { landed: true, landing } : { failed: true, why: landing.why, landing }); };
      const t = setTimeout(() => { watchers.delete(w); resolve({ late: true, why: `the CLI config did not land within ${ms} ms` }); }, ms);
      t.unref?.();
      watchers.add(w);
    });
  }
  return { apply, status, landedWithin, last: () => last, busy: () => !!(inFlight || waiting), BOUND_MS };
}

module.exports = { createCliConfigRunner, BOUND_MS, RUN_TIMEOUT_MS };
