#!/usr/bin/env node
// THE SCHEDULER CARD'S CENSUS IS READ OFF KEPT FACTS (lane scheduler-census-index, B-7978, 2026-10-07; gate row
// `test-channel-census`, fast). The card's "hot · warm · cold · due" walked every row of the index for every account on
// every census — ≈ 270 ms a pass at 90 298 rows (scripts/measure-channels-pass.mjs). Now each row is judged once with
// the instant its judgement holds until (src/channel-census.js, PURE) and re-judged only when a write touched it or the
// clock passed that instant.
//   ① THE STEP TABLE: rowClock (paused / unlisted / the tier's inclusive edge / a watch's exclusive end / the due
//      instant / feed-only never due), expired at the instant, untilCmp, censusStep, caps.tierUntil
//   ② PARITY: the REAL engine over a scripted 10 000-row instance (an authoritative-feed account + a tier account),
//      a seeded 2 000-step walk — real passes (the drain), clock jumps (incl. exact edge instants and a clock going
//      back), new messages, overrides, pauses, unlist / relist, poll stamps, window watches, tier settings, a mass
//      write — after EVERY step the indexed census (`schedulerIndexed`) equals the walk (`schedulerExact`) field for
//      field, or red
//   ③ THE WORK: 30 passes over the instance read O(touched) rows per census, never the rows; CONTROL: the walk
//      restored in the census (the base) reads every row every pass — red
//   CONTROLS (closed-world copies, each must turn ② red): expired ignoring the instant · a poll stamp not re-judged ·
//      a watch's end ignored
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { engineSource } from './channels-engine-src.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const ENG = require(path.join(REPO, 'src/server/channels-engine.js'));
const C = require(path.join(REPO, 'src/channel-census.js'));
const caps = require(path.join(REPO, 'src/channel-caps.js'));
const CH = require(path.join(REPO, 'src/channels/index.js'));
const fake = require(path.join(REPO, 'src/channels/fake.js'));
const { makeConversation } = require(path.join(REPO, 'src/channel-record.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const ROOT = scratch('chan-census');
const cleanup = () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(ROOT, { recursive: true });
const quiet = { log() {}, warn() {}, error() {} };
const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;

console.log('① the step table (PURE)');
{
  const t = 1e6;
  const rc = (row) => C.rowClock(row, t);
  const eqj = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const rows = [
    ['an unlisted row is not counted', { counted: false, tier: 'hot', seconds: 30 }, { cls: null, due: 0, at: Infinity, eq: 0 }],
    ['a paused row: no tier, never due, held for good', { paused: true, tier: 'hot', seconds: null, tierUntil: t + 5 }, { cls: null, due: 0, at: Infinity, eq: 0 }],
    ['hot, polled just now: held through its tier edge (inclusive)', { tier: 'hot', seconds: 30, lastPollAt: t, tierUntil: t + 20e3 }, { cls: 'hot', due: 0, at: t + 20e3, eq: 0 }],
    ['hot, its due instant first: held until it (due AT it)', { tier: 'hot', seconds: 30, lastPollAt: t - 10e3, tierUntil: t + 60e3 }, { cls: 'hot', due: 0, at: t + 20e3, eq: 1 }],
    ['already due: due until the tier moves (a poll stamp touches it)', { tier: 'warm', seconds: 300, lastPollAt: t - 400e3, tierUntil: t + HOUR }, { cls: 'warm', due: 1, at: t + HOUR, eq: 0 }],
    ['due exactly now (lastPollAt + seconds = t)', { tier: 'cold', seconds: 900, lastPollAt: t - 900e3, tierUntil: Infinity }, { cls: 'cold', due: 1, at: Infinity, eq: 0 }],
    ['feed-only (0 s): never due by the clock, the tier still moves', { tier: 'warm', seconds: 0, lastPollAt: 0, tierUntil: t + 5 }, { cls: 'warm', due: 0, at: t + 5, eq: 0 }],
    ['watched: hot until the heartbeat ends (exclusive), whatever the age', { tier: 'hot', seconds: 30, lastPollAt: t, tierUntil: Infinity, watchUntil: t + 90e3 }, { cls: 'hot', due: 0, at: t + 30e3, eq: 1 }],
    ['watched, polled long ago: due, held until the watch ends', { tier: 'hot', seconds: 30, lastPollAt: t - 60e3, tierUntil: Infinity, watchUntil: t + 90e3 }, { cls: 'hot', due: 1, at: t + 90e3, eq: 1 }],
    ['a watch that ended is no watch', { tier: 'cold', seconds: 900, lastPollAt: t, tierUntil: Infinity, watchUntil: t }, { cls: 'cold', due: 0, at: t + 900e3, eq: 1 }],
    ['the due instant ON the tier edge: the due flip (eq) wins', { tier: 'hot', seconds: 30, lastPollAt: t, tierUntil: t + 30e3 }, { cls: 'hot', due: 0, at: t + 30e3, eq: 1 }],
  ];
  for (const [name, row, want] of rows) { const got = rc(row); ok(eqj(got, want), name, { got, want }); }
  ok(!C.expired({ at: t, eq: 0 }, t) && C.expired({ at: t, eq: 0 }, t + 1) && C.expired({ at: t, eq: 1 }, t) && !C.expired({ at: t, eq: 1 }, t - 1) && !C.expired({ at: Infinity, eq: 0 }, 1e15), 'expired: an inclusive edge holds AT its instant, a due / watch edge expires AT it, Infinity never');
  const ord = [{ key: 'b', at: 5, eq: 0 }, { key: 'a', at: 5, eq: 0 }, { key: 'c', at: 5, eq: 1 }, { key: 'd', at: 4, eq: 0 }].sort(C.untilCmp).map((j) => j.key).join('');
  ok(ord === 'dcab', `untilCmp: soonest first, at one instant the eq ones first, then by key (${ord})`);
  const k = C.emptyCounts();
  C.censusStep(k, null, { cls: 'hot', due: 1 }); C.censusStep(k, null, { cls: 'cold', due: 0 }); C.censusStep(k, { cls: 'hot', due: 1 }, { cls: 'warm', due: 0 }); C.censusStep(k, { cls: 'cold', due: 0 }, null); C.censusStep(k, null, { cls: null, due: 0 });
  ok(eqj(k, { hot: 0, warm: 1, cold: 0, due: 0 }), 'censusStep: born / moved / gone / uncounted move exactly their counters', k);
  const T = { hotRecentMinutes: 60, warmRecentHours: 24 };
  const tu = (lastAt) => caps.tierUntil({ lastAt }, t, { tiers: T });
  ok(tu(t - 10 * MIN) === t + 50 * MIN && tu(t - 3 * HOUR) === t + 21 * HOUR && tu(t - 2 * DAY) === Infinity && tu(null) === Infinity && tu(t - HOUR) === t, 'caps.tierUntil: the hot / warm window\'s last instant, cold and no message = Infinity');
  ok(caps.pollTier({ lastAt: t - HOUR }, t, { tiers: T }) === 'hot' && caps.pollTier({ lastAt: t - HOUR }, t + 1, { tiers: T }) === 'warm', 'and it is pollTier\'s own edge: hot AT it, warm one ms past');
}

// ── the scripted instance: an authoritative-feed account + a tier account ─────────────────────────────────────────
const HISTORY_DECL = Object.freeze({ via: 'history', authority: 'authoritative', scope: null, pagesPerPass: 1, perMin: 60 });
// the owner's shape at a tenth: four mail accounts behind the authoritative feed + one tier account (Lark / Slack)
const accountsOf = (n) => ['mail0', 'mail1', 'mail2', 'mail3', 'chat'].map((id, i) => ({ id, n: n / 5, feed: i < 4 }));
function module(kind, worlds, feed) {
  return {
    kind,
    caps: { ...fake.fakePoll.caps, receive: 'poll', pollInterval: { hot: 30, cold: 300, floor: 10 }, budget: { unit: 'request', default: 1e9, settingKey: null, metered: true }, ...(feed ? { changeFeed: HISTORY_DECL } : {}) },
    create(record, deps) {
      const W = worlds[record.id], meter = deps.meter || (() => {}), pace = deps.pace || (async () => {});
      return {
        auth: { async state() { return { state: 'connected', expiresAt: null, scopes: ['x'], why: null }; } },
        async listConversations({ cursor = null, limit = 100 } = {}) {
          await pace(1); meter(1);
          const from = cursor ? Number(cursor) : 0, page = W.ids.slice(from, from + limit);
          return { conversations: page.map((id) => makeConversation({ id, vendorId: id, title: id, kind: 'group', participants: 'Ada, Brook', lastAt: W.lastAt.get(id) })), cursor: from + limit < W.ids.length ? String(from + limit) : null };
        },
        async convCaps() { meter(1); return { read: 'yes', sendAs: [], why: 'read-only-mailbox', at: Date.now() }; },
        async history(id, { anchor = null } = {}) { await pace(1); meter(1); W.reads++; return { records: [], anchor, reachedAnchor: true, complete: true }; },
        async older() { meter(1); return { records: [], exhausted: true }; },
        async fetchAttachment() { throw new CH.ChannelError('not-found', 'none'); },
        changes: feed ? async () => { meter(2); const ids = [...W.changed]; W.changed = new Set(); return { changed: ids, conversations: [], mustWalk: false }; } : undefined,
      };
    },
  };
}
async function instance(mod, label, rows = 10000) {
  const ACC = accountsOf(rows);
  const H = { clock: Date.UTC(2026, 9, 7, 9, 0, 0), SET: {}, ACC };
  const worlds = {};
  for (const a of ACC) {
    const ids = Array.from({ length: a.n }, (_, i) => `${a.id}-${String(i).padStart(5, '0')}`);
    worlds[a.id] = { ids, lastAt: new Map(ids.map((id, i) => [id, H.clock - ((i * 7919) % (3 * DAY / MIN)) * MIN])), changed: new Set(), reads: 0 };
  }
  const dir = path.join(ROOT, label);
  fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'channels', 'adapters.json'), JSON.stringify({ v: 1, adapters: ACC.map((a) => ({ id: a.id, kind: a.feed ? 'mailx' : 'chatx', label: a.id, enabled: true, auth: { tokenEnc: null, expiresAt: null, scopes: [] }, lastPass: null, consecutiveFailures: 0 })) }));
  const reg = CH.createChannelRegistry();
  reg.register(module('mailx', worlds, true)); reg.register(module('chatx', worlds, false));
  H.worlds = worlds;
  H.eng = mod.create({ dataDir: dir, registry: reg, env: {}, now: () => H.clock, broadcast: () => {}, serverSetting: (k) => H.SET[k], liveSessions: () => [], deliver: null, log: quiet, censusTimer: () => ({ cancel() {} }) });
  for (let i = 0; i < 12; i++) { H.clock += 1000; for (const a of ACC) await H.eng.pass(a.id); if (Object.keys(H.eng.store.index.live()).length >= rows) break; }
  return H;
}
const FIELDS = ['conversations', 'unread', 'hot', 'warm', 'cold', 'paused', 'overridden', 'unlisted', 'due', 'lastDiscoveryAt', 'discovering', 'firstIngest'];
const diffOf = (a, b) => FIELDS.filter((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f])).map((f) => `${f} ${JSON.stringify(a[f])}≠${JSON.stringify(b[f])}`);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let x = Math.imul(s ^ (s >>> 15), 1 | s); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
/** THE SEEDED WALK: `steps` steps; after EACH, every census the step could move is judged against the walk — the
 *  account it wrote (a pass, a message, a stamp, a watch …), every account after the clock moved or a setting
 *  changed, and every account every 25th step whatever happened (a census that sat out a few steps catches up at
 *  once). → { steps, firstMiss, kinds, checks, H, ms } */
