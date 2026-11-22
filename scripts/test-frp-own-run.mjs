#!/usr/bin/env node
// A RELAY CLIENT THAT IS NOT THIS MANAGER'S OWN RUN IS NEVER JUDGED, RESTARTED NOR SIGNALLED (B-1217, 主开发 r1775, lane bl-machines-b).
// The relay folder (~/.vibespace/plugins/frp) is the HOME's: two instances under one home — a second instance beside the one that runs,
// a worktree hub started by hand — share its pid file, its log and its config; the release let the second one's login watch read the
// first one's client, restart it under ITS OWN identity, and take the first instance's published address away.
// Fast, in-process: the REAL plugin (src/plugins/frp.js create(h)) over a hand-made host in a temp folder; each relay client a
// STAND-IN — a link named frpc to a SHELL waiting in a builtin read on this suite's own FIFO (its command line says frpc; no child),
// started by this suite and ended by the pid and start it holds, at EVERY exit (its end, a throw, a signal); no relay, no net. WHY A
// SHELL (主开发 r1977's find on the daemon suite): a tool that checks its own name refuses to run as «frpc» (uutils' multicall tail).
//  ① the verdict (ownRunOf, read from the file): its own pid and start ⇒ own; another pid, or its pid with another start, or a run
//     another data folder recorded (a copy of data/) ⇒ not; no recorded run ⇒ own ONLY when its record shows an older build's own
//     start (desiredUp) — an instance that never started a client owns none
//  ② THE KILL LAW: stop() over another run's client leaves it alive and its pid file in place, said once; over its own run it ends
//     it — RED the release's stop (the pid file's client signalled)
//  ③ THE WATCH: a manager whose watch was armed over its own run, the home's client now ANOTHER run's and the newest login line of
//     the home's log a refusal of the shared token: that client is never judged nor restarted (it lives; no trial stamped), said
//     once — over its OWN run the same line restarts it (the release's road, kept) — RED the release's watch (another run's ended)
//  ④ A FRESH INSTANCE (its data folder never started a client) over another instance's running client: a settings change and a
//     Stop never touch it — the Stop refused BY NAME (relay_held_elsewhere), the status «held elsewhere», not «running» — RED the
//     release's reading of «no recorded run» (its own): the other instance's client ended
//  (the reds plant the release's roads back together — stop()'s and start()'s guards each still cover the harm alone)
// Run: node scripts/test-frp-own-run.mjs
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); } return !!fn(); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'frp-own-run-'));
const PI = require(path.join(REPO, 'src/proc-identity.js'));
const SRC = fs.readFileSync(path.join(REPO, 'src/plugins/frp.js'), 'utf8');
const MC = mutantCopies('frp-own-run', REPO);
const SHELL = ['/usr/bin/dash', '/bin/dash', '/usr/bin/bash', '/bin/bash'].find((p) => fs.existsSync(p));   // never a multicall binary under another name
const BIN = path.join(T, 'bin'); fs.mkdirSync(BIN); fs.symlinkSync(SHELL, path.join(BIN, 'frpc'));   // the stand-in client
const HOLD = path.join(T, 'hold.fifo'); execFileSync('mkfifo', [HOLD], { stdio: 'ignore' });   // a FIFO no one writes: its open waits (an interruptible sleep)
const kids = new Set(), kidStarts = new Map();   // every stand-in this suite started, with the start it had
const client = async () => { const c = spawn(path.join(BIN, 'frpc'), ['-c', 'read x < "$1"', 'frpc', HOLD], { stdio: 'ignore' }); await new Promise((r) => c.once('spawn', r)); kids.add(c.pid); kidStarts.set(c.pid, PI.starttimeOf(c.pid)); return c.pid; };
const ours = (pid) => kidStarts.get(pid) != null && PI.starttimeOf(pid) === kidStarts.get(pid);   // the pid this suite holds, still that process
const endKids = () => { for (const pid of kids) { if (ours(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { } } } };
process.on('exit', endKids);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.once(sig, () => { endKids(); try { fs.rmSync(T, { recursive: true, force: true }); } catch { } process.kill(process.pid, sig); });
const alive = (pid) => { const st = PI.statOf(pid); return !!st && st[0] !== 'Z'; };
const said = []; const log0 = console.log, warn0 = console.warn;
console.log = (...a) => { said.push(a.map(String).join(' ')); log0(...a); }; console.warn = (...a) => { said.push(a.map(String).join(' ')); warn0(...a); };
const OTHER = (l) => l.includes('another instance holds this home\'s relay folder');
// a host as the plugin manager hands it (src/plugins.js): its folder, its record, nothing configured (no relay is ever reached)
const hostOf = (tag, rec) => { const dir = path.join(T, 'frp-' + tag); fs.mkdirSync(dir, { recursive: true }); return { dir, dataDir: path.join(T, 'data-' + tag), sealedDir: path.join(T, 'sealed-' + tag), vault: null, opts: {}, settings: () => ({}), writeSettings() { }, probeProto: async () => 'http', peek: () => rec, rec: () => rec, save() { }, notify() { } }; };
const REFUSED = "2026-11-21 23:00:00 [W] [client/service.go:319] connect to server error: token in login doesn't match token from configuration\n";
const SI = global.setInterval;
try {
  console.log('① the verdict: ownRunOf');
  const i = SRC.indexOf('function ownRunOf('), j = SRC.indexOf('\n}\n', i);
  if (i < 0 || j < i) throw new Error('ownRunOf moved');
  const ownRunOf = new Function(`${SRC.slice(i, j + 2)}\nreturn ownRunOf;`)();
  const st = (v) => () => v;
  ok(ownRunOf({ pid: 10, start: 5 }, 10, st(5)) === true && ownRunOf({ pid: 10, start: 5 }, 11, st(5)) === false && ownRunOf({ pid: 10, start: 5 }, 10, st(6)) === false
    && ownRunOf({ pid: 10 }, 10, st(6)) === true && ownRunOf(null, 10, st(5)) === false && ownRunOf(null, 10, st(5), { legacy: true }) === true && ownRunOf({ pid: 10, start: 5 }, 10, st(null)) === true && ownRunOf({ pid: 10 }, 0, st(5)) === false
    && ownRunOf({ pid: 10, start: 5, by: '/a/data' }, 10, st(5), { by: '/b/data' }) === false && ownRunOf({ pid: 10, start: 5, by: '/a/data' }, 10, st(5), { by: '/a/data' }) === true,
    '① its own pid and start ⇒ own; another pid, or its pid with another start (the pid came back), or a run another data folder recorded ⇒ not; no start recorded ⇒ by its pid; NO run recorded ⇒ own only by an older build\'s own start (legacy); a start that cannot be read ⇒ by its pid');

  console.log('② the kill law: stop()');
  const stopOver = async (FRP, tag, { own }) => {
    const rec = { enabled: false }, h = hostOf(tag, rec), v = FRP.create(h);
    const pid = await client(); fs.writeFileSync(path.join(h.dir, 'frpc.pid'), String(pid));
    rec.frpcRun = own ? { pid, at: Date.now(), start: PI.starttimeOf(pid) } : { pid: 999999, at: Date.now() - 3600e3, start: 1 };
    const s0 = said.filter(OTHER).length, codes = [];
    for (let k = 0; k < 2; k++) { try { v.stop(); codes.push('stopped'); } catch (e) { codes.push(e && e.code); } }   // pressed twice: said ONCE
    await sleep(150);
    return { alive: alive(pid), pidFile: fs.existsSync(path.join(h.dir, 'frpc.pid')), saidOther: said.filter(OTHER).length - s0, codes: codes.join(' ') };
  };
  const FRP = require(path.join(REPO, 'src/plugins/frp.js'));
  const sOther = await stopOver(FRP, 'stop-other', { own: false }), sOwn = await stopOver(FRP, 'stop-own', { own: true });
  const RELSTOP = MC.load('src/plugins/frp.js', anchored(SRC, '        const any = frpDaemonPid(), pid = ownRunPid();', '        const any = frpDaemonPid(), pid = any;', 'B-1217 the release\'s stop'), 'rel-stop');
  const sOtherR = await stopOver(RELSTOP, 'stop-other-red', { own: false });
  ok(sOther.alive && sOther.pidFile && sOther.saidOther === 1 && sOther.codes === 'relay_held_elsewhere relay_held_elsewhere' && !sOwn.alive && !sOwn.pidFile && sOwn.codes.startsWith('stopped') && !sOtherR.alive,
    `② THE KILL LAW: stop() over ANOTHER run's client leaves it alive (${sOther.alive}) and its pid file in place (${sOther.pidFile}), refused BY NAME (${sOther.codes}), said once (${sOther.saidOther}); over its own run it ends it (${!sOwn.alive}) — RED the release's stop: another run's client signalled (${!sOtherR.alive})`, { sOther, sOwn, sOtherR });

  console.log('③ the watch over a home whose client is now another run\'s');
  global.setInterval = (fn, ms, ...a) => SI(fn, ms === 60e3 ? 50 : ms, ...a);   // the plugin's 60-s login watch, quick
  const watchOver = async (FRPm, tag, { own }) => {
    const rec = { enabled: false, frpcIdentity: 'instance', frpcKnock: true, frpcLogFrom: 0 }, h = hostOf(tag, rec), v = FRPm.create(h);
    const mine = await client(); fs.writeFileSync(path.join(h.dir, 'frpc.pid'), String(mine));
    rec.frpcRun = { pid: mine, at: Date.now(), start: PI.starttimeOf(mine) };
    v.bootReplay();   // a frpc a previous life started: its login is watched again (its own run)
    let pid = mine;
    if (!own) {   // another instance under this home: its client replaces this one's (a stop of its own, a start of its own)
      try { process.kill(mine, 'SIGKILL'); } catch { } await until(() => !alive(mine));
      pid = await client(); fs.writeFileSync(path.join(h.dir, 'frpc.pid'), String(pid));
    }
    fs.appendFileSync(path.join(h.dir, 'frpc.log'), REFUSED);   // the newest login line in the home's log: the shared token refused
    const s0 = said.filter(OTHER).length;
    await sleep(500);   // ten ticks of the watch
    const r = { alive: alive(pid), trial: rec.knockTrialAt != null, saidOther: said.filter(OTHER).length - s0 };
    try { v.stop(); } catch { }   // (over another run: refused by name — ②)
    return r;
  };
  const wOther = await watchOver(FRP, 'watch-other', { own: false }), wOwn = await watchOver(FRP, 'watch-own', { own: true });
  const RELWATCH = MC.load('src/plugins/frp.js', [
    ["      if (!ownRunPid() || !['instance', 'cluster'].includes(p.frpcIdentity)) { endDrop(); return null; }", "      if (!frpDaemonPid() || !['instance', 'cluster'].includes(p.frpcIdentity)) { endDrop(); return null; }"],   // stale-pins: kept (the release's road, planted back in the red control)
    ['      if (frpDaemonPid() && !ownRunPid()) return Promise.resolve();   // B-1217: another instance\'s run is never restarted from here\n', ''],
    ['        const any = frpDaemonPid(), pid = ownRunPid();', '        const any = frpDaemonPid(), pid = any;'],
    ['        if (ownRunPid()) watchLogin(true);', '        if (frpDaemonPid()) watchLogin(true);'],   // stale-pins: kept (the release's road, planted back in the red control)
  ].reduce((s, [a, b], k) => anchored(s, a, b, `B-1217 the release's watch ${k + 1}`), SRC), 'rel-watch');
  const wOtherR = await watchOver(RELWATCH, 'watch-other-red', { own: false });
  global.setInterval = SI;
  ok(wOther.alive && !wOther.trial && wOther.saidOther === 1 && !wOwn.alive && wOwn.trial && !wOtherR.alive && wOtherR.trial,
    `③ THE WATCH: the home's client is now ANOTHER run's and its log's newest login line refuses the shared token: never judged nor restarted — it lives (${wOther.alive}), no trial stamped (${!wOther.trial}), said once (${wOther.saidOther}); over its OWN run the same line restarts it (the release's road kept: ended ${!wOwn.alive}, trial ${wOwn.trial}) — RED the release's watch: another instance's client ended (${!wOtherR.alive}), a trial stamped on this record (${wOtherR.trial})`,
    { wOther, wOwn, wOtherR });

  console.log('④ a fresh instance over another instance\'s client');
  const freshOver = async (FRPm, tag) => {
    const rec = { enabled: false }, h = hostOf(tag, rec), v = FRPm.create(h);   // its data folder never started a client: no run, no desiredUp
    const pid = await client(); fs.writeFileSync(path.join(h.dir, 'frpc.pid'), String(pid));
    v.applySettings(); await sleep(900);   // a relay row saved on this instance (the release: stop, then a start 800 ms later)
    let code = 'stopped'; try { v.stop(); } catch (e) { code = e && e.code; }
    await sleep(150);
    let st = {}; try { st = v.status(); } catch { }
    return { alive: alive(pid), code, held: !!st.heldElsewhere, running: !!st.running };
  };
  const fr = await freshOver(FRP, 'fresh');
  const RELFRESH = MC.load('src/plugins/frp.js', anchored(SRC, '  if (!run || !run.pid) return !!legacy;\n', '  if (!run || !run.pid) return true;\n', 'B-1217 the release\'s reading of no recorded run'), 'rel-fresh');
  const frR = await freshOver(RELFRESH, 'fresh-red');
  ok(fr.alive && fr.code === 'relay_held_elsewhere' && fr.held && !fr.running && !frR.alive,
    `④ a FRESH instance (no run of its own) over another instance's client: a settings change and a Stop never touch it (it lives: ${fr.alive}); the Stop refused by name (${fr.code}); the status «held elsewhere» (${fr.held}), not «running» (${fr.running}) — RED «no recorded run» read as its own (the release): the other instance's client ended (${!frR.alive})`, { fr, frR });
} finally {
  global.setInterval = SI; console.log = log0; console.warn = warn0;
  endKids();   // by the pid and start this suite holds
  const kidsLeft = () => [...kids].filter((pid) => alive(pid) && ours(pid));
  await until(() => kidsLeft().length === 0, 3000);
  ok(kidsLeft().length === 0, `the suite ends its own stand-in clients (${kids.size}; none left)`, kidsLeft());
  fs.rmSync(T, { recursive: true, force: true });
}
report();
