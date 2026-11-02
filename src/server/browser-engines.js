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
 *                            `{ok:true, fact}` | `{ok:false, code, error}` (src/browser-engines.js engineAnswerVerdict;
 *                            lane engine-spi-egress: judged with the manifest's `contributes.settings` — an engine declaring
 *                            `egress-allowlist` needs its reserved `egressAllowlist` string row there)
 *   launchOptions(id, x)   → `{ok:true, launch:{executablePath, args, env}}` | a refusal by name
 *   sourceOf(id)           → lane engine-spi-egress L1b: `{ok, source: 'download' | 'user'}` — kernel.json in its package, or the
 *                            RESERVED program row `executablePath` (both ⇒ browser_engine_protocol); binaryPathOf(id) → `{source,
 *                            path}` (user: the owner's `plugin.<id>.executablePath`, read live; download: kernelPath). A user
 *                            program is JUDGED HERE (the plugin's process cannot read that path): its probe's installed / executable
 *                            are overlaid with the core's verdict (browser-builds fileFact + the 4-byte magic, PURE userBinaryVerdict)
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
const fsp = require('fs').promises;
const BE = require('../browser-engines.js');
const BB = require('../browser-builds.js'); // lane engine-spi-egress L1b: fileFact — the file verdict a build pin already uses
const DOOR = require('../mount-door'); // B-afc4: the blocked-path door — asked BEFORE the owner's program (a user-path) is read

function create({ loader = null, plugins = null, dataDir = null, platform = process.platform, arch = process.arch, timeoutMs = null, log = console, setting = () => undefined } = {}) {
  const L = () => { try { return typeof loader === 'function' ? loader() : loader; } catch { return null; } };
  const P = () => { try { return typeof plugins === 'function' ? plugins() : plugins; } catch { return null; } };
  const tag = `${BE.platformOf(platform)}-${arch === 'x64' ? 'x64' : String(arch || 'x64')}`;
  function manifestRows() {
    const l = L();
    let list = [];
    try { list = l && typeof l.list === 'function' ? l.list() : []; } catch (e) { log.warn?.(`[browser] the plugin list could not be read for the engine table (${e && e.message})`); }
    return list.filter((p) => p && p.valid && p.contributes && p.contributes.browserEngine === true && p.enabled && p.trusted && p.state === 'running' && BE.ID_RE.test(String(p.id || '')))
      .map((p) => ({ id: String(p.id), label: String(p.label || p.id), family: 'manifest', version: p.version || null, settings: Array.isArray(p.contributes.settings) ? p.contributes.settings : [] }));
  }
  function builtinRows() {
    const m = P();
    if (!m || typeof m.providerIds !== 'function') return [];
    let ids = [], defs = {};
    try { ids = m.providerIds('browser-engine'); defs = m.defs(); } catch { return []; }
    return ids.map((id) => ({ id: 'builtin.' + id, label: String((defs[id] && defs[id].label) || id), family: 'builtin', version: null, own: id }));
  }
  function tableRows() {
    const seen = new Set();
    return [...manifestRows(), ...builtinRows()].filter((r) => !seen.has(r.id) && seen.add(r.id));
  }
  function rows() { return tableRows().map(({ own, settings, ...r }) => r); }
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
    return BE.engineAnswerVerdict(verb, reply, { id: row.id, label: row.label, settings: row.settings });
  }
  async function askBuiltin(row, verb, input) {
    const m = P();
    let body;
    try { body = await m.capVerb(row.id.slice('builtin.'.length), 'browser-engine', verb)(input); }
    catch (e) { return { ok: false, code: 'browser_engine_protocol', error: `${BE.engineWords(row)} failed its ${verb} (${String(e && e.message).slice(0, 160)})` }; }
    return BE.engineAnswerVerdict(verb, { status: body && body.status ? body.status : 200, body: body && body.status ? body.body : body }, { id: row.id, label: row.label });
  }
  function providerFor(id) {
    const row = tableRows().find((r) => r.id === String(id || ''));
    if (!row) return null;
    const via = row.family === 'builtin' ? askBuiltin : askManifest;
    const { own, settings, ...pub } = row;
    return { ...pub, probe: (input = {}) => via(row, 'probe', input), launchOptions: (input = {}) => via(row, 'launchOptions', input) };
  }
  function kernelPath(id) { return dataDir && BE.ID_RE.test(String(id || '')) ? path.join(dataDir, 'plugins-state', String(id), 'kernel', tag, 'chrome') : null; }
  /** lane engine-spi-egress L1b: the kernel's SOURCE — the program row in the manifest, kernel.json in the package. */
  async function sourceOf(id) {
    const row = tableRows().find((r) => r.id === String(id || ''));
    if (!row) return BE.missingOf({ id });
    let kernelJson = false;
    if (dataDir && row.family === 'manifest') { try { await fsp.access(path.join(dataDir, 'plugins', row.id, 'kernel.json')); kernelJson = true; } catch { kernelJson = false; } }
    const v = BE.engineSourceOf({ row: BE.binaryRowOf(row.settings), kernelJson, id: row.id, label: row.label });
    return v.ok ? { ...v, row: BE.binaryRowOf(row.settings) } : v;
  }
  /** The owner's program path (the setting; else the row's manifest default) — '' when none is set. */
  const userPathOf = (id, row) => { let v; try { v = setting(BE.binaryRowPath(id)); } catch { v = undefined; } return String(typeof v === 'string' ? v : (row && row.default) || '').trim(); };
  async function binaryPathOf(id) {
    const s = await sourceOf(id);
    if (!s.ok) return s;
    return { ok: true, source: s.source, path: s.source === 'user' ? userPathOf(id, s.row) : kernelPath(id) };
  }
  /** THE CORE's look at the owner's program: one stat (browser-builds fileFact over it) + its first 4 bytes — never a run. */
  async function userFactOf(p) {
    if (!p || !p.startsWith('/') || /[\0\n\r]/.test(p)) return { fact: { usable: false, why: 'missing' }, magic: null };
    if (DOOR.blocked(p)) return { fact: { usable: false, why: 'blocked' }, magic: null }; // a stalled storage mount: answered, never read
    let st = null; try { st = await fsp.stat(p); } catch { st = null; }
    const fact = BB.fileFact(p, { fsImpl: { statSync: () => { if (!st) throw new Error('missing'); return st; } } });
    let magic = null;
    if (fact.usable) { let fh = null; try { fh = await fsp.open(p, 'r'); const b = Buffer.alloc(4); const { bytesRead } = await fh.read(b, 0, 4, 0); magic = b.subarray(0, bytesRead); } catch { magic = null; } finally { if (fh) await fh.close().catch(() => {}); } }
    return { fact, magic, stamp: st ? `${st.size}:${Math.round(st.mtimeMs)}` : null }; // the stamp the measure keys on (no second stat)
  }
  async function probe(id) {
    const pv = providerFor(id);
    if (!pv) return BE.missingOf({ id });
    const src = await sourceOf(id);
    if (!src.ok) return src;
    if (src.source === 'user') {
      // lane engine-spi-egress L1b: the OWNER's program — handed to the plugin (it answers protocol / kinds / features / its own
      // version word), JUDGED here: installed / executable / binaryPath are the core's, never the plugin's claim
      const want = userPathOf(id, src.row);
      const r = await pv.probe({ binaryPath: want, platform: BE.platformOf(platform) });
      if (!r.ok) return r;
      const { fact, magic, stamp } = await userFactOf(want);
      const v = BE.userBinaryVerdict({ path: want, fact, magic, platform: BE.platformOf(platform), id, label: pv.label });
      return { ok: true, fact: { ...r.fact, label: pv.label, source: 'user', binaryPath: want || null, binaryStamp: v.ok ? stamp : null, installed: !!(fact && (fact.usable || fact.why === 'not-executable')), executable: v.ok, userBinary: v.ok ? null : { code: v.code, why: v.why, error: v.error } } };
    }
    const want = kernelPath(id);
    const r = await pv.probe({ binaryPath: want || '', platform: BE.platformOf(platform) });
    if (!r.ok) return r;
    // the kernel VibeSpace resolved is the one judged — a plugin answering ANOTHER program (its own env, its own layout) is refused
    if (want && r.fact.binaryPath !== want) return { ok: false, code: 'browser_engine_protocol', error: `${BE.engineWords(pv)} answered its probe about another program than the kernel VibeSpace placed for it — it must judge the path it is handed` };
    return { ok: true, fact: { ...r.fact, label: pv.label, source: 'download' } };
  }
  async function launchOptions(id, input = {}) {
    const pv = providerFor(id);
    if (!pv) return BE.missingOf({ id });
    const lo = await pv.launchOptions({ platform: BE.platformOf(platform), ...input });
    // lane engine-spi-egress L1b (both sources): the program VibeSpace resolved is the one started — never another the plugin names
    if (lo.ok && input.binaryPath && lo.launch.executablePath !== input.binaryPath) return { ok: false, code: 'browser_engine_protocol', error: `${BE.engineWords(pv)} answered its launch with another program than the one VibeSpace resolved for it — it must start the path it is handed` };
    return lo;
  }
  return { rows, providerFor, probe, launchOptions, kernelPath, sourceOf, binaryPathOf, tag };
}
/** A GET's query values are strings (express parses them so) — the probe input as one. */
function stringQuery(o) { const q = {}; for (const [k, v] of Object.entries(o || {})) if (v != null && v !== '') q[k] = String(v); return q; }

module.exports = { create };
