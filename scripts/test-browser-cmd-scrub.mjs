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
//   (g) WHAT STAYS ON THE LOOP, PRINTED (never judged): the route's parse of a body of two 16 MiB halves, the post of a half to
//       the worker, the size passes, the receive of the worker's answer, the compares, and the answer's stringify
// LINE 1051's FOLLOW (主开发 r4754): (a)/(b) multi-byte text at the cut, under the figure in characters but over it in bytes, an empty
//   half; (c) the work bound refused on its own; two commands in flight when the worker ends (both refused, one count each);
//   (d) the floor's re-check after its wait; (e) the order compared byte for byte with the release copy (RED: the halves swapped);
//   (i) THE REAL CLI against a stand-in hub: nothing of the output printed on any answer but the hub's word that it checked it;
//   (j) THE ROUTE: the word when it checked, 409 scrub_unchecked by name when it could not, 503 scrub_refused when the worker could not.
//   PART 2, BY THE READING: (h) THE TEXT CAP — a half past 4 MiB never reaches the worker (the CLI refuses it before posting, the hub
//   answers 413 scrub_too_large); frames queued behind a text job inside the bound are answered, none withheld.
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
/** line 1051's follow: a text of `bytes` UTF-8 bytes padded with a TWO-byte character (é); `splitAt`: the value placed so the BYTE
 *  `splitAt` falls inside it, with multi-byte characters up to it */
const mbTextOf = (bytes, { splitAt = null } = {}) => {
  const views = 'a ' + VIEWS.join(' b ') + ' c\n';
  const mb = (n) => 'é'.repeat(Math.floor(Math.max(0, n) / 2)) + (Math.max(0, n) % 2 ? 'x' : '');
  if (splitAt != null) { const s = mb(splitAt - 4) + VALUE + ' ' + views; return s + mb(bytes - Buffer.byteLength(s, 'utf8')); }
  return views + mb(bytes - Buffer.byteLength(views, 'utf8'));
};
const RELEASE = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, '    if (sizes.out > SCRUB_FIG.onLoopMax || sizes.err > SCRUB_FIG.onLoopMax) {', '    if (false) {', 'test-browser-cmd-scrub: the release\'s road (every half on the loop)'), 'release-road');
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
    { out: mbTextOf(F + 6000, { splitAt: F }), err: '' },           // multi-byte text, a value across the BYTE cut; an empty half
    { out: mbTextOf(F + 2000), err: mbTextOf(F - 1) },              // under the figure in CHARACTERS, over it in bytes; err one byte under
  ];
  const d = mk(BD), rel = mk(RELEASE);
  const got = [], want = [];
  for (const c of CASES) { got.push(await d.scrubOutput(T, c)); want.push(rel.scrubOutput(T, c)); }
  done(d); done(rel);
  const same = got.every((g, k) => g && want[k] && g.out === want[k].out && g.err === want[k].err && g.changed === want[k].changed);
  const clean = got.every((g) => !carries(g.out) && !carries(g.err));
  const mbUnder = CASES[5].out.length < F && Buffer.byteLength(CASES[5].out, 'utf8') > F;   // the case is what it says
  const splitClean = !got[0].out.includes(VALUE.slice(0, 10)) || !got[0].out.includes(VALUE);
  ok(same && clean && splitClean && mbUnder && got[0].changed === true && got[4].changed === true, `(a) ONE ANSWER: ${CASES.length} outputs (out past the figure with the value split across it, err past it, both one byte past, both at it; multi-byte text with the value across the byte cut and an empty half; under the figure in characters but over it in bytes) — the same bytes as the release's on-loop scrub, both halves, and no view of the value in any (${got.map((g) => g.out.length + '/' + g.err.length).join(', ')})`, { same, clean });
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
  const mb = { out: mbTextOf(64 * 1024 + 3000), err: '' }, d2 = mk(BD);
  d2.scrubOutput(T, { out: 'warm', err: '' });
  const m0 = loopCalls; const am = await d2.scrubOutput(T, mb); const nMb = loopCalls - m0; done(d2);
  ok(mb.out.length < 64 * 1024 && nMb === 0 && !carries(am.out), `(b) a half UNDER the figure in characters (${mb.out.length}) but OVER it in bytes (${Buffer.byteLength(mb.out, 'utf8')}): the worker's — ${nMb} call(s) on the loop`, { nMb });
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
  ok(refusedBy(silent, /no answer within 250 ms/) && refusedBy(lost, /the scrub worker ended|the scrub worker failed/) && refusedBy(over, /scrub_work_bound/) && over.a.over === true && !silent.a.over && !lost.a.over && [silent, lost, over].every((x) => x.loop <= 1) && journal,
    `(c) a silent worker (a placed stall, bound 250 ms) «${silent.a.refused}», a lost one «${lost.a.refused}», one over its work bound «${over.a.refused}» (marked as the work bound's own: running again cannot help): each REFUSED by name with the sizes, nothing of the output answered, the journal the profile's label and a count only`, { silent, lost, over });
  const RAW = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, "          return { refused: why, ...(a.over || b.over ? { over: true } : {}), sizes };", '          return { out: o0, err: e0, changed: false };', 'test-browser-cmd-scrub (c) answered raw'), 'answered-raw');
  const LOOP = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, "          return { refused: why, ...(a.over || b.over ? { over: true } : {}), sizes };", '          return { out: scrubText(pid, o0), err: scrubText(pid, e0), changed: true };', 'test-browser-cmd-scrub (c) the loop after the worker failed'), 'loop-after-fail');
  const raw = await leg(RAW, STALL), onLoop = await leg(LOOP, STALL);
  ok(!!raw.a && !raw.a.refused && carries(raw.a.out) && !!onLoop.a && !onLoop.a.refused && onLoop.loop >= 2, `RED CONTROLS: «answered raw» hands the value back (${carries(raw.a && raw.a.out)}); «scrubbed on the loop after the worker failed» ran ${onLoop.loop} call(s) of the loop's scrubber`, { raw: !!(raw.a && raw.a.out), onLoop: onLoop.loop });
}

