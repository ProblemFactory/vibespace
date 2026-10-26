#!/usr/bin/env node
// THE iPHONE DUO's LAYOUT in a real Chrome (lane duo-build-1, 2026-10-25 — the owner, after the real iOS 27.1 simulator's
// shots of 2.369.353: 「这显然不太可用」). A throwaway server in a git worktree (this tree's src/ + built public/), a stub
// `claude` behind the real chat-wrapper (two chat conversations, one turn each), headless Chrome over raw CDP with the
// Duo's viewports (WebKit 27.1's table: cover 382×580, inner portrait 669×867, inner landscape 951×585) as a touch device
// (mobile, touch emulation, pointer: coarse / hover: none). A fold is a live Emulation.setDeviceMetricsOverride — the page
// is never reloaded, exactly as the Duo folds.
//   ① FRESH LOADS — the chrome signature (which of toolbar / taskbar / nav / rail / sidebar / attention page is on screen,
//     the sidebar's classes, the wrapper's margin, app.isMobile, <html data-vc>) of a fresh load on the touch Duo (382 =
//     compact, 669 / 951 = regular) and on a mouse desktop (951 = the window manager, 382 / 669 = compact)
//   ② THE DESKTOP FOLD LADDER (a mouse — the class that crosses the phone line: B-1d40 / B-f5ec): boot 951×585 with two
//     chat windows and a draft, then 382 → 951 → 669 → 951 → 382; at every step: (a) every transcript row of the window on
//     show lies inside the viewport and is not covered (the point at its left edge hits the window — B-1d40: the
//     desktop's geometry outlived a fold, the transcript ran off the left edge under the rail), (b) on the phone the
//     desktop rail is not drawn and the sidebar is off screen (B-f5ec), (c) the chrome signature EQUALS the fresh
//     load's at that size, (d) the draft is the same node with the same words (a fold is no reload)
//   ③ NO KEYBOARD ON LOAD (slice 1 — the simulator: a restored chat raised a 60 %-high keyboard on load): on the touch
//     Duo an attached chat window (the restore's own path: the server's answer → the late focus) leaves the composer
//     unfocused, a fold does not focus it either, and the person's own tap in the box does; CONTROL: a 1280×800 desktop
//     with a mouse still takes the composer on attach
//   ④ THE REGULAR CLASS (slice 2 — SPEC-v3 §2 / §4): the Duo's 951×585 = the list column 0–320 | the conversation
//     321–895 (the window on show fills it) | the trailing bar 895–951 standing (this conversation's actions on top, a
//     visible gap, For you · Task Groups · Files · Channels · Agent browser · Background Work · ⚙ at the bottom — 44 × 44), no
//     toolbar / taskbar / rail / attention page, the head = the name + its state word; a row with an open question comes
//     first and MARKS it («needs you · 1 · …» — lane foryou-honest, the owner's B), its tap opens the For-you window where a
//     chip answers it; 669×867 = list 0–320 |
//     conversation 321–669 with the bar lying over it; the Duo's own ladder 951 → 382 → 951 → 669 → 382 → 951 with two
//     windows and a draft: (a) (c) (d) as ②, and a window's focus never closes the list column
//   ⑤ THE TRAILING BAR'S DOORS (951×585, touch): Files opens the explorer in the conversation column (selected, the ✕
//     shown), ✕ brings the conversation back, Channels / Background Work open theirs, Task Groups turns the list column
//     to its board, ⋯ opens the window's menu INTO the conversation column with no window-manager verb and no Close
//   ⑦ THE POSTURE LADDER (slice 4 — SPEC-v3 §1.6 / §3 / §5, research-v4 B.5; CDP: setDevicePostureOverride drives
//     (device-posture: folded), setDeviceMetricsOverride's displayFeature drives the segments — offset 475 / mask 0 =
//     Safari's seamless pair): folded alone on the inner display = pending, NOTHING moves, back to none after 1.5 s;
//     segments:2 during pending = book after the settle: the list 0–465, the 20 px design seam, the conversation from 485
//     (its content from 509), NOTHING tappable in 441–509 (an elementFromPoint census), the draft kept; segments back to 1
//     = flat again after the leave settle; the cover's tent (594×368, folded, one segment) = none, every box unchanged;
//     a laptop (669×867, the horizontal pair at 391) = the bar moves down onto the composer, the list stays
//   ⑧ THE DESKTOPS DOOR (lane desktop-switch-phone — userW on the Duo: «如何在这个界面下切换桌面？»): two desktops with windows;
//     951 touch: the bar's bottom section starts with Desktops (badge 1, «(1/2)»), its menu lists both with their window
//     counts + «New desktop», a tap on the second shows its window in the conversation column (the list column stays); the
//     conversation's head (its title bar) opens the window switcher with both desktop tabs; the landscape list column's ☰
//     hides it (the conversation 0–895), a reload keeps the choice, ☰ again shows it; 382 touch: the same door on the top
//     bar, the phone's sheet, a tap on the second desktop shows its window (a lazy replay on this page)
//   ⑨ THE ⧉ LIST + THE DOOR CENSUS (lane desktop-switch-phone): a mouse desktop's ⧉ list keeps the active desktop's windows
//     and folds «Other desktops (1)»; its row «<title> · Desk B» switches AND raises (a held window: built by the switch,
//     then revealed); the census presses every control of the phone chrome on screen and counts the ones that open desktop
//     rows — 951: the bar's Desktops + the conversation's head, 382: Desktops + the title; RED CONTROL: a bundle with the
//     base's no-door rules put back ⇒ 0 doors at 951 (and no taskbar)
//   ⑥ RED CONTROL — a bundle built from this source with the base's four rules put back (no switch: the class frozen at
//     boot; the composer focused on touch; no regular class: the Duo's 951 is the window manager; no ladder): (b) and (c)
//     red on the cover, (a) red on the inner portrait, the composer focused on the touch Duo's attach, the 951 Duo's
//     arrangement gone, a book fold arranges nothing
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-duo-layout.mjs
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.log('✗ no public/bundle.js — run `npm run build` first'); process.exit(1); }

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('duo-layout-wt');
const fakeHome = scratchHome('duo-layout-home', fs);
const chromeDir = scratch('duo-layout-chrome');
const stubDir = scratch('duo-layout-stub');
const MUT = scratch('duo-layout-mut');
const CWD = path.join(stubDir, 'work');
const SHOTS = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : scratch('duo-layout-shots');
for (const d of [stubDir, CWD, SHOTS]) fs.mkdirSync(d, { recursive: true });
const ORIGIN = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the stub CLI: one assistant turn per user line, a reply long enough to wrap at every width ──
fs.writeFileSync(path.join(stubDir, 'claude'), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.308 (Claude Code) stub'); process.exit(0); }
const SID = 'duo-' + process.pid;
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5-1', cwd: process.cwd(), tools: ['Read'], permissionMode: 'default', claude_code_version: '2.1.308' });
let n = 0, buf = '';
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m = null; try { m = JSON.parse(line); } catch {} if (!m || m.type !== 'user') continue; const k = n++;
  setTimeout(() => {
    out({ type: 'assistant', session_id: SID, uuid: 'a-' + k, message: { id: 'm' + k, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'The retry waits two seconds and gives up after three tries today; I will change it to back off 1, 2, 4, 8 and 16 seconds and mark the order for a person after the fifth try. Shall I add the tests too?' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 40 } } });
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 300, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 40 } });
  }, 200); } });
