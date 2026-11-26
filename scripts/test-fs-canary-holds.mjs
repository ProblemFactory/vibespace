#!/usr/bin/env node
// test-fs-canary-holds — the HEAVY twin of test-fs-canary (B-7e49, lane artifacts-by-intent, 主开发 r3761): its §7, §8 and §9, moved
// VERBATIM — §7 the blocked loop names its blocker (a FIFO a CHILD fills after 1.3 s holds the loop in a sync read; a CPU hold; the
// probe in flight across it; the mount, local and FIFO holds a child fills) and §8 the witness names the hold and the guard refuses
// a storage mount (holds on a mount path a child fills, the watchdog THREAD naming a call still in flight from a child process), and §9 a
// view is classed by what it shows (with §10 B-1425 inside it) — §9 rides the ONE loop-blame wrapper §7 installs, so it moves with §7.
// Their seconds are real children and the holds they place (about 9 of the suite's 17 on the second machine). The fast file keeps
// §1–§6, §10 and §11 (the road-parity table with the data folder's own row and its red, lines 551 and 558, untouched there) and
// pins (§T) that this file holds §7, §8 and §9. The prelude is copied verbatim (the pinned pool of two first); its own parts are the
// scratch import first and the shared checker. Run: node scripts/test-fs-canary-holds.mjs
import './scratch.mjs';   // FIRST (§113)
// before the first pool use: §3 saturates a pool of TWO — PINNED, never inherited (lane race-sweep, B-2d49: a VibeSpace agent
// session's env carries UV_THREADPOOL_SIZE=32, the 12-job saturation then never queued the stat — fs 0 ms, 3 FAILED)
process.env.UV_THREADPOOL_SIZE = '2';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { anchored } from './scratch.mjs';   // B-75ba's control: B-0d3e's one door

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
import { checker } from './lib/check.mjs';
const CHK = checker();   // B-7e49 r3655 (3): a twin takes the shared checker (scripts/lib/check.mjs), never an inline helper of its own
const ok = (c, n) => { if (typeof n !== 'string') throw new TypeError(`ok(cond, name): the name is a ${typeof n} — the arguments are swapped`); return CHK.ok(!!c, n); };   // the original helper's truthiness, exactly
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const spin = (ms) => { const t = Date.now(); while (Date.now() - t < ms); };
const FILE = path.join(REPO, 'package.json');
const SRC = fs.readFileSync(path.join(REPO, 'src/server/fs-canary.js'), 'utf8');
const { createFsCanary } = require(path.join(REPO, 'src/server/fs-canary.js'));

function harness(createFn, opts = {}) {
  const recs = [], lines = [];
  let wedged = 0;
  const c = createFn({ file: FILE, record: (ev) => recs.push(ev), log: (l) => lines.push(l), onWedged: () => { wedged++; }, slowMs: 100, deadlineMs: 1000, ...opts });
  return { c, recs, lines, wedged: () => wedged, names: () => recs.map((r) => r.name) };
}
// A DETERMINISTIC libuv-threadpool wedge (lane quiet-box-flakes, B-c820). The pre-fix §3 made the pool "slow" by racing
// pbkdf2 jobs sized off a startup calibration (`saturate`): on a quiet / turbo box the jobs drained before the canary's
// stat ever queued, the stat answered in < slowMs and §3 went RED — while loaded it passed (the box was slower than the
// jobs). The wedge is now a MECHANISM, not a race: both pool workers (UV_THREADPOOL_SIZE = 2, pinned above, before the
// first pool op) block on a read of an empty FIFO that only the test writes to. The process-global libuv pool's queue is
// FIFO and the canary's stat is submitted a cross-thread round-trip later (tick → its SafeFs worker → fs.promises.stat),
// so the stat is ALWAYS behind the two blocked reads and waits exactly as long as the test holds the wedge — fast box
// as slow. The hold is the slow pool's duration (the test chooses it), never a guess about the machine.
const HOLD_MS = 300; // §3's P leg: the slow pool lasts this long (well past slowMs = 100), then answers — not a timeout
function poolWedge() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fscan-wedge-'));
  const fifo = path.join(dir, 'pipe');
  execFileSync('mkfifo', [fifo]);
  const fd = fs.openSync(fifo, 'r+'); // O_RDWR: opens at once and never EOFs (its own writer); a read of it blocks while empty
  const buf = Buffer.alloc(1);
  for (let i = 0; i < 2; i++) fs.read(fd, buf, 0, 1, null, () => {}); // occupy BOTH pool workers
  return {
    release() { try { fs.writeSync(fd, Buffer.from('xxxx')); } catch {} }, // wakes both reads ⇒ the queued stat(s) run
    close() { try { fs.closeSync(fd); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} },
  };
}

// §7 and §8 load the canary from the patched copies §5 made (copied verbatim)
const M = mutantCopies('fs-canary', REPO);

