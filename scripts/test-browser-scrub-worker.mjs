#!/usr/bin/env node
// test-browser-scrub-worker — THE BROWSER FRAMES' SCRUB THROUGH A WORKER (lane lg-vault-file, 主开发 r1915 (b) + r2445). FAST.
// A CDP frame an agent is sent past the on-loop figure is scrubbed of the vault's values by the profile's worker
// (src/server/browser-scrub-worker.js), a smaller one on the loop (src/server/browser-dialogs.js scrubCdpFrame) — both run THE SAME
// frame scrub (src/cdp-frame-scrub.js) with THE SAME scrubber (src/vault-scrubber.js). The mediator sends a client's frames through
// ONE ordered, byte-bounded sender (src/browser-mediation.js orderedSender). The eight laws, each with its red control:
//   ① ONE IMPLEMENTATION — the same frames through the loop and the worker give the same bytes (red: a worker whose frame scrub was
//      edited on one side)
//   ② ORDER — a socket's frames leave in the order they came; a withheld one leaves its place at once (red: a sender whose ready
//      frames skip the queue); the mediator sends nothing to a client but through it (a census of its sends)
//   ③ FAIL CLOSED — a worker silent past its bound (a PLACED stall in a stand-in worker): the frame is withheld WHOLE by name (a
//      reply answered frame_withheld), the raw frame never leaves, the journal gets the profile's label and a count only; a frame
//      whose scrub ran a call past the text budget's figure is withheld whole (red: the frame scrub without that check)
//   ④ WHERE THE VALUES LIVE — no thread before the first large frame; it ends at the profile's end, a lock, an idle stretch; the
//      values reach it by message only (red: the profile's end that leaves the worker)
//   ⑤ PAST ITS BOUND: ENDED, with a floor between starts (red: a bound that leaves the worker running)
//   ⑥ THE QUEUE IS BOUNDED in bytes (red: a sender with no bound)
//   ⑦ THE ON-LOOP FIGURE: 64 KiB — at it on the loop, past it the worker (red: a 256 KiB figure)
//   ⑧ THE TEXT BUDGET (r1915 (a)) — one heads builder for the run scan and the text scrubber (red: a planted second one); a
//      call past the figure withholds the frame whole
// Stand-ins only: no browser, no real profile, no site; every value is made up at runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';   // THE ONE ASSERTION HELPER (B-1747): a swapped call throws, never a green leg

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { ok, report } = checker();
const DIR = scratchDir('browser-scrub-worker');
const MUT = mutantCopies('browser-scrub-worker', REPO);
const BD = require('../src/server/browser-dialogs.js');
const CS = require('../src/cdp-frame-scrub.js');
const M = require('../src/browser-mediation.js');
const MED = require('../src/server/cdp-mediator.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEEP = setInterval(() => { }, 1 << 30);   // the worker and its bound's timer are unref'd (they never hold a hub's exit): this suite's own loop is held alive while it waits on them
const SRC = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const SRC_BD = SRC('src/server/browser-dialogs.js'), SRC_CS = SRC('src/cdp-frame-scrub.js'), SRC_M = SRC('src/browser-mediation.js'), SRC_W = SRC('src/server/browser-scrub-worker.js'), SRC_MED = SRC('src/server/cdp-mediator.js');

