#!/usr/bin/env node
// test-sliced-walk — B-dfa4 cut 3 (主开发's five laws for a sliced walk, 2026-11-20): THE ONE BUDGETED WALK
// (src/channel-store.js walkSliced) and the three first builds that now take it, each walked here in SLICES on a small
// stand-in (the `walk` option { syncRows, sliceMs, onSlice } — the very code a 96 500-row store takes at the real
// numbers, WALK_SYNC_ROWS / WALK_SLICE_MS; sliceMs 0 = one item a slice, so a placed write always falls between two
// slices whatever the machine's speed; onSlice places that write, awaited):
//   (a) THE HELPER — every item once, in order; the loop answers between two slices; alive() false stops it; the
//       longest slice by its own clock is printed (law 4: printed, never asserted — no wall-clock bound in a fast suite).
//   (b) THE INDEX'S LAYOUT (the first write after a boot) — (1) PARITY: the sliced write equals the whole-file
//       serialization byte for byte; (2) A CHANGE DURING THE WALK: a row changed after its chunk was laid out, a row changed
//       before it, a row born — placed between two slices: the write equals the whole serialization of its instant (a
//       STATED SNAPSHOT; the touched rows re-serialized); a removal (a whole-map touch) between two slices STARTS IT AGAIN;
//       (3) NOBODY READS HALF: while it is built the file on disk stays the last whole one and no write lands; durable()
//       resolves once the rows are on disk (the writer is answered LATER, never «equal to the disk»); (4) a mass of touched
//       rows on a laid-out index: their chunks re-serialized in slices — equal to the whole serialization, and a
//       synchronous flush between two of its slices loses no row; (5) THE PER-ACCOUNT KEYS (keysOf) built in slices from
//       the load: equal to a whole build after births placed between two slices; a reader before the landing finishes them.
//   (c) AN ACCOUNT'S DUE INDEX — (1) before it lands the due list says NOT READY by name (never an empty list taken as
//       «nothing due»); (2) PARITY with a whole build on the same store; (3) a poll stamp and a row born between two
//       slices: equal to a whole build after the same writes.
//   (d) THE BOOT'S SWEEP (the three censuses + the selfAt heal's plan, one walk) — (1) PARITY with the whole walks
//       (deprecatedReceiptWakes / capZeroDigests / orphanWatchers, the heal's rule), sliced and in one turn; (2) a row
//       changed after its visit, one changed before it, one born — between two slices: equal to the whole walks at the
//       landing (the touched rows read again); (3) a grants change between two slices (the account's access withdrawn)
//       STARTS IT AGAIN; (4) start() over the bound says no census line in its own turn and says them at the landing.
//   (e) THE RE-JUDGE (every row's verdict against the account's credential — the boot's, a re-authorization's) — (1) PARITY:
//       the sliced re-judge persists the whole one's verdicts, row for row; (2) a fresh verdict written behind the walk and
//       ahead of it between two slices: equal to a whole re-judge after the same write.
//   cut 3b (主开发's round wdhpbbudn): (b6) the layout's bound — three whole touches during sliced layouts, the next write in
//       one turn, said once; (b7) a synchronous flush during the first sliced layout (the exit's case); (c4) the due build's
//       bound; (d5) the boot sweep's bound — three grants changes, one turn, said once; (f) the due turn's cap — heads that all
//       turn out not due, the due rows behind them polled on the same tick; (g) the release of a dead boot's reservations
//       touches the one row holding it.
//   RED CONTROLS (mutant copies, each edit by scripts/scratch.mjs anchored; nine): the layout's landing forgetting the rows
//   touched during it → (b2) red; the store answering the writer null while it builds → (b3) red; a re-made chunk owing
//   its bytes only at its landing → (b4) red; the per-account keys' landing forgetting the touched keys → (b5) red; the due list answering [] while it is built → (c1) red; the sweep's landing not reading
//   the touched rows again → (d2) red; the sweep blind to a grants change → (d3) red; a tick that does not ask again →
//   (f) red; the release's old whole-map walk → (g) red.
// Run: node scripts/test-sliced-walk.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';
import { checker } from './lib/check.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const S = require(path.join(REPO, 'src/channel-store.js'));
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const M = mutantCopies('sliced-walk', REPO);

