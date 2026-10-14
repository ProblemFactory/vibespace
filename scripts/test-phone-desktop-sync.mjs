#!/usr/bin/env node
// A PHONE'S WINDOW SWITCH RESTACKED EVERY DESKTOP — the owner, 2026-10-13 ("手机端切窗口会影响电脑端布局…不能根治吗"), lane
// phone-arrangement-local, docs/kb-design-lessons.md §6b guard 10. The phone was a plain layout-sync client of the SAME
// per-desktop record: a switcher tap → revealWindow → focusWindow wrote `zIndex = wm.zIndex++` on the phone's DOM, the tap
// (a pointerdown) armed the save, recordFor merged the phone's captures (its z, its maximize/minimize, the full-screen box
// of a window born there) over the held record, the server replaced the desktop's record whole and every desktop page
// restacked. THE RULE: ARRANGEMENT (z, box, maximize, minimize, snap) is the desktop viewport's — a phone's capture keeps
// the held record's verbatim (PURE captureForViewport, src/lib/desktop-record.js); MEMBERSHIP (which windows, their
// openSpec / titles / chains) is the workspace's and flows both ways; the phone's window on show is its own (sessionStorage);
// and every layout-sync is stamped `viewport` — a desktop applies a `phone` record as membership + content only.
//
// Heavy: a worktree server of THIS source and one of the BASE tree (the commit before captureForViewport landed — HEAD while
// it is uncommitted), each with its own data/ + HOME; page D = headless chrome 1440×900, page P = a second chrome emulating an
// iPhone 390×844 (UA, touch, hover:none / pointer:coarse ⇒ app.isMobile AND app.isTouch) driven by REAL touch sequences.
//   ① P taps its switcher through every window ×5 ⇒ D's z / boxes / maximize / minimize byte-identical (DOM + layouts.json)
//   ② P opens Files from its "+" sheet ⇒ on D it lands at D's own default box (not the full workspace), on top
//   ③ P closes a window ⇒ D closes it (membership flows), the close evidence rides P's save, the belt never refuses
//   ④ D drags one window and minimizes another ⇒ P keeps ITS window on show; P's next user-caused save carries D's box +
//      isMinimized:true verbatim (guard 5 by construction)
//   ⑤ P reloads ⇒ the same window on show (this tab's own view state)
//   ⑥ BELT 2 ALONE: a hand-built phone-stamped record (a raw socket) with scrambled z / boxes / maximize / minimize plus one
//      new window ⇒ D keeps every box and its z order, builds the new window
//   ⑦ BELT 1 ALONE: P's stamp stripped on the wire (its ws.send wrapped) ⇒ P's taps still leave D unchanged
//   ⑧ RED CONTROLS on the base tree, printed: ①'s taps restack D (z changes); ②'s window lands near {0,0,1,1}
//   ⑨ an unstamped record (an old desktop bundle) and a desktop-stamped one still move D's window (today's path)
//   ⑩–⑬ lane phone-arrangement-fixes (phone-arrangement-verify r1 F1–F4) on a FRESH two-desktop record, each with a RED
//      control on the commit before the fix (printed): ⑩ F1 D drags while D2 is offline, the phone saves, D2 re-reads on
//      reconnect and saves ⇒ D's drag kept on disk AND on D (the stamp names the writer — a re-read takes the record
//      whole); ⑪ F2 a phone save the shrink belt refuses ⇒ the re-send carries the held arrangement, D's reload keeps its
//      z order; ⑫ F3 the phone moves a window to another desktop ⇒ its entry there keeps the held z / box / minimize, a
//      phone-born one carries no full-screen box; ⑬ F4 a preset saved on the phone POSTs the held arrangement
//   ⑭ THE CAPTURE CENSUS (static): every call of a raw page capture (captureState / captureWindows / captureWin), of THE
//      ONE CAPTURE (desktop-manager.js captureBuilt) and of recordFor in src/lib, grep-derived per enclosing method — a
//      site the table does not name is RED (a new back door), so is a dead row; the RED control runs it on the base
//   ⑮ lane layout-deferred-writer (B-4767, phone-arrangement-verify r2 F5): D's person presses an empty spot of its desktop
//      and holds (records wait — §6b guard 3); a second desktop DW moves a window, the phone changes membership; D releases.
//      ⑮a F5: DW's record, then the phone's ⇒ the move AND the phone's window land on D (the phone's record used to REPLACE
//      the one desktop slot: the move never landed); ⑮b the mirror (phone, then DW); ⑮c an UNSTAMPED record (a pre-.264
//      desktop) counts as desktop; ⑮d a phone record landing in the 300 ms after the release, while DW's still waits, joins
//      it. RED controls on patched copies of THIS source (printed): the pre-fix slot line restored (a, c, d red; b holds),
//      a record arriving while others wait applied at once (d red: the drain then drops DW's older record)
//   ⑯ lane phone-sidebar-chrome (owner inc-mv8l2frb-xkqm, the READ half of guard 10 — layout-model.js chromeToApply): on a
//      record whose desk chrome holds the sidebar OPEN and a 1×3 grid (the owner's shape) ⑯a P's reload ⇒ P's sidebar
//      CLOSED and no grid set, again after P's own save made the record the phone's; ⑯b P's socket drops and it re-reads on
//      reconnect (the return-from-background path) ⇒ CLOSED, and a live desk record opening the sidebar ⇒ CLOSED; ⑯c P's
//      person opens its sidebar, the desk's record closes then opens its own ⇒ P's stays as its person left it, and every
//      save P sends carries the DESK's sidebarOpen byte-identical; ⑯d the desk still follows a desk record's sidebarOpen,
//      ignores a live phone record's, and its reload on the record the phone wrote last keeps its sidebar and grid (taken
//      whole). RED control on a patched copy of THIS source (printed): every chromeToApply asks as a desk ('desktop') ⇒ the
//      pre-fix apply — P's sidebar pops open at reload and at the re-read. PDSYNC_PNG_DIR=<dir> keeps ⑯'s PNGs.
// PDSYNC_ONLY=1,2,… runs a subset (the base control is ⑧; ⑩–⑬, ⑮ and ⑯ carry their own).
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch, scratchHome, freePorts, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
const VNC_ENV = await vncEnv(); // never the machine-global :7/5901 (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 1500) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const J = JSON.stringify;
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ONLY = (process.env.PDSYNC_ONLY || '').split(',').filter(Boolean);
const want = (id) => !ONLY.length || ONLY.includes(String(id));
const ROOT = scratch('pdsync');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const procs = new Set(); const worktrees = new Set(); const homes = [];
function cleanup() {
  for (const p of procs) { try { p.kill('SIGKILL'); } catch { } }
  try { endRootedProcesses(ROOT); } catch { }
  for (const h of homes) { try { endRootedProcesses(h); } catch { } }
  for (const wt of worktrees) { try { execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', wt], { stdio: 'ignore' }); } catch { } }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { }
  for (const h of homes) { try { fs.rmSync(h, { recursive: true, force: true }); } catch { } }
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });

const DESK = 'desk-main';
const FIELDS = ['zIndex', 'gridBounds', 'isMaximized', 'isMinimized', 'isSnapped', 'preSnapBounds'];
const dir = (n) => { const d = path.join(ROOT, 'files', n); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, n + '.txt'), n); return d; };
const W = (n, gb, z, o = {}) => ({ winId: 'win-' + n, title: n, type: 'files', isMinimized: false, isMaximized: false, gridBounds: gb, zIndex: z, openSpec: { action: 'openFileExplorer', path: dir(n) }, explorerPath: dir(n), ...o });
/** 3 overlapping freeform windows (distinct z) + 1 maximized + 1 minimized, one desktop. */
const fixture = () => ({
  current: null, autoSave: null, saved: {}, customGrids: [],
  desktopMeta: [{ id: DESK, name: 'Main' }],
  desktops: { [DESK]: { autoSave: { sidebarOpen: false, windows: [
    W('pd-alpha', { left: 0.05, top: 0.05, width: 0.45, height: 0.5 }, 101),
    W('pd-bravo', { left: 0.2, top: 0.15, width: 0.45, height: 0.5 }, 102),
    W('pd-charlie', { left: 0.35, top: 0.25, width: 0.45, height: 0.5 }, 103),
    W('pd-delta', { left: 0.1, top: 0.1, width: 0.6, height: 0.6 }, 104, { isMaximized: true }),
    W('pd-echo', { left: 0.6, top: 0.1, width: 0.3, height: 0.3 }, 105, { isMinimized: true }),
  ] } } },
});

