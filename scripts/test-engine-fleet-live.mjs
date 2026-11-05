#!/usr/bin/env node
// test-engine-fleet-live — lane fleet-plugin-catalog (the owner, 2026-11-05: 「为什么后面升浏览器内核每次都要重新 upgrade pod？
// 内核不是插件吗？」), HEAVY: the fleet's engine plugin followed by a REAL server. A scratch checkout of THIS tree boots `server.js`
// with VIBESPACE_PRESETS_DIR at a directory shaped the way the kubelet projects a Secret (`..data` → a timestamped folder,
// each file a symlink through it; an edit = a NEW folder + ONE rename of `..data`), `git` on its PATH = the recording wrapper
// over a local bare repository holding the engine plugin at two commits (scripts/fixtures/git-repo.mjs — never a network, never
// a credential). Legs, read through GET /api/plugins/manifests and said with the panel's own words (browser-build-model
// fleetPluginWords):
//   H1 boot: the Secret pins sha1 ⇒ the boot job installs it, trusted by the cluster — «Installed and trusted by the cluster · <sha1>»
//   H2 the Secret is swapped to sha2 ⇒ the presets watch fires ⇒ updated to sha2, trusted, «Updated by the cluster · <sha1> → <sha2> · …»
//      — the SAME server process (its pid unchanged: no restart)
//   H3 the Secret names a tag ⇒ installed, never trusted, the panel's line names the tag
//   H4 in-process, the REAL in-use check (no seam): a program running from the kernel's place (a copy of `sleep` there) ⇒ a new
//      kernel never lands under it — it waits at .next-<tag>; the program ends ⇒ the next start lands it
// `--tree <dir>` boots ANOTHER checkout (a base's — its RED legs named: the base reads the pin only at boot, and swaps a kernel
// under a running program).
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ti = process.argv.indexOf('--tree'), TREE = ti > 0 ? path.resolve(process.argv[ti + 1]) : null;
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e === undefined ? '' : ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600))); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await fn(); } catch { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(200); } };
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
if (process.platform !== 'linux' || process.arch !== 'x64') { console.log(`  … SKIP — linux-x64 only (a /proc in-use check, a linux-x64 fixture kernel); this is ${process.platform}-${process.arch}`); console.log('\nALL PASS (0)'); process.exit(0); }
const { gitRepoFixture, URL_HTTPS } = await import('./fixtures/git-repo.mjs');
const BM = await import('../src/lib/browser-build-model.js');
const EID = 'vibespace.custom-browser';
const tW = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m));
const short = (s) => String(s).slice(0, 12);
const ROOT = scratch('engine-fleet-live');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });

// ── the plugin's repository: two commits (a tag on the first) ──
const man = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin/vibespace-plugin.json'), 'utf8'));
const srvJs = fs.readFileSync(path.join(REPO, 'scripts/fixtures/engine-plugin/server.js'), 'utf8');
const FX = gitRepoFixture(path.join(ROOT, 'repo'), [{ files: { 'vibespace-plugin.json': { ...man, version: '0.2.1' }, 'server.js': srvJs }, tag: 'v0.2.1' }, { files: { 'vibespace-plugin.json': { ...man, version: '0.2.2' } } }]);
const [sha1, sha2] = FX.shas;

// ── the presets directory as the kubelet projects a Secret ──
const PRE = path.join(ROOT, 'presets'); fs.mkdirSync(PRE, { recursive: true });
let gen = 0;
function project(files) {
  const d = `..${new Date().toISOString().replace(/[:.]/g, '_')}.${gen++}`;
  fs.mkdirSync(path.join(PRE, d));
  for (const [n, v] of Object.entries(files)) fs.writeFileSync(path.join(PRE, d, n), JSON.stringify(v));
  fs.symlinkSync(d, path.join(PRE, '..data_tmp'));
  fs.renameSync(path.join(PRE, '..data_tmp'), path.join(PRE, '..data')); // ONE rename: the swap
  for (const n of Object.keys(files)) { const l = path.join(PRE, n); if (!fs.existsSync(l)) fs.symlinkSync(path.join('..data', n), l); }
}
// the Secret's two keys as projected files: fleet.json (the engine pin) + integrations.json (no rows — the fixture's git needs no credential)
const secretAt = (ref) => ({ 'fleet.json': { relayUrl: '', browserEngine: { plugin: EID, default: false, preinstall: false, source: { git: URL_HTTPS, ref }, kernel: { url: '', sha256: '' } } }, 'integrations.json': [] });

