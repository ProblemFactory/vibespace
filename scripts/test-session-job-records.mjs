#!/usr/bin/env node
// test-session-job-records — B-574d, the slice «session-and-job-records» (lane bl-jobs, 主开发 r4811): the records a conversation
// or a job leaves at its end or its birth, each written by its own temp and rename on the hub's loop with no sync, now each
// shaped by its RATE (the family's rulings: (a) a cadence or an event nobody pressed takes THE STORE WRITER; (b) a record made
// once at an END says who causes it and how often at worst; (c) a buffer nobody needs after a power loss asks no sync).
//   ① THE EXIT TOMB (src/server/session-stdout.js finishTeardown → keepTomb): A MASS STOP — N teardowns in ONE turn of the loop —
//      makes N jobs of the store writer and NO write of a tomb's meta on the loop (counted), each tomb whole on disk after the
//      writer's landing and its entry forgotten; RED the release's write (its temp and rename in the teardown) ⇒ 2N writes on the
//      loop, no job. A PLACED FAILED WRITE (the tombs folder a file) is SAID ONCE for its conversation and stays the writer's: the
//      folder back, it lands; RED the word cut ⇒ nothing said
//   ② A DEAD SOCKET'S STOPPED COPY (src/server/boot-restore.js retireDeadSocket → keepCopy): A REBOOT — N dead local conversations
//      in one boot pass — makes N writer jobs and NO write of a copy on the loop (counted), and each live meta is removed only
//      AFTER its copy landed (the copy on disk at its delete, every time); RED the release's write ⇒ 2N writes on the loop; RED the
//      delete before the landing ⇒ no copy on disk at a delete. A PLACED FAILED COPY (a folder where the copy goes) keeps its live
//      meta (never deleted), SAID ONCE; the folder gone, the copy lands and then the meta goes; RED the delete before the landing ⇒
//      the meta gone with no copy
//   ③ AN END'S RECORD (keepEnded): a Terminate's record is ON DISK when keepEnded answers, written by the writer (no write of it from
//      this thread, its async forms counted too); RED the release's write ⇒ 2 from this thread. A PLACED FAILED RECORD answers null,
//      SAID («kept nothing»), lists no stopped row and leaves no writer entry; RED its road cut ⇒ a row listed with nothing on disk
// FAST, in-process: the real engine module over scratch roots, the real store writer (its own thread).
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(10); } return !!(await fn()); };
const D = scratch('session-job-records'); fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(D, { recursive: true });
process.on('exit', () => { try { fs.rmSync(D, { recursive: true, force: true }); } catch { } });
const SW = require(path.join(ROOT, 'src/store-writer.js')).storeWriter();
const M = mutantCopies('session-job-records', ROOT);
const jobsUnder = (dir) => SW.stats().filter((s) => typeof s.file === 'string' && s.file.startsWith(dir + path.sep)).length;

// THE COUNTER: every synchronous write, rename, copy or open of THIS thread, by the paths it names (the store writer writes on its
// own thread — never counted here). Patched before any module under test is loaded.
const touched = [];
for (const k of ['writeFileSync', 'renameSync', 'copyFileSync', 'openSync', 'appendFileSync']) {
  const real = fs[k];
  fs[k] = function (...a) { touched.push({ k, paths: a.slice(0, k === 'renameSync' || k === 'copyFileSync' ? 2 : 1).map(String) }); return real.apply(this, a); };
}
// the async forms too (③: the release wrote an end's record by fs.promises from this thread — its work on the thread pool, unsynced)
for (const k of ['writeFile', 'rename', 'copyFile', 'appendFile']) {
  const real = fs.promises[k];
  fs.promises[k] = function (...a) { touched.push({ k: 'promises.' + k, paths: a.slice(0, k === 'rename' || k === 'copyFile' ? 2 : 1).map(String) }); return real.apply(this, a); };
}
const onLoopSince = (i0, dir, re) => touched.slice(i0).filter((c) => c.paths.some((p) => p.startsWith(dir + path.sep) && re.test(p))).length;

