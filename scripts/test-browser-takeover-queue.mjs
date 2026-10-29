#!/usr/bin/env node
// test-browser-takeover-queue — FAST, in-process (lane browser-takeover-queue — a fleet power user, 2026-10-23: 「我觉得可以在
// browser 这个里面加一个像 Chatbot 的 outbox 一样的功能。…所有等待我 take over 的都在这里集中一下，然后这样我多个 task 并行的时候
// 都可以在这集中处理这些需要 take over 的东西」). ASK A PERSON — ONE request per lease, end to end:
//   the REAL keeper (the request record's ONE writer, its own data dir) + the browser routes in-process + the REAL handback
//   announcer over a REAL For-you store (UserTodoManager) + the SHIPPED CLI (data/bin/vibespace-browser) over the fake
//   `agent-browser` of test-browser-takeover (a real `sleep` daemon per browser):
//   · ask-human files ONE request (waiting) — the queue, the broadcast, data/browser-takeovers.json, ONE urgent For-you item
//     naming it; a second ask on the same lease RE-ASSERTS (the same id, the same item, the new words)
//   · a page verb while it waits: 409 human_asked + the request; a takeover moves it to taken and the verb's browser_paused
//     carries it; a handback nobody chose (the view closed) puts it back to waiting; the EXPLICIT handback resolves it — its
//     ONE delivery names the request, its item resolved by the handback; the next verb runs
//   · the person's Done without a takeover tells the agent ONCE (a second Done: closed); Done on a taken request IS the
//     explicit handback; an agent's bearer never reads the queue or presses Done; another conversation never reads it
//   · the agent's withdraw; a dismissal PARKS it (band 4, still listed, the SAME item); a reply through the item reopens it
//     and wakes the CLI's long-poll (`replied`); the item's ✓ is the person's Done
//   · the CLI: usage, the verb's line, --status, a page verb that WAITS (through the takeover) and runs after the handback,
//     the BOUNDED wait (the server's budget — the gate's 3 s: still waiting ⇒ nothing ran, exit 1), --withdraw, the usage text
//   · the lease going away withdraws it (lease-gone, its item resolved); a restart is a handback (taken ⇒ waiting at load)
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, freePort, deadPort } from './scratch.mjs';
const DEAD_CDP = await deadPort(); // the fake's cdp-url: a port the kernel just released, never a fixed one (§81) // lane H: copiesCensus; lane J r2: the stale sweep's patched-copy control
const require = createRequire(import.meta.url);
const B = require('../src/browser-profiles.js');
const K = require('../src/server/browser-keeper.js');
const H = require('../src/server/browser-handback.js');
const express = require('express');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } return !!c; };
const REPO = new URL('..', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms = 3000, every = 20) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(every); } return pred(); };

