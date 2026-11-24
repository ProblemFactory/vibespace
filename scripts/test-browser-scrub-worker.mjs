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
// and the follow's (主开发 r3342):
//   ⑨ THE BOUND FROM THE TURN — a burst of frames, each under the bound alone (a placed stall), all answered (red: the bound
//      timed from the post)
//   ⑩ THE SIGNATURE ROAD — a request frame past the figure whose credential is known by its signature only: the loop notes the
//      request id the worker found (red: the worker's answer without them); at the cap of 128 an add that leaves the list's length
//      and last element as they were still reaches the worker (red: the worker refreshed by length and last element)
//   ⑪ THE MEDIATOR's REAL WIRING — a withheld browser reply answers its id and session through the real send (red: the reply's
//      identity dropped); behind a pending frame filling the bound, the mediator's own refusal still answers its id (red: its own
//      frames under the bound)
//   ⑫ PINS — the lock's subscriber ends the workers (red: a hollow subscriber); the queue's bound is 64 MiB on the real wiring
//      (red: an unbounded one)
// Stand-ins only: no browser, no real profile, no site; every value is made up at runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratchDir, anchored, freePort } from './scratch.mjs';
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
  const third = d.scrubWorkerFacts(PID).live;   // 主开发 r3342 (2): the worker's copy ends at a lock; the loop's copy is the boundary and stands until the profile ends
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
    '④ WHERE THE VALUES LIVE: no thread before a large frame (nor for a small one); the first large frame starts it; it ends at the profile\'s end, at a lock, after an idle stretch — the worker\'s copy ends at a lock; the loop\'s copy is the boundary and stands until the profile ends (r3342 (2): the next large frame after a lock starts a worker again); the worker is made with its file alone (the values reach it by message: no workerData, env or argv); red control: «the profile\'s end that leaves the worker» keeps it', { before, afterSmall, afterLarge, afterEnd, again, afterLock, third, afterIdle, redLive, site: site && site[1] });
}

console.log('⑤ PAST ITS BOUND: ENDED — a floor between starts');
{
  const leg = async (mod) => {
    const d = mk(mod, { onLoopMax: 1024, boundMs: 150, ceilingMs: 300, floorMs: 900 }, { scrubWorkerFile: STALL });   // (the ceiling: the red copy's frames to a live, stalled worker end there)
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
  const spins = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, "s.turn = setTimeout(() => endScrubWorker(pid, `no answer within ${SCRUB_FIG.boundMs} ms`, s), SCRUB_FIG.boundMs);", "s.turn = setTimeout(() => { for (const [q, p] of s.pend) { s.pend.delete(q); clearTimeout(p.timer); p.resolve(withheldFor(pid, 'late')); } }, SCRUB_FIG.boundMs);", 'test-browser-scrub-worker ⑤ a bound that leaves the worker running'), 'bound-spins');
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
  const unbounded = MUT.load('src/browser-mediation.js', anchored(SRC_M, 'if (!own && q.length && waiting + n > maxBytes) {', 'if (false) {', 'test-browser-scrub-worker ⑥ no bound'), 'no-bound');
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

console.log('⑨ THE BOUND FROM THE TURN (主开发 r3342 (3)) — a burst, each frame under the bound alone, all answered');
{
  // the stand-in (law 8): THE REAL worker behind a placed stall of 200 ms before each frame of the burst (the first frame warms it)
  const SLOW = path.join(DIR, 'slow-worker.cjs');
  fs.writeFileSync(SLOW, "'use strict';\nconst { parentPort } = require('worker_threads');\nconst nap = new Int32Array(new SharedArrayBuffer(4));\nparentPort.on('message', (msg) => { if (msg && msg.type === 'frame' && msg.seq > 1) Atomics.wait(nap, 0, 0, 200); /* a placed stall */ });\nrequire(" + JSON.stringify(path.join(REPO, 'src/server/browser-scrub-worker.js')) + ");\n");
  const leg = async (mod) => {
    const d = mk(mod, { onLoopMax: 1024, boundMs: 600, floorMs: 0 }, { scrubWorkerFile: SLOW });
    const warm = await d.scrubCdpFrameAsync(PID, bigFrame(4096, { id: 20 }));   // started and answered: no start inside the burst's turns
    const burst = await Promise.all([21, 22, 23, 24].map((id) => d.scrubCdpFrameAsync(PID, bigFrame(4096, { id }))));
    const live = d.scrubWorkerFacts(PID).live;
    d.endScrubWorkers('the leg ended');
    return { warm: !!(warm && typeof warm.out === 'string'), answered: burst.filter((a) => a && typeof a.out === 'string' && !a.out.includes(VALUE)).length, withheld: burst.filter((a) => a && a.withheld).length, live };
  };
  const real = await leg(BD);
  const fromPost = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, '      if (s.answered === seq - 1) armScrubTurn(pid, s);', "      { const t = setTimeout(() => endScrubWorker(pid, 'late', s), SCRUB_FIG.boundMs); t.unref?.(); }", 'test-browser-scrub-worker ⑨ the bound timed from the post'), 'bound-from-post');
  const red = await leg(fromPost);
  ok(real.warm && real.answered === 4 && real.withheld === 0 && real.live && red.withheld > 0, `⑨ THE BOUND FROM THE TURN: four frames posted at once to a worker that takes 200 ms over each (a placed stall), the bound 600 ms: all four answered and scrubbed, the worker still live (a frame's bound starts at its turn); red control: «the bound timed from the post» ends the worker and withholds ${red.withheld} of them`, { real, red });
}

