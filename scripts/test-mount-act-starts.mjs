#!/usr/bin/env node
// THE MOUNTS' TIMER AND ACT-TIME STARTS GO THROUGH THE STARTER (B-323e, ITS MOUNT HALF — lane bl-machines-b, 主开发 r1161 / r1185):
// «no timer, sweep or belt starts a program from the hub's main process». Every child the hub starts is a fork of a 4.5–5 GB process
// whose main thread waits until the child execs (B-91aa's witness); THE STARTER (src/server/child-starter.js) forks a few MB.
// MEASURED FIRST at a117cebb8 (this suite's first form, on the test machine): one pull sweep started 3 programs from the main process
// (ls ×2, ls -A), one auto-reconnect of two records 16 (fusermount3 / fusermount ×2 each, rclone lsf ×2 — the root-denied and signing
// probes —, mkdir -p ×2, test -w ×2, ls -A ×2 — the stranded-files check —, the daemon ×2, the cache find ×2).
// Fast, in-process: the real managers in temp data dirs; EVERY program a stand-in on this suite's own search path (rclone, ls,
// realpath, mkdir, test, find, fusermount3 / fusermount, umount, sudo — each logs its parent pid; none mounts or reads a mount
// table); the mount table and the process table are the managers' own seams (no real one is read)
//  ① THE PULL SWEEP (src/machine-mounts.js, every 90 s): two live pulls listed and a bare folder named start 0 from the main process,
//     3 by the starter — RED the base's roads planted back ⇒ the measure's 3 from the main process
//  ② THE AUTO-RECONNECT (src/mounts.js _maybeAutoRemount → mount(), a mount that stays down, every 10 minutes): an rclone s3 record
//     (its root and signing probes) and an sftp record start from the main process ONLY their two daemons; the rest by the starter —
//     RED the base's roads ⇒ the measure's 16; the lazy-unmount trio (the sweep's road into a dead daemon's unmount) 0 — RED ⇒ from the main
//  ③ THE ANSWERS, through a stand-in starter: a listing — no answer from the starter is NO VERDICT (null, never «the mount is
//     down»: RED read as false), killed at its bound is false and its end comes late, more names than the release kept = not empty;
//     a real path (no realpath ⇒ as written); the mount point's check — no answer is «could not be checked» (mp_unanswered), never
//     «no permission» (RED ⇒ mp_no_permission); the root probe — «denied» only by an ended run's words; the cache count — an
//     overflow is the cap (the listing and the mount point's check with their RED)
//  ③b A PROBE CHILD WHOSE END IS NEVER HEARD (killed at its bound and asleep in the kernel, its starter then replaced — a fault ends the
//     starter, never its children): the bare folder's single flight HOLDS while it lives (no second `ls -A` on that folder) and ends once
//     /proc says it is gone — RED the /proc ask cut ⇒ it never ends
//  ④ THE DAEMON (主开发 r1185: it stays a direct start in this unit — one a down mount a 10-minute retry, and a person's own press):
//     its NUMBER printed — the loop's hold by its start and the longest loop gap across the reconnect, with this process's size
// Run: node scripts/test-mount-act-starts.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';   // every red control's edit through the one door that fails by name

const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { ok, report } = checker();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); } return !!fn(); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'mount-act-starts-'));
const CP = require('child_process');
// THE COUNTER (B-91aa's, as test-mount-probe-starts): every async start of THIS process goes through ChildProcess.prototype.spawn —
// its program and first argument noted, and how long the start held the thread; the synchronous forms too (before the managers load)
const mainStarts = [], holds = [];
const realSpawn = CP.ChildProcess.prototype.spawn;
CP.ChildProcess.prototype.spawn = function (o) {
  const name = path.basename(String((o && o.file) || '?')) + ' ' + String(((o && o.args) || [])[1] || ''), t0 = performance.now();
  try { return realSpawn.apply(this, arguments); } finally { mainStarts.push(name); holds.push({ name, ms: performance.now() - t0 }); }
};
for (const k of ['spawnSync', 'execFileSync', 'execSync']) { const real = CP[k]; CP[k] = function (...a) { mainStarts.push('SYNC ' + path.basename(String(a[0]))); return real.apply(this, a); }; }

// THE STAND-INS: each logs «<its parent pid> <name> <its first two args>»; the harmless ones then run the system's own program
const LOG = path.join(T, 'starts.log');
const fbin = path.join(T, 'bin'); fs.mkdirSync(fbin, { recursive: true });
const SYS = 'PATH=/usr/bin:/bin';
const standin = (name, body) => fs.writeFileSync(path.join(fbin, name), `#!/bin/sh\necho "$PPID ${name} $1 $2" >> '${LOG}'\n${body}\n`, { mode: 0o755 });
standin('rclone', `case "$1" in
  help) echo '--use-accept-encoding-gzip --rc-addr --s3-use-accept-encoding-gzip' ;;
  version) echo 'rclone v1.70.0' ;;
  lsf) echo f.txt ;;
  mount) [ "$2" = --help ] && { echo '--vfs-cache-mode --rc-addr'; exit 0; }; echo 'standin daemon: not mounted' >&2; exit 1 ;;
  rc) echo '{}' ;;
esac
exit 0`);
for (const [n, b] of [['fusermount3', 'exit 0'], ['fusermount', 'exit 0'], ['umount', 'exit 0'], ['sudo', 'exit 1'], ['find', 'exit 0'],
  ['mkdir', `${SYS} exec mkdir "$@"`], ['test', `${SYS} exec test "$@"`], ['ls', `${SYS} exec ls "$@"`], ['realpath', `${SYS} exec realpath "$@"`]]) standin(n, b);
