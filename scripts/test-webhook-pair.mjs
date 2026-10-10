#!/usr/bin/env node
// test-webhook-pair — THE INSTANCE PAIRING (lane webhook-l3-cli-pair; docs/design-webhook.zh.md §12, fence 7 of §10).
// §1 PURE src/webhook-pair.js: the code (round trip, malformed, 10-minute expiry), the hook URL verdict (https unless
// allowPrivate), the completion verdict step by step, `complete` = the verdict BEFORE the one write (CONTROL: a mutant that
// writes first ⇒ a refused frame writes — RED), the bounded pending memo, the canonical peer payload.
// §2 TWO INSTANCES in-process (two real engines, two copies of the real routes, each on its own loopback port): A mints a
// code, B joins ⇒ a `peer` caller on each side; the code a second time ⇒ refused, nothing changes; an expired code ⇒
// refused on both sides; http refused without allowPrivateReplyUrl; a completion frame POSTed to /hook ⇒ 401 and msgs/
// unchanged; a peer call ⇒ a record by the registered peer; A → B lands as a record; re-pairing rotates both rows IN
// PLACE and the old tokens are refused; an agent bearer on the owner verbs ⇒ 403. Run: node scripts/test-webhook-pair.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import Module, { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600) : '')); } };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const WP = require('../src/webhook-pair.js');
const WA = require('../src/webhook-auth.js');
const PT = require('../src/pairing-token.js');
const ENG = require('../src/server/channels-engine.js');
const express = require('express');
const hmacHex = (k, t) => crypto.createHmac('sha256', String(k)).update(String(t)).digest('hex');
const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

console.log('§1 PURE src/webhook-pair.js');
const NOW = 1_800_000_000_000;
const TA = PT.mintToken('webhook'), TB = PT.mintToken('webhook');
const nonce = crypto.randomBytes(16).toString('hex');
const code = WP.encodeCode({ hook: 'https://a.example/hook/ci', caller: 'c-0a0a0a0a', token: TA, nonce, exp: NOW + WP.CODE_TTL_MS, name: 'Hub A' });
const dc = WP.decodeCode(code, NOW);
ok(code.startsWith('vswp_') && !code.includes('vswh_') && dc.ok && dc.token === TA && dc.caller === 'c-0a0a0a0a' && dc.nonce === nonce && dc.name === 'Hub A' && WP.CODE_TTL_MS === 600000, 'a code is vswp_ + base64url, round-trips, lives 10 minutes');
ok(WP.decodeCode(code.slice(0, -4), NOW).why === 'bad-code' && WP.decodeCode('vswh_' + 'a'.repeat(48), NOW).why === 'bad-code' && WP.decodeCode(code, NOW + WP.CODE_TTL_MS + 1).why === 'expired', 'a mangled code / a token pasted as a code ⇒ bad-code; one past its 10 minutes ⇒ expired');
const hv = WP.hookUrlVerdict('https://x.io/vs/hook/ci');
ok(hv.ok && hv.pairUrl === 'https://x.io/vs/api/channels/webhook/ci/pair' && WP.hookUrlVerdict('http://127.0.0.1:9/hook/ci').why === 'https-required' && WP.hookUrlVerdict('http://127.0.0.1:9/hook/ci', { allowPrivate: true }).ok
  && !WP.hookUrlVerdict('https://u:p@x.io/hook/ci').ok && !WP.hookUrlVerdict('https://x.io/hook/ci?t=1').ok && !WP.hookUrlVerdict('https://x.io/api/x').ok && !WP.hookUrlVerdict('https://x.io/hook/Bad_Slug').ok, 'the hook URL: https (http only with allowPrivate), no credentials / query, ends in /hook/<slug> (a prefix kept in the pair URL)');
