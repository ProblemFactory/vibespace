#!/usr/bin/env node
// test-sliced-walk-holds — B-dfa4's THREE HOLDS (主开发 r5449 / r5450, measured on the owner's hub) and their FOLLOW (r5495), SPLIT
// WORD FOR WORD out of test-sliced-walk (主开发 r5518: that suite reached 9.8 s, near FAST_MAX_MS; its older sections (a)–(h) stay
// there exactly as they were). The harness (the engine's stand-in, the first digest, the bounded wait) is test-sliced-walk's, copied
// as it is; this suite has its own scratch folder and its own mutant copies.
//   (i) THE ROW FACTS' RE-SUM AFTER A VOID (hold (ii)), in slices: the reader meanwhile answered the sums as they stood (0 rows read in
//       its turn), one row a slice, the landing pushed ONCE (the choice named: even when the sums equal the old ones), a write between
//       two slices re-read, a second whole touch restarts it, three of them stop it (said once, the clients told once) and the next
//       reader re-sums whole; (i4) a re-sum that throws: said once, told once; RED: the void re-summed whole in the reader's turn,
//       a landing that forgets the touched rows, a give-up that tells nobody.
//   (k) THE GAP BEFORE A LANDING (r5495 (3)): a whole-map touch placed between a walk's last slice and its landing (one microtask
//       from the walk's last seam, witnessed at the touch) restarts the walk — the re-sum (k1) and the warm-up (k2), on their own
//       600-row stand-in; RED: each landing without its look again.
//   (j) AT THE BOUND THE READER FINISHES THE ROWS LEFT of a stalled warm-up in its own turn (hold (iii)) — counted as rows (the census
//       walk's left, or a walk's left plus those not begun; never the row facts again), the same answer, a write during the stall
//       re-read; RED: the bound finishes nothing (the reader builds whole).
// Run: node scripts/test-sliced-walk-holds.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const M = mutantCopies('sliced-walk-holds', REPO);

const { ok, report } = checker();
const info = (l) => console.log('  · ' + l);
const ROOT = scratch('sliced-walk-holds');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const quiet = { log() { }, info() { }, warn() { }, error() { } };
const T = Date.UTC(2026, 10, 18, 12, 0, 0);
const H = 3600e3;
// LAW 4 (no slice over 50 ms by its own clock) is PRINTED here, never asserted: a fast suite bounds no wall clock (the
// test machines' load is no product fact — test-ci-gate's census); the law's reading is the measurement on the full stand-in
/** a wait for what happened: bounded, and red by name when it never does */
async function until(what, cond, ms = 8000) {
  const a = Date.now();
  while (!cond()) { if (Date.now() - a > ms) throw new Error(`waited ${ms} ms for ${what} — it never happened`); await new Promise((r) => setTimeout(r, 2)); }
}
const copyOf = (tpl, name) => { const d = path.join(ROOT, name); fs.cpSync(tpl, d, { recursive: true }); return d; };

// ═══ the engine's stand-in (test-sliced-walk's, copied as it is) ═══
const AGENT = { kind: 'agent', id: 'agent-1', name: 'Worker' }, AGENT2 = { kind: 'agent', id: 'agent-2', name: 'Other' };
const A = 'mail';
const mkEng = (EM, dataDir, walk, log = quiet, clock = null, bcast = null) => EM.create({ dataDir, env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: bcast || (() => {}), now: clock ? () => clock.t : () => T, log, liveSessions: () => [{ cid: 'agent-1', name: 'Worker', groups: [] }, { cid: 'agent-2', name: 'Other', groups: [] }], censusTimer: () => ({ cancel() {} }), walk });
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

