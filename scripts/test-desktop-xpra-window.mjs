#!/usr/bin/env node
// THE XPRA WINDOW, END TO END (docs/design-desktop-apps.zh.md §7 P8-2 chunk
// x2, 2026-09-22; D21 (c) (b) — the window is OURS): headless chrome against
// a worktree server on the DEFAULT ladder (xpra first when installed, DA1)
// with a REAL xpra 6.5.3 + its Xvfb + a real xterm. The chunk's exit
// conditions, MEASURED and printed:
//   • the app window fills the pane at TWO sizes — the main canvas covers the
//     pane (xterm snaps to its character cell; the leftover is under one cell
//     each way) and a screenshot of the pane counts ZERO black pixels outside
//     the app window (the pane is a theme colour, never a root);
//   • the VibeSpace title bar shows the app window's OWN title, equal to what
//     the X server reports for it (GET …/windows);
//   • a string typed through CDP's trusted key events is read back from the
//     app's own state (xterm runs `cat > file`), and IME text (CDP insertText
//     → the textarea's input event → the published U<hex> keycodes) too;
//   • the clipboard both ways at the X level: a paste event in the browser
//     is what `xclip -o` reads on the app's display; a copy on the display
//     (`xclip -i`) lands in navigator.clipboard on the SECURE page
//     (loopback) and, on a PLAIN-HTTP page by hostname (NOT loopback —
//     isSecureContext is asserted false), as the "Copied in the app — click
//     to copy" chip whose trusted click copies (read back from the secure
//     page: one browser, one clipboard);
//   • on the plain-http page, browser → app with REAL pastes (CDP's native
//     `paste` editing command — the browser's own clipboard, no async API):
//     Ctrl+V on the pane, and the Paste chip's PASTE BOX (the shell's; the
//     page cannot read the clipboard, so the box is the route) then Send —
//     each read back with `xclip -o` on the app's display;
//   • a second top-level of the same app (xterm's Ctrl+Button1 menu, an
//     override-redirect popup) is drawn INSIDE the pane;
//   • under the UI scale (vibespace.uiScale 125 ⇒ body zoom 1.25) at a THIRD
//     size: the canvas sits at NET zoom 1 (on-screen px == canvas px), the
//     session's screen is the pane's on-screen size, zero black pixels
//     outside the app window, and a pointer move lands on the SAME X
//     coordinate (`xdotool getmouselocation` on the display);
//   • Stop ⇒ "Stopped", nothing left running.
// SKIPs with evidence without chrome / xpra / xauth / xterm; the xclip legs
// SKIP without xclip; the plain-http leg SKIPs when the hostname does not
// resolve. Worktree-isolated (own data/, scratch HOME, VIBESPACE_SKIP_AGENT_HOOKS=1),
// free ports, per-pid names, the chrome profile in scratch.
// Run: node scripts/test-desktop-xpra-window.mjs
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE } from './scratch.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require('../src/desktop-display.js');
const { fixtureLitter } = require('../src/fixture-guard.js');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const bin = (n) => D.binOnPath(n, { env: process.env });
const XPRA = bin('xpra'), XAUTH = bin('xauth'), XTERM = bin('xterm'), XCLIP = bin('xclip'), XDOTOOL = bin('xdotool');
const skipWhy = !CHROME ? 'no chrome/chromium' : !XPRA ? 'xpra not on PATH (apt install xpra)' : !XAUTH ? 'xauth not on PATH' : !XTERM ? 'xterm not on PATH' : null;
if (skipWhy) { console.log(`SKIP: ${skipWhy}`); process.exit(0); }
let xpraVersion = '';
try { xpraVersion = execFileSync(XPRA, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch {}
const HOSTNAME = os.hostname();
let hostResolves = false;
try { hostResolves = /\S/.test(execFileSync('getent', ['hosts', HOSTNAME], { encoding: 'utf8', timeout: 5000 })); } catch {}
console.log(`box: ${xpraVersion || 'xpra ?'}, xterm ${XTERM}, xclip ${XCLIP || 'absent'}, xdotool ${XDOTOOL || 'absent'}, hostname resolves: ${hostResolves}`);

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('deskxpra-smoke');
const fakeHome = scratchHome('deskxpra-home', fs);
// THE REAL HOME IS CENSUSED (scripts/test-fixture-isolation.mjs, census (c)): every suite that
// carries a synthetic session id into a server's home snapshots ~/.claude/projects before and
// proves it gained no FIXTURE entry after — src/fixture-guard.js owns the predicate.
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
let failed = 0, skipped = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
const skip = (n, why) => { skipped++; console.log(`  ⚠ SKIP ${n}: ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js']) { execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`); }
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
execSync('npm run build', { cwd: wt, stdio: 'ignore' });

// §5's agent lease needs a LIVE agent session: a fake claude (prints the init frame, then sleeps) under the real ws create
const FAKE_BIN = path.join(fakeHome, 'fake-bin');
const FAKE_CLAUDE = path.join(FAKE_BIN, 'claude');
fs.mkdirSync(FAKE_BIN, { recursive: true });
{
  const sid = fixtureSid('5a');
  const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: sid, cwd: fakeHome, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
  fs.writeFileSync(FAKE_CLAUDE, `#!/bin/sh\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n' '${init}';; esac\nexec sleep 600\n`, { mode: 0o755 });
}
const agentTokens = [];
const srvEnv = { ...process.env, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', CLAUDE_CMD: FAKE_CLAUDE, PATH: FAKE_BIN + ':' + (process.env.PATH || '') };
let srv = null;
const srvLog = [];
const bootServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: ['ignore', 'pipe', 'pipe'] }); srv.stdout.on('data', (d) => srvLog.push(String(d))); srv.stderr.on('data', (d) => srvLog.push(String(d))); return srv; };
bootServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', '--window-size=1400,900', `--user-data-dir=${scratch('deskxpra-chrome')}`, 'about:blank'], { stdio: 'ignore' });
const worktrees = [wt]; // + §5's pre-x5 CONTROL copy while it exists
const ctlServers = [];
const appsOf = (w) => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(w, 'data/desktop-apps.json'), 'utf8')).apps).map((a) => ({ ...a, _wt: w })); } catch { return []; } };
const recordedApps = () => worktrees.flatMap(appsOf);
const recordedPids = () => recordedApps().flatMap((a) => Object.values(a.pids || {})).filter(Boolean);
// A crashed run used to leave xpra's own Xvfb alive (measured: two `Xvfb-for-Xpra` orphans, cwd `/tmp/vs-deskxpra-smoke-… (deleted)`):
// killing the RECORDED pids kills xpra, and its Xvfb child outlives that. The sweep the keeper itself runs: every
// process whose environ carries this worktree's session marker (`VIBESPACE_DESKTOP_APP=<id>`) or its XAUTHORITY
// path is ours by evidence — the marker xpra rewrites away is still on the Xvfb and the app it spawned.
const markerSweep = () => {
  const apps = recordedApps().filter((a) => a.id);
  const needles = [...apps.map((a) => `VIBESPACE_DESKTOP_APP=${a.id}`), ...apps.map((a) => `XAUTHORITY=${path.join(a._wt, 'data', 'desktop-apps', a.id, 'Xauthority')}`)];
  const hit = [];
  if (!needles.length) return hit;
  for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d) || Number(d) === process.pid) continue; if (needles.some((n) => D.environHas(Number(d), n))) hit.push(Number(d)); }
  for (const p of hit) { try { process.kill(p, 'SIGKILL'); } catch {} }
  return hit;
};
const xclipKids = [];
const cleanup = () => {
  for (const k of xclipKids) { try { process.kill(-k.pid, 'SIGKILL'); } catch {} try { k.kill('SIGKILL'); } catch {} }
  try { chrome.kill('SIGKILL'); } catch {}
  try { srv?.kill('SIGKILL'); } catch {}
  for (const c of ctlServers) { try { c.kill('SIGKILL'); } catch {} }
  for (const p of recordedPids()) { try { process.kill(p, 'SIGKILL'); } catch {} }
  const swept = markerSweep();
  if (swept.length) console.log(`  (exit sweep reaped ${swept.length} process(es) still carrying this run's marker: ${swept.join(', ')})`);
  // §5's agent session (dtach + the wrapper + the fake claude): by EVIDENCE — its token in the environ / argv, or this worktree's socket dir in the argv
  const sessionHit = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
    let cmd = ''; try { cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'latin1'); } catch { continue; }
    if (cmd.includes(path.join(wt, 'data', 'sockets') + '/') || agentTokens.some((t) => t && (cmd.includes(t) || D.environHas(Number(d), `VIBESPACE_SESSION_TOKEN=${t}`)))) sessionHit.push(Number(d));
  }
  for (const p of sessionHit) { try { process.kill(p, 'SIGKILL'); } catch {} }
  if (sessionHit.length) console.log(`  (exit sweep reaped ${sessionHit.length} process(es) of §5's agent session: ${sessionHit.join(', ')})`);
  for (const w of worktrees) { try { execSync(`git worktree remove --force ${w}`, { cwd: repo, stdio: 'ignore' }); } catch {} }
  try { fs.rmSync(scratch('deskxpra-chrome'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(scratch('deskxpra-x5ctl-home'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch {}
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

const waitServer = async () => { for (let i = 0; i < 80; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); return true; } catch { await sleep(250); } } return false; };
check('worktree server boots', await waitServer());
const WebSocket = require('ws');
const cdpTargets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json());
const target = await until(async () => (await cdpTargets()).find((t) => t.type === 'page'), 20000, 250);
async function page(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let seq = 0; const pend = new Map(); const logs = [];
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.consoleAPICalled') logs.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')); });
  const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails))); return r.result.value; };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  return { ws, cdp, evalJs, logs, close: () => { try { ws.close(); } catch {} } };
}
const openPage = async (p, origin) => { await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await p.cdp('Page.navigate', { url: `${origin}/` }); await sleep(1500); await p.evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })'); await until(() => p.evalJs('app.layoutManager && app.layoutManager._restoring === false'), 12000, 250); };
const trustedClickAt = async (p, x, y, modifiers = 0, button = 'left') => {
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
  await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1, modifiers });
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1, modifiers });
};
// the window's raw handles (never the DOM): the WindowManager record and the view's own snapshot
const WIN = (appId) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); if (!w) return null; const v = w._desktopAppView; const r = v && v.pane ? v.pane.getBoundingClientRect() : null; return { id: w.id, title: w.title, status: v ? v.status.textContent : null, kind: v && v.pane ? 'xpra' : 'rfb', pane: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null, windows: v && v.windows ? v.windows() : [], chip: v && v.chip ? { shown: v.chip.style.display !== 'none', text: v.chipText, rect: (() => { const c = v.chip.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; })() } : null, els: v && v.pane ? [...v.pane.querySelectorAll('.xpra-win')].map((e) => { const c = e.getBoundingClientRect(); return { wid: e.dataset.wid, x: c.x, y: c.y, w: c.width, h: c.height }; }) : [] }; })()`;
// x5: a window's seat as the page has it — the view's mode, the seats broadcast, the overlay (shown / title / words / the button's rect), the stage
const SEAT = (appId) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); if (!w) return null; const v = w._desktopAppView; const o = w.content.querySelector('.desktop-app-blocked'); const b = o && o.querySelector('.desktop-app-resume'); const br = b && b.getBoundingClientRect(); const pr = v && v.pane ? v.pane.getBoundingClientRect() : null; return { id: w.id, title: w.title, status: v ? v.status.textContent : null, mode: v ? v.mode : null, scale: v ? v.stageScale : null, windows: v && v.windows ? v.windows() : [], pane: pr ? { x: pr.x, y: pr.y, w: pr.width, h: pr.height } : null, paneKey: w._desktopPaneKey, seats: w._desktopSeats || null, overlay: o ? { shown: getComputedStyle(o).display !== 'none', title: o.querySelector('.desktop-app-blocked-title').textContent, titleKids: o.querySelector('.desktop-app-blocked-title').childElementCount, msg: o.querySelector('.term-blocked-msg').textContent, btn: br ? { x: br.x, y: br.y, w: br.width, h: br.height } : null } : null, stageEls: v && v.stage ? [...v.stage.children].map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }) : [] }; })()`;
/** The pane's pixels: a screenshot clip decoded IN THE PAGE (no node PNG library) — black pixels outside the
 *  app window rect(s), the covered fraction, and the non-black fraction inside the main window. */