// a '#ask' turn files a For-you question through the hub's agent route (the vibespace-ask road) — the list column MARKS it, the For-you window answers it (lane foryou-honest — the owner's B)
process.stdin.on('data', (d) => { if (String(d).includes('#ask') && !globalThis.__asked) { globalThis.__asked = 1; fetch(process.env.VIBESPACE_API + '/api/agent/user-todo', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.VIBESPACE_SESSION_TOKEN }, body: JSON.stringify({ add: { text: 'Which deck goes to the Q3 review? v2 has two hand-edited appendix pages, v3 was regenerated from the template.', options: ['v3 (latest)', 'v2'], kind: 'action', urgency: 'normal' } }) }).catch(() => { }); } });
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── the RED CONTROL's bundle: THIS source with the switch removed (the base's class, frozen at boot) ──
{
  fs.mkdirSync(MUT, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT, 'node_modules'));
  const sub = (rel, from, to) => { const f = path.join(MUT, rel); const s = fs.readFileSync(f, 'utf8'); if (s.split(from).length !== 2) throw new Error(`mutant anchor ${rel}: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, to)); };
  sub('src/lib/app.js', 'this._viewportSwitch = installViewportSwitch(this);', 'this._viewportSwitch = null;');
  sub('src/lib/chat-input.js', '    if (isTouchDevice()) return;\n', ''); // slice 1: the base focused the composer on touch too
  sub('src/viewport-class.js', "  if (coarse) return w < VC_COARSE_REGULAR_MIN ? 'compact' : w < VC_COARSE_DESKTOP_MIN ? 'regular' : 'desktop';\n", ''); // slice 2: the base had no regular class
  sub('src/lib/app.js', 'this._foldLadder = installFoldLadder(this);', 'this._foldLadder = null;'); // slice 4: the base read no posture
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT });
}
const MUT_BUNDLE = fs.readFileSync(path.join(MUT, 'bundle-mut.js'));
// ── ⑨'s RED CONTROL bundle (lane desktop-switch-phone): THIS source with the base's no-door rules put back — no Desktops
// button, the regular class's title tap off, no head listener (ba15fe55: the regular class reached no desktop but the boot one) ──
{
  const D = path.join(MUT, 'door');
  fs.mkdirSync(D, { recursive: true });
  execSync(`cp -r ${repo}/src ${D}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(D, 'node_modules'));
  const sub = (rel, from, to) => { const f = path.join(D, rel); const s = fs.readFileSync(f, 'utf8'); if (s.split(from).length !== 2) throw new Error(`door mutant anchor ${rel}: ${from.slice(0, 60)}`); fs.writeFileSync(f, s.replace(from, to)); };
  sub('src/lib/mobile-nav.js', 'this.desktopsBtn = this._buildDesktopsDoor();', 'this.desktopsBtn = null;');
  sub('src/lib/mobile-nav.js', 'this._titleEl.onclick = () => this._showWindowSwitcher();', "this._titleEl.onclick = () => { if (app.viewportClass?.() !== 'regular') this._showWindowSwitcher(); };");
  sub('src/lib/mobile-nav.js', "      if (app.viewportClass?.() !== 'regular' || getComputedStyle(document.getElementById('mobile-nav')).flexDirection !== 'column') return;\n", '      return;\n');
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-door.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: D });
}
const DOOR_BUNDLE = fs.readFileSync(path.join(MUT, 'door', 'bundle-door.js'));

// ── throwaway server in a worktree (the tree's src/ + built public/) ──
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const srvLog = fs.openSync(path.join(SHOTS, 'server.log'), 'a');
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: path.join(stubDir, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' }, stdio: ['ignore', srvLog, srvLog] });
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore' });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  for (const root of [wt, fakeHome, stubDir, chromeDir]) { try { endRootedProcesses(root); } catch { } } // the server, dtach, the wrapper, the stub, Chrome (§57b)
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [chromeDir, fakeHome, stubDir, MUT]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
armWatchdog({ capMs: 600e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
for (let i = 0; i < 120; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP (+ the RED control's bundle through the Fetch domain) ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { }
  if (!target) await sleep(250);
}
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; let mutantOn = false; const pend = new Map(); const pageErrors = [];
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
  if (m.method === 'Fetch.requestPaused') {
    const p = m.params, u = new URL(p.request.url);
    if (mutantOn && u.pathname === '/bundle.js') sock.send(JSON.stringify({ id: ++seq, method: 'Fetch.fulfillRequest', params: { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: (mutantOn === 'door' ? DOOR_BUNDLE : MUT_BUNDLE).toString('base64') } }));
    else sock.send(JSON.stringify({ id: ++seq, method: 'Fetch.continueRequest', params: { requestId: p.requestId } }));
  }
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; PENDS.set(id, { method, at: Date.now() }); pend.set(id, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
  sock.send(JSON.stringify({ id, method, params }));
});
const evalJs = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*bundle.js*', requestStage: 'Request' }] });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard
/** The device: the Duo (a touch screen — coarse, hover-less) at `w`×`h`; `mouse` = a desktop with a fine pointer. A live
 *  change of the metrics IS the fold. */
const device = async (w, h, { mouse = false } = {}) => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mouse ? 1 : 2, mobile: !mouse });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: !mouse, maxTouchPoints: mouse ? 1 : 5 });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: mouse ? 'hover' : 'none' }, { name: 'pointer', value: mouse ? 'fine' : 'coarse' }] });
};
const tapAt = async (x, y) => {
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(60);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300);
};
const FOCUS = `(() => { const a = document.activeElement; return { composer: !!a && a.classList.contains('chat-input'), tag: a ? a.tagName + '.' + String(a.className || '').split(' ')[0] : null }; })()`;
/** One conversation attached the way a restore attaches it (the server's answer, then the late focus); settled. */
const attachOne = async () => {
  const id = sessions[0];
  await evalJs(`(() => { app.attachSession(${JSON.stringify(id)}, 'duo focus', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); return 1; })()`);
  await waitFor(`document.querySelectorAll('.window.window-active .chat-message-list > .chat-msg-assistant').length >= 1`, 15000);
  await sleep(1200);
};
const load = async () => {
  await cdp('Page.navigate', { url: ORIGIN + '/' });
  await waitFor('!!(window.app && app.ready)', 30000); await evalJs('app.ready.then(() => true)');
  await waitFor(`!document.getElementById('loading-screen')`, 15000); await sleep(800);
};
/** The class a viewport this wide is (the suite's own copy of the lines it tests: a finger 640–1023 px = regular). */
const classOf = (w, mouse = false) => (mouse ? (w < 769 ? 'compact' : 'desktop') : (w < 640 ? 'compact' : w < 1024 ? 'regular' : 'desktop'));
/** After a fold: the page's class has switched and settled (or the RED control's frozen page has had the same time). */
const settle = async (w, { mouse = false, frozen = false } = {}) => { if (!frozen) await waitFor(`document.documentElement.dataset.vc === ${JSON.stringify(classOf(w, mouse))}`, 4000); await sleep(700); };

// THE CHROME SIGNATURE a fresh load and a fold must share (what is on screen, not how it got there)
const SIGNATURE = `(() => {
  const W = innerWidth, H = innerHeight;
  const on = (el) => { if (!el) return 'none'; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return 'none'; const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return 'zero'; if (r.right <= 0 || r.left >= W || r.bottom <= 0 || r.top >= H) return 'offscreen'; return 'shown'; };
  const sb = document.getElementById('sidebar');
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; };
  const sig = { vc: document.documentElement.dataset.vc || null, isMobile: !!app.isMobile, sidebarOpen: !!app.sidebar?.isOpen,
    sbClasses: ['rail-on', 'rail-collapsed', 'rail-labelled', 'open'].filter((c) => sb && sb.classList.contains(c)).join(' '),
    marginLeft: Math.round(parseFloat(getComputedStyle(document.getElementById('main-wrapper')).marginLeft) || 0),
    listBox: document.documentElement.dataset.vc === 'regular' ? box(sb) : null, navBox: document.documentElement.dataset.vc === 'regular' ? box(document.getElementById('mobile-nav')) : null };
  // (the attention page #phone-home is the BOOT's first screen when a question is open — a fold keeps the conversation on
  // show instead, SPEC-v3 §7; it is checked on its own below, never compared)
  for (const s of ['#toolbar', '#taskbar', '#mobile-nav', '#sidebar', '#sidebar-rail', '#mobile-nav-menu', '#mobile-nav-gear', '#mobile-nav-new', '#sidebar-new', '.sidebar-tabs']) sig[s] = on(document.querySelector(s));
  sig.homeOverWindow = on(document.getElementById('phone-home')) === 'shown' && !!document.querySelector('.window.window-active');
  return sig;
})()`;
/** (a) every transcript row of the window on show: inside the viewport, and its left edge is the window's (nothing over it). */
const ROWS = `(() => {
  const W = innerWidth, H = innerHeight;
  const win = document.querySelector('.window.window-active');
  if (!win) return { rows: 0, bad: ['no window on show'] };
  const rows = [...win.querySelectorAll('.chat-message-list > .chat-msg')].filter((r) => { const b = r.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < H; });
  const bad = [];
  for (const r of rows) {
    const b = r.getBoundingClientRect();
    if (b.left < -0.5 || b.right > W + 0.5) { bad.push('outside ' + Math.round(b.left) + '..' + Math.round(b.right) + ' of ' + W); continue; }
    const hit = document.elementFromPoint(Math.max(0, b.left) + 3, b.top + Math.min(12, b.height / 2));
    if (!hit || !win.contains(hit)) bad.push('covered at x ' + Math.round(b.left + 3) + ' by ' + (hit ? (hit.id ? '#' + hit.id : hit.className || hit.tagName) : 'nothing'));
  }
  return { rows: rows.length, bad: bad.slice(0, 6), scrollX: Math.round(scrollX) };
})()`;
const RAIL = `(() => { const r = document.getElementById('sidebar-rail'); const sb = document.getElementById('sidebar').getBoundingClientRect();
  return { rail: !!r && getComputedStyle(r).display !== 'none' && r.getBoundingClientRect().width > 0 && r.getBoundingClientRect().right > 0, sidebarOnScreen: sb.right > 1 && sb.left < innerWidth && sb.width > 0 }; })()`;
