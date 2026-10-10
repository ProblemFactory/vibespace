#!/usr/bin/env node
// test-webhook-token-sinks — THE WEBHOOK TOKEN DOOR CENSUS, at runtime (lane webhook-l1-server, docs/design-webhook.zh.md §9;
// the test-dial-token-sinks shape). The tokens the REAL owner routes mint (register, rotate) are SENTINELS; the flows are
// the real ones in-process (the real engine, the real routes on a loopback server, a stub reply URL, a stub ladder):
// register a Bearer + an HMAC caller, rotate one, call the door with each (and with the rotated-out token), a wake, a
// reply POSTed to the caller, a poll. Then every sink a token could leak into is searched: every file under data/
// (callers.json holds a HASH and a secret-box CIPHERTEXT, never the token; the records, the audit ring, people.json,
// the outbox), the engine's log, the console, every broadcast, the ladder's wake texts and stash, the reply POST the
// caller's URL received (a signature, never the key), and every HTTP answer but the ONE register / rotate answer that
// shows it. Controls: a token planted in a log line and in a data file is found (the scanner is not blind).
// lane webhook-l3-cli-pair: + THE PAIRING (§12) — this instance pairs with ITSELF over loopback (path ci = A, path mirror = B):
// the code, the token A issued and the token B issued are sentinels too; only the pair-code answer shows one (the code).
// Run: node scripts/test-webhook-token-sinks.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600) : '')); } };
const PT = require('../src/pairing-token.js');
const WA = require('../src/webhook-auth.js');
const ENG = require('../src/server/channels-engine.js');
const R = require('../src/routes/webhook.js');
const express = require('express');

