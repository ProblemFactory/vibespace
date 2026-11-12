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
for (const name of ['git', 'npm', 'systemctl']) fs.writeFileSync(path.join(BIN2, name), `#!/bin/sh\necho "${name} $*" >> "\${HSH_CHILD_LOG:-${LOG2}}"\nexit 1\n`, { mode: 0o755 }); // systemctl too: update.sh's restart step must never reach the box's own units
const oldGuard = [TMP2, '/tmp'].some((t) => (path.resolve(WORK2) + path.sep).startsWith(path.resolve(t) + path.sep)); // server.js's own test, with its TMPDIR
ok('the second checkout is one the OLD guard would NOT call throwaway (outside /tmp and outside the server\'s os.tmpdir()) and is one commit BEHIND its origin', !oldGuard && git(WORK2, 'rev-list', '--count', 'HEAD..origin/master') === '1', { WORK2, TMP2, oldGuard });
// THE BOOT'S CLOCK (round 3): a preload records every timer the boot ARMS (its first 15 s) and runs it 50× sooner, so the watch
// below runs up to 30 s on that clock. A real boot arms two 6 h intervals at load (432 s at 50×), so the watch takes its CAPPED branch
// and SEES an update armed up to about 25 minutes after the boot (the panel's plant: update.sh 20 s in); a later one is the static
// update-door census's (scripts/update-door-census.mjs) to catch — the pin's own line says which branch it took
const CLOCK = path.join(BASE, 'boot-clock.cjs');
fs.writeFileSync(CLOCK, `const fs = require('fs'); const LOG = process.env.HSH_CLOCK_LOG, F = 50, t0 = Date.now(), WINDOW = 15000;
const wrap = (orig, kind) => function (fn, ms, ...a) { const d = Number(ms) || 0; if (Date.now() - t0 < WINDOW && d > 1000) { try { fs.appendFileSync(LOG, kind + ' ' + d + '\\n'); } catch { } return orig.call(this, fn, Math.max(20, Math.round(d / F)), ...a); } return orig.call(this, fn, ms, ...a); };
global.setTimeout = wrap(global.setTimeout, 'timeout'); global.setInterval = wrap(global.setInterval, 'interval');
`);
const armed = (log) => { try { return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => { const [kind, ms] = l.split(' '); return { kind, ms: Number(ms) }; }); } catch { return []; } };
const watchBoot = async (srvPort, clockLog) => { // until the longest armed timer (50× sooner) has had its turn, + 2 s; capped at 30 s
  const t0 = Date.now(); let need = 2000;
  while (Date.now() - t0 < Math.min(30000, need)) { const a = armed(clockLog); need = 2000 + Math.max(0, ...a.map((x) => x.ms / 50)); await sleep(250); }
  const a = armed(clockLog); const top = a.reduce((m, x) => (x.ms > m.ms ? x : m), { kind: '-', ms: 0 });
  return { watchedMs: Date.now() - t0, timers: a.length, longest: top, covered: top.ms / 50 + 2000 <= 30000 };
};
const PORT2 = await freePort();
const env2 = { PATH: `${BIN2}:${path.dirname(process.execPath)}:/usr/bin:/bin`, HOME: HOME2, TMPDIR: TMP2, LANG: 'C.UTF-8', ...(await vncEnv()), PORT: String(PORT2), VIBESPACE_SKIP_AGENT_HOOKS: '1', VIBESPACE_CHANGELOG_FIXTURE_DIR: CANON, VIBESPACE_NODE_MIRROR: 'http://127.0.0.1:9', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
const CLOCK2 = path.join(BASE, 'clock2.log');
const srv2 = spawn(process.execPath, ['-r', CLOCK, 'server.js'], { cwd: WORK2, env: { ...env2, HSH_CLOCK_LOG: CLOCK2 }, stdio: ['ignore', 'pipe', 'pipe'] });
let log2 = ''; srv2.stdout.on('data', (d) => { log2 += d; }); srv2.stderr.on('data', (d) => { log2 += d; });
process.on('exit', () => { try { if (srv2.exitCode == null && srv2.signalCode == null) srv2.kill('SIGKILL'); } catch { } });
let up2 = false; const t2 = Date.now();
for (let i = 0; i < 240 && !up2; i++) { try { await fetch(`http://127.0.0.1:${PORT2}/api/home`); up2 = true; } catch { await sleep(250); } }
const w2 = up2 ? await watchBoot(PORT2, CLOCK2) : { watchedMs: 0, timers: 0, longest: { kind: '-', ms: 0 } };
const calls2 = fs.existsSync(LOG2) ? fs.readFileSync(LOG2, 'utf8').split('\n').filter(Boolean) : [];
ok(`a boot from that root spawned NO git, npm or systemctl at all — ${calls2.length} call(s), watched ${w2.covered ? 'past the LONGEST timer the boot armed' : 'for 30 s (capped: a timer over 25 min is NOT watched — named)'} (${w2.longest.ms} ms, a ${w2.longest.kind}; ${w2.timers} timers over 1 s armed in its first 15 s, each run 50× sooner — watched ${Math.round(w2.watchedMs / 1000)} s)`, up2 && w2.timers > 0 && calls2.length === 0 && !/\[auto-update\]|git pull/.test(log2), { up2, calls2, w2, log: log2.split('\n').filter((l) => /auto-update|git pull|Error/.test(l)).slice(0, 8) });
const v2 = up2 ? await (await fetch(`http://127.0.0.1:${PORT2}/api/version?fresh=1`)).json() : null;
ok(`…its version is the one it had (HEAD unchanged) and the «a newer version exists» notice still tells (version ${version}, latest ${newer})`, git(WORK2, 'rev-parse', 'HEAD') === head2 && !!v2 && v2.version === version && v2.latest === newer, v2);
srv2.kill('SIGTERM');
await new Promise((r) => { const t = setTimeout(r, 5000); srv2.once('exit', () => { clearTimeout(t); r(); }); });
// LEG 3 — THE CONTROL: the same checkout with the panel's plant (update.sh spawned 20 s after the boot) — the same watch SEES it
fs.mkdirSync(path.join(WORK2, 'scripts'), { recursive: true }); fs.copyFileSync(path.join(REPO, 'scripts', 'update.sh'), path.join(WORK2, 'scripts', 'update.sh'));
fs.appendFileSync(path.join(WORK2, 'server.js'), "\nsetTimeout(() => require('child_process').spawn('bash', ['scripts/update.sh'], { cwd: __dirname, stdio: 'ignore' }), 20000); // CONTROL PLANT (test-boot-keeps-version leg 3)\n");
const LOG3 = path.join(BASE, 'children3.log'), CLOCK3 = path.join(BASE, 'clock3.log'), PORT3 = await freePort();
const srv3 = spawn(process.execPath, ['-r', CLOCK, 'server.js'], { cwd: WORK2, env: { ...env2, ...(await vncEnv()), PORT: String(PORT3), HSH_CLOCK_LOG: CLOCK3, HSH_CHILD_LOG: LOG3 }, stdio: ['ignore', 'pipe', 'pipe'] });
process.on('exit', () => { try { if (srv3.exitCode == null && srv3.signalCode == null) srv3.kill('SIGKILL'); } catch { } });
let up3 = false;
for (let i = 0; i < 240 && !up3; i++) { try { await fetch(`http://127.0.0.1:${PORT3}/api/home`); up3 = true; } catch { await sleep(250); } }
const w3 = up3 ? await watchBoot(PORT3, CLOCK3) : { watchedMs: 0, timers: 0, longest: { kind: '-', ms: 0 } };
const calls3 = fs.existsSync(LOG3) ? fs.readFileSync(LOG3, 'utf8').split('\n').filter(Boolean) : [];
ok(`CONTROL: the panel's plant (update.sh spawned 20 s after the boot) is SEEN by the same watch — ${calls3.length} stand-in call(s) (e.g. ${JSON.stringify(calls3[0] || '')}), none a real program`, up3 && calls3.some((l) => /^git /.test(l)), { up3, calls3: calls3.slice(0, 6), w3 });
srv3.kill('SIGTERM');
await new Promise((r) => { const t = setTimeout(r, 5000); srv3.once('exit', () => { clearTimeout(t); r(); }); });

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
