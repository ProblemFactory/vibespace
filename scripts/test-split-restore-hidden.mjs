#!/usr/bin/env node
// A SIDE-BY-SIDE GROUP ON A DESKTOP NOT SHOWN SINCE THE RELOAD (lane split-restore-hidden, userW
// inc-muundq37-cjay; heavy). The owner's steps in chrome: split on desktop B, A→B, reload while A is
// shown, →B — the pair came back as two plain windows and ~2.5 s later the autosave wrote B's record
// flat. desktop-manager `_replayMissing` (a desktop's first visit after a reload) now queues the
// record's chains (layout.js `queueRecordChains` → `_queueChain`), settled by createWindow →
// `onWindowCreated` (no timer, no deadline), rebuilt whole by chain-layout `restoreVerdict`.
// A worktree server of this tree (esbuild bundle), a fake claude, headless chrome over raw CDP:
//   a  files + files: after the reload →B the pair is side by side at the record's ratio (±0.02); the
//      record (data/layouts.json desk B tabChain) still carries split + ratio + sides 9 s later and
//      after A→B again
//   b  the same with an async guest (a file viewer)    c  the same with a browser-live guest
//   d  a second desktop client open on B throughout the first client's reload keeps its split, and
//      its record is not flattened by the first client's autosave
//   e  CONTROL: a patched copy of desktop-manager.js without the `queueRecordChains` call in
//      `_replayMissing` (scripts/mutant-copy.mjs, bundled in its place) ⇒ leg a RED by the same assert
//   f  a slow guest (its window lands 3 s after the visit) still joins its chain — no deadline
// RED on fe0cddcf (2.369.212): a / b / c / d / f. SKIPs with evidence without chrome / dtach. Free ports,
// scratch dirs only.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, scratchHome, freePort, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (test-architecture §57)
const require = createRequire(import.meta.url);
const { WebSocket } = require('ws');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 900) : '')); } return !!c; };
const skip = (n) => { skipped++; console.log('  ⊘ SKIP ' + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); } return !!(await pred()); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const J = JSON.stringify;
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOT = scratch('split-restore');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const MUT = mutantCopies('split-restore', repo);
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

