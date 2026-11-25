'use strict';
// HARNESS SETTINGS — THE ORCH HALF (docs/design-harness-settings.zh.md §5/§6,
// 2026-09-20). One factory, created by server.js beside serverSetting():
//   harnessSetting(id, key)      typed read (the row's default applies; an
//                                undeclared key THROWS — a decision point that
//                                asks a harness for a knob it never declared is
//                                a bug, not a false)
//   harnessDeclares(id, key)     "does this harness have that row" — the
//                                cross-harness decision points ask this first
//   harnessSpawnSettings(id)     every spawn row → ONE bag for buildSessionArgs
//   cliConfigPlan()              THE plan (§6): one object every machine
//                                applies with the SHARED applier
//   syncCliConfig({reason})      apply it on THIS machine (device #0) — in
//                                process, through the CAS writers; guarded by
//                                THE ROOT VERDICT (src/server-root.js via the
//                                server's ownerWriteRefusal/refuseOwnerWrite):
//                                a git worktree, a temp root or the skip belt
//                                never writes the owner's CLI config — the
//                                2026-07-21 + 2026-10-01 incident class
//   cliConfigStatus()            → Promise: fresh receipts (D2: every probe
//                                re-reads the target file — by the SHIPPED
//                                helper's own --status run, never on the
//                                hub's loop: r3462) or, past its bound, each
//                                key «not known now» by name; the last local
//                                write is kept in memory only, never persisted
//   onSettingsWrite(next, prev)  the diff hook: any cli-config key changed ⇒
//                                sync; any spawn row with a `live` verb changed
//                                ⇒ the verb is written to every running chat
//                                session of that harness whose adapter has it
//                                (the disableModelFallback loop generalised by
//                                adapter CAPABILITY, never by backend id)
// Literal harness ids are FORBIDDEN in this tier (test-architecture's census):
// every id here arrives from a session, an account or the registry.
const { HARNESS_SETTINGS, settingPath, rowOf, rowsOfKind, coerce, readRow, refusedValue, buildConfigPlan } = require('../harness-settings');
const { encodePlan } = require('../harness-config');   // B-ddf3 unit 2 line 1: no applier here — this machine is written by the shipped helper
const STATUS_MS = 3000;   // r3462: how long a route waits for the helper's read of this machine's files (a page's look at its status)
const STATUS_FRESH_MS = 60000;    // r3462: a read this young answers a caller whose own wait ran out (a short bound refuses no one)
const STATUS_BACKOFF_MS = 60000;  // r3462: after a read the helper did not finish within the run's bound (or a starter that is down), no new read for this long
const STATUS_LATE_SEE_MS = 1000;   // r4014: a late status child's /proc entry answers within this, or its end is not seen at that look
const STATUS_LATE_LET_GO_MS = 10 * 60000;   // r4014: a late child whose end CANNOT be seen (no pid, no /proc, no answer) is let go past this, said once
const STATUS_LATE_LET_GO_MAX_MS = 24 * 3600000;   // r4030: each further let-go of ONE spell waits twice as long as the last (10, 20, 40 min …), never past a day
const SFW = require('../settings-file-words.js'); // B-8dcf item two (PURE): loaded with the module, never on a push's pass (batch 21's cure)

/** Descriptor facts → plan specs for buildConfigPlan (ONE spelling: the
 *  server's plan AND the helper's embedded hooks-only DEFAULT_PLAN come from
 *  here). `valueOf(path)` reads a persisted value; `hooksOnly` drops every
 *  managed key. Which file is ALSO the hook file is decided by IDENTITY
 *  (`inject.hookFile === configFiles.<id>`), never by a second spelling. */
function configPlanSpecs(harnessList, { valueOf = () => undefined, hooksOnly = false } = {}) {
  const specs = [];
  for (const h of harnessList) {
    if (!h.settings) continue;
    const files = {};
    for (const [id, spec] of Object.entries(h.configFiles || {})) {
      files[id] = { createIfMissing: spec.createIfMissing };   // the descriptor's create rule as declared (false | 'dir-exists')
      if (h.inject && h.inject.hookFile === spec && Array.isArray(h.inject.hookEvents)) files[id].hooks = { events: h.inject.hookEvents };
    }
    const values = {};
    if (!hooksOnly) for (const row of rowsOfKind(h.settings, 'cli-config')) values[row.key] = valueOf(settingPath(h.settings.prefix, row.key));
    specs.push({ harness: h.id, table: hooksOnly ? { ...h.settings, rows: [] } : h.settings, files, values });
  }
  return specs;
}

