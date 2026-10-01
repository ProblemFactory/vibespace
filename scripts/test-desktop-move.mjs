#!/usr/bin/env node
// MOVING A WINDOW ONTO A DESKTOP THE PAGE HAS NOT BUILT KEEPS THAT DESKTOP'S WINDOWS — inc-mun7qjmw-iksh (userW,
// 2026-09-29 21:52Z, 2.369.196; present on 2.369.198): he dragged a window from desktop Fin by its title bar onto the
// taskbar preview of desktop HR, a desktop he had not opened since the page loaded, then clicked HR: only the moved
// window was there, and 5.5 s later the autosave REPLACED HR's server record — HR 3 → 1, recoverable only through a
// layout rollback point. Mechanism: the page builds a desktop's windows on its first visit; the drop rebuilt HR's
// cached record from the windows the page had built there (the moved one) and the switch + autosave carried it to disk.
//
// Heavy (a worktree server under /tmp/vs-dmove-<pid> with its own data/, headless chrome at userW's 1571×905, real
// CDP input; SKIPs without chrome; the resume leg SKIPs without dtach):
//   A  THE INCIDENT, the fix: Fin 1 window + HR 3 (never opened), the page boots on Fin; a REAL title-bar drag onto
//      HR's preview ⇒ the preview draws 4; the page's outgoing layout-sync (CDP webSocketFrameSent) carries HR with 4
//      windows and Fin with 0; the server's record of HR = 4 BEFORE any switch; a real click on HR's preview ⇒ 4
//      windows shown; a real drag there (the autosave) ⇒ the server still 4; a reload ⇒ HR shows 4; the rollback
//      point that the move wrote reads "Then: … HR 3 → 4" and no point reads HR 3 → 1
//   B  CONTROL visited first (HR opened once, back to Fin, then the same drag) ⇒ the same 4 (what 2.369.198 got right)
//   C  THE MENU: a real right-click on the title bar → "Move to Desktop ▸" → "HR" ⇒ the server's HR = 4, then 4 shown
//   D  RESUME PLACEMENT (no gesture): a conversation resumed onto HR (a shell session, winBounds naming HR and the old
//      never-opened entry it replaces) ⇒ HR keeps its 3 windows + the new one, the old entry gone, 4 shown
//   E  THE SERVER BELT: a FORGED layout-sync (a raw socket) that drops HR's 3 windows ⇒ `layout-sync-refused` to the
//      sender WITH the record kept, the record unchanged on disk, nothing broadcast to another socket, the journal
//      names it; CONTROL the same shrink carrying a close for each window ⇒ accepted and broadcast
//   F  THE BELT CATCHES THE NEXT WRITER: the 2.369.198 cache rebuild re-installed on the live page, the incident's
//      gesture ⇒ the server REFUSES the shrinking write, the page reconciles (HR's 3 windows opened beside the moved
//      one, a toast), the server's HR never falls below 3 and ends at 4
//   G  TWO PAGES (verify r1 D4): B holds a drag on HR while A drops fin-1 onto HR — A's burst (HR, Fin, Fin) lands
//      under B's pointer; B's release + save keep the moved window on the server, B shows it, A keeps it, the belt
//      never fires (the lane's ①: one deferred slot kept only the last record, B's save dropped the window, A closed
//      it — gone everywhere in 4 s); then B moves it back while A shows Fin ⇒ A shows it (a remote move applied as
//      a move, never a close)
//   H  A RECONNECT (verify r1 D2): B's socket cut for 2 s while A opens a window on HR; B reconnects, re-reads the
//      layout, its next save keeps A's window and B shows it (the lane's ①: wiped — one window is below the belt)
//   E+ THE ARRIVALS (verify r1): a window one socket added is not dropped unexplained by ANOTHER socket, even one
//   E⑦ NO ORPHAN RECORD (verify r2): a write for a desktop deleted meanwhile lands nowhere; the sender is told with the meta
//   I  DELETING THE DESKTOP ON SHOW (verify r1 D1): HR opened, deleted from HR ⇒ the server's Fin holds all 4 within
//      seconds with NO further input, a reload shows 4 (the lane's ①: Fin 1 on the server, HR gone — the 3 windows
//      lived only in the page until the next input)
//   J  THE HELD MOVE (verify r2): B drags fin-2 onto HR's preview while A's save of Fin (still listing fin-2) lands
//      under B's pointer ⇒ B keeps fin-2 on HR, the server holds the move, A learns of it (r1: the record deferred
//      under the drag re-adopted fin-2 onto Fin at the pointerup and the apply's dirty clear swallowed the move's
//      save — back on Fin on both pages, the server never told, no toast)
//   K  A HIDDEN DESKTOP'S TAB GROUP (verify r2): B groups two HR windows, shows Fin; A saves Fin ⇒ B's HR group is
//      intact and B's next save of HR still carries it (before: every save of the desktop on show by another client
//      broke every group on the page's other desktops, and the page's next save of that desktop wrote the break)
//   L  A DELETE SEEN FROM ANOTHER PAGE (verify r2 ④): A, on X, deletes X — its neighbour HR takes the windows; B (X
//      built, hidden) moves x-1 to HR, hidden, and its save of Fin never writes it under Fin; A keeps x-1 on HR
//      (before: every other page sent a deleted desktop's windows to the FIRST desktop, shown, wrote them there on its
//      next save — a second record on the server — and the deleter then watched them jump from its target to #1)
//   M  THE HELD GEOMETRY (verify r2 ⑩): B drags hr-2 on HR while A's save of HR lands under B's pointer ⇒ B's window
//      stays where B dropped it, the server holds that place, A follows (before: guard 3 applied the deferred record at
//   N  verify r3 ①: B PRESSES hr-2's title bar (no drag) while A moves hr-2 ⇒ B shows A's box (a click holds no geometry)
//   O  verify r4 ③: B maximizes by the □ / snaps by Ctrl+\ ← in the second after A's record landed; a record deferred under
//      it no longer undoes the act (the doors stamp the geometry witness) and B's deferred save carries it to the server
//   P  verify r5 ③: B clicks the toolbar's two-column preset 150 ms into another client's cooldown; a record deferred under it
//      no longer puts every window back (a preset stamps the witness on every window it places); the server gets the columns
//   R  verify r5 ②: B merges hr-3 into hr-1 by a real icon drag 150 ms into another client's cooldown; a record deferred under it
//      no longer dissolves the group (a merge / split / tear-off stamps the chain witness); the server's record carries the group
//   Q  verify r5 ⑤ THE ACK: B's drag leaves on a socket that looks open but the server never reads (send patched); the socket
//      dies; the reconnect's re-read keeps the drag and B RE-SENDS it (the real server's `layout-sync-ack` proven first);
//      CONTROL an old server (acks ignored): the fallback stamps at the send, the re-read reverses the drag, B never hangs
//      the pointerup — the box snapped back to where A last saw it, the drag's save was swallowed, no toast)
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePorts, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // never the machine-global :7/5901 (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 1200) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const J = JSON.stringify;
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ONLY = (process.env.DMOVE_ONLY || '').split(',').filter(Boolean); // a leg filter for a verifier's re-run (the whole suite is the gate)
const want = (id) => !ONLY.length || ONLY.includes(id);
const ROOT = scratch('dmove');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set(); const worktrees = new Set(); let fakeHome = null;
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { endRootedProcesses(ROOT); } catch { } // the shell session's dtach + wrapper the resume leg started
  if (fakeHome) { try { endRootedProcesses(fakeHome); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else await (async () => {
  fakeHome = scratchHome('dmove-home', fs);
  const wt = path.join(ROOT, 'wt');
  const [PORT, CDP] = await freePorts(2);
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  // the page legs judge THIS source, never the bundle that happened to be on disk (verify r2 ⑪: a bundle built
  // before a client fix reddened that fix's legs while the source held it — and would pass a client regression the
  // same way); the copy is built here, as test-desktop-resume-paging does (≈ 0.2 s)
  execFileSync(path.join(repo, 'node_modules', '.bin', 'esbuild'), ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify'], { cwd: wt, stdio: 'pipe' });
  const DATA = path.join(wt, 'data');
  const HIST = path.join(DATA, 'layout-history');
  // real directories for the file-explorer windows (their openSpec replays against them)
  const dir = (n) => { const d = path.join(ROOT, 'files', n); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, n + '.txt'), n); return d; };
  const W = (id, n, gb, o = {}) => ({ winId: id, title: n, type: 'files', isMinimized: false, isMaximized: false, gridBounds: gb, zIndex: 10, openSpec: { action: 'openFileExplorer', path: dir(n) }, explorerPath: dir(n), ...o });
  /** userW's shape, fresh ids per leg: Fin 1 window, HR 3 windows (+ extra HR / Fin entries, + more desktops). */
  const fixture = (tag, extraHr = [], extraFin = [], desks = []) => ({
    current: null, autoSave: null, saved: {}, customGrids: [],
    desktopMeta: [{ id: 'desk-fin', name: 'Fin' }, { id: 'desk-hr', name: 'HR' }, ...desks.map((d) => ({ id: d.id, name: d.name }))],
    desktops: {
      'desk-fin': { autoSave: { windows: [W(`win-fin-1-${tag}`, `fin-1-${tag}`, { left: 0.1, top: 0.1, width: 0.4, height: 0.4 }), ...extraFin] } },
      'desk-hr': { autoSave: { windows: [
        W(`win-hr-1-${tag}`, `hr-1-${tag}`, { left: 0, top: 0, width: 0.45, height: 0.45 }),
        W(`win-hr-2-${tag}`, `hr-2-${tag}`, { left: 0.5, top: 0, width: 0.45, height: 0.45 }),
        W(`win-hr-3-${tag}`, `hr-3-${tag}`, { left: 0, top: 0.5, width: 0.45, height: 0.45 }),
        ...extraHr,
      ] } },
      ...Object.fromEntries(desks.map((d) => [d.id, { autoSave: { windows: d.windows || [] } }])),
    },
  });
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, 'layouts.json'), J(fixture('boot'), null, 1));
  const env = { ...process.env, ...VNC_ENV, PATH: '/usr/local/bin:/usr/bin:/bin', PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', LANG: 'C.UTF-8' };
  let journal = '';
  const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
  if (!ok(await until(() => journal.includes('Ready.'), 60000), 'the worktree server booted (own data/ under ' + ROOT + ')', journal.slice(-800))) return;
  const api = async (p, o) => (await fetch(`http://127.0.0.1:${PORT}${p}`, o)).json();
  const serverIds = async (desk) => ((await api('/api/layouts')).desktops?.[desk]?.autoSave?.windows || []).map((w) => w.winId);
  /** Install a layout the way a user's restore does (the server's own write path; every page told to reload). */
  let fixN = 0;
  const install = async (layouts) => {
    const id = `layout-fixture-${++fixN}-dmove.json`;
    fs.mkdirSync(HIST, { recursive: true });
    fs.writeFileSync(path.join(HIST, id), J({ at: Date.now(), summary: {}, totalWindows: 0, layouts }));
    const r = await api(`/api/layout-history/${id}/restore`, { method: 'POST' });
    return !!r?.success;
  };

  /** The windows SHOWN on the active desktop: in the page, not hidden, a real box inside the workspace. */
  const SHOWN = `(() => [...app.wm.windows.values()].filter((w) => w._desktopId === app.desktopManager.activeDesktopId && !w._hiddenByDesktop && !w.isMinimized).filter((w) => { const cs = getComputedStyle(w.element); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = w.element.getBoundingClientRect(); return r.width > 20 && r.height > 20; }).map((w) => w.id).sort())()`;
  /** ONE headless chrome = ONE page (its own profile + CDP port), with the real-input helpers (verify r1: two pages). */
  const mkPage = async (name) => {
    const [CDPn] = name === 'p1' ? [CDP] : await freePorts(1);
    const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDPn}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--window-size=1571,905', `--user-data-dir=${path.join(ROOT, 'chrome-' + name)}`, 'about:blank'], { stdio: 'ignore' });
    procs.add(chrome);
    let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDPn}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
    if (!target) return null;
    const cdpWs = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r, e) => { cdpWs.on('open', r); cdpWs.on('error', e); });
    let seq = 0; const pend = new Map(); const framesSent = []; const framesGot = [];
    cdpWs.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
      if (m.method === 'Network.webSocketFrameSent') { try { framesSent.push(JSON.parse(m.params.response.payloadData)); } catch { } }
      if (m.method === 'Network.webSocketFrameReceived') { try { const f = JSON.parse(m.params.response.payloadData); if (f.type === 'layout-sync' || f.type === 'layout-sync-refused') framesGot.push(f); } catch { } }
    });
    const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); cdpWs.send(J({ id, method, params })); });
    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47 — before every navigation this suite makes
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1571, height: 905, deviceScaleFactor: 1, mobile: false });
    const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
    const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    const click = async (x, y) => { await mouse('mouseMoved', x, y, { buttons: 0 }); await mouse('mousePressed', x, y); await sleep(40); await mouse('mouseReleased', x, y); };
    const drag = async (x0, y0, x1, y1, steps = 20) => {
      await mouse('mouseMoved', x0, y0, { buttons: 0 }); await mouse('mousePressed', x0, y0); await sleep(60);
      for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await sleep(35); }
      await mouse('mouseMoved', x1 + 1, y1); await sleep(80); await mouse('mouseMoved', x1, y1); await sleep(120);
      await mouse('mouseReleased', x1, y1);
    };
    const rect = (sel) => ev(`(() => { const e = document.querySelector(${J(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
    const titleBar = (winId) => ev(`(() => { const w = app.wm.windows.get(${J(winId)}); if (!w) return null; const r = w.element.querySelector('.window-titlebar').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
    const previewRects = (desk) => ev(`document.querySelectorAll('.desktop-preview[data-desktop-id="${desk}"] .desktop-preview-win').length`);
    const shown = () => ev(SHOWN);
    const allWins = () => ev(`[...app.wm.windows.values()].map((w) => w.id + '@' + w._desktopId + (w._hiddenByDesktop ? '(h)' : '')).sort()`);
    const boot = async () => {
      await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      const up = await until(async () => { try { return await ev('!!(window.app && window.app.desktopManager && window.app.desktopManager.activeDesktopId)'); } catch { return false; } }, 30000, 200);
      if (up) { await ev('window.app.ready'); await sleep(6500); } // LayoutManager._restoring holds 5 s after boot
      return up;
    };
    const blank = async () => { await cdp('Page.navigate', { url: 'about:blank' }); await sleep(300); };
    const clickPreview = async (desk) => { const p = await rect(`.desktop-preview[data-desktop-id="${desk}"]`); await click(p.x, p.y); await sleep(2500); };
    const nudge = async () => { // a real drag of the active desktop's first shown window (user input ⇒ the autosave), like his at 21:52:38
      const mv = await ev(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopId === app.desktopManager.activeDesktopId && !w._hiddenByDesktop); if (!w) return null; const r = w.element.querySelector('.window-titlebar').getBoundingClientRect(); return { x: r.left + 80, y: r.top + r.height / 2 }; })()`);
      if (mv) await drag(mv.x, mv.y, mv.x + 30, mv.y + 20, 6);
      await sleep(2500);
    };
    const dropOnto = async (winId, desk) => { const tb = await titleBar(winId); const p = await rect(`.desktop-preview[data-desktop-id="${desk}"]`); await drag(tb.l + 80, tb.y, p.x, p.y); await sleep(600); };
    const wsClose = () => ev(`(() => { app.ws.ws.close(); return true; })()`);
    const wsConnected = () => ev('app.ws.connected');
    return { name, cdp, ev, mouse, click, drag, rect, titleBar, previewRects, shown, allWins, boot, blank, clickPreview, nudge, dropOnto, wsClose, wsConnected, framesSent, framesGot, close: () => { try { cdpWs.close(); } catch { } try { chrome.kill('SIGKILL'); } catch { } } };
  };
  const P1 = await mkPage('p1');
  if (!ok(!!P1, 'chrome exposed a CDP page target')) return;
  const { cdp, ev, mouse, click, drag, rect, titleBar, previewRects, boot, clickPreview, nudge, dropOnto, framesSent } = P1;
  const cdpWs = { close: () => P1.close() };
  const fresh = async (tag, extraHr = [], extraFin = [], desks = []) => {
    await cdp('Page.navigate', { url: 'about:blank' }); await sleep(300);
    const inst = await install(fixture(tag, extraHr, extraFin, desks));
    const up = inst && await boot();
    framesSent.length = 0;
    return up;
  };
  const hrSyncsSent = () => framesSent.filter((m) => m.type === 'layout-sync' && m.desktopId === 'desk-hr');
  const sortIds = (a) => [...a].sort();
  const refusalsSince = (j0) => (journal.slice(j0).match(/\[layout-sync\] REFUSED[^\n]*/g) || []);

  try {

    // ── A: THE INCIDENT, fixed ──
    console.log('— A: the drag onto a desktop the page has not opened (userW\'s gesture)');
    if (want('A') && ok(await fresh('a'), 'A: the page booted on Fin (the fixture installed through the restore path)')) {
      const clientOnHr = await ev(`[...app.wm.windows.values()].filter((w) => w._desktopId === 'desk-hr').length`);
      ok(await ev('app.desktopManager.activeDesktopId') === 'desk-fin' && clientOnHr === 0, 'A: HR was never opened — the page holds none of its windows (lazy)', J({ clientOnHr }));
      ok(await previewRects('desk-hr') === 3, 'A: HR\'s preview draws its 3 windows before the drop');
      await dropOnto('win-fin-1-a', 'desk-hr');
      const pv = await previewRects('desk-hr');
      ok(pv === 4, 'A: after the REAL title-bar drop HR\'s preview draws 4 (2.369.198: 1)', pv);
      await until(() => hrSyncsSent().length > 0, 3000);
      const sentHr = hrSyncsSent().map((m) => (m.state?.windows || []).map((w) => w.winId));
      ok(sentHr.length >= 1 && sortIds(sentHr[0]).join() === sortIds(['win-hr-1-a', 'win-hr-2-a', 'win-hr-3-a', 'win-fin-1-a']).join(), 'A: the page\'s OUTGOING layout-sync after the drop carries HR with 4 windows (CDP webSocketFrameSent)', J(sentHr));
      const sentFin = framesSent.filter((m) => m.type === 'layout-sync' && m.desktopId === 'desk-fin').map((m) => (m.state?.windows || []).length);
      ok(sentFin.includes(0), 'A: …and Fin\'s with 0 (the window left it)', J(sentFin));
      ok(await until(async () => (await serverIds('desk-hr')).length === 4, 3000), 'A: the SERVER\'s record of HR = 4 before any switch (2.369.198: HR unchanged until the switch, then 1)', J(await serverIds('desk-hr')));
      await clickPreview('desk-hr');
      const shown = await ev(SHOWN);
      ok(await ev('app.desktopManager.activeDesktopId') === 'desk-hr' && J(shown) === J(sortIds(['win-hr-1-a', 'win-hr-2-a', 'win-hr-3-a', 'win-fin-1-a'])), 'A: a real click on HR\'s preview ⇒ HR SHOWS its 3 windows and the moved one (2.369.198: the moved one alone)', J(shown));
      await nudge();
      ok(sortIds(await serverIds('desk-hr')).join() === sortIds(['win-hr-1-a', 'win-hr-2-a', 'win-hr-3-a', 'win-fin-1-a']).join(), 'A: a real drag on HR (the autosave, his 21:52:38) ⇒ the server still holds 4 (2.369.198: [the moved one] — the purge)', J(await serverIds('desk-hr')));
      await boot();
      await clickPreview('desk-hr');
      const shown2 = await ev(SHOWN);
      ok(J(shown2) === J(sortIds(['win-hr-1-a', 'win-hr-2-a', 'win-hr-3-a', 'win-fin-1-a'])), 'A: after a RELOAD HR shows 4', J(shown2));
      const hist = (await api('/api/layout-history')).entries || [];
      const has = (d, a, b) => hist.some((e) => (e.change || []).some(([n, x, y]) => n === d && x === a && y === b));
      const lossRow = hist.find((e) => (e.change || []).some(([n, a, b]) => n === 'HR' && b < a));
      ok(!lossRow && has('HR', 3, 4) && has('Fin', 1, 0), 'A: the rollback points the move wrote read "Then: HR 3 → 4" and "Then: Fin 1 → 0" (the target first — never a moment with the window on no desktop); no point reads HR shrinking', J(hist.slice(0, 5).map((e) => e.change)));
    }

    // ── B: CONTROL visited first ──
    console.log('— B: CONTROL — HR opened once before the drag (what 2.369.198 got right)');
    if (want('B') && ok(await fresh('b'), 'B: fresh fixture, the page booted')) {
      await clickPreview('desk-hr'); await clickPreview('desk-fin');
      await dropOnto('win-fin-1-b', 'desk-hr');
      ok(await until(async () => (await serverIds('desk-hr')).length === 4, 4000), 'B: the server\'s HR = 4 after the drop', J(await serverIds('desk-hr')));
      await clickPreview('desk-hr');
      ok(J(await ev(SHOWN)) === J(sortIds(['win-hr-1-b', 'win-hr-2-b', 'win-hr-3-b', 'win-fin-1-b'])), 'B: HR shows 4');
    }

    // ── C: the menu door ──
    console.log('— C: the window menu — "Move to Desktop ▸ HR" (a real right-click, a real hover, a real click)');
    if (want('C') && ok(await fresh('c'), 'C: fresh fixture, the page booted')) {
      const tb = await titleBar('win-fin-1-c');
      await mouse('mouseMoved', tb.l + 80, tb.y, { buttons: 0 });
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: tb.l + 80, y: tb.y, button: 'right', buttons: 2, clickCount: 1 });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tb.l + 80, y: tb.y, button: 'right', buttons: 0, clickCount: 1 });
      await sleep(300);
      const row = await ev(`(() => { const el = [...document.querySelectorAll('.taskbar-context-menu-item')].find((e) => /Move to Desktop/.test(e.textContent)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (ok(!!row, 'C: the title bar\'s menu has "Move to Desktop"')) {
        await mouse('mouseMoved', row.x, row.y, { buttons: 0 }); await sleep(300);
        const hr = await ev(`(() => { const el = [...document.querySelectorAll('.taskbar-context-menu-item')].find((e) => e.textContent.trim() === 'HR'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        if (ok(!!hr, 'C: …its submenu lists HR')) {
          await mouse('mouseMoved', hr.x, hr.y, { buttons: 0 }); await sleep(80);
          await click(hr.x, hr.y); await sleep(600);
          ok(await until(async () => (await serverIds('desk-hr')).length === 4, 4000), 'C: the server\'s HR = 4 after the menu move (2.369.198: then 1 after the switch + autosave)', J(await serverIds('desk-hr')));
          await clickPreview('desk-hr');
          ok(J(await ev(SHOWN)) === J(sortIds(['win-hr-1-c', 'win-hr-2-c', 'win-hr-3-c', 'win-fin-1-c'])), 'C: HR shows 4', J(await ev(SHOWN)));
        }
      }
    }

    // ── D: resume placement ──
    console.log('— D: resume placement onto a desktop the page has not opened (no gesture)');
    if (!dtachOk) skip('D: dtach is not installed — a local shell session cannot be created here');
    else if (want('D') && ok(await fresh('d', [{ winId: 'win-hr-old-d', title: 'old conversation', type: 'chat', isMinimized: false, isMaximized: false, gridBounds: { left: 0.5, top: 0.5, width: 0.45, height: 0.45 }, zIndex: 10, openSpec: { action: 'viewSession', sessionId: 'e2e00000-0000-4000-8000-00000000d0d0', backend: 'claude', backendSessionId: 'e2e00000-0000-4000-8000-00000000d0d0', cwd: ROOT, name: 'old conversation' } }]), 'D: fresh fixture (HR also holds an old conversation\'s never-opened window), the page booted')) {
      const fin = await titleBar('win-fin-1-d'); await click(fin.l + 120, fin.y); // a user's act (the resume-all confirm is one)
      const newId = await ev(`(async () => { const before = new Set(app.wm.windows.keys()); app.createSession({ backend: 'shell', mode: 'terminal', cwd: ${J(ROOT)}, name: 'Resumed', model: null, permission: null, effort: null, extraArgs: '', winBounds: { desktopId: 'desk-hr', gridBounds: { left: 0.5, top: 0.5, width: 0.45, height: 0.45 }, winId: 'win-hr-old-d' } }); await new Promise((r) => setTimeout(r, 300)); return [...app.wm.windows.keys()].find((k) => !before.has(k)) || null; })()`);
      ok(!!newId && await ev(`app.wm.windows.get(${J(newId)})?._desktopId`) === 'desk-hr', 'D: the resumed window was placed on HR (the resume-placement door)', J(newId));
      const want = sortIds(['win-hr-1-d', 'win-hr-2-d', 'win-hr-3-d', newId]);
      ok(await until(async () => J(sortIds(await serverIds('desk-hr'))) === J(want), 5000), 'D: the server\'s HR = its 3 windows + the resumed one; the old entry it replaced is gone (2.369.198: HR became [the resumed window])', J(await serverIds('desk-hr')));
      await clickPreview('desk-hr');
      ok(J(await ev(SHOWN)) === J(want), 'D: HR shows those 4 — no second window of the old conversation', J(await ev(SHOWN)));
      try { await ev(`(() => { const s = app.sessions.get(${J(newId)}); if (s && s.sessionId) app.ws.send({ type: 'kill', sessionId: s.sessionId }); })()`); } catch { }
    }

    // ── E: the server belt, forged ──
    console.log('— E: the server belt — a forged shrinking layout-sync');
    await cdp('Page.navigate', { url: 'about:blank' }); await sleep(300); // no page writes while the sockets forge
    if (want('E') && ok(await install(fixture('e')), 'E: fresh fixture installed')) {
      const sock = async () => { const s = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); const got = []; s.on('message', (d) => { try { got.push(JSON.parse(d)); } catch { } }); await new Promise((r, e) => { s.on('open', r); s.on('error', e); }); return { s, got }; };
      const A = await sock(), B = await sock();
      const before = await serverIds('desk-hr');
      const j0 = journal.length;
      A.s.send(J({ type: 'layout-sync', desktopId: 'desk-hr', state: { windows: [W('win-x-e', 'x-e', { left: 0, top: 0, width: 0.3, height: 0.3 })] } }));
      await until(() => A.got.some((m) => m.type === 'layout-sync-refused'), 3000);
      const ref = A.got.find((m) => m.type === 'layout-sync-refused');
      ok(ref && ref.desktopId === 'desk-hr' && ref.reason === 'shrink-without-close' && J(sortIds(ref.unexplained || [])) === J(sortIds(before)) && J(sortIds((ref.state?.windows || []).map((w) => w.winId))) === J(sortIds(before)), 'E: the sender gets `layout-sync-refused` naming the 3 windows, WITH the record the server kept', J(ref));
      ok(J(await serverIds('desk-hr')) === J(before), 'E: the server\'s record of HR is unchanged', J(await serverIds('desk-hr')));
      await sleep(500);
      ok(!B.got.some((m) => m.type === 'layout-sync' && m.desktopId === 'desk-hr'), 'E: nothing was broadcast to another socket');
      ok(/\[layout-sync\] REFUSED a record of desktop "HR" \(desk-hr\): it drops 3 window\(s\)/.test(journal.slice(j0)), 'E: the journal names the refusal', journal.slice(j0).slice(-400));
      // CONTROL: the same shrink with a close for each window (a user's bulk close) is accepted
      A.s.send(J({ type: 'layout-sync', desktopId: 'desk-hr', state: { windows: [W('win-x-e', 'x-e', { left: 0, top: 0, width: 0.3, height: 0.3 })] }, evidence: before.map((id) => ({ id, why: 'closed' })) }));
      ok(await until(async () => J(await serverIds('desk-hr')) === J(['win-x-e']), 3000), 'E: CONTROL — the same shrink carrying a close for each window is ACCEPTED (a bulk close still works)', J(await serverIds('desk-hr')));
      ok(await until(() => B.got.some((m) => m.type === 'layout-sync' && m.desktopId === 'desk-hr'), 2000), 'E: …and broadcast to the other socket');
      // verify r1 — THE ARRIVALS: a window ONE socket added is not dropped unexplained by ANOTHER, even one window
      B.s.send(J({ type: 'layout-sync', desktopId: 'desk-hr', state: { windows: [W('win-x-e', 'x-e', { left: 0, top: 0, width: 0.3, height: 0.3 }), W('win-y-e', 'y-e', { left: 0.5, top: 0, width: 0.3, height: 0.3 })] } }));
      ok(await until(async () => J(sortIds(await serverIds('desk-hr'))) === J(['win-x-e', 'win-y-e']), 3000), 'E+: socket B adds ONE window to HR (growth, accepted)', J(await serverIds('desk-hr')));
      A.got.length = 0;
      A.s.send(J({ type: 'layout-sync', desktopId: 'desk-hr', state: { windows: [W('win-x-e', 'x-e', { left: 0, top: 0, width: 0.3, height: 0.3 })] } }));
      await until(() => A.got.some((m) => m.type === 'layout-sync-refused'), 3000);
      const ref2 = A.got.find((m) => m.type === 'layout-sync-refused');
      ok(ref2 && J(ref2.arrived) === J(['win-y-e']) && J(ref2.unexplained) === J(['win-y-e']) && J(sortIds(await serverIds('desk-hr'))) === J(['win-x-e', 'win-y-e']), 'E+: socket A\'s record without it (no evidence) is REFUSED at ONE window — `arrived` names it, the server keeps both (the lane\'s ①: below the ≥ 2 rule, accepted — the moved window of verify r1 D4 vanished this way)', J(ref2));
      ok(/arrived from another client lately/.test(journal.slice(j0)), 'E+: the journal says the drop was an arrival');
      B.s.send(J({ type: 'layout-sync', desktopId: 'desk-hr', state: { windows: [W('win-x-e', 'x-e', { left: 0, top: 0, width: 0.3, height: 0.3 })] } }));
      ok(await until(async () => J(await serverIds('desk-hr')) === J(['win-x-e']), 3000), 'E+: CONTROL — the socket that ADDED it may drop it by the ≥ 2 rule (its own arrival is no arrival to it)', J(await serverIds('desk-hr')));
      // verify r2 ⑦ — a write for a desktop DELETED meanwhile lands nowhere, and the sender is told with the meta
      ok(await install(fixture('e2', [], [], [{ id: 'desk-x', name: 'X', windows: [W('win-x-1-e2', 'x-1-e2', { left: 0.3, top: 0.3, width: 0.4, height: 0.4 })] }])), 'E⑦: a fixture with a third desktop X installed');
      A.s.send(J({ type: 'desktop-delete', desktopId: 'desk-x' }));
      ok(await until(async () => !((await api('/api/layouts')).desktopMeta || []).some((d) => d.id === 'desk-x'), 3000), 'E⑦: socket A deleted X');
      B.got.length = 0;
      B.s.send(J({ type: 'layout-sync', desktopId: 'desk-x', state: { windows: [W('win-x-1-e2', 'x-1-e2', { left: 0.3, top: 0.3, width: 0.4, height: 0.4 })] } }));
      await until(() => B.got.some((m) => m.type === 'layout-sync-refused'), 3000);
      const layE = await api('/api/layouts');
      const refX = B.got.find((m) => m.type === 'layout-sync-refused');
      ok(!layE.desktops?.['desk-x'] && refX?.reason === 'no-such-desktop' && refX.desktopId === 'desk-x' && Array.isArray(refX.desktops) && !refX.desktops.some((d) => d.id === 'desk-x'), 'E⑦: socket B\'s write for the deleted desktop lands NOWHERE (verify r2: an orphan `desktops[desk-x]` no meta named, a ghost on every boot) and B is told `no-such-desktop` with the meta', J([Object.keys(layE.desktops || {}), refX]));
      A.s.close(); B.s.close();
    }

    // ── F: the belt catches the next writer (the pre-fix cache rebuild, re-installed on the live page) ──
    console.log('— F: the 2.369.198 cache rebuild on the live page — the belt catches it');
    if (want('F') && ok(await fresh('f'), 'F: fresh fixture, the page booted')) {
      await ev(`(() => { const dm = app.desktopManager; dm._updateCachedDesktop = function (desktopId) { if (desktopId === this._activeId) return; const cached = this._savedStates.get(desktopId) || { windows: [] }; const wins = []; for (const [id, win] of this.app.wm.windows) { if (win._desktopId !== desktopId) continue; wins.push({ winId: id, gridBounds: win.gridBounds, isMinimized: false, openSpec: win._openSpec }); } cached.windows = wins; this._savedStates.set(desktopId, cached); }; })()`);
      let minHr = 3; let polling = true;
      const poll = (async () => { while (polling) { try { minHr = Math.min(minHr, (await serverIds('desk-hr')).filter((id) => /^win-hr-/.test(id)).length); } catch { } await sleep(150); } })();
      const j0 = journal.length;
      await dropOnto('win-fin-1-f', 'desk-hr');
      const heldPre = await ev(`(app.desktopManager._savedStates.get('desk-hr')?.windows || []).map((w) => w.winId || w.id)`);
      ok(J(heldPre) === J(['win-fin-1-f']), 'F: the pre-fix writer reproduces the incident\'s wipe (HR\'s held record = the moved window alone right after the drop; since verify r3 ③ the switch\'s own save leaves and the belt\'s refusal repairs the page before anyone looks — the wipe is sampled at its source)', J(heldPre));
      await clickPreview('desk-hr');
      await nudge(); // his autosave — the shrinking write
      const refused = await until(() => /\[layout-sync\] REFUSED a record of desktop "HR"/.test(journal.slice(j0)), 5000);
      ok(refused, 'F: the server REFUSED the shrinking write (the belt)', journal.slice(j0).slice(-500));
      const want = sortIds(['win-hr-1-f', 'win-hr-2-f', 'win-hr-3-f', 'win-fin-1-f']);
      ok(await until(async () => J(await ev(SHOWN)) === J(want), 6000), 'F: the page reconciled — HR\'s 3 windows opened beside the moved one', J(await ev(SHOWN)));
      const toast = await ev(`JSON.parse(localStorage.getItem('vibespace.toastHistory') || '[]').map((h) => h.m).find((m) => /were kept/.test(m)) || null`);
      ok(!!toast && /3 windows on “HR” were kept/.test(toast), 'F: …and said so in a toast', J(toast));
      await nudge();
      ok(await until(async () => J(sortIds(await serverIds('desk-hr'))) === J(want), 5000), 'F: the server ends at 4 (the corrected record went out)', J(await serverIds('desk-hr')));
      polling = false; await poll;
      ok(minHr === 3, 'F: the server\'s HR never held fewer than its 3 windows at any point', minHr);
    }

    // ── G: two pages — verify r1 D4 ──
    console.log('— G: two pages (verify r1 D4) — B drags on HR while A moves a window there; then B moves it back under A\'s eyes');
    const P2 = await mkPage('p2');
    if (want('G') && ok(!!P2, 'G: a second chrome (page B)') && ok(await fresh('g'), 'G: fresh fixture, page A booted on Fin') && ok(await P2.boot(), 'G: page B booted on Fin')) {
      await P2.clickPreview('desk-hr');
      ok(J(await P2.shown()) === J(sortIds(['win-hr-1-g', 'win-hr-2-g', 'win-hr-3-g'])), 'G: B shows HR\'s 3 windows', J(await P2.shown()));
      const j0 = journal.length;
      const tb = await P2.titleBar('win-hr-2-g');
      await P2.mouse('mouseMoved', tb.l + 80, tb.y, { buttons: 0 }); await P2.mouse('mousePressed', tb.l + 80, tb.y); await sleep(60);
      for (let i = 1; i <= 5; i++) { await P2.mouse('mouseMoved', tb.l + 80 + i * 6, tb.y + i * 4); await sleep(35); }
      ok(await P2.ev('app.layoutManager._pointerDown === true'), 'G: B\'s pointer is down on hr-2 (§6b guard 3 armed)');
      await dropOnto('win-fin-1-g', 'desk-hr'); // A's move: the burst HR(4), Fin(0), Fin(0) lands under B\'s pointer
      ok(await until(async () => (await serverIds('desk-hr')).length === 4, 4000), 'G: A\'s drop reached the server: HR = 4', J(await serverIds('desk-hr')));
      await sleep(1200);
      const held = await P2.ev(`(() => { const p = app.layoutManager._pendingRemote; return p instanceof Map ? [...p.keys()].sort() : null; })()`);
      ok(J(held) === J(['desk-fin', 'desk-hr']), 'G: B holds BOTH desktops\' records under its pointer, one per desktop (2.369.198: one slot, the last — Fin — only)', J(held));
      for (let i = 6; i <= 10; i++) { await P2.mouse('mouseMoved', tb.l + 80 + i * 6, tb.y + i * 4); await sleep(35); }
      await P2.mouse('mouseReleased', tb.l + 140, tb.y + 40);
      await sleep(3500);
      const want = sortIds(['win-hr-1-g', 'win-hr-2-g', 'win-hr-3-g', 'win-fin-1-g']);
      ok(J(sortIds(await serverIds('desk-hr'))) === J(want) && !(await serverIds('desk-fin')).includes('win-fin-1-g'), 'G: after B\'s release + save the server\'s HR still holds the moved window (2.369.198 + the lane\'s ①: gone everywhere within 4 s — B\'s save dropped it, one window is below the belt, A then closed its copy)', J([await serverIds('desk-hr'), await serverIds('desk-fin')]));
      ok(J(await P2.shown()) === J(want), 'G: B shows the moved window beside its three', J(await P2.shown()));
      ok((await P1.allWins()).includes('win-fin-1-g@desk-hr(h)'), 'G: A still holds it (hidden, on HR)', J(await P1.allWins()));
      ok(refusalsSince(j0).length === 0, 'G: …and the belt never had to refuse — B\'s base was fresh', J(refusalsSince(j0)));
      // B moves it back to Fin while A shows Fin: a REMOTE MOVE IN on A
      await P2.ev(`(() => { app.wm.focusWindow('win-fin-1-g'); app.wm.windows.get('win-fin-1-g').element.style.zIndex = 99999; return true; })()`); await sleep(200);
      await P2.dropOnto('win-fin-1-g', 'desk-fin');
      ok(await until(async () => (await serverIds('desk-fin')).includes('win-fin-1-g'), 4000), 'G: B moved it back: the server\'s Fin holds it');
      ok(await until(async () => (await P1.shown()).includes('win-fin-1-g'), 5000), 'G: A, on Fin, SHOWS the window that came back (a remote move applied as a move — the lane\'s ①: A\'s Fin record listed a window A held hidden on HR, and HR\'s next record closed it)', J(await P1.allWins()));
      await nudge();
      ok((await serverIds('desk-fin')).includes('win-fin-1-g') && !(await serverIds('desk-hr')).includes('win-fin-1-g'), 'G: A\'s next save keeps it on Fin only', J([await serverIds('desk-fin'), await serverIds('desk-hr')]));
      ok(refusalsSince(j0).length === 0, 'G: no refusal in the whole round', J(refusalsSince(j0)));
    }

    // ── H: a reconnect re-reads the layout — verify r1 D2 ──
    console.log('— H: a reconnect (verify r1 D2) — B\'s socket cut while A opens a window on HR');
    if (want('H') && P2 && ok(await fresh('h'), 'H: fresh fixture, page A booted') && ok(await P2.boot(), 'H: page B booted')) {
      await clickPreview('desk-hr'); await P2.clickPreview('desk-hr');
      const tbA = await titleBar('win-hr-1-h'); await click(tbA.l + 120, tbA.y); // a real input on A (guard 2)
      const j0 = journal.length;
      await P2.wsClose();
      ok(await until(async () => !(await P2.wsConnected()), 2000, 50), 'H: B\'s socket is down');
      const newId = await ev(`(() => { const before = new Set(app.wm.windows.keys()); app.openFileExplorer(${J(dir('new-h'))}); return [...app.wm.windows.keys()].find((k) => !before.has(k)); })()`);
      ok(!!newId && await until(async () => (await serverIds('desk-hr')).includes(newId), 4000), 'H: A opened a window on HR while B was cut off; the server has it', J(await serverIds('desk-hr')));
      ok(await until(() => P2.wsConnected(), 8000, 100), 'H: B reconnected');
      await sleep(800);
      await P2.nudge(); // B's next user act: a drag on HR
      ok((await serverIds('desk-hr')).includes(newId), 'H: after B\'s save the server still holds A\'s window (the lane\'s ①: wiped — B\'s base was the last broadcast before the outage, one window is below the belt)', J(await serverIds('desk-hr')));
      ok(await until(async () => (await P2.allWins()).some((w) => w.startsWith(newId + '@desk-hr')), 4000), 'H: B has it too (the reconnect re-read the layout)', J(await P2.allWins()));
      ok((await ev('[...app.wm.windows.keys()]')).includes(newId), 'H: A kept it', J(await ev('[...app.wm.windows.keys()]')));
      ok(refusalsSince(j0).length === 0, 'H: no refusal was needed', J(refusalsSince(j0)));
    }
    // ── J: THE HELD MOVE (verify r2) — B drags fin-2 onto HR's preview while A's save of Fin lands under B's pointer ──
    console.log('— J: two pages (verify r2) — B\'s drop on HR vs A\'s stale Fin record deferred under the drag');
    if (want('J') && P2 && ok(await fresh('j', [], [W('win-fin-2-j', 'fin-2-j', { left: 0.55, top: 0.1, width: 0.4, height: 0.4 })]), 'J: fresh fixture (Fin 2 + HR 3), page A booted') && ok(await P2.boot(), 'J: page B booted on Fin')) {
      const j0 = journal.length;
      const tb = await P2.titleBar('win-fin-2-j'); const p = await P2.rect('.desktop-preview[data-desktop-id="desk-hr"]');
      await P2.mouse('mouseMoved', tb.l + 80, tb.y, { buttons: 0 }); await P2.mouse('mousePressed', tb.l + 80, tb.y); await sleep(60);
      for (let i = 1; i <= 6; i++) { await P2.mouse('mouseMoved', tb.l + 80 + (p.x - tb.l - 80) * i / 20, tb.y + (p.y - tb.y) * i / 20); await sleep(35); }
      ok(await P2.ev('app.layoutManager._pointerDown === true'), 'J: B\'s pointer is down on fin-2, heading for HR\'s preview');
      P2.framesGot.length = 0;
      await nudge(); // A's drag of fin-1 ⇒ A's save of Fin (still listing fin-2) lands under B's pointer
      ok(P2.framesGot.some((f) => f.desktopId === 'desk-fin' && (f.state?.windows || []).some((w) => w.winId === 'win-fin-2-j')), 'J: A\'s Fin record, listing fin-2, reached B during the drag (deferred)', J(P2.framesGot.map((f) => [f.desktopId, (f.state?.windows || []).map((w) => w.winId)])));
      for (let i = 7; i <= 20; i++) { await P2.mouse('mouseMoved', tb.l + 80 + (p.x - tb.l - 80) * i / 20, tb.y + (p.y - tb.y) * i / 20); await sleep(35); }
      await P2.mouse('mouseMoved', p.x + 1, p.y); await sleep(80); await P2.mouse('mouseMoved', p.x, p.y); await sleep(120);
      await P2.mouse('mouseReleased', p.x, p.y);
      await sleep(150);
      ok((await P2.allWins()).includes('win-fin-2-j@desk-hr(h)'), 'J: the drop moved fin-2 to HR on B', J(await P2.allWins()));
      await sleep(4500);
      ok((await P2.allWins()).includes('win-fin-2-j@desk-hr(h)'), 'J: B still holds fin-2 on HR — the record deferred under the drag could not know the move (verify r2: r1\'s move-in put it back on Fin, silently)', J(await P2.allWins()));
      ok((await serverIds('desk-hr')).includes('win-fin-2-j') && !(await serverIds('desk-fin')).includes('win-fin-2-j'), 'J: the server holds the move (the held move re-sent as the user\'s own act; r1: the apply\'s dirty clear swallowed it, never sent)', J([await serverIds('desk-hr'), await serverIds('desk-fin')]));
      ok(await until(async () => (await P1.allWins()).includes('win-fin-2-j@desk-hr(h)'), 4000), 'J: A learned of the move', J(await P1.allWins()));
      ok(refusalsSince(j0).length === 0, 'J: no refusal', J(refusalsSince(j0)));
    }
    // ── K: a tab group on B's hidden HR vs A's save of Fin (verify r2) ──
    console.log('— K: two pages (verify r2) — B holds a tab group on HR (hidden) and shows Fin; A saves Fin');
    if (want('K') && P2 && ok(await fresh('k'), 'K: fresh fixture, page A booted') && ok(await P2.boot(), 'K: page B booted on Fin')) {
      await P2.clickPreview('desk-hr');
      const grouped = await P2.ev(`(() => { const h = app.wm.windows.get('win-hr-1-k'), g = app.wm.windows.get('win-hr-2-k'); if (!h || !g) return null; app.wm.createTabChain(h, g); return h._tabChain ? h._tabChain.tabs.join(',') : null; })()`);
      ok(grouped === 'win-hr-1-k,win-hr-2-k', 'K: B grouped hr-1 + hr-2 on HR', J(grouped));
      await P2.nudge();
      ok(await until(async () => ((await api('/api/layouts')).desktops['desk-hr'].autoSave.windows.find((w) => w.winId === 'win-hr-1-k')?.tabChain?.tabs || []).length === 2, 4000), 'K: the server\'s HR record carries the group');
      await P2.clickPreview('desk-fin');
      P2.framesGot.length = 0;
      await nudge(); // A's save of Fin lands on B, which shows Fin
      ok(await until(() => P2.framesGot.some((f) => f.desktopId === 'desk-fin'), 3000), 'K: A\'s Fin record reached B');
      const after = await P2.ev(`(() => { const h = app.wm.windows.get('win-hr-1-k'); return h?._tabChain?.tabs || null; })()`);
      ok(after && after.length === 2, 'K: B\'s group on hidden HR is intact (verify r2: every save of the desktop on show by another client broke every group on the page\'s other desktops)', J(after));
      await P2.clickPreview('desk-hr'); await P2.nudge();
      ok(((await api('/api/layouts')).desktops['desk-hr'].autoSave.windows.find((w) => w.winId === 'win-hr-1-k')?.tabChain?.tabs || []).length === 2, 'K: …and B\'s next save of HR still carries it (the broken group used to reach the server here)');
    }
    // ── L: a delete seen from another page (verify r2 ④) — the windows go to the deleter's target, not desktop #1 ──
    console.log('— L: two pages (verify r2 ④) — A, on X, deletes X (its neighbour HR takes the windows); B, on Fin with X built');
    if (want('L') && P2 && ok(await fresh('l', [], [], [{ id: 'desk-x', name: 'X', windows: [W('win-x-1-l', 'x-1-l', { left: 0.3, top: 0.3, width: 0.4, height: 0.4 })] }]), 'L: fresh fixture (Fin 1 + HR 3 + X 1), page A booted') && ok(await P2.boot(), 'L: page B booted on Fin')) {
      await P2.clickPreview('desk-x'); await P2.clickPreview('desk-fin'); // B has X built (hidden now)
      ok((await P2.allWins()).includes('win-x-1-l@desk-x(h)'), 'L: B holds x-1 on X, hidden', J(await P2.allWins()));
      await clickPreview('desk-x');
      const tbX = await titleBar('win-x-1-l'); await click(tbX.l + 120, tbX.y);
      const j0 = journal.length;
      await ev(`app.desktopManager.deleteDesktop('desk-x')`); // A: the desktop on show; its neighbour HR is the target
      ok(await until(async () => (await serverIds('desk-hr')).includes('win-x-1-l'), 4000), 'L: the server\'s HR holds x-1 (the deleter\'s target)', J(await serverIds('desk-hr')));
      ok(await until(async () => (await P2.allWins()).includes('win-x-1-l@desk-hr(h)'), 4000), 'L: B moved x-1 to HR (hidden) — where the deleter\'s record put it, not onto Fin, the first desktop, shown (verify r2 ④)', J(await P2.allWins()));
      ok(!(await P2.shown()).includes('win-x-1-l'), 'L: …B\'s Fin does not show it');
      await P2.nudge(); // B's next save of Fin
      ok(!(await serverIds('desk-fin')).includes('win-x-1-l') && (await serverIds('desk-hr')).includes('win-x-1-l'), 'L: B\'s save of Fin does not write x-1 under Fin — one record of it on the server (HR)', J([await serverIds('desk-fin'), await serverIds('desk-hr')]));
      ok(await ev('app.desktopManager.activeDesktopId') === 'desk-hr' && (await ev(SHOWN)).includes('win-x-1-l'), 'L: A shows x-1 on HR still (it used to jump to Fin once B\'s save landed)', J(await ev(SHOWN)));
      const layL = await api('/api/layouts');
      ok(!layL.desktops?.['desk-x'] && refusalsSince(j0).length === 0, 'L: no record of the deleted desktop on the server, no refusal', J([Object.keys(layL.desktops || {}), refusalsSince(j0)]));
    }
    // ── M: THE HELD GEOMETRY (verify r2 ⑩) — B drags hr-2 on HR while A's save of HR (hr-2 where A last saw it) lands under B's pointer ──
    console.log('— M: two pages (verify r2 ⑩) — a plain drag on the desktop on show vs another client\'s record deferred under it');
    if (want('M') && P2 && ok(await fresh('m'), 'M: fresh fixture, page A booted') && ok(await P2.boot(), 'M: page B booted on Fin')) {
      await clickPreview('desk-hr'); await P2.clickPreview('desk-hr');
      const box = (P, id) => P.ev(`(() => { const w = app.wm.windows.get(${J(id)}); if (!w) return null; const r = w.element.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })()`);
      const srvBox = async (id) => { const w = ((await api('/api/layouts')).desktops['desk-hr'].autoSave.windows || []).find((x) => x.winId === id); return w?.gridBounds ? [+w.gridBounds.left.toFixed(3), +w.gridBounds.top.toFixed(3)] : null; };
      const before = await box(P2, 'win-hr-2-m');
      const tb = await P2.titleBar('win-hr-2-m');
      await P2.mouse('mouseMoved', tb.l + 80, tb.y, { buttons: 0 }); await P2.mouse('mousePressed', tb.l + 80, tb.y); await sleep(60);
      for (let i = 1; i <= 6; i++) { await P2.mouse('mouseMoved', tb.l + 80 + i * 30, tb.y + i * 20); await sleep(35); }
      ok(await P2.ev('app.layoutManager._pointerDown === true'), 'M: B\'s pointer is down on hr-2');
      P2.framesGot.length = 0;
      await nudge(); // A drags hr-1 a little ⇒ A's save of HR (hr-2 where A last saw it) lands on B, deferred
      ok(P2.framesGot.some((f) => f.desktopId === 'desk-hr'), 'M: A\'s HR record reached B during the drag');
      for (let i = 7; i <= 12; i++) { await P2.mouse('mouseMoved', tb.l + 80 + i * 30, tb.y + i * 20); await sleep(35); }
      await P2.mouse('mouseReleased', tb.l + 80 + 12 * 30, tb.y + 12 * 20);
      await sleep(150);
      const dropped = await box(P2, 'win-hr-2-m');
      ok(dropped && (Math.abs(dropped[0] - before[0]) > 40 || Math.abs(dropped[1] - before[1]) > 40), 'M: B\'s drag moved hr-2 (its box at the release)', J([before, dropped]));
      await sleep(4000);
      const later = await box(P2, 'win-hr-2-m');
      const gbB = await P2.ev(`(() => { const w = app.wm.windows.get('win-hr-2-m'); return [+w.gridBounds.left.toFixed(3), +w.gridBounds.top.toFixed(3)]; })()`);
      ok(later && Math.abs(later[0] - dropped[0]) < 8 && Math.abs(later[1] - dropped[1]) < 8, 'M: B\'s window stays where B dropped it (the record deferred under the drag could not know the drag; verify r2: it snapped the box back to where A last saw it, silently)', J([dropped, later]));
      ok(J(await srvBox('win-hr-2-m')) === J(gbB) && Math.abs(gbB[0] - 0.5) > 0.05, 'M: …and the server holds the dragged place (the drag\'s save had been swallowed by the apply\'s dirty clear)', J([gbB, await srvBox('win-hr-2-m')]));
      ok(await until(async () => J(await P2.ev(`(() => { const w = app.wm.windows.get('win-hr-2-m'); return [+w.gridBounds.left.toFixed(3), +w.gridBounds.top.toFixed(3)]; })()`)) === J(await ev(`(() => { const w = app.wm.windows.get('win-hr-2-m'); return [+w.gridBounds.left.toFixed(3), +w.gridBounds.top.toFixed(3)]; })()`)), 4000), 'M: A follows B\'s drag');
    }
    // ── N: verify r3 ① — a title-bar PRESS that drags nothing (a click-to-focus) on B while A MOVES that very window: the record deferred under the press must still apply — a click holds no geometry ──
    console.log('— N: two pages (verify r3 ①) — a click-to-focus on the desktop on show vs another client\'s move of that window deferred under it');
    if (want('N') && P2 && ok(await fresh('n'), 'N: fresh fixture, page A booted') && ok(await P2.boot(), 'N: page B booted on Fin')) {
      await clickPreview('desk-hr'); await P2.clickPreview('desk-hr');
      const box = (P, id) => P.ev(`(() => { const w = app.wm.windows.get(${J(id)}); if (!w) return null; const r = w.element.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })()`);
      const srvBox = async (id) => { const w = ((await api('/api/layouts')).desktops['desk-hr'].autoSave.windows || []).find((x) => x.winId === id); return w?.gridBounds ? [+w.gridBounds.left.toFixed(3), +w.gridBounds.top.toFixed(3)] : null; };
      const tb = await P2.titleBar('win-hr-2-n');
      await P2.mouse('mouseMoved', tb.l + 80, tb.y, { buttons: 0 }); await P2.mouse('mousePressed', tb.l + 80, tb.y); await sleep(60);
      ok(await P2.ev('app.layoutManager._pointerDown === true'), 'N: B\'s pointer is down on hr-2 (a press, no movement)');
      const ta = await titleBar('win-hr-2-n');
      await drag(ta.l + 80, ta.y, ta.l + 80 + 360, ta.y + 200); // A moves hr-2 itself
      ok(await until(async () => { const b = await srvBox('win-hr-2-n'); return !!b && Math.abs(b[0] - 0.5) > 0.05; }, 6000), 'N: A\'s drag of hr-2 reached the server');
      const srv0 = await srvBox('win-hr-2-n');
      ok(await until(() => P2.ev(`Math.abs((app.layoutManager._pendingRemote.get('desk-hr')?.state?.windows?.find((w) => w.winId === 'win-hr-2-n')?.gridBounds?.left ?? 0.5) - ${srv0[0]}) < 0.01`), 4000), 'N: A\'s HR record (hr-2 MOVED) is the one deferred under B\'s press');
      await sleep(100);
      await P2.mouse('mouseReleased', tb.l + 80, tb.y); // released in place: a click
      const aBox = await box(P1, 'win-hr-2-n');
      ok(await until(async () => { const l = await box(P2, 'win-hr-2-n'); return !!l && Math.abs(l[0] - aBox[0]) < 8 && Math.abs(l[1] - aBox[1]) < 8; }, 5000), 'N: B shows hr-2 where A moved it — a press that dragged nothing holds no geometry (verify r3: the click stamped the witness and B kept the old box; its next save wrote it over A\'s move)', J([aBox, await box(P2, 'win-hr-2-n')]));
      await sleep(2500);
      ok(J(await srvBox('win-hr-2-n')) === J(srv0), 'N: …and the server keeps A\'s box (B\'s click re-sent nothing over it)', J([srv0, await srvBox('win-hr-2-n')]));
      ok(await P2.ev(`!app.wm.windows.get('win-hr-2-n')._boundsAt`), 'N: the click left no geometry witness on B\'s window');
    }
    // ── O: verify r4 ③ — a SNAP by command mode and a MAXIMIZE by the title-bar □, made in the second after another client's record landed, vs a record deferred under that second ──
    console.log('— O: two pages (verify r4 ③) — B snaps hr-2 left by Ctrl+\\ ← / maximizes it by its □ 150 ms after another client\'s record landed; a second record lands under the cooldown');
    if (want('O') && P2 && ok(await fresh('o'), 'O: fresh fixture, page A booted') && ok(await P2.boot(), 'O: page B booted on Fin')) {
      await clickPreview('desk-hr'); await P2.clickPreview('desk-hr');
      const sockO = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); await new Promise((r, e) => { sockO.on('open', r); sockO.on('error', e); });
      const hrRecord = async () => (await api('/api/layouts')).desktops['desk-hr'].autoSave;
      const nudged = (rec, k) => ({ ...rec, windows: rec.windows.map((w) => (w.winId === 'win-hr-1-o' ? { ...w, gridBounds: { ...w.gridBounds, left: 0.01 * k } } : w)) }); // hr-1 nudged: not the no-op
      const landOnB = async (rec) => { P2.framesGot.length = 0; sockO.send(J({ type: 'layout-sync', desktopId: 'desk-hr', state: rec })); return until(() => P2.framesGot.some((f) => f.desktopId === 'desk-hr'), 3000); };
      const j0 = journal.length;
      // the snap by command mode (Ctrl+\ then ←) on hr-2 (at 0.5, 0 — the left half is a real change)
      const tb2 = await P2.titleBar('win-hr-2-o'); await P2.click(tb2.l + 120, tb2.y); await sleep(400);
      ok(await P2.ev(`app.wm.activeWindowId === 'win-hr-2-o'`), 'O: hr-2 is B\'s active window');
      const before = await P2.ev(`Math.round(app.wm.windows.get('win-hr-2-o').element.offsetLeft)`);
      const base = await hrRecord();
      ok(await landOnB(nudged(base, 1)), 'O: another client\'s HR record landed on B (applied at once — the cooldown starts)');
      await sleep(150);
      await P2.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: '\\', code: 'Backslash', modifiers: 2 }); await P2.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: '\\', code: 'Backslash', modifiers: 2 });
      await sleep(80);
      await P2.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 }); await P2.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
      await sleep(350);
      const snapped = await P2.ev(`Math.round(app.wm.windows.get('win-hr-2-o').element.offsetLeft)`);
      ok(before > 200 && snapped <= 8, 'O: Ctrl+\\ ← snapped hr-2 to the left half on B, 150 ms into the cooldown', J([before, snapped]));
      ok(await landOnB(nudged(base, 2)), 'O: a second record (hr-2 at its old place) landed on B under the cooldown (deferred)');
      await sleep(3000);
      const after = await P2.ev(`(() => { const w = app.wm.windows.get('win-hr-2-o'); return [Math.round(w.element.offsetLeft), +w.gridBounds.left.toFixed(2)]; })()`);
      ok(after[0] <= 8, 'O: B\'s hr-2 stays snapped — a keyboard snap is a witnessed act (verify r4 ③: the snap stamped nothing and the record deferred under the cooldown put the window back)', J(after));
      ok(await until(async () => ((await hrRecord()).windows.find((w) => w.winId === 'win-hr-2-o')?.gridBounds?.left ?? 1) < 0.02, 5000), 'O: …and the server holds the snap (B\'s deferred save carried it)', J((await hrRecord()).windows.map((w) => [w.winId, w.gridBounds?.left])));
      // the maximize by the □ button, on the same window (snapped left, on top)
      const base2 = await hrRecord();
      ok(await landOnB(nudged(base2, 3)), 'O: a third record landed on B (the cooldown starts again)');
      await sleep(150);
      const mx = await P2.ev(`(() => { const w = app.wm.windows.get('win-hr-2-o'); const b = w.element.querySelector('.win-maximize'); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await P2.click(mx.x, mx.y);
      ok(await P2.ev(`app.wm.windows.get('win-hr-2-o').isMaximized === true`), 'O: B\'s □ click maximized hr-2, 150 ms into the cooldown');
      ok(await landOnB(nudged(base2, 4)), 'O: a fourth record (hr-2 NOT maximized) landed on B under the cooldown (deferred)');
      await sleep(3000);
      ok(await P2.ev(`app.wm.windows.get('win-hr-2-o').isMaximized === true`), 'O: B\'s hr-2 stays maximized — a maximize the user asked for is a witnessed act too (the □ stamped nothing and the deferred record un-maximized it)');
      ok(await until(async () => (await hrRecord()).windows.find((w) => w.winId === 'win-hr-2-o')?.isMaximized === true, 5000), 'O: …and the server holds it', J((await hrRecord()).windows.map((w) => [w.winId, !!w.isMaximized])));
      ok(refusalsSince(j0).length === 0, 'O: no refusal', J(refusalsSince(j0)));
      sockO.close();
    }
    // ── P: verify r5 ③ — a layout PRESET (the toolbar's two-column button) 150 ms into a cooldown; a record deferred under it ──
    console.log('— P: two pages (verify r5 ③) — B clicks the toolbar\'s two-column preset 150 ms after another client\'s record landed; a second record lands under the cooldown');
    if (want('P') && P2 && ok(await fresh('p'), 'P: fresh fixture, page A booted') && ok(await P2.boot(), 'P: page B booted on Fin')) {
      await clickPreview('desk-hr'); await P2.clickPreview('desk-hr');
      const sockP = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); await new Promise((r, e) => { sockP.on('open', r); sockP.on('error', e); });
      const hrRecord = async () => (await api('/api/layouts')).desktops['desk-hr'].autoSave;
      const nudged = (rec, k) => ({ ...rec, windows: rec.windows.map((w) => (w.winId === 'win-hr-1-p' ? { ...w, gridBounds: { ...w.gridBounds, left: 0.01 * k } } : w)) }); // hr-1 nudged: not the no-op
      const landOnB = async (rec) => { P2.framesGot.length = 0; sockP.send(J({ type: 'layout-sync', desktopId: 'desk-hr', state: rec })); return until(() => P2.framesGot.some((f) => f.desktopId === 'desk-hr'), 3000); };
      const j0 = journal.length;
      const btn = await P2.rect('.layout-btn[data-layout="two-vertical"]');
      if (ok(!!btn && btn.w > 0, 'P: the toolbar shows the two-column preset button (toolbar.showLayoutPresets default)')) {
        const base = await hrRecord();
        ok(await landOnB(nudged(base, 1)), 'P: another client\'s HR record landed on B (applied at once — the cooldown starts)');
        await sleep(150);
        await P2.click(btn.x, btn.y);
        await sleep(400);
        const cols = () => P2.ev(`(() => { const ws = app.wm.workspace.offsetWidth; return ['win-hr-1-p', 'win-hr-2-p', 'win-hr-3-p'].map((id) => { const w = app.wm.windows.get(id); return [Math.round(w.element.offsetLeft), Math.round(w.element.offsetWidth / ws * 100)]; }); })()`);
        const placed = await cols();
        ok(placed[0][0] <= 8 && placed[1][0] > 300 && placed[2][0] <= 8 && placed.every((c) => c[1] >= 45 && c[1] <= 52), 'P: the preset placed hr-1 / hr-3 in the left column and hr-2 in the right, 150 ms into the cooldown', J(placed));
        ok(await landOnB(nudged(base, 2)), 'P: a second record (the old boxes) landed on B under the cooldown (deferred)');
        await sleep(3000);
        const after = await cols();
        ok(J(after) === J(placed), 'P: B\'s windows stay in their columns — a preset is a witnessed act on every window it places (verify r5 ③: the record deferred under the cooldown put every window back and the preset\'s save was swallowed)', J([placed, after]));
        ok(await until(async () => { const r = await hrRecord(); const w = (id) => r.windows.find((x) => x.winId === id)?.gridBounds; return !!w('win-hr-2-p') && w('win-hr-2-p').left > 0.45 && w('win-hr-1-p').left < 0.02 && w('win-hr-1-p').width > 0.45; }, 5000), 'P: …and the server holds the columns (B\'s deferred save carried them)', J((await hrRecord()).windows.map((w) => [w.winId, w.gridBounds?.left, w.gridBounds?.width])));
      }
      ok(refusalsSince(j0).length === 0, 'P: no refusal', J(refusalsSince(j0)));
      sockP.close();
    }

    // ── R: verify r5 ② — a tab-group MERGE by a real icon drag 150 ms into a cooldown; a record deferred under it ──
    console.log('— R: two pages (verify r5 ②) — B drags hr-3\'s icon onto hr-1 (a merge) 150 ms after another client\'s record landed; a second record (no group) lands under the cooldown');
    if (want('R') && P2 && ok(await fresh('r'), 'R: fresh fixture, page A booted') && ok(await P2.boot(), 'R: page B booted on Fin')) {
      await clickPreview('desk-hr'); await P2.clickPreview('desk-hr');
      const sockR = new WebSocket(`ws://127.0.0.1:${PORT}/ws`); await new Promise((r, e) => { sockR.on('open', r); sockR.on('error', e); });
      const hrRecord = async () => (await api('/api/layouts')).desktops['desk-hr'].autoSave;
      const nudged = (rec, k) => ({ ...rec, windows: rec.windows.map((w) => (w.winId === 'win-hr-2-r' ? { ...w, gridBounds: { ...w.gridBounds, left: 0.5 + 0.01 * k } } : w)) }); // hr-2 nudged: not the no-op
      const landOnB = async (rec) => { P2.framesGot.length = 0; sockR.send(J({ type: 'layout-sync', desktopId: 'desk-hr', state: rec })); return until(() => P2.framesGot.some((f) => f.desktopId === 'desk-hr'), 3000); };
      const j0 = journal.length;
      const iconOf = (id) => P2.ev(`(() => { const w = app.wm.windows.get(${J(id)}); const el = w && w.element.querySelector('.window-icon-stack'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      const base = await hrRecord();
      ok(await landOnB(nudged(base, 1)), 'R: another client\'s HR record landed on B (applied at once — the cooldown starts)');
      await sleep(150);
      const from = await iconOf('win-hr-3-r'), to = await iconOf('win-hr-1-r');
      if (ok(!!from && !!to, 'R: both window icons are on screen')) {
        await P2.drag(from.x, from.y, to.x, to.y, 16);
        await sleep(300);
        const chainOf = () => P2.ev(`(() => { const h = app.wm.windows.get('win-hr-1-r'); return h?._tabChain ? [...h._tabChain.tabs] : null; })()`);
        const merged = await chainOf();
        ok(!!merged && merged.length === 2 && merged.includes('win-hr-3-r'), 'R: the icon drop merged hr-3 into hr-1\'s group, 150 ms into the cooldown', J(merged));
        ok(await landOnB(nudged(base, 2)), 'R: a second record (hr-1 and hr-3 free) landed on B under the cooldown (deferred)');
        await sleep(3000);
        const after = await chainOf();
        ok(!!after && after.length === 2 && after.includes('win-hr-3-r') && await P2.ev(`app.wm.windows.get('win-hr-3-r')?._tabChain === app.wm.windows.get('win-hr-1-r')?._tabChain`), 'R: B\'s group stands — a merge is a witnessed act on the group (verify r5 ②: the record deferred under the cooldown dissolved it 300 ms after the drop and the merge\'s save was swallowed)', J([merged, after]));
        ok(await until(async () => ((await hrRecord()).windows.find((w) => w.winId === 'win-hr-1-r')?.tabChain?.tabs || []).length === 2, 5000), 'R: …and the server\'s HR record carries the group (B\'s deferred save)', J((await hrRecord()).windows.map((w) => [w.winId, w.tabChain?.tabs])));
      }
      ok(refusalsSince(j0).length === 0, 'R: no refusal', J(refusalsSince(j0)));
      sockR.close();
    }

    // ── Q: THE ACK (verify r5 ⑤) — a save sent on a socket that looks open but the server never reads; the socket dies; the reconnect re-reads ──
    console.log('— Q: (verify r5 ⑤) B\'s save leaves on a socket that looks open but the server never reads it; the socket dies; the reconnect re-reads');
    if (want('Q') && P2 && ok(await fresh('q'), 'Q: fresh fixture, page A booted') && ok(await P2.boot(), 'Q: page B booted on Fin')) {
      await P2.clickPreview('desk-hr');
      await P2.nudge(); // a real save, answered by the real server
      ok(await until(() => P2.ev('app.layoutManager._serverAcks === true && app.layoutManager._unacked.length === 0'), 3000), 'Q: the real server ACKED B\'s save (`layout-sync-ack`): B knows this server acks, nothing owed', J(await P2.ev('[app.layoutManager._serverAcks, app.layoutManager._unacked.length]')));
      const box = (P, id) => P.ev(`(() => { const w = app.wm.windows.get(${J(id)}); if (!w) return null; const r = w.element.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })()`);
      const srvBox = async (id) => { const w = ((await api('/api/layouts')).desktops['desk-hr'].autoSave.windows || []).find((x) => x.winId === id); return w?.gridBounds ? [+w.gridBounds.left.toFixed(3), +w.gridBounds.top.toFixed(3)] : null; };
      const gbOf = (id) => P2.ev(`(() => { const w = app.wm.windows.get(${J(id)}); return [+w.gridBounds.left.toFixed(3), +w.gridBounds.top.toFixed(3)]; })()`);
      const srv0 = await srvBox('win-hr-2-q');
      await P2.ev(`(() => { app.ws.ws.send = () => {}; return true; })()`); // the socket looks open; the server reads nothing from here on (a restart under it, a wifi drop the browser sees late)
      const tb = await P2.titleBar('win-hr-2-q');
      await P2.drag(tb.l + 80, tb.y, tb.l + 80 + 300, tb.y + 180);
      await sleep(1500);
      const dropped = await box(P2, 'win-hr-2-q'), gb = await gbOf('win-hr-2-q');
      ok(J(await srvBox('win-hr-2-q')) === J(srv0) && await P2.ev('app.layoutManager._unacked.length >= 1'), 'Q: the drag\'s save "left" (B\'s socket looks open) but the server never read it — the save is still OWED on B', J([srv0, await srvBox('win-hr-2-q'), await P2.ev('app.layoutManager._unacked.length')]));
      const c0 = await P2.ev('app.layoutManager._connects');
      await P2.wsClose();
      ok(await until(async () => !(await P2.wsConnected()), 3000, 50), 'Q: B\'s socket is down');
      ok(await until(() => P2.wsConnected(), 8000, 100) && await until(() => P2.ev(`app.layoutManager._connects === ${c0 + 1}`), 3000, 50), 'Q: B reconnected (the open was told)');
      await sleep(1500); // the re-read (250 ms after the open) + its apply
      const after = await box(P2, 'win-hr-2-q');
      ok(after && Math.abs(after[0] - dropped[0]) < 8 && Math.abs(after[1] - dropped[1]) < 8, 'Q: B\'s window stays where B dropped it — the re-read did not reverse an act the server never read (r4\'s held (a): "sent on an open socket" counted as sent, and the re-read reversed it for good)', J([dropped, after]));
      ok(await until(async () => J(await srvBox('win-hr-2-q')) === J(gb), 6000), 'Q: …and the held act is RE-SENT after the reconnect: the server holds the dragged place', J([gb, await srvBox('win-hr-2-q')]));
      ok(await until(() => P2.ev('app.layoutManager._unacked.length === 0'), 3000), 'Q: the re-send was acked — nothing owed', J(await P2.ev('(() => { const lm = app.layoutManager; return { unacked: lm._unacked, serverAcks: lm._serverAcks, timer: !!lm._ackTimer, now: Date.now(), carried: [...lm._carried] }; })()')));
      // CONTROL (an old server): B ignores acks and forgets it ever saw one — the 2 s fallback stamps at the send (today's rule);
      // the same swallow + reconnect reverses the drag, and B does not hang (its next drag still reaches the server)
      await P2.ev(`(() => { const lm = app.layoutManager; lm._serverAcks = false; lm._onLayoutAnswer = () => {}; app.ws.ws.send = () => {}; return true; })()`);
      const tb2 = await P2.titleBar('win-hr-2-q');
      await P2.drag(tb2.l + 80, tb2.y, tb2.l + 80 - 200, tb2.y - 100);
      await sleep(800); // the save "left"; no ack
      const dropped2 = await box(P2, 'win-hr-2-q');
      ok(await until(() => P2.ev('app.layoutManager._unacked.length === 0'), 4000), 'Q control: without acks B falls back to the send stamp after ACK_WAIT_MS (an old server never hangs a hold)', J(await P2.ev('(() => { const lm = app.layoutManager; return { unacked: lm._unacked, serverAcks: lm._serverAcks, timer: !!lm._ackTimer, now: Date.now(), carried: [...lm._carried], dirty: [...app.desktopManager._dirtyDesks] }; })()')));
      const c1 = await P2.ev('app.layoutManager._connects');
      await P2.wsClose();
      ok(await until(async () => !(await P2.wsConnected()), 3000, 50), 'Q control: B\'s socket is down');
      ok(await until(() => P2.wsConnected(), 8000, 100) && await until(() => P2.ev(`app.layoutManager._connects === ${c1 + 1}`), 3000, 50), 'Q control: B reconnected (the open was told)');
      await sleep(1500);
      const after2 = await box(P2, 'win-hr-2-q');
      ok(after2 && (Math.abs(after2[0] - dropped2[0]) > 40 || Math.abs(after2[1] - dropped2[1]) > 40) && Math.abs(after2[0] - after[0]) < 8, 'Q control: …so the re-read reverses the swallowed drag — today\'s loss, by design of the fallback (RED without the ack)', J([dropped2, after2, after, await srvBox('win-hr-2-q'), await P2.ev('(() => { const lm = app.layoutManager, w = app.wm.windows.get("win-hr-2-q"); return { gb: w.gridBounds, boundsAt: w._boundsAt, carried: [...lm._carried], movesSentAt: lm._movesSentAt, unacked: lm._unacked.length }; })()')]));
      const hr1 = await srvBox('win-hr-1-q');
      await P2.nudge(); // a real drag of the first shown window (hr-1)
      ok(await until(() => P2.ev('app.layoutManager._unacked.length === 0'), 4000) && await until(async () => J(await srvBox('win-hr-1-q')) !== J(hr1), 4000), 'Q control: B\'s next drag still reaches the server (no hang)', J([hr1, await srvBox('win-hr-1-q')]));
    }
    if (P2) P2.close();

    // ── I: deleting the desktop on show — verify r1 D1 ──
    console.log('— I: delete the desktop ON SHOW (verify r1 D1) — its windows reach the target\'s record with no further input');
    if (want('I') && ok(await fresh('i'), 'I: fresh fixture, booted on Fin')) {
      await clickPreview('desk-hr');
      const tbI = await titleBar('win-hr-1-i'); await click(tbI.l + 120, tbI.y);
      const j0 = journal.length;
      await ev(`app.desktopManager.deleteDesktop('desk-hr')`);
      const wantI = sortIds(['win-fin-1-i', 'win-hr-1-i', 'win-hr-2-i', 'win-hr-3-i']);
      ok(await until(async () => J(sortIds(await serverIds('desk-fin'))) === J(wantI), 4000), 'I: the server\'s Fin holds all 4 within seconds, no input after the delete (the lane\'s ①: [fin-1] — HR deleted, its 3 windows in no record)', J(await serverIds('desk-fin')));
      const layI = await api('/api/layouts');
      ok(!layI.desktops?.['desk-hr'] && !(layI.desktopMeta || []).some((d) => d.id === 'desk-hr'), 'I: HR is gone from the server');
      ok(refusalsSince(j0).length === 0, 'I: no refusal', J(refusalsSince(j0)));
      await boot();
      ok(J(await ev(SHOWN)) === J(wantI), 'I: after a reload Fin shows all 4', J(await ev(SHOWN)));
    }
  } finally {
    try { cdpWs.close(); } catch { }
  }
})();

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
