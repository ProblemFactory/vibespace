#!/usr/bin/env node
// A MACHINE's LISTING IS NEVER WORSE THAN THE RELEASE's (主开发 r2974 — the paired machine's folder listing, its second must born of the
// collector). The collector serves only while it can; whenever it cannot, THAT ask is served by the release's road (the sh slice
// script: a child a call, which touches neither of the machine's pools), and the person never reads a promise that cannot come true.
//   (a) THE HANDLE (src/agentd/dir-handle.js) over a pool of ONE with no replacement, its worker a stand-in that IGNORES ITS END (never
//       a real mount): the slot stays empty and the handle SAYS so by name (`gone`), never «busy»; nothing more is sent. A read out past
//       an ask's budget is said too (`held`). THE TURN: the line's stat first; a bare stat whose asks all ended is not sent; facts go
//   (b) THE HUB (src/hosts.js dirSlice) on a REAL agent (this tree's bundle) whose one read is out past the ask's budget: refused by
//       name, the plain path LISTED by the release's road, nothing held — RED: today's late shape of that refusal; a machine whose agent
//       says `gone` HELD on the release's road (no collect asked) until its agent says it has a live worker again
//   (c) a collect refused for NO CAPABILITY is served by the release's road too, and holds nothing
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
// THE DEAD-PATH STAND-IN (src/dir-ops.js deadStandIn, VIBESPACE_DIROPS_TEST=1): a folder named `vs-dead-…` is a read HELD in the
// worker the collector's handle sent it to — never a real pipe — until the suite puts a `.go` inside it (`.held` / `.left` say it)
process.env.VIBESPACE_DIROPS_TEST = '1';
const homeMint = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dcfb-'));
const HOME = fs.realpathSync(homeMint);
process.env.HOME = HOME;
const rootMint = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dcfb-root-'));
process.env.VIBESPACE_AGENTD_ROOT = rootMint;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dcfb-data-'));
const mk = (rel) => fs.mkdirSync(path.join(HOME, rel), { recursive: true });
const OLD = (Date.now() - 3600e3) / 1000;
const setOld = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isSymbolicLink()) { try { fs.lutimesSync(p, OLD, OLD); } catch { } } else { if (e.isDirectory()) setOld(p); fs.utimesSync(p, OLD, OLD); } } fs.utimesSync(dir, OLD, OLD); };

