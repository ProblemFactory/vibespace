#!/usr/bin/env node
// AGENT BROWSER P7 — WINDOW BINDING, the chrome half (docs/design-agent-browser-v2.md
// §4.6 / §3.7, D19 / D24; §9's `test-window-binding` row, "heavy"). The fast
// half (the PURE model + the wiring pins) is test-window-binding-model.mjs.
//
// A worktree server (a fake claude on CLAUDE_CMD, a fake agent-browser whose
// `stream status` names a fake upstream so the live view draws frames), one
// headless chrome at 1280×900 + a SECOND page at 390×844 with a phone UA:
//   ① a chat window is open and the session attaches a profile ⇒ AUTO-BIND:
//      the live view is BORN inside the chat's chain as a split — ONE window,
//      two panes side by side (measured rects), the deterministic syncId,
//      frames drawn in the bound pane, the ownership badge on the browser tab
//      with the session's own colour, the bar's Unbind / Snap beside round trip;
//   ② the divider drag under a NON-1 UI scale (body zoom 1.25) lands where the
//      pointer is (ratio ≈ 0.3 and the divider's centre within 4 px of the
//      pointer); double-click evens it out;
//   ③ move (a real title-bar drag), minimise / restore and a desktop switch
//      keep the two panes together (one window; the split survives each);
//   ④ closing the browser pane collapses to tabs WITHOUT moving the chat
//      window (the chat rect before == after); the three-tab case: a third tab
//      replaces the non-anchor pane (D19 a), and closing the CHAT (the host)
//      leaves `layout === 'tabs'` with no dangling id;
//   ⑤ layouts persistence carries layout + split; a PHONE client boots on
//      that state, renders tabs (one pane displayed, no divider) with the
//      split still in its model, and its own save leaves the split in
//      data/layouts.json and on the desktop client (never flattened);
//   ⑥ a second session attaching the SAME profile grows the badge to two
//      dots; a second profile grows the strip with per-pane owner dots.
// SKIPs with evidence without a chrome / dtach. Free ports, scratch dirs only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE } from './scratch.mjs';
const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require('ws');
const C = require('../src/lib/chain-layout.js');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 700) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIX = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8'));
const FRAME = FIX.server_to_client.frame;
const ROOT = scratch('window-binding');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set();
const worktrees = new Set();
let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

