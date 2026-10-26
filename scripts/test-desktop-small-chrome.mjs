#!/usr/bin/env node
// THE DESKTOP TIER AT A SMALL MOUSE VIEWPORT (lane desktop-small, 2026-10-25 — the owner: «桌面档应该测试屏幕尺寸比较小的时候什么
// 地方不可用来修复一下» and «userW有一大堆桌面，屏幕尺寸小了之后桌面就堆积在一起了»; the naive-user walk's report, four mouse viewports
// 951×585 / 1024×600 / 1100×700 / 1280×640, P2-1…P2-6 + P3-1…P3-3 and its twelve suggested fences). A throwaway server in a git
// worktree (this tree's src/ + built public/), a stub `claude` behind the real chat-wrapper (three chat conversations, one turn
// each — a reply with a code block), headless Chrome over raw CDP as a MOUSE desktop (fine pointer, hover) at each viewport,
// the sidebar open (the walk's state). Every leg drives the real client the way a person does (CDP mouse presses, drags, the
// wheel, keys); the page is only READ by script, except the two set-ups named where they happen (a buried window = what an
// old layout or another client's screen leaves; a float with no closer of its own).
//   ① THE RELEASE NEVER BURIES A WINDOW (P2-1): the Quad preset, a title bar dragged onto the taskbar and released there; the
//      freeform desk with the drag snap off, released past the bottom, over the sidebar and over the toolbar — after every
//      release the title bar keeps ≥ 80×32 inside #workspace; then the sidebar collapsed / opened and the viewport shrunk /
//      grown — every window's title bar still ≥ 80×32 inside
//   ② THE RECOVERY LOOP (P2-1): a window whose rect is outside the workspace — its taskbar tile, then its window-list row —
//      ends with its rect ⊆ #workspace (not only raised)
//   ③ MENUS INSIDE THE SCREEN (P2-3): the title-bar menu of a lower-row chat window (Quad), the model dropdown of a lower-row
//      cell, the Desktop popover, the window list — each rect ⊆ the viewport (a taller one capped and scrolling), the title
//      menu's first row at y ≥ 0
//   ④ THE TOOLBAR: scrollWidth ≤ clientWidth, every button inside, the brand whole or not drawn (P3-2) — sidebar open and folded
//   ⑤ THE RAIL: its last item's bottom ≤ the viewport, #sidebar not scrolling as a whole
//   ⑥ THE TASKBAR (P2-2 + the owner's desktops): 15 windows — tiles ≥ 90 px, every whole tile's centre hits itself, the cut
//      ones are counted on a visible «+N» chip whose list is exactly them (a row raises its window), the wheel's deltaY
//      scrolls the strip; 8 desktops — the switcher is ONE «Desktop k/N» button whose list switches and adds
//   ⑦ THE CHAT WINDOW (P2-4 / P2-5): narrower than 480 px — the status bar ONE row ≤ 28 px (⋯ opens the rest); under 300 px
//      high — the message list ≥ 45 % of the window; the Open in editor / Fork buttons never over a message's words
//   ⑧ THE 24 px MOUSE TARGET (P2-6): every visible clickable (buttons, role=button, status chips, tiles, previews, a toast's
//      ✕, a dialog's ✕) ≥ 24×24 or inside a ≥ 24×24 clickable — exceptions NAMED — and the window buttons ≥ 4 px apart
//   ⑨ THE TOAST: shown while the desktop list (a menu over the taskbar) is open — never over the menu or a composer; the
//      menu's rows still take their press
//   ⑩ THE DESKTOP POPOVER (P3-1): its note is a whole sentence (ends with a period); a press into a Web view's frame closes it;
//      Escape pressed while a same-origin frame holds the keyboard closes every [data-popover] float
//   ⑪ THE CASCADE (the walk's unverified claim, re-measured): three windows opened on an empty desktop keep ≥ 80 % of each
//      title bar visible
//   ⑫ zero page errors at every viewport; P3-3: the Settings nav stays at the top of its column with the content scrolled to
//      its end, and the window's foot (the save rule) shows
//   ⑬ THE DESKTOP'S DOORS IN THE COMPACT FORM (acceptance r2 ①, 951×585, 8 desktops): a row's right-click → Rename… ⇒ the
//      new name on the row (the list comes back) and on the button; a row's ⋯ → Delete ⇒ N−1; a title-bar drag held on the
//      button springs its list open and, released on a row, lands the window on that desktop — reachable there; a row's
//      Move down ⇒ the order on ANOTHER client (a second page of the same hub, layout-sync) follows
//   ⑭ THE «+N» LIST'S TAIL (r2 ②): 26 windows at 951×585 — the list inside the viewport, capped and scrolling; the wheel
//      brings its last row in and that row takes the click
//   ⑮ THE RESIZE'S RELEASE (r2 ③): a north edge dragged past the workspace's top ⇒ ≥ 32 px of the title bar stays inside
//   ⑯ THE SPRING ON THE REAL HTML5 ROAD (acceptance r3 ①, 951×585, 8 desktops): a taskbar tile dragged by Chrome's OWN drag
//      (CDP drag interception — Input.setInterceptDrags + dispatchDragEvent): ~100 ms across the button then Esc, or dropped
//      back on the strip ⇒ no list ever, no timer; held ≥ 350 ms ⇒ the list springs, and off it it closes, dropped away ⇒
//      closed with no timer, no ref, no listener; Esc ⇒ the same; dropped on a row ⇒ the window there, the list and its ref gone
//   ⑰ A STALE ROW (r3 ③): the list sprung by a held drag, that row's desktop deleted on ANOTHER client (a second page of the
//      hub), the drag released on the row — the title-bar road and the tile road: refused BY NAME (a toast), the window stays
//      on this desktop, on show and reachable
//   ⑱ A CANCELLED Rename… (r3 ④): a row's right-click → Rename… → Cancel ⇒ nothing comes back (no list, no menu, no dialog)
//   RED CONTROL r3 — a third esbuild bundle of THIS tree with round 2's rules put back (no dragleave, no tile dragend, no
//   document listeners, the row drop keeps the ref; no existence check; Rename… always reopens): ⑯ ⑰ ⑱ go RED there.
//   RED CONTROL r2 — a second esbuild bundle of THIS tree with the round-1 rules put back (a row with no doors, no ⋯, no
//   drop, nothing springs; the self-placed «+N» list; no resize release) at 951×585: ⑬ ⑭ ⑮ go RED there.
//   RED CONTROL — one esbuild bundle of THIS tree with the base's rules put back (no nearest cell, no release clamp, no
//   recovery; no «+N» / wheel / compact switcher and the 60 px tile floor; the bottom-anchored title menu; no narrow fold
//   and no short composer), served through the Fetch domain with the matching style.css / chat.css at 1024×600: P2-1, P2-2,
//   P2-3 and P2-4 go RED there; the real bundle back, the same legs pass (the fix, not the reload).
// Requires google-chrome (SKIP without) and a fresh `npm run build`. Run: node scripts/test-desktop-small-chrome.mjs
// [--only 1024x600] [--shots DIR]
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
const argOf = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const VIEWPORTS = [[951, 585], [1024, 600], [1100, 700], [1280, 640]].filter(([w, h]) => !argOf('--only') || argOf('--only').split(',').includes(`${w}x${h}`));

