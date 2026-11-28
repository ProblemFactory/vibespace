#!/usr/bin/env node
// THE COST UNDER A CHAT ACROSS A HUB RESTART, END TO END (lane artifacts-by-intent, 2.369.402 — 主开发's question, 09:46Z:
// «the first attach after a boot: through which road do the buffer's results reach the fold?»). By the code: the boot seeds
// the session's bare normalizer with the KEPT FACT resumed over the saved buffer (boot-restore costSeedOf, no seek); the first
// attach REBUILDS (ws-handler → normalizers.rebuildHistory): a NEW normalizer seeded with the old one's fold WITH seek, whose
// replay passes over every result that fold counted. A replay into the seeded normalizer itself would fold the buffer's
// results again (the present segment counted twice). This suite runs the real road:
//   a real worktree hub, a stub CLI behind the REAL chat-wrapper writing the 2.1.312 cost records (a running total per
//   process, its own share, result_index, uuid); process A (two turns, $2.50), process B (two turns, $1.95); a 650 KB answer
//   makes the wrapper's 500 KB ring DROP process A from the buffer file; the hub is SIGKILLed and restarted (the CLI lives on
//   in dtach); the page reloads (THE FIRST ATTACH AFTER THE BOOT), reloads again (a second attach), drops its socket (a
//   reconnect) — the chip reads $4.45 every time (A's last + B's last; the double count would read $6.40, the buffer alone
//   $1.95) — and a live turn after the restart adds to it ($4.75).
//   node scripts/test-cost-kept-chrome.mjs [--tree <another tree>]   (--tree: the same legs over another tree's code — the RED control)
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, CHROME_QUIET } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
const VNC_ENV = await vncEnv();
const require = createRequire(import.meta.url);
const ti = process.argv.indexOf('--tree');
const repo = ti > 0 ? path.resolve(process.argv[ti + 1]) : path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
try { execSync('command -v dtach', { stdio: 'ignore', shell: '/bin/bash' }); } catch { console.log('SKIP: dtach is not installed — a chat session cannot be created here'); process.exit(0); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('cost-kept-wt');
const fakeHome = scratchHome('cost-kept-home', fs);
const stubDir = scratch('cost-kept-stub');
fs.rmSync(stubDir, { recursive: true, force: true });
fs.mkdirSync(stubDir, { recursive: true });
const CWD = path.join(fakeHome, 'proj');
fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const check = (n, c, e) => { if (typeof c !== 'boolean') throw new TypeError(`check: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 700) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the stub CLI: the 2.1.312 cost records, one turn per user frame ──────────────
// COST=<usd> = the turn's own share; NEWPROC- = the records a NEW process writes (a resume: its running total and its
// result_index start again — the hub reads stdout, it cannot tell a resumed process from this); BIG- = a 650 KB answer
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.312 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = '0c057000-0000-4000-8000-0000000c0570';
const out = (o) => process.stdout.write(JSON.stringify({ ...o, session_id: SID }) + '\\n');
let n = 0; const U = () => '0c057000-0000-4000-8000-' + String(++n).padStart(12, '0');
const usage = { input_tokens: 1, output_tokens: 1 };
let total = 0, idx = 0, buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    let m = null; try { m = JSON.parse(line); } catch {}
    if (!m || m.type !== 'user') continue;
    const text = JSON.stringify(m.message);
    if (/NEWPROC-/.test(text)) { total = 0; idx = 0; }
    const c = Number((text.match(/COST=([0-9.]+)/) || [])[1] || 0);
    out({ type: 'system', subtype: 'init', model: 'claude-sonnet-5', cwd: process.cwd(), tools: [], permissionMode: 'default', claude_code_version: '2.1.312', uuid: U() });
    out({ type: 'system', subtype: 'session_state_changed', state: 'running', uuid: U() });
    if (/BIG-/.test(text)) for (let k = 0; k < 12; k++) out({ type: 'assistant', message: { id: 'msg_big_' + k, type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: ('pad' + k + ' ').repeat(10800) }], stop_reason: null, usage }, parent_tool_use_id: null, uuid: U() });
    const reply = 'ok ' + ((text.match(/T[0-9]+/) || ['?'])[0]);
    out({ type: 'assistant', message: { id: 'msg_' + U(), type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: reply }], stop_reason: 'end_turn', usage }, parent_tool_use_id: null, uuid: U() });
    total = Math.round((total + c) * 100) / 100;
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 5, num_turns: 1, result: reply, total_cost_usd: total, usage, modelUsage: { 'claude-sonnet-5': { costUSD: total, contextWindow: 200000 } }, model_usage_since_last_result: c ? { 'claude-sonnet-5': { costUSD: c } } : {}, result_index: idx++, uuid: U() });
    out({ type: 'system', subtype: 'session_state_changed', state: 'idle', uuid: U() });
  }
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── a throwaway server in a worktree (the tree's src/ + built public/ + the wrapper) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
let srv = null;
const SRV_LOG = path.join(stubDir, 'server.log');
const startServer = () => { const fd = fs.openSync(SRV_LOG, 'a'); srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' }, stdio: ['ignore', fd, fd] }); fs.closeSync(fd); };
const waitServer = async () => { for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
startServer();
const chrome = spawn(CHROME, [...CHROME_QUIET, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--user-data-dir=${wt}-chrome`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv && srv.kill('SIGKILL'); } catch {}
  for (const root of [wt, fakeHome, stubDir]) { try { endRootedProcesses(root); } catch {} } // every process this suite caused carries one of these paths (dtach, the wrapper, the stub)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  for (const d of [wt, `${wt}-chrome`, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const pend = new Map();
armWatchdog({ capMs: 300e3, exit: () => { cleanup(); process.exit(1); }, pending: () => [...pend.keys()].map((id) => `CDP call #${id}`) }); // the shared clock names the leg it hung in
await waitServer();

// ── raw CDP ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch {} if (!target) await sleep(250); }
if (!target) { console.error('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { try { pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown'); } catch {} }
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
const waitApp = () => evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })');
const VIEW = (sid) => `[...app.sessions.values()].find((v) => v && v.sessionId === ${JSON.stringify(sid)})`;
// the spend's figure as the page draws it («This chat ≈ $4.45 · …») — lane mask-value-shape (the strip's step two): a ROW of the
// context door (the bar's door rows, its panel), on the door's face only when billed per use; the figure is the row's own
const FIGURE = (sid) => `(() => { const r = ((${VIEW(sid)})?._statusBar?._doorRows || []).find((x) => x.key === 'cost'); const m = r && String(r.value || '').match(/\\$([0-9,]+\\.[0-9]{2})/); return m ? m[1] : null; })()`;
const figure = async (sid) => { try { return await evalJs(FIGURE(sid)); } catch { return null; } };
const figureIs = (sid, want, ms = 15000) => waitFor(`${FIGURE(sid)} === ${JSON.stringify(want)}`, ms);

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
const turn = (sid, text) => liveWs.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text }));
const dirFiles = (d, re) => { try { return fs.readdirSync(d).filter((n) => re.test(n)).map((n) => path.join(d, n)); } catch { return []; } };
const bufferResults = () => dirFiles(path.join(wt, 'data', 'session-buffers'), /\.buf$/).flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => /"type":"result"/.test(l)).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
const keptFacts = () => dirFiles(path.join(wt, 'data', 'session-meta'), /\.json$/).map((f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).costKept || null; } catch { return null; } }).filter(Boolean);

