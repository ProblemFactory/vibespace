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
import './scratch.mjs';   // FIRST (B-ba47 B2): it loads scratch.mjs at run time too (a dynamic import) — the re-home comes before any of its code
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 400) : '')); } };
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
const waitFor = async (pred, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(100); } return !!(await pred()); };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const writeJson = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };

// ── ① validator: contributions + capabilities + module tier + consent helpers ──
console.log('— validator');
const PM = require(path.join(REPO, 'src/plugin-manifest.js'));
const { validateManifest, needsConsent, hasDeclaredCapabilities, capabilitySummary, capabilitiesHash, normalizeFsPath } = PM;
const base = { id: 'acme.tool', version: '1.0.0', engines: { vibespace: '2.369.24' }, server: true };
const V = (m, o = {}) => validateManifest(m, { hostVersion: '2.369.30', ...o });
ok(verdictOf(V({ ...base, contributes: { settings: [{ key: 'greeting', type: 'string', default: 'hi', label: 'Greeting' }, { key: 'n', type: 'number', default: 3, label: 'N', min: 0, max: 9 }, { key: 'on', type: 'boolean', default: true, label: 'On' }, { key: 'lvl', type: 'select', default: 'a', label: 'Level', options: ['a', { value: 'b', label: 'Bee' }] }] } }).ok), 'settings: string/number/boolean/select validate and normalize');
ok(!V({ ...base, contributes: { settings: [{ key: 'x', type: 'select', default: 'z', label: 'X', options: ['a'] }] } }).ok && !V({ ...base, contributes: { settings: [{ key: 'x', type: 'boolean', default: 'yes', label: 'X' }] } }).ok && !V({ ...base, contributes: { settings: [{ key: 'bad key', type: 'string', label: 'X' }] } }).ok && !V({ ...base, contributes: { settings: [{ key: 'a', type: 'string', label: 'A' }, { key: 'a', type: 'string', label: 'B' }] } }).ok, 'settings: wrong default type / default outside options / bad key / duplicate key are errors');
ok(gateOf(V({ ...base, contributes: { themes: [{ id: 'night', label: 'Night', file: 'themes/night.json' }] } }).ok) && !V({ ...base, contributes: { themes: [{ id: 'night', label: 'Night', file: '../x.json' }] } }).ok && !V({ ...base, contributes: { themes: [{ id: 'Night!', label: 'N', file: 't.json' }] } }).ok, 'themes: relative .json inside the plugin dir, slug ids');
const home = '/home/tester';
const capsV = V({ ...base, capabilities: { server: { fs: { read: ['~/data', '/srv/x/'], write: ['~/data'] }, spawn: ['ls'], net: ['api.example.com', { host: 'x.example.com' }] } } }, { homeDir: home });
ok(gateOf(capsV.ok) && capsV.manifest.capabilities.server.fs.read.join() === '/home/tester/data,/srv/x' && capsV.manifest.capabilities.server.fs.write.join() === '/home/tester/data' && capsV.manifest.capabilities.server.childProcess === true && capsV.manifest.capabilities.server.net.join() === 'api.example.com,x.example.com' && verdictOf(capsV.warnings.some((w) => /spawn is treated as childProcess/.test(w))), 'capabilities normalize: ~ expands, trailing slash trimmed, spawn ⇒ childProcess (warned), net hosts', capsV);
ok(!V({ ...base, capabilities: { server: { fs: { read: ['../etc'] } } } }).ok && !V({ ...base, capabilities: { server: { fs: { read: ['relative/path'] } } } }).ok && !V({ ...base, capabilities: { server: { fs: { read: ['/'] } } } }, { forbiddenRoots: ['/srv/vibespace'] }).ok, 'capabilities: .., relative and / are refused');
const forb = V({ ...base, capabilities: { server: { fs: { read: ['/srv/vibespace/data/plugins'] } } } }, { forbiddenRoots: [{ path: '/srv/vibespace/data', label: 'the VibeSpace data dir' }] });
ok(!forb.ok && gateOf(/covers the VibeSpace data dir/.test(forb.errors.join())) && !V({ ...base, capabilities: { server: { fs: { read: ['/srv'] } } } }, { forbiddenRoots: ['/srv/vibespace'] }).ok, 'a declared path covering (or covered by) a forbidden root is an error, named');
ok(normalizeFsPath('~', { homeDir: home }).path === home && normalizeFsPath('/a//', {}).path === '/a' && verdictOf(normalizeFsPath('', {}).error), 'normalizeFsPath edge cases');
const modV = V({ ...base, client: 'module' });
ok(gateOf(modV.ok) && modV.manifest.clientEntry === 'client.js' && V({ ...base, client: 'module', clientEntry: 'ui/app.mjs' }).manifest.clientEntry === 'ui/app.mjs' && !V({ ...base, client: 'module', clientEntry: '../x.js' }).ok && !V({ ...base, client: 'module', clientEntry: 'x.html' }).ok, 'module tier: clientEntry defaults to client.js, relative .js only');
const alias = V({ ...base, client: 'trusted' });
ok(gateOf(alias.ok) && alias.manifest.client === 'module' && verdictOf(alias.warnings.some((w) => /alias/.test(w))), '"trusted" is accepted as an alias of "module" with a warning');
ok(!needsConsent(V(base).manifest) && gateOf(needsConsent(modV.manifest)) && gateOf(needsConsent(capsV.manifest)) && gateOf(hasDeclaredCapabilities(capsV.manifest)) && !hasDeclaredCapabilities(V(base).manifest), 'needsConsent = module tier or any declared server capability');
const sumIds = capabilitySummary({ ...capsV.manifest, client: 'module', contributes: { ...capsV.manifest.contributes, agentTools: [{ name: 'do' }] } }).map((i) => i.id);
ok(sumIds.join() === 'client-module,server-process,fs-read,fs-write,child-process,net,agent-tools' && capabilitySummary(V({ ...base, server: false }).manifest)[0].id === 'none', `capabilitySummary lists every declared power in a fixed order (${sumIds.join(',')})`);
const h1 = capabilitiesHash(capsV.manifest), h2 = capabilitiesHash(V({ ...base, capabilities: { server: { net: ['api.example.com', { host: 'x.example.com' }], spawn: ['ls'], fs: { write: ['~/data'], read: ['~/data', '/srv/x/'] } } } }, { homeDir: home }).manifest); // same lists, different OBJECT key order
ok(gateOf(h1) && h1 === h2 && h1 !== capabilitiesHash(V({ ...base, capabilities: { server: { fs: { read: ['~/data'] } } } }, { homeDir: home }).manifest) && h1 !== capabilitiesHash({ ...capsV.manifest, contributes: { ...capsV.manifest.contributes, agentTools: [{ name: 'x' }] } }), 'capabilitiesHash is key-order independent and changes on any consent-relevant change (capability or agent tool)');

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
ok(gateOf(tr) && gateOf(tr.valid) && !tr.enabled && gateOf(tr.needsConsent) && gateOf(tr.consentRequired) && !tr.trusted && tr.client === 'module' && tr.clientEntry === 'client.js' && tr.label === 'Trusty', 'the module-tier fixture lists as valid, disabled, consent required', tr);
ok(tr.capabilitySummary.map((i) => i.id).join() === 'client-module,server-process,fs-read' && gateOf(/\/etc/.test(tr.capabilitySummary[2].params.paths)) && verdictOf(tr.capabilitiesHash), 'the list row carries the consent summary + hash the panel renders');
ok(tr.contributes.settings.length === 1 && tr.contributes.themes.find((t) => t.id === 'night').ok === true && tr.contributes.themes.find((t) => t.id === 'bad').ok === false && verdictOf(tr.warnings.some((w) => /theme "bad"/.test(w))), 'theme files are validated at discovery (a bad one is flagged, never served as CSS)');
const denied = await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: true });
ok(denied.status === 409 && denied.body.consentRequired === true && gateOf(Array.isArray(denied.body.capabilities)) && denied.body.capabilities[0].id === 'client-module' && verdictOf(/needs your consent/.test(denied.body.error)), 'enable WITHOUT trusted → 409 consentRequired with the capability list (the manifest alone never grants trust)', denied.body);
ok((await j('/plugins/acme.trusty/client.js')).status === 404, 'the client module is not served while disabled');
const en = await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: true, trusted: true });
ok(en.status === 200 && gateOf(en.body.plugin.enabled) && gateOf(en.body.plugin.trusted) && gateOf(en.body.plugin.trustedAt) && !en.body.plugin.consentRequired, 'enable WITH trusted:true records consent (trusted + trustedAt) and starts the plugin');
const reg = JSON.parse(fs.readFileSync(path.join(root, 'data', 'plugin-registry.json'), 'utf8'));
ok(reg.trust['acme.trusty']?.trusted === true && reg.trust['acme.trusty'].capabilitiesHash === tr.capabilitiesHash, 'the registry stores { trusted, trustedAt, capabilitiesHash }');
const mod = await j('/plugins/acme.trusty/client.js');
ok(mod.status === 200 && gateOf(/text\/javascript/.test(mod.headers.get('content-type') || '')) && !mod.headers.get('content-security-policy') && gateOf(/activate/.test(mod.body)) && mod.headers.get('x-content-type-options') === 'nosniff', 'the trusted client module is served SAME-ORIGIN as javascript (no sandbox CSP), nosniff');
const th = await j('/plugins/acme.trusty/themes/night.json');
ok(th.status === 200 && gateOf(/application\/json/.test(th.headers.get('content-type') || '')) && th.body.css['--accent'] === '#123456', 'declared theme files are served as JSON');
ok((await j('/plugins/acme.trusty/server.js')).status === 404 && (await j('/plugins/acme.trusty/../acme.greedy/server.js')).status !== 200, 'nothing else in the plugin dir is served (server.js, traversal)');
ok(verdictOf(await waitFor(async () => (await row('acme.trusty')).state === 'running')), 'the server process runs under node --permission');
const host = await j('/api/plugins/acme.trusty/x/host');
ok(host.status === 200 && typeof host.body.hostname === 'string' && host.body.hostname.length > 0, `a DECLARED fs path (/etc) is readable inside the sandbox (${JSON.stringify(host.body).slice(0, 80)})`);
const caps = await j('/api/plugins/manifests/acme.trusty/capabilities');
ok(caps.status === 200 && caps.body.trusted === true && caps.body.trust.capabilitiesHash === tr.capabilitiesHash && caps.body.summary.length === 3, 'GET …/capabilities returns the summary + the trust record (Show capabilities…)');
// undeclared access → denied inside the plugin, reported by the loader, host unaffected
const g = await post('/api/plugins/manifests/acme.greedy/enabled', { enabled: true });
ok(g.status === 200, 'a plugin with no declared capabilities enables without consent');
ok(verdictOf(await waitFor(async () => /ERR_ACCESS_DENIED|denied file system read/.test((await row('acme.greedy')).lastError || ''), 8000)), `an UNDECLARED read (/etc/hostname) is denied by node --permission and surfaced as the plugin's error: ${(await row('acme.greedy')).lastError}`);
ok(gateOf(['crashed', 'starting', 'parked', 'stopped'].includes((await row('acme.greedy')).state)) && (await row('acme.trusty')).state === 'running' && (await j('/api/plugins/manifests')).status === 200, 'the host and the other plugin are unaffected by the denied plugin');
await post('/api/plugins/manifests/acme.greedy/enabled', { enabled: false });
ok(gateOf(tele.some((e) => e.name === 'plugin-trusted')) && verdictOf(tele.some((e) => e.name === 'plugin-crash')), 'consent + crashes reach telemetry');
// consent drift: a manifest that grows a capability is switched off until reviewed
writeJson(path.join(pdir('acme.trusty'), 'vibespace-plugin.json'), { ...trustyManifest, capabilities: { server: { fs: { read: ['/etc'] }, childProcess: true } } });
await post('/api/plugins/manifests/reload', {});
tr = await row('acme.trusty');
ok(!tr.enabled && gateOf(/capabilities changed/.test(tr.notice || '')) && gateOf(tr.consentRequired) && !tr.trusted, 'CONSENT DRIFT: after the manifest gained childProcess, reload disables the plugin with a notice (old consent does not carry over)', tr);
ok((await j('/plugins/acme.trusty/client.js')).status === 404, '…and the module is no longer served');
const again = await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: true });
ok(again.status === 409 && again.body.changed === true && gateOf(/changed its capabilities/.test(again.body.error)) && verdictOf(again.body.capabilities.some((c) => c.id === 'child-process')), 'enable without re-consent → 409 changed:true naming the new capability');
ok((await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: true, trusted: true })).body.plugin.trusted === true, 're-consent enables it again');
await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: false });

