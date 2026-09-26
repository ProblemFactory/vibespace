#!/usr/bin/env node
// LANE L ON A REAL PAGE — first-run friction the naive-user study 2 found
// (2026-09-25, SharedContext/vibespace-naive-study-2-collab-20260925.md), each
// leg against a worktree server, a stub `claude` behind the REAL chat-wrapper,
// and headless chrome over raw CDP (test-inbox-reply-ui's skeleton). No vendor
// call: the stub answers every turn itself.
//
//   A  the New Session dialog
//     A1 opening it twice never carries the name ("S11 chromeS12 first…"); the
//        cwd the user typed is still remembered (the designed prefill)
//     A2 Escape with the permission <select>'s picker OPEN closes only the
//        picker; the next Escape closes the dialog. CONTROL: Escape from a text
//        field closes the dialog at once (the leg can say no)
//     A3 Escape with the cwd suggestion list open hides the list, not the dialog
//     A4 the permission modes read as words with the raw value as a hint (en +
//        zh); the option VALUES are the protocol strings
//   B  the spawn: the stub's own argv carries --settings permissions.allow =
//      the rule table; CONTROL: `claude.allowAgentTools` off ⇒ a new session
//      carries none
//   C  the permission cards (the stub asks like the CLI does, with the CLI's
//      own two-word suggestions)
//     C1 a `vibespace-browser open <url>` card wears the browser's face and
//        says "Open <url>"; its Always Allow names Bash(vibespace-browser:*)
//     C2 ONE real click on Always Allow ⇒ the stub receives `updatedPermissions`
//        with the WIDENED rule and no `permission_updates`
//     C3 the hovered Allow stays green (CONTROL: the hovered Deny changes), the
//        button does not move for 1.5 s, and ONE real click answers the card —
//        exactly one control_response, the card resolved
//     C4 `close --all; sleep 3; pgrep …` stays a Bash card that says what it
//        does, names pgrep and states the close --all scope
//     C5 CONTROL: `git status` is a plain Bash card, its Always Allow unwidened
// Requires google-chrome + dtach (SKIP without). Run: node scripts/test-new-session-dialog.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for the server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
try { execSync('command -v dtach', { stdio: 'ignore', shell: '/bin/bash' }); } catch { console.log('SKIP: dtach is not installed — a chat session cannot be created here'); process.exit(0); }
const { claudeAllowRules } = require(path.join(repo, 'src/agent-tool-rules.js'));

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('new-session-dialog-wt');
const fakeHome = scratchHome('new-session-dialog-home', fs);
const stubDir = scratch('new-session-dialog-stub');
fs.rmSync(stubDir, { recursive: true, force: true });
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the stub CLI: argv recorded, stdin logged, a scripted run of permission asks ──
const STEPS = [
  { command: 'vibespace-browser open https://example.com', description: 'Open the page', suggest: ['vibespace-browser open *'] },
  { command: "vibespace-browser click @e1 2>&1 | grep -v '^note:'; vibespace-browser snapshot", description: 'Click and read', suggest: ['vibespace-browser click *', 'vibespace-browser snapshot *'] },
  { command: 'vibespace-browser close --all; sleep 3; pgrep -f "user-data-dir=/tmp/x"', description: 'Close the browser, check leftovers', suggest: ['vibespace-browser close *', 'pgrep -f *'] },
  { command: 'git status', description: 'Show the tree', suggest: ['git status *'] },
];
const stubPath = path.join(stubDir, 'claude');
const STDIN_LOG = path.join(stubDir, 'stdin.ndjson');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]\\n  --permission-mode <mode>              Permission mode to use for the session\\n                                        (choices: "acceptEdits", "auto",\\n                                        "bypassPermissions", "manual",\\n                                        "dontAsk", "plan")'); process.exit(0); }
fs.writeFileSync(${JSON.stringify(stubDir)} + '/argv-' + process.pid + '.json', JSON.stringify(args));
const SID = '0e1a0000-0000-4000-8000-' + String(process.pid).padStart(12, '0');
const STEPS = ${JSON.stringify(STEPS)};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5', cwd: ${JSON.stringify(CWD)}, tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281' });
let k = -1, buf = '';
const ask = () => {
  const s = STEPS[k];
  const id = 'toolu_lane_' + k;
  out({ type: 'assistant', message: { id: 'msg_lane_' + k, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: s.command, description: s.description } }], stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: SID, uuid: 'lane-a-' + k });
  out({ type: 'control_request', request_id: 'req-lane-' + k, request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: s.command, description: s.description }, permission_suggestions: [{ type: 'addRules', rules: s.suggest.map((r) => ({ toolName: 'Bash', ruleContent: r })), behavior: 'allow', destination: 'localSettings' }], tool_use_id: id } });
};
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    fs.appendFileSync(${JSON.stringify(STDIN_LOG)}, line + '\\n');
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m) continue;
    if (m.type === 'user' && k < 0) { k = 0; setTimeout(ask, 300); continue; }
    if (m.type === 'control_response' && m.response && m.response.request_id === 'req-lane-' + k) {
      const allowed = m.response.response && m.response.response.behavior === 'allow';
      const id = 'toolu_lane_' + k;
      out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: allowed ? 'ok' : 'The user doesn\\'t want to proceed with this tool use.', is_error: !allowed }] }, session_id: SID, uuid: 'lane-u-' + k });
      k++;
      if (k < STEPS.length) setTimeout(ask, 400);
      else {
        out({ type: 'assistant', message: { id: 'msg_lane_end', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: SID, uuid: 'lane-a-end' });
        out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 10, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0, usage: { input_tokens: 1, output_tokens: 1 } });
      }
    }
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── throwaway server in a worktree (overlays the working src/ + the built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv.kill('SIGKILL'); } catch {}
  // every process this suite caused carries one of these scratch paths (dtach, the wrapper, the stub, the device daemon)
  for (const pat of [wt, fakeHome, stubDir]) { try { execSync(`pkill -9 -f ${JSON.stringify(pat)}`, { stdio: 'ignore' }); } catch {} }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); break; } catch { await sleep(250); } }

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
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await evalJs(expr)) return true; await sleep(120); } return evalJs(expr); };
const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
const key = async (k, code, vk) => {
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
};
const escape = () => key('Escape', 'Escape', 27);
const centerOf = (sel) => evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, w: q.width, h: q.height, hits: !!hit && (hit === e || e.contains(hit)) }; })()`);
const realClick = async (sel) => {
  const r = await centerOf(sel);
  if (!r || !r.hits) return false;
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
};
const dialogVisible = `!document.getElementById('dialog-overlay').classList.contains('hidden') && !document.getElementById('dialog-new-session').classList.contains('hidden')`;
const stdinFrames = () => (fs.existsSync(STDIN_LOG) ? fs.readFileSync(STDIN_LOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const responsesFor = (rid) => stdinFrames().filter((m) => m.type === 'control_response' && m.response?.request_id === rid);
const argvFiles = () => fs.readdirSync(stubDir).filter((f) => f.startsWith('argv-')).map((f) => ({ f, t: fs.statSync(path.join(stubDir, f)).mtimeMs, argv: JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')) })).sort((a, b) => a.t - b.t);
const settingsOfArgv = (argv) => { const i = argv.indexOf('--settings'); if (i < 0) return null; try { return JSON.parse(argv[i + 1]); } catch { return 'unparseable'; } };

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(600);

  // ═══ A the New Session dialog ═══════════════════════════════════════════
  console.log('A1 the name never carries over');
  {
    await evalJs(`app.showNewSessionDialog(); true`);
    check('the dialog opens', await waitFor(dialogVisible, 5000));
    await evalJs(`document.getElementById('input-cwd').value = ${JSON.stringify(CWD)}; document.getElementById('input-session-name').focus(); true`);
    await cdp('Input.insertText', { text: 'S11 chrome' });
    check('a name typed into the field', (await evalJs(`document.getElementById('input-session-name').value`)) === 'S11 chrome');
    await realClick('#dialog-new-session .btn-cancel');
    check('Cancel closes it', !(await evalJs(dialogVisible)));
    await evalJs(`app.showNewSessionDialog(); true`);
    await waitFor(dialogVisible, 5000);
    check('THE FINDING: reopened, the name field is EMPTY (was "S11 chrome")', (await evalJs(`document.getElementById('input-session-name').value`)) === '', await evalJs(`document.getElementById('input-session-name').value`));
    await evalJs(`document.getElementById('input-session-name').focus(); true`);
    await cdp('Input.insertText', { text: 'S12 first (example.com)' });
    check('typing a new name gives exactly that name (never "S11 chromeS12 first…")', (await evalJs(`document.getElementById('input-session-name').value`)) === 'S12 first (example.com)');
    check('the cwd typed last time is still remembered (the designed prefill survives)', (await evalJs(`document.getElementById('input-cwd').value`)) === CWD);
  }

  console.log('A2 Escape with the permission picker open closes only the picker');
  {
    // CONTROL FIRST: a text field focused, Escape closes the dialog at once
    await evalJs(`document.getElementById('input-session-name').focus(); true`);
    await escape();
    check('CONTROL: Escape from a text field closes the dialog on the first press (the leg can say no)', await waitFor(`!(${dialogVisible})`, 2000));
    await evalJs(`app.showNewSessionDialog(); true`);
    await waitFor(dialogVisible, 5000);
    const clicked = await realClick('#input-permission');
    await sleep(300);
    const openNow = await evalJs(`(() => { const s = document.getElementById('input-permission'); try { return s.matches(':open'); } catch { return 'no :open'; } })()`);
    check('a real click opens the permission picker (`:open` is the fact the handler reads)', clicked && openNow === true, { clicked, openNow });
    await escape();
    await sleep(300);
    check('THE FINDING: Escape with the picker open leaves the dialog OPEN', await evalJs(dialogVisible));
    check('…and the picker itself is closed', (await evalJs(`document.getElementById('input-permission').matches(':open')`)) === false);
    await escape();
    check('a second Escape (picker closed, focus on the select) closes the dialog', await waitFor(`!(${dialogVisible})`, 2000));
    // A2b — CONSTRUCTED: headless chrome's open picker consumes a real Escape
    // itself (measured: the leg above is green on the pre-fix build too), so the
    // shape where the page DOES receive the key while the picker is open (another
    // browser, a customizable select) is dispatched to the select directly —
    // the handler's own decision, on both builds.
    await evalJs(`app.showNewSessionDialog(); true`);
    await waitFor(dialogVisible, 5000);
    await realClick('#input-permission');
    await sleep(300);
    const probe = await evalJs(`(() => { const s = document.getElementById('input-permission'); const open = s.matches(':open'); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })); return { open, dialog: ${dialogVisible} }; })()`);
    check('A2b an Escape that REACHES the page while the picker is open leaves the dialog open', probe.open === true && probe.dialog === true, probe);
    await escape(); await sleep(150);
    if (await evalJs(dialogVisible)) await escape();
    check('A2b (the dialog then closes on a plain Escape)', await waitFor(`!(${dialogVisible})`, 2000));
  }

  console.log('A3 Escape with the cwd suggestions open hides the suggestions only');
  {
    fs.mkdirSync(path.join(fakeHome, 'proj', 'alpha'), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, 'proj', 'alps'), { recursive: true });
    await evalJs(`app.showNewSessionDialog(); true`);
    await waitFor(dialogVisible, 5000);
    await evalJs(`(() => { const i = document.getElementById('input-cwd'); i.value = ''; i.focus(); return true; })()`);
    await cdp('Input.insertText', { text: path.join(fakeHome, 'proj', 'al') });
    const shown = await waitFor(`!document.getElementById('cwd-suggestions').classList.contains('hidden') && document.querySelectorAll('#cwd-suggestions > *').length > 0`, 5000);
    check('typing a path opens the suggestion list', shown);
    await escape();
    await sleep(250);
    check('THE FINDING: Escape hides the list …', await evalJs(`document.getElementById('cwd-suggestions').classList.contains('hidden')`));
    check('… and the dialog stays open', await evalJs(dialogVisible));
    await escape();
    check('the next Escape closes the dialog', await waitFor(`!(${dialogVisible})`, 2000));
  }

  console.log('A4 the permission modes in plain words');
  {
    await evalJs(`app.showNewSessionDialog(); true`);
    await waitFor(dialogVisible, 5000);
    await waitFor(`[...document.querySelectorAll('#input-permission option')].some((o) => o.value === 'dontAsk')`, 8000);
    const opts = await evalJs(`[...document.querySelectorAll('#input-permission option')].map((o) => ({ v: o.value, t: o.textContent }))`);
    const nonEmpty = opts.filter((o) => o.v);
    check('the options come from the CLI\'s modes (dontAsk / bypassPermissions / plan among them)', ['dontAsk', 'bypassPermissions', 'plan'].every((v) => opts.some((o) => o.v === v)), opts);
    check('no option reads as a bare protocol value — each is words, then its raw value as a hint', nonEmpty.length >= 5 && nonEmpty.every((o) => o.t !== o.v && o.t.endsWith(' · ' + o.v)), nonEmpty);
    check('bypassPermissions reads "Never ask (full access) · bypassPermissions"', opts.find((o) => o.v === 'bypassPermissions')?.t === 'Never ask (full access) · bypassPermissions');
    check('the values stay the protocol strings (what --permission-mode takes)', opts.every((o) => o.v === '' || /^[a-zA-Z]+$/.test(o.v)));
    await escape();
    await evalJs(`localStorage.setItem('vibespace.lang', 'zh'); true`);
    await cdp('Page.reload', {});
    await sleep(500);
    await waitApp();
    await evalJs(`app.showNewSessionDialog(); true`);
    await waitFor(dialogVisible, 5000);
    await waitFor(`[...document.querySelectorAll('#input-permission option')].some((o) => o.value === 'dontAsk')`, 8000);
    const zh = await evalJs(`[...document.querySelectorAll('#input-permission option')].find((o) => o.value === 'bypassPermissions')?.textContent`);
    check('zh: the same option reads "从不询问（完全访问） · bypassPermissions"', zh === '从不询问（完全访问） · bypassPermissions', zh);
    await escape();
    await evalJs(`localStorage.setItem('vibespace.lang', 'en'); true`);
    await cdp('Page.reload', {});
    await sleep(500);
    await waitApp();
  }

  // ═══ B the spawn carries the rules ═════════════════════════════════════
  console.log('B the stub CLI\'s own argv');
  const liveWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise((r) => liveWs.on('open', r));
  const frames = [];
  liveWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch {} });
  const create = async (reqId) => {
    const before = frames.filter((m) => m?.type === 'created').length;
    const argvBefore = argvFiles().length;
    liveWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId }));
    let sid = null;
    for (let i = 0; i < 80 && !sid; i++) { const made = frames.filter((m) => m?.type === 'created'); if (made.length > before) sid = made[made.length - 1].sessionId; else await sleep(250); }
    for (let i = 0; i < 80 && argvFiles().length <= argvBefore; i++) await sleep(150);
    const files = argvFiles();
    return { sid, argv: files.length > argvBefore ? files[files.length - 1].argv : null };
  };
  const RULES = claudeAllowRules();
  const on = await create('lane-on');
  check('a chat session is created through the real spawn path (stub CLI behind the real wrapper)', !!on.sid && !!on.argv, frames.slice(-3).map((f) => JSON.stringify(f).slice(0, 200)).join('\n'));
  const sOn = on.argv ? settingsOfArgv(on.argv) : null;
  check('THE FIX REACHES THE CLI: the spawned CLI\'s --settings carries permissions.allow = the rule table', !!sOn && JSON.stringify(sOn.permissions?.allow) === JSON.stringify(RULES), sOn);
  check('…including the two the study needed first (vibespace-browser, vibespace-status)', !!sOn?.permissions?.allow?.includes?.('Bash(vibespace-browser:*)') && sOn.permissions.allow.includes('Bash(vibespace-status:*)'));
  const patch = await fetch(`http://127.0.0.1:${PORT}/api/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ 'claude.allowAgentTools': false }) });
  check('the setting is turned off through the settings route', patch.status === 200);
  const off = await create('lane-off');
  const sOff = off.argv ? settingsOfArgv(off.argv) : null;
  check('CONTROL: with claude.allowAgentTools off, a new session\'s CLI gets NO allow rules (only the other defaults)', !!off.argv && !!sOff && typeof sOff === 'object' && !('permissions' in sOff), sOff);
  await fetch(`http://127.0.0.1:${PORT}/api/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ 'claude.allowAgentTools': null }) });
  if (off.sid) liveWs.send(JSON.stringify({ type: 'kill', sessionId: off.sid }));

  // ═══ C the permission cards ════════════════════════════════════════════
  console.log('C the permission cards (the stub asks like the CLI)');
  const sid = on.sid;
  await evalJs(`app.attachSession(${JSON.stringify(sid)}, 'lane L', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
  check('the chat window attaches', await waitFor(`!!document.querySelector('.chat-view .chat-input')`, 20000));
  liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'fill the form' }));
  const card = (k) => `[data-request-id="req-lane-${k}"]`;
  const msgOf = (k) => `document.querySelector('${card(k)}')?.closest('.chat-msg')`;

  // C1 — the browser card
  check('card 1 (vibespace-browser open) asks', await waitFor(`!!document.querySelector('${card(0)} .chat-perm-allow')`, 15000));
  const c1 = await evalJs(`(() => { const m = ${msgOf(0)}; const s = document.querySelector('${card(0)}'); return { head: m?.querySelector('.chat-tool-label')?.textContent || '', label: s?.querySelector('.chat-permission-label')?.textContent || '', what: s?.querySelector('.chat-permission-what')?.textContent || '', always: s?.querySelector('.chat-perm-always')?.title || '', svg: !!m?.querySelector('.chat-tool-label svg') }; })()`);
  check('C1 the card wears the browser\'s face: "Agent browser" + "Open https://example.com" in its head (was "Bash")', /Agent browser/.test(c1.head) && /Open https:\/\/example\.com/.test(c1.head) && c1.svg, c1);
  check('C1 the permission label says "Permission: Agent browser" and the what-line "Open https://example.com"', /Permission: Agent browser/.test(c1.label) && c1.what === 'Open https://example.com', c1);
  check('C1 Always Allow names the WHOLE tool rule (the CLI suggested "vibespace-browser open *")', c1.always === 'Always allow: Bash(vibespace-browser:*)', c1.always);

  // C2 — Always Allow sends the widened rule under the CLI's own field name
  check('C2 one real click on Always Allow', await realClick(`${card(0)} .chat-perm-always`));
  const got1 = await (async () => { for (let i = 0; i < 50; i++) { const r = responsesFor('req-lane-0'); if (r.length) return r; await sleep(100); } return responsesFor('req-lane-0'); })();
  const resp1 = got1[0]?.response?.response || {};
  check('C2 THE FINDING: the stub receives `updatedPermissions` (the CLI\'s schema) …', Array.isArray(resp1.updatedPermissions) && resp1.behavior === 'allow', resp1);
  check('C2 … carrying the widened rule Bash(vibespace-browser:*) to localSettings', JSON.stringify(resp1.updatedPermissions?.[0]?.rules) === JSON.stringify([{ toolName: 'Bash', ruleContent: 'vibespace-browser:*' }]) && resp1.updatedPermissions?.[0]?.destination === 'localSettings', resp1.updatedPermissions);
  check('C2 … and never `permission_updates` (a key the CLI strips — why Always Allow never stuck)', !('permission_updates' in resp1));
  check('C2 exactly ONE response for that card', got1.length === 1, got1.length);

  // C3 — hover, stability, one click
  check('card 2 (click + snapshot) asks', await waitFor(`!!document.querySelector('${card(1)} .chat-perm-allow')`, 15000));
  const c2 = await evalJs(`(() => { const m = ${msgOf(1)}; return { head: m?.querySelector('.chat-tool-label')?.textContent || '', always: document.querySelector('${card(1)} .chat-perm-always')?.title || '' }; })()`);
  check('C3 the two-verb line reads "Click @e1 · Read the page" under the browser\'s name', /Agent browser/.test(c2.head) && /Click @e1 · Read the page/.test(c2.head), c2);
  check('C3 its Always Allow collapses both CLI suggestions into one rule', c2.always === 'Always allow: Bash(vibespace-browser:*)', c2.always);
  const green = await evalJs(`(() => { const p = document.createElement('div'); p.style.background = 'var(--green)'; document.body.appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; })()`);
  const r0 = await centerOf(`${card(1)} .chat-perm-allow`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r0.x, y: r0.y });
  await sleep(250);
  const hov = await evalJs(`(() => { const b = document.querySelector('${card(1)} .chat-perm-allow'); return { hover: b.matches(':hover'), bg: getComputedStyle(b).backgroundColor }; })()`);
  check('C3 THE S9-68 "DEAD BUTTON": a HOVERED Allow keeps its green background', hov.hover && hov.bg === green, { hov, green });
  const rd = await centerOf(`${card(1)} .chat-perm-deny`);
  const denyIdle = await evalJs(`getComputedStyle(document.querySelector('${card(1)} .chat-perm-deny')).backgroundColor`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rd.x, y: rd.y });
  await sleep(250);
  const denyHov = await evalJs(`getComputedStyle(document.querySelector('${card(1)} .chat-perm-deny')).backgroundColor`);
  check('C3 CONTROL: the hovered Deny DOES change (the measurement sees :hover)', denyHov !== denyIdle, { denyIdle, denyHov });
  const ra = await centerOf(`${card(1)} .chat-perm-allow`);
  await sleep(1500);
  const rb = await centerOf(`${card(1)} .chat-perm-allow`);
  check('C3 the Allow button does not move for 1.5 s (a click aimed from a screenshot lands)', ra && rb && Math.abs(ra.x - rb.x) < 1 && Math.abs(ra.y - rb.y) < 1, { ra, rb });
  check('C3 ONE real click on Allow', await realClick(`${card(1)} .chat-perm-allow`));
  const got2 = await (async () => { for (let i = 0; i < 50; i++) { const r = responsesFor('req-lane-1'); if (r.length) return r; await sleep(100); } return responsesFor('req-lane-1'); })();
  check('C3 the stub is answered by that ONE click (no second click needed)', got2.length === 1 && got2[0].response?.response?.behavior === 'allow' && !got2[0].response?.response?.updatedPermissions, got2);
  check('C3 the card shows it resolved, its buttons gone', await waitFor(`!document.querySelector('${card(1)} .chat-perm-allow') && /Allowed/.test(document.querySelector('${card(1)}')?.textContent || '')`, 5000));
  await sleep(800);
  check('C3 and it stays exactly one response (nothing re-sent)', responsesFor('req-lane-1').length === 1);

  // C4 — the S5-26 card
  check('card 3 (close --all; sleep; pgrep) asks', await waitFor(`!!document.querySelector('${card(2)} .chat-perm-allow')`, 15000));
  const c3 = await evalJs(`(() => { const m = ${msgOf(2)}; const s = document.querySelector('${card(2)}'); return { head: m?.querySelector('.chat-tool-label')?.textContent || '', label: s?.querySelector('.chat-permission-label')?.textContent || '', what: s?.querySelector('.chat-permission-what')?.textContent || '', scope: s?.querySelector('.chat-permission-scope')?.textContent || '' }; })()`);
  check('C4 a line that also runs pgrep stays a BASH card (never dressed as the browser)', /Permission: Bash/.test(c3.label) && !/Agent browser/.test(c3.head), c3);
  check('C4 … that says what it does and names the other command', /Close this conversation's browser/.test(c3.what) && /also runs: pgrep/.test(c3.what), c3.what);
  check('C4 THE FINDING: it states the close --all scope ("only this conversation\'s browser")', /Closes only this conversation's browser — browsers of other sessions are not touched\./.test(c3.scope), c3.scope);
  await realClick(`${card(2)} .chat-perm-deny`);
  check('C4 Deny answers it (one response, behavior deny)', await (async () => { for (let i = 0; i < 50; i++) { const r = responsesFor('req-lane-2'); if (r.length) return r.length === 1 && r[0].response?.response?.behavior === 'deny'; await sleep(100); } return false; })());

  // C5 — the control card
  check('card 4 (git status) asks', await waitFor(`!!document.querySelector('${card(3)} .chat-perm-allow')`, 15000));
  const c4 = await evalJs(`(() => { const m = ${msgOf(3)}; const s = document.querySelector('${card(3)}'); return { head: m?.querySelector('.chat-tool-label')?.textContent || '', label: s?.querySelector('.chat-permission-label')?.textContent || '', what: !!s?.querySelector('.chat-permission-what'), always: s?.querySelector('.chat-perm-always')?.title || '' }; })()`);
  check('C5 CONTROL: `git status` is a plain Bash card — no browser face, no what-line', /Permission: Bash/.test(c4.label) && !/Agent browser/.test(c4.head) && !c4.what, c4);
  check('C5 CONTROL: its Always Allow is the CLI\'s own suggestion, unwidened', c4.always === 'Always allow: Bash(git status *)', c4.always);
  await realClick(`${card(3)} .chat-perm-always`);
  const got4 = await (async () => { for (let i = 0; i < 50; i++) { const r = responsesFor('req-lane-3'); if (r.length) return r; await sleep(100); } return responsesFor('req-lane-3'); })();
  check('C5 its Always Allow sends the CLI\'s rule as-is', JSON.stringify(got4[0]?.response?.response?.updatedPermissions?.[0]?.rules) === JSON.stringify([{ toolName: 'Bash', ruleContent: 'git status *' }]), got4);
  check('the run finishes (the stub\'s final "done")', await waitFor(`[...document.querySelectorAll('.chat-msg')].some((m) => m.textContent.trim().endsWith('done'))`, 8000));
  check('no page error during the run', pageErrors.length === 0, pageErrors);
  try { liveWs.send(JSON.stringify({ type: 'kill', sessionId: sid })); liveWs.close(); } catch {}
} catch (e) {
  failed++;
  console.error('✗ suite threw: ' + (e && e.stack || e));
}
console.log(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
cleanup();
process.exit(failed ? 1 : 0);
