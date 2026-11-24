#!/usr/bin/env node
// test-cli-config-status-off-loop — B-ddf3 (lane bl-scratch, the coordinator's r3462: the verifier's law five, its scene
// bl-vault/ccv-scene-3.md). THE STATUS THE ROUTES READ NEVER READS THE PERSON's HOME ON THE HUB's LOOP. FAST, in-process: the
// hub's own src/server/harness-config-sync.js over a scratch HOME, the real shipped helper (data/bin/vibespace-hook-register.mjs)
// run through a stand-in starter that starts it with this node, as the starter does. Every synchronous fs function of this
// process (the loop stands here) is watched for a call whose path lies under that home.
//   ① ZERO synchronous calls under the home from every road a route reaches: cliConfigStatus (GET /api/agent-hooks's field) and
//     the Apply route of src/server/hooks-late.js, run for real through a stand-in app; the receipts are fresh (the helper's own
//     --status read), each with its file and path; server.js's /api/agent-hooks line awaits the same status.
//                                                     RED: the release's in-process read (readConfigPlan on the loop)
//   ② A HOME THAT NEVER REPLIES (a starter whose run never answers): the status answers INSIDE its bound, every key «not known
//     now» by name with the time of the last read; a second caller shares the read in flight (no second helper run); the
//     Apply route's status field answers inside the same bound.
//                                                     RED: a status that waits on the read with no bound
//   ②b A SHORT BOUND REFUSES NO ONE (a home slower than the bound): the read that lands late answers the next caller, with its
//     time.                                           RED: the last read never answers a caller whose wait ran out
//   ③ THE WORDS: «not known now — the file did not answer in time» / «… the read of the file failed», and when last read.
//   ④ A READ THAT STARTED BEFORE A LANDING IS NEVER JOINED (it may have read the files before that write): a new read starts.
//                                                     RED: every caller joins the read in flight
//   ⑤ THE HELPER's OWN FAILURE LINE (CFG|*|) IS NO FRESH RECEIPT: every key «not known now — the read failed».
//                                                     RED: a whole-run line taken for fresh receipts
//   ⑥ A HUNG HOME PILES NO HELPERS: after a read the helper did not finish within the run's bound, no new read is asked.
//                                                     RED: a new helper at every look
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { checker } from './lib/check.mjs';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
const ROOT = scratch('cli-config-status-off-loop');
fs.mkdirSync(ROOT, { recursive: true });
const MC = mutantCopies('cli-config-status-off-loop', REPO);
const KEEP = setInterval(() => {}, 60000);   // the runner's and the status's bound timers are unref'd (a hub's loop is alive anyway)
const SYNC_REL = 'src/server/harness-config-sync.js', HL_REL = 'src/server/hooks-late.js';
const src = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const harnesses = require(path.join(REPO, 'src/harnesses/index.js'));
const { createCliConfigRunner } = require(path.join(REPO, 'src/server/cli-config-runner.js'));
const HELPER = path.join(REPO, 'data', 'bin', 'vibespace-hook-register.mjs');

