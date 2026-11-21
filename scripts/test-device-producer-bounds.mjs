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
  ok(AGSRC.includes("pendingReport() { try { const r = SO.reportOf(fs.readFileSync(ORDERS_LOG, 'utf-8'));"), 'the agent reads its pool report through that parse, and says a torn line once');
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
  // SMALL (3): the agent's pool append never glues its record to a torn last line (the statement itself, run on a temp file)
  const SO = require('../src/sealed-orders.js');
  const stmt = (AGSRC.split('\n').find((l) => l.includes("try { let lead = ''; try { const st = fs.statSync(ORDERS_LOG);")) || '').trim();
  const appendWith = (code) => { const f = path.join(fs.mkdtempSync(path.join(tmp, 'pool-')), 'pool-orders-log.ndjson'); fs.writeFileSync(f, JSON.stringify({ ts: 1, poolId: 'p1', to: 'a' }) + '\n{"ts":2,"poolId":"p1","to":'); new Function('fs', 'ORDERS_LOG', 'ev', 'log', code)(fs, f, { ts: 3, poolId: 'p1', to: 'b' }, () => { }); return SO.reportOf(fs.readFileSync(f, 'utf8')); };
  const now3 = appendWith(stmt), rel3 = appendWith("try { fs.appendFileSync(ORDERS_LOG, JSON.stringify(ev) + '\\n'); } catch { }");   // the release's line, quoted (stale-pins: kept)
  ok(stmt && now3.events.map((e) => e.to).join() === 'a,b' && now3.torn === 1 && rel3.events.map((e) => e.to).join() === 'a',
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
      if (hub._discPersistTimer) { clearTimeout(hub._discPersistTimer); hub._discPersistTimer = null; }
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

for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
fs.rmSync(tmp, { recursive: true, force: true });
report();
