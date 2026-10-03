#!/usr/bin/env node
// THE ACTION TRACE'S PAGE-SIZE FOLD (lane trace-fits, 2026-10-01 — the owner: "浏览器每次resize窗口或者移动窗口你都会算作一次操作，
// 导致我的操作列表里全是view fit操作，毫无信息量 … 但也不要完全不要这个信息"). In the busiest production profile 37 of 194
// trace entries were `viewer-fit` rows (the live view's own re-fit of the page on every drag / resize / snap / desktop
// switch), each with a 3 KB before and a 33 KB after frame — the Actions pane and the tool card counted page sizes as
// actions. The fast gate:
//   ① PURE (src/browser-trace.js): `fitCoalesceVerdict` — a fit within FIT_COALESCE_MS of the previous fit of the SAME
//      browser + scope REPLACES it; another traced action between ⇒ a new run; another browser ⇒ never; `coalesceFits`
//      keeps the FIRST at / id / before frame, takes the LAST geometry / result / after frame, counts `n`, stamps `lastAt`;
//   ② PURE: `foldFits` — consecutive fits fold into ONE row (a click between splits, `expand` undoes it); `traceSummary`
//      and `scopeDigest` count agent actions and report fits beside them, never in them;
//   ③ THE FLOOD through the REAL recorder (src/server/browser-trace.js) over a fake bridge: a synthetic trace in the
//      production census's shape (157 agent actions + 37 fits in 10 storms) ⇒ 10 fit rows on disk, every superseded
//      after frame unlinked at once, the index (append-only: a later line under the same id supersedes) folded at reload,
//      a fit after a click and a fit 11 s later each start a new run, the session count excludes fits;
//   ④ PURE + the recorder: the size sweep drops page-size frames FIRST (`traceSizePlan`), `usageOf` / `housekeeping`
//      report fit bytes beside the agent actions' bytes;
//   ⑤ patched-copy CONTROLS (scripts/mutant-copy.mjs), one per rule: a verdict blind to the action between, a fold that
//      never folds, a plan without the fit-first pass, a recorder that leaves the superseded frame — each RED by name;
//   ⑥ wiring pins: the three surfaces (Actions pane, tool card, replay) and the route's `summary` read `foldFits` /
//      `traceSummary`; the bridge's fit storm is bounded upstream (F4: ONE in flight per relay, the latest geometry wins —
//      `scheduleFit` re-arms one timer, `runFit` parks `fitAgain`); the toggle has a label; zh + ja for every new word;
//      ci.mjs carries this suite.
// ~190 ms, scratch dirs only, no browser, no vendor call.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
const T = require('../src/browser-trace.js');
const BS = require('../src/browser-sessions.js');
const R = require('../src/server/browser-trace.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const quiet = { log() { }, warn() { } };
const MB = 1048576, DAY = 86400000, SEC = 1000;
const ROOT = scratch('browser-trace');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { fs.rmSync(ROOT, { recursive: true, force: true }); });
const M = mutantCopies('browser-trace', REPO);
const KA = 'bk-0000000a', KB = 'bk-0000000b', P1 = 'bp-00000001';
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const built = typeof T.fitCoalesceVerdict === 'function' && typeof T.foldFits === 'function' && typeof T.coalesceFits === 'function';
ok(built, 'the PURE fold exists (fitCoalesceVerdict / coalesceFits / foldFits in src/browser-trace.js)');

