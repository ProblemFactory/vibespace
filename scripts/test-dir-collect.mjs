#!/usr/bin/env node
// THE PAIRED MACHINE'S FOLDER LISTING (主开发 r1508 / r1515 / r1636 / r1651 — «THE MACHINE COLLECTS, THE HUB SHAPES»). The folder field's
// facts are collected where they live by ONE collector (src/dir-collect.js) over the folder field's disk ops (src/dir-ops.js): on the
// hub over its SafeFs pool, on a paired machine by that machine's own agent (the `dir-collect` op, capability-gated); the hub alone
// plans and shapes (src/server/dir-slice.js plan / shape — the ranking and the verdict's words never ride the device's bundle).
//   ① a REAL agent says the capability and its home in its hello; an agent without the capability is NEVER asked (the client's gate:
//     nothing sent) — CONTROL: the same stand-in with it is asked
//   ② PARITY over ONE fixture (a home of checkouts, links to a folder and a file, a dangling link, a folder past its 400 kids, a path
//     three deep, the instance's own checkout): each plan collected by the hub's collector (the SafeFs pool) and by the real agent —
//     the COLLECTED FACTS equal, and the SHAPED reply of the paired road equals the hub's own answer (GET /api/dir-complete's slice)
//   ③ the device's fs pool: an IDLE-ONLY call is refused at once by code while every worker is busy (never queued behind a person's
//     op) — CONTROL: the same call without it waits its turn
//   ③b ONE DEAD THING, ONE CALL on the device's pool (B-23e5's law, hungMemory): a path its deadline ended is refused by name before any
//     worker, 30 s then twice as long each time, a listing exactly, a stat at or under (never the home), forgotten when it answers; the
//     device's busy and hung words are the hub pool's own (pinned)
//   ④ the three ops ride the agent's worker in their OWN table: never the hub-callable fs-op door
//   ⑥ THE LATE-FACTS WAIT (r1633) on both roads (a kid's fact made slow by a held read, the dead-path stand-in): S1 (the re-ask before the fact — RED unmarked),
//     the bound (1 s: what landed + factsLate; the fact kept for the next ask), superseded (a newer ask ends it at once)
//   ⑦ THE INDEX ON THE WIRE (r1651): held on the ordinary reply, carried by the late one, «the same» by its content's version; ⑦b the
//     hosts road's whole reply on the paired machine equals this hub's own; an older agent / Windows / no home keep the sh road
//   ⑧ the first reply at today's bounds, measured (14 folders of 400 kids, the index held)
//   ⑨ THE LAW (r2752): A LISTING NEVER COSTS A PERSON THEIR FILES ON THAT MACHINE — on a real agent, distinct dead paths asked for facts
//     over many keystrokes: the folder field has ONE read out there, and two Files acts of the person at once are served at once; RED (in
//     process, today's shape): the collector on the person's pool holds both workers and the person waits; the agent's handle (its own
//     pool of one worker, no replacement while a stuck read is out, one read at a time — never the person's pool) pinned with its red;
//     a pipe named like a manifest is never opened (RED: the release's fact reader opens it and holds the worker)
//   ⑩ (r2974, a machine's listing never worse than the release's): its own suite, scripts/test-dir-collect-fallback.mjs
//   ⑤ the reply's byte cap (r1651: 4 MiB, the hard cap): over it the facts are CUT — the index first (partial), then the one-match
//     listings, then the kids (`more`) — and the shaped reply never reads a cut answer as whole (its rows «still looking»)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { endDaemonsAndWait, DAEMON_ROOT_ENV, DAEMON_ARGV, DAEMON_COMM } from './scratch.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the fixture home is the agent's HOME; the agent's own root lies OUTSIDE it (its state never moves the listed home)
// (the home as the agent will read it — os.homedir() is HOME as handed: the resolved path, so a temp folder behind a link compares alike)
// THE DEAD-PATH STAND-IN (src/dir-ops.js deadStandIn — the ops' own seam for the suites, VIBESPACE_DIROPS_TEST=1): a folder named `vs-dead-…`
// is a read HELD in the worker the collector's handle sent it to — never a real pipe (r2752) — until the suite puts a `.go` inside it; a
// `.held` inside it says the read began, a `.left` that it returned (the hub's SafeFs workers and the real agent both run it; the
// agent gets the name through daemonEnv's allow list)
process.env.VIBESPACE_DIROPS_TEST = '1';
const homeMint = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dcol-'));
const HOME = fs.realpathSync(homeMint);
process.env.HOME = HOME;
const rootMint = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dcol-root-'));
process.env.VIBESPACE_AGENTD_ROOT = rootMint;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dcol-data-'));
const mk = (rel) => fs.mkdirSync(path.join(HOME, rel), { recursive: true });
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(HOME, rel)), { recursive: true }); fs.writeFileSync(path.join(HOME, rel), text); };
for (const d of ['work/payments/.git', 'work/payroll', 'work/share', 'code/ir-dashboard/.git', 'deep/a/b/c', 'vs']) mk(d);
put('code/ir-dashboard/notes.txt', 'notes\n'); put('work/readme.md', 'r\n'); put('vs/package.json', JSON.stringify({ name: 'vibespace' }));
for (let i = 0; i < 401; i++) mk(`big/d${String(i).padStart(3, '0')}`);
fs.symlinkSync(path.join(HOME, 'work/payments'), path.join(HOME, 'ln-proj'));
fs.symlinkSync(path.join(HOME, 'code/ir-dashboard/notes.txt'), path.join(HOME, 'ln-notes'));
fs.symlinkSync(path.join(HOME, 'no-such-target'), path.join(HOME, 'dangling'));
// every time OLD (a listing read within a tick of its folder's mtime is racy — B-1c27 — and would be read again on one side only)
const OLD = (Date.now() - 3600e3) / 1000;
const setOld = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isSymbolicLink()) { try { fs.lutimesSync(p, OLD, OLD); } catch { } } else { if (e.isDirectory()) setOld(p); fs.utimesSync(p, OLD, OLD); } } fs.utimesSync(dir, OLD, OLD); };
setOld(HOME);