const [PORT, CDP_PORT] = await freePorts(2);
const wt = scratch('desk-small-wt');
const fakeHome = scratchHome('desk-small-home', fs);
const chromeDir = scratch('desk-small-chrome');
const stubDir = scratch('desk-small-stub');
const MUT = scratch('desk-small-mut');
const CWD = path.join(stubDir, 'work');
const SHOTS = argOf('--shots') ? path.resolve(argOf('--shots')) : scratch('desk-small-shots');
for (const d of [stubDir, CWD, SHOTS]) fs.mkdirSync(d, { recursive: true });
for (let i = 0; i < 4; i++) fs.writeFileSync(path.join(CWD, `notes-${i}.md`), '# notes\n');
const ORIGIN = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1200) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the stub CLI: one assistant turn per user line — a reply that wraps at every width, with a code block ──
fs.writeFileSync(path.join(stubDir, 'claude'), `#!${process.execPath}
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.308 (Claude Code) stub'); process.exit(0); }
const SID = 'dsmall-' + process.pid;
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', session_id: SID, model: 'claude-fable-5-1', cwd: process.cwd(), tools: ['Read'], permissionMode: 'default', claude_code_version: '2.1.308' });
let n = 0, buf = '';
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); let m = null; try { m = JSON.parse(line); } catch {} if (!m || m.type !== 'user') continue; const k = n++;
  setTimeout(() => {
    out({ type: 'assistant', session_id: SID, uuid: 'a-' + k, message: { id: 'm' + k, type: 'message', role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'The retry waits two seconds and gives up after three tries today; I will change it to back off 1→2→4→8→16 seconds and mark the order for a person after the fifth try — tests 7/7 pass.\\n\\n\\u0060\\u0060\\u0060js\\nconst delays = [1, 2, 4, 8, 16];\\n\\u0060\\u0060\\u0060\\n\\nShall I add the tests too?' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 40 } } });
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 300, num_turns: 1, result: 'done', session_id: SID, total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 40 } });
  }, 150); } });
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });

// ── the RED CONTROL: this source with the base's rules put back, one esbuild; the base's CSS lines in style.css / chat.css ──
const MUTANT = {};
{
  fs.mkdirSync(MUT, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT, 'node_modules'));
  const sub = (rel, from, to) => { const f = path.join(MUT, rel); const s = fs.readFileSync(f, 'utf8'); if (s.split(from).length !== 2) throw new Error(`mutant anchor ${rel}: ${from.slice(0, 70)}`); fs.writeFileSync(f, s.replace(from, to)); };
  // P2-1: no nearest cell, no release clamp, no recovery (the tile minimizes a buried window as before)
  sub('src/lib/window.js', '    if (idx < 0 && this.grid) { const p = releasePoint({ x: cx, y: cy }, this.workspace.getBoundingClientRect()); idx = this._getGridCell(p.x, p.y); }\n', '');
  sub('src/lib/window.js', '      this._keepReachable(win); // EVERY release keeps 80×32', '      // this._keepReachable(win); // EVERY release keeps 80×32');
  sub('src/lib/window.js', '    this._bringBack?.(host); // a named window', '    // this._bringBack(host); // a named window');
  sub('src/lib/taskbar.js', 'app.wm.isReachable?.(id) !== false', 'true');
  // P2-2: no «+N», no wheel, no compact switcher
  sub('src/lib/taskbar.js', '  fitTaskbarStrip(app);\n}', '}');
  sub('src/lib/desktop-manager.js', "    if (form === 'compact') { this._renderCompactSwitcher(container); return; }\n", '');
  // P2-3: the base's bottom anchor (no top clamp)
  sub('src/lib/taskbar.js', "  return showContextMenu(x, y, menuItems, 'taskbar-context-menu', { up: y > window.innerHeight / 2 });", "  const menu = showContextMenu(x, y, menuItems, 'taskbar-context-menu');\n  if (y > window.innerHeight / 2) { menu.style.top = ''; menu.style.bottom = (window.innerHeight - y + 4) + 'px'; }\n  return menu;");
  // P2-4: the desk bar wraps (no narrow one-row fold)
  sub('src/lib/chat-status-bar.js', '  _oneRow() {\n    if (PHONE_MQ?.matches) return true;', '  _oneRow() {\n    if (true) return !!PHONE_MQ?.matches;');
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT });
  MUTANT.bundle = fs.readFileSync(path.join(MUT, 'bundle-mut.js'));
  const css = (rel, pairs) => { let s = fs.readFileSync(path.join(repo, rel), 'utf8'); for (const [from, to] of pairs) { if (s.split(from).length !== 2) throw new Error(`mutant css anchor ${rel}: ${from.slice(0, 70)}`); s = s.replace(from, to); } return Buffer.from(s); };
  MUTANT.style = css('public/style.css', [['max-width: 200px; min-width: 90px; overflow: hidden;', 'max-width: 200px; min-width: 60px; overflow: hidden;']]);
  MUTANT.chat = css('public/chat.css', [['.chat-view.chat-short .chat-input-area {', '.chat-view.chat-short-OFF .chat-input-area {'], ['.chat-view.chat-short .chat-input {', '.chat-view.chat-short-OFF .chat-input {']]);
}

// ── the RED CONTROL r2: this source with the round-1 rules put back (acceptance r2 ①②③ undone), one esbuild ──
const MUT2 = scratch('desk-small-mut2');
const MUTANT2 = {};
{
  fs.mkdirSync(MUT2, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT2}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT2, 'node_modules'));
  const sub = (rel, from, to) => { const f = path.join(MUT2, rel); const s = fs.readFileSync(f, 'utf8'); if (s.split(from).length !== 2) throw new Error(`mutant r2 anchor ${rel}: ${from.slice(0, 70)}`); fs.writeFileSync(f, s.replace(from, to)); };
  // ① a row is a plain row (no doors, no ⋯, no drop); the drag hit-tests the previews only and nothing springs
  sub('src/lib/desktop-manager.js', "    rows.forEach((row, k) => { if (row.kind === 'desktop' && els[k]) this._rowDoors(els[k], row.desk); });", "    rows.forEach((row, k) => { if (row.kind === 'desktop' && els[k]) els[k].dataset.desktopId = row.id; });");
  sub('src/lib/desktop-manager.js', "${r.kind === 'desktop' ? more : ''}`;", "`;");
  sub('src/lib/window.js', "      let hoverPreview = under?.closest('.desktop-preview, .desktop-switch-row');", "      let hoverPreview = under?.closest('.desktop-preview');");
  sub('src/lib/window.js', '      this._app?.desktopManager?.dragHover?.(under);', '      // nothing springs');
  // ② the «+N» list self-placed, no cap
  sub('src/lib/taskbar.js', "    const room = up ? r.top - 2 : window.innerHeight - r.bottom - 2;\n    const at = menuPlace({ x: r.right - pr.width, y: up ? room : 0, w: pr.width, h: pr.height, vw: window.innerWidth, vh: room, up });\n    if (at.maxH != null) { pop.style.maxHeight = (at.maxH / Z) + 'px'; pop.style.overflowY = 'auto'; }\n    pop.style.left = (at.left / Z) + 'px';\n    pop.style.top = ((up ? at.top : r.bottom + 2 + at.top) / Z) + 'px';",
    "    const above = r.top - pr.height - 4;\n    pop.style.left = (Math.max(4, Math.min(r.right - pr.width, window.innerWidth - pr.width - 4)) / Z) + 'px';\n    pop.style.top = ((above >= 4 ? above : r.bottom + 4) / Z) + 'px';");
  // ③ no resize release
  sub('src/lib/window.js', '          if (resized) this._keepReachable(win, dir);', '          // no resize release');
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT2 });
  MUTANT2.bundle = fs.readFileSync(path.join(MUT2, 'bundle-mut.js'));
}

// ── the RED CONTROL r3: this source with round 2's rules put back (acceptance r3 ①③④ undone), one esbuild ──
const MUT3 = scratch('desk-small-mut3');
const MUTANT3 = {};
{
  fs.mkdirSync(MUT3, { recursive: true });
  execSync(`cp -r ${repo}/src ${MUT3}/src`);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(MUT3, 'node_modules'));
  const sub = (rel, from, to) => { const f = path.join(MUT3, rel); const s = fs.readFileSync(f, 'utf8'); if (s.split(from).length !== 2) throw new Error(`mutant r3 anchor ${rel}: ${from.slice(0, 70)}`); fs.writeFileSync(f, s.replace(from, to)); };
  const DM = 'src/lib/desktop-manager.js';
  // ① the HTML5 road never ends the spring: no dragleave on the button, no dragend on a tile, no document listeners; the
  //   row drop removes the list but keeps its ref; a list closed by its own door keeps its ref
  sub(DM, "    btn.addEventListener('dragleave', () => this._springStop());", '    // no dragleave');
  sub(DM, "    for (const type of ['dragenter', 'dragover']) window.addEventListener(type, (e) => this.dragHover(e.target), o);\n    window.addEventListener('drop', () => setTimeout(() => this.dragDone(), 0), o);\n    window.addEventListener('dragend', () => this.dragDone(), o);\n", '    void o;\n');
  sub(DM, '      this.dragDone(); list?.remove();', '      list?.remove();');
  sub(DM, '    if (this._springList && !this._springList.isConnected) this._springList = null;', '    // the closed list keeps its ref');
  sub(DM, '    if (btn && !this._springList) {', '    if (btn && !this._springList?.isConnected) {');
  sub('src/lib/taskbar.js', "\n    item.addEventListener('dragend', () => app.desktopManager?.dragDone?.());", '\n    // no dragend');
  sub('src/lib/taskbar.js', "\n  item.addEventListener('dragend', () => app.desktopManager?.dragDone?.());", '\n  // no dragend');
  // ③ no existence check: a stale row moves the window under a gone desktop's id
  sub(DM, '    if (!this._desktops.some((d) => d.id === deskId)) {', '    if (false) {');
  // ④ every act brings the list back, a cancelled Rename… too
  sub(DM, 'Promise.resolve(p).then((r) => { if (r !== false) after?.(); });', 'Promise.resolve(p).then(() => after?.());');
  execSync(`${path.join(repo, 'node_modules/.bin/esbuild')} src/client.js --bundle --outfile=bundle-mut.js --format=iife --platform=browser --target=es2020 --loader:.css=css --log-level=error`, { cwd: MUT3 });
  MUTANT3.bundle = fs.readFileSync(path.join(MUT3, 'bundle-mut.js'));
}

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
  for (const d of [chromeDir, fakeHome, stubDir, MUT, MUT2, MUT3]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const PENDS = new Map();
armWatchdog({ capMs: 840e3, exit: (code) => process.exit(code), pending: () => [...PENDS.values()].map((x) => `CDP ${x.method} (${((Date.now() - x.at) / 1000).toFixed(1)} s)`) });
for (let i = 0; i < 120; i++) { try { await fetch(`${ORIGIN}/api/home`); break; } catch { await sleep(250); } }

// ── raw CDP (+ the RED control's bundle / stylesheets through the Fetch domain) ──
const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 120 && !target; i++) {
  try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((x) => x.type === 'page'); } catch { }
  if (!target) await sleep(250);
}
if (!target) { console.log('✗ chrome never exposed a CDP page target'); process.exit(1); }
const sock = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => sock.on('open', r));
let seq = 0; let mutantOn = null; const pend = new Map(); const pageErrors = []; let dragData = null;
const fulfil = (p, body, type) => sock.send(JSON.stringify({ id: ++seq, method: 'Fetch.fulfillRequest', params: { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }], body: body.toString('base64') } }));
sock.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); PENDS.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'unknown');
  if (m.method === 'Input.dragIntercepted') dragData = m.params.data; // ⑯: Chrome's own drag, intercepted (its data carries text/window-id)
  if (m.method === 'Fetch.requestPaused') {
    const p = m.params, u = new URL(p.request.url);
    const M = mutantOn; // null = the real files; MUTANT (the base's rules), MUTANT2 (round 1's) or MUTANT3 (round 2's) — the last two with the real CSS
    if (M && u.pathname === '/bundle.js') fulfil(p, M.bundle, 'application/javascript');
    else if (M && M.style && u.pathname === '/style.css') fulfil(p, M.style, 'text/css');
    else if (M && M.chat && u.pathname === '/chat.css') fulfil(p, M.chat, 'text/css');
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
const J = JSON.stringify;
const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await evalJs(expr)) return true; } catch { } await sleep(150); } try { return await evalJs(expr); } catch { return false; } };
const shot = async (name) => { try { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.data, 'base64')); } catch { } };
await cdp('Runtime.enable'); await cdp('Page.enable');
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*bundle.js*', requestStage: 'Request' }, { urlPattern: '*style.css*', requestStage: 'Request' }, { urlPattern: '*chat.css*', requestStage: 'Request' }] });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47: a returning user — no first-run wizard

// ── the mouse ──
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
const hover = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none', buttons: 0 });
const click = async (p) => { await hover(p.x, p.y); await mouse('mousePressed', p.x, p.y); await sleep(40); await mouse('mouseReleased', p.x, p.y); await sleep(250); };
const rclick = async (p) => { await hover(p.x, p.y); await mouse('mousePressed', p.x, p.y, { button: 'right', buttons: 2 }); await sleep(40); await mouse('mouseReleased', p.x, p.y, { button: 'right', buttons: 0 }); await sleep(350); };
const dragTo = async (a, b, steps = 18) => {
  await hover(a.x, a.y); await mouse('mousePressed', a.x, a.y); await sleep(60);
  for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps); await sleep(25); }
  await sleep(120); await mouse('mouseReleased', b.x, b.y); await sleep(450);
};
const key = async (k, code, vk) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); await sleep(200); };
const esc = () => key('Escape', 'Escape', 27);
const centre = (sel, idx = 0) => evalJs(`(() => { const e = document.querySelectorAll(${J(sel)})[${idx}]; if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);

// ── the page ──
const device = async (w, h) => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'hover' }, { name: 'pointer', value: 'fine' }] });
};
const load = async (w, h) => {
  await device(w, h);
  await cdp('Page.navigate', { url: ORIGIN + '/' });
  await waitFor('!!(window.app && app.ready)', 30000); await evalJs('app.ready.then(() => true)');
  await waitFor(`!document.getElementById('loading-screen')`, 15000); await sleep(900);
};
const sessions = await (async () => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const frames = [];
  await new Promise((r) => ws.on('open', r)); ws.on('message', (d) => { try { frames.push(JSON.parse(String(d))); } catch { } });
  const ids = [];
  for (const k of [0, 1, 2]) {
    ws.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId: 'dsm' + k }));
    let sid = null; for (let i = 0; i < 100 && !sid; i++) { const f = frames.find((m) => m?.type === 'created' && m.reqId === 'dsm' + k); if (f) sid = f.sessionId; else await sleep(150); }
    if (sid) { ids.push(sid); await sleep(500); ws.send(JSON.stringify({ type: 'chat-input', sessionId: sid, text: 'Make the refund retry back off exponentially, five tries at most' })); await sleep(900); }
  }
  ws.close(); return ids;
})();
if (sessions.length < 3) { console.log(`✗ three stub conversations wanted, ${sessions.length} created`); process.exit(1); }
const closeAll = () => evalJs(`(() => { document.querySelectorAll('[data-popover], .context-menu').forEach((p) => p.remove()); for (const id of [...app.wm.windows.keys()]) { try { app.wm.closeWindow(id); } catch {} } document.querySelectorAll('#global-toasts').forEach((t) => t.remove()); return app.wm.windows.size; })()`);
const attach = async (k) => { await evalJs(`(() => { app.attachSession(${J(sessions[k])}, 'Refund retry ' + ${k}, ${J(CWD)}, { mode: 'chat', backend: 'claude' }); return 1; })()`); await sleep(350); };
const chatWins = () => evalJs(`[...app.wm.windows.values()].filter((w) => w.type === 'chat' && !w.isMinimized && !w._hiddenByDesktop).map((w) => w.id)`);
const layout = async (name) => { await evalJs(`app.wm.applyLayout(${J(name)})`); await sleep(650); };
const openFiles = async (n) => { await evalJs(`(() => { for (let i = 0; i < ${n}; i++) app.openFileExplorer(${J(CWD)}); return 1; })()`); await sleep(300 + n * 60); };
/** a window's box, its title bar's part inside #workspace, whether its rect ⊆ #workspace */
const BOX = (id) => `(() => { const w = app.wm.windows.get(${J(id)}); if (!w) return null; const r = w.element.getBoundingClientRect(), tb = w.titleBar.getBoundingClientRect(), ws = document.getElementById('workspace').getBoundingClientRect();
  const ix = Math.max(0, Math.min(tb.right, ws.right) - Math.max(tb.left, ws.left)), iy = Math.max(0, Math.min(tb.bottom, ws.bottom) - Math.max(tb.top, ws.top));
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bar: [Math.round(ix), Math.round(iy)], inside: r.left >= ws.left - 0.5 && r.top >= ws.top - 0.5 && r.right <= ws.right + 0.5 && r.bottom <= ws.bottom + 0.5, min: !!w.isMinimized, active: app.wm.activeWindowId === w.id }; })()`;
const reachableBar = (b) => !!b && b.bar[0] >= 80 - 0.5 && b.bar[1] >= 32 - 0.5;
const WS = `(() => { const r = document.getElementById('workspace').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; })()`;
const titleGrip = (id) => evalJs(`(() => { const r = app.wm.windows.get(${J(id)}).titleBar.getBoundingClientRect(); return { x: r.left + Math.min(60, r.width / 3), y: r.top + r.height / 2 }; })()`);
const ALL_BARS = `(() => [...app.wm.windows.values()].filter((w) => !w.isMinimized && !w._hiddenByDesktop && !(w._tabChain && w._tabChain.tabs[0] !== w.id)).map((w) => { const tb = w.titleBar.getBoundingClientRect(), ws = document.getElementById('workspace').getBoundingClientRect(); return { id: w.id, bar: [Math.round(Math.max(0, Math.min(tb.right, ws.right) - Math.max(tb.left, ws.left))), Math.round(Math.max(0, Math.min(tb.bottom, ws.bottom) - Math.max(tb.top, ws.top)))] }; }))()`;
/** a rect inside the viewport, and a taller-than-the-viewport one capped + scrolling */
const INVIEW = (sel) => `(() => { const e = [...document.querySelectorAll(${J(sel)})].filter((x) => x.getBoundingClientRect().width > 0).pop(); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], inside: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, scrolls: e.scrollHeight <= e.clientHeight + 1 || /auto|scroll/.test(cs.overflowY) }; })()`;