const pend = { slug: 'ci', callerId: 'c-0a0a0a0a', token: TA, nonce, exp: NOW + WP.CODE_TTL_MS, spent: false };
const frame = (o = {}) => WP.frameOf({ nonce, hookUrl: 'https://b.example/hook/side-a', caller: 'c-0b0b0b0b', token: TB, name: 'Hub B', ...o });
const heads = (body, o = {}) => ({ ...Object.fromEntries(Object.entries(WP.frameHeaders({ slug: 'ci', callerId: 'c-0a0a0a0a', token: TA, body, now: NOW }, { hmacHex })).map(([k, v]) => [k.toLowerCase(), v])), ...o });
const V = (o = {}) => { const body = o.body !== undefined ? o.body : frame(); return WP.completionVerdict({ slug: 'ci', headers: o.headers || heads(body), body, now: o.now || NOW, pending: o.pending === undefined ? pend : o.pending, allowPrivate: o.allowPrivate === true }, { hmacHex, safeEqual }); };
const good = V();
ok(good.ok && good.frame.caller === 'c-0b0b0b0b' && good.frame.token === TB && good.frame.hookUrl === 'https://b.example/hook/side-a' && good.frame.name === 'Hub B', 'a frame signed with the code\'s token, its nonce, an https hook ⇒ the verdict holds');
const fb = frame();
const legs = [
  ['no pending code', V({ pending: null }), 'unknown'],
  ['a code of another path', V({ pending: { ...pend, slug: 'other' } }), 'unknown'],
  ['another caller id in X-Webhook-Caller', V({ headers: heads(fb, { 'x-webhook-caller': 'c-0c0c0c0c' }) }), 'unknown'],
  ['a spent code', V({ pending: { ...pend, spent: true } }), 'spent'],
  ['an expired code', V({ now: NOW + WP.CODE_TTL_MS + 1, headers: heads(fb, { 'x-webhook-timestamp': String(Math.floor((NOW + WP.CODE_TTL_MS + 1) / 1000)) }) }), 'expired'],
  ['a stale timestamp', V({ headers: heads(fb, { 'x-webhook-timestamp': String(Math.floor(NOW / 1000) - 900) }) }), 'stale'],
  ['a signature by another token', V({ headers: heads(fb, { 'x-webhook-signature': 'v1=' + hmacHex(TB, WA.signatureBase(String(Math.floor(NOW / 1000)), '/api/channels/webhook/ci/pair', fb)) }) }), 'signature'],
  ['a signature over /hook/ci (not the pair path)', V({ headers: heads(fb, { 'x-webhook-signature': 'v1=' + hmacHex(TA, WA.signatureBase(String(Math.floor(NOW / 1000)), '/hook/ci', fb)) }) }), 'signature'],
];
for (const [n, v, why] of legs) ok(!v.ok && v.answer === 'unauthorized' && v.why === why, `${n} ⇒ the same-shape 401 (${why})`, v);
const fn = frame({ nonce: 'f'.repeat(32) });
ok(V({ body: fn, headers: heads(fn) }).why === 'nonce', 'a signed frame with another nonce ⇒ 401 (nonce)');
const fh = frame({ hookUrl: 'http://b.example/hook/side-a' });
ok(V({ body: fh, headers: heads(fh) }).why === 'https-required' && V({ body: fh, headers: heads(fh), allowPrivate: true }).ok, 'a signed frame naming an http hook ⇒ 400 https-required (ok with allowPrivateReplyUrl)');
const ft = frame({ token: 'vsdt_' + 'a'.repeat(36) });
ok(V({ body: ft, headers: heads(ft) }).why === 'bad-frame', 'a signed frame whose token is not a vswh_ token ⇒ 400 bad-frame');
// THE ORDER: the verdict before the one write — CONTROL: a mutant that writes first
const writes = [];
const runComplete = (mod, o) => mod.complete({ slug: 'ci', headers: heads(o), body: o, now: NOW, pending: { ...pend, nonce: 'e'.repeat(32) }, allowPrivate: false }, { hmacHex, safeEqual, write: (f) => writes.push(f) });
const refusedReal = runComplete(WP, fb);
const realWrites = writes.length;
const okReal = WP.complete({ slug: 'ci', headers: heads(fb), body: fb, now: NOW, pending: pend }, { hmacHex, safeEqual, write: (f) => writes.push(f) });
ok(!refusedReal.ok && realWrites === 0 && okReal.ok && writes.length === 1, 'complete(): a refused frame writes NOTHING; a good one writes once');
const src = fs.readFileSync(path.join(repo, 'src/webhook-pair.js'), 'utf-8');
const MUT_FROM = '  const v = completionVerdict(input, deps);\n  if (!v.ok) return v;\n  deps.write(v.frame);';
const MUT_TO = '  deps.write(input.body);\n  const v = completionVerdict(input, deps);\n  if (!v.ok) return v;';
const mm = new Module(path.join(repo, 'src', 'webhook-pair.mutant.js'));
mm.filename = path.join(repo, 'src', 'webhook-pair.mutant.js'); mm.paths = Module._nodeModulePaths(path.join(repo, 'src'));
mm._compile(src.replace(MUT_FROM, MUT_TO), mm.filename);
writes.length = 0;
runComplete(mm.exports, fb);
ok(src.includes(MUT_FROM) && writes.length === 1, 'CONTROL: a mutant complete() that writes before the verdict writes on a REFUSED frame — the leg above turns RED');
const pm = WP.createPending({ max: 2 });
pm.put({ slug: 'ci', callerId: 'c-00000001', token: TA, nonce }, NOW); pm.put({ slug: 'ci', callerId: 'c-00000002', token: TA, nonce }, NOW); pm.put({ slug: 'ci', callerId: 'c-00000003', token: TA, nonce }, NOW);
ok(pm.size() === 2 && !pm.get('ci', 'c-00000001', NOW) && pm.get('ci', 'c-00000003', NOW) && !pm.get('ci', 'c-00000003', NOW + WP.CODE_TTL_MS + 1), 'the pending memo is bounded (oldest out) and forgets a code past its 10 minutes');
pm.put({ slug: 'ci', callerId: 'c-00000004', token: TA, nonce }, NOW); pm.spend('ci', 'c-00000004');
ok(!pm.get('ci', 'c-00000004', NOW), 'a spent code is gone (single use)');
const pv = WP.peerRecordValue({ text: 'build 12 ready', threadKey: 't-1', inReplyTo: 'r-9', attachments: [{ name: 'log.txt', url: 'https://b.example/f/log.txt', sha256: 'ab' }, { name: 'x', url: 'javascript:alert(1)' }], from: { name: 'Hub B' } });
ok(pv.text === 'build 12 ready\nlog.txt: https://b.example/f/log.txt' && pv.from.name === 'Hub B' && pv.threadKey === 't-1' && pv.inReplyTo === 'r-9', 'the canonical peer payload: text + each attachment as a LINK line (a javascript: URL dropped), from.name, threadKey, inReplyTo');
ok(JSON.stringify(Object.keys(JSON.parse(WP.peerBody({ text: 'x', name: 'A' })))) === JSON.stringify(['text', 'threadKey', 'inReplyTo', 'attachments', 'from']) && WP.PEER_HEADER === 'x-vibespace-peer-version' && WP.PEER_VERSION === '1', 'what a side POSTs to a peer is the same canonical shape, with X-VibeSpace-Peer-Version: 1');

