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
//      its box); b-2's session is stopped and its sidebar card is pressed TWICE while the hub is slow — ONE create, ONE window (b-2).
//      THE FOLLOWERS' LAW (主开发 r107): the desktop tab and the phone, still open, FOLLOW these resumes (the manager design's piece 4)
//      and write their records; every «no refusal» leg of ②–④ PRINTS its refusing lines and admits only the followers' tie (the
//      older-base kind, N → N); the PHONE FOLLOWER'S TIE IS MADE at b-2 (its first Desk B frame held until the hub kept a newer
//      record): refused once, it adopts and sends once more, the row keeps its id and box, nothing shown, the layer gate silent —
//      with two CONTROLS that are red; every open page's toasts judged
//   ⑤ (lane bl-windows — B-46fc's own gate, the 2.369.410 close's remainder: «a chrome leg that opens a window and reloads at
//      500 ms ⇒ the same window is on show») on that desktop page: the person's press on the top bar's Files button opens a
//      window and the page RELOADS with that save still due — the save HELD in the page before the press (a stall, never the
//      clock), so the leave's flush is its only road ⇒ after the reload the window is on show again and the hub's record holds
//      it; RED CONTROL first (the release: no flush at the leave) ⇒ gone after the reload, no row. Each plant comes only after every
//      record has gone QUIET and the page's two restoring gates are down (measured, never a clock); the gaps between the judged
//      windows are judged too, and every page's tap is asserted where its facts are read
//   ⑥ (lane lg-recovery — B-46fc part 2) a socket NOT OPEN at the reload: the leave's flush queues the save in the closed socket and the
//      page hands the queue to POST /api/layout-sync (fetch keepalive) ⇒ the window is on show after the reload; RED the hand-off cut
//   ⑦ (its round wgk4tnn0w) a page that only goes HIDDEN offline: the hand-off's request fails ⇒ the frame stays OWED and the socket carries
//      it when the page is shown and reconnects (the hub holds the window); RED the first cut's swallow (the frame lost)
// Screenshots go to $PRK_SHOTS_DIR when set (the lane's report), else nowhere.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses, CHROME_STORE, realClicker, CHROME_QUIET } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
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
  if (!ok(verdictOf(await boot()), 'the worktree server booted', journal.slice(-800))) return;
  const api = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();
  const rows = async () => { const d = (await api('/api/layouts')).desktops; return Object.fromEntries(META.map((m) => [m.id, ((d[m.id] && d[m.id].autoSave.windows) || []).map((w) => [w.winId, w.gridBounds ? J(w.gridBounds) : null])])); };
  const BEFORE = await rows();

  // ── headless chrome over raw CDP ──
  const CDP = await freePort();
  const xdg = fs.mkdtempSync(path.join(ROOT, 'xdg-')); fs.chmodSync(xdg, 0o700);
  const ch = spawn(CHROME, [...CHROME_QUIET, ...CHROME_STORE, '--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--window-size=1440,900', `--user-data-dir=${path.join(ROOT, 'chrome')}`, 'about:blank'], { stdio: 'ignore', env: { PATH: process.env.PATH, HOME: fakeHome, XDG_RUNTIME_DIR: xdg } });
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
  // ── THE FOLLOWERS' LAW, read from the journal AND the pages (主开发 r107, 2026-11-20 — the cut tree's hosted run 44719731500: ④'s
  //    «no refusal» red on its first try with no line printed, ⑤'s plant read «gate up»). The manager design's piece 4 makes every
  //    OTHER open page that holds a resumed conversation's ENDED window turn that row live and owe the hub its record
  //    (src/lib/session-lifecycle.js _followResumed): the desktop tab and the phone stay open here while another page resumes, so two
  //    writers of one desktop's record from one base TIE, and the hub refuses the second from its older base ONCE (it adopts the
  //    record kept and sends once more — scripts/test-resume-pages-follow-chrome.mjs followLaw, list line 155). So every «no refusal»
  //    leg PRINTS each refusing line of its window, green or red, and admits ONLY that tie: the older-base kind, N → N windows, at most
  //    one a follower a followed resume. The other four kinds the hub writes for a desktop record (src/ws-handler.js: no such desktop,
  //    the shrink belt, a tab group's rows disagreeing, the layer gate of a phone record) stay RED by name.
  const STALE = /\[layout-sync\] REFUSED a (?:phone |desktop )?record of desktop "[^"]*" \(([^)]+)\): written from an older base \([^)]*\) — (\d+) → (\d+) windows; the sender adopts the record kept/;
  const refusedSince = (from) => journal.slice(from).split('\n').filter((l) => /REFUSED/.test(l));
  const journalLaw = (lines, maxStale) => {
    const why = []; let stale = 0;
    for (const l of lines) { const m = STALE.exec(l); if (!m) why.push(`a refusal that is NOT the followers' tie: ${l.slice(Math.max(0, l.indexOf('REFUSED') - 14), 260)}`); else if (m[2] !== m[3]) why.push(`a stale refusal that changes the window count ${m[2]} → ${m[3]}`); else stale++; }
    if (stale > maxStale) why.push(`${stale} stale refusals for at most ${maxStale} (one a follower a followed resume)`);
    return { ok: !why.length, why, stale };
  };
  const printRefused = (tag, lines) => console.log(`    [${tag} the journal's refusing lines] ${lines.length ? lines.map((l) => l.slice(Math.max(0, l.indexOf('[layout-sync]')), 300)).join(' | ') : 'none'}`);
  const warnsOf = async () => { const w = async (X) => (X ? ((await X.toasts()) || []).filter((t) => /warn/.test(t[0])).map((t) => t[1]) : []); return { P1: await w(P1), PH: await w(PH), P2: await w(P2) }; };
  // THE SETTLE, MEASURED (law 3 — never a clock): the hub's records of every desktop unchanged and no new refusal for 2.5 s (bounded
  // at 25 s), then this page's two restoring gates down (layout.js _restoring — up 1 s after every remote apply — and the desktop
  // manager's). → { ok, quiet, gates, waitedMs }
  // (the round's should: a frame the hub drops as a storm — ws-handler's layoutStormed — writes no line and moves no record; each tapped
  // page's own count of the frames it sent joins the stamp, so such a page is never «quiet»)
  const recStamp = async () => { const l = await api('/api/layouts'); const sent = []; for (const X of [P1, PH, P2]) sent.push(X ? await X.ev('(window.__syncs || []).length').catch(() => -1) : 0); return J(Object.fromEntries(Object.entries(l.desktops || {}).map(([d, x]) => [d, (x.autoSave || {}).updatedAt || null]))) + '|' + refusedSince(0).length + '|' + sent.join(','); };
  const settle = async (X = P2, still = 2500, ms = 25000) => {
    const t0s = Date.now(); let last = null, since = Date.now(), quiet = false;
    while (Date.now() - t0s < ms) { const f = await recStamp(); if (f !== last) { last = f; since = Date.now(); } else if (Date.now() - since >= still) { quiet = true; break; } await sleep(200); }
    let gates = null;
    const down = quiet && !!X && await until(async () => { gates = await X.ev('(() => { const lm = app.layoutManager, dm = app.desktopManager; return { layout: !!lm._restoring, desktops: !!(dm && dm._restoring) }; })()'); return !gates.layout && !gates.desktops; }, 5000, 100);
    return { ok: quiet && !!down, quiet, gates, waitedMs: Date.now() - t0s };
  };
  // each page's own facts (law 1, 4): the layout-sync frames it SENT and the refusals it RECEIVED; a desktop whose FIRST frame it holds
  // until `__releaseOut()` (the made tie). Installed on the page's current socket; a page that reloads is tapped again
  const TAP = `(() => { window.__syncs = window.__syncs || []; window.__refused = window.__refused || []; window.__holdOut = null; window.__heldOut = [];
    const ws = app.ws;
    if (!ws.__vsSendTapped) { const s = ws.send.bind(ws); ws.send = function (m) { if (m && m.type === 'layout-sync') { if (window.__holdOut && m.desktopId === window.__holdOut && !window.__heldOut.length) { window.__heldOut.push(m); return; } window.__syncs.push([m.desktopId || null, Date.now(), m.viewport || null]); } return s(m); };
      window.__releaseOut = () => { const q = window.__heldOut.splice(0); window.__holdOut = null; for (const m of q) { window.__syncs.push([m.desktopId || null, Date.now(), m.viewport || null]); s(m); } return q.length; }; ws.__vsSendTapped = true; }
    window.__acks = window.__acks || [];
    const raw = ws.ws; if (raw && !raw.__vsTapped) { const on = raw.onmessage; raw.onmessage = function (e) { let d = null; try { d = JSON.parse(e.data); } catch { } if (d && d.type === 'layout-sync-refused') window.__refused.push([d.desktopId || null, d.reason || null, Date.now()]); if (d && d.type === 'layout-sync-ack') window.__acks.push([d.desktopId || null, d.sentAt ?? null, Date.now()]); return on.call(this, e); }; raw.__vsTapped = true; }
    return !!(raw && raw.__vsTapped); })()`;
  const factsOf = async (X, desk, from) => ({ sends: (await X.ev('window.__syncs || []')).filter(([d, at]) => d === desk && at >= from).length, refused: (await X.ev('window.__refused || []')).filter(([d, , at]) => d === desk && at >= from).map((r) => r[1]), acks: (await X.ev('window.__acks || []')).filter(([d, , at]) => d === desk && at >= from).length, tapped: await X.ev('!!(app.ws.ws && app.ws.ws.__vsTapped)') });
  // THE PHONE FOLLOWER'S TIE (law 4), PURE: the phone followed a resume and its record was refused once from an older base ⇒ it adopted
  // the record kept and sent ONE more, accepted; then nothing; the row kept its id and box; the phone showed nothing; the layer gate
  // refused nothing. → { ok, why }
  const phoneTieLaw = ({ sends, refused, sendsLater, refusedLater, acks, tapped, lines, rowKept, shown }) => {
    const why = [];
    if (tapped === false) why.push("the phone's socket was replaced (a reconnect): its refusals and acks were no longer read");
    if (!(acks >= 1)) why.push('no layout-sync-ack of the desktop reached the phone after its frame was refused — its ONE more frame was not accepted');
    if (refused.length !== 1 || refused[0] !== 'stale') why.push(`the phone received ${J(refused)} — exactly ONE stale refusal is owed`);
    if (sends !== 2) why.push(`the phone sent ${sends} frame(s) of the desktop — its first and ONE more from the record it adopted`);
    if (sendsLater !== sends || refusedLater !== refused.length) why.push(`the phone sent ${sendsLater - sends} frame(s) / was refused ${refusedLater - refused.length} time(s) after the settle — its frames never ended`);
    const gate = lines.filter((l) => /REFUSED a phone record of desktop .*: it changes /.test(l));
    if (gate.length) why.push(`the layer gate refused the phone's record: ${gate[0].slice(gate[0].indexOf('REFUSED'), 220)}`);
    const st = lines.filter((l) => STALE.test(l) && /REFUSED a phone record/.test(l));
    if (st.length !== 1) why.push(`the journal holds ${st.length} stale phone line(s) — ONE is owed`);
    else { const m = STALE.exec(st[0]); if (m[2] !== m[3]) why.push(`the phone's stale line reads ${m[2]} → ${m[3]} windows — a window lost`); }
    if (!rowKept) why.push("the row did not keep its id and box in the hub's record");
    if (shown.length) why.push(`the phone showed the person a toast at the tie: ${shown[0]}`);
    return { ok: !why.length, why };
  };
  try {
    // ① a desktop page on the first server: D previews its three rows with no position
    ok(verdictOf(await P1.boot()), '① the desktop page (1440×900) booted');
    await until(async () => (await P1.ev(PREVIEW('desk-d'))) !== null, 10000, 200);
    const pv = await P1.ev(PREVIEW('desk-d'));
    ok(gateOf(pv) && pv.placeholders === 3 && pv.badge === '3' && gateOf(/3 windows · not placed/.test(pv.title || '')) && pv.dashed === 'dashed', '① LAW 2: Desk D (three rows a phone wrote with no box, never visited here) previews THREE dashed placeholders + the count «3» — never nothing (2.369.381: an empty preview)', pv);
    if (pv) await P1.shot('preview-desk-d-desktop', { x: Math.max(0, pv.box.x - 170), y: pv.box.y, width: pv.box.width + 176, height: pv.box.height });
    // …its own «Resume interrupted sessions?» offer is declined (the phone is the page that accepts it — the incident's order)
    const offer1 = `(() => { const d = [...document.querySelectorAll('.dialog')].find((x) => /Resume interrupted sessions/.test(x.textContent)); return d ? [...d.querySelectorAll('button')].find((x) => !/Resume all/.test(x.textContent)) || null : null; })()`;
    if (await until(async () => !!(await P1.ev(`!!${offer1}`)), 8000, 200)) { await P1.click(offer1); await sleep(500); }
    // …it visits B and C (each conversation built as a read-only view — stopped, its transcript here) and stays open
    const VIEW = (id) => `(() => { const w = app.wm.windows.get(${J(id)}), v = app.sessions.get(${J(id)}); return w ? { id: w.id, desk: w._desktopId, gb: w.gridBounds ? JSON.stringify(w.gridBounds) : null, readOnly: !!(v && v._readOnly), live: !!(v && v.sessionId && !v._readOnly), bar: !!w.element.querySelector('.chat-resume-btn') } : null; })()`;
    for (const [d, id] of [['desk-b', 'b-2'], ['desk-c', 'c-1']]) { await P1.click(`document.querySelector('.desktop-preview-wrapper .desktop-preview[data-desktop-id="${d}"]')`); await sleep(1800); await until(async () => !!(await P1.ev(VIEW(id)))?.readOnly, 15000, 200); } // a switch inside the last one's 1 s gate is not taken
    const views0 = await P1.ev(`[${['b-1', 'b-2', 'c-1'].map(VIEW).join(',')}]`), at0 = await P1.ev('app.desktopManager.activeDesktopId');
    ok(gateOf(views0.every((v) => v && v.readOnly)) && verdictOf(views0[2].bar), '① the desktop page visited B and C: b-1, b-2, c-1 built as read-only views of their stopped conversations (c-1 with its «Resume this session» bar)', { views0, at0 });

    // ② THE RESTART — the server ends; a new one boots over the same data/; the PHONE reconnects FIRST and accepts «Resume all»
    srv.kill('SIGTERM'); await until(() => srv.exitCode !== null || srv.signalCode !== null, 15000, 100); procs.delete(srv);
    if (!ok(verdictOf(await boot()), '② THE RESTART: the server ended and a new one booted over the same data/', journal.slice(-600))) return;
    const j0 = journal.length;
    // the desktop tab OPEN ACROSS THE RESTART reconnects; its person presses «Resume this session» on C's read-only window (N1)
    ok(verdictOf(await until(() => P1.ev('!!(app.ws && app.ws.connected)'), 30000, 250)), '② the desktop tab open across the restart reconnected');
    const tR = Date.now(); await P1.ev(TAP);   // ②'s per-page facts: the tab's sends and the refusals it receives, from its new socket
    await sleep(1500);
    ok(verdictOf(await P1.click(`app.wm.windows.get('c-1') && app.wm.windows.get('c-1').element.querySelector('.chat-resume-btn')`)), '② its person presses «Resume this session» on c-1');
    await until(async () => { const v = await P1.ev(VIEW('c-1')); return !!(v && v.live); }, 20000, 250);
    const c1 = await P1.ev(VIEW('c-1'));
    const c1others = await P1.ev(`[...app.wm.windows.values()].filter((w) => w.id !== 'c-1' && w._openSpec && w._openSpec.backendSessionId === ${J(CID(3))}).map((w) => w.id)`);
    await sleep(1500);
    const afterBar = await rows();
    ok(!!c1 && c1.desk === 'desk-c' && c1.gb === J(GB(3)) && !c1others.length && J(afterBar['desk-c']) === J(BEFORE['desk-c']), '② N1 THE RESUME BAR: the resumed window IS row c-1 — same id, live, at its box on C; no second window; the hub\'s C row kept with its box (461b41f78: the bar closed the window it had just resumed)', { c1, c1others, c: afterBar['desk-c'] });
    PH = await newPage({ phone: true });
    ok(!!PH && verdictOf(await PH.boot()), '② the PHONE page (390×844, touch) reconnected first');
    const phTapped = PH ? await PH.ev(TAP).catch(() => false) : false;
    const offer = `(() => { const d = [...document.querySelectorAll('.dialog')].find((x) => /Resume interrupted sessions/.test(x.textContent)); const b = d && [...d.querySelectorAll('button')].find((x) => /Resume all/.test(x.textContent)); return b ? b.textContent : null; })()`;
    ok(verdictOf(await until(async () => !!(await PH.ev(offer)), 15000, 200)), '② the phone offers «Resume all» (the 2.250.0 offer: the stopped conversations of every desktop)', { offer: await PH.ev(offer).catch((e) => e.message), dialogs: await PH.ev(`[...document.querySelectorAll('.dialog, .modal, [role=dialog]')].map((d) => d.textContent.slice(0, 160))`).catch((e) => e.message), sessions: ((await api('/api/sessions')).sessions || []).map((x) => [x.sessionId, x.status, x.backend]).slice(0, 9), active: ((await api('/api/active')).sessions || []).length, wins: await PH.ev('[...app.wm.windows.keys()]').catch((e) => e.message) });
    const offered = await PH.ev(offer), N = Number((/Resume all (\d+)/.exec(offered || '') || [])[1]);
    await PH.shot('phone-offer');
    ok(verdictOf(await PH.click(`[...document.querySelectorAll('.dialog button')].find((x) => /Resume all/.test(x.textContent))`)), `② the person presses «${offered}»`);
    await sleep(N * 400 + 2500); // the 400 ms stagger, the autosave's debounce, its sends
    const afterPhone = await rows();
    const keptPlaced = PLACED.every((id) => { const [d] = AT[id]; return J(afterPhone[d].find((r) => r[0] === id)) === J(BEFORE[d].find((r) => r[0] === id)); });
    const keptD = J(afterPhone['desk-d'].map((r) => r[0])) === J(['d-1', 'd-2', 'd-3']);
    const minted = Object.values(afterPhone).flat().map((r) => r[0]).filter((id) => !(id in AT) && id !== 'a-f');
    ok(N === 6 && gateOf(keptPlaced) && gateOf(keptD) && !minted.length, '② after the phone\'s «Resume all»: every desktop\'s rows on the hub keep their window ids and boxes (A, B, C), D its three ids — nothing minted, nothing dropped (2.369.381: new window ids, no box)', { offered, afterPhone, minted });
    const said = (await PH.toasts()).map((t) => t[1]);
    ok(said.filter((t) => /Resumed 6 conversations where they were/.test(t)).length === 1 && !said.some((t) => /kept|disagree/.test(t)), '② the phone says it ONCE: «Resumed 6 conversations where they were» — no refusal toast', said);
    const lines2 = refusedSince(j0), law2 = journalLaw(lines2, 3); printRefused('②', lines2);
    ok(verdictOf(law2.ok), '② the journal holds no refusal but the followers\' tie (the desktop tab follows the phone\'s resumes of a-1 — it booted on Desk A — b-1 and b-2: the older-base kind, N → N windows, at most one a resume)', { why: law2.why, lines: lines2 });
    await PH.shot('phone-after-resume');
    // N2: the desktop tab open across the restart follows the phone's re-opened rows — its B windows are the live ones, same ids, same boxes
    await P1.click(`document.querySelector('.desktop-preview-wrapper .desktop-preview[data-desktop-id="desk-b"]')`);
    await until(async () => (await P1.ev(`[${['b-1', 'b-2'].map(VIEW).join(',')}]`)).every((x) => x && x.live && x.gb), 20000, 250); // the switch's replay places at +500 ms
    const bNow = await P1.ev(`[${['b-1', 'b-2'].map(VIEW).join(',')}]`);
    ok(verdictOf(bNow.every((v, k) => v && v.live && v.desk === 'desk-b' && v.gb === J(GB(k + 1)))), '② N2 the desktop tab OPEN ACROSS THE RESTART: its B windows b-1, b-2 are the LIVE sessions under their own ids, at their boxes (461b41f78: dead views kept, the dead recipe written back)', bNow);
    const s2 = await settle(P1);   // what happened, not a clock: the records quiet, the tab's gates down
    const p1warn = (await P1.toasts()).filter((t) => /warn/.test(t[0])).map((t) => t[1]), midRows = await rows();
    const lines2b = refusedSince(j0), law2b = journalLaw(lines2b, 3), j2e = journal.length; printRefused('② …', lines2b);
    // ② per page, bounded by the followed resumes ON EACH DESKTOP (the read's must: Desk B holds TWO followed resumes — b-1, then b-2 400 ms
    // later — so the desktop tab, or the phone it ties with, may be refused once for each; every other desktop at most once)
    const CAP2 = { 'desk-b': 2 };
    const per2 = {}; for (const [k, X] of [['P1', P1], ['PH', PH]]) { const t = X ? await X.ev('!!(app.ws.ws && app.ws.ws.__vsTapped)').catch(() => false) : false; for (const d of META.map((m) => m.id)) per2[`${k} ${d}`] = t ? (await factsOf(X, d, tR)).refused : ['NOT TAPPED']; }
    const over2 = Object.entries(per2).filter(([kd, r]) => r[0] === 'NOT TAPPED' || r.length > (CAP2[kd.split(' ')[1]] || 1));
    ok(!over2.length && phTapped !== false, '② per page: no open page refused more often for a desktop than that desktop\'s followed resumes (Desk B twice: b-1 and b-2; every other desktop once) — the desktop tab and the phone, each tapped from its socket', { over2, per2, phTapped });
    ok(gateOf(s2.ok) && !p1warn.length && J(midRows['desk-b']) === J(BEFORE['desk-b']) && verdictOf(law2b.ok), '② …the open tab warns of nothing, the hub\'s B rows keep their ids and boxes, the journal holds no refusal but the followers\' tie', { settled: s2, p1warn, b: midRows['desk-b'], why: law2b.why, lines: lines2b });

    // ③ a DESKTOP page connects and visits every desktop: windows where they were; D laid out and saved with positions
    const s3 = await settle(P1), j3 = journal.length;   // ③'s window opens once ②'s followers have gone quiet
    const gap23 = journal.slice(j2e, j3).split('\n').filter((l) => /REFUSED/.test(l)); printRefused('②→③ (the gap)', gap23);
    ok(!gap23.length, '② → ③: nothing refused between ②\'s judge and ③\'s window (the round\'s should: every refusing line falls in a judged window)', gap23);
    P2 = await newPage({});
    ok(!!P2 && verdictOf(await P2.boot()), '③ a desktop page connected to the new server');
    const pv2 = await P2.ev(PREVIEW('desk-d'));
    if (pv2) await P2.shot('preview-desk-d-after-phone', { x: Math.max(0, pv2.box.x - 170), y: pv2.box.y, width: pv2.box.width + 176, height: pv2.box.height });
    const where = `(() => Object.fromEntries([...app.wm.windows.values()].filter((w) => ${J(Object.keys(AT))}.includes(w.id)).map((w) => [w.id, [w._desktopId, w.gridBounds ? JSON.stringify(w.gridBounds) : null]])))()`;
    for (const d of ['desk-b', 'desk-c', 'desk-d', 'desk-a']) { await P2.click(`document.querySelector('.desktop-preview-wrapper .desktop-preview[data-desktop-id="${d}"]')`); await sleep(1800); }
    const seen = await P2.ev(where);
    const atBox = PLACED.every((id) => seen[id] && seen[id][0] === AT[id][0] && seen[id][1] === J(GB(AT[id][1])));
    const dOn = ['d-1', 'd-2', 'd-3'].every((id) => seen[id] && seen[id][0] === 'desk-d' && seen[id][1]);
    ok(gateOf(atBox) && verdictOf(dOn), '③ the desktop page visited B, C, D, A: every conversation\'s window is its row, on its desktop, at its box; D\'s three laid out', seen);
    await sleep(1500);
    const final = await rows();
    const dPlaced = final['desk-d'].length === 3 && final['desk-d'].every((r) => r[1]);
    ok(gateOf(PLACED.every((id) => { const [d] = AT[id]; return J(final[d].find((r) => r[0] === id)) === J(BEFORE[d].find((r) => r[0] === id)); })) && verdictOf(dPlaced), '③ …the hub\'s records: A, B, C exactly as before the restart; D\'s rows saved WITH positions now (visiting lays them out)', final);
    const lines3 = refusedSince(j3), law3 = journalLaw(lines3, 0), warns3 = await warnsOf(), j3e = journal.length; printRefused('③', lines3);
    ok(gateOf(s3.ok) && gateOf(law3.ok) && !warns3.P1.length && !warns3.PH.length && !warns3.P2.length, '③ no refusal on any page (nothing is resumed here: no follower, no tie owed), no warn toast on ANY open page (the desktop tab, the phone, this page) — after ②\'s followers had gone quiet', { settled: s3, why: law3.why, lines: lines3, warns3 });
    const pv3 = await P2.ev(PREVIEW('desk-d'));
    ok(gateOf(pv3) && pv3.placeholders === 0 && pv3.windows === 3 && !pv3.badge, '③ …and D previews its three windows where they now stand (no placeholder)', pv3);
    if (pv3) await P2.shot('preview-desk-d-after-visit', { x: Math.max(0, pv3.box.x - 170), y: pv3.box.y, width: pv3.box.width + 176, height: pv3.box.height });
    await P2.shot('desktop-after-visits');

    // ④ THE RETRY BAR (r3 N1) — c-1's session stopped, «Resume this session» answered by the no-transcript breaker, «Try resuming anyway»
    const live = async (id) => !!(await P2.ev(VIEW(id)))?.live;
    const winsOf = (cid) => P2.ev(`[...app.wm.windows.values()].filter((w) => (w._openSpec && w._openSpec.backendSessionId === ${J(cid)}) || (w._conversation && w._conversation.backendSessionId === ${J(cid)})).map((w) => w.id)`);
    const tapped = []; for (const X of [P1, PH, P2]) tapped.push(await X.ev(TAP));
    const s4 = await settle(P2), j4 = journal.length, t4 = Date.now();
    const gap34 = journal.slice(j3e, j4).split('\n').filter((l) => /REFUSED/.test(l)); printRefused('③→④ (the gap)', gap34);
    ok(!gap34.length, '③ → ④: nothing refused between ③\'s judge and ④\'s window', gap34);
    ok(gateOf(s4.ok) && verdictOf(tapped.every(Boolean)), '④ before the stops: ③\'s writes have gone quiet (no record written, no refusal, for 2.5 s), and every open page\'s sends and received refusals are tapped', { settled: s4, tapped });
    await P2.click(`document.querySelector('.desktop-preview-wrapper .desktop-preview[data-desktop-id="desk-c"]')`); await sleep(1800);
    const killConv = (cid) => P2.ev(`(() => { const e = [...app.sessions.entries()].find(([id, v]) => v && v.sessionId && !v._readOnly && app.wm.windows.get(id)?._openSpec?.backendSessionId === ${J(cid)}); if (e) app.killSession(e[1].sessionId, ${J(cid)}); return !!e; })()`); // the conversation's live window, whatever its id
    await killConv(CID(3));
    ok(verdictOf(await until(async () => !!(await P2.ev(VIEW('c-1')))?.bar, 20000, 250)), '④ c-1\'s session stopped: its window shows «Resume this session»');
    await P2.ev(`(() => { const ws = app.ws, orig = ws.request.bind(ws); window.__creates = []; ws.request = function (m, cb, o) { if (m && m.type === 'create') window.__creates.push([m.resumeId, !!m.ignoreNoConvo]); if (m && m.type === 'create' && m.resumeId === ${J(CID(3))} && !m.ignoreNoConvo && !window.__brk) { window.__brk = 1; setTimeout(() => cb({ type: 'error', code: 'no-convo-breaker', transcriptKnown: false, message: 'No conversation found', reqId: m.reqId }), 50); return () => {}; } return orig(m, cb, o); }; return true; })()`);
    ok(verdictOf(await P2.click(`app.wm.windows.get('c-1') && app.wm.windows.get('c-1').element.querySelector('.chat-resume-btn')`)), '④ the person presses «Resume this session» on c-1 (the hub answers the no-transcript breaker)');
    const retryBtn = `(() => { const w = app.wm.windows.get('c-1'); return w ? [...w.element.querySelectorAll('.chat-resume-btn')].find((b) => /Try resuming anyway/.test(b.textContent)) || null : null; })()`;
    ok(verdictOf(await until(async () => !!(await P2.ev(`!!${retryBtn}`)), 15000, 200)), '④ …the rescued window shows «Try resuming anyway»');
    await P2.shot('retry-bar');
    ok(verdictOf(await P2.click(retryBtn)), '④ the person presses «Try resuming anyway»');
    await until(() => live('c-1'), 20000, 250);
    await sleep(1500);
    const c1r = await P2.ev(VIEW('c-1')), c1w = await winsOf(CID(3)), crs = await P2.ev('window.__creates'), cRows = await rows();
    ok(!!c1r && gateOf(c1r.live) && c1r.desk === 'desk-c' && c1r.gb === J(GB(3)) && J(c1w) === J(['c-1']) && crs.length === 2 && crs[1][1] === true && J(cRows['desk-c']) === J(BEFORE['desk-c']),
      '④ N1 «TRY RESUMING ANYWAY» re-opens row c-1: one retry create, the conversation\'s ONE window is c-1 — live, at its box on C; the hub\'s C row kept with its box (d159c081b: the bar closed the window its retry had re-opened — no window, the row gone)', { c1r, c1w, crs, c: cRows['desk-c'] });
    // ④ THE DOUBLE PRESS (r3 N2) — b-2's session stopped; its sidebar card pressed twice inside 200 ms while the hub takes 700 ms
    await P2.click(`document.querySelector('.desktop-preview-wrapper .desktop-preview[data-desktop-id="desk-b"]')`); await sleep(1800);
    await killConv(CID(2));
    // its card: a STOPPED card draws no status dot (session-card: stopped is the default state); the sidebar's list says stopped
    const card = `((app.sidebar._allSessions || []).some((s) => (s.backendSessionId || s.sessionId) === ${J(CID(2))} && s.status === 'stopped') && [...document.querySelectorAll('.session-item-card')].find((c) => c._sessionId === ${J(CID(2))} && !c.querySelector('.conn-corner-dot'))) || null`;
    ok(verdictOf(await until(async () => !!(await P2.ev(`!!(${card})`)) && !!(await P2.ev(VIEW('b-2')))?.readOnly, 20000, 250)), '④ b-2\'s session stopped: its sidebar card says so, its window is read-only');
    await P2.ev('(app.sidebar.isOpen || app.sidebar.toggle(true)), true'); await sleep(800); // the person opens the sidebar
    await P2.ev(`(() => { const ws = app.ws, send = ws.send.bind(ws); window.__sent = 0; ws.send = function (m) { if (m && m.type === 'create') { window.__sent++; setTimeout(() => send(m), 700); return; } return send(m); }; return true; })()`);
    // THE PHONE FOLLOWER'S TIE IS MADE (law 4 — the one case list line 155's made tie does not cover): the phone holds b-2 (its own
    // «Resume all» re-opened it in ②), so it FOLLOWS this resume and writes Desk B from the base it had; its FIRST Desk B frame is HELD
    // until the hub has kept a NEWER record of Desk B (this page's, the desktop tab's), then released — refused from an older base, always
    const sHold = await settle(P2);   // b-2's END and its records have gone quiet first: the frame held is the FOLLOW's, never the end's
    ok(verdictOf(sHold.ok), '④ before the phone\'s tie: b-2\'s stop and every record it moved have gone quiet (measured), this page\'s gates down', sHold);
    const phToasts0 = ((await PH.toasts()) || []).length;   // law 4 «nothing shown»: EVERY toast type the phone shows from here on
    await PH.ev(`(window.__holdOut = 'desk-b', true)`);
    const tTie = Date.now();
    const pc = await P2.ev(`(() => { const e = ${card}; if (!e) return null; e.scrollIntoView?.({ block: 'center' }); const r = e.getBoundingClientRect(), x = r.left + Math.min(r.width / 2, 40), y = r.top + Math.min(r.height / 2, 14), at = document.elementFromPoint(x, y); return { x, y, w: r.width, h: r.height, hit: at ? (at === e || e.contains(at)) : false, at: at ? at.className : null, open: !!app.sidebar.isOpen }; })()`);
    if (pc) for (const dt of [0, 150]) { await sleep(dt); for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await P2.send('Input.dispatchMouseEvent', { type, x: pc.x, y: pc.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); }
    await until(() => live('b-2'), 20000, 250);
    let heldBase = null, keptB = null;
    const heldPH = await until(async () => (await PH.ev('window.__heldOut.length')) === 1, 20000, 100);
    if (heldPH) heldBase = await PH.ev('window.__heldOut[0].base ?? null');
    const passed = !!heldPH && heldBase != null && await until(async () => { const l = await api('/api/layouts'); keptB = (((l.desktops || {})['desk-b'] || {}).autoSave || {}).updatedAt || null; return Number(keptB) > Number(heldBase); }, 20000, 200);
    const relPH = await PH.ev('window.__releaseOut ? window.__releaseOut() : 0');
    ok(!!heldPH && !!passed && relPH === 1, '④ THE PHONE FOLLOWER\'S TIE IS MADE: the phone followed b-2\'s resume and wrote Desk B\'s record from the base it had — that frame HELD until the hub kept a newer record of Desk B, then released (refused from an older base, always)', { heldPH, heldBase, keptB, relPH });
    await sleep(1500);
    const b2 = await P2.ev(VIEW('b-2')), b2w = await winsOf(CID(2)), sent = await P2.ev('window.__sent'), bRows = await rows();
    ok(!!pc && sent === 1 && !!b2 && gateOf(b2.live) && b2.desk === 'desk-b' && b2.gb === J(GB(2)) && J(b2w) === J(['b-2']) && J(bRows['desk-b']) === J(BEFORE['desk-b']),
      '④ N2 b-2\'s card pressed TWICE inside 200 ms while the hub is slow: ONE create, the conversation\'s ONE window is b-2 — live, at its box on B; the hub\'s B rows kept (d159c081b: the second press closed the first one\'s window in flight)', { pressed: pc, sent, b2, b2w, b: bRows['desk-b'] });
    const sTie = await settle(P2), phF = await factsOf(PH, 'desk-b', tTie);
    const sTie2 = await settle(P2), phF2 = await factsOf(PH, 'desk-b', tTie);   // a second look after a second quiet stretch: nothing more
    const bAfter = await rows(), phLines = refusedSince(j4).filter((l) => /\(desk-b\)/.test(l)), phShown = ((await PH.toasts()) || []).slice(phToasts0).map((t) => `${t[0]}: ${t[1]}`);
    const TF = { sends: phF.sends, refused: phF.refused, sendsLater: phF2.sends, refusedLater: phF2.refused.length, acks: phF2.acks, tapped: phF2.tapped, lines: phLines, rowKept: J(bAfter['desk-b']) === J(BEFORE['desk-b']), shown: phShown };
    const LT = phoneTieLaw(TF);
    console.log(`    [④ the phone follower's tie] ${J({ ...TF, lines: phLines.map((l) => l.slice(Math.max(0, l.indexOf('[layout-sync]')), 260)) })}`);
    ok(gateOf(sTie.ok) && gateOf(sTie2.ok) && verdictOf(LT.ok), '④ …the hub REFUSED the phone\'s record ONCE from an older base (the stale line, N → N); the phone ADOPTED the record kept and sent ONE more frame, ACCEPTED (its ack read); then nothing; b-2\'s row keeps its id and box; the phone shows nothing; the layer gate refused nothing', { why: LT.why, settled: [sTie, sTie2] });
    // CONTROLS — the law goes red where the harm is (copies of these very facts): the phone sending on and on; the layer gate refusing it
    const cOn = phoneTieLaw({ ...TF, sendsLater: TF.sends + 2 });
    const cGate = phoneTieLaw({ ...TF, lines: [...phLines, '[layout-sync] REFUSED a phone record of desktop "B" (desk-b): it changes zIndex (window b-2) — a phone writes the workspace only; the server keeps its record'] });
    ok(!cOn.ok && verdictOf(cOn.why.some((w) => /after the settle/.test(w))), '④ CONTROL: a copy in which the phone sends on and on (no settle) is RED, by name', cOn.why);
    ok(!cGate.ok && verdictOf(cGate.why.some((w) => /the layer gate refused/.test(w))), '④ CONTROL: a copy in which the layer gate refuses the phone\'s record is RED, by name', cGate.why);
    const lines4 = refusedSince(j4), law4 = journalLaw(lines4, 3), warns4 = await warnsOf(); printRefused('④', lines4);
    // CONTROLS of the journal law (the round's should): each of the four OTHER kinds the hub writes, and a stale line that loses a window — red by name
    const OTHER = ['[layout-sync] REFUSED a record of desktop desk-b: no such desktop (deleted meanwhile); the sender is told',
      '[layout-sync] REFUSED a record of desktop "Desk B" (desk-b): it drops 1 window(s) with no close/move/kill (b-2) — 2 → 1; the server keeps its record',
      '[layout-sync] REFUSED a record of desktop "Desk B" (desk-b): its rows disagree about a tab group (b-1, b-2: a member\'s own row names other members) — the server keeps its record',
      '[layout-sync] REFUSED a phone record of desktop "Desk B" (desk-b): it changes zIndex (window b-2) — a phone writes the workspace only; the server keeps its record',
      '[layout-sync] REFUSED a phone record of desktop "Desk B" (desk-b): written from an older base (2026-11-20T00:00:00.000Z < the record kept, 2026-11-20T00:00:01.000Z) — 2 → 1 windows; the sender adopts the record kept'];
    const kindsRed = OTHER.map((l) => journalLaw([l], 9));
    ok(verdictOf(kindsRed.every((r) => !r.ok && r.why.length === 1)), '④ CONTROL: the journal law is RED, by name, for each of the four other kinds of refusal and for a stale line that loses a window', kindsRed.map((r) => r.why[0]));
    const branches = [['refused twice', { ...TF, refused: ['stale', 'stale'] }, /exactly ONE stale refusal/], ['the row moved', { ...TF, rowKept: false }, /did not keep its id and box/], ['a toast shown', { ...TF, shown: ['global-toast global-toast-info: x'] }, /showed the person a toast/], ['no ack', { ...TF, acks: 0 }, /was not accepted/]];
    const branchRed = branches.map(([n, f, re]) => [n, phoneTieLaw(f).why.some((w) => re.test(w))]);
    ok(verdictOf(branchRed.every(([, r]) => r)), '④ CONTROL: the phone follower\'s law is RED, by name, for a second refusal, a row that moved, a toast shown, and a frame never acked', branchRed);
    // …and per page (the read: a sum could hide one page refused twice): each open page refused at most ONCE a desktop in ④
    const per4 = {}; for (const [k, X] of [['P1', P1], ['PH', PH], ['P2', P2]]) for (const d of ['desk-b', 'desk-c']) { const f = await factsOf(X, d, t4); per4[`${k} ${d}`] = f.tapped ? f.refused : ['NOT TAPPED']; }
    const twice = Object.entries(per4).filter(([, r]) => r.length > 1 || r[0] === 'NOT TAPPED');
    ok(gateOf(law4.ok) && law4.stale >= 1 && !twice.length && !warns4.P1.length && !warns4.PH.length && !warns4.P2.length, '④ no refusal but the followers\' ties (the older-base kind, N → N windows, at most one a follower a followed resume: the desktop tab follows c-1 and b-2, the phone b-2 — it holds no c-1 — the made phone tie\'s one among them); no page refused twice for one desktop; no warn toast on ANY open page', { why: law4.why, twice, per4, lines: lines4, warns4 });
    await P2.shot('desktop-after-retry-and-double-press');
    // ⑤ B-46fc'S OWN GATE (lane bl-windows — the row: «a chrome leg that opens a window and reloads at 500 ms ⇒ the same window is
    //    on show»; the 2.369.410 close's remainder). A race is proven by a STALL, never by the clock: before the press the page's
    //    save is HELD (each ask recorded as due, its timer never fires), so the leave's flush (pagehide) is the open's ONLY road to
    //    the hub. The fact a leave flushes is read from a run: int361's heavy run of test-browser-live-input on e8a5c8bcf (2026-11-18
    //    11:24Z, 182/182) — a page ended with its save held carried its close through this flush. RED CONTROL FIRST, the release's
    //    behaviour (no flush at the leave: `_flushOnLeave` answers false), proving its plant before its verdict.
    const FILESWIN = `[...app.wm.windows.values()].filter((w) => w.type === 'files').map((w) => ({ id: w.id, desk: w._desktopId, path: w._explorerPath || null, shown: !w.isMinimized && !w._hiddenByDesktop }))`;
    // the person's press goes through THE still door (scratch.mjs realClicker — test-still-press's ledger): it measures, waits
    // still, checks at press time that the element under the pointer IS the button, and says where the press landed
    const realClick = realClicker({ evalJs: (x) => P2.ev(x), cdp: (m, p) => P2.send(m, p) });
    const pressFiles = async () => { const pressed = await realClick('#btn-file-explorer'); return { pressed, landed: realClick.landed || null, miss: realClick.lastMiss || null }; };
    const LEAVE_LOG = 'vs.b46fc.leave'; // sessionStorage survives a same-tab reload: what the leave did, read by the NEW page
    const reloadScene = async (flushOff) => {
      // the stall, installed BEFORE the act: a pending save cleared, every ask held due (the timer never fires); the leave's
      // flush wrapped to LOG what it answered (the control's answers false — the release, which had no flush)
      await P2.ev(`(() => { const lm = app.layoutManager; clearTimeout(lm._autoSaveTimer); lm._autoSaveTimer = null; sessionStorage.removeItem(${J(LEAVE_LOG)});
        const log = (why, sent) => { try { const l = JSON.parse(sessionStorage.getItem(${J(LEAVE_LOG)}) || '[]'); l.push({ why, sent }); sessionStorage.setItem(${J(LEAVE_LOG)}, JSON.stringify(l)); } catch { } };
        const real = lm._flushOnLeave.bind(lm);
        lm._flushOnLeave = ${flushOff ? 'function offAtLeave(why) { log(why, false); return false; }' : 'function loggedLeave(why) { const sent = real(why); log(why, sent); return sent; }'};
        lm.scheduleAutoSave = function heldSave() { lm._saveAskedAt = Date.now(); if (!lm._autoSaveTimer) lm._autoSaveTimer = setTimeout(() => {}, 600000); }; return true; })()`);
      const before = ((await P2.ev(FILESWIN)) || []).map((w) => w.id);
      const press = await pressFiles();
      const fresh = async () => ((await P2.ev(FILESWIN)) || []).find((w) => !before.includes(w.id) && w.path) || null;
      const opened = (await until(async () => !!(await fresh()), 10000, 100)) ? await fresh() : null;
      const due = await P2.ev(`(() => { const lm = app.layoutManager, dm = app.desktopManager; return { due: !!lm._autoSaveTimer && lm._saveAskedAt > (lm._savedAt || 0), dirty: !!lm._userDirty, gate: !!(lm._restoring || (dm && dm._restoring)), held: lm.scheduleAutoSave.name === 'heldSave', leave: lm._flushOnLeave.name }; })()`);
      const desk = await P2.ev('app.desktopManager.activeDesktopId');
      await P2.ev('(window.__b46fcOld = 1, true)'); // a mark only the OLD page holds — the boot wait below is the NEW page's
      await P2.send('Page.reload', {});
      const booted = await until(async () => { try { return await P2.ev('!window.__b46fcOld && !!(window.app && app.desktopManager && app.desktopManager.activeDesktopId && app.layoutManager && !app.layoutManager._restoring)'); } catch { return false; } }, 30000, 250);
      if (booted && (await P2.ev('app.desktopManager.activeDesktopId')) !== desk) { await P2.ev(`(app.desktopManager.switchTo(${J(desk)}), true)`); await sleep(1500); }
      await sleep(1500);
      const after = (await P2.ev(FILESWIN).catch(() => null)) || [];
      const leave = await P2.ev(`JSON.parse(sessionStorage.getItem(${J(LEAVE_LOG)}) || '[]')`).catch(() => null);
      const hub = (((await api('/api/layouts')).desktops[desk] || {}).autoSave?.windows || []).filter((w) => w.type === 'files').map((w) => w.winId);
      const mine = opened ? after.find((w) => w.id === opened.id) || null : null;
      return { press, opened, due, desk, booted, leave, mine, hub, inHub: !!opened && hub.includes(opened.id) };
    };
    const s5 = await settle(P2);
    ok(verdictOf(s5.ok), '⑤ before the plant: the followers\' frames have ENDED (no record of any desktop written, no refusal, for 2.5 s) and this page\'s two restoring gates are DOWN — the plant reads a page no remote apply is gating (law 3)', s5);
    const red = await reloadScene(true);
    ok(!!red.press && verdictOf(red.press.pressed), '⑤ (control) the person\'s press on the Files button, through the still door — the element under the pointer at press time checked, the landing said', red.press);
    ok(!!red.opened && gateOf(red.due.due) && gateOf(red.due.dirty) && !red.due.gate && gateOf(red.due.held) && red.due.leave === 'offAtLeave', '⑤ RED CONTROL proves its plant first: the person\'s press opened a files window, a person\'s save DUE and HELD, no gate up — and the page\'s leave is the planted one (it answers false, as the release sent nothing)', red.due);
    ok(gateOf(red.booted) && !!red.opened && !red.mine && !red.inHub && gateOf(Array.isArray(red.leave)) && red.leave.length >= 1 && verdictOf(red.leave.every((l) => l.sent === false)), '⑤ RED CONTROL — the release\'s behaviour (no flush at the leave): the leave RAN (logged) and sent nothing ⇒ after the reload that window is GONE and the hub\'s record holds no row of it (the leg below goes red without B-46fc)', { leave: red.leave, mine: red.mine, inHub: red.inHub, booted: red.booted });
    const s5b = await settle(P2);
    ok(verdictOf(s5b.ok), '⑤ …and again before the second plant (the reloaded page booted, every record quiet, its gates down)', s5b);
    const fact = await reloadScene(false);
    ok(!!fact.press && verdictOf(fact.press.pressed), '⑤ the person\'s press on the Files button, through the still door — the element under the pointer at press time checked, the landing said', fact.press);
    ok(!!fact.opened && gateOf(fact.due.due) && gateOf(fact.due.dirty) && !fact.due.gate && gateOf(fact.due.held) && fact.due.leave === 'loggedLeave', '⑤ the person\'s press opened a files window; its save DUE and HELD in the page (no gate up) — the leave\'s flush its only road', fact.due);
    ok(gateOf(fact.booted) && !!fact.mine && fact.mine.desk === fact.desk && gateOf(fact.mine.shown) && gateOf(fact.inHub) && gateOf(Array.isArray(fact.leave)) && verdictOf(fact.leave.some((l) => l.sent === true)), '⑤ B-46fc\'S OWN GATE: the page reloaded with the open\'s save still due ⇒ the leave\'s flush SENT it (logged), the hub\'s record holds that window\'s row, and after the reload the SAME window (its id) is on show on its desktop', { opened: fact.opened, mine: fact.mine, inHub: fact.inHub, leave: fact.leave, booted: fact.booted });
    // ⑥ B-46fc PART 2 (lane lg-recovery — the row's remainder: «a socket that is not open at the reload»): the leave's flush queues the
    //    save in the CLOSED socket, and the page hands that queue to the hub by its second road (POST /api/layout-sync, fetch keepalive —
    //    the one «apply a layout save» the socket's case runs). The plant: ⑤'s held save, and the page's socket CLOSED in place, its
    //    reconnect stopped (nothing re-opens it before the reload — placed, never waited for). RED CONTROL FIRST: the hand-off cut (it
    //    answers 0) — the release's road: the save stays in the dead socket's queue and is lost with the page.
    const closedScene = async (cut) => {
      await P2.ev(`(() => { const lm = app.layoutManager, sock = app.ws; clearTimeout(lm._autoSaveTimer); lm._autoSaveTimer = null; sessionStorage.removeItem(${J(LEAVE_LOG)});
        const log = (why, sent) => { try { const l = JSON.parse(sessionStorage.getItem(${J(LEAVE_LOG)}) || '[]'); l.push({ why, sent }); sessionStorage.setItem(${J(LEAVE_LOG)}, JSON.stringify(l)); } catch { } };
        const realLeave = lm._flushOnLeave.bind(lm), realHand = lm._handOffQueued.bind(lm);
        lm._flushOnLeave = function loggedLeave(why) { const sent = realLeave(why); log('flush:' + why, sent); return sent; };
        lm._handOffQueued = ${cut ? "function cutRoad(why) { log('handoff:' + why, 0); return 0; }" : "function loggedHandOff(why) { const n = realHand(why); log('handoff:' + why, n); return n; }"};
        lm.scheduleAutoSave = function heldSave() { lm._saveAskedAt = Date.now(); if (!lm._autoSaveTimer) lm._autoSaveTimer = setTimeout(() => {}, 600000); };
        sock.connect = function noReconnect() { }; try { sock.ws && sock.ws.close(); } catch { }
        return true; })()`);
      const before = ((await P2.ev(FILESWIN)) || []).map((w) => w.id);
      const press = await pressFiles();
      const fresh = async () => ((await P2.ev(FILESWIN)) || []).find((w) => !before.includes(w.id) && w.path) || null;
      const opened = (await until(async () => !!(await fresh()), 10000, 100)) ? await fresh() : null;
      const due = await P2.ev(`(() => { const lm = app.layoutManager, dm = app.desktopManager; return { due: !!lm._autoSaveTimer && lm._saveAskedAt > (lm._savedAt || 0), dirty: !!lm._userDirty, gate: !!(lm._restoring || (dm && dm._restoring)), held: lm.scheduleAutoSave.name === 'heldSave', road: lm._handOffQueued.name, open: !!(app.ws.ws && app.ws.ws.readyState === 1) }; })()`);
      const desk = await P2.ev('app.desktopManager.activeDesktopId');
      await P2.ev('(window.__b46fcOld = 1, true)');
      await P2.send('Page.reload', {});
      const booted = await until(async () => { try { return await P2.ev('!window.__b46fcOld && !!(window.app && app.desktopManager && app.desktopManager.activeDesktopId && app.layoutManager && !app.layoutManager._restoring)'); } catch { return false; } }, 30000, 250);
      if (booted && (await P2.ev('app.desktopManager.activeDesktopId')) !== desk) await P2.ev(`(app.desktopManager.switchTo(${J(desk)}), true)`);
      const quiet = booted ? await settle(P2) : null; // measured, never a clock (its round): every record quiet, the gates down
      const after = (await P2.ev(FILESWIN).catch(() => null)) || [];
      const leave = await P2.ev(`JSON.parse(sessionStorage.getItem(${J(LEAVE_LOG)}) || '[]')`).catch(() => null);
      const hub = (((await api('/api/layouts')).desktops[desk] || {}).autoSave?.windows || []).filter((w) => w.type === 'files').map((w) => w.winId);
      const mine = opened ? after.find((w) => w.id === opened.id) || null : null;
      return { press, opened, due, desk, booted, quiet: !!(quiet && quiet.ok), leave, mine, hub, inHub: !!opened && hub.includes(opened.id) };
    };
    const s6 = await settle(P2);
    ok(verdictOf(s6.ok), '⑥ before the plant: every record quiet, this page\'s gates down (as ⑤)', s6);
    const cutR = await closedScene(true);
    ok(!!cutR.opened && gateOf(cutR.due.due) && gateOf(cutR.due.dirty) && !cutR.due.gate && gateOf(cutR.due.held) && cutR.due.open === false && cutR.due.road === 'cutRoad', '⑥ RED CONTROL proves its plant first: a files window opened, its save DUE and HELD, the page\'s socket NOT OPEN, the hand-off cut', cutR.due);
    ok(gateOf(cutR.booted) && gateOf(cutR.quiet) && !cutR.mine && !cutR.inHub && gateOf(Array.isArray(cutR.leave)) && gateOf(cutR.leave.some((l) => /^flush:/.test(l.why) && l.sent === true)) && verdictOf(cutR.leave.every((l) => !/^handoff:/.test(l.why) || l.sent === 0)),
      '⑥ RED CONTROL — the release\'s road: the leave\'s flush ran and QUEUED the save in the closed socket, nothing handed it off ⇒ after the reload the window is GONE and the hub\'s record lacks it', { leave: cutR.leave, hub: cutR.hub, mine: cutR.mine });
    const s6b = await settle(P2);
    ok(verdictOf(s6b.ok), '⑥ …and again before the second plant', s6b);
    const road = await closedScene(false);
    ok(!!road.opened && gateOf(road.due.due) && gateOf(road.due.held) && road.due.open === false && road.due.road === 'loggedHandOff', '⑥ the plant: a files window opened, its save DUE and HELD, the page\'s socket NOT OPEN', road.due);
    ok(gateOf(road.booted) && gateOf(road.quiet) && !!road.mine && road.mine.desk === road.desk && gateOf(road.mine.shown) && gateOf(road.inHub) && gateOf(Array.isArray(road.leave)) && verdictOf(road.leave.some((l) => /^handoff:/.test(l.why) && l.sent >= 1)),
      '⑥ B-46fc PART 2\'S GATE: the page reloaded with its socket closed ⇒ the leave queued the save and HANDED IT OFF (POST /api/layout-sync) — the hub\'s record holds the window and the reloaded page shows it', { leave: road.leave, hub: road.hub, mine: road.mine });
    // ⑦ ITS ROUND (wgk4tnn0w — the MUST): a page that only goes HIDDEN (no unload) while offline: the hand-off's request FAILS — the
    //    frame must stay owed, and the socket carries it when the page is shown and reconnects (the release's road). The plant: ⑥'s held
    //    save and closed socket, and the page's requests to the route rejected (offline) until it is shown. RED CONTROL FIRST: the first
    //    cut's swallow (the frame left the queue before the request had an outcome; a rejection dropped) ⇒ the hub never gets the window.
    const hiddenScene = async (swallow) => {
      await P2.ev(`(() => { const lm = app.layoutManager, sock = app.ws; clearTimeout(lm._autoSaveTimer); lm._autoSaveTimer = null;
        window.__b46fcFails = 0; window.__b46fcOffline = true;
        if (!window.__b46fcRealFetch) window.__b46fcRealFetch = window.fetch;
        window.fetch = function offlineFetch(u, o) { if (window.__b46fcOffline && String(u).includes('/api/layout-sync')) return Promise.resolve().then(() => { window.__b46fcFails++; throw new TypeError('Failed to fetch'); }); return window.__b46fcRealFetch.call(this, u, o); };
        delete lm._handOffQueued; // ⑦ reloads nothing between its scenes: the RED scene's plant goes, the page's own hand-off answers (its prototype's)
        ${swallow ? `lm._handOffQueued = function firstCutSwallow(why) { const ws = app.ws; if (!ws || !ws.pending.length || (ws.ws && ws.ws.readyState === 1)) return 0; const newest = new Map(), keep = []; for (const t of ws.pending) { let f = null; try { f = JSON.parse(t); } catch { } if (f && f.type === 'layout-sync') { newest.set(f.desktopId || '', t); continue; } keep.push(t); } let n = 0; for (const t of newest.values()) { fetch('/api/layout-sync', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: t }).catch(() => { }); n++; } ws.pending = keep; return n; };` : ''}
        lm.scheduleAutoSave = function heldSave() { lm._saveAskedAt = Date.now(); if (!lm._autoSaveTimer) lm._autoSaveTimer = setTimeout(() => {}, 600000); };
        window.__b46fcConnect = sock.connect; sock.connect = function noReconnect() { }; try { sock.ws && sock.ws.close(); } catch { }
        return true; })()`);
      const before = ((await P2.ev(FILESWIN)) || []).map((w) => w.id);
      const press = await pressFiles();
      const fresh = async () => ((await P2.ev(FILESWIN)) || []).find((w) => !before.includes(w.id) && w.path) || null;
      const opened = (await until(async () => !!(await fresh()), 10000, 100)) ? await fresh() : null;
      const desk = await P2.ev('app.desktopManager.activeDesktopId');
      // HIDDEN (no unload): the page's own visibilitychange listeners run — the leave's flush queues the save, the hand-off tries the route
      await P2.ev(`(Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }), document.dispatchEvent(new Event('visibilitychange')), true)`);
      const failed = await until(async () => (await P2.ev('window.__b46fcFails')) >= 1, 8000, 50);
      await sleep(0);
      const owed = await P2.ev(`app.ws.pending.filter((t) => { try { return JSON.parse(t).type === 'layout-sync'; } catch { return false; } }).length`);
      // SHOWN, online again, the socket reconnects (its queue flushed at the open)
      await P2.ev(`(window.__b46fcOffline = false, delete document.hidden, document.dispatchEvent(new Event('visibilitychange')), app.ws.connect = window.__b46fcConnect, app.ws.connect(), true)`);
      const open = await until(async () => !!(await P2.ev('!!(app.ws.ws && app.ws.ws.readyState === 1 && app.ws.pending.length === 0)')), 15000, 100);
      const quiet = await settle(P2);
      const hub = (((await api('/api/layouts')).desktops[desk] || {}).autoSave?.windows || []).filter((w) => w.type === 'files').map((w) => w.winId);
      await P2.ev(`(window.fetch = window.__b46fcRealFetch, true)`);
      const road = await P2.ev(`app.layoutManager._handOffQueued.name`);
      return { press, opened, road, failed: !!failed, owed, open: !!open, quiet: !!(quiet && quiet.ok), hub, inHub: !!opened && hub.includes(opened.id) };
    };
    const s7 = await settle(P2);
    ok(verdictOf(s7.ok), '⑦ before the plant: every record quiet, the gates down', s7);
    const swal = await hiddenScene(true);
    ok(!!swal.opened && swal.road === 'firstCutSwallow' && gateOf(swal.failed) && swal.owed === 0 && gateOf(swal.open) && gateOf(swal.quiet) && !swal.inHub, '⑦ RED CONTROL — the first cut\'s swallow: the page went HIDDEN offline, the hand-off\'s request FAILED and took the frame with it (0 owed) ⇒ shown and reconnected, the hub\'s record still lacks the window', swal);
    const s7b = await settle(P2);
    ok(verdictOf(s7b.ok), '⑦ …and again before the second plant', s7b);
    const owedR = await hiddenScene(false);
    ok(!!owedR.opened && owedR.road === '_handOffQueued' && gateOf(owedR.failed) && owedR.owed >= 1 && gateOf(owedR.open) && gateOf(owedR.quiet) && verdictOf(owedR.inHub), '⑦ ITS ROUND\'S MUST: the page went HIDDEN offline, the hand-off FAILED and the frame stayed OWED (back in the queue) ⇒ shown and reconnected, the socket carried it: the hub\'s record holds the window', owedR);
  } catch (e) {
    ok(false, 'the suite threw', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
  } finally {
    for (const X of [P1, PH, P2]) { try { X && X.close(); } catch { } }
  }
})();

console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass} passed${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
