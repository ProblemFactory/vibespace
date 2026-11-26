#!/usr/bin/env node
// THE DEVICE BUNDLE's SHARED MODULES WRITE THEIR RECORDS THROUGH THE DEVICE's ONE DOOR (row B-574d, slice «device-bundle-inputs»,
// 主开发 r4806, lane bl-machines-b). Before: four records of modules the device agent bundles — the migrations' ledger, the OpenCode
// serve's record, the kept default microphone and the apps' index — were written by a temp and a rename with no sync. After a power
// cut such a file could come back empty or torn: a torn ledger holds every migration until a person restores it; a torn serve record
// can neither adopt nor stop its serve; a lost default microphone cannot be given back; a torn index drops every app. Now each takes
// its name only after ONE sync of its temp, through src/agentd/durable-file.js (never the hub's src/fd-close.js). Stand-ins only: a
// scratch root of this suite's own; refusals PLACED at the sync call (never a real full disk or a real mount); a stand-in serve (a
// node process that waits, answered by a stand-in fetch); a stand-in microphone helper (an injected execFile). No real agent CLI.
//   ① the ledger, through runMigrations: its temp synced ONCE before its name; a placed EIO said once (its [migrate] words) and the
//      ledger landed. RED: the release's writeLedger
//   ② the serve's record, through a locator's own start of a stand-in serve: the same. RED: the release's writeJsonAtomic
//   ③ the kept default microphone, through createMic's «make the virtual microphone the default» with its own fs: the same, and a
//      placed ENOTSUP (the file system has no sync) said once and landed. RED: the release's writeJson
//   ④ the apps' index, through app-serve's one writer (writeManifest): the same; the apps' last scan (state.json, DERIVED) asks no
//      sync. RED: the release's writeManifest
//   ⑤ the class: each of the four modules calls the door once and none requires the hub's src/fd-close.js; the two DERIVED writers
//      (the apps' last scan and witness list, the RemoteApp log's scrub) ask no sync. RED: the release's ledger writer, counted
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import './scratch.mjs';   // §113's order: the first import after node's own
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
import { winFacts } from './fixtures/stream/mic-fakes.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratchDir('dev-input-records');
const MUT = mutantCopies('dev-input-records', REPO);
const { ok, report } = checker();
const src = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(15); } return !!(await fn()); };
const DF = require(path.join(REPO, 'src/agentd/durable-file.js'));

// ── THE PLACER: every write, sync, close and rename of a file under this suite's root, in order; `REFUSE` places a code on its sync ──
const RT = path.resolve(ROOT) + path.sep;
const under = (p) => typeof p === 'string' && path.resolve(p).startsWith(RT);
const CALLS = [], FDP = new Map();
let REFUSE = null;
const real = { openSync: fs.openSync, writeSync: fs.writeSync, fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, renameSync: fs.renameSync, writeFileSync: fs.writeFileSync, pWriteFile: fs.promises.writeFile, pRename: fs.promises.rename };
fs.openSync = function (p, ...a) { const fd = real.openSync.call(this, p, ...a); if (under(p)) { FDP.set(fd, path.resolve(p)); CALLS.push(['open', path.resolve(p)]); } return fd; };
fs.writeSync = function (fd, ...a) { if (FDP.has(fd)) CALLS.push(['write', FDP.get(fd)]); return real.writeSync.call(this, fd, ...a); };
fs.fsyncSync = function (fd) {
  if (FDP.has(fd)) { CALLS.push(['fsync', FDP.get(fd)]); if (REFUSE) throw Object.assign(new Error(`${REFUSE}: placed by the suite`), { code: REFUSE }); }
  return real.fsyncSync.call(this, fd);
};
fs.closeSync = function (fd) { if (FDP.has(fd)) { CALLS.push(['close', FDP.get(fd)]); FDP.delete(fd); } return real.closeSync.call(this, fd); };
fs.renameSync = function (a, b) { if (under(a)) CALLS.push(['rename', path.resolve(a), path.resolve(b)]); return real.renameSync.call(this, a, b); };
fs.writeFileSync = function (p, ...a) { if (under(p)) CALLS.push(['writeFile', path.resolve(p)]); return real.writeFileSync.call(this, p, ...a); };
fs.promises.writeFile = async function (p, ...a) { if (under(p)) CALLS.push(['writeFile', path.resolve(p)]); return real.pWriteFile.call(this, p, ...a); };
fs.promises.rename = async function (a, b) { if (under(a)) CALLS.push(['rename', path.resolve(a), path.resolve(b)]); return real.pRename.call(this, a, b); };

