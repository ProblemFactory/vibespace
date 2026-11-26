#!/usr/bin/env node
// test-door-state-writes — B-574d «doors-small-state» (主开发 r4867 / r4874, lane nl-mounts). THREE DOORS' SMALL RECORDS NO LONGER
// WRITE BY THEIR OWN UNSYNCED TEMP + RENAME: after a power loss such a record could come back torn or empty — the agent door's kept
// port (every remote conversation's tools lost at that restart), the tailnet door's port and PAC token (every browser set to the PAC
// loses the tailnet), the Desktop's display record (the next boot adopts the wrong display, the session's no-reply mark lost).
// FAST, in-process: each record's REAL code over a scratch data folder; the faults are PLACED (a refused sync of the record's own temp;
// a stand-in writer thread that refuses a write) — nothing spawned (an in-process listener stands for a VNC server), nothing fetched.
//   A  agent-door.json (src/server/agent-listener.js keepPort) — THE STORE WRITER, the async road WAITING on its landing:
//      A1 a start that keeps a new port: the record is asked of the writer as «agent-door.write» and is on disk (0600) when start()
//         resolves. RED: the base's keepPort (its own unsynced temp + rename: the writer never asked)
//      A2 a landing the storage refuses: said, truly («its port is not on disk yet — written when the storage answers»), and it lands.
//         RED: the base's keepPort (its own write: nothing said)
//   T  tailnet-door.json (src/server/tailnet-door.js keep) — the SYNCED REPLACE, bounded to a door opening on a NEW port or token:
//      T1 a FLAP (close, open on the freed kept port) writes NOTHING; a kept port taken writes once. RED: the gate taken out (a flap
//         writes the record again)
//      T2 a sync that FAILS (EIO placed at the fsync of its temp): the old record stands byte for byte, no temp left, said.
//         RED: the base's keep (no sync: the new port takes the name)
//      T3 a file system with no sync at all (EINVAL placed): the record lands, «does not do a sync» said; 0600 kept. RED: no mode
//   V  vnc.json (src/vnc.js _record) — THE STORE WRITER on every road (r4874: the Desktop window's reconnect ladder is a cadence):
//      V1 SIX LADDER CALLS with no reply and the store OWED: no synchronous wait, and at most one write asked; nothing written by the
//         main thread. RED: the base's _record (its own synchronous temp + rename at every call)
//      V2 the record is asked of the writer and lands — the base's bytes (display, port, pid, a trailing newline) — and a manager made
//         again on the folder adopts it. RED: the base's _record (the writer never asked)
//      V3 the mark THIS run cleared is answered from memory while its record is still owed (never the older file's mark).
//         RED: _noReplyMark without the run's own mark (the stale file answers)
//      V4 THE SPAWN ROAD (r4935 (a)): a ladder call after the display's program DIED spawns an X server (a stand-in: this process,
//         an in-process listener) over an owed store — the record handed to the writer at once (urgent), NO wait on its landing,
//         the route replies. RED: the cure's earlier tip (its spawn road awaiting the landing)
// Run: node scripts/test-door-state-writes.mjs
import './scratch.mjs';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
process.umask(0o022);   // a mode's red reads 0644: the mode asked, never the runner's own mask
const DIRS = [];
let dirN = 0;
process.on('exit', () => { for (const d of DIRS) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* gone */ } } });
const dirOf = (name) => { const d = scratchDir(`dsw-${name}-${++dirN}`); DIRS.push(d); return d; };
const asModule = (rel, code) => { const abs = path.join(REPO, rel); const m = new Module(abs, null); m.filename = abs; m.paths = Module._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const copyOf = (rel, edits, name) => { let code = srcOf(rel); for (const [a, b] of edits) code = anchored(code, a, b, name); return asModule(rel, code); };
const bytes = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const temps = (dir, base) => fs.readdirSync(dir).filter((n) => n.startsWith(base + '.') && n.includes('tmp'));
const modeOf = (f) => { try { return fs.statSync(f).mode & 0o777; } catch { return null; } };
const listenFree = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => r(s)); });
const quiet = { log() { }, info() { }, warn() { }, error() { } };
const AL = 'src/server/agent-listener.js', TD = 'src/server/tailnet-door.js', VN = 'src/vnc.js';

