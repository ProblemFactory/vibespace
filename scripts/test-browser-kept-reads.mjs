#!/usr/bin/env node
// B-7a30 (the owner's hub witness, 2026-11-17: 17.2 s held in 13 holds — the kept store stat'ed a folder per ephemeral profile on
// every active-sessions broadcast, and the keeper's ephemeralFor(bk) built every ephemeral row to find one). THE LAW (主开发): a kept
// folder's PRESENCE is a KEPT FACT (src/server/browser-kept.js) — set by the keeper's own acts, checked again OFF the loop on its own
// tick (10 s); a VIEW reads what the last check found, an ACT awaits a fresh check through ONE door. In-process, no server:
//   ① THE COUNT: one list() calls 0 sync fs functions at 5 and at 50 kept folders (brief + get of each: 0)
//      CONTROL: the release's store (git show c39de1224) — one sync call per kept folder (5 / 50) ⇒ ① RED
//   ② a view never shows «present» for a folder never checked since the boot: «checking» (the page's own words «checking…»),
//      and the first check that lands redraws it (one notification)
//      CONTROL: a store whose judgement skips «checking» says «its logins» unchecked ⇒ ② RED
//   ③ a check that changes the answer notifies ONCE; a check that changes nothing sends nothing (a first pass no view drew too)
//      CONTROL: a store that notifies at every check ⇒ ③ RED
//   ④ THE ACT'S DOOR: a stall PLACED in the check (never load) — forget and the keeper's Resume (the user's, the agent's) are
//      refused by name `kept_unconfirmed` past the bound (5 s in the product, ACT_MS here), nothing done; while a check hangs a
//      second act is refused at once with no second stat; a view says «checking»; released, the act goes through
//      CONTROLS: a forget without the door removes a folder nobody confirmed; a keeper without the door goes on past it ⇒ ④ RED
//   ⑤ the keeper's ephemeralFor(bk) builds ONE row (source pin: never ephemerals() for one key)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const threw = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const quiet = { log() { }, warn() { }, error() { } };
const ROOT = scratch('kept-reads');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const ACT_MS = 150; // the acts' bound handed to the store here (THERE_ACT_MS = 5 s in the product)
const SETTLE_MS = 400; // the store's notification is debounced 250 ms (BROADCAST_DEBOUNCE_MS): waited out before a count
const keyOf = (i) => 'bk-' + (0x7a300000 + i).toString(16);
// count every sync fs call while `fn` runs (the census's question, asked of the reads)
const SYNC = Object.keys(fs).filter((k) => k.endsWith('Sync') && typeof fs[k] === 'function');
function syncCalls(fn) {
  const real = {}; let n = 0; const seen = [];
  for (const k of SYNC) { real[k] = fs[k]; fs[k] = function (...a) { n++; seen.push(k); return real[k].apply(this, a); }; }
  try { fn(); } finally { for (const k of SYNC) fs[k] = real[k]; }
  return { n, seen: [...new Set(seen)] };
}
const stoppedKeeper = () => ({ ephemeralFor: () => ({ live: false, state: 'stopped' }), profileDirRegistered: () => false });
/** A store over `dir` on a stepped clock; `stall` (when given) PLACES a stall in its folder check until released. */
function world(KEPT, dir, { stall = null } = {}) {
  let clock = 1_000_000; let changes = 0;
  const S = KEPT.create({ dataDir: dir, now: () => clock, onChange: () => { changes++; }, keeper: stoppedKeeper, log: quiet, sweepEveryMs: 0, thereEveryMs: 0, thereActMs: ACT_MS,
    ...(stall ? { checkDir: stall.checkDir } : {}) });
  return { S, step: (ms) => { clock += ms; }, changes: () => changes };
}
function staller() {
  const pend = []; let on = true, stats = 0;
  return { checkDir: (p) => { stats++; return on ? new Promise((r) => pend.push(() => r(fs.existsSync(p)))) : fs.promises.stat(p).then((st) => st.isDirectory(), () => false); },
    release: () => { on = false; for (const f of pend.splice(0)) f(); }, stats: () => stats };
}
/** n kept folders on disk, each started and stopped by the store's own acts. → their keys */
function keptFolders(S, n, base = 0) {
  const keys = [];
  for (let i = 0; i < n; i++) { const k = keyOf(base + i); fs.mkdirSync(path.join(S.dirOf(k), 'Default'), { recursive: true }); S.noteStart(k, { hasDir: true, label: 'Kept ' + i }); S.noteStop(k, { why: 'idle', tabs: [{ url: `https://k${i}.test/` }] }); keys.push(k); }
  return keys;
}
const KEPT = require('../src/server/browser-kept.js');
const BF = require('../src/browser-fact.js');
const MUT = mutantCopies('kept-reads', REPO);
const ksSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-kept.js'), 'utf8');
const cut = (srcText, anchor, by, what) => { ok(srcText.includes(anchor), `control setup: ${what} is where the control cuts`); return srcText.replace(anchor, by); };

