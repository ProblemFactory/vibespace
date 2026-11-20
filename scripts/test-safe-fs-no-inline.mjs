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
  // (its round: the respawned worker loads and answers under a LONG deadline — a slow runner is no red; the scene's 300 ms is for the kills)
  let after = null; try { after = await pool.call('__sleep', { ms: 1 }, { timeoutMs: 15000 }); } catch (e) { after = { error: String(e && e.message) }; }
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
const LAW = "      return Promise.reject(noWorkerRefusal(this._words));   // the hub's file pool is the unnamed one: «the file pool»\n";
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
  // comment LINES out (a why may name the old road) — never a /*…*/ match across lines: a '/*' inside a line comment (server.js has one: a route
  // pattern) ate real code, and the census read 7 builders of 8 (its first gate)
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
  // (its round: the census reads WORKER modules only — the one road where a pool's op set runs on the main thread by a CALLER's own
  // rule is named here: the sessions route's first sweep when no worker ever took it, the coordinator's ruling 12:08Z)
  const ses = read('src/routes/sessions.js');
  ok(ses.split('sweepInThread(').length === 2 && ses.includes("      if (!(e && e.noWorker)) throw e;\n      out = await require('../sessions-sweep.js').sweepInThread(payload);\n"),
    'the sessions route runs its sweep in-thread ONCE, only when no worker ever took it (`noWorker`) — its own ruled road, the one caller road of its kind');
  ok(workers.length >= 10 && !unrowed.length && sites.length === Object.keys(ROWS).length,
    `every require of a worker's op set (${workers.length} worker scripts) from another file is a row with its guard — ${sites.length} sites; unrowed: ${JSON.stringify(unrowed).slice(0, 400) || 'none'}`);
  // CONTROL: the census sees a plant of the release's shape (a pool's inline runner required from main) — and the path.join form
  const plant = "const { runOp } = require('../safe-fs-worker');", plant2 = "x = require(path.join(__dirname, 'transcript-worker.js'));";
  ok(reqRe.test(plant) && reqRe.test(plant2) && /inlineRun\s*[:,(]/.test('new SafeFs({ inlineRun: runOp })'), 'CONTROL: a planted require of a worker op set (literal and path.join) and a planted inline runner are seen');
  // (c) the files router with no pool at all (server.js could not start it) refuses by name — never the op in-main
  const fr = read('src/routes/files.js');
  ok(fr.includes("return req.app.locals.safeFs || { call: async () => { throw require('../safe-fs').noWorkerRefusal('the file pool'); } };") && !fr.includes('_runOpInline'), 'the files router with no pool refuses by name (never the op in-main)');
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

console.log('④ the price of the cure, bounded: a worker ended AT ITS DEADLINE comes back at the first step; the ladder is for one that cannot START');
{
  // pure: the REAL class, its spawns recorded instead of made (a count asserted, never a clock)
  const run = (Mod) => {
    const P = new Mod.SafeFs({ poolSize: 1, name: 'price' });
    const real = P._workers[0].worker;
    const waits = []; P._spawnInto = (rec, backoff) => { waits.push(backoff); rec.worker = null; };
    const rec = P._workers[0];
    const kill = () => { rec.alive = true; rec.worker = { removeAllListeners() {}, terminate() { return Promise.resolve(); }, unref() {} }; rec.inflight.set('k', { resolve() {}, reject() {}, timer: null }); P._onTimeout(rec, 'k'); };
    for (let i = 0; i < 4; i++) kill();   // a dead path ends every fresh worker at its deadline, four times in a row
    const deadline = waits.splice(0);
    const lines = []; const was = console.error; console.error = (...a) => lines.push(a.join(' '));
    try { for (let i = 0; i < 4; i++) { rec.alive = true; rec.worker = { removeAllListeners() {} }; P._onWorkerDown(rec, new Error("Cannot find module '/nowhere/safe-fs-worker.js'")); } }
    finally { console.error = was; }
    const start = waits.splice(0);
    const told = []; const wl = console.log; console.log = (...a) => told.push(a.join(' '));
    try { P._onMessage(rec, { id: 'none' }); } finally { console.log = wl; }
    try { if (real) { real.removeAllListeners(); real.terminate(); } } catch { } P._closed = true; clearInterval(P._gauge);   // its own exit never reaches the record
    return { deadline, start, lines, told, said: P._downSaid };
  };
  const now = run(SF);
  console.log(`  [measure] waits after four deadline ends: ${now.deadline.join(', ')} ms; after four failed starts: ${now.start.join(', ')} ms`);
  ok(now.deadline.length === 4 && now.deadline.every((w) => w === 500), `four deadline ends in a row: each worker comes back at the first step (${now.deadline.join(', ')} ms) — a dead path leaves windows of ~500 ms, never 30 s`, now);
  ok(now.start.join(',') === '1000,2000,4000,8000', `a worker that cannot START climbs the ladder (${now.start.join(', ')} ms after the deadline end's first step)`, now);
  ok(now.lines.length === 1 && /^\[safe-fs\] the price pool: a worker ended 3 times in a row before it answered \(Cannot find module '\/nowhere\/safe-fs-worker\.js'\) — every call is refused by name until one answers/.test(now.lines[0]),
    `a streak of failed starts is SAID once, naming the pool and the cause («${now.lines[0] || 'nothing said'}»)`, now.lines);
  ok(now.told.length === 1 && /^\[safe-fs\] the price pool: a worker answers again$/.test(now.told[0]) && now.said === false, `the next answer says it is back, once (${now.told.join(' | ')})`, now.told);
  // RED CONTROL: the release's deadline end (no reset — the ladder climbs for a worker that DID start)
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const RESET = '    rec.backoff = 0; rec.fails = 0;\n    this._scheduleBackoff(rec);\n';
  const Rel = src.split(RESET).length === 2 ? mutantCopies('safe-fs-price', REPO).load('src/safe-fs.js', anchored(src, RESET, '    this._scheduleBackoff(rec);\n', 'release-ladder'), 'release-ladder') : null;
  const was = Rel ? run(Rel) : null;
  ok(!!was && was.deadline.join(',') === '500,1000,2000,4000', `RED CONTROL (the release's deadline end): the ladder climbs for a worker that started (${was && was.deadline.join(', ')} ms)`, was);
}

console.log('⑤ the router says the refusal in a person\'s words, with its code (no pool wired — the listing and the download)');
{
  const express = require('express');
  const app = express(); app.use(express.json());
  app.use(require(path.join(REPO, 'src/routes/files.js')));   // no app.locals.safeFs: the files router's own refusal
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = async (p) => { const r = await fetch(base + p); let j = null; try { j = await r.json(); } catch { } return { status: r.status, j }; };
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const listing = await get(`/api/files?path=${encodeURIComponent(here)}`);
    const dl = await get(`/api/download?path=${encodeURIComponent(path.join(here, 'test-safe-fs-no-inline.mjs'))}`);
    const raw = await get(`/api/file/raw?path=${encodeURIComponent(path.join(here, 'test-safe-fs-no-inline.mjs'))}`);
    const WORDS = 'the file readers are restarting — try again in a moment';
    for (const [name, r] of [['the listing', listing], ['a download', dl], ['a raw file', raw]]) {
      ok(r.status === 503 && r.j && r.j.code === 'storage_no_worker' && r.j.error === WORDS, `${name}: 503, code storage_no_worker, «${r.j && r.j.error}»`, r);
    }
  } finally { srv.close(); }
}

