#!/usr/bin/env node
// THE PROMPT-CACHE WARMTH OF A CONVERSATION (lane cache-warmth-tiles, 2026-11-02 — a fleet user's ask: every session box
// shows how warm its conversation's prompt cache still is, green to red as the hour runs out, nothing once it expired; the
// owner's rulings: OPT-IN (`desktop.cacheWarmth` off by default), five semantic tokens derived from each theme's status
// colours, ONE green, the band's length carries the countdown). r1a = the facts and the tiers; r1b (lane cache-warmth-band,
// the owner's ruling on q-059: «as drawn») = the band on every approved surface — src/lib/warmth-chrome.js, proven in Chrome by
// scripts/test-cache-warmth-chrome.mjs (heavy); this suite pins its pure half and its wiring.
//   ① PURE tierOf (src/cache-warmth.js — CommonJS, the hub's and the client's ONE table): every boundary ± 1 s for the 1-hour and the 5-minute cache; a boundary
//     belongs to the LATER tier; no TTL ⇒ unknown;
//   ② warmthOf BY THE HUB'S CLOCK: a device clock an hour off changes nothing; only the time SINCE the answer counts (a
//     step back counts as none); no serverNow / stamp / TTL ⇒ unknown; an account move at or after the last request ⇒
//     expired at once, a request after it warms it again; the band's length (frac) runs 1 → 0; IN A TURN (round 2, the turn
//     law) ⇒ fresh with the whole TTL, stamp or none;
//   ③ the hover words in en / zh / ja (minutes rounded UP, the move's own sentence, unknown says nothing); r1b's new words
//     (the summary chip, the «+N» chip, the lists' sort) each in zh AND ja with the same placeholders, each used in code;
//   ④ THE SESSION-LIST DIFF (src/routes/sessions.js warmthDiff): each live conversation's three facts keyed by its webui
//     id + the hub's own now; an unknown TTL left out; a throwing fact skipped; the answer carries it ONLY while the switch
//     is on, over usage-pool-engine cacheFactsOf (the pool's warm-cache hold reads the same — test-pool-auto drives the
//     producer: the request stamp over pty noise, the credits TTL, the re-point = the cache lost; test-fable-cap-pool-storm §21 the
//     stamp's ONE writer through the real stdout consumer and the device feed);
//   ⑤ the switch: `desktop.cacheWarmth`, boolean, OFF by default, in the Window group, its words in zh / ja — DRAWN (r1b: the
//     band landed; it was HELD from r1a′ until then) — the control: the same row WITH `held` is still not drawn;
//   ⑥ the five tokens, each DERIVED from the theme's status vocabulary in the block every theme inherits, and the theme
//     editor's «Cache warmth» rows starting as those derivations (a saved theme keeps deriving);
//   ⑦ THE STAMP OUTLIVES A RESTART (r1a′): the REAL boot-restore over a scratch data dir (a fake fuser says every socket is
//     alive) reads a persisted `lastRequestAt` back as the conversation's stamp — 30 min old ⇒ warm, 30 min ago; a meta with
//     none restores none (the engine then calls it UNKNOWN — test-pool-auto);
//   ⑧ PURE (r1b): worstOf (the worst LIVE tier — a 5-min credits mid never outranks a 1 h critical; a tie → the smaller
//     frac; expired only when nothing is live; nothing known ⇒ null), warmthCounts, byTimeLeft (ascending, expired then
//     unknown last, stable) — over fixtures built by the real warmthOf on the hub's clock;
//   ⑨ WIRING + THE LAWS (r1b, comment-stripped code): the poll's ONE call from the SAME answer; warmth-chrome.js computes
//     once (one warmthOf call site) and owns no timer / rAF / settings listener / _notify / setTitleMeta / colour write;
//     every builder re-applies from the map; app.js seats the chip beside the lock chip; the CSS block's selectors (the
//     frame guard, the blink kept, the expired marks dim) and no literal colour in it (a PLANTED control proves the check fires).
// Run: node scripts/test-cache-warmth.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const code = (f) => read(f).split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n'); // a `//` comment never satisfies a pin
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } return !!c; };

let CW = null; try { CW = require(path.join(REPO, 'src/cache-warmth.js')); } catch (e) { CW = { why: e.message.split('\n')[0] }; }
ok('THE TIER FUNCTION exists — src/cache-warmth.js tierOf / warmthOf / warmthTitle (RED on 3f8429cd5: there was none)', !!(CW.tierOf && CW.warmthOf && CW.warmthTitle), CW.why || '');
const HAVE = !!CW.tierOf; // a base without the module (3f8429cd5) skips ①–③ and still judges ④–⑦ BY NAME
const { tierOf, warmthOf, warmthTitle, WARMTH_TIERS, WARMTH_STATES } = HAVE ? CW : {};

