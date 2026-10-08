#!/usr/bin/env node
// LANE BROWSER-PROFILE-CLONE (B-9669, the owner 2026-10-08: "复制登录建新 profile 其实是可以做的，可能有点用") — New profile… →
// "Copy logins from": a STOPPED named profile's folder copied into a new profile (a one-time snapshot). Fast:
//   ① PURE: the clone verdict table (stopped / running / leased / other machine / no folder / size / platform / gone);
//   ② both exclusion tables as CENSUSES — every name the keeper's own code reads in a profile directory is a 'runtime' row,
//      the caches are 'cache' rows, the login stores are kept; MUTANT controls: a copy whose table lost SingletonLock copies
//      it (RED), one whose verdict lets a leased source through copies it (RED);
//   ③ atomicity: a throw mid-copy or at the rename leaves no <dir> and no <dir>.copying, refused clone_failed + the fs code;
//   ④ the words en/zh/ja (every refusal code worded, every key in both dictionaries with its placeholders) + the dialog's
//      rows over the real model + the body it sends + the panel's "copied from" fold line;
//   ⑤ the routes over the REAL keeper with a fixture folder: the copy's file set = the tables', `clonedFrom` on the record,
//      a running source stopped through the keeper's own Stop (a scratch `sleep` is its browser) before the copy, a leased
//      one refused by the holder's name, an agent token refused.
// Run: node scripts/test-browser-profile-clone.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const C = require('../src/browser-clone.js');
const CR = require('../src/server/browser-clone-run.js');
const F = require('../src/browser-facts.js');
const M = await import('../src/lib/browser-new-profile-model.js');
const PM = await import('../src/lib/browser-panel-model.js');
const zh = (await import('../src/lib/i18n-zh.js')).default;
const ja = (await import('../src/lib/i18n-ja.js')).default;

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1200) : '')); } return !!c; };
const J = (x) => JSON.stringify(x);
const SCR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-bpclone-'));
process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { /* none */ } });

// ═══ ① the verdict ═══
console.log('— ① the clone verdict (PURE)');
const src = { id: 'bp-0000000a', label: 'Bank', dir: '/h/.agent-browser/bp-0000000a', provider: 'chromium' };
const V = (o) => C.cloneVerdict({ source: src, ...o });
ok(V({}).ok && V({}).stopFirst === false, 'stopped ⇒ ok, nothing to stop');
ok(V({ live: true }).ok && V({ live: true }).stopFirst === true, 'running with no lease ⇒ ok, stopped first');
const lv = V({ live: true, holders: [{ sessionId: 's1', name: 'Bank chores' }] });
ok(!lv.ok && lv.code === 'source_leased' && /Bank chores/.test(lv.error) && lv.holders[0].name === 'Bank chores', 'leased ⇒ source_leased naming the holder (never taken from an agent)', lv);
ok(C.cloneVerdict({ source: { ...src, host: 'h-1' } }).code === 'source_same_machine_only' && V({ host: 'h-1' }).code === 'source_same_machine_only', 'a source on another machine than the new profile ⇒ source_same_machine_only');
ok(C.cloneVerdict({ source: { ...src, host: 'h-1' }, host: 'h-1', cloneOp: false }).code === 'clone_agent_too_old', 'a paired machine whose agent has no copy op ⇒ clone_agent_too_old');
ok(V({ platform: 'darwin' }).code === 'clone_unsupported_platform' && V({ platform: 'win32' }).code === 'clone_unsupported_platform', 'macOS / Windows ⇒ clone_unsupported_platform (not measurable here — never a silent half-copy)');
ok(C.cloneVerdict({ source: { ...src, dir: null } }).code === 'source_no_folder', 'a profile with no folder of ours (cdp / cloud) ⇒ source_no_folder');
const big = V({ bytes: C.CLONE_MAX_BYTES + 1 });
ok(!big.ok && big.code === 'clone_too_big' && big.bytes === C.CLONE_MAX_BYTES + 1 && V({ bytes: C.CLONE_MAX_BYTES }).ok, 'over 2 GiB ⇒ clone_too_big with the size; exactly 2 GiB passes');
ok(C.cloneVerdict({ source: null }).code === 'source_not_found', 'a gone source ⇒ source_not_found');
const rows = C.sourceRows({ profiles: [src, { id: 'bp-0000000b', label: 'Run', dir: '/x' }, { id: 'bp-0000000c', label: 'Held', dir: '/y' }, { id: 'bp-0000000d', label: 'Port', provider: 'cdp' }, { id: 'bp-0000000e', label: 'There', host: 'h-1', dir: '/z' }], liveOf: (id) => id === 'bp-0000000b', holdersOf: (id) => (id === 'bp-0000000c' ? [{ sessionId: 's9' }] : []) });
ok(J(rows.map((r) => [r.label, r.state, r.pickable])) === J([['Bank', 'stopped', true], ['Run', 'running', true], ['Held', 'leased', false], ['Port', 'no-folder', false]]), 'sourceRows: every profile ON THAT MACHINE is a row with its state (another machine\'s is not this list\'s)', rows);
const ci = C.cloneInput({ label: 'Bank 2', cloneFrom: src.id, provider: 'cloak', use: 1 }, { ...src, provider: 'chromium', browser: { kind: 'build', version: '151.0.7922.34' }, owner: { kind: 'session', id: 'x' }, notes: 'n' }, 1234);
ok(ci.input.provider === 'chromium' && ci.input.browser.version === '151.0.7922.34' && !('cloneFrom' in ci.input) && !('notes' in ci.input) && !('owner' in ci.input) && J(ci.clonedFrom) === J({ id: src.id, label: 'Bank', at: 1234 }), 'the copy runs the SOURCE\'s provider + build; its list, notes and owner are not copied; clonedFrom = {id, label, at}', ci);

