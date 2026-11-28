#!/usr/bin/env node
// A WALK OF ONE ACCOUNT READS ITS OWN ROWS (B-dfa4 U2; gate row `test-channel-walk-own-rows`, HEAVY — the fast tier's stated sum sits at its cap). The channels index
// is ONE flat map keyed account/conversation for every account, and the walks of ONE account — the recheck's due rows
// (recheckDueFor, at every drain turn), the revisions recheck (revisionsPass, at every pass's end), the feed's describe
// of what it bore (describeFeedBorn), the due index's build (dueIndex) and the forced pass's due list (dueList) — each
// iterated the WHOLE map: on the owner's hub 13.4 s + 7.1 s + 2.6 s a day of main loop, a small account's every turn
// paying another account's 89 000 rows. The store now keeps each account's row keys (src/channel-store.js `keysOf`,
// kept off the touch signal every row write already gives) and the walks read only their own.
//   ① THE STORE: births in two accounts, a removal (a whole-map touch), a row moved to another account, a damaged row
//      (its key not its account's — handed to EVERY account), a reopen (the store read back from its files): after each
//      step keysOf(account) is exactly that account's rows (+ the damaged one); CONTROL: a store copy whose touch signal
//      never moves a key keeps a removed row and misses a born one — red. THE PRICE: 10 births, each followed by a read,
//      build the kept sets NO more times (they move); CONTROL: a store that drops them at every touch builds 10 times
//   ② THE ENGINE: a forced pass of a small account (fake-poll with the separate thread listing, the revisions recheck
//      and the change feed declared) with 10 000 rows of ANOTHER account beside it: none of the five walks iterates the
//      whole map (a Proxy over `live()` names the caller of every whole-map iteration, one stack per iteration);
//      CONTROL: an engine copy with the five walks restored to `Object.values(store.index.live())` — each of the five is
//      seen iterating the map (the pass reached every walk: the leg is not vacuous), red
//   ③ PRICED BY WHAT IS DUE (B-dfa4 U3): an account of 2 000 rows (separate listing, walked, active, rechecked within
//      the hour) — the first recheck turn reads its candidates, the next 20 turns read NO row (answered kept), a write to
//      one row makes the next turn read again, a turn past the next instant reads again; EVERY answer equals the PURE
//      verdict over all the account's rows at that instant (Drain.recheckDue). The revisions recheck (a pass's end) reads
//      the rows FRESH within 24 h (5), not the account's 2 005. CONTROLS: the recheck without its kept answer reads every row
//      at every turn; the revisions walk over every row reads 2 005 — red. Then: a write that makes nothing due reads
//      that row alone and keeps the answer; a row made a candidate by a write, a row the clock took out, a clock gone
//      back — each answer still the PURE verdict over all rows; a write that makes a row fresh brings it into the
//      revisions. CONTROLS: a write that re-judges nothing, a clock gone back that rebuilds nothing — wrong answers, red
// Per-pid scratch (scripts/scratch.mjs); the copies through scripts/mutant-copy.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const ROOT = scratch('chan-walk-own-rows');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() {}, warn() {}, error() {} };
const J = (x) => JSON.stringify(x);
const sorted = (a) => [...a].sort();

// the seams the fake reads at module load: the separate thread listing (the recheck), the revisions recheck, the feed
const TOPICS = path.join(ROOT, 'topics.json'), REVS = path.join(ROOT, 'revisions.json');
fs.writeFileSync(TOPICS, J({ topics: {} })); fs.writeFileSync(REVS, J({ revisions: {} }));
process.env.VIBESPACE_CHANNELS_FAKE_TOPICS = TOPICS;
process.env.VIBESPACE_CHANNELS_FAKE_REVISIONS = REVS;
process.env.VIBESPACE_CHANNELS_FAKE_FEED = '1';

const MC = mutantCopies('chan-walk-own-rows', REPO);

