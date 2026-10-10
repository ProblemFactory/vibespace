#!/usr/bin/env node
// test-webhook-routes — THE WEBHOOK DOOR ON A REAL SERVER (lane webhook-l1-server, docs/design-webhook.zh.md §4 / §7 /
// §10). A throwaway worktree of THIS tree runs `node server.js` with sign-in ON, one stub agent session (dtach + a stub
// CLI that records the frames it is handed) and a stub reply URL on loopback (`webhook.allowPrivateReplyUrl` in the
// fixture's settings). Legs: the auth.js exemption line and the server.js JSON skip are pinned verbatim AND proven (a
// malformed JSON body to /hook with a bad token is 401, never the parser's 400 — control: the same body to an owner
// route is 400); an agent bearer on every owner verb ⇒ 403 agent-forbidden; two callers' receipts share no prefix and
// carry no counter; a long-poll ended by a revoke ⇒ 401; an end-to-end call ⇒ record ⇒ a `fact` rule ⇒ ONE wake ⇒
// the agent's `reply --to <record>` ⇒ the signed POST at the caller's URL ⇒ `sent`; a flood ⇒ 429 and the wakes held to
// the path's budget. Heavy (a server). Run: node scripts/test-webhook-routes.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execSync, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePort, scratch, scratchHome, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WA = require(path.join(repo, 'src/webhook-auth.js'));
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 600) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 20000, step = 150) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { } await sleep(step); } return null; };
try { execFileSync('dtach', ['--help'], { stdio: 'ignore' }); } catch (e) { if (e.code === 'ENOENT') { console.log('SKIP: no dtach on PATH (the stub agent session is a dtach session)'); process.exit(0); } }

console.log('§0 the pins');
const AUTH_LINE = "      if (/^\\/hook(?:\\/|$)/.test(p) || (req.method === 'GET' && /^\\/api\\/channels\\/webhook\\/[a-z0-9][a-z0-9-]{0,62}\\/replies$/.test(p)) || (req.method === 'POST' && /^\\/api\\/channels\\/webhook\\/[a-z0-9][a-z0-9-]{0,62}\\/pair$/.test(p))) return next();";
const authSrc = fs.readFileSync(path.join(repo, 'src/auth.js'), 'utf-8');
ok(authSrc.split('\n').filter((l) => l === AUTH_LINE).length === 1 && (authSrc.match(/\/\^\\\/hook/g) || []).length === 1, 'src/auth.js holds the webhook exemption as ONE line, verbatim (exactly /hook/<slug>, the caller\'s replies GET, the pairing POST)');
const serverSrc = fs.readFileSync(path.join(repo, 'server.js'), 'utf-8');
ok(serverSrc.includes("OWN_BODY_RE = /^\\/(?:proxy\\/|hook\\/|api\\/channels\\/webhook\\/[^/]+\\/pair$)/;") && serverSrc.includes('app.use((req, res, next) => (OWN_BODY_RE.test(req.path) ? next() : jsonBody(req, res, next)));'), 'server.js: the global JSON parser skips /hook/ and the pairing route at the /proxy/ place');

