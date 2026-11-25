#!/usr/bin/env node
// A DOOR OF ONE ACCOUNT READS ITS OWN ROWS (B-dfa4 cut 1; gate row `test-channel-walk-doors`). The channels index is ONE
// flat map keyed account/conversation for every account; unit 2 (test-channel-walk-own-rows, heavy) gave the store each
// account's row keys (src/channel-store.js `keysOf`) and moved the pass's five walks onto them. Measured on a stand-in
// store of the owner's shape (89 000 + 6 000 + 1 500 rows, 2.369.410), the DOORS still walked every account's rows for one
// account: the agent status (accessFor, 549 ms: once per account), the agent search (searchFor, 415 ms: once per
// account), one account's card (rows({adapter}), 111 ms for 1 500 rows), the census build (once per account at boot), the
// remove dialog (referencesOf), … — eighteen walks now read `store.index.rowsOf(account)` (the kept keys' rows, read-only)
// or, in the store's own search, `keysOf`.
//   ① every door beside 10 000 rows of ANOTHER account: none of them iterates the whole map (a Proxy over `live()` and a
//      count of Object.values / keys / entries over the map itself name the caller of every whole-map iteration); the
//      kept sets are not rebuilt by any door. CONTROL: the store's `rowsOf` given back the walk it replaced
//      (`Object.values(live()).filter(account)`) — EACH door is seen iterating the map (it reached its walk: the zero is
//      not vacuous), red; and every door answers the same under both (the kept keys are the map's own rows, in its order)
//   ② the credential re-judge (rejudgeConvCaps, after a re-authorize / connect / disconnect): it read `live()` INSIDE its
//      update — a whole-map touch (every account's rows re-written, every kept index rebuilt). It now re-judges this
//      account's rows and touches the ones it changed: the kept sets survive (builds +0), the re-judged rows are on disk at
//      a reopen, the other account's rows untouched. CONTROL: the whole-map walk inside the update — builds +1, red
//   ③ the store's own search: CONTROL = a store copy with the base's line (scripts/mutant-copy.mjs) — it iterates the map
//   ④ `keysOf` INSIDE an update (what ② reads): the kept set PLUS the keys the update touched — a row born or moved in it is
//      there, and after a whole-map touch every key. CONTROL: a store copy without the touched keys misses the born row
// Per-pid scratch (scripts/scratch.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}

const ROOT = scratch('chan-walk-doors');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
process.env.VIBESPACE_CHANNELS_FAKE_SEARCH = '1';   // the poll fake declares its own search (the agent's --full door), read at module load
const quiet = { log() {}, warn() {}, error() {}, info() {} };
const J = (x) => JSON.stringify(x === undefined ? null : x);
const MC = mutantCopies('chan-walk-doors', REPO);
const OTHER_ROWS = 10000, OWN = 12;

