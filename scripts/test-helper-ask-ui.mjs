#!/usr/bin/env node
// LANE S1 ON A REAL PAGE — a helper's permission request is answerable where the
// user is looking (B-6e95; both naive-user studies' T9). A worktree server, a stub
// `claude` behind the REAL chat-wrapper that speaks the records MEASURED on 2.1.281
// (scripts/fixtures/helper-ask-2.1.281 — the helper's tool_use on the parent stream
// tagged parent_tool_use_id, then `requires_action`, then a can_use_tool
// control_request carrying `agent_id` + the HELPER's tool_use_id and no
// parent_tool_use_id; a stop withdraws it with control_cancel_request), and
// headless chrome over raw CDP. No vendor call: the stub answers every turn itself.
//
//   C1 two background helpers ask (WebFetch, Bash): each ask is a permission card
//      INSIDE its own helper's Agent card in the parent chat, naming the helper and
//      what it wants (the url / the command)
//   C2 the "waiting for you" chip names the helper(s) and a real click lands on the
//      oldest ask (scrolled into view, flashed)
//   C3 the WebFetch helper's View Log (opened live) shows the SAME ask on its
//      WebFetch card; a real click on Allow THERE answers the PARENT's stdin with the
//      helper's request id (the stub resumes the helper) and settles the parent's card
//   C4 RESTART: the server is killed and restarted (the stub lives on in dtach) and
//      the page reloaded (only what the restarted server rebuilt is judged); the
//      Bash helper's ask is still a live card with its buttons
//   C5 Always Allow on the PARENT's card answers it (updatedPermissions = the CLI's
//      own suggestion), the chip goes
//   C6 STOP: a foreground and a background helper both asking; the stop withdraws
//      both asks ("No longer waiting — the helper was stopped"), the background
//      helper's chip reads "stopped", the foreground helper's card says "Stopped
//      before it finished" (never the CLI's canned rejection string)
//   C7 CONTROL: the same page on the PRE-LANE normalizer (the helper branch removed
//      in the scratch worktree) — the chip still says "waiting for you" and there is
//      NO card to click anywhere (the studies' state); the leg can go red
// Requires google-chrome + dtach (SKIP without). Run: node scripts/test-helper-ask-ui.mjs
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
const wt = scratch('helper-ask-ui-wt');
const fakeHome = scratchHome('helper-ask-ui-home', fs);
const stubDir = scratch('helper-ask-ui-stub');
fs.rmSync(stubDir, { recursive: true, force: true });
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the stub CLI: the measured record shapes, scripted per user message ─────────
const STDIN_LOG = path.join(stubDir, 'stdin.ndjson');
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
const asst = (content, ptu = null, extra = {}) => out({ type: 'assistant', message: { id: 'msg_' + U(), type: 'message', role: 'assistant', model: 'claude-sonnet-5', content, stop_reason: null, usage }, parent_tool_use_id: ptu, uuid: U(), ...extra });
const user = (content, ptu = null) => out({ type: 'user', message: { role: 'user', content }, parent_tool_use_id: ptu, uuid: U() });
const ackText = (id) => [{ type: 'text', text: 'Async agent launched successfully. (This tool result is internal metadata — never quote or paste any part of it, including the agentId below, into a user-facing reply.)\\nagentId: ' + id + ' (internal ID - do not mention to user.)\\nThe agent is working in the background. You will be notified automatically when it completes.' }];
const REJECT = "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.";
const helpers = {
  A: { call: 'toolu_ui_A', agent: 'a51a0000000000aa', desc: 'Fetch title of example.com', tool: 'WebFetch', toolId: 'toolu_ui_WA', input: { url: 'https://example.com', prompt: 'What is the page title?' }, req: 'req-ui-A', suggest: [{ type: 'addRules', destination: 'localSettings', rules: [{ toolName: 'WebFetch', ruleContent: 'domain:example.com' }], behavior: 'allow' }], bg: true },
  B: { call: 'toolu_ui_B', agent: 'a51a0000000000bb', desc: 'Fetch title of example.org', tool: 'Bash', toolId: 'toolu_ui_WB', input: { command: 'curl -s https://example.org | grep -o "<title>.*</title>"', description: 'Fetch example.org and extract title tag' }, req: 'req-ui-B', suggest: [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'curl -s https://example.org' }], behavior: 'allow', destination: 'localSettings' }], bg: true },
  C: { call: 'toolu_ui_C', agent: 'a51a0000000000cc', desc: 'Read the README (foreground)', tool: 'Bash', toolId: 'toolu_ui_WC', input: { command: 'cat README.md', description: 'Read the readme' }, req: 'req-ui-C', suggest: [], bg: false },
  D: { call: 'toolu_ui_D', agent: 'a51a0000000000dd', desc: 'List the files (background)', tool: 'Bash', toolId: 'toolu_ui_WD', input: { command: 'ls -la /tmp', description: 'List files' }, req: 'req-ui-D', suggest: [], bg: true },
};
const launch = (h) => {
  asst([{ type: 'tool_use', id: h.call, name: 'Agent', input: { description: h.desc, subagent_type: 'general-purpose', prompt: 'do it', ...(h.bg ? { run_in_background: true } : {}) } }]);
  out({ type: 'system', subtype: 'task_started', task_id: h.agent, tool_use_id: h.call, description: h.desc, subagent_type: 'general-purpose', is_backgrounded: h.bg, spawn_depth: 1, task_type: 'local_agent', prompt: 'do it', uuid: U() });
  if (h.bg) user([{ tool_use_id: h.call, type: 'tool_result', content: ackText(h.agent) }]);
};
const ask = (h) => {
  asst([{ type: 'tool_use', id: h.toolId, name: h.tool, input: h.input }], h.call, { subagent_type: 'general-purpose', task_description: h.desc });
  out({ type: 'system', subtype: 'task_progress', task_id: h.agent, tool_use_id: h.call, description: 'Running ' + h.desc, usage: { total_tokens: 100, tool_uses: 1, duration_ms: 10 }, last_tool_name: h.tool, uuid: U() });
  state('requires_action');
  out({ type: 'control_request', request_id: h.req, request: { subtype: 'can_use_tool', tool_name: h.tool, display_name: h.tool, input: h.input, description: h.input.description || h.input.url, permission_suggestions: h.suggest, tool_use_id: h.toolId, agent_id: h.agent } });
};
const finish = (h, status) => {
  if (h.bg) { out({ type: 'system', subtype: 'task_updated', task_id: h.agent, patch: { status: status === 'stopped' ? 'killed' : 'completed', end_time: Date.now() }, uuid: U() }); out({ type: 'system', subtype: 'task_notification', task_id: h.agent, tool_use_id: h.call, status, summary: h.desc, uuid: U() }); }
};
const turnEnd = (text) => { asst([{ type: 'text', text }]); out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 5, num_turns: 1, result: text, total_cost_usd: 0, usage, uuid: U() }); };
out({ type: 'system', subtype: 'init', model: 'claude-sonnet-5', cwd: process.cwd(), tools: ['Agent', 'Bash', 'WebFetch'], permissionMode: 'default', claude_code_version: '2.1.281', uuid: U() });
let userN = 0, buf = '';
const pending = new Set();
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    fs.appendFileSync(${JSON.stringify(STDIN_LOG)}, line + '\\n');
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m) continue;
    if (m.type === 'user' && /ping-([0-9]+)/.test(JSON.stringify(m.message))) { const k = JSON.stringify(m.message).match(/ping-([0-9]+)/)[1]; turnEnd('pong-' + k); continue; } // the suite's bridge-liveness probe (never counted as a turn of the scenario)
    if (m.type === 'user') {
      userN++;
      state('running');
      if (userN === 1) {
        launch(helpers.A); launch(helpers.B);
        out({ type: 'system', subtype: 'background_tasks_changed', tasks: [helpers.A, helpers.B].map((h) => ({ task_id: h.agent, task_type: 'local_agent', description: h.desc })), uuid: U() });
        turnEnd('Both helpers are running in the background.');
        setTimeout(() => { ask(helpers.B); pending.add('B'); }, 300);
        setTimeout(() => { ask(helpers.A); pending.add('A'); }, 700);
      } else if (userN === 2) {
        launch(helpers.D);
        out({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: helpers.D.agent, task_type: 'local_agent', description: helpers.D.desc }], uuid: U() });
        setTimeout(() => { ask(helpers.D); pending.add('D'); }, 200);
        setTimeout(() => { launch(helpers.C); ask(helpers.C); pending.add('C'); }, 500); // a FOREGROUND helper: the turn stays open on its Agent call
      } else if (/stop/i.test(JSON.stringify(m.message))) {
        for (const k of ['C', 'D']) if (pending.has(k)) { pending.delete(k); out({ type: 'control_cancel_request', request_id: helpers[k].req }); }
        out({ type: 'system', subtype: 'background_tasks_changed', tasks: [], uuid: U() });
        finish(helpers.D, 'stopped');
        user([{ type: 'tool_result', tool_use_id: helpers.C.toolId, content: REJECT, is_error: true }], helpers.C.call);
        user([{ type: 'tool_result', tool_use_id: helpers.C.call, content: REJECT, is_error: true }]);
        user([{ type: 'text', text: '[Request interrupted by user for tool use]' }]);
        turnEnd('Both helpers were stopped.');
        state('idle');
      }
      continue;
    }
    if (m.type === 'control_response' && m.response) {
      const k = Object.keys(helpers).find((x) => helpers[x].req === m.response.request_id);
      if (!k || !pending.has(k)) continue;
      pending.delete(k);
      const h = helpers[k];
      const allowed = m.response.response && m.response.response.behavior === 'allow';
      user([{ type: 'tool_result', tool_use_id: h.toolId, content: allowed ? 'Example Domain' : REJECT, is_error: !allowed }], h.call);
      asst([{ type: 'text', text: 'Title: Example Domain' }], h.call, { subagent_type: 'general-purpose', task_description: h.desc });
      finish(h, 'completed');
      if (!pending.size) state('idle'); else state('requires_action');
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
  for (const pat of [wt, fakeHome, stubDir]) { try { execSync(`pkill -9 -f ${JSON.stringify(pat)}`, { stdio: 'ignore' }); } catch {} }
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

// page-side helpers: the PARENT chat's list, a helper's ask row in it, a card
const VIEW = (sid) => `[...app.sessions.values()].find((v) => v && v.sessionId === ${JSON.stringify(sid)})`;
const LIST = (sid) => `(${VIEW(sid)})?._messageList`;
const ROW = (sid, rid) => `(${LIST(sid)})?.querySelector('.chat-helper-ask[data-request-id="${rid}"]')`;
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

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(500);
  await openWs();

  // ═══ C1 the asks are cards in the parent chat ═══════════════════════════
  console.log('C1 two background helpers ask — each a card inside its own Agent card');
  const sid = await create('s1-helpers');
  check('a chat session is created (the stub behind the real chat-wrapper)', !!sid);
  check('the chat window attaches', await attach(sid, 'T9 helpers'));
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'Please use two helper agents in parallel to read example.com and example.org' }));
  check('THE FINDING: the Bash helper\'s ask is a card in the parent chat', await waitFor(`!!(${ROW(sid, 'req-ui-B')})?.querySelector('.chat-perm-allow')`, 20000));
  const tAskB = Date.now(); // verify r3: the Bash ask's first-seen instant — the For-you clock across C4's restart is judged against it
  check('THE FINDING: the WebFetch helper\'s ask too', await waitFor(`!!(${ROW(sid, 'req-ui-A')})?.querySelector('.chat-perm-allow')`, 10000));
  const c1 = await evalJs(`(() => { const a = ${ROW(sid, 'req-ui-A')}, b = ${ROW(sid, 'req-ui-B')}; return { aIn: !!a && a.closest('[data-tool-id]')?.dataset.toolId, bIn: !!b && b.closest('[data-tool-id]')?.dataset.toolId, aHead: a?.querySelector('.chat-helper-ask-head')?.textContent || '', aWhat: a?.querySelector('.chat-helper-ask-what')?.textContent || '', bWhat: b?.querySelector('.chat-helper-ask-what')?.textContent || '', always: a?.querySelector('.chat-perm-always')?.title || '' }; })()`);
  check('each ask sits inside ITS OWN helper\'s Agent card', c1.aIn === 'toolu_ui_A' && c1.bIn === 'toolu_ui_B', c1);
  check('the card names the helper and what it wants (the url / the command)', /Helper “Fetch title of example\.com” needs your approval/.test(c1.aHead) && /WebFetch\s+https:\/\/example\.com/.test(c1.aWhat) && /Bash\s+curl -s https:\/\/example\.org/.test(c1.bWhat), c1);
  check('its Always Allow carries the CLI\'s own suggestion (domain:example.com)', /WebFetch\(domain:example\.com\)/.test(c1.always), c1.always);

  // ═══ C2 the chip names who waits and goes there ═════════════════════════
  console.log('C2 the "waiting for you" chip');
  check('the chip is up (the harness said requires_action)', await waitFor(`!!(${CHIP(sid)})`, 8000));
  const chipTitle = await evalJs(`(${CHIP(sid)})?.title || ''`);
  check('THE FINDING: the chip NAMES who waits ("2 approvals are waiting (Helper “…”, Helper “…”)")', /^2 approvals are waiting \(Helper “Fetch title of example\.org”, Helper “Fetch title of example\.com”\)/.test(chipTitle), chipTitle);
  await evalJs(`(() => { const l = ${LIST(sid)}; l.scrollTop = 0; return true; })()`); // move away so the jump has somewhere to go
  check('a real click on the chip', await realClickEl(CHIP(sid)));
  const landed = await waitFor(`(() => { const r = ${ROW(sid, 'req-ui-B')}; const l = ${LIST(sid)}; if (!r || !l) return false; const a = r.getBoundingClientRect(), b = l.getBoundingClientRect(); return r.classList.contains('chat-ask-flash') && a.top >= b.top - 2 && a.bottom <= b.bottom + 2; })()`, 4000);
  check('THE FINDING: it lands on the OLDEST ask (Bash) — in view and flashed', landed);
  await sleep(1200); // the landing re-centres at 180/400/750 ms (_scrollElStable) — a click aimed before it settles hits whatever moved under it

  // ═══ C3 the helper's View Log carries the same ask and answers it ═════════
  console.log('C3 the WebFetch helper\'s View Log');
  check('its View Log button is there', await realClickEl(`(${CARD(sid, 'toolu_ui_A')})?.querySelector('.chat-agent-view-btn')`));
  const VIEWER = `(() => { const v = (${VIEW(sid)}); const wid = v?._subagentViewers?.get('sub-toolu_ui_A'); return wid ? app.wm.windows.get(wid)?.element : null; })()`;
  check('THE FINDING: the View Log opens LIVE (sub-<tool_use_id>) while the helper runs', await waitFor(`!!${VIEWER}`, 8000),
    await evalJs(`(() => { const v = (${VIEW(sid)}); return { viewers: v?._subagentViewers ? [...v._subagentViewers.keys()] : null, wins: [...app.wm.windows.values()].map((w) => w.title || w.element?.querySelector('.window-title')?.textContent || '?'), btn: (() => { const b = (${CARD(sid, 'toolu_ui_A')})?.querySelector('.chat-agent-view-btn'); return b ? { ...b.dataset } : null; })(), ti: v?._messages?.find((m) => m.toolCallId === 'toolu_ui_A')?.taskInfo || null }; })()`));
  check('THE FINDING: the helper\'s WebFetch card in its View Log has the Allow button', await waitFor(`!!${VIEWER}?.querySelector('[data-tool-id="toolu_ui_WA"] .chat-perm-allow')`, 10000));
  check('a real click on Allow IN THE VIEW LOG', await realClickEl(`${VIEWER}?.querySelector('[data-tool-id="toolu_ui_WA"] .chat-perm-allow')`));
  const gotA = await waitResponses('req-ui-A');
  check('THE FINDING: the PARENT\'s stdin gets ONE control_response for the helper\'s request id, behavior allow', gotA.length === 1 && gotA[0].response?.subtype === 'success' && gotA[0].response?.response?.behavior === 'allow' && gotA[0].response?.response?.updatedInput?.url === 'https://example.com', gotA);
  check('the stub resumed the helper (its tool_result reached the View Log)', await waitFor(`/Example Domain/.test(${VIEWER}?.textContent || '')`, 8000));
  check('the parent\'s card for that ask settles ("Allowed", no buttons)', await waitFor(`(() => { const r = ${ROW(sid, 'req-ui-A')}; return !!r && !r.querySelector('.chat-perm-btn') && /Allowed/.test(r.textContent); })()`, 8000));
  const chip2 = await evalJs(`(${CHIP(sid)})?.title || ''`);
  check('the chip now names only the Bash helper', /^Helper “Fetch title of example\.org” needs your approval to use Bash/.test(chip2), chip2);
  await evalJs(`(() => { const v = (${VIEW(sid)}); const wid = v?._subagentViewers?.get('sub-toolu_ui_A'); if (wid) app.wm.closeWindow?.(wid); return true; })()`);

  // ═══ C4 restart ═════════════════════════════════════════════════════════
  console.log('C4 a server restart keeps the pending ask');
  await sleep(1800); // the task records' session-meta write is debounced 1.5 s
  const epochBefore = await evalJs(`(${VIEW(sid)})?._normEpoch || 0`);
  await sleep(Math.max(0, tAskB + 20000 - Date.now())); // verify r3: the restart ≥ 20 s after the ask, so ask+60 (the persisted clock) and restart+60 (a restarted one) DISAGREE at ask+65
  const tRestart = Date.now();
  try { srv.kill('SIGKILL'); } catch {}
  await sleep(600);
  startServer();
  check('the server comes back', await waitServer());
  try { liveWs.close(); } catch {}
  await openWs(); // the old socket died with the server
  // A FRESH PAGE on the restarted server: the old page keeps its pre-restart DOM until its ws reconnects and the
  // window re-attaches, and that reconnect ladder (queued re-attaches, deferred attach payloads) is its own
  // machinery — a leg run against it judged the old page (measured: 1 run in 4 read a pre-restart slab after the
  // re-attach had landed). A reload judges ONLY what the restarted server rebuilt — the stronger claim anyway.
  await cdp('Page.reload', {});
  await waitApp();
  await sleep(500);
  if (!(await waitFor(`!!(${VIEW(sid)})?._messageList`, 6000))) await attach(sid, 'T9 helpers');
  check('the reloaded page shows the conversation from the restarted server (a new normalizer epoch)', await waitFor(`(() => { const e = (${VIEW(sid)})?._normEpoch || 0; return !!e && e !== ${Number(epochBefore) || 0}; })()`, 30000), { epochBefore });
  // THE LIVE BRIDGE FIRST: a restored dtach session relays nothing until its bridge is judged alive —
  // records the stub writes in that window reach the buffer FILE (the rebuild below reads it) but not the
  // live parse (src/server/session-stdout.js armProbe heals the bridge). Probe with a harmless turn until
  // its answer renders, so the legs after this one judge the product, not the heal window.
  let alive = false;
  for (let k = 1; k <= 12 && !alive; k++) {
    liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'ping-' + k }));
    alive = await waitFor(`[...((${LIST(sid)})?.querySelectorAll('.chat-msg') || [])].some((m) => /pong-[0-9]+/.test(m.textContent))`, 2500);
  }
  check('the restored session\'s live bridge answers (a probe turn renders)', alive);
  check('THE FINDING: after the restart the Bash helper\'s ask is still a live card with its buttons', await waitFor(`!!(${ROW(sid, 'req-ui-B')})?.querySelector('.chat-perm-always')`, 30000));
  check('…still inside its helper\'s Agent card', await evalJs(`(${ROW(sid, 'req-ui-B')})?.closest('[data-tool-id]')?.dataset.toolId === 'toolu_ui_B'`));
  check('…and the settled one stayed settled', await evalJs(`(() => { const r = ${ROW(sid, 'req-ui-A')}; return !!r && !r.querySelector('.chat-perm-btn'); })()`));
  // verify r3 (round 1's F8): THE 60 s FOR-YOU CLOCK SURVIVES THE RESTART — the ask's first-seen instant rides the
  // session meta (helperAskedAt); the restarted server files the item at ask+60 s, not restart+60 s. Judged only
  // when the restart came late enough for the two clocks to disagree (restart+60 > ask+65).
  const todosNow = async () => { const j = await (await fetch(`http://127.0.0.1:${PORT}/api/user-todos`)).json(); const t = j && j.todos; return Array.isArray(t) ? t : [...((t && t.open) || []), ...((t && t.resolved) || [])]; };
  await sleep(Math.max(0, tAskB + 65000 - Date.now()));
  const itemsB = (await todosNow()).filter((t) => t.action && t.action.type === 'helper-ask' && t.action.requestId === 'req-ui-B');
  const clocksDisagree = tRestart + 60000 > tAskB + 65000;
  check(`(r3) the For-you clock survived the restart: the Bash ask's item is on file at ask+${Math.round((Date.now() - tAskB) / 1000)} s (the restart was at ask+${Math.round((tRestart - tAskB) / 1000)} s — a restarted clock would file only at ask+${Math.round((tRestart - tAskB) / 1000) + 60} s)${clocksDisagree ? '' : ' [inconclusive: the restart came too early for the clocks to disagree]'}`, itemsB.some((t) => t.status === 'open') && clocksDisagree, { items: itemsB.map((t) => [t.status, t.text]), askToRestartS: Math.round((tRestart - tAskB) / 1000) });

  // ═══ C5 answered from the parent's card ═════════════════════════════════
  console.log('C5 Always Allow on the parent\'s card');
  check('a real click on Always Allow', await realClickEl(`(${ROW(sid, 'req-ui-B')})?.querySelector('.chat-perm-always')`));
  const gotB = await waitResponses('req-ui-B');
  check('THE FINDING: the stub gets the answer with updatedPermissions = the CLI\'s suggestion', gotB.length === 1 && gotB[0].response?.response?.behavior === 'allow' && JSON.stringify(gotB[0].response?.response?.updatedPermissions?.[0]?.rules) === JSON.stringify([{ toolName: 'Bash', ruleContent: 'curl -s https://example.org' }]), gotB);
  check('the card settles and the chip goes (the harness said idle)', await waitFor(`(() => { const r = ${ROW(sid, 'req-ui-B')}; return !!r && !r.querySelector('.chat-perm-btn') && !(${CHIP(sid)}); })()`, 8000),
    await evalJs(`(() => { const v = (${VIEW(sid)}); const r = ${ROW(sid, 'req-ui-B')}; return { row: r ? r.textContent.slice(0, 120) : null, chip: (${CHIP(sid)})?.title || null, asks: v?._pendingAsks, turn: v?._statusBar?._turnState }; })()`));
  // verify r1: a SECOND answer for the same request (a stale client, the other window) writes NOTHING to stdin and is said
  {
    const nBefore = responsesFor('req-ui-B').length, fBefore = frames.length;
    liveWs.send(JSON.stringify({ type: 'permission-response', sessionId: sid, requestId: 'req-ui-B', approved: false }));
    const said = await (async () => { for (let i = 0; i < 40; i++) { const f = frames.slice(fBefore).find((m) => m?.type === 'error' && m.code === 'permission-settled'); if (f) return f; await sleep(100); } return null; })();
    await sleep(400);
    check('(r1) a second answer for a settled request: NO second control_response on stdin', responsesFor('req-ui-B').length === nBefore, responsesFor('req-ui-B'));
    const itemsB2 = (await todosNow()).filter((t) => t.action && t.action.type === 'helper-ask' && t.action.requestId === 'req-ui-B');
    check('(r3) …and the answer resolved the item the restarted server had filed (the table: asked+press ⇒ resolve-item)', itemsB2.length >= 1 && itemsB2.every((t) => t.status !== 'open'), itemsB2.map((t) => [t.status, t.text]));
    check('(r1) …and it is SAID to the sender (scope action, code permission-settled, plain words)', !!said && said.scope === 'action' && said.sessionId === sid && /Already answered — allowed/.test(said.message || ''), said);
  }

  // ═══ C6 stop ════════════════════════════════════════════════════════════
  console.log('C6 stopping helpers that are waiting');
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'again, with two more helpers' }));
  check('a background (D) and a foreground (C) helper ask', await waitFor(`!!(${ROW(sid, 'req-ui-D')})?.querySelector('.chat-perm-allow') && !!(${ROW(sid, 'req-ui-C')})?.querySelector('.chat-perm-allow')`, 15000),
    await evalJs(`(() => { const views = [...app.sessions.values()].filter((v) => v && v.sessionId === ${JSON.stringify(sid)}); return views.map((v) => ({ n: v._messages?.length, pong: (v._messages || []).some((m) => /pong/.test(JSON.stringify(m.content || ''))), connected: !!v._messageList?.isConnected, disposed: !!v._disposed, epoch: v._normEpoch, tools: (v._messages || []).filter((m) => m.toolCallId).map((m) => m.toolCallId) })); })()`));
  check('the foreground helper\'s ask sits in its (still running) Agent card', await evalJs(`(${ROW(sid, 'req-ui-C')})?.closest('[data-tool-id]')?.dataset.toolId === 'toolu_ui_C'`));
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'stop both helpers' }));
  check('THE FINDING: both asks say "No longer waiting — the helper was stopped" (no buttons)', await waitFor(`['req-ui-C', 'req-ui-D'].every((rid) => { const r = (${LIST(sid)})?.querySelector('.chat-helper-ask[data-request-id="' + rid + '"]'); return !!r && !r.querySelector('.chat-perm-btn') && /No longer waiting — the helper was stopped/.test(r.textContent); })`, 10000));
  const c6 = await evalJs(`(() => { const d = ${CARD(sid, 'toolu_ui_D')}, c = ${CARD(sid, 'toolu_ui_C')}; return { dChip: d?.querySelector('.chat-tool-label .chat-task-status-chip')?.textContent || '', dChipTitle: d?.querySelector('.chat-tool-label .chat-task-status-chip')?.title || '', dLabel: d?.querySelector('.chat-tool-label')?.textContent || '', cText: c?.textContent || '' }; })()`);
  check('THE FINDING: the stopped background helper\'s title chip reads "stopped" (was "⟳ running")', c6.dChip === 'stopped' && c6.dChipTitle === 'Stopped before it finished' && !/running/.test(c6.dLabel), c6);
  check('THE FINDING: the stopped foreground helper keeps its title and says "Stopped before it finished"', /Agent: Read the README \(foreground\)/.test(c6.cText) && /Stopped before it finished/.test(c6.cText), c6.cText.slice(0, 300));
  check('…never the CLI\'s canned rejection string', !/doesn't want to proceed|STOP what you are doing/.test(c6.cText));
  check('no page error during the run', pageErrors.length === 0, pageErrors);
  try { liveWs.send(JSON.stringify({ type: 'kill', sessionId: sid })); } catch {}

  // ═══ C7 control: the pre-lane normalizer ════════════════════════════════
  console.log('C7 CONTROL: the same page on the pre-lane normalizer');
  const mmPath = path.join(wt, 'src', 'message-manager.js');
  const mmSrc = fs.readFileSync(mmPath, 'utf8');
  const needle = 'const helper = this._subView ? null : helperAskOf(raw);';
  check('the patch site exists in the scratch worktree', mmSrc.includes(needle));
  try { srv.kill('SIGKILL'); } catch {}
  await sleep(500);
  fs.writeFileSync(mmPath, mmSrc.replace(needle, 'const helper = null;')); // the SCRATCH worktree's copy (never the checkout)
  startServer();
  check('the pre-lane server comes up', await waitServer());
  await cdp('Page.reload', {});
  await waitApp();
  await sleep(500);
  try { liveWs.close(); } catch {}
  await openWs();
  const sid2 = await create('s1-control');
  check('a second session on the pre-lane server', !!sid2 && await attach(sid2, 'control'));
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid2, text: 'Please use two helper agents in parallel' }));
  check('CONTROL: the chip still says "waiting for you" (the harness reported it)', await waitFor(`!!(${CHIP(sid2)})`, 15000));
  await sleep(1500);
  const ctl = await evalJs(`(() => { const l = ${LIST(sid2)}; return { rows: l?.querySelectorAll('.chat-helper-ask').length || 0, buttons: l?.querySelectorAll('.chat-perm-btn').length || 0, title: (${CHIP(sid2)})?.title || '' }; })()`);
  check('CONTROL: on the pre-lane normalizer there is NO card and NO button anywhere (the studies\' state) — the finding legs above can go red', ctl.rows === 0 && ctl.buttons === 0 && /waiting for you — the turn is paused/.test(ctl.title), ctl);
  try { liveWs.send(JSON.stringify({ type: 'kill', sessionId: sid2 })); liveWs.close(); } catch {}
} catch (e) {
  failed++;
  console.error('✗ suite threw: ' + (e && e.stack || e));
}
if ((failed || process.env.S1_KEEP_ALWAYS) && process.env.S1_KEEP_LOG) { try { fs.copyFileSync(SRV_LOG, process.env.S1_KEEP_LOG); fs.copyFileSync(STDIN_LOG, process.env.S1_KEEP_LOG + '.stdin'); } catch {} }
console.log(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
cleanup();
process.exit(failed ? 1 : 0);