const PID = 'bp-made-up-1', LABEL = 'A made-up profile';
const VALUE = 'Vz' + crypto.randomBytes(9).toString('hex') + 'Q';   // made up: a «filled login value» the frames must never carry
const logs = [];
const L = { log: (l) => logs.push(String(l)), info: (l) => logs.push(String(l)), warn: (l) => logs.push(String(l)), error: (l) => logs.push(String(l)) };
const made = [];
function mk(mod = BD, figs = {}, extra = {}) {
  const d = mod.create({ keeper: null, log: L, labelOf: () => LABEL, scrubFigures: figs, ...extra });
  d._recordScrubSecret(PID, 'made-up-login', VALUE, { persist: false });
  made.push(d);
  return d;
}
const pad = (n) => 'p'.repeat(Math.max(0, n));
/** a frame of `bytes` bytes (ASCII), its page text carrying the value at `at` */
const bigFrame = (bytes, { id = 11, sessionId = 'S1', withValue = true } = {}) => {
  const head = { id, result: { result: { type: 'string', value: '' } }, sessionId };
  const shell = JSON.stringify(head).length;
  const body = withValue ? `text ${VALUE} more ` : 'text ';
  head.result.result.value = body + pad(bytes - shell - body.length);
  const s = JSON.stringify(head);
  return s;
};
// the stand-in workers (law 8): a STALL (the hold is a placed stall — it takes the values and never answers a frame)
const STALL = path.join(DIR, 'stall-worker.cjs');
fs.writeFileSync(STALL, "'use strict';\nconst { parentPort } = require('worker_threads');\nparentPort.on('message', (msg) => { if (msg && msg.ev === 'memory') return; /* a placed stall: no frame is ever answered */ });\n");

console.log('① ONE IMPLEMENTATION — the loop and the worker: the same frames, the same bytes');
{
  const FRAMES = [
    JSON.stringify({ id: 1, result: { value: `a ${VALUE} b` }, sessionId: 'S1' }),
    JSON.stringify({ method: 'Runtime.consoleAPICalled', params: { args: [{ type: 'string', value: VALUE }], [VALUE]: 1 } }),
    JSON.stringify({ id: 2, result: { html: `<b>${VALUE.split('').join('')}</b> ${encodeURIComponent(VALUE)}` } }),
    JSON.stringify({ method: 'Network.requestWillBeSent', params: { requestId: 'r-1', request: { url: `https://example.invalid/p?k=${VALUE}`, method: 'POST', headers: {}, postData: `pw=${VALUE}` } } }),
    JSON.stringify({ id: 3, result: { nothing: 'to scrub here' } }),
  ];
  const loop = mk(BD, {});
  const run = async (workerFile) => {
    const d = mk(BD, { onLoopMax: 0 }, workerFile ? { scrubWorkerFile: workerFile } : {});   // every frame to the worker
    const outs = [];
    for (const f of FRAMES) { const r = d.scrubCdpFrameAsync(PID, f); const a = typeof r === 'string' ? { out: r } : await r; outs.push(a.out === undefined ? null : a.out); }
    d.endScrubWorkers('the leg ended');
    return outs;
  };
  const viaLoop = FRAMES.map((f) => loop.scrubCdpFrame(PID, f));
  const viaWorker = await run(null);
  const same = viaLoop.every((o, k) => typeof o === 'string' && o === viaWorker[k]);
  const clean = viaLoop.every((o) => !o.includes(VALUE));
  const keyEdit = MUT.write('src/cdp-frame-scrub.js', anchored(SRC_CS, "const nk = (isTop && CDP_ENVELOPE_KEYS.has(k)) ? k : fn(k);", 'const nk = k;', 'test-browser-scrub-worker ① a one-sided edit', { count: 2 }), 'one-sided-edit');
  const redWorker = MUT.write('src/server/browser-scrub-worker.js', anchored(SRC_W, "require('../cdp-frame-scrub.js')", `require(${JSON.stringify(keyEdit)})`, 'test-browser-scrub-worker ① the red worker'), 'red-worker');
  const viaRed = await run(redWorker);
  const redDiffers = viaLoop.some((o, k) => o !== viaRed[k]);
  ok(same && clean && redDiffers, `① ONE IMPLEMENTATION: ${FRAMES.length} frames (a reply, a key, a page's spelled forms, a request's url and body, a clean one) give the same bytes on the loop and through the worker, and none carries the value; red control: «a worker whose frame scrub was edited on one side» (keys left unscrubbed — both of the walk's key lines) differs`, { same, clean, redDiffers });
}

