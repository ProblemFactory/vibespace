#!/usr/bin/env node
// test-safe-fs-no-inline.mjs — B-3b03 (lane hub-loop-stalls): THE POOL NEVER RUNS A PATH OP ON THE MAIN THREAD.
//
// THE ROW (found by reading, lane bl-tests-a; the release 2.369.412 has it): src/safe-fs.js `call` ran an op INLINE in the main
// thread whenever the pool had no live worker («a last resort … keeps file browsing alive»). A hung path (a dead network mount)
// wedges every worker it is sent to; each is killed at its deadline and respawned after a backoff (500 ms, doubling while it keeps
// failing); a call that lands while every worker is between a kill and its respawn ran ON THE MAIN THREAD — and if it named the
// same dead path, the whole hub froze until the mount answered. Only one caller (the membership facts) asked `noInline`.
//
// THE SCENE (a stall placed in the worker's op as the stand-in for a hung path — no mount of any kind): the REAL pool and the
// REAL worker (src/safe-fs-worker.js; its `__sleep` op exists for this, gated by VIBESPACE_SAFEFS_TEST=1). Every worker is given
// a long stall; each overruns its short deadline, is killed and waits its respawn backoff; inside that window ONE more stall is
// asked — the shape of the folder field's next ask or the Files window's listing.
//   ① THE LAW: that call never runs on the main thread — it is REFUSED BY NAME (code `no-worker`, status 503) and the inline
//      runner is never entered; RED CONTROL: the release's inline road planted back (a copy through anchored()) ⇒ the inline
//      runner IS entered (the main thread runs the stall). The gap the main thread lost is MEASURED and printed (a count is
//      asserted, never a clock).
//   ② the pool still answers once a worker is back (the refusal is no lasting fault).
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { checker } from './lib/check.mjs';
import { anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
process.env.VIBESPACE_SAFEFS_TEST = '1';   // the worker's `__sleep` op (a placed stall); inherited by the workers it spawns
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { runOp } = require(path.join(REPO, 'src/safe-fs-worker.js'));

/** One scene over a SafeFs module: every worker wedged and killed, then ONE call inside the respawn window. */
async function scene(SF, tag) {
  let inline = 0;
  const inlineRun = (op, payload) => { inline++; return runOp(op, payload); };   // the real inline runner, counted
  const pool = new SF.SafeFs({ poolSize: 2, name: `no-inline-${tag}`, inlineRun, timeouts: { default: 15000, __sleep: 300 } });   // the law ignores `inlineRun`; the RED copy runs it
  // the main thread's gaps, measured (printed, never asserted)
  let last = Date.now(), maxGap = 0; const tick = setInterval(() => { const n = Date.now(); maxGap = Math.max(maxGap, n - last); last = n; }, 10);
  const wedged = [pool.call('__sleep', { ms: 4000 }), pool.call('__sleep', { ms: 4000 })].map((p) => p.then(() => 'answered', (e) => (e && e.safeFsTimeout ? 'deadline' : String(e && e.message))));
  const ends = await Promise.all(wedged);   // both overran their 300 ms deadline: both workers killed, respawning after ~500 ms
  const alive = pool.stats().alive;
  last = Date.now(); maxGap = 0;
  const t0 = Date.now(); let got = null;
  try { got = await pool.call('__sleep', { ms: 1500 }).then((r) => ({ ok: true, r }), (e) => ({ ok: false, code: e && e.code, status: e && e.status, message: String(e && e.message) })); }
  catch (e) { got = { ok: false, threw: String(e && e.message) }; }
  const callMs = Date.now() - t0;
  await sleep(50);
  const gap = maxGap;
  // ② a worker back: the pool answers again
  await sleep(1200);
  let after = null; try { after = await pool.call('__sleep', { ms: 1 }); } catch (e) { after = { error: String(e && e.message) }; }
  clearInterval(tick); pool.close();
  return { tag, ends, alive, got, callMs, gap, inline, after };
}

console.log('① a call while every worker respawns never runs on the main thread');
const SF = require(path.join(REPO, 'src/safe-fs.js'));
const g = await scene(SF, 'law');
console.log(`  [measure] no_inline_gap_ms=${g.gap} call_ms=${g.callMs} inline_runs=${g.inline} (the law: no inline run)`);
ok(g.ends.every((x) => x === 'deadline') && g.alive === 0 && g.inline === 0 && g.got && g.got.ok === false && g.got.code === 'no-worker' && g.got.status === 503,
  `every worker killed at its deadline (${g.ends.join(', ')}; alive ${g.alive}): the next call is REFUSED BY NAME (${g.got && g.got.code}, ${g.got && g.got.status}) — the inline runner entered ${g.inline} times`, JSON.stringify(g));
// RED CONTROL: the release's inline road planted back (a copy through anchored()) — the main thread runs the stall
const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
const LAW = "      return Promise.reject(noWorkerRefusal(this.name === 'safe-fs' ? 'the file pool' : `the ${this.name} pool`));   // the hub's file pool is the unnamed one\n";
const RELEASE = `      if (opts.noInline) return Promise.reject(Object.assign(new Error('no live SafeFs worker'), { code: 'no-worker' }));\n      try { return Promise.resolve((this._opts.inlineRun || require('./safe-fs-worker').runOp)(op, payload)).then(r => r.result); }\n      catch (e) { return Promise.reject(e); }\n`;   // stale-pins: kept — the release's inline road, planted back
const SFr = src.split(LAW).length === 2 ? mutantCopies('safe-fs-no-inline', REPO).load('src/safe-fs.js', anchored(src, LAW, RELEASE, 'release-inline'), 'release-inline') : null;
const r = SFr ? await scene(SFr, 'release') : null;
if (r) console.log(`  [measure] release_inline_gap_ms=${r.gap} call_ms=${r.callMs} inline_runs=${r.inline} (the release: the main thread ran the stall)`);
ok(src.split(LAW).length === 2 && !!r && r.ends.every((x) => x === 'deadline') && r.alive === 0 && r.inline === 1 && r.got && r.got.ok === true,
  `RED CONTROL (the release's inline road): the same call RAN ON THE MAIN THREAD (inline runs ${r && r.inline})`, JSON.stringify(r));


console.log('② the refusal is no lasting fault');
ok(!!g.after && !g.after.error, `a worker back (after its backoff): the pool answers again (${JSON.stringify(g.after)})`);

console.log('③ the census: no pool keeps an inline road; a missing pool refuses too; the refusal is worded');
{
  const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  // comment LINES out (a why may name the old road) — never a /*…*/ match across lines: a '/*' inside a string (server.js has one) ate
  // real code, and the census read 7 builders of 8 (its first gate)
  const code = (src) => src.replace(/^\s*(?:\/\/|\/\*|\*).*$/gm, '');
  const srcFiles = ['server.js']; const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (e.name.endsWith('.js')) srcFiles.push(r); } };
  walk('src');
  // (a) EVERY file of src/ and server.js that builds a SafeFs (the release's seven inline roads: the file pool's default, the transcript
  // pool, the transcript-picture pool, the mount canary, the incident freeze, the sessions sweep's belt, the agy cards' belt) — none
  // passes an inline runner, and the pool reads none
  const builders = srcFiles.filter((f) => /\bSafeFs\(\{|\bSafeFs\)\(\{/.test(code(read(f))));
  const inl = builders.filter((f) => /inlineRun\s*[:,(]|_inlineRun\b|opts\.inlineRun/.test(code(read(f)))).concat(/inlineRun/.test(code(read('src/safe-fs.js'))) ? ['src/safe-fs.js'] : []);
  ok(!inl.length && builders.length >= 8, `no SafeFs in src/ or server.js keeps an inline road (${srcFiles.length} files read, ${builders.length} build a pool; left: ${inl.join(', ') || 'none'})`);
  // (b) EVERY require of a worker's op set (a src/ file named *-worker.js — the ops a pool runs off the loop) from a file that is not
  // that worker: each is a ROW with its guard on the same line — the device bundle (no worker script) runs in place, as the release's
  // inline runner did there; the hub's checkout always has the script, so the hub never runs one in-main
  const workers = srcFiles.filter((f) => /-worker\.js$/.test(f)).map((f) => path.basename(f, '.js'));
  const ROWS = {
    'src/adapters/codex.js': 'if (!_workerScript) return (_inPlace ||= { inPlace: true,',   // the device's codex / claude readers (B-299b A2's MUST-2: its task scan)
    'src/transcript-service.js': 'if (!fs.existsSync(PICTURE_WORKER)) return (_picturePool = { inPlace: true,',   // the device's picture op (answers «unavailable» there)
    'src/store-writer.js': "const W = () => require('./store-writer-worker.js');",   // no SafeFs: the store writer's own main-thread road (B-48a4)
  };
  const reqRe = new RegExp(`require\\(\\s*(?:path\\.join\\([^)]*?)?['"\`][^'"\`]*\\b(?:${workers.join('|')})(?:\\.js)?['"\`]`);
  const sites = []; for (const f of srcFiles) { if (workers.includes(path.basename(f, '.js'))) continue; code(read(f)).split('\n').forEach((l) => { if (reqRe.test(l)) sites.push([f, l.trim()]); }); }
  const unrowed = sites.filter(([f, l]) => !(ROWS[f] && l.includes(ROWS[f])));
  ok(workers.length >= 10 && !unrowed.length && sites.length === Object.keys(ROWS).length,
    `every require of a worker's op set (${workers.length} worker scripts) from another file is a row with its guard — ${sites.length} sites; unrowed: ${JSON.stringify(unrowed).slice(0, 400) || 'none'}`);
  // CONTROL: the census sees a plant of the release's shape (a pool's inline runner required from main) — and the path.join form
  const plant = "const { runOp } = require('../safe-fs-worker');", plant2 = "x = require(path.join(__dirname, 'transcript-worker.js'));";
  ok(reqRe.test(plant) && reqRe.test(plant2) && /inlineRun\s*[:,(]/.test('new SafeFs({ inlineRun: runOp })'), 'CONTROL: a planted require of a worker op set (literal and path.join) and a planted inline runner are seen');
  // (c) the files router with no pool at all (server.js could not start it) refuses by name — never the op in-main
  const fr = read('src/routes/files.js');
  ok(fr.includes("call: async () => { throw require('../safe-fs').noWorkerRefusal('the file pool'); },") && !fr.includes('_runOpInline'), 'the files router with no pool refuses by name (never the op in-main)');
  // (d) the words: the router says the refusal in a person's words with its code on EVERY local answer (the Files window, a file's view,
  // the folder field) — the page words the code in the reader's language
  const ops = read('src/lib/file-explorer-ops.js');
  ok(fr.includes("if (body && typeof body.error === 'string' && !body.code && body.error.startsWith(FILE_POOL_REFUSED)) body = { ...body, error: STORAGE_NO_WORKER, code: 'storage_no_worker' };")
    && fr.includes("const STORAGE_NO_WORKER = 'the file readers are restarting — try again in a moment';")
    && ops.includes("if (d && d.code === 'storage_no_worker') return t('the file readers are restarting — try again in a moment');"),
    'every local answer of the files router says the refusal in true words (code storage_no_worker; zh / ja by the i18n check)');
  const nw = SF.noWorkerRefusal('the file pool');
  ok(SF.NO_WORKER && SF.NO_WORKER.code === 'no-worker' && /^no worker of the file pool is running — one did not answer in time and is restarting, or none could start$/.test(nw.message) && nw.message.length <= 120 && nw.status === 503 && nw.noWorker === undefined,
    `the refusal's own words (an agent, a log) name its pool and both causes, whole under the folder field's 120-character cut: «${nw.message}» (${nw.message.length})`);
}

report();
