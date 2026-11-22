#!/usr/bin/env node
// THE OAT SWEEP NEVER BLOCKS THE LOOP — test-oat-materialize's F13, split into this HEAVY twin (B-e601 r2, lane bl-ci, 2026-11-18,
// the coordinator's ruling: the fast tier keeps a count of at most 12 rows over 10 s, and F13 was ~16 s of the fast suite's 18.4 s
// alone on the test machine). The legs and their three RED controls moved here VERBATIM; only what they read came with them
// (the store, the token shapes, nv, mutantStore). Why it is slow: 200 rows swept twice, each row an archive, a write and an fsync,
// one row per loop turn, beside a control loop as long as the sweeps — about 5 s a block on a busy disk, three blocks.
//   F13: 200 fake rows — the first sweep materializes every one, the next finds every one written; ONE row per loop turn (a WORK
//        count); the loop's longest stall across both sweeps ≤ 3 × a control loop's as long as the sweeps (RELATIVE — never an
//        absolute ms bound); not one synchronous fs call on a member path from the sweep's acts.
//   RED controls: a writer that goes synchronous on the member path (the spy sees it); a sweep that starts every row in one turn
//        (the work count reads N); the r1 sweep with every act on the loop (the stall passes 3 × the control, the count 2 × N).
// In-process, no network, no real CLI. The checker is scripts/lib/check.mjs (a swapped ok() throws).
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
const Module = require('node:module');
const { ok, report } = checker();
const T0 = Date.now(), NOW = T0;
const H = 3600e3, DAY = 24 * H;
// token shapes built at runtime, never a literal
const OAT = ['sk', '-ant-oat01-'].join('') + 'MATfake_' + 'q7R2'.repeat(12) + '-zz';
const SHAPE = { scopes: ['user:inference', 'user:profile', 'user:sessions:claude_code', 'user:mcp_servers'], subscriptionType: 'max', rateLimitTier: 'default_claude_max_20x' };
const login = (now, { dead = false, wiped = false } = {}) => ({ claudeAiOauth: wiped
  ? { accessToken: '', refreshToken: '', expiresAt: 0, refreshTokenExpiresAt: now - DAY, ...SHAPE }
  : { accessToken: 'acc-' + crypto.randomBytes(4).toString('hex'), refreshToken: 'ref-' + crypto.randomBytes(4).toString('hex'), expiresAt: now + (dead ? -2 * H : H), refreshTokenExpiresAt: now + (dead ? -H : 20 * DAY), ...SHAPE } });
const nv = async (am, v) => { const c = am.noteCliVersion(v); await am.oatFileSettled(); return c; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oat-sweep-'));
// a mutant STORE: accounts.js compiled with text replaced, its account-material / login-expiry swapped for
// mutated copies (scratch files) — null when an anchor is missing. `tmp` exists by the first call (§2).
const mutantStore = ({ acc = [], mat = [], le = [] } = {}) => {
  const patch = (rel, reps) => { let src = fs.readFileSync(path.join(REPO, rel), 'utf8'); for (const [a, b] of reps) { if (!src.includes(a)) return null; src = src.replace(a, b); } return src; };
  const accSrc = patch('src/accounts.js', acc), matSrc = patch('src/account-material.js', mat), leSrc = patch('src/login-expiry.js', le);
  if (accSrc == null || matSrc == null || leSrc == null) return null;
  const dir = fs.mkdtempSync(path.join(tmp, 'mut-'));
  const matP = path.join(dir, 'account-material.js'), leP = path.join(dir, 'login-expiry.js');
  fs.writeFileSync(matP, matSrc); fs.writeFileSync(leP, leSrc);
  const src = accSrc.split("require('./account-material.js')").join(`require(${JSON.stringify(matP)})`).split("require('./login-expiry.js')").join(`require(${JSON.stringify(leP)})`);
  const file = path.join(REPO, 'src/accounts.js');
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src, file); return m.exports;
};
const credsOf = (am, id) => path.join(am.subDir(id), '.credentials.json');
const put = (am, id, o) => fs.writeFileSync(credsOf(am, id), JSON.stringify(o), { mode: 0o600 });

