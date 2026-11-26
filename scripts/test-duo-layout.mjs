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
//   ④b THE SYSTEM's SIDE COLUMN (B-78db — the Duo's home-screen copy): insets PLACED by Emulation.setSafeAreaInsetsOverride
//     (right 84, bottom 34 — the simulator's reading): inner 951×648 and outer 466×657 — the bar IN the column, global things
//     only in their order, under the clock's room and above the bottom inset; the conversation's search and menu at the
//     strip's «Conversation settings» door; a viewer's ✕ at its head; the never-overflow law at 951×360 (yields → ⚙'s rows);
//     the outer's own head = the name's row; the outer display with the LIST OPEN — the list stops where the column begins, every
//     button of the column the hit at its centre (r4681 MUST; RED: the rule cut by CSSOM). RED CONTROL: the release's stylesheet
//     (the bar at right 0, 56 px) is red
//   ④h THE SYSTEM's COLUMN ON THE LEFT (主开发 r4481 — the outer display held landscape, 678×445, insets left 84 · bottom 34):
//     the bar IN the column at x 0 (84 wide, global things only, in order, from the top, above the bottom inset), the list
//     column and the conversation after it (hidden: the conversation 84–678; shown: the list 84–404, the conversation from
//     405), ☰ follows, nothing of ours on the right; a long press's tip right of the bar, inside the screen. RED CONTROL: the
//     release's verdict (no column on the left) — the bar back on the right, an empty 84 beside it (the owner's picture)
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
//     bar, the phone's sheet, a tap on the second desktop shows its window (a lazy replay on this page); 375×812 (lane
//     desktop-doors-table — a phone could not reorder): a row's long press = THE table's doors — a middle desktop's four
//     open, the first's Move up / the last's Move down greyed WITH its why, 44 px rows inside the viewport; the last's Move
//     up from the phone reorders, the sheet comes back in the new order, a reload keeps it (the hub stored it); r2 ①: the
//     sheet open, a desktop deleted on another client — kept greyed with its why, its doors greyed; r3 ①: the window
//     switcher and the sheet opened and closed 5× each by every closer — no `vs-desktops` listener left (CDP's count)
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
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, CHROME_QUIET } from './scratch.mjs';
import { loadPage } from './cdp-page-load.mjs';
import { mintRoot, startHub, strippedEnv } from './hub-boot.mjs';
import { armWatchdog } from './suite-watchdog.mjs';
import { buildClientBundle } from './client-bundle.mjs';   // 主开发 r1291: a suite's changed client is built as the product builds its own
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port (test-architecture §57)
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
if (!fs.existsSync(path.join(repo, 'public', 'bundle.js'))) { console.log('✗ no public/bundle.js — run `npm run build` first'); process.exit(1); }

const [PORT, CDP_PORT] = await freePorts(2);
const root = mintRoot('duo-layout-wt'), wt = path.join(root, 't');
const chromeHome = path.join(root, 'chrome-home'); fs.mkdirSync(chromeHome, { recursive: true });   // rule nine (hub-boot.mjs): the suite's own browser carries a HOME in the root, so the helper ends it before the root goes
const fakeHome = path.join(root, 'home'); for (const d of ['.claude/projects', '.claude/sessions', '.config', '.vibespace']) fs.mkdirSync(path.join(fakeHome, d), { recursive: true });
const chromeDir = scratch('duo-layout-chrome');
const stubDir = path.join(root, 'stub');
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
  buildClientBundle({ repo, root: MUT, outFile: path.join(MUT, 'bundle-mut.js') });
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
  buildClientBundle({ repo, root: D, outFile: path.join(D, 'bundle-door.js') });
}
const DOOR_BUNDLE = fs.readFileSync(path.join(MUT, 'door', 'bundle-door.js'));

