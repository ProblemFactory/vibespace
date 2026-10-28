#!/usr/bin/env node
// Plugin Ph4 (2.369.30, docs/plugins.md; design §3.3): the trusted client tier
// + owner consent, contributed settings/themes, install sources, node
// --permission capability ENFORCEMENT, remote shim shipping — against REAL
// fixture plugins under a temp root (never the repo's data/). Client pins last.
// ③b lane engine-distribution: a PRIVATE git repository with the Plugin Git credential — a real bare repository, a recording
// git (argv / env / the askpass's answers / the files' modes), every failure by name, four patched-copy RED controls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (pred, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(100); } return !!(await pred()); };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };

// ── ① validator: contributions + capabilities + module tier + consent helpers ──
console.log('— validator');
const PM = require(path.join(REPO, 'src/plugin-manifest.js'));
const { validateManifest, needsConsent, hasDeclaredCapabilities, capabilitySummary, capabilitiesHash, normalizeFsPath } = PM;
const base = { id: 'acme.tool', version: '1.0.0', engines: { vibespace: '2.369.24' }, server: true };
const V = (m, o = {}) => validateManifest(m, { hostVersion: '2.369.30', ...o });
ok(V({ ...base, contributes: { settings: [{ key: 'greeting', type: 'string', default: 'hi', label: 'Greeting' }, { key: 'n', type: 'number', default: 3, label: 'N', min: 0, max: 9 }, { key: 'on', type: 'boolean', default: true, label: 'On' }, { key: 'lvl', type: 'select', default: 'a', label: 'Level', options: ['a', { value: 'b', label: 'Bee' }] }] } }).ok, 'settings: string/number/boolean/select validate and normalize');
ok(!V({ ...base, contributes: { settings: [{ key: 'x', type: 'select', default: 'z', label: 'X', options: ['a'] }] } }).ok && !V({ ...base, contributes: { settings: [{ key: 'x', type: 'boolean', default: 'yes', label: 'X' }] } }).ok && !V({ ...base, contributes: { settings: [{ key: 'bad key', type: 'string', label: 'X' }] } }).ok && !V({ ...base, contributes: { settings: [{ key: 'a', type: 'string', label: 'A' }, { key: 'a', type: 'string', label: 'B' }] } }).ok, 'settings: wrong default type / default outside options / bad key / duplicate key are errors');
ok(V({ ...base, contributes: { themes: [{ id: 'night', label: 'Night', file: 'themes/night.json' }] } }).ok && !V({ ...base, contributes: { themes: [{ id: 'night', label: 'Night', file: '../x.json' }] } }).ok && !V({ ...base, contributes: { themes: [{ id: 'Night!', label: 'N', file: 't.json' }] } }).ok, 'themes: relative .json inside the plugin dir, slug ids');
const home = '/home/tester';
const capsV = V({ ...base, capabilities: { server: { fs: { read: ['~/data', '/srv/x/'], write: ['~/data'] }, spawn: ['ls'], net: ['api.example.com', { host: 'x.example.com' }] } } }, { homeDir: home });
ok(capsV.ok && capsV.manifest.capabilities.server.fs.read.join() === '/home/tester/data,/srv/x' && capsV.manifest.capabilities.server.fs.write.join() === '/home/tester/data' && capsV.manifest.capabilities.server.childProcess === true && capsV.manifest.capabilities.server.net.join() === 'api.example.com,x.example.com' && capsV.warnings.some((w) => /spawn is treated as childProcess/.test(w)), 'capabilities normalize: ~ expands, trailing slash trimmed, spawn ⇒ childProcess (warned), net hosts', capsV);
ok(!V({ ...base, capabilities: { server: { fs: { read: ['../etc'] } } } }).ok && !V({ ...base, capabilities: { server: { fs: { read: ['relative/path'] } } } }).ok && !V({ ...base, capabilities: { server: { fs: { read: ['/'] } } } }, { forbiddenRoots: ['/srv/vibespace'] }).ok, 'capabilities: .., relative and / are refused');
const forb = V({ ...base, capabilities: { server: { fs: { read: ['/srv/vibespace/data/plugins'] } } } }, { forbiddenRoots: [{ path: '/srv/vibespace/data', label: 'the VibeSpace data dir' }] });
ok(!forb.ok && /covers the VibeSpace data dir/.test(forb.errors.join()) && !V({ ...base, capabilities: { server: { fs: { read: ['/srv'] } } } }, { forbiddenRoots: ['/srv/vibespace'] }).ok, 'a declared path covering (or covered by) a forbidden root is an error, named');
ok(normalizeFsPath('~', { homeDir: home }).path === home && normalizeFsPath('/a//', {}).path === '/a' && normalizeFsPath('', {}).error, 'normalizeFsPath edge cases');
const modV = V({ ...base, client: 'module' });
ok(modV.ok && modV.manifest.clientEntry === 'client.js' && V({ ...base, client: 'module', clientEntry: 'ui/app.mjs' }).manifest.clientEntry === 'ui/app.mjs' && !V({ ...base, client: 'module', clientEntry: '../x.js' }).ok && !V({ ...base, client: 'module', clientEntry: 'x.html' }).ok, 'module tier: clientEntry defaults to client.js, relative .js only');
const alias = V({ ...base, client: 'trusted' });
ok(alias.ok && alias.manifest.client === 'module' && alias.warnings.some((w) => /alias/.test(w)), '"trusted" is accepted as an alias of "module" with a warning');
ok(!needsConsent(V(base).manifest) && needsConsent(modV.manifest) && needsConsent(capsV.manifest) && hasDeclaredCapabilities(capsV.manifest) && !hasDeclaredCapabilities(V(base).manifest), 'needsConsent = module tier or any declared server capability');
const sumIds = capabilitySummary({ ...capsV.manifest, client: 'module', contributes: { ...capsV.manifest.contributes, agentTools: [{ name: 'do' }] } }).map((i) => i.id);
ok(sumIds.join() === 'client-module,server-process,fs-read,fs-write,child-process,net,agent-tools' && capabilitySummary(V({ ...base, server: false }).manifest)[0].id === 'none', `capabilitySummary lists every declared power in a fixed order (${sumIds.join(',')})`);
const h1 = capabilitiesHash(capsV.manifest), h2 = capabilitiesHash(V({ ...base, capabilities: { server: { net: ['api.example.com', { host: 'x.example.com' }], spawn: ['ls'], fs: { write: ['~/data'], read: ['~/data', '/srv/x/'] } } } }, { homeDir: home }).manifest); // same lists, different OBJECT key order
ok(h1 && h1 === h2 && h1 !== capabilitiesHash(V({ ...base, capabilities: { server: { fs: { read: ['~/data'] } } } }, { homeDir: home }).manifest) && h1 !== capabilitiesHash({ ...capsV.manifest, contributes: { ...capsV.manifest.contributes, agentTools: [{ name: 'x' }] } }), 'capabilitiesHash is key-order independent and changes on any consent-relevant change (capability or agent tool)');

// ── ② loader against fixture plugins ──
console.log('— loader: consent, trusted module, themes, --permission');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-trust-'));
const pdir = (id) => path.join(root, 'data', 'plugins', id);
const trustyManifest = { id: 'acme.trusty', version: '1.0.0', engines: { vibespace: '2.369.24' }, label: 'Trusty', client: 'module', clientEntry: 'client.js', server: true,
  contributes: { routes: true, settings: [{ key: 'greeting', type: 'string', default: 'hi', label: 'Greeting' }], themes: [{ id: 'night', label: 'Night', file: 'themes/night.json' }, { id: 'bad', label: 'Bad', file: 'themes/bad.json' }] },
  capabilities: { server: { fs: { read: ['/etc'] } } } };
