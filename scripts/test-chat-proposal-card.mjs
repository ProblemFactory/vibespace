#!/usr/bin/env node
// test-chat-proposal-card — A PROPOSAL IS SEEN WHERE IT WAS MADE (lane chat-proposal-card, 2.369.349; the owner,
// 2026-10-23, reading his agent's chat: 「最下面那个是 outbox 请求吗？我视觉上完全看不出来啊」 — the agent ran
// `vibespace-channels reply`, said it had put a proposal «in Channels», and nothing in the chat WAS the proposal).
//
// A THROWAWAY server in a git worktree (own data/, a scratch HOME, VIBESPACE_CHANNELS_FAKE=1 — the fake adapters) +
// headless chrome over raw CDP, the page in 中文 (the owner's language). A stub `claude` runs behind the REAL chat-wrapper
// through the REAL create path; each user turn is a run of Bash calls running the SHIPPED data/bin/vibespace-channels
// with its own session token (the real agent routes, the real engine, the §26 witness binding each touch to its call).
//   ① turn 1 = `ls` · `read` · `reply` (one run, folded): the REPLY's call row carries the chip «提案 · … · 待批准» on its
//      conversation's row and THE card (channel-outbox's own, five lines, ONE primary Approve) in the box after the rows;
//      the CLI's answer says where the card is; the closed fold keeps the card on screen and its head counts it
//      («· 1 条提案待批准»)
//   ② ONE RECORD, THREE PLACES: the chat card, the conversation window's inline card and the Outbox window's row show
//      the same proposal (id, state, text) — the store's
//   ③ a REAL click on the chat card's Approve ⇒ sent: the SAME box keeps ONE card for the id (patched in place, never
//      re-appended), folded to its ONE line; the chip says «已发送 · HH:MM»; the fold head «1 条提案»; the conversation
//      window and the Outbox say sent too
//   ④ 390 px (phone, stacked): turn 2 files another reply ⇒ its card is whole on screen (nothing off the right edge, its
//      actions reachable); a REAL Reject there ⇒ the chip «你拒绝了», the card its line
//   ⑤ the chat read LATER (a fresh page): both rows' chips say what became of them — from the server's record
//   ⑥ THE ACCESS RULE: the owner removes the agent's access ⇒ the chat's read (`?ids=`) answers neither proposal (the
//      Outbox still lists both — CONTROL) and a fresh chat draws no card and no chip
//   ⑦ A REACTION IS APPROVED (lane reaction-approve-shown — the owner's hub, 2026-10-28: «提案 · 一个表情回应 · 待批准»,
//      every Approve refused «shown is required … reload the page», since 2.369.197): access given back, this device
//      remembering «wake now», turn 3 proposes three reactions. The chat card's Approve says the receipt rides the next
//      turn (never «立即唤醒»); a REAL click ⇒ «已添加表情回应», sent, the vendor holds the account's own reaction; a REAL
//      Reject on the second ⇒ «你拒绝了» (that road unchanged); the THIRD approved in the Outbox window (its row's 「批准…」
//      opens the card) ⇒ «已添加表情回应», sent, the chat's copy says so too. RED on 90c995a3: the toast is the refusal.
//      (A recall cannot be proposed on this fake hub — the fake vendor's messages are never the user's own; its road is
//      test-channel-outbox's: the real card posts the digest, the real route + engine + fake vendor take it back.)
// PNGs: $CPC_SHOTS (default: the scratch dir) chat-card-zh.png, chat-card-sent-zh.png, chat-card-phone-zh.png,
// chat-reaction-card-zh.png, chat-reaction-sent-zh.png, outbox-reaction-sent-zh.png.
// Requires google-chrome + dtach (SKIP without). Run: node scripts/test-chat-proposal-card.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, realClicker } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
try { execSync('command -v dtach', { stdio: 'ignore', shell: '/bin/bash' }); } catch { console.log('SKIP: dtach is not installed — a chat session cannot be created here'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('chat-prop-card-wt');
const fakeHome = scratchHome('chat-prop-card-home', fs);
const stubDir = scratch('chat-prop-card-stub');
fs.rmSync(stubDir, { recursive: true, force: true });
fs.mkdirSync(stubDir, { recursive: true });
const SHOTS = process.env.CPC_SHOTS || stubDir;
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
const SID = 'c9a20000-0000-4000-8000-00000000c9a2';
const CONV = 'fake-poll/fake-poll-ops';
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the worktree (the working src/ + a built public/ overlaid, the shipped data/bin) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const CLI = path.join(wt, 'data', 'bin', 'vibespace-channels');

// ── the stub CLI: a turn = a RUN of Bash calls (tool_use → the shipped CLI → tool_result), then the agent's words ──
const TURNS = {
  'check the channels': { k: 1, text: 'Drafted a reply — it is waiting for you.', calls: [
    { id: 'toolu_cpc1a', command: 'ls', argvs: [] },
    { id: 'toolu_cpc1b', command: `vibespace-channels read ${CONV}`, argvs: [['read', CONV]] },
    { id: 'toolu_cpc1c', command: `vibespace-channels reply ${CONV} "On it — drafted"`, argvs: [['reply', CONV, 'On it — drafted']] },
  ] },
  'draft another': { k: 2, text: 'Drafted a second reply.', calls: [
    { id: 'toolu_cpc2a', command: `vibespace-channels reply ${CONV} "A second draft"`, argvs: [['reply', CONV, 'A second draft']] },
  ] },
  // ⑦ three reactions, each after a read (fake-poll-ops m1–m3 carry none of the account's own: the seed is fixed). Each
  // react follows a read: two touches of one op on one conversation within MERGE_MS are ONE touch (channel-touch
  // appendTouch) and keep the FIRST proposalId — back-to-back reacts would file one card (reported, not this lane's)
  'react to three': { k: 3, text: 'Proposed three reactions.', calls: [
    { id: 'toolu_cpc3a', command: `vibespace-channels read ${CONV}`, argvs: [['read', CONV]] },
    { id: 'toolu_cpc3b', command: `vibespace-channels react ${CONV} fake-poll-ops-m1 thumbsup`, argvs: [['react', CONV, 'fake-poll-ops-m1', 'thumbsup']] },
    { id: 'toolu_cpc3c', command: `vibespace-channels read ${CONV}`, argvs: [['read', CONV]] },
    { id: 'toolu_cpc3d', command: `vibespace-channels react ${CONV} fake-poll-ops-m2 rocket`, argvs: [['react', CONV, 'fake-poll-ops-m2', 'rocket']] },
    { id: 'toolu_cpc3e', command: `vibespace-channels read ${CONV}`, argvs: [['read', CONV]] },
    { id: 'toolu_cpc3f', command: `vibespace-channels react ${CONV} fake-poll-ops-m3 wave`, argvs: [['react', CONV, 'fake-poll-ops-m3', 'wave']] },
  ] },
};
const stubPath = path.join(stubDir, 'claude');
const TRANSCRIPT = path.join(fakeHome, '.claude', 'projects', CWD.replace(/[/._]/g, '-'), SID + '.jsonl');
fs.mkdirSync(path.dirname(TRANSCRIPT), { recursive: true });
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const { execFile } = require('child_process');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify(process.env));
const SID = ${JSON.stringify(SID)}, CWD = ${JSON.stringify(CWD)}, TR = ${JSON.stringify(TRANSCRIPT)}, CLI = ${JSON.stringify(CLI)};
const TURNS = ${JSON.stringify(TURNS)};
let n = 0, parent = null; const U = () => 'cpc-' + process.pid + '-' + (++n);
const usage = { input_tokens: 1, output_tokens: 1 };
const out = (o) => process.stdout.write(JSON.stringify({ ...o, session_id: SID }) + '\\n');
const both = (o) => { const uuid = U(); const rec = { ...o, uuid, parentUuid: parent, timestamp: new Date().toISOString(), sessionId: SID, cwd: CWD, isSidechain: false, userType: 'external', version: '2.1.281' }; parent = uuid; fs.appendFileSync(TR, JSON.stringify(rec) + '\\n'); out({ ...o, uuid }); };
const run = (argv) => new Promise((res) => execFile(process.execPath, [CLI, ...argv], { env: process.env, timeout: 20000 }, (e, so, se) => res(String(so || '') + String(se || ''))));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
out({ type: 'system', subtype: 'init', model: 'claude-fable-5', cwd: CWD, tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281', uuid: U() });
async function turn(prompt, T) {
  both({ type: 'user', message: { role: 'user', content: prompt } });
  await wait(250);
  let i = 0;
  for (const c of T.calls) {
    both({ type: 'assistant', message: { id: 'msg_cpc' + T.k + 'c' + (++i), type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id: c.id, name: 'Bash', input: { command: c.command, description: 'channels' } }], stop_reason: 'tool_use', usage } });
    await wait(300);
    let log = c.argvs.length ? '' : 'notes.md';
    for (const a of c.argvs) log += await run(a);
    await wait(300);
    both({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: c.id, content: log.slice(0, 4000) || '(no output)', is_error: false }] } });
    fs.appendFileSync(${JSON.stringify(stubDir)} + '/turns.log', c.id + ' ' + log.replace(/\\n/g, ' | ') + '\\n');
    await wait(250);
  }
  both({ type: 'assistant', message: { id: 'msg_cpc' + T.k + 't', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: T.text }], stop_reason: 'end_turn', usage } });
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 5, num_turns: 1, result: T.text, total_cost_usd: 0, usage, uuid: U() });
}
let buf = '', chain = Promise.resolve();
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m || m.type !== 'user') continue;
    const s = JSON.stringify(m.message || '');
    for (const [p, T] of Object.entries(TURNS)) if (s.includes(p)) chain = chain.then(() => turn(p, T));
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