console.log('F13 — the oat sweep never blocks the loop (moved from test-oat-materialize §7, B-e601 r2)');
{
  let k7 = 0;
  const mk = (M = { AccountManager }, o = {}) => new M.AccountManager({ dataDir: path.join(tmp, 'sw-' + (++k7), 'data'), ...o });
  // ── F13: the sweep never blocks the loop — fs.promises, one row per loop turn, no sync fs on a member path ──
  // (lane oat-loop-gap-bound, .270: the old `maxGap < 50` read 59.4 ms on ubuntu-latest — an absolute wall-clock bound
  // judges the runner, never the sweep.) ONE ROW PER LOOP TURN is a WORK count: the rows the sweep STARTS between two
  // turns of a ticker loop (≤ 1 — a sweep that starts them together reads N). The stall is RELATIVE: a CONTROL loop of
  // the same length in this process — as long as the two sweeps took, turns that do nothing but `await setImmediate`,
  // each half ending in the store's own roster broadcast (_notify → list(): the ONE synchronous O(rows) read a sweep
  // that moved something makes, ~2.5 ms at 200 written rows here against ~0.5 ms for the longest act turn) — and the
  // sweep's longest stall ≤ 3 × the control's. It runs right AFTER the sweeps, under the same spy, so its broadcast reads
  // the same written rows at the same cost, and a loaded runner's preemption gets the same window to land in (a control
  // of N turns is ~1 % of the sweeps' wall: 2 hogs on one CPU read the sweep 3.2 × it). A do-nothing control alone reads
  // ~0.1 ms — no K holds against it. A slower runner scales both.
  const loopMeter = () => {
    let maxGap = 0, turns = 0, last = performance.now(), on = true;
    const mark = () => { const t = performance.now(); maxGap = Math.max(maxGap, t - last); last = t; };
    const tick = () => { mark(); turns++; if (on) setImmediate(tick); };
    setImmediate(tick);
    // stop() closes the open turn: a sweep that never yields reads its whole length
    return { turn: () => turns, stop: () => { on = false; mark(); return { maxGap, turns }; } };
  };
  const f13 = async (M, N = 200, o = {}) => {
    const am13 = mk(M, o); await nv(am13, '2.1.296');
    const ids = [];
    for (let i = 0; i < N; i++) { const m = am13.createSubscription({ name: 'C' + i }).id; put(am13, m, login(NOW, { dead: true })); ids.push(m); }
    for (const m of ids) { const a = am13.get(m); a.oatEnc = am13._enc(OAT); a.oatMintedAt = Date.now(); a.oatShape = SHAPE; }
    am13._save();
    const subs = path.join(am13.dataDir, 'subs') + path.sep;
    const syncHits = [];
    const SYNC = ['readFileSync', 'writeFileSync', 'openSync', 'renameSync', 'unlinkSync', 'fsyncSync', 'statSync', 'lstatSync', 'existsSync', 'chmodSync', 'mkdirSync', 'readdirSync'];
    const keep = {};
    // (the ONE roster rebuild a sweep that moved something broadcasts — list(), the store's existing _notify path for
    // every change — reads the rows synchronously; it is outside the sweep's acts, and inside both stall figures)
    let inList = 0;
    am13.list = function (...a) { inList++; try { return Object.getPrototypeOf(this).list.apply(this, a); } finally { inList--; } };
    for (const k of SYNC) { keep[k] = fs[k]; fs[k] = function (p, ...r) { if (!inList && String(p).startsWith(subs)) syncHits.push(k); return keep[k].call(this, p, ...r); }; }
    const meter = loopMeter(), starts = [];
    am13.syncOatFile = function (...a) { starts.push(meter.turn()); return Object.getPrototypeOf(this).syncOatFile.apply(this, a); };
    let first, steady, run, ctl;
    try {
      const t0 = performance.now();
      first = await am13.syncOatFiles(); steady = await am13.syncOatFiles(); run = meter.stop();
      const took = performance.now() - t0;
      // the CONTROL: as long as the sweeps, their one broadcast each, not one act — over the rows they wrote
      const c = loopMeter();
      for (let k = 0; k < 2; k++) { const until = performance.now() + took / 2; do await new Promise((res) => setImmediate(res)); while (performance.now() < until); am13._notify(); }
      ctl = c.stop();
    } finally { if (!run) meter.stop(); delete am13.syncOatFile; delete am13.list; for (const k of SYNC) fs[k] = keep[k]; }
    const counts = {}; for (const v of Object.values(first)) counts[v] = (counts[v] || 0) + 1;
    const perTurn = {}; for (const t of starts) perTurn[t] = (perTurn[t] || 0) + 1;
    return { N, maxGap: +run.maxGap.toFixed(2), ctlGap: +ctl.maxGap.toFixed(2), turns: run.turns, starts: starts.length, rowsPerTurn: Math.max(0, ...Object.values(perTurn)), counts, steady: [...new Set(Object.values(steady))], syncHits: [...new Set(syncHits)] };
  };
  const r13 = await f13();
  ok(r13.counts.materialize === 200 && r13.steady.join() === 'written', 'F13: 200 fake rows — the first sweep materializes every one (archive + write), the next finds every one written', r13.counts);
  ok(r13.starts === 400 && r13.rowsPerTurn === 1, `F13: ONE row per loop turn — the two sweeps start ${r13.starts} row acts over ${r13.turns} turns of the loop, never more than ${r13.rowsPerTurn} between two turns`, r13);
  ok(r13.maxGap <= 3 * r13.ctlGap, `F13: the event loop's longest stall across both sweeps is ${r13.maxGap} ms ≤ 3 × the control's ${r13.ctlGap} ms (as long as the sweeps, no act, each half ending in the store's own roster broadcast over the rows they wrote — measured right after, in this process)`, r13);
  ok(r13.syncHits.length === 0, 'F13: not one synchronous fs call on a member path from the sweep\'s acts (every read / write / rename / fsync is fs.promises; the one roster broadcast after it is the store\'s existing list())', r13.syncHits);
  const mF13 = mutantStore({ mat: [['    await fh.sync();\n', '    require(\'fs\').fsyncSync(fh.fd);\n    require(\'fs\').statSync(dest + \'.never\', { throwIfNoEntry: false });\n']] });
  const r13m = mF13 ? await f13(mF13, 20) : null;
  ok(!!r13m && r13m.syncHits.length > 0, 'RED control (F13): a writer that goes synchronous on the member path is seen by the spy', r13m && r13m.syncHits);
  // a sweep that starts every row in one turn (no queue): the work count reads N — the stall cannot see it (each row's
  // start is a few µs; the longest turn is still the broadcast)
  const mF13b = mutantStore({ acc: [['      for (const id of ids) {\n        let r = null;\n', '      await Promise.all(ids.map(async (id) => {\n        let r = null;\n'], ['        await new Promise((res) => setImmediate(res));\n      }\n      if (moved) this._notify();\n', '        await new Promise((res) => setImmediate(res));\n      }));\n      if (moved) this._notify();\n']] });
  const r13b = mF13b ? await f13(mF13b) : null;
  ok(!!r13b && r13b.counts.materialize === 200 && r13b.rowsPerTurn === 200, `RED control (F13): a sweep that starts all ${r13b && r13b.N} rows in one turn reads ${r13b && r13b.rowsPerTurn} rows between two turns of the loop`, r13b);
  // the r1 shape (pool-oat-verify F13): every act ON the loop — account-material's fs.promises answered by the sync
  // calls, no turn between rows — both sweeps run in ONE turn: the stall passes 3 × the control, the count reads 2 × N
  const R1_FSP = "const fsp = (() => { const h = (fd) => ({ fd, chmod: async (m) => fs.fchmodSync(fd, m), close: async () => fs.closeSync(fd), readFile: async (o) => fs.readFileSync(fd, o), stat: async () => fs.fstatSync(fd), sync: async () => fs.fsyncSync(fd), writeFile: async (b) => fs.writeFileSync(fd, b) }); return { open: async (...a) => h(fs.openSync(...a)), chmod: async (...a) => fs.chmodSync(...a), link: async (...a) => fs.linkSync(...a), lstat: async (...a) => fs.lstatSync(...a), mkdir: async (...a) => fs.mkdirSync(...a), rename: async (...a) => fs.renameSync(...a), unlink: async (...a) => fs.unlinkSync(...a), readFile: async (...a) => fs.readFileSync(...a), copyFile: async (...a) => fs.copyFileSync(...a) }; })();\n";   // r2697: + readFile (the guards' content compare) and copyFile (no hard links) — every member account-material calls, answered by the sync call
  // …and THE DOOR OF THE r1 SHAPE (主开发 r2068 / r2097): since B-360d (d229032f4, the accounts list reads no file on the loop) the
  // store reads its sign-in facts OFF the loop through its own SafeFs worker, whose answers land on LATER turns (the hosted run read
  // «20 rows in one turn» under this mutant); the r1 shape — every act on the loop — reads them in the SAME turn, as the release did:
  // a door whose stat / realpath / read are synchronous, each answered as a resolved promise. Only this mutant takes it.
  const SYNC_DOOR = { call: async (op, a) => {
    if (op === 'stat') { const st = fs.statSync(a.path); return { isFile: st.isFile(), mtimeMs: st.mtimeMs, size: st.size }; }
    if (op === 'realpath') return fs.realpathSync(a.path);
    if (op === 'readText') return fs.readFileSync(a.path, 'utf8');
    throw Object.assign(new Error(`the r1 door has no ${op}`), { code: 'ENOSYS' });
  } };
  const mF13c = mutantStore({ mat: [['const fsp = fs.promises;\n', R1_FSP]], acc: [['        await new Promise((res) => setImmediate(res));\n      }\n      if (moved) this._notify();\n', '      }\n      if (moved) this._notify();\n']] });
  const r13c = mF13c ? await f13(mF13c, undefined, { safeFs: SYNC_DOOR }) : null;
  ok(!!r13c && r13c.counts.materialize === 200 && r13c.maxGap > 3 * r13c.ctlGap && r13c.rowsPerTurn === 400, `RED control (F13): the r1 sweep (every act on the loop) stalls it ${r13c && r13c.maxGap} ms — past 3 × its control's ${r13c && r13c.ctlGap} ms; ${r13c && r13c.rowsPerTurn} rows in one turn`, r13c);
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(`\ntest-oat-materialize-sweep: ${Date.now() - T0} ms`);
report();
