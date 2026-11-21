#!/usr/bin/env node
// test-anchor-sweep-reads — THE 60-s ANCHOR SWEEP'S STEPS READ NO FILE ON THE LOOP (B-360d part 3 U1, 主开发 r1444 / r1459).
// The sweep read every identity's WHOLE anchors file (kept forever) on the loop, every minute, to take its last line, and a
// fresh reading read it twice more; on the owner's data share that is a hold each time. Now every anchors file's last line is
// read ONCE off the loop (src/usage-anchors.js prime: its tail) and kept by the store's own append; a group with a fresh
// reading has its estimator view read off the loop first (src/usage-estimator.js viewFor / withView); the files' only other
// writers — this process's repairs and migrations — say so at their write (noteAnchorsRewritten). The REAL pool engine, a
// throwaway data folder, invented accounts and records; COUNTS of the synchronous file calls under the anchors folder:
//  ① the boot reads the last lines off the loop; the steady sweep (no new reading) makes NO synchronous call there
//  ② a fresh reading: its step reads nothing — the ONE append is its only synchronous call; the record is the release's
//  ③ a store whose last lines are not read yet: the sweep waits for that read (off the loop), then steps reading nothing
//  ④ a repair that rewrites a file (the real repairAnchors) says so: the next sweep judges by the rewritten last line, as the
//     release reads it
//  ⑤ RED CONTROLS (copies through scratch.mjs anchored): the kept line cut (the release's whole read every minute), the view
//     cut (the fresh step's estimator stats the file), the repair's notice cut (a stale kept line: the release records, it not)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ROOT = scratch('anchor-sweep-reads');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const { ok, report } = checker();
const quiet = async (fn) => { const o = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => { }; try { return await fn(); } finally { [console.log, console.warn, console.error] = o; } };

// THE COUNTER: every synchronous fs call on a path under `dir` (or a descriptor opened there), by kind
const READS = ['statSync', 'lstatSync', 'readFileSync', 'openSync', 'readSync', 'readdirSync', 'existsSync', 'accessSync', 'fstatSync'];
const WRITES = ['appendFileSync', 'writeFileSync', 'mkdirSync', 'renameSync', 'unlinkSync'];
async function counting(dir, fn) {
  const real = {}, fds = new Set(), seen = { reads: 0, writes: 0, calls: [] };
  const under = (p) => typeof p === 'string' && path.resolve(p).startsWith(dir);
  for (const k of [...READS, ...WRITES]) {
    real[k] = fs[k];
    fs[k] = function (p0, ...a) {
      const hit = under(p0) || (typeof p0 === 'number' && fds.has(p0));
      if (hit) { if (READS.includes(k)) seen.reads++; else seen.writes++; seen.calls.push(k); }
      const r = real[k].call(this, p0, ...a);
      if (k === 'openSync' && under(p0)) fds.add(r);
      return r;
    };
  }
  let value;
  try { value = fn(); seen.sync = !(value && typeof value.then === 'function'); await value; } finally { for (const k of Object.keys(real)) fs[k] = real[k]; }
  return seen;
}

