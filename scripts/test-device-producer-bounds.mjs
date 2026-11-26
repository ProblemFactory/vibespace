#!/usr/bin/env node
// test-device-producer-bounds — lane lg-remote-hardening (row B-5278 unit 2; the coordinator's r442): each device reply with
// no bound of its own is bounded at its producer, and what it left out is said. FAST: fixtures in a temp home, the agent's
// own child processes (node children) where the producer is one; every find of the inventory is shown FIRST on a fixture
// with the release's code (a copy), then cured.
//   ① FIND 1 (it leads the unit — a person's newest conversations missing): device discovery took the first 500 project
//     folders in readdir order BEFORE its time sort. The release's walk (a copy) misses the newest conversation of a
//     machine with 520 folders; the tree's lists it first. The bound (a copy with it lowered to 10): the most recently
//     changed folders are read and the number left out is said (CONTROL: the time sort cut, in a copy, reads the oldest);
//     the hub says it once, on either road.
//   ② THE LAW (r849): a discovery walk NEVER runs on the agent's loop. A stand-in child that outlives its bound (placed, no
//     load): the reply is the kept snapshot with its age, or that end by name when there is none, and the loop — measured by
//     the leg's own clock — is never held for a walk. CONTROL: the inline fallback put back (a copy) holds it.
//   ④ r908: the answer goes by its deadline under the hub's waits (the real bounds read), a slow walk's landing kept for the
//     next ask; asks that meet a walk JOIN it; a walk that never ends is let go and said once a window; too much output said
//     as that; the hub keeps a row's own age and its reason, the page's chip says it. CONTROLS: the deadline cut, the join cut.
//   ⑤ FIND 2: the pool's report parsed every line in ONE try — one torn line answered no event, so the hub acked nothing and
//     the line stayed, hiding every report for good. The release's parse (a copy) ⇒ 0 events; the tree's: the whole lines,
//     the torn one counted.
//   ⑥ r951, THE LAW of item 4: a machine that replied is never called unreachable ANYWHERE its list is drawn — every reason's
//     words through the one door (src/lib/stale-words.js), the fixed-string search over src/lib, the hub's fallback DRIVEN with
//     a device that replied «still walking» (RED: today's row and the release's fallback, in copies); ALSO CURED: the dirty push
//     emptied the list (RED: the release's expression); the smalls: an older landing refused by its walk's number, the let-go
//     child ended by its handle (controls in copies), the pool append after a torn last line (RED: the release's line).
//   ⑦ r1044, the follow: the door's default (any reason it does not know ⇒ «could not be read»; RED: the door that knows only
//     today's five), a re-scan keeps its code and the «Discovery failed» row says the code — the workbench's REAL methods on a
//     bare class (RED: the loading step that drops it, in a copy) — and the dirty push END TO END: server.js's own wiring, a
//     HostManager answering rows, the page's own handler over a map holding a list (RED: the release's d?.sessions).
//   ⑧ the next part (r1044): a device that said «still walking» (or ran out of its bound, or answered too much) is never walked a
//     second time — no snapshot ask joining the same walk, no ssh walk of the same home; a failed child still tries the other roads
//     (RED: the release's rungs, in a copy).
//   ⑨ the next part (r1044): the reply bounded BY CONSTRUCTION (so its parse and its reply on the agent's loop are): at most 1000
//     live locks of at most 64 KiB, the newest — the agent's REAL child on 1003 fixture locks (RED: the release's loop reads every
//     one whole); at most 1000 open codex rollouts; the child's answer at 16 MiB; each kind left out said once by the hub.
//   ⑩ the unit's last piece: the pool's report bounded at its write (the agent's own appendOrderEvent / pendingReport run on
//     temp files), the passive readings at the ssh twin's bound, the held logins at 500 folders and a 320-unit email (the device's
//     real credsFacts on a fixture home), the caps lowered only for an agent that says producer-bounds (one picker).
//   ⑪ part 5: opencode-serve's read keeps the session record and the newest records within 32 MiB (truncated / total / kept),
//     status at most 2000 — the device's real op table on a 35 MiB conversation (RED: the release's read), every rung the same bound.
//   ⑫ r1135: the pool's report answers its head and counts what waits; the ack removes only what was read (RED: the whole-file
//     ack); a counts-only report is acked; the passive readings one rule — the device's readPassive and the twin's shell on one
//     fixture home, the same readings, order and count (RED: the release's twin).
//   ⑬ r1155: the ack names what it acks (two reads in flight, the second reply lost: nothing lost; RED: the one slot), the
//     head on the file's bytes (RED: on the decoded text), the truncated mark through every rung, the twin bounded at its read.
//   ⑭ r1225: the dropped total only rises (RED: deleted at total = acked), a malformed token removes nothing (RED: the slot), the
//     executed push carries its token.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-producer-bounds-'));
const AGENT = path.join(REPO, 'src/agentd/agentd.js');
const AGSRC = read('src/agentd/agentd.js');
const M = mutantCopies('device-producer-bounds', REPO);
const TS = '2026-11-20T10:00:00.000Z';
const OLD = 1000000000, NEW = 1700000000;   // seconds: a 2001 transcript, a 2023 one
const rec = (rid) => JSON.stringify({ type: 'assistant', requestId: rid, timestamp: TS, cwd: '/w', message: { id: 'msg_' + rid, model: 'claude-fable-5', usage: { input_tokens: 1, output_tokens: 1 } } }) + '\n';
const sidOf = (n) => `b1b1b1b1-c2c2-d3d3-e4e4-${String(n).padStart(12, '0')}`;
const homeOf = (tag) => { const h = path.join(tmp, tag); fs.mkdirSync(path.join(h, '.claude', 'projects'), { recursive: true }); fs.mkdirSync(path.join(h, '.codex', 'sessions'), { recursive: true }); return h; };
const snapshotOf = (file, h) => {
  const r = spawnSync(process.execPath, [file, '--discovery-snapshot-child'], { encoding: 'utf8', env: { ...process.env, HOME: h, CODEX_HOME: path.join(h, '.codex') }, timeout: 30000, maxBuffer: 64 << 20 });
  let snap = null; try { snap = JSON.parse(r.stdout); } catch { }
  return { code: r.status, snap, err: String(r.stderr || '').slice(0, 300) };
};

console.log('① find 1: every project folder is listed BEFORE the time sort; past its bound the most recently changed are read, the rest said');
{
  const h = homeOf('f1'), P = path.join(h, '.claude', 'projects');
  for (let i = 0; i < 520; i++) { const d = path.join(P, `-home-u-p${String(i).padStart(3, '0')}`); fs.mkdirSync(d); const f = path.join(d, sidOf(i) + '.jsonl'); fs.writeFileSync(f, rec('req_' + i)); fs.utimesSync(f, OLD + i, OLD + i); }
  const order = fs.readdirSync(P);   // the folder order the walk itself sees
  const late = order[510], newest = path.join(P, late, sidOf(9999) + '.jsonl');
  fs.writeFileSync(newest, rec('req_newest')); fs.utimesSync(newest, NEW, NEW);
  // THE FAULT FIRST: the release's walk (a copy: the first 500 folders in readdir order)
  const rel = M.write('src/agentd/agentd.js', anchored(AGSRC, '    for (const d of dirs) {', '    for (const d of dirs.slice(0, 500)) {', 'release-first-500'), 'release-first-500');
  const before = snapshotOf(rel, h);
  const seenBefore = before.snap && before.snap.jsonls.some((j) => j.projDir === late);
  ok(before.code === 0 && before.snap && before.snap.jsonls.length === 200 && !seenBefore, `THE FAULT, on the release's walk (a copy): a machine with 520 project folders, its NEWEST conversation in the folder the directory lists 511th — not in its list (${before.snap ? before.snap.jsonls.length : '?'} rows, the newest ${seenBefore ? 'there' : 'MISSING'})`, { code: before.code, err: before.err });
  const after = snapshotOf(AGENT, h);
  ok(after.code === 0 && after.snap && after.snap.jsonls.length === 200 && after.snap.jsonls[0].projDir === late && after.snap.jsonls[0].file === sidOf(9999) + '.jsonl' && !after.snap.left,
    `the tree's walk: every folder listed before the time sort — the newest conversation leads its list (${after.snap && after.snap.jsonls[0] ? after.snap.jsonls[0].projDir : '?'}); nothing left out under the bound`, { code: after.code, err: after.err });
  // THE BOUND (a copy with it lowered to 10): the most recently changed folders read, the number left out said
  const hb = homeOf('f1-bound'), PB = path.join(hb, '.claude', 'projects');
  for (let i = 0; i < 20; i++) { const d = path.join(PB, `-home-u-b${String(i).padStart(2, '0')}`); fs.mkdirSync(d); fs.writeFileSync(path.join(d, sidOf(i) + '.jsonl'), rec('req_b' + i)); }
  // the folders' own times run AGAINST the directory's order (the first it lists are the oldest), so only the time sort reads the newest
  const orderB = fs.readdirSync(PB);
  orderB.forEach((name, k) => { const d = path.join(PB, name); for (const f of fs.readdirSync(d)) fs.utimesSync(path.join(d, f), OLD + k, OLD + k); fs.utimesSync(d, OLD + k, OLD + k); });
  const newest10 = orderB.slice(10).sort();
  const low = M.write('src/agentd/agentd.js', anchored(AGSRC, 'const DISCOVERY_FOLDERS_MAX = 5000;', 'const DISCOVERY_FOLDERS_MAX = 10;', 'folders-max-10'), 'folders-max-10');
  const b = snapshotOf(low, hb);
  const readOf = (x) => (x.snap ? [...new Set(x.snap.jsonls.map((j) => j.projDir))].sort() : []);
  const dirsRead = readOf(b);
  ok(b.code === 0 && b.snap && b.snap.left && b.snap.left.folders === 10 && JSON.stringify(dirsRead) === JSON.stringify(newest10),
    `past its bound (10, in a copy): the 10 most recently changed folders read — the LAST ten the directory lists — and the 10 left out said (left.folders ${b.snap && b.snap.left ? b.snap.left.folders : '?'})`, { code: b.code, err: b.err, dirsRead, newest10 });
  const noSort = M.write('src/agentd/agentd.js', anchored(anchored(AGSRC, 'const DISCOVERY_FOLDERS_MAX = 5000;', 'const DISCOVERY_FOLDERS_MAX = 10;', 'folders-max-10-nosort'), 'dirs = dirs.map((d) => [d, changed(d)]).sort((a, b) => b[1] - a[1]).slice(0, DISCOVERY_FOLDERS_MAX).map((x) => x[0]);', 'dirs = dirs.slice(0, DISCOVERY_FOLDERS_MAX);', 'folders-sort-cut'), 'folders-sort-cut');
  const ns = snapshotOf(noSort, hb);
  ok(ns.code === 0 && JSON.stringify(readOf(ns)) !== JSON.stringify(newest10), 'CONTROL (the time sort cut, in a copy): the first ten the directory lists are read — the OLDEST — RED', { read: readOf(ns) });
  ok(/const DISCOVERY_FOLDERS_MAX = 5000;/.test(AGSRC) && AGSRC.includes("codexRollouts: snap.codexRollouts, ...(snap.left ? { left: snap.left } : {}), ...(stale ? { stale } : {}), codexOpen: snap.codexOpen || [], realCwds: snap.realCwds || [] });") && AGSRC.includes("mux.control({ op: 'discovery-result', id: msg.id, sessions, ...(snap.left ? { left: snap.left } : {}), ...(stale ? { stale } : {}) });"), 'the bound is 5000 folders, and BOTH of the agent\'s answers (the snapshot\'s, the claims\') carry what it left out to the hub');
  const { DeviceManager } = require('../src/agentd/client.js');
  const D = new DeviceManager({ dataDir: path.join(tmp, 'dm'), bundlePath: path.join(tmp, 'none.js'), version: '1.0.0', machine: 'box-1', transport: { kind: 'stream', hostToken: () => 'x', getStream: () => null } });
  const logs = []; D._log = (l) => logs.push(String(l));
  D._request = async () => ({ locks: [], jsonls: [], left: { folders: 7 } });
  await D.discoverySnapshot(); await D.discoverySnapshot();
  const said = logs.filter((l) => /project folders left out/.test(l));
  ok(said.length === 1 && /7 of its project folders/.test(said[0]), `the hub says what the list left out ONCE («${said[0] || 'nothing'}»)`, logs);
}

