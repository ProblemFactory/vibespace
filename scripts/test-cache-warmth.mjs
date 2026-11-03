#!/usr/bin/env node
// THE PROMPT-CACHE WARMTH OF A CONVERSATION (lane cache-warmth-tiles, 2026-11-02 — a fleet user's ask: every session box
// shows how warm its conversation's prompt cache still is, green to red as the hour runs out, nothing once it expired; the
// owner's rulings: OPT-IN (`desktop.cacheWarmth` off by default), five semantic tokens derived from each theme's status
// colours, ONE green, the band's length carries the countdown). r1a = the facts and the tiers; the band is drawn in r1b.
//   ① PURE tierOf (src/cache-warmth.js — CommonJS, the hub's and the client's ONE table): every boundary ± 1 s for the 1-hour and the 5-minute cache; a boundary
//     belongs to the LATER tier; no TTL ⇒ unknown;
//   ② warmthOf BY THE HUB'S CLOCK: a device clock an hour off changes nothing; only the time SINCE the answer counts (a
//     step back counts as none); no serverNow / stamp / TTL ⇒ unknown; an account move at or after the last request ⇒
//     expired at once, a request after it warms it again; the band's length (frac) runs 1 → 0;
//   ③ the hover words in en / zh / ja (minutes rounded UP, the move's own sentence, unknown says nothing);
//   ④ THE SESSION-LIST DIFF (src/routes/sessions.js warmthDiff): each live conversation's three facts keyed by its webui
//     id + the hub's own now; an unknown TTL left out; a throwing fact skipped; the answer carries it ONLY while the switch
//     is on, over usage-pool-engine cacheFactsOf (the pool's warm-cache hold reads the same — test-pool-auto drives the
//     producer: the request stamp over pty noise, the credits TTL, the re-point = the cache lost; test-fable-cap-pool-storm §21 the
//     stamp's ONE writer through the real stdout consumer and the device feed);
//   ⑤ the switch: `desktop.cacheWarmth`, boolean, OFF by default, in the Window group, its words in zh / ja;
//   ⑥ the five tokens, each DERIVED from the theme's status vocabulary in the block every theme inherits, and the theme
//     editor's «Cache warmth» rows starting as those derivations (a saved theme keeps deriving).
// Run: node scripts/test-cache-warmth.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const code = (f) => read(f).split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n'); // a `//` comment never satisfies a pin
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } return !!c; };

let CW = null; try { CW = require(path.join(REPO, 'src/cache-warmth.js')); } catch (e) { CW = { why: e.message.split('\n')[0] }; }
ok('THE TIER FUNCTION exists — src/cache-warmth.js tierOf / warmthOf / warmthTitle (RED on 3f8429cd5: there was none)', !!(CW.tierOf && CW.warmthOf && CW.warmthTitle), CW.why || '');
if (!CW.tierOf) { console.log(`\n${fail} FAILED (${pass} passed)`); process.exit(1); }
const { tierOf, warmthOf, warmthTitle, WARMTH_TIERS, WARMTH_STATES } = CW;

console.log('— ① the tiers');
{
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
{
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
  const five = warmthOf({ lastRequestAt: S - 255e3, cacheTtlSec: 300 }, { serverNow: S, receivedAt: 0, now: 0 });
  ok('on credits (5 min) 4 min 15 s is critical with 45 s left (four minutes is still late: 48 of 60)', five.tier === 'critical' && five.leftMs === 45e3 && warmthOf({ lastRequestAt: S - 240e3, cacheTtlSec: 300 }, { serverNow: S, receivedAt: 0, now: 0 }).tier === 'late', JSON.stringify(five));
}

console.log('— ③ the words');
{
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
  const keys = ['Cache: about {n} min left · last request {time}', 'Cache expired · last request {time}', 'Cache expired — the conversation moved to another account at {time}'];
  ok('every hover key has a zh AND a ja entry carrying the same placeholders', keys.every((k) => [zh, ja].every((d) => typeof d[k] === 'string' && (k.match(/\{\w+\}/g) || []).every((p) => d[k].includes(p)))));
}

console.log('— ④ the session-list diff');
{
  const R = require(path.join(REPO, 'src/routes/sessions.js'));
  const live = new Map([
    ['sess-a', { _webuiId: 'sess-a', backend: 'claude' }],
    ['sess-codex', { _webuiId: 'sess-codex', backend: 'codex' }],
    ['sess-boom', { _webuiId: 'sess-boom', backend: 'claude' }],
    ['sess-tmux', { _webuiId: 'sess-tmux', backend: 'claude', isTmuxView: true }],
  ]);
  const factsOf = (s, now) => {
    if (s._webuiId === 'sess-boom') throw new Error('boom');
    if (s.backend === 'codex') return { lastRequestAt: now - 1e3, cacheTtlSec: null, cacheLostAt: null };
    return { lastRequestAt: now - 5e3, cacheTtlSec: 3600, cacheLostAt: now - 9e3, extra: 'not sent' };
  };
  const d = R.warmthDiff(live, factsOf, 1000000);
  ok('each live conversation\'s THREE facts keyed by its webui id, with the hub\'s now', d.serverNow === 1000000 && JSON.stringify(d.warmth) === JSON.stringify({ 'sess-a': { lastRequestAt: 995000, cacheTtlSec: 3600, cacheLostAt: 991000 } }), JSON.stringify(d));
  ok('an unknown TTL (codex) is left out — no colour, never a guess; a throwing fact and a tmux view are skipped', !('sess-codex' in d.warmth) && !('sess-boom' in d.warmth) && !('sess-tmux' in d.warmth));
  ok('no producer ⇒ an empty diff (never a throw)', JSON.stringify(R.warmthDiff(live, null, 7)) === '{"warmth":{},"serverNow":7}');
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

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed)' : 'ALL PASS (' + pass + ')'}`);
process.exit(fail ? 1 : 0);
