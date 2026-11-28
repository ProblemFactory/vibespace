#!/usr/bin/env node
// B-7a30 (the owner's hub witness, 2026-11-17: 17.2 s held in 13 holds — the kept store stat'ed a folder per ephemeral profile on
// every active-sessions broadcast, and the keeper's ephemeralFor(bk) built every ephemeral row to find one). THE LAW (主开发): a kept
// folder's PRESENCE is a KEPT FACT (src/server/browser-kept.js) — set by the keeper's own acts, checked again OFF the loop on its own
// tick (10 s); a VIEW reads what the last check found, an ACT awaits a fresh check through ONE door. In-process, no server:
//   ① THE COUNT: one list() calls 0 sync fs functions at 5 and at 50 kept folders (brief + get of each: 0)
//      CONTROL: today's store with the release's lines planted back (c39de1224's dirThere: a statSync at every read) — one
//      sync call per kept folder (5 / 50) ⇒ ① RED (a patched copy: no git object is read — test-architecture §75)
//   ② a view never shows «present» for a folder never checked since the boot: «checking» (the page's own words «checking…»),
//      and the first check that lands redraws it (one notification); a stop the hub only FOUND at its boot sets no presence
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
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
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
// the same count held open until `fn`'s promise settles: the checks a read STARTS are counted too (a check that statSync'd
// inside its microtask would escape the synchronous count)
async function syncCallsUntil(fn) {
  const real = {}; let n = 0; const seen = [];
  for (const k of SYNC) { real[k] = fs[k]; fs[k] = function (...a) { n++; seen.push(k); return real[k].apply(this, a); }; }
  try { await fn(); } finally { for (const k of SYNC) fs[k] = real[k]; }
  return { n, seen: [...new Set(seen)] };
}
const stoppedKeeper = () => ({ ephemeralFor: () => ({ live: false, state: 'stopped' }), profileDirRegistered: () => false, registeredDirs: () => [] });   // r3786: the keeper's registered folders carried
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
const cut = (srcText, anchor, by, what) => { ok(verdictOf(srcText.includes(anchor)), `control setup: ${what} is where the control cuts`); return editAnchor(srcText, anchor, by, "the text handed to cut()"); };