console.log('(c2) TWO COMMANDS IN FLIGHT WHEN THE WORKER ENDS — both refused, neither with the other\'s text, one count each');
{
  const A = { out: 'AAAA ' + textOf(100 * 1024), err: '' }, B = { out: 'BBBB ' + textOf(120 * 1024), err: 'bbbb ' + textOf(90 * 1024) };
  const leg = async (mod) => { const d = mk(mod, { boundMs: 250, floorMs: 0 }, { scrubWorkerFile: STALL }); const [a, b] = await Promise.all([d.scrubOutput(T, A), d.scrubOutput(T, B)]); const n = d.scrubWorkerFacts(PID).refused; done(d); return { a, b, n }; };
  const own = (x, c) => !!(x && x.refused && !('out' in x) && !('err' in x) && x.sizes && x.sizes.out === Buffer.byteLength(c.out, 'utf8') && x.sizes.err === Buffer.byteLength(c.err, 'utf8'));
  const real = await leg(BD);
  ok(own(real.a, A) && own(real.b, B) && real.n === 2, `(c2) two commands of one profile in flight (three halves) when the silent worker passed its bound: both REFUSED («${real.a.refused}»), each with its OWN sizes and no text; the journal's count ${real.n} (one a command)`, real);
  const EMPTY = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, "p.resolve(p.kind === 'text' ? textRefused(pid, why) : withheldFor(pid, why)); }", "p.resolve(p.kind === 'text' ? { out: '' } : withheldFor(pid, why)); }", 'test-browser-cmd-scrub (c2) answered empty at the end'), 'end-empty');
  const PERHALF = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, '  function textRefused(pid, why, over = false) { return', '  function textRefused(pid, why, over = false) { outputRefused(pid, why); return', 'test-browser-cmd-scrub (c2) a count a half'), 'per-half');
  const e = await leg(EMPTY), h = await leg(PERHALF);
  ok(!(own(e.a, A) && own(e.b, B)) && h.n !== 2, `RED CONTROLS: the worker's end answering a command's halves EMPTY (refused: ${!!(e.a && e.a.refused)}/${!!(e.b && e.b.refused)}); a count a HALF: ${h.n} for two commands`, { e, h: h.n });
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
  const AT_ONCE = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, "      if (kind === 'text' && waited == null && last != null && now() - last < SCRUB_FIG.floorMs)", "      if (false && kind === 'text' && waited == null && last != null && now() - last < SCRUB_FIG.floorMs)", 'test-browser-cmd-scrub (d) refused at once'), 'floor-at-once');
  const red = await leg(AT_ONCE);
  ok(!!real.first && real.clean && real.left > 0 && real.waited >= real.left - 25 && /floor/.test(String(red.second)), `(d) THE FLOOR WAITS: the worker lost («${real.first}»), the next half met the floor and WAITED ${real.waited} ms for its end, then was scrubbed by a new worker; RED refused at once: «${red.second}»`, { real, red });
}

console.log('(d2) THE FLOOR IT WAITED OUT IS SPENT — a wait whose timer fires early against the clock is not refused after it');
{
  const ONCE = path.join(DIR, 'lost-once-worker.cjs'), MARK = path.join(DIR, 'lost-once.mark');
  const leg = async (mod) => {
    try { fs.rmSync(MARK); } catch { }
    let lag = 0;   // a PLACED clock: during the wait it falls 40 ms behind the timers, so the wait's timer fires «early» against it
    const d = mk(mod, { floorMs: 300 }, { scrubWorkerFile: ONCE, now: () => Date.now() - lag });
    await d.scrubOutput(T, { out: textOf(80 * 1024), err: '' });   // lost: the next start is inside the floor
    const lagT = setTimeout(() => { lag = 40; }, 50);
    const second = await d.scrubOutput(T, { out: textOf(80 * 1024), err: '' });
    clearTimeout(lagT); done(d); return { second: second.refused || null, clean: !second.refused && !carries(second.out) };
  };
  const real = await leg(BD);
  const RECHECK = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, " && !(kind === 'text' && waited === last)) return Promise.resolve(refuse(pid, 'the scrub worker restarts after a floor'));", ") return Promise.resolve(refuse(pid, 'the scrub worker restarts after a floor'));", 'test-browser-cmd-scrub (d2) the floor tested again after its wait'), 'floor-recheck');
  const red = await leg(RECHECK);
  ok(real.clean && /floor/.test(String(red.second)), `(d2) the half waited out the floor, its timer fired early against a clock 40 ms behind: scrubbed (${real.clean}); RED the floor tested again after the wait: «${red.second}»`, { real, red });
}

