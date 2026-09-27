#!/usr/bin/env node
// "WHICH BROWSER IS THIS CONVERSATION USING" HAS ONE ANSWER, AND EVERYTHING FOLLOWS IT — the chrome gate (lane S2,
// heavy). Naive-user study 2 (2.369.186, SharedContext/vibespace-naive-study-2.md, T4 / T5 / T7):
//   "Session properties says pinned 'work'; the status-bar chip says 'Agent browser · tester-b-scratch' then
//    '(ephemeral) Second chat'; the live view tab says 'ephemeral (no profile)'" · "实况窗口一直显示旧画面，上面盖着红字
//    'Live view unavailable: this session is not attached to bp-56a75ced'，点 Reconnect 没反应" · "侧窗格、浮动窗口、
//    键盘输入框三种方式，字全都没到页面里，也没有任何'没送到'的提示" · "永久删除后，'会话属性'仍写 PINNED PROFILE
//    'bp-17eb27c4'" · "新建对话框里的档案列表丢了".
// Scene: a worktree server on a free port, a fake `claude` (three chat sessions), a fake `agent-browser` whose
// `stream status` names one fake stream server per namespace and whose `get cdp-url` names a fake Chrome, a desktop
// page 1280×900. Every act the study took is a REAL click / key through CDP.
//   1  COHERENCE — pinned work, Personal attached instead: the chip, the chip's menu, Session Properties (opened
//      BEFORE the pin: it updates without a reopen), the sidebar card chip and the live view (its title + the strip's
//      "(in use)" tab) print the SAME line, amber, both names; then work attached ⇒ all say "work", neutral. Session
//      Properties' value is ONE line (never "wor / k"), its buttons are the window's own, Esc closes it.
//   2  THE LIVE VIEW FOLLOWS — work is recreated (detach, stop, delete with unpin, a new "work", attach): the open
//      live view retargets to the NEW browser by itself (frames from its stream, no red overlay); a view forced onto
//      the OLD id shows the refusal, and a REAL click on Reconnect re-resolves it to the browser in use
//   3  DELETE A PINNED PROFILE — a REAL click on Set aside: the dialog says "1 conversation(s) use this profile —
//      unpin them?"; one click unpins + sets aside; that chat's chip says "… was deleted — its pin was cleared", its
//      Session Properties show no raw bp- id; the API refuses a pinned delete without unpin (409 pinned)
//   4  THE NEW SESSION DIALOG reads the registry the panel reads: a shared profile is listed, and a profile created
//      while the dialog is OPEN appears without reopening it
//   5  EVERY INPUT HAS A RECEIPT — a SHARED (mediated) profile, a REAL Take over, REAL keys: a stream server that
//      dispatches ⇒ the fake Chrome receives the key through the REAL mediator (paused: the user drives) and the bar
//      keeps "Typing goes to the browser"; a stream server that DROPS ⇒ within ~1.5 s the bar says "Input is not
//      reaching the browser" and "not delivered — …" (never the study's silence)
// SKIPs with evidence without chrome / dtach. Free ports, scratch dirs only; ZERO vendor calls (stub CLI).
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // never the machine-global :7/5901 (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require('ws');
const BF = require('../src/browser-fact.js');
const MED = require('../src/browser-mediation.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 1200) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 80) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await pred()) return true; } catch { } await sleep(every); } try { return !!(await pred()); } catch { return false; } };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8'));
const FRAME = FIX.server_to_client.frame;
const ROOT = scratch('browser-identity');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set(); const worktrees = new Set(); let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { for (const pid of fs.readFileSync(path.join(ROOT, 'ab-state', 'pids'), 'utf8').split('\n').filter(Boolean)) { try { process.kill(Number(pid), 'SIGKILL'); } catch { } } } catch { }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const done = () => { console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? ', ' + skipped + ' skipped' : ''})` : `\nALL PASS (${pass}${skipped ? ', ' + skipped + ' skipped' : ''})`); process.exit(fail ? 1 : 0); };

/** A fake stream server: status + tabs + frames; `onInput(record)` sees every input record; counts connections. */
async function fakeUpstream({ fps = 4, onInput = null, onConnect = null, tabsTargetId = null } = {}) {
  const port = await freePort();
  const clients = new Set(); let connections = 0; const inputs = [];
  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  wss.on('connection', (ws) => {
    connections++; clients.add(ws);
    ws.send(JSON.stringify(FIX.server_to_client.status)); ws.send(JSON.stringify(tabsTargetId ? { ...FIX.server_to_client.tabs, tabs: FIX.server_to_client.tabs.tabs.map((t) => ({ ...t, targetId: tabsTargetId })) } : FIX.server_to_client.tabs)); // verify r2: 0.38.1's tabs record names each tab's CDP targetId
    try { onConnect?.(); } catch { }
    ws.on('message', (d) => { let m = null; try { m = JSON.parse(d); } catch { return; } if (/^input_/.test(m.type)) { inputs.push(m); try { onInput?.(m); } catch { } } });
    ws.on('close', () => clients.delete(ws)); ws.on('error', () => { });
  });
  const timer = setInterval(() => { for (const c of clients) if (c.readyState === 1) c.send(JSON.stringify({ ...FRAME, metadata: { ...FRAME.metadata, timestamp: Date.now() } })); }, 1000 / fps);
  return { port, clients, inputs, get connections() { return connections; }, close() { clearInterval(timer); for (const c of clients) { try { c.terminate(); } catch { } } return new Promise((r) => wss.close(() => r())); } };
}
/** A fake Chrome: /json/version over http + a CDP websocket that answers every call and records the methods. */
async function fakeChrome() {
  const port = await freePort(); const saw = [];
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ Browser: 'Chrome/146.0.0.0', 'Protocol-Version': '1.3', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/fake` })); });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => ws.on('message', (d) => { let m = null; try { m = JSON.parse(d); } catch { return; } saw.push(m.method); ws.send(JSON.stringify({ id: m.id, result: m.method === 'Target.getTargets' ? { targetInfos: [] } : m.method === 'Target.createTarget' ? { targetId: 'T-M' } : m.method === 'Target.attachToTarget' ? { sessionId: 'S-' + (m.params && m.params.targetId) } : {} })); }))); // verify r2: a tab and a session per ask, as Chrome
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { port, url: `ws://127.0.0.1:${port}/devtools/browser/fake`, saw, close() { for (const c of wss.clients) { try { c.terminate(); } catch { } } return new Promise((r) => server.close(() => r())); } };
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  fakeHome = scratchHome('browser-identity-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: '%s', hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: '%s', cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\nSID="e2e00000-0000-4000-8000-$(printf '%012d' $$)"\ncase " $* " in *" --output-format "*) sleep 1; printf '${hookLine}\\n${initLine}\\n' "$SID" "$SID";; esac\nexec sleep 600\n`, { mode: 0o755 });
  // the fake agent-browser: a daemon is a real `sleep`; `get cdp-url` answers cdp.json[ns] (a fake Chrome) else a dummy;
  // `stream status` answers ports.json[ns] and RECORDS the CDP url it was run with (a mediated lease's scoped url) in med.json
  fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const readJ = (n) => { try { return JSON.parse(fs.readFileSync(path.join(st, n), 'utf8')); } catch { return {}; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { const c = readJ('cdp.json'); out({ success: true, data: { cdpUrl: c[ns] || ('ws://127.0.0.1:19222/devtools/browser/fake-' + ns) } }); process.exit(0); }
if (a === 'stream' && b === 'status') { const ports = readJ('ports.json'); const port = ports[ns] || null; if (process.env.AGENT_BROWSER_CDP) { const m = readJ('med.json'); m[ns] = process.env.AGENT_BROWSER_CDP; fs.writeFileSync(path.join(st, 'med.json'), JSON.stringify(m)); } if (!port) { out({ success: false, data: null, error: 'no fake upstream for ' + ns }); process.exit(1); } out({ success: true, data: { enabled: true, connected: true, port, screencasting: true } }); process.exit(0); }
if (a === 'stream' && b === 'enable') { out({ success: false, data: null, error: 'Streaming is already enabled for this session' }); process.exit(1); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
  const writeJ = (n, o) => fs.writeFileSync(path.join(AB_STATE, n), JSON.stringify(o));
  const readJ = (n) => { try { return JSON.parse(fs.readFileSync(path.join(AB_STATE, n), 'utf8')); } catch { return {}; } };
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const env = { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), FAKE_AB_STATE: AB_STATE, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_BROWSER_') || /^(ANTHROPIC|OPENAI|CODEX)_/.test(k)) delete env[k];
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 40000, 100), 'the worktree server booted', journal.slice(-800))) return;
  const j = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
  const create = async (reqId, name) => { wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId, name })); await until(() => msgs.some((m) => m.type === 'created' && m.reqId === reqId), 15000); return msgs.find((m) => m.type === 'created' && m.reqId === reqId)?.sessionId; };
  const SID = {};
  for (const [k, n] of [['P', 'Pin chat'], ['D', 'Delete chat'], ['M', 'Shared chat']]) SID[k] = await create(k, n);
  const ups = []; let chromeProc = null; let fchrome = null;
  try {
    if (!ok(Object.values(SID).every(Boolean), 'three chat sessions were created on the fake claude', journal.slice(-600))) return;
    await sleep(1200);
    const keyOf = async (sid) => (await j('GET', `/api/browser/session/${sid}`)).json?.browserKey || null;
    const bkP = await keyOf(SID.P);
    if (!ok(!!bkP, 'the sessions hold browser keys (browser isolation is on)')) return;
    const mkProfile = async (label, extra = {}) => (await j('POST', '/api/browser/profiles', { label, ...extra })).json?.profile || null;
    const withUpstream = async (profile, opts) => { const u = await fakeUpstream(opts); ups.push(u); const ports = readJ('ports.json'); ports['vs-' + profile.id] = u.port; writeJ('ports.json', ports); return u; };
    const WORK1 = await mkProfile('work'); const PERS = await mkProfile('Personal');
    const U = { W1: await withUpstream(WORK1), PE: await withUpstream(PERS) };

    chromeProc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });
    procs.add(chromeProc);
    let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
    if (!ok(!!target, 'chrome exposed a CDP page target')) return;
    const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
    let seq = 0; const pend = new Map();
    cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
    const S = JSON.stringify;
    const ev = async (js) => {
      const r = await send('Runtime.evaluate', { expression: `(async () => { const app = window.app, wm = app.wm; const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }; const sidOf = (id) => (app.sessions.get(id) || {}).sessionId || null; const chat = (sid) => [...wm.windows.values()].find((w) => w.type === 'chat' && sidOf(w.id) === sid) || null; const lives = (sid) => [...wm.windows.values()].filter((w) => w.type === 'browser-live' && w._browserLive && w._browserLive.state().sessionId === sid); const live = (sid) => wm.windows.get('win-blive-' + sid) || lives(sid)[0] || null; const row = (sid) => (app.sidebar._allSessions || []).find((x) => x.webuiId === sid) || null; const props = (sid) => { const r = row(sid); const k = r ? app.sidebar._getSessionStateKey(r) : null; return [...wm.windows.values()].find((w) => w._sessionPropsKey === k) || null; }; ${js} })()`, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
      return r.result?.result?.value;
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const booted = await until(async () => ev('if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);'), 40000, 250);
    if (!ok(booted, 'the app booted in headless chrome (1280×900)')) return;
    await sleep(1000);
    await ev('await app.refreshBrowserProfiles(); return true;');
    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const click = async (pt) => { await mouse('mouseMoved', pt.x, pt.y); await mouse('mousePressed', pt.x, pt.y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', pt.x, pt.y, { button: 'left', clickCount: 1 }); await sleep(250); };
    const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const key = async (k, code, vk, text) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); await sleep(120); };
    /** The fact the CLIENT holds for a session (the payload's browserFact on the merged row) and its words in English. */
    const factOf = async (sid) => ev(`const r = row(${S(sid)}); return r && r.browserFact ? r.browserFact : null;`);
    const lineOf = async (sid) => { const f = await factOf(sid); return f ? BF.browserFactWords(f).line : null; };
    const chipOf = (sid) => ev(`const w = chat(${S(sid)}); const c = w && w.element.querySelector('.chat-status-browser'); return c ? { text: c.textContent.trim(), amber: c.classList.contains('amber'), title: c.title } : null;`);
    const propsLine = (sid) => ev(`const w = props(${S(sid)}); const v = w && w.content.querySelector('.session-props-browser-line'); return v ? { text: v.textContent, amber: v.classList.contains('amber'), ws: getComputedStyle(v.closest('.session-detail-value')).whiteSpace, lines: Math.round(v.closest('.session-detail-value').getBoundingClientRect().height / parseFloat(getComputedStyle(v.closest('.session-detail-value')).lineHeight || '14')) } : null;`);

    // ── 1 · coherence ──
    console.log('— 1 · coherence: the chip, its menu, Session Properties, the card chip and the live view print ONE answer');
    await ev(`app.attachSession(${S(SID.P)}, 'Pin chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev(`return !!chat(${S(SID.P)});`), 10000);
    await ev(`app.openSessionProps(row(${S(SID.P)})); return true;`);
    await until(() => ev(`return !!props(${S(SID.P)});`), 5000);
    // the study's T5-09: Session Properties was open BEFORE the pin and must follow it without a reopen
    let r = await j('POST', '/api/browser/pin', { sessionId: SID.P, profile: 'work' });
    ok(r.status === 200 && r.json.pin && r.json.pin.profileId === WORK1.id, 'the user pins "work" (the pin route — the picker\'s one write)', S(r.json).slice(0, 200));
    ok(await until(async () => { const p = await propsLine(SID.P); return p && /work/.test(p.text); }, 8000), 'Session Properties (open since before the pin) now says "work" — no reopen');
    r = await j('POST', '/api/browser/attach', { sessionId: SID.P, profile: 'Personal' });
    ok(r.status === 200, 'Personal is attached instead (the study\'s T5: pinned one, running another)', S(r.json).slice(0, 200));
    await ev(`app.openBrowserLive({ sessionId: ${S(SID.P)} }); return true;`);
    const liveUp = await until(() => ev(`const L = live(${S(SID.P)}); return !!(L && L._browserLive.state().frames >= 1);`), 15000);
    ok(liveUp, 'the live view of Pin chat draws');
    const want1 = 'pinned work · running Personal — Personal is attached instead';
    ok(await until(async () => (await lineOf(SID.P)) === want1, 8000), `THE fact (server-computed, carried on active-sessions) says "${want1}"`, await lineOf(SID.P));
    const surfaces = async (sid) => {
      const chip = await chipOf(sid);
      const pl = await propsLine(sid);
      const lv = await ev(`const L = live(${S(sid)}); const st = L && L._browserLive.state(); return st ? { title: (L.titleSpan && L.titleSpan.textContent) || '', inUse: st.rows.filter((x) => / \\(in use\\)$/.test(x.text)).map((x) => x.text), target: st.target && (st.target.profileId || st.target.ref) } : null;`);
      const card = await ev(`return [...document.querySelectorAll('.sess-browser-chip .chip-text')].map((e) => e.textContent);`);
      const menu = await ev(`const w = chat(${S(sid)}); const c = w.element.querySelector('.chat-status-browser'); c.click(); await new Promise((r) => setTimeout(r, 150)); const dd = document.querySelector('.chat-status-dropdown'); const t = dd && dd.querySelector('.chat-status-browser-facts') ? dd.querySelector('.chat-status-browser-facts').textContent : null; if (dd) dd.remove(); return t;`);
      return { chip, props: pl, live: lv, card, menu };
    };
    const s1 = await surfaces(SID.P);
    ok(s1.chip && s1.chip.text === 'Agent browser · ' + want1 && s1.chip.amber, 'the status-bar chip prints it (amber, both names)', S(s1.chip));
    ok(s1.menu === want1, 'the chip\'s menu prints the same line (never "pinned: ephemeral (no profile)")', S(s1.menu));
    ok(await until(async () => { const p = await propsLine(SID.P); return p && p.text === want1 && p.amber; }, 6000), 'Session Properties prints the same line (it re-renders on the broadcast the fact rides)', S(await propsLine(SID.P)));
    ok(s1.card.includes('Agent browser · ' + want1), 'the sidebar card\'s chip prints the same line', S(s1.card));
    ok(s1.live && s1.live.target === PERS.id && s1.live.inUse.length === 1 && /^Personal/.test(s1.live.inUse[0]) && /^Personal/.test(s1.live.title), 'the live view shows the browser in use (Personal): its title names it and the strip marks that tab "(in use)" — the ONE marker, never the set\'s "(default)"', S(s1.live));
    // the pinned profile attached too ⇒ it is the default ⇒ everything says "work", neutral
    r = await j('POST', '/api/browser/attach', { sessionId: SID.P, profile: 'work' });
    ok(r.status === 200, 'work is attached (the pin is now among the attachments — the default)');
    ok(await until(async () => (await lineOf(SID.P)) === 'work', 8000), 'THE fact now says "work"', await lineOf(SID.P));
    ok(await until(async () => { const c = await chipOf(SID.P); return c && c.text === 'Agent browser · work' && !c.amber; }, 8000), 'the chip says "Agent browser · work", neutral', S(await chipOf(SID.P)));
    await until(async () => { const p = await propsLine(SID.P); return p && p.text === 'work'; }, 6000);
    const s2 = await surfaces(SID.P);
    ok(s2.menu === 'work' && s2.props && s2.props.text === 'work' && !s2.props.amber, 'the menu and Session Properties say "work" too', S({ menu: s2.menu, props: s2.props }));
    ok(await until(() => ev(`const L = live(${S(SID.P)}); const st = L._browserLive.state(); return st.target && st.target.profileId === ${S(WORK1.id)} && st.frames >= 1;`), 10000), 'the live view FOLLOWED the conversation onto work by itself (it was showing the browser in use)', S(await ev(`const st = live(${S(SID.P)})._browserLive.state(); return { target: st.target, followed: st.followed };`)));
    // Session Properties: one line, the window's own buttons, Esc closes
    const pbt = await ev(`const w = props(${S(SID.P)}); const b = w.content.querySelector('.session-props-browser-pin'); const l = w.content.querySelector('.session-props-browser-live'); const cs = getComputedStyle(b); return { cls: b.className + ' ' + l.className, bg: cs.backgroundColor, border: cs.borderTopStyle, radius: cs.borderTopLeftRadius };`);
    const bgInput = await ev(`const d = document.createElement('div'); d.style.background = 'var(--bg-input)'; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c;`);
    ok(/task-detail-btn/.test(pbt.cls) && pbt.bg === bgInput && pbt.radius !== '0px', 'Session Properties\' two buttons are the window\'s own (task-detail-btn: the theme\'s input fill + radius), never the browser\'s white default', S({ pbt, bgInput }));
    const pl = await propsLine(SID.P);
    ok(pl && pl.ws === 'nowrap', 'the profile value is ONE line (white-space: nowrap — never "wor / k")', S(pl));
    await ev(`const w = props(${S(SID.P)}); w.element.focus(); return true;`);
    await key('Escape', 'Escape', 27);
    ok(await until(() => ev(`return !props(${S(SID.P)});`), 3000), 'Esc closes Session Properties');

    // ── 2 · the live view follows a RECREATED profile; Reconnect re-resolves ──
    console.log('— 2 · work is recreated: the live view retargets by itself; Reconnect re-resolves a stale view');
    await j('POST', '/api/browser/detach', { sessionId: SID.P, profile: 'Personal' });
    await j('POST', '/api/browser/detach', { sessionId: SID.P, profile: 'work' });
    await j('POST', `/api/browser/profiles/${WORK1.id}/stop`);
    r = await j('DELETE', `/api/browser/profiles/${WORK1.id}`);
    ok(r.status === 409 && r.json.code === 'pinned' && r.json.count === 1, 'deleting the pinned "work" without unpin is refused `pinned` (count 1)', S(r.json));
    r = await j('DELETE', `/api/browser/profiles/${WORK1.id}?unpin=1`);
    ok(r.status === 200 && r.json.unpinned === 1, '…with unpin it goes, its pin cleared', S(r.json));
    const WORK2 = await mkProfile('work');
    U.W2 = await withUpstream(WORK2);
    r = await j('POST', '/api/browser/attach', { sessionId: SID.P, profile: 'work' });
    ok(r.status === 200 && WORK2.id !== WORK1.id, `a NEW "work" (${WORK2.id}) is attached — the old one was ${WORK1.id}`);
    const followed = await until(() => ev(`const L = live(${S(SID.P)}); const st = L._browserLive.state(); return st.target && st.target.profileId === ${S(WORK2.id)} && st.connected && !st.error;`), 15000);
    const f2 = await ev(`const L = live(${S(SID.P)}); const st = L._browserLive.state(); const se = L._browserLive.el().querySelector('.browser-live-status'); return { target: st.target, error: st.error, followed: st.followed, statusShown: se.style.display !== 'none', statusText: se.textContent, statusError: se.classList.contains('error') };`);
    ok(followed && U.W2.connections >= 1 && !(f2.statusShown && f2.statusError), 'the open live view RETARGETED to the new work by itself — its stream connected, no red overlay (the study: "stays on the old browser, red not-attached overlay")', S(f2));
    ok(await until(() => ev(`return live(${S(SID.P)})._browserLive.state().frames >= 1 && live(${S(SID.P)})._browserLive.state().target.profileId === ${S(WORK2.id)};`), 6000), '…and draws the new browser\'s frames');
    // a view forced onto the OLD id shows the refusal; a REAL click on Reconnect re-resolves it
    await ev(`live(${S(SID.P)})._browserLive.switchTo(${S(WORK1.id)}); return true;`);
    const stale = await until(() => ev(`const st = live(${S(SID.P)})._browserLive.state(); return !!(st.error && st.error.code === 'not_attached');`), 8000);
    const re = await ev(`const b = live(${S(SID.P)})._browserLive.el().querySelector('.browser-live-reconnect'); return b && b.style.display !== 'none' ? rect(b) : null;`);
    ok(stale && !!re, 'a view on the OLD work id is refused not_attached and offers Reconnect (the study\'s overlay)');
    if (re) await click(centre(re));
    const back = await until(() => ev(`const st = live(${S(SID.P)})._browserLive.state(); return st.target && st.target.profileId === ${S(WORK2.id)} && st.connected && !st.error;`), 10000);
    ok(back, 'a REAL click on Reconnect RE-RESOLVED the target — the view is on the new work (the study: "Reconnect does nothing")', S(await ev(`const st = live(${S(SID.P)})._browserLive.state(); return { target: st.target, error: st.error };`)));

    // ── 3 · delete a pinned profile from the panel ──
    console.log('— 3 · Set aside a PINNED profile: the dialog asks, one click unpins, no dangling id anywhere');
    const GONE = await mkProfile('gone');
    r = await j('POST', '/api/browser/pin', { sessionId: SID.D, profile: 'gone' });
    ok(r.status === 200, 'Delete chat pins "gone"');
    await ev(`app.attachSession(${S(SID.D)}, 'Delete chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev(`return !!chat(${S(SID.D)});`), 10000);
    await until(async () => { const c = await chipOf(SID.D); return c && /gone/.test(c.text); }, 8000);
    await ev('app.openBrowserProfiles(); return true;');
    const setAside = await until(() => ev(`const pr = document.querySelector('.bprof-profile[data-profile-id="${GONE.id}"]'); const b = pr && pr.querySelector('.bprof-forget'); return !!(b && !b.disabled);`), 10000);
    ok(setAside, 'the Browser panel lists "gone" with an enabled Set aside', S(await ev(`const pr = document.querySelector('.bprof-profile[data-profile-id="${GONE.id}"]'); const b = pr && pr.querySelector('.bprof-forget'); return { row: !!pr, rows: [...document.querySelectorAll('.bprof-profile')].map((x) => x.dataset.profileId), b: !!b, disabled: b ? b.disabled : null, title: b ? b.title : null };`)));
    await ev(`document.querySelector('.bprof-profile[data-profile-id="${GONE.id}"]').scrollIntoView({ block: 'center' }); return true;`);
    const fr = await ev(`return rect(document.querySelector('.bprof-profile[data-profile-id="${GONE.id}"] .bprof-forget'));`);
    await click(centre(fr));
    const hintJs = `[...document.querySelectorAll('.dialog-hint')].find((h) => /use it — they go back to a temporary browser/.test(h.textContent))`; // owner ruling A (6) + lane S2: the ONE Delete… dialog counts the chats that pin / hold it BEFORE the act
    const dlg = await until(() => ev(`return !!${hintJs};`), 5000);
    const dtext = await ev(`const h = ${hintJs}; const ok = [...document.querySelectorAll('button.btn-create')].find((b) => b.textContent.trim() === 'Delete'); return { text: h ? h.textContent : null, ok: ok ? rect(ok) : null };`);
    const dName = await ev(`const r = row(${S(SID.D)}); return String(app.sidebar.getCustomName(r) || r.name || r.webuiName || '');`); // the row's OWN displayed name (the 2.369.102 lesson: never a spelling the product may replace)
    ok(dlg && /^1 conversation\(s\) use it — they go back to a temporary browser\./.test(dtext.text) && dtext.text.includes('(' + dName + ')') && !!dtext.ok, 'the dialog WARNS before the act: "1 conversation(s) use it — they go back to a temporary browser." naming the chat, with a one-click "Delete" (owner ruling A (6): release + unpin + set aside in one step)', S(dtext));
    if (dtext.ok) await click(centre(dtext.ok));
    const goneOk = await until(async () => (await j('GET', '/api/browser/profiles')).json.profiles.every((p) => p.id !== GONE.id), 8000);
    ok(goneOk, '"gone" was set aside (removed from the registry)');
    const want3 = 'gone was deleted — its pin was cleared · running nothing';
    ok(await until(async () => { const c = await chipOf(SID.D); return c && c.text === 'Agent browser · ' + want3 && c.amber; }, 8000), `Delete chat's chip says "${want3}" (never a raw id, never silence)`, S(await chipOf(SID.D)));
    await ev(`app.openSessionProps(row(${S(SID.D)})); return true;`);
    await until(() => ev(`return !!props(${S(SID.D)});`), 5000);
    const dp = await ev(`const w = props(${S(SID.D)}); return w ? w.content.textContent : '';`);
    ok(!/\bbp-[0-9a-f]{8}\b/.test(dp) && dp.includes(want3), 'its Session Properties show the same line and NO raw bp- id (the study: PINNED PROFILE "bp-17eb27c4")', dp.slice(0, 600));
    const sd = (await j('GET', `/api/browser/session/${SID.D}`)).json;
    ok(sd && sd.pin === null && (await ev(`return row(${S(SID.D)}).browserProfileId || null;`)) === null, 'no dangling pin anywhere: the keeper\'s pin is null and the session row carries none', S(sd && sd.pin));

    // ── 4 · the New Session dialog reads the registry and follows it while open ──
    console.log('— 4 · the New Session dialog lists every profile (a shared one too) and follows the registry while open');
    const SHARED = await mkProfile('Shared work', { sharing: 'instance' });
    ok(!!SHARED, 'a profile shared with every conversation exists (instance sharing through the mediating proxy)');
    await ev('app.showNewSessionDialog(); return true;');
    const opts0 = await until(() => ev(`const s = document.getElementById('input-browser-profile'); return !!(s && s.options.length > 1 && s.offsetParent);`), 5000);
    const o0 = await ev(`return [...document.getElementById('input-browser-profile').options].map((o) => o.textContent);`);
    ok(opts0 && o0[0] === 'No profile (temporary browser)' && o0.includes('work') && o0.includes('Personal') && o0.includes('Shared work'), 'the dropdown lists the recreated "work", Personal and the SHARED profile (the study lost the recreated shared "work") — "No profile (temporary browser)" first, never "None (ephemeral)"', S(o0));
    await ev(`const s = document.getElementById('input-browser-profile'); s.value = [...s.options].find((o) => o.textContent === 'Personal').value; s.dispatchEvent(new Event('change')); return true;`);
    const FRESH = await mkProfile('Fresh');
    const o1ok = await until(() => ev(`return [...document.getElementById('input-browser-profile').options].some((o) => o.textContent === 'Fresh');`), 6000);
    const o1 = await ev(`const s = document.getElementById('input-browser-profile'); return { opts: [...s.options].map((o) => o.textContent), picked: s.options[s.selectedIndex].textContent, origin: s.dataset.origin };`);
    ok(o1ok && FRESH && o1.picked === 'Personal' && o1.origin === 'chosen', 'a profile created while the dialog is OPEN appears without reopening it — and the user\'s pick survives the refill', S(o1));
    await ev(`app.hideDialogs ? app.hideDialogs() : null; return true;`);

    // ── 5 · every input has a receipt (a SHARED profile: the mediated path) ──
    console.log('— 5 · takeover input receipt: dispatched ⇒ delivered; dropped ⇒ "not delivered" in the bar');
    fchrome = await fakeChrome();
    const cdpMap = readJ('cdp.json'); cdpMap['vs-' + SHARED.id] = fchrome.url; writeJ('cdp.json', cdpMap);
    const bkM = await keyOf(SID.M);
    const medNs = MED.mediatedNamespace(SHARED.id, bkM);
    let mode = 'dispatch'; let medWs = null; let nextId = 1; const medQ = [];
    let medReady = false;
    const flush = () => { while (medReady && medWs && medWs.readyState === 1 && medQ.length) medWs.send(medQ.shift()); };
    // verify r2: like 0.38.1 the daemon opens its CDP connection when its stream is watched (before any takeover), opens its
    // tab T-M through the scoped url (admitted by the reply), then holds a PAGE session on it — every dispatch rides that session
    const ensureMed = () => {
      if (medWs) return; const url = readJ('med.json')[medNs]; if (!url) return;
      medWs = new WebSocket(url); const cId = nextId++, aId = nextId++;
      medWs.on('open', () => medWs.send(JSON.stringify({ id: cId, method: 'Target.createTarget', params: { url: 'about:blank' } })));
      medWs.on('message', (d) => { let m = null; try { m = JSON.parse(d); } catch { return; } if (m.id === cId) medWs.send(JSON.stringify({ id: aId, method: 'Target.attachToTarget', params: { targetId: 'T-M', flatten: true } })); if (m.id === aId) { medReady = true; flush(); } });
      medWs.on('error', () => { });
    };
    const UM = await fakeUpstream({ tabsTargetId: 'T-M', onConnect: ensureMed, onInput: (m) => {
      if (mode !== 'dispatch') return; // DROP: a stream server that never asks the browser (the credit expires ⇒ not delivered)
      // verify S2: the fake stream server relays the record's fields VERBATIM like 0.38.1 (the bound credit matches the call the record becomes)
      { const { type, eventType, rid, ...rest } = m; medQ.push(JSON.stringify({ id: nextId++, sessionId: 'S-T-M', method: type === 'input_keyboard' ? 'Input.dispatchKeyEvent' : type === 'input_touch' ? 'Input.dispatchTouchEvent' : 'Input.dispatchMouseEvent', params: type === 'input_mouse' ? { deltaX: 0, deltaY: 0, ...rest, type: eventType } : type === 'input_keyboard' ? { windowsVirtualKeyCode: 0, ...rest, type: eventType } : { modifiers: 0, ...rest, type: eventType } })); }
      ensureMed(); flush();
    } });
    ups.push(UM);
    const ports = readJ('ports.json'); ports[medNs] = UM.port; writeJ('ports.json', ports);
    r = await j('POST', '/api/browser/attach', { sessionId: SID.M, profile: 'Shared work' });
    ok(r.status === 200 && r.json.mediated === true, 'Shared chat attaches the SHARED profile (a mediated lease — its own scoped CDP url)', S(r.json).slice(0, 300));
    await ev(`app.attachSession(${S(SID.M)}, 'Shared chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev(`return !!chat(${S(SID.M)});`), 10000);
    await ev(`app.openBrowserLive({ sessionId: ${S(SID.M)} }); return true;`);
    const mUp = await until(() => ev(`const L = live(${S(SID.M)}); return !!(L && L._browserLive.state().frames >= 1 && L._browserLive.state().connected);`), 15000);
    ok(mUp && UM.connections >= 1, 'its live view draws from the session\'s own (mediated) stream');
    await ev(`const w = live(${S(SID.M)}); app.goToWinId ? app.goToWinId(w.id) : wm.focusWindow(w.id); return true;`);
    await sleep(300);
    const tk = await ev(`const b = live(${S(SID.M)})._browserLive.el().querySelector('.browser-live-mode-btn'); return b && b.offsetParent ? rect(b) : null;`);
    if (tk) await click(centre(tk));
    const driving = await until(() => ev(`const st = live(${S(SID.M)})._browserLive.state(); return st.mode === 'takeover' && st.mine && st.ownsKeyboard;`), 6000);
    ok(driving, 'a REAL click on Take over: the user drives and the view owns the keyboard');
    const chromeKeys0 = fchrome.saw.filter((x) => x === 'Input.dispatchKeyEvent').length;
    await key('a', 'KeyA', 65, 'a');
    const delivered = await until(() => ev(`const st = live(${S(SID.M)})._browserLive.state(); return st.receipts.delivered >= 1 && st.receipts.pending === 0;`), 5000);
    const d5 = await ev(`const st = live(${S(SID.M)})._browserLive.state(); return { receipts: st.receipts, kbdChip: st.kbdChip, kbdText: st.kbdText, echo: st.echo };`);
    ok(delivered && fchrome.saw.filter((x) => x === 'Input.dispatchKeyEvent').length > chromeKeys0 && !d5.receipts.failing, 'DISPATCHED: the key reached the (fake) Chrome THROUGH the mediator while the user drives, and its receipt came back delivered (the study: nothing reached the page)', S({ d5, saw: fchrome.saw.slice(-8) }));
    ok(d5.kbdChip && d5.kbdText === 'Typing goes to the browser', 'the bar keeps "Typing goes to the browser" — true now', S(d5));
    mode = 'drop';
    await key('b', 'KeyB', 66, 'b');
    const notDelivered = await until(() => ev(`const st = live(${S(SID.M)})._browserLive.state(); return !!st.receipts.failing;`), 4000);
    const d6 = await ev(`const st = live(${S(SID.M)})._browserLive.state(); const chip = live(${S(SID.M)})._browserLive.el().querySelector('.browser-live-kbd-chip'); return { receipts: st.receipts, kbdText: st.kbdText, echo: st.echo, chipFailing: chip.classList.contains('failing') };`);
    ok(notDelivered && d6.kbdText === 'Input is not reaching the browser' && d6.chipFailing && /^not delivered — /.test(d6.echo || ''), `DROPPED: within ~1.5 s the bar says "${d6.kbdText}" and "${d6.echo}" — never "Typing goes to the browser" over input that reaches nothing`, S(d6));
    mode = 'dispatch';
    await key('c', 'KeyC', 67, 'c');
    ok(await until(() => ev(`const st = live(${S(SID.M)})._browserLive.state(); return !st.receipts.failing && st.kbdText === 'Typing goes to the browser';`), 5000), 'the next delivered key clears it (the chip says "Typing goes to the browser" again)');
    const hb = await ev(`const b = live(${S(SID.M)})._browserLive.el().querySelector('.browser-live-handback'); return b && b.offsetParent ? rect(b) : null;`);
    if (hb) await click(centre(hb));
    try { medWs?.close(); } catch { }
  } finally {
    try { cdp?.close?.(); } catch { }
    for (const u of ups) { try { await u.close(); } catch { } }
    try { await fchrome?.close(); } catch { }
    for (const sid of Object.values(SID)) { try { wsMain.send(JSON.stringify({ type: 'kill', sessionId: sid })); } catch { } }
    await sleep(500);
    try { wsMain.close(); } catch { }
    try { srv.kill('SIGTERM'); } catch { }
    await sleep(500);
  }
})().catch((e) => ok(false, 'the suite threw', e && (e.stack || e.message)));
done();