// ── ③ install sources ──
console.log('— install / update / uninstall');
const src = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-trust-src-'));
fs.cpSync(path.join(REPO, 'docs/examples/hello-plugin'), path.join(src, 'hello'), { recursive: true });
const inst = await post('/api/plugins/install', { source: 'path', value: path.join(src, 'hello') });
ok(inst.status === 200 && inst.body.plugin?.id === 'example.hello' && inst.body.plugin.install?.source === 'path' && !inst.body.replaced && verdictOf(fs.existsSync(path.join(pdir('example.hello'), 'vibespace-plugin.json'))), 'install from a local path lands under data/plugins/<id> with the source recorded', inst.body);
ok((await row('example.hello')).contributes.settings.length === 1 && (await row('example.hello')).contributes.themes[0].ok === true && verdictOf((await row('example.hello')).needsConsent), 'the shipped example contributes a setting + a theme, and needs consent for its agent tool (2.369.43: a shim on every session PATH is a capability)');
ok((await post('/api/plugins/manifests/example.hello/enabled', { enabled: true, trusted: true })).status === 200 && verdictOf(await waitFor(async () => (await row('example.hello')).state === 'running', 25000)), 'the installed example runs');
const inst2 = await post('/api/plugins/install', { source: 'path', value: path.join(src, 'hello') });
ok(inst2.status === 200 && inst2.body.replaced === true && !inst2.body.disabled && gateOf((await row('example.hello')).trusted) && gateOf(inst2.body.previous) && gateOf(fs.existsSync(path.join(inst2.body.previous, 'plugin', 'vibespace-plugin.json'))) && verdictOf(fs.existsSync(path.join(inst2.body.previous, 'why.json'))), 'reinstalling the IDENTICAL package MOVES the previous copy to data/plugins-trash (never deleted) and keeps the plugin enabled + trusted', inst2.body);
ok(verdictOf(await waitFor(async () => (await row('example.hello')).state === 'running', 25000)), '…and restarts it (a fresh child, not the crash-backoff path)');
fs.symlinkSync('/etc', path.join(src, 'hello', 'etc-link'));
const sym = await post('/api/plugins/install', { source: 'path', value: path.join(src, 'hello') });
ok(sym.status === 400 && verdictOf(/symlink/.test(sym.body.error)), 'a package containing a symlink is refused');
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
ok(er.status === 400 && gateOf(/path traversal/.test(eb.error)) && !fs.existsSync(path.join(root, 'data', 'evil.txt')), 'Zip-Slip entries are refused before extraction');
const up0 = await post('/api/plugins/manifests/example.hello/update', {});
ok(up0.status === 400 && verdictOf(/uploaded file/.test(up0.body.error)), 'update of a zip-installed plugin explains that a new upload replaces it');
await post('/api/plugins/install', { source: 'path', value: path.join(src, 'hello') });
await post('/api/plugins/manifests/example.hello/enabled', { enabled: true, trusted: true }); // the source swap above dropped consent — re-give it, then Update must keep it
const up = await post('/api/plugins/manifests/example.hello/update', {});
ok(up.status === 200 && up.body.plugin?.id === 'example.hello' && gateOf(up.body.previous) && gateOf((await row('example.hello')).install.updatedAt) && verdictOf((await row('example.hello')).trusted), 'update re-runs the recorded source (path), trashes the previous copy and KEEPS consent (the owner asked for this version from the source they already trusted; a changed capability surface still trips the drift check)');
// lane plugin-update-button: the answer says when NOTHING was new at the source (the row's toast: «already up to date»)
ok(up.body.unchanged === true, 'update from the same bytes at the recorded path answers unchanged: true', up.body.unchanged);
fs.writeFileSync(path.join(src, 'hello', 'CHANGES.txt'), 'next\n');
const upNew = await post('/api/plugins/manifests/example.hello/update', {});
ok(upNew.status === 200 && upNew.body.unchanged === false, 'a changed package at the recorded path answers unchanged: false (the row says «Updated … to …»)', upNew.body);
ok((await post('/api/plugins/manifests/example.hello/update', {})).status === 200 && (await post('/api/plugins/manifests/nope.nope/update', {})).status === 404, 'update: unknown id → 404');
const stateFile = path.join(root, 'data', 'plugins-state', 'example.hello', 'counter.json');
// the update just restarted the plugin process — wait for it (gate flake: POST /x/count raced a 'starting' state)
ok(verdictOf(await waitFor(async () => (await row('example.hello')).state === 'running', 25000)), 'the updated example is running again');
await j('/api/plugins/example.hello/x/count', { method: 'POST' });
ok(verdictOf(await waitFor(() => fs.existsSync(stateFile))), 'the example wrote its state file (so uninstall has state to preserve)');
const un = await j('/api/plugins/manifests/example.hello', { method: 'DELETE' });
ok(un.status === 200 && gateOf(un.body.trash) && gateOf(fs.existsSync(path.join(un.body.trash, 'plugin', 'vibespace-plugin.json'))) && gateOf(fs.existsSync(path.join(un.body.trash, 'state', 'counter.json'))) && !fs.existsSync(pdir('example.hello')) && !(await row('example.hello')), 'uninstall moves plugin + state to the trash, drops registry rows, and the list no longer shows it', un.body);
ok(!JSON.parse(fs.readFileSync(path.join(root, 'data', 'plugin-registry.json'), 'utf8')).installs['example.hello'], 'registry install record removed');
ok((await j('/api/plugins/manifests/nope.nope', { method: 'DELETE' })).status === 404, 'uninstall unknown → 404');
// a package declaring a capability over the host's own data dir is refused at install
fs.cpSync(path.join(REPO, 'docs/examples/hello-plugin'), path.join(src, 'evilcap'), { recursive: true });
writeJson(path.join(src, 'evilcap', 'vibespace-plugin.json'), { ...JSON.parse(fs.readFileSync(path.join(src, 'evilcap', 'vibespace-plugin.json'), 'utf8')), capabilities: { server: { fs: { read: [path.join(root, 'data')] } } } });
const ec = await post('/api/plugins/install', { source: 'path', value: path.join(src, 'evilcap') });
ok(ec.status === 400 && verdictOf(/covers the VibeSpace (install|data) dir/.test(ec.body.error)), 'a capability over VibeSpace\'s own install/data dir is refused at install (named)', ec.body);
ok(gateOf(tele.some((e) => e.name === 'plugin-install')) && gateOf(tele.some((e) => e.name === 'plugin-uninstall')) && verdictOf(tele.some((e) => e.name === 'plugin-install-failed')), 'install/uninstall/failures reach telemetry');

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
  // B-518e (the coordinator's law 2026-11-18 00:24Z: a fast leg's verdict is a count or an order, never a short limit a loaded
  // machine can miss): every leg that EXPECTS a clean install gives git a limit far above the stub's own time; the one
  // deliberate timeout leg below (gitTimeoutMs 600 over a git that never answers) keeps its short limit on purpose
  const CLEAN_GIT_MS = 60000;
  const PL = require(path.join(REPO, 'src/server/plugin-loader.js')).create({ rootDir: GR, app: null, autoStart: false, log: quiet, integrations: () => store, gitBin: WRAP, gitTimeoutMs: CLEAN_GIT_MS });
  const URL_H = URL_HTTPS, URL_S = URL_SSH;
  // B-3b8e (4b — the coordinator's ruling (B)): the Plugin Git credential's Test is OFFERED once a repository on its host is
  // known — the loader's own answer (`waits`), asked before and after the first install from that host (the stub's repo.test)
  {
    const regs = {}, moved = [], storeW = { ...store, registerTest: (id, fn, o) => { regs[id] = { fn, o }; }, testWaitsMoved: (id) => { moved.push(id); } };
    const mkW = (mod, sub) => { const r = path.join(G, sub); fs.mkdirSync(path.join(r, 'data', 'plugins'), { recursive: true }); return mod.create({ rootDir: r, app: null, autoStart: false, log: quiet, integrations: () => storeW, gitBin: WRAP, gitTimeoutMs: CLEAN_GIT_MS }); };
    const waitsNow = () => { const o = regs['plugin-git'] && regs['plugin-git'].o; return o && typeof o.waits === 'function' ? o.waits({ values: { host: 'repo.test' } }) : 'no waits registered'; };
    const PLW = mkW(require(path.join(REPO, 'src/server/plugin-loader.js')), 'root-waits');
    const before = waitsNow();
    await PLW.install({ source: 'git', value: URL_H, ref: 'v1' });
    const after = waitsNow();
    ok(gateOf(before) && before.code === 'repository-unknown' && gateOf(before.params) && before.params.host === 'repo.test' && after === null,
      'B-3b8e 4b: the Plugin Git Test WAITS while no repository on its host is known (the card says when) — and is offered once one is (the first install from repo.test)', { before, after });
    const movedInstall = moved.slice();
    PLW.uninstall('acme.private');
    const afterU = waitsNow();
    ok(movedInstall.join() === 'plugin-git' && moved.join() === 'plugin-git,plugin-git' && gateOf(afterU) && afterU.code === 'repository-unknown',
      'B-3b8e 4b (the read\'s should): the git install and the uninstall each push the Plugin Git card again (an open window follows without a reopen) — and with its only repository gone the Test waits again', { movedInstall, moved, afterU });
    // RED CONTROL — its plant proven first: the loader's one answer, spelled once; a loader that always answers «can run»
    const LSRCW = read('src/server/plugin-loader.js'), WA = "    const waits = ({ values }) => (knownRepoOn(hostOf(values)) ? null : { code: 'repository-unknown', params: { host: hostOf(values) } });\n";
    ok(LSRCW.split(WA).length === 2, 'ANCHOR: the loader\'s waits answer, spelled once (the control below plants there)');
    const MV = "    if (r.source === 'git' || (prevInst && prevInst.source === 'git')) gitTestWaitsMoved();\n";
    ok(LSRCW.split(MV).length === 2, 'ANCHOR: the install\'s push of the Plugin Git card, spelled once (the control below plants there)');
    if (LSRCW.split(WA).length === 2 && LSRCW.split(MV).length === 2) {
      const Mw = mutantCopies('plugin-trust-waits', REPO);
      delete regs['plugin-git'];   // the read's should: the mutant's own registration is what the control reads — never the real loader's left over
      mkW(Mw.load('src/server/plugin-loader.js', editAnchor(LSRCW, WA, '    const waits = () => null;\n', "src/server/plugin-loader.js"), 'waits-never'), 'root-waits-mutant');
      ok(!!regs['plugin-git'] && waitsNow() === null, 'MUTANT RED: a loader whose Test never waits offers it with no repository known — a door that can only refuse (the mutant\'s own registration read)');
      const n0 = moved.length;
      const PLM = mkW(Mw.load('src/server/plugin-loader.js', editAnchor(LSRCW, MV, '', "src/server/plugin-loader.js"), 'waits-unpushed'), 'root-waits-mutant2');
      await PLM.install({ source: 'git', value: URL_H, ref: 'v1' });
      ok(moved.length === n0 && waitsNow() === null, 'MUTANT RED: a loader whose git install does not push the card leaves an open window saying the Test waits after the install it waited for', { pushed: moved.length - n0 });
    }
  }
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
  ok(gateOf(f1) && !f1.env.GIT_ASKPASS && gateOf(f1.argv.includes('credential.helper=')) && gateOf(f1.argv.includes('--depth')) && f1.argv.at(-2) === URL_H && f1.argv.at(-1) === 'v1' && f1.env.GIT_TERMINAL_PROMPT === '0' && f1.env.GIT_SSH_COMMAND === 'ssh -o BatchMode=yes',
    'no credential chosen ⇒ git gets none (no askpass), depth 1, the one ref, no prompt, no configured credential helper', f1 && f1.argv);
  ok(gateOf(f1) && verdictOf(Object.keys(f1.env).every((k) => ['PATH', 'HOME', 'LANG', 'TMPDIR', 'XDG_RUNTIME_DIR', 'TERM', 'HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'GIT_SSL_CAINFO', 'GIT_SSL_CAPATH', 'GIT_TERMINAL_PROMPT', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL', 'GIT_SSH_COMMAND', 'GIT_ASKPASS', 'PWD', 'SHLVL', '_', 'OLDPWD', 'GIT_EXEC_PATH', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_PREFIX'].includes(k) || /^LC_[A-Z]+$/.test(k))),
    'the git child\'s env is serviceEnv (+ the egress door) + the named git switches — never the hub\'s', f1 && Object.keys(f1.env).join(' '));
  // ② https + the token: through the askpass FILE only; argv / URL / env token-free; the files 0600 in a 0700 folder; shredded after
  credValues = { host: 'repo.test', token: TOKEN };
  resetCalls();
  const r2 = await PL.install({ source: 'git', value: URL_H, ref: sha2, credential: 'plugin-git' });
  const f2 = fetchOf(calls());
  ok(r2.sha === sha2 && r2.plugin.version === '1.0.1' && gateOf(f2) && gateOf(f2.ask) && f2.ask.user === 'x-access-token' && f2.ask.pass === TOKEN, 'a full sha ref is fetched exactly; the askpass answers the user name and the token — from its files', f2 && f2.ask && { user: f2.ask.user });
  ok(!leaks(f2, TOKEN).length, `the token is on no argv, in no URL, in no env value, not in the askpass text; the folder 0700, the files 0600 (${leaks(f2, TOKEN).join(', ') || 'clean'})`);
  ok(gateOf(gone(f2)) && !fs.readdirSync(path.join(GR, 'data', 'plugins-staging')).length, 'after the clone the credential files are SHREDDED (the token\'s inode — a hard-link witness — holds other bytes) and gone; the stage is empty');
  // ③ ssh + the deploy key: GIT_SSH_COMMAND names a 0600 key file; shredded after
  credValues = { host: 'repo.test', deployKey: KEYTEXT };
  resetCalls();
  const r3 = await PL.install({ source: 'git', value: URL_S, ref: 'v1', credential: 'plugin-git' });
  const f3 = fetchOf(calls());
  ok(r3.sha === sha1 && gateOf(f3) && gateOf(f3.key) && f3.key.text === KEYTEXT + '\n' && gateOf(/IdentitiesOnly=yes/.test(f3.env.GIT_SSH_COMMAND)) && gateOf(/BatchMode=yes/.test(f3.env.GIT_SSH_COMMAND)) && !leaks(f3, 'Zml4dHVyZS1kZXBsb3kta2V5').length && verdictOf(gone(f3)),
    'ssh: the deploy key rides a 0600 file GIT_SSH_COMMAND names (IdentitiesOnly, BatchMode), never argv / env text; gone after', f3 && f3.key && { mode: f3.key.mode });
  // ④ the credential refused BY NAME before git runs: none set · another host · the wrong kind for the URL
  const before = calls().length;
  credValues = null; const e4a = await thr(PL.install({ source: 'git', value: URL_H, credential: 'plugin-git' }));
  credValues = { host: 'other.test', token: TOKEN }; const e4b = await thr(PL.install({ source: 'git', value: URL_H, credential: 'plugin-git' }));
  credValues = { host: 'repo.test', deployKey: KEYTEXT }; const e4c = await thr(PL.install({ source: 'git', value: URL_H, credential: 'plugin-git' }));
  ok(gateOf([e4a, e4b, e4c].every((e) => e && e.code === 'plugin_git_credential')) && calls().length === before && gateOf(/no key of your own/.test(e4a.message)) && verdictOf(/other\.test.*repo\.test/.test(e4b.message)), 'plugin_git_credential BY NAME (none set · it is for another host · no token for an https URL) — git never ran', [e4a, e4b, e4c].map((e) => e && e.message));
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
  ok(gateOf(e6a) && e6a.code === 'plugin_git_ref_missing' && gateOf(e6b) && e6b.code === 'plugin_git_auth' && gateOf(/token of the Plugin Git credential/.test(e6b.message)) && gateOf(e6c) && e6c.code === 'plugin_git_timeout' && gateOf(e6d) && e6d.code === 'plugin_tree_rejected' && verdictOf(/symlink/.test(e6d.message)),
    'every failure is NAMED: plugin_git_ref_missing · plugin_git_auth · plugin_git_timeout · plugin_tree_rejected', [e6a, e6b, e6c, e6d].map((e) => e && `${e.code}: ${String(e.message).slice(0, 80)}`));
  ok(gateOf(gone(f6b)) && gateOf(gone(f6c)) && !fs.readdirSync(path.join(GR, 'data', 'plugins-staging')).length && PL.installRecord('acme.private').sha === sha1, '…the credential files are shredded on every failure too, the stage is empty, the installed record is untouched');
  // ⑦ update re-pulls the RECORDED source: its ref and its credential
  credValues = { host: 'repo.test', token: TOKEN };
  await PL.install({ source: 'git', value: URL_H, ref: 'main', credential: 'plugin-git' }); resetCalls();
  const u7 = await PL.update('acme.private');
  const f7 = fetchOf(calls());
  ok(u7.plugin.version === '1.0.1' && gateOf(f7) && f7.argv.at(-1) === 'main' && gateOf(f7.ask) && f7.ask.pass === TOKEN && PL.installRecord('acme.private').sha === sha2 && u7.unchanged === true, 'Update re-pulls the recorded ref with the recorded credential and records the new sha; the ref still at the recorded commit ⇒ unchanged: true (lane plugin-update-button)');
  // ⑧ the row's reachability Test: ls-remote with the credential (the same files, shredded)
  const PI = require(path.join(REPO, 'src/server/plugin-install.js'));
  const inst8 = PI.create({ rootDir: GR, log: quiet, integrations: () => store, gitBin: WRAP });
  resetCalls();
  const t8 = await inst8.testCredential(URL_H);
  const f8 = calls().find((c) => c.argv.includes('ls-remote'));
  ok(gateOf(t8.ok) && t8.head === sha2 && gateOf(f8) && gateOf(f8.ask) && !leaks(f8, TOKEN).length && verdictOf(gone(f8)), 'the Test = git ls-remote <url> HEAD with the credential (HEAD answered), token-free, its files gone after');
  // ⑨ RED CONTROLS — patched copies of the installer each turn a census above red
  const SRC = read('src/server/plugin-install.js');
  const M = mutantCopies('plugin-trust-git', REPO);
  // ⑦b lane plugin-update-button r2: THE REF MOVED — main gains a commit (1.0.2) after the install recorded sha2, so the
  // recorded sha is the OLDER one: Update answers unchanged: false and records the new sha (the row's toast says «Updated …
  // to 1.0.2», never «already up to date»). RED CONTROL first, on the same move: a patched loader whose git branch ignores the
  // recorded sha (`!!r.sha`) answers unchanged: true — the leg refuses it. (Placed after ⑧: its ls-remote pins main at sha2.)
  {
    const LSRC = read('src/server/plugin-loader.js');
    const anchor = "inst.source === 'git' ? !!r.sha && r.sha === inst.sha :";
    ok(verdictOf(LSRC.includes(anchor)), 'control ⑦b: the git branch of unchanged is in plugin-loader.js', anchor);
    const moved = (u, rec, sha) => !!u && u.unchanged === false && rec?.sha === sha && u.plugin?.version === '1.0.2';
    const before = PL.installRecord('acme.private');
    const mut = M.load('src/server/plugin-loader.js', editAnchor(LSRC, anchor, "inst.source === 'git' ? !!r.sha :", "src/server/plugin-loader.js"), 'unchanged-git').create({ rootDir: GR, app: null, autoStart: false, log: quiet, integrations: () => store, gitBin: WRAP, gitTimeoutMs: CLEAN_GIT_MS });
    const sha3 = FX.commit({ 'vibespace-plugin.json': pkg('1.0.2') });
    const um = await mut.update('acme.private');
    ok(before.ref === 'main' && before.sha === sha2 && sha3 !== sha2 && um.unchanged === true && !moved(um, mut.installRecord('acme.private'), sha3), 'RED CONTROL ⑦b: a loader whose git branch ignores the recorded sha answers unchanged: true on a ref that moved — the leg below refuses it', { unchanged: um.unchanged, sha: mut.installRecord('acme.private')?.sha });
    const u7b = await PL.update('acme.private');
    ok(verdictOf(moved(u7b, PL.installRecord('acme.private'), sha3)), 'Update after the ref moved (recorded sha2, main now at a new commit): unchanged: false, the new sha recorded, version 1.0.2', { unchanged: u7b.unchanged, sha: PL.installRecord('acme.private')?.sha, version: u7b.plugin?.version });
  }
  const mutant = async (tag, from, to, check) => {
    if (!SRC.includes(from)) return ok(false, `control ${tag}: its anchor is gone from plugin-install.js`, from);
    const mod = M.load('src/server/plugin-install.js', editAnchor(SRC, from, to, "src/server/plugin-install.js"), tag);
    const ins = mod.create({ rootDir: GR, log: quiet, integrations: () => store, gitBin: WRAP });
    resetCalls();
    let err = null; try { await ins.install({ source: 'git', value: URL_H, ref: 'v1', credential: 'plugin-git' }); } catch (e) { err = e; }
    return check(fetchOf(calls()), err);
  };
  const rr = await post('/api/plugins/install', { source: 'git', value: URL_H, credential: 'my-own-token' });
  ok(rr.status === 400 && rr.body.code === 'plugin_git_credential', 'the install ROUTE takes a credential by its integration row only (plugin-git) — any other value (a token typed into the form) is refused by name', rr.body);
  ok(verdictOf(await mutant('token-in-url', "spec.url, spec.ref || 'HEAD']", "(cred && cred.token ? spec.url.replace('https://', 'https://' + cred.username + ':' + cred.token + '@') : spec.url), spec.ref || 'HEAD']", (c) => leaks(c, TOKEN).includes('argv'))), 'control (a): a copy that puts the token in the clone URL is RED (argv)');
  ok(verdictOf(await mutant('token-in-env', 'return { dir, files, add: { GIT_ASKPASS: ask } };', 'return { dir, files, add: { GIT_ASKPASS: ask, GIT_PASSWORD: cred.token } };', (c) => leaks(c, TOKEN).includes('env GIT_PASSWORD'))), 'control (b): a copy that hands the token in the env is RED');
  ok(verdictOf(await mutant('askpass-leak', "*) cat ${shq(tok)} ;;", "*) echo ${shq(cred.token)} ;;", (c) => leaks(c, TOKEN).includes('askpass text'))), 'control (c): a LEAKING askpass copy (the token in the script) is RED');
  process.on('exit', () => { try { fs.rmSync(G, { recursive: true, force: true }); } catch { /* gone */ } });
  ok(verdictOf(await mutant('no-shred', '  for (const f of c.files) gone = (await shredFile(f)) && gone;', '  for (const f of c.files) await fsp.unlink(f).catch(() => {});', (c) => !gone(c))), 'control (d): a copy that only UNLINKS the files (no overwrite) is RED — the token\'s inode still holds it');
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
  ok(r10.version === '1.0.0' && r10.sha === sha1 && c10.length >= 4 && gateOf(c10.every((c) => c.env.GIT_CONFIG_GLOBAL === '/dev/null' && c.env.GIT_CONFIG_NOSYSTEM === '1')) && n10.length === 1 && gateOf(n10[0].ask) && n10[0].ask.pass === TOKEN,
    'round 2: a HOME .gitconfig whose url.insteadOf rewrites the repository ⇒ the clone still comes from the URL credentialFor judged (v1 = 1.0.0 at its sha, ONE fetch answered by the askpass) — every git child (init · fetch · checkout · rev-parse) runs with GIT_CONFIG_GLOBAL=/dev/null beside GIT_CONFIG_NOSYSTEM=1', { v: r10.version, err: r10.err && r10.err.message, env: c10.map((c) => c.env.GIT_CONFIG_GLOBAL) });
  const homeAnchor = "GIT_CONFIG_GLOBAL: '/dev/null', ";
  ok(verdictOf(SRC.includes(homeAnchor)), 'control: the HOME-config switch\'s anchor is in plugin-install.js');
  const r10m = await viaHome(M.load('src/server/plugin-install.js', editAnchor(SRC, homeAnchor, '', "src/server/plugin-install.js"), 'home-config').create({ rootDir: GR, log: quiet, integrations: () => store, gitBin: WRAP }));
  ok(r10m.version === '6.6.6', 'control (e): a copy WITHOUT GIT_CONFIG_GLOBAL follows the HOME rewrite — it installs the OTHER repository\'s package (6.6.6), fetched with the token meant for this one: RED', r10m.version || (r10m.err && r10m.err.message));
  await PL.install({ source: 'git', value: URL_H, ref: 'v1', credential: 'plugin-git' }); // the right package back
  // ⑪ ROUND 2 (SHOULD 5): a throw while the credential files are written (a full disk at the second) SHREDS the first one
  const PIx = require(path.join(REPO, 'src/server/plugin-install.js'));
  const W11 = path.join(G, 'witness-11');
  const failSecond = () => { let n = 0; return async (f, text, o) => { n++; if (n === 2) throw Object.assign(new Error('ENOSPC: no space left on device, open'), { code: 'ENOSPC' }); await fs.promises.writeFile(f, text, o); if (n === 1) fs.linkSync(f, W11); }; };
  const credT = { kind: 'token', host: 'repo.test', username: 'x-access-token', token: TOKEN };
  const st11 = fs.mkdtempSync(path.join(G, 'st11-'));
  const e11 = await thr(PIx.credentialFiles(st11, credT, { writeFile: failSecond() }));
  ok(gateOf(e11) && e11.code === 'ENOSPC' && gateOf(fs.existsSync(W11)) && !held(W11, TOKEN) && !fs.readdirSync(st11).length, 'round 2: a throw at the SECOND credential file (ENOSPC) ⇒ the first is SHREDDED like every other way out — its inode (a hard-link witness) holds other bytes; the folder is gone', { code: e11 && e11.code, left: fs.readdirSync(st11) });
  const throwAnchor = '  } catch (e) { await shredCredentials({ dir, files }); throw e; }';
  ok(verdictOf(SRC.includes(throwAnchor)), 'control: the shred-on-throw anchor is in plugin-install.js');
  fs.rmSync(W11, { force: true });
  const st11b = fs.mkdtempSync(path.join(G, 'st11b-'));
  await thr(M.load('src/server/plugin-install.js', editAnchor(SRC, throwAnchor, '  } catch (e) { throw e; }', "src/server/plugin-install.js"), 'no-shred-on-throw').credentialFiles(st11b, credT, { writeFile: failSecond() }));
  ok(verdictOf(held(W11, TOKEN)), 'control (f): a copy that does not shred on that throw leaves the token in the first file\'s inode (only the stage\'s rm would unlink it) — RED');
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
  ok(r12.version === '1.0.0' && c12.length >= 4 && gateOf(c12.every((c) => c.env.GIT_SSL_CAINFO === CAF && c.env.GIT_SSL_CAPATH === CAP)) && caOf(c12[0].env) === '' && caOf({ ...c12[0].env, GIT_CONFIG_GLOBAL: undefined }) === path.join(H3, 'home-ca.pem'),
    'round 3: the hub\'s GIT_SSL_CAINFO / GIT_SSL_CAPATH reach EVERY git child (the egress door) while a HOME http.sslCAInfo is NOT read — real git under the child\'s env answers none (the same env without GIT_CONFIG_GLOBAL answers the HOME file: the probe sees it)', { v: r12.version, err: r12.err && r12.err.message, ca: c12.map((c) => c.env.GIT_SSL_CAINFO) });
  const AES = fs.readFileSync(path.join(REPO, 'src/agent-env.js'), 'utf8');
  const caAnchor = ", 'GIT_SSL_CAINFO', 'GIT_SSL_CAPATH']);", reqAnchor = "const { serviceEnv } = require('../agent-env.js');";
  ok(gateOf(AES.includes(caAnchor)) && verdictOf(SRC.includes(reqAnchor)), 'control: the egress door\'s git trust-root names are in agent-env.js; plugin-install.js reads serviceEnv from it');
  const aeNoCa = M.write('src/agent-env.js', editAnchor(AES, caAnchor, ']);', "src/agent-env.js"), 'no-git-ca');
  const r12m = await viaCa(M.load('src/server/plugin-install.js', editAnchor(SRC, reqAnchor, `const { serviceEnv } = require(${JSON.stringify(aeNoCa)});`, "src/server/plugin-install.js"), 'no-git-ca').create({ rootDir: GR, log: quiet, integrations: () => store, gitBin: WRAP }));
  const c12m = calls();
  ok(c12m.length >= 1 && verdictOf(c12m.every((c) => !('GIT_SSL_CAINFO' in c.env) && !('GIT_SSL_CAPATH' in c.env) && caOf(c.env) === '')), 'control (g): a copy whose egress door lacks GIT_SSL_CAINFO / GIT_SSL_CAPATH hands git NO trust root at all (the HOME one is not read either) — behind a TLS-inspecting egress every clone fails: RED', { v: r12m.version, env: c12m.map((c) => c.env.GIT_SSL_CAINFO || null) });
}

// ── ③d lane lg-remote-hardening (B-7f0b — design q-042 D6, merged B-4ff5): THE HOST-KEY PIN of the ssh road. A pod has no
// known_hosts, so accept-new trusted whatever key the first credential-bearing clone met. The row's optional knownHosts →
// its keys for THIS host, a 0600 known_hosts in the same shredded folder, StrictHostKeyChecking=yes over that file alone,
// another key refused BY NAME (plugin_git_hostkey). Recorded legs over the fixture's wrapper (no real program: THE TIER RULE);
// the REAL road — a private sshd on loopback, real git + real ssh, an accept-new copy as the RED control — is the heavy
// test-plugin-git-clone ⑨.
console.log('— the ssh host-key pin of the Plugin Git credential (lane lg-remote-hardening)');
{
  const crypto = require('node:crypto');
  const SKF = require(path.join(REPO, 'src/ssh-key-format.js'));
  const IR = require(path.join(REPO, 'src/integration-registry.js'));
  const PI = require(path.join(REPO, 'src/server/plugin-install.js'));
  const G = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-trust-hostkey-'));
  process.on('exit', () => { try { fs.rmSync(G, { recursive: true, force: true }); } catch { /* gone */ } });
  const { gitRepoFixture, URL_SSH } = await import('./fixtures/git-repo.mjs');
  const FX = gitRepoFixture(G, [{ files: { 'vibespace-plugin.json': { id: 'acme.pinned', version: '1.0.0', engines: { vibespace: '2.369.24' }, label: 'Pinned' } }, tag: 'v1' }]);
  const KEYTEXT = ['-----BEGIN OPENSSH ', 'PRIVATE KEY-----\n', 'Zml4dHVyZS1waW5uZWQta2V5LW5vdC1hLWtleQ'.repeat(2), '\n-----END OPENSSH ', 'PRIVATE KEY-----'].join('');
  // a public-key blob in ssh's wire form (uint32 length + the type, uint32 length + 32 bytes) — built here, no ssh-keygen
  const blob = (type, fill) => { const t = Buffer.from(type), b = Buffer.alloc(8 + t.length + 32, fill); b.writeUInt32BE(t.length, 0); t.copy(b, 4); b.writeUInt32BE(32, 4 + t.length); return b.toString('base64'); };
  const KA = blob('ssh-ed25519', 1), KB = blob('ssh-ed25519', 2), KC = blob('ecdsa-sha2-nistp256', 3);
  const hashed = (name, salt) => `|1|${salt.toString('base64')}|${crypto.createHmac('sha1', salt).update(name).digest('base64')}`;
  let credValues = null;
  const store = { resolveIntegration: (id) => { if (id !== 'plugin-git') throw new Error('unknown integration'); return credValues ? { source: 'user', values: { ...credValues }, whyCode: null, why: null } : { source: 'none', values: {}, whyCode: 'no-values', why: 'none' }; } };
  const GR = path.join(G, 'root'); fs.mkdirSync(path.join(GR, 'data', 'plugins'), { recursive: true });
  const quiet = { log() {}, warn() {} };
  const thr = async (p) => { try { await p; return null; } catch (e) { return e; } };
  const fetchOf = (cs) => cs.find((c) => c.argv.includes('fetch')) || null;
  const held = (w, v) => { try { return fs.readFileSync(w, 'utf8').includes(v); } catch { return false; } };
  const PLx = PI.create({ rootDir: GR, log: quiet, integrations: () => store, gitBin: FX.WRAP });

  // ① PURE: the lines a pin is written in (ssh-key-format.js parseKnownHosts) + the ssh lookup name + the row's validator
  const p1 = SKF.parseKnownHosts(`# ssh-keyscan repo.test\n\nrepo.test,10.0.0.9 ssh-ed25519 ${KA} comment here\r\nssh-ed25519 ${KB}\n${hashed('repo.test', Buffer.alloc(20, 7))} ecdsa-sha2-nistp256 ${KC}\n`);
  const refusals = [`@cert-authority *.test ssh-ed25519 ${KA}`, 'repo.test ssh-ed25519 not*base64*at-all', `repo.test ecdsa-sha2-nistp256 ${KA}`, 'repo.test ssh-dss AAAAB3NzaC1kc3MAAACBAP', 'just words', `repo.test,!repo.test ssh-ed25519 ${KA}`, `*.test ssh-ed25519 ${KA}`, `repo.test ssh-ed25519 ${KA} ssh-ed25519 ${KB}`].map((l) => SKF.parseKnownHosts(`# x\n${l}\n`));
  const many = SKF.parseKnownHosts(Array.from({ length: 65 }, () => `repo.test ssh-ed25519 ${KA}`).join('\n')), big = SKF.parseKnownHosts('#'.repeat(33 * 1024));
  ok(gateOf(p1.ok) && p1.keys.length === 3 && p1.keys[0].names.join() === 'repo.test,10.0.0.9' && p1.keys[0].type === 'ssh-ed25519' && p1.keys[1].names === null && p1.keys[2].hashed.length === 1 && p1.keys[2].type === 'ecdsa-sha2-nistp256'
    && gateOf(refusals.every((r) => !r.ok && r.line === 2)) && gateOf(/marker/.test(refusals[0].why)) && gateOf(/base64/.test(refusals[1].why)) && gateOf(/own bytes/.test(refusals[2].why)) && gateOf(/negated \(!\) or wildcard/.test(refusals[5].why)) && gateOf(/wildcard/.test(refusals[6].why)) && gateOf(/two keys on one line/.test(refusals[7].why)) && !many.ok && gateOf(/64 keys/.test(many.why)) && !big.ok,
    'PURE parseKnownHosts: ssh-keyscan\'s lines (a name list, a bare `type key`, a hashed name, a comment, CRLF) read; a marker line, a non-base64 key, a key whose own bytes name another type, an unknown type, no type, a negated (!) or wildcard name (the matching language of ssh, not a pin), two keys on one line — each refused WITH its line; > 64 keys / > 32 KiB refused', refusals.map((r) => r.why));
  ok(SKF.knownHostName('Repo.Test') === 'repo.test' && SKF.knownHostName('git.example.test:2222') === '[git.example.test]:2222' && SKF.knownHostName('git.example.test:22') === 'git.example.test',
    'the ssh lookup name: the host on port 22, [host]:port on another (what a known_hosts line must name)');
  const vGood = IR.validateValues('plugin-git', { knownHosts: `repo.test ssh-ed25519 ${KA}` }), vBad = IR.validateValues('plugin-git', { knownHosts: 'repo.test ssh-ed25519 short' }), vNone = IR.validateValues('plugin-git', { knownHosts: '# only a comment' });
  const fld = IR.rowById('plugin-git').fields.find((f) => f.key === 'knownHosts');
  ok(gateOf(vGood.ok) && !vBad.ok && gateOf(/line 1/.test(vBad.errors.knownHosts)) && !vNone.ok && gateOf(fld) && fld.multiline === true && fld.secret === false && fld.required === false,
    'the plugin-git row has an OPTIONAL multiline knownHosts (public keys: not a secret); its validator is parseKnownHosts (the line named) and wants at least one key', { vBad: vBad.errors, vNone: vNone.errors });

  // ② a pinned clone (recorded): ONLY this host's keys, under its own name, in a 0600 file beside the key; strict over it alone; shredded
  credValues = { host: 'repo.test', deployKey: KEYTEXT, knownHosts: `repo.test,10.0.0.9 ssh-ed25519 ${KA}\nother.test ssh-ed25519 ${KB}\n${hashed('repo.test', Buffer.alloc(20, 9))} ecdsa-sha2-nistp256 ${KC}\n${hashed('other.test', Buffer.alloc(20, 9))} ssh-ed25519 ${KB}\n` };
  FX.resetCalls();
  const r2 = await PLx.install({ source: 'git', value: URL_SSH, ref: 'v1', credential: 'plugin-git' });
  const f2 = fetchOf(FX.calls());
  const cmd2 = (f2 && f2.env.GIT_SSH_COMMAND) || '';
  ok(gateOf(r2) && r2.sha === FX.shas[0] && gateOf(f2) && gateOf(f2.kh) && f2.kh.text === `repo.test ssh-ed25519 ${KA}\nrepo.test ecdsa-sha2-nistp256 ${KC}\n` && f2.kh.mode === '600' && gateOf(f2.key) && f2.kh.dir === f2.key.dir,
    'a pinned ssh clone: the known_hosts holds THIS host\'s keys only (a plain name and a hashed one; other.test\'s two dropped), under its own name, 0600, in the key\'s own folder', f2 && f2.kh && { text: f2.kh.text, mode: f2.kh.mode });
  ok(gateOf(/StrictHostKeyChecking=yes/.test(cmd2)) && !/accept-new/.test(cmd2) && gateOf(cmd2.includes("'HostKeyAlias=repo.test'")) && gateOf(cmd2.includes(`'UserKnownHostsFile="${f2 && f2.kh && f2.kh.path}"'`)) && gateOf(/GlobalKnownHostsFile=\/dev\/null/.test(cmd2)) && gateOf(/IdentitiesOnly=yes/.test(cmd2)) && verdictOf(/BatchMode=yes/.test(cmd2)),
    'ssh runs strict over that file ALONE (UserKnownHostsFile quoted for a path with a space, no /etc file, no HOME file) under HostKeyAlias = the name the lines carry (no ssh config can move the lookup), never accept-new', cmd2);
  // a host with a port: a paste names it plain or as [host]:port (ssh tries both) — every such key is kept, written under the alias
  const pp = PI.pinnedHostsText({ host: 'git.example.test:2222' }, `[git.example.test]:2222 ssh-ed25519 ${KA}\ngit.example.test ssh-ed25519 ${KB}\nother.test ecdsa-sha2-nistp256 ${KC}\n`);
  ok(pp === `git.example.test ssh-ed25519 ${KA}\ngit.example.test ssh-ed25519 ${KB}\n`, 'a git host with a port: its [host]:port and plain lines are both kept and written under the alias (the host alone); another host\'s dropped', pp);
  ok(gateOf(f2) && !fs.existsSync(f2.kh.dir) && gateOf(f2.kh.witness) && !held(f2.kh.witness, KA) && !held(f2.key.witness, 'Zml4dHVyZS1waW5uZWQta2V5'),
    'after the clone the pin\'s file is SHREDDED with the key (its inode — a hard-link witness — holds other bytes) and the folder gone');
  // ③ no pin ⇒ the road as it was (the first key is trusted)
  credValues = { host: 'repo.test', deployKey: KEYTEXT }; FX.resetCalls();
  await PLx.install({ source: 'git', value: URL_SSH, ref: 'v1', credential: 'plugin-git' });
  const f3 = fetchOf(FX.calls());
  ok(gateOf(f3) && !f3.kh && gateOf(/StrictHostKeyChecking=accept-new/.test(f3.env.GIT_SSH_COMMAND)) && !/UserKnownHostsFile/.test(f3.env.GIT_SSH_COMMAND), 'no knownHosts ⇒ the ssh road is unchanged (accept-new, no file of ours)', f3 && f3.env.GIT_SSH_COMMAND);
  // ④ a pin that names no key for this host / cannot be read ⇒ refused BY NAME before git runs — in 'auto' too (no unpinned clone in its place)
  const n4 = FX.calls().length;
  credValues = { host: 'repo.test', deployKey: KEYTEXT, knownHosts: `other.test ssh-ed25519 ${KB}\n` }; const e4a = await thr(PLx.install({ source: 'git', value: URL_SSH, credential: 'plugin-git' }));
  const e4b = await thr(PLx.install({ source: 'git', value: URL_SSH, credential: 'auto' }));
  credValues = { host: 'repo.test', deployKey: KEYTEXT, knownHosts: `repo.test ssh-ed25519 ${KA}\nrepo.test ssh-ed25519 cut` }; const e4c = await thr(PLx.install({ source: 'git', value: URL_SSH, credential: 'plugin-git' }));
  ok(gateOf([e4a, e4b, e4c].every((e) => e && e.code === 'plugin_git_hostkey' && e.message.includes('Integrations → Plugins → Plugin Git repository → Host keys'))) && FX.calls().length === n4 && gateOf(/hold none for repo\.test/.test(e4a.message)) && gateOf(/line 2/.test(e4c.message)) && verdictOf(PI.GIT_CODES.includes('plugin_git_hostkey')),
    'plugin_git_hostkey BY NAME before git runs: a pin with no key for this host (strict and \'auto\' alike), a pin that cannot be read (a preset skips the form) — git never ran', [e4a, e4b, e4c].map((e) => e && `${e.code}: ${String(e.message).slice(0, 90)}`));
  // ⑤ ssh's own refusal words ⇒ plugin_git_hostkey (they used to read as plugin_git_auth); the files shredded on that way out too
  credValues = { host: 'repo.test', deployKey: KEYTEXT, knownHosts: `repo.test ssh-ed25519 ${KA}` };
  FX.setMode({ fail: 'hostkey' }); FX.resetCalls();
  const e5 = await thr(PLx.install({ source: 'git', value: URL_SSH, ref: 'v1', credential: 'plugin-git' }));
  const f5 = fetchOf(FX.calls()); FX.setMode(null);
  const banner = ['@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@', '@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @', 'The fingerprint for the ED25519 key sent by the remote host is', 'SHA256:QgibyDN+7rw3QB56CaUdSmTUKuvnkFmSuWz1AmqpfwY.', 'Host key for repo.test has changed and you have requested strict checking.', 'Host key verification failed.'].join('\n');
  const g5 = PI.gitFailure(new Error(banner), { url: URL_SSH, ref: null, cred: { kind: 'key', host: 'repo.test', knownHosts: 'x' } });
  const g5b = PI.gitFailure(new Error('git@repo.test: Permission denied (publickey).\nfatal: Could not read from remote repository.'), { url: URL_SSH, ref: null, cred: { kind: 'key', host: 'repo.test' } });
  // 主开发's must on unit 1: EVERY host-key refusal names its door — unpinned, a changed key's fix is to pin the published keys
  const g5u = PI.gitFailure(new Error(banner), { url: URL_SSH, ref: null, cred: { kind: 'key', host: 'repo.test' } });
  ok(g5u.code === 'plugin_git_hostkey' && gateOf(/not the one this instance's ssh knows for it/.test(g5u.message)) && verdictOf(g5u.message.includes('pin the keys the host publishes in Integrations → Plugins → Plugin Git repository → Host keys')), 'an UNPINNED changed key: refused as plugin_git_hostkey with its door — pin the published keys there (the pinned road reads no ~/.ssh/known_hosts)', g5u.message);
  // the anonymous / first clone on a fresh pod: BatchMode cannot ask about an unknown key — that is the auth words, as before; only the PINNED road reads it as the pin's refusal
  const bare = 'Host key verification failed.\nfatal: Could not read from remote repository.';
  const g5c = PI.gitFailure(new Error(bare), { url: URL_SSH, ref: null, cred: null }), g5d = PI.gitFailure(new Error(bare), { url: URL_SSH, ref: null, cred: { kind: 'key', host: 'repo.test', knownHosts: 'x' } });
  ok(g5c.code === 'plugin_git_auth' && gateOf(/anonymous clone/.test(g5c.message)) && g5d.code === 'plugin_git_hostkey' && gateOf(/no ssh host key the Plugin Git credential pins/.test(g5d.message)) && verdictOf(g5d.message.includes('Integrations → Plugins → Plugin Git repository → Host keys')), 'a bare «Host key verification failed» unpinned stays plugin_git_auth (a first clone that could not ask); pinned it is plugin_git_hostkey', [g5c, g5d].map((e) => `${e.code}: ${String(e.message).slice(0, 100)}`));
  ok(gateOf(e5) && e5.code === 'plugin_git_hostkey' && gateOf(/No ED25519 host key is known for repo\.test/.test(e5.message)) && gateOf(e5.message.includes('paste its published ones in Integrations → Plugins → Plugin Git repository → Host keys')) && gateOf(g5.message.includes('paste its published ones in Integrations → Plugins → Plugin Git repository → Host keys')) && gateOf(f5) && !fs.existsSync(f5.kh.dir) && g5.code === 'plugin_git_hostkey' && gateOf(/it showed SHA256:QgibyDN\+7rw3QB56CaUdSmTUKuvnkFmSuWz1AmqpfwY/.test(g5.message)) && gateOf(/Host key for repo\.test has changed/.test(g5.message)) && gateOf(/pins/.test(g5.message)) && g5b.code === 'plugin_git_auth',
    'ssh\'s refusal of a key ⇒ plugin_git_hostkey with ssh\'s own line and the fingerprint the host showed (never plugin_git_auth); a refused deploy key stays plugin_git_auth; the files shredded on that way out', [e5, g5, g5b].map((e) => e && `${e.code}: ${String(e.message).slice(0, 140)}`));

  // ⑥ the REAL road (a private sshd on loopback, real git + real ssh, the accept-new RED copy) is HEAVY: test-plugin-git-clone ⑨
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
  ok(r0.asked.length === 2 && r0.asked[0].url === ASSET && r0.asked[0].headers.authorization === `Bearer ${TOKEN}` && r0.asked[0].headers.accept === 'application/octet-stream' && r0.asked[1].url === SIGNED && !('authorization' in r0.asked[1].headers) && gateOf(r0.err) && r0.err.code === 'build_verify_failed',
    'the kernel\'s download: the first request (the plugin repository\'s own release asset) carries Authorization: Bearer + Accept; the signed file host\'s request carries none (the wrong bytes then refused by the sha256)', r0.asked.map((q) => ({ url: q.url.slice(0, 60), auth: !!q.headers.authorization })));
  ok(!leaksK(r0).length && gateOf(r0.lines.some((l) => /with the Plugin Git credential/.test(l))) && verdictOf(/"credential":"plugin-git"/.test(r0.fact)), `the token is in no URL, no other header, no log line, no error, no engine record, no fact, no env (${leaksK(r0).join(', ') || 'clean'}) — the journal and the fact say only that the Plugin Git credential was used`);
  const ctlK = async (tag, from, to, want) => { if (!EDS.includes(from)) return ok(false, `control ${tag}: its anchor is gone from engine-distribution.js`, from); const r = await once(EDS.replace(from, to), tag); return ok(verdictOf(leaksK(r).some((x) => x.startsWith(want))), `control ${tag}: RED — the census finds the token in the ${want} (${leaksK(r).join(', ')})`); };
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
  ok(gateOf(vs.every((v) => v.ok === false && /one printable line/.test(v.errors.token || ''))) && vOk.ok === true && vShort.ok === false,
    'round 2 (minor 4b): the Plugin Git row\'s token field refuses an interior CR / NUL / space / LF at save time («one printable line — no spaces, line breaks or control characters»); a printable token passes; < 8 characters still refused', vs.map((v) => v.errors && v.errors.token));
  /** the token's pieces anywhere a download leaves words (every request's every header too — this token is never sent) */
  const leaksAny = (r, needle) => { const p = []; r.asked.forEach((q, i) => { if (q.url.includes(needle)) p.push('url ' + i); for (const [k, v] of Object.entries(q.headers)) if (String(v).includes(needle)) p.push(`header ${k} ${i}`); }); if (r.lines.some((l) => l.includes(needle))) p.push('log'); if (r.err && String(r.err.message).includes(needle)) p.push('error'); if (r.record.includes(needle)) p.push('record'); if (r.fact.includes(needle)) p.push('fact'); return p; };
  // a fetch that judges its headers as undici does (new Headers throws, quoting the value)
  const strict = async (url, opts, next) => { new Headers(opts.headers || {}); return next(url, opts); };
  kTok = TA + '\r' + TB;
  const rCr = await once(EDS, 'cr-token', strict);
  kTok = TOKEN;
  ok(!leaksAny(rCr, TA).length && !leaksAny(rCr, TB).length && rCr.asked.length >= 1 && !('authorization' in rCr.asked[0].headers) && gateOf(rCr.err) && rCr.err.code === 'build_verify_failed',
    `round 2 (minor 4b): a row token with an interior CR (a cluster row) is never put in a header — the download goes anonymous; its pieces are in no request, log line, error, engine record or fact (${[...leaksAny(rCr, TA), ...leaksAny(rCr, TB)].join(', ') || 'clean'})`, rCr.err && `${rCr.err.code}: ${String(rCr.err.message).slice(0, 160)}`);
  // a transport error that QUOTES the header it refused — said by its kind, never its message
  const quoting = async (url, opts, next) => { if (opts.headers && opts.headers.authorization) throw new TypeError(`invalid header value: ${opts.headers.authorization}`); return next(url, opts); };
  const rQ = await once(EDS, 'quoting', quoting);
  ok(!leaksK(rQ).length && gateOf(rQ.err) && rQ.err.code === 'build_fetch_failed' && verdictOf(/api\.github\.com could not be reached \(TypeError\)/.test(rQ.err.message)),
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
  ok(verdictOf(wideR.every((r) => r.url === null && r.code === 'plugin_git_spec' && r.hostOf === null)),
    'round 3 (major): a space, tab, CR or LF right before #ref (and any whitespace or control character anywhere: inside the ref, after it, in the path) ⇒ refused BY NAME plugin_git_spec — git is never handed it; gitHostOf agrees (null)', wideR.filter((r) => r.url !== null || r.code !== 'plugin_git_spec' || r.hostOf !== null));
  const recRows = [...SHAPES, ...WIDE, '  https://GitHub.com/acme/kernel-engine.git#v1  ', 'git@github.com:/acme/kernel-engine.git#main'].map((v) => { let spec = null; try { spec = PIg.gitSpecOf(v); } catch { spec = null; } const src = EKg.gitRepoOf(v); const h = PIg.gitHostOf(v);
    return { v: JSON.stringify(v), same: spec ? !!src && spec.url === src.url && spec.host === src.host && spec.https === src.https && (spec.ref || null) === (src.ref || null) && h === src.host : h === (src ? src.host : null) }; });
  const ePlain = (() => { try { PIg.gitSpecOf('git@github.com/acme/kernel-engine'); return null; } catch (e) { return e; } })();
  ok(gateOf(recRows.every((r) => r.same)) && gateOf(ePlain) && ePlain.code === 'plugin_git_spec' && ePlain.status === 400 && gateOf(/URL must be https:\/\/host\/owner\/repo/.test(ePlain.message)) && verdictOf(/a local path to git/.test(ePlain.message)),
    'round 3 (major): gitSpecOf hands git the PARSED RECORD\'s url (the grammar\'s own string) with its ref, gitHostOf = the same record\'s host — on every shape above; a refusal is 400 plugin_git_spec with the grammar\'s reason («… is a local path to git …»)', { odd: recRows.filter((r) => !r.same), plain: ePlain && `${ePlain.code}: ${ePlain.message}` });
  const APIg = 'https://api.github.com/repos/acme/kernel-engine/releases/assets/42';
  const v3 = ['git@github.com:/acme/kernel-engine.git', 'git@github.com:acme//kernel-engine.git', 'https://github.com/acme//kernel-engine'].map((v) => EKg.kernelCredentialVerdict({ kernelUrl: APIg, install: { source: 'git', value: v }, integration: { host: 'github.com' } }));
  ok(verdictOf(v3.every((x) => x.use === true && x.repository && x.repository.path === 'acme/kernel-engine')),
    'round 2 (minor 4a): the three install values git and plugin-install accept that b43799e5\'s parser called not-a-git-install (a leading slash, a doubled slash) ⇒ the verdict knows the repository — the credential rides its API asset', v3.map((x) => x.why));
}

// ── ④ remote shim shipping ──
console.log('— shims');
await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: true, trusted: true });
writeJson(path.join(pdir('acme.trusty'), 'vibespace-plugin.json'), { ...trustyManifest, capabilities: { server: { fs: { read: ['/etc'] }, childProcess: true } }, contributes: { ...trustyManifest.contributes, agentTools: [{ name: 'ping', description: 'pong', args: {} }] } });
await post('/api/plugins/manifests/reload', {});
await post('/api/plugins/manifests/acme.trusty/enabled', { enabled: true, trusted: true }); // the tool changed the hash → re-consent
const shim = path.join(root, 'data', 'bin', 'vibespace-tool-acme.trusty-ping');
ok(gateOf(fs.existsSync(shim)) && gateOf(/const INSTANCE_URL = "https:\/\/vs\.example\.test";/.test(fs.readFileSync(shim, 'utf8'))) && verdictOf(loader.shimNames().includes('vibespace-tool-acme.trusty-ping')), 'shims bake the instance public URL (instance-url.js) as the fallback call-back and are listed by shimNames()');
const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
HostManager.extraAgentTools = () => ['vibespace-tool-acme.trusty-ping', 'bad name', 'vibespace-status'];
ok(gateOf(HostManager.agentTools().includes('vibespace-tool-acme.trusty-ping')) && HostManager.agentTools().filter((n) => n === 'vibespace-status').length === 1 && !HostManager.agentTools().includes('bad name'), 'HostManager.agentTools() = static tools + valid plugin shims (deduped, filtered)');
HostManager.extraAgentTools = () => [];
loader.shutdown(); srv.close();
try { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(src, { recursive: true, force: true }); } catch {}

// ── ⑤ wiring pins ──
console.log('— wiring pins');
const pc = read('src/lib/plugin-client.js');
ok(gateOf(/if \(!m\.trusted\) \{ if \(cur\) await this\._deactivate\(m\.id\); return; \}/.test(pc)) && gateOf(/await import\(\/\* @vite-ignore \*\/ url\)/.test(pc)) && gateOf(/mod\.activate\(api\)/.test(pc)) && gateOf(/cur\.mod\?\.deactivate/.test(pc)) && verdictOf(/ctl\.abort\(\)/.test(pc)), 'plugin-client imports a module ONLY when the server says trusted, calls activate(api), deactivates + aborts on disable');
ok(gateOf(/registerPluginSettings\(m\.id, m\.label \|\| m\.id, items\)/.test(pc)) && gateOf(/unregisterPluginSettings\(id\)/.test(pc)) && gateOf(/registerPluginTheme\?\.\(key, `\$\{th\.label\} \(plugin\)`/.test(pc)) && gateOf(/unregisterPluginTheme\?\.\(key\)/.test(pc)) && gateOf(/this\.errors\.set\(m\.id, msg\)/.test(pc)) && verdictOf(/showToast\(t\('Plugin \{id\} failed to load: \{error\}'/.test(pc)), 'plugin-client registers/unregisters contributed settings + themes and reports module load errors (toast + errors map)');
ok(gateOf(/fetch: \(p, opts\) => \{[\s\S]{0,300}\/api\/plugins\/\$\{encodeURIComponent\(id\)\}\/x\$\{rel\}/.test(pc)) && verdictOf(/app\.settings\?\.on\?\.\(p, h\)/.test(pc)), 'the host API scopes fetch to the plugin\'s own routes and subscribes settings per path (settings.js on(path, cb))');
const pui = read('src/lib/plugins-ui.js');
ok(gateOf(/_pluginConsentDialog\(p, rr\.capabilities\)/.test(pui)) && gateOf(/enablePlugin\(p, \{ trusted: true \}\)/.test(pui)) && gateOf(/t\('Enable \(trusted\)'\)/.test(pui)) && verdictOf(/escHtml\(t\(it\.text, it\.params \|\| \{\}\)\)/.test(pui)), 'the panel turns a 409 consentRequired into the consent dialog (capability items via t(text, params)) and re-enables with trusted:true');
ok(gateOf(/_pluginInstallDialog\(/.test(pui)) && gateOf(/\/api\/plugins\/install/.test(pui)) && gateOf(/new FormData\(\)/.test(pui)) && gateOf(/method: 'DELETE'/.test(pui)) && gateOf(/\/update`, \{ method: 'POST' \}/.test(pui)) && verdictOf(/showConfirmDialog\(\{ title: t\('Uninstall plugin'\)/.test(pui)), 'the panel has Install plugin… (JSON + multipart), Update, and a confirmed Uninstall');
// lane plugin-settings-p0: a manifest plugin is a LIST row (pluginRow) — its strings reach the DOM as textContent / title, never innerHTML
// (lane ui-phone-and-fit pick 1: the row is the rail row — its name and description are set as text by src/lib/rail-row.js, which has no innerHTML)
const rowFnSrc = pui.slice(pui.indexOf('function pluginRow('), pui.indexOf('\n}\n', pui.indexOf('function pluginRow(')));
ok(rowFnSrc.length > 100 && !/innerHTML/.test(rowFnSrc) && gateOf(/railRow\(\{[^}]*name: label,[^}]*desc: description/.test(rowFnSrc)) && gateOf((() => { const rr = read('src/lib/rail-row.js'); return /n\.textContent = name;/.test(rr) && /d\.textContent = desc;/.test(rr) && !/innerHTML/.test(rr); })()) && gateOf(/p\.notice, clientErr \? t\('Client module error: \{error\}'/.test(pui)) && !/innerHTML = `[^`]*\$\{(?!escHtml)[^}]*\bp\.(notice|id|label|description|version|lastError)\b/.test(pui), 'notices / errors / ids reach the DOM as text (pluginRow: textContent / title — no manifest string in innerHTML; manifest strings sync to every client)');
const ss = read('src/lib/settings-schema.js');
ok(gateOf(/export function registerPluginSettings\(pluginId, label, items\)/.test(ss)) && gateOf(/export function unregisterPluginSettings\(pluginId\)/.test(ss)) && gateOf(/export function pluginSettingPath\(pluginId, key\)/.test(ss)) && verdictOf(/t\('Plugin: \{name\}'/.test(ss)), 'settings-schema exposes register/unregister/path (the only mutation path)');
const tj = read('src/lib/themes.js');
ok(gateOf(/registerPluginTheme\(key, label, cssVars, terminalColors\)/.test(tj)) && gateOf(/unregisterPluginTheme\(key, \{ keepChoice = false \} = \{\}\)/.test(tj)) && gateOf(/getPluginThemes\(\)/.test(tj)) && verdictOf(/this\._pendingTheme\.startsWith\('plugin-'\)/.test(tj)), 'ThemeManager registers plugin themes under plugin-* and keeps a pending plugin theme instead of falling back to dark');
ok(verdictOf(/getPluginThemes\?\.\(\)/.test(read('src/lib/app.js'))), 'the theme picker lists plugin themes in their own group');
const ld = read('src/server/plugin-loader.js');
ok(gateOf(/execArgv: permissionArgs\(rec, dataDir\)/.test(ld)) && gateOf(/'--permission'/.test(ld)) && gateOf(/--allow-child-process/.test(ld)) && gateOf(/delete env\.NODE_OPTIONS/.test(ld)) && verdictOf(/ERR_ACCESS_DENIED/.test(ld)), 'the loader forks plugin servers under node --permission with allowlists from the manifest (NODE_OPTIONS stripped) and classifies denials');
ok(gateOf(/registry\.trust\[id\] = \{ trusted: true, trustedAt: Date\.now\(\), capabilitiesHash: hash \}/.test(ld)) && gateOf(/needsConsent\(manifest\) && !isTrusted\(rec\)/.test(ld)) && verdictOf(/res\.status\(403\)\.json\(\{ error: `plugin "\$\{rec\.id\}" is not trusted/.test(ld)), 'trust is recorded with the capabilities hash, drift disables at discovery, the module route is 403 without it');
ok(gateOf(/HostManager\.extraAgentTools = \(\) => pluginLoader\.shimNames\(\)/.test(read('src/server/mounts-plugins-wiring.js'))) && gateOf(/instanceUrl\?\.onChange\?\./.test(read('src/server/mounts-plugins-wiring.js'))) && ((read('src/ws-create.js') + read('src/spawn/ssh.js') + read('src/spawn/dial.js')).match(/HostManager\.agentTools\(\)/g) || []).length === 2 && !/HostManager\.AGENT_TOOLS\b/.test(read('src/ws-create.js')), 'shims ship with the core tools: wiring installs the provider, ws-create distributes agentTools() (ssh + dial), instance-url changes regenerate them');
ok(gateOf(fs.existsSync(path.join(REPO, 'docs/plugins.md'))) && gateOf(/contributes\.settings/.test(read('docs/plugins.md'))) && gateOf(/--permission/.test(read('docs/plugins.md'))) && verdictOf(/plugins\.md/.test(read('docs/README.md'))), 'docs/plugins.md documents the manifest, tiers, consent, install sources and enforcement; indexed in docs/README.md');
ok(verdictOf(/'test-plugin-trust'/.test(read('scripts/ci.mjs'))), 'this suite is in the release gate');
for (const dict of ['src/lib/i18n-zh.js', 'src/lib/i18n-ja.js']) ok(verdictOf(['Install plugin…', 'Enable (trusted)', 'Uninstall…', 'Plugin: {name}', 'Server: read files under {paths}'].every((k) => read(dict).includes(JSON.stringify(k) + ':'))), `${dict} carries the Ph4 strings`);
const ex = JSON.parse(read('docs/examples/hello-plugin/vibespace-plugin.json'));
ok(ex.contributes.settings?.length === 1 && ex.contributes.themes?.length === 1 && verdictOf(fs.existsSync(path.join(REPO, 'docs/examples/hello-plugin', ex.contributes.themes[0].file))), 'the shipped example demonstrates a contributed setting and theme');

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
