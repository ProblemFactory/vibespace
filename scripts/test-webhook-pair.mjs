#!/usr/bin/env node
// test-webhook-pair — THE INSTANCE PAIRING (lane webhook-l3-cli-pair; docs/design-webhook.zh.md §12, fence 7 of §10).
// §1 PURE src/webhook-pair.js: the code (round trip, malformed, 10-minute expiry), the hook URL verdict (https unless
// allowPrivate), the completion verdict step by step, `complete` = the verdict BEFORE the one write (CONTROL: a mutant that
// writes first ⇒ a refused frame writes — RED), the bounded pending memo, the canonical peer payload.
// §2 TWO INSTANCES in-process (two real engines, two copies of the real routes, each on its own loopback port): A mints a
// code, B joins ⇒ a `peer` caller on each side; the code a second time ⇒ refused, nothing changes; an expired code ⇒
// refused on both sides; http refused without allowPrivateReplyUrl; a completion frame POSTed to /hook ⇒ 401 and msgs/
// unchanged; a peer call ⇒ a record by the registered peer; A → B lands as a record; re-pairing rotates both rows IN
// PLACE and the old tokens are refused; an agent bearer on the owner verbs ⇒ 403.
// §3 lane webhook-pair-join (B-5ee0 a/b): the pending code is SEALED in pair-pending.json (0600) before it is shown; a
// restart (a new engine + a fresh routes copy over the same data dir) inside the 10 minutes keeps it valid; used, it is a
// tombstone ("already used" by name); past the deadline a restart sweeps it; the join refuses BY NAME (bad code, a caller
// token pasted, expired, unknown, an altered code, already used); `check: true` posts nothing; the code and tokens never
// reach a GET, a broadcast or a file in the clear. CONTROLS (RED): routes that keep the memo in memory (a restart voids
// the code), a memo that reloads expired rows, a door that writes the token in the clear, a verdict that names `spent`
// before the signature. Run: node scripts/test-webhook-pair.mjs
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
ok(WP.decodeCode(code.slice(0, -4), NOW).why === 'bad-code' && WP.decodeCode('vswh_' + 'a'.repeat(48), NOW).why === 'caller-token' && WP.decodeCode('hello', NOW).why === 'bad-code' && WP.decodeCode(code, NOW + WP.CODE_TTL_MS + 1).why === 'expired', 'a mangled code ⇒ bad-code; a caller token pasted as a code ⇒ caller-token (the wrong secret, by name); one past its 10 minutes ⇒ expired');
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
  ['an expired code', V({ now: NOW + WP.CODE_TTL_MS + 1, headers: heads(fb, { 'x-webhook-timestamp': String(Math.floor((NOW + WP.CODE_TTL_MS + 1) / 1000)) }) }), 'expired'],
  ['a stale timestamp', V({ headers: heads(fb, { 'x-webhook-timestamp': String(Math.floor(NOW / 1000) - 900) }) }), 'stale'],
  ['a signature by another token', V({ headers: heads(fb, { 'x-webhook-signature': 'v1=' + hmacHex(TB, WA.signatureBase(String(Math.floor(NOW / 1000)), '/api/channels/webhook/ci/pair', fb)) }) }), 'signature'],
  ['a signature over /hook/ci (not the pair path)', V({ headers: heads(fb, { 'x-webhook-signature': 'v1=' + hmacHex(TA, WA.signatureBase(String(Math.floor(NOW / 1000)), '/hook/ci', fb)) }) }), 'signature'],
];
for (const [n, v, why] of legs) ok(!v.ok && v.answer === 'unauthorized' && v.why === why, `${n} ⇒ the same-shape 401 (${why})`, v);
// lane webhook-pair-join: a SPENT code — named only to a frame that proves it; CONTROL: a verdict naming it before the signature
const forgedSig = { 'x-webhook-signature': 'v1=' + hmacHex(TB, WA.signatureBase(String(Math.floor(NOW / 1000)), '/api/channels/webhook/ci/pair', fb)) };
const spProved = V({ pending: { ...pend, spent: true } }), spForged = V({ pending: { ...pend, spent: true }, headers: heads(fb, forgedSig) });
ok(!spProved.ok && spProved.why === 'spent' && spProved.answer === 'spent' && !spForged.ok && spForged.answer === 'unauthorized' && spForged.why === 'signature', 'a spent code: a frame that PROVES it (signature + nonce) hears `spent` by name (the 409 "already used"); a frame by another token stays the same-shape 401', [spProved, spForged]);
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
/** a copy of a src module with one line replaced, compiled beside the original (its requires resolve the same) */
function mutant(rel, from, to) {
  const file = path.join(repo, rel), text = fs.readFileSync(file, 'utf-8');
  if (!text.includes(from)) throw new Error(`mutant anchor gone in ${rel}: ${from.slice(0, 80)}`);
  const mod = new Module(file.replace(/\.js$/, '.mutant.js'));
  mod.filename = mod.id; mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(text.replace(from, to), mod.filename);
  return mod.exports;
}
const SPENT_LINE = "  if (pending.spent === true) return { ok: false, why: 'spent', answer: 'spent' };\n";
const earlyV = mutant('src/webhook-pair.js', "  if (!pending || pending.slug !== slug || pending.callerId !== callerId) return unauth('unknown');\n", "  if (!pending || pending.slug !== slug || pending.callerId !== callerId) return unauth('unknown');\n" + SPENT_LINE);
const leak = earlyV.completionVerdict({ slug: 'ci', headers: heads(fb, forgedSig), body: fb, now: NOW, pending: { ...pend, spent: true } }, { hmacHex, safeEqual });
ok(leak.answer === 'spent' && leak.why === 'spent', 'CONTROL: a verdict that names `spent` BEFORE the signature tells an unproven frame — the leg above turns RED', leak);
const pm = WP.createPending({ max: 2 });
pm.put({ slug: 'ci', callerId: 'c-00000001', token: TA, nonce }, NOW); pm.put({ slug: 'ci', callerId: 'c-00000002', token: TA, nonce }, NOW); pm.put({ slug: 'ci', callerId: 'c-00000003', token: TA, nonce }, NOW);
ok(pm.size() === 2 && !pm.get('ci', 'c-00000001', NOW) && pm.get('ci', 'c-00000003', NOW) && !pm.get('ci', 'c-00000003', NOW + WP.CODE_TTL_MS + 1), 'the pending memo is bounded (oldest out) and forgets a code past its 10 minutes');
pm.put({ slug: 'ci', callerId: 'c-00000004', token: TA, nonce }, NOW); pm.spend('ci', 'c-00000004', NOW);
const sp4 = pm.get('ci', 'c-00000004', NOW);
ok(sp4 && sp4.spent === true && sp4.spentAt === NOW && !pm.get('ci', 'c-00000004', NOW + WP.CODE_TTL_MS + 1), 'a spent code stays a TOMBSTONE (spent, single use) until its deadline, then it is swept');
// the store door (lane webhook-pair-join): bind reloads the held rows, sweeps the expired, writes every change through it
const doorRows = [];
const door = (rows) => ({ read: () => rows, write: (r) => doorRows.push(r) });
const live = { slug: 'ci', callerId: 'c-00000005', token: TA, nonce, name: 'Hub A', repair: false, mintedAt: NOW, exp: NOW + WP.CODE_TTL_MS, spent: false };
const old = { ...live, callerId: 'c-00000006', exp: NOW - 1 }, broken = { ...live, callerId: 'nope' };
const pb2 = WP.createPending();
const held = pb2.bind(door([live, old, broken]), NOW);
ok(held === 1 && pb2.get('ci', 'c-00000005', NOW).token === TA && doorRows.length === 1 && doorRows[0].length === 1 && doorRows[0][0].callerId === 'c-00000005', 'bind(): the held row reloads; the expired and the damaged ones are dropped and the door is rewritten without them', doorRows);
pb2.put({ slug: 'ci', callerId: 'c-00000007', token: TB, nonce }, NOW); pb2.spend('ci', 'c-00000007', NOW + 5);
ok(doorRows.length === 3 && doorRows[2].find((r) => r.callerId === 'c-00000007').spent === true && pb2.nextExp() === NOW + WP.CODE_TTL_MS && pb2.sweep(NOW + WP.CODE_TTL_MS + 1) === 2 && doorRows[3].length === 0, 'every put / spend / sweep is written through the door; the sweep at the deadline empties it', doorRows.map((r) => r.length));
const keepOld = mutant('src/webhook-pair.js', 'if (row && t <= row.exp && m.size < max)', 'if (row && m.size < max)');
const pm3 = keepOld.createPending();
ok(pm3.bind(door([live, old]), NOW) === 2, 'CONTROL: a memo that reloads without the deadline keeps the expired row — the bind leg above turns RED');
const pv = WP.peerRecordValue({ text: 'build 12 ready', threadKey: 't-1', inReplyTo: 'r-9', attachments: [{ name: 'log.txt', url: 'https://b.example/f/log.txt', sha256: 'ab' }, { name: 'x', url: 'javascript:alert(1)' }], from: { name: 'Hub B' } });
ok(pv.text === 'build 12 ready\nlog.txt: https://b.example/f/log.txt' && pv.from.name === 'Hub B' && pv.threadKey === 't-1' && pv.inReplyTo === 'r-9', 'the canonical peer payload: text + each attachment as a LINK line (a javascript: URL dropped), from.name, threadKey, inReplyTo');
ok(JSON.stringify(Object.keys(JSON.parse(WP.peerBody({ text: 'x', name: 'A' })))) === JSON.stringify(['text', 'threadKey', 'inReplyTo', 'attachments', 'from']) && WP.PEER_HEADER === 'x-vibespace-peer-version' && WP.PEER_VERSION === '1', 'what a side POSTs to a peer is the same canonical shape, with X-VibeSpace-Peer-Version: 1');

