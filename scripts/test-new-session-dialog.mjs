#!/usr/bin/env node
// LANE L ON A REAL PAGE — first-run friction the naive-user study 2 found
// (2026-09-25, SharedContext/vibespace-naive-study-2-collab-20260925.md), each
// leg against a worktree server, a stub `claude` behind the REAL chat-wrapper,
// and headless chrome over raw CDP (test-inbox-reply-ui's skeleton). No vendor
// call: the stub answers every turn itself.
//
//   A  the New Session dialog
//     A1 opening it twice never carries the name ("S11 chromeS12 first…"); the
//        folder never carries either (lane door-day-one-landing — the naive-user
//        studies: a later dialog pre-filled the PREVIOUS area's folder; testers
//        retyped it 5/5 and 3/3 times) — the field reopens EMPTY
//     A1b the folder chips: the home's folder WITH files first («work (3 files)»),
//        then «the last one you used»; a chip fills the field
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
//   H  THE NEW SESSION FORM IN TWO COLUMNS (lane new-session-form — the owner accepted POC v2.2, 2026-10-23): H1 both columns
//      (built-in rows locked on; the name above the folder), H2 the header's kind switch Agent | Terminal (no Browser kind;
//      the Mode row gone; a plain shell has no Agent), H3 the 可用工具 row per backend by REAL clicks (Claude's chips — Bash
//      never ✗; Codex's sandbox + approval at the mode's default; none for a plain shell), H4 THE FOLD BY DATA (no machine
//      used ⇒ folded; two accounts ⇒ the account row stands; a git folder ⇒ the worktree tick; a paired machine used two days
//      ago ⇒ the machine row; the footer's chips with a folded one dashed; a chip opens its row; the toggle is remembered),
//      H5 several Task Groups in the order picked, H6 only the browser profiles the picked groups ADMIT (the server's
//      mayAttach), H7 Create sends taskIds + the tools pick (the name = the folder's), H8 the refusal in words before Create,
//      H9 a REAL create: the spawn's --allowedTools / --disallowedTools, and the ticked fake account holds ONE access row
//      {agent: that conversation, draft} once its id exists (the tools pick latched as its config), 无 | 已选 | 全部, H10 the
//      phone stacks LEFT then RIGHT
//   K  THE v3 FORM (lane new-session-layout-v3-build — the owner nodded the POC 2026-10-23): K1 the LEFT order (name → 任务组
//      → folder → backend → model·effort → permission → tools → more) and Agent | Terminal at the header's right; K2 the 任务组
//      row none / one / two (its sentence; the chips keyed and patched in place) and the right column's 「会话」 READING it (no
//      picker there; «Change on the left ↖»); K3 Terminal = a login shell (the backend card not drawn, the fold = the
//      machine, the right column 「会话」 + one sentence, Create opens a shell); K4 the harness's own terminal UI = the fold's
//      tick (default folded; ticked ⇒ mode terminal; the Settings default ticks + unfolds it); K5 the removals; K6 频道's
//      ticks with a group grant's 除了; K7 zh / ja; K8 THE PHONE at 390×844 (a full-screen sheet with the header and the footer
//      fixed, the footer's chips on their own wrapping row above the buttons (P1-5), the right column an accordion with summaries, the picker a bottom sheet, the census — no
//      input under 16 px / 42 px, no tap target under 32 px — with planted RED controls, the list in the flow, the backend a
//      native select)
//   I  A PAIRED MACHINE THAT CANNOT BE REACHED (lane hub-dies-dead-ssh-host — the .346 verify round's HIGH: picking it
//      killed the hub): a machine record added over the API (my-mac @ mac.example.test) and a stub `ssh` first on the
//      server's PATH that exits 255 at once (never a real machine). I1 picked in the host row ⇒ the folder field's own
//      line says «my-mac cannot be reached — use a path on this machine or try again later» (state `unreachable`), its
//      list offers nothing there; I2 the footer refuses Create with the same words; I3 typing on spawns nothing; the rung asks ONE
//      ssh for the whole walk (the verdict kept a minute); I4 back to This machine ⇒ the field is usable again; I5 the hub
//      answers the next request; I6 (ci-355-red — the 2.369.355 runner's I1/I2 red, both tries) the machine picked while the
//      dialog's machine list is STILL IN FLIGHT stays picked when the list lands: CDP Fetch holds GET /api/hosts until after the
//      pick and the machine's own answers (recent-cwds / dir-complete) until after the landing — the slow runner's order, every run
//   RED CONTROL = the base's open order (the account row filled from the select's previous value, then a programmatic
//      set; the machine set only when the list lands), rebuilt from a PATCHED COPY of today's app.js in the throwaway
//      worktree (one esbuild — never the repository's history): F2 / F3 / G1 red; the real bundle back ⇒ F2 green; the same
//      copy's landing puts the open's machine back (the .355 line) ⇒ I6 red: the pick becomes This machine, «Choose a folder first»
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
const sshDir = scratch('new-session-dialog-ssh'); // I: a stub ssh for a machine that cannot be reached (never a real one)
fs.rmSync(sshDir, { recursive: true, force: true }); fs.mkdirSync(sshDir, { recursive: true });
const SSH_CALLS = path.join(sshDir, 'calls.log');
fs.writeFileSync(path.join(sshDir, 'ssh'), `#!/bin/sh\nfor a; do last="$a"; done\necho "\${last%%[[:space:]]*}" >> '${SSH_CALLS}'\necho "ssh: Could not resolve hostname mac.example.test: Name or service not known" >&2\nexit 255\n`, { mode: 0o755 });
const sshLines = () => { try { return fs.readFileSync(SSH_CALLS, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
const sshCalls = () => sshLines().length; // each line = the remote command's first word (`true` = the reachability probe)
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
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1' /* H: the fake channel accounts the form's 「账号 · 以你的身份」 lists */, PATH: `${sshDir}:${process.env.PATH}` /* I: the stub ssh */ }, stdio: 'ignore' });
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
    fs.mkdirSync(path.join(fakeHome, 'work'), { recursive: true });   // A1b: the person's files (before the first open — the hub keeps its answer 10 s)
    for (const f of ['a.txt', 'b.txt', 'c.txt']) fs.writeFileSync(path.join(fakeHome, 'work', f), 'x');
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
    check('THE FINDING (lane door-day-one-landing): the folder typed last time is NOT carried — the field reopens EMPTY', (await evalJs(`document.getElementById('input-cwd').value`)) === '', await evalJs(`document.getElementById('input-cwd').value`));
  }

  console.log('A1b the folder chips');
  {
    await waitFor(`[...document.querySelectorAll('#cwd-recent .cwd-recent-chip')].some((c) => c.dataset.kind === 'files')`, 8000);
    const chips = await evalJs(`[...document.querySelectorAll('#cwd-recent .cwd-recent-chip')].map((c) => ({ kind: c.dataset.kind, text: c.textContent, path: c.dataset.path }))`);
    const work = (chips || []).find((c) => c.path === path.join(fakeHome, 'work'));
    check('the home\u2019s folder with files is a chip: «work (3 files)»', !!work && work.kind === 'files' && work.text === 'work (3 files)', chips);
    // lane new-session-group-folder-link: ONE row — the name typed above (A1) gives its 由名字 chip first, then the day-one chips
    const day = (chips || []).filter((c) => c.kind !== 'name');
    check('… the folders WITH files lead the day-one chips', day.findIndex((c) => c.kind !== 'files') > day.findIndex((c) => c.kind === 'files'), chips && chips.map((c) => c.kind));
    check('… after the name\u2019s own chip (the name typed above: ~/S12 first (example.com))', !!chips && chips[0].kind === 'name' && chips[0].path === path.join(fakeHome, 'S12 first (example.com)') && chips.filter((c) => c.kind === 'name').length === 1, chips && chips.slice(0, 2));
    await evalJs(`document.querySelector('#cwd-recent .cwd-recent-chip[data-path=' + JSON.stringify(${JSON.stringify(path.join(fakeHome, 'work'))}) + ']').click(); true`);
    check('a chip fills the field', (await evalJs(`document.getElementById('input-cwd').value`)) === path.join(fakeHome, 'work'));
    await evalJs(`document.getElementById('input-cwd').value = ''; true`);
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
    // lane path-field: the list is THE path field's (src/lib/path-field.js) — the input names it (aria-controls)
    const LIST = `document.getElementById(document.getElementById('input-cwd').getAttribute('aria-controls'))`;
    const shown = await waitFor(`(() => { const l = ${LIST}; return !!l && !l.hidden && l.querySelectorAll('.pf-item').length > 0; })()`, 5000);
    check('typing a path opens the suggestion list', shown);
    await escape();
    await sleep(250);
    check('THE FINDING: Escape hides the list …', await evalJs(`(() => { const l = ${LIST}; return !l || l.hidden; })()`));
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
  // I6 (ci-355-red): the machine picked while the dialog's machine list is in flight. The runner's order, made deterministic —
  // CDP Fetch holds GET /api/hosts until AFTER the pick (and the press on the folder field), and the machine's own answers
  // (recent-cwds / dir-complete) until AFTER the list landed; the base's landing put the open's machine (This machine) back
  const heldPick = async (hid, words) => {
    const held = { list: [], verdict: [] }, order = [];
    const onPaused = (d) => {
      const m = JSON.parse(d); if (m.method !== 'Fetch.requestPaused') return;
      const u = new URL(m.params.request.url).pathname, id = m.params.requestId;
      if (u === '/api/hosts' && m.params.request.method === 'GET') { held.list.push(id); order.push('list'); }
      else if (/^\/api\/hosts\/[^/]+\/(recent-cwds|dir-complete)$/.test(u)) { held.verdict.push(id); order.push('verdict'); }
      else cdp('Fetch.continueRequest', { requestId: id }).catch(() => {});
    };
    const release = async (ids) => { for (const id of ids.splice(0)) await cdp('Fetch.continueRequest', { requestId: id }).catch(() => {}); };
    sock.on('message', onPaused);
    await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/hosts*', requestStage: 'Request' }] });
    try {
      await evalJs('app._nsHosts = null; true'); // the landing's own record (an earlier open left one)
      await openNs();
      const t0 = Date.now(); while (!held.list.length && Date.now() - t0 < 5000) await sleep(20);
      await evalJs(`(() => { const s = document.getElementById('input-host'); if (![...s.options].some((o) => o.value === ${JSON.stringify(hid)})) s.add(new Option('my-mac (me@mac.example.test)', ${JSON.stringify(hid)})); s.value = ${JSON.stringify(hid)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await realClick('#input-cwd'); await sleep(300);
      const premise = { listHeld: held.list.length, landedBeforePick: await evalJs(`(app._nsHosts || []).some((h) => h.id === ${JSON.stringify(hid)})`) };
      await release(held.list);
      const landed = await waitFor(`(app._nsHosts || []).some((h) => h.id === ${JSON.stringify(hid)})`, 5000);
      await sleep(200); await release(held.verdict);
      await cdp('Fetch.disable'); await release(held.verdict);
      const said = await waitFor(`(document.querySelector('#input-cwd').closest('[data-state]')?.dataset.state === 'unreachable') && (document.querySelector('#input-cwd').closest('[data-state]').querySelector('.pf-under')?.textContent || '').includes(${JSON.stringify(words)})`, 6000);
      const foot = await evalJs(`document.getElementById('ns-foot-info').innerText`);
      const host = await evalJs(`document.getElementById('input-host').value`);
      return { premise: { ...premise, landed, order: [...new Set(order)] }, said, host: host === hid ? 'my-mac' : (host || 'This machine'), foot };
    } finally { sock.off('message', onPaused); await cdp('Fetch.disable').catch(() => {}); }
  };
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

  // ═══ H THE NEW SESSION FORM IN TWO COLUMNS (lane new-session-form; the owner accepted POC v2.2) ═══════════════════
  console.log('H the New Session form in two columns: the fold, the chips, the groups, the tools, the profiles, the ticks');
  {
    const api = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); try { return await r.json(); } catch { return null; } };
    // the data the form reads: two Task Groups, a profile kept to one of them + one for everyone, a git folder, the fake channel accounts
    const gIR = (await api('POST', '/api/tasks', { title: 'Investor relations', folders: [path.join(fakeHome, 'work')] }))?.task?.id;
    const gPay = (await api('POST', '/api/tasks', { title: 'Payments', folders: [] }))?.task?.id;
    const pIR = (await api('POST', '/api/browser/profiles', { label: 'IR portal', use: { mode: 'only', who: [{ kind: 'task', id: gIR }] } }))?.profile?.id;
    const pAll = (await api('POST', '/api/browser/profiles', { label: 'Everyday' }))?.profile?.id;
    const REPO_DIR = path.join(fakeHome, 'repo'); fs.mkdirSync(REPO_DIR, { recursive: true }); execSync('git init -q', { cwd: REPO_DIR });
    check('H0 the fixtures: two Task Groups, a profile kept to one group + one for every conversation', !!gIR && !!gPay && !!pIR && !!pAll, { gIR, gPay, pIR, pAll });
    await waitFor(`!!app.sidebar._taskById(${JSON.stringify(gIR)}) && !!app.sidebar._taskById(${JSON.stringify(gPay)}) && (app._browserProfiles?.profiles || []).some((p) => p.id === ${JSON.stringify(pIR)})`, 10000);
    await stubCreate();
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
    await openNs();
    await sleep(800);
    const where = (id) => evalJs(`(() => { const r = document.getElementById(${JSON.stringify(id)}); return r ? (r.closest('#ns-more-body') ? 'fold' : r.closest('#ns-card-where') ? 'where' : r.closest('#ns-card-backend') ? 'backend' : r.closest('#ns-right') ? 'right' : 'elsewhere') : null; })()`);
    // H1 both columns
    const cols = await evalJs(`(() => { const L = document.querySelector('#dialog-new-session .ns-left').getBoundingClientRect(), R = document.getElementById('ns-right').getBoundingClientRect(), d = document.getElementById('dialog-new-session').getBoundingClientRect(); return { L: [L.left, L.right, L.top], R: [R.left, R.right, R.top], dw: d.width, grid: getComputedStyle(document.querySelector('#dialog-new-session .ns-cols')).display, heads: [...document.querySelectorAll('#dialog-new-session .ns-col-h b')].map((b) => b.textContent), cards: [...document.querySelectorAll('#ns-right .ns-card-h')].map((h) => h.textContent.trim()) }; })()`);
    check('H1 two columns at 1280 px: LEFT «Where and how it runs» beside RIGHT «What it may use»', cols.grid === 'grid' && cols.R[0] >= cols.L[1] - 1 && Math.abs(cols.R[2] - cols.L[2]) < 40 && cols.heads[0] === 'Where and how it runs' && cols.heads[1] === 'What it may use', cols);
    check('H1 the right column: built-in (always on) · VibeSpace — v3: no separate «Accounts · as you» card, no MCP empty row', cols.cards.length === 2 && ['Built in · always on', 'VibeSpace'].every((h, i) => (cols.cards[i] || '').startsWith(h)), cols.cards);
    const order = await evalJs(`[...document.querySelectorAll('#ns-card-where > label')].map((l) => l.id).filter((id) => id !== 'row-host')`);
    check('H1 会话名称 sits above 工作目录 (the name first)', order[0] === 'row-session-name' && order[1] === 'row-cwd', order);
    const builtins = await evalJs(`[...document.querySelectorAll('#ns-right [data-builtin]')].map((r) => r.dataset.builtin + ':' + r.classList.contains('locked') + ':' + !!r.querySelector('.ns-on'))`);
    check('H1 built-in rows are locked on: Artifacts · Feedback · Page publishing', builtins.join() === 'artifacts:true:true,feedback:true:true,pages:true:true', builtins);
    // H2 the kind switch (Agent | Terminal) — it replaces the Mode row; a plain shell has no Agent
    const kind = () => evalJs(`({ mode: document.getElementById('input-mode').value, backend: document.getElementById('input-backend').value, on: [...document.querySelectorAll('#ns-kind-seg button')].filter((b) => b.classList.contains('on')).map((b) => b.dataset.kind), agentDisabled: document.querySelector('#ns-kind-seg [data-kind="chat"]').disabled, rowMode: getComputedStyle(document.getElementById('row-mode')).display, kinds: [...document.querySelectorAll('#ns-kind-seg button')].map((b) => b.dataset.kind) })`);
    const k0 = await kind();
    check('H2 the header\'s kind switch: Agent | Terminal (no «Browser»: no New Session road to a browser-only session), Agent on, the Mode row gone', k0.mode === 'chat' && k0.on.join() === 'chat' && k0.kinds.join() === 'chat,terminal' && k0.rowMode === 'none', k0);
    await evalJs(`document.getElementById('input-cwd').value = ${JSON.stringify(CWD)}; document.getElementById('input-cwd').dispatchEvent(new Event('input')); true`);   // a folder: the footer shows the run's chips, not the refusal
    await realClick('#ns-kind-seg [data-kind="terminal"]');
    const k1 = await kind();
    check('H2 one real click on Terminal ⇒ a login shell (v3: Terminal = no harness — the backing select holds the shell), mode terminal, the footer says «Terminal · login shell»', k1.mode === 'terminal' && k1.on.join() === 'terminal' && k1.backend === 'shell' && /Terminal · login shell/.test(await evalJs(`document.querySelector('#ns-foot-info [data-chip="backend"]')?.textContent || ''`)), k1);
    await realClick('#ns-kind-seg [data-kind="chat"]');
    check('H2 …and Agent brings the harness back (Claude)', (await kind()).backend === 'claude', await kind());
    // H3 the 可用工具 row per backend
    const tools = () => evalJs(`(() => { const r = document.getElementById('row-tools'); return { shown: !r.classList.contains('hidden') && r.offsetParent !== null, kind: r.dataset.kind, chips: [...r.querySelectorAll('[data-tool]')].map((c) => c.dataset.tool), keep: [...r.querySelectorAll('[data-tool]')].filter((c) => c.querySelector('.ns-keep')).map((c) => c.dataset.tool), codex: [...r.querySelectorAll('[data-codex]')].map((b) => b.dataset.codex + '=' + b.dataset.v + (b.classList.contains('on') ? '*' : '')), flags: document.getElementById('ns-tool-flags')?.textContent || '' }; })()`);
    const t0 = await tools();
    check('H3 Claude: the 可用工具 row with the harness\'s own tool chips; Bash marked as kept', t0.shown && t0.kind === 'tools' && t0.chips.join() === 'Read,Edit,Write,Bash,Glob,Grep,WebFetch,WebSearch,NotebookEdit' && t0.keep.join() === 'Bash', t0);
    await realClick('#row-tools [data-tool="Read"]');
    await realClick('#row-tools [data-tool="WebFetch"]'); await realClick('#row-tools [data-tool="WebFetch"]');
    await realClick('#row-tools [data-tool="Bash"]'); await realClick('#row-tools [data-tool="Bash"]');
    const t1 = await tools();
    check('H3 real clicks: ✓ Read, ✗ WebFetch, and Bash goes ✓ → default (never ✗) — the line shows the command line', /--allowedTools Read --disallowedTools WebFetch/.test(t1.flags) && JSON.stringify(await evalJs('app._nsToolPick()')) === JSON.stringify({ allow: ['Read'], deny: ['WebFetch'] }), t1);
    await pickBackend('codex'); await sleep(300);
    const t2 = await tools();
    check('H3 Codex: sandbox + approval, the permission mode\'s default marked on', t2.shown && t2.kind === 'sandbox' && t2.codex.includes('sandbox=workspace-write*') && t2.codex.includes('approval=on-request*') && /--sandbox workspace-write/.test(t2.flags), t2);
    await realClick('#ns-kind-seg [data-kind="terminal"]'); await sleep(300);
    const t3 = await tools(); const k3 = await kind();
    check('H3 Terminal (a login shell): no 可用工具 row, Terminal on (v3: the Agent door stays pressable — it brings the harness back)', !t3.shown && !k3.agentDisabled && k3.mode === 'terminal' && k3.on.join() === 'terminal', { t3, k3 });
    await realClick('#ns-kind-seg [data-kind="chat"]'); await sleep(300);
    check('H3 Agent after Codex → Terminal ⇒ Codex again (the harness picked is kept for the way back)', (await kind()).backend === 'codex', await kind());
    await pickBackend('claude'); await sleep(300);
    check('H3 back to Claude: the pick made on Claude is still the one shown', JSON.stringify(await evalJs('app._nsToolPick()')) === JSON.stringify({ allow: ['Read'], deny: ['WebFetch'] }));
    // H4 the fold, by the person's own data
    const fold0 = { host: await where('row-host'), account: await where('row-account'), args: await where('row-extra-args'), worktree: await where('row-worktree'), names: await evalJs(`document.getElementById('ns-more-names').textContent`), note: await evalJs(`document.querySelector('#row-account .ns-auto-note')?.textContent || ''`) };
    check('H4 no machine used lately ⇒ the machine row folds; the arguments and the worktree tick (no git folder) fold too', fold0.host === 'fold' && fold0.args === 'fold' && fold0.worktree === 'fold' && /Machine/.test(fold0.names), fold0);
    check('H4 two accounts for Claude (this instance\'s) ⇒ the account row stands in its card and says why', fold0.account === 'backend' && /you have 2 accounts/.test(fold0.note), fold0);
    await evalJs(`document.getElementById('input-cwd').value = ${JSON.stringify(REPO_DIR)}; document.getElementById('input-cwd').dispatchEvent(new Event('input')); document.getElementById('input-cwd').dispatchEvent(new Event('blur')); true`);
    await waitFor(`!!document.getElementById('row-worktree').closest('#ns-card-backend')`, 6000);
    check('H4 a git folder ⇒ the worktree tick unfolds by itself ("this folder is a git repository")', await where('row-worktree') === 'backend' && /git repository/.test(await evalJs(`document.querySelector('#row-worktree .ns-auto-note')?.textContent || ''`)));
    check('H4 the name\'s placeholder is the folder\'s own name', await evalJs(`document.getElementById('input-session-name').placeholder`) === 'repo');
    await evalJs(`app.sidebar._allSessions.push({ sessionId: 'lane-h-remote', host: 'h-lane', startedAt: Date.now() - 2 * 86400000, mode: 'chat' }); app._nsRender(); true`);
    const hostUp = await where('row-host');
    await evalJs(`app.sidebar._allSessions = app.sidebar._allSessions.filter((s) => s.sessionId !== 'lane-h-remote'); app._nsRender(); true`);
    check('H4 a paired machine used two days ago ⇒ the machine row unfolds by itself; without it, it folds again', hostUp === 'where' && await where('row-host') === 'fold', hostUp);
    const chips = await evalJs(`[...document.querySelectorAll('#ns-foot-info [data-chip]')].map((c) => c.dataset.chip + (c.classList.contains('folded') ? '~' : ''))`);
    check('H4 the footer\'s chips carry every value — a folded row\'s chip dashed, never hidden', ['backend', 'model', 'permission', 'tools', 'host~', 'account'].every((c) => chips.includes(c)), chips);
    await evalJs(`localStorage.setItem('vs.newSession.moreOpen', '0'); document.getElementById('ns-more-toggle').setAttribute('aria-expanded', 'false'); true`);
    await realClick('#ns-foot-info [data-chip="host"]');
    await sleep(300);
    check('H4 one real click on the folded «This machine» chip opens the fold and focuses the machine row', await evalJs(`document.getElementById('ns-more-toggle').getAttribute('aria-expanded') === 'true' && document.activeElement?.id === 'input-host'`));
    await openNs(); await sleep(300);
    const closedAgain = await evalJs(`document.getElementById('ns-more-toggle').getAttribute('aria-expanded') === 'false'`);
    await realClick('#ns-more-toggle');
    await openNs(); await sleep(300);
    check('H4 the fold\'s open state is remembered on this device: a chip\'s peek is not, the toggle is (the next open: still open)', closedAgain && await evalJs(`document.getElementById('ns-more-toggle').getAttribute('aria-expanded') === 'true' && localStorage.getItem('vs.newSession.moreOpen') === '1'`));
    await realClick('#ns-more-toggle');
    // H5 several Task Groups, in the order picked
    await realClick('#row-task-groups [data-tg-add]'); await sleep(200);
    await realClick(`.ns-tg-menu [data-tg="${gPay}"]`); await sleep(150);
    await realClick(`.ns-tg-menu [data-tg="${gIR}"]`); await sleep(300);
    await evalJs(`document.querySelectorAll('.ns-tg-menu, .ns-tg-scrim').forEach((m) => m.remove()); true`);
    const tg = await evalJs(`[...document.querySelectorAll('#row-task-groups .ns-tg-chip')].map((c) => c.querySelector('.ns-tg-n').textContent + ' ' + c.querySelector('.ns-tg-name').textContent)`);
    check('H5 real clicks pick two Task Groups (v3: on the LEFT, under the name); the chips show the order picked', tg.join(' | ') === '1 Payments | 2 Investor relations', tg);
    const reach = await evalJs(`[...document.querySelectorAll('#ns-right [data-row="sessions"] .ns-pv-via')].map((x) => x.textContent)`);
    check('H5 the sessions row READS the left: one sentence naming both groups (v3)', reach.length === 1 && /^Joined “Payments”, “Investor relations” — can see and message/.test(reach[0]), reach);
    // H6 the profiles the picked groups admit (the server's mayAttach)
    const profs = () => evalJs(`({ opts: [...document.querySelectorAll('#input-browser-profile option')].map((o) => o.value), line: document.querySelector('#ns-right [data-row="bprof"] .ns-pv-via')?.textContent || '' })`);
    await waitFor(`[...document.querySelectorAll('#input-browser-profile option')].some((o) => o.value === ${JSON.stringify(pIR)})`, 6000);
    const pWith = await profs();
    await realClick(`#row-task-groups .ns-tg-chip[data-tg-chip="${gIR}"] [data-tg-x]`);
    await waitFor(`![...document.querySelectorAll('#input-browser-profile option')].some((o) => o.value === ${JSON.stringify(pIR)})`, 6000);
    const pWithout = await profs();
    check('H6 with «Investor relations» picked the profile kept to it is offered; without it, it is not — and the row says one more is not open to it', pWith.opts.includes(pIR) && pWith.opts.includes(pAll) && !pWithout.opts.includes(pIR) && pWithout.opts.includes(pAll) && /1 more are not open to it/.test(pWithout.line), { pWith, pWithout });
    // H7 Create sends the groups in order + the tools pick; an empty name is the folder's own (every open starts on the harness's own tools: pick again)
    await realClick('#row-tools [data-tool="Read"]');
    await realClick('#row-tools [data-tool="WebFetch"]'); await realClick('#row-tools [data-tool="WebFetch"]');
    await evalJs(`document.getElementById('input-session-name').value = ''; document.getElementById('input-cwd').value = ${JSON.stringify(CWD)}; true`);
    const n0 = await evalJs('window.__nsCreated.length');
    await realClick('#dialog-new-session .btn-create');
    await waitFor(`window.__nsCreated.length > ${n0}`, 6000);
    const made = await evalJs(`window.__nsCreated.at(-1)`);
    check('H7 Create sends taskIds in the order picked (taskId = the first, for older servers) and the 可用工具 pick', JSON.stringify(made?.taskIds) === JSON.stringify([gPay]) && made?.taskId === gPay && JSON.stringify(made?.tools) === JSON.stringify({ allow: ['Read'], deny: ['WebFetch'] }), made && { taskIds: made.taskIds, taskId: made.taskId, tools: made.tools });
    check('H7 an empty name is the chosen folder\'s own name (the placeholder said so)', made?.name === path.basename(CWD), made?.name);
    // H8 the refusal in words BEFORE Create
    await openNs(); await sleep(300);
    const refuse = await evalJs(`document.getElementById('ns-foot-info').innerText`);
    const n1 = await evalJs('window.__nsCreated.length');
    await realClick('#dialog-new-session .btn-create'); await sleep(900);
    check('H8 an empty folder: the footer says «Cannot create yet: Choose a folder first», and Create sends nothing', /Cannot create yet: Choose a folder first/.test(refuse) && await evalJs('window.__nsCreated.length') === n1 && await evalJs(dialogVisible), refuse);
    await evalJs(`document.getElementById('input-cwd').value = ${JSON.stringify(CWD)}; document.getElementById('input-cwd').dispatchEvent(new Event('input')); true`);
    check('H8 a folder typed ⇒ the refusal gives way to the run\'s chips', !/Cannot create yet/.test(await evalJs(`document.getElementById('ns-foot-info').innerText`)));
    // H9 a ticked account becomes ONE access row once the conversation's id exists (a REAL create through the stub claude)
    await evalJs('delete app.createSession; true');
    await waitFor(`!!document.querySelector('#ns-right input[data-acc="fake-poll"]')`, 8000);
    const acc0 = await evalJs(`document.querySelector('#ns-right input[data-acc="fake-poll"]').checked`);
    await realClick('#ns-right input[data-acc="fake-poll"]'); await sleep(200);
    const tick = await evalJs(`({ ticks: app._nsChannelTicks().map((x) => x.id), inChan: !!document.querySelector('#ns-right [data-row="chan"] [data-acc-row="fake-poll"]'), words: document.querySelector('#ns-right [data-acc-row="fake-poll"] .ns-pv-via')?.textContent || '' })`);
    check('H9 the fake account is unticked by default; one real click ticks it (one tick per account, inside 频道 — v3) and says what create will write', !acc0 && tick.ticks.join() === 'fake-poll' && tick.inChan && /Written into the channel assignment at create/.test(tick.words), tick);
    await realClick('#row-tools [data-tool="Read"]');
    await realClick('#row-tools [data-tool="WebFetch"]'); await realClick('#row-tools [data-tool="WebFetch"]');
    const winsBefore = await evalJs(`JSON.stringify([...app.sessions.keys()])`);
    const argvBefore = new Set(argvFiles().map((a) => a.f));
    await evalJs(`document.getElementById('input-session-name').value = 'lane H real'; true`);
    await realClick('#dialog-new-session .btn-create');
    let spawned = null;
    for (let i = 0; i < 80 && !spawned; i++) { spawned = argvFiles().find((a) => !argvBefore.has(a.f)) || null; if (!spawned) await sleep(250); }
    const SID = spawned ? '0e1a0000-0000-4000-8000-' + spawned.f.replace(/^argv-|\.json$/g, '').padStart(12, '0') : null;
    const ai = spawned ? spawned.argv.indexOf('--allowedTools') : -1;
    check('H9 the real spawn carries --allowedTools Read --disallowedTools WebFetch', ai >= 0 && spawned.argv[ai + 1] === 'Read' && spawned.argv[ai + 2] === '--disallowedTools' && spawned.argv[ai + 3] === 'WebFetch', spawned && spawned.argv.join(' '));
    let row = null;
    for (let i = 0; i < 60 && !row; i++) { const v = await api('GET', '/api/channels/adapters/fake-poll/view'); row = (v?.adapter?.accountGrain?.access || []).find((r) => r.principal?.kind === 'agent') || null; if (!row) await sleep(500); }
    check('H9 …and once the conversation\'s own id exists, the ticked account holds ONE access row {agent: that conversation, draft} — the Channels window\'s own store', !!row && row.principal.id === SID && row.authority === 'draft', { row, SID });
    const cfg = await evalJs(`JSON.stringify(app.sidebar.getSessionConfig({ backend: 'claude', backendSessionId: ${JSON.stringify(SID)} }))`);
    check('H9 the 可用工具 pick became the conversation\'s own config (a resume re-passes it)', JSON.parse(cfg || '{}').tools && JSON.stringify(JSON.parse(cfg).tools) === JSON.stringify({ allow: ['Read'], deny: ['WebFetch'] }), cfg);
    await evalJs(`(() => { const was = new Set(${winsBefore}); for (const [w, v] of app.sessions) if (!was.has(w) && v?.sessionId) { try { app.killSession(v.sessionId); } catch {} } return true; })()`);
    await stubCreate();
    // H10 the phone stacks LEFT then RIGHT; the kind switch is a full-width row
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await openNs(); await sleep(500);
    const phone = await evalJs(`(() => { const L = document.querySelector('#dialog-new-session .ns-left').getBoundingClientRect(), R = document.getElementById('ns-right').getBoundingClientRect(), H = document.querySelector('#dialog-new-session .ns-head').getBoundingClientRect(), K = document.getElementById('ns-kind-seg').getBoundingClientRect(); return { L: [Math.round(L.left), Math.round(L.width), Math.round(L.bottom)], R: [Math.round(R.left), Math.round(R.width), Math.round(R.top)], K: [Math.round(K.width), Math.round(H.width)], grid: getComputedStyle(document.querySelector('#dialog-new-session .ns-cols')).display }; })()`);
    check('H10 the phone: LEFT above RIGHT, one width; the kind switch spans the header', phone.grid !== 'grid' && phone.R[2] >= phone.L[2] - 1 && Math.abs(phone.L[0] - phone.R[0]) < 2 && Math.abs(phone.L[1] - phone.R[1]) < 2 && phone.K[0] >= phone.K[1] - 40, phone);
    await evalJs('app.hideDialogs(); true');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
    check('H no page error during the form\'s legs', pageErrors.length === 0, pageErrors);
  }

  // ═══ J the folder follows the Task Group until the person edits; the 由名字 chips under the field, live ═════════════════
  // (lane new-session-group-folder-link — the owner, 2026-10-23: 「选了一个任务组会自动填充一个 path，但此时我删掉重新选择其他
  // 任务组，这个 path 不会改变。另外之前说的自动在下面按照任务名推荐 path 也没有，必须点开 path autocomplete 列表才行」)
  console.log('J the folder follows the Task Group until the person edits; the name\'s chips under the field (lane new-session-group-folder-link)');
  {
    const api = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); try { return await r.json(); } catch { return null; } };
    const STUDIO = path.join(fakeHome, 'workspace', 'studio'), OTHER = path.join(fakeHome, 'other-area');
    for (const d of [STUDIO, OTHER]) fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(STUDIO, 'notes.md'), '# lane fixture\n');
    const gWork = (await api('POST', '/api/tasks', { title: '工作', folders: [STUDIO] }))?.task?.id;
    const gOther = (await api('POST', '/api/tasks', { title: 'Other area', folders: [OTHER] }))?.task?.id;
    check('J0 the fixtures: two Task Groups, each with its own folder', !!gWork && !!gOther, { gWork, gOther });
    await waitFor(`!!app.sidebar._taskById(${JSON.stringify(gWork)}) && !!app.sidebar._taskById(${JSON.stringify(gOther)}) && app.sidebar._folderPaths(app.sidebar._taskById(${JSON.stringify(gOther)}))[0] === ${JSON.stringify(OTHER)}`, 10000);
    await stubCreate();
    const field = `document.getElementById('input-cwd')`;
    const facts = `(() => { const i = ${field}, w = i.closest('.path-field'); return { value: i.value, line: (w?.querySelector('.pf-under')?.innerText || '').trim(), state: w?.dataset.state || '' }; })()`;
    const pick = async (id) => { await realClick('#row-task-groups [data-tg-add]'); await sleep(200); const ok = await realClick(`.ns-tg-menu [data-tg="${id}"]`); await sleep(250); await evalJs(`document.querySelectorAll('.ns-tg-menu, .ns-tg-scrim').forEach((m) => m.remove()); true`); return ok; };
    const unpick = (id) => realClick(`#row-task-groups .ns-tg-chip[data-tg-chip="${id}"] [data-tg-x]`);   // lane new-session-layout-v3-build: the 任务组 row is on the LEFT
    const FROM = (n) => `(from Task Group «${n}»)`;
    await openNs(); await sleep(400);
    check('J1 opened from nowhere: the folder is empty', (await evalJs(facts)).value === '', await evalJs(facts));
    // J1 the owner's sequence: pick 工作 → its folder; × 工作; pick another → the folder changes with it
    await pick(gWork);
    const j1 = await waitFor(`(() => { const f = ${facts}; return f.value === ${JSON.stringify(STUDIO)} && f.line.includes(${JSON.stringify('= ~/workspace/studio' + FROM('工作'))}); })()`, 6000);
    check('J1 real clicks pick 工作 ⇒ the folder is its folder, and the line says where it came from «= ~/workspace/studio(from Task Group «工作»)»', j1, await evalJs(facts));
    await unpick(gWork);
    check('J1 × 工作 ⇒ the folder it gave goes with it (the field is empty again)', await waitFor(`(${facts}).value === ''`, 4000), await evalJs(facts));
    await pick(gOther);
    check('J1 THE FINDING: then picking another group ⇒ the folder is THAT group\'s (was: 工作\'s stayed)', await waitFor(`(() => { const f = ${facts}; return f.value === ${JSON.stringify(OTHER)} && f.line.includes(${JSON.stringify(FROM('Other area'))}); })()`, 4000), await evalJs(facts));
    // J2 two groups: the first picked gives the folder; removing it hands over to the next
    await pick(gWork);
    check('J2 two groups ⇒ the FIRST picked one\'s folder stays (Other area\'s)', await waitFor(`(${facts}).value === ${JSON.stringify(OTHER)}`, 3000) && (await evalJs(facts)).value === OTHER, await evalJs(facts));
    await unpick(gOther);
    check('J2 × the first ⇒ the next picked group\'s folder (工作\'s), said so', await waitFor(`(() => { const f = ${facts}; return f.value === ${JSON.stringify(STUDIO)} && f.line.includes(${JSON.stringify(FROM('工作'))}); })()`, 4000), await evalJs(facts));
    // J3 the person types a folder ⇒ the groups never move it again
    await evalJs(`(() => { const i = ${field}; i.focus(); i.select(); return true; })()`);
    await cdp('Input.insertText', { text: CWD }); await sleep(300); await escape();
    await realClick('#input-session-name'); await sleep(700);
    const typed = await evalJs(facts);
    check('J3 a folder typed over it is the person\'s: the line no longer names a group', typed.value === CWD && !typed.line.includes('from Task Group'), typed);
    await pick(gOther); await unpick(gWork); await sleep(500);
    check('J3 then adding and removing groups never moves it', (await evalJs(facts)).value === CWD, await evalJs(facts));
    // J4 cleared and left empty ⇒ the groups fill it again (never under the caret)
    await evalJs(`(() => { const i = ${field}; i.focus(); i.select(); return true; })()`);
    await key('Backspace', 'Backspace', 8); await sleep(250);
    check('J4 cleared: nothing refills while the caret is in it', (await evalJs(facts)).value === '', await evalJs(facts));
    await escape(); await realClick('#input-session-name');
    check('J4 …leaving it empty ⇒ the picked group\'s folder again, said so', await waitFor(`(() => { const f = ${facts}; return f.value === ${JSON.stringify(OTHER)} && f.line.includes(${JSON.stringify(FROM('Other area'))}); })()`, 4000), await evalJs(facts));
    // J5 the 由名字 chips: under the field, live with the name, 新建 for a folder not there; a press is a pick
    await unpick(gOther); await pick(gWork); await sleep(300);
    const nameChips = `[...document.querySelectorAll('#cwd-recent .cwd-name-chip')].map((c) => ({ path: c.dataset.path, isNew: c.dataset.new === '1', text: c.textContent }))`;
    const oneRow = await evalJs(`(() => { const r = document.querySelectorAll('#dialog-new-session .cwd-recent'); return { n: r.length, inField: !!document.getElementById('cwd-recent')?.closest('.path-field') }; })()`);
    check('J5 ONE chips row, inside the field (the path field\'s own — #cwd-recent adopted)', oneRow.n === 1 && oneRow.inField, oneRow);
    check('J5 the name empty ⇒ no 由名字 chip', (await evalJs(nameChips)).length === 0, await evalJs(nameChips));
    await realClick('#input-session-name');
    for (const ch of ['测', '试']) { await cdp('Input.insertText', { text: ch }); await sleep(120); }
    const c1 = await waitFor(`(() => { const c = ${nameChips}; return c.length === 2 && c[0].path === ${JSON.stringify(path.join(STUDIO, '测试'))} && c[1].path === ${JSON.stringify(path.join(fakeHome, '测试'))} && c.every((x) => x.isNew); })()`, 6000);
    check('J5 typing the name 测试 ⇒ under the field, without opening the list: «New ~/workspace/studio/测试», «New ~/测试»', c1 && !(await evalJs(`!!document.querySelector('.pf-list:not([hidden]) .pf-item')`)), await evalJs(nameChips));
    await evalJs(`document.getElementById('row-cwd').scrollIntoView({ block: 'center' }); true`); await shot('j5-name-chips'); // the owner's screen: 工作 picked, its folder named on the line, the name's chips under the field
    await cdp('Input.insertText', { text: '2' });
    check('J5 one more keystroke ⇒ the chips follow it (…/测试2)', await waitFor(`(${nameChips})[0]?.path === ${JSON.stringify(path.join(STUDIO, '测试2'))}`, 4000), await evalJs(nameChips));
    check('J5 the field itself still holds the group\'s folder (the name never moves the folder)', (await evalJs(facts)).value === STUDIO, await evalJs(facts));
    await realClick('#cwd-recent .cwd-name-chip');
    const picked = await waitFor(`(() => { const f = ${facts}; return f.value === '~/workspace/studio/测试2' && f.state === 'missing'; })()`, 5000);
    check('J5 a press on the chip fills the field with it — a pick (no group named on the line), ticked to be made at Create', picked && !(await evalJs(facts)).line.includes('from Task Group') && await evalJs(`!!document.querySelector('#dialog-new-session .pf-under input[data-act="tick"]')?.checked`), await evalJs(facts));
    await pick(gOther); await sleep(400);
    check('J5 …so a group change leaves it alone', (await evalJs(facts)).value === '~/workspace/studio/测试2', await evalJs(facts));
    check('J5 nothing was made before Create', !fs.existsSync(path.join(STUDIO, '测试2')));
    const n0 = await evalJs('window.__nsCreated.length');
    await realClick('#dialog-new-session .btn-create');
    await waitFor(`window.__nsCreated.length > ${n0}`, 6000);
    const made = await evalJs('window.__nsCreated.at(-1)');
    check('J5 Create makes the folder and starts the session there, in both groups (the order picked)', made?.cwd === path.join(STUDIO, '测试2') && fs.existsSync(path.join(STUDIO, '测试2')) && JSON.stringify(made?.taskIds) === JSON.stringify([gWork, gOther]), made && { cwd: made.cwd, taskIds: made.taskIds });
    // J6 opened FROM a group (the sidebar's «New session in this task»): derived — it follows
    await openNs({ taskId: gWork, cwd: STUDIO }); await sleep(500);
    check('J6 opened from 工作 ⇒ its folder, named on the line', await waitFor(`(() => { const f = ${facts}; return f.value === ${JSON.stringify(STUDIO)} && f.line.includes(${JSON.stringify(FROM('工作'))}); })()`, 4000), await evalJs(facts));
    await unpick(gWork); await pick(gOther);
    check('J6 × 工作, + Other area ⇒ Other area\'s folder', await waitFor(`(${facts}).value === ${JSON.stringify(OTHER)}`, 4000), await evalJs(facts));
    // J7 opened on a folder (a folder's «+»): the person's place — a group pick never replaces it
    await openNs({ cwd: CWD }); await sleep(400);
    await pick(gWork); await sleep(400);
    check('J7 opened on a folder ⇒ picking a group keeps that folder (the place the person opened it on)', (await evalJs(facts)).value === CWD, await evalJs(facts));
    // J8 the phone: the same linkage, the chips under the field
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await openNs({ taskId: gWork, cwd: STUDIO }); await sleep(500);
    await evalJs(`(() => { const n = document.getElementById('input-session-name'); n.value = 'phone'; n.dispatchEvent(new Event('input')); return true; })()`);
    const ph = await waitFor(`(() => { const c = document.querySelector('#cwd-recent .cwd-name-chip'); if (!c) return false; const r = c.getBoundingClientRect(), f = document.getElementById('input-cwd').getBoundingClientRect(); return r.width > 0 && r.top >= f.bottom && r.right <= innerWidth + 1 && c.dataset.path === ${JSON.stringify(path.join(STUDIO, 'phone'))}; })()`, 5000);
    check('J8 the phone: the name\'s chip sits under the field, inside the screen', ph, await evalJs(nameChips));
    await evalJs(`document.getElementById('row-cwd').scrollIntoView({ block: 'center' }); true`); await shot('j8-phone-field');
    await unpick(gWork);
    check('J8 the phone: × 工作 ⇒ the folder it gave goes with it', await waitFor(`(${facts}).value === ''`, 4000), await evalJs(facts));
    await shot('j8-phone');
    await evalJs('app.hideDialogs(); true');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
    check('J no page error during the folder legs', pageErrors.length === 0, pageErrors);
  }

  // ═══ K THE v3 FORM (lane new-session-layout-v3-build — the owner nodded the POC, 2026-10-23 「都按你推荐吧 没啥问题了 手机版
  // 也顺便研究下优化」): the LEFT column's order with 任务组 under the name; ONE mode door (Agent | Terminal) — Terminal = a
  // login shell (the backend card not drawn, the fold keeps the machine, the right column 「会话」 + one sentence); the
  // harness's own terminal UI = the fold's tick (mode terminal); the right column READS the left; the removals; 频道's
  // ticks with a group grant's 除了; zh / ja; THE PHONE (390×844: a full-screen sheet, the footer one line, the accordion,
  // the picker as a bottom sheet, no input under 16 px, no tap target under 32 px — a census with planted RED controls)
  console.log('K the v3 form: the order, one mode door, the terminal-UI tick, the right column reads the left, the phone (lane new-session-layout-v3-build)');
  {
    const api = async (method, p, body) => { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); try { return await r.json(); } catch { return null; } };
    const WK = path.join(fakeHome, 'k-roadshow'); fs.mkdirSync(WK, { recursive: true });
    const gA = (await api('POST', '/api/tasks', { title: 'Roadshow', folders: [WK] }))?.task?.id;
    const gB = (await api('POST', '/api/tasks', { title: 'Contracts', folders: [] }))?.task?.id;
    const grant = await api('PUT', '/api/channels/adapters/fake-push/access', { access: [{ principal: { kind: 'group', id: gA }, authority: 'draft' }], except: [{ kind: 'conversation', key: 'claude:0e1a0000-0000-4000-8000-00000000beef', name: 'Q3 board pack' }] });
    check('K0 the fixtures: two Task Groups, the fake-push account granted to «Roadshow» with one member left out (除了)', !!gA && !!gB && grant?.ok === true, { gA, gB, grant: grant && (grant.ok || grant.error) });
    await waitFor(`!!app.sidebar._taskById(${JSON.stringify(gA)}) && !!app.sidebar._taskById(${JSON.stringify(gB)})`, 10000);
    await stubCreate();
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
    const pickL = async (id) => { await realClick('#row-task-groups [data-tg-add]'); await sleep(200); const ok = await realClick(`.ns-tg-menu [data-tg="${id}"]`); await sleep(250); await evalJs(`document.querySelectorAll('.ns-tg-menu, .ns-tg-scrim').forEach((m) => m.remove()); true`); return ok; };
    const left = `(() => { const ids = ['row-session-name', 'row-task-groups', 'row-cwd', 'row-backend', 'row-model', 'row-effort', 'row-permission', 'row-tools', 'ns-more']; return ids.map((id) => { const e = document.getElementById(id); const r = e && e.offsetParent !== null ? e.getBoundingClientRect() : null; return r ? [id, Math.round(r.top), Math.round(r.left)] : [id, null]; }); })()`;
    await openNs(); await sleep(600);
    // K1 the order (each row below the one before; effort beside model) and the switch in the header's top right
    const L = await evalJs(left);
    const tops = L.filter(([id]) => id !== 'row-effort').map((x) => x[1]);
    check('K1 the LEFT column at 1280: 会话名称 → 任务组 → 工作目录 → 后端 → 模型·强度 → 权限模式 → 可用工具 → 更多选项 (each below the one before)', tops.every((t, i) => t != null && (i === 0 || t > tops[i - 1])), L);
    const eff = L.find((x) => x[0] === 'row-effort'), mod = L.find((x) => x[0] === 'row-model');
    check('K1 推理强度 sits beside 模型 (one row)', eff[1] === mod[1] && eff[2] > mod[2], { mod, eff });
    const sw = await evalJs(`(() => { const k = document.getElementById('ns-kind-seg').getBoundingClientRect(), h = document.querySelector('#dialog-new-session .ns-head').getBoundingClientRect(), x = document.querySelector('#dialog-new-session .dialog-close').getBoundingClientRect(), t = document.querySelector('#dialog-new-session .ns-head h3').getBoundingClientRect(); return { inHead: k.top >= h.top && k.bottom <= h.bottom, right: Math.round(x.left - k.right), titleLeft: k.left > t.right, words: [...document.querySelectorAll('#ns-kind-seg button')].map((b) => b.textContent.trim()), icons: document.querySelectorAll('#ns-kind-seg .ns-kind-ic svg').length }; })()`);
    check('K1 Agent | Terminal is in the header, at its right (just left of ×), with its icons', sw.inHead && sw.titleLeft && sw.right >= 0 && sw.right < 24 && sw.words.join() === 'Agent,Terminal' && sw.icons === 2, sw);
    check('K1 the title says «New Session» (not «New Agent Session»: Terminal is a session too)', await evalJs(`document.querySelector('#dialog-new-session .ns-head h3').textContent`) === 'New Session');
    // K2 the 任务组 row: none / one / two; the right column READS it
    const tgFacts = `(() => { const r = document.getElementById('row-task-groups'); const why = r.querySelector('.ns-tg-reason'); return { shown: r.offsetParent !== null, chips: [...r.querySelectorAll('.ns-tg-chip')].map((c) => c.querySelector('.ns-tg-n').textContent + ' ' + c.querySelector('.ns-tg-name').textContent), why: why.textContent, dim: why.classList.contains('dim'), reach: document.querySelector('#ns-right [data-reach]')?.textContent || '', rightPicker: document.querySelectorAll('#ns-right [data-tg-add], #ns-right .ns-tg-chip, #ns-right [data-tg-x]').length }; })()`;
    const n0 = await evalJs(tgFacts);
    check('K2 none picked: the row says «No Task Group: listed only under «Sessions», with its own folder and context» in grey (no warning)', n0.shown && n0.chips.length === 0 && n0.dim && n0.why === 'No Task Group: listed only under «Sessions», with its own folder and context', n0);
    check('K2 …and the right column\'s 「会话」 reads it — no picker on the right', /^No Task Group — it only reaches the sessions it starts itself/.test(n0.reach) && /Pick Task Groups on the left ↖/.test(n0.reach) && n0.rightPicker === 0, n0);
    await shot('k2-none-1280');
    await pickL(gA);
    const n1 = await evalJs(tgFacts);
    check('K2 one picked: «It will be listed in this group and get its context; the folder below is suggested from its folders ↓»', n1.chips.join() === '1 Roadshow' && !n1.dim && /^It will be listed in this group/.test(n1.why), n1);
    check('K2 …the right column: «Joined “Roadshow” — can see and message the N session(s) in this group…» + «Change on the left ↖»', /^Joined “Roadshow” — can see and message the \d+ session\(s\) in this group; groups it did not join only reach the sessions it starts itself/.test(n1.reach) && /Change on the left ↖/.test(n1.reach), n1.reach);
    check('K2 one group picked ⇒ the folder is its folder (the link lane\'s model, fed from the LEFT row)', await waitFor(`document.getElementById('input-cwd').value === ${JSON.stringify(WK)}`, 4000), await evalJs(`document.getElementById('input-cwd').value`));
    await shot('k2-one-1280');
    await evalJs(`(() => { const c = [...document.querySelectorAll('#row-task-groups .ns-tg-chip')].find((x) => x.dataset.tgChip === ${JSON.stringify(gA)}); c.__kept = 'yes'; return true; })()`);
    await pickL(gB);
    const n2 = await evalJs(tgFacts);
    check('K2 two picked: chips in the order picked, «…these 2 groups…»; the right column names both', n2.chips.join() === '1 Roadshow,2 Contracts' && /^It will be listed in these 2 groups/.test(n2.why) && /^Joined “Roadshow”, “Contracts” — can see and message the \d+ session\(s\) in these 2 groups/.test(n2.reach), n2);
    await shot('k2-two-1280');
    await realClick(`#row-task-groups .ns-tg-chip[data-tg-chip="${gA}"] [data-tg-x]`); await sleep(250);
    await pickL(gA);
    const kept = await evalJs(`(() => { const c = [...document.querySelectorAll('#row-task-groups .ns-tg-chip')]; return { order: c.map((x) => x.dataset.tgChip + ':' + x.querySelector('.ns-tg-n').textContent), keptB: c[0]?.dataset.tgChip === ${JSON.stringify(gB)} }; })()`);
    check('K2 × «Roadshow», + «Roadshow» ⇒ Contracts 1, Roadshow 2 (renumbered in place)', kept.keptB && kept.order.join() === `${gB}:1,${gA}:2`, kept);
    await realClick('#ns-right [data-goto-groups]'); await sleep(300);
    check('K2 «Change on the left ↖» takes the person to the 任务组 row (its «+» focused)', await evalJs(`!!document.activeElement?.matches('#row-task-groups [data-tg-add]')`));
    // the chips are KEYED and patched in place: a group still picked keeps its node through other picks
    await openNs(); await sleep(400); await pickL(gA);
    await evalJs(`(() => { document.querySelector('#row-task-groups .ns-tg-chip').__kept = 'yes'; return true; })()`);
    await pickL(gB);
    check('K2 the chips are keyed and patched in place (a picked group\'s chip is the SAME node after another pick)', await evalJs(`document.querySelector('#row-task-groups .ns-tg-chip').__kept === 'yes'`));
    // K3 one mode door: Terminal = a login shell
    await evalJs(`document.getElementById('input-cwd').value = ${JSON.stringify(CWD)}; document.getElementById('input-cwd').dispatchEvent(new Event('input')); true`);
    await realClick('#ns-kind-seg [data-kind="terminal"]'); await sleep(400);
    const T = await evalJs(`(() => { const vis = (id) => { const e = document.getElementById(id); return !!e && e.offsetParent !== null; }; return { card: vis('ns-card-backend'), cardH: vis('ns-card-backend-h'), model: vis('row-model'), perm: vis('row-permission'), tools: vis('row-tools'), more: document.getElementById('ns-more-names').textContent, right: [...document.querySelectorAll('#ns-right .ns-pv-name')].map((e) => e.textContent), plain: document.querySelector('#ns-right .ns-plain')?.textContent || '', chip: document.getElementById('ns-be-chip').textContent, foot: [...document.querySelectorAll('#ns-foot-info [data-chip]')].map((c) => c.textContent), sub: document.getElementById('ns-left-sub').textContent, groups: vis('row-task-groups') }; })()`);
    check('K3 Terminal: the backend card is not drawn (no backend / model / permission / tools), 更多选项 keeps only the machine', !T.card && !T.cardH && !T.model && !T.perm && !T.tools && T.more === 'Machine', T);
    check('K3 Terminal: the right column keeps 「会话」 + one sentence (no channels / browser / vault)', T.right.join() === 'Sessions' && /^A Terminal has no agent/.test(T.plain), T);
    check('K3 Terminal: no backend chip in the header; the footer says «Terminal · login shell»; the 任务组 row stays', T.chip === '' && T.foot[0] === 'Terminal · login shell' && T.groups && T.sub === 'Prefilled from last time · a login shell, no harness', T);
    await shot('k3-terminal-1280');
    await evalJs(`window.__nsShell = []; app.__realShell = app.__realShell || app.openShellTerminal; app.openShellTerminal = (cwd, o) => { window.__nsShell.push({ cwd, hostId: o && o.hostId }); }; true`);
    const c0 = await evalJs('window.__nsCreated.length');
    await realClick('#dialog-new-session .btn-create');
    await waitFor(`window.__nsShell.length > 0`, 6000);
    check('K3 Create in Terminal ⇒ a login shell in that folder (openShellTerminal), no agent created', JSON.stringify(await evalJs('window.__nsShell')) === JSON.stringify([{ cwd: CWD }]) && await evalJs('window.__nsCreated.length') === c0, await evalJs('window.__nsShell'));
    await evalJs(`app.openShellTerminal = app.__realShell; true`);
    // K4 the harness's own terminal UI = the fold's tick (the owner's ①: default folded)
    await openNs(); await sleep(400);
    const tui0 = await evalJs(`({ fold: !!document.getElementById('row-tui').closest('#ns-more-body'), on: document.getElementById('input-tui').checked, names: document.getElementById('ns-more-names').textContent })`);
    check('K4 «Run in the harness’s own terminal UI» is folded by default, unticked, and named on the fold', tui0.fold && !tui0.on && /Terminal UI/.test(tui0.names), tui0);
    await realClick('#ns-more-toggle'); await sleep(200);
    await realClick('#row-tui'); await sleep(300);
    await evalJs(`document.getElementById('input-cwd').value = ${JSON.stringify(CWD)}; document.getElementById('input-cwd').dispatchEvent(new Event('input')); true`);   // a folder: the footer shows the run's chips
    await realClick('#input-session-name'); await waitFor(`!!document.querySelector('#ns-foot-info [data-chip]')`, 6000);   // the field's list closed, its verdict in
    const tui1 = await evalJs(`({ on: document.getElementById('input-tui').checked, mode: document.getElementById('input-mode').value, chip: !!document.querySelector('#ns-foot-info [data-chip="tui"]'), kind: [...document.querySelectorAll('#ns-kind-seg button.on')].map((b) => b.dataset.kind).join() })`);
    check('K4 one real click ticks it ⇒ mode terminal (the backing value), a «Harness terminal UI» chip, and the header still says Agent', tui1.on && tui1.mode === 'terminal' && tui1.chip && tui1.kind === 'chat', tui1);
    await shot('k4-tui-1280');
    const c1 = await evalJs('window.__nsCreated.length');
    await realClick('#dialog-new-session .btn-create'); await waitFor(`window.__nsCreated.length > ${c1}`, 6000);
    const madeT = await evalJs('window.__nsCreated.at(-1)');
    check('K4 Create sends mode «terminal» with the harness (ws-create\'s pty-wrapper road — the server contract unchanged)', madeT?.mode === 'terminal' && madeT?.backend === 'claude', madeT && { mode: madeT.mode, backend: madeT.backend });
    await evalJs(`app.settings.set('session.defaultMode', 'terminal'); true`);
    await openNs(); await sleep(400);
    const tui2 = await evalJs(`({ on: document.getElementById('input-tui').checked, up: !!document.getElementById('row-tui').closest('#ns-card-backend'), note: document.querySelector('#row-tui .ns-auto-note')?.textContent || '' })`);
    check('K4 the person\'s default (Settings: sessions start in the terminal) ⇒ ticked AND standing in the card, saying why', tui2.on && tui2.up && /start in the terminal by default/.test(tui2.note), tui2);
    await evalJs(`app.settings.set('session.defaultMode', 'chat'); true`);
    await openNs(); await sleep(300);
    check('K4 the default back to chat ⇒ unticked and folded again', await evalJs(`!document.getElementById('input-tui').checked && !!document.getElementById('row-tui').closest('#ns-more-body')`));
    // K5 the removals
    const gone = await evalJs(`({ tickAll: document.querySelectorAll('#dialog-new-session [data-tick-all], #dialog-new-session .ns-tick-seg').length, mcp: /MCP/.test(document.getElementById('ns-right').innerText), outside: document.querySelectorAll('#ns-right [data-fact="group"]').length + (/Outside · notifications/.test(document.getElementById('ns-right').innerText) ? 1 : 0), accCard: document.querySelectorAll('#ns-right [data-card="accounts"]').length + (/Accounts · as you/.test(document.getElementById('ns-right').innerText) ? 1 : 0), shellChip: [...document.querySelectorAll('#ns-be-seg button, #ns-be-phone option')].filter((b) => b.dataset?.backend === 'shell' || b.value === 'shell' || /plain shell/i.test(b.textContent)).length })`);
    check('K5 gone: 无 | 已选 | 全部, the MCP empty row, 「对外 · 通知」, the separate 「账号 · 以你的身份」 card, the «Terminal (plain shell)» backend chip', gone.tickAll === 0 && !gone.mcp && gone.outside === 0 && gone.accCard === 0 && gone.shellChip === 0, gone);
    // K6 频道: one tick per account; a group grant ticked + locked with its 除了
    await pickL(gA);
    await waitFor(`!!document.querySelector('#ns-right [data-row="chan"] [data-acc-row="fake-push"] .ns-exc')`, 8000);
    const notLive = await evalJs(`document.querySelector('#ns-right [data-acc-row="fake-push"] .ns-exc')?.textContent || ''`);
    check('K6 a 除了 member that is not live is said so («Except: a conversation not live now» — the access store keeps no names)', notLive === 'Except: a conversation not live now', notLive);
    await evalJs(`(() => { app.sidebar._allSessions.push({ sessionId: 'k-q3', backendSessionId: '0e1a0000-0000-4000-8000-00000000beef', backend: 'claude', name: 'Q3 board pack', cwd: '/tmp/q3' }); app._nsPaintRight(); return true; })()`);
    const ch = await evalJs(`(() => { const r = document.querySelector('#ns-right [data-acc-row="fake-push"]'); const x = r.querySelector('input'); return { inChan: !!r.closest('[data-row="chan"]'), checked: x.checked, disabled: x.disabled, via: r.querySelector('.ns-pv-via').textContent, door: r.querySelector('[data-door="chan"]')?.textContent || '' }; })()`);
    check('K6 a group-granted account: ticked + locked inside 频道, says «Through Task Group “Roadshow” · draft only» and its 除了 «Except: Q3 board pack»', ch.inChan && ch.checked && ch.disabled && /^Through Task Group “Roadshow” · draft only/.test(ch.via) && /Except: Q3 board pack/.test(ch.via) && /^Except… ›/.test(ch.door), ch);
    await shot('k6-chan-1280');
    await evalJs(`(() => { app.sidebar._allSessions = app.sidebar._allSessions.filter((s) => s.sessionId !== 'k-q3'); return true; })()`);
    // K7 zh / ja
    for (const [lang, words] of [['zh', { title: '新建会话', term: '终端', tg: '任务组', none: '不加入任务组：只列在「会话」里，用自己的文件夹和上下文', tui: '终端界面', nameHint: '也是「由名字」推荐文件夹的那个名字' }], ['ja', { title: '新規セッション', term: 'ターミナル', tg: 'タスクグループ', none: 'タスクグループに入れない：「セッション」にだけ並び、自分のフォルダと文脈を使います', tui: 'ターミナル画面', nameHint: 'フォルダの「名前から」提案にも使う名前' }]]) {
      await evalJs(`localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); true`);
      await cdp('Page.reload'); await waitApp(); await sleep(800); await stubCreate();
      await openNs(); await sleep(600);
      const w = await evalJs(`({ title: document.querySelector('#dialog-new-session .ns-head h3').textContent, term: document.querySelector('#ns-kind-seg [data-kind="terminal"]').textContent.trim(), tg: document.querySelector('#row-task-groups .ns-tg-lab')?.textContent, none: document.querySelector('#row-task-groups .ns-tg-reason')?.textContent, more: document.getElementById('ns-more-names').textContent, nameHint: document.querySelector('#row-session-name .ns-lab-hint')?.textContent })`);
      check(`K7 ${lang}: the header, the switch, the 任务组 row and its sentence, the fold\'s 终端界面, the name\'s hint in ${lang}`, w.title === words.title && w.term === words.term && w.tg === words.tg && w.none === words.none && w.more.includes(words.tui) && w.nameHint === words.nameHint, w);
      await shot(`k7-${lang}-1280`);
    }
    await evalJs(`localStorage.setItem('vibespace.lang', 'en'); true`);
    // K8 THE PHONE at 390×844 (the page loaded AT phone width: app.isMobile is read once, at boot — as on a real phone)
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp('Page.reload'); await waitApp(); await sleep(800); await stubCreate();
    await openNs(); await sleep(600);
    await evalJs(`(() => { const n = document.getElementById('input-session-name'); n.value = 'roadshow-q3'; n.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await pickL(gA); await pickL(gB); await sleep(400);
    await shot('k8-phone-top-390');
    const geo = () => evalJs(`(() => { const d = document.getElementById('dialog-new-session').getBoundingClientRect(), h = document.querySelector('#dialog-new-session .ns-head').getBoundingClientRect(), f = document.querySelector('#dialog-new-session .ns-foot').getBoundingClientRect(), b = document.querySelector('#dialog-new-session .ns-body'); return { d: [Math.round(d.left), Math.round(d.top), Math.round(d.width), Math.round(d.height)], headTop: Math.round(h.top), footBottom: Math.round(f.bottom), footH: Math.round(f.height), scrolls: b.scrollHeight > b.clientHeight + 50, chipTops: [...new Set([...document.querySelectorAll('#ns-foot-info .ns-chip')].map((c) => Math.round(c.getBoundingClientRect().top)))], nChips: document.querySelectorAll('#ns-foot-info .ns-chip').length, vw: innerWidth, vh: innerHeight, info: (() => { const i = document.getElementById('ns-foot-info'), r = i.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), sideways: i.scrollWidth > i.clientWidth + 1 }; })(), btnTops: ['.btn-cancel', '.btn-create'].map((s) => Math.round(document.querySelector('#dialog-new-session .ns-foot ' + s).getBoundingClientRect().top)), chipsOut: [...document.querySelectorAll('#ns-foot-info .ns-chip')].filter((c) => { const r = c.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 0.5 || c.scrollWidth > c.clientWidth + 1; }).length }; })()`);
    const g0 = await geo();
    check('K8 phone: a FULL-SCREEN sheet (0, 0, 390 × 844), its middle scrolls', g0.d.join() === `0,0,${g0.vw},${g0.vh}` && g0.scrolls, g0);
    await evalJs(`(() => { const b = document.querySelector('#dialog-new-session .ns-body'); b.scrollTop = b.scrollHeight; return true; })()`); await sleep(200);
    const g1 = await geo();
    check('K8 phone: scrolled to the end, the header is still at the top and the footer at the bottom (fixed)', g1.headTop === 0 && g1.footBottom === g1.vh, g1);
    // lane phone-refusal-wrap (P1-5): the footer was ONE line whose chips scrolled sideways behind a hidden bar — at 382 / 385 px the
    // refusal read «✕ Cannot create yet: Ch». Now the chips / the refusal take the footer's own full-width row above Cancel / Create and WRAP
    check('K8 phone: the footer\'s chips take their OWN full-width row above Cancel / Create and wrap — nothing scrolls sideways, every chip whole on the screen (P1-5)', g1.nChips >= 4 && g1.info.w >= g1.vw - 24 && g1.btnTops.every((t) => t >= g1.info.bottom) && !g1.info.sideways && g1.chipsOut === 0, g1);
    await evalJs(`document.querySelector('#dialog-new-session .ns-body').scrollTop = 0; true`);
    // the right column as an accordion with a summary per resource
    const acc = () => evalJs(`[...document.querySelectorAll('#ns-right .ns-res')].map((r) => ({ k: r.querySelector('[data-res-tog]').dataset.resTog, open: r.classList.contains('open'), sum: r.querySelector('.ns-res-t small').textContent, badge: r.querySelector('.ns-badge, .ns-on')?.textContent || '', body: r.querySelector('.ns-res-body').offsetParent !== null }))`);
    const a0 = await acc();
    const A = Object.fromEntries(a0.map((x) => [x.k, x]));
    check('K8 phone: the right column is an ACCORDION — built-in · sessions · channels · browser · vault · keys, each one line, all closed', ['builtin', 'sessions', 'chan', 'vault', 'keys'].every((k) => A[k] && !A[k].open && !A[k].body) && a0[0].k === 'builtin' && a0[1].k === 'sessions', a0);
    check('K8 phone: the lines summarize — «Joined “Roadshow”, “Contracts” · N session(s)», «1 account(s) through Task Groups · N more to tick» with its yellow mark', /^Joined “Roadshow”, “Contracts” · \d+ session\(s\)$/.test(A.sessions.sum) && /^1 account\(s\) through Task Groups · \d+ more to tick$/.test(A.chan.sum) && /^\d+ to tick$/.test(A.chan.badge), { s: A.sessions, c: A.chan });
    await realClick('#ns-right [data-res-tog="chan"]'); await sleep(300);
    const a1 = Object.fromEntries((await acc()).map((x) => [x.k, x]));
    check('K8 phone: one tap opens 频道 — its account rows (the granted one with its 除了) and its door', a1.chan.open && a1.chan.body && await evalJs(`!!document.querySelector('#ns-right .ns-res.open [data-acc-row="fake-push"] .ns-exc') && !!document.querySelector('#ns-right .ns-res.open [data-door="chan"]')`), a1.chan);
    await shot('k8-phone-chan-390');
    // the picker as a bottom sheet
    await evalJs(`document.querySelector('#dialog-new-session .ns-body').scrollTop = 0; true`);
    await realClick('#row-task-groups [data-tg-add]'); await sleep(400);
    const sh = await evalJs(`(() => { const m = document.querySelector('.ns-tg-menu'); if (!m) return null; const r = m.getBoundingClientRect(); const items = [...m.querySelectorAll('[data-tg]')]; return { sheet: m.classList.contains('ns-tg-sheet'), l: Math.round(r.left), w: Math.round(r.width), bottom: Math.round(r.bottom), minH: Math.min(...items.map((i) => Math.round(i.getBoundingClientRect().height))), ticks: items.filter((i) => i.querySelector('.ns-tg-tick')?.textContent === '✓').map((i) => i.dataset.tg), scrim: !!document.querySelector('.ns-tg-scrim'), done: !!m.querySelector('[data-tg-done]') }; })()`);
    check('K8 phone: the 任务组 picker is a BOTTOM SHEET — full width, at the bottom, 50 px rows, ✓ on the picked, 完成', sh && sh.sheet && sh.l === 0 && sh.w === 390 && sh.bottom === 844 && sh.minH >= 50 && sh.ticks.includes(gA) && sh.ticks.includes(gB) && sh.scrim && sh.done, sh);
    await shot('k8-phone-picker-390');
    await realClick('.ns-tg-menu [data-tg-done]'); await sleep(250);
    check('K8 phone: 完成 closes the sheet (and its scrim)', await evalJs(`!document.querySelector('.ns-tg-menu') && !document.querySelector('.ns-tg-scrim')`));
    // the census: every input ≥ 16 px (iOS never zooms), every tap target ≥ 32 px (a group chip's × 30 px) — the fold and
    // every accordion row open, so nothing hides from it
    await evalJs(`(() => { document.getElementById('ns-more-toggle').setAttribute('aria-expanded', 'true'); for (const k of ['builtin', 'sessions', 'chan', 'browser', 'vault', 'keys']) app._ns.open[k] = true; app._nsPaintRight(); return true; })()`); await sleep(300);
    const CENSUS = `(() => { const dlg = document.getElementById('dialog-new-session'); const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); };
      const name = (e) => (e.id || e.dataset.chip || e.dataset.tool || e.dataset.tg || e.dataset.resTog || e.className || e.tagName) + ':' + (e.innerText || e.value || '').slice(0, 24);
      const inputs = [...dlg.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]), select')].filter(vis).filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16 || e.getBoundingClientRect().height < 41.5).map(name);
      const taps = [...dlg.querySelectorAll('button, select, input:not([type="checkbox"]):not([type="radio"]), label.dialog-check-row, label.ns-acc, .pf-tickrow, [role="option"]')].filter(vis).filter((e) => { const r = e.getBoundingClientRect(); return e.matches('[data-tg-x]') ? (r.height < 30 || r.width < 30) : r.height < 31.5; }).map((e) => name(e) + '@' + Math.round(e.getBoundingClientRect().height));
      const n = dlg.querySelectorAll('button, select, input, [role="option"]').length; return { inputs, taps, n }; })()`;
    const cen = await evalJs(CENSUS);
    check(`K8 phone census: no input or select under 16 px / 42 px (${cen.n} controls)`, cen.inputs.length === 0, cen.inputs);
    check('K8 phone census: no tap target under 32 px (a group chip\'s × ≥ 30 px)', cen.taps.length === 0, cen.taps);
    await shot('k8-phone-open-390');
    // RED CONTROLS: the census must be able to say no — a planted 18 px button and a planted 12 px input are caught
    await evalJs(`(() => { const b = document.createElement('button'); b.id = 'k8-plant-btn'; b.textContent = 'x'; b.style.cssText = 'height:18px;min-height:0;padding:0;font-size:10px'; const i = document.createElement('input'); i.id = 'k8-plant-in'; i.type = 'text'; i.setAttribute('style', 'font-size:12px !important;min-height:0 !important;height:24px'); document.querySelector('#dialog-new-session .ns-body').prepend(b, i); return true; })()`);
    const red = await evalJs(CENSUS);
    check('K8 RED CONTROL: a planted 18 px button and a planted 12 px input are caught by the census', red.taps.some((x) => x.startsWith('k8-plant-btn')) && red.inputs.some((x) => x.startsWith('k8-plant-in')), red);
    await evalJs(`document.getElementById('k8-plant-btn')?.remove(); document.getElementById('k8-plant-in')?.remove(); true`);
    // the recommendation list sits IN THE FLOW under the field (L1's phone rule), the backend is a native select
    await realClick('#input-cwd'); await cdp('Input.insertText', { text: 'k-r' }); await sleep(900);
    const fl = await evalJs(`(() => { const l = document.querySelector('#row-cwd .pf-list'); const f = document.getElementById('input-cwd').getBoundingClientRect(); if (!l || l.hidden) return { list: false }; const r = l.getBoundingClientRect(); return { list: true, float: l.classList.contains('pf-float'), pos: getComputedStyle(l).position, below: r.top >= f.bottom - 1, inField: !!l.closest('#row-cwd') }; })()`);
    check('K8 phone: the folder suggestions sit IN THE FLOW under the field (not floating)', fl.list && !fl.float && fl.pos !== 'fixed' && fl.below && fl.inField, fl);
    await escape();
    const be = await evalJs(`({ seg: document.getElementById('ns-be-seg').offsetParent !== null, sel: document.getElementById('ns-be-phone').offsetParent !== null, opts: [...document.querySelectorAll('#ns-be-phone option')].map((o) => o.value), pair: (() => { const m = document.getElementById('row-model').getBoundingClientRect(), e = document.getElementById('row-effort').getBoundingClientRect(); return e.top > m.top; })() })`);
    check('K8 phone: the backend is a native select of harnesses (no shell), model / effort / permission one per row', !be.seg && be.sel && !be.opts.includes('shell') && be.opts.includes('claude') && be.pair, be);
    await evalJs(`(() => { const s = document.getElementById('ns-be-phone'); s.value = 'codex'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(300);
    check('K8 phone: picking Codex in the native select is the backend (the ONE road)', await evalJs(`document.getElementById('input-backend').value === 'codex'`));
    await evalJs(`(() => { const s = document.getElementById('ns-be-phone'); s.value = 'claude'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`); await sleep(200);
    // the phone in Terminal: the same rules, the accordion keeps 「会话」 + the sentence
    await realClick('#ns-kind-seg [data-kind="terminal"]'); await sleep(400);
    check('K8 phone Terminal: the backend card is not drawn; the right column keeps 「会话」 + one sentence', await evalJs(`document.getElementById('ns-card-backend').offsetParent === null && [...document.querySelectorAll('#ns-right .ns-res')].map((r) => r.querySelector('[data-res-tog]').dataset.resTog).join() === 'sessions' && /^A Terminal has no agent/.test(document.querySelector('#ns-right .ns-plain')?.textContent || '')`));
    await shot('k8-phone-terminal-390');
    await realClick('#ns-kind-seg [data-kind="chat"]'); await sleep(200);
    await evalJs('app.hideDialogs(); true');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
    await cdp('Page.reload'); await waitApp(); await sleep(800);
    check('K no page error during the v3 legs', pageErrors.length === 0, pageErrors);
  }

  // ═══ I a paired machine that cannot be reached: the refusal in the field, the hub lives ══════════════════════════
  console.log('I the host row with a machine that cannot be reached (lane hub-dies-dead-ssh-host)');
  let iHost = null, iWords = null; // I6's machine + words, for the RED CONTROL's run of the same leg
  {
    const add = await (await fetch(`http://127.0.0.1:${PORT}/api/hosts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'my-mac', user: 'me', host: 'mac.example.test', port: 22 }) })).json();
    const hid = add.id;
    const s0 = sshCalls();
    await openNs();
    await evalJs(`(() => { const s = document.getElementById('input-host'); if (![...s.options].some((o) => o.value === ${JSON.stringify(hid)})) s.add(new Option('my-mac (me@mac.example.test)', ${JSON.stringify(hid)})); s.value = ${JSON.stringify(hid)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    await realClick('#input-cwd');
    const WORDS = 'my-mac cannot be reached — use a path on this machine or try again later';
    // the press OPENS the list (a timer after the pointerdown) — wait for it: the verdict alone can be in before the press (the
    // machine's recent-folders answer says «unreachable» at the host change), and a read before the open counted the rows a
    // CLOSED list still held from an earlier leg (lane new-session-group-folder-link: measured 1 run in 4 under load, the
    // press's setTimeout(0) not yet run at the read)
    const said = await waitFor(`(document.querySelector('#input-cwd').closest('[data-state]')?.dataset.state === 'unreachable') && (document.querySelector('#input-cwd').closest('[data-state]').querySelector('.pf-under')?.textContent || '').includes(${JSON.stringify(WORDS)}) && document.getElementById('input-cwd').getAttribute('aria-expanded') === 'true'`, 10000);
    const listNow = await evalJs(`(() => { const l = document.querySelector('.pf-list'); return { rows: l ? l.querySelectorAll('.pf-item').length : -1, empty: (l?.querySelector('.pf-empty')?.textContent || '').trim(), hidden: !!l?.hidden, expanded: document.getElementById('input-cwd').getAttribute('aria-expanded'), focus: document.activeElement?.id || document.activeElement?.className || '' }; })()`);
    check('I1 picked in the host row ⇒ the folder field\'s own line says «my-mac cannot be reached — …» (state unreachable); its list offers nothing there', !!said && listNow.rows === 0, { said, listNow, under: await evalJs(`(document.querySelector('.pf-under')?.textContent || '').trim()`) });
    check('I2 the footer refuses Create with the same words', await waitFor(`document.getElementById('ns-foot-info').innerText.includes(${JSON.stringify('Cannot create yet: ' + WORDS)})`, 5000), await evalJs(`document.getElementById('ns-foot-info').innerText`));
    await sleep(1500); const s1 = sshCalls();
    for (const ch of 'Docs') { await cdp('Input.insertText', { text: ch }); await sleep(200); }
    await sleep(1500);
    const probes = sshLines().slice(s0).filter((w) => w === 'true').length;
    check('I3 typing on spawns nothing (0 ssh for four keystrokes) — the host rung asked ONE probe for the whole walk (the verdict is kept a minute)', sshCalls() === s1 && probes === 1, { duringTyping: sshCalls() - s1, probes, all: sshLines().slice(s0) });
    await evalJs(`(() => { const s = document.getElementById('input-host'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
    check('I4 back to This machine ⇒ the field is usable again (its state is not the refusal; the footer drops it)', await waitFor(`document.querySelector('#input-cwd').closest('[data-state]')?.dataset.state !== 'unreachable' && !document.getElementById('ns-foot-info').innerText.includes('cannot be reached')`, 5000), await evalJs(`document.querySelector('#input-cwd').closest('[data-state]')?.dataset.state`));
    const next = await fetch(`http://127.0.0.1:${PORT}/api/home`).then((r) => r.status, (e) => 'NO ANSWER ' + e.message);
    check('I5 the hub answers the next request', next === 200, next);
    await evalJs('app.hideDialogs(); true');
    const h6 = await heldPick(hid, WORDS);
    check('I6 premise: the machine list was held until after the pick, the machine\'s answers until after the list landed', h6.premise.listHeld >= 1 && !h6.premise.landedBeforePick && h6.premise.landed, h6.premise);
    check('I6 a machine picked while the list is in flight STAYS picked when it lands — the field says «my-mac cannot be reached — …» and the footer refuses with the same words (the runner\'s I1 / I2)', h6.host === 'my-mac' && h6.said && h6.foot.includes('Cannot create yet: ' + WORDS), h6);
    iHost = hid; iWords = WORDS;
    await evalJs('app.hideDialogs(); true');
  }

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
      // ci-355-red (I6): the .355 landing put the open's machine back over the person's pick
      ["        hostSel.value = this._nsHostPicked ? was : (hostId || '');\n        if (hostSel.selectedIndex < 0) hostSel.value = hostId || '';\n", "        hostSel.value = hostId || '';\n"],
    ];
    check('the four edits the control makes are each spelled exactly once in app.js', EDITS.every(([a]) => src.split(a).length === 2), EDITS.map(([a]) => src.split(a).length - 1));
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
    if (iHost) {
      await reboot(); // the G leg's fetch stub off: the real machine list, held by CDP as in I6
      const c6 = await heldPick(iHost, iWords);
      check('CONTROL I6 the base: the same held order loses the pick — This machine, «Choose a folder first», never the machine\'s words', c6.premise.listHeld >= 1 && !c6.premise.landedBeforePick && c6.premise.landed && c6.host === 'This machine' && !c6.said && /Choose a folder first/.test(c6.foot), c6);
    } else check('CONTROL I6 ran (the I leg gave it its machine)', false);
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
