#!/usr/bin/env node
// test-browser-cmd-scrub — A BROWSER COMMAND's OUTPUT IS SCRUBBED OFF THE LOOP (row B-360d, lane mask-value-shape, 主开发 r4523 / r4528).
// FAST. The browser CLI (data/bin/vibespace-browser) posts a verb's whole output (`out`, `err`, up to 16 MiB each) to the audit route
// when the profile holds scrub values; src/server/browser-dialogs.js scrubOutput scrubs it. A half past THE ON-LOOP FIGURE (64 KiB,
// the frames' own) is ONE «text» job on the profile's scrub worker (src/server/browser-scrub-worker.js), in the frames' own queue,
// with the same compiled scrubber and values; a half of 64 KiB or less stays on the loop, as the release scrubbed it.
//   (a) ONE ANSWER — byte for byte the release's scrubOutput, both halves, sizes either side of the figure, a value split across it
//   (b) OFF THE LOOP — a count: no call of the loop's compiled scrubber for a half past the figure (RED: the release's road)
//   (c) NEVER RAW, NEVER THE LOOP — a lost worker, a silent one (a PLACED stall on a held message), one over its work bound: refused by
//       name (RED «answered raw»; RED «scrubbed on the loop after the worker failed»); the journal: a label and a count only
//   (d) THE FLOOR WAITS — a half that meets the floor between starts waits for its end and is answered (RED: refused at once)
//   (e) ORDER — the two halves of one command and two commands of one profile come back in the order asked
//   (f) THE WORDS AND THE WAIT — the route answers scrub_refused with its why and the sizes; the CLI says what happened and what to
//       do; the CLI's own wait (90 s) is longer than the hub's ceiling (60 s) and its floor (5 s); a CLI that gives up first prints
//       cli-call's expiry line by name and nothing of the output (a placed stall)
//   (g) WHAT STAYS ON THE LOOP, PRINTED (never judged): the route's parse of a body of two 16 MiB halves and the post of a half to
//       the worker
// Stand-ins only: no browser, no real profile, no site; every value is made up at runtime.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';   // THE ONE ASSERTION HELPER (B-1747): a swapped call throws, never a green leg
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { ok, report } = checker();
const DIR = scratchDir('browser-cmd-scrub');
const MUT = mutantCopies('browser-cmd-scrub', REPO);
const KEEP = setInterval(() => { }, 1 << 30);   // the worker and its timers are unref'd: this suite's own loop is held alive while it waits
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SRC = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const SRC_BD = SRC('src/server/browser-dialogs.js'), SRC_RT = SRC('src/routes/browser.js'), SRC_CLI = SRC('data/bin/vibespace-browser');

// (b)'s count: every call of the LOOP's compiled scrubber (the worker compiles its own in its thread — never counted here)
const VRmod = require('../src/vault-run.js');
const compileReal = VRmod.compileTextScrubber;
let loopCalls = 0;
VRmod.compileTextScrubber = (pairs) => { const fn = compileReal(pairs); const w = (t) => { loopCalls++; return fn(t); }; w.spelled = fn.spelled; Object.defineProperty(w, 'overs', { get: () => fn.overs }); return w; };
const BD = require('../src/server/browser-dialogs.js');