console.log('⑩ THE SIGNATURE ROAD (主开发 r3342 (4) + (5)) — the ids the worker found are the loop\'s; the worker\'s copy moves at the cap');
{
  const madeUp = () => 'Sg' + crypto.randomBytes(10).toString('hex') + 'Z';   // made up: a credential known by its SIGNATURE only
  const reqFrame = (reqId, secret) => JSON.stringify({ method: 'Network.requestWillBeSent', params: { requestId: reqId, initiator: { type: 'other', note: pad(4096) }, request: { url: 'https://example.invalid/login', method: 'POST', headers: {}, postData: `user=a&pw=${secret}` } } });
  const world = (mod, extra = {}) => {
    let fence = null;   // the fence the module hands the mediator (setLoginFence): its isCredRequestId is the production name of the fact
    const d = mk(mod, { onLoopMax: 1024, floorMs: 0 }, { keeper: { mediator: () => ({ setLoginFence: (f) => { fence = f; } }) }, ...extra });
    return { d, noted: (id) => !!(fence && typeof fence.isCredRequestId === 'function' && fence.isCredRequestId(PID, id)) };
  };
  const half = async (workerFile) => {
    const w = world(BD, workerFile ? { scrubWorkerFile: workerFile } : {});
    const S2 = madeUp();
    w.d._recordCredSigs(PID, [CS.credSigOf(S2)]);
    const a = await w.d.scrubCdpFrameAsync(PID, reqFrame('r-sig-1', S2));
    const r = { noted: w.noted('r-sig-1'), clean: !!(a && typeof a.out === 'string' && !a.out.includes(S2)) };
    w.d.endScrubWorkers('the leg ended');
    return r;
  };
  const realHalf = await half(null);
  const unnoted = MUT.write('src/server/browser-scrub-worker.js', anchored(SRC_W, 'noted: r.noted,', 'noted: [],', 'test-browser-scrub-worker ⑩ the worker\'s answer without its ids'), 'worker-unnoted');
  const redHalf = await half(unnoted);
  ok(realHalf.noted && realHalf.clean && !redHalf.noted, '⑩ THE WORKER\'s HALF: a request frame past the figure whose body carries a credential known by its signature only — the worker redacts it and the loop NOTES its request id (the fence\'s isCredRequestId, the name the mediator asks); red control: «the worker\'s answer without its ids» leaves it unnoted', { realHalf, redHalf });
  const cap = async (mod) => {
    const w = world(mod);
    const many = Array.from({ length: 128 }, () => CS.credSigOf(madeUp()));
    w.d._recordCredSigs(PID, many);   // the list at its cap
    await w.d.scrubCdpFrameAsync(PID, bigFrame(4096));   // the worker is handed the 128
    const X = madeUp();
    w.d._recordCredSigs(PID, [CS.credSigOf(X)]);   // an add …
    w.d._recordCredSigs(PID, [many[127]]);   // … and the top recorded again: the length (128) and the last element as before
    const a = await w.d.scrubCdpFrameAsync(PID, reqFrame('r-cap-1', X));
    const r = { noted: w.noted('r-cap-1'), clean: !!(a && typeof a.out === 'string' && !a.out.includes(X)) };
    w.d.endScrubWorkers('the leg ended');
    return r;
  };
  const realCap = await cap(BD);
  const byLast = MUT.load('src/server/browser-dialogs.js', anchored(anchored(SRC_BD,
    '    const ver = scrubValuesVer.get(pid) || 0;\n    if (s.fn !== fn || s.ver !== ver) {', '    const top = sigs.length ? sigs[sigs.length - 1] : null;\n    if (s.fn !== fn || s.sigsN !== sigs.length || s.sigsTop !== top) {', 'test-browser-scrub-worker ⑩ the check by length and last element'),
    '      s.fn = fn; s.ver = ver;', '      s.fn = fn; s.sigsN = sigs.length; s.sigsTop = top;', 'test-browser-scrub-worker ⑩ the check by length and last element (its note)'), 'sigs-by-last');
  const redCap = await cap(byLast);
  ok(realCap.noted && realCap.clean && !redCap.noted && !redCap.clean, '⑩ AT THE CAP: 128 signatures, then an add and the top recorded again (the list\'s length and last element as before) — the values\' counter moved, the worker is handed them again, the new credential is redacted and its request noted; red control: «the worker refreshed by length and last element» keeps it stale (the credential leaves unredacted)', { realCap, redCap });
}