/** ⑧ the census: visible clickables under 24×24 with no ≥ 24×24 clickable ancestor (EXCEPTIONS named, with the reason) */
const HIT_EXCEPTIONS = {
  '.session-inline-btn': "the session row's Star / Archive: a 14 px column by the owner's own density call (2.224.0 — two side-by-side buttons cost ~44 px of every row); the row's right-click menu carries both at full size (session.toggleStar / session.toggleArchive)",
};
const HITS = `(() => { const out = [], seen = new Set(); const EXC = ${J(Object.keys(HIT_EXCEPTIONS))};
  const clickable = (e) => { const cs = getComputedStyle(e); return cs.cursor === 'pointer' && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none'; };
  for (const e of document.querySelectorAll('button, [role=button], .chat-status-clickable, .taskbar-item, .desktop-preview, .desktop-preview-add, .win-btn, .global-toast-x, .dialog-close')) {
    if (!clickable(e) || e.disabled) continue; const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!hit || (hit !== e && !e.contains(hit) && !hit.contains(e))) continue; // covered: not a target now
    if (r.width >= 24 - 0.5 && r.height >= 24 - 0.5) continue; if (EXC.some((s) => e.matches(s))) continue;
    let a = e.parentElement, ok = false; while (a && a !== document.body) { const ar = a.getBoundingClientRect(); if ((a.tagName === 'BUTTON' || a.getAttribute('role') === 'button' || a.classList.contains('taskbar-item')) && clickable(a) && ar.width >= 24 && ar.height >= 24) { ok = true; break; } a = a.parentElement; }
    if (ok) continue; const k = (e.id ? '#' + e.id : e.tagName.toLowerCase()) + '.' + String(e.className && e.className.baseVal === undefined ? e.className : '').split(' ').filter(Boolean).slice(0, 2).join('.') + ' ' + Math.round(r.width) + '×' + Math.round(r.height); if (seen.has(k)) continue; seen.add(k); out.push(k); }
  return out; })()`;
const WIN_BTN_GAPS = `(() => [...document.querySelectorAll('.window .window-controls')].filter((c) => c.getBoundingClientRect().width > 0).flatMap((c) => { const bs = [...c.children].filter((b) => b.getBoundingClientRect().width > 0); return bs.slice(1).map((b, i) => Math.round(b.getBoundingClientRect().left - bs[i].getBoundingClientRect().right)); }))()`;

/** ⑦ the words of a message under its hover buttons: every text line box of the top window's messages vs the buttons */
const BTN_OVER_TEXT = `(() => { const win = [...document.querySelectorAll('.window')].filter((w) => w.querySelector('.chat-message-list')).sort((a, b) => (+b.style.zIndex || 0) - (+a.style.zIndex || 0))[0]; if (!win) return null; const bad = []; let n = 0;
  for (const m of win.querySelectorAll('.chat-msg')) { const btns = [...m.querySelectorAll(':scope > .chat-open-editor-btn')].map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0); if (!btns.length) continue; n++;
    const text = m.querySelector('.chat-text'); if (!text) continue; const tw = document.createTreeWalker(text, NodeFilter.SHOW_TEXT); let node;
    while ((node = tw.nextNode())) { if (!node.data.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(node);
      for (const lr of rg.getClientRects()) { if (lr.width < 1) continue; for (const br of btns) { if (lr.left < br.right - 0.5 && lr.right > br.left + 0.5 && lr.top < br.bottom - 0.5 && lr.bottom > br.top + 0.5) { bad.push([Math.round(lr.left), Math.round(lr.top), Math.round(lr.right), Math.round(br.left), node.data.slice(0, 16)]); break; } } } } }
  return { messages: n, bad: bad.slice(0, 6) }; })()`;

const STRIP = `(() => { const s = document.getElementById('taskbar-items'); const sr = s.getBoundingClientRect(); const tiles = [...s.querySelectorAll(':scope > .taskbar-item')];
  const rows = tiles.map((t) => { const r = t.getBoundingClientRect(); const whole = r.left >= sr.left - 0.5 && r.right <= sr.right + 0.5; const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { id: t.dataset.winId, w: Math.round(r.width), whole, hits: !!h && t.contains(h) }; });
  const chip = document.getElementById('taskbar-overflow'); const cr = chip && !chip.hidden ? chip.getBoundingClientRect() : null;
  return { n: tiles.length, scroll: [s.scrollLeft, s.scrollWidth, s.clientWidth], rows, chip: cr ? { text: chip.textContent, w: Math.round(cr.width), h: Math.round(cr.height), hit: (() => { const h = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2); return !!h && chip.contains(h); })() } : null,
    compact: (() => { const b = document.querySelector('.desktop-switch-compact'); return b ? [...b.querySelectorAll('span')].map((x) => x.textContent.trim()).filter(Boolean).join(' ') : null; })(), previews: document.querySelectorAll('#desktop-previews .desktop-preview').length }; })()`;

// ═════════════════════════════════════════ the four viewports ═════════════════════════════════════════
/** the legs RED in the control, shared by both runs (`red` = the mutant: the verdicts are inverted) */
const legDragOverTaskbar = async (tag) => {
  await closeAll(); await attach(0); await attach(1); await attach(2);
  await waitFor(`document.querySelectorAll('.window .chat-message-list > .chat-msg-assistant').length >= 3`, 15000);
  await layout('quad');
  const id = await evalJs('app.wm.activeWindowId');
  const ws = await evalJs(WS);
  const a = await titleGrip(id);
  await dragTo(a, { x: a.x + 40, y: ws.b + 14 });
  const after = await evalJs(BOX(id));
  await shot(`${tag}-p21-release-over-taskbar.png`);
  // the buried window's tile, clicked twice (the walk: minimized, then restored to the same buried place)
  const tile = await centre(`.taskbar-item[data-win-id="${id}"]`);
  if (tile) { await click(tile); await sleep(300); await click(tile); await sleep(300); }
  const afterTiles = await evalJs(BOX(id));
  return { id, ws, after, afterTiles };
};
const legTaskbar = async () => {
  await closeAll(); await attach(0); await attach(1); await openFiles(13);
  await evalJs(`(() => { const dm = app.desktopManager; while (dm.desktops.length > 1) dm.deleteDesktop(dm.desktops[dm.desktops.length - 1].id); return dm.desktops.length; })()`).catch(() => 0);
  await sleep(600);
  const s0 = await evalJs(STRIP);
  const sp = await centre('#taskbar-items');
  await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: sp.x, y: sp.y, deltaX: 0, deltaY: 120 }); await sleep(350);
  const s1 = await evalJs(STRIP);
  await evalJs(`(() => { const dm = app.desktopManager; while (dm.desktops.length < 8) dm.createDesktop(); return dm.desktops.length; })()`); await sleep(700);
  const s8 = await evalJs(STRIP);
  return { s0, s1, s8 };
};
const legTitleMenu = async () => {
  await closeAll(); await attach(0); await attach(1); await attach(2);
  await waitFor(`document.querySelectorAll('.window .chat-message-list > .chat-msg-assistant').length >= 3`, 15000);
  await layout('quad');
  const at = await evalJs(`(() => { const ws = [...app.wm.windows.values()].filter((w) => w.type === 'chat' && !w.isMinimized).map((w) => w.titleBar.getBoundingClientRect()).sort((a, b) => b.top - a.top); const r = ws[0]; return r ? { x: r.left + 80, y: r.top + r.height / 2 } : null; })()`);
  await rclick(at);
  const m = await evalJs(`(() => { const m = document.querySelector('.taskbar-context-menu'); if (!m) return null; const r = m.getBoundingClientRect(); const rows = [...m.querySelectorAll(':scope > .taskbar-context-menu-item')]; const first = rows[0] && rows[0].getBoundingClientRect(); const move = rows.find((x) => /Move/.test(x.textContent)); const mr = move && move.getBoundingClientRect(); const hit = mr && document.elementFromPoint(mr.left + 20, mr.top + mr.height / 2);
    return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], firstTop: first ? Math.round(first.top) : null, inside: r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.left >= -0.5 && r.right <= innerWidth + 0.5, moveHit: !!hit && !!move && move.contains(hit) }; })()`);
  await esc();
  return { at, m };
};
const legNarrowChat = async () => {
  await closeAll(); await attach(0);
  await waitFor(`document.querySelectorAll('.window .chat-message-list > .chat-msg-assistant').length >= 1`, 15000);
  await layout('freeform');
  const id = (await chatWins())[0];
  await evalJs(`app.wm.resizeWindowTo(${J(id)}, { w: 360, h: 420 })`); await sleep(500);
  const narrow = await evalJs(`(() => { const w = app.wm.windows.get(${J(id)}).element; const bar = w.querySelector('.chat-status-bar'); const kids = [...bar.children].filter((c) => c.getBoundingClientRect().width > 0); const tops = new Set(kids.map((c) => Math.round(c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2)));
    return { w: w.offsetWidth, bar: Math.round(bar.getBoundingClientRect().height), rows: tops.size, more: !!bar.querySelector(':scope > .chat-status-more') && bar.querySelector(':scope > .chat-status-more').getBoundingClientRect().width > 0 }; })()`);
  await evalJs(`app.wm.resizeWindowTo(${J(id)}, { w: 520, h: 250 })`); await sleep(500);
  const short = await evalJs(`(() => { const w = app.wm.windows.get(${J(id)}).element; const l = w.querySelector('.chat-message-list').getBoundingClientRect(); return { h: w.offsetHeight, list: Math.round(l.height), share: l.height / w.getBoundingClientRect().height }; })()`);
  return { id, narrow, short };
};