// the starter: runs the helper with this node, as the starter does — asynchronously: nothing of it reads the home in THIS process
const realStarter = (count) => ({ run: (cmd, args, o = {}) => { count.n++; return new Promise((resolve) => {
  let out = '', err = '';
  const c = spawn(cmd, args, { env: { ...process.env, ...(o.envAdd || {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
  c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
  c.on('error', (e) => resolve({ started: false, error: String(e && e.code), stdout: out, stderr: err }));
  c.on('close', (code) => resolve({ started: true, code, stdout: out, stderr: err }));
}); } });
// the first run answers (a read to remember), every later run never answers (a home that stopped answering)
const silentAfterFirst = (count) => { const real = realStarter({ n: 0 }); return { run: (...a) => { count.n++; return count.n === 1 ? real.run(...a) : new Promise(() => {}); } }; };

// THE WATCH (the verifier's): every synchronous fs function of this process, a call whose path lies under the home recorded
const SYNC_FNS = Object.keys(fs).filter((k) => /Sync$/.test(k) && typeof fs[k] === 'function');
function watchHome(home) {
  const seen = [], orig = {};
  const under = (p) => { let s = typeof p === 'string' ? p : p instanceof URL ? fileURLToPath(p) : Buffer.isBuffer(p) ? p.toString() : ''; if (!s) return false; s = path.resolve(s); return s === home || s.startsWith(home + path.sep); };
  for (const k of SYNC_FNS) { orig[k] = fs[k]; fs[k] = function (...a) { if (under(a[0]) || under(a[1])) seen.push(`${k}(${String(a[0]).slice(-60)})`); return orig[k].apply(this, a); }; }
  return { seen, stop() { for (const k of SYNC_FNS) fs[k] = orig[k]; } };
}
const mkHome = (name) => { const h = path.join(ROOT, name); fs.mkdirSync(path.join(h, '.claude'), { recursive: true }); fs.writeFileSync(path.join(h, '.claude', 'settings.json'), JSON.stringify({ cleanupPeriodDays: 36500 }, null, 2) + '\n'); return h; };
const mkSync = (modPath, home, extra) => require(modPath).create({ serverSetting: () => undefined, harnesses, adapterRegistry: { get: () => null }, activeSessions: new Map(), hookRegistrationSafe: () => true, home, helperPath: HELPER, log: () => {}, warn: () => {}, ...extra });
// the Apply route (src/server/hooks-late.js), run for real through a stand-in app → its answer
async function applyRoute(harnessConfig) {
  const routes = {}, app = { post: (pp, fn) => { routes[pp] = fn; } };
  require(path.join(REPO, HL_REL)).create({ activeSessions: new Map(), getSessionStatus: () => null, getUserTodos: () => null, sessionStatusKey: () => null, harnesses: { list: () => [] }, log: () => { }, warn: () => { } })
    .registerApplyRoute(app, { ensureAgentHooks: async () => ({ claude: { ok: true } }), agentHooksStatus: async () => ({}), integrationEnabled: () => false, harnessConfig, hookRegistrationSafe: () => true });
  let body = null; const res = { status() { return res; }, json(x) { body = x; return res; } };
  await routes['/api/cli-config/apply']({ body: {}, query: {}, headers: {} }, res);
  return body;
}
const NEEDLE = 'transcriptRetentionDays';

// ── ① zero synchronous calls under the home from every road a route reaches ──
console.log('① THE STATUS AND THE APPLY ROUTE READ NOTHING OF THE HOME ON THE LOOP (the helper reads, in its own process)');
async function roads(modPath) {
  const home = mkHome(`home-roads-${path.basename(modPath).length}-${Date.now()}`), runs = { n: 0 };
  const S = mkSync(modPath, home, { starter: realStarter(runs), statusMs: 20000 });   // fresh-content checks wait past a loaded machine's spawn
  const w = watchHome(home);
  let st = null, body = null;
  try { st = await S.cliConfigStatus(); body = await applyRoute(S); } finally { w.stop(); }
  return { seen: w.seen, st, body, runs: runs.n };
}
const real = await roads(path.join(REPO, SYNC_REL));
const ar = (real.body && real.body.cliConfig && real.body.cliConfig.receipts || []).find((r) => r.key === NEEDLE);
const rr = (real.st && real.st.receipts || []).find((r) => r.key === NEEDLE);
ok(!!(real.seen.length === 0 && real.st && real.st.unread === null && rr && rr.state === 'applied' && rr.rel === '.claude/settings.json' && rr.path === 'cleanupPeriodDays' && real.body && real.body.cliConfig && real.body.cliConfig.unread === null && ar && ar.state === 'applied' && ar.rel === '.claude/settings.json' && real.runs >= 2),
  '① 0 synchronous calls under the home from cliConfigStatus and from the Apply route; the receipts of BOTH are FRESH (the helper\'s own --status read: applied), each with its file and path', { seen: real.seen.slice(0, 6), receipt: rr, unread: real.st && real.st.unread, runs: real.runs });
console.log(`    the watch: ${real.seen.length} synchronous call(s) under the home · ${NEEDLE} ${rr ? rr.state : 'NOT READ'} (${rr && rr.rel} → ${rr && rr.path}) · ${real.runs} helper run(s)`);
const SJ = src('server.js'), HL = src(HL_REL);
ok(/app\.get\('\/api\/agent-hooks', async \(req, res\) => \{[^\n]*cliConfig: await harnessConfig\.cliConfigStatus\(\)/.test(SJ) && HL.includes('cliConfig: await harnessConfig.cliConfigStatus(),'),
  '① the two routes that answer the status AWAIT it — server.js\'s GET /api/agent-hooks line and hooks-late\'s Apply route (the same function, its own bound)');
// RED: the release's form — the status reads the plan's files IN-PROCESS (the applier's readConfigPlan, synchronous, on the loop)
const OLD_READ = MC.write(SYNC_REL, anchored(src(SYNC_REL), '    const plan = cliConfigPlan();\n    const until = mono() + ms;', `    const plan = cliConfigPlan();\n    try { require(${JSON.stringify(path.join(REPO, 'src/harness-config.js'))}).readConfigPlan(plan, { home }); } catch { }\n    const until = mono() + ms;`, 'the release\'s in-process read'), 'status-in-process');
const redA = await roads(OLD_READ);
ok(redA.seen.length > 0, 'RED (the release\'s in-process read, readConfigPlan on the loop): the watch sees synchronous calls under the home', { seen: redA.seen.slice(0, 6) });
console.log(`    the release's form: ${redA.seen.length} synchronous call(s) under the home — ${redA.seen.slice(0, 3).join(' · ')}`);

// ── ② a home that never replies ──
console.log('② A HOME THAT NEVER REPLIES: the status and the Apply route still answer inside the status\'s bound, «not known now» by name');
const BOUND = 300, MARGIN = 900;
async function silentHome(modPath) {
  const home = mkHome(`home-silent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`), runs = { n: 0 };
  const runner = createCliConfigRunner({ starter: silentAfterFirst(runs), helperPath: HELPER, home, timeoutMs: 1500, journal: () => {}, warn: () => {} });
  const S = mkSync(modPath, home, { runner, statusMs: BOUND, statusFreshMs: 0 });   // (②b holds the fresh read's own leg)
  const first = await S.cliConfigStatus({ ms: 20000 });   // the one read that answers: remembered with its time
  const guard = (p) => Promise.race([p, new Promise((res) => { const t = setTimeout(() => res({ NO_ANSWER: true }), BOUND + MARGIN); t.unref?.(); })]);
  const t0 = Date.now();
  const [a, b] = await Promise.all([guard(S.cliConfigStatus()), guard(S.cliConfigStatus())]);   // two callers while the home is silent
  const took = Date.now() - t0, runsAfter = runs.n;
  const t1 = Date.now(); const body = await guard(applyRoute({ ...S, syncCliConfig: async () => ({ receipts: [] }) })); const tookRoute = Date.now() - t1;
  return { first, a, b, took, runsAfter, body, tookRoute };
}
const sl = await silentHome(path.join(REPO, SYNC_REL));
const k0 = (sl.a && sl.a.receipts || []).find((r) => r.key === NEEDLE);
ok(!!(sl.first && sl.first.unread === null && !sl.a.NO_ANSWER && !sl.b.NO_ANSWER && sl.took < BOUND + MARGIN
    && /^not known now — the helper's read of this machine's files did not answer within 300 ms$/.test(sl.a.unread || '')
    && k0 && k0.state === 'unknown' && k0.reason === 'not-known-now' && k0.rel === '.claude/settings.json' && typeof k0.readAt === 'number' && !!k0.readAt
    && sl.a.receipts.every((r) => r.state === 'unknown' && r.reason === 'not-known-now') && sl.runsAfter === 2),
  '② with a home that never replies the status answers inside its bound: every key «not known now» by name, with the time of the last read; the second caller shares the read in flight (one helper run)', { took: sl.took, unread: sl.a && sl.a.unread, receipt: k0, runs: sl.runsAfter });
ok(!!(sl.body && !sl.body.NO_ANSWER && sl.tookRoute < BOUND + MARGIN && sl.body.cliConfig && /^not known now/.test(sl.body.cliConfig.unread || '')),
  '② the Apply route\'s status field answers inside the same bound, «not known now» by name', { tookRoute: sl.tookRoute, unread: sl.body && sl.body.cliConfig && sl.body.cliConfig.unread });
console.log(`    the status answered in ${sl.took} ms (bound ${BOUND} ms), the route in ${sl.tookRoute} ms · ${sl.runsAfter} helper run(s) in all (the first read, then ONE shared by the two callers) · «${sl.a && sl.a.unread}»`);
// RED: a status that waits on the read with no bound
const NO_BOUND = MC.write(SYNC_REL, anchored(src(SYNC_REL), "const t = setTimeout(() => resolve({ timedOut: true, code: 'timed-out', why: `the helper's read of this machine's files did not answer within ${ms} ms` }), left);", 'const t = setTimeout(() => {}, left);', 'the status\'s bound'), 'status-no-bound');
const redB = await silentHome(NO_BOUND);
ok(!!(redB.a && redB.a.NO_ANSWER), 'RED (a status that waits on the read with no bound): with a home that never replies the status does not answer inside its bound', { took: redB.took });

// ── ②b a short bound refuses no one ──
console.log('②b A SHORT BOUND REFUSES NO ONE: a read that lands after a caller\'s bound answers the next caller, with its time');
const slowStarter = (count, delayMs) => { const real = realStarter({ n: 0 }); count.done = 0; return { run: (...a) => { count.n++; return new Promise((res) => setTimeout(() => real.run(...a).then((x) => { count.done++; res(x); }), delayMs)); } }; };
async function slowHome(modPath) {
  const home = mkHome(`home-slow-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`), runs = { n: 0 };
  const S = mkSync(modPath, home, { starter: slowStarter(runs, BOUND + 150), statusMs: BOUND });
  const first = await S.cliConfigStatus();   // its wait runs out: nothing read yet
  for (let i = 0; i < 300 && !runs.done; i++) await new Promise((r) => setTimeout(r, 50));   // the slow read lands meanwhile (bounded: never a fixed time)
  await new Promise((r) => setImmediate(r));
  const second = await S.cliConfigStatus();   // its own read is slow too: the late read answers it
  return { first, second };
}
const sh = await slowHome(path.join(REPO, SYNC_REL)), k2 = (sh.second && sh.second.receipts || []).find((r) => r.key === NEEDLE);
ok(!!(sh.first && /^not known now/.test(sh.first.unread || '') && sh.second && sh.second.unread === null && k2 && k2.state === 'applied' && typeof sh.second.readAt === 'number' && k2.readAt === sh.second.readAt),
  '②b a home slower than the bound: the first caller is told «not known now»; the read that landed late answers the next caller (applied), with its time', { first: sh.first && sh.first.unread, second: sh.second && sh.second.unread, receipt: k2 });
const NO_FRESH = MC.write(SYNC_REL, anchored(src(SYNC_REL), 'else if (lastRead && lastRead.at >= landedAt() && Date.now() - lastRead.at <= statusFreshMs) {', 'else if (false) {', 'the fresh read\'s answer'), 'status-no-fresh');
const redF = await slowHome(NO_FRESH);
ok(!!(redF.second && /^not known now/.test(redF.second.unread || '')), 'RED (the last read never answers a caller whose wait ran out): a slow home is «not known now» at every look', { second: redF.second && redF.second.unread });

// a starter the leg answers by hand: an apply run answers at once (nothing written), each --status run waits for the leg
const HC = require(path.join(REPO, 'src/harness-config.js'));
const cfg = (state) => HC.formatReceiptLines([{ harness: 'claude', key: NEEDLE, state, current: state === 'applied' ? 36500 : null, want: 36500, reason: state === 'missing' ? 'will-create' : null }]);
function handStarter(onStatus) {
  const st = { runs: 0, held: [] };
  st.run = (cmd, args) => { if (args.includes('--status')) { st.runs++; return onStatus(st); } return Promise.resolve({ started: true, code: 0, stdout: '', stderr: '' }); };
  return st;
}
const mkHand = (modPath, st, extra = {}) => { const home = mkHome(`home-hand-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`); const runner = createCliConfigRunner({ starter: st, helperPath: HELPER, home, timeoutMs: 5000, journal: () => {}, warn: () => {} }); return mkSync(modPath, home, { runner, ...extra }); };

// ── ④ a read that started before a landing is never joined ──
console.log('④ A READ THAT STARTED BEFORE A LANDING IS NEVER JOINED: the status after a write reads the files after it');
async function landingLeg(modPath) {
  const st = handStarter((s) => new Promise((res) => s.held.push(res)));
  const S = mkHand(modPath, st, { statusMs: 150, statusFreshMs: 0 });
  const a = await S.cliConfigStatus();   // read 1 starts and is held: «not known now»
  await S.applyThisMachine({ reason: 'a write after that read started' });   // a landing
  const pb = S.cliConfigStatus({ ms: 3000 });   // read 1 is older than the landing and still out: not joined, no second child
  await new Promise((r) => setTimeout(r, 60));
  const runsB1 = st.runs;
  if (st.held[0]) st.held[0]({ started: true, code: 0, stdout: cfg('missing'), stderr: '' });   // read 1 ends: the files BEFORE the write
  await new Promise((r) => setTimeout(r, 60));
  const runsB2 = st.runs;   // the waiting caller's own new read, after the landing
  for (const f of st.held.slice(1)) f({ started: true, code: 0, stdout: cfg('applied'), stderr: '' });
  const b = await pb;
  return { a, runsB1, runsB2, kb: (b && b.receipts || []).find((r) => r.key === NEEDLE), codeB: b && b.unreadCode };
}
const lg = await landingLeg(path.join(REPO, SYNC_REL));
ok(!!(lg.a && /^not known now/.test(lg.a.unread || '') && lg.runsB1 === 1 && lg.runsB2 === 2 && lg.kb && lg.kb.state === 'applied'),
  '④ r3784 (2): a read older than a landing is not joined and NO second child starts beside it; the caller waits its own bound for it to end, then its new read answers the files AFTER the write (a short bound refuses no one)', { runsB1: lg.runsB1, runsB2: lg.runsB2, kb: lg.kb });
const JOIN_ALL = MC.write(SYNC_REL, anchored(src(SYNC_REL), 'if (statusFlight && statusFlight.startedAt >= landedAt()) return statusFlight.p;', 'if (statusFlight) return statusFlight.p;', 'the landing\'s fence on the shared read'), 'status-join-all');
const redJ = await landingLeg(JOIN_ALL);
ok(!!(redJ.kb && redJ.kb.state === 'missing' && redJ.runsB1 === 1), 'RED (every caller joins the read in flight): the status after a write answers the files BEFORE it («missing»)', { runsB1: redJ.runsB1, kb: redJ.kb });
const NO_COUNT = MC.write(SYNC_REL, anchored(src(SYNC_REL), 'if (statusOut > 0 || statusLate > 0) return Promise.resolve(', 'if (false) return Promise.resolve(', 'the count of status children'), 'status-no-count');
const redC = await landingLeg(NO_COUNT);
ok(!!(redC.runsB1 === 2), 'RED (the status children not counted): a second helper starts beside one still out', { runsB1: redC.runsB1 });

// ── ⑤ the helper's own failure line is no fresh receipt ──
console.log('⑤ THE HELPER\'s OWN FAILURE LINE (CFG|*|) IS NO FRESH RECEIPT');
async function wholeLeg(modPath) {
  // a key receipt AND the helper's own failure line in one run (a whole line alone is also «no key receipt»: only this rule judges this run)
  const st = handStarter(() => Promise.resolve({ started: true, code: 0, stdout: cfg('applied') + '\nCFG|*|*|error|the helper could not load its plan', stderr: '' }));
  const S = mkHand(modPath, st, { statusMs: 3000, statusFreshMs: 0 });
  return S.cliConfigStatus();
}
const wl = await wholeLeg(path.join(REPO, SYNC_REL)), kw = (wl && wl.receipts || []).find((r) => r.key === NEEDLE);
ok(!!(wl && /^not known now — the helper's read failed: /.test(wl.unread || '') && kw && kw.state === 'unknown' && kw.reason === 'not-read' && kw.rel === '.claude/settings.json'),
  '⑤ a run whose only line is the helper\'s own failure: every key «not known now — the read failed» by name (never fresh receipts)', { unread: wl && wl.unread, receipt: kw });
const WHOLE_OK = MC.write(SYNC_REL, anchored(src(SYNC_REL), '!r.receipts.some((x) => x.harness == null) && ', '', 'the whole-run line\'s refusal'), 'status-whole-ok');
const redW = await wholeLeg(WHOLE_OK);
ok(!!(redW && redW.unread === null), 'RED (a whole-run line taken for fresh receipts): the status says nothing is unknown', { unread: redW && redW.unread, receipts: redW && redW.receipts });

// ── ⑥ a hung home piles no helpers ──
console.log('⑥ A HUNG HOME PILES NO HELPERS: after a read the helper did not finish within its bound, no new read is asked');
async function backoffLeg(modPath) {
  const st = { runs: 0, run: (cmd, args, o = {}) => { if (!args.includes('--status')) return Promise.resolve({ started: true, code: 0, stdout: '', stderr: '' }); st.runs++; if (o.onLateExit) o.onLateExit(); return Promise.resolve({ timedOut: true }); } };   // the starter ended the helper past its bound; the child had exited by then (no late child)
  const S = mkHand(modPath, st, { statusMs: 3000, statusFreshMs: 0 });
  const a = await S.cliConfigStatus(), b = await S.cliConfigStatus(), c = await S.cliConfigStatus();
  return { a, b, c, runs: st.runs };
}
const bo = await backoffLeg(path.join(REPO, SYNC_REL)), kb = (bo.c && bo.c.receipts || []).find((r) => r.key === NEEDLE);
ok(!!(bo.runs === 1 && /^not known now — the helper ran past its/.test(bo.a.unread || '') && /^not known now — an earlier read of this machine's files did not finish \(timed-out\) — the next read is asked in \d+ s$/.test(bo.c.unread || '') && bo.c.unreadCode === 'backoff' && kb && kb.reason === 'not-known-now'),
  '⑥ after a read the helper did not finish within its bound, the next looks ask no new helper (one run for three looks) and say so by name', { runs: bo.runs, a: bo.a.unread, c: bo.c.unread });
const NO_BACKOFF = MC.write(SYNC_REL, anchored(src(SYNC_REL), "else if (r && (r.code === 'timed-out' || r.code === 'starter-unknown')) statusBackoff = { until: mono() + statusBackoffMs, cause: r.code };", '', 'the backoff'), 'status-no-backoff');
const redO = await backoffLeg(NO_BACKOFF);
ok(redO.runs === 3, 'RED (a new helper at every look): three looks start three helpers', { runs: redO.runs });

// ── ⑦ «last read» is true; a helper that says nothing is «not read» ──
console.log('⑦ r3784 (1)(3): «LAST READ» COUNTS ONLY A LANDING THAT READ; A HELPER THAT PRINTS NOTHING WITH KEYS PLANNED IS «NOT READ»');
async function silentLeg(modPath) {
  const st = { runs: 0, run: (cmd, args) => { if (args.includes('--status')) { st.runs++; return Promise.resolve({ started: true, code: 0, stdout: '', stderr: '' }); } return Promise.resolve({ started: true, code: 1, stdout: '', stderr: 'a planted failure' }); } };
  const S = mkHand(modPath, st, { statusMs: 3000, statusFreshMs: 0 });
  const land = await S.applyThisMachine({ reason: 'a failed landing' });   // the helper exited 1: nothing was read
  const r = await S.cliConfigStatus();
  return { landOk: land && land.ok, r, k: (r && r.receipts || []).find((x) => x.key === NEEDLE) };
}
const s7 = await silentLeg(path.join(REPO, SYNC_REL));
ok(!!(s7.landOk === false && s7.r && s7.r.unreadCode === 'no-receipt' && /^not known now — the helper printed no receipt of the plan's keys$/.test(s7.r.unread || '') && s7.k && s7.k.state === 'unknown' && s7.k.reason === 'not-read' && s7.k.readAt === null),
  '⑦ a helper that printed nothing with keys planned is «not known now — no receipt», by name; a FAILED landing is no «last read» (no time claimed)', { code: s7.r && s7.r.unreadCode, unread: s7.r && s7.r.unread, k: s7.k });
const FAILED_READ = MC.write(SYNC_REL, anchored(src(SYNC_REL), '(l && l.ok && !l.skipped && l.at)', '(l && !l.skipped && l.at)', 'a failed landing counted as a read'), 'status-failed-read');
const r7a = await silentLeg(FAILED_READ);
ok(!!(r7a.k && typeof r7a.k.readAt === 'number'), 'RED (a failed landing counted for «last read»): the line claims a read that never happened', { k: r7a.k });
const SILENT_OK = MC.write(SYNC_REL, anchored(src(SYNC_REL), '(planned ? keyReceipts(r).length > 0 : !r.why)', '(!r.why)', 'a silent helper taken for a read'), 'status-silent-ok');
const r7b = await silentLeg(SILENT_OK);
ok(!!(r7b.r && r7b.r.unread === null), 'RED (a silent helper taken for a fresh read): nothing is said unknown, the page falls to «not checked»', { unread: r7b.r && r7b.r.unread });

// ── ⑧ the runner's own guard: a home it holds stuck asks no status helper ──
console.log('⑧ r3784 (2): WHILE THE RUNNER\'s GUARD SAYS THE HOME IS STUCK, NO STATUS HELPER STARTS');
async function stuckLeg(modPath) {
  const st = handStarter(() => Promise.resolve({ started: true, code: 0, stdout: cfg('applied'), stderr: '' }));
  const home = mkHome(`home-stuck-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const runner = createCliConfigRunner({ starter: st, helperPath: HELPER, home, timeoutMs: 150, journal: () => {}, warn: () => {} });
  const S = mkSync(modPath, home, { runner, statusMs: 3000, statusFreshMs: 0 });
  runner.homeRead(() => new Promise(() => {}), 50);   // a read of the home that never answers: counted out past the run's bound
  for (let i = 0; i < 100 && !runner.homeStuck(); i++) await new Promise((r) => setTimeout(r, 20));
  const r = await S.cliConfigStatus();
  return { r, runs: st.runs, stuck: runner.homeStuck(), k: (r && r.receipts || []).find((x) => x.key === NEEDLE) };
}
const s8 = await stuckLeg(path.join(REPO, SYNC_REL));
ok(!!(s8.stuck === 1 && s8.runs === 0 && s8.r && s8.r.unreadCode === 'home-stuck' && s8.k && s8.k.reason === 'not-known-now'), '⑧ the runner holds a read of the home out: the status starts no helper and says «not known now» by its code', { stuck: s8.stuck, runs: s8.runs, code: s8.r && s8.r.unreadCode });
const NO_GUARD = MC.write(SYNC_REL, anchored(src(SYNC_REL), "if (stuck > 0) return Promise.resolve({ held: true, code: 'home-stuck'", "if (false) return Promise.resolve({ held: true, code: 'home-stuck'", 'the runner\'s guard'), 'status-no-guard');
const r8 = await stuckLeg(NO_GUARD);
ok(!!(r8.runs === 1), 'RED (the runner\'s guard not asked): a status helper starts on a home held stuck', { runs: r8.runs });

// ── ⑨ a starter that is down: «the read failed», a backoff that ENDS ──
console.log('⑨ A STARTER THAT IS DOWN: «not known now — the read failed», no new helper for the backoff, and the backoff ENDS');
async function recoverLeg(modPath) {
  let down = true;
  const st = { runs: 0, run: (cmd, args) => { if (!args.includes('--status')) return Promise.resolve({ started: true, code: 0, stdout: '', stderr: '' }); st.runs++; return Promise.resolve(down ? { unknown: true, why: 'a planted starter that is down' } : { started: true, code: 0, stdout: cfg('applied'), stderr: '' }); } };
  const S = mkHand(modPath, st, { statusMs: 3000, statusFreshMs: 0, statusBackoffMs: 300 });
  const a = await S.cliConfigStatus(), b = await S.cliConfigStatus();
  const runsB = st.runs;
  down = false; await new Promise((r) => setTimeout(r, 450));
  const c = await S.cliConfigStatus();
  const kOf = (x) => (x && x.receipts || []).find((r) => r.key === NEEDLE);
  return { a, b, c, runsB, runs: st.runs, ka: kOf(a), kc: kOf(c) };
}
const s9 = await recoverLeg(path.join(REPO, SYNC_REL));
ok(!!(s9.a && s9.a.unreadCode === 'starter-unknown' && s9.ka && s9.ka.reason === 'not-read' && s9.b && s9.b.unreadCode === 'backoff' && s9.runsB === 1 && s9.c && s9.c.unread === null && s9.kc && s9.kc.state === 'applied' && s9.runs === 2),
  '⑨ a starter that is down: «the read failed» (never «did not answer in time»), the backoff asks no helper, and once it ends a look reads fresh', { a: s9.a && s9.a.unreadCode, b: s9.b && s9.b.unreadCode, runsB: s9.runsB, runs: s9.runs, kc: s9.kc });
const NEVER_ENDS = MC.write(SYNC_REL, anchored(src(SYNC_REL), 'if (statusBackoff && mono() < statusBackoff.until) return', 'if (statusBackoff) return', 'a backoff that never ends'), 'status-backoff-forever');
const r9 = await recoverLeg(NEVER_ENDS);
ok(!!(r9.c && r9.c.unreadCode === 'backoff'), 'RED (a backoff that never ends): the home answers again and the status still says «not known now»', { c: r9.c && r9.c.unreadCode });

// ── ⑪ a status child that outlives its kill ──
console.log('⑪ r3784 (2): A STATUS CHILD THE STARTER ENDED AT ITS BOUND BUT THAT HAS NOT EXITED (a hung mount) IS STILL COUNTED');
async function lateLeg(modPath) {
  const lates = [];
  const st = { runs: 0, run: (cmd, args, o = {}) => { if (!args.includes('--status')) return Promise.resolve({ started: true, code: 0, stdout: '', stderr: '' }); st.runs++; if (o.onLateExit) lates.push(o.onLateExit); return Promise.resolve({ timedOut: true }); } };
  const S = mkHand(modPath, st, { statusMs: 3000, statusFreshMs: 0, statusBackoffMs: 50 });
  const a = await S.cliConfigStatus();
  await new Promise((r) => setTimeout(r, 150));   // the backoff is over; the child has not exited
  const b = await S.cliConfigStatus();
  const runsB = st.runs;
  for (const f of lates.splice(0)) f();   // it exits at last
  await new Promise((r) => setTimeout(r, 150));
  const c = await S.cliConfigStatus();
  return { a, b, c, runsB, runs: st.runs };
}
const s11 = await lateLeg(path.join(REPO, SYNC_REL));
ok(!!(s11.a && s11.a.unreadCode === 'timed-out' && s11.b && s11.b.unreadCode === 'status-out' && s11.runsB === 1 && s11.runs === 2), '⑪ after the backoff, a child that has not exited still holds the next look («not known now», by its code: no second helper); once it exits a new read starts', { a: s11.a && s11.a.unreadCode, b: s11.b && s11.b.unreadCode, runsB: s11.runsB, runs: s11.runs });
const NO_LATE = MC.write(SYNC_REL, anchored(src(SYNC_REL), 'if (statusOut > 0 || statusLate > 0) return Promise.resolve(', 'if (statusOut > 0) return Promise.resolve(', 'the late child not counted'), 'status-no-late');
const r11 = await lateLeg(NO_LATE);
ok(!!(r11.runsB === 2), 'RED (a child that outlives its kill not counted): a second helper starts beside it once the backoff ends', { runsB: r11.runsB });

// ── ⑩ the secret lens ──
console.log('⑩ r3784 (4): THE SECRET LENS — no piece of a value in a hand-broken file reaches a chip, the route\'s error, the journal or a paired machine\'s words');
const rnd = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'kqzv';
const VALUE = ['qx', 'vsmadeup', rnd, 'zpqw'].join('');   // built at run time: never a literal in the tree
const LENS_PIECES = Array.from({ length: VALUE.length - 4 }, (_, k) => VALUE.slice(k, k + 5));   // every 5-character piece
async function lensLeg(helperPath) {
  const home = mkHome(`home-lens-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), `{"${VALUE}": "${VALUE}" "cleanupPeriodDays": 36500}`);   // broken JSON, the value first and AT the error (a parser's snippet would hold it)
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(home, '.codex', 'config.toml'), `${VALUE}\n[history]\npersistence = "save-all"\n`);   // line 1 not a key/value (the TOML road), the value first
  const said = [], runs = { n: 0 };
  const runner = createCliConfigRunner({ starter: realStarter(runs), helperPath, home, journal: (l) => said.push(String(l)), warn: (l) => said.push(String(l)) });
  const S = mkSync(path.join(REPO, SYNC_REL), home, { runner, statusMs: 20000, log: (l) => said.push(String(l)), warn: (l) => said.push(String(l)) });
  const land = await S.applyThisMachine({ reason: 'boot' });   // the apply road: the applier's own refusals
  const st = await S.cliConfigStatus();   // the status road: the reader's own words
  const body = await applyRoute(S);
  const CH = await import(pathToFileURL(path.join(REPO, 'src/lib/cli-config-chips.js')).href);
  const tt = (x, p) => String(x).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m));
  const chips = (st.receipts || []).map((r) => CH.receiptLine(r, { t: tt, where: 'this machine' }).text);
  const remote = require(path.join(REPO, 'src/hosts.js')).HostManager.installNotLanded(land.receipts || [], { hooks: [] });   // a paired machine's words
  const texts = [...said, ...chips, (body && body.error) || '', JSON.stringify((body && body.cliConfig) || {}), JSON.stringify(st.receipts || []), st.unread || '', JSON.stringify(land.receipts || []), land.why || '', ...remote];
  const leaks = texts.filter((t) => LENS_PIECES.some((p) => String(t).includes(p)));
  return { leaks: leaks.map((t) => String(t).slice(0, 160)), n: texts.length, refused: (land.receipts || []).filter((x) => x.state === 'refused').length, unreadable: (st.receipts || []).filter((x) => x.state === 'unreadable').length };
}
const lens = await lensLeg(HELPER);
ok(!!(lens.leaks.length === 0 && lens.refused >= 2 && lens.unreadable >= 2 && lens.n >= 6), '⑩ the JSON and the TOML road, a hand-broken file holding a made-up value: the apply refuses both files and the status reads them unreadable — and no piece of the value is in any chip, the route\'s error, a journal line or the paired machine\'s words', { leaks: lens.leaks, refused: lens.refused, unreadable: lens.unreadable, n: lens.n });
const HELPER_REL = 'data/bin/vibespace-hook-register.mjs';
const LEAK_JSON = MC.write(HELPER_REL, anchored(src(HELPER_REL), 'exists but is not valid JSON — not touching it`); } }', 'exists but is not valid JSON — not touching it: ${text.slice(0, 120)}`); } }', 'the JSON refusal echoing the file'), 'helper-leak-json');
const rj = await lensLeg(LEAK_JSON);
ok(!!(rj.leaks.length > 0), 'RED (the JSON refusal echoes the file\'s text): the value reaches the journal and the words', { leaks: rj.leaks.length });
const LEAK_TOML = MC.write(HELPER_REL, anchored(src(HELPER_REL), 'return { error: `line ${n + 1}: not a key/value, table header or comment` };', 'return { error: `line ${n + 1}: not a key/value (${line.trim().slice(0, 60)})` };', 'the TOML tokenizer echoing the line'), 'helper-leak-toml');
const rt = await lensLeg(LEAK_TOML);
ok(!!(rt.leaks.length > 0), 'RED (the TOML tokenizer echoes the line): the value reaches a chip and the journal', { leaks: rt.leaks.length });

// ── ③ the words ──
console.log('③ THE WORDS');
{
  const CH = await import(pathToFileURL(path.join(REPO, 'src/lib/cli-config-chips.js')).href);
  const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? String(p[k]) : m));
  const tEn = (s, p) => fill(s, p);
  const line = CH.receiptLine({ harness: 'claude', key: NEEDLE, rel: '.claude/settings.json', path: 'cleanupPeriodDays', state: 'unknown', reason: 'not-known-now', readAt: Date.now() - 5 * 60000 }, { t: tEn, where: 'this machine' });
  const none = CH.receiptLine({ harness: 'claude', key: NEEDLE, rel: '.claude/settings.json', path: 'cleanupPeriodDays', state: 'unknown', reason: 'not-known-now', readAt: null }, { t: tEn, where: 'this machine' });
  const nr = CH.receiptLine({ harness: 'claude', key: NEEDLE, rel: '.claude/settings.json', path: 'cleanupPeriodDays', state: 'unknown', reason: 'not-read', readAt: null }, { t: tEn, where: 'this machine' });
  const zh = src('src/lib/i18n-zh.js'), ja = src('src/lib/i18n-ja.js'), KEYS = ['not known now — the file did not answer in time', 'last read {ago}', 'not known now — the read of the file failed'];
  ok(line.tone === 'warn' && line.text === '? this machine: ~/.claude/settings.json → cleanupPeriodDays not known now — the file did not answer in time · last read 5 min ago' && none.text === '? this machine: ~/.claude/settings.json → cleanupPeriodDays not known now — the file did not answer in time' && nr.text === '? this machine: ~/.claude/settings.json → cleanupPeriodDays not known now — the read of the file failed'
      && KEYS.every((k) => zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')),
    '③ the chips say «not known now — the file did not answer in time» (or «… the read of the file failed») and when it was last read; the words in zh and ja', { line: line.text, none: none.text });
  console.log(`    «${line.text}»`);
}

clearInterval(KEEP);
report();