writeJson(path.join(pdir('acme.trusty'), 'vibespace-plugin.json'), trustyManifest);
fs.writeFileSync(path.join(pdir('acme.trusty'), 'client.js'), 'export function activate(api) { globalThis.__trustyActivated = api.id; }\nexport function deactivate() { globalThis.__trustyActivated = null; }\n');
writeJson(path.join(pdir('acme.trusty'), 'themes', 'night.json'), { css: { '--accent': '#123456' }, terminal: { background: '#000' } });
writeJson(path.join(pdir('acme.trusty'), 'themes', 'bad.json'), { css: { '--accent': 'red; } body { color: red' } });
fs.writeFileSync(path.join(pdir('acme.trusty'), 'server.js'), `'use strict';
const fs = require('fs');
process.on('message', (m) => {
  if (m.t === 'route') { if (m.path === '/host') { let h = ''; try { h = fs.readFileSync('/etc/hostname', 'utf8').trim() || '(empty)'; } catch (e) { return process.send({ t: 'route-reply', id: m.id, status: 500, body: { error: e.code || e.message } }); } return process.send({ t: 'route-reply', id: m.id, status: 200, body: { hostname: h } }); }
    return process.send({ t: 'route-reply', id: m.id, status: 404, body: { error: 'nope' } }); }
  if (m.t === 'shutdown') process.exit(0);
});
process.send({ t: 'hello', api: 1 });
`);
// greedy: no declared capability, reads outside its sandbox at startup → must be DENIED (crash the loader reports), never a host failure
writeJson(path.join(pdir('acme.greedy'), 'vibespace-plugin.json'), { id: 'acme.greedy', version: '0.1.0', engines: { vibespace: '2.369.24' }, server: true });
fs.writeFileSync(path.join(pdir('acme.greedy'), 'server.js'), "const fs = require('fs'); fs.readFileSync('/etc/hostname', 'utf8'); process.on('message', (m) => { if (m.t === 'shutdown') process.exit(0); }); process.send({ t: 'hello', api: 1 });\n");
const express = require(path.join(REPO, 'node_modules/express'));
const app = express();
app.use(express.json({ limit: '1mb' }));
const broadcasts = [], tele = [];
const { create } = require(path.join(REPO, 'src/server/plugin-loader.js'));
const loader = create({ rootDir: root, app, hostVersion: '2.369.30', log: { log() {}, warn() {} }, broadcast: (m) => broadcasts.push(m), agentEnv: () => ({ PATH: process.env.PATH }), agentAuth: () => null, instanceUrl: { url: () => 'https://vs.example.test/' }, telemetry: (ev) => tele.push(ev) });
const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const base_ = `http://127.0.0.1:${srv.address().port}`;
const j = async (p, opt) => { const r = await fetch(base_ + p, opt); let b = null; try { b = await r.clone().json(); } catch { b = await r.text(); } return { status: r.status, headers: r.headers, body: b }; };
const post = (p, body) => j(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const row = async (id) => (await j('/api/plugins/manifests')).body.plugins.find((p) => p.id === id);

let tr = await row('acme.trusty');
ok(tr && tr.valid && !tr.enabled && tr.needsConsent && tr.consentRequired && !tr.trusted && tr.client === 'module' && tr.clientEntry === 'client.js' && tr.label === 'Trusty', 'the module-tier fixture lists as valid, disabled, consent required', tr);
ok(tr.capabilitySummary.map((i) => i.id).join() === 'client-module,server-process,fs-read' && /\/etc/.test(tr.capabilitySummary[2].params.paths) && tr.capabilitiesHash, 'the list row carries the consent summary + hash the panel renders');
ok(tr.contributes.settings.length === 1 && tr.contributes.themes.find((t) => t.id === 'night').ok === true && tr.contributes.themes.find((t) => t.id === 'bad').ok === false && tr.warnings.some((w) => /theme "bad"/.test(w)), 'theme files are validated at discovery (a bad one is flagged, never served as CSS)');
const denied = await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: true });
ok(denied.status === 409 && denied.body.consentRequired === true && Array.isArray(denied.body.capabilities) && denied.body.capabilities[0].id === 'client-module' && /needs your consent/.test(denied.body.error), 'enable WITHOUT trusted → 409 consentRequired with the capability list (the manifest alone never grants trust)', denied.body);
ok((await j('/plugins/acme.trusty/client.js')).status === 404, 'the client module is not served while disabled');
const en = await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: true, trusted: true });
ok(en.status === 200 && en.body.plugin.enabled && en.body.plugin.trusted && en.body.plugin.trustedAt && !en.body.plugin.consentRequired, 'enable WITH trusted:true records consent (trusted + trustedAt) and starts the plugin');
const reg = JSON.parse(fs.readFileSync(path.join(root, 'data', 'plugin-registry.json'), 'utf8'));
ok(reg.trust['acme.trusty']?.trusted === true && reg.trust['acme.trusty'].capabilitiesHash === tr.capabilitiesHash, 'the registry stores { trusted, trustedAt, capabilitiesHash }');
const mod = await j('/plugins/acme.trusty/client.js');
ok(mod.status === 200 && /text\/javascript/.test(mod.headers.get('content-type') || '') && !mod.headers.get('content-security-policy') && /activate/.test(mod.body) && mod.headers.get('x-content-type-options') === 'nosniff', 'the trusted client module is served SAME-ORIGIN as javascript (no sandbox CSP), nosniff');
const th = await j('/plugins/acme.trusty/themes/night.json');
ok(th.status === 200 && /application\/json/.test(th.headers.get('content-type') || '') && th.body.css['--accent'] === '#123456', 'declared theme files are served as JSON');
ok((await j('/plugins/acme.trusty/server.js')).status === 404 && (await j('/plugins/acme.trusty/../acme.greedy/server.js')).status !== 200, 'nothing else in the plugin dir is served (server.js, traversal)');
ok(await waitFor(async () => (await row('acme.trusty')).state === 'running'), 'the server process runs under node --permission');
const host = await j('/api/plugins/acme.trusty/x/host');
ok(host.status === 200 && typeof host.body.hostname === 'string' && host.body.hostname.length > 0, `a DECLARED fs path (/etc) is readable inside the sandbox (${JSON.stringify(host.body).slice(0, 80)})`);
const caps = await j('/api/plugins/manifests/acme.trusty/capabilities');
ok(caps.status === 200 && caps.body.trusted === true && caps.body.trust.capabilitiesHash === tr.capabilitiesHash && caps.body.summary.length === 3, 'GET …/capabilities returns the summary + the trust record (Show capabilities…)');
// undeclared access → denied inside the plugin, reported by the loader, host unaffected
const g = await post('/api/plugins/manifests/acme.greedy/enabled', { enabled: true });
ok(g.status === 200, 'a plugin with no declared capabilities enables without consent');
ok(await waitFor(async () => /ERR_ACCESS_DENIED|denied file system read/.test((await row('acme.greedy')).lastError || ''), 8000), `an UNDECLARED read (/etc/hostname) is denied by node --permission and surfaced as the plugin's error: ${(await row('acme.greedy')).lastError}`);
ok(['crashed', 'starting', 'parked', 'stopped'].includes((await row('acme.greedy')).state) && (await row('acme.trusty')).state === 'running' && (await j('/api/plugins/manifests')).status === 200, 'the host and the other plugin are unaffected by the denied plugin');
await post('/api/plugins/manifests/acme.greedy/enabled', { enabled: false });
ok(tele.some((e) => e.name === 'plugin-trusted') && tele.some((e) => e.name === 'plugin-crash'), 'consent + crashes reach telemetry');
// consent drift: a manifest that grows a capability is switched off until reviewed
writeJson(path.join(pdir('acme.trusty'), 'vibespace-plugin.json'), { ...trustyManifest, capabilities: { server: { fs: { read: ['/etc'] }, childProcess: true } } });
await post('/api/plugins/manifests/reload', {});
tr = await row('acme.trusty');
ok(!tr.enabled && /capabilities changed/.test(tr.notice || '') && tr.consentRequired && !tr.trusted, 'CONSENT DRIFT: after the manifest gained childProcess, reload disables the plugin with a notice (old consent does not carry over)', tr);
ok((await j('/plugins/acme.trusty/client.js')).status === 404, '…and the module is no longer served');
const again = await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: true });
ok(again.status === 409 && again.body.changed === true && /changed its capabilities/.test(again.body.error) && again.body.capabilities.some((c) => c.id === 'child-process'), 'enable without re-consent → 409 changed:true naming the new capability');
ok((await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: true, trusted: true })).body.plugin.trusted === true, 're-consent enables it again');
await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: false });