const { ok, report } = checker();
const info = (l) => console.log('  · ' + l);
const ROOT = scratch('sliced-walk');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const quiet = { log() { }, info() { }, warn() { }, error() { } };
const RUNTIME_KEYS = (k, v) => (k.startsWith('_') ? undefined : v);
const T = Date.UTC(2026, 10, 18, 12, 0, 0);
const H = 3600e3;
// LAW 4 (no slice over 50 ms by its own clock) is PRINTED here, never asserted: a fast suite bounds no wall clock (the
// test machines' load is no product fact — test-ci-gate's census); the law's reading is the measurement on the full stand-in
/** a wait for what happened: bounded, and red by name when it never does */
async function until(what, cond, ms = 8000) {
  const a = Date.now();
  while (!cond()) { if (Date.now() - a > ms) throw new Error(`waited ${ms} ms for ${what} — it never happened`); await new Promise((r) => setTimeout(r, 2)); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const copyOf = (tpl, name) => { const d = path.join(ROOT, name); fs.cpSync(tpl, d, { recursive: true }); return d; };

// ═══ (a) THE HELPER ═══
console.log('(a) the helper: every item once, in order; the loop answers between two slices; alive() stops it');
{
  const N = 60000, items = Array.from({ length: N }, (_, i) => i), seen = [];
  let ticks = 0, between = 0;
  const iv = setInterval(() => { ticks++; }, 1);
  const st = {};
  const r = await S.walkSliced(items, (x) => { seen.push(JSON.parse(JSON.stringify({ x, pad: 'row'.repeat(16) })).x); }, { sliceMs: 2, stats: st, onSlice: () => { between++; } });
  clearInterval(iv);
  ok(r.done && seen.length === N && seen.every((x, i) => x === i), `(a) every one of ${N} items walked once, in order (${r.slices} slices)`);
  ok(r.slices > 1 && between === r.slices - 1 && st.slices === r.slices && st.maxSliceMs === r.maxSliceMs, `(a) the seam ran between every two slices (${between}) and the stats counted them`);
  ok(ticks > 0, `(a) the loop answered between the slices: a 1 ms timer ran ${ticks} time(s) during the walk`);
  info(`(a) LAW 4, printed — the longest slice by the walk's own clock: ${r.maxSliceMs} ms (asked 2 ms)`);
  const r2 = await S.walkSliced(items, () => { JSON.parse(JSON.stringify({ pad: 'row'.repeat(16) })); }, { sliceMs: 1, alive: () => false });
  const r3 = await S.walkSliced([], () => { throw new Error('never'); });
  ok(!r2.done && r2.rows === 0 && r3.done && r3.slices === 0, `(a) the first slice runs a turn after the call (nothing of a walk in its caller's turn): alive() false there stops it before any item (${r2.rows} of ${N}); an empty list is done with no slice`);
  info(`the store's numbers: a walk over at most ${S.WALK_SYNC_ROWS} rows stays in its caller's turn; slices of ${S.WALK_SLICE_MS} ms`);
}

// ═══ (b) THE INDEX'S LAYOUT ═══
console.log('(b) the index\'s layout — the first write after a boot, sliced');
const NB = 3000;
const mkRow = (s, a, c, i) => Object.assign(s.index.entry(a, c), { title: `t${i}`, unread: i % 5, lastAt: T - i * 60e3, participants: 'Ada, Brook', lane: { via: 'poll', lastPollAt: T - i } });
const TPL_B = path.join(ROOT, 'tpl-b');
{
  fs.mkdirSync(TPL_B, { recursive: true });
  const s0 = S.createChannelStore({ dir: TPL_B, log: quiet });
  await s0.index.update(() => { for (let i = 0; i < NB; i++) mkRow(s0, i % 3 ? 'gmail' : 'lark', `thr_${i}`, i); });
  s0.close();
}
const wholeOf = (s) => JSON.stringify(s.index.snapshot(), RUNTIME_KEYS, 1);
/** One boot of the stand-in: a store reopened with the walk in slices, one row changed, durable() awaited. `place(s)` runs
 *  at the first point between two slices of the layout. → what was on disk meanwhile and after. */
async function layoutLeg(SM, tag, place = null) {
  const dir = copyOf(TPL_B, `b-${tag}`);
  const before = fs.readFileSync(path.join(dir, 'index.json'), 'utf8');
  const seen = { slices: 0, partial: 0, wrote: 0, placedAt: null };
  let s = null;
  s = SM.createChannelStore({ dir, log: quiet, walk: { syncRows: 500, sliceMs: 0, onSlice: async (i, what) => {
    if (what !== 'layout') return;
    seen.slices++;
    if (fs.readFileSync(s.indexFile, 'utf8') !== before) seen.partial++;
    if (s.index.flushStats().writes) seen.wrote++;
    if (place && seen.placedAt === null) { seen.placedAt = i * S.INDEX_CHUNK; await place(s); }
  } } });
  await s.index.update(() => { s.index.entry('gmail', 'thr_1', { create: false }).unread = 9; });
  const landed = await s.index.durable();
  const disk = fs.readFileSync(s.indexFile, 'utf8');
  const r = { landed, same: disk === wholeOf(s), rows: JSON.parse(disk).conversations, seen, stats: s.index.flushStats() };
  s.close();
  return r;
}
const placeRows = async (s) => {
  await s.index.update(() => {
    s.index.entry('gmail', 'thr_1', { create: false }).title = 'changed after its chunk was laid out';
    s.index.entry('gmail', `thr_${NB - 1}`, { create: false }).title = 'changed before its chunk was laid out';
    mkRow(s, 'lark', 'born_1', 1);
  });
};
const placedRight = (r) => r.rows['gmail/thr_1'].title === 'changed after its chunk was laid out' && r.rows[`gmail/thr_${NB - 1}`].title === 'changed before its chunk was laid out' && !!r.rows['lark/born_1'];
{
  const r = await layoutLeg(S, 'b1');
  ok(r.landed === true && r.same && r.rows['gmail/thr_1'].unread === 9, `(b1) PARITY: the sliced first write equals the whole-file serialization byte for byte (${NB} rows, the changed row on disk)`, r.stats);
  ok(r.stats.layoutSliced === 1 && r.stats.layoutSlices > 1 && r.seen.slices === r.stats.layoutSlices - 1, `(b1) it WAS sliced: ${r.stats.layoutSlices} slices, one layout landed`, r.stats);
  info(`(b1) LAW 4, printed — the layout's longest slice: ${r.stats.layoutMaxSliceMs} ms (one chunk a slice)`);
  ok(r.seen.partial === 0 && r.seen.wrote === 0, `(b3) NOBODY READS HALF: at each of the ${r.seen.slices} points between slices the file on disk was the last whole one and no write had landed; durable() resolved with the rows on disk`, r.seen);
}
{
  const r = await layoutLeg(S, 'b2', placeRows);
  ok(r.landed === true && r.same && placedRight(r) && r.stats.layoutRestarts === 0 && r.seen.placedAt < NB - 1, `(b2) A CHANGE DURING THE WALK (placed after ${r.seen.placedAt} of ${NB} rows were laid out: a row behind the walk changed, one ahead of it changed, one born): the write equals the whole serialization of its instant — the stated snapshot + the touched rows, no restart`, { stats: r.stats, seen: r.seen });
}
{
  const r = await layoutLeg(S, 'b2r', async (s) => { await s.index.update((x) => { delete x.conversations['gmail/thr_5']; }); });
  ok(r.landed === true && r.same && !r.rows['gmail/thr_5'] && r.stats.layoutRestarts === 1, `(b2) a removal between two slices (a whole-map touch) STARTS IT AGAIN (restarts: ${r.stats.layoutRestarts}) and the write still equals the whole serialization`, r.stats);
}
{
  const src = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
  const SM = M.load('src/channel-store.js', anchored(src, 'layout = next; warm = null; bytesOwed = true;', 'layout = next; warm = null; bytesOwed = true; dirtyKeys.clear();', 'the layout forgets the rows touched during it'), 'forgets');
  const r = await layoutLeg(SM, 'b2-red', placeRows);
  ok(!r.same && !placedRight(r), `(b2) RED CONTROL: a layout whose landing forgets the rows touched during it writes a file that is NOT the whole serialization (the placed rows lost) — the leg above would go red`, { same: r.same });
  const SN = M.load('src/channel-store.js', anchored(src, 'return LATER; }', 'return null; }', 'the store answers «equal to the disk» while its layout is built'), 'later-null');
  const rn = await layoutLeg(SN, 'b3-red');
  ok(rn.landed === true && rn.rows['gmail/thr_1'].unread !== 9, `(b3) RED CONTROL: a store answering the writer «nothing to write» (null) while its layout is built — durable() resolves TRUE with the changed row NOT on disk — the leg above would go red`, { landed: rn.landed, unread: rn.rows['gmail/thr_1'].unread });
}
/** (b4) a laid-out index, then a mass of touched rows (more than the bound): their chunks re-serialized in slices */
async function applyLeg(tag, mid = null, mass = null, SM = S) {
  const dir = copyOf(TPL_B, `b4-${tag}`);
  let s = null, armed = false, placed = false;
  s = SM.createChannelStore({ dir, log: quiet, walk: { syncRows: 500, sliceMs: 0, onSlice: async (i, what) => { if (what === 'layout' && armed && mid && !placed) { placed = true; await mid(s); } } } });
  await s.index.update(() => { s.index.entry('gmail', 'thr_1', { create: false }).unread = 9; });
  await s.index.durable();   // the first write: the sliced layout
  const f0 = s.index.flushStats();
  armed = true;
  await s.index.update(() => { if (mass) mass(s); else for (let i = 0; i < NB; i += 2) s.index.entry(i % 3 ? 'gmail' : 'lark', `thr_${i}`, { create: false }).title = `mass ${i}`; });
  const landed = await s.index.durable();
  const disk = fs.readFileSync(s.indexFile, 'utf8');
  const r = { landed, same: disk === wholeOf(s), rows: JSON.parse(disk).conversations, f0, stats: s.index.flushStats(), placed };
  s.close();
  return r;
}
{
  const r = await applyLeg('apply');
  ok(r.landed === true && r.same && r.rows['gmail/thr_2'].title === 'mass 2' && r.stats.applySliced === 1 && r.stats.layoutSliced === r.f0.layoutSliced, `(b4) PARITY — ${NB / 2} rows touched at once on a laid-out index: their chunks re-serialized in slices (one sliced apply, no new layout), the write equals the whole serialization`, r.stats);
  const rs = await applyLeg('apply-sync', async (s) => { s.index.flush(); });
  ok(rs.placed && rs.landed === true && rs.same && rs.rows['gmail/thr_2'].title === 'mass 2', '(b4) a synchronous flush between two of its slices takes it over — no touched row lost, the file equals the whole serialization', rs.stats);
  // the reader's case: ONE row really changed (its chunk re-made in the first slice), a thousand touched unchanged — a
  // synchronous flush after that slice must still write the change (the chunk's bytes owed at once, never at the landing)
  const oneChanged = (s) => { s.index.entry('lark', 'thr_0', { create: false }).title = 'changed in the first chunk'; for (let i = 3; i < NB; i += 3) s.index.entry('lark', `thr_${i}`, { create: false }); };
  const flushMid = async (s) => { s.index.flush(); };
  const rt = await applyLeg('apply-owed', flushMid, oneChanged);
  ok(rt.placed && rt.same && rt.rows['lark/thr_0'].title === 'changed in the first chunk', `(b4) a takeover after the changed chunk was re-made still writes it: the file holds the one changed row (${rt.rows['lark/thr_0'].title})`, rt.stats);
  const asrc = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
  const SO = M.load('src/channel-store.js', anchored(asrc, "await walkSliced([...stale], (c) => { if (serializeChunk(c, conv)) bytesOwed = true; }", "await walkSliced([...stale], (c) => { serializeChunk(c, conv); }", 'a re-made chunk owes its bytes only at the landing'), 'apply-owed-late');
  const rto = await applyLeg('apply-owed-red', flushMid, oneChanged, SO);
  ok(rto.placed && rto.rows['lark/thr_0'].title !== 'changed in the first chunk', `(b4) RED CONTROL: a chunk apply whose re-made chunk owes its bytes only at its landing — the takeover's write says «equal to the disk» and the changed row is NOT on disk (${rto.rows['lark/thr_0'].title}) — the leg above would go red`, rto.stats);
}

// (b6) THE BOUND ON LATER — a whole-map touch during each of three sliced layouts: the next write is laid out in ONE turn,
// said once, and durable() resolves with the rows on disk (never a wait of 60 s)
{
  const dir = copyOf(TPL_B, 'b6'), warns = [];
  let s = null, touched = 0;
  s = S.createChannelStore({ dir, log: { log() { }, warn: (...a) => warns.push(a.join(' ')), error() { } }, walk: { syncRows: 500, sliceMs: 0, onSlice: async (i, what) => {
    if (what === 'layout' && i === 1 && touched < 3) { touched++; await s.index.update((x) => { x.conversations; }); }   // reaching the map: a whole touch
  } } });
  await s.index.update(() => { s.index.entry('gmail', 'thr_1', { create: false }).unread = 9; });
  const landed = await s.index.durable();
  const disk = fs.readFileSync(s.indexFile, 'utf8'), st = s.index.flushStats();
  const said = warns.filter((w) => /started again 3 times by whole-map writes/.test(w)).length;
  s.close();
  ok(touched === 3 && landed === true && JSON.parse(disk).conversations['gmail/thr_1'].unread === 9 && st.layoutRestarts === 3 && said === 1, `(b6) THE BOUND: three whole-map touches, each during a sliced layout (restarts ${st.layoutRestarts}) — the next write laid out in one turn, said ONCE (${said}), durable() true with the row on disk`, { st, warns: warns.slice(0, 3) });
}
// (b7) A SYNCHRONOUS FLUSH DURING THE FIRST SLICED LAYOUT (the exit's case on a stop): it lays out whole in its own turn
{
  const r = await layoutLeg(S, 'b7', async (s) => { s.index.flush(); });
  ok(r.landed === true && r.same && r.rows['gmail/thr_1'].unread === 9 && r.stats.layoutSliced === 0 && r.seen.placedAt !== null, `(b7) a synchronous flush between two slices of the first layout takes it over — laid out whole in its turn (sliced layouts landed: ${r.stats.layoutSliced}), the file the whole serialization, the row on disk`, r.stats);
}

// (b5) THE PER-ACCOUNT KEYS — built in slices from the load; a key touched meanwhile placed at the landing; a reader first finishes them
async function keysLeg(SM, tag, place = null, readFirst = false) {
  const dir = copyOf(TPL_B, `b5-${tag}`);
  let s = null, placed = false, early = null;
  s = SM.createChannelStore({ dir, log: quiet, walk: { syncRows: 500, sliceMs: 0, onSlice: async (i, what) => {
    if (what !== 'account-keys' || placed) return;
    placed = true;
    if (place) await place(s);
    if (readFirst) early = { gmail: s.index.keysOf('gmail'), warming: s.index.keysStats().warming };
  } } });
  await until('the per-account keys to land', () => !s.index.keysStats().warming);
  const got = { gmail: s.index.keysOf('gmail'), lark: s.index.keysOf('lark') }, stats = s.index.keysStats();
  s.close();
  const w = S.createChannelStore({ dir: copyOf(TPL_B, `b5-${tag}-whole`), log: quiet, walk: { syncRows: 1e9 } });
  if (place) await place(w);
  const whole = { gmail: w.index.keysOf('gmail'), lark: w.index.keysOf('lark') };
  w.close();
  return { got, whole, stats, early, placed };
}
const placeKeys = async (s) => { await s.index.update(() => { mkRow(s, 'gmail', 'born_k', 1); mkRow(s, 'lark', 'born_l', 2); }); };
{
  const r = await keysLeg(S, 'keys', placeKeys);
  ok(r.placed && eq(r.got, r.whole) && r.got.gmail.at(-1) === 'gmail/born_k' && r.got.lark.at(-1) === 'lark/born_l' && r.stats.sliced === 1, `(b5) PARITY + A CHANGE DURING THE WALK: the per-account keys built in slices from the load equal a whole build after the same births (${r.got.gmail.length} + ${r.got.lark.length} keys, each born row at its account's end, in the map's order)`, { stats: r.stats, n: [r.got.gmail.length, r.whole.gmail.length] });
  const rf = await keysLeg(S, 'keys-first', placeKeys, true);
  ok(!!rf.early && !rf.early.warming && eq(rf.early.gmail, rf.whole.gmail), `(b5) NOBODY READS HALF: a keysOf() before the build lands finishes it in its own turn — the whole ${rf.whole.gmail.length} keys, never a partial set`, rf.early && { warming: rf.early.warming, n: rf.early.gmail.length });
  const ksrc = fs.readFileSync(path.join(REPO, 'src/channel-store.js'), 'utf8');
  const KM = M.load('src/channel-store.js', anchored(ksrc, 'byAcct = job.map; for (const k of job.touched) acctPlace(k);', 'byAcct = job.map;', 'the landing forgets the keys touched during the build'), 'keys-forget');
  const rr = await keysLeg(KM, 'keys-red', placeKeys);
  ok(!eq(rr.got, rr.whole), '(b5) RED CONTROL: a landing that forgets the keys touched during the build misses the born rows — the leg above would go red', { n: [rr.got.gmail.length, rr.whole.gmail.length] });
}

// ═══ the engine's stand-in (c, d) ═══
const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker' }, AGENT2 = { kind: 'agent', id: 'agent-2', name: 'Other' };
const A = 'mail';
const mkEng = (EM, dataDir, walk, log = quiet, clock = null) => EM.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: () => {}, now: clock ? () => clock.t : () => T, log, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }, { cid: 'agent-2', name: 'Other', groups: [] }], censusTimer: () => ({ cancel() {} }), walk });
const rowShape = (i) => ({ title: `Thread ${i}`, kind: 'dm', lastAt: T - (i % 200) * H, unread: 0, readAt: T - 86400e3, listedAt: T - 86400e3, lane: { via: 'poll', lastPollAt: T - (i % 48) * 1800e3 - 40 * H, firstSeenByPoll: 1, firstSeenTotal: 1 } });
const VERDICT = (at) => ({ at, read: 'yes', sendAs: ['user'], why: null });
async function standInEngine(name, n, { census = false, rejudge = false } = {}) {
  const D = path.join(ROOT, name);
  fs.mkdirSync(path.join(D, 'channels'), { recursive: true });
  // rejudge: the account's credential changed at T (lastAuthAt) — every row's verdict, judged an hour before, is re-judged
  fs.writeFileSync(path.join(D, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: A, kind: 'fake-poll', label: A, enabled: true, options: {}, state: {}, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, ...(rejudge ? { lastAuthAt: T } : {}) }] }));
  const e0 = mkEng(ENG, D, { syncRows: 1e9 });
  const ix = e0.store.index;
  await ix.update(() => { for (let i = 0; i < n; i++) Object.assign(ix.entry(A, `m-${i}`), rowShape(i), i === 3 ? { selfAt: 0 } : {}, rejudge ? { convCaps: VERDICT(T - H) } : {}); });
  const said = [];
  if (census) {
    said.push(await e0.setAccess(A, { kind: 'account' }, [{ principal: AGENT }]));
    for (const i of [10, 700, 1400]) said.push(await e0.setWatchers(A, { kind: 'conversation', convId: `m-${i}` }, [{ principal: AGENT, notify: 'wake' }]));
    await ix.update(() => {   // the LEGACY fields the censuses name (stored before their refusals existed), and rows without access
      for (const [i, f] of [[10, { receiptWake: true }], [700, { notify: 'digest', digestMinutes: 30, dailyWakeCap: 0 }], [1400, { receiptWake: true }]]) Object.assign(ix.entry(A, `m-${i}`, { create: false }).watchers[0], f);
      for (const i of [20, 800, 1450]) ix.entry(A, `m-${i}`, { create: false }).watchers = [{ principal: AGENT2, notify: 'wake', at: T }];
    });
  }
  ix.flush();
  try { await e0.store.close?.(); } catch { }
  try { e0.stop(); } catch { }
  return { D, said };
}