// ── the session engine (setupSessionPty's teardown), as test-exit-forensics loads it ─────────────────────────
const SS_REL = 'src/server/session-stdout.js';
const SSTXT = fs.readFileSync(path.join(ROOT, SS_REL), 'utf8');
const activeSessions = new Map();
const engineOf = (modPath, root) => require(modPath).create({
  rootDir: root, BUFFERS_DIR: path.join(root, 'buffers'), META_DIR: path.join(root, 'meta'),
  DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: '', CLAUDE_STREAM_TYPES: new Set(), _seenStreamTypes: new Set(),
  activeSessions, engine: {}, checkClaudeGoalStatus: () => { },
  broadcastToSession: () => { }, broadcastActiveSessions: () => { },
  noteModelSeen: () => { }, noteHarnessModels: () => { }, recordUsageAttribution: () => { },
  daemonPtyShim: (h) => h, agentEnv: () => process.env, sbSeenFirst: () => { },
  getDeviceMgr: () => null, getHosts: () => null, getUsageHistory: () => null, getTelemetry: () => null,
  getNoConvoRef: () => null, getDeliver: () => null, getPages: () => null, getPermissionRules: () => null,
});
/** a conversation's wrapper files as a finalized wrapper leaves them (the buffer and its meta) */
const placeWrapper = (root, id, i) => {
  const BUF = path.join(root, 'buffers'); fs.mkdirSync(BUF, { recursive: true });
  fs.writeFileSync(path.join(BUF, id + '.buf'), `line ${i}\n`);
  fs.writeFileSync(path.join(BUF, id + '.json'), JSON.stringify({ pid: 40000 + i, childExitCode: 0 }));
};
/** the REAL teardown of one conversation (setupSessionPty's onExit, cleanup on) — synchronous for a finalized wrapper */
const teardown = (eng, root, id) => {
  let exitCb = null;
  const duck = { pid: 1, onData() { }, onExit(cb) { exitCb = cb; }, write() { }, resize() { }, kill() { } };
  const session = { name: 'sjr', mode: 'terminal', backend: 'shell', clients: new Map(), buffer: '', socketPath: path.join(root, id + '.sock'), cwd: root };
  activeSessions.set(id, session);
  eng.setupSessionPty(session, id, duck, { cleanupOnExit: true });
  exitCb({ exitCode: 0 });
};
const quiet = (fn) => { const orig = console.log; console.log = (...a) => { const s = a.join(' '); if (!s.includes('[session] exited')) orig(...a); }; try { return fn(); } finally { console.log = orig; } };

