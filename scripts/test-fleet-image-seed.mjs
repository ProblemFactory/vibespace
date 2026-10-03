#!/usr/bin/env node
// THE CHECKOUT STAYS CLEAN (lane cluster-presets P6 — the owner 2026-10-01
// 23:45 PDT: "为啥每次在集群部署都提示 ⚠ ff pull failed — realigning to
// origin/master (fresh instance)"). Fast tier: in-process, a THROWAWAY git
// origin + clone under the suite's scratch dir, a stub `npm` (a node script)
// that does what the fleet image's npm 10 was measured to do.
//
// Measured: the 3.6.0 image's seed is clean; the dirt lands at the server's
// boot auto-update (`git pull --ff-only` → `npm install` under npm 10 rewrites
// package-lock.json → `npm run build` re-stamps src/agentd/version.js), and the
// NEXT bare pull aborts "local changes would be overwritten".
//
// §1 censuses: the tracked files any build writes, DERIVED from package.json's
//    build scripts (every writeFileSync / --outfile target, followed through
//    `npm run X`) ∩ `git ls-files`, plus npm's own package-lock.json, ==
//    src/server/auto-update.js BUILD_REWRITTEN_TRACKED == the Dockerfile seed
//    step's resets == scripts/update.sh's resets (before the pull AND after the
//    build); every UNTRACKED build output is gitignored (else the seed's
//    porcelain assertion fails the image); the Dockerfile asserts a clean
//    `git status --porcelain` and fails by name; server.js delegates to the module.
// §2 the REAL module over the throwaway repo: the pre-fix sequence (a copy
//    with the resets neutered) leaves `M package-lock.json` and the next pull
//    ABORTS; the fix pulls, installs, builds and leaves `git status
//    --porcelain` EMPTY, twice in a row; it heals the dirty tree the pre-fix
//    left; a release that forgot to commit version.js still ends clean; an
//    UNNAMED tracked rewrite is named in ONE line, never a failed boot; a
//    failing install is skipped by name.
// §3 (verify r1 ⑤ / ④): a user's OWN edit of the lockfile (a fork) is not
//    thrown away in silence — the before-pull reset keeps ONE copy at
//    data/auto-update/<name>.pre-reset and the line says so (never "the build
//    did it"); the after-build reset never overwrites that copy; CONTROL: a
//    copy without the keep. The entrypoint says, on every spawn, when an app
//    older than the presets reader sits under the chart's presets volume.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
import { GIT_REDIRECTORS, gitEnvFrom } from './git-env.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
for (const k of GIT_REDIRECTORS) delete process.env[k];      // a pre-push hook's GIT_DIR must not redirect the module's git
const AU_PATH = path.join(REPO, 'src/server/auto-update.js');
const AU = require(AU_PATH);
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf-8');
const ROOT = scratch('cpr');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {} });
const M = mutantCopies('cpr-seed', REPO);

// ═══ §1 censuses ════════════════════════════════════════════════════════
console.log('§1 the lists');
const LIST = [...AU.BUILD_REWRITTEN_TRACKED];
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
  ok(JSON.stringify([...LIST].sort()) === JSON.stringify(expected), `BUILD_REWRITTEN_TRACKED = the tracked files a build writes + npm's lockfile (${expected.join(', ')})`);
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
  ok(/require\('\.\/src\/server\/auto-update\.js'\)\.autoUpdate\(\{ repoDir: __dirname \}\)/.test(sj) && !/'npm', \['install'/.test(sj), 'server.js delegates the boot auto-update to the module (no npm call of its own left)');
}

