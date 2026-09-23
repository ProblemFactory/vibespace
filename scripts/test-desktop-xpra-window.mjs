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
  try { fs.rmSync(scratch('deskxpra-hidpictl-home'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(scratch('deskxpra-r2ctl-home'), { recursive: true, force: true }); } catch {}
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

  // ── (6) HiDPI + THE APP'S MINIMUM (2.369.158, docs/design-desktop-apps.zh.md §7.6; the owner on a devicePixelRatio-2
  // screen with GNOME Calculator: "the DPI is way too low", the keypad's lower rows cut off, "this still looks like VNC"):
  // a headless page at deviceScaleFactor 2 on OUR server, and the SAME legs on a CONTROL copy of this tree carrying the
  // pre-fix behaviour (the view's ratio pinned to 1, the app's scale pinned to 1, `size-constraints` not asked for) ──
  // the raw handles + the pixel-for-pixel identity measure §6 and §7 share (r2)
  const R2 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const v = w._desktopAppView; if (!v || !v.pane) return null; const pr = v.pane.getBoundingClientRect(); const c = v.client; const main = c && c.windows.get(c.mainWid); const cv = v.pane.querySelector('.xpra-win-main canvas'); const cr = cv ? cv.getBoundingClientRect() : null; const er = w.element.getBoundingClientRect(); const ws = app.wm.workspace.getBoundingClientRect(); return { status: v.status.textContent, mode: v.mode, pane: { x: pr.x, y: pr.y, w: pr.width, h: pr.height }, main: main ? { x: main.x, y: main.y, w: main.w, h: main.h } : null, ratio: v.ratio, minSize: v.minSize, scale: v.stageScale, offset: v.stageOffset, transform: v.stage.style.transform, badge: v.fitBadge ? { shown: v.fitBadge.style.display !== 'none', text: v.fitBadge.textContent } : { shown: false, text: '' }, canvas: cv ? { w: cv.width, h: cv.height, rw: cr.width, rh: cr.height, rx: cr.x, ry: cr.y } : null, win: { x: er.x, y: er.y, w: er.width, h: er.height }, workspace: { x: ws.x, y: ws.y, w: ws.width, h: ws.height }, constraints: c ? c.mainConstraints : null, display: c ? c.display : null, lastReceived: c ? c.lastReceived : null }; })()`;
  // the digit keys of GNOME Calculator's basic keypad, found in the canvas BACKING (device px): dark glyph components on the digit-key grey
  const DIGITS7 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const cv = w._desktopAppView.pane.querySelector('.xpra-win-main canvas'); const main = w._desktopAppView.client.windows.get(w._desktopAppView.client.mainWid); const W = Math.min(cv.width, main.w), H = Math.min(cv.height, main.h); const d = cv.getContext('2d').getImageData(0, 0, W, H).data; const g = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) g[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3; const seen = new Uint8Array(W * H); const blobs = []; const y0 = Math.floor(H * 0.45); const st = []; for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (seen[i] || g[i] >= 110) continue; let x0 = x, x1 = x, ya = y, yb = y, n = 0; st.push(i); seen[i] = 1; while (st.length) { const j = st.pop(); n++; const jx = j % W, jy = (j - jx) / W; if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < ya) ya = jy; if (jy > yb) yb = jy; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = jx + dx, ny = jy + dy; if (nx < 0 || ny < y0 || nx >= W || ny >= H) continue; const k = ny * W + nx; if (!seen[k] && g[k] < 110) { seen[k] = 1; st.push(k); } } } const bh = yb - ya + 1, bw = x1 - x0 + 1; if (bh < H * 0.008 || bh > H * 0.06 || bw > W * 0.08 || n < 20) continue; const cy = Math.round((ya + yb) / 2); const L = g[cy * W + Math.max(0, x0 - Math.round(bh * 0.6))], R = g[cy * W + Math.min(W - 1, x1 + Math.round(bh * 0.6))]; if (!(L >= 196 && L <= 216 && R >= 196 && R <= 216)) continue; blobs.push({ cx: (x0 + x1) / 2, cy: (ya + yb) / 2, h: bh }); } const rows = []; for (const b of blobs.sort((a, b) => a.cy - b.cy)) { const row = rows.find((r) => Math.abs(r[0].cy - b.cy) < b.h); if (row) row.push(b); else rows.push([b]); } for (const r of rows) r.sort((a, b) => a.cx - b.cx); return rows.filter((r) => r.length === 3 || r.length === 1).slice(-4).map((r) => r.map((b) => ({ cx: b.cx, cy: b.cy }))); })()`;
  const copyBack7 = async (p, id, prev) => {
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 });
    return (await until(async () => { const v = await p.evalJs(R2(id)); return v && v.lastReceived && v.lastReceived !== prev ? v.lastReceived : null; }, 6000, 200)) || '';
  };
  /** every digit key clicked through the page (the stage's offset + scale, the ratio), then the calculator's own copy read back */
  const allDigits7 = async (p, id) => {
    const s = await p.evalJs(R2(id));
    const rows = await p.evalJs(DIGITS7(id));
    const order = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['0']];
    let want = '';
    if (rows.length === 4) for (let i = 0; i < 4; i++) for (let j = 0; j < order[i].length; j++) { const q = rows[i][j]; if (!q) continue; await trustedClickAt(p, s.pane.x + s.offset.x + (q.cx / s.ratio) * s.scale, s.pane.y + s.offset.y + (q.cy / s.ratio) * s.scale); await sleep(400); want += order[i][j]; }
    const got = await copyBack7(p, id, s.lastReceived);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    return { want, got, rows: rows.length };
  };
  /** the canvas vs the screen, pixel for pixel: a FULL screenshot (device px — no clip resampling), the canvas read before and
   *  after it (a pixel xpra repainted in between is not counted), compared at the canvas's device origin (best of ±1 px) */
  const identity7 = async (p, id, dpr) => {
    const v = await p.evalJs(R2(id));
    const cw = Math.min(v.canvas.w, v.main.w, Math.floor(v.pane.w * dpr)) - 4, chh = Math.min(v.canvas.h, v.main.h, Math.floor(v.pane.h * dpr)) - 4;
    const px = (x, y, w, h) => p.evalJs(`(() => { const ww = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const cv = ww._desktopAppView.pane.querySelector('.xpra-win-main canvas'); const d = cv.getContext('2d').getImageData(${x}, ${y}, ${w}, ${h}).data; const g = new Array(${w} * ${h}); for (let i = 0; i < g.length; i++) g[i] = Math.round((d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3); return g; })()`);
    const c0 = await px(2, 2, cw, chh);
    const shot = await p.cdp('Page.captureScreenshot', { format: 'png' });
    const c1 = await px(2, 2, cw, chh);
    const sg = await p.evalJs(`(async () => { const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.data)}; await img.decode(); const W = img.naturalWidth, H = img.naturalHeight; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, W, H).data; const g = new Array(W * H); for (let i = 0; i < W * H; i++) g[i] = Math.round((d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3); return { W, g }; })()`);
    const X0 = Math.round((v.canvas.rx + 2 / dpr) * dpr), Y0 = Math.round((v.canvas.ry + 2 / dpr) * dpr);
    let best = null;
    for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
      let diff = 0, n = 0;
      for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) { const i = y * cw + x; if (c0[i] !== c1[i]) continue; n++; if (Math.abs(c1[i] - sg.g[(Y0 + dy + y) * sg.W + X0 + dx + x]) > 2) diff++; }
      if (!best || diff / n < best.frac) best = { dx, dy, diff, n, frac: diff / n };
    }
    return { ...best, transform: v.transform, scale: v.scale, badge: !!(v.badge && v.badge.shown), box: [v.canvas.rw, v.canvas.rh], backing: [v.canvas.w, v.canvas.h], main: v.main && [v.main.w, v.main.h] };
  };
  console.log('§6 HiDPI + the app\'s minimum — a deviceScaleFactor-2 page, xterm + GNOME Calculator, our server vs the pre-fix control');
  const CALC6 = bin('gnome-calculator');
  const HI = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const v = w._desktopAppView; if (!v || !v.pane) return null; const pr = v.pane.getBoundingClientRect(); const c = v.client; const main = c && c.windows.get(c.mainWid); const cv = v.pane.querySelector('.xpra-win-main canvas'); const cr = cv ? cv.getBoundingClientRect() : null; const er = w.element.getBoundingClientRect(); const chip = w.content.querySelector('.desktop-app-chip-scale'); return { dpr: devicePixelRatio, status: v.status.textContent, pane: { x: pr.x, y: pr.y, w: pr.width, h: pr.height }, main: main ? { x: main.x, y: main.y, w: main.w, h: main.h } : null, constraints: c ? c.mainConstraints : null, ratio: v.ratio, minSize: v.minSize, scale: v.stageScale, offset: v.stageOffset, badge: v.fitBadge ? { shown: v.fitBadge.style.display !== 'none', text: v.fitBadge.textContent } : null, canvas: cv ? { w: cv.width, h: cv.height, rw: cr.width, rh: cr.height, rx: cr.x, ry: cr.y } : null, win: { w: er.width, h: er.height, minW: w.minWidth, minH: w.minHeight }, chip: chip ? { shown: chip.style.display !== 'none', text: chip.textContent, title: chip.title } : null, backendTitle: (w.content.querySelector('.desktop-app-chip-backend') || {}).title || '' }; })()`;
  const mkPage = async (origin, metrics) => { const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json(); const p = await page(t); await p.cdp('Emulation.setDeviceMetricsOverride', metrics); await p.cdp('Emulation.setFocusEmulationEnabled', { enabled: true }); await openPage(p, origin); return { p, t }; };
  const dropPage = async (x) => { if (!x || x.dropped) return; x.dropped = true; x.p.close(); try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${x.t.id}`); } catch {} };
  /** x5: a page that replayed the window later than another client is BLOCKED — make THIS pane the active one (Resume here) */
  const ensureActive = async (p, id) => {
    const s = await until(async () => { const v = await p.evalJs(SEAT(id)); return v && v.seats && v.seats.known ? v : null; }, 10000, 250);
    if (s && s.seats.active === s.paneKey) return true;
    await p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const b = w && w.content.querySelector('.desktop-app-resume'); if (b) b.click(); return true; })()`);
    return !!(await until(async () => { const v = await p.evalJs(SEAT(id)); return v && v.seats && v.seats.active === v.paneKey ? v : null; }, 10000, 250));
  };
  const launchOn = (p, body) => p.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...${JSON.stringify(body)}, dpr: devicePixelRatio }) }).then((r) => r.json())`); // the launcher's own field (desktop-app-launcher.js launchDpr)
  const readyOn = (p, id) => until(() => p.evalJs(`fetch('/api/desktop/apps/${id}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 40000);
  const sizeWinOn = (p, id, W, H) => p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); app.wm.focusWindow(w.id); w.element.style.left = '20px'; w.element.style.top = '10px'; w.element.style.width = '${W}px'; w.element.style.height = '${H}px'; if (w.onResize) w.onResize(); return true; })()`);
  const xenvFor = (w, r) => ({ ...process.env, DISPLAY: r.display, XAUTHORITY: path.join(w, 'data', 'desktop-apps', r.id, 'Xauthority') });
  const xq = (xe, cmd, args) => { try { return execFileSync(cmd, args, { env: xe, encoding: 'utf8', timeout: 5000 }); } catch { return ''; } };
  /** REDUNDANCY of the app's main canvas as SHOWN (a screenshot at the device scale): a 96-dpi picture the browser blows up
   *  2× carries one source pixel per 2 device pixels — along each axis one PHASE of pixels is (nearly) predictable from its
   *  neighbours (bilinear: the in-between pixel is their average) or equal to its partner (nearest). A picture rendered AT
   *  the device resolution has no such phase. Per axis: B = 1 − min(err₀, err₁) / max(err₀, err₁) over the second difference
   *  |2p − p₋ − p₊| of each phase, A = |eq₀ − eq₁| over "equal to the next pixel" per phase; score = max over both axes of
   *  max(A, B), computed on INK pixels only (|p − background| > 24 somewhere in the triple). ~0 = native, → 1 = upscaled. */
  const sharpness = async (p, id) => {
    const s = await p.evalJs(HI(id));
    if (!s || !s.canvas) return null;
    const clip = { x: Math.round(s.canvas.rx) + 2, y: Math.round(s.canvas.ry) + 2, width: Math.floor(Math.min(s.canvas.rw, s.pane.w)) - 4, height: Math.floor(Math.min(s.canvas.rh, s.pane.h)) - 4, scale: 1 };
    const shot = await p.cdp('Page.captureScreenshot', { format: 'png', clip });
    return p.evalJs(`(async () => { const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.data)}; await img.decode(); const W = img.naturalWidth, H = img.naturalHeight; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, W, H).data; const g = new Float32Array(W * H); const hist = new Uint32Array(256); for (let i = 0; i < W * H; i++) { const v = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3; g[i] = v; hist[Math.round(v)]++; } let bg = 0; for (let v = 1; v < 256; v++) if (hist[v] > hist[bg]) bg = v; const axis = (dx, dy) => { const err = [0, 0], cnt = [0, 0], eq = [0, 0]; for (let y = dy; y < H - dy; y++) for (let xx = dx; xx < W - dx; xx++) { const i = y * W + xx, a = g[i - dy * W - dx], b = g[i], cc = g[i + dy * W + dx]; if (Math.abs(a - bg) <= 24 && Math.abs(b - bg) <= 24 && Math.abs(cc - bg) <= 24) continue; const ph = (dx ? xx : y) & 1; err[ph] += Math.abs(2 * b - a - cc); cnt[ph]++; if (Math.abs(b - cc) <= 3) eq[ph]++; } const e0 = err[0] / (cnt[0] || 1), e1 = err[1] / (cnt[1] || 1); const B = Math.max(e0, e1) ? 1 - Math.min(e0, e1) / Math.max(e0, e1) : 0; const A = Math.abs(eq[0] / (cnt[0] || 1) - eq[1] / (cnt[1] || 1)); return { A, B, n: cnt[0] + cnt[1] }; }; const hx = axis(1, 0), vy = axis(0, 1); return { w: W, hh: H, bg, hx, vy, score: Math.max(hx.A, hx.B, vy.A, vy.B) }; })()`);
  };
  /** drag the window's SE resize handle by (dx, dy) with REAL mouse events; returns the pane and the window after */
  const dragSE = async (p, id, dx, dy) => {
    const h = await p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const r = w.element.querySelector('.resize-se').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: h.x, y: h.y });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: h.x, y: h.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) { await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: h.x + (dx * i) / 8, y: h.y + (dy * i) / 8, button: 'left', buttons: 1 }); await sleep(40); }
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: h.x + dx, y: h.y + dy, button: 'left', clickCount: 1 });
    await sleep(1500);
    return p.evalJs(HI(id));
  };
  /** one full run of the HiDPI legs against the server at `origin` (worktree `w`); returns what it measured */
  const runHi = async (origin, w, tag) => {
    const out = { tag };
    const H = await mkPage(origin, { width: 1400, height: 900, deviceScaleFactor: 2, mobile: false });
    out.dpr = await H.p.evalJs('devicePixelRatio');
    const seqFile = path.join(fakeHome, `hidpi-${tag}.txt`);
    const lx = await launchOn(H.p, { exec: XTERM, args: ['-T', `vs-hidpi-${tag}`, '-geometry', '80x24', '-e', 'sh', '-c', `seq 1 900 | tr '\\n' ' '; cat > ${seqFile}`], label: `vs-hidpi-${tag}` });
    const rx = lx && lx.id && await readyOn(H.p, lx.id);
    out.xterm = rx ? { id: rx.id, scale: rx.scale, dpi: rx.dpi } : { error: (lx && (lx.error || lx.lastError)) || 'no record' };
    if (rx) {
      await H.p.evalJs(`app.openDesktopApp(${JSON.stringify(rx.id)}); true`);
      await ensureActive(H.p, rx.id);
      await sizeWinOn(H.p, rx.id, 700, 500);
      const s = await until(async () => { const v = await H.p.evalJs(HI(rx.id)); return v && v.status === 'Connected' && v.main && v.canvas && v.canvas.w > 1 ? v : null; }, 30000, 300);
      await sleep(2500); // the repaint after the fit
      out.x = await H.p.evalJs(HI(rx.id));
      const xe = xenvFor(w, rx);
      out.xdpy = (xq(xe, 'xdpyinfo', []).match(/resolution:\s+(\S+)/) || [])[1] || null;
      const xr = xq(xe, 'xrdb', ['-query']);
      out.xftDpi = Number((xr.match(/^Xft\.dpi:\s+(\d+)/m) || [])[1]) || null;
      out.xtermFace = (xr.match(/^XTerm\*faceSize:\s+(\d+)/m) || [])[1] || null;
      const xw = ((await H.p.evalJs(`fetch('/api/desktop/apps/${rx.id}/windows').then((r) => r.json())`)).windows || []).slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
      out.xwin = xw && { w: xw.w, h: xw.h };
      out.sharp = await sharpness(H.p, rx.id);
      out.ident = await identity7(H.p, rx.id, 2); // r2: the canvas IS the screen, pixel for pixel (the redundancy score is printed, not judged — see below)
      // the pointer at DPR 2: a CSS point on the pane lands on X at twice it (through xdotool's own reading)
      if (XDOTOOL && s) {
        out.pointer = [];
        for (const [px, py] of [[101, 57], [Math.round(s.pane.w * 0.7), Math.round(s.pane.h * 0.6)]]) {
          await H.p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: s.pane.x + px, y: s.pane.y + py });
          await sleep(400);
          const m = /x:(\d+) y:(\d+)/.exec(xq(xe, XDOTOOL, ['getmouselocation']) || '');
          out.pointer.push({ css: [px, py], x: m ? [Number(m[1]), Number(m[2])] : null });
        }
      }
      await H.p.evalJs(`fetch('/api/desktop/apps/${rx.id}/stop', { method: 'POST' }).then((r) => r.status)`);
    }
    if (CALC6) {
      const lc = await launchOn(H.p, { exec: CALC6, args: [], label: `vs-calc-${tag}` });
      const rc = lc && lc.id && await readyOn(H.p, lc.id);
      if (rc) {
        out.calcId = rc.id; out.calcRec = { scale: rc.scale, dpi: rc.dpi };
        await H.p.evalJs(`app.openDesktopApp(${JSON.stringify(rc.id)}); true`);
        await ensureActive(H.p, rc.id);
        await sizeWinOn(H.p, rc.id, 900, 800);
        out.c0 = await until(async () => { const v = await H.p.evalJs(HI(rc.id)); return v && v.status === 'Connected' && v.main && v.main.h > 100 ? v : null; }, 40000, 300);
        await sleep(1500);
        out.c1 = await dragSE(H.p, rc.id, -700, -700); // far below any minimum
        await sleep(1500);
        out.c1 = await H.p.evalJs(HI(rc.id));
        out.c1x = ((await H.p.evalJs(`fetch('/api/desktop/apps/${rc.id}/windows').then((r) => r.json())`)).windows || []).slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] || null;
        // the '7' key: GNOME Calculator 50's basic keypad is bottom-anchored — at its minimum (720x1232 device px at 2x) '7'
        // sits at 12 % of the width and 357 device px above the bottom (measured on a GDK_SCALE=2 capture of the window)
        const c = out.c1;
        if (c && c.main) {
          const k = c.ratio, sc = c.scale, off = c.offset || { x: 0, y: 0 };
          const tx = c.pane.x + off.x + ((c.main.w * 0.12) / k) * sc, ty = c.pane.y + off.y + ((c.main.h - 357) / k) * sc;
          await trustedClickAt(H.p, tx, ty); await sleep(500); await trustedClickAt(H.p, tx, ty); await sleep(700);
          // read back through the product's own clipboard lane: Ctrl+C on the pane goes to the app, the app's copy comes back
          // as xpra's clipboard-token and the client surfaces its text (`client.lastReceived`)
          await H.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
          await H.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
          await H.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
          await H.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 });
          out.seven = (await until(() => H.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(rc.id)}); const c = w && w._desktopAppView && w._desktopAppView.client; return c && c.lastReceived ? c.lastReceived : null; })()`), 6000, 200)) || '';
          out.sevenAt = { tx, ty };
          if (process.env.VS_HIDPI_SHOTS) { const sh = await H.p.cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(process.env.VS_HIDPI_SHOTS, `seven-${tag}.png`), Buffer.from(sh.data, 'base64')); }
        }
      }
    }
    return { out, H };
  };

  if (!CALC6) skip('§6 GNOME Calculator legs', 'gnome-calculator not on PATH');
  const A6 = await runHi(`http://127.0.0.1:${PORT}`, wt, 'ours');
  const o = A6.out;
  console.log(`  ours: DPR ${o.dpr}; xterm record scale ${o.xterm.scale} dpi ${o.xterm.dpi}; xdpyinfo ${o.xdpy}, Xft.dpi ${o.xftDpi}; pane ${o.x && `${o.x.pane.w}×${o.x.pane.h}`} CSS, X window ${o.xwin && `${o.xwin.w}×${o.xwin.h}`}, the client's main ${o.x && o.x.main && `${o.x.main.w}×${o.x.main.h}`}, increment ${o.x && JSON.stringify(o.x.constraints && o.x.constraints.increment)}; canvas ${o.x && o.x.canvas && `${o.x.canvas.w}×${o.x.canvas.h} backing in ${o.x.canvas.rw.toFixed(1)}×${o.x.canvas.rh.toFixed(1)} CSS`}; upscale redundancy ${o.sharp && `${o.sharp.score.toFixed(3)} (${JSON.stringify(o.sharp)})`}; pointer ${JSON.stringify(o.pointer)}`);
  check(`the page runs at devicePixelRatio 2 (${o.dpr})`, o.dpr === 2);
  check(`the launch carried the page's dpr and desktop.appScale auto made the app 2× — the record says scale ${o.xterm.scale}, the display's font dpi ${o.xterm.dpi}`, o.xterm.scale === 2 && o.xterm.dpi === 96, o.xterm);
  check(`the display's font dpi is 96 at GDK_SCALE=2 (Xft.dpi ${o.xftDpi}, xdpyinfo ${o.xdpy} — the client sends the SAME dpi; 192 there would double the app's text on top of GDK_SCALE, measured)`, o.xftDpi === 96 && o.xdpy === '96x96', { xft: o.xftDpi, xdpy: o.xdpy });
  const inc = (o.x && o.x.constraints && o.x.constraints.increment) || [1, 1];
  check(`the app window's X geometry is the pane × 2 (X ${o.xwin && `${o.xwin.w}×${o.xwin.h}`} vs pane ${o.x && `${o.x.pane.w}×${o.x.pane.h}`} CSS ⇒ ${o.x && `${Math.round(o.x.pane.w * 2)}×${Math.round(o.x.pane.h * 2)}`} device, within one ${inc.join('×')} cell)`, !!o.xwin && !!o.x && o.xwin.w <= Math.round(o.x.pane.w * 2) + 1 && Math.round(o.x.pane.w * 2) - o.xwin.w < inc[0] + 1 && o.xwin.h <= Math.round(o.x.pane.h * 2) + 1 && Math.round(o.x.pane.h * 2) - o.xwin.h < inc[1] + 1, { x: o.xwin, pane: o.x && o.x.pane, inc });
  check(`the canvas backing store is 2× its CSS size (${o.x && o.x.canvas && `${o.x.canvas.w}×${o.x.canvas.h} in ${o.x.canvas.rw.toFixed(1)}×${o.x.canvas.rh.toFixed(1)}`}) — one app pixel per screen pixel`, !!o.x && !!o.x.canvas && Math.abs(o.x.canvas.w - o.x.canvas.rw * 2) <= 2 && Math.abs(o.x.canvas.h - o.x.canvas.rh * 2) <= 2, o.x && o.x.canvas);
  check(`xterm's character cell is ${inc[0]}×${inc[1]} DEVICE px (the X resources gave it an Xft face at 2× before it started; its 6×13 bitmap at 1× — the text is drawn at the screen's resolution, not blown up)`, inc[0] >= 12 && inc[1] >= 26, inc);
  check(`the pointer at DPR 2 lands on X at TWICE the CSS point (${JSON.stringify(o.pointer)})`, !XDOTOOL || (Array.isArray(o.pointer) && o.pointer.length === 2 && o.pointer.every((q) => q.x && Math.abs(q.x[0] - 2 * q.css[0]) <= 2 && Math.abs(q.x[1] - 2 * q.css[1]) <= 2)), o.pointer);
  check('the status strip names the scale (the chip says "2×", its tooltip says a relaunch applies a change) and the backend chip says what xpra is', !!o.x && !!o.x.chip && o.x.chip.shown && o.x.chip.text === '2×' && /launched again/.test(o.x.chip.title) && /streams each app window as pixels/.test(o.x.backendTitle), o.x && { chip: o.x.chip, backend: o.x.backendTitle });
  if (CALC6) {
    console.log(`  ours calculator: record ${JSON.stringify(o.calcRec)}, constraints ${JSON.stringify(o.c0 && o.c0.constraints)}, min pane ${JSON.stringify(o.c1 && o.c1.minSize)}; window min ${o.c1 && `${o.c1.win.minW}×${o.c1.win.minH}`} layout px; after a drag 700 px past it: window ${o.c1 && `${o.c1.win.w.toFixed(0)}×${o.c1.win.h.toFixed(0)}`}, pane ${o.c1 && `${o.c1.pane.w}×${o.c1.pane.h}`}, main ${o.c1 && o.c1.main && `${o.c1.main.w}×${o.c1.main.h}`} device, stage ${o.c1 && o.c1.scale}; '7' clicked twice ⇒ the calculator copies "${o.seven}"`);
    const cmin = (o.c0 && o.c0.constraints && o.c0.constraints['minimum-size']) || [0, 0];
    check(`GNOME Calculator at 2× announces its minimum (${JSON.stringify(o.c0 && o.c0.constraints)}) — the height exactly 2 × its 616 at 1× (GDK_SCALE=2), and the font dpi did not double it again`, cmin[1] === 1232 && cmin[0] >= 700 && cmin[0] < 800, o.c0 && o.c0.constraints);
    const wantMin = { w: Math.ceil(cmin[0] / 2), h: Math.ceil(cmin[1] / 2) };
    check(`the VibeSpace window's minimum follows the app: pane ≥ ${wantMin.w}×${wantMin.h} CSS (${o.c1 && JSON.stringify(o.c1.minSize)}); a resize DRAG 700 px past it stops there — the pane ${o.c1 && `${o.c1.pane.w}×${o.c1.pane.h}`} still holds the app`, !!o.c1 && !!o.c1.minSize && o.c1.minSize.w === wantMin.w && o.c1.minSize.h === wantMin.h && o.c1.pane.w >= wantMin.w - 0.5 && o.c1.pane.h >= wantMin.h - 0.5 && o.c1.win.w < 800, o.c1);
    check(`…and nothing is cropped: the main window (${o.c1 && o.c1.main && `${o.c1.main.w}×${o.c1.main.h}`} device) fits the pane at ratio 2, the picture unscaled (${o.c1 && o.c1.scale})`, !!o.c1 && !!o.c1.main && o.c1.main.w / 2 <= o.c1.pane.w + 1 && o.c1.main.h / 2 <= o.c1.pane.h + 1 && o.c1.scale === 1, o.c1);
    check(`a click on the '7' key at DPR 2 registers (the calculator copies "${o.seven}")`, /^77$/.test(o.seven || ''), o.seven);
  }
  // the UI scale on top of DPR 2: the counter-zoom keeps the canvas at net zoom 1 AND the device mapping
  if (CALC6 && o.calcId) {
    await A6.H.p.evalJs(`localStorage.setItem('vibespace.uiScale', '125'); true`);
    await openPage(A6.H.p, `http://127.0.0.1:${PORT}`);
    const has = await until(() => A6.H.p.evalJs(`!!${HI(o.calcId)}`), 15000, 250); if (!has) await A6.H.p.evalJs(`app.openDesktopApp(${JSON.stringify(o.calcId)}); true`);
    await ensureActive(A6.H.p, o.calcId);
    const u = await until(async () => { const v = await A6.H.p.evalJs(HI(o.calcId)); return v && v.status === 'Connected' && v.canvas && v.canvas.w > 1 ? v : null; }, 30000, 300);
    await sleep(1500);
    const u2 = await A6.H.p.evalJs(HI(o.calcId));
    console.log(`  UI scale 1.25 at DPR 2: canvas ${u2 && u2.canvas && `${u2.canvas.w}×${u2.canvas.h} backing in ${u2.canvas.rw.toFixed(1)}×${u2.canvas.rh.toFixed(1)} CSS`}, pane ${u2 && `${u2.pane.w}×${u2.pane.h}`}, window min ${u2 && `${u2.win.minW}×${u2.win.minH}`} layout px, window ${u2 && `${u2.win.w.toFixed(0)}×${u2.win.h.toFixed(0)}`} on screen`);
    check('UI scale 1.25 on the 2× page: the canvas is still 2× its on-screen CSS box (net zoom 1 under the counter-zoom) and the pane still holds the app\'s minimum', !!u && !!u2 && !!u2.canvas && Math.abs(u2.canvas.w - u2.canvas.rw * 2) <= 2 && u2.pane.h >= 615.5 && u2.pane.w >= 359.5, u2);
    await A6.H.p.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`);
  }
  // the phone: the window IS the screen, the pane smaller than the app's minimum ⇒ the picture SCALED to fit, never cropped
  if (CALC6 && o.calcId) {
    await dropPage(A6.H); // the phone page is then the calculator's only (hence active) viewer
    for (const [PW, PH] of [[390, 844], [320, 568]]) {
      const Ph = await mkPage(`http://127.0.0.1:${PORT}`, { width: PW, height: PH, deviceScaleFactor: 2, mobile: true });
      const has = await until(() => Ph.p.evalJs(`!!${HI(o.calcId)}`), 15000, 250); if (!has) await Ph.p.evalJs(`app.openDesktopApp(${JSON.stringify(o.calcId)}); true`);
      await Ph.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(o.calcId)}); app.wm.focusWindow(w.id); return true; })()`);
      await ensureActive(Ph.p, o.calcId);
      const ph = await until(async () => { const v = await Ph.p.evalJs(HI(o.calcId)); return v && v.status === 'Connected' && v.main && v.canvas && v.pane.w > 0 ? v : null; }, 30000, 300);
      await sleep(2000);
      const v = await Ph.p.evalJs(HI(o.calcId));
      const shown = v && v.main ? { w: (v.main.w / v.ratio) * v.scale, h: (v.main.h / v.ratio) * v.scale } : null;
      const needsScale = v && v.minSize && (v.pane.w < v.minSize.w - 0.5 || v.pane.h < v.minSize.h - 0.5);
      console.log(`  phone ${PW}×${PH} @2: pane ${v && `${v.pane.w}×${v.pane.h}`}, app minimum pane ${v && JSON.stringify(v.minSize)}, stage ${v && v.scale}, the app shown ${shown && `${shown.w.toFixed(1)}×${shown.h.toFixed(1)}`} CSS, badge ${v && JSON.stringify(v.badge)}`);
      check(`phone ${PW}×${PH}: the app is shown WHOLE inside the pane (${shown && `${shown.w.toFixed(1)}×${shown.h.toFixed(1)}`} in ${v && `${v.pane.w}×${v.pane.h}`}) — never cropped${needsScale ? ', scaled to fit with the badge "' + (v.badge && v.badge.text) + '"' : ' (the pane holds its minimum: unscaled, no badge)'}`, !!ph && !!v && !!shown && shown.w <= v.pane.w + 1 && shown.h <= v.pane.h + 1 && (needsScale ? v.scale < 1 && v.badge.shown && v.badge.text === `Scaled to fit — the app needs at least ${v.minSize.w}×${v.minSize.h}` : v.scale === 1 && !v.badge.shown), v);
      if (PW === 320) check('the small phone really is below the app\'s minimum (the scaled leg ran, not the unscaled one)', !!needsScale, v);
      await dropPage(Ph);
    }
    await fetch(`http://127.0.0.1:${PORT}/api/home`).catch(() => {});
  }
  if (o.calcId) await p1.evalJs(`fetch('/api/desktop/apps/${o.calcId}/stop', { method: 'POST' }).then((r) => r.status)`);
  await dropPage(A6.H);

  // CONTROL — THE PRE-FIX BEHAVIOUR: a scratch copy of this tree with the three levers of this change pulled back (the view's
  // ratio pinned to 1 — CSS px are X px; the app's scale pinned to 1; `size-constraints` not asked for — the v21 list)
  {
    const wtc = scratch('deskxpra-hidpictl');
    try { execSync(`git worktree remove --force ${wtc}`, { cwd: repo, stdio: 'ignore' }); } catch {}
    execSync(`git worktree add --detach ${wtc} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtc);
    for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wtc}/${f} && cp -r ${wt}/${f} ${wtc}/${f}`);
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtc, 'node_modules'));
    fs.mkdirSync(path.join(wtc, 'data'), { recursive: true });
    const patches = [
      ['src/lib/xpra-view.js', "  const ratio = () => pixelRatioOf(typeof pixelRatio === 'function' ? pixelRatio() : pixelRatio);", '  const ratio = () => 1; // pre-fix CONTROL'],
      ['src/server/desktop-app-keeper.js', "const knobs = backend.stream === 'xpra' ? M.scaleKnobs(M.appScaleFor(serverSetting('desktop.appScale'), v.launch.dpr)) : M.scaleKnobs(1);", 'const knobs = M.scaleKnobs(1); // pre-fix CONTROL'],
      ['src/lib/xpra-proto.js', "'title', 'size-hints', 'size-constraints', 'class-instance'", "'title', 'size-hints', 'class-instance'"],
    ];
    let allOnce = true;
    for (const [f, from, to] of patches) { const src = fs.readFileSync(path.join(wtc, f), 'utf8'); if (src.split(from).length !== 2) allOnce = false; fs.writeFileSync(path.join(wtc, f), src.replace(from, to)); }
    check('CONTROL: each pre-fix lever is spelled exactly once in the tree (the control patches exactly those)', allOnce);
    execSync('npm run build', { cwd: wtc, stdio: 'ignore' });
    const [PORTH] = await freePorts(1);
    const homeH = scratchHome('deskxpra-hidpictl-home', fs);
    const sh = spawn(process.execPath, ['server.js'], { cwd: wtc, env: { ...srvEnv, PORT: String(PORTH), HOME: homeH }, stdio: 'ignore' }); ctlServers.push(sh);
    let upH = false; for (let i = 0; i < 80 && !upH; i++) { try { await fetch(`http://127.0.0.1:${PORTH}/api/home`); upH = true; } catch { await sleep(250); } }
    check('CONTROL: the pre-fix copy boots', upH);
    if (upH) {
      const B6 = await runHi(`http://127.0.0.1:${PORTH}`, wtc, 'ctl');
      const q = B6.out;
      console.log(`  CONTROL: record scale ${q.xterm.scale}; X window ${q.xwin && `${q.xwin.w}×${q.xwin.h}`} for pane ${q.x && `${q.x.pane.w}×${q.x.pane.h}`}; canvas ${q.x && q.x.canvas && `${q.x.canvas.w}×${q.x.canvas.h} backing in ${q.x.canvas.rw.toFixed(1)}×${q.x.canvas.rh.toFixed(1)} CSS`}; sharpness ${q.sharp && q.sharp.score.toFixed(3)} vs ours ${o.sharp && o.sharp.score.toFixed(3)}; calculator after the drag: pane ${q.c1 && `${q.c1.pane.w}×${q.c1.pane.h}`}, main ${q.c1 && q.c1.main && `${q.c1.main.w}×${q.c1.main.h}`}, stage ${q.c1 && q.c1.scale}`);
      check(`CONTROL: pre-fix, the canvas backing store is its CSS size (${q.x && q.x.canvas && `${q.x.canvas.w}×${q.x.canvas.h} in ${q.x.canvas.rw.toFixed(1)}×${q.x.canvas.rh.toFixed(1)}`}) and X is the pane in CSS px — a 96-dpi bitmap the 2× screen blows up (the "2× backing store" leg fails there)`, !!q.x && !!q.x.canvas && Math.abs(q.x.canvas.w - q.x.canvas.rw) <= 2 && !!q.xwin && q.xwin.w <= q.x.pane.w + 1, q.x && q.x.canvas);
      // r2: the redundancy score is PRINTED, no longer judged — with the race fixed xterm's cell is 13×26 (EVEN), and text rows on an even
      // period give one row parity more "equal to the next pixel" (vy.A 0.12 on a native picture); the judged fact is the identity below
      console.log(`  upscale redundancy (informational): ours ${o.sharp && o.sharp.score.toFixed(3)} ${JSON.stringify(o.sharp && { hx: o.sharp.hx, vy: o.sharp.vy })}, pre-fix ${q.sharp && q.sharp.score.toFixed(3)}`);
      check(`the picture carries a pixel per DEVICE pixel — the xterm canvas IS the screen (${o.ident && `${o.ident.diff} of ${o.ident.n} stable px off`}) where the pre-fix canvas is blown up by the browser (${q.ident && `${(100 * q.ident.frac).toFixed(1)} % off at the same device origin`}) — the owner's "looks like VNC" was the 96-dpi bitmap blown up 2×`, !!o.ident && !!q.ident && o.ident.n > 100000 && o.ident.frac < 0.001 && q.ident.frac > 0.05, { ours: o.ident, ctl: q.ident });
      if (CALC6) check(`CONTROL: pre-fix, the same drag takes the calculator's pane below its minimum and the app is CROPPED (X keeps it ${q.c1x && `${q.c1x.w}×${q.c1x.h}`} in a ${q.c1 && `${q.c1.pane.w}×${q.c1.pane.h}`} pane, unscaled) — the owner's screenshot`, !!q.c1 && !!q.c1x && q.c1x.h > q.c1.pane.h + 1 && q.c1.scale === 1, { c1: q.c1, x: q.c1x });
      if (q.calcId) await B6.H.p.evalJs(`fetch('/api/desktop/apps/${q.calcId}/stop', { method: 'POST' }).then((r) => r.status)`);
      await dropPage(B6.H);
    }
    try { sh.kill('SIGKILL'); } catch {}
  }
  // ── (7) HiDPI r2 — THE VERIFIER'S FIVE FINDINGS, on the real rung, ours vs a CONTROL copy carrying the r1 code (every
  // r2 lever pulled back, each spelled exactly once): (a) a FRACTIONAL ratio (DPR 1.5) draws the app 1:1 — no sub-1 stage
  // transform, no badge, the canvas's pixels ARE the screen's (a full screenshot, only pixels stable across the capture
  // counted); (b) a phone pane smaller than the app's minimum: every digit AND the app's bottom-right corner reachable —
  // the X display contains the window; (c) a DPR-1 client taking over a 2× app: the window stays on the workspace,
  // scaled to fit with the badge, and the digits land; (d) xterm at 1.5×: the keeper waited for xpra's resource write —
  // the cell is the 144-dpi face (10×19), the merged XTerm* resources survive a client connecting; auto from DPR 1.5 = 2 ──
  console.log('§7 HiDPI r2 — a fractional ratio 1:1, the phone\'s lower rows, a DPR-1 takeover, the xterm face at 1.5×; ours vs the r1 control');
  const setScaleOn = (p, value) => p.evalJs(`fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ 'desktop.appScale': ${JSON.stringify(value)} }) }).then((r) => r.status)`);
  const runR2 = async (origin, w, tag) => {
    const out = { tag };
    const stopOn = (p, id) => p.evalJs(`fetch('/api/desktop/apps/${id}/stop', { method: 'POST' }).then((r) => r.status)`);
    // (a) DPR 1.5 — a calculator in a pane that holds it
    if (CALC6) {
      const A = await mkPage(origin, { width: 1400, height: 1100, deviceScaleFactor: 1.5, mobile: false });
      const l = await launchOn(A.p, { exec: CALC6, args: [], label: `vs-r2a-${tag}` });
      const r = l && l.id && await readyOn(A.p, l.id);
      if (r) {
        out.aRec = { scale: r.scale, dpi: r.dpi };
        await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(r.id)}); true`);
        await ensureActive(A.p, r.id);
        out.a = [];
        for (const [W, H] of [[900, 950], [901, 951]]) {
          await sizeWinOn(A.p, r.id, W, H);
          await until(async () => { const v = await A.p.evalJs(R2(r.id)); return v && v.status === 'Connected' && v.main && v.canvas && v.main.h > 100 ? v : null; }, 30000, 300);
          await sleep(4000); // xpra's lossless refresh after the fit
          out.a.push({ W, H, ...(await identity7(A.p, r.id, 1.5)) });
        }
        await stopOn(A.p, r.id);
      }
      await dropPage(A);
    }
    // (b) the phone — the calculator launched from a DPR-2 page (2×: minimum 720x1232 device px), then a 320x568 @2 phone takes it
    if (CALC6) {
      const L = await mkPage(origin, { width: 1400, height: 900, deviceScaleFactor: 2, mobile: false });
      const l = await launchOn(L.p, { exec: CALC6, args: [], label: `vs-r2b-${tag}` });
      const r = l && l.id && await readyOn(L.p, l.id);
      await dropPage(L);
      if (r) {
        out.bId = r.id;
        const Ph = await mkPage(origin, { width: 320, height: 568, deviceScaleFactor: 2, mobile: true });
        const has = await until(() => Ph.p.evalJs(`!!${R2(r.id)}`), 15000, 250); if (!has) await Ph.p.evalJs(`app.openDesktopApp(${JSON.stringify(r.id)}); true`);
        await Ph.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(r.id)}); app.wm.focusWindow(w.id); return true; })()`);
        await ensureActive(Ph.p, r.id);
        await until(async () => { const v = await Ph.p.evalJs(R2(r.id)); return v && v.status === 'Connected' && v.main && v.canvas && v.main.h > 100 ? v : null; }, 30000, 300);
        await sleep(3000);
        const v = await Ph.p.evalJs(R2(r.id));
        const xe = xenvFor(w, r);
        out.bView = { pane: v.pane, scale: v.scale, badge: v.badge, main: v.main, display: v.display };
        out.bXdpy = (xq(xe, 'xdpyinfo', []).match(/dimensions:\s+(\d+)x(\d+)/) || []).slice(1).map(Number);
        out.bDigits = await allDigits7(Ph.p, r.id);
        if (XDOTOOL && v.main) { // the app's bottom-right corner (the '=' column's last row), 40 device px in
          const tx = v.pane.x + v.offset.x + ((v.main.w - 40) / v.ratio) * v.scale, ty = v.pane.y + v.offset.y + ((v.main.h - 40) / v.ratio) * v.scale;
          await Ph.p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx, y: ty }); await sleep(500);
          const m = /x:(\d+) y:(\d+)/.exec(xq(xe, XDOTOOL, ['getmouselocation']) || '');
          out.bCorner = { want: [v.main.w - 40, v.main.h - 40], got: m ? [Number(m[1]), Number(m[2])] : null };
        }
        await dropPage(Ph);
        // (c) the same 2× app taken over by a DPR-1 page (1400x900): the window must stay on the workspace
        const One = await mkPage(origin, { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
        const has1 = await until(() => One.p.evalJs(`!!${R2(r.id)}`), 15000, 250); if (!has1) await One.p.evalJs(`app.openDesktopApp(${JSON.stringify(r.id)}); true`);
        await ensureActive(One.p, r.id);
        await until(async () => { const q = await One.p.evalJs(R2(r.id)); return q && q.status === 'Connected' && q.main && q.canvas && q.main.h > 100 ? q : null; }, 30000, 300);
        await sleep(3000);
        out.c = await One.p.evalJs(R2(r.id));
        out.cDigits = await allDigits7(One.p, r.id);
        await stopOn(One.p, r.id);
        await dropPage(One);
      }
    }
    // (d) xterm at desktop.appScale 1.5: the keeper's own xterm cell and the merged resources after a client connected
    {
      const X = await mkPage(origin, { width: 1400, height: 900, deviceScaleFactor: 1.5, mobile: false });
      await setScaleOn(X.p, '1.5');
      const l = await launchOn(X.p, { exec: XTERM, args: ['-T', `vs-r2d-${tag}`, '-geometry', '80x24', '-e', 'sh', '-c', 'sleep 600'], label: `vs-r2d-${tag}` });
      const r = l && l.id && await readyOn(X.p, l.id);
      await setScaleOn(X.p, null);
      if (r) {
        await X.p.evalJs(`app.openDesktopApp(${JSON.stringify(r.id)}); true`);
        await ensureActive(X.p, r.id);
        const v = await until(async () => { const q = await X.p.evalJs(R2(r.id)); return q && q.status === 'Connected' && q.constraints ? q : null; }, 30000, 300);
        await sleep(1500);
        out.dRec = { scale: r.scale, dpi: r.dpi };
        out.dCell = v && v.constraints && v.constraints.increment;
        out.dRes = xq(xenvFor(w, r), 'xrdb', ['-query']);
        await stopOn(X.p, r.id);
      }
      await dropPage(X);
    }
    return out;
  };
  const r2Report = (o) => console.log(`  ${o.tag}: (a) record ${JSON.stringify(o.aRec)} ${JSON.stringify((o.a || []).map((x) => ({ W: x.W, H: x.H, t: x.transform, scale: x.scale, badge: x.badge, off: `${x.diff}/${x.n}`, box: x.box, backing: x.backing })))}; (b) pane ${o.bView && `${o.bView.pane.w}×${o.bView.pane.h}`} stage ${o.bView && o.bView.scale.toFixed(3)} X display ${o.bXdpy && o.bXdpy.join('×')} main ${o.bView && o.bView.main && `${o.bView.main.w}×${o.bView.main.h}`} digits ${JSON.stringify(o.bDigits)} corner ${JSON.stringify(o.bCorner)}; (c) window ${o.c && `${o.c.win.x.toFixed(0)},${o.c.win.y.toFixed(0)} ${o.c.win.w.toFixed(0)}×${o.c.win.h.toFixed(0)}`} workspace ${o.c && `${o.c.workspace.y.toFixed(0)}+${o.c.workspace.h.toFixed(0)}`} stage ${o.c && o.c.scale.toFixed(3)} badge ${o.c && JSON.stringify(o.c.badge)} digits ${JSON.stringify(o.cDigits)}; (d) record ${JSON.stringify(o.dRec)} cell ${JSON.stringify(o.dCell)}`);
  const O7 = await runR2(`http://127.0.0.1:${PORT}`, wt, 'ours');
  r2Report(O7);
  const aOk = (o) => Array.isArray(o.a) && o.a.length === 2 && o.a.every((x) => x.scale === 1 && !x.badge && !/scale/.test(x.transform) && x.n > 100000 && x.frac < 0.001);
  const bOk = (o) => !!o.bDigits && o.bDigits.got === '7894561230';
  const cornerOk = (o) => !!o.bCorner && !!o.bCorner.got && Math.abs(o.bCorner.got[0] - o.bCorner.want[0]) <= 4 && Math.abs(o.bCorner.got[1] - o.bCorner.want[1]) <= 4;
  const cOk = (o) => !!o.c && o.c.win.y + o.c.win.h <= o.c.workspace.y + o.c.workspace.h + 1 && o.c.win.x + o.c.win.w <= o.c.workspace.x + o.c.workspace.w + 1;
  const dOk = (o) => Array.isArray(o.dCell) && o.dCell[0] >= 9 && o.dCell[1] >= 18;
  if (CALC6) {
    check(`(a) DPR 1.5: auto made the calculator 2× (a DPR ≥ 1.5 screen never gets the text-only 1.5×): record ${JSON.stringify(O7.aRec)}`, !!O7.aRec && O7.aRec.scale === 2 && O7.aRec.dpi === 96, O7.aRec);
    check(`(a) DPR 1.5, a pane that holds the app at two sizes: the stage is identity (no sub-1 transform, no badge) and the canvas IS the screen — ${(O7.a || []).map((x) => `${x.diff} of ${x.n} stable px off (${(100 * x.frac).toFixed(3)} %)`).join(', ')}`, aOk(O7), O7.a);
    check(`(b) the phone 320×568 @2: the X display CONTAINS the app (${O7.bXdpy && O7.bXdpy.join('×')} ⊇ ${O7.bView && O7.bView.main && `${O7.bView.main.w}×${O7.bView.main.h}`}) and the picture is scaled to fit (${O7.bView && O7.bView.scale.toFixed(3)})`, !!O7.bXdpy && !!O7.bView && !!O7.bView.main && O7.bXdpy[0] >= O7.bView.main.w && O7.bXdpy[1] >= O7.bView.main.h && O7.bView.scale < 1 && O7.bView.badge.shown, { x: O7.bXdpy, v: O7.bView });
    check(`(b) …every digit key lands, the lower rows included (clicked ${O7.bDigits && O7.bDigits.want}, the calculator copies "${O7.bDigits && O7.bDigits.got}")`, bOk(O7), O7.bDigits);
    check(`(b) …and the pointer reaches the app's bottom-right corner (X reads ${JSON.stringify(O7.bCorner && O7.bCorner.got)}, wanted ${JSON.stringify(O7.bCorner && O7.bCorner.want)}) — the '=' column is operable`, !XDOTOOL || cornerOk(O7), O7.bCorner);
    check(`(c) a DPR-1 page takes over the 2× calculator: the window stays ON the workspace (${O7.c && `top ${O7.c.win.y.toFixed(0)} + ${O7.c.win.h.toFixed(0)} ≤ ${(O7.c.workspace.y + O7.c.workspace.h).toFixed(0)}`}), the picture scaled to fit (${O7.c && O7.c.scale.toFixed(3)}) with the badge "${O7.c && O7.c.badge.text}"`, cOk(O7) && O7.c.scale < 1 && O7.c.badge.shown, O7.c);
    check(`(c) …and its digits land (the calculator copies "${O7.cDigits && O7.cDigits.got}")`, !!O7.cDigits && O7.cDigits.got === '7894561230', O7.cDigits);
  }
  check(`(d) xterm at desktop.appScale 1.5: the keeper waited for xpra's resource write — the cell is ${JSON.stringify(O7.dCell)} (the 144-dpi face; 7×14 = Xvfb's 100 dpi, the race) and the merged XTerm* face is still in the display's resources after a client connected`, dOk(O7) && /XTerm\*faceSize/.test(O7.dRes || '') && /Xft\.dpi:\s*144/.test(O7.dRes || ''), { cell: O7.dCell, res: O7.dRes });
  // CONTROL — the r1 code: a scratch copy of this tree with every r2 lever pulled back (each spelled exactly once)
  {
    const wtr = scratch('deskxpra-r2ctl');
    try { execSync(`git worktree remove --force ${wtr}`, { cwd: repo, stdio: 'ignore' }); } catch {}
    execSync(`git worktree add --detach ${wtr} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtr);
    for (const f of ['src', 'public', 'server.js']) execSync(`rm -rf ${wtr}/${f} && cp -r ${wt}/${f} ${wtr}/${f}`);
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtr, 'node_modules'));
    fs.mkdirSync(path.join(wtr, 'data'), { recursive: true });
    const levers = [
      ['src/lib/xpra-proto.js', '  return { width: Math.max(1, Math.floor((Number(width) || 1) * r + 1e-6)), height: Math.max(1, Math.floor((Number(height) || 1) * r + 1e-6)) };', '  return { width: Math.max(1, Math.round((Number(width) || 1) * r)), height: Math.max(1, Math.round((Number(height) || 1) * r)) };'],
      ['src/lib/xpra-view.js', '    const bw = backingSize(win.w, r), bh = backingSize(win.h, r);', '    const bw = win.w, bh = win.h;'],
      ['src/lib/xpra-view.js', '    const g = gridNudge(ox, oy); ox += g.x; oy += g.y;', '    const g = { x: 0, y: 0 };'],
      ['src/lib/xpra-view.js', '  const FIT_SLACK_CSS = 1;', '  const FIT_SLACK_CSS = 0;'],
      ['src/lib/xpra-view.js', "      if (mode === 'watch') {\n        for (const w of client.windows.values())", "      if (true) {\n        for (const w of client.windows.values())"],
      ['src/lib/xpra-client.js', '    return { width: Math.max(pane.width, g ? g.x + g.w : 0), height: Math.max(pane.height, g ? g.y + g.h : 0) };', '    return { width: pane.width, height: pane.height };'],
      ['src/lib/window.js', '  _ownMinOf(win) { return minOf(win, this._workspaceBox()); }', '  _ownMinOf(win) { return minOf(win); }'],
      ['src/server/desktop-app-keeper.js', "      if (own && M.streamKindOf(rec, backends) === 'xpra') {\n        const xd = await display.waitForXftDpi(", "      if (false) {\n        const xd = await display.waitForXftDpi("],
      ['src/desktop-apps.js', '  return normalizeDpr(dpr) >= 1.5 ? 2 : 1;', '  return Math.min(2, Math.max(1, Math.round(normalizeDpr(dpr) * 2) / 2));'],
    ];
    let once = true;
    for (const [f, from, to] of levers) { const src = fs.readFileSync(path.join(wtr, f), 'utf8'); if (src.split(from).length !== 2) { once = false; console.error(`    lever not spelled once in ${f}: ${from.slice(0, 70)}`); } fs.writeFileSync(path.join(wtr, f), src.replace(from, to)); }
    check('CONTROL (r1): each of the nine r2 levers is spelled exactly once in the tree (the control pulls back exactly those)', once);
    execSync('npm run build', { cwd: wtr, stdio: 'ignore' });
    const [PORTR] = await freePorts(1);
    const homeR = scratchHome('deskxpra-r2ctl-home', fs);
    const sr = spawn(process.execPath, ['server.js'], { cwd: wtr, env: { ...srvEnv, PORT: String(PORTR), HOME: homeR }, stdio: 'ignore' }); ctlServers.push(sr);
    let upR = false; for (let i = 0; i < 80 && !upR; i++) { try { await fetch(`http://127.0.0.1:${PORTR}/api/home`); upR = true; } catch { await sleep(250); } }
    check('CONTROL (r1): the r1 copy boots', upR);
    if (upR) {
      const Q = await runR2(`http://127.0.0.1:${PORTR}`, wtr, 'r1-ctl');
      r2Report(Q);
      if (CALC6) {
        check(`CONTROL (r1): at DPR 1.5 the r1 code is NOT 1:1 — ${(Q.a || []).map((x) => `${x.transform || 'no transform'}, badge ${x.badge}, ${(100 * x.frac).toFixed(2)} % off`).join('; ')} (the verifier's 0.9995 transform / 4 %)`, !aOk(Q), Q.a);
        check(`CONTROL (r1): on the phone the r1 display is the pane (${Q.bXdpy && Q.bXdpy.join('×')}) — the lower rows / the corner are out of X's reach (copies "${Q.bDigits && Q.bDigits.got}", corner ${JSON.stringify(Q.bCorner && Q.bCorner.got)})`, !bOk(Q) || (XDOTOOL && !cornerOk(Q)), { d: Q.bDigits, c: Q.bCorner, x: Q.bXdpy });
        check(`CONTROL (r1): the r1 DPR-1 takeover puts the window past the workspace (${Q.c && `top ${Q.c.win.y.toFixed(0)} + ${Q.c.win.h.toFixed(0)} > ${(Q.c.workspace.y + Q.c.workspace.h).toFixed(0)}`})`, !cOk(Q), Q.c && { win: Q.c.win, ws: Q.c.workspace });
      }
      check(`CONTROL (r1): the r1 keeper starts xterm before xpra's resource write — cell ${JSON.stringify(Q.dCell)} (Xvfb's 100 dpi), the merged face wiped`, !dOk(Q), { cell: Q.dCell, res: Q.dRes });
    }
    try { sr.kill('SIGKILL'); } catch {}
  }
  await p1.cdp('Page.bringToFront').catch(() => {});

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