// ═══ ② the tables as censuses ═══
console.log('— ② the exclusion tables (censuses + mutant controls)');
// every name the keeper's own code reads or writes INSIDE a profile directory (path.join(<dir>, '<Name>'))
const readers = ['src/browser-facts.js', 'src/server/browser-keeper.js', 'src/browser-serve.js'].map((f) => fs.readFileSync(path.join(repo, f), 'utf8')).join('\n');
const named = new Set([...readers.matchAll(/path\.join\((?:String\()?(?:dir|d|p\.dir|rec\.dir|profileDir)\)?,\s*'([A-Z][A-Za-z]+)'\)/g)].map((m) => m[1]));
for (const n of F.SINGLETON_FILES) named.add(n);
ok(named.size >= 4 && [...named].every((n) => C.cloneSkip(n) === 'runtime'), `every runtime name the keeper's own code uses in a profile dir is a 'runtime' row (${[...named].sort().join(', ')})`, [...named].filter((n) => C.cloneSkip(n) !== 'runtime'));
ok(['lockfile', 'RunningChromeVersion', 'Default.lock', 'x.lock'].every((n) => C.cloneSkip(n) === 'runtime'), 'lockfile, RunningChromeVersion and *.lock are runtime rows');
const CACHES = ['Cache', 'Code Cache', 'GPUCache', 'ShaderCache', 'GrShaderCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'component_crx_cache', 'optimization_guide_model_store', 'optimization_guide_prediction_model_downloads'];
ok(CACHES.every((n) => C.cloneSkip(n) === 'cache'), 'the brief\'s caches are cache rows (optimization_guide_* by prefix)');
ok(['Service Worker', 'IndexedDB', 'Cookies', 'Local State', 'Login Data', 'Local Storage', 'Session Storage', 'Preferences', 'Default'].every((n) => C.cloneSkip(n) === null), 'Service Worker, IndexedDB and every login store are KEPT (sites keep sessions there)');
function fixture(dir) {
  const w = (rel, body = 'x') => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); };
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  w('Local State', '{}'); w('Default/Cookies', 'cookie-db'); w('Default/Preferences', '{}'); w('Default/Login Data', 'l');
  w('Default/Service Worker/Database/MANIFEST', 'sw'); w('Default/IndexedDB/https_bank.test_0.indexeddb.leveldb/CURRENT', 'idb'); w('Default/Local Storage/leveldb/000003.log', 'ls');
  fs.symlinkSync(`${os.hostname()}-2147483646`, path.join(dir, 'SingletonLock')); fs.symlinkSync(path.join(SCR, 'gone', 'SingletonSocket'), path.join(dir, 'SingletonSocket')); fs.symlinkSync('1234', path.join(dir, 'SingletonCookie'));
  w('DevToolsActivePort', '9222\n/devtools/browser/x'); w('lockfile', ''); w('RunningChromeVersion', '154'); w('Default/LOCK.lock', '');
  for (const c of ['Default/Cache/Cache_Data/data_0', 'Default/Code Cache/js/index', 'GPUCache/data_1', 'GPUPersistentCache/x', 'ShaderCache/x', 'GrShaderCache/x', 'DawnCache/x', 'component_crx_cache/x', 'optimization_guide_model_store/x']) w(c, 'cache');
}
const walk = (d, base = d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => { const f = path.join(d, e.name); const rel = path.relative(base, f); return e.isDirectory() ? [rel + '/', ...walk(f, base)] : [rel]; }).sort();
const KEPT = ['Default/', 'Default/Cookies', 'Default/IndexedDB/', 'Default/IndexedDB/https_bank.test_0.indexeddb.leveldb/', 'Default/IndexedDB/https_bank.test_0.indexeddb.leveldb/CURRENT', 'Default/Local Storage/', 'Default/Local Storage/leveldb/', 'Default/Local Storage/leveldb/000003.log', 'Default/Login Data', 'Default/Preferences', 'Default/Service Worker/', 'Default/Service Worker/Database/', 'Default/Service Worker/Database/MANIFEST', 'Local State'];
const S1 = path.join(SCR, 'src1'); fixture(S1);
const D1 = path.join(SCR, 'dst1');
const r1 = await CR.copyProfileDir(S1, D1);
ok(J(walk(D1)) === J(KEPT), 'the copy\'s file set = the tables\' verdict (no lock, no runtime file, no cache; every login store)', walk(D1));
ok((fs.statSync(D1).mode & 0o777) === 0o700 && !fs.existsSync(D1 + '.copying') && r1.skipped.includes('SingletonLock') && r1.skipped.includes('GPUCache'), 'the new folder is 0700, no .copying is left, the answer names what stayed behind');
ok(fs.readFileSync(path.join(D1, 'Default/Cookies'), 'utf8') === 'cookie-db' && fs.lstatSync(path.join(S1, 'SingletonLock')).isSymbolicLink(), 'the cookie store is the source\'s bytes; the source is untouched');
const sz = await CR.sizeToCopy(S1);
ok(sz === KEPT.filter((f) => !f.endsWith('/')).reduce((a, f) => a + fs.statSync(path.join(S1, f)).size, 0), `the size is judged over the copied entries only (${sz} bytes, caches not counted)`);
// MUTANT ①: the table without SingletonLock
const MUT = path.join(SCR, 'mut'); fs.mkdirSync(MUT);
const cloneSrc = fs.readFileSync(path.join(repo, 'src/browser-clone.js'), 'utf8');
fs.writeFileSync(path.join(MUT, 'browser-clone.js'), cloneSrc.replace("['SingletonLock', 'SingletonSocket'", "['SingletonSocket'"));
fs.writeFileSync(path.join(MUT, 'browser-clone-run.js'), fs.readFileSync(path.join(repo, 'src/server/browser-clone-run.js'), 'utf8').replace("require('../browser-clone.js')", `require(${J(path.join(MUT, 'browser-clone.js'))})`));
const MR = require(path.join(MUT, 'browser-clone-run.js'));
const D2 = path.join(SCR, 'dst2'); await MR.copyProfileDir(S1, D2);
ok(J(walk(D2)) !== J(KEPT) && walk(D2).includes('SingletonLock'), 'RED CONTROL: a copy whose table lost SingletonLock copies it — the file-set check above goes red on it');
// MUTANT ②: the verdict lets a leased source through
fs.writeFileSync(path.join(MUT, 'browser-clone-leased.js'), cloneSrc.replace("if (st === 'leased') return", "if (false) return"));
const MV = require(path.join(MUT, 'browser-clone-leased.js'));
ok(MV.cloneVerdict({ source: src, holders: [{ sessionId: 's1' }] }).ok === true && C.cloneVerdict({ source: src, holders: [{ sessionId: 's1' }] }).ok === false, 'RED CONTROL: a verdict that lets a leased source through answers ok — the leased check above goes red on it');

