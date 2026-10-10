#!/usr/bin/env node
// test-webhook-pair-e2e — TWO REAL SERVERS PAIR (lane webhook-l3-cli-pair; docs/design-webhook.zh.md §12). Two throwaway
// worktrees of THIS tree run `node server.js` on loopback, sign-in ON, `webhook.allowPrivateReplyUrl` + agentd.publicUrl
// (the instance URL) in each fixture, one dtach stub agent each (alpha on A, beta on B). A's owner mints a code, B's owner
// joins; beta (the REAL vibespace-channels binary) reads its path — the `callers:` header names A as a peer — and
// `compose --caller`s A ⇒ a `peer` record on A by the registered name; alpha `reply --to`s that record ⇒ a record on B by
// A's name; `vibespace-channels list` names the path webhook/<slug>; A re-pairs ⇒ both rows rotate in place, the old
// token is 401 after and the new pair still carries a message. Heavy (two servers). Run: node scripts/test-webhook-pair-e2e.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execSync, execFileSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { freePort, scratch, scratchHome, vncEnv, endRootedProcesses } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WA = require(path.join(repo, 'src/webhook-auth.js'));
const WP = require(path.join(repo, 'src/webhook-pair.js'));
const T0 = Date.now();
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 700) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 20000, step = 150) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = await fn(); if (v) return v; } catch { } await sleep(step); } return null; };
try { execFileSync('dtach', ['--help'], { stdio: 'ignore' }); } catch (e) { if (e.code === 'ENOENT') { console.log('SKIP: no dtach on PATH (the stub agent sessions are dtach sessions)'); process.exit(0); } }
const hmacHex = (k, t) => crypto.createHmac('sha256', k).update(t).digest('hex');
const VNC_ENV = await vncEnv();
const STUB_SRC = `'use strict';
const net = require('net'), fs = require('fs'), path = require('path');
const [cid, name, sock, log] = process.argv.slice(2);
try { fs.unlinkSync(sock); } catch {}
const dir = path.join(process.env.HOME, '.claude', 'sessions');
fs.mkdirSync(dir, { recursive: true });
const srv = net.createServer((c) => { let buf = ''; c.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line) fs.appendFileSync(log, line + '\\n'); } }); });
srv.listen(sock, () => fs.writeFileSync(path.join(dir, process.pid + '.json'), JSON.stringify({ pid: process.pid, sessionId: cid, messagingSocketPath: sock, name })));
setInterval(() => {}, 1 << 30);
`;
const cleanups = [];
process.on('exit', () => { for (const c of cleanups) c(); });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { process.exit(143); });
async function boot(tag, ag) {
  const PORT = await freePort();
  const wt = scratch('webhook-pair-e2e-' + tag);
  const home = scratchHome('webhook-pair-e2e-home-' + tag, fs);
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  fs.writeFileSync(path.join(wt, 'data/settings.json'), JSON.stringify({ 'webhook.allowPrivateReplyUrl': true, 'channels.pushCoalesceSeconds': 0, 'agentd.publicUrl': `http://127.0.0.1:${PORT}` }));
  const STUB = path.join(wt, 'stub-cli.cjs');
  fs.writeFileSync(STUB, STUB_SRC);
  const SOCK_DIR = path.join(wt, 'data/sockets'), META_DIR = path.join(wt, 'data/session-meta');
  fs.mkdirSync(SOCK_DIR, { recursive: true }); fs.mkdirSync(META_DIR, { recursive: true });
  const AG = { ...ag, sockName: `cw-1-${T0}` };
  fs.writeFileSync(path.join(META_DIR, AG.sockName + '.json'), JSON.stringify({ webuiSessionId: 'sess-pair-' + tag, sockName: AG.sockName, claudeSessionId: AG.cid, backendSessionId: AG.cid, name: AG.name, mode: 'chat', backend: 'claude', cwd: wt, createdAt: T0, agentToken: AG.token }));
  execFileSync('dtach', ['-n', path.join(SOCK_DIR, AG.sockName), '-E', '-z', process.execPath, STUB, AG.cid, AG.name, path.join(wt, 'inbox.sock'), path.join(wt, 'frames.ndjson')], { env: { ...process.env, HOME: home } });
  const PASSWORD = 'webhook-pair-' + tag + process.pid;
  const srv = spawn(process.execPath, ['server.js'], { cwd: wt, stdio: 'ignore', env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: PASSWORD } });
  cleanups.push(() => {
    try { srv.kill('SIGKILL'); } catch { }
    try { endRootedProcesses(wt); } catch { }
    try { execFileSync('pkill', ['-KILL', '-f', STUB], { stdio: 'ignore' }); } catch { }
    try { execFileSync('pkill', ['-KILL', '-f', SOCK_DIR], { stdio: 'ignore' }); } catch { }
    try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
    for (const d of [home, wt]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
  });
  const I = { tag, PORT, wt, AG, cookie: '' };
  I.raw = (method, p, { headers = {}, body = null } = {}) => new Promise((resolve) => {
    const b = body === null ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers: { ...(b !== null ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(b)) } : {}), ...headers } }, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => { let j = null; try { j = JSON.parse(t); } catch { } resolve({ status: res.statusCode, t, j, headers: res.headers }); }); });
    req.on('error', (e) => resolve({ status: 0, t: String(e.code), j: null }));
    if (b !== null) req.write(b); req.end();
  });
  I.owner = (method, p, body = null) => I.raw(method, p, { headers: { Cookie: `vs_token=${I.cookie}` }, body });
  I.cli = (args) => new Promise((resolve) => execFile(process.execPath, [path.join(wt, 'data/bin/vibespace-channels'), ...args], { env: { PATH: process.env.PATH, VIBESPACE_API: `http://127.0.0.1:${PORT}`, VIBESPACE_SESSION_TOKEN: AG.token }, timeout: 20000 }, (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr })));
  I.callers = (slug) => { try { return JSON.parse(fs.readFileSync(path.join(wt, 'data/channels/webhook/callers.json'), 'utf-8')).paths[slug].callers; } catch { return []; } };
  I.up = async () => {
    const up = await waitFor(async () => (await I.raw('GET', '/api/channels/webhook/paths')).status === 401, 60000, 300);
    const r2 = await fetch(`http://127.0.0.1:${PORT}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });
    I.cookie = ((r2.headers.get('set-cookie') || '').match(/vs_token=([A-Za-z0-9]+)/) || [])[1] || '';
    let roster = null;
    for (let i = 0; i < 60; i++) { roster = await I.owner('GET', '/api/channel-groups/roster'); if (roster.j && Array.isArray(roster.j.sessions) && roster.j.sessions.some((x) => x.cid === AG.cid)) break; await sleep(500); }
    return !!up && !!I.cookie && !!(roster.j && roster.j.sessions.some((x) => x.cid === AG.cid));
  };
  return I;
}
try {
  const [A, B] = await Promise.all([
    boot('a', { cid: 'a1a1a1a1-0000-4000-8000-0000000000a1', name: 'alpha', token: 'vsst_' + 'webhookpairalpha00000000000001' }),
    boot('b', { cid: 'b2b2b2b2-0000-4000-8000-0000000000b2', name: 'beta', token: 'vsst_' + 'webhookpairbeta000000000000002' }),
  ]);
  const ups = await Promise.all([A.up(), B.up()]);
  ok(ups[0] && ups[1], 'FIXTURE: two servers up (sign-in ON), each owner logged in, each stub agent adopted (alpha on A, beta on B)', ups);
  const mk = await A.owner('POST', '/api/channels/webhook/paths', { slug: 'ci', title: 'CI' });
  const code1 = await A.owner('POST', '/api/channels/webhook/paths/ci/pair-code', { name: 'Hub A' });
  ok(mk.status === 200 && code1.status === 200 && code1.j.code.startsWith('vswp_') && code1.j.hookUrl === `http://127.0.0.1:${A.PORT}/hook/ci`, 'A\'s owner mints a code — A\'s hook URL from the instance URL', code1.t.slice(0, 200));
  const join = await B.owner('POST', '/api/channels/webhook/join', { code: code1.j.code, slug: 'hub-a', name: 'Hub B' });
  const aRow = A.callers('ci')[0] || {}, bRow = B.callers('hub-a')[0] || {};
  ok(join.status === 200 && aRow.kind === 'peer' && aRow.name === 'Hub B' && aRow.delivery.replyUrl === `http://127.0.0.1:${B.PORT}/hook/hub-a` && bRow.kind === 'peer' && bRow.name === 'Hub A' && bRow.delivery.replyUrl === `http://127.0.0.1:${A.PORT}/hook/ci`, 'B\'s owner joins ⇒ each server holds the other as a `peer` caller (reply-url = the other\'s hook)', { join: join.t.slice(0, 200), aRow, bRow });
  const ga = await A.owner('PUT', '/api/channels/webhook/ci/access', { access: [{ principal: { kind: 'agent', id: A.AG.cid, name: A.AG.name }, authority: 'send' }] });
  const gb = await B.owner('PUT', '/api/channels/webhook/hub-a/access', { access: [{ principal: { kind: 'agent', id: B.AG.cid, name: B.AG.name }, authority: 'send' }] });
  ok(ga.status === 200 && gb.status === 200, 'FIXTURE: each owner grants its agent (send) on the paired path');
  const lsA = await A.cli(['list']);
  ok(lsA.code === 0 && lsA.stdout.includes('webhook/ci'), 'alpha: `vibespace-channels list` names the path webhook/ci like any conversation', lsA.stdout.slice(0, 400));
  const rdB = await B.cli(['read', 'webhook/hub-a']);
  ok(rdB.code === 0 && rdB.stdout.includes('callers: 1') && rdB.stdout.includes(`  ${bRow.id} "Hub A" · peer · delivery reply-url · last call never · generation 1`) && !/vsw[hp]_/.test(rdB.stdout), 'beta: `read webhook/hub-a` prints the callers header — A as a peer (id, name, kind, delivery, last call, generation)', rdB.stdout);
  const cmp = await B.cli(['compose', 'webhook/hub-a', '--caller', bRow.id, 'nightly build 812 is green']);
  const recA = await waitFor(async () => { const r = await A.cli(['read', 'webhook/ci']); return r.stdout.includes('nightly build 812 is green') ? r : null; }, 15000, 300);
  ok(cmp.code === 0 && /sent directly \(policy: direct\) — proposal \S+ to c-/.test(cmp.stdout) && recA && recA.stdout.includes('Hub B: nightly build 812 is green') && recA.stdout.includes(`  ${aRow.id} "Hub B" · peer · delivery reply-url`), 'beta `compose --caller` A ⇒ a `peer` record on A by the REGISTERED name (alpha reads it, with the callers header)', { cmp, recA: recA && recA.stdout });
  const vid = recA ? ((recA.stdout.match(/nightly build 812 is green\s+\(id (\S+)\)/) || [])[1] || '') : '';
  const rep = await A.cli(['reply', 'webhook/ci', 'thanks — promoting 812', '--to', vid]);
  const recB = await waitFor(async () => { const r = await B.cli(['read', 'webhook/hub-a']); return r.stdout.includes('thanks — promoting 812') ? r : null; }, 15000, 300);
  ok(!!vid && rep.code === 0 && /sent directly/.test(rep.stdout) && recB && recB.stdout.includes('Hub A: thanks — promoting 812'), 'alpha `reply --to` that record ⇒ it lands on B as a record by A\'s name', { vid, rep, recB: recB && recB.stdout.slice(0, 500) });
  const amb = await A.cli(['reply', 'webhook/ci', 'x']);
  ok(amb.code === 0 && /sent directly/.test(amb.stdout), 'alpha `reply` without --to on a ONE-caller path ⇒ that caller (sent directly)', amb);
  // re-pair: both rows rotate in place; the old token is refused after; the new pair carries a message
  const oldTAB = WP.decodeCode(code1.j.code, Date.now()).token;
  const code2 = await A.owner('POST', '/api/channels/webhook/paths/ci/pair-code', { callerId: aRow.id, name: 'Hub A' });
  const join2 = await B.owner('POST', '/api/channels/webhook/join', { code: code2.j.code, slug: 'hub-a', name: 'Hub B' });
  const aRow2 = A.callers('ci').find((c) => c.id === aRow.id) || {}, bRow2 = B.callers('hub-a').find((c) => c.id === bRow.id) || {};
  ok(join2.status === 200 && join2.j.repaired === true && A.callers('ci').length === 1 && B.callers('hub-a').length === 1 && aRow2.generation === 2 && bRow2.generation === 2, 're-pairing rotates both rows IN PLACE (same ids, generation 2)', { join2: join2.t.slice(0, 200) });
  const ob = WP.peerBody({ text: 'sent with the OLD token', name: 'x' });
  const ts = String(Math.floor(Date.now() / 1000));
  const old = await A.raw('POST', '/hook/ci', { headers: { 'Content-Type': 'application/json', 'X-Webhook-Caller': aRow.id, 'X-Webhook-Timestamp': ts, 'X-Webhook-Signature': 'v1=' + hmacHex(oldTAB, WA.signatureBase(ts, '/hook/ci', ob)) }, body: ob });
  ok(old.status === 401 && JSON.stringify(old.j) === JSON.stringify(WA.ANSWERS.unauthorized.body), 'the token A issued BEFORE the re-pair is the same-shape 401 after it');
  const fr = WP.frameOf({ nonce: 'a'.repeat(32), hookUrl: `http://127.0.0.1:${B.PORT}/hook/hub-a`, caller: bRow.id, token: 'vswh_' + '1'.repeat(48), name: 'x' });
  const tAB2 = WP.decodeCode(code2.j.code, Date.now()).token;
  const ts2 = String(Math.floor(Date.now() / 1000));
  const before = (await A.cli(['read', 'webhook/ci'])).stdout.split('\n').filter((l) => l.startsWith('[')).length;
  const onHook = await A.raw('POST', '/hook/ci', { headers: { 'Content-Type': 'application/json', 'X-Webhook-Caller': aRow.id, 'X-Webhook-Timestamp': ts2, 'X-Webhook-Signature': 'v1=' + hmacHex(tAB2, WA.signatureBase(ts2, '/hook/ci', fr)) }, body: fr });
  const after = (await A.cli(['read', 'webhook/ci'])).stdout.split('\n').filter((l) => l.startsWith('[')).length;
  ok(onHook.status === 401 && after === before, 'a completion frame POSTed to /hook/ci (signed with the live token) ⇒ 401, no record', [onHook.status, before, after]);
  const cmp2 = await B.cli(['compose', 'webhook/hub-a', '--caller', bRow.id, 'after the re-pair']);
  const recA2 = await waitFor(async () => { const r = await A.cli(['read', 'webhook/ci']); return r.stdout.includes('Hub B: after the re-pair') ? r : null; }, 15000, 300);
  ok(cmp2.code === 0 && !!recA2 && recA2.stdout.includes('· generation 2'), 'the re-paired tokens carry the next message B → A (the header says generation 2)', { cmp2, recA2: recA2 && recA2.stdout.slice(0, 400) });
  const sinks = [A, B].flatMap((I) => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'sockets') walk(f); } else out.push(f); } }; walk(path.join(I.wt, 'data')); return out; });
  const sent = [code1.j.code, code2.j.code, oldTAB, tAB2];
  const hits = sinks.filter((f) => { try { const t = fs.readFileSync(f, 'latin1'); return sent.some((s) => t.includes(s)); } catch { return false; } });
  ok(!hits.length && sinks.length > 10, `neither code nor A's tokens in any of the ${sinks.length} files under both data/ dirs`, hits);
} catch (e) { fail++; console.error('  ✗ threw:', e.stack || e.message); }
console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`} — ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