console.log('§7 the blocked loop names its blocker (lane vault-slow-load)');
{
  const LB = require(path.join(REPO, 'src/server/loop-blame.js'));
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'fscan-blame-'));
  fs.mkdirSync(path.join(ROOT, 'src'));
  fs.writeFileSync(path.join(ROOT, 'src', 'slow-reader.js'), "'use strict';\nconst fs = require('fs');\nfunction readAll(p) { return fs.readFileSync(p); }\nmodule.exports = { readAll };\n");
  // int343: what each wrapped call carries BEFORE the install (its own properties — fs.realpathSync.native is one)
  const ownOf = (f) => Reflect.ownKeys(f).filter((k) => !['length', 'name', 'prototype', 'arguments', 'caller'].includes(k)).map(String).sort();
  const BEFORE = Object.fromEntries(LB.SYNC_FNS.filter((fn) => typeof fs[fn] === 'function').map((fn) => [fn, Object.fromEntries(ownOf(fs[fn]).map((k) => [k, fs[fn][k]]))]));
  const nativeBefore = fs.realpathSync.native;
  ok(LB.install({ root: ROOT }) === true && LB.isWrapped(fs.readFileSync) && LB.install({ root: ROOT }) === false, 'install wraps the main thread\'s sync fs calls once');
  // int343 — A WRAPPER OVER A LIBRARY FUNCTION CARRIES THAT FUNCTION'S OWN PROPERTIES. The first wrapper dropped
  // fs.realpathSync.native: on a hub every automation-key open was refused «does not exist» (automation-engine's folder
  // judge) and browser-facts' real paths read null. THE CENSUS: every fs call the wrapper touches keeps every own property.
  // lane hub-fuse-sync-guard: realpathSync.native is a synchronous call of its own — the wrapper now WITNESSES it too (a
  // wrapper of the same function, which answers the same): kept = present and the same value, or that value wrapped
  const lost = (mod, before) => Object.entries(before).flatMap(([fn, props]) => Object.entries(props).filter(([k, v]) => !(k in mod[fn]) || (mod[fn][k] !== v && !(typeof v === 'function' && LB.isWrapped(mod[fn][k])))).map(([k]) => `${fn}.${k}`));
  ok(Object.keys(BEFORE).length === LB.SYNC_FNS.length && Object.values(BEFORE).some((p) => Object.keys(p).length) && !lost(fs, BEFORE).length,
    `CENSUS: every one of the ${LB.SYNC_FNS.length} wrapped fs calls keeps its own properties (${Object.entries(BEFORE).filter(([, p]) => Object.keys(p).length).map(([fn, p]) => `${fn}.${Object.keys(p).join('/')}`).join(', ')})`, lost(fs, BEFORE));
  ok(typeof fs.realpathSync.native === 'function' && LB.isWrapped(fs.realpathSync.native) && fs.realpathSync.native(ROOT) === nativeBefore(ROOT),
    'fs.realpathSync.native still answers after the install — witnessed like every sync call (the automation keys\' folder judge, browser-facts)');
  { // THE RED CONTROL: the wrapper as it first shipped (the property copy cut) ⇒ the census names realpathSync.native lost
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/loop-blame.js'), 'utf8');
    const CUT = /\n    for \(const k of Reflect\.ownKeys\(orig\)\)[^\n]*\n/;
    const pre = path.join(ROOT, 'loop-blame-pre.js');
    fs.writeFileSync(pre, editAnchor(SRC, CUT, '\n', "src/server/loop-blame.js"));
    const mk = () => ({ realpathSync: Object.assign(function realpathSync(p) { return p; }, { native: (p) => p }), readFileSync: function readFileSync() { return ''; } });
    const mPre = mk(), bPre = { realpathSync: { native: mPre.realpathSync.native } };
    require(pre).install({ fsMod: mPre });
    const mNow = mk(), bNow = { realpathSync: { native: mNow.realpathSync.native } };
    require(path.join(REPO, 'src/server/loop-blame.js')).install({ fsMod: mNow });
    ok(CUT.test(SRC) && lost(mPre, bPre).join() === 'realpathSync.native' && !lost(mNow, bNow).length && mNow.realpathSync.native('/x') === '/x',
      'RED CONTROL: the wrapper without the property copy loses realpathSync.native (the census names it); the shipped wrapper keeps it — on a module object handed in', { pre: lost(mPre, bPre), now: lost(mNow, bNow) });
  }
  const reader = require(path.join(ROOT, 'src', 'slow-reader.js'));
  const fifo = path.join(ROOT, 'pipe');
  execFileSync('mkfifo', [fifo]);
  const { spawn } = await import('node:child_process');
  const B = harness(createFsCanary);
  await B.c.tick();
  const p = B.c.tick();
  spawn('sh', ['-c', `sleep 1.3; printf 'four' > '${fifo}'`], { stdio: 'ignore' });
  const got = reader.readAll(fifo);   // the loop is held HERE: a sync read of a FIFO nobody has written yet
  const r = await p;
  const line = B.lines.find((l) => /a blocked loop/.test(l)) || '';
  ok(got.length === 4 && r && r.loopMs >= 1000, `the loop was held by the sync read (${r && r.loopMs} ms)`);
  ok(/; in that window: readFileSync 4 B pipe \d{4,} ms ← src\/slow-reader\.js:3 (Object\.)?readAll$/.test(line), `the canary's line names the call, the bytes, the file and the caller: ${line}`);
  ok(r.blockedBy && r.blockedBy.startsWith('readFileSync'), 'the probe\'s facts carry the same words (blockedBy)');
  B.lines.length = 0;
  // ci-351-reds — THE CPU-BLOCK LEG STARTS FROM A QUIESCENT WITNESS. The read above is kept as { at, ms } in whole
  // milliseconds and the canary's window opens at the next probe's doneAt, its edge inclusive: on a fast runner that probe
  // answered inside the very millisecond the read was recorded as ending, the window kept the read, and the canary named
  // readFileSync for a CPU block (master run 40075417901 and its re-run; 2 of 20 runs here). So the leg waits — a poll of
  // the witness against the clock, never a sleep — until no recorded call ends at or after now: its window cannot reach
  // back into the previous leg. It then judges on the witness's own facts (nothing recorded DURING the block) beside the line.
  const CPU_WORDS = /^no sync fs call over 20 ms in that window — CPU work on the main thread$/;
  const leg1 = LB.blame(0, Infinity, { k: Infinity }).find((e) => e.fn === 'readFileSync' && e.path === fifo);
  ok(!!leg1 && /readFileSync/.test(LB.blameWords(LB.blame(leg1.at + leg1.ms, leg1.at + leg1.ms + 1300, { entries: [leg1] }))),
    'CONTROL (the hosted red, without the race): a window that opens in the millisecond the previous leg\'s read was recorded as ending still keeps that read — the window\'s edge is inclusive');
  while (LB.blame(Date.now(), Infinity).length) await new Promise((r) => setImmediate(r));
  const t2 = Date.now();
  ok(!LB.blame(t2, Infinity).length, 'the CPU-block leg starts from a quiescent witness: no recorded sync call ends at or after its start');
  const p2 = B.c.tick();
  spin(1300);
  const r2 = await p2;
  ok(!LB.blame(t2, Infinity, { k: Infinity }).some((e) => e.at >= t2), 'the witness recorded no sync fs call DURING the block (its own fact: the block is CPU)');
  ok(r2 && r2.loopMs >= 1000 && CPU_WORDS.test(r2.blockedBy || ''), `the probe's facts carry the CPU words (${r2 && r2.loopMs} ms: ${r2 && r2.blockedBy})`);
  ok(/; in that window: no sync fs call over 20 ms in that window — CPU work on the main thread/.test(B.lines.find((l) => /a blocked loop/.test(l)) || ''), `a CPU block is said as CPU work: ${B.lines[0]}`);
  B.c.close();
  // PURE
  ok(LB.bytesOf('readFileSync', [], Buffer.alloc(7)) === 7 && LB.bytesOf('readFileSync', [], 'héllo') === 6 && LB.bytesOf('readSync', [], 512) === 512 && LB.bytesOf('writeFileSync', ['f', 'abc']) === 3 && LB.bytesOf('statSync', ['f'], {}) === null, 'bytesOf: a read\'s result, a write\'s data, nothing for a stat');
  ok(LB.callerOf(`Error\n    at wrapped (${REPO}/src/server/loop-blame.js:9:1)\n    at sha256Head (${REPO}/src/incident.js:80:22)\n    at x (${REPO}/server.js:5:1)`, REPO) === 'src/incident.js:80 sha256Head' && LB.callerOf(`Error\n    at y (${REPO}/node_modules/z/i.js:1:1)\n    at x (${REPO}/server.js:5:1)`, REPO) === 'server.js:5 x' && LB.callerOf('Error\n    at y (node:fs:1:1)', REPO) === null, 'callerOf: the first frame of the hub\'s own code, never this module\'s, never node_modules');
  ok(LB.blameWords([{ fn: 'readSync', bytes: 1073741824, path: path.join(REPO, 'home/x.jsonl'), ms: 15220, caller: 'src/incident.js:80 sha256Head' }], REPO) === 'readSync 1024 MB home/x.jsonl 15220 ms ← src/incident.js:80 sha256Head', 'blameWords: the call, the size, the path under the root, the ms, the caller');
  const at = Date.now();
  const win = LB.blame(at, at + 10, { entries: [{ at: at - 5000, ms: 100, fn: 'old' }, { at: at - 50, ms: 200, fn: 'spans' }, { at: at + 2, ms: 30, fn: 'in' }, { at: at + 50, ms: 999, fn: 'after' }] }).map((e) => e.fn).join();
  ok(win === 'spans,in', `blame keeps the calls that overlap the window, the longest first (${win})`);
  const server = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'), trace = fs.readFileSync(path.join(REPO, 'src/server/boot-trace.js'), 'utf8');
  const lines5 = server.split('\n').slice(0, 6).join('\n');
  ok(/require\('\.\/src\/server\/boot-trace\.js'\)\.start\(/.test(lines5) && /function start\(\{ dataDir,[^\n]*\{\n(?:\s*\/\/[^\n]*\n)*\s*try \{ if \(dataDir\) require\('\.\/loop-blame\.js'\)\.install\(\{ root: path\.dirname\(dataDir\) \}\); \} catch \{ \}/.test(trace), 'installed by the boot trace\'s start() — server.js\'s first lines, before the modules that destructure fs');
  // CONTROL: the base canary (no blame) — the same sync-read block, and the line names nothing
  const from = "log(`[canary] the main loop held the probe's answer ${loopMs}ms (the stat itself took ${fsMs}ms ${r.where === 'worker' ? 'off the main thread' : 'on the main thread'}) — a blocked loop, not a slow mount${by ? `; in that window: ${by}` : ''}`);";
  ok(SRC.split(from).length === 2, 'CONTROL premise: the line\'s patch point is one line of the module');
  const base = M.load('src/server/fs-canary.js', editAnchor(SRC, from, "log(`[canary] the main loop held the probe's answer ${loopMs}ms (the stat itself took ${fsMs}ms ${r.where === 'worker' ? 'off the main thread' : 'on the main thread'}) — a blocked loop, not a slow mount`);", "src/server/fs-canary.js"), 'no-blame');
  const C = harness(base.createFsCanary);
  await C.c.tick();
  const fifo2 = path.join(ROOT, 'pipe2');
  execFileSync('mkfifo', [fifo2]);
  const p3 = C.c.tick();
  spawn('sh', ['-c', `sleep 1.3; printf 'four' > '${fifo2}'`], { stdio: 'ignore' });
  reader.readAll(fifo2);
  await p3;
  const cl = C.lines.find((l) => /a blocked loop/.test(l)) || '';
  ok(!!cl && !/in that window|readFileSync/.test(cl), `CONTROL: the base canary's line for the same block names nothing (the owner's journal): ${cl}`);
  C.c.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
}

console.log('§8 THE WITNESS NAMES THE HOLD — and the guard refuses a storage mount (lane hub-fuse-sync-guard)');
{ // 2026-10-23 21:56 PT: 6.5 min held in a sync fs call on an rclone mount, and the canary named nothing (no probe was in
  // flight; the call was outside loop-blame's 18). The witness rides loop-blame's ONE wrapper (installed in §7).
  const SW = require(path.join(REPO, 'src/server/sync-fs-witness.js'));
  const LB = require(path.join(REPO, 'src/server/loop-blame.js'));
  const MHW = require(path.join(REPO, 'src/server/mount-health-watch.js'));
  const { spawn } = await import('node:child_process');
  const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'fscan-witness-'));
  fs.mkdirSync(path.join(ROOT, 'src'));
  fs.writeFileSync(path.join(ROOT, 'src', 'row-reader.js'), "'use strict';\nconst fs = require('fs');\nfunction readRow(p) { return fs.readFileSync(p); }\nfunction peek(p) { return fs.statSync(p); }\nmodule.exports = { readRow, peek };\n");
  const MNTS = fs.mkdtempSync(path.join(os.tmpdir(), 'fscan-mounts-'));   // outside the instance's own tree (that is never a mount path)
  const NAS = path.join(MNTS, 'NAS'), LOC = path.join(MNTS, 'local'), STORE = path.join(MNTS, 'OneDrive');
  for (const d of [NAS, LOC, STORE]) fs.mkdirSync(d);
  fs.writeFileSync(path.join(STORE, 'row.md'), 'x');
  const reader = require(path.join(ROOT, 'src', 'row-reader.js'));
  let n = 0;
  // a sync call that takes ~300 ms: a FIFO read a child fills 0.3 s later (the "stub sync call sleeps 300 ms")
  const hold = (dir, ms = 300) => { const p = path.join(dir, `pipe${++n}`); execFileSync('mkfifo', [p]); spawn('sh', ['-c', `sleep ${ms / 1000}; printf 'row' > '${p}'`], { stdio: 'ignore' }); reader.readRow(p); return p; };
  const tick = (ms) => new Promise((r) => setTimeout(r, ms));
  const wlog = [];
  // the NAS is a hand-made network mount (witnessed, never refused: the hold HAPPENS); OneDrive a product storage row
  const w = SW.create({ rootDir: ROOT, dataDir: path.join(ROOT, 'data'), fresh: true, armed: true, live: false, heldMs: 200, log: { warn: (l) => wlog.push(l) },
    readMountinfo: () => `900 42 0:73 / ${NAS} rw,relatime - nfs4 192.0.2.10:/v rw\n`, registry: () => [{ mountpoint: STORE, name: 'OneDrive', id: 'mnt-1' }] });
  w.start();
  const filed = [], mlog = [];
  const todos = { add: (k, it) => { filed.push({ k, ...it }); return { id: `u-${filed.length}` }; }, get: () => ({ status: 'open' }) };
  const who = [{ pid: 4242, ppid: 1, comm: 'localsearch-3', argv: ['/usr/libexec/localsearch-3'], cwd: null, fdHits: 3 }];
  const mh = MHW.create({ file: FILE, getUserTodos: () => todos, procTable: async () => who, ownerIds: async () => ({}), log: { warn: (l) => mlog.push(l) }, mountinfo: () => '' });
  const H = harness(createFsCanary, { witness: w, onHeld: (e) => mh.onHeld(e), episodeMs: 250 });
  const p1 = hold(NAS);
  await tick(150);
  const line = H.lines.find((l) => /the main loop was held/.test(l)) || '';
  ok(new RegExp(`^\\[canary\\] the main loop was held (\\d+) ms — the sync fs call that returned as it resumed: readFileSync\\(${p1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\) \\d{3,} ms, under the network mount «${NAS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}» \\(witnessed, never refused\\) ← src/row-reader\\.js:3 (Object\\.)?readRow$`).test(line),
    `a 300 ms hold on a MOUNT path: the canary names the call, its path, its ms, its mount and the caller — no probe in flight: ${line}`);
  ok(H.recs.some((r) => r.name === 'srv-sync-fs-held-ms' && r.value >= 250 && /^fn=readFileSync class=mount site=src\/row-reader\.js:3 (Object\.)?readRow$/.test(r.detail)),
    'counted: srv-sync-fs-held-ms (fn + class + the call SITE, file:line + function — lane hub-loop-stalls «the number»)', H.recs.filter((r) => r.name === 'srv-sync-fs-held-ms').map((r) => r.detail));
  ok(filed.length === 1 && filed[0].origin === 'server' && filed[0].k === MHW.INBOX_KEY && new RegExp(`waited \\d+ s on the folder .*NAS — readFileSync on .*pipe1 from src/row-reader\\.js:3`).test(filed[0].text)
    && /localsearch-3|1 process/.test(filed[0].detail) && /The call came from:/.test(filed[0].detail) && filed[0].i18n && filed[0].i18n.text.params.call === 'readFileSync',
    `the For-you fact (origin server, «This machine») carries the call site beside who presses the mount: ${filed[0] && filed[0].text}`, filed[0]);
  hold(NAS);
  await tick(150);
  ok(filed.length === 1 && mlog.some((l) => /held the main loop again .* its For-you item is still open/.test(l)), 'a second hold on the same mount while its item is open: ONE item, a journal line');
  H.lines.length = 0;
  const p2 = hold(LOC);
  await tick(150);
  const l2 = H.lines.find((l) => /the main loop was held/.test(l)) || '';
  ok(l2.includes(`readFileSync(${p2})`) && /, not under a mount ← src\/row-reader\.js:3/.test(l2) && filed.length === 1, `a LOCAL path: named, not under a mount, no For-you item: ${l2}`);
  // the late probe: a probe in flight across the hold names the SAME call once (the witness's hand-over said it)
  H.lines.length = 0;
  const pr = H.c.tick();
  hold(NAS, 1200);
  const facts = await pr;
  await tick(100);
  const said = H.lines.filter((l) => /the main loop was held/.test(l));
  ok(facts && facts.loopMs > 100 && /^readFileSync\(.*pipe\d+\) \d+ ms, under the network mount/.test(facts.blockedBy || '') && said.length === 1, `a probe in flight across the hold: its facts name the call, ONE line for the hold (${said.length})`, said);
  // THE GUARD: a storage row is refused BEFORE the syscall, said once per call site, counted; the setting turns it to log-only
  let err = null;
  try { reader.peek(path.join(STORE, 'row.md')); } catch (e) { err = e; }
  try { reader.peek(path.join(STORE, 'row.md')); } catch { }
  ok(err && err.code === 'EVSMOUNTSYNC' && err.path === path.join(STORE, 'row.md') && err.mount === STORE && err.message === SW.REFUSAL, `a sync call on a STORAGE row is refused by name: ${err && err.code} ${err && err.mount}`);
  ok(wlog.filter((l) => l.startsWith('[mount-guard] statSync(')).length === 1 && /from src\/row-reader\.js:4 (Object\.)?peek refused — use SafeFs\/async; the mount «.*OneDrive»$/.test(wlog.find((l) => l.startsWith('[mount-guard]')) || '') && w.counts.refused === 2,
    `said ONCE per call site (refused twice): ${wlog.find((l) => l.startsWith('[mount-guard]'))}`);
  w.setGuard(() => false);
  ok(reader.peek(path.join(STORE, 'row.md')).size === 1 && w.counts.allowed === 1 && wlog.some((l) => /mounts\.mainThreadSyncGuard is off \(log only\)/.test(l)), 'mounts.mainThreadSyncGuard = false: the call runs and is said (log only)');
  w.setGuard(() => true);
  ok(fs.statSync(LOC).isDirectory() && fs.statSync(path.join(ROOT, 'data', '..')).isDirectory(), 'a local path and the instance\'s own tree are never refused');
  { let threw = null, got;   // a fault inside the witness (here: a path-like whose toString throws) never reaches the caller
    try { got = fs.existsSync({ length: 1, toString() { throw new Error('witness fault'); } }); } catch (e) { threw = e; }
    ok(!threw && got === false, `a witness fault never breaks the call: the call runs unwitnessed (${threw ? threw.message : 'existsSync → ' + got})`); }
  { const w2 = SW.create({ rootDir: ROOT, dataDir: path.join(ROOT, 'data'), fresh: true, armed: false, live: false, registry: () => [{ mountpoint: STORE }], readMountinfo: () => '' });
    w2.start(); let e2 = null; try { reader.peek(path.join(STORE, 'row.md')); } catch (e) { e2 = e; } w2.stop();
    ok(!e2, 'before the first loop turn (the main-module evaluation) the guard only witnesses — a refusal there would stop every boot'); }
  w.start();
  // RED CONTROL: the canary as the base wired it — no witness — over the same hold says NOTHING (the owner's journal)
  LB.setHook(null);
  const C = harness(createFsCanary);
  hold(NAS);
  await tick(150);
  ok(!C.lines.length && filed.length === 1, `CONTROL: the base-shaped canary (no witness) names nothing for the same hold (${C.lines.length} lines)`);
  C.c.close(); H.c.close(); w.stop();
  // THE WATCHDOG THREAD: a call still in flight is named WHILE it holds (a child: the witness's own thread writes fd 2)
  const kid = path.join(ROOT, 'kid.js');
  fs.writeFileSync(kid, `const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
require(${JSON.stringify(path.join(REPO, 'src/server/loop-blame.js'))}).install({ root: ${JSON.stringify(ROOT)} });
const w = require(${JSON.stringify(path.join(REPO, 'src/server/sync-fs-witness.js'))}).create({ rootDir: ${JSON.stringify(ROOT)}, armed: true, liveMs: 700, readMountinfo: () => '' }).start();
const p = path.join(${JSON.stringify(ROOT)}, 'kidpipe'); require('child_process').execFileSync('mkfifo', [p]);
spawn('sh', ['-c', "sleep 2.2; printf x > '" + p + "'"], { stdio: 'ignore' });
setTimeout(() => { fs.readFileSync(p); w.stop(); }, 300);
`);
  const out = await new Promise((r) => { const c = spawn(process.execPath, [kid], { stdio: ['ignore', 'ignore', 'pipe'] }); let e = ''; c.stderr.on('data', (d) => { e += d; }); c.on('exit', () => r(e)); });
  ok(/\[sync-fs\] the main thread has waited [12] s in readFileSync\(.*kidpipe\) — the kernel: \S+ in (openat|open|syscall \d+)/.test(out), `a hold still in flight is named by the watchdog thread while it holds, with the kernel's wchan + syscall: ${out.trim().split('\n')[0]}`);
  const KW = require(path.join(REPO, 'src/server/sync-fs-witness-worker.js'));
  ok(KW.kernelWords('request_wait_answer\n', '262 0xffffff9c 0x7f 0x7ffd 0x0 0x0 0x0 0x0 0x0\n', 'x64') === 'request_wait_answer in newfstatat' && KW.kernelWords('0', 'running', 'x64') === 'on the CPU (JavaScript or native work)'
    && KW.kernelWords('do_epoll_wait', '232 0x3', 'arm64') === 'do_epoll_wait in syscall 232', 'the kernel words: a FUSE wait in newfstatat, on the CPU, an unknown architecture by number');
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.rmSync(MNTS, { recursive: true, force: true });
}

console.log('§9 A VIEW IS CLASSED BY WHAT IT SHOWS (lane mount-class-by-source) — the owner\'s workspace bindfs over NFS, before and after the move');
{ // 2026-11-12, the data-move read: the owner's workspace is a fuse.bindfs VIEW of a kernel NFS mount — 'home' while the
  // instance lived on it, 'storage' the day the instance moved to the local disk ⇒ every project path refused. The two
  // real rows of the box (addresses removed) over scratch folders; every call runs for real when the guard lets it.
  const SW = require(path.join(REPO, 'src/server/sync-fs-witness.js'));
  const SP = require(path.join(REPO, 'src/storage-path.js'));
  const SS = require(path.join(REPO, 'src/session-store.js'));
  const MH = require(path.join(REPO, 'src/mount-health.js'));
  const { spawn } = await import('node:child_process');
  const S = fs.mkdtempSync(path.join(os.tmpdir(), 'fscanview'));
  const NFS = path.join(S, 'nfs'), WS = path.join(S, 'workspace'), R = path.join(S, 'rclone'), RV = path.join(S, 'rview'), Q = path.join(S, 'qview'), P = path.join(S, 'pview');
  const CO = path.join(WS, 'AIWorkspace', 'vibespace'), N = path.join(S, 'home', 'vibespace'), PROJ = path.join(WS, 'AIWorkspace', 'my-proj');
  const DISK = path.join(S, 'disk'), LV = path.join(S, 'lview');   // a local disk's mount + a bindfs view of it
  for (const d of [NFS, R, RV, Q, P, DISK, LV, path.join(CO, 'data'), PROJ, path.join(S, 'home')]) fs.mkdirSync(d, { recursive: true });
  for (const d of [R, RV, Q, P]) fs.writeFileSync(path.join(d, 'f'), 'x');
  fs.writeFileSync(path.join(CO, 'data', 'settings.json'), '{}');
  const MI = [   // no '/' row: the source of Q is held by no row handed in
    `732 42 0:69 / ${NFS} rw,noatime shared:1044 - nfs4 192.0.2.10:/volume1/w rw,vers=4.1,hard`,
    `714 42 0:65 / ${WS} rw,relatime shared:1059 - fuse.bindfs ${NFS} rw,user_id=0,group_id=0,default_permissions,allow_other`,
    `800 42 0:70 / ${R} rw,nosuid,nodev,relatime - fuse.rclone VSa: rw,user_id=1000,group_id=1000`,
    `801 42 0:71 / ${RV} rw,relatime - fuse.bindfs ${R} rw`,
    `802 42 0:72 / ${Q} rw,relatime - fuse.bindfs ${path.join(S, 'not-in-the-table')} rw`,
    `803 42 0:73 / ${P} rw,relatime - fuse.bindfs ${NFS} rw`,
    `850 42 259:3 / ${DISK} rw,relatime - ext4 /dev/nvme0n1p3 rw`,
    `851 42 0:76 / ${LV} rw,relatime - fuse.bindfs ${path.join(DISK, 'data')} rw`,
    `904 732 0:77 / ${path.join(NFS, 'drive')} rw,relatime - fuse.rclone VSd: rw,user_id=1000,group_id=1000`,   // round 2: an rclone BELOW the view's source
  ].join('\n') + '\n';
  const wlog = [];
  const run = (rootDir) => { const w = SW.create({ rootDir, dataDir: path.join(rootDir, 'data'), fresh: true, armed: true, live: false, heldMs: 80, log: { warn: (l) => wlog.push(l) }, readMountinfo: () => MI, registry: () => [{ mountpoint: P, name: 'Pview', id: 'mnt-p' }, { mountpoint: path.join(NFS, 'prod'), name: 'Prod', id: 'mnt-prod' }] }); w.start(); return w; };
  const call = (fn, p) => { try { const r = fn === 'readFileSync' ? String(fs[fn](p, 'utf8')) : fs[fn](p); return { ok: true, r }; } catch (e) { return { ok: false, code: e.code, mount: e.mount }; } };
  const projCalls = () => ['existsSync', 'statSync', 'realpathSync'].map((fn) => [fn, call(fn, PROJ)]);
  const said = (cs) => cs.map(([f, r]) => f + ':' + (r.ok ? 'ok' : r.code)).join(' ');
  const rowAt = (root) => SP.roots().find((r) => r.root === root) || {};
  let w = run(CO);
  const before = projCalls();
  ok(rowAt(WS).kind === 'home' && before.every(([, r]) => r.ok), `BEFORE the move (the instance on the view): the workspace bindfs is home; a project path's existsSync / statSync / realpathSync run (${said(before)})`);
  w.stop();
  fs.renameSync(CO, N); fs.symlinkSync(N, CO);   // THE MOVE: the checkout to the local disk, the old path a symlink to it
  w = run(N);
  ok(rowAt(WS).kind === 'network' && rowAt(WS).fstype === 'fuse.bindfs' && rowAt(WS).shows && rowAt(WS).shows.root === NFS && rowAt(WS).shows.fstype === 'nfs4',
    `AFTER the move (the instance on the local disk): the SAME view is network — it shows the nfs4 mount (${JSON.stringify(rowAt(WS))})`);
  const after = projCalls();
  ok(after.every(([, r]) => r.ok) && after[2][1].r === PROJ, `AFTER: a project path's existsSync / statSync / realpathSync are not refused (${said(after)})`);
  const old = call('readFileSync', path.join(CO, 'data', 'settings.json'));
  ok(old.ok && old.r === '{}', `AFTER: a path spelled through the view to the instance's own data (the old checkout path, now a symlink) is not refused (${old.ok ? 'ok' : old.code})`);
  ok(SW.callWords({ fn: 'statSync', path: PROJ, ms: 60, mount: rowAt(WS) }) === `statSync(${PROJ}) 60 ms, under the network mount «${WS}» — a fuse.bindfs view of the nfs4 mount «${NFS}» (witnessed, never refused)`,
    `the witness names the true class: ${SW.callWords({ fn: 'statSync', path: PROJ, ms: 60, mount: rowAt(WS) })}`);
  // the controls — each from its own call site (the journal says a refusal ONCE per site)
  fs.mkdirSync(path.join(N, 'src'));
  fs.writeFileSync(path.join(N, 'src', 'peeks.js'), "'use strict';\nconst fs = require('fs');\nexports.r = (p) => fs.statSync(p);\nexports.rv = (p) => fs.statSync(p);\nexports.q = (p) => fs.statSync(p);\nexports.p = (p) => fs.statSync(p);\n");
  const peeks = require(path.join(N, 'src', 'peeks.js'));
  const refused = (k, p) => { try { peeks[k](p); return null; } catch (e) { return e.code === 'EVSMOUNTSYNC' ? e.mount : `threw ${e.code}`; } };
  const line = (k) => wlog.find((l) => l.startsWith('[mount-guard]') && l.includes(`src/peeks.js:${{ r: 3, rv: 4, q: 5, p: 6 }[k]}`)) || '';
  ok(refused('r', path.join(R, 'f')) === R && line('r').endsWith(`the mount «${R}»`), `CONTROL: an rclone FUSE mount stays storage — refused, its words as they were: ${line('r')}`);
  ok(refused('rv', path.join(RV, 'f')) === RV && line('rv').endsWith(`the mount «${RV}» — a fuse.bindfs view of the fuse.rclone mount «${R}»`), `CONTROL: a bindfs over an rclone mount is storage — refused, its words name what it shows: ${line('rv')}`);
  ok(refused('q', path.join(Q, 'f')) === Q && line('q').endsWith(`the mount «${Q}» — a fuse.bindfs view whose source the mount table does not show (refused until it can be told)`), `CONTROL: a bindfs whose source row is absent is storage — refused, said so: ${line('q')}`);
  ok(refused('p', path.join(P, 'f')) === P && rowAt(P).name === 'Pview' && rowAt(P).kind === 'storage' && line('p').endsWith(`the mount «${P}»`), `CONTROL: a product storage row on a bindfs (over the same NFS) stays storage — refused, named as the product row it is: ${line('p')}`);
  // (c) EVERY storageRootOf CALLER, as a row: after the move a project path answers what it answered before (null)
  const CALLERS = [
    ['src/sessions-assemble.js', 'realCwdOf — the realpath of a session\'s cwd (B-891e: built in the sessions sweep worker)', PROJ],
    ['src/task-groups.js', '_realOf (membership) / _listContextFiles / _kindOf / _stat / _readText (a context row)', PROJ],
    ['src/session-store.js', 'probeCandidate — the transcript-folder decode', PROJ],
    ['src/server/browser-env.js', 'a project\'s agent-browser.json', path.join(PROJ, 'agent-browser.json')],
    ['src/desktop-serve.js', 'execHere — an app\'s program path', path.join(PROJ, 'bin', 'app')],
    ['src/ws-handler.js', 'a pending editor\'s file', path.join(PROJ, 'edit.md')],
    ['src/routes/files.js', 'syncRefusedBody — the storage a refused preview read names (lane file-preview-mount; only after the guard refused it)', path.join(PROJ, 'report.xlsx')],
  ];
  for (const [file, what, p] of CALLERS) ok(SP.storageRootOf(p) === null, `${file} ${what}: ${p.slice(S.length)} → not a storage path after the move (as before it)`);
  const callers = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const rel = d + '/' + e.name; if (e.isDirectory()) walk(rel); else if (e.name.endsWith('.js') && rel !== 'src/storage-path.js' && /\bstorageRootOf\(/.test(fs.readFileSync(path.join(REPO, rel), 'utf8'))) callers.push(rel); } };
  walk('src');
  ok(JSON.stringify(callers.sort()) === JSON.stringify(CALLERS.map((c) => c[0]).sort()), `every storageRootOf caller in src/ is a row here (a new caller without a row is red): ${callers.join(' ')}`);
  const dec = SS.recoverCwdFromProjDir(PROJ.replace(/[/._]/g, '-'));
  ok(dec === PROJ, `the transcript-folder decode after the move probes the view again: ${dec.slice(S.length)}`);
  // THE HOLD WORDS on each of the three view rows: a real ≥ 120 ms sync read (a FIFO a child fills) under each view — the
  // witness words the hold (its default onHeld: the canary line); the storage view's hold runs with the guard off
  let nf = 0;
  const holdIn = (dir) => { const p = path.join(dir, `pipe${++nf}`); execFileSync('mkfifo', [p]); spawn('sh', ['-c', `sleep 0.12; printf 'x' > '${p}'`], { stdio: 'ignore' }); peeks.read(p); return p; };
  fs.appendFileSync(path.join(N, 'src', 'peeks.js'), "exports.read = (p) => fs.readFileSync(p);\n");
  delete require.cache[require.resolve(path.join(N, 'src', 'peeks.js'))];
  Object.assign(peeks, require(path.join(N, 'src', 'peeks.js')));
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heldWords = (p) => wlog.find((l) => l.startsWith('[canary] the main loop was held') && l.includes(`readFileSync(${p})`)) || '';
  const pN = holdIn(PROJ); await new Promise((r) => setTimeout(r, 5));
  ok(new RegExp(`readFileSync\\(${esc(pN)}\\) \\d{3,} ms, under the network mount «${esc(WS)}» — a fuse\\.bindfs view of the nfs4 mount «${esc(NFS)}» \\(witnessed, never refused\\) ← src/peeks\\.js:7`).test(heldWords(pN)),
    `the hold words over NFS: ${heldWords(pN)}`);
  w.setGuard(() => false);
  const pS = holdIn(RV); await new Promise((r) => setTimeout(r, 5));
  w.setGuard(() => true);
  ok(new RegExp(`readFileSync\\(${esc(pS)}\\) \\d{3,} ms, under storage mount «${esc(RV)}» — a fuse\\.bindfs view of the fuse\\.rclone mount «${esc(R)}» ← src/peeks\\.js:7`).test(heldWords(pS)),
    `the hold words over storage (the guard off): ${heldWords(pS)}`);
  const pD = holdIn(LV); await new Promise((r) => setTimeout(r, 5));
  ok(new RegExp(`readFileSync\\(${esc(pD)}\\) \\d{3,} ms, under the mount «${esc(LV)}» — a fuse\\.bindfs view of the ext4 mount «${esc(DISK)}» \\(witnessed, never refused\\) ← src/peeks\\.js:7`).test(heldWords(pD)),
    `the hold words over the local disk — a watched root, never refused: ${heldWords(pD)}`);
  ok(rowAt(LV).kind === 'disk' && SP.storageRootOf(path.join(LV, 'x')) === null, 'the view of the local disk is a disk root: witnessed, never a storage path');
  const tails = ['network', 'storage', 'disk'].map((k) => { const it = MH.heldItem({ mountpoint: { network: WS, storage: RV, disk: LV }[k], kind: k, fn: 'readFileSync', path: 'x', ms: 6000, suspects: [] }); return it.detail.split('\n').pop(); });
  ok(tails[0] === MH.HELD_TAIL.network && tails[1] === MH.HELD_TAIL.storage && tails[2] === MH.HELD_TAIL.disk && /shows another folder of this machine through a FUSE program/.test(tails[2]), `the For-you item's last words for each view row: ${tails.join(' | ')}`);
  // ROUND 2 — A STORAGE MOUNT BELOW A VIEW'S SOURCE IS STORAGE THROUGH THE VIEW (the verifier's two scenes, guard-new.log):
  // bindfs crosses into what is mounted below its source, so the rclone at NFS/drive and the product row NFS/prod are
  // reached at WS/drive and WS/prod — refused there as at their own spelling, named
  fs.appendFileSync(path.join(N, 'src', 'peeks.js'), "exports.d = (p) => fs.statSync(p);\nexports.pr = (p) => fs.statSync(p);\n");
  delete require.cache[require.resolve(path.join(N, 'src', 'peeks.js'))];
  Object.assign(peeks, require(path.join(N, 'src', 'peeks.js')));
  const five = (p) => ['existsSync', 'statSync', 'realpathSync', 'readdirSync', 'readFileSync'].map((fn) => [fn, call(fn, p)]);
  const lineAt = (n) => wlog.find((l) => l.startsWith('[mount-guard]') && l.includes(`src/peeks.js:${n}`)) || '';
  const drive = path.join(WS, 'drive'), prod = path.join(WS, 'prod');
  const fd = five(path.join(drive, 'f')), fp = five(path.join(prod, 'f'));
  ok(fd.every(([, r]) => !r.ok && r.code === 'EVSMOUNTSYNC' && r.mount === drive) && SP.storageRootOf(path.join(drive, 'f')).root === drive && refused('d', path.join(drive, 'f')) === drive
    && lineAt(8).endsWith(`the mount «${drive}» — the fuse.rclone mount «${path.join(NFS, 'drive')}» reached through the fuse.bindfs view «${WS}»`),
    `an rclone BELOW the NFS source, reached through the view: all five sync calls refused (${said(fd)}), named: ${lineAt(8)}`);
  ok(fp.every(([, r]) => !r.ok && r.code === 'EVSMOUNTSYNC' && r.mount === prod) && SP.storageRootOf(path.join(prod, 'f')).name === 'Prod' && refused('pr', path.join(prod, 'f')) === prod
    && lineAt(9).endsWith(`the mount «${prod}» — the storage folder «${path.join(NFS, 'prod')}» reached through the fuse.bindfs view «${WS}»`),
    `a product storage row BELOW the NFS source, reached through the view: all five refused (${said(fp)}), named: ${lineAt(9)}`);
  const own = five(path.join(NFS, 'drive', 'f'));
  ok(own.every(([, r]) => !r.ok && r.code === 'EVSMOUNTSYNC' && r.mount === path.join(NFS, 'drive')) && after.every(([, r]) => r.ok), 'the same rclone at its own spelling is refused too; a project path beside it through the view still runs');
  console.log('§10 B-1425 A PATH DIR ON A MOUNT IS NEVER STATTED FROM THE MAIN THREAD (desktop-display binOnPath, session-store tmuxOnPath)');
  { // the hub's PATH: a storage dir (the rclone), the NFS view's dir, a local dir — the tool in the storage dir AND the local
    // one, a second tool only on the NFS view. The files are made with async fs (the guard is armed: a sync call into the
    // rclone is refused, as it must be)
    const DD = require(path.join(REPO, 'src/desktop-display.js'));
    const T = 'tool-b1425', TN = 'tool-b1425-nfs', RB = path.join(R, 'bin'), NB = path.join(PROJ, 'bin'), LB10 = path.join(S, 'localbin');
    for (const d of [RB, NB, LB10]) await fs.promises.mkdir(d, { recursive: true });
    for (const f of [path.join(RB, T), path.join(LB10, T), path.join(NB, TN), path.join(NB, 'tmux'), path.join(RB, 'tmux')]) { await fs.promises.writeFile(f, '#!/bin/sh\n'); await fs.promises.chmod(f, 0o755); }
    const env10 = { PATH: [RB, NB, LB10].join(path.delimiter) };
    const stats = [], astats = [], realStat = fs.statSync, realAStat = fs.promises.stat;
    const spy = () => { stats.length = 0; astats.length = 0; fs.statSync = function (p, ...a) { stats.push(String(p)); return realStat.call(this, p, ...a); }; fs.promises.stat = function (p, ...a) { astats.push(String(p)); return realAStat.call(this, p, ...a); }; };
    const unspy = () => { fs.statSync = realStat; fs.promises.stat = realAStat; };
    const spied = (fn) => { spy(); try { return fn(); } finally { unspy(); } };
    const spiedAsync = async (fn) => { spy(); try { return await fn(); } finally { unspy(); } };
    const intoMounts = (list = stats) => list.filter((p) => p.startsWith(R + '/') || p.startsWith(WS + '/'));
    const refused0 = w.counts.refused;   // the guard's own count (its journal line is said once per call site)
    DD.resetBinMemo();
    const first = spied(() => DD.binOnPath(T, { env: env10 }));
    ok(first === path.join(LB10, T) && !intoMounts().length && stats.includes(path.join(LB10, T)),
      `§10 the sync walk stats the local dir only (${stats.length} stat(s), none under a mount); the NFS dir not answered yet, it answers the local hit for now: ${first && first.slice(S.length)}`);
    const hf = await spiedAsync(() => DD.hostFacts({ env: env10, bins: [T, TN] }));
    ok(hf && hf.bins[T] === path.join(LB10, T) && hf.bins[TN] === path.join(NB, TN) && !intoMounts().length && astats.some((x) => x.startsWith(NB + '/')) && !astats.some((x) => x.startsWith(R + '/')),
      `§10 hostFacts awaits the NFS dir's async stats (a tool only there is found: ${hf && hf.bins[TN] && hf.bins[TN].slice(S.length)}); the storage dir is never read — sync or async — nor an answer (every spawn re-stats its binary, which the guard refuses there): ${hf && hf.bins[T] && hf.bins[T].slice(S.length)}; sync stats into a mount ${intoMounts().length}, async into the rclone ${astats.filter((x) => x.startsWith(R + '/')).length}`);
    const again = spied(() => DD.binOnPath(TN, { env: env10 }));
    ok(again === path.join(NB, TN) && !stats.length, `§10 then the sync ask reads the memo: ${again && again.slice(S.length)}, ${stats.length} stat(s)`);
    const exec = (() => { try { return DD.assertExecutable(again, TN); } catch (e) { return e.code; } })();
    ok(exec === again, `§10 the answer can be spawned: the spawn's own re-stat (assertExecutable) passes on the NFS view (${exec === again ? 'ok' : exec})`);
    // session-store's tmuxOnPath (batch 69 verdict MUST 1+2): a tmux only on the NFS view (and on the storage dir) — not seen
    // before the async landing, never statted from the main thread, FOUND once landed; the storage dir never read
    const oldPath = process.env.PATH;
    process.env.PATH = env10.PATH;
    let tmux0, tmux1, sync1 = [], async1 = [];
    try {
      tmux0 = spied(() => SS.tmuxOnPath());
      await spiedAsync(() => SS.landTmuxMounts()); async1 = astats.slice();
      tmux1 = spied(() => SS.tmuxOnPath()); sync1 = intoMounts();
    } finally { process.env.PATH = oldPath; }
    ok(tmux0 === null && tmux1 === path.join(NB, 'tmux') && !sync1.length && async1.some((x) => x === path.join(NB, 'tmux')) && !async1.some((x) => x.startsWith(R + '/')),
      `§10 session-store's tmuxOnPath: a tmux only on the NFS view is FOUND after the async landing (${tmux1 && tmux1.slice(S.length)}; before it ${tmux0}) — never statted from the main thread (${sync1.length}), the storage dir never read (async into the rclone ${async1.filter((x) => x.startsWith(R + '/')).length})`);
    ok(w.counts.refused === refused0, `§10 the guard refused nothing on the way (${w.counts.refused - refused0})`);
    // CONTROLS: the walk as it was — every dir statSync'd on the main thread; the storage dir answered from the async walk
    const ddSrc = fs.readFileSync(path.join(REPO, 'src/desktop-display.js'), 'utf8');
    const oldWalk = editAnchor(ddSrc, "    if (r && r.kind === 'storage') continue;\n    if (r) { const f = mountFact(dir, name, now); if (!f) { pending = true; continue; } if (f.yes) { found = p; break; } continue; }\n", '', "src/desktop-display.js");
    const DDo = M.load('src/desktop-display.js', oldWalk, 'b1425-syncwalk');
    const was = spied(() => DDo.binOnPath(TN, { env: env10 }));
    ok(oldWalk !== ddSrc && intoMounts().length === 2 && was === path.join(NB, TN) && w.counts.refused === refused0 + 1,
      `CONTROL (the old walk): ${intoMounts().length} statSync(s) into a mount on the main thread (the rclone's refused: ${w.counts.refused - refused0}) ⇒ RED`);
    const answersStorage = editAnchor(editAnchor(ddSrc, "    if (r && r.kind === 'storage') continue;\n", '', "src/desktop-display.js"), ".filter(([, r]) => r && r.kind !== 'storage');", '.filter(([, r]) => r);', "src/desktop-display.js");
    const ssSrc = fs.readFileSync(path.join(REPO, 'src/session-store.js'), 'utf8');
    const skipAll = editAnchor(ssSrc, "    if (r && r.kind === 'storage') continue;   // B-1425: never read from the main thread (the guard refuses it)\n", '    if (r) continue;\n', "src/session-store.js");
    const SSo = M.load('src/session-store.js', skipAll, 'b1425-tmuxskip');
    process.env.PATH = env10.PATH;
    let tmuxOld; try { await SSo.landTmuxMounts(); tmuxOld = SSo.tmuxOnPath(); } finally { process.env.PATH = oldPath; }
    ok(skipAll !== ssSrc && tmuxOld === null, `CONTROL (batch 69's line — every root skipped): the NFS view's tmux is never found (${tmuxOld}) ⇒ RED`);
    const DDs = M.load('src/desktop-display.js', answersStorage, 'b1425-storage');
    const hs = await DDs.hostFacts({ env: env10, bins: [T] });
    const spawnS = (() => { try { return DDs.assertExecutable(hs.bins[T], T); } catch (e) { return e.code; } })();
    ok(answersStorage !== ddSrc && hs.bins[T] === path.join(RB, T) && spawnS === 'exec-vanished', `CONTROL (the storage dir answered): hostFacts names ${hs.bins[T] && hs.bins[T].slice(S.length)}, and its spawn's re-stat is refused there (${spawnS}) ⇒ RED`);
    // the verdict's ask (00:30Z, a must by three readers): a bare program ONLY in the NFS view's dir is found on the FIRST
    // catalog read (the launch and the witness push await the same landing) — desktop-serve over the REAL desktop-display
    const DS = require(path.join(REPO, 'src/desktop-serve.js'));
    const quiet10 = { log() { }, warn() { }, error() { }, info() { } };
    const firstRead = async (DSm, name, sub) => {
      DD.resetBinMemo();   // a fresh process's memory: nothing landed, no folder listed (an earlier leg listed the NFS dir before this program was written)
      await fs.promises.writeFile(path.join(NB, name), '#!/bin/sh\n'); await fs.promises.chmod(path.join(NB, name), 0o755);
      const apps = { catalogRows: () => [{ id: 'app.' + name, label: 'an NFS-only program', exec: name, args: [], category: 'utility', app: name }], refreshCatalog: async () => { }, witnessRows: () => [] };
      const ds = DSm.install({ dataDir: path.join(S, sub), env: env10, display: DD, registryRows: [], log: quiet10, tickMs: 3600e3, apps });
      try { const L0 = await ds.list(); return L0.registry.find((r) => r.id === 'app.' + name) || null; } finally { try { ds.shutdown(); } catch { } }
    };
    const firstCat = await firstRead(DS, 'tool-b1425-first', 'ds10');
    ok(firstCat && firstCat.available === true && firstCat.path === path.join(NB, 'tool-b1425-first'), `§10 the FIRST catalog read finds a program that lives only in the NFS view's dir: ${firstCat ? `available ${firstCat.available}, ${firstCat.path && firstCat.path.slice(S.length)}` : 'no row'}`);
    const noWait = fs.readFileSync(path.join(REPO, 'src/desktop-serve.js'), 'utf8').replace('  async function landExecs() {\n    if (typeof display.landMounts !== \'function\') return;', '  async function landExecs() {\n    return;');
    const DSo = M.load('src/desktop-serve.js', noWait, 'b1425-nowait');
    const firstOld = await firstRead(DSo, 'tool-b1425-first-old', 'ds10o');
    ok(firstOld && firstOld.available === false, `CONTROL (no wait for the landing): the first catalog read says ${firstOld ? `«${firstOld.reason}»` : 'no row'} for that program ⇒ RED`);
    const dsSrc = fs.readFileSync(path.join(REPO, 'src/desktop-serve.js'), 'utf8');
    const awaits = (dsSrc.match(/await landExecs\(\);/g) || []).length;
    ok(awaits === 3 && /\n {4}await landExecs\(\);[^\n]*\n {4}const reg = registry\(f\);/.test(dsSrc) && /\n {4}await landExecs\(\);[^\n]*\n {4}return \{ apps: listApps\(\), registry: await lockFacts\(registry\(f\)\)/.test(dsSrc) && typeof DD.landMounts === 'function',
      `§10 desktop-serve (the verdict's shoulds): the catalog, a launch and the witness push await the PATH walk's landing for their bare exec names before judging an app (${awaits} awaits)`);
    // B-1425's part (3) — the remainder of 2.369.410's close: THE HUB ANSWERS JSON, the list in it. The desktop route
    // (src/routes/desktop-apps.js) over the hub keeper's road for this machine (src/server/desktop-app-keeper.js list():
    // machine.list() as it is when no machine is paired), the REAL desktop-serve and desktop-display, the guard armed, PATH's
    // first dir on the refusing storage mount
    const express = require('express');
    const RT = require(path.join(REPO, 'src/routes/desktop-apps.js'));
    const HN = 'tool-b1425-http';
    await fs.promises.writeFile(path.join(NB, HN), '#!/bin/sh\n'); await fs.promises.chmod(path.join(NB, HN), 0o755);
    const appsH = { catalogRows: () => [{ id: 'app.' + HN, label: 'an NFS-only program', exec: HN, args: [], category: 'utility', app: HN }], refreshCatalog: async () => { }, witnessRows: () => [] };
    const viaRoute = async (display, sub) => {
      const dsH = DS.install({ dataDir: path.join(S, sub), env: env10, display, registryRows: [], log: quiet10, tickMs: 3600e3, apps: appsH });
      RT.setup({ keeper: { list: (o) => dsH.list(o), listApps: () => [], facts: () => Promise.resolve() }, access: null, vnc: {} });
      const appx = express(); appx.use(express.json()); appx.use(RT.router);
      const srv = await new Promise((r) => { const x = appx.listen(0, '127.0.0.1', () => r(x)); });
      try {
        const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/desktop/apps`);
        const type = (r.headers.get('content-type') || '').split(';')[0], text = await r.text();
        let body = null; try { body = JSON.parse(text); } catch { }
        const row = body && Array.isArray(body.registry) ? body.registry.find((x) => x.id === 'app.' + HN) : null;
        return { status: r.status, type, body, row };
      } finally { await new Promise((r) => srv.close(r)); try { dsH.shutdown(); } catch { } }
    };
    DD.resetBinMemo();
    const refH = w.counts.refused;
    const h = await viaRoute(DD, 'ds10h');
    ok(h.status === 200 && h.type === 'application/json' && h.row && h.row.available === true && h.row.path === path.join(NB, HN) && w.counts.refused === refH,
      `§10 B-1425 (3): GET /api/desktop/apps with PATH's first dir on the refusing storage mount answers ${h.status} ${h.type} — the NFS-only program listed ${h.row ? `available ${h.row.available}` : '(no row)'}; the guard refused ${w.counts.refused - refH} call(s) on the way`);
    // CONTROL: the walk with neither its storage skip nor its per-dir catch — the guard's refusal leaves the walk (its plant
    // proven: the three lines spelled once, and the guard COUNTS the refused stat — the plant was on the road)
    const WALK = "    if (r && r.kind === 'storage') continue;\n    if (r) { const f = mountFact(dir, name, now); if (!f) { pending = true; continue; } if (f.yes) { found = p; break; } continue; }\n    try { const st = fs.statSync(p); if (st.isFile() && (st.mode & 0o111)) { found = p; break; } } catch { /* not here */ }\n";
    const bare = editAnchor(ddSrc, WALK, "    const st = fs.statSync(p); if (st.isFile() && (st.mode & 0o111)) { found = p; break; }\n", "src/desktop-display.js");
    ok(ddSrc.split(WALK).length === 2 && bare !== ddSrc, 'CONTROL (a refusal that leaves the walk): its plant — the walk\'s three lines — is spelled exactly once');
    const DDb = M.load('src/desktop-display.js', bare, 'b1425-bare');
    const refC = w.counts.refused;
    const hc = await viaRoute(DDb, 'ds10hc');
    ok(w.counts.refused > refC && hc.type === 'application/json' && !(hc.status === 200 && hc.row && hc.row.available === true),
      `CONTROL (the refusal leaves the walk; the guard refused ${w.counts.refused - refC}): the route answers ${hc.status} ${hc.type}${hc.body && hc.body.code ? ` «${hc.body.code}»` : ''} — no program listed ⇒ RED (and still JSON: every desktop route ends in fail()'s JSON)`);
    // B-75ba (the B-1425 read's neighbour): app-serve's resolveExec fallback — when binOnPath has no answer — reads only PATH dirs
    // under NO mount root; a storage dir that never answers holds nothing. The stand-in: every async access/stat into the rclone
    // (the storage root) never settles; a program only in the LOCAL dir, after it on PATH, binOnPath silent (null)
    const AS75 = require(path.join(REPO, 'src/app-serve.js'));
    const P75 = 'tool-b75ba';
    await fs.promises.writeFile(path.join(LB10, P75), '#!/bin/sh\n'); await fs.promises.chmod(path.join(LB10, P75), 0o755);
    const P75N = 'tool-b75ba-nfs';   // a program only on the NFS view's dir (a rooted dir that answers)
    await fs.promises.writeFile(path.join(NB, P75N), '#!/bin/sh\n'); await fs.promises.chmod(path.join(NB, P75N), 0o755);
    const asked75 = [], askedNfs = [], fa = fs.promises.access, fsx = fs.promises.stat;
    const hold = (p) => String(p).startsWith(R + '/');
    const nfs = (p) => String(p).startsWith(NB + '/');
    // as desktop-serve hands it: the storage roots (rootOf); binOnPath silent unless a road is given; landOnPath as given
    const resolveWith = async (AS, sub, name = P75, roads = {}) => {
      const apps = AS.create({ home: path.join(S, sub, 'home'), stateDir: path.join(S, sub), env: env10, log: quiet10, binOnPath: () => null, rootOf: (d) => SP.rootOf(d), ...roads });
      fs.promises.access = function (p, ...a) { if (nfs(p)) askedNfs.push(String(p)); if (hold(p)) { asked75.push(String(p)); return new Promise(() => { }); } return fa.call(this, p, ...a); };
      fs.promises.stat = function (p, ...a) { if (nfs(p)) askedNfs.push(String(p)); if (hold(p)) { asked75.push(String(p)); return new Promise(() => { }); } return fsx.call(this, p, ...a); };
      try { return await Promise.race([apps.resolveExec(name), new Promise((r) => setTimeout(() => r('NO ANSWER'), 400))]); }
      finally { fs.promises.access = fa; fs.promises.stat = fsx; }
    };
    asked75.length = 0;
    const r75 = await resolveWith(AS75, 'as75'), asked1 = asked75.length;
    ok(r75 === path.join(LB10, P75) && asked1 === 0,
      `§10 B-75ba: app-serve's PATH fallback (binOnPath silent) finds the program in the local dir behind a storage dir that never answers (${r75 === 'NO ANSWER' ? r75 : r75 && r75.slice(S.length)}) — the storage dir asked ${asked1} time(s)`);
    // its read's S2: a ROOTED dir that answers (the NFS view) is never read by the fallback either — it is binOnPath's (no landing
    // handed here: not found, 0 reads into it); S1: with desktop-display's own roads (binOnPath + its bounded landing, as
    // desktop-serve hands them) the program on the NFS view IS found — the landing, never the fallback; the storage dir still unasked
    asked75.length = 0; askedNfs.length = 0;
    const r75n = await resolveWith(AS75, 'as75n', P75N), nfs0 = askedNfs.length;
    DD.resetBinMemo(); asked75.length = 0; askedNfs.length = 0;
    const r75l = await resolveWith(AS75, 'as75l', P75N, { binOnPath: (n, o) => DD.binOnPath(n, o), landOnPath: (n, o) => DD.landMounts(n, o) });
    ok(r75n === null && nfs0 === 0 && r75l === path.join(NB, P75N) && asked75.length === 0,
      `§10 B-75ba: a program only on the NFS view (a rooted dir): the fallback alone does not read it (${r75n}, ${nfs0} read(s) into it); with binOnPath + its bounded landing it is found (${r75l === 'NO ANSWER' ? r75l : r75l && r75l.slice(S.length)} — the landing's own bounded read: ${askedNfs.length}), the storage dir never asked (${asked75.length})`);
    // CONTROL (its plant through anchored(): the mount test spelled once): the fallback that reads every PATH dir — held for good
    const asSrc = fs.readFileSync(path.join(REPO, 'src/app-serve.js'), 'utf8');
    const everyDir = anchored(asSrc, " && !underMount(d)).slice(0, 40)", ").slice(0, 40)", 'b75ba-every-dir');
    asked75.length = 0;
    const r75c = await resolveWith(M.load('src/app-serve.js', everyDir, 'b75ba-every-dir'), 'as75c');
    ok(r75c === 'NO ANSWER' && asked75.length >= 1, `CONTROL (the fallback reads every PATH dir — the release's): ${r75c} within the bound, the storage dir asked ${asked75.length} time(s) and never answered ⇒ RED`);
  }
  w.stop();
  SP.setRoots([]);
  fs.rmSync(S, { recursive: true, force: true });
}

CHK.report();