console.log('① THE COUNT: sync fs calls on the main loop for one list()');
async function countAt(KS, n, tag) {
  const dir = path.join(ROOT, 'count-' + tag + '-' + n);
  const X = world(KS, dir);
  const keys = keptFolders(X.S, n);
  X.S.list(); if (X.S.recheckAll) await X.S.recheckAll(); // warm: the file loaded, every folder checked once
  X.step(60 * 1000); // past the bound: a read now starts its checks — off the loop
  const l = syncCalls(() => { X.S.list(); });
  const b = syncCalls(() => { for (const k of keys) { X.S.brief(k); X.S.get(k); } });
  if (X.S.recheckAll) await X.S.recheckAll();
  X.S.shutdown();
  return { list: l, each: b };
}
for (const n of [5, 50]) {
  const c = await countAt(KEPT, n, 'now');
  ok(c.list.n === 0 && c.each.n === 0, `① THE COUNT at ${n} kept folders: one list() calls ${c.list.n} sync fs functions, a brief + a get of each ${c.each.n} — 0`, c);
}
{
  let base = null; try { base = execFileSync('git', ['-C', REPO, 'show', 'c39de1224:src/server/browser-kept.js'], { encoding: 'utf8' }); } catch { base = null; }
  if (!base) ok(false, 'CONTROL setup: the release\'s browser-kept.js is readable from git (c39de1224)');
  else {
    const KR = MUT.load('src/server/browser-kept.js', base, 'release');
    for (const n of [5, 50]) {
      const c = await countAt(KR, n, 'release');
      ok(c.list.n >= n, `CONTROL: the release's store — one list() at ${n} kept folders calls ${c.list.n} sync fs functions (${c.list.seen.join(', ')}): one per folder, ① is RED on it`, c);
    }
  }
}

console.log('② a view never shows «present» for a folder never checked since the boot');
async function restartLeg(KS, tag) {
  const dir = path.join(ROOT, 'restart-' + tag);
  const A = world(KS, dir); const [k] = keptFolders(A.S, 1); A.S.shutdown();
  const X = world(KS, dir); // a restart: the same file, no check yet
  const g = X.S.get(k), b = X.S.brief(k), l = X.S.list().find((x) => x.browserKey === k);
  const c0 = X.changes();
  await X.S.recheckAll(); await sleep(SETTLE_MS);
  const after = X.S.get(k).kind, sent = X.changes() - c0;
  X.S.shutdown();
  return { g, b, l, after, sent };
}
{
  const KC = MUT.load('src/server/browser-kept.js', cut(ksSrc, "    if (v === null) return { ...e, checking: true };", '    if (v === null) return e;', 'the store\'s «checking» judgement'), 'nochecking');
  const [r, c] = await Promise.all([restartLeg(KEPT, 'now'), restartLeg(KC, 'control')]); // two worlds, their settle waits overlapped
  ok(r.g && r.g.kind === 'checking' && r.g.dir === null && r.b.kind === 'checking' && r.l && r.l.kind === 'checking' && r.l.hasDir === null, '② a restart, its folder not checked yet: get / brief / list say «checking» (no directory, hasDir unknown) — never «its logins»', { g: r.g && r.g.kind, b: r.b && r.b.kind, l: r.l && r.l.kind });
  ok(r.after === 'full' && r.sent === 1, `② …the first check lands: the view redraws to «its logins» with ONE notification (${r.sent})`, r);
  const fact = { own: { state: 'stopped', kept: { kind: 'checking', tabs: 0 } } };
  ok(BF.KEPT_KINDS.includes('checking') && BF.keptLineWords(fact, (s) => s) === 'checking…' && BF.ownResumable(fact) === false && BF.ownResumable({ own: { state: 'stopped', kept: { kind: 'checking', tabs: 2 } } }) === true, '② the live view\'s kept line says the page\'s own words «checking…»; its Resume is drawn only for what is surely kept (its tabs), never for unchecked logins');
  const tv = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  ok(tv.includes("if (k.kind === 'checking') ident.appendChild(el('span', 'bprof-chip', t('checking…')));") && tv.includes("e.kept && e.kept.kind === 'checking' ? t('checking…')"), '② the Agent browser panel: a kept row\'s chip and a running row\'s Stop say «checking…» for an unchecked folder (source pin)');
  ok(c.g && c.g.kind === 'full', `CONTROL: a store whose judgement skips «checking» says «${c.g && c.g.kind}» for a folder nobody checked since the boot — ② is RED on it`, c.g && c.g.kind);
}

