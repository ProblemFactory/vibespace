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
const OLD_READ = MC.write(SYNC_REL, anchored(src(SYNC_REL), '    const plan = cliConfigPlan();\n    const r = !cliRunner', `    const plan = cliConfigPlan();\n    try { require(${JSON.stringify(path.join(REPO, 'src/harness-config.js'))}).readConfigPlan(plan, { home }); } catch { }\n    const r = !cliRunner`, 'the release\'s in-process read'), 'status-in-process');
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
const NO_BOUND = MC.write(SYNC_REL, anchored(src(SYNC_REL), "const t = setTimeout(() => resolve({ timedOut: true, why: `the helper's read of this machine's files did not answer within ${ms} ms` }), ms);", 'const t = setTimeout(() => {}, ms);', 'the status\'s bound'), 'status-no-bound');
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
ok(!!(sh.first && /^not known now/.test(sh.first.unread || '') && sh.second && sh.second.unread === null && k2 && k2.state === 'applied' && typeof sh.second.readAt === 'number'),
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
  const pb = S.cliConfigStatus({ ms: 3000 });
  await new Promise((r) => setTimeout(r, 60));
  const runs = st.runs;
  if (st.held[0]) st.held[0]({ started: true, code: 0, stdout: cfg('missing'), stderr: '' });   // read 1: the files BEFORE the write
  if (st.held[1]) st.held[1]({ started: true, code: 0, stdout: cfg('applied'), stderr: '' });   // read 2: after it
  const b = await pb;
  return { a, runs, b: (b && b.receipts || []).find((r) => r.key === NEEDLE) };
}
const lg = await landingLeg(path.join(REPO, SYNC_REL));
ok(!!(lg.a && /^not known now/.test(lg.a.unread || '') && lg.runs === 2 && lg.b && lg.b.state === 'applied'),
  '④ the status asked after a landing starts its own read (two helper reads) and answers what the files are AFTER the write', { runs: lg.runs, receipt: lg.b });
const JOIN_ALL = MC.write(SYNC_REL, anchored(src(SYNC_REL), 'if (statusFlight && statusFlight.startedAt >= landedAt()) return statusFlight.p;', 'if (statusFlight) return statusFlight.p;', 'the landing\'s fence on the shared read'), 'status-join-all');
const redJ = await landingLeg(JOIN_ALL);
ok(!!(redJ.b && redJ.b.state === 'missing' && redJ.runs === 1), 'RED (every caller joins the read in flight): the status after a write answers the files BEFORE it («missing»)', { runs: redJ.runs, receipt: redJ.b });

// ── ⑤ the helper's own failure line is no fresh receipt ──
console.log('⑤ THE HELPER\'s OWN FAILURE LINE (CFG|*|) IS NO FRESH RECEIPT');
async function wholeLeg(modPath) {
  const st = handStarter(() => Promise.resolve({ started: true, code: 0, stdout: 'CFG|*|*|error|the helper could not load its plan', stderr: '' }));
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
  const st = handStarter(() => Promise.resolve({ timedOut: true }));   // the starter ended the helper past its bound
  const S = mkHand(modPath, st, { statusMs: 3000, statusFreshMs: 0 });
  const a = await S.cliConfigStatus(), b = await S.cliConfigStatus(), c = await S.cliConfigStatus();
  return { a, b, c, runs: st.runs };
}
const bo = await backoffLeg(path.join(REPO, SYNC_REL)), kb = (bo.c && bo.c.receipts || []).find((r) => r.key === NEEDLE);
ok(!!(bo.runs === 1 && /^not known now — the helper ran past its/.test(bo.a.unread || '') && /^not known now — an earlier read of this machine's files did not finish within the helper's bound — the next read is asked in \d+ s$/.test(bo.c.unread || '') && kb && kb.reason === 'not-known-now'),
  '⑥ after a read the helper did not finish within its bound, the next looks ask no new helper (one run for three looks) and say so by name', { runs: bo.runs, a: bo.a.unread, c: bo.c.unread });
const NO_BACKOFF = MC.write(SYNC_REL, anchored(src(SYNC_REL), "else if (r && /ran past its|did not answer/.test(String(r.why || ''))) statusBackoffUntil = Date.now() + STATUS_BACKOFF_MS;", '', 'the backoff'), 'status-no-backoff');
const redO = await backoffLeg(NO_BACKOFF);
ok(redO.runs === 3, 'RED (a new helper at every look): three looks start three helpers', { runs: redO.runs });

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