// THE STAND-IN of (i) and (j): test-sliced-walk's (d) one — 1500 rows, its census rows written through the doors
const ND = 1500;
const { D: TPL_D, said: censusSaid } = await standInEngine('tpl-d', ND, { census: true });
ok(censusSaid.every((x) => x && x.ok !== false), 'fixture: the stand-in\'s census rows written through the doors (the account\'s access, three conversations\' notifications)', censusSaid);
// THE FIRST DIGEST (test-sliced-walk's (h) readers, copied as they are)
const digestOf = (e) => JSON.stringify(e.digest({ scope: 'first' }));
// B-fbd6 item 7: the whole build's digest of the UNCHANGED stand-in (no write placed) is one string — read once: nine legs made a fresh
// engine over a copy for it
let plainDigestOnce = null;
const plainDigest = () => plainDigestOnce || (plainDigestOnce = (() => { const w = mkEng(ENG, copyOf(TPL_D, 'h-plain-whole'), { syncRows: 1e9 }); const d = digestOf(w); w.stop(); return d; })());

// ═══ (i) THE ROW FACTS' RE-SUM AFTER A VOID (B-dfa4, 主开发 r5450, hold (ii): 1.6–1.8 s on the owner's hub) ═══
// After the first sums, a whole-map touch voided the row facts and the next digest's account cards re-summed EVERY row in that
// reader's one turn. Now the re-sum runs the warm-up's own road (walkSliced over a stated snapshot) and a reader meanwhile is
// answered the sums AS THEY STOOD; the landing re-reads the rows touched since the snapshot and pushes the result ONCE; a second
// whole touch RESTARTS it (three times, then the next reader re-sums whole, said once). The rows each turn reads are COUNTED
// (rowResumStats().rowsRead: one count a row read), never timed: sliceMs 0 = one row a slice.
console.log('(i) the row facts re-summed in slices after a whole-map touch — the sums as they stood meanwhile, the landing pushed once, a whole touch restarts it');
const reachMap = (s) => s.index.update((x) => { x.conversations; });   // an update that reaches the map: a whole-map touch
// THE ROW FACTS' OWN FIELDS in a digest (what this road sums): each account card's counts from the kept row facts and the totals.
// A leg that places a write compares these: the card's clock census beside them (hot / warm / cold / due) is kept by its own pace
// (censusEveryMs, its trail a no-op in mkEng, the clock fixed), so a whole digest compared after a write would judge that pace, not this road
const rowFactsOf = (dStr) => { const d = JSON.parse(dStr); const pick = (sc) => sc ? { conversations: sc.conversations, unread: sc.unread, paused: sc.paused, overridden: sc.overridden, unlisted: sc.unlisted, firstIngest: sc.firstIngest } : null; return JSON.stringify({ adapters: (d.adapters || []).map((a) => [a.id, pick(a.scheduler)]), unreadTotal: d.unreadTotal, counts: d.counts }); };
async function resumLeg(EM, tag, { place = null, wholeTouches = 0, throwAt = null } = {}) {
  const bc = [], perSlice = [], warns = [];
  let e = null, last = null, touched = 0, placedAt = null;
  e = mkEng(EM, copyOf(TPL_D, `i-${tag}`), { syncRows: 500, sliceMs: 0, onSlice: async (i, what) => {
    if (what !== 'row-facts-resum') return;
    if (throwAt !== null && i === throwAt) throw new Error('a throw placed in the re-sum\'s seam (the suite\'s)');   // r5495 (4): the re-sum that throws
    const n = e.rowResumStats().rowsRead;
    if (last !== null) perSlice.push(n - last);
    last = n;
    if (i === 2 && place && placedAt === null) { placedAt = i; await place(e); last = e.rowResumStats().rowsRead; }   // a write between two slices (its own rows not a slice's)
    if (i === 3 && touched < wholeTouches) { touched++; await reachMap(e.store); last = e.rowResumStats().rowsRead; }
  } }, { log() { }, info() { }, warn: (x) => warns.push(String(x)), error() { } }, null, (m) => bc.push(m));
  const warmed = await e.digestWarm({ sliceMs: 25 });   // THE FIRST SUMS: the start's warm-up road, in the file's own slice budget (only the re-sum walks one row a slice: the leg's seam)
  const d0 = digestOf(e);
  const pushes = () => bc.filter((m) => m && m.type === 'channels-updated').length;
  await reachMap(e.store);   // THE VOID: a whole-map touch after the first sums
  const r0 = e.rowResumStats().rowsRead, p0 = pushes();
  const dVoid = digestOf(e);   // the reader meanwhile
  const readerRows = e.rowResumStats().rowsRead - r0;
  const runningAfterReader = e.rowResumStats().running;
  await until('the re-sum landed', () => !e.rowResumStats().running);
  for (let k = 0; k < 5; k++) await new Promise((z) => setImmediate(z));
  const pushed = pushes() - p0;
  const dAfter = digestOf(e), stats = e.rowResumStats();
  e.stop();
  let whole = null;
  if (place) { const w = mkEng(ENG, copyOf(TPL_D, `i-${tag}-whole`), { syncRows: 1e9 }); await place(w); whole = digestOf(w); w.stop(); }
  else whole = plainDigest();
  let at = 0; while (at < dAfter.length && dAfter[at] === whole[at]) at++;   // where the landed digest and the whole build's part, said when they do
  const diff = dAfter === whole ? null : { at, mine: dAfter.slice(Math.max(0, at - 120), at + 200), whole: whole.slice(Math.max(0, at - 120), at + 200) };
  return { warmed, asStood: dVoid === d0, same: dAfter === whole, factsSame: rowFactsOf(dAfter) === rowFactsOf(whole), facts: rowFactsOf(dAfter), wholeFacts: rowFactsOf(whole), diff, readerRows, runningAfterReader, pushed, perSlice: perSlice.length, maxSliceRows: perSlice.length ? Math.max(...perSlice) : null, stats, warns, placedAt, touched };
}
{
  const r = await resumLeg(ENG, 'parity');
  ok(r.warmed === true && r.runningAfterReader === true && r.readerRows === 0 && r.asStood, `(i1) THE READER MEANWHILE: a whole-map touch after the first sums, then a digest — the reader read ${r.readerRows} row(s) of the row facts in its turn and was answered the sums AS THEY STOOD (its digest equals the one before the touch: ${r.asStood}), the re-sum running in slices`, r);
  ok(r.stats.started === 1 && r.stats.sliced === 1 && r.perSlice > 3 && r.maxSliceRows === 1 && r.same && r.pushed === 1 && r.stats.pushed === 1, `(i1) THE SLICES AND THE LANDING: ${r.perSlice + 1} slices, no slice read more than ${r.maxSliceRows} row (the slice's own, sliceMs 0), the landed digest equals a whole build's, and the landing pushed the recomputed result ONCE (${r.pushed} broadcast) — ONE even though this void changed no row fact: THE CHOICE, NAMED (r5495 (6)): a void says the whole map was touched, the writer's push carried the old sums and this one carries the result; no compare before the push`, r);
  info(`(i1) LAW 4, printed — the re-sum's longest slice ${r.stats.maxSliceMs} ms over ${r.stats.slices} slices`);
  const rp = await resumLeg(ENG, 'placed', { place: async (e) => { await e.store.index.update(() => { e.store.index.entry(A, 'm-0', { create: false }).unread = 7; Object.assign(e.store.index.entry(A, 'm-born-i'), rowShape(0), { lastAt: T, unread: 4 }); }); } });
  ok(rp.placedAt !== null && rp.factsSame && rp.stats.reread >= 2 && rp.pushed === 1 && /"unread":11/.test(rp.facts), `(i2) A CHANGE DURING THE SLICES (a row's unread behind the walk, a row born): the landing re-read the ${rp.stats.reread} row(s) touched since the snapshot, and the row facts it landed (each card's counts, the totals) equal a whole build's after the same writes, pushed once`, { factsSame: rp.factsSame, facts: rp.facts, wholeFacts: rp.wholeFacts, reread: rp.stats.reread, pushed: rp.pushed });
  const EMf = M.load('src/server/channels-engine.js', anchored(engineSource(REPO), 'rowKept.stale = new Set(job.touched); rowResumStats.reread += job.touched.size;', 'rowKept.stale = new Set(); rowResumStats.reread += 0;', 'the re-sum\'s landing forgets the rows touched during it'), 'resum-forgets');
  const rf = await resumLeg(EMf, 'red-forgets', { place: async (e) => { await e.store.index.update(() => { e.store.index.entry(A, 'm-0', { create: false }).unread = 7; Object.assign(e.store.index.entry(A, 'm-born-i'), rowShape(0), { lastAt: T, unread: 4 }); }); } });
  ok(rf.placedAt !== null && !rf.factsSame, `(i2) RED CONTROL: a landing that forgets the rows touched during the slices lands row facts that are NOT a whole build's (${rf.facts.slice(0, 160)}) — the leg above would go red`, { facts: rf.facts, wholeFacts: rf.wholeFacts });
  const rw = await resumLeg(ENG, 'whole-again', { wholeTouches: 1 });
  ok(rw.touched === 1 && rw.stats.restarts === 1 && rw.stats.sliced === 1 && rw.same && rw.pushed === 1, `(i3) A SECOND WHOLE-MAP TOUCH between two slices RESTARTS the re-sum over a fresh snapshot (restarts: ${rw.stats.restarts}) — the landed digest equals a whole build's`, rw);
  const rg = await resumLeg(ENG, 'give-up', { wholeTouches: 3 });
  const saidG = rg.warns.filter((x) => /the row facts' re-sum was started again 3 times by whole-map writes/.test(x)).length;
  ok(rg.touched === 3 && rg.stats.gaveUp === 1 && saidG === 1 && rg.same, `(i3) THE BOUND: three whole touches — the re-sum stops (said ONCE: ${saidG}) and the next reader re-sums whole: the digest equals a whole build's, never the old sums for good`, rg);
  ok(rg.stats.told === 1 && rg.pushed === 1, `(i3) …AND THE CLIENTS ARE TOLD at the give-up, ONCE (${rg.pushed} broadcast, told ${rg.stats.told}; r5495 (4)): a screen never keeps the old sums waiting for another write`, { told: rg.stats.told, pushed: rg.pushed });
  const EMg = M.load('src/server/channels-engine.js', anchored(engineSource(REPO), "            if (!stopped) { rowResumStats.told++; try { notify([], { full: false }); } catch { } }   // B-dfa4 r5495 (4): the clients told ONCE — a screen never keeps the old sums waiting for another write\n", '', 'the give-up tells no client'), 'resum-giveup-silent');
  const rgs = await resumLeg(EMg, 'red-giveup-silent', { wholeTouches: 3 });
  ok(rgs.stats.gaveUp === 1 && rgs.pushed === 0, `(i3) RED CONTROL: a give-up that tells no client — ${rgs.pushed} broadcast: the screen keeps the old sums until some other write (the leg above would go red)`, { pushed: rgs.pushed });
  const rt = await resumLeg(ENG, 'throws', { throwAt: 2 });
  const saidT = rt.warns.filter((x) => /the row facts' re-sum failed/.test(x)).length;
  ok(saidT === 1 && rt.stats.told === 1 && rt.pushed === 1 && rt.stats.sliced === 0 && rt.same, `(i4) A RE-SUM THAT THROWS (a throw placed in its seam): said ONCE (${saidT}), the clients told ONCE (${rt.pushed} broadcast), nothing landed (sliced ${rt.stats.sliced}), and the next reader re-sums whole: the digest equals a whole build's`, { said: saidT, told: rt.stats.told, pushed: rt.pushed, sliced: rt.stats.sliced, same: rt.same });
  // RED CONTROL: the release's road — a void re-summed WHOLE in the reader's turn
  const EMw = M.load('src/server/channels-engine.js', anchored(engineSource(REPO), "      if (!resum && rowKept.built && !rowKept.wholeNext && (rowKept.resum || rowResumStart())) return rowKept.by;\n", '', 'the void re-summed whole in the reader\'s turn'), 'resum-whole');
  const rr = await resumLeg(EMw, 'red-whole');
  ok(rr.readerRows >= 1000, `(i1) RED CONTROL: the void re-summed whole in the reader's turn — that reader read ${rr.readerRows} rows (the leg above would go red)`, { readerRows: rr.readerRows });
}

// ═══ (k) THE GAP BEFORE A LANDING (B-dfa4, 主开发 r5495 (3)) ═══
// A whole-map touch that falls AFTER a walk's last slice and BEFORE its landing restarts the walk; it never lands the pre-touch
// sums. PLACED, never load: at the walk's last seam (its last row next) the suite queues ONE microtask that asks a whole-map update
// writing a row; the store runs that update's function one microtask later — after the last slice, before the landing's own
// continuation. THE PLANT's WITNESS is read at the touch itself (a listener on the index's touch signal): the walk's every slice had
// run and nothing had landed. Judged on the row facts' own fields (the census keeps its own pace, as (i2)), against a whole build's
// after the same write.
console.log('(k) a whole-map touch between a walk\'s last slice and its landing restarts the walk — the re-sum after a void, the first digest\'s warm-up');
const NK = 600;   // its own stand-in: over syncRows (500), where both roads begin; one row a slice, so the gap's seam is row NK − 1
const { D: TPL_K } = await standInEngine('tpl-k', NK);
const gapWrite = (s) => s.index.update((x) => { void x.conversations; s.index.entry(A, 'm-0', { create: false }).unread = 9; });
let gapWhole = null;
async function gapWholeFacts() {
  if (gapWhole === null) { const w = mkEng(ENG, copyOf(TPL_K, 'k-whole'), { syncRows: 1e9 }); await gapWrite(w.store); gapWhole = rowFactsOf(digestOf(w)); w.stop(); }
  return gapWhole;
}
async function gapLeg(EM, tag, road) {
  const what = road === 'resum' ? 'row-facts-resum' : 'census';
  let e = null, armed = false, witness = null;
  e = mkEng(EM, copyOf(TPL_K, `k-${tag}`), { syncRows: 500, sliceMs: 0, onSlice: async (i, w) => {
    if (w !== what || i !== NK - 1 || armed) return;
    armed = true;
    Promise.resolve().then(() => { gapWrite(e.store); });   // queued before this seam returns: the update's function runs after the last slice, before the landing
  } }, quiet, null, () => {});
  e.store.index.onTouch((k) => {
    if (k !== null || !armed || witness) return;
    const s = road === 'resum' ? e.rowResumStats() : e.digestWarmStats();
    witness = { slices: s.slices, sliced: s.sliced, running: road === 'resum' ? s.running : null };
  });
  await e.digestWarm(road === 'resum' ? { sliceMs: 25 } : undefined);   // the warm road: the leg itself, one row a slice; the re-sum road: the first sums, in the file's budget
  if (road === 'resum') {
    await reachMap(e.store);   // THE VOID
    digestOf(e);   // a reader: the re-sum starts
    await until('the re-sum landed', () => !e.rowResumStats().running);
  }
  for (let z = 0; z < 5; z++) await new Promise((r) => setImmediate(r));
  const facts = rowFactsOf(digestOf(e)), s = road === 'resum' ? e.rowResumStats() : e.digestWarmStats();
  e.stop();
  const wholeFacts = await gapWholeFacts();   // ONE whole build after the same write serves the four
  return { armed, witness, restarts: s.restarts, sliced: s.sliced, factsSame: facts === wholeFacts, facts: facts.slice(0, 160) };
}
{
  const inGap = (r, slices) => !!r.witness && r.witness.slices === slices && r.witness.sliced === 0 && r.witness.running !== false;
  const rr = await gapLeg(ENG, 'resum', 'resum');
  ok(rr.armed && inGap(rr, NK) && rr.restarts === 1 && rr.sliced === 1 && rr.factsSame, `(k1) THE RE-SUM: a whole-map touch that wrote a row after the walk's last slice (the witness at the touch: ${rr.witness ? rr.witness.slices : 'none'} of ${NK} slices run, landed ${rr.witness ? rr.witness.sliced : '?'}) — the landing looked again and RESTARTED (restarts ${rr.restarts}, landed ${rr.sliced}); the row facts it landed equal a whole build's after the same write`, rr);
  const rw = await gapLeg(ENG, 'warm', 'warm');
  ok(rw.armed && inGap(rw, 3 * NK) && rw.restarts === 1 && rw.sliced === 1 && rw.factsSame, `(k2) THE WARM-UP: the same touch after the census walk's last slice (the witness: ${rw.witness ? rw.witness.slices : 'none'} of ${3 * NK} slices of the three walks, landed ${rw.witness ? rw.witness.sliced : '?'}) — RESTARTED (restarts ${rw.restarts}, landed ${rw.sliced}); the row facts equal a whole build's after the same write`, rw);
  // RED CONTROLS: each landing without its look again — the pre-touch sums land and stay
  const EMk1 = M.load('src/server/channels-engine.js', anchored(engineSource(REPO), "          if (job.whole) { rowResumStats.restarts++; continue; }   // B-dfa4 r5495 (3): a whole touch between the walk's last slice and this landing: AGAIN, never the pre-touch sums\n", '', 'the re-sum lands without looking again'), 'gap-resum');
  const rr0 = await gapLeg(EMk1, 'red-resum', 'resum');
  ok(inGap(rr0, NK) && rr0.restarts === 0 && !rr0.factsSame, `(k1) RED CONTROL: the re-sum's landing without its look again — the touch fell in the gap (witnessed) and the landed row facts are NOT a whole build's (${rr0.facts}) — the leg above would go red`, rr0);
  const EMk2 = M.load('src/server/channels-engine.js', anchored(engineSource(REPO), "          if (job.whole) { digestWarmStats.restarts++; continue; }   // B-dfa4 r5495 (3): a whole touch between the last slice and the landing: AGAIN\n", '', 'the warm-up lands without looking again'), 'gap-warm');
  const rw0 = await gapLeg(EMk2, 'red-warm', 'warm');
  ok(inGap(rw0, 3 * NK) && rw0.restarts === 0 && !rw0.factsSame, `(k2) RED CONTROL: the warm-up's landing without its look again — the touch fell in the gap (witnessed) and the landed row facts are NOT a whole build's (${rw0.facts}) — the leg above would go red`, rw0);
}

// ═══ (j) AT THE BOUND THE READER FINISHES THE ROWS LEFT (B-dfa4, 主开发 r5450, hold (iii): 1.1–1.3 s five seconds after a start) ═══
// The warm-up STALLED behind its bound — placed by a gate in a slice's seam, never load — and the bound's passing placed through the
// timer seam: the reader the route is FINISHES the warm-up's rows left in its own turn (the current walk from its next row, the walks
// not begun) over the attempt's own stated snapshot and lands them: never a second whole pass. Counted as rows (digestWarmStats
// finishRows; the row facts' own reads, rowResumStats().rowsRead), never timed.
console.log('(j) the bound passed on a stalled warm-up: the reader finishes the rows left in its turn — counted — the same answer, a write meanwhile re-read');
async function finishLeg(EM, tag, { at = 'census', stallAt = 700, place = null } = {}) {
  const bc = [], timers = [];
  const turns = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise((z) => setImmediate(z)); };
  let release = null, stalledAt = null;
  const gate = new Promise((r) => { release = r; });
  const e = mkEng(EM, copyOf(TPL_D, `j-${tag}`), { syncRows: 500, sliceMs: 0, digestTimer: (fn) => { const h = { fn, live: true }; timers.push(h); return { cancel: () => { h.live = false; } }; }, onSlice: async (i, what) => { if (what === at && i === stallAt && stalledAt === null) { stalledAt = i; if (place) await place(e); await gate; } } }, quiet, null, (m) => bc.push(m));
  const warm = e.digestWarm();
  await until('the warm-up stalled at its placed row', () => stalledAt !== null);
  let ready = 'waiting';
  e.digestReady().then((v) => { ready = v; });   // the route's reader: its bound armed
  await turns();
  const r0 = e.rowResumStats().rowsRead, s0 = e.digestWarmStats();
  for (const h of timers.splice(0)) if (h.live) h.fn();   // THE BOUND PASSES — placed
  await turns();
  const readyAtBound = ready;
  const got = digestOf(e);   // what the reader reads after the bound
  const rowsAtBound = e.rowResumStats().rowsRead - r0, s1 = e.digestWarmStats();
  release();
  await warm;
  await turns();
  const s2 = e.digestWarmStats(), fkBuilds = e.firstReadParity().stats.builds;
  e.stop();
  let whole = null;
  if (place) { const w = mkEng(ENG, copyOf(TPL_D, `j-${tag}-whole`), { syncRows: 1e9 }); await place(w); whole = digestOf(w); w.stop(); }
  else whole = plainDigest();
  return { ready: readyAtBound, stalledAt, finished: s1.finished - s0.finished, finishRows: s1.finishRows - s0.finishRows, rowsAtBound, same: got === whole, fkBuilds, slicedAfter: s2.sliced, restarts: s2.restarts };
}
{
  const r = await finishLeg(ENG, 'census-late');
  ok(r.ready === true && r.finished === 1 && r.finishRows === ND - 700 && r.rowsAtBound === 0 && r.same && r.fkBuilds === 1 && r.slicedAfter === 0 && r.restarts === 0, `(j1) THE ROWS LEFT: the warm-up stalled in its census walk at row ${r.stalledAt}; at the bound the reader was answered «landed» (${r.ready}) after its turn finished ${r.finishRows} row(s) — the census walk's rows left, ${ND} − 700 — and read 0 of the row facts (${r.rowsAtBound}); the first read built once (${r.fkBuilds}: the landed one, no second whole pass), the digest a whole build's; the stalled walk then stopped by itself (no restart, no second landing)`, r);
  const rf = await finishLeg(ENG, 'first-read', { at: 'first-read', stallAt: 400 });
  ok(rf.ready === true && rf.finished === 1 && rf.finishRows === (ND - 400) + ND && rf.rowsAtBound === 0 && rf.same, `(j2) a stall in the first-read walk at row ${rf.stalledAt}: the reader's turn finished ${rf.finishRows} row(s) — that walk's rows left and the census walk not begun, (${ND} − 400) + ${ND} — never the row facts again (${rf.rowsAtBound}); the digest a whole build's`, rf);
  const rp = await finishLeg(ENG, 'placed', { place: async (e) => { await e.store.index.update(() => { e.store.index.entry(A, 'm-0', { create: false }).unread = 6; Object.assign(e.store.index.entry(A, 'm-born-j'), rowShape(0), { lastAt: T, unread: 2 }); }); } });
  ok(rp.ready === true && rp.finished === 1 && rp.same, `(j3) THE STATED SNAPSHOT KEPT, THE ROWS TOUCHED MEANWHILE RE-READ: a write during the stall (a row behind the walk, a row born) — the finished landing's digest equals a whole build's after the same writes`, rp);
  // RED CONTROL: the release's bound — the reader answered false and builds every index WHOLE in its turn (the warm-up's slices thrown away)
  const EMr = M.load('src/server/channels-engine.js', anchored(engineSource(REPO), '    if (!job || digestWarm !== job || stopped || job.finished || job.whole || !job.state || !job.state.land) return false;', '    return false;', 'the bound finishes nothing'), 'bound-whole');
  const rr = await finishLeg(EMr, 'red-whole');
  ok(rr.ready === false && rr.finished === 0 && rr.rowsAtBound >= ND, `(j1) RED CONTROL: the bound finishes nothing — the reader answered ${rr.ready} and its digest re-summed ${rr.rowsAtBound} rows of the row facts alone in its turn (a whole pass, the slices thrown away) — the leg above would go red`, rr);
}

report();