/** ④ the regular class's arrangement: the boxes of the three columns and the bar's buttons in their order. */
const ARRANGE = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const nav = document.getElementById('mobile-nav');
  const btns = [...nav.children].filter(shown).filter((e) => e.tagName === 'BUTTON').map((e) => ({ id: e.id, ...r(e) }));
  const gap = nav.querySelector('.mnav-gap');
  return { list: r(document.getElementById('sidebar')), win: r(document.querySelector('.window.window-active')), nav: r(nav), dir: getComputedStyle(nav).flexDirection, btns, gap: shown(gap) ? r(gap) : null,
    toolbar: shown(document.getElementById('toolbar')), taskbar: shown(document.getElementById('taskbar')), rail: shown(document.getElementById('sidebar-rail')),
    head: (() => { const t = document.querySelector('.window.window-active .window-title'); return t ? { name: t.dataset.name, state: t.dataset.state, shown: shown(t.parentElement) } : null; })(),
    navTitle: document.getElementById('mobile-nav-title')?.textContent, navState: document.getElementById('mobile-nav-state')?.textContent,
    listHidden: document.documentElement.classList.contains('vs-list-hidden'), sbOpen: !!app.sidebar?.isOpen };
})()`;
const diff = (a, b) => Object.keys({ ...a, ...b }).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => `${k}: fresh ${JSON.stringify(a[k])} ≠ fold ${JSON.stringify(b[k])}`);

// ── two chat conversations, one turn each ──
const sessions = await (async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const frames = [];
  await new Promise((r) => ws.on('open', r)); ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
  const ids = [];
  for (const k of [0, 1]) {
    ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'duo' + k }));
    let sid = null; for (let i = 0; i < 100 && !sid; i++) { const f = frames.find((m) => m?.type === 'created' && m.reqId === 'duo' + k); if (f) sid = f.sessionId; else await sleep(150); }
    if (sid) { ids.push(sid); await sleep(600); ws.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: k ? 'Compare the v2 and v3 decks for Q3 #ask' : 'Make the refund retry back off exponentially, five tries at most' })); await sleep(1200); }
  }
  ws.close(); return ids;
})();
const attachBoth = async () => {
  for (const id of sessions) await evalJs(`(() => { if (app.wm && [...app.wm.windows.values()].some((w) => app.sessions.get(w.id)?.sessionId === ${JSON.stringify(id)})) return 1; app.attachSession(${JSON.stringify(id)}, 'duo ' + ${JSON.stringify(id.slice(-4))}, ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); return 1; })()`);
  await waitFor(`document.querySelectorAll('.window').length >= 2 && document.querySelectorAll('.window.window-active .chat-message-list > .chat-msg-assistant').length >= 1`, 15000);
  await sleep(600);
};
const LADDER = [[382, 580, 'cover'], [951, 585, 'flat'], [669, 867, 'portrait'], [951, 585, 'flat'], [382, 580, 'cover']];
const DUO_LADDER = [[382, 580, 'cover'], [951, 585, 'flat'], [669, 867, 'portrait'], [382, 580, 'cover'], [951, 585, 'flat']];
const DRAFT = 'this sentence must survive the fold';
const putDraft = () => evalJs(`(() => { const t = document.querySelector('.window.window-active .chat-input'); t.value = ${JSON.stringify(DRAFT)}; t.dispatchEvent(new Event('input', { bubbles: true })); window.__duoDraft = t; return 1; })()`);
const DRAFT_JS = `(() => { const t = document.querySelector('.window.window-active .chat-input'); return { same: t === window.__duoDraft, value: window.__duoDraft?.value }; })()`;
const tap = async (sel) => { const p = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`); if (!p) throw new Error('tap: nothing at ' + sel); await tapAt(p.x, p.y); await sleep(500); };