// ═══ ③ atomicity ═══
console.log('— ③ atomicity: a throw mid-copy leaves nothing');
for (const [what, patch] of [['mid-copy', { cp: async (a, b, o) => { await fs.promises.cp(a, b, { ...o, filter: (s) => { if (/Cookies$/.test(s)) throw Object.assign(new Error('EIO: i/o error'), { code: 'EIO' }); return o.filter(s); } }); } }], ['at the rename', { rename: async () => { throw Object.assign(new Error('EXDEV: cross-device'), { code: 'EXDEV' }); } }]]) {
  const D = path.join(SCR, 'dst-' + what.replace(/\W/g, ''));
  let e = null; try { await CR.copyProfileDir(S1, D, { fsp: { ...fs.promises, ...patch } }); } catch (x) { e = x; }
  ok(e && e.code === 'clone_failed' && e.fsCode === (what === 'mid-copy' ? 'EIO' : 'EXDEV') && !fs.existsSync(D) && !fs.existsSync(D + '.copying'), `a throw ${what} ⇒ clone_failed (${e && e.fsCode}) and no <dir>, no <dir>.copying`, e && e.message);
}

// ═══ ④ words + the dialog model ═══
console.log('— ④ the words (en/zh/ja), the dialog rows, the body, the panel line');
const codes = new Set([...fs.readFileSync(path.join(repo, 'src/browser-clone.js'), 'utf8').matchAll(/code: '([a-z_]+)'/g)].map((m) => m[1]));
for (const m of fs.readFileSync(path.join(repo, 'src/server/browser-keeper.js'), 'utf8').matchAll(/namedError\('((?:source|clone)_[a-z_]+)'/g)) codes.add(m[1]);
for (const m of fs.readFileSync(path.join(repo, 'src/server/browser-clone-run.js'), 'utf8').matchAll(/code = '([a-z_]+)'/g)) codes.add(m[1]);
const { STATUS } = require('../src/routes/browser.js');
ok(codes.size >= 9 && [...codes].every((c) => M.createRefusalWords({ code: c, source: 'Bank', holders: [{ name: 'Bank chores' }], bytes: 3 * 2 ** 30, fsCode: 'EIO' }) && STATUS[c]), `every refusal code is worded by name and has a status (${[...codes].sort().join(', ')})`, [...codes].filter((c) => !M.createRefusalWords({ code: c }) || !STATUS[c]));
const tp = (s, p) => (p ? s.replace(/\{(\w+)\}/g, (x, k) => p[k]) : s);
ok(/Bank chores/.test(M.createRefusalWords({ code: 'source_leased', source: 'Bank', holders: [{ name: 'Bank chores' }] }, tp)) && /3\.0 GB/.test(M.createRefusalWords({ code: 'clone_too_big', source: 'Bank', bytes: 3 * 2 ** 30 }, tp)) && /EIO/.test(M.createRefusalWords({ code: 'clone_failed', fsCode: 'EIO' }, tp)), 'the refusals carry the holder, the size and the fs code');
const keys = new Set();
const tk = (k) => { keys.add(k); return k; };
M.cloneSourceChoices({ sources: [{ id: 'a', state: 'stopped' }, { id: 'b', state: 'running' }, { id: 'c', state: 'leased', holders: [{}] }, { id: 'd', state: 'other-machine' }, { id: 'e', state: 'no-folder' }], t: tk });
M.cloneMachineVerdict({ hostId: 'h', platform: 'darwin' }, { t: tk }); M.cloneMachineVerdict({ hostId: 'h', platform: 'linux', capabilities: [] }, { t: tk });
for (const c of codes) M.createRefusalWords({ code: c }, tk);
PM.rowFold({ id: 'bp-1', label: 'x', clonedFrom: { id: 'bp-0', label: 'Bank', at: 0 } }, { w: { t: tk } });
const dialogSrc = fs.readFileSync(path.join(repo, 'src/lib/browser-new-profile.js'), 'utf8');
const cloneBlock = dialogSrc.slice(dialogSrc.indexOf('lane browser-profile-clone (B-9669)'));
for (const m of cloneBlock.matchAll(/\bt\('((?:[^'\\]|\\.)+)'/g)) if (/[Cc]op(y|ies|ied)|profiles on this|signed|logins/.test(m[1])) keys.add(m[1].replace(/\\'/g, "'"));
const ph = (s) => J([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
const missing = [...keys].filter((k) => !zh[k] || !ja[k] || ph(zh[k]) !== ph(k) || ph(ja[k]) !== ph(k));
ok(keys.size >= 25 && !missing.length, `every new word (${keys.size}) is in zh and ja with the same placeholders`, missing);
const ch = M.cloneSourceChoices({ sources: [{ id: 'bp-a', label: 'Bank', state: 'stopped' }, { id: 'bp-b', label: 'Mail', state: 'running' }, { id: 'bp-c', label: 'Held', state: 'leased', holders: [{ name: 'Bank chores' }] }], t: (s, p) => (p ? s.replace(/\{(\w+)\}/g, (x, k) => p[k]) : s) });
ok(J(ch.map((r) => [r.key, r.pickable])) === J([['none', true], ['bp-a', true], ['bp-b', true], ['bp-c', false]]) && /stopped first/.test(ch[2].note) && /Bank chores/.test(ch[3].note), '"Don\'t copy" first; stopped and running pickable (running says it is stopped first); leased names the holder, not pickable');
ok(M.cloneMachineVerdict(null).ok && M.cloneMachineVerdict({ hostId: 'h', platform: 'win32', label: 'PC' }).code === 'clone_unsupported_platform' && M.cloneMachineVerdict({ hostId: 'h', platform: 'linux', capabilities: ['browser-serve'] }).code === 'clone_agent_too_old', 'the machine row: this computer copies; Windows/macOS is said; a paired Linux machine\'s agent without the op is said');
const b = M.createBody({ label: 'Bank 2', provider: 'cdp', cdpPort: '', cloneFrom: 'bp-a' });
ok(b.ok && b.body.cloneFrom === 'bp-a' && !('provider' in b.body) && !('browser' in b.body), 'the body names the source and sends no provider/build (the copy runs the source\'s)', b);
const fold = PM.rowFold({ id: 'bp-1', label: 'Bank 2', clonedFrom: { id: 'bp-a', label: 'Bank', at: new Date(2026, 9, 8, 12).getTime() } }, { w: { t: (s, p) => (p ? s.replace(/\{(\w+)\}/g, (x, k) => p[k]) : s), date: (ms) => new Date(ms).toLocaleDateString('zh-CN') } }).find((r) => r.key === 'cloned');
ok(fold && fold.v === 'copied from Bank on 2026/10/8', 'the panel fold says "copied from {label} on {date}" through the viewer\'s date word', fold);

// ═══ ⑤ the routes over the REAL keeper ═══
console.log('— ⑤ the routes over the REAL keeper with a fixture folder');
const express = require('express');
const K = require('../src/server/browser-keeper.js');
const Rt = require('../src/routes/browser.js');
const HOME = path.join(SCR, 'home'), DATA = path.join(SCR, 'data');
fs.mkdirSync(HOME, { recursive: true }); fs.mkdirSync(DATA, { recursive: true });
const quiet = { log: () => { }, warn: () => { }, error: () => { } };
const k = K.create({ dataDir: DATA, homeDir: HOME, env: () => ({ PATH: path.join(SCR, 'no-bin'), HOME }), broadcast: () => { }, serverSetting: () => undefined, serverNotice: () => { }, getTelemetry: () => null, liveKeys: () => new Set(), log: quiet, tickMs: 3600e3, install: false });
const sessions = new Map([['s1', { name: 'Bank chores' }]]);
Rt.setup({ keeper: k, activeSessions: sessions, browserEnv: () => null, adoptRoots: { homeDir: HOME, dataDir: DATA }, tasksForSession: () => [] });
const app = express(); app.use(express.json()); app.use(Rt.router);
const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const U = `http://127.0.0.1:${srv.address().port}`;
const post = async (p, body, h = {}) => { const r = await fetch(U + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: J(body) }); return { status: r.status, ...(await r.json()) }; };
const bank = k.createProfile({ label: 'Bank' }, { owner: { kind: 'instance', id: null } });
fs.rmSync(bank.dir, { recursive: true, force: true }); fixture(bank.dir);
const srcRows = await (await fetch(U + '/api/browser/clone-sources')).json();
ok(srcRows.sources && srcRows.sources.length === 1 && srcRows.sources[0].state === 'stopped' && srcRows.sources[0].pickable, 'GET /api/browser/clone-sources lists this machine\'s named profile, stopped and pickable', srcRows);
const ag = await post('/api/browser/profiles', { label: 'Agent copy', cloneFrom: bank.id }, { authorization: 'Bearer vsst_abc' });
ok(ag.status === 403 && ag.code === 'agent_forbidden' && /user's act/.test(ag.error), 'an agent token is refused agent_forbidden (copying logins is the user\'s act)', ag);
const c1 = await post('/api/browser/profiles', { label: 'Bank 2', cloneFrom: bank.id });
const p1 = c1.profile || {};
ok(c1.status === 200 && p1.clonedFrom && p1.clonedFrom.id === bank.id && p1.clonedFrom.label === 'Bank' && Number.isFinite(p1.clonedFrom.at), 'POST /api/browser/profiles {cloneFrom} ⇒ a new record born with clonedFrom {id, label, at}', c1);
ok(p1.dir && path.basename(p1.dir).startsWith('vs-bp-') && path.dirname(p1.dir) === path.join(HOME, '.agent-browser') && p1.dir !== bank.dir && J(walk(p1.dir)) === J(KEPT) && !fs.existsSync(p1.dir + '.copying'), 'its folder is the one the keeper MINTS for it, holding exactly the tables\' file set', walk(p1.dir || SCR));
ok(!('cloneFrom' in p1) && p1.provider === 'chromium' && (p1.owner || {}).kind === 'instance', 'the record carries no cloneFrom; the dialog\'s own rows (who may use it) apply');
// a RUNNING source (no lease): a scratch `sleep` is its browser — the keeper's own Stop ends it BEFORE the copy
const sl = spawn('sleep', ['60'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 100));
const st0 = F.procStart(sl.pid);
k._reg().browsers[bank.id] = { profileId: bank.id, state: 'ready', hostId: null, ns: 'vs-bp-test', pid: sl.pid, starttime: st0, browser: { pid: sl.pid, starttime: st0, dir: bank.dir }, startedAt: Date.now() };
const rows2 = await (await fetch(U + '/api/browser/clone-sources')).json();
ok(rows2.sources[0].state === 'running' && rows2.sources[0].pickable, 'a running source (no lease) is listed running — pickable, stopped first', rows2);
const t0 = Date.now();
const c2 = await post('/api/browser/profiles', { label: 'Bank 3', cloneFrom: bank.id });
const exited = await new Promise((r) => (sl.exitCode !== null || sl.signalCode ? r(true) : (sl.once('exit', () => r(true)), setTimeout(() => r(false), 3000))));
ok(c2.status === 200 && exited && !F.pidAlive(sl.pid) && k._reg().browsers[bank.id].state === 'stopped' && c2.profile && J(walk(c2.profile.dir)) === J(KEPT), `the running source was stopped through the keeper's Stop (its "browser" ended) and THEN copied (${Date.now() - t0} ms)`, { c2, state: k._reg().browsers[bank.id] });
try { sl.kill('SIGKILL'); } catch { /* gone */ }
const c4 = await post('/api/browser/profiles', { label: 'Bank 2', cloneFrom: bank.id });
ok(c4.status === 409 && c4.code === 'label_taken', 'a taken name is refused BEFORE anything is stopped or copied (label_taken)', c4);
// a LEASED source: refused by the holder's name, nothing written
k._reg().leases.push({ profileId: bank.id, browserKey: 'bk-0000000a', sessionId: 's1', targetId: null, since: Date.now(), input: 'agent', viewers: 0 });
const before = fs.readdirSync(path.join(HOME, '.agent-browser')).sort();
const rows3 = await (await fetch(U + '/api/browser/clone-sources')).json();
ok(rows3.sources[0].state === 'leased' && !rows3.sources[0].pickable && rows3.sources[0].holders[0].name === 'Bank chores', 'a leased source is listed leased, by the holder\'s name, not pickable', rows3);
const c3 = await post('/api/browser/profiles', { label: 'Bank 4', cloneFrom: bank.id });
ok(c3.status === 409 && c3.code === 'source_leased' && c3.holders && c3.holders[0].name === 'Bank chores' && c3.source === 'Bank' && J(fs.readdirSync(path.join(HOME, '.agent-browser')).sort()) === J(before) && !k.list().profiles?.some?.((p) => p.label === 'Bank 4'), 'POST with a leased source ⇒ 409 source_leased naming "Bank chores"; no folder, no record', c3);
const c5 = await post('/api/browser/profiles', { label: 'Ghost', cloneFrom: 'bp-0000dead' });
ok(c5.status === 404 && c5.code === 'source_not_found', 'a gone source ⇒ 404 source_not_found', c5);
srv.close();
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
