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

report();