// ═══ §2 the real module over a throwaway repo ══════════════════════════
console.log('§2 pull → install → build, over a throwaway origin');
const STUB = path.join(ROOT, 'stub-bin'); fs.mkdirSync(STUB, { recursive: true });
// the fleet image's npm 10, as measured: `install` drops a `"peer": true` from the lockfile; `run build` stamps version.js (+ an ignored bundle)
fs.writeFileSync(path.join(STUB, 'npm'), `#!${process.execPath}
const fs = require('fs'); const a = process.argv.slice(2);
if (a[0] === 'install') { if (process.env.STUB_INSTALL_FAILS) { console.error('npm ERR! network'); process.exit(1); } const f = 'package-lock.json'; fs.writeFileSync(f, fs.readFileSync(f, 'utf-8').replace(/,\\n {6}"peer": true/, '')); process.exit(0); }
if (a[0] === 'run' && a[1] === 'build') { if (process.env.STUB_BUILD_FAILS) { fs.writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: "9.9.9" };\\n'); console.error('build failed'); process.exit(1); } const v = JSON.parse(fs.readFileSync('package.json', 'utf-8')).version; fs.writeFileSync('src/agentd/version.js', 'module.exports = { VERSION: ' + JSON.stringify(v) + ' };\\n'); fs.mkdirSync('public', { recursive: true }); fs.writeFileSync('public/bundle.js', '/* ' + v + ' */'); if (process.env.STUB_BUILD_TOUCHES) fs.appendFileSync(process.env.STUB_BUILD_TOUCHES, '\\n<!-- built -->\\n'); process.exit(0); }
process.exit(2);
`, { mode: 0o755 });
const GENV = { ...gitEnvFrom(process.env), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { env: GENV, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const lock = (v) => JSON.stringify({ name: 'x', version: v, lockfileVersion: 3, packages: { '': { name: 'x', version: v }, 'node_modules/a': { version: '1.0.0', dev: true, peer: true } } }, null, 2) + '\n';
let n = 0;
function world(tag) {
  const base = path.join(ROOT, `${tag}-${++n}`);
  const origin = path.join(base, 'origin.git'); const work = path.join(base, 'work'); const inst = path.join(base, 'instance');
  fs.mkdirSync(path.join(work, 'src/agentd'), { recursive: true }); fs.mkdirSync(path.join(work, 'public'), { recursive: true });
  execFileSync('git', ['init', '-q', '--bare', origin], { env: GENV });
  execFileSync('git', ['init', '-q', '-b', 'master', work], { env: GENV });
  const put = (v, { versionJs = v } = {}) => {
    fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'x', version: v }, null, 2) + '\n');
    fs.writeFileSync(path.join(work, 'package-lock.json'), lock(v));
    fs.writeFileSync(path.join(work, 'src/agentd/version.js'), 'module.exports = { VERSION: ' + JSON.stringify(versionJs) + ' };\n');
    fs.writeFileSync(path.join(work, 'NOTES.txt'), '# x ' + v + '\n');
    fs.writeFileSync(path.join(work, '.gitignore'), 'public/bundle.js\ndata/*\n!data/bin/\n');   // the real repo's rule: data/ ignored, data/bin tracked
    fs.mkdirSync(path.join(work, 'data/bin'), { recursive: true }); fs.writeFileSync(path.join(work, 'data/bin/helper.mjs'), '// generated for ' + v + '\n');
    git(work, 'add', '-A'); git(work, 'commit', '-qm', 'v' + v); git(work, 'push', '-q', origin, 'master');
  };
  put('1.0.0');
  execFileSync('git', ['clone', '-q', origin, inst], { env: GENV });
  return { inst, put };
}
const quietLog = () => { const lines = []; return { lines, log: { log: (...a) => lines.push(a.join(' ')), warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) } }; };
const run = (mod, inst, extraEnv = {}) => { const q = quietLog(); const out = mod.autoUpdate({ repoDir: inst, env: { ...GENV, ...extraEnv, PATH: STUB + path.delimiter + process.env.PATH }, execPath: path.join(STUB, 'node'), log: q.log }); return { ...out, lines: q.lines }; };
const porcelain = (inst) => git(inst, 'status', '--porcelain');