console.log('— ① the tiers');
if (HAVE) {
  ok('the table: fresh < 20 · mid < 40 · late < 50 · critical < 60 sixtieths of the TTL', JSON.stringify(WARMTH_TIERS.map((r) => [r.tier, r.below])) === '[["fresh",20],["mid",40],["late",50],["critical",60]]');
  ok('the states, in order', WARMTH_STATES.join(',') === 'fresh,mid,late,critical,expired,unknown');
  for (const [label, ttlS] of [['1 h', 3600], ['5 min', 300]]) {
    const ttlMs = ttlS * 1000;
    const at = (sixtieths, dMs) => tierOf({ agoMs: sixtieths * ttlMs / 60 + dMs, ttlMs });
    const legs = [[0, 0, 'fresh'], [20, -1000, 'fresh'], [20, 0, 'mid'], [20, 1000, 'mid'], [40, -1000, 'mid'], [40, 0, 'late'], [40, 1000, 'late'],
      [50, -1000, 'late'], [50, 0, 'critical'], [50, 1000, 'critical'], [60, -1000, 'critical'], [60, 0, 'expired'], [60, 1000, 'expired'], [600, 0, 'expired']];
    const bad = legs.filter(([s, d, want]) => at(s, d) !== want).map(([s, d, want]) => `${s}/60${d ? (d > 0 ? '+' : '') + d / 1000 + 's' : ''} → ${at(s, d)} (want ${want})`);
    ok(`${label}: every boundary ± 1 s (fresh 0–20 · mid 20–40 · late 40–50 · critical 50–60 · expired) — a boundary is the LATER tier`, bad.length === 0, bad.join('; '));
  }
  ok('5 min: the same proportions in seconds — 99 s fresh, 100 s mid, 249 s late, 250 s critical, 299 s critical, 300 s expired',
    [[99, 'fresh'], [100, 'mid'], [199, 'mid'], [200, 'late'], [249, 'late'], [250, 'critical'], [299, 'critical'], [300, 'expired']].every(([s, w]) => tierOf({ agoMs: s * 1000, ttlMs: 300e3 }) === w));
  ok('no TTL (an unknown harness) ⇒ unknown; a nonsense ago ⇒ unknown; a negative ago (a clock ahead) ⇒ fresh',
    tierOf({ agoMs: 5, ttlMs: null }) === 'unknown' && tierOf({ agoMs: 5, ttlMs: 0 }) === 'unknown' && tierOf({ agoMs: NaN, ttlMs: 3600e3 }) === 'unknown' && tierOf() === 'unknown' && tierOf({ agoMs: -5e3, ttlMs: 3600e3 }) === 'fresh');
}