/** THE PLACED SYNC: the fsync of a descriptor opened on the record's OWN temp (`<file>.…tmp`) answers `code` (null: lets it through) */
function placeSync(file, code) {
  const o = fs.openSync, s = fs.fsyncSync, fds = new Set(), asked = [];
  fs.openSync = function (p, ...a) { const fd = o.call(this, p, ...a); if (typeof p === 'string' && p.startsWith(file + '.') && p.includes('tmp')) fds.add(fd); return fd; };
  fs.fsyncSync = function (fd, ...a) { if (fds.has(fd)) { asked.push(fd); if (code) throw Object.assign(new Error(`a placed ${code} at the sync`), { code }); } return s.call(this, fd, ...a); };
  return { asked, restore: () => { fs.openSync = o; fs.fsyncSync = s; } };
}
/** every synchronous write of the main thread that names `file` (its temp write and its rename), counted while fn runs */
async function mainWrites(file, fn) {
  const keep = { wf: fs.writeFileSync, rn: fs.renameSync }, seen = [];
  const hit = (p) => typeof p === 'string' && (p === file || p.startsWith(file + '.'));
  fs.writeFileSync = function (p, ...a) { if (hit(p)) seen.push('writeFileSync'); return keep.wf.call(this, p, ...a); };
  fs.renameSync = function (a, b, ...r) { if (hit(a) || hit(b)) seen.push('renameSync'); return keep.rn.call(this, a, b, ...r); };
  try { return { r: await fn(), seen }; } finally { fs.writeFileSync = keep.wf; fs.renameSync = keep.rn; }
}
/** a RECORDING writer: every write ASKED (dirty) and every synchronous landing (flushSync); `owed` — the store has a write owed */
function recorder({ owed = false } = {}) {
  const r = { asked: [], urgent: [], flushes: 0, durables: 0 };
  Object.assign(r, { dirty: (file, o) => { r.asked.push(o && o.name); r.urgent.push(!!(o && o.urgent)); }, pending: () => owed, durable: async () => { r.durables++; return true; }, whyNotDurable: () => null, flushSync: () => { r.flushes++; return { written: [], left: [] }; } });
  return r;
}

// THE REAL WRITER on a stand-in thread (the real writeJob; `failOn` refuses a file's writes)
const SW = require(path.join(REPO, 'src/store-writer.js'));
const STAND = require(path.join(REPO, 'scripts/fixtures/store-stand-writer.cjs')).make(dirOf('stand'));
const SAID = [];
const sink = (...a) => SAID.push(a.map(String).join(' '));
const RW = SW.create({ log: { log: sink, info: sink, warn: sink, error: sink }, workerPath: STAND.path });
async function landed(file) { let ok1 = false; for (let i = 0; i < 4 && !ok1; i++) ok1 = await RW.durable(file, { timeoutMs: 15000 }) === true; return ok1; }

