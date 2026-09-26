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
//   • Stop ⇒ the window closes itself (round 3 A2), nothing left running.
//   • §8 (B-bfe6) a BROWSER as an app, from the dialog's Browsers section with an
//     Open URL: the real chromium-family / firefox binary (each SKIPPED with its
//     reason when absent or unreachable — a snap is refused by name), the window
//     maps, our own http server sees the browser's GET and the title bar carries
//     the page title xpra reports, the argv / the process / the files name the
//     keeper's OWN 0700 profile (never under $HOME), Stop removes it.
//   • §9 (round 3, A1 — docs/design-desktop-apps-seamless §3.1) THE PLAIN-HTTP
//     GESTURE WINDOW on a hostname page with GNOME Calculator: the user's own
//     Ctrl+C ⇒ the calculator's copy lands in the browser clipboard with NO
//     click (read back from the secure page); a token 5.5 s after the chord,
//     or after a plain key (activation but no copy chord) ⇒ the chip; the
//     one-time HTTPS hint (§2's first chip shows it, §9's does not repeat it).
//   • §10 (round 3, A2 — §3.2) THE CLOSE: the calculator's own ✕ ⇒ the VibeSpace
//     window gone on TWO clients within 2 s with a toast; the outer ✕ ⇒
//     close-window ⇒ the app process gone; an app that answers with its own
//     dialog keeps everything, a second ✕ within 5 s = Stop; a blocked pane's ✕
//     never asks the app; a dead record replayed from the layout never paints;
//     CONTROL = a copy whose window never closes itself (the dead picture).
//   • §11 (round 3, A3 — §3.4) THE SCALE: a DPR-2 page at UI scale 125 % launches GNOME
//     Calculator from the launcher's card ⇒ 2.5× (GDK_SCALE 2 in the app's environ, Xft.dpi
//     120 in its display, the chip "2.5× · auto"); ⋯ → Scale ▸ 1.5× → the confirm ⇒ the SAME
//     window on two clients shows the successor at 1.5× (GDK_SCALE 1, 144 dpi), the old one
//     stopped; CONTROL = a copy whose keeper ignores the UI scale (2× / 96).
//   • §12 (round 3, lane B — §3.3) SEAMLESS: GNOME Calculator (decorations 0) ⇒ .window.seamless, the title bar
//     and the status strip 0 high; a trusted drag of the app's OWN header bar by 120×64 moves the VibeSpace window
//     by 120/64 (±2) while the X main window stays at 0,0 (client AND X server); the app's own minimize / maximize /
//     restore buttons (MEASURED: GTK 4.22 paints them under xpra 6.5.3) map to ours and our restore re-maps the
//     app; a crossing of the top edge reveals nothing, a 250 ms hover and Alt reveal both bars (overlaying, the pane
//     never resized), the 1.5 s linger, leave = fold; a click into the picture activates the window; the pauses
//     (a tab chain, a 700 px viewport, an agent lease, a blocked second client) show the bars; the taskbar menu's
//     Show window frame ▸ On (user state, heard by the second client) and Settings off bring the frame back; the
//     plain-http copy chip floats at the pane's BOTTOM-right and hides after 10 s; the idle stop's last minute is a
//     toast; xterm is never seamless. CONTROL = a copy whose verdict is forced false (the bars everywhere).
//     Verifier r1 (each with a LIVE control in the same page): (3b) a header-bar drag off a MAXIMIZED window tells
//     the app (X meta maximized false; one click maximizes again — control: onResize muted ⇒ X stays maximized);
//     (4) revealed, the top edge is still the resize band (control: the title bar back at z-index 25 hits it);
//     (9) the chip and hint clear the header bar's ─ □ ✕ (control: the top placement covers them).
//   • §13 (lane C2 — docs/design-desktop-apps-seamless §3.5) THE MAIN LEGS AGAIN WITH host=<a paired device>: a
//     scratch daemon from the BUILT bundle under its own HOME is PAIRED to this server as a person pairs one
//     (POST /api/device/dial-pair, the daemon dials /api/device-dial), the machine picker offers it, ITS ladder
//     answers, the launch runs on it (the record the device's, never this machine's store), the window connects
//     through the hub forward, the pane covers the app, the title names the machine, typed keys land in the app's
//     file on the device, the dialog's picker re-reads its catalog, Stop closes the window, no marker left.
// SKIPs with evidence without chrome / xpra / xauth / xterm; the xclip legs
// SKIP without xclip; the plain-http leg SKIPs when the hostname does not
// resolve. Worktree-isolated (own data/, scratch HOME, VIBESPACE_SKIP_AGENT_HOOKS=1),
// free ports, per-pid names, the chrome profile in scratch.
// Run: node scripts/test-desktop-xpra-window.mjs
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE, vncEnv } from './scratch.mjs';