console.log('§2 two instances in-process (real engines, real routes, loopback)');
const routePath = require.resolve('../src/routes/webhook.js');
async function instance(tag, settings) {
  const dataDir = scratch('webhook-pair-' + tag);
  let skew = 0;
  const now = () => Date.now() + skew;
  delete require.cache[routePath];
  const R = require(routePath);
  const eng = ENG.create({ dataDir, env: {}, broadcast: () => {}, log: { log() {}, warn() {}, error() {} }, deliver: { async deliverToConversation() { return { ok: true, lane: 'message' }; }, stashFor() {} }, serverSetting: (k) => settings[k], liveSessions: () => [], httpInbound: true });
  R.setup({ getEngine: () => eng, dataDir, serverSetting: (k) => settings[k], now });
  const app = express(); app.use(R.router);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  app.locals.instancePublicUrl = `http://127.0.0.1:${port}`;
  const call = (method, p, { headers = {}, body = null } = {}) => new Promise((resolve) => {
    const b = body === null ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...(b !== null ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(b)) } : {}), ...headers } }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { } resolve({ status: res.statusCode, t, j }); }); });
    req.on('error', (e) => resolve({ status: 0, t: String(e.code), j: null }));
    if (b !== null) req.write(b); req.end();
  });
  const callers = (slug) => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'channels', 'webhook', 'callers.json'), 'utf-8')).paths[slug].callers; } catch { return []; } };
  return { tag, dataDir, eng, R, app, srv, port, call, callers, settings, skew: (ms) => { skew = ms; }, stop() { try { eng.stop && eng.stop(); } catch { } srv.close(); try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { } } };
}
const A = await instance('a', { 'channels.pushCoalesceSeconds': 0, 'webhook.allowPrivateReplyUrl': true });
const B = await instance('b', { 'channels.pushCoalesceSeconds': 0, 'webhook.allowPrivateReplyUrl': true });
const msgsOf = (I) => { const d = path.join(I.dataDir, 'channels', 'msgs', 'webhook'); try { return fs.readdirSync(d).map((f) => f + ':' + fs.statSync(path.join(d, f)).size).sort().join(','); } catch { return ''; } };
try {
  const mkA = await A.call('POST', '/api/channels/webhook/paths', { body: { slug: 'ci', title: 'CI' } });
  ok(mkA.status === 200, 'FIXTURE: A has path ci');
  const agentMint = await A.call('POST', '/api/channels/webhook/paths/ci/pair-code', { headers: { Authorization: 'Bearer vsst_' + 'a'.repeat(30) }, body: {} });
  const agentJoin = await B.call('POST', '/api/channels/webhook/join', { headers: { Authorization: 'Bearer jbt_' + 'b'.repeat(30) }, body: { code: 'x' } });
  ok(agentMint.status === 403 && agentJoin.status === 403 && agentMint.j.code === 'agent-forbidden' && /vibespace-ask/.test(agentMint.j.error), 'an agent bearer on pair-code / join ⇒ 403 agent-forbidden, the words point at vibespace-ask', [agentMint.status, agentJoin.status]);
  const c1 = await A.call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: { name: 'Hub A' } });
  ok(c1.status === 200 && c1.j.shownOnce === true && c1.j.code.startsWith('vswp_') && /^c-[0-9a-f]{8}$/.test(c1.j.callerId) && c1.j.expiresAt - Date.now() <= WP.CODE_TTL_MS && A.callers('ci').length === 0, 'A mints ONE code (shown once, 10 min) — nothing is written on A yet', c1.t.slice(0, 200));
  const j1 = await B.call('POST', '/api/channels/webhook/join', { body: { code: c1.j.code, slug: 'side-a', name: 'Hub B' } });
  const aRow = A.callers('ci')[0] || {}, bRow = B.callers('side-a')[0] || {};
  ok(j1.status === 200 && aRow.id === c1.j.callerId && aRow.kind === 'peer' && aRow.name === 'Hub B' && aRow.delivery.mode === 'reply-url' && aRow.delivery.replyUrl === `http://127.0.0.1:${B.port}/hook/side-a` && aRow.outCaller === bRow.id && aRow.generation === 1, 'B joins ⇒ A stores B as a `peer` caller (delivery reply-url = B\'s hook URL, generation 1)', { j1: j1.t.slice(0, 200), aRow });
  ok(bRow.kind === 'peer' && bRow.name === 'Hub A' && bRow.delivery.replyUrl === `http://127.0.0.1:${A.port}/hook/ci` && bRow.outCaller === aRow.id && !JSON.stringify(j1.j).match(/vsw[hp]_/), 'B made path side-a + a `peer` caller for A (A\'s hook URL); the join answer carries no token');
  const TAB = A.eng.secrets.open(aRow.tokenEnc), TBA = B.eng.secrets.open(bRow.tokenEnc);
  const again = await B.call('POST', '/api/channels/webhook/join', { body: { code: c1.j.code, slug: 'side-a2' } });
  ok(again.status === 502 && again.j.code === 'pair-refused' && /HTTP 401/.test(again.j.error) && !B.callers('side-a2').length && A.callers('ci').length === 1 && A.callers('ci')[0].generation === 1, 'the SAME code a second time ⇒ A answers 401 (spent), B writes nothing, A unchanged', again.t.slice(0, 200));
  const fr = WP.frameOf({ nonce: WP.decodeCode(c1.j.code, Date.now()).nonce, hookUrl: `http://127.0.0.1:${B.port}/hook/x`, caller: 'c-0d0d0d0d', token: PT.mintToken('webhook'), name: 'thief' });
  const replay = await A.call('POST', '/api/channels/webhook/ci/pair', { headers: WP.frameHeaders({ slug: 'ci', callerId: c1.j.callerId, token: TAB, body: fr, now: Date.now() }, { hmacHex }), body: fr });
  ok(replay.status === 401 && JSON.stringify(replay.j) === JSON.stringify(WA.ANSWERS.unauthorized.body) && A.callers('ci').length === 1, 'a fresh frame signed with the spent code\'s token ⇒ the same-shape 401');
  // a completion frame POSTed to /hook ⇒ 401 and NO record (the frame carries a vswh_ token)
  const before = msgsOf(A);
  const hookHit = await A.call('POST', '/hook/ci', { headers: { ...signedHook('ci', fr, TAB, aRow.id) }, body: fr });
  ok(hookHit.status === 401 && JSON.stringify(hookHit.j) === JSON.stringify(WA.ANSWERS.unauthorized.body) && msgsOf(A) === before, 'a completion frame POSTed to /hook/ci (signed by the live peer) ⇒ the same-shape 401, msgs/ unchanged', [hookHit.status, before, msgsOf(A)]);
  // a peer call ⇒ a record by the registered peer; the payload mapped without configuration
  const pb = WP.peerBody({ text: 'B says hi', threadKey: 'th-1', name: 'spoofed name' });
  const pc = await A.call('POST', '/hook/ci', { headers: { ...signedHook('ci', pb, TAB, aRow.id), 'X-VibeSpace-Peer-Version': '1' }, body: pb });
  const recA = A.eng.store.readTail('webhook', 'ci', { limit: 5 }).find((r) => r.text === 'B says hi');
  ok(pc.status === 200 && recA && recA.author.id === `caller:${aRow.id}` && recA.author.name === 'Hub B' && recA.threadKey === 'th-1' && (recA.facts || []).some((f) => f.k === 'sender' && f.v.name === 'spoofed name'), 'a peer call ⇒ a record authored by the REGISTERED peer (from.name only a fact), threadKey kept', recA);
  const pv2 = await A.call('POST', '/hook/ci', { headers: { ...signedHook('ci', pb.replace('hi', 'hey'), TAB, aRow.id), 'X-VibeSpace-Peer-Version': '2' }, body: pb.replace('hi', 'hey') });
  ok(pv2.status !== 200, 'a peer call of another payload version ⇒ refused');
  // A → B: a send to the peer lands on B as a record by B's peer row for A
  const send = await A.eng.composeEach({ kind: 'user' }, 'webhook', 'ci', { text: 'A answers', recipients: [aRow.id] });
  let recB = null;
  for (let i = 0; i < 100 && !recB; i++) { recB = B.eng.store.readTail('webhook', 'side-a', { limit: 5 }).find((r) => r.text === 'A answers'); if (!recB) await new Promise((r) => setTimeout(r, 20)); }
  ok(send.ok && recB && recB.author.id === `caller:${bRow.id}` && recB.author.name === 'Hub A', 'A → B: the send lands on B as a record authored by B\'s peer row for A', { send: send.ok || send.error, recB });
  // expiry: on B (the code read) and on A (the completion)
  const c2 = await A.call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: {} });
  B.skew(WP.CODE_TTL_MS + 1000);
  const late = await B.call('POST', '/api/channels/webhook/join', { body: { code: c2.j.code, slug: 'late' } });
  B.skew(0);
  ok(late.status === 400 && late.j.code === 'expired' && !B.callers('late').length, 'a code past its 10 minutes ⇒ B refuses it by name, nothing posted or written');
  A.skew(WP.CODE_TTL_MS + 1000);
  const lateA = await B.call('POST', '/api/channels/webhook/join', { body: { code: c2.j.code, slug: 'late' } });
  A.skew(0);
  ok(lateA.status === 502 && /HTTP 401/.test(lateA.j.error) && !B.callers('late').length && A.callers('ci').length === 1, 'the same code reaching A after its 10 minutes ⇒ A answers 401, nothing is written on either side');
  // http refused without allowPrivateReplyUrl (both doors)
  A.settings['webhook.allowPrivateReplyUrl'] = false;
  const mintHttp = await A.call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: {} });
  A.settings['webhook.allowPrivateReplyUrl'] = true;
  const c3 = await A.call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: {} });
  B.settings['webhook.allowPrivateReplyUrl'] = false;
  const joinHttp = await B.call('POST', '/api/channels/webhook/join', { body: { code: c3.j.code, slug: 'plain' } });
  B.settings['webhook.allowPrivateReplyUrl'] = true;
  ok(mintHttp.status === 409 && mintHttp.j.code === 'https-required' && joinHttp.status === 400 && joinHttp.j.code === 'https-required' && !B.callers('plain').length, 'an http hook URL without allowPrivateReplyUrl ⇒ A will not mint (409), B will not join (400) — https required', [mintHttp.status, joinHttp.status]);
  const noUrl = A.app.locals.instancePublicUrl; A.app.locals.instancePublicUrl = null;
  const mintNoUrl = await A.call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: {} });
  A.app.locals.instancePublicUrl = noUrl;
  ok(mintNoUrl.status === 409 && mintNoUrl.j.code === 'no-instance-url', 'no instance URL ⇒ no code (409 no-instance-url, said by name)');
  // RE-PAIR: a code for the existing peer ⇒ both rows rotate IN PLACE; the old tokens are refused after
  const r1 = await A.call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: { callerId: aRow.id } });
  const rj = await B.call('POST', '/api/channels/webhook/join', { body: { code: r1.j.code, slug: 'side-a' } });
  const aRow2 = A.callers('ci').find((c) => c.id === aRow.id) || {}, bRow2 = B.callers('side-a').find((c) => c.id === bRow.id) || {};
  ok(r1.j.repair === true && rj.status === 200 && rj.j.repaired === true && A.callers('ci').length === 1 && B.callers('side-a').length === 1 && aRow2.generation === 2 && bRow2.generation === 2 && aRow2.outCaller === bRow.id && bRow2.outCaller === aRow.id, 're-pairing rotates BOTH rows in place (same ids, generation 2, no second row)', { r1: r1.t.slice(0, 120), rj: rj.t.slice(0, 160) });
  const TAB2 = A.eng.secrets.open(aRow2.tokenEnc), TBA2 = B.eng.secrets.open(bRow2.tokenEnc);
  const ob = WP.peerBody({ text: 'old token', name: 'x' });
  const oldA = await A.call('POST', '/hook/ci', { headers: { ...signedHook('ci', ob, TAB, aRow.id), 'Idempotency-Key': 'o1' }, body: ob });
  const oldB = await B.call('POST', '/hook/side-a', { headers: { ...signedHook('side-a', ob, TBA, bRow.id), 'Idempotency-Key': 'o2' }, body: ob });
  const newA = await A.call('POST', '/hook/ci', { headers: { ...signedHook('ci', ob, TAB2, aRow.id), 'Idempotency-Key': 'n1' }, body: ob });
  ok(TAB2 !== TAB && TBA2 !== TBA && oldA.status === 401 && oldB.status === 401 && newA.status === 200, 'after the re-pair the OLD tokens are 401 on both sides; the new one is accepted', [oldA.status, oldB.status, newA.status]);
  const revoke = await A.call('POST', `/api/channels/webhook/paths/ci/callers/${aRow.id}/revoke`, { body: {} });
  const afterRev = JSON.parse(fs.readFileSync(path.join(A.dataDir, 'channels', 'webhook', 'callers.json'), 'utf-8')).paths.ci.callers[0];
  ok(revoke.status === 200 && !afterRev.tokenEnc && !afterRev.outEnc, 'a revoked peer keeps neither token (its own nor the one it was given)');
} catch (e) { fail++; console.error('  ✗ threw:', e.stack || e.message); }
finally { A.stop(); B.stop(); }
function signedHook(slug, b, tok, id) { const t = String(Math.floor(Date.now() / 1000)); return { 'Content-Type': 'application/json', 'X-Webhook-Caller': id, 'X-Webhook-Timestamp': t, 'X-Webhook-Signature': 'v1=' + hmacHex(tok, WA.signatureBase(t, '/hook/' + slug, b)) }; }
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