// ── ① THE STORE ────────────────────────────────────────────────────────────────────────────────────────────────
console.log('① the store keeps each account\'s row keys');
async function storeWalk(S, tag) {
  const dir = path.join(ROOT, `store-${tag}`);
  let st = S.createChannelStore({ dir, log: quiet });
  const oracle = (s, a) => Object.values(s.index.live()).filter((en) => en && en.adapterId === a).map((en) => en.key);
  const odd = (s) => Object.entries(s.index.live()).filter(([k, en]) => en && !(typeof en.adapterId === 'string' && k.startsWith(`${en.adapterId}/`))).map(([k]) => k);
  const steps = [];
  const look = (s, why) => {
    for (const a of ['acct-a', 'acct-b', 'acct-none']) {
      const want = sorted(new Set([...oracle(s, a), ...odd(s)])), got = sorted(s.index.keysOf(a));
      steps.push({ why, a, same: J(want) === J(got), want: want.length, got: got.length });
    }
  };
  look(st, 'an empty store');
  await st.index.update(() => { for (let i = 0; i < 40; i++) st.index.entry('acct-a', `a${i}`); for (let i = 0; i < 25; i++) st.index.entry('acct-b', `b${i}`); });
  look(st, 'births in two accounts');
  st.index.keysOf('acct-a');   // the kept sets are built now: what follows MOVES them (never a rebuild from scratch)
  await st.index.update(() => { st.index.entry('acct-a', 'a40'); st.index.entry('acct-b', 'b25'); });
  look(st, 'a birth after the sets were kept');
  await st.index.update((ix) => { delete ix.conversations['acct-a/a3']; delete ix.conversations['acct-b/b7']; });
  look(st, 'a removal (a whole-map touch)');
  st.index.keysOf('acct-a');
  await st.index.update(() => { const en = st.index.entry('acct-a', 'a5', { create: false }); en.adapterId = 'acct-b'; });
  look(st, 'a row that changed account (its key no longer its account\'s — handed to every account)');
  await st.index.update(() => { const en = st.index.entry('acct-b', 'b9', { create: false }); en.unlistedAt = 1; });
  look(st, 'a row change that moves no account');
  st.close();
  st = S.createChannelStore({ dir, log: quiet });
  look(st, 'a reopen (the store read back from what close() wrote)');
  const b0 = st.index.keysStats().builds;
  for (let i = 0; i < 10; i++) { await st.index.update(() => { st.index.entry('acct-a', `late${i}`); }); st.index.keysOf('acct-a'); }
  const builds = st.index.keysStats().builds - b0;
  look(st, 'ten births, each read');
  st.close();
  steps.builds = builds;
  return steps;
}
{
  const S = require(path.join(REPO, 'src/channel-store.js'));
  const steps = await storeWalk(S, 'real');
  const bad = steps.filter((s) => !s.same);
  ok(steps.length === 24 && !bad.length, `after each of 8 steps keysOf(account) is exactly that account's rows plus the damaged one, for 3 accounts (${steps.length} looks)`, bad);
  ok(steps.builds === 0, `THE PRICE: ten births, each followed by a read, build the kept sets ${steps.builds} more times — the sets MOVE, never rebuilt per read`, steps.builds);
  ok(verdictOf(steps.some((s) => s.why.startsWith('a row that changed') && s.a === 'acct-none' && s.want === 1)), 'the damaged row (key acct-a/…, account acct-b) is handed to every account — even one with no rows of its own', steps.filter((s) => s.why.startsWith('a row that changed')));
  const SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
  const HOOK = "    if (byAcct) { if (key === null) byAcct = null; else acctPlace(key); }";
  ok(SRC.split(HOOK).length === 2, 'control setup: the touch signal\'s line that moves a key is present once');
  const S2 = MC.load('src/channel-store.js', editAnchor(SRC, HOOK, '    // (the mutant: the touch signal never moves a key)', "src/channel-store.js"), 'no-move');
  const c = await storeWalk(S2, 'no-move');
  const cbad = c.filter((s) => !s.same).map((s) => s.why);
  ok(gateOf(cbad.includes('a birth after the sets were kept')) && verdictOf(cbad.includes('a removal (a whole-map touch)')), `CONTROL: a store whose touch signal never moves a key is wrong after a birth and a removal — red (${[...new Set(cbad)].length} steps wrong)`, [...new Set(cbad)]);
  const S3 = MC.load('src/channel-store.js', editAnchor(SRC, HOOK, '    byAcct = null;   // (the mutant: every touch drops the kept sets — a rebuild at every read)', "src/channel-store.js"), 'drop-each');
  const d = await storeWalk(S3, 'drop-each');
  ok(d.builds >= 10 && !d.filter((x) => !x.same).length, `CONTROL: a store that drops the kept sets at every touch answers the same keys but builds them ${d.builds} times for the ten births — red against the price`, d.builds);
}

