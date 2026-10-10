#!/usr/bin/env node
// test-webhook-auth — THE WEBHOOK INBOUND DOOR'S ORDER (lane webhook-l1-server, docs/design-webhook.zh.md §4 / §10 fences
// 2-4). §1 every step of src/webhook-auth.js as a leg beside its RED control; §2 the bounded memos fail CLOSED and count;
// §3 the REAL route (src/routes/webhook.js) on an in-process loopback server over a stub engine: a 300 KB request with a
// bad token reads 0 body bytes and leaves req.body undefined, 401 / 405 / 429 are one answer whatever the cause, the
// receipt carries nothing internal, 200 only after the engine said `persisted`. Fast, no vendor, no network beyond
// loopback. Run: node scripts/test-webhook-auth.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const A = require('../src/webhook-auth.js');
const PT = require('../src/pairing-token.js');
const WH = require('../src/channels/webhook.js');
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600) : '')); } };
const J = JSON.stringify;
const hmacHex = (k, t) => crypto.createHmac('sha256', k).update(t).digest('hex');
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

console.log('§1 every step, in order, each with its RED control');
ok(J(A.STEPS) === J(['method', 'ip', 'slug', 'caller', 'auth', 'length', 'read', 'signature', 'replay', 'idempotency', 'rate', 'parse']), 'the twelve steps in the design\'s order ①–⑫');
ok(['GET', 'PUT', 'DELETE', 'PATCH', 'HEAD'].every((m) => A.verdict('method', { method: m }).answer === 'method-not-allowed') && A.verdict('method', { method: 'POST' }).ok, '① any method but POST ⇒ 405 (control: POST passes)');
ok(['groups', 'side', 'Has_Caps', '-lead', 'x'.repeat(64), ''].every((s) => A.verdict('slug', { slug: s }).miss === true) && A.verdict('slug', { slug: 'ci-deploy' }).miss === undefined, '③ a malformed / reserved slug is a MISS (it never answers by itself) — control: a good slug is no miss');
const BEAR = PT.mintToken('webhook'), HM = PT.mintToken('webhook');
const callers = [{ id: 'c-0000000a', name: 'A', auth: 'bearer', tokenHash: PT.tokenHash(BEAR) }, { id: 'c-0000000b', name: 'B', auth: 'hmac' }, { id: 'c-0000000c', name: 'C', auth: 'bearer', tokenHash: PT.tokenHash(PT.mintToken('webhook')), revokedAt: 5 }];
const cv = (p, remote = '10.0.0.9') => A.verdict('caller', { path: p, callers, remote }).callers.map((c) => c.id);
ok(J(cv(null)) === '[]' && J(cv({ disabled: true })) === '[]' && J(A.verdict('caller', { path: {}, callers: [] }).callers) === '[]' && J(cv({ ipAllow: ['10.0.0.1'] })) === '[]', '④ an unknown slug, a disabled path, a path with no caller and an address outside the allow-list are ALL "no callers"');
ok(J(cv({})) === J(['c-0000000a', 'c-0000000b']) && J(cv({ ipAllow: ['10.0.0.9'] }, '::ffff:10.0.0.9')) === J(['c-0000000a', 'c-0000000b']), '④ control: a live path answers its live callers (a revoked one never), the allow-list judged on the socket address');
let calls = 0;
const tm = (t, h) => { calls++; return PT.tokenMatches(t, h); };
const auth = (o) => { calls = 0; const v = A.verdict('auth', { now: 1e12, ...o }, { tokenMatches: tm, dummyHash: PT.tokenHash('dummy') }); return { v, calls }; };
const live = cv({}).map((id) => callers.find((c) => c.id === id));
const hit = auth({ bearer: BEAR, callers: live }), miss = auth({ bearer: PT.mintToken('webhook'), callers: live }), none = auth({ bearer: BEAR, callers: [] });
ok(hit.v.ok && hit.v.caller.id === 'c-0000000a' && miss.v.answer === 'unauthorized' && none.v.answer === 'unauthorized', '⑤ Bearer: the right token is its caller; a wrong one and a path with no caller are 401');
ok(hit.calls === miss.calls && none.calls === 1, `⑤ SAME WORK: a hit and a miss compare against every bearer caller (${hit.calls} = ${miss.calls}); no caller still runs ONE dummy compare (${none.calls})`);
const ts = String(Math.floor(1e12 / 1000));
const hv = (o) => auth({ callers: live, headers: { 'x-webhook-caller': 'c-0000000b', 'x-webhook-timestamp': ts, 'x-webhook-signature': 'v1=' + 'a'.repeat(64), ...o } }).v;
ok(hv({}).ok && hv({}).scheme === 'hmac', '⑤ HMAC: the three headers whole and the timestamp fresh ⇒ the caller (the signature is judged at ⑧, after the read)');
ok(hv({ 'x-webhook-timestamp': String(Number(ts) - 301) }).answer === 'unauthorized' && hv({ 'x-webhook-signature': 'v0=xx' }).answer === 'unauthorized' && hv({ 'x-webhook-caller': 'c-0000000f' }).answer === 'unauthorized' && hv({ 'x-webhook-caller': 'c-0000000a' }).answer === 'unauthorized', '⑤ HMAC refusals: a stale timestamp (5 min + 1 s), a bad signature shape, an unknown caller, a bearer caller named as HMAC ⇒ 401');
ok(A.verdict('length', { contentLength: String(300 * 1024) }).answer === 'too-large' && A.verdict('length', { contentLength: String(A.BODY_MAX) }).ok && A.verdict('length', {}).ok, '⑥ Content-Length over 256 KB ⇒ 413 (control: exactly 256 KB and an absent length pass — the read is bounded too)');
ok(A.verdict('read', { body: Buffer.from('{"code":"vswh_' + '0'.repeat(48) + '"}') }).answer === 'unauthorized' && A.verdict('read', { body: Buffer.from('{"a":1}') }).ok, '⑦ a body carrying a vswh_ token is the SAME 401 (a pairing frame never lands) — control: a plain body passes');
const body = Buffer.from('{"text":"deploy done"}');
const sig = hmacHex(HM, A.signatureBase(ts, '/hook/ci', body));
const sv = (o) => A.verdict('signature', { scheme: 'hmac', token: HM, ts, sig, slug: 'ci', body, ...o }, { hmacHex, safeEqual });
ok(sv({}).ok && sv({ body: Buffer.from('{"text":"deploy done!"}') }).answer === 'unauthorized' && sv({ slug: 'other' }).answer === 'unauthorized' && sv({ token: PT.mintToken('webhook') }).answer === 'unauthorized', '⑧ v1 = HMAC(token, ts.POST./hook/<slug>.body) — a changed body, another path, another token ⇒ 401 (control: the true signature passes)');
ok(A.verdict('signature', { scheme: 'bearer' }, { hmacHex, safeEqual }).ok, '⑧ a Bearer caller has no signature step (the documented limit: no replay protection — the dialog says so)');
ok(A.eventIdOf('c-0000000a', 'k-1', 'f'.repeat(64)) === 'c-0000000a:k-1' && A.eventIdOf('c-0000000a', '', 'f'.repeat(64)) === 'c-0000000a:' + 'f'.repeat(32) && A.eventIdOf('c-0000000b', 'k-1', 'x') !== A.eventIdOf('c-0000000a', 'k-1', 'x'), '⑩ eventId = <callerId>:<Idempotency-Key>, else the body digest — always in the caller\'s namespace (two callers\' "k-1" never collide)');
ok(A.verdict('parse', { contentType: 'application/json', body: '{"a":1}' }).value.a === 1 && A.verdict('parse', { contentType: 'application/x-www-form-urlencoded', body: 'a=1&__proto__=x' }).value.a === '1' && A.verdict('parse', { contentType: 'text/plain', body: 'x' }).answer === 'unsupported-type' && A.verdict('parse', { contentType: 'application/json', body: '{' }).answer === 'bad-body', '⑫ JSON / a form parse (a __proto__ key never lands); text/plain ⇒ 415; broken JSON ⇒ 400');
ok(J(Object.keys(A.ANSWERS.unauthorized.body)) === J(['ok', 'error']) && A.ANSWERS.unauthorized.status === 401 && A.ANSWERS['rate-limited'].headers['Retry-After'] === '60', 'SAME SHAPE: 401 is one fixed body (no cause, no slug, no caller); the per-IP 429 one fixed Retry-After');
const rc = A.receiptOf({ receiptId: 'abcdef0123456789zz', slug: 'ci', mode: 'poll', pollUrl: '/api/channels/webhook/ci/replies' });
ok(J(Object.keys(rc)) === J(['ok', 'receiptId', 'path', 'reply']) && rc.receiptId.length === 16 && J(Object.keys(A.receiptOf({ receiptId: 'x', slug: 'ci', mode: 'none' }).reply)) === J(['mode']), 'the receipt: {ok, receiptId (16), path, reply} and NOTHING else (pollUrl only for a poll caller)');
ok(A.clientIp('10.1.1.1', '1.2.3.4, 5.6.7.8', 0) === '10.1.1.1' && A.clientIp('10.1.1.1', '1.2.3.4, 5.6.7.8', 1) === '5.6.7.8' && A.clientIp('10.1.1.1', '1.2.3.4, 5.6.7.8', 2) === '1.2.3.4', 'trustProxyHops: 0 = the socket (the default), N = the Nth X-Forwarded-For hop from the right');

