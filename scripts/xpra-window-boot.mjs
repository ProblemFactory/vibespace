#!/usr/bin/env node
// THE XPRA WINDOW FAMILY'S ONE BOOT (lane xpra-window-split, design q-038 step ②, 2026-10-14). test-desktop-xpra-window
// (3 207 lines; 1 385 s alone on the hub, 1 481–1 500 s on AIDev) was the self-hosted desktop batch's FLOOR — no lane count
// moved the batch's wall below it — so it is a family of heavy parts split by §, each ≤ 8 min measured alone, and this is
// the boot every part shares (moved VERBATIM from the giant; test-ci-gate §8d holds the family to it):
//   • a scratch worktree of this tree (src / public / server.js copied over HEAD, built) and its server on the DEFAULT
//     ladder (xpra first when installed, DA1), every server copy's output in a named ring (a boot miss prints its last
//     5 lines), the evidence deadlines;
//   • headless chrome on a free CDP port, its profile in scratch;
//   • §5's fake claude (an agent's lease needs a LIVE session) and the apps' PRIVATE runtime dir (test-architecture §76:
//     the server — and so every app it launches — never shares the owner's /run/user/<uid>);
//   • the teardown, ONCE, on exit: the recorded pids, the marker sweep, §5's agent session, §13's paired devices, every
//     process rooted in a scratch tree or HOME (scratch.mjs endRootedProcesses — test-architecture §57b), the worktrees;
//   • the measures more than one § uses, moved from the § that first defined them (keyOf §1–§4, newPage §5, the r2
//     measures and the page / launch helpers of §6), and a part's end (threw / crashed / finish: the real-home census,
//     the verdict line, the exit).
// A part calls bootXpraWindow('<its name>') ONCE and destructures what its §§ use; it never boots anything of its own.
// SKIPs with evidence without chrome / xpra / xauth / xterm (the part exits 0 at boot); the xclip legs SKIP without
// xclip; the plain-http legs SKIP when the hostname does not resolve. Worktree-isolated (own data/, scratch HOME,
// VIBESPACE_SKIP_AGENT_HOOKS=1), free ports, per-pid names, the chrome profile in scratch.
import { execSync, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { freePorts, scratch, scratchHome, fixtureSid, ONBOARDED_SOURCE, vncEnv, endRootedProcesses } from './scratch.mjs';

/** Boot ONE part of the xpra window family: everything above, up and checked ('worktree server boots'); returns the
 *  handles, the evidence deadlines, the shared measures and the part's end. `part` names the part in its verdict line. */
export async function bootXpraWindow(part) {
  const VNC_ENV = await vncEnv(); // per-run singleton-Desktop display + port for every server this suite boots (never the machine-global :7/5901 — test-architecture §57)
  const require = createRequire(import.meta.url);
  const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const D = require('../src/desktop-display.js');
  const { fixtureLitter } = require('../src/fixture-guard.js');
  const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
  const bin = (n) => D.binOnPath(n, { env: process.env });
  const XPRA = bin('xpra'), XAUTH = bin('xauth'), XTERM = bin('xterm'), XCLIP = bin('xclip'), XDOTOOL = bin('xdotool');
  const skipWhy = !CHROME ? 'no chrome/chromium' : !XPRA ? 'xpra not on PATH (apt install xpra)' : !XAUTH ? 'xauth not on PATH' : !XTERM ? 'xterm not on PATH' : null;
  if (skipWhy) { console.log(`SKIP: ${skipWhy}`); process.exit(0); }
  let xpraVersion = '';
  try { xpraVersion = execFileSync(XPRA, ['--version'], { encoding: 'utf8', timeout: 10000 }).trim(); } catch {}
  const HOSTNAME = os.hostname();
  let hostResolves = false;
  try { hostResolves = /\S/.test(execFileSync('getent', ['hosts', HOSTNAME], { encoding: 'utf8', timeout: 5000 })); } catch {}
  console.log(`box: ${xpraVersion || 'xpra ?'}, xterm ${XTERM}, xclip ${XCLIP || 'absent'}, xdotool ${XDOTOOL || 'absent'}, hostname resolves: ${hostResolves}`);

  const [PORT, CDP_PORT] = await freePorts(2);
  const wt = scratch('deskxpra-smoke');
  const fakeHome = scratchHome('deskxpra-home', fs);
  // THE REAL HOME IS CENSUSED (scripts/test-fixture-isolation.mjs, census (c)): every suite that
  // carries a synthetic session id into a server's home snapshots ~/.claude/projects before and
  // proves it gained no FIXTURE entry after — src/fixture-guard.js owns the predicate.
  const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
  const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
  let failed = 0, skipped = 0;
  const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)) : ''}`); } };
  const skip = (n, why) => { skipped++; console.log(`  ⚠ SKIP ${n}: ${why}`); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 20000, step = 200) => { const t = Date.now() + ms; while (Date.now() < t) { let v = null; try { v = await fn(); } catch {} if (v) return v; await sleep(step); } return null; };
  // EVIDENCE DEADLINES (lane xpra-control-judge, 2.369.208): the pre-fix CONTROLS reddened at load 35–67 in int205–int207 and
  // were green alone — they judged on the wall clock (a 20 s boot loop, a 3 s nap before reading X, a one-shot X read, a 45 s
  // title bound). A wait now ends on the event it is about; its deadline only fails a leg whose evidence NEVER
  // comes, so each deadline is several times the old bound (the slack), and a dead copy fails at once instead of waiting it out.
  const BOOT_DEADLINE_MS = 120000;  // a scratch server copy answering /api/home — slack 6× the old 80 × 250 ms loop
  const SETTLE_DEADLINE_MS = 60000; // a window settled where the leg needs it (X agrees with the view / the pane) — slack 20× the old 3 s nap
  const XAGREE_DEADLINE_MS = 20000; // the X server reports a window where our client put it (xpra moves the corral after the first paint)
  const TITLE_DEADLINE_MS = 120000; // a real browser's page title reaching the title bar — slack 2.7× the old 45 s
  const KEY_DEADLINE_MS = 5000;     // one clicked key reaching the app's readout (its own copy shows it) — slack 12× the old 400 ms pace
  const REACH_DEADLINE_MS = 20000;  // a key's point hits the picture again (a toast over it has gone) — slack 6× an info toast's 3 s
  // EVERY SERVER COPY'S OUTPUT IS KEPT (lane xpra-suite-evidence, B-7ea8): the main server and each CONTROL copy spawn with stdout +
  // stderr in a ring of their last COPY_RING_LINES lines, named by the copy — a copy used to run with `stdio: 'ignore'`, so its boot
  // red under an 8-lane heavy load said only "did not boot"; a miss now prints what the copy itself last said, and the elapsed ms
  const COPY_RING_LINES = 60;
  const spawnCopy = (name, cwd, env) => {
    const child = spawn(process.execPath, ['server.js'], { cwd, env: { ...VNC_ENV, ...env, HOME: env.HOME || fakeHome }, stdio: ['ignore', 'pipe', 'pipe'] }); // the per-run Desktop names (§57) under the copy's own; a scratch HOME always
    const ring = { name, lines: [], part: { out: '', err: '' } };
    const take = (k) => (d) => { const ls = (ring.part[k] + String(d)).split('\n'); ring.part[k] = ls.pop(); for (const l of ls) { ring.lines.push(l); if (ring.lines.length > COPY_RING_LINES) ring.lines.shift(); } };
    child.stdout.on('data', take('out')); child.stderr.on('data', take('err'));
    child.ring = ring;
    return child;
  };
  const ringTail = (child, n = 5) => { const r = child.ring; return r ? [...r.lines, r.part.out, r.part.err].filter(Boolean).slice(-n) : []; };
  /** a scratch server copy is up: /api/home answers (true), or the copy exited (false, at once), or BOOT_DEADLINE_MS passed (false);
   *  a miss leaves its evidence on `child.bootWhy` for the check to print: the copy's name, the elapsed ms, how it ended, its last 5 lines */
  const bootedCopy = async (child, port) => {
    const t0 = Date.now();
    const v = await until(async () => { if (child.exitCode !== null || child.signalCode) return 'dead'; await fetch(`http://127.0.0.1:${port}/api/home`); return 'up'; }, BOOT_DEADLINE_MS, 250);
    const ms = Date.now() - t0;
    child.bootWhy = v === 'up' ? null : `${child.ring ? child.ring.name : 'a server copy'} on :${port} ${v === 'dead' ? `exited (code ${child.exitCode}, signal ${child.signalCode})` : 'never answered /api/home'} after ${ms} ms (deadline ${BOOT_DEADLINE_MS} ms); its last lines:\n      ${ringTail(child).join('\n      ') || '(it printed nothing)'}`;
    return v === 'up';
  };

  try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch {}
  execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
  for (const f of ['src', 'public', 'server.js']) { execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`); }
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
  execSync('npm run build', { cwd: wt, stdio: 'ignore' });
  // dc-ratchet (2.369.213): a CONTROL copy below is a MUTANT tree, not a commit — before its build, its §78 ratchet baselines are
  // re-derived from the copy itself (a lever pulled back can remove or restore a member-id branch or an export; test-architecture
  // is chained in npm run build, and §78 is red on any rise or fall against the committed baseline)
  const rebaseline = (dir) => { for (const c of ['id-branch', 'dead-code']) { fs.rmSync(path.join(dir, 'scripts', 'fixtures', `${c}-baseline.json`), { force: true }); execSync(`node scripts/${c}-census.mjs --write-initial`, { cwd: dir, stdio: 'ignore' }); } };

  // §5's agent lease needs a LIVE agent session: a fake claude (prints the init frame, then sleeps) under the real ws create
  const FAKE_BIN = path.join(fakeHome, 'fake-bin');
  const FAKE_CLAUDE = path.join(FAKE_BIN, 'claude');
  fs.mkdirSync(FAKE_BIN, { recursive: true });
  {
    const sid = fixtureSid('5a');
    const init = JSON.stringify({ type: 'system', subtype: 'init', session_id: sid, cwd: fakeHome, model: 'claude-fable-5', apiKeySource: 'none', tools: [], mcp_servers: [] });
    fs.writeFileSync(FAKE_CLAUDE, `#!/bin/sh\ncase " $* " in *" --output-format "*) sleep 1; printf '%s\\n' '${init}';; esac\nexec sleep 600\n`, { mode: 0o755 });
  }
  const agentTokens = [];
  // the apps this suite runs (GNOME Calculator, the §18 GTK window) get a PRIVATE runtime dir: under a private bus their
  // org.a11y.Bus launcher binds `$XDG_RUNTIME_DIR/at-spi/bus`, and with the owner's /run/user/<uid> it REPLACED the desktop's
  // accessibility socket (2026-10-04 08:55Z, a loaded rerun of this suite) — test-architecture §76 holds every fixture to it
  const RUNTIME = path.join(fakeHome, 'run'); fs.mkdirSync(RUNTIME, { recursive: true }); fs.chmodSync(RUNTIME, 0o700);
  const srvEnv = { ...process.env, ...VNC_ENV, PORT: String(PORT), HOME: fakeHome, XDG_RUNTIME_DIR: RUNTIME, VIBESPACE_SKIP_AGENT_HOOKS: '1', CLAUDE_CMD: FAKE_CLAUDE, PATH: FAKE_BIN + ':' + (process.env.PATH || '') };
  let srv = null;
  const srvLog = [];
  const bootServer = () => { srv = spawnCopy('the worktree server', wt, srvEnv); srv.stdout.on('data', (d) => srvLog.push(String(d))); srv.stderr.on('data', (d) => srvLog.push(String(d))); return srv; };
  bootServer();
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--no-first-run', '--disable-gpu', '--disable-background-timer-throttling', '--window-size=1400,900', `--user-data-dir=${scratch('deskxpra-chrome')}`, 'about:blank'], { stdio: 'ignore' });
  const worktrees = [wt];
  const devProcs = [], devHomes = []; // §13 (lane C2): the paired scratch devices (their daemons + HOMEs) // + §5's pre-x5 CONTROL copy while it exists
  const ctlServers = [];
  const appsOf = (w) => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(w, 'data/desktop-apps.json'), 'utf8')).apps).map((a) => ({ ...a, _wt: w })); } catch { return []; } };
  const recordedApps = () => worktrees.flatMap(appsOf);
  const recordedPids = () => recordedApps().flatMap((a) => Object.values(a.pids || {})).filter(Boolean);
  // A crashed run used to leave xpra's own Xvfb alive (measured: two `Xvfb-for-Xpra` orphans, cwd `/tmp/vs-deskxpra-smoke-… (deleted)`):
  // killing the RECORDED pids kills xpra, and its Xvfb child outlives that. The sweep the keeper itself runs: every
  // process whose environ carries this worktree's session marker (`VIBESPACE_DESKTOP_APP=<id>`) or its XAUTHORITY
  // path is ours by evidence — the marker xpra rewrites away is still on the Xvfb and the app it spawned.
  const markerSweep = () => {
    const apps = recordedApps().filter((a) => a.id);
    const needles = [...apps.map((a) => `VIBESPACE_DESKTOP_APP=${a.id}`), ...apps.map((a) => `XAUTHORITY=${path.join(a._wt, 'data', 'desktop-apps', a.id, 'Xauthority')}`)];
    const hit = [];
    if (!needles.length) return hit;
    for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d) || Number(d) === process.pid) continue; if (needles.some((n) => D.environHas(Number(d), n))) hit.push(Number(d)); }
    for (const p of hit) { try { process.kill(p, 'SIGKILL'); } catch {} }
    return hit;
  };
  const xclipKids = [];
  const cleanup = () => {
    for (const k of xclipKids) { try { process.kill(-k.pid, 'SIGKILL'); } catch {} try { k.kill('SIGKILL'); } catch {} }
    try { chrome.kill('SIGKILL'); } catch {}
    try { srv?.kill('SIGKILL'); } catch {}
    for (const c of ctlServers) { try { c.kill('SIGKILL'); } catch {} }
    for (const p of recordedPids()) { try { process.kill(p, 'SIGKILL'); } catch {} }
    const swept = markerSweep();
    if (swept.length) console.log(`  (exit sweep reaped ${swept.length} process(es) still carrying this run's marker: ${swept.join(', ')})`);
    // §5's agent session (dtach + the wrapper + the fake claude): by EVIDENCE — its token in the environ / argv, or this worktree's socket dir in the argv
    const sessionHit = [];
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
      let cmd = ''; try { cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'latin1'); } catch { continue; }
      if (cmd.includes(path.join(wt, 'data', 'sockets') + '/') || agentTokens.some((t) => t && (cmd.includes(t) || D.environHas(Number(d), `VIBESPACE_SESSION_TOKEN=${t}`)))) sessionHit.push(Number(d));
    }
    for (const p of sessionHit) { try { process.kill(p, 'SIGKILL'); } catch {} }
    if (sessionHit.length) console.log(`  (exit sweep reaped ${sessionHit.length} process(es) of §5's agent session: ${sessionHit.join(', ')})`);
    // §13: the paired scratch device — its dialing daemon (the process group we spawned, then its pidfile), then every
    // process still carrying one of ITS records' session marker (by evidence: the ids in its own record file)
    for (const d of devProcs) { try { process.kill(-d.pid, 'SIGKILL'); } catch {} try { d.kill('SIGKILL'); } catch {} }
    for (const h of devHomes) {
      try { const pid = Number(fs.readFileSync(path.join(h, 'agentd-root', 'state', 'agentd.pid'), 'utf8')); if (pid > 0) process.kill(pid, 'SIGKILL'); } catch {}
      let ids = []; try { ids = Object.keys(JSON.parse(fs.readFileSync(path.join(h, '.vibespace', 'desktop-apps.json'), 'utf8')).apps || {}); } catch {}
      if (ids.length) for (const d of fs.readdirSync('/proc')) { if (/^\d+$/.test(d) && ids.some((id) => D.environHas(Number(d), `VIBESPACE_DESKTOP_APP=${id}`))) { try { process.kill(Number(d), 'SIGKILL'); } catch {} } }
      try { fs.rmSync(h, { recursive: true, force: true }); } catch {}
    }
    // §57b (B-442c): what this part's servers started ends with them — every process whose cwd / HOME / daemon root / argv
    // lies in one of its scratch trees or HOMEs (a server's setsid-detached device daemon outlives the server's SIGKILL)
    for (const r of [...worktrees, fakeHome, ...devHomes]) { try { endRootedProcesses(r); } catch {} }
    for (const w of worktrees) { try { execSync(`git worktree remove --force ${w}`, { cwd: repo, stdio: 'ignore' }); } catch {} }
    try { fs.rmSync(scratch('deskxpra-chrome'), { recursive: true, force: true }); } catch {}
    try { fs.rmSync(scratch('deskxpra-x5ctl-home'), { recursive: true, force: true }); } catch {}
    try { fs.rmSync(scratch('deskxpra-hidpictl-home'), { recursive: true, force: true }); } catch {}
    try { fs.rmSync(scratch('deskxpra-r2ctl-home'), { recursive: true, force: true }); } catch {}
    try { fs.rmSync(scratch('deskxpra-a2ctl-home'), { recursive: true, force: true }); } catch {}
    try { fs.rmSync(scratch('deskxpra-seamctl-home'), { recursive: true, force: true }); } catch {}
    try { fs.rmSync(scratch('deskxpra-dctl-home'), { recursive: true, force: true }); } catch {}
    try { fs.rmSync(scratch('deskxpra-mctl-home'), { recursive: true, force: true }); } catch {}
    // §11's and §14's control HOMEs too (lane xpra-window-split: the giant's list missed them — two killed runs of 2026-10-14
    // 01:12 / 01:53 left /tmp/vs-deskxpra-a3ctl-home-* and -lanedctl-home-* behind)
    try { fs.rmSync(scratch('deskxpra-a3ctl-home'), { recursive: true, force: true }); } catch {}
    try { fs.rmSync(scratch('deskxpra-lanedctl-home'), { recursive: true, force: true }); } catch {}
    try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch {}
  };
  process.on('exit', cleanup);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

  check('worktree server boots', await bootedCopy(srv, PORT), srv.bootWhy);
  const WebSocket = require('ws');
  const cdpTargets = async () => (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json());
  const target = await until(async () => (await cdpTargets()).find((t) => t.type === 'page'), 20000, 250);
  async function page(t) {
    const ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    await new Promise((r) => ws.on('open', r));
    let seq = 0; const pend = new Map(); const logs = [];
    ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.consoleAPICalled') logs.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')); });
    const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id, method, params })); });
    const evalJs = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails))); return r.result.value; };
    await cdp('Page.enable'); await cdp('Runtime.enable');
    return { ws, cdp, evalJs, logs, close: () => { try { ws.close(); } catch {} } };
  }
  const openPage = async (p, origin) => { await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: ONBOARDED_SOURCE }); await p.cdp('Page.navigate', { url: `${origin}/` }); await sleep(1500); await p.evalJs('new Promise((res, rej) => { const t0 = Date.now(); (function w() { if (window.app) return res(app.ready); if (Date.now() - t0 > 20000) return rej(new Error("no app after 20s")); setTimeout(w, 200); })(); })'); await until(() => p.evalJs('app.layoutManager && app.layoutManager._restoring === false'), 12000, 250); };
  const trustedClickAt = async (p, x, y, modifiers = 0, button = 'left') => {
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1, modifiers });
    await p.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1, modifiers });
  };
  // the window's raw handles (never the DOM): the WindowManager record and the view's own snapshot
  const WIN = (appId) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); if (!w) return null; const v = w._desktopAppView; const r = v && v.pane ? v.pane.getBoundingClientRect() : null; return { id: w.id, title: w.title, status: v ? v.status.textContent : null, kind: v && v.pane ? 'xpra' : 'rfb', pane: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null, windows: v && v.windows ? v.windows() : [], chip: v && v.chip ? { shown: v.chip.style.display !== 'none', text: v.chipText, rect: (() => { const c = v.chip.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; })() } : null, els: v && v.pane ? [...v.pane.querySelectorAll('.xpra-win')].map((e) => { const c = e.getBoundingClientRect(); return { wid: e.dataset.wid, x: c.x, y: c.y, w: c.width, h: c.height }; }) : [] }; })()`;
  // x5: a window's seat as the page has it — the view's mode, the seats broadcast, the overlay (shown / title / words / the button's rect), the stage
  const SEAT = (appId) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(appId)}); if (!w) return null; const v = w._desktopAppView; const o = w.content.querySelector('.desktop-app-blocked'); const b = o && o.querySelector('.desktop-app-resume'); const br = b && b.getBoundingClientRect(); const pr = v && v.pane ? v.pane.getBoundingClientRect() : null; return { id: w.id, title: w.title, status: v ? v.status.textContent : null, mode: v ? v.mode : null, scale: v ? v.stageScale : null, windows: v && v.windows ? v.windows() : [], pane: pr ? { x: pr.x, y: pr.y, w: pr.width, h: pr.height } : null, paneKey: w._desktopPaneKey, seats: w._desktopSeats || null, overlay: o ? { shown: getComputedStyle(o).display !== 'none', title: o.querySelector('.desktop-app-blocked-title').textContent, titleKids: o.querySelector('.desktop-app-blocked-title').childElementCount, msg: o.querySelector('.term-blocked-msg').textContent, btn: br ? { x: br.x, y: br.y, w: br.width, h: br.height } : null } : null, stageEls: v && v.stage ? [...v.stage.children].map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }) : [] }; })()`;
  /** The pane's pixels: a screenshot clip decoded IN THE PAGE (no node PNG library) — black pixels outside the
   *  app window rect(s), the covered fraction, and the non-black fraction inside the main window. */
  const measurePane = async (p, appId) => {
    const st = await p.evalJs(WIN(appId));
    if (!st || !st.pane) return null;
    const shot = await p.cdp('Page.captureScreenshot', { format: 'png', clip: { x: st.pane.x, y: st.pane.y, width: st.pane.w, height: st.pane.h, scale: 1 } });
    const rects = st.els.map((e) => ({ x: e.x - st.pane.x, y: e.y - st.pane.y, w: e.w, h: e.h }));
    const r = await p.evalJs(`(async () => { const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.data)}; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); const d = ctx.getImageData(0, 0, c.width, c.height).data; const rects = ${JSON.stringify(rects)}; const inside = (x, y) => rects.some((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h); let blackOut = 0, out = 0, inN = 0, inBright = 0; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; const dark = d[i] + d[i + 1] + d[i + 2] < 30; if (inside(x, y)) { inN++; if (!dark) inBright++; } else { out++; if (dark) blackOut++; } } return { w: c.width, h: c.height, out, blackOut, inN, inBrightFrac: inN ? inBright / inN : 0 }; })()`);
    const main = st.windows.find((w) => w.kind === 'main') || st.windows[0] || null;
    const coverage = main ? (main.w * main.h) / (st.pane.w * st.pane.h) : 0;
    return { ...r, pane: st.pane, main, coverage, els: st.els, title: st.title, status: st.status };
  };
  const typedFile = path.join(fakeHome, 'typed.txt');


  // ── the measures the §§ share, moved verbatim from the § that defined them: keyOf (§1–§4), newPage (§5), the r2 measures
  // §6 and §7 share, GNOME Calculator's binary and the page / launch helpers (§6) ──
  const keyOf = (ch) => ({ key: ch, code: ch === ' ' ? 'Space' : /[a-z]/.test(ch) ? 'Key' + ch.toUpperCase() : /[0-9]/.test(ch) ? 'Digit' + ch : '', windowsVirtualKeyCode: ch === ' ' ? 32 : ch.toUpperCase().charCodeAt(0), text: ch, unmodifiedText: ch });
  const newPage = async () => { const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json(); const p = await page(t); await openPage(p, `http://127.0.0.1:${PORT}`); return { p, t }; };
  // the raw handles + the pixel-for-pixel identity measure §6 and §7 share (r2)
  const R2 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); if (!w) return null; const v = w._desktopAppView; if (!v || !v.pane) return null; const pr = v.pane.getBoundingClientRect(); const c = v.client; const main = c && c.windows.get(c.mainWid); const cv = v.pane.querySelector('.xpra-win-main canvas'); const cr = cv ? cv.getBoundingClientRect() : null; const er = w.element.getBoundingClientRect(); const ws = app.wm.workspace.getBoundingClientRect(); return { status: v.status.textContent, mode: v.mode, pane: { x: pr.x, y: pr.y, w: pr.width, h: pr.height }, main: main ? { x: main.x, y: main.y, w: main.w, h: main.h } : null, ratio: v.ratio, minSize: v.minSize, scale: v.stageScale, offset: v.stageOffset, transform: v.stage.style.transform, badge: v.fitBadge ? { shown: v.fitBadge.style.display !== 'none', text: v.fitBadge.textContent } : { shown: false, text: '' }, canvas: cv ? { w: cv.width, h: cv.height, rw: cr.width, rh: cr.height, rx: cr.x, ry: cr.y } : null, win: { x: er.x, y: er.y, w: er.width, h: er.height }, workspace: { x: ws.x, y: ws.y, w: ws.width, h: ws.height }, constraints: c ? c.mainConstraints : null, display: c ? c.display : null, lastReceived: c ? c.lastReceived : null }; })()`;
  // the digit keys of GNOME Calculator's basic keypad, found in the canvas BACKING (device px): dark glyph components on the digit-key grey
  const DIGITS7 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const cv = w._desktopAppView.pane.querySelector('.xpra-win-main canvas'); const main = w._desktopAppView.client.windows.get(w._desktopAppView.client.mainWid); const W = Math.min(cv.width, main.w), H = Math.min(cv.height, main.h); const d = cv.getContext('2d').getImageData(0, 0, W, H).data; const g = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) g[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3; const seen = new Uint8Array(W * H); const blobs = []; const y0 = Math.floor(H * 0.45); const st = []; for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (seen[i] || g[i] >= 110) continue; let x0 = x, x1 = x, ya = y, yb = y, n = 0; st.push(i); seen[i] = 1; while (st.length) { const j = st.pop(); n++; const jx = j % W, jy = (j - jx) / W; if (jx < x0) x0 = jx; if (jx > x1) x1 = jx; if (jy < ya) ya = jy; if (jy > yb) yb = jy; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = jx + dx, ny = jy + dy; if (nx < 0 || ny < y0 || nx >= W || ny >= H) continue; const k = ny * W + nx; if (!seen[k] && g[k] < 110) { seen[k] = 1; st.push(k); } } } const bh = yb - ya + 1, bw = x1 - x0 + 1; if (bh < H * 0.008 || bh > H * 0.06 || bw > W * 0.08 || n < 20) continue; const cy = Math.round((ya + yb) / 2); const L = g[cy * W + Math.max(0, x0 - Math.round(bh * 0.6))], R = g[cy * W + Math.min(W - 1, x1 + Math.round(bh * 0.6))]; if (!(L >= 196 && L <= 216 && R >= 196 && R <= 216)) continue; blobs.push({ cx: (x0 + x1) / 2, cy: (ya + yb) / 2, h: bh }); } const rows = []; for (const b of blobs.sort((a, b) => a.cy - b.cy)) { const row = rows.find((r) => Math.abs(r[0].cy - b.cy) < b.h); if (row) row.push(b); else rows.push([b]); } for (const r of rows) r.sort((a, b) => a.cx - b.cx); return rows.filter((r) => r.length === 3 || r.length === 1).slice(-4).map((r) => r.map((b) => ({ cx: b.cx, cy: b.cy }))); })()`;
  const chordC7 = async (p) => {
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, modifiers: 2 });
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 });
  };
  const copyBack7 = async (p, id, prev) => {
    await chordC7(p);
    return (await until(async () => { const v = await p.evalJs(R2(id)); return v && v.lastReceived && v.lastReceived !== prev ? v.lastReceived : null; }, 6000, 200)) || '';
  };
  // A KEY LANDS BY EVIDENCE, NOT BY A CLOCK (lane xpra-suite-evidence, B-7ea8): the digits were clicked 400 ms apart and read once
  // at the end — beside test-desktop-app-snap on an 8-lane heavy, the phone leg read "789230" for 7894561230. Each click now waits
  // until the calculator's OWN copy (the Ctrl+C copyBack7 reads) shows the readout grown by THAT digit (what was seen + the digit —
  // never the full string, where one miss would double every later key), re-asked within KEY_DEADLINE_MS. Between a click and its
  // copy the pointer rests on the readout's entry line (2.4 key rows above the 7, left), off the keypad: a pointer resting on a key
  // while its copy was read lost the key BELOW it (lane xpra-control-judge — GNOME Calculator 50's keys carry tooltips; the C row
  // sits right above the 7 and the history area above the entry shrinks at the app's minimum).
  // A miss is evidence, never re-pressed: the key, what the readout showed, the ms. AND A CLICK IS AIMED ONLY AT THE PICTURE: each
  // copy that reaches the page says "Copied to your clipboard" — a toast, centred above the taskbar on a phone, which took the
  // clicks on 5 / 6 / 2 / 3 of the 320 px phone (measured, this lane's first run); so before each click the key's point must hit
  // the pane (document.elementFromPoint), within REACH_DEADLINE_MS, and a miss names what covered it. A point OFF the page (nothing
  // there — the r1 CONTROL's window left the workspace) waits for nothing: no click can land there, so it is a miss at once.
  const HIT7 = (id, x, y) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const v = w && w._desktopAppView; const e = document.elementFromPoint(${x}, ${y}); if (!e) return 'nothing'; if (v && v.pane && v.pane.contains(e)) return 'pane'; const t = e.closest('[id]'); return e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).join('.') : '') + (t ? ' in #' + t.id : ''); })()`;
  const reach7 = async (p, id, k) => {
    const t0 = Date.now(); let last = null;
    await until(async () => { last = await p.evalJs(HIT7(id, k.x, k.y)); return last === 'pane' || last === 'nothing'; }, REACH_DEADLINE_MS, 150);
    return { ok: last === 'pane', off: last === 'nothing', ms: Date.now() - t0, cover: last === 'pane' ? null : last };
  };
  const LAST7 = (id) => `(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const c = w && w._desktopAppView && w._desktopAppView.client; return c ? c.lastReceived : null; })()`;
  const keySeen7 = async (p, id, want) => {
    const t0 = Date.now();
    while (Date.now() - t0 < KEY_DEADLINE_MS) {
      await chordC7(p);
      if (await until(async () => (await p.evalJs(LAST7(id))) === want, Math.min(1500, Math.max(200, KEY_DEADLINE_MS - (Date.now() - t0))), 100)) return { seen: true, ms: Date.now() - t0 };
    }
    return { seen: false, ms: Date.now() - t0, readout: await p.evalJs(LAST7(id)).catch(() => null) };
  };
  /** every digit key clicked through the page (the stage's offset + scale, the ratio — read again per key), each one SEEN in the
   *  calculator's own copy before the next is pressed */
  const allDigits7 = async (p, id) => {
    const rows = await p.evalJs(DIGITS7(id));
    const order = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['0']];
    let want = '', got = '';
    const misses = [], keyMs = [], reachMs = [];
    if (rows.length === 4) {
      const park = { x: rows[0][0].cx, y: rows[0][0].cy - 2.4 * (rows[1][0].cy - rows[0][0].cy) }; // backing px: the entry line, off the keypad
      for (let i = 0; i < 4; i++) for (let j = 0; j < order[i].length; j++) {
        const q = rows[i][j]; if (!q) continue;
        const s = await p.evalJs(R2(id));
        const at = (bx, by) => ({ x: s.pane.x + s.offset.x + (bx / s.ratio) * s.scale, y: s.pane.y + s.offset.y + (by / s.ratio) * s.scale });
        const k = at(q.cx, q.cy), pk = at(park.x, park.y);
        const h = await reach7(p, id, k); reachMs.push(h.ms);
        want += order[i][j];
        if (h.off) { misses.push({ key: order[i][j], offPage: k }); continue; }
        await trustedClickAt(p, k.x, k.y);
        await p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pk.x, y: pk.y });
        const r = await keySeen7(p, id, got + order[i][j]);
        if (r.seen) { got += order[i][j]; keyMs.push(r.ms); } else { misses.push({ key: order[i][j], readout: r.readout, ms: r.ms, ...(h.ok ? {} : { coveredBy: h.cover }) }); if (typeof r.readout === 'string' && /^\d*$/.test(r.readout)) got = r.readout; }
      }
    }
    console.log(`    digit keys: ${keyMs.length}/${want.length} seen in the calculator's copy (slowest ${keyMs.length ? Math.max(...keyMs) : '-'} ms; the longest wait for a key's point to be the picture ${reachMs.length ? Math.max(...reachMs) : '-'} ms)${misses.length ? '; MISSED ' + misses.map((m) => (m.offPage ? `'${m.key}' (its point ${Math.round(m.offPage.x)},${Math.round(m.offPage.y)} is off the page)` : `'${m.key}' (the readout showed ${JSON.stringify(m.readout)} after ${m.ms} ms${m.coveredBy ? `; its point was under ${m.coveredBy}` : ''})`)).join(', ') : ''}`);
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    return { want, got, rows: rows.length, misses, slowestMs: keyMs.length ? Math.max(...keyMs) : null };
  };
  /** the canvas vs the screen, pixel for pixel: a FULL screenshot (device px — no clip resampling), the canvas read before and
   *  after it (a pixel xpra repainted in between is not counted), compared at the canvas's device origin (best of ±1 px) */
  const identity7 = async (p, id, dpr) => {
    const v = await p.evalJs(R2(id));
    const cw = Math.min(v.canvas.w, v.main.w, Math.floor(v.pane.w * dpr)) - 4, chh = Math.min(v.canvas.h, v.main.h, Math.floor(v.pane.h * dpr)) - 4;
    const px = (x, y, w, h) => p.evalJs(`(() => { const ww = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const cv = ww._desktopAppView.pane.querySelector('.xpra-win-main canvas'); const d = cv.getContext('2d').getImageData(${x}, ${y}, ${w}, ${h}).data; const g = new Array(${w} * ${h}); for (let i = 0; i < g.length; i++) g[i] = Math.round((d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3); return g; })()`);
    const c0 = await px(2, 2, cw, chh);
    const shot = await p.cdp('Page.captureScreenshot', { format: 'png' });
    const c1 = await px(2, 2, cw, chh);
    const sg = await p.evalJs(`(async () => { const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.data)}; await img.decode(); const W = img.naturalWidth, H = img.naturalHeight; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, W, H).data; const g = new Array(W * H); for (let i = 0; i < W * H; i++) g[i] = Math.round((d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3); return { W, g }; })()`);
    const X0 = Math.round((v.canvas.rx + 2 / dpr) * dpr), Y0 = Math.round((v.canvas.ry + 2 / dpr) * dpr);
    let best = null;
    for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
      let diff = 0, n = 0;
      for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) { const i = y * cw + x; if (c0[i] !== c1[i]) continue; n++; if (Math.abs(c1[i] - sg.g[(Y0 + dy + y) * sg.W + X0 + dx + x]) > 2) diff++; }
      if (!best || diff / n < best.frac) best = { dx, dy, diff, n, frac: diff / n };
    }
    return { ...best, transform: v.transform, scale: v.scale, badge: !!(v.badge && v.badge.shown), box: [v.canvas.rw, v.canvas.rh], backing: [v.canvas.w, v.canvas.h], main: v.main && [v.main.w, v.main.h] };
  };
  const CALC6 = bin('gnome-calculator');
  const mkPage = async (origin, metrics) => { const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json(); const p = await page(t); await p.cdp('Emulation.setDeviceMetricsOverride', metrics); await p.cdp('Emulation.setFocusEmulationEnabled', { enabled: true }); await openPage(p, origin); return { p, t }; };
  const dropPage = async (x) => { if (!x || x.dropped) return; x.dropped = true; x.p.close(); try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${x.t.id}`); } catch {} };
  /** x5: a page that replayed the window later than another client is BLOCKED — make THIS pane the active one (Resume here) */
  const ensureActive = async (p, id) => {
    const s = await until(async () => { const v = await p.evalJs(SEAT(id)); return v && v.seats && v.seats.known ? v : null; }, 10000, 250);
    if (s && s.seats.active === s.paneKey) return true;
    await p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); const b = w && w.content.querySelector('.desktop-app-resume'); if (b) b.click(); return true; })()`);
    return !!(await until(async () => { const v = await p.evalJs(SEAT(id)); return v && v.seats && v.seats.active === v.paneKey ? v : null; }, 10000, 250));
  };
  const launchOn = (p, body) => p.evalJs(`fetch('/api/desktop/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...${JSON.stringify(body)}, dpr: devicePixelRatio }) }).then((r) => r.json())`); // the launcher's own field (desktop-app-launcher.js launchDpr)
  const readyOn = (p, id) => until(() => p.evalJs(`fetch('/api/desktop/apps/${id}').then((r) => r.json()).then((r) => (r.state === 'ready' ? r : null))`), 40000);
  const sizeWinOn = (p, id, W, H) => p.evalJs(`(() => { const w = [...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)}); app.wm.focusWindow(w.id); w.element.style.left = '20px'; w.element.style.top = '10px'; w.element.style.width = '${W}px'; w.element.style.height = '${H}px'; if (w.onResize) w.onResize(); return true; })()`);
  const xenvFor = (w, r) => ({ ...process.env, DISPLAY: r.display, XAUTHORITY: path.join(w, 'data', 'desktop-apps', r.id, 'Xauthority') });
  /** round 3 lane B: a SEAMLESS window (a CSD app — GNOME Calculator) has its title bar and status strip folded — reveal
   *  them the user's way (a hover of the top edge, §12's measured 250 ms) before a click on the ✕ / the ⋯; a no-op on a
   *  window that shows its frame (xterm, a blocked pane) */
  const revealBars = async (P, id) => {
    const W0 = `[...app.wm.windows.values()].find((w) => w._desktopAppId === ${JSON.stringify(id)})`;
    const r = await P.evalJs(`(() => { const w = ${W0}; if (!w || !w.element.classList.contains('seamless')) return null; if (w.element.classList.contains('seamless-revealed') && w.titleBar.offsetHeight >= 20) return { already: true }; const e = w.element.getBoundingClientRect(); return { x: e.x + Math.min(200, e.width / 3), y: e.y + 2 }; })()`);
    if (!r) return false;
    if (r.already) return true;
    await P.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
    const ok = await until(() => P.evalJs(`(() => { const w = ${W0}; return !!w && w.element.classList.contains('seamless-revealed') && w.titleBar.offsetHeight >= 20; })()`), 3000, 50);
    await sleep(250); // the 0.15 s height transition settles
    return !!ok;
  };
  const xq = (xe, cmd, args) => { try { return execFileSync(cmd, args, { env: xe, encoding: 'utf8', timeout: 5000 }); } catch { return ''; } };

  /** a § that threw: counted red, with its stack (the original suite's own words) */
  const threw = (what, e) => { failed++; console.error(`  ✗ ${what} threw:`, e.stack || e.message); };
  /** the part itself threw: red, with the server's and the page's last lines */
  const crashed = (e, p1) => {
    failed++; console.error('  ✗ threw:', e.stack || e.message);
    console.error('  server log tail:', srvLog.join('').split('\n').slice(-12).join('\n  '));
    console.error('  page console tail:', p1.logs.slice(-12));
  };
  /** the end of a part: the real-home census, the verdict line, the exit (the exit hook tears the boot down ONCE) */
  const finish = () => {
    // ── THE REAL HOME IS UNTOUCHED (census (c)): not "no new entry" — this box runs real
    // sessions concurrently — but no FIXTURE entry, the class this suite could have written.
    {
      const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
      const added = after.filter((d) => !realBefore.has(d.name))
        .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
      const lit = fixtureLitter(added);
      check(`the real ~/.claude/projects gained no fixture entry (${added.length} new entr${added.length === 1 ? 'y' : 'ies'} from concurrent real sessions, 0 of them fixtures)`,
        lit.offenders.length === 0, JSON.stringify(lit.offenders.slice(0, 3)));
    }
    console.log(failed ? `\n${failed} FAILED${skipped ? ` (${skipped} skipped)` : ''}` : `\n${part} passed${skipped ? ` (${skipped} skipped)` : ''}`);
    process.exit(failed ? 1 : 0);
  };

  return { agentTokens, allDigits7, appsOf, bin, BOOT_DEADLINE_MS, bootedCopy, bootServer, CALC6, CDP_PORT, cdpTargets, check, chordC7, CHROME,
  chrome, COPY_RING_LINES, copyBack7, crashed, ctlServers, D, devHomes, devProcs, DIGITS7, dropPage, ensureActive, FAKE_BIN, FAKE_CLAUDE, fakeHome,
  finish, fixtureLitter, HIT7, HOSTNAME, hostResolves, identity7, KEY_DEADLINE_MS, keyOf, keySeen7, LAST7, launchOn, markerSweep, measurePane, mkPage,
  newPage, openPage, page, PORT, R2, REACH_DEADLINE_MS, reach7, readyOn, REAL_PROJECTS, realBefore, rebaseline, recordedApps, recordedPids, repo,
  revealBars, ringTail, RUNTIME, SEAT, SETTLE_DEADLINE_MS, sizeWinOn, skip, sleep, spawnCopy, srvEnv, srvLog, target, threw, TITLE_DEADLINE_MS,
  trustedClickAt, typedFile, until, VNC_ENV, WebSocket, WIN, worktrees, wt, XAGREE_DEADLINE_MS, XAUTH, XCLIP, xclipKids, XDOTOOL, xenvFor, XPRA,
  xpraVersion, xq, XTERM };
}
