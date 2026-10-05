#!/usr/bin/env node
// lane channel-avatars (B-5fe1, 2026-10-04 — the owner: "我怎么还是看不到每个人的头像"): A PERSON'S REAL PICTURE.
// FAST: the PURE memo / verdict tables (src/channel-avatars.js + channel-attachments' ONE order), the caps row census
// (a 'fetch' row implements avatarImage, an undeclared one throws), a vendor-shape fixture per vendor (invented,
// real-shaped — Lark contact/v3/users, Slack users.info), each adapter's call under a stub vendor (paced BEFORE every
// request, metered, the scope refused BY NAME, the bytes bounded at 256 KiB, NO token to the picture host), the
// route's bounds + the engine's order as a census of the source, and patched copies that must turn it red.
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, name, detail = '') => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); } };
const Av = require('../src/channel-avatars.js');
const Att = require('../src/channel-attachments.js');
const CH = require('../src/channels/index.js');
const lark = require('../src/channels/lark.js'), slack = require('../src/channels/slack.js'), gmail = require('../src/channels/gmail.js'), agents = require('../src/channels/agents.js'), fake = require('../src/channels/fake.js');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const NOW = 1_790_000_000_000;

console.log('① the memo + the ONE picture order (PURE)');
{
  const fresh = Av.memoFacts({ meta: { at: NOW - 86400e3, mime: 'image/png' } }, NOW);
  const stale = Av.memoFacts({ meta: { at: NOW - Av.REFRESH_MS - 1, mime: 'image/png' } }, NOW);
  const none = Av.memoFacts({ meta: { code: 'no-picture', error: 'x', until: NOW + 1000 } }, NOW);
  const gone = Av.memoFacts({ meta: { code: 'no-picture', error: 'x', until: NOW - 1 } }, NOW);
  const v = (f, more = {}) => Att.fetchVerdict({ ...f, owner: true, fetchable: true, enabled: true, inflight: false, backoff: false, affordable: true, ...more });
  const rows = [
    ['fresh: a picture < 30 days is served from the memo — even with the budget spent', v(fresh, { affordable: false }).act === 'serve'],
    ['stale: a picture ≥ 30 days is asked again (served meanwhile by the engine)', stale.stale && !stale.cached && v(stale).act === 'fetch'],
    ['negative: "no picture" inside its TTL answers without a vendor call', v(none).act === 'refuse' && v(none).code === 'no-picture'],
    ['…and past it the person is asked again', v(gone).act === 'fetch'],
    ['refused scope: remembered SCOPE_TTL_MS; "no picture" NONE_TTL_MS; a budget refusal never', Av.refusalTtlMs('forbidden', 'scope', Att.negativeTtlMs) === Av.SCOPE_TTL_MS && Av.refusalTtlMs('not-found', 'no-picture', Att.negativeTtlMs) === Av.NONE_TTL_MS && Av.refusalTtlMs('vendor-budget', null, Att.negativeTtlMs) === 0],
    ['over budget: refused `vendor-budget`, never a fetch', v({ cached: false, remembered: null }, { affordable: false }).code === 'vendor-budget'],
    ['ours only: an author no record names is refused `not-found`', v({ cached: false, remembered: null }, { owner: false }).code === 'not-found'],
    ['one flight: a second ask joins', v({ cached: false, remembered: null }, { inflight: true }).act === 'join'],
  ];
  for (const [n, p] of rows) ok(p, n);
  ok(Av.sniffImage(PNG) === 'image/png' && Av.sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])) === 'image/jpeg' && Av.sniffImage(Buffer.from('GIF89a\0\0\0\0\0\0')) === 'image/gif' && Av.sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')) === 'image/webp', 'sniff: png / jpeg / gif / webp from the BYTES');
  ok(Av.sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')) === null && Av.sniffImage(Buffer.from('<html><body>x</body></html>')) === null && Av.sniffImage(null) === null, 'sniff: svg (script) / html / nothing are no picture');
  const many = Array.from({ length: 90 }, (_, i) => ({ account: 'acc', author: `u${i % 60}` }));
  const w = Av.warmList(many, (k) => k === 'acc\nu0');
  ok(w.length === Av.WARM_MAX && Av.WARM_MAX === 40 && new Set(w.map((x) => x.author)).size === w.length && !w.some((x) => x.author === 'u0'), 'warm-up: ≤ 40 per open, deduped, the answered skipped');
  ok(!Av.authorOk('../x') && !Av.authorOk('a/b') && !Av.authorOk('') && !Av.authorOk('x'.repeat(129)) && Av.authorOk('ou_abc') && Av.authorOk('U0ADA'), 'an author key is judged before any path is built');
}