// ── the server: a scratch checkout of THIS tree (its uncommitted files copied in), or `--tree` ──
let wt = TREE, made = false;
if (!wt) {
  wt = path.join(ROOT, 'wt');
  execSync(`git worktree add --detach ${wt} HEAD`, { cwd: REPO, stdio: 'ignore' }); made = true;
  for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wt}/${f} && cp -r ${REPO}/${f} ${wt}/${f}`);
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'));
}
const home = scratchHome('engine-fleet-live-home', fs);
const PORT = await freePort();
let srv = null, sleeper = null;
const cleanup = () => {
  try { srv && srv.kill('SIGKILL'); } catch { /* gone */ }
  try { sleeper && sleeper.kill('SIGKILL'); } catch { /* gone */ }
  for (const r of [ROOT, home]) { try { endRootedProcesses(r); } catch { /* none */ } } // the server's plugin children, anything else it started (§57b)
  if (made) { try { execSync(`git worktree remove --force ${wt}`, { cwd: REPO, stdio: 'ignore' }); } catch { /* gone */ } }
  for (const d of [home, ROOT]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } }
};
process.on('exit', cleanup);
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(1));

console.log(`— the server: ${TREE ? `--tree ${TREE}` : 'a scratch checkout of this tree'}`);
project(secretAt(sha1));
const journal = [];
srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...(await vncEnv()), PORT: String(PORT), HOME: home, PATH: `${FX.bin}:${process.env.PATH}`, VIBESPACE_PRESETS_DIR: PRE, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1', VS_NO_REAL_CLI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
for (const s of [srv.stdout, srv.stderr]) s.on('data', (b) => journal.push(...String(b).split('\n').filter(Boolean)));
const pid0 = srv.pid;
const manifests = async () => { const r = await fetch(`http://127.0.0.1:${PORT}/api/plugins/manifests`); return r.ok ? r.json() : null; };
const row = async () => { const m = await manifests(); return m ? { p: (m.plugins || []).find((x) => x.id === EID) || null, fleet: m.fleet || null } : null; };

console.log('— H1 boot: the Secret pins sha1');
const h1 = await until(async () => { const r = await row(); return r && r.p && r.p.trustedBy === 'fleet' && r.p.install && r.p.install.sha === sha1 ? r : null; }, 45000);
const f1 = h1 ? BM.fleetPluginWords(h1.p, h1.fleet, tW).fact : null;
ok(!!h1 && h1.p.enabled && f1 === `Installed and trusted by the cluster · ${short(sha1)}`, `H1: the boot job installed the cluster's pin, trusted by the cluster — the row reads «${f1}»`, h1 ? h1.p.install : { exit: srv.exitCode, said: journal.filter((l) => /presets\]|plugins\]|fleet|rror|listening/i.test(l)).slice(-14) });

console.log('— H2 the kubelet swaps the Secret to sha2 (the admin\'s edit) — the same server process');
const t2 = Date.now();
project(secretAt(sha2));
const h2 = await until(async () => { const r = await row(); return r && r.p && r.p.install && r.p.install.sha === sha2 && r.p.trustedBy === 'fleet' ? r : null; }, 30000);
const f2 = h2 ? BM.fleetPluginWords(h2.p, h2.fleet, tW, () => 'WHEN').fact : null;
ok(!!h2 && srv.pid === pid0 && srv.exitCode === null && h2.p.version === '0.2.2' && h2.fleet && h2.fleet.outcome === 'updated' && h2.fleet.why === 'change',
  `H2: the presets watch ran the job — updated to sha2 and trusted at it in ${Math.round((Date.now() - t2) / 100) / 10} s, the server never restarted (pid ${pid0})`, h2 ? { install: h2.p.install, fleet: h2.fleet } : { last: journal.filter((l) => /presets|fleet/.test(l)).slice(-6) });