let srv = null;
const LOG = path.join(stubDir, 'server.log');
const startServer = () => { const fd = fs.openSync(LOG, 'a'); srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1' }, stdio: ['ignore', fd, fd] }); fs.closeSync(fd); };
const waitServer = async () => { for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
startServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  for (const r of [wt, fakeHome, stubDir]) { try { endRootedProcesses(r); } catch {} }   // dtach, the wrapper, the stub, the device daemon — everything rooted in a scratch path
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, ...(SHOTS === stubDir && !process.env.CPC_KEEP ? [stubDir] : [])]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
check('the worktree server answered', await waitServer());

// ── raw CDP ─────────────────────────────────────────────────────────────────
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {}
  if (!target) await sleep(250);
}
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
  sock.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await evalJs(expr); if (v) return v; } catch {} await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
let lastMiss = null;
// THE real-click door (scratch.mjs realClicker, int358): measure, move, hit-test AT PRESS TIME, one re-aim — never a press
// on whatever moved under the pointer since the measure (test-channel-jump ② opened the neighbour row 4 runs of 7)
const RC = realClicker({ evalJs, cdp });
const realClick = async (sel, o) => { const ok = await RC(sel, o); lastMiss = RC.lastMiss; return ok; };
const realType = async (text) => { for (const ch of text) await cdp('Input.dispatchKeyEvent', { type: 'char', text: ch }); };
const shot = async (name, sel, pad = 6) => {
  try {
    const r = sel ? await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: Math.max(0, q.left - ${pad}), y: Math.max(0, q.top - ${pad}), width: Math.min(innerWidth, q.width + ${2 * pad}), height: Math.min(innerHeight, q.height + ${2 * pad}), scale: 1 }; })()`) : null;
    const img = await cdp('Page.captureScreenshot', { format: 'png', ...(r ? { clip: r } : {}), captureBeyondViewport: false });
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(img.data, 'base64'));
    console.log(`    (screenshot ${path.join(SHOTS, name)})`);
    return true;
  } catch (e) { console.log(`    (screenshot ${name} failed: ${e.message})`); return false; }
};
const api = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const stubToken = () => { for (const f of fs.readdirSync(stubDir).filter((x) => x.startsWith('env-'))) { try { const e = JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); if (e.VIBESPACE_SESSION_TOKEN) return e; } catch {} } return null; };
const VIEW = (sid) => `[...app.sessions.values()].find((v) => v && v.sessionId === ${JSON.stringify(sid)})`;
const CARD = (id) => `.chat-msg[data-tool-id="${id}"]`;
const PCARD = (id, pid) => `${CARD(id)} .chat-chan-props > .chan-prop[data-proposal="${pid}"]`;
const CHIP = (id) => `${CARD(id)} .chat-channel-touch[data-key="${CONV}"] > .cct-prop`;
const look = (id, pid) => evalJs(`(() => {
  const card = document.querySelector(${JSON.stringify(CARD(id))});
  const box = card && card.querySelector('.chat-chan-props');
  const c = box && box.querySelector(${JSON.stringify(`.chan-prop[data-proposal="${pid}"]`)});
  const chip = card && card.querySelector(${JSON.stringify(`.chat-channel-touch[data-key="${CONV}"] > .cct-prop`)});
  const run = (${VIEW('__SID__')})?._runs?.find((r) => r.members && r.members.includes(card));
  const touch = card && card.querySelector('.chat-channel-touches');
  return { box: !!box, boxId: box ? (box.dataset.cpcId || (box.dataset.cpcId = String(Math.random()))) : null, n: box ? box.querySelectorAll('.chan-prop').length : 0,
    inChat: document.querySelectorAll(${JSON.stringify(`.chat-msg .chan-prop[data-proposal="${pid}"]`)}).length,
    afterRows: !!(box && touch && box.parentNode === touch.parentNode && [...box.parentNode.children].indexOf(box) > [...box.parentNode.children].indexOf(touch)),
    state: c ? [...c.classList].find((k) => /^chan-prop-(awaiting-approval|sent|rejected|sending|failed|expired|unknown)$/.test(k)) : null,
    lined: !!(c && c.classList.contains('chan-prop-lined')), shut: !!(c && c.classList.contains('chan-prop-shut')),
    text: c ? (c.querySelector('.chan-prop-text') || {}).textContent || '' : '', line: c && c.querySelector('.chan-prop-line') ? c.querySelector('.chan-prop-line').innerText : '',
    approve: !!(c && c.querySelector('.chan-prop-actions button[data-approve]')), primaries: c ? c.querySelectorAll('.chan-prop-actions .mounts-btn-primary[data-approve]').length : 0,
    visible: !!(c && c.offsetHeight > 0), chip: chip ? chip.textContent : null, chipState: chip ? chip.dataset.state : null,
    compact: !!(card && card.classList.contains('chat-channel-compact')), head: run && run.header ? run.header.textContent : null, runOpen: run ? !!run.open : null };
})()`.replace(/__SID__/g, globalThis.__sid || ''));
const turnsLog = () => (fs.existsSync(path.join(stubDir, 'turns.log')) ? fs.readFileSync(path.join(stubDir, 'turns.log'), 'utf8') : '');
const attach = async (sid) => {
  await evalJs(`app.attachSession(${JSON.stringify(sid)}, 'proposal stub', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  return waitFor(`!!(${VIEW(sid)})?._messageList`, 20000);
};

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch {}" });   // the owner's language
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp(); await sleep(600);

  console.log('setup: a live stub session, the fake conversations, access for the agent');
  const ws0 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws0.on('open', r));
  const frames = []; ws0.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  ws0.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'cpc1' }));
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(250); }
  globalThis.__sid = sid;
  check('a live claude chat session through the real spawn path (stub CLI behind the real wrapper)', !!sid, frames.slice(-3));
  let env = null;
  for (let i = 0; i < 80 && !env; i++) { env = stubToken(); if (!env) await sleep(250); }
  check('the stub has its session token', !!env && /^vsst_/.test(env.VIBESPACE_SESSION_TOKEN || ''));
  let convs = null;
  for (let i = 0; i < 80; i++) { const r = await api('GET', '/api/channels'); const keys = (r.body?.conversations || []).map((c) => `${c.adapterId}/${c.id}`); if (keys.includes(CONV)) { convs = keys; break; } await sleep(250); }
  check('the fake conversation is there', !!convs, convs);
  for (let i = 0; i < 40; i++) { const r = await api('GET', '/api/active-sessions').catch(() => null); if (r?.body && JSON.stringify(r.body).includes(SID)) break; await sleep(250); }
  const principal = { kind: 'agent', id: SID, name: 'proposal stub' };
  const a1 = await api('PUT', '/api/channels/adapters/fake-poll/access', { access: [{ principal, authority: 'draft' }] });
  check('the agent is given access to the account (the owner\'s route)', a1.status === 200, a1);
  check('the chat window attaches', await attach(sid));
  await sleep(500);

  // ── ① filed → the card at the call row ──
  console.log('① turn 1 = ls · read · reply: the reply\'s call row carries the chip and the card');
  await evalJs(`app.ws.send({ type: 'chat-input', sessionId: ${JSON.stringify(sid)}, text: 'check the channels' }); true`);
  const pid1 = await waitFor(`(async () => { const r = await fetch('/api/channels/outbox?conv=${encodeURIComponent(CONV)}').then((x) => x.json()); const p = (r.proposals || []).find((q) => q.text === 'On it — drafted'); return p ? p.id : null; })()`, 30000);
  check('the reply filed ONE proposal awaiting approval (the store\'s)', !!pid1, turnsLog().slice(0, 1500));
  const got1 = await waitFor(`!!document.querySelector(${JSON.stringify(PCARD('toolu_cpc1c', pid1))}) && !!document.querySelector(${JSON.stringify(CHIP('toolu_cpc1c'))})`, 20000);
  const v1 = await look('toolu_cpc1c', pid1);
  check('the REPLY\'s call row holds the card — in ONE box after its conversation rows (the call row\'s expanded body)', got1 && v1.box && v1.n === 1 && v1.afterRows && v1.inChat === 1, v1);
  check('the card is the Outbox\'s own five-line card: awaiting, ONE primary Approve, the agent\'s text', v1.state === 'chan-prop-awaiting-approval' && v1.approve && v1.primaries === 1 && v1.text === 'On it — drafted', v1);
  check('the chip on the conversation\'s row: «提案 · 在「…」里回复 · 待批准»', /^提案 · 在「.+」里回复 · 待批准$/.test(v1.chip || '') && v1.chipState === 'awaiting-approval', v1.chip);
  check('no other call row draws it (the read and the ls have no card)', await evalJs(`!document.querySelector('${CARD('toolu_cpc1a')} .chat-chan-props') && !document.querySelector('${CARD('toolu_cpc1b')} .chat-chan-props .chan-prop')`));
  for (let i = 0; i < 80 && !/^toolu_cpc1c /m.test(turnsLog()); i++) await sleep(250);   // the card lands with the touch, mid-call; the answer after it
  const said = (turnsLog().split('\n').find((l) => l.startsWith('toolu_cpc1c ')) || '');
  check('the CLI\'s answer says where the card is («the card is in this chat and in Channels › Outbox»)', /proposed — proposal \S+ is awaiting the user's approval.* \|   the card is in this chat and in Channels › Outbox/.test(said), said.slice(0, 600));
  // the run is folded (a Bash run collapses at once): the reply member is ONE compact line and its card stays on screen
  const fold1 = await waitFor(`(async () => { const v = ${VIEW(sid)}; const card = document.querySelector('${CARD('toolu_cpc1c')}'); const run = v._runs && v._runs.find((r) => r.members.includes(card)); return run && run.header && /1 条提案待批准/.test(run.header.textContent) ? run.header.textContent : null; })()`, 10000);
  const v1f = await look('toolu_cpc1c', pid1);
  check('the run fold\'s head counts it beside the conversation link: «· 1 条提案待批准»', !!fold1, v1f.head);
  check('the closed fold keeps the card ON SCREEN (the member compact, the card whole, its Approve visible)', v1f.runOpen === false && v1f.compact && v1f.visible && v1f.approve, v1f);
  await sleep(900);   // the card's arming (P.ARM_MS 700 ms) — a click on a card that just appeared is held
  check('chat-card-zh.png', await shot('chat-card-zh.png', CARD('toolu_cpc1c'), 10));

  // ── ② one record, three places ──
  console.log('② ONE RECORD, THREE PLACES: the chat, the conversation window, the Outbox window');
  await evalJs(`app.openChannel('fake-poll', 'fake-poll-ops'); true`);
  const inWin = await waitFor(`(() => { const c = [...document.querySelectorAll('.chanwin-outbox .chan-prop[data-proposal="${pid1}"]')][0]; return c ? { state: [...c.classList].find((k) => k.startsWith('chan-prop-a') || k === 'chan-prop-sent'), text: (c.querySelector('.chan-prop-text') || {}).textContent } : null; })()`, 15000);
  await evalJs(`app.openChannelOutbox(); true`);
  const inOut = await waitFor(`(() => { const r = document.querySelector('[data-orow="${pid1}"]'); return r ? { awaiting: r.classList.contains('chan-orow-awaiting-approval'), text: (r.querySelector('.chan-orow-text') || {}).textContent } : null; })()`, 15000);
  const rec1 = (await api('GET', `/api/channels/outbox?ids=${pid1}`)).body;
  check('the chat\'s read (?ids=) answers the record — the same store', rec1 && rec1.proposals && rec1.proposals.length === 1 && rec1.proposals[0].id === pid1 && rec1.proposals[0].state === 'awaiting-approval', rec1 && rec1.proposals);
  check('the conversation window draws THE SAME proposal (id, awaiting, the same text)', inWin && inWin.state === 'chan-prop-awaiting-approval' && inWin.text === v1.text, inWin);
  check('the Outbox window lists THE SAME proposal (its row, awaiting, the same first line)', inOut && inOut.awaiting && inOut.text === v1.text, inOut);
  // back to the chat (the windows opened above sit on top of it)
  await evalJs(`(() => { const w = [...app.sessions.entries()].find(([, v]) => v && v.sessionId === ${JSON.stringify(sid)}); app.wm.focusWindow(w[0]); for (const [id, x] of app.wm.windows) if (x && (x.type === 'channel-outbox' || (x._openSpec && x._openSpec.action === 'openChannel'))) app.wm.closeWindow(id); return true; })()`);
  await sleep(600);

  // ── ③ Approve in the chat ──
  console.log('③ a REAL click on the chat card\'s Approve ⇒ sent, patched in place');
  const before = await look('toolu_cpc1c', pid1);
  check('a REAL click on Approve (the card\'s ONE primary)', await realClick(`${PCARD('toolu_cpc1c', pid1)} .chan-prop-actions button[data-approve]`), lastMiss);
  const sent = await waitFor(`(() => { const c = document.querySelector(${JSON.stringify(PCARD('toolu_cpc1c', pid1))}); return !!c && c.classList.contains('chan-prop-sent'); })()`, 20000);
  const v3 = await look('toolu_cpc1c', pid1);
  check('the proposal is SENT and the chat card says so', sent && v3.state === 'chan-prop-sent', { v3, store: (await api('GET', `/api/channels/outbox?ids=${pid1}`)).body?.proposals?.[0]?.state });
  check('PATCHED IN PLACE: the same box (never re-appended), ONE card for the id in the whole chat', v3.boxId === before.boxId && v3.n === 1 && v3.inChat === 1 && v3.afterRows, { before: before.boxId, after: v3.boxId, n: v3.n, inChat: v3.inChat });
  check('decided ⇒ the card folds to its ONE line (the conversation window\'s rule)', v3.lined && v3.shut && /已发送/.test(v3.line), v3.line);
  check('the chip says what became of it: «提案 · … · 已发送 · HH:MM»', /^提案 · 在「.+」里回复 · 已发送 · \d\d:\d\d$/.test(v3.chip || '') && v3.chipState === 'sent', v3.chip);
  const fold3 = await waitFor(`(() => { const v = ${VIEW(sid)}; const card = document.querySelector('${CARD('toolu_cpc1c')}'); const run = v._runs && v._runs.find((r) => r.members.includes(card)); const h = run && run.header ? run.header.textContent : ''; return /1 条提案/.test(h) && !/待批准/.test(h) ? h : null; })()`, 10000);
  check('the fold head re-words: «· 1 条提案» (nothing waits)', !!fold3, (await look('toolu_cpc1c', pid1)).head);
  await evalJs(`app.openChannel('fake-poll', 'fake-poll-ops'); app.openChannelOutbox(); true`);
  const both3 = await waitFor(`(() => { const c = document.querySelector('.chanwin-outbox .chan-prop[data-proposal="${pid1}"]'); const r = document.querySelector('[data-orow="${pid1}"]'); return !!c && c.classList.contains('chan-prop-sent') && !!r && r.classList.contains('chan-orow-sent'); })()`, 15000);
  check('the conversation window and the Outbox say SENT too (one record)', both3);
  await evalJs(`(() => { const w = [...app.sessions.entries()].find(([, v]) => v && v.sessionId === ${JSON.stringify(sid)}); app.wm.focusWindow(w[0]); for (const [id, x] of app.wm.windows) if (x && (x.type === 'channel-outbox' || (x._openSpec && x._openSpec.action === 'openChannel'))) app.wm.closeWindow(id); return true; })()`);
  await sleep(400);
  check('chat-card-sent-zh.png', await shot('chat-card-sent-zh.png', CARD('toolu_cpc1c'), 10));

  // ── ④ the phone ──
  console.log('④ 390 px (phone, stacked): a second reply\'s card, a REAL Reject');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp('Page.reload', {}); await sleep(800); await waitApp(); await sleep(800);
  check('the chat attaches on the phone', await attach(sid));
  await evalJs(`app.ws.send({ type: 'chat-input', sessionId: ${JSON.stringify(sid)}, text: 'draft another' }); true`);
  const pid2 = await waitFor(`(async () => { const r = await fetch('/api/channels/outbox?conv=${encodeURIComponent(CONV)}').then((x) => x.json()); const p = (r.proposals || []).find((q) => q.text === 'A second draft'); return p ? p.id : null; })()`, 30000);
  check('turn 2 filed a second proposal', !!pid2);
  const ph = await waitFor(`(() => { const c = document.querySelector(${JSON.stringify(PCARD('toolu_cpc2a', pid2 || 'x'))}); if (!c || !c.offsetWidth) return null; c.scrollIntoView({ block: 'center' }); const off = [...c.querySelectorAll('*')].filter((e) => e.offsetWidth && (e.getBoundingClientRect().right > innerWidth + 0.5 || e.getBoundingClientRect().left < -0.5)).map((e) => e.className + ' ' + Math.round(e.getBoundingClientRect().right)); const r = c.getBoundingClientRect(); const btns = [...c.querySelectorAll('.chan-prop-actions button')].map((b) => { const q = b.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!hit && (hit === b || b.contains(hit)); }); return { off, w: Math.round(r.width), vw: innerWidth, btns, chip: (document.querySelector(${JSON.stringify(CHIP('toolu_cpc2a'))}) || {}).textContent || null }; })()`, 30000);
  check('the phone card is whole on screen (nothing past the right edge) and every action is reachable', !!ph && ph.off.length === 0 && ph.w <= ph.vw && ph.btns.length >= 3 && ph.btns.every(Boolean), ph);
  check('the phone row\'s chip: «… · 待批准»', !!ph && /^提案 · .+ · 待批准$/.test(ph.chip || ''), ph && ph.chip);
  await sleep(900);
  check('chat-card-phone-zh.png', await shot('chat-card-phone-zh.png', CARD('toolu_cpc2a'), 6));
  check('a REAL click on Reject… opens its reason box', await realClick(`${PCARD('toolu_cpc2a', pid2)} .chan-prop-actions button[data-reject]`) && await waitFor(`!!document.querySelector(${JSON.stringify(PCARD('toolu_cpc2a', pid2) + ' .chan-prop-rejectbox input')})`, 5000), lastMiss);
  await evalJs(`document.querySelector(${JSON.stringify(PCARD('toolu_cpc2a', pid2) + ' .chan-prop-rejectbox input')}).focus(); true`);
  await realType('not now');
  check('…and a REAL click on its Reject sends the decision', await realClick(`${PCARD('toolu_cpc2a', pid2)} .chan-prop-rejectbox button`), lastMiss);
  const rj = await waitFor(`(() => { const ch = document.querySelector(${JSON.stringify(CHIP('toolu_cpc2a'))}); const c = document.querySelector(${JSON.stringify(PCARD('toolu_cpc2a', pid2))}); return ch && c && /你拒绝了$/.test(ch.textContent) && c.classList.contains('chan-prop-lined') ? ch.textContent : null; })()`, 15000);
  check('rejected ⇒ the chip «提案 · … · 你拒绝了», the card its ONE line', !!rj, rj);
  const rjStore = (await api('GET', `/api/channels/outbox?ids=${pid2}`)).body?.proposals?.[0];
  check('…the store says rejected with the reason the owner typed', rjStore && rjStore.state === 'rejected' && /not now/.test(JSON.stringify(rjStore)), rjStore && { state: rjStore.state });

  // ── ⑤ the chat read later ──
  console.log('⑤ the chat read LATER (a fresh page): the chips say what became of both');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.reload', {}); await sleep(800); await waitApp(); await sleep(600);
  check('the chat attaches again', await attach(sid));
  const later = await waitFor(`(() => { const a = document.querySelector(${JSON.stringify(CHIP('toolu_cpc1c'))}), b = document.querySelector(${JSON.stringify(CHIP('toolu_cpc2a'))}); return a && b ? [a.textContent, b.textContent] : null; })()`, 20000);
  check('a fresh page reads both outcomes off the server\'s record: «已发送 · HH:MM» and «你拒绝了»', !!later && /· 已发送 · \d\d:\d\d$/.test(later[0]) && /· 你拒绝了$/.test(later[1]), later);

  // ── ⑥ the access rule ──
  console.log('⑥ the agent loses its access ⇒ the chat no longer draws its proposals');
  const a0 = await api('PUT', '/api/channels/adapters/fake-poll/access', { access: [] });
  const chatRead = (await api('GET', `/api/channels/outbox?ids=${pid1},${pid2}`)).body;
  const allRead = (await api('GET', '/api/channels/outbox')).body;
  check('the chat\'s read answers NEITHER proposal once the drafter no longer sees the conversation', a0.status === 200 && chatRead && Array.isArray(chatRead.proposals) && chatRead.proposals.length === 0, chatRead && chatRead.proposals);
  check('CONTROL: the Outbox (the owner\'s whole queue) still lists both', !!allRead && [pid1, pid2].every((id) => (allRead.proposals || []).some((p) => p.id === id)));
  await cdp('Page.reload', {}); await sleep(800); await waitApp(); await sleep(600);
  check('the chat attaches once more', await attach(sid));
  await waitFor(`document.querySelectorAll(${JSON.stringify(CARD('toolu_cpc1c') + ' .chat-channel-touch')}).length > 0`, 20000);
  await sleep(1200);
  const none = await evalJs(`({ cards: document.querySelectorAll('.chat-msg .chat-chan-props .chan-prop').length, chips: document.querySelectorAll('.chat-msg .cct-prop').length, rows: document.querySelectorAll('.chat-msg .chat-channel-touch').length })`);
  check('…a fresh chat draws no card and no chip (the rows stay — the witness saw the calls)', none.cards === 0 && none.chips === 0 && none.rows >= 2, none);

  // ── ⑦ a reaction approved (lane reaction-approve-shown) ──
  console.log('⑦ the agent proposes three reactions: one approved in the chat, one rejected there, one approved in the Outbox window');
  const a2 = await api('PUT', '/api/channels/adapters/fake-poll/access', { access: [{ principal, authority: 'draft' }] });
  check('the agent\'s access is given back', a2.status === 200, a2);
  // this device remembers «wake now» (the owner's did: his reaction card read «批准并立即唤醒 agent»); every toast is kept
  await evalJs(`localStorage.setItem('vibespace.channels.receiptDeliver', 'wake-now'); window.__toasts = []; new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('global-toast')) window.__toasts.push(n); }).observe(document.body, { childList: true, subtree: true }); true`);
  const toasts = () => evalJs('window.__toasts.map((n) => n.textContent)');   // a toast\'s text ends with its close glyph
  await evalJs(`app.ws.send({ type: 'chat-input', sessionId: ${JSON.stringify(sid)}, text: 'react to three' }); true`);
  const rx = await waitFor(`(async () => { const r = await fetch('/api/channels/outbox?conv=${encodeURIComponent(CONV)}').then((x) => x.json()); const by = (m) => (r.proposals || []).find((q) => q.kind === 'reaction' && q.reaction && q.reaction.msg === m && q.state === 'awaiting-approval'); const a = by('fake-poll-ops-m1'), b = by('fake-poll-ops-m2'), c = by('fake-poll-ops-m3'); return a && b && c ? [a.id, b.id, c.id] : null; })()`, 40000);
  check('turn 3 filed THREE reaction proposals awaiting approval (the store\'s)', !!rx, turnsLog().split('\n').filter((l) => l.startsWith('toolu_cpc3')).map((l) => l.slice(0, 300)));
  const [rx1, rx2, rx3] = rx || ['x', 'x', 'x'];
  // the chat's card BY ITS PROPOSAL (in this stub world a touch draws on the NEXT call naming the conversation — turn 1's
  // reply row carries its read's row too — so the call row is not the address; the card is the store's, once in the chat)
  const CHATP = (pid) => `.chat-msg .chat-chan-props > .chan-prop[data-proposal="${pid}"]`;
  const CMSG = (pid) => `.chat-msg:has(.chan-prop[data-proposal="${pid}"])`;
  const RAPP = (pid) => `${CHATP(pid)} .chan-prop-actions button[data-approve]`;
  const got3 = await waitFor(`!!document.querySelector(${JSON.stringify(RAPP(rx1))}) && !!document.querySelector(${JSON.stringify(RAPP(rx2))})`, 20000);
  const vr = await evalJs(`(() => { const c = document.querySelector(${JSON.stringify(CHATP(rx1))}); const b = c && c.querySelector('.chan-prop-actions button[data-approve]'); return c ? { n: document.querySelectorAll(${JSON.stringify(CHATP(rx1))}).length, text: (c.querySelector('.chan-prop-text') || {}).textContent || '', label: b ? b.textContent : null, deliver: b ? b.dataset.deliver : null } : null; })()`);
  const why3 = got3 && vr ? null : await evalJs(`[...document.querySelectorAll('.chat-msg[data-tool-id]')].map((e) => [e.dataset.toolId, [...e.querySelectorAll('.chan-prop')].map((c) => c.dataset.proposal)])`);
  check('the reaction\'s card is drawn in the chat ONCE (chatProposalCards — the Outbox\'s own card): the agent\'s 👍 on the message it quotes', got3 && !!vr && /👍/.test(vr.text) && vr.n === 1, { vr, why3, turns: turnsLog().split('\n').filter((l) => l.startsWith('toolu_cpc3')).map((l) => l.slice(0, 400)) });
  check('…and its Approve says the receipt rides the agent\'s NEXT message — never «立即唤醒» though this device remembers «wake now»', !!vr && !/唤醒/.test(vr.label || '') && vr.deliver === 'next-turn', vr);
  await sleep(900);   // the card's arming (P.ARM_MS) — a reaction's Approve is armed like every Approve
  check('chat-reaction-card-zh.png', await shot('chat-reaction-card-zh.png', CMSG(rx1), 10));
  check('a REAL click on the reaction card\'s Approve (in the chat)', await realClick(RAPP(rx1)), lastMiss);
  const sent7 = await waitFor(`(() => { const c = document.querySelector(${JSON.stringify(CHATP(rx1))}); return !!c && c.classList.contains('chan-prop-sent'); })()`, 15000);
  const t7 = await toasts();
  const st7 = (await api('GET', '/api/channels/outbox')).body?.proposals?.find((q) => q.id === rx1);
  check('APPROVED: the toast «已添加表情回应», no refusal — the store says sent and the chat card too', sent7 && t7.some((x) => x.startsWith('已添加表情回应')) && !t7.some((x) => /请求被拒绝|shown/.test(x)) && st7 && st7.state === 'sent', { toasts: t7, state: st7 && st7.state, reason: st7 && st7.reason });
  const rxs = await waitFor(`(async () => { const r = await fetch('/api/channels/fake-poll/fake-poll-ops/reactions?ids=fake-poll-ops-m1').then((x) => x.json()).catch(() => null); return r ? JSON.stringify(r).slice(0, 600) : null; })()`, 5000);
  check('…the vendor holds the account\'s own 👍 on that message (the engine\'s reaction fold)', !!rxs && /thumbsup/.test(rxs) && /"mine":true/.test(rxs), rxs);
  await sleep(400);
  check('chat-reaction-sent-zh.png', await shot('chat-reaction-sent-zh.png', CMSG(rx1), 10));
  // the second card was kept through that broadcast: its words still say next turn
  const v2 = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(RAPP(rx2))}); return b ? { label: b.textContent, deliver: b.dataset.deliver } : null; })()`);
  check('the second reaction\'s card, KEPT through the re-render, still says next turn (the patch never moves a reaction\'s words)', !!v2 && !/唤醒/.test(v2.label) && v2.deliver === 'next-turn', v2);
  // the reject road, unchanged
  check('a REAL click on the second card\'s Reject… opens its reason box', await realClick(`${CHATP(rx2)} .chan-prop-actions button[data-reject]`) && await waitFor(`!!document.querySelector(${JSON.stringify(CHATP(rx2) + ' .chan-prop-rejectbox input')})`, 5000), lastMiss);
  await evalJs(`document.querySelector(${JSON.stringify(CHATP(rx2) + ' .chan-prop-rejectbox input')}).focus(); true`);
  await realType('not this one');
  check('…and a REAL click on its Reject sends the decision', await realClick(`${CHATP(rx2)} .chan-prop-rejectbox button`), lastMiss);
  const rj7 = await waitFor(`(() => { const c = document.querySelector(${JSON.stringify(CHATP(rx2))}); return !!c && c.classList.contains('chan-prop-rejected'); })()`, 15000);
  const rj7s = (await api('GET', '/api/channels/outbox')).body?.proposals?.find((q) => q.id === rx2);
  check('REJECTED: the store says rejected with the owner\'s reason, the card its line (the reject road takes no digest)', rj7 && rj7s && rj7s.state === 'rejected' && /not this one/.test(JSON.stringify(rj7s)), rj7s && { state: rj7s.state });
  // the Outbox window: the third, from its row
  await evalJs(`window.__toasts.length = 0; app.openChannelOutbox(); true`);
  const orow = await waitFor(`!!document.querySelector('[data-orow="${rx3}"] button[data-review]')`, 15000);
  check('the Outbox window lists the third reaction with its 「批准…」', orow);
  check('a REAL click on 「批准…」 opens its card under the row', await realClick(`[data-orow="${rx3}"] button[data-review]`) && await waitFor(`!!document.querySelector('.chan-outbox .chan-prop[data-proposal="${rx3}"] .chan-prop-actions button[data-approve]')`, 5000), lastMiss);
  await sleep(900);
  const ob3 = await evalJs(`(() => { const b = document.querySelector('.chan-outbox .chan-prop[data-proposal="${rx3}"] .chan-prop-actions button[data-approve]'); return b ? { label: b.textContent, deliver: b.dataset.deliver } : null; })()`);
  check('the Outbox card\'s Approve says next turn too', !!ob3 && !/唤醒/.test(ob3.label) && ob3.deliver === 'next-turn', ob3);
  check('a REAL click on the Outbox card\'s Approve', await realClick(`.chan-outbox .chan-prop[data-proposal="${rx3}"] .chan-prop-actions button[data-approve]`), lastMiss);
  const sent8 = await waitFor(`(async () => { const r = await fetch('/api/channels/outbox').then((x) => x.json()); const p = (r.proposals || []).find((q) => q.id === ${JSON.stringify(rx3)}); return p && p.state === 'sent'; })()`, 15000);
  const t8 = await toasts();
  check('APPROVED in the Outbox: «已添加表情回应», no refusal, the store says sent', sent8 && t8.some((x) => x.startsWith('已添加表情回应')) && !t8.some((x) => /请求被拒绝|shown/.test(x)), t8);
  const all8 = await waitFor(`(() => { const r = document.querySelector('[data-orow="${rx3}"]'); return !!r && r.classList.contains('chan-orow-sent'); })()`, 10000);
  check('the Outbox row says sent', all8);
  check('outbox-reaction-sent-zh.png', await shot('outbox-reaction-sent-zh.png', '.chan-outbox', 4));
  await evalJs(`(() => { const w = [...app.sessions.entries()].find(([, v]) => v && v.sessionId === ${JSON.stringify(sid)}); app.wm.focusWindow(w[0]); for (const [id, x] of app.wm.windows) if (x && x.type === 'channel-outbox') app.wm.closeWindow(id); return true; })()`);
  const chat8 = await waitFor(`(() => { const c = document.querySelector(${JSON.stringify(CHATP(rx3))}); return !!c && c.classList.contains('chan-prop-sent'); })()`, 10000);
  check('…and the chat\'s copy of that card says sent (one record)', chat8);

  check('no page exception', pageErrors.length === 0, pageErrors.slice(0, 5));
} catch (e) {
  failed++;
  console.error('✗ the suite threw:', e && e.stack || e);
  try { console.error(fs.readFileSync(LOG, 'utf8').split('\n').slice(-40).join('\n')); } catch {}
}
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