async function walk(mod, label, { steps = 2000, seed = 0x7978, rows = 10000 } = {}) {
  const H = await instance(mod, label, rows);
  const { eng, ACC } = H, R = rng(seed), pick = (xs) => xs[Math.floor(R() * xs.length)];
  const kinds = {};
  let checks = 0;
  const ms = { exact: 0, indexed: 0, pass: 0, other: 0 };
  const rowOf = () => { const a = pick(ACC); const id = H.worlds[a.id].ids[Math.floor(R() * a.n)]; return { a: a.id, id, key: `${a.id}/${id}` }; };
  for (let s = 0; s < steps; s++) {
    const r = R();
    let kind, moved = null;
    const s0 = performance.now();
    if (r < 0.22) { kind = 'pass'; H.clock += Math.floor(500 + R() * 40e3); const a = pick(ACC); moved = a.id; if (a.feed) for (let j = 0; j < 3; j++) H.worlds[a.id].changed.add(H.worlds[a.id].ids[Math.floor(R() * a.n)]); await eng.pass(a.id); }
    else if (r < 0.34) { kind = 'tick'; H.clock += pick([1, 999, 30e3, 5 * MIN, 61 * MIN, 13 * HOUR]); }
    else if (r < 0.46) {
      // an EXACT edge: a row's tier edge or due instant (or one ms past it)
      kind = 'edge';
      const { key } = rowOf(), en = eng.store.index.peek(key);
      if (en) {
        const T = { hot: (Number(H.SET['channels.hotRecentMinutes']) || 60) * MIN, warm: (Number(H.SET['channels.warmRecentHours']) || 24) * HOUR };
        const lp = Number(eng.store.stamps.lane(en).lastPollAt) || 0;
        const cand = [en.lastAt + T.hot, en.lastAt + T.warm, lp + 30e3, lp + 300e3, lp + 900e3, lp + 60e3].filter((x) => x > H.clock);
        if (cand.length) H.clock = pick(cand) + (R() < 0.5 ? 0 : 1);
      }
    }
    else if (r < 0.56) { kind = 'message'; const { a, id } = rowOf(); moved = a; await eng.store.index.update(() => { const en = eng.store.index.entry(a, id, { create: false }); if (en) en.lastAt = H.clock - Math.floor(R() * 2 * HOUR); }); }
    else if (r < 0.63) { kind = 'override'; const { a, id } = rowOf(); moved = a; const every = pick([30, 60, 300, 900, 'paused', null]); await eng.store.index.update(() => { const en = eng.store.index.entry(a, id, { create: false }); if (en) { if (every === null) delete en.refresh; else en.refresh = { every }; } }); }
    else if (r < 0.68) { kind = 'unlist'; const { a, id } = rowOf(); moved = a; await eng.store.index.update(() => { const en = eng.store.index.entry(a, id, { create: false }); if (en) en.unlistedAt = en.unlistedAt ? null : H.clock; }); }
    else if (r < 0.80) { kind = 'stamp'; const { a, key } = rowOf(); moved = a; eng.store.stamps.set(key, { lastPollAt: H.clock - Math.floor(R() * 20 * MIN) }); }
    else if (r < 0.88) { kind = 'watch'; const { a, id } = rowOf(); moved = a; await eng.watch(a, id); }
    else if (r < 0.91) { kind = 'settings'; H.SET['channels.hotRecentMinutes'] = pick([30, 60, 90]); H.SET['channels.warmRecentHours'] = pick([12, 24]); H.SET['channels.pollColdSec'] = pick([600, 900]); }
    else if (r < 0.92) { kind = 'clock-back'; H.clock -= Math.floor(1 + R() * 10e3); }
    else if (r < 0.925) { kind = 'mass'; const a = pick(ACC); moved = a.id; await eng.store.index.update(() => { for (const id of H.worlds[a.id].ids.slice(0, 2000)) { const en = eng.store.index.entry(a.id, id, { create: false }); if (en) en.lastAt = H.clock - Math.floor(R() * DAY); } }); }
    else { kind = 'mark-read'; const { a, id } = rowOf(); moved = a; await eng.store.index.update(() => { const en = eng.store.index.entry(a, id, { create: false }); if (en) en.unread = en.unread ? 0 : 1 + Math.floor(R() * 4); }); }
    kinds[kind] = (kinds[kind] || 0) + 1;
    ms[kind === 'pass' ? 'pass' : 'other'] += performance.now() - s0;
    for (const a of ACC) {
      if (moved !== null && a.id !== moved && s % 25 !== 24) continue;
      const s1 = performance.now();
      const got = eng.schedulerIndexed(a.id, H.clock);
      const s2 = performance.now();
      const want = eng.schedulerExact(a.id, H.clock);
      ms.indexed += s2 - s1; ms.exact += performance.now() - s2;
      checks++;
      const d = diffOf(got, want);
      if (d.length) { eng.stop(); return { steps: s + 1, firstMiss: `step ${s} (${kind}) ${a.id}: ${d.join(', ')}`, kinds, checks, H, ms }; }
    }
  }
  eng.stop();
  return { steps, firstMiss: null, kinds, checks, H, ms };
}