console.log('⑪ THE MEDIATOR\'s REAL WIRING (主开发 r3342 (1) + (5)) — a withheld reply answers its id; its own refusal past the bound answers');
{
  const { WebSocket, WebSocketServer } = require('ws');
  const until = async (pred, ms) => { for (let k = 0; k * 10 < ms && !pred(); k++) await sleep(10); return !!pred(); };
  const UNLISTED = 'Madeup.notInTheCensus';   // a method the census does not list: the mediator refuses it itself (sendOwn), and says so once in its journal
  const leg = async (MEDmod, waitMs) => {
    const upPort = await freePort();
    const chrome = new WebSocketServer({ port: upPort, host: '127.0.0.1' });   // a stand-in browser: answers every call
    await new Promise((r) => chrome.on('listening', r));
    chrome.on('connection', (ws) => ws.on('message', (data) => { const m = JSON.parse(String(data)); ws.send(JSON.stringify(m.method === 'Browser.getVersion' ? { id: m.id, result: { product: 'HeadlessChrome/120.0.0.0', protocolVersion: '1.3' } } : m.method === 'Target.attachToTarget' ? { id: m.id, result: { sessionId: 'S-T1' } } : { id: m.id, sessionId: m.sessionId, result: { result: { type: 'string', value: 'answered ' + m.id } } })); }));
    let mode = 'pass', release = null;
    const fence = { scrubCdpFrameAsync: (pid, str) => {   // a stand-in fence: the off-loop door alone
      if (mode === 'withhold' && str.includes('"answered ')) return Promise.resolve({ withheld: 'a placed answer' });
      if (mode === 'hold' && str.includes('"answered ')) { mode = 'pass'; return new Promise((r) => { release = () => r({ out: str }); }); }
      return str;
    } };
    const said = [];
    const med = MEDmod.create({ log: { log: (l) => said.push(String(l)), warn: (l) => said.push(String(l)) }, loginFence: fence, clientQueueMaxBytes: 100 });
    await med.listen();
    const grant = await med.grantFor({ profileId: PID, browserKey: 'k-made-up', upstream: `ws://127.0.0.1:${upPort}/devtools/browser/made-up`, targetIds: ['T1'], paused: () => false });
    const cdp = new WebSocket(grant.url);
    await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
    const got = []; cdp.on('message', (d) => got.push(JSON.parse(String(d))));
    const of = (id) => got.find((r) => r.id === id) || null;
    cdp.send(JSON.stringify({ id: 1, method: 'Target.attachToTarget', params: { targetId: 'T1', flatten: true } }));
    await until(() => !!of(1), 3000);
    mode = 'withhold';   // (a) the browser's reply on a session, withheld by the scrub
    cdp.send(JSON.stringify({ id: 2, sessionId: 'S-T1', method: 'Runtime.evaluate', params: { expression: '1' } }));
    await until(() => !!of(2), waitMs);
    mode = 'hold';   // (b) the next reply waits for its scrub and fills the bound (100 bytes) …
    cdp.send(JSON.stringify({ id: 3, sessionId: 'S-T1', method: 'Runtime.evaluate', params: { expression: '2' } }));
    await until(() => !!release, 3000);
    cdp.send(JSON.stringify({ id: 4, method: UNLISTED, params: {} }));   // … and the mediator refuses a call itself behind it
    await until(() => said.some((l) => l.includes(UNLISTED)), 3000);   // its journal line is said in the step that posts the refusal
    if (release) release();
    await until(() => !!of(3) && !!of(4), waitMs);
    const r = { attach: !!(of(1) && of(1).result), r2: of(2), r4: of(4), order: got.findIndex((x) => x.id === 3) < got.findIndex((x) => x.id === 4) };
    try { cdp.close(); } catch { /* */ } try { med.shutdown(); } catch { /* */ } try { chrome.close(); } catch { /* */ }
    return r;
  };
  const real = await leg(MED, 3000);
  const withheldReply = !!(real.r2 && real.r2.id === 2 && real.r2.sessionId === 'S-T1' && M.refusalCodeOf(real.r2) === MED.FRAME_WITHHELD_CODE);
  const ownAnswered = !!(real.r4 && real.r4.id === 4 && M.refusalCodeOf(real.r4) && M.refusalCodeOf(real.r4) !== MED.FRAME_WITHHELD_CODE && real.order);
  const noIdentity = MUT.load('src/server/cdp-mediator.js', anchored(SRC_MED, 'sendClient(JSON.stringify(out.reply), out.reply);', 'sendClient(JSON.stringify(out.reply));', 'test-browser-scrub-worker ⑪ the reply\'s identity dropped'), 'reply-no-identity');
  const redA = await leg(noIdentity, 600);
  const ownBound = MUT.load('src/server/cdp-mediator.js', anchored(SRC_MED, "postOut(t, Buffer.byteLength(t, 'utf8'), null, true);", "postOut(t, Buffer.byteLength(t, 'utf8'), null);", 'test-browser-scrub-worker ⑪ its own frames under the bound'), 'own-under-bound');
  const redB = await leg(ownBound, 600);
  ok(real.attach && withheldReply && !redA.r2, `⑪ LAW 3 ON THE REAL WIRING: a browser reply on a session that the scrub withholds is answered frame_withheld BY NAME through the mediator's real send, its id and session kept; red control: «the reply's identity dropped» leaves the driver waiting (${redA.r2 ? 'answered' : 'no answer'})`, { r2: real.r2, redA: redA.r2 });
  ok(ownAnswered && !redB.r4, `⑪ THE MEDIATOR's OWN REFUSAL behind a pending frame that fills the bound (100 bytes) is never withheld: it answers its id (${real.r4 ? M.refusalCodeOf(real.r4) : 'none'}), after the frame before it; red control: «its own frames under the bound» drops it (${redB.r4 ? 'answered' : 'no answer'})`, { r4: real.r4, order: real.order, redB: redB.r4 });
}

