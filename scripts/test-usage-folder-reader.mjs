#!/usr/bin/env node
// B-360d part 3 U3 (主开发 r1459) — THE USAGE-CACHE FOLDER'S ONE READER OFF THE LOOP (src/usage-cache-folder.js). The REAL pool
// engine and the REAL setupUsage over throwaway data folders; every synchronous call under the folder is counted by name.
//  ① THE ROADS MAKE NO WHOLE-FOLDER READ ON THE LOOP: the identity groups, the anchor sweep, a refresh's ingestion and a GET
//     /api/usage list nothing and read no `.json` of the folder synchronously; the boot's first fill is the one pass.
//     RED: the release's groups (the engine's run-reads), the release's routes (their own readdir and reads).
//  ② ONE CLOCK: a reading another process wrote reaches the request's answer at that request (its refresh is asked and
//     awaited), and a refresh's reply runs the ingestion (the machine login's copy is owed to the writer after it).
//     RED: the request without its refresh, the routes without the reply's ingestion.
//  ③ THE HUB'S OWN WRITE REPLACES ITS ENTRY AT ONCE (the write path's notice), also while a read is in flight.
//     RED: the write path without its notice.
//  ④ A REFRESH THAT FAILS KEEPS THE LAST REPLY AND SAYS ITS AGE: an error, then a read that never replies — the groups' view
//     stays the last reply, `state()` says held, since when, as of when; `fresh()` answers within its bound.
//     RED: a reader that empties its reply on a failed read.
//  THE LEGS' HOLD (r2405): a leg that holds a read at its file waits for the hold itself (bounded, and said), over a listing
//     slowed by SLOW_LIST loop turns. RED: the release's twenty-turn wait over that listing finds no hold.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratch('usage-folder-reader');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const { ok, report } = checker();
const quiet = async (fn) => { const o = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => { }; try { return await fn(); } finally { [console.log, console.warn, console.error] = o; } };
// THE COUNTER: every synchronous call under `dir` — { lists, jsonReads, calls }
const SYNC = ['readdirSync', 'statSync', 'existsSync', 'readFileSync', 'openSync', 'writeFileSync', 'renameSync'];
async function counted(dir, fn) {
  const real = {}, seen = { lists: 0, jsonReads: 0, calls: [] };
  for (const k of SYNC) {
    real[k] = fs[k];
    fs[k] = function (p0, ...a) {
      if (typeof p0 === 'string' && path.resolve(p0).startsWith(dir)) { seen.calls.push(k + ' ' + path.basename(p0)); if (k === 'readdirSync') seen.lists++; if (k === 'readFileSync' && p0.endsWith('.json')) seen.jsonReads++; }
      return real[k].call(this, p0, ...a);
    };
  }
  try { const v = fn(); if (v && typeof v.then === 'function') await v; } finally { for (const k of SYNC) fs[k] = real[k]; }
  return seen;
}
const NOW = Date.now(), S = Math.floor(NOW / 1000);
const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: NOW + 36e5, refreshTokenExpiresAt: NOW + 30 * 86400e3, subscriptionType: 'max' } });
const reading = (fetchedAt, org) => JSON.stringify({ fetchedAt, source: 'statusline', orgUuid: org, fiveHour: { utilization: 0.2, resetsAt: S + 3600 }, sevenDay: { utilization: 0.1, resetsAt: S + 3 * 86400 } });
let seq = 0;
function world(n = 4) {
  const root = fs.mkdtempSync(path.join(ROOT, 'w-')), dataDir = path.join(root, 'data'), cacheDir = path.join(dataDir, 'usage-cache');
  fs.mkdirSync(cacheDir, { recursive: true }); fs.mkdirSync(path.join(dataDir, 'usage-anchors'), { recursive: true });
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const am = new AccountManager({ dataDir }), ids = [];
  for (let i = 0; i < n; i++) {
    const id = am.createSubscription({ name: 'acct-' + i }).id; ids.push(id);
    fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), CREDS(id), { mode: 0o600 });
    fs.writeFileSync(path.join(cacheDir, id + '.json'), reading(NOW - 600e3, `org-${i}-${++seq}`));
    fs.writeFileSync(path.join(cacheDir, `.window-${id}`), '{}');
  }
  fs.writeFileSync(path.join(cacheDir, '__global__.json'), reading(NOW - 600e3, `org-g-${++seq}`));
  return { root, dataDir, cacheDir, am, ids, file: path.join(dataDir, 'usage-cache.json') };
}
function engineOf(engMod, w) {
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  return engMod.create({
    app, rootDir: w.root, USAGE_CACHE_DIR: w.cacheDir, activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
    serverNotice: () => { }, serverSetting: () => undefined, getAccounts: () => w.am,
    getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
    getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
    getAutoResume: () => ({ armIfEnabled() { }, noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { } }), getQuotaProbe: () => null, getSessionMetaStore: () => null,
  });
}
async function routesOf(routesMod, w) {
  const routes = {};
  const app = { get: (p, h) => { routes['GET ' + p] = h; }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  // the REAL AccountManager (its decision rows and its sign-in facts' settle, as the routes ask them), the machine's own logins stubbed
  const over = { codexGlobalStatus: () => ({ loggedIn: false, email: null }), subscriptionStatus: () => ({ loggedIn: false, email: null }), subCredsPath: () => path.join(w.root, 'none', '.credentials.json'), usageToken: () => null };
  const accounts = new Proxy(w.am, { get: (t, k) => (k in over ? over[k] : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });
  const timers = [];
  const realSI = globalThis.setInterval; globalThis.setInterval = (fn, t) => { timers.push({ fn, t }); return { unref() { }, ref() { } }; };   // no timer runs here: each pass is asked by the leg
  try {
    await quiet(() => routesMod.setupUsage({
      app, accounts, hosts: { list: () => [] }, usageHistory: null, activeSessions: new Map(), serverSetting: () => false, ensureDir: (x) => fs.mkdirSync(x, { recursive: true }),
      USAGE_CACHE_FILE: w.file, USAGE_CACHE_DIR: w.cacheDir, CODEX_SESSIONS_DIR: path.join(w.root, 'codex'), META_DIR: path.join(w.root, 'meta'),
      AVAILABLE_MODELS: { claude: [] }, BUFFERS_DIR: path.join(w.root, 'buffers'), probeUsageForAccountKey: null, CLAUDE_CMD: '/bin/false',
    }));
  } finally { globalThis.setInterval = realSI; }
  const get = (req = {}) => new Promise((resolve) => { const res = { status() { return res; }, set() { return res; }, setHeader() { }, json(b) { resolve(b); return res; } }; quiet(() => routes['GET /api/usage']({ query: {}, headers: {}, params: {}, ...req }, res)); });
  return { routes, get, timers };
}
const F = require(path.join(REPO, 'src/usage-cache-folder.js'));
const W = require(path.join(REPO, 'src/usage-cache-write.js'));
const { storeWriter } = require(path.join(REPO, 'src/store-writer.js'));
const ENG = require(path.join(REPO, 'src/server/usage-pool-engine.js'));
const ROUTES = require(path.join(REPO, 'src/usage-routes.js'));
const M = mutantCopies('usage-folder-reader', REPO);
const E_SRC = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
const R_SRC = fs.readFileSync(path.join(REPO, 'src/usage-routes.js'), 'utf8');
const F_SRC = fs.readFileSync(path.join(REPO, 'src/usage-cache-folder.js'), 'utf8');
const W_SRC = fs.readFileSync(path.join(REPO, 'src/usage-cache-write.js'), 'utf8');
const every = (src, a, b, n, why) => { const parts = src.split(a); if (parts.length - 1 !== n) throw new Error(`ANCHOR (${why}): ${parts.length - 1} of ${n}`); return parts.join(b); };
const tick = () => new Promise((z) => setImmediate(z));
// THE HOLD (r2405): a leg that holds the read at its file waits for that hold ITSELF, never for a count of loop turns. The listing
// is a real fs.promises.readdir (the thread pool), which a loaded machine answers after any number of turns (int361's census gate
// at 59594edc9, the box zone: twenty turns found no hold and ⑥'s control crashed on «held.shift(...) is not a function»). The
// legs run on a listing slowed by SLOW_LIST turns — the loaded machine's stand-in, every run.
const SLOW_LIST = 60;
function heldReads({ listTurns = SLOW_LIST } = {}) {
  const held = []; let say = null; const first = new Promise((z) => { say = z; });
  const fsp = {
    readdir: (d) => fs.promises.readdir(d).then(async (names) => { for (let k = 0; k < listTurns; k++) await tick(); return names; }),
    readFile: (f) => new Promise((res) => { held.push(() => res(fs.readFileSync(f, 'utf8'))); say('held'); }),
  };
  return { held, fsp, first };
}
// the wait: the hold, or the read's end without one, or its bound (a listing that never answers) — each SAID, never a crash
async function untilHeld(h, read, boundMs = 10000) {
  let t = null;
  const bound = new Promise((z) => { t = setTimeout(() => z(`no hold within ${boundMs / 1000} s`), boundMs); });
  try { return await Promise.race([h.first, read.then(() => 'the read ended with no hold', () => 'the read failed with no hold'), bound]); } finally { clearTimeout(t); }
}

// ① THE ROADS MAKE NO WHOLE-FOLDER READ ON THE LOOP
{
  const w = world();
  let eng = null;
  const boot = await counted(w.cacheDir, async () => { eng = await quiet(() => engineOf(ENG, w)); });
  const groups = await counted(w.cacheDir, () => eng.usageIdentityGroups());
  const size = eng.usageIdentityGroups().size;
  const sweep = await counted(w.cacheDir, () => quiet(() => eng.sweepUsageAnchors()));
  ok(!!(boot.lists === 1 && groups.lists === 0 && groups.jsonReads === 0 && sweep.lists === 0 && sweep.jsonReads === 0 && size === 5), `① the boot's first fill is the one pass (${boot.lists} list, ${boot.jsonReads} reads); then the groups (${size}) and a sweep list nothing and read no reading file on the loop`, { boot: boot.lists, groups: groups.calls, sweep: sweep.calls });
  const RelE = M.load('src/server/usage-pool-engine.js', every(E_SRC, '{ via: usageFolder.via }', '{ via: RR }', 2, 'the groups'), 'release-engine');
  const w2 = world(); const e2 = await quiet(() => engineOf(RelE, w2));
  const rel = await counted(w2.cacheDir, () => e2.usageIdentityGroups());
  ok(!!(rel.lists === 1 && rel.jsonReads >= 5), `CONTROL (the release's groups: the engine's run-reads): a list and a read of every reading file at each ask (${rel.lists} list, ${rel.jsonReads} reads) — red`, rel.calls);
  const w3 = world(); await quiet(() => engineOf(ENG, w3));
  const R = await routesOf(ROUTES, w3);
  const folder = F.forDir(w3.cacheDir);
  const ref = await counted(w3.cacheDir, () => quiet(() => folder.refresh()));
  const req = await counted(w3.cacheDir, () => R.get());
  ok(!!(ref.lists === 0 && ref.jsonReads === 0 && req.lists === 0 && req.jsonReads === 0), `① a refresh's ingestion and a GET /api/usage list nothing and read no reading file on the loop (refresh ${ref.calls.length} calls, request ${req.calls.length}: ${[...new Set(req.calls)].join(', ') || 'none'})`, { ref: ref.calls, req: req.calls });
  const RelR = M.load('src/usage-routes.js', every(R_SRC, ', { via: usageFolder.via })', ')', 8, 'the routes'), 'release-routes');
  const w4 = world(); await quiet(() => engineOf(ENG, w4));
  const R4 = await routesOf(RelR, w4);
  const req4 = await counted(w4.cacheDir, () => R4.get());
  ok(!!(req4.lists >= 1 && req4.jsonReads >= 5), `CONTROL (the release's routes: their own list and reads): a request lists the folder and reads every reading file (${req4.lists} lists, ${req4.jsonReads} reads) — red`, req4.calls);
}
// ② ONE CLOCK
{
  const w = world(); await quiet(() => engineOf(ENG, w));
  const R = await routesOf(ROUTES, w);
  const folder = F.forDir(w.cacheDir);
  const A = w.ids[0], newer = NOW + 5000;
  fs.writeFileSync(path.join(w.cacheDir, A + '.json'), reading(newer, 'org-a-moved'));   // another process (the statusline) writes it
  const ans = await R.get();
  ok(!!(ans.accounts && ans.accounts[A] && ans.accounts[A].fetchedAt === newer && ans.usageFolder && ans.usageFolder.held === false), `② a reading another process wrote reaches the request's answer at that request (${ans.accounts && ans.accounts[A] && ans.accounts[A].fetchedAt === newer ? 'the new one' : 'an older one'}); the answer carries the folder's state`, { at: ans.accounts && ans.accounts[A] && ans.accounts[A].fetchedAt, folder: ans.usageFolder });
  try { storeWriter().flushSync([w.file], { waitedBy: 'the leg' }); } catch { }
  const before = !!storeWriter().pending(w.file);
  fs.writeFileSync(path.join(w.cacheDir, '__global__.json'), reading(NOW + 9000, 'org-g-moved'));
  await folder.refresh();
  ok(!!(!before && !!storeWriter().pending(w.file)), `② a refresh's reply runs the ingestion (one clock): the machine login's newer reading is taken and its copy owed to the writer (owed: ${!before} → ${!!storeWriter().pending(w.file)})`);
  const NoFresh = M.load('src/usage-routes.js', anchored(R_SRC, '  try { await usageFolder.fresh(); } catch { }\n', '', 'the request without its refresh'), 'no-fresh');
  const w2 = world(); await quiet(() => engineOf(ENG, w2));
  const R2 = await routesOf(NoFresh, w2);
  fs.writeFileSync(path.join(w2.cacheDir, w2.ids[0] + '.json'), reading(newer, 'org-a2-moved'));
  const ans2 = await R2.get();
  ok(!!(ans2.accounts && ans2.accounts[w2.ids[0]] && ans2.accounts[w2.ids[0]].fetchedAt === NOW - 600e3), 'CONTROL (the request without its refresh): the answer is the kept reply\'s — the OLDER reading — red');
  const NoReply = M.load('src/usage-routes.js', anchored(R_SRC, 'usageFolder.onReply(() => ingestPassiveUsage());', '', 'the routes without the reply\'s ingestion'), 'no-reply');
  const w3 = world(); await quiet(() => engineOf(ENG, w3));
  await routesOf(NoReply, w3);
  try { storeWriter().flushSync([w3.file], { waitedBy: 'the leg' }); } catch { }
  fs.writeFileSync(path.join(w3.cacheDir, '__global__.json'), reading(NOW + 9000, 'org-g3-moved'));
  await F.forDir(w3.cacheDir).refresh();
  ok(!!(!storeWriter().pending(w3.file)), 'CONTROL (the routes without the reply\'s ingestion): a refresh brings the newer reading and nothing takes it — red');
}
// ③ THE HUB'S OWN WRITE REPLACES ITS ENTRY AT ONCE
{
  const w = world(); const eng = await quiet(() => engineOf(ENG, w));
  const C = w.ids[2], at1 = NOW + 7000, at2 = NOW + 8000;
  const groupAt = (e) => { for (const [, g] of e.usageIdentityGroups()) if (g.accountIds.includes(C)) return g.cache && g.cache.fetchedAt; return null; };
  W.writeCacheObject({ cacheDir: w.cacheDir, key: C, obj: JSON.parse(reading(at1, 'org-c-own')), source: 'statusline', backend: 'claude' });
  const seen1 = groupAt(eng);
  const p = F.forDir(w.cacheDir).refresh();   // a read in flight …
  W.writeCacheObject({ cacheDir: w.cacheDir, key: C, obj: JSON.parse(reading(at2, 'org-c-own')), source: 'statusline', backend: 'claude' });   // … and the hub writes
  await p;
  const seen2 = groupAt(eng);
  ok(!!(seen1 === at1 && seen2 === at2), `③ the hub's own write is in the reply at once (${seen1 === at1}), and a write during a read in flight stands over what that read saw (${seen2 === at2})`, { seen1, seen2 });
  const Wcut = M.load('src/usage-cache-write.js', anchored(W_SRC, "  fs.renameSync(file + '.tmp', file);\n  noteWritten(file, text, { replace });\n", "  fs.renameSync(file + '.tmp', file);\n", 'the write path without its notice'), 'no-notice');
  Wcut.onWritten(F.noteWrittenFile);   // the folder listens to the copy as it listens to the write path
  const w2 = world(); const e2 = await quiet(() => engineOf(ENG, w2));
  const C2 = w2.ids[2];
  Wcut.writeCacheObject({ cacheDir: w2.cacheDir, key: C2, obj: JSON.parse(reading(at1, 'org-c2-own')), source: 'statusline', backend: 'claude' });
  let cutAt = null; for (const [, g] of e2.usageIdentityGroups()) if (g.accountIds.includes(C2)) cutAt = g.cache && g.cache.fetchedAt;
  ok(!!(cutAt === NOW - 600e3), `CONTROL (the write path without its notice): the hub's own write is not in the reply until a refresh — the groups read the OLDER reading (${cutAt}) — red`);
}
// ③ (the reader alone) a write landing AFTER a read in flight took its file's old bytes stands over them
async function overlayLeg(mod) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'own-'));
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ fetchedAt: 1 }));
  const h = heldReads();
  const r = mod.create(dir, { fsp: h.fsp, fillSync: false });
  const p = r.refresh();
  const how = await untilHeld(h, p); if (how !== 'held') return how;
  h.held.shift()();                                                   // the read takes the file's OLD bytes …
  r.noteWritten('a.json', JSON.stringify({ fetchedAt: 2 }));        // … then the hub writes, before the reply lands
  await p;
  return JSON.parse(r.via.readText(path.join(dir, 'a.json'))).fetchedAt;
}
{
  const got = await overlayLeg(F);
  ok(!!(got === 2), `③ a write after a read in flight took the old bytes stands in the reply it brings (fetchedAt ${got})`);
  const NoOverlay = M.load('src/usage-cache-folder.js', anchored(F_SRC, "      for (const [n, o] of mine) texts.set(n, o.replace ? o.text : laterOf(texts.get(n), o.text));   // the hub's own writes during the read stand over what it saw — unless the read saw a LATER reading (r1976 (g))\n", '', 'the reply without the writes during its read'), 'no-overlay');
  const got2 = await overlayLeg(NoOverlay);
  ok(!!(got2 === 1), `CONTROL (the reply without the writes made during its read): the older bytes come back over the hub's write (fetchedAt ${got2}) — red`);
}
// ④ A REFRESH THAT FAILS KEEPS THE LAST REPLY AND SAYS ITS AGE
async function heldLeg(mod) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'held-'));
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ fetchedAt: 1 }));
  let mode = 'ok', clock = 1000;
  const fsp = { readdir: (d) => (mode === 'ok' ? fs.promises.readdir(d) : mode === 'error' ? Promise.reject(Object.assign(new Error('EIO'), { code: 'EIO' })) : new Promise(() => { })), readFile: (f, e) => fs.promises.readFile(f, e) };
  const said = [];
  const r = mod.create(dir, { fsp, now: () => clock, everyMs: 30, log: (m) => said.push(m) });
  await r.refresh();
  const asOf = r.state().asOf;
  clock = 5000; mode = 'error';
  await r.refresh();
  const s1 = r.state(), list1 = r.via.readdir(dir);
  const r2 = mod.create(dir, { fsp, now: () => clock, everyMs: 30, log: (m) => said.push(m) });   // its first fill: the boot's pass
  const asOf2 = r2.state().asOf;
  mode = 'hang'; r2.refresh(); clock += 100;
  const s2 = r2.state();
  const t0 = Date.now(); const got = await r2.fresh({ waitMs: 40 }); const waited = Date.now() - t0;
  return { s1, list1: list1.length, asOf, s2, asOf2, got: got && got.at, waited, said: said.length };
}
{
  const h = await heldLeg(F);
  ok(!!(h.s1.held && h.s1.error === 'EIO' && h.s1.asOf === h.asOf && h.s1.since === 5000 && h.list1 === 1), `④ a read that fails keeps the last reply (${h.list1} file still listed) and says it: held, ${h.s1.error}, since ${h.s1.since}, readings as of ${h.s1.asOf}`, h.s1);
  ok(!!(h.s2.held && h.s2.error === 'not-replying' && h.s2.asOf === h.asOf2 && h.got === h.asOf2 && h.said >= 2), `④ a read that never replies is held past its period (${h.s2.error}); fresh() answers the kept reply while the read still hangs; the log says it once a time (${h.said})`, h.s2);
  const none = path.join(ROOT, 'no-such-folder');
  const rn = F.create(none, { everyMs: 30 });
  await rn.refresh();
  ok(!!(!rn.state().held && rn.via.readdir(none).length === 0 && rn.state().asOf != null), '④ a folder that does not exist yet (a fresh install) reads as no readings, never as a held read');
  const Empty = M.load('src/usage-cache-folder.js', anchored(F_SRC, "      inflight = null; own = null;\n      failed = { at: now(), code: (e && e.code) || 'error' };\n", "      inflight = null; own = null; reply = { at: now(), texts: new Map() };\n      failed = { at: now(), code: (e && e.code) || 'error' };\n", 'a reader that empties its reply'), 'empties');
  const he = await heldLeg(Empty);
  ok(!!(he.list1 === 0), `CONTROL (a reader that empties its reply on a failed read): the folder reads as holding nothing (${he.list1} files) — «no readings» — red`);
}
// ⑤ (r1976's legs) THE MEMO DROPPED AT A REPLY · THE ROUTE ANSWERS A HELD FOLDER WITH ITS AGE · ONE UNREADABLE FILE · THE LATER READING
{
  // the groups' memo never outlives the reply it was built on: an identity another process filed reaches resolveIdentity's groups at the next reply
  const memoScene = async (engMod) => {
    const w = world(3); const eng = await quiet(() => engineOf(engMod, w));
    eng.usageIdentityGroupsCached();   // the memo built on the boot's reply
    const id = w.am.createSubscription({ name: 'acct-new' }).id;   // the engine's own account manager knows it
    fs.writeFileSync(path.join(w.am.subDir(id), '.credentials.json'), CREDS(id), { mode: 0o600 });
    fs.writeFileSync(path.join(w.cacheDir, id + '.json'), reading(NOW, 'org-new-' + (++seq)));
    await F.forDir(w.cacheDir).refresh();
    return [...eng.usageIdentityGroupsCached().values()].some((g) => g.accountIds.includes(id));
  };
  ok(!!(await memoScene(ENG)), '⑤ the groups\' memo is dropped at a folder reply: an identity filed by another process is in resolveIdentity\'s groups at the next reply');
  const NoDrop = M.load('src/server/usage-pool-engine.js', anchored(E_SRC, "usageFolder.onReply(() => { _identGroupsMemo.groups = null; });", '', 'the memo kept across a reply'), 'memo-kept');
  ok(!!(!(await memoScene(NoDrop))), 'CONTROL (the memo kept across a reply): the new identity stays out of the groups for the memo\'s life — red');
}
{
  // a held folder: the route answers with the kept readings and SAYS how old they are
  const w = world(); const dir = path.resolve(w.cacheDir);
  let hang = false;
  const fsp = { readdir: (d) => (hang ? new Promise(() => { }) : fs.promises.readdir(d)), readFile: (f, e) => fs.promises.readFile(f, e) };
  const reader = F.forDir(dir, { fsp, everyMs: 20, log: () => { } });   // made FIRST: the engine and the routes find this reader
  const asOf = reader.state().asOf;
  await quiet(() => engineOf(ENG, w));
  const R = await routesOf(ROUTES, w);
  hang = true; reader.refresh();
  await new Promise((z) => setTimeout(z, 40));
  const ans = await R.get();
  ok(!!(ans.usageFolder && ans.usageFolder.held === true && ans.usageFolder.asOf === asOf && ans.accounts && ans.accounts[w.ids[0]] && ans.accounts[w.ids[0]].fetchedAt === NOW - 600e3), `⑤ a held folder: GET /api/usage answers the kept readings and says held, as of the last reply (${JSON.stringify(ans.usageFolder)})`);
  const meter = fs.readFileSync(path.join(REPO, 'src/lib/usage-meter.js'), 'utf8');
  ok(!!(meter.includes("this._usageFolder = data?.usageFolder || null;") && meter.includes("this._usageFolder && this._usageFolder.held ?") && meter.includes("t('⚠ The usage folder is not answering: the readings shown are as of {ago}.', { ago: agoText(this._usageFolder.asOf) })")), '⑤ PIN: the usage popup reads the answer\'s usageFolder and draws its sentence when held, with the readings\' age');
}
async function unreadableLeg(mod) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'bad-'));
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ fetchedAt: 1 }));
  fs.mkdirSync(path.join(dir, 'b.json'));   // a folder named .json: reading it fails (EISDIR)
  const r = mod.create(dir, { fillSync: false, log: () => { } });
  await r.refresh();
  const st = r.state();
  return { held: st.held, names: r.via.readdir(dir) };
}
{
  const u = await unreadableLeg(F);
  ok(!!(u.held === false && u.names.length === 1 && u.names[0] === 'a.json'), `⑤ one unreadable file is skipped (as the release skipped it): the others come, the folder is not held (${JSON.stringify(u)})`);
  const Strict = M.load('src/usage-cache-folder.js', anchored(F_SRC, "      try { texts.set(n, await fsp.readFile(path.join(DIR, n), 'utf8')); readOk(n); } catch (e) { if (!e || e.code !== 'ENOENT') skip(n, e); }\n", "      try { texts.set(n, await fsp.readFile(path.join(DIR, n), 'utf8')); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; }\n", 'one unreadable file fails the refresh'), 'strict');
  const s2 = await unreadableLeg(Strict);
  ok(!!(s2.held === true), 'CONTROL (one unreadable file fails the whole refresh): the folder is held for every identity — red');
}
async function laterLeg(mod) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'later-'));
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ fetchedAt: 1 }));
  const h = heldReads();
  const r = mod.create(dir, { fsp: h.fsp, fillSync: false });
  const pr = r.refresh();
  r.noteWritten('a.json', JSON.stringify({ fetchedAt: 2 }));                   // the hub writes while the read is in flight …
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ fetchedAt: 3 })); // … then another process writes a LATER reading, which the read takes
  const how = await untilHeld(h, pr); if (how !== 'held') return how;
  h.held.shift()();
  await pr;
  return JSON.parse(r.via.readText(path.join(dir, 'a.json'))).fetchedAt;
}
{
  const got = await laterLeg(F);
  ok(!!(got === 3), `⑤ the hub's write during a read keeps the LATER of the two readings: another process's newer reading stands (fetchedAt ${got})`);
  const OwnWins = M.load('src/usage-cache-folder.js', anchored(F_SRC, 'texts.set(n, o.replace ? o.text : laterOf(texts.get(n), o.text));', 'texts.set(n, o.text);', 'the own write always wins'), 'own-wins');   // stale-pins: kept (the control's planted release form)
  ok(!!((await laterLeg(OwnWins)) === 2), 'CONTROL (the own write always wins): the hub\'s older text hides the newer reading for a refresh — red');
}
// ⑥ (r2120) THE NAMED ERROR · THE INGEST WHILE HELD · A REPAIR'S REPLACE · THE BOOT'S FILL SKIPS ONE FILE · A SKIP SAID ONCE
{
  const named = async (routesMod) => {
    const w = world(); await quiet(() => engineOf(ENG, w));
    const R = await routesOf(routesMod, w);
    const reader = F.forDir(w.cacheDir), realState = reader.state;
    reader.state = () => { throw new Error('planted'); };   // a throw in the answer after the await
    const out = { code: null, body: null };
    const res = { status(c) { out.code = c; return res; }, set() { return res; }, setHeader() { }, json(b) { out.body = b; return res; } };
    let rejected = null;
    try { await quiet(() => R.routes['GET /api/usage']({ query: {}, headers: {}, params: {} }, res)); } catch (e) { rejected = e; } finally { reader.state = realState; }
    return { ...out, rejected: rejected ? String(rejected.message || rejected) : null };
  };
  const cure = await named(ROUTES);
  ok(!!(cure.code === 500 && cure.body && /the usage answer failed: planted/.test(cure.body.error) && !cure.rejected), `⑥ a throw in the answer after the await is answered BY NAME (${cure.code}: ${cure.body && cure.body.error})`, cure);
  const Bare = M.load('src/usage-routes.js', anchored(R_SRC, "  try { usageAnswer(req, res); } catch (e) { try { res.status(500).json({ error: `the usage answer failed: ${(e && e.message) || e}` }); } catch { } }\n", '  usageAnswer(req, res);\n', 'the answer without its named error'), 'bare');
  const rel = await named(Bare);
  ok(!!(rel.body === null && rel.rejected === 'planted'), 'CONTROL (the answer without its named error): the handler\'s promise rejects and the request is never answered — red', rel);
}
{
  const heldIngest = async (routesMod) => {
    const w = world(); let hang = false;
    const fsp = { readdir: (d) => (hang ? new Promise(() => { }) : fs.promises.readdir(d)), readFile: (f, e) => fs.promises.readFile(f, e) };
    const reader = F.forDir(path.resolve(w.cacheDir), { fsp, everyMs: 20, log: () => { } });
    await quiet(() => engineOf(ENG, w));
    const R = await routesOf(routesMod, w);
    const gone = w.ids[1];
    w.am.remove(gone);   // an account removed while the folder is held
    hang = true; reader.refresh();
    await new Promise((z) => setTimeout(z, 40));
    const pass = R.timers.find((x) => x.t === 30000);
    await quiet(async () => pass.fn());
    const ans = await R.get();
    return { held: !!(ans.usageFolder && ans.usageFolder.held), still: !!(ans.accounts && ans.accounts[gone]), other: !!(ans.accounts && ans.accounts[w.ids[0]]) };
  };
  const c = await heldIngest(ROUTES);
  ok(!!(c.held && !c.still && c.other), `⑥ while the folder is held the 30-s pass ingests over the kept reply: a removed account leaves the answer, the others stay (${JSON.stringify(c)})`);
  const NoHeld = M.load('src/usage-routes.js', anchored(R_SRC, ' if (usageFolder.state().held) ingestPassiveUsage();', '', 'the pass without its held ingest'), 'no-held');
  const r = await heldIngest(NoHeld);
  ok(!!(r.held && r.still), 'CONTROL (the pass without its held ingest): the removed account stays in the answer for as long as the folder is held — red', r);
}
async function replaceLeg(mod) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'replace-'));
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ fetchedAt: 5, foreign: true }));   // a foreign reading on disk (newer)
  const h = heldReads();
  const r = mod.create(dir, { fsp: h.fsp, fillSync: false });
  const pr = r.refresh();
  const how = await untilHeld(h, pr); if (how !== 'held') return { noHold: how };
  h.held.shift()();                                                                              // the read takes the foreign text …
  r.noteWritten('a.json', JSON.stringify({ fetchedAt: 3, own: true }), { replace: true });   // … then a repair REPLACES it with the account's own older snapshot
  await pr;
  return JSON.parse(r.via.readText(path.join(dir, 'a.json')));
}
{
  const got = await replaceLeg(F);
  ok(!!(got.own === true && got.fetchedAt === 3), `⑥ a repair's replace during a read stands over the foreign reading the read took (fetchedAt ${got.noHold || got.fetchedAt})`);
  const NoReplace = M.load('src/usage-cache-folder.js', anchored(F_SRC, 'texts.set(n, o.replace ? o.text : laterOf(texts.get(n), o.text));', 'texts.set(n, laterOf(texts.get(n), o.text));', 'a replace judged as a reading'), 'no-replace');
  const r2 = await replaceLeg(NoReplace);
  ok(!!(r2.foreign === true), 'CONTROL (a replace judged as a reading): the foreign reading the repair replaced stands for one more refresh — red', r2);
}
{
  // CONTROL (r2405, the legs' own wait): the release's wait — twenty loop turns — over the slowed listing finds no hold (the box
  // run's crash); the wait for the hold itself finds it
  const dir = fs.mkdtempSync(path.join(ROOT, 'wait-'));
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ fetchedAt: 1 }));
  const h = heldReads(), r = F.create(dir, { fsp: h.fsp, fillSync: false }), pr = r.refresh();
  for (let k = 0; k < 20 && !h.held.length; k++) await tick();
  const byTurns = h.held.length, how = await untilHeld(h, pr);
  h.held.splice(0).forEach((go) => go()); await pr;
  ok(!!(byTurns === 0 && how === 'held'), `CONTROL (the legs' release wait: twenty loop turns) over a listing that answers after ${SLOW_LIST} finds no hold (${byTurns} held) — red; the wait for the hold itself finds it («${how}»)`);
}
async function bootSkipLeg(mod) {
  const dir = fs.mkdtempSync(path.join(ROOT, 'bootskip-'));
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ fetchedAt: 1 }));
  fs.mkdirSync(path.join(dir, 'b.json'));
  const said = [];
  const r = mod.create(dir, { log: (m) => said.push(m) });   // the boot's synchronous fill
  const st0 = r.state(), names0 = r.via.readdir(dir);
  await r.refresh(); await r.refresh();
  fs.rmSync(path.join(dir, 'b.json'), { recursive: true }); fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ fetchedAt: 2 }));
  await r.refresh();
  return { held: st0.held, names: names0, skipSaid: said.filter((m) => /cannot be read/.test(m)).length, againSaid: said.filter((m) => /: reads again$/.test(m)).length };
}
{
  const b = await bootSkipLeg(F);
  ok(!!(b.held === false && b.names.length === 1 && b.names[0] === 'a.json'), `⑥ the boot's fill skips one unreadable file too: the others come at once, nothing held (${JSON.stringify(b.names)})`);
  ok(!!(b.skipSaid === 1 && b.againSaid === 1), `⑥ a skipped file is said ONCE an episode in the journal (${b.skipSaid} across three reads) and its reading again once (${b.againSaid})`, b);
  const FillThrows = M.load('src/usage-cache-folder.js', anchored(F_SRC, "catch (e) { if (!e || e.code !== 'ENOENT') skip(n, e); } }   // r2120 (2)", "catch (e) { if (!e || e.code !== 'ENOENT') throw e; } }   // r2120 (2)", 'the fill throws on one file'), 'fill-throws');
  const b2 = await bootSkipLeg(FillThrows);
  ok(!!(b2.held === true), 'CONTROL (the boot\'s fill throws on one unreadable file): the folder is held from the boot — red', b2);
}
report();