console.log('② parity: the indexed census equals the walk after every step of a seeded 2 000-step walk (10 000 rows)');
const t0 = Date.now();
const real = await walk(ENG, 'real');
const counted = (k) => real.kinds[k] || 0;
console.log(`    ms: ${JSON.stringify(Object.fromEntries(Object.entries(real.ms).map(([k, v]) => [k, Math.round(v)])))} · setup + walk ${Date.now() - t0} ms`);
ok(Object.keys(real.H.eng.store.index.live()).length === 10000, `fixture: 10 000 rows over 5 accounts — 4 behind the authoritative feed, 1 on the tiers (${Object.keys(real.H.eng.store.index.live()).length})`);
ok(real.firstMiss === null && real.steps === 2000, `2 000 steps, ${real.checks} censuses judged — every one equals the walk field for field (${Date.now() - t0} ms)`, real.firstMiss);
ok(['pass', 'tick', 'edge', 'message', 'override', 'unlist', 'stamp', 'watch', 'settings', 'clock-back', 'mass', 'mark-read'].every((k) => counted(k) > 0), `the walk reached every kind of step: ${JSON.stringify(real.kinds)}`);
{
  const s = real.H.eng.censusIndexStats();
  ok(s.builds >= 2 && s.rejudged > 1000, `the index was rebuilt (settings / clock back / a mass write: ${s.builds} builds) and re-judged rows (${s.rejudged})`);
}