/** THE TYPED ACCESSORS over a settings reader + the registry — ONE factory,
 *  used by create() below AND as the pool engine's default when server.js's
 *  instance is not injected (a suite that builds the engine with only a
 *  `serverSetting` stub must still reach the declared rows — the reset-credit
 *  path is one of the four money sites test-spend-paths drives). */
function accessorsFor({ serverSetting, harnesses }) {
  const tableOf = (id) => { const h = harnesses.get(id); return h.settings || null; };
  function harnessDeclares(id, key) {
    try { return !!rowOf(tableOf(id), key); } catch { return false; }
  }
  function harnessSetting(id, key) {
    const h = harnesses.get(id);
    const row = rowOf(h.settings, key);
    if (!row) throw new Error(`harness '${id}' declares no setting '${key}'`);
    return readRow(h.settings, row, serverSetting);   // coerce over the stored value; a row with no value that declares `unsetFollows` reads the followed answer
  }
  /** Every spawn row's typed value, keyed by row key — the `settings` field of
   *  buildSessionArgs. Rows with `via` are ALSO here (harmless; the adapter
   *  reads the explicit field ws-create resolves through the resume ladder). */
  function harnessSpawnSettings(id) {
    const out = {};
    let table = null;
    try { table = tableOf(id); } catch { return out; }
    for (const row of rowsOfKind(table, 'spawn')) out[row.key] = coerce(row, serverSetting(settingPath(table.prefix, row.key)));
    return out;
  }
  return { harnessSetting, harnessDeclares, harnessSpawnSettings };
}