// ── ⑭ THE CAPTURE CENSUS (lane phone-arrangement-fixes) ──
const CAPTURE_CALL_RE = /\.(captureWindows|captureState|captureWin|captureBuilt|recordFor)\(/g;
const CHOKE_PIN = "return captureForViewport({ held, built, viewport: this.app.isMobile ? 'phone' : 'desktop' });";
const CAPTURE_SITES = [
  // [file under src/lib, enclosing method, call, count, kind, a needle the enclosing method holds (its wiring pin)]
  ['layout.js', 'captureState', 'captureWindows', 1, 'raw primitive', 'return { windows: this.captureWindows(this.app.desktopManager?.activeDesktopId), ...this.captureChrome() };'],
  ['layout.js', 'captureWindows', 'captureWin', 1, 'raw primitive', 'const winState = this.captureWin(win, id);'],
  ['desktop-manager.js', 'captureBuilt', 'captureWin', 1, 'THE ONE CAPTURE', CHOKE_PIN],
  ['desktop-manager.js', 'captureBuilt', 'captureWindows', 1, 'THE ONE CAPTURE', CHOKE_PIN],
  ['desktop-manager.js', 'recordFor', 'captureBuilt', 1, 'through THE ONE CAPTURE', 'const built = this.captureBuilt(desktopId, held);'],
  ['desktop-manager.js', 'presetState', 'captureBuilt', 1, 'through THE ONE CAPTURE', 'windows: this.captureBuilt(this._activeId, held)'],
  ['desktop-manager.js', 'onSyncRefused', 'captureBuilt', 1, 'through THE ONE CAPTURE', 'built: this.captureBuilt(d, rec)'],
  ['desktop-manager.js', '_updateCachedDesktop', 'captureBuilt', 1, 'through THE ONE CAPTURE', 'const moved = this.captureBuilt(desktopId, '],
  ['desktop-manager.js', 'deleteDesktop', 'recordFor', 1, 'a record (recordFor captures through THE ONE CAPTURE)', ''],
  ['desktop-manager.js', 'switchTo', 'recordFor', 1, 'a record (recordFor captures through THE ONE CAPTURE)', ''],
  ['stage-manager.js', 'enter', 'recordFor', 1, 'a record (recordFor captures through THE ONE CAPTURE)', ''],
  ['layout.js', '_doAutoSave', 'recordFor', 2, 'a record (recordFor captures through THE ONE CAPTURE)', ''],
  // a page with no desktop manager — never a phone: app.js builds one on every page (the APP_DM pin below)
  ['layout.js', '_doAutoSave', 'captureState', 1, 'no desktop manager', 'const state = dm?.recordFor && desktopId ? dm.recordFor(desktopId) : this.captureState();'],
  ['layout.js', 'savePreset', 'captureState', 1, 'no desktop manager', 'const state = dm?.presetState ? dm.presetState() : this.captureState();'],
];
const APP_DM = '\n    this.desktopManager = new DesktopManager(this);\n';
const METHOD_RE = /^  (?:async |static )?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/;
/** [file, text] pairs → { sites (file · method · call · n), unknown, dead, unpinned } against CAPTURE_SITES. */
const captureCensus = (srcs) => {
  const tally = new Map(), bodies = new Map();
  for (const [rel, text] of srcs) {
    const lines = text.split('\n');
    let method = null, start = 0;
    lines.forEach((l, i) => {
      const m = METHOD_RE.exec(l);
      if (m) { method = m[1]; start = i; }
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      const code = l.replace(/\s\/\/\s.*$/, '');
      for (const c of code.matchAll(CAPTURE_CALL_RE)) {
        const key = `${rel} · ${method} · ${c[1]}`;
        tally.set(key, (tally.get(key) || 0) + 1);
        if (!bodies.has(`${rel} · ${method}`)) { let e = start + 1; while (e < lines.length && lines[e] !== '  }') e++; bodies.set(`${rel} · ${method}`, lines.slice(start, e + 1).join('\n')); }
      }
    });
  }
  const sites = [...tally].map(([k, n]) => `${k} ×${n}`);
  const rowKey = (r) => `${r[0]} · ${r[1]} · ${r[2]}`;
  const unknown = [...tally].filter(([k, n]) => { const r = CAPTURE_SITES.find((x) => rowKey(x) === k); return !r || r[3] !== n; }).map(([k, n]) => `${k} ×${n}`);
  const dead = CAPTURE_SITES.filter((r) => !tally.has(rowKey(r))).map(rowKey);
  const unpinned = CAPTURE_SITES.filter((r) => r[5] && tally.has(rowKey(r)) && !(bodies.get(`${r[0]} · ${r[1]}`) || '').includes(r[5])).map(rowKey);
  return { sites, unknown, dead, unpinned };
};
const libSources = (ref) => {
  const out = [];
  if (!ref) {
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.js')) out.push([path.relative(path.join(repo, 'src', 'lib'), f), fs.readFileSync(f, 'utf8')]); } };
    walk(path.join(repo, 'src', 'lib'));
  } else {
    try { for (const f of execFileSync('git', ['-C', repo, 'ls-tree', '-r', '--name-only', ref, 'src/lib'], { encoding: 'utf8' }).split('\n').filter((x) => x.endsWith('.js'))) out.push([f.slice('src/lib/'.length), execFileSync('git', ['-C', repo, 'show', `${ref}:${f}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })]); } catch { return null; }
  }
  return out;
};
/** The commit before THIS lane's fix (its first commit carrying captureBuilt, minus one; HEAD while it is uncommitted). */
// int263 seam (j): after the release squash the pair (phone-arrangement-local + its fixes) is ONE commit, so the commit before
// `captureBuilt(` is the previous release — no phone protocol at all (⑩–⑬'s setup is not real there). The fix base must HOLD
// captureForViewport and lack captureBuilt: else the lane's own phone-arrangement-local commit when this clone has it, else none (skip)
const fixBaseShaped = (ref) => { try { const t = execFileSync('git', ['-C', repo, 'show', `${ref}:src/lib/desktop-manager.js`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); return t.includes('captureForViewport') && !t.includes('captureBuilt('); } catch { return false; } };
const fixBaseRef = (() => { let first = 'HEAD'; try { const c = execFileSync('git', ['-C', repo, 'log', '--format=%H', '--reverse', '-S', 'captureBuilt(', '--', 'src/lib/desktop-manager.js'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)[0]; if (c) first = c + '^'; } catch { }
  return fixBaseShaped(first) ? first : fixBaseShaped('f36369057') ? 'f36369057' : 'HEAD'; })();
if (want(14)) {
  console.log('— ⑭ THE CAPTURE CENSUS: every raw capture / ONE-capture / recordFor call site in src/lib');
  const c = captureCensus(libSources(null));
  console.log('    ⑭ sites: ' + c.sites.join(' | '));
  ok(c.sites.length >= CAPTURE_SITES.length && !c.unknown.length, `⑭: every capture call site in src/lib (${c.sites.length}) is THE ONE CAPTURE, a raw primitive's own body, a record through it, or a pinned no-desktop-manager fallback — none unnamed`, J(c.unknown));
  ok(!c.dead.length && !c.unpinned.length, '⑭: no dead row; every pinned row\'s method holds its pin (the choke ends in captureForViewport, its callers pass the held record)', J({ dead: c.dead, unpinned: c.unpinned }));
  ok(fs.readFileSync(path.join(repo, 'src', 'lib', 'app.js'), 'utf8').includes(APP_DM), '⑭: app.js builds a DesktopManager on every page (the no-desktop-manager fallbacks never run on a phone)');
  const baseSrcs = libSources(fixBaseRef);
  if (!baseSrcs || baseSrcs.some(([f, t]) => f === 'desktop-manager.js' && t.includes('captureBuilt('))) skip(`⑭ RED control: no base tree without captureBuilt (${fixBaseRef})`);
  else {
    const b = captureCensus(baseSrcs);
    console.log(`    ⑭ BASE (${fixBaseRef}) unnamed: ${b.unknown.join(' | ')}\n    ⑭ BASE unpinned: ${b.unpinned.join(' | ')}`);
    ok(b.unknown.some((k) => k.startsWith('desktop-manager.js · onSyncRefused · captureWindows')) && b.unknown.some((k) => k.startsWith('desktop-manager.js · _updateCachedDesktop · captureWin')) && b.unpinned.includes('layout.js · savePreset · captureState'), '⑭ RED CONTROL: on the base tree the census names the three back doors (refusal merge, move, preset)', J(b));
  }
}

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (ONLY.length && ONLY.every((x) => x === '14')) console.log('  (⑭ alone: no chrome leg wanted)');
else await (async () => {
  const esbuild = path.join(repo, 'node_modules', '.bin', 'esbuild');
  /** A tree at `ref`; `copy` = this checkout's source over it (the fixed tree judges THIS source, never a stale bundle);
   *  `patchLayout` (⑮'s RED copies) rewrites its src/lib/layout.js before the bundle is built. */
  const mkTree = (name, ref, copy, patchLayout = null) => {
    const wt = path.join(ROOT, name);
    execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, ref], { stdio: 'ignore' }); worktrees.add(wt);
    if (copy) for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
    const bv = path.join(repo, 'src', 'lib', 'build-version.js'); // generated by the build (untracked): a bare tree has none
    if (fs.existsSync(bv) && !fs.existsSync(path.join(wt, 'src', 'lib', 'build-version.js'))) fs.copyFileSync(bv, path.join(wt, 'src', 'lib', 'build-version.js'));
    fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
    if (patchLayout) { const lf = path.join(wt, 'src', 'lib', 'layout.js'); fs.writeFileSync(lf, patchLayout(fs.readFileSync(lf, 'utf8'))); }
    execFileSync(esbuild, ['src/client.js', '--bundle', '--outfile=public/bundle.js', '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css', '--minify'], { cwd: wt, stdio: 'pipe' });
    return wt;
  };
  const startServer = async (wt, tag, fx = fixture) => {
    const home = scratchHome('pdsync-home-' + tag, fs); homes.push(home);
    const DATA = path.join(wt, 'data'); fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(path.join(DATA, 'layouts.json'), J(fx(), null, 1));
    const [PORT] = await freePorts(1);
    const env = { ...process.env, ...VNC_ENV, PATH: '/usr/local/bin:/usr/bin:/bin', PORT: String(PORT), HOME: home, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', LANG: 'C.UTF-8' };
    const s = { PORT, DATA, journal: '' };
    const srv = spawn(process.execPath, ['server.js'], { cwd: wt, env, stdio: ['ignore', 'pipe', 'pipe'] });
    procs.add(srv); srv.stdout.on('data', (d) => { s.journal += d; }); srv.stderr.on('data', (d) => { s.journal += d; });
    s.up = await until(() => s.journal.includes('Ready.'), 60000);
    s.stop = async () => { try { srv.kill('SIGKILL'); } catch { } await until(() => srv.exitCode !== null || srv.signalCode !== null, 5000); procs.delete(srv); };
    s.disk = () => (JSON.parse(fs.readFileSync(path.join(DATA, 'layouts.json'), 'utf8')).desktops?.[DESK]?.autoSave || {});
    s.diskArr = () => Object.fromEntries((s.disk().windows || []).map((w) => [w.winId, Object.fromEntries(FIELDS.filter((k) => k in w).map((k) => [k, w[k]]))]));
    return s;
  };

  /** ONE headless chrome = ONE page; `phone` emulates the iPhone before any navigation (App reads the media at construction). */
  const mkPage = async (name, phone) => {
    const [CDPn] = await freePorts(1);
    const [VW, VH] = phone ? [390, 844] : [1440, 900];
    const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDPn}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', `--window-size=${VW},${VH}`, `--user-data-dir=${path.join(ROOT, 'chrome-' + name)}`, 'about:blank'], { stdio: 'ignore' });
    procs.add(chrome);
    let target = null; for (let i = 0; i < 120 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${CDPn}/json`)).json()).find((t) => t.type === 'page'); } catch { } if (!target) await sleep(250); }
    if (!target) return null;
    const cdpWs = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r, e) => { cdpWs.on('open', r); cdpWs.on('error', e); });
    let seq = 0; const pend = new Map(); const sent = []; const got = [];
    cdpWs.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
      if (m.method === 'Network.webSocketFrameSent') { try { const f = JSON.parse(m.params.response.payloadData); if (f.type === 'layout-sync') sent.push(f); } catch { } }
      if (m.method === 'Network.webSocketFrameReceived') { try { const f = JSON.parse(m.params.response.payloadData); if (f.type === 'layout-sync' || f.type === 'layout-sync-refused') got.push(f); } catch { } }
    });
    const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); cdpWs.send(J({ id, method, params })); });
    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    if (phone) {
      await cdp('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 2, mobile: true });
      await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', platform: 'iPhone' });
      await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
    } else await cdp('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
    const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
    const ptOf = (elExpr) => ev(`(() => { const el = ${elExpr}; if (!el) return null; el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const touch = async (pt, holdMs = 60) => { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] }); await sleep(holdMs); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(250); };
    const tap = async (elExpr, holdMs) => { const pt = await ptOf(elExpr); if (!pt) throw new Error(`${name}: nothing to tap at ${elExpr}`); await touch(pt, holdMs); };
    const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    const click = async (pt) => { await mouse('mouseMoved', pt.x, pt.y, { buttons: 0 }); await mouse('mousePressed', pt.x, pt.y); await sleep(40); await mouse('mouseReleased', pt.x, pt.y); };
    const drag = async (x0, y0, x1, y1, steps = 12) => {
      await mouse('mouseMoved', x0, y0, { buttons: 0 }); await mouse('mousePressed', x0, y0); await sleep(60);
      for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await sleep(30); }
      await sleep(120); await mouse('mouseReleased', x1, y1);
    };
    const boot = async (port) => {
      await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/` });
      const up = await until(async () => { try { return await ev('!!(window.app && window.app.desktopManager && window.app.desktopManager.activeDesktopId)'); } catch { return false; } }, 30000, 200);
      if (up) { await ev('window.app.ready'); await sleep(6500); } // LayoutManager._restoring holds 5 s after boot
      return up;
    };
    return { name, cdp, ev, tap, touch, ptOf, click, drag, boot, sent, got, close: () => { try { cdpWs.close(); } catch { } try { chrome.kill('SIGKILL'); } catch { } } };
  };

  // D's arrangement as the person sees it: z, the laid-out box, maximize / minimize, the fractions
  const ARR = `(() => Object.fromEntries([...app.wm.windows.values()].filter((w) => w._desktopId === app.desktopManager.activeDesktopId).map((w) => [w.id, { z: parseInt(w.element.style.zIndex) || 0, box: [w.element.offsetLeft, w.element.offsetTop, w.element.offsetWidth, w.element.offsetHeight], max: !!w.isMaximized, min: !!w.isMinimized, gb: w.gridBounds ? [w.gridBounds.left, w.gridBounds.top, w.gridBounds.width, w.gridBounds.height] : null }]).sort()))()`;
  const zOrder = (arr) => Object.entries(arr).sort((a, b) => a[1].z - b[1].z).map(([id]) => id).join(' < ');
  const SHOWN = 'app.wm.activeWindowId';
  // the phone's switcher: open it (a REAL tap on the nav title), tap the row that names `title`
  const rowExpr = (title) => `[...document.querySelectorAll('.mobile-win-switcher .mobile-win-row')].find((r) => r.textContent.includes(${J(title)}))`;
  const switchTo = async (P, title) => {
    await P.tap(`document.getElementById('mobile-nav-title')`); await sleep(300);
    await P.tap(rowExpr(title)); await sleep(350);
  };
  const tapThrough = async (P, titles, rounds) => { for (let r = 0; r < rounds; r++) for (const t of titles) await switchTo(P, t); };
  const TITLES = ['pd-alpha', 'pd-bravo', 'pd-charlie', 'pd-delta', 'pd-echo'];
  const nearFull = (gb) => !!gb && gb[0] < 0.1 && gb[1] < 0.1 && gb[2] > 0.85 && gb[3] > 0.85;
  const rawSock = async (port) => { const s = new WebSocket(`ws://127.0.0.1:${port}/ws`); await new Promise((r, e) => { s.on('open', r); s.on('error', e); }); return s; };
  const openFiles = async (P) => { // the phone's "+" long-press sheet → Files (REAL touch: a 700 ms press, then a tap)
    await P.tap(`document.getElementById('mobile-nav-new')`, 700); await sleep(300);
    await P.tap(`[...document.querySelectorAll('.mobile-sheet span')].find((s) => s.textContent.trim() === 'Files')`); await sleep(400);
  };

  // ── ⑩–⑬ (lane phone-arrangement-fixes): a fresh two-desktop record; `red` = the base tree, where each judged check FAILS ──
  const DESK2 = 'desk-two';
  const fixture2 = () => { const f = fixture(); f.desktopMeta.push({ id: DESK2, name: 'Two' }); f.desktops[DESK2] = { autoSave: { sidebarOpen: false, windows: [W('pd-golf', { left: 0.3, top: 0.3, width: 0.3, height: 0.3 }, 101)] } }; return f; };
  const DROP = `(() => { if (window.__dropWrapped) return; window.__dropWrapped = 1; app.ws.globalHandlers = app.ws.globalHandlers.map((h) => (m) => { if (window.__drop && m && m.type === 'layout-sync') return; return h(m); }); })()`;
  const gbEq = (a, b) => !!a && !!b && ['left', 'top', 'width', 'height'].every((k) => Math.abs(a[k] - b[k]) < 0.003);
  const fixLegs = async (S, D, P, D2, red) => {
    const tag = red ? 'BASE ' : '';
    const judge = (c, n, extra) => (red ? ok(!c, `RED CONTROL ${n} — FAILS on the base tree`, extra) : ok(c, n, extra));
    const rec = (desk = DESK) => JSON.parse(fs.readFileSync(path.join(S.DATA, 'layouts.json'), 'utf8')).desktops?.[desk]?.autoSave || {};
    const entry = (id, desk = DESK) => (rec(desk).windows || []).find((w) => w.winId === id) || null;
    const arrOf = (w) => w && Object.fromEntries(FIELDS.filter((k) => k in w).map((k) => [k, w[k]]));
    const titlePt = (Pg, id, dx = 60) => Pg.ev(`(() => { const w = app.wm.windows.get(${J(id)}); const r = w.element.querySelector('.window-titlebar').getBoundingClientRect(); return { x: r.left + ${dx}, y: r.top + r.height / 2 }; })()`);
    const gbOf = (Pg, id) => Pg.ev(`(() => { const w = app.wm.windows.get(${J(id)}); return w ? w.gridBounds : null; })()`);
    const pz = (id) => P.ev(`parseInt(app.wm.windows.get(${J(id)})?.element.style.zIndex) || 0`);
    ok(await D.boot(S.PORT) && await P.boot(S.PORT) && (!D2 || await D2.boot(S.PORT)), `${tag}⑩–⑬: D, P${D2 ? ', D2' : ''} booted on a fresh two-desktop record`);

    if (want(10) && D2) {
      console.log(`— ${tag}⑩ F1: D drags while D2 misses it (an outage), the phone saves, D2 re-reads on reconnect, then saves`);
      await D2.ev(DROP);
      await D2.ev(`(() => { const lm = app.layoutManager, f = lm._resyncFromServer.bind(lm); window.__resyncs = 0; lm._resyncFromServer = (...a) => { if (!a[0]) window.__resyncs++; return f(...a); }; })()`);
      const bravo0 = entry('win-pd-bravo')?.gridBounds;
      await D2.ev('window.__drop = true');
      await D.ev(`app.wm.focusWindow('win-pd-bravo')`); await sleep(300);
      const p = await titlePt(D, 'win-pd-bravo'); await D.drag(p.x, p.y, p.x + 140, p.y + 70); await sleep(1500);
      await until(() => !gbEq(entry('win-pd-bravo')?.gridBounds, bravo0), 5000);
      const pS = P.sent.length; await switchTo(P, 'pd-alpha'); await until(() => P.sent.length > pS && rec().viewport === 'phone', 6000); await sleep(800);
      await D2.ev('window.__drop = false');
      const r0 = await D2.ev('window.__resyncs'); await D2.ev('app.ws.ws.close()');
      const reread = await until(async () => (await D2.ev('window.__resyncs')) > r0, 15000); await sleep(7000);
      const drag = entry('win-pd-bravo')?.gridBounds, onD = await gbOf(D, 'win-pd-bravo'), onD2 = await gbOf(D2, 'win-pd-bravo');
      console.log(`    ${tag}⑩: re-read ${reread}; disk viewport ${rec().viewport}; bravo before ${J(bravo0)} | disk ${J(drag)} | D ${J(onD)} | D2 ${J(onD2)}`);
      ok(reread && rec().viewport === 'phone' && !gbEq(drag, bravo0) && gbEq(drag, onD), `${tag}⑩: the setup is real — D2 re-read after the outage; the record on disk is the phone's and carries D's drag (belt 1)`);
      judge(gbEq(onD2, drag), `${tag}⑩ F1: D2's re-read takes the phone-stamped record whole (bravo where D dragged it)`, J({ onD2, drag }));
      const d2s = D2.sent.length;
      await D2.click(await titlePt(D2, 'win-pd-charlie', 200)); await until(() => D2.sent.length > d2s, 5000); await sleep(2500);
      const disk2 = entry('win-pd-bravo')?.gridBounds, onD3 = await gbOf(D, 'win-pd-bravo');
      console.log(`    ${tag}⑩: after D2's save (${D2.sent.length - d2s} sends): bravo disk ${J(disk2)} | D ${J(onD3)}`);
      ok(D2.sent.length > d2s, `${tag}⑩: D2's title-bar click saved (the leg is not vacuous)`);
      judge(gbEq(disk2, drag) && gbEq(onD3, drag), `${tag}⑩ F1: after D2's save D's drag is kept on disk AND on D`, J({ disk2, onD3, drag }));
    }

    if (want(11)) {
      console.log(`— ${tag}⑪ F2: a phone save the shrink belt refuses ⇒ its re-send carries the held arrangement`);
      await tapThrough(P, ['pd-charlie', 'pd-bravo', 'pd-alpha'], 1); await sleep(1500); // the phone's own z drifts from the record's
      // D opens a window the phone RECEIVES (its held record moves on — its next save is not a duplicate), then one it MISSES
      const openOnD = async (n) => { await D.ev(`void app.replayOpenSpec({ action: 'openFileExplorer', path: ${J(dir(n))} }, 'win-${n}')`); await until(() => D.ev(`app.wm.windows.has('win-${n}')`), 5000); await sleep(400); await D.click(await titlePt(D, 'win-' + n, 150)); await until(() => !!entry('win-' + n), 6000); };
      await openOnD('nw-one'); await until(() => P.ev(`app.wm.windows.has('win-nw-one')`), 6000); await sleep(1500);
      await P.ev(DROP); await P.ev('window.__drop = true');
      await openOnD('nw-two'); await sleep(600);
      const arr0 = S.diskArr(), got0 = P.got.length, pB = P.sent.length;
      await switchTo(P, 'pd-charlie');
      const refused = await until(() => P.got.slice(got0).some((m) => m.type === 'layout-sync-refused'), 6000); await sleep(5000);
      await P.ev('window.__drop = false');
      const reSent = P.sent.slice(pB).some((m) => (m.state?.windows || []).some((w) => w.winId === 'win-nw-two'));
      const arr1 = S.diskArr();
      const changed = Object.keys(arr0).filter((id) => J(arr0[id]) !== J(arr1[id])).map((id) => ({ id, before: arr0[id], after: arr1[id] }));
      console.log(`    ${tag}⑪: refused ${refused}, re-sent with the missed window ${reSent}; arrangement changed on disk: ${J(changed)}`);
      ok(refused && reSent && !!entry('win-nw-two'), `${tag}⑪: the setup is real — the server refused the phone's save (it never built D's new window) and the phone re-sent the reconciled record`);
      judge(!changed.length, `${tag}⑪ F2: the re-send carries NO arrangement of the phone's (every window's z / box / maximize / minimize on disk unchanged)`, J(changed));
      const z0 = zOrder(await D.ev(ARR)); await D.boot(S.PORT); const z1 = zOrder(await D.ev(ARR));
      console.log(`    ${tag}⑪: D before reload ${z0}\n    ${tag}⑪: D after  reload ${z1}`);
      judge(z0 === z1, `${tag}⑪ F2: D's reload shows the z order D had`, J({ z0, z1 }));
    }

    if (want(12)) {
      console.log(`— ${tag}⑫ F3: the phone moves a window to another desktop ⇒ the moved entry keeps the held arrangement`);
      await switchTo(P, 'pd-echo'); await switchTo(P, 'pd-alpha'); // the phone raised echo on its own DOM
      const echo0 = arrOf(entry('win-pd-echo')), z = await pz('win-pd-echo');
      await P.ev(`void app.desktopManager.moveWindowToDesktop('win-pd-echo', ${J(DESK2)}, { speak: true })`);
      await switchTo(P, 'pd-bravo'); // a REAL tap arms the save (§6b guard 2)
      await until(() => !!entry('win-pd-echo', DESK2), 8000); await sleep(1500);
      const moved = arrOf(entry('win-pd-echo', DESK2));
      console.log(`    ${tag}⑫: echo on Main ${J(echo0)} (the phone's own z ${z}) → Two's record ${J(moved)}`);
      ok(!!moved && !!echo0 && z !== echo0.zIndex, `${tag}⑫: the setup is real — the move reached Two's record and the phone's own z for echo (${z}) is not the record's (${echo0?.zIndex})`);
      judge(!!moved && !!echo0 && J(moved) === J(echo0), `${tag}⑫ F3: the moved window's z / box / minimize in Two's record are the held record's, never the phone's`, J({ echo0, moved }));
      await openFiles(P); const nb = await P.ev(SHOWN);
      await until(() => !!entry(nb), 6000);
      await P.ev(`void app.desktopManager.moveWindowToDesktop(${J(nb)}, ${J(DESK2)}, { speak: true })`);
      await switchTo(P, 'pd-alpha');
      await until(() => !!entry(nb, DESK2), 8000); await sleep(1200);
      const mb = entry(nb, DESK2), g = mb?.gridBounds;
      console.log(`    ${tag}⑫: the phone-born ${nb} in Two's record: gridBounds ${J(g)} z ${mb?.zIndex}`);
      ok(!!mb, `${tag}⑫: the phone-born window's move reached Two's record`);
      judge(!!mb && !(g && nearFull([g.left, g.top, g.width, g.height])), `${tag}⑫ F3: …a window born on the phone carries no full-screen box there`, J(mb));
    }

    if (want(13)) {
      console.log(`— ${tag}⑬ F4: a named preset saved on the phone POSTs the held arrangement`);
      await P.ev(`(() => { if (window.__presetWrapped) return; window.__presetWrapped = 1; const f = window.fetch; window.__presets = []; window.fetch = (u, o) => { if (String(u).includes('/api/layouts/') && o && o.method === 'POST') { try { window.__presets.push(JSON.parse(o.body)); } catch { } } return f(u, o); }; })()`);
      await P.ev(`app.layoutManager.savePreset('pd-phone-preset')`);
      const post = await P.ev('window.__presets[0] || null'), held = S.diskArr();
      const diff = (post?.windows || []).filter((w) => held[w.winId] && J(arrOf(w)) !== J(held[w.winId])).map((w) => ({ id: w.winId, post: arrOf(w), held: held[w.winId] }));
      const drift = [];
      for (const id of Object.keys(held)) { const z = await pz(id); if (z && z !== held[id].zIndex) drift.push(id); }
      console.log(`    ${tag}⑬: the preset POST holds ${(post?.windows || []).length} windows; differing from the held record: ${J(diff)}`);
      ok(!!post && (post.windows || []).length >= 3 && drift.length > 0, `${tag}⑬: the setup is real — the phone POSTed the preset and its own z differs from the record's for ${drift.length} windows`);
      judge(!!post && !diff.length, `${tag}⑬ F4: every window the preset POST holds carries the held record's z / box / maximize / minimize`, J(diff));
    }
  };

  // ── ⑮ (lane layout-deferred-writer, B-4767 — phone-arrangement-verify r2 F5): the records deferred under D's press wait
  // PER WRITER CLASS. `mode` names the tree: 'fixed' = this source; the RED copies = this source with ONE line patched back.
  const F5_RED = [
    { mode: 'single-slot', find: '    this._pendingRemote.set(deferKey(msg), msg);', repl: "    this._pendingRemote.set(msg.desktopId || '', msg);", legs: ['a', 'b', 'c', 'd'] },
    { mode: 'no-join', find: '      if (this._restoring || this._pointerDown || this._pendingRemote.size) { this._deferRemote(msg); return; }', repl: '      if (this._restoring || this._pointerDown) { this._deferRemote(msg); return; }', legs: ['d'] },
  ];
  // every layout-sync D receives, with D's gate at that instant (under the press? how many records waiting?)
  const ARRIVALS = `(() => { if (window.__arrWrapped) return; window.__arrWrapped = 1; window.__arr = []; const seen = new WeakSet(), lm = app.layoutManager; app.ws.globalHandlers = app.ws.globalHandlers.map((h) => (m) => { if (m && m.type === 'layout-sync' && !seen.has(m)) { seen.add(m); window.__arr.push({ seq: m.seq || 0, vp: m.viewport || null, down: !!lm._pointerDown, waiting: lm._pendingRemote.size }); } return h(m); }); })()`;
  const EMPTY = `(() => { for (const x of [1420, 1390, 1360]) for (const y of [450, 300, 600, 750, 200]) { const el = document.elementFromPoint(x, y); if (el && el.closest('#workspace') && !el.closest('.window, button, input, a, [role="button"]')) return { x, y }; } return null; })()`;
  const f5Legs = async (S, D, P, DW, mode, legsWanted) => {
    const red = mode !== 'fixed', tag = red ? `${mode.toUpperCase()} ` : '';
    const judge = (c, n, extra) => (red ? ok(!c, `RED CONTROL ${n} — FAILS on the ${mode} copy`, extra) : ok(c, n, extra));
    ok(await D.boot(S.PORT) && await P.boot(S.PORT) && await DW.boot(S.PORT), `${tag}⑮: D, P and a second desktop DW booted on a fresh record`);
    await D.ev(ARRIVALS);
    const idsOf = (Pg) => Pg.ev(`[...app.wm.windows.values()].filter((w) => w._desktopId === app.desktopManager.activeDesktopId).map((w) => w.id).sort()`);
    const gbOf = (Pg, id) => Pg.ev(`(() => { const w = app.wm.windows.get(${J(id)}); return w && w.gridBounds ? { ...w.gridBounds } : null; })()`);
    const titlePt = (Pg, id, dx = 60) => Pg.ev(`(() => { const w = app.wm.windows.get(${J(id)}); const r = w.element.querySelector('.window-titlebar').getBoundingClientRect(); return { x: r.left + ${dx}, y: r.top + r.height / 2 }; })()`);
    const recGb = (m, id) => (m.state?.windows || []).find((w) => w.winId === id)?.gridBounds;
    const waiting = () => D.ev(`[...app.layoutManager._pendingRemote.entries()].map(([k, m]) => k + ' #' + (m.seq || 0))`);
    const arrivals = async () => (await D.ev('window.__arr.slice()')) || [];
    // D's person presses an EMPTY spot of its desktop and holds — a drag about to start: every record waits
    const hold = async () => {
      const pt = await D.ev(EMPTY);
      if (!pt) return null;
      await D.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, buttons: 0 });
      await D.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', buttons: 1, clickCount: 1 });
      return (await D.ev('app.layoutManager._pointerDown === true')) ? pt : null;
    };
    const release = (pt) => D.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', buttons: 0, clickCount: 1 });
    // DW's person drags a window by its title bar; its box is captured after the snap (250 ms) — wait for THAT, never the stale one
    const dwDrag = async (id, dx, dy) => { await DW.ev(`app.wm.focusWindow(${J(id)})`); await sleep(300); const g0 = await gbOf(DW, id), p = await titlePt(DW, id); await DW.drag(p.x, p.y, p.x + dx, p.y + dy); await until(async () => !gbEq(await gbOf(DW, id), g0), 4000); await sleep(150); return gbOf(DW, id); };
    const gotMove = (Pg, from, id, gb) => until(() => Pg.got.slice(from).some((m) => m.type === 'layout-sync' && m.viewport !== 'phone' && gbEq(recGb(m, id), gb)), 8000);
    const gotPhone = (Pg, from) => until(() => Pg.got.slice(from).some((m) => m.type === 'layout-sync' && m.viewport === 'phone'), 8000);

    if (legsWanted.includes('a')) {
      console.log(`— ${tag}⑮a F5: DW's move waits under D's press, then the phone's record lands, then D releases`);
      const pt = await hold();
      if (ok(!!pt, `${tag}⑮a: D's person holds the pointer on an empty spot of its desktop`)) {
        const b0 = await gbOf(D, 'win-pd-bravo'), ids0 = await idsOf(D), dG = D.got.length, pG = P.got.length, a0 = (await arrivals()).length;
        const moved = await dwDrag('win-pd-bravo', 140, 70);
        const gotW = await gotMove(D, dG, 'win-pd-bravo', moved) && await gotMove(P, pG, 'win-pd-bravo', moved); await sleep(600);
        const dG2 = D.got.length; await openFiles(P); const gotP = await gotPhone(D, dG2); await sleep(400);
        const held = await waiting(), arr = (await arrivals()).slice(a0), still = gbEq(await gbOf(D, 'win-pd-bravo'), b0) && J(await idsOf(D)) === J(ids0);
        console.log(`    ${tag}⑮a: bravo on D ${J(b0)}, DW moved it to ${J(moved)}; D's arrivals under the press ${J(arr)}; waiting ${J(held)}`);
        ok(gotW && gotP && still && !gbEq(b0, moved) && arr.length >= 2 && arr.every((x) => x.down), `${tag}⑮a: the setup is real — DW's record and then the phone's landed on D under the press, nothing applied yet`, J({ gotW, gotP, still, arr }));
        await release(pt); await sleep(3500);
        const after = await gbOf(D, 'win-pd-bravo'), born = (await idsOf(D)).filter((id) => !ids0.includes(id));
        console.log(`    ${tag}⑮a: after the release bravo on D ${J(after)}; new on D ${J(born)}`);
        judge(gbEq(after, moved), `${tag}⑮a F5: DW's window move LANDS on D at the release (the phone's record did not replace the desktop record waiting before it)`, J({ b0, moved, after }));
        ok(born.length === 1, `${tag}⑮a: …and the phone's membership change lands on D too (its new window)`, J(born));
      }
    }
    if (legsWanted.includes('b')) {
      console.log(`— ${tag}⑮b the mirror: the phone's record waits first, then DW's move, then D releases`);
      const pt = await hold();
      if (ok(!!pt, `${tag}⑮b: D's person holds the pointer on an empty spot of its desktop`)) {
        const ids0 = await idsOf(D), dG = D.got.length, w0 = (await idsOf(DW)).length, a0 = (await arrivals()).length;
        await openFiles(P); const gotP = await gotPhone(D, dG);
        const dwHas = await until(async () => (await idsOf(DW)).length > w0, 8000); await sleep(1500); // DW built the phone's window (its record lists it), its apply gate closed
        const c0 = await gbOf(D, 'win-pd-charlie'), dG2 = D.got.length;
        const moved = await dwDrag('win-pd-charlie', -120, 60); const gotW = await gotMove(D, dG2, 'win-pd-charlie', moved); await sleep(400);
        const held = await waiting(), arr = (await arrivals()).slice(a0);
        console.log(`    ${tag}⑮b: charlie on D ${J(c0)}, DW moved it to ${J(moved)}; arrivals ${J(arr)}; waiting ${J(held)}`);
        ok(gotP && dwHas && gotW && !gbEq(c0, moved) && arr.length >= 2 && arr.every((x) => x.down) && gbEq(await gbOf(D, 'win-pd-charlie'), c0), `${tag}⑮b: the setup is real — the phone's record and then DW's landed on D under the press`, J({ gotP, dwHas, gotW, arr }));
        await release(pt); await sleep(3500);
        const after = await gbOf(D, 'win-pd-charlie'), born = (await idsOf(D)).filter((id) => !ids0.includes(id));
        console.log(`    ${tag}⑮b: after the release charlie on D ${J(after)}; new on D ${J(born)}`);
        ok(gbEq(after, moved) && born.length === 1, `${tag}⑮b the mirror: the phone's window AND DW's move land on D${red ? ' (holds on this copy too: DW\'s record is whole and lists the phone\'s window)' : ''}`, J({ c0, moved, after, born }));
      }
    }
    if (legsWanted.includes('c')) {
      console.log(`— ${tag}⑮c a pre-.264 desktop (no viewport stamp): its record waits under D's press, then the phone's, then D releases`);
      const pt = await hold();
      if (ok(!!pt, `${tag}⑮c: D's person holds the pointer on an empty spot of its desktop`)) {
        const ids0 = await idsOf(D), a0box = await gbOf(D, 'win-pd-alpha');
        const gb = { left: a0box && a0box.left > 0.3 ? 0.06 : 0.42, top: 0.3, width: 0.35, height: 0.35 };
        const disk = S.disk();
        const state = { ...disk, windows: (disk.windows || []).map((w) => (w.winId === 'win-pd-alpha' ? { ...w, isMaximized: false, isMinimized: false, gridBounds: gb } : w)) }; delete state.viewport;
        const sock = await rawSock(S.PORT); const dG = D.got.length, pG = P.got.length, a0 = (await arrivals()).length;
        sock.send(J({ type: 'layout-sync', desktopId: DESK, state, evidence: [], sentAt: Date.now() })); // NO viewport: an old desktop bundle
        const gotO = await until(() => D.got.slice(dG).some((m) => m.type === 'layout-sync' && !('viewport' in m) && gbEq(recGb(m, 'win-pd-alpha'), gb)), 8000) && await until(() => P.got.slice(pG).some((m) => gbEq(recGb(m, 'win-pd-alpha'), gb)), 8000);
        await sleep(800);
        const dG2 = D.got.length; await openFiles(P); const gotP = await gotPhone(D, dG2); await sleep(400);
        const held = await waiting(), arr = (await arrivals()).slice(a0);
        console.log(`    ${tag}⑮c: alpha on D ${J(a0box)}, the unstamped record moves it to ${J(gb)}; arrivals ${J(arr)}; waiting ${J(held)}`);
        ok(gotO && gotP && arr.length >= 2 && arr.every((x) => x.down) && arr[0].vp === null && gbEq(await gbOf(D, 'win-pd-alpha'), a0box), `${tag}⑮c: the setup is real — an UNSTAMPED record and then the phone's landed on D under the press`, J({ gotO, gotP, arr }));
        await release(pt); await sleep(3500); sock.close();
        const after = await gbOf(D, 'win-pd-alpha'), born = (await idsOf(D)).filter((id) => !ids0.includes(id));
        console.log(`    ${tag}⑮c: after the release alpha on D ${J(after)}; new on D ${J(born)}`);
        judge(gbEq(after, gb), `${tag}⑮c: an unstamped record (a pre-.264 desktop) waits as a DESKTOP record — its move lands at the release, the phone's record after it`, J({ a0box, gb, after }));
        ok(born.length === 1, `${tag}⑮c: …and the phone's new window lands on D too`, J(born));
      }
    }
    if (legsWanted.includes('d')) {
      console.log(`— ${tag}⑮d DW's move waits under D's press; D releases and a phone record lands in the drain's 300 ms, while DW's still waits`);
      const pt = await hold();
      if (ok(!!pt, `${tag}⑮d: D's person holds the pointer on an empty spot of its desktop`)) {
        const c0 = await gbOf(D, 'win-pd-charlie'), dG = D.got.length, a0 = (await arrivals()).length;
        const moved = await dwDrag('win-pd-charlie', 110, -50); const gotW = await gotMove(D, dG, 'win-pd-charlie', moved); await sleep(400);
        const name = 'pd-late-' + mode, disk = S.disk();
        const state = { ...disk, windows: [...(disk.windows || []), W(name, { left: 0.55, top: 0.5, width: 0.3, height: 0.3 }, 300)] }; delete state.viewport;
        const sock = await rawSock(S.PORT);
        await release(pt);
        sock.send(J({ type: 'layout-sync', desktopId: DESK, state, evidence: [], sentAt: Date.now(), viewport: 'phone' }));
        await sleep(4000); sock.close();
        const arr = (await arrivals()).slice(a0), late = arr.find((x) => x.vp === 'phone');
        console.log(`    ${tag}⑮d: charlie on D ${J(c0)}, DW moved it to ${J(moved)}; arrivals ${J(arr)}`);
        ok(gotW && !gbEq(c0, moved) && !!late && !late.down && late.waiting >= 1, `${tag}⑮d: the setup is real — the phone record landed AFTER the release while DW's record still waited (${late ? late.waiting : 0} waiting)`, J({ gotW, arr }));
        const after = await gbOf(D, 'win-pd-charlie'), hasLate = (await idsOf(D)).includes('win-' + name);
        console.log(`    ${tag}⑮d: after the drain charlie on D ${J(after)}; the phone's window on D ${hasLate}`);
        judge(gbEq(after, moved) && hasLate, `${tag}⑮d: the late phone record JOINS the waiting one — DW's move lands, then the phone's window (never the older record dropped, never one applied backwards)`, J({ moved, after, hasLate }));
      }
    }
  };

  // ── ⑯ (lane phone-sidebar-chrome): a phone never applies another viewport's chrome ──
  const PNG_DIR = process.env.PDSYNC_PNG_DIR || '';
  if (PNG_DIR) fs.mkdirSync(PNG_DIR, { recursive: true });
  /** the owner's record shape (layouts.json, 2026-10-14): the desk's chrome — sidebar open, a 1×3 grid — on the desktop's record */
  const fixtureSB = () => { const f = fixture(); Object.assign(f.desktops[DESK].autoSave, { sidebarOpen: true, grid: { rows: 1, cols: 3 }, viewport: 'desktop' }); return f; };
  const SBSTATE = `(() => { const el = document.getElementById('sidebar'), r = el.getBoundingClientRect(), cs = getComputedStyle(el); return { open: !!app.sidebar.isOpen, cls: el.classList.contains('open'), wrap: document.getElementById('main-wrapper').classList.contains('sidebar-open'), onScreen: r.width > 0 && r.right > 4 && r.left < innerWidth - 4 && cs.display !== 'none' && cs.visibility !== 'hidden', grid: app.wm.grid ? [app.wm.grid.rows, app.wm.grid.cols] : null }; })()`;
  const sbClosed = (s) => !!s && !s.open && !s.cls && !s.wrap && !s.onScreen;
  const sbOpen = (s) => !!s && s.open && s.cls && s.onScreen;
  const sbLegs = async (S, D, P, red) => {
    const tag = red ? 'RED COPY ' : '';
    const judge = (c, n, extra) => (red ? ok(!c, `RED CONTROL ${n} — FAILS when the phone asks as a desk (the pre-fix apply)`, extra) : ok(c, n, extra));
    const png = async (Pg, name) => { if (!PNG_DIR) return; const r = await Pg.cdp('Page.captureScreenshot', { format: 'png' }); const f = path.join(PNG_DIR, (red ? 'red-' : '') + name); fs.writeFileSync(f, Buffer.from(r.data, 'base64')); console.log('    PNG ' + f); };
    const chromeOf = (r) => J({ sidebarOpen: r.sidebarOpen, grid: r.grid, viewport: r.viewport });
    const closeP = async () => { if ((await P.ev(SBSTATE)).open) { await P.tap(`document.getElementById('sidebar-close')`); await sleep(500); } };
    // a live record from another client (a raw socket): the record on disk with its sidebarOpen set, stamped `viewport`
    const live = async (sidebarOpen, viewport = 'desktop') => {
      const rec = S.disk(), s = await rawSock(S.PORT), gP = P.got.length, gD = D.got.length;
      s.send(J({ type: 'layout-sync', desktopId: DESK, state: { ...rec, sidebarOpen, updatedAt: undefined }, evidence: [], sentAt: Date.now(), viewport }));
      const seen = (Pg, from) => Pg.got.slice(from).some((m) => m.type === 'layout-sync' && m.viewport === viewport && m.state && m.state.sidebarOpen === sidebarOpen);
      const got = await until(() => seen(P, gP) && seen(D, gD), 8000); await sleep(1200); s.close();
      return got;
    };
    const pSave = async (title) => { const n = P.sent.length; await switchTo(P, title); const sent = await until(() => P.sent.length > n && S.disk().viewport === 'phone', 6000); await sleep(800); return sent ? P.sent.slice(n) : []; };
    const carried = (sends, want) => sends.length > 0 && sends.every((m) => m.state && m.state.sidebarOpen === want && J(m.state.grid) === J({ rows: 1, cols: 3 }));

    ok(await D.boot(S.PORT) && await P.boot(S.PORT), `${tag}⑯: D and P booted on a record whose desk chrome holds the sidebar OPEN and a 1×3 grid`);
    const d0 = await D.ev(SBSTATE), p0 = await P.ev(SBSTATE);
    console.log(`    ${tag}⑯a: disk ${chromeOf(S.disk())}; D ${J(d0)}; P ${J(p0)}`);
    ok(sbOpen(d0) && J(d0.grid) === '[1,3]', `${tag}⑯ the setup is real — D (a desk) follows the record at boot: its sidebar open, a 1×3 grid`, J(d0));
    judge(sbClosed(p0), `${tag}⑯a: P's reload on the desk's record (sidebarOpen true) ⇒ P's sidebar CLOSED`, J(p0));
    judge(p0.grid === null, `${tag}⑯a: …and P set no grid from it (a phone never sets one)`, J(p0));
    await png(P, 'phone-390-after-reload.png'); await png(D, 'desk-1440-unchanged.png');
    await closeP();

    console.log(`— ${tag}⑯a P saves (the record becomes the phone's — the owner's shape), then reloads on it`);
    const s1 = await pSave('pd-bravo'), r1 = S.disk();
    console.log(`    ${tag}⑯a: P sent ${s1.length}; disk ${chromeOf(r1)}`);
    ok(s1.length >= 1 && r1.viewport === 'phone' && r1.sidebarOpen === true && J(r1.grid) === J({ rows: 1, cols: 3 }), `${tag}⑯a: P's switcher tap saved — the record is the phone's now, the desk's sidebarOpen true and 1×3 grid carried (the .264 carry)`, J(r1));
    await P.boot(S.PORT);
    const p1 = await P.ev(SBSTATE);
    console.log(`    ${tag}⑯a: P after the reload on the phone's record: ${J(p1)}`);
    judge(sbClosed(p1) && p1.grid === null, `${tag}⑯a: P's reload on the record it wrote itself (viewport 'phone', sidebarOpen true — the owner's record) ⇒ CLOSED, no grid`, J(p1));
    await closeP();

    console.log(`— ${tag}⑯b P comes back from the background: its socket drops, it reconnects and re-reads the layouts`);
    await P.ev(`(() => { if (window.__sbWrapped) return; window.__sbWrapped = 1; const lm = app.layoutManager, f = lm._resyncFromServer.bind(lm); window.__sbResync = 0; lm._resyncFromServer = (...a) => { if (!a[0]) window.__sbResync++; return f(...a); }; })()`);
    const r0 = await P.ev('window.__sbResync'); await P.ev('app.ws.ws.close()');
    const reread = await until(async () => (await P.ev('window.__sbResync')) > r0, 15000);
    await until(async () => !(await P.ev('app.layoutManager._resyncing')), 8000); await sleep(2500);
    const p2 = await P.ev(SBSTATE);
    console.log(`    ${tag}⑯b: re-read ${reread}; disk ${chromeOf(S.disk())}; P ${J(p2)}`);
    ok(reread, `${tag}⑯b: the setup is real — P's socket dropped and P re-read /api/layouts on reconnect (state-resync → layout-resync)`);
    judge(sbClosed(p2), `${tag}⑯b: after the re-read P's sidebar is still CLOSED`, J(p2));
    await png(P, 'phone-390-after-resync.png');
    await closeP();
    const g0 = await live(true), p2b = await P.ev(SBSTATE);
    ok(g0, `${tag}⑯b: the setup is real — a live DESK record (sidebarOpen true) reached P and D`);
    judge(sbClosed(p2b), `${tag}⑯b: a live desk record holding the sidebar open leaves P's CLOSED`, J(p2b));
    await closeP();

    console.log(`— ${tag}⑯c P's person opens its sidebar; the desk's record closes, then opens, its own`);
    await P.tap(`document.getElementById('mobile-nav-menu')`); await sleep(600);
    const p3 = await P.ev(SBSTATE), nB = P.sent.length;
    ok(sbOpen(p3), `${tag}⑯c: P's person opened its sidebar (a real tap on ☰)`, J(p3));
    const g1 = await live(false), p4 = await P.ev(SBSTATE), d4 = await D.ev(SBSTATE);
    console.log(`    ${tag}⑯c: after the desk record closing its sidebar: P ${J(p4)}; D ${J(d4)}`);
    ok(g1, `${tag}⑯c: the setup is real — the desk record (sidebarOpen false) reached P and D`);
    judge(sbOpen(p4), `${tag}⑯c: the desk's record closing its sidebar leaves P's OPEN — as P's person left it`, J(p4));
    await png(P, 'phone-390-own-open-kept.png');
    ok(!d4.open && !d4.cls && !d4.wrap, `${tag}⑯d: D follows the desk record's sidebarOpen false (its sidebar closed)`, J(d4));
    // P saves WHILE its own sidebar is open over a desk record holding false: a real tap on the sidebar's title arms the save
    // (guard 2), the save is asked for as any change asks it — the record P holds differs from P's last send, so it goes out
    if ((await P.ev(SBSTATE)).open) {
      const n = P.sent.length;
      await P.tap(`document.querySelector('#sidebar .sidebar-title')`); await P.ev('void app.layoutManager.scheduleAutoSave()');
      await until(() => P.sent.length > n, 6000); await sleep(600);
    }
    const sendsB = P.sent.slice(nB);
    await closeP();
    const p5 = await P.ev(SBSTATE);
    ok(sbClosed(p5), `${tag}⑯c: P's person closed its sidebar (a real tap on ✕)`, J(p5));
    const g2 = await live(true), p6 = await P.ev(SBSTATE), d6 = await D.ev(SBSTATE);
    console.log(`    ${tag}⑯c: after the desk record opening its sidebar: P ${J(p6)}; D ${J(d6)}`);
    ok(g2, `${tag}⑯c: the setup is real — the desk record (sidebarOpen true) reached P and D`);
    judge(sbClosed(p6), `${tag}⑯c: the desk's record opening its sidebar leaves P's CLOSED — as P's person left it`, J(p6));
    ok(sbOpen(d6), `${tag}⑯d: D follows the desk record's sidebarOpen true (its sidebar open)`, J(d6));
    await closeP();
    const s3 = await pSave('pd-charlie'), r3 = S.disk();
    console.log(`    ${tag}⑯c: P's sends while its sidebar was open over a desk record holding false: ${J(sendsB.map((m) => m.state && m.state.sidebarOpen))}; P's save now (its own closed, the desk's open): ${J(s3.map((m) => m.state && m.state.sidebarOpen))}; disk ${chromeOf(r3)}`);
    ok(carried(s3, true) && r3.sidebarOpen === true && r3.viewport === 'phone' && (red || sendsB.length >= 1) && sendsB.every((m) => m.state && m.state.sidebarOpen === false), `${tag}⑯c: every save P sends carries the DESK's sidebarOpen byte-identical (true while P's own is closed; false while P's own was open) — never P's own`, J({ s3: s3.length, sendsB: sendsB.length, r3 }));

    console.log(`— ${tag}⑯d the desk's own legs`);
    await D.boot(S.PORT);
    const d7 = await D.ev(SBSTATE);
    console.log(`    ${tag}⑯d: D after a reload on the record the phone wrote last (${chromeOf(S.disk())}): ${J(d7)}`);
    ok(S.disk().viewport === 'phone' && sbOpen(d7) && J(d7.grid) === '[1,3]', `${tag}⑯d: D's reload on the record the phone wrote last takes it whole — D keeps its sidebar open and its 1×3 grid (belt 1 carried them)`, J(d7));
    const g3 = await live(false, 'phone'), d8 = await D.ev(SBSTATE);
    ok(g3 && sbOpen(d8), `${tag}⑯d: a live PHONE-stamped record holding sidebarOpen false leaves D's sidebar open (membership + content only — by class)`, J({ g3, d8 }));
  };

  const D = await mkPage('desk', false), P = await mkPage('phone', true);
  if (!ok(!!D && !!P, 'two chromes exposed a CDP page target each (D 1440×900, P iPhone 390×844)')) return;
  try {
    // ── THE FIXED TREE ──
    const fixedTree = mkTree('fixed', 'HEAD', true);
    const S = await startServer(fixedTree, 'fixed');
    if (!ok(S.up, 'the fixed-tree server booted (own data/ under ' + ROOT + ')', S.journal.slice(-600))) return;
    ok(await D.boot(S.PORT) && await P.boot(S.PORT), 'D and P booted on the same desktop record');
    const env = await P.ev(`({ mobile: app.isMobile, touch: app.isTouch, nav: !!app._mobileNav })`);
    ok(env.mobile && env.touch && env.nav && !(await D.ev('app.isMobile')), 'P is a phone (app.isMobile AND app.isTouch, MobileNav), D is not', J(env));
    // a boot restores no maximize (restoreState never did) — D's person maximizes delta by a REAL title-bar double-click,
    // D's save carries it, P applies it: the fixture's maximized window is a real one on both pages
    const dtb = await D.ev(`(() => { app.wm.focusWindow('win-pd-delta'); const r = app.wm.windows.get('win-pd-delta').element.querySelector('.window-titlebar').getBoundingClientRect(); return { x: r.left + 120, y: r.top + r.height / 2 }; })()`);
    await D.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dtb.x, y: dtb.y, buttons: 0 });
    for (const n of [1, 2]) { await D.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: dtb.x, y: dtb.y, button: 'left', buttons: 1, clickCount: n }); await D.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dtb.x, y: dtb.y, button: 'left', buttons: 0, clickCount: n }); await sleep(60); }
    await until(() => S.disk().windows?.find((w) => w.winId === 'win-pd-delta')?.isMaximized === true, 5000);
    await until(() => P.ev(`app.wm.windows.get('win-pd-delta')?.isMaximized === true`), 5000);
    await sleep(1500);
    const d0 = await D.ev(ARR);
    ok(Object.keys(d0).length === 5 && d0['win-pd-delta']?.max && d0['win-pd-echo']?.min, 'D shows the 5 windows: 3 freeform + 1 maximized + 1 minimized', J(d0));

    if (want(1)) {
      console.log('— ① P taps its switcher through every window ×5');
      const disk0 = S.diskArr(), dGot0 = D.got.length, pSent0 = P.sent.length;
      await tapThrough(P, TITLES, 5);
      await sleep(2500);
      const d1 = await D.ev(ARR), disk1 = S.diskArr();
      const pSends = P.sent.slice(pSent0);
      ok(pSends.length >= 1 && pSends.every((m) => m.viewport === 'phone') && D.got.length > dGot0, `①: P's taps SAVED (${pSends.length} layout-sync, every one stamped viewport:'phone') and D received them (${D.got.length - dGot0}) — the leg is not vacuous`, J(pSends.map((m) => m.viewport)));
      ok(J(d1) === J(d0), `①: D's z order / boxes / maximize / minimize are BYTE-IDENTICAL after 25 real switcher taps (${zOrder(d1)})`, J({ before: d0, after: d1 }));
      ok(J(disk1) === J(disk0), '①: …and so are the arrangement fields of data/layouts.json', J({ before: disk0, after: disk1 }));
      const pz = await P.ev(`Object.fromEntries([...app.wm.windows.values()].map((w) => [w.id, parseInt(w.element.style.zIndex) || 0]))`);
      ok(Math.max(...Object.values(pz)) > Math.max(...Object.values(d1).map((a) => a.z)), `①: the phone's OWN z moved (its local recency: max ${Math.max(...Object.values(pz))}) — none of it left the phone`, J(pz));
    }

    let bornId = null;
    if (want(2)) {
      console.log('— ② P opens Files from its "+" sheet');
      const arr0 = await D.ev(ARR), before = new Set(Object.keys(arr0));
      const pSent0 = P.sent.length;
      await openFiles(P);
      bornId = await P.ev(SHOWN);
      ok(!!bornId && !before.has(bornId), `②: P opened a new window by touch (${bornId})`);
      ok(await until(async () => !!(await D.ev(ARR))[bornId], 8000), '②: D built it (membership flows)');
      await sleep(900);
      const d2 = await D.ev(ARR), born = d2[bornId];
      const others = Object.entries(d2).filter(([id]) => id !== bornId).map(([, a]) => a.z);
      const wsBox = await D.ev(`(() => { const r = document.getElementById('workspace').getBoundingClientRect(); return [r.width, r.height]; })()`);
      ok(!!born && born.box[2] < wsBox[0] * 0.75 && born.box[3] < wsBox[1] * 0.75 && !born.max, `②: on D it lands at D's own default box ${J(born?.box)} in a ${J(wsBox)} workspace — not the full workspace`, J(born));
      ok(!!born && born.z > Math.max(...others), `②: …on top (z ${born?.z} > ${Math.max(...others)})`);
      const sentBorn = P.sent.slice(pSent0).map((m) => (m.state?.windows || []).find((w) => w.winId === bornId)).filter(Boolean).pop();
      ok(!!sentBorn && !sentBorn.gridBounds && sentBorn.zIndex > 105 && sentBorn.isMaximized === false && sentBorn.isMinimized === false, `②: P's record carried NO box for it (every desktop places it by its own default), z = max(held) + 1 = ${sentBorn?.zIndex}`, J(sentBorn));
      ok(J(Object.fromEntries(Object.entries(d2).filter(([id]) => id !== bornId))) === J(arr0), '②: D\'s other windows did not move', J({ arr0, d2 }));
    }

    if (want(3)) {
      console.log('— ③ P closes a window');
      await switchTo(P, 'pd-charlie');
      const pSent0 = P.sent.length, j0 = S.journal.length;
      await P.tap(`document.getElementById('mobile-nav-close')`); await sleep(400);
      // a confirm (if the window asks) is answered by a tap too
      const confirmBtn = await P.ptOf(`document.querySelector('.dialog-overlay .btn-primary, #dialog-overlay .btn-primary')`);
      if (confirmBtn) await P.touch(confirmBtn);
      ok(await until(async () => !(await D.ev(ARR))['win-pd-charlie'], 8000), '③: D closed pd-charlie (membership flows from the phone)');
      const ev3 = P.sent.slice(pSent0).flatMap((m) => m.evidence || []);
      ok(ev3.some((e) => e.id === 'win-pd-charlie' && e.why === 'closed'), '③: P\'s save carried the close evidence', J(ev3));
      ok(!/REFUSED/.test(S.journal.slice(j0)), '③: the shrink belt never refused', (S.journal.slice(j0).match(/[^\n]*REFUSED[^\n]*/g) || []).join('\n'));
      ok(await until(() => !(S.disk().windows || []).some((w) => w.winId === 'win-pd-charlie'), 4000), '③: the record on disk dropped it', J((S.disk().windows || []).map((w) => w.winId)));
    }

    if (want(4)) {
      console.log('— ④ D drags one window and minimizes another');
      await switchTo(P, 'pd-alpha');
      const shown0 = await P.ev(SHOWN);
      // the maximized delta covers the rest: bravo and alpha are brought up first (no input), then the person's real drag / click
      const tb = await D.ev(`(() => { app.wm.focusWindow('win-pd-bravo'); const r = app.wm.windows.get('win-pd-bravo').element.querySelector('.window-titlebar').getBoundingClientRect(); return { x: r.left + 80, y: r.top + r.height / 2 }; })()`);
      await D.drag(tb.x, tb.y, tb.x + 140, tb.y + 90);
      await sleep(400);
      const minBtn = await D.ev(`(() => { const w = app.wm.windows.get('win-pd-alpha'); app.wm.focusWindow(w.id); const r = w.element.querySelector('.win-minimize').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await D.click(minBtn);
      const dSent0 = D.sent.length;
      await until(() => D.sent.length > dSent0, 4000); await sleep(2500);
      const dRec = D.sent.slice(-1)[0]?.state?.windows || [];
      const dBravo = dRec.find((w) => w.winId === 'win-pd-bravo'), dAlpha = dRec.find((w) => w.winId === 'win-pd-alpha');
      ok(!!dBravo && dBravo.gridBounds.left > 0.25 && dAlpha?.isMinimized === true, `④: D's save carries the drag (bravo at ${J(dBravo?.gridBounds)}) and alpha minimized`, J({ dBravo, dAlpha }));
      ok(await P.ev(SHOWN) === shown0, `④: P keeps ITS window on show (${shown0}) though D minimized it`, await P.ev(SHOWN));
      const pSent0 = P.sent.length;
      await switchTo(P, 'pd-delta'); await sleep(2000);
      const pRec = P.sent.slice(pSent0).slice(-1)[0]?.state?.windows || [];
      const pick = (w) => w && Object.fromEntries(FIELDS.filter((k) => k in w).map((k) => [k, w[k]]));
      const pB = pRec.find((w) => w.winId === 'win-pd-bravo'), pA = pRec.find((w) => w.winId === 'win-pd-alpha');
      ok(pRec.length > 0 && J(pick(pB)) === J(pick(dBravo)) && J(pick(pA)) === J(pick(dAlpha)) && pA.isMinimized === true, '④: P\'s next user-caused save carries D\'s new box and isMinimized:true VERBATIM (guard 5 by construction)', J({ pB: pick(pB), dB: pick(dBravo), pA: pick(pA) }));
      ok(await D.ev(`app.wm.windows.get('win-pd-alpha').isMinimized === true`), '④: D\'s alpha stays minimized after the phone\'s save');
    }

    if (want(5)) {
      console.log('— ⑤ P reloads');
      // the open window LOWEST in the record's z order — never the one a boot would pick by itself (the most recent)
      const open = (S.disk().windows || []).filter((w) => !w.isMinimized && TITLES.includes(String(w.winId).replace(/^win-/, ''))).sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
      const pickW = open[0];
      if (!pickW) throw new Error('⑤: no open fixture window on disk: ' + J(S.disk().windows));
      await switchTo(P, pickW.winId.replace(/^win-/, ''));
      const shown = await P.ev(SHOWN);
      await P.boot(S.PORT);
      await sleep(1500);
      const after = await P.ev(SHOWN);
      ok(open.length >= 2 && shown === pickW.winId && after === shown, `⑤: after a reload P shows the same window (${shown} → ${after}; the record's most recent is ${open[open.length - 1]?.winId})`, J(open.map((w) => [w.winId, w.zIndex])));
    }

    if (want(7)) {
      console.log('— ⑦ BELT 1 alone: P\'s stamp stripped on the wire');
      await P.ev(`(() => { const ws = app.ws; const orig = ws.send.bind(ws); ws.send = (m) => { if (m && m.type === 'layout-sync') { m = { ...m }; delete m.viewport; } return orig(m); }; return true; })()`);
      const before = await D.ev(ARR), pSent0 = P.sent.length, dGot0 = D.got.length;
      await tapThrough(P, ['pd-alpha', 'pd-bravo', 'pd-delta', 'pd-echo'], 2);
      await sleep(2500);
      const sends = P.sent.slice(pSent0);
      ok(sends.length >= 1 && sends.every((m) => !('viewport' in m)) && D.got.length > dGot0 && D.got.slice(dGot0).every((m) => !('viewport' in m)), `⑦: P's saves left UNSTAMPED (${sends.length}) and reached D unstamped — belt 2 is off`);
      const after = await D.ev(ARR);
      ok(J(after) === J(before), `⑦: D is unchanged all the same — the phone never wrote arrangement (${zOrder(after)})`, J({ before, after }));
    }

    if (want(6)) {
      console.log('— ⑥ BELT 2 alone: a hand-built phone-stamped record with scrambled arrangement');
      const before = await D.ev(ARR);
      const rec = S.disk();
      const scrambled = (rec.windows || []).map((w, i) => ({ ...w, zIndex: 9000 - i * 7, gridBounds: { left: 0, top: 0, width: 1, height: 1 }, isMaximized: i % 2 === 0, isMinimized: i % 3 === 1 }));
      scrambled.push(W('pd-foxtrot', { left: 0, top: 0, width: 1, height: 1 }, 9999));
      const s = await rawSock(S.PORT);
      s.send(J({ type: 'layout-sync', desktopId: DESK, state: { ...rec, windows: scrambled, updatedAt: undefined }, evidence: [], sentAt: Date.now(), viewport: 'phone' }));
      ok(await until(async () => !!(await D.ev(ARR))['win-pd-foxtrot'], 8000), '⑥: D built the record\'s new window (membership applies)');
      await sleep(900);
      const after = await D.ev(ARR);
      const kept = Object.fromEntries(Object.entries(after).filter(([id]) => before[id]));
      ok(J(kept) === J(before), `⑥: D's existing windows kept every box, z, maximize and minimize (${zOrder(kept)})`, J({ before, after: kept }));
      ok(!nearFull(after['win-pd-foxtrot']?.gb) && !after['win-pd-foxtrot']?.max, `⑥: …and the new one is placed by D's own default, not the record's full box (${J(after['win-pd-foxtrot']?.box)})`);
      ok(S.disk().viewport === 'phone', '⑥: the server stored the stamp on the record (viewport:\'phone\')', J(S.disk().viewport));
      s.close();
    }

    if (want(9)) {
      console.log('— ⑨ an unstamped / desktop-stamped record still arranges D (today\'s path)');
      for (const [label, stamp, left] of [['unstamped (an old desktop bundle)', undefined, 0.4], ['viewport:\'desktop\'', 'desktop', 0.15]]) {
        const rec = S.disk();
        const windows = (rec.windows || []).map((w) => (w.winId === 'win-pd-bravo' ? { ...w, isMaximized: false, isMinimized: false, gridBounds: { left, top: 0.3, width: 0.35, height: 0.35 } } : w));
        const s = await rawSock(S.PORT);
        s.send(J({ type: 'layout-sync', desktopId: DESK, state: { ...rec, windows }, evidence: [], sentAt: Date.now(), ...(stamp ? { viewport: stamp } : {}) }));
        const moved = await until(async () => { const a = (await D.ev(ARR))['win-pd-bravo']; return !!a && Math.abs(a.gb[0] - left) < 0.01; }, 8000);
        ok(moved, `⑨: a ${label} record moves D's window (bravo → left ${left})`, J((await D.ev(ARR))['win-pd-bravo']));
        s.close(); await sleep(600);
      }
    }

    // ── ⑧ THE BASE TREE (RED controls, printed) ──
    if (want(8)) {
      console.log('— ⑧ RED controls on the base tree');
      let intro = '';
      try { intro = execFileSync('git', ['-C', repo, 'log', '--format=%H', '--reverse', '-S', 'captureForViewport', '--', 'src/lib/desktop-record.js'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)[0] || ''; } catch { }
      const baseRef = intro ? intro + '^' : 'HEAD';
      let baseSrc = ''; try { baseSrc = execFileSync('git', ['-C', repo, 'show', `${baseRef}:src/lib/desktop-record.js`], { encoding: 'utf8' }); } catch { }
      if (!baseSrc || baseSrc.includes('captureForViewport')) skip(`⑧: no base tree without captureForViewport (${baseRef})`);
      else {
        const baseTree = mkTree('base', baseRef, false);
        const B = await startServer(baseTree, 'base');
        if (ok(B.up, `⑧: the BASE-tree server booted (${execFileSync('git', ['-C', repo, 'rev-parse', '--short', baseRef], { encoding: 'utf8' }).trim()})`, B.journal.slice(-600))) {
          await D.boot(B.PORT); await P.boot(B.PORT);
          const b0 = await D.ev(ARR);
          await tapThrough(P, ['pd-alpha', 'pd-bravo', 'pd-charlie', 'pd-delta'], 1);
          await sleep(2500);
          const b1 = await D.ev(ARR);
          console.log(`    BASE ①: D's z order before: ${zOrder(b0)}\n    BASE ①: D's z order after 4 phone taps: ${zOrder(b1)}`);
          ok(J(Object.values(b1).map((a) => a.z)) !== J(Object.values(b0).map((a) => a.z)), '⑧ RED CONTROL ①: on the base tree the phone\'s switcher taps RESTACK D (its z values change)', J({ b0, b1 }));
          const ids0 = new Set(Object.keys(b1));
          await openFiles(P);
          const nb = await P.ev(SHOWN);
          await until(async () => !!(await D.ev(ARR))[nb], 8000); await sleep(1200);
          const bb = (await D.ev(ARR))[nb];
          console.log(`    BASE ②: the phone-born window ${nb} on D: gridBounds ${J(bb?.gb)} box ${J(bb?.box)}`);
          ok(!ids0.has(nb) && nearFull(bb?.gb), '⑧ RED CONTROL ②: on the base tree the phone-born window lands near {0,0,1,1} on D', J(bb));
        }
      }
    }

    // ── ⑩–⑬ on a fresh record: the fixed tree, then the commit before the fix (RED controls, printed) ──
    if ([10, 11, 12, 13].some(want)) {
      const D2 = want(10) ? await mkPage('desk2', false) : null;
      try {
        await S.stop();
        const S2 = await startServer(fixedTree, 'fixed2', fixture2);
        if (ok(S2.up, '⑩–⑬: the fixed-tree server re-booted on a fresh two-desktop record', S2.journal.slice(-600))) await fixLegs(S2, D, P, D2, false);
        await S2.stop();
        let baseSrc = ''; try { baseSrc = execFileSync('git', ['-C', repo, 'show', `${fixBaseRef}:src/lib/desktop-manager.js`], { encoding: 'utf8' }); } catch { }
        if (!baseSrc || baseSrc.includes('captureBuilt(')) skip(`⑩–⑬ RED controls: no base tree without captureBuilt (${fixBaseRef})`);
        else {
          console.log(`— ⑩–⑬ RED controls on the commit before the fix (${execFileSync('git', ['-C', repo, 'rev-parse', '--short', fixBaseRef], { encoding: 'utf8' }).trim()})`);
          const B2 = await startServer(mkTree('fixbase', fixBaseRef, false), 'fixbase', fixture2);
          if (ok(B2.up, '⑩–⑬: the base-tree server booted', B2.journal.slice(-600))) await fixLegs(B2, D, P, D2, true);
          await B2.stop();
        }
      } finally { D2?.close(); }
    }
    // ── ⑮ B-4767: the deferred records per writer class — this source, then the RED copies (printed) ──
    if (want(15)) {
      const DW = await mkPage('deskw', false);
      try {
        if (ok(!!DW, '⑮: a second desktop chrome (DW, 1440×900) exposed a CDP page target')) {
          await S.stop();
          const S5 = await startServer(fixedTree, 'f5', fixture);
          if (ok(S5.up, '⑮: the fixed-tree server re-booted on a fresh record', S5.journal.slice(-600))) await f5Legs(S5, D, P, DW, 'fixed', ['a', 'b', 'c', 'd']);
          await S5.stop();
          const LSRC = fs.readFileSync(path.join(repo, 'src', 'lib', 'layout.js'), 'utf8');
          for (const r of F5_RED) {
            console.log(`— ⑮ RED control: ${r.mode} (this source with ONE line of src/lib/layout.js patched back)`);
            if (!ok(LSRC.includes(r.find), `⑮ RED ${r.mode}: the patched line exists in src/lib/layout.js (the control judges this source)`)) continue;
            const SR = await startServer(mkTree('f5-' + r.mode, 'HEAD', true, (t) => t.replace(r.find, r.repl)), 'f5-' + r.mode, fixture);
            if (ok(SR.up, `⑮ RED ${r.mode}: its server booted`, SR.journal.slice(-600))) await f5Legs(SR, D, P, DW, r.mode, r.legs);
            await SR.stop();
          }
        }
      } finally { DW?.close(); }
    }
    // ── ⑯ lane phone-sidebar-chrome: this source, then the RED copy (every chromeToApply asks as a desk) ──
    if (want(16)) {
      await S.stop();
      const SB = await startServer(fixedTree, 'sb', fixtureSB);
      if (ok(SB.up, '⑯: the fixed-tree server re-booted on the desk-chrome record', SB.journal.slice(-600))) await sbLegs(SB, D, P, false);
      await SB.stop();
      const LSRC = fs.readFileSync(path.join(repo, 'src', 'lib', 'layout.js'), 'utf8'), ASK = 'chromeToApply(this._viewport(), ';
      console.log('— ⑯ RED control: this source with every chromeToApply asking as a desk (the phone applies the record\'s chrome again)');
      if (ok(LSRC.split(ASK).length - 1 === 3, `⑯ RED: the three asks exist in src/lib/layout.js (the control judges this source)`)) {
        const SR = await startServer(mkTree('sb-red', 'HEAD', true, (t) => t.split(ASK).join("chromeToApply('desktop', ")), 'sb-red', fixtureSB);
        if (ok(SR.up, '⑯ RED: its server booted', SR.journal.slice(-600))) await sbLegs(SR, D, P, true);
        await SR.stop();
      }
    }
  } finally {
    D.close(); P.close();
  }
})();

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