console.log('— ① the exit tomb: the store writer, one job a teardown, never a write on the loop —');
const TOMB_CALL = 'keepTomb(path.join(tombDir, `${id}.meta.json`), JSON.stringify(tomb), id);';
const RELEASE_TOMB = "const tombPath = path.join(tombDir, `${id}.meta.json`), tmp = tombPath + '.tmp-' + process.pid; fs.writeFileSync(tmp, JSON.stringify(tomb)); fs.renameSync(tmp, tombPath);";
async function massStop(modPath, tag, n = 24) {
  const root = path.join(D, tag); fs.mkdirSync(root, { recursive: true });
  const eng = engineOf(modPath, root);
  const TD = path.join(root, 'data', 'exit-tombs');
  const ids = Array.from({ length: n }, (_, i) => `sess-sjr-${tag}-${i}`);
  ids.forEach((id, i) => placeWrapper(root, id, i));
  const i0 = touched.length;
  quiet(() => { for (const id of ids) teardown(eng, root, id); });   // ONE turn of the loop: a mass stop
  const onLoop = onLoopSince(i0, TD, /\.meta\.json/), jobs = jobsUnder(TD);
  const files = ids.map((id) => path.join(TD, id + '.meta.json'));
  const landed = await until(() => files.every((f) => fs.existsSync(f)) && jobsUnder(TD) === 0, 8000);
  let whole = 0; for (const f of files) { try { const t = JSON.parse(fs.readFileSync(f, 'utf8')); if (t.wrapperFate === 'finalized' && Number.isFinite(t.exitedAt)) whole++; } catch { } }
  const temps = fs.existsSync(TD) ? fs.readdirSync(TD).filter((f) => /\.tmp/.test(f)).length : -1;
  return { n, onLoop, jobs, landed, whole, temps, left: jobsUnder(TD) };
}
{
  const real = await massStop(path.join(ROOT, SS_REL), 'tomb');
  ok(real.onLoop === 0 && real.jobs === real.n, `① a MASS STOP (${real.n} teardowns in one turn of the loop): ${real.jobs} jobs of the store writer, ${real.onLoop} writes of a tomb's meta on the loop`, real);
  ok(real.landed && real.whole === real.n && real.temps === 0 && real.left === 0, '① …each tomb is whole on disk after the writer\'s landing (the wrapper\'s meta + the teardown\'s facts), no temp left, the writer\'s entries forgotten', real);
  const red = await massStop(M.write(SS_REL, anchored(SSTXT, TOMB_CALL, RELEASE_TOMB, 'red-tomb-on-loop'), 'tomb-on-loop'), 'tomb-red');
  ok(red.onLoop === 2 * red.n && red.jobs === 0, `RED (the release's write: its temp and rename in the teardown) ⇒ ${red.onLoop} writes on the loop for ${red.n} teardowns, ${red.jobs} jobs`, red);
}
async function failedTomb(modPath, tag) {
  const root = path.join(D, tag); fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const TD = path.join(root, 'data', 'exit-tombs');
  fs.writeFileSync(TD, 'a file where the folder goes');   // THE PLACED FAILURE: every write under it fails (ENOTDIR)
  const eng = engineOf(modPath, root);
  const id = `sess-sjr-${tag}`, file = path.join(TD, id + '.meta.json');
  placeWrapper(root, id, 1);
  const warns = [], ow = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  let owed = 0, said = 0;
  try {
    quiet(() => teardown(eng, root, id));
    await until(() => warns.some((w) => w.includes(id)), 3000);
    SW.flushSync([file]);   // a second failed attempt (the writer's retry, now): said once all the same
    said = warns.filter((w) => w.includes(`exit tomb meta for ${id} not written`)).length;
    owed = jobsUnder(TD);
  } finally { console.warn = ow; }
  fs.rmSync(TD, { force: true }); fs.mkdirSync(TD, { recursive: true });   // the folder back
  SW.flushSync([file]);
  let t = null; try { t = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { }
  return { said, owed, landed: !!(t && t.wrapperFate === 'finalized'), left: jobsUnder(TD), warns: warns.filter((w) => w.includes(id)) };
}
{
  const real = await failedTomb(path.join(ROOT, SS_REL), 'tomb-fail');
  ok(real.said === 1 && real.owed === 1, '① a PLACED FAILED WRITE (the tombs folder a file) is SAID ONCE for its conversation over two failed attempts, and stays the writer\'s (one entry owed)', real);
  ok(real.landed && real.left === 0, '① …the folder back, the writer lands it and forgets it', real);
  const mute = anchored(SSTXT, 'if (!said) { said = true; console.warn(`[session] exit tomb meta for ${id} not written yet', 'if (!said) { said = true; void (`[session] exit tomb meta for ${id} not written yet', 'red-tomb-mute');
  const red = await failedTomb(M.write(SS_REL, mute, 'tomb-mute'), 'tomb-fail-red');
  ok(red.said === 0, 'RED (the word cut) ⇒ the failed tomb is not said', red);
}

// ── boot-restore (the dead socket's road, an end's record), as test-dead-socket-keeps-chat-meta builds its worlds ──────────────
const BR_REL = 'src/server/boot-restore.js';
const BRTXT = fs.readFileSync(path.join(ROOT, BR_REL), 'utf8');
const UUID = (n) => `a9e10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** a scratch data dir; fake fuser / pgrep that answer «no owner» first on PATH (every socket file is DEAD to the probes) */
function world(tag) {
  const d = path.join(D, tag), W = { d, bin: path.join(d, 'bin'), SOCK: path.join(d, 'sockets'), META: path.join(d, 'meta'), BUF: path.join(d, 'buffers'), deletes: [] };
  for (const x of [W.bin, W.SOCK, W.META, W.BUF]) fs.mkdirSync(x, { recursive: true });
  for (const b of ['fuser', 'pgrep']) fs.writeFileSync(path.join(W.bin, b), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  W.add = (n) => { const sock = `cw-${n}-${1793300000000 + n}`; fs.writeFileSync(path.join(W.SOCK, sock), ''); fs.writeFileSync(path.join(W.META, sock + '.json'), JSON.stringify({ webuiSessionId: 'sess-' + sock.slice(3), createdAt: 1793300000000, name: `Kept ${n}`, cwd: '/srv/u/kiln', backend: 'antigravity', mode: 'chat', backendSessionId: UUID(n), accountId: 'agy-e0e0e0e0e0e0' })); return sock; };
  W.copy = (s) => path.join(W.META, s + '.json.stopped');
  return W;
}
const api = (modPath, W) => {
  const meta = (s) => { try { return JSON.parse(fs.readFileSync(path.join(W.META, s + '.json'), 'utf8')); } catch { return {}; } };
  return require(modPath).create({ rootDir: W.d, PORT: 0, BUFFERS_DIR: W.BUF, META_DIR: W.META, SOCKETS_DIR: W.SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
    activeSessions: new Map(), sessionCounterRef: { value: 0 }, attachToDtach: () => { }, setupSessionPty: () => { },
    readSessionMeta: meta, writeSessionMeta: (s, m) => fs.writeFileSync(path.join(W.META, s + '.json'), JSON.stringify(m)),
    // THE ORDER'S WITNESS: at each live meta's delete, is its stopped copy on disk?
    deleteSessionMeta: (s) => { W.deletes.push({ s, copy: fs.existsSync(W.copy(s)) && fs.statSync(W.copy(s)).isFile() }); try { fs.unlinkSync(path.join(W.META, s + '.json')); } catch { } },
    broadcastToSession: () => { }, broadcastActiveSessions: () => { }, refreshWebuiPids: () => { }, sbNoteServerOp: () => { }, getHosts: () => null, getDialBridge: () => null, getExitProxy: () => null, note: () => { } });
};
const said = async (fn) => { const lines = [], ol = console.log, ow = console.warn; console.log = (...a) => lines.push(a.join(' ')); console.warn = (...a) => lines.push(a.join(' ')); try { await fn(); } finally { console.log = ol; console.warn = ow; } return lines; };
const withPath = async (W, fn) => { const p0 = process.env.PATH; process.env.PATH = W.bin + ':' + p0; try { return await fn(); } finally { process.env.PATH = p0; } };
const RETIRE_NEW = /      let W = null;\n[\s\S]*?waits for the landing too\n/;
const RETIRE_RELEASE = '      try { const tmp = `${stopped}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(kept)); fs.renameSync(tmp, stopped); } catch (e) { console.warn(`    ↳ ${sockFile}: its stopped copy could not be written (${e.message}) — the meta is left as it is, never deleted`); return; }\n      deleteSessionMeta(sockFile);\n';
const AFTER_LANDING = "      const landed = W.afterLanding(stopped, () => deleteSessionMeta(sockFile), { what: 'the live meta, removed once its stopped copy landed', timeoutMs: null });";
const DELETE_FIRST = '      deleteSessionMeta(sockFile); const landed = Promise.resolve();';