console.log('§2 two instances in-process (real engines, real routes, loopback)');
const routePath = require.resolve('../src/routes/webhook.js');
const chanPath = require.resolve('../src/routes/channels.js');
async function instance(tag, settings, o = {}) {
  const dataDir = o.dataDir || scratch('webhook-pair-' + tag);
  let skew = o.skew || 0;
  const now = () => Date.now() + skew;
  delete require.cache[routePath];
  delete require.cache[chanPath];   // lane wake-approve-card r6: ONE instance = ITS wiring — the wake gate reads channels.js's engine (src/server/channels-wiring.js hands both route files the same one)
  const R = o.routes ? o.routes() : require(routePath);
  const bc = [];
  const eng = ENG.create({ dataDir, env: {}, broadcast: (m) => bc.push(m), log: { log() {}, warn() {}, error() {} }, deliver: { async deliverToConversation() { return { ok: true, lane: 'message' }; }, stashFor() {} }, serverSetting: (k) => settings[k], liveSessions: () => [], httpInbound: true });
  R.setup({ getEngine: () => eng, dataDir, serverSetting: (k) => settings[k], now });
  require(chanPath).setup({ getEngine: () => eng });
  const app = express(); app.use(R.router);
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(o.port || 0, '127.0.0.1', r));
  const port = srv.address().port;
  app.locals.instancePublicUrl = `http://127.0.0.1:${port}`;
  const call = (method, p, { headers = {}, body = null } = {}) => new Promise((resolve) => {
    const b = body === null ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...(b !== null ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(b)) } : {}), ...headers } }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { } resolve({ status: res.statusCode, t, j }); }); });
    req.on('error', (e) => resolve({ status: 0, t: String(e.code), j: null }));
    if (b !== null) req.write(b); req.end();
  });
  const callers = (slug) => { try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'channels', 'webhook', 'callers.json'), 'utf-8')).paths[slug].callers; } catch { return []; } };
  const halt = () => new Promise((r) => { try { eng.stop && eng.stop(); } catch { } srv.closeAllConnections && srv.closeAllConnections(); srv.close(() => r()); });
  return { tag, dataDir, eng, R, app, srv, port, call, callers, settings, bc, halt, skew: (ms) => { skew = ms; }, stop() { try { eng.stop && eng.stop(); } catch { } srv.close(); try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { } } };
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
  ok(again.status === 502 && again.j.code === 'code-used' && /^Hub A says this code was already used/.test(again.j.error) && !B.callers('side-a2').length && A.callers('ci').length === 1 && A.callers('ci')[0].generation === 1, 'the SAME code a second time ⇒ A answers 409 (spent, to a frame that proves the code), B says "Hub A says this code was already used" and writes nothing, A unchanged', again.t.slice(0, 200));
  const fr = WP.frameOf({ nonce: WP.decodeCode(c1.j.code, Date.now()).nonce, hookUrl: `http://127.0.0.1:${B.port}/hook/x`, caller: 'c-0d0d0d0d', token: PT.mintToken('webhook'), name: 'thief' });
  const replay = await A.call('POST', '/api/channels/webhook/ci/pair', { headers: WP.frameHeaders({ slug: 'ci', callerId: c1.j.callerId, token: TAB, body: fr, now: Date.now() }, { hmacHex }), body: fr });
  const forged = await A.call('POST', '/api/channels/webhook/ci/pair', { headers: WP.frameHeaders({ slug: 'ci', callerId: c1.j.callerId, token: PT.mintToken('webhook'), body: fr, now: Date.now() }, { hmacHex }), body: fr });
  ok(replay.status === 409 && replay.j.code === 'code-used' && forged.status === 401 && JSON.stringify(forged.j) === JSON.stringify(WA.ANSWERS.unauthorized.body) && A.callers('ci').length === 1 && A.callers('ci')[0].generation === 1, 'a fresh frame signed with the spent code\'s token ⇒ 409 "already used" (it proved the code), nothing written; one signed by any other token ⇒ the same-shape 401', [replay.status, forged.status]);
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
  ok(lateA.status === 502 && lateA.j.code === 'code-unknown' && /does not know this code/.test(lateA.j.error) && !B.callers('late').length && A.callers('ci').length === 1, 'the same code reaching A after its 10 minutes ⇒ A answers 401, B says it does not know this code (by name), nothing is written on either side', lateA.j);
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

