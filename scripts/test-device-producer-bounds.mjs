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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
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
  const Back = M.load('src/discovery-facts.js', anchored(DSRC, '  if (v.snap) { kept.snap = v.snap; kept.at = now(); return { snap: v.snap }; }', '  if (!v.snap && arguments[0].walkInline) return { snap: arguments[0].walkInline() };\n  if (v.snap) { kept.snap = v.snap; kept.at = now(); return { snap: v.snap }; }', 'inline-back'), 'inline-back');
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

for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
fs.rmSync(tmp, { recursive: true, force: true });
report();
