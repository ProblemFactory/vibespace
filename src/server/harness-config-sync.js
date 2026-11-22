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
//   cliConfigStatus()            fresh receipts (D2: every probe re-reads the
//                                target file; the last local write is kept in
//                                memory only, never persisted)
//   onSettingsWrite(next, prev)  the diff hook: any cli-config key changed ⇒
//                                sync; any spawn row with a `live` verb changed
//                                ⇒ the verb is written to every running chat
//                                session of that harness whose adapter has it
//                                (the disableModelFallback loop generalised by
//                                adapter CAPABILITY, never by backend id)
// Literal harness ids are FORBIDDEN in this tier (test-architecture's census):
// every id here arrives from a session, an account or the registry.
const { HARNESS_SETTINGS, settingPath, rowOf, rowsOfKind, coerce, readRow, refusedValue, buildConfigPlan } = require('../harness-settings');
const { readConfigPlan, encodePlan } = require('../harness-config');   // B-ddf3 unit 2 line 1: no applier here — this machine is written by the shipped helper
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

function create({ serverSetting, harnesses, adapterRegistry, activeSessions, hookRegistrationSafe = () => true, ownerWriteRefusal = null, refuseOwnerWrite = null, rootRecovery = null, log = console.log, warn = console.warn, home = null, helperPath = null, starter = null, hooksWanted = () => false, runner = null }) {
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
  /** THE ONE WRITE ROAD of this machine's CLI config → Promise<landing> ({ ok, receipts, created, why } | a refusal) */
  // r1518: the request's KIND is fixed when it is made (a removal, a registration, the managed keys alone) and never replaced by
  // another kind's in the runner's queue; `before()` runs at the run's own start (the registration's before-read of its files)
  function applyThisMachine({ reason = 'apply', hooks = hooksWanted(), strip = false, before = null, after = null, when = null } = {}) {
    if (!cliRunner) return Promise.resolve({ ok: false, receipts: [], created: [], why: 'no helper road on this server (no helper path given): nothing written' });
    // a STRIP keeps the plan's hook rows: the applier's --uninstall strips only the files whose plan names our hooks (never a managed key)
    const kind = strip ? (when ? 'strip-if-still-asked' : 'strip') : hooks ? 'apply+hooks' : 'apply';   // r1813: a conditional removal is its own kind (never joins a pressed one)
    return cliRunner.apply(() => encodePlan(planFor({ hooks: strip ? true : hooks })), reason, { uninstall: strip, kind, before, after, when });
  }
  /** r2224 (1): a read under this machine's home made OUTSIDE a job (the opted-out start's look at our hook rows) — through the
   *  runner's guard (bounded, counted, refused while an earlier read is out; `ms`: the reader's own bound, r2345); no runner (a
   *  test's server only — the hub always builds one): the raw read → { value } | { error } */
  function homeRead(fn, ms) { return cliRunner ? cliRunner.homeRead(fn, ms) : Promise.resolve().then(fn).then((value) => ({ value }), (error) => ({ error })); }
  /** THE SPAWN GATE (r1407 (a)): null when this machine's config has landed (or nothing was asked: a refused or skipped
   *  server), else { late | failed, why } once the bound passes — the start goes on either way and says it once. A failed
   *  last landing is asked again here. */
  function startGate() {
    if (!cliRunner) return Promise.resolve(null);
    const last = cliRunner.last();
    if (!last && !cliRunner.busy()) return Promise.resolve(null);
    if (last && !last.ok && !cliRunner.busy()) syncCliConfig({ reason: 'a start asks again' });
    return cliRunner.landedWithin(cliRunner.BOUND_MS).then((g) => (g.landed ? null : g));
  }
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
      if (!r.ok) { warn(`[cli-config] failed (${reason}): ${r.why}`); return { error: r.why, receipts: r.receipts || [], files: [] }; }
      const files = (r.created || []).map((c) => ({ harness: c.harness, rel: c.rel, created: true }));
      lastWrite = { at: r.at, reason, receipts: r.receipts, files };
      for (const x of r.receipts) {
        if (x.state === 'applied') log(`[cli-config] ${x.harness}.${x.key} = ${JSON.stringify(x.want)} written on this machine (${reason})`);
        else if (x.state !== 'unchanged') warn(`[cli-config] ${x.harness}.${x.key}: not applied on this machine — ${x.state}${x.reason ? ': ' + x.reason : ''}`);
      }
      return { receipts: r.receipts, files, landing: r };
    });
  }
  /** Fresh receipts for the UI: the plan's managed keys read off disk NOW, plus
   *  the last in-memory local write (age shown as "written N minutes ago"). */
  function cliConfigStatus() {
    const plan = cliConfigPlan();
    let receipts = [];
    try { receipts = readConfigPlan(plan, { home }); } catch (e) { receipts = [{ state: 'error', reason: e.message }]; }
    // Rows whose value is `off` are not in the plan; the UI still wants to say
    // "leaving the CLI's own value alone" for them, so they are listed apart.
    const off = [];
    for (const h of harnesses.list()) if (h.settings) for (const row of rowsOfKind(h.settings, 'cli-config')) {
      if (!plan.files.some((f) => f.harness === h.id && f.set.some((s) => s.key === row.key))) off.push({ harness: h.id, key: row.key, rel: (h.settings.files[row.apply.file] || {}).rel?.join('/') || null, path: row.apply.path.join('.') });
    }
    const refused = refusalNow();
    return { safe: !refused, refused, registeredAfterError: recoveryNow(), files: plan.files.map((f) => ({ harness: f.harness, id: f.id, rel: f.rel.join('/'), format: f.format, keys: f.set.map((s) => s.key) })), receipts, off, lastWrite: lastWrite ? { at: lastWrite.at, reason: lastWrite.reason, receipts: lastWrite.receipts } : null };
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
