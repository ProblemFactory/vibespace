#!/usr/bin/env node
// THE PLACEHOLDER TILE AND THE ONE-DESKTOP RESTORE, SEEN (lane layout-stopped-window — the owner 2026-10-30 «我的个人桌面丢了很多
// 窗口»): the chrome half of scripts/test-layout-stopped-window.mjs. A worktree server of this tree (esbuild bundle) boots on a
// record shaped like 个人 after the 09:18:22 write — eleven chat windows, four naming a conversation whose session is stopped
// (no transcript on this box), seven nameless — and headless chrome over raw CDP:
//   ① a desktop page (1440×900, zh) builds ELEVEN placeholder tiles — four «会话已停止 — 点击恢复», seven «会话不可用», each
//      with its window's name, inside its window; past the 20 s grace the server's record still holds eleven (nothing dropped)
//   ② a second desktop page shows the same eleven; the first page's close of one tile reaches it LIVE (the record without it ⇒
//      it closes) and the server's record holds ten
//   ③ a phone (390×844, touch, zh and ja) shows its window on show as the tile, full screen
//   ④ the door: ⚙ → System → 恢复之前的布局… lists the 06:50 rollback point with each desktop its own button; 个人's press (and
//      its confirm) restores 个人 ALONE — twelve windows on every page after the reload (eleven placeholders + the file window),
//      工作 / 研究 as they were
// Screenshots go to $LSW_SHOTS_DIR when set (the lane's report), else nowhere.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const J = JSON.stringify;
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = scratch('lsw-ui');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const SHOTS = process.env.LSW_SHOTS_DIR ? path.resolve(process.env.LSW_SHOTS_DIR) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const procs = new Set(); const worktrees = new Set(); let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { endRootedProcesses(ROOT); } catch { }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

// ── the record (invented words; the measured shape) ──
const NAMES = ['Ledger', 'Tutor', 'Ops desk', 'Coursework', 'Trip planner', 'Van build', 'Butler', 'Colony game', 'Game monitor', 'Cluster admin', 'Quiz maker'];
const GB = (i) => ({ left: (i % 4) / 4, top: Math.floor(i / 4) / 3, width: 0.25, height: 1 / 3 });
const CID = (i) => `c0ffee${String(i).padStart(2, '0')}-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`;
const CWD = (i) => '/srv/u/proj-' + i;
const named = (i) => ({ winId: 'win-p-' + i, title: `${NAMES[i]} — ${CWD(i)}`, type: 'chat', isMinimized: false, isMaximized: false, gridBounds: GB(i), zIndex: 100 + i,
  openSpec: { action: 'attachSession', serverId: `sess-${i + 1}-17000`, backend: 'claude', backendSessionId: CID(i), sessionKey: 'claude:' + CID(i), name: 'first message ' + i, cwd: CWD(i), mode: 'chat' },
  backend: 'claude', backendSessionId: CID(i), claudeSessionId: CID(i), serverSessionId: `sess-${i + 1}-17000`, cwd: CWD(i) });