/** The fake upstream stream server (the real 0.32.0 shapes at `fps`). */
async function fakeUpstream({ fps = 4 } = {}) {
  const port = await freePort();
  const clients = new Set();
  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  const frameMsg = () => JSON.stringify({ ...FRAME, metadata: { ...FRAME.metadata, timestamp: Date.now() } });
  let timer = null;
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify(FIX.server_to_client.status)); ws.send(JSON.stringify(FIX.server_to_client.tabs));
    ws.send(JSON.stringify({ type: 'url', url: 'https://example.com/first', timestamp: Date.now() }));
    ws.on('close', () => clients.delete(ws));
  });
  if (fps) timer = setInterval(() => { for (const c of clients) if (c.readyState === 1) c.send(frameMsg()); }, 1000 / fps);
  return { port, clients, close() { if (timer) clearInterval(timer); for (const c of clients) { try { c.terminate(); } catch { } } return new Promise((r) => wss.close(() => r())); } };
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — a local session cannot be created here');
else await (async () => {
  const upA = await fakeUpstream(), upB = await fakeUpstream();
  fakeHome = scratchHome('window-binding-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
  const SID = crypto.randomUUID();
  const hookLine = JSON.stringify({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
  const initLine = JSON.stringify({ type: 'system', subtype: 'init', session_id: SID, cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(path.join(BIN, 'claude'), `#!/bin/sh\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n%s\\n' '${hookLine}' '${initLine}';; esac\nexec sleep 600\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(BIN, 'agent-browser'), `#!${process.execPath}
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const st = process.env.FAKE_AB_STATE; const ns = process.env.AGENT_BROWSER_NAMESPACE || 'default';
const f = path.join(st, ns + '.json');
const read = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const out = (o) => { process.stdout.write(JSON.stringify(o) + '\\n'); };
const argv = process.argv.slice(2).filter((x) => x !== '--pin-tab');
const [a, b] = argv;
const ports = JSON.parse(fs.readFileSync(path.join(st, 'ports.json'), 'utf8'));
if (a === '--version') { console.log('agent-browser 0.38.0'); process.exit(0); }
if (a === 'session' && b === 'info') { const s = read(); const act = !!(s && alive(s.pid)); out({ success: true, data: { active: act, namespace: ns, pid: act ? s.pid : null, session: process.env.AGENT_BROWSER_SESSION || null, socketDir: path.join(st, ns, 'run'), version: act ? '0.38.0' : null } }); process.exit(0); }
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); fs.appendFileSync(path.join(st, 'pids'), c.pid + '\\n'); } out({ success: true, data: { url: b } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:19222/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'stream' && b === 'status') { const port = ports[ns] || null; if (!port) { out({ success: false, data: null, error: 'fake: no stream for ' + ns }); process.exit(1); } out({ success: true, data: { connected: true, enabled: true, port, screencasting: false } }); process.exit(0); }
if (a === 'stream' && b === 'enable') { out({ success: false, data: null, error: 'Streaming is already enabled for this session' }); process.exit(1); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1, failed: [], sessions: [] } }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
  const PORT = await freePort(), CDP = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const baseEnv = { ...process.env, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), FAKE_AB_STATE: AB_STATE };
  for (const k of Object.keys(baseEnv)) if (k.startsWith('AGENT_BROWSER_')) delete baseEnv[k];
  let journal = '';
  const srv = spawn('node', ['server.js'], { cwd: wt, env: { ...baseEnv, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv);
  srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  const booted = await until(() => journal.includes('Ready.'), 40000, 100);
  if (!ok(booted, 'the worktree server booted', journal.slice(-800))) return;
  const j = async (method, p, body) => { const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined }); let json = null; try { json = await res.json(); } catch { } return { status: res.status, json }; };
  const work = (await j('POST', '/api/browser/profiles', { label: 'Work' })).json.profile;
  const pers = (await j('POST', '/api/browser/profiles', { label: 'Personal' })).json.profile;
  fs.writeFileSync(path.join(AB_STATE, 'ports.json'), JSON.stringify({ ['vs-' + work.id]: upA.port, ['vs-' + pers.id]: upB.port }));
  // two live chat sessions through the real ws create (the fake claude's stdout is parsed)
  const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
  await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
  wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId: 'r1', name: 'bind-one' }));
  await until(() => msgs.some((m) => m.type === 'created' && m.reqId === 'r1'), 15000);
  const created = msgs.find((m) => m.type === 'created' && m.reqId === 'r1');
  if (!ok(created && created.sessionId, 'a chat session was created', journal.slice(-600))) return;
  const sessionId = created.sessionId;
  wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId: 'r2', name: 'bind-two' }));
  await until(() => msgs.some((m) => m.type === 'created' && m.reqId === 'r2'), 15000);
  const created2 = msgs.find((m) => m.type === 'created' && m.reqId === 'r2');
  ok(created2 && created2.sessionId, 'a second chat session was created');
  const session2 = created2 ? created2.sessionId : null;
  await sleep(1500);
  const rememberPids = () => { try { for (const l of fs.readFileSync(path.join(AB_STATE, 'pids'), 'utf8').trim().split('\n')) { const pid = Number(l); if (pid) procs.add({ kill: () => process.kill(pid, 'SIGKILL') }); } } catch { } };

  // ── headless chrome, page A (the desktop) ──
  const chromeLog = [];
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1280,900', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  procs.add(chrome);
  chrome.stderr.on('data', (d) => { if (chromeLog.length < 40) chromeLog.push(d.toString()); });
  let target = null;
  for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!ok(!!target, 'chrome exposed a CDP page target', chromeLog.join('').slice(0, 800))) return;
  /** A CDP client for a page target. */
  const client = async (wsUrl) => {
    const cdp = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r, e) => { cdp.on('open', r); cdp.on('error', e); });
    let seq = 0; const pend = new Map();
    cdp.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); cdp.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval threw'); return r.result?.result?.value; };
    await send('Page.enable'); await send('Runtime.enable');
    return { cdp, send, evaluate, close: () => { try { cdp.close(); } catch { } } };
  };
  const A = await client(target.webSocketDebuggerUrl);
  await A.send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: the first-run wizard would cover the chrome on an empty runner
  await A.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await A.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
  const bootOk = async (X) => { for (let i = 0; i < 120; i++) { try { if (await X.evaluate('(async () => { if (!window.app || !window.app.ready) return false; return await Promise.race([window.app.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 100))]); })()')) return true; } catch { } await sleep(250); } return false; };
  if (!ok(await bootOk(A), 'the app booted in headless chrome (desktop, 1280×900)')) return;
  // THE RUNNER, LOCALLY (2.369.155): VS_CPU_THROTTLE=8 slows page A's main thread the way a loaded 4-vCPU Actions
  // runner does (two heavy lanes, each a server + chrome) — at 8 the pre-fix ③ reproduced the mirror's (18, 20) exactly
  const THROTTLE = Number(process.env.VS_CPU_THROTTLE) || 0;
  if (THROTTLE > 1) { await A.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE }); console.log(`  (page A's CPU throttled ×${THROTTLE} — VS_CPU_THROTTLE)`); }
  await A.evaluate('window.app.refreshBrowserProfiles()');
  /** GEOMETRY SETTLE (2.369.155, the mirror's standing red): a CSS change that resizes the workspace (② puts the
   *  body zoom back) reaches the windows ASYNCHRONOUSLY — the workspace ResizeObserver fires after the next layout and
   *  `_scheduleReflowWindows` applies every gridBounds-tracked window one animation frame later. A leg that probes
   *  geometry and then presses on it must wait for that reflow, or the press lands wherever the window WAS: on a
   *  loaded runner the reflow landed between ③'s probe and its press, moved the title bar 20 px down from under the
   *  pointer (the press hit empty workspace — no drag at all) and the host "moved by (18, 20)" = the reflow itself.
   *  Each sample is taken after two frames + a task (past the ResizeObserver's own reflow frame); settled = the
   *  host rect unchanged across three consecutive samples with no reflow pending. */
  const settledGeometry = async (X, budgetMs = 8000) => {
    const t0 = Date.now(); let prev = null, same = 0, n = 0, last = null;
    while (Date.now() - t0 < budgetMs) {
      last = await X.evaluate(`new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { const wm = window.app.wm; const c = [...wm.windows.values()].find((w) => w.type === 'chat'); const host = c && c._tabChain ? wm.windows.get(c._tabChain.tabs[0]) : c; const r = host.element.getBoundingClientRect(); res({ rect: [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 4) / 4).join(','), pending: !!wm._reflowScheduled, workspace: wm.workspace.offsetWidth + 'x' + wm.workspace.offsetHeight }); }, 0))))`);
      n++;
      if (!last.pending && prev && last.rect === prev.rect) { if (++same >= 2) return { ok: true, samples: n, ms: Date.now() - t0, ...last }; } else same = 0;
      prev = last;
    }
    return { ok: false, samples: n, ms: Date.now() - t0, ...last };
  };
  const ev = (X, js) => X.evaluate(`(() => { const app = window.app, wm = app.wm; const byType = (t) => [...wm.windows.values()].filter((w) => w.type === t); const live = () => byType('browser-live')[0] || null; const chat = () => byType('chat')[0] || null; const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; }; const disp = (el) => getComputedStyle(el).display; ${js} })()`);

  // ── ① auto-bind: the chat window is open, the session attaches a profile ──
  console.log('— ① auto-bind: the live view is BORN inside the chat window\'s chain');
  await A.evaluate(`window.app.attachSession(${JSON.stringify(sessionId)}, 'bind-one', ${JSON.stringify(ROOT)}, { mode: 'chat', backend: 'claude' })`);
  const chatUp = await until(() => ev(A, `const c = chat(); return !!(c && app.sessions.get(c.id) && app.sessions.get(c.id).sessionId === ${JSON.stringify(sessionId)});`), 15000);
  if (!ok(chatUp, 'the chat window is open and attached (app.sessions names its session)')) return;
  const chatId = await ev(A, 'return chat().id;');
  let att = await j('POST', '/api/browser/attach', { sessionId, profile: 'Work' });
  ok(att.status === 200 && att.json.lease, 'the session attached Work (a NEW lease in the digest)', JSON.stringify(att.json).slice(0, 200));
  rememberPids();
  const bound = await until(() => ev(A, `const l = live(); return !!(l && l._tabChain && l._tabChain.layout === 'split');`), 15000);
  ok(bound, 'a browser-live window appeared in the chat\'s chain with layout split (auto-bind, default ON)');
  let liveId = await ev(A, 'const l = live(); return l ? l.id : null;');
  ok(liveId === 'win-blive-' + sessionId, `the live window carries the deterministic syncId (${liveId})`);
  const s1 = await ev(A, `const l = live(), c = chat(); const ch = c._tabChain; const host = wm.windows.get(ch.tabs[0]); return { sameChain: l._tabChain === ch, host: ch.tabs[0], pair: ch.split.pair, ratio: ch.split.ratio, active: ch.tabs[ch.active], liveDisplay: disp(l.element), hostGrid: host.element.classList.contains('tab-split'), hostDisp: disp(host.element), visibleWindows: [...wm.windows.values()].filter((w) => disp(w.element) !== 'none').length, chatRect: rect(c.content), liveRect: rect(l.content), hostRect: rect(host.element), divider: !!host.element.querySelector(':scope > .tab-split-divider'), chatHidden: c.content.classList.contains('tab-hidden'), liveHidden: l.content.classList.contains('tab-hidden') };`);
  ok(s1.sameChain && s1.host === chatId && s1.pair[0] === chatId && s1.pair[1] === liveId && s1.active === liveId, 'ONE chain: the chat is the host + the anchor, the pair is [chat, live], the bound pane is the focused one', JSON.stringify(s1).slice(0, 300));
  ok(s1.liveDisplay === 'none' && s1.hostGrid && s1.hostDisp === 'grid' && s1.visibleWindows === 1 && s1.divider, 'ONE visible window: the guest element is hidden, the host renders as the split grid with a divider');
  const sideBySide = s1.chatRect.width > 100 && s1.liveRect.width > 100 && Math.abs(s1.chatRect.top - s1.liveRect.top) < 2 && s1.chatRect.right <= s1.liveRect.left + 1 && s1.liveRect.left - s1.chatRect.right <= 8 && Math.abs((s1.chatRect.width + s1.liveRect.width) - s1.hostRect.width) < 12;
  ok(sideBySide && !s1.chatHidden && !s1.liveHidden, `two panes side by side inside the host: chat ${Math.round(s1.chatRect.width)}px | live ${Math.round(s1.liveRect.width)}px of ${Math.round(s1.hostRect.width)}px, same top, no overlap`, JSON.stringify([s1.chatRect, s1.liveRect, s1.hostRect]));
  ok(Math.abs(s1.ratio - 0.5) < 0.001 && Math.abs(s1.chatRect.width - s1.liveRect.width) < 10, 'the default ratio is 0.5 and the panes measure equal');
  const drawn = await until(() => ev(A, 'const l = live(); return !!(l && l._browserLive && l._browserLive.state().frames >= 1 && l._browserLive.img().naturalWidth === 1280);'), 15000);
  ok(drawn, 'frames are DRAWN in the bound pane (the fake upstream through the bridge)');
  // the ownership badge on the browser TAB, in the session's own colour
  const wantColor = C.ownerColor(sessionId);
  // Chrome serializes an hsl() background as rgb(): compare COMPUTED colours (a probe element painted with the expected colour)
  const badge = await ev(A, `const c = chat(); const host = wm.windows.get(c._tabChain.tabs[0]); const tab = host.titleBar.querySelector('.tab-item[data-win-id="' + live().id + '"]'); const b = tab && tab.querySelector('.win-owner-badge'); const dots = b ? [...b.querySelectorAll('.win-owner-dot')].map((d) => getComputedStyle(d).backgroundColor) : []; const p = document.createElement('i'); p.style.background = ${JSON.stringify(wantColor)}; document.body.appendChild(p); const want = getComputedStyle(p).backgroundColor; p.remove(); const row = (app.sidebar._allSessions || []).find((x) => x.webuiId === ${JSON.stringify(sessionId)}); return { tab: !!tab, member: !!(tab && tab.classList.contains('split-member')), dots, want, title: b ? b.title : '', owners: live()._browserLive.state().owners, rowName: row ? (row.webuiName || row.name || '') : '' };`);
  ok(badge.tab && badge.member && badge.dots.length === 1 && badge.dots[0] === badge.want && badge.owners.length === 1 && badge.owners[0].sessionId === sessionId, `the browser tab carries the OWNERSHIP badge in the session's own colour (${wantColor} = ${badge.want}) and is marked a split member`, JSON.stringify(badge));
  ok(badge.rowName && badge.title === badge.rowName, `the badge names the owner by the sidebar row's own name (${JSON.stringify(badge.title)})`);
  // the bar's Unbind / Snap beside round trip
  const ub = await ev(A, `const l = live(); const btn = l._browserLive.el().querySelector('.browser-live-bind'); const before = btn.textContent; btn.click(); const ch = l._tabChain; return { before, after: btn.textContent, layout: ch.layout, tabs: ch.tabs.length, split: 'split' in ch, hostGrid: wm.windows.get(ch.tabs[0]).element.classList.contains('tab-split'), divider: !!wm.windows.get(ch.tabs[0]).element.querySelector(':scope > .tab-split-divider'), chatHidden: chat().content.classList.contains('tab-hidden'), liveHidden: l.content.classList.contains('tab-hidden') };`);
  ok(ub.before === 'Unbind' && ub.layout === 'tabs' && ub.tabs === 2 && !ub.split && !ub.hostGrid && !ub.divider && ub.chatHidden && !ub.liveHidden && /Snap beside/.test(ub.after), 'Unbind ⇒ back to tabs in the SAME chain (two tabs, the live one active, no grid, no divider); the button now offers "Snap beside"', JSON.stringify(ub));
  const rb = await ev(A, `const l = live(); l._browserLive.el().querySelector('.browser-live-bind').click(); const ch = l._tabChain; return { layout: ch.layout, pair: ch.split && ch.split.pair, text: l._browserLive.el().querySelector('.browser-live-bind').textContent, titleBtn: !!l.titleBar.querySelector('.win-bind') };`);
  ok(rb.layout === 'split' && rb.pair && rb.pair[0] === chatId && rb.pair[1] === liveId && rb.text === 'Unbind' && rb.titleBtn, 'Snap beside ⇒ split again [chat, live]; the title bar carries its own bind button', JSON.stringify(rb));

  // ── ② the divider under a NON-1 UI scale ──
  console.log('— ② the divider drag under body zoom 1.25 lands where the pointer is');
  {
    await ev(A, "document.documentElement.style.setProperty('--ui-scale', '1.25'); document.body.style.zoom = '1.25'; return true;");
    await sleep(100);
    const g = await ev(A, `const host = wm.windows.get(chat()._tabChain.tabs[0]); const d = host.element.querySelector(':scope > .tab-split-divider'); return { d: rect(d), h: rect(host.element) };`);
    const x0 = g.d.left + g.d.width / 2, y0 = g.d.top + g.d.height / 2;
    const xTarget = g.h.left + 0.3 * g.h.width;
    await A.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
    await A.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 6; i++) { await A.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (xTarget - x0) * (i / 6), y: y0, button: 'left' }); await sleep(30); }
    await A.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: xTarget, y: y0, button: 'left', clickCount: 1 });
    await sleep(150);
    const after = await ev(A, `const c = chat(); const host = wm.windows.get(c._tabChain.tabs[0]); const d = host.element.querySelector(':scope > .tab-split-divider'); return { ratio: c._tabChain.split.ratio, d: rect(d), h: rect(host.element), chatW: rect(c.content).width, liveW: rect(live().content).width, resizing: host.element.classList.contains('split-resizing') };`);
    const centre = after.d.left + after.d.width / 2;
    ok(Math.abs(after.ratio - 0.3) < 0.02, `the ratio landed at ${after.ratio.toFixed(3)} (pointer at 30 % of the host)`);
    ok(Math.abs(centre - xTarget) <= 4, `the divider's centre (${centre.toFixed(1)} viewport px) is within 4 px of the pointer (${xTarget.toFixed(1)}) under zoom 1.25`);
    ok(after.chatW < after.liveW && Math.abs(after.chatW / (after.chatW + after.liveW) - 0.3) < 0.03 && !after.resizing, `the panes follow: chat ${Math.round(after.chatW)} | live ${Math.round(after.liveW)}; the drag's controller released`);
    // persisted through captureState (the autosave path) — the ratio rides the chain record
    const cap = await ev(A, `const st = app.layoutManager.captureState(); const w = st.windows.find((x) => x.winId === chat().id); return w && w.tabChain;`);
    ok(cap && cap.layout === 'split' && cap.split && Math.abs(cap.split.ratio - 0.3) < 0.02 && cap.split.pair[0] === chatId, 'captureState carries layout: split + the pair + the dragged ratio', JSON.stringify(cap));
    const dbl = await ev(A, `const host = wm.windows.get(chat()._tabChain.tabs[0]); const d = host.element.querySelector(':scope > .tab-split-divider'); d.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return chat()._tabChain.split.ratio;`);
    ok(dbl === 0.5, 'double-clicking the divider evens the panes out (ratio 0.5)');
    const g0 = await ev(A, `const r = rect(wm.windows.get(chat()._tabChain.tabs[0]).element); return [r.left, r.top, r.width, r.height].map(Math.round).join(',');`);
    await ev(A, "document.body.style.zoom = ''; document.documentElement.style.removeProperty('--ui-scale'); return true;");
    // the reset resizes the workspace; the captureState above recorded gridBounds UNDER the zoom, so the reflow
    // rescales the host — ③ probes and presses on geometry, so it starts only once that reflow has landed
    const st = await settledGeometry(A);
    ok(st.ok, `the zoom reset SETTLED before ③ (workspace ${st.workspace}; host ${g0} → ${st.rect} after the ResizeObserver's reflow; ${st.samples} samples, ${st.ms} ms)`, JSON.stringify(st));
  }

  // ── ③ move / minimise / desktop switch keep them together ──
  console.log('— ③ move, minimise / restore and a desktop switch keep the two panes together');
  {
    const before = await ev(A, `const c = chat(); const host = wm.windows.get(c._tabChain.tabs[0]); const tb = host.titleBar; const r = rect(tb); const tabs = [...tb.querySelectorAll('.tab-item')]; const last = tabs[tabs.length - 1]; const lr = rect(last); const probe = document.elementFromPoint(lr.right + 30, r.top + r.height / 2); return { tb: r, lastTab: lr, probeIsTab: !!(probe && probe.closest('.tab-item')), probeInBar: !!(probe && probe.closest('.window-titlebar') === tb), chat: rect(c.content), live: rect(live().content), h: rect(host.element) };`);
    // a REAL title-bar drag (Alt held ⇒ no snap) on the EMPTY tab-bar area past the last tab — a press ON a tab is the
    // tab drag-out (the designed "drag either pane out"), which is a different path — landing on empty workspace
    ok(before.probeInBar && !before.probeIsTab, 'the press point is on the title bar, outside every tab (a tab press would be the drag-out path)');
    const sx = before.lastTab.right + 30, sy = before.tb.top + before.tb.height / 2;
    // WHERE THE PRESS LANDED, recorded by the page (capture phase, before any handler): a drag that "did not move"
    // is first a press that never reached the title bar — say so by name instead of printing a small delta
    await ev(A, `const host = wm.windows.get(chat()._tabChain.tabs[0]); window.__press = null; document.addEventListener('mousedown', (e) => { const t = e.target; const r = rect(host.element); window.__press = { x: e.clientX, y: e.clientY, onBar: !!(t && t.closest && t.closest('.window-titlebar') === host.titleBar), onTab: !!(t && t.closest && t.closest('.tab-item')), target: t ? (t.tagName.toLowerCase() + (typeof t.className === 'string' && t.className ? '.' + t.className.split(/\\s+/).slice(0, 2).join('.') : '')) : null, host: [r.left, r.top, r.width, r.height].map(Math.round).join(',') }; }, { capture: true, once: true }); return true;`);
    await A.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy });
    await A.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) { await A.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx + 15 * i, y: sy + 8 * i, button: 'left' }); await sleep(25); }
    await A.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: sx + 120, y: sy + 64, button: 'left', clickCount: 1 });
    await sleep(450);
    const moved = await ev(A, `const c = chat(); const host = wm.windows.get(c._tabChain.tabs[0]); return { chat: rect(c.content), live: rect(live().content), h: rect(host.element), layout: c._tabChain.layout, sameChain: live()._tabChain === c._tabChain, snapped: !!host._isSnapped, maximized: !!host.isMaximized, grid: !!wm.grid, styleW: host.element.style.width, styleH: host.element.style.height, gridBounds: host.gridBounds, snapSetting: app.settings.get('layout.enableDragSnap') };`);
    const dx = moved.h.left - before.h.left, dy = moved.h.top - before.h.top;
    const press = await ev(A, 'return window.__press;');
    ok(press && press.onBar && !press.onTab, `the press reached the host's title bar outside every tab (${press ? press.target + ' at ' + press.x + ',' + press.y + ', host ' + press.host : 'no mousedown seen'})`, JSON.stringify({ press, hostBefore: before.h }));
    ok(dx > 60 && dy > 30, `a real title-bar drag moved the host by (${Math.round(dx)}, ${Math.round(dy)})`, JSON.stringify({ press, hBefore: before.h, hAfter: moved.h }));
    // one window: the panes are INSIDE the host wherever it went (a workspace reflow may rescale a gridBounds-tracked window — both panes with it)
    const inside = Math.abs(moved.chat.left - moved.h.left) <= 2 && Math.abs(moved.live.right - moved.h.right) <= 2 && Math.abs(moved.chat.top - moved.live.top) < 2 && moved.chat.width > 100 && moved.live.width > 100 && Math.abs(moved.chat.width - moved.live.width) < 10;
    ok(inside && moved.layout === 'split' && moved.sameChain && !moved.snapped && !moved.maximized, 'both panes travelled with the host — side by side inside it, equal at 0.5, the split intact, no snap (no drop-zone code exists — split UX R1: a drag never splits)', JSON.stringify({ dx, dy, hBefore: before.h, hAfter: moved.h, chatAfter: moved.chat, liveAfter: moved.live, snapped: moved.snapped, maximized: moved.maximized, grid: moved.grid, gridBounds: moved.gridBounds }));
    const min = await ev(A, `wm.minimize(live().id); const c = chat(); const host = wm.windows.get(c._tabChain.tabs[0]); return { hostMin: host.isMinimized, hostDisp: disp(host.element), layout: c._tabChain.layout };`);
    ok(min.hostMin && min.hostDisp === 'none' && min.layout === 'split', 'minimising the browser pane minimises the ONE window (both panes gone), the split kept');
    const res = await ev(A, `wm.restore(live().id); const c = chat(); const host = wm.windows.get(c._tabChain.tabs[0]); return { hostMin: host.isMinimized, hostDisp: disp(host.element), grid: host.element.classList.contains('tab-split'), chatW: rect(c.content).width, liveW: rect(live().content).width };`);
    ok(!res.hostMin && res.hostDisp === 'grid' && res.grid && res.chatW > 100 && res.liveW > 100, 'restore brings both panes back side by side');
    const homeId = await ev(A, 'return app.desktopManager ? app.desktopManager.activeDesktopId : null;');
    const twoId = await ev(A, `const dm = app.desktopManager; if (!dm) return null; const d = dm.createDesktop('two'); return d && (d.id || d);`);
    if (!homeId || !twoId) skip('no desktop manager on this client — the desktop-switch leg');
    else {
      const settled = (X, target, wantHidden) => until(() => X.evaluate(`(() => { const dm = window.app.desktopManager, wm = window.app.wm; const c = [...wm.windows.values()].find((w) => w.type === 'chat'); const host = c && c._tabChain && wm.windows.get(c._tabChain.tabs[0]); return dm.activeDesktopId === ${JSON.stringify(target)} && !dm._restoring && !!host && !!host._hiddenByDesktop === ${wantHidden}; })()`), 8000, 100);
      await A.evaluate(`window.app.desktopManager.switchTo(${JSON.stringify(twoId)})`);
      ok(await settled(A, twoId, true), 'the switch to the other desktop settled (active, not restoring, the host hidden by the desktop)');
      const away = await A.evaluate(`(async () => { const dm = window.app.desktopManager; const wm = window.app.wm; const c = [...wm.windows.values()].find((w) => w.type === 'chat'); const l = [...wm.windows.values()].find((w) => w.type === 'browser-live'); const host = c && wm.windows.get(c._tabChain.tabs[0]); const disp = (el) => getComputedStyle(el).display; return { active: dm.activeDesktopId, chatThere: !!c, liveThere: !!l, hostHidden: host ? (host._hiddenByDesktop || disp(host.element) === 'none' || getComputedStyle(host.element).visibility === 'hidden') : null, liveHidden: l ? (l._hiddenByDesktop || disp(l.element) === 'none') : null, sameDesk: c && l ? c._desktopId === l._desktopId : null, desk: c && c._desktopId }; })()`);
      ok(away.active === twoId && away.chatThere && away.liveThere && away.hostHidden && away.liveHidden && away.sameDesk && away.desk === homeId, 'switching to another desktop hides the ONE window (both panes), and both members carry the same (home) desktop', JSON.stringify(away));
      await A.evaluate(`window.app.desktopManager.switchTo(${JSON.stringify(homeId)})`);
      ok(await settled(A, homeId, false), 'the switch back to the home desktop settled (active, not restoring, the host shown again)');
      const back = await A.evaluate(`(async () => { const dm = window.app.desktopManager; const wm = window.app.wm; const c = [...wm.windows.values()].find((w) => w.type === 'chat'); const l = [...wm.windows.values()].find((w) => w.type === 'browser-live'); const host = wm.windows.get(c._tabChain.tabs[0]); const rect = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }; return { active: dm.activeDesktopId, hidden: !!host._hiddenByDesktop, vis: getComputedStyle(host.element).visibility, layout: c._tabChain.layout, sameChain: l._tabChain === c._tabChain, grid: host.element.classList.contains('tab-split'), chat: rect(c.content), live: rect(l.content), hostDisp: getComputedStyle(host.element).display }; })()`);
      ok(back.active === homeId && !back.hidden && back.vis === 'visible' && back.layout === 'split' && back.sameChain && back.grid && back.hostDisp === 'grid' && back.chat.width > 100 && back.live.width > 100 && Math.abs(back.chat.top - back.live.top) < 2, 'switching back to the home desktop shows both panes side by side again (visible, not hidden by a desktop), still one split chain', JSON.stringify(back));
    }
  }

  // ── ④ the collapse that moves nothing; the three-tab case ──
  console.log('— ④ closing the browser pane collapses to tabs without moving the chat window; the three-tab chain');
  {
    await ev(A, `window.__opens = []; const orig = wm.createWindow.bind(wm); wm.createWindow = (o) => { if (o && o.type === 'browser-live') window.__opens.push({ syncId: o.syncId || null, intoChain: o.intoChain || null, at: Date.now(), stack: String(new Error().stack).split('\\n').slice(1, 7).join(' | ') }); return orig(o); }; return true;`);
    const before = await ev(A, `const c = chat(); return { h: rect(wm.windows.get(c._tabChain.tabs[0]).element), zi: wm.windows.get(c._tabChain.tabs[0]).element.style.zIndex };`);
    const closed = await ev(A, `wm.closeWindow(live().id); const c = chat(); return { live: !!live(), chain: c._tabChain, grid: c.element.classList.contains('tab-split'), divider: !!c.element.querySelector(':scope > .tab-split-divider'), h: rect(c.element), disp: disp(c.element), contentDisp: disp(c.content), tabBar: !!c.titleBar.querySelector('.tab-bar-tabs'), paneMarks: c.content.classList.contains('tab-split-pane') };`);
    ok(!closed.live && closed.chain === null && !closed.grid && !closed.divider && !closed.tabBar && !closed.paneMarks && closed.disp === 'flex' && closed.contentDisp === 'flex', 'closing the browser pane leaves the chat a free window (no chain, no grid, no divider, no marks; flex again)', JSON.stringify(closed).slice(0, 300));
    ok(Math.abs(closed.h.left - before.h.left) < 1 && Math.abs(closed.h.top - before.h.top) < 1 && Math.abs(closed.h.width - before.h.width) < 1 && Math.abs(closed.h.height - before.h.height) < 1, `…and the chat window did NOT move (${Math.round(before.h.left)},${Math.round(before.h.top)} ${Math.round(before.h.width)}×${Math.round(before.h.height)} before and after)`);
    // the three-tab chain: chat (host) + live (bound) + a third window
    await A.evaluate(`window.app.openBrowserLive({ sessionId: ${JSON.stringify(sessionId)}, profileId: ${JSON.stringify(work.id)}, intoChain: { hostId: ${JSON.stringify(chatId)}, split: true, side: 'right' } })`);
    const rebound = await until(() => ev(A, "const l = live(); return !!(l && l._tabChain && l._tabChain.layout === 'split');"), 5000);
    ok(rebound, 'openBrowserLive({intoChain}) re-binds a live view straight into the chat\'s chain');
    await sleep(1500);
    const opens = await ev(A, `return { opens: window.__opens, lives: byType('browser-live').map((w) => w.id) };`);
    ok(opens.lives.length === 1 && opens.opens.length === 1, 'exactly ONE browser-live window exists after the close + re-open (no unasked re-creation)', JSON.stringify(opens));
    liveId = await ev(A, 'return live().id;'); // a fresh window, a fresh id
    const third = await ev(A, `const w = app.openBrowser('about:blank'); const c = chat(); wm.addToTabChain(c._tabChain, w); const ch = c._tabChain; return { id: w.id, tabs: ch.tabs.length, pair: ch.split && ch.split.pair, active: ch.tabs[ch.active], layout: ch.layout, chatShown: !c.content.classList.contains('tab-hidden'), liveShown: !live().content.classList.contains('tab-hidden'), thirdShown: !w.content.classList.contains('tab-hidden') };`);
    ok(third.tabs === 3 && third.layout === 'split' && third.pair[0] === chatId && third.pair[1] === third.id && third.active === third.id && third.chatShown && third.thirdShown && !third.liveShown, 'D19 (a): a THIRD tab dropped in replaces the NON-ANCHOR pane — the chat stays put, the split is [chat, third], the live view is a tab', JSON.stringify(third));
    const backToLive = await ev(A, `const c = chat(); const ch = c._tabChain; wm.switchTab(ch, ch.tabs.indexOf(live().id)); return { pair: ch.split.pair, active: ch.tabs[ch.active], liveShown: !live().content.classList.contains('tab-hidden') };`);
    ok(backToLive.pair[1] === liveId && backToLive.active === liveId && backToLive.liveShown, 'clicking the live tab swaps it back into the pane', JSON.stringify(backToLive));
    // close the CHAT — the host — of the three-tab split chain
    const promoted = await ev(A, `const c = chat(); const ch = c._tabChain; const survivors = ch.tabs.filter((id) => id !== c.id); wm.closeWindow(c.id); const l = live(); const chainNow = l._tabChain; const host = chainNow && wm.windows.get(chainNow.tabs[0]); return { chatGone: !chat(), chain: chainNow ? { tabs: chainNow.tabs, layout: chainNow.layout, hasSplit: 'split' in chainNow } : null, survivors, hostGrid: host ? host.element.classList.contains('tab-split') : null, divider: host ? !!host.element.querySelector(':scope > .tab-split-divider') : null, hostDisp: host ? disp(host.element) : null, dangling: chainNow && chainNow.split ? chainNow.split.pair.some((id) => !chainNow.tabs.includes(id)) : false };`);
    ok(promoted.chatGone && promoted.chain && promoted.chain.layout === 'tabs' && !promoted.chain.hasSplit && promoted.chain.tabs.length === 2 && promoted.chain.tabs.join() === promoted.survivors.join() && !promoted.dangling, 'closing the CHAT (the host) of a three-tab split chain ⇒ host promotion, layout tabs, NO dangling id, the other two stay grouped', JSON.stringify(promoted));
    ok(promoted.hostGrid === false && promoted.divider === false && promoted.hostDisp === 'flex', 'the promoted host carries no split marks (no grid, no divider)');
    ok(await ev(A, `return app.sessions.size >= 0 && !!live();`), 'the live window survived as an ordinary tab');
    // put the desktop back for ⑤: the chat window again, bound
    await A.evaluate(`window.app.attachSession(${JSON.stringify(sessionId)}, 'bind-one', ${JSON.stringify(ROOT)}, { mode: 'chat', backend: 'claude' })`);
    await until(() => ev(A, `const c = chat(); return !!(c && app.sessions.get(c.id));`), 15000);
    await ev(A, `const l = live(); if (l._tabChain) wm._detachFromChain(l._tabChain, l.id); wm.bindSplit(chat(), l, { side: 'right' }); return true;`);
    ok(await ev(A, "const c = chat(); return c._tabChain && c._tabChain.layout === 'split' && c._tabChain.split.pair[1] === live().id;"), 'the chat is back, the live view bound beside it (wm.bindSplit)');
  }

  // ── ⑤ persistence + the phone ──
  console.log('— ⑤ layouts.json carries the split; a PHONE renders tabs and never flattens it');
  const layoutsPath = path.join(wt, 'data', 'layouts.json');
  // a client's save lands in desktops[<its active desktop>].autoSave (ws-handler's layout-sync case); the top-level slot is the legacy one
  const deskId = await ev(A, 'return app.desktopManager ? app.desktopManager.activeDesktopId : null;');
  const chainFromDisk = () => { try { const d = JSON.parse(fs.readFileSync(layoutsPath, 'utf8')); const st = (deskId && d.desktops && d.desktops[deskId] && d.desktops[deskId].autoSave) || d.autoSave; const w = ((st && st.windows) || []).find((x) => x.tabChain && !x.isTabGuest); return w ? w.tabChain : null; } catch { } return null; };
  {
    const chatIdNow = await ev(A, 'return chat().id;');
    liveId = await ev(A, 'return live().id;');
    await ev(A, `const lm = app.layoutManager; lm._userDirty = true; lm._lastUserInputAt = Date.now(); lm._lastSentJson = null; return lm._doAutoSave();`);
    // wait for THIS save to land (an older split record from ①–③ is already on disk — the pair must name the current windows)
    const saved = await until(() => { const c = chainFromDisk(); return !!(c && c.layout === 'split' && c.split && c.split.pair[0] === chatIdNow && c.split.pair[1] === liveId); }, 8000);
    const disk = chainFromDisk();
    ok(saved && disk && disk.layout === 'split' && disk.split && disk.split.pair[0] === chatIdNow && disk.split.pair[1] === liveId && typeof disk.split.ratio === 'number', 'data/layouts.json carries the chain with layout: split, the pair and the ratio (through writeLayouts)', JSON.stringify(disk));
    // the phone: a second page, 390×844, iPhone UA, touch
    const created = await A.send('Target.createTarget', { url: 'about:blank' });
    let pt = null; for (let i = 0; i < 40 && !pt; i++) { try { pt = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page' && t.id === created.result.targetId); } catch { } if (!pt) await sleep(150); }
    if (!ok(!!pt, 'a second page target for the phone')) return;
    const P = await client(pt.webSocketDebuggerUrl);
    await P.send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    await P.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await P.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
    await P.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await P.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    if (!ok(await bootOk(P), 'the app booted on the phone page (390×844)')) return;
    if (deskId) await P.evaluate(`(async () => { const dm = window.app.desktopManager; if (dm && dm.activeDesktopId !== ${JSON.stringify(deskId)}) await dm.switchTo(${JSON.stringify(deskId)}); return true; })()`);
    const phoneChain = await until(() => ev(P, "const c = chat(); return !!(c && c._tabChain && c._tabChain.layout === 'split' && live());"), 15000);
    ok(phoneChain, 'the phone restored the chain WITH the split in its model (layouts.json → restoreTabChain)');
    const ph = await ev(P, `const c = chat(); const l = live(); const ch = c._tabChain; const host = wm.windows.get(ch.tabs[0]); const shown = [c, l].filter((w) => disp(w.content) !== 'none').map((w) => w.id); const divider = host.element.querySelector(':scope > .tab-split-divider'); return { layout: ch.layout, pair: ch.split && ch.split.pair, shown, dividerDisp: divider ? disp(divider) : 'absent', hostDisp: disp(host.element), narrow: wm._mobileLayout(), isMobile: app.isMobile, hostW: rect(host.element).width, shownW: shown.length === 1 ? rect(wm.windows.get(shown[0]).content).width : null };`);
    ok(ph.layout === 'split' && ph.pair && ph.pair.length === 2 && ph.isMobile && ph.narrow, 'the phone\'s model says split (narrow layout, isMobile) — nothing flattened', JSON.stringify(ph));
    ok(ph.shown.length === 1 && ph.dividerDisp === 'none' && ph.hostDisp === 'flex' && ph.shownW !== null && Math.abs(ph.shownW - ph.hostW) < 4, `the phone DISPLAYS tabs only: one pane (${ph.shown[0] === liveId ? 'the live view' : 'the chat'}) at the full ${Math.round(ph.hostW)}px, the divider hidden`, JSON.stringify(ph));
    // a real tap somewhere neutral makes the phone "dirty", then it saves
    await P.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 400 }] });
    await P.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(100);
    const dirty = await ev(P, 'return app.layoutManager._userDirty === true;');
    ok(dirty, 'a real tap set the phone\'s user-dirty gate (its save is a user-caused save)');
    const phoneDump = await ev(P, `const lm = app.layoutManager; const dm = app.desktopManager; const st = lm.captureState(); return { restoring: lm._restoring, dmRestoring: dm && dm._restoring, active: dm && dm.activeDesktopId, wanted: ${JSON.stringify(deskId)}, windows: st.windows.map((w) => ({ id: w.winId, type: w.type, tabChain: w.tabChain, guest: !!w.isTabGuest })), wm: [...wm.windows.values()].map((w) => ({ id: w.id, type: w.type, chain: w._tabChain ? { tabs: w._tabChain.tabs, layout: w._tabChain.layout } : null, hiddenByDesk: !!w._hiddenByDesktop, desk: w._desktopId })) };`);
    const savedPhone = await ev(P, `const lm = app.layoutManager; lm._lastSentJson = null; const st = lm.captureState(); const w = st.windows.find((x) => x.tabChain && !x.isTabGuest); return lm._doAutoSave().then(() => w && w.tabChain);`);
    ok(savedPhone && savedPhone.layout === 'split' && savedPhone.split && savedPhone.split.pair[1] === liveId, 'the phone\'s captureState carries the split VERBATIM (a client that cannot display a state still carries it)', JSON.stringify({ savedPhone, phoneDump }));
    await sleep(1200);
    const disk2 = chainFromDisk();
    ok(disk2 && disk2.layout === 'split' && disk2.split && disk2.split.pair[1] === liveId, 'after the phone\'s save, data/layouts.json still says split with the same pair (never flattened)', JSON.stringify(disk2));
    const deskStill = await ev(A, "const c = chat(); return { layout: c._tabChain && c._tabChain.layout, grid: wm.windows.get(c._tabChain.tabs[0]).element.classList.contains('tab-split'), liveW: rect(live().content).width, chatW: rect(c.content).width };");
    ok(deskStill.layout === 'split' && deskStill.grid && deskStill.liveW > 100 && deskStill.chatW > 100, 'the DESKTOP client still shows the two panes after the phone\'s broadcast (the sync key matched, nothing was rebuilt)', JSON.stringify(deskStill));
    // NEGATIVE CONTROL for the sync key: a remote state with the SAME tabs but layout tabs is a different key ⇒ the desktop applies it (the pre-fix key would have ignored it)
    const flipped = await A.evaluate(`(() => { const lm = window.app.layoutManager; const st = lm.captureState(); for (const w of st.windows) if (w.tabChain) { w.tabChain = { tabs: w.tabChain.tabs, active: w.tabChain.active, layout: 'tabs' }; } lm._applyRemoteState(st); const wm = window.app.wm; const c = [...wm.windows.values()].find((w) => w.type === 'chat'); if (!c || !c._tabChain) return { layout: null, why: 'no chain after apply', windows: [...wm.windows.values()].map((w) => ({ id: w.id, type: w.type, chain: !!w._tabChain })), sent: st.windows.map((w) => ({ id: w.winId, tabChain: w.tabChain, guest: !!w.isTabGuest })) }; return { layout: c._tabChain.layout, tabs: c._tabChain.tabs.length, grid: wm.windows.get(c._tabChain.tabs[0]).element.classList.contains('tab-split') }; })()`);
    ok(flipped.layout === 'tabs' && flipped.tabs === 2 && !flipped.grid, 'a remote state with the SAME tabs but layout tabs is applied (the key carries the layout — the pre-fix key read it as unchanged)', JSON.stringify(flipped));
    const reSplit = await A.evaluate(`(() => { const lm = window.app.layoutManager; const wm = window.app.wm; const c = [...wm.windows.values()].find((w) => w.type === 'chat'); const l = [...wm.windows.values()].find((w) => w.type === 'browser-live'); const st = lm.captureState(); for (const w of st.windows) if (w.tabChain) { w.tabChain = { tabs: w.tabChain.tabs, active: w.tabChain.active, layout: 'split', split: { pair: [c.id, l.id], ratio: 0.35, dir: 'row' } }; } lm._applyRemoteState(st); return { layout: c._tabChain && c._tabChain.layout, ratio: c._tabChain && c._tabChain.split && c._tabChain.split.ratio, grid: wm.windows.get(c._tabChain.tabs[0]).element.classList.contains('tab-split') }; })()`);
    ok(reSplit.layout === 'split' && Math.abs(reSplit.ratio - 0.35) < 0.001 && reSplit.grid, 'a remote tabs→split flip with a ratio is applied (0.35)', JSON.stringify(reSplit));
    const ratioOnly = await A.evaluate(`(() => { const lm = window.app.layoutManager; const wm = window.app.wm; const c = [...wm.windows.values()].find((w) => w.type === 'chat'); const chainBefore = c._tabChain; const st = lm.captureState(); for (const w of st.windows) if (w.tabChain && w.tabChain.split) w.tabChain.split.ratio = 0.6; lm._applyRemoteState(st); return { same: c._tabChain === chainBefore, ratio: c._tabChain.split.ratio, cols: wm.windows.get(c._tabChain.tabs[0]).element.style.gridTemplateColumns }; })()`);
    ok(ratioOnly.same && Math.abs(ratioOnly.ratio - 0.6) < 0.001 && /0\.6fr/.test(ratioOnly.cols), 'a remote RATIO-only change is applied IN PLACE (the same chain object, the host columns updated, no rebuild)', JSON.stringify(ratioOnly));
    P.close();
  }

  // ── ⑥ a shared profile: two dots; two profiles: the strip's per-pane dots ──
  console.log('— ⑥ a profile shared by two sessions shows two owner dots; the strip carries per-pane dots');
  if (session2) {
    att = await j('POST', '/api/browser/attach', { sessionId: session2, profile: 'Work' });
    ok(att.status === 200 && att.json.lease, 'the second session attached Work (the profile is now shared)');
    rememberPids();
    const two = await until(() => ev(A, 'const l = live(); return !!(l && l._browserLive.state().owners.length === 2);'), 10000);
    const dots = await ev(A, `const l = live(); const c = chat(); const host = wm.windows.get(c._tabChain.tabs[0]); const tab = host.titleBar.querySelector('.tab-item[data-win-id="' + l.id + '"]'); const b = tab && tab.querySelector('.win-owner-badge'); return { owners: l._browserLive.state().owners.map((o) => o.sessionId), dots: b ? b.querySelectorAll('.win-owner-dot').length : 0, title: b ? b.title : '' };`);
    ok(two && dots.owners[0] === sessionId && dots.owners[1] === session2 && dots.dots === 2 && dots.title.split('\n').length === 2, 'the badge grew to TWO dots — the viewer first, the other owner second, names one per line', JSON.stringify(dots));
    ok(await ev(A, "return !live()._tabChain.split || live()._tabChain.layout === 'split';"), 'the binding is untouched by the badge change');
    // a second profile on the first session ⇒ the strip with per-pane owner dots
    att = await j('POST', '/api/browser/attach', { sessionId, profile: 'Personal' });
    ok(att.status === 200 && att.json.attachments && att.json.attachments.length === 2, 'the first session attached Personal too (two attachments)');
    rememberPids();
    const strip = await until(() => ev(A, "const l = live(); return l._browserLive.el().querySelectorAll('.browser-live-strip-tab').length === 2;"), 10000);
    const st = await ev(A, `const tabs = [...live()._browserLive.el().querySelectorAll('.browser-live-strip-tab')]; return tabs.map((t) => ({ label: t.textContent.trim().slice(0, 12), dots: t.querySelectorAll('.browser-live-strip-owners .win-owner-dot').length }));`);
    ok(strip && st.length === 2 && st.find((x) => /^Work/.test(x.label))?.dots === 2 && st.find((x) => /^Personal/.test(x.label))?.dots === 1, 'the strip has two tabs, each with ITS profile\'s owner dots: Work = 2 (shared), Personal = 1', JSON.stringify(st));
    ok(await ev(A, "return [...wm.windows.values()].filter((w) => w.type === 'browser-live').length === 1;"), 'a second profile grew the strip, not a second window (D24)');
  } else skip('no second session — the shared-profile leg');

  A.close();
  try { chrome.kill('SIGKILL'); } catch { }
  await j('POST', `/api/browser/profiles/${work.id}/stop`); await j('POST', `/api/browser/profiles/${pers.id}/stop`);
  // the suite ends what it started: the two fake-claude sessions live under dtach and would outlive the server
  for (const sid of [sessionId, session2].filter(Boolean)) wsMain.send(JSON.stringify({ type: 'kill', sessionId: sid }));
  await until(() => [sessionId, session2].filter(Boolean).every((sid) => msgs.some((m) => (m.type === 'killed' || m.type === 'exited') && m.sessionId === sid)), 8000);
  try { wsMain.close(); } catch { }
  await upA.close(); await upB.close();
  srv.kill('SIGKILL');
})().catch((e) => ok(false, 'the chrome leg threw', e && (e.stack || e.message)));

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