console.log('② ORDER — one ordered sender a client; the mediator sends through it alone');
{
  const leg = (mod) => new Promise((resolve) => {
    const sent = [];
    const S = mod.orderedSender({ send: (t) => sent.push(t), maxBytes: 1 << 20, withheld: (why, reply) => (reply ? `refused:${reply.id}` : null) });
    let rB, rD;
    S.post('A', 1);
    S.post(new Promise((r) => { rB = r; }), 1);
    S.post('C', 1, null);
    S.post(new Promise((r) => { rD = r; }), 1, { id: 7 });
    S.post('E', 1);
    rD({ withheld: 'a placed answer' });
    setTimeout(() => { rB({ out: 'B' }); setTimeout(() => resolve(sent.join(',')), 20); }, 20);
  });
  const real = await leg(M);
  const skip = MUT.load('src/browser-mediation.js', anchored(SRC_M, "if (typeof r === 'string' && !q.length) { send(r); return; }", "if (typeof r === 'string') { send(r); return; }", 'test-browser-scrub-worker ② ready frames skip the queue'), 'ready-skip');
  const red = await leg(skip);
  ok(real === 'A,B,C,refused:7,E' && red !== real, `② ORDER: the frames leave as they came (${real}) — a frame waiting for its scrub holds those behind it, and a withheld reply leaves its refusal in its place; red control: «ready frames skip the queue» sends ${red}`, { real, red });
  const sends = (t) => { const w = t.slice(t.indexOf('  function wire(g, p, ws, up) {'), t.indexOf('  function listen() {')); return { ws: (t.match(/(?<![\w.])ws\.send\(/g) || []).length, conn: (t.match(/conn\.ws\.send\(/g) || []).length, through: /M\.orderedSender\(\{ send: \(t\) => ws\.send\(t\)/.test(w) }; };
  const c = sends(SRC_MED), planted = sends(SRC_MED.replace('    const sendOwn = (str) =>', "    const stray = () => ws.send('x');\n    const sendOwn = (str) =>"));
  ok(c.ws === 1 && c.conn === 0 && c.through && planted.ws === 2, `② the mediator's client sends: ONE ws.send (the ordered sender's own), none through conn.ws — every other frame is sendClient / sendOwn; red control: a planted stray send counts ${planted.ws}`, { c, planted });
}

console.log('③ FAIL CLOSED — a worker silent past its bound; a frame past the figure');
{
  logs.length = 0;
  const d = mk(BD, { onLoopMax: 1024, boundMs: 250, floorMs: 0 }, { scrubWorkerFile: STALL });
  const F = bigFrame(4096, { id: 5, sessionId: 'S5' });
  const sent = [];
  const S = M.orderedSender({ send: (t) => sent.push(t), maxBytes: 1 << 24, withheld: (why, reply) => (reply && reply.id != null ? JSON.stringify(M.refusal(reply.id, MED.FRAME_WITHHELD_CODE, MED.frameWithheldWords(why), reply.sessionId)) : null) });
  S.post(d.scrubCdpFrameAsync(PID, F), F.length, { id: 5, sessionId: 'S5' });
  for (let k = 0; k < 150 && !sent.length; k++) await sleep(10);
  const got = sent[0] ? JSON.parse(sent[0]) : null;
  const named = !!(got && got.id === 5 && got.sessionId === 'S5' && M.refusalCodeOf(got) === MED.FRAME_WITHHELD_CODE);
  const noRaw = sent.every((t) => !t.includes(VALUE) && !t.includes('more p'));
  const line = logs.find((l) => l.includes('withheld whole')) || '';
  const journal = line.includes(LABEL) && /\b1 CDP frame/.test(line) && !line.includes(VALUE) && !line.includes('text ');
  ok(named && noRaw && journal, `③ FAIL CLOSED: a worker silent past its bound (a placed stall, bound 250 ms) — the reply is answered frame_withheld BY NAME once the bound ended the worker (id and session kept: the driver never waits), the raw frame never leaves, and the journal says the profile's label and a count only («${line.slice(0, 160)}»)`, { got, line });
  // a frame whose scrub ran a call past the text budget's figure: withheld whole (the scrubber's `overs` moved during the frame)
  let o = 0;
  const overFn = Object.assign((t) => { if (typeof t === 'string' && t.includes('over-me')) o++; return t; }, { spelled: (t) => t });
  Object.defineProperty(overFn, 'overs', { get: () => o });
  const r1 = CS.scrubFrame(JSON.stringify({ id: 1, result: { v: 'over-me' } }), { fn: overFn });
  const r2 = CS.scrubFrame(JSON.stringify({ id: 2, result: { v: 'fine' } }), { fn: overFn });
  const noCheck = MUT.load('src/cdp-frame-scrub.js', anchored(SRC_CS, "  if (fn && typeof fn.overs === 'number' && fn.overs > o0) return { ...r, out: null, changed: true, withheld: 'a text of it ran past the scrub\\'s figure' };\n", '', 'test-browser-scrub-worker ③ no figure check'), 'no-figure-check');
  const r0 = noCheck.scrubFrame(JSON.stringify({ id: 1, result: { v: 'over-me' } }), { fn: overFn });
  ok(r1.out === null && !!r1.withheld && r2.out !== null && !r2.withheld && r0.out !== null, '③ a frame whose scrub ran ONE call past the text budget\'s figure is withheld WHOLE (out null, the why said); a frame within it passes; red control: «the frame scrub without that check» sends it', { r1: r1.withheld, r0: !!r0.out });
}

console.log('④ WHERE THE VALUES LIVE — started by the first large frame; ended at the profile\'s end, a lock, idle; values by message');
{
  const d = mk(BD, { onLoopMax: 1024, floorMs: 0, idleMs: 300 });
  const before = d.scrubWorkerFacts(PID).live;
  d.scrubCdpFrameAsync(PID, bigFrame(512));   // under the figure: on the loop, no thread
  const afterSmall = d.scrubWorkerFacts(PID).live;
  await d.scrubCdpFrameAsync(PID, bigFrame(4096));
  const afterLarge = d.scrubWorkerFacts(PID).live;
  d._endProfileFences(PID, null);
  const afterEnd = d.scrubWorkerFacts(PID).live;
  d._recordScrubSecret(PID, 'made-up-login', VALUE, { persist: false });
  await d.scrubCdpFrameAsync(PID, bigFrame(4096));
  const again = d.scrubWorkerFacts(PID).live;
  d.endScrubWorkers('a lock');
  const afterLock = d.scrubWorkerFacts(PID).live;
  await d.scrubCdpFrameAsync(PID, bigFrame(4096));
  const third = d.scrubWorkerFacts(PID).live;
  await sleep(700);
  const afterIdle = d.scrubWorkerFacts(PID).live;
  const leaves = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, "    endScrubWorker(String(pid), 'the profile ended');", '', 'test-browser-scrub-worker ④ the profile\'s end leaves the worker'), 'end-leaves-worker');
  const dr = mk(leaves, { onLoopMax: 1024, floorMs: 0 });
  await dr.scrubCdpFrameAsync(PID, bigFrame(4096));
  dr._endProfileFences(PID, null);
  const redLive = dr.scrubWorkerFacts(PID).live;
  dr.endScrubWorkers('the leg ended');
  const site = SRC_BD.match(/new Worker\(([^\n]*?)\);/);
  const byMessage = !!site && site[1] === "scrubWorkerFile || require('path').join(__dirname, 'browser-scrub-worker.js')" && !/workerData|env:|argv:/.test(site[0]);
  ok(!before && !afterSmall && afterLarge && !afterEnd && again && !afterLock && third && !afterIdle && redLive && byMessage,
    '④ WHERE THE VALUES LIVE: no thread before a large frame (nor for a small one); the first large frame starts it; it ends at the profile\'s end, at a lock, after an idle stretch; the worker is made with its file alone (the values reach it by message: no workerData, env or argv); red control: «the profile\'s end that leaves the worker» keeps it', { before, afterSmall, afterLarge, afterEnd, again, afterLock, third, afterIdle, redLive, site: site && site[1] });
}

console.log('⑤ PAST ITS BOUND: ENDED — a floor between starts');
{
  const leg = async (mod) => {
    const d = mk(mod, { onLoopMax: 1024, boundMs: 150, floorMs: 900 }, { scrubWorkerFile: STALL });
    const a = await d.scrubCdpFrameAsync(PID, bigFrame(4096));
    const liveAfterBound = d.scrubWorkerFacts(PID).live, started1 = d.scrubWorkerFacts(PID).startedAt;
    const b = await d.scrubCdpFrameAsync(PID, bigFrame(4096));   // inside the floor: no new start
    const started2 = d.scrubWorkerFacts(PID).startedAt;
    await sleep(950);
    const c = d.scrubCdpFrameAsync(PID, bigFrame(4096));   // past the floor: a new worker
    await sleep(20);
    const started3 = d.scrubWorkerFacts(PID).startedAt;
    await c;
    d.endScrubWorkers('the leg ended');
    return { a: a && a.withheld, liveAfterBound, b: b && b.withheld, sameStart: started1 === started2, newStart: started3 !== started2 };
  };
  const real = await leg(BD);
  const spins = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, "const timer = setTimeout(() => endScrubWorker(pid, `no answer within ${SCRUB_FIG.boundMs} ms`, s), SCRUB_FIG.boundMs);", "const timer = setTimeout(() => { const p = s.pend.get(seq); if (p) { s.pend.delete(seq); p.resolve(withheldFor(pid, 'late')); } }, SCRUB_FIG.boundMs);", 'test-browser-scrub-worker ⑤ a bound that leaves the worker running'), 'bound-spins');
  const red = await leg(spins);
  ok(!!real.a && !real.liveAfterBound && /floor/.test(String(real.b)) && real.sameStart && real.newStart && red.liveAfterBound,
    `⑤ PAST ITS BOUND: the late frame is withheld and the worker ENDED; the next large frame inside the floor is withheld by name («${real.b}») with no new start; past the floor a new worker starts; red control: «a bound that leaves the worker running» keeps it`, { real, red });
}

