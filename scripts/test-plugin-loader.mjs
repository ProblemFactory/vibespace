#!/usr/bin/env node
// Plugin Ph2 minimal (2.369.24, docs/design-harness-plugins.md §3): the manifest
// validator (PURE), and the loader against a REAL fixture plugin (the shipped
// docs/examples/hello-plugin): iframe assets under the opaque-origin sandbox
// CSP, a forked server process reached over IPC (proxied routes + agent tool),
// the generated agent-tool shim, enable/disable lifecycle, path-traversal
// refusal, invalid-manifest loudness. Plus client wiring pins.
// ②c lane engine-distribution: the fleet's engine plugin at boot (a local git repository) + D2's pre-trust — only the id the
// fleet names, only at a full commit sha, only that package — with a patched-copy RED control.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (pred, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(100); } return !!(await pred()); };

// ── ① validator matrix ──
const { validateManifest, compareVersions } = require(path.join(REPO, 'src/plugin-manifest.js'));
const base = { id: 'acme.tool', version: '1.0.0', engines: { vibespace: '2.369.24' }, client: 'iframe', server: true, contributes: { windows: [{ id: 'main', title: 'Main', entry: 'index.html' }], agentTools: [{ name: 'do', description: 'does', args: { type: 'object' } }], routes: true } };
ok(verdictOf(validateManifest(base, { hostVersion: '2.369.24' }).ok), 'a complete manifest validates');
ok(gateOf(validateManifest(base, { hostVersion: '2.369.24', folderName: 'acme.tool' }).ok) && !validateManifest(base, { folderName: 'other' }).ok, 'id must equal the folder name');
ok(!validateManifest({ ...base, id: 'Acme.Tool' }).ok && !validateManifest({ ...base, id: 'tool' }).ok, 'id is <publisher>.<name> lowercase');
ok(!validateManifest({ ...base, version: '1.0' }).ok && !validateManifest({ ...base, engines: {} }).ok, 'version + engines.vibespace are required semver');
ok(!validateManifest(base, { hostVersion: '2.300.0' }).ok && verdictOf(/requires VibeSpace ≥/.test(validateManifest(base, { hostVersion: '2.300.0' }).errors.join())), 'an older host is refused with the minimum named');
ok(!validateManifest({ ...base, contributes: { windows: [{ id: 'x', title: 'X', entry: '../secret.html' }] } }).ok, 'window entries must be relative paths inside ui/ (no ..)');
ok(!validateManifest({ ...base, server: false }).ok && verdictOf(/needs server: true/.test(validateManifest({ ...base, server: false }).errors.join())), 'agentTools/routes need server: true');
ok(!validateManifest({ ...base, client: 'none' }).ok, 'iframe windows need client: iframe');
ok(validateManifest({ ...base, icon: '<svg onload="x()"></svg>' }).manifest.icon === undefined && verdictOf(validateManifest({ ...base, icon: '<svg viewBox="0 0 1 1"/>' }).manifest.icon), 'icons: inline svg only, handlers/scripts rejected (kept as a warning, not a fatal)');
ok(gateOf(validateManifest({ ...base, contributes: { ...base.contributes, keybindings: [{ a: 1 }] } }).warnings.some((w) => /reserved/.test(w))) && !validateManifest({ ...base, contributes: { ...base.contributes, settings: { a: 1 } } }).ok, 'reserved contributions (keybindings/…) warn, never fail; settings is real since Ph4 (a non-array is an error)');
ok(compareVersions('2.369.24', '2.369.9') > 0 && compareVersions('2.369.24', '2.370.0') < 0 && compareVersions('1.0.0', '1.0.0') === 0, 'compareVersions is numeric per segment');

// ── ①b THE RESERVED-CONTRIBUTION SET IS PINNED ──
// Only keys IN that list warn; anything else is silently discarded when
// `m.contributes` is rebuilt to a fixed shape, so a plugin author following a
// design document gets NO SIGNAL AT ALL. The set is module-local, so the pin
// reads the SOURCE — and the functional half drives the validator, because a
// word in an array proves nothing about the warning a plugin author sees.
{
  const src = fs.readFileSync(path.join(REPO, 'src/plugin-manifest.js'), 'utf-8');
  const m = src.match(/const RESERVED_CONTRIBUTIONS = \[([^\]]*)\]/);
  const got = m ? m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean) : [];
  const want = ['keybindings', 'panels', 'viewers', 'commands', 'menus', 'statusChips', 'backends', 'channelAdapters'];
  ok(JSON.stringify(got) === JSON.stringify(want), 'RESERVED_CONTRIBUTIONS is exactly the declared set (adding a key without updating this list is the point)', JSON.stringify(got));
  for (const key of want) {
    const w = validateManifest({ ...base, contributes: { ...base.contributes, [key]: [{ a: 1 }] } }, { hostVersion: '2.369.24' });
    ok(gateOf(w.ok) && verdictOf(w.warnings.some((x) => x.includes(`contributes.${key}`) && /reserved/.test(x))), `contributes.${key} warns "reserved for a later phase" and never fails`, JSON.stringify(w.warnings));
    ok(w.manifest.contributes[key] === undefined, `contributes.${key} is still IGNORED (reserved names a later phase, not a live contribution point)`);
  }
  const unknown = validateManifest({ ...base, contributes: { ...base.contributes, notAThing: [{ a: 1 }] } }, { hostVersion: '2.369.24' });
  ok(gateOf(unknown.ok) && !unknown.warnings.some((x) => /notAThing/.test(x)), 'NEGATIVE CONTROL: an UNRESERVED key is dropped with no warning — which is exactly why `channelAdapters` had to be added to the list');
}

// ── ② loader against the shipped example plugin ──
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plug-'));
const pdir = path.join(root, 'data', 'plugins', 'example.hello');
fs.cpSync(path.join(REPO, 'docs/examples/hello-plugin'), pdir, { recursive: true });
fs.mkdirSync(path.join(root, 'data', 'plugins', 'broken.one'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'plugins', 'broken.one', 'vibespace-plugin.json'), JSON.stringify({ id: 'broken.one', version: 'nope' }));
const express = require(path.join(REPO, 'node_modules/express'));
const app = express();
app.use(express.json({ limit: '1mb' }));
const broadcasts = [];
const sessions = new Map([['sess-1', { agentToken: 'vsst_ok' }]]);
const { create } = require(path.join(REPO, 'src/server/plugin-loader.js'));
const loader = create({ rootDir: root, app, hostVersion: '2.369.24', log: { log() {}, warn() {} }, broadcast: (m) => broadcasts.push(m), agentEnv: () => ({ PATH: process.env.PATH }),
  agentAuth: (req) => { const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''); for (const [id, s] of sessions) if (s.agentToken === tok) return { sessionId: id }; return null; } });
const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base_ = `http://127.0.0.1:${srv.address().port}`;
const j = async (p, opt) => { const r = await fetch(base_ + p, opt); let b = null; try { b = await r.clone().json(); } catch { b = await r.text(); } return { status: r.status, headers: r.headers, body: b }; };

