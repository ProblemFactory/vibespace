#!/usr/bin/env node
// THE PACED ACCOUNT CENSUS (B-f32b r2, lane channel-index-copy — the coordinator's ruling 2026-10-03; gate row
// `test-channels-census-pace`, fast). Every broadcast walked every row of every account to count its tiers by the
// clock (`schedulerView`): ~90 ms per broadcast at userW's 50 274 rows, 95 % of a window open once the index copies
// were gone. The ruling: the CLOCK counts (hot / warm / cold / due) may lag — walked at most once per 5 s per account,
// with a trailing walk + broadcast after the last change so the card settles exact; what a user's action moves
// (listed, unread, unlisted, paused, overridden, the first read) stays exact on every broadcast.
//   ① a burst over 50 274 rows of one account — window opens, mark-reads, refresh overrides, one every 0.5 s of a
//      simulated 21 s, the pace timer fired as that time passes: the account's clock walks ≤ ceil(21 / 5) + 1, and on
//      EVERY broadcast the user-moved numbers and the unread total equal the full walk at that instant
//   ② THE TRAILING EDGE: after the last change ONE walk + broadcast at the window's end; its census equals the full
//      walk (`schedulerExact`) field for field, and that broadcast arms no further walk
//   CONTROL: pace 0 (every broadcast walks) — the walks equal the broadcasts, red against the bound
//   CONTROL: a pace timer that never fires — the last broadcast's clock counts stay stale, red
// The clock and the pace timer are injected (the engine's `now`, `censusTimer`); per-pid scratch (scripts/scratch.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const ROOT = scratch('chan-census-pace');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });

const A = 'fake-poll';
const PACE = 5000, STEP = 500, STEPS = 43;   // broadcasts at 0, 0.5 … 21 s
const T0 = Date.UTC(2026, 9, 2, 0, 40, 0);
const quiet = { log() {}, warn() {}, error() {} };
const USER_MOVED = ['conversations', 'unread', 'unlisted', 'paused', 'overridden'];

function mkEngine(name, rows, { pace = PACE, fire = true } = {}) {
  let t = T0;
  const timers = [];
  const events = [];
  const eng = ENG.create({
    dataDir: path.join(ROOT, name), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: (m) => events.push(m), now: () => t, log: quiet,
    censusEveryMs: pace,
    censusTimer: (fn, ms) => { const tm = { fn, due: t + ms, done: false }; timers.push(tm); return { cancel() { tm.done = true; } }; },
  });
  const ix = eng.store.index;
  const H = {
    eng, events, timers, ix,
    now: () => t,
    // time passes: every pace timer due by then fires, in order (what setTimeout does in production)
    advance(ms) {
      const until = t + ms;
      for (;;) {
        const next = fire ? timers.filter((x) => !x.done && x.due <= until).sort((a, b) => a.due - b.due)[0] : null;
        if (!next) break;
        t = Math.max(t, next.due); next.done = true; next.fn();
      }
      t = until;
    },
    pending: () => timers.filter((x) => !x.done).length,
    view: () => { const ev = events.filter((m) => m && m.type === 'channels-updated').pop(); const ad = ev && ev.digest && (ev.digest.adapters || []).find((x) => x.id === A); return ev ? { scheduler: ad && ad.scheduler, unreadTotal: ev.digest.unreadTotal } : null; },
  };
  return ix.update(() => {
    for (let i = 0; i < rows; i++) {
      const en = ix.entry(A, `thr_${i.toString(16).padStart(12, '0')}`);
      // tiers spread by activity (minutes → days), a share polled long ago (due), some overridden / paused / unlisted / walked
      Object.assign(en, { title: `Thread ${i}`, kind: 'group', lastAt: T0 - (i % 97) * 37 * 60e3, unread: i % 5, readAt: 0, walkedAt: i % 3 ? T0 - 1 : undefined, convCaps: { read: 'yes', sendAs: [], why: null, at: T0 } });
      en.lane = { ...en.lane, lastPollAt: T0 - (i % 11) * 120e3 };
      if (i % 101 === 0) en.refresh = { every: i % 202 === 0 ? 'paused' : 300, by: 'user', at: T0 };
      if (i % 503 === 0) en.unlistedAt = T0 - 1;
    }
    for (let k = 0; k < STEPS; k++) {
      const en = ix.entry(A, `win-${k}`);
      Object.assign(en, { title: `Window ${k}`, kind: 'group', lastAt: T0 - 86400e3 * 3, unread: 3 + k, readAt: 0, convCaps: { read: 'yes', sendAs: [], why: null, at: T0 } });
      en.lane = { ...en.lane, lastPollAt: T0 + 3600e3 };   // polled "now" for the whole run: a watch files no refresh
    }
  }).then(() => H);
}

