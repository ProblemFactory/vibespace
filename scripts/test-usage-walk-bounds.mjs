#!/usr/bin/env node
// test-usage-walk-bounds — lane lg-remote-hardening (row B-5278 unit 1; the coordinator's r442): THE TWO USAGE ROADS, bounded.
// FAST, in-process (the walker in this process; the shipped scanner and the agent's walk child each as one node child over
// the same fixture). Nothing large is allocated; no clock is read for a bound (the time bound runs on an injected clock).
//   ① L1 THE WALK's RUN BOUND (src/usage-walker.js, the shipped scanner's B-6ded law): a walk stops after a WHOLE line once
//     its output is spent, says `more`, its cursor that line's; the next walks land the rest, each record once, in order;
//     the scanner stops at the same line with the same cursor bytes; the agent's walk child takes `--max-out` and says
//     __more__; a time bound on an injected clock, counted from the walk's start or from its first line read (the push);
//     a compressed rollout stopped part-way (zpart) and read on, the scanner the same. CONTROLS: the line check cut, the time
//     check cut, the compressed rollout's line check cut — each passes its bound.
//   ② THE PUSH (src/agentd/answer-caps.js): a walk stopped on its bound has the rest walked after THAT batch's ack, never
//     before (a kick waits, at most the wait); a refused batch ends the wait; the dropped count rides the LAST chunk (a walk
//     with only dropped records still sends it); THE LOOP RUN (usagePushLoop over a stand-in child and hand-run timers): the
//     ack walks the rest, no ack walks again after the wait, one walk at a time, a dead link walks nothing. CONTROLS: the
//     batch's mark cut, the loop's wait cut — a kick walks before the ack.
//   ③ L2 THE CURSOR MAP = THE FILES ON DISK (the device walk child's: opt-in; the hub's own walk keeps its hourly L0 sweep),
//     by the hub's own proof (src/usage-history.js L0): an entry is dropped only when
//     its own folder was listed this walk, no longer holds its file, and still holds a LIVE entry — a gone file, agent or
//     rollout beside a live one; KEPT: an emptied folder (an unmounted mount point answers just that), a gone project
//     folder, a session with no subagents folder, one that could not be read (a file where it should be), a blocked one,
//     an unlisted projects or codex root. The scanner writes the same cursor bytes. CONTROL: the live-entry guard cut, in a
//     copy, drops the emptied folder's entries.
//   ④ L3 ONE EVENT's STRINGS: an id over 256 bytes or no string at all DROPPED AND COUNTED (never cut), a model over 128
//     bytes and a path over 4096 read as unknown; the cursor keeps no unbounded id; the scanner the same, its count as its
//     last line; the agent's child says __oversize__; a rollout's model persisted in its cursor bounded too; the hub's own
//     in-process walk says its count. The hub: usageScan hands down the harvest's bound and the map without sid, reads
//     __more__ / __oversize__; the count is said once on each road; an event-less walk still moves the hub's kept cursor.
//     CONTROL: the drop cut, in a copy.
//   ⑤ THE OLDEST AGENT THAT SAYS usage-scan-hub-cursor (18e7d9436, its walker a fixture checked against the history):
//     its walker, handed the map without sid, walks exactly as with it — events and cursors.
//   ⑥ B-5278 (b): ONE RECORD OVER THE LINE (its raw line 64 KiB of text, a 9 KB model and path, over a stand-in 4 KiB line) is pushed,
//     acked and never walked again — the push goes on. CONTROL: the producer's name cap cut, in a copy: refused at every walk.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-walkbounds-'));
const W = require('../src/usage-walker.js');
const AC = require('../src/agentd/answer-caps.js');
const DOOR = require('../src/mount-door.js');
const SCANNER = path.join(REPO, 'data/bin/vibespace-usage-scan');
const AGENT = path.join(REPO, 'src/agentd/agentd.js');
const M = mutantCopies('usage-walk-bounds', REPO);
const WSRC = read('src/usage-walker.js');
let skipped = 0;

const TS = '2026-11-20T10:00:00.000Z';
const rec = (rid, { model = 'claude-fable-5', mid, cwd } = {}) => JSON.stringify({
  type: 'assistant', requestId: rid, timestamp: TS, ...(cwd ? { cwd } : {}),
  message: { id: mid || ('msg_' + rid), model, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5 } },
}) + '\n';
const put = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
const homeOf = (tag) => { const h = path.join(tmp, tag); fs.mkdirSync(path.join(h, '.claude', 'projects'), { recursive: true }); fs.mkdirSync(path.join(h, '.codex', 'sessions'), { recursive: true }); return h; };
const projOf = (h, pd) => path.join(h, '.claude', 'projects', pd);
const cxDirOf = (h) => path.join(h, '.codex', 'sessions');
const walk = (Lib, h, opts = {}) => Lib.runUsageWalk({ home: h, codexSessionsDir: cxDirOf(h), cursors: {}, ...opts });
const scan = (h, cursors, env = {}) => {
  const cf = path.join(h, 'scan-cursor.json'); fs.writeFileSync(cf, JSON.stringify(cursors));
  const out = execFileSync(process.execPath, [SCANNER], { encoding: 'utf8', env: { ...process.env, HOME: h, CODEX_HOME: path.join(h, '.codex'), VIBESPACE_USAGE_CURSOR: cf, ...env }, timeout: 30000 });
  return { lines: out.split('\n').filter(Boolean), cursorText: fs.readFileSync(cf, 'utf8') };
};
const child = (h, args) => {
  const r = spawnSync(process.execPath, [AGENT, '--usage-scan-child', path.join(h, 'none-cursor.json'), ...args], { encoding: 'utf8', env: { ...process.env, HOME: h, CODEX_HOME: path.join(h, '.codex') }, timeout: 30000 });
  const lines = String(r.stdout || '').split('\n').filter(Boolean);
  return { code: r.status, manifest: lines.length ? JSON.parse(lines[lines.length - 1]) : null, events: lines.slice(0, -1) };
};
const SID1 = 'a1a1a1a1-b2b2-c3c3-d4d4-e5e5e5e5e5e1', SID2 = 'a1a1a1a1-b2b2-c3c3-d4d4-e5e5e5e5e5e2', SID3 = 'a1a1a1a1-b2b2-c3c3-d4d4-e5e5e5e5e5e3', SID4 = 'a1a1a1a1-b2b2-c3c3-d4d4-e5e5e5e5e5e4';
const TID = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b', TID2 = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';
const SID5 = 'a1a1a1a1-b2b2-c3c3-d4d4-e5e5e5e5e5e5';
const seqClock = (vals) => { let last = 0; return () => (last = vals.length ? vals.shift() : last + 1000); };   // an injected clock: these values, then +1 s a look

