#!/usr/bin/env node
// test-browser-takeover-queue-ui — HEAVY, chrome (lane browser-takeover-queue — a fleet power user, 2026-10-23: 「我觉得可以在
// browser 这个里面加一个像 Chatbot 的 outbox 一样的功能。经常会有很多时候它会需要我这边 take over 操作嘛，那所有等待我 take over
// 的都在这里集中一下，然后这样我多个 task 并行的时候都可以在这集中处理这些需要 take over 的东西」). SEEN, in zh, on the REAL page
// over a throwaway worktree server (test-browser-live-ui's boot: a fake claude per chat session, a fake agent-browser whose
// stream answers a fake upstream, the SHIPPED CLI under each session's own environment):
//   ① TWO conversations each ask a person (`vibespace-browser ask-human "<words>"` from inside each session) — the Agent
//      browser window's FIRST section is «等你接管» with ONE keyed row per request (conversation · its browser · «在等你 ·
//      …» · «agent 请你：<words>» · 接管 / 已完成 / 回复); the window title «Agent 浏览器 · 2 等你接管»; the rail's Browser
//      badge 2; the For-you tray holds the SAME two requests as urgent items with the takeover button
//   ② THE RECT CENSUS (desk 1400×900): every row inside the section, no two of its parts overlapping, no button's words cut,
//      nothing reading undefined / null / NaN — a PNG per state kept
//   ③ TAKE OVER (a real press on row 1): that session's live view opens with the input side TAKEN (mode takeover, mine),
//      its bar line «agent 请你：…»; the row turns «你正在操作 · 自 …» with 交还控制; title / badge count 1
//   ④ HAND BACK in the live view: the request done — the row leaves (keyed: row 2 is the SAME element), the line hides,
//      the agent's next verb runs
//   ⑤ DONE on row 2: resolved without a takeover — the empty line «没有等你接管的浏览器», the plain title, no badge
//   ⑥ THE FOR-YOU DOOR: a new ask ⇒ the tray's takeover button opens the live view with the input side OFFERED (watch,
//      the line shown, its Take over there); the agent's withdraw hides the line and resolves the item
//   ⑦ THE PHONE (390×844, zh): a waiting row's acts are ≥ 36 px tall, nothing past the screen's width, no cut words;
//      CONTROL — the phone rule removed at runtime ⇒ the 36 px census goes RED
// Artifacts: PNG + JSON per state under /tmp/vibespace-tq-ui-shots/run-<pid>-<time>/. SKIPs without chrome / dtach.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, deadPort, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const DEAD_CDP = await deadPort(); // the fake's cdp-url: a port the kernel just released, never a fixed one (§81)
const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1600) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await pred(); if (v) return v; } catch { } await sleep(every); } try { return await pred(); } catch { return null; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8'));
const FRAME = FIX.server_to_client.frame;
const zhDict = (await import('../src/lib/i18n-zh.js')).default;
const jaDict = (await import('../src/lib/i18n-ja.js')).default;
const tr = (lang, k) => (lang === 'zh' ? zhDict[k] : lang === 'ja' ? jaDict[k] : null) || k;
const ROOT = scratch('tq-ui');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
// THE ARTIFACTS: per run, outside the scratch root (the reaper's /tmp/vs-* shape) so they outlive the run; the newest three kept
const SHOTS_ROOT = path.join(os.tmpdir(), 'vibespace-tq-ui-shots');
const SHOTS = path.join(SHOTS_ROOT, `run-${process.pid}-${Date.now()}`);
fs.mkdirSync(SHOTS, { recursive: true });
try { const runs = fs.readdirSync(SHOTS_ROOT).filter((d) => /^run-\d+-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[2]) - Number(a.split('-')[2])); for (const d of runs.slice(3)) fs.rmSync(path.join(SHOTS_ROOT, d), { recursive: true, force: true }); } catch { }
console.log(`artifacts: ${SHOTS}`);