const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
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
const srvEnv = { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', CLAUDE_CMD: FAKE_CLAUDE, PATH: FAKE_BIN + ':' + (process.env.PATH || '') };
let srv = null;
const srvLog = [];
const bootServer = () => { srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: srvEnv, stdio: ['ignore', 'pipe', 'pipe'] }); srv.stdout.on('data', (d) => srvLog.push(String(d))); srv.stderr.on('data', (d) => srvLog.push(String(d))); return srv; };
bootServer();
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', '--window-size=1400,900', `--user-data-dir=${scratch('deskxpra-chrome')}`, 'about:blank'], { stdio: 'ignore' });
const worktrees = [wt];
const devProcs = [], devHomes = []; // §13 (lane C2): the paired scratch devices (their daemons + HOMEs) // + §5's pre-x5 CONTROL copy while it exists
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
  // §13: the paired scratch device — its dialing daemon (the process group we spawned, then its pidfile), then every
  // process still carrying one of ITS records' session marker (by evidence: the ids in its own record file)
  for (const d of devProcs) { try { process.kill(-d.pid, 'SIGKILL'); } catch {} try { d.kill('SIGKILL'); } catch {} }
  for (const h of devHomes) {
    try { const pid = Number(fs.readFileSync(path.join(h, 'agentd-root', 'state', 'agentd.pid'), 'utf8')); if (pid > 0) process.kill(pid, 'SIGKILL'); } catch {}
    let ids = []; try { ids = Object.keys(JSON.parse(fs.readFileSync(path.join(h, '.vibespace', 'desktop-apps.json'), 'utf8')).apps || {}); } catch {}
    if (ids.length) for (const d of fs.readdirSync('/proc')) { if (/^\d+$/.test(d) && ids.some((id) => D.environHas(Number(d), `VIBESPACE_DESKTOP_APP=${id}`))) { try { process.kill(Number(d), 'SIGKILL'); } catch {} } }
    try { fs.rmSync(h, { recursive: true, force: true }); } catch {}
  }
  for (const w of worktrees) { try { execSync(`git worktree remove --force ${w}`, { cwd: repo, stdio: 'ignore' }); } catch {} }
  try { fs.rmSync(scratch('deskxpra-chrome'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(scratch('deskxpra-x5ctl-home'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(scratch('deskxpra-hidpictl-home'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(scratch('deskxpra-r2ctl-home'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(scratch('deskxpra-a2ctl-home'), { recursive: true, force: true }); } catch {}
  try { fs.rmSync(scratch('deskxpra-seamctl-home'), { recursive: true, force: true }); } catch {}
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
        // round 3, A1: the FIRST chip on this plain-http device carries the one-time "Enable HTTPS for seamless copy" hint + the docs link
        const hint2 = await p2.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); const h = w._desktopAppView.copyHint; const a = h && h.querySelector('a'); const r = h && h.getBoundingClientRect(); return h ? { shown: getComputedStyle(h).display !== 'none' && r.width > 0, text: h.textContent, href: a && a.href, stored: localStorage.getItem('vibespace.desktopCopyHintShown') } : null; })()`);
        check('A1: the first chip on this plain-http device shows the one-time hint "Enable HTTPS for seamless copy" with the docs link, and the device remembers it (localStorage)', !!hint2 && hint2.shown && /Enable HTTPS for seamless copy/.test(hint2.text) && /docs\/getting-started\.md#https-for-seamless-copy$/.test(hint2.href || '') && !!hint2.stored, hint2);
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
    const sc = spawn(process.execPath, ['server.js'], { cwd: wtc, env: { ...srvEnv, ...VNC_ENV, PORT: String(PORTC), HOME: homeC }, stdio: 'ignore' }); ctlServers.push(sc);
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
  /** round 3 lane B: a SEAMLESS window (a CSD app — GNOME Calculator) has its title bar and status strip folded — reveal
   *  them the user's way (a hover of the top edge, §12's measured 250 ms) before a click on the ✕ / the ⋯; a no-op on a
   *  window that shows its frame (xterm, a blocked pane) */
  const revealBars = async (P, id) => {
    const W0 = `[...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)})`;
    const r = await P.evalJs(`(() => { const w = ${W0}; if (!w || !w.element.classList.contains('seamless')) return null; if (w.element.classList.contains('seamless-revealed') && w.titleBar.offsetHeight >= 20) return { already: true }; const e = w.element.getBoundingClientRect(); return { x: e.x + Math.min(200, e.width / 3), y: e.y + 2 }; })()`);
    if (!r) return false;
    if (r.already) return true;
    await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    const ok = await until(() => P.evalJs(`(() => { const w = ${W0}; return !!w && w.element.classList.contains('seamless-revealed') && w.titleBar.offsetHeight >= 20; })()`), 3000, 50);
    await sleep(250); // the 0.15 s height transition settles
    return !!ok;
  };
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
  check('the status strip names the scale (the chip says "2× · auto" since round 3 A3, its tooltip says ⋯ → Scale relaunches it) and the backend chip says what xpra is', !!o.x && !!o.x.chip && o.x.chip.shown && o.x.chip.text === '2× · auto' && /relaunches the app at another scale/.test(o.x.chip.title) && /streams each app window as pixels/.test(o.x.backendTitle), o.x && { chip: o.x.chip, backend: o.x.backendTitle });
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
      ['src/desktop-serve.js', "const knobs = backend.stream === 'xpra' ? M.scaleKnobs(pick.scale) : M.scaleKnobs(1);", 'const knobs = M.scaleKnobs(1); // pre-fix CONTROL'], // round 3 A3 respelled the lever (the pick is scalePick's)
      ['src/lib/xpra-proto.js', "'title', 'size-hints', 'size-constraints', 'class-instance'", "'title', 'size-hints', 'class-instance'"],
    ];
    let allOnce = true;
    for (const [f, from, to] of patches) { const src = fs.readFileSync(path.join(wtc, f), 'utf8'); if (src.split(from).length !== 2) allOnce = false; fs.writeFileSync(path.join(wtc, f), src.replace(from, to)); }
    check('CONTROL: each pre-fix lever is spelled exactly once in the tree (the control patches exactly those)', allOnce);
    execSync('npm run build', { cwd: wtc, stdio: 'ignore' });
    const [PORTH] = await freePorts(1);
    const homeH = scratchHome('deskxpra-hidpictl-home', fs);
    const sh = spawn(process.execPath, ['server.js'], { cwd: wtc, env: { ...srvEnv, ...VNC_ENV, PORT: String(PORTH), HOME: homeH }, stdio: 'ignore' }); ctlServers.push(sh);
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
      ['src/desktop-serve.js', "      if (own && M.streamKindOf(rec, backends) === 'xpra') {\n        const xd = await display.waitForXftDpi(", "      if (false) {\n        const xd = await display.waitForXftDpi("],
      ['src/desktop-apps.js', '  if (eff < Math.SQRT2) return eff;', '  return Math.min(2, Math.max(1, Math.round(normalizeDpr(dpr) * 2) / 2)); // r1 CONTROL (round 3 A3 respelled the auto rule: the lever is its first line)'],
    ];
    let once = true;
    for (const [f, from, to] of levers) { const src = fs.readFileSync(path.join(wtr, f), 'utf8'); if (src.split(from).length !== 2) { once = false; console.error(`    lever not spelled once in ${f}: ${from.slice(0, 70)}`); } fs.writeFileSync(path.join(wtr, f), src.replace(from, to)); }
    check('CONTROL (r1): each of the nine r2 levers is spelled exactly once in the tree (the control pulls back exactly those)', once);
    execSync('npm run build', { cwd: wtr, stdio: 'ignore' });
    const [PORTR] = await freePorts(1);
    const homeR = scratchHome('deskxpra-r2ctl-home', fs);
    const sr = spawn(process.execPath, ['server.js'], { cwd: wtr, env: { ...srvEnv, ...VNC_ENV, PORT: String(PORTR), HOME: homeR }, stdio: 'ignore' }); ctlServers.push(sr);
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
  // round 3 A2: a Stop closes the window itself (every client, from the broadcast) with a toast — never a dead "Stopped" shell
  const ended = await until(async () => { const s = await p1.evalJs(WIN(appId)); return s === null ? true : null; }, 15000);
  const stopToasts = await p1.evalJs(`[...document.querySelectorAll('#global-toasts > *')].map((e) => e.textContent)`);
  check('Stop ⇒ the window closes itself with the "<app> stopped" toast (round 3 A2)', !!ended && stopToasts.some((x) => /^vs-xpra-title stopped/.test(x)), { ended, stopToasts });
  await sleep(600);
  check('Stop leaves no xpra / Xvfb / xterm behind (every recorded pid gone)', [rec.pids.x, rec.pids.server, rec.pids.app].every((p) => !D.pidAlive(p)));

  // ── §8 B-bfe6: a BROWSER as a desktop app — launched from the dialog's Browsers section with an Open URL, on the
  // xpra rung like every app: the window maps, the URL argument landed (our own http server sees the browser's GET and
  // the title bar carries the page title xpra reports), the profile is the keeper's (the argv names it, the browser
  // wrote into it, 0700, never under $HOME), Stop removes it. Every browser row on this box is judged; one that cannot
  // launch here is SKIPPED with its reason (a snap's private /tmp cannot reach this run's scratch data dir — the
  // refusal itself is asserted by name) ──
  {
    const same2 = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    const M_LIMITS = require('../src/keeper-limits.js');
    const trustedClick = async (p, sel) => { const r = await p.evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`); if (r) await trustedClickAt(p, r.x, r.y); return !!r; };
    const hits = [];
    const PAGE_TITLE = `vs-bfe6 ${process.pid}`;
    const web = http.createServer((q, s) => { hits.push({ url: q.url, ua: String(q.headers['user-agent'] || '') }); s.writeHead(q.url.startsWith('/vs-bfe6') ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' }); s.end(q.url.startsWith('/vs-bfe6') ? `<!doctype html><title>${PAGE_TITLE}</title><body style="background:#fff"><h1>${PAGE_TITLE}</h1>` : ''); });
    const [WEB_PORT] = await freePorts(1);
    await new Promise((r) => web.listen(WEB_PORT, '127.0.0.1', r));
    try {
      const regB = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((d) => d.registry.filter((r) => r.browser))`);
      console.log(`  browser rows: ${regB.map((r) => `${r.id} → ${r.available ? `${r.exec} ${r.path}${r.confinement ? ' [' + r.confinement + ']' : ''}` : `UNAVAILABLE (${r.reason})`}`).join('; ')}`);
      check('the catalog serves the two browser families (chromium, firefox), each available or dimmed WITH a reason', same2(regB.map((r) => r.id).sort(), ['chromium', 'firefox']) && regB.every((r) => r.available || !!r.reason), regB);
      for (const row of regB) {
        if (!row.available) {
          if (/is a snap/.test(row.reason || '')) {
            const rr = await p1.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: ${JSON.stringify(row.id)} }) }).then(async (r) => ({ status: r.status, body: await r.json() }))`);
            check(`${row.id}: this box's ${row.id} is a SNAP — the launch is refused by name (409 snap-profile-unreachable), never a profile the snap would silently swap for its own`, rr.status === 409 && rr.body.code === 'snap-profile-unreachable', rr);
          }
          skip(`${row.id} window leg`, row.reason || 'not available');
          continue;
        }
        const url = `http://127.0.0.1:${WEB_PORT}/vs-bfe6-${row.id}`;
        const before = new Set((await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((d) => d.apps.map((a) => a.id))`)));
        // the dialog: open it, type the URL into the Browsers section's field, click the family's card
        await p1.evalJs(`(() => { document.getElementById('desktop-launch-dialog')?.remove(); document.getElementById('btn-desktop-apps').click(); return true; })()`);
        const card = await until(() => p1.evalJs(`(() => { const c = document.querySelector('#desktop-launch-dialog .desktop-launch-browsers .desktop-launch-card[data-app-id=${JSON.stringify(row.id)}]'); return c && !c.disabled ? { title: c.title, inBrowsers: !!c.closest('.desktop-launch-browsers-sec'), note: document.querySelector('#desktop-launch-dialog .desktop-launch-browser-note')?.textContent || '' } : null; })()`), 10000, 150);
        check(`${row.id}: its card sits under the dialog's Browsers heading and its tooltip carries the "your own browser window … the Agent browser is separate" note`, !!card && card.inBrowsers && /your own browser window \(an app\); the Agent browser is separate/.test(card.title) && card.note === 'This is your own browser window (an app); the Agent browser is separate', card);
        if (!card) continue;
        // a bad URL is refused IN the dialog, by the same pure function the server runs — nothing launched
        await p1.evalJs(`(() => { const i = document.querySelector('#desktop-launch-dialog .desktop-launch-url'); i.value = 'javascript:alert(1)'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
        await trustedClick(p1, `#desktop-launch-dialog .desktop-launch-browsers .desktop-launch-card[data-app-id="${row.id}"]`);
        await sleep(600);
        const afterBad = await p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((d) => d.apps.filter((a) => a.state === 'launching' || a.state === 'ready').map((a) => a.id))`);
        check(`${row.id}: a javascript: URL in the dialog is refused before any request (the dialog stays open, no session started)`, await p1.evalJs(`!!document.getElementById('desktop-launch-dialog')`) && afterBad.every((id) => before.has(id)), afterBad);
        await p1.evalJs(`(() => { const i = document.querySelector('#desktop-launch-dialog .desktop-launch-url'); i.value = ${JSON.stringify(url)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
        await trustedClick(p1, `#desktop-launch-dialog .desktop-launch-browsers .desktop-launch-card[data-app-id="${row.id}"]`);
        const recB = await until(() => p1.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((d) => d.apps.find((a) => a.appId === ${JSON.stringify(row.id)} && !${JSON.stringify([...before])}.includes(a.id) && (a.state === 'ready' || a.state === 'failed')) || null)`), 45000, 300);
        check(`${row.id}: the launch from the dialog reaches ready on the xpra rung (${recB && recB.backend})`, !!recB && recB.state === 'ready' && recB.backend === 'xpra', recB && { state: recB.state, lastError: recB.lastError });
        if (!recB || recB.state !== 'ready') continue;
        const profWant = path.join(wt, 'data', 'desktop-apps', recB.id, 'profile');
        check(`${row.id}: the record names the keeper's OWN profile dir (data/desktop-apps/<id>/profile) and the URL as the LAST argv item, after the profile flags`, recB.profileDir === profWant && recB.url === url && recB.args[recB.args.length - 1] === url && recB.args.findIndex((a) => a === profWant || a === `--user-data-dir=${profWant}`) >= 0 && recB.args.findIndex((a) => a === profWant || a === `--user-data-dir=${profWant}`) < recB.args.length - 1, { profileDir: recB.profileDir, args: recB.args });
        // Chrome rewrites its own /proc cmdline into ONE space-joined string (measured: `/opt/google/chrome/chrome --user-data-dir=… …`) — tokenised back here
        const cmd = (() => { try { return fs.readFileSync(`/proc/${recB.pids.app}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ').split(' ').filter(Boolean); } catch { return []; } })();
        check(`${row.id}: the RUNNING browser process (pid ${recB.pids.app}) carries that profile and that URL in its argv — and no automation flag`, cmd.some((a) => a === `--user-data-dir=${profWant}` || a === profWant) && cmd.includes(url) && !cmd.some((a) => /^--?(remote-debugging|enable-automation|headless|marionette)/.test(a)), cmd);
        // the window maps (our xpra client draws it) and the title bar carries the PAGE title xpra reports
        const winB = await until(async () => { const s = await p1.evalJs(WIN(recB.id)); return s && s.status === 'Connected' && s.windows.length && s.title && s.title.includes(PAGE_TITLE) ? s : null; }, 45000, 400);
        const winAny = winB || await p1.evalJs(WIN(recB.id));
        check(`${row.id}: the window maps in VibeSpace (status Connected, ${winAny && winAny.windows.length} window(s) in the session)`, !!winAny && winAny.status === 'Connected' && winAny.windows.length > 0, winAny && { status: winAny.status, windows: winAny.windows.length });
        check(`${row.id}: the VibeSpace title bar carries the page title xpra reports ("${winAny && winAny.title}")`, !!winB, winAny && winAny.title);
        const xs = await p1.evalJs(`fetch('/api/desktop/apps/${recB.id}/windows').then((r) => r.json())`);
        check(`${row.id}: X agrees — a mapped browser window titled with the page (${(xs.windows || []).map((w) => JSON.stringify(w.title)).join(', ')})`, (xs.windows || []).some((w) => (w.title || '').includes(PAGE_TITLE)), xs);
        const got = hits.filter((h) => h.url.startsWith(`/vs-bfe6-${row.id}`));
        check(`${row.id}: the URL argument LANDED — our http server served ${got.length} GET(s) of ${new URL(url).pathname} (UA ${got[0] ? got[0].ua.slice(0, 60) : 'none'})`, got.length > 0, hits.slice(-5));
        // the profile is the keeper's — the browser wrote into it; 0700; not under $HOME; the apps' $HOME has no profile of that browser
        const profEntries = (() => { try { return fs.readdirSync(profWant); } catch { return null; } })();
        // A PROFILE of that browser under $HOME = anything but Chrome's crashpad database: Chrome creates
        // `~/.config/<channel>/Crash Reports` (settings.dat + four empty dirs) whatever --user-data-dir says — measured with
        // strace on google-chrome 2026-09-23 — and opens the user's shared NSS store ~/.local/share/pki/nssdb; neither holds
        // a cookie, a history or a login. Everything else of the profile must be in the keeper's dir.
        const realRoots = ['.config/google-chrome', '.config/chromium', '.config/chromium-browser', '.mozilla'].flatMap((r) => { try { return fs.readdirSync(path.join(fakeHome, r)).filter((e) => e !== 'Crash Reports').map((e) => `${r}/${e}`); } catch { return []; } });
        check(`${row.id}: the browser wrote its profile INTO the keeper's dir (${profEntries ? profEntries.slice(0, 6).join(', ') : 'missing'}), mode ${profEntries ? (fs.statSync(profWant).mode & 0o777).toString(8) : '?'}`, !!profEntries && profEntries.length > 0 && (fs.statSync(profWant).mode & 0o777) === 0o700);
        check(`${row.id}: the profile is not under $HOME (${fakeHome}) and no ${row.id} profile appeared under $HOME (${realRoots.join(', ') || 'none'}; Chrome's crashpad dir aside)`, !profWant.startsWith(fakeHome + path.sep) && !realRoots.length, realRoots);
        const liveB = await p1.evalJs(`fetch('/api/desktop/apps/${recB.id}').then((r) => r.json())`);
        // 2026-09-25: the keeper's resource sample is a REPORT (never a stop): memBytes in its metric (PSS), rssBytes a deprecated fact
        if (liveB.live) console.log(`  ${row.id}: the keeper's last resource sample — ${(liveB.live.memBytes / 1048576).toFixed(0)} MB ${liveB.live.memMetric} (ΣVmRSS ${(liveB.live.rssBytes / 1048576).toFixed(0)} MB) over ${liveB.live.pids} process(es), ${liveB.live.cpuPct == null ? '?' : liveB.live.cpuPct.toFixed(0)} % CPU (reporting threshold ${M_LIMITS.GUARD_MEM_BYTES / 2 ** 30} GiB; over: ${liveB.live.over || 'no'})`);
        // Stop from the window ⇒ Stopped, nothing left, the profile removed
        await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(recB.id)}); w.content.querySelector('.desktop-app-stop').click(); return true; })()`);
        const endB = await until(async () => { const r = await p1.evalJs(`fetch('/api/desktop/apps/${recB.id}').then((r) => r.json())`); return r.state === 'exited' && r.profileRemovedAt ? r : null; }, 30000, 300);
        check(`${row.id}: Stop ⇒ exited, every recorded pid gone, THEN the profile removed (${endB && endB.profileRemovedAt ? 'profileRemovedAt set' : 'not removed'})`, !!endB && [recB.pids.x, recB.pids.server, recB.pids.app].every((p) => !D.pidAlive(p)) && !fs.existsSync(profWant), endB && { state: endB.state, profileError: endB.profileError, exists: fs.existsSync(profWant) });
        await p1.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(recB.id)}); if (w) app.wm.closeWindow ? app.wm.closeWindow(w.id) : null; return true; })()`).catch(() => {});
      }
    } finally { web.close(); }
  }

  // ── §9 ROUND 3, LANE A1 (docs/design-desktop-apps-seamless §3.1): THE PLAIN-HTTP GESTURE WINDOW on the real rung. A page by
  // HOSTNAME (never loopback — loopback is a secure context and proves nothing), GNOME Calculator on xpra: the user's own
  // trusted Ctrl+C in the pane ⇒ the calculator copies ⇒ its token is written to the browser clipboard with NO click (read
  // back from the secure loopback page: one browser, one clipboard); a token 5.5 s after the chord ⇒ the chip; a token
  // after a trusted key that is NOT a copy chord (fresh activation, no stamp) ⇒ the chip; the hint does not repeat ──
  console.log('§9 A1 — the plain-http gesture window: Ctrl+C in the app ⇒ the local clipboard with no click; late / chord-less ⇒ the chip');
  const CALC9 = bin('gnome-calculator');
  if (!hostResolves) skip('§9 the gesture window', `${HOSTNAME} does not resolve`);
  else if (!CALC9) skip('§9 the gesture window', 'gnome-calculator not on PATH');
  else if (!XCLIP) skip('§9 the gesture window', 'xclip not on PATH');
  else {
    // the READER is the secure loopback page (one browser, one clipboard): p1 is §5's replacement page by now — grant it the
    // clipboard again and emulate its focus (readText needs a focused document; the §2 grant was made through another page)
    await p1.cdp('Browser.grantPermissions', { origin: `http://127.0.0.1:${PORT}`, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
    await p1.cdp('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    const H9 = await mkPage(`http://${HOSTNAME}:${PORT}`, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
    let id9 = null;
    const kids9 = [];
    try {
      check(`§9: the hostname page (http://<hostname>:${PORT}) is NOT a secure context and has no clipboard API`, await H9.p.evalJs('window.isSecureContext === false && typeof navigator.clipboard === "undefined"'));
      const lc = await launchOn(H9.p, { exec: CALC9, args: [], label: 'vs-calc-a1' });
      const rc = lc && lc.id && await readyOn(H9.p, lc.id);
      check('§9: GNOME Calculator reaches ready on the xpra rung', !!rc && rc.backend === 'xpra', lc);
      if (rc) {
        id9 = rc.id;
        const xe9 = xenvFor(wt, rc);
        await H9.p.evalJs(`app.openDesktopApp(${JSON.stringify(id9)}); true`);
        await ensureActive(H9.p, id9);
        await sizeWinOn(H9.p, id9, 560, 760);
        const up9 = await until(async () => { const v = await H9.p.evalJs(R2(id9)); return v && v.status === 'Connected' && v.main && v.main.h > 100 ? v : null; }, 40000, 300);
        check('§9: the calculator window is connected on the hostname page', !!up9, await H9.p.evalJs(R2(id9)));
        await sleep(1500);
        // the pane's keyboard: focus its IME textarea by SCRIPT (no click — a click would be a gesture of its own)
        await H9.p.cdp('Page.bringToFront');
        await H9.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id9)}); app.wm.focusWindow(w.id); w._desktopAppView.focus(); return document.activeElement === w._desktopAppView.ime; })()`);
        const A9 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const v = w._desktopAppView; const h = v.copyHint; return { chip: v.chip.style.display !== 'none', chipText: v.chipText, hint: !!h && getComputedStyle(h).display !== 'none', last: v.client && v.client.lastReceived, toasts: [...document.querySelectorAll('#global-toasts > *')].map((e) => e.textContent) }; })()`;
        const type9 = async (chars) => { for (const ch of chars) { const k = keyOf(ch); await H9.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await H9.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); await sleep(120); } };
        const ctrlC9 = async () => {
          await H9.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
          await H9.p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
          await H9.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
          await H9.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 });
        };
        const readClip = async () => { await p1.cdp('Page.bringToFront'); const r = await p1.evalJs(`navigator.clipboard.readText().then((t) => t).catch((e) => 'err:' + e.message)`); await H9.p.cdp('Page.bringToFront'); return r; };
        const setClip = async (text) => { await p1.cdp('Page.bringToFront'); const r = await p1.evalJs(`navigator.clipboard.writeText(${JSON.stringify(text)}).then(() => 'ok').catch((e) => 'err:' + e.message)`); await H9.p.cdp('Page.bringToFront'); return r; };
        const hold9 = (text) => { const k = spawn('sh', ['-c', `printf '%s' ${JSON.stringify(text)} | ${XCLIP} -i -selection clipboard`], { env: xe9, stdio: 'ignore', detached: true }); kids9.push(k); xclipKids.push(k); };
        // (a) type 1 2 3 4 into the calculator, then the user's own Ctrl+C: the calculator copies "1234", the token is written — no click
        const wrote0 = await setClip('vs-a1-sentinel');
        await H9.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id9)}); w._desktopAppView.focus(); return true; })()`);
        await type9('1234');
        await sleep(600);
        const t0 = Date.now();
        await ctrlC9();
        const got = await until(async () => { const v = await H9.p.evalJs(A9(id9)); return v && v.last === '1234' ? { v, ms: Date.now() - t0 } : null; }, 5000, 25);
        await sleep(300);
        const after = await H9.p.evalJs(A9(id9));
        const clipA = await readClip();
        console.log(`  §9 (a): the calculator's token observed ${got ? got.ms : '?'} ms after the trusted Ctrl+C (poll 25 ms; the browser's window is 5000 ms); clipboard sentinel written: ${wrote0}; the browser clipboard now reads ${JSON.stringify(clipA)}; chip ${after.chip ? 'SHOWN' : 'hidden'}`);
        check(`§9 A1: the user's own Ctrl+C in the pane ⇒ the calculator copies "1234" and it LANDS in the browser clipboard with NO click (read back from the secure page: ${JSON.stringify(clipA)}), no chip, a "Copied to your clipboard" toast`, !!got && clipA === '1234' && !after.chip && after.toasts.some((x) => /Copied to your clipboard/.test(x)), { got, after, clipA });
        // (a2) desktop A r1: the gesture write's temporary textarea took the focus and dropped it to <body> — every key after
        // the copy was swallowed. The pane's IME holds the focus again, with NO script refocus (the legs below type without one)
        const focusA2 = await H9.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id9)}); const a = document.activeElement; return { ime: a === w._desktopAppView.ime, tag: a ? a.tagName : null }; })()`);
        check(`§9 A1 r1: after the gesture copy the keyboard focus is back on the pane's IME (activeElement ${focusA2.tag}) — the next keys reach the app`, focusA2.ime === true, focusA2);
        // (b) the stamp outlives nothing: a Ctrl+C whose token arrives 5.5 s later ⇒ the chip. The calculator's re-copy of the same
        // "1234" is DEDUPED by the client (no delivery, the stamp stays), so the only token after it is xclip's at +5.5 s
        await ctrlC9();
        await sleep(5500);
        hold9('vs-a1-late');
        const late = await until(async () => { const v = await H9.p.evalJs(A9(id9)); return v && v.chip && v.chipText === 'vs-a1-late' ? v : null; }, 8000, 150);
        const clipB = await readClip();
        check(`§9 A1: a token 5.5 s after the Ctrl+C (outside Chrome's activation window) ⇒ the "Copied in the app — click to copy" chip, and the browser clipboard is untouched (${JSON.stringify(clipB)})`, !!late && clipB === '1234', { late: late || await H9.p.evalJs(A9(id9)), clipB });
        check('§9 A1: the HTTPS hint is one-time per device — §2 showed it on this origin, this chip comes without it', !!late && !late.hint && await H9.p.evalJs(`!!localStorage.getItem('vibespace.desktopCopyHintShown')`), late);
        // (c) a FRESH trusted key that is not a copy chord (the page has activation, no stamp) + a copy nobody made here ⇒ the chip.
        // NO script refocus here (desktop A r1): the '5' must reach the calculator on the focus the gesture copy handed back — (d)
        // reading "12345" is the proof (before r1 the key went to <body> and (d) read "1234" again)
        await type9('5');
        const t1 = Date.now();
        hold9('vs-a1-agent-copy');
        const agentCopy = await until(async () => { const v = await H9.p.evalJs(A9(id9)); return v && v.chip && v.chipText === 'vs-a1-agent-copy' ? { v, ms: Date.now() - t1 } : null; }, 8000, 100);
        const clipC = await readClip();
        check(`§9 A1 CONTROL: a copy the user did not make (xclip on the app's display ${agentCopy ? agentCopy.ms : '?'} ms after a plain digit key — the page HAS activation, no copy chord) ⇒ the chip, never written behind the user's back (clipboard still ${JSON.stringify(clipC)})`, !!agentCopy && clipC === '1234', { agentCopy, clipC });
        // (d) and a second real Ctrl+C right after writes again (the calculator now shows 12345 — a fresh chord, a fresh token)
        const t2 = Date.now();
        await ctrlC9();
        const got2 = await until(async () => { const v = await H9.p.evalJs(A9(id9)); return v && v.last === '12345' ? { v, ms: Date.now() - t2 } : null; }, 5000, 25);
        await sleep(300);
        const clipD = await readClip();
        const afterD = await H9.p.evalJs(A9(id9));
        console.log(`  §9 (d): the second Ctrl+C's token observed ${got2 ? got2.ms : '?'} ms after the chord; clipboard ${JSON.stringify(clipD)}; chip ${afterD.chip ? `SHOWN (${JSON.stringify(afterD.chipText)})` : 'hidden'}`);
        check(`§9 A1: a second Ctrl+C writes the calculator's new value (${JSON.stringify(clipD)}) with no click, and the pending chip goes away (the clipboard now holds the newer copy)`, !!got2 && clipD === '12345' && !afterD.chip, { got2, clipD, afterD });
        check('§9 A1 r1: …and after the second gesture copy the pane\'s IME holds the focus again', await H9.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id9)}); return document.activeElement === w._desktopAppView.ime; })()`));
      }
    } catch (e) { failed++; console.error('  ✗ §9 threw:', e.stack || e.message); }
    finally {
      for (const k of kids9) { try { process.kill(-k.pid, 'SIGKILL'); } catch {} }
      if (id9) await H9.p.evalJs(`fetch('/api/desktop/apps/${id9}/stop', { method: 'POST' }).then((r) => r.status)`).catch(() => {});
      await dropPage(H9);
      await p1.cdp('Page.bringToFront').catch(() => {});
    }
  }

  // ── §10 ROUND 3, LANE A2 (docs/design-desktop-apps-seamless §3.2): THE APP'S EXIT CLOSES THE WINDOW; THE OUTER ✕ IS THE
  // APP'S OWN CLOSE. Two clients on the real rung (GNOME Calculator on xpra): the calculator's OWN ✕ (its CSD header bar,
  // clicked through the pane) ⇒ the VibeSpace window is gone on BOTH pages within 2 s, each with a "<app> exited" toast;
  // the OUTER ✕ (the title bar's, a trusted click) ⇒ close-window to the app ⇒ the calculator process is gone and both
  // windows with it; a Tk app that answers WM_DELETE_WINDOW with its own "Save?" dialog ⇒ the window STAYS (a dialog is
  // not the app), the dialog closing is not the app exiting, a SECOND ✕ within 5 s ⇒ Stop ⇒ gone on both; a dead record
  // replayed from the layout opens NO window (never painted); CONTROL = a copy of this tree whose window never closes
  // itself — the same ✕ leaves the dead picture (M3c's measurement, today's behaviour before A2) ──
  console.log('§10 A2 — the app exiting closes the window on every client; the outer ✕ asks the app; twice = Stop; a dead record opens nothing');
  const CALC10 = bin('gnome-calculator'), WISH10 = bin('wish');
  if (!CALC10) skip('§10 the close legs', 'gnome-calculator not on PATH');
  else {
    // p1 (and every page before) steps aside: the replay leg needs a moment with NO client, and a third client would only race the layout
    await p1.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
    const O10 = `http://127.0.0.1:${PORT}`;
    const A = await mkPage(O10, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
    const B = await mkPage(O10, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
    const has = (P, id) => P.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)})`);
    const toasts = (P) => P.evalJs(`[...document.querySelectorAll('#global-toasts > *')].map((e) => e.textContent)`);
    const verdictOf = (P, id, k) => P.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); return w ? w[${JSON.stringify(k)}] || null : 'gone'; })()`);
    /** both pages hold the app's window; A is the active viewer, B is blocked (x5) */
    const openOnBoth = async (id) => {
      await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`);
      await ensureActive(A.p, id);
      await sizeWinOn(A.p, id, 560, 760);
      const up = await until(async () => { const v = await A.p.evalJs(R2(id)); return v && v.status === 'Connected' && v.main && v.main.h > 100 ? v : null; }, 40000, 300);
      const onB = await until(() => has(B.p, id), 15000, 250); if (!onB) await B.p.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`);
      await until(() => has(B.p, id), 5000, 100);
      return up;
    };
    /** poll BOTH pages every 25 ms from `t0` until the window is gone on each; ms per page (null = still there at the deadline) */
    const goneTimes = async (id, t0, ms = 6000) => {
      const out = { a: null, b: null };
      const end = t0 + ms;
      while (Date.now() < end && (out.a === null || out.b === null)) {
        if (out.a === null && !(await has(A.p, id))) out.a = Date.now() - t0;
        if (out.b === null && !(await has(B.p, id))) out.b = Date.now() - t0;
        await sleep(25);
      }
      return out;
    };
    const titleClose = async (P, id) => { await revealBars(P, id); const r = await P.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); app.wm.focusWindow(w.id); const b = w.element.querySelector('.win-close').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`); await trustedClickAt(P, r.x, r.y); };
    const ids10 = [];
    try {
      // (1) the calculator's OWN ✕ — clicked on its CSD header bar through the pane (M3c: top-right, 22 px in)
      const l1 = await launchOn(A.p, { exec: CALC10, args: [], label: 'vs-calc-a2' });
      const r1 = l1 && l1.id && await readyOn(A.p, l1.id);
      check('§10: GNOME Calculator reaches ready on the xpra rung', !!r1 && r1.backend === 'xpra', l1);
      if (r1) {
        ids10.push(r1.id);
        const up = await openOnBoth(r1.id);
        check('§10 (1): the calculator is drawn on page A (active) and its window replayed on page B', !!up && await has(B.p, r1.id), up);
        await sleep(1200);
        const v = await A.p.evalJs(R2(r1.id));
        const cx = v.pane.x + (v.main.x + v.main.w) / v.ratio - 22, cy = v.pane.y + v.main.y / v.ratio + 22;
        const t0 = Date.now();
        await trustedClickAt(A.p, cx, cy);
        const g = await goneTimes(r1.id, t0);
        const recEnd = await A.p.evalJs(`fetch('/api/desktop/apps/${r1.id}').then((r) => r.json())`);
        const tA = await toasts(A.p), tB = await toasts(B.p);
        console.log(`  §10 (1): the calculator's own ✕ ⇒ the VibeSpace window gone on A after ${g.a} ms, on B after ${g.b} ms; record ${recEnd.state} (code ${recEnd.exitCode}, windowsAtExit ${recEnd.windowsAtExit}); toasts A ${JSON.stringify(tA)} B ${JSON.stringify(tB)}`);
        check(`§10 (1): the calculator's OWN ✕ ⇒ the record exited with no window left (windowsAtExit ${recEnd.windowsAtExit}) and the VibeSpace window is GONE on BOTH clients within 2 s (A ${g.a} ms, B ${g.b} ms)`, recEnd.state === 'exited' && recEnd.windowsAtExit === 0 && g.a !== null && g.b !== null && g.a <= 2000 && g.b <= 2000, { g, recEnd: { state: recEnd.state, windowsAtExit: recEnd.windowsAtExit, lastError: recEnd.lastError } });
        check('§10 (1): …each client said why in a toast ("Calculator exited")', tA.some((x) => /Calculator exited/.test(x)) && tB.some((x) => /Calculator exited/.test(x)), { tA, tB });
      }
      // (2) the OUTER ✕ (the title bar's, a trusted click on the ACTIVE pane) ⇒ close-window ⇒ the calculator quits ⇒ gone on both
      const l2 = await launchOn(A.p, { exec: CALC10, args: [], label: 'vs-calc-a2-outer' });
      const r2 = l2 && l2.id && await readyOn(A.p, l2.id);
      if (r2) {
        ids10.push(r2.id);
        await openOnBoth(r2.id);
        await sleep(1200);
        await revealBars(A.p, r2.id); // lane B: the calculator is seamless — the ✕ is revealed first; the clock starts at the click
        const t0 = Date.now();
        await titleClose(A.p, r2.id);
        const vd = await verdictOf(A.p, r2.id, '_desktopCloseVerdict');
        const g = await goneTimes(r2.id, t0);
        const appGone = await until(() => (!D.pidAlive(r2.pids.app) ? Date.now() - t0 : null), 5000, 25);
        const recEnd = await A.p.evalJs(`fetch('/api/desktop/apps/${r2.id}').then((r) => r.json())`);
        console.log(`  §10 (2): the outer ✕ ⇒ verdict ${JSON.stringify(vd)}; the calculator process (pid ${r2.pids.app}) gone after ${appGone} ms; the window gone on A after ${g.a} ms, on B after ${g.b} ms; record ${recEnd.state}, stoppedBy ${recEnd.stoppedBy || '-'}`);
        check(`§10 (2): the OUTER ✕ on the active pane ASKS the app (verdict ask-app, the window did not close itself at the click) and the calculator PROCESS is gone (${appGone} ms) — an app exit, not a Stop (stoppedBy ${recEnd.stoppedBy || 'none'})`, (vd === 'gone' || (vd && vd.act === 'ask-app')) && appGone !== null && recEnd.state === 'exited' && !recEnd.stoppedBy && recEnd.windowsAtExit === 0, { vd, recEnd: { state: recEnd.state, stoppedBy: recEnd.stoppedBy, windowsAtExit: recEnd.windowsAtExit } });
        check(`§10 (2): …and the window is gone on BOTH clients within 2 s of the ✕ (A ${g.a} ms, B ${g.b} ms)`, g.a !== null && g.b !== null && g.a <= 2000 && g.b <= 2000, g);
      }
      // (3) an app that answers WM_DELETE_WINDOW with its OWN dialog (Tk: `wm protocol . WM_DELETE_WINDOW` opens "Save?",
      // which closes itself after 1 s): the first ✕ keeps everything, the dialog closing is not the app exiting, a second ✕
      // within 5 s is the Stop
      if (!WISH10) skip('§10 (3) the second ✕', 'wish (Tk) not on PATH');
      else {
        const tk = path.join(fakeHome, 'vs-a2-save.tcl');
        fs.writeFileSync(tk, 'wm title . "vs-a2-tk"\nwm geometry . 420x300\nlabel .l -text "unsaved work"\npack .l -expand 1\nwm protocol . WM_DELETE_WINDOW {\n  if {![winfo exists .d]} { toplevel .d; wm title .d "Save?"; label .d.l -text "Save changes?"; pack .d.l -padx 20 -pady 20; wm transient .d .; after 1000 {destroy .d} }\n}\n');
        const l3 = await launchOn(A.p, { exec: WISH10, args: [tk], label: 'vs-a2-tk' });
        const r3 = l3 && l3.id && await readyOn(A.p, l3.id);
        check('§10 (3): the Tk stand-in (answers WM_DELETE_WINDOW with its own "Save?" dialog) reaches ready', !!r3, l3);
        if (r3) {
          ids10.push(r3.id);
          await openOnBoth(r3.id);
          await sleep(1000);
          const firstAt = Date.now();
          await titleClose(A.p, r3.id);
          const dlg = await until(async () => { const v = await A.p.evalJs(WIN(r3.id)); return v && v.windows.some((w) => w.kind === 'dialog' || /Save\?/.test(w.title || '')) ? v : null; }, 4000, 50);
          const tA = await toasts(A.p);
          check('§10 (3): the first ✕ ⇒ the APP answers with its own "Save?" dialog (drawn in the pane) and the VibeSpace window stays on both pages, with the toast naming the second ✕', !!dlg && await has(A.p, r3.id) && await has(B.p, r3.id) && tA.some((x) => /press ✕ again within 5 s to stop it/.test(x)), { dlg: dlg && dlg.windows, tA });
          // the dialog closes by itself (after 1 s): a lost DIALOG is not the app exiting
          const dlgGone = await until(async () => { const v = await A.p.evalJs(WIN(r3.id)); return v && !v.windows.some((w) => /Save\?/.test(w.title || '') || w.kind === 'dialog') ? v : null; }, 4000, 50);
          await sleep(300);
          const mid = await A.p.evalJs(`fetch('/api/desktop/apps/${r3.id}').then((r) => r.json())`);
          check('§10 (3): the dialog closing is NOT the app exiting — the record stays ready, the window stays on both pages', !!dlgGone && mid.state === 'ready' && await has(A.p, r3.id) && await has(B.p, r3.id), { mid: mid.state, dlgGone: !!dlgGone });
          // the SECOND ✕ within 5 s of the first ⇒ Stop ⇒ gone on both
          const t0 = Date.now();
          await titleClose(A.p, r3.id);
          const g = await goneTimes(r3.id, t0, 8000);
          const recEnd = await A.p.evalJs(`fetch('/api/desktop/apps/${r3.id}').then((r) => r.json())`);
          const tA2 = await toasts(A.p), tB2 = await toasts(B.p);
          console.log(`  §10 (3): the second ✕ ${t0 - firstAt} ms after the first ⇒ record ${recEnd.state} stoppedBy ${recEnd.stoppedBy}; gone on A after ${g.a} ms, on B after ${g.b} ms; toasts A ${JSON.stringify(tA2)} B ${JSON.stringify(tB2)}`);
          check(`§10 (3): a SECOND ✕ ${t0 - firstAt} ms after the first (within 5 s) ⇒ Stop (stoppedBy ${recEnd.stoppedBy}) ⇒ the window gone on BOTH clients (A ${g.a} ms, B ${g.b} ms) with "vs-a2-tk stopped"`, t0 - firstAt < 5000 && recEnd.state === 'exited' && recEnd.stoppedBy === 'user' && g.a !== null && g.b !== null && tA2.some((x) => /vs-a2-tk stopped/.test(x)) && tB2.some((x) => /vs-a2-tk stopped/.test(x)), { g, recEnd: { state: recEnd.state, stoppedBy: recEnd.stoppedBy }, tA2, tB2 });
          check('§10 (3): Stop left nothing of the Tk app running', [r3.pids.x, r3.pids.server, r3.pids.app].every((p) => !D.pidAlive(p)));
        }
      }
      // (3b) desktop A r1 — xterm, an app with NO client-side decorations, on the OUTER ✕ (the verifier's attack). xterm honours
      // WM_DELETE_WINDOW by HANGING UP its child (SIGHUP to the shell) and exits when the child does. Measured 2026-09-24: an
      // interactive bash exits on the hangup ⇒ the first ✕ ends xterm; a child that survives SIGHUP keeps xterm running, and
      // the second ✕ within 5 s (the toast names it) is the Stop. The verifier's plain `xterm` ran $SHELL = zsh in a HOME with no
      // .zshrc — zsh's first-run menu survives SIGHUP (by hand on Xvfb: the same xterm exits once the HOME has an empty .zshrc);
      // it was never xterm ignoring the ✕. The stand-in here is DETERMINISTIC: a shell loop with SIGHUP ignored.
      const BASH10 = bin('bash'), SH10 = bin('sh');
      if (!XTERM || !BASH10) skip('§10 (3b) the xterm legs', 'xterm / bash not on PATH');
      else {
        const l5 = await launchOn(A.p, { exec: XTERM, args: ['-T', 'vs-a2-xterm-bash', '-geometry', '60x10', '-e', BASH10, '--norc', '-i'], label: 'vs-a2-xterm-bash' });
        const r5 = l5 && l5.id && await readyOn(A.p, l5.id);
        check('§10 (3b): xterm running an interactive bash reaches ready', !!r5, l5);
        if (r5) {
          ids10.push(r5.id);
          await openOnBoth(r5.id);
          await sleep(1000);
          const t0 = Date.now();
          await titleClose(A.p, r5.id);
          const vd = await verdictOf(A.p, r5.id, '_desktopCloseVerdict');
          const g = await goneTimes(r5.id, t0, 6000);
          const recEnd = await A.p.evalJs(`fetch('/api/desktop/apps/${r5.id}').then((r) => r.json())`);
          console.log(`  §10 (3b): xterm + interactive bash, the outer ✕ ⇒ verdict ${JSON.stringify(vd)}; record ${recEnd.state} stoppedBy ${recEnd.stoppedBy || '-'}; gone on A after ${g.a} ms, on B after ${g.b} ms`);
          check(`§10 (3b): the OUTER ✕ ends an xterm with an interactive bash by itself (ask-app ⇒ xterm hangs up its shell ⇒ exits: ${recEnd.state}, not a Stop) and the window is gone on BOTH clients within 3 s (A ${g.a} ms, B ${g.b} ms)`, (vd === 'gone' || (vd && vd.act === 'ask-app')) && recEnd.state === 'exited' && !recEnd.stoppedBy && g.a !== null && g.b !== null && g.a <= 3000 && g.b <= 3000 && !D.pidAlive(r5.pids.app), { vd, recEnd: { state: recEnd.state, stoppedBy: recEnd.stoppedBy }, g });
        }
        if (!SH10) skip('§10 (3b) the hangup-proof leg', 'sh not on PATH');
        else {
          const l6 = await launchOn(A.p, { exec: XTERM, args: ['-T', 'vs-a2-xterm-nohup', '-geometry', '60x10', '-e', SH10, '-c', 'trap "" HUP; while :; do sleep 1; done'], label: 'vs-a2-xterm-nohup' });
          const r6 = l6 && l6.id && await readyOn(A.p, l6.id);
          check('§10 (3b): xterm running a child that ignores SIGHUP (the stand-in for zsh\'s first-run menu) reaches ready', !!r6, l6);
          if (r6) {
            ids10.push(r6.id);
            await openOnBoth(r6.id);
            await sleep(1500);
            const firstAt = Date.now();
            await titleClose(A.p, r6.id);
            const vd = await verdictOf(A.p, r6.id, '_desktopCloseVerdict');
            await sleep(2000);
            const mid = await A.p.evalJs(`fetch('/api/desktop/apps/${r6.id}').then((r) => r.json())`);
            const tA = await toasts(A.p);
            const stays = vd && vd.act === 'ask-app' && mid.state === 'ready' && D.pidAlive(r6.pids.app) && await has(A.p, r6.id) && await has(B.p, r6.id);
            check(`§10 (3b): the first ✕ ASKS (verdict ${JSON.stringify(vd)}) and a child that survives xterm's hangup keeps it running — record ${mid.state} 2 s later, the window on both pages, and the toast names the second ✕ (never silent)`, stays && tA.some((x) => /Asked .* to close — press ✕ again within 5 s to stop it/.test(x)), { vd, mid: mid.state, tA });
            if (stays) {
            const t0 = Date.now();
            await titleClose(A.p, r6.id);
            const g = await goneTimes(r6.id, t0, 8000);
            const recEnd = await A.p.evalJs(`fetch('/api/desktop/apps/${r6.id}').then((r) => r.json())`);
            console.log(`  §10 (3b): xterm + a hangup-proof child, the second ✕ ${t0 - firstAt} ms after the first ⇒ record ${recEnd.state} stoppedBy ${recEnd.stoppedBy}; gone on A after ${g.a} ms, on B after ${g.b} ms`);
            check(`§10 (3b): …the second ✕ ${t0 - firstAt} ms after the first ⇒ Stop (stoppedBy ${recEnd.stoppedBy}) ⇒ the window gone on BOTH clients and nothing of the xterm left`, t0 - firstAt < 5000 && recEnd.state === 'exited' && recEnd.stoppedBy === 'user' && g.a !== null && g.b !== null && [r6.pids.x, r6.pids.server, r6.pids.app].every((p) => !D.pidAlive(p)), { g, recEnd: { state: recEnd.state, stoppedBy: recEnd.stoppedBy } });
            }
          }
        }
      }
      // (4) a BLOCKED pane's ✕ does not ask the app (it cannot drive it): the window closes as it always did (the layout is
      // shared — every client's copy goes with it) and the app keeps running
      const l4 = await launchOn(A.p, { exec: XTERM, args: ['-T', 'vs-a2-blocked', '-geometry', '60x10'], label: 'vs-a2-blocked' });
      const r4 = l4 && l4.id && await readyOn(A.p, l4.id);
      if (r4) {
        ids10.push(r4.id);
        await openOnBoth(r4.id);
        await until(async () => { const s = await B.p.evalJs(SEAT(r4.id)); return s && s.mode === 'blocked' ? s : null; }, 10000, 200);
        await titleClose(B.p, r4.id);
        await sleep(800);
        const recMid = await A.p.evalJs(`fetch('/api/desktop/apps/${r4.id}').then((r) => r.json())`);
        check('§10 (4): a BLOCKED pane\'s ✕ (verdict not-active) closes its window without asking the app — the app keeps running', !(await has(B.p, r4.id)) && recMid.state === 'ready' && D.pidAlive(r4.pids.app), { state: recMid.state });
        if (!(await has(A.p, r4.id))) await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(r4.id)}); true`); // the layout is shared: B's close took A's copy too — open it again for (5)
        await until(() => has(A.p, r4.id), 5000, 100);
        // (5) the replay of a DEAD record opens NO window: the window is in the saved layout, NO client is connected when the app
        // ends (so nobody closes it), and a fresh page's layout restore meets `exited` at its first GET — never painted
        await sleep(2600); // the layout autosave (2 s debounce) holds A's window
        const saved = await A.p.evalJs(`fetch('/api/layouts').then((r) => r.json()).then((l) => JSON.stringify(l).includes(${JSON.stringify(r4.id)}))`);
        await dropPage(A); await dropPage(B);
        await sleep(500);
        const st = await (await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${r4.id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
        const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
        const C = { p: await page(t), t };
        await C.p.cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
        // every desktop-app window this page ever creates is watched from the first script: was it ever shown (the pending class removed while attached)?
        await C.p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__a2 = { born: 0, revealed: 0, toasts: [] }; new MutationObserver((ms) => { for (const m of ms) { if (m.type === 'childList') for (const n of m.addedNodes) { if (n.classList && n.classList.contains('desktop-app-pending')) window.__a2.born++; if (n.classList && n.classList.contains('global-toast')) setTimeout(() => window.__a2.toasts.push(n.textContent), 0); } else if (m.type === 'attributes' && m.target.classList && m.target.classList.contains('window') && m.oldValue && m.oldValue.includes('desktop-app-pending') && !m.target.classList.contains('desktop-app-pending') && m.target.isConnected) window.__a2.revealed++; } }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });` });
        await openPage(C.p, O10);
        await sleep(1500);
        const a2 = await C.p.evalJs('window.__a2');
        const tC = a2.toasts || []; // every toast the page showed since its first script (a 3.5 s toast is gone by the time the restore settles)
        check(`§10 (5): a dead record replayed from the layout opens NO window — the layout held it (${saved}), it was stopped with no client (${st.state}), the fresh page created it pending (${a2.born}) and closed it before it ever showed (revealed ${a2.revealed}), with the "stopped" toast`, saved && st.state === 'exited' && a2.born >= 1 && a2.revealed === 0 && !(await has(C.p, r4.id)) && tC.some((x) => /^vs-a2-blocked stopped/.test(x)), { saved, st: st.state, a2, tC });
        await dropPage(C);
      }
      // (6) CONTROL — the pre-A2 window: a copy of this tree whose window never closes itself (the verdict's close line pulled
      // back) — the calculator's own ✕ leaves the VibeSpace window standing as a dead picture (M3c, 2026-09-23)
      const wtc = scratch('deskxpra-a2ctl');
      try { execSync(`git worktree remove --force ${wtc}`, { cwd: repo, stdio: 'ignore' }); } catch {}
      execSync(`git worktree add --detach ${wtc} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtc);
      for (const f of ['src', 'public', 'server.js', 'scripts', 'package.json']) execSync(`rm -rf ${wtc}/${f} && cp -r ${wt}/${f} ${wtc}/${f}`);
      fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtc, 'node_modules'));
      fs.mkdirSync(path.join(wtc, 'data'), { recursive: true });
      const winSrc = fs.readFileSync(path.join(wtc, 'src/lib/desktop-app-window.js'), 'utf8');
      const closeLine = '    if (!v.close) return false;';
      check('CONTROL: the window\'s close decision is spelled exactly once (the control pulls exactly it back)', winSrc.split(closeLine).length === 2);
      fs.writeFileSync(path.join(wtc, 'src/lib/desktop-app-window.js'), winSrc.replace(closeLine, '    return false; // pre-A2 CONTROL: the window never closes itself'));
      execSync('npm run build', { cwd: wtc, stdio: 'ignore' });
      const [PORTA] = await freePorts(1);
      const homeA = scratchHome('deskxpra-a2ctl-home', fs);
      const sa = spawn(process.execPath, ['server.js'], { cwd: wtc, env: { ...srvEnv, ...VNC_ENV, PORT: String(PORTA), HOME: homeA }, stdio: 'ignore' }); ctlServers.push(sa);
      let upA = false; for (let i = 0; i < 80 && !upA; i++) { try { await fetch(`http://127.0.0.1:${PORTA}/api/home`); upA = true; } catch { await sleep(250); } }
      check('CONTROL: the pre-A2 copy boots', upA);
      if (upA) {
        const CT = await mkPage(`http://127.0.0.1:${PORTA}`, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
        try {
          const lc = await launchOn(CT.p, { exec: CALC10, args: [], label: 'vs-calc-a2-ctl' });
          const rc = lc && lc.id && await readyOn(CT.p, lc.id);
          if (rc) {
            await CT.p.evalJs(`app.openDesktopApp(${JSON.stringify(rc.id)}); true`);
            await sizeWinOn(CT.p, rc.id, 560, 760);
            const vc = await until(async () => { const v = await CT.p.evalJs(R2(rc.id)); return v && v.status === 'Connected' && v.main && v.main.h > 100 ? v : null; }, 40000, 300);
            await sleep(1200);
            if (vc) await trustedClickAt(CT.p, vc.pane.x + (vc.main.x + vc.main.w) / vc.ratio - 22, vc.pane.y + vc.main.y / vc.ratio + 22);
            const ex = await until(() => CT.p.evalJs(`fetch('/api/desktop/apps/${rc.id}').then((r) => r.json()).then((r) => (r.state === 'exited' ? r : null))`), 6000, 100);
            await sleep(2000);
            const still = await CT.p.evalJs(WIN(rc.id));
            check(`CONTROL: on the pre-A2 copy the same ✕ ends the app (${ex && ex.state}) and the VibeSpace window STAYS as a dead picture 2 s later (status ${JSON.stringify(still && still.status)}) — the leg above is the fix, not a coincidence`, !!ex && !!still, { ex: ex && ex.state, still });
          } else check('CONTROL: the calculator reaches ready on the pre-A2 copy', false, lc);
        } finally { await dropPage(CT); }
      }
      try { sa.kill('SIGKILL'); } catch {}
    } catch (e) { failed++; console.error('  ✗ §10 threw:', e.stack || e.message); }
    finally {
      for (const id of ids10) await fetch(`http://127.0.0.1:${PORT}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      await dropPage(A); await dropPage(B);
    }
  }
  // ── (11) round 3 A3 (docs/design-desktop-apps-seamless §3.4) — THE SCALE DERIVED FROM VIBESPACE'S OWN SCALE, PER WINDOW:
  // a DPR-2 page at UI scale 125 % launches GNOME Calculator from the LAUNCHER (its catalog card — the product's own POST):
  // auto ⇒ 2.5× = GDK_SCALE 2 in the app's environ + Xft.dpi 120 in its display, the chip "2.5× · auto"; then ⋯ → Scale ▸
  // 1.5× → the confirm → the SAME VibeSpace window on BOTH clients now shows the successor at 1.5× (GDK_SCALE 1, 144 dpi),
  // the old session gone; CONTROL = a copy whose keeper ignores the UI scale (the pre-A3 pick): the same page gets 2× / 96 ──
  console.log('§11 A3 — the scale derived from dpr × UI scale (DPR 2 + 125 % ⇒ GDK_SCALE 2 + Xft.dpi 120, measured in the app\'s display); the ⋯ Scale ▸ relaunch on two clients');
  const CALC11 = bin('gnome-calculator'), XRDB11 = bin('xrdb');
  if (!CALC11 || !XRDB11) skip('§11 the scale legs', `${!CALC11 ? 'gnome-calculator' : 'xrdb'} not on PATH`);
  else {
    const O11 = `http://127.0.0.1:${PORT}`;
    const ids11 = [];
    const envOf = (pid) => { try { return Object.fromEntries(fs.readFileSync(`/proc/${pid}/environ`, 'latin1').split('\0').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch { return {}; } };
    const inside = (w, r) => { const xe = xenvFor(w, r); return { gdk: envOf(r.pids.app).GDK_SCALE || null, xft: Number((xq(xe, 'xrdb', ['-query']).match(/^Xft\.dpi:\s+(\d+)/m) || [])[1]) || null, xdpy: (xq(xe, 'xdpyinfo', []).match(/resolution:\s+(\S+)/) || [])[1] || null }; };
    const trustedClick = async (p, sel) => { const r = await p.evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`); if (r) await trustedClickAt(p, r.x, r.y); return !!r; };
    const S11 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const v = w._desktopAppView; const c = v && v.client; const chip = w.content.querySelector('.desktop-app-chip-scale'); const more = w.content.querySelector('.desktop-app-more'); return { wmId: w.id, appId: w._desktopAppId, spec: w._openSpec, status: v ? v.status.textContent : null, constraints: c ? c.mainConstraints : null, main: c && c.windows.get(c.mainWid) ? { w: c.windows.get(c.mainWid).w, h: c.windows.get(c.mainWid).h } : null, chip: chip ? { shown: chip.style.display !== 'none', text: chip.textContent, title: chip.title } : null, more: more ? { shown: more.style.display !== 'none', svg: !!more.querySelector('svg') } : null, menu: w._desktopScaleMenu ? w._desktopScaleMenu() : null, n: [...app.wm.windows.values()].filter((x) => x.type === 'desktop-app').length }; })()`;
    let A = null, B = null;
    try {
      await p1.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
      A = await mkPage(O11, { width: 1400, height: 1000, deviceScaleFactor: 2, mobile: false });
      await A.p.evalJs(`localStorage.setItem('vibespace.uiScale', '125'); true`);
      await openPage(A.p, O11);
      const aScale = await A.p.evalJs(`[devicePixelRatio, getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim()]`);
      check(`§11: the page runs at devicePixelRatio ${aScale[0]} and UI scale ${aScale[1]}`, aScale[0] === 2 && aScale[1] === '1.25', aScale);
      // (1) the LAUNCHER's own POST: the catalog card (dpr + uiScale are the launcher's, never this suite's)
      const before = new Set((await A.p.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((l) => l.apps.map((a) => a.id))`)) || []);
      await A.p.evalJs(`(() => { document.getElementById('desktop-launch-dialog')?.remove(); document.getElementById('btn-desktop-apps').click(); return true; })()`);
      const card = await until(() => A.p.evalJs(`(() => { const c = document.querySelector('#desktop-launch-dialog .desktop-launch-card[data-app-id="gnome-calculator"]'); return c && !c.disabled ? true : null; })()`), 10000, 150);
      check('§11 (1): the launcher offers GNOME Calculator as a catalog card', !!card);
      await trustedClick(A.p, '#desktop-launch-dialog .desktop-launch-card[data-app-id="gnome-calculator"]');
      const id0 = await until(() => A.p.evalJs(`fetch('/api/desktop/apps').then((r) => r.json()).then((l) => (l.apps.find((a) => !${JSON.stringify([...before])}.includes(a.id) && a.appId === 'gnome-calculator') || {}).id || null)`), 15000, 200);
      if (id0) ids11.push(id0);
      const r0 = id0 && await readyOn(A.p, id0);
      check('§11 (1): the calculator reaches ready', !!r0, id0);
      if (r0) {
        await ensureActive(A.p, id0);
        await sizeWinOn(A.p, id0, 700, 900);
        const s0 = await until(async () => { const v = await A.p.evalJs(S11(id0)); return v && v.status === 'Connected' && v.constraints && v.constraints['minimum-size'] ? v : null; }, 40000, 300);
        const in0 = inside(wt, r0);
        const min0 = (s0 && s0.constraints && s0.constraints['minimum-size']) || [0, 0];
        console.log(`  §11 (1): record scale ${r0.scale} dpi ${r0.dpi} origin ${r0.scaleOrigin} from ${JSON.stringify(r0.scaleFrom)}; inside the display: GDK_SCALE=${in0.gdk}, Xft.dpi ${in0.xft}, xdpyinfo ${in0.xdpy}; the calculator's minimum ${JSON.stringify(min0)} device px (2× alone: 720x1232); chip ${JSON.stringify(s0 && s0.chip && s0.chip.text)}`);
        check(`§11 (1): DPR 2 × UI 1.25 through the launcher ⇒ the record says 2.5× at 120 dpi, origin auto, from {dpr 2, uiScale 1.25}`, r0.scale === 2.5 && r0.dpi === 120 && r0.scaleOrigin === 'auto' && r0.scaleFrom && r0.scaleFrom.dpr === 2 && r0.scaleFrom.uiScale === 1.25, { scale: r0.scale, dpi: r0.dpi, origin: r0.scaleOrigin, from: r0.scaleFrom });
        check(`§11 (1): MEASURED inside the app's display — GDK_SCALE=${in0.gdk} in the calculator's environ, Xft.dpi ${in0.xft} in its resource database`, in0.gdk === '2' && in0.xft === 120, in0);
        // GNOME Calculator 50's minimum is BUTTON-bound (measured: 720x1232 at 2.5× / 120 dpi exactly as at 2× / 96 — its 120-dpi
        // text fits inside the 2× buttons; and 360x616 at 1.5× / 144): the widgets half is asserted here, the TEXT half is
        // measured where a text-bound window exists — test-desktop-app-keeper §20 (a) (xterm's 40×10 cells, 1.25× at 120 dpi)
        check(`§11 (1): the calculator draws its widgets at 2× — its minimum ${JSON.stringify(min0)} is the 2× floor 720x1232 (1×: 360x616)`, min0[0] >= 720 && min0[1] >= 1232, min0);
        check(`§11 (1): the chip names the value AND its origin (${JSON.stringify(s0 && s0.chip)}) and the ⋯ button is there (an SVG)`, !!s0 && !!s0.chip && s0.chip.shown && s0.chip.text === '2.5× · auto' && /devicePixelRatio 2 × UI scale 125%/.test(s0.chip.title) && /text at 120 dpi/.test(s0.chip.title) && !!s0.more && s0.more.shown && s0.more.svg, s0 && { chip: s0.chip, more: s0.more });
        // (2) a second client (DPR 1) holds the same window (the layout sync), blocked — its menu is disabled with the reason
        B = await mkPage(O11, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
        const onB = await until(() => B.p.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id0)})`), 15000, 250); if (!onB) await B.p.evalJs(`app.openDesktopApp(${JSON.stringify(id0)}); true`);
        const bm = await until(async () => { const v = await B.p.evalJs(S11(id0)); return v && v.menu && v.menu.why ? v : null; }, 10000, 250);
        // (page B shares the origin's localStorage, so its UI scale is A's 125 %: at DPR 1 its auto would derive 1 × 1.25 = 1.25)
        check(`§11 (2): on the second client (not the active viewer) Scale ▸ is disabled with the reason (${bm && bm.menu && bm.menu.why}); auto there would derive ${bm && bm.menu && bm.menu.rows[0].scale}× (DPR 1 × its 125 %)`, !!bm && bm.menu.why === 'seat' && bm.menu.rows.every((r) => r.disabled) && bm.menu.rows[0].scale === 1.25, bm && bm.menu);
        const wmA = s0 && s0.wmId, wmB = bm && bm.wmId;
        // (3) ⋯ → Scale ▸ → 1.5× (text only in GTK apps) → the confirm → Relaunch — real clicks
        await revealBars(A.p, id0); // lane B: the calculator is seamless — its strip (and the ⋯) folded until revealed
        const mb = await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id0)}); const r = w.content.querySelector('.desktop-app-more').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        await trustedClickAt(A.p, mb.x, mb.y); await sleep(300);
        const par = await A.p.evalJs(`(() => { const el = [...document.querySelectorAll('.context-menu > .context-menu-item')].find((e) => /^Scale/.test(e.textContent)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + 12, y: r.y + r.height / 2, rows: [...el.querySelectorAll('.context-menu .context-menu-item')].map((c) => ({ text: c.textContent, disabled: c.classList.contains('disabled') })) }; })()`);
        check(`§11 (3): ⋯ opens the window's menu with Scale ▸ Auto / 1× / 1.5× / 2× (${JSON.stringify(par && par.rows)}) — auto is current and not offered again`, !!par && par.rows.length === 4 && /Auto \(2\.5×\)/.test(par.rows[0].text) && par.rows[0].text.startsWith('✓') && par.rows[0].disabled && par.rows.slice(1).every((r) => !r.disabled), par);
        if (par) {
          await A.p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: par.x, y: par.y }); await sleep(300);
          const kid = await A.p.evalJs(`(() => { const el = [...document.querySelectorAll('.context-menu .context-menu .context-menu-item')].find((e) => /1\.5×/.test(e.textContent)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
          if (kid) { await A.p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: kid.x, y: kid.y }); await sleep(150); await trustedClickAt(A.p, kid.x, kid.y); }
          const dlg = await until(() => A.p.evalJs(`(() => { const o = [...document.querySelectorAll('.dialog-overlay, .modal-overlay')].pop(); const b = o && o.querySelector('.btn-create'); return b ? { text: o.textContent, ok: b.textContent } : null; })()`), 5000, 100);
          check(`§11 (3): the pick asks first, saying the app restarts and unsaved work is lost (${JSON.stringify(dlg)})`, !!dlg && /restarts at the new scale; unsaved work in it is lost/.test(dlg.text) && dlg.ok === 'Relaunch', dlg);
          const t0 = Date.now();
          await A.p.evalJs(`(() => { const o = [...document.querySelectorAll('.dialog-overlay, .modal-overlay')].pop(); o.querySelector('.btn-create').click(); return true; })()`);
          // (4) the SAME window on both clients follows the successor
          const follow = async (P, wmId) => until(async () => { const v = await P.evalJs(`(() => { const w = app.wm.windows.get(${JSON.stringify(wmId)}); return w && w._desktopAppId !== ${JSON.stringify(id0)} ? { appId: w._desktopAppId, spec: w._openSpec } : null; })()`); return v; }, 20000, 100);
          const fa = await follow(A.p, wmA); const faMs = Date.now() - t0;
          const fb = await follow(B.p, wmB); const fbMs = Date.now() - t0;
          const id1 = fa && fa.appId;
          if (id1) ids11.push(id1);
          const r1 = id1 && await readyOn(A.p, id1);
          const readyMs = Date.now() - t0;
          check(`§11 (4): the SAME VibeSpace window (${wmA}) now shows the successor ${id1} (${faMs} ms, openSpec ${JSON.stringify(fa && fa.spec)}) — and on the second client too (${wmB} → ${fb && fb.appId}, ${fbMs} ms)`, !!fa && !!fb && fb.appId === id1 && fa.spec && fa.spec.id === id1 && fb.spec && fb.spec.id === id1, { fa, fb });
          if (r1) {
            const s1 = await until(async () => { const v = await A.p.evalJs(S11(id1)); return v && v.status === 'Connected' && v.constraints && v.constraints['minimum-size'] ? v : null; }, 40000, 300);
            const in1 = inside(wt, r1);
            const min1 = (s1 && s1.constraints && s1.constraints['minimum-size']) || [0, 0];
            const old = await (await fetch(`${O11}/api/desktop/apps/${id0}`)).json();
            const nB = await B.p.evalJs(S11(id1));
            console.log(`  §11 (4): relaunch → ready ${readyMs} ms; successor scale ${r1.scale} dpi ${r1.dpi} origin ${r1.scaleOrigin}; inside: GDK_SCALE=${in1.gdk}, Xft.dpi ${in1.xft}; minimum ${JSON.stringify(min1)}; chip ${JSON.stringify(s1 && s1.chip && s1.chip.text)}; old ${old.state} stoppedBy ${old.stoppedBy} replacedBy ${old.replacedBy}, its app pid ${r0.pids.app} alive ${D.pidAlive(r0.pids.app)}; desktop-app windows: A ${s1 && s1.n}, B ${nB && nB.n}`);
            check(`§11 (4): the successor runs at the CHOSEN 1.5× — the record (${r1.scale}×, ${r1.dpi} dpi, ${r1.scaleOrigin}) and MEASURED inside its display (GDK_SCALE=${in1.gdk}, Xft.dpi ${in1.xft}: text only in GTK)`, r1.scale === 1.5 && r1.dpi === 144 && r1.scaleOrigin === 'chosen' && in1.gdk === '1' && in1.xft === 144, { r1: { scale: r1.scale, dpi: r1.dpi, origin: r1.scaleOrigin }, in1 });
            check(`§11 (4): the picture reconnected to the successor (${s1 && s1.status}) and its widgets are 1× again (minimum ${JSON.stringify(min1)}: under 720 wide, 616..1232 high)`, !!s1 && s1.status === 'Connected' && min1[0] > 300 && min1[0] < 720 && min1[1] >= 616 && min1[1] < 1232, min1);
            check(`§11 (4): the chip says "1.5× · chosen" (${JSON.stringify(s1 && s1.chip && s1.chip.text)})`, !!s1 && !!s1.chip && s1.chip.text === '1.5× · chosen', s1 && s1.chip);
            // desktop A r1: the seat is CARRIED — the client that chose the scale (A) holds the successor's seat with no Resume,
            // the other one (B, blocked before) is blocked again, whichever retargeted first (the verifier saw B win the race)
            const SEAT11 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const s = w._desktopSeats || {}; const ov = w.content.querySelector('.desktop-app-blocked'); return { pane: w._desktopPaneKey, active: s.active || null, known: !!s.known, mode: w._desktopAppView && w._desktopAppView.mode, overlay: !!ov && getComputedStyle(ov).display !== 'none' }; })()`;
            const seatA = await until(async () => { const v = await A.p.evalJs(SEAT11(id1)); return v && v.known && v.active ? v : null; }, 8000, 150);
            const seatB = await B.p.evalJs(SEAT11(id1));
            check(`§11 (4) A r1: the client that chose the scale is ACTIVE on the successor with no Resume (seat ${seatA && seatA.active}, its pane ${seatA && seatA.pane}, mode ${seatA && seatA.mode}, overlay ${seatA && seatA.overlay}); the other client is blocked (${seatB && seatB.pane})`, !!seatA && seatA.active === seatA.pane && seatA.mode === 'active' && !seatA.overlay && !!seatB && seatB.pane !== seatA.pane && seatB.active === seatA.pane, { seatA, seatB });
            check(`§11 (4): the old session stopped for the relaunch and names its successor (${old.state}, ${old.stoppedBy}, ${old.replacedBy}); its calculator is gone`, old.state === 'exited' && old.stoppedBy === 'relaunch' && old.replacedBy === id1 && !D.pidAlive(r0.pids.app), { state: old.state, stoppedBy: old.stoppedBy, replacedBy: old.replacedBy });
            check(`§11 (4): one window per client, never a duplicate or a closed one (A ${s1 && s1.n}, B ${nB && nB.n}); nobody still names the old id`, !!s1 && s1.n === 1 && !!nB && nB.n === 1 && !(await A.p.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id0)})`)) && !(await B.p.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id0)})`)));
          }
        }
      }
      // (5) CONTROL — the pre-A3 keeper (the setting + dpr only; the UI scale never reaches the pick) on a copy of this tree:
      // the SAME page (DPR 2, 125 %) gets 2× at 96 dpi — the (1) leg is the derivation, not a coincidence
      const wtc = scratch('deskxpra-a3ctl');
      try { execSync(`git worktree remove --force ${wtc}`, { cwd: repo, stdio: 'ignore' }); } catch {}
      execSync(`git worktree add --detach ${wtc} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtc);
      for (const f of ['src', 'public', 'server.js', 'scripts', 'package.json']) execSync(`rm -rf ${wtc}/${f} && cp -r ${wt}/${f} ${wtc}/${f}`);
      fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtc, 'node_modules'));
      fs.mkdirSync(path.join(wtc, 'data'), { recursive: true });
      const kSrc = fs.readFileSync(path.join(wtc, 'src/desktop-serve.js'), 'utf8'); // lane C1: the launch is the machine half's
      const pickLine = "const pick = opts.scaleChoice ? M.scalePick({ choice: opts.scaleChoice, dpr: v.launch.dpr, uiScale: v.launch.uiScale }) : M.scalePick({ setting: serverSetting('desktop.appScale'), dpr: v.launch.dpr, uiScale: v.launch.uiScale });";
      check('CONTROL: the keeper\'s scale pick is spelled exactly once (the control replaces exactly it)', kSrc.split(pickLine).length === 2);
      fs.writeFileSync(path.join(wtc, 'src/desktop-serve.js'), kSrc.replace(pickLine, "const pick = { scale: M.appScaleFor(serverSetting('desktop.appScale'), v.launch.dpr), origin: null, from: null }; // pre-A3 CONTROL: dpr only"));
      const [PORTC] = await freePorts(1);
      const homeC = scratchHome('deskxpra-a3ctl-home', fs);
      const sc = spawn(process.execPath, ['server.js'], { cwd: wtc, env: { ...srvEnv, ...VNC_ENV, PORT: String(PORTC), HOME: homeC }, stdio: 'ignore' }); ctlServers.push(sc);
      let upC = false; for (let i = 0; i < 80 && !upC; i++) { try { await fetch(`http://127.0.0.1:${PORTC}/api/home`); upC = true; } catch { await sleep(250); } }
      check('CONTROL: the pre-A3 copy boots', upC);
      if (upC) {
        await A.p.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
        await openPage(A.p, `http://127.0.0.1:${PORTC}`); // the same page: DPR 2, localStorage uiScale 125 is per origin — set it here too
        await A.p.evalJs(`localStorage.setItem('vibespace.uiScale', '125'); true`); await openPage(A.p, `http://127.0.0.1:${PORTC}`);
        const lc = await A.p.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: 'gnome-calculator', dpr: devicePixelRatio, uiScale: Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) }) }).then((r) => r.json())`);
        const rc = lc && lc.id && await readyOn(A.p, lc.id);
        const inC = rc ? inside(wtc, rc) : null;
        check(`CONTROL: on the pre-A3 copy the same DPR-2 / 125 % client gets ${rc && rc.scale}× with Xft.dpi ${inC && inC.xft} — the UI scale never reached the app`, !!rc && rc.scale === 2 && inC && inC.xft === 96 && inC.gdk === '2', { rc: rc && { scale: rc.scale, dpi: rc.dpi }, inC });
        if (lc && lc.id) await fetch(`http://127.0.0.1:${PORTC}/api/desktop/apps/${lc.id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      }
      try { sc.kill('SIGKILL'); } catch {}
    } catch (e) { failed++; console.error('  ✗ §11 threw:', e.stack || e.message); }
    finally {
      for (const id of ids11) await fetch(`${O11}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      if (A) await A.p.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`).catch(() => {});
      await dropPage(A); await dropPage(B);
    }
  }

  // ── §12 ROUND 3, LANE B (docs/design-desktop-apps-seamless §3.3; D3 decided as recommended 2026-09-25): SEAMLESS. GNOME
  // Calculator (client-side decorations: xpra says `decorations: 0`) ⇒ `.window.seamless` — NO VibeSpace title bar or status
  // strip over the app (both 0 high); a TRUSTED drag of the app's OWN header bar by 120×64 moves the VibeSpace window by
  // exactly that while the X main window stays at 0,0 (xpra's initiate-moveresize → WindowManager.beginDragFromPointer); the
  // app's own ─ □ buttons (MEASURED: GTK 4.22 paints all three under xpra 6.5.3) minimize / maximize / restore OUR window,
  // and our restore re-maps the app; a 250 ms hover of the top edge and Alt reveal both bars (a crossing does not; they
  // linger 1.5 s after the pointer returns into the app; leaving folds); the pauses — an agent lease, a tab chain, a phone
  // viewport, a blocked (not connected) pane — show the bars; the escape hatches — the taskbar menu's Show window frame ▸
  // On (per app, synced to a second client), the global setting off; the plain-http copy chip FLOATS over the folded strip
  // and hides after 10 s; the idle stop's last minute is a toast; a click into the picture activates the window; xterm
  // (no header bar) is never seamless. CONTROL = a copy of this tree whose verdict is forced false (the pre-lane look):
  // the bars everywhere ──
  console.log('§12 lane B — seamless: a CSD app loses our chrome, its header bar drags our window, hover / Alt reveal, the pauses and the hatches');
  const CALC12 = bin('gnome-calculator');
  if (!CALC12) skip('§12 the seamless legs', 'gnome-calculator not on PATH');
  else {
    const O12 = `http://127.0.0.1:${PORT}`;
    const ids12 = [];
    let A = null, B = null, H = null;
    const SM = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const v = w._desktopAppView; const c = v && v.client; const main = c && c.windows.get(c.mainWid); const er = w.element.getBoundingClientRect(); const pr = v && v.pane ? v.pane.getBoundingClientRect() : null; const vis = (el) => !!el && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0; const ov = w.content.querySelector('.desktop-app-blocked'); const probe = document.createElement('div'); probe.style.color = 'var(--border-active)'; document.body.appendChild(probe); const activeColor = getComputedStyle(probe).color; probe.remove(); return { wmId: w.id, seamless: w.element.classList.contains('seamless'), revealed: w.element.classList.contains('seamless-revealed'), v: w._desktopSeamless || null, tbH: w.titleBar.offsetHeight, barH: v && v.bar ? v.bar.offsetHeight : null, statusVisible: vis(v && v.status), moreVisible: vis(w.content.querySelector('.desktop-app-more')), win: { x: er.x, y: er.y, w: er.width, h: er.height }, left: parseFloat(w.element.style.left), top: parseFloat(w.element.style.top), pane: pr && { x: pr.x, y: pr.y, w: pr.width, h: pr.height }, main: main ? { x: main.x, y: main.y, w: main.w, h: main.h, decorations: main.meta.decorations, iconic: main.meta.iconic, xMax: main.meta.maximized } : null, status: v ? v.status.textContent : null, mr: w._desktopMoveResizeLog || [], st: w._desktopStateLog || [], maximized: !!w.isMaximized, minimized: !!w.isMinimized, active: app.wm.activeWindowId === w.id, border: getComputedStyle(w.element).borderTopWidth, borderColor: getComputedStyle(w.element).borderTopColor, activeColor, overlay: !!ov && getComputedStyle(ov).display !== 'none', chip: v && v.chip ? { shown: vis(v.chip), rect: (() => { const r = v.chip.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })() } : null, idleWarned: w._desktopIdleWarned || null, chain: !!w._tabChain }; })()`;
    const mouse = async (P, type, x, y, extra = {}) => P.cdp('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const xTop = async (id) => { const r = await A.p.evalJs(`fetch('/api/desktop/apps/${id}/windows').then((r) => r.json())`); const rows = (r && r.windows) || []; return rows.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0] || null; };
    try {
      await p1.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
      A = await mkPage(O12, { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
      // UI scale 100 % for the pixel legs (an earlier section's page left the origin's vibespace.uiScale behind — the drag is
      // judged in viewport px anyway, the window's own rect)
      await A.p.evalJs(`localStorage.removeItem('vibespace.uiScale'); true`); await openPage(A.p, O12);
      check('§12: the page runs at UI scale 100 %', (await A.p.evalJs(`getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() || '1'`)) === '1');
      await A.p.cdp('Page.bringToFront');
      const lc = await launchOn(A.p, { appId: 'gnome-calculator' });
      if (lc && lc.id) ids12.push(lc.id);
      const rc = lc && lc.id && await readyOn(A.p, lc.id);
      check('§12: GNOME Calculator reaches ready on the xpra rung', !!rc && rc.stream === 'xpra', lc);
      if (rc) {
        const id = rc.id;
        await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`);
        await ensureActive(A.p, id);
        await sizeWinOn(A.p, id, 900, 680);
        const s0 = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.status === 'Connected' && v.main && v.seamless ? v : null; }, 40000, 250);
        await sleep(1200);
        const s1 = await A.p.evalJs(SM(id));
        console.log(`  §12 (1): verdict ${JSON.stringify(s1.v)}, title bar ${s1.tbH} px, status strip ${s1.barH} px, pane ${s1.pane && `${s1.pane.w}×${s1.pane.h}`} (the window ${s1.win.w}×${s1.win.h}), X main ${JSON.stringify(s1.main)}`);
        check(`§12 (1) CSD: the calculator's main window says decorations 0 ⇒ .window.seamless (${JSON.stringify(s1.v)})`, !!s0 && s1.seamless && s1.v.seamless && s1.v.why === 'csd' && s1.main.decorations === 0, s1.v);
        check(`§12 (1): the VibeSpace title bar is 0 high (offsetHeight ${s1.tbH}) and the status strip too (${s1.barH}) — the status words not visible; the pane is the whole window inside its 1 px frame`, s1.tbH === 0 && s1.barH === 0 && !s1.statusVisible && Math.abs(s1.pane.h - (s1.win.h - 2)) <= 1 && Math.abs(s1.pane.w - (s1.win.w - 2)) <= 1, s1);
        check(`§12 (1) the honest list — focus = the 1 px border: the active seamless window keeps a ${s1.border} frame in --border-active (${s1.borderColor})`, s1.active && s1.border === '1px' && s1.borderColor === s1.activeColor, { border: s1.border, color: s1.borderColor, want: s1.activeColor });
        // (2) THE HEADER-BAR DRAG: a trusted press on the app's own header bar, 20 moves to +120/+64, release
        const hx = s1.pane.x + 150, hy = s1.pane.y + 22;
        await mouse(A.p, 'mouseMoved', hx, hy);
        await mouse(A.p, 'mousePressed', hx, hy, { button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= 20; i++) { await mouse(A.p, 'mouseMoved', hx + 6 * i, hy + 3.2 * i, { button: 'left', buttons: 1 }); await sleep(30); }
        await sleep(300);
        await mouse(A.p, 'mouseReleased', hx + 120, hy + 64, { button: 'left', buttons: 0, clickCount: 1 });
        await sleep(1200);
        const s2 = await A.p.evalJs(SM(id));
        const x2 = await xTop(id);
        const dl = Math.round((s2.win.x - s1.win.x) * 10) / 10, dt = Math.round((s2.win.y - s1.win.y) * 10) / 10; // viewport px (the rect) — what the pointer moved
        console.log(`  §12 (2): the window moved ${dl}/${dt} px on screen (style left/top ${s1.left},${s1.top} → ${s2.left},${s2.top}); moveresize log ${JSON.stringify(s2.mr.map((m) => [m.direction, m.op, m.started]))}; X main (client) ${s2.main && `${s2.main.x},${s2.main.y}`}, X server ${x2 && `${x2.x},${x2.y} ${x2.w}×${x2.h}`}`);
        check(`§12 (2): a drag of the app's OWN header bar by 120×64 moves the VibeSpace window by ${dl}/${dt} (±2) — through the window manager's own drag (initiate-moveresize direction 8, started)`, Math.abs(dl - 120) <= 2 && Math.abs(dt - 64) <= 2 && s2.mr.length >= 1 && s2.mr[0].direction === 8 && s2.mr[0].started === true, s2.mr);
        check(`§12 (2): the X main window stays at 0,0 (the client's ${s2.main && `${s2.main.x},${s2.main.y}`}, the X server's ${x2 && `${x2.x},${x2.y}`}) — the belt never moves; still seamless`, !!s2.main && s2.main.x === 0 && s2.main.y === 0 && !!x2 && x2.x === 0 && x2.y === 0 && s2.seamless, { main: s2.main, x2 });
        check(`§12 (2) MEASURED: GTK4 answers the release with a MOVERESIZE_CANCEL (direction 11) AFTER the drop — a no-op (the log: ${JSON.stringify(s2.mr.map((m) => [m.direction, m.started]))})`, s2.mr.some((m) => m.direction === 11 && m.started === false) && Math.abs(dl - 120) <= 2, s2.mr);
        // (3) THE APP'S OWN ─ □ BUTTONS (measured: GTK 4.22 under xpra 6.5.3 paints minimize, maximize, close at the right of its header bar)
        const ink = await A.p.evalJs(`(async () => { const r = ${JSON.stringify(s2.pane)}; return true; })()`);
        void ink;
        const shot = await A.p.cdp('Page.captureScreenshot', { format: 'png', clip: { x: s2.pane.x + s2.pane.w - 120, y: s2.pane.y + 4, width: 120, height: 36, scale: 1 } });
        const blobs = await A.p.evalJs(`(async () => { const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.data)}; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; const bg = [d[0], d[1], d[2]]; const box = (cx) => { let n = 0; for (let y = 8; y < 28; y++) for (let xx = cx - 9; xx < cx + 9; xx++) { const i = (y * c.width + xx) * 4; if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40) n++; } return n; }; return { min: box(120 - 98), max: box(120 - 61), close: box(120 - 24), gap: box(120 - 80) }; })()`);
        console.log(`  §12 (3) MEASURED the header bar's right end (ink pixels per 18×20 box): minimize ${blobs.min}, maximize ${blobs.max}, close ${blobs.close}, the gap between ${blobs.gap}`);
        check(`§12 (3) MEASURED: GTK4 under xpra 6.5.3 PAINTS minimize / maximize / close in the calculator's header bar (ink ${blobs.min} / ${blobs.max} / ${blobs.close}; the gap between ${blobs.gap})`, blobs.min > 20 && blobs.max > 20 && blobs.close > 20 && blobs.gap < Math.min(blobs.min, blobs.max) / 2, blobs);
        await trustedClickAt(A.p, s2.pane.x + s2.pane.w - 61, s2.pane.y + 22);
        const s3 = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.maximized && v.main && v.main.w > s2.main.w ? v : null; }, 8000, 150);
        check(`§12 (3): the app's OWN maximize button ⇒ window-metadata {maximized:true} ⇒ OUR window maximized (${JSON.stringify(s3 && s3.st)}) and the app re-fitted to the whole workspace (${s3 && s3.main && `${s3.main.w}×${s3.main.h}`})`, !!s3 && s3.st.some((e) => e.act === 'maximize') && s3.main.w > s2.main.w, s3 && { st: s3.st, main: s3.main });
        await sleep(800);
        const s3b = await A.p.evalJs(SM(id));
        await trustedClickAt(A.p, s3b.pane.x + s3b.pane.w - 61, s3b.pane.y + 22);
        const s4 = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.maximized && v.st.some((e) => e.act === 'restore') ? v : null; }, 5000, 150);
        check(`§12 (3): its restore button ⇒ {maximized:false} ⇒ ours restored to where it was (${s4 && `${s4.left},${s4.top}`} = ${s2.left},${s2.top})`, !!s4 && s4.left === s2.left && s4.top === s2.top, s4 && { left: s4.left, top: s4.top, st: s4.st });
        // (3b) FIX r1 — A DRAG OFF A MAXIMIZED WINDOW tells the app it is no longer maximized (window.js's un-maximize says
        // onResize ⇒ setAppState): the app's own button shows maximize again and ONE click maximizes. LIVE CONTROL first: the
        // same drag with this window's onResize muted (the pre-fix silence) leaves the app believing it is maximized — the
        // verifier's repro (its restore glyph stays; its next click is dead)
        const WQ = `[...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)})`;
        const maxByApp = async () => { const v0 = await A.p.evalJs(SM(id)); await trustedClickAt(A.p, v0.pane.x + v0.pane.w - 61, v0.pane.y + 22); const v = await until(async () => { const x = await A.p.evalJs(SM(id)); return x && x.maximized && x.main && x.main.xMax === true ? x : null; }, 6000, 150); await sleep(900); return v; };
        const dragHeader = async (v) => { const x0 = v.pane.x + 300, y0 = v.pane.y + 22; await mouse(A.p, 'mouseMoved', x0, y0); await mouse(A.p, 'mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 }); for (let i = 1; i <= 20; i++) { await mouse(A.p, 'mouseMoved', x0 + 6 * i, y0 + 3.2 * i, { button: 'left', buttons: 1 }); await sleep(30); } await sleep(300); await mouse(A.p, 'mouseReleased', x0 + 120, y0 + 64, { button: 'left', buttons: 0, clickCount: 1 }); };
        await sleep(800);
        const mc = await maxByApp();
        await A.p.evalJs(`(() => { const w = ${WQ}; w._vsRealOnResize = w.onResize; w.onResize = () => {}; return true; })()`);
        if (mc) await dragHeader(mc);
        await sleep(1500);
        const mcD = await A.p.evalJs(SM(id));
        await A.p.evalJs(`(() => { const w = ${WQ}; w.onResize = w._vsRealOnResize; delete w._vsRealOnResize; w.onResize(); return true; })()`);
        const mcSync = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.main && v.main.xMax === false ? v : null; }, 5000, 150);
        check(`§12 (3b) CONTROL: with the un-maximize unsaid (onResize muted) the same drag leaves ours ${mcD && (mcD.maximized ? 'maximized' : 'restored')} while the app still believes it is MAXIMIZED (X meta ${mcD && mcD.main && mcD.main.xMax}) — the verifier's dead-click state; saying it afterwards re-syncs (${mcSync && mcSync.main.xMax})`, !!mc && !!mcD && !mcD.maximized && mcD.main.xMax === true && !!mcSync, { mc: !!mc, ours: mcD && mcD.maximized, x: mcD && mcD.main && mcD.main.xMax });
        await sleep(600);
        const mf = await maxByApp();
        if (mf) await dragHeader(mf);
        const mfD = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.maximized && v.main && v.main.xMax === false ? v : null; }, 4000, 150);
        const mfD2 = mfD || await A.p.evalJs(SM(id));
        check(`§12 (3b): the app's header-bar drag off its MAXIMIZED window restores ours AND tells the app (X meta maximized ${mfD2 && mfD2.main && mfD2.main.xMax}) — its button is maximize again`, !!mf && !!mfD, { ours: mfD2 && mfD2.maximized, x: mfD2 && mfD2.main && mfD2.main.xMax });
        await sleep(900);
        const mfA = await A.p.evalJs(SM(id));
        await A.p.evalJs(`(() => { const w = ${WQ}; w._desktopStateLog = []; return true; })()`);
        await trustedClickAt(A.p, mfA.pane.x + mfA.pane.w - 61, mfA.pane.y + 22);
        const mfM = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.maximized ? v : null; }, 4000, 150);
        check(`§12 (3b): …and the app's maximize button maximizes ours in ONE click (${JSON.stringify(mfM ? mfM.st : (await A.p.evalJs(SM(id))).st)})`, !!mfM && mfM.st.some((e) => e.act === 'maximize'));
        await sleep(900);
        if (mfM) { const r = await A.p.evalJs(SM(id)); await trustedClickAt(A.p, r.pane.x + r.pane.w - 61, r.pane.y + 22); await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.maximized ? v : null; }, 5000, 150); }
        await sleep(800);
        const s4b = await A.p.evalJs(SM(id));
        await trustedClickAt(A.p, s4b.pane.x + s4b.pane.w - 98, s4b.pane.y + 22);
        const s5 = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.minimized ? v : null; }, 5000, 150);
        check('§12 (3): its minimize button ⇒ {iconic:true} ⇒ OUR window minimized', !!s5 && s5.st.some((e) => e.act === 'minimize'), s5 && s5.st);
        await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); app.wm.restore(w.id); return true; })()`);
        const s6 = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.minimized && v.main && v.main.iconic === false ? v : null; }, 6000, 150);
        await sleep(1200);
        const m6 = await measurePane(A.p, id);
        check(`§12 (3): restoring OUR window tells the display (the app is un-iconified — its metadata ${s6 && JSON.stringify(s6.main && { iconic: s6.main.iconic })}) and the app draws again (${m6 && (m6.inBrightFrac * 100).toFixed(0)} % of the window painted)`, !!s6 && !!m6 && m6.inBrightFrac > 0.5, { s6: s6 && s6.main, m6: m6 && m6.inBrightFrac });
        // (4) THE HOT ZONE: a crossing does not reveal; 250 ms of hover does; back into the app lingers 1.5 s; leaving folds
        const s7 = await A.p.evalJs(SM(id));
        const tx = s7.win.x + 300, ty = s7.win.y + 2, cx = s7.pane.x + s7.pane.w / 2, cy = s7.pane.y + s7.pane.h / 2;
        await mouse(A.p, 'mouseMoved', cx, cy); await sleep(100);
        await mouse(A.p, 'mouseMoved', tx, ty); await sleep(110);
        await mouse(A.p, 'mouseMoved', cx, cy); await sleep(400);
        const cross = await A.p.evalJs(SM(id));
        check('§12 (4): a pointer CROSSING the top edge (110 ms) reveals nothing', !cross.revealed && cross.tbH === 0, cross.reveal);
        await mouse(A.p, 'mouseMoved', tx, ty); await sleep(120);
        const early = await A.p.evalJs(SM(id));
        await sleep(330);
        const hov = await A.p.evalJs(SM(id));
        console.log(`  §12 (4): hover of the top edge: at 120 ms revealed=${early.revealed}, at 450 ms revealed=${hov.revealed} (title bar ${hov.tbH} px, status strip ${hov.barH} px, ⋯ visible ${hov.moreVisible})`);
        check(`§12 (4): a 250 ms hover of the top edge reveals BOTH bars (not at 120 ms; at 450 ms the title bar is ${hov.tbH} px, the strip ${hov.barH} px with its status and the ⋯)`, !early.revealed && hov.revealed && hov.tbH >= 20 && hov.barH >= 16 && hov.statusVisible && hov.moreVisible, { early: early.tbH, hov });
        check(`§12 (4): a reveal never resizes the pane (the bars OVERLAY the app: ${hov.pane.w}×${hov.pane.h} = ${s7.pane.w}×${s7.pane.h})`, hov.pane.h === s7.pane.h && hov.pane.w === s7.pane.w);
        // FIX r1 — while the bars show, the top edge's handle band is still a RESIZE (the bars sit under the handles); LIVE
        // CONTROL: the same probe with the lane's first z-index (25) put back hits the title bar there — a press would drag
        const HIT = `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const r = w.element.getBoundingClientRect(); const at = (x, y) => { const e = document.elementFromPoint(x, y); return e ? String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className) : ''; }; return { rev: w.element.classList.contains('seamless-revealed'), n: at(r.x + 300, r.y + 2), nw: at(r.x + 3, r.y + 3), ne: at(r.right - 3, r.y + 3), bar: at(r.x + 300, r.y + 16) }; })()`;
        const hit = await A.p.evalJs(HIT);
        const hitC = await A.p.evalJs(`(() => { const st = document.createElement('style'); st.id = 'vs-ctl-z25'; st.textContent = '.window.seamless > .window-titlebar { z-index: 25 !important; }'; document.head.appendChild(st); const h = ${HIT}; st.remove(); return h; })()`);
        console.log(`  §12 (4) revealed hit test: ${JSON.stringify(hit)}; CONTROL (z 25): ${JSON.stringify(hitC)}`);
        check(`§12 (4): revealed, the top edge is still the RESIZE band — top+2 ${hit.n}, the corners ${hit.nw} / ${hit.ne}; 16 px down is the title bar (${hit.bar})`, hit.rev && /\bresize-n\b/.test(hit.n) && /resize-nw/.test(hit.nw) && /resize-ne/.test(hit.ne) && /window-title/.test(hit.bar), hit);
        check(`§12 (4) CONTROL: with the title bar back at z-index 25 the same points hit the title bar (${hitC.n}, ${hitC.nw}) — a press there would DRAG`, hitC.rev && /window-title/.test(hitC.n) && /window-title/.test(hitC.nw), hitC);
        await mouse(A.p, 'mouseMoved', cx, cy); await sleep(700);
        const linger = await A.p.evalJs(SM(id));
        await sleep(1300);
        const folded = await A.p.evalJs(SM(id));
        check(`§12 (4): back into the app the bars linger (at 0.7 s revealed=${linger.revealed}) and fold after 1.5 s (at 2.0 s revealed=${folded.revealed}, title bar ${folded.tbH} px)`, linger.revealed && !folded.revealed && folded.tbH === 0, { linger: linger.reveal, folded: folded.reveal });
        await mouse(A.p, 'mouseMoved', tx, ty); await sleep(450);
        await mouse(A.p, 'mouseMoved', s7.win.x + s7.win.w + 60, s7.win.y + 200); await sleep(250);
        const left12 = await A.p.evalJs(SM(id));
        check('§12 (4): leaving the WINDOW folds at once (leave = fold)', !left12.revealed && left12.tbH === 0, left12.reveal);
        // (5) ALT: held ⇒ both bars at once; released ⇒ the linger, then fold
        await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); app.wm.focusWindow(w.id); w._desktopAppView.focus(); return true; })()`);
        await A.p.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 1 });
        await sleep(120);
        const alt = await A.p.evalJs(SM(id));
        await A.p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 0 });
        await sleep(2000);
        const altUp = await A.p.evalJs(SM(id));
        check(`§12 (5): Alt held reveals both bars AT ONCE (title bar ${alt.tbH} px, strip ${alt.barH} px); released, they fold after the linger (${altUp.tbH} px)`, alt.revealed && alt.tbH >= 20 && alt.barH >= 16 && !altUp.revealed && altUp.tbH === 0, { alt: alt.reveal, altUp: altUp.reveal });
        // (6) A CLICK INTO THE PICTURE ACTIVATES THE WINDOW (the pane cancels its pointerdown — no mousedown ever focused it; measured before the fix)
        const probeId = await A.p.evalJs(`(() => { const w = app.wm.createWindow({ title: 'vs-seam-probe', type: 'terminal', x: 1000, y: 600, width: 320, height: 200 }); app.wm.focusWindow(w.id); return w.id; })()`);
        const sA = await A.p.evalJs(SM(id));
        await trustedClickAt(A.p, sA.pane.x + 200, sA.pane.y + Math.min(300, sA.pane.h / 2));
        await sleep(300);
        check('§12 (6): a click into the app\'s picture makes its VibeSpace window the ACTIVE one (another window held the focus)', !sA.active && (await A.p.evalJs(SM(id))).active);
        // (7) THE PAUSES — a tab chain: the tab bar lives in the title bar ⇒ the bars show; leaving the chain ⇒ seamless again
        await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); app.wm.createTabChain(w, app.wm.windows.get(${JSON.stringify(probeId)})); app.wm.switchTab ? app.wm.switchTab(w._tabChain, 0) : 0; return true; })()`);
        const ch = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.chain && !v.seamless ? v : null; }, 4000, 100);
        check(`§12 (7) PAUSE chain: in a tab group the window is NOT seamless (why ${ch && ch.v.why}) and its title bar — the tab bar — shows (${ch && ch.tbH} px)`, !!ch && ch.v.why === 'chain' && ch.v.paused && ch.tbH >= 20, ch && ch.v);
        await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); app.wm.removeFromTabChain(w._tabChain, ${JSON.stringify(probeId)}); return true; })()`);
        const unch = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.chain && v.seamless && v.tbH === 0 ? v : null; }, 4000, 100);
        check('§12 (7): leaving the chain ⇒ seamless again (the title bar folds)', !!unch && unch.tbH === 0, unch && unch.v);
        await A.p.evalJs(`(() => { app.wm.closeWindow(${JSON.stringify(probeId)}); return true; })()`);
        // — a phone viewport (≤ 768): the title bar is a phone's only way back
        await A.p.cdp('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false });
        const ph = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.v && v.v.why === 'phone' ? v : null; }, 4000, 100);
        check(`§12 (7) PAUSE phone: a 700 px viewport ⇒ not seamless (why ${ph && ph.v.why}) — the phone layout's own chrome, never folded`, !!ph && !ph.seamless && ph.v.paused, ph && ph.v);
        await A.p.cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
        await sizeWinOn(A.p, id, 900, 680);
        const back = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.seamless ? v : null; }, 6000, 150);
        check('§12 (7): back to 1400 px ⇒ seamless again', !!back);
        // — an AGENT LEASE: the user must SEE an agent is driving ⇒ the bars (with the mode badge) show while it holds the app
        if (!fs.existsSync(FAKE_CLAUDE)) skip('§12 (7) the lease pause', 'no fake claude');
        else {
          const wsMain = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
          const msgs = []; wsMain.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch {} });
          await new Promise((r, e) => { wsMain.on('open', r); wsMain.on('error', e); });
          wsMain.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: fakeHome, cols: 80, rows: 24, reqId: 'seam12', name: 'seam-agent' }));
          const created = await until(() => msgs.find((m) => m.type === 'created' && m.reqId === 'seam12'), 20000, 100);
          const token = created && await until(() => { for (const f of fs.readdirSync(path.join(wt, 'data', 'session-meta'))) { try { const j = JSON.parse(fs.readFileSync(path.join(wt, 'data', 'session-meta', f), 'utf8')); if (j.agentToken && j.webuiSessionId === created.sessionId) return j.agentToken; } catch {} } return null; }, 10000, 200);
          agentTokens.push(token);
          wsMain.close();
          const agent = (verb, body) => fetch(`${O12}/api/agent/window/${verb}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, j: await r.json().catch(() => null) }));
          const at = token ? await agent('attach', { handle: id }) : null;
          const le = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.v && v.v.why === 'lease' ? v : null; }, 8000, 150);
          check(`§12 (7) PAUSE lease: an agent attaches (lease ${at && at.j && at.j.lease && at.j.lease.input}) ⇒ not seamless (why ${le && le.v.why}) — the title bar (${le && le.tbH} px) and the strip with the mode badge (${le && le.barH} px) SHOW`, !!le && !le.seamless && le.tbH >= 20 && le.barH >= 16 && (await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const b = w.content.querySelector('.browser-live-mode'); return !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().height > 0; })()`)), le && le.v);
          const dt2 = token ? await agent('detach', { handle: id }) : null;
          const free = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.seamless ? v : null; }, 8000, 150);
          check(`§12 (7): the agent detaches (${dt2 && dt2.status}) ⇒ seamless again`, !!free);
        }
        // (8) THE ESCAPE HATCHES — a second client (B, blocked: the x5 overlay, not connected ⇒ its bars show) + the taskbar
        // menu's Show window frame ▸ On on A: frame shown on A, the choice in user state, and B hears it from the broadcast
        B = await mkPage(O12, { width: 1200, height: 850, deviceScaleFactor: 1, mobile: false });
        const onB = await until(() => B.p.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)})`), 15000, 250); if (!onB) await B.p.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`);
        const bS = await until(async () => { const v = await B.p.evalJs(SM(id)); return v && v.overlay ? v : null; }, 15000, 250);
        check(`§12 (8) the honest list — x5: the second client's pane is BLOCKED (the overlay, "Resume here") and not seamless — it has no picture to learn the app's frame from (why ${bS && bS.v && bS.v.why}): its title bar shows (${bS && bS.tbH} px) above the overlay`, !!bS && !bS.seamless && (bS.v.why === 'ssd' || bS.v.why === 'disconnected') && bS.tbH >= 20, bS && bS.v);
        await A.p.cdp('Page.bringToFront');
        const it = await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const el = document.querySelector('.taskbar-item[data-win-id="' + w.id + '"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        if (!it) check('§12 (8): the calculator has a taskbar item', false);
        else {
          await mouse(A.p, 'mouseMoved', it.x, it.y);
          await mouse(A.p, 'mousePressed', it.x, it.y, { button: 'right', buttons: 2, clickCount: 1 });
          await mouse(A.p, 'mouseReleased', it.x, it.y, { button: 'right', buttons: 0, clickCount: 1 });
          await sleep(300);
          const rows = await A.p.evalJs(`[...document.querySelectorAll('.taskbar-context-menu > .taskbar-context-menu-item')].map((e) => e.childNodes[0] ? e.childNodes[0].textContent.trim() : e.textContent.trim())`);
          check(`§12 (8) the escape hatch: the taskbar menu carries Show window frame ▸, Scale ▸, Keep running?/Stop app (${JSON.stringify(rows)})`, rows.some((r) => /^Show window frame/.test(r)) && rows.some((r) => /^Scale/.test(r)) && rows.some((r) => /^Stop app/.test(r)), rows);
          const par = await A.p.evalJs(`(() => { const el = [...document.querySelectorAll('.taskbar-context-menu > .taskbar-context-menu-item')].find((e) => /^Show window frame/.test(e.textContent)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + 12, y: r.y + r.height / 2, kids: [...el.querySelectorAll('.taskbar-context-menu .taskbar-context-menu-item')].map((c) => ({ text: c.textContent, disabled: c.classList.contains('disabled') })) }; })()`);
          check(`§12 (8): Show window frame ▸ says why and offers Auto (current) / On / Off (${JSON.stringify(par && par.kids)})`, !!par && par.kids.length === 4 && /the app draws its own title bar/.test(par.kids[0].text) && par.kids[0].disabled && /Auto/.test(par.kids[1].text) && par.kids[1].disabled && /On/.test(par.kids[2].text) && !par.kids[2].disabled, par && par.kids);
          if (par) {
            await mouse(A.p, 'mouseMoved', par.x, par.y); await sleep(250);
            const kid = await A.p.evalJs(`(() => { const el = [...document.querySelectorAll('.taskbar-context-menu .taskbar-context-menu .taskbar-context-menu-item')].find((e) => /On$/.test(e.textContent.trim())); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
            if (kid) { await mouse(A.p, 'mouseMoved', kid.x, kid.y); await sleep(120); await trustedClickAt(A.p, kid.x, kid.y); }
            const on = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.seamless && v.v.why === 'user' ? v : null; }, 4000, 100);
            const us = await A.p.evalJs(`fetch('/api/user-state').then((r) => r.json()).then((s) => s.desktopAppFrame || null)`);
            const onBv = await until(async () => { const v = await B.p.evalJs(SM(id)); return v && v.v && v.v.frame === 'on' ? v : null; }, 5000, 150);
            check(`§12 (8): Show window frame ▸ On ⇒ the frame shows on A (why ${on && on.v.why}, title bar ${on && on.tbH} px), remembered PER APP in user state (${JSON.stringify(us)}) and heard by the second client from the broadcast (B's choice ${onBv && onBv.v.frame})`, !!on && on.tbH >= 20 && !!us && us['gnome-calculator'] === 'on' && !!onBv, { on: on && on.v, us, b: onBv && onBv.v });
            await A.p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const it = w._desktopAppFrameItems().find((r) => /Auto/.test(r.label)); it.action(); return true; })()`);
            const autoBack = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.seamless ? v : null; }, 4000, 100);
            const us2 = await A.p.evalJs(`fetch('/api/user-state').then((r) => r.json()).then((s) => s.desktopAppFrame || null)`);
            check(`§12 (8): back to Auto ⇒ seamless again and the key REMOVED (${JSON.stringify(us2)})`, !!autoBack && !!us2 && !('gnome-calculator' in us2), us2);
          }
        }
        // — the global switch: desktop.seamless = off ⇒ today's look for every app, live
        await A.p.evalJs(`app.settings.set('desktop.seamless', 'off'); true`);
        const off = await until(async () => { const v = await A.p.evalJs(SM(id)); return v && !v.seamless && v.v.why === 'setting-off' ? v : null; }, 4000, 100);
        check(`§12 (8): Settings → Seamless desktop app windows = Off ⇒ the frame is back at once (why ${off && off.v.why}, title bar ${off && off.tbH} px)`, !!off && off.tbH >= 20);
        await A.p.evalJs(`app.settings.set('desktop.seamless', 'auto'); true`);
        check('§12 (8): …and Auto again ⇒ seamless', !!(await until(async () => { const v = await A.p.evalJs(SM(id)); return v && v.seamless ? v : null; }, 4000, 100)));
        await dropPage(B); B = null;
        // (9) THE FLOATING COPY CHIP on a plain-http hostname page: a copy nobody made here floats at the pane's top-right while
        // the strip is folded, and hides itself after 10 s
        if (!hostResolves) skip('§12 (9) the floating chip', `${HOSTNAME} does not resolve`);
        else if (!XCLIP) skip('§12 (9) the floating chip', 'xclip not on PATH');
        else {
          H = await mkPage(`http://${HOSTNAME}:${PORT}`, { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
          await H.p.cdp('Page.bringToFront');
          const onH = await until(() => H.p.evalJs(`!![...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)})`), 15000, 250); if (!onH) await H.p.evalJs(`app.openDesktopApp(${JSON.stringify(id)}); true`);
          await ensureActive(H.p, id);
          const hs = await until(async () => { const v = await H.p.evalJs(SM(id)); return v && v.seamless && v.status === 'Connected' ? v : null; }, 20000, 250);
          check('§12 (9): the calculator is seamless on the hostname page too (plain http, isSecureContext false)', !!hs && await H.p.evalJs('window.isSecureContext === false'));
          if (hs) {
            const xe = xenvFor(wt, rc);
            const k = spawn('sh', ['-c', `printf '%s' 'vs-seam-float' | ${XCLIP} -i -selection clipboard`], { env: xe, stdio: 'ignore', detached: true }); xclipKids.push(k);
            const fl = await until(async () => { const v = await H.p.evalJs(SM(id)); return v && v.chip && v.chip.shown ? v : null; }, 8000, 150);
            const t0 = Date.now();
            // FIX r1: at the pane's BOTTOM-right — the top-right is where the app's own ─ □ ✕ are (§12 (3) measured them at
            // pane right −98 / −61 / −24, 22 px down); neither the chip nor the one-time hint may cover the header bar
            const HINT = `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const h = w.content.querySelector('.desktop-copy-hint'); const c = w._desktopAppView.chip; const rr = (e) => { if (!e || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }; return { chip: rr(c), hint: rr(h) }; })()`;
            const inter = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            const btnBoxes = (pn) => [98, 61, 24].map((dx) => ({ x: pn.x + pn.w - dx - 9, y: pn.y + 12, w: 18, h: 20 }));
            const header = (pn) => ({ x: pn.x, y: pn.y, w: pn.w, h: 46 });
            const clear = (r, pn) => !!r && !!r.chip && !btnBoxes(pn).some((b) => inter(b, r.chip)) && !inter(header(pn), r.chip) && !inter(header(pn), r.hint);
            const fr = fl && await H.p.evalJs(HINT);
            const inBR = fl && fr && fr.chip && fl.pane.y + fl.pane.h - (fr.chip.y + fr.chip.h) >= 0 && fl.pane.y + fl.pane.h - (fr.chip.y + fr.chip.h) <= 24 && fl.pane.x + fl.pane.w - (fr.chip.x + fr.chip.w) >= 0 && fl.pane.x + fl.pane.w - (fr.chip.x + fr.chip.w) <= 24;
            // LIVE CONTROL: the lane's first placement (the folded bar at the pane's top, the chip 8 / the hint 36 px down) put back
            // over the same chip covers the app's buttons
            const frC = fl && await H.p.evalJs(`(() => { const st = document.createElement('style'); st.textContent = '.window.seamless:not(.seamless-revealed) .picture-shell-floating-chip > .desktop-bar { top: 0 !important; bottom: auto !important; } .window.seamless:not(.seamless-revealed) .picture-shell-floating-chip > .desktop-bar > .desktop-copied-chip { top: 8px !important; bottom: auto !important; } .window.seamless:not(.seamless-revealed) .picture-shell-floating-chip > .desktop-bar > .desktop-copy-hint { top: 36px !important; bottom: auto !important; }'; document.head.appendChild(st); const r = ${HINT}; st.remove(); return r; })()`);
            console.log(`  §12 (9): the chip ${fl ? `shown at ${Math.round(fl.chip.rect.x - fl.pane.x)},${Math.round(fl.chip.rect.y - fl.pane.y)} in a ${fl.pane.w}×${fl.pane.h} pane, ${fl.chip.rect.w.toFixed(0)}×${fl.chip.rect.h.toFixed(0)}; the hint ${JSON.stringify(fr && fr.hint)}; the title bar ${fl.tbH} px; CONTROL (top placement) chip ${JSON.stringify(frC && frC.chip)}` : 'never shown'}`);
            check('§12 (9) the honest list: a copy the page cannot write without a click ⇒ the chip FLOATS at the pane\'s BOTTOM-right while the strip stays folded (title bar 0 px)', !!fl && inBR && fl.tbH === 0 && fl.seamless, fl && { chip: fl.chip, pane: fl.pane });
            check('§12 (9): neither the chip nor the HTTPS hint covers the app\'s header bar or its ─ □ ✕ (the boxes §12 (3) measured)', !!fl && clear(fr, fl.pane), fr);
            check('§12 (9) CONTROL: the lane\'s first placement (top-right) over the same chip covers the app\'s own buttons — the leg above can fail', !!fl && !!frC && !clear(frC, fl.pane) && btnBoxes(fl.pane).some((b) => inter(b, frC.chip)), frC);
            const gone = await until(async () => { const v = await H.p.evalJs(SM(id)); return v && !v.chip.shown ? v : null; }, 13000, 250);
            check(`§12 (9): …and hides itself after 10 s (${gone ? ((Date.now() - t0) / 1000).toFixed(1) + ' s' : 'still shown'})`, !!gone && Date.now() - t0 >= 9000);
            try { process.kill(-k.pid, 'SIGKILL'); } catch {}
          }
          await dropPage(H); H = null;
          await A.p.cdp('Page.bringToFront');
          await ensureActive(A.p, id);
        }
        // (10) XTERM — no header bar of its own (no `decorations` key) ⇒ never seamless, our title bar stays
        const lx = await launchOn(A.p, { exec: XTERM, args: ['-T', 'vs-seam-xterm', '-geometry', '60x16'], label: 'xterm' });
        if (lx && lx.id) ids12.push(lx.id);
        const rx = lx && lx.id && await readyOn(A.p, lx.id);
        if (rx) {
          await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(rx.id)}); true`);
          await ensureActive(A.p, rx.id);
          const xs = await until(async () => { const v = await A.p.evalJs(SM(rx.id)); return v && v.status === 'Connected' && v.main ? v : null; }, 30000, 250);
          await sleep(800);
          const xs2 = await A.p.evalJs(SM(rx.id));
          check(`§12 (10) SSD: xterm (no decorations key: ${JSON.stringify(xs2 && xs2.main && xs2.main.decorations)}) is NOT seamless (why ${xs2 && xs2.v && xs2.v.why}) — its VibeSpace title bar (${xs2 && xs2.tbH} px) and strip (${xs2 && xs2.barH} px) are there`, !!xs && !xs2.seamless && xs2.v.why === 'ssd' && xs2.main.decorations === undefined && xs2.tbH >= 20 && xs2.barH >= 16, xs2 && { v: xs2.v, main: xs2.main });
        } else check('§12 (10): xterm reaches ready', false, lx);
        // (11) THE IDLE STOP'S LAST MINUTE IS A TOAST (the idle chip is folded away): a calculator launched under a 1-minute idle timeout
        await A.p.evalJs(`app.settings.set('desktop.idleTimeoutMin', 1); true`);
        await sleep(1200);
        const li = await launchOn(A.p, { appId: 'gnome-calculator' });
        if (li && li.id) ids12.push(li.id);
        const ri = li && li.id && await readyOn(A.p, li.id);
        if (ri) {
          check(`§12 (11): the second calculator carries the 1-minute idle timeout (${ri.idleTimeoutMs} ms)`, ri.idleTimeoutMs === 60000, ri.idleTimeoutMs);
          await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(ri.id)}); true`);
          await ensureActive(A.p, ri.id);
          const iw = await until(async () => { const v = await A.p.evalJs(SM(ri.id)); return v && v.seamless && v.idleWarned ? v : null; }, 20000, 250);
          const toasts = await A.p.evalJs(`[...document.querySelectorAll('#global-toasts > *')].map((e) => e.textContent)`);
          check(`§12 (11) the honest list: seamless (the idle chip folded), the last minute before the idle stop is a TOAST naming the hatch (${JSON.stringify(toasts.filter((x) => /under a minute/.test(x)))})`, !!iw && toasts.some((x) => /stops in under a minute without input — Keep running is in the window menu/.test(x)), toasts);
        } else check('§12 (11): the idle calculator reaches ready', false, li);
        await A.p.evalJs(`app.settings.set('desktop.idleTimeoutMin', 0); true`);
        await sleep(800);
      }
      // (12) CONTROL — THE PRE-LANE LOOK: a copy of this tree whose verdict is forced false (bundle rebuilt): the same
      // calculator keeps our title bar and status strip — the bars everywhere, as before this lane
      const wtc = scratch('deskxpra-seamctl');
      try { execSync(`git worktree remove --force ${wtc}`, { cwd: repo, stdio: 'ignore' }); } catch {}
      execSync(`git worktree add --detach ${wtc} HEAD`, { cwd: repo, stdio: 'ignore' }); worktrees.push(wtc);
      for (const f of ['src', 'public', 'server.js', 'scripts', 'package.json']) execSync(`rm -rf ${wtc}/${f} && cp -r ${wt}/${f} ${wtc}/${f}`);
      fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wtc, 'node_modules'));
      fs.mkdirSync(path.join(wtc, 'data'), { recursive: true });
      const vSrc = fs.readFileSync(path.join(wtc, 'src/lib/desktop-seamless.js'), 'utf8');
      const vLine = "  return { seamless: true, why: wantWhy };";
      check('CONTROL: the verdict\'s one seamless answer is spelled exactly once (the control replaces exactly it)', vSrc.split(vLine).length === 2);
      fs.writeFileSync(path.join(wtc, 'src/lib/desktop-seamless.js'), vSrc.replace(vLine, "  return { seamless: false, why: 'ssd' }; // CONTROL: the pre-lane look"));
      execFileSync(path.join(repo, 'node_modules/.bin/esbuild'), ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify'], { cwd: wtc, stdio: 'ignore' });
      const [PORTC] = await freePorts(1);
      const homeC = scratchHome('deskxpra-seamctl-home', fs);
      const sc = spawn(process.execPath, ['server.js'], { cwd: wtc, env: { ...srvEnv, ...VNC_ENV, PORT: String(PORTC), HOME: homeC }, stdio: 'ignore' }); ctlServers.push(sc);
      let upC = false; for (let i = 0; i < 80 && !upC; i++) { try { await fetch(`http://127.0.0.1:${PORTC}/api/home`); upC = true; } catch { await sleep(250); } }
      check('CONTROL: the forced-false copy boots', upC);
      if (upC) {
        await A.p.cdp('Page.navigate', { url: 'about:blank' }).catch(() => {});
        await openPage(A.p, `http://127.0.0.1:${PORTC}`);
        const lcC = await launchOn(A.p, { appId: 'gnome-calculator' });
        const rcC = lcC && lcC.id && await readyOn(A.p, lcC.id);
        if (rcC) {
          await A.p.evalJs(`app.openDesktopApp(${JSON.stringify(rcC.id)}); true`);
          await ensureActive(A.p, rcC.id);
          await sizeWinOn(A.p, rcC.id, 900, 680);
          const cs = await until(async () => { const v = await A.p.evalJs(SM(rcC.id)); return v && v.status === 'Connected' && v.main ? v : null; }, 40000, 250);
          await sleep(1000);
          const cs2 = await A.p.evalJs(SM(rcC.id));
          check(`CONTROL: on the forced-false copy the SAME calculator (decorations ${cs2 && cs2.main && cs2.main.decorations}) keeps the bars — title bar ${cs2 && cs2.tbH} px, strip ${cs2 && cs2.barH} px, no .seamless: the §12 (1) fold is the verdict's doing`, !!cs && !cs2.seamless && cs2.main.decorations === 0 && cs2.tbH >= 20 && cs2.barH >= 16 && cs2.statusVisible, cs2 && { v: cs2.v, tbH: cs2.tbH, barH: cs2.barH });
          await fetch(`http://127.0.0.1:${PORTC}/api/desktop/apps/${rcC.id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
        } else check('CONTROL: the calculator reaches ready on the copy', false, lcC);
      }
      try { sc.kill('SIGKILL'); } catch {}
    } catch (e) { failed++; console.error('  ✗ §12 threw:', e.stack || e.message); }
    finally {
      for (const id of ids12) await fetch(`${O12}/api/desktop/apps/${id}/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
      await dropPage(A); await dropPage(B); await dropPage(H);
    }
  }

  // ── §13 (lane C2 — docs/design-desktop-apps-seamless §3.5): THE MAIN LEGS AGAIN FOR AN APP ON A PAIRED MACHINE — a
  // scratch daemon (the BUILT bundle, its own HOME) PAIRED to this server the way a person pairs one (POST
  // /api/device/dial-pair, the daemon dials /api/device-dial with the token), then: the machine picker offers it, ITS
  // ladder answers (GET /api/desktop/apps?host=), the launch runs THERE (the record is the device's, the hub
  // re-labels it), the window connects through the hub forward (the bridge's streamEndpointFor), the pane covers the
  // app, the title names the machine, typed keys land in the app's file on the device, Stop closes the window. ──
  {
    console.log('§13 lane C2: the main legs with host=<a paired device> (a scratch daemon dialed in to this server)');
    const devHome = scratchHome('deskxpra-dev-home', fs, ['.vibespace']);
    const devRoot = path.join(devHome, 'agentd-root');
    fs.mkdirSync(path.join(devRoot, 'state'), { recursive: true, mode: 0o700 });
    devHomes.push(devHome);
    const devTyped = path.join(devHome, 'typed-remote.txt');
    // its OWN page (the earlier sections navigated / replaced the suite's page): a fresh tab on this server
    const t12 = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const p12 = await page(t12);
    await openPage(p12, `http://127.0.0.1:${PORT}`);
    let devId = null;
    const devName = `vs-deskxpra-dev-${process.pid}`;
    try {
      const pair = await p12.evalJs(`fetch('/api/device/dial-pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: ${JSON.stringify(devName)} }) }).then((r) => r.json())`);
      check('§13: the server mints a pairing (dial token + host token) for the scratch device', !!(pair && pair.dialToken && pair.hostToken && pair.deviceId), pair);
      fs.writeFileSync(path.join(devRoot, 'state', 'token'), pair.hostToken, { mode: 0o600 });
      const dev = spawn(process.execPath, [path.join(wt, 'data', 'bin', 'vibespace-agentd.js'), '--dial', `ws://127.0.0.1:${PORT}/api/device-dial?device=${pair.deviceId}`, '--dial-token', pair.dialToken], { cwd: devHome, env: { ...process.env, HOME: devHome, VIBESPACE_AGENTD_ROOT: devRoot }, stdio: 'ignore', detached: true });
      devProcs.push(dev); dev.unref();
      const row = await until(async () => { const r = await p12.evalJs(`fetch('/api/desktop/machines').then((r) => r.json())`); const m = r && r.machines && r.machines.find((x) => x.label === devName); return m && m.code === 'ready' ? m : null; }, 30000, 500);
      check(`§13: the paired device dialed in and the machine picker offers it (${row && row.hostId}: ${row && row.code}, platform ${row && row.platform})`, !!row && row.selectable === true, row);
      devId = row && row.hostId;
      if (devId) {
        const av = await p12.evalJs(`fetch('/api/desktop/apps?host=${encodeURIComponent(devId)}').then((r) => r.json())`);
        check(`§13: THE DEVICE's ladder answers (GET /api/desktop/apps?host=): ${av && av.availability && av.availability.backend}, ${av && av.registry && av.registry.length} catalog rows`, av && av.availability && av.availability.backend === 'xpra' && av.host && av.host.hostId === devId, av && (av.error || av.availability));
        const L = await p12.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ host: devId, exec: XTERM, args: ['-T', 'vs-remote-title', '-geometry', '80x24', '-e', 'sh', '-c', `cat > ${devTyped}`], label: 'remote xterm' }))} }).then((r) => r.json())`);
        const rid = L && L.id;
        check(`§13: POST /api/desktop/apps with host ⇒ launched ON THE DEVICE (hostId ${L && L.hostId}, backend ${L && L.backend})`, !!rid && L.hostId === devId && L.backend === 'xpra', L);
        const rr = rid && await until(() => p12.evalJs(`fetch('/api/desktop/apps/${rid}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 40000, 300);
        check(`§13: the record reaches ready on the device (port ${rr && rr.port}, the hub label ${rr && rr.hostLabel})`, !!rr && rr.hostId === devId && !!rr.hostLabel, rr);
        const onDev = (() => { try { return JSON.parse(fs.readFileSync(path.join(devHome, '.vibespace', 'desktop-apps.json'), 'utf8')).apps[rid]; } catch { return null; } })();
        const onHub = (() => { try { return JSON.parse(fs.readFileSync(path.join(wt, 'data', 'desktop-apps.json'), 'utf8')).apps[rid]; } catch { return null; } })();
        check('§13: the record is the DEVICE\'s (its ~/.vibespace/desktop-apps.json), never in this machine\'s store (D8)', !!onDev && !onHub);
        if (rr) {
          await p12.evalJs(`app.openDesktopApp(${JSON.stringify(rid)}); true`);
          const t0 = Date.now();
          const conn = await until(async () => { const s = await p12.evalJs(WIN(rid)); return s && s.status === 'Connected' && s.windows.length ? s : null; }, 30000, 250);
          check(`§13: the window connects through the hub forward (Connected ${conn ? Date.now() - t0 : '—'} ms after open, the xpra view)`, !!conn && conn.kind === 'xpra', conn || p12.logs.slice(-8));
          const srvSaw = srvLog.join('').includes(`${rid}: upstream on ${devId}:${rr.port} through the hub forward`);
          check('§13: the bridge resolved the upstream to the hub forward (its log line names the device and the port)', srvSaw);
          await p12.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(rid)}); w.element.style.width = '900px'; w.element.style.height = '620px'; if (w.onResize) w.onResize(); return true; })()`);
          const settled = await until(async () => { const s = await p12.evalJs(WIN(rid)); const m = s && s.windows.find((w) => w.kind === 'main'); return m && s.pane.w - m.w < 16 && s.pane.h - m.h < 24 && m.x === 0 && m.y === 0 ? s : null; }, 15000, 300);
          await sleep(1200);
          const m = await measurePane(p12, rid);
          check(`§13: the device's app window covers the pane up to one xterm cell (${m && m.main && `${m.main.w}×${m.main.h}`} of ${m && `${m.pane.w}×${m.pane.h}`}), ${m && m.blackOut} black px outside it`, !!settled && !!m && !!m.main && m.blackOut === 0 && m.inBrightFrac > 0.5, m && { main: m.main, blackOut: m.blackOut });
          const tt = await until(async () => { const s = await p12.evalJs(WIN(rid)); return s && /vs-remote-title/.test(s.title) && s.title.includes(rr.hostLabel) ? s.title : null; }, 10000, 250);
          check(`§13: the title bar carries the app's own title AND the machine's name ("${tt}")`, !!tt);
          const s1 = await p12.evalJs(WIN(rid));
          await trustedClickAt(p12, s1.pane.x + s1.pane.w / 2, s1.pane.y + s1.pane.h / 2);
          await sleep(300);
          const keyOf = (ch) => ({ key: ch, code: ch === ' ' ? 'Space' : /[a-z]/.test(ch) ? 'Key' + ch.toUpperCase() : /[0-9]/.test(ch) ? 'Digit' + ch : '', windowsVirtualKeyCode: ch === ' ' ? 32 : ch.toUpperCase().charCodeAt(0), text: ch, unmodifiedText: ch });
          const tk = Date.now();
          for (const ch of 'on the device 7') { const k = keyOf(ch); await p12.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await p12.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); }
          await p12.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
          await p12.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
          const typed = await until(() => { try { const s = fs.readFileSync(devTyped, 'utf8'); return s.includes('on the device 7\n') ? s : null; } catch { return null; } }, 15000, 50);
          check(`§13: trusted key events typed in the page land in the app's file ON THE DEVICE (${typed ? Date.now() - tk : '—'} ms for 16 keys through page → hub bridge → forward → the device's xpra)`, !!typed, (() => { try { return JSON.stringify(fs.readFileSync(devTyped, 'utf8')); } catch { return 'no file'; } })());
          // the launch dialog: the machine picker shows the device, selectable (our own controls' structure)
          await p12.evalJs(`document.getElementById('btn-desktop-apps') ? (document.getElementById('btn-desktop-apps').click(), true) : false`);
          const pick = await until(() => p12.evalJs(`(() => { const b = document.querySelector('#desktop-launch-dialog .desktop-launch-machine[data-host=${JSON.stringify(devId)}]'); return b ? { disabled: b.disabled, n: document.querySelectorAll('#desktop-launch-dialog .desktop-launch-machine').length } : null; })()`), 10000, 250);
          check(`§13: the launch dialog's machine picker has a row for the device, enabled (${pick && pick.n} machines)`, !!pick && pick.disabled === false && pick.n >= 2, pick);
          await p12.evalJs(`(() => { const b = document.querySelector('#desktop-launch-dialog .desktop-launch-machine[data-host=${JSON.stringify(devId)}]'); if (b) b.click(); return true; })()`);
          const cat = await until(() => p12.evalJs(`(() => { const b = document.querySelector('#desktop-launch-dialog .desktop-launch-machine[data-host=${JSON.stringify(devId)}]'); const cards = document.querySelectorAll('#desktop-launch-dialog .desktop-launch-registry .desktop-launch-card'); return b && b.getAttribute('aria-pressed') === 'true' && cards.length ? { cards: cards.length } : null; })()`), 10000, 250);
          check('§13: choosing the device re-reads ITS catalog (the cards are the device\'s)', !!cat, cat);
          await p12.evalJs(`(() => { const o = document.getElementById('desktop-launch-dialog'); if (o) o.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
          await sleep(300);
          // Stop ⇒ the device verifies every part gone; the window closes itself
          const sp = await p12.evalJs(`fetch('/api/desktop/apps/${rid}/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.json())`);
          check(`§13: Stop through the route ⇒ the device answers exited (${sp && sp.state}, ${sp && sp.stoppedBy})`, sp && sp.state === 'exited' && sp.stoppedBy === 'user', sp);
          const closed = await until(() => p12.evalJs(`!${WIN(rid)}`), 10000, 250);
          check('§13: the window closes itself when the device\'s app ended (A2 over the paired machine)', !!closed);
          await sleep(500);
          const left = []; for (const d of fs.readdirSync('/proc')) { if (/^\d+$/.test(d) && D.environHas(Number(d), `VIBESPACE_DESKTOP_APP=${rid}`)) left.push(Number(d)); }
          check(`§13: nothing on the device still carries the session marker (${left.length})`, left.length === 0, left);
        }
      }
    } catch (e) { failed++; console.error('  ✗ §13 threw:', e.stack || e.message); }
    finally { p12.close(); try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t12.id}`); } catch {} }
  }
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
