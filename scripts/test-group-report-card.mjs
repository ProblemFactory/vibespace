#!/usr/bin/env node
// test-group-report-card — A GROUP MESSAGE HANDED TO AN AGENT'S TURN IS SEEN IN THAT AGENT'S CHAT, on a real page
// (lane group-report-card; the owner, 2026-09-28 22:45 PDT: "怎么在那个对话里看不到你发了消息？" — two replies to a
// peer's urgent question rode the peer's next turn inside the hook injection and nothing in its chat showed them).
//
// A THROWAWAY server in a git worktree (own data/, a scratch HOME) + headless chrome over raw CDP. TWO stub `claude`
// sessions ("alpha", "beta") run behind the REAL chat-wrapper through the REAL create path. Each stub publishes a CLI
// inbox in the scratch home's session registry (the ladder's local-inbox rung) and, like the real CLI, calls its own
// UserPromptSubmit hook's route (GET /api/agent/prompt-context, its own session token) at the start of every turn —
// then writes the turn's records to stdout AND its transcript, timestamped (the rebuild after the restart reads them).
//   ① alpha sends beta a message WITHOUT --wake (its own agent route — `vibespace-msg send beta "…"`): nobody is woken
//   ② the OWNER opens beta's window: the strip above the composer names it ("1 notice is waiting …: a group message from
//      alpha"), with NO hand-over button (a hand-over carries the stash, never a group report) and "they ride your next
//      message" where it would be; the sidebar card says "1 waiting"
//   ③ the owner types to beta: beta's turn gets the report (its hook's answer holds it) and the chat draws ONE group card
//      — "alpha → <group>", alpha's words — under the owner's message, before beta's reply; the strip is gone; a REAL
//      click on the group's name opens the group's window
//   ④ alpha WAKES beta (--wake): the ladder posts to beta's inbox and the chat draws the SAME kind of card (it woke the
//      agent); the owner's next message to beta carries no second card for it
//   ⑤ SIGKILL + restart the server, reload the page (a fresh client): both cards are still there, once each, in their
//      places — the report card from the persisted ring (placed by time), the wake card as the transcript's own record
//      upgraded in place; the raw agent-facing report never shows
//   ⑥ no page exception
// VS_SHOT_DIR=<dir> saves the screenshots (the strip, the report card, the wake card, both after the restart).
// Requires google-chrome + dtach (SKIP without). ~60 s. Zero vendor calls. Run: node scripts/test-group-report-card.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
try { execSync('command -v dtach', { stdio: 'ignore', shell: '/bin/bash' }); } catch { console.log('SKIP: dtach is not installed — a chat session cannot be created here'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('grpcard-wt');
const fakeHome = scratchHome('grpcard-home', fs);
const stubDir = scratch('grpcard-stub');
fs.rmSync(stubDir, { recursive: true, force: true });
fs.mkdirSync(stubDir, { recursive: true });
const CWD = { alpha: path.join(fakeHome, 'alpha'), beta: path.join(fakeHome, 'beta') };
for (const d of Object.values(CWD)) fs.mkdirSync(d, { recursive: true });
const MSG1 = 'URGENT: is the deploy blocked on your side?\nIt fails at step 3.';
const MSG2 = 'still blocked — please look now';
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the worktree (the working src/ + a built public/ overlaid, the shipped data/bin) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });

