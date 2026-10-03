#!/usr/bin/env node
// LANE BROWSER-RESUME, CHUNK B — THE RESUME BUTTON AND THE HAND-BACK CARD, SEEN (heavy; docs/design-agent-browser-v2.zh.md
// §3.9, the owner's ruling 2: "给我一个 resume 按钮").
// Scene: a worktree server (its own scratch HOME, data/, a free port), a fake `claude` whose environment the suite reads
// (the agent's own token + its browser pairs), a fake `agent-browser` that KEEPS TABS (CDP target ids; `open` / `tab new`
// answer them, a `tab new` makes the new tab the active one — the shapes measured on 0.38.1), a fake stream server per
// browser that mirrors those tabs, the SHIPPED `vibespace-browser` CLI, and headless Chrome (1280×900) driving the app
// with REAL clicks and keys. Assertions read the app's own objects (winInfo._browserLive.state(), the chat view's
// messages, the session rows) — never text scraped from the DOM; geometry is a rect census.
//   ① the agent opens three pages through the shipped CLI (open / tab new / tab t2) — the live view draws them
//   ② the user's Stop: the live view keeps its last frame, its status says what is KEPT, and Reconnect is RESUME in place
//      (the play glyph + its word, whole); a REAL click resumes — the fake browser reopened the three pages IN ORDER and
//      switched back to the second BY ITS TARGET ID; the view reconnected by itself and draws again
//   ③ "Hand back and continue…" is offered after the Resume; a REAL Take over, a REAL click on it: the note box takes the
//      typed keys (not one reached the page), a REAL click on Hand back: the takeover ended, ONE card in the chat, the
//      stash holds "a browser handback", NO billed turn (the spend ledger has no row, the journal says "nothing
//      delivered"), and the agent's next command (the shipped CLI) prints [browser_resumed] naming the current tab
//   ④ zh + ja: Resume and "Hand back and continue…" in the device's language, whole in a 360 px wide window (Resume never
//      folds; the other is on the bar or a ⋯ row with its words)
//   ⑤ the agent's own `detach` retires its browser's record: a freshly loaded view (no browser remembered) still offers
//      Resume off THE fact; a REAL click brings the three tabs back on a new record
//   ⑥ (lane browser-resume C, the owner's ruling 3) THE TAB ROW: one chip per tab, "The agent's"; while the agent drives no
//      control is drawn (the Take over toggle names what taking over adds); a REAL Take over draws switch + ✕; a REAL
//      click switches the agent's tab (its next input is forwarded — the anchor moved with HIS switch); a REAL ✕ closes one;
//      ✕ on the tab on show moves the agent to a neighbour first; the last tab has no ✕; a refused close names why; the
//      handback carries his acts (the journal); "Close all…" asks by the browser's name (cancelled: nothing stopped); zh +
//      ja: the row whole at 360 px, the tab on show never folded
//   ⑦ (lane live-watch-polish, design 006 G1–G4) zh at 360 px: a FOLDED tab watched from the ▾+N menu ("查看 — …", no greyed
//      row), the line names both tabs, the watched chip kept on the row, the agent's tab untouched; the view's socket dropped ⇒
//      the watch re-sent (one truth). A fake CDP page endpoint (cdp.json → the fake's cdp-url) answers the capture.
// SKIPs with evidence without chrome / dtach. Free ports, scratch dirs only; ZERO vendor calls (a stub CLI).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // never the machine-global :7/5901 (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 1400) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 80) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await pred()) return true; } catch { } await sleep(every); } try { return !!(await pred()); } catch { return false; } };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8'));
const FRAME = FIX.server_to_client.frame;
const ROOT = scratch('browser-resume-ui');
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

/** The fake agent-browser: a daemon is a real `sleep`; the tabs live in <state>/<ns>.json (0.38.1's shapes: `open` and
 *  `tab new` answer `data.targetId`, a `tab new` makes the new tab active, a target id / t<N> / a label is a tab ref); every
 *  command is logged (cmds.log); `stream status` names ports.json[ns]. */
const FAKE_AB = () => `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const write = (s) => { fs.writeFileSync(f + '.part', JSON.stringify(s)); fs.renameSync(f + '.part', f); };
const readJ = (n) => { try { return JSON.parse(fs.readFileSync(path.join(st, n), 'utf8')); } catch { return {}; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const tid = () => Array.from({ length: 32 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
fs.appendFileSync(path.join(st, 'cmds.log'), JSON.stringify({ ns, argv }) + '\\n');
if (a === '--version') { console.log('agent-browser 0.38.1'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.1' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid, n: 1, tabs: [{ tabId: 't1', targetId: tid(), url: 'about:blank', title: '', active: true }] }; fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n'); }
  const act = s.tabs.find((t) => t.active) || s.tabs[0]; act.url = b; act.title = 'Page ' + String(b).replace(/^https?:\\/\\//, ''); write(s); out({ success: true, data: { targetId: act.targetId, url: b } }); process.exit(0); }
if (a === 'tab') { const s = read(); if (!(s && alive(s.pid))) { out({ success: false, error: 'fake: no browser' }); process.exit(1); }
  const rest = argv.slice(1);
  if (rest[0] === 'new') { const url = rest[1] || 'about:blank'; s.n = (s.n || 1) + 1; for (const t of s.tabs) t.active = false; const t = { tabId: 't' + s.n, targetId: tid(), url, title: 'Page ' + url.replace(/^https?:\\/\\//, ''), active: true }; s.tabs.push(t); write(s); out({ success: true, data: { tabId: t.tabId, targetId: t.targetId, url, total: s.tabs.length } }); process.exit(0); }
  if (!rest.length || rest[0] === 'list') { out({ success: true, data: { tabs: s.tabs } }); process.exit(0); }
  if (rest[0] === 'close') { if (fs.existsSync(path.join(st, 'fail-close'))) { out({ success: false, error: 'fake: the browser refused to close it' }); process.exit(1); } const t = rest[1] ? s.tabs.find((x) => x.tabId === rest[1] || x.targetId === rest[1]) : s.tabs.find((x) => x.active); if (!t) { out({ success: false, error: 'fake: no tab ' + rest[1] }); process.exit(1); } s.tabs = s.tabs.filter((x) => x !== t); write(s); out({ success: true, data: { closed: true, tabId: t.tabId, targetId: t.targetId } }); process.exit(0); } // lane browser-resume C: ⑥ the tab row closes a tab (0.38.1: any tab, by target id)
  const t = s.tabs.find((x) => x.tabId === rest[0] || x.targetId === rest[0]); if (!t) { out({ success: false, error: 'fake: no tab ' + rest[0] }); process.exit(1); }
  for (const x of s.tabs) x.active = x === t; write(s); out({ success: true, data: { tabId: t.tabId, targetId: t.targetId } }); process.exit(0); }
if (a === 'get' && b === 'url') { const s = read(); const act = s && (s.tabs.find((t) => t.active) || s.tabs[0]); out({ success: true, data: { url: act ? act.url : '' } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:' + (readJ('cdp.json')[ns] || 1) + '/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'stream' && b === 'status') { const port = readJ('ports.json')[ns] || null; if (!port) { out({ success: false, data: null, error: 'fake: no stream for ' + ns }); process.exit(1); } out({ success: true, data: { connected: true, enabled: true, port, screencasting: false } }); process.exit(0); }
if (a === 'stream' && b === 'enable') { out({ success: false, data: null, error: 'Streaming is already enabled for this session' }); process.exit(1); }
if (a === 'set' && b === 'viewport') { out({ success: true, data: {} }); process.exit(0); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`;

