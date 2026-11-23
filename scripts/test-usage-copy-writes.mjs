#!/usr/bin/env node
// test-usage-copy-writes — TWO USAGE COPIES WRITTEN OFF THE LOOP (B-360d part 3 U2, 主开发 r1444 / r1459).
//  ① THE READING ARCHIVE'S ROLL IS A RENAME (src/archive-roll.js): past its bound the live archive is renamed to a per-day
//     shard — nothing read or rewritten on the loop; a shard that exists is never written over (the next number); the bytes
//     move whole. RED: the release's roll planted back (a whole read, an append, an empty write).
//  ② the pool engine's archive goes through it (source pin: no whole read of the archive left in the engine)
//  ③ data/usage-cache.json (a DERIVED copy: the boot's seed of the machine login's reading) is written by the STORE WRITER:
//     the REAL setupUsage's first ingestion makes no synchronous write of it, and the bytes it lands are the release's
//     (`{claude}` pretty-printed). RED: the release's writeUsageCache planted back (a write and a rename on the loop).
//  ④ ITS OTHER WRITER, the identity repair (src/reading-repair.js repairGlobalFile), judges the copy MEMORY holds: a write
//     still owed lands first. RED: the repair without that flush judges the stale disk.
//  ⑤ ITS RELOAD (reloadRateLimitCache: the boot's, the hourly and the person's identity repair call it) keeps memory while a
//     write of the copy is OWED (r2335): the owed write lands the newer reading, never the older file's. The folder no longer
//     holding the reading stands in for the active poll's road (its reading lives in memory and this copy alone). RED: the
//     release's reload reads the older file over memory and the owed write lands it.
//  ⑥ A REPAIR'S VERDICT OUTRANKS MEMORY (r2430): when the identity repair REPLACED or EMPTIED the machine login's reading in the
//     folder (its report's row for __global__), the reload takes the folder's own state for it — the repaired reading, or none —
//     whatever the times say, and the copy (the boot's seed) follows ({ claude: null } for none); with no such verdict nothing
//     moves. The repair's write is the product's own road (the file, then the write path's notice with replace). RED: the reload
//     without the verdict keeps the reading the repair judged another account's.
//  ⑦ r2933: AFTER A VERDICT NO READER OF THAT MEMORY HOLDS THE JUDGED READING — a LINKED account with no dated file of its own
//     (the same-account merge put the judged reading on its row): replaced, emptied and stripped — the judged reading on neither
//     row and not in the copy, nor after a restart from that copy. RED: today's reload (the linked row kept: the merge puts it back).
//     PIN: the three callers hand their report.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratch('usage-copy-writes');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const { ok, report } = checker();
const M = mutantCopies('usage-copy-writes', REPO);
const quiet = async (fn) => { const o = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => { }; try { return await fn(); } finally { [console.log, console.warn, console.error] = o; } };

// THE COUNTER: every synchronous fs call on a path under `dir`, by name
const CALLS = ['statSync', 'existsSync', 'readFileSync', 'openSync', 'readSync', 'appendFileSync', 'writeFileSync', 'renameSync', 'mkdirSync', 'copyFileSync', 'truncateSync'];
async function counting(dir, fn) {
  const real = {}, seen = [];
  for (const k of CALLS) { real[k] = fs[k]; fs[k] = function (p0, ...a) { if (typeof p0 === 'string' && path.resolve(p0).startsWith(dir)) seen.push(k); return real[k].call(this, p0, ...a); }; }
  try { await fn(); } finally { for (const k of CALLS) fs[k] = real[k]; }
  return seen;
}
const n = (calls, k) => calls.filter((c) => c === k).length;