const VNC_ENV = await vncEnv();
const PORT = await freePort();
const wt = scratch('webhook-routes');
const fakeHome = scratchHome('webhook-routes-home', fs);
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
fs.writeFileSync(path.join(wt, 'data/settings.json'), JSON.stringify({ 'webhook.allowPrivateReplyUrl': true, 'channels.pushCoalesceSeconds': 0 }));
// ── the stub agent session (the groups e2e recipe): a dtach master whose program records every frame it is handed ──
const STUB = path.join(wt, 'stub-cli.cjs');
fs.writeFileSync(STUB, `'use strict';
const net = require('net'), fs = require('fs'), path = require('path');
const [cid, name, sock, log] = process.argv.slice(2);
try { fs.unlinkSync(sock); } catch {}
const dir = path.join(process.env.HOME, '.claude', 'sessions');
fs.mkdirSync(dir, { recursive: true });
const srv = net.createServer((c) => { let buf = ''; c.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) fs.appendFileSync(log, line + '\\n'); } }); });
srv.listen(sock, () => fs.writeFileSync(path.join(dir, process.pid + '.json'), JSON.stringify({ pid: process.pid, sessionId: cid, messagingSocketPath: sock, name })));
setInterval(() => {}, 1 << 30);
`);
const SOCK_DIR = path.join(wt, 'data/sockets'), META_DIR = path.join(wt, 'data/session-meta');
fs.mkdirSync(SOCK_DIR, { recursive: true }); fs.mkdirSync(META_DIR, { recursive: true });
const AG = { cid: 'a1a1a1a1-0000-4000-8000-0000000000a1', name: 'alpha', token: 'vsst_' + 'webhookroutesalpha0000000000001', sockName: `cw-1-${T0}` };
AG.inbox = path.join(wt, 'inbox-a.sock'); AG.log = path.join(wt, 'frames-a.ndjson');
fs.writeFileSync(path.join(META_DIR, AG.sockName + '.json'), JSON.stringify({ webuiSessionId: 'sess-wh-a', sockName: AG.sockName, claudeSessionId: AG.cid, backendSessionId: AG.cid, name: AG.name, mode: 'chat', backend: 'claude', cwd: wt, createdAt: T0, agentToken: AG.token }));
execFileSync('dtach', ['-n', path.join(SOCK_DIR, AG.sockName), '-E', '-z', process.execPath, STUB, AG.cid, AG.name, AG.inbox, AG.log], { env: { ...process.env, HOME: fakeHome } });
const frames = () => { try { return fs.readFileSync(AG.log, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((f) => f.type === 'user'); } catch { return []; } };
// ── the caller's reply URL (loopback) ──
const received = [];
const stub = http.createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { received.push({ url: req.url, headers: req.headers, body: b }); res.end('{"ok":true}'); }); });
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const PASSWORD = 'webhook-routes-' + process.pid;
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: 'ignore', env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: PASSWORD } });
const cleanup = () => {
  try { srv.kill('SIGKILL'); } catch { }
  try { endRootedProcesses(wt); } catch { }   // §57b: whatever the server (and the dtach stub) started under the scratch tree
  try { stub.close(); } catch { }
  try { execFileSync('pkill', ['-KILL', '-f', STUB], { stdio: 'ignore' }); } catch { }
  try { execFileSync('pkill', ['-KILL', '-f', SOCK_DIR], { stdio: 'ignore' }); } catch { }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [fakeHome, wt]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { cleanup(); process.exit(143); });