// ── ③ install sources ──
console.log('— install / update / uninstall');
const src = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-trust-src-'));
fs.cpSync(path.join(REPO, 'docs/examples/hello-plugin'), path.join(src, 'hello'), { recursive: true });
const inst = await post('/api/plugins/install', { source: 'path', value: path.join(src, 'hello') });
ok(inst.status === 200 && inst.body.plugin?.id === 'example.hello' && inst.body.plugin.install?.source === 'path' && !inst.body.replaced && fs.existsSync(path.join(pdir('example.hello'), 'vibespace-plugin.json')), 'install from a local path lands under data/plugins/<id> with the source recorded', inst.body);
ok((await row('example.hello')).contributes.settings.length === 1 && (await row('example.hello')).contributes.themes[0].ok === true && (await row('example.hello')).needsConsent, 'the shipped example contributes a setting + a theme, and needs consent for its agent tool (2.369.43: a shim on every session PATH is a capability)');
ok((await post('/api/plugins/manifests/example.hello/enabled', { enabled: true, trusted: true })).status === 200 && await waitFor(async () => (await row('example.hello')).state === 'running', 25000), 'the installed example runs');
const inst2 = await post('/api/plugins/install', { source: 'path', value: path.join(src, 'hello') });
ok(inst2.status === 200 && inst2.body.replaced === true && !inst2.body.disabled && (await row('example.hello')).trusted && inst2.body.previous && fs.existsSync(path.join(inst2.body.previous, 'plugin', 'vibespace-plugin.json')) && fs.existsSync(path.join(inst2.body.previous, 'why.json')), 'reinstalling the IDENTICAL package MOVES the previous copy to data/plugins-trash (never deleted) and keeps the plugin enabled + trusted', inst2.body);
ok(await waitFor(async () => (await row('example.hello')).state === 'running', 25000), '…and restarts it (a fresh child, not the crash-backoff path)');
fs.symlinkSync('/etc', path.join(src, 'hello', 'etc-link'));
const sym = await post('/api/plugins/install', { source: 'path', value: path.join(src, 'hello') });
ok(sym.status === 400 && /symlink/.test(sym.body.error), 'a package containing a symlink is refused');
fs.unlinkSync(path.join(src, 'hello', 'etc-link'));
ok((await post('/api/plugins/install', { source: 'git', value: 'file:///tmp/x; rm -rf /' })).status === 400 && (await post('/api/plugins/install', { source: 'github-release', value: '../../x' })).status === 400 && (await post('/api/plugins/install', { source: 'ftp', value: 'x' })).status === 400, 'git/github-release/unknown sources validate their input before any process runs');
// zip (.vsp) upload — built with python's zipfile (a top-level folder wrap like GitHub zips)
const vsp = path.join(src, 'hello.vsp');
execFileSync('python3', ['-c', `import zipfile,os,sys
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w') as z:
    for d, _, fs_ in os.walk(src):
        for f in fs_:
            p = os.path.join(d, f); z.write(p, os.path.join('hello-plugin-main', os.path.relpath(p, src)))
`, path.join(src, 'hello'), vsp]);
const fd = new FormData(); fd.append('source', 'zip'); fd.append('value', 'hello.vsp'); fd.append('file', new Blob([fs.readFileSync(vsp)]), 'hello.vsp');
const zr = await fetch(base_ + '/api/plugins/install', { method: 'POST', body: fd }); const zb = await zr.json();
ok(zr.status === 200 && zb.plugin?.id === 'example.hello' && zb.replaced === true && zb.plugin.install.source === 'zip', 'a .vsp upload (multipart) installs, unwrapping the single top-level folder', zb);
ok(zb.disabled === true && !(await row('example.hello')).enabled && !(await row('example.hello')).trusted, 'replacing an enabled plugin from a DIFFERENT source drops its consent (2.369.43 — consent covers a package, not an id)', zb);
const evil = path.join(src, 'evil.vsp');
execFileSync('python3', ['-c', `import zipfile,sys
with zipfile.ZipFile(sys.argv[1], 'w') as z:
    z.writestr('vibespace-plugin.json', '{}'); z.writestr('../evil.txt', 'x')
`, evil]);
const fd2 = new FormData(); fd2.append('source', 'zip'); fd2.append('file', new Blob([fs.readFileSync(evil)]), 'evil.vsp');
const er = await fetch(base_ + '/api/plugins/install', { method: 'POST', body: fd2 }); const eb = await er.json();
ok(er.status === 400 && /path traversal/.test(eb.error) && !fs.existsSync(path.join(root, 'data', 'evil.txt')), 'Zip-Slip entries are refused before extraction');
const up0 = await post('/api/plugins/manifests/example.hello/update', {});
ok(up0.status === 400 && /uploaded file/.test(up0.body.error), 'update of a zip-installed plugin explains that a new upload replaces it');
await post('/api/plugins/install', { source: 'path', value: path.join(src, 'hello') });
await post('/api/plugins/manifests/example.hello/enabled', { enabled: true, trusted: true }); // the source swap above dropped consent — re-give it, then Update must keep it
const up = await post('/api/plugins/manifests/example.hello/update', {});
ok(up.status === 200 && up.body.plugin?.id === 'example.hello' && up.body.previous && (await row('example.hello')).install.updatedAt && (await row('example.hello')).trusted, 'update re-runs the recorded source (path), trashes the previous copy and KEEPS consent (the owner asked for this version from the source they already trusted; a changed capability surface still trips the drift check)');
ok((await post('/api/plugins/manifests/example.hello/update', {})).status === 200 && (await post('/api/plugins/manifests/nope.nope/update', {})).status === 404, 'update: unknown id → 404');
const stateFile = path.join(root, 'data', 'plugins-state', 'example.hello', 'counter.json');
// the update just restarted the plugin process — wait for it (gate flake: POST /x/count raced a 'starting' state)
ok(await waitFor(async () => (await row('example.hello')).state === 'running', 25000), 'the updated example is running again');
await j('/api/plugins/example.hello/x/count', { method: 'POST' });
ok(await waitFor(() => fs.existsSync(stateFile)), 'the example wrote its state file (so uninstall has state to preserve)');
const un = await j('/api/plugins/manifests/example.hello', { method: 'DELETE' });
ok(un.status === 200 && un.body.trash && fs.existsSync(path.join(un.body.trash, 'plugin', 'vibespace-plugin.json')) && fs.existsSync(path.join(un.body.trash, 'state', 'counter.json')) && !fs.existsSync(pdir('example.hello')) && !(await row('example.hello')), 'uninstall moves plugin + state to the trash, drops registry rows, and the list no longer shows it', un.body);
ok(!JSON.parse(fs.readFileSync(path.join(root, 'data', 'plugin-registry.json'), 'utf8')).installs['example.hello'], 'registry install record removed');
ok((await j('/api/plugins/manifests/nope.nope', { method: 'DELETE' })).status === 404, 'uninstall unknown → 404');
// a package declaring a capability over the host's own data dir is refused at install
fs.cpSync(path.join(REPO, 'docs/examples/hello-plugin'), path.join(src, 'evilcap'), { recursive: true });
writeJson(path.join(src, 'evilcap', 'vibespace-plugin.json'), { ...JSON.parse(fs.readFileSync(path.join(src, 'evilcap', 'vibespace-plugin.json'), 'utf8')), capabilities: { server: { fs: { read: [path.join(root, 'data')] } } } });
const ec = await post('/api/plugins/install', { source: 'path', value: path.join(src, 'evilcap') });
ok(ec.status === 400 && /covers the VibeSpace (install|data) dir/.test(ec.body.error), 'a capability over VibeSpace\'s own install/data dir is refused at install (named)', ec.body);
ok(tele.some((e) => e.name === 'plugin-install') && tele.some((e) => e.name === 'plugin-uninstall') && tele.some((e) => e.name === 'plugin-install-failed'), 'install/uninstall/failures reach telemetry');