const DC = require(REPO + '/src/dir-collect.js'), DS = require(REPO + '/src/server/dir-slice.js');
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
await sleep(300); setOld(HOME);   // (anything the agent's start touched in the home: old again)
console.log('⑩ THE LAW (r2974): a machine\'s listing is never worse than the release\'s — the collector serves only while it can');
{
  const DH = require(REPO + '/src/agentd/dir-handle.js'), WP = require(REPO + '/src/agentd/worker-pool.js');
  const { EventEmitter } = await import('node:events');
  const until = async (pred, ms) => { const end = Date.now() + ms; while (!(await pred()) && Date.now() < end) await sleep(20); return !!(await pred()); };
  const statOf = (m) => ({ id: m.id, result: { stat: { path: m.path, exists: true, isDir: true } } });
  // (a) THE HANDLE over a pool of ONE with no replacement, its worker a STAND-IN THAT IGNORES ITS END (never a real mount): a read of
  // a `vs-wedge-` path never answers and its terminate is never heard — the thread a dead NFS stat leaves in the kernel
  const posted = [];
  class StuckWorker extends EventEmitter {
    postMessage(m) { posted.push(m.path); if (String(m.path || '').includes('vs-wedge-')) return; setImmediate(() => this.emit('message', statOf(m))); }
    terminate() { return new Promise(() => { }); }   // its end never comes
    unref() { }
  }
  const pool = WP.createWorkerPool({ file: 'stand-in', workerData: {}, size: 1, maxWedged: 0, wedgeMs: 100, respawnMs: 50, workerThreads: { Worker: StuckWorker, isMainThread: true } });
  const H = DH.createDirHandle({ poolOf: () => pool, hung: DC.hungMemory({ home: HOME }), callMs: 300 });
  const s0 = H.state();
  H.begin();   // (an ask running on the machine: its reads are sent)
  const dead = await H.call('pathStat', { path: path.join(HOME, 'share', 'vs-wedge-a') }).then(() => 'answered', (e) => String((e && (e.code || e.message)) || e));
  await until(() => pool.stats().wedged === 1, 3000);
  const st = pool.stats(), s1 = H.state(), n1 = posted.length;
  const after = await H.call('pathStat', { path: path.join(HOME, 'plain') }).then(() => 'answered', (e) => String((e && e.code) || e));
  H.end();
  ok(!!(s0.live && /^fs deadline/.test(dead) && st.live === 0 && st.wedged === 1 && st.spawned === 1 && s1.live === false && s1.why === 'gone' && after === 'no-worker' && posted.length === n1),
    `a worker that IGNORES ITS END (a pool of one, no replacement): its read ends at the deadline, the slot STAYS EMPTY (live ${st.live}, wedged ${st.wedged}, spawned ${st.spawned}) — and the handle SAYS so by name (${s1.why}), never «busy»; a later read is refused at once and nothing is sent (${after})`, { st, s1, dead, after });
  // …a read out past any reply's budget is said too (`held`), and the handle is live again once it answers
  const posted2 = [];
  class SlowWorker extends EventEmitter {
    postMessage(m) { posted2.push(m.path); const ms = String(m.path || '').includes('vs-slow-') ? 400 : 0; setTimeout(() => this.emit('message', statOf(m)), ms); }
    terminate() { setImmediate(() => this.emit('exit', 0)); return Promise.resolve(); }
    unref() { }
  }
  const pool2 = WP.createWorkerPool({ file: 'stand-in', workerData: {}, size: 1, maxWedged: 0, workerThreads: { Worker: SlowWorker, isMainThread: true } });
  const H2 = DH.createDirHandle({ poolOf: () => pool2, hung: DC.hungMemory({ home: HOME }), callMs: 5000, stuckMs: 200 });
  H2.begin();
  const slowP = H2.call('pathStat', { path: path.join(HOME, 'x', 'vs-slow-a'), facts: true });
  const sawHeld = await until(() => H2.state().why === 'held', 2000);
  await slowP; const liveAgain2 = await until(() => H2.state().live === true, 2000); const sLive = H2.state();   // (its turn handed on)
  // THE TURN: the line's stat goes FIRST (one read out); a bare stat whose asks all ended is NOT sent; a kid's facts still go
  await until(() => !H2.stats().out && H2.stats().waiting === 0, 2000);   // the turn free again (the read before has handed it on)
  const s2a = posted2.length;
  const first = H2.call('pathStat', { path: path.join(HOME, 'x', 'vs-slow-b'), facts: true });
  const listing = H2.call('dirSlice', { path: path.join(HOME, 'x', 'listed') });
  const line = H2.call('pathStat', { path: path.join(HOME, 'x', 'line') });
  await Promise.all([first, listing, line]);
  const order = posted2.slice(s2a).map((p) => path.basename(p));
  const s2b = posted2.length;
  const held2 = H2.call('pathStat', { path: path.join(HOME, 'x', 'vs-slow-c'), facts: true });
  const lost = H2.call('pathStat', { path: path.join(HOME, 'x', 'nobody') }).then(() => 'sent', (e) => String((e && e.code) || e));
  const fact = H2.call('pathStat', { path: path.join(HOME, 'x', 'kidfact'), facts: true }).then(() => 'sent', (e) => String((e && e.code) || e));
  H2.end();   // every ask on this machine ended while the two waited their turn
  const [, lostR, factR] = await Promise.all([held2, lost, fact]);
  const sent2 = posted2.slice(s2b).map((p) => path.basename(p));
  ok(!!(sawHeld && sLive.live && order.join() === 'vs-slow-b,line,listed' && lostR === 'no-idle-worker' && factR === 'sent' && sent2.join() === 'vs-slow-c,kidfact'),
    `the handle says a read out past any reply's budget (held: ${sawHeld}) and is live again once it answers; THE TURN: the line's stat goes ahead of a listing that waited (${order.join(' → ')}); a bare stat whose asks all ended is NOT sent (${lostR}) while a kid's fact still goes, kept for the next ask (sent: ${sent2.join(', ')})`, { order, sent2, lostR, factR });

  // (b) THE HUB. On the REAL agent whose one read is out past THIS ask's budget (held): the agent SAYS so by name, and the plain path
  // is LISTED by the release's road — that ask only (the next ask asks the collector again, at once refused while it holds)
  const { HostManager } = require(REPO + '/src/hosts.js');
  const hm = new HostManager({ dataDir: path.join(dataDir, 'hub-hosts-10') });
  hm._state.hosts.push({ id: 'h-pair', name: 'h-pair', transport: 'dial' });
  hm._devices = new Map([['h-pair', dm]]); hm.device = async () => dm;
  mk('plainlist/alpha'); mk('plainlist/beta'); setOld(path.join(HOME, 'plainlist'));
  const plain = { text: '~/plainlist/', bases: [] };
  const listedOf = (r) => { const s = JSON.stringify((r && r.listing) || {}); return s.includes('alpha') && s.includes('beta'); };
  const okWords = (r) => !!r && !r.rowsLate && !r.factsLate && !r.partial && !r.verdict;
  const healthy = await hm.dirSlice('h-pair', plain);
  const wedge = path.join(HOME, 'wedge', 'vs-dead-w'); mk('wedge/vs-dead-w'); setOld(path.join(HOME, 'wedge'));
  const Pw = DS.plan({ text: '~/wedge/', bases: [], budgetMs: 300 }, HOME);
  await dm.dirCollect(Pw.wire, { timeoutMs: 8000 }).catch(() => null);
  const isOut = await until(() => fs.existsSync(path.join(wedge, '.held')), 4000);
  await sleep(700);   // past the hub's own plan budget (450 ms): the held read has outlived what this ask may wait
  const raw = dm.dirCollect.bind(dm); let asks = 0; const codes = [], whys = [];
  dm.dirCollect = (...a) => { asks++; return raw(...a).catch((e) => { codes.push(e && e.code); whys.push(e && e.state && e.state.why); throw e; }); };
  const r1 = await hm.dirSlice('h-pair', plain), asks1 = asks;
  const r2 = await hm.dirSlice('h-pair', plain), asks2 = asks;
  dm.dirCollect = raw;
  fs.writeFileSync(path.join(wedge, '.go'), '');
  ok(!!(healthy && listedOf(healthy) && isOut && asks1 === 1 && asks2 === 2 && codes.join() === 'collector-stuck,collector-stuck' && whys.join() === 'held,held' && listedOf(r1) && okWords(r1) && listedOf(r2) && okWords(r2) && !(hm._collectStuck && hm._collectStuck.has('h-pair'))),
    `on a REAL agent whose one read is out past this ask's budget: it SAYS so by name («${codes[0]}», ${whys[0]} — never «busy»), the plain path is LISTED by the release's road and the words promise nothing (no «still looking»); the next ask asks the collector again (${asks2 - asks1}) — refused at once while it holds, listed again — and nothing holds the machine`, { codes, whys, asks1, asks2, r1: { rowsLate: r1.rowsLate, factsLate: r1.factsLate, partial: r1.partial } });
  // RED, today's shape: the same refusal shaped by the hub's own shaper from the all-late facts (ec1aa482c's catch) promises an
  // answer that cannot come
  const DSLm = require(REPO + '/src/server/dir-slice.js');
  const Pp = DSLm.plan({ ...plain, budgetMs: 450 }, HOME), lt = { late: true };
  const todayF = { home: HOME, at: Date.now(), me: { home: HOME, roots: [] }, answers: Pp.wire.cands.map((x) => ({ path: x.c, answer: 'late', at: x.a })), rows: Pp.wire.rows.map(() => lt), probes: Pp.wire.probes.map(() => lt), index: Pp.wire.roots.map(() => lt), listed: [], listedTyped: 0, mounts: [] };
  const today = DSLm.shape(Pp, todayF, { machine: 'h-pair', localized: {}, took: 0 });
  ok(!!(today.rowsLate === true && !listedOf(today)), `RED, today's shape: that refusal shaped as late (the all-late facts the last cure's catch built) says «still looking» for the plain path (rowsLate ${today.rowsLate}) and lists nothing — an answer that cannot come while the read holds`);
  // (b2) a machine whose agent says its collector has NO usable worker (gone — the stand-in of (a) on a machine): held on the release's
  // road — no collect asked — until its agent, asked behind the answers, says it has a live worker again
  let gone = true, pAsks = 0;
  const goneDm = new Proxy(dm, { get: (o, k) => {
    if (k === 'dirCollect') return async (...a) => { pAsks++; if (gone) throw Object.assign(new Error('the folder field\'s collector on this machine cannot serve (gone)'), { code: 'collector-stuck', state: { live: false, why: 'gone' } }); return o.dirCollect(...a); };
    if (k === 'dirCollectState') return async () => (gone ? { live: false, why: 'gone' } : { live: true });
    const v = o[k]; return typeof v === 'function' ? v.bind(o) : v;
  } });
  hm._devices = new Map([['h-pair', goneDm]]); hm.device = async () => goneDm;
  const g1 = await hm.dirSlice('h-pair', plain), gp1 = pAsks;
  const g2 = await hm.dirSlice('h-pair', plain), gp2 = pAsks;
  const heldOn = !!(hm._collectStuck && hm._collectStuck.has('h-pair'));
  gone = false; hm._collectStuckAskMs = 0;
  const g3 = await hm.dirSlice('h-pair', plain);   // (its ask that asks the agent, behind its answer)
  const unheld = await until(() => !(hm._collectStuck && hm._collectStuck.has('h-pair')), 3000);
  const gp3 = pAsks;
  const g4 = await hm.dirSlice('h-pair', plain);
  ok(!!(gp1 === 1 && listedOf(g1) && okWords(g1) && heldOn && gp2 === 1 && listedOf(g2) && listedOf(g3) && unheld && pAsks === gp3 + 1 && listedOf(g4)),
    `a machine whose agent says «gone»: that ask LISTED by the release's road, the machine HELD there — the next ask asks no collect (${gp2 - gp1}) and is listed — until its agent, asked behind the answers, says it has a live worker again; then the collector road again (${pAsks - gp3} ask) and listed`, { gp1, gp2, gp3, pAsks, heldOn, unheld });
  hm._devices = new Map([['h-pair', dm]]); hm.device = async () => dm;
  // (c) the no-capability refusal (the client's own gate) falls to the release's road too — and holds nothing
  const nocap = new Proxy(dm, { get: (o, k) => (k === 'dirCollect' ? async () => { throw Object.assign(new Error('daemon lacks dir-collect (capabilities gate)'), { code: 'no-capability' }); } : (typeof o[k] === 'function' ? o[k].bind(o) : o[k])) });
  hm._devices = new Map([['h-pair', nocap]]); hm.device = async () => nocap;
  const rn = await hm.dirSlice('h-pair', plain);
  ok(!!(listedOf(rn) && okWords(rn) && !(hm._collectStuck && hm._collectStuck.has('h-pair'))), 'a collect refused for NO CAPABILITY is served by the release\'s road (listed, no «still looking»), and holds the machine on nothing');
  hm._devices = new Map([['h-pair', dm]]); hm.device = async () => dm;
}

{
  let e = null; daemonEnded = true;
  try { e = enderTakes ? endDaemonsAndWait(process.env.VIBESPACE_AGENTD_ROOT) : endOwnDaemonByPid(process.env.VIBESPACE_AGENTD_ROOT); } catch (err) { e = { error: err.message }; }
  ok(!!(!!e && e.gone === true), `the agent this suite started is ended by its own root (${JSON.stringify(e)})`);
}
report();