/** THE ORDER of the write that took `file`'s name after CALLS[from]: its temp written, synced ONCE, then renamed onto the name */
function orderOn(file, from = 0) {
  const cs = CALLS.slice(from), F = path.resolve(file);
  const ren = cs.findIndex((c) => c[0] === 'rename' && c[2] === F);
  const tmp = ren >= 0 ? cs[ren][1] : null;
  const lastWrite = tmp ? cs.reduce((n, c, i) => (i < ren && (c[0] === 'write' || c[0] === 'writeFile') && c[1] === tmp ? i : n), -1) : -1;
  const sync = tmp ? cs.findIndex((c, i) => i < ren && c[0] === 'fsync' && c[1] === tmp) : -1;
  const syncs = tmp ? cs.filter((c) => c[0] === 'fsync' && c[1] === tmp).length : 0;
  return { ok: ren >= 0 && lastWrite >= 0 && sync > lastWrite && syncs === 1, tmp: tmp && path.basename(tmp), ren, lastWrite, sync, syncs };
}
const jsonOf = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const tempsBeside = (f) => fs.readdirSync(path.dirname(f)).filter((n) => n.startsWith(path.basename(f) + '.') && n.endsWith('.tmp'));
const words = (prefix, what, code) => `${prefix} ${DF.refusedSyncWords(what, code)}`;
const mkdir = (n) => { const d = path.join(ROOT, n); fs.mkdirSync(d, { recursive: true }); return d; };