// ── ③b lane engine-distribution: a PRIVATE git repository with the Plugin Git credential (design-custom-browser-plugin §5.1) ──
// The REAL installer + loader over a REAL bare repository; git is a RECORDING wrapper (scripts/fixtures/git-repo.mjs: argv,
// every env value, what the askpass answers, the files' modes, a shred witness) running the real git over it. The fixture
// token is built at runtime by concatenation (never one literal). Patched copies of the installer are the RED controls.
console.log('— git source + the Plugin Git credential (lane engine-distribution)');
{
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const G = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-trust-git-'));
  const { gitRepoFixture, URL_HTTPS, URL_SSH } = await import('./fixtures/git-repo.mjs');
  const pkg = (version) => ({ id: 'acme.private', version, engines: { vibespace: '2.369.24' }, label: 'Private' });
  const FX = gitRepoFixture(G, [{ files: { 'vibespace-plugin.json': pkg('1.0.0') }, tag: 'v1' }, { files: { 'vibespace-plugin.json': pkg('1.0.1') } }, { branch: 'bad', files: { 'etc-link': { link: '/etc' } } }]);
  const [sha1, sha2] = FX.shas;
  const { WRAP, calls, resetCalls, setMode } = FX;
  const TOKEN = ['fx', 'pat', 'q7Zm', '93kd', 'Lw2a', 'r8Tn'].join('-');            // built at runtime: never one literal
  const KEYTEXT = ['-----BEGIN OPENSSH ', 'PRIVATE KEY-----\n', 'Zml4dHVyZS1kZXBsb3kta2V5LW5vdC1hLWtleQ'.repeat(2), '\n-----END OPENSSH ', 'PRIVATE KEY-----'].join('');
  let credValues = null;
  const store = { resolveIntegration: (id) => { if (id !== 'plugin-git') throw new Error('unknown integration'); return credValues ? { source: 'user', values: { ...credValues }, whyCode: null, why: null } : { source: 'none', values: {}, whyCode: 'no-values', why: 'no key of your own and no cluster default' }; } };
  const GR = path.join(G, 'root'); fs.mkdirSync(path.join(GR, 'data', 'plugins'), { recursive: true });
  const quiet = { log() {}, warn() {} };
  const PL = require(path.join(REPO, 'src/server/plugin-loader.js')).create({ rootDir: GR, app: null, autoStart: false, log: quiet, integrations: () => store, gitBin: WRAP, gitTimeoutMs: 1500 });
  const URL_H = URL_HTTPS, URL_S = URL_SSH;
  const thr = async (p) => { try { await p; return null; } catch (e) { return e; } };
  const fetchOf = (cs) => cs.find((c) => c.argv.includes('fetch')) || null;
  /** THE LEAK CENSUS of one recorded call: the token / the key never on argv, in a URL, in any env value; the askpass names
   *  FILES (its text holds no value); the folder 0700, the value files 0600 */
  const leaks = (c, secret) => { const p = []; if (!c) return ['no fetch call recorded']; if (c.argv.some((a) => a.includes(secret))) p.push('argv'); for (const [k, v] of Object.entries(c.env)) if (String(v).includes(secret)) p.push('env ' + k); if (c.ask && c.ask.script.includes(secret)) p.push('askpass text'); if (c.ask && (c.ask.dirMode !== '700' || c.ask.files.some(([n, m]) => n !== 'askpass' && m !== '600'))) p.push('askpass modes ' + JSON.stringify([c.ask.dirMode, c.ask.files])); if (c.key && (c.key.mode !== '600' || c.key.dirMode !== '700')) p.push('key modes'); return p; };
  // gone = the folder is gone AND the value's inode (the hard-link witness) no longer holds the value: SHREDDED, not just unlinked
  const held = (w, v) => { try { return fs.readFileSync(w, 'utf8').includes(v); } catch { return false; } };
  const gone = (c) => !!c && !((c.ask && (fs.existsSync(c.ask.dir) || !c.ask.witness || held(c.ask.witness, TOKEN))) || (c.key && (fs.existsSync(c.key.dir) || !c.key.witness || held(c.key.witness, 'Zml4dHVyZS1kZXBsb3kta2V5'))));
  // ① a public repository, ref = a tag: no credential reaches git at all; the record names ref + sha + contentHash
  resetCalls();
  const r1 = await PL.install({ source: 'git', value: URL_H, ref: 'v1' });
  const f1 = fetchOf(calls());
  ok(r1.plugin?.id === 'acme.private' && r1.plugin.version === '1.0.0' && r1.ref === 'v1' && r1.sha === sha1 && PL.installRecord('acme.private').sha === sha1 && PL.installRecord('acme.private').ref === 'v1' && !!PL.installRecord('acme.private').contentHash && !fs.existsSync(path.join(GR, 'data', 'plugins', 'acme.private', '.git')),
    'a git install pins its ref (a tag here) and records {ref, sha, contentHash}; .git is removed', { ref: r1.ref, sha: r1.sha });
  ok(f1 && !f1.env.GIT_ASKPASS && f1.argv.includes('credential.helper=') && f1.argv.includes('--depth') && f1.argv.at(-2) === URL_H && f1.argv.at(-1) === 'v1' && f1.env.GIT_TERMINAL_PROMPT === '0' && f1.env.GIT_SSH_COMMAND === 'ssh -o BatchMode=yes',
    'no credential chosen ⇒ git gets none (no askpass), depth 1, the one ref, no prompt, no configured credential helper', f1 && f1.argv);
  ok(f1 && Object.keys(f1.env).every((k) => ['PATH', 'HOME', 'LANG', 'TMPDIR', 'XDG_RUNTIME_DIR', 'TERM', 'HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'GIT_SSL_CAINFO', 'GIT_SSL_CAPATH', 'GIT_TERMINAL_PROMPT', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL', 'GIT_SSH_COMMAND', 'GIT_ASKPASS', 'PWD', 'SHLVL', '_', 'OLDPWD', 'GIT_EXEC_PATH', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_PREFIX'].includes(k) || /^LC_[A-Z]+$/.test(k)),
    'the git child\'s env is serviceEnv (+ the egress door) + the named git switches — never the hub\'s', f1 && Object.keys(f1.env).join(' '));
  // ② https + the token: through the askpass FILE only; argv / URL / env token-free; the files 0600 in a 0700 folder; shredded after
  credValues = { host: 'repo.test', token: TOKEN };
  resetCalls();
  const r2 = await PL.install({ source: 'git', value: URL_H, ref: sha2, credential: 'plugin-git' });
  const f2 = fetchOf(calls());
  ok(r2.sha === sha2 && r2.plugin.version === '1.0.1' && f2 && f2.ask && f2.ask.user === 'x-access-token' && f2.ask.pass === TOKEN, 'a full sha ref is fetched exactly; the askpass answers the user name and the token — from its files', f2 && f2.ask && { user: f2.ask.user });
  ok(!leaks(f2, TOKEN).length, `the token is on no argv, in no URL, in no env value, not in the askpass text; the folder 0700, the files 0600 (${leaks(f2, TOKEN).join(', ') || 'clean'})`);
  ok(gone(f2) && !fs.readdirSync(path.join(GR, 'data', 'plugins-staging')).length, 'after the clone the credential files are SHREDDED (the token\'s inode — a hard-link witness — holds other bytes) and gone; the stage is empty');
  // ③ ssh + the deploy key: GIT_SSH_COMMAND names a 0600 key file; shredded after
  credValues = { host: 'repo.test', deployKey: KEYTEXT };
  resetCalls();
  const r3 = await PL.install({ source: 'git', value: URL_S, ref: 'v1', credential: 'plugin-git' });
  const f3 = fetchOf(calls());
  ok(r3.sha === sha1 && f3 && f3.key && f3.key.text === KEYTEXT + '\n' && /IdentitiesOnly=yes/.test(f3.env.GIT_SSH_COMMAND) && /BatchMode=yes/.test(f3.env.GIT_SSH_COMMAND) && !leaks(f3, 'Zml4dHVyZS1kZXBsb3kta2V5').length && gone(f3),
    'ssh: the deploy key rides a 0600 file GIT_SSH_COMMAND names (IdentitiesOnly, BatchMode), never argv / env text; gone after', f3 && f3.key && { mode: f3.key.mode });
  // ④ the credential refused BY NAME before git runs: none set · another host · the wrong kind for the URL
  const before = calls().length;
  credValues = null; const e4a = await thr(PL.install({ source: 'git', value: URL_H, credential: 'plugin-git' }));
  credValues = { host: 'other.test', token: TOKEN }; const e4b = await thr(PL.install({ source: 'git', value: URL_H, credential: 'plugin-git' }));
  credValues = { host: 'repo.test', deployKey: KEYTEXT }; const e4c = await thr(PL.install({ source: 'git', value: URL_H, credential: 'plugin-git' }));
  ok([e4a, e4b, e4c].every((e) => e && e.code === 'plugin_git_credential') && calls().length === before && /no key of your own/.test(e4a.message) && /other\.test.*repo\.test/.test(e4b.message), 'plugin_git_credential BY NAME (none set · it is for another host · no token for an https URL) — git never ran', [e4a, e4b, e4c].map((e) => e && e.message));
  // ⑤ the fleet's 'auto': the row when it holds a credential for this host, else none
  credValues = { host: 'other.test', token: TOKEN }; resetCalls();
  const r5 = await PL.install({ source: 'git', value: URL_H, ref: 'v1', credential: 'auto' });
  ok(r5.sha === sha1 && !fetchOf(calls()).env.GIT_ASKPASS, "'auto' (the boot job's) with a credential for another host ⇒ an anonymous clone, never the other host's token");
  // ⑥ named failures, each with the files shredded: a missing ref · an auth refusal · a timeout · a rejected tree
  credValues = { host: 'repo.test', token: TOKEN };
  const e6a = await thr(PL.install({ source: 'git', value: URL_H, ref: 'v9', credential: 'plugin-git' }));
  setMode({ fail: 'auth' }); resetCalls();
  const e6b = await thr(PL.install({ source: 'git', value: URL_H, ref: 'v1', credential: 'plugin-git' }));
  const f6b = fetchOf(calls());
  setMode({ fail: 'hang' }); resetCalls();
  const e6c = await thr(require(path.join(REPO, 'src/server/plugin-install.js')).create({ rootDir: GR, log: quiet, integrations: () => store, gitBin: WRAP, gitTimeoutMs: 600 }).install({ source: 'git', value: URL_H, ref: 'v1', credential: 'plugin-git' }));
  const f6c = fetchOf(calls());
  setMode(null);
  const e6d = await thr(PL.install({ source: 'git', value: URL_H, ref: 'bad', credential: 'plugin-git' }));
  ok(e6a && e6a.code === 'plugin_git_ref_missing' && e6b && e6b.code === 'plugin_git_auth' && /token of the Plugin Git credential/.test(e6b.message) && e6c && e6c.code === 'plugin_git_timeout' && e6d && e6d.code === 'plugin_tree_rejected' && /symlink/.test(e6d.message),
    'every failure is NAMED: plugin_git_ref_missing · plugin_git_auth · plugin_git_timeout · plugin_tree_rejected', [e6a, e6b, e6c, e6d].map((e) => e && `${e.code}: ${String(e.message).slice(0, 80)}`));
  ok(gone(f6b) && gone(f6c) && !fs.readdirSync(path.join(GR, 'data', 'plugins-staging')).length && PL.installRecord('acme.private').sha === sha1, '…the credential files are shredded on every failure too, the stage is empty, the installed record is untouched');
  // ⑦ update re-pulls the RECORDED source: its ref and its credential
  credValues = { host: 'repo.test', token: TOKEN };
  await PL.install({ source: 'git', value: URL_H, ref: 'main', credential: 'plugin-git' }); resetCalls();
  const u7 = await PL.update('acme.private');
  const f7 = fetchOf(calls());
  ok(u7.plugin.version === '1.0.1' && f7 && f7.argv.at(-1) === 'main' && f7.ask && f7.ask.pass === TOKEN && PL.installRecord('acme.private').sha === sha2, 'Update re-pulls the recorded ref with the recorded credential and records the new sha');
  // ⑧ the row's reachability Test: ls-remote with the credential (the same files, shredded)
  const PI = require(path.join(REPO, 'src/server/plugin-install.js'));
  const inst8 = PI.create({ rootDir: GR, log: quiet, integrations: () => store, gitBin: WRAP });
  resetCalls();
  const t8 = await inst8.testCredential(URL_H);
  const f8 = calls().find((c) => c.argv.includes('ls-remote'));
  ok(t8.ok && t8.head === sha2 && f8 && f8.ask && !leaks(f8, TOKEN).length && gone(f8), 'the Test = git ls-remote <url> HEAD with the credential (HEAD answered), token-free, its files gone after');
  // ⑨ RED CONTROLS — patched copies of the installer each turn a census above red
  const SRC = read('src/server/plugin-install.js');
  const M = mutantCopies('plugin-trust-git', REPO);
  const mutant = async (tag, from, to, check) => {
    if (!SRC.includes(from)) return ok(false, `control ${tag}: its anchor is gone from plugin-install.js`, from);
    const mod = M.load('src/server/plugin-install.js', SRC.replace(from, to), tag);
    const ins = mod.create({ rootDir: GR, log: quiet, integrations: () => store, gitBin: WRAP });
    resetCalls();
    let err = null; try { await ins.install({ source: 'git', value: URL_H, ref: 'v1', credential: 'plugin-git' }); } catch (e) { err = e; }
    return check(fetchOf(calls()), err);
  };
  const rr = await post('/api/plugins/install', { source: 'git', value: URL_H, credential: 'my-own-token' });
  ok(rr.status === 400 && rr.body.code === 'plugin_git_credential', 'the install ROUTE takes a credential by its integration row only (plugin-git) — any other value (a token typed into the form) is refused by name', rr.body);
  ok(await mutant('token-in-url', "spec.url, spec.ref || 'HEAD']", "(cred && cred.token ? spec.url.replace('https://', 'https://' + cred.username + ':' + cred.token + '@') : spec.url), spec.ref || 'HEAD']", (c) => leaks(c, TOKEN).includes('argv')), 'control (a): a copy that puts the token in the clone URL is RED (argv)');
  ok(await mutant('token-in-env', 'return { dir, files, add: { GIT_ASKPASS: ask } };', 'return { dir, files, add: { GIT_ASKPASS: ask, GIT_PASSWORD: cred.token } };', (c) => leaks(c, TOKEN).includes('env GIT_PASSWORD')), 'control (b): a copy that hands the token in the env is RED');
  ok(await mutant('askpass-leak', "*) cat ${shq(tok)} ;;", "*) echo ${shq(cred.token)} ;;", (c) => leaks(c, TOKEN).includes('askpass text')), 'control (c): a LEAKING askpass copy (the token in the script) is RED');
  process.on('exit', () => { try { fs.rmSync(G, { recursive: true, force: true }); } catch { /* gone */ } });
  ok(await mutant('no-shred', '  for (const f of c.files) gone = (await shredFile(f)) && gone;', '  for (const f of c.files) await fsp.unlink(f).catch(() => {});', (c) => !gone(c)), 'control (d): a copy that only UNLINKS the files (no overwrite) is RED — the token\'s inode still holds it');
  // ⑩ ROUND 2 (主开发's acceptance, MUST 2): the hub user's HOME git config is never read by a plugin's git child —
  // GIT_CONFIG_GLOBAL=/dev/null on every one beside GIT_CONFIG_NOSYSTEM=1: a url.insteadOf there would send the clone (and the
  // askpass's token) to another repository than the one credentialFor judged. REAL git under the wrapper applies the rewrite.
  const FX2 = gitRepoFixture(path.join(G, 'other'), [{ files: { 'vibespace-plugin.json': pkg('6.6.6') }, tag: 'v1' }]);
  const H2 = path.join(G, 'home-rewrite'); fs.mkdirSync(H2, { recursive: true });
  fs.writeFileSync(path.join(H2, '.gitconfig'), `[url "file://${FX2.bare}"]\n\tinsteadOf = file://${FX.bare}\n`);
  const homeWas = process.env.HOME;
  const viaHome = async (ins) => { process.env.HOME = H2; resetCalls(); try { return await ins.install({ source: 'git', value: URL_H, ref: 'v1', credential: 'plugin-git' }); } catch (e) { return { err: e }; } finally { process.env.HOME = homeWas; } };
  credValues = { host: 'repo.test', token: TOKEN };
  const r10 = await viaHome(require(path.join(REPO, 'src/server/plugin-install.js')).create({ rootDir: GR, log: quiet, integrations: () => store, gitBin: WRAP }));
  const c10 = calls(), n10 = c10.filter((c) => c.argv.includes('fetch') || c.argv.includes('ls-remote'));
  ok(r10.version === '1.0.0' && r10.sha === sha1 && c10.length >= 4 && c10.every((c) => c.env.GIT_CONFIG_GLOBAL === '/dev/null' && c.env.GIT_CONFIG_NOSYSTEM === '1') && n10.length === 1 && n10[0].ask && n10[0].ask.pass === TOKEN,
    'round 2: a HOME .gitconfig whose url.insteadOf rewrites the repository ⇒ the clone still comes from the URL credentialFor judged (v1 = 1.0.0 at its sha, ONE fetch answered by the askpass) — every git child (init · fetch · checkout · rev-parse) runs with GIT_CONFIG_GLOBAL=/dev/null beside GIT_CONFIG_NOSYSTEM=1', { v: r10.version, err: r10.err && r10.err.message, env: c10.map((c) => c.env.GIT_CONFIG_GLOBAL) });
  const homeAnchor = "GIT_CONFIG_GLOBAL: '/dev/null', ";
  ok(SRC.includes(homeAnchor), 'control: the HOME-config switch\'s anchor is in plugin-install.js');
  const r10m = await viaHome(M.load('src/server/plugin-install.js', SRC.replace(homeAnchor, ''), 'home-config').create({ rootDir: GR, log: quiet, integrations: () => store, gitBin: WRAP }));
  ok(r10m.version === '6.6.6', 'control (e): a copy WITHOUT GIT_CONFIG_GLOBAL follows the HOME rewrite — it installs the OTHER repository\'s package (6.6.6), fetched with the token meant for this one: RED', r10m.version || (r10m.err && r10m.err.message));
  await PL.install({ source: 'git', value: URL_H, ref: 'v1', credential: 'plugin-git' }); // the right package back
  // ⑪ ROUND 2 (SHOULD 5): a throw while the credential files are written (a full disk at the second) SHREDS the first one
  const PIx = require(path.join(REPO, 'src/server/plugin-install.js'));
  const W11 = path.join(G, 'witness-11');
  const failSecond = () => { let n = 0; return async (f, text, o) => { n++; if (n === 2) throw Object.assign(new Error('ENOSPC: no space left on device, open'), { code: 'ENOSPC' }); await fs.promises.writeFile(f, text, o); if (n === 1) fs.linkSync(f, W11); }; };
  const credT = { kind: 'token', host: 'repo.test', username: 'x-access-token', token: TOKEN };
  const st11 = fs.mkdtempSync(path.join(G, 'st11-'));
  const e11 = await thr(PIx.credentialFiles(st11, credT, { writeFile: failSecond() }));
  ok(e11 && e11.code === 'ENOSPC' && fs.existsSync(W11) && !held(W11, TOKEN) && !fs.readdirSync(st11).length, 'round 2: a throw at the SECOND credential file (ENOSPC) ⇒ the first is SHREDDED like every other way out — its inode (a hard-link witness) holds other bytes; the folder is gone', { code: e11 && e11.code, left: fs.readdirSync(st11) });
  const throwAnchor = '  } catch (e) { await shredCredentials({ dir, files }); throw e; }';
  ok(SRC.includes(throwAnchor), 'control: the shred-on-throw anchor is in plugin-install.js');
  fs.rmSync(W11, { force: true });
  const st11b = fs.mkdtempSync(path.join(G, 'st11b-'));
  await thr(M.load('src/server/plugin-install.js', SRC.replace(throwAnchor, '  } catch (e) { throw e; }'), 'no-shred-on-throw').credentialFiles(st11b, credT, { writeFile: failSecond() }));
  ok(held(W11, TOKEN), 'control (f): a copy that does not shred on that throw leaves the token in the first file\'s inode (only the stage\'s rm would unlink it) — RED');
  // ⑫ ROUND 3 (item 3): no HOME config is read (⑩), so a TLS-inspecting egress's trust root reaches git through the EGRESS DOOR —
  // GIT_SSL_CAINFO / GIT_SSL_CAPATH (a git on libcurl-GnuTLS ignores SSL_CERT_FILE / SSL_CERT_DIR); a HOME http.sslCAInfo never
  const H3 = path.join(G, 'home-ca'); fs.mkdirSync(H3, { recursive: true });
  fs.writeFileSync(path.join(H3, '.gitconfig'), `[http]\n\tsslCAInfo = ${path.join(H3, 'home-ca.pem')}\n`);
  const CAF = path.join(G, 'egress-ca.pem'), CAP = path.join(G, 'egress-certs');
  const envWas = { HOME: process.env.HOME, GIT_SSL_CAINFO: process.env.GIT_SSL_CAINFO, GIT_SSL_CAPATH: process.env.GIT_SSL_CAPATH };
  const viaCa = async (ins) => { Object.assign(process.env, { HOME: H3, GIT_SSL_CAINFO: CAF, GIT_SSL_CAPATH: CAP }); resetCalls(); try { return await ins.install({ source: 'git', value: URL_H, ref: 'v1', credential: 'plugin-git' }); } catch (e) { return { err: e }; } finally { for (const [k, v] of Object.entries(envWas)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } };
  /** what the REAL git reads for http.sslCAInfo under `env` ('' = nothing) */
  const caOf = (env) => { try { return execFileSync(FX.realGit, ['config', '--get', 'http.sslcainfo'], { env, cwd: G, encoding: 'utf8' }).trim(); } catch { return ''; } };
  const r12 = await viaCa(PIx.create({ rootDir: GR, log: quiet, integrations: () => store, gitBin: WRAP }));
  const c12 = calls();
  ok(r12.version === '1.0.0' && c12.length >= 4 && c12.every((c) => c.env.GIT_SSL_CAINFO === CAF && c.env.GIT_SSL_CAPATH === CAP) && caOf(c12[0].env) === '' && caOf({ ...c12[0].env, GIT_CONFIG_GLOBAL: undefined }) === path.join(H3, 'home-ca.pem'),
    'round 3: the hub\'s GIT_SSL_CAINFO / GIT_SSL_CAPATH reach EVERY git child (the egress door) while a HOME http.sslCAInfo is NOT read — real git under the child\'s env answers none (the same env without GIT_CONFIG_GLOBAL answers the HOME file: the probe sees it)', { v: r12.version, err: r12.err && r12.err.message, ca: c12.map((c) => c.env.GIT_SSL_CAINFO) });
  const AES = fs.readFileSync(path.join(REPO, 'src/agent-env.js'), 'utf8');
  const caAnchor = ", 'GIT_SSL_CAINFO', 'GIT_SSL_CAPATH']);", reqAnchor = "const { serviceEnv } = require('../agent-env.js');";
  ok(AES.includes(caAnchor) && SRC.includes(reqAnchor), 'control: the egress door\'s git trust-root names are in agent-env.js; plugin-install.js reads serviceEnv from it');
  const aeNoCa = M.write('src/agent-env.js', AES.replace(caAnchor, ']);'), 'no-git-ca');
  const r12m = await viaCa(M.load('src/server/plugin-install.js', SRC.replace(reqAnchor, `const { serviceEnv } = require(${JSON.stringify(aeNoCa)});`), 'no-git-ca').create({ rootDir: GR, log: quiet, integrations: () => store, gitBin: WRAP }));
  const c12m = calls();
  ok(c12m.length >= 1 && c12m.every((c) => !('GIT_SSL_CAINFO' in c.env) && !('GIT_SSL_CAPATH' in c.env) && caOf(c.env) === ''), 'control (g): a copy whose egress door lacks GIT_SSL_CAINFO / GIT_SSL_CAPATH hands git NO trust root at all (the HOME one is not read either) — behind a TLS-inspecting egress every clone fails: RED', { v: r12m.version, env: c12m.map((c) => c.env.GIT_SSL_CAINFO || null) });
}

// ── ③c lane kernel-asset-credential: THE KERNEL'S DOWNLOAD with the Plugin Git credential — the git road's census for the new
// road: the token rides ONE header (Authorization: Bearer) on the FIRST hop only (the plugin repository's own release asset),
// never in a URL, a log line, an error, the engine record, a fact or an env. A RECORDING fetch (no server); patched copies of
// engine-distribution.js are the RED controls (the token in the URL, in a log line, on every hop).
console.log('— the kernel download + the Plugin Git credential (lane kernel-asset-credential)');
{
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const K = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-trust-kernel-'));
  process.on('exit', () => { try { fs.rmSync(K, { recursive: true, force: true }); } catch { /* gone */ } });
  const TOKEN = ['fx', 'kdl', 'W3qe', '8Hn2', 'Pz5c'].join('-'); // built at runtime: never one literal
  const ID = 'acme.kernel-engine';
  const ASSET = 'https://api.github.com/repos/acme/kernel-engine/releases/assets/42';
  const SIGNED = 'https://objects.githubusercontent.com/release-asset/42?X-Amz-Signature=fx0';
  const KPATH = path.join(K, 'state', ID, 'kernel', 'linux-x64', 'chrome');
  let kTok = TOKEN; // round 2: the row's token (a cluster row is never through the form's validator)
  const store = { resolveIntegration: (id) => (id === 'plugin-git' ? { source: 'user', values: { host: 'github.com', token: kTok }, whyCode: null, why: null } : { source: 'none', values: {} }) };
  const loader = { list: () => [], installRecord: (id) => (id === ID ? { source: 'git', value: 'https://github.com/acme/kernel-engine.git', ref: 'v1', sha: 'c'.repeat(40) } : null) };
  const EDS = fs.readFileSync(path.join(REPO, 'src/server/engine-distribution.js'), 'utf8');
  const M = mutantCopies('plugin-trust-kernel', REPO);
  /** one download over a RECORDING fetch (the API's 302 → the signed file host's bytes, the wrong ones: the sha256 refuses
   *  them) → every request with its headers, every log line, the refusal, the engine record's text, the fact */
  const once = async (src, tag, wrap = null) => {
    const dataDir = path.join(K, 'data-' + tag);
    fs.mkdirSync(path.join(dataDir, 'plugins', ID), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'plugins', ID, 'kernel.json'), JSON.stringify({ schemaVersion: 1, layout: { archiveFormat: 'tar.zst', stripComponents: 1, binaryRelPath: 'chrome', requiredFiles: [] }, platforms: { 'linux-x64': { url: ASSET, sha256: 'a'.repeat(64), bytes: 4, version: '150.0.1.2-vs1' } } }));
    const asked = [], lines = [];
    const fetch0 = async (url, opts = {}) => { asked.push({ url: String(url), headers: { ...(opts.headers || {}) } }); return String(url).startsWith('https://api.github.com/') ? new Response(null, { status: 302, headers: { location: SIGNED } }) : new Response(Buffer.from('nope'), { status: 200, headers: { 'content-length': '4' } }); };
    const fetchImpl = wrap ? (url, opts = {}) => wrap(url, opts, fetch0) : fetch0;
    const mod = src === EDS ? require(path.join(REPO, 'src/server/engine-distribution.js')) : M.load('src/server/engine-distribution.js', src, tag);
    const ed = mod.create({ dataDir, engines: { kernelPath: () => KPATH }, loader, integrations: () => store, fetchImpl, log: { log: (l) => lines.push(String(l)), warn: (l) => lines.push(String(l)) } });
    let err = null; try { await ed.installKernel(ID, { wait: true }); } catch (e) { err = e; }
    let record = ''; try { record = fs.readFileSync(path.join(dataDir, 'browser-engines.json'), 'utf8'); } catch { /* none */ }
    return { asked, lines, err, record, fact: JSON.stringify(ed.kernelFact(ID)) };
  };
  /** THE LEAK CENSUS of one download: the token anywhere but the FIRST request's Authorization header */
  const leaksK = (r) => { const p = []; r.asked.forEach((q, i) => { if (q.url.includes(TOKEN)) p.push('url ' + i); for (const [k, v] of Object.entries(q.headers)) if (String(v).includes(TOKEN) && !(i === 0 && k === 'authorization')) p.push(`header ${k} ${i}`); }); if (r.lines.some((l) => l.includes(TOKEN))) p.push('log'); if (r.err && String(r.err.message).includes(TOKEN)) p.push('error'); if (r.record.includes(TOKEN)) p.push('record'); if (r.fact.includes(TOKEN)) p.push('fact'); if (Object.values(process.env).some((v) => String(v).includes(TOKEN))) p.push('env'); return p; };
  const r0 = await once(EDS, 'real');
  ok(r0.asked.length === 2 && r0.asked[0].url === ASSET && r0.asked[0].headers.authorization === `Bearer ${TOKEN}` && r0.asked[0].headers.accept === 'application/octet-stream' && r0.asked[1].url === SIGNED && !('authorization' in r0.asked[1].headers) && r0.err && r0.err.code === 'build_verify_failed',
    'the kernel\'s download: the first request (the plugin repository\'s own release asset) carries Authorization: Bearer + Accept; the signed file host\'s request carries none (the wrong bytes then refused by the sha256)', r0.asked.map((q) => ({ url: q.url.slice(0, 60), auth: !!q.headers.authorization })));
  ok(!leaksK(r0).length && r0.lines.some((l) => /with the Plugin Git credential/.test(l)) && /"credential":"plugin-git"/.test(r0.fact), `the token is in no URL, no other header, no log line, no error, no engine record, no fact, no env (${leaksK(r0).join(', ') || 'clean'}) — the journal and the fact say only that the Plugin Git credential was used`);
  const ctlK = async (tag, from, to, want) => { if (!EDS.includes(from)) return ok(false, `control ${tag}: its anchor is gone from engine-distribution.js`, from); const r = await once(EDS.replace(from, to), tag); return ok(leaksK(r).some((x) => x.startsWith(want)), `control ${tag}: RED — the census finds the token in the ${want} (${leaksK(r).join(', ')})`); };
  await ctlK('token-in-url', '      if (carry) headers.authorization = `Bearer ${auth.token}`;', "      if (carry) { headers.authorization = `Bearer ${auth.token}`; x.url += (x.url.includes('?') ? '&' : '?') + 'access_token=' + auth.token; }", 'url');
  await ctlK('token-in-log', "with the Plugin Git credential' : ''})`);", "with the Plugin Git credential ' + cr.token : ''})`);", 'log');
  await ctlK('every-hop', "      if (carry && x.host.replace(/:443$/, '') !== bound) carry = false;", '      ;', 'header authorization 1');

  // ── ROUND 2 (minor 4b): a token is ONE printable line — the row refuses one with a control character or a space at save time,
  // the download never builds a header from one (a cluster row skips the form), and a transport error is said by its code: a
  // library's message may quote the header (undici: «Headers.append: "Bearer …" is an invalid header value.»)
  const IRt = require(path.join(REPO, 'src/integration-registry.js'));
  const TA = ['fx', 'kcr', 'Q7we'].join('-'), TB = ['Lm4t', 'Xc9z'].join('-');
  const vs = [TA + '\r' + TB, TA + '\u0000' + TB, TA + ' ' + TB, TA + '\n' + TB].map((t) => IRt.validateValues('plugin-git', { host: 'github.com', token: t }));
  const vOk = IRt.validateValues('plugin-git', { host: 'github.com', token: TA + TB }), vShort = IRt.validateValues('plugin-git', { host: 'github.com', token: 'fx-kcr' });
  ok(vs.every((v) => v.ok === false && /one printable line/.test(v.errors.token || '')) && vOk.ok === true && vShort.ok === false,
    'round 2 (minor 4b): the Plugin Git row\'s token field refuses an interior CR / NUL / space / LF at save time («one printable line — no spaces, line breaks or control characters»); a printable token passes; < 8 characters still refused', vs.map((v) => v.errors && v.errors.token));
  /** the token's pieces anywhere a download leaves words (every request's every header too — this token is never sent) */
  const leaksAny = (r, needle) => { const p = []; r.asked.forEach((q, i) => { if (q.url.includes(needle)) p.push('url ' + i); for (const [k, v] of Object.entries(q.headers)) if (String(v).includes(needle)) p.push(`header ${k} ${i}`); }); if (r.lines.some((l) => l.includes(needle))) p.push('log'); if (r.err && String(r.err.message).includes(needle)) p.push('error'); if (r.record.includes(needle)) p.push('record'); if (r.fact.includes(needle)) p.push('fact'); return p; };
  // a fetch that judges its headers as undici does (new Headers throws, quoting the value)
  const strict = async (url, opts, next) => { new Headers(opts.headers || {}); return next(url, opts); };
  kTok = TA + '\r' + TB;
  const rCr = await once(EDS, 'cr-token', strict);
  kTok = TOKEN;
  ok(!leaksAny(rCr, TA).length && !leaksAny(rCr, TB).length && rCr.asked.length >= 1 && !('authorization' in rCr.asked[0].headers) && rCr.err && rCr.err.code === 'build_verify_failed',
    `round 2 (minor 4b): a row token with an interior CR (a cluster row) is never put in a header — the download goes anonymous; its pieces are in no request, log line, error, engine record or fact (${[...leaksAny(rCr, TA), ...leaksAny(rCr, TB)].join(', ') || 'clean'})`, rCr.err && `${rCr.err.code}: ${String(rCr.err.message).slice(0, 160)}`);
  // a transport error that QUOTES the header it refused — said by its kind, never its message
  const quoting = async (url, opts, next) => { if (opts.headers && opts.headers.authorization) throw new TypeError(`invalid header value: ${opts.headers.authorization}`); return next(url, opts); };
  const rQ = await once(EDS, 'quoting', quoting);
  ok(!leaksK(rQ).length && rQ.err && rQ.err.code === 'build_fetch_failed' && /api\.github\.com could not be reached \(TypeError\)/.test(rQ.err.message),
    `round 2 (minor 4b): a transport error whose message quotes the Authorization header ⇒ «api.github.com could not be reached (TypeError)» — the message is never echoed into the error, the record, the journal or the fact (${leaksK(rQ).join(', ') || 'clean'})`, rQ.err && String(rQ.err.message).slice(0, 160));

  // ── ROUND 2 (minor 4a): ONE git-source grammar — plugin-install's gitSpecOf installs exactly what the PURE gitRepoOf parses
  const PIg = require(path.join(REPO, 'src/server/plugin-install.js'));
  const EKg = require(path.join(REPO, 'src/engine-kernel.js'));
  const SHAPES = ['https://github.com/acme/kernel-engine.git', 'https://github.com/acme/kernel-engine', 'https://github.com/acme/kernel-engine/', 'https://GitHub.com/acme/kernel-engine.git', 'https://github.com:443/acme/kernel-engine.git',
    'https://git.example.test:8443/team/sub/kp.git', 'https://git.example.test/kp.git', 'git@github.com:acme/kernel-engine.git', 'git@github.com:/acme/kernel-engine.git', 'git@github.com:acme//kernel-engine.git', 'https://github.com/acme//kernel-engine',
    'ssh://git@github.com/acme/kernel-engine.git', 'ssh://git@github.com:22/acme/kernel-engine', 'ssh://git@git.example.test:2222/team/kp.git', 'git@github.com:acme/kernel-engine.git#v1', 'https://github.com/acme/kernel-engine.git#main',
    // what git cannot clone (a local path, a port that is not one, a dot segment, no path) and what was never a git URL — neither knows it
    'git@github.com/acme/kernel-engine', 'ssh://git@github.com:acme/kernel-engine', 'https://github.com/acme/../kernel-engine', 'https://github.com/', 'https://user@github.com/acme/k', 'file:///tmp/x', 'acme/kernel-engine'];
  const rowsG = SHAPES.map((v) => { let spec = null; try { spec = PIg.gitSpecOf(v); } catch { spec = null; } const src = typeof EKg.gitRepoOf === 'function' ? EKg.gitRepoOf(v) : null; return { v, installs: !!spec, parses: !!src, same: !spec || !src || (spec.host === src.host && spec.https === (src.https === undefined ? spec.https : src.https)) }; });
  const oddG = rowsG.filter((r) => r.installs !== r.parses || !r.same);
  ok(!oddG.length && rowsG.filter((r) => r.installs).length === 16,
    'round 2 (minor 4a): ONE git-source grammar — every shape plugin-install installs (https / git@ / ssh://, a port, sub-groups, one segment, a leading or doubled slash, #ref) is a repository the PURE gitRepoOf parses, with the same host and the same road; what one refuses the other refuses', oddG);
  // ROUND 3 (major): THE STRING GIT RECEIVES IS THE STRING THE GRAMMAR PARSED — 9d02b48f's gitSpecOf validated a TRIMMED copy
  // (gitRepoOf trims inside) and returned the untrimmed slice before `#`: a space / tab / CR / LF there reached `git fetch --`
  const WIDE = ['https://github.com/acme/kernel-engine #main', 'https://github.com/acme/kernel-engine\n#main', 'https://github.com/acme/kernel-engine\t#main', 'https://github.com/acme/kernel-engine\r#main',
    'git@github.com:acme/kernel-engine #v1', 'git@github.com:acme/kernel-engine\r#v1', 'https://github.com/acme/kernel-engine#ma in', 'https://github.com/acme/kernel-engine#main\u0000', 'https://github.com/acme/ kernel-engine'];
  const wideR = WIDE.map((v) => { let spec = null, e = null; try { spec = PIg.gitSpecOf(v); } catch (x) { e = x; } return { v: JSON.stringify(v), url: spec ? JSON.stringify(spec.url) : null, code: e ? e.code || `(no code) ${String(e.message).slice(0, 50)}` : null, hostOf: PIg.gitHostOf(v) }; });
  ok(wideR.every((r) => r.url === null && r.code === 'plugin_git_spec' && r.hostOf === null),
    'round 3 (major): a space, tab, CR or LF right before #ref (and any whitespace or control character anywhere: inside the ref, after it, in the path) ⇒ refused BY NAME plugin_git_spec — git is never handed it; gitHostOf agrees (null)', wideR.filter((r) => r.url !== null || r.code !== 'plugin_git_spec' || r.hostOf !== null));
  const recRows = [...SHAPES, ...WIDE, '  https://GitHub.com/acme/kernel-engine.git#v1  ', 'git@github.com:/acme/kernel-engine.git#main'].map((v) => { let spec = null; try { spec = PIg.gitSpecOf(v); } catch { spec = null; } const src = EKg.gitRepoOf(v); const h = PIg.gitHostOf(v);
    return { v: JSON.stringify(v), same: spec ? !!src && spec.url === src.url && spec.host === src.host && spec.https === src.https && (spec.ref || null) === (src.ref || null) && h === src.host : h === (src ? src.host : null) }; });
  const ePlain = (() => { try { PIg.gitSpecOf('git@github.com/acme/kernel-engine'); return null; } catch (e) { return e; } })();
  ok(recRows.every((r) => r.same) && ePlain && ePlain.code === 'plugin_git_spec' && ePlain.status === 400 && /URL must be https:\/\/host\/owner\/repo/.test(ePlain.message) && /a local path to git/.test(ePlain.message),
    'round 3 (major): gitSpecOf hands git the PARSED RECORD\'s url (the grammar\'s own string) with its ref, gitHostOf = the same record\'s host — on every shape above; a refusal is 400 plugin_git_spec with the grammar\'s reason («… is a local path to git …»)', { odd: recRows.filter((r) => !r.same), plain: ePlain && `${ePlain.code}: ${ePlain.message}` });
  const APIg = 'https://api.github.com/repos/acme/kernel-engine/releases/assets/42';
  const v3 = ['git@github.com:/acme/kernel-engine.git', 'git@github.com:acme//kernel-engine.git', 'https://github.com/acme//kernel-engine'].map((v) => EKg.kernelCredentialVerdict({ kernelUrl: APIg, install: { source: 'git', value: v }, integration: { host: 'github.com' } }));
  ok(v3.every((x) => x.use === true && x.repository && x.repository.path === 'acme/kernel-engine'),
    'round 2 (minor 4a): the three install values git and plugin-install accept that b43799e5\'s parser called not-a-git-install (a leading slash, a doubled slash) ⇒ the verdict knows the repository — the credential rides its API asset', v3.map((x) => x.why));
}

// ── ④ remote shim shipping ──
console.log('— shims');
await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: true, trusted: true });
writeJson(path.join(pdir('acme.trusty'), 'vibespace-plugin.json'), { ...trustyManifest, capabilities: { server: { fs: { read: ['/etc'] }, childProcess: true } }, contributes: { ...trustyManifest.contributes, agentTools: [{ name: 'ping', description: 'pong', args: {} }] } });
await post('/api/plugins/manifests/reload', {});
await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: true, trusted: true }); // the tool changed the hash → re-consent
const shim = path.join(root, 'data', 'bin', 'vibespace-tool-acme.trusty-ping');
ok(fs.existsSync(shim) && /const INSTANCE_URL = "https:\/\/vs\.example\.test";/.test(fs.readFileSync(shim, 'utf8')) && loader.shimNames().includes('vibespace-tool-acme.trusty-ping'), 'shims bake the instance public URL (instance-url.js) as the fallback call-back and are listed by shimNames()');
const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
HostManager.extraAgentTools = () => ['vibespace-tool-acme.trusty-ping', 'bad name', 'vibespace-status'];
ok(HostManager.agentTools().includes('vibespace-tool-acme.trusty-ping') && HostManager.agentTools().filter((n) => n === 'vibespace-status').length === 1 && !HostManager.agentTools().includes('bad name'), 'HostManager.agentTools() = static tools + valid plugin shims (deduped, filtered)');
HostManager.extraAgentTools = () => [];
loader.shutdown(); srv.close();
try { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(src, { recursive: true, force: true }); } catch {}

