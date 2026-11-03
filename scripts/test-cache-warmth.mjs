#!/usr/bin/env node
// THE PROMPT-CACHE WARMTH OF A CONVERSATION (lane cache-warmth-tiles, 2026-11-02 — a fleet user's ask: every session box
// shows how warm its conversation's prompt cache still is, green to red as the hour runs out, nothing once it expired; the
// owner's rulings: OPT-IN (`desktop.cacheWarmth` off by default), five semantic tokens derived from each theme's status
// colours, ONE green, the band's length carries the countdown). r1a = the facts and the tiers; the band is drawn in r1b.
//   ① PURE tierOf (src/cache-warmth.js — CommonJS, the hub's and the client's ONE table): every boundary ± 1 s for the 1-hour and the 5-minute cache; a boundary
//     belongs to the LATER tier; no TTL ⇒ unknown;
//   ② warmthOf BY THE HUB'S CLOCK: a device clock an hour off changes nothing; only the time SINCE the answer counts (a
//     step back counts as none); no serverNow / stamp / TTL ⇒ unknown; an account move at or after the last request ⇒
//     expired at once, a request after it warms it again; the band's length (frac) runs 1 → 0; IN A TURN (round 2, the turn
//     law) ⇒ fresh with the whole TTL, stamp or none;
//   ③ the hover words in en / zh / ja (minutes rounded UP, the move's own sentence, unknown says nothing);
//   ④ THE SESSION-LIST DIFF (src/routes/sessions.js warmthDiff): each live conversation's three facts keyed by its webui
//     id + the hub's own now; an unknown TTL left out; a throwing fact skipped; the answer carries it ONLY while the switch
//     is on, over usage-pool-engine cacheFactsOf (the pool's warm-cache hold reads the same — test-pool-auto drives the
//     producer: the request stamp over pty noise, the credits TTL, the re-point = the cache lost; test-fable-cap-pool-storm §21 the
//     stamp's ONE writer through the real stdout consumer and the device feed);
//   ⑤ the switch: `desktop.cacheWarmth`, boolean, OFF by default, in the Window group, its words in zh / ja — HELD (r1a′,
//     主开发's ruling): the row exists but the Settings window never draws it (no search, no modified row) until r1b's band;
//   ⑥ the five tokens, each DERIVED from the theme's status vocabulary in the block every theme inherits, and the theme
//     editor's «Cache warmth» rows starting as those derivations (a saved theme keeps deriving);
//   ⑦ THE STAMP OUTLIVES A RESTART (r1a′): the REAL boot-restore over a scratch data dir (a fake fuser says every socket is
//     alive) reads a persisted `lastRequestAt` back as the conversation's stamp — 30 min old ⇒ warm, 30 min ago; a meta with
//     none restores none (the engine then calls it UNKNOWN — test-pool-auto).
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
  const fact = { lastRequestAt: S - 45 * 60e3, cacheTtlSec: 3600, cacheLostAt: null };
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
  const lost = warmthOf({ ...fact, lastRequestAt: S - 60e3, cacheLostAt: S - 30e3 }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('THE ACCOUNT MOVE: a move after the last request ⇒ expired at once (the cache stays with the account that wrote it)', lost.tier === 'expired' && lost.frac === 0 && lost.lostAt === S - 30e3, JSON.stringify(lost));
  ok('…a move AT the request\'s instant counts as after it', warmthOf({ ...fact, lastRequestAt: S - 60e3, cacheLostAt: S - 60e3 }, { serverNow: S, receivedAt: 0, now: 0 }).tier === 'expired');
  ok('…and a request AFTER the move warms it again', warmthOf({ ...fact, lastRequestAt: S - 10e3, cacheLostAt: S - 30e3 }, { serverNow: S, receivedAt: 0, now: 0 }).tier === 'fresh');
  const turn0 = warmthOf({ lastRequestAt: null, cacheTtlSec: 3600, cacheLostAt: null, inTurn: true }, { serverNow: S, receivedAt: 0, now: 0 });
  const turnOld = warmthOf({ lastRequestAt: S - 59 * 60e3, cacheTtlSec: 3600, cacheLostAt: S - 70 * 60e3, inTurn: true }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('THE TURN LAW (round 2): in a turn ⇒ fresh with the whole TTL left (frac 1) — no stamp yet, or a stamp 59 min old (the request in flight is writing the cache)',
    turn0.tier === 'fresh' && turn0.frac === 1 && turn0.leftMs === 3600e3 && turn0.inTurn === true && turnOld.tier === 'fresh' && turnOld.frac === 1, JSON.stringify([turn0, turnOld]));
  ok('…but never without a TTL (an unknown harness stays unknown, in a turn or not)', warmthOf({ lastRequestAt: null, cacheTtlSec: null, inTurn: true }, { serverNow: S, receivedAt: 0, now: 0 }).tier === 'unknown');
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
  const moved = warmthOf({ lastRequestAt: S - 60e3, cacheTtlSec: 3600, cacheLostAt: S - 30e3 }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('the move says itself: «缓存已过期 — 对话在 14:05 换到了另一个账号»', warmthTitle(moved, { t: tr(zh), timeText }) === '缓存已过期 — 对话在 14:05 换到了另一个账号', warmthTitle(moved, { t: tr(zh), timeText }));
  ok('unknown says nothing', warmthTitle(warmthOf(null, {}), { timeText }) === '' && warmthTitle(null) === '');
  const turn = warmthOf({ lastRequestAt: null, cacheTtlSec: 3600, inTurn: true }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('in a turn: «Cache: warm — a turn is running» / «缓存正热 — 回合进行中» (no minutes: the countdown starts when the turn ends)',
    warmthTitle(turn, { timeText }) === 'Cache: warm — a turn is running' && warmthTitle(turn, { t: tr(zh), timeText }) === '缓存正热 — 回合进行中' && /ターン実行中/.test(warmthTitle(turn, { t: tr(ja), timeText })), warmthTitle(turn, { t: tr(zh), timeText }));
  const keys = ['Cache: about {n} min left · last request {time}', 'Cache expired · last request {time}', 'Cache expired — the conversation moved to another account at {time}', 'Cache: warm — a turn is running'];
  ok('every hover key has a zh AND a ja entry carrying the same placeholders', keys.every((k) => [zh, ja].every((d) => typeof d[k] === 'string' && (k.match(/\{\w+\}/g) || []).every((p) => d[k].includes(p)))));
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
    if (s.backend === 'codex') return { lastRequestAt: now - 1e3, cacheTtlSec: null, cacheLostAt: null };
    if (s._webuiId === 'sess-fresh') return { lastRequestAt: null, cacheTtlSec: 3600, cacheLostAt: null }; // a restart with nothing persisted
    return { lastRequestAt: now - 5e3, cacheTtlSec: 3600, cacheLostAt: now - 9e3, extra: 'not sent' };
  };
  const d = R.warmthDiff(live, factsOf, 1000000);
  ok('each live conversation\'s THREE facts keyed by its webui id, with the hub\'s now', d.serverNow === 1000000 && JSON.stringify(d.warmth) === JSON.stringify({ 'sess-a': { lastRequestAt: 995000, cacheTtlSec: 3600, cacheLostAt: 991000 } }), JSON.stringify(d));
  ok('an unknown TTL (codex) is left out — no colour, never a guess; a throwing fact and a tmux view are skipped', !('sess-codex' in d.warmth) && !('sess-boom' in d.warmth) && !('sess-tmux' in d.warmth));
  ok('…and so is a conversation whose last request is unknown (r1a′: a restart with nothing persisted — no colour)', !('sess-fresh' in d.warmth));
  ok('no producer ⇒ an empty diff (never a throw)', JSON.stringify(R.warmthDiff(live, null, 7)) === '{"warmth":{},"serverNow":7}');
  const dT = R.warmthDiff(new Map([['sess-turn', { _webuiId: 'sess-turn' }], ['sess-idle', { _webuiId: 'sess-idle' }]]), (s) => ({ lastRequestAt: null, cacheTtlSec: 3600, cacheLostAt: null, inTurn: s._webuiId === 'sess-turn' }), 5);
  ok('THE TURN LAW (round 2): an in-turn conversation with no stamp yet IS sent, `inTurn: true` (the pool holds it — the list agrees); the idle unstamped one stays out (unknown)',
    JSON.stringify(dT.warmth) === JSON.stringify({ 'sess-turn': { lastRequestAt: null, cacheTtlSec: 3600, cacheLostAt: null, inTurn: true } }), JSON.stringify(dT));
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
  ok('HELD (r1a′): the row exists — default off, its why in words — but the window never draws it: not plainly, not by a search, not as a modified row',
    row0 && row0.default === false && typeof row0.held === 'string' && /r1b/.test(row0.held)
    && !drawn(SM.SETTINGS_SCHEMA, '', false).includes('desktop.cacheWarmth') && !drawn(SM.SETTINGS_SCHEMA, 'prompt-cache', false).includes('desktop.cacheWarmth') && !drawn(SM.SETTINGS_SCHEMA, 'cacheWarmth', true).includes('desktop.cacheWarmth'));
  const { held: _h, ...unheld } = row0 || {};
  ok('…CONTROL: the same row without `held` is drawn (a search finds it) — the field is what hides it', drawn({ ...SM.SETTINGS_SCHEMA, 'desktop.cacheWarmth': unheld }, 'prompt-cache', false).includes('desktop.cacheWarmth'));
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
  const idStamped = add(1, { name: 'stamped', claudeSessionId: '11111111-1111-4111-8111-111111111111', lastRequestAt: T0 - 30 * 60e3 });
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
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