// ── ① THE MIGRATIONS' LEDGER ──
console.log('① the migrations\' ledger, through runMigrations');
const MR_REL = 'src/migration-runner.js', MR_SRC = src(MR_REL);
const MR = require(path.join(REPO, MR_REL));
const ledgerRun = (mod, file, id) => { const said = []; const mark = CALLS.length; const res = mod.runMigrations({ ledgerPath: file, migrations: [{ id, run: () => { } }], log: () => { }, warn: (l) => said.push(String(l)) }); return { res, said, o: orderOn(file, mark), led: jsonOf(file) }; };
{
  const L1 = path.join(mkdir('mig'), 'migrations-ledger.json');
  const a = ledgerRun(MR, L1, '2026-11-test-one');
  ok(a.o.ok && !!a.led && !!a.led.applied['2026-11-test-one'] && a.said.length === 0 && tempsBeside(L1).length === 0,
    'THE LEDGER takes its name only after ONE sync of its temp (written, synced, renamed), the migration recorded, nothing said', { o: a.o, said: a.said });
  REFUSE = 'EIO';
  const b = ledgerRun(MR, L1, '2026-11-test-two');
  const c = ledgerRun(MR, L1, '2026-11-test-three');
  REFUSE = null;
  const w = words('[migrate]', 'the migrations\' ledger', 'EIO');
  ok(b.o.sync >= 0 && !!b.led && !!b.led.applied['2026-11-test-two'] && b.said.filter((l) => l === w).length === 1 && !!c.led && !!c.led.applied['2026-11-test-three'] && c.said.filter((l) => l === w).length === 0 && tempsBeside(L1).length === 0,
    'a PLACED EIO of the ledger\'s sync is SAID once in its [migrate] words and the ledger still lands (both migrations recorded; the second refusal is not said again)', { b: b.said, c: c.said });
  const MRX = MUT.load(MR_REL, anchored(MR_SRC, /    DFILE\.writeDurable\(\{ file: ledgerPath[^\n]*\n/, () => "    fs.writeFileSync(ledgerPath + '.tmp', JSON.stringify(ledger, null, 2));\n    fs.renameSync(ledgerPath + '.tmp', ledgerPath);\n", 'the release writeLedger'), 'mr-release');
  const L2 = path.join(mkdir('mig-release'), 'migrations-ledger.json');
  const x = ledgerRun(MRX, L2, '2026-11-test-one');
  ok(!x.o.ok && x.o.sync < 0 && x.o.ren >= 0 && !!x.led && !!x.led.applied['2026-11-test-one'], 'RED CONTROL (the release\'s writeLedger: a temp written and renamed, no sync): the ledger lands with no sync — red', x.o);
}

// ── ② THE OPENCODE SERVE's RECORD ──
console.log('② the OpenCode serve\'s record, through a locator\'s own start');
const OS_REL = 'src/opencode-serve.js', OS_SRC = src(OS_REL);
const OS = require(path.join(REPO, OS_REL));
const answering = new Set();
const resp = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const fetchImpl = async (url) => {
  const u = new URL(String(url));
  if (!answering.has(Number(u.port))) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  if (u.pathname === '/global/health') return resp({ healthy: true, version: '1.18.29' });
  if (u.pathname === '/doc') return resp({ paths: {} });
  if (u.pathname === '/project/current') return resp({ worktree: '/work/alpha', vcs: 'git' });
  return resp({}, 404);
};
const execImpl = (cmd, args, opts, cb) => { try { fs.mkdirSync(path.join(opts.cwd, '.git'), { recursive: true }); real.writeFileSync(path.join(opts.cwd, '.git', 'HEAD'), 'ref: refs/heads/main\n'); cb(null, '', ''); } catch (e) { cb(e); } };
const kids = new Set();
const killKids = () => { for (const c of kids) { try { c.kill('SIGKILL'); } catch { /* gone */ } } kids.clear(); };
process.on('exit', killKids);
async function serveScene(mod, dir) {
  const logs = [];
  const loc = mod.createServeLocator({
    dataDir: dir, command: '/usr/bin/opencode', fetchImpl, execImpl, autostart: () => true, guardSampleMs: 0, backoffBaseMs: 20, maxCrashes: 2, bootTimeoutMs: 4000,
    log: { log: () => { }, warn: (l) => logs.push(String(l)), error: (l) => logs.push(String(l)) },
    killPid: () => { },
    spawnImpl: (cmd, args) => {
      const port = Number(args[args.indexOf('--port') + 1]);
      const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1e9)'], { stdio: 'ignore' });
      kids.add(c); answering.add(port);
      return c;
    },
  });
  const file = path.join(dir, 'opencode-serve.json');
  const mark = CALLS.length;
  await loc.client({ budgetMs: 4000 }).catch(() => null);
  await until(() => !!jsonOf(file));
  const r = { rec: jsonOf(file), o: orderOn(file, mark), logs, file, ready: loc.state().ready === true };
  try { loc.stop(); } catch { /* a stand-in */ }
  killKids();
  return r;
}
{
  const a = await serveScene(OS, mkdir('serve'));
  ok(a.o.ok && !!a.rec && Number.isInteger(a.rec.port) && Number.isInteger(a.rec.pid) && !a.logs.some((l) => /could not be synced/.test(l)) && tempsBeside(a.file).length === 0,
    'THE SERVE\'s RECORD (its port and pid, written at the serve\'s start) takes its name only after ONE sync of its temp, nothing said', { o: a.o, ready: a.ready, logs: a.logs.slice(0, 3) });
  REFUSE = 'EIO';
  const b = await serveScene(OS, mkdir('serve-eio'));
  REFUSE = null;
  const w = words('[opencode-serve]', 'the OpenCode serve\'s record', 'EIO');
  ok(b.o.sync >= 0 && !!b.rec && Number.isInteger(b.rec.pid) && b.logs.filter((l) => l === w).length === 1 && tempsBeside(b.file).length === 0,
    'a PLACED EIO of the record\'s sync is SAID once in its [opencode-serve] words and the record still lands', { logs: b.logs.slice(0, 4) });
  const OSX = MUT.load(OS_REL, anchored(OS_SRC, /  DFILE\.writeDurable\(\{ file, tmp: [^\n]*\n/, () => '  const tmp = `${file}.${process.pid}.tmp`;\n  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));\n  fs.renameSync(tmp, file);\n', 'the release writeJsonAtomic'), 'os-release');
  const x = await serveScene(OSX, mkdir('serve-release'));
  ok(!x.o.ok && x.o.sync < 0 && x.o.ren >= 0 && !!x.rec, 'RED CONTROL (the release\'s writeJsonAtomic: a temp written and renamed, no sync): the record lands with no sync — red', x.o);
}

// ── ③ THE KEPT DEFAULT MICROPHONE ──
console.log('③ the kept default microphone, through «make the virtual microphone the default»');
const DM_REL = 'src/desktop-mic.js', DM_SRC = src(DM_REL);
const DM = require(path.join(REPO, DM_REL));
async function micScene(mod, home) {
  const logs = [];
  const execFile = (file, args, opts, cb) => {
    const out = args.includes('facts') ? JSON.stringify(winFacts()) + '\n' : args.includes('setdefault') ? JSON.stringify({ ok: true, endpoint: 'CABLE Output (VB-Audio Virtual Cable)' }) + '\n' : '';
    setImmediate(() => cb(null, out, ''));
  };
  const mic = mod.createMic({ platform: 'win32', spawn: () => null, execFile, env: {}, home, helperPath: path.join(home, 'stand-in-mic-helper'), fs, log: (l) => logs.push(String(l)) });
  const file = path.join(home, '.vibespace', 'mic-default.json');
  const mark = CALLS.length;
  const r = await mic.setDefault({ to: 'virtual' });
  return { r, o: orderOn(file, mark), rec: jsonOf(file), logs, file };
}
{
  const a = await micScene(DM, mkdir('mic'));
  ok(a.r && a.r.ok === true && a.o.ok && !!a.rec && a.rec.previous && a.rec.previous.id === 'mic-1' && !a.logs.some((l) => /could not be synced/.test(l)) && tempsBeside(a.file).length === 0,
    'THE KEPT DEFAULT MICROPHONE (the person\'s own, for the restore) takes its name only after ONE sync of its temp, nothing said', { o: a.o, r: a.r && (a.r.ok || a.r.code), rec: a.rec });
  REFUSE = 'EIO';
  const b = await micScene(DM, mkdir('mic-eio'));
  REFUSE = 'ENOTSUP';
  const c = await micScene(DM, mkdir('mic-enotsup'));
  REFUSE = null;
  const wb = words('[mic]', 'the default microphone kept for the restore', 'EIO'), wc = words('[mic]', 'the default microphone kept for the restore', 'ENOTSUP');
  ok(b.r && b.r.ok === true && !!b.rec && b.rec.previous && b.logs.filter((l) => l === wb).length === 1 && tempsBeside(b.file).length === 0,
    'a PLACED EIO of its sync is SAID once in its [mic] words and the kept microphone still lands (the switch goes on)', { logs: b.logs.slice(0, 4) });
  ok(c.r && c.r.ok === true && !!c.rec && c.rec.previous && c.logs.filter((l) => l === wc).length === 1 && DF.syncRefusal({ code: 'ENOTSUP' }) === 'not-offered',
    'a PLACED ENOTSUP (the file system has no sync: «not offered») is said once and the kept microphone lands', { logs: c.logs.slice(0, 4) });
  const DMX = MUT.load(DM_REL, anchored(DM_SRC, /DFILE\.writeDurable\(\{ fs, file: f, [^\n]*?\}\); \};/, () => "await P.writeFile(f + '.tmp', JSON.stringify(o)); await P.rename(f + '.tmp', f); };", 'the release writeJson'), 'dm-release');
  const x = await micScene(DMX, mkdir('mic-release'));
  ok(x.r && x.r.ok === true && !x.o.ok && x.o.sync < 0 && x.o.ren >= 0 && !!x.rec, 'RED CONTROL (the release\'s writeJson: a temp written and renamed, no sync): the kept microphone lands with no sync — red', x.o);
}

// ── ④ THE APPS' INDEX ──
console.log('④ the apps\' index, through app-serve\'s one writer');
const AS_REL = 'src/app-serve.js', AS_SRC = src(AS_REL);
const AS = require(path.join(REPO, AS_REL));
const AM = require(path.join(REPO, 'src/app-manifest.js'));
async function appsScene(mod, dir) {
  const logs = [];
  const svc = mod.create({ home: path.join(dir, 'home'), stateDir: path.join(dir, 'state'), log: { log: () => { }, info: () => { }, warn: (l) => logs.push(String(l)), error: () => { } } });
  const mark = CALLS.length;
  await svc.writeManifest(AM.emptyManifest());
  const o = orderOn(svc.manifestFile, mark);
  const m = await svc.readManifest();
  return { svc, o, m, logs, file: svc.manifestFile, mode: fs.existsSync(svc.manifestFile) ? fs.statSync(svc.manifestFile).mode & 0o777 : null };
}
{
  const a = await appsScene(AS, mkdir('apps'));
  ok(a.o.ok && !a.m.error && a.mode === 0o600 && !a.logs.some((l) => /could not be synced/.test(l)) && tempsBeside(a.file).length === 0,
    'THE APPS\' INDEX (manifest.json, the person\'s installed apps) takes its name only after ONE sync of its temp, at mode 0600, read back whole', { o: a.o, mode: a.mode, error: a.m.error });
  const mark = CALLS.length;
  await a.svc.writeState({ refreshedAt: 1 });
  const s = orderOn(a.svc.stateFile, mark);
  ok(s.ren >= 0 && s.syncs === 0 && jsonOf(a.svc.stateFile) && jsonOf(a.svc.stateFile).refreshedAt === 1, 'the apps\' last scan (state.json) is DERIVED: written and renamed with NO sync (made again by the next scan)', s);
  REFUSE = 'EIO';
  const b = await appsScene(AS, mkdir('apps-eio'));
  REFUSE = null;
  const w = words('[apps]', AS.MANIFEST_FILE, 'EIO');
  ok(b.o.sync >= 0 && !b.m.error && b.logs.filter((l) => l === w).length === 1 && tempsBeside(b.file).length === 0,
    'a PLACED EIO of the index\'s sync is SAID once in its [apps] words and the index still lands', { logs: b.logs.slice(0, 4) });
  const ASX = MUT.load(AS_REL, anchored(AS_SRC, /    DFILE\.writeDurable\(\{ file: manifestFile[^\n]*\n/, () => '    await writeJsonAtomic(manifestFile, m);\n', 'the release writeManifest'), 'as-release');
  const x = await appsScene(ASX, mkdir('apps-release'));
  ok(!x.o.ok && x.o.sync < 0 && x.o.ren >= 0 && !x.m.error, 'RED CONTROL (the release\'s writeManifest: the index by a temp and a rename, no sync): the index lands with no sync — red', x.o);
}

// ── ⑤ THE CLASS ──
console.log('⑤ the class: four records through the door, two derived writers with no sync');
{
  const FOUR = ['src/migration-runner.js', 'src/opencode-serve.js', 'src/desktop-mic.js', 'src/app-serve.js'];
  const calls = (t) => (t.match(/\bDFILE\.writeDurable\(/g) || []).length;
  const seen = Object.fromEntries(FOUR.map((f) => [f, calls(src(f))]));
  const doorReq = FOUR.filter((f) => /require\('\.\/agentd\/durable-file\.js'\)/.test(src(f)));
  const hubDoor = FOUR.filter((f) => /require\([^)]*fd-close/.test(src(f)));
  ok(FOUR.every((f) => seen[f] === 1) && doorReq.length === 4 && hubDoor.length === 0,
    'each of the four modules the device bundles writes its record through THE device\'s door, once; none requires the hub\'s src/fd-close.js', { seen, hubDoor });
  const syncs = (body) => (body ? (body.match(/\b(?:fsyncSync|fdatasyncSync|fsync|fdatasync|writeDurable|\.sync)\(/g) || []).length : -1);
  const bodyOf = (txt, head) => { const a = txt.indexOf(head); if (a < 0) return null; const b = txt.indexOf('\n}\n', a); const c = txt.indexOf('\n  }\n', a); const e = [b, c].filter((n) => n > a).sort((p, q) => p - q)[0]; return e ? txt.slice(a, e) : null; };
  const AJ = bodyOf(AS_SRC, 'async function writeJsonAtomic(file, obj) {');
  const ajCalls = (AS_SRC.match(/\bwriteJsonAtomic\((\w+)/g) || []).map((s) => s.slice('writeJsonAtomic('.length)).filter((n) => n !== 'file').sort();
  const SCRUB = bodyOf(src('src/desktop-serve.js'), 'async function scrubRdpLogFile(id) {');
  ok(syncs(AJ) === 0 && JSON.stringify(ajCalls) === JSON.stringify(['stateFile', 'witnessFile']) && syncs(SCRUB) === 0,
    'the two DERIVED writers ask no sync: app-serve\'s writeJsonAtomic (called only for its last scan and its witness list) and the RemoteApp log\'s scrub', { aj: syncs(AJ), ajCalls, scrub: syncs(SCRUB) });
  const release = anchored(MR_SRC, /    DFILE\.writeDurable\(\{ file: ledgerPath[^\n]*\n/, () => "    fs.writeFileSync(ledgerPath + '.tmp', JSON.stringify(ledger, null, 2));\n    fs.renameSync(ledgerPath + '.tmp', ledgerPath);\n", 'the release writeLedger, counted');
  ok(calls(release) === 0, 'RED CONTROL (the release\'s ledger writer): its module calls the door 0 times — counted, red', { calls: calls(release) });
}
report();