// EVERY WHOLE-MAP ITERATION, BY ITS CALLER: a Proxy over what `live()` hands out (Object.values / keys / entries / for…in
// over it) and Object.values / keys / entries called on the map itself (the store's own walks read it directly). The caller
// is the first frame past this file, the builtins and the patched helpers below.
const O = { values: Object.values, keys: Object.keys, entries: Object.entries };
function countWalks(ix) {
  const seen = new Map();
  const note = () => {
    const line = String(new Error().stack).split('\n').slice(1).find((l) => !l.includes('test-channel-walk-doors') && !l.includes('(<anonymous>)') && !/ \(native\)/.test(l) && !l.includes('node:internal')) || '';
    const m = /at (?:async )?(?:[\w$]+\.)*([\w$<>]+) \(/.exec(line);
    const name = m ? m[1] : '?';
    seen.set(name, (seen.get(name) || 0) + 1);
  };
  const orig = ix.live, wrapped = new WeakMap();
  ix.live = () => { const m = orig(); if (!wrapped.has(m)) wrapped.set(m, new Proxy(m, { ownKeys(t) { note(); return Reflect.ownKeys(t); } })); return wrapped.get(m); };
  for (const k of ['values', 'keys', 'entries']) Object[k] = function (x) { if (x !== undefined && x !== null && x === ix.rows()) note(); return O[k].call(Object, x); };
  return { seen, stop() { ix.live = orig; Object.values = O.values; Object.keys = O.keys; Object.entries = O.entries; } };
}
// THE CONTROL'S rowsOf: the walk each door did before (every row of every account, then its account's)
const wholeRowsOf = (ix) => (adapterId) => Object.values(ix.live()).filter((en) => en && en.adapterId === adapterId);

const T0 = Date.UTC(2026, 10, 18, 21, 0, 0);
const A = 'fake-poll', OTHER = 'other-account';
const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker' };
const AG = { kind: 'agent', id: 'agent-1', name: 'Worker', groups: [], msgLevelFor: () => 'none' };
const AG2 = { kind: 'agent', id: 'agent-2', name: 'Other', groups: [], msgLevelFor: () => 'none' };

async function world(tag, { control = false } = {}) {
  const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
  let t = T0;
  const dataDir = path.join(ROOT, `w-${tag}`);
  const e = ENG.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now: () => t, log: quiet, censusTimer: () => ({ cancel() {} }),
    liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }, { cid: 'agent-2', name: 'Other', groups: [] }] });
  const ix = e.store.index;
  const lane = { via: 'poll', lastPollAt: T0 - 3600e3, lastScanAt: null, firstSeenByPoll: 1, firstSeenTotal: 1 };
  await ix.update(() => {
    for (let i = 0; i < OTHER_ROWS; i++) Object.assign(ix.entry(OTHER, `thr_${i}`), { title: `invoice other ${i}`, kind: 'group', lastAt: T0 - 7200e3 - i, unread: 1, lane: { ...lane }, convCaps: { at: T0 - 86400e3, read: 'yes', sendAs: [], why: null } });
    for (let i = 0; i < OWN; i++) Object.assign(ix.entry(A, `own_${i}`), { title: `invoice ${i}`, kind: i % 3 ? 'group' : 'dm', lastAt: T0 - 600e3 - i * 1000, unread: i % 2, lane: { ...lane }, convCaps: { at: T0 - 86400e3, read: 'yes', sendAs: [], why: null }, ...(i === 3 ? { filterId: 'flt-walk' } : {}) });
  });
  ix.flush();
  const rec = () => e.adapterRecords().adapters.find((r) => r.id === A);
  ix.keysOf(A);   // the kept sets are built now: no door below may rebuild them
  const builds0 = ix.keysStats().builds;
  const realRowsOf = ix.rowsOf, realKeysOf = ix.keysOf, realKeysKept = ix.keysKept;
  // the control: both reads given back the walk they replaced — `live()` read whole (inside an update: a whole-map touch); and
  // B-360d item 4's read of the kept keys in place (the hook's dead sign-ins, the search's wait) void: those roads then walk the
  // whole map, as the release did
  if (control) { ix.rowsOf = wholeRowsOf(ix); ix.keysOf = () => O.keys(ix.live()); ix.keysKept = () => null; }
  // the keys the store's touch signal says an update changed (null = the whole map), recorded while `touchArmed`
  const touched = []; let touchArmed = false;
  ix.onTouch((k) => { if (touchArmed) touched.push(k); });
  const cw = countWalks(ix);
  const out = { doors: [], builds0 };
  const door = async (name, what, fn) => {
    cw.seen.clear();
    let answer = null, threw = null;
    try { answer = await fn(); } catch (err) { threw = String((err && err.message) || err); }
    out.doors.push({ name, what, seen: Object.fromEntries(cw.seen), answer: J(answer), threw });
  };
  try {
    // the census build first: nothing above built it (no broadcast ran)
    await door('clockIndexed', 'the census build (adapterView, at boot or after a whole-map write)', () => e.adapterView(rec()));
    // a forced pass: its COMPLETE discovery's sweep (the rows a complete listing no longer lists) runs inside an update
    await door('discover', 'a complete discovery\'s unlisted sweep (a forced pass)', async () => { const r = await e.pass(A, { force: true }); return r && { ok: !!r.ok }; });
    const ga = await e.setGrain(A, { kind: 'account' }, { access: [{ principal: AGENT, authority: 'draft' }] });
    out.setup = { access: !!(ga && ga.ok) };
    await door('accessFor', 'the agent status (vibespace-channels status)', () => e.accessFor(AG));
    await door('searchFor', 'the agent search', () => e.searchFor(AG, 'invoice'));
    await door('searchFullFor', 'the agent --full search of one account', () => e.searchFor(AG, 'invoice', { full: true, adapterId: A }));
    await door('watchTargetOf', 'an agent asking to watch an account it cannot read', () => e.agentWatch(AG2, A, {}));
    await door('estimateScope', 'the honest estimate over the account', () => e.estimateScope(A, { kind: 'account' }));
    await door('previewRule', 'the rule preview over the account', () => e.previewRule(A, { kind: 'account' }, { rule: { kind: 'keyword', value: 'invoice' } }));
    await door('prunePending', 'a grain write on the account (setGrain prunes its held hits)', () => e.setGrain(A, { kind: 'account' }, { access: [{ principal: AGENT, authority: 'draft' }] }));
    await door('storingConvs', 'does the account hold a wake (the person verdict asks before a write)', () => e.wakeHeldAt(A, { kind: 'adapter' }));
    await door('wakeNamesFilter', 'does a conversation\'s saved filter hold a wake', () => e.wakeHeldAt(A, { kind: 'conversation', convId: 'own_3' }));
    await door('referencesOf', 'the remove dialog\'s references', () => e.referencesOf(A));
    await door('rowsWalk', 'one account\'s card (rows {adapter})', () => e.rows({ view: 'all', adapter: A }));
    const gw = await e.setGrain(A, { kind: 'account' }, { watchers: [{ principal: AGENT, delivery: 'wake' }] }, { person: true });
    out.setup.watcher = !!(gw && gw.ok);
    await door('flushScopeNow', 'the account\'s window flush', () => e.flushScope(A, 'account', null, 'agent:agent-1'));
    await e.store.adapters.update(() => { const r = rec(); r.signinDead = { at: T0, why: 'walk-doors' }; r.lastAuthAt = T0; });
    await door('signinExpiredFor', 'the hook\'s dead sign-ins', () => e.signinExpiredFor(AG));
    // ② the re-judge: no whole-map touch (the kept sets survive), the changed rows touched
    const b0 = ix.keysStats().builds;
    touched.length = 0; touchArmed = true;
    await door('rejudgeConvCaps', 'the credential re-judge (here at a disconnect; a re-authorize and a connect run it too)', () => e.disconnect(A));
    touchArmed = false;
    out.touchedOwn = touched.filter((k) => typeof k === 'string' && k.startsWith(`${A}/own_`)).length;
    out.touchedWhole = touched.filter((k) => k === null).length;
    realKeysOf(A);
    out.rejudgeBuilds = ix.keysStats().builds - b0;
    out.rejudged = OWN === realRowsOf(A).filter((en) => en.convCaps && en.convCaps.rejudged).length;
    await door('kick', 'an account-level push kick (the newest row)', () => e.kick(A));
    out.buildsDuring = ix.keysStats().builds - builds0 - out.rejudgeBuilds;
  } finally {
    cw.stop();
    if (control) { ix.rowsOf = realRowsOf; ix.keysOf = realKeysOf; ix.keysKept = realKeysKept; }
    try { await e.stop(); } catch { }
    try { e.store.close(); } catch { }
  }
  // the re-judged rows on disk: the store read back from what close() wrote
  const S = require(path.join(REPO, 'src/channel-store.js'));
  const st = S.createChannelStore({ dir: path.join(dataDir, 'channels'), log: quiet });
  const back = st.index.live();
  out.disk = { own: O.values(back).filter((en) => en.adapterId === A && en.convCaps && en.convCaps.rejudged).length, other: O.values(back).filter((en) => en.adapterId === OTHER && en.convCaps && en.convCaps.rejudged).length };
  st.close();
  return out;
}

