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
//                                hookRegistrationSafe() (a /tmp worktree server
//                                must never write the real HOME's CLI config —
//                                the 2026-07-21 incident class, which the old
//                                retention write did NOT honour)
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
const { HARNESS_SETTINGS, settingPath, rowOf, rowsOfKind, coerce, refusedValue, buildConfigPlan } = require('../harness-settings');
const { applyConfigPlan, readConfigPlan, encodePlan } = require('../harness-config');

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
      files[id] = { createIfMissing: !!spec.createIfMissing };
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
    return coerce(row, serverSetting(settingPath(h.settings.prefix, key)));
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

function create({ serverSetting, harnesses, adapterRegistry, activeSessions, hookRegistrationSafe = () => true, log = console.log, warn = console.warn, home = null }) {
  const { harnessSetting, harnessDeclares, harnessSpawnSettings } = accessorsFor({ serverSetting, harnesses });
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
  function syncCliConfig({ reason = 'boot' } = {}) {
    warnRefusedValues();
    if (!hookRegistrationSafe()) { log(`[cli-config] skipped (${reason}): throwaway/temp server root never writes the real HOME's CLI config`); return { skipped: true }; }
    const plan = cliConfigPlan();
    let r;
    try { r = applyConfigPlan(plan, { home }); } catch (e) { warn(`[cli-config] failed (${reason}): ${e.message}`); return { error: e.message }; }
    lastWrite = { at: Date.now(), reason, receipts: r.receipts, files: r.files };
    for (const x of r.receipts) {
      if (x.state === 'applied') log(`[cli-config] ${x.harness}.${x.key}: ${x.path} = ${JSON.stringify(x.want)} written to ~/${x.rel} (${reason})`);
      else if (x.state !== 'unchanged') warn(`[cli-config] ${x.harness}.${x.key}: not applied to ~/${x.rel} — ${x.state}${x.reason ? ': ' + x.reason : ''}`);
    }
    return r;
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
    return { safe: hookRegistrationSafe(), files: plan.files.map((f) => ({ harness: f.harness, id: f.id, rel: f.rel.join('/'), format: f.format, keys: f.set.map((s) => s.key) })), receipts, off, lastWrite: lastWrite ? { at: lastWrite.at, reason: lastWrite.reason, receipts: lastWrite.receipts } : null };
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
    if (cliConfigKeys().some((k) => n[k] !== p[k])) syncCliConfig({ reason: 'settings change' });
    for (const { harness, row, path } of liveRows()) {
      if (n[path] === p[path]) continue;
      const value = coerce(row, n[path]);
      for (const [sid, sess] of activeSessions) {
        if (sess.backend !== harness || sess.mode !== 'chat' || !sess.pty) continue;
        try {
          const ad = adapterRegistry.get(sess.backend);
          if (ad && typeof ad[row.apply.live] === 'function') sess.pty.write(ad[row.apply.live](value) + '\n');
        } catch (e) { warn(`[${row.key}] ${sid}: ${e.message}`); }
      }
    }
  }
  /** Contributed (non-built-in) harnesses' tables for /api/home so the client
   *  can derive their Settings sections (design §7). */
  function contributedTables() {
    return harnesses.list().filter((h) => !harnesses.isBuiltin(h.id) && h.settings).map((h) => ({ id: h.id, settings: h.settings }));
  }

  return { harnessSetting, harnessDeclares, harnessSpawnSettings, cliConfigKeys, cliConfigPlan, cliConfigPlanB64, syncCliConfig, cliConfigStatus, onSettingsWrite, liveRows, contributedTables, HARNESS_SETTINGS };
}

module.exports = { create, configPlanSpecs, accessorsFor };