console.log('② THE LAW (the coordinator\'s r849): a discovery walk NEVER runs on the agent\'s loop — a child that outlives its bound answers the kept snapshot, its age said, or that end by name');
{
  const DF = require('../src/discovery-facts.js');
  const { execFile } = require('node:child_process');
  const outlives = (cb) => execFile(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeout: 300 }, cb);   // a stand-in child: it outlives its bound (placed, no load)
  const answers = (cb) => execFile(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({ jsonls: [{ file: "a.jsonl" }], locks: [] }))'], { timeout: 5000 }, cb);
  const unstartable = (cb) => execFile(path.join(tmp, 'no-such-node'), [], { timeout: 300 }, cb);
  // the agent's loop, measured by the leg's own clock: the worst gap between 5 ms ticks while the reply is made
  const onLoop = async (fn) => { let last = performance.now(), worst = 0; const t = setInterval(() => { const n = performance.now(); worst = Math.max(worst, n - last); last = n; }, 5); const r = await fn(); clearInterval(t); worst = Math.max(worst, performance.now() - last); return { r, worst: Math.round(worst) }; };
  const HOLD = 400;   // the RED's inline walk holds the loop this long (a placed wait, no load)
  const none = await onLoop(() => DF.snapshotReply({ runChild: outlives, kept: { snap: null, at: 0 } }));
  ok(none.r.code === 'discovery-timeout' && !none.r.snap && none.worst < HOLD, `a child that outlives its bound, nothing kept: refused BY NAME («${none.r.error}»), the loop's worst gap ${none.worst} ms (never held for a walk)`, none);
  const keptOld = { snap: { jsonls: [{ file: 'old.jsonl' }], locks: [] }, at: 1000 };
  const old = await onLoop(() => DF.snapshotReply({ runChild: outlives, kept: keptOld, now: () => 61000 }));
  ok(old.r.snap === keptOld.snap && old.r.stale && old.r.stale.ageMs === 60000 && old.r.stale.why === 'discovery-timeout' && old.worst < HOLD, `…with a snapshot kept a minute ago: THAT snapshot, its age said (${old.r.stale && old.r.stale.ageMs} ms, ${old.r.stale && old.r.stale.why}), the loop's worst gap ${old.worst} ms`, old);
  const kept2 = { snap: null, at: 0 }, fresh = await DF.snapshotReply({ runChild: answers, kept: kept2, now: () => 5000 });
  const noStart = await DF.snapshotReply({ runChild: unstartable, kept: { snap: null, at: 0 } });
  ok(fresh.snap && fresh.snap.jsonls[0].file === 'a.jsonl' && kept2.snap === fresh.snap && kept2.at === 5000 && !fresh.stale && noStart.code === 'discovery-child-unstarted',
    `a child that answers: its snapshot, kept for the next refusal; one that could not START: by name too («${noStart.error}») — never the walk inline`, { noStart });
  // RED: the inline fallback put back (a copy) — the walk on the loop holds it
  const DSRC = read('src/discovery-facts.js');
  const Back = M.load('src/discovery-facts.js', anchored(DSRC, '  if (v.snap) return { snap: v.snap };', '  if (!v.snap && arguments[0].walkInline) return { snap: arguments[0].walkInline() };\n  if (v.snap) return { snap: v.snap };', 'inline-back'), 'inline-back');
  const walkInline = () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, HOLD); return { jsonls: [], locks: [] }; };
  const held = await onLoop(() => Back.snapshotReply({ runChild: outlives, kept: { snap: null, at: 0 }, walkInline }));
  ok(held.worst >= HOLD - 20, `CONTROL (the inline fallback put back, in a copy): the walk runs on the loop and holds it ${held.worst} ms — RED`, held);
  const nAg = (t) => AGSRC.split(t).length - 1;
  ok(nAg('snapshotReply({ kept: discoveryKept, runChild: (cb) => {') === 2 && nAg('} else snap = computeDiscoverySnapshot();   // msg.forceInline') === 2 && nAg('computeDiscoverySnapshot()') === 4,
    'both discovery ops answer through it; the walk is called only by its child and under a parity suite\'s forceInline, which the hub never sends (its definition, the child, the two forceInline arms: 4)');
  const HS = read('src/hosts.js');
  ok(HS.includes('claimed = res.stale ? staleSessions(res.sessions, res.stale) : res.sessions;') && HS.includes('const sessions = snapStale ? staleSessions(read, snapStale) : read;') && HS.includes('if (!snapStale) this._persistDiscovery(id, sessions);'),
    'the hub says the truth: a kept snapshot\'s rows are marked stale with their age (both roads), and an old list is never kept as the last-known one');
}