console.log('(e) ORDER — the halves of one command and two commands of one profile, in the order asked');
{
  const CA = { out: 'out-A ' + textOf(90 * 1024), err: 'err-A ' + textOf(70 * 1024) }, CB = { out: 'out-B ' + textOf(95 * 1024), err: '' };
  const rel = mk(RELEASE); const wantA = rel.scrubOutput(T, CA), wantB = rel.scrubOutput(T, CB); done(rel);
  const leg = async (mod) => {
    const d = mk(mod); const order = [];
    const A = d.scrubOutput(T, CA).then((r) => { order.push('A'); return r; });
    const B = d.scrubOutput(T, CB).then((r) => { order.push('B'); return r; });
    const [a, b] = await Promise.all([A, B]); done(d);
    return { order: order.join(), same: a.out === wantA.out && a.err === wantA.err && b.out === wantB.out && b.err === wantB.err, clean: !carries(a.out) && !carries(a.err) && !carries(b.out) };
  };
  const real = await leg(BD);
  ok(real.order === 'A,B' && real.same && real.clean, `(e) ORDER: two commands of one profile, each past the figure, answered ${real.order.replace(',', ' then ')}; each half byte for byte the release copy's, in its place`, real);
  const SWAP = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, '        return { out: a.out, err: b.out, changed: a.out !== o0 || b.out !== e0 };', '        return { out: b.out, err: a.out, changed: a.out !== o0 || b.out !== e0 };', 'test-browser-cmd-scrub (e) the halves swapped'), 'halves-swapped');
  const red = await leg(SWAP);
  ok(!red.same, `RED CONTROL: the halves swapped — byte for byte the release copy's: ${red.same}`, red);
}

console.log('(f) THE WORDS AND THE WAIT');
{
  const cliWait = Number((/const AUDIT_SCRUB_WAIT_MS = (\d+);/.exec(SRC_CLI) || [])[1]);
  const ceil = Number((/ceilingMs: (\d+)/.exec(SRC_BD) || [])[1]), floor = Number((/floorMs: (\d+)/.exec(SRC_BD) || [])[1]);
  const usesIt = /\{ soft: true, \.\.\.\(needScrub && scrubCapOk \? \{ ms: AUDIT_SCRUB_WAIT_MS \} : \{\}\) \}\)/.test(SRC_CLI);
  const cliCap = Number((/const SCRUB_HALF_MAX = (\d+) \* 1024 \* 1024;/.exec(SRC_CLI) || [])[1]) * 1048576, hubCap = Number((/textMax: (\d+) \* 1024 \* 1024/.exec(SRC_BD) || [])[1]) * 1048576;
  ok(usesIt && cliWait > ceil + floor && cliCap > 0 && cliCap === hubCap, `(f) the CLI's own wait for a scrubbed audit ${cliWait} ms > the hub's ceiling ${ceil} ms + its floor ${floor} ms; the CLI's cap ${cliCap} bytes a half = the hub's ${hubCap} (the words run for real in (i))`, { usesIt, cliWait, ceil, floor, cliCap, hubCap });
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