ok(f2 === `Updated by the cluster · ${short(sha1)} → ${short(sha2)} · WHEN`, `H2: the row reads «${f2}»`);
ok(journal.some((l) => /\[presets\] changed .*browser engine changed/.test(l)) && journal.some((l) => l.includes(`fleet plugin: cluster pins ${short(sha2)} — updating ${EID} from ${short(sha1)}`)),
  'H2: the journal names each step («[presets] changed …: browser engine changed», «fleet plugin: cluster pins <sha2> — updating … from <sha1>»)', journal.filter((l) => /presets\]|fleet plugin/.test(l)).slice(-6));

console.log('— H3 the Secret names a tag');
project(secretAt('v0.2.1'));
const h3 = await until(async () => { const r = await row(); return r && r.p && r.fleet && r.fleet.outcome === 'unpinned' && r.p.install && r.p.install.ref === 'v0.2.1' ? r : null; }, 30000);
const l3 = h3 ? BM.fleetPluginWords(null, h3.fleet, tW).line : null;
ok(!!h3 && !h3.p.trusted && h3.p.consentRequired && l3 === `The cluster names ${EID} at «v0.2.1» — not a full commit sha, so the cluster does not trust it; review it and enable it in ⚙ → Plugins → ${EID} · waiting for your consent — its kernel is not fetched`,
  `H3: a tag ⇒ installed, never trusted; the panel line reads «${l3}»`, h3 ? { trusted: h3.p.trusted, fleet: h3.fleet } : null);
try { srv.kill('SIGTERM'); } catch { /* gone */ }
await until(() => srv.exitCode !== null || srv.signalCode !== null, 10000);