// ═══ (c) THE DUE INDEX ═══
console.log('(c) an account\'s due index, built in slices');
const NC = 1500;
const { D: TPL_C } = await standInEngine('tpl-c', NC);
const dueRows = (l) => JSON.stringify([...l].map((d) => [d.key, d.dueAt]));
async function dueLeg(EM, tag, place = null) {
  const D = copyOf(TPL_C, `c-${tag}`);
  let e = null, placedAt = null;
  e = mkEng(EM, D, { syncRows: 500, sliceMs: 0, onSlice: async (i, what) => { if (what === 'due' && place && placedAt === null) { placedAt = i; await place(e); } } });
  const first = e.dueListOf(A, { sync: false });   // the tick's reading (a census reads it whole, in its turn)
  const firstSaid = { notReady: first.notReady === true, n: first.length };
  await until('the sliced due index to land', () => e.dueIndexStats().sliced >= 1);
  const list = e.dueListOf(A);
  const stats = e.dueIndexStats();
  e.stop();
  // the whole build: the same store (a copy), the same writes placed BEFORE it, built in one turn
  const D2 = copyOf(TPL_C, `c-${tag}-whole`);
  const w = mkEng(ENG, D2, { syncRows: 1e9 });
  if (place) await place(w);
  const whole = w.dueListOf(A);
  w.stop();
  return { firstSaid, list, whole, stats, placedAt };
}
const placeDue = async (e) => {
  e.store.stamps.set(`${A}/m-0`, { lastPollAt: T });   // a row BEHIND the walk polled now: no longer due (re-keyed at the landing)
  e.store.stamps.set(`${A}/m-5`, { lastPollAt: T });   // a row polled now: no longer due
  await e.store.index.update(() => { Object.assign(e.store.index.entry(A, 'm-born'), rowShape(7)); });   // a row born, overdue
};
{
  const r = await dueLeg(ENG, 'c1');
  ok(r.firstSaid.notReady && r.firstSaid.n === 0, `(c1) NOBODY READS HALF: while the index is built the due list says NOT READY by name (never an empty list taken as «nothing due»)`, r.firstSaid);
  ok(r.whole.length > 0 && dueRows(r.list) === dueRows(r.whole), `(c2) PARITY: the sliced due index answers the whole build's ${r.whole.length} due rows, the same instants in the same order`, { sliced: r.list.length, whole: r.whole.length });
  info(`(c) LAW 4, printed — the due build's longest slice ${r.stats.maxSliceMs} ms, its sort ${r.stats.maxSortMs} ms`);
  ok(r.stats.sliced === 1 && r.stats.slices > 1, `(c) it WAS sliced (${r.stats.slices} slices)`, r.stats);
}
{
  const r = await dueLeg(ENG, 'c3', placeDue);
  const has = (l, k) => l.some((d) => d.key === k);
  ok(r.placedAt !== null && dueRows(r.list) === dueRows(r.whole) && !has(r.list, `${A}/m-0`) && !has(r.list, `${A}/m-5`) && has(r.list, `${A}/m-born`), `(c3) A CHANGE DURING THE WALK (placed after ${r.placedAt} of ${NC} rows: a poll stamp behind the walk and one ahead of it, a row born): equal to a whole build after the same writes — the stamped row not due, the born row due`, { placedAt: r.placedAt, sliced: r.list.length, whole: r.whole.length });
}
{
  const EM = M.load('src/server/channels-engine.js', anchored(engineSource(REPO), 'if (!ix) return dueNotReady();', 'if (!ix) return [];', 'the due list answers [] while it is built'), 'due-empty');
  const r = await dueLeg(EM, 'c1-red');
  ok(!r.firstSaid.notReady && r.firstSaid.n === 0, '(c1) RED CONTROL: a due list answering [] while its index is built reads as «nothing due» (no notReady) — the leg above would go red', r.firstSaid);
}