// THE ENGINE WORLD: three accounts, each its own identity (an org), each with an anchors file of ANCHORS records whose last
// reading is the account's cache file's — so a sweep finds nothing new until a cache moves
const ANCHORS = 3000;
const NOW = Date.now(), S = Math.floor(NOW / 1000);
const CREDS = (id) => JSON.stringify({ claudeAiOauth: { accessToken: 'tok-' + id, refreshToken: 'r-' + id, expiresAt: Date.now() + 36e5, refreshTokenExpiresAt: Date.now() + 30 * 86400e3, subscriptionType: 'max' } });
let seq = 0;
function seedData() {
  const root = fs.mkdtempSync(path.join(ROOT, 'w-')), dataDir = path.join(root, 'data'), cacheDir = path.join(dataDir, 'usage-cache'), aDir = path.join(dataDir, 'usage-anchors');
  const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
  const { anchorSlug } = require(path.join(REPO, 'src/usage-anchors.js'));
  const am = new AccountManager({ dataDir });
  fs.mkdirSync(cacheDir, { recursive: true }); fs.mkdirSync(aDir, { recursive: true });
  const ids = {}, last = {};
  for (const tag of ['A', 'B', 'C']) {
    const id = am.createSubscription({ name: 'acct-' + tag.toLowerCase() }).id; ids[tag] = id;
    fs.writeFileSync(path.join(am.subDir(id), '.credentials.json'), CREDS(id), { mode: 0o600 });
    const key = `org:org-${tag.toLowerCase()}-${++seq}`, t0 = NOW - ANCHORS * 600e3;
    const lines = [];
    for (let j = 0; j < ANCHORS; j++) { const at = t0 + j * 600e3; lines.push(JSON.stringify({ ts: at + 5, fetchedAt: at, source: 'on-demand', accountId: id, identityKey: key, buckets: { fiveHour: { u: (j % 90) / 100, resetsAt: S + 3600 }, sevenDay: { u: (j % 70) / 100, resetsAt: S + 86400 * 3 }, scopedWeekly: [] }, prevFetchedAt: j ? at - 600e3 : null, elapsedSec: j ? 600 : null, costSince: null })); }
    fs.writeFileSync(path.join(aDir, `anchors-${anchorSlug(key)}.ndjson`), lines.join('\n') + '\n');
    last[tag] = { key, fetchedAt: t0 + (ANCHORS - 1) * 600e3, file: path.join(aDir, `anchors-${anchorSlug(key)}.ndjson`) };
    fs.writeFileSync(path.join(cacheDir, id + '.json'), JSON.stringify({ fetchedAt: last[tag].fetchedAt, source: 'on-demand', orgUuid: `org-${tag.toLowerCase()}-${seq}`, fiveHour: { utilization: 0.2, resetsAt: S + 3600 }, sevenDay: { utilization: 0.1, resetsAt: S + 86400 * 3 } }));
  }
  return { root, dataDir, cacheDir, aDir, am, ids, last };
}
function engineOf(engMod, d) {
  const { ClaudeCodeAdapter } = require(path.join(REPO, 'src/adapters/claude-code.js'));
  const app = { get() { }, post() { }, put() { }, delete() { }, use() { }, locals: {} };
  const eng = engMod.create({
    app, rootDir: d.root, USAGE_CACHE_DIR: d.cacheDir, activeSessions: new Map(), wss: { clients: new Set() }, WS_OPEN: 1, broadcastToSession() { },
    serverNotice: () => { }, serverSetting: () => undefined, getAccounts: () => d.am,
    getHosts: () => ({ device: async () => ({ poolOrders: async () => { }, ackPoolOrdersLog() { } }) }),
    getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), recordUsageAttribution() { }, adapterRegistry: { get: () => ClaudeCodeAdapter },
    getAutoResume: () => ({ armIfEnabled() { }, noteFireOutcome() { }, noteRecovered() { }, noteNoPoolTarget() { } }), getQuotaProbe: () => null, getSessionMetaStore: () => null,
  });
  return { eng, est: app.locals.usageEstimator };
}
const moveCache = (d, tag, fetchedAt) => { const f = path.join(d.cacheDir, d.ids[tag] + '.json'); const c = JSON.parse(fs.readFileSync(f, 'utf8')); fs.writeFileSync(f, JSON.stringify({ ...c, fetchedAt })); };
const lastLine = (f) => { const t = fs.readFileSync(f, 'utf8').trim().split('\n'); const r = JSON.parse(t[t.length - 1]); delete r.ts; return r; };
const lineCount = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').length;

// THE RELEASE, planted back (the oracle) and the red controls: copies of the store, the engine and the repair
const M = mutantCopies('anchor-sweep-reads', REPO);
const A_SRC = fs.readFileSync(path.join(REPO, 'src/usage-anchors.js'), 'utf8');
const E_SRC = fs.readFileSync(path.join(REPO, 'src/server/usage-pool-engine.js'), 'utf8');
const R_SRC = fs.readFileSync(path.join(REPO, 'src/reading-repair.js'), 'utf8');
const KEPT_READ = "    if (this._ready) { const r = this._kept.get(this._name(key)); return r ? JSON.parse(JSON.stringify(r)) : null; }\n";
const VIEW_STEP = '      usageEstimator.withView(view, () => step(k, g));\n';
const REPAIR_NOTE = "  if (res.files) require('./usage-anchors.js').noteAnchorsRewritten(anchorsDir);\n";
const ANCHORS_REQ = "costBetweenMulti } = require('../usage-anchors.js')";   // the one require that builds the store (the engine reads identityKeyFor by a second one)
const engineWith = (anchorsSrc, engineSrc, tag) => {
  const aPath = M.write('src/usage-anchors.js', anchorsSrc, tag + '-anchors', { esm: false, same: anchorsSrc === A_SRC });
  return M.load('src/server/usage-pool-engine.js', anchored(engineSrc, ANCHORS_REQ, `costBetweenMulti } = require(${JSON.stringify(aPath)})`, `${tag}: the engine's anchors store is the copy`), tag + '-engine');
};
const releaseAnchors = anchored(A_SRC, KEPT_READ, '', 'the release: lastAnchor reads the file whole');
const releaseEngine = () => engineWith(releaseAnchors, anchored(E_SRC, VIEW_STEP, '      step(k, g);\n', 'the release: no view'), 'release');
const ENG = require(path.join(REPO, 'src/server/usage-pool-engine.js'));

