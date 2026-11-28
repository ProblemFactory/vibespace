#!/usr/bin/env node
// test-app-launch-once — ONE PROGRAM, ONE INSTANCE (lane app-launch-singleton, fleet inc-mv7hxc2n-2cvr, .268). An agent's
// Chrome kept running on :2 after its viewer left; the person's three presses of the Chrome card each started a second
// Chrome on the SAME default profile, which Chrome's singleton handed to :2 and exited code 0 within a second — a window
// that blinked shut, nothing said, and no card said Chrome was running. Fast, in-process, no X, no browser: the REAL keeper
// (src/server/desktop-app-keeper.js over src/desktop-serve.js) with a FAKE display (its "X server" is a sleeping child on a
// display number nothing listens on) and FAKE apps (shell scripts in a scratch dir; one is a singleton like Chrome: a second
// start hands over to the first through a lock file and exits 0), a private HOME:
//   ① the singleton's handover reproduced: a second launch of the running app (no ifRunning — the agent door, a typed
//      command) ends at once ⇒ `quickExit` on the record {afterMs < QUICK_EXIT_MS, code 0, running: the first one}, the
//      journal line carries the timing ("… exited: application exited (code 0) — 0.x s after ready"), ONE server notice
//      naming where the app runs and who started it, and the window's verdict KEEPS it open with the sentence
//      (exitCloseVerdict 'quick-exit'). CONTROL: an app that runs past QUICK_EXIT_MS (the keeper's clock moved) and exits
//      has no quickExit and no notice, and its window closes ('exited').
//   ② the card's press (`ifRunning: 'attach'`) on a running app answers the RUNNING record (`attached: true`): no second
//      record, no second process; a document launch / an unknown ifRunning are not attached / refused by name.
//   ③ who started it: `launchedBy` rides the record (an agent session's name; the person).
//   ④ DEFECT #0: an INSTALLED browser (an app row whose exec is google-chrome-stable, category browser) is served with
//      browser 'chromium' (browserBy 'exec') + runsTwice, and its launch argv carries --user-data-dir=<the session's own
//      profile under the keeper's data dir> — never the user's default one. CONTROL: a browser run through `flatpak run`
//      stays as typed (no family, runsTwice false).
//   ⑥ int267 seam (the guard-programmatic-not-the-press law): the PERSON's own close inside QUICK_EXIT_MS — the record
//      stamped `closeAskedAt` (keeper.closeAsked, the outer ✕'s door, BEFORE close-window) — exits with NO quickExit, no
//      notice, and its window closes ('exited'). RED CONTROL: the same exit with no ask still reads quick-exit (kept + ONE
//      notice). The client's door stamps before it sends (source order) and the route reaches the keeper.
//   ⑤ the lock fact: display.profileLockFact over the private HOME — a SingletonLock to a live pid of THIS host ⇒ live + its
//      session id; a dead pid ⇒ live false; another host's ⇒ null; no lock ⇒ null — and list() names the record whose app
//      process holds a browser row's default profile (row.lock.recordId), which the card's verdict then attaches to.
//   ⑦ lane exit-close-cadence (B-8778): an app whose session keeps a member that outlives SIGTERM (the stand-in for the
//      `dbus-launch --autolaunch` babysitter GLib starts when the env names no session bus: it dies 3.0 s after a SIGTERM)
//      ⇒ the exited record (windowsAtExit 0) is COMMITTED — the broadcast every client closes its window on — within
//      EXIT_CENSUS_MS of the exit while that member still runs; the teardown then reaps it (SIGKILL after STOP_GRACE_MS, the
//      keeper's clock moved) and commits again, clean. RED CONTROL: the pre-lane order (an in-memory copy of desktop-serve
//      committing only after the teardown) holds the verdict behind the member until the grace runs out.
//   ⑧ lane launch-picture-size: a launch with a PICTURE SIZE (the Apps dialog's select / `vibespace-window open --size`, the
//      body's `pin`) — the record is BORN pinned through the one stamp; a keeper-fixed rung (Xvfb+x11vnc's fit cell) starts
//      its X server AT the pin; a bad size is refused in parsePin's words; a rung that cannot hold a pin (this suite's own
//      rung has no fit cell; a 'shared' one; Xvnc's 'follows') refuses `pin_unsupported` BY NAME — no record, nothing run.
//   ⑫ B-34bc (主开发 r2362 / r2375 / r2425): a hub env that names NO locale ⇒ the application, its display server and a helper
//      (a real child started from ctx.x11Env, the window manager's and the portal bus's road) start with a UTF-8 character type (LC_CTYPE only,
//      display.appStartEnv); a person's own locale (here a non-UTF-8 LANG) is never replaced. RED CONTROL: bringUp without its
//      start environment (a copy) ⇒ all three start in the C locale.
// ~3 s.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';   // mutant-copy imports scratch.mjs already: no new side effect
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require(path.join(repo, 'src/desktop-display.js'));
const DS = require(path.join(repo, 'src/desktop-serve.js'));
const K = require(path.join(repo, 'src/server/desktop-app-keeper.js'));
const M = require(path.join(repo, 'src/desktop-apps.js'));

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : ''}`); } return !!c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000, step = 25) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
const T0 = Date.now();

const root = scratch('launch-once');
fs.rmSync(root, { recursive: true, force: true });
const home = path.join(root, 'home'), bin = path.join(root, 'bin');
for (const d of [home, bin]) fs.mkdirSync(d, { recursive: true });
const script = (name, body) => { const p = path.join(bin, name); fs.writeFileSync(p, `#!/bin/sh\n${body}\n`, { mode: 0o755 }); return p; };
// a SINGLETON like Chrome's: the first start holds the lock (its own pid — `exec sleep` keeps it); a second start while that
// pid lives hands over to it and exits 0 at once
const SINGLE = script('single-app', 'L="$HOME/.single.lock"\nif [ -f "$L" ] && kill -0 "$(cat "$L")" 2>/dev/null; then echo "handed over to $(cat "$L")"; exit 0; fi\necho $$ > "$L"\nexec sleep 600');
const GATE = script('gate-app', `while [ ! -e "${root}/gate-open" ]; do sleep 0.05; done\nexit 0`);
const GATE_ASKED = script('gate-asked-app', `while [ ! -e "${root}/gate-asked-open" ]; do sleep 0.05; done\nexit 0`); // ⑥
const GATE_UNASKED = script('gate-unasked-app', `while [ ! -e "${root}/gate-unasked-open" ]; do sleep 0.05; done\nexit 0`); // ⑥ RED CONTROL
const HELPER = script('helper-app', `(trap '' TERM; exec sleep 600) &\necho $! > "${root}/helper-member"\nwhile [ ! -e "${root}/helper-open" ]; do sleep 0.05; done\nexit 0`); // ⑦
const CHROME = script('google-chrome-stable', `printf '%s\\n' "$@" > "${root}/chrome-argv"\nexec sleep 600`);
const FAKE_DISPLAY = ':4093'; // nothing listens there; no X call reaches it (the fakes below answer for X)
const kids = [];
const fakeDisplay = {
  ...D,
  hostFacts: async () => ({ hostId: null, bins: { fakex: '/bin/true' }, xpra: null, browsers: {}, office: { exec: null, path: null, program: null, confinement: null, modules: null }, at: Date.now() }),
  RECIPES: Object.freeze({
    'fake-x': async (ctx) => {
      const c = await D.spawnDetached('sleep', ['600'], { env: ctx.base, logFd: ctx.logFd, name: 'fake-x' }).spawned;
      kids.push(c.pid);
      ctx.onPart('x', c, { display: FAKE_DISPLAY, port: 1, alsoServer: true });
      return { display: FAKE_DISPLAY, port: 1, shared: false, wm: false };
    },
  }),
  waitForListen: async () => ({ ok: true }),
  listenerHeldBy: () => true,
  enumerateWindows: async () => ({ ok: true, why: null, windows: [] }),
  displaySize: async () => ({ ok: true, width: 1280, height: 800 }),
  applyWindowPlan: async () => ({ ok: true }),
};
const vnc = M.DISPLAY_BACKENDS.find((b) => b.id === 'vnc-display');
const BACKENDS = Object.freeze([Object.freeze({ ...vnc, needs: Object.freeze([Object.freeze(['fakex'])]), recipes: Object.freeze({ fakex: 'fake-x' }) })]);
const ROWS = Object.freeze([
  Object.freeze({ id: 'single', label: 'Single App', exec: SINGLE, args: Object.freeze([]), category: 'app' }),
  Object.freeze({ id: 'gate', label: 'Gate App', exec: GATE, args: Object.freeze([]), category: 'app' }),
  Object.freeze({ id: 'gate-asked', label: 'Asked App', exec: GATE_ASKED, args: Object.freeze([]), category: 'app' }),
  Object.freeze({ id: 'gate-unasked', label: 'Unasked App', exec: GATE_UNASKED, args: Object.freeze([]), category: 'app' }),
]);
let skew = 0;
const now = () => Date.now() + skew;
const lines = [];
const log = { log: (s) => lines.push(String(s)), warn: (s) => lines.push(String(s)), error: (s) => lines.push(String(s)) };
const notices = [];
const env = () => ({ PATH: `${bin}:${process.env.PATH}`, HOME: home });
const keeper = K.create({ dataDir: path.join(root, 'k'), env, broadcast: () => {}, display: fakeDisplay, backends: BACKENDS, registryRows: ROWS, log, now, tickMs: 3600e3, serverNotice: (key, text, opts) => { notices.push({ key, text, opts }); return 1; } });
const settle = (id) => until(() => { const r = keeper.get(id); return r && r.state !== 'launching' ? r : null; });
const ended = (id) => until(() => { const r = keeper.get(id); return r && (r.state === 'exited' || r.state === 'failed') && r.endedAt ? r : null; });
const appPid = (id) => { const r = keeper.get(id); return r && r.pids && r.pids.app; };
/** Each group of legs runs to its own end: a throw in one (a pre-fix tree has no verdicts to call) never hides the next. */
const leg = async (name, fn) => { try { await fn(); } catch (e) { ok(false, `${name} ran to its end`, e && e.stack); } };