console.log('— H4 in-process: the REAL in-use check (a program running from the kernel\'s place)');
{
  const tarRaw = (entries) => { const parts = []; for (const e of entries) { const h = Buffer.alloc(512), body = e.body == null ? Buffer.alloc(0) : Buffer.from(e.body); h.write(e.name, 0, 100, 'utf8'); h.write(((e.mode || 0o644).toString(8)).padStart(7, '0') + '\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116); h.write((e.type === '5' ? 0 : body.length).toString(8).padStart(11, '0') + '\0', 124); h.write('00000000000\0', 136); h.write(e.type || '0', 156); h.write('ustar\0', 257); h.write('00', 263); h.fill(32, 148, 156); let sum = 0; for (const b of h) sum += b; h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148); parts.push(h); if (e.type !== '5') parts.push(body, Buffer.alloc((512 - (body.length % 512)) % 512)); } parts.push(Buffer.alloc(1024)); return Buffer.concat(parts); };
  const kernel = (v) => zlib.zstdCompressSync(tarRaw([{ name: 'k/', type: '5', mode: 0o755 }, { name: 'k/chrome', body: `#!/bin/sh\necho "Chromium ${v}"\n`, mode: 0o755 }, { name: 'k/resources.pak', body: crypto.randomBytes(300) }]));
  const K = { '/k1.tar.zst': kernel('150.1.1.1-fx'), '/k2.tar.zst': kernel('150.2.2.2-fx') };
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const host = http.createServer((q, r) => { const b = K[q.url]; if (!b) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-length': b.length }); r.end(b); });
  await new Promise((r) => host.listen(0, '127.0.0.1', r));
  const D = path.join(ROOT, 'h4', 'data'); fs.mkdirSync(path.join(D, 'plugins', EID), { recursive: true });
  const kj = (k, v) => fs.writeFileSync(path.join(D, 'plugins', EID, 'kernel.json'), JSON.stringify({ schemaVersion: 1, id: EID, version: v, protocol: 1, layout: { archiveFormat: 'tar.zst', stripComponents: 1, binaryRelPath: 'chrome', requiredFiles: ['chrome', 'resources.pak'] }, platforms: { 'linux-x64': { url: `https://kernels.test/${k}.tar.zst`, sha256: sha(K[`/${k}.tar.zst`]), bytes: K[`/${k}.tar.zst`].length, version: v, binaryRelPath: 'chrome' } } }));
  const KP = path.join(D, 'plugins-state', EID, 'kernel', 'linux-x64', 'chrome');
  const EDM = require(path.join(wt, 'src/server/engine-distribution.js'));
  const ED = EDM.create({ dataDir: D, engines: { kernelPath: () => KP, rows: () => [] }, loader: { isTrusted: () => true, list: () => [{ id: EID, label: 'Fixture Browser Engine', version: '0.2.2', trusted: true }], installRecord: () => null }, resolveUrl: (u) => u.replace(/^https:\/\/kernels\.test/, `http://127.0.0.1:${host.address().port}`), freeOf: async (d) => ({ free: 1e12, path: d }), log: { log() {}, warn() {}, error() {} } });
  const receipt = () => { try { return JSON.parse(fs.readFileSync(path.join(path.dirname(KP), 'install-receipt.json'), 'utf8')).sha256; } catch { return null; } };
  kj('k1', '150.1.1.1-fx');
  await ED.installKernel(EID, { by: 'fleet', wait: true });
  // a program RUNNING FROM the kernel's place: /proc/<pid>/exe points inside it (the way the kernel's chrome would)
  const prog = path.join(path.dirname(KP), 'sleep'); // named `sleep`: a multicall coreutils (uutils) dispatches on its own name
  fs.copyFileSync(execSync('command -v sleep', { encoding: 'utf8' }).trim(), prog); fs.chmodSync(prog, 0o755);
  sleeper = spawn(prog, ['300'], { stdio: 'ignore' });
  const runs = await until(() => { try { return fs.readlinkSync(`/proc/${sleeper.pid}/exe`) === prog; } catch { return false; } }, 5000);
  ok(!!runs && sleeper.exitCode === null, 'H4: a program runs FROM the kernel\'s place (its /proc/<pid>/exe is inside it)', { exe: (() => { try { return fs.readlinkSync(`/proc/${sleeper.pid}/exe`); } catch (e) { return e.code; } })(), exit: sleeper.exitCode });
  kj('k2', '150.2.2.2-fx');
  let r2 = null; try { r2 = await ED.installKernel(EID, { by: 'fleet', wait: true }); } catch (e) { r2 = { ok: false, code: e.code }; }
  const alive = sleeper.exitCode === null && fs.existsSync(prog);
  ok(receipt() === sha(K['/k1.tar.zst']) && alive && r2 && r2.staged === true && fs.existsSync(path.join(path.dirname(path.dirname(KP)), '.next-linux-x64', 'chrome')),
    'H4: a new kernel downloaded while a program runs from the kernel\'s place (seen in /proc/<pid>/exe — no seam) waits at .next-<tag>; the place and the running program untouched', { r2, receipt: receipt() && short(receipt()), alive });
  const landedWhileRunning = typeof ED.landNext === 'function' ? await ED.landNext(EID) : null;
  try { sleeper.kill('SIGKILL'); } catch { /* gone */ }
  await until(() => sleeper.exitCode !== null || sleeper.signalCode !== null, 5000);
  const landed = typeof ED.landNext === 'function' ? await ED.landNext(EID) : null;
  ok(landedWhileRunning === false && landed === true && receipt() === sha(K['/k2.tar.zst']), 'H4: no landing while it runs; once it ended, the next start lands the waiting kernel (no second download)', { landedWhileRunning, landed });
  host.close();
}
console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