console.log('— ② a dead socket\'s stopped copy: the store writer; the live meta removed only after the copy landed —');
async function reboot(modPath, tag, n = 12) {
  const W = world(tag), socks = Array.from({ length: n }, (_, i) => W.add(i + 1));
  const A = api(modPath, W);
  const i0 = touched.length;
  const lines = await withPath(W, () => said(async () => { await A.probeSockets(); A.restoreSessions(); await A.stoppedSettled(); }));
  const onLoop = onLoopSince(i0, W.META, /\.json\.stopped/);
  let whole = 0; for (const s of socks) { try { const k = JSON.parse(fs.readFileSync(W.copy(s), 'utf8')); if (k.status === 'stopped' && k.stopReason === 'dead-socket-at-boot' && k.accountId === 'agy-e0e0e0e0e0e0') whole++; } catch { } }
  const live = socks.filter((s) => fs.existsSync(path.join(W.META, s + '.json'))).length;
  return { n, onLoop, whole, live, deletes: W.deletes.length, copyAtDelete: W.deletes.filter((x) => x.copy).length, left: jobsUnder(W.META), lines: lines.filter((l) => /stopped copy/.test(l)) };
}
{
  const real = await reboot(path.join(ROOT, BR_REL), 'reboot');
  ok(real.onLoop === 0 && real.whole === real.n && real.left === 0, `② A REBOOT (${real.n} dead local conversations in one boot pass): ${real.onLoop} writes of a copy on the loop; each copy whole on disk after the writer's landing, the writer's entries forgotten`, real);
  ok(real.deletes === real.n && real.copyAtDelete === real.n && real.live === 0, '② …each LIVE META is removed only AFTER its copy landed (the copy on disk at every delete)', real);
  const rel = await reboot(M.write(BR_REL, anchored(BRTXT, RETIRE_NEW, RETIRE_RELEASE, 'red-copy-on-loop'), 'copy-on-loop'), 'reboot-red');
  ok(rel.onLoop === 2 * rel.n, `RED (the release's write: its temp and rename in the retire) ⇒ ${rel.onLoop} writes on the loop for ${rel.n} dead sockets`, rel);
  const first = await reboot(M.write(BR_REL, anchored(BRTXT, AFTER_LANDING, DELETE_FIRST, 'red-delete-first'), 'delete-first'), 'reboot-first');
  ok(first.deletes === first.n && first.copyAtDelete === 0, `RED (the live meta deleted at once, before the landing) ⇒ ${first.copyAtDelete} of ${first.deletes} deletes found the copy on disk`, first);
}
async function failedCopy(modPath, tag) {
  const W = world(tag), sock = W.add(1);
  fs.mkdirSync(W.copy(sock));   // THE PLACED FAILURE: a folder where the copy goes — its rename fails
  const A = api(modPath, W);
  const lines = await withPath(W, () => said(async () => {
    await A.probeSockets(); A.restoreSessions();
    await until(() => jobsUnder(W.META) === 1 && SW.stats().some((s) => s.file === W.copy(sock) && s.failures >= 1), 3000);
    SW.flushSync([W.copy(sock)]);   // a second failed attempt (the writer's retry, now)
  }));
  const kept = { live: fs.existsSync(path.join(W.META, sock + '.json')), owed: jobsUnder(W.META), said: lines.filter((l) => l.includes(`${sock}: its stopped copy is not written yet`)).length, deletesBefore: W.deletes.length };   // AT the failure (before the folder goes)
  fs.rmSync(W.copy(sock), { recursive: true, force: true });   // the folder gone
  SW.flushSync([W.copy(sock)]);
  let k = null; try { k = JSON.parse(fs.readFileSync(W.copy(sock), 'utf8')); } catch { }
  return { ...kept, landed: !!(k && k.status === 'stopped'), liveAfter: fs.existsSync(path.join(W.META, sock + '.json')), deletes: W.deletes, left: jobsUnder(W.META) };
}
{
  const real = await failedCopy(path.join(ROOT, BR_REL), 'copy-fail');
  ok(real.live && real.owed === 1 && real.said === 1 && real.deletesBefore === 0, '② a PLACED FAILED COPY (a folder where it goes): the live meta is LEFT AS IT IS, never deleted; said ONCE over two failed attempts; the copy stays the writer\'s', real);
  ok(real.landed && !real.liveAfter && real.deletes.length === 1 && real.deletes[0].copy && real.left === 0, '② …the folder gone, the copy lands, THEN the live meta goes; the writer keeps no entry', real);
  const red = await failedCopy(M.write(BR_REL, anchored(BRTXT, AFTER_LANDING, DELETE_FIRST, 'red-delete-first-fail'), 'delete-first-fail'), 'copy-fail-red');
  ok(!red.live && red.deletesBefore === 1 && !red.deletes[0].copy, 'RED (the delete before the landing) ⇒ the live meta GONE while its copy never landed', red);
}

