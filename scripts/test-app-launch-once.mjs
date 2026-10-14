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
// ~3 s.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require(path.join(repo, 'src/desktop-display.js'));
const DS = require(path.join(repo, 'src/desktop-serve.js'));
const K = require(path.join(repo, 'src/server/desktop-app-keeper.js'));
const M = require(path.join(repo, 'src/desktop-apps.js'));

let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 1500) : ''}`); } return !!c; };
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
  ok(r1 && r1.state === 'ready' && r1.display === FAKE_DISPLAY, 'the first instance is ready on its display', r1 && { state: r1.state, err: r1.lastError });
  await until(() => fs.existsSync(path.join(home, '.single.lock')));
  ok(Number(fs.readFileSync(path.join(home, '.single.lock'), 'utf8')) === appPid(first.id), 'it holds the singleton lock with its own pid (the app part)');
  ok(r1 && r1.launchedBy && r1.launchedBy.kind === 'agent' && r1.launchedBy.name === 'Install app chrome', '③ the record says who started it: the agent session, by name', r1 && r1.launchedBy);
  const second = await keeper.launch({ appId: 'single' }); // the pre-fix card / an agent's open: no ifRunning
  const r2 = await ended(second.id);
  ok(r2 && r2.state === 'exited' && r2.exitCode === 0, 'the second start ended at once with code 0 (handed over)', r2 && { state: r2.state, code: r2.exitCode });
  const q = r2 && r2.quickExit;
  ok(q && q.afterMs < M.QUICK_EXIT_MS && q.code === 0 && q.signal === null, `quickExit on the record: ${q && q.afterMs} ms < ${M.QUICK_EXIT_MS}, code 0`, q);
  ok(q && q.running === first.id && q.runningDisplay === FAKE_DISPLAY, 'quickExit names the instance that still runs and where (the attach door)', q);
  const jl = lines.find((l) => l.startsWith(`[desktop] ${second.id} exited: application exited (code 0) — `));
  ok(jl && /— (?:(?:under 0\.1|\d+\.\d) s after ready|before ready, (?:under 0\.1|\d+\.\d) s after it started)$/.test(jl), 'the journal line carries WHEN it exited', jl || lines.filter((l) => l.includes(second.id)));
  await until(() => notices.length);
  ok(notices.length === 1 && notices[0].key === `desktop-app-quick-exit:${second.id}` && notices[0].opts && notices[0].opts.level === 'warn', 'ONE server notice under the record\'s own key', notices);
  ok(notices[0] && /Single App exited right after it started \(code 0, (?:under 0\.1|\d+\.\d) s after it started\) — the same program is already running on :4093 \(started by agent session Install app chrome\): open it from Apps\./.test(notices[0].text), 'the notice says where it runs and who started it', notices[0] && notices[0].text);
  const v2 = M.exitCloseVerdict(r2, { leased: false });
  ok(v2.close === false && v2.why === 'quick-exit', 'the window is NOT closed: it keeps the sentence (exitCloseVerdict quick-exit)', v2);
  ok(keeper.get(first.id).state === 'ready', 'the first instance is untouched');

  console.log('② the card\'s press on a running app ATTACHES — no second record, no second process');
  const before = keeper.listApps().length;
  const at = await keeper.launch({ appId: 'single', ifRunning: 'attach' });
  ok(at && at.attached === true && at.id === first.id && at.state === 'ready', 'ifRunning attach answers the RUNNING record (attached: true)', at && { id: at.id, attached: at.attached });
  ok(keeper.listApps().length === before, 'no new record was made', keeper.listApps().map((r) => r.id));
  ok(lines.some((l) => l === `[desktop] launch of single attached to ${first.id} (running on ${FAKE_DISPLAY}) — no second instance started`), 'the attach is journalled');
  let bad = null; try { await keeper.launch({ appId: 'single', ifRunning: 'again' }); } catch (e) { bad = e; }
  ok(bad && bad.code === 'bad-request' && /ifRunning must be "attach"/.test(bad.message), 'an unknown ifRunning is refused by name', bad && bad.message);
  const lv = M.launchVerdict({ row: { id: 'single', runsTwice: false }, apps: keeper.listApps(), host: 'local' });
  ok(lv.act === 'attach' && lv.target.id === first.id && lv.again === false && lv.running.length === 1, 'the card\'s verdict over the live list: attach, no "Open another" for a single-instance app', { act: lv.act, again: lv.again, n: lv.running.length });

});
await leg('① CONTROL', async () => {
  console.log('① CONTROL — an app that ran past QUICK_EXIT_MS: no quickExit, no notice, the window closes');
  const n0 = notices.length;
  const g = await keeper.launch({ appId: 'gate' }, { launchedBy: { kind: 'person' } });
  await settle(g.id);
  ok(keeper.get(g.id).launchedBy && keeper.get(g.id).launchedBy.kind === 'person', '③ a person\'s launch says so (launchedBy person)', keeper.get(g.id).launchedBy);
  await until(() => appPid(g.id));
  skew += 3000 + 1000; // the keeper's clock: the app has run past the quick window (QUICK_EXIT_MS = 3 s, pinned in test-desktop-apps)
  fs.writeFileSync(path.join(root, 'gate-open'), '1');
  const rg = await ended(g.id);
  ok(rg && rg.state === 'exited' && rg.exitCode === 0 && !rg.quickExit, 'it exited code 0 WITHOUT quickExit', rg && { state: rg.state, quickExit: rg.quickExit });
  await sleep(150);
  ok(notices.length === n0, 'no notice for it', notices.map((n) => n.key));
  const vg = M.exitCloseVerdict(rg, { leased: false });
  ok(vg.close === true && vg.why === 'exited', 'its window closes as before (exited)', vg);
  const jg = lines.find((l) => l.startsWith(`[desktop] ${g.id} exited: application exited (code 0) — `));
  ok(jg && /— (?:under 0\.1|\d+\.\d) s after ready$/.test(jg), 'its journal line carries the timing too', jg);

});
await leg('⑥', async () => {
  console.log('⑥ int267 seam — the person\'s own close inside QUICK_EXIT_MS is an exit, never a failed launch');
  const n0 = notices.length;
  const a = await keeper.launch({ appId: 'gate-asked' }, { launchedBy: { kind: 'person' } });
  await settle(a.id);
  await until(() => appPid(a.id));
  const st = await keeper.closeAsked(a.id); // the outer ✕'s door: stamped BEFORE close-window is sent
  ok(st && Number.isFinite(st.closeAskedAt) && st.closeAskedBy === 'window' && st.state === 'ready', 'closeAsked stamps the live record (closeAskedAt, closeAskedBy window) and leaves it running', st && { state: st.state, at: st.closeAskedAt, by: st.closeAskedBy });
  fs.writeFileSync(path.join(root, 'gate-asked-open'), '1'); // the app answers the ask at once
  const ra = await ended(a.id);
  ok(ra && ra.state === 'exited' && ra.exitCode === 0 && !ra.quickExit, 'its exit carries NO quickExit', ra && { state: ra.state, quickExit: ra.quickExit });
  ok(ra && ra.endedAt - (ra.appAt || ra.startedAt) < M.QUICK_EXIT_MS, `…though it ended inside the quick window (${ra && ra.endedAt - (ra.appAt || ra.startedAt)} ms < ${M.QUICK_EXIT_MS})`);
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
  ok(ru && ru.quickExit && ru.quickExit.afterMs < M.QUICK_EXIT_MS && !ru.closeAskedAt, 'quickExit on the unasked record', ru && { quickExit: ru.quickExit, asked: ru.closeAskedAt });
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
  ok(/router\.post\('\/api\/desktop\/apps\/:id\/close-asked',[\s\S]{0,400}?ctx\.keeper\.closeAsked\(req\.params\.id\)/.test(R) && DS.DESKTOP_SERVE_OPS.includes('close-asked'), 'POST /api/desktop/apps/:id/close-asked → keeper.closeAsked; a paired machine answers the close-asked op');
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
  ok(cr && cr.browser === 'chromium' && cr.browserBy === 'exec' && cr.runsTwice === true, 'the installed Chrome row is served as a chromium-family browser that runs twice', cr && { browser: cr.browser, by: cr.browserBy, twice: cr.runsTwice });
  ok(fr && !fr.browser && fr.runsTwice === false, 'CONTROL: a browser through `flatpak run` stays as typed (no family, one instance)', fr && { browser: fr.browser, twice: fr.runsTwice });
  const c1 = await ds.launch({ appId: 'app.chrome' }, {});
  await until(() => fs.existsSync(path.join(root, 'chrome-argv')));
  const argv = fs.existsSync(path.join(root, 'chrome-argv')) ? fs.readFileSync(path.join(root, 'chrome-argv'), 'utf8').trim().split('\n') : [];
  const prof = ds.get(c1.id).profileDir;
  ok(prof && prof.startsWith(path.join(dataDir, 'desktop-apps') + '/') && argv.includes(`--user-data-dir=${prof}`), 'its argv carries --user-data-dir=<the session\'s own profile under the keeper\'s data dir>', { prof, argv });
  ok(!argv.some((a) => a.includes(path.join(home, '.config/google-chrome'))) && ds.get(c1.id).browser === 'chromium', 'never the user\'s default ~/.config/google-chrome', argv);

  console.log('⑤ the lock fact — who holds a browser\'s default profile');
  const lockDir = path.join(home, '.config/google-chrome');
  fs.mkdirSync(lockDir, { recursive: true });
  const lockAt = (target) => { try { fs.unlinkSync(path.join(lockDir, 'SingletonLock')); } catch {} if (target) fs.symlinkSync(target, path.join(lockDir, 'SingletonLock')); };
  const live = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' }); kids.push(live.pid);
  lockAt(`${os.hostname()}-${live.pid}`);
  const f1 = await D.profileLockFact({ home, dir: '.config/google-chrome' });
  ok(f1 && f1.live === true && f1.pid === live.pid && f1.sid === live.pid, 'a lock to a live pid of THIS host ⇒ live, with its session id (a setsid leader names itself)', f1);
  const dead = spawn('true'); await new Promise((r) => dead.once('exit', r));
  lockAt(`${os.hostname()}-${dead.pid}`);
  const f2 = await D.profileLockFact({ home, dir: '.config/google-chrome' });
  ok(f2 && f2.live === false && f2.pid === dead.pid, 'a dead pid ⇒ live false', f2);
  lockAt(`another-host-${live.pid}`);
  ok((await D.profileLockFact({ home, dir: '.config/google-chrome' })) === null, 'another host\'s lock ⇒ null (its pid says nothing here)');
  lockAt(null);
  ok((await D.profileLockFact({ home, dir: '.config/google-chrome' })) === null, 'no lock ⇒ null');
  await until(() => ds.get(c1.id) && ds.get(c1.id).state === 'ready');
  lockAt(`${os.hostname()}-${ds.get(c1.id).pids.app}`); // as an OLDER launch on the default profile would hold it
  const L1 = await ds.list();
  const cr1 = L1.registry.find((r) => r.id === 'app.chrome');
  ok(cr1 && cr1.lock && cr1.lock.live === true && cr1.lock.recordId === c1.id, 'list() names the record whose app process holds the default profile', cr1 && cr1.lock);
  const lv2 = M.launchVerdict({ row: { ...cr1, id: 'seen.other' }, apps: L1.apps, host: 'local' });
  ok(lv2.act === 'attach' && lv2.target.id === c1.id && lv2.again === true, 'the card\'s verdict attaches to it — even from another row of the same browser (a typed command, an older launch)', { act: lv2.act, target: lv2.target && lv2.target.id });
  lockAt(`${os.hostname()}-${live.pid}`);
  const cr2 = (await ds.list()).registry.find((r) => r.id === 'app.chrome');
  ok(cr2 && cr2.lock && cr2.lock.live && cr2.lock.recordId === null, 'a holder outside every record is named without a record', cr2 && cr2.lock);
  await ds.stop(c1.id, { why: 'user' });
  ds.shutdown?.();
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
process.exit(fail ? 1 : 0);
