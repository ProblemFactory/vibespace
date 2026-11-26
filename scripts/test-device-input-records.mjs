#!/usr/bin/env node
// THE DEVICE BUNDLE's SHARED MODULES WRITE THEIR RECORDS THROUGH THE DEVICE's ONE DOOR (row B-574d, slice «device-bundle-inputs»,
// 主开发 r4806 / r4834, lane bl-machines-b). Before: four records of modules the device agent bundles — the migrations' ledger, the
// OpenCode serve's record, the kept default microphone and the apps' index — were written by a temp and a rename with no sync. After a
// power cut such a file could come back empty or torn: a torn ledger holds every migration until a person restores it; a torn serve
// record can neither adopt nor stop its serve; a lost default microphone cannot be given back; a torn index drops every app. Now each
// takes its name only after ONE sync of its temp, through src/agentd/durable-file.js (never the hub's src/fd-close.js), under the
// RECORD LAW of line 1054, kept on both sides by 主开发 r4834: a refused sync is SAID once a file and the record still lands (a record
// put in place unsynced is better than a record lost); a write, close or rename that FAILS throws to the caller, the old file whole,
// no temp. Stand-ins only: a scratch root of this suite's own; refusals PLACED at the call (never a real full disk or a real mount);
// a stand-in serve (a node process that ends by itself within a minute, answered by a stand-in fetch); a stand-in microphone helper
// and app runner (injected). No real agent CLI, no vendor call.
//   ① the ledger, through runMigrations: ONE sync before its name; a refused sync (EIO, then ENOTSUP) said once and recorded; a
//      FAILED write or rename (r4834 M3): «not recorded» — the old ledger whole, no temp — and the migration runs AGAIN at the next
//      start (never blocks one). REDS: the release's writer; a writer that puts the name in place directly
//   ② the serve's record, through a locator's own start of a stand-in serve: the order; a refused sync said once, landed. RED
//   ③ the kept default microphone, through «make the virtual microphone the default»: the same, and the switch goes on. RED
//   ④ the apps' index, through app-serve's one writer: the same; a FAILED rename rejects the write and leaves the index before it
//      whole. DERIVED, each read as NONE when torn by its own reader: the last scan (state.json → {}), the witness list (no rows;
//      listed again), the RemoteApp log (its end's reason: the exit code alone). RED: the release's writeManifest
//   ⑤ the class: each of the four modules calls the door once and none requires the hub's src/fd-close.js; the two DERIVED writers
//      ask no sync. REDS: each check over a planted text
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
const KEPT = '   // stale-pins: kept — the release\'s form, the red control\'s replacement';

// ── THE PLACER: every write, sync, close and rename of a file under this suite's root, in order; `REFUSE` places a code on its sync ──
const RT = path.resolve(ROOT) + path.sep;
const under = (p) => typeof p === 'string' && path.resolve(p).startsWith(RT);
const CALLS = [], FDP = new Map();
let REFUSE = null, REFUSE_WRITE = null, REFUSE_RENAME = null;   // a code placed at the sync / at the write / at the rename
const placedErr = (code, at) => Object.assign(new Error(`${code}: placed by the suite${at ? ' at the ' + at : ''}`), { code });
const real = { openSync: fs.openSync, writeSync: fs.writeSync, fsyncSync: fs.fsyncSync, closeSync: fs.closeSync, renameSync: fs.renameSync, writeFileSync: fs.writeFileSync, pWriteFile: fs.promises.writeFile, pRename: fs.promises.rename };
fs.openSync = function (p, ...a) { const fd = real.openSync.call(this, p, ...a); if (under(p)) { FDP.set(fd, path.resolve(p)); CALLS.push(['open', path.resolve(p)]); } return fd; };
fs.writeSync = function (fd, ...a) { if (FDP.has(fd)) { CALLS.push(['write', FDP.get(fd)]); if (REFUSE_WRITE) throw placedErr(REFUSE_WRITE, 'write'); } return real.writeSync.call(this, fd, ...a); };
fs.fsyncSync = function (fd) {
  if (FDP.has(fd)) { CALLS.push(['fsync', FDP.get(fd)]); if (REFUSE) throw placedErr(REFUSE); }
  return real.fsyncSync.call(this, fd);
};
fs.closeSync = function (fd) { if (FDP.has(fd)) { CALLS.push(['close', FDP.get(fd)]); FDP.delete(fd); } return real.closeSync.call(this, fd); };
fs.renameSync = function (a, b) { if (under(a)) { CALLS.push(['rename', path.resolve(a), path.resolve(b)]); if (REFUSE_RENAME) throw placedErr(REFUSE_RENAME, 'rename'); } return real.renameSync.call(this, a, b); };
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
const bytesOf = (f) => { try { return fs.readFileSync(f); } catch { return null; } };
const tempsBeside = (f) => { try { return fs.readdirSync(path.dirname(f)).filter((n) => n.startsWith(path.basename(f) + '.') && n.endsWith('.tmp')); } catch { return []; } };
const saidWords = (prefix, what, code) => `${prefix} ${DF.refusedSyncWords(what, code)}`;
const mkdir = (n) => { const d = path.join(ROOT, n); fs.mkdirSync(d, { recursive: true }); return d; };
const placed = (code) => new RegExp(`${code}: placed by the suite`);