console.log('④ r908: the answer by its deadline, under the hub\'s wait (slow is not hung); ONE walk child at a time; a stuck walk said and let go');
{
  const DF = require('../src/discovery-facts.js');
  const { execFile } = require('node:child_process');
  const refTimers = { setTimeout: (fn, ms) => ({ id: setTimeout(fn, ms) }), clearTimeout: (t) => clearTimeout(t && t.id) };   // the leg's own timers stay ref'd (no unsettled await)
  // THE REAL PAIR OF BOUNDS: the agent answers by DISCOVERY_ANSWER_MS, under BOTH of the hub's waits; its child's own bound is longer
  const HS = read('src/hosts.js');
  const hubSnap = Number((HS.match(/deadline\(dm\.discoverySnapshot\(\), (\d+), 'device-discovery'\)/) || [])[1]);
  const hubClaims = Number((HS.match(/deadline\(dm\.discoveryClaims\(\{ hostId: h\.id, hostName: h\.name \}\), (\d+), 'device-claims'\)/) || [])[1]);
  const childBound = Number((AGSRC.match(/\[__filename, '--discovery-snapshot-child'\], \{ windowsHide: true, timeout: (\d+),/) || [])[1]);
  ok(hubSnap > 0 && hubClaims > 0 && DF.DISCOVERY_ANSWER_MS < Math.min(hubSnap, hubClaims) && childBound > DF.DISCOVERY_ANSWER_MS && DF.DISCOVERY_STUCK_MS > childBound,
    `the REAL bounds: the agent answers by ${DF.DISCOVERY_ANSWER_MS} ms, under the hub's waits (${hubSnap} ms the snapshot, ${hubClaims} ms the claims); its child walks on to its own ${childBound} ms; a walk past ${DF.DISCOVERY_STUCK_MS} ms is let go`, { hubSnap, hubClaims, childBound });
  // a SLOW child: a REAL one that lands only when the leg RELEASES it (a line on its stdin) — inside its own bound, so every
  // order below is placed, never raced against the clock (the suite used to wait 1.5 s a child, seven times)
  const held = [];
  const lands = (file) => (cb) => { const c = execFile(process.execPath, ['-e', `process.stdin.once('data', () => process.stdout.write(JSON.stringify({ jsonls: [{ file: ${JSON.stringify(file)} }], locks: [] })))`], { timeout: 5000 }, cb); held.push(c); return c; };
  const release = () => { for (const c of held.splice(0)) { try { c.stdin.end('go\n'); } catch { } } };
  const oldSnap = { jsonls: [{ file: 'old.jsonl' }], locks: [] };
  const k1 = { snap: oldSnap, at: Date.now() - 60000 };
  const r1 = await DF.snapshotReply({ runChild: lands('late.jsonl'), kept: k1, answerBy: 50, timers: refTimers });
  ok(r1.snap === oldSnap && r1.stale && r1.stale.why === 'discovery-slow' && r1.stale.ageMs >= 60000 && !!k1.inflight,
    'a slow walk is answered by its deadline while its child is held (it cannot land before the leg releases it): the kept snapshot, its age, «discovery-slow» — the child walks on', { stale: r1.stale });
  release(); if (k1.inflight) await k1.inflight.promise;
  ok(k1.snap && k1.snap.jsonls[0].file === 'late.jsonl' && !k1.inflight, 'what it lands is KEPT for the next ask (slow is not hung)');
  const k2 = { snap: null, at: 0 }, r2 = await DF.snapshotReply({ runChild: lands('x.jsonl'), kept: k2, answerBy: 50, timers: refTimers });
  ok(r2.code === 'discovery-slow' && !r2.snap, `nothing kept yet: «${r2.error}», by name`);
  release(); if (k2.inflight) await k2.inflight.promise;
  // JOIN: two asks that meet one walk start ONE child
  let starts = 0; const counted = (cb) => { starts++; return lands('j.jsonl')(cb); };
  const k3 = { snap: null, at: 0 };
  const pj = Promise.all([DF.snapshotReply({ runChild: counted, kept: k3, answerBy: 4000, timers: refTimers }), DF.snapshotReply({ runChild: counted, kept: k3, answerBy: 4000, timers: refTimers })]);
  release(); const [a3, b3] = await pj;
  ok(starts === 1 && a3.snap && a3.snap === b3.snap, `two asks that meet one walk JOIN it (${starts} child, one snapshot)`);
  // STUCK: a walk that never ends (its child never calls back) — joined within its window, let go and said ONCE past it
  const said = []; let st4 = 0, clock = 1000;
  const never = () => { st4++; };
  const k4 = { snap: null, at: 0 }, ask4 = () => DF.snapshotReply({ runChild: never, kept: k4, answerBy: 50, now: () => clock, stuckAfter: 60000, timers: refTimers, log: (l) => said.push(l) });
  const q1 = ask4(); clock += 30000; const q2 = ask4(); clock += 40000; const q3 = ask4();
  await Promise.all([q1, q2, q3]);
  ok(st4 === 2 && said.length === 1 && /never ended/.test(said[0]), `a walk that never ends: joined 30 s on (${st4 === 2 ? 'still one child' : st4}), let go and said ONCE 70 s on (a second child) — at most one stuck child a window («${said[0] || ''}»)`, { st4, said });
  // too much output: said as that, not as the bound
  const big = await new Promise((resolve) => execFile(process.execPath, ['-e', 'process.stdout.write("x".repeat(5000))'], { maxBuffer: 1000 }, (err, stdout) => resolve(DF.snapshotChildVerdict(err, stdout))));
  ok(big.code === 'discovery-too-large', `a child ended for TOO MUCH OUTPUT is said as that («${big.error}»), not as its bound`, big);
  // CONTROLS (copies): the deadline cut ⇒ the ask waits for the walk; the join cut ⇒ a child an ask
  const DSRC2 = read('src/discovery-facts.js');
  const NoDeadline = M.load('src/discovery-facts.js', anchored(DSRC2, '  const v = await Promise.race([kept.inflight.promise, byDeadline]);', '  const v = await kept.inflight.promise;', 'answer-deadline-cut'), 'answer-deadline-cut');
  const pd = NoDeadline.snapshotReply({ runChild: lands('c.jsonl'), kept: { snap: oldSnap, at: Date.now() }, answerBy: 50, timers: refTimers });
  const before = await Promise.race([pd.then(() => 'replied'), new Promise((r) => setTimeout(() => r('still waiting'), 300))]);
  release(); const r2c = await pd;
  ok(before === 'still waiting' && !!(r2c.snap && r2c.snap.jsonls[0].file === 'c.jsonl' && !r2c.stale), `CONTROL (the deadline cut, in a copy): the ask waits for the whole walk — no reply while its child is held past an answer due at 50 ms (${before}), then the walk's own landing — RED`);
  const NoJoin = M.load('src/discovery-facts.js', anchored(DSRC2, '  if (!kept.inflight) {\n', '  if (true) {\n', 'join-cut'), 'join-cut');
  let starts6 = 0; const counted6 = (cb) => { starts6++; return lands('k.jsonl')(cb); };
  const k6 = { snap: null, at: 0 };
  const pn = Promise.all([NoJoin.snapshotReply({ runChild: counted6, kept: k6, answerBy: 4000, timers: refTimers }), NoJoin.snapshotReply({ runChild: counted6, kept: k6, answerBy: 4000, timers: refTimers })]);
  release(); await pn;
  ok(starts6 === 2, `CONTROL (the join cut, in a copy): two asks start two children (${starts6}) — RED`);
  // the hub and the page: a row's own age kept by the unreachable fallback, its reason carried, the chip's words by it
  ok(HS.includes('const lastKnownRows = (sessions, at, deviceWhy) => sessions.map((s) => ({ ...s, stale: true, staleAt: s.staleAt || at, staleWhy: deviceWhy || undefined }));') && HS.includes('staleWhy: (stale && stale.why) || undefined')
    && read('src/lib/sidebar-workbench.js').includes('staleWhy: s.staleWhy || undefined,') && read('src/lib/session-card.js').includes('schip.dataset.tip = staleTip(s.staleWhy, tr);'),
    'the hub keeps a row\'s OWN age when its unreachable fallback re-marks a list; the reason rides to the page, whose chip says «could not be read in time» for a machine that answered, «unreachable» only when it did not');
}

console.log('⑤ find 2: the pool\'s report is read line by line — one torn line never hides every report');
{
  const SO = require('../src/sealed-orders.js');
  const torn = '{"ts":2,"poolId":"p1","to":';
  const text = [JSON.stringify({ ts: 1, poolId: 'p1', to: 'a' }), torn, JSON.stringify({ ts: 3, poolId: 'p1', to: 'b' }), JSON.stringify({ ts: 4, poolId: 'p1', to: 'c' })].join('\n') + '\n';
  // THE FAULT FIRST: the release's parse (a copy: every line in ONE try)
  const SSRC = read('src/sealed-orders.js');
  const RelS = M.load('src/sealed-orders.js', anchored(SSRC, 'function reportOf(text) {\n', "function reportOf(text) {\n  try { return { events: String(text || '').split('\\n').filter(Boolean).map((l) => JSON.parse(l)), torn: 0 }; } catch { return { events: [], torn: 0 }; }\n", 'release-one-try'), 'release-one-try');
  const before = RelS.reportOf(text), after = SO.reportOf(text);
  ok(before.events.length === 0, `THE FAULT, on the release's parse (a copy): one torn line (a crash mid-append) among three whole ones ⇒ ${before.events.length} events reported — the hub acks nothing, the torn line stays, every later report hidden`);
  ok(after.events.length === 3 && after.torn === 1 && after.events.map((e) => e.to).join() === 'a,b,c', `the tree's parse: the three whole switches reported (${after.events.map((e) => e.to).join()}), the torn line left out and counted (${after.torn})`);
  ok(AGSRC.includes('      const r = SO.reportHead(buf);\n      if (r.torn && !this._tornSaid)') && SO.reportHead(text).torn === 1 && SO.reportHead(text).events.length === 3, 'the agent reads its pool report line by line (its head within its bound: ⑩ / ⑫), and says a torn line once');
}

console.log('⑥ r951, THE LAW of item 4: a machine that replied is never called unreachable ANYWHERE its list is drawn; the device\'s own reply is remembered through the hub\'s fallback and said');
{
  const refTimers = { setTimeout: (fn, ms) => ({ id: setTimeout(fn, ms) }), clearTimeout: (t) => clearTimeout(t && t.id) };   // the leg's own timers stay ref'd
  const trS = (k, p = {}) => String(k).replace(/\{(\w+)\}/g, (m, n) => (n in p ? String(p[n]) : m));
  const SW = await import(pathToFileURL(path.join(REPO, 'src/lib/stale-words.js')).href);
  const REPLIED = ['discovery-slow', 'discovery-timeout', 'discovery-too-large', 'discovery-child-failed', 'discovery-child-unstarted'];
  const wordsOf = (W, why) => [W.staleTip(why, trS), W.staleZoneText(why, 'gpu-a', trS), W.errorZoneText(why, 'gpu-a', trS), W.errorChipText(why, '', trS)];
  for (const why of REPLIED) {
    const w = wordsOf(SW, why);
    ok(w.every((x) => !/unreachable/i.test(x)) && /in time/.test(w[1]) === (why === 'discovery-slow' || why === 'discovery-timeout'),
      `a machine that replied «${why}»: the chip's tip, the zone's row (an old list / no list) and the row's chip never say «unreachable» («${w[1]}» · «${w[2]}» · «${w[3]}»)`, w);
  }
  const silent = wordsOf(SW, undefined), again = wordsOf(SW, 'discovery-rescan');
  ok(silent.slice(0, 3).every((x) => /unreachable/.test(x)) && silent[3] === 'unreachable', `a machine that did NOT answer is still said so («${silent[1]}»)`, silent);
  ok(/being read again/.test(again[0]) && /being read again/.test(again[1]) && !/unreachable/.test(again[0] + again[1]),
    `the hub's own kept list served after its restart, while the machine is read again: «${again[1]}» (it said «was unreachable» of a machine nobody had asked yet)`, again);
  // RED: TODAY'S ROW (the zone's own row before this cure: «was unreachable» whatever the rows' reason — a copy of the door with it)
  const SWSRC = read('src/lib/stale-words.js');
  const Today = await import(pathToFileURL(M.write('src/lib/stale-words.js', anchored(SWSRC, 'export function staleZoneText(why, host, tr) {\n', "export function staleZoneText(why, host, tr) {\n  return tr('Last known scan — {host} was unreachable.', { host });\n", 'todays-row'), 'todays-row', { esm: true })).href);
  const todays = Today.staleZoneText('discovery-slow', 'gpu-a', trS);
  ok(/was unreachable/.test(todays), `CONTROL (today's row, in a copy): a machine that replied «discovery-slow» is called «${todays}» — RED`);
  // THE SEARCH (fixed-string, «unreachable», in src/lib — the three word tables among it): every place that draws a machine's
  // old list draws it through the one door; the sentences of an old list live nowhere else
  const libFiles = fs.readdirSync(path.join(REPO, 'src/lib'), { recursive: true }).filter((f) => /\.js$/.test(f)).sort();
  let lines = 0, inFiles = 0;
  for (const f of libFiles) { const n = read(`src/lib/${f}`).split('\n').filter((l) => l.includes('unreachable')).length; lines += n; if (n) inFiles++; }
  console.log(`  · the fixed-string search «unreachable» in src/lib: ${lines} lines in ${inFiles} files (the line judges each place that draws a machine's list)`);
  const OLD_LIST = ['Last known scan — {host} was unreachable.', 'Showing cached results — {host} is unreachable.', 'This machine was unreachable — showing the last successful scan'];
  const elsewhere = libFiles.filter((f) => f !== 'stale-words.js' && !/^i18n(-[a-z]+)?\.js$/.test(f) && OLD_LIST.some((s) => read(`src/lib/${f}`).includes(s)));
  const WB = read('src/lib/sidebar-workbench.js'), SC = read('src/lib/session-card.js');
  const nOf = (s, t) => s.split(t).length - 1;
  ok(elsewhere.length === 0 && !WB.includes("tr('unreachable')") && nOf(WB, 'staleZoneText(') === 1 && nOf(WB, 'errorZoneText(') === 2 && nOf(WB, 'errorChipText(') === 4 && nOf(SC, 'staleTip(') === 1,
    'the old list\'s sentences live only in stale-words.js (and the word tables); the zone\'s row, its head chip, the search\'s two rows and the chip\'s tip all draw through it — no «unreachable» of the workbench\'s own left', { elsewhere });
  for (const lang of ['zh', 'ja']) {
    const T = read(`src/lib/i18n-${lang}.js`);
    const keys = [...SWSRC.matchAll(/tr\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
    const missing = keys.filter((k) => !T.includes(JSON.stringify(k) + ':'));
    ok(keys.length === 17 && missing.length === 0, `…every sentence of the door (${keys.length}) has its ${lang} row`, missing);
  }
  // (r1096) THE HEAD CHIP's AGE KEEPS ITS CASE: the zone's head uppercases its text, and the chip sat in it — «as of 26M ago»
  // (an «M» reads as months) beside the row's «as of 26m ago». The drawn text, and the rule that keeps it under that head:
  const CSS = read('public/style.css');
  const ruleOf = (css, sel) => { const m = css.match(new RegExp('(?:^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}')); return m ? m[1] : ''; };
  const keepsCase = (css) => /text-transform:\s*uppercase/.test(ruleOf(css, '.wb-zone-head')) && /text-transform:\s*none/.test(ruleOf(css, '.host-state-chip'));
  const U = await import(pathToFileURL(path.join(REPO, 'src/lib/utils.js')).href);
  const mkC = (tag) => ({ tagName: tag, className: '', textContent: '', title: '', style: {}, classList: { add() { } } });
  const hadDocC = 'document' in globalThis; if (!hadDocC) globalThis.document = { createElement: mkC };
  let drawn = ''; try { drawn = U.hostStateChip('stale', { age: Date.now() - 26 * 60 * 1000 }).textContent; } finally { if (!hadDocC) delete globalThis.document; }
  const noKeep = CSS.replace('flex: none; text-transform: none; }', 'flex: none; }');   // the chip's rule before the cure, quoted (stale-pins: kept)
  ok(/26m\b/.test(drawn) && keepsCase(CSS) && !keepsCase(noKeep),
    `the head chip draws «${drawn}» and keeps that case under the zone's uppercased head (the chip's own rule); RED: without it the head's capitals reach the chip («${drawn.toUpperCase()}»)`);
  // THE HUB'S FALLBACK, DRIVEN (a HostManager in a temp folder; the device and ssh stood in): a device that replied «still walking»
  const { HostManager, lastKnownRows } = require('../src/hosts.js');
  const walking = () => Promise.reject(Object.assign(new Error('the discovery walk is still running (past 8 s); what it finds is kept for the next ask'), { code: 'discovery-slow' }));
  const hub = (HM, { replies = true, list = true } = {}) => {
    const m = new HM({ dataDir: fs.mkdtempSync(path.join(tmp, 'hub-')) });
    m._state.hosts.push({ id: 'hD', name: 'gpu-a', transport: 'dial' });
    m.deviceBounded = async () => { if (!replies) throw new Error('gpu-a: connect timed out'); return { connect: async () => ({ info: { capabilities: ['discovery-claims'] } }), discoveryClaims: walking, discoverySnapshot: walking }; };
    m._ssh = async () => { throw new Error('ssh: connect to host gpu-a port 22: Connection timed out'); };
    if (list) m._discoveryCache.set('hD', { at: 5000, sessions: [{ sessionId: 's1' }, { sessionId: 's2', staleAt: 3000 }] });
    return m;
  };
  const tryRows = async (m) => { try { return { rows: await m.discoverSessions('hD', { ttlMs: 0 }) }; } catch (e) { return { err: e }; } };
  const a = await tryRows(hub(HostManager));
  ok(a.rows && a.rows.every((s) => s.stale && s.staleWhy === 'discovery-slow') && a.rows[0].staleAt === 5000 && a.rows[1].staleAt === 3000 && /in time/.test(SW.staleZoneText(a.rows[0].staleWhy, 'gpu-a', trS)),
    `a device that replied «still walking», its ssh twin down: the hub's last list, each row its own age, the device's reply remembered (${a.rows && a.rows[0].staleWhy}) — the zone says «${a.rows && SW.staleZoneText(a.rows[0].staleWhy, 'gpu-a', trS)}»`, a.rows);
  const b = await tryRows(hub(HostManager, { list: false }));
  ok(b.err && b.err.code === 'discovery-slow' && /still running/.test(b.err.message) && /could not be read in time/.test(SW.errorZoneText(b.err.code, 'gpu-a', trS)),
    `…and no list to show: the hub answers the device's own words by code («${b.err && b.err.message}», ${b.err && b.err.code}), never its ssh twin's «connection timed out»`);
  const c = await tryRows(hub(HostManager, { replies: false }));
  ok(c.rows && c.rows.every((s) => s.stale && s.staleWhy === undefined) && /unreachable/.test(SW.staleZoneText(c.rows[0].staleWhy, 'gpu-a', trS)),
    'CONTROL (true): a device that did not answer, ssh down — its rows carry no reason, and the zone says «unreachable»');
  const HSRC = read('src/hosts.js');
  const Forgets = M.load('src/hosts.js', anchored(HSRC, '        return lastKnownRows(last.sessions, last.at, deviceWhy);', '        return lastKnownRows(last.sessions, last.at, undefined);', 'fallback-forgets'), 'fallback-forgets');
  const red = await tryRows(hub(Forgets.HostManager));
  ok(red.rows && red.rows[0].staleWhy === undefined && /was unreachable/.test(SW.staleZoneText(red.rows[0].staleWhy, 'gpu-a', trS)),
    `CONTROL (the fallback that forgets the device's reply, in a copy — the release's): «${red.rows && SW.staleZoneText(red.rows[0].staleWhy, 'gpu-a', trS)}» for a machine that replied — RED`);
  const coldHub = hub(HostManager, { list: false }); coldHub._persistedDisc.hD = { at: 7000, sessions: [{ sessionId: 's9' }] }; coldHub.onDiscoveryDirty = () => { };
  const cold = await coldHub.discoverSessions('hD', {});
  ok(cold.length === 1 && cold[0].stale && cold[0].staleWhy === 'discovery-rescan' && cold[0].staleAt === 7000 && typeof lastKnownRows === 'function',
    'the kept list served at once after the hub\'s restart says THAT (being read again) with its own age — it said «was unreachable» of a machine nobody had asked yet');
  // THE CODE RIDES TO THE PAGE: the client keeps a device's discovery code, the route and the push pass it, the page keeps it
  const { replyError } = require('../src/agentd/client.js');
  const re = replyError({ op: 'discovery-result', error: 'the discovery walk is still running', code: 'discovery-slow' });
  const SRV = read('server.js'), XR = read('src/server/exit-routes.js');
  ok(re.code === 'discovery-slow' && XR.includes("res.status(400).json({ error: e.message, ...(e && typeof e.code === 'string' && /^discovery-/.test(e.code) ? { code: e.code } : {}) });")
    && SRV.includes("error: String(e?.message || e), ...(typeof e?.code === 'string' && /^discovery-/.test(e.code) ? { code: e.code } : {}), at: Date.now() });")
    && WB.includes("{ code: (d && typeof d.code === 'string') ? d.code : null }") && WB.includes('errorCode: e.code || null,') && WB.includes("errorCode: typeof msg.code === 'string' ? msg.code : null,"),
    'the device\'s code rides every road to the page: the client keeps it (driven), the sessions route and the dirty push pass it, the page keeps it on a pull and on a push');
  // ALSO CURED (found on the walk): the dirty push sent `d.sessions` of an ARRAY — every push emptied the machine's list
  const pushExpr = (SRV.match(/bcastAll\(\{ type: 'remote-sessions', hostId, sessions: (.+?), at: Date\.now\(\) \}\);/) || [])[1];
  const pushed = pushExpr ? new Function('d', `return (${pushExpr});`)([{ sessionId: 's1' }]) : null;
  const relPushed = new Function('d', 'return (d?.sessions || []);')([{ sessionId: 's1' }]);
  ok(Array.isArray(pushed) && pushed.length === 1 && relPushed.length === 0, `the dirty push carries the rows the hub answered (${pushed && pushed.length}); the release's expression over the same answer pushed ${relPushed.length} — the list emptied at every push (RED)`, { pushExpr });
  // SMALL (1): an older landing is refused by a guard of its own — each walk's number; (2) the let-go child is ENDED by its handle
  const DSRC3 = read('src/discovery-facts.js');
  const landing = async (DFm) => {
    const cbs = [], kills = []; let clock = 1000;
    const run = (cb) => { cbs.push(cb); return { kill: (sig) => kills.push(sig) }; };
    const kept = { snap: null, at: 0 };
    const ask = () => DFm.snapshotReply({ runChild: run, kept, answerBy: 20, now: () => clock, stuckAfter: 60000, timers: refTimers });
    await ask(); clock += 70000; await ask();
    const tick = () => new Promise((r) => setImmediate(r));
    cbs[1](null, JSON.stringify({ jsonls: [{ file: 'new.jsonl' }], locks: [] })); await tick();
    cbs[0](null, JSON.stringify({ jsonls: [{ file: 'old.jsonl' }], locks: [] })); await tick();
    return { file: kept.snap && kept.snap.jsonls[0].file, kills, children: cbs.length };
  };
  const DFt = require('../src/discovery-facts.js');
  const g = await landing(DFt);
  ok(g.children === 2 && g.file === 'new.jsonl' && g.kills.join() === 'SIGKILL', `a let-go walk is ENDED by its handle (${g.kills.join() || 'no kill'}); when it lands anyway after the newer walk, the newer list is kept (${g.file})`, g);
  const NoGuard = M.load('src/discovery-facts.js', anchored(DSRC3, '      if (v.snap && walk > (kept.landed || 0)) {', '      if (v.snap) {', 'older-landing-guard-cut'), 'older-landing-guard-cut');
  const g2 = await landing(NoGuard);
  ok(g2.file === 'old.jsonl', `CONTROL (the guard cut, in a copy): the older walk's late landing replaces the newer list (${g2.file}) — RED`);
  const NoKill = M.load('src/discovery-facts.js', anchored(DSRC3, "    try { if (kept.inflight.child && typeof kept.inflight.child.kill === 'function') kept.inflight.child.kill('SIGKILL'); } catch { }\n", '    // (the kill cut)\n', 'let-go-kill-cut'), 'let-go-kill-cut');
  const g3 = await landing(NoKill);
  ok(g3.kills.length === 0, 'CONTROL (the kill cut, in a copy): the let-go child is only forgotten, never ended — RED');
  // SMALL (3): the agent's pool append never glues its record to a torn last line (its own function, run on a temp file)
  const SO = require('../src/sealed-orders.js');
  const fnSrc = (name) => { const a = AGSRC.indexOf('function ' + name + '('), b = AGSRC.indexOf('\n}\n', a); return a >= 0 && b > a ? AGSRC.slice(a, b + 2) : ''; };
  const APPEND = fnSrc('readAtMost') + fnSrc('readDropped') + fnSrc('writeDropped') + fnSrc('appendOrderEvent') + 'return appendOrderEvent(ev);';
  const appendWith = (code, seed) => { const d = fs.mkdtempSync(path.join(tmp, 'pool-')), f = path.join(d, 'pool-orders-log.ndjson'), dr = path.join(d, 'pool-orders-dropped'); fs.writeFileSync(f, seed); new Function('fs', 'ORDERS_LOG', 'ORDERS_DROPPED', 'SO', 'log', 'ev', code)(fs, f, dr, SO, () => { }, { ts: 3, poolId: 'p1', to: 'b' }); return { ...SO.reportOf(fs.readFileSync(f, 'utf8')), dropped: fs.existsSync(dr) ? Number(fs.readFileSync(dr, 'utf8')) : 0 }; };
  const TORN = JSON.stringify({ ts: 1, poolId: 'p1', to: 'a' }) + '\n{"ts":2,"poolId":"p1","to":';
  const now3 = appendWith(APPEND, TORN), rel3 = appendWith("try { fs.appendFileSync(ORDERS_LOG, JSON.stringify(ev) + '\\n'); } catch { }", TORN);   // the release's line, quoted (stale-pins: kept)
  ok(APPEND.includes('function appendOrderEvent(ev)') && now3.events.map((e) => e.to).join() === 'a,b' && now3.torn === 1 && rel3.events.map((e) => e.to).join() === 'a',
    `the agent's own append after a torn last line: its record whole (${now3.events.map((e) => e.to).join()}, the torn one counted); the release's line glued it to the torn one and lost it (${rel3.events.map((e) => e.to).join()}) — RED`);
}

console.log('⑦ r1044, the follow: the door\'s default, a re-scan keeps its code, the «Discovery failed» rows by the code, the push through the page\'s REAL handler');
{
  const trS = (k, p = {}) => String(k).replace(/\{(\w+)\}/g, (m, n) => (n in p ? String(p[n]) : m));
  const SWSRC = read('src/lib/stale-words.js');
  const SW = await import(pathToFileURL(path.join(REPO, 'src/lib/stale-words.js')).href);
  // 1. THE DOOR'S DEFAULT: any reason it does not know is still a machine that replied; only NO reason reads «unreachable»
  const NEWER = 'discovery-a-newer-reason';
  const wordsOf = (W, why) => [W.staleTip(why, trS), W.staleZoneText(why, 'gpu-a', trS), W.errorZoneText(why, 'gpu-a', trS), W.errorChipText(why, '', trS), W.failedRowText(why, 'gpu-a: its own words', 'gpu-a', trS)];
  const wn = wordsOf(SW, NEWER), none = wordsOf(SW, undefined);
  ok(wn.every((x) => !/unreachable/.test(x)) && /list could not be read\.$/.test(wn[1]) && wn[3] === 'not read' && wn[4] === "gpu-a's list could not be read.",
    `a reason this page does not know (a newer agent's «${NEWER}»): «${wn[1]}» · «${wn[3]}» · «${wn[4]}» — never «unreachable»`, wn);
  ok(none.slice(0, 3).every((x) => /unreachable/.test(x)) && none[3] === 'unreachable' && none[4] === 'Discovery failed: gpu-a: its own words', 'only NO reason reads «unreachable» (and the no-list row keeps the hub\'s words, as before)', none);
  const Five = await import(pathToFileURL(M.write('src/lib/stale-words.js', anchored(SWSRC, "export const answered = (why) => typeof why === 'string' && why !== '';", "export const answered = (why) => ['discovery-slow', 'discovery-timeout', 'discovery-too-large', 'discovery-child-failed', 'discovery-child-unstarted'].includes(why);", 'known-five-only'), 'known-five-only', { esm: true })).href);
  ok(/unreachable/.test(Five.staleZoneText(NEWER, 'gpu-a', trS)) && /unreachable/.test(Five.errorZoneText(NEWER, 'gpu-a', trS)), `CONTROL (the door that knows only today's five reasons, in a copy — the cure as it was): «${Five.staleZoneText(NEWER, 'gpu-a', trS)}» for a machine that replied — RED`);
  // THE WORKBENCH's REAL METHODS on a bare class (and a copy's), over a minimal DOM stand-in made AFTER the import
  const WBSRC = read('src/lib/sidebar-workbench.js');
  const { installSidebarWorkbench } = await import(pathToFileURL(path.join(REPO, 'src/lib/sidebar-workbench.js')).href);
  const NoCode = await import(pathToFileURL(M.write('src/lib/sidebar-workbench.js', anchored(WBSRC, 'error: cur?.error || null, errorCode: cur?.errorCode || null, fetchedAt:', 'error: cur?.error || null, fetchedAt:', 'rescan-drops-code'), 'rescan-drops-code', { esm: true })).href);   // the release's loading step, quoted (stale-pins: kept)
  const mkEl = (tag) => { const el = { tagName: tag, children: [], className: '', textContent: '', title: '', style: { setProperty() { } }, dataset: {}, classList: { add() { }, remove() { }, contains: () => false }, setAttribute() { }, append(...c) { el.children.push(...c); }, appendChild(c) { el.children.push(c); return c; } }; return el; };
  const txt = (el) => [el.textContent || '', ...(el.children || []).map(txt)].join(' ').replace(/\s+/g, ' ').trim();
  const hadDoc = 'document' in globalThis, hadFetch = globalThis.fetch;
  globalThis.document = { createElement: mkEl, getElementById: () => null };
  globalThis.fetch = () => new Promise(() => { });   // a re-scan in flight (it never lands in this leg)
  try {
    const bench = (install) => { class S { } install(S); const s = new S(); Object.assign(s, { listEl: mkEl('div'), app: { ws: { onGlobal() { } } }, _render() { }, _renderAgentKindQuickTabs() { }, _wbRecentHost: 'hD', _wbRemoteHosts: new Map(), _hostsData: { hosts: [{ id: 'hD', name: 'gpu-a' }] } }); return s; };
    // 2. A RE-SCAN KEEPS THE CODE: the page holds its cached list and the hub's last error carried a discovery code; ⟳ pressed
    const rescan = (install) => {
      const s = bench(install);
      s._wbRemoteHosts.set('hD', { loading: false, sessions: [{ sessionId: 's1', hostName: 'gpu-a' }], error: 'gpu-a: the discovery walk is still running', errorCode: 'discovery-slow', fetchedAt: 1000, lastFailAt: 0 });
      s._loadRemoteHost('hD', { fresh: true });
      s.listEl = mkEl('div'); s._wbHostStateRow(s._wbRemoteHosts.get('hD'), 'gpu-a');
      return { loading: s._wbRemoteHosts.get('hD').loading, code: s._wbRemoteHosts.get('hD').errorCode, row: txt(s.listEl) };
    };
    const rs = rescan(installSidebarWorkbench), rsRed = rescan(NoCode.installSidebarWorkbench);
    ok(rs.loading === true && rs.code === 'discovery-slow' && /could not be read in time/.test(rs.row) && !/unreachable/.test(rs.row), `a re-scan in flight keeps the code with its error: the zone's row says «${rs.row}»`, rs);
    ok(/is unreachable/.test(rsRed.row), `CONTROL (the loading step that drops the code, in a copy — the release's): «${rsRed.row}» for the whole re-scan — RED`, rsRed);
    // 3. THE «Discovery failed» ROW when there is no list anywhere: by the code (the recent zone, driven); History draws the same door
    const fr = bench(installSidebarWorkbench);
    fr._wbRemoteHosts.set('hD', { loading: false, sessions: null, error: 'gpu-a: the discovery walk is still running (past 8 s); what it finds is kept for the next ask', errorCode: 'discovery-slow', fetchedAt: 0, lastFailAt: Date.now() });
    fr._renderRemoteRecent('hD');
    const frRow = txt(fr.listEl);
    ok(frRow === "gpu-a's list could not be read in time." && /\(r1044\) by the code/.test(WBSRC) && (WBSRC.split('failedRowText(').length - 1) === 2 && !WBSRC.includes("tr('Discovery failed: {err}'"),   // an absence check: the no-list row draws through the door now (stale-pins: kept)
      `no list anywhere and a device that replied: the row says «${frRow}» by the code, in the person's language (zh / ja rows), not the device's own English sentence; the History row draws the same door`);
    // 4. THE PUSH THROUGH THE REAL CONSUMER: server.js's own dirty wiring (its statement, its names handed in), a HostManager whose
    // discovery answers rows, the real dirty signal, and the page's OWN handler over a map that holds a list
    const SRVW = read('server.js'), wa = SRVW.indexOf('  hosts.onDiscoveryDirty = (hostId) => {'), wb = SRVW.indexOf('\n  };\n', wa);
    const WIRING = wa >= 0 && wb > wa ? SRVW.slice(wa, wb + 5) : '';
    const NOW_EXPR = 'sessions: Array.isArray(d) ? d : (d?.sessions || [])', REL_EXPR = 'sessions: d?.sessions || []';
    const { HostManager } = require('../src/hosts.js');
    const pushRun = async (wiring) => {
      const hub = new HostManager({ dataDir: fs.mkdtempSync(path.join(tmp, 'push-')) });
      hub._state.hosts.push({ id: 'hD', name: 'gpu-a', transport: 'dial' });
      hub.deviceBounded = async () => ({ connect: async () => ({ info: { capabilities: ['discovery-claims'] } }), discoveryClaims: async () => ({ sessions: [{ sessionId: 's1', hostName: 'gpu-a' }, { sessionId: 's2', hostName: 'gpu-a' }] }) });
      hub._ssh = async () => { throw new Error('no ssh in this leg'); };
      const fired = [], pushed = [];
      new Function('hosts', 'discDirtyTimers', 'wss', 'bcastAll', 'setTimeout', wiring)(hub, new Map(), { clients: { size: 1 } }, (m) => pushed.push(m), (fn) => { fired.push(fn); return 1; });
      const page = bench(installSidebarWorkbench); let handler = null;
      page.app = { ws: { onGlobal: (fn) => { handler = fn; } } };
      page._wbRemoteHosts.set('hD', { loading: false, sessions: [{ sessionId: 's1', hostName: 'gpu-a' }], error: null, fetchedAt: 1000, lastFailAt: 0 });
      page._initRemoteDirtySync();
      hub.invalidateDiscovery('hD');   // the real dirty signal: a conversation ended there
      for (const fn of fired.splice(0)) await fn();
      require(path.join(REPO, 'src/store-writer.js')).storeWriter().forget(hub._discFile);   // B-574d (lane nl-paired): the last-known list's write is the store writer's now — this leg's folder never owes it
      for (const m of pushed) handler && handler(m);
      return { pushed: pushed.length, rows: (page._wbRemoteHosts.get('hD').sessions || []).map((s) => s.sessionId).join() || '(empty)' };
    };
    const pn = await pushRun(WIRING), pr = await pushRun(WIRING.replace(NOW_EXPR, REL_EXPR));
    ok(WIRING.split(NOW_EXPR).length === 2 && pn.pushed === 1 && pn.rows === 's1,s2', `the dirty push, end to end (server.js's own wiring → the page's own handler): the machine's list on the page is its two rows (${pn.rows})`, pn);
    ok(pr.pushed === 1 && pr.rows === '(empty)', `CONTROL (the release's line, d?.sessions): the same push empties the machine's list on the page (${pr.rows}) — RED`, pr);
  } finally {
    if (hadDoc) { } else delete globalThis.document;
    globalThis.fetch = hadFetch;
  }
}

console.log('⑧ r1044, the next part: a device that said its walk is still running is never walked a second time (no snapshot ask joining it, no ssh walk of the same home)');
{
  const { HostManager, NO_SECOND_WALK } = require('../src/hosts.js');
  const refuse = (code) => () => Promise.reject(code ? Object.assign(new Error(`the device refused (${code})`), { code }) : new Error('device-claims deadline'));
  const road = async (HM, code, { last = true } = {}) => {
    const m = new HM({ dataDir: fs.mkdtempSync(path.join(tmp, 'walk2-')) });
    m._state.hosts.push({ id: 'hW', name: 'gpu-a', transport: 'dial' });
    const asked = { claims: 0, snapshot: 0, ssh: 0 };
    m.deviceBounded = async () => ({ connect: async () => ({ info: { capabilities: ['discovery-claims'] } }),
      discoveryClaims: () => { asked.claims++; return refuse(code)(); }, discoverySnapshot: () => { asked.snapshot++; return refuse(code)(); } });
    m._ssh = async () => { asked.ssh++; throw new Error('ssh: connect to host gpu-a port 22: Connection timed out'); };
    if (last) m._discoveryCache.set('hW', { at: 5000, sessions: [{ sessionId: 's1' }] });
    let rows = null, err = null;
    try { rows = await m.discoverSessions('hW', { ttlMs: 0 }); } catch (e) { err = e; }
    return { ...asked, why: rows && rows[0].staleWhy, err: err && err.message };
  };
  for (const code of ['discovery-slow', 'discovery-timeout', 'discovery-too-large']) {
    const r = await road(HostManager, code);
    ok(NO_SECOND_WALK.has(code) && r.claims === 1 && r.snapshot === 0 && r.ssh === 0 && r.why === code,
      `the device answered «${code}»: one ask, then the hub's last list with that reason at once — no snapshot ask joining the same walk, no ssh walk of the same home (${JSON.stringify(r)})`);
  }
  for (const code of ['discovery-child-failed', 'discovery-child-unstarted']) {
    const r = await road(HostManager, code);
    ok(!NO_SECOND_WALK.has(code) && r.snapshot === 1 && r.ssh === 1 && r.why === code,
      `…a child that failed or could not start («${code}»): the other roads are still tried — the snapshot ask and the ssh rung's shell walk (${JSON.stringify(r)})`);
  }
  // (r1082's shoulds) with NO last list: «still walking» waits on that same walk once more (joining it is no second walk) and
  // never walks over ssh; a walk that ran out of its bound or answered too much keeps the ssh road (a home never listed has no other)
  const nl = {}; for (const code of ['discovery-slow', 'discovery-timeout', 'discovery-too-large']) nl[code] = await road(HostManager, code, { last: false });
  ok(nl['discovery-slow'].snapshot === 1 && nl['discovery-slow'].ssh === 0 && nl['discovery-timeout'].snapshot === 1 && nl['discovery-timeout'].ssh === 1 && nl['discovery-too-large'].ssh === 1,
    `no last list: «still walking» joins the same walk once more and never walks over ssh; a timed-out or too-large walk keeps the ssh road (${JSON.stringify(nl)})`);
  const quiet = await road(HostManager, null);
  ok(quiet.snapshot === 1 && quiet.ssh === 1 && quiet.why === undefined, `a device that does not reply (a deadline, no code): every road is tried, and the last list says unreachable (${JSON.stringify(quiet)})`);
  const HSRC3 = read('src/hosts.js');
  const Twice = M.load('src/hosts.js', anchored(anchored(HSRC3, "          if (NO_SECOND_WALK.has(deviceWhy) && this._hasLastList(id)) throw deviceErr;\n", '', 'second-walk-snapshot'), "      if (out == null && (deviceWhy === 'discovery-slow' || (NO_SECOND_WALK.has(deviceWhy) && this._hasLastList(id)))) throw deviceErr;\n", '', 'second-walk-ssh'), 'second-walk');
  const red = await road(Twice.HostManager, 'discovery-slow');
  ok(red.snapshot === 1 && red.ssh === 1, `CONTROL (the release's rungs, in a copy): after «still walking» the hub asks the same walk again and walks the same home over ssh (${JSON.stringify(red)}) — RED`);
}

console.log('⑨ the next part (r1044): the agent\'s reply is bounded BY CONSTRUCTION, so its parse and its re-serialization on the agent\'s loop are bounded — the live locks and the open codex rollouts at their producer, the child\'s answer at 16 MiB');
{
  const DF = require('../src/discovery-facts.js');
  // the PURE picker: none over 64 KiB, the newest first, at most 1000
  const ents = Array.from({ length: 1003 }, (_, i) => ({ name: `${100000 + i}.json`, size: i === 7 ? 70 * 1024 : 180, mtimeMs: 1000 + i }));
  const pk = DF.pickLockFiles(ents);
  ok(DF.DISCOVERY_LOCKS_MAX === 1000 && DF.DISCOVERY_LOCK_FILE_MAX === 64 * 1024 && pk.take.length === 1000 && pk.left === 3 && !pk.take.some((e) => e.size > 64 * 1024) && pk.take[0].mtimeMs === 2002,
    `the lock files a snapshot reads: none over 64 KiB, the newest first, at most 1000 — 1003 live (one of 70 KiB) ⇒ ${pk.take.length} read, ${pk.left} left out and counted`);
  // THE AGENT's REAL CHILD on a fixture home of 1003 lock files (a copy that only waives liveness and the claude-process check,
  // which no fixture can meet — every other line is the tree's): the bounds hold where the rows are made
  const h = homeOf('f9'), S = path.join(h, '.claude', 'sessions');
  fs.mkdirSync(S, { recursive: true });
  for (let i = 0; i < 1003; i++) {
    const f = path.join(S, `${200000 + i}.json`);
    fs.writeFileSync(f, i === 7 ? JSON.stringify({ sessionId: sidOf(i), cwd: '/w', pad: 'x'.repeat(70 * 1024) }) : JSON.stringify({ sessionId: sidOf(i), cwd: `/home/u/p${i}`, startedAt: 1700000000000 + i }));
    fs.utimesSync(f, 1700000000 + i, 1700000000 + i);
  }
  const waive = (src, tag) => anchored(anchored(src, '      let alive = false; try { process.kill(pid, 0); alive = true; } catch { }\n', '      let alive = true;\n', tag + '-alive'), /      (?:if \(!pidLooksClaude\(pid\)\) continue;|let claude = false; try \{ claude = pidLooksClaude\(pid\); \} catch \{ \}\n      if \(!claude\) continue;)\n/, '', tag + '-claude');   // a quoted older form (stale-pins: kept)
  const tree = snapshotOf(M.write('src/agentd/agentd.js', waive(AGSRC, 'locks-bounded'), 'locks-bounded'), h);
  const relLoop = "      try { locks.push({ pid, ...JSON.parse(fs.readFileSync(path.join(home, '.claude', 'sessions', f), 'utf-8')) }); } catch { }\n    }\n  } catch { }\n";   // the release's lock loop, quoted (stale-pins: kept)
  const AG_REL = anchored(AGSRC, /  const locks = \[\];\n  let locksLeft = 0;\n[\s\S]*?\n  } catch \{ \}\n(?=  const jsonls = \[\];)/, "  const locks = [];\n  let locksLeft = 0;\n  try {\n    for (const f of fs.readdirSync(path.join(home, '.claude', 'sessions'))) {\n      if (!f.endsWith('.json')) continue;\n      const pid = Number(f.slice(0, -5));\n      let alive = false; try { process.kill(pid, 0); alive = true; } catch { }\n      if (!alive) continue;\n      if (!pidLooksClaude(pid)) continue;\n" + relLoop, 'release-locks');
  const rel = snapshotOf(M.write('src/agentd/agentd.js', waive(AG_REL, 'release-locks'), 'release-locks-waived'), h);
  const tl = tree.snap && tree.snap.locks, rl = rel.snap && rel.snap.locks;
  ok(tree.code === 0 && tl && tl.length === 1000 && tree.snap.left && tree.snap.left.locks === 3 && !tl.some((l) => l.pad) && tl.some((l) => l.sessionId === sidOf(1002)),
    `the agent's own child: ${tl && tl.length} locks, the newest; the 70 KiB file and the two oldest left out and counted (left.locks ${tree.snap && tree.snap.left && tree.snap.left.locks}) — ${tree.err}`);
  ok(rel.code === 0 && rl && rl.length === 1003 && rl.some((l) => l.pad), `CONTROL (the release's lock loop, in a copy): every lock read whole — ${rl && rl.length}, the 70 KiB one among them, nothing counted — RED`);
  // (r1082, THE LAW) ONE LOCK THAT CANNOT BE READ NEVER COSTS ANOTHER LOCK ITS READ — a lock that vanishes between the pick and the
  // read (placed: one seam in a copy removes the second-newest picked lock there), and an entry that is a folder with a lock's name
  const hr = homeOf('f9r'), SR = path.join(hr, '.claude', 'sessions');
  fs.mkdirSync(SR, { recursive: true });
  for (let i = 0; i < 6; i++) { const f = path.join(SR, `${300000 + i}.json`); fs.writeFileSync(f, JSON.stringify({ sessionId: sidOf(300 + i), cwd: `/home/u/q${i}` })); fs.utimesSync(f, 1700000000 + i, 1700000000 + i); }
  const dirLock = path.join(SR, '300099.json'); fs.mkdirSync(dirLock); fs.utimesSync(dirLock, 1700009999, 1700009999);   // the newest entry: a folder
  const raced = (src, tag) => anchored(src, '    const pick = pickLockFiles(live);\n', '    const pick = pickLockFiles(live);\n    try { const gone = pick.take.filter((x) => x.name !== \'300099.json\')[1]; if (gone) fs.rmSync(path.join(sdir, gone.name)); } catch { }\n', tag);
  const race = snapshotOf(M.write('src/agentd/agentd.js', raced(waive(AGSRC, 'race'), 'race-seam'), 'race-seam'), hr);
  const TIP_READ = "      let text = null;\n      try { text = readAtMost(path.join(sdir, e.name), DISCOVERY_LOCK_FILE_MAX); } catch (err) { if (!err || err.code !== 'ENOENT') locksLeft++; continue; }\n";
  const tipSrc = anchored(anchored(AGSRC, TIP_READ, '      const text = readAtMost(path.join(sdir, e.name), DISCOVERY_LOCK_FILE_MAX);\n', 'tip-read'), 'if (st.isFile()) live.push(', 'live.push(', 'tip-stat');   // the tip's loop (f05abb93a), quoted (stale-pins: kept)
  const raceTip = snapshotOf(M.write('src/agentd/agentd.js', raced(waive(tipSrc, 'race-tip'), 'race-tip-seam'), 'race-tip-seam'), hr);
  const rl2 = race.snap && race.snap.locks, tl2 = raceTip.snap && raceTip.snap.locks;
  ok(race.code === 0 && rl2 && rl2.length === 5 && !(race.snap.left && race.snap.left.locks) && rl2.some((l) => l.sessionId === sidOf(300)),
    `a lock gone between the pick and the read, and a folder with a lock's name: every other lock is read (${rl2 && rl2.length} of the 5 left), the ended one not counted, the folder no lock — ${race.err}`);
  ok(raceTip.code === 0 && tl2 && tl2.length < 5, `CONTROL (the tip's loop, in a copy — f05abb93a): the first that cannot be read ends the loop — ${tl2 && tl2.length} lock(s) read, every running conversation after it listed as stopped, nothing said — RED`);
  // the open codex rollouts and the child's answer: their bounds, wired
  const n = (t) => AGSRC.split(t).length - 1;
  ok(DF.DISCOVERY_CODEX_OPEN_MAX === 1000 && DF.DISCOVERY_CHILD_MAX_BYTES === 16 * 1024 * 1024 && n('codexOpen = codexOpen.slice(0, DISCOVERY_CODEX_OPEN_MAX)') === 1 && n('maxBuffer: DISCOVERY_CHILD_MAX_BYTES, env: spawnEnv() }, cb);') === 2 && n('maxBuffer: 64 * 1024 * 1024, env: spawnEnv() }, cb);') === 0   // an absence check (stale-pins: kept)
    && /more than its bound \(16 MiB\)/.test(DF.snapshotChildVerdict({ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }, '').error),
    'the open codex rollouts at most 1000 (the rest counted); both discovery children answer within 16 MiB (it was 64), and past it the walk is refused by name — the kept snapshot answers');
  // the hub says what was left out, each kind ONCE
  const { DeviceManager } = require('../src/agentd/client.js');
  const D9 = new DeviceManager({ dataDir: path.join(tmp, 'dm9'), bundlePath: path.join(tmp, 'none9.js'), version: '1.0.0', machine: 'box-1', transport: { kind: 'stream', hostToken: () => 'x', getStream: () => null } });
  const logs9 = []; D9._log = (l) => logs9.push(String(l));
  D9._request = async () => ({ locks: [], jsonls: [], left: { locks: 3, codexOpen: 2 } });
  await D9.discoverySnapshot(); await D9.discoverySnapshot();
  ok(logs9.filter((l) => /lock file\(s\) left out/.test(l)).length === 1 && logs9.filter((l) => /open codex rollout\(s\) left out/.test(l)).length === 1, 'the hub says each kind left out ONCE (lock files, open codex rollouts)', logs9);
}

console.log('⑩ the unit\'s last piece: the other producers bounded by construction (the pool\'s report at its write, the passive readings, the held logins), and the caps lowered for an agent that says producer-bounds');
{
  const AC = require('../src/agentd/answer-caps.js'), SO = require('../src/sealed-orders.js');
  const fnSrc = (name) => { const a = AGSRC.indexOf('function ' + name + '('), b = AGSRC.indexOf('\n}\n', a); return a >= 0 && b > a ? AGSRC.slice(a, b + 2) : ''; };
  // THE POOL's REPORT, bounded at its write — the agent's own appendOrderEvent and pendingReport, run on temp files
  const pool = (seed) => {
    const d = fs.mkdtempSync(path.join(tmp, 'pool10-')), f = path.join(d, 'pool-orders-log.ndjson'), dr = path.join(d, 'pool-orders-dropped');
    if (seed != null) fs.writeFileSync(f, seed);
    const deps = ['fs', 'ORDERS_LOG', 'ORDERS_DROPPED', 'SO', 'log', 'require'], vals = [fs, f, dr, SO, () => { }, require];
    const append = (ev) => new Function(...deps, 'ev', fnSrc('readAtMost') + fnSrc('readDropped') + fnSrc('writeDropped') + fnSrc('appendOrderEvent') + 'return appendOrderEvent(ev);')(...vals, ev);
    const a = AGSRC.indexOf('  pendingReport() {'), b = AGSRC.indexOf('\n  },\n', a);
    const report = () => new Function(...deps, fnSrc('readAtMost') + fnSrc('readHeadOf') + fnSrc('readDropped') + fnSrc('headSum') + 'return ({' + AGSRC.slice(a, b + 4) + '}).pendingReport();')(...vals);
    return { append, report, size: () => (fs.existsSync(f) ? fs.statSync(f).size : 0) };
  };
  const ev = (i) => ({ ts: i, poolId: 'p1', sid: 's', banner: 'limit', from: '/home/u/.vibespace/subs/a', to: 'b', link: '/home/u/.claude' });
  const full = SO.POOL_LOG_EVENTS_MAX === 2000 && SO.POOL_LOG_BYTES_MAX === 1024 * 1024 ? Array.from({ length: 2000 }, (_, i) => JSON.stringify(ev(i))).join('\n') + '\n' : '';
  const p1 = pool(full), wrote = p1.append(ev(9001)), r1 = p1.report();
  ok(full && wrote === false && r1.events.length === 2000 && r1.dropped === 1 && !r1.cut, `a report holding 2000 records: the next switch is NOT written, it is counted (${r1.dropped}) and said with the report (${r1.events.length} events)`, { wrote, n: r1.events.length, dropped: r1.dropped });
  const big = ('x'.repeat(1000) + '\n').repeat(1100);   // an older agent's report past the bound (1.05 MiB), no record whole
  const p2 = pool(big), w2 = p2.append(ev(1)), r2 = p2.report();
  ok(w2 === false && p2.size() === big.length && r2.cut === true && r2.dropped === 1, 'an older agent\'s report past its bound: never read past it, nothing appended to it, the record counted; its report read to the bound only (cut)');
  const p3 = pool(null), w3 = p3.append(ev(1)), r3 = p3.report();
  ok(w3 === true && r3.events.length === 1 && !r3.dropped && !r3.cut, 'no report yet: the first record is written and reported');
  ok(AGSRC.includes("...(rep.dropped ? { eventsDropped: rep.dropped } : {}), ...(rep.cut ? { eventsCut: true } : {}), ...(rep.more ? { eventsMore: rep.more } : {}), ...(rep.torn ? { eventsTorn: rep.torn } : {}), reportAck: rep.ack });"), 'the reply carries what was not written (eventsDropped), what waits (eventsMore / eventsCut) and torn lines; the hub\'s ack removes what was answered (⑫)');
  // THE PASSIVE READINGS: the ssh twin's own bound, one picker
  const names = [...Array.from({ length: 70 }, (_, i) => `sub-${String(i).padStart(3, '0')}.json`), '__models__x.json', 'notes.txt', '__global__.json'];
  const pk = AC.passivePick(names), HS10 = read('src/hosts.js');
  ok(pk.take.length === 64 && pk.left === 7 && pk.take[0] === '__global__.json' && !pk.take.some((n) => n.startsWith('__models__') || !n.endsWith('.json'))
    && /const PASSIVE_PEEK_FILES = AC\.PASSIVE_FILES_MAX, PASSIVE_PEEK_BYTES = AC\.PASSIVE_FILE_MAX,/.test(HS10) && AC.PASSIVE_FILES_MAX === 64 && AC.PASSIVE_FILE_MAX === 65536,
    `the passive readings an agent answers: the first 64 by name, none over 64 KiB — the ssh twin's own bound (hosts.js PASSIVE_PEEK_*), 72 files ⇒ ${pk.take.length} read, ${pk.left} counted`);
  ok(AGSRC.includes("const ACp = require('./answer-caps.js'), passive = {};") && AGSRC.includes("text = readAtMost(path.join(cdir, f), ACp.PASSIVE_FILE_MAX);") && AGSRC.includes('...(passiveLeft ? { passiveLeft } : {})'),
    'the agent reads them through that picker and a bounded read, and says what it left out (passiveLeft)');
  // THE HELD LOGINS (probe-creds): the device's real credsFacts in a child, on a fixture home of 502 folders and one long email
  const h10 = homeOf('f10'), SUBS = path.join(h10, '.vibespace', 'subs');
  for (let i = 0; i < 502; i++) { const d = path.join(SUBS, `acct-${String(i).padStart(3, '0')}`); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: i === 3 ? 'a'.repeat(330) + '@example.test' : `user${i}@example.test` } })); }
  const MP = path.join(REPO, 'src/machine-probes.js');
  const cr = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(MP)}).credsFacts().then((f) => process.stdout.write(JSON.stringify({ n: Object.keys(f.hostSubEmails).length, left: f.hostSubsLeft || 0, long: f.hostSubEmails['acct-003'] || null, last: Object.keys(f.hostSubEmails).sort().pop() })))`], { encoding: 'utf8', env: { ...process.env, HOME: h10 }, timeout: 20000 });
  let cf = null; try { cf = JSON.parse(cr.stdout); } catch { }
  ok(cf && cf.n === 499 && cf.left === 2 && cf.long === null && cf.last === 'acct-499', `the held logins the device answers: at most 500 folders by name (502 ⇒ ${cf && cf.left} counted), an email over 320 units none (${cf && cf.long}) — ${String(cr.stderr || '').slice(0, 200)}`, cf);
  // THE CAPS: lowered only for an agent that says producer-bounds; each row at or under the release's; the agent says it
  const B = AC.BOUNDED_CAPS, rowsB = Object.keys(B);
  ok(rowsB.length === 7 && rowsB.every((op) => Object.prototype.hasOwnProperty.call(AC.CAPS, op) && B[op] <= AC.CAPS[op]) && Object.prototype.hasOwnProperty.call(B, 'opencode-serve'),
    `the lowered table: ${rowsB.map((op) => `${op} ${AC.sizeOf(B[op])}`).join(', ')} — every row in the release's table and at or under it (opencode-serve's since part 5: ⑪)`);
  ok(AC.capOf('quota-refresh', ['probe', AC.PRODUCER_BOUNDS]) === 8 * AC.MiB && AC.capOf('quota-refresh', ['probe']) === AC.CAPS['quota-refresh'] && AC.capOf('quota-refresh') === AC.CAPS['quota-refresh'] && AC.capOf('fs-op', [AC.PRODUCER_BOUNDS]) === AC.CAPS['fs-op'],
    'ONE picker: an agent saying producer-bounds gets the lowered row; an older agent (or none said) keeps the release\'s row; an op with no lowered row keeps its own');
  ok(B['discovery-snapshot'] >= require('../src/discovery-facts.js').DISCOVERY_CHILD_MAX_BYTES + 1024 * 1024 && B['pool-orders'] >= SO.POOL_LOG_BYTES_MAX * 1.5 && B['quota-refresh'] >= AC.PASSIVE_FILES_MAX * AC.PASSIVE_FILE_MAX + 2 * 262144 * 6,
    'each lowered row sits above its producer\'s own bound (the discovery child, the pool\'s report escaped, the passive readings + two vendor bodies escaped)');
  ok(/'answer-bounds' \/\*[^*]*\*\/, 'producer-bounds' \/\*/.test(AGSRC) && read('src/agentd/client.js').includes('const cap = AC.capOf(payload.op, conn.info && conn.info.capabilities);'),
    'the agent says producer-bounds in its hello; the hub picks the cap by what this agent said');
}

console.log('⑪ part 5: a conversation\'s read and the status list are bounded where they are made, the same for every rung (opencode-serve)');
{
  const OR = require('../src/opencode-remote.js');
  // THE PURE BOUND: the session record and the newest records that fit
  const rec = (i, n) => ({ ts: String(i), type: 'acp', kind: 'update', update: { text: 'x'.repeat(n) } });
  const SESSION = { ts: '0', type: 'acp', kind: 'session', sessionId: 'ses_a1' };
  const small = OR.boundRead({ id: 'ses_a1' }, [SESSION, rec(1, 10), rec(2, 10)]);
  const cut = OR.boundRead({ id: 'ses_a1' }, [SESSION, ...Array.from({ length: 10 }, (_, i) => rec(i + 1, 1000))], 4000);
  ok(small.records.length === 3 && !('truncated' in small) && cut.truncated === true && cut.total === 10 && cut.kept === 3 && cut.records[0] === SESSION && cut.records[cut.records.length - 1].ts === '10',
    `a read that fits answers as before (no new key); one that does not keeps the session record and the NEWEST that fit, and says so (truncated, total ${cut.total}, kept ${cut.kept})`);
  // THE DEVICE's OP, the real table: a 35 MiB conversation (35 records of 1 MiB) answers within READ_MAX
  const big = [SESSION, ...Array.from({ length: 35 }, (_, i) => rec(i + 1, 1024 * 1024))];
  const facts = { readConversation: async () => ({ session: { id: 'ses_a1' }, records: big }), statusMap: async () => Object.fromEntries(Array.from({ length: 2005 }, (_, i) => [`ses_${i}`, { type: 'idle' }])) };
  const rd = await OR.runOpencodeOp(facts, 'read', { id: 'ses_a1' });
  const bytes = rd.records.reduce((a, r) => a + Buffer.byteLength(JSON.stringify(r)) + 1, 0);
  ok(OR.READ_MAX === 32 * 1024 * 1024 && rd.truncated === true && rd.total === 35 && rd.kept < 35 && bytes <= OR.READ_MAX && rd.records[0] === SESSION && rd.records[rd.records.length - 1].ts === '35',
    `the device's read of a 35 MiB conversation: the session record + the newest ${rd.kept} of ${rd.total} (${(bytes / 1048576).toFixed(1)} MiB ≤ 32 MiB), said truncated`);
  const st = await OR.runOpencodeOp(facts, 'status', {});
  ok(OR.STATUS_MAX === 2000 && Object.keys(st.statuses).length === 2000 && st.truncated === true && st.total === 2005, 'the status list: at most 2000 entries, the rest said (truncated, total)');
  const ORSRC = read('src/opencode-remote.js');
  const Rel = M.load('src/opencode-remote.js', anchored(ORSRC, '    result: (v) => boundRead(v?.session || null, v?.records),   // B-5278: the newest records within READ_MAX\n', '    result: (v) => ({ session: v?.session || null, records: Array.isArray(v?.records) ? v.records : [] }),\n', 'release-read'), 'release-read');   // the release's normaliser, quoted (stale-pins: kept)
  const rr = await Rel.runOpencodeOp(facts, 'read', { id: 'ses_a1' });
  ok(rr.records.length === 36 && !rr.truncated, `CONTROL (the release's read, in a copy): the whole 35 MiB conversation in one answer (${rr.records.length} records) — RED`);
  // every rung the same: the hub's synthesis of the ssh rung's raw payload goes through the same bound; the device's row lowered
  const AC11 = require('../src/agentd/answer-caps.js');
  ok(read('src/server/opencode-access.js').includes('return boundRead(r?.session || null, messagesToAcpRecords(') && AC11.BOUNDED_CAPS['opencode-serve'] === 40 * AC11.MiB && AC11.BOUNDED_CAPS['opencode-serve'] >= OR.READ_MAX * 1.2,
    'the hub\'s synthesis of the ssh rung\'s payload takes the same bound; the op\'s lowered row (40 MiB) sits above READ_MAX and its envelope');
}