// ── ② THE ENGINE ───────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n② a forced pass of a small account beside 10 000 rows of another: no walk of it iterates the whole map');
const WALKS = ['dueIndex', 'dueList', 'recheckDueFor', 'revisionsPass', 'describeFeedBorn'];
async function enginePass(E, tag) {
  const T0 = Date.UTC(2026, 10, 18, 3, 0, 0);
  let t = T0;
  const e = E.create({ dataDir: path.join(ROOT, `eng-${tag}`), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now: () => t, log: quiet, censusTimer: () => ({ cancel() {} }) });
  const A = 'fake-poll', ix = e.store.index;
  const lane = { via: 'poll', lastPollAt: T0 - 30 * 86400e3, lastScanAt: null, firstSeenByPoll: 1, firstSeenTotal: 1 };
  await ix.update(() => {
    for (let i = 0; i < 10000; i++) Object.assign(ix.entry('other-account', `thr_${i}`), { title: `t ${i}`, kind: 'group', lastAt: T0 - 3600e3, unread: 0, lane: { ...lane } });
    for (let i = 0; i < 12; i++) Object.assign(ix.entry(A, `own_${i}`), { title: `own ${i}`, kind: 'group', lastAt: T0 - 3600e3, unread: 0, lane: { ...lane }, convCaps: { at: T0, read: 'yes', sendAs: [], why: null } });
  });
  ix.flush();
  // every whole-map iteration of the live rows names its caller (one stack per iteration, never per row)
  const seen = new Map();
  const orig = ix.live, wrapped = new WeakMap();
  ix.live = () => {
    const m = orig();
    if (!wrapped.has(m)) wrapped.set(m, new Proxy(m, { ownKeys(target) {
      // the IMMEDIATE caller only (the first frame past the trap and the builtin Object.values / entries / keys): a
      // digest further down a walk's stack is the digest's iteration, never the walk's
      const caller = String(new Error().stack).split('\n').slice(1).find((l) => !l.includes('test-channel-walk-own-rows') && !l.includes('(<anonymous>)') && !/ \(native\)/.test(l)) || '';
      const m = /at (?:async )?(?:[\w$]+\.)*([\w$]+) \(/.exec(caller);
      const name = m ? m[1] : '?';
      seen.set(name, (seen.get(name) || 0) + 1);
      return Reflect.ownKeys(target);
    } }));
    return wrapped.get(m);
  };
  let r = null;
  try { r = await e.pass(A, { force: true }); } catch (err) { r = { threw: String(err && err.message || err) }; }
  t += 60e3;
  try { await e.pass(A); } catch { }
  ix.live = orig;
  try { await e.stop(); } catch { }
  return { seen: Object.fromEntries(seen), ok: !!(r && r.ok), why: r && (r.why || r.threw) };   // seen: every whole-map iteration by its caller's name
}
{
  const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
  const got = await enginePass(ENG, 'kept');
  ok(verdictOf(got.ok), 'the forced pass of the small account ran', got);
  ok(verdictOf(WALKS.every((w) => !got.seen[w])), `none of the five walks (${WALKS.join(', ')}) iterated the whole map — each read its own account's keys`, got.seen);
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  // the five walks as they were (each pair: the walk now → the walk before)
  const BACK = [
    ['      const live = store.index.live();   // B-dfa4 U2: this account\'s rows only (the store keeps each account\'s keys)\n      for (const k of store.index.keysOf(rec.id)) { const en = live[k]; if (en && en.adapterId === rec.id) dueRow(rec, e, en, t, T, out, true); }\n',
      '      for (const en of Object.values(store.index.live())) if (en && en.adapterId === rec.id) dueRow(rec, e, en, t, T, out, true);\n'],   // stale-pins: kept (the old walk, restored by the control)
    ['      const live = store.index.live();\n      for (const k of store.index.keysOf(rec.id)) {   // B-dfa4 U2: the build reads this account\'s rows, never every account\'s\n        const en = live[k];\n',
      '      for (const en of Object.values(store.index.live())) {\n'],   // stale-pins: kept (the old walk, restored by the control)
    ['    const live = store.index.live();\n    for (const k of store.index.keysOf(rec.id)) {   // B-dfa4 U2: this account\'s rows only\n      const en = live[k];\n',
      '    for (const en of Object.values(store.index.live())) {\n'],
    // recheckDueFor and revisionsPass read their KEPT rows since U3 (the kept answer is the whole map's walk when it is
    // built — restored to the whole map here, so the walk is seen)
    ['    const rows = [];\n    for (const k of kr.set) {\n      const en = live[k];\n',
      '    const rows = [];\n    for (const [k, en] of Object.entries(store.index.live())) {\n'],
    ['    for (const k of kept.set) {\n      const en = ix[k];\n',
      '    for (const [k, en] of Object.entries(ix)) {\n'],   // stale-pins: kept (the old walk, restored by the control)
  ];
  ok(verdictOf(BACK.every(([now]) => SRC.split(now).length === 2)), 'control setup: each of the five walks is present once as it reads now', BACK.map(([now]) => SRC.split(now).length - 1));
  let old = SRC; for (const [now, before] of BACK) old = old.replace(now, before);
  const ctl = await enginePass(MC.load('src/server/channels-engine.js', old, 'whole-map'), 'whole-map');
  ok(gateOf(ctl.ok) && verdictOf(WALKS.every((w) => ctl.seen[w] > 0)), `CONTROL: the five walks restored to the whole map — each is seen iterating it (${WALKS.map((w) => `${w} ×${ctl.seen[w] || 0}`).join(', ')}) — red`, ctl);
}

// ── ③ PRICED BY WHAT IS DUE (U3) ──────────────────────────────────────────────────────────────────────────────────
console.log('\n③ the recheck and the revisions read what can be due, not every row');
async function pricedRun(E, tag) {
  const T0 = Date.UTC(2026, 10, 18, 4, 0, 0), H = 3600e3;
  let t = T0;
  const e = E.create({ dataDir: path.join(ROOT, `priced-${tag}`), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now: () => t, log: quiet, censusTimer: () => ({ cancel() {} }) });
  const A = 'fake-poll', ix = e.store.index;
  const D = require(path.join(REPO, 'src/channel-drain.js'));
  const N = 2000, FRESH = 5;
  await ix.update(() => {
    for (let i = 0; i < N; i++) Object.assign(ix.entry(A, `thr_${i}`), { title: `t ${i}`, kind: 'group', lastAt: T0 - 3 * 86400e3 - i * 60e3, unread: 0, walkedAt: T0 - 86400e3, threadRecheckAt: T0 - (10 + (i % 40)) * 60e3, convCaps: { at: T0, read: 'yes', sendAs: [], why: null } });
    for (let i = 0; i < FRESH; i++) Object.assign(ix.entry(A, `fresh_${i}`), { title: `f ${i}`, kind: 'group', lastAt: T0 - 600e3, unread: 0, convCaps: { at: T0, read: 'yes', sendAs: [], why: null } });
    // due now and LEAVING the 14-day window 20 minutes on: the clock takes it out — and a clock that goes back must bring it in
    Object.assign(ix.entry(A, 'old_0'), { title: 'old', kind: 'group', lastAt: T0 - 14 * 86400e3 + 20 * 60e3, unread: 0, walkedAt: T0 - 86400e3, convCaps: { at: T0, read: 'yes', sendAs: [], why: null } });
  });
  ix.flush();
  const rec = e.adapterRecords().adapters.find((r) => r.id === A);
  // the oracle: the PURE verdict over EVERY row of the account at that instant (the engine's own row shape)
  const oracle = (at) => {
    const rows = Object.values(ix.live()).filter((en) => en && en.adapterId === A).map((en) => ({ key: en.key, live: !en.unlistedAt && !(en.refresh && en.refresh.every === 'paused') && !(en.lane && en.lane.lastError && (en.lane.lastError.code === 'forbidden' || en.lane.lastError.code === 'not-found')), separate: true, mode: ((en.convCaps || {}).threads || {}).mode || null, walked: !!(en.anchor || en.walkedAt), lastRecheckAt: Number(en.threadRecheckAt) || 0, lastAt: Number(en.lastAt) || 0 }));
    return J(D.recheckDue(rows, { now: at, everyMs: 3600 * 1000 }));
  };
  const cost = () => (e.walkCostStats ? e.walkCostStats() : { recheckRows: 0, recheckKept: 0, revisionRows: 0 });
  const turns = [], wrong = [];
  const turn = (why) => { const c0 = cost(); const got = e.recheckDueOf(A, t); const c1 = cost(); turns.push({ why, rows: c1.recheckRows - c0.recheckRows, kept: c1.recheckKept - c0.recheckKept }); if (J(got) !== oracle(t)) wrong.push({ why, got: (got || []).length, want: JSON.parse(oracle(t)).length }); };
  turn('the first turn');
  for (let k = 0; k < 20; k++) { t += 1000; turn('a turn with nothing written'); }
  await ix.update(() => { ix.entry(A, 'thr_7', { create: false }).threadRecheckAt = 0; });   // one row written: it is due again
  turn('a turn after a write');
  t += 1000; turn('a turn with nothing written after it');
  await ix.update(() => { ix.entry(A, 'thr_100', { create: false }).title = 'renamed'; });   // a write that makes nothing due
  t += 1000; turn('a turn after a write that makes nothing due');
  await ix.update(() => { ix.entry(A, 'fresh_0', { create: false }).walkedAt = t; });   // NO candidate before: now walked, never rechecked ⇒ due
  t += 1000; turn('a turn after a row that was no candidate became one');
  t = T0 + 51 * 60e3; turn('a turn past the next instant (a recheck came due)');
  t = T0 + 5 * 60e3; turn('a turn after the clock went back');
  const listing = rec && e.recheckDueOf(A, t) !== null;
  // the revisions recheck of the account (what a pass runs at its end); the rows it read — the second one, past the build
  let revErr = null;
  try { await e.revisionsPassOf(A); } catch (err) { revErr = String(err && err.message || err); }
  const r0 = cost().revisionRows;
  try { await e.revisionsPassOf(A); } catch (err) { revErr = String(err && err.message || err); }
  const revRows = cost().revisionRows - r0;
  await ix.update(() => { ix.entry(A, 'thr_9', { create: false }).lastAt = t; });   // a message now: the row is fresh — a write brings it IN
  const r1 = cost().revisionRows;
  try { await e.revisionsPassOf(A); } catch (err) { revErr = String(err && err.message || err); }
  const revRows2 = cost().revisionRows - r1;
  // (verdict) fresh objects: a caller that edits the answer never edits the kept one
  const a1 = e.recheckDueOf(A, t) || []; if (a1[0]) a1[0].key = 'edited-by-a-caller';
  const a2 = e.recheckDueOf(A, t) || [];
  const freshObjects = !!(a1.length && a2[0] && a2[0].key !== 'edited-by-a-caller');
  // (verdict) a removed account drops its kept sets — its removal is a whole-map touch (the store's fire(null))
  const keptBefore = cost().kept;
  let removed = null; try { removed = await e.remove(A); } catch (err) { removed = String(err && err.message || err); }
  const keptAfter = cost().kept;
  try { await e.stop(); } catch { }
  return { turns, wrong, revRows, revRows2, revErr, listing, N, FRESH, freshObjects, keptBefore, keptAfter };
}
{
  const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
  const p = await pricedRun(ENG, 'kept');
  const byWhy = (w) => p.turns.filter((x) => x.why === w);
  const idle = byWhy('a turn with nothing written');
  ok(gateOf(p.listing) && p.turns[0].rows >= p.N && idle.length === 20 && verdictOf(idle.every((x) => x.rows === 0 && x.kept === 1)), `the first recheck turn reads the ${p.turns[0].rows} candidates; the next 20 turns with nothing written read NO row (each answered kept)`, p.turns.slice(0, 3));
  ok(byWhy('a turn after a write')[0].rows > 0 && byWhy('a turn with nothing written after it')[0].rows === 0 && byWhy('a turn past the next instant (a recheck came due)')[0].rows > 0, 'a write to one row makes the next turn read again, the turn after it reads none; a turn past the next instant reads again', p.turns.slice(-3));
  ok(byWhy('a turn after a write that makes nothing due')[0].rows === 1 && byWhy('a turn after a write that makes nothing due')[0].kept === 1, 'a write that makes nothing due: the turn reads THAT row alone and keeps its answer', byWhy('a turn after a write that makes nothing due'));
  ok(!p.wrong.length, `every one of the ${p.turns.length} answers equals the PURE verdict over all the account's rows at that instant — incl. a row that became a candidate by a write, a row the clock took out, and a clock that went back`, p.wrong.slice(0, 3));
  ok(p.revRows === p.FRESH && p.revRows2 === p.FRESH + 1, `the revisions recheck of a pass reads the ${p.FRESH} rows fresh within 24 h, not the account's ${p.N + p.FRESH + 1} (read ${p.revRows}); a write that makes a row fresh brings it in (${p.revRows2})`, p);
  ok(gateOf(p.freshObjects) && p.keptBefore >= 2 && p.keptAfter === 0, `a caller editing the recheck list leaves the kept answer whole; removing the account drops its kept sets (${p.keptBefore} → ${p.keptAfter})`, { freshObjects: p.freshObjects, keptBefore: p.keptBefore, keptAfter: p.keptAfter });
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const MEMO = '      if (stands && t < kr.memo.next) { walkCost.recheckKept++; return kr.memo.due.map((d) => ({ ...d })); }';
  const FRESHSET = '    for (const k of kept.set) {\n      const en = ix[k];\n      walkCost.revisionRows++;\n';
  ok(SRC.split(MEMO).length === 2 && SRC.split(FRESHSET).length === 2, 'control setup: the kept answer and the fresh set\'s walk are present once');
  const old = editAnchor(editAnchor(SRC, MEMO, '', "src/server/channels-engine.js"), FRESHSET, '    for (const k of store.index.keysOf(rec.id)) {\n      const en = ix[k];\n      walkCost.revisionRows++;\n', "src/server/channels-engine.js");
  const c = await pricedRun(MC.load('src/server/channels-engine.js', old, 'unpriced'), 'unpriced');
  const cIdle = c.turns.filter((x) => x.why === 'a turn with nothing written');
  ok(gateOf(cIdle.every((x) => x.rows >= c.N)) && c.revRows >= c.N + c.FRESH && !c.wrong.length, `CONTROL: without the kept answer every idle turn reads every candidate (${cIdle[0] && cIdle[0].rows}), the revisions walk over every row reads ${c.revRows} — the same answers, priced by the rows kept — red`, { idle: cIdle.slice(0, 2), revRows: c.revRows });
  // CONTROLS the correctness legs need: a write that re-judges nothing, a clock gone back that rebuilds nothing — each WRONG
  const REJUDGE = '      for (const k of kr.dirty) { if (judge(k, live[k])) kr.set.add(k); else kr.set.delete(k); }\n';
  const BACKCLK = ' || !(t >= kr.at)) {\n';
  ok(SRC.split(REJUDGE).length === 2 && SRC.split(BACKCLK).length === 2, 'control setup: the written rows\' re-judge and the clock-gone-back rebuild are present once');
  const nr = await pricedRun(MC.load('src/server/channels-engine.js', editAnchor(SRC, REJUDGE, '      // (the mutant: a write re-judges nothing)\n', "src/server/channels-engine.js"), 'no-rejudge'), 'no-rejudge');
  ok(gateOf(nr.wrong.some((w) => w.why === 'a turn after a row that was no candidate became one')) && nr.revRows2 === nr.FRESH, `CONTROL: a write that re-judges nothing — the row that became a candidate is missing from the answer, the row made fresh is not read (${nr.wrong.length} answers wrong, revisions read ${nr.revRows2}) — red`, nr.wrong.slice(0, 2));
  const nb = await pricedRun(MC.load('src/server/channels-engine.js', editAnchor(SRC, BACKCLK, ') {\n', "src/server/channels-engine.js"), 'no-backclock'), 'no-backclock');
  ok(verdictOf(nb.wrong.some((w) => w.why === 'a turn after the clock went back')), `CONTROL: a clock gone back that rebuilds nothing — the row the clock took out stays out — red`, nb.wrong.slice(0, 2));
  const FRESHOBJ = '{ walkCost.recheckKept++; return kr.memo.due.map((d) => ({ ...d })); }';
  ok(SRC.split(FRESHOBJ).length === 2, 'control setup: the kept answer is handed out as fresh objects once');
  const sh = await pricedRun(MC.load('src/server/channels-engine.js', editAnchor(SRC, FRESHOBJ, '{ walkCost.recheckKept++; return kr.memo.due.slice(); }', "src/server/channels-engine.js"), 'shared-due'), 'shared-due');   // stale-pins: kept (the old hand-out, restored by the red control)
  ok(!sh.freshObjects, 'RED CONTROL: the kept answer handed out as the same objects — a caller\'s edit reaches the next turn', sh.freshObjects);
}

console.log(`\ntest-channel-walk-own-rows: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