console.log('② the capability row census');
{
  ok(lark.caps.avatars === 'fetch' && slack.caps.avatars === 'fetch' && gmail.caps.avatars === null && /Gmail has no profile pictures/.test(gmail.caps.avatarsWhy) && agents.caps.avatars === null && !!agents.caps.avatarsWhy, 'rows: Lark / Slack fetch; Gmail + the built-in Agents null WITH their why');
  for (const m of [lark, slack, gmail, agents]) ok(CH.validateCaps(m.kind, m.caps) === true, `${m.kind}: the row validates`);
  const reg = CH.createChannelRegistry();
  const base = { ...fake.fakePoll.caps };
  let e1 = null; try { CH.validateCaps('x', { ...base, avatars: 'yes' }); } catch (e) { e1 = e; }
  let e2 = null; try { CH.validateCaps('x', { ...base, avatars: null }); } catch (e) { e2 = e; }
  ok(e1 && /caps\.avatars must be/.test(e1.message) && e2 && /avatarsWhy/.test(e2.message), 'a row that is neither fetch nor null throws; null without a why throws', `${e1 && e1.message} | ${e2 && e2.message}`);
  reg.register(fake.fakePoll);
  const a = reg.create(fake.fakePoll.kind, { id: 'f1' }, { now: () => NOW });
  ok(typeof a.avatarImage === 'function', 'the fake (fetch row) implements avatarImage');
  const g = reg.register(gmail.adapter || gmail) && reg.create('gmail', { id: 'g1' }, { now: () => NOW, tokens: { read: () => ({ token: null }) }, resolveIntegration: () => ({ source: 'none', values: {}, missing: [] }) });
  let e3 = null; try { await g.avatarImage('x@y.example'); } catch (e) { e3 = e; }
  ok(e3 && e3.code === 'not-supported', 'an undeclared row: calling avatarImage throws not-supported', e3 && e3.code);
  ok(CH.METHOD_GATES.avatarImage({ avatars: 'fetch' }) === true && CH.METHOD_GATES.avatarImage({ avatars: null }) === false, 'METHOD_GATES.avatarImage reads the row');
}

console.log('③ vendor-shape fixtures (invented, real-shaped — peer bytes through ONE bounded reader)');
{
  const L = (avatar) => lark.avatarUrlOf({ user: { open_id: 'ou_fixture_ada', name: 'Ada Fixture', avatar } });
  ok(L({ avatar_72: 'https://s1-imfile.feishucdn.com/static-resource/v1/v2_fixture~?image_size=72x72&cut_type=&quality=&format=png&sticker_format=.webp', avatar_240: 'https://s1-imfile.feishucdn.com/x' }).startsWith('https://s1-imfile.feishucdn.com/'), 'Lark: avatar.avatar_72 on a feishucdn host');
  ok(L({ avatar_72: 'https://evil.example/a.png' }) === '' && L({ avatar_72: 'http://s1-imfile.feishucdn.com/a' }) === '' && L({ avatar_72: 'https://u:p@s1-imfile.feishucdn.com/a' }) === '' && L({ avatar_72: 'https://feishucdn.com.evil.example/a' }) === '' && L(null) === '' && L({ avatar_72: 'x'.repeat(3000) }) === '', 'Lark: another host / http / credentials / a suffix trick / no avatar / an oversize string = no picture');
  const S = (profile) => slack.avatarUrlOf({ id: 'U0FIXADA', profile });
  ok(S({ is_custom_image: true, image_72: 'https://avatars.slack-edge.com/2026-01-01/1_fixture_72.png' }) !== '' && S({ is_custom_image: false, image_72: 'https://avatars.slack-edge.com/x_72.png' }) === '' && S({ image_72: 'https://secure.gravatar.com/avatar/abc.jpg?s=72&d=https%3A%2F%2Fa.slack-edge.com%2Fdf10d%2Fimg%2Favatars%2Fava_0001-72.png' }) === '', 'Slack: an uploaded profile.image_72 on avatars.slack-edge.com; the default (gravatar / is_custom_image false) = no picture');
}