console.log('⑥ a save-and-close editor closes — and the CLI hears «done» — only after its save landed (the round\'s point 5, a MUST)');
{
  const DOORS_SRC = fs.readFileSync(path.join(REPO, 'src/lib/refusal-doors.js'), 'utf8');
  const MC6 = mutantCopies('refusal-doors', REPO);
  const drive = async (D) => {
    const tick = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
    // a stand-in editor: its save answers in order; `typing` changes the text while a save is out; the question answers in order
    const door = (answers, asks = [], typing = []) => {
      const st = { signals: 0, closes: 0, asked: 0, saves: 0, text: 'v1' };
      const d = D.saveCloseDoors({ save: async () => { st.saves++; const t = typing.shift(); if (t) st.text = t; return answers.shift(); }, text: () => st.text,
        signal: () => { st.signals++; }, close: () => { st.closes++; }, ready: () => true, confirmDiscard: async () => { st.asked++; const a = asks.shift(); if (a instanceof Error) throw a; return a; } });
      return { d, st };
    };
    const press = async (x) => { const r = x.d.onCloseRequest(); await tick(); if (x.st.closes && !x.closed) { x.closed = true; await x.d.onClose(); } return r; };
    // (a) EVERY ✕ SAVES FIRST: refused ⇒ asked; keep ⇒ stays; the next ✕ saves AGAIN (refused again ⇒ asked again); discard ⇒ closes, the CLI reads the file as it is
    const a = door([false, false], [false, true]);
    await press(a); const kept = { closes: a.st.closes, signals: a.st.signals, asked: a.st.asked, saves: a.st.saves };
    await press(a); const discarded = { closes: a.st.closes, signals: a.st.signals, asked: a.st.asked, saves: a.st.saves };
    // (b) NEVER A TRAP: every save refused — one ✕, one question, discard closes
    const b = door([false], [true]); await press(b); const trap = { asked: b.st.asked, closes: b.st.closes };
    // (c) typed while the save was out: it landed, but the text on screen is newer ⇒ stays; the next ✕ saves it and closes
    const c = door([true, true], [], ['v2']); await press(c); const typed1 = { closes: c.st.closes, signals: c.st.signals }; await press(c);
    const typed = { first: typed1, closes: c.st.closes, signals: c.st.signals, saves: c.st.saves };
    // (d) a save that lands at the first ✕: closes itself, «done» once
    const dd = door([true]); await press(dd); const landed = { closes: dd.st.closes, signals: dd.st.signals, asked: dd.st.asked };
    // (e) the question itself fails (a dialog error) ⇒ keep, never a close
    const e = door([false], [new Error('dialog gone')]); await press(e); const dialogGone = { closes: e.st.closes, asked: e.st.asked };
    // (f) a programmatic close (layout sync) whose save is refused: never refused, the CLI hears nothing
    const f = door([false]); await f.d.onClose();
    // (g) a ✕ while the save is out: ONE save, never two (the door's one-at-a-time)
    let release; const slow = new Promise((r) => { release = r; });
    const g = { st: { saves: 0, closes: 0, signals: 0 } };
    g.d = D.saveCloseDoors({ save: () => { g.st.saves++; return slow; }, text: () => 'v1', signal: () => { g.st.signals++; }, close: () => { g.st.closes++; }, ready: () => true, confirmDiscard: async () => false });
    g.d.onCloseRequest(); await tick(); g.d.onCloseRequest(); g.d.onCloseRequest(); release(true); await tick(); if (g.st.closes) await g.d.onClose();
    const oneAtATime = { saves: g.st.saves, closes: g.st.closes, signals: g.st.signals };
    // (h) typed while a REFUSED save was out: the window stays and nothing is asked (a late question must not take a keystroke)
    const h = door([false], [true], ['v2']); await press(h); const typedRefused = { asked: h.st.asked, closes: h.st.closes };
    // (i) the window closed another way while the save was out: no question for a window already gone
    let rel2; const slow2 = new Promise((r) => { rel2 = r; });
    const i = { st: { asked: 0, closes: 0 } };
    i.d = D.saveCloseDoors({ save: () => slow2, text: () => 'v1', signal() {}, close: () => { i.st.closes++; }, ready: () => true, confirmDiscard: async () => { i.st.asked++; return true; } });
    i.d.onCloseRequest(); await tick(); i.d.onClose(); rel2(false); await tick();
    const goneFirst = { asked: i.st.asked, closes: i.st.closes };
    return { kept, discarded, trap, typed, landed, dialogGone, programmatic: f.st.signals, oneAtATime, typedRefused, goneFirst };
  };
  const now = await drive(await import(MC6.write('src/lib/refusal-doors.js', DOORS_SRC, 'now', { esm: true, same: true })));
  ok(now.kept.closes === 0 && now.kept.signals === 0 && now.kept.asked === 1 && now.kept.saves === 1, `a refused save ASKS; «keep» keeps the window (its text and unsaved mark) — the CLI hears nothing (${JSON.stringify(now.kept)})`, now);
  ok(now.discarded.saves === 2 && now.discarded.asked === 2 && now.discarded.closes === 1 && now.discarded.signals === 1, `the next ✕ saves AGAIN first, then asks; «discard» closes once and the CLI reads the file as it is (${JSON.stringify(now.discarded)})`, now);
  ok(now.trap.asked === 1 && now.trap.closes === 1, `NEVER A TRAP: every save refused — the ✕'s question closes it on «discard» (${JSON.stringify(now.trap)})`, now);
  ok(now.typed.first.closes === 0 && now.typed.first.signals === 0 && now.typed.closes === 1 && now.typed.signals === 1 && now.typed.saves === 2, `NEVER A SILENT LOSS: text typed while the save was out keeps the window; the next ✕ saves it and closes (${JSON.stringify(now.typed)})`, now);
  ok(now.landed.closes === 1 && now.landed.signals === 1 && now.landed.asked === 0, `a save that lands at the first ✕: the window closes itself, «done» once, nothing asked (${JSON.stringify(now.landed)})`, now);
  ok(now.dialogGone.closes === 0 && now.dialogGone.asked === 1, `the question failing reads as «keep» — never a close (${JSON.stringify(now.dialogGone)})`, now);
  ok(now.programmatic === 0, `a programmatic close whose save is refused tells the CLI nothing (signals ${now.programmatic})`, now);
  ok(now.oneAtATime.saves === 1 && now.oneAtATime.closes === 1 && now.oneAtATime.signals === 1, `a ✕ while the save is out sends no second save (${JSON.stringify(now.oneAtATime)})`, now);
  ok(now.typedRefused.asked === 0 && now.typedRefused.closes === 0, `typed while a refused save was out: the window stays and NOTHING is asked — a late question never takes a keystroke (${JSON.stringify(now.typedRefused)})`, now);
  ok(now.goneFirst.asked === 0 && now.goneFirst.closes === 0, `a window closed another way while its save was out: no question for it (${JSON.stringify(now.goneFirst)})`, now);
  {   // RED CONTROL (the door without its one-at-a-time line): a ✕ while the save is out sends a second save
    const NO_PENDING = anchored(DOORS_SRC, '      if (pending) return false;                 // a save or the question is out: one at a time\n', '', 'no-one-at-a-time');
    const red2 = await drive(await import(MC6.write('src/lib/refusal-doors.js', NO_PENDING, 'no-pending', { esm: true })));
    ok(red2.oneAtATime.saves > 1, `RED CONTROL (no one-at-a-time line): a ✕ while the save is out sends another save (${red2.oneAtATime.saves})`, red2.oneAtATime);
  }
  // the question: Keep editing focused, Enter keeping — a press on Discard is the only discard (src/lib/utils.js cancelDefault)
  const UT = fs.readFileSync(path.join(REPO, 'src/lib/utils.js'), 'utf8');
  ok(UT.includes("if (cancelDefault && e.key === 'Enter') { e.preventDefault(); done(document.activeElement === okBtn); return; }") && UT.includes('setTimeout(() => (cancelDefault ? cancelBtn : okBtn).focus(), 0);') && UT.includes('if (cancelDefault) { okBtn.disabled = true; setTimeout(() => { okBtn.disabled = false; }, 1000); }')
    && fs.readFileSync(path.join(REPO, 'src/lib/code-editor.js'), 'utf8').includes("else { this.saveIndicator.textContent = '● ' + t('Unsaved'); this.saveIndicator.style.color = 'var(--yellow)'; }") && fs.readFileSync(path.join(REPO, 'src/lib/code-editor.js'), 'utf8').includes("confirmText: t('Discard'), danger: true, cancelDefault: true })"),
    'the question keeps by default: Cancel focused, Enter keeping, Discard off for its first second (cancelDefault) — only a deliberate press on Discard discards; a save over newer typing keeps the unsaved mark');
  // WIRED: the editor window asks the door at the person's ✕ and at its close; the composer words its upload through the other door
  const CE = fs.readFileSync(path.join(REPO, 'src/lib/code-editor.js'), 'utf8'), CI = fs.readFileSync(path.join(REPO, 'src/lib/chat-input.js'), 'utf8');
  ok(CE.includes("this.winInfo.onCloseRequest = (o) => (typeof prevAsk === 'function' && prevAsk(o) === false ? false : doors.onCloseRequest());") && CE.includes('      if (doors) doors.onClose();\n')
    && CE.includes('text: () => this.editorView.state.doc.toString(), signal: () => this.onSaveAndClose()') && CE.includes("confirmDiscard: () => showConfirmDialog({ title: t('Close without saving?')") && !CE.includes('this.save().then(() => this.onSaveAndClose())')   // stale-pins: kept — the release's «save, then done» must stay GONE
    && CI.includes('const words = uploadOutcomeWords(uploaded, failed, { t, fsErrorText });') && !CI.includes("couldn't be read (e.g. {name})"),
    'WIRED: the editor window asks saveCloseDoors at the ✕ and at its close (the release\'s «save, then done» is gone); the composer words its upload through uploadOutcomeWords');
  // RED CONTROL: the release's close — no veto, and «done» after any save
  const REL6 = anchored(anchored(DOORS_SRC,
    "      if (!ed.ready()) return true;              // nothing loaded yet: nothing to save\n", "      return true;   // the release: the window closes at once\n", 'release-no-veto'),
    "      if (closing) return ed.signal();           // saved (the text on screen), or discarded by the person\n      return Promise.resolve().then(() => ed.save()).then((ok) => (ok ? ed.signal() : undefined), () => undefined);\n",
    "      return Promise.resolve(ed.save()).then(() => ed.signal());   // the release: «done» whatever the save answered\n", 'release-done-anyway');
  const red = await drive(await import(MC6.write('src/lib/refusal-doors.js', REL6, 'release', { esm: true })));
  ok(red.programmatic === 1, `RED CONTROL (the release's close): a refused save still tells the CLI «done» (signals ${red.programmatic})`, red);
}

