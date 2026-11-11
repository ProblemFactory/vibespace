// PluginManager (2.140.0, B-2d44) — a GENERIC mechanism for host-level
// capabilities that need: an install step, PERSISTENT state across pod
// rebuilds (everything lives under ~/.vibespace/plugins/<id>/ — the home dir
// is the per-user PVC in fleet deployments), a boot-time replay (rootfs is
// volatile — enabled plugins restart with the server), a guided setup flow
// (auth URLs surfaced to the UI like the Drive OAuth flow), and live status.
//
// ONE REGISTRY, NO ID DISPATCH (lane dc-plugins, 2026-10-04). Each BUILT-IN plugin is one file
// src/plugins/<id>.js registered by ONE line in src/plugins/index.js (tailscale, frp, opencode-serve today).
// This module never names a member: every verb goes to the plugin that DECLARES it, and the relay surface
// (frpPublish / frpUnpublish / setSelfDialSub) goes to the plugin whose `provides` says 'relay'.
// THE CONTRACT (validatePlugin — checked when the manager registers the list; a bad plugin throws by name):
//   { id: 'kebab-id', label, description,            the panel row (description runs through the client's t())
//     provides: ['tunnel' | 'relay' | 'serve' | …],  declared capabilities — the client's pluginProvides(cap) and
//                                                    ('reminders': may file For-you items, origin 'plugin' — the
//                                                    store's gate, lane foryou-plugin-notices)
//                                                    the card read these, never an id; CAP_VERBS = the verbs a
//                                                    capability obliges the plugin to have
//     create(h) → { install, start, stop, status,    required verbs (install may be async)
//                   setup?,                          guided setup (→ POST /api/plugins/:id/login)
//                   config?(patch), mode?(mode),     settings (→ /config, /mode); absent ⇒ refused by name
//                   enable?(on),                     owns the on-switch (default: rec.enabled, saved + broadcast)
//                   bootReplay?(),                   owns its boot replay (default: enabled + desiredUp ⇒ start)
//                   lookup?(name),                   a 'tunnel' plugin's own name answers (tunnelLookup — the ssh hosts)
//                   reach?(), reachFresh?(ms) } }    …and what a browser needs to reach its hosts (tunnelReach / tunnelReachFresh — lane tailnet-names)
//   h (the host handle) = { id, dir: ~/.vibespace/plugins/<id>, rec() (the persistent record, created),
//     peek() (the record or {}), save(), notify() (broadcast plugins-updated), opts (the constructor's extra
//     options, e.g. opencodeServe), probeProto(port, opts), vault() (the data dir's vault engine or null — a secret a
//     plugin holds is its entry: lane vault-e2e-password-fix-r2), sealedDir() (that vault is set up), dataDir (the instance's
//     data dir — frp's own relay token data/relay-token.json, lane relay-token-per-instance) }.
// The MANIFEST plugin-loader (src/server/plugin-loader.js — third-party sandboxed plugins, /api/plugins/manifests)
// is a different family and stays separate; the two meet only in the ⚙ → Plugins panel (src/lib/plugins-ui.js
// renders these rows, then renderManifestPlugins).
//
// State: data/plugins.json { plugins: { <id>: { enabled, desiredUp, … } } } — enabled = the on-switch; a plugin's
// CONFIGURATION lives in data/settings.json (src/plugin-settings.js tables, read via h.setting / h.settings);
// the one secret a plugin holds itself (frp's relay token) is the vault's entry `frp:token` (lane vault-e2e-password-fix-r2;
// before the vault is set up its record's config.token), never a setting.
// (enabled = replay at boot; runtime pid/state live in the plugin dir itself).
const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_ROOT = path.join(os.homedir(), '.vibespace', 'plugins');
const BUILTIN = require('./plugins/index.js');
const PS = require('./plugin-settings.js'); // PURE: one settings table per built-in plugin (docs/design-plugin-settings.zh.md)
const SB = require('./secret-box.js');       // the data dir's vault (a plugin's secret is its entry)