console.log('— ② by the hub\'s clock');
if (HAVE) {
  const S = 1_800_000_000_000; // the hub's now in its answer
  const fact = { lastRequestAt: S - 45 * 60e3, cacheTtlSec: 3600, lost: false };
  const a = warmthOf(fact, { serverNow: S, receivedAt: 5_000, now: 5_000 });
  ok('45 min after the last request, read the instant the answer arrived ⇒ late, 15 min left, frac 0.25', a.tier === 'late' && a.leftMs === 15 * 60e3 && a.frac === 0.25 && a.lastAt === fact.lastRequestAt, JSON.stringify(a));
  const fast = warmthOf(fact, { serverNow: S, receivedAt: S + 3600e3, now: S + 3600e3 + 6 * 60e3 });
  const slow = warmthOf(fact, { serverNow: S, receivedAt: S - 3600e3, now: S - 3600e3 + 6 * 60e3 });
  ok('a device clock an HOUR fast or slow changes nothing: 6 min after the answer ⇒ critical, 9 min left, either way', fast.tier === 'critical' && slow.tier === 'critical' && fast.leftMs === 9 * 60e3 && slow.leftMs === 9 * 60e3, JSON.stringify([fast, slow]));
  const naive = tierOf({ agoMs: (S - 3600e3 + 6 * 60e3) - fact.lastRequestAt, ttlMs: 3600e3 });
  ok('…where the device clock alone would have said otherwise (the control: its own now against the hub\'s stamp)', naive !== 'critical', naive);
  ok('a device clock that steps BACK after the answer counts as no time (never younger than the answer said)', warmthOf(fact, { serverNow: S, receivedAt: 10_000, now: 4_000 }).leftMs === 15 * 60e3);
  ok('the time SINCE the answer runs the band down: 15 min later ⇒ expired, frac 0', (() => { const x = warmthOf(fact, { serverNow: S, receivedAt: 0, now: 15 * 60e3 }); return x.tier === 'expired' && x.frac === 0 && x.leftMs === 0; })());
  ok('a fresh request ⇒ fresh, frac 1', (() => { const x = warmthOf({ ...fact, lastRequestAt: S }, { serverNow: S, receivedAt: 0, now: 0 }); return x.tier === 'fresh' && x.frac === 1; })());
  ok('no serverNow (never the device clock alone) ⇒ unknown', warmthOf(fact, { receivedAt: 0, now: 0 }).tier === 'unknown');
  ok('no request stamp ⇒ unknown; no TTL ⇒ unknown; no fact ⇒ unknown',
    warmthOf({ ...fact, lastRequestAt: null }, { serverNow: S, receivedAt: 0, now: 0 }).tier === 'unknown' && warmthOf({ ...fact, cacheTtlSec: null }, { serverNow: S, receivedAt: 0, now: 0 }).tier === 'unknown' && warmthOf(null, { serverNow: S, receivedAt: 0, now: 0 }).tier === 'unknown');
  const lost = warmthOf({ ...fact, lastRequestAt: S - 60e3, lost: true }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('WHERE THE CACHE LIVES (round 3): `lost` — the link names another member than the one that served the last request ⇒ expired at once', lost.tier === 'expired' && lost.frac === 0 && lost.lost === true, JSON.stringify(lost));
  ok('…back on the member that served it (`lost: false`) ⇒ the stamp decides (fresh at 1 min)', warmthOf({ ...fact, lastRequestAt: S - 60e3, lost: false }, { serverNow: S, receivedAt: 0, now: 0 }).tier === 'fresh');
  const fly0 = warmthOf({ lastRequestAt: null, cacheTtlSec: 3600, lost: false, inFlight: true, turnStartedAt: S - 30e3 }, { serverNow: S, receivedAt: 0, now: 0 });
  const flyOld = warmthOf({ lastRequestAt: S - 59 * 60e3, cacheTtlSec: 3600, lost: true, inFlight: true, turnStartedAt: S - 10e3 }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('THE TURN LAW, BOUNDED (round 3): a request in flight that went out after the last request ⇒ fresh with the whole TTL left (frac 1) — no stamp yet, or an old one (it writes the cache wherever it went)',
    fly0.tier === 'fresh' && fly0.frac === 1 && fly0.leftMs === 3600e3 && fly0.inFlight === true && flyOld.tier === 'fresh' && flyOld.frac === 1, JSON.stringify([fly0, flyOld]));
  const stale = warmthOf({ lastRequestAt: null, cacheTtlSec: 3600, lost: false, inFlight: true, turnStartedAt: S - 2 * 3600e3 }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('…bounded: a \'running\' state sent 2 h ago with nothing stamped is no warmth — unknown, no band', stale.tier === 'unknown' && !stale.inFlight, JSON.stringify(stale));
  const pausedOld = warmthOf({ lastRequestAt: S - 50 * 60e3, cacheTtlSec: 3600, lost: false, inFlight: false, turnStartedAt: null }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('…a turn PAUSED on the owner is not in flight: its stamp ages like idle (50 min ⇒ critical, 10 min left — the band ages)', pausedOld.tier === 'critical' && pausedOld.leftMs === 10 * 60e3 && !pausedOld.inFlight, JSON.stringify(pausedOld));
  const flyAfter = warmthOf({ lastRequestAt: S - 30e3, cacheTtlSec: 3600, lost: false, inFlight: true, turnStartedAt: S - 40e3 }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('…a stamp NEWER than the send (mid-turn, a response already in) ⇒ the stamp decides', flyAfter.tier === 'fresh' && !flyAfter.inFlight && flyAfter.leftMs === 3600e3 - 30e3, JSON.stringify(flyAfter));
  ok('…but never without a TTL (an unknown harness stays unknown, in flight or not)', warmthOf({ lastRequestAt: null, cacheTtlSec: null, inFlight: true, turnStartedAt: S - 1e3 }, { serverNow: S, receivedAt: 0, now: 0 }).tier === 'unknown');
  const five = warmthOf({ lastRequestAt: S - 255e3, cacheTtlSec: 300 }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('on credits (5 min) 4 min 15 s is critical with 45 s left (four minutes is still late: 48 of 60)', five.tier === 'critical' && five.leftMs === 45e3 && warmthOf({ lastRequestAt: S - 240e3, cacheTtlSec: 300 }, { serverNow: S, receivedAt: 0, now: 0 }).tier === 'late', JSON.stringify(five));
}

console.log('— ③ the words');
if (HAVE) {
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const tr = (dict) => (s, p) => (dict[s] || s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m));
  const S = 1_800_000_000_000;
  const w = warmthOf({ lastRequestAt: S - 45 * 60e3 - 30e3, cacheTtlSec: 3600 }, { serverNow: S, receivedAt: 0, now: 0 });
  const timeText = () => '14:05';
  ok('en: «Cache: about 15 min left · last request 14:05» (14.5 min rounds UP; «about»: the stamp is at most one response late)', warmthTitle(w, { timeText }) === 'Cache: about 15 min left · last request 14:05', warmthTitle(w, { timeText }));
  ok('zh: «缓存还剩约 15 分钟 · 上次请求 14:05»', warmthTitle(w, { t: tr(zh), timeText }) === '缓存还剩约 15 分钟 · 上次请求 14:05', warmthTitle(w, { t: tr(zh), timeText }));
  ok('ja: «キャッシュ残り約 15 分 · 最後のリクエスト 14:05»', warmthTitle(w, { t: tr(ja), timeText }) === 'キャッシュ残り約 15 分 · 最後のリクエスト 14:05');
  const last = warmthOf({ lastRequestAt: S - 3600e3 + 20e3, cacheTtlSec: 3600 }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('20 s left reads «1 min», never 0', warmthTitle(last, { timeText }) === 'Cache: about 1 min left · last request 14:05');
  const gone = warmthOf({ lastRequestAt: S - 2 * 3600e3, cacheTtlSec: 3600 }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('expired: «缓存已过期 · 上次请求 14:05» (zh), the en and ja keys translated', warmthTitle(gone, { t: tr(zh), timeText }) === '缓存已过期 · 上次请求 14:05' && warmthTitle(gone, { timeText }) === 'Cache expired · last request 14:05' && /期限切れ/.test(warmthTitle(gone, { t: tr(ja), timeText })));
  const moved = warmthOf({ lastRequestAt: S - 60e3, cacheTtlSec: 3600, lost: true }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('the move says itself: «缓存已过期 — 对话已换到另一个账号 · 上次请求 14:05»', warmthTitle(moved, { t: tr(zh), timeText }) === '缓存已过期 — 对话已换到另一个账号 · 上次请求 14:05', warmthTitle(moved, { t: tr(zh), timeText }));
  ok('unknown says nothing', warmthTitle(warmthOf(null, {}), { timeText }) === '' && warmthTitle(null) === '');
  const turn = warmthOf({ lastRequestAt: null, cacheTtlSec: 3600, inFlight: true, turnStartedAt: S - 5e3 }, { serverNow: S, receivedAt: 0, now: 0 });
  const pausedW = warmthOf({ lastRequestAt: S - 45 * 60e3 - 30e3, cacheTtlSec: 3600, inFlight: false }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('paused on the owner: the countdown words (never «a turn is running» — no request is in flight)', warmthTitle(pausedW, { timeText }) === 'Cache: about 15 min left · last request 14:05', warmthTitle(pausedW, { timeText }));
  ok('a request in flight: «Cache: warm — a turn is running» / «缓存正热 — 回合进行中» (no minutes: the countdown starts at its response)',
    warmthTitle(turn, { timeText }) === 'Cache: warm — a turn is running' && warmthTitle(turn, { t: tr(zh), timeText }) === '缓存正热 — 回合进行中' && /ターン実行中/.test(warmthTitle(turn, { t: tr(ja), timeText })), warmthTitle(turn, { t: tr(zh), timeText }));
  const keys = ['Cache: about {n} min left · last request {time}', 'Cache expired · last request {time}', 'Cache expired — the conversation moved to another account · last request {time}', 'Cache: warm — a turn is running'];
  ok('every hover key has a zh AND a ja entry carrying the same placeholders', keys.every((k) => [zh, ja].every((d) => typeof d[k] === 'string' && (k.match(/\{\w+\}/g) || []).every((p) => d[k].includes(p)))));
  const r1b = ['Going cold {n}', 'Late {n}', 'Expired {n}', '+{n} · {k} critical', '+{n} · {k} expired', 'By time left', 'Every desktop', 'Prompt-cache warmth on every desktop — click for the list by time left'];
  const same = (k, v) => JSON.stringify((k.match(/\{\w+\}/g) || []).sort()) === JSON.stringify((String(v).match(/\{\w+\}/g) || []).sort());
  const bad = r1b.filter((k) => ![zh, ja].every((d) => typeof d[k] === 'string' && same(k, d[k])));
  ok('r1b: every NEW key (the summary chip, the «+N» chip, the lists\' sort) has a zh AND a ja entry with the same {placeholders}', bad.length === 0, bad.join(' | '));
  const prod = ['src/lib/warmth-chrome.js', 'src/lib/taskbar.js'].map((f) => (fs.existsSync(path.join(REPO, f)) ? code(f) : '')).join('\n'); // a base without the client reds by name
  const unused = r1b.filter((k) => !prod.includes(`t('${k}'`));
  ok('…and each is used through a t(\'…\') literal in production code (§78 i18n-unused stays flat)', unused.length === 0, unused.join(' | '));
}

console.log('— ④ the session-list diff');
{
  const R = require(path.join(REPO, 'src/routes/sessions.js'));
  if (typeof R.warmthDiff !== 'function') R.warmthDiff = () => ({ warmth: {}, serverNow: null }); // a base without it reds by name below
  const live = new Map([
    ['sess-a', { _webuiId: 'sess-a', backend: 'claude' }],
    ['sess-codex', { _webuiId: 'sess-codex', backend: 'codex' }],
    ['sess-boom', { _webuiId: 'sess-boom', backend: 'claude' }],
    ['sess-tmux', { _webuiId: 'sess-tmux', backend: 'claude', isTmuxView: true }],
    ['sess-fresh', { _webuiId: 'sess-fresh', backend: 'claude' }],
  ]);
  const factsOf = (s, now) => {
    if (s._webuiId === 'sess-boom') throw new Error('boom');
    if (s.backend === 'codex') return { lastRequestAt: now - 1e3, cacheTtlSec: null, lost: false };
    if (s._webuiId === 'sess-fresh') return { lastRequestAt: null, cacheTtlSec: 3600, lost: false }; // a restart with nothing persisted
    return { lastRequestAt: now - 5e3, cacheTtlSec: 3600, lost: true, inFlight: false, turnStartedAt: null, extra: 'not sent', member: 'never sent' };
  };
  const d = R.warmthDiff(live, factsOf, 1000000);
  ok('each live conversation\'s FIVE facts keyed by its webui id, with the hub\'s now — {lastRequestAt, cacheTtlSec, lost, inFlight, turnStartedAt}; never a member id', d.serverNow === 1000000 && JSON.stringify(d.warmth) === JSON.stringify({ 'sess-a': { lastRequestAt: 995000, cacheTtlSec: 3600, lost: true, inFlight: false, turnStartedAt: null } }), JSON.stringify(d));
  ok('an unknown TTL (codex) is left out — no colour, never a guess; a throwing fact and a tmux view are skipped', !('sess-codex' in d.warmth) && !('sess-boom' in d.warmth) && !('sess-tmux' in d.warmth));
  ok('…and so is a conversation whose last request is unknown (r1a′: a restart with nothing persisted — no colour)', !('sess-fresh' in d.warmth));
  ok('no producer ⇒ an empty diff (never a throw)', JSON.stringify(R.warmthDiff(live, null, 7)) === '{"warmth":{},"serverNow":7}');
  const dT = R.warmthDiff(new Map([['sess-turn', { _webuiId: 'sess-turn' }], ['sess-idle', { _webuiId: 'sess-idle' }], ['sess-paused', { _webuiId: 'sess-paused' }]]),
    (s) => ({ lastRequestAt: null, cacheTtlSec: 3600, lost: false, inFlight: s._webuiId === 'sess-turn', turnStartedAt: s._webuiId === 'sess-turn' ? 4 : null }), 5);
  ok('THE TURN LAW, BOUNDED (round 3): a conversation with a request in flight and no stamp yet IS sent — `inFlight: true` + its `turnStartedAt` (the pool holds it — the list agrees); idle or paused with nothing stamped stays out (unknown)',
    JSON.stringify(dT.warmth) === JSON.stringify({ 'sess-turn': { lastRequestAt: null, cacheTtlSec: 3600, lost: false, inFlight: true, turnStartedAt: 4 } }), JSON.stringify(dT));
  const rt = code('src/routes/sessions.js');
  ok('WIRING: the 5 s poll\'s answer (cached AND fresh sweep) carries the diff ONLY while desktop.cacheWarmth is on — off is not even computed',
    /const answer = \(body\) => \(serverSetting\?\.\('desktop\.cacheWarmth'\) === true \? \{ \.\.\.body, \.\.\.warmthDiff\(activeSessions, ctx\.cacheFactsOf\) \} : body\);/.test(rt)
    && /return res\.json\(answer\(_sessionsCache\)\);/.test(rt) && /res\.json\(answer\(await _sweepInFlight\)\);/.test(rt) && (rt.match(/res\.json\(_sessionsCache\)|res\.json\(await _sweepInFlight\)/g) || []).length === 0);
  const srv = code('server.js');
  ok('WIRING: server.js hands the engine\'s cacheFactsOf to the session routes, and both feeds\' engine literals carry the request stamp\'s writer (noteModelRequest)',
    /setupSessions\(\{[^\n]*\bcacheFactsOf\b/.test(srv) && (srv.match(/\bnoteModelRequest\b/g) || []).length === 3);
  const eng = code('src/server/usage-pool-engine.js');
  ok('ONE PRODUCER: the pool\'s every warmCache( reads cacheFactsOf — the facts the list sends', (eng.match(/warmCache\(\{ \.\.\.cacheFactsOf\(/g) || []).length === 3 && !/warmCache\(\{ lastActivityMs/.test(eng));
}

console.log('— ⑤ the switch');
{
  const src = read('src/lib/settings-schema.js');
  const i = src.indexOf("'desktop.cacheWarmth': {"), row = i < 0 ? '' : src.slice(i, src.indexOf('\n  },', i));
  ok('desktop.cacheWarmth: boolean, OFF by default (the owner: opt-in), in the Window group, live', /type: 'boolean', default: false/.test(row) && /category: t\('Window'\)/.test(row) && /liveApply: true/.test(row), row.slice(0, 200));
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const words = [...row.matchAll(/t\(("(?:[^"\\]|\\.)*")\)/g)].map((m) => JSON.parse(m[1]));
  ok('its label and description say what it shows, that it is off by default and costs nothing — in zh and ja too',
    words.length === 2 && /Off by default/.test(words[1]) && /no request and no timer/.test(words[1]) && words.every((w) => zh[w] && ja[w]) && /默认关闭/.test(zh[words[1]]) && /既定はオフ/.test(ja[words[1]]), JSON.stringify(words));
  const SM = await import(path.join(REPO, 'src/lib/settings-schema.js'));
  const SV = await import(path.join(REPO, 'src/lib/settings-view.js'));
  const drawn = (schema, query, modified) => SV.settingsViewModel(schema, { categories: SM.SETTINGS_CATEGORIES, query, isModified: () => modified }).sections.flatMap((x) => x.rows.map((r) => r.path));
  const row0 = SM.SETTINGS_SCHEMA['desktop.cacheWarmth'];
  const windowRows = (schema) => (SV.settingsViewModel(schema, { categories: SM.SETTINGS_CATEGORIES }).byCategory[row0 && row0.category]?.rows || []).map((r) => r.path);
  ok('DRAWN (r1b — the band landed): no `held`; a plain listing of the Window category includes it; a search for «prompt-cache» finds it',
    row0 && row0.default === false && row0.held === undefined && windowRows(SM.SETTINGS_SCHEMA).includes('desktop.cacheWarmth') && drawn(SM.SETTINGS_SCHEMA, 'prompt-cache', false).includes('desktop.cacheWarmth'));
  const heldRow = { ...SM.SETTINGS_SCHEMA, 'desktop.cacheWarmth': { ...row0, held: 'a control — the field still hides' } };
  ok('…CONTROL: the same row WITH a `held` string is NOT drawn (not plainly, not by a search) — the field still hides',
    !windowRows(heldRow).includes('desktop.cacheWarmth') && !drawn(heldRow, 'prompt-cache', false).includes('desktop.cacheWarmth'));
}

console.log('— ⑥ the tokens');
{
  const css = read('public/style.css');
  const i = css.indexOf('--warmth-fresh:'), blockStart = css.lastIndexOf('{', i), sel = css.slice(css.lastIndexOf('}', blockStart) + 1, blockStart).trim();
  const want = { '--warmth-fresh': 'var(--ok-text)', '--warmth-mid': 'var(--accent)', '--warmth-late': 'var(--warn-text)', '--warmth-critical': 'var(--bad-text)', '--warmth-expired': 'var(--border)' };
  ok('the five tokens DERIVE from the status vocabulary (fresh = ok, mid = accent, late = warn, critical = bad, expired = the border)',
    Object.entries(want).every(([k, v]) => css.includes(`  ${k}: ${v};`)), Object.keys(want).filter((k) => !css.includes(`  ${k}: ${want[k]};`)).join(','));
  ok('…declared in the block every theme inherits (`:root, [data-theme]`) beside the status tokens they read', /\/\*[\s\S]*\*\/\s*:root, \[data-theme\]$|^:root, \[data-theme\]$/.test(sel) || sel.endsWith(':root, [data-theme]'), sel.slice(-80));
  ok('…and no built-in theme block spells a literal warmth colour of its own', (css.match(/--warmth-(fresh|mid|late|critical|expired)\s*:/g) || []).length === 5);
  const ed = read('src/lib/theme-editor.js');
  const rows = [...ed.matchAll(/\{ key: '(--warmth-[a-z]+)', label: '([^']+)', group: 'Cache warmth', isText: true, derived: '([^']+)' \}/g)].map((m) => [m[1], m[3]]);
  ok('the theme editor lists the five under «Cache warmth», each starting as the theme\'s own derivation', rows.length === 5 && rows.every(([k, v]) => want[k] === v), JSON.stringify(rows));
  ok('…and seeds them so (a theme saved from a built-in base keeps deriving from ITS status colours)', /for \(const d of CSS_VAR_DEFS\) if \(d\.derived\) this\._cssValues\[d\.key\] = d\.derived;/.test(code('src/lib/theme-editor.js')));
}

console.log('— ⑦ the stamp outlives a restart');
{
  const BR = require(path.join(REPO, 'src/server/boot-restore.js'));
  const A = require(path.join(REPO, 'src/account-pool-auto.js'));
  const d = scratchDir('cwt-restore');
  const bin = path.join(d, 'bin'), SOCK = path.join(d, 'sockets'), META = path.join(d, 'meta'), BUF = path.join(d, 'buffers');
  for (const x of [bin, SOCK, META, BUF]) fs.mkdirSync(x, { recursive: true });
  for (const b of ['fuser', 'pgrep']) fs.writeFileSync(path.join(bin, b), '#!/bin/sh\necho 4242\nexit 0\n', { mode: 0o755 }); // every socket has an owner ⇒ alive
  const T0 = Date.now();
  const add = (n, meta) => { const sock = `cw-${n}-${1793300000000 + n}`; fs.writeFileSync(path.join(SOCK, sock), ''); fs.writeFileSync(path.join(META, sock + '.json'), JSON.stringify({ webuiSessionId: 'sess-' + sock.slice(3), createdAt: 1793300000000, cwd: '/srv/u', backend: 'claude', mode: 'chat', ...meta })); return 'sess-' + sock.slice(3); };
  const idStamped = add(1, { name: 'stamped', claudeSessionId: '11111111-1111-4111-8111-111111111111', lastRequestAt: T0 - 30 * 60e3, lastRequestMember: 'sub-member-a' });
  const idBare = add(2, { name: 'bare', claudeSessionId: '22222222-2222-4222-8222-222222222222' });
  const active = new Map();
  const readMeta = (s) => { try { return JSON.parse(fs.readFileSync(path.join(META, s + '.json'), 'utf8')); } catch { return {}; } };
  const api = BR.create({ rootDir: d, PORT: 0, BUFFERS_DIR: BUF, META_DIR: META, SOCKETS_DIR: SOCK, DTACH_CMD: 'dtach', NODE_CMD: process.execPath, CHAT_WRAPPER: '',
    activeSessions: active, sessionCounterRef: { value: 0 }, attachToDtach: () => {}, setupSessionPty: () => {},
    readSessionMeta: readMeta, writeSessionMeta: (s, m) => fs.writeFileSync(path.join(META, s + '.json'), JSON.stringify(m)), deleteSessionMeta: () => {},
    broadcastToSession: () => {}, broadcastActiveSessions: () => {}, refreshWebuiPids: () => {}, sbNoteServerOp: () => {}, getHosts: () => null, getDialBridge: () => null, getExitProxy: () => null, note: () => {} });
  const p0 = process.env.PATH, l0 = console.log, w0 = console.warn;
  process.env.PATH = bin + ':' + p0; console.log = console.warn = () => { };
  try { await api.probeSockets(); api.restoreSessions(); } catch (e) { console.error(e); } finally { process.env.PATH = p0; console.log = l0; console.warn = w0; }
  const sS = active.get(idStamped), sB = active.get(idBare);
  ok('the REAL boot-restore brought both conversations back live', !!sS && !!sB, [...active.keys()].join(','));
  ok('THE PIN (r1a′): the persisted stamp is read back as the conversation\'s last request', sS && sS._lastRequestAt === T0 - 30 * 60e3, String(sS && sS._lastRequestAt));
  const w = A.warmCache({ lastRequestAt: sS && sS._lastRequestAt, cacheTtlSec: A.cacheTtlSecFor({ harness: 'claude' }), nowMs: T0 });
  ok('…so a 30-minute-old stamp is WARM, 30 min ago, after the restart (the hold and the colour read it — test-pool-auto)', w.warm === true && w.agoSec === 1800, JSON.stringify(w));
  ok('…and a meta with none restores none (the engine then calls the conversation UNKNOWN: no colour, no hold — never the attach preamble)', sB && sB._lastRequestAt === undefined, String(sB && sB._lastRequestAt));
  ok('G3 (e) THE PIN (round 3): the member that served the last request is read back with it — a restart does not forget where the cache lives (a moved link reads lost: test-pool-auto)', sS && sS._lastRequestMember === 'sub-member-a' && sB && sB._lastRequestMember === null, JSON.stringify([sS && sS._lastRequestMember, sB && sB._lastRequestMember]));
}

console.log('— ⑧ the pure summaries (r1b)');
if (HAVE) {
  const { worstOf, warmthCounts, byTimeLeft } = CW;
  ok('worstOf / warmthCounts / byTimeLeft exist (RED on da86012d5: there were none)', [worstOf, warmthCounts, byTimeLeft].every((f) => typeof f === 'function'));
  if (typeof worstOf === 'function') {
    const S = 1_800_000_000_000, at = { serverNow: S, receivedAt: 0, now: 0 };
    const W = (agoMin, ttlS = 3600, extra = {}) => warmthOf({ lastRequestAt: S - agoMin * 60e3, cacheTtlSec: ttlS, lost: false, ...extra }, at);
    const fresh = W(5), mid = W(25), late = W(45), crit = W(55), crit2 = W(57), gone = W(65), credMid = W(2, 300), moved = W(1, 3600, { lost: true }), unk = warmthOf({ lastRequestAt: null, cacheTtlSec: 3600 }, at);
    ok('the fixtures are the real warmthOf\'s, on the hub\'s clock', [fresh, mid, late, crit, gone, credMid, moved, unk].map((w) => w.tier).join(',') === 'fresh,mid,late,critical,expired,mid,expired,unknown');
    ok('the worst LIVE tier wins: a 5-min credits mid (3 min left) never outranks a 1 h critical (5 min left) — the tier, not leftMs', worstOf([credMid, fresh, crit, mid]) === crit && credMid.leftMs < crit.leftMs);
    ok('…a tie on tier → the smaller frac (57 min ago beats 55)', worstOf([crit, crit2]) === crit2 && worstOf([crit2, crit]) === crit2);
    ok('…expired never outranks a live one (an expired cache is nothing left to save)', worstOf([gone, fresh]) === fresh && worstOf([moved, late, null]) === late);
    ok('…expired only when nothing is live (an all-expired set shows the expired mark); [] / [null] / unknown ⇒ null', worstOf([gone, moved]) === gone && worstOf([]) === null && worstOf([null]) === null && worstOf([unk]) === null && worstOf([unk, gone]) === gone && worstOf(undefined) === null);
    const c = warmthCounts([fresh, mid, late, crit, crit2, gone, moved, credMid, unk, null]);
    ok('warmthCounts over every tier + unknown: critical 2 · late 1 · expired 2 (the move counts) · known 8 (unknown / null never counted)', c.critical === 2 && c.late === 1 && c.expired === 2 && c.known === 8, JSON.stringify(c));
    const rows = [['u', unk], ['g', gone], ['f', fresh], ['c', crit], ['n', null], ['m', moved], ['c2', crit2], ['cr', credMid]];
    const order = rows.slice().sort((a, b) => byTimeLeft(a[1], b[1])).map((r) => r[0]).join(',');
    ok('byTimeLeft: ascending time left (a 3-min credits mid before a 5-min critical), then expired, then unknown — ties keep the caller\'s order', order === 'c2,cr,c,f,g,m,u,n', order);
  }
}

console.log('— ⑨ the wiring and the laws (r1b)');
{
  const stripAll = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n'); // block AND line comments
  const exists = (f) => fs.existsSync(path.join(REPO, f));
  const codeAll = (f) => (exists(f) ? stripAll(read(f)) : '');
  /** the body of the first block after `sig` (a naive brace match over comment-stripped code; strings here hold balanced braces) */
  const bodyOf = (src, sig) => {
    const i = src.search(sig); if (i < 0) return '';
    const j = src.indexOf('{', i + src.slice(i).match(sig)[0].length - 1); if (j < 0) return '';
    let d = 0; for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(j, k + 1); }
    return '';
  };
  const sb = codeAll('src/lib/sidebar.js'), poll = bodyOf(sb, /\n  async _poll\(\) /);
  const fetchTry = poll.slice(poll.indexOf("await fetch('/api/sessions')"), poll.indexOf("pollErr = e?.message || 'server unreachable'"));
  ok('sidebar.js _poll: warmth, serverNow and Date.now() come from the SAME parsed answer, inside the fetch try',
    /warmthAnswer = \(data\.warmth && typeof data\.warmth === 'object' && data\.serverNow > 0\) \? \{ map: data\.warmth, serverNow: data\.serverNow, receivedAt: Date\.now\(\) \} : null;/.test(fetchTry));
  ok('…and calls noteWarmthAnswer( exactly ONCE (in its own try: a failed fetch ⇒ undefined, a good answer without warmth ⇒ null)',
    (sb.match(/noteWarmthAnswer\(/g) || []).length === 1 && /try \{ noteWarmthAnswer\(this\.app, sessions \? warmthAnswer : undefined\); \} catch \{\}/.test(poll));
  const sbOutside = sb.replace(poll, '').replace(/^import \{ noteWarmthAnswer \} from '\.\/warmth-chrome\.js';$/m, '');
  ok('…and nothing else in the sidebar names warmth (never LIVE_SESSION_FACTS, the digest or the merge)', !/warmth/i.test(sbOutside));
  const wc = codeAll('src/lib/warmth-chrome.js');
  ok('src/lib/warmth-chrome.js exists and reads the PURE table (RED on da86012d5: there was no client)', /^import \{ warmthOf, warmthTitle, worstOf, warmthCounts, byTimeLeft \} from '\.\.\/cache-warmth\.js';$/m.test(wc));
  ok('…ONE computation: warmthOf( is called at exactly one site (the tick\'s pass)', (wc.match(/\bwarmthOf\(/g) || []).length === 1);
  const banned = ['setInterval', 'setTimeout', 'requestAnimationFrame', 'settings.on(', '_notify(', 'setTitleMeta(', 'LIVE_SESSION_FACTS', 'revealWindow(', 'MutationObserver', 'ResizeObserver', 'addEventListener(\'scroll'].filter((b) => wc.includes(b));
  ok('…no timer, no rAF, no settings listener, no observer, never _notify / setTitleMeta / LIVE_SESSION_FACTS / revealWindow', !!wc && banned.length === 0, banned.join(','));
  const colourWrites = (wc.match(/\.style\.(background|color|borderColor|outline)\b|setProperty\('--warmth-c'|#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g) || []);
  ok('…writes no colour (the tier attribute + --warmth-frac only; the CSS maps tier → token)', !!wc && colourWrites.length === 0, colourWrites.join(','));
  ok('…XSS: no innerHTML at all; the only markup parsed is the constant ring (insertAdjacentHTML of RING, aria-hidden)',
    !!wc && !/\.innerHTML\s*=/.test(wc) && (wc.match(/insertAdjacentHTML\(/g) || []).length === (wc.match(/insertAdjacentHTML\('afterbegin', RING\)/g) || []).length && /const RING = '<svg class="warmth-ring" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4\.5" pathLength="100"\/><\/svg>';/.test(wc));
  ok('…every mark node it builds is aria-hidden (markNode) — paint-only, never a target', /function markNode\(tag, cls\) \{ const el = document\.createElement\(tag\); el\.className = cls; el\.setAttribute\('aria-hidden', 'true'\); return el; \}/.test(wc)
    && !/createElement\('(span|div|i)'\)/.test(wc.replace(/function markNode[^\n]*\n/, '').replace(/left = document\.createElement\('span'\); left\.className = '(wl-left|sess-warmth-left)'/g, '').replace(/const (seg|total) = document\.createElement\('span'\)/g, '')));
  const app = codeAll('src/lib/app.js');
  ok('app.js imports the module (the client graph reaches it) and seats the chip beside the lock chip after every arrangement',
    /^import \{ placeWarmthChip \} from '\.\/warmth-chrome\.js';/m.test(app) && /placeVaultChip\(\);\s*\n\s*placeWarmthChip\(\);/.test(app));
  const tg = codeAll('src/lib/tab-group.js'), tb = codeAll('src/lib/taskbar.js'), dm = codeAll('src/lib/desktop-manager.js'), sr = codeAll('src/lib/sidebar-render.js'), mn = codeAll('src/lib/mobile-nav.js');
  const builders = [
    ['tab-group.js makeTab', bodyOf(tg, /const makeTab = \(tabWinId\) => /), /paintTab\(this\._app, tab\);\s*return tab;/],
    ['taskbar.js _rebuildTaskbarItems', bodyOf(tb, /\nfunction _rebuildTaskbarItems\(app, container, entries\) /), /paintTile\(app, item\);/],
    ['taskbar.js _buildGroupItem', bodyOf(tb, /\nfunction _buildGroupItem\(app, container, item, hostWin, starPrefix, group\) /), /paintTile\(app, item\);/],
    ['taskbar.js showTabGroupList', bodyOf(tb, /\nexport function showTabGroupList\(app, anchor, chain, \{ hover = false, keyboard = false \} = \{\}\) /), /paintTile\(app, item\);/],
    ['taskbar.js fitTaskbarStrip', bodyOf(tb, /\nexport function fitTaskbarStrip\(app\) /), /chip\.textContent = '\+' \+ hidden\.length;\s*chip\._hiddenIds = hidden; chip\._warmthKey = '';\s*paintOverflowChip\(app, chip\);/],
    ['desktop-manager.js _renderSwitcher (full)', bodyOf(dm, /\n  _renderSwitcher\(\) /), /container\.appendChild\(addBtn\);\s*paintPreviews\(this\.app\);\s*\}$/],
    ['desktop-manager.js _renderCompactSwitcher', bodyOf(dm, /\n  _renderCompactSwitcher\(container\) /), /container\.appendChild\(btn\);\s*paintPreviews\(this\.app\);\s*\}$/],
    ['sidebar-render.js _buildSessionCard', bodyOf(sr, /proto\._buildSessionCard = function\(s, opts = \{\}\) /), /paintSessionCard\(this\.app, card\);\s*return card;/],
    ['mobile-nav.js _buildWindowItem', bodyOf(mn, /\n  _buildWindowItem\(win, wm, close, rerender\) /), /paintSwitcherRow\(this\.app, item, win\);/],
  ];
  const missing = builders.filter(([, body, re]) => !re.test(body)).map(([n]) => n);
  ok('EVERY BUILDER re-applies from the map (a mark set only by the tick is lost at the next rebuild — the badge-stale lesson)', missing.length === 0, missing.join(' | '));
  ok('…and the pinned lines around them stand: the switcher\'s digest guard + the compact early return, and no warmth in the taskbar structKey',
    /if \(digest \+ form === this\._switcherDigest\) return;/.test(dm) && /if \(form === 'compact'\) \{ this\._renderCompactSwitcher\(container\); return; \}/.test(dm) && !/warmth/i.test(bodyOf(tb, /\nexport function updateTaskbar\(app\) /).split('fitTaskbarStrip(app);')[0]));
  ok('…the ⧉ list keeps its pinned lines and THE door count (taskbar.js .revealWindow( = 5; the summary\'s rows jump through goOtherDesk)',
    (tb.match(/\.revealWindow\(/g) || []).length === 5 && /if \(activeDesk && win\._desktopId && win\._desktopId !== activeDesk\) continue;/.test(tb) && /let otherDesksOpen = false;/.test(tb)
    && /item\.onclick = \(\) => \{ pop\.remove\(\); goOtherDesk\(app, \{ id: r\.id, deskId: r\.deskId, built: r\.built \}\); \};/.test(tb));
  const css = read('public/style.css');
  const a = css.indexOf('/* q-059 r1b (lane cache-warmth-band)'), z = css.indexOf('/* ── end of the q-059 r1b warmth block');
  const block = a >= 0 && z > a ? stripAll(css.slice(a, z)) : '';
  ok('the CSS block: the frame band rides ::before on a bar that is not seamless and hosts no tab strip (a group frame draws none)',
    /\.window:not\(\.seamless\) > \.window-titlebar\[data-warmth-tier\]:not\(:has\(> \.tab-bar-tabs\)\)::before \{/.test(block));
  ok('…a square keeps the waiting blink and the find flash (the tier rule steps aside for both)', /\.desktop-preview-win\[data-warmth-tier\]:not\(\.desktop-preview-win-waiting\):not\(\.desktop-preview-find-flash\) \{ background: var\(--warmth-c\); \}/.test(block));
  ok('…every SUMMARISING expired mark is --text-dim (squares, preview rings, the folded button\'s ring, the dots — as drawn)',
    /\.desktop-preview-win\[data-warmth-tier="expired"\], \.desktop-preview\[data-warmth-tier="expired"\],\s*\.desktop-switch-compact \.warmth-ring\[data-warmth-tier="expired"\], \.wsum-dot\[data-warmth-tier="expired"\] \{ --warmth-c: var\(--text-dim\); \}/.test(block));
  const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
  ok('…NO literal colour in the block (theme vars only) — and nothing in it animates (no transition, no animation)', !!block && !LITERAL.test(block) && !/\b(transition|animation)\s*:/.test(block), (block.match(LITERAL) || [''])[0]);
  ok('…CONTROL: the literal check fires on the blink\'s own literal planted into the block', LITERAL.test(block + '\n.x { background: rgba(250,180,40,0.4); }') && LITERAL.test(block + '\n.x { color: #e5c07b; }'));
  ok('…the five token names are only ever READ in it (⑥\'s exact-5 declarations hold)', !/--warmth-(fresh|mid|late|critical|expired)\s*:/.test(block) && (css.match(/--warmth-(fresh|mid|late|critical|expired)\s*:/g) || []).length === 5);
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