console.log('① L1 the walk\'s run bound: stops after a whole line, says more, the rest lands in later walks');
{
  const h = homeOf('l1'), p = projOf(h, '-home-u-a');
  for (const [sid, k] of [[SID1, 'a'], [SID2, 'b'], [SID3, 'c']]) { let s = ''; for (let i = 1; i <= 40; i++) s += rec(`req_${k}${String(i).padStart(3, '0')}`); put(path.join(p, sid + '.jsonl'), s); }
  const full = walk(W, h);
  const evBytes = Buffer.byteLength(full.events[0]) + 1, cap = evBytes * 50 + 7;
  ok(full.events.length === 120 && full.more === false, `unbounded (the hub's own in-process walk): all 120 records, more ${full.more}`, { n: full.events.length });
  const got = [], walks = []; let cur = {}, r;
  do { r = walk(W, h, { cursors: cur, maxOutBytes: cap }); got.push(...r.events); walks.push({ n: r.events.length, more: r.more, bytes: r.events.reduce((a, l) => a + Buffer.byteLength(l) + 1, 0) }); cur = r.cursors; } while (r.more && walks.length < 10);
  ok(walks.length === 3 && walks[0].more && walks[1].more && !walks[2].more && walks.slice(0, 2).every((w) => w.bytes >= cap && w.bytes < cap + evBytes) && got.join('\n') === full.events.join('\n'),
    `a ${cap}-byte bound: ${walks.length} walks (${walks.map((w) => w.n + (w.more ? '+more' : '')).join(', ')}), each stopped just past its bound after a WHOLE line; together every record once, in order`, walks);
  const first = walk(W, h, { maxOutBytes: cap });
  const stoppedIn = Object.entries(first.cursors).filter(([fp, c]) => c.offset < fs.statSync(fp).size);
  ok(stoppedIn.length === 1 && fs.readFileSync(stoppedIn[0][0]).subarray(0, stoppedIn[0][1].offset).toString('utf8').endsWith('\n') && Object.keys(first.cursors).length === 2,
    `the file it stopped in keeps the cursor of that whole line (${stoppedIn.length ? stoppedIn[0][1].offset : '?'} bytes, a line's end); the file after it has no entry yet`, first.cursors);
  const sc = scan(h, {}, { VIBESPACE_USAGE_SCAN_MAX_BYTES: String(cap) });
  ok(sc.lines.join('\n') === first.events.join('\n') && sc.cursorText === JSON.stringify(first.cursors), `the shipped scanner, the same bound: the same ${sc.lines.length} records and the same cursor bytes`, { scanner: sc.lines.length, walker: first.events.length });
  const ch = child(h, ['--max-out', String(cap)]);
  ok(ch.code === 0 && ch.manifest && ch.manifest.__more__ === true && ch.events.join('\n') === first.events.join('\n') && JSON.stringify(ch.manifest.__cursors__) === JSON.stringify(first.cursors),
    `the agent's walk child takes --max-out: the same ${ch.events.length} records, its manifest says __more__`, { code: ch.code, more: ch.manifest && ch.manifest.__more__ });
  const chAll = child(h, []);
  ok(chAll.code === 0 && chAll.events.length === 120 && !('__more__' in chAll.manifest) && read('src/agentd/agentd.js').includes("opts.maxOutBytes = argN('--max-out') || 32 * 1024 * 1024;"), `no bound named: the child walks under the scanner's own 32 MiB / 60 s (all 120 here, no __more__)`, { n: chAll.events.length });
  // the time bound, counted from the walk's START (the harvest roads: the hub's deadline is theirs) — a listing that ate it
  // leaves one line; counted from the first line READ (the push, r557 (1)) — the same listing leaves the walk its whole time
  const fromStart = walk(W, h, { maxMs: 2500, now: seqClock([0, 100000]) });
  const fromRead = walk(W, h, { maxMs: 2500, clock: 'read', now: seqClock([100000]) });
  ok(fromStart.more && fromStart.events.length === 1 && fromRead.more && fromRead.events.length === 3,
    `a 2.5 s time bound on an injected clock whose listing took 100 s: counted from the walk's start, ${fromStart.events.length} record (the harvest roads, the hub's deadline); counted from its first line read, ${fromRead.events.length} (the push: --clock-read)`, { start: fromStart.events.length, read: fromRead.events.length });
  const NoTime = M.load('src/usage-walker.js', anchored(WSRC, 'return now() - T0 >= Number(maxMs); };', 'return false; };', 'walk-time-bound'), 'walk-time-bound');
  ok(walk(NoTime, h, { maxMs: 2500, clock: 'read', now: seqClock([100000]) }).events.length === 120, 'CONTROL (the time check cut, in a copy): the same walk reads all 120 — RED');
  const Cut = M.load('src/usage-walker.js', anchored(WSRC, "          if (spent()) return; // B-5278 (L1) the run's bound: stop after this WHOLE line (its cursor is that line's)\n", '', 'walk-line-bound'), 'walk-line-bound');
  const cutFirst = walk(Cut, h, { maxOutBytes: cap });
  ok(cutFirst.events.length % 40 === 0 && cutFirst.events.length > 51, `CONTROL (the line check cut, in a copy): the walk passes its bound by whole files (${cutFirst.events.length} records for a ${cap}-byte bound) — RED`, { n: cutFirst.events.length });
  // a COMPRESSED rollout read part-way (r557 (5)): the run's bound stops inside it — `zpart` — and the next walks read on
  const zlib = require('node:zlib');
  if (!W.ZSTD_OK || typeof zlib.zstdCompressSync !== 'function') { skipped++; console.log('  - SKIP the compressed rollout legs: this runtime has no zstd'); }
  else {
    const hz = homeOf('l1z'), fz = path.join(cxDirOf(hz), '2026', '11', '20', `rollout-2026-11-20T10-00-00-${TID}.jsonl.zst`);
    let zbody = JSON.stringify({ timestamp: TS, type: 'turn_context', payload: { model: 'gpt-x', cwd: '/srv/p' } }) + '\n';
    for (let i = 1; i <= 30; i++) zbody += JSON.stringify({ timestamp: TS, type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 10, output_tokens: 1 }, total_token_usage: { total_tokens: 100 + i * 11 } } } }) + '\n';
    put(fz, zlib.zstdCompressSync(Buffer.from(zbody)));
    const zAll = walk(W, hz), zTotal = zAll.events.reduce((a, l) => a + Buffer.byteLength(l) + 1, 0), zcap = (Buffer.byteLength(zAll.events[0]) + 1) * 10 + 50;   // a line + its newline, ten and a part: walks of 11, 11, 8 (a stop ON the last line is its own leg below)
    const zGot = [], zParts = []; let zc = {}, zr;
    do { zr = walk(W, hz, { cursors: zc, maxOutBytes: zcap }); zGot.push(...zr.events); zParts.push(zr.cursors[fz] && zr.cursors[fz].zpart); zc = zr.cursors; } while (zr.more && zParts.length < 8);
    ok(zAll.events.length === 30 && zParts.length >= 3 && zParts.slice(0, -1).every((z) => z === 1) && zParts[zParts.length - 1] === undefined && zGot.join('\n') === zAll.events.join('\n'),
      `a compressed rollout under a ${zcap}-byte bound: ${zParts.length} walks, each stopped one marked part-read (zpart), the last whole; every record once, in order`, { walks: zParts });
    const zsc = scan(hz, {}, { VIBESPACE_USAGE_SCAN_MAX_BYTES: String(zcap) }), z1 = walk(W, hz, { maxOutBytes: zcap });
    ok(zsc.lines.join('\n') === z1.events.join('\n') && zsc.cursorText === JSON.stringify(z1.cursors), 'the shipped scanner stops the compressed rollout at the same line, the same cursor bytes (zpart included)');
    const zEnd = walk(W, hz, { maxOutBytes: zTotal });
    ok(zEnd.events.length === 30 && zEnd.cursors[fz] && !('zpart' in zEnd.cursors[fz]), 'a bound that stops ON the last line leaves the rollout whole (no zpart): the next walk does not decompress it again for nothing');
    const ZCut = M.load('src/usage-walker.js', anchored(WSRC, '    if (stopAfterLine && stopAfterLine()) return false; // B-5278 (L1): after a WHOLE line\n', '', 'walk-zst-bound'), 'walk-zst-bound');
    ok(walk(ZCut, hz, { maxOutBytes: zcap }).events.length === 30, 'CONTROL (the compressed rollout\'s line check cut, in a copy): the walk passes its bound by the whole rollout — RED');
  }
}