console.log('⑫ r1135 (into part 5): the pool\'s report answers its HEAD and counts what waits; the ack removes ONLY what was read; the passive readings are ONE rule on both roads');
{
  const SO = require('../src/sealed-orders.js'), H12 = require('../src/hosts.js');
  const fnSrc = (name) => { const a = AGSRC.indexOf('function ' + name + '('), b = AGSRC.indexOf('\n}\n', a); return a >= 0 && b > a ? AGSRC.slice(a, b + 2) : ''; };
  const method = (name, src = AGSRC) => { let a = src.indexOf('  ' + name + '() {'); if (a < 0) a = src.indexOf('  ' + name + '(token) {'); const b = src.indexOf('\n  },\n', a); return a >= 0 && b > a ? src.slice(a, b + 5) + '\n' : ''; };
  const FNS = fnSrc('readAtMost') + fnSrc('readHeadOf') + fnSrc('readDropped') + fnSrc('writeDropped') + fnSrc('headSum') + fnSrc('dropReportHead') + fnSrc('appendOrderEvent');
  const agentPool = (seed, { clear = method('clearReport') } = {}) => {
    const d = fs.mkdtempSync(path.join(tmp, 'pool12-')), f = path.join(d, 'pool-orders-log.ndjson'), dr = path.join(d, 'pool-orders-dropped');
    if (seed != null) fs.writeFileSync(f, seed);
    const so = new Function('fs', 'ORDERS_LOG', 'ORDERS_DROPPED', 'SO', 'log', 'require', FNS + 'return ({ appendOrderEvent, writeDropped, readDropped, obj: {' + method('pendingReport') + clear + '} });')(fs, f, dr, SO, () => { }, require);
    return { ...so, lines: () => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length : 0) };
  };
  const ev = (i) => JSON.stringify({ ts: i, poolId: 'p1', sid: 's', banner: 'limit', from: '/a', to: 'b', link: '/l' });
  // 1. THE HEAD, and what waits past it counted: an older report of 2005 records, under the size bound
  const P = agentPool(Array.from({ length: 2005 }, (_, i) => ev(i)).join('\n') + '\n');
  const r1 = P.obj.pendingReport();
  P.obj.clearReport();
  const r2 = P.obj.pendingReport();
  ok(r1.events.length === 2000 && r1.more === 5 && r2.events.length === 5 && r2.events[0].ts === 2000 && P.lines() === 5,
    `a report of 2005 records answers its head (${r1.events.length}) and counts what waits (${r1.more}); after the ack the 5 are the next report, never deleted unsaid`);
  // 2. THE ACK REMOVES ONLY WHAT WAS READ — a record appended meanwhile, and the dropped count, stay
  const Q = agentPool(ev(1) + '\n' + ev(2) + '\n');
  Q.writeDropped({ total: 3, acked: 0 });
  const q1 = Q.obj.pendingReport();
  Q.appendOrderEvent({ ts: 77, poolId: 'p1', to: 'z' });
  { const x = Q.readDropped(); Q.writeDropped({ total: x.total + 2, acked: x.acked }); }
  Q.obj.clearReport();
  const q2 = Q.obj.pendingReport();
  ok(q1.events.length === 2 && q1.dropped === 3 && q2.events.length === 1 && q2.events[0].ts === 77 && q2.dropped === 2,
    `the ack removes exactly what was answered: the record written after the report stays (${q2.events.map((e) => e.ts)}), and the dropped count keeps the ${q2.dropped} counted since`);
  const RELEASE_CLEAR = "  clearReport() { try { fs.rmSync(ORDERS_LOG, { force: true }); } catch { } try { fs.rmSync(ORDERS_DROPPED, { force: true }); } catch { } },\n";   // the last piece's ack, quoted (stale-pins: kept)
  const R = agentPool(ev(1) + '\n', { clear: RELEASE_CLEAR });
  R.obj.pendingReport(); R.appendOrderEvent({ ts: 77, poolId: 'p1', to: 'z' }); R.obj.clearReport();
  ok(R.obj.pendingReport().events.length === 0, 'CONTROL (the ack that deletes the whole report, in a copy): the record written after the report is lost unsaid — RED');
  // …and a report that carries only a dropped count (or torn lines) is acked too: the client hands it to the engine
  const { DeviceManager } = require('../src/agentd/client.js');
  const D12 = new DeviceManager({ dataDir: path.join(tmp, 'dm12'), bundlePath: path.join(tmp, 'none12.js'), version: '1.0.0', machine: 'box-1', transport: { kind: 'stream', hostToken: () => 'x', getStream: () => null } });
  D12._log = () => { }; D12.connect = async () => ({ info: { capabilities: ['pool-orders'] } });
  D12._request = async () => ({ op: 'pool-orders-ok', events: [], eventsDropped: 3 });
  let acked = 0; await D12.poolOrders({}, () => { acked++; });
  ok(acked === 1, 'a report with a dropped count and no record reaches the engine, which acks it (its counter never stands for ever)');
  // 3. THE PASSIVE READINGS, ONE RULE ON BOTH ROADS — the device's readPassive and the ssh twin's shell, on one fixture home
  const h = homeOf('f12'), C = path.join(h, '.vibespace', 'usage-cache');
  fs.mkdirSync(C, { recursive: true });
  const reading = (n) => JSON.stringify({ fetchedAt: 1700000000000 + n, five_hour: { utilization: n } });
  for (let i = 0; i < 70; i++) fs.writeFileSync(path.join(C, `sub-${String(i).padStart(3, '0')}.json`), reading(i));
  fs.writeFileSync(path.join(C, '__global__.json'), reading(999));
  fs.writeFileSync(path.join(C, '__models__a.json'), reading(1));
  fs.writeFileSync(path.join(C, 'big.json'), JSON.stringify({ fetchedAt: 1, pad: 'x'.repeat(70 * 1024) }));
  fs.mkdirSync(path.join(C, 'dir.json'));
  fs.writeFileSync(path.join(C, 'we ird.json'), reading(2));
  fs.writeFileSync(path.join(C, 'notes.txt'), 'x');
  const agentReq = createRequire(path.join(REPO, 'src/agentd/agentd.js'));
  const device = new Function('fs', 'path', 'require', 'cdir', fnSrc('readAtMost') + fnSrc('readPassive') + 'return readPassive(cdir);')(fs, path, agentReq, C);
  const twinOf = (script) => { const r = spawnSync('sh', ['-c', script], { encoding: 'utf8', env: { HOME: h, PATH: '/usr/bin:/bin' }, timeout: 20000 }); return { passive: H12.passiveOfPeek(r.stdout), left: H12.passiveLeftOfPeek(r.stdout), err: String(r.stderr || '').slice(0, 200) }; };
  const twin = twinOf(H12.PASSIVE_PEEK_SH);
  const keysD = Object.keys(device.passive), keysT = Object.keys(twin.passive);
  ok(keysD.length === 62 && JSON.stringify(keysD) === JSON.stringify(keysT) && device.left === 11 && twin.left === 11 && keysD[0] === '__global__' && !keysD.includes('big') && !keysD.includes('we ird'),
    `the device and its ssh twin, one fixture home of 76 entries: the same ${keysD.length} readings in the same order, the same count left out (${device.left} / ${twin.left}: past 64, the 70 KiB file, the folder) — ${twin.err}`, { keysD: keysD.slice(0, 4), keysT: keysT.slice(0, 4) });
  const RELEASE_TWIN = 'd="$HOME/.vibespace/usage-cache"; n=0; for f in "$d"/*.json; do [ -f "$f" ] || continue; b=${f##*/}; case "$b" in __models__*) continue;; esac; n=$((n+1)); [ "$n" -gt 64 ] && break; printf \'\\n@@vs-passive@@ %s\\n\' "$b"; head -c 65536 "$f"; done; true';   // the release's twin, quoted (stale-pins: kept)
  const rel = twinOf(RELEASE_TWIN);
  ok(rel.left === 0 && (JSON.stringify(Object.keys(rel.passive)) !== JSON.stringify(keysD) || rel.left !== device.left), `CONTROL (the release's twin script): it counts nothing left out (${rel.left}) where the device counts ${device.left} — the two roads disagree — RED`);
  ok(AGSRC.includes("const { passive, left: passiveLeft } = readPassive(path.join(home, '.vibespace', 'usage-cache'));") && fnSrc('writeDropped').includes("fs.renameSync(tmp, ORDERS_DROPPED);"),
    'the agent\'s quota answer reads through that one function; the dropped counter is written whole or not at all (temp + rename)');
}

