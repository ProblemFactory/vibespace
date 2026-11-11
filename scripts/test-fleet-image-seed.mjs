#!/usr/bin/env node
// THE CHECKOUT STAYS CLEAN (lane cluster-presets P6 — the owner 2026-10-01
// 23:45 PDT: "为啥每次在集群部署都提示 ⚠ ff pull failed — realigning to
// origin/master (fresh instance)"). Fast tier: in-process, a THROWAWAY git
// origin + clone under the suite's scratch dir, a stub `npm` (a node script)
// that does what the fleet image's npm 10 was measured to do.
//
// Measured: the 3.6.0 image's seed is clean; the dirt landed at a pull + npm
// install under npm 10 (it rewrites package-lock.json) + `npm run build` (it
// re-stamps src/agentd/version.js), and the NEXT bare pull aborted "local
// changes would be overwritten". SINCE lane hub-sync-holds rank 12a (the owner,
// 2026-11-11: «去掉吧») NO boot pulls — an update's ONE road is scripts/update.sh,
// and src/server/auto-update.js (the boot pull + its resets) is DELETED: the
// list below is the one update.sh and the Dockerfile seed step keep.
//
// §1 censuses: the tracked files any build writes, DERIVED from package.json's
//    build scripts (every writeFileSync / --outfile target, followed through
//    `npm run X`) ∩ `git ls-files`, plus npm's own package-lock.json, == the
//    Dockerfile seed step's resets == scripts/update.sh's resets (before the
//    pull AND after the build); every UNTRACKED build output is gitignored
//    (else the seed's porcelain assertion fails the image); the Dockerfile
//    asserts a clean `git status --porcelain` and fails by name; server.js runs
//    no update at boot. The entrypoint says, on every spawn, when an app older
//    than the presets reader sits under the chart's presets volume.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.mjs';
import { GIT_REDIRECTORS, gitEnvFrom } from './git-env.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
for (const k of GIT_REDIRECTORS) delete process.env[k];      // a pre-push hook's GIT_DIR must not redirect the module's git
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
const ROOT = scratch('cpr');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} });