console.log('② the push: the rest is walked after THAT batch\'s ack, never before; the dropped count rides the last chunk');
{
  const man = (extra) => JSON.stringify({ __cursors__: { f: { offset: 9 } }, ...extra });
  const stdout = (n, extra) => Array.from({ length: n }, (_, i) => JSON.stringify({ rid: 'r' + i, ts: 1 })).join('\n') + '\n' + man(extra) + '\n';
  const runLaw = (Lib, extra, refuseAt = -1) => {
    const st = { seq: 0, pendingCursors: new Map() }, out = []; let calls = 0, t0 = 1000;
    const r = Lib.usagePushWalked(st, stdout(1200, extra), (o) => { if (calls++ === refuseAt) return false; out.push(o); return true; }, () => { }, { now: () => t0 });
    return { st, r, out };
  };
  const a = runLaw(AC, { __more__: true });
  const waitBefore = AC.usagePushWaitMs(a.st, 1000 + 5000), waitLapsed = AC.usagePushWaitMs(a.st, 1000 + AC.PUSH_ACK_WAIT_MS);
  let more = 0; const acked = AC.usagePushAcked(a.st, a.r.seq, () => { }, () => { more++; });
  ok(a.r.more === true && waitBefore === AC.PUSH_ACK_WAIT_MS - 5000 && waitLapsed === 0 && acked === true && more === 1 && AC.usagePushWaitMs(a.st, 1000 + 6000) === 0,
    `a walk stopped on its bound: a kick 5 s later waits ${waitBefore} ms for that batch's ack (0 once ${AC.PUSH_ACK_WAIT_MS} ms passed: the hub's unacked batch walks again, as it always did); its ack walks the rest at once (${more}), and no wait is left`, { waitBefore, waitLapsed, more });
  const b = runLaw(AC, { __more__: true }, 1);
  ok(b.r.refusedAt === 1 && AC.usagePushWaitMs(b.st, 1000 + 1) === 0 && b.st.moreSeq === undefined, 'a bounded batch refused over the line: its pending cursor dropped and the wait with it (nothing is awaited that never went)');
  const c = runLaw(AC, { __oversize__: 3 });
  ok(c.out.length === 3 && c.out[2].oversize === 3 && c.out.slice(0, 2).every((o) => !('oversize' in o)) && c.out[2].seq === c.r.seq, 'the dropped records\' count (3) rides the LAST chunk with the seq, never another');
  const st4 = { seq: 0, pendingCursors: new Map() }, out4 = []; let committed4 = 0;
  const r4 = AC.usagePushWalked(st4, man({ __oversize__: 2 }) + '\n', (o) => { out4.push(o); return true; }, () => { committed4++; });
  ok(out4.length === 1 && out4[0].batch.length === 0 && out4[0].oversize === 2 && out4[0].seq === r4.seq && committed4 === 0 && st4.pendingCursors.has(r4.seq), 'a walk whose only records were dropped still sends their count (an empty batch with the seq), its cursor committed at the ack');
  const st5 = { seq: 0, pendingCursors: new Map() }; let committed5 = 0;
  const r5 = AC.usagePushWalked(st5, man({ __more__: true }) + '\n', () => { throw new Error('nothing to send'); }, () => { committed5++; });
  ok(r5.committed === true && r5.more === true && committed5 === 1, 'a walk stopped on its bound with nothing to send commits at once and says more (the agent walks the rest now)');
  // THE PUSH's LOOP, RUN (r557 (5)): usagePushLoop over a stand-in walk child and hand-run timers
  const loopOf = (Lib, outs) => {
    const q = []; let t = 1000;
    const timers = { setTimeout: (fn, ms) => { const tm = { fn, at: t + ms, live: true }; q.push(tm); return tm; }, clearTimeout: (tm) => { if (tm) tm.live = false; } };
    const due = (ms) => { t += ms; for (;;) { const i = q.findIndex((x) => x.live && x.at <= t); if (i < 0) break; const [x] = q.splice(i, 1); x.fn(); } };
    const st = { seq: 0, pendingCursors: new Map() }, sent = [], walks = [];
    Lib.usagePushLoop(st, { walk: (cb) => { walks.push(t); const o = outs.shift(); if (o === undefined) { st.held = cb; return; } cb(null, o); }, send: (o) => { sent.push(o); return true; }, commit: () => { }, now: () => t, timers });
    return { st, sent, walks, due };
  };
  const L1 = loopOf(AC, [stdout(3, { __more__: true }), stdout(2, {})]);
  L1.st.runWalk(); L1.st.kick(); L1.due(1500);
  const beforeAck = L1.walks.length; L1.st.acked(1); L1.due(0);
  ok(beforeAck === 1 && L1.walks.length === 2 && L1.sent.length === 2 && L1.sent[1].seq === 2, `a walk stopped on its bound: a kick 1.5 s later walks nothing (${beforeAck} walk) — its batch's ACK walks the rest at once (${L1.walks.length} walks)`, { walks: L1.walks });
  const L2 = loopOf(AC, [stdout(3, { __more__: true }), stdout(2, {})]);
  L2.st.runWalk(); L2.st.kick(); L2.due(1500); const held2 = L2.walks.length; L2.due(AC.PUSH_ACK_WAIT_MS);
  ok(held2 === 1 && L2.walks.length === 2, `no ack (the hub left the batch unacked): the kick waits ${AC.PUSH_ACK_WAIT_MS / 1000} s at most, then walks again from the committed cursor`, { walks: L2.walks });
  const L3 = loopOf(AC, [man({ __more__: true }) + '\n', stdout(1, {})]);
  L3.st.runWalk(); L3.due(200);
  ok(L3.walks.length === 2, 'a walk stopped on its bound with nothing to send walks the rest 200 ms later, unasked');
  const L4 = loopOf(AC, []);
  L4.st.runWalk(); L4.st.kick(); L4.due(1500); const during = L4.walks.length; L4.st.held(null, stdout(1, {})); L4.due(200);
  ok(during === 1 && L4.walks.length === 2, 'a kick while a walk runs walks again after it, never two at once');
  const L5 = loopOf(AC, [stdout(1, {})]); L5.st.dead = true; L5.st.runWalk(); L5.st.kick(); L5.due(5000);
  ok(L5.walks.length === 0, 'a dead link walks nothing');
  const AG = read('src/agentd/agentd.js');
  ok(AG.includes('AC.usagePushLoop(st, {') && AG.includes("String(AC.PUSH_WALK_MS), '--clock-read'],") && AG.includes('{ windowsHide: true, timeout: AC.PUSH_WALK_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, env: spawnEnv() }, cb),') && AG.includes('if (st && st.acked) st.acked(msg.seq);'),
    `the agent runs that loop: its walk child under ${AC.sizeOf(AC.PUSH_WALK_BYTES)} / ${AC.PUSH_WALK_MS / 1000} s counted from its first line read, ${AC.PUSH_WALK_TIMEOUT_MS / 60000} min for the child (a listing of minutes, then its reading), the ack handed to it`);
  const LoopCut = M.load('src/agentd/answer-caps.js', anchored(read('src/agentd/answer-caps.js'), '    if (wait > 0) { if (!st.waitTimer)', '    if (false) { if (!st.waitTimer)', 'loop-wait'), 'loop-wait');
  const L6 = loopOf(LoopCut, [stdout(3, { __more__: true }), stdout(2, {})]); L6.st.runWalk(); L6.st.kick(); L6.due(1500);
  ok(L6.walks.length === 2, 'CONTROL (the loop\'s wait cut, in a copy): the kick walks before the bounded batch\'s ack — RED');
  const ACSRC = read('src/agentd/answer-caps.js');
  const NoMark = M.load('src/agentd/answer-caps.js', anchored(ACSRC, '  if (more) { st.moreSeq = seq; st.moreAt = now(); }', '  if (false) { }', 'push-mark'), 'push-mark');
  const d = runLaw(NoMark, { __more__: true });
  ok(NoMark.usagePushWaitMs(d.st, 1000 + 5000) === 0 && d.st.pendingCursors.has(d.r.seq), 'CONTROL (the batch\'s mark cut, in a copy): a kick walks at once while the bounded batch\'s ack is still pending — RED');
}

