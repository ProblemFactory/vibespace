#!/usr/bin/env node
// A TURN PARKED ON A PERMISSION ASK, ON A REAL PAGE, ACROSS A SERVER RESTART (lane
// parked-ask-stall, 2.369.229 — a fleet pod's D-docusign, inc-muxrol54-uv2d). A
// worktree server, a stub `claude` behind the REAL chat-wrapper that parks a Bash
// call on a `can_use_tool` ask (session_state_changed requires_action → the
// control_request → commands_changed, as measured), answers our control requests
// (apply_flag_settings ⇒ the 85 B success of ANOTHER id) and runs the tool only
// when the ask is answered; headless chrome over raw CDP. No vendor call.
//   P1 the ask is a permission card; the chip says "waiting for you"
//   P2 RESTART (the stub lives on in dtach), a fresh page: the card is back with
//      its buttons, the view's turn state is requires_action, the typing line
//      says "waiting for you" (not "thinking"), the session list's turn is
//      'waiting'; the REAL watchdog tick, 10 min of silence later, does not
//      re-attach (CONTROL: the same tick with the turn state and asks blanked
//      re-attaches — the leg can go red)
//   P3 a real click on Allow reaches the CLI's stdin with the ask's request id,
//      the tool runs (the stub's marker file), the turn ends; no
//      "[chat] delivery stall" line was logged by the page in the whole run
// Requires google-chrome + dtach (SKIP without). Run: node scripts/test-parked-ask-ui.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
try { execSync('command -v dtach', { stdio: 'ignore', shell: '/bin/bash' }); } catch { console.log('SKIP: dtach is not installed — a chat session cannot be created here'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('parked-ask-ui-wt');
const fakeHome = scratchHome('parked-ask-ui-home', fs);
const stubDir = scratch('parked-ask-ui-stub');
fs.rmSync(stubDir, { recursive: true, force: true });
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the stub CLI: parks one Bash call on a can_use_tool ask until it is answered ──
const STDIN_LOG = path.join(stubDir, 'stdin.ndjson');
const RAN = path.join(stubDir, 'tool-ran');
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = '0e1a51a0-0000-4000-8000-' + String(process.pid).padStart(12, '0');
const out = (o) => process.stdout.write(JSON.stringify({ ...o, session_id: SID }) + '\\n');
const state = (s) => out({ type: 'system', subtype: 'session_state_changed', state: s, uuid: 'st-' + Math.random().toString(16).slice(2) });
let n = 0; const U = () => 'u-' + (++n);
const usage = { input_tokens: 1, output_tokens: 1 };
const cc = () => out({ type: 'system', subtype: 'commands_changed', commands: [], uuid: U() });
const CMD = 'bash -c "rm -rf ./ds-out && ./sign.sh"';
out({ type: 'system', subtype: 'init', model: 'claude-sonnet-5', cwd: process.cwd(), tools: ['Bash'], permissionMode: 'bypassPermissions', claude_code_version: '2.1.281', uuid: U() });
let parked = false, buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    fs.appendFileSync(${JSON.stringify(STDIN_LOG)}, line + '\\n');
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m) continue;
    if (m.type === 'control_request') { out({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id } }); cc(); continue; } // ours (apply_flag_settings …): the CLI answers even while parked
    if (m.type === 'user' && !parked) {
      parked = true;
      state('running');
      out({ type: 'assistant', message: { id: 'msg_' + U(), type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'tool_use', id: 'toolu_park', name: 'Bash', input: { command: CMD } }], stop_reason: 'tool_use', usage }, parent_tool_use_id: null, uuid: U() });
      state('requires_action');
      out({ type: 'control_request', request_id: 'req-park', request: { subtype: 'can_use_tool', tool_name: 'Bash', display_name: 'Bash', input: { command: CMD }, permission_suggestions: [], tool_use_id: 'toolu_park' } });
      cc(); cc(); cc();
      continue;
    }
    if (m.type === 'control_response' && m.response && m.response.request_id === 'req-park' && parked) {
      parked = false;
      const allowed = m.response.response && m.response.response.behavior === 'allow';
      state('running');
      if (allowed) fs.writeFileSync(${JSON.stringify(RAN)}, 'signed');
      out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_park', content: allowed ? 'envelope signed' : 'denied', is_error: !allowed }] }, parent_tool_use_id: null, uuid: U() });
      out({ type: 'assistant', message: { id: 'msg_' + U(), type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: allowed ? 'The envelope is signed.' : 'Not signed.' }], stop_reason: 'end_turn', usage }, parent_tool_use_id: null, uuid: U() });
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 5, num_turns: 1, result: 'done', total_cost_usd: 0, usage, uuid: U() });
      state('idle');
    }
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── throwaway server in a scratch worktree (overlays the working src/ + the built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
let srv = null;
const SRV_LOG = path.join(stubDir, 'server.log');
const startServer = () => { const fd = fs.openSync(SRV_LOG, 'a'); srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', fd, fd] }); fs.closeSync(fd); };
const waitServer = async () => { for (let i = 0; i < 120; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
startServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  // every process this suite caused carries one of these scratch paths (dtach, the wrapper, the stub, the device daemon)
  for (const root of [wt, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} } // §57b: the dtach, the wrapper, the stub — every process rooted in a scratch dir of this run
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
await waitServer();

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
/** A real click at the element's centre (the element must be the one hit there). `root` = a JS expression for the scope. */
const realClickEl = async (expr) => {
  const r = await evalJs(`(() => { const e = ${expr}; if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, hits: !!hit && (hit === e || e.contains(hit)) }; })()`);
  if (!r || !r.hits) return false;
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
};
const stdinFrames = () => (fs.existsSync(STDIN_LOG) ? fs.readFileSync(STDIN_LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const responsesFor = (rid) => stdinFrames().filter((m) => m.type === 'control_response' && m.response?.request_id === rid);
const waitResponses = async (rid) => { for (let i = 0; i < 60; i++) { const r = responsesFor(rid); if (r.length) return r; await sleep(100); } return responsesFor(rid); };

// page-side helpers: the chat's list, a card, the chip
const VIEW = (sid) => `[...app.sessions.values()].find((v) => v && v.sessionId === ${JSON.stringify(sid)})`;
const LIST = (sid) => `(${VIEW(sid)})?._messageList`;
const CARD = (sid, call) => `(${LIST(sid)})?.querySelector('[data-tool-id="${call}"]')`;
const CHIP = (sid) => `(${VIEW(sid)})?._statusBar?.element?.querySelector('.chat-status-turnstate')`;

let liveWs = null; const frames = [];
const openWs = async () => { liveWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); await new Promise((r) => liveWs.on('open', r)); liveWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} }); };
const create = async (reqId) => {
  const before = frames.filter((m) => m?.type === 'created').length;
  liveWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId }));
  for (let i = 0; i < 80; i++) { const made = frames.filter((m) => m?.type === 'created'); if (made.length > before) return made[made.length - 1].sessionId; await sleep(250); }
  return null;
};
const attach = async (sid, name) => {
  await evalJs(`app.attachSession(${JSON.stringify(sid)}, ${JSON.stringify(name)}, ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  return waitFor(`!!(${VIEW(sid)})?._messageList`, 20000);
};

const TYPING = (sid) => `(${VIEW(sid)})?._chatInput?._streamStatus?.querySelector('.chat-stream-label')?.textContent || ''`;
const PERM = (sid) => `(${CARD(sid, 'toolu_park')})?.querySelector('.chat-perm-allow')`;
const turnOfList = (sid) => { const f = [...frames].reverse().find((m) => m?.type === 'active-sessions' && Array.isArray(m.sessions) && m.sessions.some((x) => x && x.id === sid)); const row = f && f.sessions.find((x) => x.id === sid); return row ? row.turn : 'no-row'; }; // the live session list (server.js activeSessionsPayload) — the For-you dot reads its `turn`
const stallLines = [];
try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  sock.on('message', (d) => { try { const m = JSON.parse(d); if (m.method === 'Runtime.consoleAPICalled') { const txt = (m.params.args || []).map((a) => a.value).join(' '); if (/delivery stall/.test(txt)) stallLines.push(txt); } } catch {} });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(500);
  await openWs();

  console.log('P1 the turn parks on a permission ask');
  const sid = await create('parked-1');
  check('a chat session is created (the stub behind the real chat-wrapper)', !!sid);
  check('the chat window attaches', await attach(sid, 'D-docusign'));
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'sign the envelope' }));
  check('the ask is a permission card with Allow', await waitFor(`!!(${PERM(sid)})`, 20000));
  check('the chip says "waiting for you"', await waitFor(`!!(${CHIP(sid)})`, 10000));

  console.log('P2 a server restart, a fresh page');
  await sleep(1800);
  const epochBefore = await evalJs(`(${VIEW(sid)})?._normEpoch || 0`);
  try { srv.kill('SIGKILL'); } catch {}
  await sleep(600);
  startServer();
  check('the server comes back', await waitServer());
  try { liveWs.close(); } catch {}
  await openWs();
  await cdp('Page.reload', {});
  await waitApp();
  await sleep(500);
  if (!(await waitFor(`!!(${VIEW(sid)})?._messageList`, 6000))) await attach(sid, 'D-docusign');
  check('the reloaded page shows the conversation from the restarted server (a new normalizer epoch)', await waitFor(`(() => { const e = (${VIEW(sid)})?._normEpoch || 0; return !!e && e !== ${Number(epochBefore) || 0}; })()`, 30000), { epochBefore });
  check('THE CARD IS BACK: the parked ask has its Allow button after the restart', await waitFor(`!!(${PERM(sid)})`, 30000));
  const p2 = await evalJs(`(() => { const v = ${VIEW(sid)}; return { turnState: v?._turnState || null, asks: (v?._pendingAsks || []).map((a) => a.requestId), chip: !!(${CHIP(sid)}), typing: ${TYPING(sid)}, typingSince: !!v?._typingSince }; })()`);
  check('the view\'s turn state is requires_action (the ring\'s last word, not a bare streaming:true)', p2.turnState === 'requires_action', p2);
  check('the chip says "waiting for you" and the asks name the parked request', p2.chip && p2.asks.includes('req-park'), p2);
  check('the typing line says "waiting for you", never "thinking"', p2.typingSince && /waiting for you/.test(p2.typing) && !/thinking/i.test(p2.typing), p2);
  let turn = turnOfList(sid); for (let i = 0; i < 20 && turn !== 'waiting'; i++) { await sleep(250); turn = turnOfList(sid); }
  check('the session list\'s turn fact (the sidebar / For-you dot) is \'waiting\'', turn === 'waiting', turn);
  const stallBefore = stallLines.length;
  const tick = await evalJs(`(() => { const v = ${VIEW(sid)}; let n = 0; const real = v._reattach; v._reattach = () => { n++; }; const save = { since: v._typingSince, inb: v._lastInboundAt, at: v._stallReattachAt };
    v._typingSince = Date.now() - 600000; v._lastInboundAt = Date.now() - 600000; v._stallReattachAt = 0; v._stallTick(v.sessionId);
    const parked = n;
    const keep = { ts: v._turnState, asks: v._pendingAsks }; v._turnState = null; v._pendingAsks = []; v._stallTick(v.sessionId); const control = n - parked;
    v._turnState = keep.ts; v._pendingAsks = keep.asks; v._reattach = real; v._typingSince = save.since; v._lastInboundAt = save.inb; v._stallReattachAt = save.at; v._stallForced = 0;
    return { parked, control }; })()`);
  check('the REAL watchdog tick, 10 min of silence later, does not re-attach the parked turn', tick.parked === 0, tick);
  check('CONTROL: the same tick with the turn state and the asks blanked re-attaches (the leg can go red)', tick.control === 1, tick);
  await sleep(300);
  const controlLines = stallLines.length - stallBefore; // the control's own forced re-attach logs its line — the only one allowed

  console.log('P3 the answer resumes the tool');
  check('a real click on Allow', await realClickEl(PERM(sid)));
  const resp = await waitResponses('req-park');
  check('the answer reaches the CLI\'s stdin with the parked request id (allow)', resp.length === 1 && resp[0].response?.response?.behavior === 'allow', resp);
  let ran = false; for (let i = 0; i < 60 && !ran; i++) { ran = fs.existsSync(RAN); if (!ran) await sleep(250); }
  check('the tool runs (the stub\'s marker)', ran);
  check('the result renders and the turn ends (no typing line, no chip)', await waitFor(`(() => { const v = ${VIEW(sid)}; return [...(v?._messageList?.querySelectorAll('.chat-msg') || [])].some((m) => /The envelope is signed/.test(m.textContent)) && !v._typingSince && !(${CHIP(sid)}); })()`, 30000));
  check('no "[chat] delivery stall" line in the whole run but the control\'s own', controlLines === 1 && stallLines.length === 1, stallLines);
  try { liveWs.send(JSON.stringify({ type: 'kill', sessionId: sid })); liveWs.close(); } catch {}
} catch (e) {
  failed++;
  console.error('✗ suite threw: ' + (e && e.stack || e));
}
if (failed && process.env.PARKED_KEEP_LOG) { try { fs.copyFileSync(SRV_LOG, process.env.PARKED_KEEP_LOG); fs.copyFileSync(STDIN_LOG, process.env.PARKED_KEEP_LOG + '.stdin'); } catch {} }
console.log(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
cleanup();
process.exit(failed ? 1 : 0);
