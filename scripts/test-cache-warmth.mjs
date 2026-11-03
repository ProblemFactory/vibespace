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
//   ⑥ the five tokens, each DERIVED in the block every theme inherits — r5 (lane cache-warmth-ramp): the four live tiers
//     from the theme's RAW hues (--green / --blue / --yellow / --red), expired from --text-dim at 45 % (a PLANTED .374 line
//     reds it) — and the theme editor's «Cache warmth» rows starting as those derivations (a saved theme keeps deriving);
//   ⑦ THE STAMP OUTLIVES A RESTART (r1a′): the REAL boot-restore over a scratch data dir (a fake fuser says every socket is
//     alive) reads a persisted `lastRequestAt` back as the conversation's stamp — 30 min old ⇒ warm, 30 min ago; a meta with
//     none restores none (the engine then calls it UNKNOWN — test-pool-auto);
//   ⑧ PURE (r1b): worstOf (the worst LIVE tier — a 5-min credits mid never outranks a 1 h critical; a tie → the smaller
//     frac; expired only when nothing is live; nothing known ⇒ null), warmthCounts, byTimeLeft (ascending, expired then
//     unknown last, stable) — over fixtures built by the real warmthOf on the hub's clock;
//   ⑪ THE CACHE IS OBSERVED (lane cache-warmth-compact, amendment 1 — the owner: «缓存时间这个你没有个 source of truth 吗？»):
//     warmthOf carries the record's provenance (`source` — the TTL the last response wrote, read / created / cold, its
//     tokens) and an unknown's REASON (`compacted` — a compaction ended, no request since; `no-request`) without drawing
//     it (tier 'unknown'); the hover says what the band projects from and why it is unknown, en / zh / ja; warmthDiff
//     carries ttlSource + cacheObserved and sends a reasoned unknown with no instant; the restore reads the record's fact
//     and the reset back; the chrome says the reasoned words ONLY where words already live (the bar's and a tab label's
//     hover) — never a band, a ring, a count or a list row (RED on 749aa7bf9 by name);
//   ⑨ WIRING + THE LAWS (r1b, comment-stripped code): the poll's ONE call from the SAME answer; warmth-chrome.js computes
//     once (one warmthOf call site) and owns no timer / rAF / settings listener / _notify / setTitleMeta / colour write;
//     every builder re-applies from the map; app.js seats the chip beside the lock chip; the CSS block's selectors (the
//     frame guard, the blink kept; r5: no expired special case, a tier's words mixed toward --text — a PLANTED r1b line reds
//     it) and no literal colour in it (a PLANTED control proves the check fires);
//     round 2 (the acceptance of ca2670be0): a list row's label shrinks (H1), an «Other desktops» row takes its group's tabs —
//     built or held (H2, a PLANTED r1 line reds it), a tile's ring rides its icon (H3), the switcher budgets the warm «+N»
//     chip by a PURE constant while warmth is drawn (H4, the r1 literal planted reds it); round 3 (the acceptance of
//     6550a3a51): while warmth is drawn the chip's BOX is that constant's box — the fit reads a constant, never the chip's
//     content (J1, the rule removed reds it).
//   ⑩ THE RAMP'S GAUGE (r5 round 2, 主开发's ruling: a fence is a census — a gauge that cannot fall is no gauge): pure text
//     arithmetic over style.css's six theme blocks (the derivation and the words' mix read FROM the file): every adjacent
//     pair ≥ 30° of hue, every band ≥ 1.5:1 on its title bar, the words ≥ 4.5:1 on the list / phone row / window grounds,
//     expired ≥ 1.5:1 on the taskbar — printed as the table; four PLANTED copies red it, each on its own floor.
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
  // q-059 r5 (lane cache-warmth-ramp): .374's TEXT mixes read as «two greens» (--ok-text mint, --accent teal: 25° apart on
  // the default theme, 1° on monokai) — the four live tiers are the theme's RAW hues, expired one quiet dim value
  const want = { '--warmth-fresh': 'var(--green)', '--warmth-mid': 'var(--blue, #3b82f6)', '--warmth-late': 'var(--yellow)', '--warmth-critical': 'var(--red)', '--warmth-expired': 'color-mix(in srgb, var(--text-dim) 45%, transparent)' };
  /** THE DERIVATION: the five declarations (wherever they are), each exactly as wanted */
  const derivation = (src) => { const decl = [...src.matchAll(/^  (--warmth-(?:fresh|mid|late|critical|expired)): ([^;]+);$/gm)]; const got = Object.fromEntries(decl.map((m) => [m[1], m[2]])); return { ok: decl.length === 5 && Object.entries(want).every(([k, v]) => got[k] === v), got }; };
  const d0 = derivation(css);
  ok('r5: the four live tiers derive from the theme\'s RAW hues — fresh ← --green, mid ← --blue (#3b82f6 for a plugin theme without one), late ← --yellow, critical ← --red — and expired from --text-dim at 45 %, never from a text mix (RED on 749aa7bf9: --ok-text / --accent / --warn-text / --bad-text / --border)',
    d0.ok, JSON.stringify(d0.got));
  const MID = '  --warmth-mid: var(--blue, #3b82f6);', EXP = '  --warmth-expired: color-mix(in srgb, var(--text-dim) 45%, transparent);';
  ok('…CONTROL: the .374 line planted back reds the pin — mid ← --accent (the second green); expired ← --border (the invisible one)',
    css.includes(MID) && css.includes(EXP) && !derivation(css.replace(MID, '  --warmth-mid: var(--accent);')).ok && !derivation(css.replace(EXP, '  --warmth-expired: var(--border);')).ok);
  ok('…declared in the block every theme inherits (`:root, [data-theme]`) beside the status tokens they read', /\/\*[\s\S]*\*\/\s*:root, \[data-theme\]$|^:root, \[data-theme\]$/.test(sel) || sel.endsWith(':root, [data-theme]'), sel.slice(-80));
  ok('…and no built-in theme block spells a literal warmth colour of its own', (css.match(/--warmth-(fresh|mid|late|critical|expired)\s*:/g) || []).length === 5);
  const ed = read('src/lib/theme-editor.js');
  const rows = [...ed.matchAll(/\{ key: '(--warmth-[a-z]+)', label: '([^']+)', group: 'Cache warmth', isText: true, derived: '([^']+)' \}/g)].map((m) => [m[1], m[3]]);
  ok('the theme editor lists the five under «Cache warmth», each starting as the theme\'s own derivation (r5: the raw hues, expired dim)', rows.length === 5 && rows.every(([k, v]) => want[k] === v), JSON.stringify(rows));
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
  const factW = { ttlSec: 3600, observed: 'read', read: 42000, created: 600 };
  const idReset = add(3, { name: 'reset', claudeSessionId: '33333333-3333-4333-8333-333333333333', lastRequestAt: T0 - 5 * 60e3, lastRequestMember: 'sub-member-a', cacheFact: factW, compactedAt: T0 - 2 * 60e3 });
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
  const sR = active.get(idReset);
  ok('⑪ THE PIN (lane cache-warmth-compact): what the last record SAID (its TTL, read / created / cold) and a compaction\'s reset still standing are read back — the ONE spelling (sessionFromMeta); a meta with neither restores neither (RED on 749aa7bf9)',
    sR && JSON.stringify(sR._cacheFact) === JSON.stringify(factW) && sR._compactedAt === T0 - 2 * 60e3 && sS && sS._cacheFact === null && sS._compactedAt === null, JSON.stringify(sR && [sR._cacheFact, sR._compactedAt, sS && sS._cacheFact, sS && sS._compactedAt]));
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