// the PRE-FIX sequence: the same module with the resets neutered (what server.js did before)
const src = fs.readFileSync(AU_PATH, 'utf-8');
const anchor = "const BUILD_REWRITTEN_TRACKED = Object.freeze(['package-lock.json', 'src/agentd/version.js']);";
ok(src.includes(anchor), 'the control\'s anchor exists in the module');
const PRE = M.load('src/server/auto-update.js', src.replace(anchor, 'const BUILD_REWRITTEN_TRACKED = Object.freeze([]);'), 'prefix');
{
  const w = world('prefix');
  w.put('1.0.1');
  const r1 = run(PRE, w.inst);
  ok(r1.pulled && porcelain(w.inst) === 'M package-lock.json', `CONTROL (the incident): the pre-fix pull → install → build leaves "${porcelain(w.inst)}" — the lockfile npm 10 rewrote`);
  w.put('1.0.2');
  const r2 = run(PRE, w.inst);
  ok(!r2.pulled && /skipped/.test(r2.lines.join('\n')) && git(w.inst, 'log', '-1', '--format=%s') === 'v1.0.1', 'CONTROL: …and the NEXT bare pull ABORTS on it (the instance stays on v1.0.1 — what the admin\'s tool then hard-resets with the warning)');

  // the fix heals exactly that pod
  const r3 = run(AU, w.inst);
  ok(r3.reset.before.includes('package-lock.json') && r3.pulled && git(w.inst, 'log', '-1', '--format=%s') === 'v1.0.2' && porcelain(w.inst) === '', 'the fix on that dirty pod: the pre-pull reset lets the pull fast-forward to v1.0.2, and the tree ends CLEAN');
}
{
  const w = world('fix');
  w.put('1.0.1');
  const r1 = run(AU, w.inst);
  ok(r1.pulled && r1.reset.after.includes('package-lock.json') && porcelain(w.inst) === '' && fs.readFileSync(path.join(w.inst, 'public/bundle.js'), 'utf-8').includes('1.0.1'), 'pull → install → build → reset: `git status --porcelain` EMPTY (the ignored bundle is built, the lockfile back to the commit\'s)');
  w.put('1.0.2');
  const r2 = run(AU, w.inst);
  ok(r2.pulled && r2.reset.before.length === 0 && porcelain(w.inst) === '' && git(w.inst, 'log', '-1', '--format=%s') === 'v1.0.2', 'the NEXT pull needs no reset at all — the checkout was already clean (an admin\'s bare `git pull --ff-only` succeeds too)');
  const r3 = run(AU, w.inst);
  ok(!r3.pulled && r3.skipped === null && porcelain(w.inst) === '', 'nothing new: no install, no build, still clean');
}
{
  const w = world('stale-versionjs');
  w.put('1.0.1', { versionJs: '1.0.0' });                 // a release that forgot to commit the re-stamped version.js
  const r = run(AU, w.inst);
  ok(r.pulled && r.reset.after.includes('src/agentd/version.js') && porcelain(w.inst) === '', 'a release whose committed version.js lags package.json: the build re-stamps it, the reset puts it back — clean');
}
{
  const w = world('unnamed');
  w.put('1.0.1');
  const r = run(AU, w.inst, { STUB_BUILD_TOUCHES: 'NOTES.txt' });
  const named = r.lines.filter((l) => /still modified after the build: NOTES\.txt/.test(l));
  ok(r.pulled && r.skipped === null && JSON.stringify(r.leftover) === '["NOTES.txt"]' && named.length === 1, 'a tracked file a build rewrites that the list does NOT name: ONE line names it (never a failed boot)');
}
{
  const w = world('install-fails');
  w.put('1.0.1');
  const r = run(AU, w.inst, { STUB_INSTALL_FAILS: '1' });
  ok(r.skipped && /Command failed: npm install/.test(r.skipped) && !r.lines.some((l) => /rebuilt successfully/.test(l)), `a failing install is skipped by name (${r.skipped}) — never a throw out of the boot`);
}

{
  const w = world('build-fails');
  w.put('1.0.1');
  const r = run(AU, w.inst, { STUB_BUILD_FAILS: '1' });
  ok(r.pulled && r.skipped && /npm run build/.test(r.skipped) && r.reset.after.includes('package-lock.json') && r.reset.after.includes('src/agentd/version.js') && porcelain(w.inst) === '', 'a build that FAILS after rewriting version.js (the install already rewrote the lockfile): the after-pull reset still runs — skipped by name, the tree clean');
}

{
  const w = world('boot-generated');
  fs.writeFileSync(path.join(w.inst, 'data/bin/helper.mjs'), '// re-generated at boot by a newer generator\n');   // the boot generator rewrote a tracked helper
  w.put('1.0.1');                                                                                                  // …and the release changes it too
  const r = run(AU, w.inst);
  ok(r.reset.before.includes('data/bin/helper.mjs') && r.pulled && porcelain(w.inst) === '', 'a tracked data/bin helper the BOOT re-generated is reset before the pull (update.sh\'s rule) — the pull fast-forwards, the tree ends clean');
  const us = read('scripts/update.sh');
  ok(/^git ls-files -m data\/bin\/ 2>\/dev\/null \| xargs -r -n1 git checkout HEAD -- 2>\/dev\/null \|\| true$/m.test(us) && us.indexOf('git ls-files -m data/bin/') < us.indexOf('if ! git pull --ff-only'), 'the twin: scripts/update.sh resets the same data/bin family before its pull');
}