// ── the stub CLI: one per session (its conversation id from its pid), an inbox in the registry, its own hook call ──
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs'), path = require('path'), net = require('net');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = '6c0a1d00-0000-4000-8000-' + String(process.pid).padStart(12, '0');
const CWD = process.cwd();
const HOME = process.env.HOME;
const TR = path.join(HOME, '.claude', 'projects', CWD.replace(/[/._]/g, '-'), SID + '.jsonl');
fs.mkdirSync(path.dirname(TR), { recursive: true });
const DIR = ${JSON.stringify(stubDir)};
fs.writeFileSync(path.join(DIR, 'env-' + process.pid + '.json'), JSON.stringify({ SID, CWD, env: process.env }));
let n = 0, parent = null; const U = () => 'gc-' + process.pid + '-' + (++n);
const usage = { input_tokens: 1, output_tokens: 1 };
const out = (o) => process.stdout.write(JSON.stringify({ ...o, session_id: SID }) + '\\n');
const rec = (o) => { const uuid = U(); const r = { ...o, uuid, parentUuid: parent, timestamp: new Date().toISOString(), sessionId: SID, cwd: CWD, isSidechain: false, userType: 'external', version: '2.1.281' }; parent = uuid; fs.appendFileSync(TR, JSON.stringify(r) + '\\n'); return uuid; };
const both = (o) => { const uuid = rec(o); out({ ...o, uuid }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// the UserPromptSubmit hook, as the real CLI runs it: the answer rides this turn (logged for the suite to read)
async function hook(k) {
  let body = '';
  try { const r = await fetch(process.env.VIBESPACE_API + '/api/agent/prompt-context', { headers: { Authorization: 'Bearer ' + process.env.VIBESPACE_SESSION_TOKEN } }); body = String((await r.json()).context || ''); } catch (e) { body = 'HOOK FAILED ' + e.message; }
  fs.appendFileSync(path.join(DIR, 'ctx-' + SID + '.log'), JSON.stringify({ k, context: body }) + '\\n');
}
async function reply(k, text) {
  await wait(2600);   // the model's time to first token — the reply's records come well after the hook's instant
  both({ type: 'assistant', message: { id: 'msg_gc' + process.pid + '_' + k, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage } });
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 5, num_turns: 1, result: text, total_cost_usd: 0, usage, uuid: U() });
}
let chain = Promise.resolve(), turns = 0;
// a TYPED turn: the hook first (the CLI runs it before the model call), then the user record, then the reply
function typed(text) { const k = ++turns; chain = chain.then(async () => { await hook('typed:' + text); rec({ type: 'user', message: { role: 'user', content: text } }); await reply(k, 'noted: ' + text); }); }   // the transcript's copy only: the page drew the owner's message when it was sent
// an INBOX turn (a peer post — a wake): the CLI records it with a body-less peer origin, never on stdout
function inbox(text) { const k = ++turns; chain = chain.then(async () => { await hook('inbox'); rec({ type: 'user', origin: { kind: 'peer', from: 'unknown' }, message: { role: 'user', content: 'Another Claude session sent a message:\\n' + text + '\\nThis came from another Claude session, not the user.' } }); await reply(k, 'on it (woken)'); }); }
const sock = path.join(HOME, 'inbox-' + process.pid + '.sock');
try { fs.unlinkSync(sock); } catch {}
net.createServer((c) => { let buf = ''; c.on('error', () => {}); c.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m = null; try { m = JSON.parse(line); } catch {} if (m && m.type === 'user' && m.message) { fs.appendFileSync(path.join(DIR, 'inbox-' + SID + '.log'), line + '\\n'); inbox(String(m.message.content || '')); } } }); })
  .listen(sock, () => { fs.mkdirSync(path.join(HOME, '.claude', 'sessions'), { recursive: true }); fs.writeFileSync(path.join(HOME, '.claude', 'sessions', process.pid + '.json'), JSON.stringify({ pid: process.pid, sessionId: SID, messagingSocketPath: sock, name: 'stub' })); });
out({ type: 'system', subtype: 'init', model: 'claude-fable-5', cwd: CWD, tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281', uuid: U() });
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m || m.type !== 'user' || !m.message) continue;
    const c = m.message.content;
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b && b.text) || '').join('') : '';
    if (text) typed(text);
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