// ═══ ① the boot reads the last lines off the loop; the steady sweep makes no synchronous call ═══
console.log('— ① the boot\'s one read, off the loop; the steady sweep reads nothing');
const D1 = seedData();
const W1 = await quiet(async () => engineOf(ENG, D1));
await W1.eng.usageAnchors.prime();
ok(W1.eng.usageAnchors.ready() === true && W1.eng.usageAnchors.syncReads === 0, `① the store's last lines are read (off the loop: ${W1.eng.usageAnchors.syncReads} whole reads on the loop)`, { syncReads: W1.eng.usageAnchors.syncReads });
{
  const c = await counting(D1.aDir, () => quiet(() => W1.eng.sweepUsageAnchors()));
  ok(c.reads === 0 && c.writes === 0, `① the steady sweep (three identities, ${ANCHORS} anchors each, nothing new): ${c.reads} synchronous reads and ${c.writes} writes under the anchors folder`, c);
}
// ═══ ② a fresh reading ═══
console.log('\n— ② a fresh reading: its step reads nothing; the one append; the record is the release\'s');
const D2 = seedData();
const W2 = await quiet(async () => engineOf(ENG, D2));
await W2.eng.usageAnchors.prime();
moveCache(D2, 'A', D2.last.A.fetchedAt + 600e3);
const v0 = W2.est.viewMisses || 0;
const c2 = await counting(D2.aDir, () => quiet(() => W2.eng.sweepUsageAnchors()));
const got2 = lastLine(D2.last.A.file);
ok(c2.reads === 0 && c2.calls.filter((k) => k === 'appendFileSync').length === 1 && (W2.est.viewMisses || 0) === v0 && got2.fetchedAt === D2.last.A.fetchedAt + 600e3, `② the fresh step: ${c2.reads} synchronous reads, its calls ${c2.calls.join(' + ') || 'none'} (the append stays), the view missed ${(W2.est.viewMisses || 0) - v0}`, c2);
{
  // the release over the same data and the same move: the record it appends is this one (its ts aside)
  const D2r = seedData();
  const Rel = releaseEngine();
  const W2r = await quiet(async () => engineOf(Rel, D2r));
  moveCache(D2r, 'A', D2r.last.A.fetchedAt + 600e3);
  const c2r = await counting(D2r.aDir, () => quiet(() => W2r.eng.sweepUsageAnchors()));
  const rel2 = lastLine(D2r.last.A.file);
  const tagOf = (x, d) => (x === d.ids.A ? 'A' : x === d.ids.B ? 'B' : x === d.ids.C ? 'C' : x);
  const norm = (r, d) => JSON.stringify({ ...r, identityKey: r.identityKey.replace(/-\d+$/, ''), accountId: tagOf(r.accountId, d), ...(r.accountIds ? { accountIds: r.accountIds.map((x) => tagOf(x, d)) } : {}), prevFetchedAt: r.prevFetchedAt - d.last.A.fetchedAt, fetchedAt: r.fetchedAt - d.last.A.fetchedAt });
  ok(norm(got2, D2) === norm(rel2, D2r) && c2r.reads >= 3, `② the record is the release's (field for field, its stamp aside); the release's sweep read the anchors folder ${c2r.reads} times on the loop`, { cure: norm(got2, D2), release: norm(rel2, D2r) });
}
// ═══ ③ a store whose last lines are not read yet ═══
console.log('\n— ③ before the last lines are read: the sweep waits for that read, then steps reading nothing');
{
  const D3 = seedData();
  moveCache(D3, 'B', D3.last.B.fetchedAt + 600e3);
  let c3 = null, W3 = null;
  await quiet(async () => { W3 = engineOf(ENG, D3); c3 = await counting(D3.aDir, () => W3.eng.sweepUsageAnchors()); });
  ok(c3.sync === false && c3.reads === 0 && W3.eng.usageAnchors.syncReads === 0 && lastLine(D3.last.B.file).fetchedAt === D3.last.B.fetchedAt + 600e3, `③ a sweep at once after the start: it waited (${c3.sync ? 'ran at once' : 'off the loop'}), ${c3.reads} synchronous reads, B's new reading anchored`, { c3, syncReads: W3.eng.usageAnchors.syncReads });
}
// ═══ ④ a repair that rewrites a file says so ═══
console.log('\n— ④ a repair rewrites a file: the next sweep judges by the rewritten last line');
const RR4 = require(path.join(REPO, 'src/reading-repair.js'));
const rewriteScene = async (engMod, repairMod) => {
  const d = seedData();
  const w = await quiet(async () => engineOf(engMod, d));
  if (w.eng.usageAnchors.prime) await w.eng.usageAnchors.prime();
  // C's LAST anchor turns out foreign (its login moved before it): the repair drops it; C's cache still holds that reading
  const rows = fs.readFileSync(d.last.C.file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const markers = new Map([[d.ids.C, { state: 'moved', since: d.last.C.fetchedAt - 1 }]]);
  await quiet(async () => repairMod.repairAnchors({ anchorsDir: d.aDir, archiveDir: path.join(d.dataDir, 'archive'), markers, anchorFiles: [{ name: path.basename(d.last.C.file), file: d.last.C.file, rows }], id: 'test-rewrite' }));
  const before = lineCount(d.last.C.file);
  // the sweep itself waits for a read the repair's notice started (and only then): nothing else is asked of the store here
  await quiet(() => w.eng.sweepUsageAnchors());
  return { before, after: lineCount(d.last.C.file), last: lastLine(d.last.C.file).fetchedAt - d.last.C.fetchedAt };
};
const s4 = await rewriteScene(ENG, RR4), r4 = await rewriteScene(releaseEngine(), RR4);
ok(s4.before === ANCHORS - 1 && s4.after === ANCHORS && s4.last === 0 && JSON.stringify(s4) === JSON.stringify(r4), `④ after the repair (${s4.before} lines left), the sweep anchored the reading again (${s4.after} lines), as the release did`, { cure: s4, release: r4 });
// ═══ ⑤ RED CONTROLS ═══
console.log('\n— ⑤ red controls');
{
  const D5 = seedData();
  const W5 = await quiet(async () => engineOf(engineWith(releaseAnchors, E_SRC, 'kept-cut'), D5));
  await W5.eng.usageAnchors.prime();
  const c = await counting(D5.aDir, () => quiet(() => W5.eng.sweepUsageAnchors()));
  ok(c.reads >= 3, `⑤ RED CONTROL the kept line cut (the release's lastAnchor): the steady sweep read the anchors folder ${c.reads} times on the loop`, c);
}
{
  const D6 = seedData();
  const W6 = await quiet(async () => engineOf(engineWith(A_SRC, anchored(E_SRC, VIEW_STEP, '      step(k, g);\n', 'the fresh step without its view'), 'view-cut'), D6));
  await W6.eng.usageAnchors.prime();
  moveCache(D6, 'A', D6.last.A.fetchedAt + 600e3);
  const c = await counting(D6.aDir, () => quiet(() => W6.eng.sweepUsageAnchors()));
  ok(c.reads > 0, `⑤ RED CONTROL the view cut: the fresh step's estimator read the anchors folder ${c.reads} times on the loop (${c.calls.filter((k) => READS.includes(k)).join(', ')})`, c);
}
{
  const RepairCut = M.load('src/reading-repair.js', anchored(R_SRC, REPAIR_NOTE, '', 'the repair without its notice'), 'repair-notice-cut');
  const s = await rewriteScene(ENG, RepairCut);
  ok(s.after !== r4.after, `⑤ RED CONTROL the repair's notice cut: the kept line still names the dropped reading — the sweep anchored nothing (${s.after} lines; the release ${r4.after})`, { cut: s, release: r4 });
}
report();
