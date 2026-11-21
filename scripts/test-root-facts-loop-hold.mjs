#!/usr/bin/env node
// THE ROOT FACTS HOLD NOTHING OVER A CHECKOUT THAT DOES NOT ANSWER (heavy, in-process — B-1425, lane gmail-connect-wall,
// 主开发 r640 / r647). On production the checkout sits on a network mount, and the hub read its root facts there (the .git
// file, the gitdir under <common>/worktrees/, its commondir, their real paths) with SYNCHRONOUS calls on its main thread:
// once a minute at most, at every call while the last read erred, and from every remote conversation start. A stat there that
// does not answer held every conversation of the hub. src/server/agent-tool-generators.js now reads them OFF the loop: ONE read
// in flight at most, ever (law 1); a caller that can wait waits, bounded (law 2); the cache answers the rest.
// THE PLACED HOLD (never made by load, no mount of any kind): the scratch root's `.git` is a FIFO — its open() does not come back
// until a writer opens the other end; a child writer does that at RELEASE_MS (it ends itself after it wrote; its pid is held and
// ended in `finally`, nothing else). The judge is THE 3-NUMBER JUDGE of scripts/test-boot-loop-hold.mjs (a gap's HOLD = its ms −
// max(the main thread's run-queue wait, the same-box control's stall); the law, 250 ms, never moves), copied as
// scripts/test-hook-loop-hold.mjs copies it. A pinger child asks the hub's own ping route DURING the hold and prints its wait.
//   ① the judge (its table)
//   ② RED CONTROL — the release's road: the same reader over synchronous calls on the main thread (fs.*Sync, one per await) —
//      the hold is the loop's: the gap is past the law and the ping waits for it
//   ③ the shipped road (fs.promises): the same hold holds nothing — no gap past the law, the ping answered inside it; a caller
//      that waits gets the NAMED late fact at the deadline; LAW 1 under the real hold: three asks later, ONE read was started; the
//      writer releases it, the read comes back, and only then may the next one start
import './scratch.mjs';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const Gm = require(path.join(REPO, 'src/server/agent-tool-generators.js'));

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok(): a leg's verdict must be a boolean (${n})`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? ' — ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LAW_MS = 250, RELEASE_MS = 1200, PING_AT_MS = 300, DEADLINE_MS = 400;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-rootfacts-'));
const kids = new Set();
const done = () => { for (const k of kids) { try { if (k.exitCode === null) k.kill('SIGKILL'); } catch { } } try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } };
process.on('exit', done);

// ── THE 3-NUMBER JUDGE (copied from scripts/test-boot-loop-hold.mjs — the same law, the same words) ──
const stallOver = (control, at, ms) => ((control && control.gaps) || []).reduce((m, x) => Math.max(m, Math.min(at + ms, x.at + x.ms) - Math.max(at, x.at)), 0);
function judge(clock, law = LAW_MS, control = null) {
  const gaps = ((clock && clock.gaps) || []).map((g) => { const ctl = Math.round(stallOver(control, (clock.origin || 0) + g.at, g.ms)); return { ...g, ctl, held: Math.max(0, g.ms - Math.max(g.wait || 0, ctl)) }; });
  const over = gaps.filter((g) => g.held >= law);
  const top = gaps.reduce((m, g) => (!m || g.ms > m.ms ? g : m), null);
  return { ok: !!clock && clock.first != null && !over.length, over, gaps, top, maxMs: top ? top.ms : 0, maxHeld: gaps.reduce((m, g) => Math.max(m, g.held), 0), firstMs: clock ? clock.first : null };
}
const gapWords = (g) => g ? `${g.ms} ms (cpu ${g.cpu ?? '?'} · run-queue wait ${g.wait ?? '?'} · control ${g.ctl} ⇒ held ${g.held})` : 'none';
console.log('① the judge');
ok(!judge({ first: 900, gaps: [{ at: 2000, ms: 300 }] }).ok && judge({ first: 900, gaps: [{ at: 2000, ms: 249 }] }).ok, 'a 300 ms gap is red, a 249 ms one green');
ok(judge({ first: 900, gaps: [{ at: 2000, ms: 300, cpu: 175, wait: 120 }] }).ok && judge({ first: 900, origin: 1e6, gaps: [{ at: 2000, ms: 300, cpu: 90, wait: 0 }] }, LAW_MS, { gaps: [{ at: 1e6 + 1990, ms: 220 }] }).ok, 'a gap the box made wait (run-queue) or stalled on the same-box control is excused');
ok(!judge({ first: 900, gaps: [{ at: 2000, ms: 260, cpu: 2, wait: 0 }] }).ok && !judge(null).ok, 'a thread asleep IN a call (no CPU, no run-queue wait — the FIFO / NFS shape) is all hold; no clock proves nothing');