try {
  console.log(`setup: ${sessions.length} stub conversations behind the real chat-wrapper`);
  check('two chat conversations are live', sessions.length === 2, sessions);

  console.log('① fresh loads (the chrome a fold must equal)');
  const fresh = {};
  for (const [w, h, mouse] of [[382, 580, false], [669, 867, false], [951, 585, false], [382, 580, true], [669, 867, true], [951, 585, true], [385, 571, false], [594, 368, false]]) {
    await device(w, h, { mouse }); await load();
    fresh[(mouse ? 'm' : 't') + w] = await evalJs(SIGNATURE);
    await shot(`fresh-${mouse ? 'mouse' : 'touch'}-${w}x${h}.png`);
  }
  const phoneSig = (x) => x.isMobile && x.vc === 'compact' && x['#mobile-nav'] === 'shown' && x['#toolbar'] === 'none' && x['#taskbar'] === 'none' && x['#sidebar-rail'] === 'none' && x['#sidebar'] === 'offscreen';
  check('a fresh touch 382×580 and a mouse 382 / 669 are the phone page (nav on, toolbar / taskbar / rail off, sidebar off screen)', phoneSig(fresh.t382) && phoneSig(fresh.m382) && phoneSig(fresh.m669), [fresh.t382, fresh.m669]);
  check('slice 5 (SPEC-v3 §6): Split View\'s half 385×571 and the cover in landscape 594×368 stay the phone page, unchanged', phoneSig(fresh.t385) && phoneSig(fresh.t594) && fresh.t385['#sidebar-new'] === 'none' && fresh.t594['#sidebar-new'] === 'none', [fresh.t385, fresh.t594]);
  check('a fresh touch 669×867 / 951×585 is the REGULAR class (the list a column on screen, the nav, no toolbar / taskbar / rail)', ['t669', 't951'].every((k) => fresh[k].isMobile && fresh[k].vc === 'regular' && fresh[k]['#sidebar'] === 'shown' && fresh[k]['#mobile-nav'] === 'shown' && fresh[k]['#toolbar'] === 'none' && fresh[k]['#taskbar'] === 'none' && fresh[k]['#sidebar-rail'] === 'none' && fresh[k]['#sidebar-new'] === 'shown'), [fresh.t669, fresh.t951]);
  check('a fresh mouse 951×585 is the window manager (toolbar, taskbar, the rail strip; no nav)', !fresh.m951.isMobile && fresh.m951.vc === 'desktop' && fresh.m951['#toolbar'] === 'shown' && fresh.m951['#taskbar'] === 'shown' && fresh.m951['#sidebar-rail'] === 'shown' && fresh.m951['#mobile-nav'] === 'none', fresh.m951);

  console.log('② the desktop fold ladder (a mouse): boot 951×585 with two chat windows, fold / unfold without a reload');
  await device(951, 585, { mouse: true }); await load(); await attachBoth(); await putDraft();
  const boot = await evalJs(ROWS);
  check('the boot: two windows, the active one\'s transcript drawn whole', boot.rows >= 2 && !boot.bad.length, boot);
  let step = 0;
  for (const [w, h, pose] of LADDER) {
    step++;
    await device(w, h, { mouse: true }); await settle(w, { mouse: true });
    const sig = await evalJs(SIGNATURE), rows = await evalJs(ROWS), rail = await evalJs(RAIL);
    await shot(`ladder-${step}-${pose}-${w}x${h}.png`);
    const draft = await evalJs(DRAFT_JS);
    check(`${step}. ${pose} ${w}×${h} (a) the transcript lies inside the viewport, nothing over its left edge (B-1d40)`, rows.rows >= 1 && !rows.bad.length && rows.scrollX === 0, rows);
    if (classOf(w, true) === 'compact') check(`${step}. ${pose} ${w}×${h} (b) no desktop rail drawn, the sidebar off screen (B-f5ec)`, !rail.rail && !rail.sidebarOnScreen, rail);
    else check(`${step}. ${pose} ${w}×${h} (b) the window manager's rail is back`, rail.rail, rail);
    const d = diff({ ...fresh['m' + w], homeOverWindow: false }, sig);
    check(`${step}. ${pose} ${w}×${h} (c) the chrome equals a fresh load's at this size`, d.length === 0, d);
    check(`${step}. ${pose} ${w}×${h} (d) the draft is the same box with the same words (a fold is no reload)`, draft.same && draft.value === DRAFT, draft);
  }

  console.log('③ no keyboard on load: a touch screen never focuses the composer by itself');
  {
    await device(951, 585); await load(); await attachOne();
    const f1 = await evalJs(FOCUS);
    check('③ the touch Duo: an attached chat window leaves the composer unfocused (no keyboard on load)', !f1.composer, f1);
    await device(382, 580); await settle(382);
    const f2 = await evalJs(FOCUS);
    check('③ …and a fold to the cover does not focus it either', !f2.composer, f2);
    const r = await evalJs(`(() => { const t = document.querySelector('.window.window-active .chat-input'); const b = t.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    await tapAt(r.x, r.y);
    const f3 = await evalJs(FOCUS);
    check('③ the person\'s own tap in the box focuses it (the keyboard comes from the tap)', f3.composer, f3);
    await device(1280, 800, { mouse: true }); await load(); await attachOne();
    const f4 = await evalJs(FOCUS);
    check('③ CONTROL: a 1280×800 desktop with a mouse still takes the composer on attach (desktop unchanged)', f4.composer, f4);
  }

  console.log('④ the regular class: the Duo\'s inner display = list | conversation | trailing bar');
  {
    await device(951, 585); await load(); await attachBoth();
    const a = await evalJs(ARRANGE);
    await shot('regular-flat-951x585.png');
    check('④ 951×585: the list column 0–320, the conversation 321–895, the bar 895–951 standing', a.list.l === 0 && a.list.w === 320 && a.win.l === 321 && a.win.w === 574 && a.nav.l === 895 && a.nav.w === 56 && a.dir === 'column' && a.nav.h === 585, a);
    check('④ …no toolbar, no taskbar, no rail', !a.toolbar && !a.taskbar && !a.rail, a);
    const ids = a.btns.map((x) => x.id), y = Object.fromEntries(a.btns.map((x) => [x.id, x.t]));
    const order = ['mobile-nav-artifacts', 'mobile-nav-more', 'mobile-nav-todos', 'mobile-nav-dest-tasks', 'mobile-nav-files', 'mobile-nav-dest-channels', 'mobile-nav-dest-browser', 'mobile-nav-dest-jobs', 'mobile-nav-gear'];
    check('④ the bar: Artifacts · ⋯ on top, a visible gap, For you · Task Groups · Files · Channels · Agent browser · Background Work · ⚙ at the bottom (no ☰, no title, no +)', order.every((k) => k in y) && order.every((k, i) => i === 0 || y[order[i - 1]] < y[k]) && !!a.gap && a.gap.h >= 8 && a.gap.t > y['mobile-nav-more'] && a.gap.t < y['mobile-nav-todos'] && !ids.includes('mobile-nav-menu') && !ids.includes('mobile-nav-new'), { ids, y, gap: a.gap });
    check('④ …every button 44 × 44 inside the 56 px bar', a.btns.every((x) => x.w === 44 && x.h === 44 && x.l >= 895 && x.l + 44 <= 951), a.btns);
    check('④ the conversation\'s head = its name + its state word (never its folder)', !!a.head && a.head.shown && !!a.head.name && !/—/.test(a.head.name) && !!a.head.state, a.head);
    // §2.3 AS BUILT (lane foryou-honest — the stress evaluation and the owner's B, 2026-10-25): the row MARKS its open question
    // on one line, the For-you window answers it (slice 2c's inline question + chips are withdrawn)
    const mk = await evalJs(`(() => { const cards = [...document.querySelectorAll('#all-sessions-list .col-card')]; const i = cards.findIndex((c) => { const m = c.querySelector(':scope > .ut-sess-mark'); return !!m && !m.hidden; }); const m = i >= 0 ? cards[i].querySelector(':scope > .ut-sess-mark') : null; const r = m ? m.getBoundingClientRect() : null; return { first: i, text: m ? m.innerText.replace(/\\s+/g, ' ').trim() : '', h: r ? Math.round(r.height) : 0, right: r ? Math.round(r.right) : 0, chips: document.querySelectorAll('#sidebar .ut-opt, #sidebar .ut-item, #sidebar .col-asks').length }; })()`);
    check('④ §2.3 as built: the conversation with an open question is the FIRST row; it MARKS it on one line «needs you · 1 · <the question>» (44 px, inside the column) — no question, no chips in the list (the owner\'s B)', mk.first === 0 && /^needs you · 1 · Which deck goes to the Q3 review\?/.test(mk.text) && mk.h >= 44 && mk.right <= 320 && mk.chips === 0, mk);
    await tap('#all-sessions-list .col-card > .ut-sess-mark:not([hidden])');
    const inPane = await waitFor(`(app.wm.windows.get(app.wm.activeWindowId) || {}).type === 'inbox' && document.querySelectorAll('.iw-item .iw-opt').length === 2`, 8000);
    check('④ …its tap opens the For-you window in the conversation column on that question, its options as chips', inPane, await evalJs(`({ type: (app.wm.windows.get(app.wm.activeWindowId) || {}).type, opts: [...document.querySelectorAll('.iw-item .iw-opt')].map((b) => b.textContent) })`));
    await tap('.iw-item .iw-opts > .iw-opt:last-child');
    const answered = await waitFor(`!document.querySelector('#all-sessions-list .ut-sess-mark:not([hidden])')`, 8000);
    await tap('#mobile-nav-viewer-close');
    const conv = await evalJs(`(app.wm.windows.get(app.wm.activeWindowId) || {}).type || null`);
    check('④ …a chip answers it there (the row\'s marker leaves); the bar\'s ✕ brings the conversation back', answered && conv === 'chat', { answered, conv });
    const paths = await evalJs(`[...document.querySelectorAll('.col-card .col-card-path')].map((p) => { const t = p.querySelector('.wb-card-path-text'); const cs = t && getComputedStyle(t); const r = p.getBoundingClientRect(), L = document.getElementById('sidebar').getBoundingClientRect(); return { text: !!t, ellipsis: cs?.textOverflow === 'ellipsis', rtl: cs?.direction === 'rtl', inside: r.right <= L.right + 0.5 }; })`);
    check('④ each row\'s folder line keeps its TAIL (the head ellipsizes, rtl) inside the column — the real Duo\'s slice-2 shots cut «…/cwd/contra» with no ellipsis', paths.length >= 2 && paths.every((p) => p.text && p.ellipsis && p.rtl && p.inside), paths);
    await putDraft();
    // a window opened from the conversation never closes the list column (the phone's «yield the drawer» is not the column's)
    await evalJs(`(() => { app.openFileExplorer(); return 1; })()`); await sleep(1200);
    const a2 = await evalJs(ARRANGE);
    check('④ a window opened (Files) fills the conversation column; the list column stays on screen', a2.list.l === 0 && a2.list.w === 320 && a2.win.l === 321 && !a2.sbOpen, a2);
    await tap('#mobile-nav-viewer-close');
    const a3 = await evalJs(ARRANGE), d3 = await evalJs(DRAFT_JS);
    check('④ the ✕ on top of the bar closes it — the conversation is back with its draft', d3.same && d3.value === DRAFT, d3);
    await device(669, 867); await settle(669);
    const p = await evalJs(ARRANGE);
    await shot('regular-portrait-669x867.png');
    check('④ 669×867: the list column 0–320 | the conversation 321–669, the bar lying over the conversation (44 high)', p.list.l === 0 && p.list.w === 320 && p.win.l === 321 && p.win.w === 348 && p.nav.l === 321 && p.nav.w === 348 && p.nav.h === 44 && p.dir === 'row', p);
    check('④ …its head: ☰ · the name · its state word · Artifacts · ⋯ · ⚙', ['mobile-nav-menu', 'mobile-nav-artifacts', 'mobile-nav-more', 'mobile-nav-gear'].every((k) => p.btns.some((x) => x.id === k)) && !!p.navTitle && !/—/.test(p.navTitle) && !!p.navState, { btns: p.btns.map((x) => x.id), title: p.navTitle, state: p.navState });
    await tap('#mobile-nav-menu');
    const ph = await evalJs(ARRANGE);
    check('④ ☰ hides the list (no overlay, no scrim): the conversation takes 0–669', ph.listHidden && ph.win.l === 0 && ph.win.w === 669, ph);
    await device(951, 585); await settle(951);
    const pl = await evalJs(ARRANGE);
    check('④ a rotation shows the list again (a hidden list is a view of one orientation, never a memory)', !pl.listHidden && pl.list.w === 320, pl);
    // the Duo's own ladder
    await putDraft();
    let st = 0;
    for (const [w, h, pose] of DUO_LADDER) {
      st++;
      await device(w, h); await settle(w);
      const sig = await evalJs(SIGNATURE), rows = await evalJs(ROWS), draft = await evalJs(DRAFT_JS);
      await shot(`duo-${st}-${pose}-${w}x${h}.png`);
      check(`④ Duo ${st}. ${pose} ${w}×${h} (a) the transcript inside the viewport, uncovered`, rows.rows >= 1 && !rows.bad.length && rows.scrollX === 0, rows);
      const d = diff({ ...fresh['t' + w], homeOverWindow: false }, sig);
      check(`④ Duo ${st}. ${pose} ${w}×${h} (c) the chrome equals a fresh load's`, d.length === 0, d);
      check(`④ Duo ${st}. ${pose} ${w}×${h} (d) the draft is the same box with the same words`, draft.same && draft.value === DRAFT, draft);
    }
  }

  console.log('⑤ the trailing bar\'s doors (951×585, touch)');
  {
    await device(951, 585); await load(); await attachBoth();
    const selected = (id) => evalJs(`(() => { const b = document.getElementById(${JSON.stringify(id)}); return !!b && b.classList.contains('selected'); })()`);
    const activeType = () => evalJs(`(app.wm.windows.get(app.wm.activeWindowId) || {}).type || null`);
    await tap('#mobile-nav-files');
    check('⑤ Files: the explorer is on show in the conversation column, the button selected, the ✕ on top', (await activeType()) === 'files' && (await selected('mobile-nav-files')) && (await evalJs(`getComputedStyle(document.getElementById('mobile-nav-viewer-close')).display !== 'none'`)));
    await tap('#mobile-nav-viewer-close');
    check('⑤ ✕: the conversation is back (a chat on show), Files no longer selected', (await activeType()) === 'chat' && !(await selected('mobile-nav-files')));
    await tap('#mobile-nav-dest-channels');
    check('⑤ Channels: its window on show, the button selected', (await activeType()) === 'channels' && (await selected('mobile-nav-dest-channels')));
    await tap('#mobile-nav-dest-jobs');
    check('⑤ Background Work: its window on show, the button selected (Channels no longer)', (await activeType()) === 'jobs' && (await selected('mobile-nav-dest-jobs')) && !(await selected('mobile-nav-dest-channels')));
    await tap('#mobile-nav-dest-tasks');
    check('⑤ Task Groups: the list column turns to its board, the button selected', (await evalJs(`app.sidebar._activeTab`)) === 'tasks' && (await selected('mobile-nav-dest-tasks')));
    await evalJs(`document.querySelector('.sidebar-tab[data-tab="folders"]')?.click(); 1`);
    await tap('#mobile-nav-viewer-close'); await tap('#mobile-nav-viewer-close'); await sleep(300);
    await tap('#mobile-nav-more');
    const menu = await evalJs(`(() => { const m = document.querySelector('.taskbar-context-menu'); if (!m) return null; const b = m.getBoundingClientRect(); const bar = document.getElementById('mobile-nav').getBoundingClientRect(); return { right: Math.round(b.right), barLeft: Math.round(bar.left), rows: [...m.querySelectorAll('.taskbar-context-menu-item')].map((r) => r.textContent.trim()) }; })()`);
    check('⑤ ⋯: the window\'s menu opens INTO the conversation column (left of the bar)', !!menu && menu.right <= menu.barLeft, menu);
    check('⑤ …with no window-manager verb and no Close (leave = another row; end = Terminate)', !!menu && !menu.rows.some((x) => /Close|Minimize|Move to Desktop|Find window|Show side by side|✥/.test(x)) && menu.rows.some((x) => /Rename/.test(x)), menu && menu.rows);
    await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); 1`);
    // int355 — the ONE Close row two picks share (duo-build-1 `when: wmVerbs` ∪ phone-refusal-wrap `style: closeStyle`): the
    // regular class shows no Close and its end, Terminate, stays red; the same live conversation at 951 with a MOUSE (the
    // window manager) shows Close as «✕ Close window — it keeps running», not red (Close ≠ Terminate on both)
    const ROWS = `[...document.querySelectorAll('.taskbar-context-menu .taskbar-context-menu-item')].map((r) => ({ t: r.textContent.trim(), red: /--red/.test(r.getAttribute('style') || '') }))`;
    await tap('#mobile-nav-more');
    const regRows = await evalJs(ROWS);
    await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); 1`);
    await device(951, 585, { mouse: true }); await settle(951, { mouse: true });
    await evalJs(`(() => { const w = app.wm.windows.get(app.wm.activeWindowId); const tb = w && w.element && w.element.querySelector('.window-titlebar'); if (!tb) return 0; const b = tb.getBoundingClientRect(); tb.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 40, clientY: b.top + b.height / 2 })); return 1; })()`);
    const deskRows = await evalJs(ROWS);
    await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); 1`);
    const term = (rows) => (rows || []).find((x) => /Terminate/.test(x.t));
    const closeRow = (deskRows || []).find((x) => /Close/.test(x.t));
    check('⑤ int355: one Close row, two picks — regular: no Close, Terminate red; 951 with a mouse: «✕ Close window — it keeps running», not red, Terminate red',
      !(regRows || []).some((x) => /Close/.test(x.t)) && term(regRows)?.red === true && closeRow?.t === '✕ Close window — it keeps running' && closeRow.red === false && term(deskRows)?.red === true, { regRows, deskRows });
  }
  console.log('⑧ THE DESKTOPS DOOR (lane desktop-switch-phone — userW on the Duo\'s inner display: «如何在这个界面下切换桌面？»; 951×585 + 382×580, touch) + the landscape list column\'s ☰');
  {
    await device(951, 585); await load(); await attachBoth();
    // a second desktop holding one window (the explorer), then back to the first — the server keeps both
    const deskB = await evalJs(`(async () => { const dm = app.desktopManager; const id = dm.createDesktop('Desk B'); await dm.switchTo(id); app.openFileExplorer(); return id; })()`);
    await waitFor(`[...app.wm.windows.values()].some((w) => w.type === 'files' && w._desktopId === ${JSON.stringify(deskB)})`, 8000); await sleep(1300);
    const desk1 = await evalJs(`app.desktopManager.desktops[0].id`);
    await evalJs(`(async () => { await app.desktopManager.switchTo(${JSON.stringify(desk1)}); return 1; })()`); await sleep(1300);
    const DOOR = `(() => { const b = document.getElementById('mobile-nav-desktops'); if (!b) return null; const r = b.getBoundingClientRect(), bar = document.getElementById('mobile-nav').getBoundingClientRect(); const y = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; }; const badge = b.querySelector('.mnav-badge');
      return { shown: getComputedStyle(b).display !== 'none' && r.width > 0, l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), barL: Math.round(bar.left), gapT: y('#mobile-nav .mnav-gap'), tasksT: y('#mobile-nav-dest-tasks'), badge: badge && !badge.classList.contains('hidden') ? badge.textContent : '', label: b.getAttribute('aria-label') }; })()`;
    const MENU = `(() => { const m = document.querySelector('.context-menu.mdesk-menu'); if (!m) return null; const b = m.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), rows: [...m.querySelectorAll('.context-menu-item')].map((r) => ({ id: r.dataset.desktopId || null, active: r.classList.contains('active'), name: r.querySelector('.mdesk-name')?.textContent || '', count: r.querySelector('.mdesk-count')?.textContent || '', titles: r.querySelector('.mdesk-titles')?.textContent || '', h: Math.round(r.getBoundingClientRect().height) })) }; })()`;
    /** THE SHEET'S GEOMETRY (主开发's defect on 8fda0ac8: at 951 the menu took its rows' max-content width — ~1790 px with long
     *  titles — and ran off the LEFT edge; the content legs passed, nothing measured where it stood). */
    const GEOM = `(() => { const m = document.querySelector('.context-menu.mdesk-menu'); if (!m) return null; const b = m.getBoundingClientRect(); const ws = document.getElementById('workspace').getBoundingClientRect();
      const vis = (e) => { if (!e) return 0; const r = e.getBoundingClientRect(); return Math.max(0, Math.min(r.right, innerWidth, b.right) - Math.max(r.left, 0, b.left)); };
      return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), btm: Math.round(b.bottom), w: Math.round(b.width), vw: innerWidth, vh: innerHeight, colL: Math.round(ws.left), colR: Math.round(ws.right),
        names: [...m.querySelectorAll('.context-menu-item')].map((it) => { const n = it.querySelector('.mdesk-name'); return { text: n ? n.textContent : '', vis: Math.round(vis(n)), w: n ? Math.round(n.getBoundingClientRect().width) : 0 }; }) }; })()`;
    const inside = (g, { col = false } = {}) => !!g && g.l >= 0 && g.r <= g.vw && g.t >= 0 && g.btm <= g.vh && (!col || (g.l >= g.colL && g.r <= g.colR && g.w <= 480)) && g.names.length >= 2 && g.names.every((n) => n.vis > 0 && n.vis >= Math.min(n.w, 40));
    const SHOWN = `(() => { const w = app.wm.windows.get(app.wm.activeWindowId); const el = w && w.element; const r = el && el.getBoundingClientRect(); const sb = document.getElementById('sidebar'); const sr = sb.getBoundingClientRect();
      return { desk: app.desktopManager.activeDesktopId, type: w ? w.type : null, onDesk: w ? w._desktopId : null, visible: !!el && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none', l: r ? Math.round(r.left) : null, w: r ? Math.round(r.width) : null, list: getComputedStyle(sb).display !== 'none' ? { l: Math.round(sr.left), w: Math.round(sr.width) } : null, badge: document.querySelector('#mobile-nav-desktops .mnav-badge')?.textContent || '' }; })()`;
    const d0 = await evalJs(DOOR);
    check('⑧ 951: the trailing bar\'s bottom section starts with Desktops (after the gap, before Task Groups), 44 × 44, badge «1», «(1/2)» in its label', !!d0 && d0.shown && d0.w === 44 && d0.h === 44 && d0.l >= d0.barL && d0.t > d0.gapT && d0.t < d0.tasksT && d0.badge === '1' && /\(1\/2\)/.test(d0.label || ''), d0);
    await tap('#mobile-nav-desktops');
    const m0 = await evalJs(MENU);
    check('⑧ …a tap: a menu INTO the conversation column (left of the bar) — every desktop by name with its window count, the active one marked, then «New desktop»; 44 px rows',
      !!m0 && m0.right <= d0.barL && m0.rows.length === 3 && m0.rows[0].active && /\b2 windows/.test(m0.rows[0].count) && m0.rows[1].name === 'Desk B' && !m0.rows[1].active && /^1 window$/.test(m0.rows[1].count) && /New desktop/.test(m0.rows[2].name) && !m0.rows[2].id && m0.rows.every((r) => r.h >= 44), m0);
    const g0 = await evalJs(GEOM);
    check('⑧ …and WHERE it stands: inside the viewport AND over the conversation column (≤ 480 px, right of the list, left of the bar); every row\'s name visible on screen', inside(g0, { col: true }), g0);
    check('⑧ …each row\'s window titles under its name, greyed (the two conversations; the explorer)', /^Session \d.* · Session \d/.test(m0.rows[0].titles) && /vs-duo-layout-home|~|Files/.test(m0.rows[1].titles), m0.rows.map((r) => r.titles));
    { // a long press on a row = the desktop's own verbs (Rename · Delete — the switcher tab's long press)
      const at = await evalJs(`(() => { const r = document.querySelector('.mdesk-menu .context-menu-item[data-desktop-id="${deskB}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] }); await sleep(800);
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400);
      const verbs = await evalJs(`[...document.querySelectorAll('.context-menu:not(.mdesk-menu) .context-menu-item')].map((r) => r.textContent.trim())`);
      check('⑧ …a long press on a row: Rename · Delete (the manager\'s own verbs; the sheet gives way to them)', JSON.stringify(verbs) === JSON.stringify(['Rename', 'Delete']) && !(await evalJs(`!!document.querySelector('.mdesk-menu')`)), verbs);
      await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); 1`);
      await tap('#mobile-nav-desktops');
    }
    await tap(`.mdesk-menu .context-menu-item[data-desktop-id="${deskB}"]`);
    await waitFor(`app.desktopManager.activeDesktopId === ${JSON.stringify(deskB)} && (app.wm.windows.get(app.wm.activeWindowId) || {})._desktopId === ${JSON.stringify(deskB)}`, 6000); await sleep(500);
    const s1 = await evalJs(SHOWN);
    await shot('desktops-door-951.png');
    check('⑧ …a tap on «Desk B»: that desktop is on show — its window (the explorer) fills the conversation column, the list column stays, the badge says 2', s1.desk === deskB && s1.type === 'files' && s1.onDesk === deskB && s1.visible && s1.l === 321 && !!s1.list && s1.list.l === 0 && s1.list.w === 320 && s1.badge === '2', s1);
    // the conversation's head (in landscape the window's own title bar) = the window switcher with its desktop tabs (主开发: the regular class gets the compact class's door too)
    await sleep(1100); // the manager's switch guard
    const head = await evalJs(`(() => { const t = document.querySelector('.window.window-active > .window-titlebar'); const b = t.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    await tapAt(head.x, head.y);
    const sw = await evalJs(`(() => { const p = document.querySelector('.mobile-win-switcher'); if (!p) return null; const b = p.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), tabs: [...p.querySelectorAll('.mobile-desk-tab:not(.mobile-desk-add)')].map((x) => x.textContent) }; })()`);
    check('⑧ the conversation\'s head (its title bar): the window switcher with both desktop tabs, over the conversation column only', !!sw && sw.tabs.length === 2 && sw.l >= 321 && sw.r <= 895 && sw.t >= 40, sw);
    await tap('.mobile-win-switcher .mobile-desk-tab');
    await waitFor(`app.desktopManager.activeDesktopId === ${JSON.stringify(desk1)} && (app.wm.windows.get(app.wm.activeWindowId) || {})._desktopId === ${JSON.stringify(desk1)}`, 6000);
    const s2 = await evalJs(SHOWN);
    check('⑧ …its first tab: back on the first desktop, a conversation of it on show', s2.desk === desk1 && s2.type === 'chat' && s2.visible && s2.l === 321, s2);
    await evalJs(`document.querySelector('.mobile-win-switcher')?.remove(); 1`); await sleep(1100);
    // the list column's ☰ in landscape (the owner 2026-10-25, 与原文不同 — SPEC-v3 §4 had it static there)
    const LT = `(() => { const b = document.getElementById('list-column-toggle'); const r = b && b.getBoundingClientRect(); const sb = document.getElementById('sidebar'); const w = document.querySelector('.window.window-active'); const wr = w && w.getBoundingClientRect();
      return { btn: b && getComputedStyle(b).display !== 'none' ? { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width) } : null, hidden: document.documentElement.classList.contains('vs-list-hidden'), list: getComputedStyle(sb).display !== 'none' && sb.getBoundingClientRect().width > 0, win: wr ? { l: Math.round(wr.left), w: Math.round(wr.width) } : null }; })()`;
    const l0 = await evalJs(LT);
    check('⑧ landscape: the list column\'s ☰ at the conversation\'s head (its left edge), the list shown by default', !!l0.btn && l0.btn.l === 321 && l0.btn.t === 0 && l0.btn.w === 44 && !l0.hidden && l0.list, l0);
    await tap('#list-column-toggle'); await sleep(300);
    const l1 = await evalJs(LT);
    check('⑧ ☰: the list column is gone, the conversation takes 0–895 (951 − the 56 px bar), the ☰ at its new left', l1.hidden && !l1.list && !!l1.win && l1.win.l === 0 && l1.win.w === 895 && !!l1.btn && l1.btn.l === 0, l1);
    await load(); await waitFor(`!!document.querySelector('.window.window-active')`, 10000); await sleep(400);
    const l2 = await evalJs(LT);
    check('⑧ …a reload keeps this tab\'s choice (the list stays hidden, the conversation wide)', l2.hidden && !l2.list && (!l2.win || l2.win.l === 0), l2);
    await tap('#list-column-toggle'); await sleep(300);
    const l3 = await evalJs(LT);
    check('⑧ ☰ again: the list column is back (0–320), the conversation 321–895', !l3.hidden && l3.list && (!l3.win || (l3.win.l === 321 && l3.win.w === 574)), l3);
    // the cover (compact): the same door on the top bar, the phone's sheet
    await device(382, 580); await settle(382);
    const c0 = await evalJs(`(() => { const b = document.getElementById('mobile-nav-desktops'); const r = b.getBoundingClientRect(); const nav = document.getElementById('mobile-nav').getBoundingClientRect(); return { shown: getComputedStyle(b).display !== 'none' && r.width >= 36 && r.height >= 36, inNav: r.top >= nav.top - 0.5 && r.bottom <= nav.bottom + 0.5 && r.right <= 382, badge: b.querySelector('.mnav-badge')?.textContent || '', toggle: getComputedStyle(document.getElementById('list-column-toggle')).display }; })()`);
    check('⑧ 382 (the cover, compact): the Desktops door on the top bar (≥ 36 px), badge «1»; the regular class\'s list ☰ not there', c0.shown && c0.inNav && c0.badge === '1' && c0.toggle === 'none', c0);
    await tap('#mobile-nav-desktops');
    const m1 = await evalJs(MENU), g1 = await evalJs(GEOM);
    check('⑧ 382: the sheet inside the viewport, every row\'s name visible', inside(g1), g1);
    check('⑧ …a tap: the phone\'s sheet under the bar lists both desktops with their counts + «New desktop»', !!m1 && m1.rows.length === 3 && m1.rows[0].active && m1.rows[1].name === 'Desk B' && /^1 window$/.test(m1.rows[1].count) && m1.left <= 10 && m1.right >= 372, m1);
    check('⑧ …Desk B\'s explorer is in its held record only (this page booted on the first desktop): its row says so', /1 not opened on this screen yet/.test(m1.rows[1].titles), m1.rows[1]);
    await tap(`.mdesk-menu .context-menu-item[data-desktop-id="${deskB}"]`);
    await waitFor(`app.desktopManager.activeDesktopId === ${JSON.stringify(deskB)} && (app.wm.windows.get(app.wm.activeWindowId) || {})._desktopId === ${JSON.stringify(deskB)}`, 8000); await sleep(500);
    const s3 = await evalJs(SHOWN);
    await shot('desktops-door-382.png');
    check('⑧ …a tap on «Desk B»: the phone shows that desktop\'s window (the explorer — never built on this page before: the lazy replay), filling the screen, badge 2', s3.desk === deskB && s3.type === 'files' && s3.visible && s3.l === 0 && s3.w >= 380 && s3.badge === '2', s3);
    const noted = await evalJs(`(() => { const m = JSON.parse(sessionStorage.getItem('vibespace.phoneShown') || '{}'); return Object.entries(m).map(([d, w]) => ({ d, w, wd: (app.wm.windows.get(w) || {})._desktopId || null })); })()`);
    check('⑧ …§6b guard 10: every desktop\'s noted window on show is a window OF that desktop (the switch\'s in-between noted none)', noted.length >= 1 && noted.every((x) => !x.wd || x.wd === x.d) && noted.some((x) => x.d === deskB), noted);
    await sleep(1100);
    await evalJs(`(async () => { await app.desktopManager.switchTo(${JSON.stringify(desk1)}); return 1; })()`); await sleep(1300);
    await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); 1`);
    await device(669, 867); await settle(669);
    await tap('#mobile-nav-desktops');
    const g2 = await evalJs(GEOM), nav2 = await evalJs(`Math.round(document.getElementById('mobile-nav').getBoundingClientRect().bottom)`);
    await shot('desktops-door-669.png');
    check('⑧ 669 (the inner portrait): the menu under the bar lying over the conversation, inside the conversation column, every row\'s name visible', inside(g2, { col: true }) && g2.t >= nav2, { g2, nav2 });
    await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); 1`);
  }
  console.log('⑨ the ⧉ window list\'s «Other desktops» group (1280×800, a mouse) + THE DOOR CENSUS (every phone-chrome control that opens desktop rows)');
  {
    await device(1280, 800, { mouse: true }); await load(); await waitFor(`!!document.querySelector('.window.window-active')`, 10000); await sleep(600);
    const deskB = await evalJs(`(app.desktopManager.desktops.find((d) => d.name === 'Desk B') || {}).id || null`);
    await evalJs(`document.getElementById('taskbar-status').click(), 1`); await sleep(400);
    const LIST = `(() => { const p = document.querySelector('.overlap-switcher'); if (!p) return null; return { mine: [...p.querySelectorAll('.overlap-switcher-item:not(.overlap-switcher-group):not(.overlap-switcher-other)')].length, head: p.querySelector('.overlap-switcher-group')?.textContent || null, others: [...p.querySelectorAll('.overlap-switcher-other')].map((r) => ({ win: r.dataset.winId, desk: r.dataset.desktopId, text: r.textContent })) }; })()`;
    const w0 = await evalJs(LIST);
    check('⑨ the ⧉ list: the active desktop\'s windows (its filter stays the view), then a FOLDED «Other desktops (1)»', !!w0 && w0.mine === 2 && /Other desktops \(1\)/.test(w0.head || '') && w0.others.length === 0, w0);
    await evalJs(`document.querySelector('.overlap-switcher-group').click(); 1`); await sleep(200);
    const w1 = await evalJs(LIST);
    check('⑨ …unfolded: «<title> · Desk B» (the explorer the record holds — this page never built it)', !!w1 && w1.others.length === 1 && w1.others[0].desk === deskB && / · Desk B$/.test(w1.others[0].text), w1);
    await evalJs(`document.querySelector('.overlap-switcher-other').click(); 1`);
    const went = await waitFor(`app.desktopManager.activeDesktopId === ${JSON.stringify(deskB)} && (app.wm.windows.get(app.wm.activeWindowId) || {}).type === 'files'`, 8000);
    check('⑨ …a press: Desk B on show AND its explorer raised (built by the switch\'s replay, then revealed)', went, await evalJs(`({ desk: app.desktopManager.activeDesktopId, type: (app.wm.windows.get(app.wm.activeWindowId) || {}).type || null })`));
    await sleep(1100);
    await evalJs(`(async () => { await app.desktopManager.switchTo(app.desktopManager.desktops[0].id); return 1; })()`); await sleep(1300);
  }
  /** THE DOOR CENSUS: every control of the phone chrome on screen (the nav's buttons and title, the conversation's title bar,
   *  the list's ☰) pressed once; a door = a press that shows two desktop rows (the sheet's, or the switcher's tabs). Each
   *  press is undone (menus, sheets, a dialog, the drawer, a window it opened, the list's tab / column). Two buttons are not
   *  pressed — they act, they lead nowhere: the compact bar's ✕ (closes the window on show) and + (New Session). The
   *  taskbar's own switcher must be off screen. */
  const doorCensus = async () => {
    const taskbar = await evalJs(`(() => { const t = document.getElementById('taskbar'); return !!t && getComputedStyle(t).display !== 'none' && t.getBoundingClientRect().height > 0; })()`);
    const targets = await evalJs(`(() => { const out = []; const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
      document.querySelectorAll('#mobile-nav > button, #mobile-nav-title, .window.window-active > .window-titlebar, #list-column-toggle').forEach((e, i) => { if (!vis(e) || e.id === 'mobile-nav-close' || e.id === 'mobile-nav-new') return; e.dataset.census = 'c' + i; out.push({ sel: '[data-census="c' + i + '"]', id: e.id || e.className.split(' ')[0] }); }); return out; })()`);
    const doors = [];
    for (const { sel, id } of targets) {
      const before = await evalJs(`[...app.wm.windows.keys()]`);
      try { await tap(sel); } catch { continue; }
      const rows = await evalJs(`document.querySelectorAll('.mdesk-menu [data-desktop-id], .mobile-win-switcher .mobile-desk-tab:not(.mobile-desk-add)').length`);
      if (rows >= 2) doors.push(id);
      await evalJs(`(() => { document.querySelectorAll('.context-menu, .mobile-win-switcher, [data-popover]').forEach((m) => m.remove()); document.querySelectorAll('.usage-popup').forEach((p) => p.classList.add('hidden')); app.hideDialogs?.();
        for (const id of [...app.wm.windows.keys()]) if (!${JSON.stringify(before)}.includes(id)) app.wm.closeWindow(id);
        document.querySelector('.sidebar-tab[data-tab="folders"]')?.click(); if (app.sidebar.isOpen) app.sidebar.toggle(false); if (document.documentElement.classList.contains('vs-list-hidden')) app.sidebar.setListHidden(false); return 1; })()`);
      await sleep(250);
    }
    return { taskbar, pressed: targets.map((x) => x.id), doors };
  };
  {
    await device(951, 585); await load(); await attachBoth();
    const c951 = await doorCensus();
    check('⑨ THE DOOR CENSUS at 951 (touch, the regular class): no taskbar — and the doors are the bar\'s Desktops + the conversation\'s head', !c951.taskbar && c951.doors.includes('mobile-nav-desktops') && c951.doors.includes('window-titlebar'), c951);
    await device(382, 580); await settle(382);
    const c382 = await doorCensus();
    check('⑨ …at 382 (the compact class): the top bar\'s Desktops + its title', !c382.taskbar && c382.doors.includes('mobile-nav-desktops') && c382.doors.includes('mobile-nav-title'), c382);
    mutantOn = 'door';
    await device(951, 585); await load(); await attachBoth();
    const red = await doorCensus();
    mutantOn = false;
    check('⑨ RED CONTROL — the base\'s no-door rules put back (ba15fe55): at 951 not one control of the phone chrome opens a desktop row, and no taskbar', !red.taskbar && red.doors.length === 0 && red.pressed.length >= 5, red);
    await load();
  }
  console.log('⑦ the posture ladder (folded alone moves nothing; segments:2 arranges; the cover ignores folded)');
  {
    const fold = () => evalJs(`document.documentElement.dataset.fold || null`);
    const posture = (type) => (type ? cdp('Emulation.setDevicePostureOverride', { posture: { type } }) : cdp('Emulation.clearDevicePostureOverride'));
    const metrics = (w, h, feature) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true, ...(feature ? { displayFeature: feature } : {}) });
    const boxes = () => evalJs(`(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; return { list: r('#sidebar'), win: r('.window.window-active'), nav: r('#mobile-nav'), input: r('.window.window-active .chat-input') }; })()`);
    await device(951, 585); await load(); await attachBoth(); await putDraft();
    const flat = await boxes();
    await posture('folded'); await sleep(250);
    const p1 = await fold(), pb = await boxes();
    check('⑦ folded alone on the inner display ⇒ pending, and NOTHING moves', p1 === 'pending' && JSON.stringify(pb) === JSON.stringify(flat), { p1, flat, pb });
    await sleep(1600);
    check('⑦ …no segments within 1.5 s ⇒ back to none (the ladder\'s own timeout)', (await fold()) === 'none');
    await posture(null); await sleep(150); await posture('folded'); await sleep(150);
    check('⑦ folded again ⇒ pending', (await fold()) === 'pending');
    await metrics(951, 585, { orientation: 'vertical', offset: 475, maskLength: 0 });
    await sleep(60);
    const early = await fold();
    await sleep(400);
    const bk = await fold(), bb = await boxes();
    await shot('fold-book-951x585.png');
    check('⑦ segments:2 during pending ⇒ book only after the enter settle (not at once)', early !== 'book' && bk === 'book', { early, bk });
    check('⑦ book: the list 0–465, the conversation from 485 (Safari\'s seamless pair at 475 + our 20 px seam), the bar unchanged', bb.list[0] === 0 && bb.list[2] === 465 && bb.win[0] >= 509 && bb.nav[0] === 895, bb);
    const seam = await evalJs(`(() => { const bad = []; const TAP = 'button, a, input, textarea, select, [role="button"], .session-item-card, .chat-msg, .window-titlebar, .sidebar-tab'; for (let x = 442; x <= 508; x += 6) for (let y = 4; y < innerHeight; y += 18) { const e = document.elementFromPoint(x, y); const t = e && e.closest(TAP); if (t) bad.push(x + ',' + y + ' ' + (t.id || t.className || t.tagName)); } return bad.slice(0, 6); })()`);
    check('⑦ book: nothing tappable in 441–509 (the seam + 24 px on each side)', seam.length === 0, seam);
    const dbk = await evalJs(DRAFT_JS);
    check('⑦ book: the draft is the same box with the same words', dbk.same && dbk.value === DRAFT, dbk);
    await metrics(951, 585, null); await sleep(100);
    const stillBook = await fold();
    await sleep(500);
    const back = await boxes();
    check('⑦ segments back to 1 ⇒ book holds through the leave settle, then the flat columns (320) again', stillBook === 'book' && back.list[2] === 320 && back.win[0] === 321, { stillBook, back });
    await posture(null); await sleep(200);
    // the cover's tent: folded + one segment on the compact class
    await device(594, 368); await settle(594); await sleep(300);
    const tent0 = await boxes();
    await posture('folded'); await sleep(400);
    check('⑦ the cover\'s tent (594×368, folded, one segment) ⇒ none, every box unchanged (the compact class ignores folded)', (await fold()) === 'none' && JSON.stringify(await boxes()) === JSON.stringify(tent0), tent0);
    await posture(null); await sleep(150);
    // the laptop
    await device(669, 867); await settle(669); await sleep(300);
    await posture('folded'); await metrics(669, 867, { orientation: 'horizontal', offset: 391, maskLength: 0 }); await sleep(600);
    const lp = await fold(), lb = await boxes();
    await shot('fold-laptop-669x867.png');
    check('⑦ laptop (the horizontal pair at 391): the list stays 0–320; the conversation\'s bar moves into the lower segment, onto the composer', lp === 'laptop' && lb.list[2] === 320 && lb.nav[1] > 401 && lb.nav[1] + lb.nav[3] <= lb.input[1] + 1 && lb.nav[0] === 321, { lp, lb });
    await metrics(669, 867, null); await posture(null); await sleep(600);
    check('⑦ flat again: the bar back on top of the conversation', (await fold()) === 'none' && (await boxes()).nav[1] === 0);
  }
  check('no page error over the legs', pageErrors.length === 0, pageErrors.slice(0, 3));

  console.log('⑥ RED CONTROL: a bundle with the base\'s four rules put back (the class frozen at boot, the composer focused on touch, no regular class, no posture ladder)');
  mutantOn = true;
  await device(951, 585, { mouse: true }); await load(); await attachBoth();
  {
    await device(382, 580, { mouse: true }); await settle(382, { frozen: true });
    const sig = await evalJs(SIGNATURE), rail = await evalJs(RAIL);
    await shot('red-cover-382x580.png');
    check('RED CONTROL: the cover after a fold keeps the desktop rail on screen (B-f5ec reproduced)', rail.rail, rail);
    check('RED CONTROL: …and its chrome is not a fresh load\'s', diff(fresh.m382, sig).length > 0, sig);
    await device(951, 585, { mouse: true }); await sleep(900);
    await device(669, 867, { mouse: true }); await settle(669, { frozen: true });
    const rows = await evalJs(ROWS);
    await shot('red-portrait-669x867.png');
    check('RED CONTROL: the inner portrait after a fold covers the transcript\'s left edge (B-1d40 reproduced)', rows.bad.length > 0, rows);
    await device(951, 585); await load(); await attachOne();
    const f = await evalJs(FOCUS);
    check('RED CONTROL: the base\'s rule focuses the composer on the touch Duo (the keyboard on load reproduced)', f.composer, f);
    const a = await evalJs(ARRANGE);
    check('RED CONTROL: the base\'s 951 Duo is the window manager — no list column, no trailing bar', !(a.list.l === 0 && a.list.w === 320 && a.dir === 'column'), a);
    await cdp('Emulation.setDevicePostureOverride', { posture: { type: 'folded' } });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 951, height: 585, deviceScaleFactor: 2, mobile: true, displayFeature: { orientation: 'vertical', offset: 475, maskLength: 0 } }); await sleep(600);
    check('RED CONTROL: the base reads no posture — a book fold arranges nothing (no data-fold)', !(await evalJs(`document.documentElement.dataset.fold === 'book'`)));
    await cdp('Emulation.clearDevicePostureOverride');
  }
  mutantOn = false;
} catch (e) {
  fail++; console.log('  ✗ the suite threw: ' + (e?.stack || e));
}
console.log(`  (shots: ${SHOTS})`);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