// the verbs a declared capability obliges (the manager's relay surface calls these on the 'relay' provider; lane engine-plugin:
// a BROWSER ENGINE answers the engine registry's two verbs — src/server/browser-engines.js, the contract src/browser-engines.js)
const CAP_VERBS = Object.freeze({ relay: ['publish', 'unpublish', 'setSelfDialSub'], 'browser-engine': ['probe', 'launchOptions'] });
const REQUIRED_VERBS = ['install', 'start', 'stop', 'status'];
// statusAsync (lane hub-sync-holds, rank 13): the fresh answer of a status that needs a child — async, bounded; status() then
// answers the KEPT one with no child (a snapshot or a broadcast never execs)
const STATUS_BOUND_MS = 20000;
const OPTIONAL_VERBS = ['statusAsync', 'setup', 'config', 'mode', 'enable', 'bootReplay', 'applySettings', 'lookup', 'reach', 'reachFresh', 'sealSecrets'];   // sealSecrets: the vault's open hook (r2)

/** The ONE contract check — a plugin that breaks it is refused at registration, by name. */
function validatePlugin(def, verbs) {
  const who = 'built-in plugin ' + (def && typeof def.id === 'string' ? def.id : JSON.stringify(def && def.id));
  if (!def || typeof def !== 'object') throw new Error('built-in plugin: not an object');
  if (typeof def.id !== 'string' || !/^[a-z][a-z0-9-]{1,40}$/.test(def.id)) throw new Error(who + ': id must be a kebab-case word');
  if (typeof def.label !== 'string' || !def.label) throw new Error(who + ': label missing');
  if (typeof def.description !== 'string') throw new Error(who + ': description missing');
  if (!Array.isArray(def.provides) || def.provides.some((c) => typeof c !== 'string' || !/^[a-z][a-z-]*$/.test(c))) throw new Error(who + ': provides must be a list of capability words');
  if (typeof def.create !== 'function') throw new Error(who + ': create(h) missing');
  if (verbs === undefined) return;
  if (!verbs || typeof verbs !== 'object') throw new Error(who + ': create(h) must return its verbs');
  const need = [...REQUIRED_VERBS, ...def.provides.flatMap((c) => CAP_VERBS[c] || [])];
  for (const v of need) if (typeof verbs[v] !== 'function') throw new Error(`${who}: verb ${v}() missing`);
  for (const v of OPTIONAL_VERBS) if (verbs[v] !== undefined && typeof verbs[v] !== 'function') throw new Error(`${who}: ${v} must be a function`);
}

class PluginManager {
  // plugins = the registry (default: THE list, src/plugins/index.js); every other option reaches the plugins as
  // h.opts (opencodeServe = the SHARED serve module, injected so tests can drive a fake keeper).
  constructor({ dataDir, broadcast, plugins = BUILTIN, ...opts }) {
    // settings = THE settings store ({ read() → data/settings.json, patch(obj) → the one writer }): a plugin's
    // configuration rows (src/plugin-settings.js) are read through h.setting / h.settings, never plugins.json
    // (a manager built without one — a suite — keeps its values in memory)
    let mem = {};
    this._settings = opts.settings || { read: () => mem, patch: (p) => { mem = { ...mem, ...p }; for (const [k, v] of Object.entries(mem)) if (v === null) delete mem[k]; } };
    this._file = path.join(dataDir, 'plugins.json');
    this.broadcast = broadcast || (() => {});
    this._watchers = new Set(); // lane tailnet-names r4: watch() — what follows a plugin's state AND its rows (the tailnet door)
    try { this._state = JSON.parse(fs.readFileSync(this._file, 'utf-8')); } catch { this._state = { plugins: {} }; }
    this._defs = new Map(); this._verbs = new Map();
    this._fresh = new Map(); // id → the status refresh in flight (ONE at a time — rank 13)
    this._statusFailed = new Map(); // id → {at, why}: the last refresh did not answer — the kept answer stands, said as stale
    this._statusBoundMs = Number(opts.statusBoundMs) > 0 ? Number(opts.statusBoundMs) : STATUS_BOUND_MS;
    for (const def of plugins) {
      validatePlugin(def);
      if (this._defs.has(def.id)) throw new Error('built-in plugin ' + def.id + ': registered twice');
      const id = def.id;
      const h = {
        id, dir: path.join(PLUGIN_ROOT, id), opts, dataDir,
        rec: () => this._rec(id), peek: () => this._state.plugins[id] || {},
        save: () => this._save(), notify: () => { this._notify(); this.refreshStatus(id).catch(() => { }); }, // the plugin's own event refreshes its kept status (rank 13)
        probeProto: (port, o) => this._probeProto(port, o),
        settings: () => PS.valuesOf(id, this._readSettings()),
        setting: (key) => PS.valuesOf(id, this._readSettings())[key],
        writeSettings: (patch) => this._writeSettings(id, patch),
        vault: () => SB.vaultForDir(dataDir), sealedDir: () => SB.sealedDir(dataDir),
      };
      const verbs = def.create(h);
      validatePlugin(def, verbs);
      this._defs.set(id, def); this._verbs.set(id, verbs);
    }
  }