function create({ serverSetting, harnesses, adapterRegistry, activeSessions, hookRegistrationSafe = () => true, ownerWriteRefusal = null, refuseOwnerWrite = null, rootRecovery = null, log = console.log, warn = console.warn, home = null, helperPath = null, starter = null, hooksWanted = () => false, runner = null, statusMs = STATUS_MS, statusFreshMs = STATUS_FRESH_MS, statusBackoffMs = STATUS_BACKOFF_MS, statusLateSeeMs = STATUS_LATE_SEE_MS, statusLateLetGoMs = STATUS_LATE_LET_GO_MS, statusLateLetGoMaxMs = STATUS_LATE_LET_GO_MAX_MS, procRoot = '/proc', monoClock = null }) {
  // THE ROOT VERDICT (src/server-root.js, read by agent-tool-generators): the
  // refusal object when this server must not write the owner's CLI config.
  // Without the server's verdict (tests, tooling) an unsafe flag still refuses.
  const recoveryNow = () => (typeof rootRecovery === 'function' ? ((rootRecovery() || {}).registeredAfterError || null) : null); // verify r2 ①: the chip's "registered at HH:MM after an earlier read error"
  const refusalNow = () => (typeof ownerWriteRefusal === 'function' ? ownerWriteRefusal() : null)
    || (hookRegistrationSafe() ? null : { kind: 'unknown', why: 'this server never writes the owner\'s CLI config' });
  const { harnessSetting, harnessDeclares, harnessSpawnSettings } = accessorsFor({ serverSetting, harnesses });
  // THE PREDICTION ADAPTERS ARE CHECKED ON THE HUB, at its boot (lane usage-predict; 主开发 2026-11-17: the device agent carries no
  // code it never runs): a built-in descriptor NAMES its adapter, and every name must resolve to one that keeps its contract
  // (src/harnesses/predict-adapters.js checkRegistry) — a mismatch is a bug, said by name instead of a hub that starts
  if (harnesses && typeof harnesses.list === 'function' && typeof harnesses.isBuiltin === 'function') {
    const predictErrs = require('../harnesses/predict-adapters.js').checkRegistry(harnesses.list().filter((h) => harnesses.isBuiltin(h.id)));
    if (predictErrs.length) throw new Error(`prediction adapters: ${predictErrs.join('; ')}`);
  }
  /** The persisted paths of every cli-config row of every registered harness. */
  function cliConfigKeys() {
    const out = [];
    for (const h of harnesses.list()) if (h.settings) for (const row of rowsOfKind(h.settings, 'cli-config')) out.push(settingPath(h.settings.prefix, row.key));
    return out;
  }
  /** THE PLAN: descriptor facts (createIfMissing, which file is also the hook
   *  file and its events) + the current values. `hooksOnly` = a plan carrying
   *  no managed keys (the helper's embedded DEFAULT for a run without the env,
   *  e.g. an --uninstall from an older server). */
  function cliConfigPlan({ hooksOnly = false } = {}) {
    return buildConfigPlan(configPlanSpecs(harnesses.list(), { valueOf: serverSetting, hooksOnly }));
  }
  const cliConfigPlanB64 = (opts) => encodePlan(cliConfigPlan(opts));

  let lastWrite = null; // in memory only (D2): { at, receipts, files }
  /** A stored value a CLOSED enum row refused (an API/import write the Settings
   *  window cannot produce): the default rides in the plan instead — say so,
   *  by name, every time the plan is applied. */
  function warnRefusedValues() {
    for (const h of harnesses.list()) if (h.settings) for (const row of rowsOfKind(h.settings, 'cli-config')) {
      const bad = refusedValue(row, serverSetting(settingPath(h.settings.prefix, row.key)));
      if (bad != null) warn(`[cli-config] ${h.id}.${row.key} = ${JSON.stringify(bad)} is not one of ${row.options.map((o) => JSON.stringify(o.value)).join('|')} — the default ${JSON.stringify(row.default)} rides instead (the Settings window only offers the listed values)`);
    }
  }
  // B-ddf3 unit 2 line 1 (lane bl-scratch, the coordinator's r1404 / r1407): THIS MACHINE IS SERVED BY THE SHIPPED HELPER,
  // started through the starter (src/server/cli-config-runner.js) — the same file every paired machine runs; nothing of the
  // CLI's config is written by the hub's own process any more, and there is no in-process fallback (a failed or late landing
  // is said by name). ONE run writes our hook entries (when `hooksWanted()`) AND the managed keys.
  const cliRunner = runner || (helperPath ? require('./cli-config-runner.js').createCliConfigRunner({ starter: starter || require('./child-starter.js').childStarter(), helperPath, home, journal: log, warn }) : null);
  /** the plan for THIS machine: the managed keys, with our hook entries only when they are wanted (integration on, no opt-out) */
  function planFor({ hooks = false } = {}) {
    const plan = cliConfigPlan();
    if (!hooks) for (const f of plan.files || []) delete f.hooks;
    return plan;
  }
  /** THE ONE WRITE ROAD of this machine's CLI config → Promise<landing> ({ ok, receipts, created, parts, why } | a refusal) */
  // r1518: the request's KIND is fixed when it is made (a removal, a registration, the managed keys alone) and never replaced by
  // another kind's in the runner's queue; `before()` runs at the run's own start (the registration's before-read of its files)
  function applyThisMachine({ reason = 'apply', hooks = hooksWanted(), strip = false, before = null, after = null, when = null } = {}) {
    if (!cliRunner) return Promise.resolve({ ok: false, receipts: [], created: [], why: 'no helper road on this server (no helper path given): nothing written' });
    // a STRIP keeps the plan's hook rows: the applier's --uninstall strips only the files whose plan names our hooks (never a managed key)
    const kind = strip ? (when ? 'strip-if-still-asked' : 'strip') : hooks ? 'apply+hooks' : 'apply';   // r1813: a conditional removal is its own kind (never joins a pressed one)
    return cliRunner.apply(() => encodePlan(planFor({ hooks: strip ? true : hooks })), reason, { uninstall: strip, kind, before, after, when }).then((l) => { if (l && l.ok) landedSpell++; return l; });
  }
  /** r2224 (1): a read under this machine's home made OUTSIDE a job (the opted-out start's look at our hook rows) — through the
   *  runner's guard (bounded, counted, refused while an earlier read is out; `ms`: the reader's own bound, r2345; `opts.cls`: its
   *  reader class, one read out per class, r2592); no runner (a test's server only — the hub always builds one): the raw read
   *  → { value } | { error } */
  function homeRead(fn, ms, opts) { return cliRunner ? cliRunner.homeRead(fn, ms, opts) : Promise.resolve().then(fn).then((value) => ({ value }), (error) => ({ error })); }
  /** THE SPAWN GATE (r1407 (a)): null when this machine's config has landed (or nothing was asked: a refused or skipped
   *  server), else { late | failed, why } once the bound passes — the start goes on either way and says it once. A failed
   *  last landing is asked again here. */
  function startGate() {
    if (!cliRunner) return Promise.resolve(null);
    const last = cliRunner.last();
    if (!last && !cliRunner.busy()) return Promise.resolve(null);
    if (last && !last.ok && !cliRunner.busy()) syncCliConfig({ reason: 'a start asks again' });
    // r3064: ONE late notice per CAUSE — a file left broken runs the helper again at each start (r1407: the next start asks
    // again); the gate names the cause and the SPELL (landings so far) and the start keys its notice on both, so it is said once
    // per cause until a landing — on any road — starts a new spell
    return cliRunner.landedWithin(cliRunner.BOUND_MS).then((g) => (g.landed ? null : { ...g, cause: g.why || (g.late ? 'late' : 'failed'), spell: landedSpell }));
  }
  let landedSpell = 0;   // r3064: every landing of this machine's one write road starts a new spell of the late notice
  let heldSkipped = false;
  function syncCliConfig({ reason = 'boot' } = {}) {
    // B-225b (round wyzvr7567's MUST 2 — a WRITE TO A PERSON'S OWN FILE takes its strict side): while the SETTINGS are held no
    // row's value is the person's, so no CLI config is written; the lift's settings change runs this again with their values
    let held = null;
    try { held = serverSetting(Symbol.for('vibespace.settings-held')) || null; } catch { held = null; }
    heldSkipped = !!held;   // (主开发 r552: a sync the hold skipped is OWED — the lift replays it, whatever its rows say)
    if (held) { log(`[cli-config] skipped (${reason}): the settings could not be read (${held.kind}${held.code ? ', ' + held.code : ''}) — no CLI config is written until they read`); return Promise.resolve({ skipped: true, settingsHeld: { kind: held.kind, code: held.code || null } }); }
    warnRefusedValues();
    // ONE journal line per boot for every refused writer (refuseOwnerWrite
    // latches it); without the server's verdict, this module says it itself.
    const refused = refusalNow();
    if (refused) { if (typeof refuseOwnerWrite === 'function') refuseOwnerWrite(); else log(`[cli-config] skipped (${reason}): ${refused.why}`); return Promise.resolve({ skipped: true, refused }); }
    // → Promise: the landing of the helper's run on this machine (one in flight, the newest waiting) — never an in-process write
    return applyThisMachine({ reason }).then((r) => {
      if (!r.ok) return { error: r.why, receipts: r.receipts || [], parts: r.parts || [], files: [] };   // r2844: journalled ONCE — by the runner («not applied on this machine»)
      const files = (r.created || []).map((c) => ({ harness: c.harness, rel: c.rel, created: true }));
      lastWrite = { at: r.at, reason, receipts: r.receipts, files };
      for (const x of r.receipts) {
        if (x.key === 'hooks') continue;   // r2844: our hook entries' receipt is the registration's to say (a missing CLI folder is no failure, r1518)
        if (x.state === 'applied') log(`[cli-config] ${x.harness}.${x.key} = ${JSON.stringify(x.want)} written on this machine (${reason})`);
        else if (x.state !== 'unchanged') warn(`[cli-config] ${x.harness}.${x.key}: not applied on this machine — ${x.state}${x.reason ? ': ' + x.reason : ''}`);
      }
      return { receipts: r.receipts, files, landing: r };
    });
  }
  /** Fresh receipts for the UI: the plan's managed keys read off disk NOW, plus the last in-memory local write (age shown as
   *  "written N minutes ago"). B-ddf3 (the verifier's law five, r3462): THE STATUS NEVER READS THE HOME ON THE HUB's LOOP — the
   *  keys are read by the SHIPPED helper's own --status run (its own process: the runner's status road, bounded by the run's
   *  bound), ONE read in flight shared by every caller, each waiting up to `ms`. → Promise
   *  - A read that STARTED BEFORE the last landing is never joined (it may have read the files before that write): a new one starts.
   *  - A SHORT BOUND REFUSES NO ONE (r2513): a caller whose own wait ran out is answered by the last read if it is younger than
   *    `statusFreshMs` and started after the last landing (its time rides as `readAt`).
   *  - Else every key answers `state: 'unknown'` by name — `reason: 'not-known-now'` when the home did not answer in time,
   *    `'not-read'` when the read itself failed (the helper's own failure line, no helper road) — with `readAt` (the last read or
   *    landing known), and `unread` says why. A helper's CFG|*| line (its own failure) is never taken for fresh receipts.
   *  - A HUNG HOME PILES NO HELPERS: after a read the helper did not finish within the run's bound, no new read is asked for
   *    `STATUS_BACKOFF_MS` (one helper a minute at most, never one a look).
   *  - r4014: THE LATE MARK FALLS BY A FACT, NOT ONLY BY ONE EVENT. A status child the starter ended at its bound but that has not
   *    exited is a LATE MARK, kept with its pid (the starter's own timeout reply names it: the process at that pid IS the child) and
   *    its start time. It falls when the starter says the child ended (onLateExit) OR when /proc shows it gone at the next look (no
   *    such process, a zombie, another start time): a starter that FAULTS drops its settled entries without that call
   *    (child-starter.js fault()), so the event alone held the status «out» for the hub's life. The /proc read is ASYNC (a pool
   *    thread, never the loop), bounded `STATUS_LATE_SEE_MS`, ONE in flight for every look. A child whose end CANNOT be seen (no
   *    pid, no /proc, a read that did not answer, a start time never read) holds the look by its own code (`late-unseen`, said once)
   *    and is let go past `STATUS_LATE_LET_GO_MS` (said once): the status is never «out» for good, and no restart is needed.
   *    r4030: «SEEN GONE» IS OF THAT CHILD — the pid AND its own start time (field 22 of the same /proc file, read when the mark is
   *    made): another start time at that pid is another process, so the child is gone; a live process whose start was never read
   *    is «cannot see», never «the child». EACH FURTHER LET-GO OF ONE SPELL WAITS TWICE AS LONG (10, 20, 40 min …, up to a day);
   *    the spell ends at the first real read. */
  let statusFlight = null, lastRead = null, statusBackoff = null, statusOut = 0;   // statusBackoff: { until, cause } on the monotonic clock
  const lateMarks = new Set();   // { pid, start, since, born } — the late status children (r4014)
  let lateLook = null;           // the one /proc look in flight over them
  const mono = typeof monoClock === 'function' ? monoClock : () => performance.now();   // the backoff never hangs on a clock set back (a suite places its own)
  // r4030: THE LET-GO's SPELL — the let-goes since the last real read; each waits twice as long as the one before it (up to a day),
  // so a home that hangs for a day on a host that cannot look gathers a few children, never one every ten minutes
  let letGoSpell = 0;
  const letGoBound = () => Math.min(statusLateLetGoMaxMs, statusLateLetGoMs * 2 ** Math.min(letGoSpell, 30));
  const lastLanding = () => (cliRunner && cliRunner.last()) || null;
  const landedAt = () => { const l = lastLanding(); return (l && !l.skipped && l.at) || 0; };   // any landing that may have WRITTEN: the join fence
  const readLandedAt = () => { const l = lastLanding(); return (l && l.ok && !l.skipped && l.at) || 0; };   // r3784 (1): only a landing that READ counts for «last read»
  const homeStuckNow = () => (cliRunner && typeof cliRunner.homeStuck === 'function' ? cliRunner.homeStuck() : 0);
  const keyReceipts = (r) => (r && Array.isArray(r.receipts) ? r.receipts.filter((x) => x && x.harness) : []);
  // r3784 (3): with keys planned, a read that names none of them (the helper printed nothing, or only garbage) is no read
  const usableRead = (r, planned) => !!r && !r.timedOut && !r.held && Array.isArray(r.receipts) && !r.receipts.some((x) => x.harness == null) && (planned ? keyReceipts(r).length > 0 : !r.why);
  const plannedNow = () => cliConfigPlan().files.some((f) => Array.isArray(f.set) && f.set.length > 0);
  // the refusals are CODES (never the runner's English words), each said ONCE a spell in the journal; a read clears them
  const saidCodes = new Set();
  const sayOnce = (code, why) => { if (saidCodes.has(code)) return; saidCodes.add(code); warn(`[cli-config] this machine's CLI config status is not known now (${code}): ${why}`); };
  // r4014: ONE process's state and start time from /proc → { state, start } | { gone } | { unseen: why } — async, bounded, never a throw.
  // ONE read per pid in the pool at a time (its read's S4): a read the bound gave up on is still there, and a look meanwhile asks none
  const procReads = new Map();
  const procOf = (pid) => new Promise((resolve) => {
    if (!(Number.isInteger(pid) && pid > 1)) { resolve({ unseen: 'the starter named no pid for it' }); return; }
    let raw = procReads.get(pid);
    if (!raw) {
      const fsp = require('fs').promises;
      raw = Promise.all([fsp.readFile(`${procRoot}/${pid}/stat`, 'utf8').then((x) => { const f = x.slice(x.lastIndexOf(')') + 2).split(' '); return { state: f[0], start: f[19] || null }; }, (e) => ({ err: (e && e.code) || 'error' })), fsp.stat(`${procRoot}/self`).then(() => true, () => false)])
        .then(([st, hasProc]) => (!hasProc ? { unseen: 'this host has no /proc' } : st.err === 'ENOENT' || st.err === 'ESRCH' ? { gone: true } : st.err ? { unseen: `its /proc entry could not be read (${st.err})` } : st), () => ({ unseen: 'its /proc entry could not be read' }));
      procReads.set(pid, raw);
      raw.then(() => { if (procReads.get(pid) === raw) procReads.delete(pid); });
    }
    const t = setTimeout(() => resolve({ unseen: `its /proc entry did not answer within ${statusLateSeeMs} ms` }), statusLateSeeMs);
    t.unref?.();
    raw.then((st) => { clearTimeout(t); resolve(st); });
  });
  const dropLate = (m, how, why = '') => {
    if (!lateMarks.delete(m)) return;
    if (how === 'seen') warn('[cli-config] a status read of this machine\'s files that outlived its bound has ended — its end was never told by the starter (its starter ended first), seen in /proc; the status is read again');
    else if (how === 'let-go') { const after = letGoBound(); letGoSpell++; warn(`[cli-config] a status read of this machine's files that outlived its bound could not be seen to end (${why}) — let go after ${Math.round(after / 1000)} s; the status is read again (a further let-go of this spell waits ${Math.round(letGoBound() / 1000)} s)`); }
  };
  // r4014: a mark is made at the starter's timeout reply; its start time is read at once (the child it just ended is still there).
  // A child already gone at that read ended in the ordinary way, its exit line on its way: the mark falls without a word (its read's S5)
  const markLate = (pid) => { const m = { pid, start: null, since: mono(), born: null }; m.born = procOf(pid).then((st) => { if (st.gone || st.state === 'Z') dropLate(m, 'born'); else if (st.start != null) m.start = st.start; }); lateMarks.add(m); return m; };
  // r4014: THE LOOK AT THE MARKS (one in flight): gone by /proc ⇒ the mark falls; not seen ⇒ held by its own code, let go past the bound
  const seeLate = () => lateLook || (lateLook = Promise.all([...lateMarks].map((m) => m.born.then(() => (lateMarks.has(m) ? procOf(m.pid) : { gone: true })).then((st) => {
    if (!lateMarks.has(m)) return null;
    if (st.gone || st.state === 'Z' || (m.start != null && st.start != null && st.start !== m.start)) { dropLate(m, 'seen'); return null; }
    const unseen = st.unseen || (m.start == null ? 'its start time was never read, so a process at that pid may be another' : null);
    if (!unseen) return null;   // the child itself, still there (the home still holds it): the look waits
    if (mono() - m.since >= letGoBound()) { dropLate(m, 'let-go', unseen); return null; }
    return unseen;
  }))).then((l) => l.find(Boolean) || null, () => null).finally(() => { lateLook = null; }));
  function readByHelper() {
    if (statusFlight && statusFlight.startedAt >= landedAt()) return statusFlight.p;
    // r3784 (2): THE STATUS CHILDREN ARE COUNTED — no new helper while one of its own has not ended (a read older than a landing is
    // not joined, and no second child is started beside it), nor while the runner's own guard says the home is stuck
    // a child the starter ended at its bound but that has not EXITED (an uninterruptible read on a hung mount survives SIGKILL) still counts
    if (statusOut > 0) return Promise.resolve({ held: true, code: 'status-out', after: statusFlight ? statusFlight.p : null, why: `an earlier read of this machine's files has not ended (${statusOut + lateMarks.size} still out)` });
    // r4014: a late child is looked at in /proc first — gone ⇒ its mark falls and this look reads again (no restart)
    if (lateMarks.size > 0) return seeLate().then((unseen) => (lateMarks.size === 0 ? readByHelper() : unseen
      ? { held: true, code: 'late-unseen', why: `an earlier read of this machine's files outlived its bound and its end cannot be seen (${unseen}) — it is let go ${Math.max(0, Math.ceil((Math.min(...[...lateMarks].map((m) => m.since)) + letGoBound() - mono()) / 1000))} s from now` }
      : { held: true, code: 'status-out', after: null, why: `an earlier read of this machine's files has not ended (${lateMarks.size} still out)` }));
    const stuck = homeStuckNow();
    if (stuck > 0) return Promise.resolve({ held: true, code: 'home-stuck', why: `the home still has not answered an earlier read (${stuck} still out)` });
    if (statusBackoff && mono() < statusBackoff.until) return Promise.resolve({ held: true, code: 'backoff', cause: statusBackoff.cause, why: `an earlier read of this machine's files did not finish (${statusBackoff.cause}) — the next read is asked in ${Math.ceil((statusBackoff.until - mono()) / 1000)} s` });
    const startedAt = Date.now(), planned = plannedNow();
    statusOut++;
    let mark = null, exited = false;
    const onLateExit = () => { exited = true; if (mark) dropLate(mark, 'heard'); };   // the starter: a timed-out child ended at last
    const p = Promise.resolve().then(() => cliRunner.status(cliConfigPlanB64(), { onLateExit })).then((r) => r, (e) => ({ why: (e && e.message) || String(e), code: 'threw' })).then((r) => {
      try {
        if (r && r.code === 'timed-out' && !exited) mark = markLate(Number(r.pid) || 0);
        else if (r && r.code === 'starter-unknown' && Number(r.pid) > 0 && !exited) mark = markLate(Number(r.pid));   // its read's S3: a child the faulted starter had STARTED was never ended at its bound — counted the same way
        if (usableRead(r, planned)) { lastRead = { at: startedAt, receipts: r.receipts || [] }; statusBackoff = null; saidCodes.clear(); letGoSpell = 0; }   // r4030: a real read ends the let-go's spell
        // 'starter-unknown' with NO pid: the RUNNER's own bound fired before the starter answered (the starter itself wedged), or the
        // starter never said it started one — a child may live on that this hub can name by no pid, so it is NOT made a late mark
        // (nothing could ever see it end); the backoff alone holds the next read: at most one helper a minute may start beside such a
        // child (the starter's own fault then replaces it). WITH a pid (the starter faulted after its start): the mark above
        else if (r && (r.code === 'timed-out' || r.code === 'starter-unknown')) statusBackoff = { until: mono() + statusBackoffMs, cause: r.code };   // by the runner's CODE
        return r;
      } catch (e) { return { why: `the status read's own bookkeeping failed (${(e && e.message) || e})`, code: 'threw' }; }   // never a rejection
    }).finally(() => { statusOut--; if (statusFlight === f) statusFlight = null; });   // r4014's small: the count falls whatever the handler did
    const f = { p, startedAt };
    statusFlight = f;
    return p;
  }
  async function cliConfigStatus({ ms = statusMs } = {}) {
    const plan = cliConfigPlan();
    const until = mono() + ms;
    const within = (p) => new Promise((resolve) => {
      const left = Math.max(0, until - mono());
      const t = setTimeout(() => resolve({ timedOut: true, code: 'timed-out', why: `the helper's read of this machine's files did not answer within ${ms} ms` }), left);
      t.unref?.();
      p.then((x) => { clearTimeout(t); resolve(x); }, (e) => { clearTimeout(t); resolve({ why: `the status read failed (${(e && e.message) || e})`, code: 'threw' }); });   // its read's S6: never an unhandled rejection
    });
    let r = !cliRunner ? { why: 'no helper road on this server', code: 'no-helper' } : await within(readByHelper());
    // a read still out that this caller may not join (it began before a landing): wait for it to END inside this caller's own bound,
    // then the new read answers — never an answer from before the write, never a second child beside the first
    if (r && r.held && r.code === 'status-out' && r.after) { const e = await within(r.after.then(() => ({ ended: true }))); if (e && e.ended) r = await within(readByHelper()); else r = { ...r, timedOut: true }; }   // the caller's own bound ran out while it was still out
    // each receipt carries its file and path from the plan (a helper's CFG line holds the key, never the file)
    const keyOf = (f, s) => ({ harness: f.harness, id: f.id, rel: f.rel.join('/'), key: s.key, path: s.path.join('.'), want: s.value });
    const sets = plan.files.flatMap((f) => (Array.isArray(f.set) ? f.set : []).map((s) => keyOf(f, s)));
    const joined = (list) => list.map((x) => { const k = sets.find((y) => y.harness === x.harness && y.key === x.key); return k ? { ...k, ...x, rel: k.rel, path: k.path } : x; });
    let receipts, unread = null, readAt = null, unreadCode = null;
    if (usableRead(r, sets.length > 0)) { receipts = joined(r.receipts || []); readAt = Date.now(); }
    else if (lastRead && lastRead.at >= landedAt() && Date.now() - lastRead.at <= statusFreshMs) { readAt = lastRead.at; receipts = joined(lastRead.receipts).map((x) => ({ ...x, readAt })); }   // its age rides on each line
    else {
      const whole = r && Array.isArray(r.receipts) ? r.receipts.find((x) => x.harness == null) : null;
      const silent = r && !r.timedOut && !r.held && !whole && !r.why && sets.length > 0 && keyReceipts(r).length === 0;
      unreadCode = silent ? 'no-receipt' : whole ? 'helper-failed' : (r && r.code) || 'not-read';
      unread = `not known now — ${silent ? "the helper printed no receipt of the plan's keys" : whole ? `the helper's read failed: ${whole.reason || whole.state}` : (r && r.why) || 'the read failed'}`;
      // the home did not answer (a bound, a stuck read, a child still out, a backoff after a timed-out read) ⇒ «did not answer in time»;
      // the read itself failed (the helper's own failure, a starter that is down, no receipt, no helper road) ⇒ «the read failed»
      const late = r && (r.timedOut || r.code === 'timed-out' || r.code === 'home-stuck' || r.code === 'status-out' || r.code === 'late-unseen' || (r.code === 'backoff' && r.cause === 'timed-out'));
      const knownAt = Math.max((lastRead && lastRead.at) || 0, readLandedAt()) || null;
      receipts = sets.map((k) => ({ ...k, state: 'unknown', reason: late ? 'not-known-now' : 'not-read', why: unread, readAt: knownAt }));
      sayOnce(unreadCode, unread);
    }
    // Rows whose value is `off` are not in the plan; the UI still wants to say
    // "leaving the CLI's own value alone" for them, so they are listed apart.
    const off = [];
    for (const h of harnesses.list()) if (h.settings) for (const row of rowsOfKind(h.settings, 'cli-config')) {
      if (!plan.files.some((f) => f.harness === h.id && f.set.some((s) => s.key === row.key))) off.push({ harness: h.id, key: row.key, rel: (h.settings.files[row.apply.file] || {}).rel?.join('/') || null, path: row.apply.path.join('.') });
    }
    const refused = refusalNow();
    return { safe: !refused, refused, registeredAfterError: recoveryNow(), files: plan.files.map((f) => ({ harness: f.harness, id: f.id, rel: f.rel.join('/'), format: f.format, keys: f.set.map((s) => s.key) })), receipts, readAt, unread, unreadCode, off, lastWrite: lastWrite ? { at: lastWrite.at, reason: lastWrite.reason, receipts: lastWrite.receipts } : null };
  }
  /** Every spawn row carrying a live verb, with its harness + persisted path. */
  function liveRows() {
    const out = [];
    for (const h of harnesses.list()) {
      if (!h.settings) continue;
      for (const row of rowsOfKind(h.settings, 'spawn')) if (row.apply.live) out.push({ harness: h.id, row, path: settingPath(h.settings.prefix, row.key) });
    }
    return out;
  }
  /** The settings-write diff hook (persistence.js onSettingsWrite). */
  function onSettingsWrite(next, prev) {
    const n = next || {}, p = prev || {};
    // (b) the landing is RETURNED: the settings write's answer waits for it (or says by name that it did not land)
    let landing = null;
    if (heldSkipped) landing = syncCliConfig({ reason: 'the settings read again' });   // the lift's own replay: rows at their defaults differ from no «before»
    else if (cliConfigKeys().some((k) => n[k] !== p[k])) landing = syncCliConfig({ reason: 'settings change' });
    for (const { harness, row, path } of liveRows()) {
      if (n[path] === p[path]) continue;
      const value = coerce(row, n[path]);
      for (const [sid, sess] of activeSessions) {
        if (sess.backend !== harness || sess.mode !== 'chat' || !sess.pty) continue;
        { const k = SFW.KIND_OF_ROW[row.key]; if (k && SFW.fileGoverns(sess, k)) continue; }   // B-8dcf item two: a value the person's settings file governs is never pushed
        try {
          const ad = adapterRegistry.get(sess.backend);
          if (ad && typeof ad[row.apply.live] === 'function') sess.pty.write(ad[row.apply.live](value) + '\n');
        } catch (e) { warn(`[${row.key}] ${sid}: ${e.message}`); }
      }
    }
    return landing;
  }
  /** Contributed (non-built-in) harnesses' tables for /api/home so the client
   *  can derive their Settings sections (design §7). */
  function contributedTables() {
    return harnesses.list().filter((h) => !harnesses.isBuiltin(h.id) && h.settings).map((h) => ({ id: h.id, settings: h.settings }));
  }

  return { harnessSetting, harnessDeclares, harnessSpawnSettings, cliConfigKeys, cliConfigPlan, cliConfigPlanB64, syncCliConfig, applyThisMachine, homeRead, cliRunner, startGate, cliConfigStatus, onSettingsWrite, liveRows, contributedTables, HARNESS_SETTINGS };
}

module.exports = { create, configPlanSpecs, accessorsFor };