console.log('⑦ a chat upload the hub REFUSED by name is said in its words — never «couldn\'t be read» (the round\'s point 5, a MUST)');
{
  const UP_SRC = fs.readFileSync(path.join(REPO, 'src/lib/refusal-doors.js'), 'utf8');
  const MC7 = mutantCopies('refusal-doors-upload', REPO);
  const t = (k, v = {}) => k.replace(/\{(\w+)\}/g, (_, x) => String(v[x]));
  const fsErrorText = (d) => (d && d.code === 'storage_no_worker' ? 'WORDS-OF-THE-REFUSAL' : d.error);
  const run = (D) => ({
    partialRefused: D.uploadOutcomeWords([{ name: 'a' }], [{ name: 'b.png', error: 'the file readers are restarting — try again in a moment', code: 'storage_no_worker' }], { t, fsErrorText }),
    partialUnread: D.uploadOutcomeWords([{ name: 'a' }], [{ name: 'c.bin', error: 'Failed to fetch' }], { t, fsErrorText }),
    allRefused: D.uploadOutcomeWords([], [{ name: 'b.png', error: 'x', code: 'storage_no_worker' }], { t, fsErrorText }),
    allLanded: D.uploadOutcomeWords([{ name: 'a' }], [], { t, fsErrorText }),
  });
  const now = run(await import(MC7.write('src/lib/refusal-doors.js', UP_SRC, 'now', { esm: true, same: true })));
  ok(now.partialRefused === 'Uploaded 1, 1 not uploaded: WORDS-OF-THE-REFUSAL (e.g. b.png)' && now.partialUnread === "Uploaded 1, 1 couldn't be read (e.g. c.bin)" && now.allRefused === 'Upload failed: WORDS-OF-THE-REFUSAL' && now.allLanded === null,
    `a refused part says the hub's words in the reader's language; a file the page could not read says so; all landed says nothing (${JSON.stringify(now)})`, now);
  const RED7 = anchored(UP_SRC, "  if (failed.length && said) return t('Uploaded {n}, {failed} not uploaded: {msg} (e.g. {name})', { n: uploaded.length, failed: failed.length, msg: fsErrorText(said), name: said.name });\n", '', 'release-unread');
  const red = run(await import(MC7.write('src/lib/refusal-doors.js', RED7, 'release', { esm: true })));
  ok(red.partialRefused === "Uploaded 1, 1 couldn't be read (e.g. b.png)", `RED CONTROL (the release's words): the refused part reads as a file that «couldn't be read» (${red.partialRefused})`, red);
}