console.log('③ L2 the cursor map = the files on disk, by the hub\'s own proof: dropped only where its own folder was listed and still holds a live entry');
{
  const h = homeOf('l2'), P = path.join(h, '.claude', 'projects'), p1 = projOf(h, '-home-u-one'), p3 = projOf(h, '-home-u-three'), p4 = projOf(h, '-home-u-four');
  put(path.join(p1, SID1 + '.jsonl'), rec('req_k1'));
  fs.mkdirSync(path.join(p1, SID2), { recursive: true });                      // a session folder with no subagents folder
  put(path.join(p1, SID3, 'subagents'), 'not a folder\n');                     // a session's subagents folder that cannot be read
  put(path.join(p1, SID4, 'subagents', 'agent-live.jsonl'), rec('req_k4'));    // a subagents folder read, one agent gone from it
  put(path.join(p3, SID1 + '.jsonl'), rec('req_k3'));
  fs.mkdirSync(p4, { recursive: true });                                       // an EMPTIED folder (an unmounted mount point)
  const day = path.join(cxDirOf(h), '2026', '11', '20'), rollout = path.join(day, `rollout-2026-11-20T10-00-00-${TID}.jsonl`);
  put(rollout, JSON.stringify({ timestamp: TS, type: 'turn_context', payload: { model: 'gpt-x', cwd: '/srv/p' } }) + '\n');
  const key = (...a) => path.join(...a);
  const GONE = [key(p1, 'gone-' + SID1 + '.jsonl'), key(p1, SID4, 'subagents', 'agent-gone.jsonl'), key(day, `rollout-2026-11-20T10-00-00-${TID2}.jsonl`),
    key(p1, SID5, 'subagents', 'agent-z.jsonl'), key(p1, SID5, 'subagents', 'workflows', 'wf_1', 'agent-w.jsonl')];   // r557 (4): a DELETED session's agents (its folder gone from a live project folder)
  const KEPT = [key(P, '-home-u-two', SID1 + '.jsonl'), key(p1, SID2, 'subagents', 'agent-x.jsonl'), key(p1, SID3, 'subagents', 'agent-y.jsonl'), key(p4, SID1 + '.jsonl'), key(p4, SID2 + '.jsonl'), key(cxDirOf(h), '2026', '11', '19', `rollout-2026-11-19T10-00-00-${TID2}.jsonl`)];
  const map = { [key(p1, SID1 + '.jsonl')]: { offset: 0, lastRid: null }, [key(p1, SID4, 'subagents', 'agent-live.jsonl')]: { offset: 0, lastRid: null }, [rollout]: { offset: 0, lastRid: null } };
  for (const k of [...GONE, ...KEPT]) map[k] = { offset: 10, lastRid: 'x' };
  const r = walk(W, h, { cursors: map, prune: true });
  const has = (m, k) => Object.prototype.hasOwnProperty.call(m, k);
  ok(GONE.every((k) => !has(r.cursors, k)) && r.pruned === GONE.length && KEPT.every((k) => has(r.cursors, k)) && has(r.cursors, key(p3, SID1 + '.jsonl')),
    `dropped (${r.pruned}): a gone file beside a live one, a gone agent beside a live one, a gone rollout beside a live one, a deleted session's agents and workflow agents; KEPT: an emptied folder's entries (an unmounted mount point answers just that), a gone project folder's, a session with no subagents folder, a folder that could not be read, a rollout day folder that is gone`, { pruned: r.pruned, kept: KEPT.filter((k) => has(r.cursors, k)).length, of: KEPT.length });
  const own = walk(W, h, { cursors: map });
  ok(GONE.every((k) => has(own.cursors, k)) && own.pruned === 0 && read('src/agentd/agentd.js').includes('    opts.prune = true;   // B-5278 (L2)'), 'the prune is the device walk child\'s (it asks for it); the hub\'s own in-process walk drops nothing here — its cursor writer keeps its own hourly L0 sweep', { pruned: own.pruned });
  const sc = scan(h, map);
  ok(sc.cursorText === JSON.stringify(r.cursors), 'the shipped scanner writes the same cursor bytes (the same five dropped, the same kept)', { scanner: Object.keys(JSON.parse(sc.cursorText)).length, walker: Object.keys(r.cursors).length });
  // a blocked folder (the door) keeps every entry — asked of the mount door the way the walk asks it
  const blockedKey = key(p3, 'gone-' + SID2 + '.jsonl');
  DOOR.register({ pathBlocked: (q) => (String(q).startsWith(p3) ? p3 : false) });
  let rb; try { rb = walk(W, h, { prune: true, cursors: { ...map, [key(p3, SID1 + '.jsonl')]: { offset: 0, lastRid: null }, [blockedKey]: { offset: 10, lastRid: 'x' } } }); } finally { DOOR.register(null); }
  ok(has(rb.cursors, blockedKey), 'a BLOCKED project folder (its storage not answering) is not read: its gone file\'s entry is kept beside its live one');
  const LiveCut = M.load('src/usage-walker.js', anchored(WSRC, '    if (!under || !rootLive) return false;', '    if (!under) return false;', 'prune-live-guard'), 'prune-live-guard');
  ok(!has(walk(LiveCut, h, { cursors: map, prune: true }).cursors, key(p4, SID1 + '.jsonl')), 'CONTROL (the live-entry guard cut, in a copy): the EMPTIED folder\'s entries are dropped — RED (a live cursor dropped re-walks its whole transcript)');
}