const measurePane = async (p, appId) => {
  const st = await p.evalJs(WIN(appId));
  if (!st || !st.pane) return null;
  const shot = await p.cdp('Page.captureScreenshot', { format: 'png', clip: { x: st.pane.x, y: st.pane.y, width: st.pane.w, height: st.pane.h, scale: 1 } });
  const rects = st.els.map((e) => ({ x: e.x - st.pane.x, y: e.y - st.pane.y, w: e.w, h: e.h }));
  const r = await p.evalJs(`(async () => { const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.data)}; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); const d = ctx.getImageData(0, 0, c.width, c.height).data; const rects = ${JSON.stringify(rects)}; const inside = (x, y) => rects.some((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h); let blackOut = 0, out = 0, inN = 0, inBright = 0; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; const dark = d[i] + d[i + 1] + d[i + 2] < 30; if (inside(x, y)) { inN++; if (!dark) inBright++; } else { out++; if (dark) blackOut++; } } return { w: c.width, h: c.height, out, blackOut, inN, inBrightFrac: inN ? inBright / inN : 0 }; })()`);
  const main = st.windows.find((w) => w.kind === 'main') || st.windows[0] || null;
  const coverage = main ? (main.w * main.h) / (st.pane.w * st.pane.h) : 0;
  return { ...r, pane: st.pane, main, coverage, els: st.els, title: st.title, status: st.status };
};
const typedFile = path.join(fakeHome, 'typed.txt');