  _save({ loud = false } = {}) {
    try {
      const tmp = this._file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, this._file);
    } catch (e) { if (loud) throw e; }   // a migration's write is loud (a failed run is retried, never recorded)
  }

  _readSettings() { try { return this._settings.read() || {}; } catch { return {}; } }
  /** THE VAULT'S OPEN HOOK (lane vault-e2e-password-fix-r2): every plugin holding a secret seals what its record still
   *  holds in the clear (`sealSecrets` — frp's relay token). → the ids that sealed one. */
  sealSecrets() {
    const out = [];
    for (const [id, v] of this._verbs) { if (typeof v.sealSecrets !== 'function') continue; try { if (v.sealSecrets()) out.push(id); } catch (e) { console.warn(`[plugins] ${id}: its secret was not sealed:`, e.message); } }
    this._notify();   // every card re-reads its state (a relay / voice row the lock kept closed is open now)
    return out;
  }
  /** The vault LOCKED: every card re-reads its state (frp's sealed token, the voice sign-in say 「保险库已锁定」). */
  vaultChanged() { this._notify(); }
  /** a plugin's own rows written through the ONE settings writer (a key outside its table is refused by name) */
  _writeSettings(id, patch = {}) {
    const tbl = PS.PLUGIN_SETTINGS[id];
    const out = {};
    for (const [k, v] of Object.entries(patch)) {
      const r = tbl && tbl.rows.find((x) => x.key === k);
      if (!r) throw new Error(`plugin ${id} has no setting ${k}`);
      out[PS.rowPath(id, r)] = v === undefined || v === r.default ? null : v; // a default is dropped (sparse store)
    }
    if (Object.keys(out).length) this._settings.patch(out);
  }
  /** THE ONE-TIME MOVE (migration 2026-10-plugin-config-to-settings, src/server/migrations.js): the table rows'
   *  old values leave data/plugins.json for settings.json — through this live manager (it holds plugins.json). */
  migrateConfigToSettings() {
    const { patch, strip } = PS.migrationPlan(this._state, this._readSettings());
    if (Object.keys(patch).length) this._settings.patch(patch);
    for (const [id, fields] of Object.entries(strip)) {
      const rec = this._state.plugins[id];
      for (const f of fields) { const [a, b] = f.split('.'); if (b === undefined) delete rec[a]; else if (rec[a]) delete rec[a][b]; }
      if (rec.config && !Object.keys(rec.config).length) delete rec.config;
    }
    if (Object.keys(strip).length) this._save();
    return { moved: Object.keys(patch), stripped: strip };
  }
  /** A RENAMED BUILT-IN (migration 2026-10-llm-rename, src/server/migrations.js — through this live manager: it holds
   *  plugins.json in memory and writes settings through THE settings store). (a) settings.json `plugin.<from>.<k>` →
   *  `plugin.<to>.<k>` unless the new key holds a value (the new one wins; the old key leaves either way); `seed` = rows
   *  of the new table written only where settings holds no value (an empty string counts as none); (b) plugins.json's
   *  record `<from>` → `<to>` WHOLE (the on-switch and anything else) unless a `<to>` record exists — then the new one
   *  wins and the old is removed, never merged; (c) a record that ARRIVES with old `config` fields gets the one-time
   *  config → settings move again (an instance that ran 2026-10-plugin-config-to-settings while the table had the new
   *  id). Idempotent: a second run finds nothing under the old id. → {settings: {moved, dropped, seeded}, record, config}. */
  renamePlugin(fromId, toId, { seed = {} } = {}) {
    if (!this._defs.has(toId)) throw new Error(`renamePlugin: ${toId} is not a built-in plugin`);
    const tbl = PS.PLUGIN_SETTINGS[toId];
    const cur = this._readSettings();
    const fromP = `plugin.${fromId}.`, toP = `plugin.${toId}.`;
    const patch = {}, moved = [], dropped = [], seeded = [];
    for (const [k, v] of Object.entries(cur)) {
      if (!k.startsWith(fromP)) continue;
      const nk = toP + k.slice(fromP.length);
      if (cur[nk] === undefined && v !== null && v !== undefined) { patch[nk] = v; moved.push(nk); } else dropped.push(k);
      patch[k] = null;
    }
    for (const [key, v] of Object.entries(seed || {})) {
      const r = tbl && tbl.rows.find((x) => x.key === key);
      if (!r) throw new Error(`renamePlugin: plugin ${toId} has no setting ${key}`);
      const p = PS.rowPath(toId, r);
      const now = p in patch ? patch[p] : cur[p];
      if ((now === undefined || now === null || now === '') && v !== undefined && v !== r.default) { patch[p] = v; seeded.push(p); }
    }
    if (Object.keys(patch).length) this._settings.patch(patch);
    const P = this._state.plugins;
    let record = 'none';
    if (P[fromId]) {
      if (P[toId]) record = 'dropped'; else { P[toId] = P[fromId]; record = 'moved'; }
      delete P[fromId];
      this._save({ loud: true });
    }
    const config = record === 'moved' ? this.migrateConfigToSettings() : null;
    return { settings: { moved, dropped, seeded }, record, config };
  }
  /** settings.json changed (server.js onSettingsWrite): a plugin whose `plugin-config` row moved re-applies it; lane tailnet-names
   *  r4: EVERY moved row of a plugin (an `apply: 'server'` row too — the server reads those lazily, nobody re-applies them) is
   *  told to watch() — {type: 'rows', id, keys} */
  onSettingsWrite(next, prev) {
    for (const [id, tbl] of Object.entries(PS.PLUGIN_SETTINGS)) {
      const movedRows = tbl.rows.filter((r) => JSON.stringify((next || {})[PS.rowPath(id, r)]) !== JSON.stringify((prev || {})[PS.rowPath(id, r)]));
      const moved = movedRows.some((r) => r.apply === 'plugin-config');
      const v = this._verbs.get(id);
      if (moved && v && typeof v.applySettings === 'function') { try { v.applySettings(); } catch (e) { console.warn(`[plugins] ${id} could not apply its settings:`, e.message); } }
      if (movedRows.length && this._verbs.has(id)) this._tell({ type: 'rows', id, keys: movedRows.map((r) => r.key) });
    }
  }
  /** lane tailnet-names r4: ONE subscription to what a plugin IS — its every broadcast ({type: 'plugins-updated'}: a start, a
   *  stop, a sign-in, an on/off switch) AND its rows written through the settings store ({type: 'rows', id, keys}). → unwatch() */
  watch(fn) { if (typeof fn !== 'function') return () => { }; this._watchers.add(fn); return () => { this._watchers.delete(fn); }; }
  _tell(ev) { for (const fn of [...this._watchers]) { try { fn(ev); } catch (e) { console.warn('[plugins] a watcher failed:', e && e.message); } } }

  _rec(id) { return (this._state.plugins[id] = this._state.plugins[id] || {}); }
  // restored 2.343.1 — a dead-code sweep (dc37220) deleted this while 8 call
  // sites remained; every plugin-state broadcast (and publish) threw since.
  _notify() { this.broadcast({ type: 'plugins-updated', ...this._snapshot() }); this._tell({ type: 'plugins-updated' }); }

  // ── registry ──
  /** A plugin's verbs, or a refusal BY NAME: an unknown id, or a verb the plugin did not declare. */
  _verb(id, verb) {
    const v = this._verbs.get(id);
    if (!v) throw new Error('unknown plugin: ' + id);
    if (typeof v[verb] !== 'function') throw new Error(`the ${this._defs.get(id).label} plugin has no ${verb} step`);
    return v[verb];
  }
  /** The id of the plugin that declares a capability (null when none does). */
  providerId(cap) { for (const d of this._defs.values()) if (d.provides.includes(cap)) return d.id; return null; }
  /** lane engine-plugin: EVERY plugin that declares a capability, in registration order (the engine registry's built-in half). */
  providerIds(cap) { return [...this._defs.values()].filter((d) => d.provides.includes(cap)).map((d) => d.id); }
  /** lane engine-plugin: ONE verb CAP_VERBS names for a capability the plugin declares — a refusal by name otherwise. */
  capVerb(id, cap, verb) {
    const d = this._defs.get(id);
    if (!d || !d.provides.includes(cap) || !(CAP_VERBS[cap] || []).includes(verb)) throw new Error(`no plugin ${id} answers ${cap} ${verb}`);
    return this._verb(id, verb);
  }
  _provider(cap, verb, what) {
    const id = this.providerId(cap);
    if (!id) throw new Error(what + ' — no plugin on this instance provides ' + cap);
    return this._verb(id, verb);
  }
  defs() {
    const out = {};
    for (const d of this._defs.values()) out[d.id] = { id: d.id, label: d.label, description: d.description, provides: [...d.provides] };
    return out;
  }

  /** ONE pass over every plugin → the panel rows AND the compact service rows. A plugin's status() is sync and runs NO child
   *  (lane hub-sync-holds, rank 13: tailscale's ran pgrep + sudo + `tailscale status --json` here, 4.7–4.9 s on the owner's
   *  hub): a status that needs one is a KEPT fact, refreshed by refreshStatus() — never by a snapshot or a broadcast. */
  _snapshot() {
    const plugins = [], services = {};
    for (const d of Object.values(this.defs())) {
      const rec = this._state.plugins[d.id] || {};
      let st = {};
      try { st = this.status(d.id); } catch (e) { st = { error: e.message }; }
      plugins.push({ ...d, enabled: !!rec.enabled, ...st });
      services[d.id] = this._serviceRow(d, rec, st);
    }
    return { plugins, services };
  }
  _serviceRow(d, rec, st) {
    return {
      id: d.id, label: d.label, description: d.description,
      enabled: st.enabled !== undefined ? !!st.enabled : !!rec.enabled,
      desiredUp: !!st.desiredUp, prompted: !!st.prompted,
      installed: !!st.installed, running: !!st.running, starting: !!st.starting,
      parked: !!st.parked, envForced: st.envForced === undefined ? null : st.envForced,
      reason: st.reason || st.lastError || st.error || null,
    };
  }

  list() { return this._snapshot().plugins; }
  services() { return this._snapshot().services; }

  /** The COMPACT state a harness/feature surface needs to decide "is my
   *  background service on?" for ONE plugin — cheap (no sibling probes),
   *  carried on /api/home's harness rows. */
  serviceState(id) {
    const d = this.defs()[id];
    if (!d) return null;
    let st = {};
    try { st = this.status(id); } catch (e) { st = { error: e.message }; }
    return this._serviceRow(d, this._state.plugins[id] || {}, st);
  }
  /** THE plugin half of the serve autostart decision (the env override half
   *  lives in src/opencode-serve.js — ONE parse of that switch). */
  wantsServiceUp(id) { const rec = this._state.plugins[id] || {}; return !!(rec.enabled && rec.desiredUp); }

  /** THE KEPT STATUS, REFRESHED (rank 13): a plugin that declares statusAsync is asked again — ONE refresh at a time, bounded
   *  by STATUS_BOUND_MS (its children carry their own timeouts); when the kept answer changed every card hears it. Asked at boot
   *  (bootReplay), on a person's press (the panel's GET) and on the plugin's own event (h.notify). → the status */
  refreshStatus(id) {
    const v = this._verbs.get(id);
    if (!v) return Promise.reject(new Error('unknown plugin: ' + id));
    if (typeof v.statusAsync !== 'function') return Promise.resolve().then(() => this.status(id));
    if (this._fresh.has(id)) return this._fresh.get(id);
    const was = this._statusOr(id);
    const ms = this._statusBoundMs;
    let timer = null;
    // round 2: the bound ABORTS the ask (its signal) — an abandoned ask starts nothing more (each step checks the signal, the
    // child it holds is killed) and writes nothing, so a later ask never runs beside it (tailscale's worst case: which 5 +
    // pgrep 5 + sudo -n 3 + sudo -n 3 + which 5 + status --json 5 = 26 s, over the 20 s bound — the abort is what holds)
    const ac = new AbortController();
    const bound = new Promise((resolve, reject) => { timer = setTimeout(() => { const e = new Error(`its status took over ${ms} ms`); ac.abort(e); reject(e); }, ms); if (timer.unref) timer.unref(); });
    // a refresh that does not answer: the KEPT answer stands, marked stale (`statusError`, its time) — retried at the next ask
    // (a press, the plugin's own event, the next boot), never by a timer; each child it started ends at its own timeout
    const p = Promise.race([Promise.resolve().then(() => v.statusAsync({ signal: ac.signal })), bound])
      .then(() => { this._statusFailed.delete(id); }, (e) => { const why = String((e && e.message) || e).slice(0, 200); this._statusFailed.set(id, { at: Date.now(), why }); console.warn(`[plugins] ${id}: its status was not read again — ${why}`); })
      .then(() => { clearTimeout(timer); this._fresh.delete(id); const now = this._statusOr(id); if (JSON.stringify(now) !== JSON.stringify(was)) this._notify(); return now; });
    this._fresh.set(id, p);
    return p;
  }
  /** every kept status asked again (a person opened the panel) — nothing waits for it; the broadcast follows a change */
  refreshAll() { for (const [id, v] of this._verbs) if (typeof v.statusAsync === 'function') this.refreshStatus(id).catch(() => { }); }
  _statusOr(id) { try { return this.status(id); } catch (e) { return { error: e.message }; } }

  setMode(id, mode) { return this._verb(id, 'mode')(mode); }
  setConfig(id, patch = {}) { return this._verb(id, 'config')(patch); }

  setEnabled(id, enabled) {
    if (!this._verbs.has(id)) throw new Error('unknown plugin: ' + id);
    // a plugin whose on-switch IS its start/stop (enable declared) owns it; the default is the boot flag
    const own = this._verbs.get(id).enable;
    if (own) return own(enabled);
    this._rec(id).enabled = !!enabled;
    this._save();
    this._notify();
  }

  /** "We already asked" — the first-use dialog is shown ONCE per instance
   *  (owner: "Not now" must be remembered). Broadcast like every other
   *  persistent state change so a second tab never re-asks. */
  setPrompted(id, prompted = true) {
    if (!this._verbs.has(id)) throw new Error('unknown plugin: ' + id);
    const rec = this._rec(id);
    if (prompted) rec.promptedAt = Date.now(); else delete rec.promptedAt;
    this._save();
    this._notify();
    return { prompted: !!rec.promptedAt };
  }

  // Boot replay: rootfs is volatile — restart enabled plugins that were up. A plugin that declares bootReplay
  // owns its rule (frp: default-on from the cluster env, no prior desiredUp; opencode-serve: the env override);
  // the default is enabled + desiredUp ⇒ start, unless the daemon is already running or managed by the system.
  bootReplay() {
    this.refreshAll(); // every kept status read once at boot — async, bounded (rank 13)
    for (const [id, verbs] of this._verbs) {
      if (verbs.bootReplay) { verbs.bootReplay(); continue; }
      const rec = this._state.plugins[id] || {};
      if (!rec.enabled || !rec.desiredUp) continue;
      try {
        const st = this.status(id);
        if (!st.running && st.installed && st.mode !== 'system') {
          console.log(`[plugins] boot replay: starting ${id}`);
          this.start(id);
        }
      } catch (e) { console.warn(`[plugins] boot replay ${id} failed:`, e.message); }
    }
  }

  async install(id) { return this._verb(id, 'install')(); }
  start(id) { return this._verb(id, 'start')(); }
  stop(id) { return this._verb(id, 'stop')(); }
  /** the plugin's KEPT status (sync, no child — rank 13); a last refresh that did not answer is said with it (`statusError`) */
  status(id) { const st = this._verb(id, 'status')(); const f = this._statusFailed && this._statusFailed.get(id); return f ? { ...st, statusError: { at: f.at, why: f.why } } : st; }
  // Guided setup: the plugin's setup verb (tailscale: `tailscale up` prints the auth URL — captured for the UI,
  // the Drive-OAuth pattern: user opens the link, approves, the card polls status).
  loginStart(id) { return this._verb(id, 'setup')(); }

  // ── the RELAY surface (B-0b60 public URLs; port-forward + instance-url call these) — whichever plugin
  //    declares provides: ['relay'] answers ──
  /** Sniff what a local service speaks so we pick the right relay proxy type
   *  (see module-level probeProto). */
  async _probeProto(port, opts) { return probeProto(port, opts); }
  /** the relay's STATUS (configured · missing · vaultLocked · subDomainHost · selfDialSub …) through the SAME door as the verbs
   *  below — whichever plugin declares 'relay' (lane fleet-instance-publish: instance-url resolved the provider itself through a
   *  `providerId` the object server.js hands it never had ⇒ status(undefined) threw on every call, read as «not configured»). */
  relayStatus() { return this._provider('relay', 'status', 'public URLs are not available')(); }
  async frpPublish(name, localPort, opts) { return this._provider('relay', 'publish', 'public URLs are not available')(name, localPort, opts); }
  setSelfDialSub(sub) { return this._provider('relay', 'setSelfDialSub', 'no relay')(sub); }
  async frpUnpublish(name) { return this._provider('relay', 'unpublish', 'no relay')(name); }
  /** a tailnet name → { name, ip, ips } from whichever plugin declares 'tunnel' (its own peer table — lane
   *  tailscale-plugin-pod-dns: the container's resolver is never the tunnel's), null when none answers. Sync. */
  tunnelLookup(name) {
    const id = this.providerId('tunnel'), v = id && this._verbs.get(id);
    try { return v && typeof v.lookup === 'function' ? v.lookup(name) || null : null; } catch { return null; }
  }
  /** lane tailnet-names: what a browser needs to reach the tunnel's hosts by name ({up, mode, state, loggedIn, browsers, peers,
   *  self, suffix, known, at, stale, ports} — src/tailnet-reach.js reads it) from whichever plugin declares 'tunnel'; null when
   *  none answers. Sync. */
  tunnelReach() {
    const id = this.providerId('tunnel'), v = id && this._verbs.get(id);
    try { return v && typeof v.reach === 'function' ? v.reach() || null : null; } catch { return null; }
  }
  /** r2: the same answer after ONE bounded status read when the table is stale (≤ `ms`) — a launch, a PAC, a /proxy request */
  async tunnelReachFresh(ms) {
    const id = this.providerId('tunnel'), v = id && this._verbs.get(id);
    try { return v && typeof v.reachFresh === 'function' ? (await v.reachFresh(ms)) || null : this.tunnelReach(); } catch { return null; }
  }
}