// ═══ ① the roll by rename ═══
console.log('— ① the reading archive\'s roll is a rename');
const ROLL_SRC = fs.readFileSync(path.join(REPO, 'src/archive-roll.js'), 'utf8');
const AR = require(path.join(REPO, 'src/archive-roll.js'));
const MB5 = 5 * 1024 * 1024;
const T = Date.parse('2026-11-21T12:00:00Z');
const rollWorld = () => { const dir = fs.mkdtempSync(path.join(ROOT, 'arch-')), f = path.join(dir, 'readings-window-mismatch.ndjson'); fs.writeFileSync(f, Buffer.alloc(MB5 + 17, 0x61)); return { dir, f }; };
{
  const { dir, f } = rollWorld();
  const before = fs.readFileSync(f);
  let shard = null;
  const calls = await counting(dir, () => { shard = AR.rollIfOver(f, MB5, { now: T }); });
  const want = path.join(dir, 'readings-window-mismatch-20261121.ndjson');
  ok(shard === want && !fs.existsSync(f) && fs.readFileSync(want).equals(before) && n(calls, 'readFileSync') === 0 && n(calls, 'writeFileSync') === 0 && n(calls, 'appendFileSync') === 0 && n(calls, 'renameSync') === 1, `① past 5 MB the live archive is RENAMED to its day's shard, its bytes whole — its calls: ${calls.join(' + ')}`, { shard, calls });
  fs.writeFileSync(f, Buffer.alloc(MB5 + 3, 0x62));
  const shard2 = AR.rollIfOver(f, MB5, { now: T });
  ok(shard2 === path.join(dir, 'readings-window-mismatch-20261121-2.ndjson') && fs.readFileSync(want).equals(before) && fs.statSync(shard2).size === MB5 + 3, '① a second roll the same day takes the next number: the first shard is never written over');
  fs.writeFileSync(f, 'a line\n');
  ok(AR.rollIfOver(f, MB5, { now: T }) === null && fs.readFileSync(f, 'utf8') === 'a line\n' && AR.rollIfOver(path.join(dir, 'none.ndjson'), MB5) === null, '① under the bound, or no file: nothing moves');
}
{
  // RED: the release's roll planted back in a copy — a whole read, an append of those bytes, an empty write
  const rel = M.load('src/archive-roll.js', anchored(ROLL_SRC, '    fs.renameSync(file, shard);\n', "    fs.appendFileSync(`${base}.ndjson`, fs.readFileSync(file)); fs.writeFileSync(file, '');\n", 'the release roll'), 'release-roll');
  const { dir, f } = rollWorld();
  const calls = await counting(dir, () => { rel.rollIfOver(f, MB5, { now: T }); });
  ok(n(calls, 'readFileSync') === 1 && n(calls, 'appendFileSync') === 1 && n(calls, 'writeFileSync') >= 1, `① RED CONTROL the release's roll: a whole read, an append and an empty write on the loop (${calls.join(' + ')})`, calls);
}
// ═══ ② the engine's archive goes through it ═══
console.log('\n— ② the pool engine\'s archive goes through the roll');
{
  const eng = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
  const fn = eng.slice(eng.indexOf('function appendReadingArchive('), eng.indexOf('function guardReadingTarget('));
  ok(fn.includes("require('../archive-roll.js').rollIfOver(READING_ARCHIVE, 5 * 1024 * 1024)") && !/fs\.readFileSync\(READING_ARCHIVE\)/.test(eng) && /fs\.appendFileSync\(READING_ARCHIVE, /.test(fn), '② appendReadingArchive rolls through rollIfOver, reads no archive whole, and appends its line as before (the line stays synchronous)', fn.slice(0, 200));   // stale-pins: kept (the release roll's whole read — its absence is the leg)
}
// ═══ ③ data/usage-cache.json through the store writer ═══
console.log('\n— ③ data/usage-cache.json is written by the store writer');
const { storeWriter } = require(path.join(REPO, 'src/store-writer.js'));
const ROUTES_SRC = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf8');
const usageWorld = () => {
  const dd = fs.mkdtempSync(path.join(ROOT, 'usage-')), cacheDir = path.join(dd, 'usage-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const g = { fetchedAt: T, source: 'statusline', fiveHour: { utilization: 0.31, resetsAt: Math.floor(T / 1000) + 3600 }, sevenDay: { utilization: 0.12, resetsAt: Math.floor(T / 1000) + 3 * 86400 } };
  fs.writeFileSync(path.join(cacheDir, '__global__.json'), JSON.stringify(g));
  return { dd, cacheDir, file: path.join(dd, 'usage-cache.json'), g };
};
const setup = async (routesMod, w, { more = null, handlers = null } = {}) => {
  const app = { get(p, fn) { if (handlers) handlers['GET ' + p] = fn; }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const accounts0 = { list: () => ({ accounts: [] }), decisionList: () => ({ accounts: [] }), decisionRowOf: () => null, displayReaderOf: () => null, signinFactsSettled: async () => null, signinFactsNow: async () => null, codexGlobalStatus: () => ({ loggedIn: false, email: null }), subscriptionStatus: () => ({ loggedIn: false, email: null }), subCredsPath: () => path.join(w.dd, 'none', '.credentials.json'), usageToken: () => null };   // + the root's account doors (B-360d accounts list: the decision rows, the sign-in facts' settle)
  const accounts = more ? { ...accounts0, ...more } : accounts0;   // r2933: a leg's own accounts (a linked one)
  const realSetInterval = globalThis.setInterval;
  globalThis.setInterval = () => ({ unref() { }, ref() { } });
  try {
    return await quiet(() => routesMod.setupUsage({
      app, accounts, hosts: { list: () => [] }, usageHistory: null, activeSessions: new Map(), serverSetting: () => false, ensureDir: (x) => fs.mkdirSync(x, { recursive: true }),
      USAGE_CACHE_FILE: w.file, USAGE_CACHE_DIR: w.cacheDir, CODEX_SESSIONS_DIR: path.join(w.dd, 'codex'), META_DIR: path.join(w.dd, 'meta'),
      AVAILABLE_MODELS: { claude: [] }, BUFFERS_DIR: path.join(w.dd, 'buffers'), probeUsageForAccountKey: null, CLAUDE_CMD: '/bin/false',
    }));
  } finally { globalThis.setInterval = realSetInterval; }
};
{
  const w = usageWorld();
  const calls = await counting(w.dd, () => setup(require(path.join(REPO, 'src/usage-routes.js')), w));
  const owed = !!(storeWriter().pending && storeWriter().pending(w.file));
  ok(n(calls, 'writeFileSync') === 0 && n(calls, 'renameSync') === 0, `③ the first ingestion writes no copy on the loop (${n(calls, 'writeFileSync')} writes, ${n(calls, 'renameSync')} renames of it; owed to the writer: ${owed})`, calls);
  storeWriter().flushSync([w.file]);
  let landed = null; try { landed = fs.readFileSync(w.file, 'utf8'); } catch { landed = null; }
  const want = JSON.stringify({ claude: JSON.parse(landed || 'null')?.claude || null }, null, 2);
  ok(landed !== null && landed === want && JSON.parse(landed).claude.fetchedAt === T && JSON.parse(landed).claude.sevenDay.utilization === 0.12, '③ the writer lands the copy the release wrote: `{claude}` pretty-printed, the reading the ingestion took', (landed || '').slice(0, 200));
}
{
  // RED: the release's writeUsageCache planted back in a copy of the routes
  const relBody = "  try {\n    ensureDir(path.dirname(USAGE_CACHE_FILE));\n    const tmpPath = `${USAGE_CACHE_FILE}.tmp`;\n    fs.writeFileSync(tmpPath, JSON.stringify({ claude: _rateLimitCache }, null, 2));\n    fs.renameSync(tmpPath, USAGE_CACHE_FILE);\n  } catch {}\n";   // stale-pins: kept (the release writeUsageCache — the red control's body)
  const cureBody = "  try {\n    require('./store-writer.js').storeWriter().dirty(USAGE_CACHE_FILE, { name: 'usage-cache.write', makeDir: true, produce: () => (_rateLimitCache ? JSON.stringify({ claude: _rateLimitCache }, null, 2) : null) });\n  } catch {}\n";
  const Rel = M.load('src/usage-routes.js', anchored(ROUTES_SRC, cureBody, relBody, 'the release writeUsageCache'), 'release-routes');
  const w = usageWorld();
  const calls = await counting(w.dd, () => setup(Rel, w));
  ok(n(calls, 'writeFileSync') >= 1 && n(calls, 'renameSync') >= 1, `③ RED CONTROL the release's writeUsageCache: the copy written and renamed on the loop (${n(calls, 'writeFileSync')} + ${n(calls, 'renameSync')})`, calls);
}
// ═══ ④ the repair judges the copy memory holds ═══
console.log('\n— ④ the identity repair judges the copy memory holds');
const RR_SRC = fs.readFileSync(path.join(REPO, 'src/reading-repair.js'), 'utf8');
const owedCopy = () => {
  const w = usageWorld();
  storeWriter().dirty(w.file, { name: 'usage-cache.write', makeDir: true, produce: () => JSON.stringify({ claude: w.g }, null, 2) });
  return w;
};
const judge = (mod, w) => mod.repairGlobalFile({ dataDir: w.dd, cacheDir: w.cacheDir, archiveDir: path.join(w.dd, 'archive'), windows: new Map(), accounts: [], id: 'test-u2', now: T });
{
  const w = owedCopy();
  const r = judge(require(path.join(REPO, 'src/reading-repair.js')), w);
  ok(r.state === 'unresolvable' && fs.existsSync(w.file), `④ a copy still owed to the writer lands first: the repair judges it (${r.state}), never the stale disk`, r);
}
{
  const Cut = M.load('src/reading-repair.js', anchored(RR_SRC, "  try { require('./store-writer.js').storeWriter().flushSync([f], { waitedBy: 'the identity repair (usage-cache.json)' }); } catch { }\n", '', 'the repair without its flush'), 'repair-no-flush');
  const w = owedCopy();
  const r = judge(Cut, w);
  ok(r.state === 'absent', `④ RED CONTROL the repair without its flush judges the stale disk: «${r.state}» while memory holds a copy`, r);
  storeWriter().flushSync([w.file]);
}
// ═══ ⑤ the reload keeps memory while a write of the copy is owed (r2335) ═══
console.log('\n— ⑤ the reload keeps memory while a write of the copy is owed');
const UCF = require(path.join(REPO, 'src/usage-cache-folder.js'));
const RELOAD_CURE = "  let owed = false; try { owed = require('./store-writer.js').storeWriter().pending(USAGE_CACHE_FILE); } catch { } if (!owed) _rateLimitCache = readUsageCache(); ingestPassiveUsage();\n";
const RELOAD_REL = "  _rateLimitCache = readUsageCache(); ingestPassiveUsage();\n";   // stale-pins: kept (the release reload)
// the folder's reader answers in microtasks (its fsp hook): its fresh read lands before the store writer's next turn, the write stays owed
const nowFsp = { readdir: async (d) => fs.readdirSync(d), readFile: async (f, e) => fs.readFileSync(f, e) };
const reloadWorld = async (routesMod) => {
  const w = usageWorld();
  const older = { ...w.g, fetchedAt: T - 36e5, fiveHour: { ...w.g.fiveHour, utilization: 0.05 } };
  fs.writeFileSync(w.file, JSON.stringify({ claude: older }, null, 2));
  const reader = UCF.forDir(w.cacheDir, { fsp: nowFsp });   // the one reader setupUsage asks for (one per folder)
  const api = await setup(routesMod, w);                       // memory: the folder's newer reading; its copy's write OWED
  fs.rmSync(path.join(w.cacheDir, '__global__.json'));         // the folder no longer holds it: memory and the owed copy alone
  await quiet(() => reader.fresh({ waitMs: 0 }));            // a read that STARTS after the removal (setup's own read is in flight)
  const owed = storeWriter().pending(w.file);
  await quiet(() => api.reloadRateLimitCache());
  storeWriter().flushSync([w.file]);
  let landed = null; try { landed = JSON.parse(fs.readFileSync(w.file, 'utf8')).claude; } catch { landed = null; }
  return { owed, at: landed ? landed.fetchedAt : null, five: landed && landed.fiveHour ? landed.fiveHour.utilization : null };
};
const which = (at) => (at === T ? 'the newer reading' : at === T - 36e5 ? 'the OLDER file' : String(at));
{
  const r = await reloadWorld(require(path.join(REPO, 'src/usage-routes.js')));
  ok(r.owed === true && r.at === T && r.five === 0.31, `⑤ a reload while the copy's write is owed keeps memory: the owed write lands the newer reading (owed: ${r.owed}; landed: ${which(r.at)})`, r);
}
{
  const Rel = M.load('src/usage-routes.js', anchored(ROUTES_SRC, RELOAD_CURE, RELOAD_REL, 'the release reload'), 'release-reload');
  const r = await reloadWorld(Rel);
  ok(r.owed === true && r.at === T - 36e5 && r.five === 0.05, `⑤ RED CONTROL the release's reload reads the older file over memory and the owed write lands it (owed: ${r.owed}; landed: ${which(r.at)})`, r);
}
// ═══ ⑥ a repair's verdict outranks memory (r2430) ═══
console.log('\n— ⑥ a repair\'s verdict for the machine login\'s reading outranks memory');
const UW = require(path.join(REPO, 'src/usage-cache-write.js'));
const VERDICT = "  if (repairedGlobal(rep) && !held) {\n";
const S0 = Math.floor(T / 1000);
const REPAIRED = { fetchedAt: T - 72e5, source: 'statusline', fiveHour: { utilization: 0.07, resetsAt: S0 + 1800 }, sevenDay: { utilization: 0.04, resetsAt: S0 + 5 * 86400 }, repairedBy: 'identity-repair:manual' };
const EMPTIED = { orgUuid: 'org-own', emptiedReason: 'no anchor of the machine login agrees with its API-derived window', repairedBy: 'identity-repair:manual' };
// memory holds the folder's reading (the one the repair judges another account's) and its copy is on disk; then the repair
// writes the folder's file its own way and hands its report to the reload
const verdictWorld = async (routesMod, repaired, cache) => {
  const w = usageWorld();
  const api = await setup(routesMod, w);
  storeWriter().flushSync([w.file]);
  const f = path.join(w.cacheDir, '__global__.json'), text = JSON.stringify(repaired);
  fs.writeFileSync(f, text); UW.noteWritten(f, text, { replace: true });
  await quiet(() => api.reloadRateLimitCache({ identities: [{ key: '__global__', cache }] }));
  storeWriter().flushSync([w.file]);
  let doc = null; try { doc = JSON.parse(fs.readFileSync(w.file, 'utf8')); } catch { doc = null; }
  return { copy: doc ? doc.claude : undefined, at: doc && doc.claude ? doc.claude.fetchedAt : null };
};
const w0g = () => ({ fetchedAt: T, source: 'statusline', fiveHour: { utilization: 0.31, resetsAt: S0 + 3600 } });   // the world's reading, its stamp kept (a strip keeps it)
const said = (r) => (r.copy === null ? 'none' : r.at === T ? 'the reading the repair judged (newer)' : r.at === T - 72e5 ? 'the repaired reading' : String(r.at));
{
  const ROUTES = require(path.join(REPO, 'src/usage-routes.js'));
  const a = await verdictWorld(ROUTES, REPAIRED, 'replaced');
  ok(!!(a.at === T - 72e5 && a.copy && a.copy.sevenDay && a.copy.sevenDay.utilization === 0.04), `⑥ REPLACED: memory takes the repaired reading although it is older, and its copy follows (memory, as its copy lands it: ${said(a)})`, a);
  const b = await verdictWorld(ROUTES, EMPTIED, 'emptied');
  ok(!!(b.copy === null), `⑥ EMPTIED: memory states no reading and its copy says none ({ claude: null }) — a restart seeds nothing back (${said(b)})`, b);
  const st = await verdictWorld(ROUTES, { ...w0g(), sevenDay: { utilization: 0.12, resetsAt: S0 + 3 * 86400 }, repairedBy: 'identity-repair:manual' }, 'stripped');
  ok(!!(st.at === T && st.copy && st.copy.repairedBy === 'identity-repair:manual'), `⑥ STRIPPED (the same stamp, a bucket taken away): memory takes the folder's stripped reading and its copy follows (${said(st)})`, st);
  const c = await verdictWorld(ROUTES, REPAIRED, 'kept');
  ok(!!(c.at === T), `⑥ NO VERDICT for the machine login (kept): nothing moves — memory keeps its newer reading over an older folder one (${said(c)})`, c);
}
{
  const NoVerdict = M.load('src/usage-routes.js', anchored(ROUTES_SRC, VERDICT, '  if (false) {\n', 'the reload without the repair verdict'), 'no-verdict');
  const r = await verdictWorld(NoVerdict, REPAIRED, 'replaced');
  ok(!!(r.at === T), `⑥ RED CONTROL the reload without the verdict: the reading the repair judged another account's stays in memory and in its copy (${said(r)})`, r);
}
// ═══ ⑦ r2933: AFTER A VERDICT NO READER OF THAT MEMORY HOLDS THE JUDGED READING — a LINKED account with no dated file of its own ═══
console.log('\n— ⑦ a linked account with no dated file of its own: the judged reading leaves both rows and the copy');
const X = { id: 'sub-x', name: 'Xavier', email: 'x@example.test', type: 'subscription', backend: 'claude' };
const LINKED = { list: () => ({ accounts: [X] }), decisionList: () => ({ accounts: [X] }), subscriptionStatus: () => ({ loggedIn: true, email: 'x@example.test' }), get: (id) => (id === X.id ? X : null) };
const ALIEN = { name: 'alien', resetsAt: S0 + 2 * 86400 }, OWN = { name: 'own', resetsAt: S0 + 5 * 86400 };
const JUDGED = { fetchedAt: T, source: 'statusline', fiveHour: { utilization: 0.31, resetsAt: S0 + 3600 }, sevenDay: { utilization: 0.12, resetsAt: S0 + 3 * 86400 }, scopedWeekly: [OWN, ALIEN] };
const VERDICTS = { replaced: REPAIRED, emptied: EMPTIED, stripped: { ...JUDGED, scopedWeekly: [OWN], repairedBy: 'identity-repair:manual' } };
const getUsage = async (handlers) => { const res = { body: null, json(b) { this.body = b; return this; }, status() { return this; }, set() { return this; }, send() { return this; }, end() { return this; }, setHeader() { } }; await quiet(() => handlers['GET /api/usage']({ query: {}, headers: {}, params: {} }, res)); return res.body || {}; };
const alien = (x) => JSON.stringify(x || null).includes('"alien"');
const linkedWorld = async (routesMod, cache) => {
  const w = usageWorld();
  const g = path.join(w.cacheDir, '__global__.json');
  fs.writeFileSync(g, JSON.stringify(JUDGED)); UW.noteWritten(g, JSON.stringify(JUDGED), { replace: true });   // the machine login's reading (another account's)
  const h1 = {};
  const api = await setup(routesMod, w, { more: LINKED, handlers: h1 });
  const before = await getUsage(h1);
  storeWriter().flushSync([w.file]);
  const text = JSON.stringify(VERDICTS[cache]);
  fs.writeFileSync(g, text); UW.noteWritten(g, text, { replace: true });   // the identity repair's own write (the folder's file, replace)
  await quiet(() => api.reloadRateLimitCache({ identities: [{ key: '__global__', cache }] }));
  const after = await getUsage(h1);
  storeWriter().flushSync([w.file]);   // every write the reload and its ingestion owe the copy lands before it is read
  let copy = null; try { copy = JSON.parse(fs.readFileSync(w.file, 'utf8')); } catch { copy = null; }
  const h2 = {};
  await setup(routesMod, w, { more: LINKED, handlers: h2 });   // A RESTART from that copy (the same data folder)
  const restart = await getUsage(h2);
  return { before: { login: alien(before.rateLimit), linked: alien(before.accounts && before.accounts[X.id]) }, after: { login: alien(after.rateLimit), linked: alien(after.accounts && after.accounts[X.id]) }, copy: alien(copy), restart: { login: alien(restart.rateLimit), linked: alien(restart.accounts && restart.accounts[X.id]) } };
};
{
  const ROUTES = require(path.join(REPO, 'src/usage-routes.js'));
  for (const cache of ['replaced', 'emptied', 'stripped']) {
    const r = await linkedWorld(ROUTES, cache);
    ok(!!(r.before.login && r.before.linked), `⑦ ${cache.toUpperCase()} — the scene is real: before the repair the judged reading is on the machine login's row AND, through the same-account merge, on the linked account's (${JSON.stringify(r.before)})`, r);
    ok(!!(!r.after.login && !r.after.linked && !r.copy && !r.restart.login && !r.restart.linked), `⑦ ${cache.toUpperCase()}: after the reload the judged reading is on NEITHER row and not in the copy — nor after a restart from that copy (${JSON.stringify({ after: r.after, copy: r.copy, restart: r.restart })})`, r);
  }
  const TodayReload = M.load('src/usage-routes.js', anchored(ROUTES_SRC, '    dropJudged(rep, judged);\n', '', 'today\'s reload (the linked rows kept)'), 'today-reload');
  const red = await linkedWorld(TodayReload, 'replaced');
  ok(!!(red.after.linked && red.after.login && red.copy), `⑦ RED CONTROL today's reload (1de87eff9): the linked row keeps the judged reading and the same-account merge puts it back on the machine login's row and in the copy (${JSON.stringify(red)})`, red);
}
{
  // the three callers hand the reload their report (r2933 lens 3: the hourly and the person's road had no pin)
  const SV = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok(!!(SV.includes("const rep = repairIdentityAnchors('boot', { since: settled && settled.since }); usage.reloadRateLimitCache?.(rep);") && SV.includes('if (rep && rep.changed) usage.reloadRateLimitCache?.(rep);') && ROUTES_SRC.includes('  try { reloadRateLimitCache(rep); } catch { }')), 'PIN: the boot\'s, the hourly and the person\'s identity repair each hand their report to the reload');
}
report();
