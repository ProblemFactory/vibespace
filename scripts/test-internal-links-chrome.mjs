#!/usr/bin/env node
// lane login-request-card piece 1 (the design's «Internal links») — THE PRESSES in the real product: a scratch hub of THIS tree
// (sign-in off, its own data/ and HOME, a stub claude), headless Chrome, the page in zh. An agent's reply carries links to five
// conversations and a desktop; each press does what the table says and only navigates: a built window on another desktop → that
// desktop, its window flashed; running with no window → it opens on the desktop on show and a toast names it; ENDED with no
// window → «在这里恢复» · «查看历史记录» at the link (the history opens read-only, NO process starts); ENDED with a window → that window;
// archived → a toast naming the archived list; a desktop → switch; after a reload the row on a desktop not built yet → switch
// there and it is built; right-click → «前往» · «复制链接»; a key the page lacks is the unknown chip. Pictures under VS_ILINK_SHOTS.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, stillPresser } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = [process.env.VS_CHROME, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('SKIP: no chrome/chromium'); process.exit(0); }
const SHOTS = process.env.VS_ILINK_SHOTS || '';
const VNC_ENV = await vncEnv();
const [PORT, CDP_PORT] = await freePorts(2);
const BASE = `http://127.0.0.1:${PORT}`;
const wt = scratch('ilinks-wt'), PROFILE = scratch('ilinks-chrome'), fakeHome = scratch('ilinks-home'), stubDir = scratch('ilinks-stub');
for (const d of [fakeHome, stubDir]) fs.mkdirSync(d, { recursive: true });
const CWD = path.join(fakeHome, 'project'); fs.mkdirSync(CWD, { recursive: true });
let failed = 0, passed = 0;
const PAGE_ERRORS = [];
const check = (n, c, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); if (PAGE_ERRORS.length) console.error('    page errors: ' + PAGE_ERRORS.slice(-3).join(' | ')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// two ENDED conversations the hub discovers from their transcripts (src/fixture-guard.js hides /tmp/vs-* project dirs and the e2e ids:
// a path that never exists under /opt, a non-fixture id, in the scratch HOME only — the test-record-clear-ui precedent)
const CONV = `/opt/ilinks-conv-${process.pid}`;
const SID_D = '5e551000-0000-4000-8000-00000000d0d0', SID_E = '5e551000-0000-4000-8000-00000000e0e0', SID_X = '5e551000-0000-4000-8000-000000000bad';
for (const [sid, folder, first] of [[SID_D, 'ended', 'Ended conversation D'], [SID_E, 'archived', 'Archived conversation E']]) {
  const dir = path.join(fakeHome, '.claude', 'projects', `${CONV}/${folder}`.replace(/[/._]/g, '-')); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sid}.jsonl`), JSON.stringify({ type: 'user', cwd: `${CONV}/${folder}`, sessionId: sid, uuid: `u0000000-0000-4000-8000-${sid.slice(-12)}`, timestamp: '2026-11-16T12:00:00.000Z', message: { role: 'user', content: first } }) + '\n'
    + JSON.stringify({ type: 'assistant', cwd: `${CONV}/${folder}`, sessionId: sid, uuid: `a0000000-0000-4000-8000-${sid.slice(-12)}`, timestamp: '2026-11-16T12:00:01.000Z', message: { id: 'msg_' + folder, type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text: 'Done.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } }) + '\n');
}

try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json', 'data/bin', 'docs/agent']) execSync(`rm -rf ${wt}/${f} && mkdir -p ${path.dirname(`${wt}/${f}`)} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
// a stub claude: each process its own id (written beside its pid); the FIRST user line is answered with the words in reply.txt
const stubPath = path.join(stubDir, 'claude');
fs.writeFileSync(stubPath, `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('2.1.281 (Claude Code) stub'); process.exit(0); }
if (args.includes('--help')) { console.log('Usage: claude [options]'); process.exit(0); }
const SID = '5e551000-0000-4000-8000-' + String(process.pid).padStart(12, '0');
fs.writeFileSync(${JSON.stringify(stubDir)} + '/env-' + process.pid + '.json', JSON.stringify({ sid: SID, at: Date.now(), args }));
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ type: 'system', subtype: 'init', model: 'claude-fable-5', cwd: process.cwd(), tools: ['Bash'], permissionMode: 'default', claude_code_version: '2.1.281', session_id: SID, uuid: 'u-' + process.pid });
let answered = false, buf = '';
process.stdin.on('data', (d) => { buf += d; if (answered || !/"type":"user"/.test(buf)) return; answered = true;
  const text = fs.readFileSync(${JSON.stringify(stubDir)} + '/reply.txt', 'utf8');
  out({ type: 'assistant', message: { id: 'msg_il1', type: 'message', role: 'assistant', model: 'claude-fable-5', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }, session_id: SID });
  out({ type: 'result', subtype: 'success', is_error: false, result: text, session_id: SID, duration_ms: 1, num_turns: 1, usage: { input_tokens: 1, output_tokens: 1 } });
});
process.stdin.on('end', () => process.exit(0));
`, { mode: 0o755 });
const stubRuns = () => fs.readdirSync(stubDir).filter((x) => x.startsWith('env-')).map((f) => JSON.parse(fs.readFileSync(path.join(stubDir, f), 'utf8')));
const LOG = path.join(stubDir, 'server.log');
const fd = fs.openSync(LOG, 'a');
const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, CLAUDE_CMD: stubPath, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', fd, fd] });
fs.closeSync(fd);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--password-store=basic', '--use-mock-keychain',
  '--window-size=1280,800', '--disable-background-timer-throttling', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore' });
let cleaned = false;
const cleanup = () => {
  if (cleaned) return; cleaned = true;
  try { chrome.kill('SIGKILL'); } catch { }
  try { srv.kill('SIGKILL'); } catch { }
  for (const r of [wt, fakeHome, stubDir]) { try { endRootedProcesses(r); } catch { } }
  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
  for (const d of [wt, PROFILE, fakeHome, stubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
for (let i = 0; i < 240; i++) { try { const r = await fetch(`${BASE}/api/home`); if (r.status < 500) break; } catch { } await sleep(250); }

const WebSocket = require('ws');
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch { await sleep(250); } }
if (!target) { console.error('  ✗ boot: no chrome page'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.on('open', r));
let seq = 0; const pend = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') PAGE_ERRORS.push(String((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text).slice(0, 600)); });
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const until = async (expr, { timeout = 15000, step = 120 } = {}) => { const t0 = Date.now(); for (;;) { let v = null; try { v = await evalJs(expr); } catch { } if (v) return v; if (Date.now() - t0 > timeout) return v; await sleep(step); } };
const still = stillPresser({ evalJs, cdp, log: (l) => console.error(l) });
const VISIBLE = `(e) => (e.checkVisibility ? e.checkVisibility({ checkVisibilityCSS: true }) : true)`;
const press = async (sel) => {
  await evalJs(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(${VISIBLE}).pop(); if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
  await sleep(150);
  const ok = await still(`JS:[...document.querySelectorAll(${JSON.stringify(sel)})].filter(${VISIBLE}).pop()`);
  await sleep(300); return ok;
};
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(r.data, 'base64')); console.log(`    · picture ${name}.png`); };
const linkSel = (key) => `.chat-vs-link[data-vs-ref="claude:${key}"]`;
let A_SID = null;
/** the talker's window (A — the links are in its chat) in front on the desktop on show: a window a press opened (C, D's history) lands ON TOP of it
 *  (the first claim, 2026-11-17: five presses «covered» by C's window) */
const frontA = async () => {
  // a menu left open by an earlier step closes the person's way (Escape); A's window — by its conversation, whatever its desktop tag — is
  // REVEALED through the go-to door (goToWinId raises it; the second claim's try 1 found wm.focusWindow a no-op while the page still
  // counted A as focused, C's window over A's chat)
  await evalJs(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); const ws = [...app.sessions.keys()].filter((k) => app.wm.windows.get(k)?._openSpec?.backendSessionId === ${JSON.stringify(A_SID)}); const dm = app.desktopManager; const w = ws.find((k) => (app.wm.windows.get(k)._desktopId || dm.activeDesktopId) === dm.activeDesktopId) || ws[0]; if (w) app.goToWinId(w); return !!w; })()`);
  await sleep(400);
};
/** a press on a link in A's chat: A in front, then the link ITSELF under the still door's point (the rect's centre) before the press */
const pressLink = async (sel) => {
  await frontA();
  await until(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(${VISIBLE}).pop(); if (!e) return false; e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); const h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return !!h && (h === e || e.contains(h)); })()`, { timeout: 4000 });
  return press(sel);
};
const active = () => evalJs('app.desktopManager.activeDesktopId');
const winsOf = (sid) => evalJs(`[...app.sessions.keys()].filter((w) => { const s = app.wm.windows.get(w)?._openSpec; return s && s.backendSessionId === ${JSON.stringify(sid)}; }).map((w) => ({ w, desk: app.wm.windows.get(w)._desktopId || null }))`);
const toasts = () => evalJs(`[...document.querySelectorAll('.global-toast, .toast')].map((t) => t.textContent.trim())`);
const menuLabels = () => evalJs(`[...document.querySelectorAll('.context-menu')].filter(${VISIBLE}).pop() ? [...[...document.querySelectorAll('.context-menu')].filter(${VISIBLE}).pop().querySelectorAll('.context-menu-item, [role=menuitem], .ctx-item')].map((i) => i.textContent.trim()).filter(Boolean) : []`);