// ── throwaway server in a worktree (the tree's src/ + built public/) ──
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const hub = startHub({ root, tree: wt, port: PORT, env: { ...strippedEnv(), ...VNC_ENV, HOME: fakeHome, CLAUDE_CMD: path.join(stubDir, 'claude'), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', NO_AUTO_UPDATE: '1' }, keepLog: path.join(SHOTS, 'server.log') });
const chrome = spawn(CHROME, [...CHROME_QUIET, '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--password-store=basic',
  '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--disable-background-timer-throttling', `--user-data-dir=${chromeDir}`, 'about:blank'], { stdio: 'ignore', env: { ...process.env, HOME: chromeHome } });
const cleanup = () => {
  try { chrome.kill('SIGKILL'); } catch { }
  for (const d of [chromeDir, MUT]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
const PENDS = new Map();
armWatchdog({ capMs: 600e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
await hub.ready();

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
  const lp = await loadPage(cdp, ORIGIN + '/');   // B-1217 (13): the wait is tied to THIS navigation's document; a timeout is a named red (scripts/cdp-page-load.mjs)
  // (主开发 r1291) a load of a suite-built bundle PRINTS its time and its asks, so the margin shows on a green run
  if (mutantOn) console.log(`  · a mutant load (the suite's own bundle): the app booted in ${lp.ms} ms (${lp.asks} ask(s))`);
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
  // lane phone-titlebar-title: the compact bar folds ⚙ into its «⋯» by the TITLE's measure (the fresh loads hold no window, the ladder
  // two) — folded behind a ⋯ on show it is reachable, the same chrome; test-phone-titlebar-ui judges the fold itself
  if (document.getElementById('mobile-nav-gear')?.classList.contains('bar-folded') && on(document.getElementById('mobile-nav-overflow')) === 'shown') sig['#mobile-nav-gear'] = 'shown';
  sig.homeOverWindow = on(document.getElementById('phone-home')) === 'shown' && !!document.querySelector('.window.window-active');
  return sig;
})()`;
/** (a) every transcript row of the window on show: inside the viewport, and its left edge is the window's (nothing over it). */
const ROWS = `(() => {
  const W = innerWidth, H = innerHeight;
  const win = document.querySelector('.window.window-active');
  if (!win) return { rows: 0, bad: ['no window on show'] };
  // int373 — A COVER CHECK SAMPLES ONLY THE VISIBLE PART OF A ROW; AN INVISIBLE ROW IS SKIPPED BY NAME: a row the list's scroll edge
  // cuts is sampled over what shows; a row fully out of sight is skipped by name. The list clips its rows (it
  // scrolls): a row inside the viewport but outside the list's own box is not on screen, and sampling it read whatever lies behind
  // the window (a cascaded neighbour) as a cover. The .373 cut red on exactly that under the runner's fonts; the base passed only
  // because its invisible row's sample happened to land on the window's own header.
  const list = win.querySelector('.chat-message-list'), lb = list && list.getBoundingClientRect();
  const top = Math.max(0, lb ? lb.top : 0), bottom = Math.min(H, lb ? lb.bottom : H);
  const named = (r, i) => r.dataset.msgId || r.dataset.id || r.id || ('row ' + i);
  const all = [...win.querySelectorAll('.chat-message-list > .chat-msg')].map((r, i) => ({ r, i, b: r.getBoundingClientRect() }))
    .filter(({ b }) => b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < H);
  const seen = ({ b }) => b.bottom > top && b.top < bottom;
  const rows = all.filter(seen), skipped = all.filter((x) => !seen(x)).map(({ r, i }) => named(r, i));
  const bad = [];
  for (const { b } of rows) {
    if (b.left < -0.5 || b.right > W + 0.5) { bad.push('outside ' + Math.round(b.left) + '..' + Math.round(b.right) + ' of ' + W); continue; }
    const vt = Math.max(b.top, top), vb = Math.min(b.bottom, bottom);
    const hit = document.elementFromPoint(Math.max(0, b.left) + 3, vt + Math.min(12, (vb - vt) / 2));
    if (!hit || !win.contains(hit)) bad.push('covered at x ' + Math.round(b.left + 3) + ' by ' + (hit ? (hit.id ? '#' + hit.id : hit.className || hit.tagName) : 'nothing'));
  }
  const whole = rows.filter(({ b }) => b.top >= top - 0.5 && b.bottom <= bottom + 0.5).length;   // a REPORTED fact (messages the list shows top to bottom), never asserted
  return { rows: rows.length, whole, bad: bad.slice(0, 6), scrollX: Math.round(scrollX), skipped, list: lb ? [Math.round(lb.top), Math.round(lb.bottom)] : null };
})()`;
// the rows of the active list that are inside the viewport but outside the list's own box — counted independently of ROWS
const OUT_OF_SIGHT = `(() => { const win = document.querySelector('.window.window-active'); const l = win && win.querySelector('.chat-message-list'); if (!l) return [];
  const lb = l.getBoundingClientRect(), top = Math.max(0, lb.top), bottom = Math.min(innerHeight, lb.bottom);
  return [...l.querySelectorAll(':scope > .chat-msg')].map((r, i) => ({ r, i, b: r.getBoundingClientRect() })).filter(({ b }) => b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && !(b.bottom > top && b.top < bottom))
    .map(({ r, i }) => r.dataset.msgId || r.dataset.id || r.id || ('row ' + i)); })()`;
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
// lane phone-titlebar-title: on the compact bar the Desktops door (and ⚙) fold into ONE «⋯» while the title needs the room — the
// door's press is then the ⋯'s Desktops row (the door's own sheet, anchored at the ⋯); on the regular bar it stands as before
const deskFolded = () => evalJs(`!!document.getElementById('mobile-nav-desktops')?.classList.contains('bar-folded')`);
const pressDesktops = async () => { if (!(await deskFolded())) return tap('#mobile-nav-desktops'); await tap('#mobile-nav-overflow'); await sleep(250); return tap('.mnav-more-menu .context-menu-item[data-key="desktops"]'); };

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
  // B-16a9: a short view's fold lands from the strip host's ResizeObserver: waited for (bounded) before the boot is read, so the
  // rows below and the int373 control's out-of-sight rows are read on ONE settled layout, never across the fold
  const folded16 = await waitFor(`(() => { const d = document.querySelector('.window.window-active .chat-attn-dock'); return !!d && d.classList.contains('cad-short'); })()`, 3000);
  const boot = await evalJs(ROWS);
  // int373 (主开发's road 1): the one-column dock (the owner's accepted design, lane foryou-dock-layout) is two lines — 63 px under the
  // runner's DejaVu — and a 400-px-tall active window then shows ONE message at the boot, its top ~1 px under the list's edge (the
  // list's own scroll cuts it: no cover), where the old dock left two. The leg says what is true — at least one message on show and
  // nothing over what the list shows (`bad`, the B-1d40 measure); `whole` stays in the JSON as a fact. The short-window dock is B-16a9's (92f4d48fd): its leg follows the control below
  check('the boot: two windows, the active one\'s transcript shows at least one message and nothing over what the list shows (under DejaVu at 951×585 the one-column dock\'s 28 px leaves ONE message on show, its top ~1 px under the list\'s edge)', boot.rows >= 1 && !boot.bad.length, boot);
  { const out = await evalJs(OUT_OF_SIGHT);
    check(`CONTROL (int373): a row the list has scrolled out of sight is SKIPPED by name, never sampled — ${out.length} such row(s) at the boot (${out.join(', ')}), ROWS skipped exactly them and judged none of them`,
      out.length >= 1 && JSON.stringify(out) === JSON.stringify(boot.skipped) && !boot.bad.length, { out, skipped: boot.skipped, bad: boot.bad }); }
  // B-16a9 (the row's goal; lane bl-tests-chrome): THE DUO BOOT KEEPS TWO MESSAGES. Read from two measurements under the runner's
  // DejaVu: int373 at this very boot (the old 35-px dock left TWO messages on show, the one-column dock's 63 px left ONE) and
  // 92f4d48fd (the short view's one row is 35 px). The 400-px window is under SHORT_VIEW_PX (450): its strip folds (cad-short)
  { const dock = await evalJs(`(() => { const d = document.querySelector('.window.window-active .chat-attn-dock'); if (!d) return null; const b = d.getBoundingClientRect(); return { short: d.classList.contains('cad-short'), h: Math.round(b.height), viewH: d._viewH ? Math.round(d._viewH) : null }; })()`);
    console.log(`    the boot's strip (B-16a9): ${JSON.stringify(dock)} · folded within the wait: ${folded16} · rows ${boot.rows}, whole ${boot.whole}, list ${JSON.stringify(boot.list)}`);
    check('the boot (B-16a9): the active window\'s attention strip is the short view\'s ONE row (cad-short) and its transcript keeps TWO messages on show, nothing over them', !!dock && dock.short && boot.rows >= 2 && !boot.bad.length, { dock, folded16, boot }); }
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
    check('④ …its tap opens the For-you window in the conversation column on that question, its options as chips', inPane, await evalJs(`({ type: (app.wm.windows.get(app.wm.activeWindowId) || {}).type, opts: [...document.querySelectorAll('.iw-item .iw-opt')].map((b) => b.getAttribute('aria-label') || b.textContent) })`));
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
    // lane phone-six r2 (the acceptance: the name keeps ≥ 8 em or its whole width — «Ses…» was drawn here): when the name and
    // every button do not fit, the window's own extras yield first (#mobile-nav[data-yield]; the chat's status bar keeps Artifacts)
    const hy = await evalJs(`(() => { const e = document.getElementById('mobile-nav-title'), nav = document.getElementById('mobile-nav'), pr = document.createElement('span'); pr.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + getComputedStyle(e).font; pr.textContent = e.textContent; document.body.appendChild(pr); const whole = pr.getBoundingClientRect().width; pr.remove(); return { yield: nav.dataset.yield || '', w: Math.round(e.getBoundingClientRect().width), whole: Math.round(whole), em: parseFloat(getComputedStyle(e).fontSize) }; })()`);
    check('④ …its head: ☰ · the name · its state word · Artifacts · ⋯ · ⚙ — Artifacts yields to the name when both do not fit (the name drawn whole or ≥ 8 em)', ['mobile-nav-menu', 'mobile-nav-more', 'mobile-nav-gear'].every((k) => p.btns.some((x) => x.id === k)) && (p.btns.some((x) => x.id === 'mobile-nav-artifacts') || hy.yield === 'win') && hy.w + 1 >= Math.min(hy.whole, 8 * hy.em) && !!p.navTitle && !/—/.test(p.navTitle) && !!p.navState, { btns: p.btns.map((x) => x.id), title: p.navTitle, state: p.navState, hy });
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
  // ④b THE SYSTEM's SIDE COLUMN (bl-phone-ui, B-78db — 主开发 r3933 / r3948 / r3949): the iPhone Duo's home-screen copy draws under
  // the system's column (int359/duo-probe/RESULT.md: cover, right 84, bottom 34 on both displays). Chrome places those insets through
  // Emulation.setSafeAreaInsetsOverride({ insets: SafeAreaInsets }) — read from the kit's live /json/protocol (Chrome 154.0.8037.92,
  // probe b214928c8): insets MANDATORY; top / topMax / left / leftMax / bottom / bottomMax / right / rightMax optional integers; an
  // unset one leaves env() undefined (its fallback); env() follows it with or without viewport-fit=cover (the product's own cover
  // and column verdicts are test-viewport-class ⑤ / ⑤b). RED CONTROL: the release's stylesheet (the bar at right 0, 56 px).
  console.log('④b–④g THE SYSTEM\'s EDGES (B-78db: insets PLACED — the Duo\'s side column inner 951×648 / outer 466×657; an ordinary notched iPhone 390×844 / 844×390; the sheets\' order under a custom theme)');
  {
    const place = (insets) => cdp('Emulation.setSafeAreaInsetsOverride', { insets });
    // THE TEST SEAM (主开发 r4115's reach order — named in the line): the product asks cover and reads the column ONLY in an iPhone's
    // or iPad's home-screen copy (navigator.standalone === true, side-column.js). Chrome has no such property; the suite defines it
    // for ITS OWN pages (removed at the end of ④b–④d). What the probe reads: env(safe-area-inset-*), which Chrome's override sets
    // with or without cover (probe b214928c8).
    const seam = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true });" });
    const COL = `(() => { const nav = document.getElementById('mobile-nav'), r = nav.getBoundingClientRect();
      const kids = [...nav.children].filter((e) => e.getClientRects().length && getComputedStyle(e).position !== 'fixed' && !e.classList.contains('mnav-gap'))
        .map((e) => { const b = e.getBoundingClientRect(); return { id: e.id, top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; }).sort((a, b) => a.top - b.top);
      const shown = (id) => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; };
      return { sidecol: document.documentElement.dataset.sidecol || null, onshow: document.documentElement.dataset.onshow || null, left: Math.round(r.left), width: Math.round(r.width), w: innerWidth, h: innerHeight,
        kids, yielded: nav.dataset.colYield || '', out: ['mobile-nav-artifacts', 'mobile-nav-more', 'mobile-nav-live', 'mobile-nav-search', 'mobile-nav-dest-browser', 'mobile-nav-dest-jobs', 'mobile-nav-overflow', 'mobile-nav-close', 'mobile-nav-title'].filter(shown) }; })()`;
    const want = (c, ids, top) => { const got = c.kids.map((k) => k.id), exp = ids.filter((id) => id !== 'mobile-nav-desktops' || got.includes(id));
      return c.sidecol === 'right' && c.width === 84 && c.left === c.w - 84 && JSON.stringify(got) === JSON.stringify(exp) && c.kids.length > 0 && c.kids[0].top >= top && c.kids.at(-1).bottom <= c.h - 34 && c.kids.every((k) => k.left >= c.w - 84 && k.right <= c.w) && !c.out.length; };
    const INNER = ['mobile-nav-todos', 'mobile-nav-dest-tasks', 'mobile-nav-files', 'mobile-nav-dest-channels', 'mobile-nav-desktops', 'mobile-nav-gear'];
    const OUTER = ['mobile-nav-menu', 'mobile-nav-todos', 'mobile-nav-new', 'mobile-nav-dest-tasks', 'mobile-nav-files', 'mobile-nav-dest-channels', 'mobile-nav-desktops', 'mobile-nav-gear'];
    await device(951, 648); await place({ right: 84, rightMax: 84, bottom: 34, bottomMax: 34 }); await load(); await attachBoth();
    await waitFor(`document.documentElement.dataset.sidecol === 'right' && document.documentElement.dataset.onshow === 'chat'`, 5000); await sleep(300);
    const inner = await evalJs(COL);
    check('④b inner 951×648: the bar stands IN the column (84 wide at its edge), global things only — For you · Task Groups · Files · Channels · Desktops · ⚙ — under the clock\'s room (112) and above the bottom inset; nothing of the conversation in it', want(inner, INNER, 112), inner);
    // AT THE BOTTOM: the strip's «Conversation settings» door ends with the search and the window's menu; the menu opens above the door
    await tap('.window.window-active .chat-status-settings');
    const rows = await evalJs(`[...document.querySelectorAll('.chat-status-settings-row')].map((r) => r.className.match(/chat-status-col-[a-z]+/)?.[0] || '')`);
    await tap('.chat-status-col-window'); await sleep(300);
    const menu = await evalJs(`(() => { const m = document.querySelector('.taskbar-context-menu'), d = document.querySelector('.window.window-active .chat-status-settings'); if (!m || !d) return null; const b = m.getBoundingClientRect(); return { bottom: Math.round(b.bottom), doorTop: Math.round(d.getBoundingClientRect().top), right: Math.round(b.right), rows: [...m.querySelectorAll('.taskbar-context-menu-item')].map((r) => r.textContent.trim()) }; })()`);
    await evalJs(`document.querySelectorAll('.context-menu, .taskbar-context-menu, .chat-status-dropdown').forEach((m) => m.remove()); 1`);   // r4115 (f): the window menu it opened closes too
    check('④b inner: the conversation\'s search and its window\'s menu are the «Conversation settings» door\'s last rows; the menu (Rename…) opens ABOVE the door, left of the column',
      rows.slice(-2).join() === 'chat-status-col-search,chat-status-col-window' && !!menu && menu.bottom <= menu.doorTop && menu.right <= 951 - 84 && menu.rows.some((x) => /Rename/.test(x)), { rows, menu });
    // a viewer: its ✕ at its own head's end (left of the column), never in the column
    await tap('#mobile-nav-files'); await sleep(300);
    const x = await evalJs(`(() => { const b = document.getElementById('mobile-nav-viewer-close').getBoundingClientRect(); return { onshow: document.documentElement.dataset.onshow, top: Math.round(b.top), right: Math.round(b.right), w: Math.round(b.width) }; })()`);
    check('④b inner: a viewer (Files) wears its ✕ at its head\'s end — top 0, its right edge at the column\'s', x.onshow === 'viewer' && x.top === 0 && x.right === 951 - 84 && x.w === 44, x);
    await tap('#mobile-nav-viewer-close'); await sleep(300);
    // THE LAW: a short column yields in the stated order into rows of Global settings, never past the bottom inset
    await device(951, 360);
    await waitFor(`!!document.getElementById('mobile-nav').dataset.colYield`, 5000);   // r4115 (f): the yield's own mark, never a fixed sleep
    const short = await evalJs(COL);
    await tap('#mobile-nav-gear'); await waitFor(`!!document.querySelector('.gs-menu')`, 4000);
    // r4115 MUST 4: the yielded rows BY THEIR OWN IDS (gear-menu.js sets data-id from the contribution) — never a word another row also carries
    const ROWS_JS = `[...document.querySelectorAll('.gs-menu .gs-menu-item[data-id^="gear/column-"]')].map((r) => r.dataset.id)`;
    const gs = await evalJs(ROWS_JS);
    // a yielded door OPENS from its row (the row presses the hidden button): Channels' window comes on show
    const opened = gs.includes('gear/column-channels') ? (await tap('.gs-menu .gs-menu-item[data-id="gear/column-channels"]'), await waitFor(`(app.wm.windows.get(app.wm.activeWindowId) || {}).type === 'channels'`, 5000)) : null;
    await evalJs(`document.querySelectorAll('.context-menu, .global-settings-popover, .gs-menu').forEach((m) => m.remove()); 1`);
    if (opened) { await tap('#mobile-nav-viewer-close'); await waitFor(`document.documentElement.dataset.onshow === 'chat'`, 4000); }
    // …and gone again when the column is tall again
    await device(951, 648); await waitFor(`!document.getElementById('mobile-nav').dataset.colYield`, 5000);
    await tap('#mobile-nav-gear'); await waitFor(`!!document.querySelector('.gs-menu')`, 4000);
    const gsTall = await evalJs(ROWS_JS);
    await evalJs(`document.querySelectorAll('.context-menu, .global-settings-popover, .gs-menu').forEach((m) => m.remove()); 1`);
    const yl = short.yielded.split(' ').filter(Boolean), hasDesk = inner.kids.some((k) => k.id === 'mobile-nav-desktops');
    const ORDER = ['desktops', 'channels', 'files', 'tasks', 'todos'].filter((k) => k !== 'desktops' || hasDesk);
    check('④b the law at 951×360: the column yields Desktops then Channels (the stated order — 214 px of room for 308), ⚙ last above the bottom inset; the yielded doors ARE Global settings\' rows by their ids (gear/column-…), a yielded door opens from its row, and the rows are gone at 951×648 again',
      yl.length >= 1 && ORDER.slice(0, yl.length).join() === yl.join() && short.kids.at(-1).id === 'mobile-nav-gear' && short.kids.at(-1).bottom <= 360 - 34
      && JSON.stringify([...gs].sort()) === JSON.stringify(yl.map((k) => 'gear/column-' + k).sort()) && (opened === null || opened === true) && gsTall.length === 0, { short, gs, opened, gsTall });   // the menu sorts its rows by its own order: the SET is the law's
    // the outer display: the compact bar becomes the column; the window's own head is the name's row
    await device(466, 657); await load(); await attachBoth();
    await waitFor(`document.documentElement.dataset.vc === 'compact' && document.documentElement.dataset.sidecol === 'right'`, 5000); await sleep(400);
    const outer = await evalJs(COL);
    const head = await evalJs(`(() => { const t = document.querySelector('.window.window-active > .window-titlebar'); if (!t) return null; const b = t.getBoundingClientRect(); return { display: getComputedStyle(t).display, top: Math.round(b.top), right: Math.round(b.right), h: Math.round(b.height), name: t.querySelector('.window-title')?.dataset.name || '' }; })()`);
    check('④b outer 466×657: the bar is the column (☰ · For you · + · Task Groups · Files · Channels · Desktops · ⚙) under the clock\'s room (166), above the bottom inset; the window\'s own head is the name\'s row, clear of the column',
      want(outer, OUTER, 166) && !!head && head.display === 'flex' && head.top === 0 && head.h === 44 && head.right <= 466 - 84 && !!head.name, { outer, head });
    // r4115 (b): the window on show closes from its own row of «Conversation settings» on the outer display (two presses)
    await tap('.window.window-active .chat-status-settings'); await waitFor(`!!document.querySelector('.chat-status-dropdown')`, 4000);
    const outRows = await evalJs(`[...document.querySelectorAll('.chat-status-settings-row')].map((r) => r.className.match(/chat-status-col-[a-z]+/)?.[0] || '')`);
    await evalJs(`document.querySelectorAll('.chat-status-dropdown').forEach((m) => m.remove()); 1`);
    check('④b outer: the «Conversation settings» door ends with this conversation\'s search, its window\'s menu and «Close window» (the compact ✕\'s act, two presses)', outRows.slice(-3).join() === 'chat-status-col-search,chat-status-col-window,chat-status-col-close', outRows);
    // r4681 MUST (the full round of line 1062): THE LIST OPEN ON THE OUTER DISPLAY — the home-screen copy's FIXED wrapper is its own
    // stacking context, so the column's layer counts only inside it and the list (outside it, the phone's full-width overlay) covered
    // every global door. The list now stops where the column begins: each of the column's buttons is the hit at its centre while it is open
    const HITS = `(() => { const nav = document.getElementById('mobile-nav'), sb = document.querySelector('.sidebar'), r = sb.getBoundingClientRect();
      const kids = [...nav.children].filter((e) => e.getClientRects().length && getComputedStyle(e).position !== 'fixed' && !e.classList.contains('mnav-gap'));
      return { open: sb.classList.contains('open'), left: Math.round(r.left), right: Math.round(r.right), w: innerWidth, hits: kids.map((e) => { const b = e.getBoundingClientRect(), at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { id: e.id, hit: !!at && (at === e || e.contains(at)), on: at ? String(at.id || at.className || at.tagName).slice(0, 40) : null }; }) }; })()`;
    const listSettled = `(() => { const s = document.querySelector('.sidebar'); return !!s && s.classList.contains('open') && Math.round(s.getBoundingClientRect().left) === 0 && !s.getAnimations().length; })()`;
    await evalJs(`(app.sidebar.toggle(true), 1)`); await waitFor(listSettled, 5000);
    const lo = await evalJs(HITS);
    check(`④b outer, THE LIST OPEN: it stops where the column begins (0–${lo.right} of ${lo.w}); every one of the column's ${lo.hits.length} buttons is the hit at its centre`,
      lo.open && lo.left === 0 && lo.right === lo.w - 84 && lo.hits.length >= 6 && lo.hits.every((h) => h.hit), lo);
    // RED CONTROL: the stylesheet before this cure — its one rule taken out of the page's sheets (CSSOM), the list open
    await evalJs(`(() => { let n = 0; for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch { continue; } for (let i = rs.length - 1; i >= 0; i--) if (rs[i].selectorText === 'html[data-vc="compact"][data-sidecol] .sidebar') { sh.deleteRule(i); n++; } } window.__cutRules = n; return n; })()`);
    await waitFor(`(() => { const s = document.querySelector('.sidebar'); return !!s && Math.round(s.getBoundingClientRect().right) === innerWidth && !s.getAnimations().length; })()`, 5000);
    const lr = await evalJs(HITS), cutN = await evalJs('window.__cutRules');
    check(`④b RED CONTROL: without the cure (its rule cut from ${cutN} sheet(s)) the open list covers the column — ${lr.hits.filter((h) => !h.hit).length} of ${lr.hits.length} buttons under it (the hit: ${(lr.hits.find((h) => !h.hit) || {}).on})`,
      cutN >= 1 && lr.right === lr.w && lr.hits.length >= 6 && lr.hits.some((h) => !h.hit), { cutN, lr });
    await evalJs(`(app.sidebar.toggle(false), 1)`);
    // RED CONTROL: the release's stylesheet (everything from «THE SYSTEM's EDGES (B-78db» cut) — the bar at right 0, the conversation's buttons in it
    await device(951, 648); await load(); await attachBoth(); await sleep(300);
    await evalJs(`(async () => { const l = [...document.querySelectorAll('link[rel=stylesheet]')].find((x) => /\\/style\\.css/.test(x.href)); const css = await (await fetch(l.href)).text(); const cut = css.slice(0, css.indexOf('/* ── THE SYSTEM\\'s EDGES (B-78db')); const s = document.createElement('style'); s.textContent = cut; l.after(s); l.disabled = true; window.dispatchEvent(new Event('resize')); return cut.length; })()`);
    await sleep(800);
    const red = await evalJs(COL);
    check('④b RED CONTROL: under the release\'s stylesheet the same predicate is RED (the bar at right 0, 56 px — its buttons from 8 px, under the system\'s clock; the conversation\'s buttons in it)', !want(red, INNER, 112), red);
    // ④c AN ORDINARY NOTCHED iPHONE's HOME-SCREEN COPY (主开发 r4115 MUST 2 — the proof that nothing changed for everybody else): portrait
    // 390×844 (top 59, bottom 34) and landscape 844×390 (both sides 59, bottom 21), insets PLACED as for the Duo. Every bar of ours keeps
    // its own room below / beside the system's insets; the message box and the strip stand above the bottom inset; nothing of ours
    // inside a side inset; NO side column. RED CONTROL: 17c6dd081's compact rule (the inset as padding inside a 44 px box).
    const PHONE = `(() => { const nav = document.getElementById('mobile-nav'), r = nav.getBoundingClientRect();
      const rect = (e) => { const b = e.getBoundingClientRect(); return { id: e.id || String(e.className).split(' ')[0], top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
      const btns = [...nav.children].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0).map(rect);
      const box = (sel) => { const e = document.querySelector(sel); return e && e.getClientRects().length ? rect(e) : null; };
      return { vc: document.documentElement.dataset.vc, sidecol: document.documentElement.dataset.sidecol || null, w: innerWidth, h: innerHeight, nav: rect(nav), btns,
        input: box('.window.window-active .chat-input'), strip: box('.window.window-active .chat-status-bar'), tab: box('.sidebar .sidebar-tab'),
        chips: (() => { const st = document.querySelector('.window.window-active .chat-status-bar'); const ks = st ? [...st.children].filter((e) => e.getClientRects().length && e.getBoundingClientRect().height > 0) : [];
          return ks.length ? { bottom: Math.round(Math.max(...ks.map((e) => e.getBoundingClientRect().bottom))), right: Math.round(Math.max(...ks.map((e) => e.getBoundingClientRect().right))) } : null; })() }; })()`;
    // each judged PART by name (a red says which; the kit cuts a long detail): the strip's ground runs into the bottom inset by design (its
    // padding is the inset, chat.css), so the strip is judged by its CHIPS
    const portraitWhy = (c) => ({ cls: c.vc === 'compact' && !c.sidecol, btns: c.btns.length > 0 && c.btns.every((b) => b.top >= 59 && b.top >= c.nav.top && b.bottom <= c.nav.bottom),
      input: !!c.input && c.input.bottom <= c.h - 34, chips: !!c.chips && c.chips.bottom <= c.h - 34 });
    const portraitOk = (c) => Object.values(portraitWhy(c)).every(Boolean);
    // the trailing bar held landscape at 390 tall is TODAY's bar (no column — the law is the column's): at the release it already held more
    // buttons than its height (about 558 px of buttons for 361), its last ones cut by its overflow — printed, judged by no leg of this unit
    // (a decision put to the coordinator); judged here: every DRAWN button clear of the side insets
    const drawn = (c) => c.btns.filter((b) => b.top < c.h - 21);
    const landscapeWhy = (c) => ({ cls: c.vc === 'regular' && !c.sidecol, btns: drawn(c).length > 0 && drawn(c).every((b) => b.right <= c.w - 59),
      input: !!c.input && c.input.bottom <= c.h - 21 && c.input.right <= c.w - 59 && c.input.left >= 59, chips: !!c.chips && c.chips.bottom <= c.h - 21 && c.chips.right <= c.w - 59, list: !c.tab || c.tab.left >= 59 });
    const landscapeOk = (c) => Object.values(landscapeWhy(c)).every(Boolean);
    const panelRoom = async () => { await tap('.window.window-active .chat-status-settings'); await waitFor(`!!document.querySelector('.chat-status-dropdown')`, 4000);
      const p = await evalJs(`(() => { const d = document.querySelector('.chat-status-dropdown'), nav = document.getElementById('mobile-nav').getBoundingClientRect(); if (!d) return null; const b = d.getBoundingClientRect(); return { top: Math.round(b.top), navBottom: Math.round(nav.bottom), vertical: nav.height > nav.width, room: parseFloat(d.style.getPropertyValue('--dd-room')) || 0 }; })()`);
      await evalJs(`document.querySelectorAll('.chat-status-dropdown').forEach((m) => m.remove()); 1`); return p; };
    await device(390, 844); await place({ top: 59, topMax: 59, bottom: 34, bottomMax: 34 }); await load(); await attachBoth();
    await waitFor(`document.documentElement.dataset.vc === 'compact'`, 5000); await sleep(300);
    const por = await evalJs(PHONE), porPanel = await panelRoom();
    check('④c a notched iPhone held portrait 390×844 (top 59, bottom 34): the top bar\'s buttons inside its own box and wholly below the status bar, the message box and the strip above the home indicator, no side column; a strip panel stands under the bar\'s TRUE bottom',
      portraitOk(por) && !!porPanel && !porPanel.vertical && porPanel.top >= porPanel.navBottom, { why: portraitWhy(por), porPanel, nav: por.nav, chips: por.chips, input: por.input, btns: por.btns.map((b) => `${b.id}:${b.top}-${b.bottom}`) });
    await evalJs(`(() => { const s = document.createElement('style'); s.id = 'zz-b78db-red'; s.textContent = 'html[data-vc="compact"] #mobile-nav { height: 44px !important; }'; document.body.appendChild(s); return 1; })()`); await sleep(300);
    const porRed = await evalJs(PHONE);
    await evalJs(`document.getElementById('zz-b78db-red')?.remove(); 1`);
    check('④c RED CONTROL: 17c6dd081\'s compact bar (the inset as padding inside a 44 px box) is RED by the same predicate — its buttons under the clock', !portraitWhy(porRed).btns, { why: portraitWhy(porRed), btns: porRed.btns.map((b) => `${b.id}:${b.top}-${b.bottom}`) });
    await device(844, 390); await place({ left: 59, leftMax: 59, right: 59, rightMax: 59, bottom: 21, bottomMax: 21 }); await load(); await attachBoth();
    await waitFor(`document.documentElement.dataset.vc === 'regular'`, 5000); await sleep(300);
    const land = await evalJs(PHONE), landPanel = await panelRoom();
    const cut = land.btns.filter((b) => b.bottom > land.h - 21).map((b) => b.id);
    console.log(`  · ④c landscape 844×390: today's trailing bar (no column) holds ${land.btns.length} drawn buttons; past its room: ${cut.length ? cut.join(', ') : 'none'} (the bar's own yield is ④f's to judge)`);
    check('④c a notched iPhone held landscape 844×390 (both sides 59, bottom 21): the trailing bar\'s buttons clear of the right inset and above the bottom one, the list\'s rows after the left inset, the message box and the strip above the bottom inset, NO side column (the leading inset is not 0); a strip panel keeps its room (more than the 120 px floor) under a vertical bar',
      landscapeOk(land) && !!landPanel && landPanel.vertical && landPanel.room > 120, { why: landscapeWhy(land), landPanel, chips: land.chips, input: land.input, tab: land.tab, drawn: drawn(land).map((b) => `${b.id}:${b.right}`) });
    // the list column hidden (☰): the conversation column starts after the left inset, never under the sensor housing
    await tap('#list-column-toggle'); await waitFor(`document.documentElement.classList.contains('vs-list-hidden')`, 4000); await sleep(300);
    const hid = await evalJs(PHONE);
    await tap('#list-column-toggle'); await waitFor(`!document.documentElement.classList.contains('vs-list-hidden')`, 4000);
    check('④c …the list column hidden: the message box and the strip\'s chips start after the left inset (59)', !!hid.input && hid.input.left >= 59 && !!hid.chips && landscapeWhy(hid).chips, { input: hid.input, chips: hid.chips });
    // ④d THE STYLESHEETS' ORDER (主开发 r4115 MUST 1 — every device, the desktop included): a person's custom theme, injected into the head
    // at runtime, wins its ties against the sheets as at the release. RED CONTROL: 17c6dd081's order (the sheets after the head).
    await place({}); await device(1280, 800, { mouse: true }); await load();
    const themed = await evalJs(`(() => { const tm = app.themeManager; tm.registerCustomTheme('zz-b78db', { '--bg-root': '#123456' }); tm.apply('custom-zz-b78db'); return getComputedStyle(document.documentElement).getPropertyValue('--bg-root').trim(); })()`);
    const sheetsInHead = await evalJs(`document.head.querySelectorAll('link[rel="stylesheet"]').length`);
    const redTheme = await evalJs(`(async () => { const ls = [...document.head.querySelectorAll('link[rel="stylesheet"]')];
      const loads = ls.map((l) => new Promise((r) => { l.addEventListener('load', r, { once: true }); l.addEventListener('error', r, { once: true }); setTimeout(r, 4000); }));
      for (const l of ls) document.body.appendChild(l); await Promise.all(loads); await new Promise((r) => requestAnimationFrame(() => r()));
      return getComputedStyle(document.documentElement).getPropertyValue('--bg-root').trim(); })()`);
    await evalJs(`(() => { const tm = app.themeManager; tm.apply('dark'); tm.unregisterCustomTheme('zz-b78db'); return 1; })()`);
    check('④d a registered custom theme\'s ground, read as the computed value on the root, is the theme\'s (#123456) — the six sheets stand back in the head at their release place, so the theme\'s head rule comes after them (a desktop, 1280×800)', themed === '#123456' && sheetsInHead === 6, { themed, sheetsInHead });
    check('④d RED CONTROL: 17c6dd081\'s order (the sheets after the head) — the same theme falls back to the stylesheet\'s dark default', redTheme !== '#123456' && !!redTheme, { redTheme });
    // ④e THE BOOK POSE KEEPS ITS OWN MARGIN (主开发 r4187): with the list hidden (the setter the landscape carry-over takes), the
    // conversation stays right of the seam — the list-hidden inset rule reaches only the home-screen copy and NEVER the book pose. Run
    // WITH the seam on (a home-screen copy), so the book guard alone keeps it. RED CONTROL: f4499e926's unscoped rule put back.
    await device(951, 585); await cdp('Emulation.setDevicePostureOverride', { posture: { type: 'folded' } });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 951, height: 585, deviceScaleFactor: 2, mobile: true, displayFeature: { orientation: 'vertical', offset: 475, maskLength: 0 } });
    await load(); await waitFor(`document.documentElement.dataset.fold === 'book'`, 6000);
    await evalJs(`(app.sidebar.setListHidden(true), 1)`); await waitFor(`document.documentElement.classList.contains('vs-list-hidden')`, 3000); await sleep(300);
    const BOOK = `(() => { const r = document.getElementById('main-wrapper').getBoundingClientRect(), cs = getComputedStyle(document.documentElement); return { fold: document.documentElement.dataset.fold, hidden: document.documentElement.classList.contains('vs-list-hidden'), standalone: document.documentElement.dataset.standalone || null, left: Math.round(r.left), edge: Math.round(parseFloat(cs.getPropertyValue('--seg-edge')) || 475.5) }; })()`;
    const book = await evalJs(BOOK);
    await evalJs(`(() => { const s = document.createElement('style'); s.id = 'zz-b78db-book-red'; s.textContent = 'html[data-vc="regular"].vs-list-hidden #main-wrapper { margin-left: env(safe-area-inset-left, 0px) !important; }'; document.body.appendChild(s); return 1; })()`); await sleep(300);
    const bookRed = await evalJs(BOOK);
    await evalJs(`(document.getElementById('zz-b78db-book-red')?.remove(), app.sidebar.setListHidden(false), 1)`);
    await cdp('Emulation.clearDevicePostureOverride');
    check('④e the book pose with the list hidden keeps the seam\'s margin (the conversation right of the seam, in a home-screen copy at inset 0)', book.fold === 'book' && book.hidden && book.standalone === '1' && book.left >= book.edge, book);
    check('④e RED CONTROL: f4499e926\'s unscoped list-hidden rule draws the conversation over the list half (its margin 0)', bookRed.left < bookRed.edge, bookRed);
    // ④f THE BAR's OWN YIELD (主开发 r4185, for «.420»): the regular class's trailing bar held landscape with NO side column (an
    // ordinary iPhone at 844×390, insets placed; and 667×375, none) — every global door either drawn inside the bar's box or
    // YIELDED into its own row of Global settings (by id); the conversation's doors drawn or off; ⚙ in the bar. Which doors stand
    // there is unchanged (the owner's open question). RED CONTROL: the release's overflow — the law's marks taken off in the same frame.
    const GLOBAL = { 'mobile-nav-desktops': 'desktops', 'mobile-nav-todos': 'todos', 'mobile-nav-dest-tasks': 'tasks', 'mobile-nav-files': 'files', 'mobile-nav-dest-channels': 'channels', 'mobile-nav-dest-browser': 'browser', 'mobile-nav-dest-jobs': 'jobs' };
    const CONV = ['mobile-nav-artifacts', 'mobile-nav-search', 'mobile-nav-more'];
    const barState = (strip) => `(() => { const nav = document.getElementById('mobile-nav'), r = nav.getBoundingClientRect(), cs = getComputedStyle(nav);
      const top = r.top + parseFloat(cs.paddingTop), bottom = r.bottom - parseFloat(cs.paddingBottom);
      ${strip ? "document.querySelectorAll('#mobile-nav > .col-yield').forEach((e) => e.classList.remove('col-yield'));" : ''}
      const door = (id) => { const e = document.getElementById(id); if (!e) return { id, absent: true }; const shown = e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; const b = e.getBoundingClientRect();
        return { id, shown, inside: shown && b.top >= top - 0.5 && b.bottom <= bottom + 0.5, yielded: e.classList.contains('col-yield') }; };
      return { sidecol: document.documentElement.dataset.sidecol || null, vc: document.documentElement.dataset.vc, yieldAttr: nav.dataset.colYield || '', bottom: Math.round(bottom),
        global: ${JSON.stringify(Object.keys(GLOBAL))}.map(door), conv: ${JSON.stringify(CONV)}.map(door), gear: door('mobile-nav-gear') }; })()`;
    const barOk = (b, rows) => b.vc === 'regular' && !b.sidecol && b.gear.inside && b.conv.every((d) => d.absent || !d.shown || d.inside)
      && b.global.every((d) => !d.absent && (d.inside || (d.yielded && !d.shown && rows.includes('gear/column-' + GLOBAL[d.id]))));
    const gearRows = async () => { await tap('#mobile-nav-gear'); await waitFor(`!!document.querySelector('.gs-menu')`, 4000); const r = await evalJs(ROWS_JS);
      await evalJs(`document.querySelectorAll('.context-menu, .global-settings-popover, .gs-menu').forEach((m) => m.remove()); 1`); return r; };
    for (const [w, h, insets] of [[844, 390, { left: 59, leftMax: 59, right: 59, rightMax: 59, bottom: 21, bottomMax: 21 }], [667, 375, {}]]) {
      await device(w, h); await place(insets); await load(); await attachBoth();
      await waitFor(`document.documentElement.dataset.vc === 'regular' && !!document.getElementById('mobile-nav').dataset.colYield`, 6000);
      const b = await evalJs(barState(false)), rows = await gearRows();
      check(`④f the bar held landscape at ${w}×${h}: every global door drawn inside the bar or a row of Global settings by its id (yielded: ${b.yieldAttr || 'none'}), the conversation's doors drawn, ⚙ in the bar`,
        barOk(b, rows), { yieldAttr: b.yieldAttr, rows, global: b.global.map((d) => `${d.id}:${d.inside ? 'in' : d.yielded ? 'yield' : 'OUT'}`), conv: b.conv.map((d) => `${d.id}:${d.shown ? (d.inside ? 'in' : 'OUT') : 'off'}`), gear: b.gear.inside });
      const red = await evalJs(barState(true));
      await evalJs(`(window.dispatchEvent(new Event('resize')), 1)`); await waitFor(`!!document.getElementById('mobile-nav').dataset.colYield`, 4000);
      check(`④f RED CONTROL at ${w}×${h}: the release's bar (no yield) leaves global doors past its room — neither drawn inside nor a row`, !barOk(red, rows), { global: red.global.map((d) => `${d.id}:${d.inside ? 'in' : 'OUT'}`), gear: red.gear.inside });
    }
    // r4254 (the follow's round — tests only): BACK TO PORTRAIT and A TALL LANDSCAPE. The law strips every mark before it decides; after
    // a rotation out of the bar no door keeps a yield mark and Global settings holds no yielded row; on a regular landscape tall enough
    // for every door nothing yields at all
    const marksJs = `({ marks: [...document.querySelectorAll('#mobile-nav > .col-yield')].map((e) => e.id), attr: document.getElementById('mobile-nav').dataset.colYield || '', vc: document.documentElement.dataset.vc })`;
    const rowsByPress = async () => { await evalJs(`(app._showGlobalSettings(document.getElementById('mobile-nav-gear')), 1)`); await waitFor(`!!document.querySelector('.gs-menu')`, 4000); const r = await evalJs(ROWS_JS);
      await evalJs(`document.querySelectorAll('.context-menu, .global-settings-popover, .gs-menu').forEach((m) => m.remove()); 1`); return r; };
    await device(844, 390); await place({ left: 59, leftMax: 59, right: 59, rightMax: 59, bottom: 21, bottomMax: 21 }); await load(); await attachBoth();
    await waitFor(`!!document.getElementById('mobile-nav').dataset.colYield`, 6000);
    const before = await evalJs(marksJs);
    await place({ top: 59, topMax: 59, bottom: 34, bottomMax: 34 }); await device(390, 844);
    await waitFor(`document.documentElement.dataset.vc === 'compact' && !document.getElementById('mobile-nav').dataset.colYield`, 6000); await sleep(300);
    const after = await evalJs(marksJs), afterRows = await rowsByPress();
    check('④f a rotation out of the bar (844×390 → 390×844 portrait): the doors yielded there keep no mark, the bar\'s yield is gone, and Global settings holds no yielded row',
      before.marks.length > 0 && after.vc === 'compact' && after.marks.length === 0 && !after.attr && afterRows.length === 0, { before, after, afterRows });
    await place({}); await device(1000, 900); await load(); await attachBoth();
    await waitFor(`document.documentElement.dataset.vc === 'regular'`, 6000); await sleep(400);
    const tall = await evalJs(barState(false)), tallMarks = await evalJs(marksJs), tallRows = await gearRows();
    check('④f a tall regular landscape (1000×900, every door fits): NOTHING yields — every global door and ⚙ drawn inside the bar, no mark, no row',
      tall.global.every((d) => !d.absent && d.inside) && tall.gear.inside && tallMarks.marks.length === 0 && !tallMarks.attr && tallRows.length === 0, { global: tall.global.map((d) => `${d.id}:${d.inside ? 'in' : 'OUT'}`), tallMarks, tallRows });
    // ④g THE SIMULATOR's FAULTS (主开发 r4463, the owner's simulator driven by the coordinator): (1) the TOP BAND — in the home-screen copy the
    // page's chrome stands in ONE fixed container, #main-wrapper at the very rectangle the release's flow gives it (both classes); the blur
    // itself is the simulator's to show; (2) the LAUNCH's GROUND — a theme that applies remembers its ground, and the page the server sends
    // wears it from its first paint (<html> and the loading screen)
    const WRAP = `(() => { const w = document.getElementById('main-wrapper'), r = w.getBoundingClientRect(); return { pos: getComputedStyle(w).position, l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; })()`;
    const FLOW = `(() => { const h = document.documentElement, was = h.dataset.standalone; delete h.dataset.standalone; const out = ${WRAP}; h.dataset.standalone = was; return out; })()`;
    for (const [w, h] of [[951, 648], [466, 657]]) {
      await device(w, h); await place({ right: 84, rightMax: 84, bottom: 34, bottomMax: 34 }); await load(); await attachBoth();
      await waitFor(`document.documentElement.dataset.standalone === '1' && document.documentElement.dataset.sidecol === 'right'`, 6000); await sleep(300);
      const fx = await evalJs(WRAP), flow = await evalJs(FLOW);
      check(`④g ${w}×${h}: in the home-screen copy #main-wrapper is FIXED at the very rectangle the release's flow gives it (${fx.l},${fx.t}–${fx.r},${fx.b})`, fx.pos === 'fixed' && fx.l === flow.l && fx.t === flow.t && fx.r === flow.r && fx.b === flow.b, { fx, flow });
      check(`④g RED CONTROL ${w}×${h}: without the copy's mark (26d571cdb's page) the wrapper stands in the flow — the build whose title the system's band blurred`, flow.pos !== 'fixed', flow);
    }
    const ground = await evalJs(`(async () => { const tm = app.themeManager, gOf = () => getComputedStyle(document.documentElement).getPropertyValue('--bg-root').trim();
      const page = async () => (await fetch('/', { credentials: 'same-origin', cache: 'no-store' })).text();
      tm.apply('light'); const gl = gOf(), cl = document.cookie, hl = await page();
      tm.apply('dark'); const gd = gOf(), hd = await page();
      const wears = (html, g) => html.includes('<html lang="en" style="background:' + g + '">') && html.includes('background:' + g + ';color:');
      return { gl, gd, cookie: /vs_ground=/.test(cl), light: wears(hl, gl), dark: wears(hd, gd) }; })()`);
    check(`④g a theme that applies remembers its ground, and the page the server sends wears it in <html> and the loading screen (light ${ground.gl}, then dark ${ground.gd})`, ground.cookie && ground.light && ground.dark && ground.gl !== ground.gd, ground);
    // THE LAUNCH IMAGE (B-78db (B), 主开发 r4481): the page a real server sends holds the startup links in the ground it wears; one of them
    // answers a PNG through the sign-in; a size off the list is a 404 (the simulator alone can say whether the system takes it)
    const shot = await evalJs(`(async () => { const html = await (await fetch('/', { credentials: 'same-origin', cache: 'no-store' })).text(), g = getComputedStyle(document.documentElement).getPropertyValue('--bg-root').trim();
      const hrefs = [...html.matchAll(/<link rel="apple-touch-startup-image" media="[^"]+" href="([^"]+)">/g)].map((m) => m[1]);
      const duo = hrefs.find((h) => h.startsWith('/launch-image/1398x2034.png?')) || '', r = duo ? await fetch(duo, { credentials: 'same-origin' }) : null, b = r ? new Uint8Array(await r.arrayBuffer()) : new Uint8Array(0);
      const bad = await fetch('/launch-image/1399x2034.png', { credentials: 'same-origin' });
      return { n: hrefs.length, g, inG: hrefs.every((h) => h.endsWith('?g=' + encodeURIComponent(g))), duo, status: r ? r.status : 0, type: r ? r.headers.get('content-type') : '', sig: [...b.slice(0, 8)].join(','), bytes: b.length, off: bad.status }; })()`);
    check(`④g the page a real server sends holds ${shot.n} launch links in the ground it wears (${shot.g}); the Duo's answers a PNG (${shot.bytes} bytes, ${shot.type}) through the sign-in; a size off the list is a ${shot.off}`,
      shot.n === 26 && shot.inG && shot.status === 200 && /^image\/png/.test(shot.type) && shot.sig === '137,80,78,71,13,10,26,10' && shot.off === 404, shot);
    // ④h THE SYSTEM's COLUMN ON THE LEFT (主开发 r4481 — the owner's simulator: the outer display held landscape reads 678×445, the insets
    // left 84 · bottom 34, the regular class; the column stood EMPTY beside our bar on the right, the conversation 538 of 678). THE LAW:
    // wherever the system reserves a side column our global doors live INSIDE it. Insets PLACED; the list hidden, then shown.
    const LEFT = `(() => { const c = ${COL}, mw = document.getElementById('main-wrapper').getBoundingClientRect(), sb = document.querySelector('.sidebar');
      const sr = sb && sb.getClientRects().length && getComputedStyle(sb).display !== 'none' ? sb.getBoundingClientRect() : null, tg = document.getElementById('list-column-toggle').getBoundingClientRect();
      return { ...c, vc: document.documentElement.dataset.vc, hidden: document.documentElement.classList.contains('vs-list-hidden'), main: [Math.round(mw.left), Math.round(mw.right)], list: sr ? [Math.round(sr.left), Math.round(sr.right)] : null, toggle: Math.round(tg.left) }; })()`;
    const inLeft = (c) => { const got = c.kids.map((k) => k.id), exp = INNER.filter((id) => id !== 'mobile-nav-desktops' || got.includes(id));
      return c.sidecol === 'left' && c.vc === 'regular' && c.left === 0 && c.width === 84 && JSON.stringify(got) === JSON.stringify(exp) && c.kids[0].top >= 8 && c.kids.at(-1).bottom <= c.h - 34
        && c.kids.every((k) => k.left >= 0 && k.right <= 84) && !c.out.length && c.main[1] === c.w; };
    await device(678, 445); await place({ left: 84, leftMax: 84, bottom: 34, bottomMax: 34 }); await load(); await attachBoth();
    await waitFor(`document.documentElement.dataset.sidecol === 'left' && document.documentElement.dataset.onshow === 'chat'`, 6000);
    await evalJs(`(app.sidebar.setListHidden(true), 1)`); await sleep(300);
    const lh = await evalJs(LEFT);
    check(`④h 678×445, the column on the LEFT, the list hidden: the bar IN the column (x ${lh.left}, ${lh.width} wide) — global things only, in order, from the top, above the bottom inset; the conversation ${lh.main[0]}–${lh.main[1]} with ☰ at its head (${lh.toggle}); nothing of ours on the right`,
      inLeft(lh) && lh.hidden && !lh.list && lh.main[0] === 84 && lh.toggle === 84, lh);
    await evalJs(`(app.sidebar.setListHidden(false), 1)`); await sleep(300);
    const ls = await evalJs(LEFT);
    check(`④h the list shown: the list column after the column (${ls.list ? ls.list.join('–') : 'none'}), the conversation from ${ls.main[0]}, ☰ at ${ls.toggle}`,
      inLeft(ls) && !ls.hidden && !!ls.list && ls.list[0] === 84 && ls.main[0] === 84 + 321 && ls.toggle === 84 + 321, ls);
    // a long press says the door's name beside it — on the conversation's side, inside the screen
    const tipAt = await evalJs(`(() => { const g = document.getElementById('mobile-nav-gear'), r = g.getBoundingClientRect(); g.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 }));
      const t = document.querySelector('.mnav-tip'); if (!t) return null; const b = t.getBoundingClientRect(), out = { shown: getComputedStyle(t).display !== 'none', left: Math.round(b.left), right: Math.round(b.right), btn: Math.round(r.right), w: innerWidth, was: Math.round(r.left - t.offsetWidth - 8) }; t.style.display = 'none'; return out; })()`);
    check('④h a long press on ⚙ in the left column: its tip stands right of the button (the conversation\'s side, as the column on the right mirrors), inside the screen', !!tipAt && tipAt.shown && tipAt.left >= tipAt.btn && tipAt.right <= tipAt.w, tipAt);
    check('④h RED CONTROL: effa5382a\'s tip (left of every vertical bar) would stand off the screen there', !!tipAt && tipAt.was < 0, tipAt);
    // RED CONTROL: the release's verdict — no column on the left (sideColumnOf said null for left 84) — in the same frame
    await evalJs(`(app.sidebar.setListHidden(true), delete document.documentElement.dataset.sidecol, 1)`); await sleep(300);
    const leftRed = await evalJs(LEFT);
    await evalJs(`(window.dispatchEvent(new Event('resize')), 1)`); await waitFor(`document.documentElement.dataset.sidecol === 'left'`, 4000);
    await evalJs(`(app.sidebar.setListHidden(false), 1)`);
    check(`④h RED CONTROL: the release's verdict (no column on the left) — our bar back on the right (x ${leftRed.left}), an empty ${leftRed.main[0]} px band at the left, the conversation ${leftRed.main[1] - leftRed.main[0]} of ${leftRed.w} (the owner's picture)`,
      !inLeft(leftRed) && !leftRed.sidecol && leftRed.left === leftRed.w - 56 && leftRed.main[0] === 84 && leftRed.main[1] === leftRed.w - 56, leftRed);
    await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: seam.identifier });
    await place({}); await device(951, 585); await load();
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
    /** A desktop's doors menu (lane desktop-doors-table): each row's label, a shut one's why (on the row, inside the menu), 44 px. */
    const DESK_DOORS = `(() => { const m = document.querySelector('.context-menu.mdesk-doors'); if (!m) return null; const b = m.getBoundingClientRect();
      return { inside: b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5, sheet: !!document.querySelector('.mdesk-menu'),
        items: [...m.querySelectorAll(':scope > .context-menu-item')].map((it) => { const r = it.getBoundingClientRect(), w = it.querySelector('.door-why'), wr = w && w.getBoundingClientRect();
          return { label: (it.querySelector('.door-label') || it).textContent.trim(), why: w ? w.textContent.trim() : '', off: it.classList.contains('disabled'), h: Math.round(r.height), x: r.left + r.width / 2, y: r.top + r.height / 2,
            whyIn: !!wr && wr.width > 0 && wr.height > 0 && wr.left >= b.left - 0.5 && wr.right <= b.right + 0.5 && wr.top >= r.top - 0.5 && wr.bottom <= r.bottom + 0.5 }; }) }; })()`;
    /** A long press on the sheet's row of desktop `id` (a touch held 800 ms — the synthesized contextmenu). */
    const holdRow = async (id) => {
      const at = await evalJs(`(() => { const e = document.querySelector('.mdesk-menu .context-menu-item[data-desktop-id="${id}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!at) return;
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] }); await sleep(800);
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400);
    };
    const inside = (g, { col = false } = {}) => !!g && g.l >= 0 && g.r <= g.vw && g.t >= 0 && g.btm <= g.vh && (!col || (g.l >= g.colL && g.r <= g.colR && g.w <= 480)) && g.names.length >= 2 && g.names.every((n) => n.vis > 0 && n.vis >= Math.min(n.w, 40));
    const SHOWN = `(() => { const w = app.wm.windows.get(app.wm.activeWindowId); const el = w && w.element; const r = el && el.getBoundingClientRect(); const sb = document.getElementById('sidebar'); const sr = sb.getBoundingClientRect();
      return { desk: app.desktopManager.activeDesktopId, type: w ? w.type : null, onDesk: w ? w._desktopId : null, visible: !!el && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none', l: r ? Math.round(r.left) : null, w: r ? Math.round(r.width) : null, list: getComputedStyle(sb).display !== 'none' ? { l: Math.round(sr.left), w: Math.round(sr.width) } : null, badge: document.querySelector('#mobile-nav-desktops .mnav-badge')?.textContent || '' }; })()`;
    const d0 = await evalJs(DOOR);
    check('⑧ 951: the trailing bar\'s bottom section starts with Desktops (after the gap, before Task Groups), 44 × 44, badge «1», «(1/2)» in its label', !!d0 && d0.shown && d0.w === 44 && d0.h === 44 && d0.l >= d0.barL && d0.t > d0.gapT && d0.t < d0.tasksT && d0.badge === '1' && /\(1\/2\)/.test(d0.label || ''), d0);
    await pressDesktops();
    const m0 = await evalJs(MENU);
    check('⑧ …a tap: a menu INTO the conversation column (left of the bar) — every desktop by name with its window count, the active one marked, then «New desktop»; 44 px rows',
      !!m0 && m0.right <= d0.barL && m0.rows.length === 3 && m0.rows[0].active && /\b2 windows/.test(m0.rows[0].count) && m0.rows[1].name === 'Desk B' && !m0.rows[1].active && /^1 window$/.test(m0.rows[1].count) && /New desktop/.test(m0.rows[2].name) && !m0.rows[2].id && m0.rows.every((r) => r.h >= 44), m0);
    const g0 = await evalJs(GEOM);
    check('⑧ …and WHERE it stands: inside the viewport AND over the conversation column (≤ 480 px, right of the list, left of the bar); every row\'s name visible on screen', inside(g0, { col: true }), g0);
    // The explorer opens at the hub's HOME and titles its window with that folder, cut from the front past 40 characters
    // (src/lib/file-explorer.js: wm.setTitle(…, frontTruncate(data.path))). Since the boot helper (aa4b7c7d9) this suite's HOME
    // lives in its minted root (<root>/home), so the row reads THAT folder — the hosted run read «/tmp/vs-duo-layout-wt-h…/home»;
    // the leg compares with the suite's own HOME (or the tilde form), never with an old scratch home's spelling.
    const homeTitled = (s) => { const x = String(s || ''); return x === '~' || x === fakeHome || (x.startsWith('…') && x.length > 1 && fakeHome.endsWith(x.slice(1))); };
    check('⑧ …the title rule reads THIS suite\'s HOME: the HOME and its front-cut form pass; the old scratch home\'s spelling, another folder of the root and the window\'s first title do not',
      homeTitled(fakeHome) && homeTitled('…' + fakeHome.slice(-39)) && !homeTitled('/tmp/vs-duo-layout-home-abc123') && !homeTitled(path.join(root, 'stub')) && !homeTitled('File Explorer'));
    check('⑧ …each row\'s window titles under its name, greyed (the two conversations; the explorer, at the suite\'s HOME)', /^Session \d.* · Session \d/.test(m0.rows[0].titles) && homeTitled(m0.rows[1].titles), { titles: m0.rows.map((r) => r.titles), home: fakeHome });
    { // a long press on a row = the desktop's doors — THE table's (lane desktop-doors-table; was Rename · Delete, no order)
      await holdRow(deskB);
      const dd = await evalJs(DESK_DOORS);
      check(`⑧ …a long press on a row: the desktop's doors, the sheet gives way — Desk B is the last: Move down greyed WITH its why (${dd && dd.items.map((x) => x.label + (x.off ? ' [' + x.why + ']' : '')).join(' · ')})`,
        !!dd && !dd.sheet && JSON.stringify(dd.items.map((x) => x.label)) === JSON.stringify(['Rename…', 'Delete', 'Move up', 'Move down']) && dd.items[3].off && dd.items[3].why === 'Already the last desktop' && dd.items[3].whyIn && dd.items.slice(0, 3).every((x) => !x.off) && dd.inside, dd);
      await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); 1`);
      await pressDesktops();
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
    const c0 = await evalJs(`(() => { const b = document.getElementById('mobile-nav-desktops'); const r = b.getBoundingClientRect(); const nav = document.getElementById('mobile-nav').getBoundingClientRect(); const m = document.getElementById('mobile-nav-overflow'), mr = m && m.getBoundingClientRect(); return { shown: getComputedStyle(b).display !== 'none' && r.width >= 36 && r.height >= 36, inNav: r.top >= nav.top - 0.5 && r.bottom <= nav.bottom + 0.5 && r.right <= 382, folded: b.classList.contains('bar-folded'), more: !!mr && mr.width >= 44 && mr.top >= nav.top - 0.5 && mr.right <= 382, badge: b.querySelector('.mnav-badge')?.textContent || '', toggle: getComputedStyle(document.getElementById('list-column-toggle')).display }; })()`);
    check('⑧ 382 (the cover, compact): the Desktops door on the top bar (≥ 36 px) — or, while the title needs the room, in its «⋯» (lane phone-titlebar-title) — badge «1»; the regular class\'s list ☰ not there', ((c0.shown && c0.inNav) || (c0.folded && c0.more)) && c0.badge === '1' && c0.toggle === 'none', c0);
    await pressDesktops();
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
    await pressDesktops();
    const g2 = await evalJs(GEOM), nav2 = await evalJs(`Math.round(document.getElementById('mobile-nav').getBoundingClientRect().bottom)`);
    await shot('desktops-door-669.png');
    check('⑧ 669 (the inner portrait): the menu under the bar lying over the conversation, inside the conversation column, every row\'s name visible', inside(g2, { col: true }) && g2.t >= nav2, { g2, nav2 });
    await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); 1`);
    // 375×812, a phone (lane desktop-doors-table): the desktop's doors from the sheet — THE table's, and a phone reorders
    await device(375, 812); await settle(375);
    const deskC = await evalJs(`app.desktopManager.createDesktop('Desk C')`); await sleep(500);
    const ORDER = `app.desktopManager.desktops.map((d) => d.id)`;
    const doorsOf = async (id, png) => { await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); 1`); await pressDesktops(); await holdRow(id); const dd = await evalJs(DESK_DOORS); if (png) await shot(png); return dd; };
    const said = (dd) => (dd ? dd.items.map((x) => x.label + (x.off ? ' [' + x.why + ']' : '')).join(' · ') : 'no menu');
    const four = (dd) => !!dd && JSON.stringify(dd.items.map((x) => x.label)) === JSON.stringify(['Rename…', 'Delete', 'Move up', 'Move down']) && dd.inside && dd.items.every((x) => x.h >= 44);
    const mid = await doorsOf(deskB, 'desktop-doors-375-middle.png');
    check(`⑧ 375 (a phone): a middle desktop's long press — the four doors, every one open, 44 px rows inside the viewport (${said(mid)})`, four(mid) && mid.items.every((x) => !x.off), mid);
    const fst = await doorsOf(desk1, 'desktop-doors-375-first.png');
    check(`⑧ 375: the first desktop — Move up greyed WITH its why on the row (never greyed with no words) (${said(fst)})`, four(fst) && fst.items[2].off && fst.items[2].why === 'Already the first desktop' && fst.items[2].whyIn && [0, 1, 3].every((k) => !fst.items[k].off), fst);
    const lst = await doorsOf(deskC, 'desktop-doors-375-last.png');
    check(`⑧ 375: the last desktop — Move down greyed WITH its why (${said(lst)})`, four(lst) && lst.items[3].off && lst.items[3].why === 'Already the last desktop' && lst.items[3].whyIn && [0, 1, 2].every((k) => !lst.items[k].off), lst);
    const up = lst && lst.items[2];
    if (up) await tapAt(up.x, up.y);
    await waitFor(`JSON.stringify(${ORDER}) === ${JSON.stringify(JSON.stringify([desk1, deskC, deskB]))} && !!document.querySelector('.mdesk-menu')`, 4000); await sleep(400);
    const back = await evalJs(`({ order: ${ORDER}, sheet: [...document.querySelectorAll('.mdesk-menu .context-menu-item[data-desktop-id]')].map((r) => r.dataset.desktopId) })`);
    await shot('desktop-doors-375-moved.png');
    check('⑧ 375: the last desktop\'s Move up FROM THE PHONE reorders (a phone had no way to) — and the sheet comes back in the new order', JSON.stringify(back.order) === JSON.stringify([desk1, deskC, deskB]) && JSON.stringify(back.sheet) === JSON.stringify(back.order), back);
    await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); 1`); await sleep(800);
    await load(); await waitFor(`!!window.app && !!app.desktopManager && app.desktopManager.desktops.length === 3`, 10000); await sleep(400);
    const kept = await evalJs(ORDER);
    check('⑧ 375: …a reload keeps the order (the hub stored the phone\'s reorder — the manager\'s own road)', JSON.stringify(kept) === JSON.stringify([desk1, deskC, deskB]), kept);
    // r2 ①: the sheet OPEN, Desk C deleted on ANOTHER client (a raw /ws — what a second screen sends): the sheet redraws, Desk C
    // KEPT at its place greyed WITH the why that names it; its long press opens its doors greyed with that why (8c680dcf: the
    // row stayed a live one, and its long press opened nothing) — and the world is back: [desk 1, Desk B]
    await evalJs(`app.desktopManager.reorderDesktop(${JSON.stringify(deskB)}, ${JSON.stringify(deskC)}); 1`); await sleep(600);
    await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); 1`); await pressDesktops(); await sleep(400);
    const gws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); await new Promise((r, j) => { gws.on('open', r); gws.on('error', j); });
    gws.send(JSON.stringify({ type: 'desktop-delete', desktopId: deskC })); await sleep(300); try { gws.close(); } catch { }
    const goneIn = await waitFor(`app.desktopManager.desktops.length === 2`, 8000); await sleep(500);
    const fl = await evalJs(`[...document.querySelectorAll('.mdesk-menu .context-menu-item[data-desktop-id]')].map((r) => ({ id: r.dataset.desktopId, gone: r.classList.contains('mdesk-gone'), sub: (r.querySelector('.mdesk-titles') || {}).textContent || '', title: r.title, op: +getComputedStyle(r).opacity }))`);
    await shot('desktop-doors-375-gone.png');
    const gC = (fl || []).find((x) => x.id === deskC);
    check(`⑧ 375 (r2 ①): the sheet OPEN, Desk C deleted on ANOTHER client — the sheet redraws: Desk C kept at its place, greyed WITH «“Desk C” is no longer there» (${JSON.stringify(fl)})`, goneIn && !!gC && gC.gone && gC.sub === '“Desk C” is no longer there' && gC.title === gC.sub && gC.op < 1 && JSON.stringify(fl.map((x) => x.id)) === JSON.stringify([desk1, deskB, deskC]) && fl.filter((x) => x.id !== deskC).every((x) => !x.gone), fl);
    await holdRow(deskC);
    const gd = await evalJs(DESK_DOORS);
    await shot('desktop-doors-375-gone-doors.png');
    check(`⑧ 375 (r2 ①): …its long press opens ITS DOORS, every one greyed with the why that names it (${said(gd)})`, four(gd) && gd.items.every((x) => x.off && x.why === '“Desk C” is no longer there' && x.whyIn), gd);
    await evalJs(`document.querySelectorAll('.context-menu').forEach((m) => m.remove()); 1`); await sleep(300);
    // r3 ① THE LISTENER LIFECYCLE (主开发's major on 25151f0b): the window switcher opened and closed five times — by each of
    // its closers — and the sheet five times — by each of its dismissals — with NO remote change; then the page's own
    // `vs-desktops` listeners counted (CDP DOMDebugger.getEventListeners on window — the real list, nothing patched): none
    // left (25151f0b: one per closed switcher, each holding its detached list, and the last dismissed sheet's)
    const vsCount = async () => { const w = await cdp('Runtime.evaluate', { expression: 'window' }); try { return (await cdp('DOMDebugger.getEventListeners', { objectId: w.result.objectId })).listeners.filter((l) => l.type === 'vs-desktops').length; } finally { cdp('Runtime.releaseObject', { objectId: w.result.objectId }).catch(() => { }); } };
    const OUT = (sel) => `(() => { const p = document.querySelector(${JSON.stringify(sel)}); const b = p ? p.getBoundingClientRect().bottom : 60; const c = document.querySelector('.window.window-active .chat-input'); const top = c ? c.getBoundingClientRect().top : innerHeight - 60; return { x: Math.round(innerWidth / 2), y: Math.round(Math.min(b + 40, (b + top) / 2)) }; })()`;
    const outside = async (sel) => { const p = await evalJs(OUT(sel)); await tapAt(p.x, p.y); await sleep(300); };
    const escKey = async () => { await evalJs(`(document.activeElement && document.activeElement !== document.body && document.activeElement.blur(), 1)`); for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(300); };
    const isOpen = (sel) => evalJs(`!!document.querySelector(${JSON.stringify(sel)})`);
    const SW = '.mobile-win-switcher', SH = '.mdesk-menu';
    // the window on show is put back after (a row's tap reveals its window — the legs after this one load with the layout it leaves)
    const winBefore = await evalJs('app.wm.activeWindowId');
    const ownRow = async () => { const p = await evalJs(`(() => { const w = app.wm.windows.get(app.wm.activeWindowId); const r = [...document.querySelectorAll('.mobile-win-switcher .mobile-win-row')].find((x) => w && x.textContent.includes(w.title)) || document.querySelector('.mobile-win-switcher .mobile-win-row'); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.left + Math.min(80, b.width / 3), y: b.top + b.height / 2 }; })()`); if (p) { await tapAt(p.x, p.y); await sleep(300); } };
    const v0 = await vsCount(), swRuns = [], shRuns = [];
    for (const [how, shut] of [['the title again', () => tap('#mobile-nav-title')], ['an outside tap', () => outside(SW)], ['the row of the window on show', ownRow], ['the title again', () => tap('#mobile-nav-title')], ['an outside tap', () => outside(SW)]]) {
      await tap('#mobile-nav-title'); const opened = await isOpen(SW), live = (await vsCount()) - v0;
      await shut(); await sleep(200);
      swRuns.push({ how, opened, live, closed: !(await isOpen(SW)) });
    }
    const v1 = await vsCount();
    for (const [how, shut] of [['an outside tap', () => outside(SH)], ['Esc', escKey], ['the row of the desktop on show', async () => tap(`.mdesk-menu .context-menu-item[data-desktop-id="${await evalJs('app.desktopManager.activeDesktopId')}"]`)], ['its button again (it opens anew — then an outside tap)', async () => { await pressDesktops(); await outside(SH); }], ['an outside tap', () => outside(SH)]]) {
      await pressDesktops(); const opened = await isOpen(SH), live = (await vsCount()) - v1;
      await shut(); await sleep(200);
      shRuns.push({ how, opened, live, closed: !(await isOpen(SH)) });
    }
    const v2 = await vsCount();
    const leak = { before: v0, switcher: v1 - v0, sheet: v2 - v1, swRuns, shRuns };
    if ((await evalJs('app.wm.activeWindowId')) !== winBefore) { await evalJs(`(app.wm.revealWindow(${JSON.stringify(winBefore)}), 1)`); await sleep(800); }
    check(`⑧ 375 (r3 ①): the window switcher opened and closed 5× — its title again, an outside tap, a window's row — each open holding ONE vs-desktops listener; after the closes the page holds ${leak.switcher} more (25151f0b: one per closed switcher, each with its detached list)`, swRuns.every((x) => x.opened && x.closed && x.live === 1) && leak.switcher === 0, leak);
    check(`⑧ 375 (r3 ①): …the sheet opened and dismissed 5× — an outside tap, Esc, a row's tap, its button again — each open holding ONE; after them ${leak.sheet} more (25151f0b: the last dismissed sheet's)`, shRuns.every((x) => x.opened && x.closed && x.live === 1) && leak.sheet === 0, leak);
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
      if (id === 'mobile-nav-overflow' && await evalJs(`!!document.querySelector('.mnav-more-menu .context-menu-item[data-key="desktops"]')`)) { await tap('.mnav-more-menu .context-menu-item[data-key="desktops"]'); } // lane phone-titlebar-title: the folded Desktops door
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
    check('⑨ …at 382 (the compact class): the top bar\'s Desktops (standing, or its «⋯» while the title needs the room — lane phone-titlebar-title) + its title', !c382.taskbar && (c382.doors.includes('mobile-nav-desktops') || c382.doors.includes('mobile-nav-overflow')) && c382.doors.includes('mobile-nav-title'), c382);
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