console.log('⑫ PINS (主开发 r3342 (5)) — the lock\'s subscriber; the queue\'s bound');
{
  const SRC_WIRE = SRC('src/server/mounts-plugins-wiring.js');
  const lockPin = (t) => (t.match(/vault\.onLock\(\(\) => \{[^\n]*?\}\);/g) || []).filter((x) => /browserDialogs\.endScrubWorkers\(/.test(x)).length;
  const hollow = SRC_WIRE.replace("browserDialogs.endScrubWorkers('a lock');", '/* nothing */');
  ok(lockPin(SRC_WIRE) === 1 && lockPin(hollow) === 0 && hollow !== SRC_WIRE, '⑫ THE LOCK: the wiring\'s ONE vault.onLock subscriber for the frame scrub ends the workers (browserDialogs.endScrubWorkers); red control: a hollow subscriber is not counted', { real: lockPin(SRC_WIRE), hollow: lockPin(hollow) });
  const qPin = (t) => /\nconst CLIENT_QUEUE_MAX_BYTES = 64 \* 1024 \* 1024;\n/.test(t) && /\{ clientQueueMaxBytes = CLIENT_QUEUE_MAX_BYTES\b/.test(t) && /M\.orderedSender\(\{ send: \(t\) => ws\.send\(t\), maxBytes: clientQueueMaxBytes, withheld: withheldOut \}\)/.test(t);
  const unbounded = SRC_MED.replace('maxBytes: clientQueueMaxBytes, withheld: withheldOut', 'maxBytes: Infinity, withheld: withheldOut');
  ok(qPin(SRC_MED) && MED.CLIENT_QUEUE_MAX_BYTES === 64 * 1024 * 1024 && !qPin(unbounded) && unbounded !== SRC_MED, '⑫ THE QUEUE\'s BOUND: 64 MiB (CLIENT_QUEUE_MAX_BYTES), the create\'s default, passed to the ordered sender on the real wiring (⑪ shows it acting there); red control: an unbounded sender is not pinned', { fig: MED.CLIENT_QUEUE_MAX_BYTES });
}

for (const c of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 2 })) ok(c.pass, c.name, c.detail);
for (const d of made) { try { d.endScrubWorkers('the suite ended'); d.shutdown(); } catch { /* */ } }
clearInterval(KEEP);
report();