// ── ① THE MIGRATIONS' LEDGER ──
console.log('① the migrations\' ledger, through runMigrations');
const MR_REL = 'src/migration-runner.js', MR_SRC = src(MR_REL);
const MR = require(path.join(REPO, MR_REL));
const MR_RELEASE = anchored(MR_SRC, /    DFILE\.writeDurable\(\{ file: ledgerPath[^\n]*\n/, () => "    fs.writeFileSync(ledgerPath + '.tmp', JSON.stringify(ledger, null, 2));\n    fs.renameSync(ledgerPath + '.tmp', ledgerPath);\n", 'the release writeLedger');   // stale-pins: kept — the release's form, the red control's replacement
const ledgerRun = (mod, file, ids) => {
  const said = [], ran = []; const mark = CALLS.length;
  const res = mod.runMigrations({ ledgerPath: file, migrations: ids.map((id) => ({ id, run: () => { ran.push(id); } })), log: () => { }, warn: (l) => said.push(String(l)) });
  return { res, said, ran, o: orderOn(file, mark), led: jsonOf(file) };
};
{
  const L1 = path.join(mkdir('mig'), 'migrations-ledger.json');
  const a = ledgerRun(MR, L1, ['2026-11-one']);
  ok(a.o.ok && !!a.led && !!a.led.applied['2026-11-one'] && a.said.length === 0 && tempsBeside(L1).length === 0,
    'THE LEDGER takes its name only after ONE sync of its temp (written, synced, renamed), the migration recorded, nothing said', { o: a.o, said: a.said });
  REFUSE = 'EIO';
  const b = ledgerRun(MR, L1, ['2026-11-one', '2026-11-two']);
  REFUSE = 'ENOTSUP';
  const b2 = ledgerRun(MR, L1, ['2026-11-one', '2026-11-two', '2026-11-three']);
  REFUSE = null;
  const wE = saidWords('[migrate]', 'the migrations\' ledger', 'EIO');
  ok(b.o.sync >= 0 && !!b.led && !!b.led.applied['2026-11-two'] && b.said.filter((l) => l === wE).length === 1 && !!b2.led && !!b2.led.applied['2026-11-three'] && b2.said.length === 0 && tempsBeside(L1).length === 0,
    'THE RECORD LAW (line 1054, kept by r4834): a REFUSED sync of the ledger (EIO, placed) is SAID once in its [migrate] words and the ledger still lands (recorded); a second refusal (ENOTSUP) before a sync answers is not said again', { b: b.said, b2: b2.said });
  // r4834 M3: a write that FAILS — at the write or at the rename: the door throws there — leaves the migration NOT RECORDED
  for (const [at, code] of [['rename', 'EIO'], ['write', 'ENOSPC']]) {
    const id = `2026-11-${at}`;
    const before = bytesOf(L1);
    if (at === 'rename') REFUSE_RENAME = code; else REFUSE_WRITE = code;
    const f = ledgerRun(MR, L1, ['2026-11-one', '2026-11-two', '2026-11-three', id]);
    REFUSE_RENAME = null; REFUSE_WRITE = null;
    const whole = !!before && bytesOf(L1).equals(before), temps = tempsBeside(L1).length;   // read right after the failed write, before the next start
    const g = ledgerRun(MR, L1, ['2026-11-one', '2026-11-two', '2026-11-three', id]);
    ok(f.ran.join() === id && whole && temps === 0 && f.said.some((l) => /^\[migrate\] ledger write failed: /.test(l) && placed(code).test(l))
      && g.ran.join() === id && g.res.find((r) => r.id === id).status === 'ran' && !!g.led.applied[id],
      `r4834 M3 — a ledger write that FAILS at the ${at} (${code}, placed) is «NOT RECORDED»: said by its own words, the old ledger WHOLE (the same bytes), no temp — and at the next start that migration RUNS AGAIN and is recorded (it never blocks a start)`, { ranF: f.ran, whole, temps, f: f.said, ranG: g.ran, g: g.res });
  }
  {
    // RED: a writer that puts the NAME in place directly (no temp, no rename): a failed rename can no longer keep it unrecorded
    const MRD = MUT.load(MR_REL, anchored(MR_SRC, /    DFILE\.writeDurable\(\{ file: ledgerPath[^\n]*\n/, () => "    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));\n", 'a ledger written in place'), 'mr-direct');   // stale-pins: kept — a planted form, the red control's replacement
    const L3 = path.join(mkdir('mig-direct'), 'migrations-ledger.json');
    ledgerRun(MRD, L3, ['2026-11-one']);
    REFUSE_WRITE = null; REFUSE_RENAME = 'EIO';
    const f = ledgerRun(MRD, L3, ['2026-11-one', '2026-11-x']);
    REFUSE_RENAME = null;
    const g = ledgerRun(MRD, L3, ['2026-11-one', '2026-11-x']);
    ok(f.ran.join() === '2026-11-x' && g.ran.length === 0, 'RED CONTROL (a ledger written in place, no temp and no rename): the same placed failure leaves it recorded — it does not run again (the M3 leg sees it)', { f: f.ran, g: g.ran });
  }
  const MRX = MUT.load(MR_REL, MR_RELEASE, 'mr-release');
  const L2 = path.join(mkdir('mig-release'), 'migrations-ledger.json');
  const x = ledgerRun(MRX, L2, ['2026-11-one']);
  ok(!x.o.ok && x.o.sync < 0 && x.o.ren >= 0 && !!x.led && !!x.led.applied['2026-11-one'], 'RED CONTROL (the release\'s writeLedger: a temp written and renamed, no sync): the ledger lands with no sync — red', x.o);
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
      // the stand-in serve ENDS BY ITSELF within a minute: a suite killed by a signal leaves nothing running for long
      const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
      kids.add(c); answering.add(port);
      return c;
    },
  });
  const file = path.join(dir, 'opencode-serve.json');
  const mark = CALLS.length;
  await loc.client({ budgetMs: 4000 }).catch(() => null);
  await until(() => !!jsonOf(file));
  const r = { rec: jsonOf(file), o: orderOn(file, mark), logs, file };
  try { loc.stop(); } catch { /* a stand-in */ }
  killKids();
  return r;
}
{
  const a = await serveScene(OS, mkdir('serve'));
  ok(a.o.ok && !!a.rec && Number.isInteger(a.rec.port) && Number.isInteger(a.rec.pid) && !a.logs.some((l) => /record write failed|offers no sync/.test(l)) && tempsBeside(a.file).length === 0,
    'THE SERVE\'s RECORD (its port and pid, written at the serve\'s start) takes its name only after ONE sync of its temp, nothing said', { o: a.o, logs: a.logs.slice(0, 3) });
  REFUSE = 'EIO';
  const b = await serveScene(OS, mkdir('serve-eio'));
  REFUSE = 'ENOTSUP';
  const c = await serveScene(OS, mkdir('serve-enotsup'));
  REFUSE = null;
  const wE = saidWords('[opencode-serve]', 'the OpenCode serve\'s record', 'EIO'), wN = saidWords('[opencode-serve]', 'the OpenCode serve\'s record', 'ENOTSUP');
  ok(!!b.rec && Number.isInteger(b.rec.pid) && b.logs.filter((l) => l === wE).length === 1 && !b.logs.some((l) => /record write failed/.test(l)) && tempsBeside(b.file).length === 0,
    'THE RECORD LAW: a REFUSED sync of the record (EIO, placed) is SAID once in its [opencode-serve] words and the record still lands', { logs: b.logs.slice(0, 4) });
  ok(!!c.rec && Number.isInteger(c.rec.pid) && c.logs.filter((l) => l === wN).length === 1 && tempsBeside(c.file).length === 0,
    '…and a sync NOT OFFERED (ENOTSUP, placed): the same — said once, landed', { logs: c.logs.slice(0, 4) });
  const OSX = MUT.load(OS_REL, anchored(OS_SRC, /  DFILE\.writeDurable\(\{ file, tmp: [^\n]*\n/, () => '  const tmp = `${file}.${process.pid}.tmp`;\n  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));\n  fs.renameSync(tmp, file);\n', 'the release writeJsonAtomic'), 'os-release');   // stale-pins: kept — the release's form, the red control's replacement
  const x = await serveScene(OSX, mkdir('serve-release'));
  ok(!x.o.ok && x.o.sync < 0 && x.o.ren >= 0 && !!x.rec, 'RED CONTROL (the release\'s writeJsonAtomic: a temp written and renamed, no sync): the record lands with no sync — red', x.o);
}

// ── ③ THE KEPT DEFAULT MICROPHONE ──
console.log('③ the kept default microphone, through «make the virtual microphone the default»');
const DM_REL = 'src/desktop-mic.js', DM_SRC = src(DM_REL);
const DM = require(path.join(REPO, DM_REL));
async function micScene(mod, home) {
  const logs = [], asked = [];
  const execFile = (file, args, opts, cb) => {
    asked.push(args[0]);
    const out = args.includes('facts') ? JSON.stringify(winFacts()) + '\n' : args.includes('setdefault') ? JSON.stringify({ ok: true, endpoint: 'CABLE Output (VB-Audio Virtual Cable)' }) + '\n' : '';
    setImmediate(() => cb(null, out, ''));
  };
  const mic = mod.createMic({ platform: 'win32', spawn: () => null, execFile, env: {}, home, helperPath: path.join(home, 'stand-in-mic-helper'), fs, log: (l) => logs.push(String(l)) });
  const file = path.join(home, '.vibespace', 'mic-default.json');
  const mark = CALLS.length;
  let r = null, threw = null;
  try { r = await mic.setDefault({ to: 'virtual' }); } catch (e) { threw = e; }
  return { r, threw, asked, o: orderOn(file, mark), rec: jsonOf(file), logs, file };
}
{
  const a = await micScene(DM, mkdir('mic'));
  ok(a.r && a.r.ok === true && a.o.ok && !!a.rec && a.rec.previous && a.rec.previous.id === 'mic-1' && !a.logs.some((l) => /offers no sync/.test(l)) && tempsBeside(a.file).length === 0,
    'THE KEPT DEFAULT MICROPHONE (the person\'s own, for the restore) takes its name only after ONE sync of its temp, nothing said', { o: a.o, r: a.r && (a.r.ok || a.r.code), rec: a.rec });
  REFUSE = 'EIO';
  const b = await micScene(DM, mkdir('mic-eio'));
  REFUSE = 'ENOTSUP';
  const c = await micScene(DM, mkdir('mic-enotsup'));
  REFUSE = null;
  const wE = saidWords('[mic]', 'the default microphone kept for the restore', 'EIO'), wN = saidWords('[mic]', 'the default microphone kept for the restore', 'ENOTSUP');
  ok(!b.threw && b.r && b.r.ok === true && b.asked.includes('setdefault') && !!b.rec && b.rec.previous && b.logs.filter((l) => l === wE).length === 1 && tempsBeside(b.file).length === 0,
    'THE RECORD LAW: a REFUSED sync (EIO, placed) is SAID once in its [mic] words, the kept microphone still lands and the switch goes on', { logs: b.logs.slice(0, 4), threw: b.threw && b.threw.code });
  ok(c.r && c.r.ok === true && !!c.rec && c.rec.previous && c.logs.filter((l) => l === wN).length === 1, '…and a sync NOT OFFERED (ENOTSUP, placed): the same — said once, landed', { logs: c.logs.slice(0, 4) });
  const DMX = MUT.load(DM_REL, anchored(DM_SRC, /DFILE\.writeDurable\(\{ fs, file: f, [^\n]*?\}\); \};/, () => "await P.writeFile(f + '.tmp', JSON.stringify(o)); await P.rename(f + '.tmp', f); };", 'the release writeJson'), 'dm-release');   // stale-pins: kept — the release's form, the red control's replacement
  const x = await micScene(DMX, mkdir('mic-release'));
  ok(x.r && x.r.ok === true && !x.o.ok && x.o.sync < 0 && x.o.ren >= 0 && !!x.rec, 'RED CONTROL (the release\'s writeJson: a temp written and renamed, no sync): the kept microphone lands with no sync — red', x.o);
}

// ── ④ THE APPS' INDEX, AND THE DERIVED FILES ──
console.log('④ the apps\' index, through app-serve\'s one writer; the derived files read as none when torn');
const AS_REL = 'src/app-serve.js', AS_SRC = src(AS_REL);
const AS = require(path.join(REPO, AS_REL));
const AM = require(path.join(REPO, 'src/app-manifest.js'));
const RA = require(path.join(REPO, 'src/remoteapp.js'));
function appsOf(mod, dir) {
  const logs = [];
  const wd = { user: mkdir(path.join(path.basename(dir), 'w-user')), system: mkdir(path.join(path.basename(dir), 'w-system')), flatpakUser: mkdir(path.join(path.basename(dir), 'w-fu')), flatpakSystem: mkdir(path.join(path.basename(dir), 'w-fs')) };
  const svc = mod.create({ home: path.join(dir, 'home'), stateDir: path.join(dir, 'state'), log: { log: () => { }, info: () => { }, warn: (l) => logs.push(String(l)), error: () => { } },
    runner: async () => ({ code: 127, stdout: '', stderr: 'a stand-in: no program here', timedOut: false }), witnessDirs: wd,
    dpkgStatus: path.join(dir, 'no-dpkg-status'), systemLists: path.join(dir, 'no-lists'), osRelease: path.join(dir, 'no-os-release') });
  return { svc, logs };
}
async function indexWrite(svc, m) { const mark = CALLS.length; let threw = null; try { await svc.writeManifest(m); } catch (e) { threw = e; } return { threw, o: orderOn(svc.manifestFile, mark) }; }
{
  const dir = mkdir('apps'), { svc, logs } = appsOf(AS, dir);
  const m0 = AM.emptyManifest();
  const a = await indexWrite(svc, m0);
  const back = await svc.readManifest();
  ok(!a.threw && a.o.ok && !back.error && (fs.statSync(svc.manifestFile).mode & 0o777) === 0o600 && !logs.some((l) => /offers no sync/.test(l)) && tempsBeside(svc.manifestFile).length === 0,
    'THE APPS\' INDEX (manifest.json, the person\'s installed apps) takes its name only after ONE sync of its temp, at mode 0600, read back whole', { o: a.o, error: back.error, threw: a.threw && a.threw.code });
  REFUSE = 'EIO';
  const b = await indexWrite(svc, { ...m0, generation: (m0.generation || 0) + 1 });
  REFUSE = null;
  const wE = saidWords('[apps]', AS.MANIFEST_FILE, 'EIO');
  const after = await svc.readManifest();
  ok(!b.threw && !after.error && after.manifest.generation === (m0.generation || 0) + 1 && logs.filter((l) => l === wE).length === 1 && tempsBeside(svc.manifestFile).length === 0,
    'THE RECORD LAW: a REFUSED sync of the index (EIO, placed) is SAID once in its [apps] words and the index still lands', { logs: logs.slice(0, 4), generation: after.manifest.generation });
  // a write that FAILS at the rename: the writer rejects (the act fails by its own words) and the index before it stays WHOLE
  const kept = bytesOf(svc.manifestFile);
  REFUSE_RENAME = 'EIO';
  const b2 = await indexWrite(svc, { ...m0, generation: (m0.generation || 0) + 5 });
  REFUSE_RENAME = null;
  ok(!!b2.threw && b2.threw.code === 'EIO' && bytesOf(svc.manifestFile).equals(kept) && tempsBeside(svc.manifestFile).length === 0 && !(await svc.readManifest()).error,
    'a write that FAILS at the rename (EIO, placed): the writer REJECTS with its code, and the index is the one before it, WHOLE (the same bytes), no temp', { threw: b2.threw && b2.threw.code });
  // DERIVED: the last scan — no sync; torn, its reader answers none ({}), and the next scan writes it again
  const mark = CALLS.length;
  await svc.writeState({ refreshedAt: 1 });
  const s = orderOn(svc.stateFile, mark);
  real.writeFileSync(svc.stateFile, '{"refreshedAt": 1, "upd');
  const torn = await svc.readState();
  ok(s.ren >= 0 && s.syncs === 0 && JSON.stringify(torn) === '{}', 'DERIVED — the apps\' last scan (state.json): written and renamed with NO sync; TORN, its reader (readState) answers none ({}) — the next scan writes it again', { s, torn });
  // DERIVED: the witness list — torn, its reader answers no rows and no listing time, and it is listed again
  const wf = path.join(dir, 'state', 'desktop-apps-witness.json');
  fs.mkdirSync(path.dirname(wf), { recursive: true });
  real.writeFileSync(wf, '{"rows": [{"id": "seen.x", "witn');
  const view = await svc.refreshWitness({ reason: 'open' });
  const relisted = await svc.refreshWitness({ reason: 'recheck' });
  ok(view.count === 0 && view.listedAt == null && Number.isFinite(relisted.listedAt) && !!jsonOf(wf), 'DERIVED — the desktop\'s witness list: TORN, its reader answers no rows and no listing time (none), and it is listed again and written whole', { view: { count: view.count, listedAt: view.listedAt }, relisted: relisted.listedAt });
  // DERIVED: the RemoteApp client's log — its one reader in the code (the end's reason) reads an empty or zeroed log as NO log
  const none = RA.rdpEndVerdict({ code: 1, lines: RA.scrubRdpLog('').split('\n') });
  const emptied = RA.rdpEndVerdict({ code: 1, lines: RA.scrubRdpLog('').split('\n') }), zeroed = RA.rdpEndVerdict({ code: 1, lines: RA.scrubRdpLog('\0'.repeat(4096)).split('\n') });
  const seeing = RA.rdpEndVerdict({ code: 1, lines: RA.scrubRdpLog('[ERROR] Host key verification failed\n').split('\n') });
  ok(JSON.stringify(emptied) === JSON.stringify(none) && JSON.stringify(zeroed) === JSON.stringify(none) && JSON.stringify(seeing) !== JSON.stringify(none) && seeing && seeing.code === 'rdp_cert_changed',
    'DERIVED — the RemoteApp log: an EMPTY or ZEROED log reads as no log at its one code reader (the end\'s reason: the exit code alone) — while a real line is read (the comparison can see)', { none, zeroed, seeing });
  const ASX = MUT.load(AS_REL, anchored(AS_SRC, /    DFILE\.writeDurable\(\{ file: manifestFile[^\n]*\n/, () => '    await writeJsonAtomic(manifestFile, m);\n', 'the release writeManifest'), 'as-release');   // stale-pins: kept — the release's form, the red control's replacement
  const X = appsOf(ASX, mkdir('apps-release'));
  const x = await indexWrite(X.svc, m0);
  ok(!x.threw && !x.o.ok && x.o.sync < 0 && x.o.ren >= 0, 'RED CONTROL (the release\'s writeManifest: the index by a temp and a rename, no sync): it lands with no sync — red', x.o);
}

// ── ⑤ THE CLASS ──
console.log('⑤ the class: four records through the door, two derived writers with no sync');
{
  const FOUR = ['src/migration-runner.js', 'src/opencode-serve.js', 'src/desktop-mic.js', 'src/app-serve.js'];
  const calls = (t) => (t.match(/\bDFILE\.writeDurable\(/g) || []).length;
  const takesDoor = (t) => /require\('\.\/agentd\/durable-file\.js'\)/.test(t), takesHub = (t) => /require\([^)]*fd-close/.test(t);
  const texts = Object.fromEntries(FOUR.map((f) => [f, src(f)]));
  const classOk = (tx) => FOUR.every((f) => calls(tx[f]) === 1 && takesDoor(tx[f]) && !takesHub(tx[f]));
  ok(classOk(texts), 'each of the four modules the device bundles writes its record through THE device\'s door, once, and none requires the hub\'s src/fd-close.js', Object.fromEntries(FOUR.map((f) => [f, calls(texts[f])])));
  const syncs = (body) => (body ? (body.match(/\b(?:fsyncSync|fdatasyncSync|fsync|fdatasync|writeDurable|\.sync)\(/g) || []).length : -1);
  const bodyOf = (txt, head) => { const a = txt.indexOf(head); if (a < 0) return null; const ends = ['\n}\n', '\n  }\n'].map((e) => txt.indexOf(e, a)).filter((n) => n > a).sort((p, q) => p - q); return ends.length ? txt.slice(a, ends[0]) : null; };
  const derivedOk = (asTxt, dsTxt) => {
    const aj = bodyOf(asTxt, 'async function writeJsonAtomic(file, obj) {');
    const ajCalls = (asTxt.match(/\bwriteJsonAtomic\((\w+)/g) || []).map((x) => x.slice('writeJsonAtomic('.length)).filter((n) => n !== 'file').sort();
    return syncs(aj) === 0 && JSON.stringify(ajCalls) === JSON.stringify(['stateFile', 'witnessFile']) && syncs(bodyOf(dsTxt, 'async function scrubRdpLogFile(id) {')) === 0;
  };
  const DS = src('src/desktop-serve.js');
  ok(derivedOk(AS_SRC, DS), 'the two DERIVED writers ask no sync: app-serve\'s writeJsonAtomic (called only for its last scan and its witness list) and the RemoteApp log\'s scrub');
  const planted = { ...texts, 'src/migration-runner.js': MR_RELEASE };
  const hubDoor = { ...texts, 'src/desktop-mic.js': texts['src/desktop-mic.js'].replace("const MM = require('./mic-model.js');", "const MM = require('./mic-model.js'); const FC = require('./fd-close.js');") };
  const syncedDerived = AS_SRC.replace('async function writeJsonAtomic(file, obj) {\n', 'async function writeJsonAtomic(file, obj) {\n  await fh.sync();\n');
  const indexDerived = AS_SRC.replace(/    DFILE\.writeDurable\(\{ file: manifestFile[^\n]*\n/, '    await writeJsonAtomic(manifestFile, m);\n');   // stale-pins: kept — a planted form (the release's index road), the red control's text
  ok(!classOk(planted) && !classOk(hubDoor) && !derivedOk(syncedDerived, DS) && !derivedOk(indexDerived, DS), 'RED CONTROLS (planted texts): the release\'s ledger writer, a bundled module taking src/fd-close.js, a derived writer asking a sync, and the index sent back through the derived writer — each red');   // stale-pins: kept — planted forms
}
report();