try {
  console.log('A agent-door.json — the store writer; the async road waits on its landing');
  {
    const scene = async (M, { refuse = false } = {}) => {
      const d = dirOf('agent'), file = path.join(d, 'agent-door.json'), lines = [], asked = [];
      const spy = Object.assign({}, RW, { dirty: (f, o) => { asked.push(o && o.name); return RW.dirty(f, o); } });
      if (refuse) STAND.failOn('agent-door.json', true);
      let port = 0, atStart = null;
      try { port = await M.start({ app: (q, s) => s.end('app'), log: (l) => lines.push(String(l)), stateFile: file, storeWriter: spy }); atStart = bytes(file); }
      finally { if (refuse) STAND.failOn('agent-door.json', false); }
      await M.close();
      const lands = await landed(file), doc = bytes(file);
      return { port, asked, atStart: !!atStart && JSON.parse(atStart).port === port, later: lands && !!doc && JSON.parse(doc).port === port, mode: (modeOf(file) || 0).toString(8), said: lines.some((l) => l.includes('its port is not on disk yet') || l.includes('its port could not be kept')) };
    };
    const t = await scene(require(path.join(REPO, AL)));
    ok(t.port > 0 && t.asked.includes('agent-door.write') && t.atStart && t.mode === '600' && !t.said, 'A1 agent-door.json: a start that keeps a new port asks the writer («agent-door.write») and the record is ON DISK, 0600, when start() resolves', t);
    let r1 = null, y1 = null; try { r1 = await scene(copyOf(AL, [["async function keepPort(stateFile, port, log, hold = null, writer = null) {\n  if (!stateFile) return;\n  if (hold && !hold.writable('the agent door\\'s port')) return;   // r3333 unit 1: never over a held record (said once by the helper)\n  // B-574d «doors-small-state» (主开发 r4867 / r4874, lane nl-mounts): agent-door.json goes through THE STORE WRITER (src/store-writer.js: its\n  // thread writes the temp, SYNCS it, renames it — a power loss never leaves the record torn or empty, which the hold would then keep\n  // the next start from reading: a new port, every remote conversation's tools lost at that restart). Written once a start that needs\n  // a new port and once a lift — no person presses it; THIS ASYNC ROAD WAITS ON ITS LANDING (durable), the loop never does. A refused\n  // landing is SAID — truly: the record is kept in memory and the writer writes it when the storage answers (it retries); a restart\n  // before then reads the old record (or none) and takes a new port\n  const W = writer || require('../store-writer.js').storeWriter();\n  const bytes = JSON.stringify({ port }) + '\\n';\n  let landed = false, code = null;\n  try { W.dirty(stateFile, { name: 'agent-door.write', mode: 0o600, produce: () => bytes }); landed = (await W.durable(stateFile)) === true; } catch (e) { code = (e && e.code) || null; }\n  if (!landed) { const why = (typeof W.whyNotDurable === 'function' && W.whyNotDurable(stateFile)) || null; log(`[agent-door] its port is not on disk yet (${code || (why && why.code) || 'the storage did not answer'}) — it is written when the storage answers; a restart before then gives remote conversations a new port (their tools end)`); }\n}\n", "async function keepPort(stateFile, port, log, hold = null) {\n  if (!stateFile) return;\n  if (hold && !hold.writable('the agent door\\'s port')) return;   // r3333 unit 1: never over a held record (said once by the helper)\n  const tmp = `${stateFile}.${process.pid}.tmp`;\n  try { await fsp.writeFile(tmp, JSON.stringify({ port }) + '\\n', { mode: 0o600 }); await fsp.rename(tmp, stateFile); }\n  catch (e) { try { await fsp.unlink(tmp); } catch { } log(`[agent-door] its port could not be kept (${(e && e.code) || e}) — a remote session started now loses its tools at the next restart`); }\n}\n"]], 'a1-release')); } catch (e) { y1 = e.message; }   // stale-pins: kept — the base's own lines, compiled back in as the red control
    ok(!!r1 && r1.asked.length === 0, 'A1 RED CONTROL (the base\'s keepPort): its own unsynced temp + rename — the writer is never asked', r1 || y1);
    const f = await scene(require(path.join(REPO, AL)), { refuse: true });
    ok(f.port > 0 && !f.atStart && f.said && f.later === true, 'A2 agent-door.json: a landing the storage refuses is SAID («its port is not on disk yet — it is written when the storage answers»), and the record lands once the storage answers', f);
    let r2 = null, y2 = null; try { r2 = await scene(copyOf(AL, [["async function keepPort(stateFile, port, log, hold = null, writer = null) {\n  if (!stateFile) return;\n  if (hold && !hold.writable('the agent door\\'s port')) return;   // r3333 unit 1: never over a held record (said once by the helper)\n  // B-574d «doors-small-state» (主开发 r4867 / r4874, lane nl-mounts): agent-door.json goes through THE STORE WRITER (src/store-writer.js: its\n  // thread writes the temp, SYNCS it, renames it — a power loss never leaves the record torn or empty, which the hold would then keep\n  // the next start from reading: a new port, every remote conversation's tools lost at that restart). Written once a start that needs\n  // a new port and once a lift — no person presses it; THIS ASYNC ROAD WAITS ON ITS LANDING (durable), the loop never does. A refused\n  // landing is SAID — truly: the record is kept in memory and the writer writes it when the storage answers (it retries); a restart\n  // before then reads the old record (or none) and takes a new port\n  const W = writer || require('../store-writer.js').storeWriter();\n  const bytes = JSON.stringify({ port }) + '\\n';\n  let landed = false, code = null;\n  try { W.dirty(stateFile, { name: 'agent-door.write', mode: 0o600, produce: () => bytes }); landed = (await W.durable(stateFile)) === true; } catch (e) { code = (e && e.code) || null; }\n  if (!landed) { const why = (typeof W.whyNotDurable === 'function' && W.whyNotDurable(stateFile)) || null; log(`[agent-door] its port is not on disk yet (${code || (why && why.code) || 'the storage did not answer'}) — it is written when the storage answers; a restart before then gives remote conversations a new port (their tools end)`); }\n}\n", "async function keepPort(stateFile, port, log, hold = null) {\n  if (!stateFile) return;\n  if (hold && !hold.writable('the agent door\\'s port')) return;   // r3333 unit 1: never over a held record (said once by the helper)\n  const tmp = `${stateFile}.${process.pid}.tmp`;\n  try { await fsp.writeFile(tmp, JSON.stringify({ port }) + '\\n', { mode: 0o600 }); await fsp.rename(tmp, stateFile); }\n  catch (e) { try { await fsp.unlink(tmp); } catch { } log(`[agent-door] its port could not be kept (${(e && e.code) || e}) — a remote session started now loses its tools at the next restart`); }\n}\n"]], 'a2-release'), { refuse: true }); } catch (e) { y2 = e.message; }   // stale-pins: kept — the base's own lines, compiled back in as the red control
    ok(!!r2 && r2.said === false, 'A2 RED CONTROL (the base\'s keepPort): its own write never meets the refusal — nothing said, nothing synced', r2 || y2);
  }

  console.log('T tailnet-door.json — the synced replace, bounded to a door opening on a NEW port or token');
  {
    const flap = async (M) => {
      const d = dirOf('tailnet'), file = path.join(d, 'tailnet-door.json'), lines = [];
      const door = M.create({ dataDir: d, log: { log: (l) => lines.push(String(l)), warn() { }, error() { } }, cacheMs: 0 });
      const counts = [];
      const step = async (fn) => { const x = await mainWrites(file, fn); counts.push(x.seen.filter((s) => s === 'renameSync').length); return x.r; };
      const p1 = await step(() => door.ensure()); await door.close();
      const p2 = await step(() => door.ensure()); await door.close();   // A FLAP: the road off and on — the kept port is free again
      const holder = await new Promise((r) => { const s = net.createServer(); s.once('error', () => r(null)); s.listen(p2, '127.0.0.1', () => r(s)); });   // the kept port TAKEN (null: the system gave it away meanwhile — said by the leg)
      if (!holder) return { placed: false };
      const p3 = await step(() => door.ensure()); await door.close(); holder.close();
      const doc = JSON.parse(bytes(file) || '{}');
      return { placed: true, counts, same: p1 === p2, moved: p3 !== p2, kept: doc.port === p3, mode: (modeOf(file) || 0).toString(8) };
    };
    const t1 = await flap(require(path.join(REPO, TD)));
    ok(t1.placed === true && t1.counts.join() === '1,0,1' && t1.same && t1.moved && t1.kept && t1.mode === '600', 'T1 tailnet-door.json: the first open writes it once; a FLAP on the kept port writes NOTHING; the kept port taken writes once (the new port); 0600', t1);
    let x1 = null, y1 = null; try { x1 = await flap(copyOf(TD, [["      if (got !== k.port || token !== k.token) keep({ port: got, token });", "      keep({ port: got, token });"]], 't1-every-open')); } catch (e) { y1 = e.message; }
    ok(!!x1 && x1.placed === true && x1.counts[1] === 1, 'T1 RED CONTROL (the bound taken out: every open keeps): a flap writes the record again', x1 || y1);

    const fail = async (M, code) => {
      const d = dirOf('tailnet-fail'), file = path.join(d, 'tailnet-door.json'), lines = [];
      const door = M.create({ dataDir: d, log: { log: (l) => lines.push(String(l)), warn() { }, error() { } }, cacheMs: 0 });
      const p1 = await door.ensure(); await door.close();
      const old = bytes(file);
      const holder = await new Promise((r) => { const s = net.createServer(); s.once('error', () => r(null)); s.listen(p1, '127.0.0.1', () => r(s)); });   // the kept port TAKEN (null: the system gave it away meanwhile — said by the leg)
      if (!holder) return { placed: false };
      const p = placeSync(file, code);
      let p2 = 0; try { p2 = await door.ensure(); } finally { p.restore(); }
      await door.close(); holder.close();
      return { placed: true, asked: p.asked.length, moved: p2 !== p1, oldKept: bytes(file) === old, now: JSON.parse(bytes(file) || '{}').port === p2, temps: temps(d, 'tailnet-door.json'), failedSaid: lines.some((l) => l.includes('could not be kept')), noSyncSaid: lines.some((l) => l.includes('tailnet-door.json: its file system does not do a sync (EINVAL)')), mode: (modeOf(file) || 0).toString(8) };
    };
    const t2 = await fail(require(path.join(REPO, TD)), 'EIO');
    ok(t2.placed === true && t2.asked === 1 && t2.moved && t2.oldKept && t2.temps.length === 0 && t2.failedSaid, 'T2 tailnet-door.json: a placed EIO at the sync fails the write — the OLD record stands byte for byte, no temp left, said', t2);
    let x2 = null, y2 = null; try { x2 = await fail(copyOf(TD, [["    try { require('../fd-close.js').renameSynced(`${stateFile}.${process.pid}.tmp`, stateFile, JSON.stringify(state) + '\\n', { mode: 0o600, where: 'tailnet-door.json', say: (w) => sayOnce('keep-no-sync', w) }); } catch (e) { sayOnce('keep', `its port could not be kept in ${stateFile} (${e && e.message}) — a browser that outlives a restart reaches tailnet hosts again at its next start`); }", "    try { const tmp = `${stateFile}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(state) + '\\n', { mode: 0o600 }); fs.renameSync(tmp, stateFile); } catch (e) { sayOnce('keep', `its port could not be kept in ${stateFile} (${e && e.message}) — a browser that outlives a restart reaches tailnet hosts again at its next start`); }"]], 't2-release'), 'EIO'); } catch (e) { y2 = e.message; }   // stale-pins: kept — the base's own lines, compiled back in as the red control
    ok(!!x2 && x2.placed === true && x2.asked === 0 && x2.now === true, 'T2 RED CONTROL (the base\'s keep): no sync asked — the new port takes the name unsynced', x2 || y2);
    const t3 = await fail(require(path.join(REPO, TD)), 'EINVAL');
    ok(t3.placed === true && t3.asked === 1 && t3.now === true && t3.noSyncSaid && t3.mode === '600', 'T3 tailnet-door.json: a file system with no sync (EINVAL) — the record lands, «does not do a sync» said with its name and code (no path); 0600', t3);
    let x3 = null, y3 = null; try { x3 = await fail(copyOf(TD, [["    try { require('../fd-close.js').renameSynced(`${stateFile}.${process.pid}.tmp`, stateFile, JSON.stringify(state) + '\\n', { mode: 0o600, where: 'tailnet-door.json', say: (w) => sayOnce('keep-no-sync', w) }); } catch (e) { sayOnce('keep', `its port could not be kept in ${stateFile} (${e && e.message}) — a browser that outlives a restart reaches tailnet hosts again at its next start`); }", "    try { require('../fd-close.js').renameSynced(`${stateFile}.${process.pid}.tmp`, stateFile, JSON.stringify(state) + '\\n', { where: 'tailnet-door.json', say: (w) => sayOnce('keep-no-sync', w) }); } catch (e) { sayOnce('keep', `its port could not be kept in ${stateFile} (${e && e.message}) — a browser that outlives a restart reaches tailnet hosts again at its next start`); }"]], 't3-no-mode'), 'EINVAL'); } catch (e) { y3 = e.message; }
    ok(!!x3 && x3.placed === true && x3.mode !== '600', 'T3 RED CONTROL: the door asked without the mode leaves the record readable by others', x3 || y3);
  }

  console.log('V vnc.json — the store writer on every road; no write when nothing but the time changed');
  {
    const startOf = (pid) => { try { const t = fs.readFileSync(`/proc/${pid}/stat`, 'latin1'); return t.slice(t.lastIndexOf(')') + 2).split(' ')[19] || null; } catch { return null; } };
    const NO_REPLY = ['made-up-helper'];
    const ladder = async (M) => {
      const srv = await listenFree(), port = srv.address().port, d = dirOf('vnc'), file = path.join(d, 'vnc.json');
      const rec = recorder({ owed: true });   // a slow data folder: the store has a write owed the whole time
      const m = new M.VncManager({ dataDir: d, port, display: ':93', storeWriter: rec });
      m._own = { pid: process.pid, start: startOf(process.pid) };   // this process stands for our X server: alive, its start known
      m._startSession = async () => ({ noReply: NO_REPLY });   // the session's lookups get no reply (nothing is started)
      m._record(process.pid);
      await m._sessionOn({ noReply: NO_REPLY });   // the first open: no reply — the display marked
      const a0 = rec.asked.length, f0 = rec.flushes, d0 = rec.durables;
      const x = await mainWrites(file, async () => { const out = []; for (let i = 0; i < 6; i++) out.push((await m.ensureRunning()).session || null); return out; });   // the LADDER: six calls by the page itself
      srv.close();
      return { sessions: x.r, asked: rec.asked.length - a0, flushes: rec.flushes - f0, waits: rec.durables - d0, mainWrites: x.seen.length, before: a0 };
    };
    const v1 = await ladder(require(path.join(REPO, VN)));
    ok(v1.sessions.every((s) => s === 'no-reply') && v1.flushes === 0 && v1.waits === 0 && v1.asked <= 1 && v1.mainWrites === 0, 'V1 vnc.json: SIX ladder calls with no reply over a store with a write OWED — no synchronous landing and no wait on one, at most one write asked, nothing written by the main thread', v1);
    let x1 = null, y1 = null; try { x1 = await ladder(copyOf(VN, [["  /** B-956d: the display this Desktop took, for the next boot's adoption. */\n  _record(pid, sessionNoReply = null) {\n    // B-574d «doors-small-state» (主开发 r4867 / r4874, lane nl-mounts): vnc.json rides THE STORE WRITER on EVERY road (r4874: the Desktop\n    // window's reconnect ladder calls the start by itself — up to six times an open, exactly when nothing answers: a cadence) — its\n    // thread writes the temp, SYNCS it, renames it; the bytes made at the write, off the loop. NO WRITE WHEN NOTHING BUT THE TIME\n    // CHANGED: the record without its `at` the same as the last one asked (or read at the start) asks nothing. NO WAIT AT ALL (r4935\n    // (a)): the record is handed to the writer at once (an URGENT ask: its next write) and the route replies — the person's press and\n    // the ladder's calls alike, an X server spawned included (a ladder call after the display's program died spawns one). This run's\n    // readers answer from memory (_own, the mark this run knows: _noReplyMark); the file is the NEXT boot's. THE WRITER's CRASH\n    // WINDOW, the family's accepted cost: a hub KILLED before the record lands (a stop or a crash lands it at the exit) leaves the\n    // next start the older record — an X server spawned just before is adopted on the older (or the preferred) display, and a\n    // no-reply mark just set is lost (a reopened Desktop adopts the bare display without running the session's lookups again, until\n    // its X server is started anew). A refused landing is the writer's own line and stays owed\n    const rec = { display: this.display, port: this.port, pid: pid || null, start: pid ? procStart(pid) : null, ...(Array.isArray(sessionNoReply) && sessionNoReply.length ? { sessionNoReply } : {}) };\n    const key = recordKey(rec);\n    if (key === this._recKey) return;\n    this._recKey = key;\n    try { this._writer().dirty(this._stateFile, { name: 'vnc.write', urgent: true, produce: () => JSON.stringify({ display: rec.display, port: rec.port, pid: rec.pid, start: rec.start, at: Date.now(), ...(rec.sessionNoReply ? { sessionNoReply: rec.sessionNoReply } : {}) }) + '\\n' }); }\n    catch (e) { console.warn(`[vnc] could not record the Desktop's display (${e.message}) — a restart adopts ${this._preferred}`); }\n  }\n", "  /** B-956d: the display this Desktop took, for the next boot's adoption (tmp + rename: never a half-written file). */\n  _record(pid, sessionNoReply = null) {\n    try {\n      const tmp = `${this._stateFile}.tmp-${process.pid}`;\n      fs.writeFileSync(tmp, JSON.stringify({ display: this.display, port: this.port, pid: pid || null, start: pid ? procStart(pid) : null, at: Date.now(), ...(Array.isArray(sessionNoReply) && sessionNoReply.length ? { sessionNoReply } : {}) }) + '\\n');\n      fs.renameSync(tmp, this._stateFile);\n    } catch (e) { console.warn(`[vnc] could not record the Desktop's display (${e.message}) — a restart adopts ${this._preferred}`); }\n  }\n"]], 'v1-release')); } catch (e) { y1 = e.message; }   // stale-pins: kept — the base's own lines, compiled back in as the red control
    ok(!!x1 && x1.mainWrites >= 6, 'V1 RED CONTROL (the base\'s _record): every ladder call writes the record on the main thread (its own temp + rename)', x1 || y1);

    const land = async (M) => {
      const d = dirOf('vnc-land'), f = path.join(d, 'vnc.json'), asked = [];
      const spy = Object.assign({}, RW, { dirty: (fl, o) => { asked.push(o && o.name); return RW.dirty(fl, o); } });
      const m = new M.VncManager({ dataDir: d, port: 59, display: ':94', storeWriter: spy });
      m._record(process.pid);
      const lands = await landed(f), text = bytes(f) || '', j = (() => { try { return JSON.parse(text); } catch { return {}; } })();
      const again = new M.VncManager({ dataDir: d, port: 59, display: ':95', storeWriter: RW });
      return { asked, lands, display: j.display, port: j.port, pid: j.pid, newline: text.endsWith('}\n'), adopted: again.display };
    };
    const v2 = await land(require(path.join(REPO, VN)));
    ok(v2.asked.includes('vnc.write') && v2.lands && v2.display === ':94' && v2.port === 59 && v2.pid === process.pid && v2.newline && v2.adopted === ':94', 'V2 vnc.json: the record is asked of the writer («vnc.write») and lands — its bytes the base\'s (display, port, pid; a trailing newline) — and a manager made again on the folder adopts its display', v2);
    let x2 = null, y2 = null; try { x2 = await land(copyOf(VN, [["  /** B-956d: the display this Desktop took, for the next boot's adoption. */\n  _record(pid, sessionNoReply = null) {\n    // B-574d «doors-small-state» (主开发 r4867 / r4874, lane nl-mounts): vnc.json rides THE STORE WRITER on EVERY road (r4874: the Desktop\n    // window's reconnect ladder calls the start by itself — up to six times an open, exactly when nothing answers: a cadence) — its\n    // thread writes the temp, SYNCS it, renames it; the bytes made at the write, off the loop. NO WRITE WHEN NOTHING BUT THE TIME\n    // CHANGED: the record without its `at` the same as the last one asked (or read at the start) asks nothing. NO WAIT AT ALL (r4935\n    // (a)): the record is handed to the writer at once (an URGENT ask: its next write) and the route replies — the person's press and\n    // the ladder's calls alike, an X server spawned included (a ladder call after the display's program died spawns one). This run's\n    // readers answer from memory (_own, the mark this run knows: _noReplyMark); the file is the NEXT boot's. THE WRITER's CRASH\n    // WINDOW, the family's accepted cost: a hub KILLED before the record lands (a stop or a crash lands it at the exit) leaves the\n    // next start the older record — an X server spawned just before is adopted on the older (or the preferred) display, and a\n    // no-reply mark just set is lost (a reopened Desktop adopts the bare display without running the session's lookups again, until\n    // its X server is started anew). A refused landing is the writer's own line and stays owed\n    const rec = { display: this.display, port: this.port, pid: pid || null, start: pid ? procStart(pid) : null, ...(Array.isArray(sessionNoReply) && sessionNoReply.length ? { sessionNoReply } : {}) };\n    const key = recordKey(rec);\n    if (key === this._recKey) return;\n    this._recKey = key;\n    try { this._writer().dirty(this._stateFile, { name: 'vnc.write', urgent: true, produce: () => JSON.stringify({ display: rec.display, port: rec.port, pid: rec.pid, start: rec.start, at: Date.now(), ...(rec.sessionNoReply ? { sessionNoReply: rec.sessionNoReply } : {}) }) + '\\n' }); }\n    catch (e) { console.warn(`[vnc] could not record the Desktop's display (${e.message}) — a restart adopts ${this._preferred}`); }\n  }\n", "  /** B-956d: the display this Desktop took, for the next boot's adoption (tmp + rename: never a half-written file). */\n  _record(pid, sessionNoReply = null) {\n    try {\n      const tmp = `${this._stateFile}.tmp-${process.pid}`;\n      fs.writeFileSync(tmp, JSON.stringify({ display: this.display, port: this.port, pid: pid || null, start: pid ? procStart(pid) : null, at: Date.now(), ...(Array.isArray(sessionNoReply) && sessionNoReply.length ? { sessionNoReply } : {}) }) + '\\n');\n      fs.renameSync(tmp, this._stateFile);\n    } catch (e) { console.warn(`[vnc] could not record the Desktop's display (${e.message}) — a restart adopts ${this._preferred}`); }\n  }\n"]], 'v2-release')); } catch (e) { y2 = e.message; }   // stale-pins: kept — the base's own lines, compiled back in as the red control
    ok(!!x2 && x2.asked.length === 0, 'V2 RED CONTROL (the base\'s _record): its own synchronous temp + rename — the writer is never asked', x2 || y2);

    const spawnRoad = async (M) => {
      const port = await new Promise((r) => { const s0 = net.createServer().listen(0, '127.0.0.1', () => { const p = s0.address().port; s0.close(() => r(p)); }); });   // a free port: the display's program DIED, nothing listens
      const srv = net.createServer(), d = dirOf('vnc-spawn'), rec = recorder({ owed: true });
      const m = new M.VncManager({ dataDir: d, port, display: ':98', storeWriter: rec });
      m._findXvnc = async () => ({ path: '/made-up/Xvnc', known: true });
      m._spawnX = async () => { await new Promise((r) => { srv.once('error', () => r()); srv.listen(port, '127.0.0.1', r); }); return { child: { pid: process.pid }, display: ':98' }; };   // its X server answers (this process stands for it)
      m._startSession = async () => ({ noReply: NO_REPLY });
      const d0 = rec.durables, f0 = rec.flushes;
      let st = null, err = null; try { st = await m.ensureRunning(); } catch (e) { err = e.message; }   // the ladder's call: no person's press, no parameter
      srv.close();
      return { session: (st && st.session) || null, err, waits: rec.durables - d0, flushes: rec.flushes - f0, asked: rec.asked.filter((n) => n === 'vnc.write').length, urgent: rec.urgent.includes(true) };
    };
    const v4 = await spawnRoad(require(path.join(REPO, VN)));
    ok(!v4.err && v4.session === 'no-reply' && v4.asked >= 1 && v4.urgent && v4.waits === 0 && v4.flushes === 0, 'V4 vnc.json: a ladder call after the display\'s program died SPAWNS an X server over an owed store — its record handed to the writer at once (urgent), no wait on its landing, the route replies', v4);
    let x4 = null, y4 = null; try { x4 = await spawnRoad(copyOf(VN, [["    this._record(x.pid);   // B-574d (r4935): handed to the writer at once (urgent) — the start waits on no landing, whoever called it\n", "    this._record(x.pid);   // B-574d (r4935): handed to the writer at once (urgent) — the start waits on no landing, whoever called it\n    try { await this._writer().durable(this._stateFile, { timeoutMs: 5000 }); } catch { /* said by the writer; it stays owed */ }\n"]], 'v4-tip-shape')); } catch (e) { y4 = e.message; }
    ok(!!x4 && x4.waits === 1, 'V4 RED CONTROL (the cure\'s earlier tip: the spawn road awaiting the landing): every caller waits on it, the ladder\'s included', x4 || y4);

    const stale = async (M) => {
      const d = dirOf('vnc-mark'), file = path.join(d, 'vnc.json');
      fs.writeFileSync(file, JSON.stringify({ display: ':96', port: 61, pid: process.pid, start: startOf(process.pid), at: 1, sessionNoReply: NO_REPLY }));   // an older record, its mark set
      const rec = recorder({ owed: true });
      const m = new M.VncManager({ dataDir: d, port: 61, display: ':96', storeWriter: rec });
      m._own = { pid: process.pid, start: startOf(process.pid) };
      m._markRecord(null);   // this run CLEARED the mark — its record still owed to the writer
      return { mark: m._noReplyMark(), asked: rec.asked.length };
    };
    const v3 = await stale(require(path.join(REPO, VN)));
    ok(v3.mark === null && v3.asked === 1, 'V3 vnc.json: the mark this run cleared is answered from memory while its record is still owed — never the older file\'s mark', v3);
    let x3 = null, y3 = null; try { x3 = await stale(copyOf(VN, [["    if (this._markRun !== undefined) return this._markRun;   // B-574d (r4874): the mark THIS run set or cleared — its record may still be owed to the writer, so the file is not asked\n", ""]], 'v3-file-first')); } catch (e) { y3 = e.message; }
    ok(!!x3 && Array.isArray(x3.mark), 'V3 RED CONTROL (the run\'s own mark taken out): the stale file answers — the cleared mark comes back', x3 || y3);
  }
} finally { /* the real writer stops below */ }

try { RW.stop(); } catch { /* stopped */ }
report();