// one burst: a broadcast every STEP — a window opened (watch), its mark-read, a refresh override (alternating
// paused / 60 s); the last change pauses a window being watched (hot by the clock, paused by the user)
async function burst(H, { checkEach = false } = {}) {
  const misses = [];
  const t0 = H.now();
  for (let k = 0; k < STEPS; k++) {
    if (k) H.advance(STEP);
    const cid = `win-${Math.floor(k / 3)}`;
    const before = H.events.length;
    if (k === STEPS - 1) await H.eng.setRefresh(A, 'win-0', 'paused');
    else if (k % 3 === 0) await H.eng.watch(A, cid);
    else if (k % 3 === 1) await H.eng.markRead(A, cid);
    else await H.eng.setRefresh(A, cid, (k % 2) ? 'paused' : 60);
    if (H.events.length === before) misses.push({ k, why: 'no broadcast' });
    if (checkEach) {
      const v = H.view(), x = H.eng.schedulerExact(A, H.now());
      const bad = USER_MOVED.filter((f) => v.scheduler[f] !== x[f]);
      if (JSON.stringify(v.scheduler.firstIngest && { done: v.scheduler.firstIngest.done, total: v.scheduler.firstIngest.total }) !== JSON.stringify(x.firstIngest && { done: x.firstIngest.done, total: x.firstIngest.total })) bad.push('firstIngest');
      const ids = new Set(H.eng.adapterRecords().adapters.map((r) => r.id));
      let sum = 0; for (const en of Object.values(H.ix.live())) if (en && ids.has(en.adapterId) && !en.unlistedAt) sum += Number(en.unread) || 0;
      if (v.unreadTotal !== sum) bad.push(`unreadTotal ${v.unreadTotal}≠${sum}`);
      if (bad.length) misses.push({ k, bad });
    }
  }
  return { misses, duration: H.now() - t0 };
}

console.log('① a burst over 50 274 rows: the clock walks paced, the user-moved numbers exact on every broadcast');
const H = await mkEngine('paced', 50274 - STEPS);
const rows = Object.keys(H.ix.live()).length;
H.eng.digest();                                    // the boot's first census (the panel's first screen)
const walks0 = H.eng.censusStats()[A] || 0;
const b = await burst(H, { checkEach: true });
const broadcasts = H.events.filter((m) => m && m.type === 'channels-updated').length;
const duringBurst = (H.eng.censusStats()[A] || 0) - walks0;
const lastBeforeTrail = H.view();
H.advance(PACE);                                   // the window ends: the trailing walk fires
const walks = (H.eng.censusStats()[A] || 0) - walks0;
const bound = Math.ceil(b.duration / PACE) + 1;
ok(rows === 50274, `fixture: ${rows} rows on one account`);
ok(b.misses.filter((m) => m.why).length === 0, `every one of the ${STEPS} changes broadcast (${broadcasts} broadcasts in all, the trailing ones included)`, b.misses);
ok(walks <= bound && walks >= Math.floor(b.duration / PACE), `the account's clock walks: ${walks} over ${b.duration / 1000} s of broadcasts (${duringBurst} during the burst + the trailing one) ≤ ceil(${b.duration / 1000} / ${PACE / 1000}) + 1 = ${bound}`);
ok(b.misses.length === 0, `on EVERY broadcast the numbers a user's action moves (${USER_MOVED.join(', ')}, the first read, the unread total) equal the full walk at that instant`, b.misses.slice(0, 3));