console.log('① every door of ONE account beside 10 000 rows of another: none iterates the whole map');
const kept = await world('kept');
const ctl = await world('control', { control: true });
ok(kept.setup.access === true && kept.setup.watcher === true, 'setup: the account shared with the agent, then its wake set (Grant access…, Notify…)', kept.setup);
// the re-judge's walk runs in the callback its index update runs a turn later (no named frame of it on the stack): it is
// judged by EVERY whole-map iteration the door causes, but the full digest's first read the disconnect broadcasts (cut 2's)
const BESIDE = new Set(['firstRead', 'firstFacts', 'attnCount', 'buildLayout', 'sweep']);   // B-dfa4 cut 2: the kept first read's build walks in firstFacts   // the full digest's own walks (its first read, the badge's attention rows rebuilt: cut 2's); the store writer's own timers
const sum = (seen, keep) => Object.entries(seen || {}).filter(([n]) => keep(n)).reduce((a, [, v]) => a + v, 0);
for (const d of kept.doors) {
  const c = ctl.doors.find((x) => x.name === d.name);
  const whole = d.name === 'rejudgeConvCaps' || d.name === 'discover';
  const mine = whole ? sum(d.seen, (n) => !BESIDE.has(n)) : d.seen[d.name] || 0;
  const before = !c ? 0 : whole ? sum(c.seen, (n) => !BESIDE.has(n)) : c.seen[d.name] || 0;
  console.log(`  · ${d.name}: whole-map iterations by caller — kept ${J(d.seen)} · control ${J(c && c.seen)}`);
  ok(mine === 0 && !d.threw, `${d.what} — ${d.name}: 0 whole-map iterations${whole ? ' (any caller but the digest\'s first read)' : ''} (the control: ${before})`, { seen: d.seen, threw: d.threw });
  ok(before > 0, `CONTROL: ${d.name} with the whole-map walk given back iterates the map ${before}× — it reached its walk, red`, c && c.seen);
  ok(!!c && c.answer === d.answer && c.threw === d.threw, `${d.name}: the same answer as the whole-map walk's`, { kept: d.answer.slice(0, 400), control: c && c.answer.slice(0, 400) });
}
{ const f = ctl.doors.find((x) => x.name === 'searchFullFor'); ok(!!f && f.seen.searchFullFor === 2, `CONTROL: the --full search walked the map TWICE before (what it may read, then the account's count) — both are cut (${f && f.seen.searchFullFor})`, f && f.seen); }
ok(kept.doors.length === 17, `seventeen doors reached (${kept.doors.length})`, kept.doors.map((d) => d.name));
ok(kept.buildsDuring === 0, `no door rebuilt the kept sets (${kept.buildsDuring} builds)`, kept.buildsDuring);