const bare = (i) => ({ winId: 'win-p-' + i, title: NAMES[i], type: 'chat', isMinimized: false, isMaximized: false, gridBounds: GB(i), zIndex: 100 + i });
const filesWin = (id, dir, gb) => ({ winId: id, title: path.basename(dir), type: 'files', isMinimized: false, isMaximized: false, gridBounds: gb, zIndex: 300, openSpec: { action: 'openFileExplorer', path: dir }, explorerPath: dir });
const META = [{ id: 'desk-p', name: '个人' }, { id: 'desk-w', name: '工作' }, { id: 'desk-r', name: '研究' }];

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — the worktree server cannot run sessions here');
else await (async () => {
  fakeHome = scratchHome('lsw-ui-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  fs.writeFileSync(path.join(BIN, 'claude'), '#!/bin/sh\nexec sleep 600\n', { mode: 0o755 }); // a claude that never answers (VS_NO_REAL_CLI)
  const PORT = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const version = JSON.parse(fs.readFileSync(path.join(wt, 'package.json'), 'utf8')).version;
  fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(version)};\n`);
  const esbuild = require('esbuild');
  await esbuild.build({ entryPoints: [path.join(wt, 'src/client.js')], bundle: true, outfile: path.join(wt, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'silent' });
  ok(fs.statSync(path.join(wt, 'public/bundle.js')).size > 500000, 'the worktree built its own bundle (esbuild JS API)');

  const dir = (n) => { const d = path.join(ROOT, 'files', n); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, n + '.txt'), n); return d; };
  const NOW = NAMES.map((_, i) => (i < 4 ? named(i) : bare(i)));
  const layouts = { current: null, autoSave: null, saved: {}, customGrids: [], desktopMeta: META.map((m) => ({ ...m })), desktops: {
    'desk-p': { autoSave: { windows: NOW, grid: null, updatedAt: 1000 } },
    'desk-w': { autoSave: { windows: [filesWin('w-1', dir('w1'), GB(0)), filesWin('w-2', dir('w2'), GB(1))], grid: null, updatedAt: 1000 } },
    'desk-r': { autoSave: { windows: [filesWin('r-1', dir('r1'), GB(0))], grid: null, updatedAt: 1000 } } } };
  // the 06:50 rollback point: 个人 TWELVE (eleven named + a file window), 工作 three
  const point = JSON.parse(J(layouts));
  point.desktops['desk-p'].autoSave.windows = [...NAMES.map((_, i) => named(i)), filesWin('win-p-files', dir('p-files'), GB(11))];
  point.desktops['desk-w'].autoSave.windows.push(filesWin('w-3', dir('w3'), GB(2)));
  const POINT = 'layout-2026-10-30T06-50-53-927Z-1h.json', SUMMARY = { 个人: 12, 工作: 3, 研究: 1 };
  fs.rmSync(path.join(wt, 'data'), { recursive: true, force: true }); fs.mkdirSync(path.join(wt, 'data', 'layout-history'), { recursive: true });
  fs.writeFileSync(path.join(wt, 'data', 'layouts.json'), J(layouts, null, 1));
  fs.writeFileSync(path.join(wt, 'data', 'layout-history', POINT), J({ at: 1793343053927, summary: SUMMARY, totalWindows: 16, change: [['个人', 12, 11]], layouts: point }));
  fs.writeFileSync(path.join(wt, 'data', 'layout-history', POINT.replace(/\.json$/, '.meta.json')), J({ at: 1793343053927, summary: SUMMARY, totalWindows: 16, change: [['个人', 12, 11]] }));
  let journal = '';
  const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 60000, 100), 'the worktree server booted', journal.slice(-800))) return;
  const api = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();

  // ── headless chrome over raw CDP ──
  const CDP = await freePort();
  const xdg = fs.mkdtempSync(path.join(ROOT, 'xdg-')); fs.chmodSync(xdg, 0o700);
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--window-size=1440,900', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: 'ignore', env: { PATH: process.env.PATH, HOME: fakeHome, XDG_RUNTIME_DIR: xdg } });
  procs.add(ch);
  const pages = async () => { try { return (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).filter((t) => t.type === 'page'); } catch { return []; } };
  let first = null; for (let i = 0; i < 120 && !first; i++) { first = (await pages())[0]; if (!first) await sleep(250); }
  if (!ok(!!first, 'chrome exposed a CDP page target')) return;
  const client = async (wsUrl, { lang = 'zh', phone = false } = {}) => {
    const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r, e) => { sock.on('open', r); sock.on('error', e); });
    let seq = 0; const pend = new Map();
    sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(J({ id, method, params })); });
    const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', ${J(lang)}); } catch {}` });
    if (phone) { await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
    else await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const X = { send, ev, close: () => { try { sock.close(); } catch { } } };
    X.boot = async () => {
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      const up = await until(async () => { try { return await ev('!!(window.app && window.app.desktopManager && window.app.desktopManager.activeDesktopId)'); } catch { return false; } }, 30000, 200);
      if (up) await ev('window.app.ready');
      return up;
    };
    X.tiles = () => ev(`[...document.querySelectorAll('.session-placeholder')].map((t) => { const w = t.closest('.window'), r = t.getBoundingClientRect(), wr = w ? w.getBoundingClientRect() : null; return { kind: t.dataset.placeholder, name: t.querySelector('.session-placeholder-name')?.textContent || '', say: t.querySelector('.session-placeholder-say')?.textContent || '', tag: t.tagName, id: w ? [...app.wm.windows.values()].find((x) => x.element === w)?.id : null, w: Math.round(r.width), h: Math.round(r.height), inside: !!wr && r.left >= wr.left - 1 && r.right <= wr.right + 1 && r.top >= wr.top - 1 && r.bottom <= wr.bottom + 1, shown: r.width > 0 && r.height > 0 && getComputedStyle(w).visibility !== 'hidden' }; })`);
    X.shot = async (name) => { if (!SHOTS) return null; await until(() => ev("(() => { const s = document.getElementById('loading-screen'); if (!s || !s.isConnected) return true; const c = getComputedStyle(s); return c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05; })()").catch(() => true), 20000, 200); await sleep(300); const r = await send('Page.captureScreenshot', { format: 'png' }); const f = path.join(SHOTS, name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
    X.click = async (expr) => { const p = await ev(`(() => { const e = ${expr}; if (!e) return null; e.scrollIntoView?.({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); if (!p) return false; for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); return true; };
    return X;
  };
  const newPage = async (opts) => { const { targetId } = await P1.send('Target.createTarget', { url: 'about:blank', newWindow: true }); let pt = null; for (let i = 0; i < 40 && !pt; i++) { pt = (await pages()).find((t) => t.id === targetId); if (!pt) await sleep(150); } return pt ? client(pt.webSocketDebuggerUrl, opts) : null; };
  const P1 = await client(first.webSocketDebuggerUrl, { lang: 'zh' });
  let P2 = null, PH = null, PJ = null;
  try {
    // ① the desktop page
    const want = (X, n) => until(async () => (await X.tiles()).length === n, 20000, 200);
    ok(await P1.boot() && await want(P1, 11), '① the desktop page (zh) booted on 个人 and built ELEVEN placeholder tiles (2.369.363: none — the record\'s eleven were unbuildable)', await P1.tiles().catch((e) => e.message));
    const t1 = await P1.tiles();
    const stopped = t1.filter((t) => t.kind === 'stopped'), gone = t1.filter((t) => t.kind === 'unavailable');
    ok(stopped.length === 4 && gone.length === 7 && stopped.every((t) => t.say === '会话已停止 — 点击恢复' && t.tag === 'BUTTON') && gone.every((t) => t.say === '会话不可用' && t.tag === 'DIV'), `① four «会话已停止 — 点击恢复» (buttons) + seven «会话不可用» (${stopped.length} + ${gone.length})`, t1.map((t) => [t.kind, t.say]));
    ok(t1.every((t) => NAMES.includes(t.name) && t.inside && t.shown && t.w >= 120 && t.h >= 60), '① each tile says its window\'s NAME (the title\'s, not the first message) and sits inside its window, drawn (≥ 120×60)', t1.map((t) => [t.name, t.w, t.h, t.inside, t.shown]));
    await P1.shot('desktop-zh-1440');
    // the grace: nothing dropped
    await sleep(22000);
    await P1.ev('(async () => { const lm = app.layoutManager; lm._userDirty = true; lm._lastUserInputAt = Date.now(); lm._lastSentJson = null; await lm._doAutoSave(); return true; })()');
    await sleep(1500);
    const rec1 = (await api('/api/layouts')).desktops['desk-p'].autoSave.windows;
    ok(rec1.length === 11 && rec1.filter((w) => w.backendSessionId).length === 4, `① past the 20 s grace (and a save) the server's 个人 still holds ELEVEN — none dropped as 'unbuilt' (${rec1.length})`, rec1.map((w) => w.winId));
    // ② a second desktop page; a close on the first reaches it live
    P2 = await newPage({ lang: 'zh' });
    ok(!!P2 && await P2.boot() && await want(P2, 11), '② a second desktop page shows the same eleven placeholders');
    const target = gone[0].id;
    ok(await P1.click(`app.wm.windows.get(${J(target)})?.element.querySelector('.win-close')`), '② the first page presses ✕ on an unavailable tile (its only door)');
    ok(await until(async () => (await api('/api/layouts')).desktops['desk-p'].autoSave.windows.length === 10, 8000), '② the server\'s record holds TEN (the person\'s close is the one way a placeholder leaves)');
    ok(await until(async () => (await P2.tiles()).length === 10 && !(await P2.tiles()).some((t) => t.id === target), 8000), '② …and the second page\'s tile closed LIVE (the record without it ⇒ it closes there) — its four «stopped» tiles stay tiles (the record\'s same dead attach is no new recipe)', await P2.tiles());
    await P2.shot('desktop2-zh-after-close');
    // ③ the phone
    PH = await newPage({ lang: 'zh', phone: true });
    ok(!!PH && await PH.boot() && await until(async () => (await PH.ev('app.isMobile')) && (await PH.tiles()).some((t) => t.shown), 20000, 200), '③ a phone (390×844, touch, zh) booted as a phone and shows its window on show as a placeholder tile');
    const ph = (await PH.tiles()).filter((t) => t.shown);
    ok(ph.length >= 1 && ph[0].w >= 300 && ph[0].h >= 300 && ph[0].inside && ['会话已停止 — 点击恢复', '会话不可用'].includes(ph[0].say), '③ the phone\'s tile fills its window (≥ 300×300), words in zh', ph);
    await PH.shot('phone-zh-390');
    PJ = await newPage({ lang: 'ja', phone: true });
    ok(!!PJ && await PJ.boot() && await until(async () => (await PJ.tiles()).some((t) => t.shown && ['セッションは停止しています — クリックで再開', 'セッションを利用できません'].includes(t.say)), 20000, 200), '③ …and in ja (セッションは停止しています — クリックで再開 / セッションを利用できません)', await PJ.tiles().catch(() => []));
    await PJ.shot('phone-ja-390');
    PH.close(); PJ.close();
    // ④ the door
    await P1.ev('app._showLayoutHistory()');
    const deskBtn = `.lh-desk[data-id="${POINT}"][data-desk="个人"]`; // THE 06:50 row's 个人 (the close above wrote a newer point — its row comes first)
    ok(await until(() => P1.ev(`!!document.querySelector('${deskBtn}')`), 8000), '④ ⚙ → System → 恢复之前的布局… lists the 06:50 point with each desktop its own button (个人 / 工作 / 研究)', await P1.ev(`[...document.querySelectorAll('.lh-desk')].map((b) => b.textContent)`).catch(() => null));
    const deskWords = await P1.ev(`[...document.querySelectorAll('.lh-desk')].map((b) => [b.textContent, b.title])`);
    const w0650 = await P1.ev(`(() => { const b = document.querySelector('${deskBtn}'); return b ? [b.textContent, b.title] : null; })()`);
    ok(w0650 && /^个人 12/.test(w0650[0]) && w0650[1] === '只恢复「个人」', '④ the 06:50 row\'s button says the desktop and its count («个人 12 …»), its title «只恢复「个人」»', { w0650, all: deskWords });
    await P1.shot('dialog-zh');
    ok(await P1.click(`document.querySelector('${deskBtn}')`) && await until(() => P1.ev(`[...document.querySelectorAll('button')].some((b) => b.textContent === '只恢复「个人」')`), 5000), '④ the press asks first: «只恢复「个人」…？» (the other desktops stay as they are now)');
    await P1.shot('confirm-zh');
    const reloads = (X) => X.ev('window.__lswMark = 1; true');
    await reloads(P1); await reloads(P2);
    ok(await P1.click(`[...document.querySelectorAll('button')].find((b) => b.textContent === '只恢复「个人」')`), '④ the confirm is pressed');
    ok(await until(async () => (await api('/api/layouts')).desktops['desk-p'].autoSave.windows.length === 12, 8000), '④ the server\'s 个人 is the point\'s TWELVE', (await api('/api/layouts')).desktops['desk-p'].autoSave.windows.map((w) => w.winId));
    const after = await api('/api/layouts');
    ok(after.desktops['desk-w'].autoSave.windows.length === 2 && after.desktops['desk-r'].autoSave.windows.length === 1, '④ …工作 and 研究 as they are NOW (2 / 1 — the point held 工作 three)', { w: after.desktops['desk-w'].autoSave.windows.length, r: after.desktops['desk-r'].autoSave.windows.length });
    const reloaded = (X) => until(async () => { try { return (await X.ev('window.__lswMark === undefined && !!(window.app && app.desktopManager && app.desktopManager.activeDesktopId)')); } catch { return false; } }, 20000, 250);
    ok(await reloaded(P1) && await reloaded(P2), '④ both pages reloaded (layout-restored is broadcast to every client)');
    const built = (X) => until(async () => (await X.ev(`${J(point.desktops['desk-p'].autoSave.windows.map((w) => w.winId))}.filter((id) => app.wm.windows.has(id)).length`)) === 12 && (await X.tiles()).length === 11, 20000, 250);
    ok(await built(P1) && await built(P2), '④ on a hub whose sessions are stopped the restored 个人 shows TWELVE windows on both pages — eleven placeholders + the file window, not 0');
    await P1.shot('restored-zh-1440');
  } finally { P1.close(); if (P2) P2.close(); }
})();

console.log(`\n${fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`}${skipped ? ` (${skipped} skipped)` : ''}`);
process.exit(fail ? 1 : 0);
