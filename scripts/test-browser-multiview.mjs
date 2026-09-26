#!/usr/bin/env node
// ONE SESSION, MANY BROWSERS / TWO TABBED CHATS, EACH WITH ITS BROWSER — the chrome gate
// (docs/design-browser-multiview.zh.md §3 (b) + D3 / D5, lane P; heavy).
// The owner: "如果两个tabbed窗口每个都打开了各自的浏览器，怎么展示" … "如果我已经开了并排展示俩 agent 对话呢？
// 变成四列？" … "那得考虑重新合并的操作逻辑，比如拖回去？还是可以直接在界面上操作合并回去？"
//
// Scene: a worktree server on a free port, a fake `claude` (four chat sessions Alpha / Bravo /
// Charlie / Delta), a fake `agent-browser` whose `stream status` names one fake upstream per
// profile, a desktop page 1280×900 and later a phone page. Every gesture that matters is a REAL
// pointer event through Input.dispatchMouseEvent.
//   1  TWO CHATS IN ONE GROUP, EACH WITH ITS BROWSER — Alpha + Bravo grouped as tabs; Alpha's
//      browser starts ⇒ its live view is BORN beside it (one pane ⇒ chat | browser); Bravo's
//      starts ⇒ a quiet TAB on the browser side that PULSES — the two shown panes do not move,
//      never a third pane; a REAL click on the Bravo tab (left) ⇒ the right FOLLOWS to Bravo's
//      browser, a real click on Alpha's browser tab (right) ⇒ the left follows to Alpha — ZERO
//      relay reconnects (every live view's socket object is the same, no fake upstream saw a
//      second connection)
//   2  TWO CHATS ALREADY SIDE BY SIDE (Charlie | Delta) — Charlie's browser starts ⇒ a TAB on
//      Charlie's side, nothing on screen moves (the pair, the host rect), still two panes
//   3  POP OUT, FOLD BACK — both paths: Alpha gets a second browser (its strip shows two tabs);
//      a real right-click on a strip tab → "Open in new window" = a second Agent browser window
//      of Alpha (its own selection, the main window unchanged); ① the window's own menu → "Fold
//      back into the Agent browser window" ⇒ it closes, the main window SELECTS that tab;
//      ② popped out again, then its ICON dragged onto the group (the one drag exception) ⇒
//      folded back — never a chain holding two views of one session; ③ (lane P verify) folding back the window
//      the user DRIVES keeps the takeover (a pass to the main window's view) — no handback, no For-you item;
//      the as-shipped order (switch, close, no pass) is the runtime-neutered control
//   4  RECONNECT — a reload restores the group (members, sides, pair) and every live view
//      reconnects and draws
//   5  PHONE (390×844) — one pane; a tab switch there never makes the other side follow
// SKIPs with evidence without chrome / dtach. Free ports, scratch dirs only.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for the server this suite boots (never the machine-global :7/5901 — test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 60) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8'));
const FRAME = FIX.server_to_client.frame;
const ROOT = scratch('browser-multiview');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set(); const worktrees = new Set(); let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const done = () => { console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? ', ' + skipped + ' skipped' : ''})` : `\nALL PASS (${pass}${skipped ? ', ' + skipped + ' skipped' : ''})`); process.exit(fail ? 1 : 0); };

/** A fake stream server per profile: status + tabs on connect, frames at `fps`; counts every connection. */
async function fakeUpstream({ fps = 4 } = {}) {
  const port = await freePort();
  const clients = new Set(); let connections = 0;
  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  wss.on('connection', (ws) => {
    connections++; clients.add(ws);
    ws.send(JSON.stringify(FIX.server_to_client.status)); ws.send(JSON.stringify(FIX.server_to_client.tabs));
    ws.on('close', () => clients.delete(ws)); ws.on('error', () => { });
  });
  const timer = setInterval(() => { for (const c of clients) if (c.readyState === 1) c.send(JSON.stringify({ ...FRAME, metadata: { ...FRAME.metadata, timestamp: Date.now() } })); }, 1000 / fps);
  return { port, clients, get connections() { return connections; }, close() { clearInterval(timer); for (const c of clients) { try { c.terminate(); } catch { } } return new Promise((r) => wss.close(() => r())); } };
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  fakeHome = scratchHome('browser-multiview-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: '%s', hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: '%s', cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\nSID="e2e00000-0000-4000-8000-$(printf '%012d' $$)"\ncase " $* " in *" --output-format "*) sleep 1; printf '${hookLine}\\n${initLine}\\n' "$SID" "$SID";; esac\nexec sleep 600\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab' && x !== '--json');
const [a, b] = argv;
let ports = {}; try { ports = JSON.parse(fs.readFileSync(path.join(st, 'ports.json'), 'utf8')); } catch { }
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19222/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'stream' && b === 'status') { const port = ports[ns] || null; if (!port) { out({ success: false, data: null, error: 'no fake upstream for ' + ns }); process.exit(1); } out({ success: true, data: { enabled: true, connected: true, port, screencasting: true } }); process.exit(0); }
if (a === 'stream' && b === 'enable') { out({ success: false, data: null, error: 'Streaming is already enabled for this session' }); process.exit(1); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const env = { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), FAKE_AB_STATE: AB_STATE, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' };
  for (const k of Object.keys(env)) if (k.startsWith('AGENT_BROWSER_')) delete env[k];
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 40000, 100), 'the worktree server booted', journal.slice(-800))) return;
  const j = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const msgs = []; ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { ws.on('open', r); ws.on('error', e); });
  const create = async (reqId, name) => { ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId, name })); await until(() => msgs.some((m) => m.type === 'created' && m.reqId === reqId), 15000); return msgs.find((m) => m.type === 'created' && m.reqId === reqId)?.sessionId; };
  const SIDS = {};
  for (const [k, n] of [['A', 'Alpha'], ['B', 'Bravo'], ['C', 'Charlie'], ['D', 'Delta']]) SIDS[k] = await create(k, n);
  const ups = [];
  let chrome = null;
  try {
    if (!ok(Object.values(SIDS).every(Boolean), 'four chat sessions (Alpha, Bravo, Charlie, Delta) were created on the fake claude', journal.slice(-600))) return;
    await sleep(1200);
    // four profiles, each its own fake upstream
    const P = {};
    for (const [k, label] of [['A', 'Alpha work'], ['A2', 'Alpha second'], ['B', 'Bravo work'], ['C', 'Charlie work']]) P[k] = (await j('POST', '/api/browser/profiles', { label })).json.profile;
    const U = {};
    for (const k of Object.keys(P)) { U[k] = await fakeUpstream(); ups.push(U[k]); }
    fs.writeFileSync(path.join(AB_STATE, 'ports.json'), JSON.stringify(Object.fromEntries(Object.keys(P).map((k) => ['vs-' + P[k].id, U[k].port]))));

    chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] });
    procs.add(chrome);
    let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
    if (!ok(!!target, 'chrome exposed a CDP page target')) return;
    const cdp = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
    let seq = 0; const pend = new Map();
    cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
    const S = JSON.stringify;
    const ev = async (js) => {
      const r = await send('Runtime.evaluate', { expression: `(async () => { const app = window.app, wm = app.wm; const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; }; const sidOf = (id) => (app.sessions.get(id) || {}).sessionId || null; const chat = (sid) => [...wm.windows.values()].find((w) => w.type === 'chat' && sidOf(w.id) === sid) || null; const lives = (sid) => [...wm.windows.values()].filter((w) => w.type === 'browser-live' && w._browserLive && w._browserLive.state().sessionId === sid); const live = (sid) => wm.windows.get('win-blive-' + sid) || lives(sid)[0] || null; ${js} })()`, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw');
      return r.result?.result?.value;
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    const boot = async (url) => { await send('Page.navigate', { url }); for (let i = 0; i < 120; i++) { try { if (await ev('if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]);')) return true; } catch { } await sleep(250); } return false; };
    if (!ok(await boot(`http://127.0.0.1:${PORT}/`), 'the app booted in headless chrome (desktop, 1280×900)')) return;
    await sleep(1200);
    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const click = async (pt, { button = 'left' } = {}) => { await mouse('mouseMoved', pt.x, pt.y); await mouse('mousePressed', pt.x, pt.y, { button, clickCount: 1 }); await mouse('mouseReleased', pt.x, pt.y, { button, clickCount: 1 }); await sleep(300); };
    const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const attach = async (sid, profile) => (await j('POST', '/api/browser/attach', { sessionId: sid, profile })).status === 200;
    await ev('await app.refreshBrowserProfiles(); return true;'); // the first digest is a snapshot — the auto-bind reacts to the NEXT one

    // ── 1 · two chats in one group, each with its browser; the follow ──
    console.log('— 1 · two tabbed chats, each with its browser: born beside / a quiet tab / the follow with zero reconnects');
    await ev(`app.attachSession(${S(SIDS.A)}, 'Alpha', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev(`return !!chat(${S(SIDS.A)});`), 10000);
    await ev(`app.attachSession(${S(SIDS.B)}, 'Bravo', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev(`return !!chat(${S(SIDS.B)});`), 10000);
    const ids = await ev(`const A = chat(${S(SIDS.A)}), B = chat(${S(SIDS.B)}); wm.createTabChain(A, B); return { A: A.id, B: B.id };`);
    ok(await attach(SIDS.A, 'Alpha work'), 'Alpha attaches its browser (a new lease in the digest)');
    const born = await until(() => ev(`const L = live(${S(SIDS.A)}); return !!(L && L._tabChain && L._tabChain === chat(${S(SIDS.A)})._tabChain && L._browserLive.state().frames >= 1);`), 15000);
    const c1 = await ev(`const ch = chat(${S(SIDS.A)})._tabChain; return { layout: ch.layout, pair: ch.split && ch.split.pair, left: ch.split && ch.split.left, right: ch.split && ch.split.right };`);
    const LA = await ev(`return live(${S(SIDS.A)}).id;`);
    ok(born && c1.layout === 'split' && S(c1.pair) === S([ids.A, LA]) && S(c1.right) === S([LA]), 'D5 (b): the group was NOT split yet ⇒ Alpha\'s live view is born BESIDE it — chat | browser (the one pane became two)', S(c1));
    const rectBefore = await ev(`return rect(wm.windows.get(${S(ids.A)}).element);`);
    ok(await attach(SIDS.B, 'Bravo work'), 'Bravo attaches its browser');
    const bornB = await until(() => ev(`const L = live(${S(SIDS.B)}); return !!(L && L._tabChain && L._browserLive.state().connected);`), 15000);
    const c2 = await ev(`const ch = chat(${S(SIDS.A)})._tabChain; const LB = live(${S(SIDS.B)}); const tab = wm.windows.get(ch.tabs[0]).titleBar.querySelector('.tab-item[data-win-id="' + LB.id + '"]'); return { pair: ch.split.pair, right: ch.split.right, left: ch.split.left, LB: LB.id, arrived: !!(tab && tab.classList.contains('tab-arrived')), hidden: LB.content.classList.contains('tab-hidden'), shownPanes: ch.tabs.filter((id) => !wm.windows.get(id).content.classList.contains('tab-hidden')).length, host: rect(wm.windows.get(ch.tabs[0]).element) };`);
    const LB = c2.LB;
    ok(bornB && S(c2.pair) === S([ids.A, LA]) && S(c2.right) === S([LA, LB]) && c2.hidden && c2.arrived, 'D5 (a)/(b): the group is ALREADY split ⇒ Bravo\'s live view is a TAB on the browser side, hidden, PULSING — the two shown panes did not move', S(c2));
    ok(c2.shownPanes === 2 && Math.abs(c2.host.width - rectBefore.width) <= 1 && Math.abs(c2.host.left - rectBefore.left) <= 1, 'still TWO panes (never a third), the window did not move or resize', S({ before: rectBefore, after: c2.host }));
    await ev(`window.__ws0 = { A: live(${S(SIDS.A)})._browserLive.ws(), B: live(${S(SIDS.B)})._browserLive.ws() }; return true;`);
    const conn0 = { A: U.A.connections, B: U.B.connections };
    // a REAL click on the Bravo chat tab (left half)
    const tabB = await ev(`const ch = chat(${S(SIDS.A)})._tabChain; return rect(wm.windows.get(ch.tabs[0]).titleBar.querySelector('.tab-item[data-win-id="${ids.B}"]'));`);
    await click(centre(tabB));
    const f1 = await until(() => ev(`const ch = chat(${S(SIDS.A)})._tabChain; return ch.split.pair[0] === ${S(ids.B)} && ch.split.pair[1] === ${S(LB)};`), 4000);
    const s1 = await ev(`const ch = chat(${S(SIDS.A)})._tabChain; return { pair: ch.split.pair, active: ch.tabs[ch.active], sameA: live(${S(SIDS.A)})._browserLive.ws() === window.__ws0.A, sameB: live(${S(SIDS.B)})._browserLive.ws() === window.__ws0.B, bFrames: live(${S(SIDS.B)})._browserLive.state().frames };`);
    ok(f1 && s1.active === ids.B, 'D5 (c) / §3 (b): a REAL click on Bravo (left) ⇒ the right FOLLOWS to Bravo\'s browser; the focus stays on the clicked tab', S(s1));
    ok(s1.sameA && s1.sameB && U.A.connections === conn0.A && U.B.connections === conn0.B && s1.bFrames >= 1, 'ZERO relay reconnects: both live views kept their socket, no upstream saw a second connection (the browser was already connected)', S({ s1, conn0, now: { A: U.A.connections, B: U.B.connections } }));
    // a REAL click on Alpha's browser tab (right half) ⇒ the left follows to Alpha
    const tabLA = await ev(`const ch = chat(${S(SIDS.A)})._tabChain; return rect(wm.windows.get(ch.tabs[0]).titleBar.querySelector('.tab-item[data-win-id="${LA}"]'));`);
    await click(centre(tabLA));
    const f2 = await until(() => ev(`const ch = chat(${S(SIDS.A)})._tabChain; return ch.split.pair[0] === ${S(ids.A)} && ch.split.pair[1] === ${S(LA)};`), 4000);
    ok(f2 && U.A.connections === conn0.A && U.B.connections === conn0.B, '…and the reverse: a REAL click on Alpha\'s browser (right) ⇒ the left follows to chat Alpha — still zero reconnects', S(await ev(`return chat(${S(SIDS.A)})._tabChain.split.pair;`)));

    // ── 2 · two chats already side by side ──
    console.log('— 2 · two chats ALREADY side by side: the new browser is a tab, nothing moves');
    await ev(`app.attachSession(${S(SIDS.C)}, 'Charlie', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev(`return !!chat(${S(SIDS.C)});`), 10000);
    await ev(`app.attachSession(${S(SIDS.D)}, 'Delta', ${S(ROOT)}, { mode: 'chat', backend: 'claude' }); return true;`);
    await until(() => ev(`return !!chat(${S(SIDS.D)});`), 10000);
    const cd = await ev(`const C = chat(${S(SIDS.C)}), D = chat(${S(SIDS.D)}); wm.bindSplit(C, D, { side: 'right' }); await new Promise((r) => setTimeout(r, 300)); const ch = C._tabChain; return { C: C.id, D: D.id, pair: ch.split.pair, host: rect(wm.windows.get(ch.tabs[0]).element) };`);
    ok(S(cd.pair) === S([cd.C, cd.D]), 'Charlie | Delta, side by side');
    ok(await attach(SIDS.C, 'Charlie work'), 'Charlie attaches its browser');
    const bornC = await until(() => ev(`const L = live(${S(SIDS.C)}); return !!(L && L._tabChain && L._tabChain === chat(${S(SIDS.C)})._tabChain);`), 15000);
    const c3 = await ev(`const ch = chat(${S(SIDS.C)})._tabChain; const LC = live(${S(SIDS.C)}); return { pair: ch.split.pair, left: ch.split.left, right: ch.split.right, LC: LC.id, hidden: LC.content.classList.contains('tab-hidden'), shown: ch.tabs.filter((id) => !wm.windows.get(id).content.classList.contains('tab-hidden')).length, host: rect(wm.windows.get(ch.tabs[0]).element) };`);
    ok(bornC && S(c3.pair) === S([cd.C, cd.D]) && c3.left.includes(c3.LC) && c3.hidden && c3.shown === 2, 'D5 (b): Charlie\'s browser is a TAB on Charlie\'s own side (no browser side yet) — the pair stays Charlie | Delta, two panes, never four columns', S(c3));
    ok(Math.abs(c3.host.left - cd.host.left) <= 1 && Math.abs(c3.host.width - cd.host.width) <= 1, '…and the window did not move', S({ before: cd.host, after: c3.host }));

    // ── 3 · pop out, fold back (both paths) ──
    console.log('— 3 · pop out a strip tab into its own window; fold back through the menu and through the icon drop');
    ok(await attach(SIDS.A, 'Alpha second'), 'Alpha attaches a SECOND browser');
    const strip2 = await until(() => ev(`const L = live(${S(SIDS.A)})._browserLive; return L.state().stripShown && L.state().rows.length === 2;`), 8000);
    ok(strip2 && (await ev(`return [...wm.windows.values()].filter((w) => w.type === 'browser-live' && w._browserLive.state().sessionId === ${S(SIDS.A)}).length;`)) === 1, 'ONE Agent browser window for Alpha, its strip now lists both of its browsers (no second window opened by itself)');
    const tabA2 = await ev(`const L = live(${S(SIDS.A)})._browserLive; const b = L.el().querySelector('.browser-live-strip-tab[data-ref="${P.A2.id}"]'); return b ? rect(b) : null;`);
    await click(centre(tabA2), { button: 'right' });
    const itemRect = await ev(`const m = document.querySelector('.context-menu'); const it = m && [...m.querySelectorAll('.context-menu-item')].find((x) => x.textContent.trim() === 'Open in new window'); return it ? rect(it) : null;`);
    ok(!!itemRect, 'a real RIGHT-click on a strip tab offers "Open in new window"');
    if (itemRect) await click(centre(itemRect));
    const popped = await until(() => ev(`const ws = lives(${S(SIDS.A)}); return ws.length === 2 && ws.some((w) => w.id !== 'win-blive-' + ${S(SIDS.A)} && w._browserLive.state().currentRef === ${S(P.A2.id)} && w._browserLive.state().frames >= 1);`), 10000);
    const pop1 = await ev(`const ws = lives(${S(SIDS.A)}); const p = ws.find((w) => w.id !== 'win-blive-' + ${S(SIDS.A)}); return { id: p && p.id, chained: !!(p && p._tabChain), mainRef: live(${S(SIDS.A)})._browserLive.state().currentRef };`);
    ok(popped && !pop1.chained && pop1.mainRef === P.A.id, 'D3: a SECOND Agent browser window of Alpha (a free window, the same strip, its OWN selection = Alpha second); the main one still shows Alpha work', S(pop1));
    // path ①: the window's own menu
    const bar1 = await ev(`return rect(wm.windows.get(${S(pop1.id)}).titleSpan);`);
    await click(centre(bar1), { button: 'right' });
    const fold1 = await ev(`const m = document.querySelector('.taskbar-context-menu'); const it = m && [...m.querySelectorAll('.taskbar-context-menu-item')].find((x) => x.textContent.trim() === 'Fold back into the Agent browser window'); return it ? rect(it) : null;`);
    ok(!!fold1, 'its title-bar menu offers "Fold back into the Agent browser window"');
    if (fold1) await click(centre(fold1));
    const back1 = await until(() => ev(`return !wm.windows.has(${S(pop1.id)}) && lives(${S(SIDS.A)}).length === 1 && live(${S(SIDS.A)})._browserLive.state().currentRef === ${S(P.A2.id)};`), 6000);
    ok(back1, 'path ① folded back: the popped-out window closed, the main one SELECTS the tab it showed (Alpha second)');
    // path ②: pop out again, then drag its ICON onto the group — the one drag exception folds back
    const tabA1 = await ev(`const L = live(${S(SIDS.A)})._browserLive; return rect(L.el().querySelector('.browser-live-strip-tab[data-ref="${P.A.id}"]'));`);
    await click(centre(tabA1), { button: 'right' });
    const it2 = await ev(`const m = document.querySelector('.context-menu'); const it = m && [...m.querySelectorAll('.context-menu-item')].find((x) => x.textContent.trim() === 'Open in new window'); return it ? rect(it) : null;`);
    if (it2) await click(centre(it2));
    await until(() => ev(`return lives(${S(SIDS.A)}).length === 2;`), 8000);
    // the drop point: a tab ICON of the group's strip (its halves are display:contents in a split — the icon is a real box)
    const pop2 = await ev(`const p = lives(${S(SIDS.A)}).find((w) => w.id !== 'win-blive-' + ${S(SIDS.A)}); p.element.style.left = '760px'; p.element.style.top = '420px'; p.element.style.width = '420px'; p.element.style.height = '300px'; wm.focusWindow(p.id); await new Promise((r) => setTimeout(r, 200)); const host = wm.windows.get(chat(${S(SIDS.A)})._tabChain.tabs[0]); return { id: p.id, ref: p._browserLive.state().currentRef, icon: rect(p.iconWrap), drop: rect(host.titleBar.querySelector('.tab-item[data-win-id="${ids.B}"] .tab-icon-wrap')) };`);
    ok(pop2.ref === P.A.id, 'popped out again (Alpha work)');
    const from = centre(pop2.icon), to = centre(pop2.drop);
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y, { button: 'left', clickCount: 1 });
    for (let i = 1; i <= 14; i++) { await mouse('mouseMoved', from.x + (to.x - from.x) * i / 14, from.y + (to.y - from.y) * i / 14, { button: 'left', buttons: 1 }); await sleep(40); }
    await mouse('mouseReleased', to.x, to.y, { button: 'left', clickCount: 1 });
    const back2 = await until(() => ev(`return !wm.windows.has(${S(pop2.id)}) && lives(${S(SIDS.A)}).length === 1 && live(${S(SIDS.A)})._browserLive.state().currentRef === ${S(P.A.id)};`), 6000);
    const chainAfter = await ev(`const ch = chat(${S(SIDS.A)})._tabChain; return { tabs: ch.tabs.length, lives: ch.tabs.filter((id) => wm.windows.get(id).type === 'browser-live').length };`);
    ok(back2 && chainAfter.lives === 2, 'path ② the ICON dropped on the group FOLDED BACK: the window closed, the main one shows its tab — the group still holds exactly one view per session (never a chain of two views of one session)', S({ back2, chainAfter }));
    // path ③ (lane P verify, finding 3): fold back the window the user is DRIVING — the takeover moves with it (a
    // `pass` to the main window's view before the close): the keeper still says user, the main window drives, no
    // viewer-left handback, no For-you item. Control (a runtime neuter of the as-shipped order — switch, then close
    // with no pass): the same act hands the browser back to the agent.
    const popDrive = async () => {
      await ev(`app.openBrowserLive({ sessionId: ${S(SIDS.A)}, profileId: ${S(P.A2.id)}, popOut: true }); return true;`); // the menu's own act (2.369.183: a plain open FOCUSES the session's view since lane H)
      await until(() => ev(`return lives(${S(SIDS.A)}).length === 2 && lives(${S(SIDS.A)}).some((w) => w.id !== 'win-blive-' + ${S(SIDS.A)} && w._browserLive.state().currentRef === ${S(P.A2.id)} && w._browserLive.state().target);`), 10000);
      const id = await ev(`const p = lives(${S(SIDS.A)}).find((w) => w.id !== 'win-blive-' + ${S(SIDS.A)}); p._browserLive.send({ type: 'takeover' }); return p.id;`);
      await until(() => ev(`const p = wm.windows.get(${S(id)}); return !!(p && p._browserLive.state().mode === 'takeover' && p._browserLive.state().mine);`), 6000);
      return id;
    };
    const inputA2 = async () => { const r = await j('GET', `/api/browser/session/${SIDS.A}`); const i = ((r.json && r.json.inputs) || []).find((x) => x.profileId === P.A2.id); return i ? i.input : null; };
    const todos0 = ((await j('GET', '/api/user-todos')).json || {}).todos || [];
    const pop3 = await popDrive();
    ok((await inputA2()) === 'user', 'path ③ the user takes over Alpha second in a POPPED-OUT window (the keeper says user)');
    const mark3 = journal.length;
    const bar3 = await ev(`return rect(wm.windows.get(${S(pop3)}).titleSpan);`);
    await click(centre(bar3), { button: 'right' });
    const fold3 = await ev(`const m = document.querySelector('.taskbar-context-menu'); const it = m && [...m.querySelectorAll('.taskbar-context-menu-item')].find((x) => x.textContent.trim() === 'Fold back into the Agent browser window'); return it ? rect(it) : null;`);
    if (fold3) await click(centre(fold3));
    const back3 = await until(() => ev(`const L = live(${S(SIDS.A)})._browserLive.state(); return !wm.windows.has(${S(pop3)}) && lives(${S(SIDS.A)}).length === 1 && L.currentRef === ${S(P.A2.id)} && L.mode === 'takeover' && L.mine;`), 10000);
    await sleep(400);
    const main3 = await ev(`const L = live(${S(SIDS.A)})._browserLive.state(); return { ref: L.currentRef, mode: L.mode, mine: L.mine, badge: L.badge };`);
    const todos3 = ((await j('GET', '/api/user-todos')).json || {}).todos || [];
    ok(!!fold3 && back3 && main3.mode === 'takeover' && main3.mine && (await inputA2()) === 'user', 'path ③ folding back the window you DRIVE keeps your control: the main window shows that browser in takeover, yours — the keeper still says user', S(main3));
    ok(!/handed back to the agent/.test(journal.slice(mark3)) && todos3.length === todos0.length, 'path ③ …nothing was handed back (no viewer-left handback in the journal) and no For-you item appeared', journal.slice(mark3).split('\n').filter((l) => /handed back|passed from view/.test(l)).join(' | '));
    ok(/control passed from view \d+ to view \d+/.test(journal.slice(mark3)), 'path ③ …the journal names the pass (view → view)');
    await ev(`live(${S(SIDS.A)})._browserLive.send({ type: 'handback' }); return true;`);
    await until(async () => (await inputA2()) === 'agent', 5000);
    // the control: the as-shipped fold-back ORDER (switch the main one, close the driven one, no pass)
    const pop4 = await popDrive();
    const mark4 = journal.length;
    await ev(`const p = wm.windows.get(${S(pop4)}); live(${S(SIDS.A)})._browserLive.switchTo(p._browserLive.state().currentRef); wm.closeWindow(p.id); return true;`);
    await until(async () => (await inputA2()) === 'agent', 6000);
    ok((await inputA2()) === 'agent' && /handed back to the agent \(viewer-left/.test(journal.slice(mark4)), 'path ③ CONTROL: the pre-fix order (switch, close, no pass) hands the browser back to the agent (viewer-left) — the leg above is red on it', journal.slice(mark4).split('\n').filter((l) => /handed back/.test(l)).join(' | '));
    await ev(`const L = live(${S(SIDS.A)})._browserLive; L.switchTo(${S(P.A.id)}); return true;`);
    await until(() => ev(`return live(${S(SIDS.A)})._browserLive.state().currentRef === ${S(P.A.id)} && live(${S(SIDS.A)})._browserLive.state().connected;`), 6000);

    // ── 3b · lane P verify (finding 5): a Task Group's default cap is where a conversation STARTS ──
    console.log('— 3b · a Task Group\'s default browser cap: stamped when a conversation starts, never read live off the group');
    const grp = (await j('POST', '/api/tasks', { title: 'Multiview cap group', browserCap: 2 })).json;
    const gid = grp && grp.task && grp.task.id;
    ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId: 'E2', name: 'Echo in group', taskId: gid }));
    await until(() => msgs.some((m) => m.type === 'created' && m.reqId === 'E2'), 15000);
    SIDS.E2 = msgs.find((m) => m.type === 'created' && m.reqId === 'E2')?.sessionId || null;
    await sleep(800);
    const capOfS = async (sid) => ((await j('GET', `/api/browser/session/${sid}`)).json || {}).cap || null;
    const inG = await capOfS(SIDS.E2), outG = await capOfS(SIDS.B);
    ok(!!gid && !!SIDS.E2 && inG && inG.cap === 2 && inG.origin === 'task-group' && inG.explicit === null, 'a conversation CREATED into the group starts with the group\'s default cap (2, origin task-group)', S({ gid, inG }));
    ok(outG && outG.origin !== 'task-group', 'a conversation already RUNNING outside it is untouched', S(outG));
    await j('PATCH', `/api/tasks/${gid}`, { browserCap: 5 });
    await sleep(300);
    const inG2 = await capOfS(SIDS.E2);
    ok(inG2 && inG2.cap === 2 && inG2.origin === 'task-group', 'the group\'s default edited to 5 while that conversation RUNS: it keeps the 2 it started with (a running agent is never refused mid-turn by a group edit)', S(inG2));

    // ── 4 · reconnect ──
    console.log('— 4 · a reload restores the group and every live view reconnects');
    await ev(`const ch = chat(${S(SIDS.A)})._tabChain; const i = ch.tabs.indexOf(${S(ids.B)}); wm.switchTab(ch, i); return true;`); // left Bravo ⇒ the right follows to Bravo's browser
    const before4 = await ev(`const ch = chat(${S(SIDS.A)})._tabChain; return { pair: ch.split.pair, left: ch.split.left, right: ch.split.right };`);
    await sleep(3500); // past the 2 s autosave debounce
    ok(await boot(`http://127.0.0.1:${PORT}/?r=1`), 'the page reloaded');
    const restored = await until(() => ev(`const A = chat(${S(SIDS.A)}); const ch = A && A._tabChain; const la = live(${S(SIDS.A)}), lb = live(${S(SIDS.B)}); return !!(ch && la && lb && la._tabChain === ch && lb._tabChain === ch && la._browserLive.state().connected && lb._browserLive.state().connected && la._browserLive.state().frames >= 1 && lb._browserLive.state().frames >= 1);`), 25000);
    const after4 = await ev(`const ch = chat(${S(SIDS.A)})._tabChain; const la = live(${S(SIDS.A)}), lb = live(${S(SIDS.B)}); const st = (w) => w && w._browserLive ? (({ connected, frames, currentRef, error }) => ({ connected, frames, currentRef, error: error && (error.code || error.state) }))(w._browserLive.state()) : null; return ch ? { layout: ch.layout, pair: ch.split && ch.split.pair, left: ch.split && ch.split.left, right: ch.split && ch.split.right, la: st(la), lb: st(lb), inChain: [la && la._tabChain === ch, lb && lb._tabChain === ch] } : null;`);
    ok(restored && after4 && after4.layout === 'split' && S(after4.pair) === S(before4.pair) && S(after4.left) === S(before4.left) && S(after4.right) === S(before4.right), 'the group comes back whole (members, sides, the shown pair) and both live views reconnect and draw', S({ before4, after4 }));

    // ── 5 · phone ──
    console.log('— 5 · phone (390×844): one pane; a switch there never makes the other side follow');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    if (ok(await boot(`http://127.0.0.1:${PORT}/?m=1`), 'the app booted at 390×844')) {
      await until(() => ev(`const A = chat(${S(SIDS.A)}); return !!(A && A._tabChain && live(${S(SIDS.A)}));`), 20000);
      const ph = await ev(`const ch = chat(${S(SIDS.A)})._tabChain; const vis = ch.tabs.filter((id) => { const c = wm.windows.get(id).content; return !c.classList.contains('tab-hidden') && getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().width > 0; }); const rightBefore = ch.split ? ch.split.pair[1] : null; wm.switchTab(ch, ch.tabs.indexOf(${S(ids.A)})); await new Promise((r) => setTimeout(r, 300)); return { vis: vis.length, rightBefore, rightAfter: ch.split ? ch.split.pair[1] : null, layout: ch.layout };`);
      ok(ph.vis === 1, 'the phone shows ONE pane of the group', S(ph));
      ok(ph.layout === 'split' && ph.rightAfter === ph.rightBefore, 'switching to Alpha on the phone does NOT make the other side follow (the model keeps the desktop\'s right side)', S(ph));
    }
    try { cdp.close(); } catch { }
  } finally {
    for (const sid of Object.values(SIDS).filter(Boolean)) ws.send(JSON.stringify({ type: 'kill', sessionId: sid }));
    await until(() => Object.values(SIDS).filter(Boolean).every((sid) => msgs.some((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === sid)), 8000);
    try { const r = await j('GET', '/api/browser/profiles'); for (const p of (r.json && r.json.profiles) || []) await j('POST', `/api/browser/profiles/${p.id}/stop`); } catch { }
    try { for (const l of fs.readFileSync(path.join(AB_STATE, 'pids'), 'utf8').trim().split('\n')) { const pid = Number(l); if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { } } } } catch { }
    try { ws.close(); } catch { }
    for (const u of ups) await u.close();
    try { chrome && chrome.kill('SIGKILL'); } catch { }
    srv.kill('SIGKILL');
  }
})().catch((e) => ok(false, 'the suite threw', e && (e.stack || e.message)));

done();