console.log('(g) WHAT STAYS ON THE LOOP, PRINTED (never judged): at the cap (two 4 MiB halves) and at an older CLI copy\'s (two 16 MiB halves, refused by name)');
for (const HALF of [Number((/textMax: (\d+) \* 1024 \* 1024/.exec(SRC_BD) || [])[1]) * 1048576, 16 * 1024 * 1024]) {
  const HM = (HALF / 1048576).toFixed(0);
  const half = 'y'.repeat(HALF);
  const body = JSON.stringify({ profile: PID, verb: 'snapshot', ok: true, output: { out: half, err: half } });
  const t0 = performance.now(); const parsed = JSON.parse(body); const parseMs = performance.now() - t0;
  const { Worker } = require('worker_threads');
  const w = new Worker("require('worker_threads').parentPort.on('message', () => {});", { eval: true });
  await new Promise((r) => w.once('online', r));
  const t1 = performance.now(); w.postMessage({ type: 'text', seq: 1, text: parsed.output.out }); const postMs = performance.now() - t1;
  await w.terminate();
  console.log(`  · PRINTED, never judged: the route's parse of a ${(body.length / 1048576).toFixed(1)} MiB body (two ${HM} MiB halves) took ${parseMs.toFixed(1)} ms on the main thread; the post of ONE ${HM} MiB half to a worker took ${postMs.toFixed(1)} ms (a structured clone on the main thread)`);
  // line 1051's follow (the round's three left out): the size passes, the RECEIVE of the worker's 16 MiB answer on the loop (the
  // structured clone's other half, read synchronously off a port), the compares, and the answer's stringify
  const t2 = performance.now(); let n = 0; for (const x of [parsed.output.out, parsed.output.err]) n += Buffer.byteLength(x, 'utf8'); const lenMs = performance.now() - t2;   // scrubOutput's ONE size pass a half
  const { MessageChannel, receiveMessageOnPort } = require('worker_threads');
  const ch = new MessageChannel(); const answer = 'z' + parsed.output.out.slice(1);   // a 16 MiB answer that differs from its input
  ch.port1.postMessage({ type: 'done', seq: 1, r: { out: answer } });
  const t3 = performance.now(); const got = receiveMessageOnPort(ch.port2); const recvMs = performance.now() - t3; ch.port1.close();
  const same = parsed.output.out.slice(0);   // an equal string that is not the same object: the compare reads every byte
  const sameCopy = Buffer.from(same, 'utf8').toString('utf8');
  const t4 = performance.now(); const ne1 = got.message.r.out !== parsed.output.out; const ne2 = sameCopy !== parsed.output.err; const cmpMs = performance.now() - t4;
  const t5 = performance.now(); const sent = JSON.stringify({ ok: true, scrubChecked: true, scrubbed: { out: got.message.r.out, err: parsed.output.err } }); const strMs = performance.now() - t5;
  console.log(`  · PRINTED, never judged (line 1051's follow): the size pass, once a half over both ${HM} MiB halves (${n} bytes), took ${lenMs.toFixed(1)} ms; the receive of the worker's ${HM} MiB answer on the loop took ${recvMs.toFixed(1)} ms; the two compares (an answer that changed, one that did not) took ${cmpMs.toFixed(1)} ms (${ne1}/${ne2}); the stringify of an answer with two ${HM} MiB halves (${(sent.length / 1048576).toFixed(1)} MiB) took ${strMs.toFixed(1)} ms — the last as at the release`);
}

console.log('(h) THE TEXT CAP AND THE FRAMES BEHIND A TEXT — a half past the cap never reaches the worker; frames queued behind a text job inside the bound are answered, none withheld');
{
  const CAP = Number((/textMax: (\d+) \* 1024 \* 1024/.exec(SRC_BD) || [])[1]) * 1048576;
  const over = { out: textOf(CAP + 1), err: '' };
  const leg1 = async (mod) => { const d = mk(mod, { floorMs: 0 }, { scrubWorkerFile: STALL }); const a = await Promise.race([d.scrubOutput(T, over), sleep(200).then(() => ({ hung: true }))]); const f = d.scrubWorkerFacts(PID); done(d); return { a, live: f.live, n: f.refused }; };
  const real = await leg1(BD);
  ok(real.a && real.a.refused && real.a.tooLarge === true && real.a.cap === CAP && real.a.sizes && real.a.sizes.out === CAP + 1 && !('out' in real.a) && real.live === false && real.n === 1,
    `(h) a half ONE BYTE past the cap (${CAP} bytes): refused by name («${real.a && real.a.refused}»), its sizes, no worker started for it, one count`, real);
  const NOCAP = MUT.load('src/server/browser-dialogs.js', anchored(SRC_BD, '      if (sizes.out > SCRUB_FIG.textMax || sizes.err > SCRUB_FIG.textMax) {', '      if (false) {', 'test-browser-cmd-scrub (h) no text cap'), 'no-text-cap');
  const red = await leg1(NOCAP);
  ok(red.live === true || !!red.a.hung, `RED CONTROL: without the cap the half is handed to the worker (a worker started: ${red.live}; the command still waiting on it: ${!!red.a.hung})`, red);
  // a text job INSIDE the bound: the worker blocks on it (a placed hold: Atomics.wait, no CPU) and the frame queued behind it is
  // answered after it, in order, never withheld, the worker kept; a job PAST the bound (what a lawful 16 MiB half was, 17.7 s against
  // 10 s) ends the worker and withholds the frame behind it — the case the cap removes
  const HOLD = path.join(DIR, 'hold-worker.cjs');
  fs.writeFileSync(HOLD, "'use strict';\nconst wt = require('worker_threads');\nconst realOn = wt.parentPort.on.bind(wt.parentPort);\nwt.parentPort.on = (ev, h) => realOn(ev, ev !== 'message' ? h : (msg) => { if (msg && msg.type === 'text') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, HOLD_MS); h(msg); });\nrequire(" + JSON.stringify(path.join(REPO, 'src/server/browser-scrub-worker.js')) + ");\n");
  const holdFile = (ms) => { const f = path.join(DIR, `hold-worker-${ms}.cjs`); fs.writeFileSync(f, fs.readFileSync(HOLD, 'utf8').replace('HOLD_MS', String(ms))); return f; };
  const FRAME = JSON.stringify({ id: 7, result: { value: 'f'.repeat(80 * 1024) + ' ' + VALUE }, sessionId: 'S7' });
  const leg2 = async (holdMs) => {
    const d = mk(BD, { boundMs: 300, floorMs: 0 }, { scrubWorkerFile: holdFile(holdMs) });
    const pt = d.scrubOutput(T, { out: textOf(100 * 1024), err: '' });
    const r = d.scrubCdpFrameAsync(PID, FRAME); const pf = typeof r === 'string' ? Promise.resolve({ out: r }) : r;
    const [t, f] = await Promise.all([pt, pf]); const facts = d.scrubWorkerFacts(PID); done(d);
    return { text: t.refused ? 'refused' : (carries(t.out) ? 'RAW' : 'scrubbed'), frame: f && f.withheld ? 'withheld' : (f && typeof f.out === 'string' ? (f.out.includes(VALUE) ? 'RAW' : 'scrubbed') : 'none'), live: facts.live, withheld: facts.withheld };
  };
  const inside = await leg2(150), past = await leg2(500);
  ok(inside.text === 'scrubbed' && inside.frame === 'scrubbed' && inside.live === true && inside.withheld === 0 && past.frame === 'withheld' && past.text === 'refused',
    `(h) a text job held 150 ms inside a 300 ms bound: the frame queued behind it ${inside.frame}, the worker kept (${inside.live}), ${inside.withheld} withheld; held 500 ms, past the bound (the old cap's case): the frame behind it ${past.frame}, the command ${past.text}`, { inside, past });
}

