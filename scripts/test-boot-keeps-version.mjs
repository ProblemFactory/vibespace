#!/usr/bin/env node
// lane hub-sync-holds rank 12a — A RESTART KEEPS ITS VERSION (the owner, 2026-11-11: «去掉吧»). HEAVY: boots a real server.
// A scratch clone whose ORIGIN is one commit AHEAD (a local bare repo — no network): the boot must spawn NO git and NO npm
// child (counted by wrappers first on PATH), the checkout's HEAD and version must be what they were, and the «a newer version
// exists» notice (GET /api/version: `latest` from the canonical package.json — here a local fixture dir) must still say so.
// LEG 1: the checkout is a per-process scratch dir (scripts/scratch.mjs, under /tmp — the root endRootedProcesses ends, §57b):
// the WHOLE boot path spawns no git pull / fetch / checkout and no npm, keeps the version, and still tells.
// LEG 2 (round 2 — the old boot skipped its pull on a THROWAWAY root, so a pull behind that guard would hide from leg 1): a
// second checkout under /var/tmp, outside /tmp and outside the server's own os.tmpdir(), git and npm STAND-INS on its private
// PATH — 0 calls. The update-door census (scripts/test-update-clean.mjs) is the fast pin for any code that would pull.
// Run: node scripts/test-boot-keeps-version.mjs
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, vncEnv, scratch, endRootedProcesses } from './scratch.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VNC_ENV = await vncEnv();
const PORT = await freePort();
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}${e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = scratch('boot-keeps-version'); // per-process (scripts/scratch.mjs)
fs.rmSync(BASE, { recursive: true, force: true }); fs.mkdirSync(BASE, { recursive: true });
let srv = null;
process.on('exit', () => { try { if (srv && srv.exitCode == null && srv.signalCode == null) srv.kill('SIGKILL'); } catch { } try { endRootedProcesses(BASE); } catch { } try { fs.rmSync(BASE, { recursive: true, force: true }); } catch { } });
const GENV = { PATH: process.env.PATH, HOME: path.join(BASE, 'home'), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t.invalid', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
fs.mkdirSync(GENV.HOME, { recursive: true });
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { env: GENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).trim();

console.log('rank 12a — a boot with origin one commit ahead keeps its version, runs no git / npm, still tells');
// THE CHECKOUT: this tree's server, committed as ONE commit; ORIGIN = a bare clone of it with one more commit (a newer version)
const WORK = path.join(BASE, 'work'), ORIGIN = path.join(BASE, 'origin.git'), SEED = path.join(BASE, 'seed');
fs.mkdirSync(WORK, { recursive: true });
for (const f of ['server.js', 'package.json', 'src', 'public', 'data/bin']) fs.cpSync(path.join(REPO, f), path.join(WORK, f), { recursive: true });
fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(WORK, 'node_modules'));
fs.writeFileSync(path.join(WORK, '.gitignore'), 'node_modules\ndata/*\n!data/bin/\n');
execFileSync('git', ['init', '-q', '-b', 'master', WORK], { env: GENV });
git(WORK, 'add', '-A'); git(WORK, 'commit', '-qm', 'the running version');
execFileSync('git', ['clone', '-q', '--bare', WORK, ORIGIN], { env: GENV });
execFileSync('git', ['clone', '-q', ORIGIN, SEED], { env: GENV });
const version = JSON.parse(fs.readFileSync(path.join(WORK, 'package.json'), 'utf8')).version;
const newer = version.replace(/(\d+)$/, (d) => String(Number(d) + 1));
{ const pj = path.join(SEED, 'package.json'); fs.writeFileSync(pj, fs.readFileSync(pj, 'utf8').replace(`"version": "${version}"`, `"version": "${newer}"`)); }
git(SEED, 'commit', '-qam', 'a newer version'); git(SEED, 'push', '-q', 'origin', 'master');
git(WORK, 'remote', 'add', 'origin', ORIGIN); git(WORK, 'fetch', '-q', 'origin'); git(WORK, 'branch', '-q', '--set-upstream-to=origin/master', 'master');
const headBefore = git(WORK, 'rev-parse', 'HEAD');
ok('the scratch clone is one commit BEHIND its origin (the state an update would change)', git(WORK, 'rev-list', '--count', 'HEAD..origin/master') === '1' && newer !== version, { version, newer });
// THE COUNTERS: `git` and `npm` wrappers first on PATH log every call the server makes, then run the real one
const BIN = path.join(BASE, 'bin'); fs.mkdirSync(BIN);
const LOG = path.join(BASE, 'children.log');
for (const name of ['git', 'npm']) {
  const real = execFileSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8', env: { PATH: process.env.PATH } }).trim();
  fs.writeFileSync(path.join(BIN, name), `#!/bin/sh\necho "${name} $*" >> '${LOG}'\nexec '${real}' "$@"\n`, { mode: 0o755 });
}
// the canonical package.json the notice reads (VIBESPACE_CHANGELOG_FIXTURE_DIR, test-only): the newer version
const CANON = path.join(BASE, 'canonical'); fs.mkdirSync(CANON);
fs.writeFileSync(path.join(CANON, 'package.json'), JSON.stringify({ name: 'vibespace', version: newer }));
const env = { PATH: `${BIN}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: GENV.HOME, LANG: 'C.UTF-8', ...VNC_ENV, PORT: String(PORT), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_CHANGELOG_FIXTURE_DIR: CANON, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
// the update switch ON: no NO_AUTO_UPDATE (the owner's unit sets none)
srv = spawn(process.execPath, ['server.js'], { cwd: WORK, env, stdio: ['ignore', 'pipe', 'pipe'] });
let bootLog = ''; srv.stdout.on('data', (d) => { bootLog += d; }); srv.stderr.on('data', (d) => { bootLog += d; });
let up = false; const t0 = Date.now();
for (let i = 0; i < 240 && !up; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/home`); up = true; } catch { await sleep(250); } }
ok('the server boots and answers', up, bootLog.slice(-1500));
const bootCalls = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean) : [];
const updating = bootCalls.filter((l) => /^git (?:pull|fetch|checkout|merge|reset)\b|^npm /.test(l));
ok(`the boot spawned NO update child — ${bootCalls.length} git / npm call(s) in its first ${Math.round((Date.now() - t0) / 1000)} s, none a pull / fetch / checkout / npm (each named)`, up && updating.length === 0 && !/\[auto-update\]|git pull/.test(bootLog), { bootCalls, log: bootLog.split('\n').filter((l) => /auto-update|git pull/.test(l)) });
const headAfter = git(WORK, 'rev-parse', 'HEAD');
const vAfter = JSON.parse(fs.readFileSync(path.join(WORK, 'package.json'), 'utf8')).version;
ok('the version after the boot is the version before (HEAD unchanged, package.json unchanged)', headAfter === headBefore && vAfter === version, { headBefore, headAfter, version, vAfter });
const v = up ? await (await fetch(`http://127.0.0.1:${PORT}/api/version?fresh=1`)).json() : null;
ok(`the «a newer version exists» notice still tells (GET /api/version: version ${version}, latest ${newer}) — and applies nothing`, !!v && v.version === version && v.latest === newer && git(WORK, 'rev-parse', 'HEAD') === headBefore, v);
srv.kill('SIGTERM');
await new Promise((r) => { const t = setTimeout(r, 5000); srv.once('exit', () => { clearTimeout(t); r(); }); });