console.log('⑬ r1155 (part 5\'s follow): the ack names what it acks; the head on the file\'s bytes; the truncated mark through every rung; the twin bounded at its read');
{
  const SO = require('../src/sealed-orders.js'), OR = require('../src/opencode-remote.js');
  const fnSrc = (name) => { const a = AGSRC.indexOf('function ' + name + '('), b = AGSRC.indexOf('\n}\n', a); return a >= 0 && b > a ? AGSRC.slice(a, b + 2) : ''; };
  const method = (name) => { const a = AGSRC.indexOf('  ' + name + '() {') >= 0 ? AGSRC.indexOf('  ' + name + '() {') : AGSRC.indexOf('  ' + name + '(token) {'), b = AGSRC.indexOf('\n  },\n', a); return a >= 0 && b > a ? AGSRC.slice(a, b + 5) + '\n' : ''; };
  const FNS = ['readAtMost', 'readHeadOf', 'readDropped', 'writeDropped', 'headSum', 'dropReportHead', 'appendOrderEvent'].map(fnSrc).join('');
  const agentPool = (seed) => {
    const d = fs.mkdtempSync(path.join(tmp, 'pool13-')), f = path.join(d, 'pool-orders-log.ndjson'), dr = path.join(d, 'pool-orders-dropped');
    if (seed != null) fs.writeFileSync(f, seed);
    return new Function('fs', 'ORDERS_LOG', 'ORDERS_DROPPED', 'SO', 'log', 'require', FNS + 'return ({ appendOrderEvent, readDropped, writeDropped, obj: {' + method('pendingReport') + method('clearReport') + '} });')(fs, f, dr, SO, () => { }, require);
  };
  const ev = (i) => JSON.stringify({ ts: i, poolId: 'p1', to: 'b' });
  // 1. TWO READS IN FLIGHT (two pools, or a second hub): the first ack names ITS report; the second reply is lost — nothing lost
  const P = agentPool(ev(1) + '\n' + ev(2) + '\n');
  const A = P.obj.pendingReport();
  P.appendOrderEvent({ ts: 3, poolId: 'p1', to: 'c' });
  P.obj.pendingReport();                                   // the second read — its reply never reaches a hub
  P.obj.clearReport(A.ack);                                // the first hub acks what IT was answered
  const after = P.obj.pendingReport();
  ok(A.events.length === 2 && after.events.length === 1 && after.events[0].ts === 3, `two reads in flight, the first ack names its own report: the record only the second (lost) reply carried stays (${after.events.map((e) => e.ts)})`);
  const Q = agentPool(ev(1) + '\n' + ev(2) + '\n');
  Q.obj.pendingReport(); Q.appendOrderEvent({ ts: 3, poolId: 'p1', to: 'c' }); Q.obj.pendingReport();
  Q.obj.clearReport(null);                                 // an older hub's bare ack: the last read's slot, as before
  ok(Q.obj.pendingReport().events.length === 0, 'CONTROL (today\'s one slot — a bare ack after two reads): the latest read\'s bytes go, and the record only the lost reply carried is lost — RED');
  const S = agentPool(ev(1) + '\n');
  const sA = S.obj.pendingReport();
  S.obj.clearReport({ ...sA.ack, sum: 'f'.repeat(32) });   // a token whose head is not what the file starts with
  ok(S.obj.pendingReport().events.length === 1, 'an ack naming a head the report no longer starts with removes nothing');
  const D = agentPool(ev(1) + '\n');
  D.writeDropped({ total: 3, acked: 0 });
  const dA = D.obj.pendingReport(); { const x = D.readDropped(); D.writeDropped({ total: x.total + 2, acked: x.acked }); }
  const dB = D.obj.pendingReport();
  D.obj.clearReport(dB.ack); D.obj.clearReport(dA.ack);   // two acks, the later first: the watermark only rises
  ok(dA.dropped === 3 && dB.dropped === 5 && D.obj.pendingReport().dropped === 0, `the dropped count as a total and an acked watermark: two acks in any order count exactly (${dA.dropped}, ${dB.dropped} ⇒ 0)`);
  // 2. THE HEAD ON THE FILE's BYTES: a torn line cut inside a many-byte character
  const buf = Buffer.concat([Buffer.from(ev(1) + '\n'), Buffer.from('{"ts":2,"to":"'), Buffer.from([0xE2]), Buffer.from('\n' + ev(3) + '\n' + ev(4) + '\n')]);
  const real = buf.indexOf(Buffer.from(ev(4))), h2 = SO.reportHead(buf, 2);
  const SOSRC = read('src/sealed-orders.js');
  const TextSO = M.load('src/sealed-orders.js', anchored(SOSRC, "  const b = Buffer.isBuffer(text) ? text : Buffer.from(String(text || ''), 'utf-8'), events = [];\n", "  const b = Buffer.from(Buffer.isBuffer(text) ? text.toString('utf-8') : String(text || ''), 'utf-8'), events = [];\n", 'head-on-text'), 'head-on-text');
  const h2t = TextSO.reportHead(buf, 2);
  ok(h2.events.length === 2 && h2.torn === 1 && h2.bytes === real && h2t.bytes === real + 2, `the head is measured on the file's bytes (${h2.bytes} = where the next record starts); measured on the decoded text it ran ${h2t.bytes - real} bytes into the next record — RED`);
  // 3. THE TRUNCATED MARK SURVIVES EVERY RUNG (the access layer: local, device, ssh)
  const SES = { ts: '0', type: 'acp', kind: 'session', sessionId: 'ses_a1' };
  const bigRecs = [SES, ...Array.from({ length: 35 }, (_, i) => ({ ts: String(i + 1), type: 'acp', kind: 'update', update: { text: 'x'.repeat(1024 * 1024) } }))];
  const facts13 = { readConversation: async () => ({ session: { id: 'ses_a1' }, records: bigRecs }) };
  const msgs = Array.from({ length: 35 }, (_, i) => ({ info: { id: 'msg_' + i, sessionID: 'ses_a1', role: 'assistant', time: { created: 1700000000000 + i } }, parts: [{ type: 'text', text: 'y'.repeat(1024 * 1024) }] }));
  const accessMod = require('../src/server/opencode-access.js');
  const rung = (kind) => accessMod.create({ facts: facts13, hosts: { opencodeOp: async (_h, op, p) => (kind === 'device' ? OR.runOpencodeOp(facts13, op, p) : { session: { id: 'ses_a1' }, messages: msgs, records: null }) } });
  const viaLocal = await rung('device').readConversation(null, 'ses_a1'), viaDevice = await rung('device').readConversation('h1', 'ses_a1'), viaSsh = await rung('ssh').readConversation('h1', 'ses_a1');
  ok([viaLocal, viaDevice, viaSsh].every((r) => r.truncated === true && r.total > r.kept && r.kept > 0), `the truncated mark survives every rung of the access layer (local ${viaLocal.kept}/${viaLocal.total}, device ${viaDevice.kept}/${viaDevice.total}, ssh ${viaSsh.kept}/${viaSsh.total})`);
  // 4. THE TWIN BOUNDED AT ITS READ, after its size check (a file replaced between the two is never shipped whole)
  const SH = require('../src/hosts.js').PASSIVE_PEEK_SH;
  ok(/if \[ "\$s" -gt 65536 \]; then left=\$\(\(left\+1\)\); continue; fi; printf '\\n@@vs-passive@@ %s\\n' "\$b"; head -c 65536 "\$b"; done;/.test(SH) && !/cat "\$b"/.test(SH),
    'the twin reads each file within 64 KiB at the read itself, after the size check (the parity leg ⑫ still holds the two roads equal)');
}

