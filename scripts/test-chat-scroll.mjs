#!/usr/bin/env node
// test-chat-scroll — lane door-healthy-chat (2.369.344): THE FIRST TURNS LOOK HEALTHY, SEEN in a real page. The naive-user
// studies on 2.369.342 (study 1 W1 W2 W3 W4 W5 W9, study 2 B3 C1 C10 C11): red protocol cards in the person's chat, a
// first turn silently waiting on a «Permission: Bash» card below the fold, shell code in every card, a chat the keys did
// not move, a document opened before its file existed that stayed «ENOENT», a bare dollar figure.
//
// A THROWAWAY server in a git worktree (own data/, a scratch HOME) + headless chrome over raw CDP (test-chat-hygiene-ui's
// skeleton). A stub `claude` 2.1.309 (a build this release has not registered) runs behind the REAL chat-wrapper through
// the REAL create path: turn 1 plays a long answer with Bash cards, `api-request-blob` / `api-request` records and a
// result that grew `model_usage_since_last_result` (exactly the studies' records); turns 2–3 answer one line (the minimap
// needs three turns); turn 4 asks three permissions like the CLI (`control_request can_use_tool`): a pip install + reads,
// a Write of Summary.md (the file lands only when allowed), a shell loop.
//   ① no record kind in the chat: zero failed ops while the turn streamed (the `msg` create key threw on every unknown
//      record), no «Unknown event» / «New fields» card; ONE quiet chip «3 record kinds this version added — Diagnostics»
//      (never red) whose press opens ⚙ Diagnostics
//   ② the cost says what it is: «This chat ≈ $0.47 · included in your subscription» (the stub's login = a subscription),
//      quiet; an API key ⇒ «· billed per use (API key)» in a tier colour; an unknown basis ⇒ the figure and its words only
//   ③ a real wheel (Input.dispatchMouseEvent mouseWheel) over the list moves it up and down
//   ④ a press on a message focuses the LIST: PageUp / PageDown move it
//   ⑤ the message box focused: PageUp / PageDown page the conversation; a draft that outgrew its box keeps them
//   ⑥ three turns ⇒ the minimap replaces the scrollbar; a real wheel over its strip moves the list (a pin — the base does too)
//   ⑦ a product dialog (Update VibeSpace, its changelog answered by CDP Fetch) scrolls with a real wheel and PageDown
//   ⑧ the permission card says the request in words above the folded command («install python-docx · read 3 files»);
//      the line above the message box says «Waiting for you to allow: …» and a press on it brings the card into view
//   ⑨ the Write's document opened BEFORE its file existed says «Waiting for the file…» and opens it when it lands
//   ⑩ the THIRD prompt offers «Let it work in work/ without asking» (the first two do not); a press answers with the
//      folder's allow rules (Bash, Edit, Write, MultiEdit, NotebookEdit → localSettings) on the CLI's stdin
// RED CONTROL: the same suite on the base tree (2.369.342) fails 22 legs: ① ② ④ ⑤ ⑦'s PageDown ⑧ ⑨ ⑩ (③, ⑥ and ⑦'s wheel
// are pins — a real wheel always worked; the studies' «dead wheel» was the harness: agent-browser 0.38.2 `mouse wheel` lands at 0,0).
// Requires google-chrome (SKIP without). Run: node scripts/test-chat-scroll.mjs [--tree <dir>]
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const ti = process.argv.indexOf('--tree');
const repo = ti > 0 ? path.resolve(process.argv[ti + 1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('chat-scroll-wt');
const fakeHome = scratchHome('chat-scroll-home', fs);
const stubDir = scratch('chat-scroll-stub');
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'work');
fs.mkdirSync(CWD, { recursive: true });
const SUMMARY = path.join(CWD, 'Summary.md');
const SID = '5c3a0000-0000-4000-8000-0000000c5c01';
const STDIN_LOG = path.join(stubDir, 'stdin.ndjson');
const NTH_FILE = path.join(stubDir, 'nth'); // the stub's chat-process counter: the 2nd chat (⑪) gets its own conversation id and script
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── ⑪ census (lane chat-live-tail-pin, inc-mvl02dkn-gop0): THE PIN CHANGES IN ONE PLACE. The owner's capture lost its pin
// with no `unpin` in 300 events — fifteen sites assigned `_pinned` bare and only one traced. Every write to a chat view's
// `_pinned` in the client goes through ChatView._setPinned(v, why) (traced `pin` / `unpin` {why}); the ONE assignment is
// inside it. src/lib/terminal.js is a different object (the terminal's own follow flag) — the named exemption.
console.log('⑪ census: no bare `_pinned =` outside ChatView._setPinned');
{
  const LIB = path.join(repo, 'src/lib');
  const EXEMPT = { 'terminal.js': 'TerminalSession keeps its own follow flag (not a chat view)' };
  const ASSIGN = /\b_pinned\s*(?:\|\||&&|\?\?)?=(?!=)/g;
  const rows = [];
  for (const f of fs.readdirSync(LIB).filter((x) => x.endsWith('.js')).sort()) {
    if (EXEMPT[f]) continue;
    const src = fs.readFileSync(path.join(LIB, f), 'utf8');
    for (const m of src.matchAll(ASSIGN)) rows.push({ f, line: src.slice(0, m.index).split('\n').length, text: src.slice(src.lastIndexOf('\n', m.index) + 1, src.indexOf('\n', m.index)).trim().slice(0, 120) });
  }
  const cvSrc = fs.readFileSync(path.join(LIB, 'chat-view.js'), 'utf8');
  const setter = cvSrc.match(/\n  _setPinned\(v, why, extra\) \{[\s\S]*?\n  \}\n/);
  const inSetter = (r) => r.f === 'chat-view.js' && !!setter && (() => { const at = cvSrc.indexOf(setter[0]); const a = cvSrc.slice(0, at).split('\n').length; return r.line > a && r.line <= a + setter[0].split('\n').length; })();
  const bare = rows.filter((r) => !inSetter(r));
  check(`the setter exists and holds the ONE assignment (${rows.length - bare.length} inside it)`, !!setter && rows.length - bare.length === 1, rows);
  check(`no bare \`_pinned =\` anywhere else in src/lib (${bare.length}${bare.length ? ': ' + bare.map((r) => `${r.f}:${r.line}`).join(', ') : ''})`, bare.length === 0, bare);
  check('…and the setter traces every change with its reason (`pin` / `unpin` {why})', !!setter && /this\._trace\(on \? 'pin' : 'unpin', \{ why:/.test(setter[0]));
  // CONTROL: the census sees a bare assignment (the base's wheel-top site, re-inserted into a scratch copy of the text)
  const ctl = cvSrc.replace("this._setPinned(false, 'wheelUp');\n        this._trace('wheelTop',", "this._pinned = false;\n        this._trace('wheelTop',");
  check('CONTROL: the base\'s silent wheel-top unpin, put back in a copy, is a bare assignment the census counts', ctl !== cvSrc && [...ctl.matchAll(ASSIGN)].length === [...cvSrc.matchAll(ASSIGN)].length + 1);
}

// ── the stub CLI ──
const A = (id, content, extra = {}) => ({ type: 'assistant', message: { id, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content, usage: { input_tokens: 1, output_tokens: 1 }, ...extra } });
const PLAY1 = [];
for (let i = 0; i < 36; i++) {
  PLAY1.push(A('msg_t' + i, [{ type: 'text', text: `Paragraph ${i}: ` + 'The numbers in the draft were checked against the cap table and the compute bills. '.repeat(4) }]));
  if (i % 3 === 0) { PLAY1.push({ type: 'api-request-blob', request_id: 'req_' + i, blob: 'x'.repeat(120) }); PLAY1.push({ type: 'api-request', request_id: 'req_' + i, model: 'claude-sonnet-5-5' }); }
  if (i % 4 === 1) {
    PLAY1.push(A('msg_b' + i, [{ type: 'tool_use', id: 'toolu_b' + i, name: 'Bash', input: { command: `for d in a b c; do echo $d ${i}; done`, description: 'Loop' } }]));
    PLAY1.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_b' + i, content: 'a\nb\nc' }] } });
  }
}
PLAY1.push(A('msg_end1', [{ type: 'text', text: 'LAST-LINE-1 all done.' }], { stop_reason: 'end_turn' }));
// ⑪'s BUSY LIVE TURN (inc-mvl02dkn-gop0: a 1.4 h chat at ~100 frames a minute, two helpers working): groups of one line of
// text and a run of three tool cards (Read / Grep / Bash — folded under a run header), a fast prologue, then a slow
// stream that keeps going (a record every 250 ms, a tool card's result landing = a live edit) until the next message.
const LIVE = [];
for (let g = 0; g < 120; g++) {
  LIVE.push(A('msg_lv_t' + g, [{ type: 'text', text: `TICK-${g}: ` + 'Working through the next file of the colony code. '.repeat(3) }]));
  for (const [k, name, input] of [['r', 'Read', { file_path: '/work/room' + g + '.js' }], ['g', 'Grep', { pattern: 'spawn' + g, path: '/work' }], ['b', 'Bash', { command: 'ls /work/' + g, description: 'List' }]]) {
    LIVE.push(A(`msg_lv_${k}${g}`, [{ type: 'tool_use', id: `toolu_lv_${k}${g}`, name, input }]));
    LIVE.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_lv_${k}${g}`, content: 'ok\n'.repeat(4) }] } });
  }
}
const LIVE_FAST = 15 * 7; // the prologue: fifteen groups at 30 ms, then the slow stream from TICK-15 on
const ASKS = [
  { tool: 'Bash', input: { command: 'pip install python-docx && cat a.pdf b.pdf c.pdf', description: 'Install and read' } },
  { tool: 'Write', input: { file_path: SUMMARY, content: '# Summary\n\nTHE-SUMMARY-LANDED: two contracts renew automatically.\n' } },
  { tool: 'Bash', input: { command: 'for d in a b c; do echo "$d"; done', description: 'Loop' } },
];
fs.writeFileSync(path.join(stubDir, 'claude'), `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.309 (Claude Code)'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const NTH = args.includes('stream-json') ? (() => { let n = 0; try { n = Number(fs.readFileSync(${JSON.stringify(NTH_FILE)}, 'utf8')) || 0; } catch {} fs.writeFileSync(${JSON.stringify(NTH_FILE)}, String(n + 1)); return n; })() : 0;
const SID = NTH ? ${JSON.stringify(SID.slice(0, -2))} + String(10 + NTH) : ${JSON.stringify(SID)}; const PLAY1 = ${JSON.stringify(PLAY1)}; const ASKS = ${JSON.stringify(ASKS)};
const LIVE = ${JSON.stringify(LIVE)}; const LIVE_FAST = ${LIVE_FAST};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const result = (cost, extra) => out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 900, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: cost, usage: { input_tokens: 1, output_tokens: 1 }, ...(extra || {}) });
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-sonnet-5-5', cwd: ${JSON.stringify(CWD)}, tools: ['Bash', 'Write'], permissionMode: 'default', claude_code_version: '2.1.309', apiKeySource: 'none' });
let turn = 0, k = -1, buf = '', lturn = 0, stopLive = false;
const ask = () => {
  const s = ASKS[k]; const id = 'toolu_ask_' + k;
  out({ type: 'assistant', message: { id: 'msg_ask_' + k, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'tool_use', id, name: s.tool, input: s.input }], stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: SID, uuid: 'ask-a-' + k });
  out({ type: 'control_request', request_id: 'req-ask-' + k, request: { subtype: 'can_use_tool', tool_name: s.tool, input: s.input, tool_use_id: id, permission_suggestions: s.tool === 'Bash' ? [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: s.input.command.split(' ').slice(0, 2).join(' ') + ':*' }], behavior: 'allow', destination: 'localSettings' }] : [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }] } });
};
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1);
  if (!line.trim()) continue;
  fs.appendFileSync(${JSON.stringify(STDIN_LOG)}, line + '\\n');
  let m = null; try { m = JSON.parse(line); } catch {} if (!m) continue;
  if (m.type === 'user' && NTH) { // ⑪'s chat: turn 1 one line (a one-screen chat), turn 2 the busy stream, turn 3 ends it
    lturn++;
    if (lturn === 1) setTimeout(() => { out({ type: 'assistant', message: { id: 'msg_lv_hello', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'HELLO-LIVE ready.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: SID, uuid: 'lv-hello' }); result(0.01); }, 150);
    else if (lturn === 2) { let j = 0; const next = () => { if (stopLive) return; if (j < LIVE.length) { out({ ...LIVE[j], session_id: SID, uuid: 'lv-' + j }); j++; setTimeout(next, j < LIVE_FAST ? 30 : 250); } }; setTimeout(next, 150); }
    else { stopLive = true; setTimeout(() => { out({ type: 'assistant', message: { id: 'msg_lv_end', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'LIVE-END' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: SID, uuid: 'lv-end' }); result(0.02); }, 300); }
    continue;
  }
  if (m.type === 'user') {
    turn++;
    if (turn === 1) { let j = 0; const next = () => { if (j < PLAY1.length) { out({ ...PLAY1[j], session_id: SID, uuid: 'sc-' + j }); j++; setTimeout(next, 30); return; } result(0.47, { model_usage_since_last_result: { x: 1 } }); }; setTimeout(next, 150); }
    else if (turn <= 3) { const n = turn; setTimeout(() => { out({ type: 'assistant', message: { id: 'msg_turn' + n, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'Short answer ' + n + '.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: SID, uuid: 'turn-' + n }); result(0.47); }, 150); }
    else { k = 0; setTimeout(ask, 300); }
    continue;
  }
  if (m.type === 'control_response' && m.response && m.response.request_id === 'req-ask-' + k) {
    const allowed = m.response.response && m.response.response.behavior === 'allow';
    if (allowed && ASKS[k].tool === 'Write') fs.writeFileSync(ASKS[k].input.file_path, ASKS[k].input.content); // the file lands only when the write is allowed
    out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_ask_' + k, content: allowed ? 'ok' : 'denied', is_error: !allowed }] }, session_id: SID, uuid: 'ask-u-' + k });
    k++;
    if (k < ASKS.length) setTimeout(ask, 400);
    else { out({ type: 'assistant', message: { id: 'msg_ask_end', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'ASKS-DONE' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: SID, uuid: 'ask-end' }); result(0.52); }
  }
} });
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── throwaway server in a worktree (the tree's src/ + built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: path.join(stubDir, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} } // every process this suite caused carries one of these paths (dtach, the wrapper, the stub)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
armWatchdog({ capMs: 360e3, exit: () => { cleanup(); process.exit(1); }, pending: () => [...pend.keys()].map((id) => `CDP call #${id}`) }); // the shared clock names the leg it hung in
for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {} if (!target) await sleep(250); }
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pend = new Map(); const pageErrors = []; const fetchHooks = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
  if (m.method === 'Fetch.requestPaused') for (const h of fetchHooks) h(m.params);
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; const tm = setTimeout(() => { pend.delete(id); rej(new Error('cdp timeout: ' + method)); }, 20000);
  pend.set(id, (m) => { clearTimeout(tm); m.error ? rej(new Error(m.error.message)) : res(m.result); });
  sock.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch {} await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const VIEW = `([...(window.app.sessions?.values?.() || [])].find((v) => v && v._messageList && v.sessionId === window.__sid))`;
const LIST = `${VIEW}._messageList`;
const st = () => evalJs(`${LIST}.scrollTop`);
const wheelAt = async (x, y, dy) => { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy }); await sleep(500); };
const key = async (k, vk) => { await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: vk }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vk }); await sleep(400); };
const press = async (x, y) => { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(250); };
const rectOf = (sel) => evalJs(`(() => { const e = ${sel}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
// CHAT_SCROLL_PNG_DIR=<dir> keeps a PNG at ① (the turn + the bar) and ⑧ (the card + the waiting line) — the report's evidence
const png = async (name) => { const dir = process.env.CHAT_SCROLL_PNG_DIR; if (!dir) return; try { const shot = await cdp('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(shot.data, 'base64')); console.log('    PNG ' + path.join(dir, name + '.png')); } catch {} };
const stdinLines = () => { try { return fs.readFileSync(STDIN_LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
  await sleep(800);

  console.log('setup: a live stub claude 2.1.309 behind the real chat-wrapper');
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => ws.on('open', r));
  const frames = []; ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'cs1' }));
  let sid = null;
  for (let i = 0; i < 80 && !sid; i++) { const f = frames.find((m) => m?.type === 'created'); if (f) sid = f.sessionId; else await sleep(250); }
  check('a live claude chat session is created through the real spawn path', !!sid);
  await evalJs(`window.__sid = ${JSON.stringify(sid)}; app.attachSession(${JSON.stringify(sid)}, 'scroll', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  check('the live chat window attaches', await waitFor(`!!(${VIEW}) && !!document.querySelector('.chat-view .chat-input')`, 20000));
  await sleep(600);
  await evalJs(`(() => { const v = ${VIEW}; window.__fails = 0; const ot = v._trace?.bind(v); v._trace = (k, d) => { if (k === 'op:failed') window.__fails++; return ot ? ot(k, d) : undefined; }; app._openDiagnostics = () => { window.__diag = (window.__diag || 0) + 1; }; return true; })()`);
  const say = (text) => ws.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text }));

  // ── ① ──
  console.log('① the record kinds this CLI added are never drawn in the chat — one quiet chip, → ⚙ Diagnostics');
  say('Check the numbers please');
  const played = await waitFor(`/LAST-LINE-1/.test(${LIST}.textContent)`, 60000);
  check('the stub\'s long turn rendered live (its last line is on screen)', played);
  await sleep(1200);
  const c1 = await evalJs(`(() => { const l = ${LIST}; const chip = document.querySelector('.chat-view .chat-status-kinds'); const cs = chip ? getComputedStyle(chip) : null;
    const red = (() => { const p = document.createElement('span'); p.style.color = 'var(--red, #e55)'; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; })();
    return { fails: window.__fails, unknown: l.querySelectorAll('.chat-unknown-event, .chat-unknown-fields').length, words: /Unknown event|New fields on a known record/.test(l.innerText),
      chip: chip ? chip.textContent : null, title: chip ? chip.title : '', color: cs ? cs.color : null, red }; })()`);
  check('zero failed ops while the turn streamed (every live unknown record used to throw: the create op said `msg`)', c1.fails === 0, c1);
  check('no «Unknown event» / «New fields on a known record» card and none of their words in the chat', c1.unknown === 0 && !c1.words, c1);
  check('ONE chip in the status bar says «3 record kinds this version added — Diagnostics» (api-request-blob, api-request, the grown result)', c1.chip === '3 record kinds this version added — Diagnostics' && /api-request-blob/.test(c1.title) && /result: new fields/.test(c1.title), c1);
  check('…quiet: never the red of an error', !!c1.color && c1.color !== c1.red, c1);
  await png('1-turn-and-bar');
  await evalJs(`document.querySelector('.chat-view .chat-status-kinds')?.click(); true`);
  check('…and a press opens ⚙ Diagnostics', (await evalJs('window.__diag || 0')) === 1);

  // ── ② ──
  console.log('② the cost says what it is');
  const cost = () => evalJs(`(() => { const c = document.querySelector('.chat-view .chat-status-cost'); return c ? { text: c.textContent, title: c.title, color: c.getAttribute('style') } : null; })()`);
  await waitFor(`/subscription/.test(document.querySelector('.chat-view .chat-status-cost')?.textContent || '')`, 8000);
  const k1 = await cost();
  check('a subscription conversation: «This chat ≈ $0.47 · included in your subscription», quiet (the dim colour)', k1 && k1.text === 'This chat ≈ $0.47 · included in your subscription' && /--text-dim/.test(k1.color) && /nothing is billed per use/.test(k1.title), k1);
  await evalJs(`${VIEW}.setCostBasis?.({ source: 'api-key' }); true`);
  const k2 = await cost();
  check('an API key: «This chat ≈ $0.47 · billed per use (API key)» in a tier colour', k2 && k2.text === 'This chat ≈ $0.47 · billed per use (API key)' && /--green/.test(k2.color), k2);
  await evalJs(`${VIEW}.setCostBasis?.(null); true`);
  const k3 = await cost();
  check('nobody knows: «This chat ≈ $0.47» — the figure with its words, no claim', k3 && k3.text === 'This chat ≈ $0.47' && /depends on the account/.test(k3.title), k3);
  await evalJs(`${VIEW}.setCostBasis?.({ source: 'subscription' }); true`);

  // ── ③ ──
  console.log('③ a real wheel moves the chat');
  const g = await rectOf(LIST);
  const cx = Math.round(g.x + g.w / 2), cy = Math.round(g.y + g.h / 2);
  const w0 = await st(); await wheelAt(cx, cy, -500); const w1 = await st(); await wheelAt(cx, cy, 250); const w2 = await st();
  check('wheel up over the list moves it up, wheel down moves it down', w1 < w0 - 200 && w2 > w1 + 100, { w0, w1, w2 });

  // ── ④ ──
  console.log('④ a press on a message, then the page keys');
  await press(cx, cy);
  const foc = await evalJs(`document.activeElement === ${LIST}`);
  check('a press in the transcript focuses the LIST (it was its parent, .chat-view — the keys found no scroller)', foc);
  const p0 = await st(); await key('PageUp', 33); const p1 = await st(); await key('PageDown', 34); const p2 = await st();
  const ch = await evalJs(`${LIST}.clientHeight`);
  check('PageUp moves the chat up most of a screen, PageDown back down', p1 < p0 - ch * 0.5 && p2 > p1 + ch * 0.5, { p0, p1, p2, ch });

  // ── ⑤ ──
  console.log('⑤ the message box focused');
  await evalJs(`(() => { const ta = document.querySelector('.chat-view textarea.chat-input'); ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); return true; })()`);
  const b0 = await st(); await key('PageUp', 33); const b1 = await st(); await key('PageDown', 34); const b2 = await st();
  check('PageUp / PageDown in the message box page the conversation', b1 < b0 - ch * 0.5 && b2 > b1 + ch * 0.5, { b0, b1, b2 });
  await evalJs(`(() => { const ta = document.querySelector('.chat-view textarea.chat-input'); ta.value = Array.from({ length: 60 }, (_, i) => 'line ' + i).join('\\n'); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); return ta.scrollHeight > ta.clientHeight + 1; })()`);
  const d0 = await st(); await key('PageUp', 33); const d1 = await st();
  check('…a draft that outgrew its box keeps the keys (the chat stays)', d1 === d0, { d0, d1 });
  await evalJs(`(() => { const ta = document.querySelector('.chat-view textarea.chat-input'); ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

  // ── ⑥ ──
  console.log('⑥ three turns: a wheel over the minimap strip');
  say('Second question'); await waitFor(`/Short answer 2/.test(${LIST}.textContent)`, 20000);
  say('Third question'); await waitFor(`/Short answer 3/.test(${LIST}.textContent)`, 20000);
  const mm = await waitFor(`${LIST}.classList.contains('chat-minimap-active') && !!document.querySelector('.chat-view .chat-minimap:not(.hidden)')`, 10000);
  check('three user turns ⇒ the minimap replaces the native scrollbar', mm);
  const mr = (await rectOf(`document.querySelector('.chat-view .chat-minimap')`)) || { x: 0, y: 0, w: 0, h: 0 };
  const m0 = await st(); await wheelAt(Math.round(mr.x + mr.w / 2), Math.round(mr.y + mr.h / 2), -400); const m1 = await st();
  check('a real wheel over the minimap strip moves the chat (a pin: the compositor scrolls the list under the strip — measured on the base too)', m1 < m0 - 150, { m0, m1, mr });

  // ── ⑦ ──
  console.log('⑦ a dialog scrolls with the wheel and PageDown');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/changelog-diff*' }, { urlPattern: '*/api/version?fresh*' }] });
  fetchHooks.push((p) => {
    const body = /changelog-diff/.test(p.request.url)
      ? { current: '2.369.344', latest: '2.369.344', entries: Array.from({ length: 40 }, (_, i) => ({ version: '2.369.' + (344 - i), head: '2.369.' + (344 - i) + ' — 2026-10-23', body: '### Fixed\n- A line of what changed in this version, long enough to wrap once in the dialog. ' + i + '\n- Another line ' + i })) }
      : { version: '2.369.344', latest: '2.369.344' };
    cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') }).catch(() => {});
  });
  await evalJs(`app._showUpdateConfirmDialog(); true`);
  const dlgOk = await waitFor(`(() => { const b = document.querySelector('#update-confirm-dialog .ucl-list'); return !!b && b.scrollHeight > b.clientHeight + 50; })()`, 10000);
  check('the Update dialog opens with its changelog taller than its box (40 versions answered by CDP Fetch)', dlgOk);
  const db = await rectOf(`document.querySelector('#update-confirm-dialog .ucl-list')`);
  const dst = () => evalJs(`document.querySelector('#update-confirm-dialog .ucl-list').scrollTop`);
  const q0 = await dst(); await wheelAt(Math.round(db.x + db.w / 2), Math.round(db.y + db.h / 2), 300); const q1 = await dst();
  check('a real wheel over the dialog\'s list scrolls it', q1 > q0 + 100, { q0, q1 });
  await press(Math.round(db.x + 20), Math.round(db.y + 20));
  const q2 = await dst(); await key('PageDown', 34); const q3 = await dst();
  check('…and PageDown after a press in it', q3 > q2 + 100, { q2, q3 });
  await evalJs(`document.querySelector('#update-confirm-dialog')?.remove(); true`);
  await cdp('Fetch.disable');

  // ── ⑧ ⑨ ⑩ ──
  console.log('⑧ the permission card in words; the waiting line above the message box');
  say('Please write the summary');
  const card1 = await waitFor(`!!${LIST}.querySelector('.chat-permission-inline .chat-perm-allow')`, 20000);
  check('the first permission card arrives', card1);
  await sleep(500);
  const c8 = await evalJs(`(() => { const card = [...${LIST}.querySelectorAll('.chat-permission-inline')].pop(); if (!card) return {}; const fold = card.querySelector('details.chat-permission-cmd-fold');
    return { summary: card.querySelector('.chat-permission-summary')?.textContent, folded: !!fold && !fold.open, cmd: fold?.querySelector('pre.chat-permission-cmd')?.textContent, label: card.querySelector('.chat-permission-label')?.textContent, folder: !!card.querySelector('.chat-perm-folder') }; })()`);
  check('the card says «install python-docx · read 3 files» above the command', c8.summary === 'install python-docx · read 3 files', c8);
  check('…the command folded under «Show the command», whole', c8.folded && c8.cmd === 'pip install python-docx && cat a.pdf b.pdf c.pdf', c8);
  check('…and the first prompt offers no folder-wide answer', !c8.folder, c8);
  const line = await waitFor(`/Waiting for you to allow: install python-docx · read 3 files/.test(document.querySelector('.chat-view .chat-stream-status .chat-stream-label')?.textContent || '')`, 8000);
  check('the line above the message box says «Waiting for you to allow: install python-docx · read 3 files»', line, await evalJs(`document.querySelector('.chat-view .chat-stream-status')?.innerText`));
  await evalJs(`(() => { const c = [...${LIST}.querySelectorAll('.chat-permission-inline')].pop(); if (c) c.scrollIntoView({ block: 'center' }); return true; })()`); await sleep(300);
  await png('8-card-and-waiting-line');
  await evalJs(`${LIST}.scrollTop = 0; true`); await sleep(400);
  const hiddenBefore = await evalJs(`(() => { const l = ${LIST}.getBoundingClientRect(); const c = [...${LIST}.querySelectorAll('.chat-permission-inline')].pop()?.getBoundingClientRect(); return !c || c.bottom < l.top || c.top > l.bottom; })()`);
  await evalJs(`document.querySelector('.chat-view .chat-stream-status .chat-stream-label')?.click(); true`);
  const shown = await waitFor(`(() => { const l = ${LIST}.getBoundingClientRect(); const c = [...${LIST}.querySelectorAll('.chat-permission-inline')].pop()?.getBoundingClientRect(); return !!c && c.bottom > l.top && c.top < l.bottom; })()`, 6000);
  check('…a press on that line brings the waiting card into view (it was out of view)', hiddenBefore && shown, { hiddenBefore, shown });
  await evalJs(`[...${LIST}.querySelectorAll('.chat-permission-inline .chat-perm-allow')].pop()?.click(); true`);

  console.log('⑨ the Write’s document opens before its file exists — it waits, then opens');
  const card2 = await waitFor(`(() => { const c = [...${LIST}.querySelectorAll('.chat-permission-inline')].pop(); return !!c && /write Summary\\.md/.test(c.textContent) && !!c.querySelector('.chat-perm-allow'); })()`, 20000);
  check('the second card (the Write) says «write Summary.md»', card2);
  if (!(await waitFor(`!!document.querySelector('.doc-page')`, 4000))) await evalJs(`app.openFile(${JSON.stringify(SUMMARY)}); true`); // the auto-open is the agent's write record; the same door a card press takes
  const waiting = await waitFor(`/Waiting for the file/.test(document.querySelector('.doc-page')?.textContent || '')`, 8000);
  check('the document opened before its file exists says «Waiting for the file…» (not «Could not read this document: ENOENT»)', waiting, await evalJs(`document.querySelector('.doc-page')?.textContent?.slice(0, 200) || null`));
  await evalJs(`[...${LIST}.querySelectorAll('.chat-permission-inline .chat-perm-allow')].pop()?.click(); true`);
  const landed = await waitFor(`/THE-SUMMARY-LANDED/.test(document.querySelector('.doc-page')?.textContent || '')`, 10000);
  check('…the write is allowed, the file lands, and the same window opens it by itself', landed, await evalJs(`document.querySelector('.doc-page')?.textContent?.slice(0, 200) || null`));

  console.log('⑩ the third prompt offers «Let it work in work/ without asking»');
  const card3 = await waitFor(`(() => { const c = [...${LIST}.querySelectorAll('.chat-permission-inline')].pop(); return !!c && /repeat a step for each item/.test(c.textContent) && !!c.querySelector('.chat-perm-allow'); })()`, 20000);
  check('the third card arrives in words («repeat a step for each item»)', card3);
  const f3 = await evalJs(`(() => { const c = [...${LIST}.querySelectorAll('.chat-permission-inline')].pop(); if (!c) return {}; const b = c.querySelector('.chat-perm-folder'); return { btn: b ? b.textContent : null, title: b ? b.title : '', what: c.querySelector('.chat-permission-folder-what')?.textContent || '' }; })()`);
  check('…with «Let it work in work/ without asking», what it sends in its title and its sentence under it', f3.btn === 'Let it work in work/ without asking' && /Always allow Bash, Edit, Write, MultiEdit, NotebookEdit/.test(f3.title) && /without a card each time/.test(f3.what), f3);
  await evalJs(`[...${LIST}.querySelectorAll('.chat-permission-inline')].pop()?.querySelector('.chat-perm-folder')?.click(); true`);
  const done = await waitFor(`/ASKS-DONE/.test(${LIST}.textContent)`, 15000);
  const resp = stdinLines().filter((m) => m.type === 'control_response' && m.response?.request_id === 'req-ask-2').pop();
  const up = resp?.response?.response?.updatedPermissions;
  check('a press answers the request with the folder’s allow rules on the CLI’s stdin (Bash, Edit, Write, MultiEdit, NotebookEdit → localSettings)', done && resp?.response?.response?.behavior === 'allow' && Array.isArray(up) && up.length === 1 && up[0].type === 'addRules' && up[0].behavior === 'allow' && up[0].destination === 'localSettings' && JSON.stringify(up[0].rules) === JSON.stringify(['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'].map((toolName) => ({ toolName }))), resp);
  const resp0 = stdinLines().filter((m) => m.type === 'control_response' && m.response?.request_id === 'req-ask-0').pop();
  check('…while a plain Allow sent none (the first card)', resp0?.response?.response?.behavior === 'allow' && !resp0.response.response.updatedPermissions, resp0);

  // ── ⑪ ── (lane chat-live-tail-pin, inc-mvl02dkn-gop0 — the owner: «为啥没办法把这个对话pin to bottom»)
  console.log('⑪ a chat THIS window created (its creator never attaches): the live tail is the window; the pin is an intent');
  await evalJs(`app.createSession({ cwd: ${JSON.stringify(CWD)}, name: 'live tail', mode: 'chat', backend: 'claude' }); true`);
  let sid2 = null;
  for (let i = 0; i < 80 && !sid2; i++) { sid2 = await evalJs(`([...app.sessions.values()].find((v) => v && v._messageList && v.sessionId !== window.__sid)?.sessionId) || null`); if (!sid2) await sleep(250); }
  check('a second chat is created by the page\'s own createSession (the creator road — no attach, no history load)', !!sid2);
  const V2 = `([...app.sessions.values()].find((v) => v && v.sessionId === ${JSON.stringify(sid2)}))`;
  const L2 = `${V2}._messageList`;
  await waitFor(`!!${V2} && !!${V2}._container.querySelector('.chat-input')`, 20000);
  // the new window on top, alone: close the first chat's window (its session ends with it — every earlier leg is done)
  await evalJs(`(() => { const w = [...(app.wm?.windows?.values?.() || [])].find((x) => x && app.sessions.get(x.id)?.sessionId === window.__sid); if (w) app.wm.closeWindow(w.id); return true; })()`);
  await sleep(800);
  const say2 = (text) => ws.send(JSON.stringify({ type: 'chat-input', sessionId: sid2, text }));
  const geo2 = () => evalJs(`(() => { const v = ${V2}, l = v._messageList; return { st: Math.round(l.scrollTop), sh: l.scrollHeight, ch: l.clientHeight, ws: v._windowStart, we: v._windowEnd, total: v._total, n: v._messages.length, pin: v._pinned, btn: !v._scrollBtn.classList.contains('hidden') }; })()`);
  const seq2 = () => evalJs(`${V2}._traceSeq || 0`);
  const ring2 = (since) => evalJs(`(${V2}._traceRing || []).filter((e) => e.seq > ${Number(since) || 0}).map((e) => ({ ...e }))`);
  const at2 = async () => { const r = await rectOf(L2); return { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) }; };
  const onList = (x, y) => evalJs(`${L2}.contains(document.elementFromPoint(${x}, ${y}))`);
  say2('Hello there');
  check('the first answer renders live in the created chat', await waitFor(`/HELLO-LIVE/.test(${L2}.textContent)`, 20000));
  await sleep(900);
  const g1 = await geo2();
  check(`its window is DEFINED with no history load: 0 … the live count (ws ${g1.ws} · we ${g1.we} · total ${g1.total} · rendered ${g1.n}) — the bundle's geom was ws/we/total null`,
    Number.isFinite(g1.ws) && Number.isFinite(g1.we) && Number.isFinite(g1.total) && g1.ws === 0 && g1.we === g1.total && g1.total === g1.n && g1.n >= 2, g1);
  check('one screen (scrollHeight ≈ clientHeight), pinned, and ↓ hidden — there is nothing to scroll to', g1.sh <= g1.ch + 1 && g1.pin === true && g1.btn === false, g1);
  const c11 = await at2();
  check('…the created window is on top where the wheel lands', await onList(c11.x, c11.y), c11);
  let m11 = await seq2();
  for (let i = 0; i < 6; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c11.x, y: c11.y }); await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: c11.x, y: c11.y, deltaX: 0, deltaY: -100 }); await sleep(120); }
  await sleep(500);
  let r11 = await ring2(m11); const g2 = await geo2();
  const said = await evalJs(`(${V2}._container.querySelector('.chat-history-status')?.textContent) || ''`);
  check('six real wheel-ups at the top of a chat with nothing earlier: the pin STAYS (the capture: wheelTop carry 100 … 818, then pin 0)', g2.pin === true && !r11.some((e) => e.tag === 'unpin'), r11.filter((e) => /pin|wheel|page/.test(e.tag)));
  check('…no page up fires and no notch is carried (the capture: 34 pageUp in 0.4 s into history that does not exist)', !r11.some((e) => e.tag === 'pageUp' || e.tag === 'wheelTop') && !r11.some((e) => e.tag === 'wheelCarry'), r11.map((e) => e.tag));
  check(`…and the chat says «No earlier messages» ONCE (${r11.filter((e) => e.tag === 'noEarlier').length} for six notches; on screen: «${said}»)`, r11.filter((e) => e.tag === 'noEarlier').length === 1 && said === 'No earlier messages', r11.map((e) => e.tag));

  console.log('⑪ the busy live turn: ~240 records a minute, runs of tool cards, results landing as live edits');
  say2('Now get busy');
  check('the fast prologue lands and the slow stream begins (TICK-15)', await waitFor(`/TICK-15:/.test(${L2}.textContent)`, 30000));
  await sleep(1500);
  m11 = await seq2();
  const samples = [];
  for (let i = 0; i < 8; i++) { await sleep(500); samples.push(await geo2()); }
  r11 = await ring2(m11);
  check(`it streams on while pinned: the pin holds through ${samples.length} samples, each at the bottom, the window defined (we = total)`,
    samples.every((g) => g.pin === true && g.sh - g.st - g.ch < 60 && Number.isFinite(g.total) && g.we === g.total) && samples[samples.length - 1].total > samples[0].total && !r11.some((e) => e.tag === 'unpin'), samples);
  check('…the stream\'s tool cards fold under run headers', await evalJs(`${L2}.querySelectorAll('.chat-run-header').length`) > 0);
  // a run header press — open, then close — never unpins
  m11 = await seq2();
  let hdr = await evalJs(`(() => { const l = ${L2}, lr = l.getBoundingClientRect(); const hs = [...l.querySelectorAll('.chat-run-header')].filter((h) => { const r = h.getBoundingClientRect(); return r.height > 0 && r.top > lr.top + 4 && r.bottom < lr.bottom - 4; }); const h = hs[hs.length - 1]; if (!h) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.x + Math.min(40, r.width / 2)), y: Math.round(r.y + r.height / 2) }; })()`);
  check('a run header is in view to press', !!hdr, hdr);
  if (hdr) { await press(hdr.x, hdr.y); await sleep(700); }
  const gOpen = await geo2();
  hdr = await evalJs(`(() => { const l = ${L2}, lr = l.getBoundingClientRect(); const hs = [...l.querySelectorAll('.chat-run-header')].filter((h) => { const r = h.getBoundingClientRect(); return r.height > 0 && r.top > lr.top + 4 && r.bottom < lr.bottom - 4; }); const h = hs[hs.length - 1]; if (!h) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.x + Math.min(40, r.width / 2)), y: Math.round(r.y + r.height / 2) }; })()`);
  if (hdr) { await press(hdr.x, hdr.y); await sleep(700); }
  const gClose = await geo2(); r11 = await ring2(m11);
  check('a run header pressed open and closed while it streams never unpins (the owner opened one at 13:21:59)', gOpen.pin === true && gClose.pin === true && !r11.some((e) => e.tag === 'unpin'), { gOpen, gClose, tags: r11.filter((e) => /pin|run/i.test(e.tag)) });

  console.log('⑪ a real wheel up unpins; scrolling back to the end re-pins; ↓ pins at the live tail');
  const c12 = await at2();
  m11 = await seq2();
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c12.x, y: c12.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: c12.x, y: c12.y, deltaX: 0, deltaY: -700 }); await sleep(600);
  const gUp = await geo2(); r11 = await ring2(m11);
  const unp = r11.find((e) => e.tag === 'unpin');
  check(`a real wheel up unpins — traced \`unpin\` {why: ${unp?.why}} — and ↓ shows`, gUp.pin === false && unp?.why === 'scrolledAway' && gUp.btn === true, { gUp, unp });
  m11 = await seq2();
  for (let i = 0; i < 10; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: c12.x, y: c12.y, deltaX: 0, deltaY: 400 }); await sleep(250); if ((await geo2()).pin) break; }
  await sleep(400);
  const gBack = await geo2(); r11 = await ring2(m11);
  const rep = r11.find((e) => e.tag === 'pin');
  check(`wheeling back to the end RE-PINS (traced \`pin\` {why: ${rep?.why}}) and ↓ hides — NaN bounds made the live tail unreachable: no scroll ever re-pinned`, gBack.pin === true && rep?.why === 'tail' && gBack.btn === false, { gBack, tags: r11.filter((e) => /pin/.test(e.tag)) });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: c12.x, y: c12.y, deltaX: 0, deltaY: -900 }); await sleep(700);
  const btn2 = await evalJs(`(() => { const b = ${V2}._scrollBtn; if (b.classList.contains('hidden')) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width }; })()`);
  check('wheeled up again: ↓ is on screen to press', !!btn2 && btn2.w > 0, btn2);
  m11 = await seq2();
  if (btn2) await press(btn2.x, btn2.y);
  await sleep(1800);
  const gBtn = await geo2(); r11 = await ring2(m11);
  const newest = await evalJs(`(() => { const v = ${V2}; const els = [...v._messageList.querySelectorAll(':scope > .chat-msg')]; const last = els[els.length - 1]; const ticks = [...v._messageList.textContent.matchAll(/TICK-(\\d+)/g)].map((m) => +m[1]); const u = [...new Set(ticks)].sort((a, b) => a - b); return { lastId: last?.dataset.msgId || null, newestId: v._messages[v._messages.length - 1]?.id || null, maxTick: u.length ? u[u.length - 1] : -1, holes: u.filter((x, i) => i && x !== u[i - 1] + 1).length, first: u[0] }; })()`);
  check(`↓ PINS and hides until a real scroll: pinned, at the bottom, ↓ hidden (pin {why: ${r11.find((e) => e.tag === 'pin')?.why}})`, gBtn.pin === true && gBtn.btn === false && gBtn.sh - gBtn.st - gBtn.ch < 60 && r11.some((e) => e.tag === 'pin' && e.why === 'scrollBtn'), gBtn);
  check(`…at the LIVE tail, not the conversation's start: the newest record is the last card (TICK-${newest.maxTick}) and the window runs to it unbroken (${newest.holes} holes from TICK-${newest.first}) — the base fetched offset NaN, which the server read as 0, and «pinned» the first fifty messages`, !!newest.lastId && newest.lastId === newest.newestId && newest.maxTick >= 15 && newest.holes === 0, newest);
  // (the base landed the FIRST slab and the stream appended below it: TICK-0 … TICK-11, a hole, then the live ticks)
  check('…without rebuilding a window that already ended at the tail (no tail refetch: no gapReset)', !r11.some((e) => e.tag === 'gapReset' || e.tag === 'tailRefetch'), r11.map((e) => e.tag));
  m11 = await seq2(); await sleep(2500);
  const gAfter = await geo2(); r11 = await ring2(m11);
  check('…and it keeps following the stream (live edits never unpin)', gAfter.pin === true && gAfter.sh - gAfter.st - gAfter.ch < 60 && gAfter.total > gBtn.total && !r11.some((e) => e.tag === 'unpin'), { gBtn, gAfter });

  console.log('⑪ the server: a new conversation is born with its history loaded');
  const ids2 = await evalJs(`${V2}._getSessionIds()`);
  const pageQ = new URLSearchParams({ backend: 'claude', backendSessionId: ids2.backendSessionId || '', cwd: CWD, offset: '0', limit: '3' });
  const pg = await (await fetch(`http://127.0.0.1:${PORT}/api/session-messages?${pageQ}`)).json();
  const gNow = await geo2();
  check(`a history page of the created chat is served by its LIVE normalizer (ids ${JSON.stringify((pg.messages || []).map((m) => String(m.id).split(':')[0]))}, total ${pg.total} vs the view's ${gNow.total}) — the base re-converted the transcript under other ids every page`,
    Array.isArray(pg.messages) && pg.messages.length === 3 && pg.messages.every((m) => String(m.id).startsWith(sid2 + ':')) && Math.abs(pg.total - gNow.total) <= 8, { ids: (pg.messages || []).map((m) => m.id), total: pg.total, view: gNow.total });
  say2('stop');
  check('the turn ends (LIVE-END) and the view is still pinned at the bottom', await waitFor(`/LIVE-END/.test(${L2}.textContent)`, 15000) && (await sleep(800), (await geo2()).pin === true));

  check('no page exception in the whole run', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++;
  console.error('✗ the suite threw: ' + (e && e.stack || e));
}
console.log(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
process.exit(failed ? 1 : 0);