console.log('(i) THE REAL CLI against a stand-in hub — nothing of the output printed on any answer but the hub\'s word that it checked it');
{
  const ROOT = path.join(DIR, 'cli'), BIN = path.join(ROOT, 'bin'), HOME = path.join(ROOT, 'home'), TMP = path.join(ROOT, 'tmp'), XDG = path.join(ROOT, 'xdg');
  for (const d of [BIN, path.join(HOME, '.agent-browser'), TMP, XDG]) fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  const CFG = path.join(ROOT, 'ab-config.json'); fs.writeFileSync(CFG, '{}\n');
  const PWF = path.join(ROOT, 'passwd.cjs');   // the account's home is the scratch one (the CLI reads the passwd home, never $HOME alone)
  fs.writeFileSync(PWF, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(HOME)} });\n`);
  const BV = require('../src/browser-verbs.js');
  const MARK = 'OUTPUT-' + crypto.randomBytes(5).toString('hex');   // the stand-in browser's output: printed ONLY on the hub's word
  fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}\nif (process.argv[2] === '--version') { console.log(${JSON.stringify(String(BV.TABLE_VERSION))}); process.exit(0); }\nprocess.stdout.write(${JSON.stringify(MARK)} + ' ' + 'z'.repeat(process.env.FAKE_BIG ? 4 * 1024 * 1024 + 10 : 100 * 1024) + '\\n');\n`, { mode: 0o755 });
  let answer = null; const audits = [], asked = [];
  const hub = http.createServer((q, res) => { let b = ''; q.on('data', (x) => { b += x; }); q.on('end', () => {
    const send = (st, body) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    const u = q.url.split('?')[0]; asked.push(q.method + ' ' + u);
    if (u === '/api/agent/browser/resolve') return send(200, { ok: true, kind: 'none', shared: false, config: CFG, scrubOutput: true, at: Date.now() });
    if (u === '/api/agent/browser/audit') { let j = null; try { j = JSON.parse(b); } catch { } audits.push(!!(j && j.output && typeof j.output.out === 'string' && j.output.out.includes(MARK))); return answer(send); }
    send(404, { error: 'not on this stand-in hub', code: 'not_found' });
  }); });
  await new Promise((r) => hub.listen(0, '127.0.0.1', r));
  const env = { PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME, TMPDIR: TMP, XDG_RUNTIME_DIR: XDG, VIBESPACE_API: `http://127.0.0.1:${hub.address().port}`, VIBESPACE_SESSION_TOKEN: 'vsst_' + 'c'.repeat(24), VIBESPACE_SESSION_CWD: ROOT, VIBESPACE_SKIP_AGENT_HOOKS: '1' };
  const run = (cli, reply, extra = {}) => { answer = reply; return new Promise((resolve) => { const c = spawn(process.execPath, ['--require', PWF, cli, 'snapshot'], { env: { ...env, ...extra }, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }); let o = '', e = ''; c.stdout.on('data', (x) => { o += x; }); c.stderr.on('data', (x) => { e += x; }); c.on('close', (code) => resolve({ code, o, e, printed: o.includes(MARK) || e.includes(MARK) })); }); };
  const CLI = path.join(REPO, 'data/bin/vibespace-browser');
  const SIZES = { out: 100 * 1024 + 12, err: 0 };
  const CASES = [
    ['the worker did not answer (503 scrub_refused)', (send) => send(503, { error: 'refused', code: 'scrub_refused', why: 'no answer within 10000 ms', sizes: SIZES }), /the hub's scrub worker did not answer \(no answer within 10000 ms\); nothing was printed\. Run the command again in a moment/],
    ['the work bound (503 scrub_refused, workBound)', (send) => send(503, { error: 'refused', code: 'scrub_refused', why: 'the scrub passed its work bound (scrub_work_bound)', workBound: true, sizes: SIZES }), /holds more work for the hub's vault scrub than its bound allows \(scrub_work_bound\); running it again cannot help; nothing was printed\. Read less at once/],
    ['the lease ended (409 scrub_unchecked)', (send) => send(409, { error: 'unchecked', code: 'scrub_unchecked', why: 'not_attached', sizes: SIZES }), /could not check this command's output for vault values \(this conversation no longer holds that browser: it was detached while the command ran \(by this conversation, or by the person in VibeSpace\)\); nothing was printed\. See what this conversation holds now \(vibespace-browser status\) before you run it again/],
    ['a 200 with no word', (send) => send(200, { ok: true }), /did not say this command's output was checked for vault values [^\n]*nothing was printed\. Run the command again/],
    ['a 200 whose body cannot be read', (send) => send(200, '<html>not json</html>'), /did not say this command's output was checked for vault values [^\n]*nothing was printed/],
    ['the hub says the output is past its cap (413 scrub_too_large)', (send) => send(413, { error: 'too large', code: 'scrub_too_large', cap: 4 * 1048576, sizes: SIZES }), /is larger than the hub's vault scrub takes at once \(4 MiB a half\); nothing was printed\. Read less at once/],
  ];
  const got = [];
  for (const [name, reply, words] of CASES) { const r = await run(CLI, reply); got.push({ name, code: r.code, printed: r.printed, said: words.test(r.e), line: (r.e.split('\n').find((l) => /refused/.test(l)) || r.e.slice(0, 400)) }); }
  const big = await run(CLI, (send) => send(200, { ok: true, scrubChecked: true }), { FAKE_BIG: '1' });   // past the cap: refused before it is posted
  const bigPosted = audits.pop();
  ok(big.code === 1 && !big.printed && /\(out 4\.0 MiB, err 0 KiB\) is larger than the hub's vault scrub takes at once \(4 MiB a half\); nothing was printed\. Read less at once/.test(big.e) && bigPosted === false,
    `(i) an output past the cap (4 MiB + 10 bytes): the CLI refuses it BEFORE posting it (posted: ${bigPosted}), exit ${big.code}, «${(big.e.split('\n').find((l) => /refused/.test(l)) || '').trim()}»`, { code: big.code, e: big.e.slice(0, 600) });
  // r4795: a command the person's takeover interrupted, whose output the worker could not answer: the interruption's own sentence FIRST,
  // then the refusal; nothing of the output
  const INT = { code: 'browser_interrupted', error: 'The user took over your window of this browser — your operation was interrupted. Wait for the handback, then run it again.', takenAt: Date.now(), input: 'user', aborted: true, mediated: true };
  const both = await run(CLI, (send) => send(503, { error: 'refused', code: 'scrub_refused', why: 'no answer within 10000 ms', sizes: SIZES, interrupted: INT }));
  audits.pop();
  const iInt = both.e.indexOf('[browser_interrupted]'), iRef = both.e.indexOf('vibespace-browser: refused');
  ok(both.code === 1 && !both.printed && iInt >= 0 && iRef > iInt, `(i) INTERRUPTED AND REFUSED: the takeover's sentence first (at ${iInt}), the refusal after it (at ${iRef}), exit ${both.code}, nothing of the output printed`, { code: both.code, e: both.e.slice(0, 800) });
  const ctlClean = await run(CLI, (send) => send(200, { ok: true, scrubChecked: true }));
  const ctlScrubbed = await run(CLI, (send) => send(200, { ok: true, scrubChecked: true, scrubbed: { out: 'SCRUBBED-COPY\n', err: '' } }));
  const posted = audits.length === CASES.length + 2 && audits.every(Boolean);
  ok(got.every((g) => g.code === 1 && !g.printed && g.said) && posted, `(i) THE REAL CLI (data/bin/vibespace-browser snapshot; a stand-in hub; a stand-in browser printing a marked 100 KiB output): ${got.length} answers without the hub's word that it checked the output — each exit 1 with its own words, NOTHING of the output printed`, { got, posted, asked: [...new Set(asked)] });
  for (const g of got) console.log(`  · ${g.name}: «${g.line.trim()}»`);
  ok(ctlClean.code === 0 && ctlClean.o.includes(MARK) && ctlScrubbed.code === 0 && ctlScrubbed.o.includes('SCRUBBED-COPY') && !ctlScrubbed.printed, `CONTROLS: the hub's word «checked» — the CLI prints its own copy (exit ${ctlClean.code}); «checked, changed» — the scrubbed copy only (exit ${ctlScrubbed.code})`, { clean: { code: ctlClean.code, e: ctlClean.e.slice(0, 600) }, scrubbed: { code: ctlScrubbed.code, e: ctlScrubbed.e.slice(0, 600) } });
  const RELCLI = MUT.write('data/bin/vibespace-browser', anchored(SRC_CLI, '      if (au.scrubChecked !== true) {', '      if (false) {', 'test-browser-cmd-scrub (i) the release CLI: a 200 with no word is «nothing to scrub»'), 'release-cli');
  const red = await run(RELCLI, (send) => send(200, { ok: true }));
  ok(red.code === 0 && red.printed, `RED CONTROL: the release's CLI reads a 200 with no word as «nothing to scrub» and PRINTS its own copy (exit ${red.code}, printed ${red.printed})`, { code: red.code, e: red.e.slice(0, 600) });
  await new Promise((r) => hub.close(r));
}

console.log('(j) THE ROUTE — the word when it checked, 409 scrub_unchecked by name when it could not, 503 scrub_refused when the worker could not answer');
{
  const express = require('express');
  const KEY = 'bk-0000c0de', SID = 'sess-cmd-scrub', TOKEN = 'vsst_' + 'd'.repeat(24);
  const prof = { id: PID, label: LABEL, owner: { kind: 'instance', id: null } };
  let held = true;
  const stubKeeper = {
    profile: (id) => (id === PID ? prof : null),
    profileByRef: (r) => (r === PID ? prof : null),
    setFor: () => ({ attachments: [], handles: [] }),
    audit() { }, noteLeaseUrl() { },
    leasesFor: () => (held ? [{ profileId: PID, browserKey: KEY, sessionId: SID }] : []),
    statusFor: () => ({ ephemeral: null, leases: held ? [{ profileId: PID, browserKey: KEY, sessionId: SID }] : [] }),
    clock: () => Date.now(),
    // r4795: a person's takeover PAUSES the lease and keeps it (src/server/browser-keeper.js takeover: the input side goes to the person);
    // the audit asks whether it caught the command (`since`) — a stand-in of that answer
    interruptionFor: ({ since = 0 } = {}) => (taken && since > 0 ? { code: 'browser_interrupted', error: 'The user took over your window of this browser — your operation was interrupted. Wait for the handback, then run it again.', takenAt: Date.now(), input: 'user', aborted: true, mediated: true } : null),
  };
  let taken = false;
  const sessions = new Map([[SID, { agentToken: TOKEN, _browserKey: KEY, _browserVariant: 'D', name: 'cmd scrub', cwd: DIR, backendSessionId: 'conv-cmd-scrub' }]]);
  // the dialogs the route reads: the REAL scrubOutput (a mk() world); the watch's fact a stand-in (no page here)
  const dialogsOf = (d) => ({ scrubOutput: (t, raw) => d.scrubOutput(t, raw), factFor: () => ({ watched: false }), noteOutcome() { } });
  const world = async (RtMod, d) => { RtMod.setup({ keeper: stubKeeper, activeSessions: sessions, dialogs: dialogsOf(d), tasksForSession: () => [] }); const app = express(); app.use(express.json({ limit: '64mb' })); app.use(RtMod.router); const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); }); return { srv, url: `http://127.0.0.1:${srv.address().port}` }; };
  const post = async (w, body) => { const r = await fetch(w.url + '/api/agent/browser/audit', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(body) }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { } return { status: r.status, json, text }; };
  const Rt = require('../src/routes/browser.js');
  const small = { out: textOf(3000), err: '' }, clean = { out: 'nothing of a value here\n', err: '' }, big = { out: textOf(100 * 1024), err: textOf(500) };
  const d = mk(BD); const w = await world(Rt, d);
  held = true; const rScrubbed = await post(w, { profile: PID, verb: 'snapshot', ok: true, output: small });
  const rClean = await post(w, { profile: PID, verb: 'snapshot', ok: true, output: clean });
  held = false; const rLease = await post(w, { profile: PID, verb: 'snapshot', ok: true, output: small });
  held = true; const rNone = await post(w, { profile: 'bp-no-such', verb: 'snapshot', ok: true, output: small });
  const rNoOut = await post(w, { profile: PID, verb: 'click', ok: true });
  taken = true; const rTaken = await post(w, { profile: PID, verb: 'snapshot', ok: true, since: Date.now() - 1000, output: small }); taken = false;
  const CAP = Number((/textMax: (\d+) \* 1024 \* 1024/.exec(SRC_BD) || [])[1]) * 1048576;
  const tooBig = { out: textOf(CAP + 1), err: '' }; const rBig = await post(w, { profile: PID, verb: 'snapshot', ok: true, output: tooBig });
  await new Promise((r) => w.srv.close(r)); done(d);
  const dS = mk(BD, { boundMs: 250, floorMs: 0 }, { scrubWorkerFile: STALL }); const wS = await world(Rt, dS);
  const rStall = await post(wS, { profile: PID, verb: 'snapshot', ok: true, output: big });
  taken = true; const rStallTaken = await post(wS, { profile: PID, verb: 'snapshot', ok: true, since: Date.now() - 1000, output: big }); taken = false;
  await new Promise((r) => wS.srv.close(r)); done(dS);
  const dO = mk(BD, { floorMs: 0 }, { scrubWorkerFile: OVER }); const wO = await world(Rt, dO);
  const rOver = await post(wO, { profile: PID, verb: 'snapshot', ok: true, output: big });
  await new Promise((r) => wO.srv.close(r)); done(dO);
  const sizesOf = (o) => ({ out: Buffer.byteLength(o.out, 'utf8'), err: Buffer.byteLength(o.err, 'utf8') });
  const sameSizes = (a, o) => !!(a && a.out === sizesOf(o).out && a.err === sizesOf(o).err);
  const noValue = [rScrubbed, rClean, rLease, rNone, rStall, rOver].every((r) => !carries(r.text));
  ok(rScrubbed.status === 200 && rScrubbed.json.scrubChecked === true && rScrubbed.json.scrubbed && typeof rScrubbed.json.scrubbed.out === 'string' && rClean.status === 200 && rClean.json.scrubChecked === true && !rClean.json.scrubbed && rNoOut.status === 200 && !('scrubChecked' in rNoOut.json),
    `(j) CHECKED: an output with the value — 200 scrubChecked, the scrubbed copy; one with nothing to change — 200 scrubChecked, no copy; an audit with no output — no word`, { rScrubbed: rScrubbed.json && Object.keys(rScrubbed.json), rClean: rClean.json, rNoOut: rNoOut.json });
  ok(rLease.status === 409 && rLease.json.code === 'scrub_unchecked' && rLease.json.why === 'not_attached' && sameSizes(rLease.json.sizes, small) && rNone.status === 409 && rNone.json.why === 'not-found' && noValue,
    `(j) COULD NOT CHECK: the lease ended between the resolve and the audit — 409 scrub_unchecked «${rLease.json && rLease.json.error}»; no browser of the conversation by that name — 409 «${rNone.json && rNone.json.why}»; the sizes, never a value`, { rLease: rLease.json, rNone: rNone.json });
  ok(rStall.status === 503 && rStall.json.code === 'scrub_refused' && !rStall.json.workBound && sameSizes(rStall.json.sizes, big) && rOver.status === 503 && rOver.json.workBound === true && noValue,
    `(j) THE WORKER COULD NOT ANSWER: silent past its bound — 503 scrub_refused «${rStall.json && rStall.json.why}»; over its work bound — 503 with workBound; the sizes, never a value`, { rStall: rStall.json, rOver: rOver.json });
  ok(rTaken.status === 200 && rTaken.json.scrubChecked === true && rTaken.json.interrupted && rTaken.json.interrupted.code === 'browser_interrupted' && rStallTaken.status === 503 && rStallTaken.json.code === 'scrub_refused' && rStallTaken.json.interrupted && !carries(rTaken.text) && !carries(rStallTaken.text),
    `(j) A TAKEOVER KEEPS THE LEASE: the output is checked (200 scrubChecked) and the interruption rides the answer; with the worker silent, the 503 carries the interruption too (the CLI says it first, (i))`, { rTaken: rTaken.json && { scrubChecked: rTaken.json.scrubChecked, interrupted: !!rTaken.json.interrupted }, rStallTaken: rStallTaken.json && { code: rStallTaken.json.code, interrupted: !!rStallTaken.json.interrupted } });
  ok(rBig.status === 413 && rBig.json && rBig.json.code === 'scrub_too_large' && rBig.json.cap === CAP && sameSizes(rBig.json.sizes, tooBig) && !carries(rBig.text), `(j) A HALF PAST THE CAP (an older CLI copy posts up to 16 MiB): 413 scrub_too_large «${rBig.json && rBig.json.error}», the cap and the sizes`, rBig.json);
  const RTGUARD = MUT.load('src/routes/browser.js', anchored(SRC_RT, "      if (!t.ok) {\n        const why = t.code === 'not_attached'", "      if (false) {\n        const why = t.code === 'not_attached'", 'test-browser-cmd-scrub (j) no could-not-check answer'), 'route-no-guard');
  const dG = mk(BD); const wG = await world(RTGUARD, dG);
  held = false; const rG = await post(wG, { profile: PID, verb: 'snapshot', ok: true, output: small }); held = true;
  await new Promise((r) => wG.srv.close(r)); done(dG);
  ok(rG.status === 200 && rG.json && rG.json.ok === true && !('scrubChecked' in rG.json) && !('scrubbed' in rG.json), `RED CONTROL: without its could-not-check answer the route answers the lease's end as the release did — HTTP ${rG.status} with no word (an older CLI copy printed its own raw copy on that answer)`, rG.json);
  Rt.setup({ keeper: null, activeSessions: new Map(), dialogs: null, tasksForSession: () => [] });
}

for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 11, label: 'B-360d command scrub ' })) ok(r.pass, r.name + (r.pass ? '' : ' — ' + r.detail));
clearInterval(KEEP);
report();
