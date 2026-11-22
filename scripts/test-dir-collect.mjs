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
//   ⑥ THE LATE-FACTS WAIT (r1633) on both roads (a kid's fact made slow by a FIFO package.json): S1 (the re-ask before the fact — RED unmarked),
//     the bound (1 s: what landed + factsLate; the fact kept for the next ask), superseded (a newer ask ends it at once)
//   ⑦ THE INDEX ON THE WIRE (r1651): held on the ordinary reply, carried by the late one, «the same» by its content's version; ⑦b the
//     hosts road's whole reply on the paired machine equals this hub's own; an older agent / Windows / no home keep the sh road
//   ⑧ the first reply at today's bounds, measured (14 folders of 400 kids, the index held)
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
  const SFm = require(REPO + '/src/safe-fs.js'), ag = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8'), wp = fs.readFileSync(path.join(REPO, 'src/agentd/worker-pool.js'), 'utf8');
  ok(!!(SFm.NO_IDLE.code === 'no-idle-worker' && SFm.NO_WORKER.code === 'no-worker' && SFm.PATH_HUNG.code === 'path-hung' && wp.includes("{ code: live ? 'no-idle-worker' : 'no-worker' }") && ag.includes("poolBusy: (err) => !!err && (err.code === 'no-idle-worker' || err.code === 'no-worker'),")
    && ag.includes('const refused = hung.refusal(op, payload); if (refused) throw refused;') && ag.includes('hung.deadline(op, payload);') && ag.includes('hung.landed(op, payload);')),
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


POOL.close();
{
  let e = null; daemonEnded = true;
  try { e = enderTakes ? endDaemonsAndWait(process.env.VIBESPACE_AGENTD_ROOT) : endOwnDaemonByPid(process.env.VIBESPACE_AGENTD_ROOT); } catch (err) { e = { error: err.message }; }
  ok(!!(!!e && e.gone === true), `the agent this suite started is ended by its own root (${JSON.stringify(e)})`);
}
report();