console.log('\n② the credential re-judge touches the rows it changes, never the whole map');
ok(kept.touchedOwn === OWN && kept.touchedWhole === 0, `the re-judge's update said each row it changed — the ${OWN} rows' own keys touched (${kept.touchedOwn}), the whole map never (${kept.touchedWhole}): what the incremental write and every kept index read`, { own: kept.touchedOwn, whole: kept.touchedWhole });
ok(ctl.touchedWhole > 0, `CONTROL: the walk through live() inside the update touched the whole map (${ctl.touchedWhole}×) — red`, { whole: ctl.touchedWhole });
ok(kept.rejudgeBuilds === 0 && kept.rejudged === true, `the re-judge re-judged the account's ${OWN} rows and the kept sets survived it (builds +${kept.rejudgeBuilds})`, kept);
ok(kept.disk.own === OWN && kept.disk.other === 0, `on disk at a reopen: the account's ${OWN} rows re-judged, the other account's ${OTHER_ROWS} untouched (${kept.disk.own} / ${kept.disk.other})`, kept.disk);
ok(ctl.rejudgeBuilds === 1 && ctl.disk.own === OWN, `CONTROL: the walk through live() inside the update is a whole-map touch — the kept sets dropped and rebuilt (builds +${ctl.rejudgeBuilds}), red`, { builds: ctl.rejudgeBuilds, disk: ctl.disk });

