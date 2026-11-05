#!/usr/bin/env node
// A PHONE NEVER REPLACES A DESKTOP'S ROWS, SEEN (lane phone-resume-keeps-layout — userW 2026-11-05 11:30Z: after his pod's rebuild
// the hub restarted, his PHONE page reconnected first and accepted «Resume all»; eleven desktops lost every window position and three
// desktops never visited since previewed EMPTY). The chrome half of scripts/test-layout-dup-storm.mjs §PR / the loop's §14: a
// worktree server of this tree (esbuild bundle) boots on four desktops — A (two windows), B (two), C (one), each a STOPPED
// conversation at its box, and D whose three conversations a phone wrote with no box — the transcripts on disk, a claude that never
// answers (VS_NO_REAL_CLI). Headless chrome over raw CDP:
//   ① a desktop page (1440×900) previews D as three dashed placeholders + the count «3» — never nothing (LAW 2); the shot. It visits
//      B and C (their conversations built as read-only views) and STAYS OPEN across the restart (r2 — userW's case: his desktop tab
//      was open while the phone resumed)
//   ② THE RESTART: the server ends and a new one boots over the same data/; the open desktop tab reconnects and its person presses
//      «Resume this session» on C's window — the resumed window IS row c-1 (same id, its box; r2 N1: the bar closed the window it
//      had just resumed); a PHONE page (390×844, touch) connects and the person accepts «Resume all 6» — the hub's records keep every
//      window id and every box (A/B/C), D's rows the same ids, still unplaced; the phone says ONCE «Resumed 6 conversations where
//      they were»; the open desktop tab's B windows become the live ones under their own ids at their boxes (r2 N2); no refusal
//   ③ a DESKTOP page connects and visits B, C, D, A: every conversation's window is its row at its box; D's are laid out and saved
//      with positions (its preview draws them as windows now); no refusal, no warn toast
//   ④ (r3 — the r2 acceptance's N1 + N2 doors) on that desktop page: c-1's session is stopped, its person presses «Resume this
//      session», the hub's answer is the no-transcript breaker (the one answer this suite injects: a claude that never answers cannot
//      say it), the rescued window shows «Try resuming anyway» and the person presses it — the retry re-opens row c-1 (live, same id,
//      its box); b-2's session is stopped and its sidebar card is pressed TWICE while the hub is slow — ONE create, ONE window (b-2)
// Screenshots go to $PRK_SHOTS_DIR when set (the lane's report), else nowhere.
import fs from 'node:fs';
import os from 'node:os';
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
const ROOT = scratch('prk-ui');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const SHOTS = process.env.PRK_SHOTS_DIR ? path.resolve(process.env.PRK_SHOTS_DIR) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const procs = new Set(); const worktrees = new Set(); let fakeHome = null;
// the conversations' folder: OUTSIDE /tmp/vs-* — session discovery skips every scratch() cwd (src/fixture-guard.js), and a resume
// needs its folder to exist (a missing one asks «Working directory is gone»)
const CONV = fs.mkdtempSync(path.join(os.tmpdir(), 'prk-conv-'));
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { endRootedProcesses(ROOT); } catch { }
  if (fakeHome) { try { endRootedProcesses(fakeHome); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  try { endRootedProcesses(CONV); } catch { }
  try { fs.rmSync(CONV, { recursive: true, force: true }); } catch { }
  if (fakeHome) { try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

// ── the record (invented words and ids; the measured shape) ──
const NAMES = ['Ledger', 'Tutor', 'Ops desk', 'Coursework', 'Trip planner', 'Van build', 'Quiz maker'];
const CID = (i) => `c0ffee2${i}-0000-4000-8000-00000000002${i}`;
const GB = (i) => ({ left: 0.04 + 0.11 * i, top: 0.05 + 0.05 * i, width: 0.34, height: 0.4 });
const AT = { 'a-1': ['desk-a', 0], 'b-1': ['desk-b', 1], 'b-2': ['desk-b', 2], 'c-1': ['desk-c', 3], 'd-1': ['desk-d', 4], 'd-2': ['desk-d', 5], 'd-3': ['desk-d', 6] };
const META = [{ id: 'desk-a', name: 'Desk A' }, { id: 'desk-b', name: 'Desk B' }, { id: 'desk-c', name: 'Desk C' }, { id: 'desk-d', name: 'Desk D' }];
const PLACED = Object.keys(AT).filter((id) => AT[id][0] !== 'desk-d');

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — the worktree server cannot run sessions here');
else await (async () => {
  fakeHome = scratchHome('prk-ui-home', fs);
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

  // the seven STOPPED conversations: a transcript each under the scratch HOME (the hub's discovery lists them stopped)
  const cwdOf = (i) => { const d = path.join(CONV, 'p' + i); fs.mkdirSync(d, { recursive: true }); return d; };
  for (let i = 0; i < 7; i++) {
    const cwd = cwdOf(i), dir = path.join(fakeHome, '.claude', 'projects', cwd.replace(/[/._]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, CID(i) + '.jsonl'), J({ type: 'user', cwd, sessionId: CID(i), uuid: `u000000${i}-0000-4000-8000-000000000001`, timestamp: '2026-11-05T10:00:00.000Z', message: { role: 'user', content: 'Notes for ' + NAMES[i] } }) + '\n');
  }
  const row = (id) => { const i = AT[id][1], o = { winId: id, title: `${NAMES[i]} — ${cwdOf(i)}`, type: 'chat', isMinimized: false, isMaximized: false, gridBounds: GB(i), zIndex: 100 + i, backend: 'claude', backendSessionId: CID(i), claudeSessionId: CID(i), cwd: cwdOf(i), serverSessionId: `sess-${i + 1}-31000` }; if (AT[id][0] === 'desk-d') { delete o.gridBounds; o.zIndex = 200 + i; } return o; };
  const filesWin = (id, gb) => { const d = path.join(ROOT, 'files', id); fs.mkdirSync(d, { recursive: true }); return { winId: id, title: id, type: 'files', isMinimized: false, isMaximized: false, gridBounds: gb, zIndex: 50, openSpec: { action: 'openFileExplorer', path: d }, explorerPath: d }; };
  const rec = (ids, extra = []) => ({ windows: [...ids.map(row), ...extra], grid: null, updatedAt: 1000 });
  const layouts = { current: null, autoSave: null, saved: {}, customGrids: [], desktopMeta: META.map((m) => ({ ...m })), desktops: {
    'desk-a': { autoSave: rec(['a-1'], [filesWin('a-f', { left: 0.55, top: 0.5, width: 0.4, height: 0.45 })]) }, 'desk-b': { autoSave: rec(['b-1', 'b-2']) },
    'desk-c': { autoSave: rec(['c-1']) }, 'desk-d': { autoSave: rec(['d-1', 'd-2', 'd-3']) } } };
  fs.rmSync(path.join(wt, 'data'), { recursive: true, force: true }); fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
  execFileSync('cp', ['-r', path.join(repo, 'data', 'bin'), path.join(wt, 'data', 'bin')]); // the tracked wrappers — without them every session dies at birth
  fs.writeFileSync(path.join(wt, 'data', 'layouts.json'), J(layouts, null, 1));
  let journal = '', srv = null;
  const boot = async () => {
    const at = journal.length;
    srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VS_NO_REAL_CLI: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
    return until(() => journal.slice(at).includes('Ready.'), 60000, 100);
  };
  if (!ok(await boot(), 'the worktree server booted', journal.slice(-800))) return;
  const api = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();
  const rows = async () => { const d = (await api('/api/layouts')).desktops; return Object.fromEntries(META.map((m) => [m.id, ((d[m.id] && d[m.id].autoSave.windows) || []).map((w) => [w.winId, w.gridBounds ? J(w.gridBounds) : null])])); };
  const BEFORE = await rows();

  // ── headless chrome over raw CDP ──
  const CDP = await freePort();
  const xdg = fs.mkdtempSync(path.join(ROOT, 'xdg-')); fs.chmodSync(xdg, 0o700);
  const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--window-size=1440,900', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: 'ignore', env: { PATH: process.env.PATH, HOME: fakeHome, XDG_RUNTIME_DIR: xdg } });
  procs.add(ch);
  const pages = async () => { try { return (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).filter((t) => t.type === 'page'); } catch { return []; } };
  let first = null; for (let i = 0; i < 120 && !first; i++) { first = (await pages())[0]; if (!first) await sleep(250); }
  if (!ok(!!first, 'chrome exposed a CDP page target')) return;
  // every toast a page shows, kept (they fade): window.__toasts = [[type, text]]
  const TOASTS = `(() => { window.__toasts = []; const seen = new WeakSet(); new MutationObserver(() => { for (const t of document.querySelectorAll('.global-toast')) { if (seen.has(t)) continue; seen.add(t); window.__toasts.push([t.className, (t.querySelector('.global-toast-body') || t).textContent]); } }).observe(document, { childList: true, subtree: true }); })();`; // `document`: a document-start script runs before <html> exists
  const client = async (wsUrl, { phone = false } = {}) => {
    const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r, e) => { sock.on('open', r); sock.on('error', e); });
    let seq = 0; const pend = new Map();
    sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(J({ id, method, params })); });
    const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('vibespace.lang', 'en'); } catch {}` + TOASTS });
    if (phone) { await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
    else await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const X = { send, ev, close: () => { try { sock.close(); } catch { } } };
    X.boot = async () => {
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      const up = await until(async () => { try { return await ev('!!(window.app && window.app.desktopManager && window.app.desktopManager.activeDesktopId)'); } catch { return false; } }, 30000, 200);
      if (up) await ev('window.app.ready');
      return up;
    };
    X.shot = async (name, clip = null) => { if (!SHOTS) return null; await sleep(300); const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 3 } } : {}) }); const f = path.join(SHOTS, name + '.png'); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); return f; };
    X.click = async (expr) => { const p = await ev(`(() => { const e = ${expr}; if (!e) return null; e.scrollIntoView?.({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); if (!p) return false; for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); return true; };
    X.toasts = () => ev('window.__toasts || []');
    return X;
  };
  const newPage = async (opts) => { const { targetId } = await P1.send('Target.createTarget', { url: 'about:blank', newWindow: true }); let pt = null; for (let i = 0; i < 40 && !pt; i++) { pt = (await pages()).find((t) => t.id === targetId); if (!pt) await sleep(150); } return pt ? client(pt.webSocketDebuggerUrl, opts) : null; };
  const P1 = await client(first.webSocketDebuggerUrl);
  const PREVIEW = (d) => `(() => { const p = document.querySelector('.desktop-preview[data-desktop-id="${d}"]'); if (!p) return null; const r = p.getBoundingClientRect(); return { box: { x: r.left - 2, y: r.top - 2, width: r.width + 4, height: r.height + 16 }, placeholders: p.querySelectorAll('.desktop-preview-win-unplaced').length, windows: p.querySelectorAll('.desktop-preview-win:not(.desktop-preview-win-unplaced)').length, badge: p.querySelector('.desktop-preview-unplaced')?.textContent || null, title: p.querySelector('.desktop-preview-unplaced')?.title || null, dashed: (() => { const x = p.querySelector('.desktop-preview-win-unplaced'); return x ? getComputedStyle(x).borderTopStyle : null; })() }; })()`;
  let PH = null, P2 = null;
  try {
    // ① a desktop page on the first server: D previews its three rows with no position
    ok(await P1.boot(), '① the desktop page (1440×900) booted');
    await until(async () => (await P1.ev(PREVIEW('desk-d'))) !== null, 10000, 200);
    const pv = await P1.ev(PREVIEW('desk-d'));
    ok(pv && pv.placeholders === 3 && pv.badge === '3' && /3 windows · not placed/.test(pv.title || '') && pv.dashed === 'dashed', '① LAW 2: Desk D (three rows a phone wrote with no box, never visited here) previews THREE dashed placeholders + the count «3» — never nothing (2.369.381: an empty preview)', pv);
    if (pv) await P1.shot('preview-desk-d-desktop', { x: Math.max(0, pv.box.x - 170), y: pv.box.y, width: pv.box.width + 176, height: pv.box.height });
    // …its own «Resume interrupted sessions?» offer is declined (the phone is the page that accepts it — the incident's order)
    const offer1 = `(() => { const d = [...document.querySelectorAll('.dialog')].find((x) => /Resume interrupted sessions/.test(x.textContent)); return d ? [...d.querySelectorAll('button')].find((x) => !/Resume all/.test(x.textContent)) || null : null; })()`;
    if (await until(async () => !!(await P1.ev(`!!${offer1}`)), 8000, 200)) { await P1.click(offer1); await sleep(500); }
    // …it visits B and C (each conversation built as a read-only view — stopped, its transcript here) and stays open
    const VIEW = (id) => `(() => { const w = app.wm.windows.get(${J(id)}), v = app.sessions.get(${J(id)}); return w ? { id: w.id, desk: w._desktopId, gb: w.gridBounds ? JSON.stringify(w.gridBounds) : null, readOnly: !!(v && v._readOnly), live: !!(v && v.sessionId && !v._readOnly), bar: !!w.element.querySelector('.chat-resume-btn') } : null; })()`;
    for (const [d, id] of [['desk-b', 'b-2'], ['desk-c', 'c-1']]) { await P1.click(`document.querySelector('.desktop-preview-wrapper .desktop-preview[data-desktop-id="${d}"]')`); await sleep(1800); await until(async () => !!(await P1.ev(VIEW(id)))?.readOnly, 15000, 200); } // a switch inside the last one's 1 s gate is not taken
    const views0 = await P1.ev(`[${['b-1', 'b-2', 'c-1'].map(VIEW).join(',')}]`), at0 = await P1.ev('app.desktopManager.activeDesktopId');
    ok(views0.every((v) => v && v.readOnly) && views0[2].bar, '① the desktop page visited B and C: b-1, b-2, c-1 built as read-only views of their stopped conversations (c-1 with its «Resume this session» bar)', { views0, at0 });

    // ② THE RESTART — the server ends; a new one boots over the same data/; the PHONE reconnects FIRST and accepts «Resume all»
    srv.kill('SIGTERM'); await until(() => srv.exitCode !== null || srv.signalCode !== null, 15000, 100); procs.delete(srv);
    if (!ok(await boot(), '② THE RESTART: the server ended and a new one booted over the same data/', journal.slice(-600))) return;
    const j0 = journal.length;
    // the desktop tab OPEN ACROSS THE RESTART reconnects; its person presses «Resume this session» on C's read-only window (N1)
    ok(await until(() => P1.ev('!!(app.ws && app.ws.connected)'), 30000, 250), '② the desktop tab open across the restart reconnected');
    await sleep(1500);
    ok(await P1.click(`app.wm.windows.get('c-1') && app.wm.windows.get('c-1').element.querySelector('.chat-resume-btn')`), '② its person presses «Resume this session» on c-1');
    await until(async () => { const v = await P1.ev(VIEW('c-1')); return !!(v && v.live); }, 20000, 250);
    const c1 = await P1.ev(VIEW('c-1'));
    const c1others = await P1.ev(`[...app.wm.windows.values()].filter((w) => w.id !== 'c-1' && w._openSpec && w._openSpec.backendSessionId === ${J(CID(3))}).map((w) => w.id)`);
    await sleep(1500);
    const afterBar = await rows();
    ok(!!c1 && c1.desk === 'desk-c' && c1.gb === J(GB(3)) && !c1others.length && J(afterBar['desk-c']) === J(BEFORE['desk-c']), '② N1 THE RESUME BAR: the resumed window IS row c-1 — same id, live, at its box on C; no second window; the hub\'s C row kept with its box (461b41f78: the bar closed the window it had just resumed)', { c1, c1others, c: afterBar['desk-c'] });
    PH = await newPage({ phone: true });
    ok(!!PH && await PH.boot(), '② the PHONE page (390×844, touch) reconnected first');
    const offer = `(() => { const d = [...document.querySelectorAll('.dialog')].find((x) => /Resume interrupted sessions/.test(x.textContent)); const b = d && [...d.querySelectorAll('button')].find((x) => /Resume all/.test(x.textContent)); return b ? b.textContent : null; })()`;
    ok(await until(async () => !!(await PH.ev(offer)), 15000, 200), '② the phone offers «Resume all» (the 2.250.0 offer: the stopped conversations of every desktop)', { offer: await PH.ev(offer).catch((e) => e.message), dialogs: await PH.ev(`[...document.querySelectorAll('.dialog, .modal, [role=dialog]')].map((d) => d.textContent.slice(0, 160))`).catch((e) => e.message), sessions: ((await api('/api/sessions')).sessions || []).map((x) => [x.sessionId, x.status, x.backend]).slice(0, 9), active: ((await api('/api/active')).sessions || []).length, wins: await PH.ev('[...app.wm.windows.keys()]').catch((e) => e.message) });
    const offered = await PH.ev(offer), N = Number((/Resume all (\d+)/.exec(offered || '') || [])[1]);
    await PH.shot('phone-offer');
    ok(await PH.click(`[...document.querySelectorAll('.dialog button')].find((x) => /Resume all/.test(x.textContent))`), `② the person presses «${offered}»`);
    await sleep(N * 400 + 2500); // the 400 ms stagger, the autosave's debounce, its sends
    const afterPhone = await rows();
    const keptPlaced = PLACED.every((id) => { const [d] = AT[id]; return J(afterPhone[d].find((r) => r[0] === id)) === J(BEFORE[d].find((r) => r[0] === id)); });
    const keptD = J(afterPhone['desk-d'].map((r) => r[0])) === J(['d-1', 'd-2', 'd-3']);
    const minted = Object.values(afterPhone).flat().map((r) => r[0]).filter((id) => !(id in AT) && id !== 'a-f');
    ok(N === 6 && keptPlaced && keptD && !minted.length, '② after the phone\'s «Resume all»: every desktop\'s rows on the hub keep their window ids and boxes (A, B, C), D its three ids — nothing minted, nothing dropped (2.369.381: new window ids, no box)', { offered, afterPhone, minted });
    const said = (await PH.toasts()).map((t) => t[1]);
    ok(said.filter((t) => /Resumed 6 conversations where they were/.test(t)).length === 1 && !said.some((t) => /kept|disagree/.test(t)), '② the phone says it ONCE: «Resumed 6 conversations where they were» — no refusal toast', said);
    ok(!/REFUSED/.test(journal.slice(j0)), '② the journal holds no refusal', journal.slice(j0).split('\n').filter((l) => /REFUSED/.test(l)).slice(0, 3));
    await PH.shot('phone-after-resume');
    // N2: the desktop tab open across the restart follows the phone's re-opened rows — its B windows are the live ones, same ids, same boxes
    await P1.click(`document.querySelector('.desktop-preview-wrapper .desktop-preview[data-desktop-id="desk-b"]')`);
    await until(async () => (await P1.ev(`[${['b-1', 'b-2'].map(VIEW).join(',')}]`)).every((x) => x && x.live && x.gb), 20000, 250); // the switch's replay places at +500 ms
    const bNow = await P1.ev(`[${['b-1', 'b-2'].map(VIEW).join(',')}]`);
    ok(bNow.every((v, k) => v && v.live && v.desk === 'desk-b' && v.gb === J(GB(k + 1))), '② N2 the desktop tab OPEN ACROSS THE RESTART: its B windows b-1, b-2 are the LIVE sessions under their own ids, at their boxes (461b41f78: dead views kept, the dead recipe written back)', bNow);
    await sleep(1500);
    const p1warn = (await P1.toasts()).filter((t) => /warn/.test(t[0])).map((t) => t[1]), midRows = await rows();
    ok(!p1warn.length && J(midRows['desk-b']) === J(BEFORE['desk-b']) && !/REFUSED/.test(journal.slice(j0)), '② …the open tab warns of nothing, the hub\'s B rows keep their ids and boxes, the journal holds no refusal', { p1warn, b: midRows['desk-b'] });

    // ③ a DESKTOP page connects and visits every desktop: windows where they were; D laid out and saved with positions
    P2 = await newPage({});
    ok(!!P2 && await P2.boot(), '③ a desktop page connected to the new server');
    const pv2 = await P2.ev(PREVIEW('desk-d'));
    if (pv2) await P2.shot('preview-desk-d-after-phone', { x: Math.max(0, pv2.box.x - 170), y: pv2.box.y, width: pv2.box.width + 176, height: pv2.box.height });
    const where = `(() => Object.fromEntries([...app.wm.windows.values()].filter((w) => ${J(Object.keys(AT))}.includes(w.id)).map((w) => [w.id, [w._desktopId, w.gridBounds ? JSON.stringify(w.gridBounds) : null]])))()`;
    for (const d of ['desk-b', 'desk-c', 'desk-d', 'desk-a']) { await P2.click(`document.querySelector('.desktop-preview-wrapper .desktop-preview[data-desktop-id="${d}"]')`); await sleep(1800); }
    const seen = await P2.ev(where);
    const atBox = PLACED.every((id) => seen[id] && seen[id][0] === AT[id][0] && seen[id][1] === J(GB(AT[id][1])));
    const dOn = ['d-1', 'd-2', 'd-3'].every((id) => seen[id] && seen[id][0] === 'desk-d' && seen[id][1]);
    ok(atBox && dOn, '③ the desktop page visited B, C, D, A: every conversation\'s window is its row, on its desktop, at its box; D\'s three laid out', seen);
    await sleep(1500);
    const final = await rows();
    const dPlaced = final['desk-d'].length === 3 && final['desk-d'].every((r) => r[1]);
    ok(PLACED.every((id) => { const [d] = AT[id]; return J(final[d].find((r) => r[0] === id)) === J(BEFORE[d].find((r) => r[0] === id)); }) && dPlaced, '③ …the hub\'s records: A, B, C exactly as before the restart; D\'s rows saved WITH positions now (visiting lays them out)', final);
    const said2 = (await P2.toasts()).filter((t) => /warn/.test(t[0])).map((t) => t[1]);
    ok(!said2.length && !/REFUSED/.test(journal.slice(j0)), '③ no refusal on either page, no warn toast on the desktop page', { said2, refused: journal.slice(j0).split('\n').filter((l) => /REFUSED/.test(l)).slice(0, 3) });
    const pv3 = await P2.ev(PREVIEW('desk-d'));
    ok(pv3 && pv3.placeholders === 0 && pv3.windows === 3 && !pv3.badge, '③ …and D previews its three windows where they now stand (no placeholder)', pv3);
    if (pv3) await P2.shot('preview-desk-d-after-visit', { x: Math.max(0, pv3.box.x - 170), y: pv3.box.y, width: pv3.box.width + 176, height: pv3.box.height });
    await P2.shot('desktop-after-visits');

    // ④ THE RETRY BAR (r3 N1) — c-1's session stopped, «Resume this session» answered by the no-transcript breaker, «Try resuming anyway»
    const live = async (id) => !!(await P2.ev(VIEW(id)))?.live;
    const winsOf = (cid) => P2.ev(`[...app.wm.windows.values()].filter((w) => (w._openSpec && w._openSpec.backendSessionId === ${J(cid)}) || (w._conversation && w._conversation.backendSessionId === ${J(cid)})).map((w) => w.id)`);
    await P2.click(`document.querySelector('.desktop-preview-wrapper .desktop-preview[data-desktop-id="desk-c"]')`); await sleep(1800);
    const killConv = (cid) => P2.ev(`(() => { const e = [...app.sessions.entries()].find(([id, v]) => v && v.sessionId && !v._readOnly && app.wm.windows.get(id)?._openSpec?.backendSessionId === ${J(cid)}); if (e) app.killSession(e[1].sessionId, ${J(cid)}); return !!e; })()`); // the conversation's live window, whatever its id
    await killConv(CID(3));
    ok(await until(async () => !!(await P2.ev(VIEW('c-1')))?.bar, 20000, 250), '④ c-1\'s session stopped: its window shows «Resume this session»');
    await P2.ev(`(() => { const ws = app.ws, orig = ws.request.bind(ws); window.__creates = []; ws.request = function (m, cb, o) { if (m && m.type === 'create') window.__creates.push([m.resumeId, !!m.ignoreNoConvo]); if (m && m.type === 'create' && m.resumeId === ${J(CID(3))} && !m.ignoreNoConvo && !window.__brk) { window.__brk = 1; setTimeout(() => cb({ type: 'error', code: 'no-convo-breaker', transcriptKnown: false, message: 'No conversation found', reqId: m.reqId }), 50); return () => {}; } return orig(m, cb, o); }; return true; })()`);
    ok(await P2.click(`app.wm.windows.get('c-1') && app.wm.windows.get('c-1').element.querySelector('.chat-resume-btn')`), '④ the person presses «Resume this session» on c-1 (the hub answers the no-transcript breaker)');
    const retryBtn = `(() => { const w = app.wm.windows.get('c-1'); return w ? [...w.element.querySelectorAll('.chat-resume-btn')].find((b) => /Try resuming anyway/.test(b.textContent)) || null : null; })()`;
    ok(await until(async () => !!(await P2.ev(`!!${retryBtn}`)), 15000, 200), '④ …the rescued window shows «Try resuming anyway»');
    await P2.shot('retry-bar');
    ok(await P2.click(retryBtn), '④ the person presses «Try resuming anyway»');
    await until(() => live('c-1'), 20000, 250);
    await sleep(1500);
    const c1r = await P2.ev(VIEW('c-1')), c1w = await winsOf(CID(3)), crs = await P2.ev('window.__creates'), cRows = await rows();
    ok(!!c1r && c1r.live && c1r.desk === 'desk-c' && c1r.gb === J(GB(3)) && J(c1w) === J(['c-1']) && crs.length === 2 && crs[1][1] === true && J(cRows['desk-c']) === J(BEFORE['desk-c']),
      '④ N1 «TRY RESUMING ANYWAY» re-opens row c-1: one retry create, the conversation\'s ONE window is c-1 — live, at its box on C; the hub\'s C row kept with its box (d159c081b: the bar closed the window its retry had re-opened — no window, the row gone)', { c1r, c1w, crs, c: cRows['desk-c'] });
    // ④ THE DOUBLE PRESS (r3 N2) — b-2's session stopped; its sidebar card pressed twice inside 200 ms while the hub takes 700 ms
    await P2.click(`document.querySelector('.desktop-preview-wrapper .desktop-preview[data-desktop-id="desk-b"]')`); await sleep(1800);
    await killConv(CID(2));
    // its card: a STOPPED card draws no status dot (session-card: stopped is the default state); the sidebar's list says stopped
    const card = `((app.sidebar._allSessions || []).some((s) => (s.backendSessionId || s.sessionId) === ${J(CID(2))} && s.status === 'stopped') && [...document.querySelectorAll('.session-item-card')].find((c) => c._sessionId === ${J(CID(2))} && !c.querySelector('.conn-corner-dot'))) || null`;
    ok(await until(async () => !!(await P2.ev(`!!(${card})`)) && !!(await P2.ev(VIEW('b-2')))?.readOnly, 20000, 250), '④ b-2\'s session stopped: its sidebar card says so, its window is read-only');
    await P2.ev('(app.sidebar.isOpen || app.sidebar.toggle(true)), true'); await sleep(800); // the person opens the sidebar
    await P2.ev(`(() => { const ws = app.ws, send = ws.send.bind(ws); window.__sent = 0; ws.send = function (m) { if (m && m.type === 'create') { window.__sent++; setTimeout(() => send(m), 700); return; } return send(m); }; return true; })()`);
    const pc = await P2.ev(`(() => { const e = ${card}; if (!e) return null; e.scrollIntoView?.({ block: 'center' }); const r = e.getBoundingClientRect(), x = r.left + Math.min(r.width / 2, 40), y = r.top + Math.min(r.height / 2, 14), at = document.elementFromPoint(x, y); return { x, y, w: r.width, h: r.height, hit: at ? (at === e || e.contains(at)) : false, at: at ? at.className : null, open: !!app.sidebar.isOpen }; })()`);
    if (pc) for (const dt of [0, 150]) { await sleep(dt); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await P2.send('Input.dispatchMouseEvent', { type, x: pc.x, y: pc.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); }
    await until(() => live('b-2'), 20000, 250);
    await sleep(1500);
    const b2 = await P2.ev(VIEW('b-2')), b2w = await winsOf(CID(2)), sent = await P2.ev('window.__sent'), bRows = await rows();
    ok(!!pc && sent === 1 && !!b2 && b2.live && b2.desk === 'desk-b' && b2.gb === J(GB(2)) && J(b2w) === J(['b-2']) && J(bRows['desk-b']) === J(BEFORE['desk-b']),
      '④ N2 b-2\'s card pressed TWICE inside 200 ms while the hub is slow: ONE create, the conversation\'s ONE window is b-2 — live, at its box on B; the hub\'s B rows kept (d159c081b: the second press closed the first one\'s window in flight)', { pressed: pc, sent, b2, b2w, b: bRows['desk-b'] });
    const said4 = (await P2.toasts()).filter((t) => /warn/.test(t[0])).map((t) => t[1]);
    ok(!said4.length && !/REFUSED/.test(journal.slice(j0)), '④ no refusal, no warn toast', { said4 });
    await P2.shot('desktop-after-retry-and-double-press');
  } catch (e) {
    ok(false, 'the suite threw', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
  } finally {
    for (const X of [P1, PH, P2]) { try { X && X.close(); } catch { } }
  }
})();

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