console.log('⑧ `idleOnly` (B-d833 H9): a call that must never wait inside a busy worker runs on an idle one, else it is refused at once');
{
  const run = async (Mod) => {
    const P = new Mod.SafeFs({ poolSize: 2, name: 'idle', timeouts: { default: 15000, __sleep: 15000 } });
    let sends = 0; const send = P._send.bind(P); P._send = (...a) => { sends++; return send(...a); };
    try {
      await P.call('__sleep', { ms: 1 });   // the worker script loaded (a first answer; both workers live since construction)
      const held = [P.call('__sleep', { ms: 300 }), P.call('__sleep', { ms: 300 })];   // every worker busy
      const s0 = sends;
      const busy = await P.call('__sleep', { ms: 1 }, { idleOnly: true }).then(() => ({ sent: true }), (e) => ({ code: e && e.code, status: e && e.status, message: String(e && e.message) }));
      const sentWhileBusy = sends - s0;
      await Promise.all(held);
      const one = P.call('__sleep', { ms: 200 });   // one busy, one idle
      const idle = await P.call('__sleep', { ms: 1 }, { idleOnly: true }).then(() => 'answered', (e) => String(e && e.code));
      await one;
      return { busy, sentWhileBusy, idle };
    } finally { P.close(); }
  };
  const now = await run(SF);
  ok(now.busy.code === 'no-idle-worker' && now.busy.status === 503 && now.sentWhileBusy === 0 && /^every worker of the idle pool is busy — the call was not sent$/.test(now.busy.message),
    `every worker busy: the idleOnly call is REFUSED at once by name (${now.busy.code}, ${now.busy.status}), never sent (${now.sentWhileBusy} sends)`, now);
  ok(now.idle === 'answered', `one worker idle: the idleOnly call runs there (${now.idle})`, now);
  const src = fs.readFileSync(path.join(REPO, 'src/safe-fs.js'), 'utf8');
  const IDLE = '    if (opts.idleOnly && rec.inflight.size) return Promise.reject(noIdleRefusal(this._words));\n';
  const Rel = src.split(IDLE).length === 2 ? mutantCopies('safe-fs-idle', REPO).load('src/safe-fs.js', anchored(src, IDLE, '', 'no-idle-option'), 'no-idle-option') : null;
  const red = Rel ? await run(Rel) : null;
  ok(!!red && red.busy.sent === true && red.sentWhileBusy === 1, `RED CONTROL (the pool without the option): the call is SENT into a busy worker and waits there (${red && red.sentWhileBusy} sends)`, red);
}

report();