const PID = 'bp-made-up-2', LABEL = 'A made-up profile';
const VALUE = 'Wq' + crypto.randomBytes(9).toString('hex') + 'K';   // made up: a «filled login value» an output must never carry
const VIEWS = [VALUE, [...VALUE].map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join(''), [...VALUE].map((c) => `&#${c.charCodeAt(0)};`).join(''), [...VALUE].map((c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()).join('')];
const logs = [];
const L = { log: (l) => logs.push(String(l)), info: (l) => logs.push(String(l)), warn: (l) => logs.push(String(l)), error: (l) => logs.push(String(l)) };
function mk(mod = BD, figs = {}, extra = {}) {
  const d = mod.create({ keeper: null, log: L, labelOf: () => LABEL, scrubFigures: figs, ...extra });
  d._recordScrubSecret(PID, 'made-up-login', VALUE, { persist: false });
  return d;
}
const T = { profileId: PID };
const pad = (n, ch = 'x') => ch.repeat(Math.max(0, n));
/** a text of `bytes` bytes (ASCII) with the value's views in it; `splitAt`: the plain value placed so the byte `splitAt` falls inside it */
const textOf = (bytes, { splitAt = null } = {}) => {
  const views = 'a ' + VIEWS.join(' b ') + ' c\n';
  if (splitAt != null) { const head = pad(splitAt - 4); const s = head + VALUE + ' ' + views; return s + pad(bytes - s.length); }
  return views + pad(bytes - views.length);
};
const carries = (s) => typeof s === 'string' && VIEWS.some((v) => s.includes(v));
const RELEASE = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, '    if (big(o0) || big(e0)) {', '    if (false) {', 'test-browser-cmd-scrub: the release\'s road (every half on the loop)'), 'release-road');
const ends = [];
const done = (d) => { try { d.endScrubWorkers('the leg ended'); } catch { } };

console.log('(a) ONE ANSWER — byte for byte the release\'s scrubOutput, both halves, either side of the figure');
{
  const F = 64 * 1024;
  const CASES = [
    { out: textOf(F + 6000, { splitAt: F }), err: textOf(1500) },   // out past the figure, a value split across it; err on the loop
    { out: textOf(9000), err: textOf(F + 40000) },                  // err past the figure
    { out: textOf(F + 1), err: textOf(F + 1) },                     // both one byte past it
    { out: textOf(F), err: textOf(2000) },                          // both at or under it: the loop, as the release
  ];
  const d = mk(BD), rel = mk(RELEASE);
  const got = [], want = [];
  for (const c of CASES) { got.push(await d.scrubOutput(T, c)); want.push(rel.scrubOutput(T, c)); }
  done(d); done(rel);
  const same = got.every((g, k) => g && want[k] && g.out === want[k].out && g.err === want[k].err && g.changed === want[k].changed);
  const clean = got.every((g) => !carries(g.out) && !carries(g.err));
  const splitClean = !got[0].out.includes(VALUE.slice(0, 10)) || !got[0].out.includes(VALUE);
  ok(same && clean && splitClean && got[0].changed === true, `(a) ONE ANSWER: ${CASES.length} outputs (out past the figure with the value split across it, err past it, both one byte past, both at it) — the same bytes as the release's on-loop scrub, both halves, and no view of the value in any (${got.map((g) => g.out.length + '/' + g.err.length).join(', ')})`, { same, clean });
}

console.log('(b) OFF THE LOOP — no call of the loop\'s compiled scrubber for a half past the figure');
{
  const c = { out: textOf(200 * 1024), err: '' };
  const d = mk(BD), rel = mk(RELEASE);
  d.scrubOutput(T, { out: 'warm', err: '' }); rel.scrubOutput(T, { out: 'warm', err: '' });   // both compile their scrubber first (a call each)
  const n0 = loopCalls; const a = await d.scrubOutput(T, c); const nOff = loopCalls - n0;
  const n1 = loopCalls; const r = rel.scrubOutput(T, c); const nRel = loopCalls - n1;
  done(d); done(rel);
  ok(nOff === 0 && !carries(a.out) && nRel >= 1 && !carries(r.out), `(b) OFF THE LOOP: a 200 KiB half — ${nOff} call(s) of the loop's compiled scrubber (the worker scrubbed it); RED the release's road: ${nRel} call(s) on the loop`, { nOff, nRel });
}