console.log('④ the adapters\' calls under a stub vendor');
{
  const mkTokens = (scopes) => { const st = { token: { access_token: 'u-x', expiresAt: NOW + 7200e3, refresh_token: 'r', refreshExpiresAt: NOW + 30 * 86400e3, scopes, openId: 'ou_self' } }; return { st, read: () => ({ token: st.token }), write: async (t) => { st.token = t; }, clear: async () => {} }; };
  const CRED = { source: 'user', values: { appId: 'cli_fixture0001', appSecret: 'fixture-secret-0001' }, missing: [], why: null };
  const run = async (scopes, bytes) => {
    const log = [];
    const fetchFn = async (url, o = {}) => {
      log.push({ ev: 'send', url: String(url), auth: !!(o.headers && (o.headers.Authorization || o.headers.authorization)) });
      if (/contact\/v3\/users/.test(url)) return new Response(JSON.stringify({ code: 0, data: { user: { open_id: 'ou_fixture_ada', name: 'Ada', avatar: { avatar_72: 'https://s1-imfile.feishucdn.com/static-resource/v1/fixture~?image_size=72x72' } } } }), { headers: { 'content-type': 'application/json' } });
      return new Response(bytes, { headers: { 'content-type': 'image/png' } });
    };
    const reg = CH.createChannelRegistry(); reg.register(lark.adapter);
    const a = reg.create('lark', { id: 'lark' }, { now: () => NOW, fetch: fetchFn, tokens: mkTokens(scopes), resolveIntegration: () => CRED, log: { warn() {} }, pace: async (n) => { log.push({ ev: 'pace', n }); }, meter: (n) => { log.push({ ev: 'meter', n }); } });
    let r = null, err = null;
    try { r = await a.avatarImage('ou_fixture_ada'); } catch (e) { err = e; }
    return { log, r, err };
  };
  const good = await run(['contact:contact.base:readonly'], PNG);
  const sends = good.log.filter((x) => x.ev === 'send');
  ok(good.r && Buffer.isBuffer(good.r.data) && good.r.data.equals(PNG) && sends.length === 2, 'Lark: ONE profile read + the bytes = two requests', JSON.stringify(sends));
  ok(good.log.every((x, i) => x.ev !== 'send' || (good.log[i - 2] && good.log[i - 2].ev === 'pace' && good.log[i - 1].ev === 'meter')), 'Lark: every request is paced, then metered, right before it is sent');
  ok(!sends[1].auth && /feishucdn\.com/.test(sends[1].url), 'Lark: the picture host gets NO bearer');
  const noScope = await run(['im:message'], PNG);
  ok(noScope.err && noScope.err.code === 'forbidden' && noScope.err.detail.why === 'scope' && /contact:contact\.base:readonly/.test(noScope.err.message) && !noScope.log.some((x) => x.ev === 'send'), 'Lark: a token without the people scope is refused BY NAME, before any request');
  const big = await run(['contact:contact.base:readonly'], Buffer.alloc(Av.AVATAR_MAX_BYTES + 10, 1));
  ok(big.err && big.err.code === 'too-large', 'Lark: bytes past 256 KiB are refused while reading', big.err && big.err.code);
}