const dataDir = scratch('webhook-sinks');
const logs = [];
const capture = (k) => (...a) => logs.push(k + ' ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
const realConsole = { log: console.log, warn: console.warn, error: console.error };
const broadcasts = [];
const ladder = { calls: [], stash: [], async deliverToConversation(cid, text, opts) { ladder.calls.push({ cid, text, opts }); return { ok: true, lane: 'message' }; }, stashFor(cid, env) { ladder.stash.push({ cid, ...env }); } };
const settings = { 'channels.pushCoalesceSeconds': 0, 'webhook.allowPrivateReplyUrl': true };
const received = [];
const stub = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { received.push({ url: req.url, headers: req.headers, body: b }); res.end('{"ok":true}'); }); });
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const eng = ENG.create({ dataDir, env: {}, broadcast: (m) => broadcasts.push(m), log: { log: capture('log'), warn: capture('warn'), error: capture('error') }, deliver: ladder, serverSetting: (k) => settings[k], liveSessions: () => [{ cid: 'agent-A', name: 'Alpha', groups: [] }], httpInbound: true });
R.setup({ getEngine: () => eng, dataDir, serverSetting: (k) => settings[k] });
const app = express(); app.use(R.router);
const srv = http.createServer(app);
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
app.locals.instancePublicUrl = `http://127.0.0.1:${port}`;   // lane webhook-l3-cli-pair: the pairing's hook URL
const answers = [];
const call = (method, p, { headers = {}, body = null, keep = true } = {}) => new Promise((resolve) => {
  const b = body === null ? null : typeof body === 'string' ? body : JSON.stringify(body);
  const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { ...(b ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(b)) } : {}), ...headers } }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => { if (keep) answers.push({ p, method, t }); let j = null; try { j = JSON.parse(t); } catch { } resolve({ status: res.statusCode, t, j }); }); });
  if (b) req.write(b); req.end();
});
const hmacHex = (k, t) => crypto.createHmac('sha256', k).update(t).digest('hex');
const signed = (slug, b, tok, id) => { const t = String(Math.floor(Date.now() / 1000)); return { 'Content-Type': 'application/json', 'X-Webhook-Caller': id, 'X-Webhook-Timestamp': t, 'X-Webhook-Signature': 'v1=' + hmacHex(tok, WA.signatureBase(t, '/hook/' + slug, b)) }; };
const SENT = [];
try {
  console.log = capture('console'); console.warn = capture('console'); console.error = capture('console');
  const mk = await call('POST', '/api/channels/webhook/paths', { body: { slug: 'ci', title: 'CI', textPath: 'text', senderKey: 'who', wakesPerHour: 6 } });
  const r1 = await call('POST', '/api/channels/webhook/paths/ci/callers', { body: { name: 'deploy-bot', auth: 'bearer', delivery: { mode: 'poll' } } }, );
  const r2 = await call('POST', '/api/channels/webhook/paths/ci/callers', { body: { name: 'monitor', auth: 'hmac', delivery: { mode: 'reply-url', replyUrl: `http://127.0.0.1:${stub.address().port}/in` } } });
  const rot = await call('POST', `/api/channels/webhook/paths/ci/callers/${r2.j && r2.j.caller && r2.j.caller.id}/rotate`, {});
  const minted = [r1, r2, rot].map((x) => x.j && x.j.token);
  SENT.push(...minted.filter(Boolean));
  Object.assign(console, realConsole);
  ok(mk.status === 200 && minted.every((t) => typeof t === 'string' && t.startsWith('vswh_') && t.length === 53) && new Set(minted).size === 3, 'setup: a path + three tokens minted by the REAL owner routes (register ×2, rotate) — the sentinels');
  ok(r1.j.shownOnce === true && !JSON.stringify(r1.j.caller).includes('vswh_') && !('tokenHash' in r1.j.caller) && !('tokenEnc' in r2.j.caller), 'the register answer shows the token ONCE beside a caller view that holds no hash, no ciphertext');
  console.log = capture('console'); console.warn = capture('console'); console.error = capture('console');
  const [BEAR, OLD, HM] = minted;
  const hmId = r2.j.caller.id;
  await eng.setAccess('webhook', { kind: 'conversation', convId: 'ci' }, [{ principal: { kind: 'agent', id: 'agent-A', name: 'Alpha' } }]);
  await eng.setWatchers('webhook', { kind: 'conversation', convId: 'ci' }, [{ principal: { kind: 'agent', id: 'agent-A', name: 'Alpha' }, notify: 'wake' }]);
  const c1 = await call('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + BEAR, 'Idempotency-Key': 'one' }, body: { text: 'deploy 1 done', who: 'ci-runner' } });
  const hb = JSON.stringify({ text: 'disk 91% on db1' });
  const c2 = await call('POST', '/hook/ci', { headers: signed('ci', hb, HM, hmId), body: hb });
  const c3 = await call('POST', '/hook/ci', { headers: signed('ci', hb.replace('91', '92'), OLD, hmId), body: hb.replace('91', '92') });
  const c4 = await call('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + BEAR }, body: { text: 'my token is ' + BEAR } });
  await eng.settleWakes();
  const recs = eng.store.readTail('webhook', 'ci', { limit: 10 });
  const hmRec = recs.find((r) => r.author && r.author.id === 'caller:' + hmId);
  const pr = await eng.propose({ kind: 'user' }, 'webhook', 'ci', { text: 'ack — looking at db1', replyTo: hmRec && hmRec.vendorId });
  for (let i = 0; i < 50 && !received.length; i++) await new Promise((r) => setTimeout(r, 20));
  const poll = await call('GET', '/api/channels/webhook/ci/replies?wait=0', { headers: { Authorization: 'Bearer ' + BEAR } });
  const list = await call('GET', '/api/channels/webhook/paths');
  Object.assign(console, realConsole);
  ok(c1.status === 200 && c2.status === 200 && c3.status === 401 && c4.status === 401, 'the flows: a Bearer call and an HMAC call land; the ROTATED-OUT token is 401; a body carrying a token is 401', [c1.status, c2.status, c3.status, c4.status]);
  ok(recs.length === 2 && ladder.calls.length >= 1 && pr.ok && received.length === 1, `a wake (${ladder.calls.length}), a reply proposed by the owner and POSTed to the caller's URL (${received.length})`, { pr, received: received.length });
  const rp = received[0] || { headers: {}, body: '' };
  const rb = JSON.parse(rp.body || '{}');
  const ts = rp.headers['x-webhook-timestamp'];
  ok(rp.headers['x-webhook-signature'] === 'v1=' + hmacHex(HM, WA.signatureBase(ts, '/in', rp.body)) && JSON.stringify(Object.keys(rb)) === JSON.stringify(['path', 'inReplyTo', 'replyId', 'at', 'from', 'text']) && rb.from.name === 'VibeSpace' && rb.text === 'ack — looking at db1', 'the reply POST: signed with the caller\'s CURRENT token (v1 = HMAC(token, ts.POST./in.body)), the fixed body {path, inReplyTo, replyId, at, from, text}, from = the path\'s replyName');
  ok(poll.status === 200 && Array.isArray(poll.j.replies), 'the Bearer caller\'s poll answers (its own queue)');
  console.log = capture('console'); console.warn = capture('console'); console.error = capture('console');
  const pc = await call('POST', '/api/channels/webhook/paths/ci/pair-code', { body: { name: 'Hub A' } });
  const jn = await call('POST', '/api/channels/webhook/join', { body: { code: pc.j && pc.j.code, slug: 'mirror', name: 'Hub B' } });
  const pa = await eng.composeEach({ kind: 'user' }, 'webhook', 'ci', { text: 'peer hello from A', recipients: [pc.j && pc.j.callerId] });
  for (let i = 0; i < 50 && !eng.store.readTail('webhook', 'mirror', { limit: 5 }).length; i++) await new Promise((r) => setTimeout(r, 20));
  Object.assign(console, realConsole);
  const cjP = JSON.parse(fs.readFileSync(path.join(dataDir, 'channels', 'webhook', 'callers.json'), 'utf-8'));
  const aRow = cjP.paths.ci.callers.find((c) => c.id === (pc.j && pc.j.callerId)) || {};
  const bRow = (cjP.paths.mirror && cjP.paths.mirror.callers[0]) || {};
  const PAIR = [pc.j && pc.j.code, aRow.tokenEnc && eng.secrets.open(aRow.tokenEnc), aRow.outEnc && eng.secrets.open(aRow.outEnc)].filter(Boolean);
  SENT.push(...PAIR);
  ok(pc.status === 200 && jn.status === 200 && PAIR.length === 3 && aRow.kind === 'peer' && bRow.kind === 'peer' && eng.secrets.open(bRow.tokenEnc) === PAIR[2] && eng.secrets.open(bRow.outEnc) === PAIR[1], 'pairing (with itself, over loopback): the code + the token A issued + the token B issued join the sentinels — each side keeps both SEALED', [pc.status, jn.status, jn.t && jn.t.slice(0, 200)]);
  const mr = eng.store.readTail('webhook', 'mirror', { limit: 5 });
  ok(pa && pa.ok && mr.some((r) => r.text === 'peer hello from A' && r.author && r.author.name === 'Hub A'), 'a peer send A → B lands on B as a record by its peer caller (the canonical payload — no token on the wire)', { pa: pa && (pa.error || pa.ok), mr: mr.map((r) => r.text) });
  // ── THE SINKS ──
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else files.push(f); } };
  walk(dataDir);
  const leaksIn = (text) => SENT.filter((t) => text.includes(t)).length;
  const fileHits = files.filter((f) => leaksIn(fs.readFileSync(f, 'latin1')));
  ok(files.length >= 6 && !fileHits.length, `no token in ANY of the ${files.length} files under data/ (callers.json, the records, the audit ring, people.json, the outbox…)`, fileHits);
  const cj = JSON.parse(fs.readFileSync(path.join(dataDir, 'channels', 'webhook', 'callers.json'), 'utf-8'));
  const rows = cj.paths.ci.callers;
  ok(rows[0].tokenHash === PT.tokenHash(BEAR) && !rows[0].tokenEnc && typeof rows[1].tokenEnc === 'string' && !rows[1].tokenHash && eng.secrets.open(rows[1].tokenEnc) === HM && rows[1].generation === 2, 'callers.json: the Bearer caller keeps its HASH, the HMAC caller the secret-box CIPHERTEXT of its current token (generation 2 after the rotate)');
  ok((fs.statSync(path.join(dataDir, 'channels', 'webhook', 'callers.json')).mode & 0o777) === 0o600, 'callers.json is 0600');
  ok(!leaksIn(logs.join('\n')) && logs.length > 0, `no token in the engine log or the console (${logs.length} lines)`);
  ok(!leaksIn(JSON.stringify(broadcasts)) && broadcasts.length > 0, `no token in any broadcast (${broadcasts.length})`);
  ok(!leaksIn(JSON.stringify(ladder)), 'no token in a wake text or the stash (the agent\'s transcript)');
  ok(!leaksIn(JSON.stringify(received)), 'no token in the reply POST the caller received (a signature, never the key)');
  const shown = answers.filter((a) => leaksIn(a.t));
  ok(shown.length === 4 && shown.every((a) => /\/callers(\/[^/]+\/rotate)?$|\/pair-code$/.test(a.p) && a.method === 'POST'), `a token appears in exactly the 3 register / rotate answers + the ONE pair-code answer (the code) — never in a GET, a receipt, a poll, the join (${answers.length} answers)`, shown.map((a) => a.p));
  // controls: the scanner is not blind
  const planted = path.join(dataDir, 'planted.txt');
  fs.writeFileSync(planted, 'x ' + HM + ' y');
  const files2 = []; const walk2 = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk2(f); else files2.push(f); } }; walk2(dataDir);
  ok(files2.filter((f) => leaksIn(fs.readFileSync(f, 'latin1'))).length === 1 && leaksIn(['[webhook] caller ' + BEAR].join('\n')) === 1, 'CONTROL: a token planted in a data file and in a log line IS found (RED)');
} catch (e) { fail++; Object.assign(console, realConsole); console.error('  ✗ threw:', e.stack || e.message); }
finally { Object.assign(console, realConsole); try { eng.stop && eng.stop(); } catch { } srv.close(); stub.close(); try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { } }
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