let fifoOk = true; try { execFileSync('mkfifo', ['--version'], { stdio: 'ignore' }); } catch { fifoOk = false; }
if (!fifoOk) { console.log('  SKIP (LOUD): mkfifo is not on PATH — the placed hold cannot be made; the legs ② ③ did not run'); console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`); process.exit(fail ? 1 : 0); }

// ── the clocks: the main thread's own 10 ms clock (each gap with its CPU + run-queue wait), the same-box control ──
const clock = { origin: performance.timeOrigin, first: null, gaps: [] };
let sfd = -1; try { sfd = fs.openSync('/proc/thread-self/schedstat', 'r'); } catch { }
const sb = Buffer.alloc(96);
const facts = () => { const c = process.threadCpuUsage(); let w = null; if (sfd >= 0) { try { const n = fs.readSync(sfd, sb, 0, 96, 0); w = Number(sb.toString('latin1', 0, n).split(' ')[1]) / 1e6; } catch { } } return { cpu: (c.user + c.system) / 1000, wait: w }; };
let last = performance.now(), lastF = facts();
const tickT = setInterval(() => { const t = performance.now(), f = facts(); if (clock.first === null) clock.first = Math.round(t); else if (t - last - 10 >= 20) clock.gaps.push({ at: Math.round(last), ms: Math.round(t - last - 10), cpu: Math.round(f.cpu - lastF.cpu), wait: f.wait == null || lastF.wait == null ? null : Math.round(f.wait - lastF.wait) }); last = t; lastF = f; }, 10);
const CONTROL = path.join(tmp, 'control.cjs');
fs.writeFileSync(CONTROL, `const { performance } = require('perf_hooks'); const fs = require('fs');
const out = process.argv[2], gaps = []; let last = performance.now();
setInterval(() => { const t = performance.now(); if (t - last - 10 >= 20) gaps.push({ at: Math.round(performance.timeOrigin + last), ms: Math.round(t - last - 10) }); last = t; }, 10);
const save = () => { try { fs.writeFileSync(out + '.tmp', JSON.stringify({ gaps })); fs.renameSync(out + '.tmp', out); } catch { } };
setInterval(save, 250); process.on('SIGTERM', () => { save(); process.exit(0); });
`);
// THE HUB'S PING: a route of this process; THE PINGER: a child that asks it at PING_AT_MS and prints how long it waited
const hub = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('pong'); });
await new Promise((r) => hub.listen(0, '127.0.0.1', r));
const PINGER = path.join(tmp, 'pinger.cjs');
fs.writeFileSync(PINGER, `const http = require('http'); const { performance } = require('perf_hooks');
setTimeout(() => { const t = performance.now(); const rq = http.get({ host: '127.0.0.1', port: Number(process.argv[2]), path: '/ping' }, (res) => { res.resume(); res.on('end', () => { process.stdout.write(String(Math.round(performance.now() - t))); process.exit(0); }); }); rq.on('error', (e) => { process.stdout.write('error ' + e.code); process.exit(1); }); }, Number(process.argv[3]));
setTimeout(() => { process.stdout.write('no answer'); process.exit(2); }, 10000);
`);
const pingDuring = () => new Promise((resolve) => {
  const p = spawn(process.execPath, [PINGER, String(hub.address().port), String(PING_AT_MS)], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }); kids.add(p);
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.on('exit', () => { kids.delete(p); resolve(out.trim()); });
});
// THE WRITER: the other end of the FIFO, opened at RELEASE_MS (it ends itself after it wrote; its own deadline bounds it)
// (r827) A SECOND, INDEPENDENT RELEASER: another writer that opens the other end 5 s later, on its own clock. If the first writer ever fails — a parent's spawn
// timeout cannot fire while the red control blocks this loop — the hold still ends; unneeded, it waits in its open() and is ended with
// the suite's other children (by the pid held)
const releaseAt = (fifo, ms) => {
  const w = spawn(process.execPath, ['-e', `setTimeout(() => { require('fs').writeFileSync(${JSON.stringify(fifo)}, 'not a gitdir line\\n'); process.exit(0); }, ${ms});`], { stdio: 'ignore', timeout: 15000 }); kids.add(w); w.on('exit', () => kids.delete(w));
  const belt = spawn(process.execPath, ['-e', `setTimeout(() => { require('fs').writeFileSync(${JSON.stringify(fifo)}, 'not a gitdir line\\n'); process.exit(0); }, 5000);`], { stdio: 'ignore' }); kids.add(belt); belt.on('exit', () => kids.delete(belt));   // its own timer, one process
  return w;
};
const rootWithFifo = (tag) => { const r = path.join(tmp, tag); fs.mkdirSync(path.join(r, 'data'), { recursive: true }); execFileSync('mkfifo', [path.join(r, '.git')]); return r; };
// one measured span: the control beside it, the clock's gaps inside it judged
const measure = async (tag, fn) => {
  const out = path.join(tmp, `control-${tag}.json`);
  const ctl = spawn(process.execPath, [CONTROL, out], { stdio: 'ignore' }); kids.add(ctl);
  await sleep(150);
  const g0 = clock.gaps.length, t0 = Date.now();
  const r = await fn();
  const ms = Date.now() - t0;
  await sleep(60);   // the clock's next tick past the span (a hold is recorded when the loop turns again)
  const span = { ...clock, gaps: clock.gaps.slice(g0) };
  ctl.kill('SIGTERM');
  await Promise.race([new Promise((res) => (ctl.exitCode !== null ? res() : ctl.once('exit', res))), sleep(3000)]);
  kids.delete(ctl);
  let control = null; try { control = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { }
  return { r, ms, j: judge(span, LAW_MS, control) };
};
await sleep(200);

try {
  console.log('② RED CONTROL — the release\'s road: the same reader over synchronous calls on the main thread');
  {
    const root = rootWithFifo('red');
    const G = Gm.create({ rootDir: root, port: 0 });
    // the release's shape: each file call of the read is a SYNCHRONOUS call on the loop (one per await, as the release ran them)
    G._setRootFs({ stat: async (p) => fs.statSync(p), readFile: async (p, e) => fs.readFileSync(p, e), realpath: async (p) => fs.realpathSync(p) });
    G._setRootReadMs(DEADLINE_MS);
    const m = await measure('red', async () => {
      const ping = pingDuring();
      await sleep(50);   // the pinger is under way; its ask lands at PING_AT_MS
      releaseAt(path.join(root, '.git'), RELEASE_MS);
      const f = await G.rootFactsNow();
      return { f, ping: await ping };
    });
    console.log(`  (the release's road: the span ${m.ms} ms; the loop's top gap ${gapWords(m.j.top)}; the ping waited ${m.r.ping} ms; the facts ${JSON.stringify({ error: m.r.f.error || null, gitDir: m.r.f.gitDir })})`);
    ok(!m.j.ok && m.j.maxHeld >= LAW_MS && Number(m.r.ping) >= LAW_MS, `RED CONTROL: the release's synchronous read holds the loop ${m.j.maxHeld} ms (≥ ${LAW_MS} ms) while the .git does not answer — the hub's own ping waited ${m.r.ping} ms`, { over: m.j.over, ping: m.r.ping });
  }
  console.log('③ the shipped road: the same hold, off the loop — one read in flight, a caller that waits is told by name');
  {
    const root = rootWithFifo('cure');
    const G = Gm.create({ rootDir: root, port: 0 });
    G._setRootReadMs(DEADLINE_MS);
    let stats = null, verdicts = [], waited = null;
    const m = await measure('cure', async () => {
      const ping = pingDuring();
      const t0 = Date.now();
      const f = await G.rootFactsNow();   // the read is held in the FIFO's open(): past the deadline the caller is told by name
      waited = Date.now() - t0;
      // LAW 1 under the real hold: three asks (the cache, and callers that wait) while the read is still out
      for (let k = 0; k < 3; k++) { verdicts.push(G.rootVerdict().kind); verdicts.push((await G.rootFactsNow()).late === true); }
      stats = G.rootReadStats();
      const p = await ping;
      releaseAt(path.join(root, '.git'), 50);   // the writer opens the other end: the held read comes back
      for (let i = 0; i < 400 && G.rootReadStats().ended < 1; i++) await sleep(10);   // its own end, bounded (4 s)
      return { f, ping: p };
    });
    const after = G.rootReadStats(), vAfter = G.rootVerdict();
    console.log(`  (the shipped road: the span ${m.ms} ms; the loop's top gap ${gapWords(m.j.top)}; the ping waited ${m.r.ping} ms; the waiting caller was told after ${waited} ms: late=${m.r.f.late} «${String(m.r.f.error).slice(0, 100)}»; the asks ${JSON.stringify(verdicts)}; the reads while held ${JSON.stringify(stats)} → after the release ${JSON.stringify(after)}; the verdict after ${vAfter.kind} «${String(vAfter.why || '').slice(0, 100)}»)`);
    ok(m.j.ok && m.j.maxHeld < LAW_MS && Number(m.r.ping) < LAW_MS, `the same hold holds the loop ${m.j.maxHeld} ms at most (< ${LAW_MS} ms), and the hub's ping is answered in ${m.r.ping} ms — the read waits in a file thread, not on the loop`, { over: m.j.over, ping: m.r.ping });
    ok(m.r.f.late === true && /did not answer in 0\.4 s/.test(m.r.f.error) && waited >= DEADLINE_MS - 20 && waited < DEADLINE_MS + LAW_MS, `a caller that waits is told by NAME at the deadline (${waited} ms): «… did not answer in 0.4 s» — never a hold`, { waited, f: m.r.f });
    ok(!!stats && stats.started === 1 && stats.ended === 0 && stats.inFlight === true && verdicts.filter((x) => x === 'unknown').length === 3, 'LAW 1 under the real hold: three asks while the read is out started NO second read (one file thread at most, whatever a hung mount does)', { stats, verdicts });
    ok(after.ended === 1 && after.inFlight === false && vAfter.kind === 'unknown' && /without a gitdir: line/.test(String(vAfter.why || '')), 'the writer released the FIFO: the held read CAME BACK — its facts are the verdict (the .git held no gitdir: line: the error fact, said); only now may the next read start', { after, vAfter });
  }
} finally {
  clearInterval(tickT); hub.close(); done();
}
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