{
  // (c4) THE DUE BUILD'S RESTART BOUND (cut 3b): a whole-map touch during each of three sliced builds of one account — the
  // next build is made in ONE turn, said once in the journal, and answers what a whole build answers
  const D = copyOf(TPL_C, 'c4'), warns = [];
  const logc = { log() { }, info() { }, warn: (x) => warns.push(String(x)), error() { } };
  let e = null, touched = 0;
  e = mkEng(ENG, D, { syncRows: 500, sliceMs: 0, onSlice: async (i, what) => { if (what === 'due' && i === 1 && touched < 3) { touched++; await e.store.index.update((x) => { x.conversations; }); } } }, logc);
  let list = null, asked = 0;
  await until('the due index to answer', () => { asked++; const l = e.dueListOf(A, { sync: false }); if (!l.notReady) { list = l; return true; } return false; });
  const stats = e.dueIndexStats();
  e.stop();
  const w = mkEng(ENG, copyOf(TPL_C, 'c4-whole'), { syncRows: 1e9 });
  const whole = w.dueListOf(A);
  w.stop();
  const said = warns.filter((x) => /made stale during 3 sliced builds in a row/.test(x)).length;
  ok(touched === 3 && stats.whole === 1 && said === 1 && dueRows(list) === dueRows(whole) && whole.length > 0, `(c4) THE BOUND: three sliced builds made stale (whole-map touches) — the next built in one turn (${stats.whole}), said ONCE (${said}), answering the whole build's ${whole.length} due rows (asked ${asked}×)`, { stats, warns: warns.slice(0, 3) });
}

