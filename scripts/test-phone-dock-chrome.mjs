#!/usr/bin/env node
// THE PHONE'S «WAITING FOR YOU» STRIP IS ONE ROW UNTIL TAPPED, IN A REAL CHROME (lane phone-dock-restore — the owner 2026-11-02 on
// the iPhone, .373: «等你操作的那个橙色的菜单，在画面最下方的 iPhone UI 上占据的显示面积过大»). Split out of
// test-chat-needs-card-chrome.mjs as its ㉓ (int374 seam, 2026-11-03): with ㉓ that suite outgrew its 840-s ceiling on the
// Actions runner (㉒ done at 771 s; 759.7 s for all of it on .373), so the phone legs run here on the SAME boot harness — a
// throwaway server in a git worktree (this tree's src/ + built public/), ONE stub `claude` conversation behind the real
// chat-wrapper, headless Chrome over raw CDP — and nothing of the needs cards' other sections:
//   ㉓ three shapes (a hub ask, a 3-option question, a run card) FOLDED at 390×844 (≤ 56 px: the count, the item's words on one
//     line, «View», the door to all; no answer on the row; the composer on screen) → «View» opens THAT item (its answers,
//     ≤ 45 % of the screen) → the head folds it; a newer item while it is open; r2: every button of the opened item answers
//     nothing for ARM_MS after the open, the folded row's clock (live / due / none), the folded count's attention fill; r3: the
//     clock's tap opens the item, nothing waits ⇒ no deadline stamp left and the ticker stopped; the desktop's strip never folds.
//   RED CONTROLS: the open's stamp taken back; the fill rule cut; the clock's rules cut; the r2 lines put back (a bundle built
//     from this source); the phone block's rules cut out of the page's sheet.
// (The phone pins that ride other sections — ⑰ ⑲ ㉑'s «View» opens and ㉑'s r14 folded-clock leg — stay in
// test-chat-needs-card-chrome: they read those sections' own conversations.)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.log('✗ no public/bundle.js — run `npm run build` first'); process.exit(1); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('phone-dock-wt');
const fakeHome = scratchHome('phone-dock-home', fs);
const chromeDir = scratch('phone-dock-chrome');
const stubDir = scratch('phone-dock-stub');
const MUT6 = scratch('phone-dock-mut6');
const WORK = path.join(stubDir, 'work', 'ops');
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : scratch('phone-dock-shots');
for (const d of [stubDir, WORK, SHOTS]) fs.mkdirSync(d, { recursive: true });
const ORIGIN = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0, skipped = 0;
/** a leg whose premise is a FONT fact absent here: said BY NAME with what was measured, never assumed (lane needs-card-tail r13) */
const skip = (n, why) => { skipped++; console.log(`  ○ SKIP ${n} — ${typeof why === 'string' ? why : JSON.stringify(why).slice(0, 1500)}`); };
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

