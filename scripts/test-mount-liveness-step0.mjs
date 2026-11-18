#!/usr/bin/env node
// STEP 0 OF THE MOUNT LIVENESS RULE, AS A GATE (B-23c4, lane bl-tests-e, 2026-11-17 — left by lanes mount-liveness 372968da0 and
// mount-readers-blocked e742f7182, both over budget). The OneDrive fix rests on ONE measured fact: on the hub's rclone mount a
// ROOT getattr (`ls -d <mountpoint>`) is answered by the mount daemon WITHOUT a backend call — so the liveness probe can tell
// «the network stalls» (the backend stopped: ls -d still answers) from «the daemon is stuck» (ls -d hangs). It was measured once
// by hand (/var/tmp/vibespace-lanes/mount-liveness/step0.sh) and never again; an rclone upgrade could change it silently.
// test-mount-liveness is PURE (stubbed probes); test-sync-fs-guard-server SIGSTOPs only the daemon. Nothing stopped the BACKEND.
//
// DRIVEN: a scratch `rclone serve webdav` over a scratch folder (the backend), the hub's OWN mount argv over it
// (src/mount-argv.js rcloneMountArgs — the hub's cached-mount row, a scratch cache dir), and a probe that never waits on a stuck
// child (each `ls -d` / `ls` runs detached and is judged by a deadline):
//   · warm, then COLD with the backend SIGSTOPped past the directory cache: `ls -d` still answers, under 2 s — while a LISTING
//     gets no answer (the premise: the backend really is stopped);
//   · NEGATIVE CONTROL (the probe can say «hung»): the mount DAEMON SIGSTOPped — `ls -d` does NOT answer within 4 s.
// SKIPS by name without rclone (data/bin/rclone, else PATH), fusermount3 or /dev/fuse. Everything lives under one scratch root;
// never a mount of the person's. A heavy suite: the lane that wrote it ran none; its first run is the integrator's.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch, freePort } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const which = (b) => { const r = spawnSync('sh', ['-c', `command -v ${b}`], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
const RCLONE = fs.existsSync(path.join(repo, 'data/bin/rclone')) ? path.join(repo, 'data/bin/rclone') : which('rclone');
const FUSERMOUNT = which('fusermount3') || which('fusermount');
if (!RCLONE || !FUSERMOUNT || !fs.existsSync('/dev/fuse')) { console.log(`SKIP: step 0 needs rclone (data/bin/rclone or PATH) + fusermount3 + /dev/fuse (rclone ${!!RCLONE}, fusermount ${!!FUSERMOUNT}, /dev/fuse ${fs.existsSync('/dev/fuse')})`); console.log('ALL PASS (0)'); process.exit(0); }
const { ok, report } = checker();   // THE assertion helper (B-1747): a swap throws
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// OUR exit hooks FIRST (registered before scratch() registers the root's removal): resume, unmount, end — so the removal never
// walks a live FUSE mount, nor waits on a stopped daemon (B-23c4 reader; the model's «OURS first»)
let serve = null, mount = null, mounted = false, MNT = null;
const probes = new Set();   // probe children that never answered (a stopped mount leaves them waiting) — ended after SIGCONT
const cleanup = () => {
  for (const c of [serve, mount]) { try { c && process.kill(c.pid, 'SIGCONT'); } catch { } }
  if (mounted) { try { spawnSync(FUSERMOUNT, ['-u', '-z', MNT], { timeout: 5000 }); } catch { } mounted = false; }
  for (const c of [mount, serve, ...probes]) { try { c && c.kill('SIGKILL'); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });
const ROOT = scratch('mount-step0');
const SRC = path.join(ROOT, 'src'), CACHE = path.join(ROOT, 'cache'), LOGS = path.join(ROOT, 'logs'), CFG = path.join(ROOT, 'rclone.conf');
MNT = path.join(ROOT, 'mp');
for (const d of [SRC, path.join(SRC, 'sub'), MNT, CACHE, LOGS]) fs.mkdirSync(d, { recursive: true });
for (let i = 1; i <= 109; i++) fs.writeFileSync(path.join(SRC, `file-${i}.txt`), `f${i}\n`);
fs.writeFileSync(CFG, '');

const isMounted = () => fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').some((l) => l.split(' ')[4] === MNT);   // procfs, never the mount
/** run `cmd args` DETACHED and judge it by a deadline: {ms, rc} when it answered, {hung: true} when it did not (it is kept to end later) */
const probe = (cmd, args, limitMs) => new Promise((res) => {
  const t0 = process.hrtime.bigint(), c = spawn(cmd, args, { stdio: 'ignore' });
  let done = false;
  const timer = setTimeout(() => { if (!done) { done = true; probes.add(c); res({ hung: true }); } }, limitMs);
  c.on('exit', (code) => { if (done) return; done = true; clearTimeout(timer); res({ ms: Number(process.hrtime.bigint() - t0) / 1e6, rc: code }); });
});

// the backend: a local webdav over SRC
const PORT = await freePort();
serve = spawn(RCLONE, ['serve', 'webdav', SRC, '--addr', `127.0.0.1:${PORT}`, '--config', CFG], { stdio: ['ignore', fs.openSync(path.join(LOGS, 'serve.log'), 'a'), fs.openSync(path.join(LOGS, 'serve.log'), 'a')] });
const portOpen = () => new Promise((res) => { const so = net.connect(PORT, '127.0.0.1'); so.on('connect', () => { so.destroy(); res(true); }); so.on('error', () => res(false)); });
for (let i = 0; i < 50 && !(await portOpen()); i++) await sleep(100);
// the hub's OWN mount argv (its cached-mount row) over that backend
const MA = require(path.join(repo, 'src/mount-argv.js'));
// the flags THIS rclone knows, as the hub asks them (mounts.js _rcloneHasFlag): on 1.69.3 the hub mounts in `full` mode with the
// fast fingerprint and read-ahead — the mode the rule must hold in (the rc socket is left out: it serves no getattr)
const FLAGS = spawnSync(RCLONE, ['help', 'flags'], { encoding: 'utf8', timeout: 20000 }).stdout || '';
const hasFlag = (name) => new RegExp(`(^|\\s)--${name.replace(/[-]/g, '\\-')}(\\s|=|$)`, 'm').test(FLAGS);
const argv = MA.rcloneMountArgs({ row: null, remote: 'dav:', mountpoint: MNT, cacheDir: CACHE, hasFlag });
const env = { ...process.env, RCLONE_CONFIG_DAV_TYPE: 'webdav', RCLONE_CONFIG_DAV_URL: `http://127.0.0.1:${PORT}`, RCLONE_CONFIG_DAV_VENDOR: 'other' };
mount = spawn(RCLONE, [...argv, '--config', CFG], { env, stdio: ['ignore', fs.openSync(path.join(LOGS, 'mount.log'), 'a'), fs.openSync(path.join(LOGS, 'mount.log'), 'a')] });
for (let i = 0; i < 100 && !(mounted = isMounted()); i++) await sleep(100);
// every tool is here: a mount that does not come up is RED, never a skip — an rclone that refuses a flag of the hub's argv is the
// very regression this gate exists for
ok(mounted, 'rclone mounts the scratch backend with the hub\'s argv', fs.readFileSync(path.join(LOGS, 'mount.log'), 'utf8').slice(-600));
if (!mounted) { report(); }
const ttlMs = MA.durationMs(MA.dirCacheOf(null).ttl) || 5000;   // the attribute / directory cache the argv sets
console.log(`  (rclone ${spawnSync(RCLONE, ['version'], { encoding: 'utf8' }).stdout.split('\n')[0]} · the hub's argv: ${argv.slice(3).join(' ').slice(0, 160)} · cache ttl ${ttlMs} ms)`);

console.log('① warm, then cold with the BACKEND stopped: the root getattr is the daemon\'s own');
const warm = await probe('ls', ['-d', MNT], 5000), warmList = await probe('ls', [MNT], 10000);
ok(!warm.hung && warm.rc === 0 && !warmList.hung && warmList.rc === 0, `warm: ls -d answers (${warm.ms?.toFixed?.(0)} ms) and a listing answers (${warmList.ms?.toFixed?.(0)} ms)`, { warm, warmList });
process.kill(serve.pid, 'SIGSTOP');
await sleep(ttlMs + 1500);   // past the daemon's directory cache (the argv's --dir-cache-time) AND the kernel's attribute cache: truly cold
const cold = await probe('ls', ['-d', MNT], 2000);
ok(!cold.hung && cold.rc === 0, `cold, the backend SIGSTOPped past the cache's ${ttlMs} ms: ls -d STILL answers (${cold.hung ? 'hung' : cold.ms.toFixed(0) + ' ms'}) — the root getattr needs no backend call (the rule the liveness probe rests on)`, cold);
const coldList = await probe('ls', [MNT], 3000);
ok(coldList.hung === true, 'PREMISE: a LISTING with the backend stopped gets no answer in 3 s — the backend really is stopped (a stop that missed would pass the leg above for nothing)', coldList);
process.kill(serve.pid, 'SIGCONT');
await sleep(1000);
const back = await probe('ls', ['-d', MNT], 5000);
ok(!back.hung && back.rc === 0, `the backend resumed: ls -d answers (${back.ms?.toFixed?.(0)} ms)`, back);

console.log('② NEGATIVE CONTROL: the mount DAEMON stopped — the same probe says «hung»');
process.kill(mount.pid, 'SIGSTOP');
await sleep(2500);   // past the KERNEL's attribute cache (rclone's --attr-timeout, 1 s by default): the getattr must reach the daemon
const stuck = await probe('ls', ['-d', MNT], 4000);
ok(stuck.hung === true, 'the daemon SIGSTOPped: ls -d does NOT answer within 4 s — the probe can tell a stuck daemon from a stalled network', stuck);
process.kill(mount.pid, 'SIGCONT');
await sleep(1000);
const after = await probe('ls', ['-d', MNT], 5000);
ok(!after.hung && after.rc === 0, `the daemon resumed: ls -d answers again (${after.ms?.toFixed?.(0)} ms)`, after);

report();