const procs = new Set();
const worktrees = new Set();
let fakeHome = null, wtData = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  // the dtach session (wrapper + fake CLI) outlives a server kill BY DESIGN — end every process that names this run
  for (const d of (() => { try { return fs.readdirSync('/proc'); } catch { return []; } })().filter((x) => /^\d+$/.test(x) && Number(x) !== process.pid)) {
    let s = ''; try { s = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8') + '\0' + fs.readFileSync(`/proc/${d}/environ`, 'utf8'); } catch { continue; }
    if ((wtData && s.includes(wtData + '/')) || s.includes(ROOT) || (fakeHome && s.includes(fakeHome))) { try { process.kill(Number(d), 'SIGKILL'); } catch { } }
  }
  for (const root of [ROOT, fakeHome]) { if (root) { try { endRootedProcesses(root); } catch { } } } // §57b: whatever the server started under this run's roots ends with it
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

/** The fake upstream stream server (the real 0.32.0 shapes), its tab count controllable. */
const URL0 = 'https://www.larksuite.com/en_sg/';
async function fakeUpstream({ fps = 2 } = {}) {
  const port = await freePort();
  const clients = new Set();
  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  const state = { tabs: 1 };
  const tabsMsg = () => JSON.stringify({ type: 'tabs', timestamp: Date.now(), tabs: Array.from({ length: state.tabs }, (_, i) => ({ tabId: 't' + (i + 1), title: i === 0 ? 'Lark | 飞书 — Sign in' : `Tab ${i + 1} — docs.example.com/a/very/long/path/${i}`, url: i === 0 ? URL0 : `https://docs.example.com/a/very/long/path/${i}`, active: i === 0, type: 'page', label: null })) });
  const frameMsg = () => JSON.stringify({ ...FRAME, metadata: { ...FRAME.metadata, timestamp: Date.now() } });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify(FIX.server_to_client.status)); ws.send(tabsMsg());
    ws.send(JSON.stringify({ type: 'url', url: URL0, timestamp: Date.now() }));
    ws.on('close', () => clients.delete(ws));
  });
  const timer = setInterval(() => { for (const c of clients) if (c.readyState === 1) c.send(frameMsg()); }, 1000 / fps);
  return { port, clients, setTabs(n) { state.tabs = n; for (const c of clients) if (c.readyState === 1) c.send(tabsMsg()); }, close() { clearInterval(timer); for (const c of clients) { try { c.terminate(); } catch { } } return new Promise((r) => wss.close(() => r())); } };
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  // ── fakes on PATH: a fake claude (a live chat session) and a fake agent-browser whose `stream status` names a fake upstream ──
  const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
  const SID = crypto.randomUUID();
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n%s\\n' '${hookLine}' '${initLine}';; esac\nexec sleep 1800\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const [a, b] = argv;
let ports = {}; try { ports = JSON.parse(fs.readFileSync(path.join(st, 'ports.json'), 'utf8')); } catch {}
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['1800'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'stream' && b === 'status') { const port = ports[ns] || ports['*'] || null; if (!port) { out({ success: false, data: null, error: 'fake: no stream for ' + ns }); process.exit(1); } out({ success: true, data: { connected: true, enabled: true, port, screencasting: false } }); process.exit(0); }
if (a === 'stream' && b === 'enable') { out({ success: false, data: null, error: 'Streaming is already enabled for this session' }); process.exit(1); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1, failed: [], sessions: [] } }); process.exit(0); }
if (a === 'set' && b === 'viewport') { out({ success: true, data: {} }); process.exit(0); } // lane S4: the live view sizes the page to its pane (\`set viewport W H\`) — the fake answers it; its frames keep their size (the view letterboxes, as before)
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
  const rememberPids = () => { try { for (const l of fs.readFileSync(path.join(AB_STATE, 'pids'), 'utf8').trim().split('\n')) { const pid = Number(l); if (pid) procs.add({ kill: () => process.kill(pid, 'SIGKILL') }); } } catch { } };
  const upE = await fakeUpstream(), upW = await fakeUpstream(), upP = await fakeUpstream();
  procs.add({ kill: () => { upE.close(); upW.close(); upP.close(); } });
  fs.writeFileSync(path.join(AB_STATE, 'ports.json'), JSON.stringify({ '*': upE.port }));

  // ── a throwaway worktree server (never the checkout's data/) ──
  fakeHome = scratchHome('tq-ui-home', fs);
  const wt = path.join(ROOT, 'wt');
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  wtData = path.join(wt, 'data');
  const PORT = await freePort(), CDP = await freePort();
  const baseEnv = { ...process.env, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), FAKE_AB_STATE: AB_STATE };
  for (const k of Object.keys(baseEnv)) if (k.startsWith('AGENT_BROWSER_')) delete baseEnv[k];
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env: { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 60000, 200), 'the worktree server booted', journal.slice(-800))) return;
  const j = async (method, p, body, headers = {}) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  await j('PATCH', '/api/settings', { 'browser.autoBindLiveView': false }); // the suite binds / unbinds by hand

  // ── two live chat sessions: one named like the owner's (it WILL browse), one that never browses ──
  const SESSION_NAME = 'Bank reconcile';
  const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
  procs.add({ kill: () => { try { wsMain.close(); } catch { } } });
  const create = async (reqId, sessionName) => { wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId, sessionName })); return until(() => msgs.find((m) => m.type === 'created' && m.reqId === reqId), 20000); };
  const c1 = await create('r1', SESSION_NAME), c2 = await create('r2', 'Mail sweep');
  if (!ok(c1 && c1.sessionId && c2 && c2.sessionId, 'two chat sessions were created (one will browse, one never does)', journal.slice(-600))) return;
  const S1 = c1.sessionId, S2 = c2.sessionId;
  await sleep(1500);
  // THE OWNER'S PATH: the agent starts its browser with `vibespace-browser open <url>` from inside the session —
  // the SHIPPED CLI under the session's own environment (read from the fake CLI's /proc environ)
  const sessionEnvOf = (sid) => {
    for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
      let env = ''; try { env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); } catch { continue; }
      if (!env.includes('CLAUDE_WEBUI_SESSION_ID=' + sid) || !env.includes('VIBESPACE_SESSION_TOKEN=')) continue;
      return Object.fromEntries(env.split('\0').filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));
    }
    return null;
  };
  const env1 = await until(() => sessionEnvOf(S1), 10000, 250);
  if (!ok(!!env1, "the browsing session's own environment (its token, its browser key) is readable from its process")) return;
  const opened = await new Promise((res) => { const c = spawn(process.execPath, [path.join(wt, 'data/bin/vibespace-browser'), 'open', URL0], { env: { ...env1, FAKE_AB_STATE: AB_STATE }, stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; }); const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 30000); c.on('close', (code) => { clearTimeout(t); res({ code, o }); }); });
  rememberPids();
  ok(opened.code === 0, `the agent's \`vibespace-browser open ${URL0}\` succeeded (the ephemeral browser — the owner's picture)`, opened.o.slice(0, 400));
  const token = env1.VIBESPACE_SESSION_TOKEN;

  // ── headless chrome, ONE page (3200×1100 CSS px: a bound 1400 px pane fits beside its chat) ──
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=3200,1100', 'about:blank'], { stdio: 'ignore' });
  procs.add(chrome);
  let target = null;
  for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!ok(!!target, 'chrome exposed a CDP page target')) return;
  const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((r) => cdp.on('open', r));
  procs.add({ kill: () => { try { cdp.close(); } catch { } } });
  let seq = 0; const pend = new Map();
  cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || 'eval threw').slice(0, 600)); return r.result?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: the first-run wizard would cover the chrome on an empty runner
  const VW = 3200, VH = 1100;
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });

  async function load(lang, theme) {
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/api/home` }); await sleep(250);
    await evaluate(`(() => { localStorage.setItem('vibespace.lang', ${JSON.stringify(lang)}); localStorage.setItem('theme', ${JSON.stringify(theme)}); localStorage.setItem('vs-onboarded', '1'); return 1; })()`);
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const up = await until(() => evaluate('(async () => { if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 150))]); })()'), 40000, 250);
    if (!up) throw new Error('the app did not boot');
    await until(() => evaluate(`(() => { const s = document.getElementById('loading-screen'); return !s || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0'; })()`), 10000);
    await evaluate('window.app.refreshBrowserProfiles && window.app.refreshBrowserProfiles()');
    await until(() => evaluate(`!!(window.app.sidebar._allSessions || []).find((s) => s.webuiId === ${JSON.stringify(S1)})`), 15000);
    await evaluate(`(() => { for (const id of [...window.app.wm.windows.keys()]) { try { window.app.wm.closeWindow(id); } catch {} } document.querySelectorAll('.context-menu,.taskbar-context-menu').forEach((m) => m.remove()); return 1; })()`);
    await sleep(250);
  }
  const setTheme = (theme) => evaluate(`(() => { window.app.themeManager.apply(${JSON.stringify(theme)}); return document.documentElement.getAttribute('data-theme'); })()`);
  const frames = () => evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))))');
  async function shot(file, clip) {
    const params = { format: 'png', captureBeyondViewport: false };
    if (clip) params.clip = { x: Math.max(0, clip.x), y: Math.max(0, clip.y), width: Math.max(1, Math.min(clip.width, VW - Math.max(0, clip.x))), height: Math.max(1, clip.height), scale: 1 };
    const r = await send('Page.captureScreenshot', params);
    if (r.result && r.result.data) fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  }

  try {
    const runCli = (env, argv) => new Promise((res) => { const c = spawn(process.execPath, [path.join(wt, 'data/bin/vibespace-browser'), ...argv], { env: { ...env, FAKE_AB_STATE: AB_STATE }, stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; }); const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 30000); c.on('close', (code) => { clearTimeout(t); res({ code, o }); }); });
    const env2 = await until(() => sessionEnvOf(S2), 10000, 250);
    if (!ok(!!env2, 'the second session\'s own environment is readable from its process')) return;
    const o2 = await runCli(env2, ['open', 'https://mail.example/inbox']); rememberPids();
    ok(o2.code === 0, 'the second conversation browses too (its own browser)', o2.o.slice(0, 300));
    const W1 = 'Log in to Lark with the shared account, then hand back', W2 = 'Solve the captcha on the mail page';
    const a1 = await runCli(env1, ['ask-human', W1]), a2 = await runCli(env2, ['ask-human', W2]);
    ok(a1.code === 0 && a2.code === 0 && /request tr-[0-9a-f]{8}/.test(a1.o) && /request tr-[0-9a-f]{8}/.test(a2.o), '① each conversation asks a person from inside its session (the shipped CLI\'s verb)', a1.o.slice(0, 300) + ' | ' + a2.o.slice(0, 300));
    const q0 = await j('GET', '/api/browser/takeovers');
    const R1 = (q0.json.requests || []).find((r) => r.text === W1), R2 = (q0.json.requests || []).find((r) => r.text === W2);
    if (!ok(R1 && R2 && q0.json.requests.length === 2, '① the hub lists both requests (the owner\'s GET)', q0.json)) return;
    const VWd = 1400, VHd = 900;
    await send('Emulation.setDeviceMetricsOverride', { width: VWd, height: VHd, deviceScaleFactor: 1, mobile: false });
    await load('zh', 'dark');
    await until(() => evaluate('(window.app._browserTakeovers || []).length === 2'), 15000);
    await evaluate('window.app.openBrowserProfiles(); 1');
    const panelSel = `[...window.app.wm.windows.values()].find((w) => w.type === 'browser-profiles')`;
    await until(() => evaluate(`(() => { const w = ${panelSel}; return !!(w && w.content.querySelectorAll('.btq-row').length === 2); })()`), 15000);
    const look = () => evaluate(`(() => {
      const w = ${panelSel}; if (!w) return null;
      const body = w.content.querySelector('.bprof-body'); const first = body && body.firstElementChild;
      const sec = w.content.querySelector('.btq-section');
      const rows = [...w.content.querySelectorAll('.btq-row')].map((r) => ({ id: r.dataset.requestId, conv: r.querySelector('.btq-conv').textContent, prof: r.querySelector('.btq-profile').textContent, state: r.querySelector('.btq-state').textContent, words: r.querySelector('.btq-words').textContent, acts: [...r.querySelectorAll('.btq-act')].map((b) => b.textContent), taken: r.classList.contains('btq-taken') }));
      const badge = document.querySelector('.rail-item[data-rail="browser"] .rail-badge');
      const emptyEl = w.content.querySelector('.btq-empty');
      return { firstIsQueue: first === sec, title: sec.querySelector('.bprof-section-title').textContent, sub: sec.querySelector('.bprof-section-sub').textContent, rows, winTitle: w.title, badge: badge ? badge.textContent : null, empty: emptyEl && getComputedStyle(emptyEl).display !== 'none' ? emptyEl.textContent : null };
    })()`);
    const v1 = await look();
    const r1 = v1.rows.find((r) => r.id === R1.id), r2 = v1.rows.find((r) => r.id === R2.id);
    ok(v1.firstIsQueue && v1.title === tr('zh', 'takeover::Waiting for you') && v1.title === '等你接管', '① the Agent browser window\'s FIRST section is «等你接管» (above Profiles)', v1);
    ok(r1 && r2 && r1.conv === 'Bank reconcile' && r2.conv === 'Mail sweep' && r1.words === 'agent 请你：' + W1 && /^在等你 · /.test(r1.state) && JSON.stringify(r1.acts) === JSON.stringify(['接管', '已完成', '回复']), '① one row per request: the conversation, «agent 请你：<words>», «在等你 · …», 接管 / 已完成 / 回复', v1.rows);
    ok(r1 && r1.prof === '它自己的浏览器', '① …and which browser (the conversation\'s own one here)', r1);
    ok(v1.winTitle === 'Agent 浏览器 · 2 等你接管' && v1.badge === '2', '① the window title and the rail\'s Browser badge say the count (2)', { title: v1.winTitle, badge: v1.badge });
    // the For-you tray: the SAME two requests as urgent items with the takeover button
    const ut = await j('GET', '/api/user-todos');
    const tItems = ((ut.json && ut.json.todos && ut.json.todos.open) || []).filter((i) => i.action && i.action.type === 'browser-takeover');
    ok(tItems.length === 2 && tItems.every((i) => i.urgency === 'urgent') && tItems.map((i) => i.action.requestId).sort().join() === [R1.id, R2.id].sort().join(), '① For you holds the SAME two requests as urgent items (one record, two places)', tItems.map((i) => ({ u: i.urgency, r: i.action && i.action.requestId })));
    // ② the rect census of the section (desk)
    const CENSUS = `(() => {
      const w = ${panelSel}; const sec = w.content.querySelector('.btq-section'); const sr = sec.getBoundingClientRect(); const bad = [];
      for (const row of sec.querySelectorAll('.btq-row')) {
        const rr = row.getBoundingClientRect();
        if (rr.left < sr.left - 0.5 || rr.right > sr.right + 0.5) bad.push('row outside the section');
        const parts = [...row.querySelectorAll('.btq-conv, .btq-profile, .btq-state, .btq-words, .btq-page, .btq-act')].filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0);
        for (const p of parts) {
          const b = p.getBoundingClientRect();
          if (b.right > rr.right + 0.5 || b.left < rr.left - 0.5) bad.push('outside its row: ' + p.className);
          if (p.tagName === 'BUTTON' && (p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1)) bad.push('cut: ' + p.textContent);
          if (/\\bundefined\\b|\\bnull\\b|\\bNaN\\b|\\[object/.test(p.textContent)) bad.push('bad text: ' + p.textContent);
        }
        for (let i = 0; i < parts.length; i++) for (let k = i + 1; k < parts.length; k++) { const a = parts[i].getBoundingClientRect(), c = parts[k].getBoundingClientRect(); const ww = Math.min(a.right, c.right) - Math.max(a.left, c.left), hh = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top); if (ww > 0.5 && hh > 0.5 && !parts[i].contains(parts[k]) && !parts[k].contains(parts[i])) bad.push('overlap ' + parts[i].className + ' × ' + parts[k].className); }
      }
      const acts = [...sec.querySelectorAll('.btq-act')].map((b) => Math.round(b.getBoundingClientRect().height));
      return { bad, acts, secRight: Math.round(sr.right), vw: innerWidth, docW: document.documentElement.scrollWidth };
    })()`;
    const winShot = async (name) => { const c = await evaluate(`(() => { const w = ${panelSel}; const r = w.element.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; })()`).catch(() => null); if (c) await shot(path.join(SHOTS, name + '.png'), c); };
    const cs1 = await evaluate(CENSUS);
    await winShot('desk-zh-two-waiting');
    ok(cs1.bad.length === 0, '② the desk census: every row inside the section, no part overlapping another, no button\'s words cut, no undefined / null / NaN', cs1.bad);
    // ③ TAKE OVER (a real press)
    const press = async (expr) => {
      const c = await evaluate(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); return { x, y, ok: !!hit && (hit === el || el.contains(hit)) }; })()`);
      if (!c || !c.ok) return false;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
      return true;
    };
    const rowEl = (id) => `${panelSel}.content.querySelector('.btq-row[data-request-id="${id}"]')`;
    const row2Mark = await evaluate(`(() => { const r = ${rowEl(R2.id)}; r.dataset.mark = 'kept'; return 1; })()`);
    ok(await press(`${rowEl(R1.id)}.querySelector('.btq-take')`), '③ the row\'s 接管 is pressed (a real mouse press where it is drawn)');
    const liveSel = `[...window.app.wm.windows.values()].find((w) => w.type === 'browser-live' && w._browserLive && w._browserLive.state().sessionId === ${JSON.stringify(S1)})`;
    const lv = await until(() => evaluate(`(() => { const w = ${liveSel}; if (!w) return null; const s = w._browserLive.state(); const a = w._browserLive.ask(); return s.mode === 'takeover' && s.mine && a.shown ? { mode: s.mode, mine: s.mine, ask: a } : null; })()`), 20000);
    ok(lv && lv.ask.text === 'agent 请你：' + W1, '③ Take over opens THAT session\'s live view with the input side TAKEN (mode takeover, mine) and the agent\'s words in its bar', lv);
    await until(() => evaluate(`(() => { const r = ${rowEl(R1.id)}; return !!(r && r.classList.contains('btq-taken')); })()`), 10000);
    const v3 = await look();
    const r1t = v3.rows.find((r) => r.id === R1.id);
    ok(r1t && r1t.taken && /^你正在操作 · 自 \d\d:\d\d/.test(r1t.state) && JSON.stringify(r1t.acts) === JSON.stringify(['打开实时视图', '交还控制']) && v3.winTitle === 'Agent 浏览器 · 1 等你接管' && v3.badge === '1', '③ the row says «你正在操作 · 自 …» with 交还控制; the title and the badge count 1', v3);
    await winShot('desk-zh-one-driven');
    const liveShot = await evaluate(`(() => { const w = ${liveSel}; const r = w.element.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 160) }; })()`); if (liveShot) await shot(path.join(SHOTS, 'live-zh-ask-line.png'), liveShot);
    // ④ HAND BACK in the live view
    ok(await press(`${liveSel}.element.querySelector('.browser-live-handback')`), '④ the live view\'s 交还控制 is pressed');
    const gone = await until(() => evaluate(`(() => { const w = ${liveSel}; return !${rowEl(R1.id)} && w && !w._browserLive.ask().shown && w._browserLive.state().mode !== 'takeover'; })()`), 15000);
    const v4 = await look();
    const keptRow = await evaluate(`(() => { const r = ${rowEl(R2.id)}; return r ? r.dataset.mark : null; })()`);
    ok(gone && v4.rows.length === 1 && keptRow === 'kept' && v4.winTitle === 'Agent 浏览器 · 1 等你接管', '④ Hand back resolves the request: its row leaves, the line hides, the other row is the SAME element (keyed, patched in place)', { gone, v4, keptRow });
    const q4 = await j('GET', '/api/browser/takeovers');
    const n1 = await runCli(env1, ['open', URL0]);
    ok(q4.json.requests.length === 1 && n1.code === 0 && !/human_asked/.test(n1.o), '④ …the hub agrees (one left) and the agent\'s next verb runs', n1.o.slice(0, 300));
    // ⑤ DONE on row 2 (the panel raised over the live view ③ opened — a press lands where it is drawn)
    await evaluate(`(() => { const w = ${panelSel}; window.app.wm.focusWindow(w.id); return 1; })()`); await frames();
    ok(await press(`${rowEl(R2.id)}.querySelector('.btq-done')`), '⑤ the row\'s 已完成 is pressed');
    await until(() => evaluate(`!${rowEl(R2.id)}`), 10000);
    const v5 = await look();
    ok(v5.rows.length === 0 && v5.empty === '没有等你接管的浏览器' && v5.winTitle === 'Agent 浏览器' && v5.badge === null, '⑤ Done resolves it without a takeover: the quiet empty line, the plain title, no badge', v5);
    await winShot('desk-zh-empty');
    // ⑥ THE FOR-YOU DOOR: the input side OFFERED
    const a3 = await runCli(env2, ['ask-human', 'Pick the right mailbox']);
    await until(() => evaluate(`(window.app._browserTakeovers || []).length === 1`), 10000);
    await evaluate(`(() => { for (const w of [...window.app.wm.windows.values()]) if (w.type === 'browser-live') { try { window.app.wm.closeWindow(w.id); } catch {} } return 1; })()`);
    await sleep(400);
    ok(await press(`document.getElementById('taskbar-user-todos')`), '⑥ the For-you button is pressed');
    const btn = await until(() => evaluate(`!!document.querySelector('#user-todos-popup .ut-action-takeover')`), 10000);
    ok(btn && await press(`document.querySelector('#user-todos-popup .ut-action-takeover')`), '⑥ the request\'s item carries the takeover button in the tray — pressed');
    const live2Sel = `[...window.app.wm.windows.values()].find((w) => w.type === 'browser-live' && w._browserLive && w._browserLive.state().sessionId === ${JSON.stringify(S2)})`;
    const lv2 = await until(() => evaluate(`(() => { const w = ${live2Sel}; if (!w) return null; const s = w._browserLive.state(); const a = w._browserLive.ask(); return s.connected !== false && a.shown ? { mode: s.mode, mine: s.mine, ask: a, take: getComputedStyle(w.element.querySelector('.browser-live-mode-btn')).display } : null; })()`), 20000);
    ok(a3.code === 0 && lv2 && lv2.mode !== 'takeover' && lv2.ask.text === 'agent 请你：Pick the right mailbox' && lv2.take !== 'none', '⑥ the For-you door opens the live view with the input side OFFERED (watching, the agent\'s words shown, its 接管 there)', lv2);
    const wd = await runCli(env2, ['ask-human', '--withdraw']);
    const hid = await until(() => evaluate(`(() => { const w = ${live2Sel}; return w && !w._browserLive.ask().shown; })()`), 10000);
    const ut2 = await j('GET', '/api/user-todos');
    const open2 = ((ut2.json && ut2.json.todos && ut2.json.todos.open) || []).filter((i) => i.action && i.action.type === 'browser-takeover' && i.status === 'open');
    ok(wd.code === 0 && hid && open2.length === 0, '⑥ the agent\'s withdraw hides the line and resolves the item', { wd: wd.o.slice(0, 200), hid, open2: open2.length });
    // ⑦ THE PHONE
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await load('zh', 'dark');
    const a4 = await runCli(env1, ['ask-human', 'Log in to the bank on your phone — the code comes by SMS']);
    await until(() => evaluate(`(window.app._browserTakeovers || []).length === 1`), 10000);
    await evaluate('window.app.openBrowserProfiles(); 1');
    await until(() => evaluate(`(() => { const w = ${panelSel}; return !!(w && w.content.querySelector('.btq-row')); })()`), 15000);
    await frames();
    const cs7 = await evaluate(CENSUS);
    await winShot('phone-zh-one-waiting');
    ok(a4.code === 0 && cs7.bad.length === 0 && cs7.docW <= cs7.vw + 1, '⑦ the phone census: inside the section, nothing overlapping, no cut words, nothing past the screen\'s width', cs7);
    ok(cs7.acts.length === 3 && cs7.acts.every((h) => h >= 36), '⑦ every act of a waiting row is ≥ 36 px tall on the phone (a thumb\'s target)', cs7.acts);
    await evaluate(`(() => { const s = document.createElement('style'); s.id = 'tq-ctl'; s.textContent = '.file-tool-btn.bprof-btn.btq-act { min-height: 0 !important; height: 22px !important; }'; document.head.appendChild(s); return 1; })()`);
    await frames();
    const ctl = await evaluate(CENSUS);
    ok(ctl.acts.some((h) => h < 36), 'CONTROL ⑦: the phone rule removed at runtime ⇒ the 36 px census goes RED (it can fail)', ctl.acts);
    await evaluate(`(() => { document.getElementById('tq-ctl').remove(); return 1; })()`);
    await runCli(env1, ['ask-human', '--withdraw']);
  } catch (e) {
    ok(false, 'the suite ran to its end', (e && (e.stack || e.message)) + '\n' + journal.slice(-1200));
  }
  console.log(`  artifacts: ${fs.readdirSync(SHOTS).filter((f) => f.endsWith('.png')).length} PNG in ${SHOTS}`);
})();

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(fail ? 1 : 0);