console.log('③ the work: a census reads the touched + crossed rows, never every row');
const M = mutantCopies('chan-census', REPO);
const ESRC = engineSource(REPO);
const swap = (src, a, b, what) => { if (!src.includes(a)) throw new Error(`control needle gone: ${what}`); return src.split(a).join(b); };
async function work(mod, label) {
  const H = await instance(mod, label);
  const { eng, ACC } = H;
  // every pass ends in its broadcast; the clock moves one pace window (5 s) a round ⇒ every round's census is fresh
  for (let i = 0; i < 3; i++) { H.clock += 5000; for (const a of ACC) await eng.pass(a.id); }
  const r0 = eng.censusIndexStats().rowsRead;
  for (let i = 0; i < 30; i++) { H.clock += 5000; for (const a of ACC) { if (a.feed) for (let j = 0; j < 5; j++) H.worlds[a.id].changed.add(H.worlds[a.id].ids[(i * 37 + j * 911) % a.n]); await eng.pass(a.id); } }
  const perPass = (eng.censusIndexStats().rowsRead - r0) / (30 * ACC.length);
  eng.stop();
  return perPass;
}
const perReal = await work(ENG, 'work-real');
const walkCopy = M.load('src/server/channels-engine.js', swap(ESRC, '    const s = clockIndexed(rec, t);', '    const s = schedulerScan(rec, t);', 'clockCensus reads the index'), 'census-walks');
const perWalk = await work(walkCopy, 'work-walk');
ok(perReal < 100, `a pass's census reads ${perReal.toFixed(1)} rows on average (of 10 000) — the touched and the crossed`);
ok(perWalk >= 10000 && perWalk > 50 * Math.max(1, perReal), `CONTROL: the walk restored in the census (the base) reads ${Math.round(perWalk)} rows a pass — every row, every pass — red`);