// ── the RED CONTROL's bundle: THIS source without the needs cards (the base's chat — a missing anchor = a named red in ⓪) ──
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
  for (const d of [chromeDir, fakeHome, stubDir, MUT6]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
// run bare (no gate) the suite assumes its ci.mjs row's budget (budgetFor: a chrome heavy row, 900 s) and says so — lane
// needs-card-tail r5: a run by hand took the 300 s default, and its own clock fired at 270 s, 23 s into ⑬, on a suite that
// runs ~430 s alone (int361's direct run of 497beb03; the gate's runs were green)
const BARE = !process.env.VIBESPACE_SUITE_BUDGET_MS;
// (lane needs-card-tail r10: ⑰ — the strip's stress shapes, two pages, ~40 real CLI filings — lifts the suite's own ceiling
// 600 → 840 s, inside its row's 900 s budget less the watchdog's 30 s)
const WD = armWatchdog({ capMs: 420e3, env: BARE ? { ...process.env, VIBESPACE_SUITE_BUDGET_MS: '480000' } : process.env, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
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
// ── ㉓ r3's RED CONTROL: THIS source with the phone row's r2 lines put back — the capture's row test (the clock no row's child
//    ⇒ a dead zone) and the return before the clock's clearing (a hidden clock still stamped ⇒ the page's ticker kept counting) ──
let DOCK_BUNDLE = null, DOCK_ERR = '';
try {
  fs.mkdirSync(MUT6, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT6}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT6, 'node_modules'));
  const f = path.join(MUT6, 'src/lib/chat-needs-card.js'); let s = fs.readFileSync(f, 'utf8');
  for (const [from, to] of [["      if (open && !head) return;\n", "      if (!head && !ev.target.closest('.cad-look') && (open || !ev.target.closest('.cad-rows'))) return;\n"],
    ['    if (clock && !line && !clock.hidden) {', '    if (!entry) return;\n    if (clock && !line && !clock.hidden) {']]) {
    if (s.split(from).length !== 2) throw new Error('mutant anchor src/lib/chat-needs-card.js: ' + from.trim().slice(0, 50));
    s = s.replace(from, to);
  }
  fs.writeFileSync(f, s);
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT6 });
  DOCK_BUNDLE = fs.readFileSync(path.join(MUT6, 'bundle-mut.js'));
} catch (e) { DOCK_ERR = String(e && e.message || e).split('\n')[0]; }

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
const say = (text) => hubWs.send(JSON.stringify({ type: 'chat-input', sessionId: SID, text }));
const api = async () => (await (await fetch(`${ORIGIN}/api/user-todos`)).json()).todos;
const findOpen = async (pred, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const it = (await api()).open.find(pred); if (it) return it; await sleep(150); } return null; };
const cliLog = () => { try { return fs.readFileSync(path.join(stubDir, 'cli.log'), 'utf8'); } catch { return ''; } };
/** the CLI's output lands in the log when the CLI EXITS — a moment after its item is on the hub */
const logHas = async (re, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (re.test(cliLog())) return true; await sleep(120); } return re.test(cliLog()); };
const CHAT = (sid) => `[...app.wm.windows.values()].find((w) => w.type === 'chat' && app.sessions.get(w.id)?.sessionId === ${JSON.stringify(sid)})`;
const openChat = (P) => P.evalJs(`(() => { if (!${CHAT(SID)}) app.attachSession(${JSON.stringify(SID)}, 'ops watch', ${JSON.stringify(WORK)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
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
/** lane needs-card-tail r10: THE ATTENTION DOCK's count (the strip above the message box — the bar's chip is gone) */
const CHIP = `(() => { const c = document.querySelector('.chat-attn-dock:not([hidden]) .cad-count'); if (!c || !c.offsetParent) return null; return { text: c.textContent.trim(), title: c.title, clickable: !!c.closest('.chat-attn-dock').querySelector('.cad-rows .ut-text[role="button"]') }; })()`;
/** THE PERSON'S PRESS AFTER A SCROLL: the transcript moves the card's Approve (the row pass stamped it before), rests 1.5 s
 *  (past ARM_MS), then a real click where it stands — → {moved, at, toast} */
const scrollThenPress = async (P, id) => {
  const sel = `.cn-card[data-item="${id}"] .ut-action-proposal[data-answer="approve"]`;
  const m = await P.evalJs(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; const l = b.closest('.chat-message-list'); const t0 = b.getBoundingClientRect().top; b.scrollIntoView({ block: 'center' }); if (Math.abs(b.getBoundingClientRect().top - t0) < 2) { l.scrollTop = Math.max(0, l.scrollTop - 60); if (Math.abs(b.getBoundingClientRect().top - t0) < 2) l.scrollTop += 120; } return { moved: Math.round(b.getBoundingClientRect().top - t0) }; })()`);
  await sleep(1500);
  const at = m && await P.evalJs(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  if (at) await P.clickAt(at.x, at.y);
  await sleep(700);
  const toast = await P.evalJs(`[...document.querySelectorAll('.global-toast')].map((x) => x.textContent).join(' | ')`);
  return { ...(m || {}), at, toast };
};
const T0 = Date.now();
const lap = (what) => console.log(`  (${what} at ${((Date.now() - T0) / 1000).toFixed(1)} s)`);

