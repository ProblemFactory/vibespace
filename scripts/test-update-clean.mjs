#!/usr/bin/env node
// lane hub-sync-holds rank 12a round 2 — A RESTART CHANGES NO VERSION; THE ONE UPDATE ROAD LEAVES THE CHECKOUT CLEAN (the owner,
// 2026-11-11: «去掉吧» — no boot runs an update; the acceptance panel: the pins that left with src/server/auto-update.js, and a
// pull that could come back unseen). FAST: in-process + bash / git on a scratch checkout, npm and systemctl stubbed, no network.
//   ① THE UPDATE-DOOR CENSUS (scripts/update-door-census.mjs): every call in src/ + server.js that would pull, fetch, merge,
//     npm-install or build VibeSpace's own checkout — sync or async, bare, a member, or through a helper — is a ROW; the ONE
//     update door is ⚙ → Update VibeSpace… (POST /api/self-update → scripts/update.sh). A new site is red; plants prove it.
//   ② THE UPDATE ROAD (scripts/update.sh, the one door) over a scratch checkout whose origin is a local bare repo: a tracked
//     data/bin helper the boot regenerated and a lockfile an earlier npm left dirty are reset BEFORE the pull (never the
//     last-resort stash); the tree is clean after it, twice in a row; an admin's bare `git pull --ff-only` after it succeeds;
//     a FAILED build leaves the tree clean too (the EXIT trap) and says so.
// Run: node scripts/test-update-clean.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { census } from './update-door-census.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 900) : ''}`); }
};
if (process.platform === 'win32') { console.log('SKIP — scripts/update.sh is the hub / pod road (bash)'); process.exit(0); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-update-clean-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });

console.log('① the update-door census — the ONE road that updates VibeSpace is ⚙ → Update (scripts/update.sh)');
{
  // [file, scope, n, class, why] — class: door (the ONE update road, a person's act)
  const ROWS = [
    ['src/server/ops-routes.js', 'create > route:POST /api/self-update', 1, 'door', 'THE update road — ⚙ → Update VibeSpace… (a person\'s act): it fetches the newest scripts/update.sh and runs it in a shell terminal (pull, install, build, restart); never on a boot, never on a timer'],
  ];
  const key = (s) => `${s.file}|${s.scope}`;
  const judge = (sites, rows) => {
    const got = new Map(); for (const s of sites) got.set(key(s), (got.get(key(s)) || 0) + 1);
    const problems = [];
    for (const [k, n] of got) { const r = rows.find((x) => `${x[0]}|${x[1]}` === k); if (!r) problems.push(`UNROWED: ${k} (${n}) — ${sites.filter((s) => key(s) === k).map((s) => `${s.line}: ${s.what}`).join(', ')}`); else if (r[2] !== n) problems.push(`COUNT: ${k} has ${n}, its row says ${r[2]}`); }
    for (const r of rows) if (!got.has(`${r[0]}|${r[1]}`)) problems.push(`DEAD ROW: ${r[0]} «${r[1]}» claims no site`);
    return problems;
  };
  const t0 = Date.now(); const C = census(REPO); const took = Date.now() - t0;
  const problems = judge(C.sites, ROWS);
  ok(`every call that would update VibeSpace's own checkout or bundle is a row (${C.sites.length} site(s) over ${C.files} files, ${took} ms) — and the ONE door is ⚙ → Update`, !problems.length && ROWS.filter((r) => r[3] === 'door').length === 1, problems);
  ok('every row says what it is and why', ROWS.every((r) => ['door'].includes(r[3]) && String(r[4]).length > 40));
  // CONTROLS — each a plant the census must see (a pull that comes back through a module, async, behind the old guard: the panel's M1c)
  const plant = (rel, src) => judge(census(REPO, { patch: { [rel]: src } }).sites, ROWS).filter((p) => p.startsWith('UNROWED') && p.includes(rel));
  const c1 = plant('src/server/boot-pull.js', "const { execFile } = require('child_process');\nmodule.exports = (dir, env) => execFile('git', ['-C', dir, 'pull', '--ff-only'], { env }, () => { });\n");
  const c2 = plant('src/server/x-helper.js', "const run = require('./run.js');\nasync function refresh(dir) { return run('git', ['-C', dir, 'fetch', 'origin']); }\nmodule.exports = { refresh };\n");
  const c3 = plant('src/server/x-shell.js', "const cp = require('child_process');\nfunction go() { cp.exec('git pull --ff-only && npm install', () => { }); }\nmodule.exports = { go };\n");
  const c4 = plant('src/server/x-build.js', "const { spawn } = require('child_process');\nexports.build = () => spawn('npm', ['run', 'build'], { stdio: 'ignore' });\n");
  const c5 = plant('src/server/x-words.js', "const { execFile } = require('child_process');\nexports.v = () => execFile('node', ['--version'], (e) => { if (e) console.log('run npm install, then git pull'); });\n");
  ok('CONTROLS: an async execFile(\'git\', [... \'pull\']) in a new module (the panel\'s M1c) RED; a helper run(\'git\', [... \'fetch\']) RED; cp.exec(\'git pull … && npm install\') RED; spawn(\'npm\', [\'run\', \'build\']) RED; words inside a callback body are not a site (green)', c1.length === 1 && c2.length === 1 && c3.length === 1 && c4.length === 1 && c5.length === 0, { c1, c2, c3, c4, c5 });
}