// ═══ §1 censuses ════════════════════════════════════════════════════════
console.log('§1 the lists');
let LIST = []; // the tracked files a build rewrites — DERIVED below (update.sh and the Dockerfile seed step must reset exactly these)
{
  const pkg = JSON.parse(read('package.json'));
  const writes = new Set(); const seen = new Set();
  const walk = (name) => {
    if (seen.has(name) || !pkg.scripts[name]) return; seen.add(name);
    const s = pkg.scripts[name];
    for (const m of s.matchAll(/writeFileSync\(\s*\\?['"]([^'"\\]+)\\?['"]/g)) writes.add(m[1]);
    for (const m of s.matchAll(/--outfile=(\S+)/g)) writes.add(m[1]);
    for (const m of s.matchAll(/npm run ([\w:-]+)/g)) walk(m[1]);
  };
  walk('build');
  ok(writes.size >= 5 && writes.has('src/agentd/version.js') && writes.has('public/bundle.js'), `the build's writers, derived from package.json (${[...writes].join(', ')})`);
  const tracked = new Set(execFileSync('git', ['-C', REPO, 'ls-files', '-z'], { env: gitEnvFrom(process.env), encoding: 'utf-8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean));
  const trackedWrites = [...writes].filter((f) => tracked.has(f));
  const expected = [...new Set(['package-lock.json', ...trackedWrites])].sort();
  LIST = expected;
  ok(expected.includes('package-lock.json') && expected.includes('src/agentd/version.js'), `the list = the tracked files a build writes + npm's lockfile (${expected.join(', ')})`);
  const untracked = [...writes].filter((f) => !tracked.has(f));
  const unignored = untracked.filter((f) => { try { execFileSync('git', ['-C', REPO, 'check-ignore', '-q', f], { env: gitEnvFrom(process.env) }); return false; } catch { return true; } });
  ok(untracked.length >= 4 && !unignored.length, `every UNTRACKED build output is gitignored (${untracked.join(', ')}) — an unignored one would fail the seed's porcelain assertion${unignored.length ? ' — NOT ignored: ' + unignored.join(', ') : ''}`);

  const df = read('deploy/docker/Dockerfile');
  const run = (df.match(/RUN git clone [^\n]*vibespace[^]*?chown -R vibe:vibe \/opt\/vibespace-dist/) || [''])[0];
  const at = (needle) => run.indexOf(needle);
  const dfResets = [...run.matchAll(/git checkout HEAD -- (\S+)/g)].map((m) => m[1]);
  ok(run && JSON.stringify(dfResets.slice().sort()) === JSON.stringify([...LIST].sort()), `the Dockerfile seed step resets exactly the list, one path per checkout (${dfResets.join(', ')})`);
  ok(at('npm ci') > 0 && at('npm run build') > at('npm ci') && dfResets.every((f) => at(`git checkout HEAD -- ${f}`) > at('npm run build')) && at('git status --porcelain') > Math.max(...dfResets.map((f) => at(`git checkout HEAD -- ${f}`))) && /if \[ -n "\$dirty" \]; then[^\n]*exit 1; fi/.test(run) && at('chown -R vibe:vibe') > at('git status --porcelain'), 'the order: npm ci → build → the resets → `git status --porcelain` must be EMPTY or `exit 1` (naming the files) → chown');

  const us = read('scripts/update.sh');
  const pullAt = us.indexOf('if ! git pull --ff-only'); const buildAt = us.indexOf('\nnpm run build\n');
  const resetsAt = (f) => [...us.matchAll(new RegExp(`^git checkout HEAD -- ${f.replace(/[.\/]/g, (c) => '\\' + c)} 2>/dev/null \\|\\| true$`, 'gm'))].map((m) => m.index);
  ok(pullAt > 0 && buildAt > pullAt && LIST.every((f) => resetsAt(f).some((i) => i < pullAt) && resetsAt(f).some((i) => i > buildAt)), 'scripts/update.sh resets every listed file on its own path BEFORE the pull AND AFTER the build');
  const sj = read('server.js');
  // lane hub-sync-holds rank 12a: NO update runs inside the boot — server.js neither pulls nor installs nor builds (an update's
  // ONE road is scripts/update.sh) and the boot-pull module is gone
  ok(!/auto-update/.test(sj) && !/'npm', \['install'/.test(sj) && !/'git', \[[^\]]*'pull'/.test(sj) && !fs.existsSync(path.join(REPO, 'src/server/auto-update.js')), 'server.js runs no update at boot (no pull, no npm call; src/server/auto-update.js deleted): the update road is scripts/update.sh (rank 12a)');
}

// the entrypoint: an app older than the presets reader under the chart's presets volume is SAID on every spawn
{
  const ep = read('deploy/docker/entrypoint.sh');
  const fn = (ep.match(/^presets_reader_check\(\) \{[^]*?^\}/m) || [''])[0];
  ok(fn.length > 0 && /VIBESPACE_PRESETS_DIR/.test(fn) && /src\/server\/cluster-presets\.js/.test(fn), 'the entrypoint defines presets_reader_check (the env + the reader file are its two facts)');
  const loop = ep.slice(ep.indexOf('while true; do'));
  ok(loop.indexOf('presets_reader_check "$APP"') > 0 && loop.indexOf('presets_reader_check "$APP"') < loop.indexOf('node server.js &'), 'it runs inside the respawn loop, before every `node server.js` (an update-restart stops the line once the reader is there)');
  const old = path.join(ROOT, 'ep-old'); const neu = path.join(ROOT, 'ep-new');
  fs.mkdirSync(path.join(neu, 'src/server'), { recursive: true }); fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(path.join(old, 'package.json'), '{\n  "name": "vibespace",\n  "version": "2.369.199"\n}\n');
  fs.writeFileSync(path.join(neu, 'package.json'), '{\n  "name": "vibespace",\n  "version": "2.369.200"\n}\n'); fs.writeFileSync(path.join(neu, 'src/server/cluster-presets.js'), '');
  const said = execFileSync('bash', ['-c', fn + '\npresets_reader_check "$1" 2>&1', 'x', old], { env: { PATH: process.env.PATH, VIBESPACE_PRESETS_DIR: '/etc/vibespace/presets' }, encoding: 'utf-8' });
  ok(/WARNING: company presets are mounted at \/etc\/vibespace\/presets/.test(said) && /this VibeSpace \(2\.369\.199\) predates the presets reader \(2\.369\.200\)/.test(said) && /NO company presets until the app updates/.test(said) && /presets\.volume=false/.test(said), `an old app under the volume: the line names the mount, the app's version, the reader's, and both ways out — ${said.trim().slice(0, 120)}…`);
  const quiet1 = execFileSync('bash', ['-c', fn + '\npresets_reader_check "$1" 2>&1', 'x', neu], { env: { PATH: process.env.PATH, VIBESPACE_PRESETS_DIR: '/etc/vibespace/presets' }, encoding: 'utf-8' });
  const quiet2 = execFileSync('bash', ['-c', fn + '\npresets_reader_check "$1" 2>&1', 'x', old], { env: { PATH: process.env.PATH }, encoding: 'utf-8' });
  ok(quiet1 === '' && quiet2 === '', 'silent for an app with the reader, and for a pod without the volume (the env form)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