console.log('④ L3 one event\'s strings: an over-long id dropped AND counted, never cut; the count reaches the hub');
{
  const h = homeOf('l3'), p = projOf(h, '-home-u-c');
  const objRid = JSON.stringify({ type: 'assistant', requestId: { not: 'an id' }, timestamp: TS, message: { id: { nor: 'this' }, model: 'claude-fable-5', usage: { input_tokens: 1, output_tokens: 1 } } }) + '\n';
  put(path.join(p, SID1 + '.jsonl'), rec('req_ok1') + rec('req_okmid', { mid: 'msg_' + 'y'.repeat(300) }) + rec('req_model', { model: 'm'.repeat(200) }) + rec('req_cwd', { cwd: '/' + 'd'.repeat(5000) }) + objRid);
  put(path.join(p, SID2 + '.jsonl'), rec('req_' + 'x'.repeat(300)));   // its LAST record's id is the over-long one: the cursor's lastRid is bounded
  const rollout = path.join(cxDirOf(h), '2026', '11', '20', `rollout-2026-11-20T10-00-00-${TID}.jsonl`);
  put(rollout, JSON.stringify({ timestamp: TS, type: 'turn_context', payload: { model: 'g'.repeat(200), cwd: '/srv/p' } }) + '\n'
    + JSON.stringify({ timestamp: TS, type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 50, cached_input_tokens: 10, output_tokens: 5 }, total_token_usage: { total_tokens: 55 } } } }) + '\n');
  const r = walk(W, h);
  const evs = r.events.map((l) => JSON.parse(l)), byRid = Object.fromEntries(evs.map((e) => [e.rid, e]));
  ok(r.oversize === 3 && evs.length === 4 && byRid.req_ok1 && byRid.req_model && byRid.req_model.model === null && byRid.req_cwd && byRid.req_cwd.cwd === null && !evs.some((e) => e.rid.length > 256 || (e.mid && e.mid.length > 256)),
    `an id over 256 bytes (a rid, a mid) or no string at all: DROPPED AND COUNTED (${r.oversize}), never cut; a 200-byte model and a 5001-byte path read as unknown (null); ${evs.length} events go`, { oversize: r.oversize, rids: evs.map((e) => e.rid.slice(0, 20)) });
  const fpLong = path.join(p, SID2 + '.jsonl'), lr = r.cursors[fpLong] && r.cursors[fpLong].lastRid;
  ok(typeof lr === 'string' && lr.length === 257 && lr === ('req_' + 'x'.repeat(300)).slice(0, 257) && Object.values(r.cursors).every((c) => Buffer.byteLength(JSON.stringify(c)) < 8192), `the cursor keeps no unbounded id: the dropped id's lastRid is its first 257 characters (still over the bound), every entry under 8 KiB`, { lastRid: lr && lr.length });
  const cx = evs.find((e) => e.be === 'codex');
  ok(cx && cx.model === null && r.cursors[rollout] && r.cursors[rollout].model === null, 'a rollout\'s 200-byte model reads as unknown in its event AND in its cursor entry (the map the hub keeps)', { model: cx && cx.model, cursorModel: r.cursors[rollout] && r.cursors[rollout].model });
  const sc = scan(h, {});
  ok(sc.lines.slice(0, -1).join('\n') === r.events.join('\n') && sc.lines[sc.lines.length - 1] === '{"__oversize__":3}' && AC.oversizeOf(sc.lines.join('\n') + '\n') === 3 && sc.cursorText === JSON.stringify(r.cursors),
    `the shipped scanner: the same ${sc.lines.length - 1} events and cursor bytes, its count as its own last line (${sc.lines[sc.lines.length - 1]}) — no rid, so an older hub's ingest skips it`, { last: sc.lines[sc.lines.length - 1] });
  const ch = child(h, []);
  ok(ch.code === 0 && ch.manifest.__oversize__ === 3, `the agent's walk child says __oversize__ (${ch.manifest && ch.manifest.__oversize__}) in its manifest`);
  ok(AC.droppedSaid('box-1', 2, 'usage push') === '[usage] box-1: 2 usage records left out of its usage push — an id longer than 256 bytes is no vendor id (B-5278); their tokens are not counted', `the hub's words: «${AC.droppedSaid('box-1', 2, 'usage push')}»`);
  // the hub's usageScan over a stand-in device: the harvest's bound handed down, the map without sid, the manifest read
  const { DeviceManager } = require('../src/agentd/client.js');
  const D = new DeviceManager({ dataDir: path.join(tmp, 'dm'), bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', transport: { kind: 'stream', hostToken: () => 'x', getStream: () => null } });
  D.connect = async () => ({ info: { capabilities: ['usage-scan', 'usage-scan-hub-cursor'] } });
  let asked = null;
  D._streamOp = async (req, { onData }) => { asked = req; onData(Buffer.from(JSON.stringify({ rid: 'r1', ts: 1 }) + '\n' + JSON.stringify({ __cursors__: { '/p/a.jsonl': { offset: 9 } }, __cursorsFrom__: 'hub', __more__: true, __oversize__: 2 }) + '\n')); return { code: 0 }; };
  const hub = { '/p/a.jsonl': { offset: 5, lastRid: 'x', sid: 's-1' }, '/c/r.jsonl': { offset: 2, lastRid: 'cx:1', model: 'gpt-x' } };
  const u = await D.usageScan({ hubCursor: hub, bound: { maxBytes: 64 * 1024 * 1024, maxMs: 60000 } });
  const down = asked && JSON.parse(Buffer.from(asked.stdin64, 'base64').toString('utf8'));
  ok(asked && asked.maxBytes === 64 * 1024 * 1024 && asked.maxMs === 60000 && down && !('sid' in down['/p/a.jsonl']) && down['/p/a.jsonl'].offset === 5 && JSON.stringify(down['/c/r.jsonl']) === JSON.stringify(hub['/c/r.jsonl']) && hub['/p/a.jsonl'].sid === 's-1' && u.more === true && u.oversize === 2,
    'the hub hands the walk its harvest\'s bound and the map WITHOUT sid (the hub\'s own copy untouched), and reads __more__ / __oversize__ back', { asked: asked && { maxBytes: asked.maxBytes, maxMs: asked.maxMs }, down, more: u.more, oversize: u.oversize });
  const HS = read('src/hosts.js');
  ok(HS.includes('r = await dm.usageScan({ hubCursor: hub ? hub.cursors : null, bound: usageScanBound(this.usageHarvestLimits || USAGE_HARVEST_LIMITS) });') && HS.includes("got = { text: r.ndjson, cursors: r.cursors || null, since: r.since || 'device', oversize: r.oversize || 0 };")
    && HS.includes("const dropped = oversize || AC.oversizeOf(text);") && HS.includes("const said = (x) => { if (dropped && !(x && x.ack === false)) console.warn(AC.droppedSaid((h && h.name) || id, dropped, 'usage walk')); return x; };")
    && HS.includes("return r && typeof r.then === 'function' ? r.then(out).then(said) : said(out(r));") && HS.includes("if (r !== false) { dm.ackUsageEvents(m.seq); said(); }") && HS.includes("{ dm.ackUsageEvents(seq); said(); }"),
    'the hub says the count once on each road, and only at its ACK (r557 (6)): the device walk (its manifest), the ssh scanner and the shipped-script fallback (their last line, through the one ingest, once it is durable), the push (its last chunk, at the batch\'s ack — a batch left unacked and sent again is unsaid till then)');
  // the hub's OWN machine walks in process (src/usage-history.js): its dropped count is said once there too
  const { UsageHistory } = require('../src/usage-history.js');
  const said = [], warn0 = console.warn; console.warn = (...a) => { said.push(a.join(' ')); };
  try { const uh = new UsageHistory({ dataDir: path.join(tmp, 'ledger-l3'), homeDir: h }); uh.codexSessionsDir = cxDirOf(h); await uh.scan({ force: true }); } finally { console.warn = warn0; }
  const own = said.filter((l) => /usage records left out of its usage walk/.test(l));
  ok(own.length === 1 && own[0].startsWith('[usage] this machine: 3 usage records'), `the hub's own in-process walk says its dropped count once («${own[0] || 'nothing said'}»)`, said.filter((l) => /\[usage\]/.test(l)).slice(0, 3));
  // a walk with NO events still hands its cursors to the hub's copy (the ledger takes an empty batch and commits them)
  const { UsageHistory: UH2 } = require('../src/usage-history.js');
  const led = new UH2({ dataDir: path.join(tmp, 'ledger-empty'), homeDir: path.join(tmp, 'nohome') }); led.codexSessionsDir = path.join(tmp, 'nohome', '.codex', 'sessions');
  const curs = { '/p/a.jsonl': { offset: 77, lastRid: 'r9' } };
  const ing = await led.ingestRemoteEvents('host-e', 'box-e', '', { cursors: curs, since: 'hub' });
  const kept = led.hostCursorOf('host-e');
  ok(kept && JSON.stringify(kept.cursors) === JSON.stringify(curs) && read('src/hosts.js').includes("const r = (text || cursors) ? ledger.ingestRemoteEvents(id, (h && h.name) || id, text || '', { cursors, since })"),
    'an event-less walk (stopped on its bound with none, or every record dropped) moves the hub\'s kept cursor — the ingest runs for its cursors alone, never the same place re-read at every harvest', { kept: kept && kept.cursors, ing });
  // (r557 (3)) the hub's kept cursor is written only when it MOVED: an acked harvest that found nothing rewrites no file
  await led.whenHostCursorWritten('host-e');   // B-0248 unit 4: the cursor file is the store writer's — on disk once its write lands
  const cfE = led._hostCursorFile('host-e'), inoE = fs.statSync(cfE).ino;
  await led.ingestRemoteEvents('host-e', 'box-e', '', { cursors: curs, since: 'hub' }); await led.whenHostCursorWritten('host-e');
  const sameE = fs.statSync(cfE).ino === inoE;
  await led.ingestRemoteEvents('host-e', 'box-e', '', { cursors: { '/p/a.jsonl': { offset: 99, lastRid: 'r9' } }, since: 'hub' }); await led.whenHostCursorWritten('host-e');
  ok(sameE && fs.statSync(cfE).ino !== inoE && led.hostCursorOf('host-e').cursors['/p/a.jsonl'].offset === 99, 'the hub\'s kept cursor file is written only when the cursor moved — the same cursors again rewrite nothing (the same inode), a moved one is written', { same: sameE });
  const onDisk = JSON.parse(fs.readFileSync(cfE, 'utf8')), dig = led._hostCursorDigest && led._hostCursorDigest.get('host-e');
  // r4006 law C (r806 stands): NO SECOND COPY OF THE MAP's TEXT UNDER ANY NAME once its write landed — every own property of the
  // ledger is searched (strings, a Map's values, an object's values, a few levels down) for the cursor map's text
  const textOf = JSON.stringify({ '/p/a.jsonl': { offset: 99, lastRid: 'r9' } });
  const holdsText = (o, needle) => { const seen = new Set(); const has = (x, d) => { if (typeof x === 'string') return x.includes(needle); if (!x || typeof x !== 'object' || d > 3 || seen.has(x)) return false; seen.add(x);
    if (x instanceof Map) return [...x.values()].some((y) => has(y, d + 1)); if (Array.isArray(x) || x instanceof Set || Buffer.isBuffer(x)) return false; return Object.values(x).some((y) => has(y, d + 1)); };
    return Object.getOwnPropertyNames(o).some((k) => { let v; try { v = o[k]; } catch { return false; } return has(v, 0); }); };
  const secondCopy = holdsText(led, textOf);
  ok(!secondCopy && !led._hostCursorJson && typeof dig === 'string' && dig.length === 44 && onDisk.cursorsDigest === dig && onDisk.cursors['/p/a.jsonl'].offset === 99 && onDisk.v === 1,
    'r806: the hub keeps the map\'s DIGEST to compare (44 characters a machine), never a second copy of its text; the record is written from the one string, its digest in it (a restart compares without a second stringify)', { dig: dig && dig.length, keys: Object.keys(onDisk) });
  { const probe = Object.create(null); probe._anyNameAtAll = new Map([['host-e', { kept: textOf }]]);
    ok(holdsText(probe, textOf) && !holdsText({ _hostCursorDigest: new Map([['host-e', dig]]) }, textOf), 'r4006 law C, the pin\'s RED: a second copy kept under ANY name (a Map of records, here) is seen by it; the digest alone is not', { secondCopy }); }
  // the RESTART roads (round wf9pjdvd9): a record an OLDER hub wrote (no digest: computed once from its map) and one this hub
  // wrote (its digest read back) — after a restart (a new ledger over the same folder) the same cursors write nothing
  const dirR = path.join(tmp, 'ledger-restart'), noHome = path.join(tmp, 'nohome');
  const legacy = { v: 1, host: 'host-r', cursors: { '/p/x.jsonl': { offset: 5, lastRid: 'q' } }, since: 'hub', lastTs: null, lastRid: null, events: 0, at: 1 };
  const R1 = new UH2({ dataDir: dirR, homeDir: noHome }); R1.codexSessionsDir = path.join(noHome, '.codex', 'sessions');
  fs.mkdirSync(R1.hostCursorsDir, { recursive: true }); const cfR = R1._hostCursorFile('host-r'); fs.writeFileSync(cfR, JSON.stringify(legacy));
  const inoL = fs.statSync(cfR).ino;
  await R1.ingestRemoteEvents('host-r', 'box-r', '', { cursors: { '/p/x.jsonl': { offset: 5, lastRid: 'q' } }, since: 'hub' }); await R1.whenHostCursorWritten('host-r');
  const legacySame = fs.statSync(cfR).ino === inoL;
  await R1.ingestRemoteEvents('host-r', 'box-r', '', { cursors: { '/p/x.jsonl': { offset: 6, lastRid: 'q' } }, since: 'hub' }); await R1.whenHostCursorWritten('host-r');   // moved: written, its digest in it
  const inoM = fs.statSync(cfR).ino;
  const R2 = new UH2({ dataDir: dirR, homeDir: noHome }); R2.codexSessionsDir = R1.codexSessionsDir;   // the restart
  await R2.ingestRemoteEvents('host-r', 'box-r', '', { cursors: { '/p/x.jsonl': { offset: 6, lastRid: 'q' } }, since: 'hub' }); await R2.whenHostCursorWritten('host-r');
  ok(legacySame && inoM !== inoL && fs.statSync(cfR).ino === inoM && typeof JSON.parse(fs.readFileSync(cfR, 'utf8')).cursorsDigest === 'string',
    'after a restart the same cursors write nothing on both roads: a record an older hub wrote (no digest — computed once from its map) and one this hub wrote (its digest read back); a moved cursor is written', { legacySame, moved: inoM !== inoL, restartSame: fs.statSync(cfR).ino === inoM });
  // (r557 (2)) no bound named (an OLDER hub keeps no cursor of an event-less walk): the default bound fires only once an event went
  const hn = homeOf('l3-floor'); put(path.join(projOf(hn, '-home-u-floor'), SID1 + '.jsonl'), Array.from({ length: 5 }, () => JSON.stringify({ type: 'user', timestamp: TS }) + '\n').join('') + rec('req_n1') + rec('req_n2') + rec('req_n3'));
  const bare = walk(W, hn, { maxMs: 500, now: seqClock([0]) }), floor = walk(W, hn, { maxMs: 500, now: seqClock([0]), needEvent: true });
  ok(bare.more && bare.events.length === 0 && floor.more && floor.events.length === 1 && read('src/agentd/agentd.js').includes("if (!argN('--max-out') && !argN('--max-ms')) opts.needEvent = true;"),
    `five lines without usage, then three records, under a 0.5 s bound (the clock moves 1 s a look): the bound alone stops with ${bare.events.length} events (an older hub would drop that walk's cursors and walk the same place again); with no bound named the agent's child walks on to its first event (${floor.events.length})`, { bare: bare.events.length, floor: floor.events.length });
  const Keep = M.load('src/usage-walker.js', anchored(WSRC, '  if (badS(ev.rid, ID_MAX) || badS(ev.mid, ID_MAX)) return null;', '  if (false) return null;', 'drop-cut'), 'drop-cut');
  const kr = walk(Keep, h);
  ok(kr.oversize === 0 && kr.events.some((l) => JSON.parse(l).rid.length > 256), 'CONTROL (the drop cut, in a copy): the 304-byte id goes out uncounted — RED');
}

console.log('⑤ the oldest agent that says usage-scan-hub-cursor walks the map without sid exactly as with it');
{
  const OLDEST = '18e7d9436';
  // (r557 (5)) THE OLDEST WALKER IS A FIXTURE (scripts/fixtures/usage-walker-18e7d9436.js.txt, its file byte for byte): the leg
  // runs on every clone, a depth-1 one too; where the history is there, the fixture is checked against it
  const FIX = read('scripts/fixtures/usage-walker-18e7d9436.js.txt');
  const g = spawnSync('git', ['-C', REPO, 'show', `${OLDEST}:src/usage-walker.js`], { encoding: 'utf8', maxBuffer: 16 << 20 });
  if (g.status === 0 && g.stdout) ok(g.stdout === FIX, `the fixture is ${OLDEST}'s src/usage-walker.js byte for byte (this clone has the history)`);
  else console.log(`  - (this clone has no history of ${OLDEST}: the fixture alone — checked byte for byte wherever the history is)`);
  const libs = [['this tree\'s walker', W], [`the oldest hub-cursor agent's walker (${OLDEST}, the fixture)`, M.load('src/usage-walker.js', FIX, 'oldest-hub-cursor')]];
  const h = homeOf('l5'), p = projOf(h, '-home-u-five');
  put(path.join(p, SID1 + '.jsonl'), rec('req_f1') + rec('req_f2'));
  put(path.join(p, SID2 + '.jsonl'), rec('req_g1'));
  const w1 = walk(W, h), w2 = walk(W, h, { cursors: w1.cursors });   // the second walk: unchanged files keep their sid in the map
  fs.appendFileSync(path.join(p, SID1 + '.jsonl'), rec('req_f3'));
  const withSid = w2.cursors, without = AC.cursorsWithoutSid(withSid);
  const hadSid = Object.values(withSid).filter((c) => 'sid' in c).length;
  for (const [name, Lib] of libs) {
    const a = Lib.runUsageWalk({ home: h, codexSessionsDir: cxDirOf(h), cursors: withSid }), b = Lib.runUsageWalk({ home: h, codexSessionsDir: cxDirOf(h), cursors: without });
    ok(hadSid === 2 && a.events.length === 1 && a.events.join('\n') === b.events.join('\n') && JSON.parse(b.events[0]).sid === SID1 && JSON.stringify(a.cursors) === JSON.stringify(b.cursors),
      `${name}: handed the map without sid (${hadSid} entries had one), the same event (its sid from the path: ${b.events[0] ? JSON.parse(b.events[0]).sid.slice(0, 8) : '?'}…) and the same cursors as with it`, { a: a.events.length, b: b.events.length });
  }
}

for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
if (skipped) console.log(`  (${skipped} leg(s) skipped, each said above)`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('⑥ B-5278 (b): ONE usage record over the line can no longer stall a machine\'s push for good');
{
  // its RAW line is far over the push's line — here a stand-in bound of 4 KiB (the real one is the link's LINE_MAX): 64 KiB of
  // text, a 9 KB model and a 9 KB path. The producer's caps (L3) keep its EVENT a few hundred bytes, so its batch goes, the
  // hub's ack commits the cursor past it, and the next walk reads nothing again. Before L3 the same event rode its 9 KB model:
  // the batch was refused at every walk (the cursor saved before kept, the record walked again) — the push stalled for good
  const h = homeOf('overline'), p6 = projOf(h, '-home-u-c'), BOUND = 4096;
  const big = JSON.stringify({ type: 'assistant', requestId: 'req_big', timestamp: TS, cwd: '/' + 'p'.repeat(9000), message: { id: 'msg_big', model: 'm'.repeat(9000), content: [{ type: 'text', text: 'w'.repeat(64 * 1024) }], usage: { input_tokens: 7, output_tokens: 3 } } }) + '\n';
  put(path.join(p6, SID1 + '.jsonl'), rec('req_a') + big + rec('req_b'));
  const pushOnce = (Lib, st, cursors) => {
    const r = walk(Lib, h, { cursors });
    const out = r.events.join('\n') + (r.events.length ? '\n' : '') + JSON.stringify({ __cursors__: r.cursors, ...(r.oversize ? { __oversize__: r.oversize } : {}) }) + '\n';
    let committed = null, longest = 0;
    const res = AC.usagePushWalked(st, out, (o) => { const n = Buffer.byteLength(JSON.stringify(o)); longest = Math.max(longest, n); return n <= BOUND; }, (c) => { committed = c; });
    if (res.sent) AC.usagePushAcked(st, res.seq, (c) => { committed = c; }, () => { });
    return { events: r.events.length, sent: !!res.sent, refusedAt: res.refusedAt, committed, longest };
  };
  const st = { seq: 0, pendingCursors: new Map() };
  const a = pushOnce(W, st, {}), b = pushOnce(W, st, a.committed || {});
  ok(a.events === 3 && a.sent && a.longest <= BOUND && a.committed && b.events === 0 && !!b.committed,
    `the record over the line: its event goes within the line (the longest line sent ${a.longest} bytes ≤ ${BOUND}), the ack commits the cursor past it, and the next walk reads nothing again — the push goes on`, { first: a, second: { events: b.events } });
  const NoCap = M.load('src/usage-walker.js', anchored(WSRC, "  for (const k of ['model', 'tier']) if (badS(ev[k], NAME_MAX)) ev[k] = null;\n", '', 'walk-name-cap'), 'walk-name-cap');
  const stx = { seq: 0, pendingCursors: new Map() };
  const ax = pushOnce(NoCap, stx, {}), bx = pushOnce(NoCap, stx, ax.committed || {});
  ok(!ax.sent && !ax.committed && !bx.sent && !bx.committed && bx.events === 3, 'CONTROL (the producer\'s name cap cut, in a copy): the event rides its 9 KB model, its batch is refused at EVERY walk and the cursor never moves — the stall, for good (red)', { first: ax, second: bx });
}

// ── B-0248 step 2, unit 4 (lane bl-loop-b, 主开发 r3320 / r3883): THE HOST CURSOR IS WRITTEN BY THE STORE WRITER ───────────────
// The release wrote _host-cursors/<host>.json by a temp + rename on the loop at every harvest that moved a machine's cursor
// (~60 an hour per paired machine): a rename's whole delay on slow storage. A placed 400 ms stall in every main-thread write under
// the cursors' folder (scripts/fixtures/fs-stall.cjs; the writer's thread loads its own fs): three ingests that move the cursor
console.log('⑦ B-0248 unit 4: the hub\'s kept cursor is the store writer\'s — the loop never waits for its write');
{
  const STALL = require('../scripts/fixtures/fs-stall.cjs');
  const STALL_MS = 400, TICK_MS = 10;
  const lateMeter = () => { let last = performance.now(), worst = 0; const t = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last - TICK_MS); last = n; }, TICK_MS); return { stop() { clearInterval(t); return Math.round(worst); } }; };
  const { UsageHistory: UHS } = require('../src/usage-history.js');
  const SWs = require('../src/store-writer.js').storeWriter();
  let nS = 0;
  const cursorScene = async ({ releaseWrite = false } = {}) => {
    const led = new UHS({ dataDir: path.join(tmp, 'ledger-b0248-' + (++nS)), homeDir: path.join(tmp, 'nohome') }); led.codexSessionsDir = path.join(tmp, 'nohome', '.codex', 'sessions');
    fs.mkdirSync(led.hostCursorsDir, { recursive: true });
    // the RED copy: the process writer's hand-off of a cursor file written at the call instead (the release's temp + rename)
    const realDirty = SWs.dirty;
    if (releaseWrite) SWs.dirty = function (file, o) { if (String(file).startsWith(led.hostCursorsDir)) { const b = o.produce(); fs.writeFileSync(file + '.tmp', b); fs.renameSync(file + '.tmp', file); return; } return realDirty.call(this, file, o); };
    const S = STALL.install({ under: led.hostCursorsDir, ms: STALL_MS }), meter = lateMeter();
    let late = null;
    try {
      for (let i = 1; i <= 3; i++) { await led.ingestRemoteEvents('host-s', 'box-s', '', { cursors: { '/p/s.jsonl': { offset: 100 * i, lastRid: 'r' + i } }, since: 'hub' }); await new Promise((r) => setTimeout(r, 120)); }
      await led.whenHostCursorWritten('host-s');
    } finally { late = meter.stop(); S.restore(); SWs.dirty = realDirty; }
    let onDisk = null; try { onDisk = JSON.parse(fs.readFileSync(led._hostCursorFile('host-s'), 'utf8')); } catch { }
    return { late, stalled: S.calls.filter((c) => c.kind === 'write' && c.stalled).length, offset: onDisk && onDisk.cursors && onDisk.cursors['/p/s.jsonl'] && onDisk.cursors['/p/s.jsonl'].offset, mem: led.hostCursorOf('host-s').cursors['/p/s.jsonl'].offset };
  };
  const C6 = await cursorScene();
  ok(C6.late < STALL_MS && C6.stalled === 0 && C6.offset === 300 && C6.mem === 300, `⑦ THE PLACED STALL (${STALL_MS} ms in every main-thread write under _host-cursors/): three moved cursors, the loop's worst lateness ${C6.late} ms < one stall, NO main-thread write stalled, the newest cursor on disk (memory answers it at once)`, C6);
  const C6x = await cursorScene({ releaseWrite: true });
  ok(C6x.late >= STALL_MS && C6x.stalled > 0, `⑦ RED control (the cursor written at the call, the release's temp + rename on the loop): the loop is held a stall's length or more (${C6x.late} ms; ${C6x.stalled} main-thread writes stalled) (red)`, C6x);
}

report();