try {
  // (the needs cards' setup — the ops conversation's ask and access request — is not this suite's: ㉓ files its own items)
  const J = (x) => JSON.stringify(x);
  const newConv = (tag) => new Promise((res) => { // (⑧'s \`frames\` shadows the hub's frame list here — the hub's answer heard directly)
    const on = (d) => { let m = null; try { m = JSON.parse(String(d)); } catch { } if (m && m.type === 'created' && m.reqId === 'cn-' + tag) { hubWs.off('message', on); res(m.sessionId); } };
    hubWs.on('message', on); hubWs.send(J({ type: 'create', backend: 'claude', mode: 'chat', cwd: WORK, reqId: 'cn-' + tag })); setTimeout(() => { hubWs.off('message', on); res(null); }, 15000); });
  const sayTo = (sid, text) => hubWs.send(J({ type: 'chat-input', sessionId: sid, text }));
  const byText = async (re, n, ms = 20000) => { const t0 = Date.now(); let o = []; while (Date.now() - t0 < ms) { o = (await api()).open.filter((i) => re.test(i.text)); if (o.length >= n) break; await sleep(200); } return o.sort((a, b) => a.createdAt - b.createdAt); };
  const openOnly = (P, sid) => P.evalJs(`(() => { app.phoneHome?.hide?.(); for (const w of [...app.wm.windows.values()]) if (w.type === 'chat' && app.sessions.get(w.id)?.sessionId !== ${J(sid)}) app.wm.closeWindow(w.id); if (!${CHAT(sid)}) app.attachSession(${J(sid)}, 'round five', ${J(WORK)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  const toConv = async (P, sid, ids, w, h, touch, max = !touch) => {
    await P.device(w, h, touch ? undefined : { mouse: true }); await P.load(); await openOnly(P, sid);
    if (max) { await P.waitFor(`!!${CHAT(sid)}`, 8000); await P.evalJs(`(() => { const w = ${CHAT(sid)}; if (!w) return false; if (${J(max)} === true) { if (!w.isMaximized) app.wm.toggleMaximize(w.id); } else { if (w.isMaximized) app.wm.toggleMaximize(w.id); app.wm.resizeWindowTo(w.id, ${J(max)}); } return true; })()`); }
    await P.waitFor(`${J(ids)}.every((id) => { const c = document.querySelector('.cn-card[data-item="' + id + '"]'); return !!c && c.getClientRects().length > 0; }) && !app.phoneHome?.shown?.()`, 15000); await sleep(900);
  };

  // ── ㉓ THE PHONE'S STRIP IS ONE ROW UNTIL TAPPED (lane phone-dock-restore — the owner 2026-11-02 on the iPhone, .373: «等你操作的那个
  //    橙色的菜单，在画面最下方的 iPhone UI 上占据的显示面积过大»; the base 74b98357e at 390×844: a hub ask's strip 254 px, a 3-option
  //    question's 192, a run card's 338 of the 844). Three shapes FOLDED (≤ 56 px: the count, the item's own words cut on one line,
  //    «View», the door to all; no answer on the row; the composer on screen) → «View» opens THAT item (its answers, ≤ 45 % of the
  //    screen, the composer on screen) → the head folds it. A newer item while it is open: folded, its words and count, the
  //    composer keeps the focus. The desktop's strip never folds. RED CONTROL: the phone block's rules cut out of the page's sheet
  //    ⇒ the folded-height leg red by name.
  console.log('㉓ THE PHONE\'S STRIP IS ONE ROW UNTIL TAPPED — folded ≤ 56 px, «View» opens the item in place (≤ 45 % of the screen), the head folds it (lane phone-dock-restore)');
  try {
    const PUSH23 = (list) => `(async () => { const d = await (await fetch('/api/user-todos')).json(); const todos = d.todos; todos.open = ${list}; for (const h of app.ws.globalHandlers) { try { h({ type: 'user-todos-updated', todos }); } catch { } } return 1; })()`;
    const s23 = await newConv('strip'); await sleep(600); sayTo(s23, 'hello'); await sleep(1500);
    await A.front(); await toConv(A, s23, [], 390, 844, true);
    const KEY23 = await A.evalJs(`(app.foryouRows.keysForWin(${CHAT(s23)}.id) || [])[0] || null`);
    const T23 = Date.now(), NAME = 'gateway-integration-api-key-01';
    const more23 = [1, 2].map((k) => ({ id: 'ut-r23more' + k, sessionKey: KEY23, status: 'open', kind: 'action', by: 'agent', urgency: 'normal', text: ['Ship the payments fix tonight?', 'Keep the old VPN profile?'][k - 1], detail: '', createdAt: T23 - 900e3 - k * 60e3 }));
    const SHAPES23 = {
      hub: { answers: 3, words: 'ops bot wants to write a file on mac1', item: { id: 'ut-r23hub01', sessionKey: KEY23, status: 'open', kind: 'action', origin: 'machines', by: 'agent', urgency: 'urgent', createdAt: T23 - 19e3, expiresAt: T23 + 3600e3,
        text: 'ops bot wants to write a file on mac1', detail: 'write /home/userW/.vibespace/cursor.json · 40 B', action: { type: 'hub-act-ask', askId: 'h'.repeat(32), hostId: 'host-mac1', machine: 'mac1', kind: 'files' } } },
      q3: { answers: 3, words: 'Which region do we open next?', item: { id: 'ut-r23q3001', sessionKey: KEY23, status: 'open', kind: 'action', by: 'agent', urgency: 'normal', createdAt: T23 - 120e3, text: 'Which region do we open next?', detail: '', options: ['Frankfurt — the closest to the EU customers', 'Singapore — the APAC waitlist', 'São Paulo — the newest sign-ups'] } },
      run: { answers: 3, words: null, item: { id: 'ut-r23run01', sessionKey: KEY23, status: 'open', kind: 'action', origin: 'vault', by: 'agent', urgency: 'urgent', text: 'ops bot wants to run a command with a stored secret', detail: 'Program: key-probe.sh', createdAt: T23 - 19e3, expiresAt: T23 + 3600e3,
        action: { type: 'vault-run-ask', askId: 'r'.repeat(32), always: false, window: true, tool: 'key-probe.sh' },
        facts: { v: 2, who: 'ops bot', tool: { name: 'key-probe.sh', path: '~/workspace/ops/net/key-probe.sh', writable: false }, cmd: 'net/key-probe.sh --site default --check wan,lan', folder: '~/workspace/ops',
          secrets: [{ name: NAME, entry: NAME, ref: 'vault://secrets/' + NAME + '/value', as: { kind: 'env', name: 'GW_KEY' }, own: false, provenance: 'stored', forHost: null, sendsTo: null }],
          env: [], hosts: { known: false, list: [], why: 'tool-names-none' }, shape: 'tool', always: { offered: false, why: 'destination-unknown', directive: null },
          reason: { notOwn: true, away: [{ ref: 'vault://secrets/' + NAME + '/value', forHost: null, host: null, unknown: true, keep: false }] }, templates: [], masking: 'common-encodings',
          window: { offered: true, until: T23 + 3600e3, entries: [NAME], switchOn: true } } } },
    };
    const S23 = `(() => { const w = ${CHAT(s23)}, d = w && w.element.querySelector('.chat-attn-dock'); if (!d || d.hidden) return null;
      const box = (e) => { if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) }; };
      const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
      const row = d.querySelector('.cad-rows > .ut-item'), q = row && row.querySelector(':scope > .ut-body > .ut-text'), head = d.querySelector(':scope > .cad-head'), comp = w.element.querySelector('.chat-input-area');
      const targets = [...d.querySelectorAll('button, [role="button"], summary')].filter(vis).map((b) => ({ k: (b.getAttribute('data-label') || b.textContent || '').trim().slice(0, 24), cls: b.className.split(' ')[0], ...box(b) }));
      const answers = [...d.querySelectorAll('.ut-exit-answer > button, .ut-opt')].filter(vis);
      return { id: row ? row.dataset.id : null, q: q && vis(q) ? q.textContent : null, qOne: !!q && Math.round(q.getBoundingClientRect().height) <= 46, num: vis(d.querySelector('.cad-num')) ? d.querySelector('.cad-num').textContent : null,
        look: vis(d.querySelector('.cad-look')), all: vis(d.querySelector('.cad-all')) ? getComputedStyle(d.querySelector('.cad-all'), '::after').content : null, answers: answers.length, open: d.classList.contains('cad-open'), expanded: head && head.getAttribute('aria-expanded'),
        dock: box(d), vh: innerHeight, comp: box(comp), targets, small: targets.filter((x) => x.h < 44 || x.w < 44).map((x) => x.k + ' ' + x.w + '×' + x.h), focus: document.activeElement ? document.activeElement.tagName + '.' + (document.activeElement.className || '').split(' ')[0] : null }; })()`;
    const onScreen = (x) => !!x && !!x.comp && x.comp.bottom <= x.vh + 1 && x.comp.top >= x.dock.bottom - 1;
    const foldedOk = (x, words) => !!x && !x.open && x.dock.h <= 56 && !!x.q && (words == null || x.q === words) && x.qOne && x.look && x.answers === 0 && !!x.all && /3/.test(x.num || '') && onScreen(x) && !x.small.length && x.expanded === 'false';
    const noToasts23 = `(() => { for (const t of document.querySelectorAll('#global-toasts > *')) t.remove(); return 1; })()`;
    const HEAD23 = `(() => { const h = ${CHAT(s23)}.element.querySelector('.chat-attn-dock > .cad-head'), r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;
    const show = async (it) => { await A.evalJs(PUSH23('[]')); await sleep(500); await A.evalJs(PUSH23(J([it, ...more23]))); await A.waitFor(`(() => { const x = ${S23}; return !!x && x.id === ${J(it.id)}; })()`, 8000); await sleep(900); await A.evalJs(noToasts23); await sleep(200); };
    for (const [name, S] of Object.entries(SHAPES23)) {
      await show(S.item);
      const f = await A.evalJs(S23);
      await A.shot(`phone-390-strip-${name}.png`);
      check(`㉓ ${name}: FOLDED on the phone — ${f && f.dock.h} px of ${f && f.vh} (≤ 56; the base drew this shape 192–338), the count «${f && f.num}», its words «${f && f.q && f.q.slice(0, 40)}» on ONE line, «View» and the door «${f && f.all}», no answer on the row (${f && f.answers}), every target ≥ 44 px, the composer on screen (${f && f.comp && f.comp.top}–${f && f.comp && f.comp.bottom})`, foldedOk(f, S.words), f);
      await openStrip(A);
      const o = await A.evalJs(S23);
      await A.shot(`phone-390-strip-${name}-open.png`);
      check(`㉓ ${name}: «View» OPENS that item in place — its ${o && o.answers} answers (${S.answers}), ${o && o.dock.h} px ≤ 45 % of ${o && o.vh}, the composer on screen, the head says it is open (aria-expanded ${o && o.expanded})`,
        !!o && o.open && o.id === S.item.id && o.answers === S.answers && o.dock.h <= Math.round(0.45 * o.vh) + 1 && onScreen(o) && o.expanded === 'true' && !o.small.length, o);
      const hp = await A.evalJs(HEAD23); await A.tapAt(hp.x, hp.y); await sleep(500);
      const c = await A.evalJs(S23);
      check(`㉓ ${name}: a tap on the head FOLDS it again (${c && c.dock.h} px)`, foldedOk(c, S.words), c);
    }
    // a newer item while it is open: IT STAYS OPEN on the item the person opened (主开发 2026-11-13, the owner's case — law 7: «the
    // open state survives a redraw of the strip: a new item arriving, a count change»; it was: the row folded to the newer one),
    // the count says 4; the composer keeps the focus
    await show(SHAPES23.hub.item); await openStrip(A);
    await A.evalJs(`(() => { const t = [...${CHAT(s23)}.element.querySelectorAll('.chat-input-area ~ * textarea, textarea')].find((x) => !x.closest('.chat-attn-dock') && x.getClientRects().length); t.focus(); return document.activeElement === t; })()`);
    const newer = { ...SHAPES23.q3.item, id: 'ut-r23newer', text: 'Rotate the staging password now?', createdAt: Date.now() };
    await A.evalJs(PUSH23(J([newer, SHAPES23.hub.item, ...more23]))); await A.waitFor(`(() => { const w = ${CHAT(s23)}, d = w && w.element.querySelector('.chat-attn-dock'); return !!d && /4/.test(((d.querySelector('.cad-count') || {}).textContent || '') + ((d.querySelector('.cad-num') || {}).textContent || '')); })()`, 8000); await sleep(600); await A.evalJs(noToasts23);
    const nw = await A.evalJs(S23), cnt = await A.evalJs(`(() => { const d = ${CHAT(s23)}.element.querySelector('.chat-attn-dock'); return ((d.querySelector('.cad-count') || {}).textContent || '') + ' ' + ((d.querySelector('.cad-num') || {}).textContent || ''); })()`);
    check(`㉓ a NEWER item while the row is open: it STAYS open on the item opened («${nw && nw.q && nw.q.slice(0, 30)}»), the count says «${cnt}» — and the composer keeps the focus (${nw && nw.focus})`, !!nw && nw.open && nw.id === SHAPES23.hub.item.id && /4/.test(cnt) && /^TEXTAREA/.test(nw.focus || ''), { nw, cnt });
    // ── round 2 (the acceptance of 6aed457b7). P1: «View» put a chip / ✕ under the finger and a second tap 150 ms later
    //    answered (only the Allows were armed) — EVERY button of the opened item answers nothing for ARM_MS (700 ms) after the
    //    open; at 820 ms the same tap answers. Three shapes. RED CONTROL: the open's stamp taken back (round 1's arm — the
    //    Allows only) ⇒ the leg red by name.
    const tap23 = async (p) => { await A.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] }); await sleep(30); await A.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
    const SPY23 = `(() => { window.__p23 = []; if (!window.__spy23) { window.__spy23 = 1; const f = window.fetch; window.fetch = function (u, o) { const m = String((o && o.method) || 'GET').toUpperCase(); if (m !== 'GET') window.__p23.push(m + ' ' + String(u).replace(location.origin, '') + ' ' + String((o && o.body) || '').slice(0, 60)); return f.apply(this, arguments); }; } return 1; })()`;
    const UNDER23 = (p) => `(() => { const e = document.elementFromPoint(${p.x}, ${p.y}), b = e && e.closest('button'); return b ? b.className.split(' ').slice(0, 3).join('.') + ' «' + (b.textContent || '').trim().slice(0, 30) + '»' : (e ? String(e.className) : null); })()`;
    const plain23 = { id: 'ut-r23plain1', sessionKey: KEY23, status: 'open', kind: 'action', by: 'agent', urgency: 'normal', createdAt: T23 - 60e3, text: 'Did the nightly backup finish on mac1?', detail: '' };
    const twice23 = async (it, { red = false } = {}) => {
      await show(it); await A.evalJs(SPY23);
      const at = await A.evalJs(OPENSTRIP), t0 = Date.now();
      await tap23(at); if (red) await A.evalJs(`(() => { ${CHAT(s23)}.element.querySelector('.chat-attn-dock')._openedAt = null; return 1; })()`);
      await sleep(Math.max(0, 150 - (Date.now() - t0))); const under = await A.evalJs(UNDER23(at)), t1 = Date.now() - t0; await tap23(at);
      await sleep(Math.max(0, 450 - (Date.now() - t0))); const t2 = Date.now() - t0; await tap23(at);
      await sleep(120); const early = await A.evalJs('[...window.__p23]'), st = await A.evalJs(S23);
      await sleep(Math.max(0, 820 - (Date.now() - t0))); const t3 = Date.now() - t0; await tap23(at); await sleep(500);
      const late = await A.evalJs('[...window.__p23]');
      return { under, at: [t1, t2, t3], early, still: st && { id: st.id, open: st.open }, late };
    };
    for (const [name, it] of [['hub', SHAPES23.hub.item], ['q3', SHAPES23.q3.item], ['plain', plain23]]) {
      const r = await twice23(it);
      await A.shot(`phone-390-strip-${name}-second-tap.png`);
      check(`㉓ r2 ${name}: «View», then a tap on the SAME point at ${r.at[0]} and ${r.at[1]} ms (${r.under} under it) answers NOTHING — no POST (${J(r.early)}), the item still open (${J(r.still)}); at ${r.at[2]} ms the same tap answers (${J(r.late)})`,
        r.early.length === 0 && !!r.still && r.still.id === it.id && r.still.open && r.late.length >= 1 && r.at[1] < 700, r);
      await A.evalJs(noToasts23);
    }
    const rr = await twice23(SHAPES23.q3.item, { red: true });
    check(`CONTROL (㉓ r2): the open's stamp taken back (round 1's arm, the Allows only) ⇒ the ${rr.at[0]} ms tap on ${rr.under} POSTs (${J(rr.early)}) — «answers NOTHING» goes red`, rr.early.length >= 1, rr);
    await A.evalJs(noToasts23);
    // P2 (the deadline law: a card with a deadline shows its time left everywhere it renders — the folded row hid «…40 sec
    //    left»): the FOLDED row shows the item's clock after its words, counted by the page's ticker; past the end, the state
    //    the card says (its accent); an item with none shows none. RED CONTROL: the clock's rules cut ⇒ red by name.
    const CLK23 = `(() => { const d = ${CHAT(s23)}.element.querySelector('.chat-attn-dock'), c = d && d.querySelector(':scope > .cad-clock'), l = d && d.querySelector('.cad-rows .ut-deadline'), vis = !!c && c.getClientRects().length > 0, r = vis ? c.getBoundingClientRect() : null, dr = d.getBoundingClientRect(), q = d.querySelector('.cad-rows .ut-text');
      return { vis, text: c ? c.textContent : null, state: c ? c.dataset.state || null : null, warn: !!c && c.classList.contains('ut-deadline-warn'), line: l ? { state: l.dataset.state, warn: l.classList.contains('ut-deadline-warn') } : null, inRow: !!r && r.top >= dr.top - 1 && r.bottom <= dr.bottom + 1 && r.right <= innerWidth, after: !!r && !!q && r.left >= q.getBoundingClientRect().right - 1, qw: q ? Math.round(q.getBoundingClientRect().width) : 0, h: Math.round(dr.height), open: d.classList.contains('cad-open'), tab: vis ? getComputedStyle(c).fontVariantNumeric : null }; })()`;
    const live23 = { ...SHAPES23.hub.item, id: 'ut-r23clk01', createdAt: Date.now() - 19e3, expiresAt: Date.now() + 41e3 };
    await show(live23); const k1 = await A.evalJs(CLK23); await sleep(2100); const k2 = await A.evalJs(CLK23);
    await A.shot('phone-390-strip-clock.png');
    check(`㉓ r2 a FOLDED row with a deadline shows its clock after its words — «${k1 && k1.text}» → «${k2 && k2.text}» 2 s later (${k2 && k2.tab}), inside its one row (${k2 && k2.h} px), the words keeping ${k2 && k2.qw} px`,
      !!k1 && !!k2 && k1.vis && k2.vis && !k1.open && k1.state === 'live' && /\d/.test(k1.text || '') && k1.text !== k2.text && k2.inRow && k2.after && k2.h <= 56 && /tabular-nums/.test(k2.tab || '') && k2.qw >= 60, { k1, k2 });
    const due23 = { ...SHAPES23.hub.item, id: 'ut-r23clk02', createdAt: Date.now() - 70e3, expiresAt: Date.now() - 10e3 };
    await show(due23); const k3 = await A.evalJs(CLK23);
    check(`㉓ r2 …past its end the folded clock says the card's state («${k3 && k3.text}», ${k3 && k3.state}, its accent ${k3 && k3.warn}) as the item's own line does (${J(k3 && k3.line)})`, !!k3 && k3.vis && k3.state === 'due' && k3.warn && !!k3.line && k3.line.state === 'due' && k3.line.warn && k3.inRow, k3);
    await show(SHAPES23.q3.item); const k0 = await A.evalJs(CLK23);
    check(`㉓ r2 …an item with no deadline shows no clock on its row (${k0 && k0.vis})`, !!k0 && !k0.vis && !k0.line, k0);
    // ── r3 (Q2 — the folded row's clock was a dead zone beside «View»: it is no row's child) and (Q3 — the last item gone, the
    //    hidden clock kept its stamps: the page's ticker counted it for up to 60 min): a CDP tap on the clock's rect ⇒ the item
    //    open; nothing waits ⇒ no [data-deadline-at] in the page and the ticker stopped (a line put in after it stays blank).
    //    RED CONTROL (below, a load of its own after the CSS cuts): this source with the r2 lines put back.
    let n23 = 0;
    const CLKAT23 = `(() => { const c = ${CHAT(s23)}.element.querySelector('.chat-attn-dock > .cad-clock'); if (!c || !c.getClientRects().length) return null; const r = c.getBoundingClientRect(), x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2); return { x, y, w: Math.round(r.width), hit: document.elementFromPoint(x, y) === c }; })()`;
    const TICK23 = `(async () => { const p = document.createElement('i'); p.dataset.deadlineAt = String(Date.now() + 30e3); p.dataset.deadlineFrom = String(Date.now() - 10e3); document.body.appendChild(p); await new Promise((r) => setTimeout(r, 1500)); const s = p.textContent; p.remove(); return s; })()`;
    const r3leg = async () => {
      const it = { ...SHAPES23.hub.item, id: 'ut-r23r3c' + (++n23), createdAt: Date.now() - 19e3, expiresAt: Date.now() + 41e3 };
      await show(it); const at = await A.evalJs(CLKAT23); if (at) { await tap23(at); await sleep(500); }
      const opened = await A.evalJs(`${CHAT(s23)}.element.querySelector('.chat-attn-dock').classList.contains('cad-open')`);
      await A.evalJs(PUSH23('[]')); await sleep(1600); // (nothing waits: the ticker's next second finds no line counting)
      return { at, opened, left: await A.evalJs(`document.querySelectorAll('[data-deadline-at]').length`), ticked: await A.evalJs(TICK23) };
    };
    const q23 = await r3leg();
    check(`㉓ r3 a tap on the FOLDED row's clock (${J(q23.at)}) opens the item (${q23.opened}) — no dead zone beside «View»`, !!q23.at && q23.at.hit && q23.opened === true, q23);
    check(`㉓ r3 nothing waits ⇒ no deadline stamp left in the page (${q23.left}) and its ticker stopped — a line put in after it reads «${q23.ticked}»`, q23.left === 0 && q23.ticked === '', q23);
    await show(SHAPES23.q3.item); // (the fill legs below read a FOLDED row: the r3 leg left nothing waiting)
    // P3: the folded head's count wears the attention fill while an item is unseen (window-announce) — as the desktop's
    //    count does; none without. RED CONTROL: the fill rule cut ⇒ red by name.
    const FILL23 = `(() => { const w = ${CHAT(s23)}, n = w.element.querySelector('.chat-attn-dock > .cad-head > .cad-num'), y = document.createElement('i'); y.style.cssText = 'position:absolute;width:1px;height:1px;background:var(--yellow)'; w.element.appendChild(y); const want = getComputedStyle(y).backgroundColor; y.remove(); return { vis: !!n && n.getClientRects().length > 0, bg: n ? getComputedStyle(n).backgroundColor : null, want }; })()`;
    const ANN23 = (on) => `(() => { ${CHAT(s23)}.element.classList.toggle('window-announce', ${on}); return 1; })()`;
    await A.evalJs(ANN23(true)); await sleep(150); const f1 = await A.evalJs(FILL23); await A.shot('phone-390-strip-announce.png');
    await A.evalJs(ANN23(false)); await sleep(150); const f0 = await A.evalJs(FILL23);
    check(`㉓ r2 the FOLDED head's count wears the attention fill while an item is unseen (window-announce: ${f1 && f1.bg} = the fill ${f1 && f1.want}), none without (${f0 && f0.bg})`, !!f1 && f1.vis && f1.bg === f1.want && !!f0 && f0.bg === 'rgba(0, 0, 0, 0)', { f1, f0 });
    const CUT23 = (a, b) => `(() => { let n = 0; const walk = (sheet) => { for (let i = sheet.cssRules.length - 1; i >= 0; i--) { const r = sheet.cssRules[i]; if (r.cssRules && !r.selectorText) { walk(r); continue; } const s = r.selectorText || ''; if (s.includes(${J(a)}) && s.includes(${J(b)})) { sheet.deleteRule(i); n++; } } }; for (const s of document.styleSheets) { try { walk(s); } catch { } } return n; })()`;
    const cutF = await A.evalJs(CUT23('window-announce', 'cad-num'));
    await A.evalJs(ANN23(true)); await sleep(150); const fr = await A.evalJs(FILL23); await A.evalJs(ANN23(false));
    check(`CONTROL (㉓ r2): the fill rule cut out (${cutF}) ⇒ the folded count is bare under window-announce (${fr && fr.bg}) — «wears the attention fill» goes red`, cutF >= 1 && !!fr && fr.vis && fr.bg !== fr.want, { cutF, fr });
    const cutC = await A.evalJs(CUT23('[data-vc="regular"]', 'cad-clock'));
    const live23b = { ...live23, id: 'ut-r23clk03', createdAt: Date.now() - 19e3, expiresAt: Date.now() + 41e3 };
    await show(live23b); const kr = await A.evalJs(CLK23);
    check(`CONTROL (㉓ r2): the folded clock's rules cut out (${cutC}) ⇒ no clock on the row (${kr && kr.vis}; «${kr && kr.text}» in the DOM) — «shows its clock» goes red`, cutC >= 3 && !!kr && !kr.vis && /\d/.test(kr.text || ''), kr);
    if (!DOCK_BUNDLE) check('CONTROL (㉓ r3): the r2 lines\' bundle builds from this source (its anchors are this lane\'s lines)', false, DOCK_ERR);
    else {
      mutant = { bundle: DOCK_BUNDLE };
      try {
        await toConv(A, s23, [], 390, 844, true); const q23r = await r3leg();
        check(`CONTROL (㉓ r3): the r2 lines put back ⇒ the clock's tap opens nothing (${q23r.opened}), ${q23r.left} stamp left, a line put in after it reads «${q23r.ticked}» — both r3 legs red`, !!q23r.at && q23r.at.hit && q23r.opened === false && q23r.left >= 1 && q23r.ticked !== '', q23r);
      } finally { mutant = null; }
    }
    // THE DESKTOP NEVER FOLDS (the .373 strip the owner accepted): the answers on the strip, no «View», the head no door
    await toConv(A, s23, [], 1280, 800, false); await show(SHAPES23.hub.item);
    const dk = await A.evalJs(S23);
    check(`㉓ the DESKTOP's strip never folds: its answers on it (${dk && dk.answers}), no «View» (${dk && dk.look}), the head no door (${dk && dk.expanded})`, !!dk && !dk.open && dk.answers === 3 && !dk.look && dk.expanded === null && dk.dock.h > 56, dk);
    // RED CONTROL: the phone block's rules cut out of the page's sheet (this lane's style.css block) ⇒ the folded-height leg is red
    await A.front(); await toConv(A, s23, [], 390, 844, true); await show(SHAPES23.hub.item);
    const cut = await A.evalJs(`(() => { let n = 0; const walk = (sheet) => { for (let i = sheet.cssRules.length - 1; i >= 0; i--) { const r = sheet.cssRules[i]; if (r.cssRules && !r.selectorText) { walk(r); continue; } if ((r.selectorText || '').includes('[data-vc="regular"]) .chat-attn-dock')) { sheet.deleteRule(i); n++; } } }; for (const s of document.styleSheets) { try { walk(s); } catch { } } return n; })()`);
    await sleep(500);
    const red = await A.evalJs(S23);
    await A.shot('phone-390-strip-red-control.png');
    check(`CONTROL (㉓): the phone block's ${cut} rules cut out of the page ⇒ the strip draws the whole card (${red && red.dock.h} px, ${red && red.answers} answers on it) — «${'FOLDED on the phone'}» goes red`, cut >= 10 && !foldedOk(red, SHAPES23.hub.words) && !!red && red.dock.h > 150, { cut, red });
    await A.evalJs(PUSH23('[]')); await sleep(400);
  } catch (e) { fail++; console.log('  ✗ ㉓ threw: ' + (e?.message || e)); }
  lap('㉓ done');

  check('the shots are written (phone 390: three shapes folded and open, the clock, the announce, the red control)', ['phone-390-strip-hub.png', 'phone-390-strip-hub-open.png', 'phone-390-strip-q3.png', 'phone-390-strip-run.png', 'phone-390-strip-clock.png', 'phone-390-strip-announce.png', 'phone-390-strip-red-control.png'].every((f) => fs.existsSync(path.join(SHOTS, f))));
  check('no page error', pageErrors.length === 0, pageErrors.slice(0, 5));
} catch (e) { fail++; console.log('  ✗ threw: ' + (e?.stack || e)); }

console.log(`\nshots: ${SHOTS}`);
console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