console.log('⑭ r1225 (part 5\'s follow, its smalls): the dropped total only rises; a malformed token removes nothing; the executed push carries its token');
{
  const SO = require('../src/sealed-orders.js');
  const fnSrc = (name, src = AGSRC) => { const a = src.indexOf('function ' + name + '('), b = src.indexOf('\n}\n', a); return a >= 0 && b > a ? src.slice(a, b + 2) : ''; };
  const method = (name, src = AGSRC) => { let a = src.indexOf('  ' + name + '() {'); if (a < 0) a = src.indexOf('  ' + name + '(token) {'); const b = src.indexOf('\n  },\n', a); return a >= 0 && b > a ? src.slice(a, b + 5) + '\n' : ''; };
  const poolOf = (src, seed) => {
    const d = fs.mkdtempSync(path.join(tmp, 'pool14-')), f = path.join(d, 'pool-orders-log.ndjson'), dr = path.join(d, 'pool-orders-dropped');
    if (seed != null) fs.writeFileSync(f, seed);
    const FNS = ['readAtMost', 'readHeadOf', 'readDropped', 'writeDropped', 'headSum', 'dropReportHead', 'appendOrderEvent'].map((n) => fnSrc(n, src)).join('');
    return new Function('fs', 'ORDERS_LOG', 'ORDERS_DROPPED', 'SO', 'log', 'require', FNS + 'return ({ readDropped, writeDropped, obj: {' + method('pendingReport', src) + method('clearReport', src) + '} });')(fs, f, dr, SO, () => { }, require);
  };
  const ev = (i) => JSON.stringify({ ts: i, poolId: 'p1', to: 'b' });
  // (1) ack, a new drop, then the same ack again (late or replayed): the new drop is still said
  const lateAck = (src) => { const P = poolOf(src, ev(1) + '\n'); P.writeDropped({ total: 2, acked: 0 }); const r = P.obj.pendingReport(); P.obj.clearReport(r.ack); { const x = P.readDropped(); P.writeDropped({ total: x.total + 1, acked: x.acked }); } P.obj.clearReport(r.ack); return P.obj.pendingReport().dropped; };
  const kept = lateAck(AGSRC);
  const DelSrc = anchored(AGSRC, '  if (!(d.total > 0)) { fs.rmSync(ORDERS_DROPPED, { force: true }); return; }\n', '  if (!(d.total > d.acked)) { fs.rmSync(ORDERS_DROPPED, { force: true }); return; }\n', 'delete-at-equal');   // the follow's own rule, quoted (stale-pins: kept)
  const lost = lateAck(DelSrc);
  ok(kept === 1 && lost === 0, `ack, a new drop, the late ack again: the new drop is still said (${kept}); RED: the file deleted when total met acked (a copy) — the late ack swallows it (${lost})`);
  // (2) a token present but malformed removes nothing (only a missing one takes the last read's slot)
  const Q = poolOf(AGSRC, ev(1) + '\n' + ev(2) + '\n');
  Q.obj.pendingReport(); Q.obj.clearReport({ bytes: 'x', sum: 1 });
  const q = Q.obj.pendingReport();
  const SlotSrc = anchored(AGSRC, "    if (token != null && !named) { log('sealed-orders: an ack named a report this agent cannot read: nothing removed'); return; }\n", '', 'malformed-takes-slot');
  const R = poolOf(SlotSrc, ev(1) + '\n' + ev(2) + '\n');
  R.obj.pendingReport(); R.obj.clearReport({ bytes: 'x', sum: 1 });
  ok(q.events.length === 2 && R.obj.pendingReport().events.length === 0, `a malformed token removes nothing (${q.events.length} records stay); RED: falling back to the last read's slot (a copy) removes them`);
  // (3) the executed push, if an agent ever sends one, hands its own report's token to the ack
  ok(read('src/agentd/client.js').includes("if (m.op === 'pool-orders-executed') { this._onPoolOrdersExecuted?.(m.events || [], m.reportAck || null); return; }"), 'the executed push (no agent sends it today) hands its own report\'s token to the ack, like the reply');
}