console.log('(c) NEVER RAW, NEVER THE LOOP — a lost worker, a silent one, one over its work bound: refused by name');
const STALL = path.join(DIR, 'stall-worker.cjs');
fs.writeFileSync(STALL, "'use strict';\nconst { parentPort } = require('worker_threads');\nparentPort.on('message', () => { /* a placed stall: takes the values, never answers */ });\n");
const LOST = path.join(DIR, 'lost-worker.cjs');
fs.writeFileSync(LOST, "'use strict';\nconst { parentPort } = require('worker_threads');\nparentPort.on('message', (msg) => { if (msg && msg.type === 'text') process.exit(3); /* lost at its first text */ });\n");
const OVER = path.join(DIR, 'over-worker.cjs');
fs.writeFileSync(OVER, "'use strict';\nconst VS = require(" + JSON.stringify(path.join(REPO, 'src/vault-scrubber.js')) + ");\nconst real = VS.compileTextScrubber;\nVS.compileTextScrubber = (p) => { const f = real(p); let o = 0; const w = (t) => { o++; return f(t); }; w.spelled = f.spelled; Object.defineProperty(w, 'overs', { get: () => o }); return w; };   // every call past its work bound\nrequire(" + JSON.stringify(path.join(REPO, 'src/server/browser-scrub-worker.js')) + ");\n");
{
  const BIG = { out: textOf(100 * 1024), err: textOf(500) };
  const leg = async (mod, file) => { logs.length = 0; const d = mk(mod, { boundMs: 250, floorMs: 0 }, { scrubWorkerFile: file }); const n0 = loopCalls; const a = await d.scrubOutput(T, BIG); const loop = loopCalls - n0; done(d); return { a, loop, journal: logs.find((l) => l.includes('command output(s) refused')) || '' }; };
  const silent = await leg(BD, STALL), lost = await leg(BD, LOST), over = await leg(BD, OVER);
  const refusedBy = (x, re) => !!(x.a && x.a.refused && re.test(x.a.refused) && !('out' in x.a) && x.a.sizes && x.a.sizes.out === Buffer.byteLength(BIG.out));
  const journal = [silent, lost, over].every((x) => x.journal.includes(LABEL) && /\b1 browser command output/.test(x.journal) && !carries(x.journal));
  ok(refusedBy(silent, /no answer within 250 ms/) && refusedBy(lost, /the scrub worker ended|the scrub worker failed/) && refusedBy(over, /scrub_work_bound/) && [silent, lost, over].every((x) => x.loop <= 1) && journal,
    `(c) a silent worker (a placed stall, bound 250 ms) «${silent.a.refused}», a lost one «${lost.a.refused}», one over its work bound «${over.a.refused}»: each REFUSED by name with the sizes, nothing of the output answered, the journal the profile's label and a count only`, { silent, lost, over });
  const RAW = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, "        if (a.refused || b.refused) return { refused: String(a.refused || b.refused), sizes: { out: Buffer.byteLength(o0, 'utf8'), err: Buffer.byteLength(e0, 'utf8') } };", '        if (a.refused || b.refused) return { out: o0, err: e0, changed: false };', 'test-browser-cmd-scrub (c) answered raw'), 'answered-raw');
  const LOOP = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, "        if (a.refused || b.refused) return { refused: String(a.refused || b.refused), sizes: { out: Buffer.byteLength(o0, 'utf8'), err: Buffer.byteLength(e0, 'utf8') } };", '        if (a.refused || b.refused) return { out: scrubText(pid, o0), err: scrubText(pid, e0), changed: true };', 'test-browser-cmd-scrub (c) the loop after the worker failed'), 'loop-after-fail');
  const raw = await leg(RAW, STALL), onLoop = await leg(LOOP, STALL);
  ok(!!raw.a && !raw.a.refused && carries(raw.a.out) && !!onLoop.a && !onLoop.a.refused && onLoop.loop >= 2, `RED CONTROLS: «answered raw» hands the value back (${carries(raw.a && raw.a.out)}); «scrubbed on the loop after the worker failed» ran ${onLoop.loop} call(s) of the loop's scrubber`, { raw: !!(raw.a && raw.a.out), onLoop: onLoop.loop });
}