// ── the recorder world: a stub keeper + a fake bridge whose taps the suite pushes records into ──
function world(name) {
  const DATA = path.join(ROOT, name, 'data'); fs.mkdirSync(DATA, { recursive: true });
  const reg = { profiles: [{ id: P1, label: 'work', provider: 'chromium', dir: path.join(ROOT, name, 'p1'), record: false, host: null }], leases: [], browsers: { [P1]: { state: 'ready', pid: 1 } } };
  const fns = new Set();
  const keeper = { profile: (id) => reg.profiles.find((p) => p.id === id) || null, browserOf: (id) => reg.browsers[id] || null, leasesOn: (id) => reg.leases.filter((l) => l.profileId === id), _reg: () => reg, isEphemeral: () => false, onLease: (fn) => { fns.add(fn); return () => fns.delete(fn); }, addDigest: () => () => { }, list: () => ({ profiles: reg.profiles }), holdersFor: () => [] };
  const taps = new Map();
  const bridge = { _relays: new Map(), async tap(sessionId, ref, fn) { const key = `${sessionId}|${ref}`; taps.set(key, fn); this._relays.set(key, { key, sessionId, browserKey: sessionId === 's-b' ? KB : KA, target: { kind: 'attachment', profileId: P1 } }); return { ok: true, key, untap: () => taps.delete(key) }; }, broadcastTo() { return 1; } };
  const emit = (ev) => { const out = []; for (const f of fns) out.push(f(ev)); return Promise.all(out.filter(Boolean)); };
  const push = (key, msg) => { const fn = taps.get(key); if (!fn) throw new Error('no tap ' + key); fn(msg, JSON.stringify(msg), bridge._relays.get(key)); };
  return { DATA, reg, keeper, bridge, emit, push, taps };
}
let clock = 2000 * DAY;
const now = () => clock;
const settings = { 'browser.actionTrace': true };
const mkRecorder = (w, bc, Rmod = R, extra = {}) => Rmod.create({ dataDir: w.DATA, homeDir: path.join(ROOT, 'home'), keeper: w.keeper, bridge: w.bridge, serverSetting: (k) => settings[k], broadcast: (m) => bc.push(m), log: quiet, now, sweepEveryMs: 0, execFileImpl: (c, a, o, cb) => setTimeout(() => cb(null, '', ''), 1), ...extra });
const jpeg = (tag, size = 0) => Buffer.from('JPEG-' + tag + (size ? '-' + 'x'.repeat(size) : '')).toString('base64');
let seq = 0;
/** One agent action on a tap: a frame before, the command, its result 10 ms later, a frame 500 ms after it. */
function action(w, key, id, { action = 'click', params = { x: 5, y: 6 } } = {}) {
  w.push(key, { type: 'frame', seq: ++seq, data: jpeg(id + 'b'), metadata: { deviceWidth: 800, deviceHeight: 600 } });
  w.push(key, { type: 'command', id, action, params });
  clock += 10; w.push(key, { type: 'result', id, action, data: {} });
  clock += 500; w.push(key, { type: 'frame', seq: ++seq, data: jpeg(id + 'a'), metadata: { deviceWidth: 800, deviceHeight: 600 } });
}
/** The live view's own re-fit as the bridge taps it (src/server/browser-stream.js tapOwnSet): ONE command + result pair, then the reflowed frame. */
function fit(w, key, id, width, height, { why = 'fit', afterBytes = 3000 } = {}) {
  const params = { width, height, why };
  w.push(key, { type: 'command', action: 'viewer-fit', id, params, timestamp: 0 });
  w.push(key, { type: 'result', action: 'viewer-fit', id, success: true, data: { ...params }, timestamp: 0 });
  clock += 500; w.push(key, { type: 'frame', seq: ++seq, data: jpeg(id + 'a', afterBytes), metadata: { deviceWidth: width, deviceHeight: height } });
}
const filesOf = (w, scope = P1) => { try { return fs.readdirSync(path.join(w.DATA, 'browser-trace', scope)); } catch { return []; } };
const indexLines = (w, scope = P1) => { try { return fs.readFileSync(path.join(w.DATA, 'browser-trace', scope, 'index.ndjson'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const isFit = (e) => e && e.action === 'viewer-fit';
/** The production census's shape: 157 agent actions with 10 fit storms (37 fits) between them. */
const STORMS = [4, 3, 5, 3, 4, 3, 5, 4, 3, 3];
const STORM_AT = [10, 25, 40, 55, 70, 85, 100, 115, 130, 145];
async function flood(w, key) {
  let fits = 0, acts = 0;
  for (let i = 0; i < 157; i++) {
    action(w, key, `c${i}`, i % 7 === 3 ? { action: 'navigate', params: { url: `https://shop.example/p/${i}` } } : {});
    acts++;
    clock += 3 * SEC;
    const s = STORM_AT.indexOf(i);
    if (s >= 0) {
      for (let k = 0; k < STORMS[s]; k++) { fit(w, key, `f${fits}`, 1000 + fits, 900, { afterBytes: 3000 }); fits++; clock += 2 * SEC; } // a drag: one re-fit every 2.5 s
      clock += 3 * SEC;
    }
  }
  return { fits, acts };
}

// ═══ ① PURE: the coalesce verdict and the merge ═══════════════════════════════
console.log('— ① the coalesce verdict: same browser within 10 s ⇒ replaced; another action between ⇒ a new run; another browser ⇒ never');
if (built) {
  const prev = { id: 'tr-000000000001', action: 'viewer-fit', at: 1000, lastAt: 1000, n: 1, browserKey: KA, scope: P1, profileId: P1, before: { file: 'tr-000000000001-before.jpg', bytes: 10 }, after: { file: 'tr-000000000001-after.jpg', bytes: 20 }, params: { width: 1000, height: 900, why: 'fit' }, position: { kind: 'viewport', width: 1000, height: 900, why: 'fit' }, text: 'live view: set viewport 1000 900 (fit)', browserSession: 'bs-00000001' };
  const next = { id: 'tr-000000000002', action: 'viewer-fit', at: 1000 + 4 * SEC, browserKey: KA, scope: P1, profileId: P1, before: { file: 'tr-000000000002-before.jpg', bytes: 11 }, after: { file: 'tr-000000000002-after.jpg', bytes: 22 }, params: { width: 1072, height: 907, why: 'fit' }, position: { kind: 'viewport', width: 1072, height: 907, why: 'fit' }, text: 'live view: set viewport 1072 907 (fit)', ok: true, browserSession: 'bs-00000001' };
  const V = (p, n, o) => T.fitCoalesceVerdict(p, n, o);
  ok(T.FIT_COALESCE_MS === 10 * SEC, `FIT_COALESCE_MS is 10 s (${T.FIT_COALESCE_MS})`);
  ok(V(prev, next).coalesce === true, 'the same browser + scope, 4 s after the last fit ⇒ coalesce');
  ok(V(prev, { ...next, at: 1000 + 10 * SEC }).coalesce === true && V(prev, { ...next, at: 1000 + 10 * SEC + 1 }).coalesce === false, 'exactly 10 s still coalesces; 10 s + 1 ms starts a new run');
  ok(V({ ...prev, lastAt: 1000 + 8 * SEC }, { ...next, at: 1000 + 15 * SEC }).coalesce === true, 'the window is measured from the run\'s LAST fit (`lastAt`), not its first — a long drag stays one row');
  ok(V(prev, next, { between: { action: 'click', id: 'c1', at: 1000 + 2 * SEC } }).coalesce === false && /click/.test(V(prev, next, { between: { action: 'click', id: 'c1', at: 1000 + 2 * SEC } }).why), 'a traced action between the two fits ⇒ a new run (the reflow between two agent actions stays its own row), named');
  ok(V(prev, { ...next, browserKey: KB }).coalesce === false && V(prev, { ...next, scope: 'ephemeral', profileId: null }).coalesce === false, 'another browser (key) or another scope ⇒ never');
  ok(V(null, next).coalesce === false && V({ ...prev, action: 'click' }, next).coalesce === false && V(prev, { ...next, action: 'click' }).coalesce === false, 'no previous fit / a previous click / a next click ⇒ never');
  ok(V(prev, next, { coalesceMs: 3 * SEC }).coalesce === false, 'the window is a parameter (3 s ⇒ 4 s apart is a new run)');
  const m = T.coalesceFits(prev, next);
  ok(m.id === prev.id && m.at === prev.at && m.lastAt === next.at && m.n === 2 && m.before.file === prev.before.file && m.after.file === next.after.file && m.afterSame === false && m.params.width === 1072 && m.position.width === 1072 && m.text === next.text && m.ok === true && m.browserSession === 'bs-00000001', 'the merge keeps the FIRST id / at / before frame / session, takes the LAST geometry / text / result / after frame, counts n, stamps lastAt', m);
  ok(T.coalesceFits({ ...m }, { ...next, id: 'tr-000000000003', at: 1000 + 7 * SEC }).n === 3 && T.coalesceFits(prev, { ...next, after: null }).after.file === prev.after.file, 'n accumulates over a run; a fit with no new after frame keeps the run\'s');
  ok(BS.FIT_ACTION === T.FIT_ACTION && T.FIT_ACTION === 'viewer-fit', 'browser-sessions.js (imports nothing) spells the fit action exactly as browser-trace.js does');
  ok(T.isFitEntry(prev) && !T.isFitEntry({ action: 'click' }) && !T.isFitEntry({ action: 'viewport', kind: 'viewport' }) && T.fitCount(m) === 2 && T.fitCount({ action: 'click' }) === 0, 'isFitEntry names only the live view\'s `viewer-fit` (the agent\'s own `viewport` verb is not one); fitCount reads n');
}

// ═══ ② PURE: the fold and the counts ═══════════════════════════════════════════
console.log('— ② foldFits: consecutive fits are ONE row; a click between splits; expand undoes; the counts exclude fits');
if (built) {
  const e = (id, at, x = {}) => ({ id, at, action: 'click', ok: true, ...x });
  const f = (id, at, w, x = {}) => ({ id, at, lastAt: at, n: 1, action: 'viewer-fit', ok: true, params: { width: w, height: 900, why: 'fit' }, position: { kind: 'viewport', width: w, height: 900, why: 'fit' }, text: `live view: set viewport ${w} 900 (fit)`, ...x });
  const list = [e('tr-0000000000c1', 1000), f('tr-0000000000f1', 2000, 1000), f('tr-0000000000f2', 3000, 1010, { n: 3, lastAt: 6000 }), e('tr-0000000000c2', 7000, { ok: false }), f('tr-0000000000f3', 8000, 1072), e('tr-0000000000c3', 9000)];
  const rows = T.foldFits(list);
  ok(rows.length === 5 && rows.map((r) => r.kind).join() === 'entry,fits,entry,fits,entry', `two consecutive fits fold into ONE row, a click between keeps two runs apart (${rows.map((r) => r.kind).join(' ')})`);
  const run = rows[1];
  ok(run.id === 'tr-0000000000f1' && run.n === 4 && run.at === 2000 && run.lastAt === 6000 && run.last.id === 'tr-0000000000f2' && run.entries.length === 2 && run.last.position.width === 1010, 'the fold row is keyed by its FIRST fit, counts every coalesced fit (1 + 3), spans first at → last lastAt, names the LAST geometry', run);
  const ex = T.foldFits(list, { expand: true });
  ok(ex.length === 6 && ex.every((r) => r.kind === 'entry') && ex.filter((r) => r.fit).length === 3, 'expand: every fit is its own row, marked `fit`');
  ok(T.foldFits([]).length === 0 && T.foldFits(null).length === 0 && T.foldFits([f('tr-0000000000f9', 1, 5)]).length === 1 && T.foldFits([f('tr-0000000000f9', 1, 5)])[0].kind === 'fits', 'an empty list folds to nothing; a lone fit is a fits row of one');
  ok(T.visibleEntries(rows).map((x) => x.id).join() === 'tr-0000000000c1,tr-0000000000f2,tr-0000000000c2,tr-0000000000f3,tr-0000000000c3', 'visibleEntries: the agent actions and the LAST fit of each run (what the dialog steps through)');
  const s = T.traceSummary(list);
  ok(s.n === 3 && s.failed === 1 && s.fits === 5 && s.first === 1000 && s.last === 9000, `traceSummary: n counts agent actions (3), failed theirs (1), fits beside them (5 = 1 + 3 + 1) — never in n (${JSON.stringify(s)})`);
  const d = T.scopeDigest([...list.map((x) => ({ ...x, before: { bytes: 10 }, after: { bytes: 20 } }))]);
  ok(d.n === 3 && d.fits === 5 && d.bytes === 180 && d.fitBytes === 90 && d.last === 9000, `scopeDigest: n = agent actions, fits beside, fitBytes = the fits' frames (${JSON.stringify(d)})`);
  // the session count excludes fits too (the end card's "N actions")
  const ss = BS.pairSessions({ markers: [BS.markerFor({ phase: 'start', id: 'bs-00000001', browserKey: KA, profileId: P1, at: 500 })], entries: list.map((x) => ({ ...x, browserKey: KA, profileId: P1, browserSession: 'bs-00000001' })), now: 10000 });
  ok(ss.length === 1 && ss[0].count === 3 && ss[0].fits === 5, `pairSessions: a session counts its agent actions (3) and its fits beside (5) (${ss[0].count} / ${ss[0].fits})`);
}

// ═══ ③ THE FLOOD through the real recorder ═══════════════════════════════════════
console.log('— ③ the flood: 157 agent actions + 37 fits in 10 storms through the REAL recorder');
const w1 = world('w1');
const bc1 = [];
const tr1 = mkRecorder(w1, bc1);
tr1.install();
w1.reg.leases.push({ profileId: P1, browserKey: KA, sessionId: 's-a' });
await w1.emit({ kind: 'attach', browserKey: KA, profileId: P1, sessionId: 's-a' });
const K1 = `s-a|${P1}`;
{
  const { fits, acts } = await flood(w1, K1);
  const all = tr1.list({ profileId: P1, limit: 1000 });
  const fitRows = all.filter(isFit);
  const files = filesOf(w1);
  const fitAfterFiles = files.filter((f) => /^tr-[0-9a-f]{12}-after/.test(f) && fitRows.some((e) => e.after && e.after.file === f));
  const fitBytes = fitRows.reduce((n, e) => n + T.entryFrameBytes(e), 0);
  const allJpg = files.filter((f) => f.endsWith('.jpg'));
  console.log(`  census: ${all.length} entries (${acts} agent actions + ${fits} fits pushed) — ${fitRows.length} fit rows carrying ${fitRows.reduce((n, e) => n + (e.n || 1), 0)} fits; ${allJpg.length} frame files on disk, ${fitAfterFiles.length} of them fit after-frames (${Math.round(fitBytes / 1024)} KB of fit frames)`);
  ok(acts === 157 && fits === 37, 'the synthetic trace has the census\'s shape (157 agent actions, 37 fits in 10 storms)');
  ok(all.filter((e) => !isFit(e)).length === 157, 'every agent action is its own entry (157)');
  ok(fitRows.length === STORMS.length, `the 37 fits land as ${STORMS.length} rows — one per storm (${fitRows.length})`);
  ok(fitRows.map((e) => e.n).join() === STORMS.join(), `each row counts its storm's fits: n = ${STORMS.join(',')} (${fitRows.map((e) => e.n).join(',')})`);
  const r0 = fitRows[0];
  ok(r0 && r0.n === 4 && r0.lastAt > r0.at && r0.lastAt - r0.at === 3 * 2500 && r0.params.width === 1003 && r0.position.width === 1003 && /set viewport 1003 900/.test(r0.text), `a row keeps the FIRST at and the LAST geometry (at → lastAt = ${r0 && (r0.lastAt - r0.at)} ms; ${r0 && r0.text})`);
  ok(r0 && r0.before && r0.before.file && r0.after && r0.after.file && r0.after.file !== r0.before.file && files.includes(r0.before.file) && files.includes(r0.after.file) && Buffer.from(fs.readFileSync(path.join(w1.DATA, 'browser-trace', P1, r0.after.file))).toString().startsWith('JPEG-f3a'), 'the row\'s before frame is the FIRST fit\'s, its after frame the LAST fit\'s, both on disk');
  ok(allJpg.length === 157 * 2 + STORMS.length * 2, `every superseded fit frame is gone at once: ${allJpg.length} frame files = 157 × 2 agent frames + ${STORMS.length} × 2 fit frames (never left for the sweep)`);
  const lines = indexLines(w1);
  ok(lines.length === 157 + 37 && new Set(lines.map((l) => l.id)).size === 157 + STORMS.length, `the index stays APPEND-ONLY: ${lines.length} lines (one per fit landed), ${new Set(lines.map((l) => l.id)).size} ids — a later line under the same id supersedes the earlier`);
  // a fresh recorder over the same directory folds the file at load: the same entries, the same counts
  const tr1b = mkRecorder(w1, []);
  const all2 = tr1b.list({ profileId: P1, limit: 1000 });
  ok(all2.length === all.length && all2.filter(isFit).map((e) => e.id + ':' + e.n).join() === fitRows.map((e) => e.id + ':' + e.n).join(), 'a reload folds the index: the same 167 entries, each fit row once with its count');
  ok(JSON.parse(fs.readFileSync(path.join(w1.DATA, 'browser-trace', P1, r0.id + '.json'), 'utf8')).n === 4, 'the entry\'s own <id>.json is rewritten with the run');
  // the stream + the broadcast carry the replaced row under its id
  const appended = bc1.filter((m) => m.type === 'browser-trace-appended' && m.entry && m.entry.action === 'viewer-fit');
  ok(appended.length === 37 && appended.filter((m) => m.entry.replaced).length === 37 - STORMS.length && appended.filter((m) => m.entry.id === r0.id).length === 4 && appended.filter((m) => m.entry.id === r0.id).pop().entry.n === 4, 'every fit is broadcast (37); a coalesced one rides as `replaced` under the run\'s id with its count (the clients patch the row in place)');
  // the session counts agent actions; the fits ride beside
  const ss = tr1.sessions({ browserKey: KA });
  ok(ss.length === 1 && ss[0].count === 157 && ss[0].fits === 37, `the session counts 157 agent actions, 37 fits beside (${ss[0] && ss[0].count} / ${ss[0] && ss[0].fits})`);
  // a fit after a click starts a new run; a fit 11 s after the last starts a new run; one 9 s after does not
  const n0 = tr1.list({ profileId: P1, limit: 1000 }).filter(isFit).length;
  clock += 30 * SEC;
  fit(w1, K1, 'g1', 1100, 800); clock += 9 * SEC;
  fit(w1, K1, 'g2', 1101, 800); clock += 11 * SEC;
  fit(w1, K1, 'g3', 1102, 800); clock += SEC;
  action(w1, K1, 'c-between'); clock += SEC;
  fit(w1, K1, 'g4', 1103, 800);
  const later = tr1.list({ profileId: P1, limit: 1000 }).filter(isFit).slice(n0);
  ok(later.length === 3 && later.map((e) => e.n).join() === '2,1,1' && later[0].params.width === 1101 && later[1].params.width === 1102 && later[2].params.width === 1103, `9 s after the last ⇒ the same run (n 2); 11 s after ⇒ a new run; a click between ⇒ a new run (${later.map((e) => e.n).join(',')})`);
  // an agent action right after a storm does not inherit anything (its own before frame, no n)
  const c = tr1.list({ profileId: P1, limit: 1000 }).find((e) => e.id && !isFit(e) && e.at > later[1].at);
  ok(c && c.n === undefined && c.lastAt === undefined, 'an agent action carries no n / lastAt');
  // the session's end marker counts agent actions only
  await w1.emit({ kind: 'detach', browserKey: KA, profileId: P1, sessionId: 's-a' });
  const ms = fs.readFileSync(path.join(w1.DATA, 'browser-trace', P1, BS.MARKERS_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  ok(ms[ms.length - 1].phase === 'end' && ms[ms.length - 1].count === 158, `the end marker counts the agent actions (158), never the fits (${ms[ms.length - 1].count})`);
}

// ═══ ④ retention: fit frames go FIRST; the usage reports them beside ═══════════════
console.log('— ④ the size sweep drops page-size frames first; usage / housekeeping report fit bytes beside');
if (built) {
  const sess = (id, startAt, open, list) => ({ id, startAt, open, entries: list.map(([eid, at, fb, fit]) => ({ id: eid, at, frameBytes: fb, listBytes: 100, fit: !!fit })) });
  // an old closed session of agent frames (300 MB), a newer one holding 200 MB of fit frames + 100 MB of agent frames; limit 400 MB
  const scopes = [{ key: P1, sessions: [sess('bs-00000001', 1000, false, [['tr-0000000000a1', 1000, 150 * MB], ['tr-0000000000a2', 2000, 150 * MB]]), sess('bs-00000002', 5000, false, [['tr-0000000000f1', 5000, 100 * MB, true], ['tr-0000000000b1', 6000, 100 * MB], ['tr-0000000000f2', 7000, 100 * MB, true]])] }];
  const plan = T.traceSizePlan({ scopes, bytesPerScope: 400 * MB + 1000 }); // (+ the five 100-byte list lines)
  ok(plan.removeFrames.map((r) => r.id).join() === 'tr-0000000000f1,tr-0000000000f2' && plan.removeFrames.every((r) => /page-size frames go first/.test(r.why)) && plan.bytesRemoved === 200 * MB, `over by 100 MB: the two fit frames go FIRST (oldest fit first), the agent frames of the oldest session stay (${plan.removeFrames.map((r) => r.id).join(' ')})`);
  ok(plan.kept[0].used <= 400 * MB + 1000 && plan.kept[0].fitFrameBytes === 0 && plan.kept[0].frameBytes === 400 * MB, 'after the pass the scope fits; its kept fit frames are 0, the agent frames whole');
  const plan2 = T.traceSizePlan({ scopes, bytesPerScope: 250 * MB });
  ok(plan2.removeFrames.map((r) => r.id).join() === 'tr-0000000000f1,tr-0000000000f2,tr-0000000000a1,tr-0000000000a2' && /oldest session's frames go first/.test(plan2.removeFrames[2].why), 'still over after every fit frame ⇒ the old rule (the oldest session\'s frames, whole)');
  const plan3 = T.traceSizePlan({ scopes, bytesPerScope: 1024 * MB });
  ok(plan3.removeFrames.length === 0 && plan3.kept[0].fitFrameBytes === 200 * MB, 'under the limit nothing goes; the kept row names the fit frames it holds (200 MB)');
  // the recorder's usage and housekeeping over the flood
  const u = tr1.usageOf(P1);
  const fitRows = tr1.list({ profileId: P1, limit: 1000 }).filter(isFit);
  const fitB = fitRows.reduce((n, e) => n + T.entryFrameBytes(e) + T.entryListBytes(e), 0);
  ok(u.fitBytes === fitB && u.used + u.fitBytes === u.total && u.total === u.frameBytes + u.listBytes && u.limit === 1024 * MB, `usageOf: used = the agent actions' bytes, fitBytes beside (${Math.round(u.fitBytes / 1024)} KB), total = both`, u);
  const hk = await tr1.housekeeping();
  const row = hk.profiles.find((r) => r.id === P1);
  ok(row && row.trace.n === 158 && row.trace.fits === 41 && row.trace.fitBytes === fitB && row.trace.used === u.used, `housekeeping: the row counts 158 agent actions, 41 fits beside (37 + the 4 of the run legs), and their bytes separately (${row && row.trace.fits} / ${row && Math.round(row.trace.fitBytes / 1024)} KB)`);
  // the sweep over real files: a limit just under the total takes fit frames first
  const w3 = world('w3');
  const tr3 = mkRecorder(w3, []);
  tr3.install();
  w3.reg.leases.push({ profileId: P1, browserKey: KA, sessionId: 's-a' });
  await w3.emit({ kind: 'attach', browserKey: KA, profileId: P1, sessionId: 's-a' });
  const K3 = `s-a|${P1}`;
  action(w3, K3, 'a1'); clock += 20 * SEC; fit(w3, K3, 'f1', 900, 700, { afterBytes: 200 }); clock += 20 * SEC; action(w3, K3, 'a2'); clock += 20 * SEC; fit(w3, K3, 'f2', 901, 700, { afterBytes: 200 });
  const u3 = tr3.usageOf(P1);
  const limitUnderTotal = u3.total - 50; // (the limit's floor is 64 MB — a sweep over a 1 KB index is driven through the PURE plan over the real index)
  const plan4 = T.traceSizePlan({ scopes: [{ key: P1, sessions: [{ id: 'x', startAt: 1, open: true, entries: tr3.list({ profileId: P1, limit: 100 }).map((e) => ({ id: e.id, at: e.at, frameBytes: T.entryFrameBytes(e), listBytes: T.entryListBytes(e), fit: isFit(e) })) }] }], bytesPerScope: limitUnderTotal });
  ok(plan4.removeFrames.length >= 1 && plan4.removeFrames.every((r) => isFit(tr3.list({ profileId: P1, limit: 100 }).find((e) => e.id === r.id))), `over the limit by 50 bytes on a real index: the plan names fit frames only (${plan4.removeFrames.map((r) => r.id).join(' ')})`);
  tr3.shutdown();
}

// ═══ ⑤ patched-copy CONTROLS, one per rule ═══════════════════════════════════════
console.log('— ⑤ controls: each rule\'s patched copy goes red by name');
if (built) {
  const src = read('src/browser-trace.js');
  // (a) a verdict blind to the action between
  const a = src.replace("if (between && between.action !== FIT_ACTION) return { coalesce: false, why: `another action between (${between.action})` };", '');
  ok(a !== src, 'control (a) patched: the between-action rule removed');
  const Ta = M.load('src/browser-trace.js', a, 'no-between');
  ok(Ta.fitCoalesceVerdict({ id: 'tr-000000000001', action: 'viewer-fit', at: 1000, browserKey: KA, scope: P1 }, { action: 'viewer-fit', at: 3000, browserKey: KA, scope: P1 }, { between: { action: 'click' } }).coalesce === true, 'control (a): the copy coalesces across a click (① would be red)');
  // (b) a fold that never folds
  const b = src.replace('if (run) { run.entries.push(e);', 'if (false) { run.entries.push(e);');
  ok(b !== src, 'control (b) patched: the fold never joins a run');
  const Tb = M.load('src/browser-trace.js', b, 'no-fold');
  ok(Tb.foldFits([{ id: 'tr-0000000000f1', at: 1, action: 'viewer-fit' }, { id: 'tr-0000000000f2', at: 2, action: 'viewer-fit' }]).length === 2, 'control (b): two consecutive fits stay two rows (② would be red)');
  // (c) a plan without the fit-first pass
  const c = src.replace(/for \(const \{ s, e \} of fitsFirst\) \{[\s\S]*?\n    \}\n/, '');
  ok(c !== src, 'control (c) patched: the fit-first pass removed');
  const Tc = M.load('src/browser-trace.js', c, 'no-fit-first');
  const sess = (id, startAt, open, list) => ({ id, startAt, open, entries: list.map(([eid, at, fb, fit]) => ({ id: eid, at, frameBytes: fb, listBytes: 100, fit: !!fit })) });
  const pc = Tc.traceSizePlan({ scopes: [{ key: P1, sessions: [sess('bs-00000001', 1000, false, [['tr-0000000000a1', 1000, 150 * MB]]), sess('bs-00000002', 5000, false, [['tr-0000000000f1', 5000, 100 * MB, true]])] }], bytesPerScope: 200 * MB });
  ok(pc.removeFrames.length && pc.removeFrames[0].id === 'tr-0000000000a1', 'control (c): the copy takes the oldest session\'s agent frames before the fit frames (④ would be red)');
  // (d) a recorder that leaves the superseded after frame on disk
  const rsrc = read('src/server/browser-trace.js');
  const d = rsrc.replace('if (oldAfter && oldAfter !== keepFile) { try { fs.unlinkSync(path.join(dir, oldAfter)); } catch { /* gone already */ } }', '');
  ok(d !== rsrc, 'control (d) patched: the superseded after frame is not unlinked');
  const Rd = M.load('src/server/browser-trace.js', d, 'keep-superseded');
  const wd = world('wd');
  const trd = mkRecorder(wd, [], Rd);
  trd.install();
  wd.reg.leases.push({ profileId: P1, browserKey: KA, sessionId: 's-a' });
  await wd.emit({ kind: 'attach', browserKey: KA, profileId: P1, sessionId: 's-a' });
  fit(wd, `s-a|${P1}`, 'd1', 900, 700); clock += 2 * SEC; fit(wd, `s-a|${P1}`, 'd2', 901, 700); clock += 2 * SEC; fit(wd, `s-a|${P1}`, 'd3', 902, 700);
  const dj = filesOf(wd).filter((f) => f.endsWith('.jpg'));
  // the same three fits through the REAL recorder: one row, ONE frame file (a run that began before any frame has no before)
  const wr = world('wr');
  const trr = mkRecorder(wr, []);
  trr.install();
  wr.reg.leases.push({ profileId: P1, browserKey: KA, sessionId: 's-a' });
  await wr.emit({ kind: 'attach', browserKey: KA, profileId: P1, sessionId: 's-a' });
  fit(wr, `s-a|${P1}`, 'd1', 900, 700); clock += 2 * SEC; fit(wr, `s-a|${P1}`, 'd2', 901, 700); clock += 2 * SEC; fit(wr, `s-a|${P1}`, 'd3', 902, 700);
  const rj = filesOf(wr).filter((f) => f.endsWith('.jpg'));
  ok(trr.list({ profileId: P1 }).length === 1 && rj.length === 1 && trd.list({ profileId: P1 }).length === 1 && dj.length === 3, `control (d): the copy keeps one row but ${dj.length} frame files (the real recorder: ${rj.length}) — the superseded after frames stayed (③ would be red)`);
  trr.shutdown();
  trd.shutdown();
  ok(M.files.length === 4 && M.files.every((f) => !f.startsWith(path.join(REPO, 'src'))), 'the four copies live in the scratch dir, never in src/');
}

// ═══ ⑥ wiring pins ═══════════════════════════════════════════════════════════════
console.log('— ⑥ wiring: the surfaces fold, the route sums, the bridge bounds its storm, the words exist');
{
  const view = read('src/lib/browser-trace-view.js'), replay = read('src/lib/browser-replay-window.js'), route = read('src/routes/browser-trace.js'), bridge = read('src/server/browser-stream.js'), live = read('src/lib/browser-live-window.js');
  ok(/foldFits/.test(view) && /foldFits\(st\.entries, \{ expand: /.test(view), 'the Actions pane (createTraceTimeline) draws foldFits rows (expand = the toggle)');
  ok(/const s = traceSummary\(entries\)/.test(view) && /s\.fits/.test(view) && /renderTraceStrip\(strip, entries, \{ expand:/.test(view), 'the tool card\'s count reads traceSummary (fits beside, never in n) and its strip folds');
  ok(/foldFits\(st\.entries, \{ expand: showFitsPref\(\) \}\)/.test(replay) && /brp-tick/.test(replay), 'the replay folds fits into a thin tick between steps (a step only with the toggle on)');
  ok(/summary: T\.traceSummary\(entries\)/.test(route), 'GET /api/browser/actions answers `summary` (n / failed / fits)');
  ok(/export function showFitsPref\(\)/.test(view) && /export function fitsToggle\(/.test(view) && /localStorage/.test(view) && /SHOW_FITS_KEY = 'vibespace\.browserTrace\.showFits'/.test(view), 'ONE per-device preference (localStorage) read by every surface; ONE toggle builder');
  ok(/const lab = el\('label', 'browser-trace-fits-toggle'\)/.test(view) && /lab\.append\(cb, document\.createTextNode\(' ' \+ t\('Show page-size changes'\)\)\)/.test(view), 'the toggle is a <label> wrapping its checkbox with the words (test-ax-paint: a control has a name)');
  ok(/'page-size frames: \{size\}'/.test(view) && /bprof-trace-fits/.test(view), 'the Agent browser panel prints the fit bytes beside the row\'s {used} of {size}');
  ok(/timeline\.count\(\)/.test(live) && /count: \(\) => st\.entries\.filter\(\(e\) => !isFitEntry\(e\)\)\.length/.test(view), 'the live view\'s "Actions (N)" counts agent actions');
  // F4: the bridge's own fit storm is bounded upstream — pinned, not rebuilt (lane S4's scheduler)
  ok(/function scheduleFit\(relay, why, \{ force = false, delay = FIT\.FIT_DEBOUNCE_MS \} = \{\}\) \{[\s\S]*?if \(relay\.fitTimer\) clearTimeout\(relay\.fitTimer\);/.test(bridge), 'F4 (pinned): scheduleFit re-arms ONE timer per relay — a burst of pane reports is one fit');
  ok(/if \(relay\.fitBusy\) \{ relay\.fitAgain = why; return; \}/.test(bridge) && /if \(relay\.fitAgain\) \{ const w = relay\.fitAgain; relay\.fitAgain = null; scheduleFit\(relay, w, \{ delay: 0 \}\); \}/.test(bridge), 'F4 (pinned): runFit parks a fit asked while one is in flight (`fitAgain`) and runs it ONCE after — the latest geometry wins (the verdict reads the live `fits` map)');
  ok(/const v = FIT\.fitVerdict\(\{ fits: \[\.\.\.relay\.fits\.values\(\)\]/.test(bridge), 'F4 (pinned): the fit that runs reads the CURRENT pane sizes, never the ones it was scheduled with');
  // the words, in zh and ja
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const keys = ['Show page-size changes', 'Live view fitted ×{n} · {size} (last)', 'Live view fitted · {size}', '{n} page-size change(s)', 'page-size frames: {size}', 'Every resize or move of the live view fits the page to it and is recorded. Off: consecutive page-size changes are one dim row. On: each is its own row with its frames.', '{n} page-size change(s) between {from} and {to} — the live view was resized or moved and the page fitted to it; click for the last one.'];
  const miss = keys.filter((k) => !zh[k] || !ja[k]);
  ok(miss.length === 0, `every new word has zh + ja (${miss.join(' | ') || 'all present'})`);
  ok(/实时视图/.test(zh['Live view fitted ×{n} · {size} (last)'] || '') && /ライブビュー/.test(ja['Live view fitted ×{n} · {size} (last)'] || ''), 'the fold row names the live view in each language');
  const css = read('public/style.css');
  ok(/\.browser-live-trace-row\.fits/.test(css) && /\.brp-tick/.test(css) && /\.browser-trace-row\.fits/.test(css) && /\.browser-trace-fits-toggle/.test(css), 'the dim fold rows, the replay tick and the toggle have their rules');
  const ci = read('scripts/ci.mjs');
  ok(/\{ name: 'test-browser-trace', tier: 'fast'/.test(ci), 'ci.mjs carries this suite (fast)');
}

tr1.shutdown();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
