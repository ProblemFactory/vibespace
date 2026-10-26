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
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (pred, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(100); } return !!(await pred()); };

// ── ① validator matrix ──
const { validateManifest, compareVersions } = require(path.join(REPO, 'src/plugin-manifest.js'));
const base = { id: 'acme.tool', version: '1.0.0', engines: { vibespace: '2.369.24' }, client: 'iframe', server: true, contributes: { windows: [{ id: 'main', title: 'Main', entry: 'index.html' }], agentTools: [{ name: 'do', description: 'does', args: { type: 'object' } }], routes: true } };
ok(validateManifest(base, { hostVersion: '2.369.24' }).ok, 'a complete manifest validates');
ok(validateManifest(base, { hostVersion: '2.369.24', folderName: 'acme.tool' }).ok && !validateManifest(base, { folderName: 'other' }).ok, 'id must equal the folder name');
ok(!validateManifest({ ...base, id: 'Acme.Tool' }).ok && !validateManifest({ ...base, id: 'tool' }).ok, 'id is <publisher>.<name> lowercase');
ok(!validateManifest({ ...base, version: '1.0' }).ok && !validateManifest({ ...base, engines: {} }).ok, 'version + engines.vibespace are required semver');
ok(!validateManifest(base, { hostVersion: '2.300.0' }).ok && /requires VibeSpace ≥/.test(validateManifest(base, { hostVersion: '2.300.0' }).errors.join()), 'an older host is refused with the minimum named');
ok(!validateManifest({ ...base, contributes: { windows: [{ id: 'x', title: 'X', entry: '../secret.html' }] } }).ok, 'window entries must be relative paths inside ui/ (no ..)');
ok(!validateManifest({ ...base, server: false }).ok && /needs server: true/.test(validateManifest({ ...base, server: false }).errors.join()), 'agentTools/routes need server: true');
ok(!validateManifest({ ...base, client: 'none' }).ok, 'iframe windows need client: iframe');
ok(validateManifest({ ...base, icon: '<svg onload="x()"></svg>' }).manifest.icon === undefined && validateManifest({ ...base, icon: '<svg viewBox="0 0 1 1"/>' }).manifest.icon, 'icons: inline svg only, handlers/scripts rejected (kept as a warning, not a fatal)');
ok(validateManifest({ ...base, contributes: { ...base.contributes, keybindings: [{ a: 1 }] } }).warnings.some((w) => /reserved/.test(w)) && !validateManifest({ ...base, contributes: { ...base.contributes, settings: { a: 1 } } }).ok, 'reserved contributions (keybindings/…) warn, never fail; settings is real since Ph4 (a non-array is an error)');
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
    ok(w.ok && w.warnings.some((x) => x.includes(`contributes.${key}`) && /reserved/.test(x)), `contributes.${key} warns "reserved for a later phase" and never fails`, JSON.stringify(w.warnings));
    ok(w.manifest.contributes[key] === undefined, `contributes.${key} is still IGNORED (reserved names a later phase, not a live contribution point)`);
  }
  const unknown = validateManifest({ ...base, contributes: { ...base.contributes, notAThing: [{ a: 1 }] } }, { hostVersion: '2.369.24' });
  ok(unknown.ok && !unknown.warnings.some((x) => /notAThing/.test(x)), 'NEGATIVE CONTROL: an UNRESERVED key is dropped with no warning — which is exactly why `channelAdapters` had to be added to the list');
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
ok(m.status === 200 && m.body.plugins.some((p) => p.id === 'example.hello' && p.valid && !p.enabled), 'manifests lists the example plugin (valid, disabled by default)');
ok(m.body.plugins.some((p) => p.id === 'broken.one' && !p.valid && p.errors.length), 'an invalid manifest is listed LOUDLY with its errors (never silently skipped)');
ok((await j('/plugins/example.hello/index.html')).status === 404, 'assets are 404 while disabled');
// contributed agent tools are a declared capability since 2.369.43 (the shim is
// a program on every session's PATH, outside the plugin sandbox) → consent gate
const noConsent = await j('/api/plugins/manifests/example.hello/enabled', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) });
ok(noConsent.status === 409 && noConsent.body.consentRequired === true && noConsent.body.capabilities.some((c) => c.id === 'agent-tools'), 'a plugin contributing agent tools cannot be enabled without consent (409 naming the tools)', noConsent.body);
const en = await j('/api/plugins/manifests/example.hello/enabled', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true, trusted: true }) });
ok(en.status === 200 && en.body.plugin.enabled, 'enable persists and starts the plugin');
ok(fs.existsSync(path.join(root, 'data', 'plugin-registry.json')), 'registry is written atomically to data/plugin-registry.json');
ok(await waitFor(async () => (await j('/api/plugins/manifests')).body.plugins.find((p) => p.id === 'example.hello').state === 'running'), 'the forked server process says hello → state running');
ok(broadcasts.some((b) => b.type === 'plugins-manifests-updated'), 'every change broadcasts plugins-manifests-updated (multi-client law)');
const asset = await j('/plugins/example.hello/index.html');
ok(asset.status === 200 && /^sandbox allow-scripts/.test(asset.headers.get('content-security-policy') || '') && !/allow-same-origin/.test(asset.headers.get('content-security-policy') || ''), 'iframe assets ride the opaque-origin sandbox CSP (never allow-same-origin)');
ok(/text\/html/.test(asset.headers.get('content-type') || '') && asset.headers.get('cache-control') === 'no-cache', 'assets carry a real content-type and no-cache');
ok((await j('/plugins/example.hello/../../plugin-registry.json')).status !== 200 && (await j('/plugins/example.hello/..%2F..%2Fplugin-registry.json')).status !== 200, 'path traversal out of ui/ is refused');
ok((await j('/plugins/example.hello/nope.html')).status === 404, 'missing asset → 404');
const ping = await j('/api/plugins/example.hello/x/ping');
ok(ping.status === 200 && ping.body.pong === true, 'proxied route reaches the plugin process over IPC (GET /x/ping)');
const c1 = await j('/api/plugins/example.hello/x/count', { method: 'POST' }); const c2 = await j('/api/plugins/example.hello/x/count', { method: 'POST' });
ok(c1.body.count === 1 && c2.body.count === 2, 'the plugin keeps state in its own VIBESPACE_PLUGIN_DATA dir (POST /x/count increments)');
ok((await j('/api/plugins/example.hello/x/missing')).status === 404, 'unknown plugin route → the plugin answers 404');
const tool = await j('/api/agent/plugin-tool/example.hello/hello', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer vsst_ok' }, body: JSON.stringify({ args: { name: 'Ada' } }) });
ok(tool.status === 200 && tool.body.ok && /hello, Ada!/.test(tool.body.output) && /session sess-1/.test(tool.body.output), 'agent tool call reaches the plugin with the calling session identity');
ok((await j('/api/agent/plugin-tool/example.hello/hello', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer vsst_bad' }, body: '{}' })).status === 401, 'an unknown vsst_ token is refused (the route is cookie-exempt, so it MUST validate the bearer)');
const shim = path.join(root, 'data', 'bin', 'vibespace-tool-example.hello-hello');
ok(fs.existsSync(shim) && (fs.statSync(shim).mode & 0o111) !== 0, 'an executable agent-tool shim is generated in data/bin');
const help = spawnSync(process.execPath, [shim, '--help'], { encoding: 'utf8' });
ok(help.status === 0 && /greeting/.test(help.stdout), 'the shim explains itself (--help prints the manifest description + args)');
// async: the shim calls THIS process's server — a sync spawn would deadlock the event loop
const run = await new Promise((r) => execFile(process.execPath, [shim, '--name', 'Grace'], { encoding: 'utf8', env: { PATH: process.env.PATH, VIBESPACE_API: base_, VIBESPACE_SESSION_TOKEN: 'vsst_ok' } }, (err, stdout, stderr) => r({ status: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })));
ok(run.status === 0 && /hello, Grace!/.test(run.stdout), `the shim posts to the host with the session token and prints the output (${JSON.stringify(run.stdout.trim().slice(0, 60))})`);
const noEnv = spawnSync(process.execPath, [shim, '--name', 'x'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
ok(noEnv.status === 3 && /not inside a VibeSpace session/.test(noEnv.stderr), 'outside a session the shim fails loudly');
const dis = await j('/api/plugins/manifests/example.hello/enabled', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
ok(dis.status === 200 && !dis.body.plugin.enabled, 'disable persists');
ok(await waitFor(async () => (await j('/api/plugins/manifests')).body.plugins.find((p) => p.id === 'example.hello').state === 'stopped'), 'the plugin process is stopped on disable');
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
  ok(v.ok && v.manifest.contributes.browserEngine === true && M.needsConsent(v.manifest) && M.capabilitySummary(v.manifest).some((c) => c.id === 'browser-engine'), 'contributes.browserEngine with server + routes validates, ALWAYS needs consent, and the consent dialog names it (browser-engine)', JSON.stringify(v.errors));
  const ns = M.validateManifest({ ...eb, server: false }), nr = M.validateManifest({ ...eb, contributes: { browserEngine: true } }), nb = M.validateManifest({ ...eb, contributes: { routes: true, browserEngine: 'yes' } });
  ok(!ns.ok && ns.errors.some((e) => /browserEngine needs server: true/.test(e)) && !nr.ok && nr.errors.some((e) => /browserEngine needs contributes\.routes: true/.test(e)) && !nb.ok && nb.errors.some((e) => /browserEngine must be true\|false/.test(e)), 'refused BY NAME without its process, without its routes, or as anything but a boolean', JSON.stringify([ns.errors, nr.errors, nb.errors]));
  const plain = M.validateManifest({ ...eb, contributes: { routes: true } }).manifest, off = M.validateManifest({ ...eb, contributes: { routes: true, browserEngine: false } }).manifest;
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
  ok(row() && row().valid && row().contributes.browserEngine === true && row().needsConsent && !row().enabled && reg.rows().length === 0, 'the fixture engine plugin is listed (valid, an engine, consent needed) — and NOT in the engine table while disabled');
  let refused = null; try { le.setEnabled(EID, true); } catch (e) { refused = e; }
  ok(refused && refused.status === 409 && reg.rows().length === 0, 'enabling it without consent is refused (409) — the table stays empty');
  le.setEnabled(EID, true, { trusted: true });
  ok(row().state !== 'running' ? reg.rows().length === 0 : true, 'enabled + trusted but its process not up yet ⇒ not in the table (state is part of the rule)');
  ok(await waitFor(() => reg.rows().length === 1), 'enabled + trusted + RUNNING ⇒ in the engine table');
  const pr = await le.askRoute(EID, { method: 'GET', path: '/probe', query: { binaryPath: '/nonexistent/chrome' } });
  ok(pr.status === 200 && pr.body.installed === false && pr.body.binaryPath === '/nonexistent/chrome', 'askRoute: ONE IPC route ask (GET /probe) answers about the path it was handed', JSON.stringify(pr));
  let r404 = null; try { await le.askRoute('nope.nope', { path: '/probe' }); } catch (e) { r404 = e; }
  ok(r404 && r404.status === 404, 'askRoute of a plugin that is not there ⇒ refused (404), never a hang');
  le.get(EID).child.kill('SIGKILL');
  ok(await waitFor(() => row().state === 'crashed' && reg.rows().length === 0, 3000), 'its process dies ⇒ out of the table at once (not running)');
  ok(await waitFor(() => reg.rows().length === 1, 8000), '…restarted by the loader ⇒ back in');
  le.setEnabled(EID, false);
  ok(reg.rows().length === 0, 'disabled ⇒ out of the table at once');
  le.shutdown();
  try { fs.rmSync(eroot, { recursive: true, force: true }); } catch {}
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
  ok(r0.skipped && !rowF() && !fetches().length, 'no fleet engine ⇒ the boot job does nothing (no git call)');
  fleet = { plugin: EID, default: false, preinstall: false, source: { git: URL_HTTPS, ref: shaA }, kernel: { url: '', sha256: '' } };
  const r1 = await EDF.bootFleet();
  const t1 = regFile().trust[EID];
  ok(r1.ok && r1.outcome === 'installed' && rowF() && rowF().version === '0.1.1' && rowF().trusted && rowF().trustedBy === 'fleet' && rowF().enabled && !rowF().consentRequired && rowF().install.by === 'fleet' && rowF().install.sha === shaA && t1.by === 'fleet' && t1.sha === shaA && t1.contentHash === regFile().installs[EID].contentHash,
    'D2: the fleet\'s plugin at a full sha ⇒ installed from git, trust {by:\'fleet\', sha, contentHash} — enabled with no dialog (the panel says «Installed and trusted by the cluster»)', { row: rowF() && { trustedBy: rowF().trustedBy, enabled: rowF().enabled }, t1 });
  ok(await waitFor(() => regF.rows().length === 1, 8000), '…its process runs ⇒ it is in the engine table');
  // ③ every boot compares the record and never re-pulls the same; a moved pin installs the new sha
  const n1 = fetches().length;
  const r2 = await EDF.bootFleet();
  ok(r2.outcome === 'same' && fetches().length === n1, 'a boot with the same {source, ref} as the record ⇒ no git call (compare, never re-pull)');
  fleet = { ...fleet, source: { git: URL_HTTPS, ref: shaB } };
  const r3 = await EDF.bootFleet();
  ok(r3.outcome === 'installed' && fetches().length === n1 + 1 && fetches().at(-1).argv.at(-1) === shaB && rowF().version === '0.1.2' && rowF().trustedBy === 'fleet' && regFile().trust[EID].sha === shaB, 'the fleet moves its pin ⇒ the boot installs THAT sha, and the fleet\'s trust moves to it');
  // ④ a TAG is never the trust anchor: installed, the owner asked once
  fleet = { ...fleet, source: { git: URL_HTTPS, ref: 'v0.1.1' } };
  const r4 = await EDF.bootFleet();
  ok(r4.outcome === 'installed' && rowF().version === '0.1.1' && !rowF().trusted && rowF().trustedBy === null && rowF().consentRequired && !rowF().enabled, 'a fleet ref that is a TAG ⇒ installed but NOT pre-trusted (a tag can move — only a sha anchors D2): disabled, the owner enables it', rowF() && { trusted: rowF().trusted, enabled: rowF().enabled });
  fleet = { ...fleet, source: { git: URL_HTTPS, ref: shaA } };
  await EDF.bootFleet();
  ok(rowF().trustedBy === 'fleet' && rowF().enabled, '…back on a sha ⇒ trusted by the fleet again');
  // ⑤ the trust LAPSES: the fleet stops naming it · the fleet names another id · another package under the id
  const keep = fleet;
  fleet = null;
  ok(!rowF().trusted && rowF().consentRequired, 'the fleet stops naming the plugin ⇒ its fleet trust no longer holds (the owner is asked)');
  fleet = { ...keep, plugin: 'acme.other' };
  ok(!rowF().trusted, 'the fleet names another plugin id ⇒ this one\'s fleet trust no longer holds');
  fleet = keep;
  ok(rowF().trusted && rowF().trustedBy === 'fleet', '…named again at the same sha with the same package ⇒ it holds again');
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
  ok(!iu.plugin.trusted && iu.plugin.consentRequired && iu.plugin.install.by === 'user', 'the same package installed by a PERSON still asks once (D2 is the cluster\'s install only)');
  // ⑧ a failed boot install: NAMED, ONE For-you notice, the Plugins panel's fleet line
  fleet = { ...keep, source: { git: URL_HTTPS, ref: 'v9.9.9' } };
  const r8 = await EDF.bootFleet();
  const mf = await (await fetch(`http://127.0.0.1:${srvF.address().port}/api/plugins/manifests`)).json();
  ok(!r8.ok && r8.code === 'plugin_git_ref_missing' && todosF.length === 1 && todosF[0].origin === 'plugin' && /cluster's plugin could not be installed/.test(todosF[0].text) && /plugin_git_ref_missing/.test(todosF[0].detail) && mf.fleet && mf.fleet.outcome === 'failed' && mf.fleet.code === 'plugin_git_ref_missing',
    'a boot install that fails ⇒ named (plugin_git_ref_missing), ONE For-you notice (origin plugin), and GET /api/plugins/manifests carries the fleet line the Plugins panel draws', { r8, todo: todosF[0], fleet: mf.fleet });
  // ⑨ preinstall ⇒ the kernel right away (this package has no kernel.json ⇒ refused by name, said once)
  fleet = { ...keep, preinstall: true };
  const r9 = await EDF.bootFleet();
  ok(r9.ok && r9.kernel && r9.kernel.ok === false && r9.kernel.code === 'browser_engine_protocol' && todosF.length === 2 && /browser kernel could not be downloaded/.test(todosF[1].text), 'preinstall: true ⇒ the boot asks for the kernel right away (here: the package names no kernel.json ⇒ refused by name, ONE notice)', { kernel: r9.kernel });
  // ⑩ RED CONTROL: a loader whose D2 check forgets the id trusts the package the fleet did NOT name
  const LS = fs.readFileSync(path.join(REPO, 'src/server/plugin-loader.js'), 'utf8');
  const anchor = "const fleetTrust = !!f && f.plugin === r.id && ";
  ok(LS.includes(anchor), 'control: D2\'s id check is in plugin-loader.js');
  const Lx = mutantCopies('plugin-loader-d2', REPO).load('src/server/plugin-loader.js', LS.replace(anchor, 'const fleetTrust = !!f && ').replace('return !!(f && f.plugin === id && ', 'return !!(f && '), 'any-id');
  const R4 = path.join(groot, 'root4'); fs.mkdirSync(path.join(R4, 'data', 'plugins'), { recursive: true });
  const lx = Lx.create({ rootDir: R4, app: null, autoStart: false, hostVersion: '2.369.356', log: quiet, gitBin: FX.WRAP, fleetEngine: () => fleet2 });
  const ix = await lx.install({ source: 'git', value: URL_HTTPS, ref: shaA, credential: 'auto', by: 'fleet' });
  ok(ix.plugin.trusted && ix.trustedBy === 'fleet', 'control: that copy pre-trusts a package under an id the fleet never named — exactly what ⑥ refuses (RED)');
  lf.shutdown(); srvF.close();
  try { fs.rmSync(groot, { recursive: true, force: true }); } catch {}
}

// ── ③ wiring pins ──
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const pc = read('src/lib/plugin-client.js');
const sandboxConst = (pc.match(/const IFRAME_SANDBOX = '([^']*)'/) || [])[1] || '';
ok(/registerWindowType\(\{/.test(pc) && /action: w\.action/.test(pc) && /sandbox', IFRAME_SANDBOX/.test(pc) && sandboxConst.includes('allow-scripts') && !sandboxConst.includes('allow-same-origin'), `plugin-client registers contributed windows as window types and frames them sandboxed (never allow-same-origin): "${sandboxConst}"`);
ok(/plugins-manifests-updated/.test(pc), 'plugin-client re-applies on the manifests broadcast');
const appSrc = read('src/lib/app.js');
const gearSrc = read('src/lib/gear-menu.js');
ok(/installPluginClient\(this\)/.test(appSrc) && /pluginClient\?\.contributedWindows\?\.\(\)/.test(appSrc + gearSrc), 'app installs the plugin client and the ⚙ menu (gear-menu.js since Ph1) lists contributed windows');
const wiring = read('src/server/mounts-plugins-wiring.js');
ok(/require\('\.\/plugin-loader\.js'\)\.create\(/.test(wiring) && /agentAuth: \(req\) =>/.test(wiring) && /sameToken\(tok, s\.agentToken\)|s\.agentToken === tok/.test(wiring) && /pluginLoader\.shutdown\(\)/.test(wiring), 'wiring creates the loader with a vsst_-validating agentAuth and shuts plugin processes down with the server');
ok(/, activeSessions,$/m.test(read('server.js')) && /pluginLoader,$/m.test(read('server.js')) && /const \{ agentEnv \} = require\('\.\.\/ws-handler'\);/.test(wiring), 'server.js passes activeSessions and receives the loader; the wiring takes agentEnv from ws-handler (the ONE sanitized-env builder)');
ok(/'src\/plugin-manifest\.js'/.test(read('scripts/test-architecture.mjs')), 'the manifest validator is in the PURE tier');
const pui = read('src/lib/plugins-ui.js');
ok(/fetchJson\('\/api\/plugins\/manifests'\)/.test(pui) && /\/api\/plugins\/manifests\/\$\{encodeURIComponent\(p\.id\)\}\/enabled/.test(pui) && /manifests\/reload/.test(pui) && /this\.pluginClient\?\.open\?\./.test(pui), 'the Plugins panel lists manifest plugins with enable/disable, rescan and open-window actions');
// lane plugin-settings-p0: a manifest plugin is a LIST row — ids / errors reach the DOM as textContent / title (pluginRow has no innerHTML)
const rowFnL = pui.slice(pui.indexOf('function pluginRow('), pui.indexOf('\n}\n', pui.indexOf('function pluginRow(')));
ok(rowFnL.length > 100 && !/innerHTML/.test(rowFnL) && /\.\.\.\(p\.errors \|\| \[\]\), p\.lastError/.test(pui) && /pluginRow\(\{ id: p\.id, label: p\.label && p\.label !== p\.id/.test(pui), 'manifest fields reach the panel as text (ids/errors come from disk, never trusted HTML — pluginRow: textContent / title)');
for (const dict of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) ok(['Installed plugins', 'Rescan', 'Plugin enabled', 'parked after repeated crashes'].every((k) => read(dict).includes(JSON.stringify(k) + ':')), `${dict} carries the new panel strings`);
ok(/\/api\/agent\/plugin-tool\//.test(read('src/server/plugin-loader.js')) && /res\.status\(401\)/.test(read('src/server/plugin-loader.js')), 'the tool route lives under the cookie-exempt /api/agent/ prefix and enforces the bearer itself');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