/** A fake stream server for ONE browser namespace: status, frames, and a `tabs` record mirroring the fake's tab file
 *  (sent when it changes, and to every new viewer); `inputs` records every input the bridge forwarded; `drop()` ends
 *  every connection (the daemon's stream server dying with its daemon). */
async function fakeUpstream(stateDir, ns, { fps = 4 } = {}) {
  const port = await freePort();
  const clients = new Set(); let connections = 0; const inputs = [];
  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  const tabsNow = () => { try { const s = JSON.parse(fs.readFileSync(path.join(stateDir, ns + '.json'), 'utf8')); return (s.tabs || []).map((t) => ({ active: !!t.active, label: null, tabId: t.tabId, targetId: t.targetId, title: t.title || t.url, type: 'page', url: t.url })); } catch { return null; } };
  let lastTabs = '';
  const tabsRec = (tabs) => JSON.stringify({ type: 'tabs', tabs, timestamp: Date.now() });
  wss.on('connection', (ws) => {
    connections++; clients.add(ws);
    ws.send(JSON.stringify(FIX.server_to_client.status));
    const t = tabsNow(); if (t) ws.send(tabsRec(t));
    ws.on('message', (d) => { let m = null; try { m = JSON.parse(d); } catch { return; } if (/^input_/.test(m.type)) inputs.push(m); });
    ws.on('close', () => clients.delete(ws)); ws.on('error', () => { });
  });
  const timer = setInterval(() => {
    const t = tabsNow(); const sig = JSON.stringify(t);
    for (const c of clients) if (c.readyState === 1) { c.send(JSON.stringify({ ...FRAME, metadata: { ...FRAME.metadata, timestamp: Date.now() } })); if (t && sig !== lastTabs) c.send(tabsRec(t)); }
    lastTabs = sig;
  }, 1000 / fps);
  return { port, inputs, get connections() { return connections; }, drop() { for (const c of clients) { try { c.terminate(); } catch { } } }, close() { clearInterval(timer); for (const c of clients) { try { c.terminate(); } catch { } } return new Promise((r) => wss.close(() => r())); } };
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  fakeHome = scratchHome('browser-resume-ui-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const AB = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB, { recursive: true });
  fs.writeFileSync(path.join(AB, 'ports.json'), '{}');
  const SIDC = crypto.randomUUID();
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SIDC, hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: SIDC, cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  // the fake claude: the real CLI's first two lines, then its ENV to a file (the suite runs the agent's CLI with it)
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --version "*) echo '2.1.281 (Claude Code)'; exit 0;; esac\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n%s\\n' '${hookLine}' '${initLine}';; esac\nenv > "$FAKE_AB_STATE/claude-env-$$"\nexec sleep 600\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(BIN, 'agent-browser'), FAKE_AB(), { mode: 0o755 });
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin/vibespace-browser']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const env = { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), FAKE_AB_STATE: AB, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_BROWSER_') || /^(ANTHROPIC|OPENAI|CODEX)_/.test(k)) delete env[k];
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 40000, 100), 'the worktree server booted', journal.slice(-800))) return;
  const j = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
  wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId: 'r1', name: 'Resume chat' }));
  await until(() => msgs.some((m) => m.type === 'created' && m.reqId === 'r1'), 15000);
  const SID = msgs.find((m) => m.type === 'created' && m.reqId === 'r1')?.sessionId || null;
  const ups = []; let chromeProc = null; let cdp = null;
  try {
    if (!ok(!!SID, 'a chat session was created on the fake claude', journal.slice(-600))) return;
    // the agent's environment, off the fake claude (its AGENT_BROWSER_SESSION names this conversation's browser key)
    let agentEnv = null;
    await until(() => {
      for (const n of fs.readdirSync(AB).filter((x) => x.startsWith('claude-env-'))) {
        const t = fs.readFileSync(path.join(AB, n), 'utf8');
        if (/^AGENT_BROWSER_SESSION=vs-bk-/m.test(t) && t.includes('VIBESPACE_SESSION_TOKEN=')) { agentEnv = {}; for (const line of t.split('\n')) { const i = line.indexOf('='); if (i > 0) agentEnv[line.slice(0, i)] = line.slice(i + 1); } return true; }
      }
      return false;
    }, 15000, 100);
    if (!ok(!!agentEnv, 'the session was spawned with its own browser pairs and token (the agent\'s environment)')) return;
    const bk = agentEnv.AGENT_BROWSER_SESSION.slice(3), ns = agentEnv.AGENT_BROWSER_NAMESPACE || ('vs-' + bk);
    const up = await fakeUpstream(AB, ns); ups.push(up);
    fs.writeFileSync(path.join(AB, 'ports.json'), JSON.stringify({ [ns]: up.port }));
    const cli = (args) => new Promise((resolve) => execFile(process.execPath, [path.join(wt, 'data/bin/vibespace-browser'), ...args], { env: agentEnv, cwd: ROOT, encoding: 'utf8', timeout: 60000 }, (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })));
    const tabsOf = () => { try { return JSON.parse(fs.readFileSync(path.join(AB, ns + '.json'), 'utf8')).tabs || []; } catch { return []; } };
    const cmds = () => { try { return fs.readFileSync(path.join(AB, 'cmds.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((c) => c.ns === ns).map((c) => c.argv.join(' ')); } catch { return []; } };

    // ── ① the agent opens three pages through the SHIPPED CLI ──
    console.log('— ① the agent opens three pages (the shipped vibespace-browser: open / tab new / tab t2)');
    const c1 = await cli(['open', 'https://a.test/']); const c2 = await cli(['tab', 'new', 'https://b.test/']); const c3 = await cli(['tab', 'new', 'https://c.test/']); const c4 = await cli(['tab', 't2']);
    const t1 = tabsOf();
    ok([c1, c2, c3, c4].every((c) => c.code === 0) && t1.map((t) => t.url).join() === 'https://a.test/,https://b.test/,https://c.test/' && t1.find((t) => t.active).url === 'https://b.test/', 'the agent\'s browser runs three pages, the second on show', JSON.stringify({ codes: [c1, c2, c3, c4].map((c) => c.code), err: [c1, c2, c3, c4].map((c) => c.stderr.slice(0, 200)), tabs: t1 }));

    chromeProc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });
    procs.add(chromeProc);
    let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
    if (!ok(!!target, 'chrome exposed a CDP page target')) return;
    cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
    let seq = 0; const pend = new Map();
    cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
    const S = JSON.stringify;
    const ev = async (js) => {
      const r = await send('Runtime.evaluate', { expression: `(async () => { const app = window.app, wm = app.wm; const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }; const sidOf = (id) => (app.sessions.get(id) || {}).sessionId || null; const chatWin = () => [...wm.windows.values()].find((w) => w.type === 'chat' && sidOf(w.id) === ${S(SID)}) || null; const live = () => wm.windows.get('win-blive-' + ${S(SID)}) || [...wm.windows.values()].find((w) => w.type === 'browser-live' && w._browserLive && w._browserLive.state().sessionId === ${S(SID)}) || null; const L = () => { const w = live(); return w ? w._browserLive : null; }; const row = () => (app.sidebar._allSessions || []).find((x) => x.webuiId === ${S(SID)}) || null; ${js} })()`, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
      return r.result?.result?.value;
    };
    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const click = async (pt) => { await mouse('mouseMoved', pt.x, pt.y); await mouse('mousePressed', pt.x, pt.y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', pt.x, pt.y, { button: 'left', clickCount: 1 }); await sleep(250); };
    const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    let onboarded = false;
    const boot = async () => {
      if (!onboarded) { onboarded = true; await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); } // §47: before every navigate
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      return until(async () => ev('if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);'), 40000, 250);
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    if (!ok(await boot(), 'the app booted in headless chrome (1280×900)')) return;
    await sleep(800);
    await ev(`await app.refreshBrowserProfiles(); app.attachSession(${S(SID)}, 'Resume chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev('return !!chatWin();'), 10000);
    await ev(`app.openBrowserLive({ sessionId: ${S(SID)} }); return true;`);
    const drawn = await until(() => ev('const l = L(); return !!(l && l.state().frames >= 2 && l.state().connected && l.state().tabs.length === 3);'), 15000);
    ok(drawn, 'the live view draws the agent\'s browser and lists its three tabs', S(await ev('const l = L(); return l ? { frames: l.state().frames, tabs: l.state().tabs.map((t) => t.url), error: l.state().error } : null;')));

    // ── ② the user's Stop ⇒ RESUME in place of Reconnect; a REAL click resumes with the three tabs ──
    console.log('— ② Stop: the live view offers Resume in place; a REAL click reopens the three tabs, the view follows');
    let r = await j('POST', `/api/browser/session/${SID}/stop`, { ref: '~ephemeral' });
    ok(r.status === 200, 'the user stops the conversation\'s browser (a deliberate stop: its logins and tabs are kept)', S(r.json).slice(0, 300));
    up.drop(); // its stream server dies with its daemon
    const kept = await until(async () => { const k = (await j('GET', '/api/browser/kept')).json; const e = k && (k.kept || []).find((x) => x.browserKey === bk); return !!(e && e.tabs.length === 3 && e.stoppedWhy === 'user'); }, 8000);
    ok(kept, 'the kept store holds its three tabs (stopped by the user)', S((await j('GET', '/api/browser/kept')).json).slice(0, 600));
    const offered = await until(() => ev('const l = L(); const s = l && l.state(); return !!(s && s.stopped && s.resumeOffer && s.resumeText);'), 12000, 150);
    const s2 = await ev('const l = L(); const s = l.state(); const b = l.el().querySelector(".browser-live-reconnect"); return { stopped: s.stopped, frames: s.frames, resumeOffer: s.resumeOffer, resumeText: s.resumeText, statusText: s.statusText, btn: b && b.style.display !== "none" ? { rect: rect(b), sw: b.scrollWidth, cw: b.clientWidth, svg: !!b.querySelector("svg"), mode: b.dataset.mode } : null, fact: row() && row().browserFact && row().browserFact.own };');
    ok(offered && s2.resumeText === 'Resume' && s2.btn && s2.btn.mode === 'resume' && s2.btn.svg && s2.btn.sw <= s2.btn.cw + 1, 'the stopped view keeps its last frame and offers RESUME in place of Reconnect — the play glyph + its word, whole on the bar (no greyed control)', S(s2));
    ok(/3 tab\(s\) and its logins are kept/.test(s2.statusText || '') && s2.fact && s2.fact.kept && s2.fact.kept.tabs === 3, 'its status line says what is kept ("… 3 tab(s) and its logins are kept …") — THE fact\'s own.kept', S({ status: s2.statusText, own: s2.fact }));
    const nBefore = cmds().length;
    if (s2.btn) await click(centre(s2.btn.rect));
    const resumed = await until(() => ev('const s = L().state(); return !!(s.connected && !s.stopped && s.frames >= 1 && s.tabs.length === 3);'), 20000, 150);
    const after = cmds().slice(nBefore);
    const t2 = tabsOf();
    const bId = t2[1] && t2[1].targetId;
    ok(resumed, 'the view reconnected BY ITSELF and draws the resumed browser with its three tabs', S(await ev('const s = L().state(); return { connected: s.connected, stopped: s.stopped, frames: s.frames, tabs: s.tabs.map((t) => t.url), error: s.error };')));
    const seqNeed = ['open about:blank', 'open https://a.test/', 'tab new https://b.test/', 'tab new https://c.test/', `tab ${bId}`];
    ok(seqNeed.every((x) => after.includes(x)) && after.indexOf('open https://a.test/') < after.indexOf('tab new https://b.test/') && after.indexOf('tab new https://c.test/') < after.indexOf(`tab ${bId}`) && !after.some((x) => x.startsWith('tab close')), 'the fake browser was relaunched and reopened the pages IN ORDER, the first into its launch tab, then switched back to the second BY ITS TARGET ID — never a tab close', S(after));
    ok(t2.map((t) => t.url).join() === 'https://a.test/,https://b.test/,https://c.test/' && t2.find((t) => t.active).url === 'https://b.test/', 'the resumed browser shows the SAME three tabs, the SAME one on show', S(t2));

    // ── ③ "Hand back and continue…" — the note box, the card, the stash, no billed turn, the agent's next command ──
    console.log('— ③ Hand back and continue: a REAL Take over, the note box takes the keys, the card in the chat, nothing billed');
    const contOffered = await until(() => ev('return !!L().state().contShown;'), 6000);
    ok(contOffered, '"Hand back and continue…" is offered after the Resume (the view resumed it — never greyed)', S(await ev('const s = L().state(); return { contShown: s.contShown, fact: row().browserFact && row().browserFact.own };')));
    await ev('const w = live(); app.goToWinId ? app.goToWinId(w.id) : wm.focusWindow(w.id); return true;');
    await sleep(300);
    const tk = await ev('const b = L().el().querySelector(".browser-live-mode-btn"); return b && b.offsetParent ? rect(b) : null;');
    if (tk) await click(centre(tk));
    const driving = await until(() => ev('const s = L().state(); return s.mode === "takeover" && s.mine && s.ownsKeyboard;'), 6000);
    ok(driving, 'a REAL click on Take over: the user drives and the view owns the keyboard');
    const cb = await ev('const b = L().el().querySelector(".browser-live-continue"); return b && b.offsetParent ? rect(b) : null;');
    ok(!!cb, 'while driving, "Hand back and continue…" is on the bar', S(await ev('return L().state().folded;')));
    const inputs0 = up.inputs.length;
    if (cb) await click(centre(cb));
    // the note box = the input of the dialog that holds the focus (index.html keeps static dialogs of the same class)
    const dlg = await until(() => ev('const a = document.activeElement; return !!(a && a.tagName === "INPUT" && a.closest(".dialog-overlay"));'), 5000);
    ok(dlg && (await ev('return L().state().noteOpen && !L().state().ownsKeyboard;')), 'the note box opens WITH the keyboard (the view let the keys go first — a dialog never types into the page)', S(await ev('const a = document.activeElement; return { active: a && a.tagName, cls: a && a.className, st: L().state().noteOpen, owns: L().state().ownsKeyboard };')));
    const NOTE = 'I logged in — continue from the cart';
    await send('Input.insertText', { text: NOTE });
    for (const k of [['End', 'End', 35]]) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k[0], code: k[1], windowsVirtualKeyCode: k[2] }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k[0], code: k[1], windowsVirtualKeyCode: k[2] }); }
    await sleep(300);
    const typed = await ev('const a = document.activeElement; return a && a.closest(".dialog-overlay") ? a.value : null;');
    ok(typed === NOTE && up.inputs.length === inputs0, 'the note is typed INTO the box and not one key reached the page (the stream server got no input)', S({ typed, inputs: up.inputs.slice(inputs0).map((m) => m.type) }));
    const okBtn = await ev('const a = document.activeElement; const o = a && a.closest(".dialog-overlay"); const b = o && o.querySelector("button.btn-create"); return b && b.textContent.trim() === "Hand back" ? rect(b) : null;');
    if (okBtn) await click(centre(okBtn));
    const handed = await until(() => ev('const s = L().state(); return s.mode === "watch" && !s.mine && !s.ownsKeyboard;'), 8000);
    ok(handed, 'a REAL click on Hand back: the takeover ended (the view is in watch mode, the keyboard released)', S(await ev('const s = L().state(); return { mode: s.mode, mine: s.mine, owns: s.ownsKeyboard, cont: s.contShown };')));
    const card = await until(() => ev('const w = chatWin(); const v = w && app.sessions.get(w.id); const m = v && (v._messages || []).find((x) => x.peerFrom === "VibeSpace browser" && x.peerVia === "notification" && /handed the browser back for the agent/.test((x.content && x.content[0] && x.content[0].text) || "")); return !!m;'), 8000);
    const cardMsg = await ev('const v = app.sessions.get(chatWin().id); const m = (v._messages || []).find((x) => x.peerFrom === "VibeSpace browser" && /handed the browser back/.test(x.content[0].text || "")); return m ? { text: m.content[0].text, n: (v._messages || []).filter((x) => x.peerFrom === "VibeSpace browser" && /handed the browser back/.test(x.content[0].text || "")).length, el: !!(v._elements && v._elements.get(m.id)) } : null;');
    ok(card && cardMsg && cardMsg.n === 1 && cardMsg.text.includes(NOTE) && /nothing was sent now/.test(cardMsg.text) && /on show: Page b\.test\//.test(cardMsg.text) && cardMsg.el, 'ONE card in the chat, drawn: "You handed the browser back for the agent\'s next turn: “…” — 3 tab(s); on show: Page b.test/ … nothing was sent now"', S(cardMsg));
    const stash = await until(() => ev('const r = row(); return !!(r && r.stash && (r.stash.items || []).some((i) => i.kind === "handback"));'), 8000);
    ok(stash, 'the conversation\'s stash holds it: "a browser handback" (the strip above the composer — its next turn reads it)', S(await ev('return row() && row().stash;')));
    const ledger = (() => { try { return fs.readFileSync(path.join(wt, 'data', 'spend-budget.json'), 'utf8'); } catch { return ''; } })();
    ok(!/browser-handback/.test(ledger) && /handed back for the next turn — stashed/.test(journal) && !/announced into the conversation/.test(journal), 'NOTHING was billed: no spend-ledger row for a browser handback, the journal says "stashed" and never "announced into the conversation"', S({ ledger: ledger.slice(0, 300), tail: journal.split('\n').filter((l) => /handed back|handback/.test(l)).slice(-4) }));
    const next = await cli(['get', 'url']);
    ok(/\[browser_resumed\]/.test(next.stderr) && /handed it back/.test(next.stderr) && /current: Page b\.test\/ — https:\/\/b\.test\//.test(next.stderr) && !next.stderr.includes(NOTE), 'the agent\'s next command (the shipped CLI) is told once: "[browser_resumed] … handed it back … current: Page b.test/ — https://b.test/" (the note came with its turn, never twice)', S(next.stderr.slice(0, 600)));
    const next2 = await cli(['get', 'url']);
    ok(!/\[browser_resumed\]/.test(next2.stderr), '…and the command after it is told nothing', S(next2.stderr.slice(0, 300)));

    // ── ④ zh + ja: the two new controls in the device's language, whole in a 360 px window ──
    console.log('— ④ zh + ja: Resume and "Hand back and continue…" in the device\'s language, whole at 360 px');
    for (const [lang, resumeWord, contWord] of [['zh', '恢复', '交还并继续…'], ['ja', '再開', '戻して続ける…']]) {
      await send('Runtime.evaluate', { expression: `localStorage.setItem('vibespace.lang', ${S(lang)}); true` });
      if (!ok(await boot(), `${lang}: the app booted again in ${lang}`)) continue;
      await sleep(600);
      await ev(`await app.refreshBrowserProfiles(); if (!chatWin()) app.attachSession(${S(SID)}, 'Resume chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
      await until(() => ev('return !!chatWin();'), 10000);
      await ev(`if (!live()) app.openBrowserLive({ sessionId: ${S(SID)} }); return true;`);
      await until(() => ev('const l = L(); return !!(l && l.state().connected && l.state().frames >= 1);'), 12000);
      r = await j('POST', `/api/browser/session/${SID}/stop`, { ref: '~ephemeral' });
      up.drop();
      await ev('const w = live(); const el = w.element; wm.setMinSize && wm.setMinSize(w.id, null); el.style.width = "360px"; el.style.height = "560px"; window.dispatchEvent(new Event("resize")); return true;');
      const offer = await until(() => ev('const s = L().state(); return !!(s.stopped && s.resumeOffer && s.resumeText);'), 12000, 150);
      await sleep(400);
      const z = await ev('const l = L(); l.layoutBar && l.layoutBar(); const s = l.state(); const b = l.el().querySelector(".browser-live-reconnect"); return { resumeText: s.resumeText, folded: s.folded, btn: b && b.style.display !== "none" ? { sw: b.scrollWidth, cw: b.clientWidth, w: rect(b).width, h: rect(b).height, right: rect(b).left + rect(b).width, barRight: rect(l.el().querySelector(".browser-live-bar")).left + rect(l.el().querySelector(".browser-live-bar")).width } : null, width: rect(live().element).width };');
      ok(offer && z.resumeText === resumeWord && z.btn && z.btn.sw <= z.btn.cw + 1 && z.btn.right <= z.btn.barRight + 1 && !z.folded.includes('reconnect'), `${lang}: Resume says "${resumeWord}", whole and inside the bar of a ${Math.round(z.width)} px window (it never folds)`, S(z));
      const b2 = await ev('const b = L().el().querySelector(".browser-live-reconnect"); return rect(b);');
      await click(centre(b2));
      await until(() => ev('const s = L().state(); return s.connected && !s.stopped && s.contShown;'), 20000, 150);
      await sleep(400);
      const zc = await ev('const l = L(); l.layoutBar && l.layoutBar(); const s = l.state(); const c = l.el().querySelector(".browser-live-continue"); const onBar = c && c.style.display !== "none" && !s.folded.includes("continue"); return { contShown: s.contShown, contText: s.contText, onBar, fit: onBar ? c.scrollWidth <= c.clientWidth + 1 : null, row: s.foldedRows.find((x) => x.label === s.contText) || null, folded: s.folded };');
      ok(zc.contShown && zc.contText === contWord && (zc.onBar ? zc.fit : !!zc.row), `${lang}: "${contWord}" is offered after the Resume — whole on the bar, or a ⋯ row with its own words when the 360 px bar folds it`, S(zc));
    }
    await send('Runtime.evaluate', { expression: `localStorage.removeItem('vibespace.lang'); true` });

    // ── ⑤ the agent's own `detach` RETIRES its browser's record — a fresh page's view still offers Resume (THE fact) ──
    console.log('— ⑤ the agent detached (its record retired): a freshly loaded view still offers Resume; a click brings the tabs back');
    const det = await cli(['detach']);
    up.drop();
    const retired = await until(async () => { const st5 = (await j('GET', `/api/browser/session/${SID}`)).json; return !!(st5 && !st5.ephemeral); }, 10000);
    ok(det.code === 0 && retired, 'the agent\'s `vibespace-browser detach`: its browser stopped and its record retired (the kept entry stays)', S({ det: det.stdout.slice(0, 200) + det.stderr.slice(0, 200) }));
    if (!ok(await boot(), 'the app booted again (a fresh page: the view has no browser of its own to remember)')) return;
    await sleep(600);
    await ev(`await app.refreshBrowserProfiles(); if (!chatWin()) app.attachSession(${S(SID)}, 'Resume chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); if (!live()) app.openBrowserLive({ sessionId: ${S(SID)} }); return true;`);
    const off5 = await until(() => ev('const l = L(); const s = l && l.state(); return !!(s && s.resumeOffer && s.resumeText);'), 15000, 150);
    const s5 = await ev('const s = L().state(); return { resumeOffer: s.resumeOffer, resumeText: s.resumeText, statusText: s.statusText, target: s.target, notStarted: s.notStarted, own: row() && row().browserFact && row().browserFact.own };');
    ok(off5 && /3 tab\(s\) and its logins are kept/.test(s5.statusText || ''), 'a view that never saw this browser (its record retired) offers Resume — read off THE fact (the conversation uses its own browser, kept, not running)', S(s5));
    const n5 = cmds().length;
    const b5 = await ev('const b = L().el().querySelector(".browser-live-reconnect"); return b && b.style.display !== "none" ? rect(b) : null;');
    if (b5) await click(centre(b5));
    const back5 = await until(() => ev('const s = L().state(); return !!(s.connected && !s.stopped && s.frames >= 1 && s.tabs.length === 3);'), 20000, 150);
    const after5 = cmds().slice(n5);
    ok(back5 && after5.includes('open https://a.test/') && after5.filter((x) => x.startsWith('tab new ')).length === 2, 'a REAL click: a new record, the three kept tabs reopened, the view connected by itself', S({ after5, st: await ev('const s = L().state(); return { connected: s.connected, tabs: s.tabs.length, error: s.error };') }));

    // ── ⑥ lane browser-resume C: THE TAB ROW ──
    console.log('— ⑥ the tab row: owners, no control while the agent drives, REAL switch / ✕ while you drive, the last tab, the handback, Close all…');
    const row6 = () => ev('const s = L().state(); return s.tabRow;');
    const rowOk = await until(async () => { const r6 = await row6(); return !!(r6 && r6.shown && r6.rows.length === 3 && r6.rows.every((x) => x.owner === 'agent')); }, 10000, 150);
    let R6 = await row6();
    ok(rowOk && R6.rows.every((x) => !x.canSwitch && !x.canClose) && R6.rows.filter((x) => x.active).length === 1 && R6.quit, 'the TAB ROW: one chip per tab of the agent\'s browser, each "The agent’s" (the bridge\'s `tab-owners`); while the agent drives NOTHING is drawn on them; "Close all…" at the row\'s end', S(R6));
    const takeTip = await ev('const b = L().el().querySelector(".browser-live-mode-btn"); return b ? b.title : null;');
    ok(/Take over to switch or close the agent’s tabs/.test(takeTip || ''), 'the Take over toggle (a WORKING control) names what taking over adds: "Take over to switch or close the agent’s tabs"', takeTip);
    const tk6 = await ev('const b = L().el().querySelector(".browser-live-mode-btn"); return b && b.offsetParent ? rect(b) : null;');
    if (tk6) await click(centre(tk6));
    const drawn6 = await until(async () => { const r6 = await row6(); return !!(r6 && r6.rows.length === 3 && r6.rows.every((x) => x.canClose) && r6.rows.filter((x) => x.canSwitch).length === 2); }, 8000, 120);
    R6 = await row6();
    ok(drawn6, 'a REAL Take over: every chip gets its ✕, every chip but the one on show is a switch', S(R6));
    const tabs6 = tabsOf();
    const cur6 = tabs6.find((x) => x.active), other6 = tabs6.find((x) => !x.active && x.url === 'https://c.test/') || tabs6.find((x) => !x.active);
    const chipRect = (id) => ev(`const el = L().el().querySelector('.browser-live-tabchip[data-target="' + ${S(id)}.toUpperCase() + '"]'); return el && el.offsetParent ? rect(el) : null;`);
    const closeRect = (id) => ev(`const el = L().el().querySelector('.browser-live-tabchip[data-target="' + ${S(id)}.toUpperCase() + '"] .browser-live-tabchip-close'); return el && el.offsetParent ? rect(el) : null;`);
    const n6 = cmds().length;
    const cr6 = await chipRect(other6.targetId);
    if (cr6) await click({ x: cr6.left + 14, y: cr6.top + cr6.height / 2 });
    const sw6 = await until(() => tabsOf().find((x) => x.active)?.targetId === other6.targetId, 8000, 100);
    ok(sw6 && cmds().slice(n6).includes(`tab ${other6.targetId.toUpperCase()}`), `a REAL click on a chip SWITCHES the agent's tab (under its own session, by target id): ${other6.url} is on show`, S({ after: cmds().slice(n6), active: tabsOf().find((x) => x.active) }));
    await until(async () => (await row6()).rows.find((x) => x.active)?.targetId === other6.targetId.toUpperCase(), 5000, 100);
    await sleep(3400); // past the takeover anchor's grace: an AGENT's switch would now refuse his input tab_switched
    const inp6 = up.inputs.length;
    const cv6 = await ev('const c = L().el().querySelector(".browser-live-canvas"); return rect(c);');
    await click({ x: cv6.left + 40, y: cv6.top + 40 });
    const fwd6 = await until(() => up.inputs.length > inp6, 4000, 80);
    const rcpt6 = await ev('const s = L().state(); return s.receipts || s.lastReceipt || null;');
    ok(fwd6, 'HIS switch moved the takeover\'s anchor: his next click on the picture reaches the page (never `tab_switched`)', S({ inputs: up.inputs.slice(inp6).map((m) => m.type), rcpt6 }));
    // ✕ on a tab that is NOT on show
    const rest6 = tabsOf().filter((x) => x.targetId !== other6.targetId);
    const victim = rest6.find((x) => !x.active);
    const n7 = cmds().length;
    const xr = await closeRect(victim.targetId);
    if (xr) await click(centre(xr));
    const gone6 = await until(() => !tabsOf().some((x) => x.targetId === victim.targetId), 8000, 100);
    ok(gone6 && cmds().slice(n7).includes(`tab close ${victim.targetId.toUpperCase()}`) && tabsOf().find((x) => x.active)?.targetId === other6.targetId, `a REAL ✕ closes the agent's tab ${victim.url} under its own session — the tab on show stays`, S({ after: cmds().slice(n7), tabs: tabsOf() }));
    await until(async () => (await row6()).rows.length === 2, 5000, 100);
    // a refused close names why (the browser refuses it: the keeper's `tab_failed`)
    fs.writeFileSync(path.join(AB, 'fail-close'), '1');
    const keepOne = tabsOf().find((x) => x.targetId !== other6.targetId);
    const xr2 = await closeRect(keepOne.targetId);
    if (xr2) await click(centre(xr2));
    const err6 = await until(async () => { const r6 = await row6(); return !!(r6.error && r6.error.act === 'close'); }, 6000, 100);
    fs.unlinkSync(path.join(AB, 'fail-close'));
    ok(err6 && tabsOf().some((x) => x.targetId === keepOne.targetId), 'a close the browser refuses is SAID (the toast\'s words: "Could not close the tab: …") — never silence; the tab stays', S({ error: (await row6()).error, xr2, row: await row6(), cmds: cmds().slice(-6), tail: journal.split('\n').filter((l) => /tab /.test(l)).slice(-4) }));
    // ✕ on the tab ON SHOW: the agent moves to its neighbour first, then the tab closes; the last tab has no ✕
    const n8 = cmds().length;
    const xr3 = await closeRect(other6.targetId);
    if (xr3) await click(centre(xr3));
    const gone7 = await until(() => !tabsOf().some((x) => x.targetId === other6.targetId), 8000, 100);
    const a8 = cmds().slice(n8);
    ok(gone7 && a8.indexOf(`tab ${keepOne.targetId.toUpperCase()}`) >= 0 && a8.indexOf(`tab ${keepOne.targetId.toUpperCase()}`) < a8.indexOf(`tab close ${other6.targetId.toUpperCase()}`) && tabsOf().length === 1 && tabsOf()[0].active, '✕ on the tab ON SHOW: the agent\'s session moves to its neighbour FIRST, then the tab closes (the view keeps a picture)', S({ a8, tabs: tabsOf() }));
    const last6 = await until(async () => { const r6 = await row6(); return r6.rows.length === 1 && !r6.rows[0].canClose; }, 5000, 100);
    ok(last6, 'the agent\'s LAST tab carries no ✕ (Close all… is the way to end it)', S(await row6()));
    // the handback carries his acts (said to the agent in the handback's own words — test-browser-tabs ② pins the sentence)
    const hb6 = await ev('const b = L().el().querySelector(".browser-live-handback"); return b && b.offsetParent ? rect(b) : null;');
    if (hb6) await click(centre(hb6));
    // verify F3: each act is recorded at its own exec's check, so the list is in the order they RAN — the ✕ on the tab on
    // show is its neighbour move (tab-switch) THEN its close
    const said6 = await until(() => /the user's tab acts while driving \(said to the agent\): tab-switch, tab-close, tab-switch, tab-close/.test(journal), 8000, 100);
    ok(said6, 'the handback carries what he did to the agent\'s tabs, in the order it ran (the keeper: "the user\'s tab acts while driving (said to the agent): tab-switch, tab-close, tab-switch, tab-close")', journal.split('\n').filter((l) => /handed back to the agent/.test(l)).slice(-2).join('\n'));
    const watch6 = await until(async () => { const r6 = await row6(); return r6.rows.every((x) => !x.canClose && !x.canSwitch); }, 5000, 100);
    ok(watch6, 'handed back: the row draws no control again');
    // "Close all…" asks BY THE BROWSER'S NAME; cancelled ⇒ nothing stopped
    const n9 = cmds().length;
    await until(async () => (await row6()).quit, 8000, 120); // the row's end follows the conversation's browser rows (a handback re-reads them)
    const q6 = await ev('const b = L().el().querySelector(".browser-live-tabrow-quit"); return b && b.offsetParent ? rect(b) : null;');
    if (q6) await click(centre(q6));
    const asked = await until(async () => { const r6 = await row6(); return !!r6.quitAsked; }, 4000, 100);
    const qa = (await row6()).quitAsked || {};
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(600);
    ok(asked && /^Close all tabs of “.+”\?$/.test(qa.title) && /every tab of it closes/.test(qa.message) && !cmds().slice(n9).some((c) => /^close/.test(c)) && (await ev('return L().state().connected && !L().state().stopped;')), '"Close all…" asks ONCE, naming the browser ("Close all tabs of “…”?"); cancelled ⇒ nothing stopped', S({ qa, q6, after: cmds().slice(n9), row: await row6() }));
    // zh + ja: the row at 360 px — whole, the tab on show never folded
    await cli(['tab', 'new', 'https://d.test/a-long-page-title-that-goes-on']); await cli(['tab', 'new', 'https://e.test/']);
    for (const [lang, mark, quitWord] of [['zh', 'agent 的', '全部关闭…'], ['ja', 'エージェントの', 'すべて閉じる…']]) {
      await send('Runtime.evaluate', { expression: `localStorage.setItem('vibespace.lang', ${S(lang)}); true` });
      if (!ok(await boot(), `${lang}: the app booted again in ${lang}`)) continue;
      await sleep(600);
      await ev(`await app.refreshBrowserProfiles(); if (!chatWin()) app.attachSession(${S(SID)}, 'Resume chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); if (!live()) app.openBrowserLive({ sessionId: ${S(SID)} }); return true;`);
      await until(async () => { const l = await ev('const l = L(); return !!(l && l.state().tabRow.shown && l.state().tabRow.rows.length === 3);'); return l; }, 12000, 150);
      await ev('const w = live(); const el = w.element; wm.setMinSize && wm.setMinSize(w.id, null); el.style.width = "360px"; el.style.height = "560px"; window.dispatchEvent(new Event("resize")); return true;');
      await sleep(700);
      const z6 = await ev('const l = L(); const s = l.state(); const r = l.el().querySelector(".browser-live-tabrow"); const q = l.el().querySelector(".browser-live-tabrow-quit"); const act = s.tabRow.rows.find((x) => x.active); const actEl = act ? l.el().querySelector(\'.browser-live-tabchip[data-target="\' + act.targetId + \'"]\') : null; return { rows: s.tabRow.rows.map((x) => x.mark), folded: s.tabRow.folded, activeFolded: act ? s.tabRow.folded.includes(act.targetId) : null, row: rect(r), sw: r.scrollWidth, cw: r.clientWidth, quit: q && q.offsetParent ? { text: s.tabRow.quitText, sw: q.scrollWidth, cw: q.clientWidth, right: rect(q).left + rect(q).width } : null, actRect: actEl && actEl.offsetParent ? rect(actEl) : null };');
      ok(z6.rows.every((x) => x === mark) && z6.quit && z6.quit.text === quitWord && z6.quit.sw <= z6.quit.cw + 1 && z6.quit.right <= z6.row.left + z6.row.width + 1 && z6.activeFolded === false && z6.actRect && z6.actRect.left + z6.actRect.width <= z6.row.left + z6.row.width + 1 && z6.sw <= z6.cw + 1,
        `${lang}: the row in the device's words ("${mark}", "${quitWord}"), whole in a 360 px window — nothing overflows, the tab on show never folds (${z6.folded.length} folded into ▾+N)`, S(z6));
    }
    // ⑦ lane live-watch-polish (B-93d7, design 006 G1–G4): WATCH A FOLDED TAB in zh at 360 px — the "▾+N" menu's entry says
    //    "查看 — …" (never a greyed row), the line names BOTH tabs, the watched chip is kept on the row, the agent's tab is
    //    untouched; the view's socket dropped ⇒ the reconnected view re-sends its watch (one truth). A fake CDP page endpoint
    //    (the fake agent-browser's cdp-url names it) answers the capture: no screencast frame ⇒ polled, as a background tab is.
    console.log('— ⑦ zh: a folded tab watched from the ▾+N menu; the line names both tabs; a reconnect keeps one truth');
    {
      const CDPF = await freePort(); const pages = [];
      const cdpSrv = new WebSocketServer({ port: CDPF, host: '127.0.0.1' }); await new Promise((r) => cdpSrv.on('listening', r));
      cdpSrv.on('connection', (ws, req) => {
        const m = /^\/devtools\/page\/([0-9A-Fa-f]{16,64})$/.exec(req.url || ''); if (!m) { ws.terminate(); return; }
        pages.push({ id: m[1].toUpperCase(), ws });
        ws.on('message', (d) => { let q = null; try { q = JSON.parse(d); } catch { return; } const result = q.method === 'Page.captureScreenshot' ? { data: FRAME.data } : q.method === 'Page.getLayoutMetrics' ? { cssLayoutViewport: { clientWidth: 800, clientHeight: 600, pageX: 0, pageY: 0 } } : {}; try { ws.send(JSON.stringify({ id: q.id, result })); } catch { } });
        ws.on('error', () => { });
      });
      const opened = (id) => pages.filter((p) => p.id === id).length;
      try {
        fs.writeFileSync(path.join(AB, 'cdp.json'), JSON.stringify({ [ns]: CDPF }));
        await cli(['tab', 'new', 'https://f.test/']); await cli(['tab', 'new', 'https://g.test/']);
        await send('Runtime.evaluate', { expression: `localStorage.setItem('vibespace.lang', 'zh'); true` });
        if (ok(await boot(), 'zh: the app booted again for the watch leg')) {
          await sleep(600);
          await ev(`await app.refreshBrowserProfiles(); if (!chatWin()) app.attachSession(${S(SID)}, 'Resume chat', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); if (!live()) app.openBrowserLive({ sessionId: ${S(SID)} }); return true;`);
          await until(async () => !!(await ev('const l = L(); return !!(l && l.state().connected && l.state().tabRow.shown && l.state().tabRow.rows.length === 5);')), 12000, 150);
          await ev('const w = live(); const el = w.element; wm.setMinSize && wm.setMinSize(w.id, null); el.style.width = "360px"; el.style.height = "560px"; window.dispatchEvent(new Event("resize")); return true;');
          await sleep(900);
          const agentTab0 = (tabsOf().find((x) => x.active) || {}).targetId || null;
          const s0 = await ev('const s = L().state(); return { rows: s.tabRow.rows, folded: s.tabRow.folded, mode: s.mode };');
          const pick = s0.rows.find((x) => s0.folded.includes(x.targetId) && !x.active && x.owner === 'agent') || null;
          const more = await ev('const b = L().el().querySelector(".browser-live-tabrow-more"); return b && b.offsetParent ? rect(b) : null;');
          if (more) await click(centre(more));
          await sleep(300);
          const menu = await ev('return [...document.querySelectorAll(".context-menu .context-menu-item")].map((el) => ({ text: el.textContent, disabled: el.classList.contains("disabled"), r: rect(el) }));');
          const entry = pick ? menu.find((x) => x.text.startsWith('查看 — ') && x.text.includes(pick.title)) : null;
          ok(!!pick && menu.length > 0 && !menu.some((x) => x.disabled) && !!entry, `G1 zh: the "▾+N" menu (${s0.folded.length} folded) lists a folded agent tab as "查看 — ${pick ? pick.title : '?'}" — no greyed row`, S({ s0, menu }));
          if (entry) await click(centre(entry.r));
          const watched = !!pick && await until(async () => { const t = await ev('return L().state().tabRow;'); return !!(t.watch && t.watch.targetId === pick.targetId && !t.watch.pending && /^正在查看“/.test(t.watchLine)); }, 8000, 150);
          const t1 = await ev('return L().state().tabRow;');
          const cur = t1.rows.find((x) => x.active) || {};
          ok(watched && t1.watchLine.includes('“' + pick.title + '”') && t1.watchLine.includes('agent 在“' + cur.title + '”上') && !t1.folded.includes(pick.targetId) && opened(pick.targetId) > 0 && (tabsOf().find((x) => x.active) || {}).targetId === agentTab0,
            'G2/G3 zh: the view watches the folded tab — the line names BOTH tabs ("正在查看“…” — …agent 在“…”上"), the watched chip is kept on the row, the capture opened on it, the agent\'s tab untouched', S({ t1, pages: pages.map((p) => p.id), agentTab0 }));
          // G4: the view's socket drops — the reconnected view re-sends its watch; the line and the picture tell ONE truth
          const p0 = pick ? opened(pick.targetId) : 0;
          await ev('const ws = L().ws(); if (ws) ws.close(); return true;');
          const again = !!pick && await until(async () => { const t = await ev('const s = L().state(); return { c: s.connected, w: s.tabRow.watch, line: s.tabRow.watchLine };'); return !!(t.c && opened(pick.targetId) > p0 && t.w && t.w.targetId === pick.targetId && !t.w.pending && t.line.includes('“' + pick.title + '”')); }, 15000, 200);
          ok(again, 'G4 zh: the socket dropped and reopened — the view re-sent its watch (a new capture on the watched tab) and its line still names it: one truth', S(await ev('const s = L().state(); return { c: s.connected, tr: s.tabRow };')));
        }
      } finally {
        try { fs.unlinkSync(path.join(AB, 'cdp.json')); } catch { }
        for (const p of pages) { try { p.ws.terminate(); } catch { } }
        await new Promise((r) => cdpSrv.close(() => r()));
      }
    }
    await send('Runtime.evaluate', { expression: `localStorage.removeItem('vibespace.lang'); true` });
  } finally {
    try { cdp?.close?.(); } catch { }
    for (const u of ups) { try { await u.close(); } catch { } }
    if (SID) { try { wsMain.send(JSON.stringify({ type: 'kill', sessionId: SID })); } catch { } }
    await sleep(500);
    try { wsMain.close(); } catch { }
    try { srv.kill('SIGTERM'); } catch { }
    await sleep(500);
  }
})().catch((e) => ok(false, 'the suite threw', e && (e.stack || e.message)));
done();