const DC = require(REPO + '/src/dir-collect.js'), DS = require(REPO + '/src/server/dir-slice.js'), DO = require(REPO + '/src/dir-ops.js');
const { DeviceManager } = require(REPO + '/src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
// B-b403: the daemon is ended ONCE — by the leg after the ops, else at exit (a red, a throw) — by the IDENTITY of this run's own
// unique root (endDaemonsAndWait: a daemon whose VIBESPACE_AGENTD_ROOT lies under the mkdtemp root above), never a pid by name.
// The ender takes a /tmp scratch root only (scratch.mjs endDaemonsOf); the leg follows that rule (a TMPDIR elsewhere is said)
const enderTakes = path.resolve(String(process.env.VIBESPACE_AGENTD_ROOT || '')).startsWith('/tmp/');
// B-b403 cure 2 (主开发 06:13Z): OFF /tmp the ender refuses the root (endDaemonsOf's rule), so the daemon is ended by ITS OWN pid —
// the one it wrote in <root>/state/agentd.pid, taken only while that process names this very root (VIBESPACE_DEVICE_ROOT /
// VIBESPACE_AGENTD_ROOT, as the ender reads them) and is a daemon (comm or argv); anything else is refused by name, never signalled.
// The identity is the ender's own (scratch.mjs DAEMON_ROOT_ENV / DAEMON_COMM / DAEMON_ARGV, cure 3), never a copy. Said limit: only
// the pid in the pid file is ended — a self-upgrade re-exec child that has not yet written its pid would be missed; this suite runs
// bundle 0.0.0-t against the version it expects, so its daemon never self-upgrades
const endOwnDaemonByPid = (root, { waitMs = 5000 } = {}) => {
  const r = path.resolve(String(root || '')), under = (v) => !!v && (path.resolve(v) === r || path.resolve(v).startsWith(r + '/'));
  const tmpR = path.resolve(os.tmpdir());
  if (tmpR === '/') return { pid: null, why: 'the temp folder is / — no root can be told from a person\'s own here: refused' };
  if (!r.startsWith(tmpR + '/')) return { pid: null, why: `root ${r} is not under this process's temp folder — refused` };   // never a person's own root
  let pid = 0; try { pid = Number(fs.readFileSync(path.join(r, 'state', 'agentd.pid'), 'utf8').trim()); } catch { return { pid: null, why: 'no pid file' }; }
  const gone = () => { try { return /^\d+ \([^)]*\) [ZX]/.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch { return true; } };
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) return { pid, why: 'not a pid' };
  if (gone()) return { pid, gone: true, why: 'already gone' };
  let env = [], comm = '', argv = []; try { env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0'); comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0'); } catch { }
  const mine = DAEMON_ROOT_ENV.some((n) => under((env.find((kv) => kv.startsWith(n + '=')) || '').slice(n.length + 1)));
  if (!mine || !(comm.startsWith(DAEMON_COMM) || argv.some((a) => DAEMON_ARGV.test(a)))) return { pid, why: `pid ${pid} is not this root's daemon — refused, not signalled` };
  try { process.kill(pid, 'SIGKILL'); } catch { }
  const end = Date.now() + waitMs; while (!gone() && Date.now() < end) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  return { pid, gone: gone() };
};
let daemonEnded = false;
process.on('exit', () => { if (!daemonEnded) try { daemonEnded = true; if (enderTakes) endDaemonsAndWait(process.env.VIBESPACE_AGENTD_ROOT); else endOwnDaemonByPid(process.env.VIBESPACE_AGENTD_ROOT); } catch { } });
await dm.connect();   // after the exit hook: a throw here no longer leaks the daemon (cure 2, the reader's note)