try {
  console.log('① a scratch hub of this tree, the page in zh: three live conversations, two ended ones, two desktops');
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE });
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vibespace.lang', 'zh'); } catch { }" });
  await cdp('Page.navigate', { url: BASE });
  check('the app loads', !!(await until(`!!(window.app && app.wm && app.desktopManager && app.desktopManager.desktops.length)`, { timeout: 40000 })));
  await until(`!document.getElementById('loading-screen')`, { timeout: 30000 });
  const ws0 = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: BASE } });
  await new Promise((r, j) => { ws0.on('open', r); ws0.on('error', j); });
  const frames0 = []; ws0.on('message', (d) => { try { frames0.push(JSON.parse(String(d))); } catch { } });
  const create = async (name, reqId) => {
    const before = stubRuns().length;
    ws0.send(JSON.stringify({ type: 'create', backend: 'claude', mode: 'chat', cwd: CWD, reqId, sessionName: name }));
    for (let i = 0; i < 120 && stubRuns().length === before; i++) await sleep(250);
    for (let i = 0; i < 80 && !frames0.find((m) => m && m.type === 'created' && m.reqId === reqId); i++) await sleep(100);
    const run = stubRuns().sort((a, b) => b.at - a.at)[0];
    return { sid: run && run.sid, srv: (frames0.find((m) => m && m.type === 'created' && m.reqId === reqId) || {}).sessionId };
  };
  const B = await create('Links B', 'b'), C = await create('Links C', 'c'), A = await create('Links A', 'a');
  A_SID = A.sid;
  check('three live conversations through the real spawn path, each with its own id', !!(B.sid && C.sid && A.sid && B.srv && C.srv && A.srv) && new Set([B.sid, C.sid, A.sid]).size === 3, { B, C, A });
  const D1 = await active();
  const D2 = await evalJs(`(async () => { const id = app.desktopManager.createDesktop('Desktop 2'); return typeof id === 'string' ? id : (app.desktopManager.desktops.at(-1) || {}).id; })()`);
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(D2)})`);
  await evalJs(`(() => { app.attachSession(${JSON.stringify(B.srv)}, 'Links B', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  check('B\'s window is built on Desktop 2', !!(await until(`([...app.sessions.keys()].some((w) => app.wm.windows.get(w)?._openSpec?.backendSessionId === ${JSON.stringify(B.sid)}))`, { timeout: 15000 })));
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(D1)})`);
  await evalJs(`(() => { app.attachSession(${JSON.stringify(A.srv)}, 'Links A', ${JSON.stringify(CWD)}, { mode: 'chat', backend: 'claude' }); return true; })()`);
  check('the sidebar knows all five (three live, two ended from their transcripts)', !!(await until(`(() => { const s = app.sidebar._allSessions || []; const has = (id) => s.some((r) => (r.backendSessionId || r.sessionId) === id); return [${[B.sid, C.sid, A.sid, SID_D, SID_E].map((x) => JSON.stringify(x)).join(',')}].every(has); })()`, { timeout: 30000 })),
    await evalJs(`(app.sidebar._allSessions || []).map((r) => [r.backendSessionId || r.sessionId, r.status])`));
  await evalJs(`(() => { const r = app.sidebar._allSessions.find((x) => (x.backendSessionId || x.sessionId) === ${JSON.stringify(SID_E)}); app.sidebar.toggleArchive(r); return app.sidebar.isArchived(r); })()`);
  check('E is archived (the person\'s own act, set up here)', await evalJs(`app.sidebar.isArchived(app.sidebar._allSessions.find((x) => (x.backendSessionId || x.sessionId) === ${JSON.stringify(SID_E)}))`) === true);
  fs.writeFileSync(path.join(stubDir, 'reply.txt'), [
    `打开 [B 的窗口](vibespace://conversation/claude:${B.sid})，`,
    `或者 vibespace://conversation/claude:${C.sid}，`,
    `[已结束的 D](vibespace://conversation/claude:${SID_D})，`,
    `[归档的 E](vibespace://conversation/claude:${SID_E})，`,
    `[第二个桌面](vibespace://desktop/${D2})，`,
    `以及 vibespace://conversation/claude:${SID_X}。`,
  ].join('\n\n'));
  ws0.send(JSON.stringify({ type: 'chat-input', sessionId: A.srv, text: 'where are they?', msgId: 'm-il-1' }));
  check('A\'s answer draws five links and one unknown chip', !!(await until(`document.querySelectorAll('.chat-vs-link').length >= 5 && !!document.querySelector('.vs-link-unknown')`, { timeout: 20000 })),
    await evalJs(`document.querySelectorAll('.chat-vs-link').length`));
  await shot('zh-links-drawn');

  console.log('② the drawing: an icon, the real name muted, the unknown chip not pressable');
  const drawn = await evalJs(`(() => { const b = document.querySelector(${JSON.stringify(linkSel(B.sid))}); const u = document.querySelector('.vs-link-unknown'); const d = document.querySelector('.chat-vs-link[data-vs-kind=desktop]');
    return { bIcon: !!(b && b.querySelector('.vs-link-icon svg')), bName: b && b.querySelector('.vs-link-name') ? b.querySelector('.vs-link-name').textContent : null, dName: d && d.querySelector('.vs-link-name') ? d.querySelector('.vs-link-name').textContent : null,
      chip: u ? u.querySelector('.vs-link-chip').textContent : null, chipPressable: !!(u && (u.closest('.chat-link') || u.dataset.vsRef)) }; })()`);
  check('B\'s link: an SVG icon, its real name «Links B» after the label that lacks it; the desktop\'s «Desktop 2»', drawn.bIcon && drawn.bName === 'Links B' && drawn.dName === 'Desktop 2', drawn);
  check('the key no row has: the chip «未知对话», nothing to press', drawn.chip === '未知对话' && drawn.chipPressable === false, drawn);
  const bare = await evalJs(`(() => { const c = document.querySelector(${JSON.stringify(linkSel(C.sid))}); return { c: c ? c.textContent.trim() : null, cIcon: !!(c && c.querySelector('.vs-link-icon svg')), addresses: [...document.querySelectorAll('.chat-vs-link')].filter((e) => /vibespace:/.test(e.textContent)).length }; })()`);
  check('a BARE link (C, written as its address) reads as its real name «Links C» with its icon — no drawn link shows an address (主开发\'s look)', bare.c === 'Links C' && bare.cIcon && bare.addresses === 0, bare);

  console.log('③ the presses — each only navigates');
  const runs0 = stubRuns().length;
  check('a desktop link: a real press switches to it', (await pressLink(`.chat-vs-link[data-vs-kind=desktop]`)) === true && (await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D2)}`, { timeout: 8000 })) === true);
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(D1)})`); await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D1)}`);
  check('B (a built window on Desktop 2): the press switches there and flashes B\'s window', (await pressLink(linkSel(B.sid))) === true
    && !!(await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D2)} && [...app.sessions.keys()].some((w) => { const win = app.wm.windows.get(w); return win?._openSpec?.backendSessionId === ${JSON.stringify(B.sid)} && (win.element.classList.contains('window-find-flash') || (win._tabChain && app.wm.windows.get(win._tabChain.tabs[0])?.element.classList.contains('window-find-flash'))); })`, { timeout: 8000 })));
  await shot('zh-press-built-window');
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(D1)})`); await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D1)}`);
  check('C (running, no window): the press opens it on the desktop on show', (await pressLink(linkSel(C.sid))) === true && !!(await until(`[...app.sessions.keys()].some((w) => app.wm.windows.get(w)?._openSpec?.backendSessionId === ${JSON.stringify(C.sid)} || app.sessions.get(w)?.sessionId === ${JSON.stringify(C.srv)})`, { timeout: 10000 })) && (await active()) === D1);
  check('…and a toast says which desktop', !!(await until(`[...document.querySelectorAll('.global-toast, .toast')].some((t) => /已在 .+ 打开——它之前没有窗口。/.test(t.textContent))`, { timeout: 5000 })), await toasts());
  await shot('zh-press-opened-toast');
  check('D (ended, no window): the press opens «在这里恢复» · «查看历史记录» at the link — nothing started', (await pressLink(linkSel(SID_D))) === true && JSON.stringify(await (async () => { for (let i = 0; i < 30; i++) { const l = await menuLabels(); if (l.length) return l; await sleep(100); } return menuLabels(); })()) === JSON.stringify(['在这里恢复', '查看历史记录']) && stubRuns().length === runs0,
    { menu: await menuLabels(), runs: stubRuns().length - runs0 });
  await shot('zh-press-ended-menu');
  check('«查看历史记录»: the history opens read-only — still no process for D', (await press(`.context-menu .context-menu-item:last-child, .context-menu [role=menuitem]:last-child`)) === true && !!(await until(`[...app.sessions.keys()].some((w) => app.wm.windows.get(w)?._openSpec?.backendSessionId === ${JSON.stringify(SID_D)})`, { timeout: 10000 })) && !stubRuns().some((r) => (r.args || []).join(' ').includes(SID_D)),
    { wins: await winsOf(SID_D) });
  const dWins = (await winsOf(SID_D)).length;
  check('D again (ENDED, with a window): the press lands on that window — one window, nothing started', (await pressLink(linkSel(SID_D))) === true && (await winsOf(SID_D)).length === dWins && !stubRuns().some((r) => (r.args || []).join(' ').includes(SID_D)));
  check('E (archived): a toast naming the archived list', (await pressLink(linkSel(SID_E))) === true && !!(await until(`[...document.querySelectorAll('.global-toast, .toast')].some((t) => t.textContent.includes('这个对话已归档——请从侧边栏的归档列表中打开。'))`, { timeout: 5000 })), await toasts());

  console.log('④ right-click / long-press: «前往» · «复制链接»');
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(D1)})`); await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D1)}`);
  await frontA();
  await evalJs(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(linkSel(B.sid))})].pop(); const r = e.getBoundingClientRect(); e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4, button: 2 })); return true; })()`);
  check('the menu says «前往» · «复制链接»', JSON.stringify(await (async () => { for (let i = 0; i < 30; i++) { const l = await menuLabels(); if (l.length) return l; await sleep(100); } return menuLabels(); })()) === JSON.stringify(['前往', '复制链接']), await menuLabels());
  check('«前往» goes (Desktop 2, B)', (await press(`.context-menu .context-menu-item:first-child, .context-menu [role=menuitem]:first-child`)) === true && (await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D2)}`, { timeout: 8000 })) === true);

  console.log('⑤ after a reload: B\'s row is on a desktop this page has not built — the press switches there and builds it');
  await evalJs(`app.desktopManager.switchTo(${JSON.stringify(D1)})`); await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D1)}`);
  await sleep(2500);   // the layout's own debounce writes the record
  await cdp('Page.reload');
  check('the page again, on Desktop 1', !!(await until(`!!(window.app && app.desktopManager && app.desktopManager.activeDesktopId === ${JSON.stringify(D1)} && document.querySelector(${JSON.stringify(linkSel(B.sid))}))`, { timeout: 40000 })));
  const builtBefore = (await winsOf(B.sid)).length;
  check('B has no window on this page yet (Desktop 2 not built)', builtBefore === 0, await winsOf(B.sid));
  check('the press switches to Desktop 2 and B\'s window is built there', (await pressLink(linkSel(B.sid))) === true && !!(await until(`app.desktopManager.activeDesktopId === ${JSON.stringify(D2)} && [...app.sessions.keys()].some((w) => app.wm.windows.get(w)?._openSpec?.backendSessionId === ${JSON.stringify(B.sid)})`, { timeout: 15000 })));
  check('no press started a process (only the three conversations the suite opened ran)', stubRuns().length === runs0, { runs: stubRuns().length, runs0 });
  check('the page threw nothing', PAGE_ERRORS.length === 0, PAGE_ERRORS.slice(-3));
} catch (e) { failed++; console.error('  ✗ threw:', e && e.stack || e); }
console.log(failed ? `✗ test-internal-links-chrome: ${passed} passed, ${failed} failed` : `ALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