/** Sniff what a service speaks so publish/UI pick the right exposure mode.
 *  'https' (TLS backend — passthrough, keeps its own cert) / 'http' (plaintext
 *  HTTP — can ride a routed subdomain with server-side TLS termination) /
 *  'tcp' (anything else — a DB, VNC, SSH: NO Host/SNI to route on, so it can
 *  only be an IP:port). `target` = a local port number, or `{ connect }` — an
 *  async factory returning a duplex stream (how remote ports are probed
 *  through the device tunnel; each probe pass gets its OWN fresh stream). */
async function probeProto(target, { timeoutMs = 2500 } = {}) {
  const net = require('net'), tls = require('tls');
  // lane job-publish-stable: a backend that NEVER accepted a connection is UNDECIDED (throws), not 'tcp' — a refused
  // port used to read as a raw-TCP service, so a service probed before it listened was published TCP
  let reached = false;
  const mk0 = typeof target === 'object' && target && target.connect
    ? target.connect
    : () => new Promise((res, rej) => {
      const s = net.connect({ host: '127.0.0.1', port: target, timeout: timeoutMs }, () => res(s));
      s.on('error', rej); s.on('timeout', () => { s.destroy(); rej(new Error('timeout')); });
    });
  const mk = async () => { const s = await mk0(); reached = true; return s; };
  // TLS? a completed handshake = the backend serves TLS (its own https)
  const isTls = await new Promise(async (res) => {
    let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    const guard = setTimeout(() => fin(false), timeoutMs + 500);
    let sock; try { sock = await mk(); } catch { clearTimeout(guard); return fin(false); }
    const s = tls.connect({ socket: sock, rejectUnauthorized: false }, () => { clearTimeout(guard); fin(true); s.destroy(); });
    s.setTimeout(timeoutMs, () => { fin(false); s.destroy(); });
    s.on('error', () => { clearTimeout(guard); fin(false); try { s.destroy(); } catch { } });
  });
  if (isTls) return 'https';
  // HTTP? send a minimal request and look for an HTTP status line
  const isHttp = await new Promise(async (res) => {
    let done = false, buf = ''; const fin = (v) => { if (!done) { done = true; res(v); } };
    const guard = setTimeout(() => { fin(/^HTTP\//.test(buf)); }, timeoutMs + 500);
    let s; try { s = await mk(); } catch { clearTimeout(guard); return fin(false); }
    const end = (v) => { clearTimeout(guard); fin(v); try { s.destroy?.() ?? s.end?.(); } catch { } };
    try { s.write('GET / HTTP/1.0\r\nHost: localhost\r\n\r\n'); } catch { return end(false); }
    s.on('data', (d) => { buf += d.toString('latin1'); if (buf.length >= 5) end(/^HTTP\//.test(buf)); });
    s.on('error', () => end(/^HTTP\//.test(buf)));
    s.on('close', () => end(/^HTTP\//.test(buf)));
    if (s.setTimeout) s.setTimeout(timeoutMs, () => end(/^HTTP\//.test(buf)));
  });
  if (!isHttp && !reached) throw Object.assign(new Error('nothing answers on that port'), { code: 'EUNREACHABLE' });
  return isHttp ? 'http' : 'tcp';
}

module.exports = { PluginManager, probeProto, validatePlugin, CAP_VERBS, OPENCODE_SERVE_ID: require('./plugins/opencode-serve.js').id };