console.log('③ a check that changes the answer notifies once; one that changes nothing sends nothing');
async function notifyLeg(KS, tag) {
  const dir = path.join(ROOT, 'notify-' + tag);
  const X = world(KS, dir); const [k] = keptFolders(X.S, 1);
  await sleep(SETTLE_MS); const c0 = X.changes(); // the acts' own notification is theirs
  X.S.get(k); X.step(11 * 1000); X.S.get(k); await X.S.recheckAll(); await sleep(SETTLE_MS);
  const same = X.changes() - c0; // a view drew «its logins», the check found the folder: nothing to say
  fs.rmSync(X.S.dirOf(k), { recursive: true, force: true }); // removed out of band
  X.step(11 * 1000); await X.S.recheckAll(); await sleep(SETTLE_MS);
  const moved = X.changes() - c0 - same; const kind = X.S.get(k).kind;
  X.step(11 * 1000); await X.S.recheckAll(); await sleep(SETTLE_MS);
  const again = X.changes() - c0 - same - moved;
  X.S.shutdown();
  // a first pass that NO view drew (a restart before any read): nothing to redraw, nothing sent
  const dir2 = path.join(ROOT, 'notify-first-' + tag);
  const A = world(KS, dir2); const [k2] = keptFolders(A.S, 1); A.S.shutdown();
  const Y = world(KS, dir2); await Y.S.recheckAll(); await sleep(SETTLE_MS);
  const first = Y.changes(); const kind2 = Y.S.get(k2).kind; Y.S.shutdown();
  return { same, moved, again, kind, first, kind2 };
}
{
  const KN = MUT.load('src/server/browser-kept.js', cut(ksSrc, '      if (told.has(k) && told.get(k) !== v) { told.set(k, v); changed(); }', '      if (true) { told.set(k, v); changed(); }', 'the landing\'s «moved what a view drew» test'), 'everycheck');
  const [r, c] = await Promise.all([notifyLeg(KEPT, 'now'), notifyLeg(KN, 'control')]); // two worlds, their settle waits overlapped
  ok(r.same === 0 && r.moved === 1 && r.again === 0 && r.kind === 'tabs-only', `③ a check that found what the view drew sends nothing (${r.same}); a folder removed out of band — the tick's check sends ONE notification (${r.moved}) and the view says tabs only; the next tick, the same answer: nothing (${r.again})`, r);
  ok(r.first === 0 && r.kind2 === 'full', `③ a first pass after a restart that no view drew sends nothing (${r.first}); the next read answers «its logins» at once`, r);
  ok(c.same > 0 || c.again > 0 || c.first > 0, `CONTROL: a store that notifies at every check sends for checks that changed nothing (same ${c.same}, again ${c.again}, first ${c.first}) — ③ is RED on it`, c);
}