console.log('§2 the bounded memos — overflow fails CLOSED and counts');
{
  const g = A.createIpGate({ perMin: 3, max: 2 });
  const r = [1, 2, 3, 4].map(() => g.allowed('1.1.1.1', 0));
  ok(J(r) === J([true, true, true, false]), '② the per-IP gate: the 4th of 3/min is refused');
  ok(g.allowed('2.2.2.2', 10) === true && g.allowed('3.3.3.3', 20) === false && g.stats.overflow === 1 && g.allowed('1.1.1.1', 30) === false, '② a FULL table of live windows refuses a NEW address (overflow counted) and never evicts a live one (1.1.1.1 still refused)');
  ok(g.allowed('3.3.3.3', 60001) === true, '② control: once a window expired, a new address is taken');
  const m = A.createCallerMemos();
  // int248 r2 (verify r1 #9): ⑨ / ⑩ only CHECK — the route commits an ACCEPTED call's signature and key
  ok(m.replay('c-0000000a', 's1', 0, 1).ok && (m.commit('c-0000000a', { sig: 's1' }, 0), m.replay('c-0000000a', 's1', 1, 1).why === 'replayed'), '⑨ a committed signature seen again ⇒ 401 (replayed)');
  for (let i = 2; i < 11; i++) m.commit('c-0000000a', { sig: 's' + i }, i);
  ok(m.sizes('c-0000000a').replay === 10 && m.replay('c-0000000a', 'sX', 50, 1).why === 'overflow' && m.stats.replayOverflow === 1 && m.replay('c-0000000a', 's1', 51, 1).why === 'replayed', '⑨ the memo holds rateLimit × 10; a full memo REFUSES (overflow counted) — the oldest signature is never evicted, so it can never be replayed');
  ok(m.replay('c-0000000a', 'sY', 10 * 60 * 1000 + 1, 1).ok, '⑨ control: past the 10-min window the old entries go and a new signature is taken');
  ok(m.idempotency('c-0000000b', 'k', 'sha1', 0, 1).ok && (m.commit('c-0000000b', { key: 'k', sha: 'sha1' }, 0), m.idempotency('c-0000000b', 'k', 'sha1', 1, 1).repeat === true) && m.idempotency('c-0000000b', 'k', 'sha2', 2, 1).answer === 'conflict', '⑩ the same key + the same body is a repeat; the same key + another body ⇒ 409');
  for (let i = 0; i < 9; i++) m.commit('c-0000000b', { key: 'k' + i, sha: 'x' }, 3 + i);
  ok(m.idempotency('c-0000000b', 'kz', 'x', 20, 1).why === 'overflow' && m.stats.idemOverflow === 1, '⑩ a full idempotency memo refuses (429, counted) — fail closed');
  const rr = []; for (let i = 0; i < 4; i++) rr.push(m.rate('c-0000000c', 1000, 3));
  ok(rr.slice(0, 3).every((x) => x.ok) && rr[3].answer === 'rate-limited' && rr[3].retryAfter >= 1 && m.rate('c-0000000c', 61001, 3).ok, '⑪ the caller\'s own rate: the 4th of 3/min ⇒ 429 + Retry-After; the next minute passes');
}