try {
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  await waitApp();
  await sleep(500);
  await openWs();

  console.log('— ① one conversation, two processes (the stub writes the CLI\'s running totals)');
  const sid = await create('cost-kept');
  check('a chat session is created (the stub behind the real chat-wrapper)', !!sid);
  check('the chat window attaches', verdictOf(await attach(sid, 'cost kept')));
  turn(sid, 'T1 COST=1.00');
  check('process A, turn 1: the chip reads $1.00', verdictOf(await figureIs(sid, '1.00')), await figure(sid));
  turn(sid, 'T2 COST=1.50');
  check('process A, turn 2: $2.50 — its running total replaces the figure, never adds ($3.50)', verdictOf(await figureIs(sid, '2.50')), await figure(sid));
  turn(sid, 'T3 NEWPROC- COST=1.25');
  check('process B starts again at its own share: A\'s last + B\'s = $3.75', verdictOf(await figureIs(sid, '3.75')), await figure(sid));
  turn(sid, 'T4 COST=0.70');
  check('process B, turn 2: $2.50 + $1.95 = $4.45', verdictOf(await figureIs(sid, '4.45')), await figure(sid));
  turn(sid, 'T5 BIG- COST=0');
  check('a 650 KB answer (no cost of its own) leaves $4.45', gateOf(await figureIs(sid, '4.45', 30000)) && verdictOf(await waitFor(`!!(${VIEW(sid)})?._messageList?.textContent?.includes('ok T5')`, 30000)), await figure(sid));

  console.log('— ② the wrapper\'s 500 KB ring drops process A from the buffer; the kept fact holds it');
  let rs = []; for (let i = 0; i < 40; i++) { rs = bufferResults(); if (rs.length && !rs.some((r) => r.total_cost_usd === 2.5 || r.total_cost_usd === 1)) break; await sleep(250); }
  check('the buffer file no longer holds process A\'s results (the trim is real); B\'s last is there', rs.length > 0 && !rs.some((r) => r.total_cost_usd === 2.5 || r.total_cost_usd === 1) && verdictOf(rs.some((r) => r.total_cost_usd === 1.95)), rs.map((r) => [r.result_index, r.total_cost_usd]));
  let kept = []; for (let i = 0; i < 40; i++) { kept = keptFacts(); if (kept.some((k) => k.done === 2.5 && k.last === 1.95)) break; await sleep(250); }
  check('the conversation\'s meta keeps the fold: {done 2.50, last 1.95} with its last result\'s key', verdictOf(kept.some((k) => k.done === 2.5 && k.last === 1.95 && typeof k.key === 'string')), kept);

  console.log('— ③ THE HUB RESTARTS (the CLI lives on in dtach); the page attaches again');
  try { srv.kill('SIGKILL'); } catch {}
  await new Promise((r) => { if (srv.exitCode !== null || srv.signalCode) return r(); srv.once('exit', r); });
  startServer();
  check('the restarted server answers', verdictOf(await waitServer()));
  try { liveWs.terminate(); } catch {}
  await openWs();
  await cdp('Page.reload', {});
  await waitApp(); await sleep(500);
  if (!(await waitFor(`!!(${VIEW(sid)})?._messageList`, 8000))) await attach(sid, 'cost kept');
  check('THE FIRST ATTACH AFTER THE BOOT: the chip reads $4.45 — not the buffer\'s $1.95, not the double count $6.40', verdictOf(await figureIs(sid, '4.45', 20000)), await figure(sid));
  await cdp('Page.reload', {});
  await waitApp(); await sleep(500);
  if (!(await waitFor(`!!(${VIEW(sid)})?._messageList`, 8000))) await attach(sid, 'cost kept');
  check('a SECOND attach: still $4.45', verdictOf(await figureIs(sid, '4.45', 20000)), await figure(sid));
  await evalJs('app.ws.ws.close(); true');
  await sleep(1500);
  check('a RECONNECT (the page\'s socket dropped): still $4.45', gateOf(await waitFor('app.ws?.ws?.readyState === 1', 20000)) && verdictOf(await figureIs(sid, '4.45', 20000)), await figure(sid));
  turn(sid, 'T6 COST=0.30');
  check('a live turn after the restart: process B $2.25 ⇒ $2.50 + $2.25 = $4.75', verdictOf(await figureIs(sid, '4.75', 20000)), await figure(sid));
  check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 3));
} catch (e) {
  failed++; console.error('  ✗ the suite threw: ' + (e && e.stack || e));
}
console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