let COOKIE = '';
const raw = (method, p, { headers = {}, body = null } = {}) => new Promise((resolve) => {
  const b = body === null ? null : typeof body === 'string' ? body : JSON.stringify(body);
  const req = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { ...(b !== null ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(b)) } : {}), ...headers } }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { } resolve({ status: res.statusCode, t, j }); }); });
  req.on('error', (e) => resolve({ status: 0, t: String(e.code), j: null }));
  if (b !== null) req.write(b); req.end();
});
const owner = (method, p, body = null) => raw(method, p, { headers: { Cookie: `vs_token=${COOKIE}` }, body });
const agent = (method, p, body = null) => raw(method, p, { headers: { Authorization: 'Bearer ' + AG.token }, body });
const hmacHex = (k, t) => crypto.createHmac('sha256', k).update(t).digest('hex');
const signed = (slug, b, tok, id, extra = {}) => { const t = String(Math.floor(Date.now() / 1000)); return { 'Content-Type': 'application/json', 'X-Webhook-Caller': id, 'X-Webhook-Timestamp': t, 'X-Webhook-Signature': 'v1=' + hmacHex(tok, WA.signatureBase(t, '/hook/' + slug, b)), ...extra }; };
try {
  const up = await waitFor(async () => (await raw('GET', '/api/channels/webhook/paths')).status === 401, 60000, 300);
  ok(!!up, 'FIXTURE: the server is up with sign-in ON (a cookie-less owner route is 401)');
  const login = await raw('POST', '/api/login', { body: { password: PASSWORD } });
  COOKIE = (login.t && ((login.t.match(/[a-f0-9]{32,}/) || [])[0])) || '';
  if (!COOKIE) { const r2 = await fetch(`http://127.0.0.1:${PORT}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) }); COOKIE = ((r2.headers.get('set-cookie') || '').match(/vs_token=([a-f0-9]+)/) || [])[1] || ''; }
  ok(!!COOKIE, 'FIXTURE: the owner logs in');
  let roster = null;
  for (let i = 0; i < 60; i++) { roster = await owner('GET', '/api/channel-groups/roster'); if (roster.j && Array.isArray(roster.j.sessions) && roster.j.sessions.some((x) => x.cid === AG.cid)) break; await sleep(500); }
  ok(roster.j && roster.j.sessions.some((x) => x.cid === AG.cid), 'FIXTURE: the server adopted the stub agent session (alpha)');
  const mk = await owner('POST', '/api/channels/webhook/paths', { slug: 'ci', title: 'CI', textPath: 'text', senderKey: 'who', facts: [{ key: 'env', path: 'env' }], wakesPerHour: 2 });
  const A = await owner('POST', '/api/channels/webhook/paths/ci/callers', { name: 'deploy-bot', auth: 'bearer', delivery: { mode: 'poll' } });
  const B = await owner('POST', '/api/channels/webhook/paths/ci/callers', { name: 'monitor', auth: 'hmac', delivery: { mode: 'reply-url', replyUrl: `http://127.0.0.1:${stub.address().port}/in` } });
  ok(mk.status === 200 && A.j && A.j.token && B.j && B.j.token, 'FIXTURE: the owner makes path ci and registers a Bearer caller (poll) and an HMAC caller (reply URL)', [mk.status, A.status, B.status]);
  const TA = A.j.token, TB = B.j.token, IDA = A.j.caller.id, IDB = B.j.caller.id;

  console.log('§1 the JSON skip, proven');
  const bad = await raw('POST', '/hook/ci', { headers: { Authorization: 'Bearer vswh_' + '0'.repeat(48), 'Content-Type': 'application/json' }, body: '{"broken": ' });
  const ctl = await owner('PUT', '/api/channels/webhook/paths/ci', '{"broken": ');
  ok(bad.status === 401 && bad.j && bad.j.error === 'unauthorized' && ctl.status === 400, `a malformed JSON body to /hook with a bad token is the door's 401 — the global parser never saw it (control: the same body to an owner route is the parser's ${ctl.status})`, [bad.status, bad.t.slice(0, 80), ctl.status]);

  console.log('§2 an agent bearer on every owner verb ⇒ 403');
  const verbs = [['GET', '/api/channels/webhook/paths'], ['POST', '/api/channels/webhook/paths', { slug: 'evil' }], ['PUT', '/api/channels/webhook/paths/ci', { title: 'x' }], ['POST', '/api/channels/webhook/paths/ci/callers', { name: 'mine' }], ['POST', `/api/channels/webhook/paths/ci/callers/${IDA}/rotate`, {}], ['POST', `/api/channels/webhook/paths/ci/callers/${IDA}/revoke`, {}], ['POST', `/api/channels/webhook/paths/ci/callers/${IDA}/delivery`, { delivery: { mode: 'none' } }]];
  const vr = [], vc = [];
  for (const [m, p, b] of verbs) vr.push(await agent(m, p, b === undefined ? null : b));
  for (const [m, p, b] of verbs) vc.push(await raw(m, p, { headers: { Cookie: `vs_token=${COOKIE}`, Authorization: 'Bearer ' + AG.token }, body: b === undefined ? null : b }));
  ok(vr.every((x) => x.status === 401), `sign-in ON: an agent's vsst_ bearer alone never passes the cookie gate on an owner verb (${verbs.length} × 401)`, vr.map((x) => x.status));
  ok(vc.every((x) => x.status === 403 && x.j && x.j.code === 'agent-forbidden'), `…and a SELF-IDENTIFYING agent bearer is refused by the route itself, even beside a cookie: every owner verb (${verbs.length}) ⇒ 403 agent-forbidden`, vc.map((x) => x.status));
  const jb = await raw('POST', '/api/channels/webhook/paths', { headers: { Authorization: 'Bearer jbt_' + 'x'.repeat(24) }, body: { slug: 'evil2' } });
  ok(jb.status === 403 || jb.status === 401, 'a job token (jbt_) is refused too', jb.status);
  const still = await owner('GET', '/api/channels/webhook/paths');
  ok(still.j && still.j.paths.length === 1 && still.j.paths[0].callers.length === 2 && !still.t.includes('vswh_') && !still.t.includes('tokenHash') && !still.t.includes('tokenEnc'), 'nothing changed; the owner\'s own list shows no token, no hash, no ciphertext');

  console.log('§3 receipts: opaque per caller');
  const rc = [];
  for (let i = 0; i < 2; i++) { rc.push(['A', (await raw('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + TA, 'Idempotency-Key': `ra-${i}` }, body: { text: `a ${i}`, env: 'test' } })).j]); const b = JSON.stringify({ text: `b ${i}`, env: 'test' }); rc.push(['B', (await raw('POST', '/hook/ci', { headers: signed('ci', b, TB, IDB), body: b })).j]); }
  const ids = rc.map(([, j]) => j && j.receiptId);
  const lcp = (x, y) => { let k = 0; while (k < x.length && x[k] === y[k]) k++; return k; };
  const cross = ids.filter((_, i) => rc[i][0] === 'A').flatMap((a) => ids.filter((_, i) => rc[i][0] === 'B').map((b) => lcp(a, b)));
  const diffs = (x, y) => [...x].filter((ch, i) => ch !== y[i]).length;
  ok(ids.every((x) => /^[0-9a-f]{16}$/.test(x || '')) && new Set(ids).size === 4 && Math.max(...cross) < 4, `four receipts, 16 hex each, distinct; the two callers' share no prefix (longest common ${Math.max(...cross)})`, ids);
  ok(diffs(ids[0], ids[2]) >= 8 && diffs(ids[1], ids[3]) >= 8 && rc.every(([, j]) => j && JSON.stringify(Object.keys(j)) === JSON.stringify(['ok', 'receiptId', 'path', 'reply'])), 'no monotonic counter: a caller\'s consecutive receipts differ in ≥ 8 of 16 places; the receipt is {ok, receiptId, path, reply} only');

  console.log('§4 the end to end: call ⇒ record ⇒ fact rule ⇒ ONE wake ⇒ reply --to ⇒ the signed POST ⇒ sent');
  const acc = await owner('PUT', '/api/channels/webhook/ci/access', { access: [{ principal: { kind: 'agent', id: AG.cid, name: AG.name }, authority: 'send' }] });
  const wat = await owner('PUT', '/api/channels/webhook/ci/watchers', { watchers: [{ principal: { kind: 'agent', id: AG.cid, name: AG.name }, notify: 'wake', mode: 'filtered', filter: { match: 'any', rules: [{ kind: 'fact', key: 'env', value: 'prod' }] } }] });
  ok(acc.status === 200 && wat.status === 200, 'the owner grants alpha (send) and a `fact env == prod` notification', [acc.status, acc.t.slice(0, 120), wat.status, wat.t.slice(0, 200)]);
  const f0 = frames().length;
  const sb = JSON.stringify({ text: 'staging deploy ok', env: 'staging' });
  await raw('POST', '/hook/ci', { headers: signed('ci', sb, TB, IDB), body: sb });
  const pb = JSON.stringify({ text: 'PROD deploy failed on db1', env: 'prod', who: 'ci-runner' });
  const pc = await raw('POST', '/hook/ci', { headers: signed('ci', pb, TB, IDB, { 'Idempotency-Key': 'prod-1' }), body: pb });
  const woke = await waitFor(() => frames().length > f0, 20000);
  await sleep(1500);
  const fr = frames().slice(f0);
  ok(pc.status === 200 && woke && fr.length === 1 && JSON.stringify(fr[0]).includes('PROD deploy failed'), `the env=prod call woke alpha ONCE (the staging call none): ${fr.length} frame(s)`, fr.map((x) => JSON.stringify(x).slice(0, 160)));
  const recId = `${IDB}:prod-1`;
  const rep = await agent('POST', '/api/agent/channels/reply', { conv: 'webhook/ci', text: 'on it — rolling back db1', replyTo: recId });
  const got = await waitFor(() => received.find((x) => x.body.includes('rolling back')), 15000);
  ok(rep.status === 200 && !!got, 'the agent\'s reply --to <the record> was sent straight (policy direct, authority send)', [rep.status, rep.t.slice(0, 300)]);
  if (got) {
    const ts = got.headers['x-webhook-timestamp'];
    const body = JSON.parse(got.body);
    ok(got.headers['x-webhook-signature'] === 'v1=' + hmacHex(TB, WA.signatureBase(ts, '/in', got.body)) && body.from.name === 'VibeSpace' && body.path === 'ci' && /^[0-9a-f]{16}$/.test(body.inReplyTo) && body.replyId.startsWith(IDB + ':') && /^c-[0-9a-f]{8}:[0-9a-f]{16}$/.test(body.replyId) && !/\bp-[0-9a-z]{6,}-[0-9a-z]+\b/.test(got.body) && !got.body.includes(AG.name), 'the caller\'s URL got ONE signed POST (v1 = HMAC(its token, ts.POST./in.body)), from the path\'s replyName — never the agent, inReplyTo = the caller\'s own receipt id', body);
    const recs = await owner('GET', '/api/channels/proposals');
    const prop = await waitFor(async () => { const o = await owner('GET', '/api/channels/outbox'); const ps = (o.j && (o.j.proposals || o.j.items)) || []; return ps.find((p) => p.adapterId === 'webhook' && p.state === 'sent') || null; }, 8000);
    ok(!!prop || (rep.j && rep.j.proposal && rep.j.proposal.state === 'sent'), 'the receipt says `sent`', (rep.j && rep.j.proposal && rep.j.proposal.state) || recs.status);
  }

  console.log('§5 a long-poll ended by a revoke ⇒ 401');
  const lp = raw('GET', '/api/channels/webhook/ci/replies?wait=20', { headers: { Authorization: 'Bearer ' + TA } });
  await sleep(600);
  const t1 = Date.now();
  const rv = await owner('POST', `/api/channels/webhook/paths/ci/callers/${IDA}/revoke`, {});
  const lpr = await lp;
  ok(rv.status === 200 && lpr.status === 401 && Date.now() - t1 < 5000, `the revoke ended the waiting poll at once: 401 in ${Date.now() - t1} ms`, [rv.status, lpr.status]);
  const after = await raw('POST', '/hook/ci', { headers: { Authorization: 'Bearer ' + TA }, body: { text: 'x' } });
  ok(after.status === 401, 'the revoked token is 401 at the door too');

  console.log('§6 a flood ⇒ 429, and the wakes held to the path\'s budget');
  const f1 = frames().length;
  const codes = [];
  for (let i = 0; i < 34; i++) { const b = JSON.stringify({ text: `flood ${i}`, env: 'prod' }); codes.push((await raw('POST', '/hook/ci', { headers: signed('ci', b, TB, IDB, { 'Idempotency-Key': `fl-${i}` }), body: b })).status); }
  await sleep(4000);
  const wakes = frames().length - f1;
  // int248 r2 (verify r1 #4): the stranger gate charges only refusals before auth — a PROVEN caller's 34 calls from one address
  // are bounded by ITS rate (60 / min here), and a stranger's bad tokens meet the gate's same-shape 429
  const sc = [];
  for (let i = 0; i < 31; i++) sc.push((await raw('POST', '/hook/ci', { headers: { Authorization: 'Bearer vswh_' + '0'.repeat(48), 'Content-Type': 'application/json' }, body: '{}' })).status);
  ok(codes.every((c) => c === 200) && sc.every((c) => c === 401 || c === 429) && sc[30] === 429, `the flood: a proven caller's 34 calls all land (its own rate, not the stranger gate); a stranger's bad tokens meet the gate (${sc.filter((c) => c === 429).length} × 429 of ${sc.length})`, { proven: codes.join(','), stranger: sc.join(',') });
  ok(wakes <= 1, `the flood's prod calls woke alpha at most once more — the path's budget (2 / hour, one spent above) holds the rest (${wakes})`, wakes);
} catch (e) { fail++; console.error('  ✗ threw:', e.stack || e.message); }
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