// CONTROL of the touch itself: an engine copy whose re-judge changes the rows WITHOUT touching them — nothing says them
async function rejudgeOnly(E, tag) {
  const e = E.create({ dataDir: path.join(ROOT, `rj-${tag}`), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now: () => T0, log: quiet, censusTimer: () => ({ cancel() {} }), liveSessions: () => [] });
  const ix = e.store.index;
  await ix.update(() => {
    for (let i = 0; i < 200; i++) Object.assign(ix.entry(OTHER, `thr_${i}`), { title: `t ${i}`, kind: 'group', lastAt: T0 - 7200e3, convCaps: { at: T0 - 86400e3, read: 'yes', sendAs: [], why: null } });
    for (let i = 0; i < OWN; i++) Object.assign(ix.entry(A, `own_${i}`), { title: `o ${i}`, kind: 'group', lastAt: T0 - 600e3, convCaps: { at: T0 - 86400e3, read: 'yes', sendAs: [], why: null } });
  });
  await e.store.adapters.update(() => { const r = e.adapterRecords().adapters.find((x) => x.id === A); r.lastAuthAt = T0; });
  const touched = []; let armed = true;
  ix.onTouch((k) => { if (armed) touched.push(k); });
  try { await e.disconnect(A); } finally { armed = false; try { await e.stop(); } catch { } try { e.store.close(); } catch { } }
  const changed = O.values(ix.rows()).filter((en) => en.adapterId === A && en.convCaps && en.convCaps.rejudged).length;
  return { own: touched.filter((k) => typeof k === 'string' && k.startsWith(`${A}/own_`)).length, changed };
}
{
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const TOUCH = 'if (next !== en.convCaps) { en.convCaps = next; store.index.touch(k); n++; }';
  ok(SRC.split(TOUCH).length === 2, 'control setup: the re-judge\'s touch is present once');
  const real = await rejudgeOnly(require(path.join(REPO, 'src/server/channels-engine.js')), 'real');
  const c = await rejudgeOnly(MC.load('src/server/channels-engine.js', editAnchor(SRC, TOUCH, 'if (next !== en.convCaps) { en.convCaps = next; n++; }', "src/server/channels-engine.js"), 'no-touch'), 'no-touch');   // stale-pins: kept (the re-judge without its touch, the control's copy)
  ok(real.changed === OWN && real.own === OWN, `beside 200 rows of another account the disconnect's re-judge changed ${real.changed} rows and said ${real.own} of them`, real);
  ok(c.changed === OWN && c.own === 0, `CONTROL: the copy without the touch changed the same ${c.changed} rows and said ${c.own} — the incremental write would never carry them, red`, c);
}