console.log('⑮ r4358 (row B-5278\'s last question): a machine\'s desktop-serve LIST and STATUS reply bounded where it is made — the catalog, the ended records and a live record\'s command line cut within SERVE_REPLY_MAX, a live record never left out, the cut said once');
{
  const DS = require('../src/desktop-serve.js'), AC15 = require('../src/agentd/answer-caps.js');
  const MAX = DS.SERVE_REPLY_MAX, size = (o) => Buffer.byteLength(JSON.stringify(o));
  const fixed = [{ id: 'xterm', label: 'XTerm', exec: 'xterm', args: [], available: true }, { id: 'firefox', label: 'Firefox', exec: 'firefox', args: [], available: true }];
  const door = (n, kib) => Array.from({ length: n }, (_, i) => ({ id: `app.entry-${i}`, label: `App ${i}`, exec: '/usr/bin/a', args: ['x'.repeat(kib * 1024)], available: true }));
  const seen = (n) => Array.from({ length: n }, (_, i) => ({ id: `seen.s-${i}`, label: `Seen ${i}`, exec: 'seen', args: [], available: true, witnessed: true }));
  const app = (i, state, kib) => ({ id: `da-${String(i).padStart(4, '0')}`, state, label: `app ${i}`, exec: '/usr/bin/a', args: ['y'.repeat(kib * 1024)], env: { A: '1' }, startedAt: 1000 + i, endedAt: state === 'ended' ? 2000 + i : undefined, pids: {}, starts: {} });
  const live = (kib) => Array.from({ length: 6 }, (_, i) => app(100 + i, 'ready', kib));   // a LIVE state of the model (launching / ready)
  const ended = (kib) => Array.from({ length: 50 }, (_, i) => app(i, 'ended', kib));
  // (1) THE PURE BOUND — a reply that fits answers as before (no new key)
  const small = { ok: true, apps: live(1), registry: fixed };
  ok(DS.boundServeReply(small) === small && !('cut' in small), 'a reply within its size answers as before (the same object, no cut key)');
  // the catalog: 1200 door rows of 8 KiB + 300 witness rows over the size — the witness rows and then the door rows go from the end
  const L1 = { ok: true, apps: [...live(200), ...ended(20)], registry: [...fixed, ...door(1200, 8), ...seen(300)], witness: null, hostName: 'big' };
  const b1 = DS.boundServeReply(L1);
  ok(size(L1) > MAX && size(b1) <= MAX && b1.cut.registry > 300 && b1.cut.apps === 0 && b1.cut.argsCut === 0 && b1.registry.slice(0, 2).every((r, i) => r === fixed[i]) && !b1.registry.some((r) => r.id.startsWith('seen.'))
    && b1.registry.length === L1.registry.length - b1.cut.registry && b1.apps.length === L1.apps.length,
    `THE CATALOG over its size (${(size(L1) / 1048576).toFixed(1)} MiB): cut from its end within ${(MAX / 1048576)} MiB — ${b1.cut.registry} catalog row(s) left out (the witness rows first), the fixed rows and every record kept (${(size(b1) / 1048576).toFixed(2)} MiB)`);
  // the ended records: 50 of 180 KiB (9 MiB: over the op's cap too) — the OLDEST go first, their samples with them; every live record stays
  const L2 = { ok: true, apps: [...live(50), ...ended(180)].sort((a, b) => b.startedAt - a.startedAt), samples: Object.fromEntries([...live(1), ...ended(1)].map((a) => [a.id, { at: 1, cpu: 0 }])) };
  const b2 = DS.boundServeReply(L2);
  const keptEnded = b2.apps.filter((a) => a.state === 'ended').map((a) => a.endedAt), cutEnded = ended(1).map((a) => a.endedAt).filter((x) => !keptEnded.includes(x));
  ok(size(L2) > MAX && size(b2) <= MAX && b2.cut.apps > 0 && b2.cut.argsCut === 0 && live(1).every((a) => b2.apps.some((x) => x.id === a.id && x.args[0].length === 50 * 1024))
    && Math.max(...cutEnded) < Math.min(...keptEnded) && Object.keys(b2.samples).length === Object.keys(L2.samples).length - b2.cut.apps,
    `THE ENDED RECORDS over the size: ${b2.cut.apps} left out, the OLDEST first (the newest ${keptEnded.length} kept), their samples with them; every LIVE record whole`);
  // a live record's command line, last: 6 live records of 1.2 MiB — the largest slimmed first; NONE left out (the hub reads a missing one as ended)
  const L3 = { ok: true, apps: live(1200), samples: {} };
  const b3 = DS.boundServeReply(L3);
  ok(size(L3) > MAX && size(b3) <= MAX && b3.cut.argsCut > 0 && b3.apps.length === 6 && b3.apps.every((a) => a.state === 'ready') && b3.apps.filter((a) => a.argsCut === true).length === b3.cut.argsCut && b3.apps.filter((a) => a.argsCut).every((a) => a.args.length === 0 && a.env === null),
    `THE LIVE RECORDS over the size: every one kept (${b3.apps.length}), the command line of ${b3.cut.argsCut} cut (args, env; argsCut on the record) — never a live record left out`);
  // (2) THE DEVICE's OP, the real table: a stand-in machine whose list and status are over the size
  const machine = { launch: async () => null, list: async () => ({ apps: L1.apps, registry: L1.registry, witness: null, hostName: 'big', availability: { backend: 'xpra' } }), listApps: () => L2.apps, latestSample: (id) => L2.samples[id] || null, get: () => null };
  const lr = await DS.runDesktopServeOp(machine, 'list', {}), sr = await DS.runDesktopServeOp(machine, 'status', {});
  ok(lr.ok && size(lr) <= MAX && lr.cut && lr.cut.registry > 0 && sr.ok && size(sr) <= MAX && sr.cut && sr.cut.apps > 0 && live(1).every((a) => sr.apps.some((x) => x.id === a.id)),
    `the device's op (runDesktopServeOp, the table the hub's own machine runs too): list ${(size(lr) / 1048576).toFixed(2)} MiB and status ${(size(sr) / 1048576).toFixed(2)} MiB, each within ${MAX / 1048576} MiB with its cut; the op's answer cap ${AC15.BOUNDED_CAPS['desktop-serve'] / 1048576} MiB`);
  // RED AT THE RELEASE (a copy with the release's list and status): the same machine's replies pass the op's cap and are refused
  const DSRC = read('src/desktop-serve.js');
  const relList = "    if (op === 'list') return { ok: true, ...(await ds.list({ ...(settings ? { settings } : {}), ...(p.witness === 'recheck' ? { witness: 'recheck' } : {}) })) };\n";   // stale-pins: kept — the red restores the release's list / status
  const Rel = M.load('src/desktop-serve.js', anchored(anchored(DSRC,
    "    if (op === 'list') return boundServeReply({ ok: true, ...(await ds.list({ ...(settings ? { settings } : {}), ...(p.witness === 'recheck' ? { witness: 'recheck' } : {}) })) });   // B-5278: within SERVE_REPLY_MAX, the cut said\n", relList, 'release-list'),
    '      return boundServeReply({ ok: true, apps, samples });   // B-5278: within SERVE_REPLY_MAX, the cut said\n', '      return { ok: true, apps, samples };\n', 'release-status'), 'release-serve');   // stale-pins: kept — the red restores the release's list / status
  const rl = await Rel.runDesktopServeOp(machine, 'list', {}), rs = await Rel.runDesktopServeOp(machine, 'status', {});
  const cap = AC15.capOf('desktop-serve', [AC15.PRODUCER_BOUNDS]);
  ok(size(rl) > cap && size(rs) > cap && !rl.cut && !rs.cut, `CONTROL (the release's list and status, in a copy): ${(size(rl) / 1048576).toFixed(1)} MiB and ${(size(rs) / 1048576).toFixed(1)} MiB — over the op's ${cap / 1048576} MiB cap, refused at the hub (the feature lost on that machine) — RED`);
  // (3) THE HUB SAYS IT ONCE (client.js desktopServe → _saidLeftOnce), the family's form; a reply with nothing cut says nothing
  const { DeviceManager } = require('../src/agentd/client.js');
  const said = [], dm = Object.create(DeviceManager.prototype);
  let answer = { result: lr };
  Object.assign(dm, { connect: async () => ({ info: { capabilities: ['desktop-serve'] } }), _request: async () => answer, _log: (l) => said.push(String(l)), _machine: 'big box' });
  await dm.desktopServe('list'); await dm.desktopServe('list');
  const once = said.length;
  answer = { result: { ok: true, apps: [] } };
  await dm.desktopServe('status');
  ok(once === 1 && said.length === 1 && /^\[bounds\] big box: its desktop-app list reply was cut to 6 MiB: \d+ catalog row\(s\) left out$/.test(said[0]),
    'the hub says the cut ONCE per machine, in the family\'s words (client.js _saidLeftOnce); a reply with nothing cut says nothing', said);
  // (4) THE OP's ROW rests on the named size: the lowered cap holds the size and its envelope
  ok(AC15.BOUNDED_CAPS['desktop-serve'] === 8 * AC15.MiB && AC15.BOUNDED_CAPS['desktop-serve'] >= MAX + 64 * 1024 && MAX === 6 * AC15.MiB && /SERVE_REPLY_MAX \(6 MiB, desktop-serve\.js boundServeReply; r4358\)/.test(read('src/agentd/answer-caps.js')),
    'the op\'s lowered row (8 MiB) rests on its producer\'s named size (SERVE_REPLY_MAX 6 MiB) and the line\'s envelope — computed here, no longer a count in a comment');
}