// ═══ §3 a user's own edit is kept; the entrypoint's old-app line ═══════
console.log('§3 the kept copy + the entrypoint gate');
const MARK = '"node_modules/forked-dep": { "version": "9.9.9", "cpv1": "the user wrote this" }';
const userEdit = (inst) => fs.writeFileSync(path.join(inst, 'package-lock.json'), fs.readFileSync(path.join(inst, 'package-lock.json'), 'utf-8').replace('"packages": {', '"packages": {\n    ' + MARK + ','));
{
  const w = world('lock-edit');
  userEdit(w.inst);                                   // a fork pins a dependency in its lockfile (package.json untouched, so the pull can still fast-forward)
  w.put('1.0.1');
  const r = run(AU, w.inst);
  const kept = AU.keptPath(w.inst, 'package-lock.json');
  const line = r.lines.find((l) => /\[auto-update\] reset package-lock\.json/.test(l)) || '';
  ok(r.pulled && r.reset.before.includes('package-lock.json') && porcelain(w.inst) === '' && fs.existsSync(kept) && fs.readFileSync(kept, 'utf-8').includes('cpv1'), `the user's lockfile edit is reset for the pull, the tree ends clean, and the replaced file is kept at ${AU.KEEP_DIR}/package-lock.json.pre-reset (holding the edit)`);
  ok(/a local edit/.test(line) && /\.pre-reset/.test(line) && !/\(rewritten by the last install \/ build\)/.test(line), `the line names the copy and does not claim the build did it: ${JSON.stringify(line)}`);
  // the install's own rewrite after the pull is reset too — WITHOUT overwriting the copy that matters
  ok(r.reset.after.includes('package-lock.json') && fs.readFileSync(kept, 'utf-8').includes('cpv1'), 'the after-build reset (the npm 10 rewrite) runs and the kept copy still holds the USER\'s edit, not npm\'s');
  const r2 = run(AU, w.inst);
  ok(!r2.pulled && r2.reset.before.length === 0 && fs.readFileSync(kept, 'utf-8').includes('cpv1'), 'a boot with nothing to reset leaves the copy alone');
  // a build's own rewrite (no user edit) keeps a copy too — harmless, the same door
  const w2 = world('build-rewrite'); w2.put('1.0.1'); run(PRE, w2.inst);     // the pre-fix sequence leaves M package-lock.json
  w2.put('1.0.2'); const r3 = run(AU, w2.inst);
  ok(r3.pulled && fs.existsSync(AU.keptPath(w2.inst, 'package-lock.json')) && porcelain(w2.inst) === '', 'a dirty pod healed: the copy of what was replaced exists, the tree is clean');
  ok(JSON.stringify(execFileSync('git', ['-C', w2.inst, 'check-ignore', 'data/auto-update/package-lock.json.pre-reset'], { env: GENV, encoding: 'utf-8' }).trim()) === JSON.stringify('data/auto-update/package-lock.json.pre-reset'), 'the copy is gitignored (data/*) — it never dirties the next pull');
  const realIgnore = execFileSync('git', ['-C', REPO, 'check-ignore', 'data/auto-update/package-lock.json.pre-reset'], { env: gitEnvFrom(process.env), encoding: 'utf-8' }).trim();
  ok(realIgnore === 'data/auto-update/package-lock.json.pre-reset', 'and in THIS repo too (.gitignore data/*)');
}
// CONTROL: a copy without the keep discards the user's edit in silence
{
  const a = "      if (keep) keepCopy(repoDir, f);\n";
  ok(src.includes(a), 'the keep control\'s anchor exists');
  const NOKEEP = M.load('src/server/auto-update.js', src.replace(a, ''), 'nokeep');
  const w = world('nokeep'); userEdit(w.inst); w.put('1.0.1');
  const r = run(NOKEEP, w.inst);
  ok(r.pulled && !fs.existsSync(AU.keptPath(w.inst, 'package-lock.json')) && !fs.readFileSync(path.join(w.inst, 'package-lock.json'), 'utf-8').includes('cpv1'), 'CONTROL: a copy that never keeps one DISCARDS the fork\'s edit with no copy anywhere — the kept-copy assert is red on it');
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

for (const row of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(row.pass, row.name, row.detail);
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