console.log('(d) THE FLOOR WAITS — a half that meets the floor between starts waits for its end, then is answered');
{
  const ONCE = path.join(DIR, 'lost-once-worker.cjs'), MARK = path.join(DIR, 'lost-once.mark');
  fs.writeFileSync(ONCE, "'use strict';\nconst fs = require('fs');\nconst MARK = " + JSON.stringify(MARK) + ";\nif (!fs.existsSync(MARK)) { fs.writeFileSync(MARK, '1'); const { parentPort } = require('worker_threads'); parentPort.on('message', (msg) => { if (msg && msg.type === 'text') process.exit(3); }); } else require(" + JSON.stringify(path.join(REPO, 'src/server/browser-scrub-worker.js')) + ");\n");
  const leg = async (mod) => {
    try { fs.rmSync(MARK); } catch { }
    const d = mk(mod, { floorMs: 400 }, { scrubWorkerFile: ONCE });
    const first = await d.scrubOutput(T, { out: textOf(80 * 1024), err: '' });   // lost: the next start is inside the floor
    const startedAt = d.scrubWorkerFacts(PID).startedAt, t0 = Date.now(), left = startedAt == null ? 0 : Math.max(0, 400 - (t0 - startedAt));   // the floor still to run at the second ask
    const second = await d.scrubOutput(T, { out: textOf(80 * 1024), err: '' }); const waited = Date.now() - t0;
    done(d); return { first: first.refused || null, second: second.refused || null, clean: !second.refused && !carries(second.out), waited, left };
  };
  const real = await leg(BD);
  const AT_ONCE = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, "      if (kind === 'text' && !waited && last != null && now() - last < SCRUB_FIG.floorMs)", "      if (false && kind === 'text' && !waited && last != null && now() - last < SCRUB_FIG.floorMs)", 'test-browser-cmd-scrub (d) refused at once'), 'floor-at-once');
  const red = await leg(AT_ONCE);
  ok(!!real.first && real.clean && real.left > 0 && real.waited >= real.left - 25 && /floor/.test(String(red.second)), `(d) THE FLOOR WAITS: the worker lost («${real.first}»), the next half met the floor and WAITED ${real.waited} ms for its end, then was scrubbed by a new worker; RED refused at once: «${red.second}»`, { real, red });
}

console.log('(e) ORDER — the halves of one command and two commands of one profile, in the order asked');
{
  const d = mk(BD);
  const order = [];
  const A = d.scrubOutput(T, { out: textOf(90 * 1024), err: textOf(70 * 1024) }).then((r) => { order.push('A'); return r; });
  const B = d.scrubOutput(T, { out: textOf(90 * 1024), err: '' }).then((r) => { order.push('B'); return r; });
  const [a, b] = await Promise.all([A, B]);
  done(d);
  ok(order.join() === 'A,B' && !carries(a.out) && !carries(a.err) && !carries(b.out), `(e) ORDER: two commands of one profile, each past the figure, answered ${order.join(' then ')}; each half in its place`, { order });
}