// ── scratch world ──
const ROOT = scratch('browser-tq');
fs.rmSync(ROOT, { recursive: true, force: true });
const HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
const DATA = path.join(ROOT, 'data'); fs.mkdirSync(DATA, { recursive: true });
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
const NODE_DIR = path.dirname(process.execPath);
const PATH_ENV = `${BIN}:${NODE_DIR}:${process.env.PATH || '/usr/bin:/bin'}`;
process.env.PATH = PATH_ENV;
// The FAKE agent-browser (the handles suite's, plus `confirm`/`deny` which log
// the env they ran under — the suite asserts the lease's SESSION name).
fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const [a, b] = argv;
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'wait') { setTimeout(() => { out({ success: true, data: { waited: Number(b) || 0 } }); process.exit(0); }, Number(b) || 0); return; }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, profile: process.env.AGENT_BROWSER_PROFILE || null }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'launches.log'), JSON.stringify({ ns, ...s }) + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); } out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); let closed = 0; if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); closed = 1; } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed, failed: [], sessions: [] } }); process.exit(0); }
// lane browser-viewport-answer (⑪): \`set viewport W H\` / \`set device NAME\` resize the fake page the fake CDP endpoint answers for
{ const vi = argv.indexOf('set'); if (vi >= 0 && (argv[vi + 1] === 'viewport' || argv[vi + 1] === 'device')) { fs.appendFileSync(path.join(st, 'sets.log'), JSON.stringify({ ns, argv: argv.slice(vi) }) + '\\n'); const pg = argv[vi + 1] === 'device' ? { w: 390, h: 844 } : { w: Number(argv[vi + 2]), h: Number(argv[vi + 3]) }; let prev = {}; try { prev = JSON.parse(fs.readFileSync(path.join(st, 'vp-page.json'), 'utf8')); } catch { } fs.writeFileSync(path.join(st, 'vp-page.json'), JSON.stringify({ ...prev, ...pg })); out({ success: true, data: { width: pg.w, height: pg.h } }); process.exit(0); } }
if (a === 'confirm' || a === 'deny') { fs.appendFileSync(path.join(st, 'confirms.log'), JSON.stringify({ verb: a, id: b, ns, session: process.env.AGENT_BROWSER_SESSION || null, profile: process.env.AGENT_BROWSER_PROFILE || null }) + '\\n'); if (b === 'c_gone') { out({ success: false, data: null, error: 'No pending confirmation' }); process.exit(1); } out({ success: true, data: { confirmed: a === 'confirm', id: b }, error: null }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
const launches = () => { try { return fs.readFileSync(path.join(AB_STATE, 'launches.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const confirms = () => { try { return fs.readFileSync(path.join(AB_STATE, 'confirms.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const spawnedPids = new Set();
function reapAll() { for (const l of launches()) if (l.pid) spawnedPids.add(l.pid); for (const pid of spawnedPids) { try { process.kill(pid, 'SIGKILL'); } catch { } } }
const servers = [];
function cleanup() { reapAll(); for (const s of servers) { try { s.close(); } catch { } } fs.rmSync(ROOT, { recursive: true, force: true }); }
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });

const KEY_A = 'bk-0000000a', KEY_B = 'bk-0000000b';
const rtEnv = { FAKE_AB_STATE: AB_STATE, PATH: PATH_ENV, HOME };
const F = require('../src/browser-facts.js');
let clock = 1_000_000;
const now = () => clock;

const settings = { 'browser.takeoverIdleMs': 30000, 'browser.idleTimeoutMs': 600000 };

// ═══ lane browser-takeover-queue: ASK A PERSON — ONE request per lease, its ONE For-you item, the CLI's verb + its wait ═══
// A fleet power user (2026-10-23): 「…所有等待我 take over 的都在这里集中一下…」. The REAL keeper (its own data dir) + the
// routes in-process + the REAL announcer over a REAL For-you store + the shipped CLI: ask → waiting (a page verb refused
// human_asked, the CLI waits) → taken (browser_paused WITH the request) → the explicit handback ends it (the delivery names
// it, the item resolved) · a handback nobody chose puts it back to waiting · Done without a takeover tells the agent once ·
// withdraw · a re-ask re-asserts (ONE row, the SAME item) · a dismissal parks it (band 4, still listed) · a reply reopens
// the item and wakes the wait · the lease ending withdraws it · a restart is a handback (taken ⇒ waiting).
console.log('— lane browser-takeover-queue: ask-human — one request per lease, its one For-you item, the CLI\'s verb + its wait');
{
  const R = require('../src/routes/browser.js');
  const TQ = require('../src/browser-takeover-request.js');
  const { UserTodoManager } = require('../src/user-todos.js');
  const D12 = path.join(ROOT, 'data12'); fs.mkdirSync(D12, { recursive: true });
  const KEY_C = 'bk-0000000c', KEY_D = 'bk-0000000d';
  let clock12 = 5_000_000;
  const bc12 = [];
  const quiet = { log() { }, warn() { }, error() { } };
  const mkKeeper = () => K.create({ dataDir: D12, homeDir: HOME, env: () => rtEnv, broadcast: (m) => bc12.push(m), serverSetting: (k) => settings[k], serverNotice: null, getTelemetry: () => null,
    liveKeys: () => new Set([KEY_C, KEY_D]), runtime: F.createBrowserRuntime({ env: rtEnv }), facts: F.createBrowserFacts({ env: rtEnv }), log: quiet, now: () => clock12, install: false, askWaitMs: 3000 });
  const k12 = mkKeeper();
  const p = k12.createProfile({ label: 'Bank' }, { owner: { kind: 'session', id: KEY_C } });
  await k12.attach({ profileId: p.id, browserKey: KEY_C, sessionId: 'sess-c' });
  const TOKEN = 'vsst_' + 'c'.repeat(24), TOKEN_D = 'vsst_' + 'd'.repeat(24);
  const sessC = { agentToken: TOKEN, _browserKey: KEY_C, name: 'Bank reconcile', _browserEnv: [], claudeSessionId: 'conv-c' };
  const active = new Map([['sess-c', sessC], ['sess-d', { agentToken: TOKEN_D, _browserKey: KEY_D, name: 'other', _browserEnv: [], claudeSessionId: 'conv-d' }]]);
  const UT = new UserTodoManager({ dataDir: path.join(ROOT, 'ut12'), onChange: () => { }, expirySweepMs: 0 });
  const delivered = [];
  const deliver = { deliverToConversation: async (cid, text, opts) => { delivered.push({ cid, text, opts }); return { ok: true, via: 'test' }; }, stashFor: () => ({ stored: true }) };
  const ann = H.create({ keeper: k12, deliver, serverSetting: () => undefined, userTodos: UT, activeSessions: active, sessionKeyFor: (s, id) => 'claude:' + (s.claudeSessionId || id), notice: () => { }, log: quiet });
  ann.install();
  R.setup({ keeper: k12, activeSessions: active, browserEnv: () => null, notice: () => { } });
  const app = express(); app.use(express.json()); app.use(R.router);
  const srv = http.createServer(app); const PORT = await freePort(); await new Promise((r) => srv.listen(PORT, '127.0.0.1', r)); servers.push(srv);
  const API = `http://127.0.0.1:${PORT}`;
  const call = async (method, p0, body, headers = {}) => { const r = await fetch(API + p0, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, json: await r.json() }; };
  const asC = { Authorization: 'Bearer ' + TOKEN }, asD = { Authorization: 'Bearer ' + TOKEN_D };
  const items = () => UT._state.items.filter((i) => i.action && i.action.type === 'browser-takeover');
  const settle = () => sleep(30); // the announcer's tellDone / delivery are awaited off the event

  // ask
  const e0 = await call('POST', '/api/agent/browser/takeover-request', { text: '   ' }, asC);
  ok(e0.status === 400 && e0.json.code === 'empty', 'an ask with no words is refused empty (400)');
  const a1 = await call('POST', '/api/agent/browser/takeover-request', { text: 'Log in to the bank and solve the captcha' }, asC);
  const id = a1.json.request && a1.json.request.id;
  ok(a1.status === 200 && TQ.ID_RE.test(String(id)) && a1.json.request.state === 'waiting' && !a1.json.reasserted && /asked a human to take over the "Bank" browser/.test(a1.json.line) && /waits until they hand back or you withdraw/.test(a1.json.line), 'ask-human files ONE request (waiting) and answers the agent\'s line (where the person sees it, the next verb waits)', JSON.stringify(a1.json).slice(0, 300));
  const q1 = k12.takeoverRequests();
  ok(q1.length === 1 && q1[0].id === id && q1[0].profileId === p.id && q1[0].browserKey === KEY_C && q1[0].sessionId === 'sess-c' && q1[0].conversationName === 'Bank reconcile' && q1[0].profileLabel === 'Bank', 'the keeper\'s queue lists it: the lease (browser key × profile), the session, the conversation\'s and the profile\'s names');
  const bcLast = bc12.filter((m) => m.type === 'browser-takeovers-updated').pop();
  ok(bcLast && bcLast.requests.length === 1 && bcLast.requests[0].id === id && !('takenBy' in bcLast.requests[0]), 'broadcast with the change (`browser-takeovers-updated`, the owner\'s queue — no viewer id)');
  const disk = JSON.parse(fs.readFileSync(path.join(D12, 'browser-takeovers.json'), 'utf8'));
  ok(disk.version === 1 && disk.requests.length === 1 && disk.requests[0].id === id && disk.requests[0].state === 'waiting', 'persisted (data/browser-takeovers.json, writeJsonAtomic)');
  const it1 = items();
  ok(it1.length === 1 && it1[0].status === 'open' && it1[0].urgency === 'urgent' && it1[0].action.requestId === id && it1[0].sessionKey === 'claude:conv-c' && it1[0].origin === 'browser' && it1[0].i18n.text.params.words === 'Log in to the bank and solve the captcha', 'the SAME request rides ONE For-you item: urgent (band 1), action browser-takeover naming it, under the conversation\'s key');
  ok(k12.takeoverRequest(id).itemId === it1[0].id && k12.takeoverRequest(id).conversationKey === 'claude:conv-c', 'the record knows its item (one record, two places)');
  // a second ask on the same lease RE-ASSERTS
  clock12 += 60000;
  const a2 = await call('POST', '/api/agent/browser/takeover-request', { text: 'Also accept the cookie banner' }, asC);
  ok(a2.json.request.id === id && a2.json.reasserted && k12.takeoverRequests().length === 1 && k12.takeoverRequest(id).asks === 2 && /the same request/.test(a2.json.line), 'a second ask on the same lease re-asserts it — the same id, asks 2, never a second row');
  ok(items().length === 1 && items()[0].id === it1[0].id && items()[0].i18n.text.params.words === 'Also accept the cookie banner', '…and the SAME For-you item carries the new words');
  // a page verb while it waits
  const rz1 = await call('POST', '/api/agent/browser/resolve', { handle: '', wrapper: true }, asC);
  ok(rz1.status === 409 && rz1.json.code === 'human_asked' && rz1.json.request && rz1.json.request.id === id && rz1.json.request.waitMs === 3000 && /did NOT run yet/.test(rz1.json.error), 'a page verb while a person is asked: 409 human_asked + the request (the CLI waits on it)');
  // the other conversation sees nothing of it
  const g0 = await call('GET', `/api/agent/browser/takeover-request?id=${id}`, undefined, asD);
  const own = await call('GET', '/api/browser/takeovers', undefined, asC);
  ok(g0.status === 404 && own.status === 403 && own.json.code === 'agent_forbidden', 'another conversation cannot read the request (404); an agent\'s bearer never reads the queue (403 agent_forbidden)');
  const owner = await call('GET', '/api/browser/takeovers');
  ok(owner.status === 200 && owner.json.requests.length === 1 && owner.json.requests[0].id === id, 'the owner\'s GET /api/browser/takeovers lists it');
  // the person takes over: taken; the verb answers browser_paused WITH the request
  k12.takeover({ browserKey: KEY_C, profileId: p.id, viewerId: 61, sessionId: 'sess-c' });
  const rz2 = await call('POST', '/api/agent/browser/resolve', { handle: '', wrapper: true }, asC);
  ok(k12.takeoverRequest(id).state === 'taken' && rz2.status === 409 && rz2.json.code === 'browser_paused' && rz2.json.request && rz2.json.request.state === 'taken', 'a takeover moves it to taken (the keeper\'s own takeover road); the verb answers browser_paused WITH the request (the CLI keeps waiting)');
  // a handback nobody chose (the view closed): waiting again, still listed, the item still open
  k12.handback({ browserKey: KEY_C, profileId: p.id, cause: 'viewer-left' });
  ok(k12.takeoverRequest(id).state === 'waiting' && k12.takeoverRequests().length === 1 && items()[0].status === 'open', 'a handback nobody chose (the live view closed) puts it back to WAITING — still listed, the item still open');
  // the explicit handback ends it: done, the delivery names it, the item resolved
  k12.takeover({ browserKey: KEY_C, profileId: p.id, viewerId: 62, sessionId: 'sess-c' });
  clock12 += 1000;
  const h1 = await call('POST', '/api/browser/handback', { sessionId: 'sess-c' }, { 'Sec-Fetch-Site': 'same-origin' });   // lane owner-press-attended r2: the person's page (the door mints the PRESS)
  await settle();
  const r1 = k12.takeoverRequest(id);
  ok(h1.status === 200 && r1.state === 'done' && r1.how === 'handback' && k12.takeoverRequests().length === 0, 'the explicit Hand back resolves it (done, by the handback) — it leaves the queue');
  const dv = delivered.filter((d) => d.cid === 'conv-c').pop();
  ok(dv && /The user handed .*"Bank" browser.* back to you after/.test(dv.text) && dv.text.includes(`This answers your request ${id} ("Also accept the cookie banner") — it is done.`) && dv.opts.spendReason === 'browser-handback', 'the handback\'s ONE delivery names the request it answers (src/browser-interrupt.js\'s words + the request\'s id)', dv && dv.text);
  ok(items()[0].status === 'done' && items()[0].resolvedBy === 'handed-back', '…and its For-you item is resolved by the handback (never by a dismissal)');
  const rz3 = await call('POST', '/api/agent/browser/resolve', { handle: '', wrapper: true }, asC);
  ok(rz3.status === 200 && rz3.json.ok, 'the agent\'s next verb runs');
  // a NEW ask on the same lease (the old one is closed) is a new request; the person's Done without a takeover tells the agent once
  const a3 = await call('POST', '/api/agent/browser/takeover-request', { text: 'Approve the payment in the bank app' }, asC);
  const id3 = a3.json.request.id;
  ok(id3 !== id && k12.takeoverRequests().length === 1, 'an ask after the request closed is a NEW request (its own id)');
  const n0 = delivered.length;
  const d1 = await call('POST', `/api/browser/takeovers/${id3}/done`, {});
  await settle();
  ok(d1.status === 200 && d1.json.how === 'done' && k12.takeoverRequest(id3).state === 'done' && k12.takeoverRequest(id3).how === 'done', 'the person\'s Done on a waiting request resolves it (no takeover)');
  ok(delivered.length === n0 + 1 && /marked your browser request .* done from the Agent browser window/.test(delivered[delivered.length - 1].text), '…and the agent is told ONCE (the announcer\'s one ladder site)', delivered.slice(n0).map((d) => d.text).join(' | '));
  const d2 = await call('POST', `/api/browser/takeovers/${id3}/done`, {});
  ok(d2.status === 409 && d2.json.code === 'closed' && delivered.length === n0 + 1, 'CONTROL: a second Done is refused closed — nothing is told twice');
  const dAgent = await call('POST', `/api/browser/takeovers/${id3}/done`, {}, asC);
  ok(dAgent.status === 403 && dAgent.json.code === 'agent_forbidden', 'an agent\'s bearer never presses Done');
  // Done on a TAKEN request = the explicit handback
  const a4 = await call('POST', '/api/agent/browser/takeover-request', { text: 'Pick the right account' }, asC);
  k12.takeover({ browserKey: KEY_C, profileId: p.id, viewerId: 63, sessionId: 'sess-c' });
  clock12 += 1000;
  const d4 = await call('POST', `/api/browser/takeovers/${a4.json.request.id}/done`, {});
  ok(d4.json.how === 'handback' && k12.inputStateFor(KEY_C, p.id).input === 'agent' && k12.takeoverRequest(a4.json.request.id).how === 'handback', 'Done on a TAKEN request is the explicit handback (the controls go back to the agent, the request done by it)');
  // withdraw
  const a5 = await call('POST', '/api/agent/browser/takeover-request', { text: 'Solve the puzzle' }, asC);
  const w5 = await call('POST', '/api/agent/browser/takeover-request', { withdraw: true }, asC);
  await settle();
  ok(w5.status === 200 && /withdrew request/.test(w5.json.line) && k12.takeoverRequest(a5.json.request.id).state === 'withdrawn' && items().find((i) => i.action.requestId === a5.json.request.id).resolvedBy === 'agent', 'the agent withdraws its request (withdrawn; its item resolved by the agent)');
  const w6 = await call('POST', '/api/agent/browser/takeover-request', { withdraw: true }, asC);
  ok(w6.status === 409 && w6.json.code === 'no_request', 'nothing open ⇒ the withdraw is refused no_request');
  // a dismissal parks it (band 4, still listed); a reply reopens the item and wakes the CLI's wait; the ✓ is the person's Done
  const a7 = await call('POST', '/api/agent/browser/takeover-request', { text: 'Enter the SMS code' }, asC);
  const id7 = a7.json.request.id;
  const it7 = items().find((i) => i.action.requestId === id7);
  UT.setStatus(it7.id, 'dismissed', 'user');
  ok(k12.takeoverRequest(id7).state === 'waiting' && k12.takeoverRequest(id7).parked === true && UT.get(it7.id).status === 'open' && UT.get(it7.id).urgency === 'normal' && k12.takeoverRequests().length === 1, 'a dismissal of the item PARKS the request — still listed, the SAME item open at band 4 (normal), never resolved by it');
  const A_ = require('../src/attention-model.js');
  ok(A_.bandOfRow(A_.rowOf(UT.get(it7.id), clock12), clock12) === 4 && TQ.takeoverBadge(k12.takeoverRequests(), clock12, { bands: A_.settingsPolicy(() => undefined), needsMe: A_.needsMe }) === 1, '…its item is a band-4 row now and the rail still counts it');
  const poll = call('GET', `/api/agent/browser/takeover-request?id=${id7}&wait=5000`, undefined, asC);
  await sleep(150);
  UT.resolveByReply(it7.id, 'The code is on its way — wait a minute');
  const pr = await poll;
  ok(pr.status === 200 && pr.json.replied === true && pr.json.open === true && /the person replied to your request/.test(pr.json.line) && UT.get(it7.id).status === 'open' && k12.takeoverRequest(id7).state === 'waiting', 'a reply through the item reopens it (the request still stands) and wakes the agent\'s wait (`replied`)', JSON.stringify(pr.json).slice(0, 300));
  const poll2 = call('GET', `/api/agent/browser/takeover-request?id=${id7}&wait=5000`, undefined, asC);
  await sleep(150);
  UT.setStatus(it7.id, 'done', 'user');
  const pr2 = await poll2;
  await settle();
  ok(pr2.json.open === false && /the person is done/.test(pr2.json.line) && k12.takeoverRequest(id7).state === 'done' && k12.takeoverRequest(id7).how === 'done', 'the item\'s ✓ is the person\'s Done: the request done, the wait answers at once');
  // the shipped CLI: the verb, its --status, a page verb that WAITS for the handback, the bounded wait, --withdraw
  const cliEnv = { PATH: PATH_ENV, HOME, FAKE_AB_STATE: AB_STATE, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: TOKEN };
  const runCli = (argv) => new Promise((resolve) => {
    const ch = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-browser'), ...argv], { env: cliEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    ch.stdout.on('data', (d) => { stdout += d; }); ch.stderr.on('data', (d) => { stderr += d; });
    const t = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 30000);
    ch.on('close', (status, signal) => { clearTimeout(t); resolve({ status, signal, stdout, stderr }); });
  });
  const c0 = await runCli(['ask-human']);
  ok(c0.status === 2 && /usage: vibespace-browser ask-human/.test(c0.stderr), 'CLI: `ask-human` with no words prints its usage (exit 2)');
  const c1 = await runCli(['ask-human', 'Log in to Gmail as the shared mailbox, then hand back']);
  const cid = k12.takeoverRequests()[0] && k12.takeoverRequests()[0].id;
  ok(c1.status === 0 && /asked a human to take over the "Bank" browser: "Log in to Gmail as the shared mailbox, then hand back" \(request tr-[0-9a-f]{8}\)/.test(c1.stdout) && TQ.ID_RE.test(String(cid)), 'CLI: `vibespace-browser ask-human "<words>"` files the request and prints the server\'s line', c1.stdout + c1.stderr);
  const c2 = await runCli(['ask-human', '--status']);
  ok(c2.status === 0 && /waiting for a person/.test(c2.stdout) && c2.stdout.includes(cid), 'CLI: `ask-human --status` reads it');
  const t0 = Date.now();
  const cw = runCli(['wait', '10']);
  await sleep(1200);
  clock12 += 1000;
  k12.takeover({ browserKey: KEY_C, profileId: p.id, viewerId: 64, sessionId: 'sess-c' });
  await sleep(300);
  clock12 += 1000;
  k12.handback({ browserKey: KEY_C, profileId: p.id, cause: 'explicit' });
  const w = await cw;
  ok(w.status === 0 && /waiting for the person \(request tr-/.test(w.stderr) && /note: the person is done \(request tr-[0-9a-f]{8}, handed back\) — re-read the page first; your command runs now/.test(w.stderr) && Date.now() - t0 >= 1200, 'CLI: a page verb run while the person is asked WAITS (through the takeover too) and runs after the handback', `status ${w.status} ${w.stderr.slice(0, 400)}`);
  const c3 = await runCli(['ask-human', 'One more thing: close the pop-up']);
  const t1 = Date.now();
  const cs = await runCli(['wait', '10']);
  ok(cs.status === 1 && /\[human_asked\]/.test(cs.stderr) && /still waiting for the person after 3 s/.test(cs.stderr) && /End your turn: their handback arrives as a message/.test(cs.stderr) && Date.now() - t1 >= 2900 && !/note: the person is done/.test(cs.stderr), 'CLI: the wait is BOUNDED (the server\'s budget) — still waiting ⇒ nothing ran, exit 1, the line says end the turn', `status ${cs.status} ${cs.stderr.slice(0, 400)}`);
  const c4 = await runCli(['ask-human', '--withdraw']);
  ok(c3.status === 0 && c4.status === 0 && /withdrew request/.test(c4.stdout) && k12.takeoverRequests().length === 0, 'CLI: `ask-human --withdraw` ends it');
  const c5 = await runCli(['wait', '10']);
  ok(c5.status === 0 && !/human_asked/.test(c5.stderr), 'CLI: …and the next verb runs at once');
  const c6 = await runCli(['help']);
  ok(/ask-human "<what you need>"/.test(c6.stdout) && /your next page verb WAITS until they hand back/.test(c6.stdout), 'CLI: the verb is in the usage');
  // the lease ending withdraws it; a restart is a handback (taken ⇒ waiting)
  const a8 = await call('POST', '/api/agent/browser/takeover-request', { text: 'Last one' }, asC);
  k12.takeover({ browserKey: KEY_C, profileId: p.id, viewerId: 65, sessionId: 'sess-c' });
  const k12b = mkKeeper();
  ok(k12b.takeoverRequest(a8.json.request.id).state === 'waiting', 'a restart is a handback by construction: a request TAKEN at shutdown waits again at load (nobody said it is done)');
  k12b.shutdown();
  k12.handback({ browserKey: KEY_C, profileId: p.id, cause: 'explicit' }); // (its own handback ends it on this keeper)
  const a9 = await call('POST', '/api/agent/browser/takeover-request', { text: 'Gone with the lease' }, asC);
  k12.detach({ profileId: p.id, browserKey: KEY_C, by: 'user' });
  await settle();
  const r9 = k12.takeoverRequest(a9.json.request.id);
  ok(r9.state === 'withdrawn' && r9.how === 'lease-gone' && items().find((i) => i.action.requestId === r9.id).resolvedBy === 'conversation-gone', 'the lease going away withdraws its request (lease-gone) and resolves its item');
  const nb = await call('POST', '/api/agent/browser/takeover-request', { text: 'x', handle: 'nope' }, asC);
  ok(nb.status === 404 && nb.json.code === 'not_attached', 'an ask naming a browser this conversation does not hold is refused (not_attached)');
  ann.shutdown(); k12.shutdown();
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