// ═══ (d) THE BOOT'S SWEEP ═══
console.log('(d) the boot\'s sweep — the three censuses and the heal\'s plan, one walk');
const ND = 1500;
const { D: TPL_D, said: censusSaid } = await standInEngine('tpl-d', ND, { census: true });
ok(censusSaid.every((x) => x && x.ok !== false), '(d) the stand-in\'s census rows written through the doors (the account\'s access, three conversations\' notifications)', censusSaid);
const wholeWalks = (e) => ({
  receipt: e.deprecatedReceiptWakes(), capZero: e.capZeroDigests(), orphans: e.orphanWatchers(),
  selfAtPlan: Object.values(e.store.index.live()).filter((en) => en && !('selfAt' in en) && Number(en.lastAt) > T - 48 * H).map((en) => en.key),
});
async function sweepLeg(EM, tag, place = null, minAt = 1) {   // minAt: the place lands once that many rows were read
  const D = copyOf(TPL_D, `d-${tag}`);
  const e = mkEng(EM, D, { syncRows: 1e9 });
  let placedAt = null;
  const sw = e.bootSweep({ syncRows: 0, sliceMs: 0, onSlice: async (i, what) => { if (what === 'boot-sweep' && place && placedAt === null && i >= minAt) { placedAt = i; await place(e); } } });
  const r0 = sw.promise ? await sw.promise : null;
  const got = r0 && { receipt: r0.receipt, capZero: r0.capZero, orphans: r0.orphans, selfAtPlan: r0.selfAtPlan };
  const whole = wholeWalks(e);
  const stats = e.bootSweepStats();
  e.stop();
  return { got, whole, stats, placedAt };
}
const sizes = (r) => r ? { receipt: r.receipt.length, capZero: r.capZero.length, orphans: r.orphans.length, selfAtPlan: r.selfAtPlan.length } : null;
{
  const r = await sweepLeg(ENG, 'd1');
  const nonEmpty = r.whole.receipt.length && r.whole.capZero.length && r.whole.orphans.length && r.whole.selfAtPlan.length;
  ok(!!nonEmpty && eq(r.got, r.whole), `(d1) PARITY: the sliced sweep says what the whole walks say — receiptWake ${r.whole.receipt.length}, cap-0 digests ${r.whole.capZero.length}, rows without access ${r.whole.orphans.length}, the heal's plan ${r.whole.selfAtPlan.length} — in their order`, { got: sizes(r.got), whole: sizes(r.whole), w: r.whole });
  info(`(d1) LAW 4, printed — the sweep's longest slice ${r.stats.maxSliceMs} ms`);
  ok(r.stats.sliced === 1 && r.stats.slices > 1 && r.stats.restarts === 0, `(d1) it WAS sliced (${r.stats.slices} slices over ${r.stats.rows} rows), no restart`, r.stats);
  const D = copyOf(TPL_D, 'd1-sync');
  const e = mkEng(ENG, D, { syncRows: 1e9 });
  const sw = e.bootSweep();
  const sy = sw.sync && { receipt: sw.sync.receipt, capZero: sw.sync.capZero, orphans: sw.sync.orphans, selfAtPlan: sw.sync.selfAtPlan };
  ok(!!sy && eq(sy, wholeWalks(e)), '(d1) …and a store under the bound is swept in the caller\'s own turn with the same answer');
  e.stop();
}
const placeSweep = async (e) => {
  await e.store.index.update(() => {
    e.store.index.entry(A, 'm-0', { create: false }).watchers = [{ principal: AGENT2, notify: 'wake', at: T }];   // visited already: now a row without access
    e.store.index.entry(A, 'm-1450', { create: false }).watchers = [];                                         // not visited yet: no longer one
    Object.assign(e.store.index.entry(A, 'm-born'), rowShape(0), { lastAt: T, watchers: [{ principal: AGENT2, notify: 'wake', at: T }] });   // born
  });
};
const placedSweep = (o) => !!o && o.orphans.some((x) => x.id === `${A}/m-0`) && o.orphans.some((x) => x.id === `${A}/m-born`) && !o.orphans.some((x) => x.id === `${A}/m-1450`) && o.selfAtPlan.includes(`${A}/m-born`);
{
  const r = await sweepLeg(ENG, 'd2', placeSweep);
  ok(r.placedAt !== null && r.placedAt < 1450 && eq(r.got, r.whole) && placedSweep(r.got) && r.stats.reread >= 3 && r.stats.restarts === 0, `(d2) A CHANGE DURING THE WALK (placed after ${r.placedAt} of ${ND} rows: a row behind the walk, one ahead of it, one born): equal to the whole walks at the landing — the ${r.stats.reread} touched rows read again, no restart`, { got: sizes(r.got), whole: sizes(r.whole), stats: r.stats });
}
const placeGrant = async (e) => { const x = await e.setAccess(A, { kind: 'account' }, []); if (x && x.ok === false) throw new Error('the access withdrawal was refused: ' + JSON.stringify(x)); };
{
  const r = await sweepLeg(ENG, 'd3', placeGrant, 50);   // after row m-10 (a notification in effect) was read
  ok(r.placedAt >= 50 && eq(r.got, r.whole) && r.stats.restarts === 1 && r.got.orphans.some((x) => x.id === `${A}/m-10`), `(d3) a grants change between two slices (the account's access withdrawn after ${r.placedAt} rows) STARTS IT AGAIN (restarts: ${r.stats.restarts}): its answer is the whole walks' after the change (m-10's notification now without access)`, { got: sizes(r.got), whole: sizes(r.whole), stats: r.stats });
}
{
  const src = engineSource(REPO);
  const reread = M.load('src/server/channels-engine.js', anchored(src, 'for (const k of job.touched) { bootSweepStats.reread++; visit(k); }', '', 'the sweep does not read the touched rows again'), 'sweep-no-reread');
  const r1 = await sweepLeg(reread, 'd2-red', placeSweep);
  ok(!eq(r1.got, r1.whole), '(d2) RED CONTROL: a sweep whose landing does not read the touched rows again says a torn answer (not the whole walks\') — the leg above would go red', { got: sizes(r1.got), whole: sizes(r1.whole) });
  const blind = M.load('src/server/channels-engine.js', anchored(anchored(src, 'alive: () => !stopped && !job.stale && CG.generation() === job.gen', 'alive: () => !stopped && !job.stale', 'the sweep blind to a grants change (between slices)'),
    'if (!done || job.stale || CG.generation() !== job.gen)', 'if (!done || job.stale)', 'the sweep blind to a grants change (at the landing)'), 'sweep-blind');
  const r2 = await sweepLeg(blind, 'd3-red', placeGrant, 50);
  ok(!eq(r2.got, r2.whole) && r2.stats.restarts === 0, '(d3) RED CONTROL: a sweep blind to a grants change lands the rows it read before the change (not the whole walks\') — the leg above would go red', { got: sizes(r2.got), whole: sizes(r2.whole) });
}
{
  // (d5) THE BOOT SWEEP'S BOUND (cut 3b): a grants change during each of three sliced sweeps — the fourth walks in ONE turn,
  // said once in the journal, and still answers the whole walks
  const warns = [];
  const logd = { log() { }, info() { }, warn: (x) => warns.push(String(x)), error() { } };
  const e = mkEng(ENG, copyOf(TPL_D, 'd5'), { syncRows: 1e9 }, logd);
  let changes = 0;
  const sw = e.bootSweep({ syncRows: 0, sliceMs: 0, onSlice: async (i, what) => { if (what === 'boot-sweep' && i === 1 && changes < 3) { changes++; await e.setAccess(A, { kind: 'account' }, changes % 2 ? [] : [{ principal: AGENT }]); } } });
  const r0 = await sw.promise;
  const got = r0 && { receipt: r0.receipt, capZero: r0.capZero, orphans: r0.orphans, selfAtPlan: r0.selfAtPlan };
  const st = e.bootSweepStats(), whole = wholeWalks(e);
  e.stop();
  const said = warns.filter((x) => /the boot sweep was started again 3 times/.test(x)).length;
  ok(changes === 3 && st.restarts === 3 && st.whole === 1 && said === 1 && eq(got, whole), `(d5) THE BOUND: three grants changes, each during a sliced sweep (restarts ${st.restarts}) — the fourth swept in one turn (${st.whole}), said ONCE (${said}), its answer the whole walks'`, { st, warns: warns.slice(0, 3) });
}
{
  const D = copyOf(TPL_D, 'd4');
  const lines = [];
  const log = { log: (x) => lines.push(String(x)), info: (x) => lines.push(String(x)), warn: (x) => lines.push(String(x)), error: (x) => lines.push(String(x)) };
  const e = mkEng(ENG, D, { syncRows: 500, sliceMs: 0 }, log);
  const census = (l) => /still carry receiptWake:true|stored with a daily cap of 0|without access at their grain/.test(l);
  e.start();
  const inTurn = lines.filter(census).length;
  await until('the boot sweep to land', () => e.bootSweepStats().sliced >= 1);
  await new Promise((r) => setImmediate(r));
  const after = lines.filter(census);
  e.stop();
  ok(inTurn === 0 && after.length === 3, `(d4) NOBODY READS HALF: start() on a store over the bound says no census line in its own turn (${inTurn}) and the three at the landing (${after.length}) — their only readers are those lines and the heal; a person's first page reads none of it`, lines.slice(0, 6));
}