console.log('⑥ THE QUEUE IS BOUNDED in bytes');
{
  const leg = (mod) => {
    const sent = [];
    const S = mod.orderedSender({ send: (t) => sent.push(t), maxBytes: 100, withheld: (why, reply) => (reply ? `refused:${reply.id}` : null) });
    let release;
    S.post(new Promise((r) => { release = r; }), 60);
    S.post('x'.repeat(80), 80, { id: 9 });
    const waiting = S.bytes();
    release({ out: 'first' });
    return new Promise((r) => setTimeout(() => r({ waiting, sent: sent.join(',') }), 20));
  };
  const real = await leg(M);
  const unbounded = MUT.load('src/browser-mediation.js', anchored(SRC_M, 'if (q.length && waiting + n > maxBytes) {', 'if (false) {', 'test-browser-scrub-worker ⑥ no bound'), 'no-bound');
  const red = await leg(unbounded);
  ok(real.waiting <= 100 && real.sent === 'first,refused:9' && red.waiting > 100, `⑥ THE QUEUE IS BOUNDED: behind a frame waiting for its scrub, a frame past the bytes' bound is withheld by name (its refusal sent in its place: ${real.sent}), what waits stays ≤ the bound (${real.waiting}); red control: «a sender with no bound» holds ${red.waiting} bytes`, { real, red });
}