console.log('CONTROLS: each patched copy turns ② red');
const CSRC = fs.readFileSync(path.join(REPO, 'src/channel-census.js'), 'utf-8');
const CREQ = "require('../channel-census.js')";
const overCensus = (src, tag) => M.load('src/server/channels-engine.js', swap(ESRC, CREQ, `require(${JSON.stringify(M.write('src/channel-census.js', src, tag))})`, tag), tag);
const controls = [
  ['expired ignores the instant (a due flip AT its instant is missed)', overCensus(swap(CSRC, 'const expired = (j, t) => j.at < t || (j.at === t && !!j.eq);', 'const expired = (j, t) => j.at < t;', 'expired'), 'expired-strict')],
  ["a write's row not re-judged (the census index left out of markDue)", M.load('src/server/channels-engine.js', swap(ESRC, '    if (cx) cx.dirty.add(k);\n', '\n', 'markDue census'), 'no-mark')],
  ["a watch's end ignored (a watched row stays hot)", overCensus(swap(CSRC, '  if (w > t) { at = w; eq = 1; } else {', '  {', 'watch end'), 'no-watch-end')],
];
for (const [name, mod] of controls) {
  const r = await walk(mod, 'ctl-' + name.slice(0, 12).replace(/\W/g, '_'), { rows: 1000 });
  ok(r.firstMiss !== null, `CONTROL: ${name} — red at ${r.firstMiss || 'never'}`);
}
for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 4 })) ok(r.pass, r.name, r.detail);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