const runViewport = async ([VW, VH]) => {
  const tag = `${VW}x${VH}`;
  console.log(`\n═══ ${tag} (mouse, sidebar open) ═══`);
  pageErrors.length = 0;
  await load(VW, VH);
  await closeAll();
  await evalJs(`app.sidebar.toggle(true)`); await sleep(500);
  await attach(0); await attach(1);
  await waitFor(`document.querySelectorAll('.window .chat-message-list > .chat-msg-assistant').length >= 2`, 15000); await sleep(500);
  await shot(`${tag}-01-first.png`);

  console.log(`— ④ the toolbar, ⑤ the rail (${tag})`);
  for (const side of ['open', 'folded']) {
    if (side === 'folded') { await evalJs(`app.sidebar.toggle(false)`); await sleep(600); }
    const tb = await evalJs(`(() => { const b = document.getElementById('toolbar'), t = b.querySelector('.toolbar-title'); const btns = [...b.querySelectorAll('button, .toolbar-action')].filter((x) => x.getBoundingClientRect().width > 0 && getComputedStyle(x).visibility !== 'hidden'); const out = btns.filter((x) => { const r = x.getBoundingClientRect(); return r.left < -0.5 || r.right > innerWidth + 0.5 || r.top < -0.5 || r.bottom > innerHeight + 0.5; }).map((x) => x.id || x.className);
      const cs = t ? getComputedStyle(t) : null; const drawn = !!t && cs.display !== 'none' && cs.visibility !== 'hidden' && t.getBoundingClientRect().width > 0;
      return { sw: b.scrollWidth, cw: b.clientWidth, out, title: t ? { drawn, sw: t.scrollWidth, cw: t.clientWidth } : null }; })()`);
    check(`④ ${tag} sidebar ${side}: the toolbar does not overflow (scrollWidth ${tb.sw} ≤ ${tb.cw}) and every button lies inside the viewport`, tb.sw <= tb.cw && tb.out.length === 0, tb);
    check(`④ ${tag} sidebar ${side}: the brand is whole or not drawn — never «Vibe…» (P3-2)`, !tb.title || !tb.title.drawn || tb.title.sw <= tb.title.cw + 1, tb.title);
  }
  await evalJs(`app.sidebar.toggle(true)`); await sleep(600);
  const rail = await evalJs(`(() => { const r = document.getElementById('sidebar-rail'); const kids = r ? [...r.querySelectorAll('button, [role=button], .rail-item')].filter((x) => x.getBoundingClientRect().width > 0) : []; const last = kids.map((x) => x.getBoundingClientRect().bottom).reduce((m, v) => Math.max(m, v), 0); const sb = document.getElementById('sidebar'); return { last: Math.round(last), vh: innerHeight, sb: [sb.scrollHeight, sb.clientHeight] }; })()`);
  check(`⑤ ${tag}: the rail's last item ends inside the viewport (${rail.last} ≤ ${rail.vh}) and #sidebar does not scroll as a whole`, rail.last <= rail.vh + 0.5 && rail.sb[0] <= rail.sb[1] + 1, rail);

  console.log(`— ⑧ the 24 px mouse target (${tag})`);
  {
    const card = await centre('.session-item-card');
    if (card) { await hover(card.x, card.y); await sleep(250); }
    await evalJs(`(() => { const w = [...app.wm.windows.values()].find((x) => x.type === 'chat'); const m = w && w.element.querySelector('.chat-msg-assistant .chat-pre-wrap'); if (m) { const r = m.getBoundingClientRect(); window.__preAt = { x: r.left + r.width / 2, y: r.top + 8 }; } return 1; })()`);
    const h1 = await evalJs(HITS);
    const pre = await evalJs('window.__preAt || null');
    if (pre) { await hover(pre.x, pre.y); await sleep(250); }
    const h2 = await evalJs(HITS);
    await evalJs(`(() => { const c = [...app.wm.windows.values()].find((w) => w.type === 'chat'); app.wm.requestClose(c.id); return 1; })()`); await sleep(500); // a running conversation's ✕ says it keeps running — a toast with its ✕
    const h3 = await evalJs(HITS);
    await evalJs(`(() => { app.showNewSessionDialog(); return 1; })()`); await sleep(700);
    const h4 = await evalJs(HITS);
    await esc(); await sleep(300);
    const bad = [...new Set([...h1, ...h2, ...h3, ...h4])];
    check(`⑧ ${tag}: every visible clickable — the first screen, a session row hovered, a code block hovered, a toast, the New Session dialog — is ≥ 24×24 or inside a ≥ 24×24 clickable (exceptions named: ${Object.keys(HIT_EXCEPTIONS).join(', ')})`, bad.length === 0, bad);
    const gaps = await evalJs(WIN_BTN_GAPS);
    check(`⑧ ${tag}: the window buttons stand ≥ 4 px apart (${[...new Set(gaps)].join(', ')} px)`, gaps.length > 0 && gaps.every((g) => g >= 4), gaps);
    await evalJs(`document.querySelectorAll('#global-toasts').forEach((t) => t.remove())`);
  }

  console.log(`— ⑦ the chat window (${tag})`);
  {
    const c = await legNarrowChat();
    check(`⑦ ${tag}: a ${c.narrow.w} px chat window keeps its status bar ONE row (${c.narrow.rows} row, ${c.narrow.bar} px ≤ 28) with ⋯ for the rest (P2-4)`, c.narrow.rows === 1 && c.narrow.bar <= 28 && c.narrow.more, c.narrow);
    await evalJs(`app.wm.resizeWindowTo(${J(c.id)}, { w: 360, h: 420 })`); await sleep(500);
    const more = await evalJs(`(() => { const b = app.wm.windows.get(${J(c.id)}).element.querySelector('.chat-status-more'); if (!b) return null; const r = b.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
    if (more) { await click(more); await sleep(350); }
    const opened = await evalJs(`(() => { const bar = app.wm.windows.get(${J(c.id)}).element.querySelector('.chat-status-bar'); return { open: bar.classList.contains('chat-status-open'), folded: bar.querySelectorAll(':scope > .chat-status-folded').length, model: !!bar.querySelector('.chat-status-model') && bar.querySelector('.chat-status-model').getBoundingClientRect().width > 0 }; })()`);
    check(`⑦ ${tag}: ⋯ opens the bar in place — every chip shown again`, opened.open && opened.folded === 0 && opened.model, opened);
    check(`⑦ ${tag}: a ${c.short.h} px high chat window keeps ≥ 45 % of itself for messages (${Math.round(c.short.share * 100)} %, ${c.short.list} px)`, c.short.share >= 0.45, c.short);
    await evalJs(`app.wm.resizeWindowTo(${J(c.id)}, { w: 420, h: 420 })`); await sleep(400);
    const m = await evalJs(`(() => { const w = app.wm.windows.get(${J(c.id)}).element; const msg = w.querySelector('.chat-msg-assistant'); const r = msg.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 10 }; })()`);
    await hover(m.x, m.y); await sleep(300);
    const over = await evalJs(BTN_OVER_TEXT);
    check(`⑦ ${tag}: the Open in editor / Fork buttons never stand on a message's words (${over && over.messages} messages with buttons, hovered) (P2-5)`, !!over && over.messages > 0 && over.bad.length === 0, over);
  }

  console.log(`— ③ menus inside the screen (${tag})`);
  {
    const t = await legTitleMenu();
    check(`③ ${tag}: the title-bar menu of a lower-row chat window (right-clicked at y ${Math.round(t.at.y)}) lies inside the viewport, its first row at y ${t.m && t.m.firstTop} ≥ 0, «Move» takes a press (P2-3)`, !!t.m && t.m.inside && t.m.firstTop >= 0 && t.m.moveHit, t.m);
    const chip = await evalJs(`(() => { const ws = [...document.querySelectorAll('.window')].filter((w) => w.querySelector('.chat-status-model') && w.offsetWidth).sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top); const c = ws[0] && ws[0].querySelector('.chat-status-model'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (chip) {
      await click(chip); await sleep(400);
      const dd = await evalJs(INVIEW('.chat-status-dropdown'));
      check(`③ ${tag}: the model dropdown of a lower-row cell lies inside the viewport and scrolls when capped (the walk's unverified «cut at the cell's floor»)`, !!dd && dd.inside && dd.scrolls, dd);
      await esc();
    }
    const wl = await centre('#taskbar-status');
    if (wl) { await click(wl); await sleep(400); const l = await evalJs(INVIEW('.overlap-switcher')); check(`③ ${tag}: the window list lies inside the viewport`, !!l && l.inside && l.scrolls, l); await esc(); }
  }

  console.log(`— ① the release never buries a window (${tag})`);
  {
    const d = await legDragOverTaskbar(tag);
    check(`① ${tag}: Quad — a title bar released over the taskbar keeps ${d.after.bar[0]}×${d.after.bar[1]} of it inside the workspace (≥ 80×32) (P2-1)`, reachableBar(d.after), d.after);
    check(`① ${tag}: …and its tile, clicked twice, leaves it reachable (${d.afterTiles.bar[0]}×${d.afterTiles.bar[1]})`, reachableBar(d.afterTiles) && !d.afterTiles.min, d.afterTiles);
    await layout('freeform');
    await evalJs(`app.settings.set('layout.enableDragSnap', false)`);
    const id = d.id;
    const rel = [];
    for (const [name, to] of [['past the bottom', (ws) => ({ x: ws.l + ws.w / 2, y: VH - 3 })], ['over the sidebar', () => ({ x: 4, y: 200 })], ['over the toolbar', (ws) => ({ x: ws.l + ws.w / 2, y: 6 })]]) {
      await evalJs(`app.wm.revealWindow(${J(id)})`); await sleep(250);
      const ws = await evalJs(WS);
      await dragTo(await titleGrip(id), to(ws));
      const b = await evalJs(BOX(id)); rel.push([name, b.bar]);
      check(`① ${tag}: free drop (snap off) ${name} — the title bar keeps ${b.bar[0]}×${b.bar[1]} inside (≥ 80×32)`, reachableBar(b), b);
    }
    await evalJs(`app.settings.set('layout.enableDragSnap', true)`);
    await evalJs(`app.sidebar.toggle(false)`); await sleep(700);
    const folded = await evalJs(ALL_BARS);
    await evalJs(`app.sidebar.toggle(true)`); await sleep(700);
    const opened = await evalJs(ALL_BARS);
    await device(VW - 140, VH - 90); await sleep(900);
    const small = await evalJs(ALL_BARS);
    await device(VW, VH); await sleep(900);
    const back = await evalJs(ALL_BARS);
    const brand = await evalJs(`(() => { const t = document.querySelector('#toolbar .toolbar-title'); if (!t) return null; const cs = getComputedStyle(t); return { drawn: cs.display !== 'none' && cs.visibility !== 'hidden' && t.getBoundingClientRect().width > 0, sw: t.scrollWidth, cw: t.clientWidth }; })()`);
    check(`④ ${tag}: after the viewport shrank and grew back, the brand is still whole or not drawn (the fold's last pass ran before the title settled — the title re-judges its own box)`, !brand || !brand.drawn || brand.sw <= brand.cw + 1, brand);
    const unreach = (rows) => rows.filter((r) => !(r.bar[0] >= 79.5 && r.bar[1] >= 31.5));
    check(`① ${tag}: the sidebar folded / opened and the viewport shrunk to ${VW - 140}×${VH - 90} and back — every window's title bar keeps ≥ 80×32 inside`, [folded, opened, small, back].every((r) => r.length > 0 && unreach(r).length === 0), { folded: unreach(folded), opened: unreach(opened), small: unreach(small), back: unreach(back) });
  }

  console.log(`— ② the recovery loop (${tag})`);
  {
    const id = (await chatWins())[0];
    const bury = () => evalJs(`(() => { const w = app.wm.windows.get(${J(id)}); w.element.style.top = (document.getElementById('workspace').offsetHeight + 24) + 'px'; app.wm.focusWindow(${J(id)}); return 1; })()`); // what an old layout / another screen leaves
    await bury(); await sleep(200);
    const buried = await evalJs(BOX(id));
    const tile = await centre(`.taskbar-item[data-win-id="${id}"]`);
    await click(tile); await sleep(400);
    const byTile = await evalJs(BOX(id));
    check(`② ${tag}: a buried window (title bar ${buried.bar[0]}×${buried.bar[1]} inside) — its taskbar tile brings its rect INSIDE the workspace (not only raised)`, !reachableBar(buried) && byTile.inside && !byTile.min, { buried, byTile });
    await bury(); await sleep(200);
    await click(await centre('#taskbar-status')); await sleep(400);
    const row = await evalJs(`(() => { const rows = [...document.querySelectorAll('.overlap-switcher .overlap-switcher-item')]; const want = app.wm.windows.get(${J(id)}).title; const r = rows.find((x) => x.textContent.includes(want)); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (row) await click(row); await sleep(400);
    const byRow = await evalJs(BOX(id));
    check(`② ${tag}: …and its window-list row does too`, !!row && byRow.inside, byRow);
  }

  console.log(`— ⑥ the taskbar (${tag})`);
  {
    const t = await legTaskbar();
    const s = t.s0, hidden = s.rows.filter((r) => !r.whole), visibleBad = s.rows.filter((r) => r.whole && !r.hits), narrow = s.rows.filter((r) => r.w < 90);
    check(`⑥ ${tag}: ${s.n} windows — every tile ≥ 90 px (P2-2: 60 px, a 1–2 character label)`, s.n >= 15 && narrow.length === 0, narrow.slice(0, 4));
    check(`⑥ ${tag}: every whole tile's centre hits that tile; the ${hidden.length} cut ones are counted on a visible «+N» chip («${s.chip && s.chip.text}»)`, visibleBad.length === 0 && hidden.length > 0 && !!s.chip && s.chip.hit && s.chip.text === '+' + hidden.length, { visibleBad, hidden: hidden.length, chip: s.chip });
    check(`⑥ ${tag}: the wheel's deltaY scrolls the strip sideways (scrollLeft ${t.s0.scroll[0]} → ${t.s1.scroll[0]})`, t.s1.scroll[0] > t.s0.scroll[0], [t.s0.scroll, t.s1.scroll]);
    check(`⑥ ${tag}: 8 desktops — the switcher is ONE «‹name› k/N» button (${J(t.s8.compact)}), no pile of previews`, t.s8.compact === 'Desktop 1 1/8' && t.s8.previews === 0, { compact: t.s8.compact, previews: t.s8.previews });
    // the «+N» list = exactly the cut tiles, a row raises its window
    const chipAt = await centre('#taskbar-overflow');
    await click(chipAt); await sleep(400);
    const list = await evalJs(`(() => { const now = (() => { const s = document.getElementById('taskbar-items'), sr = s.getBoundingClientRect(); return [...s.querySelectorAll(':scope > .taskbar-item')].filter((t) => { const r = t.getBoundingClientRect(); return !(r.left >= sr.left - 0.5 && r.right <= sr.right + 0.5); }).map((t) => t.dataset.winId); })(); const rows = [...document.querySelectorAll('.taskbar-overflow-list .overlap-switcher-item')].map((r) => r.dataset.winId); return { now, rows }; })()`);
    check(`⑥ ${tag}: the «+N» chip lists exactly the cut tiles (${list.rows.length})`, list.rows.length > 0 && J([...list.rows].sort()) === J([...list.now].sort()), list);
    const pick = list.rows[list.rows.length - 1];
    const rowAt = await evalJs(`(() => { const r = document.querySelector('.taskbar-overflow-list .overlap-switcher-item[data-win-id="${pick}"]'); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (rowAt) await click(rowAt); await sleep(500);
    const picked = await evalJs(`(() => { const t = document.querySelector('.taskbar-item[data-win-id="${pick}"]'), s = document.getElementById('taskbar-items'); const r = t.getBoundingClientRect(), sr = s.getBoundingClientRect(); return { active: app.wm.activeWindowId === ${J(pick)}, whole: r.left >= sr.left - 0.5 && r.right <= sr.right + 0.5 }; })()`);
    check(`⑥ ${tag}: …a row raises its window and brings its tile into the strip`, picked.active && picked.whole, picked);
    // the compact switcher's list switches and adds
    await click(await centre('.desktop-switch-compact')); await sleep(350);
    const dl = await evalJs(`(() => { const m = document.querySelector('.desktop-switch-menu'); if (!m) return null; const r = m.getBoundingClientRect(); const rows = [...m.querySelectorAll('.context-menu-item')]; const two = rows.find((x) => x.dataset.desktopId === app.desktopManager.desktops[1].id); const b = two && two.getBoundingClientRect(); return { rows: rows.length, inside: r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.left >= -0.5 && r.right <= innerWidth + 0.5, two: b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null }; })()`);
    check(`⑥ ${tag}: the button's list holds the 8 desktops + «Add desktop», inside the viewport`, !!dl && dl.rows === 9 && dl.inside, dl);
    if (dl && dl.two) await click(dl.two); await sleep(700);
    const sw = await evalJs(`({ active: app.desktopManager.activeDesktopId === app.desktopManager.desktops[1].id, label: (() => { const b = document.querySelector('.desktop-switch-compact'); return b ? [...b.querySelectorAll('span')].map((x) => x.textContent.trim()).filter(Boolean).join(' ') : null; })() })`);
    check(`⑥ ${tag}: …a row switches to that desktop («${sw.label}»)`, sw.active && sw.label === 'Desktop 2 2/8', sw);
    await evalJs(`app.desktopManager.switchTo(app.desktopManager.desktops[0].id)`); await sleep(700);
    await shot(`${tag}-p22-taskbar.png`);

    console.log(`— ⑨ the toast (${tag})`);
    await click(await centre('.desktop-switch-compact')); await sleep(350);
    await evalJs(`(() => { const c = [...app.wm.windows.values()].find((w) => w.type === 'chat' && !w._hiddenByDesktop); app.wm.requestClose(c.id); return 1; })()`); await sleep(700);
    const tm = await evalJs(`(() => { const m = document.querySelector('.desktop-switch-menu'), toasts = [...document.querySelectorAll('#global-toasts .global-toast')]; if (!m || !toasts.length) return { menu: !!m, toasts: toasts.length }; const meets = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; const mr = m.getBoundingClientRect(); const comps = [...document.querySelectorAll('.chat-input-area')].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0);
      const rows = [...m.querySelectorAll('.context-menu-item')].map((x) => { const r = x.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && x.contains(h); });
      const st = document.getElementById('global-toasts'), R = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
      return { menu: true, toasts: toasts.length, overMenu: toasts.some((t) => meets(t.getBoundingClientRect(), mr)), overComposer: toasts.some((t) => comps.some((c) => meets(t.getBoundingClientRect(), c))), rowsHit: rows.every(Boolean), at: { toast: R(toasts[0].getBoundingClientRect()), menu: R(mr), comps: comps.map(R), top: st.style.top, bottom: st.style.bottom } }; })()`);
    check(`⑨ ${tag}: a toast shown while the desktop list is open stands over neither the menu nor a composer, and every row of the menu takes its press`, tm.menu && tm.toasts > 0 && !tm.overMenu && !tm.overComposer && tm.rowsHit, tm);
    await shot(`${tag}-toast-menu.png`);
    await esc();
    await evalJs(`(() => { const dm = app.desktopManager; for (const d of dm.desktops.slice(1)) dm.deleteDesktop(d.id); return dm.desktops.length; })()`).catch(() => 0); await sleep(500);
  }

  console.log(`— ⑪ the cascade (${tag})`);
  {
    await closeAll(); await layout('freeform');
    for (let i = 0; i < 3; i++) { await evalJs(`(() => { app.openFileExplorer(${J(CWD)}); return 1; })()`); await sleep(450); }
    const vis = await evalJs(`(() => [...app.wm.windows.values()].map((w) => { const tb = w.titleBar.getBoundingClientRect(); let v = 0, a = 0; for (let x = tb.left + 3; x < tb.right - 3; x += 6) for (let y = tb.top + 4; y < tb.bottom - 2; y += 6) { a++; const h = document.elementFromPoint(x, y); if (h && w.element.contains(h)) v++; } return Math.round(100 * v / Math.max(1, a)); }))()`);
    check(`⑪ ${tag}: three windows opened on an empty desktop keep ≥ 80 % of each title bar visible (${vis.join(' / ')} %) — the cascade buries none`, vis.length === 3 && vis.every((v) => v >= 80), vis);
    await shot(`${tag}-cascade.png`);
  }

  console.log(`— ⑩ the Desktop popover (${tag})`);
  {
    await closeAll();
    await evalJs(`(() => { app._vncSeat = 'wayland'; app.openBrowser(${J(ORIGIN + '/fonts.css')}); return 1; })()`); await sleep(1500);
    await click(await centre('#btn-desktop')); await sleep(800);
    const p = await evalJs(`(() => { const b = document.querySelector('.desktop-picker'); if (!b) return null; const r = b.getBoundingClientRect(); return { notes: [...b.querySelectorAll('.desktop-picker-row .desktop-picker-note')].map((n) => n.textContent.trim()), inside: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 }; })()`);
    check(`⑩ ${tag}: the Desktop popover lies inside the viewport and the local row's note is a whole sentence ending with a period (P3-1 — it stopped at «the virtual desktop can»)`, !!p && p.inside && p.notes.length > 0 && p.notes.every((n) => /[.。]$/.test(n)), p);
    const fr = await evalJs(`(() => { const f = [...document.querySelectorAll('.window iframe')].find((x) => x.offsetWidth > 0 && getComputedStyle(x).display !== 'none'); if (!f) return null; const r = f.getBoundingClientRect(); return { x: r.left + Math.min(220, r.width / 2), y: r.top + Math.min(140, r.height / 2) }; })()`);
    if (fr) await click(fr); await sleep(400);
    const afterPress = await evalJs(`({ open: !!document.querySelector('.desktop-picker'), active: document.activeElement && document.activeElement.tagName })`);
    check(`⑩ ${tag}: a press into the Web view's frame closes it (the frame took the keyboard: ${afterPress.active})`, !!fr && !afterPress.open && afterPress.active === 'IFRAME', afterPress);
    // a float with no closer of its own while the frame holds the keyboard; Escape is the frame's key
    await evalJs(`(() => { const d = document.createElement('div'); d.className = 'context-menu ds-probe-float'; d.dataset.popover = '1'; d.style.cssText = 'position:fixed;left:10px;top:10px;width:40px;height:20px'; document.body.appendChild(d); return document.activeElement.tagName; })()`);
    await esc(); await sleep(250);
    const floats = await evalJs(`({ left: document.querySelectorAll('[data-popover]').length, active: document.activeElement && document.activeElement.tagName })`);
    check(`⑩ ${tag}: Escape pressed while the same-origin frame holds the keyboard closes every [data-popover] float (${floats.left} left)`, floats.left === 0 && floats.active === 'IFRAME', floats);
  }

  console.log(`— P3-3 the Settings window (${tag})`);
  {
    await closeAll();
    await evalJs(`(() => { app._settingsUI.open(); return 1; })()`); await sleep(1500);
    await evalJs(`(() => { const c = document.querySelector('.settings-content'); if (c) c.scrollTop = c.scrollHeight; return 1; })()`); await sleep(400);
    const st = await evalJs(`(() => { const n = document.querySelector('.settings-nav'), c = document.querySelector('.settings-content'), f = document.querySelector('.settings-foot'), w = n && n.closest('.window'); if (!n || !c) return null; const fr = f && f.getBoundingClientRect(), wr = w && w.getBoundingClientRect(), nr = n.getBoundingClientRect(); return { scrolled: c.scrollTop > 1000, navInWindow: !!wr && nr.top >= wr.top && nr.top < wr.top + 140, foot: !!f && fr.height > 0 && !!wr && fr.bottom <= wr.bottom + 0.5 && fr.top >= wr.top, text: f && f.textContent }; })()`);
    check(`P3-3 ${tag}: with the content scrolled to its end the nav still stands at the top of its column and the window's foot says the save rule`, !!st && st.scrolled && st.navInWindow && st.foot && /saves as you make it/.test(st.text || ''), st);
    await closeAll();
  }

  check(`⑫ ${tag}: zero page errors`, pageErrors.length === 0, pageErrors.slice(0, 4));
};

for (const vp of VIEWPORTS) await runViewport(vp);

// ═════════════════════════════ acceptance r2 — the compact form's doors, the «+N» tail, the resize (951×585) ═════════════════════════════
/** A SECOND CLIENT of the same hub (⑬: a row's Move down must reach another screen — layout-sync): its own page target and
 *  CDP socket, read only */
const secondClient = async () => {
  const tg = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const s2 = new WebSocket(tg.webSocketDebuggerUrl, { maxPayload: 16 * 1024 * 1024 }); await new Promise((r) => s2.on('open', r));
  let n = 0; const wait = new Map(); s2.on('message', (d) => { const m = JSON.parse(d); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
  const call = (method, params = {}) => new Promise((res) => { const id = ++n; wait.set(id, res); s2.send(JSON.stringify({ id, method, params })); });
  await call('Page.enable'); await call('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: ORIGIN + '/' });
  const ev = async (expr) => { const m = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return m.result && m.result.result ? m.result.result.value : undefined; };
  const until = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await ev(expr); if (v) return v; } catch { } await sleep(200); } return ev(expr).catch(() => null); };
  return { ev, until, close: async () => { try { s2.close(); } catch { } try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tg.id}`); } catch { } } };
};
const BTN_PARTS = `(() => { const b = document.querySelector('.desktop-switch-compact'); return b ? [...b.querySelectorAll('span')].map((x) => x.textContent.trim()).filter(Boolean).join(' ') : null; })()`;
const rowOf = (k) => evalJs(`(() => { const id = (app.desktopManager.desktops[${k}] || {}).id; const r = id && document.querySelector('.desktop-switch-menu .context-menu-item[data-desktop-id="' + id + '"]'); if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.left + Math.min(50, b.width / 3), y: b.top + b.height / 2 }; })()`);
const rowMenuItem = (label) => evalJs(`(() => { const m = [...document.querySelectorAll('.context-menu:not(.desktop-switch-menu) > .context-menu-item')].find((x) => x.textContent.trim() === ${J(label)}); if (!m) return null; const b = m.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
const openDeskList = async () => { if (!(await evalJs(`!!document.querySelector('.desktop-switch-menu')`))) { const b = await centre('.desktop-switch-compact'); if (b) await click(b); await sleep(350); } };
const eightDesktops = async () => {
  await evalJs(`(() => { const dm = app.desktopManager; while (dm.desktops.length > 8) dm.deleteDesktop(dm.desktops[dm.desktops.length - 1].id); while (dm.desktops.length < 8) dm.createDesktop(); return dm.desktops.length; })()`).catch(() => 0);
  await sleep(400); await evalJs(`app.desktopManager.switchTo(app.desktopManager.desktops[0].id)`); await sleep(700);
};
const legResizeTop = async () => {
  await closeAll(); await openFiles(1); await sleep(400);
  const id = await evalJs('app.wm.activeWindowId');
  const h = await evalJs(`(() => { const e = app.wm.windows.get(${J(id)}).element.querySelector('.resize-handle.resize-n'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (h) { await hover(h.x, h.y); await mouse('mousePressed', h.x, h.y); for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', h.x, h.y + (4 - h.y) * i / 12); await sleep(30); } await sleep(150); await mouse('mouseReleased', h.x, 4); await sleep(500); }
  return { id, handle: h, after: await evalJs(BOX(id)) };
};
const legTail = async () => {
  await closeAll();
  await evalJs(`(() => { const dm = app.desktopManager; while (dm.desktops.length > 1) dm.deleteDesktop(dm.desktops[dm.desktops.length - 1].id); return dm.desktops.length; })()`).catch(() => 0);
  await openFiles(26); await sleep(900);
  const chip = await evalJs(`(() => { const c = document.getElementById('taskbar-overflow'); return c && !c.hidden ? c.textContent : null; })()`);
  const at = await centre('#taskbar-overflow');
  if (at) await click(at); await sleep(500);
  const L = `(() => { const p = document.querySelector('.taskbar-overflow-list'); if (!p) return null; const r = p.getBoundingClientRect(); const rows = [...p.querySelectorAll('.overlap-switcher-item')]; const last = rows[rows.length - 1]; if (!last) return null; const lr = last.getBoundingClientRect(); const cx = lr.left + lr.width / 2, cy = lr.top + lr.height / 2; const h = cy >= 0 && cy <= innerHeight ? document.elementFromPoint(cx, cy) : null;
    return { n: rows.length, rect: [Math.round(r.top), Math.round(r.bottom)], inside: r.top >= -0.5 && r.bottom <= innerHeight + 0.5, scrolls: p.scrollHeight > p.clientHeight + 1, last: { x: Math.round(cx), y: Math.round(cy) }, lastHit: !!h && last.contains(h), lastId: last.dataset.winId }; })()`;
  const l0 = await evalJs(L);
  const pc = await centre('.taskbar-overflow-list');
  for (let i = 0; i < 12 && pc; i++) { const l = await evalJs(L); if (!l || l.lastHit) break; await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: pc.x, y: pc.y, deltaX: 0, deltaY: 240 }); await sleep(200); }
  const l1 = await evalJs(L);
  if (l1 && l1.lastHit) await click(l1.last); await sleep(500);
  const picked = !!l1 && (await evalJs(`app.wm.activeWindowId === ${J(l1.lastId)}`));
  await esc();
  return { chip, l0, l1, picked };
};
const legDoors = async (red) => {
  await closeAll(); await eightDesktops();
  await openFiles(1); await sleep(500);
  const fid = await evalJs('app.wm.activeWindowId');
  const ids0 = await evalJs('app.desktopManager.desktops.map((d) => d.id)');
  const out = { name0: await evalJs('app.desktopManager.desktops[0].name'), button0: await evalJs(BTN_PARTS) };
  // Rename… through the row's right-click (the desktop on show — its name is the button's)
  await openDeskList();
  const r0 = await rowOf(0); if (r0) await rclick(r0);
  out.rowMenu = await evalJs(`[...document.querySelectorAll('.context-menu:not(.desktop-switch-menu) > .context-menu-item')].map((x) => x.textContent.trim())`);
  const ren = await rowMenuItem('Rename…');
  if (ren) {
    await click(ren);
    await waitFor(`!!document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.value === ${J(out.name0)}`, 4000);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await cdp('Input.insertText', { text: 'Taxes' }); await key('Enter', 'Enter', 13); await sleep(700);
  }
  out.renamed = await evalJs(`(() => { const id = app.desktopManager.desktops[0].id; const row = document.querySelector('.desktop-switch-menu .context-menu-item[data-desktop-id="' + id + '"] .dsc-name'); return { name: app.desktopManager.desktops[0].name, row: row ? row.textContent : null, button: ${BTN_PARTS} }; })()`);
  // Delete through the last row's ⋯
  await openDeskList();
  out.more = await evalJs(`(() => { const id = app.desktopManager.desktops[7].id; const m = document.querySelector('.desktop-switch-menu .context-menu-item[data-desktop-id="' + id + '"] .dsc-more'); if (!m) return null; const b = m.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: Math.round(b.width), h: Math.round(b.height) }; })()`);
  if (out.more) { await click(out.more); const del = await rowMenuItem('Delete'); if (del) await click(del); await sleep(900); }
  out.deleted = await evalJs(`({ n: app.desktopManager.desktops.length, rows: document.querySelectorAll('.desktop-switch-menu .context-menu-item[data-desktop-id]').length, button: ${BTN_PARTS} })`);
  // a title-bar drag held on the button: the list springs open, released on desktop 4's row
  await esc(); await sleep(200);
  const a = await titleGrip(fid), b = await centre('.desktop-switch-compact');
  await hover(a.x, a.y); await mouse('mousePressed', a.x, a.y);
  for (let i = 1; i <= 14; i++) { await mouse('mouseMoved', a.x + (b.x - a.x) * i / 14, a.y + (b.y - a.y) * i / 14); await sleep(30); }
  for (let i = 0; i < 6; i++) { await mouse('mouseMoved', b.x + (i % 2), b.y); await sleep(120); }
  out.sprang = await evalJs(`!!document.querySelector('.desktop-switch-menu')`);
  const t4 = await rowOf(3);
  const end = t4 || b;
  for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', b.x + (end.x - b.x) * i / 8, b.y + (end.y - b.y) * i / 8); await sleep(40); }
  await sleep(150); await mouse('mouseReleased', end.x, end.y); await sleep(800);
  out.moved = await evalJs(`(() => { const w = app.wm.windows.get(${J(fid)}), dm = app.desktopManager; return { on: !!w && w._desktopId === dm.desktops[3].id, stayed: dm.activeDesktopId === dm.desktops[0].id, list: !!document.querySelector('.desktop-switch-menu') }; })()`);
  if (out.moved.on) {
    await openDeskList(); const g = await rowOf(3); if (g) await click(g); await sleep(1000);
    out.there = await evalJs(BOX(fid));
    out.shown = await evalJs(`(() => { const w = app.wm.windows.get(${J(fid)}); return !!w && !w._hiddenByDesktop && app.desktopManager.activeDesktopId === app.desktopManager.desktops[3].id; })()`);
    await evalJs(`app.desktopManager.switchTo(app.desktopManager.desktops[0].id)`); await sleep(700);
  }
  await shot(`${red ? 'RED-' : ''}r2-doors.png`);
  // Move down through a row's right-click — read on a second client
  const c2 = red ? null : await secondClient();
  if (c2) await c2.until(`!!(window.app && app.desktopManager && app.desktopManager.desktops.length === 7)`, 30000);
  await openDeskList();
  const r1 = await rowOf(1); if (r1) await rclick(r1);
  const down = await rowMenuItem('Move down'); if (down) await click(down); await sleep(700);
  out.order = await evalJs('app.desktopManager.desktops.map((d) => d.id)');
  out.wantOrder = ids0[2] && out.order[1] === ids0[2] && out.order[2] === ids0[1];
  if (c2) { out.other = await c2.until(`(() => { const o = app.desktopManager.desktops.map((d) => d.id); return JSON.stringify(o) === ${J(J(out.order))} ? o : null; })()`, 8000); await c2.close(); }
  await esc();
  return out;
};

// ═════════════════════════════ acceptance r3 — the spring on the REAL HTML5 road, a stale row, a cancelled Rename… ═════════════════════════════
const SPRING = `(() => { const dm = app.desktopManager; return { list: !!document.querySelector('.desktop-switch-menu'), timer: !!dm._springTimer, ref: !!dm._springList, refLive: !!(dm._springList && dm._springList.isConnected), life: !!dm._springLife }; })()`;
const springIdle = (x) => !!x && !x.list && !x.timer && !x.ref && !x.life;
/** A REAL native HTML5 drag of a taskbar tile (CDP drag interception — what Puppeteer's mouse.drag does): the press and a few
 *  moves start Chrome's own drag; its data comes back intercepted and every later step is dispatched with it. */
const tileDrag = async () => {
  const tile = await centre('#taskbar-items > .taskbar-item');
  if (!tile) return null;
  dragData = null;
  await hover(tile.x, tile.y); await mouse('mousePressed', tile.x, tile.y); await sleep(60);
  for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', tile.x + i * 4, tile.y - i * 3); await sleep(30); }
  for (let i = 0; i < 20 && !dragData; i++) await sleep(50);
  return dragData;
};
const html5 = (type, p, data) => cdp('Input.dispatchDragEvent', { type, x: Math.round(p.x), y: Math.round(p.y), data });
const holdOn = async (p, data, ms) => { await html5('dragEnter', p, data); const t0 = Date.now(); while (Date.now() - t0 < ms) { await html5('dragOver', p, data); await sleep(50); } };
const dragWin = (data) => ((data && data.items) || []).find((i) => i.mimeType === 'text/window-id')?.data || null;
const legSpringHtml5 = async () => {
  await closeAll(); await eightDesktops(); await openFiles(1); await sleep(500);
  const fid = await evalJs('app.wm.activeWindowId');
  const btn = await centre('.desktop-switch-compact');
  const away = await evalJs(`(() => { const r = document.getElementById('workspace').getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height * 0.35 }; })()`);
  const strip = await evalJs(`(() => { const r = document.getElementById('taskbar-items').getBoundingClientRect(); return { x: r.right - 12, y: r.top + r.height / 2 }; })()`);
  const out = { btn: !!btn };
  await cdp('Input.setInterceptDrags', { enabled: true });
  try {
    // ~100 ms across the button, off it, Esc
    let data = await tileDrag(); out.intercepted = dragWin(data) === fid;
    if (data && btn) {
      await holdOn(btn, data, 100); await html5('dragOver', away, data); await sleep(30);
      await html5('dragCancel', away, data); await mouse('mouseReleased', away.x, away.y);
      out.passCancel = [await evalJs(SPRING)]; await sleep(600); out.passCancel.push(await evalJs(SPRING)); await sleep(1500); out.passCancel.push(await evalJs(SPRING));
    }
    // the same, dropped back on the strip
    data = await tileDrag();
    if (data && btn) {
      await holdOn(btn, data, 100); await html5('dragOver', strip, data); await sleep(30);
      await html5('drop', strip, data); await mouse('mouseReleased', strip.x, strip.y);
      out.passDrop = [await evalJs(SPRING)]; await sleep(600); out.passDrop.push(await evalJs(SPRING));
    }
    // held ≥ SPRING_MS — the list springs; off it, then dropped away from every row
    data = await tileDrag();
    if (data && btn) {
      await holdOn(btn, data, 650); out.holdAway = { opened: await evalJs(SPRING) };
      await html5('dragOver', away, data); await sleep(60); out.holdAway.off = await evalJs(SPRING);
      await html5('drop', away, data); await mouse('mouseReleased', away.x, away.y); await sleep(800);
      out.holdAway.after = await evalJs(SPRING);
    }
    // held, then Esc on the button
    data = await tileDrag();
    if (data && btn) {
      await holdOn(btn, data, 650); out.holdEsc = { opened: await evalJs(SPRING) };
      await html5('dragCancel', btn, data); await mouse('mouseReleased', btn.x, btn.y); await sleep(800);
      out.holdEsc.after = await evalJs(SPRING);
    }
    // held, dropped on desktop 4's row
    data = await tileDrag();
    if (data && btn) {
      await holdOn(btn, data, 650);
      const r4 = await rowOf(3);
      if (r4) { await html5('dragOver', r4, data); await sleep(60); await html5('dragOver', r4, data); await html5('drop', r4, data); }
      await mouse('mouseReleased', r4 ? r4.x : btn.x, r4 ? r4.y : btn.y); await sleep(800);
      out.rowDrop = { row: !!r4, ...(await evalJs(`(() => { const w = app.wm.windows.get(${J(fid)}), dm = app.desktopManager; return { on4: !!w && w._desktopId === dm.desktops[3].id, stayed: dm.activeDesktopId === dm.desktops[0].id }; })()`)), st: await evalJs(SPRING) };
    }
  } finally { await cdp('Input.setInterceptDrags', { enabled: false }); }
  await esc();
  return out;
};
/** ⑰: the window's state after a drop on a STALE row (its desktop deleted on the other client while the list was open) */
const STALE = (fid) => `(() => { const w = app.wm.windows.get(${J(fid)}), dm = app.desktopManager; return { n: dm.desktops.length, known: !!w && dm.desktops.some((d) => d.id === w._desktopId), here: !!w && w._desktopId === dm.activeDesktopId, hidden: !!w && !!w._hiddenByDesktop, toast: [...document.querySelectorAll('.global-toast-body')].map((x) => x.textContent).join(' | '), list: !!document.querySelector('.desktop-switch-menu') }; })()`;
const staleOk = (x, name) => !!x && x.row && x.stale && x.known && x.here && !x.hidden && !x.list && x.toast.includes('«' + name + '»') && x.toast.includes('no longer there') && reachableBar(x.box);
/** ANOTHER CLIENT of the hub deletes a desktop — what a second screen sends on the wire (a raw /ws connection; a second page
 *  target would turn this page into a background tab — no rAF, no title-bar hit test) */
const deleteElsewhere = async (id) => {
  const w = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); await new Promise((r, j) => { w.on('open', r); w.on('error', j); });
  w.send(JSON.stringify({ type: 'desktop-delete', desktopId: id })); await sleep(300); try { w.close(); } catch { }
};
const legStaleRow = async () => {
  await closeAll(); await eightDesktops(); await openFiles(1); await sleep(500);
  const out = {};
  const gone = () => evalJs('({ id: app.desktopManager.desktops[4].id, name: app.desktopManager.desktops[4].name })');
  const removeThere = async (v, n) => { await deleteElsewhere(v.id); out.arrived = await waitFor(`app.desktopManager.desktops.length === ${n}`, 8000); return evalJs(`!!document.querySelector('.desktop-switch-menu .context-menu-item[data-desktop-id=${J(v.id)}]') && !app.desktopManager.desktops.some((d) => d.id === ${J(v.id)})`); };
  // the title-bar road: held on the button (the list springs), desktop 5 deleted on the other client, released on its row
  {
    const fid = await evalJs('app.wm.activeWindowId'), v = await gone();
    const a = await titleGrip(fid), b = await centre('.desktop-switch-compact');
    await hover(a.x, a.y); await mouse('mousePressed', a.x, a.y);
    for (let i = 1; i <= 14; i++) { await mouse('mouseMoved', a.x + (b.x - a.x) * i / 14, a.y + (b.y - a.y) * i / 14); await sleep(30); }
    for (let i = 0; i < 6; i++) { await mouse('mouseMoved', b.x + (i % 2), b.y); await sleep(120); }
    const row = await rowOf(4);
    const stale = await removeThere(v, 7);
    const end = row || b;
    for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', b.x + (end.x - b.x) * i / 8, b.y + (end.y - b.y) * i / 8); await sleep(40); }
    await sleep(150); await mouse('mouseReleased', end.x, end.y); await sleep(800);
    out.pointer = { name: v.name, row: !!row, stale, ...(await evalJs(STALE(fid))), box: await evalJs(BOX(fid)) };
  }
  // the tile road: a fresh window's tile held on the button, desktop 5 (the next one) deleted there, dropped on its row
  await closeAll(); await openFiles(1); await sleep(500);
  await cdp('Input.setInterceptDrags', { enabled: true });
  try {
    const fid = await evalJs('app.wm.activeWindowId'), v = await gone(), b = await centre('.desktop-switch-compact');
    const data = await tileDrag();
    if (data && b) {
      await holdOn(b, data, 650);
      const row = await rowOf(4);
      const stale = await removeThere(v, 6);
      if (row) { await html5('dragOver', row, data); await sleep(60); await html5('dragOver', row, data); await html5('drop', row, data); }
      await mouse('mouseReleased', row ? row.x : b.x, row ? row.y : b.y); await sleep(800);
      out.html5 = { name: v.name, row: !!row, stale, dragged: dragWin(data) === fid, ...(await evalJs(STALE(fid))), box: await evalJs(BOX(fid)) };
    }
  } finally { await cdp('Input.setInterceptDrags', { enabled: false }); }
  return out;
};
const legRenameCancel = async () => {
  await closeAll(); await eightDesktops();
  const name0 = await evalJs('app.desktopManager.desktops[0].name');
  await openDeskList();
  const r0 = await rowOf(0); if (r0) await rclick(r0);
  const ren = await rowMenuItem('Rename…');
  let dialog = false;
  if (ren) {
    await click(ren);
    dialog = await waitFor(`!!document.activeElement && document.activeElement.tagName === 'INPUT' && document.activeElement.value === ${J(name0)}`, 4000);
    const c = await evalJs(`(() => { const b = [...document.querySelectorAll('.dialog-footer .btn-cancel')].map((x) => x.getBoundingClientRect()).find((r) => r.width > 0 && r.height > 0); return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null; })()`);
    if (c) await click(c);
  }
  await sleep(700);
  return { name0, menu: !!ren, dialog, ...(await evalJs(`({ name: app.desktopManager.desktops[0].name, list: !!document.querySelector('.desktop-switch-menu'), menus: document.querySelectorAll('.context-menu').length, open: [...document.querySelectorAll('.dialog-footer .btn-cancel')].some((x) => x.getBoundingClientRect().width > 0) })`)) };
};

console.log('\n═══ acceptance r2 — the compact form\'s doors, the «+N» list\'s tail, the resize\'s release (951×585) ═══');
{
  pageErrors.length = 0;
  await load(951, 585); await closeAll(); await evalJs(`app.sidebar.toggle(true)`); await sleep(500);
  const z = await legResizeTop();
  check(`⑮ r2: a north edge dragged past the workspace's top — the title bar keeps ≥ 32 px inside (bar ${z.after && J(z.after.bar)})`, !!z.handle && reachableBar(z.after), z);
  const t = await legTail();
  check(`⑭ r2: 26 windows («${t.chip}») — the «+N» list stands inside the viewport, capped and scrolling (${t.l0 && t.l0.n} rows)`, /^\+\d+$/.test(t.chip || '') && +t.chip.slice(1) >= 18 && !!t.l0 && t.l0.inside && t.l0.scrolls, t);
  check('⑭ r2: …the wheel brings its LAST row in, and that row takes the click (its window raised)', !!t.l1 && t.l1.lastHit && t.picked, { l1: t.l1, picked: t.picked });
  const d = await legDoors(false);
  check(`⑬ r2: 8 desktops — the button names the desktop on show («${d.button0}»); a row's right-click opens its doors (${J(d.rowMenu)})`, d.button0 === d.name0 + ' 1/8' && J(d.rowMenu) === J(['Rename…', 'Delete', 'Move down']), { button0: d.button0, rowMenu: d.rowMenu });
  check(`⑬ r2: …Rename… ⇒ the new name on the row (the list back) and on the button (${J(d.renamed)})`, !!d.renamed && d.renamed.name === 'Taxes' && d.renamed.row === 'Taxes' && d.renamed.button === 'Taxes 1/8', d.renamed);
  check(`⑬ r2: …a row's ⋯ (${d.more && d.more.w + '×' + d.more.h}) → Delete ⇒ N−1 (${J(d.deleted)})`, !!d.more && d.more.w >= 24 && d.more.h >= 24 && d.deleted.n === 7 && d.deleted.rows === 7 && d.deleted.button === 'Taxes 1/7', { more: d.more, deleted: d.deleted });
  check('⑬ r2: …a title-bar drag held on the button springs the list open; released on a row, the window is on that desktop (this screen stays) and the list closes', d.sprang && d.moved.on && d.moved.stayed && !d.moved.list, { sprang: d.sprang, moved: d.moved });
  check(`⑬ r2: …on that desktop the window shows with its title bar reachable (bar ${d.there && J(d.there.bar)})`, d.shown && reachableBar(d.there), { shown: d.shown, there: d.there });
  check('⑬ r2: …a row\'s Move down reorders — and ANOTHER client of the hub follows (layout-sync)', d.wantOrder && Array.isArray(d.other) && J(d.other) === J(d.order), { order: d.order, other: d.other });
  check('⑫ r2: zero page errors', pageErrors.length === 0, pageErrors.slice(0, 4));
}

console.log('\n═══ acceptance r3 — the spring on the REAL HTML5 road, a stale row, a cancelled Rename… (951×585) ═══');
{
  pageErrors.length = 0;
  await load(951, 585); await closeAll(); await evalJs(`app.sidebar.toggle(true)`); await sleep(500);
  const h = await legSpringHtml5();
  check('⑯ r3: a taskbar tile\'s drag is Chrome\'s OWN HTML5 drag (intercepted, its data the window\'s id)', h.btn && h.intercepted, { btn: h.btn, intercepted: h.intercepted });
  check('⑯ r3: …~100 ms across the button, off it, Esc ⇒ no list ever (right after, 0.6 s, 2.1 s), no timer, no ref, no listener', Array.isArray(h.passCancel) && h.passCancel.length === 3 && h.passCancel.every(springIdle), h.passCancel);
  check('⑯ r3: …the same dropped back on the strip ⇒ no list ever, no timer', Array.isArray(h.passDrop) && h.passDrop.every(springIdle), h.passDrop);
  check('⑯ r3: …held ≥ 350 ms the list springs; off the button and the list it closes (the title-bar road\'s rule); dropped away ⇒ closed, no timer, no ref, no listener', !!h.holdAway && h.holdAway.opened.list && !h.holdAway.off.list && springIdle(h.holdAway.after), h.holdAway);
  check('⑯ r3: …held, then Esc ⇒ closed, no timer, no ref, no listener', !!h.holdEsc && h.holdEsc.opened.list && springIdle(h.holdEsc.after), h.holdEsc);
  check('⑯ r3: …held, dropped on a row ⇒ the window on that desktop (this screen stays), the list and its ref gone', !!h.rowDrop && h.rowDrop.row && h.rowDrop.on4 && h.rowDrop.stayed && springIdle(h.rowDrop.st), h.rowDrop);
  const st = await legStaleRow();
  check(`⑰ r3: a title-bar drag released on a STALE row (its desktop deleted on another client) — refused by name, the window stays here, on show, reachable (${st.pointer && J(st.pointer.toast)})`, staleOk(st.pointer, st.pointer && st.pointer.name), st.pointer);
  check('⑰ r3: …a taskbar tile dropped on a stale row — the same', !!st.html5 && st.html5.dragged && staleOk(st.html5, st.html5.name), st.html5);
  const rc = await legRenameCancel();
  check('⑱ r3: a row\'s Rename… cancelled ⇒ nothing comes back — no list, no menu, no dialog, the name kept', rc.menu && rc.dialog && !rc.list && rc.menus === 0 && !rc.open && rc.name === rc.name0, rc);
  check('⑫ r3: zero page errors', pageErrors.length === 0, pageErrors.slice(0, 4));
}

// ═════════════════════════════════════════ THE RED CONTROL (1024×600) ═════════════════════════════════════════
console.log('\n═══ RED CONTROL — the base\'s rules put back (one esbuild of this tree + the base\'s CSS lines), 1024×600 ═══');
{
  mutantOn = MUTANT;
  await load(1024, 600); await closeAll(); await evalJs(`app.sidebar.toggle(true)`); await sleep(500);
  const d = await legDragOverTaskbar('RED');
  check('RED P2-1: Quad — a title bar released over the taskbar is BURIED (under 80×32 of it inside)', !reachableBar(d.after), d.after);
  check('RED P2-1: …and its tile, clicked twice, leaves it buried', !reachableBar(d.afterTiles), d.afterTiles);
  const t = await legTaskbar();
  check('RED P2-2: 15 windows — no «+N» chip, 60 px tiles, the wheel inert, 8 desktops piled as previews', !t.s0.chip && t.s0.rows.some((r) => r.w < 90) && t.s1.scroll[0] === t.s0.scroll[0] && t.s8.compact === null && t.s8.previews === 8, { chip: t.s0.chip, w: t.s0.rows.slice(0, 2), scroll: [t.s0.scroll[0], t.s1.scroll[0]], compact: t.s8.compact, previews: t.s8.previews });
  await evalJs(`(() => { const dm = app.desktopManager; for (const x of dm.desktops.slice(1)) dm.deleteDesktop(x.id); return 1; })()`).catch(() => 0); await sleep(500);
  const m = await legTitleMenu();
  check('RED P2-3: the lower-row title menu runs off the top (first row at y < 0)', !!m.m && m.m.firstTop < 0, m.m);
  const c = await legNarrowChat();
  check('RED P2-4: a 360 px chat window wraps its bar (more than one row) and a 250 px high one keeps under 45 % for messages', c.narrow.rows > 1 && c.short.share < 0.45, { narrow: c.narrow, short: c.short });
  mutantOn = null;
  // the fix, not the reload: the real bundle back, the same legs pass
  await load(1024, 600); await closeAll(); await evalJs(`app.sidebar.toggle(true)`); await sleep(500);
  const d2 = await legDragOverTaskbar('RED-back');
  const m2 = await legTitleMenu();
  const c2 = await legNarrowChat();
  check('CONTROL: the real bundle back — the same legs pass (the release reachable, the menu inside, the bar one row)', reachableBar(d2.after) && !!m2.m && m2.m.firstTop >= 0 && c2.narrow.rows === 1, { d: d2.after, m: m2.m, c: c2.narrow });
}

// ═════════════════════════════════════════ THE RED CONTROL r2 (951×585) ═════════════════════════════════════════
console.log('\n═══ RED CONTROL r2 — the round-1 rules put back (one esbuild of this tree), 951×585 ═══');
{
  mutantOn = MUTANT2;
  await load(951, 585); await closeAll(); await evalJs(`app.sidebar.toggle(true)`); await sleep(500);
  const z = await legResizeTop();
  check(`RED r2 ③: no resize release — the north edge past the top lifts the title bar out (bar ${z.after && J(z.after.bar)})`, !!z.handle && !reachableBar(z.after), z);
  const t = await legTail();
  check('RED r2 ②: the self-placed «+N» list runs past the viewport, no scroll — its last row out of reach', !!t.l0 && (!t.l0.inside || !t.l0.scrolls) && !(t.l1 && t.l1.lastHit && t.picked), t);
  const d = await legDoors(true);
  check('RED r2 ①: a row has no doors (its right-click opens no Rename…, no ⋯ to press, the name and N unchanged) and a title-bar drag held on the button springs nothing — the window stays where it was', !d.rowMenu.includes('Rename…') && !d.more && d.renamed.name === d.name0 && d.deleted.n === 8 && !d.sprang && !d.moved.on && !d.wantOrder, d);
  mutantOn = null;
}

// ═════════════════════════════════════════ THE RED CONTROL r3 (951×585) ═════════════════════════════════════════
console.log('\n═══ RED CONTROL r3 — round 2\'s rules put back (one esbuild of this tree), 951×585 ═══');
{
  mutantOn = MUTANT3;
  await load(951, 585); await closeAll(); await evalJs(`app.sidebar.toggle(true)`); await sleep(500);
  const h = await legSpringHtml5();
  check('RED r3 ①: the HTML5 road never ends the spring — the list springs AFTER a cancelled pass, stays after a drop away, and a row drop orphans its ref', !!h.passCancel && h.passCancel.some((x) => x.list) && !!h.holdAway && h.holdAway.after.list && !!h.rowDrop && h.rowDrop.st.ref && !h.rowDrop.st.refLive, h);
  const st = await legStaleRow();
  check('RED r3 ③: a stale row moves the window under the gone desktop\'s id — off every desktop, hidden', !!st.pointer && !st.pointer.known && st.pointer.hidden, st);
  const rc = await legRenameCancel();
  check('RED r3 ④: a cancelled Rename… brings the list back', rc.dialog && rc.list, rc);
  mutantOn = null;
}

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed) — shots in ${SHOTS}`);
process.exit(fail ? 1 : 0);