console.log('⑦ THE ON-LOOP FIGURE — 64 KiB');
{
  const leg = async (mod) => {
    const d = mk(mod, { floorMs: 0 });
    const at = d.scrubCdpFrameAsync(PID, bigFrame(64 * 1024));
    const atLoop = typeof at === 'string' && !d.scrubWorkerFacts(PID).live;
    const past = d.scrubCdpFrameAsync(PID, bigFrame(64 * 1024 + 1));
    const pastWorker = typeof past !== 'string' && d.scrubWorkerFacts(PID).live;
    if (typeof past !== 'string') await past;
    d.endScrubWorkers('the leg ended');
    return { atLoop, pastWorker, clean: typeof at === 'string' && !at.includes(VALUE) };
  };
  const real = await leg(BD);
  const wide = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, 'onLoopMax: 64 * 1024,', 'onLoopMax: 256 * 1024,', 'test-browser-scrub-worker ⑦ a 256 KiB figure'), 'wide-figure');
  const red = await leg(wide);
  ok(real.atLoop && real.pastWorker && real.clean && !red.pastWorker, '⑦ THE ON-LOOP FIGURE: a frame of 64 KiB is scrubbed on the loop (no thread), one byte more goes to the worker; red control: «a 256 KiB figure» keeps the larger frame on the loop', { real, red });
}