// LEG 2 (round 2, the acceptance panel's M1c: a pull behind the old `!throwawayRoot` guard would hide from leg 1, whose checkout
// sits under /tmp) — a boot from a root the old guard did NOT call throwaway: the checkout under /var/tmp, outside /tmp AND
// outside the server's own os.tmpdir() (its TMPDIR is a dir of this suite's /tmp scratch). git and npm on the server's private
// PATH are STAND-INS that log and fail (no real one can run). The server's HOME is in the /tmp scratch, so endRootedProcesses
// ends any child it leaves (rooted by its HOME); nothing outside /tmp is signalled but the server itself, by its handle.
console.log('rank 12a — a boot from a root the old guard did NOT call throwaway: 0 git / npm calls');
const WORK2 = fs.mkdtempSync(path.join('/var/tmp', 'vs-boot-keeps-'));
process.on('exit', () => { try { fs.rmSync(WORK2, { recursive: true, force: true }); } catch { } });
execFileSync('git', ['clone', '-q', ORIGIN, WORK2], { env: GENV });
git(WORK2, 'reset', '-q', '--hard', 'HEAD~1'); // the running version — origin/master one commit AHEAD
fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(WORK2, 'node_modules'));
const head2 = git(WORK2, 'rev-parse', 'HEAD');
const BIN2 = path.join(BASE, 'bin2'), LOG2 = path.join(BASE, 'children2.log'), TMP2 = path.join(BASE, 'tmp2'), HOME2 = path.join(BASE, 'home2');
for (const d of [BIN2, TMP2, HOME2]) fs.mkdirSync(d, { recursive: true });
for (const name of ['git', 'npm']) fs.writeFileSync(path.join(BIN2, name), `#!/bin/sh\necho "${name} $*" >> '${LOG2}'\nexit 1\n`, { mode: 0o755 });
const oldGuard = [TMP2, '/tmp'].some((t) => (path.resolve(WORK2) + path.sep).startsWith(path.resolve(t) + path.sep)); // server.js's own test, with its TMPDIR
ok('the second checkout is one the OLD guard would NOT call throwaway (outside /tmp and outside the server\'s os.tmpdir()) and is one commit BEHIND its origin', !oldGuard && git(WORK2, 'rev-list', '--count', 'HEAD..origin/master') === '1', { WORK2, TMP2, oldGuard });
const PORT2 = await freePort();
const env2 = { PATH: `${BIN2}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: HOME2, TMPDIR: TMP2, LANG: 'C.UTF-8', ...(await vncEnv()), PORT: String(PORT2), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_CHANGELOG_FIXTURE_DIR: CANON, VIBESPACE_NODE_MIRROR: 'http://127.0.0.1:9', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
const srv2 = spawn(process.execPath, ['server.js'], { cwd: WORK2, env: env2, stdio: ['ignore', 'pipe', 'pipe'] });
let log2 = ''; srv2.stdout.on('data', (d) => { log2 += d; }); srv2.stderr.on('data', (d) => { log2 += d; });
process.on('exit', () => { try { if (srv2.exitCode == null && srv2.signalCode == null) srv2.kill('SIGKILL'); } catch { } });
let up2 = false; const t2 = Date.now();
for (let i = 0; i < 240 && !up2; i++) { try { await fetch(`http://127.0.0.1:${PORT2}/api/home`); up2 = true; } catch { await sleep(250); } }
await sleep(2000); // the boot's own async steps after listen (an update behind a guard would have started by now)
const calls2 = fs.existsSync(LOG2) ? fs.readFileSync(LOG2, 'utf8').split('\n').filter(Boolean) : [];
ok(`a boot from that root spawned NO git and NO npm at all — ${calls2.length} call(s) in its first ${Math.round((Date.now() - t2) / 1000)} s (stand-ins on its private PATH, each logged)`, up2 && calls2.length === 0 && !/\[auto-update\]|git pull/.test(log2), { up2, calls2, log: log2.split('\n').filter((l) => /auto-update|git pull|Error/.test(l)).slice(0, 8) });
const v2 = up2 ? await (await fetch(`http://127.0.0.1:${PORT2}/api/version?fresh=1`)).json() : null;
ok(`…its version is the one it had (HEAD unchanged) and the «a newer version exists» notice still tells (version ${version}, latest ${newer})`, git(WORK2, 'rev-parse', 'HEAD') === head2 && !!v2 && v2.version === version && v2.latest === newer, v2);
srv2.kill('SIGTERM');
await new Promise((r) => { const t = setTimeout(r, 5000); srv2.once('exit', () => { clearTimeout(t); r(); }); });

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
