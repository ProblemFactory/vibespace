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
// Per-pid scratch (scripts/scratch.mjs); the copies through scripts/mutant-copy.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
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
  ok(steps.some((s) => s.why.startsWith('a row that changed') && s.a === 'acct-none' && s.want === 1), 'the damaged row (key acct-a/…, account acct-b) is handed to every account — even one with no rows of its own', steps.filter((s) => s.why.startsWith('a row that changed')));
  const SRC = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
  const HOOK = "    if (byAcct) { if (key === null) byAcct = null; else acctPlace(key); }";
  ok(SRC.split(HOOK).length === 2, 'control setup: the touch signal\'s line that moves a key is present once');
  const S2 = MC.load('src/channel-store.js', SRC.replace(HOOK, '    // (the mutant: the touch signal never moves a key)'), 'no-move');
  const c = await storeWalk(S2, 'no-move');
  const cbad = c.filter((s) => !s.same).map((s) => s.why);
  ok(cbad.includes('a birth after the sets were kept') && cbad.includes('a removal (a whole-map touch)'), `CONTROL: a store whose touch signal never moves a key is wrong after a birth and a removal — red (${[...new Set(cbad)].length} steps wrong)`, [...new Set(cbad)]);
  const S3 = MC.load('src/channel-store.js', SRC.replace(HOOK, '    byAcct = null;   // (the mutant: every touch drops the kept sets — a rebuild at every read)'), 'drop-each');
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
  ok(got.ok, 'the forced pass of the small account ran', got);
  ok(WALKS.every((w) => !got.seen[w]), `none of the five walks (${WALKS.join(', ')}) iterated the whole map — each read its own account's keys`, got.seen);
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  // the five walks as they were (each pair: the walk now → the walk before)
  const BACK = [
    ['      const live = store.index.live();   // B-dfa4 U2: this account\'s rows only (the store keeps each account\'s keys)\n      for (const k of store.index.keysOf(rec.id)) { const en = live[k]; if (en && en.adapterId === rec.id) dueRow(rec, e, en, t, T, out, true); }\n',
      '      for (const en of Object.values(store.index.live())) if (en && en.adapterId === rec.id) dueRow(rec, e, en, t, T, out, true);\n'],   // stale-pins: kept (the old walk, restored by the control)
    ['      const live = store.index.live();\n      for (const k of store.index.keysOf(rec.id)) {   // B-dfa4 U2: the build reads this account\'s rows, never every account\'s\n        const en = live[k];\n',
      '      for (const en of Object.values(store.index.live())) {\n'],
    ['    const live = store.index.live();\n    for (const k of store.index.keysOf(rec.id)) {   // B-dfa4 U2: this account\'s rows only\n      const en = live[k];\n',
      '    for (const en of Object.values(store.index.live())) {\n'],
    ['    const live = store.index.live();\n    for (const k of store.index.keysOf(rec.id)) {   // B-dfa4 U2: this account\'s rows only (13.4 s a day on the owner\'s map, every account\'s rows)\n      const en = live[k];\n',
      '    for (const en of Object.values(store.index.live())) {\n'],
    ['    for (const k of store.index.keysOf(rec.id)) {   // B-dfa4 U2: this account\'s keys only (the test below unchanged)\n      const en = ix[k];\n',
      '    for (const [k, en] of Object.entries(ix)) {\n'],
  ];
  ok(BACK.every(([now]) => SRC.split(now).length === 2), 'control setup: each of the five walks is present once as it reads now', BACK.map(([now]) => SRC.split(now).length - 1));
  let old = SRC; for (const [now, before] of BACK) old = old.replace(now, before);
  const ctl = await enginePass(MC.load('src/server/channels-engine.js', old, 'whole-map'), 'whole-map');
  ok(ctl.ok && WALKS.every((w) => ctl.seen[w] > 0), `CONTROL: the five walks restored to the whole map — each is seen iterating it (${WALKS.map((w) => `${w} ×${ctl.seen[w] || 0}`).join(', ')}) — red`, ctl);
}

console.log(`\ntest-channel-walk-own-rows: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
