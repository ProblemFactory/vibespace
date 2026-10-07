#!/usr/bin/env node
// A RELEASE OVER A PANE THE PAGE CANNOT HEAR — lane-drag-release (userW's inc-muq7uk0f-e59s, 2026-10-01 17:19 PDT;
// the owner: "他拖动了一个PDF viewer到一个上面有着桌面/浏览器的cell里松手，但这个PDF viewer没有成功fit到这个cell里，
// 而是highlight不消失并且这个viewer停留在原地。另外他resize这个PDF viewer窗口的时候，有时候松手后resize handle不会
// 消失，鼠标移动回来后又继续发生resize行为").
// THE CLASS: the title-bar drag and the resize ENDED on a document-level `mouseup`. A release hit-tested on another
// window's iframe never reaches this document (the embedded page gets it); noVNC's canvas STOPS its `mouseup`
// (stopPropagation + preventDefault) — so the drag stayed ARMED: the snap highlight stayed, the window stayed where it
// was, and the next pointer move dragged / resized on. The .199 rule `.window.dragging .window-content
// {pointer-events:none}` shields the DRAGGED window's own content only, never the target's. A fast drop releases where
// the dragged window has not been drawn yet (its follow is rAF-coalesced): the release lands below the title bar, in
// the pane under it — that is the gesture this suite makes. A resize's handle is 12 px: a pane raised above the
// resized window covers it, and the release lands in the pane.
// THE FIX (lane-drag-release): POINTER CAPTURE at every drag's door — the title bar / the resize handle call
// setPointerCapture at pointerdown and the drag is fed from THAT element (capture delivers the release whatever is
// under the cursor), ONE end door per drag (PURE src/lib/drag-end.js names what ends one: pointerup / pointercancel /
// lostpointercapture / window blur / the page hidden / a move with no button held), and THE DRAG SHIELD
// (`body.wm-dragging` ⇒ every window's content is pointer-events:none while a drag or a resize is in flight).
// HEAVY: headless chrome at 1600×900 on a worktree server under /tmp/vs-drj-<pid> (its own data/, never the
// checkout's), real CDP input. Four pane kinds, each in a cell of a 2×3 grid: a Web view (an iframe), the Desktop
// (noVNC on a real Xtigervnc — SKIPs without one), an Agent browser live window (a fake agent-browser + a fake stream
// upstream + a fake claude session under dtach — SKIPs without dtach), an xpra app window (the REAL xpra rung: xpra +
// Xvfb + xterm — SKIPs without them). Per pane:
//   D  the viewer (a picture file, userW's window type) DROPPED onto the pane's cell: the drop is applied — the viewer
//      fits that cell exactly (the box of an empty-cell drop; it lands ABOVE the pane's window, the stacking rule) —
//      the highlight is gone, `.dragging` is gone, the shield is off, and a further pointer move with no button held
//      moves nothing (the drag is not armed);
//   R  a resize of the viewer's SE corner RELEASED over the pane (the pane's window raised above the viewer): the
//      resize is over (`_resizeOp` null, the shield off), a further move with no button held resizes nothing;
//   P  D5 — userW's second capture (inc-muq7wwfq-rruz, uiScale 90 % × DPR 2.2): a PDF viewer window (its page is an
//      IFRAME to /api/file/raw) 1000×700, its SE corner dragged INWARD over its own page and released there ⇒ it
//      shrinks to the window floor 320×180 (layout px; the opposite edges unmoved) and the resize is over — before,
//      every move over the viewer's own frame was lost ("能放大，不能缩小") and the release with it;
//   T  verify r1 (finding #1) — THE TORN-OFF TAB (tab-group.js _setupTabDrag): a second viewer merged into the viewer's
//      group, its tab pulled out (the tear-off) and RELEASED over each pane ⇒ ended, it fits the pane's cell; before,
//      the tab drag ended on the document's mouseup — armed with its highlight on;
//   I  verify r1 (finding #1) — THE ICON DRAG (tab-group.js _setupIconDrag): the second viewer's icon dragged to each
//      pane and released there ⇒ ended, the window visible again, no ghost; before, the source window stayed
//      INVISIBLE (visibility:hidden) with its ghost on screen;
//   C2 verify r1 CONTROL of the capture-element choice: a tab-group copy that captures on the TAB element (not the
//      strip's title bar) — the tear-off's re-render rebuilds the tab, the capture is lost under the finger and the
//      drag ENDS at the detach (capture-lost), the window never reaches the pane's cell;
//   C  CONTROL — the pre-fix feed as ONE patched overlay of today's sources, the same on every machine (lane
//      mirror-green r2: the git-history control and the depth-1 fallback it replaced went red on the Actions mirror
//      alone): drag-feed.js with no capture, the document's mouse events and no shield, window.js / tab-group.js with
//      no no-button rule — every patch must find its line — bundled by an esbuild alias and served in place of
//      /bundle.js through CDP Fetch — the checkout untouched — reproduces the incident on the Web view, the Desktop and
//      the PDF viewer's own frame (the live view and the xpra pane as measured, printed: neither stops a mouse
//      release), and the T / I incidents (the torn-off tab stays armed, the icon drag's window stays invisible).
// Run: node scripts/test-window-drag-ui.mjs   (DRJ_ONLY=D,R,T,I,P,C narrows the legs; the whole suite is the gate)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePorts, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, deadPort } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const DEAD_CDP = await deadPort(); // the fake's cdp-url: a port the kernel just released, never a fixed one (§81)
const VNC_ENV = await vncEnv(); // never the machine-global :7/5901 (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1400) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await pred(); if (v) return v; } catch { } await sleep(every); } try { return await pred(); } catch { return null; } };
const J = JSON.stringify;
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ONLY = (process.env.DRJ_ONLY || '').split(',').filter(Boolean);
const want = (id) => !ONLY.length || ONLY.includes(id);
const bin = (n) => { try { return execFileSync('/usr/bin/which', [n], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null; } catch { return null; } };
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const DTACH = bin('dtach'), XVNC = bin('Xtigervnc') || bin('Xvnc'), XPRA = bin('xpra'), XAUTH = bin('xauth'), XVFB = bin('Xvfb'), XTERM = bin('xterm');
const FIX = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/fixtures/browser-stream/session-0.32.0.json'), 'utf8'));
const FRAME = FIX.server_to_client.frame;
const URL0 = 'https://www.larksuite.com/en_sg/';

const ROOT = scratch('drj');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const MUT = mutantCopies('drj', repo);
const procs = new Set(); const worktrees = new Set(); let fakeHome = null, wt = null, srv = null;
const environHas = (pid, needle) => { try { return fs.readFileSync(`/proc/${pid}/environ`, 'latin1').includes(needle); } catch { return false; } };
const appIds = () => { try { return Object.keys(JSON.parse(fs.readFileSync(path.join(wt, 'data/desktop-apps.json'), 'utf8')).apps || {}); } catch { return []; } };
function cleanup() {
  // the server first, gently: it stops the Xtigervnc it spawned at SIGTERM
  if (srv) { try { srv.kill('SIGTERM'); } catch { } }
  const t0 = Date.now(); while (srv && srv.exitCode === null && Date.now() - t0 < 1500) { try { execFileSync('sleep', ['0.1']); } catch { } }
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  // the xpra app (xpra + its Xvfb + xterm): by evidence — the record's session marker in the environ
  const ids = wt ? appIds() : [];
  if (ids.length) for (const d of fs.readdirSync('/proc')) { if (/^\d+$/.test(d) && Number(d) !== process.pid && ids.some((id) => environHas(Number(d), `VIBESPACE_DESKTOP_APP=${id}`))) { try { process.kill(Number(d), 'SIGKILL'); } catch { } } }
  try { endRootedProcesses(ROOT); } catch { } // the dtach session + wrapper + fake claude, the fake agent-browser's sleep
  if (fakeHome) { try { endRootedProcesses(fakeHome); } catch { } }
  for (const w of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', w], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

/** The fake upstream stream server (the real 0.32.0 shapes), frames at 2 fps — the live view's picture. */
async function fakeUpstream({ fps = 2 } = {}) {
  const port = await freePort();
  const clients = new Set();
  const wss = new WebSocketServer({ port, host: '127.0.0.1' });
  await new Promise((r) => wss.on('listening', r));
  const tabsMsg = () => J({ type: 'tabs', timestamp: Date.now(), tabs: [{ tabId: 't1', title: 'Lark — Sign in', url: URL0, active: true, canClose: false }] });
  const frameMsg = () => J({ ...FRAME, metadata: { ...FRAME.metadata, timestamp: Date.now() } });
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(J(FIX.server_to_client.status)); ws.send(tabsMsg());
    ws.send(J({ type: 'url', url: URL0, timestamp: Date.now() }));
    ws.on('close', () => clients.delete(ws));
  });
  const timer = setInterval(() => { for (const c of clients) if (c.readyState === 1) c.send(frameMsg()); }, 1000 / fps);
  return { port, close() { clearInterval(timer); for (const c of clients) { try { c.terminate(); } catch { } } return new Promise((r) => wss.close(() => r())); } };
}

/** A one-page PDF (userW's window: the viewer renders it in an iframe — the frame is the point, not the page). */
function minimalPdf() {
  const objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
// a 2×2 PNG (the viewer window: userW's was a PDF viewer — the same `viewer` window type)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQImWP4z8DwHwyBNCMDAwMDAwAlJwP9RiPRSQAAAABJRU5ErkJggg==', 'base64');

if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else await (async () => {
  fakeHome = scratchHome('drj-home', fs);
  wt = path.join(ROOT, 'wt');
  const [PORT, CDP] = await freePorts(2);
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  // the page legs judge THIS source, never the bundle that happened to be on disk (the desktop-move precedent)
  fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version)};\n`);
  const ESBUILD = path.join(repo, 'node_modules', '.bin', 'esbuild');
  execFileSync(ESBUILD, ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify'], { cwd: wt, stdio: 'pipe' });
  if (!fs.existsSync(path.join(wt, 'public/novnc.js'))) execFileSync(ESBUILD, ['node_modules/@novnc/novnc/core/rfb.js', '--bundle', '--outfile=public/novnc.js', '--format=esm', '--platform=browser', '--target=es2022', '--minify'], { cwd: wt, stdio: 'pipe' });
  fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
  const pngPath = path.join(ROOT, 'drj.png'); fs.writeFileSync(pngPath, PNG);
  const pdfPath = path.join(ROOT, 'drj.pdf'); fs.writeFileSync(pdfPath, minimalPdf());

  // ── fakes on PATH: a fake claude (a live chat session under dtach) and a fake agent-browser naming a fake upstream ──
  const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  const AB_STATE = path.join(ROOT, 'ab-state'); fs.mkdirSync(AB_STATE, { recursive: true });
  const SID = crypto.randomUUID();
  const hookLine = J({ type: 'system', subtype: 'hook_started', session_id: SID, hook_name: 'SessionStart' });
  const initLine = J({ type: 'system', subtype: 'init', session_id: SID, cwd: ROOT, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
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
if (a === 'open') { let s = read(); if (!(s && alive(s.pid))) { const c = spawn('sleep', ['1800'], { detached: true, stdio: 'ignore', cwd: st }); c.unref(); s = { pid: c.pid }; fs.writeFileSync(f, JSON.stringify(s)); } out({ success: true, data: { url: b, title: 'Lark' } }); process.exit(0); }
if (a === 'get' && b === 'cdp-url') { out({ success: true, data: { cdpUrl: 'ws://127.0.0.1:${DEAD_CDP}/devtools/browser/fake-' + ns } }); process.exit(0); }
if (a === 'stream' && b === 'status') { const port = ports[ns] || ports['*'] || null; if (!port) { out({ success: false, data: null, error: 'fake: no stream for ' + ns }); process.exit(1); } out({ success: true, data: { connected: true, enabled: true, port, screencasting: false } }); process.exit(0); }
if (a === 'stream' && b === 'enable') { out({ success: false, data: null, error: 'Streaming is already enabled for this session' }); process.exit(1); }
if (a === 'close' && b === '--all') { const s = read(); if (s && alive(s.pid)) { try { process.kill(s.pid, 'SIGKILL'); } catch { } } try { fs.unlinkSync(f); } catch { } out({ success: true, data: { closed: 1, failed: [], sessions: [] } }); process.exit(0); }
if (a === 'set' && b === 'viewport') { out({ success: true, data: {} }); process.exit(0); }
out({ success: false, error: 'fake agent-browser: unknown verb ' + process.argv.slice(2).join(' ') }); process.exit(1);
`, { mode: 0o755 });
  const up = await fakeUpstream();
  procs.add({ kill: () => up.close() });
  fs.writeFileSync(path.join(AB_STATE, 'ports.json'), J({ '*': up.port }));

  // ── the worktree server ──
  const baseEnv = { ...process.env, PATH: BIN + ':' + (process.env.PATH || '/usr/local/bin:/usr/bin:/bin'), CLAUDE_CMD: path.join(BIN, 'claude'), FAKE_AB_STATE: AB_STATE };
  for (const k of Object.keys(baseEnv)) if (k.startsWith('AGENT_BROWSER_')) delete baseEnv[k];
  let journal = '';
  srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...baseEnv, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 60000, 200), 'the worktree server booted (own data/ under ' + ROOT + ')', journal.slice(-800))) return;
  const api = async (p, o) => (await fetch(`http://127.0.0.1:${PORT}${p}`, o)).json();
  await api('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: J({ 'browser.autoBindLiveView': false }) });

  // ── a live chat session (the live view's conversation) + its browser, opened the owner's way ──
  let S1 = null;
  if (DTACH) {
    const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { } });
    await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
    procs.add({ kill: () => { try { wsMain.close(); } catch { } } });
    wsMain.send(J({ type: 'create', backend: 'claude', mode: 'chat', cwd: ROOT, cols: 80, rows: 24, reqId: 'r1', sessionName: 'drj' }));
    const c1 = await until(() => msgs.find((m) => m.type === 'created' && m.reqId === 'r1'), 20000);
    if (c1 && c1.sessionId) {
      S1 = c1.sessionId;
      await sleep(1500);
      const sessionEnvOf = (sid) => {
        for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
          let env = ''; try { env = fs.readFileSync(`/proc/${pid}/environ`, 'utf8'); } catch { continue; }
          if (!env.includes('CLAUDE_WEBUI_SESSION_ID=' + sid) || !env.includes('VIBESPACE_SESSION_TOKEN=')) continue;
          return Object.fromEntries(env.split('\0').filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));
        }
        return null;
      };
      const env1 = await until(() => sessionEnvOf(S1), 10000, 250);
      if (env1) {
        const opened = await new Promise((res) => { const c = spawn(process.execPath, [path.join(wt, 'data/bin/vibespace-browser'), 'open', URL0], { env: { ...env1, FAKE_AB_STATE: AB_STATE }, stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; }); const t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } }, 30000); c.on('close', (code) => { clearTimeout(t); res({ code, o }); }); });
        if (opened.code !== 0) { console.log('  (the agent\'s browser open failed — the live leg will SKIP: ' + opened.o.slice(0, 300) + ')'); S1 = null; }
      } else S1 = null;
    }
  }

  // ── headless chrome, ONE page ──
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1', '--disable-background-timer-throttling', `--user-data-dir=${path.join(ROOT, 'chrome')}`, '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' });
  procs.add(chrome);
  let target = null;
  for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
  if (!ok(!!target, 'chrome exposed a CDP page target')) return;
  const cdpWs = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r, e) => { cdpWs.on('open', r); cdpWs.on('error', e); });
  procs.add({ kill: () => { try { cdpWs.close(); } catch { } } });
  let seq = 0; const pend = new Map(); let onPaused = null;
  cdpWs.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; } if (m.method === 'Fetch.requestPaused' && onPaused) onPaused(m.params); });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); cdpWs.send(J({ id, method, params })); });
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
  const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
  /** A press at (x0,y0), moves to (x1,y1), the window given a frame to catch up, then the release — at (x1,y1) or
   *  elsewhere (`releaseAt`: the fast drop's release lands where the title bar has not been drawn yet). */
  const dragTo = async (x0, y0, x1, y1, { releaseAt = null, steps = 16, beforeRelease = null } = {}) => {
    await mouse('mouseMoved', x0, y0, { buttons: 0 }); await mouse('mousePressed', x0, y0); await sleep(60);
    for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await sleep(30); }
    await sleep(150);
    const r = releaseAt || { x: x1, y: y1 };
    if (beforeRelease) await beforeRelease();
    await mouse('mouseReleased', r.x, r.y);
  };
  /** The page at a UI scale (the per-device pref, applied at boot) and a device pixel ratio. */
  const bootAt = async ({ scale = 100, dpr = 1 } = {}) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: dpr, mobile: false });
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.uiScale', ${J(String(scale))}); } catch {}` });
    return boot();
  };
  const boot = async () => {
    await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
    const upOk = await until(async () => { try { return await ev('!!(window.app && window.app.wm && window.app.ready)'); } catch { return false; } }, 30000, 200);
    if (upOk) { await ev('window.app.ready'); await sleep(1500); }
    await ev(`(() => { window.__drj = {
      cellBox: (idx) => { const r = { width: app.wm.workspace.offsetWidth, height: app.wm.workspace.offsetHeight }, g = 4, { rows, cols } = app.wm.grid; const row = Math.floor(idx / cols), col = idx % cols; const cw = (r.width - g * (cols + 1)) / cols, ch = (r.height - g * (rows + 1)) / rows; return { left: g + col * (cw + g), top: g + row * (ch + g), width: cw, height: ch }; },
      box: (id) => { const el = app.wm.windows.get(id).element; return { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight, z: parseInt(el.style.zIndex) || 0 }; },
      state: (id) => { const w = app.wm.windows.get(id); return { dragging: w.element.classList.contains('dragging'), highlight: document.querySelectorAll('.grid-cell.highlight').length, snapInd: getComputedStyle(app.wm.snapIndicator).display, shield: document.body.classList.contains('wm-dragging'), resizeOp: !!w._resizeOp, box: window.__drj.box(id) }; },
      rect: (id, sel) => { const w = app.wm.windows.get(id); const el = sel ? w.content.querySelector(sel) : w.content; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height }; },
      titlePt: (id) => { const r = app.wm.windows.get(id).titleBar.getBoundingClientRect(); return { x: r.left + 70, y: r.top + r.height / 2 }; },
      sePt: (id) => { const r = app.wm.windows.get(id).element.getBoundingClientRect(); return { x: r.right - 6, y: r.bottom - 6 }; }, // 6 px inside: the window's rounded corner (overflow hidden + border-radius) is not hit-testable at 3 px — measured
      place: (id, idx) => { app.wm.focusWindow(id); app.wm.snapActiveToCell(idx); return true; },
      under: (x, y) => { const e = document.elementFromPoint(x, y); return e ? (e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '')) : null; },
      // verify r1 — the tab tear-off and the icon drag (tab-group.js)
      tabPt: (hostId, id) => { const h = app.wm.windows.get(hostId); const t = h && h.titleBar.querySelector('.tab-item[data-win-id="' + id + '"]'); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
      iconPt: (id) => { const w = app.wm.windows.get(id); const el = w && (w.iconWrap || w.iconSpan || w.titleBar.querySelector('.window-icon-stack')); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
      merge: (hostId, guestId) => { const h = app.wm.windows.get(hostId), g = app.wm.windows.get(guestId); if (!h || !g) return false; const r = h.titleBar.getBoundingClientRect(); app.wm._mergeDrop(h, g, { x: r.left + 40, y: r.top + 10, from: app.wm._rectSnap(g) }); return !!(h._tabChain && h._tabChain.tabs.includes(guestId)); },
      tfacts: (id) => { const w = app.wm.windows.get(id); if (!w) return null; const el = w.element; return { dragging: el.classList.contains('dragging'), highlight: document.querySelectorAll('.grid-cell.highlight').length, shield: document.body.classList.contains('wm-dragging'), visibility: el.style.visibility, display: el.style.display, ghosts: document.querySelectorAll('.tab-ghost').length, tabEnd: w._lastTabDragEnd || null, iconEnd: w._lastIconDragEnd || null, box: window.__drj.box(id) }; },
      closeB: (id) => { const b = app.wm.windows.get(id); if (!b) return true; if (b._tabChain) app.wm._detachFromChain(b._tabChain, b.id); b.element.style.visibility = ''; b.element.style.display = ''; app.wm.closeWindow(b.id); return true; },
    }; return true; })()`);
    return upOk;
  };
  const place = async (id, idx) => { await ev(`window.__drj.place(${J(id)}, ${idx})`); await sleep(350); };
  const state = (id) => ev(`window.__drj.state(${J(id)})`);
  const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
  const fits = (box, cell) => near(box.left, cell.left) && near(box.top, cell.top) && near(box.width, cell.width) && near(box.height, cell.height);

  /** The four panes + the viewer on a 2×3 grid: viewer cell 0, web 1, desktop 2, live 4, xpra 5 (cell 3 free — the
   *  neutral spot a hung drag is ended on between legs). Returns the pane rows the legs run over. */
  let xpraId = null;
  const openScene = async () => {
    await ev('app.wm.setGrid(2, 3); true');
    const rows = [];
    // the viewer (userW's window type)
    await ev(`app.openFile(${J(pngPath)}, 'drj.png'); true`);
    const viewer = await until(() => ev(`(() => { const w = [...app.wm.windows.values()].find((w) => w.type === 'viewer'); return w ? w.id : null; })()`), 10000);
    if (!ok(!!viewer, 'the viewer window opened (type viewer)')) return null;
    await place(viewer, 0);
    // the Web view: an iframe — the server's own JSON answer is a document like any other
    const web = await ev(`app.openBrowser(${J(`http://127.0.0.1:${PORT}/api/version`)}).id`);
    await place(web, 1);
    const webReady = await until(() => ev(`(() => { const f = app.wm.windows.get(${J(web)}).content.querySelector('iframe'); return !!(f && f.contentWindow); })()`), 10000);
    if (ok(!!webReady, 'the Web view window holds an iframe')) rows.push({ kind: 'web', id: web, cell: 1, sel: 'iframe' });
    // the Desktop: noVNC on a real Xtigervnc
    if (!XVNC) skip('the Desktop pane: no Xtigervnc/Xvnc on PATH');
    else {
      const desk = await ev('app.openDesktop().id');
      await place(desk, 2);
      const conn = await until(() => ev(`(() => { const w = app.wm.windows.get(${J(desk)}); const c = w.content.querySelector('canvas'); const s = w.content.querySelector('.desktop-status'); return c && c.width > 0 && s && /Connected/.test(s.textContent) ? { w: c.width, h: c.height } : null; })()`), 40000, 300);
      if (ok(!!conn, `the Desktop window is connected (a noVNC canvas ${conn && conn.w}×${conn && conn.h})`, journal.slice(-600))) rows.push({ kind: 'desktop', id: desk, cell: 2, sel: 'canvas' });
    }
    // the Agent browser live window
    if (!S1) skip('the live-view pane: no dtach (or the fake browser did not open)');
    else {
      const live = await ev(`app.openBrowserLive({ sessionId: ${J(S1)} }).id`);
      await place(live, 4);
      const pic = await until(() => ev(`(() => { const w = app.wm.windows.get(${J(live)}); const i = w.content.querySelector('.browser-live-img'); return i && i.naturalWidth > 0 && getComputedStyle(i).display !== 'none' ? { w: i.naturalWidth, h: i.naturalHeight } : null; })()`), 30000, 300);
      if (ok(!!pic, `the live view shows the fake browser's frames (${pic && pic.w}×${pic && pic.h})`)) rows.push({ kind: 'live', id: live, cell: 4, sel: '.browser-live-img' });
    }
    // the xpra app window (the REAL rung)
    if (!(XPRA && XAUTH && XVFB && XTERM)) skip(`the xpra pane: ${!XPRA ? 'xpra' : !XAUTH ? 'xauth' : !XVFB ? 'Xvfb' : 'xterm'} not on PATH`);
    else {
      if (!xpraId) {
        const launch = await api('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ exec: XTERM, args: ['-geometry', '80x24'], label: 'xterm' }) });
        xpraId = launch && launch.id;
        const rec = xpraId ? await until(async () => { const r = await api(`/api/desktop/apps/${xpraId}`); return r && r.state === 'ready' ? r : null; }, 40000, 400) : null;
        if (!rec) { ok(false, 'the xterm launched on the xpra rung and reached ready', launch); xpraId = null; }
      }
      if (xpraId) {
        await ev(`app.openDesktopApp(${J(xpraId)}); true`);
        const xw = await until(() => ev(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${J(xpraId)}); return w ? w.id : null; })()`), 10000);
        if (xw) {
          await place(xw, 5);
          const conn = await until(() => ev(`(() => { const w = app.wm.windows.get(${J(xw)}); const s = w.content.querySelector('.desktop-status'); const p = w.content.querySelector('.xpra-pane'); return p && s && /Connected/.test(s.textContent) && p.querySelector('canvas') ? true : null; })()`), 40000, 300);
          if (ok(!!conn, 'the xpra app window is connected (a pane with a canvas)', journal.slice(-600))) rows.push({ kind: 'xpra', id: xw, cell: 5, sel: '.xpra-pane' });
        } else ok(false, 'the xpra app window opened');
      }
    }
    return { viewer, rows };
  };

  /** The free cell's centre in viewport px — bare workspace, no pane: a move there reaches the document on any tree. */
  const freePt = async () => { const c3 = await ev('window.__drj.cellBox(3)'); const wsr = await ev('(() => { const r = app.wm.workspace.getBoundingClientRect(); return { l: r.left, t: r.top }; })()'); return { x: wsr.l + c3.left + c3.width / 2, y: wsr.t + c3.top + c3.height / 2 }; };
  /** End a drag the page may still hold: a release on the free cell's workspace (the document hears that one), then
   *  the viewer back to cell 0. */
  const settle = async (viewer) => {
    const f = await freePt();
    await mouse('mouseReleased', f.x, f.y);
    await sleep(300);
    await place(viewer, 0);
  };

  /** THE DROP: the viewer's title bar dragged to 60 px below the pane's centre, released AT the centre — userW's fast
   *  upward flick: the window is where the pointer last was (its follow is rAF-coalesced), the release lands ABOVE its
   *  title bar, in the pane. (A release inside the dragged window's own box lands on its `.window` element, which hears
   *  it — measured on the base tree first.) */
  const dropLeg = async (viewer, row, expectFixed, tag) => {
    const facts0 = {};
    const cell = await ev(`window.__drj.cellBox(${row.cell})`);
    const tp = await ev(`window.__drj.titlePt(${J(viewer)})`);
    const pr = await ev(`window.__drj.rect(${J(row.id)}, ${J(row.sel)})`);
    if (!pr) { ok(false, `${tag} ${row.kind}: the pane element is there`); return null; }
    const underPress = await ev(`window.__drj.under(${tp.x}, ${tp.y})`);
    await dragTo(tp.x, tp.y, pr.x, pr.y + 60, { releaseAt: { x: pr.x, y: pr.y }, beforeRelease: async () => { facts0.underRelease = await ev(`window.__drj.under(${pr.x}, ${pr.y})`); } });
    await sleep(450);
    const s1 = await state(viewer);
    const underRelease = facts0.underRelease;
    const f = await freePt(); await mouse('mouseMoved', f.x, f.y, { buttons: 0 }); await sleep(200); // over bare workspace: a hung drag follows it on any tree
    const s2 = await state(viewer);
    const paneZ = (await ev(`window.__drj.box(${J(row.id)})`)).z;
    const armed = s2.box.left !== s1.box.left || s2.box.top !== s1.box.top;
    const ended = !s1.dragging && s1.highlight === 0 && s1.snapInd === 'none' && !s1.shield && !armed;
    const fit = fits(s1.box, cell) && s1.box.z > paneZ;
    const facts = { dragging: s1.dragging, highlight: s1.highlight, snapInd: s1.snapInd, shield: s1.shield, armed, box: s1.box, cell, paneZ, underPress, underRelease };
    if (expectFixed === true) ok(ended && fit, `${tag} ${row.kind}: the drop ENDED (no .dragging, no highlight, shield off, a button-less move moves nothing) and the viewer FITS the pane's cell above it`, facts);
    else if (expectFixed === false) ok(!ended, `${tag} ${row.kind}: CONTROL reproduces the incident — the drag stays armed (${J({ dragging: s1.dragging, highlight: s1.highlight, armed })})`, facts);
    else console.log(`    ${tag} ${row.kind}: not a swallower (the pre-fix tree handled it) — ended=${ended}`);
    console.log(`    ${tag} ${row.kind} drop: ended=${ended} fits=${fits(s1.box, cell)} armed=${armed} highlight=${s1.highlight} under-press=${underPress} under-release=${underRelease}`);
    await settle(viewer);
    return { ended, fit, armed };
  };

  /** THE RESIZE: the pane's window raised above the viewer; the viewer's SE corner dragged to the pane's centre and
   *  released there (the 12 px handle is under the pane). */
  const resizeLeg = async (viewer, row, expectFixed, tag) => {
    await ev(`app.wm.focusWindow(${J(row.id)}); true`); await sleep(150);
    const se = await ev(`window.__drj.sePt(${J(viewer)})`);
    const pr = await ev(`window.__drj.rect(${J(row.id)}, ${J(row.sel)})`);
    if (!pr) { ok(false, `${tag} ${row.kind}: the pane element is there`); return null; }
    const b0 = await ev(`window.__drj.box(${J(viewer)})`);
    const underPress = await ev(`window.__drj.under(${se.x}, ${se.y})`);
    const facts0 = {};
    await dragTo(se.x, se.y, pr.x, pr.y, { beforeRelease: async () => { facts0.underRelease = await ev(`window.__drj.under(${pr.x}, ${pr.y})`); } });
    await sleep(350);
    const s1 = await state(viewer);
    const underRelease = facts0.underRelease;
    const f = await freePt(); await mouse('mouseMoved', f.x, f.y, { buttons: 0 }); await sleep(200); // over bare workspace
    const s2 = await state(viewer);
    const armed = s2.box.width !== s1.box.width || s2.box.height !== s1.box.height;
    const grew = s1.box.width > b0.width + 20;
    const ended = !s1.resizeOp && !s1.shield && !armed;
    const facts = { resizeOp: s1.resizeOp, shield: s1.shield, armed, before: b0, after: s1.box, underPress, underRelease };
    if (expectFixed === true) ok(grew && ended, `${tag} ${row.kind}: the resize released over the pane ENDED (_resizeOp null, shield off, a button-less move resizes nothing)`, facts);
    else if (expectFixed === false) ok(!ended || !grew, `${tag} ${row.kind}: CONTROL reproduces the incident — the resize stays armed or loses its moves (${J({ resizeOp: s1.resizeOp, grew, armed })})`, facts);
    else console.log(`    ${tag} ${row.kind}: not a swallower — grew=${grew} ended=${ended}`);
    console.log(`    ${tag} ${row.kind} resize: grew=${grew} ended=${ended} armed=${armed} under-press=${underPress} under-release=${underRelease}`);
    await settle(viewer);
    return { ended, armed };
  };

  /** D5: a PDF viewer 1000×700 (layout px) at the page's UI scale; its SE corner dragged INWARD by more than the
   *  window's size less the floor (viewport px = layout px × the scale) and released over its own page. */
  const pdfLeg = async (expectFixed, tag) => {
    const scale = await ev('(() => { const z = parseFloat(document.body.style.zoom); return Number.isFinite(z) && z > 0 ? z : 1; })()');
    await ev(`app.openFile(${J(pdfPath)}, 'drj.pdf'); true`);
    const id = await until(() => ev(`(() => { const w = [...app.wm.windows.values()].find((w) => w.type === 'viewer' && /drj\.pdf/.test(w.title)); return w ? w.id : null; })()`), 10000);
    if (!ok(!!id, `${tag} pdf: the PDF viewer window opened`)) return null;
    const frame = await until(() => ev(`(() => { const w = app.wm.windows.get(${J(id)}); const f = w.content.querySelector('iframe'); return f ? f.className : null; })()`), 10000);
    ok(frame === 'media-pdf', `${tag} pdf: the viewer renders the PDF in an IFRAME (${frame}) — the frame that swallowed the moves`);
    await ev(`(() => { const w = app.wm.windows.get(${J(id)}); app.wm.focusWindow(w.id); w.element.style.left = '40px'; w.element.style.top = '40px'; w.element.style.width = '1000px'; w.element.style.height = '700px'; if (w.onResize) w.onResize(); return true; })()`);
    await sleep(300);
    const b0 = await ev(`window.__drj.box(${J(id)})`);
    const se = await ev(`window.__drj.sePt(${J(id)})`);
    const dx = -((1000 - 320) + 60) * scale, dy = -((700 - 180) + 60) * scale; // past the floor by 60 layout px: the clamp decides, not the pointer
    const underPress = await ev(`window.__drj.under(${se.x}, ${se.y})`);
    const facts0 = {};
    await dragTo(se.x, se.y, se.x + dx, se.y + dy, { steps: 20, beforeRelease: async () => { facts0.underRelease = await ev(`window.__drj.under(${se.x + dx}, ${se.y + dy})`); } });
    await sleep(350);
    const s1 = await state(id);
    const f = await freePt(); await mouse('mouseMoved', f.x, f.y, { buttons: 0 }); await sleep(200);
    const s2 = await state(id);
    const armed = s2.box.width !== s1.box.width || s2.box.height !== s1.box.height;
    const ended = !s1.resizeOp && !s1.shield && !armed;
    const atFloor = s1.box.width === 320 && s1.box.height === 180 && s1.box.left === b0.left && s1.box.top === b0.top;
    const facts = { scale, before: b0, after: s1.box, resizeOp: s1.resizeOp, shield: s1.shield, armed, underPress, underRelease: facts0.underRelease, end: await ev(`app.wm.windows.get(${J(id)})._lastResizeEnd || null`) };
    if (expectFixed) ok(ended && atFloor, `${tag} pdf: the inward resize over its own page SHRANK the viewer to the floor 320×180 (left/top kept) and ENDED at the release`, facts);
    else ok(!(ended && atFloor), `${tag} pdf: CONTROL reproduces the incident — the viewer did not shrink to the floor or the resize stayed armed (${J({ after: s1.box, resizeOp: s1.resizeOp, armed })})`, facts);
    console.log(`    ${tag} pdf resize-inward: ended=${ended} atFloor=${atFloor} after=${s1.box.width}x${s1.box.height} armed=${armed} under-press=${underPress} under-release=${facts0.underRelease}`);
    if (!ended) { await mouse('mouseReleased', f.x, f.y); await sleep(200); }
    await ev(`app.wm.closeWindow(${J(id)}); true`); await sleep(200);
    return { ended, atFloor };
  };

  /** verify r1: the second viewer (userW's window type again) opened fresh per leg — never a resident of the neutral cell. */
  const pngB = path.join(ROOT, 'drj-b.png'); fs.writeFileSync(pngB, PNG);
  const openViewerB = async () => { await ev(`app.openFile(${J(pngB)}, 'drj-b.png'); true`); return until(() => ev(`(() => { const w = [...app.wm.windows.values()].find((w) => w.type === 'viewer' && /drj-b\\.png/.test(w.title)); return w ? w.id : null; })()`), 10000); };
  const closeB = async (B) => { await ev(`window.__drj.closeB(${J(B)})`); await sleep(200); };
  /** T — THE TORN-OFF TAB released over the pane: B merged into the viewer's group, its tab pulled down 60 px (the
   *  tear-off), carried to 60 px BELOW the pane's centre and released AT the centre — the torn-off window follows the
   *  pointer (its title bar sits 15 px above it), so a release at the pointer would land on that title bar and the
   *  document would hear it on any tree; userW's flick releases above the window, in the pane. */
  const tabLeg = async (viewer, row, expectFixed, tag) => {
    const B = await openViewerB();
    if (!ok(!!B, `${tag} ${row.kind} tab: viewer B opened`)) return null;
    const merged = await ev(`window.__drj.merge(${J(viewer)}, ${J(B)})`); await sleep(300);
    if (!ok(merged, `${tag} ${row.kind} tab: B is a guest tab of the viewer's group`)) { await closeB(B); return null; }
    const tp = await ev(`window.__drj.tabPt(${J(viewer)}, ${J(B)})`);
    const pr = await ev(`window.__drj.rect(${J(row.id)}, ${J(row.sel)})`);
    if (!ok(!!(tp && pr), `${tag} ${row.kind} tab: the tab and the pane are there`)) { await closeB(B); return null; }
    await mouse('mouseMoved', tp.x, tp.y, { buttons: 0 }); await mouse('mousePressed', tp.x, tp.y); await sleep(60);
    for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', tp.x, tp.y + 10 * i); await sleep(30); }
    for (let i = 1; i <= 10; i++) { await mouse('mouseMoved', tp.x + (pr.x - tp.x) * i / 10, tp.y + 60 + (pr.y + 60 - tp.y - 60) * i / 10); await sleep(30); }
    await sleep(150);
    const underRelease = await ev(`window.__drj.under(${pr.x}, ${pr.y})`);
    await mouse('mouseReleased', pr.x, pr.y); await sleep(400);
    const s1 = await ev(`window.__drj.tfacts(${J(B)})`);
    const f = await freePt(); await mouse('mouseMoved', f.x, f.y, { buttons: 0 }); await sleep(200);
    const s2 = await ev(`window.__drj.tfacts(${J(B)})`);
    const armed = !s1 || !s2 || s2.box.left !== s1.box.left || s2.box.top !== s1.box.top;
    const cell = await ev(`window.__drj.cellBox(${row.cell})`);
    const ended = !!s1 && !s1.dragging && s1.highlight === 0 && !s1.shield && !armed;
    const fit = !!s1 && fits(s1.box, cell);
    const facts = { s1, armed, cell, underRelease };
    if (expectFixed === true) ok(ended && fit, `${tag} ${row.kind} tab: the torn-off tab released over the pane ENDED (no .dragging, no highlight, shield off, not armed) and FITS the pane's cell`, facts);
    else if (expectFixed === false) ok(!ended, `${tag} ${row.kind} tab: CONTROL reproduces the incident — the torn-off tab stays armed (${J({ dragging: s1 && s1.dragging, highlight: s1 && s1.highlight, armed })})`, facts);
    else console.log(`    ${tag} ${row.kind} tab: not a swallower — ended=${ended}`);
    console.log(`    ${tag} ${row.kind} tab tear-off: ended=${ended} fits=${fit} armed=${armed} highlight=${s1 && s1.highlight} end=${s1 && s1.tabEnd} under-release=${underRelease}`);
    await mouse('mouseReleased', f.x, f.y); await sleep(300);
    await closeB(B); await place(viewer, 0);
    return { ended, fit, armed };
  };
  /** I — THE ICON DRAG released over the pane: B's icon dragged to the pane's centre and released there. */
  const iconLeg = async (viewer, row, expectFixed, tag) => {
    const B = await openViewerB();
    if (!ok(!!B, `${tag} ${row.kind} icon: viewer B opened`)) return null;
    await place(B, 3);
    await ev(`app.wm.focusWindow(${J(row.id)}); true`); await sleep(150); // the pane's window above everything: the release lands in the pane, never on a viewer left over it
    const ip = await ev(`window.__drj.iconPt(${J(B)})`);
    const pr = await ev(`window.__drj.rect(${J(row.id)}, ${J(row.sel)})`);
    if (!ok(!!(ip && pr), `${tag} ${row.kind} icon: the icon and the pane are there`)) { await closeB(B); return null; }
    const underBefore = await ev(`window.__drj.under(${pr.x}, ${pr.y})`);
    await mouse('mouseMoved', ip.x, ip.y, { buttons: 0 }); await mouse('mousePressed', ip.x, ip.y); await sleep(60);
    for (let i = 1; i <= 16; i++) { await mouse('mouseMoved', ip.x + (pr.x - ip.x) * i / 16, ip.y + (pr.y - ip.y) * i / 16); await sleep(30); }
    await sleep(150);
    const mid = await ev(`window.__drj.tfacts(${J(B)})`);
    const underRelease = await ev(`window.__drj.under(${pr.x}, ${pr.y})`);
    await mouse('mouseReleased', pr.x, pr.y); await sleep(400);
    const s1 = await ev(`window.__drj.tfacts(${J(B)})`);
    const stuck = !s1 || s1.visibility === 'hidden' || s1.ghosts > 0;
    const facts = { mid: mid && { visibility: mid.visibility, ghosts: mid.ghosts, shield: mid.shield }, after: s1 && { visibility: s1.visibility, ghosts: s1.ghosts, shield: s1.shield, end: s1.iconEnd }, underRelease };
    if (expectFixed === true) ok(!!mid && mid.visibility === 'hidden' && mid.ghosts === 1 && !stuck && !s1.shield, `${tag} ${row.kind} icon: the icon drag released over the pane ENDED — the window visible again, the ghost gone, the shield off`, facts);
    else if (expectFixed === false) ok(stuck, `${tag} ${row.kind} icon: CONTROL reproduces the incident — the source window stays INVISIBLE with its ghost (${J(facts.after)})`, facts);
    else console.log(`    ${tag} ${row.kind} icon: not a swallower — stuck=${stuck}`);
    console.log(`    ${tag} ${row.kind} icon-drag: mid=${J(facts.mid)} after=${J(facts.after)} under-before=${underBefore} under-release=${underRelease} gone=${!(await ev(`app.wm.windows.has(${J(B)})`))}`);
    const f = await freePt(); await mouse('mouseReleased', f.x, f.y); await sleep(300);
    await closeB(B);
    console.log(`    ${tag} ${row.kind} icon-drag: B closed=${!(await ev(`app.wm.windows.has(${J(B)})`))}`);
    return { stuck };
  };

  try {
    if (!ok(await boot(), 'the page booted')) return;
    const scene = await openScene();
    if (!scene) return;
    const { viewer, rows } = scene;
    ok(rows.length >= 1, `panes on the grid: ${rows.map((r) => r.kind).join(', ')}`);

    // ── D: the drop onto each pane's cell ──
    console.log('— D: the viewer dropped onto the cell of each pane (the release hit-tested in the pane)');
    if (want('D')) for (const row of rows) await dropLeg(viewer, row, true, 'D');

    // ── R: a resize released over each pane ──
    console.log('— R: the viewer\'s SE corner released over each pane (the pane\'s window above the viewer)');
    if (want('R')) for (const row of rows) await resizeLeg(viewer, row, true, 'R');

    // ── T / I: verify r1 — the torn-off tab and the icon drag released over each pane ──
    console.log('— T: a tab torn out of the viewer\'s group and released over each pane (verify r1)');
    if (want('T')) for (const row of rows) await tabLeg(viewer, row, true, 'T');
    console.log('— I: a window dragged by its icon and released over each pane (verify r1)');
    if (want('I')) for (const row of rows) await iconLeg(viewer, row, true, 'I');

    // ── P: D5 — the PDF viewer that could grow but not shrink ──
    console.log('— P: D5 — a PDF viewer at uiScale 90 % × DPR 2.2, its SE corner dragged inward over its own page');
    if (want('P')) { if (ok(await bootAt({ scale: 90, dpr: 2.2 }), 'the page rebooted at uiScale 90 % × DPR 2.2')) await pdfLeg(true, 'P'); }

    // ── C: THE CONTROL — the pre-fix feed, served in place of the bundle ──
    console.log('— C: CONTROL — the pre-fix feed (document mouse listeners, no capture, no shield) in a patched overlay of drag-feed.js / window.js / tab-group.js');
    if (want('C')) {
      // THE SAME CONTROL ON EVERY MACHINE (lane mirror-green r2, the .200 mirror red ×2). This leg read the pre-fix tree
      // from git history (`git show b924041f:src/lib/window.js` + tab-group.js) and patched the fixed window.js only
      // where that commit is absent. The Actions checkout is depth 1, so ONLY the runner ever took the fallback, and
      // verify r1 had since moved the feed (captureOn, DRAG_FEED, the shield) into drag-feed.js: 3 of its 4 patches
      // matched nothing — red on the mirror alone, green on every developer box, where nothing ran that path. Now
      // the control is ONE overlay of today's sources, built and judged identically everywhere: drag-feed.js with the
      // pre-fix feed (no capture, the document's MOUSE events, no shield) and window.js / tab-group.js with no no-button
      // rule. Every patch must find its line on THIS machine too, so a refactor that strands one is red locally.
      const NO_BUTTON_RULE = [/buttons: e\.buttons, pointerId: e\.pointerId \}, feedState\)\.end\)/g, 'buttons: 1, pointerId: e.pointerId }, feedState).end)'];
      const PRE_FIX = {
        'src/lib/drag-feed.js': [
          [/const id = e && e\.pointerId;\n  if \(id == null \|\| !el/, 'const id = null;\n  if (id == null || !el'],
          [/import \{ DRAG_FEED, SHIELD_CLASS, dragEndVerdict \} from '\.\/drag-end\.js';/, "import { SHIELD_CLASS, dragEndVerdict } from './drag-end.js';\nconst DRAG_FEED = { move: 'mousemove', up: 'mouseup', cancel: 'pointercancel', lost: 'lostpointercapture' };"],
          [/if \(on\) cl\.add\(SHIELD_CLASS\);/, 'if (on) { /* control: no shield */ }'],
        ],
        'src/lib/window.js': [NO_BUTTON_RULE],
        'src/lib/tab-group.js': [NO_BUTTON_RULE],
      };
      const overlay = {}, missed = [];
      for (const [rel, patches] of Object.entries(PRE_FIX)) {
        let t = fs.readFileSync(path.join(repo, rel), 'utf8');
        for (const [re, rp] of patches) { if (!new RegExp(re.source).test(t)) missed.push(rel + ' ' + String(re)); t = t.replace(re, rp); }
        overlay[path.basename(rel)] = t;
      }
      const how = "today's drag-feed.js / window.js / tab-group.js with the pre-fix feed restored (" + Object.values(PRE_FIX).flat().length + ' patches, the same on every machine)';
      console.log('  control source: ' + how);
      if (!ok(missed.length === 0, 'the control source is whole (every patch of the pre-fix overlay found its line in today\'s source — a control whose patch missed proves nothing)', missed)) { /* nothing below can be judged */ }
      else {
        const esbuild = require('esbuild');
        // overlay the three files with the control TEXT (its relative imports resolve from wt/src/lib — resolveDir —, so no
        // copy is written into the tree; §51 holds by construction) and bundle the client on it
        const built = await esbuild.build({ entryPoints: [path.join(wt, 'src/client.js')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: false, logLevel: 'silent',
          plugins: [{ name: 'drj-control', setup(b) { b.onLoad({ filter: /src\/lib\/(drag-feed|window|tab-group)\.js$/ }, (a) => ({ contents: overlay[path.basename(a.path)], loader: 'js', resolveDir: path.join(wt, 'src/lib') })); } }] });
        const ctlBundle = Buffer.from(built.outputFiles[0].contents).toString('base64');
        ok(ctlBundle.length > 1000, 'the CONTROL bundle built (drag-feed.js / window.js / tab-group.js overlaid with the pre-fix feed)');
        await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/bundle.js*', requestStage: 'Request' }] });
        onPaused = (p) => { cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: ctlBundle }).catch(() => { }); };
        if (ok(await bootAt({ scale: 100, dpr: 1 }), 'the page rebooted on the CONTROL bundle')) {
          const scene2 = await openScene();
          if (scene2) {
            const res = {};
            for (const row of scene2.rows) { const exp = (row.kind === 'web' || row.kind === 'desktop') ? false : null; res[row.kind] = { drop: await dropLeg(scene2.viewer, row, exp, 'C'), resize: await resizeLeg(scene2.viewer, row, exp, 'C') }; }
            for (const row of scene2.rows) { const exp = (row.kind === 'web' || row.kind === 'desktop') ? false : null; res[row.kind].tab = await tabLeg(scene2.viewer, row, exp, 'C'); res[row.kind].icon = await iconLeg(scene2.viewer, row, exp, 'C'); }
            console.log('  control table: ' + J(res));
          }
          if (ok(await bootAt({ scale: 90, dpr: 2.2 }), 'the CONTROL page rebooted at uiScale 90 % × DPR 2.2')) console.log('  control pdf: ' + J(await pdfLeg(false, 'C')));
        }
        onPaused = null; await cdp('Fetch.disable').catch(() => { });
      }
    }

    // ── C2: the capture-element choice — a tab-group copy capturing on the TAB itself loses the drag at the tear-off ──
    if (want('C2')) {
      console.log('— C2: CONTROL — the tab drag capturing on the tab element (rebuilt by the detach) instead of the title bar');
      const tgFixed = fs.readFileSync(path.join(repo, 'src/lib/tab-group.js'), 'utf8');
      const CAP_LINE = "const capEl = (typeof tabEl.closest === 'function' && tabEl.closest('.window-titlebar')) || tabEl;";
      if (!ok(tgFixed.includes(CAP_LINE), 'the C2 control found the capture-element line it reverts')) { /* nothing to judge */ }
      else {
        const tgOnTab = tgFixed.replace(CAP_LINE, 'const capEl = tabEl; /* control: the tab element */');
        const esbuild = require('esbuild');
        const built = await esbuild.build({ entryPoints: [path.join(wt, 'src/client.js')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: false, logLevel: 'silent',
          plugins: [{ name: 'drj-c2', setup(b) { b.onLoad({ filter: /src\/lib\/tab-group\.js$/ }, () => ({ contents: tgOnTab, loader: 'js', resolveDir: path.join(wt, 'src/lib') })); } }] });
        const c2Bundle = Buffer.from(built.outputFiles[0].contents).toString('base64');
        await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/bundle.js*', requestStage: 'Request' }] });
        onPaused = (p) => { cdp('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: c2Bundle }).catch(() => { }); };
        if (ok(await bootAt({ scale: 100, dpr: 1 }), 'the page rebooted on the C2 bundle (capture on the tab element)')) {
          await ev('app.wm.setGrid(2, 3); true');
          await ev(`app.openFile(${J(pngPath)}, 'drj.png'); true`);
          const v2 = await until(() => ev(`(() => { const w = [...app.wm.windows.values()].find((w) => w.type === 'viewer'); return w ? w.id : null; })()`), 10000);
          const web2 = await ev(`app.openBrowser(${J(`http://127.0.0.1:${PORT}/api/version`)}).id`);
          if (v2 && web2) {
            await place(v2, 0); await place(web2, 1);
            await until(() => ev(`(() => { const f = app.wm.windows.get(${J(web2)}).content.querySelector('iframe'); return !!(f && f.contentWindow); })()`), 10000);
            const r = await tabLeg(v2, { kind: 'web', id: web2, cell: 1, sel: 'iframe' }, null, 'C2');
            const endSeen = await ev(`(() => { const ws = [...app.wm.windows.values()]; return ws.map((w) => w._lastTabDragEnd).filter(Boolean); })()`);
            ok(!!r && !r.fit && (endSeen.includes('capture-lost') || !r.ended), `C2 CONTROL: capturing on the tab element the tear-off LOSES the drag (ends: ${J(endSeen)}; fit=${r && r.fit}) — the title bar is the element a tear-off keeps`, { r, endSeen });
          } else ok(false, 'C2: the viewer and the Web view opened');
        }
        onPaused = null; await cdp('Fetch.disable').catch(() => { });
      }
    }
  } finally {
    try { cdpWs.close(); } catch { }
  }
})();

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed, ${skipped} skipped)`);
process.exit(fail ? 1 : 0);