console.log('① THE COUNT: sync fs calls on the main loop for one list()');
async function countAt(KS, n, tag) {
  const dir = path.join(ROOT, 'count-' + tag + '-' + n);
  const X = world(KS, dir);
  const keys = keptFolders(X.S, n);
  X.S.list(); if (X.S.recheckAll) await X.S.recheckAll(); // warm: the file loaded, every folder checked once
  X.step(60 * 1000); // past the bound: a read now asks for the pass — off the loop
  const l = await syncCallsUntil(async () => { X.S.list(); if (X.S.recheckAll) await X.S.recheckAll(); }); // the list + the checks it started
  X.step(60 * 1000);
  const b = await syncCallsUntil(async () => { for (const k of keys) { X.S.brief(k); X.S.get(k); } if (X.S.recheckAll) await X.S.recheckAll(); });
  X.S.shutdown();
  return { list: l, each: b };
}
for (const n of [5, 50]) {
  const c = await countAt(KEPT, n, 'now');
  ok(c.list.n === 0 && c.each.n === 0, `① THE COUNT at ${n} kept folders: one list() — and the checks it starts, counted to their end — calls ${c.list.n} sync fs functions, a brief + a get of each ${c.each.n} — 0`, c);
}
{
  // the release's lines (c39de1224's dirThere) planted back into today's judgement — a patched copy, no git object read
  const RELEASE = "    const v = (() => { try { return fs.statSync(dirOf(e.browserKey)).isDirectory(); } catch { return false; } })(); // c39de1224's dirThere: a statSync at every read";
  const KR = MUT.load('src/server/browser-kept.js', cut(ksSrc, '    const v = presenceFor(e.browserKey);', RELEASE, 'the store\'s judgement (for the release\'s lines)'), 'release');
  for (const n of [5, 50]) {
    const c = await countAt(KR, n, 'release');
    ok(c.list.n >= n, `CONTROL: the release's lines — one list() at ${n} kept folders calls ${c.list.n} sync fs functions (${c.list.seen.join(', ')}): one per folder, ① is RED on it`, c);
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
  ok(gateOf(r.g) && r.g.kind === 'checking' && r.g.dir === null && r.b.kind === 'checking' && gateOf(r.l) && r.l.kind === 'checking' && r.l.checking === true && r.l.hasDir === true, '② a restart, its folder not checked yet: get / brief / list say «checking» (no directory; hasDir stays the entry\'s word for the readers that need «may hold a profile») — never «its logins»', { g: r.g && r.g.kind, b: r.b && r.b.kind, l: r.l && { kind: r.l.kind, checking: r.l.checking, hasDir: r.l.hasDir } });
  ok(r.after === 'full' && r.sent === 1, `② …the first check lands: the view redraws to «its logins» with ONE notification (${r.sent})`, r);
  const fact = { own: { state: 'stopped', kept: { kind: 'checking', tabs: 0 } } };
  // a stop the hub only FOUND at its boot (`restart`: a browser that died while it was down) observed no folder
  const bootLeg = async (KS, tag) => {
    const dir = path.join(ROOT, 'boot-' + tag); const k = keyOf(77); fs.mkdirSync(path.join(dir, 'browser-profiles', k), { recursive: true });
    const X = world(KS, dir); X.S.noteStop(k, { why: 'restart', hasDir: true, tabs: [{ url: 'https://boot.test/' }] });
    const before = X.S.get(k).kind; await X.S.recheckAll(); const after = X.S.get(k).kind; X.S.shutdown();
    return { before, after };
  };
  const KB2 = MUT.load('src/server/browser-kept.js', cut(ksSrc, "    if (dirKept && w !== 'restart') setThere(bk, true);", '    if (dirKept) setThere(bk, true);', 'the stop\'s «a boot saw no folder» rule'), 'bootbit');
  const [bt, bc] = await Promise.all([bootLeg(KEPT, 'now'), bootLeg(KB2, 'control')]);
  ok(bt.before === 'checking' && bt.after === 'full', `② a stop found at a boot (\`restart\`) says «checking» until the first check (${bt.before} → ${bt.after}) — never «its logins» off the file`, bt);
  ok(bc.before === 'full', `CONTROL: a store whose boot-found stop sets the presence says «${bc.before}» unchecked — ② is RED on it`, bc);
  // B-7a30 unit 1' cure (its verdict's word): the store's pass that ENDED WITHOUT AN AWAIT has its own RED control — a read in the
  // same synchronous run must get a NEW pass, never the finished one (the release-style `.finally` clear handed that one out)
  const passLeg = async (KS, tag) => {
    const dir = path.join(ROOT, 'pass-' + tag); const k = keyOf(88); fs.mkdirSync(path.join(dir, 'browser-profiles', k), { recursive: true });
    const X = world(KS, dir);
    X.S.recheckAll(); // nothing kept yet: this pass's body ends without an await
    X.S.noteStop(k, { why: 'restart', hasDir: true, tabs: [{ url: 'https://pass.test/' }] }); // a stop found at a boot: no presence set
    X.S.get(k); // the read asks for the pass — in the same synchronous run
    await X.S.recheckAll();
    const kind = X.S.get(k).kind; X.S.shutdown();
    return kind;
  };
  const KSP = MUT.load('src/server/browser-kept.js', cut(cut(ksSrc, '    if (thereTick && !thereTick.done) return thereTick.p;', '    if (thereTick) return thereTick.p;', 'the store pass\'s «ended» test'),
    '      } finally { pass.done = true; if (thereTick === pass) thereTick = null; }', '      } finally { Promise.resolve().then(() => { if (thereTick === pass) thereTick = null; }); }', 'the store pass\'s own end'), 'store-stalepass');
  const [pt, pc] = await Promise.all([passLeg(KEPT, 'now'), passLeg(KSP, 'control')]);
  ok(pt === 'full', `② a read in the same run as a pass that ended without an await gets a NEW pass — its folder is checked (${pt})`, pt);
  ok(pc === 'checking', `CONTROL: a store whose pass is cleared one microtask after it ended hands that finished pass to the read — the folder is never checked (${pc}) — ② is RED on it`, pc);
  const KBN = require('../src/browser-kept.js');
  ok(gateOf(/its logins are still there/.test(KBN.keptNoteText({ why: 'user', tabs: 2 }))) && !/logins/.test(KBN.keptNoteText({ why: 'user', tabs: 2, logins: false })), '② the agent\'s «kept» note names its logins only for a folder the last check found (a folder still being checked, fenced or tabs only: not said)');
  ok(gateOf(BF.KEPT_KINDS.includes('checking')) && BF.keptLineWords(fact, (s) => s) === 'checking…' && BF.ownResumable(fact) === false && BF.ownResumable({ own: { state: 'stopped', kept: { kind: 'checking', tabs: 2 } } }) === true, '② the live view\'s kept line says the page\'s own words «checking…»; its Resume is drawn only for what is surely kept (its tabs), never for unchecked logins');
  const tv = fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8');
  ok(gateOf(tv.includes("if (k.kind === 'checking') ident.appendChild(el('span', 'bprof-chip', t('checking…')));")) && verdictOf(tv.includes("e.kept && e.kept.kind === 'checking' ? t('Stop this browser now — the conversation\\'s next command starts it again (what it keeps is still being checked)')")), '② the Agent browser panel: a kept row\'s chip says «checking…»; a running row\'s Stop still says what Stop does and that what it keeps is being checked (source pin)');
  ok(gateOf(c.g) && c.g.kind === 'full', `CONTROL: a store whose judgement skips «checking» says «${c.g && c.g.kind}» for a folder nobody checked since the boot — ② is RED on it`, c.g && c.g.kind);
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
  const k3 = keyOf(50); X.S.noteStop(k3, { why: 'idle', hasDir: false, tabs: [{ url: 'https://tabs-only.test/' }] }); // tabs only: no folder kept
  const t0 = Date.now();
  const f1 = await threw(() => X.S.forget(k));
  const waited = Date.now() - t0;
  const stats1 = st.stats();
  const f2 = await threw(() => X.S.forget(k2)); // while the first check hangs: refused at once, no second stat
  const stats2 = st.stats();
  const f4 = await threw(() => X.S.forget(k3)); // no folder to confirm: never refused for another folder's disk
  const gv = X.S.get(k); const view = gv ? gv.kind : null;
  const kept1 = X.S.has(k) && fs.existsSync(X.S.dirOf(k));
  st.release(); await X.S.recheckAll();
  const f3 = await threw(() => X.S.forget(k));
  const gone = !X.S.has(k);
  X.S.shutdown();
  return { f1: f1 && f1.code, words: f1 && f1.message, waited, stats1, f2: f2 && f2.code, words2: f2 && f2.message, stats2, f4: f4 && f4.code, view, kept1, f3: f3 && f3.code, gone };
}
{
  const r = await forgetLeg(KEPT, 'now');
  ok(r.f1 === 'kept_unconfirmed' && gateOf(/did not answer within/.test(r.words)) && r.waited >= ACT_MS - 20 && verdictOf(r.kept1), `④ a stall placed in the folder check: forget is refused by name past the bound (kept_unconfirmed after ${r.waited} ms, bound ${ACT_MS} ms) — the entry and its folder untouched`, r);
  ok(r.f2 === 'kept_unconfirmed' && gateOf(/the disk that holds the kept browsers is not answering/.test(r.words2)) && r.stats2 === r.stats1, `④ while that check hangs a second act is refused at once, in the disk's words (never «its folder» for one nobody asked), with NO second stat (${r.stats1} → ${r.stats2})`, r);
  ok(r.f4 === null, `④ a forget of an entry with no kept folder (tabs only) is never refused for the disk (${r.f4})`, r);
  ok(r.view === 'checking', `④ while the check hangs a view says «checking» (${r.view}) — a hung disk is never read as «its logins»`, r);
  ok(r.f3 === null && verdictOf(r.gone), '④ released, the check answers: the forget goes through', r);
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
  const rf = ks.slice(ks.indexOf('  async function resumeFor('), ks.indexOf('\n  }\n', ks.indexOf('  async function resumeFor(')));
  const doorAt = rf.indexOf('await ks.checkThere(bk);'), labelAt = rf.indexOf('adoptedLabelOf(bk)');
  ok(doorAt > 0 && labelAt > doorAt, '⑤ resumeFor asks the bounded door BEFORE it resolves the adopted label (that one reads real paths synchronously) — a hung disk refuses by name, never holds the loop (its verdict\'s should)', { doorAt, labelAt });
  ok(gateOf(/return p \? ephRow\(p\) : null;/.test(fnFor)) && !/ephemerals\(\)/.test(fnFor) && verdictOf(/return reg\.profiles\.filter\(isEph\)\.map\(ephRow\);/.test(ks)), '⑤ ephemeralFor(bk) finds ONE profile and builds its row — never ephemerals() (a kept read per ephemeral profile for each lookup)');
}
for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { label: 'CONTROL: ' })) ok(verdictOf(r.pass), r.name, r.detail);
fs.rmSync(ROOT, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