let p1 = await page(target);
let appId = null, rec = null;
try {
  await openPage(p1, `http://127.0.0.1:${PORT}`);
  await p1.cdp('Browser.grantPermissions', { origin: `http://127.0.0.1:${PORT}`, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await p1.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
  check('the loopback page is a SECURE context (the API branch can be proven here)', await p1.evalJs('window.isSecureContext === true'));
  const av = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json())`);
  check(`the default ladder picks xpra on this box (${JSON.stringify(av.availability)})`, av.availability?.backend === 'xpra' && av.availability?.stream === 'xpra', av.availability);

  // ── launch: xterm titled by us, running `cat > file` so typed text is read back from the app's own state ──
  const launch = await p1.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ exec: XTERM, args: ['-T', 'vs-xpra-title', '-geometry', '80x24', '-e', 'sh', '-c', `cat > ${typedFile}`], label: 'xterm' }))} }).then((r) => r.json())`);
  appId = launch && launch.id;
  check('POST /api/desktop/apps launches on the xpra rung', !!appId && launch.backend === 'xpra' && launch.stream === 'xpra', launch);
  rec = await until(() => p1.evalJs(`fetch('/api/desktop/apps/${appId}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 30000);
  check(`the record reaches ready (${rec && rec.display}, port ${rec && rec.port})`, !!rec && rec.state === 'ready', rec && rec.lastError);
  const xenv = { ...process.env, DISPLAY: rec.display, XAUTHORITY: path.join(wt, 'data', 'desktop-apps', appId, 'Xauthority') };

  // ── the window, drawn by us ──
  await p1.evalJs(`app.openDesktopApp(${JSON.stringify(appId)}); true`);
  const t0 = Date.now();
  const connected = await until(async () => { const s = await p1.evalJs(WIN(appId)); return s && s.status === 'Connected' && s.windows.length ? s : null; }, 30000, 250);
  console.log(`  first window drawn ${Date.now() - t0} ms after open`);
  check('the window connects through OUR client (status Connected, a window in the session)', !!connected, connected || p1.logs.slice(-10));
  check('the picture is the xpra view (a pane, not an RFB canvas, not an iframe)', !!connected && connected.kind === 'xpra' && await p1.evalJs(`!document.querySelector('.window iframe')`));
  // let the first full paint land
  await until(async () => { const m = await measurePane(p1, appId); return m && m.inBrightFrac > 0.5 ? m : null; }, 15000, 500);

  // ── (1) the app window IS the picture: two sizes, pixels measured ──
  const sizes = [[640, 480], [900, 620]]; // small first; the popup leg below runs at the larger size, where xterm's 446 px menu fits the pane
  for (const [W, H] of sizes) {
    await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); w.element.style.width = '${W}px'; w.element.style.height = '${H}px'; if (w.onResize) w.onResize(); return true; })()`);
    // the session re-fits (display-configure + configure-window), xterm accepts a cell-snapped size, the server confirms
    const settled = await until(async () => { const s = await p1.evalJs(WIN(appId)); const m = s && s.windows.find((w) => w.kind === 'main'); return m && s.pane.w - m.w < 16 && s.pane.h - m.h < 24 && m.x === 0 && m.y === 0 ? s : null; }, 15000, 300);
    await sleep(1500); // the repaint after the resize
    const m = await measurePane(p1, appId);
    console.log(`  ${W}×${H}: pane ${m.pane.w}×${m.pane.h}, main window ${m.main && `${m.main.w}×${m.main.h} at ${m.main.x},${m.main.y}`}, coverage ${(m.coverage * 100).toFixed(1)} %, ${m.blackOut} black px of ${m.out} outside the window, ${(m.inBrightFrac * 100).toFixed(1)} % of the window non-black`);
    check(`${W}×${H}: the app window sits at 0,0 and covers the pane up to one xterm cell (${m.main && m.main.w}×${m.main && m.main.h} of ${m.pane.w}×${m.pane.h})`, !!settled && !!m.main && m.main.x === 0 && m.main.y === 0 && m.pane.w - m.main.w < 16 && m.pane.h - m.main.h < 24, m.main);
    check(`${W}×${H}: ZERO black pixels outside the app window (${m.blackOut} of ${m.out})`, m.blackOut === 0 && m.out >= 0);
    check(`${W}×${H}: the app window itself is painted (${(m.inBrightFrac * 100).toFixed(0)} % non-black — xterm's white page)`, m.inBrightFrac > 0.5);
    // the X server's own geometry for the window (xterm rounds a request to its cell grid; xpra reports the result)
    const xw = await until(async () => { const r = await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`); const x = r.windows && r.windows[0]; return x && m.pane.w - x.w < 16 && m.pane.h - x.h < 24 ? x : null; }, 8000, 500);
    const constraints = await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const c = w._desktopAppView.client; const m = c.windows.get(c.mainWid); return m ? m.meta['size-constraints'] || null : null; })()`);
    console.log(`  ${W}×${H}: X says ${xw ? `${xw.w}×${xw.h}` : 'no window within a cell of the pane'}; the client's size hints ${JSON.stringify(constraints)}`);
    check(`${W}×${H}: the X server agrees the window follows the pane (${xw ? `${xw.w}×${xw.h}` : '?'} vs pane ${m.pane.w}×${m.pane.h}, within one cell) and our canvas matches X within 8 px`, !!xw && Math.abs(xw.w - m.main.w) <= 8 && Math.abs(xw.h - m.main.h) <= 8, { x: xw, local: m.main });
  }

  // ── the title: the app window's own, and equal to what X reports ──
  const xw = await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`);
  const st = await p1.evalJs(WIN(appId));
  check(`the VibeSpace title bar shows the app window's own title ("${st.title}") and it equals the X window's ("${xw.windows && xw.windows[0] && xw.windows[0].title}")`, st.title === 'vs-xpra-title' && xw.windows && xw.windows[0] && xw.windows[0].title === st.title, { title: st.title, x: xw.windows });

  // ── typed text, read back from the app's own state ──
  const s1 = await p1.evalJs(WIN(appId));
  await trustedClickAt(p1, s1.pane.x + s1.pane.w / 2, s1.pane.y + s1.pane.h / 2);
  await sleep(300);
  const keyOf = (ch) => ({ key: ch, code: ch === ' ' ? 'Space' : /[a-z]/.test(ch) ? 'Key' + ch.toUpperCase() : /[0-9]/.test(ch) ? 'Digit' + ch : '', windowsVirtualKeyCode: ch === ' ' ? 32 : ch.toUpperCase().charCodeAt(0), text: ch, unmodifiedText: ch });
  for (const ch of 'hi xpra 42') { const k = keyOf(ch); await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); }
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  const typed = await until(() => { try { const s = fs.readFileSync(typedFile, 'utf8'); return s.includes('hi xpra 42\n') ? s : null; } catch { return null; } }, 15000, 200);
  check('a string typed through trusted key events is echoed by the app: xterm\'s `cat` wrote it to the file', !!typed, typed === null ? (fs.existsSync(typedFile) ? JSON.stringify(fs.readFileSync(typedFile, 'utf8')) : 'no file') : undefined);
  // IME text: CDP insertText fires the textarea's input event (inputType insertText) — the published U<hex> keycodes carry it
  await p1.cdp('Input.insertText', { text: 'é中文' });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  const ime = await until(() => { try { const s = fs.readFileSync(typedFile, 'utf8'); return s.includes('é中文\n') ? s : null; } catch { return null; } }, 15000, 200);
  check('IME / inserted text reaches the app: é and 中文 through PUBLISHED keycodes on the native keymap (the server reprograms the X keymap before the presses)', !!ime, ime === null ? { file: JSON.stringify(fs.readFileSync(typedFile, 'utf8')), xpraLog: (() => { try { return fs.readFileSync(path.join(wt, 'data', 'desktop-apps', appId, 'app.log'), 'utf8').split('\n').filter((l) => /key|keysym|keymap|xkb|modmap|Warning|Error/i.test(l)).slice(-25); } catch (e) { return String(e.message); } })() } : undefined);
  // a physical key the US layout lacks: AltGr+e = é on many layouts — the same publish-then-press path from keyDown
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'é', code: 'KeyE', windowsVirtualKeyCode: 69, text: 'é', unmodifiedText: 'e' });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'é', code: 'KeyE', windowsVirtualKeyCode: 69 });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  const altgr = await until(() => { try { const s = fs.readFileSync(typedFile, 'utf8'); return /é中文\né\n/.test(s) ? s : null; } catch { return null; } }, 10000, 200);
  check('a key the US keymap lacks (é as a key event) reaches the app the same way', !!altgr, altgr === null ? JSON.stringify(fs.readFileSync(typedFile, 'utf8')) : undefined);

  // ── the clipboard, both ways, at the X level ──
  if (!XCLIP) skip('clipboard at the X level', 'xclip not on PATH');
  else {
    // browser → app: a paste EVENT (what Ctrl+V fires; no async API needed) — the X selection then reads it
    await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const v = w._desktopAppView; const dt = new DataTransfer(); dt.setData('text/plain', 'from-the-browser'); v.ime.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true; })()`);
    const xsel = await until(() => { try { const s = execFileSync(XCLIP, ['-o', '-selection', 'clipboard'], { env: xenv, encoding: 'utf8', timeout: 4000 }); return s === 'from-the-browser' ? s : null; } catch { return null; } }, 10000, 400);
    check('browser → app: the paste event\'s text is what `xclip -o` reads on the app\'s display', xsel === 'from-the-browser', xsel);
    // app → browser on the SECURE page: a copy on the display lands in navigator.clipboard
    const holder = spawn('sh', ['-c', `printf 'from-the-app' | ${XCLIP} -i -selection clipboard`], { env: xenv, stdio: 'ignore', detached: true }); xclipKids.push(holder);
    const gotSecure = await until(() => p1.evalJs(`navigator.clipboard.readText().then((t) => (t === 'from-the-app' ? t : null)).catch(() => null)`), 10000, 400);
    check('app → browser (secure context): a copy inside the app (xclip -i on its display) lands in navigator.clipboard', gotSecure === 'from-the-app', { got: gotSecure, chip: (await p1.evalJs(WIN(appId))).chip, logs: p1.logs.slice(-5) });
    // app → browser on the PLAIN-HTTP page: the chip, then a trusted click copies — read back from the secure page
    if (!hostResolves) skip('the plain-http branch', `${HOSTNAME} does not resolve`);
    else {
      const t2 = await (async () => { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' }); return r.json(); })();
      const p2 = await page(t2);
      await openPage(p2, `http://${HOSTNAME}:${PORT}`);
      const insecure = await p2.evalJs('window.isSecureContext === false');
      if (!insecure) skip('the plain-http branch', `http://${HOSTNAME}:${PORT} is a secure context in this chrome`);
      else {
        check(`the hostname page (http://<hostname>:${PORT}) is NOT a secure context — the chip branch can be proven here`, insecure);
        // layout sync replays the window on the second client by itself (the openSpec); opening a second one would make a duplicate
        const replayed = await until(() => p2.evalJs(`!!${WIN(appId)}`), 15000, 250);
        if (!replayed) await p2.evalJs(`app.openDesktopApp(${JSON.stringify(appId)}); true`);
        // x5: the first page is the ACTIVE viewer — the second one opens BLOCKED and takes over with Resume here
        const blocked2 = await until(async () => { const s = await p2.evalJs(SEAT(appId)); return s && s.mode === 'blocked' && s.overlay && s.overlay.shown && s.overlay.btn && s.overlay.btn.w > 0 ? s : null; }, 15000, 250);
        check('x5: the second viewer opens BLOCKED behind the "Active on another client" overlay', !!blocked2, await p2.evalJs(SEAT(appId)));
        if (blocked2) { await p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); app.wm.focusWindow(w.id); return true; })()`); const b2 = await p2.evalJs(SEAT(appId)); await trustedClickAt(p2, b2.overlay.btn.x + b2.overlay.btn.w / 2, b2.overlay.btn.y + b2.overlay.btn.h / 2); }
        const c2 = await until(async () => { const s = await p2.evalJs(WIN(appId)); return s && s.status === 'Connected' && s.windows.length ? s : null; }, 30000, 250);
        check(`the same app shows on the plain-http page after Resume here (${replayed ? 'replayed by layout sync' : 'opened'}; xpra --sharing=yes)`, !!c2, c2 || p2.logs.slice(-6));
        // MEASURED xpra rule (server/subsystem/clipboard.py): the clipboard belongs to ONE client — the first, then
        // whoever becomes the "ui driver" (the last to send input); a viewer that never touched the app gets no
        // copies. The click below is what a human does before copying anyway.
        await trustedClickAt(p2, c2.pane.x + c2.pane.w / 2, c2.pane.y + c2.pane.h / 2);
        await sleep(400);
        for (const k of xclipKids.splice(0)) { try { process.kill(-k.pid, 'SIGKILL'); } catch {} }
        const holder2 = spawn('sh', ['-c', `printf 'from-the-app-2' | ${XCLIP} -i -selection clipboard`], { env: xenv, stdio: 'ignore', detached: true }); xclipKids.push(holder2);
        const chipSt = await until(async () => { const s = await p2.evalJs(WIN(appId)); return s && s.chip && s.chip.shown && s.chip.text === 'from-the-app-2' ? s : null; }, 10000, 300);
        check('on plain http the copy becomes the "Copied in the app — click to copy" chip holding the text (never a silent no-op)', !!chipSt, chipSt || (await p2.evalJs(WIN(appId))).chip);
        if (chipSt) {
          await trustedClickAt(p2, chipSt.chip.rect.x + chipSt.chip.rect.w / 2, chipSt.chip.rect.y + chipSt.chip.rect.h / 2);
          const gone = await until(async () => { const s = await p2.evalJs(WIN(appId)); return s && s.chip && !s.chip.shown ? true : null; }, 5000, 200);
          check('a trusted click on the chip copies through the user gesture and the chip goes away', !!gone);
          // the secure page must be the FOCUSED page again for readText (Chrome's rule); p2 was the active target
          await p1.cdp('Page.bringToFront');
          const readBack = await until(() => p1.evalJs(`navigator.clipboard.readText().then((t) => (t === 'from-the-app-2' ? t : null)).catch((e) => null)`), 8000, 300);
          check('…and the SECURE page reads that text from the browser clipboard (one browser, one clipboard)', readBack === 'from-the-app-2', { readBack, err: await p1.evalJs(`navigator.clipboard.readText().then((t) => 'ok:' + t).catch((e) => 'err:' + e.message)`) });
        }
        // ── browser → app on PLAIN HTTP with REAL pastes: the browser's own clipboard is filled from the secure page (one
        // browser, one clipboard), then CDP's native `paste` editing command pastes it on the hostname page — no async API ──
        const setBrowserClipboard = async (text) => { await p1.cdp('Page.bringToFront'); const r = await p1.evalJs(`navigator.clipboard.writeText(${JSON.stringify(text)}).then(() => 'ok').catch((e) => 'err:' + e.message)`); await p2.cdp('Page.bringToFront'); return r; };
        const nativePaste = async () => { await p2.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 2, commands: ['paste'] }); await p2.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: 2 }); };
        const xselIs = (want) => until(() => { try { const s = execFileSync(XCLIP, ['-o', '-selection', 'clipboard'], { env: xenv, encoding: 'utf8', timeout: 4000 }); return s === want ? s : null; } catch { return null; } }, 10000, 400);
        const wrote1 = await setBrowserClipboard('from-a-real-paste');
        const c3 = await p2.evalJs(WIN(appId));
        await trustedClickAt(p2, c3.pane.x + c3.pane.w / 2, c3.pane.y + c3.pane.h / 2); // focus the pane (its IME textarea)
        await sleep(300);
        await nativePaste();
        const xsel2 = await xselIs('from-a-real-paste');
        check(`plain http, Ctrl+V on the pane: the browser's real paste event carries the text into the app (xclip -o reads "${xsel2}"; clipboard filled: ${wrote1})`, xsel2 === 'from-a-real-paste', { wrote1, xsel: xsel2, logs: p2.logs.slice(-5) });
        const wrote2 = await setBrowserClipboard('from-the-paste-box');
        const pasteRect = await p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const b = w._desktopAppView.bar.querySelector('.desktop-paste'); const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
        await trustedClickAt(p2, pasteRect.x + pasteRect.w / 2, pasteRect.y + pasteRect.h / 2);
        const box = await until(() => p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const v = w._desktopAppView; const b = v.container.querySelector('.vnc-paste-box'); if (!v.pasteOpen || !b) return null; const s = b.querySelector('.vnc-paste-send').getBoundingClientRect(); return { note: b.querySelector('.vnc-paste-note').textContent, focused: document.activeElement === b.querySelector('textarea'), send: { x: s.x, y: s.y, w: s.width, h: s.height } }; })()`), 6000, 200);
        check('plain http, the Paste chip: the page cannot read the clipboard, so the shell\'s PASTE BOX opens naming HTTPS, its textarea focused (never "press Ctrl+V" into nothing)', !!box && /not served over HTTPS/.test(box.note) && box.focused, box);
        if (box) {
          await nativePaste();
          const inBox = await until(() => p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const b = w._desktopAppView.container.querySelector('.vnc-paste-box textarea'); return b && b.value === 'from-the-paste-box' ? b.value : null; })()`), 5000, 200);
          check(`…a real paste lands in the box (the textarea's native paste — plain http, no API; clipboard filled: ${wrote2})`, inBox === 'from-the-paste-box', inBox);
          await trustedClickAt(p2, box.send.x + box.send.w / 2, box.send.y + box.send.h / 2);
          const xsel3 = await xselIs('from-the-paste-box');
          const after = await p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const v = w._desktopAppView; return { open: v.pasteOpen, imeFocused: document.activeElement === v.ime }; })()`);
          check(`…Send puts it into the app (xclip -o reads "${xsel3}"), closes the box and hands the focus back to the app`, xsel3 === 'from-the-paste-box' && !after.open && after.imeFocused, { xsel: xsel3, after });
        }
      }
      // close p2's TARGET (never its window: layout sync would close the window on every client); its viewer leaving hands the ui driver back to p1
      p2.close();
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t2.id}`);
      await sleep(800);
      await p1.cdp('Page.bringToFront');
    }
  }

  // ── a second top-level of the same app: xterm's Ctrl+Button1 menu (an override-redirect popup) inside the pane ──
  const ensureWin = async () => { let s = await p1.evalJs(WIN(appId)); if (s && s.status === 'Connected' && s.windows.length) return s; await p1.evalJs(`app.openDesktopApp(${JSON.stringify(appId)}); true`); s = await until(async () => { const x = await p1.evalJs(WIN(appId)); return x && x.status === 'Connected' && x.windows.length ? x : null; }, 30000, 250); return s; };
  const s2 = await ensureWin();
  check('the first page still shows the window (or re-opens it) after the second viewer left', !!s2, s2);
  const cx = s2.pane.x + s2.pane.w / 2, cy = s2.pane.y + s2.pane.h / 2;
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, modifiers: 2 });
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1, modifiers: 2 });
  const popup = await until(async () => { const s = await p1.evalJs(WIN(appId)); const p = s && s.windows.find((w) => w.kind === 'popup'); return p ? { p, pane: s.pane, els: s.els } : null; }, 8000, 200);
  await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1, modifiers: 2 });
  check('Ctrl+Button1 in xterm opens its menu: a SECOND top-level (override-redirect popup) of the same app is drawn', !!popup, popup || (await p1.evalJs(WIN(appId))).windows);
  if (popup) {
    // MEASURED: X places a popup itself (override-redirect — no WM, no client may move it) and Xt positions it against
    // the screen size it cached at connect (the recipe's large initial Xvfb), so xterm's 446 px menu opened at the pointer
    // hangs below a 553 px root; the X server clips it there and XTest cannot move a pointer beyond the root, so a
    // display-shift would show items no click could reach. The window is drawn where X put it, at the pointer, its
    // origin inside the pane, clipped by the pane exactly as X clips it at the root — never hidden, never moved.
    const originInside = popup.p.x >= 0 && popup.p.y >= 0 && popup.p.x < popup.pane.w && popup.p.y < popup.pane.h;
    const overflow = Math.max(0, popup.p.x + popup.p.w - popup.pane.w) + Math.max(0, popup.p.y + popup.p.h - popup.pane.h);
    console.log(`  popup ${popup.p.w}×${popup.p.h} at ${popup.p.x},${popup.p.y} in a ${popup.pane.w}×${popup.pane.h} pane (${overflow} px beyond the root — X's own clipping)`);
    check(`…drawn at the pointer with its origin INSIDE the pane (${popup.p.w}×${popup.p.h} at ${popup.p.x},${popup.p.y} in ${popup.pane.w}×${popup.pane.h}; ${overflow} px hang below the root as in X itself), not lost`, originInside, popup.p);
    const popupEl = popup.els.find((e) => String(e.wid) === String(popup.p.wid));
    check('…as its own canvas element on top of the app window', !!popupEl && popupEl.w === popup.p.w);
  }
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await trustedClickAt(p1, cx, cy);
  await until(async () => { const s = await p1.evalJs(WIN(appId)); return s && !s.windows.some((w) => w.kind === 'popup') ? true : null; }, 6000, 200);

  // ── (3) under the UI scale, at a THIRD size: net zoom 1, the pane's own px, pixels + the X pointer ──
  await p1.evalJs(`localStorage.setItem('vibespace.uiScale', '125'); true`);
  await openPage(p1, `http://127.0.0.1:${PORT}`);
  check(`the page boots under the UI scale (body zoom ${await p1.evalJs('document.body.style.zoom')})`, await p1.evalJs(`document.body.style.zoom === '1.25'`));
  const s3 = await ensureWin();
  check('the window is back (layout replay or re-open) under the UI scale', !!s3, s3);
  const [W3, H3] = [560, 460]; // layout px — 700×575 on screen at 1.25: a THIRD pane size, unlike the two above
  await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); w.element.style.left = '40px'; w.element.style.top = '20px'; w.element.style.width = '${W3}px'; w.element.style.height = '${H3}px'; if (w.onResize) w.onResize(); return true; })()`);
  const settled3 = await until(async () => { const s = await p1.evalJs(WIN(appId)); const m = s && s.windows.find((w) => w.kind === 'main'); return m && s.pane.w - m.w < 16 && s.pane.h - m.h < 24 && m.x === 0 && m.y === 0 ? s : null; }, 15000, 300);
  await sleep(1500);
  const zoom = await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const v = w._desktopAppView; const c = v.client; const el = v.pane.querySelector('.xpra-win-main canvas') || v.pane.querySelector('.xpra-win canvas'); const r = el.getBoundingClientRect(); const pr = v.pane.getBoundingClientRect(); return { canvas: { w: el.width, h: el.height }, onScreen: { w: r.width, h: r.height }, pane: { w: pr.width, h: pr.height, cw: v.pane.clientWidth, ch: v.pane.clientHeight }, screen: c.pane || null, uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() }; })()`);
  const m3 = await measurePane(p1, appId);
  console.log(`  UI scale ${zoom.uiScale}, window ${W3}×${H3} layout px: pane ${m3.pane.w}×${m3.pane.h} on screen (clientWidth ${zoom.pane.cw}×${zoom.pane.ch}), session screen ${JSON.stringify(zoom.screen)}, main canvas ${zoom.canvas.w}×${zoom.canvas.h} drawn ${zoom.onScreen.w.toFixed(1)}×${zoom.onScreen.h.toFixed(1)} on screen, ${m3.blackOut} black px of ${m3.out} outside the window, ${(m3.inBrightFrac * 100).toFixed(1)} % of the window non-black`);
  check(`UI scale: the pane is ${W3}×… layout px ⇒ ~1.25× on screen, and its own px ARE screen px (clientWidth ${zoom.pane.cw} == rect ${zoom.pane.w.toFixed(1)}) — the shell's counter-zoom`, zoom.uiScale === '1.25' && m3.pane.w > W3 * 1.1 && Math.abs(zoom.pane.cw - zoom.pane.w) <= 1 && Math.abs(zoom.pane.ch - zoom.pane.h) <= 1, zoom);
  check(`UI scale: the canvas sits at NET zoom 1 — ${zoom.canvas.w}×${zoom.canvas.h} canvas px drawn on ${zoom.onScreen.w.toFixed(1)}×${zoom.onScreen.h.toFixed(1)} screen px`, Math.abs(zoom.canvas.w - zoom.onScreen.w) <= 1 && Math.abs(zoom.canvas.h - zoom.onScreen.h) <= 1, zoom);
  check(`UI scale: the app window fills the pane at this third size (${m3.main && `${m3.main.w}×${m3.main.h}`} of ${m3.pane.w}×${m3.pane.h}) with ZERO black pixels outside it (${m3.blackOut} of ${m3.out})`, !!settled3 && !!m3.main && m3.main.x === 0 && m3.main.y === 0 && m3.pane.w - m3.main.w < 16 && m3.pane.h - m3.main.h < 24 && m3.blackOut === 0 && m3.inBrightFrac > 0.5, m3.main);
  const xw3 = await until(async () => { const r = await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`); const x = r.windows && r.windows[0]; return x && m3.pane.w - x.w < 16 && m3.pane.h - x.h < 24 ? x : null; }, 8000, 500);
  check(`UI scale: the X server's window follows the on-screen pane (X ${xw3 ? `${xw3.w}×${xw3.h}` : '?'} vs pane ${m3.pane.w}×${m3.pane.h})`, !!xw3, xw3);
  if (!XDOTOOL) skip('the X pointer under the UI scale', 'xdotool not on PATH');
  else {
    const st3 = await p1.evalJs(WIN(appId));
    const targets = [[137, 91], [Math.round(st3.pane.w * 0.8), Math.round(st3.pane.h * 0.7)]];
    for (const [px, py] of targets) {
      await p1.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: st3.pane.x + px, y: st3.pane.y + py });
      const loc = await until(() => { try { const o = execFileSync(XDOTOOL, ['getmouselocation'], { env: xenv, encoding: 'utf8', timeout: 4000 }); const m = /x:(\d+) y:(\d+)/.exec(o); if (!m) return null; const x = Number(m[1]), y = Number(m[2]); return Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1 ? { x, y } : null; } catch { return null; } }, 5000, 150);
      let last = null; try { last = execFileSync(XDOTOOL, ['getmouselocation'], { env: xenv, encoding: 'utf8', timeout: 4000 }).trim(); } catch {}
      console.log(`  pointer at pane (${px}, ${py}) screen px ⇒ X says ${last}`);
      check(`UI scale: a pointer at pane (${px}, ${py}) lands on X (${px}, ${py}) — never scaled by the zoom`, !!loc, last);
    }
  }

  // ── (4) THE BELT (2026-09-22, the verifier's 04-selfresize / 02-chrome / 05-calc): the APP resizing or moving its own
  // window is undone by the client (a bounded configure-window from the server's own geometry packets), and a second
  // top-level the app puts far off the screen is placed INSIDE the pane — the app stays the picture ──
  const mainNow = async () => { const s = await p1.evalJs(WIN(appId)); return s ? { s, m: s.windows.find((w) => w.kind === 'main') } : null; };
  const fitsPane = (x) => x && x.m && x.m.x === 0 && x.m.y === 0 && x.s.pane.w - x.m.w < 16 && x.s.pane.h - x.m.h < 24;
  if (!XDOTOOL) skip('the app resizing / moving itself', 'xdotool not on PATH');
  else {
    const xid = ((await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`)).windows || [])[0];
    const xOf = async (id) => { const ws = (await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`)).windows || []; return ws.find((w) => w.id === id) || null; };
    const xFits = async (pane) => { const w = await xOf(xid.id); return w && w.x === 0 && w.y === 0 && pane.w - w.w < 16 && pane.h - w.h < 24 ? w : null; };
    execFileSync(XDOTOOL, ['windowsize', String(xid.id), '300', '200'], { env: xenv, timeout: 5000 });
    const t4 = Date.now();
    const back = await until(async () => { const x = await mainNow(); return fitsPane(x) && (await xFits(x.s.pane)) ? x : null; }, 8000, 200);
    const xNow = await xOf(xid.id);
    console.log(`  the app resized itself to 300×200 ⇒ ${back ? `re-fitted in ${Date.now() - t4} ms: ${back.m.w}×${back.m.h} of ${back.s.pane.w}×${back.s.pane.h}` : 'NOT re-fitted'}; X says ${xNow && `${xNow.w}×${xNow.h}+${xNow.x}+${xNow.y}`}`);
    check('the app resizing ITSELF (xdotool windowsize 300×200 — it used to stay at 8 % of the pane) is fitted back to the pane, and X agrees', !!back, { client: (await mainNow())?.m, x: xNow });
    await sleep(700); // past the belt's 500 ms gap: a fresh correction
    execFileSync(XDOTOOL, ['windowmove', String(xid.id), '400', '300'], { env: xenv, timeout: 5000 });
    const atOrigin = await until(async () => { const x = await mainNow(); return fitsPane(x) && (await xFits(x.s.pane)) ? x : null; }, 8000, 200);
    const xm = await xOf(xid.id);
    check(`the app MOVING itself (xdotool windowmove 400,300 — the client used to follow it off the pane) is put back at 0,0 (X: ${xm && `${xm.x},${xm.y}`})`, !!atOrigin && xm && xm.x === 0 && xm.y === 0, { atOrigin: atOrigin && atOrigin.m, x: xm });
    // a second top-level of the app's own display far off the screen (xpra clamps it to 20×20 px visible): placed inside
    const second = spawn(XTERM, ['-T', 'vs-second-top', '-geometry', '40x10+2000+1500'], { env: xenv, stdio: 'ignore', detached: true }); xclipKids.push(second);
    const inside = await until(async () => { const s = await p1.evalJs(WIN(appId)); const w = s && s.windows.find((x) => x.title === 'vs-second-top'); return w && w.x >= 0 && w.y >= 0 && w.x + w.w <= s.pane.w && w.y + w.h <= s.pane.h ? { w, pane: s.pane } : null; }, 12000, 250);
    const xSecond = inside && ((await p1.evalJs(`fetch('/api/desktop/apps/${appId}/windows').then((r) => r.json())`)).windows || []).find((x) => x.title === 'vs-second-top');
    console.log(`  a second top-level at +2000+1500 ⇒ ${inside ? `${inside.w.w}×${inside.w.h} at ${inside.w.x},${inside.w.y} in ${inside.pane.w}×${inside.pane.h}` : 'NOT inside'}; X says ${xSecond && `+${xSecond.x}+${xSecond.y}`}`);
    check('a second top-level the app opened at +2000+1500 (kind main, not transient) is placed WHOLLY inside the pane, and X agrees', !!inside && !!xSecond && xSecond.x + xSecond.w <= inside.pane.w && xSecond.y + xSecond.h <= inside.pane.h, { inside, x: xSecond });
    const m4 = await mainNow();
    check('…the first window stays the main and the picture (the title bar keeps its title)', fitsPane(m4) && m4.s.title === 'vs-xpra-title', m4 && { m: m4.m, title: m4.s.title });
    try { process.kill(-second.pid, 'SIGKILL'); } catch {}
    await until(async () => { const s = await p1.evalJs(WIN(appId)); return s && !s.windows.some((x) => x.title === 'vs-second-top') ? true : null; }, 6000, 200);
  }
  // GNOME Calculator resizes its OWN window on a mode switch (measured by the verifier: 898×616 ⇒ 700×616 ⇒ 370×616, 40 % of
  // the pane, until the VibeSpace window was resized) — the belt must keep it the picture
  const CALC = bin('gnome-calculator');
  if (!CALC) skip('GNOME Calculator\'s mode switch', 'gnome-calculator not on PATH');
  else {
    const lc = await p1.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ exec: CALC, args: [], label: 'vs-calc' }))} }).then((r) => r.json())`);
    const calcId = lc && lc.id;
    const crec = calcId && await until(() => p1.evalJs(`fetch('/api/desktop/apps/${calcId}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 30000);
    await p1.evalJs(`app.openDesktopApp(${JSON.stringify(calcId)}); true`);
    const cc = crec && await until(async () => { const s = await p1.evalJs(WIN(calcId)); return s && s.status === 'Connected' && s.windows.some((w) => w.kind === 'main') ? s : null; }, 40000, 300);
    check('a GNOME Calculator session connects on the xpra rung', !!cc, cc || (crec && crec.lastError));
    if (cc) {
      await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(calcId)}); w.element.style.left = '60px'; w.element.style.top = '30px'; w.element.style.width = '720px'; w.element.style.height = '560px'; if (w.onResize) w.onResize(); return true; })()`);
      // coverage of the PANE by the main window, and the main never larger than the pane (a window bigger than the pane is cut, not "covering")
      const cov = async () => { const s = await p1.evalJs(WIN(calcId)); const m = s && s.windows.find((w) => w.kind === 'main'); return s && m ? { s, m, c: (m.w * m.h) / (s.pane.w * s.pane.h), within: m.w <= s.pane.w && m.h <= s.pane.h } : null; };
      const fitted = await until(async () => { const x = await cov(); return x && x.within && x.c >= 0.95 && x.m.x === 0 && x.m.y === 0 ? x : null; }, 15000, 300);
      check(`the calculator fills the pane (${fitted ? `${fitted.m.w}×${fitted.m.h} = ${(fitted.c * 100).toFixed(1)} %` : '?'} of ${fitted && `${fitted.s.pane.w}×${fitted.s.pane.h}`})`, !!fitted, (await cov()) && { m: (await cov()).m, pane: (await cov()).s.pane });
      const cs = await p1.evalJs(WIN(calcId));
      await trustedClickAt(p1, cs.pane.x + cs.pane.w / 2, cs.pane.y + 12);
      await sleep(400);
      for (const [key, code, vk] of [['a', 'KeyA', 65], ['b', 'KeyB', 66]]) {
        await p1.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers: 3 });
        await p1.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers: 3 });
        await sleep(2500);
        const x = await until(async () => { const v = await cov(); return v && v.within && v.c >= 0.95 && v.m.x === 0 && v.m.y === 0 ? v : null; }, 6000, 250);
        const last = x || await cov();
        const cws = (await p1.evalJs(`fetch('/api/desktop/apps/${calcId}/windows').then((r) => r.json())`)).windows || [];
        const xw = (last && cws.find((w) => w.id === last.m.wid)) || cws.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
        console.log(`  Ctrl+Alt+${key.toUpperCase()} (the calculator's mode switch): main ${last && `${last.m.w}×${last.m.h}+${last.m.x}+${last.m.y}`} = ${last ? (last.c * 100).toFixed(1) : '?'} % of the pane; X says ${xw && `${xw.w}×${xw.h}+${xw.x}+${xw.y}`}`);
        check(`after Ctrl+Alt+${key.toUpperCase()} the calculator still covers ≥ 95 % of the pane and X agrees (it used to drop to 75.9 % then 40.1 %)`, !!x && !!xw && Math.abs(xw.w - x.m.w) <= 8 && Math.abs(xw.h - x.m.h) <= 8, { client: last && last.m, x: xw, all: cws.map((w) => [w.id, w.title, `${w.w}x${w.h}+${w.x}+${w.y}`]) });
      }
    }
    if (calcId) await p1.evalJs(`fetch('/api/desktop/apps/${calcId}/stop', { method: 'POST' }).then((r) => r.status)`);
  }

  // ── (5) x5 — ONE ACTIVE VIEWER (docs/design-desktop-apps §7 P8-2 "x5 多客户端 = 单活跃 viewer"; the owner's ruling
  // "直接block掉非active客户端的app界面…" + "仿照terminal…可以手动take over"): two headless pages with DIFFERENT pane sizes on
  // one xpra app — the first is active and its pane IS the app's geometry; the second shows the overlay, its resize and its
  // keys reach nothing; Resume here moves the app to the second pane within 2 s and blocks the first; the survivor stays
  // active when the other closes; an agent's lease makes everybody Watch (picture scaled to fit, typing refused) ──
  console.log('§5 x5 — one active viewer, two pages of different sizes on one xpra app');
  await p1.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`);
  await openPage(p1, `http://127.0.0.1:${PORT}`);
  const x5File = path.join(fakeHome, 'x5.txt');
  // LOW-2 (2.369.156): the app's OWN title is HOSTILE — markup and quotes, which the overlay must show as TEXT, never as the launch label
  const X5_TITLE = 'vs-x5 <b>"t"</b> & <i>x</i>';
  const l5 = await p1.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ exec: XTERM, args: ['-T', X5_TITLE, '-geometry', '80x24', '-e', 'sh', '-c', `cat > ${x5File}`], label: 'vs-x5' }))} }).then((r) => r.json())`);
  const id5 = l5 && l5.id;
  const r5 = id5 && await until(() => p1.evalJs(`fetch('/api/desktop/apps/${id5}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 30000);
  check('a second xterm session for the x5 legs reaches ready on the xpra rung', !!r5 && r5.backend === 'xpra', r5 || l5);
  const xMain5 = async (p) => { const ws = (await p.evalJs(`fetch('/api/desktop/apps/${id5}/windows').then((r) => r.json())`)).windows || []; return ws.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] || null; };
  const fitsX = (x, pane) => !!x && !!pane && x.w <= pane.w + 1 && x.h <= pane.h + 1 && pane.w - x.w < 16 && pane.h - x.h < 24;
  const typeOn = async (p, text) => { for (const ch of text) { const k = keyOf(ch); await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); } await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); };
  const fileHas = (s) => { try { return fs.readFileSync(x5File, 'utf8').includes(s); } catch { return false; } };
  const sizeWin = (p, W, H) => p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id5)}); app.wm.focusWindow(w.id); w.element.style.left = '30px'; w.element.style.top = '20px'; w.element.style.width = '${W}px'; w.element.style.height = '${H}px'; if (w.onResize) w.onResize(); return true; })()`);
  const focusPane = async (p) => { const s = await p.evalJs(SEAT(id5)); await trustedClickAt(p, s.pane.x + s.pane.w / 2, s.pane.y + s.pane.h / 2); await sleep(250); return s; };
  const newPage = async () => { const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json(); const p = await page(t); await openPage(p, `http://127.0.0.1:${PORT}`); return { p, t }; };
  const closePage = async (x) => { x.p.close(); await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${x.t.id}`); };
  const replayed = async (p) => { const has = await until(() => p.evalJs(`!!${SEAT(id5)}`), 15000, 250); if (!has) await p.evalJs(`app.openDesktopApp(${JSON.stringify(id5)}); true`); return until(() => p.evalJs(SEAT(id5)), 10000, 200); };
  if (r5) {
    await p1.evalJs(`app.openDesktopApp(${JSON.stringify(id5)}); true`);
    await sizeWin(p1, 700, 500);
    const a1 = await until(async () => { const s = await p1.evalJs(SEAT(id5)); return s && s.status === 'Connected' && s.mode === 'active' && s.windows.length ? s : null; }, 30000, 250);
    const xA = a1 && await until(async () => { const x = await xMain5(p1); return fitsX(x, a1.pane) ? x : null; }, 10000, 300);
    check(`A (first to attach) is ACTIVE and the app follows A's pane (X ${xA && `${xA.w}×${xA.h}`} in pane ${a1 && `${a1.pane.w}×${a1.pane.h}`})`, !!a1 && !!xA && a1.seats && a1.seats.active === a1.paneKey, a1 && { seats: a1.seats, x: await xMain5(p1) });
    await focusPane(p1); await typeOn(p1, 'a1');
    check('A types and the app gets it (xterm\'s cat wrote "a1")', !!(await until(() => fileHas('a1\n'), 8000, 200)));
    // B: a second page, a DIFFERENT pane size
    const B = await newPage();
    const b0 = await replayed(B.p);
    const bFirst = await until(async () => { const s = await B.p.evalJs(SEAT(id5)); return s && s.mode === 'blocked' && s.overlay && s.overlay.shown ? s : null; }, 15000, 250);
    // …and B RESIZES its window while blocked (a real change after it attached: 820×560, neither A's size nor the default)
    if (bFirst) await sizeWin(B.p, 820, 560);
    const bBlocked = bFirst && await until(async () => { const s = await B.p.evalJs(SEAT(id5)); return s && s.mode === 'blocked' && s.overlay && s.overlay.shown && Math.abs(s.pane.w - bFirst.pane.w) > 20 ? s : null; }, 5000, 200);
    check(`B attaches while A is active ⇒ B shows the overlay: "${bBlocked && bBlocked.overlay.msg}" + "${bBlocked && bBlocked.overlay.title}" + Resume here, and NO picture (${bBlocked ? bBlocked.windows.length : '?'} windows, ${bBlocked ? bBlocked.stageEls.length : '?'} canvases)`, !!bBlocked && bBlocked.overlay.msg === 'Active on another client' && bBlocked.overlay.title === bBlocked.title.replace(/ — agent window$/, '') && bBlocked.overlay.btn && bBlocked.overlay.btn.w > 0 && bBlocked.windows.length === 0 && bBlocked.stageEls.length === 0, bBlocked || (await B.p.evalJs(SEAT(id5))) || b0);
    const bTitled = await until(async () => { const s = await B.p.evalJs(SEAT(id5)); return s && s.overlay && s.overlay.title === X5_TITLE ? s : null; }, 5000, 200);
    check(`LOW-2: the blocked overlay names the APP'S OWN title (${JSON.stringify(bTitled ? bTitled.overlay.title : (await B.p.evalJs(SEAT(id5)))?.overlay?.title)}), never the launch label "vs-x5" — as TEXT (${bTitled ? bTitled.overlay.titleKids : '?'} child elements for its <b>/<i>), the title bar the same`, !!bTitled && bTitled.overlay.titleKids === 0 && bTitled.title === X5_TITLE, bTitled || (await B.p.evalJs(SEAT(id5))));
    await sleep(2500);
    const xAfterB = await xMain5(p1);
    const aNow = await p1.evalJs(SEAT(id5));
    check(`B's pane (${bBlocked && `${bBlocked.pane.w}×${bBlocked.pane.h}`}) changes NOTHING: X stays on A's pane (${xAfterB && `${xAfterB.w}×${xAfterB.h}`} in ${aNow.pane.w}×${aNow.pane.h}) 2.5 s after B attached and resized`, fitsX(xAfterB, aNow.pane) && aNow.mode === 'active', { x: xAfterB, a: aNow.pane, b: bBlocked && bBlocked.pane });
    await B.p.cdp('Page.bringToFront');
    await trustedClickAt(B.p, bBlocked.pane.x + bBlocked.pane.w / 2, bBlocked.pane.y + bBlocked.pane.h / 3);
    await typeOn(B.p, 'zz');
    await sleep(1500);
    check('B\'s keys never reach the app ("zz" is not in the app\'s file)', !fileHas('zz'), fs.existsSync(x5File) ? JSON.stringify(fs.readFileSync(x5File, 'utf8')) : 'no file');
    // Resume here on B (a trusted click on the button)
    await B.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id5)}); app.wm.focusWindow(w.id); return true; })()`);
    const bs = await B.p.evalJs(SEAT(id5));
    const tR = Date.now();
    await trustedClickAt(B.p, bs.overlay.btn.x + bs.overlay.btn.w / 2, bs.overlay.btn.y + bs.overlay.btn.h / 2);
    const bActive = await until(async () => { const s = await B.p.evalJs(SEAT(id5)); const x = await xMain5(B.p); return s && s.mode === 'active' && fitsX(x, s.pane) ? { s, x } : null; }, 5000, 100);
    const resumeMs = Date.now() - tR;
    console.log(`  Resume here on B ⇒ ${bActive ? `X ${bActive.x.w}×${bActive.x.h} in B's pane ${bActive.s.pane.w}×${bActive.s.pane.h} after ${resumeMs} ms` : 'X never followed B'}`);
    check(`Resume here on B ⇒ the app's geometry is B's pane within 2 s (${resumeMs} ms; X ${bActive && `${bActive.x.w}×${bActive.x.h}`})`, !!bActive && resumeMs <= 2000, { b: await B.p.evalJs(SEAT(id5)), x: await xMain5(B.p) });
    const aBlocked = await until(async () => { const s = await p1.evalJs(SEAT(id5)); return s && s.mode === 'blocked' && s.overlay && s.overlay.shown && !s.windows.length && !s.stageEls.length ? s : null; }, 5000, 200);
    check('…and A now shows the overlay (blocked, no picture: its cut session is gone, no window, no canvas)', !!aBlocked, aBlocked || (await p1.evalJs(SEAT(id5))));
    check(`LOW-2: A's overlay after the cut names the app's own title too (${JSON.stringify(aBlocked && aBlocked.overlay.title)}), as text`, !!aBlocked && aBlocked.overlay.title === X5_TITLE && aBlocked.overlay.titleKids === 0, aBlocked && aBlocked.overlay);
    await until(async () => { const s = await B.p.evalJs(SEAT(id5)); return s && s.status === 'Connected' && s.windows.length ? s : null; }, 8000, 200);
    await focusPane(B.p); await typeOn(B.p, 'b2');
    check('B types now and the app gets it ("b2")', !!(await until(() => fileHas('b2\n'), 8000, 200)));
    // A closes ⇒ B stays active
    const A1 = { p: p1, t: target };
    await closePage(A1);
    await sleep(1500);
    const bStill = await B.p.evalJs(SEAT(id5));
    check('A closes ⇒ B STAYS active (its pane key is the active one, still connected)', bStill && bStill.mode === 'active' && bStill.seats && bStill.seats.active === bStill.paneKey && bStill.status === 'Connected', bStill);
    // B closes, A reopens ⇒ A active
    await closePage(B);
    await sleep(800);
    const A2 = await newPage();
    await replayed(A2.p);
    const a2 = await until(async () => { const s = await A2.p.evalJs(SEAT(id5)); return s && s.mode === 'active' && s.status === 'Connected' && s.windows.length ? s : null; }, 20000, 250);
    check('B closes, A reopens ⇒ A is active again (the only viewer) and connected', !!a2 && a2.seats && a2.seats.active === a2.paneKey, a2 || (await A2.p.evalJs(SEAT(id5))));
    p1 = A2.p; // the suite's page from here on
    // an AGENT holds the window (the engine's lease, through the agent API of a live fake-claude session): everybody Watch
    let token = null;
    if (!fs.existsSync(FAKE_CLAUDE)) skip('the agent-held legs', 'no fake claude');
    else {
      const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
      await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
      wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: fakeHome, cols: 80, rows: 24, reqId: 'x5a', name: 'x5-agent' }));
      const created = await until(() => msgs.find((m) => m.type === 'created' && m.reqId === 'x5a'), 20000, 100);
      token = created && await until(() => { for (const f of fs.readdirSync(path.join(wt, 'data', 'session-meta'))) { try { const j = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'session-meta', f), 'utf8')); if (j.agentToken && j.webuiSessionId === created.sessionId) return j.agentToken; } catch {} } return null; }, 10000, 200);
      agentTokens.push(token);
      check('a live agent session (fake claude) with its vsst_ token', !!created && !!token && /^vsst_/.test(token), created);
      wsMain.close();
      const agent = (verb, body) => fetch(`http://127.0.0.1:${PORT}/api/agent/window/${verb}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
      const at = token ? await agent('attach', { handle: id5 }) : null;
      check(`the agent attaches to the window (lease ${at && at.j && at.j.lease && at.j.lease.input})`, !!at && at.status === 200 && at.j.lease && at.j.lease.input === 'agent', at);
      const D = await newPage();
      await replayed(D.p);
      await sizeWin(D.p, 520, 380);
      await sizeWin(p1, 1080, 700); // LARGER than the app (INFO b, 2.369.156): the Watch picture must stay 1:1 there, centred — never blown up
      const both = await until(async () => { const a = await p1.evalJs(SEAT(id5)); const d = await D.p.evalJs(SEAT(id5)); return a && d && a.mode === 'watch' && d.mode === 'watch' && a.windows.length && d.windows.length && a.stageEls.length && d.stageEls.length ? { a, d } : null; }, 20000, 250);
      check('an agent DRIVES the window ⇒ BOTH pages are Watch with the picture (no overlay, the windows drawn)', !!both && !both.a.overlay.shown && !both.d.overlay.shown, both || { a: await p1.evalJs(SEAT(id5)), d: await D.p.evalJs(SEAT(id5)) });
      if (both) {
        await sleep(1500);
        const xW = await xMain5(p1);
        const d = await D.p.evalJs(SEAT(id5));
        const want = Math.min(d.pane.w / Math.max(...d.windows.filter((w) => w.kind !== 'popup').map((w) => w.x + w.w)), d.pane.h / Math.max(...d.windows.filter((w) => w.kind !== 'popup').map((w) => w.y + w.h)));
        const el = d.stageEls[0];
        console.log(`  Watch on D: X ${xW && `${xW.w}×${xW.h}`}, D's pane ${d.pane.w}×${d.pane.h}, stage scale ${d.scale.toFixed(3)} (fit ${want.toFixed(3)}), the canvas drawn ${el.w.toFixed(0)}×${el.h.toFixed(0)} at ${(el.x - d.pane.x).toFixed(0)},${(el.y - d.pane.y).toFixed(0)}`);
        check(`Watch: the picture is SCALED to fit D's pane (scale ${d.scale.toFixed(3)} = the fit ${want.toFixed(3)}), never cropped: the canvas (${el.w.toFixed(0)}×${el.h.toFixed(0)}) lies inside the pane and fills it one way`, Math.abs(d.scale - want) < 0.01 && d.scale < 1 && el.x >= d.pane.x - 1 && el.y >= d.pane.y - 1 && el.x + el.w <= d.pane.x + d.pane.w + 1 && el.y + el.h <= d.pane.y + d.pane.h + 1 && (Math.abs(el.w - d.pane.w) <= 2 || Math.abs(el.h - d.pane.h) <= 2), { d, want });
        const md = await measurePane(D.p, id5);
        check(`Watch: the picture is VISIBLE on D (${(md.inBrightFrac * 100).toFixed(0)} % of the drawn window non-black — xterm's white page)`, md.inBrightFrac > 0.5, md);
        check(`Watch: D's smaller pane and A's resize to 1080×700 change nothing — X stays ${xA && `${xA.w}×${xA.h}`}-sized (${xW && `${xW.w}×${xW.h}`}, the geometry A2 set before the agent attached)`, !!xW && !!a2 && fitsX(xW, a2.pane), { x: xW, a2: a2.pane });
        // A's page is a BACKGROUND tab here (D opened last): chrome runs no rendering steps there, so the view's ResizeObserver
        // (the stage's re-fit after the 1080×700 resize) waits for the tab to be shown — bring it to front, then read
        await p1.cdp('Page.bringToFront');
        const centred = (s) => { const e = s && s.stageEls[0]; return !!e && Math.abs((e.x - s.pane.x) - (s.pane.x + s.pane.w - (e.x + e.w))) <= 2; };
        const a = (await until(async () => { const s = await p1.evalJs(SEAT(id5)); return centred(s) ? s : null; }, 5000, 200)) || (await p1.evalJs(SEAT(id5)));
        const ae = a && a.stageEls[0];
        const gapL = ae ? ae.x - a.pane.x : NaN, gapR = ae ? a.pane.x + a.pane.w - (ae.x + ae.w) : NaN, gapT = ae ? ae.y - a.pane.y : NaN, gapB = ae ? a.pane.y + a.pane.h - (ae.y + ae.h) : NaN;
        console.log(`  Watch on A (pane ${a && `${a.pane.w}×${a.pane.h}`} > X ${xW && `${xW.w}×${xW.h}`}): stage scale ${a && a.scale}, the canvas ${ae && `${ae.w.toFixed(0)}×${ae.h.toFixed(0)}`}, gaps L${gapL.toFixed(0)} R${gapR.toFixed(0)} T${gapT.toFixed(0)} B${gapB.toFixed(0)}`);
        const mw = a && a.windows.find((w) => w.kind !== 'popup');
        check(`INFO b: on a pane LARGER than the app the Watch picture is NOT upscaled (scale ${a && a.scale}; the uncapped fit would be ${a && mw ? Math.min(a.pane.w / mw.w, a.pane.h / mw.h).toFixed(3) : '?'}) — the canvas is the window's own size ${mw && `${mw.w}×${mw.h}`}, 1:1 (X ${xW && `${xW.w}×${xW.h}`}), centred (gaps L/R ${gapL.toFixed(0)}/${gapR.toFixed(0)}, T/B ${gapT.toFixed(0)}/${gapB.toFixed(0)})`, !!a && !!ae && !!mw && a.scale === 1 && Math.min(a.pane.w / mw.w, a.pane.h / mw.h) > 1 && Math.abs(ae.w - mw.w) <= 1 && Math.abs(ae.h - mw.h) <= 1 && Math.abs(gapL - gapR) <= 2 && Math.abs(gapT - gapB) <= 2 && gapL > 20, { a, xW });
        for (const P2 of [p1, D.p]) { await P2.cdp('Page.bringToFront'); await focusPane(P2); await typeOn(P2, 'ww'); }
        await sleep(1500);
        check('Watch: typing on EITHER page is refused ("ww" never reaches the app)', !fileHas('ww'), JSON.stringify(fs.readFileSync(x5File, 'utf8')));
      }
      const dt = await agent('detach', { handle: id5 });
      check('the agent detaches (the lease ends)', dt.status === 200, dt);
      await closePage(D);
    }
    // CONTROL — THE PRE-x5 SERVER: a scratch copy of this worktree whose window-live wiring hands the bridge NO seats (the
    // bridge then relays every socket and nobody is ever elected, so every pane reads itself active — the code before x5).
    // Two pages of different sizes on one xterm there: the second page's pane takes the app away from the first.
    const wtc = scratch('deskxpra-x5ctl');
    try { execSync(`git worktree remove --force ${wtc}`, { cwd: repo, stdio: 'ignore' }); } catch {}
    execSync(`git worktree add --detach ${wtc} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtc);
    for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wtc}/${f} && cp -r ${wt}/${f} ${wtc}/${f}`);
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtc, 'node_modules'));
    fs.mkdirSync(path.join(wtc, 'data'), { recursive: true });
    const wiring = fs.readFileSync(path.join(wtc, 'src/server/window-live-wiring.js'), 'utf8');
    const seatsAt = '    viewerSeats: { // x5:';
    check('CONTROL: the wiring hands the bridge its seats exactly once (the control removes exactly that)', wiring.split(seatsAt).length === 2);
    fs.writeFileSync(path.join(wtc, 'src/server/window-live-wiring.js'), wiring.replace(seatsAt, '    viewerSeatsPreX5: { // pre-x5 CONTROL:'));
    const [PORTC] = await freePorts(1);
    const homeC = scratchHome('deskxpra-x5ctl-home', fs);
    const sc = spawn(process.execPath, ['server.js'], { cwd: wtc, env: { ...srvEnv, PORT: String(PORTC), HOME: homeC }, stdio: 'ignore' }); ctlServers.push(sc);
    let upC = false; for (let i = 0; i < 80 && !upC; i++) { try { await fetch(`http://127.0.0.1:${PORTC}/api/home`); upC = true; } catch { await sleep(250); } }
    check('CONTROL: the pre-x5 copy boots', upC);
    if (upC) {
      const ctlPage = async () => { const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json(); const p = await page(t); await openPage(p, `http://127.0.0.1:${PORTC}`); return { p, t }; };
      const CA = await ctlPage();
      const lc = await CA.p.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ exec: XTERM, args: ['-T', 'vs-x5-ctl', '-geometry', '80x24'], label: 'vs-x5-ctl' }))} }).then((r) => r.json())`);
      const idc = lc && lc.id;
      const rc = idc && await until(() => CA.p.evalJs(`fetch('/api/desktop/apps/${idc}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 30000);
      const xMainC = async () => { const ws = (await CA.p.evalJs(`fetch('/api/desktop/apps/${idc}/windows').then((r) => r.json())`)).windows || []; return ws.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] || null; };
      const sizeC = (p, W, H) => p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(idc)}); app.wm.focusWindow(w.id); w.element.style.left = '30px'; w.element.style.top = '20px'; w.element.style.width = '${W}px'; w.element.style.height = '${H}px'; if (w.onResize) w.onResize(); return true; })()`);
      if (rc) {
        await CA.p.evalJs(`app.openDesktopApp(${JSON.stringify(idc)}); true`);
        await sizeC(CA.p, 700, 500);
        const ca = await until(async () => { const s = await CA.p.evalJs(SEAT(idc)); const x = await xMainC(); return s && s.status === 'Connected' && fitsX(x, s.pane) ? s : null; }, 30000, 300);
        const CB = await ctlPage();
        const hasB = await until(() => CB.p.evalJs(`!!${SEAT(idc)}`), 15000, 250); if (!hasB) await CB.p.evalJs(`app.openDesktopApp(${JSON.stringify(idc)}); true`);
        await until(async () => { const s = await CB.p.evalJs(SEAT(idc)); return s && s.status === 'Connected' ? s : null; }, 20000, 250);
        await sizeC(CB.p, 820, 560); // the same real change as the x5 leg's B
        await sleep(3000);
        const xc = await xMainC();
        const cb = await CB.p.evalJs(SEAT(idc));
        console.log(`  CONTROL (pre-x5): A's pane ${ca && `${ca.pane.w}×${ca.pane.h}`}, B's pane ${cb && cb.pane && `${cb.pane.w}×${cb.pane.h}`}, X ${xc && `${xc.w}×${xc.h}`} 3 s after B resized; B's mode ${cb && cb.mode}, overlay ${cb && cb.overlay && cb.overlay.shown}`);
        check('CONTROL: through the pre-x5 server the second page is NOT blocked and its pane TAKES the app away from the first (X no longer fits A\'s pane — the leg "B\'s pane changes nothing" fails there)', !!ca && !!cb && cb.overlay && !cb.overlay.shown && !fitsX(xc, ca.pane), { a: ca && ca.pane, b: cb && cb.pane, x: xc });
        await closePage(CB);
        await CA.p.evalJs(`fetch('/api/desktop/apps/${idc}/stop', { method: 'POST' }).then((r) => r.status)`);
      } else check('CONTROL: an xterm reaches ready on the pre-x5 copy', false, lc);
      await closePage(CA);
    }
    try { sc.kill('SIGKILL'); } catch {}
  }

  if (typeof id5 === 'string' && id5) await p1.evalJs(`fetch('/api/desktop/apps/${id5}/stop', { method: 'POST' }).then((r) => r.status)`);
  check('the first app\'s window is on the current page again (layout replay after §5\'s page swap)', !!(await ensureWin()));
  // ── Stop from the window ──
  await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); w.content.querySelector('.desktop-app-stop').click(); return true; })()`);
  const ended = await until(async () => { const s = await p1.evalJs(WIN(appId)); return s && s.status === 'Stopped' ? s : null; }, 15000);
  check('Stop ⇒ the window says "Stopped"', !!ended, ended);
  await sleep(600);
  check('Stop leaves no xpra / Xvfb / xterm behind (every recorded pid gone)', [rec.pids.x, rec.pids.server, rec.pids.app].every((p) => !D.pidAlive(p)));
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
  console.error('  server log tail:', srvLog.join('').split('\n').slice(-12).join('\n  '));
  console.error('  page console tail:', p1.logs.slice(-12));
} finally {
  p1.close();
}
// ── THE REAL HOME IS UNTOUCHED (census (c)): not "no new entry" — this box runs real
// sessions concurrently — but no FIXTURE entry, the class this suite could have written.
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  check(`the real ~/.claude/projects gained no fixture entry (${added.length} new entr${added.length === 1 ? 'y' : 'ies'} from concurrent real sessions, 0 of them fixtures)`,
    lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
}
console.log(failed ? `\n${failed} FAILED${skipped ? ` (${skipped} skipped)` : ''}` : `\ndesktop-xpra window test passed${skipped ? ` (${skipped} skipped)` : ''}`);
process.exit(failed ? 1 : 0);