console.log('② the update road (scripts/update.sh) leaves the checkout clean — on success, twice, and on a failed build');
{
  const U = path.join(tmp, 'road'), STUB = path.join(U, 'stub'), W = path.join(U, 'work'), O = path.join(U, 'origin.git'), I = path.join(U, 'instance');
  for (const d of [STUB, path.join(U, 'home'), path.join(W, 'scripts'), path.join(W, 'src', 'agentd'), path.join(W, 'data', 'bin')]) fs.mkdirSync(d, { recursive: true });
  // npm as the fleet image's npm 10 behaves: install drops a `"peer": true` from the lockfile; the build stamps src/agentd/version.js
  fs.writeFileSync(path.join(STUB, 'npm'), `#!${process.execPath}
const fs = require('fs'); const a = process.argv.slice(2);
if (a[0] === 'install') { const f = 'package-lock.json'; fs.writeFileSync(f, fs.readFileSync(f, 'utf-8').replace(/,\\n {6}"peer": true/, '')); process.exit(0); }
if (a[0] === 'run' && a[1] === 'build') { if (process.env.STUB_BUILD_FAILS) { fs.writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: "9.9.9" };\\n'); process.exit(1); } const v = JSON.parse(fs.readFileSync('package.json', 'utf-8')).version; fs.writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: "' + v + '-built" };\\n'); process.exit(0); }
process.exit(2);
`, { mode: 0o755 });
  fs.writeFileSync(path.join(STUB, 'systemctl'), '#!/bin/sh\nexit 1\n', { mode: 0o755 }); // no unit: «restart your server process»
  const UENV = { HOME: path.join(U, 'home'), PATH: `${STUB}:${path.dirname(process.execPath)}:/usr/bin:/bin`, LANG: 'C.UTF-8', GIT_AUTHOR_NAME: 'u', GIT_AUTHOR_EMAIL: 'u@example.invalid', GIT_COMMITTER_NAME: 'u', GIT_COMMITTER_EMAIL: 'u@example.invalid', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(U, 'gitconfig'), VIBESPACE_NODE_MIRROR: 'http://127.0.0.1:9' };
  const g = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { env: UENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  for (const f of ['scripts/update.sh', 'scripts/runtime-check.mjs', 'src/runtime-floor.js', 'src/node-runtime.js']) fs.copyFileSync(path.join(REPO, f), path.join(W, f));
  fs.writeFileSync(path.join(W, '.gitignore'), 'data/*\n!data/bin/\nnode_modules/\n'); fs.writeFileSync(path.join(W, 'server.js'), '// stand-in\n');
  const put = (v) => {
    fs.writeFileSync(path.join(W, 'package.json'), `{ "name": "x", "version": "${v}" }\n`);
    fs.writeFileSync(path.join(W, 'package-lock.json'), `{\n  "name": "x",\n  "lockfileVersion": 3,\n  "packages": {\n    "node_modules/a": {\n      "version": "1.0.0",\n      "peer": true\n    }\n  },\n  "v": "${v}"\n}\n`);
    fs.writeFileSync(path.join(W, 'src', 'agentd', 'version.js'), `module.exports = { VERSION: "${v}" };\n`);
    fs.writeFileSync(path.join(W, 'data', 'bin', 'helper.mjs'), `// generated for ${v}\n`);
    g(W, 'add', '-A'); g(W, 'commit', '-qm', `v${v}`); g(W, 'push', '-q', O, 'master');
  };
  execFileSync('git', ['init', '-q', '--bare', O], { env: UENV }); execFileSync('git', ['init', '-q', '-b', 'master', W], { env: UENV }); put('1.0.0');
  execFileSync('git', ['clone', '-q', O, I], { env: UENV });
  const update = (extra = {}) => { const r = spawnSync('bash', ['scripts/update.sh'], { cwd: I, env: { ...UENV, ...extra }, encoding: 'utf8', timeout: 60000 }); return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
  const state = (u) => ({ rc: u.rc, head: g(I, 'log', '-1', '--format=%s'), porc: g(I, 'status', '--porcelain'), stashed: g(I, 'stash', 'list'), refused: /would be overwritten|Aborting/.test(u.out) });
  const bare = () => spawnSync('git', ['-C', I, 'pull', '-q', '--ff-only'], { env: UENV, encoding: 'utf8' }).status;
  // the boot regenerated a tracked data/bin helper, and an earlier npm left the lockfile dirty — both before this update
  fs.writeFileSync(path.join(I, 'data', 'bin', 'helper.mjs'), '// regenerated at boot\n');
  fs.writeFileSync(path.join(I, 'package-lock.json'), fs.readFileSync(path.join(I, 'package-lock.json'), 'utf8').replace(/,\n {6}"peer": true/, ''));
  put('1.0.1'); const s1 = state(update());
  ok('a tracked data/bin helper the boot regenerated and a lockfile an earlier npm left dirty are reset BEFORE the pull: it pulls at its first try (nothing refused, NOTHING STASHED) and leaves the tree clean', s1.rc === 0 && s1.head === 'v1.0.1' && s1.porc === '' && s1.stashed === '' && !s1.refused, s1);
  put('1.0.2'); const s2 = state(update());
  put('1.0.3'); const b2 = bare();
  ok('…clean twice in a row (npm rewriting the lockfile, the build stamping version.js), and an admin\'s bare `git pull --ff-only` after it succeeds', s2.rc === 0 && s2.head === 'v1.0.2' && s2.porc === '' && s2.stashed === '' && b2 === 0 && g(I, 'log', '-1', '--format=%s') === 'v1.0.3', { s2, bare: b2 });
  put('1.0.4'); const u3 = update({ STUB_BUILD_FAILS: '1' }); const s3 = state(u3);
  const said = /✗ The update stopped \(exit 1\)\. The files it rewrites \(package-lock\.json, src\/agentd\/version\.js\) were put back/.test(u3.out);
  put('1.0.5'); const b3 = bare();
  ok('a FAILED build: the update ends non-zero, the tree is CLEAN (the EXIT trap puts back what it rewrote) and it SAYS so — an admin\'s bare pull after it succeeds', s3.rc !== 0 && s3.porc === '' && said && b3 === 0 && g(I, 'log', '-1', '--format=%s') === 'v1.0.5', { s3, said, bare: b3, tail: u3.out.slice(-400) });
  const SH = fs.readFileSync(path.join(REPO, 'scripts', 'update.sh'), 'utf8');
  ok('the trap is installed only AFTER the single-flight lock (an «Another update is already running» exit never touches the tree the running one builds)', SH.indexOf('trap on_exit EXIT') > SH.indexOf('flock -n 9') && SH.indexOf('trap on_exit EXIT') < SH.indexOf('if ! git pull --ff-only; then'));
}

console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