let m = await j('/api/plugins/manifests');
ok(m.status === 200 && verdictOf(m.body.plugins.some((p) => p.id === 'example.hello' && p.valid && !p.enabled)), 'manifests lists the example plugin (valid, disabled by default)');
ok(verdictOf(m.body.plugins.some((p) => p.id === 'broken.one' && !p.valid && p.errors.length)), 'an invalid manifest is listed LOUDLY with its errors (never silently skipped)');
ok((await j('/plugins/example.hello/index.html')).status === 404, 'assets are 404 while disabled');
// contributed agent tools are a declared capability since 2.369.43 (the shim is
// a program on every session's PATH, outside the plugin sandbox) → consent gate
const noConsent = await j('/api/plugins/manifests/example.hello/enabled', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
ok(noConsent.status === 409 && noConsent.body.consentRequired === true && verdictOf(noConsent.body.capabilities.some((c) => c.id === 'agent-tools')), 'a plugin contributing agent tools cannot be enabled without consent (409 naming the tools)', noConsent.body);
const en = await j('/api/plugins/manifests/example.hello/enabled', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true, trusted: true }) });
ok(en.status === 200 && verdictOf(en.body.plugin.enabled), 'enable persists and starts the plugin');
ok(verdictOf(fs.existsSync(path.join(root, 'data', 'plugin-registry.json'))), 'registry is written atomically to data/plugin-registry.json');
ok(verdictOf(await waitFor(async () => (await j('/api/plugins/manifests')).body.plugins.find((p) => p.id === 'example.hello').state === 'running')), 'the forked server process says hello → state running');
ok(verdictOf(broadcasts.some((b) => b.type === 'plugins-manifests-updated')), 'every change broadcasts plugins-manifests-updated (multi-client law)');
const asset = await j('/plugins/example.hello/index.html');
ok(asset.status === 200 && gateOf(/^sandbox allow-scripts/.test(asset.headers.get('content-security-policy') || '')) && !/allow-same-origin/.test(asset.headers.get('content-security-policy') || ''), 'iframe assets ride the opaque-origin sandbox CSP (never allow-same-origin)');
ok(gateOf(/text\/html/.test(asset.headers.get('content-type') || '')) && asset.headers.get('cache-control') === 'no-cache', 'assets carry a real content-type and no-cache');
ok((await j('/plugins/example.hello/../../plugin-registry.json')).status !== 200 && (await j('/plugins/example.hello/..%2F..%2Fplugin-registry.json')).status !== 200, 'path traversal out of ui/ is refused');
ok((await j('/plugins/example.hello/nope.html')).status === 404, 'missing asset → 404');
const ping = await j('/api/plugins/example.hello/x/ping');
ok(ping.status === 200 && ping.body.pong === true, 'proxied route reaches the plugin process over IPC (GET /x/ping)');
const c1 = await j('/api/plugins/example.hello/x/count', { method: 'POST' }); const c2 = await j('/api/plugins/example.hello/x/count', { method: 'POST' });
ok(c1.body.count === 1 && c2.body.count === 2, 'the plugin keeps state in its own VIBESPACE_PLUGIN_DATA dir (POST /x/count increments)');
ok((await j('/api/plugins/example.hello/x/missing')).status === 404, 'unknown plugin route → the plugin answers 404');
const tool = await j('/api/agent/plugin-tool/example.hello/hello', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer vsst_ok' }, body: JSON.stringify({ args: { name: 'Ada' } }) });
ok(tool.status === 200 && gateOf(tool.body.ok) && gateOf(/hello, Ada!/.test(tool.body.output)) && verdictOf(/session sess-1/.test(tool.body.output)), 'agent tool call reaches the plugin with the calling session identity');
ok((await j('/api/agent/plugin-tool/example.hello/hello', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer vsst_bad' }, body: '{}' })).status === 401, 'an unknown vsst_ token is refused (the route is cookie-exempt, so it MUST validate the bearer)');
const shim = path.join(root, 'data', 'bin', 'vibespace-tool-example.hello-hello');
ok(gateOf(fs.existsSync(shim)) && (fs.statSync(shim).mode & 0o111) !== 0, 'an executable agent-tool shim is generated in data/bin');
const help = spawnSync(process.execPath, [shim, '--help'], { encoding: 'utf8' });
ok(help.status === 0 && verdictOf(/greeting/.test(help.stdout)), 'the shim explains itself (--help prints the manifest description + args)');
// async: the shim calls THIS process's server — a sync spawn would deadlock the event loop
const run = await new Promise((r) => execFile(process.execPath, [shim, '--name', 'Grace'], { encoding: 'utf8', env: { PATH: process.env.PATH, VIBESPACE_API: base_, VIBESPACE_SESSION_TOKEN: 'vsst_ok' } }, (err, stdout, stderr) => r({ status: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })));
ok(run.status === 0 && verdictOf(/hello, Grace!/.test(run.stdout)), `the shim posts to the host with the session token and prints the output (${JSON.stringify(run.stdout.trim().slice(0, 60))})`);
const noEnv = spawnSync(process.execPath, [shim, '--name', 'x'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
ok(noEnv.status === 3 && verdictOf(/not inside a VibeSpace session/.test(noEnv.stderr)), 'outside a session the shim fails loudly');
const dis = await j('/api/plugins/manifests/example.hello/enabled', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
ok(dis.status === 200 && !dis.body.plugin.enabled, 'disable persists');
ok(verdictOf(await waitFor(async () => (await j('/api/plugins/manifests')).body.plugins.find((p) => p.id === 'example.hello').state === 'stopped')), 'the plugin process is stopped on disable');
ok((await j('/plugins/example.hello/index.html')).status === 404 && (await j('/api/plugins/example.hello/x/ping')).status === 404 && !fs.existsSync(shim), 'disabled: assets 404, routes 404, shim removed');
ok((await j('/api/plugins/manifests/broken.one/enabled', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) })).status === 400, 'an invalid plugin cannot be enabled (400 with the errors)');
ok((await j('/api/plugins/manifests/nope.nope/enabled', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"enabled":true}' })).status === 404, 'unknown id → 404');
loader.shutdown(); srv.close();
try { fs.rmSync(root, { recursive: true, force: true }); } catch {}

// ── ②b lane engine-plugin: a BROWSER ENGINE plugin (design-custom-browser-plugin §1.1) ──
{
  const M = require(path.join(REPO, 'src/plugin-manifest.js'));
  const eb = { id: 'acme.engine', version: '1.0.0', engines: { vibespace: '2.369.24' }, client: 'none', server: true, contributes: { routes: true, browserEngine: true }, capabilities: { server: {} } };
  const v = M.validateManifest(eb, { hostVersion: '2.369.24' });
  ok(gateOf(v.ok) && v.manifest.contributes.browserEngine === true && gateOf(M.needsConsent(v.manifest)) && verdictOf(M.capabilitySummary(v.manifest).some((c) => c.id === 'browser-engine')), 'contributes.browserEngine with server + routes validates, ALWAYS needs consent, and the consent dialog names it (browser-engine)', JSON.stringify(v.errors));
  const ns = M.validateManifest({ ...eb, server: false }), nr = M.validateManifest({ ...eb, contributes: { browserEngine: true } }), nb = M.validateManifest({ ...eb, contributes: { routes: true, browserEngine: 'yes' } });
  ok(!ns.ok && gateOf(ns.errors.some((e) => /browserEngine needs server: true/.test(e))) && !nr.ok && gateOf(nr.errors.some((e) => /browserEngine needs contributes\.routes: true/.test(e))) && !nb.ok && verdictOf(nb.errors.some((e) => /browserEngine must be true\|false/.test(e))), 'refused BY NAME without its process, without its routes, or as anything but a boolean', JSON.stringify([ns.errors, nr.errors, nb.errors]));
  const plain = M.validateManifest({ ...eb, contributes: { routes: true } }).manifest, off = M.validateManifest({ ...eb, contributes: { routes: true, browserEngine: false } }).manifest;
  // lane engine-spi-egress: the fixture's EGRESS VARIANT — a valid engine manifest whose contributes.settings carries the RESERVED
  // row the engine table reads for `egress-allowlist` (a string `egressAllowlist`); without it the table finds none
  const gm = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin-egress/vibespace-plugin.json'), 'utf8'));
  const gv = M.validateManifest(gm), BEg0 = require(path.join(REPO, 'src/browser-engines.js'));
  const BEg = { EGRESS_ROW_KEY: BEg0.EGRESS_ROW_KEY, egressRowOf: BEg0.egressRowOf || (() => undefined), egressRowPath: BEg0.egressRowPath || (() => '') }, ERD = M.egressRowDeclared || (() => undefined); // a tree without them: ✗ by name
  const gNone = M.validateManifest({ ...gm, contributes: { ...gm.contributes, settings: [] } }), gSel = M.validateManifest({ ...gm, contributes: { ...gm.contributes, settings: [{ key: 'egressAllowlist', type: 'select', default: 'a', label: 'Sites', options: ['a'] }] } });
  ok(gateOf(gv.ok) && gv.manifest.contributes.browserEngine === true && gateOf(M.needsConsent(gv.manifest)) && JSON.stringify(BEg.egressRowOf(gv.manifest.contributes.settings)) === JSON.stringify({ default: '' }) && BEg.egressRowPath(gm.id) === 'plugin.vibespace.egress-engine.egressAllowlist'
    && gateOf(gNone.ok) && BEg.egressRowOf(gNone.manifest.contributes.settings) === null && gateOf(gSel.ok) && BEg.egressRowOf(gSel.manifest.contributes.settings) === null,
    'lane engine-spi-egress: the egress variant validates (an engine, consent needed) and its settings carry the RESERVED string row egressAllowlist (plugin.<id>.egressAllowlist); none / a select ⇒ no reserved row (the probe is then refused by name)', JSON.stringify(gv.errors));
  const kHash = M.capabilitiesHash(M.validateManifest(JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin/vibespace-plugin.json'), 'utf8'))).manifest);
  ok(M.capabilitiesHash(gv.manifest) !== M.capabilitiesHash(gNone.manifest) && M.capabilitiesHash(gSel.manifest) === M.capabilitiesHash(gNone.manifest) && kHash === '5ccb5cf0d1d753eb' && ERD(gv.manifest) === true && ERD(gNone.manifest) === false
    && gateOf(M.capabilitySummary(gv.manifest).some((c) => c.id === 'egress-allowlist')) && !M.capabilitySummary(gNone.manifest).some((c) => c.id === 'egress-allowlist') && BEg.EGRESS_ROW_KEY === 'egressAllowlist',
    'L2 acceptance (A): consent COVERS the reserved row — an engine declaring it hashes differently (a later version dropping it drifts: untrusted until re-enabled) and the consent dialog says its browser reaches only the listed sites; a manifest without it hashes as before (the fixture kernel\'s hash = 5ccb5cf0d1d753eb, measured on 63f59d572 — every existing trust kept)', { kHash });
  // lane engine-spi-egress L1b: the fixture's USER VARIANT — the reserved PROGRAM row (a string executablePath; a manifest settings row
  // carries no `path` field — that is a built-in table's legacy spelling); consent names it and its hash covers it
  const um = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin-user/vibespace-plugin.json'), 'utf8'));
  const uv = M.validateManifest(um), uNone = M.validateManifest({ ...um, contributes: { ...um.contributes, settings: um.contributes.settings.filter((s) => s.key !== 'executablePath') } });
  const uPath = M.validateManifest({ ...um, contributes: { ...um.contributes, settings: um.contributes.settings.map((s) => (s.key === 'executablePath' ? { ...s, path: 'browser.someLegacy', description: 'x'.repeat(400) } : s)) } });
  const BRD = M.binaryRowDeclared || (() => undefined), uRow = uPath.ok ? uPath.manifest.contributes.settings.find((s) => s.key === 'executablePath') : null;
  ok(gateOf(uv.ok) && BRD(uv.manifest) === true && BRD(uNone.manifest) === false && gateOf(M.capabilitySummary(uv.manifest).some((c) => c.id === 'user-binary' && /Runs the program you name in its settings/.test(c.text))) && M.capabilitiesHash(uv.manifest) !== M.capabilitiesHash(uNone.manifest)
    && gateOf(uRow) && !('path' in uRow) && uRow.description.length <= 300 && uRow.type === 'string',
    'lane engine-spi-egress L1b: the user variant validates; its RESERVED program row (a string executablePath — no `path` field rides a manifest row, a description cut to 300) is declared, consent says «Runs the program you name in its settings…» and its hash covers the row (a version adding or dropping it drifts)', JSON.stringify(uv.errors));
  // L1b r2 MAJOR 1: a plugin never names the program it runs — an ENGINE's program row carrying a default is REFUSED by name ('' or none
  // is the only default); the row is reserved for engines only (another plugin's string row of that name keeps its default)
  const uDef = (d) => M.validateManifest({ ...um, contributes: { ...um.contributes, settings: um.contributes.settings.map((s) => (s.key === 'executablePath' ? { ...s, default: d } : s)) } });
  const uNoDef = M.validateManifest({ ...um, contributes: { ...um.contributes, settings: um.contributes.settings.map((s) => { if (s.key !== 'executablePath') return s; const { default: _d, ...o } = s; return o; }) } });
  const dTrue = uDef('/usr/bin/true'), dSpace = uDef(' '), dEmpty = uDef('');
  const notEngine = M.validateManifest({ id: 'acme.tool', version: '1.0.0', engines: { vibespace: '2.369.24' }, client: 'none', contributes: { settings: [{ key: 'executablePath', type: 'string', default: '/usr/bin/true', label: 'Tool' }] } });
  ok(!dTrue.ok && gateOf(dTrue.errors.some((e) => /a plugin never names the program it runs; the executablePath row may not carry a default/.test(e))) && !dSpace.ok && gateOf(dEmpty.ok) && gateOf(uNoDef.ok) && verdictOf(notEngine.ok),
    'L1b r2 MAJOR 1: an engine\'s program row with a default (\'/usr/bin/true\', even \' \') ⇒ REFUSED by name «a plugin never names the program it runs; the executablePath row may not carry a default»; \'\' or no default validates; a non-engine plugin\'s row of that name is not the reserved one', { dTrue: dTrue.errors, dSpace: dSpace.errors });
  ok(off.contributes.browserEngine === undefined && M.capabilitiesHash(off) === M.capabilitiesHash(plain) && M.capabilitiesHash(v.manifest) !== M.capabilitiesHash(plain) && !M.needsConsent(plain), 'false = not an engine (named only when true): every capabilities hash before this lane stays the same — an existing trust is never voided — and growing into an engine re-asks consent');
}
{
  const eroot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plug-eng-'));
  const EID = 'vibespace.custom-browser';
  fs.cpSync(path.join(REPO, 'scripts/fixtures/engine-plugin'), path.join(eroot, 'data', 'plugins', EID), { recursive: true });
  const expressE = require(path.join(REPO, 'node_modules/express'));
  const le = create({ rootDir: eroot, app: expressE(), hostVersion: '2.369.356', log: { log() {}, warn() {} }, agentEnv: () => ({ PATH: process.env.PATH }) });
  const reg = require(path.join(REPO, 'src/server/browser-engines.js')).create({ loader: le, dataDir: path.join(eroot, 'data') });
  const row = () => le.list().find((p) => p.id === EID);
  ok(gateOf(row()) && gateOf(row().valid) && row().contributes.browserEngine === true && gateOf(row().needsConsent) && !row().enabled && reg.rows().length === 0, 'the fixture engine plugin is listed (valid, an engine, consent needed) — and NOT in the engine table while disabled');
  let refused = null; try { le.setEnabled(EID, true); } catch (e) { refused = e; }
  ok(gateOf(refused) && refused.status === 409 && reg.rows().length === 0, 'enabling it without consent is refused (409) — the table stays empty');
  le.setEnabled(EID, true, { trusted: true });
  ok(row().state !== 'running' ? reg.rows().length === 0 : true, 'enabled + trusted but its process not up yet ⇒ not in the table (state is part of the rule)');
  ok(verdictOf(await waitFor(() => reg.rows().length === 1)), 'enabled + trusted + RUNNING ⇒ in the engine table');
  const pr = await le.askRoute(EID, { method: 'GET', path: '/probe', query: { binaryPath: '/nonexistent/chrome' } });
  ok(pr.status === 200 && pr.body.installed === false && pr.body.binaryPath === '/nonexistent/chrome', 'askRoute: ONE IPC route ask (GET /probe) answers about the path it was handed', JSON.stringify(pr));
  let r404 = null; try { await le.askRoute('nope.nope', { path: '/probe' }); } catch (e) { r404 = e; }
  ok(gateOf(r404) && r404.status === 404, 'askRoute of a plugin that is not there ⇒ refused (404), never a hang');
  le.get(EID).child.kill('SIGKILL');
  ok(verdictOf(await waitFor(() => row().state === 'crashed' && reg.rows().length === 0, 3000)), 'its process dies ⇒ out of the table at once (not running)');
  ok(verdictOf(await waitFor(() => reg.rows().length === 1, 8000)), '…restarted by the loader ⇒ back in');
  le.setEnabled(EID, false);
  ok(reg.rows().length === 0, 'disabled ⇒ out of the table at once');
  le.shutdown();
  try { fs.rmSync(eroot, { recursive: true, force: true }); } catch {}
}

// ── ②b' lane engine-spi-egress L1b r2: THE REAL LOADER over the two reserved rows (no process started — autoStart off) ──
// (A) a trusted engine whose next version DROPS its site-list row ⇒ untrusted AND switched off (`enabled === false`), said; (MAJOR 1) a
// trusted engine whose next version gives its program row a DEFAULT ⇒ invalid, switched off with the refusal's own words (fail closed)
{
  const droot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plug-drift-'));
  const put = (id, man) => { const d = path.join(droot, 'data', 'plugins', id); fs.mkdirSync(d, { recursive: true }); fs.copyFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin/server.js'), path.join(d, 'server.js')); fs.writeFileSync(path.join(d, 'vibespace-plugin.json'), JSON.stringify(man)); };
  const gm0 = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin-egress/vibespace-plugin.json'), 'utf8'));
  const um0 = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin-user/vibespace-plugin.json'), 'utf8'));
  put(gm0.id, gm0); put(um0.id, um0);
  const ld = create({ rootDir: droot, app: null, autoStart: false, hostVersion: '2.369.356', log: { log() {}, warn() {} } });
  const rowD = (id) => ld.list().find((p) => p.id === id) || {};
  ld.setEnabled(gm0.id, true, { trusted: true }); ld.setEnabled(um0.id, true, { trusted: true });
  const before = [rowD(gm0.id).enabled, rowD(um0.id).enabled];
  put(gm0.id, { ...gm0, version: '0.0.2', contributes: { ...gm0.contributes, settings: [] } });
  put(um0.id, { ...um0, version: '0.0.2', contributes: { ...um0.contributes, settings: um0.contributes.settings.map((s) => (s.key === 'executablePath' ? { ...s, default: '/usr/bin/true' } : s)) } });
  ld.reload();
  const g2 = rowD(gm0.id), u2 = rowD(um0.id);
  ok(gateOf(before.every((x) => x === true)) && g2.enabled === false && !ld.isTrusted(gm0.id) && verdictOf(/capabilities changed since you trusted this plugin/.test(String(g2.notice || ''))),
    'L2 acceptance (A), through the REAL loader: a trusted engine whose next version drops its site-list row is SWITCHED OFF (enabled === false), untrusted, «capabilities changed since you trusted this plugin»', { before, enabled: g2.enabled, notice: g2.notice });
  ok(u2.enabled === false && u2.valid === false && verdictOf((u2.errors || []).some((e) => /a plugin never names the program it runs; the executablePath row may not carry a default/.test(e))),
    'L1b r2 MAJOR 1, through the REAL loader: a trusted engine whose next version names a program in its row\'s default is INVALID and switched off (enabled === false) with the refusal\'s own words — fail closed, never a program the plugin chose', { enabled: u2.enabled, valid: u2.valid, errors: u2.errors });
  ld.shutdown();
  try { fs.rmSync(droot, { recursive: true, force: true }); } catch {}
}

// ── ②c lane engine-distribution: THE FLEET'S ENGINE PLUGIN AT BOOT + D2 (the cluster's pre-trust) ──
// The REAL engine-distribution boot job over the REAL loader; its git source = a local bare repository holding the fixture
// engine plugin at two commits (scripts/fixtures/git-repo.mjs — a recording git). D2: trusted by the fleet ONLY for the id
// fleet.json names, ONLY at a full commit sha the clone arrived at, ONLY while the package is that contentHash.
{
  const { gitRepoFixture, URL_HTTPS } = await import('./fixtures/git-repo.mjs');
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const EID = 'vibespace.custom-browser';
  const groot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plug-fleet-'));
  const man = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin/vibespace-plugin.json'), 'utf8'));
  const srvJs = fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin/server.js'), 'utf8');
  const FX = gitRepoFixture(path.join(groot, 'repo'), [{ files: { 'vibespace-plugin.json': { ...man, version: '0.1.1' }, 'server.js': srvJs }, tag: 'v0.1.1' }, { files: { 'vibespace-plugin.json': { ...man, version: '0.1.2' } }, tag: 'v0.1.2' }]);
  const [shaA, shaB] = FX.shas;
  const R0 = path.join(groot, 'root'); fs.mkdirSync(path.join(R0, 'data', 'plugins'), { recursive: true });
  let fleet = null;
  const todosF = [];
  const expressF = require(path.join(REPO, 'node_modules/express'));
  const appF = expressF();
  const quiet = { log() {}, warn() {} };
  let EDF = null;
  const lf = create({ rootDir: R0, app: appF, hostVersion: '2.369.356', log: quiet, agentEnv: () => ({ PATH: process.env.PATH }), gitBin: FX.WRAP, integrations: () => null, fleetEngine: () => fleet, fleetStatus: () => (EDF ? EDF.fleetView() : null) });
  const srvF = await new Promise((r) => { const s = appF.listen(0, '127.0.0.1', () => r(s)); });
  const regF = require(path.join(REPO, 'src/server/browser-engines.js')).create({ loader: lf, dataDir: path.join(R0, 'data') });
  EDF = require(path.join(REPO, 'src/server/engine-distribution.js')).create({ dataDir: path.join(R0, 'data'), engines: regF, loader: lf, fleetFacts: () => (fleet ? { browserEngine: fleet } : null), userTodos: { add: (k, item) => { todosF.push(item); return 'u' + todosF.length; } }, log: quiet });
  const rowF = () => lf.list().find((p) => p.id === EID);
  const fetches = () => FX.calls().filter((c) => c.argv.includes('fetch'));
  const regFile = () => JSON.parse(fs.readFileSync(path.join(R0, 'data', 'plugin-registry.json'), 'utf8'));
  // ① a fleet with no engine ⇒ nothing; ② the fleet names the plugin at a FULL sha ⇒ installed from git, trusted BY THE FLEET, enabled, running
  const r0 = await EDF.bootFleet();
  ok(gateOf(r0.skipped) && !rowF() && !fetches().length, 'no fleet engine ⇒ the boot job does nothing (no git call)');
  fleet = { plugin: EID, default: false, preinstall: false, source: { git: URL_HTTPS, ref: shaA }, kernel: { url: '', sha256: '' } };
  const r1 = await EDF.bootFleet();
  const t1 = regFile().trust[EID];
  ok(gateOf(r1.ok) && r1.outcome === 'installed' && gateOf(rowF()) && rowF().version === '0.1.1' && gateOf(rowF().trusted) && rowF().trustedBy === 'fleet' && gateOf(rowF().enabled) && !rowF().consentRequired && rowF().install.by === 'fleet' && rowF().install.sha === shaA && t1.by === 'fleet' && t1.sha === shaA && t1.contentHash === regFile().installs[EID].contentHash,
    'D2: the fleet\'s plugin at a full sha ⇒ installed from git, trust {by:\'fleet\', sha, contentHash} — enabled with no dialog (the panel says «Installed and trusted by the cluster»)', { row: rowF() && { trustedBy: rowF().trustedBy, enabled: rowF().enabled }, t1 });
  ok(verdictOf(await waitFor(() => regF.rows().length === 1, 8000)), '…its process runs ⇒ it is in the engine table');
  // ③ every boot compares the record and never re-pulls the same; a moved pin installs the new sha
  const n1 = fetches().length;
  const r2 = await EDF.bootFleet();
  ok(r2.outcome === 'same' && fetches().length === n1, 'a boot with the same {source, ref} as the record ⇒ no git call (compare, never re-pull)');
  fleet = { ...fleet, source: { git: URL_HTTPS, ref: shaB } };
  const r3 = await EDF.bootFleet();
  ok(r3.outcome === 'updated' && r3.plugin === EID && rowF().install.prevSha === shaA && fetches().length === n1 + 1 && fetches().at(-1).argv.at(-1) === shaB && rowF().version === '0.1.2' && rowF().trustedBy === 'fleet' && regFile().trust[EID].sha === shaB, 'the fleet moves its pin ⇒ the boot installs THAT sha («updated», the record keeps the sha it moved from — lane fleet-plugin-catalog), and the fleet\'s trust moves to it');
  // ④ a TAG is never the trust anchor: installed, the owner asked once
  fleet = { ...fleet, source: { git: URL_HTTPS, ref: 'v0.1.1' } };
  const r4 = await EDF.bootFleet();
  ok(r4.outcome === 'unpinned' && EDF.fleetView().code === 'fleet_ref_not_sha' && rowF().version === '0.1.1' && !rowF().trusted && rowF().trustedBy === null && gateOf(rowF().consentRequired) && !rowF().enabled, 'a fleet ref that is a TAG ⇒ installed but NOT pre-trusted (a tag can move — only a sha anchors D2): disabled, the owner enables it; the run says it by name (outcome «unpinned», fleet_ref_not_sha — lane fleet-plugin-catalog)', rowF() && { trusted: rowF().trusted, enabled: rowF().enabled });
  fleet = { ...fleet, source: { git: URL_HTTPS, ref: shaA } };
  await EDF.bootFleet();
  ok(rowF().trustedBy === 'fleet' && verdictOf(rowF().enabled), '…back on a sha ⇒ trusted by the fleet again');
  // ⑤ the trust LAPSES: the fleet stops naming it · the fleet names another id · another package under the id
  const keep = fleet;
  fleet = null;
  ok(!rowF().trusted && verdictOf(rowF().consentRequired), 'the fleet stops naming the plugin ⇒ its fleet trust no longer holds (the owner is asked)');
  fleet = { ...keep, plugin: 'acme.other' };
  ok(!rowF().trusted, 'the fleet names another plugin id ⇒ this one\'s fleet trust no longer holds');
  fleet = keep;
  ok(gateOf(rowF().trusted) && rowF().trustedBy === 'fleet', '…named again at the same sha with the same package ⇒ it holds again');
  const ins = regFile().installs[EID];
  const regRaw = regFile(); regRaw.installs[EID] = { ...ins, contentHash: 'f'.repeat(64) }; fs.writeFileSync(path.join(R0, 'data', 'plugin-registry.json'), JSON.stringify(regRaw));
  const lf2 = create({ rootDir: R0, app: null, autoStart: false, hostVersion: '2.369.356', log: quiet, fleetEngine: () => fleet });
  ok(!lf2.list().find((p) => p.id === EID).trusted, 'a record whose package is not the trusted contentHash ⇒ the fleet trust does not hold (another package under the id)');
  regRaw.installs[EID] = ins; fs.writeFileSync(path.join(R0, 'data', 'plugin-registry.json'), JSON.stringify(regRaw));
  // ⑥ the fleet names ANOTHER id while its source holds this package ⇒ installed, never trusted
  const R2 = path.join(groot, 'root2'); fs.mkdirSync(path.join(R2, 'data', 'plugins'), { recursive: true });
  let fleet2 = { plugin: 'acme.other', source: { git: URL_HTTPS, ref: shaA } };
  const lo = create({ rootDir: R2, app: null, autoStart: false, hostVersion: '2.369.356', log: quiet, gitBin: FX.WRAP, fleetEngine: () => fleet2 });
  const io = await lo.install({ source: 'git', value: URL_HTTPS, ref: shaA, credential: 'auto', by: 'fleet' });
  ok(io.plugin.id === EID && !io.plugin.trusted && io.trustedBy === null && !JSON.parse(fs.readFileSync(path.join(R2, 'data', 'plugin-registry.json'), 'utf8')).trust[EID], 'the fleet names another id ⇒ the package under THIS id is installed but never trusted by the fleet');
  // ⑦ a user's install is never fleet-trusted, whatever the fleet names
  const R3 = path.join(groot, 'root3'); fs.mkdirSync(path.join(R3, 'data', 'plugins'), { recursive: true });
  const lu = create({ rootDir: R3, app: null, autoStart: false, hostVersion: '2.369.356', log: quiet, gitBin: FX.WRAP, fleetEngine: () => fleet });
  const iu = await lu.install({ source: 'git', value: URL_HTTPS, ref: shaA, by: 'user' });
  ok(!iu.plugin.trusted && gateOf(iu.plugin.consentRequired) && iu.plugin.install.by === 'user', 'the same package installed by a PERSON still asks once (D2 is the cluster\'s install only)');
  // ⑧ a failed boot install: NAMED, ONE For-you notice, the Plugins panel's fleet line
  fleet = { ...keep, source: { git: URL_HTTPS, ref: 'v9.9.9' } };
  const r8 = await EDF.bootFleet();
  const mf = await (await fetch(`http://127.0.0.1:${srvF.address().port}/api/plugins/manifests`)).json();
  ok(!r8.ok && r8.code === 'plugin_git_ref_missing' && todosF.length === 1 && todosF[0].origin === 'plugin' && gateOf(/cluster's plugin could not be installed/.test(todosF[0].text)) && gateOf(/plugin_git_ref_missing/.test(todosF[0].detail)) && gateOf(mf.fleet) && mf.fleet.outcome === 'failed' && mf.fleet.code === 'plugin_git_ref_missing',
    'a boot install that fails ⇒ named (plugin_git_ref_missing), ONE For-you notice (origin plugin), and GET /api/plugins/manifests carries the fleet line the Plugins panel draws', { r8, todo: todosF[0], fleet: mf.fleet });
  // ⑨ preinstall ⇒ the kernel right away (this package has no kernel.json ⇒ refused by name, said once)
  fleet = { ...keep, preinstall: true };
  const r9 = await EDF.bootFleet();
  ok(gateOf(r9.ok) && gateOf(r9.kernel) && r9.kernel.ok === false && r9.kernel.code === 'browser_engine_protocol' && todosF.length === 2 && verdictOf(/browser kernel could not be downloaded/.test(todosF[1].text)), 'preinstall: true ⇒ the boot asks for the kernel right away (here: the package names no kernel.json ⇒ refused by name, ONE notice)', { kernel: r9.kernel });
  // ⑩ RED CONTROL: a loader whose D2 check forgets the id trusts the package the fleet did NOT name
  const LS = fs.readFileSync(path.join(REPO, 'src/server/plugin-loader.js'), 'utf8');
  const anchor = "const fleetTrust = !!f && f.plugin === r.id && ";
  ok(verdictOf(LS.includes(anchor)), 'control: D2\'s id check is in plugin-loader.js');
  const Lx = mutantCopies('plugin-loader-d2', REPO).load('src/server/plugin-loader.js', editAnchor(editAnchor(LS, anchor, 'const fleetTrust = !!f && ', "src/server/plugin-loader.js"), 'return !!(f && f.plugin === id && ', 'return !!(f && ', "src/server/plugin-loader.js"), 'any-id');
  const R4 = path.join(groot, 'root4'); fs.mkdirSync(path.join(R4, 'data', 'plugins'), { recursive: true });
  const lx = Lx.create({ rootDir: R4, app: null, autoStart: false, hostVersion: '2.369.356', log: quiet, gitBin: FX.WRAP, fleetEngine: () => fleet2 });
  const ix = await lx.install({ source: 'git', value: URL_HTTPS, ref: shaA, credential: 'auto', by: 'fleet' });
  ok(gateOf(ix.plugin.trusted) && ix.trustedBy === 'fleet', 'control: that copy pre-trusts a package under an id the fleet never named — exactly what ⑥ refuses (RED)');
  lf.shutdown(); srvF.close();
  try { fs.rmSync(groot, { recursive: true, force: true }); } catch {}
}
// ── ②d lane engine-spi-egress L1b: the fleet's engine plugin whose program its OWNER names (the reserved executablePath row) — the
// fleet's preinstall / kernel {url, sha256} are IGNORED with ONE journal line (no download asked, no failure kept, no For-you item) ──
{
  const { gitRepoFixture, URL_HTTPS } = await import('./fixtures/git-repo.mjs');
  const UID = 'vibespace.user-engine';
  const uroot = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plug-user-'));
  const manU = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin-user/vibespace-plugin.json'), 'utf8'));
  const srvU = fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin/server.js'), 'utf8');
  const FU = gitRepoFixture(path.join(uroot, 'repo'), [{ files: { 'vibespace-plugin.json': manU, 'server.js': srvU }, tag: 'v0.0.1' }]);
  const RU = path.join(uroot, 'root'); fs.mkdirSync(path.join(RU, 'data', 'plugins'), { recursive: true });
  let fleetU = null;
  const linesU = [], todosU = [], fetched = [];
  const qU = { log: (m) => linesU.push(String(m)), warn: (m) => linesU.push(String(m)) };
  const lu = create({ rootDir: RU, app: null, autoStart: false, hostVersion: '2.369.356', log: { log() {}, warn() {} }, gitBin: FU.WRAP, integrations: () => null, fleetEngine: () => fleetU });
  const regU = require(path.join(REPO, 'src/server/browser-engines.js')).create({ loader: lu, dataDir: path.join(RU, 'data') });
  const EDU = require(path.join(REPO, 'src/server/engine-distribution.js')).create({ dataDir: path.join(RU, 'data'), engines: regU, loader: lu, fleetFacts: () => (fleetU ? { browserEngine: fleetU } : null), userTodos: { add: (k, item) => { todosU.push(item); return 'u' + todosU.length; } }, fetchImpl: async (u) => { fetched.push(String(u)); throw new Error('no network in this leg'); }, log: qU });
  fleetU = { plugin: UID, default: false, preinstall: true, source: { git: URL_HTTPS, ref: FU.shas[0] }, kernel: { url: 'https://kernels.test/k.tar.gz', sha256: 'a'.repeat(64) } };
  const rU = await EDU.bootFleet();
  const said = linesU.filter((l) => /runs the program its owner names \(executablePath\) — the fleet's kernel \/ preinstall is ignored/.test(l));
  const kfU = EDU.kernelFact(UID);
  ok(gateOf(rU.ok) && rU.outcome === 'installed' && gateOf(rU.kernel) && rU.kernel.ignored === 'user-source' && said.length === 1 && !fetched.length && !todosU.length && kfU.state === 'absent',
    'L1b ②d: the fleet\'s engine plugin whose program its OWNER names ⇒ installed from git as before, its preinstall + kernel IGNORED with ONE journal line — nothing fetched, no failure kept, no For-you item', { rU, said: said.length, fetched, todos: todosU.length, kf: kfU.state });
  const eK = await (async () => { try { await EDU.installKernel(UID, { by: 'user' }); return null; } catch (e) { return e; } })();
  ok(gateOf(eK) && eK.code === 'engine_source_user' && gateOf(/runs the program you name in its settings/.test(eK.message)) && !fetched.length, 'L1b ②d: a person\'s download asked for it ⇒ engine_source_user by name (the route\'s 409), nothing fetched', eK && eK.message);
  try { fs.rmSync(uroot, { recursive: true, force: true }); } catch {}
}

// ── ③ wiring pins ──
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const pc = read('src/lib/plugin-client.js');
const sandboxConst = (pc.match(/const IFRAME_SANDBOX = '([^']*)'/) || [])[1] || '';
ok(gateOf(/registerWindowType\(\{/.test(pc)) && gateOf(/action: w\.action/.test(pc)) && gateOf(/sandbox', IFRAME_SANDBOX/.test(pc)) && gateOf(sandboxConst.includes('allow-scripts')) && !sandboxConst.includes('allow-same-origin'), `plugin-client registers contributed windows as window types and frames them sandboxed (never allow-same-origin): "${sandboxConst}"`);
ok(verdictOf(/plugins-manifests-updated/.test(pc)), 'plugin-client re-applies on the manifests broadcast');
const appSrc = read('src/lib/app.js');
const gearSrc = read('src/lib/gear-menu.js');
ok(gateOf(/installPluginClient\(this\)/.test(appSrc)) && verdictOf(/pluginClient\?\.contributedWindows\?\.\(\)/.test(appSrc + gearSrc)), 'app installs the plugin client and the ⚙ menu (gear-menu.js since Ph1) lists contributed windows');
const wiring = read('src/server/mounts-plugins-wiring.js');
ok(gateOf(/require\('\.\/plugin-loader\.js'\)\.create\(/.test(wiring)) && gateOf(/agentAuth: \(req\) =>/.test(wiring)) && gateOf(/sameToken\(tok, s\.agentToken\)|s\.agentToken === tok/.test(wiring)) && verdictOf(/pluginLoader\.shutdown\(\)/.test(wiring)), 'wiring creates the loader with a vsst_-validating agentAuth and shuts plugin processes down with the server');
ok(gateOf(/, activeSessions,$/m.test(read('server.js'))) && gateOf(/pluginLoader,$/m.test(read('server.js'))) && verdictOf(/const \{ agentEnv \} = require\('\.\.\/ws-handler'\);/.test(wiring)), 'server.js passes activeSessions and receives the loader; the wiring takes agentEnv from ws-handler (the ONE sanitized-env builder)');
ok(verdictOf(/'src\/plugin-manifest\.js'/.test(read('scripts/test-architecture.mjs'))), 'the manifest validator is in the PURE tier');
const pui = read('src/lib/plugins-ui.js');
ok(gateOf(/fetchJson\('\/api\/plugins\/manifests'\)/.test(pui)) && gateOf(/\/api\/plugins\/manifests\/\$\{encodeURIComponent\(p\.id\)\}\/enabled/.test(pui)) && gateOf(/manifests\/reload/.test(pui)) && verdictOf(/this\.pluginClient\?\.open\?\./.test(pui)), 'the Plugins panel lists manifest plugins with enable/disable, rescan and open-window actions');
// lane plugin-settings-p0: a manifest plugin is a LIST row — ids / errors reach the DOM as textContent / title (pluginRow has no innerHTML)
const rowFnL = pui.slice(pui.indexOf('function pluginRow('), pui.indexOf('\n}\n', pui.indexOf('function pluginRow(')));
ok(rowFnL.length > 100 && !/innerHTML/.test(rowFnL) && gateOf(/\.\.\.\(p\.errors \|\| \[\]\), p\.lastError/.test(pui)) && verdictOf(/pluginRow\(\{ id: p\.id, label: p\.label \|\| p\.id, idTip: p\.label && p\.label !== p\.id \? p\.id : ''/.test(pui)), 'manifest fields reach the panel as text (ids/errors come from disk, never trusted HTML — pluginRow: textContent / title)');
for (const dict of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) ok(verdictOf(['Installed plugins', 'Rescan', 'Plugin enabled', 'parked after repeated crashes'].every((k) => read(dict).includes(JSON.stringify(k) + ':'))), `${dict} carries the new panel strings`);
ok(gateOf(/\/api\/agent\/plugin-tool\//.test(read('src/server/plugin-loader.js'))) && verdictOf(/res\.status\(401\)/.test(read('src/server/plugin-loader.js'))), 'the tool route lives under the cookie-exempt /api/agent/ prefix and enforces the bearer itself');

// ── ⑪ B-f276 (主开发 r3305; the store census's «37 more stores judged», item 3): plugin-registry.json UNDER THE STORE-READ LAW ──
// The release read ANY failure of data/plugin-registry.json as EMPTY: every plugin OFF and UNTRUSTED, the next enable / install /
// update / uninstall wrote the file over (which plugins were on, their consents, their install sources lost), and the start's shim sync
// removed every agent tool's shim. The failure PLACED on the very read (the loader's one sync read refused EIO — never a mount, never a
// mode change), then TORN bytes. RED: the release's bare catch.
{
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const HOLD = require(path.join(REPO, 'src/store-read-hold.js'));
  const { capabilitiesHash: capHash } = require(path.join(REPO, 'src/plugin-manifest.js'));
  const quietR = { log() {}, warn() {} };
  const PID = 'example.hello';
  const scene = async (PLm, how) => {
    const R = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plugreg-'));
    const pd = path.join(R, 'data', 'plugins', PID);
    fs.cpSync(path.join(REPO, 'docs/examples/hello-plugin'), pd, { recursive: true });
    const man = validateManifest(JSON.parse(fs.readFileSync(path.join(pd, 'vibespace-plugin.json'), 'utf8')), { hostVersion: '2.369.24', folderName: PID }).manifest;
    // the person's registry: the plugin ON, its consent recorded, its install source
    const REG = { enabled: { [PID]: true }, trust: { [PID]: { trusted: true, trustedAt: 1, capabilitiesHash: capHash(man) } }, installs: { [PID]: { source: 'folder', value: '/srv/plugins/hello', contentHash: null, installedAt: 1 } } };
    const regFile = path.resolve(path.join(R, 'data', 'plugin-registry.json'));
    const bytes = how === 'torn' ? JSON.stringify(REG).slice(0, 40) : JSON.stringify(REG);
    fs.writeFileSync(regFile, bytes);
    const binDir = path.join(R, 'bin'); fs.mkdirSync(binDir, { recursive: true });
    const shim = path.join(binDir, `vibespace-tool-${PID}-hello`); fs.writeFileSync(shim, '#!/bin/sh\n');   // the last run's agent tool
    const realRead = fs.readFileSync;
    let refused = 0;
    if (how === 'refused') fs.readFileSync = function (f, ...a) { if (path.resolve(String(f)) === regFile) { refused++; throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); } return realRead.call(this, f, ...a); };
    let L;
    try { L = PLm.create({ rootDir: R, app: null, autoStart: true, hostVersion: '2.369.24', log: quietR, binDir, agentEnv: () => ({ PATH: process.env.PATH }) }); }
    finally { fs.readFileSync = realRead; }
    // torn: the copy and the lift run off the loop — waited for by the hold's own list (r3634: never a fixed sleep under load)
    if (how === 'torn') { const tw = Date.now(); while (Date.now() - tw < 5000 && !HOLD.holds().some((h) => h.file === 'plugin-registry.json' && h.torn && !h.held)) await sleep(10); }
    else await sleep(50);
    const tryIt = async (fn) => { try { await fn(); return { ok: true }; } catch (e) { return { status: e.status || null, code: (e.payload && e.payload.code) || e.code || null, msg: String(e.message || '') }; } };
    const held = typeof L.held === 'function' ? L.held() : null;
    const row = (L.list() || []).find((x) => x.id === PID) || null;
    const before = { shimKept: fs.existsSync(shim), dirKept: fs.existsSync(pd), same: realRead(regFile, 'utf8') === bytes };   // what the START did, before any press
    const tries = how === 'torn' ? {} : {
      enable: await tryIt(() => L.setEnabled(PID, true, { trusted: true })),
      off: await tryIt(() => L.setEnabled(PID, false)),
      uninstall: await tryIt(() => L.uninstall(PID)),
      update: await tryIt(() => L.update(PID)),
      install: await tryIt(() => L.install({ source: 'folder', value: pd })),
    };
    const res = {
      how, refused, held: !!held, rowEnabled: row ? row.enabled : 'none', rowTrusted: row ? row.trusted : 'none', rowHeld: !!(row && row.held), trust: L.isTrusted(PID),
      before, tries, same: realRead(regFile, 'utf8') === bytes, shimKept: fs.existsSync(shim), dirKept: fs.existsSync(pd),
      copies: fs.readdirSync(path.dirname(regFile)).filter((n) => n.startsWith('plugin-registry.json.corrupt-')).map((n) => realRead(path.join(path.dirname(regFile), n), 'utf8') === bytes),
    };
    if (how === 'refused' && held) {   // THE LIFT: the file reads again (its next try, asked now) — what the start skipped runs
      const hrow = HOLD.holds().find((h) => h.file === 'plugin-registry.json' && h.held);   // the list's row (its opaque key — r3315's helper)
      res.lifted = hrow ? await HOLD.readAgainOf(hrow) : 'no row';
      const r2 = (L.list() || []).find((x) => x.id === PID) || null;
      res.afterLift = { held: !!L.held(), enabled: r2 ? r2.enabled : 'none', trusted: r2 ? r2.trusted : 'none', same: realRead(regFile, 'utf8') === bytes, shimKept: fs.existsSync(shim) };
    }
    try { L.shutdown(); } catch { /* its own */ }
    try { fs.rmSync(R, { recursive: true, force: true }); } catch { /* gone */ }
    return res;
  };
  const refusedBy = (t) => t && t.status === 503 && t.code === 'plugin_registry_unread' && /plugin-registry\.json/.test(t.msg);
  const PLr = require(path.join(REPO, 'src/server/plugin-loader.js'));
  const a = await scene(PLr, 'refused');
  console.log(`    facts (refused read): ${JSON.stringify(a)}`);
  ok(a.refused >= 1 && gateOf(a.held) && a.rowEnabled === null && a.rowTrusted === null && gateOf(a.rowHeld) && a.trust === null,
    'B-f276 (r3305 (a)): a REFUSED read of plugin-registry.json HOLDS the registry — the plugin the file names ON and TRUSTED reads «unknown» (enabled null, trusted null, held), never «off» or «untrusted»', a);
  ok(gateOf(['enable', 'off', 'uninstall', 'update', 'install'].every((k) => refusedBy(a.tries[k]))) && gateOf(a.same) && verdictOf(a.dirKept),
    'B-f276 (r3305 (b)(c)): while held EVERY writer is refused BY NAME (503 plugin_registry_unread, its words name the file) before any side effect — enable with consent, switch off, uninstall, update, install — and the file stays byte for byte, the plugin\'s folder in place', a.tries);
  ok(gateOf(a.before.shimKept) && verdictOf(a.shimKept), 'B-f276 (r3305 (c)): the start\'s shim sync removes NO agent tool\'s shim by the registry\'s silence', a);
  ok(!!(a.lifted && a.afterLift && !a.afterLift.held && a.afterLift.enabled === true && a.afterLift.trusted === true && a.afterLift.same && a.afterLift.shimKept),
    'B-f276: THE LIFT — the file read again: the plugin is ON and TRUSTED again as the file says (what the start skipped runs), nothing was written over it', a.afterLift);
  const t = await scene(PLr, 'torn');
  console.log(`    facts (torn bytes): ${JSON.stringify(t)}`);
  ok(t.copies.length === 1 && t.copies[0] === true && gateOf(t.before.dirKept) && t.rowEnabled === false && !t.held,
    'B-f276: TORN bytes are kept aside ONCE (a copy byte for byte beside the file), then the registry starts empty — the plugin\'s folder stays where it is', t);
  ok(gateOf(t.dirKept) && !t.shimKept, 'B-f276 (r3634, the round\'s pin): a torn lift starts EMPTY as the family designed — the plugin is off, so its derived agent-tool launcher goes (written again at the next enable; kept, it would answer 404); its folder stays', { dirKept: t.dirKept, shimKept: t.shimKept });
  // RED: the release's bare catch (any failure = empty)
  const LS0 = fs.readFileSync(path.join(REPO, 'src/server/plugin-loader.js'), 'utf8');
  const relSrc = editAnchor(LS0, "  { let read; try { read = { text: fs.readFileSync(registryFile, 'utf-8') }; } catch (error) { read = { error }; } const a0 = SR.storeAnswer(read, { valid: REGISTRY_SHAPE }); if (hold.start(a0) === 'data') registry = normalize(a0.value); }",
    "  try { registry = normalize(JSON.parse(fs.readFileSync(registryFile, 'utf-8'))); } catch { } // the release: any failure = empty", 'src/server/plugin-loader.js');
  const PLx = mutantCopies('plugin-registry-bare-catch', REPO).load('src/server/plugin-loader.js', relSrc, 'bare-catch');
  const x = await scene(PLx, 'refused');
  console.log(`    facts (red): ${JSON.stringify(x)}`);
  ok(!x.held && x.rowEnabled === false && x.trust === false && !x.before.shimKept && !x.same,
    'RED CONTROL (B-f276, the release\'s bare catch): the refused read reads EMPTY — the plugin OFF and untrusted, its agent tool\'s shim REMOVED, and an enable WRITES the file over (the other consents and install sources lost)', x);
  // (a)(b)(c) THE ENGINE READERS while held (r3305: «for a browser engine plugin, never Chrome in its place»): a loader HELD as the real
  // one answers (its facts and words, its rows unknown, isTrusted null, the lift's waiters) — the engine table, the kernel's download
  // and version measure, the cluster's fleet run; then THE LIFT: the fleet run goes again by itself. RED: the release's readers
  const EIDh = 'vibespace.custom-browser';
  const engineScene = async (EDm, BEm) => {
    const R = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plugreg-eng-'));
    fs.mkdirSync(path.join(R, 'data'), { recursive: true });
    let heldNow = true, installs = 0; const lifts = [], todosH = [];
    const SL = {
      held: () => (heldNow ? { file: 'plugin-registry.json', code: 'EIO', since: 1 } : null),
      heldWords: () => (heldNow ? 'plugin-registry.json in VibeSpace\'s data folder could not be read (EIO)' : ''),
      list: () => [{ id: EIDh, valid: true, enabled: heldNow ? null : true, trusted: heldNow ? null : true, ...(heldNow ? { held: true } : {}), state: 'stopped', contributes: { browserEngine: true } }],
      isTrusted: () => (heldNow ? null : true), installRecord: () => null,
      install: async () => { installs++; throw Object.assign(new Error('the scene installs nothing'), { code: 'scene_no_install' }); },
      onLift: (fn) => { if (heldNow) lifts.push(fn); },
    };
    const BEx = BEm.create({ loader: SL, dataDir: path.join(R, 'data') });
    const fleetH = { plugin: EIDh, default: false, preinstall: false, source: { git: 'https://git.example.invalid/engine.git', ref: 'a'.repeat(40) }, kernel: { url: '', sha256: '' } };
    const EDx = EDm.create({ dataDir: path.join(R, 'data'), engines: BEx, loader: SL, fleetFacts: () => ({ browserEngine: fleetH }), userTodos: { add: (k, item) => { todosH.push(item); return 'u' + todosH.length; } }, log: quietR });
    const kp = BEx.kernelPath(EIDh); fs.mkdirSync(path.dirname(kp), { recursive: true }); fs.writeFileSync(kp, '#!/bin/sh\necho "Chromium 150.0.0.0 scene"\n', { mode: 0o755 });   // a kernel in its place
    const res = { probe: (await BEx.probe(EIDh)).code, table: BEx.rows().length, heldFact: typeof BEx.held === 'function' ? !!BEx.held() : 'no held()' };
    const fr = await EDx.bootFleet();
    res.fleet = { skipped: (fr && fr.skipped) || null, outcome: EDx.fleetView().outcome, installs, todos: todosH.length };
    try { await EDx.installKernel(EIDh); res.install = { ok: true }; } catch (e) { res.install = { code: e.code || null, consent: /consent/.test(String(e.message)) }; }
    const ms = await EDx.measure(EIDh);
    res.measure = { code: (ms && ms.code) || null, consent: /consent/.test(String(ms && ms.error)) };
    res.todosHeld = todosH.length;
    heldNow = false; const i0 = installs;   // THE LIFT — no restart, the cluster's facts unchanged
    for (const fn of lifts.splice(0)) fn();
    await sleep(50); await EDx.fleetSettled();
    res.afterLift = installs - i0;
    try { fs.rmSync(R, { recursive: true, force: true }); } catch { /* gone */ }
    return res;
  };
  const g = await engineScene(require(path.join(REPO, 'src/server/engine-distribution.js')), require(path.join(REPO, 'src/server/browser-engines.js')));
  console.log(`    facts (engines, held): ${JSON.stringify(g)}`);
  ok(g.probe === 'plugin_registry_unread' && g.table === 0 && g.heldFact === true,
    'B-f276 (r3305 (a)): while held the engine table lists no manifest engine and the probe of the engine plugin the file names answers the REGISTRY\'s own refusal (plugin_registry_unread) — never «not installed», never Chrome in its place', g);
  ok(gateOf(g.fleet.skipped) && g.fleet.outcome === 'held' && g.fleet.installs === 0 && g.fleet.todos === 0,
    'B-f276 (r3305 (c)): the cluster\'s fleet run steps aside BY NAME (outcome held) — nothing installed over the held file, no failure notice', g.fleet);
  ok(g.install.code === 'plugin_registry_unread' && !g.install.consent && g.measure.code === 'plugin_registry_unread' && !g.measure.consent && g.todosHeld === 0,
    'B-f276 (r3305 (a)(b)): the kernel\'s download and its version measure are refused by the registry\'s name — never «waiting for your consent» (no consent asked again over the held file), nothing filed', g);
  ok(g.afterLift === 1, 'B-f276: THE LIFT — the registry reads and the fleet run goes again BY ITSELF (the loader\'s onLift), no restart', g);
  const MCe = mutantCopies('plugin-registry-engines', REPO);
  const EDs0 = fs.readFileSync(path.join(REPO, 'src/server/engine-distribution.js'), 'utf8');
  const rhLine = EDs0.split('\n').find((l) => l.startsWith('  const registryHeld = () => {')) || '(the registryHeld line)';
  const EDsRel = editAnchor(editAnchor(EDs0, rhLine, '  const registryHeld = () => false; // the release: no hold to ask', 'src/server/engine-distribution.js'),
    'const t = l.isTrusted(sid); return t == null ? null : !!t;', 'return !!l.isTrusted(sid);', 'src/server/engine-distribution.js'); // stale-pins: kept (the RED's plant: the release's text)
  const BEsRel = editAnchor(fs.readFileSync(path.join(REPO, 'src/server/browser-engines.js'), 'utf8'), '    if (!pv) return heldOf(id) || BE.missingOf({ id });\n    const src = await sourceOf(id);',
    '    if (!pv) return BE.missingOf({ id });\n    const src = await sourceOf(id);', 'src/server/browser-engines.js'); // stale-pins: kept (the RED's plant: the release's text)
  const gx = await engineScene(MCe.load('src/server/engine-distribution.js', EDsRel, 'release-trust'), MCe.load('src/server/browser-engines.js', BEsRel, 'release-missing'));
  console.log(`    facts (engines, red): ${JSON.stringify(gx)}`);
  ok(gx.probe === 'browser_engine_missing' && gx.fleet.installs >= 1 && gx.install.code === 'engine_untrusted' && gateOf(gx.install.consent) && gx.measure.code === 'engine_untrusted',
    'RED CONTROL (B-f276 engines, the release\'s readers): the held registry reads as EMPTY — the engine «not installed», the fleet run INSTALLS over the held file, the download and the measure «waiting for your consent»', gx);
  // (c) THE PAGE's plugin client: a HELD list tears nothing down (a plugin theme dropped would reset the person's theme to dark and save
  // it). RED: the release's apply — the held rows read as «all off»
  const { pathToFileURL } = await import('node:url');
  const pageScene = async (url) => {
    const { PluginClient } = await import(url);
    const dropped = [], deact = [];
    const pc = Object.create(PluginClient.prototype);
    Object.assign(pc, { app: { themeManager: { unregisterPluginTheme: (k) => dropped.push(k) }, _refreshThemeDropdown() {} }, manifests: [], errors: new Map(), _applying: null, _settings: new Set(),
      _modules: new Map([[PID, { mod: { deactivate: () => { deact.push(PID); } }, ctl: new AbortController(), version: '1' }]]), _themes: new Map([[PID, new Set([`plugin-${PID}-dusk`])]]) });
    await pc.apply([{ id: PID, valid: true, enabled: null, trusted: null, held: true }]);
    return { dropped, deact, kept: pc._modules.has(PID) && pc._themes.has(PID) };
  };
  const pg = await pageScene(pathToFileURL(path.join(REPO, 'src/lib/plugin-client.js')).href);
  ok(gateOf(pg.kept) && !pg.dropped.length && !pg.deact.length, 'B-f276 (r3305 (c)): the page\'s plugin client keeps what it applied while the list is HELD — no plugin theme dropped (the person\'s theme never reset), no module deactivated', pg);
  const PCs0 = fs.readFileSync(path.join(REPO, 'src/lib/plugin-client.js'), 'utf8');
  const pcRel = editAnchor(PCs0, '    if ((meta && meta.held) || (Array.isArray(list) && list.some((m) => m && m.held))) return this._applying || Promise.resolve();   // r3634: the list\'s own hold too\n', '', 'src/lib/plugin-client.js');
  const pgx = await pageScene(pathToFileURL(MCe.write('src/lib/plugin-client.js', pcRel, 'held-as-off')).href);
  ok(!pgx.kept && pgx.dropped.length === 1 && pgx.deact.length === 1, 'RED CONTROL (B-f276, the release\'s apply): the held list reads as «all off» — the plugin\'s theme DROPPED and its module deactivated', pgx);
  // (r3634, line 740's follow) THE PERSON's THEME, on the two roads where the registry STARTED EMPTY or the list came back empty while
  // held: the page's client never STORES a fallback theme for a drop no person made — the plugin's theme stays the stored choice,
  // pending, and comes back when the plugin is on again. The REAL loader's broadcast, the REAL plugin client and the REAL theme manager
  // (a page's localStorage and document stood in). RED each: the release's client (no hold or torn start beside the list)
  {
    const saved = { localStorage: globalThis.localStorage, document: globalThis.document, window: globalThis.window };
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } };
    const stubEl = () => ({ id: '', textContent: '', style: {}, remove() {}, setAttribute() {} });
    globalThis.document = { documentElement: { setAttribute() {}, style: { length: 0, removeProperty() {} } }, head: { appendChild() {} }, createElement: stubEl, getElementById: () => null };
    globalThis.window = { dispatchEvent() {} };
    try {
      const { ThemeManager } = await import(pathToFileURL(path.join(REPO, 'src/lib/themes.js')).href);
      const pcSrc = fs.readFileSync(path.join(REPO, 'src/lib/plugin-client.js'), 'utf8');
      // a page that shows example.hello's theme, picked by the person; then the list as the hub broadcast it
      const pageOf = async (pcUrl, msg) => {
        const { PluginClient, pluginThemeKey } = await import(pcUrl);
        store.clear(); store.set('theme', 'dark');
        const tm = new ThemeManager();
        const key = pluginThemeKey(PID, 'mint');
        tm.registerPluginTheme(key, 'Hello Mint', {}, null); tm.apply(key);   // the person's pick, stored
        const pc = Object.create(PluginClient.prototype);
        Object.assign(pc, { app: { themeManager: tm, _refreshThemeDropdown() {} }, manifests: [], errors: new Map(), _applying: null, _settings: new Set(), _modules: new Map(), _themes: new Map([[PID, new Set([key])]]) });
        await pc.apply(msg.plugins, { held: msg.held, torn: msg.torn });
        const out = { stored: store.get('theme'), pending: tm._pendingTheme || null, current: tm.current };
        tm.registerPluginTheme(key, 'Hello Mint', {}, null);   // the plugin on again: its theme registers again
        out.back = tm.current === key && store.get('theme') === key;
        out.key = key;
        return out;
      };
      // (a) A TORN LIFT: torn bytes with the plugin ON — kept aside, the registry starts empty, the reload broadcasts every row off
      const roadA = async () => {
        const R = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plugreg-torn-'));
        const pd = path.join(R, 'data', 'plugins', PID);
        fs.cpSync(path.join(REPO, 'docs/examples/hello-plugin'), pd, { recursive: true });
        fs.writeFileSync(path.join(R, 'data', 'plugin-registry.json'), JSON.stringify({ enabled: { [PID]: true }, trust: {}, installs: {} }).slice(0, 30));
        const msgs = [];
        const L = PLr.create({ rootDir: R, app: null, autoStart: true, hostVersion: '2.369.24', log: quietR, binDir: path.join(R, 'bin'), broadcast: (m) => msgs.push(m), agentEnv: () => ({ PATH: process.env.PATH }) });
        const t0 = Date.now(); while (Date.now() - t0 < 5000 && !msgs.some((m) => m && m.torn)) await sleep(10);
        const msg = msgs.find((m) => m && m.torn) || msgs.at(-1) || { plugins: [] };
        try { L.shutdown(); } catch { /* its own */ }
        try { fs.rmSync(R, { recursive: true, force: true }); } catch { /* gone */ }
        return { msg: { torn: msg.torn || null, held: msg.held || null, rows: (msg.plugins || []).map((p) => ({ id: p.id, enabled: p.enabled })) }, raw: msg };
      };
      // (b) A RESCAN WHILE HELD whose plugins folder does not list either: no rows at all — the hold rides beside the empty list
      const roadB = async () => {
        const R = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plugreg-rescan-'));
        const pd = path.join(R, 'data', 'plugins', PID);
        fs.cpSync(path.join(REPO, 'docs/examples/hello-plugin'), pd, { recursive: true });
        const regFile = path.resolve(path.join(R, 'data', 'plugin-registry.json'));
        fs.writeFileSync(regFile, JSON.stringify({ enabled: { [PID]: true }, trust: {}, installs: {} }));
        const plugDir = path.resolve(path.join(R, 'data', 'plugins'));
        const msgs = [];
        const realRead = fs.readFileSync, realDir = fs.readdirSync;
        fs.readFileSync = function (f, ...a) { if (path.resolve(String(f)) === regFile) throw Object.assign(new Error('EIO: i/o error, read'), { code: 'EIO' }); return realRead.call(this, f, ...a); };
        let L;
        try { L = PLr.create({ rootDir: R, app: null, autoStart: true, hostVersion: '2.369.24', log: quietR, binDir: path.join(R, 'bin'), broadcast: (m) => msgs.push(m), agentEnv: () => ({ PATH: process.env.PATH }) }); }
        finally { fs.readFileSync = realRead; }
        fs.readdirSync = function (d, ...a) { if (path.resolve(String(d)) === plugDir) throw Object.assign(new Error('EIO: i/o error, scandir'), { code: 'EIO' }); return realDir.call(this, d, ...a); };
        try { L.reload(); } finally { fs.readdirSync = realDir; }   // the Rescan press
        const msg = msgs.at(-1) || { plugins: [] };
        try { L.shutdown(); } catch { /* its own */ }
        try { fs.rmSync(R, { recursive: true, force: true }); } catch { /* gone */ }
        return { msg: { held: msg.held || null, rows: (msg.plugins || []).length }, raw: msg };
      };
      const pcUrl = pathToFileURL(path.join(REPO, 'src/lib/plugin-client.js')).href;
      const a = await roadA(), b = await roadB();
      const pa = await pageOf(pcUrl, a.raw), pb = await pageOf(pcUrl, b.raw);
      console.log(`    facts (theme, torn lift): ${JSON.stringify({ msg: a.msg, page: pa })}`);
      console.log(`    facts (theme, rescan while held): ${JSON.stringify({ msg: b.msg, page: pb })}`);
      ok(!!a.msg.torn && !a.msg.held && gateOf(a.msg.rows.every((r) => r.enabled === false)) && pa.stored === pa.key && pa.pending === pa.key && verdictOf(pa.back),
        'B-f276 (r3634 (a)): A TORN LIFT broadcasts its rows off WITH the torn start beside them — the page drops the plugin\'s theme from view but STORES nothing: the person\'s pick stays stored and pending, and comes back when the plugin is on again', { msg: a.msg, page: pa });
      ok(!!b.msg.held && b.msg.rows === 0 && pb.stored === pb.key && pb.current === pb.key && verdictOf(pb.back),
        'B-f276 (r3634 (b)): A RESCAN WHILE HELD whose plugins folder did not list broadcasts an EMPTY list WITH the hold beside it — the page keeps what it applied: the person\'s theme shown and stored', { msg: b.msg, page: pb });
      // RED: the release's client — it keys on the rows' own flag only and drops with a stored fallback
      const relPc = editAnchor(editAnchor(pcSrc, '    const keepChoice = !!(meta && meta.torn);\n', '    const keepChoice = false;   // the release: every drop stores the fallback\n', 'src/lib/plugin-client.js'),
        '    if ((meta && meta.held) || (Array.isArray(list) && list.some((m) => m && m.held)))', '    if ((Array.isArray(list) && list.some((m) => m && m.held)))', 'src/lib/plugin-client.js');
      const MCt = mutantCopies('plugin-registry-theme', REPO);
      const relUrl = pathToFileURL(MCt.write('src/lib/plugin-client.js', relPc, 'release-drop-stores')).href;
      const xa = await pageOf(relUrl, a.raw), xb = await pageOf(relUrl, b.raw);
      ok(xa.stored === 'dark' && !xa.back && xb.stored === 'dark' && !xb.back,
        'RED CONTROL (r3634, the release\'s client): on both roads the plugin\'s theme is dropped and DARK IS STORED over the person\'s pick — turning the plugin on again does not bring it back', { torn: xa, rescan: xb });
    } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
    }
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
