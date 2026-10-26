'use strict';
/**
 * ORCH — THE ENGINE REGISTRY (lane engine-plugin, 2026-10-25; docs/design-custom-browser-plugin.zh.md §1.1). The two plugin
 * families meet in ONE table: a MANIFEST plugin (src/server/plugin-loader.js — `contributes.browserEngine: true`, its server
 * process answering over IPC) is a row only while it is `enabled && trusted && state === 'running'`; a BUILT-IN plugin
 * (src/plugins.js — `provides: ['browser-engine']`, the CAP_VERBS pair) is a row addressed `builtin.<id>` (none today).
 *
 *   rows()                 → [{id, label, family, version}] — the table now (a plugin turned off leaves it at once)
 *   providerFor(id)        → {id, label, family, probe(input), launchOptions(input)} | null
 *   probe(id)              → the probe's verdict over THE path VibeSpace resolved for its kernel (`kernelPath`) —
 *                            `{ok:true, fact}` | `{ok:false, code, error}` (src/browser-engines.js engineAnswerVerdict)
 *   launchOptions(id, x)   → `{ok:true, launch:{executablePath, args, env}}` | a refusal by name
 *   kernelPath(id)         → `<dataDir>/plugins-state/<id>/kernel/<platform-arch>/chrome` — where a kernel lives on this
 *                            machine: inside the plugin's OWN state folder, the one place its `node --permission` process may
 *                            read besides its package (the loader's implicit grant — a declared path may never cover VibeSpace's
 *                            data), so its probe can stat the file; `--version` needs its `childProcess` capability (without
 *                            it the version is null, a fact). The distribution lane P4 fills the folder; the path is PASSED
 *                            to the plugin, never read from its env.
 *
 * Each verb is ONE loader ask (`askRoute`, the loader's 30 s IPC cap — no answer ⇒ browser_engine_unanswered); nothing of the
 * plugin is required into this process. Never throws: every outcome is a verdict the keeper turns into a named refusal.
 */
const path = require('path');
const BE = require('../browser-engines.js');

function create({ loader = null, plugins = null, dataDir = null, platform = process.platform, arch = process.arch, timeoutMs = null, log = console } = {}) {
  const L = () => { try { return typeof loader === 'function' ? loader() : loader; } catch { return null; } };
  const P = () => { try { return typeof plugins === 'function' ? plugins() : plugins; } catch { return null; } };
  const tag = `${BE.platformOf(platform)}-${arch === 'x64' ? 'x64' : String(arch || 'x64')}`;
  function manifestRows() {
    const l = L();
    let list = [];
    try { list = l && typeof l.list === 'function' ? l.list() : []; } catch (e) { log.warn?.(`[browser] the plugin list could not be read for the engine table (${e && e.message})`); }
    return list.filter((p) => p && p.valid && p.contributes && p.contributes.browserEngine === true && p.enabled && p.trusted && p.state === 'running' && BE.ID_RE.test(String(p.id || '')))
      .map((p) => ({ id: String(p.id), label: String(p.label || p.id), family: 'manifest', version: p.version || null }));
  }
  function builtinRows() {
    const m = P();
    if (!m || typeof m.providerIds !== 'function') return [];
    let ids = [], defs = {};
    try { ids = m.providerIds('browser-engine'); defs = m.defs(); } catch { return []; }
    return ids.map((id) => ({ id: 'builtin.' + id, label: String((defs[id] && defs[id].label) || id), family: 'builtin', version: null, own: id }));
  }
  function rows() {
    const seen = new Set();
    return [...manifestRows(), ...builtinRows()].filter((r) => !seen.has(r.id) && seen.add(r.id)).map(({ own, ...r }) => r);
  }
  async function askManifest(row, verb, input) {
    const v = BE.ENGINE_VERBS[verb];
    const l = L();
    if (!l || typeof l.askRoute !== 'function') return BE.missingOf({ id: row.id });
    let reply;
    try { reply = await l.askRoute(row.id, { method: v.method, path: v.path, query: v.method === 'GET' ? stringQuery(input) : {}, body: v.method === 'POST' ? input : null }, ...(timeoutMs ? [timeoutMs] : [])); }
    catch (e) {
      if (e && e.status === 504) return BE.unansweredOf({ id: row.id, label: row.label, ms: timeoutMs || 30000 });
      return BE.missingOf({ id: row.id });
    }
    return BE.engineAnswerVerdict(verb, reply, { id: row.id, label: row.label });
  }
  async function askBuiltin(row, verb, input) {
    const m = P();
    let body;
    try { body = await m.capVerb(row.id.slice('builtin.'.length), 'browser-engine', verb)(input); }
    catch (e) { return { ok: false, code: 'browser_engine_protocol', error: `${BE.engineWords(row)} failed its ${verb} (${String(e && e.message).slice(0, 160)})` }; }
    return BE.engineAnswerVerdict(verb, { status: body && body.status ? body.status : 200, body: body && body.status ? body.body : body }, { id: row.id, label: row.label });
  }
  function providerFor(id) {
    const row = rows().find((r) => r.id === String(id || ''));
    if (!row) return null;
    const via = row.family === 'builtin' ? askBuiltin : askManifest;
    return { ...row, probe: (input = {}) => via(row, 'probe', input), launchOptions: (input = {}) => via(row, 'launchOptions', input) };
  }
  function kernelPath(id) { return dataDir && BE.ID_RE.test(String(id || '')) ? path.join(dataDir, 'plugins-state', String(id), 'kernel', tag, 'chrome') : null; }
  async function probe(id) {
    const pv = providerFor(id);
    if (!pv) return BE.missingOf({ id });
    const want = kernelPath(id);
    const r = await pv.probe({ binaryPath: want || '', platform: BE.platformOf(platform) });
    if (!r.ok) return r;
    // the kernel VibeSpace resolved is the one judged — a plugin answering ANOTHER program (its own env, its own layout) is refused
    if (want && r.fact.binaryPath !== want) return { ok: false, code: 'browser_engine_protocol', error: `${BE.engineWords(pv)} answered its probe about another program than the kernel VibeSpace placed for it — it must judge the path it is handed` };
    return { ok: true, fact: { ...r.fact, label: pv.label } };
  }
  async function launchOptions(id, input = {}) {
    const pv = providerFor(id);
    if (!pv) return BE.missingOf({ id });
    return pv.launchOptions({ platform: BE.platformOf(platform), ...input });
  }
  return { rows, providerFor, probe, launchOptions, kernelPath, tag };
}
/** A GET's query values are strings (express parses them so) — the probe input as one. */
function stringQuery(o) { const q = {}; for (const [k, v] of Object.entries(o || {})) if (v != null && v !== '') q[k] = String(v); return q; }

module.exports = { create };