process.env.PATH = `${fbin}:${process.env.PATH}`;   // before the starter is born (its env is the service env of this process's)
process.env.VIBESPACE_MOUNT_BASE = path.join(T, 'mnt');
const logLines = () => { try { return fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };
const viaStarter = (lines) => lines.filter((l) => !l.startsWith(process.pid + ' '));
const nameOf = (x) => String(x).replace(/^\d+ /, '').split(' ').slice(0, 2).join(' ').trim().replace(/ \/.*$/, '');
const byName = (xs) => xs.reduce((o, x) => { const k = nameOf(x); o[k] = (o[k] || 0) + 1; return o; }, {});

// THE BASE'S ROADS, planted back (each pair: today's block → the base's, through anchored(); all of them = the base's own text)
const PAIRS_MOUNTS = [["    // B-323e (its mount half): by THE STARTER with the record's whole env (rcloneEnv), as the sweep's probes; DENIED only by an ended\n    // run's own words — no answer, a run that never started or one ended at its bound says nothing (never «denied»)\n    return this._rcloneProbeRun(['lsf', 'VS:', '--max-depth', '1', '--retries', '1', '--low-level-retries', '1'], env, 20000)\n      .then((r) => !!r && !r.unknown && !!r.started && !r.timedOut && r.code !== 0 && /AccessDenied|Access Denied|status code: 403/i.test(String(r.stderr || '')), () => false);\n", "    return new Promise((resolve) => {\n      execFile(this.rcloneBin(), ['lsf', 'VS:', '--max-depth', '1', '--retries', '1', '--low-level-retries', '1'],\n        { env, timeout: 20000 },\n        (err, _o, stderr) => resolve(err ? /AccessDenied|Access Denied|status code: 403/i.test(String(stderr || err.message)) : false));\n    });\n"], ["      // B-323e (its mount half): by THE STARTER with the record's whole env, as the sweep's probes; an ended 0 = signed fine (null),\n      // anything else its words (no answer / never started / ended at its bound: no verdict word — the record stays undecided)\n      const probe = (extraEnv) => this._rcloneProbeRun(['lsf', remote, '--max-depth', '1', '--retries', '1', '--low-level-retries', '1',\n        ...(this._rcloneSupportsAcceptEncodingFlag() ? ['--s3-use-accept-encoding-gzip=false'] : [])], { ...env, ...extraEnv }, 20000)\n        .then((r) => (r && !r.unknown && r.started && !r.timedOut && r.code === 0 ? null : String((r && (r.stderr || r.error)) || (r && r.unknown ? 'no answer' : 'failed'))), (e) => String((e && e.message) || e));\n", "      const probe = (extraEnv) => new Promise((resolve) => {\n        execFile(this.rcloneBin(), ['lsf', remote, '--max-depth', '1', '--retries', '1', '--low-level-retries', '1',\n          ...(this._rcloneSupportsAcceptEncodingFlag() ? ['--s3-use-accept-encoding-gzip=false'] : [])],\n          { env: { ...env, ...extraEnv }, timeout: 20000 },\n          (err, _o, stderr) => resolve(err ? String(stderr || err.message) : null));\n      });\n"], ["    // B-323e (its mount half): THE STARTER counts (a fork of a few MB, never the hub's): its dots captured up to the cap — past it the\n    // child is ended (an overflow = the cap reached); bounded by the start's own ceiling; no answer = a failed count (0), as before.\n    // (Said: a count ended at the ceiling answers 0 — the starter keeps no output past a bound — and stderr past the cap reads as capped)\n    const T = this._startingT || MountManager.STARTING;\n    return require('./server/child-starter').childStarter().run('find', [dir, '-type', 'f', '-printf', '.'], { timeoutMs: T.ceilingMs, capture: true, maxBuffer: cap, envAdd: { PATH: process.env.PATH || '' } })\n      .then((r) => { const n = r && !r.unknown && r.overflow ? cap : String((r && !r.unknown && r.stdout) || '').length; return { n: Math.min(n, cap), capped: n >= cap }; }, () => ({ n: 0, capped: false }));\n", "    return new Promise((resolve) => {\n      let n = 0, done = false;\n      const end = () => { if (!done) { done = true; resolve({ n: Math.min(n, cap), capped: n >= cap }); } };\n      const c = spawn('find', [dir, '-type', 'f', '-printf', '.'], { stdio: ['ignore', 'pipe', 'ignore'] });\n      // ckpt61 cure 2: the error listener first — a start that fails at once (a full file table) has no pipe and its 'error' queued:\n      // a pipe touched first threw, and the error then found no listener (the hub ended). It answers as a failed count does today\n      c.on('error', end); c.on('close', end);\n      if (c.stdout) c.stdout.on('data', (b) => { n += b.length; if (n >= cap) { try { c.kill('SIGKILL'); } catch {} end(); } });\n    });\n"], ["      // B-323e (its mount half): the clearing pair by THE STARTER (a mount that stays down is retried every 10 minutes — never a\n      // fork of the hub), in turn, whatever each says (as the release); each bounded (10 s), so a wedged one never holds the reconnect\n      const S = require('./server/child-starter').childStarter(), envAdd = { PATH: process.env.PATH || '' };\n      await S.run('fusermount3', ['-uz', mp], { timeoutMs: 10000, envAdd }).catch(() => null);\n      await S.run('fusermount', ['-uz', mp], { timeoutMs: 10000, envAdd }).catch(() => null);\n", "      await new Promise((res) => execFile('fusermount3', ['-uz', mp], () =>\n        execFile('fusermount', ['-uz', mp], () => res())));\n"], ["    // B-323e (its mount half): by THE STARTER (a connect, and the sweep's reconnect of a mount that stays down); NO ANSWER from it is no\n    // verdict — never «no permission» — said by its own code (mp_unanswered), and the reconnect asks again by itself\n    const S = require('./server/child-starter').childStarter();\n    const run = (cmd, args) => S.run(cmd, args, { timeoutMs: 8000, capture: true, envAdd: { PATH: process.env.PATH || '' } }).then((r) => (!r || r.unknown\n      ? { ok: false, unknown: true, stdout: '', stderr: '' }\n      : { ok: !!r.started && !r.timedOut && r.code === 0 && !r.error, stdout: String(r.stdout || ''), stderr: String(r.stderr || r.error || (r.timedOut ? 'no answer in time' : '')) }), () => ({ ok: false, unknown: true, stdout: '', stderr: '' }));\n", "    const run = (cmd, args) => new Promise((resolve) =>\n      execFile(cmd, args, { timeout: 8000 }, (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || (err && err.message) || '') })));\n"], ["    // every no answer is no verdict (its reader's S1): never «no permission», «not writable», «not empty» nor «moved» on a guess\n    const ask = async (cmd, args) => { const x = await run(cmd, args); if (x.unknown) throw MW.refusal('mp_unanswered', { mp }); return x; };\n    let made = await ask('mkdir', ['-p', mp]);\n", "    let made = await run('mkdir', ['-p', mp]);\n"], ["      const su = await ask('sudo', ['-n', 'mkdir', '-p', mp]);\n", "      const su = await run('sudo', ['-n', 'mkdir', '-p', mp]);\n"], ["        await ask('sudo', ['-n', 'chown', owner, mp]);\n", "        await run('sudo', ['-n', 'chown', owner, mp]);\n"], ["    let w = await ask('test', ['-w', mp]);\n", "    let w = await run('test', ['-w', mp]);\n"], ["      const su = await ask('sudo', ['-n', 'chown', owner, mp]);\n      if (su.ok) { global.__vsEvent?.('mount-mkdir-sudo'); w = await ask('test', ['-w', mp]); }\n", "      const su = await run('sudo', ['-n', 'chown', owner, mp]);\n      if (su.ok) { global.__vsEvent?.('mount-mkdir-sudo'); w = await run('test', ['-w', mp]); }\n"], ["    const ls = await ask('ls', ['-A', mp]);\n", "    const ls = await run('ls', ['-A', mp]);\n"], ["    // a move with no answer may have run (the starter gone before its end): the destination itself says whether it did\n    const moved = async (x) => (x.unknown ? { ok: !(await ask('test', ['-e', mp])).ok && (await ask('test', ['-e', dest])).ok } : x);   // its source gone AND its destination there (a same-minute destination of an earlier move is not this one's)\n    let mv = await moved(await run('mv', [mp, dest]));\n    if (!mv.ok) mv = await moved(await run('sudo', ['-n', 'mv', mp, dest]));\n", "    let mv = await run('mv', [mp, dest]);\n    if (!mv.ok) mv = await run('sudo', ['-n', 'mv', mp, dest]);\n"], ["    const re = await ask('mkdir', ['-p', mp]);\n", "    const re = await run('mkdir', ['-p', mp]);\n"], ["      // B-323e (its mount half, its reader's S4): the lazy-unmount trio by THE STARTER — the sweep's own road into a dead daemon's unmount\n      // (every 60 s) and a person's Disconnect; in turn as before (the next only when one did not end 0), each bounded 10 s\n      const S = require('./server/child-starter').childStarter(), envAdd = { PATH: process.env.PATH || '' };\n      const ended0 = (r) => !!r && !r.unknown && !!r.started && !r.timedOut && r.code === 0 && !r.error;\n      (async () => {\n        if (ended0(await S.run('fusermount3', ['-uz', mp], { timeoutMs: 10000, envAdd }).catch(() => null))) return ensureDaemonGone(true);\n        if (ended0(await S.run('fusermount', ['-uz', mp], { timeoutMs: 10000, envAdd }).catch(() => null))) return ensureDaemonGone(true);\n        await S.run('umount', ['-l', mp], { timeoutMs: 10000, envAdd }).catch(() => null);\n        return ensureDaemonGone(!this.isMounted(m));\n      })();\n", "      execFile('fusermount3', ['-uz', mp], (err) => {\n        if (!err) return ensureDaemonGone(true);\n        execFile('fusermount', ['-uz', mp], (err2) => {\n          if (!err2) return ensureDaemonGone(true);\n          execFile('umount', ['-l', mp], () => ensureDaemonGone(!this.isMounted(m)));\n        });\n      });\n"]];   // stale-pins: kept (the base's roads, planted back in the red controls)
const PAIRS_PULL = [["const { execFile } = require('child_process');   // (B-323e: its two probe children — ls, realpath — ride THE STARTER)\nconst PI = require('./proc-identity.js');   // B-323e: a probe child's end the hub may never hear, asked of /proc by its pid\n", "const { execFile, spawn } = require('child_process');\n"], ["/** B-323e (its reader's M2): a child of THE STARTER whose end this hub may NEVER hear — killed at its bound and asleep in the kernel\n *  (a dead mount), or started by a starter that then stopped answering; a fault ends the starter, never its children — so its pid and\n *  start time are kept and its end is asked of /proc when it is owed, as mounts.js _probeMountpoint's held mark (B-91aa): no such\n *  process, a zombie, or that pid now another process's ⇒ ended; a /proc this hub cannot read says nothing (still held).\n *  (its re-read's S1) ENDED ALREADY when kept (no such process, a zombie) ⇒ gone for good — its pid may go to another; with\n *  `notAfter` (the ask's instant + a slack), a process that STARTED after it is not this ask's child (the pid reused) ⇒ gone */\nfunction heldChild(pid, notAfter = 0) {\n  const st0 = pid ? PI.statOf(pid) : null;\n  if (st0 === null || (st0 && st0[0] === 'Z')) return { pid: pid || 0, gone: () => true };\n  const start = st0 ? st0[1] : null;\n  if (notAfter && start != null) { const w = PI.wallStartOf(start); if (w != null && w > notAfter) return { pid, gone: () => true }; }\n  return { pid, gone() { const st = PI.statOf(pid); return st === null || (!!st && (st[0] === 'Z' || (start != null && st[1] !== start))); } };\n}\nconst ASK_SLACK_MS = 2000;   // a child starts within this of its ask (the starter's turn); one that started later is another's\nfunction lsChild(mp, { names = false, ms = 8000 } = {}) {   // → ok: true / false (no answer in time, an error) / null (it could not start, or no answer from the starter); exited: the child's own end\n  // B-323e (its mount half, lane bl-machines-b): THE STARTER runs it (src/server/child-starter.js — a fork of a few MB, never the hub's\n  // 4.5–5 GB process; the pull sweep asks it every 90 s for each live pull). Its answers read as the release read its own child:\n  // ended 0 = ok, ended else or killed at its bound = false, never started or NO ANSWER from the starter = null (no verdict: a slow\n  // starter is never «the mount is down»); the names captured past the release's 4096 characters end the child (more names than that\n  // = not empty). `exited` = the child's own end: at the answer, or — killed at its bound and still asleep — when it ends at last;\n  // `held` = such a child, kept for its owner to ask /proc (heldChild) when its end may never be heard\n  let exitedRes, held = null; const exited = new Promise((r) => { exitedRes = r; });\n  const S = require('./server/child-starter').childStarter(), askedAt = Date.now();\n  return S.run('ls', names ? ['-A', mp] : [mp], { timeoutMs: ms, capture: names, maxBuffer: 4096, envAdd: { PATH: process.env.PATH || '' }, onTimeout: (pid) => { held = heldChild(pid, askedAt + ASK_SLACK_MS); }, onLateExit: () => exitedRes() })\n    .then((r) => {\n      if (r && r.unknown && r.pid) return { ok: null, empty: null, exited, held: heldChild(r.pid, askedAt + ASK_SLACK_MS) };   // started, then no answer: it may still run\n      // (said: a no answer with no pid — the starter froze before its «started» line — is let go at once: its child, if any, is not known)\n      if (!r || r.unknown || !r.started) { exitedRes(); return { ok: null, empty: null, exited }; }\n      if (r.timedOut) return { ok: false, empty: null, exited, held: held || heldChild(r.pid, askedAt + ASK_SLACK_MS) };   // its end comes through onLateExit, or of /proc\n      exitedRes();\n      if (r.overflow) return { ok: true, empty: names ? false : null, exited };\n      return { ok: r.code === 0 && !r.error, empty: names && r.code === 0 && !r.error ? String(r.stdout || '').length === 0 : null, exited };   // a name of spaces is a name\n    }, () => { exitedRes(); return { ok: null, empty: null, exited }; });\n", "function lsChild(mp, { names = false, ms = 8000 } = {}) {   // → ok: true / false (no answer in time, an error) / null (it could not start); exited: the child's own end\n  let exitedRes; const exited = new Promise((r) => { exitedRes = r; });\n  return new Promise((res) => {\n    let out = '', done = false, spawned = false, t = null;\n    const end = (v) => { if (!done) { done = true; clearTimeout(t); res({ ...v, exited }); } };\n    let c; try { c = spawn('ls', names ? ['-A', mp] : [mp], { stdio: ['ignore', names ? 'pipe' : 'ignore', 'ignore'] }); } catch { exitedRes(); return end({ ok: null, empty: null }); }   // could not start: no verdict\n    t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } end({ ok: false, empty: null }); }, ms);\n    c.on('spawn', () => { spawned = true; });\n    if (names) c.stdout.on('data', (d) => { if (out.length < 4096) out += d; });\n    c.on('close', (code) => { exitedRes(); end({ ok: code === 0, empty: names && code === 0 ? out.length === 0 : null }); });   // a name of spaces is a name\n    c.on('error', () => { exitedRes(); end({ ok: spawned ? false : null, empty: null }); });   // an error before it started (EAGAIN, ENOENT): no verdict\n  });\n"], ["function realpathChild(p, { ms = 6000, onExit = null, onHeld = null } = {}) {   // r6: onExit — the child's own end (a stuck child is never doubled); onHeld — one whose end may never be heard (heldChild)\n  // B-323e (its mount half): THE STARTER runs it, as lsChild; no answer from the starter = no answer (null, asked again)\n", "function realpathChild(p, { ms = 6000, onExit = null } = {}) {   // r6: onExit — the child's own end (a stuck child is never doubled)\n"], ["  let gone = false; const exited = () => { if (!gone) { gone = true; try { onExit && onExit(); } catch { } } };\n  const S = require('./server/child-starter').childStarter();\n  const askedAt = Date.now(), keep = (pid) => { try { onHeld && onHeld(heldChild(pid, askedAt + ASK_SLACK_MS)); } catch { } };\n  return S.run('realpath', ['-m', '--', lex], { timeoutMs: ms, capture: true, maxBuffer: 8192, envAdd: { PATH: process.env.PATH || '' }, onTimeout: (pid) => keep(pid), onLateExit: exited })\n    .then((r) => {\n      if (r && r.unknown && r.pid) { keep(r.pid); return null; }   // started, then no answer: it may still run\n      if (!r || r.unknown) { exited(); return null; }\n      if (!r.started) { exited(); return r.error === 'ENOENT' ? lex : null; }   // r7: no realpath on this host ⇒ as written (final); another error ⇒ no answer\n      if (r.timedOut) return null;   // its end comes through onLateExit\n      exited();\n      if (r.overflow) return null;\n      const out = String(r.stdout || '').replace(/\\n$/, '');\n      return r.code === 0 && out.startsWith('/') ? out : lex;\n    }, () => { exited(); return null; });\n", "  return new Promise((res) => {\n    let out = '', done = false, t = null, gone = false;\n    const exited = () => { if (!gone) { gone = true; try { onExit && onExit(); } catch { } } };\n    const end = (v) => { if (!done) { done = true; clearTimeout(t); res(v); } };\n    let c; try { c = spawn('realpath', ['-m', '--', lex], { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { exited(); return end(null); }\n    t = setTimeout(() => { try { c.kill('SIGKILL'); } catch { } end(null); }, ms);\n    c.stdout.on('data', (d) => { if (out.length < 8192) out += d; });\n    c.on('close', (code) => { exited(); const r = out.replace(/\\n$/, ''); end(code === 0 && r.startsWith('/') ? r : lex); });\n    c.on('error', (e) => { exited(); end(e && e.code === 'ENOENT' ? lex : null); });   // r7: no realpath on this host ⇒ as written (final); another error ⇒ no answer\n  });\n"], ["    const kidHeld = (this._realKidHeld = this._realKidHeld || new Map()), kidTok = (this._realKidTok = this._realKidTok || new Map());\n    for (const [id, h] of kidHeld) if (h.gone()) { kids.delete(id); kidHeld.delete(id); kidTok.delete(id); }   // B-323e: an end this hub could not hear, asked of /proc\n", ""], ["    const reals = await Promise.all(todo.map((m) => { const tok = {}; kidTok.set(m.id, tok);\n      return (this._realpath || realpathChild)(m.mountpoint, { onExit: () => { if (kidTok.get(m.id) !== tok) return; kidTok.delete(m.id); kidHeld.delete(m.id); kids.delete(m.id); }, onHeld: (h) => { if (kidTok.get(m.id) === tok) kidHeld.set(m.id, h); } }); }));\n", "    const reals = await Promise.all(todo.map((m) => (this._realpath || realpathChild)(m.mountpoint, { onExit: () => kids.delete(m.id) })));\n"], ["    // B-323e (its reader's M2): a probe child whose end this hub may never hear (asleep in the kernel, its starter then replaced) is\n    // asked of /proc — ended ⇒ its single flight ends here and the folder is asked again\n    if (rec && this._probing.has(rec.id) && this._probingHeld?.get(rec.id)?.gone()) { this._probing.delete(rec.id); this._probingAt?.delete(rec.id); this._probeSaid?.delete(rec.id); this._probingHeld.delete(rec.id); this._probingTok?.delete(rec.id); }\n", ""], ["    const tok = {}; (this._probingTok = this._probingTok || new Map()).set(rec.id, tok);\n", ""], ["    if (r.held && this._probingTok.get(rec.id) === tok) (this._probingHeld = this._probingHeld || new Map()).set(rec.id, r.held);\n    Promise.resolve(r.exited).then(() => { if (this._probingTok.get(rec.id) !== tok) return; this._probingTok.delete(rec.id); this._probingHeld?.delete(rec.id); this._probing.delete(rec.id); this._probingAt.delete(rec.id); this._probeSaid?.delete(rec.id); if (this._reprobe?.delete(rec.id)) this._probeBare(rec).catch(() => { }); });\n", "    Promise.resolve(r.exited).then(() => { this._probing.delete(rec.id); this._probingAt.delete(rec.id); this._probeSaid?.delete(rec.id); if (this._reprobe?.delete(rec.id)) this._probeBare(rec).catch(() => { }); });\n"]];   // stale-pins: kept (the base's roads, planted back in the red controls)
const MC = mutantCopies('mount-act-starts', REPO);
const plant = (rel, pairs, tag) => MC.load(rel, pairs.reduce((s, [now, was], i) => anchored(s, now, was, `B-323e the base's road ${i + 1} of ${rel} planted back`), read(rel)), tag);

const CS = require(path.join(REPO, 'src/server/child-starter.js'));
const { serviceEnv } = require(path.join(REPO, 'src/agent-env.js'));
const S = CS.createChildStarter({ log: { warn: () => { } } }); CS.setChildStarter(S);
const MMOD = require(path.join(REPO, 'src/machine-mounts.js')), MOUNTS = require(path.join(REPO, 'src/mounts.js'));
try {
  await S.run(process.execPath, ['-e', '0'], { timeoutMs: 10000 });   // the starter's own start (made once), outside every window
  const counting = async (fn) => { const s0 = mainStarts.length, l0 = logLines().length; await fn(); await sleep(400); return { main: mainStarts.slice(s0), via: viaStarter(logLines().slice(l0)) }; };

  console.log('① the pull sweep (src/machine-mounts.js, every 90 s): two live pulls listed, one bare folder named');
  const pullSweep = async (M, tag) => {
    const D = path.join(T, 'data-pull-' + tag); fs.mkdirSync(D);
    const pm = new M.MachineMounts({ dataDir: D, hosts: { held: () => false, unreadWords: () => '', get: () => ({ transport: 'ssh' }) }, mountTokens: {}, publicUrl: () => null, localPort: () => null, rcloneBin: () => 'rclone', broadcast() { }, log() { } });
    clearInterval(pm._sweep);
    const mp = (n) => { const d = path.join(T, `pull-${tag}-${n}`); fs.mkdirSync(d, { recursive: true }); return d; };
    pm._state.mounts.push({ id: 'mas-p1', dir: 'pull', hostId: 'h1', mountpoint: mp(1) }, { id: 'mas-p2', dir: 'pull', hostId: 'h1', mountpoint: mp(2) }, { id: 'mas-p3', dir: 'pull', hostId: 'h1', mountpoint: mp(3) });
    for (const n of [1, 2]) pm._live.set('mas-p' + n, { mountpoint: path.join(T, `pull-${tag}-${n}`), teardown: async () => { } });
    pm._pullRetryAt = new Map([['mas-p3', Date.now() + 1e9]]);   // the not-live pull is never healed here (no pull chain is driven)
    return counting(() => pm._healthSweep());
  };
  const a = await pullSweep(MMOD, 'now'), aRed = await pullSweep(plant('src/machine-mounts.js', PAIRS_PULL, 'base-pull'), 'base');
  ok(a.main.length === 0 && a.via.length === 3 && aRed.main.length === 3,
    `① one pull sweep starts NO program from the main process (${a.main.length}); the starter starts its ${a.via.length} (${JSON.stringify(byName(a.via))}) — RED the base's roads: ${aRed.main.length} from the main process (${JSON.stringify(byName(aRed.main))}), the measure's 3`,
    { a: byName(a.main), via: byName(a.via), red: byName(aRed.main) });

  console.log('② the auto-reconnect (src/mounts.js _maybeAutoRemount → mount()): an rclone s3 record and an sftp record');
  const reconnect = async (M, tag) => {
    const D = path.join(T, 'data-' + tag); fs.mkdirSync(D);
    const mm = new M.MountManager({ dataDir: D });
    mm.isMounted = () => false; mm._daemonAlive = async () => false; mm._adoptable = async () => 0;   // the mount table and the process table: its seams
    mm._rcloneFor = () => ({ env: serviceEnv(process.env), remote: 'VS:' });
    mm._startingT = { ...M.MountManager.STARTING, quickMs: 1500, pollMs: 50 };
    mm._state.mounts.push({ id: 'mas-rc', name: 'mas rc ' + tag, type: 'rclone', rcloneType: 's3', desired: 'mounted' }, { id: 'mas-sftp', name: 'mas sftp ' + tag, type: 'sftp', desired: 'mounted' });
    let last = performance.now(), gap = 0; const tick = setInterval(() => { const n = performance.now(); gap = Math.max(gap, n - last); last = n; }, 1);
    const h0 = holds.length;
    const r = await counting(async () => { for (const id of ['mas-rc', 'mas-sftp']) await mm._maybeAutoRemount(mm._state.mounts.find((m) => m.id === id)); });
    clearInterval(tick);
    return { ...r, mm, gap, daemonHolds: holds.slice(h0).filter((x) => x.name.startsWith('rclone mount')).map((x) => x.ms) };
  };
  const b = await reconnect(MOUNTS, 'now'), bRed = await reconnect(plant('src/mounts.js', PAIRS_MOUNTS, 'base-reconnect'), 'base');
  const MOVED = ['fusermount3 -uz', 'fusermount -uz', 'rclone lsf', 'mkdir -p', 'test -w', 'ls -A', 'find'];
  const viaB = byName(b.via);
  ok(b.main.length === 2 && b.main.every((x) => x.startsWith('rclone mount')) && MOVED.every((k) => viaB[k] >= 2 || (k === 'find' && viaB[k] >= 1)) && bRed.main.length === 16,
    `② one auto-reconnect of two records starts from the main process ONLY its two daemons (${JSON.stringify(byName(b.main))}); the starter starts the rest (${JSON.stringify(viaB)}) — RED the base's roads: ${bRed.main.length} from the main process, the measure's 16`,
    { main: byName(b.main), via: viaB, red: byName(bRed.main) });

  const un = await counting(() => b.mm.unmount('mas-sftp', { internal: true })), unRed = await counting(() => bRed.mm.unmount('mas-sftp', { internal: true }));
  ok(un.main.length === 0 && byName(un.via)['fusermount3 -uz'] === 1 && unRed.main.length >= 1,
    `② the lazy-unmount trio (the sweep's road into a dead daemon's unmount, and a person's Disconnect) starts NO program from the main process (${un.main.length}; the starter: ${JSON.stringify(byName(un.via))}) — RED the base's road: ${unRed.main.length} from the main process`,
    { un: byName(un.main), via: byName(un.via), red: byName(unRed.main) });

  console.log('③ the answers, through a stand-in starter');
  const fake = (answer) => ({ calls: [], run(cmd, args, o) { this.calls.push({ cmd, args, o }); return Promise.resolve(typeof answer === 'function' ? answer(cmd, args, o) : answer); }, stats: () => ({}) });
  const MMSRC = read('src/machine-mounts.js');
  const PIM = require(path.join(REPO, 'src/proc-identity.js'));
  const kidsOf = (src) => { const i = src.indexOf('function heldChild('), j = src.indexOf('\nconst RCLONE_PIN', i); if (i < 0 || j < i) throw new Error('heldChild … realpathChild moved'); let cur = null;
    const f = new Function('require', 'path', 'PI', `${src.slice(i, j)}\nreturn { lsChild, realpathChild };`)((m) => (m === './server/child-starter' ? { childStarter: () => cur } : require(m)), path, PIM); return { ...f, use: (s) => { cur = s; } }; };
  const K = kidsOf(MMSRC);
  const ls = async (answer, o) => { const s = fake(answer); K.use(s); const r = await K.lsChild('/x', o); return { r, call: s.calls[0] }; };
  const u = await ls({ unknown: true }), ns = await ls({ started: false, error: 'ENOENT' }), e0 = await ls({ started: true, code: 0, stdout: '' }, { names: true });
  const e1 = await ls({ started: true, code: 0, stdout: 'a\n' }, { names: true }), ov = await ls({ started: true, overflow: true, code: null }, { names: true }), c2 = await ls({ started: true, code: 2 });
  const to = await ls({ started: true, timedOut: true, code: null }); let lateEnd = false; to.r.exited.then(() => { lateEnd = true; }); await sleep(10); const before = lateEnd; to.call.o.onLateExit(); await sleep(10);
  ok(u.r.ok === null && ns.r.ok === null && e0.r.ok === true && e0.r.empty === true && e1.r.empty === false && ov.r.ok === true && ov.r.empty === false && c2.r.ok === false && to.r.ok === false && before === false && lateEnd === true && u.call.cmd === 'ls' && /PATH/.test(Object.keys(u.call.o.envAdd || {}).join()),
    '③ a listing by the starter: NO ANSWER and never started ⇒ no verdict (null — never «the mount is down»); 0 ⇒ ok, empty or not by its names; more names than the release kept ⇒ not empty; another exit ⇒ false; killed at its bound ⇒ false, its end told only when it comes (onLateExit)',
    { u: u.r.ok, ns: ns.r.ok, e0: e0.r, e1: e1.r.empty, ov: ov.r, c2: c2.r.ok, to: to.r.ok, before, lateEnd });
  const KR = kidsOf(anchored(MMSRC, "      if (!r || r.unknown || !r.started) { exitedRes(); return { ok: null, empty: null, exited }; }", "      if (!r || !r.started) { exitedRes(); return { ok: r && r.unknown ? false : null, empty: null, exited }; }", 'B-323e no answer read as «not responsive»'));
  { const s = fake({ unknown: true }); KR.use(s); const r = await KR.lsChild('/x'); ok(r.ok === false, 'RED CONTROL: no answer read as «not responsive» ⇒ false (the sweep would tear a live pull down for a slow starter)', r.ok); }
  const rp = async (answer) => { const s = fake(answer); K.use(s); let gone = 0; const r = await K.realpathChild('/a/b', { onExit: () => { gone++; } }); return { r, gone }; };
  const rq = await rp({ started: true, code: 0, stdout: '/real/b\n' }), rn = await rp({ started: false, error: 'ENOENT' }), ru = await rp({ unknown: true }), rt = await rp({ started: true, timedOut: true });
  ok(rq.r === '/real/b' && rn.r === '/a/b' && ru.r === null && rt.r === null && rq.gone === 1 && rt.gone === 0,
    '③ a real path by the starter: its answer; no realpath on the machine ⇒ the path as written; no answer or killed at its bound ⇒ none (asked again), its end told only when it comes', { rq, rn, ru, rt });
  const mmNow = b.mm;
  const refusalOf = async (mm, answer) => { CS.setChildStarter(fake(answer)); try { await mm._ensureMountpointDir(path.join(T, 'mp-check'), { quarantine: false }); return 'made'; } catch (e) { return (e && e.code) || String(e); } finally { CS.setChildStarter(S); } };
  const ua = await refusalOf(mmNow, { unknown: true });
  const MSRC = read('src/mounts.js');
  const noUnknown = MC.load('src/mounts.js', anchored(MSRC, "    const ask = async (cmd, args) => { const x = await run(cmd, args); if (x.unknown) throw MW.refusal('mp_unanswered', { mp }); return x; };\n", "    const ask = async (cmd, args) => run(cmd, args);\n", 'B-323e no answer read as a failed make'), 'no-unanswered');
  const mmRed = new noUnknown.MountManager({ dataDir: path.join(T, 'data-now') });
  const ub = await refusalOf(mmRed, { unknown: true });
  ok(ua === 'mp_unanswered' && ub === 'mp_no_permission', `③ the mount point's check: no answer from the starter ⇒ «could not be checked — try again in a moment» (${ua}), never «no permission» — RED no answer read as a failed make ⇒ ${ub}`, { ua, ub });
  const denied = async (answer) => { CS.setChildStarter(fake(answer)); try { return await mmNow._probeRootDenied({ id: 'mas-rc' }); } finally { CS.setChildStarter(S); } };
  const d1 = await denied({ started: true, code: 1, stderr: 'Failed: AccessDenied' }), d2 = await denied({ started: true, timedOut: true, code: null, stderr: '' }), d3 = await denied({ unknown: true }), d4 = await denied({ started: true, code: 0 });
  ok(d1 === true && d2 === false && d3 === false && d4 === false, '③ the root probe: «denied» only by an ended run\'s own words; killed at its bound, no answer or a listing ⇒ not denied', { d1, d2, d3, d4 });
  const count = async (answer) => { CS.setChildStarter(fake(answer)); try { return await mmNow._countCacheFiles(T, 5); } finally { CS.setChildStarter(S); } };
  const n3 = await count({ started: true, code: 0, stdout: '...' }), nc = await count({ started: true, overflow: true }), nu = await count({ unknown: true });
  ok(n3.n === 3 && !n3.capped && nc.n === 5 && nc.capped && nu.n === 0 && !nu.capped, '③ the cache count by the starter: its dots; an overflow ⇒ the cap; no answer ⇒ a failed count (0), as before', { n3, nc, nu });

  console.log('③b a probe child whose end is never heard (asleep, its starter replaced) is asked of /proc');
  const heldRun = async (M, tag) => {
    const D = path.join(T, 'data-held-' + tag); fs.mkdirSync(D);
    const pm = new M.MachineMounts({ dataDir: D, hosts: { held: () => false, unreadWords: () => '', get: () => ({ transport: 'ssh' }) }, mountTokens: {}, publicUrl: () => null, localPort: () => null, rcloneBin: () => 'rclone', broadcast() { }, log() { } });
    clearInterval(pm._sweep);
    const mpH = path.join(T, 'held-' + tag); fs.mkdirSync(mpH);
    const rec = { id: 'mas-h', dir: 'pull', hostId: 'h1', mountpoint: mpH }; pm._state.mounts.push(rec);
    const kid = CP.spawn('sleep', ['30'], { stdio: 'ignore' }); await new Promise((r) => kid.once('spawn', r));   // the child «asleep»: a real pid, ended by this leg
    const f = fake((cmd, args, o) => { if (o.onTimeout) o.onTimeout(kid.pid); return { started: true, timedOut: true, code: null, pid: kid.pid }; });   // killed at its bound, its end never told
    CS.setChildStarter(f);
    try {
      await pm._probeBare(rec); const n1 = f.calls.length;
      await pm._probeBare(rec); const n2 = f.calls.length;   // it lives: the single flight holds
      kid.kill('SIGKILL'); await until(() => PIM.statOf(kid.pid) === null);
      await pm._probeBare(rec); const n3 = f.calls.length;   // gone, asked of /proc: the folder asked again
      return { n1, n2, n3 };
    } finally { CS.setChildStarter(S); try { kid.kill('SIGKILL'); } catch { } }
  };
  const hN = await heldRun(MMOD, 'now');
  const hR = await heldRun(MC.load('src/machine-mounts.js', anchored(MMSRC, "    if (rec && this._probing.has(rec.id) && this._probingHeld?.get(rec.id)?.gone()) { this._probing.delete(rec.id); this._probingAt?.delete(rec.id); this._probeSaid?.delete(rec.id); this._probingHeld.delete(rec.id); this._probingTok?.delete(rec.id); }\n", '', 'B-323e the /proc ask cut'), 'held-cut'), 'cut');
  ok(hN.n1 === 1 && hN.n2 === 1 && hN.n3 === 2 && hR.n1 === 1 && hR.n3 === 1,
    `③b a bare folder's probe killed at its bound whose end is never told: while its child lives, NO second listing (${hN.n2}); once /proc says it is gone, asked again (${hN.n3}) — RED the /proc ask cut: never asked again (${hR.n3})`, { hN, hR });

  console.log('④ the daemon: a direct start in this unit (主开发 r1185) — its number');
  const rss = Math.round(process.memoryUsage().rss / 1048576), hold = Math.max(...b.daemonHolds);
  console.log(`  THE DAEMON'S NUMBER: its start held this process's loop ${hold.toFixed(1)} ms (the two: ${b.daemonHolds.map((x) => x.toFixed(1)).join(' / ')} ms); the longest loop gap across the whole reconnect ${b.gap.toFixed(1)} ms; this process ${rss} MB RSS (the hub's is 4.5–5 GB: a fork's cost grows with it — B-91aa measured about 1 s a start at 5 GB)`);
  ok(b.daemonHolds.length === 2, `④ the daemon is the one start left on the main process (one per record: ${b.daemonHolds.length}); its number printed above (the rule — under the boot law's 250 ms it stays direct — is 主开发's)`, b.daemonHolds);
} finally {
  try { CS.setChildStarter(S); S.closePipe(); } catch { }
  fs.rmSync(T, { recursive: true, force: true });
}
report();