console.log('§3 the pending code outlives a restart (lane webhook-pair-join, B-5ee0 b) + the join refuses by name (a)');
const S3 = () => ({ 'channels.pushCoalesceSeconds': 0, 'webhook.allowPrivateReplyUrl': true });
const PF = (I) => path.join(I.dataDir, 'channels', 'webhook', 'pair-pending.json');
const readPF = (I) => { try { return JSON.parse(fs.readFileSync(PF(I), 'utf-8')); } catch { return null; } };
const warns = [];
const realWarn = console.warn;
console.warn = (...a) => { warns.push(a.join(' ')); };
const A1 = await instance('a3', S3()), B3 = await instance('b3', S3());
const gets = [];
const getPaths = async (I) => { const g = await I.call('GET', '/api/channels/webhook/paths'); gets.push(g.t); return g; };
let A2 = null, A3 = null, AM = null;
const SECRETS = [];
try {
  ok((await A1.call('POST', '/api/channels/webhook/paths', { body: { slug: 'ci', title: 'CI' } })).status === 200 && !fs.existsSync(PF(A1)), 'FIXTURE: A has path ci; no code minted ⇒ no pending file');
  const k1 = await A1.call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: { name: 'Hub A' } });
  const d1 = WP.decodeCode(k1.j && k1.j.code, Date.now());
  SECRETS.push(k1.j.code, d1.token);
  const f1 = readPF(A1), ftext = fs.readFileSync(PF(A1), 'utf-8');
  ok(k1.status === 200 && f1 && f1.rows.length === 1 && f1.rows[0].callerId === k1.j.callerId && f1.rows[0].exp === k1.j.expiresAt && f1.rows[0].mintedAt === k1.j.expiresAt - WP.CODE_TTL_MS && f1.rows[0].name === 'Hub A' && f1.rows[0].spent === false
    && (fs.statSync(PF(A1)).mode & 0o777) === 0o600 && !ftext.includes(d1.token) && !ftext.includes(k1.j.code) && A1.eng.secrets.open(f1.rows[0].tokenEnc) === d1.token,
  'the mint writes the pending half (0600): mint time, deadline, caller id, name — the token SEALED; neither the token nor the code in the clear', f1);
  await getPaths(A1);
  // a restart: a NEW engine + a fresh copy of the real routes over the same data dir, on the same port (the code names it)
  await A1.halt();
  A2 = await instance('a3', S3(), { dataDir: A1.dataDir, port: A1.port });
  const ck = await B3.call('POST', '/api/channels/webhook/join', { body: { code: k1.j.code, check: true } });
  ok(ck.status === 200 && ck.j.check === true && ck.j.from === 'Hub A' && ck.j.host === `127.0.0.1:${A1.port}` && ck.j.theirPath === 'ci' && ck.j.slug === 'ci' && ck.j.exists === false && ck.j.repair === false && ck.j.expiresAt === k1.j.expiresAt
    && !/vsw[hp]_/.test(ck.t) && readPF(A2).rows[0].spent === false && !B3.callers('ci').length && !fs.existsSync(path.join(B3.dataDir, 'channels', 'webhook', 'callers.json')),
  'check: true reads the code — who (Hub A), its host, its path, the path here, the deadline — and posts NOTHING (A\'s code still unspent, B wrote nothing, no secret in the answer)', ck.j);
  const j1 = await B3.call('POST', '/api/channels/webhook/join', { body: { code: k1.j.code, slug: 'hub-a', name: 'Hub B' } });
  const a2Row = A2.callers('ci')[0] || {}, b3Row = B3.callers('hub-a')[0] || {};
  ok(j1.status === 200 && a2Row.id === k1.j.callerId && a2Row.kind === 'peer' && a2Row.name === 'Hub B' && b3Row.kind === 'peer' && b3Row.name === 'Hub A' && a2Row.outCaller === b3Row.id,
    'A RESTARTED inside the 10 minutes: the code still pairs — B joins, the new A process stores B as its peer (and B stores A)', j1.t.slice(0, 300));
  SECRETS.push(A2.eng.secrets.open(a2Row.tokenEnc), B3.eng.secrets.open(b3Row.tokenEnc));
  const f2 = readPF(A2);
  ok(f2 && f2.rows.length === 1 && f2.rows[0].spent === true && Number.isFinite(f2.rows[0].spentAt) && typeof f2.rows[0].tokenEnc === 'string', 'the used code stays a sealed TOMBSTONE (spent) until its deadline', f2);
  const j2 = await B3.call('POST', '/api/channels/webhook/join', { body: { code: k1.j.code, slug: 'hub-a' } });
  ok(j2.status === 502 && j2.j.code === 'code-used' && /^Hub A says this code was already used/.test(j2.j.error) && B3.callers('hub-a').length === 1 && B3.callers('hub-a')[0].generation === 1 && A2.callers('ci')[0].generation === 1,
    'the same code again (after the restart too) ⇒ "Hub A says this code was already used" — by name, nothing written on either side', j2.j);
  // the join's other names: not a code / a caller token (the wrong secret) / an ALTERED code (A cannot verify it)
  const bc = await B3.call('POST', '/api/channels/webhook/join', { body: { code: 'hello', check: true } });
  const ct = await B3.call('POST', '/api/channels/webhook/join', { body: { code: PT.mintToken('webhook') } });
  ok(bc.status === 400 && bc.j.code === 'bad-code' && /not a VibeSpace pairing code/.test(bc.j.error) && ct.status === 400 && ct.j.code === 'caller-token' && /caller token \(vswh_…\), not a pairing code/.test(ct.j.error),
    'a pasted non-code ⇒ "not a VibeSpace pairing code"; a caller TOKEN pasted ⇒ "that is a caller token, not a pairing code" (by name, nothing posted)', [bc.j, ct.j]);
  const k2 = await A2.call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: { name: 'Hub A' } });
  const d2 = WP.decodeCode(k2.j.code, Date.now());
  SECRETS.push(k2.j.code, d2.token);
  const altered = WP.encodeCode({ hook: d2.hook, caller: d2.caller, token: PT.mintToken('webhook'), nonce: d2.nonce, exp: d2.exp, name: d2.name });
  const ja = await B3.call('POST', '/api/channels/webhook/join', { body: { code: altered, slug: 'altered' } });
  ok(ja.status === 502 && ja.j.code === 'code-unknown' && /^Hub A does not know this code/.test(ja.j.error) && !B3.callers('altered').length && readPF(A2).rows.find((r) => r.callerId === d2.caller).spent === false,
    'an ALTERED code (another secret inside) ⇒ A refuses the unproven frame with its same-shape 401; B says "Hub A does not know this code"; A\'s real code stays unspent', ja.j);
  await getPaths(A2); await getPaths(B3);
  // past the deadline: a restart sweeps every row (the tombstone and the pending code) — nothing sealed is left
  await A2.halt();
  A3 = await instance('a3', S3(), { dataDir: A1.dataDir, port: A1.port, skew: WP.CODE_TTL_MS + 1000 });
  const f3 = readPF(A3);
  ok(f3 && Array.isArray(f3.rows) && f3.rows.length === 0, 'a restart PAST the deadline sweeps both rows (spent + pending) — the file keeps no row, no ciphertext', f3);
  const j3 = await B3.call('POST', '/api/channels/webhook/join', { body: { code: k2.j.code, slug: 'late' } });
  ok(j3.status === 502 && j3.j.code === 'code-unknown' && !B3.callers('late').length, '…a code B still believes in (its clock) ⇒ "Hub A does not know this code" by name, nothing written', j3.j);
  B3.skew(WP.CODE_TTL_MS + 1000);
  const j4 = await B3.call('POST', '/api/channels/webhook/join', { body: { code: k2.j.code, slug: 'late', check: true } });
  B3.skew(0);
  ok(j4.status === 400 && j4.j.code === 'expired' && /has expired \(a code lives 10 minutes\)/.test(j4.j.error), 'B\'s own clock past the deadline ⇒ "that pairing code has expired" by name (the paste box says it before any post)', j4.j);
  // CONTROL: the same restart over routes that keep the memo in MEMORY ⇒ the code dies with the process (the restart leg RED)
  const k5 = await A3.call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: { name: 'Hub A' } });
  SECRETS.push(k5.j.code);
  await A3.halt();
  const MEM_FROM = '    if (!e || !e.secrets || !D.dataDir) pending.bind(null, D.now());';
  AM = await instance('a3', S3(), { dataDir: A1.dataDir, port: A1.port, skew: WP.CODE_TTL_MS + 1000, routes: () => mutant('src/routes/webhook.js', MEM_FROM, '    if (true) pending.bind(null, D.now());') });
  const jm = await B3.call('POST', '/api/channels/webhook/join', { body: { code: k5.j.code, slug: 'mem' } });
  ok(jm.status === 502 && jm.j.code === 'code-unknown' && !B3.callers('mem').length, 'CONTROL: routes that keep the pending memo in memory ⇒ after the restart A does not know the code — the restart leg turns RED', jm.j);
  // THE CENSUS: the codes and tokens never reach a GET, a broadcast, a warning, or any file in the clear
  await getPaths(AM); await getPaths(B3);
  const leaks = (text) => SECRETS.filter(Boolean).filter((x) => String(text).includes(x)).length;
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else files.push(f); } };
  walk(A1.dataDir); walk(B3.dataDir);
  const fileHits = files.filter((f) => leaks(fs.readFileSync(f, 'latin1')));
  const bcs = JSON.stringify([A1.bc, A2.bc, A3.bc, AM.bc, B3.bc]);
  ok(SECRETS.length >= 7 && gets.length >= 5 && !gets.some(leaks) && !leaks(bcs) && bcs.length > 50 && !leaks(warns.join('\n')) && !fileHits.length && files.some((f) => f.endsWith('pair-pending.json')),
    `the census: no code and no token in a GET answer (${gets.length}), a broadcast (${bcs.length} B), a warning, or any of the ${files.length} files under both data dirs (pair-pending.json included)`, { fileHits, gets: gets.filter(leaks).length });
  const DOOR_FROM = 'rows.map(({ token, ...r }) => ({ ...r, tokenEnc: secrets.seal(token) }))';
  const clear = mutant('src/channels/webhook.js', DOOR_FROM, 'rows.map(({ token, ...r }) => ({ ...r, tokenEnc: token }))');
  const cdir = scratch('webhook-pair-door');
  clear.pairPendingDoor(cdir, { secrets: AM.eng.secrets }).write([{ slug: 'ci', callerId: 'c-0e0e0e0e', token: d2.token, nonce: d2.nonce, exp: d2.exp }]);
  ok(leaks(fs.readFileSync(path.join(cdir, 'pair-pending.json'), 'latin1')) === 1, 'CONTROL: a door that writes the token in the clear is caught by the same file census (RED)');
  fs.rmSync(cdir, { recursive: true, force: true });
} catch (e) { fail++; console.error('  ✗ threw:', e.stack || e.message); }
finally {
  console.warn = realWarn;
  for (const I of [A2, A3]) if (I) try { await I.halt(); } catch { }
  if (AM) AM.stop(); else A1.stop();
  B3.stop();
}
function signedHook(slug, b, tok, id) { const t = String(Math.floor(Date.now() / 1000)); return { 'Content-Type': 'application/json', 'X-Webhook-Caller': id, 'X-Webhook-Timestamp': t, 'X-Webhook-Signature': 'v1=' + hmacHex(tok, WA.signatureBase(t, '/hook/' + slug, b)) }; }
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