console.log('⑧ THE TEXT BUDGET (主开发 r1915 (a)) — ONE heads builder; a call past the figure withholds the frame');
{
  const SRC_VS = SRC('src/vault-scrubber.js');
  const headsCensus = (t) => {
    const hb = t.indexOf('function headsOf(texts) {'), hEnd = t.indexOf('\n}\n', hb);
    const strip = (x) => x.replace(/\/\/[^\n]*/g, '');
    const ct0 = t.indexOf('function compileTextScrubber(secrets) {'), ct = t.slice(ct0, t.indexOf('\n}\n', ct0));
    return { builders: (strip(t.slice(0, hb) + t.slice(hEnd)).match(/slice\(0, (?:SCRUB_)?HEAD\)/g) || []).length, text: /headsOf\(texts\)/.test(ct) && /resolveHead\(/.test(ct), scan: /headsOf\(texts\)/.test(t.slice(0, hb)), found: hb > 0 && ct0 > 0 };
  };
  const real = headsCensus(SRC_VS);
  const planted = headsCensus(SRC_VS.replace('function compileTextScrubber(secrets) {\n', 'function compileTextScrubber(secrets) {\n  const ownHeads = (xs) => xs.map((t) => t.slice(0, HEAD));\n'));
  ok(real.found && real.builders === 0 && real.text && real.scan && planted.builders === 1, '⑧ ONE IMPLEMENTATION of the heads: the run scan and the browser frames\' text scrubber both build them with headsOf and verify with resolveHead — no other heads builder in src/vault-scrubber.js; red control: a planted second builder in the text scrubber is counted', { real, planted });
  const VS = require('../src/vault-scrubber.js');
  const tiny = MUT.load('src/vault-scrubber.js', anchored(SRC_VS, 'const TEXT_STEPS_BASE = 1 << 20, TEXT_STEPS_A_CHAR = 64;', 'const TEXT_STEPS_BASE = 10, TEXT_STEPS_A_CHAR = 0;', 'test-browser-scrub-worker ⑧ a tiny figure'), 'tiny-figure');
  const PAIRS = [{ label: 'made-up-login', value: VALUE }];
  const F8 = JSON.stringify({ id: 8, result: { value: `a ${VALUE} b` } });
  const pass = CS.scrubFrame(F8, { fn: VS.compileTextScrubber(PAIRS) });
  const over = CS.scrubFrame(F8, { fn: tiny.compileTextScrubber(PAIRS) });
  ok(typeof pass.out === 'string' && !pass.out.includes(VALUE) && !pass.withheld && over.out === null && !!over.withheld, `⑧ THE FIGURE: within the text budget the frame is scrubbed and leaves; with a scrubber whose figure is tiny every call runs past it and the frame is withheld WHOLE («${over.withheld}»)`, { pass: pass.withheld, over: over.withheld });
}

for (const c of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 2 })) ok(c.pass, c.name, c.detail);
for (const d of made) { try { d.endScrubWorkers('the suite ended'); d.shutdown(); } catch { /* */ } }
clearInterval(KEEP);
report();