// ═══ (e) THE RE-JUDGE (the boot's: every row's verdict against the account's credential) ═══
console.log('(e) a big account\'s verdicts re-judged against its credential, in slices');
const NE = 1500;
const { D: TPL_E } = await standInEngine('tpl-e', NE, { rejudge: true });
const capsOf = (e) => JSON.stringify(Object.entries(e.store.index.live()).map(([k, en]) => [k, en.convCaps]));
async function rejudgeLeg(tag, place = null) {
  const D = copyOf(TPL_E, `e-${tag}`);
  let e = null, placedAt = null;
  e = mkEng(ENG, D, { syncRows: 500, sliceMs: 0, onSlice: async (i, what) => { if (what === 'rejudge' && place && placedAt === null) { placedAt = i; await place(e); } } });
  const n = await e.rejudgeConvCaps(e.store.adapters.live().adapters.find((r) => r.id === A), 'the leg');
  const got = capsOf(e), stats = e.rejudgeStats();
  e.stop();
  const w = mkEng(ENG, copyOf(TPL_E, `e-${tag}-whole`), { syncRows: 1e9 });
  if (place) await place(w);
  const n2 = await w.rejudgeConvCaps(w.store.adapters.live().adapters.find((r) => r.id === A), 'the leg');
  const whole = capsOf(w), wstats = w.rejudgeStats();
  w.stop();
  return { n, n2, got, whole, stats, wstats, placedAt };
}
{
  const r = await rejudgeLeg('e1');
  ok(r.n === NE && r.n2 === NE && r.got === r.whole && /"rejudged":"stale"/.test(r.got), `(e1) PARITY: the sliced re-judge persists what the whole one does — all ${NE} verdicts re-judged (${r.n} / ${r.n2}), row for row`, { n: r.n, n2: r.n2 });
  info(`(e1) LAW 4, printed — the re-judge's longest slice ${r.stats.maxSliceMs} ms`);
  ok(r.stats.sliced === 1 && r.stats.slices > 1 && r.wstats.sliced === 0, `(e1) it WAS sliced (${r.stats.slices} updates); the whole one is one update`, { stats: r.stats, wstats: r.wstats });
}
{
  const fresh = async (e) => { await e.store.index.update(() => { for (const c of ['m-0', `m-${NE - 1}`]) e.store.index.entry(A, c, { create: false }).convCaps = VERDICT(T + 1); }); };
  const r = await rejudgeLeg('e2', fresh);
  ok(r.placedAt !== null && r.placedAt < NE - 1 && r.got === r.whole && r.got.includes(`"${A}/m-0",{"at":${T + 1}`) && r.got.includes(`"${A}/m-${NE - 1}",{"at":${T + 1}`), `(e2) A CHANGE DURING THE WALK (placed after ${r.placedAt} of ${NE} rows: a fresh verdict on a row behind the walk and one ahead of it): the rows equal a whole re-judge after the same write — both fresh verdicts kept`, { placedAt: r.placedAt });
}