// the three temp folders go at exit — AFTER the agent's own end (its exit hook above runs first: an agent never outlives its root)
process.on('exit', () => { for (const d of [homeMint, rootMint, dataDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });

console.log('① the capability and the home in the hello; an agent without it is never asked');
const conn = await dm.connect();
await sleep(300); setOld(HOME);   // (anything the agent's start touched in the home: old again)
ok(!!(conn.info?.capabilities?.includes?.('dir-collect') && conn.info.home === HOME), `the real agent says dir-collect and its home (${conn.info && conn.info.home})`, conn.info && { home: conn.info.home });
{
  const DMC = DeviceManager, asked = [];
  const standIn = (caps) => ({ connect: async () => ({ info: { capabilities: caps } }), _request: async (p) => { asked.push(p.op); return { facts: {} }; } });
  let refused = null; try { await DMC.prototype.dirCollect.call(standIn(['probe', 'sysinfo']), { cands: [] }); } catch (e) { refused = e; }
  const before = asked.length; await DMC.prototype.dirCollect.call(standIn(['probe', 'dir-collect']), { cands: [] });
  ok(!!(refused && refused.code === 'no-capability' && before === 0 && asked.length === 1), `an older agent (no dir-collect in its hello) is asked NOTHING — refused by name (${refused && refused.code}); CONTROL: the same stand-in saying it is asked once`);
}

console.log('② parity over one fixture: the collected facts, and the shaped reply of both roads');
const SF = require(REPO + '/src/safe-fs.js').SafeFs;
const POOL = new SF({ poolSize: 2, name: 'test-dir-collect' });
const call = (op, p, o) => POOL.call(op, p, o);
const mountsHere = () => DO.runOp('mountRows', { home: HOME, platform: process.platform }).result.rows;
const hubC = DC.create({ call, home: HOME, roots: [], mounts: mountsHere, poolBusy: DS.poolBusy, log: () => { } });   // the hub's collector, the device's exclusion rule
const hubDS = DS.create({ call, home: HOME, repoDir: REPO, mounts: mountsHere });   // the hub's own answer, end to end
const settledOf = (f) => f && !f.factsLate && (f.answers || []).every((a) => a.answer !== 'late') && ![...(f.rows || []), ...(f.probes || []), ...(f.index || [])].some((r) => r && r.late);
// a folder of 400 kids keeps kids' facts on their way for many replies (12 asked a reply): its asks settle on the line and the rows alone
const settledRows = (f) => f && (f.answers || []).every((a) => a.answer !== 'late') && ![...(f.rows || []), ...(f.probes || []), ...(f.index || [])].some((r) => r && r.late);
const settle = async (ask, done = settledOf) => { let f = null; for (let i = 0; i < 40; i++) { f = await ask(); if (done(f)) break; await sleep(60); } return ask(); };
const norm = (f) => JSON.parse(JSON.stringify({ ...f, at: 0, took: 0, index: (f.index || []).map((r) => (r && r.ok ? { ok: { ...r.ok, at: 0 } } : r)) }));
const shown = (r) => { const { took, self, ...rest } = r || {}; return JSON.parse(JSON.stringify(rest)); };
const ASKS = [
  ['a typed completion (~/work/pay)', { text: '~/work/pay', bases: [] }],
  ['a bare word over two bases (work)', { text: 'work', bases: ['~/code', '~'] }],
  // (a folder past its 400 kids is no parity row: its kids' facts land 12 a reply, so two collectors stop at different points — its bound
  // is the leg after this loop: cut, and said so)
  ['a search (ir dash)', { text: 'ir dash', q: 'ir dash', bases: ['~'] }],
  ['a file asked as a file (~/code/ir-dashboard/notes.txt)', { text: '~/code/ir-dashboard/notes.txt', bases: [], kind: 'file' }],
  ['the home and four probes', { text: '~/', bases: [], probe: ['~/work/payments', '~/deep/a/b/c', '~/nope', '~/ln-proj'] }],
  ['a path under a folder that is not there (~/nothere/x)', { text: '~/nothere/x', bases: [] }],
];
for (const [what, args] of ASKS) {
  const P = DS.plan({ budgetMs: 1500, ...args }, HOME);
  const big = what.includes('400'), doneF = big ? settledRows : settledOf;
  const hubF = await settle(() => hubC.collect(P.wire), doneF), devF = await settle(() => dm.dirCollect(P.wire, { timeoutMs: 8000 }), doneF);
  const a = JSON.stringify(norm(hubF)), b = JSON.stringify(norm(devF));
  ok(!!(a === b), `② ${what}: the collected facts are the same on both roads (${b.length} bytes${settledOf(devF) ? '' : '; a folder of 400 kids still has kids\' facts on their way — 12 asked a reply — the same on both'})`, a === b ? { late: !settledOf(devF) } : { hub: a.slice(0, 700), device: b.slice(0, 700) });
  const hubReply = await settle(async () => { const r = await hubDS.slice({ budgetMs: 1500, ...args }); return { factsLate: r.factsLate, answers: [], rows: r.rowsLate ? [{ late: true }] : [], r }; }, doneF);
  const paired = DS.shape(P, devF, { took: 0 });
  ok(!!(JSON.stringify(shown(hubReply.r)) === JSON.stringify(shown(paired))), `② ${what}: the paired road's shaped reply equals the hub's own answer (verdict ${paired.verdict ? paired.verdict.kind : 'none'}, ${Object.keys(paired.listing.dirs).length} folders)`, { hub: JSON.stringify(shown(hubReply.r)).slice(0, 600), paired: JSON.stringify(shown(paired)).slice(0, 600) });
}
{
  const P = DS.plan({ text: '~/big/', bases: [], budgetMs: 1500 }, HOME), f = await settle(() => dm.dirCollect(P.wire, { timeoutMs: 8000 }), settledRows);
  const big = (f.listed || []).find((d) => d.path === path.join(HOME, 'big')), L = DS.shape(P, f).listing.dirs['~/big'];
  ok(!!(big && big.kids.length === 400 && big.more === true && L && L.more === true), `② the bound said: a folder past its 400 kids comes back cut and SAYS so (more) — the page never reads it as whole (${big && big.kids.length} kids)`);
}

console.log('③ the device pool: an idle-only call never waits behind another');
{
  const wf = path.join(dataDir, 'slow-worker.cjs');
  fs.writeFileSync(wf, "const { parentPort } = require('worker_threads'); parentPort.on('message', (m) => setTimeout(() => parentPort.postMessage({ id: m.id, result: { ok: true, action: m.action } }), m.ms || 0));\n");
  const WP = require(REPO + '/src/agentd/worker-pool.js').createWorkerPool({ file: wf, size: 1, workerData: {} });
  // (judged by the ORDER of what ended — never a wall-clock literal: the busy job's own end is the measure)
  const order = [];
  const slow = WP.run('slow', { ms: 400 }, 5000).then((r) => { order.push('slow ended'); return r; });
  let e1 = null; try { await WP.run('field', {}, 5000, { idleOnly: true }); } catch (e) { e1 = e; order.push('field refused'); }
  const waited = await WP.run('person', {}, 5000).then((r) => { order.push('person answered'); return r; });
  await slow;
  const after = await WP.run('field', {}, 5000, { idleOnly: true });
  ok(!!(e1 && e1.code === 'no-idle-worker' && order.indexOf('field refused') === 0 && after.result.ok), `an idle-only call while the one worker is busy is refused AT ONCE by code (${e1 && e1.code} — before the busy job ended: ${order.join(' → ')}), and runs once a worker is idle`);
  ok(!!(waited.result.ok && order.indexOf('slow ended') < order.indexOf('person answered')), `CONTROL: the same call without idle-only waits its turn behind the busy worker (${order.join(' → ')})`);
}

console.log('③b one dead thing, one call: the device pool remembers a path its deadline ended (B-23e5\'s law)');
{
  let t = 1e9; const H = DC.hungMemory({ home: '/home/u', now: () => t });
  const stat = ['pathStat', { path: '/m/dead' }], under = ['pathStat', { path: '/m/dead/x' }], listing = ['dirSlice', { path: '/m/dead', dirs: [{ path: '/m/dead' }] }];
  H.deadline(...stat);
  const r1 = H.refusal(...stat), r2 = H.refusal(...under), r3 = H.refusal('pathStat', { path: '/m/other' });
  t += 30001; const r4 = H.refusal(...stat);
  H.deadline(...stat); t += 30001; const r5 = H.refusal(...stat); t += 30000; const r6 = H.refusal(...stat);
  H.landed(...stat); H.deadline(...stat); t += 30001; const r7 = H.refusal(...stat);
  H.deadline(...listing); const r8 = H.refusal(...listing), r9 = H.refusal('dirSlice', { path: '/m/dead/x', dirs: [{ path: '/m/dead/x' }] });
  H.deadline('pathStat', { path: '/home/u' }); const r10 = H.refusal('pathStat', { path: '/home/u/work' });
  ok(!!(r1 && r1.code === 'path-hung' && /not asked again for 30 s/.test(r1.message) && r2 && !r3 && !r4 && r5 && !r6 && !r7 && r8 && !r9 && !r10),
    'a path the deadline ended is REFUSED by name before any worker for 30 s (a stat at or under it), then asked again; ended again: 60 s; once it answers it starts over at 30 s; a listing is remembered exactly; the home never covers what is under it',
    { r1: r1 && r1.message, r2: !!r2, r3: !!r3, r4: !!r4, r5: !!r5, r6: !!r6, r7: !!r7, r8: !!r8, r9: !!r9, r10: !!r10 });
  const SFm = require(REPO + '/src/safe-fs.js'), ag = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8'), wp = fs.readFileSync(path.join(REPO, 'src/agentd/worker-pool.js'), 'utf8'), dh = fs.readFileSync(path.join(REPO, 'src/agentd/dir-handle.js'), 'utf8');
  ok(!!(SFm.NO_IDLE.code === 'no-idle-worker' && SFm.NO_WORKER.code === 'no-worker' && SFm.PATH_HUNG.code === 'path-hung' && wp.includes("{ code: live ? 'no-idle-worker' : 'no-worker' }") && ag.includes("poolBusy: (err) => !!err && (err.code === 'no-idle-worker' || err.code === 'no-worker'),")
    && dh.includes('const refused = hung.refusal(op, p); if (refused) throw refused;') && dh.includes('hung.deadline(op, p);') && dh.includes('hung.landed(op, p);')),
    "the device pool's words are the hub pool's own (no-idle-worker / no-worker: asked again; path-hung: refused by name), and the agent's collector asks the memory before each call");
}

console.log('④ the three ops ride the worker in their own table — never the fs-op door');
{
  const src = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  const fsActions = (src.match(/const FS_ACTIONS = \{([\s\S]*?)\n\};/) || [])[1] || '';
  const keys = [...fsActions.matchAll(/^  '?([a-zA-Z-]+)'?: /gm)].map((m) => m[1]);
  ok(!!(keys.length > 10 && !keys.some((k) => Object.hasOwn(DO.OPS, k)) && src.includes("const fn = m.dirOp ? DIR_OPS[m.action] : FS_ACTIONS[m.action];") && /else if \(FS_ACTIONS\[msg\.action\]\) \{/.test(src)),
    `the fs-op door dispatches on FS_ACTIONS alone (${keys.length} actions), none of the folder ops (${Object.keys(DO.OPS).join(', ')}); the worker reaches DIR_OPS only for a message marked dirOp`);
}

console.log('⑤ the reply\'s byte cap: cut, and said');
{
  const name = (i) => '/m/' + 'x'.repeat(60) + i;
  const facts = { home: '/m', me: { home: '/m', roots: [] }, answers: [], rows: [{ ok: true }], probes: [{ ok: { path: '/m/p', exists: true, isDir: true } }], index: [{ ok: { at: 1, dirs: Array.from({ length: 3000 }, (_, i) => name(i)), links: [], partial: false } }],
    listed: [{ path: '/m', exists: true, isDir: true, kids: Array.from({ length: 400 }, (_, i) => ({ name: 'k' + 'y'.repeat(50) + i })), fileCount: 0, more: false }, { path: '/m/one', exists: true, isDir: true, kids: [{ name: 'a' }], fileCount: 0, more: false }], listedTyped: 1, mounts: [] };
  const size = (f) => Buffer.byteLength(JSON.stringify(f));
  const under = DC.cutToCap(facts, size(facts) + 1), c1 = DC.cutToCap(facts, 60000), c2 = DC.cutToCap(facts, 12000);
  ok(!!(under === facts && size(c1) <= 60000 && c1.cut && c1.index[0].ok.partial && c1.index[0].ok.cut && c1.index[0].ok.dirs.length < 3000 && c1.listed.length === 2 && !c1.listed[0].more),
    `under the cap the facts go as they are; over it the INDEX is cut first (${c1.index[0].ok.dirs.length} of 3000 folders, partial) — the listings untouched (${size(c1)} ≤ 60000 bytes)`);
  ok(!!(size(c2) <= 12000 && c2.index[0].ok.dirs.length === 0 && c2.listed.length === 1 && c2.listed[0].more === true && c2.listed[0].kids.length < 400),
    `deeper: the index emptied, the one-match listing dropped, then the kids halved and the folder SAYS more (${c2.listed[0].kids.length} of 400 kids, ${size(c2)} ≤ 12000 bytes)`);
  const P = DS.plan({ text: 'x y', q: 'x y', bases: ['~'] }, '/m'), s1 = DS.shape(P, c1), s0 = DS.shape(P, facts);
  ok(!!(s1.rowsLate === true && s1.partial === true && !s0.rowsLate), `the shaped reply of a cut answer is never whole: its rows «still looking» (rowsLate ${s1.rowsLate}, partial ${s1.partial}) — CONTROL the whole one says neither`);
  ok(!!(DC.COLLECT_CAP_BYTES <= 4 * 1024 * 1024 && require(REPO + '/src/agentd/answer-caps.js').capOf('dir-collect') === 4 * 1024 * 1024), `the collector cuts below the op's answer cap (${DC.COLLECT_CAP_BYTES} < 4 MiB, answer-caps 'dir-collect')`);
}


console.log('⑥ THE LATE-FACTS WAIT (r1633), on both roads: a kid whose own fact is slow (a dead-path stand-in the suite releases later)');
const slowKid = (dir) => { mk(dir + '/vs-dead-kid/.git'); setOld(path.join(HOME, dir)); fs.utimesSync(path.join(HOME, dir), OLD, OLD); return path.join(HOME, dir, 'vs-dead-kid'); };
const released = new Set();
// the fact lands when the stand-in's held read (in the worker the collector's handle sent it to) is let go: its `.go` put inside it
const release = async (dead, afterMs = 0) => { if (afterMs) await sleep(afterMs); if (released.has(dead)) return; fs.writeFileSync(path.join(dead, '.go'), ''); released.add(dead); };
const kidOf = (f, dir) => { const d = (f.listed || []).find((x) => x.path === path.join(HOME, dir)); return d && (d.kids || []).find((k) => k.name === 'vs-dead-kid'); };
const roadsOf = { hub: (wire, o) => hubC.collect(wire, o), paired: (wire, o) => dm.dirCollect(wire, { timeoutMs: 8000, ...(o || {}) }) };
await Promise.all(Object.entries(roadsOf).map(async ([road, ask]) => {   // (the two roads at once: their folders, dead reads and pools are their own)
  const s1 = slowKid(`s1${road}`), b1 = slowKid(`b1${road}`), x1 = slowKid(`x1${road}`);
  // S1: a FAST link — the quiet re-ask arrives before the fact
  const P1 = DS.plan({ text: `~/s1${road}/`, bases: [], budgetMs: 1500 }, HOME);
  const first = await ask(P1.wire), unmarked = await ask(P1.wire);
  release(s1, 300);
  const t1 = Date.now(), lateR = await ask({ ...P1.wire, late: true }), took1 = Date.now() - t1;
  ok(!!(first.factsLate && unmarked.factsLate && !(kidOf(unmarked, `s1${road}`) || {}).git), `⑥ ${road} S1 RED (no wait): the re-ask that arrives before the kid's fact — unmarked — answers at once with factsLate (the page would ask no third time: the badge never comes)`);
  ok(!!(!lateR.factsLate && (kidOf(lateR, `s1${road}`) || {}).git === true && released.has(s1) && took1 < DC.LATE_WAIT_MS), `⑥ ${road} S1: the SAME re-ask marked late waits where the fact lives and replies ONCE, whole — the kid's git badge in it (its reply came after the fact was handed, ${took1} ms, inside the bound)`, { took1, factsLate: lateR.factsLate, kid: kidOf(lateR, `s1${road}`) });
  // THE BOUND: a fact past 1 s — the reply says the rest is late; the fact is kept for the next ask
  const P2 = DS.plan({ text: `~/b1${road}/`, bases: [], budgetMs: 1500 }, HOME);
  await ask(P2.wire); release(b1, 1300);
  const t2 = Date.now(), lateB = await ask({ ...P2.wire, late: true }), took2 = Date.now() - t2;
  ok(!!(lateB.factsLate === true && took2 >= DC.LATE_WAIT_MS - 50 && took2 < DC.LATE_WAIT_MS * 2), `⑥ ${road} THE BOUND: a fact past it — the late re-ask replies at the bound (${took2} ms ≈ ${DC.LATE_WAIT_MS}) with what landed and factsLate for the rest`);
  await sleep(500);
  const nextB = await ask(P2.wire);
  ok(!!((kidOf(nextB, `b1${road}`) || {}).git === true), `⑥ ${road} …the fact that landed after the bound is KEPT there: the next ordinary ask has it (other kids' facts may still be on their way while the pool was held)`, { factsLate: nextB.factsLate, kid: kidOf(nextB, `b1${road}`), took2 });
  // SUPERSEDED: a newer ask of the same field ends the wait at once
  const P3 = DS.plan({ text: `~/x1${road}/`, bases: [], budgetMs: 1500 }, HOME);
  await ask(P3.wire);
  const ac = new AbortController(), ends = [], asks = [];
  const raw = dm._request.bind(dm);
  if (road === 'paired') dm._request = (p, o) => { const r = raw(p, o); if (p.op === 'dir-collect-end') ends.push(r); if (p.op === 'dir-collect') asks.push(r); return r; };
  const t3 = Date.now(); setTimeout(() => ac.abort(), 100);
  let out3 = null; try { out3 = await ask({ ...P3.wire, late: true }, { signal: ac.signal }); } catch (e) { out3 = { code: e.code }; }
  const took3 = Date.now() - t3;
  if (road === 'paired') {
    dm._request = raw;
    const endR = ends.length ? await ends[0] : null, agentR = asks.length ? await asks[asks.length - 1] : null, agentTook = Date.now() - t3;
    ok(!!(out3.code === 'aborted' && took3 < DC.LATE_WAIT_MS && endR && endR.ended === true && agentR && agentR.facts && agentTook < DC.LATE_WAIT_MS && !released.has(x1)), `⑥ paired SUPERSEDED: the field's newer ask ends the wait AT ONCE — the hub's ask rejects (${took3} ms), the agent is told (ended ${endR && endR.ended}) and its wait ends well before the fact (${agentTook} ms)`, { out3, endR, agentTook });
  } else ok(!!(out3 && out3.factsLate === true && took3 < DC.LATE_WAIT_MS && !released.has(x1)), `⑥ hub SUPERSEDED: the field's newer ask (its signal) ends the wait AT ONCE (${took3} ms), the reply says the fact is late`, { took3 });
  release(s1); release(b1); release(x1);
}));
await Promise.all([...[...fs.readdirSync(HOME)].filter((d) => /^(s1|b1|x1)/.test(d)).map((d) => release(path.join(HOME, d, 'vs-dead-kid')))]);

console.log('⑦ THE INDEX ON THE WIRE (r1651): only when the hub\'s copy is stale, never in front of the line and the rows');
{
  const P = DS.plan({ text: 'pay', q: 'pay', bases: ['~'], budgetMs: 1500 }, HOME), root = P.wire.roots[0];
  const lateFull = await settle(() => dm.dirCollect({ ...P.wire, late: true, index: { have: {} } }, { timeoutMs: 8000 }));
  const body = lateFull.index[0] && lateFull.index[0].ok;
  ok(!!(body && Array.isArray(body.dirs) && body.dirs.length > 5 && /^[0-9a-f]{16}$/.test(body.v || '')), `the late re-ask carries the machine's index (${body && body.dirs && body.dirs.length} folders, version ${body && body.v} — its content's)`);
  const first = await dm.dirCollect({ ...P.wire, index: { have: {} } }, { timeoutMs: 8000 }), fi = first.index[0] && first.index[0].ok;
  ok(!!(fi && fi.held === true && !fi.dirs && first.factsLate === true && Buffer.byteLength(JSON.stringify(first.index)) < 200), `(b) the ORDINARY reply never carries it: «held» there (${Buffer.byteLength(JSON.stringify(first.index))} bytes for the index), factsLate — the page asks once more, quietly, and that reply carries it`, first.index);
  const same = await dm.dirCollect({ ...P.wire, index: { have: { [root]: body.v } } }, { timeoutMs: 8000 }), si = same.index[0] && same.index[0].ok;
  ok(!!(si && si.same === true && !si.dirs && Buffer.byteLength(JSON.stringify(same.index)) < 120 && !same.factsLate), `(a) the hub naming the version it holds is answered «the same» in a few bytes (${Buffer.byteLength(JSON.stringify(same.index))}) — never an index a keystroke`);
  const sameLate = await dm.dirCollect({ ...P.wire, late: true, index: { have: { [root]: body.v } } }, { timeoutMs: 8000 });
  ok(!!(sameLate.index[0].ok.same === true), '(a) …the late re-ask too: «the same» when the hub holds it');
  // the hosts road keeps the copy and its version per machine, and shapes with it
  const { HostManager } = require(REPO + '/src/hosts.js');
  const hm = new HostManager({ dataDir: path.join(dataDir, 'hub-hosts') });
  hm._state.hosts.push({ id: 'h-pair', name: 'paired', transport: 'dial' });
  hm._devices = new Map([['h-pair', dm]]);
  const road = hm.collectRoadOf('h-pair');
  const viaA = await hm.dirSlice('h-pair', { text: 'pay', q: 'pay', bases: ['~'] }), viaB = await hm.dirSlice('h-pair', { text: 'pay', q: 'pay', bases: ['~'], late: true }), viaC = await hm.dirSlice('h-pair', { text: 'pay', q: 'pay', bases: ['~'] });
  const rowsOf = (r) => Object.keys((r && r.listing && r.listing.dirs) || {}).filter((k) => k.includes('pay')).sort();
  ok(!!(road && viaA.rowsLate === true && viaA.factsLate === true && rowsOf(viaB).includes('~/work/payments') && !viaB.factsLate && rowsOf(viaC).includes('~/work/payments') && !viaC.rowsLate),
    `the hosts road: a first search with no copy says «still looking» + factsLate; the quiet re-ask brings the index (${rowsOf(viaB).join(', ')}); the next keystroke answers from the kept copy at once`, { a: { rowsLate: viaA.rowsLate, factsLate: viaA.factsLate }, b: rowsOf(viaB), c: { rows: rowsOf(viaC), rowsLate: viaC.rowsLate } });
  // ⑦b (the fresh read's N13): each ask of ② answered by hosts.dirSlice on the paired machine — the plan in its home, the index kept and
  // named, the marks rebased, the shape — equals this hub's own answer once both have every fact
  const doneR = (r) => r && !r.factsLate && !r.rowsLate && !r.partial, doneBig = (r) => r && !r.rowsLate && !r.partial;
  const sameAs = (r) => { const x = shown(r); delete x.suggestions; delete x.os; if (x.listing) x.listing.machine = null; return JSON.stringify(x); };
  for (const [what, args] of ASKS) {
    const dn = what.includes('400') ? doneBig : doneR;
    const viaHub = await settle(() => hubDS.slice({ budgetMs: 1500, ...args }), dn);
    const viaPair = await settle(async () => { const r = await hm.dirSlice('h-pair', args); return r.factsLate ? hm.dirSlice('h-pair', { ...args, late: true }) : r; }, dn);
    ok(!!(sameAs(viaHub) === sameAs(viaPair) && viaPair.listing.machine === 'h-pair'), `⑦b ${what}: the hosts road's reply on the paired machine equals this hub's own answer (but its machine)`, { hub: sameAs(viaHub).slice(0, 500), paired: sameAs(viaPair).slice(0, 500) });
  }
  // an agent without the capability, a Windows machine, a hello with no home: the sh road (asked nothing new)
  const stub = (info) => ({ helloInfo: () => info, isLinked: () => true, dirCollect: () => { throw new Error('asked'); } });
  const roadFor = (info) => { hm._devices = new Map([['h-x', stub(info)]]); return hm.collectRoadOf('h-x'); };
  ok(!!(!roadFor({ capabilities: ['probe'], home: '/home/u', platform: 'linux' }) && !roadFor({ capabilities: ['dir-collect'], home: 'C:\\Users\\u', platform: 'win32' }) && !roadFor({ capabilities: ['dir-collect'], platform: 'linux' }) && !!roadFor({ capabilities: ['dir-collect'], home: '/home/u', platform: 'linux' })),
    'an OLDER agent (no dir-collect), a Windows machine and a hello without a home keep the sh road — CONTROL: a posix agent saying it takes the collector road');
  hm._devices = new Map([['h-pair', dm]]);
}

console.log('⑧ the first reply at today\'s bounds (r1651 (b)): the line and the rows, measured');
{
  const B = Array.from({ length: 13 }, (_, i) => `wide/b${String(i).padStart(2, '0')}`);
  for (const b of B) for (let k = 0; k < 400; k++) mk(`${b}/${'folder-name-of-forty-characters-' + String(k).padStart(4, '0')}`);
  setOld(path.join(HOME, 'wide'));
  const P = DS.plan({ text: 'x', q: 'x', bases: B.map((b) => '~/' + b), budgetMs: 1500 }, HOME);
  const f = await settle(() => dm.dirCollect({ ...P.wire, index: { have: {} } }, { timeoutMs: 8000 }), (x) => (x.listed || []).length === 13 && !(x.rows || []).some((r) => r && r.late)), bytes = Buffer.byteLength(JSON.stringify(f));
  const kids = (f.listed || []).reduce((n, d) => n + ((d.kids || []).length), 0);
  ok(!!(P.wire.rows.length === 13 && (f.listed || []).length === 13 && kids >= 12 * 400 && bytes < 1024 * 1024 && f.index.every((r) => !(r && r.ok && r.ok.dirs))),
    `MEASURED: the first reply at today's bounds — the home and 12 bases listed, 400 kids each (${kids} kids; the plan's own cap: 12 bases), every index root held — is ${bytes} bytes (${(bytes / 1024).toFixed(0)} KiB), under 1 MiB; the 4 MiB cap is the hard bound behind it`, { rows: P.wire.rows.length, listed: (f.listed || []).length, bytes });
}
console.log('⑨ THE LAW (r2752): a listing never costs a person their files on that machine');
{
  const { execFileSync: mkfifo } = await import('node:child_process');
  // a dead folder = the stand-in's held read: `.held` inside it once a read began there, `.left` once it returned; let go by a `.go`
  const plantDead = (dir, names) => { mk(dir); const dead = names.map((n) => { mk(`${dir}/${n}`); return path.join(HOME, dir, n); }); setOld(path.join(HOME, dir)); return dead; };
  const heldOf = (dead) => dead.filter((d) => fs.existsSync(path.join(d, '.held')) && !fs.existsSync(path.join(d, '.left'))).length;
  const letGo = (dead) => { const n = heldOf(dead); for (const d of dead) fs.writeFileSync(path.join(d, '.go'), ''); return n; };
  const until = async (pred, ms) => { const end = Date.now() + ms; while (!pred() && Date.now() < end) await sleep(20); return pred(); };
  // a reader waiting on a REAL pipe (the product's input under test, never the slow fact): opening its write end lets it go (counted)
  const pipeReaders = (fifos) => { let n = 0; for (const f of fifos) { try { const fd = fs.openSync(f, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK); fs.closeSync(fd); n++; } catch { } } return n; };
  const KEYS = 6;   // keystrokes: more than today's shape needs to hold both of the person's workers (the RED below)
  // ON A REAL AGENT: six distinct dead folders asked for facts over KEYS keystrokes
  const dead = plantDead('deadshare', ['vs-dead-a', 'vs-dead-b', 'vs-dead-c', 'vs-dead-d', 'vs-dead-e', 'vs-dead-f']);
  const P = DS.plan({ text: '~/deadshare/', bases: [], budgetMs: 300 }, HOME);
  for (let k = 0; k < KEYS; k++) { await dm.dirCollect(P.wire, { timeoutMs: 8000 }).catch(() => null); await sleep(50); }
  const outThere = await until(() => heldOf(dead) >= 1, 4000);
  const order = [];
  const acts = Promise.all([dm.fsList(HOME), dm.fsList(HOME)]).then((r) => { order.push('the person\'s two lists answered'); return r; }, (e) => { order.push('a person\'s list failed'); return [{ error: e.message }]; });
  const quick = await Promise.race([acts.then(() => true), sleep(2000).then(() => false)]);
  const out = heldOf(dead), stuck = letGo(dead);
  order.push(`${stuck} dead read(s) let go`);
  const lists = await acts;
  const drained = await until(() => heldOf(dead) === 0, 4000);   // (the reads that waited their turn go once it is let go: none is left held)
  const listed = lists.every((l) => l && !l.error && Array.isArray(l.entries) && l.entries.some((e) => e.name === 'deadshare'));
  ok(!!(outThere && quick && listed && out === 1 && stuck === 1 && drained),
    `on a REAL agent, six distinct dead folders asked for facts over ${KEYS} keystrokes: the folder field had exactly ONE read out there (${out} held), and the person's two Files lists at once on that machine — both of the person's workers — were answered at once, before any was let go (${order.join(' → ')}); the reads that waited their turn went after it (none left held: ${drained})`,
    { order, out, stuck, drained, lists: lists.map((l) => l && (l.error || (l.entries || []).length)) });
  // the agent's handle, pinned (a fast suite cannot wait the pool's 15 s deadline, and a held read in a worker ends at its terminate —
  // so «the person's replacements unspent» is by this wiring: no read of the folder field ever reaches the person's pool)
  const AG = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8'), DHs = fs.readFileSync(path.join(REPO, 'src/agentd/dir-handle.js'), 'utf8');
  const handleOk = (ag, dh) => { const body = (dh.match(/function call\(op, payload\) \{([\s\S]*?)\n {2}\}\n/) || [])[1] || '';
    return body.includes('const pool = poolOf();') && body.includes('{ idleOnly: true }') && !/workerPool|runFs\(/.test(body)
      && /const DIR_POOL_SIZE = 1, DIR_POOL_WEDGE_MAX = 0;/.test(ag) && /size: DIR_POOL_SIZE, maxWedged: DIR_POOL_WEDGE_MAX,/.test(ag)
      && /createDirHandle\(\{ poolOf: dirPoolOf, /.test(ag) && /call: \(op, payload\) => dirHandleOf\(\)\.call\(op, payload\),/.test(ag)
      && /dirMounts\.p = dirHandleOf\(\)\.turn\(\(\) => pool\.run\('mountRows'/.test(ag); };
  const swapped = AG.replace('createDirHandle({ poolOf: dirPoolOf, ', 'createDirHandle({ poolOf: () => workerPool, ');
  ok(!!(handleOk(AG, DHs) && swapped !== AG && !handleOk(swapped, DHs)),
    "the agent's handle for the collector: every read in its turn (the handle's: one out), idle-only, on the collector's OWN pool of one worker with no replacement while a stuck read is out — never the person's pool (its workers and its replacements are never the field's) — RED: the same handle on the person's pool is refused by this pin");
  // RED, today's shape, in process: the collector on the PERSON's pool (two workers; idle-only only takes an idle one) — the same dead
  // folders take both workers over the keystrokes and the person's act waits behind them
  const WP = require(REPO + '/src/agentd/worker-pool.js'), wf = path.join(dataDir, 'dir-worker.cjs');
  fs.writeFileSync(wf, `const { parentPort } = require('worker_threads'); const DO = require(${JSON.stringify(path.join(REPO, 'src/dir-ops.js'))});\nparentPort.on('message', (m) => { try { const r = DO.runOp(m.action, m); parentPort.postMessage({ id: m.id, ...r }); } catch (e) { parentPort.postMessage({ id: m.id, error: e.message, code: e.code }); } });\n`);
  {
    const deadT = plantDead('dead-today', ['vs-dead-1', 'vs-dead-2', 'vs-dead-3']);
    const personPool = WP.createWorkerPool({ file: wf, workerData: {}, size: 2 });
    const busy = (e) => !!e && (e.code === 'no-idle-worker' || e.code === 'no-worker');
    const c = DC.create({ call: (op, p, o) => personPool.run(op, { ...p }, 8000, { idleOnly: !!(o && o.idleOnly) }).then((r) => { if (r.error) throw Object.assign(new Error(r.error), { code: r.code }); return r.result; }), home: HOME, roots: [], poolBusy: busy, log: () => { } });
    const Pd = DS.plan({ text: '~/dead-today/', bases: [], budgetMs: 300 }, HOME);
    let keys = 0;
    for (; keys < KEYS && heldOf(deadT) < 2; keys++) { await c.collect(Pd.wire); await until(() => heldOf(deadT) >= 2, 1000); }
    const seq = [];
    const act = personPool.run('pathStat', { path: HOME }, 8000).then(() => seq.push('person answered'), () => seq.push('person failed'));
    const quickP = await Promise.race([act.then(() => true), sleep(1500).then(() => false)]);
    const held = letGo(deadT);
    seq.push(`${held} dead read(s) let go`);
    await act;
    await until(() => heldOf(deadT) === 0, 4000);
    ok(!!(!quickP && held === 2 && seq[0] === '2 dead read(s) let go' && seq[1] === 'person answered'),
      `RED (today's shape, the collector on the person's pool): after ${keys} keystroke(s) the dead folders held BOTH of the person's workers (${held}) and the person's act waited behind them (${seq.join(' → ')})`, { quickP, held, seq, keys });
  }
  // a pipe named like a manifest is never opened (the fact reader opens a REGULAR file only); RED: the release's reader opens it
  mk('pipeproj/.git'); const pipe = path.join(HOME, 'pipeproj', 'package.json'); mkfifo('mkfifo', [pipe]);
  const one = WP.createWorkerPool({ file: wf, workerData: {}, size: 1 });
  const ans = await one.run('pathStat', { path: path.join(HOME, 'pipeproj'), facts: true }, 1500).then((r) => r.result && r.result.stat, (e) => ({ err: e.message }));
  const opened = pipeReaders([pipe]);
  const rf = path.join(dataDir, 'release-pkg-worker.cjs');
  fs.writeFileSync(rf, "const { parentPort } = require('worker_threads'); const fs = require('fs'), path = require('path');\n// the release's fact reader (a3f329c05 src/safe-fs-worker.js pkgOf), word for word\nconst pkgOf = (d) => { try { const f = path.join(d, 'package.json'); if (fs.statSync(f).size > 65536) return {}; const n = JSON.parse(fs.readFileSync(f, 'utf8')).name; return typeof n === 'string' ? { pkg: n.slice(0, 80) } : {}; } catch { return {}; } };\nparentPort.on('message', (m) => parentPort.postMessage({ id: m.id, result: pkgOf(m.path) }));\n");
  const rel = WP.createWorkerPool({ file: rf, workerData: {}, size: 1 });
  const p2 = rel.run('pkg', { path: path.join(HOME, 'pipeproj') }, 4000).then(() => 'answered', (e) => 'failed: ' + e.message);
  let relHeld = 0; for (let i = 0; i < 100 && !relHeld; i++) { await sleep(20); relHeld = pipeReaders([pipe]); }
  await p2;
  ok(!!(ans && ans.exists && ans.git === true && !('pkg' in ans) && opened === 0), `a package.json that is a PIPE is never opened: the kid's facts answer at once (git ${ans && ans.git}, no package name) and nothing waits on the pipe (${opened} readers)`, ans);
  ok(relHeld === 1, `RED: the release's fact reader opens that pipe and its worker waits there (${relHeld} reader let go)`);
}

console.log('⑪ A FOLDER MADE ON THE MACHINE IS IN ITS PARENT\'S NEXT LISTING (主开发 r4927: the collector\'s one door, in the agent)');
{
  // THE REAL AGENT: its collector keeps a listing LIST_FRESH_MS (2 s). A folder made on its disk BEHIND its back (no fs op) stays out
  // of the kept listing inside that window — the CONTROL that the window is there; a folder made by the agent's OWN fs op (the road
  // the hub's make-folder takes to a paired machine) drops the kept listing at the collector's door (src/dir-collect.js folderMade,
  // called by src/agentd/agentd.js): the parent's next listing names both
  const PARENT = path.join(HOME, 'folder-made'); fs.mkdirSync(PARENT);
  const P = DS.plan({ text: '~/folder-made/', bases: [], budgetMs: 1500 }, HOME);
  const kidsOf = (f) => ((DS.shape(P, f, { took: 0 }).listing.dirs['~/folder-made']) || {}).kids || [];
  const t0 = Date.now();
  const first = await dm.dirCollect(P.wire, { timeoutMs: 8000 });
  fs.mkdirSync(path.join(PARENT, 'behind-its-back'));   // the disk, not the agent: no door is called
  const kept = await dm.dirCollect(P.wire, { timeoutMs: 8000 });
  const keptMs = Date.now() - t0;
  const mk = await dm.fsMkdir(path.join(PARENT, 'made-by-the-agent'), { by: 'human:owner' }).then((r) => r, (e) => ({ error: e.message }));
  const again = await dm.dirCollect(P.wire, { timeoutMs: 8000 });
  const inside = keptMs < DC.LIST_FRESH_MS;
  ok(!!(inside && !kidsOf(first).length && !kidsOf(kept).includes('behind-its-back')), `⑪ CONTROL: the agent KEEPS a listing — a folder made on its disk behind its back is not in the parent's listing ${keptMs} ms later (inside its ${DC.LIST_FRESH_MS} ms)`, { keptMs, first: kidsOf(first), kept: kidsOf(kept) });
  ok(!!(mk && !mk.error && kidsOf(again).includes('made-by-the-agent') && kidsOf(again).includes('behind-its-back')), `⑪ r4927: a folder made by the agent's own fs op drops its kept listing — the parent's next listing names it (${kidsOf(again).join(' ')})`, { mk, again: kidsOf(again) });
}

POOL.close();
{
  let e = null; daemonEnded = true;
  try { e = enderTakes ? endDaemonsAndWait(process.env.VIBESPACE_AGENTD_ROOT) : endOwnDaemonByPid(process.env.VIBESPACE_AGENTD_ROOT); } catch (err) { e = { error: err.message }; }
  ok(!!(!!e && e.gone === true), `the agent this suite started is ended by its own root (${JSON.stringify(e)})`);
}
report();