console.log('(f) THE WORDS AND THE WAIT');
{
  const route = /const sc = await ctx\.dialogs\.scrubOutput\(t, req\.body\.output\);\n\s*if \(sc && sc\.refused\) return res\.status\(503\)\.json\(\{ error: [^\n]*code: 'scrub_refused', why: String\(sc\.refused\), sizes: sc\.sizes \|\| null \}\);/.test(SRC_RT);
  const words = /au\.code === 'scrub_refused'\) \{ console\.error\(`vibespace-browser: refused — this command's output \(\$\{scrubSizes\(au\.sizes\)\}\) was too large to scrub on the hub's own thread, and the hub's scrub worker did not answer[^`]*Run the command again in a moment; if it is refused again, read less at once[^`]*\[login_fill_live\]`\)/.test(SRC_CLI);
  const noLive = !/scrub_refused[^\n]*sign-in fill is live/.test(SRC_CLI);
  const cliWait = Number((/const AUDIT_SCRUB_WAIT_MS = (\d+);/.exec(SRC_CLI) || [])[1]);
  const ceil = Number((/ceilingMs: (\d+)/.exec(SRC_BD) || [])[1]), floor = Number((/floorMs: (\d+)/.exec(SRC_BD) || [])[1]);
  const usesIt = /\{ soft: true, \.\.\.\(needScrub && scrubCapOk \? \{ ms: AUDIT_SCRUB_WAIT_MS \} : \{\}\) \}\)/.test(SRC_CLI);
  ok(route && words && noLive && usesIt && cliWait > ceil + floor, `(f) the route answers scrub_refused with its why and the sizes; the CLI says what happened and what to do (never «a sign-in fill is live»); the CLI's own wait ${cliWait} ms > the hub's ceiling ${ceil} ms + its floor ${floor} ms`, { route, words, noLive, usesIt, cliWait, ceil, floor });
  // a CLI that gives up before the hub answers (a PLACED stall: the audit is held, never answered): cli-call's expiry line by name, exit
  // 124, nothing of the output on stdout
  const held = [];
  const srv = http.createServer((req) => { held.push(req); /* a placed stall: held, never answered */ });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const kid = path.join(DIR, 'give-up.cjs');
  fs.writeFileSync(kid, "'use strict';\nconst CC = require(" + JSON.stringify(path.join(REPO, 'src/cli-call.js')) + ");\nCC.configure({ tool: 'vibespace-browser' });\n(async () => { const res = await CC.call('http://127.0.0.1:" + port + "/api/agent/browser/audit', { cls: 'wake', ms: 300, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ output: { out: 'OUTPUT-NEVER-PRINTED', err: '' } }) }); process.stdout.write('OUTPUT-NEVER-PRINTED ' + res.status); })();\n");
  const r = await new Promise((resolve) => { const c = spawn(process.execPath, [kid], { stdio: ['ignore', 'pipe', 'pipe'] }); let o = '', e = ''; c.stdout.on('data', (x) => { o += x; }); c.stderr.on('data', (x) => { e += x; }); c.on('close', (code) => resolve({ code, o, e })); });
  for (const q of held) { try { q.socket.destroy(); } catch { } }
  await new Promise((res) => srv.close(res));
  ok(r.code === 124 && r.o === '' && /^vibespace-browser: the hub did not answer in /m.test(r.e) && !r.e.includes('OUTPUT-NEVER-PRINTED'), `(f) a CLI that gives up before the hub answers (a placed stall): exit ${r.code}, its line «${r.e.trim().split('\n')[0]}», nothing of the output printed`, r);
}

console.log('(g) WHAT STAYS ON THE LOOP, PRINTED (never judged): the parse of a body of two 16 MiB halves, the post of a half to the worker');
{
  const HALF = 16 * 1024 * 1024;
  const half = 'y'.repeat(HALF);
  const body = JSON.stringify({ profile: PID, verb: 'snapshot', ok: true, output: { out: half, err: half } });
  const t0 = performance.now(); const parsed = JSON.parse(body); const parseMs = performance.now() - t0;
  const { Worker } = require('worker_threads');
  const w = new Worker("require('worker_threads').parentPort.on('message', () => {});", { eval: true });
  await new Promise((r) => w.once('online', r));
  const t1 = performance.now(); w.postMessage({ type: 'text', seq: 1, text: parsed.output.out }); const postMs = performance.now() - t1;
  await w.terminate();
  console.log(`  · PRINTED, never judged: the route's parse of a ${(body.length / 1048576).toFixed(1)} MiB body (two 16 MiB halves) took ${parseMs.toFixed(1)} ms on the main thread; the post of ONE 16 MiB half to a worker took ${postMs.toFixed(1)} ms (a structured clone on the main thread)`);
}

for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 4, label: 'B-360d command scrub ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
clearInterval(KEEP);
report();