// ═══ (f) THE DUE TURN'S CAP (cut 3b): its heads all re-keyed, more behind them ═══
console.log('(f) the due turn takes 2000 heads: when they all turn out not due, the account is asked again — the due rows past them are polled');
const NF = 2500;
const TPL_F = path.join(ROOT, 'tpl-f');
{
  fs.mkdirSync(path.join(TPL_F, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(TPL_F, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: [{ id: A, kind: 'fake-poll', label: A, enabled: true, options: {}, state: {}, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0, discovery: { cursor: null, at: T, complete: true, completeAt: T } }] }));
  const e0 = mkEng(ENG, TPL_F, { syncRows: 1e9 });
  const ix = e0.store.index;
  const row = (lastAt, lastPollAt) => ({ title: 'Thread', kind: 'dm', lastAt, unread: 0, readAt: T - 86400e3, listedAt: T, lane: { via: 'poll', lastPollAt, firstSeenByPoll: 1, firstSeenTotal: 1 } });
  await ix.update(() => {
    // 2500 heads: active 59.5 min ago (HOT at T: due 30 s after their poll — keyed T+10 s), WARM a minute later (due T+280 s)
    for (let i = 0; i < NF; i++) Object.assign(ix.entry(A, `s-${i}`), row(T - 59.5 * 60e3, T - 20e3));
    // five truly due: cold (900 s), polled 905 s before T+60 s — keyed T+55 s, past every head
    for (let i = 0; i < 5; i++) Object.assign(ix.entry(A, `d-${i}`), row(T - 30 * H, T + 60e3 - 905e3));
  });
  ix.flush();
  try { await e0.store.close?.(); } catch { }
  try { e0.stop(); } catch { }
}
async function turnLeg(EM, tag) {
  const clock = { t: T };
  const e = mkEng(EM, copyOf(TPL_F, `f-${tag}`), { syncRows: 1e9 }, quiet, clock);   // the index built in one turn: this leg is the TURN's
  const before = e.dueListOf(A).length;   // at T: nothing due
  clock.t = T + 60e3;
  const r0 = e.dueIndexStats().rekeys;
  e.tick();
  for (let i = 0; i < 60; i++) await new Promise((z) => setImmediate(z));   // the loop's next turns (the re-asks), then the pass
  await e.idle(A);
  const polled = [0, 1, 2, 3, 4].filter((i) => Number(e.store.stamps.lane(e.store.index.peek(`${A}/d-${i}`)).lastPollAt) === T + 60e3).length;
  const rekeyed = e.dueIndexStats().rekeys - r0;
  e.stop();
  return { before, polled, rekeyed };
}
{
  const r = await turnLeg(ENG, 'turn');
  ok(r.before === 0 && r.polled === 5 && r.rekeyed >= NF, `(f) ${NF} heads turned out not due after all (re-keyed ${r.rekeyed}: the turn's 2000, then the rest on the loop's next turn) — the five due rows behind them POLLED (${r.polled}) on the same tick, never a 5 s tick per 2000 heads`, r);
  const EMf = M.load('src/server/channels-engine.js', anchored(engineSource(REPO), '      if (!due) { if (dl && dl.more) dueRecheck(rec); continue; }', '      if (!due) continue;', 'the tick does not ask again'), 'turn-no-recheck');   // stale-pins: kept (the control restores the release's line)
  const rc = await turnLeg(EMf, 'turn-red');
  ok(rc.polled === 0 && rc.rekeyed === 2000, `(f) RED CONTROL: a tick that does not ask again polls none of the five (${rc.polled}; re-keyed ${rc.rekeyed}) — they wait for the next tick, and the next — the leg above would go red`, rc);
}