const RATIO = 0.62;
const HOST = 'win-b-host';
const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
let dtachOk = false; try { execFileSync('/usr/bin/which', ['dtach'], { stdio: 'ignore' }); dtachOk = true; } catch { }
if (!CHROME) skip('no chrome/chromium on this box — every leg needs one');
else if (!dtachOk) skip('dtach is not installed — the worktree server cannot run sessions here');
else await (async () => {
  fakeHome = scratchHome('split-restore-home', fs);
  const wt = path.join(ROOT, 'wt'); const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
  fs.writeFileSync(path.join(BIN, 'claude'), '#!/bin/sh\nexec sleep 600\n', { mode: 0o755 }); // no session is created: a claude that never answers
  const PORT = await freePort();
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--detach', wt, 'HEAD'], { stdio: 'ignore' }); worktrees.add(wt);
  for (const f of ['src', 'public', 'server.js', 'package.json']) { execFileSync('rm', ['-rf', path.join(wt, f)]); execFileSync('cp', ['-r', path.join(repo, f), path.join(wt, f)]); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const version = JSON.parse(fs.readFileSync(path.join(wt, 'package.json'), 'utf8')).version;
  fs.writeFileSync(path.join(wt, 'src/lib/build-version.js'), `export const BUILD_VERSION = ${J(version)};\n`);
  const esbuild = require('esbuild');
  /** The bundle (esbuild JS API), so control e can hand desktop-manager.js a patched copy — whose rebased
   *  imports are file:// URLs, resolved back to the worktree's files (its generated build-version.js too). */
  const buildBundle = (dmOverride = null) => esbuild.build({
    entryPoints: [path.join(wt, 'src/client.js')], bundle: true, outfile: path.join(wt, 'public/bundle.js'), format: 'iife', platform: 'browser', target: 'es2020', loader: { '.css': 'css' }, minify: true, logLevel: 'silent',
    plugins: dmOverride ? [{ name: 'split-restore-patched-dm', setup(b) {
      b.onResolve({ filter: /(^|\/)desktop-manager\.js$/ }, () => ({ path: dmOverride }));
      b.onResolve({ filter: /^file:\/\// }, (a) => ({ path: fileURLToPath(a.path) }));
    } }] : [],
  });
  await buildBundle();
  ok(fs.statSync(path.join(wt, 'public/bundle.js')).size > 500000, 'the worktree built its own bundle (esbuild JS API)');

  // ── the server: one per leg, on its own record ──
  let srv = null, journal = '';
  const api = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();
  const serve = async (layouts) => {
    if (srv) { const s = srv; srv = null; const gone = new Promise((r) => s.once('exit', r)); s.kill('SIGKILL'); await gone; procs.delete(s); }
    fs.rmSync(path.join(wt, 'data'), { recursive: true, force: true }); fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
    fs.writeFileSync(path.join(wt, 'data', 'layouts.json'), J(layouts, null, 1));
    journal = '';
    srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...process.env, ...VNC_ENV, PATH: BIN + ':' + (process.env.PATH || ''), CLAUDE_CMD: path.join(BIN, 'claude'), PORT: String(PORT), HOME: fakeHome, VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    procs.add(srv); srv.stdout.on('data', (d) => { journal += d; }); srv.stderr.on('data', (d) => { journal += d; });
    return until(() => journal.includes('Ready.'), 60000, 100);
  };

  // ── the record: desktop A holds one window, desktop B the host and its guest (not yet a group) ──
  const fixture = (leg, kind) => {
    const dir = (n) => { const d = path.join(ROOT, 'files', leg, n); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, n + '.txt'), n + ' text'); return d; };
    const F = (id, n, gb) => ({ winId: id, title: n, type: 'files', isMinimized: false, isMaximized: false, gridBounds: gb, zIndex: 10, openSpec: { action: 'openFileExplorer', path: dir(n) }, explorerPath: dir(n) });
    const gb = { left: 0.5, top: 0, width: 0.45, height: 0.6 };
    const guest = kind === 'file'
      ? { winId: 'win-b-guest', title: 'g.txt', type: 'file', isMinimized: false, isMaximized: false, gridBounds: gb, zIndex: 11, openSpec: { action: 'openFile', path: path.join(dir('g'), 'g.txt'), name: 'g.txt' } }
      : kind === 'blive'
        ? { winId: 'win-blive-sess-fake1', title: 'Agent browser (live)', type: 'browser-live', isMinimized: false, isMaximized: false, gridBounds: gb, zIndex: 11, openSpec: { action: 'openBrowserLive', sessionId: 'sess-fake1', profileId: null } }
        : F('win-b-guest', 'g', gb);
    return {
      gid: guest.winId,
      layouts: {
        current: null, autoSave: null, saved: {}, customGrids: [],
        desktopMeta: [{ id: 'desk-a', name: 'A' }, { id: 'desk-b', name: 'B' }],
        desktops: {
          'desk-a': { autoSave: { windows: [F('win-a-1', 'a1', { left: 0.1, top: 0.1, width: 0.4, height: 0.4 })] } },
          'desk-b': { autoSave: { windows: [F(HOST, 'h', { left: 0, top: 0, width: 0.45, height: 0.6 }), guest] } },
        },
        activeDesktopId: 'desk-b',
      },
    };
  };

  // ── headless chrome, one per leg (a fresh profile: nothing of one leg reaches the next) ──
  const client = async (wsUrl) => {
    const sock = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r, e) => { sock.on('open', r); sock.on('error', e); });
    let seq = 0; const pend = new Map();
    sock.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
    const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); sock.send(J({ id, method, params })); });
    const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
    const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    const X = { send, ev, close: () => { try { sock.close(); } catch { } } };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); // §47
    await send('Emulation.setDeviceMetricsOverride', { width: 1571, height: 905, deviceScaleFactor: 1, mobile: false });
    /** (Re)load the desktop page; up = the app booted and its active desktop's record windows are built. */
    X.boot = async (want) => {
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
      const up = await until(async () => { try { return await ev('!!(window.app && window.app.desktopManager && window.app.desktopManager.activeDesktopId)'); } catch { return false; } }, 30000, 200);
      if (!up) return false;
      await ev('window.app.ready');
      const built = await X.built(want);
      await sleep(1500); // the boot's own deferred restore steps (the remote apply's chain queue runs at +1 s)
      return built;
    };
    X.built = (ids) => until(() => ev(`${J(ids)}.every((id) => app.wm.windows.has(id))`).catch(() => false), 15000);
    /** The owner's door: a click on the desktop's preview. */
    X.visit = async (desk) => {
      const p = await ev(`(() => { const e = document.querySelector('.desktop-preview[data-desktop-id="${desk}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!p) return false;
      await mouse('mouseMoved', p.x, p.y, { buttons: 0 }); await mouse('mousePressed', p.x, p.y); await sleep(40); await mouse('mouseReleased', p.x, p.y);
      return until(() => ev(`app.desktopManager.activeDesktopId === ${J(desk)} && !app.desktopManager._restoring`), 8000);
    };
    return X;
  };
  const openChrome = async (leg) => {
    const CDP = await freePort();
    const xdg = fs.mkdtempSync(path.join(ROOT, 'xdg-')); fs.chmodSync(xdg, 0o700); // a PRIVATE XDG_RUNTIME_DIR
    const ch = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`, '--no-first-run', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--window-size=1571,905', `--user-data-dir=${path.join(ROOT, 'chrome-' + leg)}`, 'about:blank'], { stdio: 'ignore', env: { PATH: '/usr/bin:/bin', HOME: fakeHome, XDG_RUNTIME_DIR: xdg } });
    procs.add(ch);
    const pages = async () => { try { return (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).filter((t) => t.type === 'page'); } catch { return []; } };
    let target = null; for (let i = 0; i < 120 && !target; i++) { target = (await pages())[0]; if (!target) await sleep(250); }
    if (!target) return null;
    const P1 = await client(target.webSocketDebuggerUrl);
    // a second desktop client: its OWN window (a background tab is hidden — no rAF)
    const second = async () => {
      const { targetId } = await P1.send('Target.createTarget', { url: 'about:blank', newWindow: true });
      let pt = null; for (let i = 0; i < 40 && !pt; i++) { pt = (await pages()).find((t) => t.id === targetId); if (!pt) await sleep(150); }
      return pt ? client(pt.webSocketDebuggerUrl) : null;
    };
    return { P1, second, end: () => { P1.close(); try { ch.kill('SIGKILL'); } catch { } procs.delete(ch); } };
  };

  /** What a client shows of the pair: its chain, the panes' rects. */
  const view = (X, gid) => X.ev(`(() => { const h = app.wm.windows.get(${J(HOST)}), g = app.wm.windows.get(${J(gid)}); const out = { active: app.desktopManager.activeDesktopId, host: !!h, guest: !!g }; if (!h || !g) return out; const c = h._tabChain, hr = h.content.getBoundingClientRect(), gr = g.content.getBoundingClientRect(); return { ...out, layout: c ? c.layout : null, one: !!c && c === g._tabChain, ratio: c && c.split ? +c.split.ratio : null, hl: Math.round(hr.left), hw: Math.round(hr.width), gl: Math.round(gr.left), gw: Math.round(gr.width), hidden: h.content.classList.contains('tab-hidden') || g.content.classList.contains('tab-hidden') }; })()`);
  /** Side by side at the record's ratio: one split chain, the guest's pane to the right of the host's, the panes' widths at RATIO ±0.02. */
  const sideBySide = (v) => !!v && v.layout === 'split' && v.one && !v.hidden && v.hw > 50 && v.gw > 50 && v.gl >= v.hl + v.hw - 2 && near(v.ratio, RATIO, 0.02) && near(v.hw / (v.hw + v.gw), RATIO, 0.02);
  /** desk B's record on the server, and its verdict: the host's chain a split at RATIO with both sides, the guest marked. */
  const record = async (gid) => {
    const ws = (await api('/api/layouts')).desktops?.['desk-b']?.autoSave?.windows || [];
    const h = ws.find((w) => w.winId === HOST), g = ws.find((w) => w.winId === gid), tc = h && h.tabChain;
    const split = !!tc && tc.layout === 'split' && !!tc.split && near(+tc.split.ratio, RATIO, 0.02) && (tc.split.left || []).includes(HOST) && (tc.split.right || []).includes(gid) && !!g && !!g.isTabGuest;
    return { split, flat: ws.map((w) => w.winId + (w.tabChain ? '[' + w.tabChain.tabs.join('+') + ':' + w.tabChain.layout + (w.tabChain.split ? '@' + w.tabChain.split.ratio + ' ' + J(w.tabChain.split.left) + J(w.tabChain.split.right) : '') + (w.isTabGuest ? ' guest' : '') + ']' : '')).join(' ') };
  };
  /** The client's own capture, written now (what its autosave would write): a deterministic record read. */
  const saveNow = (X) => X.ev('(async () => { const lm = app.layoutManager; lm._userDirty = true; lm._lastUserInputAt = Date.now(); lm._lastSentJson = null; await lm._doAutoSave(); return true; })()');

  /** THE OWNER'S STEPS. Returns the verdicts the legs judge (the control judges the same ones). */
  const ownerSteps = async (leg, kind, { secondClient = false, slowMs = 0 } = {}) => {
    const fx = fixture(leg, kind), gid = fx.gid, R = { gid };
    if (!ok(await serve(fx.layouts), `${leg}: the worktree server booted`, journal.slice(-800))) return R;
    const C = await openChrome(leg);
    if (!ok(!!C, `${leg}: chrome exposed a CDP page target`)) return R;
    let Q = null;
    try {
      const X = C.P1;
      if (!ok(await X.boot(['win-a-1']) && await X.visit('desk-b') && await X.built([HOST, gid]), `${leg}: client 1 booted (on A, the first desktop) and its visit to B built the host and its guest`, J(await view(X, gid)))) return R;
      // 1. split on B (the window menu's side-by-side door: bindSplit), ratio 0.62, saved as the user's edit
      const bound = await X.ev(`(() => { const h = app.wm.windows.get(${J(HOST)}), g = app.wm.windows.get(${J(gid)}); app.wm.bindSplit(h, g, { side: 'right' }); app.wm.setSplitRatio(h._tabChain, ${RATIO}); return h._tabChain ? h._tabChain.layout : null; })()`);
      await saveNow(X);
      if (!ok(bound === 'split' && await until(async () => (await record(gid)).split, 8000), `${leg}: the split on B reached the record`, (await record(gid)).flat)) return R;
      if (secondClient) {
        Q = await C.second();
        if (!ok(!!Q && await Q.boot(['win-a-1']) && await Q.visit('desk-b') && await Q.built([HOST, gid]), `${leg}: a second desktop client booted and went to B`)) return R;
        if (!ok(await until(async () => sideBySide(await view(Q, gid)), 8000), `${leg}: client 2 shows the pair side by side`, J(await view(Q, gid)))) return R;
      }
      // 2. A → B, then A again and the reload while A is shown
      ok(await X.visit('desk-a') && await X.visit('desk-b') && await until(async () => sideBySide(await view(X, gid)), 5000), `${leg}: A→B before the reload: side by side`, J(await view(X, gid)));
      ok(await X.visit('desk-a'), `${leg}: back on A`);
      await saveNow(X);
      ok(await X.boot(['win-a-1']), `${leg}: client 1 reloaded`);
      const before = await view(X, gid);
      if (!ok(before.active === 'desk-a' && !before.host && !before.guest, `${leg}: the reload landed on A and B is not built (its next visit is a first one: _replayMissing)`, J(before))) return R;
      if (slowMs) await X.ev(`(() => { const o = app.replayOpenSpec.bind(app); app.replayOpenSpec = (spec, id) => id === ${J(gid)} ? void setTimeout(() => o(spec, id), ${slowMs}) : o(spec, id); return true; })()`);
      // 3. →B: the pair side by side
      const t0 = Date.now();
      ok(await X.visit('desk-b'), `${leg}: reload, →B`);
      if (slowMs) { await sleep(1500); const v = await view(X, gid); R.late = v.host && !v.guest; }
      R.sbs = await until(async () => sideBySide(await view(X, gid)), 10000 + slowMs);
      R.ms = Date.now() - t0; R.v = await view(X, gid);
      // 4. nine seconds later: the record as the autosave left it, then as this client writes it now
      await sleep(9000);
      R.v9 = await view(X, gid); R.rec9 = await record(gid);
      await saveNow(X); R.recSaved = await record(gid);
      if (Q) { R.q9 = await view(Q, gid); }
      if (leg === 'e') return R;
      // 5. A → B again
      R.again = await X.visit('desk-a') && await X.visit('desk-b') && await until(async () => sideBySide(await view(X, gid)), 5000);
      R.vAgain = await view(X, gid);
      await saveNow(X); R.recAgain = await record(gid);
      if (Q) { await saveNow(Q); R.qAgain = await view(Q, gid); R.recQ = await record(gid); }
      return R;
    } finally { if (Q) Q.close(); C.end(); }
  };
  const judge = (leg, what, R) => {
    if (!R.v) return;
    ok(R.sbs, `${leg}: ${what}: after the reload →B the pair is side by side at the record's ratio (±0.02) — ${R.ms} ms`, J(R.v));
    ok(sideBySide(R.v9) && R.rec9.split, `${leg}: 9 s later still side by side, and the record still carries split + ratio + sides`, J(R.v9) + '\n    record: ' + R.rec9.flat);
    ok(R.recSaved.split, `${leg}: the client's own capture (written now) carries the split`, R.recSaved.flat);
    ok(R.again && R.recAgain.split, `${leg}: A→B again: side by side, the record carries the split`, J(R.vAgain) + '\n    record: ' + R.recAgain.flat);
  };

  console.log('— a · files + files');
  judge('a', 'files + files', await ownerSteps('a', 'files'));
  console.log('— b · an async guest (a file viewer)');
  judge('b', 'file viewer guest', await ownerSteps('b', 'file'));
  console.log('— c · a browser-live guest');
  judge('c', 'browser-live guest', await ownerSteps('c', 'blive'));
  console.log('— d · a second desktop client on B throughout the reload');
  {
    const R = await ownerSteps('d', 'files', { secondClient: true });
    judge('d', 'client 1', R);
    if (R.q9) {
      ok(sideBySide(R.q9), 'd: client 2 (on B throughout) still shows the pair side by side 9 s after client 1\'s visit', J(R.q9));
      ok(sideBySide(R.qAgain) && R.recQ.split, 'd: client 2\'s record is not flattened by client 1\'s autosave (its own capture still writes the split)', J(R.qAgain) + '\n    record: ' + R.recQ.flat);
    }
  }
  console.log('— f · a slow guest (its window lands 3 s after the visit) still joins its chain');
  {
    const R = await ownerSteps('f', 'files', { slowMs: 3000 });
    if (R.v) ok(R.late, 'f: the guest was not built 1.5 s into the visit (the slow opener held it)');
    judge('f', 'slow guest', R);
    if (R.v) ok(R.ms >= 3000, `f: the pair joined only once the late guest landed (${R.ms} ms ≥ 3000) — no deadline gave up first`);
  }
  console.log('— e · CONTROL: _replayMissing without its queueRecordChains call');
  {
    const orig = fs.readFileSync(path.join(repo, 'src/lib/desktop-manager.js'), 'utf8');
    const line = /\n\s*if \(building\.length\) this\.app\.layoutManager\?\.queueRecordChains\?\.\(desktopId, state, \{ naming: building \}\);\n/;   // int214: only the chains this replay builds
    if (ok(line.test(orig), 'e: the call is where the control removes it')) {
      await buildBundle(MUT.write(path.join(wt, 'src/lib/desktop-manager.js'), orig.replace(line, '\n\n'), 'noqueue', { esm: true }));
      for (const r of copiesCensus(MUT.files, MUT.dir, repo, { minCopies: 1 })) ok(r.pass, 'e: tree: ' + r.name + (r.pass ? '' : ' — ' + r.detail));
      const R = await ownerSteps('e', 'files');
      if (R.v) {
        console.log('    control: ' + J(R.v) + '\n    control record at +9 s: ' + R.rec9.flat);
        ok(!R.sbs && !R.rec9.split, 'e: CONTROL the patched copy ⇒ leg a RED by the same assert: the pair is not side by side after →B and the record is written flat', J(R.v) + '\n    record: ' + R.rec9.flat);
      }
      await buildBundle();
    }
  }
  try { if (srv) srv.kill('SIGKILL'); } catch { }
})().catch((e) => ok(false, 'the chrome leg threw', e && (e.stack || e.message)));

console.log(`\n${fail ? 'FAIL' : 'ALL PASS'} (${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