console.log('\n③ the store\'s own search reads one account\'s rows');
const STORE = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
async function searchWalk(S, tag) {
  const st = S.createChannelStore({ dir: path.join(ROOT, `s-${tag}`), log: quiet });
  await st.index.update(() => {
    for (let i = 0; i < OTHER_ROWS; i++) Object.assign(st.index.entry(OTHER, `thr_${i}`), { title: `invoice other ${i}`, lastAt: T0 - 7200e3 - i });
    for (let i = 0; i < OWN; i++) Object.assign(st.index.entry(A, `own_${i}`), { title: `thread ${i}`, lastAt: T0 - 600e3 - i * 1000 });
  });
  for (let i = 0; i < OWN; i++) st.appendRecords(A, `own_${i}`, [{ id: `m${i}`, vendorId: `m${i}`, convId: `own_${i}`, at: T0 - 600e3 - i * 1000, text: `invoice ${i}`, author: { id: 'p1', name: 'Pat' } }]);
  st.index.keysOf(A);
  const cw = countWalks(st.index);
  let r = null;
  try { r = await st.search(A, 'invoice', { limit: 50 }); } finally { cw.stop(); }
  st.close();
  return { seen: Object.fromEntries(cw.seen), hits: r ? r.results.map((x) => x.convId) : null };
}
{
  const S = require(path.join(REPO, 'src/channel-store.js'));
  const got = await searchWalk(S, 'kept');
  const NOW = "    for (const k of keysOf(adapterId)) { const en = ix.conversations[k]; if (en && en.adapterId === adapterId && en.id != null) { lastAtOf.set(";
  const BEFORE = "    for (const en of Object.values(ix.conversations)) if (en && en.adapterId === adapterId && en.id != null) { lastAtOf.set(";   // stale-pins: kept (the base's walk, restored by the control)
  ok(STORE.split(NOW).length === 2, 'control setup: the search\'s walk is present once as it reads now');
  let old = editAnchor(STORE, NOW, BEFORE, "src/channel-store.js");
  old = old.replace(" }   // B-dfa4 cut 1: this account's rows only\n", '\n');
  const c = await searchWalk(MC.load('src/channel-store.js', old, 'search-whole'), 'whole');
  ok((got.seen.search || 0) === 0 && Array.isArray(got.hits) && got.hits.length === OWN, `the search of the ${OWN}-row account beside ${OTHER_ROWS} others: 0 whole-map iterations, ${got.hits && got.hits.length} hits`, got);
  ok((c.seen.search || 0) > 0 && J(c.hits) === J(got.hits), `CONTROL: the base's walk iterates the map ${c.seen.search || 0}× for the same hits in the same order — red`, c);
}

console.log('\n④ keysOf INSIDE an update: the kept set plus every key the update touched');
async function insideUpdate(S, tag) {
  const st = S.createChannelStore({ dir: path.join(ROOT, `u-${tag}`), log: quiet });
  await st.index.update(() => { for (let i = 0; i < 50; i++) st.index.entry(OTHER, `thr_${i}`); for (let i = 0; i < 5; i++) st.index.entry(A, `own_${i}`); });
  st.index.keysOf(A);
  const seen = {};
  await st.index.update(() => {
    st.index.entry(A, 'born');
    const moved = st.index.entry(OTHER, 'thr_7', { create: false }); moved.adapterId = A;   // a damaged row: its key is not its account's
    seen.inside = st.index.keysOf(A).slice().sort();
  });
  await st.index.update((ix) => { st.index.entry(A, 'born2'); void ix.conversations; seen.whole = st.index.keysOf(A).length; });   // reaching ix.conversations: a whole-map touch
  seen.total = O.keys(st.index.rows()).length;
  seen.after = st.index.keysOf(A).slice().sort();
  st.close();
  return seen;
}
{
  const S = require(path.join(REPO, 'src/channel-store.js'));
  const got = await insideUpdate(S, 'kept');
  const want = ['fake-poll/born', 'fake-poll/own_0', 'fake-poll/own_1', 'fake-poll/own_2', 'fake-poll/own_3', 'fake-poll/own_4', 'other-account/thr_7'];
  ok(J(got.inside) === J(want), `inside the update: the account's 5 kept keys + the row born in it + the row moved to it (${got.inside.length} keys of the map's 56)`, got.inside);
  ok(got.whole === got.total, `after a whole-map touch inside an update: every key (${got.whole} of ${got.total})`, got);
  ok(got.after.includes('fake-poll/born2') && got.after.includes('other-account/thr_7') && got.after.length === 8, 'after the updates: the kept set holds the born rows and the moved one (handed to every account)', got.after);
  const LINE = "    if (curTouch) for (const k of curTouch) if (!(set && set.has(k)) && !oddKeys.has(k)) out.push(k);\n";
  ok(STORE.split(LINE).length === 2, 'control setup: the touched keys\' line is present once');
  const c = await insideUpdate(MC.load('src/channel-store.js', editAnchor(STORE, LINE, '', "src/channel-store.js"), 'no-touched'), 'no-touched');
  ok(!c.inside.includes('fake-poll/born') && !c.inside.includes('other-account/thr_7'), `CONTROL: without the touched keys the row born in the update and the moved row are missed (${c.inside.length} keys) — red`, c.inside);
}

report();
