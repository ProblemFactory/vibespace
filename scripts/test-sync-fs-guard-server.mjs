#!/usr/bin/env node
// test-sync-fs-guard-server — lane hub-fuse-sync-guard, the scratch-server leg. 2026-10-23 21:56 PT the production hub
// answered nothing for 6.5 min: its main thread waited in the kernel's FUSE wait inside a synchronous fs call on an
// rclone storage mount. Over a REAL FUSE mount (rclone mount :local:, its daemon SIGSTOPped = a mount that answers
// nothing) and a REAL server.js on a scratch worktree of this tree:
//   ① THE GUARD (on by default): a door that reads a person's path synchronously (POST /api/tasks/import) on the storage
//      mount is REFUSED by name before the syscall — the answer carries the refusal, the journal names the call, its
//      site and the mount once
//   ② the mount HUNG (its daemon stopped; a child's stat proves it): the same door still answers at once and the server
//      keeps answering (GET /api/boot DURING the refusal)
//   ③ CONTROL — mounts.mainThreadSyncGuard false (log only): the same call on the hung mount HOLDS THE WHOLE SERVER (GET
//      /api/boot times out) — and the witness names it: the watchdog thread WHILE it holds (fn, path, the kernel's wait),
//      the canary's line at its return (fn, path, ms, the storage mount, src/task-groups.js importFromFile) and a For-you
//      item naming the call beside who presses the mount
// SKIPs without rclone, fusermount3 or /dev/fuse (the Actions runner).
import { execSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scratch, scratchHome, freePort, vncEnv, endRootedProcesses, withoutVendorKeys } from './scratch.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const which = (b) => { const r = spawnSync('sh', ['-c', `command -v ${b}`], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
const RCLONE = which('rclone'), FUSERMOUNT = which('fusermount3') || which('fusermount');
if (!RCLONE || !FUSERMOUNT || !fs.existsSync('/dev/fuse')) { console.log(`SKIP: a real FUSE mount needs rclone + fusermount3 + /dev/fuse (rclone ${!!RCLONE}, fusermount ${!!FUSERMOUNT}, /dev/fuse ${fs.existsSync('/dev/fuse')})`); console.log('ALL PASS (0)'); process.exit(0); }
const REFUSAL = 'refused: a synchronous fs call on a storage mount from the main thread';
let passed = 0, failed = 0;
const ok = (c, n, e) => { if (c) { passed++; console.log(`  ✓ ${n}`); } else { failed++; console.error(`  ✗ ${n}${e !== undefined ? '\n    ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// the exit hooks run in order: OURS first (unmount, end the daemon), then the scratch dirs' removal (a mounted dir stays)
let rclone = null, srv = null, mounted = false, wt = null, MNT = null;
const cleanup = () => {
  try { rclone && process.kill(rclone.pid, 'SIGCONT'); } catch { }
  try { srv && srv.kill('SIGKILL'); } catch { }
  try { wt && endRootedProcesses(wt); } catch { }
  if (mounted) { try { spawnSync(FUSERMOUNT, ['-u', '-z', MNT], { timeout: 5000 }); } catch { } }
  try { rclone && rclone.kill('SIGKILL'); } catch { }
  try { wt && execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(1); });
const VNC_ENV = await vncEnv();
wt = scratch('sfguard-wt'); MNT = scratch('sfguard-mnt');
const SRC = scratch('sfguard-src'), LOGS = scratch('sfguard-logs');
const HOME = scratchHome('sfguard-home', fs);
for (const d of [SRC, MNT, LOGS]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(SRC, 'task.md'), '---\nid: T-sfguard\ntitle: A task file on a storage mount\n---\n\nThe guard reads this only off the main thread.\n');
const TASK = path.join(MNT, 'task.md');

const isMounted = () => fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').some((l) => l.split(' ')[4] === MNT);   // procfs, never the mount
// the mount: rclone over a local folder, no caches (a stat goes to the daemon — and waits while it is stopped)
rclone = spawn(RCLONE, ['mount', `:local:${SRC}`, MNT, '--vfs-cache-mode', 'off', '--dir-cache-time', '0s', '--attr-timeout', '0s', '--poll-interval', '0', '--config', '/dev/null'], { stdio: ['ignore', fs.openSync(path.join(LOGS, 'rclone.log'), 'a'), fs.openSync(path.join(LOGS, 'rclone.log'), 'a')] });
for (let i = 0; i < 100 && !(mounted = isMounted()); i++) await sleep(100);
if (!mounted) { console.log(`SKIP: rclone could not mount here (${fs.readFileSync(path.join(LOGS, 'rclone.log'), 'utf8').slice(-300)})`); console.log('ALL PASS (0)'); process.exit(0); }

// a scratch worktree of THIS tree (what is about to ship)
try { execSync(`git worktree remove --force ${wt}`, { cwd: repo, stdio: 'ignore' }); } catch { }
execSync(`git worktree add --detach ${wt} HEAD`, { cwd: repo, stdio: 'ignore' });
for (const f of ['src', 'public', 'server.js', 'package.json']) execSync(`rm -rf ${wt}/${f} && cp -r ${repo}/${f} ${wt}/${f}`);
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
fs.mkdirSync(path.join(wt, 'data'), { recursive: true });
const PORT = await freePort();
const FIXTURE = path.join(LOGS, 'changelog'); fs.mkdirSync(FIXTURE);
let logFile = null;
const start = (tag, settings = null) => {
  if (settings) fs.writeFileSync(path.join(wt, 'data', 'settings.json'), JSON.stringify(settings));
  logFile = path.join(LOGS, `server-${tag}.log`);
  const fd = fs.openSync(logFile, 'a');
  srv = spawn(process.execPath, ['server.js'], { cwd: wt, env: { ...withoutVendorKeys(process.env), ...VNC_ENV, HOME, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_PASSWORD: '', VIBESPACE_CHANGELOG_FIXTURE_DIR: FIXTURE }, stdio: ['ignore', fd, fd] });
};
const stop = async () => { const p = srv; srv = null; if (!p) return; p.kill('SIGKILL'); await new Promise((r) => { if (p.exitCode !== null || p.signalCode) r(); else p.once('exit', r); }); try { endRootedProcesses(wt); } catch { } };
const get = async (p, ms = 2000) => { const t0 = Date.now(); try { const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { signal: AbortSignal.timeout(ms) }); return { status: r.status, body: await r.json().catch(() => null), ms: Date.now() - t0 }; } catch (e) { return { status: 0, error: e.name, ms: Date.now() - t0 }; } };
const importTask = async (ms = 3000) => { const t0 = Date.now(); try { const r = await fetch(`http://127.0.0.1:${PORT}/api/tasks/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: TASK }), signal: AbortSignal.timeout(ms) }); return { status: r.status, body: await r.json().catch(() => null), ms: Date.now() - t0 }; } catch (e) { return { status: 0, error: e.name, ms: Date.now() - t0 }; } };
const untilUp = async (ms = 90000) => { const t0 = Date.now(); for (;;) { const r = await get('/api/boot', 1500); if (r.status === 200) return true; if (Date.now() - t0 > ms) return false; await sleep(250); } };
const log = () => { try { return fs.readFileSync(logFile, 'utf8'); } catch { return ''; } };
const untilLog = async (re, ms = 15000) => { const t0 = Date.now(); for (;;) { const m = re.exec(log()); if (m) return m[0]; if (Date.now() - t0 > ms) return null; await sleep(200); } };

console.log('① the guard refuses a storage mount by name (on by default)');
start('guard');
ok(await untilUp(), 'the scratch server answers (guard on: the default)');
const a = await importTask();
ok(a.status === 400 && a.body && a.body.error === REFUSAL && a.ms < 2000, `POST /api/tasks/import of a file on the storage mount answers the refusal by name in ${a.ms} ms`, a);
const said = await untilLog(new RegExp(`\\[mount-guard\\] readFileSync\\(${esc(TASK)}\\) from src/task-groups\\.js:\\d+ TaskGroupManager\\.importFromFile refused — use SafeFs/async; the mount «${esc(MNT)}»`));
ok(!!said, `the journal names the call, its site and the mount: ${said}`, log().split('\n').filter((l) => /mount-guard/.test(l)));

console.log('② the mount hung: the server keeps answering');
process.kill(rclone.pid, 'SIGSTOP');
const probe = spawnSync('timeout', ['-s', 'KILL', '2', 'stat', TASK], { encoding: 'utf8' }); // a CHILD asks the mount (never this process)
ok(probe.status !== 0 && !/Size:/.test(probe.stdout || ''), `PREMISE: the mount is hung (a child's stat got no answer in 2 s: exit ${probe.status} ${probe.signal || ''})`);
const [b, during] = await Promise.all([importTask(), (async () => { await sleep(50); return get('/api/boot'); })()]);
ok(b.status === 400 && b.body && b.body.error === REFUSAL && b.ms < 1500, `the same door on the HUNG mount answers the refusal at once (${b.ms} ms)`, b);
ok(during.status === 200 && during.ms < 2000, `GET /api/boot during the refusal answers in ${during.ms} ms`, during);
ok((log().match(/\[mount-guard\] readFileSync\(/g) || []).length === 1, 'the refusal is said ONCE per call site (two refusals, one line)');
await stop();

console.log('③ CONTROL — the guard off (log only): the same call holds the whole server, and the witness names it');
start('logonly', { 'mounts.mainThreadSyncGuard': false });
process.kill(rclone.pid, 'SIGCONT');
ok(await untilUp(), 'the scratch server answers (mounts.mainThreadSyncGuard = false)');
process.kill(rclone.pid, 'SIGSTOP');
const held = importTask(30000);
await sleep(300);
const frozen = await get('/api/boot', 2000);
ok(frozen.status === 0, `CONTROL: GET /api/boot gets NO answer while the call waits on the hung mount (${frozen.error || frozen.status}, ${frozen.ms} ms)`, frozen);
const live = await untilLog(new RegExp(`\\[sync-fs\\] the main thread has waited \\d+ s in readFileSync\\(${esc(TASK)}\\) — the kernel: \\S+ in \\S+`), 14000);
ok(!!live, `WHILE it holds, the watchdog thread names the call and the kernel's wait: ${live}`);
process.kill(rclone.pid, 'SIGCONT');   // ≥ 10 s held by now (the watchdog's own threshold): past the For-you item's 5 s
const c = await held;
ok(c.status === 200 || c.status === 400, `the call returns once the mount answers (${c.status} after ${c.ms} ms)`, c);
const allowed = await untilLog(new RegExp(`\\[mount-guard\\] readFileSync\\(${esc(TASK)}\\) from src/task-groups\\.js:\\d+ TaskGroupManager\\.importFromFile ran on the mount «${esc(MNT)}» — mounts\\.mainThreadSyncGuard is off \\(log only\\)`));
ok(!!allowed, `log only: the call ran and was said: ${allowed}`);
const canary = await untilLog(new RegExp(`\\[canary\\] the main loop was held (\\d+) ms — the sync fs call that returned as it resumed: readFileSync\\(${esc(TASK)}\\) (\\d+) ms, under storage mount «${esc(MNT)}» ← src/task-groups\\.js:\\d+ TaskGroupManager\\.importFromFile`));
ok(!!canary && Number(/held (\d+) ms/.exec(canary)[1]) >= 5000, `at its return the canary names fn, path, ms, the storage mount and the caller: ${canary}`);
let item = null;
for (let i = 0; i < 60 && !item; i++) { const r = await get('/api/user-todos'); item = r.body && r.body.todos && (r.body.todos.open || []).find((t) => /waited \d+ s on the folder/.test(t.text || '')); if (!item) await sleep(250); }
ok(item && item.origin === 'server' && new RegExp(`VibeSpace's server waited \\d+ s on the folder ${esc(MNT)} — readFileSync on ${esc(TASK)} from src/task-groups\\.js:\\d+ TaskGroupManager\\.importFromFile`).test(item.text) && /The call came from:/.test(item.detail || ''),
  `the For-you item («This machine») names the call beside who presses the mount: ${item && item.text}`, item);
const after = await get('/api/boot');
ok(after.status === 200, 'and the server answers again');
await stop();

console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