console.log('⑤ the route + the engine order (a census of the source) and patched copies');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const census = (engineSrc, routesSrc, larkSrc) => {
  const E = strip(engineSrc), R = strip(routesSrc), Lk = strip(larkSrc);
  const at = E.indexOf('async function avatarImage('), body = at < 0 ? '' : E.slice(at, E.indexOf('\n  }\n', at));
  const p = (s) => body.indexOf(s);
  const rAt = R.indexOf("router.get('/api/channels/avatar'"), route = rAt < 0 ? '' : R.slice(rAt, R.indexOf('\n});', rAt));
  const la = Lk.indexOf('async avatarImage('), lbody = la < 0 ? '' : Lk.slice(la, Lk.indexOf('\n    },', la));
  return [
    ['ENGINE: memo → verdict → ours-only → the budget verdict → ONE metered call', p('store.avatarGet(') > 0 && p('Att.fetchVerdict({ cached: f.cached') > p('store.avatarGet(') && p('authorIsOurs(') > p('Att.fetchVerdict({ cached: f.cached') && p('affordable: affordable(rec, e)') > p('authorIsOurs(') && p("case 'fetch': break;") > p('affordable: affordable(rec, e)') && p('vendor(rec, e, () => e.adapter.avatarImage(') > p("case 'fetch': break;") && body.split('.avatarImage(').length === 2],
    ['ENGINE: the bytes are bounded and SNIFFED before they are kept', p('Av.sniffImage(data)') > 0 && p('Av.AVATAR_MAX_BYTES') > 0 && p('store.avatarPut(') > p('Av.sniffImage(data)')],
    ['ROUTE: serves OUR cached file only (a stream of r.file), private max-age=86400, nosniff, ≤ 256 KiB — never a vendor URL or a redirect', /engine\(\)\.avatarImage\(/.test(route) && /fs\.createReadStream\(r\.file\)/.test(route) && /private, max-age=86400/.test(route) && /nosniff/.test(route) && /st\.size > AVATAR_MAX_BYTES/.test(route) && !/redirect|\.url\b|fetch\(/.test(route)],
    ['LARK: the bytes request is paced + metered right above it and marked gated-inline', /await pace\(1\);\s*meter\(1\);\s*let r;\s*try \{ r = await fetchFn\(url/.test(lbody)],
  ];
};
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf-8');
const engineSrc = read('src/server/channels-engine.js'), routesSrc = read('src/routes/channels.js'), larkSrc = read('src/channels/lark.js');
for (const [n, p] of census(engineSrc, routesSrc, larkSrc)) ok(p, n);
ok(/avatarImage\(author\) \{[\s\S]{0,1400}await pace\(1\);\s*meter\(1\);\s*let r;\s*try \{ r = await fetchFn\(url, \{ redirect: 'error'/.test(read('src/channels/slack.js')), 'SLACK: the bytes request is paced + metered, no redirect followed');
{
  const reds = (rows) => rows.filter(([, p]) => !p).map(([n]) => n);
  const rawRoute = routesSrc.replace("const rs = fs.createReadStream(r.file);", "return res.redirect(r.meta.url); const rs = fs.createReadStream(r.file);");
  ok(rawRoute !== routesSrc && reds(census(engineSrc, rawRoute, larkSrc)).some((n) => /^ROUTE/.test(n)), 'CONTROL: a copy of the route that serves the vendor URL raw is RED');
  const unpaced = larkSrc.replace("      await pace(1);\n      meter(1);\n      let r;\n      try { r = await fetchFn(url,", "      meter(1);\n      let r;\n      try { r = await fetchFn(url,");
  ok(unpaced !== larkSrc && reds(census(engineSrc, routesSrc, unpaced)).some((n) => /^LARK/.test(n)), 'CONTROL: a copy of the Lark adapter fetching the bytes without the pace is RED');
  const noBudget = engineSrc.replace("backoff: inBackoff(e) || (Number(e.attBackoffUntil) || 0) > t, affordable: affordable(rec, e) });\n    switch (v.act) {\n      case 'join': return avatarFlights", "backoff: inBackoff(e) || (Number(e.attBackoffUntil) || 0) > t });\n    switch (v.act) {\n      case 'join': return avatarFlights");
  ok(noBudget !== engineSrc && reds(census(noBudget, routesSrc, larkSrc)).some((n) => /^ENGINE/.test(n)), 'CONTROL: a copy of the engine that skips the budget is RED');
}
console.log(fail ? `\nFAILED ${fail} (passed ${pass})` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
