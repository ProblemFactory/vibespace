#!/usr/bin/env node
// test-usage-walk-bounds — lane lg-remote-hardening (row B-5278 unit 1; the coordinator's r442): THE TWO USAGE ROADS, bounded.
// FAST, in-process (the walker in this process; the shipped scanner and the agent's walk child each as one node child over
// the same fixture). Nothing large is allocated; no clock is read for a bound (the time bound runs on an injected clock).
//   ① L1 THE WALK's RUN BOUND (src/usage-walker.js, the shipped scanner's B-6ded law): a walk stops after a WHOLE line once
//     its output is spent, says `more`, its cursor that line's; the next walks land the rest, each record once, in order;
//     the scanner stops at the same line with the same cursor bytes; the agent's walk child takes `--max-out` and says
//     __more__; a time bound on an injected clock. CONTROL: the line check cut, in a copy, passes the bound by whole files.
//   ② THE PUSH (src/agentd/answer-caps.js): a walk stopped on its bound has the rest walked after THAT batch's ack, never
//     before (a kick waits, at most the wait); a refused batch ends the wait; the dropped count rides the LAST chunk (a walk
//     with only dropped records still sends it). CONTROL: the batch's mark cut, in a copy: a kick walks before the ack.
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
//   ⑤ THE OLDEST AGENT THAT SAYS usage-scan-hub-cursor (18e7d9436, from this clone's history; skipped, said, without it):
//     its walker, handed the map without sid, walks exactly as with it — events and cursors.
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
  let t = 0; const clock = () => (t += 1000);
  const timed = walk(W, h, { maxMs: 2500, now: clock });
  ok(timed.more === true && timed.events.length >= 1 && timed.events.length < 120, `a time bound (2.5 s on an injected clock that moves 1 s a look): stopped after ${timed.events.length} record(s), more`, { n: timed.events.length });
  const Cut = M.load('src/usage-walker.js', anchored(WSRC, "          if (spent()) return; // B-5278 (L1) the run's bound: stop after this WHOLE line (its cursor is that line's)\n", '', 'walk-line-bound'), 'walk-line-bound');
  const cutFirst = walk(Cut, h, { maxOutBytes: cap });
  ok(cutFirst.events.length % 40 === 0 && cutFirst.events.length > 51, `CONTROL (the line check cut, in a copy): the walk passes its bound by whole files (${cutFirst.events.length} records for a ${cap}-byte bound) — RED`, { n: cutFirst.events.length });
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
  const AG = read('src/agentd/agentd.js');
  ok(AG.includes("const wait = AC.usagePushWaitMs(st);") && AG.includes("[__filename, '--usage-scan-child', cursorFile, '--max-out', String(AC.PUSH_WALK_BYTES), '--max-ms', String(AC.PUSH_WALK_MS)]") && AG.includes("usagePushAcked(st, msg.seq, st.commit, () => setImmediate(() => { if (!st.dead) st.walkNow(); }));") && AG.includes('if (r && r.committed && r.more) st.again = true;'),
    `the agent wires it: its walk child under ${AC.sizeOf(AC.PUSH_WALK_BYTES)} / ${AC.PUSH_WALK_MS / 1000} s (inside the child's 64 MiB / 120 s), a kick that waits, the ack that walks the rest`);
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
  const GONE = [key(p1, 'gone-' + SID1 + '.jsonl'), key(p1, SID4, 'subagents', 'agent-gone.jsonl'), key(day, `rollout-2026-11-20T10-00-00-${TID2}.jsonl`)];
  const KEPT = [key(P, '-home-u-two', SID1 + '.jsonl'), key(p1, SID2, 'subagents', 'agent-x.jsonl'), key(p1, SID3, 'subagents', 'agent-y.jsonl'), key(p4, SID1 + '.jsonl'), key(p4, SID2 + '.jsonl'), key(cxDirOf(h), '2026', '11', '19', `rollout-2026-11-19T10-00-00-${TID2}.jsonl`)];
  const map = { [key(p1, SID1 + '.jsonl')]: { offset: 0, lastRid: null }, [key(p1, SID4, 'subagents', 'agent-live.jsonl')]: { offset: 0, lastRid: null }, [rollout]: { offset: 0, lastRid: null } };
  for (const k of [...GONE, ...KEPT]) map[k] = { offset: 10, lastRid: 'x' };
  const r = walk(W, h, { cursors: map, prune: true });
  const has = (m, k) => Object.prototype.hasOwnProperty.call(m, k);
  ok(GONE.every((k) => !has(r.cursors, k)) && r.pruned === GONE.length && KEPT.every((k) => has(r.cursors, k)) && has(r.cursors, key(p3, SID1 + '.jsonl')),
    `dropped (${r.pruned}): a gone file beside a live one, a gone agent beside a live one, a gone rollout beside a live one; KEPT: an emptied folder's entries (an unmounted mount point answers just that), a gone project folder's, a session with no subagents folder, a folder that could not be read, a rollout day folder that is gone`, { pruned: r.pruned, kept: KEPT.filter((k) => has(r.cursors, k)).length, of: KEPT.length });
  const own = walk(W, h, { cursors: map });
  ok(GONE.every((k) => has(own.cursors, k)) && own.pruned === 0 && read('src/agentd/agentd.js').includes('    opts.prune = true;   // B-5278 (L2)'), 'the prune is the device walk child\'s (it asks for it); the hub\'s own in-process walk drops nothing here — its cursor writer keeps its own hourly L0 sweep', { pruned: own.pruned });
  const sc = scan(h, map);
  ok(sc.cursorText === JSON.stringify(r.cursors), 'the shipped scanner writes the same cursor bytes (the same three dropped, the same kept)', { scanner: Object.keys(JSON.parse(sc.cursorText)).length, walker: Object.keys(r.cursors).length });
  // a blocked folder (the door) keeps every entry — asked of the mount door the way the walk asks it
  const blockedKey = key(p3, 'gone-' + SID2 + '.jsonl');
  DOOR.register({ pathBlocked: (q) => (String(q).startsWith(p3) ? p3 : false) });
  let rb; try { rb = walk(W, h, { prune: true, cursors: { ...map, [key(p3, SID1 + '.jsonl')]: { offset: 0, lastRid: null }, [blockedKey]: { offset: 10, lastRid: 'x' } } }); } finally { DOOR.register(null); }
  ok(has(rb.cursors, blockedKey), 'a BLOCKED project folder (its storage not answering) is not read: its gone file\'s entry is kept beside its live one');
  // the projects root unread (a file where the folder should be): nothing under it is dropped
  const h2 = homeOf('l2-root'); fs.rmSync(path.join(h2, '.claude', 'projects'), { recursive: true }); put(path.join(h2, '.claude', 'projects'), 'not a folder\n');
  const rootMap = { [key(h2, '.claude', 'projects', '-home-u-one', SID1 + '.jsonl')]: { offset: 10, lastRid: 'x' } };
  const rr = walk(W, h2, { cursors: rootMap, prune: true });
  ok(Object.keys(rr.cursors).length === 1 && rr.pruned === 0, 'the projects root that could not be listed: every entry under it kept (unknown is never read as empty)');
  // the codex root that could not be listed (a file where the folder should be): no rollout entry dropped
  const h3 = homeOf('l2-cx'); fs.rmSync(cxDirOf(h3), { recursive: true }); put(cxDirOf(h3), 'not a folder\n');
  const cxMap = { [path.join(cxDirOf(h3), '2026', '11', '20', `rollout-2026-11-20T10-00-00-${TID}.jsonl`)]: { offset: 10, lastRid: 'x' } };
  const rcx = walk(W, h3, { cursors: cxMap, prune: true });
  ok(Object.keys(rcx.cursors).length === 1 && rcx.pruned === 0, 'the codex root that could not be listed: its rollout entries kept');
  const LiveCut = M.load('src/usage-walker.js', anchored(WSRC, ' && live.has(path.dirname(k)));', ');', 'prune-live-guard'), 'prune-live-guard');
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
    && HS.includes("const dropped = oversize || AC.oversizeOf(text);") && HS.includes("if (dropped) console.warn(AC.droppedSaid((h && h.name) || id, dropped, 'usage walk'));") && HS.includes("if (m.seq != null && Number(m.oversize) > 0) console.warn(AC.droppedSaid("),
    'the hub says the count once on each road: the device walk (its manifest), the ssh scanner and the shipped-script fallback (their last line, through the one ingest), the push (its last chunk)');
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
  const Keep = M.load('src/usage-walker.js', anchored(WSRC, '  if (badS(ev.rid, ID_MAX) || badS(ev.mid, ID_MAX)) return null;', '  if (false) return null;', 'drop-cut'), 'drop-cut');
  const kr = walk(Keep, h);
  ok(kr.oversize === 0 && kr.events.some((l) => JSON.parse(l).rid.length > 256), 'CONTROL (the drop cut, in a copy): the 304-byte id goes out uncounted — RED');
}

console.log('⑤ the oldest agent that says usage-scan-hub-cursor walks the map without sid exactly as with it');
{
  const OLDEST = '18e7d9436';
  const g = spawnSync('git', ['-C', REPO, 'show', `${OLDEST}:src/usage-walker.js`], { encoding: 'utf8', maxBuffer: 16 << 20 });
  const ga = spawnSync('git', ['-C', REPO, 'show', `${OLDEST}:src/agentd/agentd.js`], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const haveOldest = g.status === 0 && !!g.stdout && ga.status === 0 && /usage-scan-hub-cursor/.test(ga.stdout || '');
  const libs = [['this tree\'s walker', W]];
  if (haveOldest) libs.push([`the oldest hub-cursor agent's walker (${OLDEST})`, M.load('src/usage-walker.js', g.stdout, 'oldest-hub-cursor')]);
  else { skipped++; console.log(`  - SKIP the oldest hub-cursor agent's walker (${OLDEST}): not in this clone's history — the leg below runs this tree's walker only`); }
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
report();