// ── ⑤ wiring pins ──
console.log('— wiring pins');
const pc = read('src/lib/plugin-client.js');
ok(/if \(!m\.trusted\) \{ if \(cur\) await this\._deactivate\(m\.id\); return; \}/.test(pc) && /await import\(\/\* @vite-ignore \*\/ url\)/.test(pc) && /mod\.activate\(api\)/.test(pc) && /cur\.mod\?\.deactivate/.test(pc) && /ctl\.abort\(\)/.test(pc), 'plugin-client imports a module ONLY when the server says trusted, calls activate(api), deactivates + aborts on disable');
ok(/registerPluginSettings\(m\.id, m\.label \|\| m\.id, items\)/.test(pc) && /unregisterPluginSettings\(id\)/.test(pc) && /registerPluginTheme\?\.\(key, `\$\{th\.label\} \(plugin\)`/.test(pc) && /unregisterPluginTheme\?\.\(key\)/.test(pc) && /this\.errors\.set\(m\.id, msg\)/.test(pc) && /showToast\(t\('Plugin \{id\} failed to load: \{error\}'/.test(pc), 'plugin-client registers/unregisters contributed settings + themes and reports module load errors (toast + errors map)');
ok(/fetch: \(p, opts\) => \{[\s\S]{0,300}\/api\/plugins\/\$\{encodeURIComponent\(id\)\}\/x\$\{rel\}/.test(pc) && /app\.settings\?\.on\?\.\(p, h\)/.test(pc), 'the host API scopes fetch to the plugin\'s own routes and subscribes settings per path (settings.js on(path, cb))');
const pui = read('src/lib/plugins-ui.js');
ok(/_pluginConsentDialog\(p, rr\.capabilities\)/.test(pui) && /enablePlugin\(p, \{ trusted: true \}\)/.test(pui) && /t\('Enable \(trusted\)'\)/.test(pui) && /escHtml\(t\(it\.text, it\.params \|\| \{\}\)\)/.test(pui), 'the panel turns a 409 consentRequired into the consent dialog (capability items via t(text, params)) and re-enables with trusted:true');
ok(/_pluginInstallDialog\(/.test(pui) && /\/api\/plugins\/install/.test(pui) && /new FormData\(\)/.test(pui) && /method: 'DELETE'/.test(pui) && /\/update`, \{ method: 'POST' \}/.test(pui) && /showConfirmDialog\(\{ title: t\('Uninstall plugin'\)/.test(pui), 'the panel has Install plugin… (JSON + multipart), Update, and a confirmed Uninstall');
// lane plugin-settings-p0: a manifest plugin is a LIST row (pluginRow) — its strings reach the DOM as textContent / title, never innerHTML
const rowFnSrc = pui.slice(pui.indexOf('function pluginRow('), pui.indexOf('\n}\n', pui.indexOf('function pluginRow(')));
ok(rowFnSrc.length > 100 && !/innerHTML/.test(rowFnSrc) && /className: 'plugin-row-name', textContent: label/.test(rowFnSrc) && /p\.notice, clientErr \? t\('Client module error: \{error\}'/.test(pui) && !/innerHTML = `[^`]*\$\{(?!escHtml)[^}]*\bp\.(notice|id|label|description|version|lastError)\b/.test(pui), 'notices / errors / ids reach the DOM as text (pluginRow: textContent / title — no manifest string in innerHTML; manifest strings sync to every client)');
const ss = read('src/lib/settings-schema.js');
ok(/export function registerPluginSettings\(pluginId, label, items\)/.test(ss) && /export function unregisterPluginSettings\(pluginId\)/.test(ss) && /export function pluginSettingPath\(pluginId, key\)/.test(ss) && /t\('Plugin: \{name\}'/.test(ss), 'settings-schema exposes register/unregister/path (the only mutation path)');
const tj = read('src/lib/themes.js');
ok(/registerPluginTheme\(key, label, cssVars, terminalColors\)/.test(tj) && /unregisterPluginTheme\(key\)/.test(tj) && /getPluginThemes\(\)/.test(tj) && /this\._pendingTheme\.startsWith\('plugin-'\)/.test(tj), 'ThemeManager registers plugin themes under plugin-* and keeps a pending plugin theme instead of falling back to dark');
ok(/getPluginThemes\?\.\(\)/.test(read('src/lib/app.js')), 'the theme picker lists plugin themes in their own group');
const ld = read('src/server/plugin-loader.js');
ok(/execArgv: permissionArgs\(rec, dataDir\)/.test(ld) && /'--permission'/.test(ld) && /--allow-child-process/.test(ld) && /delete env\.NODE_OPTIONS/.test(ld) && /ERR_ACCESS_DENIED/.test(ld), 'the loader forks plugin servers under node --permission with allowlists from the manifest (NODE_OPTIONS stripped) and classifies denials');
ok(/registry\.trust\[id\] = \{ trusted: true, trustedAt: Date\.now\(\), capabilitiesHash: hash \}/.test(ld) && /needsConsent\(manifest\) && !isTrusted\(rec\)/.test(ld) && /res\.status\(403\)\.json\(\{ error: `plugin "\$\{rec\.id\}" is not trusted/.test(ld), 'trust is recorded with the capabilities hash, drift disables at discovery, the module route is 403 without it');
ok(/HostManager\.extraAgentTools = \(\) => pluginLoader\.shimNames\(\)/.test(read('src/server/mounts-plugins-wiring.js')) && /instanceUrl\?\.onChange\?\./.test(read('src/server/mounts-plugins-wiring.js')) && ((read('src/ws-create.js') + read('src/spawn/ssh.js') + read('src/spawn/dial.js')).match(/HostManager\.agentTools\(\)/g) || []).length === 2 && !/HostManager\.AGENT_TOOLS\b/.test(read('src/ws-create.js')), 'shims ship with the core tools: wiring installs the provider, ws-create distributes agentTools() (ssh + dial), instance-url changes regenerate them');
ok(fs.existsSync(path.join(REPO, 'docs/plugins.md')) && /contributes\.settings/.test(read('docs/plugins.md')) && /--permission/.test(read('docs/plugins.md')) && /plugins\.md/.test(read('docs/README.md')), 'docs/plugins.md documents the manifest, tiers, consent, install sources and enforcement; indexed in docs/README.md');
ok(/'test-plugin-trust'/.test(read('scripts/ci.mjs')), 'this suite is in the release gate');
for (const dict of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) ok(['Install plugin…', 'Enable (trusted)', 'Uninstall…', 'Plugin: {name}', 'Server: read files under {paths}'].every((k) => read(dict).includes(JSON.stringify(k) + ':')), `${dict} carries the Ph4 strings`);
const ex = JSON.parse(read('docs/examples/hello-plugin/vibespace-plugin.json'));
ok(ex.contributes.settings?.length === 1 && ex.contributes.themes?.length === 1 && fs.existsSync(path.join(REPO, 'docs/examples/hello-plugin', ex.contributes.themes[0].file)), 'the shipped example demonstrates a contributed setting and theme');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