console.log('— ③ an end\'s record: the store writer, on disk when keepEnded answers —');
const ENDED_NEW = /  let why = null, landed = false;\n[\s\S]*?kept nothing`\); return null; \}\n/;
const ENDED_RELEASE = '  const tmp = `${file}.${process.pid}.tmp`;\n  try { await fs.promises.writeFile(tmp, JSON.stringify(kept)); await fs.promises.rename(tmp, file); }\n  catch (e) { fs.unlink(tmp, () => { }); console.warn(`[end] ${sockFile}: its ended record could not be written (${e.message}) — kept nothing`); return null; }\n';
const END_META = (n) => ({ webuiSessionId: `sess-end-${n}`, backend: 'antigravity', mode: 'chat', backendSessionId: UUID(100 + n), name: `Ended ${n}`, cwd: '/srv/u/kiln' });
async function ended(modPath, tag, { place = false } = {}) {
  const W = world(tag), sock = `cw-9${tag.length}-1794880000001`, file = W.copy(sock);
  if (place) fs.mkdirSync(file);   // THE PLACED FAILURE: a folder where the record goes
  const A = api(modPath, W);
  const i0 = touched.length;
  let r;
  const lines = await said(async () => { r = await A.keepEnded(sock, END_META(1), { kind: 'person', actorId: null, name: null }); });
  const onDisk = (() => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } })();
  const rows = (await A.stoppedSessions()).filter((x) => x.backendSessionId === UUID(101));
  return { answered: !!r, onDisk: !!(onDisk && onDisk.stopReason === 'ended' && onDisk.endedBy && onDisk.endedBy.kind === 'person'), fromHere: onLoopSince(i0, W.META, /\.json\.stopped/), rows: rows.length, left: jobsUnder(W.META), said: lines.filter((l) => l.includes(`[end] ${sock}: its ended record could not be written`) && l.includes('kept nothing')).length };
}
{
  const real = await ended(path.join(ROOT, BR_REL), 'end');
  ok(real.answered && real.onDisk && real.fromHere === 0 && real.rows === 1 && real.left === 0, '③ a TERMINATE\'s record is ON DISK when keepEnded answers (who ended it, why), written by the writer — no write of it from this thread — listed once, no writer entry left', real);
  const rel = await ended(M.write(BR_REL, anchored(BRTXT, ENDED_NEW, ENDED_RELEASE, 'red-end-here'), 'end-here'), 'end-red');
  ok(rel.onDisk && rel.fromHere === 2, `RED (the release's write: its temp and rename by fs.promises from this thread, unsynced) ⇒ ${rel.fromHere} writes from this thread`, rel);
  const fail = await ended(path.join(ROOT, BR_REL), 'end-fail', { place: true });
  ok(!fail.answered && fail.said === 1 && fail.rows === 0 && fail.left === 0, '③ a PLACED FAILED RECORD (a folder where it goes): keepEnded answers null, SAID «kept nothing», no stopped row listed, no writer entry left (no retry of a record it said it did not keep)', fail);
  const cut = await ended(M.write(BR_REL, anchored(BRTXT, '  if (!landed) { try { storeWriter().forget(file); } catch { }', '  if (false) { try { storeWriter().forget(file); } catch { }', 'red-end-unsaid'), 'end-unsaid'), 'end-fail-red', { place: true });
  ok(cut.answered && cut.rows === 1 && !cut.onDisk, 'RED (the failed landing\'s road cut) ⇒ a stopped row listed with nothing on disk', cut);
}

report();