console.log('② the trailing edge: the last broadcast is exact');
{
  const v = H.view(), x = H.eng.schedulerExact(A, H.now());
  const diff = Object.keys(x).filter((f) => JSON.stringify(v.scheduler[f]) !== JSON.stringify(x[f]));
  ok(diff.length === 0, `the trailing broadcast's census equals the full walk field for field (hot ${v.scheduler.hot} · warm ${v.scheduler.warm} · cold ${v.scheduler.cold} · paused ${v.scheduler.paused} · due ${v.scheduler.due})`, { diff, v: v.scheduler, x });
  ok(JSON.stringify(lastBeforeTrail.scheduler) !== JSON.stringify(v.scheduler), 'fixture: the burst\'s last broadcast was still inside a window (its clock counts were the previous walk\'s) — the trailing walk is what corrected them');
  ok(H.pending() === 0, `the trailing broadcast armed no further walk (${H.pending()} pending)`);
  const n = H.events.length;
  H.advance(PACE * 3);
  ok(H.events.length === n && (H.eng.censusStats()[A] || 0) - walks0 === walks, 'and nothing walks or broadcasts while nothing changes');
}
try { H.eng.stop(); } catch {}

console.log('CONTROLS');
{
  const C = await mkEngine('pace-0', 5000, { pace: 0 });
  C.eng.digest();
  const w0 = C.eng.censusStats()[A] || 0;
  const r = await burst(C);
  const w = (C.eng.censusStats()[A] || 0) - w0;
  ok(w >= STEPS && w > Math.ceil(r.duration / PACE) + 1, `CONTROL: pace 0 (every broadcast walks every row) — ${w} walks for ${STEPS} changes, over the bound ${Math.ceil(r.duration / PACE) + 1} — red`);
  try { C.eng.stop(); } catch {}
}
{
  const C = await mkEngine('no-trail', 5000, { fire: false });
  C.eng.digest();
  await burst(C);
  C.advance(PACE);
  const v = C.view(), x = C.eng.schedulerExact(A, C.now());
  const diff = ['hot', 'warm', 'cold', 'due'].filter((f) => v.scheduler[f] !== x[f]);
  ok(diff.length > 0, `CONTROL: a pace timer that never fires — the last broadcast keeps stale clock counts (${diff.map((f) => `${f} ${v.scheduler[f]}≠${x[f]}`).join(', ')}) — red`);
  try { C.eng.stop(); } catch {}
}

