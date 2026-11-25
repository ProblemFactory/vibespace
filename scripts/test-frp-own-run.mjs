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
//  ⑤ (its round, 主开发 r2175) a client LEFT BEHIND by an instance gone for good: Start refused by name; status says what holds it;
//     the person's take-over ends THAT process (a bystander lives) and starts its own; refused with nothing ended: a process that
//     moved, a reused pid (another start, or none sent), a pid-file process not this home's relay client, a start that cannot run —
//     RED the release's silent «running»; RED each guard cut
//  ⑥ a data folder moved behind a link, and one that no longer exists (the install moved): still its own — RED the path string;
//     the folders asked OFF THE LOOP, at the start, never per ask — RED a resolve per ask; «gone» by two answers a minute apart,
//     the second the plugin's own ask: another instance's folder missing once (a mount's gap) is not its own — RED one answer read
//     as gone; RED no confirming ask; RED the confirm lost behind an ask in flight; a gone folder that answers again is a path again —
//     RED gone kept; the login watch armed by
//     the answer that makes the run its own — RED never armed
//  ⑦ a take-over asked by anything but the person's press: refused, nothing touched — RED unattended
//  ⑧ (r2638) THE MINUTE NOBODY KNOWS: a settings change while its folder's answer is out is HELD and runs as one restart when the
//     answer makes the run its own (a moved install; a gone folder's minute) — RED the held restart never replayed; dropped when it
//     shows another instance's client (it lives, never restarted); a Stop in that minute is refused «not yet known» — RED the old words
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
const client = async (conf = '') => { const c = spawn(path.join(BIN, 'frpc'), ['-c', 'read x < "$1"', 'frpc', HOLD, ...(conf ? [conf] : [])], { stdio: 'ignore' }); await new Promise((r) => c.once('spawn', r)); kids.add(c.pid); kidStarts.set(c.pid, PI.starttimeOf(c.pid)); return c.pid; };
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
  const k0 = SRC.indexOf('function takeoverEnded('), k1 = SRC.indexOf('\n}\n', k0);   // r2329 (4): an unreadable entry is NOT ended
  if (k0 < 0 || k1 < k0) throw new Error('takeoverEnded moved');
  const endedOf = (text) => new Function(`${text}\nreturn takeoverEnded;`)();
  const TE = endedOf(SRC.slice(k0, k1 + 2)), TER = endedOf(anchored(SRC.slice(k0, k1 + 2), '  if (st === undefined) return false;\n', '  if (st === undefined) return true;\n', 'B-1217 an unreadable entry read as ended'));
  ok(TE(null, null, 5) === true && TE(undefined, null, 5) === false && TE(undefined, 5, 5) === false && TE(['Z'], 5, 5) === true && TE(['S'], 6, 5) === true && TE(['S'], 5, 5) === false && TE(['S'], null, 5) === false && TER(undefined, null, 5) === true,
    '① the take-over\'s end (r2329 (4)): no such process or a zombie or another start ⇒ ended; its stat or its start unreadable ⇒ NOT ended (unknown is never «it ended») — RED an unreadable entry read as ended');
  ok(ownRunOf({ pid: 10, start: 5 }, 10, st(5)) === true && ownRunOf({ pid: 10, start: 5 }, 11, st(5)) === false && ownRunOf({ pid: 10, start: 5 }, 10, st(6)) === false
    && ownRunOf({ pid: 10 }, 10, st(6)) === true && ownRunOf(null, 10, st(5)) === false && ownRunOf(null, 10, st(5), { legacy: true }) === true && ownRunOf({ pid: 10, start: 5 }, 10, st(null)) === true && ownRunOf({ pid: 10 }, 0, st(5)) === false
    && ownRunOf({ pid: 10, start: 5, by: '/a/data' }, 10, st(5), { by: '/b/data' }) === false && ownRunOf({ pid: 10, start: 5, by: '/a/data' }, 10, st(5), { by: '/a/data' }) === true
    && ownRunOf({ pid: 10, start: 5, by: '/a/data' }, 10, st(5), { by: '/b/data', sameBy: () => true }) === true && ownRunOf({ pid: 10, start: 5, by: '/a/data' }, 10, st(5), { by: '/b/data', sameBy: () => false }) === false,
    '① its own pid and start ⇒ own; another pid, or its pid with another start (the pid came back), or a run another data folder recorded ⇒ not; no start recorded ⇒ by its pid; NO run recorded ⇒ own only by an older build\'s own start (legacy); a start that cannot be read ⇒ by its pid');

  console.log('② the kill law: stop()');
  const stopOver = async (FRP, tag, { own }) => {
    const rec = { enabled: false }, h = hostOf(tag, rec), v = FRP.create(h);
    const pid = await client(); fs.writeFileSync(path.join(h.dir, 'frpc.pid'), String(pid));
    rec.frpcRun = own ? { pid, at: Date.now(), start: PI.starttimeOf(pid) } : { pid: 999999, at: Date.now() - 3600e3, start: 1 };
    const s0 = said.filter(OTHER).length, codes = [];
    for (let k = 0; k < 2; k++) { try { v.stop(); codes.push('stopped'); } catch (e) { codes.push(e && e.code); } }   // pressed twice: said ONCE
    await until(() => !alive(pid), own || FRP !== FRP_REAL ? 2000 : 150);   // its round: its own end waited on (the fact); over another's, a short look
    return { alive: alive(pid), pidFile: fs.existsSync(path.join(h.dir, 'frpc.pid')), saidOther: said.filter(OTHER).length - s0, codes: codes.join(' ') };
  };
  const FRP = require(path.join(REPO, 'src/plugins/frp.js')), FRP_REAL = FRP;
  const sOther = await stopOver(FRP, 'stop-other', { own: false }), sOwn = await stopOver(FRP, 'stop-own', { own: true });
  const RELSTOP = MC.load('src/plugins/frp.js', anchored(SRC, '        const any = frpDaemonPid(), pid = ownRunPid();', '        const any = frpDaemonPid(), pid = any;', 'B-1217 the release\'s stop'), 'rel-stop');
  const sOtherR = await stopOver(RELSTOP, 'stop-other-red', { own: false });
  ok(sOther.alive && sOther.pidFile && sOther.saidOther === 1 && sOther.codes === 'relay_held_elsewhere relay_held_elsewhere' && !sOwn.alive && !sOwn.pidFile && sOwn.codes.startsWith('stopped') && !sOtherR.alive,
    `② THE KILL LAW: stop() over ANOTHER run's client leaves it alive (${sOther.alive}) and its pid file in place (${sOther.pidFile}), refused BY NAME (${sOther.codes}), said once (${sOther.saidOther}); over its own run it ends it (${!sOwn.alive}) — RED the release's stop: another run's client signalled (${!sOtherR.alive})`, { sOther, sOwn, sOtherR });

  console.log('③ the watch over a home whose client is now another run\'s');
  let ticks = 0;
  const wHeld = [];   // its third read: each case's watch ended with its case (a refused Stop leaves the watch it never touched)
  global.setInterval = (fn, ms, ...a) => { if (ms !== 60e3) return SI(fn, ms, ...a); const t = SI((...x) => { ticks++; fn(...x); }, 50, ...a); wHeld.push(t); return t; };   // the plugin's 60-s login watch, quick, its ticks counted
  const watchOver = async (FRPm, tag, { own }) => {
    const rec = { enabled: false, frpcIdentity: 'instance', frpcKnock: true, frpcLogFrom: 0 }, h = hostOf(tag, rec), v = FRPm.create(h);
    const mine = await client(); fs.writeFileSync(path.join(h.dir, 'frpc.pid'), String(mine));
    rec.frpcRun = { pid: mine, at: Date.now(), start: PI.starttimeOf(mine) };
    v.bootReplay();   // a frpc a previous life started: its login is watched again (its own run)
    let pid = mine;
    if (!own) {   // another instance under this home: its client replaces this one's (a stop of its own, a start of its own)
      if (ours(mine)) { try { process.kill(mine, 'SIGKILL'); } catch { } } await until(() => !alive(mine));   // this suite's own stand-in, by its held pid and start
      pid = await client(); fs.writeFileSync(path.join(h.dir, 'frpc.pid'), String(pid));
    }
    fs.appendFileSync(path.join(h.dir, 'frpc.log'), REFUSED);   // the newest login line in the home's log: the shared token refused
    const s0 = said.filter(OTHER).length;
    const t0 = ticks; await until(() => ticks >= t0 + 5 && (rec.knockTrialAt == null || !alive(pid)), 3000);   // its round: ten ticks of the watch counted, and a restart's end waited on (never a fixed sleep)
    const r = { alive: alive(pid), trial: rec.knockTrialAt != null, saidOther: said.filter(OTHER).length - s0 };
    try { v.stop(); } catch { }   // (over another run: refused by name — ②)
    for (const t of wHeld.splice(0)) clearInterval(t);
    return r;
  };
  const wOther = await watchOver(FRP, 'watch-other', { own: false }), wOwn = await watchOver(FRP, 'watch-own', { own: true });
  const RELWATCH = MC.load('src/plugins/frp.js', [
    ["      if (!ownRunPid() || !['instance', 'cluster'].includes(p.frpcIdentity)) { endDrop(); return null; }", "      if (!frpDaemonPid() || !['instance', 'cluster'].includes(p.frpcIdentity)) { endDrop(); return null; }"],   // stale-pins: kept (the release's road, planted back in the red control)
    ['      if (frpDaemonPid() && !ownRunPid()) { heldRestart(opts, why); return Promise.resolve(); }   // B-1217: another instance\'s run is never restarted from here; r2638: one whose owner is not yet known — held\n', ''],
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
    v.applySettings(); await until(() => !alive(pid), FRPm === FRP ? 300 : 2000);   // a relay row saved on this instance (the release: stop, then a start 800 ms later) — its end waited on
    let code = 'stopped'; try { v.stop(); } catch (e) { code = e && e.code; }
    await until(() => !alive(pid), 150);
    let st = {}; try { st = v.status(); } catch { }
    return { alive: alive(pid), code, held: !!st.heldElsewhere, running: !!st.running };
  };
  const fr = await freshOver(FRP, 'fresh');
  const RELFRESH = MC.load('src/plugins/frp.js', anchored(SRC, '  if (!run || !run.pid) return !!legacy;\n', '  if (!run || !run.pid) return true;\n', 'B-1217 the release\'s reading of no recorded run'), 'rel-fresh');
  const frR = await freshOver(RELFRESH, 'fresh-red');
  ok(fr.alive && fr.code === 'relay_held_elsewhere' && fr.held && !fr.running && !frR.alive,
    `④ a FRESH instance (no run of its own) over another instance's client: a settings change and a Stop never touch it (it lives: ${fr.alive}); the Stop refused by name (${fr.code}); the status «held elsewhere» (${fr.held}), not «running» (${fr.running}) — RED «no recorded run» read as its own (the release): the other instance's client ended (${!frR.alive})`, { fr, frR });

  console.log('⑤ a client left behind by an instance gone for good (its round, 主开发 r2175)');
  // this instance's own client is gone; the pid file names a client another instance (a worktree hub, ended since) left behind:
  // Start is refused BY NAME; status says WHAT holds it; the person's take-over ends THAT process only (a bystander lives) and then
  // starts this instance's own. Each guard of the take-over on its own home, each with its own red: a process that moved since the
  // page read it, the same pid with another start (a reused pid), no start sent, a pid-file process that is not this home's relay
  // client, a start that cannot run (refused before anything is ended)
  const homeOf = async (FRPm, tag) => {
    const rec = { enabled: false, desiredUp: true }, h = hostOf(tag, rec), v = FRPm.create(h);
    rec.frpcRun = { pid: 999999, at: Date.now() - 3600e3, start: 1, by: path.resolve(h.dataDir) };   // its own run: gone
    const conf = path.join(h.dir, 'frpc.toml');
    const other = await client(conf); fs.writeFileSync(path.join(h.dir, 'frpc.pid'), String(other));
    let started = 0; const realStart = v.start;
    v.canStart = () => null; v.start = () => { started++; return { starting: true }; };   // this home has no relay: its own start stood in
    return { rec, h, v, conf, other, realStart, started: () => started };
  };
  const take = async (H, args) => { try { const r = await H.v.takeOver({ press: true, ...args }); return r && r.tookOver ? 'took' : 'other'; } catch (e) { return (e && e.code) || 'threw'; } };
  const heldOf = (H) => H.v.status().held || {};
  const startOf0 = (H) => { try { const r = H.realStart(); return r && r.running ? 'running' : 'started'; } catch (e) { return (e && e.code) || 'threw'; } };
  const A = await homeOf(FRP, 'left'), startCode = startOf0(A), stA = A.v.status(), bystander = await client(A.conf);
  const caseMoved = async (M, tag) => { const H = await homeOf(M, tag), hd = heldOf(H), to = await client(H.conf); fs.writeFileSync(path.join(H.h.dir, 'frpc.pid'), String(to)); const code = await take(H, { pid: hd.pid, start: hd.start }); await until(() => !alive(to), M === FRP ? 100 : 2000); return { code, lives: alive(to) }; };
  const caseStart = async (M, tag) => { const H = await homeOf(M, tag), hd = heldOf(H); const code = await take(H, { pid: hd.pid, start: hd.start + 1 }), none = M === FRP ? await take(H, { pid: hd.pid }) : 'n/a'; await until(() => !alive(H.other), M === FRP ? 100 : 2000); return { code, none, lives: alive(H.other) }; };
  const caseKind = async (M, tag) => { const H = await homeOf(M, tag), not = await client(); fs.writeFileSync(path.join(H.h.dir, 'frpc.pid'), String(not)); const hd = heldOf(H); const code = await take(H, { pid: hd.pid, start: hd.start }); await until(() => !alive(not), M === FRP ? 100 : 2000); return { code, lives: alive(not) }; };
  const caseCannot = async (M, tag) => { const H = await homeOf(M, tag); H.v.canStart = () => Object.assign(new Error('a revoked identity'), { code: 'relay_revoked' }); const hd = heldOf(H); const code = await take(H, { pid: hd.pid, start: hd.start }); await until(() => !alive(H.other), M === FRP ? 100 : 2000); return { code, lives: alive(H.other) }; };
  const mv = await caseMoved(FRP, 'left-moved'), sx = await caseStart(FRP, 'left-start'), kd = await caseKind(FRP, 'left-kind'), cn = await caseCannot(FRP, 'left-cannot');
  const aTook = await take(A, { pid: stA.held && stA.held.pid, start: stA.held && stA.held.start }); await until(() => !alive(A.other), 2000);
  const cut1 = (a, b, label, tag) => MC.load('src/plugins/frp.js', anchored(SRC, a, b, label), tag);
  const OLDSTART = cut1('        { const hn = heldNow(); if (hn.any) { if (hn.own) return { running: true }; throw heldRefusal(); } }\n', '        if (frpDaemonPid()) { ownRunPid(); return { running: true }; }\n', 'B-1217 the release\'s silent «running»', 'old-start');   // stale-pins: kept (a red control plants the old road back)
  const startR = startOf0(await homeOf(OLDSTART, 'left-red-start'));
  const mvR = await caseMoved(MC.load('src/plugins/frp.js', [   // the whole re-read cut (its pid AND its start: either alone refuses a moved process)
    ['        if (!pid || pid !== Number(askedPid) || askedStart == null) throw moved();\n', '        if (!pid || askedStart == null) throw moved();\n'],
    ['        if (start == null || start !== Number(askedStart)) throw moved();\n', '        if (start == null) throw moved();\n'],
  ].reduce((t, [x, y], k) => anchored(t, x, y, `B-1217 the take-over's process not read again ${k + 1}`), SRC), 'no-reread'), 'left-red-pid');
  const sxR = await caseStart(cut1('        if (start == null || start !== Number(askedStart)) throw moved();\n', '        if (start == null) throw moved();\n', 'B-1217 the take-over\'s start not read again', 'no-start'), 'left-red-start2');
  const kdR = await caseKind(cut1('        if (!isRelayClient(pid)) throw Object.assign(new Error(\'the process the relay\\\'s pid file names is not this home\\\'s relay client — nothing was ended\'), { code: \'relay_takeover_not_relay\' });   // r2329 (2): its own words\n', '', 'B-1217 the take-over\'s kind not read again', 'no-kind'), 'left-red-kind');
  const cnR = await caseCannot(cut1("        const no = verbs.canStart(); if (no) throw no;   // its read (S2): what start() would refuse is said BEFORE anything is ended\n", '', 'B-1217 the take-over ends before asking its start', 'no-pre'), 'left-red-pre');
  ok(startCode === 'relay_held_elsewhere' && stA.heldElsewhere && stA.held && stA.held.pid === A.other && !!stA.held.since
    && mv.code === 'relay_takeover_moved' && mv.lives && sx.code === 'relay_takeover_moved' && sx.none === 'relay_takeover_moved' && sx.lives
    && kd.code === 'relay_takeover_not_relay' && kd.lives && cn.code === 'relay_revoked' && cn.lives
    && aTook === 'took' && !alive(A.other) && alive(bystander) && A.started() === 1
    && startR === 'running' && !mvR.lives && !sxR.lives && !kdR.lives && !cnR.lives,
    `⑤ a client LEFT BEHIND by an instance gone for good: Start refused by name (${startCode}); the card's facts say what holds it (pid ${stA.held && stA.held.pid}); the person's take-over ends THAT process (${!alive(A.other)}) and no other (a bystander lives: ${alive(bystander)}), then starts its own (${A.started()}); refused, nothing ended: a process that moved (${mv.code}), the same pid with another start or none sent (${sx.code}, ${sx.none}), a pid-file process that is not this home's relay client (${kd.code}), a start that cannot run (${cn.code}) — RED each guard cut: the release's silent «running» (${startR}); the moved process (${!mvR.lives}), the reused pid (${!sxR.lives}), the stranger (${!kdR.lives}) and a client ended for a start that cannot run (${!cnR.lives})`,
    { startCode, mv, sx, kd, cn, aTook, startR, mvR, sxR, kdR, cnR });

  console.log('⑥ a data folder moved (behind a link; the install moved): still its own');
  const REAL_AGAIN = 60e3, dn0 = Date.now;
  const movedFolder = async (FRPm, tag, how) => {
    const rec = { enabled: false }, h = hostOf(tag, rec);
    const pid = await client(); fs.writeFileSync(path.join(h.dir, 'frpc.pid'), String(pid));
    const real0 = path.join(T, 'data-real-' + tag); fs.mkdirSync(real0);
    const there = path.join(T, (how === 'gap' ? 'gap-' : 'gone-') + tag, 'data');
    if (how === 'link') {   // recorded at its old real place; the folder moved to a new one and the old path is now a link to it
      rec.frpcRun = { pid, at: Date.now(), start: PI.starttimeOf(pid), by: real0 };
      const real1 = path.join(T, 'data-nvme-' + tag); fs.renameSync(real0, real1); fs.symlinkSync(real1, real0); h.dataDir = real1;
    } else {   // gone: the install moved or was renamed (later a folder appears at that path again); gap: ANOTHER instance's folder (a copy of data/ seeded from it) missing at the first answer — its mount's gap — and back a minute later
      rec.frpcRun = { pid, at: Date.now(), start: PI.starttimeOf(pid), by: there }; h.dataDir = real0;
    }
    const rp0 = fs.promises.realpath, SI1 = global.setInterval, ST1 = global.setTimeout, held = [], minute = [];
    let asks = 0, settled = 0, ahead = 0, armed = 0;
    fs.promises.realpath = (...a) => { asks++; return rp0(...a).finally(() => { settled++; }); };   // its reads: every resolve counted — each off the loop
    Date.now = () => dn0() + ahead;
    global.setInterval = (fn, ms, ...a) => { if (ms === 60e3) armed++; const t = SI1(fn, ms === 60e3 ? 3600e3 : ms, ...a); if (ms === 60e3) held.push(t); return t; };   // the login watch counted, never ticking here
    global.setTimeout = (fn, ms, ...a) => (ms === REAL_AGAIN ? (minute.push(fn), { unref() { } }) : ST1(fn, ms, ...a));   // the plugin's own confirming ask: run when the suite lets a minute pass
    try {
      const v = FRPm.create(h), atCreate = asks;
      const aMinute = async (busy) => { ahead += REAL_AGAIN + 1000; if (busy) v.status(); for (const f of minute.splice(0)) f(); v.status(); await until(() => settled === asks, 2000); };   // a minute passes without waiting one (busy: a status asks first — the confirm follows the ask in flight)
      v.bootReplay();   // before any answer: the record's folder needs one — the answer that makes the run its own arms its watch
      await until(() => settled === asks, 2000);
      const first = v.status(), a0 = asks;
      for (let k = 0; k < 20; k++) v.status();
      const perAsk = asks - a0;
      if (how === 'gap') fs.mkdirSync(there, { recursive: true });
      await aMinute(how === 'gone');
      const later = v.status();
      let again = null;
      if (how === 'gone') { fs.mkdirSync(there, { recursive: true }); await aMinute(); again = v.status(); }   // a folder at that path again: a path, never kept as gone
      return { firstOwn: !!first.running, firstHeld: !!first.heldElsewhere, own: !!later.running, held: !!later.heldElsewhere, again: again && !!again.running, atCreate, perAsk, armed };
    } finally { fs.promises.realpath = rp0; Date.now = dn0; global.setInterval = SI1; global.setTimeout = ST1; for (const t of held) clearInterval(t); }
  };
  const mvL = await movedFolder(FRP, 'mv-link', 'link'), mvG = await movedFolder(FRP, 'mv-gone', 'gone'), mvP = await movedFolder(FRP, 'mv-gap', 'gap');
  const BYSTRING = MC.load('src/plugins/frp.js', anchored(SRC, '  if (run.by && by && !(sameBy ? sameBy(run.by, by) : run.by === by)) return false;\n', '  if (run.by && by && run.by !== by) return false;\n', 'B-1217 its own by the path string'), 'by-string');   // stale-pins: kept (a red control plants the old road back)
  const mvLR = await movedFolder(BYSTRING, 'mv-link-red', 'link'), mvGR = await movedFolder(BYSTRING, 'mv-gone-red', 'gone');
  const ASKLINE = "      if (typeof k.v !== 'string' && !k.p && (confirm || !k.at || Date.now() - k.at >= REAL_AGAIN_MS)) {";
  const mvPR = await movedFolder(MC.load('src/plugins/frp.js', anchored(SRC, ASKLINE, '      if (true) {', 'B-1217 a resolve per ask'), 'per-ask'), 'mv-link-perask', 'link');
  const mvOR = await movedFolder(MC.load('src/plugins/frp.js', anchored(SRC, '          else if (k.v === null || (confirm && k.gone === 1)) k.v = null;', '          else if (true) k.v = null;', 'B-1217 one answer read as gone'), 'one-gone'), 'mv-gap-onegone', 'gap');
  const mvCR = await movedFolder(MC.load('src/plugins/frp.js', anchored(SRC, ' const t = setTimeout(() => realOf(p, true), REAL_AGAIN_MS); if (t && t.unref) t.unref(); }', ' }', 'B-1217 no confirming ask'), 'no-confirm'), 'mv-gone-noconfirm', 'gone');
  const mvNR = await movedFolder(MC.load('src/plugins/frp.js', anchored(SRC, ASKLINE, "      if (k.v === undefined && !k.p && (confirm || !k.at || Date.now() - k.at >= REAL_AGAIN_MS)) {", 'B-1217 gone kept'), 'gone-kept'), 'mv-gone-kept', 'gone');
  const mvAR = await movedFolder(MC.load('src/plugins/frp.js', anchored(SRC, '        if (booted && !watch && ownRunPid()) watchLogin(true);\n', '', 'B-1217 the answer arms nothing'), 'no-arm'), 'mv-link-noarm', 'link');
  const mvBR = await movedFolder(MC.load('src/plugins/frp.js', anchored(SRC, '      if (confirm && k.p) { k.p.then(() => realOf(p, true)); return k.v; }', '      if (confirm && k.p) return k.v;', 'B-1217 the confirm lost behind an ask'), 'confirm-lost'), 'mv-gone-busy', 'gone');
  ok(mvL.firstOwn && mvL.own && !mvL.held && !mvG.firstOwn && mvG.firstHeld && mvG.own && !mvG.held && mvG.again === false && !mvP.firstOwn && !mvP.own && mvP.held && !mvLR.own && mvLR.held && !mvGR.own
    && mvL.atCreate === 2 && mvL.perAsk === 0 && mvG.perAsk === 0 && mvPR.perAsk >= 20 && mvOR.firstOwn && !mvCR.own && !mvBR.own && mvNR.again === true && mvL.armed === 1 && mvG.armed === 1 && mvP.armed === 0 && mvAR.armed === 0,
    `⑥ «its own» never hangs on a path string: a data folder moved behind a link (${mvL.own}) and a recorded folder that no longer exists — the install moved — still own their client (${mvG.own}), the gone one by TWO answers a minute apart, the second the plugin's own ask (one answer: ${mvG.firstHeld ? 'held elsewhere' : 'its own'}); a folder at that path again is a path again (${mvG.again === false ? 'not its own' : 'its own'}); ANOTHER instance's folder missing at the first answer and back a minute later (a mount's gap) is never its own (${!mvP.firstOwn}, ${!mvP.own}) — RED the path string decides: held elsewhere over its own (${mvLR.held}, ${!mvGR.own}); the two folders asked off the loop at the start (${mvL.atCreate}) and none in twenty status reads (${mvL.perAsk}, ${mvG.perAsk}) — RED a resolve per ask: ${mvPR.perAsk}; RED one answer read as gone: another instance's client taken for its own (${mvOR.firstOwn}); RED no confirming ask: the moved install's client never its own (${!mvCR.own}); the confirm that comes while an ask is in flight follows it — RED it lost (${!mvBR.own}); RED gone kept: a folder back still read as gone (${mvNR.again}); the login watch armed by the answer that makes the run its own (${mvL.armed}, ${mvG.armed}; another's: ${mvP.armed}) — RED never armed (${mvAR.armed})`, { mvL, mvG, mvP, mvLR, mvGR, mvPR, mvOR, mvCR, mvBR, mvNR, mvAR });

  console.log('⑧ the minute nobody knows (r2638): a restart asked meanwhile is held, then runs or is dropped; a Stop says «not yet known»');
  const unknownMinute = async (FRPm, tag, how) => {
    const rec = { enabled: false }, h = hostOf(tag, rec);
    const pid = await client(); fs.writeFileSync(path.join(h.dir, 'frpc.pid'), String(pid));
    const real0 = path.join(T, 'data-real-' + tag); fs.mkdirSync(real0);
    const there = path.join(T, (how === 'gap' ? 'gap-' : 'gone-') + tag, 'data');
    if (how === 'link') {   // a moved install: the record's old real place is now a link to the new one
      rec.frpcRun = { pid, at: Date.now(), start: PI.starttimeOf(pid), by: real0 };
      const real1 = path.join(T, 'data-nvme-' + tag); fs.renameSync(real0, real1); fs.symlinkSync(real1, real0); h.dataDir = real1;
    } else { rec.frpcRun = { pid, at: Date.now(), start: PI.starttimeOf(pid), by: there }; h.dataDir = real0; }   // gone: its own; gap: another instance's, back later
    const rp0 = fs.promises.realpath, ST1 = global.setTimeout, minute = [];
    let asks = 0, settled = 0, ahead = 0, starts = 0;
    fs.promises.realpath = (...a) => { asks++; return rp0(...a).finally(() => { settled++; }); };
    Date.now = () => dn0() + ahead;
    global.setTimeout = (fn, ms, ...a) => (ms === REAL_AGAIN ? (minute.push(fn), { unref() { } }) : ST1(fn, ms, ...a));
    try {
      const v = FRPm.create(h);
      v.start = () => { starts++; return { starting: true }; };   // this home has no relay: the restart's own start counted, nothing spawned
      const stop0 = v.stop; let stops = 0; v.stop = (...a) => { stops++; return stop0.apply(v, a); };   // its read: every stop counted exactly (the held restart's own, and this leg's one press)
      if (how !== 'link') await until(() => settled === asks, 2000);   // gone / gap: the first answer («gone once») — still nobody knows
      v.applySettings();   // a settings change in THE MINUTE: held (the link's answer is not back yet; the gone folder answered once)
      let stopCode = 'stopped'; try { v.stop(); } catch (e) { stopCode = e && e.code; }   // a Stop in it: refused by name, the client lives
      const s0 = starts, aliveMid = alive(pid);
      if (how === 'gap') fs.mkdirSync(there, { recursive: true });   // another instance's folder answers again: a path that is not this one's
      if (how === 'link') await until(() => settled === asks, 2000);
      else { ahead += REAL_AGAIN + 1000; for (const f of minute.splice(0)) f(); await until(() => settled === asks, 2000); }   // the plugin's own confirming ask, a minute later
      const replayed = stops > 1;   // the held restart's stop runs in the answer's own turn (realSettled → restartSoon), counted exactly — beside this leg's one press
      if (replayed) await until(() => starts > 0, 3000);   // its start follows the client's end — a fact
      return { stopCode, s0, aliveMid, replayed, stops, starts, alive: alive(pid) };
    } finally { fs.promises.realpath = rp0; Date.now = dn0; global.setTimeout = ST1; }
  };
  const umL = await unknownMinute(FRP, 'um-link', 'link'), umG = await unknownMinute(FRP, 'um-gone', 'gone'), umP = await unknownMinute(FRP, 'um-gap', 'gap');
  const umLR = await unknownMinute(MC.load('src/plugins/frp.js', anchored(SRC, "        if (heldFor) { const w = ownWait; ownWait = null;", "        if (false) { const w = ownWait; ownWait = null;", 'B-1217 the held restart never replayed'), 'no-replay'), 'um-link-red', 'link');
  const umWR = await unknownMinute(MC.load('src/plugins/frp.js', anchored(SRC, "    const heldRefusal = () => (ownUnknown() ? unknownRefusal() :", "    const heldRefusal = () => (false ? unknownRefusal() :", 'B-1217 the old words in the minute'), 'old-words'), 'um-gone-red', 'gone');
  ok(umL.stopCode === 'relay_owner_unknown' && umL.aliveMid && umL.s0 === 0 && umL.starts === 1 && umG.stopCode === 'relay_owner_unknown' && umG.s0 === 0 && umG.starts === 1
    && umL.stops === 2 && umG.stops === 2 && umP.stopCode === 'relay_owner_unknown' && umP.stops === 1 && umP.starts === 0 && umP.alive && umLR.stops === 1 && umLR.starts === 0 && umWR.stopCode === 'relay_held_elsewhere',
    `⑧ THE MINUTE NOBODY KNOWS: a settings change while the folder's answer is out is held (no start then: ${umL.s0}, ${umG.s0}) and runs as ONE restart when the answer makes the run its own — a moved install (${umL.starts}), a gone folder's minute (${umG.starts}); dropped when it shows ANOTHER instance's client (${umP.starts} starts, it lives: ${umP.alive}); a Stop in that minute is refused «not yet known» (${umL.stopCode}) and the client lives (${umL.aliveMid}) — RED the held restart never replayed (${umLR.starts}); RED the old words in the minute (${umWR.stopCode})`, { umL, umG, umP, umLR, umWR });

  console.log('⑦ a take-over asked by anything but the person\'s press: refused');
  const notPressed = async (FRPm, tag) => {
    const rec = { enabled: false }, h = hostOf(tag, rec), v = FRPm.create(h);
    const other = await client(path.join(h.dir, 'frpc.toml')); fs.writeFileSync(path.join(h.dir, 'frpc.pid'), String(other));
    v.canStart = () => null; v.start = () => ({ starting: true });   // this home has no relay: only the press decides here
    let code = 'took'; try { await v.takeOver({ pid: other, start: PI.starttimeOf(other) }); } catch (e) { code = e && e.code; }
    await until(() => !alive(other), FRPm === FRP ? 150 : 2000);
    return { code, alive: alive(other) };
  };
  const np = await notPressed(FRP, 'np');
  const NOPRESS = MC.load('src/plugins/frp.js', anchored(SRC, "        if (press !== true) throw Object.assign(new Error('only a person\\'s own press takes the relay over'), { code: 'relay_takeover_refused' });\n", '', 'B-1217 the take-over unattended'), 'no-press');
  const npR = await notPressed(NOPRESS, 'np-red');
  const WIRE = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8'), WO = require(path.join(REPO, 'src/write-origin.js'));
  const PUI = fs.readFileSync(path.join(REPO, 'src/lib/plugins-ui.js'), 'utf8'), RAIL = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-rail.js'), 'utf8'), SMX = fs.readFileSync(path.join(REPO, 'src/lib/sidebar-mounts.js'), 'utf8'), SJS = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8'), IURL = fs.readFileSync(path.join(REPO, 'src/server/instance-url.js'), 'utf8');
  const page = PUI.includes("await api('takeover', { body: JSON.stringify({ pid: p.held.pid, start: p.held.start }) });") && PUI.includes("message: p.held.since ? t('This ends the relay client {pid} — running since {since} — that another VibeSpace in this home started. If that VibeSpace is still running, its public addresses stop until it starts its own again.', { pid: p.held.pid, since: when(p.held.since, { words: true }) })")
    && PUI.includes("c === 'relay_takeover_not_relay' ? t(") && PUI.includes("c === 'relay_revoked' ? t(") && PUI.includes("c === 'relay_owner_unknown' ? t(")
    && PUI.includes('            if (canRun && p.held.start != null) f.append(take);') && PUI.includes("else if (canRun) f.append(document.createTextNode(t('This process’s start time could not be read, so it cannot be told from a later process with the same number — end process {pid} yourself")   // its read: no start read, no take-over offered (the press could never pass)
    && (RAIL.split('showToast(relayRefusalWords(r)').length - 1) === 2 && SMX.includes('throw new Error(relayRefusalWords(r2))')
    && (SJS.split('portForwards.publish(String(req.params.id)').length - 1) === 1 && SJS.includes("res.status(e.status || 400).json({ error: e.message, ...(e && e.code ? { code: e.code } : {}) }); }   // B-1217: the relay's code (the page words it)")
    && (IURL.split('...(e && e.code ? { code: e.code } : {})').length - 1) === 2;
  ok(np.code === 'relay_takeover_refused' && np.alive && !npR.alive && page && WIRE.includes('plugins.takeOver(req.params.id, { pid: b.pid, start: b.start, press: true })') && (WIRE.split('plugins.takeOver(').length - 1) === 1 && WIRE.includes("const why = require('../write-origin.js').ownerPageWhy(req);") && WO.ownerPageWhy({ headers: {}, socket: {} }) !== null && WO.ownerPageWhy({ headers: { authorization: 'Bearer vsst_x' }, socket: {} }) === 'bearer',
    `⑦ a take-over asked by anything but the person's press (the watch, the boot, a timer, a publish, an agent's road) is refused by name (${np.code}) and touches nothing (${np.alive}); only the page's own route presses it, and there only from the person's own page (a header-less request and every bearer refused); the card's take-over asks a plain confirm and sends the process it showed, and the relay's codes are worded on every door (the forward's publish and unpublish, the instance's address) — RED unattended: the client ended (${!npR.alive})`, { np, npR });
} finally {
  global.setInterval = SI; console.log = log0; console.warn = warn0;
  endKids();   // by the pid and start this suite holds
  const kidsLeft = () => [...kids].filter((pid) => alive(pid) && ours(pid));
  await until(() => kidsLeft().length === 0, 3000);
  ok(kidsLeft().length === 0, `the suite ends its own stand-in clients (${kids.size}; none left)`, kidsLeft());
  fs.rmSync(T, { recursive: true, force: true });
}
report();