console.log('§3 the REAL route on loopback (a stub engine; the callers store is the real one)');
const dir = scratch('webhook-auth');
let clock = 1_800_000_000_000;
const events = [];
let persist = true;
const secrets = { seal: (v) => 'sealed:' + Buffer.from(v).toString('base64'), open: (v) => Buffer.from(String(v).slice(7), 'base64').toString() };
const OPTIONS = { rateLimit: 60, wakesPerHour: 6 };
const stubEngine = { secrets, store: { index: { peek: () => ({ options: OPTIONS }) } }, pushInbound: async (id, ev) => { events.push({ id, ev }); return persist ? { ok: true, persisted: true } : { ok: false, persisted: false }; } };
const R = require('../src/routes/webhook.js');
R.setup({ getEngine: () => stubEngine, dataDir: dir, now: () => clock, serverSetting: () => undefined });
const st = WH.callersStore(path.join(dir, 'channels', 'webhook'), { secrets, now: () => clock });
st.putPath('ci', { title: 'CI' }); st.putPath('quiet', { title: 'nobody' }); st.putPath('off', { title: 'off' }); st.putPath('off', { disabled: true });
const bear = st.register('ci', { name: 'deploy-bot', auth: 'bearer', delivery: { mode: 'poll' } });
const hm = st.register('ci', { name: 'monitor', auth: 'hmac', delivery: { mode: 'none' } });
st.register('off', { name: 'x', auth: 'bearer' });
const express = require('express');
const app = express();
app.use(R.router);
const srv = http.createServer(app);
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const call = (method, p, { headers = {}, body = null } = {}) => new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}), ...headers } }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b, ct: res.headers['content-type'], ra: res.headers['retry-after'] })); });
  req.on('error', (e) => resolve({ status: 0, err: e.code }));
  if (body) req.write(body);
  req.end();
});
const signed = (slug, b, tok = hm.token, id = hm.caller.id, extra = {}) => { const t = String(Math.floor(clock / 1000)); return { 'Content-Type': 'application/json', 'X-Webhook-Caller': id, 'X-Webhook-Timestamp': t, 'X-Webhook-Signature': 'v1=' + hmacHex(tok, A.signatureBase(t, '/hook/' + slug, b)), ...extra }; };
try {
  const before = R.stats().bodyReads;
  const big = '{"x":"' + 'a'.repeat(300 * 1024) + '"}';
  const r1 = await call('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + PT.mintToken('webhook'), 'Content-Type': 'application/json' }, body: big });
  ok(r1.status === 401 && R.stats().bodyReads === before && R.stats().last.step === 'auth' && R.stats().last.bodyDefined === false, `a 300 KB request with a bad token ⇒ 401 at ⑤, 0 bodies read (${R.stats().bodyReads - before}), req.body undefined`, R.stats());
  const r1b = await call('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + bear.token, 'Content-Type': 'application/json' }, body: big });
  ok(r1b.status === 413 && R.stats().bodyReads === before && R.stats().last.step === 'length', 'control: the RIGHT token with 300 KB is refused at ⑥ (413) — still 0 bodies read');
  const ok1 = await call('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + bear.token, 'Content-Type': 'application/json', 'Idempotency-Key': 'e-1' }, body: '{"text":"hello"}' });
  ok(ok1.status === 200 && R.stats().bodyReads === before + 1, 'control: a good call IS read (one body) and answered 200', ok1);
  const rcp = JSON.parse(ok1.body || '{}');
  ok(J(Object.keys(rcp)) === J(['ok', 'receiptId', 'path', 'reply']) && /^[0-9a-f]{16}$/.test(rcp.receiptId) && rcp.reply.mode === 'poll' && rcp.reply.pollUrl === '/api/channels/webhook/ci/replies' && !ok1.body.includes('webhook:ci') && !ok1.body.includes(bear.caller.id), 'the receipt carries nothing internal (no record id, no caller id, no count) — 16 hex', rcp);
  const ev = events[events.length - 1] && events[events.length - 1].ev;
  ok(ev && ev.kind === 'record' && ev.convId === 'ci' && ev.eventId === `${bear.caller.id}:e-1` && ev.record.author.id === `caller:${bear.caller.id}` && ev.record.author.name === 'deploy-bot' && ev.record.author.isBot === true && ev.record.author.external === true, 'the engine door got {convId, eventId = <caller>:<key>, record} — the author is the REGISTERED caller');
  // SAME SHAPE 401: an unknown slug, a disabled path, a path with no caller, a wrong token, a malformed slug
  const shapes = [];
  for (const [p, tok] of [['/hook/nope', bear.token], ['/hook/off', bear.token], ['/hook/quiet', bear.token], ['/hook/ci', PT.mintToken('webhook')], ['/hook/groups', bear.token]]) shapes.push(await call('POST', p, { headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: '{"a":1}' }));
  ok(shapes.every((x) => x.status === 401 && x.body === shapes[0].body && x.ct === shapes[0].ct), 'SAME 401: an unknown slug, a disabled path, a path with no caller, a wrong token, a reserved slug — one status, one body', shapes.map((x) => x.status + ' ' + x.body));
  const g1 = await call('GET', '/hook/ci'), g2 = await call('GET', '/hook/no-such-path'), g3 = await call('PUT', '/hook/ci', { body: 'x' });
  ok([g1, g2, g3].every((x) => x.status === 405 && x.body === g1.body), 'SAME 405 for any slug on a non-POST (known, unknown, PUT)');
  const vs = await call('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + bear.token, 'Content-Type': 'application/json' }, body: '{"code":"vswh_' + '1'.repeat(48) + '"}' });
  ok(vs.status === 401 && vs.body === shapes[0].body && R.stats().last.step === 'read', 'a body carrying a vswh_ token ⇒ the SAME 401 (refused at ⑦, nothing delivered)');
  const hb = '{"text":"disk 91%","host":"db1"}';
  const h1 = await call('POST', '/hook/ci', { headers: signed('ci', hb), body: hb });
  const h2 = await call('POST', '/hook/ci', { headers: signed('ci', hb), body: hb });
  ok(h1.status === 200 && h2.status === 401 && h2.body === shapes[0].body, '⑨ an HMAC call replayed within the window ⇒ the SAME 401 (control: the first one is 200)', [h1.status, h2.status]);
  const tamper = { ...signed('ci', hb) };
  const h3 = await call('POST', '/hook/ci', { headers: tamper, body: hb.replace('91', '99') });
  ok(h3.status === 401 && R.stats().last.step === 'signature', '⑧ a body changed after signing ⇒ 401 at the signature step');
  clock += 1000;
  const k1 = await call('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + bear.token, 'Content-Type': 'application/json', 'Idempotency-Key': 'dup' }, body: '{"n":1}' });
  const k2 = await call('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + bear.token, 'Content-Type': 'application/json', 'Idempotency-Key': 'dup' }, body: '{"n":2}' });
  ok(k1.status === 200 && k2.status === 409, '⑩ one Idempotency-Key, another body ⇒ 409', [k1.status, k2.status]);
  const tp = await call('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + bear.token, 'Content-Type': 'text/plain' }, body: 'hi' });
  ok(tp.status === 415, '⑫ text/plain ⇒ 415 (after auth — an unauthenticated caller learns nothing about types)');
  persist = false;
  const np = await call('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + bear.token, 'Content-Type': 'application/json', 'Idempotency-Key': 'np' }, body: '{"n":3}' });
  persist = true;
  ok(np.status === 503 && !np.body.includes('receiptId'), '200 ONLY after persisted: an engine that did not store it ⇒ 503, no receipt');
  // ② the per-IP gate: 30 / min from one address, the SAME 429 for a known and an unknown slug
  clock += 61_000;
  const flood = [];
  for (let i = 0; i < 31; i++) flood.push(await call('POST', i % 2 ? '/hook/ci' : '/hook/nope', { headers: { Authorization: 'Bearer x' }, body: '{}' }));
  const after = [await call('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + bear.token, 'Content-Type': 'application/json' }, body: '{}' }), await call('POST', '/hook/nope', { body: '{}' })];
  ok(flood.slice(0, 30).every((x) => x.status === 401) && flood[30].status === 429 && after.every((x) => x.status === 429 && x.body === flood[30].body && x.ra === '60'), '② the 31st call a minute from one address ⇒ 429 — the SAME answer for a known slug with a GOOD token and an unknown slug');
  // the OWNER's verbs refuse an agent's bearer by name (an auth-off instance: no cookie gate stands before them)
  const AGB = { Authorization: 'Bearer vsst_' + 'a'.repeat(32) }, JBB = { Authorization: 'Bearer jbt_' + 'b'.repeat(24) };
  const ow = [['GET', '/api/channels/webhook/paths', null], ['POST', '/api/channels/webhook/paths', '{"slug":"evil"}'], ['PUT', '/api/channels/webhook/paths/ci', '{"title":"x"}'], ['POST', '/api/channels/webhook/paths/ci/callers', '{"name":"mine"}'], ['POST', `/api/channels/webhook/paths/ci/callers/${bear.caller.id}/rotate`, '{}'], ['POST', `/api/channels/webhook/paths/ci/callers/${bear.caller.id}/revoke`, '{}'], ['POST', `/api/channels/webhook/paths/ci/callers/${bear.caller.id}/delivery`, '{"delivery":{"mode":"none"}}']];
  const owr = [];
  for (const [m, p, b] of ow) for (const h of [AGB, JBB]) owr.push(await call(m, p, { headers: { ...h, 'Content-Type': 'application/json' }, body: b }));
  ok(owr.every((x) => x.status === 403 && JSON.parse(x.body).code === 'agent-forbidden') && st.caller('ci', bear.caller.id) && !st.caller('ci', bear.caller.id).revokedAt && st.paths().length === 3, `every owner verb (${ow.length}) × a vsst_ / jbt_ bearer ⇒ 403 agent-forbidden; nothing changed`, owr.map((x) => x.status));
} catch (e) { fail++; console.error('  ✗ threw:', e.stack || e.message); }
finally { srv.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch { } }
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