// ═══ (g) THE FIND (cut 3, named): the stale reservations' release touches only the rows it changes ═══
console.log('(g) the release of a dead boot\'s reservations touches the row holding one — never the whole map');
async function releaseLeg(EM, tag) {
  const e = mkEng(EM, copyOf(TPL_C, `g-${tag}`), { syncRows: 1e9 });
  await e.store.index.update(() => { e.store.index.entry(A, 'm-7', { create: false }).watchers = [{ principal: { kind: 'agent', id: 'agent-1', name: 'Worker' }, notify: 'wake', mode: 'all', stats: { wakes: [{ id: 'r-dead', at: T - H, reserved: true, bootId: 'a-dead-boot' }] } }]; });
  const touched = [];
  e.store.index.onTouch((k) => touched.push(k));
  const released = await e.releaseStaleReservations();
  const left = (e.store.index.peek(`${A}/m-7`).watchers[0].stats.wakes || []).length;
  e.stop();
  return { released, left, whole: touched.filter((k) => k === null).length, rows: touched.filter((k) => k !== null) };
}
{
  const r = await releaseLeg(ENG, 'release');
  ok(r.released === 1 && r.left === 0 && r.whole === 0 && r.rows.length === 1 && r.rows[0] === `${A}/m-7`, `(g) the dead boot's reservation released (${r.released}) — the ONE row holding it touched (${r.rows.join(', ')}), the whole map never (${r.whole})`, r);
  const RELEASE_NOW = '      for (const k of staleKeys) { const en = rows[k]; if (!en) continue; store.index.touch(k); sweep(en.watchers); }';
  const EMg = M.load('src/server/channels-engine.js', anchored(engineSource(REPO), '      const rows = store.index.rows();\n' + RELEASE_NOW, '      for (const en of Object.values(ix.conversations || {})) if (en) sweep(en.watchers);', 'the release reaches the whole map (the release before cut 3)'), 'release-whole');
  const rg = await releaseLeg(EMg, 'release-red');
  ok(rg.released === 1 && rg.whole >= 1, `(g) RED CONTROL: the release's old walk (ix.conversations inside its update) is a WHOLE-MAP touch at every boot (${rg.whole}) — the leg above would go red`, rg);
}

report();