console.log('④ THE ACT\'S DOOR: bounded, and never answers what it did not check');
async function forgetLeg(KS, tag) {
  const dir = path.join(ROOT, 'door-' + tag); const st = staller();
  const X = world(KS, dir, { stall: st });
  const [k, k2] = keptFolders(X.S, 2);
  const t0 = Date.now();
  const f1 = await threw(() => X.S.forget(k));
  const waited = Date.now() - t0;
  const stats1 = st.stats();
  const f2 = await threw(() => X.S.forget(k2)); // while the first check hangs: refused at once, no second stat
  const stats2 = st.stats();
  const gv = X.S.get(k); const view = gv ? gv.kind : null;
  const kept1 = X.S.has(k) && fs.existsSync(X.S.dirOf(k));
  st.release(); await X.S.recheckAll();
  const f3 = await threw(() => X.S.forget(k));
  const gone = !X.S.has(k);
  X.S.shutdown();
  return { f1: f1 && f1.code, words: f1 && f1.message, waited, stats1, f2: f2 && f2.code, stats2, view, kept1, f3: f3 && f3.code, gone };
}
{
  const r = await forgetLeg(KEPT, 'now');
  ok(r.f1 === 'kept_unconfirmed' && /did not answer within/.test(r.words) && r.waited >= ACT_MS - 20 && r.kept1, `④ a stall placed in the folder check: forget is refused by name past the bound (kept_unconfirmed after ${r.waited} ms, bound ${ACT_MS} ms) — the entry and its folder untouched`, r);
  ok(r.f2 === 'kept_unconfirmed' && r.stats2 === r.stats1, `④ while that check hangs a second act is refused at once with NO second stat (${r.stats1} → ${r.stats2}) — never a stack of stuck threads`, r);
  ok(r.view === 'checking', `④ while the check hangs a view says «checking» (${r.view}) — a hung disk is never read as «its logins»`, r);
  ok(r.f3 === null && r.gone, '④ released, the check answers: the forget goes through', r);
  const KF = MUT.load('src/server/browser-kept.js', cut(ksSrc, "    await checkThere(key); // B-7a30 r2: the act's door", "    // (no door) //", 'forget\'s door'), 'nodoor');
  const c = await forgetLeg(KF, 'control');
  ok(c.f1 === null && !c.kept1, `CONTROL: a forget without the door removes a folder nobody confirmed (refusal ${c.f1}) — ④ is RED on it`, c);
}
{
  const K = require('../src/server/browser-keeper.js');
  const F = require('../src/browser-facts.js');
  const BK = keyOf(99);
  async function keeperLeg(Kmod, tag) {
    const W = path.join(ROOT, 'keeper-' + tag); const H = path.join(W, 'home'); const D = path.join(W, 'data');
    fs.mkdirSync(path.join(H, '.agent-browser'), { recursive: true }); fs.mkdirSync(path.join(D, 'browser-profiles'), { recursive: true });
    const rtE = { PATH: '/usr/bin:/bin', HOME: H };
    const st = staller(); let kp = null;
    const ks = KEPT.create({ dataDir: D, keeper: () => kp, liveKeys: () => new Set([BK]), log: quiet, sweepEveryMs: 0, thereEveryMs: 0, thereActMs: ACT_MS, checkDir: st.checkDir });
    kp = Kmod.create({ dataDir: D, homeDir: H, env: () => rtE, liveKeys: () => new Set([BK]), runtime: F.createBrowserRuntime({ env: rtE }), facts: F.createBrowserFacts({ env: rtE }), log: quiet, tickMs: 3600e3, install: false, kept: ks });
    fs.mkdirSync(ks.dirOf(BK), { recursive: true }); ks.noteStop(BK, { why: 'idle', hasDir: true, tabs: [{ url: 'https://kept.test/' }] });
    const ru = await threw(() => kp.resumeFor({ browserKey: BK, sessionId: 's-1', envPairs: [], by: 'user' }));
    const ra = await threw(() => kp.resumeFor({ browserKey: BK, sessionId: 's-1', envPairs: [], by: 'agent' }));
    const started = !!kp.ephemeralFor(BK);
    st.release(); await ks.recheckAll();
    const rr = await threw(() => kp.resumeFor({ browserKey: BK, sessionId: 's-1', envPairs: [], by: 'user' }));
    try { kp.shutdown && kp.shutdown(); } catch { /* none */ }
    ks.shutdown();
    return { user: ru && ru.code, agent: ra && ra.code, started, released: rr && rr.code };
  }
  const r = await keeperLeg(K, 'now');
  ok(r.user === 'kept_unconfirmed' && r.agent === 'kept_unconfirmed' && !r.started, `④ the REAL keeper over a stalled folder check: the user's Resume and the agent's resume are refused by name (${r.user} / ${r.agent}) — nothing started, never «resumed»`, r);
  ok(r.released === 'not_managed', `④ …released, the door answers and the road goes on (this world gives no spawn pairs: ${r.released} — the start itself is the heavy suites')`, r);
  const kSrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const KD = MUT.load('src/server/browser-keeper.js', cut(kSrc, "    if (ks && !reconnect && typeof ks.checkThere === 'function' && typeof ks.has === 'function' && ks.has(bk)) await ks.checkThere(bk);", '    // (no door)', 'the keeper\'s door in resumeFor'), 'keeper-nodoor');
  const c = await keeperLeg(KD, 'control');
  ok(c.user === 'not_managed', `CONTROL: a keeper without the door goes on past a folder nobody confirmed (the user's Resume answers ${c.user}) — ④ is RED on it`, c);
}

console.log('⑤ the keeper\'s ephemeralFor builds one row');
{
  const ks = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const fnFor = ks.slice(ks.indexOf('  function ephemeralFor(browserKey) {'), ks.indexOf('\n', ks.indexOf('  function ephemeralFor(browserKey) {')));
  ok(/return p \? ephRow\(p\) : null;/.test(fnFor) && !/ephemerals\(\)/.test(fnFor) && /return reg\.profiles\.filter\(isEph\)\.map\(ephRow\);/.test(ks), '⑤ ephemeralFor(bk) finds ONE profile and builds its row — never ephemerals() (a kept read per ephemeral profile for each lookup)');
}
for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { label: 'CONTROL: ' })) ok(r.pass, r.name, r.detail);
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
