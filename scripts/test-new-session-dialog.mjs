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
//   D  THE MODEL MENU FOLLOWS THE ACCOUNT'S PROVIDER (lane models-at-session, design q-053 r1 §3 / §6 P0c): the machine's
//      login ⇒ claude's own list; an ACCOUNT SWITCH to a third-party account (providerId) ⇒ the menu REDRAWN to exactly its
//      entered rows, its default picked; a provider with NONE ⇒ ONE line (CONTROL: no menu under it), Create says why and
//      spawns nothing, one real click opens the account's models; back to Default ⇒ claude's list
//   E  THE RUNNING BADGE PER SESSION (the §6 chrome leg): three live conversations — the machine's login lists claude's
//      models, the DeepSeek one exactly its rows ("DeepSeek · Entered by you"), the Empty one ONE line + its door; a pick is
//      RE-RESOLVED against the provider: Custom… "fast" (its alias) ⇒ the CLI gets set_model deepseek-chat; "gpt-9" ⇒
//      refused by name, nothing sent
//   F  THE ROWS FOLLOW THE BACKEND THE DIALOG OPENS WITH (lane new-session-account-follows-backend, inc-mvi2cv4b-hdwv:
//      「创建过一次 Antigravity 对话后，再次创建对话的时候默认正确加载了 Claude 的信息，除了可选账号依然是 Antigravity 的」 —
//      the open SET the select, which fires no `change`, after the account row had been filled from the previous open's
//      value). Create is stubbed in the page (app.createSession records what the real Create click sends — no agy, no
//      claude spawned). F1 pick Antigravity ⇒ the account row lists only Antigravity's; F2 Create, open again ⇒ Claude
//      AND Claude's account row (the default selected) AND Claude's model menu, and Create sends no Antigravity account;
//      F3 the inverse (Claude + an account, then an open on Antigravity); F4 a programmatic applyBackend('codex') refills
//      every derived row (the shell hides them); every apply names its cause in the op ring
//   G  … AND THE MACHINE (the same hole: the host list lands after the rows were filled, and its programmatic set fired
//      no `change`) — the host list stubbed in the page: G1 an open on a machine ⇒ the account row speaks that machine;
//      G2 the next open on this one ⇒ this machine's words
//   RED CONTROL = the base's open order (the account row filled from the select's previous value, then a programmatic
//      set; the machine set only when the list lands), rebuilt from a PATCHED COPY of today's app.js in the throwaway
//      worktree (one esbuild — never the repository's history): F2 / F3 / G1 red; the real bundle back ⇒ F2 green
// Requires google-chrome + dtach (SKIP without). Run: node scripts/test-new-session-dialog.mjs
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
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
if (args.includes('--help')) { console.log('Usage: claude [options]\\n  --permission-mode <mode>              Permission mode to use for the session\\n                                        (choices: "acceptEdits", "auto",\\n                                        "bypassPermissions", "manual",\\n                                        "dontAsk", "plan")\\n  --effort <level>                      Effort level for the current session\\n                                        (low, medium, high, xhigh, max)'); process.exit(0); }
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
// lane models-at-session (D / E): two claude API keys that NAME a third-party provider (`providerId` — the field Train 2's wizard
// writes and the pool's member lookup reads) + the records they name (data/providers.json): DeepSeek (entered rows, an alias)
// and Empty (none). The keys are sealed the way the store seals them (data/.accounts-key, aes-256-gcm iv:tag:data).
{
  const D = path.join(wt, 'data'), crypto = require('node:crypto'), k = crypto.randomBytes(32);
  fs.writeFileSync(path.join(D, '.accounts-key'), k.toString('hex'), { mode: 0o600 });
  const seal = (text) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv), e = Buffer.concat([c.update(text, 'utf-8'), c.final()]); return `${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${e.toString('hex')}`; };
  const k1 = 'sk-ant-api03-' + 'd'.repeat(40), k2 = 'sk-ant-api03-' + 'e'.repeat(40);
  fs.writeFileSync(path.join(D, 'accounts.json'), JSON.stringify({ version: 1, accounts: [
    { id: 'acct-lane-ds', name: 'DeepSeek key', type: 'api', backend: 'claude', keyEnc: seal(k1), tail: k1.slice(-8), providerId: 'pv-lane-ds' },
    { id: 'acct-lane-empty', name: 'Empty provider', type: 'api', backend: 'claude', keyEnc: seal(k2), tail: k2.slice(-8), providerId: 'pv-lane-empty' },
    // lane new-session-account-follows-backend (F): an Antigravity account signed in (its root holds agy's token file —
    // a stat, never read) and a codex one that is not (no usage probe can run on it)
    { id: 'agy-lane-follow', name: 'Agy work', type: 'subscription', backend: 'antigravity' },
    { id: 'codex-lane-follow', name: 'Codex work', type: 'subscription', backend: 'codex' },
  ] }), { mode: 0o600 });
  const agyTok = path.join(D, 'agy-subs', 'agy-lane-follow', '.gemini', 'antigravity-cli', 'antigravity-oauth-token');
  fs.mkdirSync(path.dirname(agyTok), { recursive: true, mode: 0o700 });
  fs.writeFileSync(agyTok, 'lane-fixture-not-a-token', { mode: 0o600 });
  fs.writeFileSync(path.join(D, 'providers.json'), JSON.stringify({ v: 1, providers: [
    { id: 'pv-lane-ds', kind: 'self-hosted', label: 'DeepSeek', auth: 'x-api-key', modelsSource: 'configured', models: [{ id: 'deepseek-chat', label: 'DeepSeek Chat', context: 128000, caps: ['tools'] }, { id: 'deepseek-reasoner', label: 'deepseek-reasoner', context: null, caps: ['reasoning'] }], aliases: { fast: 'deepseek-chat' }, defaultModel: 'deepseek-reasoner' },
    { id: 'pv-lane-empty', kind: 'self-hosted', label: 'Empty', modelsSource: 'none' },
  ] }), { mode: 0o600 });
}
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
  // …and what lives there only by cwd / HOME / daemon root — the server's device daemon is title-rewritten, so no argv
  // names it (it outlived every run: the gate's reaper found it later)
  for (const root of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} }
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

  // ═══ B2 the effort picker keeps Ultracode (lane effort-ultracode) ═════════════════
  // /api/session-options used to REPLACE the dialog's effort list with the
  // CLI's parsed --effort levels, which never carry ultracode (not an
  // --effort value) — the row vanished the moment the fetch landed.
  console.log('B2 the dialog\'s effort select after /api/session-options');
  const sopts = await (await fetch(`http://127.0.0.1:${PORT}/api/session-options`)).json();
  check('the server answers the CLI\'s parsed levels and the declared extras apart', JSON.stringify(sopts.effortLevels) === JSON.stringify(['low', 'medium', 'high', 'xhigh', 'max']) && (sopts.effortExtras || []).map((x) => x.value).join() === 'ultracode', sopts);
  await evalJs(`app.showNewSessionDialog(); document.getElementById('input-backend').value = 'claude'; document.getElementById('input-backend').dispatchEvent(new Event('change')); true`);
  const landed = await waitFor(`[...document.getElementById('input-effort').options].some((o) => o.value === 'xhigh' && o.textContent === 'Xhigh')`); // 'Xhigh' = the fetched list ('XHigh' = the static seed)
  const effortRows = await evalJs(`JSON.stringify([...document.getElementById('input-effort').options].map((o) => [o.value, o.textContent]))`);
  check('THE BUG: after the fetch landed the dialog\'s effort select still lists Ultracode — Auto, the parsed levels, then the declared extra', landed && JSON.stringify(JSON.parse(effortRows).map((r) => r[0])) === JSON.stringify(['', 'low', 'medium', 'high', 'xhigh', 'max', 'ultracode']), effortRows);
  check('…labelled with its hint the way codex\'s ultra is', JSON.parse(effortRows).some((r) => r[0] === 'ultracode' && /^Ultracode — xhigh effort/.test(r[1])), effortRows);
  const argvBeforeU = argvFiles().length;
  await evalJs(`document.getElementById('input-cwd').value = ${JSON.stringify(CWD)}; document.getElementById('input-mode').value = 'chat'; document.getElementById('input-effort').value = 'ultracode'; true`);
  await realClick('#dialog-new-session .btn-create');
  for (let i = 0; i < 80 && argvFiles().length <= argvBeforeU; i++) await sleep(150);
  const uFiles = argvFiles();
  const uArgv = uFiles.length > argvBeforeU ? uFiles[uFiles.length - 1].argv : null;
  const uSet = uArgv ? settingsOfArgv(uArgv) : null;
  check('picking Ultracode spawns the CLI with --effort xhigh + the ultracode settings key (never --effort ultracode)', !!uArgv && uArgv[uArgv.indexOf('--effort') + 1] === 'xhigh' && !uArgv.includes('ultracode') && uSet?.ultracode === true, uArgv);

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
  // lane-mirror-198 (the Actions mirror of 2.369.198, red on both attempts): the click renders "✓ Allowed" AT ONCE
  // (the optimistic overlay in the click handler), then the stub's tool_result COMPLETES the card and renderToolMsg
  // drops the overlay BY RULE (resolved + complete ⇒ no overlay — the ✓ label and the output say it ran), taking
  // `data-request-id` with it. The old judge asserted that transient through `data-request-id` and lost the race to
  // the completion edit under the runner's load (two orders: the judge's first sample vs the round trip
  // click → stdin → tool_result → edit → swap). The judge now keys the MESSAGE (its id `<sid>:t:<toolUseId>` rides
  // the swap) and waits on the card's own settled evidence — its buttons gone AND (the overlay says Allowed OR the
  // card is complete) — then on the completed card, each with a deadline.
  const msg1 = `.chat-msg[data-msg-id$=":t:toolu_lane_1"]`;
  const cardFacts = `(() => { const m = document.querySelector(${JSON.stringify(msg1)}); if (!m) return null; return { buttons: !!m.querySelector('.chat-perm-btn'), allowedChip: /Allowed/.test(m.querySelector('.chat-permission-resolved')?.textContent || ''), pending: !!m.querySelector('.chat-tool-output-pending'), overlay: !!m.querySelector('.chat-permission-inline') }; })()`;
  check('C3 the card shows it resolved, its buttons gone (✓ Allowed while the result is pending, the completed card once it lands)', await waitFor(`(() => { const f = ${cardFacts}; return !!f && !f.buttons && (f.allowedChip || !f.pending); })()`, 10000), await evalJs(cardFacts));
  check('C3 …and it COMPLETES on the stub\'s tool_result (the ✓ card, no overlay, no buttons — the rule the old judge raced)', await waitFor(`(() => { const f = ${cardFacts}; return !!f && !f.buttons && !f.pending && !f.overlay; })()`, 10000), await evalJs(cardFacts));
  check('C3 CONTROL: the old judge\'s transient (`data-request-id` + "Allowed") reads FALSE on the completed card — the race it lost', !(await evalJs(`!document.querySelector('${card(1)} .chat-perm-allow') && /Allowed/.test(document.querySelector('${card(1)}')?.textContent || '')`)));
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
  // ═══ D the model menu follows the account's provider (lane models-at-session, design q-053 r1 §3 + §6 P0c) ═══════
  // the seeded accounts (before the boot, below the stub): two claude API keys that NAME a third-party provider
  // (`providerId`) — DeepSeek (entered rows + an alias) and Empty (none)
  console.log('D the New Session model menu follows the account\'s provider');
  const menu = `(() => { const s = document.getElementById('input-model'); const none = document.querySelector('#row-model .ns-models-none'); return { provider: document.getElementById('row-model').dataset.provider || '', ids: [...s.options].map((o) => o.value), labels: [...s.options].map((o) => o.textContent), value: s.value, selectShown: s.offsetParent !== null && s.getBoundingClientRect().height > 0, line: none && none.offsetParent !== null && none.getBoundingClientRect().height > 0 ? none.textContent : null }; })()`; // judged by LAYOUT, never by a class (this project has no global .hidden — a class alone hides nothing)
  const pickAcct = (id) => evalJs(`(() => { const a = document.getElementById('input-account'); a.value = ${JSON.stringify(id)}; a.dispatchEvent(new Event('change')); return a.value; })()`);
  const shot = async (name) => { if (!process.env.NSD_PNG_DIR) return; const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(process.env.NSD_PNG_DIR, name + '.png'), Buffer.from(r.data, 'base64')); }; // optional evidence (NSD_PNG_DIR)
  {
    await evalJs(`app.hideDialogs(); app.showNewSessionDialog(); document.getElementById('input-backend').value = 'claude'; document.getElementById('input-backend').dispatchEvent(new Event('change')); true`);
    await waitFor(dialogVisible, 5000);
    check('D the account row lists the two third-party accounts', await waitFor(`['acct-lane-ds', 'acct-lane-empty'].every((v) => [...document.querySelectorAll('#input-account option')].some((o) => o.value === v))`, 8000));
    check('D1 on the machine\'s login the menu is claude\'s own list under Anthropic subscription (Default first, Custom… stays)', await waitFor(`(() => { const m = ${menu}; return m.provider === 'pv-anthropic-subscription' && m.ids[0] === '' && m.ids.includes('opus') && m.ids.includes('__custom__') && m.selectShown && m.line === null; })()`, 8000), await evalJs(menu));
    await pickAcct('acct-lane-ds');
    check('D2 THE SWITCH: picking the DeepSeek account REDRAWS the menu to exactly its entered rows (no claude alias, no Custom…), its default selected', await waitFor(`(() => { const m = ${menu}; return m.provider === 'pv-lane-ds' && JSON.stringify(m.ids) === JSON.stringify(['deepseek-chat', 'deepseek-reasoner']) && m.value === 'deepseek-reasoner' && m.selectShown && m.line === null; })()`, 8000), await evalJs(menu));
    check('D2 …each row by the label it was entered with ("DeepSeek Chat")', (await evalJs(menu)).labels[0] === 'DeepSeek Chat', await evalJs(menu));
    await shot('d2-configured');
    await pickAcct('acct-lane-empty');
    check('D3 NONE ⇒ THE ONE LINE: the select is gone and ONE line says "No models configured for this provider — set up"', await waitFor(`(() => { const m = ${menu}; return m.provider === 'pv-lane-empty' && m.line === 'No models configured for this provider — set up' && !m.selectShown; })()`, 8000), await evalJs(menu));
    check('D3 CONTROL: …and there is no menu under the line (the select holds no model at all — never a silent empty menu)', (await evalJs(menu)).ids.length === 0, await evalJs(menu));
    await shot('d3-none-line');
    const argvBeforeD = argvFiles().length;
    await evalJs(`document.getElementById('input-cwd').value = ${JSON.stringify(CWD)}; document.getElementById('input-mode').value = 'chat'; true`);
    await realClick('#dialog-new-session .btn-create');
    await sleep(900);
    const toasts = await evalJs(`[...document.querySelectorAll('#global-toasts .global-toast')].map((x) => x.textContent).join(' | ')`);
    check('D3 Create says why and spawns nothing (the dialog stays open)', argvFiles().length === argvBeforeD && (await evalJs(dialogVisible)) && /provider has no models/.test(toasts), { toasts, argv: argvFiles().length - argvBeforeD });
    check('D4 ONE real click on the line opens that account\'s models (its provider\'s section)', (await realClick('#row-model .ns-models-none')) && await waitFor(`!!document.getElementById('account-models-dialog') && /Models — Empty provider/.test(document.getElementById('account-models-dialog').textContent) && /No models configured for this provider/.test(document.getElementById('account-models-dialog').textContent)`, 6000));
    await evalJs(`document.querySelector('#account-models-dialog .dialog-close').click(); true`);
    check('D4 closing it comes back to the New Session dialog (the menu asked again: still the line — nothing was entered)', await waitFor(`!document.getElementById('account-models-dialog') && (${menu}).line !== null`, 6000) && (await evalJs(dialogVisible)));
    await pickAcct('');
    check('D5 back to Default ⇒ claude\'s list again, the line gone', await waitFor(`(() => { const m = ${menu}; return m.provider === 'pv-anthropic-subscription' && m.ids.includes('opus') && m.selectShown && m.line === null; })()`, 8000), await evalJs(menu));
    await evalJs(`app.hideDialogs(); true`);
  }

  // ═══ E the running badge: THIS conversation's provider's list, per session (the chrome leg of §6 P0c) ═══════════
  console.log('E the mid-session model badge lists the conversation\'s own provider');
  {
    const createOn = async (reqId, accountId) => {
      const before = frames.filter((m) => m?.type === 'created').length;
      liveWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId, ...(accountId ? { accountId } : {}) }));
      for (let i = 0; i < 80; i++) { const made = frames.filter((m) => m?.type === 'created'); if (made.length > before) return made[made.length - 1].sessionId; await sleep(250); }
      return null;
    };
    const sA = await createOn('lane-badge-a', null), sB = await createOn('lane-badge-b', 'acct-lane-ds'), sC = await createOn('lane-badge-c', 'acct-lane-empty');
    check('E three conversations: the machine\'s login, the DeepSeek account, the Empty one', !!sA && !!sB && !!sC, { sA, sB, sC });
    const openBadge = async (sid, label) => {
      await evalJs(`document.querySelectorAll('.chat-status-dropdown').forEach((d) => d.remove()); app.attachSession(${JSON.stringify(sid)}, ${JSON.stringify(label)}, ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); true`);
      await waitFor(`!!document.querySelector('.window-active .chat-view .chat-status-model')`, 20000);
      await evalJs(`document.querySelector('.window-active .chat-view .chat-status-model').click(); true`);
      await waitFor(`(() => { const d = document.querySelector('.window-active .chat-status-dropdown'); return !!d && !/Loading/.test(d.textContent) && d.children.length > 1; })()`, 8000);
      return evalJs(`(() => { const d = document.querySelector('.window-active .chat-status-dropdown'); const h = d.querySelector('.chat-status-provider'); return { head: h ? h.textContent : '', provider: h ? h.dataset.provider : '', models: [...d.querySelectorAll('[data-model]')].map((x) => x.dataset.model), custom: !!d.querySelector('.chat-status-model-custom'), none: d.querySelector('.chat-status-models-none')?.textContent || null }; })()`);
    };
    const a = await openBadge(sA, 'lane badge A');
    check('E1 on the machine\'s login: the badge names Anthropic subscription and lists claude\'s models (+ Custom…)', a.provider === 'pv-anthropic-subscription' && a.models.includes('opus') && a.models.includes('claude-fable-5') && a.custom && a.none === null, a);
    const b = await openBadge(sB, 'lane badge B');
    check('E2 PER SESSION: the DeepSeek conversation\'s badge lists exactly ITS provider\'s rows, under "DeepSeek · Entered by you"', b.provider === 'pv-lane-ds' && JSON.stringify(b.models) === JSON.stringify(['deepseek-chat', 'deepseek-reasoner']) && /^DeepSeek · Entered by you$/.test(b.head) && b.custom, b);
    await shot('e2-badge-deepseek');
    // the pick RE-RESOLVED against the provider: an alias lands on its row; an id it does not serve is refused by name
    const setModels = () => stdinFrames().filter((m) => m.type === 'control_request' && m.request?.subtype === 'set_model').map((m) => m.request.model);
    const customPick = async (text) => {
      await realClick('.window-active .chat-status-model-custom');
      await waitFor(`!!document.activeElement && document.activeElement.tagName === 'INPUT' && !!document.activeElement.closest('.dialog-overlay')`, 4000);
      await cdp('Input.insertText', { text });
      await key('Enter', 'Enter', 13);
    };
    await customPick('fast');
    const sentFast = await (async () => { for (let i = 0; i < 60; i++) { if (setModels().includes('deepseek-chat')) return true; await sleep(150); } return false; })();
    check('E3 Custom… "fast" (the provider\'s alias) ⇒ the CLI is told the ROW\'S id: set_model deepseek-chat', sentFast && !setModels().includes('fast'), setModels());
    await openBadge(sB, 'lane badge B');
    await customPick('gpt-9');
    await sleep(900);
    const t2 = await evalJs(`[...document.querySelectorAll('#global-toasts .global-toast')].map((x) => x.textContent).join(' | ')`);
    check('E4 Custom… "gpt-9" (not served by DeepSeek) ⇒ refused by name, NOTHING sent to the CLI', /DeepSeek does not serve the model “gpt-9”/.test(t2) && !setModels().includes('gpt-9'), { t2, sent: setModels() });
    const c = await openBadge(sC, 'lane badge C');
    check('E5 the Empty conversation\'s badge: ONE line that says so (no model row, never a silent empty list)', c.provider === 'pv-lane-empty' && c.models.length === 0 && c.none === 'No models configured for this provider — set up' && !c.custom, c);
    await shot('e5-badge-none');
    await realClick('.window-active .chat-status-models-none');
    check('E5 …and the line opens that account\'s models', await waitFor(`!!document.getElementById('account-models-dialog') && /Models — Empty provider/.test(document.getElementById('account-models-dialog').textContent)`, 6000));
    await evalJs(`document.querySelector('#account-models-dialog .dialog-close')?.click(); true`);
    for (const s of [sA, sB, sC]) if (s) liveWs.send(JSON.stringify({ type: 'kill', sessionId: s }));
  }

  // ═══ F the rows follow the backend the dialog opens with (lane new-session-account-follows-backend) ═══════════════
  console.log('F the New Session rows follow the backend the dialog opens with');
  const AGY = 'agy-lane-follow', CODEX = 'codex-lane-follow', CLAUDE_ACCTS = ['acct-lane-ds', 'acct-lane-empty'];
  const acctRowJs = `(() => { const s = document.getElementById('input-account'), row = document.getElementById('row-account'); return { shown: row.style.display !== 'none', ids: [...s.options].map((o) => o.value), labels: [...s.options].map((o) => o.textContent), value: s.value }; })()`;
  const rows = async () => ({ backend: await evalJs(`document.getElementById('input-backend').value`), acct: await evalJs(acctRowJs), menu: await evalJs(menu), effortShown: await evalJs(`!document.getElementById('row-effort').classList.contains('hidden')`) });
  const claudeRow = (a) => a.shown && CLAUDE_ACCTS.every((v) => a.ids.includes(v)) && !a.ids.includes(AGY) && !a.ids.includes(CODEX) && a.labels[0] === 'Default (Subscription)' && a.labels[1] === 'Subscription (Pro/Max login)';
  const agyRow = (a) => a.shown && a.ids.includes(AGY) && !CLAUDE_ACCTS.some((v) => a.ids.includes(v)) && !a.ids.includes(CODEX) && a.labels[0] === 'Default (Google login)';
  const claudeMenu = (m) => m.provider === 'pv-anthropic-subscription' && m.ids.includes('opus') && m.selectShown;
  const pickBackend = (b) => evalJs(`(() => { const s = document.getElementById('input-backend'); s.value = ${JSON.stringify(b)}; s.dispatchEvent(new Event('change')); return s.value; })()`);
  // the Create door stubbed IN THE PAGE: the real Create click runs (the cwd check, every row read) and what it would send is recorded
  const stubCreate = () => evalJs(`(() => { window.__nsCreated = []; app.createSession = (o) => { window.__nsCreated.push(JSON.parse(JSON.stringify(o))); }; window.__nsOps = []; const op = window.__vsOp; window.__vsOp = (n, d) => { if (n === 'ns-backend') window.__nsOps.push({ ...d }); return op?.(n, d); }; return true; })()`);
  const createNow = async () => {
    const n = await evalJs('window.__nsCreated.length');
    await evalJs(`document.getElementById('input-cwd').value = ${JSON.stringify(CWD)}; true`);
    await realClick('#dialog-new-session .btn-create');
    await waitFor(`window.__nsCreated.length > ${n} && !(${dialogVisible})`, 6000);
    return evalJs(`window.__nsCreated.length > ${n} ? window.__nsCreated.at(-1) : null`);
  };
  const openNs = async (args = {}) => { await evalJs(`app.hideDialogs(); app.showNewSessionDialog(${JSON.stringify(args)}); true`); await waitFor(dialogVisible, 5000); };
  // the owner's sequence: a conversation on Antigravity, then the next dialog (F1 + F2); the inverse (F3)
  const ownerSequence = async (tag) => {
    const out = {};
    await openNs();
    await pickBackend('antigravity');
    await waitFor(`(${acctRowJs}).ids.includes(${JSON.stringify(AGY)})`, 5000);
    out.f1 = await rows();
    await pickAcct(AGY);
    out.made1 = await createNow();
    await openNs(); // the next dialog: nothing passed, so it opens on the designed default — Claude
    await waitFor(`(() => { const m = ${menu}; return m.provider === 'pv-anthropic-subscription'; })()`, 8000); await sleep(300);
    out.f2 = await rows();
    await evalJs(`document.getElementById('row-account').scrollIntoView({ block: 'center' }); true`);
    await shot('f2-' + tag.replace(/\W+/g, '-')); // the dialog the owner saw (base) / sees now (fix): Backend + Account in view
    out.made2 = await createNow();
    await openNs();
    await pickAcct('acct-lane-ds');
    await waitFor(`(${menu}).provider === 'pv-lane-ds'`, 8000);
    out.made3 = await createNow();
    await openNs({ backend: 'antigravity' }); // an open that names its backend (the `backend` parameter — test-worktree-userchan-ui opens so)
    await sleep(500);
    out.f3 = await rows();
    out.made4 = await createNow();
    console.log(`    [${tag}] ` + JSON.stringify({ f2acct: out.f2.acct.ids, f2value: out.f2.acct.value, made2: out.made2 && { backend: out.made2.backend, accountId: out.made2.accountId || null }, f3acct: out.f3.acct.ids, made4: out.made4 && { backend: out.made4.backend, accountId: out.made4.accountId || null } }));
    return out;
  };
  await stubCreate();
  {
    const o = await ownerSequence('fix');
    check('F1 a pick of Antigravity ⇒ the account row lists ONLY Antigravity\'s (Default (Google login), its signed-in account; no Claude or codex account)', o.f1.backend === 'antigravity' && agyRow(o.f1.acct), o.f1.acct);
    check('F1 Create sends the Antigravity session on the Antigravity account', o.made1?.backend === 'antigravity' && o.made1?.accountId === AGY, o.made1);
    check('F2 THE FINDING: the next dialog opens on Claude AND its account row is Claude\'s (Default (Subscription), the two Claude keys; NO Antigravity account)', o.f2.backend === 'claude' && claudeRow(o.f2.acct), o.f2.acct);
    check('F2 …the DEFAULT account selected (never the previous open\'s Antigravity pick)', o.f2.acct.value === '', o.f2.acct.value);
    check('F2 …and the model menu is Claude\'s (Anthropic subscription, opus among them), the effort row shown — the rows the owner saw right stay right', claudeMenu(o.f2.menu) && o.f2.effortShown, o.f2.menu);
    check('F2 Create sends a Claude session with NO account named (the default) — never the Antigravity account', o.made2?.backend === 'claude' && !o.made2?.accountId, o.made2);
    check('F3 the inverse: Claude on the DeepSeek key, then an open on Antigravity ⇒ Antigravity\'s row, the default selected', o.made3?.backend === 'claude' && o.made3?.accountId === 'acct-lane-ds' && o.f3.backend === 'antigravity' && agyRow(o.f3.acct) && o.f3.acct.value === '', { made3: o.made3, f3: o.f3.acct });
    check('F3 …and its Create names no Claude account', o.made4?.backend === 'antigravity' && !o.made4?.accountId, o.made4);
    await openNs();
    await evalJs(`app.applyBackend('codex', { why: 'lane-test' }); true`);
    await waitFor(`(${menu}).provider !== 'pv-anthropic-subscription' && (${acctRowJs}).labels[0] === 'Default (ChatGPT login)'`, 8000);
    const cx = await rows();
    check('F4 a PROGRAMMATIC applyBackend(\'codex\') refills every derived row: the select, codex\'s account row (Default (ChatGPT login); no Claude or Antigravity account), codex\'s model menu (no opus)', cx.backend === 'codex' && cx.acct.shown && cx.acct.labels[0] === 'Default (ChatGPT login)' && !cx.acct.ids.some((v) => v === AGY || CLAUDE_ACCTS.includes(v)) && !cx.menu.ids.includes('opus') && cx.menu.provider !== 'pv-anthropic-subscription', cx);
    await evalJs(`app.applyBackend('shell', { why: 'lane-test' }); true`);
    const sh = await evalJs(`({ acct: document.getElementById('row-account').style.display, model: document.getElementById('row-model').classList.contains('hidden'), perm: document.getElementById('row-permission').classList.contains('hidden'), profile: document.getElementById('row-browser-profile').style.display })`);
    check('F4 …applyBackend(\'shell\') hides them (no account, model or permission row; no browser profile)', sh.acct === 'none' && sh.model && sh.perm && sh.profile === 'none', sh);
    const ops = await evalJs('window.__nsOps');
    check('F5 every apply names its cause in the op ring (ns-backend: open / pick / the caller\'s word)', ['open', 'pick', 'lane-test'].every((w) => ops.some((x) => x.why === w)) && ops.some((x) => x.backend === 'antigravity' && x.why === 'pick') && ops.some((x) => x.backend === 'codex' && x.why === 'lane-test'), ops);
    await evalJs(`app.applyBackend('claude', { why: 'lane-test' }); app.hideDialogs(); true`);
  }

  // ═══ G … and the machine: the host list lands after the rows were filled ═════════════════════════════════════════
  console.log('G the New Session rows follow the machine the dialog opens on');
  await evalJs(`(() => { if (window.__nsHostsStub) return true; window.__nsHostsStub = true; const f = window.fetch; window.fetch = (u, o) => (String(u) === '/api/hosts' ? Promise.resolve(new Response(JSON.stringify({ hosts: [{ id: 'h-lane', name: 'lanebox', user: 'lane', host: 'lanebox.invalid', transport: 'ssh' }] }), { headers: { 'Content-Type': 'application/json' } })) : f(u, o)); return true; })()`);
  const subLabel = `(() => { const o = [...document.getElementById('input-account').options].find((x) => x.value === 'subscription'); return { host: document.getElementById('input-host').value, label: o ? o.textContent : null }; })()`;
  const machineSequence = async () => {
    await openNs({ hostId: 'h-lane' });
    await waitFor(`(${subLabel}).host === 'h-lane'`, 5000); await sleep(600);
    const g1 = await evalJs(subLabel);
    await openNs();
    await sleep(1500); // the list lands, any probe of the other machine answers
    const g2 = await evalJs(subLabel);
    await evalJs('app.hideDialogs(); true');
    return { g1, g2 };
  };
  {
    const { g1, g2 } = await machineSequence();
    check('G1 an open on a machine ⇒ once its list lands the account row speaks THAT machine ("CLI login @ lanebox (Pro/Max)")', g1.host === 'h-lane' && g1.label === 'CLI login @ lanebox (Pro/Max)', g1);
    check('G2 the next open on this machine ⇒ this machine\'s words ("Subscription (Pro/Max login)")', g2.host === '' && g2.label === 'Subscription (Pro/Max login)', g2);
  }
  check('no page error during the run', pageErrors.length === 0, pageErrors);

  // ═══ RED CONTROL: the base's open order, from a patched copy of today's app.js (one esbuild) ═══════════════════════
  console.log('RED CONTROL — the base\'s open order (a patched copy of today\'s app.js in the throwaway worktree; one esbuild)');
  {
    const A = path.join(wt, 'src/lib/app.js');
    const src = fs.readFileSync(A, 'utf8');
    const EDITS = [
      // the base filled the profile row and the account row from the select's PREVIOUS value, then SET the select (no `change`)
      ["    this.applyBackend(b, { why: 'open' }); // THIS open's backend: the session options, the account row, the profile row, the model menu\n",
        "    this._fillBrowserProfileRow(document.getElementById('input-task')?.value || ''); updateAcctRow(); document.getElementById('input-backend').value = b; this._applySessionBackendOptions(b, { applyDefaults: true });\n"],
      ["    if (hostSel) hostSel.value = hostId || '';\n", ''], // the base set the machine only when the list landed…
      ["        if (hostSel.value !== was) this._refillNewSessionRows(); // the machine landed only now — a programmatic set fires no `change`\n", ''], // …and its rows never followed
    ];
    check('the three edits the control makes are each spelled exactly once in app.js', EDITS.every(([a]) => src.split(a).length === 2), EDITS.map(([a]) => src.split(a).length - 1));
    fs.writeFileSync(A, EDITS.reduce((x, [a, b]) => x.replace(a, b), src));
    const esbuild = path.join(repo, 'node_modules', '.bin', 'esbuild');
    const rebuild = () => execFileSync(esbuild, ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify', '--log-level=error'], { cwd: wt, stdio: 'ignore' });
    const reboot = async () => { await cdp('Page.reload', { ignoreCache: true }); await sleep(500); await waitApp(); await sleep(600); await stubCreate(); };
    rebuild();
    await reboot();
    const o = await ownerSequence('base');
    check('CONTROL F2 the base: the next dialog says Claude but its account row is STILL Antigravity\'s (the incident)', o.f2.backend === 'claude' && agyRow(o.f2.acct) && !claudeRow(o.f2.acct), o.f2.acct);
    check('CONTROL F2 the base: its Create sends a CLAUDE session naming the ANTIGRAVITY account', o.made2?.backend === 'claude' && o.made2?.accountId === AGY, o.made2);
    check('CONTROL F3 the base: an open on Antigravity after Claude keeps Claude\'s row and its DeepSeek pick', o.f3.backend === 'antigravity' && !agyRow(o.f3.acct) && o.made4?.accountId === 'acct-lane-ds', { f3: o.f3.acct, made4: o.made4 });
    await evalJs(`app.applyBackend('claude', { why: 'lane-test' }); app.hideDialogs(); true`); // the machine alone differs (as in G)
    await evalJs(`(() => { const f = window.fetch; window.fetch = (u, x) => (String(u) === '/api/hosts' ? Promise.resolve(new Response(JSON.stringify({ hosts: [{ id: 'h-lane', name: 'lanebox', user: 'lane', host: 'lanebox.invalid', transport: 'ssh' }] }), { headers: { 'Content-Type': 'application/json' } })) : f(u, x)); return true; })()`);
    const g = await machineSequence();
    check('CONTROL G1 the base: an open on a machine keeps THIS machine\'s words after the list lands', g.g1.host === 'h-lane' && g.g1.label === 'Subscription (Pro/Max login)', g.g1);
    fs.writeFileSync(A, src);
    fs.copyFileSync(path.join(repo, 'public', 'bundle.js'), path.join(wt, 'public', 'bundle.js'));
    await reboot();
    const back = await ownerSequence('fix again');
    check('the real bundle back: F2 green again — Claude\'s row, the default, a Create naming no account (the fix, not the reload)', back.f2.backend === 'claude' && claudeRow(back.f2.acct) && back.f2.acct.value === '' && back.made2?.backend === 'claude' && !back.made2?.accountId, { acct: back.f2.acct, made2: back.made2 });
  }
  try { liveWs.send(JSON.stringify({ type: 'kill', sessionId: sid })); liveWs.close(); } catch {}
} catch (e) {
  failed++;
  console.error('✗ suite threw: ' + (e && e.stack || e));
}
console.log(`\n${failed ? `${failed} FAILED (${passed} passed)` : `ALL PASS (${passed})`}`);
cleanup();
process.exit(failed ? 1 : 0);