console.log('— ⑪ the cache is observed (lane cache-warmth-compact, amendment 1)');
if (HAVE) {
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default, ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const tr = (dict) => (k, p) => (dict[k] || k).replace(/\{(\w+)\}/g, (m, x) => (p && p[x] != null ? String(p[x]) : m));
  const S = 1_800_000_000_000, clk = { serverNow: S, receivedAt: 0, now: 0 }, timeText = () => '18:16';
  const rec = { lastRequestAt: S - 10 * 60e3, cacheTtlSec: 3600, lost: false, inFlight: false, turnStartedAt: null, ttlSource: 'record', cacheObserved: 'read', cacheReadTokens: 42123, cacheCreatedTokens: 800 };
  const wRead = warmthOf(rec, clk), wInf = warmthOf({ ...rec, ttlSource: 'inferred' }, clk);
  ok('⑪ warmthOf: a fact whose TTL the last response wrote carries its provenance (`source`: the TTL, read, its tokens); an inferred one carries none — the tier is the same either way',
    wRead.tier === 'fresh' && JSON.stringify(wRead.source) === JSON.stringify({ ttlSec: 3600, observed: 'read', read: 42123, created: 800 }) && wInf.tier === 'fresh' && !('source' in wInf), JSON.stringify([wRead, wInf]));
  const wReset = warmthOf({ lastRequestAt: null, cacheTtlSec: 3600, lost: false, inFlight: false, turnStartedAt: null, unknown: 'compacted' }, clk);
  const wNone = warmthOf({ lastRequestAt: null, cacheTtlSec: null, unknown: 'no-request' }, clk);
  ok('⑪ warmthOf: an unknown WITH A REASON stays tier \'unknown\' (nothing to draw: no frac, no time) and carries the reason — `compacted`, `no-request`; a reason it does not know is ignored',
    wReset.tier === 'unknown' && wReset.frac === null && wReset.lastAt === null && wReset.unknown === 'compacted' && wNone.tier === 'unknown' && wNone.unknown === 'no-request' && !('unknown' in warmthOf({ lastRequestAt: null, cacheTtlSec: 3600, unknown: 'other' }, clk)),
    JSON.stringify([wReset, wNone]));
  const say = (w, t) => warmthTitle(w, { timeText, ...(t ? { t } : {}) });
  ok('⑪ THE PIN (en): the hover says what the band projects from — «Cache: about 50 min left — projected from the 1-hour cache of the last request (read 42k tokens at 18:16)» (RED on 749aa7bf9: the bare countdown)',
    say(wRead) === 'Cache: about 50 min left — projected from the 1-hour cache of the last request (read 42k tokens at 18:16)', say(wRead));
  const wCold = warmthOf({ ...rec, cacheObserved: 'cold', cacheReadTokens: 0, cacheCreatedTokens: 120400 }, clk), w5 = warmthOf({ ...rec, cacheTtlSec: 300, lastRequestAt: S - 60e3, cacheObserved: 'created', cacheReadTokens: 0, cacheCreatedTokens: 950 }, clk);
  ok('⑪ (en): a cold one says the earlier cache was not reused; the 5-minute bucket names itself; a first write says it wrote',
    say(wCold) === 'Cache: about 50 min left — projected from the 1-hour cache of the last request (the earlier cache was not reused · wrote 120k tokens at 18:16)'
    && say(w5) === 'Cache: about 4 min left — projected from the 5-minute cache of the last request (wrote 950 tokens at 18:16)', [say(wCold), say(w5)].join(' | '));
  ok('⑪ (en): an INFERRED TTL keeps the r1a words (the fallback says no record); expired / moved / in flight are unchanged',
    say(wInf) === 'Cache: about 50 min left · last request 18:16' && say(warmthOf({ ...rec, lastRequestAt: S - 2 * 3600e3 }, clk)) === 'Cache expired · last request 18:16', say(wInf));
  ok('⑪ THE PIN (en): the reasons say themselves — «Cache reset — the conversation was compacted», «Cache: unknown — no request yet»; an unknown without one still says nothing',
    say(wReset) === 'Cache reset — the conversation was compacted' && say(wNone) === 'Cache: unknown — no request yet' && say(warmthOf(null, clk)) === '', [say(wReset), say(wNone)].join(' | '));
  ok('⑪ zh: «缓存还剩约 50 分钟 — 按上次请求的1 小时缓存推算（18:16 读取 42k tokens）», «缓存已重置 — 对话已压缩»',
    say(wRead, tr(zh)) === '缓存还剩约 50 分钟 — 按上次请求的1 小时缓存推算（18:16 读取 42k tokens）' && say(wReset, tr(zh)) === '缓存已重置 — 对话已压缩', [say(wRead, tr(zh)), say(wReset, tr(zh))].join(' | '));
  ok('⑪ ja: «キャッシュ残り約 50 分 — 前回リクエストの1 時間キャッシュから推定（18:16 に 42k トークン読み込み）», «キャッシュ: 不明 — まだリクエストなし»',
    say(wRead, tr(ja)) === 'キャッシュ残り約 50 分 — 前回リクエストの1 時間キャッシュから推定（18:16 に 42k トークン読み込み）' && say(wNone, tr(ja)) === 'キャッシュ: 不明 — まだリクエストなし', [say(wRead, tr(ja)), say(wNone, tr(ja))].join(' | '));
  const keysA1 = ['Cache: about {n} min left — projected from the {cache} of the last request (read {k} tokens at {time})', 'Cache: about {n} min left — projected from the {cache} of the last request (wrote {k} tokens at {time})',
    'Cache: about {n} min left — projected from the {cache} of the last request (the earlier cache was not reused · wrote {k} tokens at {time})', '1-hour cache', '5-minute cache', 'Cache reset — the conversation was compacted', 'Cache: unknown — no request yet'];
  const sameP = (k, v) => JSON.stringify((k.match(/\{\w+\}/g) || []).sort()) === JSON.stringify((String(v).match(/\{\w+\}/g) || []).sort());
  const badA1 = keysA1.filter((k) => ![zh, ja].every((d) => typeof d[k] === 'string' && sameP(k, d[k])));
  const unusedA1 = keysA1.filter((k) => !code('src/cache-warmth.js').includes(`t('${k}'`));
  ok('⑪ every new key has a zh AND a ja entry with the same {placeholders}, each used through a t(\'…\') literal (§78 stays flat)', badA1.length === 0 && unusedA1.length === 0, badA1.concat(unusedA1).join(' | '));
  ok('⑪ tokensText: 950 · 42k · 1.2M', CW.tokensText && CW.tokensText(950) === '950' && CW.tokensText(42123) === '42k' && CW.tokensText(1_234_000) === '1.2M');
  // the session list
  const R = require(path.join(REPO, 'src/routes/sessions.js'));
  const live = new Map([['c-rec', {}], ['c-reset', {}], ['c-none', {}], ['c-codex', {}]]);
  const byS = new Map([...live].map(([k, v]) => [v, k]));
  const dA = R.warmthDiff(live, (s) => ({
    'c-rec': { lastRequestAt: 900, cacheTtlSec: 300, ttlSource: 'record', lost: false, inFlight: false, turnStartedAt: null, cacheObserved: 'cold', cacheReadTokens: 0, cacheCreatedTokens: 9000, unknownWhy: null },
    'c-reset': { lastRequestAt: null, cacheTtlSec: 3600, ttlSource: 'inferred', lost: false, inFlight: false, turnStartedAt: null, cacheObserved: null, unknownWhy: 'compacted' },
    'c-none': { lastRequestAt: null, cacheTtlSec: null, ttlSource: null, lost: false, inFlight: false, turnStartedAt: null, unknownWhy: 'no-request' },
    'c-codex': { lastRequestAt: 950, cacheTtlSec: null, lost: false, unknownWhy: null } }[byS.get(s)]), 1000);
  ok('⑪ THE PIN — warmthDiff carries the provenance (ttlSource + cacheObserved + its tokens) beside the five facts (RED on 749aa7bf9: dropped)',
    JSON.stringify(dA.warmth['c-rec']) === JSON.stringify({ lastRequestAt: 900, cacheTtlSec: 300, lost: false, inFlight: false, turnStartedAt: null, ttlSource: 'record', cacheObserved: 'cold', cacheReadTokens: 0, cacheCreatedTokens: 9000 }), JSON.stringify(dA.warmth['c-rec']));
  ok('⑪ THE PIN — a REASONED unknown is sent with no instant (a compaction\'s reset; no request yet) — the client still draws nothing; an unknown without a reason (codex: no TTL) is left out as before (RED on 749aa7bf9)',
    JSON.stringify(dA.warmth['c-reset']) === JSON.stringify({ lastRequestAt: null, cacheTtlSec: 3600, lost: false, inFlight: false, turnStartedAt: null, unknown: 'compacted', ttlSource: 'inferred' })
    && dA.warmth['c-none'] && dA.warmth['c-none'].unknown === 'no-request' && dA.warmth['c-none'].lastRequestAt === null && !('c-codex' in dA.warmth) && warmthOf(dA.warmth['c-reset'], { serverNow: 1000, receivedAt: 0, now: 0 }).tier === 'unknown', JSON.stringify(dA.warmth));
  // the chrome: the reasoned words live only where words already live
  const wcA1 = code('src/lib/warmth-chrome.js');
  ok('⑪ the chrome: the reasoned unknown\'s words go through wordsOf alone — the bar\'s and a tab label\'s hover — while every ring, square, count and list row still asks isKnown (nothing drawn)',
    /const wordsOf = \(w\) => \(isKnown\(w\) \|\| \(w && w\.unknown\) \? warmthTitle\(w, \{ t \}\) : ''\);/.test(wcA1) && (wcA1.match(/wordsOf\(w\)/g) || []).length === 2
    && /if \(!isKnown\(w\)\) \{ if \(ring\) ring\.remove\(\); return; \}/.test(wcA1) && /if \(!isKnown\(w\) \|\| seen\.has\(key\)\) continue;/.test(wcA1) && /const isKnown = \(w\) => !!w && \(LIVE\.has\(w\.tier\) \|\| w\.tier === 'expired'\);/.test(wcA1),
    String((wcA1.match(/wordsOf\(w\)/g) || []).length));
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
  ok('r5: NO expired special case — the one mapping line stands and nothing re-points an expired mark (the ring, the square, the preview ring and the dots all read --warmth-expired, one quiet value)',
    (block.match(/\[data-warmth-tier="expired"\]/g) || []).length === 1 && /\[data-warmth-tier="expired"\]  \{ --warmth-c: var\(--warmth-expired\); \}/.test(block) && !/--warmth-c: var\(--text-dim\)/.test(block));
  const R1B_LEFT = 'font-variant-numeric: tabular-nums; color: var(--text-dim); }';
  const wordsMix = (b) => /\.wl-left \{[^}]*color: var\(--text-dim\); \}/.test(b) && /\.sess-warmth-left \{[^}]*color: var\(--text-dim\); \}/.test(b)
    && /\.wl-left\[data-warmth-tier\], \.sess-warmth-left\[data-warmth-tier\] \{ color: color-mix\(in srgb, var\(--warmth-c\) 50%, var\(--text\)\); \}/.test(b) && !/color: var\(--warmth-c\b/.test(b);
  ok('r5: a tier\'s WORDS mix the hue toward --text (50 %: ≥ 4.5:1 on every built-in theme — 60 % fell to 4.05:1 in light) and words with no tier stay --text-dim; no text site wears the raw hue',
    wordsMix(block));
  ok('…CONTROL: the r1b .wl-left planted back (the raw var(--warmth-c, …) as its colour) reds the pin', block.includes(R1B_LEFT) && !wordsMix(block.replace(R1B_LEFT, 'font-variant-numeric: tabular-nums; color: var(--warmth-c, var(--text-dim)); }')));
  const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
  ok('…NO literal colour in the block (theme vars only) — and nothing in it animates (no transition, no animation)', !!block && !LITERAL.test(block) && !/\b(transition|animation)\s*:/.test(block), (block.match(LITERAL) || [''])[0]);
  ok('…CONTROL: the literal check fires on the blink\'s own literal planted into the block', LITERAL.test(block + '\n.x { background: rgba(250,180,40,0.4); }') && LITERAL.test(block + '\n.x { color: #e5c07b; }'));
  ok('…the five token names are only ever READ in it (⑥\'s exact-5 declarations hold)', !/--warmth-(fresh|mid|late|critical|expired)\s*:/.test(block) && (css.match(/--warmth-(fresh|mid|late|critical|expired)\s*:/g) || []).length === 5);
  // round 2 (fixups-r2: the acceptance of ca2670be0)
  ok('r2 H1: a list row\'s label SHRINKS (every ⧉ list row and the summary list\'s: flex 1 1 auto, min-width 0, the ellipsis) and the words never wrap or shrink; paintListRow marks the label; OFF takes the mark back off the ⧉ list',
    /\.overlap-switcher-item > \.wl-name \{ flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; \}/.test(block) && /\.wl-left \{ flex: none; margin-left: auto; white-space: nowrap;/.test(block) && !/\.warmth-list \.wl-name/.test(block)
    && /if \(label\) label\.classList\.add\('wl-name'\);/.test(bodyOf(wc, /\nexport function paintListRow\(app, item, src, label\) /))
    && /for \(const el of document\.querySelectorAll\('\.overlap-switcher:not\(\.warmth-list\) \.wl-name'\)\) el\.classList\.remove\('wl-name'\);/.test(bodyOf(wc, /\nfunction clearAll\(app\) /)));
  const otherRow = (src) => /if \(warm\) paintListRow\(app, item, \{ ids: tileIds\(app, r\.id\) \}, label\);/.test(src) && !/paintListRow\(app, item, \{ ids: \[r\.id\] \}, label\)/.test(src);
  ok('r2 H2: an «Other desktops» row paints its GROUP (tileIds: a built chain, a held record\'s host entry `tabChain.tabs`) — the tile and the square ask the same',
    otherRow(tb) && /^export function tileIds\(app, id\) \{$/m.test(wc) && /const tabs = !ws\.isTabGuest && ws\.tabChain && Array\.isArray\(ws\.tabChain\.tabs\) \? ws\.tabChain\.tabs\.map\(String\) : null;/.test(wc)
    && /const ids = tileIds\(app, id\);/.test(bodyOf(wc, /\nfunction warmthOfTile\(app, id\) /)) && /const w = warmthOfTile\(app, sq\.dataset\.winId\);/.test(bodyOf(wc, /\nexport function paintPreviews\(app\) /)));
  ok('…CONTROL: the r1 line planted back (the host alone, `{ ids: [r.id] }`) reds the pin', !otherRow(tb.replace('{ ids: tileIds(app, r.id) }', '{ ids: [r.id] }')));
  ok('r2 H3: on a TILE the ring rides its icon\'s corner (absolute — no width, the 90-px floor keeps its word); a chooser row keeps it inline',
    /\.taskbar-icon > \.warmth-ring, \.taskbar-icon-stack > \.warmth-ring \{ position: absolute; right: -5px; bottom: -5px; z-index: 1;/.test(block) && /\.taskbar-icon:has\(> \.warmth-ring\) \{ position: relative; \}/.test(block)
    && /const host = el\.querySelector\(':scope > \.taskbar-icon, :scope > \.taskbar-icon-stack'\) \|\| el;/.test(bodyOf(wc, /\nexport function paintTile\(app, el\) /)));
  const tf = read('src/lib/taskbar-fit.js');
  const budget = (src) => /let others = warmthDrawn\(this\.app\) \? OVERFLOW_CHIP_WARM_PX : OVERFLOW_CHIP_PX;/.test(src) && !/let others = 48;/.test(src);
  ok('r2 H4: the switcher budgets the «+N» chip by a PURE constant — the warm chip\'s longest form while warmth is drawn (taskbar-fit.js, beside TILE_MIN_PX), never its measured width',
    budget(dm) && /^export const OVERFLOW_CHIP_PX = 48;$/m.test(tf) && /^export const OVERFLOW_CHIP_WARM_PX = \d+;$/m.test(tf) && /^import \{ paintPreviews, warmthDrawn \} from '\.\/warmth-chrome\.js';/m.test(read('src/lib/desktop-manager.js')));
  ok('…CONTROL: the r1 literal planted back (`let others = 48;`) reds the pin', !budget(dm.replace('let others = warmthDrawn(this.app) ? OVERFLOW_CHIP_WARM_PX : OVERFLOW_CHIP_PX;', 'let others = 48;')));
  // round 3 (fixups-r3: the acceptance of 6550a3a51) — J1: the warm chip and the strip refit each other every frame
  const boxRule = (b) => /\.taskbar-overflow\.warmth-box \{ width: (\d+)px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; \}/.exec(b);
  const bx = boxRule(block), BOX = Number((/^export const OVERFLOW_CHIP_WARM_BOX_PX = (\d+);$/m.exec(tf) || [])[1]), ROOM = Number((/^export const OVERFLOW_CHIP_WARM_PX = (\d+);$/m.exec(tf) || [])[1]);
  const gaps = /#taskbar \{[^}]*\bgap: 3px;/.test(css) && /#taskbar-items \{ flex: 1; display: flex; gap: 2px;/.test(css);
  ok('r3 J1: while warmth is drawn the «+N» chip\'s BOX is CONSTANT — the CSS width = taskbar-fit.js OVERFLOW_CHIP_WARM_BOX_PX (the fit reads a constant, never the chip\'s content); the room the switcher budgets = that box + the bar\'s 3-px gap before it + the floor\'s three 2-px tile gaps; paintOverflowChip toggles the box with the drawing',
    !!bx && Number(bx[1]) === BOX && ROOM === BOX + 3 + 3 * 2 && gaps && /const ids = chip\._hiddenIds \|\| \[\], n = ids\.length, drawn = warmthDrawn\(app\);\s*chip\.classList\.toggle\('warmth-box', drawn\);/.test(bodyOf(wc, /\nexport function paintOverflowChip\(app, chip\) /)), { css: bx && bx[1], BOX, ROOM, gaps });
  ok('…CONTROL: the box rule taken out of the block reds the pin', !boxRule(block.replace(/\.taskbar-overflow\.warmth-box \{[^}]*\}/, '')));
}

console.log('— ⑩ the ramp\'s gauge (r5 round 2): six theme blocks × four live tiers, pure arithmetic over style.css');
{
  // THE FLOORS (kb-bugfix-invariants: «a status ramp is built from the theme's raw hues, never its text mixes»): adjacent tiers
  // ≥ 30° of hue — the complaint's own pair (.374 mint → teal, 25°; monokai 1°) sits BELOW it, the shipped minimum (amber →
  // red, 38°) above; a band ≥ 1.5:1 on its title bar (the lower of idle / active); a tier's words ≥ 4.5:1 (AA at 11 px) on the
  // list (--bg-dialog), the phone row (--bg-sidebar) and the window (--bg-window); expired ≥ 1.5:1 on the taskbar.
  const HUE_FLOOR = 30, BAND_FLOOR = 1.5, WORDS_FLOOR = 4.5, EXPIRED_FLOOR = 1.5;
  const TIERS = ['fresh', 'mid', 'late', 'critical'], GROUNDS = ['--bg-dialog', '--bg-sidebar', '--bg-window'];
  const topArgs = (x) => { const out = []; let d = 0, cur = ''; for (const ch of x) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
  const hexRgb = (h) => { let x = h.slice(1); if (x.length <= 4) x = [...x].map((c) => c + c).join(''); const n = (i) => parseInt(x.slice(i, i + 2), 16) / 255; return [n(0), n(2), n(4), x.length === 8 ? n(6) : 1]; };
  const cmix = (a, p, b) => { const q = 1 - p, al = a[3] * p + b[3] * q; return al === 0 ? [0, 0, 0, 0] : [0, 1, 2].map((i) => (a[i] * a[3] * p + b[i] * b[3] * q) / al).concat(al); };   // color-mix in srgb: premultiplied
  const over = (c, bg) => [0, 1, 2].map((i) => c[i] * c[3] + bg[i] * (1 - c[3])).concat(1);
  const resolve = (v, T, depth = 0) => {
    v = String(v).trim(); if (depth > 24) throw new Error('a var() loop at ' + v);
    let m;
    if ((m = /^var\((--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v))) { if (m[1] in T) return resolve(T[m[1]], T, depth + 1); if (m[2] != null) return resolve(m[2], T, depth + 1); throw new Error(m[1] + ' is not defined'); }
    if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return hexRgb(v);
    if ((m = /^rgba?\(([^)]*)\)$/.exec(v))) { const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [n[0] / 255, n[1] / 255, n[2] / 255, n.length > 3 ? n[3] : 1]; }
    if (v === 'transparent') return [0, 0, 0, 0];
    if ((m = /^color-mix\(in srgb,([\s\S]+)\)$/.exec(v))) {
      const [a, b] = topArgs(m[1]), pa = /\s(\d+(?:\.\d+)?)%$/.exec(a), pb = /\s(\d+(?:\.\d+)?)%$/.exec(b);
      const A = resolve(pa ? a.slice(0, pa.index) : a, T, depth + 1), B = resolve(pb ? b.slice(0, pb.index) : b, T, depth + 1);
      return cmix(A, pa ? pa[1] / 100 : pb ? 1 - pb[1] / 100 : 0.5, B);
    }
    throw new Error('not a colour the gauge reads: ' + v);
  };
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hueOf = (c) => { const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 1e-9) return null; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return ((h * 60) + 360) % 360; };
  const hueGap = (a, b) => (a == null || b == null ? null : Math.min(Math.abs(a - b) % 360, 360 - (Math.abs(a - b) % 360)));
  const hex = (c) => '#' + c.slice(0, 3).map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  const decls = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
  /** the gauge over one style.css text → { rows (the printed table), fails [{theme, floor, what, value}], error } */
  const gauge = (src) => {
    const S = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const head = S.slice(0, S.indexOf('html, body {'));
    const blocks = {};
    for (const m of head.matchAll(/(:root, \[data-theme="dark"\]|\[data-theme="([a-z]+)"\])\s*\{([^}]*)\}/g)) Object.assign((blocks[m[2] || 'dark'] = blocks[m[2] || 'dark'] || {}), decls(m[3]));
    const at = S.indexOf('--warmth-fresh:');
    if (at < 0) return { rows: [], fails: [], error: 'no --warmth-fresh declaration' };
    const derived = decls(S.slice(S.lastIndexOf('{', at) + 1, S.indexOf('}', at)));   // the block every theme inherits (declared after the theme blocks)
    const w = /\.wl-left\[data-warmth-tier\], \.sess-warmth-left\[data-warmth-tier\] \{ color: color-mix\(in srgb, var\(--warmth-c\) (\d+(?:\.\d+)?)%, var\(--text\)\); \}/.exec(S);
    const wordsPct = w ? Number(w[1]) : null;
    const rows = [], fails = [];
    for (const theme of Object.keys(blocks)) {
      const T = { ...blocks.dark, ...blocks[theme], ...derived }, c = (v) => resolve(v, T);
      const tier = Object.fromEntries(TIERS.map((t) => [t, c(`var(--warmth-${t})`)]));
      const tb = [c('var(--bg-titlebar)'), c('var(--bg-titlebar-active)')], task = c('var(--bg-taskbar)'), text = c('var(--text)');
      const gaps = TIERS.slice(1).map((t, i) => [`${TIERS[i]}→${t}`, hueGap(hueOf(tier[TIERS[i]]), hueOf(tier[t]))]);
      const bands = TIERS.map((t) => [t, Math.min(...tb.map((g) => ratio(over(tier[t], g), g)))]);
      const words = wordsPct == null ? [] : TIERS.flatMap((t) => GROUNDS.map((k) => { const g = c(`var(${k})`); return [`${t} on ${k}`, ratio(over(cmix(tier[t], wordsPct / 100, text), g), g)]; }));
      const expired = ratio(over(c('var(--warmth-expired)'), task), task);
      for (const [what, v] of gaps) if (v == null || v < HUE_FLOOR) fails.push({ theme, floor: 'hue', what, value: v == null ? 'no hue' : Math.round(v) + '°' });
      for (const [what, v] of bands) if (v < BAND_FLOOR) fails.push({ theme, floor: 'band', what, value: v.toFixed(2) });
      if (wordsPct == null) fails.push({ theme, floor: 'words', what: 'the words\' mix rule', value: 'absent' });
      for (const [what, v] of words) if (v < WORDS_FLOOR) fails.push({ theme, floor: 'words', what, value: v.toFixed(2) });
      if (expired < EXPIRED_FLOOR) fails.push({ theme, floor: 'expired', what: 'expired on --bg-taskbar', value: expired.toFixed(2) });
      const lo = (xs) => (xs.length ? Math.min(...xs.map(([, v]) => (v == null ? -1 : v))) : NaN);
      rows.push(`${theme.padEnd(9)} ${TIERS.map((t) => `${hex(tier[t])} ${String(Math.round(hueOf(tier[t]) ?? NaN)).padStart(3)}°`).join(' · ')}  Δhue ${gaps.map(([, v]) => (v == null ? '—' : Math.round(v))).join('/')}  band ≥ ${lo(bands).toFixed(2)}  words@${wordsPct}% ≥ ${lo(words).toFixed(2)}  expired ${expired.toFixed(2)}`);
    }
    return { rows, fails, themes: Object.keys(blocks) };
  };
  const css = read('public/style.css');
  let g = null; try { g = gauge(css); } catch (e) { g = { rows: [], fails: [], error: (e && e.message) || String(e) }; }
  for (const r of g.rows) console.log('    ' + r);
  const by = (floor) => g.fails.filter((f) => f.floor === floor).map((f) => `${f.theme} ${f.what} ${f.value}`).join('; ');
  const SIX = ['dark', 'light', 'dracula', 'nord', 'solarized', 'monokai'];   // the built-in blocks today; the gauge walks whatever blocks it FINDS (r3)
  ok(`⑩ the gauge walks every theme block it finds (${(g.themes || []).length}: ${(g.themes || []).join(', ')}) — the six built-in ones among them — and resolves every colour it needs`, !g.error && SIX.every((t) => (g.themes || []).includes(t)), g.error);
  ok(`⑩ every ADJACENT pair of tiers ≥ ${HUE_FLOOR}° of hue on every theme (RED on 749aa7bf9: .374's mint → teal)`, !g.error && !by('hue'), by('hue'));
  ok(`⑩ every band ≥ ${BAND_FLOOR}:1 on its title bar (the lower of idle / active) on every theme`, !g.error && !by('band'), by('band'));
  ok(`⑩ a tier's words (the block's own mix toward --text) ≥ ${WORDS_FLOOR}:1 on the list / phone row / window on every theme`, !g.error && !by('words'), by('words'));
  ok(`⑩ expired ≥ ${EXPIRED_FLOOR}:1 on the taskbar on every theme (RED on 749aa7bf9: --border, 1.17:1)`, !g.error && !by('expired'), by('expired'));
  // the PLANTED copies: each reds the gauge on its own floor (a gauge that cannot fall is no gauge)
  const plant = (from, to) => (css.includes(from) ? gauge(css.replace(from, to)) : null);
  const failsOf = (x, floor) => (x ? x.fails.filter((f) => f.floor === floor) : []);
  const pm = plant('  --warmth-mid: var(--blue, #3b82f6);', '  --warmth-mid: var(--accent);');
  ok('…CONTROL: --warmth-mid ← var(--accent) planted (the .374 «second green») ⇒ the hue floor reds — on monokai, whose accent IS its green (0° from the raw green)',
    failsOf(pm, 'hue').some((f) => f.theme === 'monokai' && f.what === 'fresh→mid' && f.value === '0°'), JSON.stringify(pm && failsOf(pm, 'hue')));
  const p374 = (() => { const x = '  --warmth-fresh: var(--green);'; return css.includes(x) && css.includes('  --warmth-mid: var(--blue, #3b82f6);') ? gauge(css.replace(x, '  --warmth-fresh: var(--ok-text);').replace('  --warmth-mid: var(--blue, #3b82f6);', '  --warmth-mid: var(--accent);')) : null; })();
  const hue374 = Object.fromEntries(failsOf(p374, 'hue').filter((f) => f.what === 'fresh→mid').map((f) => [f.theme, f.value]));
  ok(`…CONTROL: the .374 pair planted back (fresh ← --ok-text, mid ← --accent) ⇒ the hue floor reds at the complaint's own gaps — dark ${hue374.dark}, light ${hue374.light}, monokai ${hue374.monokai}`,
    hue374.dark === '25°' && hue374.light === '22°' && hue374.monokai === '1°', JSON.stringify(p374 && failsOf(p374, 'hue')));
  const pw = plant('var(--warmth-c) 50%, var(--text)', 'var(--warmth-c) 60%, var(--text)');
  ok('…CONTROL: the words at 60 % planted (the brief\'s first number) ⇒ the AA floor reds — light\'s amber on the phone row',
    failsOf(pw, 'words').some((f) => f.theme === 'light' && f.what === 'late on --bg-sidebar'), JSON.stringify(pw && failsOf(pw, 'words')));
  const pe = plant('  --warmth-expired: color-mix(in srgb, var(--text-dim) 45%, transparent);', '  --warmth-expired: var(--border);');
  const every = (x, floor, pick = () => true) => !!x && x.themes.length >= SIX.length && failsOf(x, floor).filter(pick).length === x.themes.length;   // r3: counted over the blocks the walk FOUND
  ok('…CONTROL: expired ← var(--border) planted (.374\'s invisible mark) ⇒ the expired floor reds on every theme block found',
    every(pe, 'expired'), JSON.stringify(pe && failsOf(pe, 'expired')));
  const pb = plant('  --warmth-late: var(--yellow);', '  --warmth-late: var(--bg-titlebar-active);');
  ok('…CONTROL: a band planted in its title bar\'s own colour (--warmth-late ← var(--bg-titlebar-active)) ⇒ the band floor reds on every theme block found',
    every(pb, 'band', (f) => f.what === 'late'), JSON.stringify(pb && failsOf(pb, 'band')));
  // r3 (the acceptance of 3ba074455): a SEVENTH theme block reds only the floor it breaks — never a control that counted six
  const SEVENTH = '[data-theme="seventh"] {\n  --green: #22c55e; --blue: #2fc56a;\n}\n';
  const css7 = css.includes('\nhtml, body {') ? css.replace('\nhtml, body {', '\n' + SEVENTH + '\nhtml, body {') : null;
  let g7 = null; try { g7 = css7 && gauge(css7); } catch (e) { g7 = { rows: [], fails: [], themes: [], error: e.message }; }
  const pe7 = css7 && css7.includes('  --warmth-expired: color-mix(in srgb, var(--text-dim) 45%, transparent);') ? gauge(css7.replace('  --warmth-expired: color-mix(in srgb, var(--text-dim) 45%, transparent);', '  --warmth-expired: var(--border);')) : null;
  ok('…a SEVENTH theme block planted (its blue under 2° from its green) ⇒ the gauge walks seven, reds the hue floor on that block ALONE; the expired control over the same copy counts seven and still reds every one',
    !!g7 && !g7.error && g7.themes.length === 7 && g7.fails.length > 0 && g7.fails.every((f) => f.theme === 'seventh' && f.floor === 'hue') && every(pe7, 'expired'), JSON.stringify(g7 && { themes: g7.themes, fails: g7.fails }));
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