try {
await leg('①②③', async () => {
  console.log('① a second start the singleton hands over ⇒ quickExit, the timed journal line, ONE notice, the window keeps its sentence');
  const first = await keeper.launch({ appId: 'single' }, { launchedBy: { kind: 'agent', sessionId: 'sess-a', name: 'Install app chrome' } });
  const r1 = await settle(first.id);
  ok(gateOf(r1) && r1.state === 'ready' && r1.display === FAKE_DISPLAY, 'the first instance is ready on its display', r1 && { state: r1.state, err: r1.lastError });
  await until(() => fs.existsSync(path.join(home, '.single.lock')));
  ok(Number(fs.readFileSync(path.join(home, '.single.lock'), 'utf8')) === appPid(first.id), 'it holds the singleton lock with its own pid (the app part)');
  ok(gateOf(r1) && gateOf(r1.launchedBy) && r1.launchedBy.kind === 'agent' && r1.launchedBy.name === 'Install app chrome', '③ the record says who started it: the agent session, by name', r1 && r1.launchedBy);
  const second = await keeper.launch({ appId: 'single' }); // the pre-fix card / an agent's open: no ifRunning
  const r2 = await ended(second.id);
  ok(gateOf(r2) && r2.state === 'exited' && r2.exitCode === 0, 'the second start ended at once with code 0 (handed over)', r2 && { state: r2.state, code: r2.exitCode });
  const q = r2 && r2.quickExit;
  ok(gateOf(q) && q.afterMs < M.QUICK_EXIT_MS && q.code === 0 && q.signal === null, `quickExit on the record: ${q && q.afterMs} ms < ${M.QUICK_EXIT_MS}, code 0`, q);
  ok(gateOf(q) && q.running === first.id && q.runningDisplay === FAKE_DISPLAY, 'quickExit names the instance that still runs and where (the attach door)', q);
  const jl = lines.find((l) => l.startsWith(`[desktop] ${second.id} exited: application exited (code 0) — `));
  ok(gateOf(jl) && verdictOf(/— (?:(?:under 0\.1|\d+\.\d) s after ready|before ready, (?:under 0\.1|\d+\.\d) s after it started)$/.test(jl)), 'the journal line carries WHEN it exited', jl || lines.filter((l) => l.includes(second.id)));
  await until(() => notices.length);
  ok(notices.length === 1 && notices[0].key === `desktop-app-quick-exit:${second.id}` && gateOf(notices[0].opts) && notices[0].opts.level === 'warn', 'ONE server notice under the record\'s own key', notices);
  ok(gateOf(notices[0]) && verdictOf(/Single App exited right after it started \(code 0, (?:under 0\.1|\d+\.\d) s after it started\) — the same program is already running on :4093 \(started by agent session Install app chrome\): open it from Apps\./.test(notices[0].text)), 'the notice says where it runs and who started it', notices[0] && notices[0].text);
  const v2 = M.exitCloseVerdict(r2, { leased: false });
  ok(v2.close === false && v2.why === 'quick-exit', 'the window is NOT closed: it keeps the sentence (exitCloseVerdict quick-exit)', v2);
  ok(keeper.get(first.id).state === 'ready', 'the first instance is untouched');

  console.log('② the card\'s press on a running app ATTACHES — no second record, no second process');
  const before = keeper.listApps().length;
  const at = await keeper.launch({ appId: 'single', ifRunning: 'attach' });
  ok(gateOf(at) && at.attached === true && at.id === first.id && at.state === 'ready', 'ifRunning attach answers the RUNNING record (attached: true)', at && { id: at.id, attached: at.attached });
  ok(keeper.listApps().length === before, 'no new record was made', keeper.listApps().map((r) => r.id));
  ok(verdictOf(lines.some((l) => l === `[desktop] launch of single attached to ${first.id} (running on ${FAKE_DISPLAY}) — no second instance started`)), 'the attach is journalled');
  let bad = null; try { await keeper.launch({ appId: 'single', ifRunning: 'again' }); } catch (e) { bad = e; }
  ok(gateOf(bad) && bad.code === 'bad-request' && verdictOf(/ifRunning must be "attach"/.test(bad.message)), 'an unknown ifRunning is refused by name', bad && bad.message);
  const lv = M.launchVerdict({ row: { id: 'single', runsTwice: false }, apps: keeper.listApps(), host: 'local' });
  ok(lv.act === 'attach' && lv.target.id === first.id && lv.again === false && lv.running.length === 1, 'the card\'s verdict over the live list: attach, no "Open another" for a single-instance app', { act: lv.act, again: lv.again, n: lv.running.length });

});
await leg('① CONTROL', async () => {
  console.log('① CONTROL — an app that ran past QUICK_EXIT_MS: no quickExit, no notice, the window closes');
  const n0 = notices.length;
  const g = await keeper.launch({ appId: 'gate' }, { launchedBy: { kind: 'person' } });
  await settle(g.id);
  ok(gateOf(keeper.get(g.id).launchedBy) && keeper.get(g.id).launchedBy.kind === 'person', '③ a person\'s launch says so (launchedBy person)', keeper.get(g.id).launchedBy);
  await until(() => appPid(g.id));
  skew += 3000 + 1000; // the keeper's clock: the app has run past the quick window (QUICK_EXIT_MS = 3 s, pinned in test-desktop-apps)
  fs.writeFileSync(path.join(root, 'gate-open'), '1');
  const rg = await ended(g.id);
  ok(gateOf(rg) && rg.state === 'exited' && rg.exitCode === 0 && !rg.quickExit, 'it exited code 0 WITHOUT quickExit', rg && { state: rg.state, quickExit: rg.quickExit });
  await sleep(150);
  ok(notices.length === n0, 'no notice for it', notices.map((n) => n.key));
  const vg = M.exitCloseVerdict(rg, { leased: false });
  ok(vg.close === true && vg.why === 'exited', 'its window closes as before (exited)', vg);
  const jg = lines.find((l) => l.startsWith(`[desktop] ${g.id} exited: application exited (code 0) — `));
  ok(gateOf(jg) && verdictOf(/— (?:under 0\.1|\d+\.\d) s after ready$/.test(jg)), 'its journal line carries the timing too', jg);

});
await leg('⑥', async () => {
  console.log('⑥ int267 seam — the person\'s own close inside QUICK_EXIT_MS is an exit, never a failed launch');
  const n0 = notices.length;
  const a = await keeper.launch({ appId: 'gate-asked' }, { launchedBy: { kind: 'person' } });
  await settle(a.id);
  await until(() => appPid(a.id));
  const st = await keeper.closeAsked(a.id); // the outer ✕'s door: stamped BEFORE close-window is sent
  ok(gateOf(st) && gateOf(Number.isFinite(st.closeAskedAt)) && st.closeAskedBy === 'window' && st.state === 'ready', 'closeAsked stamps the live record (closeAskedAt, closeAskedBy window) and leaves it running', st && { state: st.state, at: st.closeAskedAt, by: st.closeAskedBy });
  fs.writeFileSync(path.join(root, 'gate-asked-open'), '1'); // the app answers the ask at once
  const ra = await ended(a.id);
  ok(gateOf(ra) && ra.state === 'exited' && ra.exitCode === 0 && !ra.quickExit, 'its exit carries NO quickExit', ra && { state: ra.state, quickExit: ra.quickExit });
  ok(gateOf(ra) && ra.endedAt - (ra.appAt || ra.startedAt) < M.QUICK_EXIT_MS, `…though it ended inside the quick window (${ra && ra.endedAt - (ra.appAt || ra.startedAt)} ms < ${M.QUICK_EXIT_MS})`);
  await sleep(150);
  ok(notices.length === n0, 'no notice for it', notices.slice(n0).map((n) => n.key));
  const va = M.exitCloseVerdict(ra, { leased: false });
  ok(va.close === true && va.why === 'exited', 'its window closes (exited) — the person closed it', va);

  console.log('⑥ RED CONTROL — the same exit with no ask still reads quick-exit: kept + ONE notice');
  const u = await keeper.launch({ appId: 'gate-unasked' }, { launchedBy: { kind: 'person' } });
  await settle(u.id);
  await until(() => appPid(u.id));
  fs.writeFileSync(path.join(root, 'gate-unasked-open'), '1');
  const ru = await ended(u.id);
  ok(gateOf(ru) && gateOf(ru.quickExit) && ru.quickExit.afterMs < M.QUICK_EXIT_MS && !ru.closeAskedAt, 'quickExit on the unasked record', ru && { quickExit: ru.quickExit, asked: ru.closeAskedAt });
  await until(() => notices.length > n0);
  ok(notices.length === n0 + 1 && notices[n0].key === `desktop-app-quick-exit:${u.id}`, 'ONE notice, under its own key', notices.slice(n0).map((n) => n.key));
  const vu = M.exitCloseVerdict(ru, { leased: false });
  ok(vu.close === false && vu.why === 'quick-exit', 'its window is KEPT with the sentence (quick-exit)', vu);

  console.log('⑥ the doors: the client stamps BEFORE it sends close-window; the route reaches the keeper');
  const W = fs.readFileSync(path.join(repo, 'src/lib/desktop-app-window.js'), 'utf8');
  const i0 = W.indexOf('winInfo.onCloseRequest = () => {'), door = i0 >= 0 ? W.slice(i0, W.indexOf('\n  };', i0)) : '';
  const iStamp = door.indexOf('/close-asked`'), iRace = door.indexOf('Promise.race([stamped, '), iSend = door.indexOf('view.closeApp()');
  ok(iStamp > 0 && iRace > iStamp && iSend > iRace, 'the outer ✕ POSTs close-asked, waits (bounded) for it, THEN sends close-window', { iStamp, iRace, iSend });
  const R = fs.readFileSync(path.join(repo, 'src/routes/desktop-apps.js'), 'utf8');
  ok(gateOf(/router\.post\('\/api\/desktop\/apps\/:id\/close-asked',[\s\S]{0,400}?ctx\.keeper\.closeAsked\(req\.params\.id\)/.test(R)) && verdictOf(DS.DESKTOP_SERVE_OPS.includes('close-asked')), 'POST /api/desktop/apps/:id/close-asked → keeper.closeAsked; a paired machine answers the close-asked op');
});
await leg('④⑤', async () => {
  console.log('④ DEFECT #0 — an installed browser launches on its OWN profile');
  const dataDir = path.join(root, 'ds');
  const CATALOG = [
    { id: 'app.chrome', label: 'Google Chrome', exec: CHROME, args: [], category: 'browser', app: 'chrome' },
    { id: 'app.chromefp', label: 'Chrome (flatpak)', exec: 'flatpak', args: ['run', 'com.google.Chrome'], category: 'browser', app: 'chromefp' },
  ];
  const apps = { catalogRows: () => CATALOG.map((r) => ({ ...r, args: [...r.args] })), refreshCatalog: async () => {}, witnessRows: () => [] };
  const ds = DS.install({ dataDir, env, display: fakeDisplay, backends: BACKENDS, registryRows: [], log, now, tickMs: 3600e3, apps });
  const L0 = await ds.list();
  const cr = L0.registry.find((r) => r.id === 'app.chrome'), fr = L0.registry.find((r) => r.id === 'app.chromefp');
  ok(gateOf(cr) && cr.browser === 'chromium' && cr.browserBy === 'exec' && cr.runsTwice === true, 'the installed Chrome row is served as a chromium-family browser that runs twice', cr && { browser: cr.browser, by: cr.browserBy, twice: cr.runsTwice });
  ok(gateOf(fr) && !fr.browser && fr.runsTwice === false, 'CONTROL: a browser through `flatpak run` stays as typed (no family, one instance)', fr && { browser: fr.browser, twice: fr.runsTwice });
  const c1 = await ds.launch({ appId: 'app.chrome' }, {});
  await until(() => fs.existsSync(path.join(root, 'chrome-argv')));
  const argv = fs.existsSync(path.join(root, 'chrome-argv')) ? fs.readFileSync(path.join(root, 'chrome-argv'), 'utf8').trim().split('\n') : [];
  const prof = ds.get(c1.id).profileDir;
  ok(gateOf(prof) && gateOf(prof.startsWith(path.join(dataDir, 'desktop-apps') + '/')) && verdictOf(argv.includes(`--user-data-dir=${prof}`)), 'its argv carries --user-data-dir=<the session\'s own profile under the keeper\'s data dir>', { prof, argv });
  ok(!argv.some((a) => a.includes(path.join(home, '.config/google-chrome'))) && ds.get(c1.id).browser === 'chromium', 'never the user\'s default ~/.config/google-chrome', argv);

  console.log('⑤ the lock fact — who holds a browser\'s default profile');
  const lockDir = path.join(home, '.config/google-chrome');
  fs.mkdirSync(lockDir, { recursive: true });
  const lockAt = (target) => { try { fs.unlinkSync(path.join(lockDir, 'SingletonLock')); } catch {} if (target) fs.symlinkSync(target, path.join(lockDir, 'SingletonLock')); };
  const live = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' }); kids.push(live.pid);
  lockAt(`${os.hostname()}-${live.pid}`);
  const f1 = await D.profileLockFact({ home, dir: '.config/google-chrome' });
  ok(gateOf(f1) && f1.live === true && f1.pid === live.pid && f1.sid === live.pid, 'a lock to a live pid of THIS host ⇒ live, with its session id (a setsid leader names itself)', f1);
  const dead = spawn('true'); await new Promise((r) => dead.once('exit', r));
  lockAt(`${os.hostname()}-${dead.pid}`);
  const f2 = await D.profileLockFact({ home, dir: '.config/google-chrome' });
  ok(gateOf(f2) && f2.live === false && f2.pid === dead.pid, 'a dead pid ⇒ live false', f2);
  lockAt(`another-host-${live.pid}`);
  ok((await D.profileLockFact({ home, dir: '.config/google-chrome' })) === null, 'another host\'s lock ⇒ null (its pid says nothing here)');
  lockAt(null);
  ok((await D.profileLockFact({ home, dir: '.config/google-chrome' })) === null, 'no lock ⇒ null');
  await until(() => ds.get(c1.id) && ds.get(c1.id).state === 'ready');
  lockAt(`${os.hostname()}-${ds.get(c1.id).pids.app}`); // as an OLDER launch on the default profile would hold it
  const L1 = await ds.list();
  const cr1 = L1.registry.find((r) => r.id === 'app.chrome');
  ok(gateOf(cr1) && gateOf(cr1.lock) && cr1.lock.live === true && cr1.lock.recordId === c1.id, 'list() names the record whose app process holds the default profile', cr1 && cr1.lock);
  const lv2 = M.launchVerdict({ row: { ...cr1, id: 'seen.other' }, apps: L1.apps, host: 'local' });
  ok(lv2.act === 'attach' && lv2.target.id === c1.id && lv2.again === true, 'the card\'s verdict attaches to it — even from another row of the same browser (a typed command, an older launch)', { act: lv2.act, target: lv2.target && lv2.target.id });
  lockAt(`${os.hostname()}-${live.pid}`);
  const cr2 = (await ds.list()).registry.find((r) => r.id === 'app.chrome');
  ok(gateOf(cr2) && gateOf(cr2.lock) && gateOf(cr2.lock.live) && cr2.lock.recordId === null, 'a holder outside every record is named without a record', cr2 && cr2.lock);
  await ds.stop(c1.id, { why: 'user' });
  ds.shutdown?.();
});
await leg('⑦', async () => {
  console.log('⑦ lane exit-close-cadence — the exit + its census are the verdict: committed at the exit, never behind a session member that outlives SIGTERM');
  const ROW = { id: 'helper', label: 'Helper App', exec: HELPER, args: [], category: 'app' };
  const noApps = { catalogRows: () => [], refreshCatalog: async () => {}, witnessRows: () => [] };
  /** one app exit on `mod` (desktop-serve or its pre-lane copy): the casts (onCommit: state + windowsAtExit + the
   *  keeper's clock + is the TERM-proof member alive at that instant), the record, the member pid */
  const run = async (mod, tag, between) => {
    const casts = [];
    let ds = null, id = null;
    ds = mod.install({ dataDir: path.join(root, `ds-${tag}`), env, display: fakeDisplay, backends: BACKENDS, registryRows: [ROW], log, now, tickMs: 3600e3, apps: noApps,
      hooks: { onCommit: () => { const r = id && ds.get(id); if (r) casts.push({ state: r.state, windowsAtExit: r.windowsAtExit, at: now(), memberAlive: member ? D.pidAlive(member) : null }); } } });
    let member = null;
    for (const f of ['helper-open', 'helper-member']) fs.rmSync(path.join(root, f), { force: true });
    id = (await ds.launch({ appId: 'helper' }, {})).id;
    await until(() => ds.get(id) && ds.get(id).state === 'ready');
    member = Number(await until(() => { try { return fs.readFileSync(path.join(root, 'helper-member'), 'utf8').trim(); } catch { return null; } }));
    fs.writeFileSync(path.join(root, 'helper-open'), '1');
    const rec = await until(() => { const r = ds.get(id); return r && r.state === 'exited' && r.endedAt ? r : null; });
    await between({ ds, id, casts, member, rec });
    skew += DS.STOP_GRACE_MS; // the grace runs out on the keeper's clock ⇒ SIGKILL
    const gone = await until(() => !D.pidAlive(member), 5000);
    const last = await until(() => { const c = casts.filter((x) => x.state === 'exited'); return c.length && !casts[casts.length - 1].memberAlive ? c : null; }, 5000);
    ds.shutdown?.();
    return { ds, id, casts, member, rec: ds.get(id), gone, last };
  };
  const a = await run(DS, 'fixed', async ({ casts, rec, member }) => {
    const first = await until(() => casts.find((c) => c.state === 'exited'), 3000);
    console.log(`  the exit at ${rec.endedAt}; the exited commit ${first ? first.at - rec.endedAt : '?'} ms later, member ${member} alive then: ${first && first.memberAlive}`);
    ok(gateOf(first) && first.at - rec.endedAt <= DS.EXIT_CENSUS_MS, `the exited record is committed (broadcast) ${first && first.at - rec.endedAt} ms after the exit — within EXIT_CENSUS_MS (${DS.EXIT_CENSUS_MS}), the census its only wait`, first);
    ok(gateOf(first) && first.memberAlive === true && first.windowsAtExit === 0, 'it carries windowsAtExit 0 and lands while the TERM-proof member still runs (the teardown has not ended)', first);
    ok(gateOf(first) && M.exitCloseVerdict(first, { leased: false }).close === true, 'every client closes its window on it (exitCloseVerdict close)', first && M.exitCloseVerdict(first, { leased: false }));
  });
  ok(gateOf(a.gone) && gateOf(a.last) && a.rec.state === 'exited' && !/survived/.test(a.rec.lastError || ''), 'the teardown still reaps the member (SIGKILL after STOP_GRACE_MS) and commits again — clean, still exited', { gone: !!a.gone, state: a.rec.state, lastError: a.rec.lastError, casts: a.casts.length });

  console.log('⑦ RED CONTROL — the pre-lane order (commit only after the teardown) holds the verdict behind the member');
  const file = path.join(repo, 'src/desktop-serve.js');
  const src = fs.readFileSync(file, 'utf8'), from = '        commit();\n        await teardown(rec, handles);\n        commit();';
  if (src.split(from).length !== 2) throw new Error('⑦ control anchor gone in src/desktop-serve.js');
  const Mod = require('module'), fn = file.replace(/\.js$/, '.pre-lane.js'), m = new Mod(fn, null);
  m.filename = fn; m.paths = Mod._nodeModulePaths(path.dirname(file)); m._compile(src.replace(from, '        await teardown(rec, handles);\n        commit();'), fn);
  const b = await run(m.exports, 'pre', async ({ casts, member }) => {
    await sleep(400);
    ok(!casts.some((c) => c.state === 'exited') && verdictOf(D.pidAlive(member)), 'CONTROL: 400 ms after the exit no exited commit has been sent — the member still holds the teardown', casts);
  });
  const bFirst = b.casts.find((c) => c.state === 'exited');
  ok(gateOf(bFirst) && bFirst.at - b.rec.endedAt >= DS.STOP_GRACE_MS && bFirst.memberAlive === false, `CONTROL: its exited commit came only after the grace ran out (${bFirst && bFirst.at - b.rec.endedAt} ms on the keeper's clock ≥ STOP_GRACE_MS) — the window closed that late`, bFirst);
});
await leg('⑨', async () => {
  console.log('⑨ lane lg-store-writes (主开发 2026-11-20 03:10Z) — on the hub the record file is the store writer\'s: a launch\'s record LANDS before its parts spawn');
  // the next start's marker census looks for the ids the FILE names: a part started for a record the disk never held is an orphan
  // nothing reaps (the release wrote the record at the call, before the spawn). A writer that does not land (a held storage): the
  // launch is refused by name, its record removed, NOTHING spawned. RED (anchored, in a copy): the wait cut — the part spawns.
  const DSRC = fs.readFileSync(path.join(repo, 'src/desktop-serve.js'), 'utf8');
  const LAND_A = "    if (!(await landedBeforeSpawn())) refuseUnlanded(id, 'opening an app');\n";
  ok(DSRC.split(LAND_A).length === 2, 'control setup: the launch\'s wait for its record\'s landing is found once in desktop-serve.js');
  const noApps = { catalogRows: () => [], refreshCatalog: async () => {}, witnessRows: () => [] };
  const run = async (mod, tag, { stopDuringWait = false } = {}) => {
    const named = [];
    let release = null;
    const W = { dirty: (f, o) => { named.push(o && o.name); }, durable: stopDuringWait ? () => new Promise((r) => { release = r; }) : async () => false, flushSync: () => ({ written: [], left: [] }), pending: () => true };
    const ds = mod.install({ dataDir: path.join(root, `ds-${tag}`), env, display: fakeDisplay, backends: BACKENDS, registryRows: [ROWS[0]], log, now, tickMs: 3600e3, apps: noApps, writer: W });
    const before = kids.length;
    let err = null, id = null, state = null;
    const p = ds.launch({ appId: 'single' }, {}).then((v) => { id = v && v.id; state = v && v.state; }, (e) => { err = e && e.code; });
    if (stopDuringWait) {   // a Stop pressed while the record lands: the record is listed, its launch waits on the writer
      await until(() => release && Object.keys(ds._store().apps).length === 1, 5000);
      const sid = Object.keys(ds._store().apps)[0];
      try { await ds.stop(sid, { why: 'user' }); } catch { /* said below */ }
      release(true);
    }
    await p;
    // a spawn comes from the bring-up after the launch's answer: waited for (bounded), never a bare sleep
    await until(() => kids.length > before, 1500);
    const out = { err, state, spawned: kids.length - before, records: Object.keys(ds._store().apps).length, named: [...new Set(named)] };
    if (id) { try { await ds.stop(id, { why: 'user', force: true }); } catch { /* the finally kills the kids */ } }
    ds.shutdown();
    return out;
  };
  const r = await run(DS, 'land-refused');
  ok(r.err === 'desktop_apps_not_on_disk' && r.spawned === 0 && r.records === 0 && verdictOf(r.named.includes('desktop-apps.write')), '⑨ a launch whose record the writer has NOT landed is refused BY NAME — nothing spawned, the record removed (it went to the store writer, never written at the call)', r);
  const MX = mutantCopies('alo-land', repo).load('src/desktop-serve.js', anchored(DSRC, LAND_A, '    /* MUTANT: the parts spawn before the record lands */\n', 'alo-no-land'), 'alo-no-land');
  const x = await run(MX, 'land-cut');
  ok(!x.err && x.spawned >= 1, 'CONTROL (the wait cut, in a copy): the part SPAWNS for a record the disk does not hold — an orphan at a crash (red)', x);
  // 主开发's read wf_3c7fc92a-819: a Stop pressed WHILE the record lands — the launch never starts the parts of an ended record
  const ENDED_A = "    if (!(await landedBeforeSpawn())) refuseUnlanded(id, 'opening an app');\n    if (!M.isLiveState(rec.state) || stopping.has(id)) return view(rec);";
  ok(DSRC.split(ENDED_A).length === 2, 'control setup: the launch tests its record\'s state after the wait (found once)');
  const sw = await run(DS, 'stop-during-wait', { stopDuringWait: true });
  ok(!sw.err && sw.spawned === 0 && sw.state !== 'starting', '⑨ a Stop pressed while the launch waits for its record to land: NOTHING is spawned for the ended record', sw);
  // B-34bc: bringUp's first await (the window's start environment) asks the same question before anything starts — the copy
  // cuts BOTH, so this control still says what the launch's own check stops
  const START_A = '      const start = await (display.appStartEnv || displayFacts.appStartEnv)(base, { bins: f.bins });\n      if (gone()) return;\n';
  const MS = mutantCopies('alo-ended', repo).load('src/desktop-serve.js', anchored(anchored(DSRC, ENDED_A, "    if (!(await landedBeforeSpawn())) refuseUnlanded(id, 'opening an app');\n    /* MUTANT: the state is not tested after the wait */", 'alo-no-ended-check'), START_A, '      const start = await (display.appStartEnv || displayFacts.appStartEnv)(base, { bins: f.bins });\n      /* MUTANT: nor after the start environment */\n', 'alo-no-ended-check'), 'alo-no-ended-check');
  const swx = await run(MS, 'stop-during-wait-red', { stopDuringWait: true });
  ok(swx.spawned >= 1, 'CONTROL (the state check cut, in a copy): the parts of an ENDED record are spawned (then reaped) — red', swx);
  // the two other launch roads hold the same line BETWEEN their record's commit and their bring-up (a RemoteApp, a browser's display)
  const roadPinned = (src, fn, label) => {
    const at = src.indexOf(`  async function ${fn}(`); if (at < 0) return false;
    const body = src.slice(at, src.indexOf('\n  async function ', at + 10) > 0 ? src.indexOf('\n  async function ', at + 10) : undefined);
    const line = `    commit();\n    if (!(await landedBeforeSpawn())) refuseUnlanded(id, '${label}');\n    if (!M.isLiveState(rec.state) || stopping.has(id)) return view(rec);`;
    const i = body.indexOf(line), b = body.indexOf('bringUp(rec, f)');
    return i > 0 && b > i && body.split(line).length === 2;
  };
  ok(gateOf(roadPinned(DSRC, 'launchRemoteApp', 'opening a RemoteApp')) && verdictOf(roadPinned(DSRC, 'launchDisplay', "starting a browser\\'s display")), '⑨ the RemoteApp and the browser display roads each land their record, and test its state, BEFORE their bring-up (pinned)');
  const RA_A = "    if (!(await landedBeforeSpawn())) refuseUnlanded(id, 'opening a RemoteApp');\n", BD_A = "    if (!(await landedBeforeSpawn())) refuseUnlanded(id, 'starting a browser\\'s display');\n";
  ok(!roadPinned(anchored(DSRC, RA_A, '', 'alo-ra-cut'), 'launchRemoteApp', 'opening a RemoteApp') && !roadPinned(anchored(DSRC, BD_A, '', 'alo-bd-cut'), 'launchDisplay', "starting a browser\\'s display"), 'CONTROL (each road\'s line cut, in a copy of the text): its pin goes red');
});
await leg('⑩', async () => {
  console.log('⑩ lane lg-store-writes (主开发 2026-11-20 04:33Z) — the adoption judges only what the PREVIOUS life left: a launch made after a lift is never a leftover');
  // the scene: the record file held at the start, then read again — the hold lifts and the adoption starts, parked at its first await
  // (the fresh facts); a person presses Open in that window. Its record is THIS life's: it is neither torn down nor marked failed, it
  // starts. RED (anchored, in a copy): the adoption's own list cut — it judges the new record a dead hub's leftover.
  const DSRC = fs.readFileSync(path.join(repo, 'src/desktop-serve.js'), 'utf8');
  const PRIOR_A = "      if (!prior.has(rec.id)) continue;   // made after the adoption took its list: this life's, judged by its own bring-up\n";
  ok(DSRC.split(PRIOR_A).length === 2, 'control setup: the adoption skips a record it did not list (found once)');
  const noApps = { catalogRows: () => [], refreshCatalog: async () => {}, witnessRows: () => [] };
  // an app that simply STAYS (the singleton of ①–③ hands over to a copy still running and exits 0 — its own exit, not this leg's verdict)
  const STAY_ROW = { id: 'stay', label: 'Stay App', exec: script('stay-app', 'exec sleep 600'), args: [], category: 'app' };
  const run = async (mod, tag) => {
    const dataDir = path.join(root, `ds-${tag}`); fs.mkdirSync(dataDir, { recursive: true });
    const F = path.join(dataDir, 'desktop-apps.json'); fs.writeFileSync(F, JSON.stringify({ apps: {} }));
    let openGate = null; const parked = new Promise((r) => { openGate = r; });
    let adoptionAsked = false;
    const disp = { ...fakeDisplay, hostFacts: async (o) => { if (o && o.fresh) { adoptionAsked = true; await parked; } return fakeDisplay.hostFacts(o); } };   // only the adoption asks fresh
    const W = { dirty() { }, durable: async () => true, flushSync: () => ({ written: [], left: [] }), pending: () => false };
    const rf = fs.readFileSync;
    fs.readFileSync = function (f, ...a) { if (String(f) === F) throw Object.assign(new Error('EIO: a stand-in i/o error'), { code: 'EIO' }); return rf.call(this, f, ...a); };
    let ds; try { ds = mod.install({ dataDir, env, display: disp, backends: BACKENDS, registryRows: [STAY_ROW], log, now, tickMs: 3600e3, apps: noApps, writer: W, unreadRetry: { firstMs: 15, maxMs: 30 } }); } finally { fs.readFileSync = rf; }
    const held0 = ds.held();
    await until(() => !ds.held() && adoptionAsked, 5000);   // lifted; the adoption parked at its first await
    const before = kids.length;
    let v = null, err = null;
    try { v = await ds.launch({ appId: 'stay' }, {}); } catch (e) { err = e && e.code; }
    await until(() => kids.length > before, 3000);
    openGate();   // the adoption goes on and looks at its list
    await sleep(400);
    const rec = (v && ds._store().apps[v.id]) || {};
    const out = { held0, lifted: !ds.held(), err, state: rec.state || null, spawned: kids.length - before, lastError: rec.lastError || null };
    if (v) { try { await ds.stop(v.id, { why: 'user', force: true }); } catch { /* the finally kills the kids */ } }
    ds.shutdown();
    return out;
  };
  const r = await run(DS, 'lift-launch');
  ok(gateOf(r.held0) && gateOf(r.lifted) && !r.err && r.spawned >= 1 && (r.state === 'launching' || r.state === 'ready'), '⑩ a launch made between the lift and the adoption\'s first look is THIS life\'s: neither torn down nor marked failed — it starts', r);
  const MX = mutantCopies('alo-prior', repo).load('src/desktop-serve.js', anchored(DSRC, PRIOR_A, '      /* MUTANT: the adoption judges every live record */\n', 'alo-no-prior'), 'alo-no-prior');
  const x = await run(MX, 'lift-launch-red');
  ok(gateOf(x.lifted) && (x.state === 'failed' || x.state === 'exited'), 'CONTROL (the adoption\'s own list cut, in a copy): the person\'s new launch is judged a dead hub\'s leftover and ended (red)', x);
});
await leg('⑪', async () => {
  console.log('⑪ lane lg-store-writes (主开发 2026-11-20 04:59Z, list line 117\'s must) — a launch is told READY only once its adoptable record is ON DISK');
  // what the next life needs to adopt a running app (its parts' pids and start times, its display, its port) lands BEFORE «ready»:
  // a hub killed hard right after «ready» always adopts it (test-desktop-app-keeper §3 is the product's own crash proof). Here the
  // writer lands the launch's first record at once and HOLDS the landing the bring-up waits for: the record stays «launching»
  // with its parts recorded, and turns ready at the landing. RED (anchored, in a copy): the wait cut — «ready» over a record in the air.
  const DSRC = fs.readFileSync(path.join(repo, 'src/desktop-serve.js'), 'utf8');
  const READY_A = "      if (!(await landedForReady(id))) return;\n";
  ok(DSRC.split(READY_A).length === 2, 'control setup: the bring-up waits for its record\'s landing before «ready» (found once)');
  ok(DSRC.split("      commit();\n" + READY_A).length === 2, '⑪ the record is COMMITTED right before that wait (主开发 05:21Z): the record whose landing is awaited is the record as it stands then, by construction (a pin)');
  const noApps = { catalogRows: () => [], refreshCatalog: async () => {}, witnessRows: () => [] };
  const STAY2 = { id: 'stay2', label: 'Stay App 2', exec: script('stay-app-2', 'exec sleep 600'), args: [], category: 'app' };
  const run = async (mod, tag) => {
    let calls = 0, release = null;
    const W = { dirty() { }, durable: () => { calls++; return calls === 1 ? Promise.resolve(true) : new Promise((r) => { release = r; }); }, flushSync: () => ({ written: [], left: [] }), pending: () => true };
    const ds = mod.install({ dataDir: path.join(root, `ds-${tag}`), env, display: fakeDisplay, backends: BACKENDS, registryRows: [STAY2], log, now, tickMs: 3600e3, apps: noApps, writer: W });
    const v = await ds.launch({ appId: 'stay2' }, {});
    await until(() => release || ds._store().apps[v.id]?.state === 'ready', 8000);
    const held = { ...(ds._store().apps[v.id] || {}) };
    const out = { waitAsked: !!release, stateWhileInAir: held.state, partsRecorded: !!(held.pids && held.pids.x) };
    if (release) release(true);
    await until(() => ds._store().apps[v.id]?.state === 'ready', 5000);
    out.stateAtLanding = ds._store().apps[v.id]?.state;
    try { await ds.stop(v.id, { why: 'user', force: true }); } catch { /* the finally kills the kids */ }
    ds.shutdown();
    return out;
  };
  const r = await run(DS, 'ready-landed');
  ok(gateOf(r.waitAsked) && r.stateWhileInAir === 'launching' && gateOf(r.partsRecorded) && r.stateAtLanding === 'ready', '⑪ while its adoptable record is in the air the launch stays «launching» (its parts recorded); at the landing it is READY', r);
  const MX = mutantCopies('alo-ready', repo).load('src/desktop-serve.js', anchored(DSRC, READY_A, '      /* MUTANT: ready before the record lands */\n', 'alo-ready-early'), 'alo-ready-early');
  const x = await run(MX, 'ready-early');
  ok(!x.waitAsked && x.stateWhileInAir === 'ready', 'CONTROL (the wait cut, in a copy): «ready» while the record the next life needs is still in the air — a hard end then loses the app (red)', x);
});
await leg('⑧', async () => {
  console.log('⑧ lane launch-picture-size — a launch with a PICTURE SIZE: born pinned, a keeper-fixed rung started AT the pin, an unpinnable rung refused by name');
  const PINAPP = script('pin-app', 'exec sleep 600');
  const ROW = { id: 'pin-app', label: 'Pin App', exec: PINAPP, args: [], category: 'app' };
  const noApps = { catalogRows: () => [], refreshCatalog: async () => {}, witnessRows: () => [] };
  const geoms = [];
  const disp = { ...fakeDisplay, RECIPES: Object.freeze({ 'fake-x': async (ctx) => { geoms.push(ctx.geometry); return fakeDisplay.RECIPES['fake-x'](ctx); } }) };
  const withFit = (cell) => Object.freeze([Object.freeze({ ...BACKENDS[0], fit: Object.freeze({ fakex: cell }) })]);
  const ds = DS.install({ dataDir: path.join(root, 'ds-pin'), env, display: disp, backends: withFit('fixed'), registryRows: [ROW], log, now, tickMs: 3600e3, apps: noApps });
  const a = await ds.launch({ appId: 'pin-app', pin: '1280x720' }, {});
  ok(gateOf(a.pin) && a.pin.w === 1280 && a.pin.h === 720, 'pin 1280x720 ⇒ the record is BORN pinned (the launch\'s own answer carries it)', a.pin);
  const ra = await until(() => { const r = ds.get(a.id); return r && r.state === 'ready' ? r : null; });
  ok(gateOf(ra) && gateOf(ra.pin) && ra.pin.w === 1280 && geoms[0] === '1280x720', 'a keeper-fixed rung (fit \'fixed\' — Xvfb+x11vnc) starts its X server AT the pin', { geoms, pin: ra && ra.pin, err: ra && ra.lastError });
  const b = await ds.launch({ appId: 'pin-app', pin: null }, {});
  await until(() => { const r = ds.get(b.id); return r && r.state === 'ready' ? r : null; });
  ok(!('pin' in ds.get(b.id)) && geoms[1] === '1280x800', 'no pin ⇒ unpinned, and the X server takes the keeper\'s own geometry', { geoms, rec: ds.get(b.id).pin });
  let e1 = null; try { await ds.launch({ appId: 'pin-app', pin: '100x100' }, {}); } catch (x) { e1 = x; }
  ok(gateOf(e1) && e1.code === 'size_out_of_bounds' && gateOf(/width 100 is outside 320–7680 pixels/.test(e1.message)) && geoms.length === 2, 'a bad size ⇒ refused in parsePin\'s own words before anything starts', e1 && e1.message);
  for (const id of [a.id, b.id]) { try { await ds.stop(id, { why: 'user' }); } catch { } }
  ds.shutdown?.();
  for (const [cell, name] of [[null, 'no fit cell (this suite\'s rung)'], ['shared', 'the shared desktop\'s \'shared\''], ['follows', 'Xvnc\'s \'follows\'']]) {
    const d2 = DS.install({ dataDir: path.join(root, `ds-pin-${cell}`), env, display: disp, backends: cell ? withFit(cell) : BACKENDS, registryRows: [ROW], log, now, tickMs: 3600e3, apps: noApps });
    const n0 = d2.listApps().length, g0 = geoms.length;
    let e2 = null; try { await d2.launch({ appId: 'pin-app', pin: '1920x1080' }, {}); } catch (x) { e2 = x; }
    ok(gateOf(e2) && e2.code === 'pin_unsupported' && gateOf(/vnc-display \(fakex\)/.test(e2.message)) && gateOf(/the picture follows the pane/.test(e2.message)) && gateOf(/Follow the pane/.test(e2.message)) && d2.listApps().length === n0 && geoms.length === g0,
      `${name}: pin_unsupported BY NAME (the backend named, the picture follows the pane there, where to change it) — no record, no X server`, e2 && e2.message);
    d2.shutdown?.();
  }
});
await leg('⑫', async () => {
  console.log('⑫ B-34bc — every child of an app window starts with a UTF-8 character type when the hub names no locale; a person\'s own locale is never replaced');
  const LOC = script('locale-app', 'printf \'LC_ALL=%s\\nLC_CTYPE=%s\\nLANG=%s\\n\' "$LC_ALL" "$LC_CTYPE" "$LANG" > "$1"\nexec sleep 600');
  const noApps = { catalogRows: () => [], refreshCatalog: async () => {}, witnessRows: () => [] };
  const DSRC = fs.readFileSync(path.join(repo, 'src/desktop-serve.js'), 'utf8');
  const UTF8 = /\.utf-?8(@|$)/i;
  const pairs = (text, sep) => Object.fromEntries(text.split(sep).filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));
  const environOf = (pid) => { try { return pairs(fs.readFileSync(`/proc/${pid}/environ`, 'utf8'), '\0'); } catch { return null; } };
  const three = (e) => e && { LC_ALL: e.LC_ALL || '', LC_CTYPE: e.LC_CTYPE || '', LANG: e.LANG || '' };
  // the HELPERS' road: the window manager and the portal bus start from ctx.x11Env(...) — the leg's own recipe starts a REAL helper
  // child from it (the locale app itself: it writes the three names it was born with to its file at once, then sleeps), so what
  // it started with is read whatever the keeper does with an unrecorded member of the session afterwards
  let helperOut = null;
  const disp = { ...fakeDisplay, RECIPES: Object.freeze({ 'fake-x': async (ctx) => {
    if (helperOut) { const h = await D.spawnDetached(LOC, [helperOut], { env: ctx.x11Env(FAKE_DISPLAY), logFd: ctx.logFd, name: 'fake-helper' }).spawned; kids.push(h.pid); }
    return fakeDisplay.RECIPES['fake-x'](ctx);
  } }) };
  /** one launch of the locale app on `mod` under the hub env `envFn` ⇒ what the APPLICATION, the DISPLAY SERVER and the HELPERS' road started with */
  const run = async (mod, tag, envFn) => {
    const out = path.join(root, `locale-${tag}`); fs.rmSync(out, { force: true });
    const ROW = { id: 'locale', label: 'Locale App', exec: LOC, args: [out], category: 'app' };
    const ds = mod.install({ dataDir: path.join(root, `ds-loc-${tag}`), env: envFn, display: disp, backends: BACKENDS, registryRows: [ROW], log, now, tickMs: 3600e3, apps: noApps });
    helperOut = `${out}-helper`; fs.rmSync(helperOut, { force: true });
    try {
      const id = (await ds.launch({ appId: 'locale' }, {})).id;
      const r = await until(() => { const x = ds.get(id); return x && x.state !== 'launching' ? x : null; });
      await until(() => fs.existsSync(out) && fs.readFileSync(out, 'utf8').includes('LANG='));
      const app = fs.existsSync(out) ? three(pairs(fs.readFileSync(out, 'utf8').trim(), '\n')) : null;
      const server = r && r.pids && r.pids.x ? three(environOf(r.pids.x)) : null;
      try { await ds.stop(id, { why: 'user' }); } catch { }
      await until(() => fs.existsSync(helperOut) && fs.readFileSync(helperOut, 'utf8').includes('LANG='));
      const helpers = fs.existsSync(helperOut) ? three(pairs(fs.readFileSync(helperOut, 'utf8').trim(), '\n')) : null;
      return { state: r && r.state, app, server, helpers };
    } finally { ds.shutdown?.(); }
  };
  const bare = await run(DS, 'bare', env);   // this suite's hub env: PATH and HOME, no locale
  ok(bare.state === 'ready' && !!bare.app && gateOf(UTF8.test(bare.app.LC_CTYPE)) && !bare.app.LC_ALL && !bare.app.LANG && !!bare.server && bare.server.LC_CTYPE === bare.app.LC_CTYPE && !!bare.helpers && bare.helpers.LC_CTYPE === bare.app.LC_CTYPE,
    `⑫ a hub env that names no locale ⇒ the APPLICATION, its DISPLAY SERVER and a HELPER (a real child started from ctx.x11Env) all start with LC_CTYPE ${bare.app && bare.app.LC_CTYPE} (a UTF-8 character type), and no other locale name`, bare);
  const own = await run(DS, 'own', () => ({ ...env(), LANG: 'fr_FR.ISO-8859-1' }));
  ok(own.state === 'ready' && !!own.app && own.app.LANG === 'fr_FR.ISO-8859-1' && !own.app.LC_CTYPE && !own.app.LC_ALL && !!own.server && own.server.LANG === 'fr_FR.ISO-8859-1' && !own.server.LC_CTYPE && !!own.helpers && own.helpers.LANG === 'fr_FR.ISO-8859-1' && !own.helpers.LC_CTYPE,
    '⑫ a person\'s OWN locale (LANG=fr_FR.ISO-8859-1, not UTF-8) is never replaced: the app, its display server and the helper start with it, no LC_CTYPE added', own);
  const MX = mutantCopies('alo-locale', repo).load('src/desktop-serve.js', anchored(DSRC, '      base = start.env;\n', '', 'alo-no-locale'), 'alo-no-locale');
  const red = await run(MX, 'red', env);
  ok(red.state === 'ready' && !!red.app && !red.app.LC_CTYPE && !red.app.LC_ALL && !red.app.LANG && !!red.server && !red.server.LC_CTYPE && !!red.helpers && !red.helpers.LC_CTYPE,
    '⑫ RED CONTROL: bringUp without its start environment (a copy of desktop-serve) ⇒ the app, its display server and the helper start with NO locale at all — the C locale', red);
});
} catch (e) {
  ok(false, 'the suite ran to its end', e && e.stack);
} finally {
  try { keeper.shutdown(); } catch {}
  for (const id of keeper.listApps().filter((r) => M.isLiveState(r.state)).map((r) => r.id)) { try { await keeper.stop(id, { why: 'user' }); } catch {} }
  for (const p of kids) { try { process.kill(p, 'SIGKILL'); } catch {} }
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(`\n${fail ? `${fail} FAILED` : 'ALL PASS'} (${pass}) in ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