// ── lane channel-drain-scale (2026-10-06): THE VIEWS ARE PACED INSIDE A PASS ───────────────────────────────────────
// A 89 000-row mailbox rebuilt the account views (`digest` → `adapterView` → `schedulerView` → `clockCensus`) at EVERY
// answered fetch of a pass: one broadcast per waiter's key. A pass says its early keys at most once per VIEW_PACE_MS
// (250 ms, physical) + its end; every key with news is still named, and every answer still comes AFTER the broadcast
// naming its key (r8). The fixture: 10 000 due rows + 300 refreshes of conversations that land mail (200 admitted).
// CONTROL: the per-fetch broadcast restored (a patched engine copy) reads one broadcast per answered key — red.
{
  console.log('\nlane channel-drain-scale: the views are paced inside a pass');
  process.env.VIBESPACE_CHANNELS_FAKE_CONVS = '300';   // fake-poll's rooms 1…300 hold mail (read when an engine builds its adapters)
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const MC = mutantCopies('census-pace-views', REPO);
  const ENG_SRC = fs.readFileSync(path.join(REPO, 'src/server/channels-engine.js'), 'utf8');
  const PACED = '          if (act.waiters.length) sayEarly(key);';
  const T0 = Date.UTC(2026, 9, 6, 22, 0, 0);
  async function viewsPass(E, tag) {
    const keysSaid = new Set();
    let n = 0;
    const ticks = [], rsi = globalThis.setInterval;
    globalThis.setInterval = (fn) => { ticks.push(fn); return { unref() {}, ref() {}, [Symbol.toPrimitive]: () => 0 }; };
    const e = E.create({ dataDir: path.join(ROOT, `views-${tag}`), env: { VIBESPACE_CHANNELS_FAKE: '1' }, broadcast: (m) => { if (m && m.type === 'channels-updated') { n++; for (const k of m.changedKeys || []) keysSaid.add(k); } }, now: () => T0, log: quiet, censusTimer: () => ({ cancel() {} }) });
    globalThis.setInterval = rsi;
    const A = 'fake-poll', ix = e.store.index;
    const lane = { via: 'poll', lastPollAt: T0 - 30 * 86400e3, lastScanAt: null, firstSeenByPoll: 1, firstSeenTotal: 1 };
    await ix.update(() => {
      for (let i = 0; i < 10000; i++) Object.assign(ix.entry(A, `thr_${i.toString(16).padStart(12, '0')}`), { title: `t ${i}`, kind: 'group', lastAt: T0 - 86400e3, unread: 0, convCaps: { at: T0, read: 'yes', sendAs: [], why: null }, lane: { ...lane } });
      for (let i = 1; i <= 300; i++) Object.assign(ix.entry(A, `fake-poll-room-${i}`), { title: `Room ${i}`, kind: 'group', lastAt: T0 - 86400e3, unread: 0, convCaps: { at: T0, read: 'yes', sendAs: [], why: null }, lane: { ...lane } });
    });
    ix.flush();
    n = 0;
    const t = performance.now();
    const p = e.pass(A, { force: true });
    let late = 0, okN = 0;
    const answers = [];
    for (let j = 1; j <= 300; j++) answers.push(e.refresh(A, `fake-poll-room-${j}`, { origin: j % 3 ? 'agent' : 'refresh' }).then((a) => { if (a && a.ok) { okN++; if (a.appended && !keysSaid.has(`${A}/fake-poll-room-${j}`)) late++; } }));
    const r = await p;
    await Promise.all(answers);
    const ms = performance.now() - t;
    const unsaid = (r.changed || []).filter((k) => !keysSaid.has(k)).length;
    try { await e.stop(); } catch { }
    return { broadcasts: n, ms: Math.round(ms), okN, late, unsaid, changed: (r.changed || []).length, bound: 2 + Math.ceil(ms / 250) };
  }
  const got = await viewsPass(ENG, 'paced');
  console.log(`    the pass: ${got.broadcasts} broadcasts in ${got.ms} ms for ${got.okN} answered keys (the per-fetch shape: one per answered key)`);
  ok(got.okN === 200 && got.changed >= 200 && got.broadcasts <= got.bound && got.unsaid === 0 && got.late === 0, `a pass broadcasts its early keys at most once per 250 ms + its end (${got.broadcasts} ≤ ${got.bound}), every changed key named, every answer after its key's broadcast`, got);
  const ctl = ENG_SRC.includes(PACED) ? await viewsPass(MC.load('src/server/channels-engine.js', ENG_SRC.replace(PACED, '          if (act.waiters.length) { notify([key], { full: false }); early.add(key); }'), 'per-fetch'), 'per-fetch') : null;
  ok(ctl && ctl.broadcasts > ctl.bound && ctl.broadcasts >= 200, `CONTROL: the per-fetch broadcast restored reads ${ctl && ctl.broadcasts} broadcasts for ${ctl && ctl.okN} answered keys — red`, ctl);
}

console.log(`\ntest-channels-census-pace: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