console.log('⑯ r4443 (line 1003\'s follow): what a CUT makes the hub show and do — the launcher told its list is short; a cut command line said as cut; the said-once line once an action; a remote relaunch sends only its id');
{
  const K16 = require('../src/server/desktop-app-keeper.js'), D16 = require('../src/desktop-display.js');
  const quiet16 = { log() { }, warn() { }, error() { } };
  const root16 = path.join(tmp, 'keeper16'); fs.mkdirSync(path.join(root16, 'hub'), { recursive: true });
  const calls = [];
  const SLIM = { id: 'da-c16a', state: 'ready', label: 'big app', exec: '/usr/bin/bigapp', args: [], env: null, argsCut: true, startedAt: 5, pids: {}, starts: {} };
  let listAnswer = { ok: true, apps: [], registry: [{ id: 'xterm', label: 'XTerm', exec: 'xterm', args: [], available: true }], availability: { backend: 'xpra' }, cut: { registry: 7, apps: 0, argsCut: 0 } };
  const dev = { call: async (hostId, op, params) => {
    calls.push({ hostId, op, params });
    if (op === 'list') return listAnswer;
    if (op === 'status') return { ok: true, apps: [SLIM], samples: {} };
    if (op === 'relaunch') return { app: { id: 'da-c16b', state: 'ready', label: 'big app', exec: '/usr/bin/bigapp', args: [], startedAt: 6, pids: {}, starts: {} }, replaced: { ...SLIM, state: 'exited', stoppedBy: 'relaunch' } };
    return { ok: true };
  } };
  const k = K16.create({ dataDir: path.join(root16, 'hub'), env: () => ({ PATH: '/usr/bin:/bin', HOME: root16 }), broadcast: () => { }, serverSetting: () => undefined, log: quiet16, serverNotice: () => 1,
    display: { ...D16, hostFacts: async () => ({ hostId: 'local', bins: {}, xpra: null }), binOnPath: () => null }, access: () => dev, hostLabel: () => 'Lab box', remoteHosts: () => ['dev-a'] });
  try {
    // (1) THE PERSON IS TOLD: the keeper passes a paired machine's catalog cut on; a reply that was not cut carries no such key
    const l1 = await k.list({ host: 'dev-a' });
    listAnswer = { ...listAnswer, cut: undefined };
    const l2 = await k.list({ host: 'dev-a' });
    const LAUNCHER = read('src/lib/desktop-app-launcher.js');
    ok(l1.catalogCut === 7 && !('catalogCut' in l2) && LAUNCHER.includes("if (!seenOnly && data && Number(data.catalogCut) > 0) {") && LAUNCHER.includes("t('{n} applications of this machine are not listed here — its list is longer than one answer from it carries.', { n: Number(data.catalogCut) })"),
      'the launcher is TOLD its list is short: the keeper passes the machine\'s catalog cut on (catalogCut 7) and the catalog says it in one line (zh / ja); an uncut list carries no such key', { l1: l1.catalogCut, l2: l2.catalogCut });
    // (2) a live record whose command line was cut: kept LIVE by the hub, drawn as «command line not shown», never as its bare program
    await k.syncHost('dev-a');
    const held = k.get('da-c16a');
    const L16 = await import('../src/lib/desktop-app-launcher.js');
    ok(held && held.state === 'ready' && held.argsCut === true && L16.recipeLine(held) === '/usr/bin/bigapp — command line not shown' && L16.recipeLine({ exec: 'xterm', args: ['-e', 'top'] }) === 'xterm -e top',
      'a live record whose command line the machine cut stays LIVE on the hub and is drawn «/usr/bin/bigapp — command line not shown», never its bare program as the whole command; a whole record draws as before', held && { state: held.state, argsCut: held.argsCut });
    // (4) THE RELAUNCH OF A REMOTE RECORD SENDS ONLY ITS ID (and the caller's body): nothing of the hub's (cut) copy rides to the machine
    calls.length = 0;
    await k.relaunch('da-c16a', { scaleChoice: 2 });
    const rc = calls.find((c) => c.op === 'relaunch');
    const sentOnly = (c) => !!c && JSON.stringify(Object.keys(c.params).sort()) === JSON.stringify(['body', 'id', 'settings']) && c.params.id === 'da-c16a' && JSON.stringify(c.params.body) === JSON.stringify({ scaleChoice: 2 }) && !JSON.stringify(c.params).includes('/usr/bin/bigapp') && !JSON.stringify(c.params).includes('argsCut');
    ok(sentOnly(rc), 'the hub\'s relaunch of a remote record sends ONLY its id, the caller\'s body and the settings — the machine relaunches from its own whole record, never from the hub\'s cut copy', rc && rc.params);
    const KSRC = read('src/server/desktop-app-keeper.js');
    const Carry = M.load('src/server/desktop-app-keeper.js', anchored(KSRC, "      const r = await acc().call(ro.hostId, 'relaunch', { id, body: body || {}, settings: settingsForOp() });\n", "      const r = await acc().call(ro.hostId, 'relaunch', { id, body: { ...remoteGet(id), ...(body || {}) }, settings: settingsForOp() });\n", 'relaunch-carries-copy'), 'relaunch-carries-copy');
    const kr = Carry.create({ dataDir: path.join(root16, 'hub-red'), env: () => ({ PATH: '/usr/bin:/bin', HOME: root16 }), broadcast: () => { }, serverSetting: () => undefined, log: quiet16, serverNotice: () => 1,
      display: { ...D16, hostFacts: async () => ({ hostId: 'local', bins: {}, xpra: null }), binOnPath: () => null }, access: () => dev, hostLabel: () => 'Lab box', remoteHosts: () => ['dev-a'] });
    try { await kr.syncHost('dev-a'); calls.length = 0; await kr.relaunch('da-c16a', { scaleChoice: 2 }); } finally { try { kr.shutdown(); } catch { } }
    ok(!sentOnly(calls.find((c) => c.op === 'relaunch')), 'RED CONTROL: a copy whose relaunch carries the hub\'s stored copy sends the cut record\'s command (the program, `argsCut`) to the machine — the relaunch leg above would go red');
  } finally { try { k.shutdown(); } catch { } }
  // (3) ONCE A KIND: a list's cut and a status's cut are two things — each said once per machine
  const { DeviceManager: DM16 } = require('../src/agentd/client.js');
  const said16 = [], dm16 = Object.create(DM16.prototype);
  let ans16 = { result: { ok: true, registry: [], cut: { registry: 4, apps: 0, argsCut: 0 } } };
  Object.assign(dm16, { connect: async () => ({ info: { capabilities: ['desktop-serve'] } }), _request: async () => ans16, _log: (l) => said16.push(String(l)), _machine: 'big box' });
  await dm16.desktopServe('list'); await dm16.desktopServe('list');
  ans16 = { result: { ok: true, apps: [], cut: { registry: 0, apps: 3, argsCut: 1 } } };
  await dm16.desktopServe('status'); await dm16.desktopServe('status');
  ok(said16.length === 2 && /desktop-app list reply was cut to 6 MiB: 4 catalog row\(s\) left out$/.test(said16[0]) && /desktop-app status reply was cut to 6 MiB: 3 ended app record\(s\), the command line of 1 live app\(s\) left out$/.test(said16[1]),
    'the said-once line is once an ACTION: a list\'s cut and a status\'s cut are each said once per machine (a status cut after a list cut is no longer silent)', said16);
  // (5) the kb says what the order costs
  ok(read('docs/kb-file-structure.md').includes('with six very large live records EVERY ended record leaves the reply, the newest too'), 'the kb says it: with six very large live records every ended record leaves the reply, the newest too, and comes back with the next reply that fits');
}

for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
fs.rmSync(tmp, { recursive: true, force: true });
report();