let srv = null;
const LOG = path.join(stubDir, 'server.log');
const startServer = () => { const fd = fs.openSync(LOG, 'a'); srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', fd, fd] }); fs.closeSync(fd); };
const waitServer = async () => { for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
startServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  // every process this suite caused carries one of these scratch paths (dtach, the wrapper, the stubs, the device daemon)
  for (const pat of [wt, fakeHome, stubDir]) { try { execSync(`pkill -9 -f ${JSON.stringify(pat)}`, { stdio: 'ignore' }); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
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
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch {} await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
let lastMiss = null;
const realClick = async (sel) => {
  const r = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, w: q.width, h: q.height, hit: hit ? hit.tagName + '.' + String(hit.className).slice(0, 60) : null, hits: !!hit && (hit === e || e.contains(hit)) }; })()`);
  if (!r || !r.hits) { lastMiss = r; return false; }
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
};
const shot = async (name, sel, pad = 6) => {
  const dir = process.env.VS_SHOT_DIR;
  if (!dir) return;
  try {
    const r = sel ? await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const q = e.getBoundingClientRect(); return { x: Math.max(0, q.left - ${pad}), y: Math.max(0, q.top - ${pad}), width: q.width + ${2 * pad}, height: q.height + ${2 * pad}, scale: 1 }; })()`) : null;
    const img = await cdp('Page.captureScreenshot', { format: 'png', ...(r ? { clip: r } : {}), captureBeyondViewport: false });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(img.data, 'base64'));
    console.log(`    (screenshot ${name}.png)`);
  } catch (e) { console.log(`    (screenshot ${name} failed: ${e.message})`); }
};
const api = async (method, p, body, headers = {}) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const stubEnvs = () => fs.readdirSync(stubDir).filter((x) => /^env-\d+\.json$/.test(x)).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')); } catch { return null; } }).filter(Boolean);
const ctxLog = (sid) => { try { return fs.readFileSync(path.join(stubDir, 'ctx-' + sid + '.log'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const VIEW = (wid) => `[...app.sessions.values()].find((v) => v && v.sessionId === ${JSON.stringify(wid)})`;
// the chat's cards in DOM order, each as a short tag (a group card: its head + body; a user bubble: its text; the reply)
const CARDS = (wid) => `[...(${VIEW(wid)})._messageList.querySelectorAll(':scope > .chat-msg')].map((e) => e.classList.contains('chat-group-message') ? { g: e.querySelector('.chat-peer-title').textContent.trim(), body: (e.querySelector('.chat-text') || {}).textContent || '', tip: e.querySelector('.chat-peer-head').title || '' } : e.classList.contains('chat-peer-message') ? { peer: e.textContent.slice(0, 160) } : e.classList.contains('chat-msg-user') ? { u: e.textContent.trim().slice(0, 80) } : e.classList.contains('chat-msg-assistant') ? { a: e.textContent.trim().slice(0, 80) } : { other: String(e.className).slice(0, 60) })`;

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp(); await sleep(600);

  console.log('setup: two live stub sessions (alpha, beta), beta reachable to alpha');
  const ws0 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws0.on('open', r));
  const frames = []; ws0.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  const who = {};
  for (const name of ['alpha', 'beta']) {
    const before = stubEnvs().length;
    const reqId = 'gc-' + name;
    ws0.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD[name], reqId }));
    let wid = null;
    for (let i = 0; i < 80 && !wid; i++) { const f = frames.find((m) => m?.type === 'created' && !Object.values(who).some((w) => w.wid === m.sessionId)); if (f) wid = f.sessionId; else await sleep(250); }
    let env = null;
    for (let i = 0; i < 80 && !env; i++) { const all = stubEnvs(); if (all.length > before) env = all.find((e) => e.CWD === CWD[name]) || null; if (!env) await sleep(250); }
    who[name] = { wid, sid: env && env.SID, token: env && env.env.VIBESPACE_SESSION_TOKEN };
    ws0.send(JSON.stringify({ type: 'rename-session', webuiId: wid, name }));
  }
  check('two live claude chat sessions through the real spawn path (stub CLIs behind the real wrapper), each with its token', !!(who.alpha.wid && who.beta.wid && /^vsst_/.test(who.alpha.token || '') && /^vsst_/.test(who.beta.token || '')), { alpha: { ...who.alpha, token: !!who.alpha.token }, beta: { ...who.beta, token: !!who.beta.token } });
  let seen = false;
  for (let i = 0; i < 80 && !seen; i++) { const r = await api('GET', '/api/channel-groups/roster').catch(() => null); const ss = (r && r.body && r.body.sessions) || []; seen = ['alpha', 'beta'].every((n) => ss.some((s) => s.cid === who[n].sid && s.name === n)); if (!seen) await sleep(250); }
  check('both are on the groups roster by conversation id and name', seen);
  const reach = await api('POST', `/api/sessions/${encodeURIComponent(who.beta.wid)}/msg-reachability`, { level: 'messageable' });
  check('the owner opens beta to messages from other agents (msg-acl override)', reach.status === 200, reach);

  // ── ① alpha → beta, no wake ──
  console.log('① alpha sends beta a message WITHOUT --wake');
  const s1 = await api('POST', '/api/agent/msg/send', { to: 'beta', text: MSG1 }, { Authorization: 'Bearer ' + who.alpha.token });
  const gid = s1.body && s1.body.group && s1.body.group.id;
  const gname = s1.body && s1.body.group && s1.body.group.name;
  check('alpha\'s own agent route posts into the pair group; nobody is woken, beta gets it on its next turn', s1.status === 200 && !!gid && (s1.body.woke || []).length === 0, s1.body);

  // ── ② the strip ──
  console.log('② the owner opens beta\'s window: the strip names the waiting group message, no hand-over button');
  await evalJs(`app.attachSession(${JSON.stringify(who.beta.wid)}, 'beta', ${JSON.stringify(CWD.beta)}, { mode: 'chat', backend: 'claude' }); true`);
  check('beta\'s chat window attaches', await waitFor(`!!(${VIEW(who.beta.wid)})?._messageList`, 20000));
  const STRIP = `(${VIEW(who.beta.wid)})._chatInput._stashStrip.el`;
  check('the strip: "1 notice is waiting for this agent’s next turn: a group message from alpha"', await waitFor(`(() => { const e = ${STRIP}; return !e.hidden && e.querySelector('.chat-stash-head').textContent === '1 notice is waiting for this agent’s next turn' && e.querySelector('.chat-stash-parts').textContent === ': a group message from alpha'; })()`, 12000),
    await evalJs(`(() => { const e = ${STRIP}; return { hidden: e.hidden, text: e.textContent }; })()`).catch(() => null));
  const stripState = await evalJs(`(() => { const e = ${STRIP}; const go = e.querySelector('.chat-stash-go'), nb = e.querySelector('.chat-stash-nobutton'); return { goHidden: go.hidden, goDisplay: getComputedStyle(go).display, nb: nb.hidden ? null : nb.textContent, nbDisplay: getComputedStyle(nb).display, title: nb.title }; })()`);
  check('…NO "Hand over now" button (a hand-over never carries a group report) — "they ride the next turn" stands where it would be', stripState.goHidden && stripState.goDisplay === 'none' && stripState.nb === 'they ride the next turn' && stripState.nbDisplay !== 'none' && /ride this agent’s next turn, whoever starts it/.test(stripState.title), stripState);
  check('the sidebar card says "1 waiting"', await waitFor(`[...document.querySelectorAll('.session-item-card')].some((c) => c._webuiId === ${JSON.stringify(who.beta.wid)} && (c.querySelector('.sess-stash-chip .chip-text') || {}).textContent === '1 waiting')`, 8000));
  await evalJs(`(() => { ${STRIP}.id = 'gc-strip'; return true; })()`);
  await shot('strip', '#gc-strip', 8);

  // ── ③ the owner's turn to beta: the report rides it, the card is drawn ──
  console.log('③ the owner types to beta: the report rides that turn, and the chat SHOWS it');
  await evalJs(`app.ws.send({ type: 'chat-input', sessionId: ${JSON.stringify(who.beta.wid)}, text: 'hi beta' }); true`);
  check('ONE group card appears in beta\'s chat', await waitFor(`${CARDS(who.beta.wid)}.filter((c) => c.g).length === 1`, 20000), await evalJs(CARDS(who.beta.wid)).catch(() => null));
  check('…and beta\'s turn DID get the report (its hook\'s answer holds alpha\'s words)', await waitFor(`true`, 1) && ctxLog(who.beta.sid).some((x) => x.k === 'typed:hi beta' && x.context.includes('URGENT: is the deploy blocked on your side?') && x.context.includes('### Group messages since your last turn')), ctxLog(who.beta.sid).map((x) => ({ k: x.k, has: x.context.includes('URGENT') })));
  await waitFor(`${CARDS(who.beta.wid)}.some((c) => c.a && /noted: hi beta/.test(c.a))`, 15000);
  const c3 = await evalJs(CARDS(who.beta.wid));
  const gi = c3.findIndex((c) => c.g), ui = c3.findIndex((c) => c.u && /hi beta/.test(c.u)), ai = c3.findIndex((c) => c.a && /noted: hi beta/.test(c.a));
  check(`the card is "alpha → ${gname}" with alpha's words (its own line breaks), "delivered with this turn" on its head`, gi >= 0 && c3[gi].g === `alpha → ${gname}` && c3[gi].body.includes('URGENT: is the deploy blocked on your side?') && c3[gi].body.includes('It fails at step 3.') && /delivered with this turn/.test(c3[gi].tip), c3[gi]);
  check('…under the owner\'s message, before beta\'s reply (the injection point)', ui >= 0 && ui < gi && gi < ai, c3);
  check('the strip and the card hint are gone (the report went with the turn)', await waitFor(`${STRIP}.hidden === true && ![...document.querySelectorAll('.session-item-card')].some((c) => c._webuiId === ${JSON.stringify(who.beta.wid)} && c.querySelector('.sess-stash-chip'))`, 8000));
  await evalJs(`(() => { const e = (${VIEW(who.beta.wid)})._messageList.querySelector('.chat-group-message'); e.id = 'gc-card1'; e.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(200);
  await shot('report-card', '#gc-card1', 8);
  const chanWin = `[...app.wm.windows.values()].find((w) => w && w._openSpec && w._openSpec.action === 'openChannel' && w._openSpec.convId === ${JSON.stringify(gid)})`;
  check('a REAL click on the group\'s name opens the group\'s window', await realClick('#gc-card1 .chat-peer-group') && await waitFor(`!!(${chanWin})`, 8000), lastMiss);
  await evalJs(`(() => { const w = [...app.sessions.entries()].find(([, v]) => v && v.sessionId === ${JSON.stringify(who.beta.wid)}); app.wm.focusWindow(w[0]); return true; })()`);

  // ── ④ a wake draws the same kind of card ──
  console.log('④ alpha WAKES beta: the same card, via the ladder');
  const s2 = await api('POST', '/api/agent/msg/send', { to: 'beta', text: MSG2, wake: true }, { Authorization: 'Bearer ' + who.alpha.token });
  check('alpha\'s --wake send wakes beta (one billed turn through the ladder)', s2.status === 200 && (s2.body.woke || []).length === 1, s2.body);
  check('beta\'s CLI inbox received the post', await waitFor('true', 1) && await (async () => { for (let i = 0; i < 40; i++) { try { if (fs.readFileSync(path.join(stubDir, 'inbox-' + who.beta.sid + '.log'), 'utf8').includes('still blocked')) return true; } catch {} await sleep(250); } return false; })());
  check('a SECOND group card: alpha\'s wake, "it woke this agent" on its head', await waitFor(`${CARDS(who.beta.wid)}.filter((c) => c.g).length === 2`, 15000) && await evalJs(`(() => { const g = ${CARDS(who.beta.wid)}.filter((c) => c.g)[1]; return g.g === ${JSON.stringify(`alpha → ${gname}`)} && g.body.includes(${JSON.stringify(MSG2)}) && /woke this agent/.test(g.tip); })()`),
    await evalJs(CARDS(who.beta.wid)).catch(() => null));
  check('…the wake turn\'s own hook got NO report (a machine turn) — the message was the wake\'s', ctxLog(who.beta.sid).filter((x) => x.k === 'inbox').every((x) => !x.context.includes(MSG2)), ctxLog(who.beta.sid).filter((x) => x.k === 'inbox'));
  await waitFor(`${CARDS(who.beta.wid)}.some((c) => c.a && /on it \\(woken\\)/.test(c.a))`, 15000);
  await evalJs(`(() => { const e = [...(${VIEW(who.beta.wid)})._messageList.querySelectorAll('.chat-group-message')][1]; e.id = 'gc-card2'; e.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(200);
  await shot('wake-card', '#gc-card2', 8);
  await evalJs(`app.ws.send({ type: 'chat-input', sessionId: ${JSON.stringify(who.beta.wid)}, text: 'second turn' }); true`);
  await waitFor(`${CARDS(who.beta.wid)}.some((c) => c.a && /noted: second turn/.test(c.a))`, 15000);
  check('the owner\'s next message to beta draws NO second card for the woken message', (await evalJs(CARDS(who.beta.wid))).filter((c) => c.g).length === 2 && !ctxLog(who.beta.sid).some((x) => x.k === 'typed:second turn' && x.context.includes(MSG2)), await evalJs(CARDS(who.beta.wid)));

  // ── ⑤ restart ──
  console.log('⑤ SIGKILL + restart; a fresh page: both cards are still there, once each, in their places');
  await sleep(1200);   // the ring's meta write is a microtask after the card; the transcript is the stub's
  try { srv.kill('SIGKILL'); } catch {}
  await sleep(800);
  startServer();
  check('the server is back', await waitServer());
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp(); await sleep(800);
  check('beta survived the restart (dtach)', await waitFor(`(app.sidebar._webuiSessions || []).some((s) => s.id === ${JSON.stringify(who.beta.wid)})`, 20000));
  await evalJs(`app.attachSession(${JSON.stringify(who.beta.wid)}, 'beta', ${JSON.stringify(CWD.beta)}, { mode: 'chat', backend: 'claude' }); true`);
  const back = await waitFor(`!!(${VIEW(who.beta.wid)})?._messageList && ${CARDS(who.beta.wid)}.some((c) => c.a && /noted: second turn/.test(c.a))`, 30000);
  const c5 = back ? await evalJs(CARDS(who.beta.wid)) : [];
  const g5 = c5.filter((c) => c.g);
  check('both group cards are there again, ONCE each (the report card from the persisted ring, the wake from the transcript\'s own record)', back && g5.length === 2 && g5[0].body.includes('URGENT: is the deploy blocked on your side?') && g5[1].body.includes(MSG2) && /delivered with this turn/.test(g5[0].tip) && /woke this agent/.test(g5[1].tip), c5);
  const u5 = c5.findIndex((c) => c.u && /hi beta/.test(c.u)), r5 = c5.findIndex((c) => c.g && c.body.includes('URGENT')), a5 = c5.findIndex((c) => c.a && /noted: hi beta/.test(c.a));
  check('…the report card in its place: under "hi beta", before beta\'s reply', u5 >= 0 && u5 < r5 && r5 < a5, c5);
  check('…and the raw agent-facing report never shows (no "#### Group …" peer card beside them)', !c5.some((c) => (c.peer && /#### Group|vibespace-msg send/.test(c.peer)) || (c.g && /#### Group|Reply: vibespace-msg/.test(c.body))), c5);
  await evalJs(`(() => { const e = (${VIEW(who.beta.wid)})._messageList.querySelector('.chat-group-message'); e.id = 'gc-card1b'; e.scrollIntoView({ block: 'center' }); return true; })()`);
  await sleep(200);
  await shot('report-card-after-restart', '#gc-card1b', 8);
  check('no page exception anywhere', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++;
  console.error('✗ suite threw:', e && e.stack || e);
  try { console.error(fs.readFileSync(LOG, 'utf8').split('\n').slice(-40).join('\n')); } catch {}
}
console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
