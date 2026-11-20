#!/usr/bin/env node
// THE UPDATE ROAD (lane runtime-floor, 2026-10-22): a Node security release = ONE commit that moves the floor table +
// the product's own update. scripts/update.sh (the hub AND a pod; ⚙ Update VibeSpace… runs it) in a SCRATCH checkout
// whose origin is a local bare repo, npm / systemctl stubbed, a FAKE mirror serving a stub «node» release (bin/node
// answers its version, else runs the real node) — no real download:
//   ① at the floor (the table's line for this runner's major = its own node): the update says so, NOTHING downloaded,
//     no data/runtime
//   ② the advisory lands (origin gets a commit moving that line up AND naming its archive's sha256 — the hash lives
//     in the repo): the update PULLS it, the check finds the
//     node below the floor, the product provisions the fixed release for THIS instance (sha-checked) and says the
//     restart runs on it. FIXTURES TAKE VERSIONS THE REAL TABLE NEVER NAMES (lane ci-342-reds): the moved floor is the
//     first patch above the running node with NO row in src/runtime-floor.js ARCHIVES — on node v22.23.3 the next patch
//     v22.23.4 IS a real row, and the repo's real sum (rightly) beat the fake mirror's (the 2.369.342 runner's red)
//   ③ the launcher picks it: the REAL first line of server.js, started by the base node, replaces the process with
//     data/runtime/current (the same pid — the unit / run.sh / a pod's entrypoint keep supervising), the mark dropped
//     before any child sees it
//   ④ a floor commit without its archive lines ⇒ never provisioned (no request); a mirror whose sums disagree with the
//     repo's line ⇒ refused — the update still ends 0 and says so, current unchanged
//   ⑤ CONTROL (what the runner stumbled into): the REAL table, a floor it pins with its REAL sums (v22.23.4 today), a node
//     below it, a mirror serving other bytes ⇒ refused (sums-disagree) before the download, nothing flipped, the update
//     still ends 0 — on every box (the base it judges is set through runtime-check's own seam, VIBESPACE_RUNTIME_BASE)
//   ⑥ B-f6fd THE UPDATE THAT SHIPS A STEP RUNS IT: origin's commit adds a step to scripts/update.sh AFTER its pull line; the
//     update that pulls it runs that step (the old script exec's the new one --after-pull: no second pull, the lock kept);
//     an update that pulls nothing never re-execs. On the base it is the measured bug: the step is skipped.
//     Batch 11 cure: THE LOCK HOLDS ACROSS THE HAND-OVER — a probe origin's script carries between its fd-9 line and its
//     flock asks the lock from another process: held (RED control: the new script re-opening fd 9 unconditionally — the lock
//     is FREE there); a hand-typed `--after-pull` takes the lock anew (a lock held elsewhere ⇒ «Another update is already
//     running»), also when the shell that typed it holds fd 9 on ANOTHER file; safe.directory is added ONCE over every
//     update; a pulled tree without scripts/update.sh never hands over. The scratch runs set maintenance.auto=false (a
//     detached git maintenance would keep the inherited fd 9). On d3921f8d0 the count leg and the fd-9-elsewhere leg are red
// Run: node scripts/test-update-road.mjs
//      VS_UPDATE_ROAD_NODE=v22.23.3 node scripts/test-update-road.mjs — PRETEND the running node is v22.23.3 (the update's
//      check judges it through VIBESPACE_RUNTIME_BASE); ③ (the real binary's swap) runs only on the real node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const NR = require(path.join(REPO, 'src/node-runtime.js'));
const RF = require(path.join(REPO, 'src/runtime-floor.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new Error('ok(cond, name, extra?)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 800) : '')); } };
if (process.platform === 'win32') { console.log('SKIP — scripts/update.sh is the hub / pod road (bash)'); process.exit(0); }
const ROOT = scratchDir('update-road');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const REAL = process.execPath;
// the node this run judges: the running one, or a pretended one (VS_UPDATE_ROAD_NODE — see Run above)
const RUN = process.env.VS_UPDATE_ROAD_NODE ? 'v' + String(process.env.VS_UPDATE_ROAD_NODE).replace(/^v/, '') : process.version;
if (!RF.tripleOf(RUN)) throw new Error(`VS_UPDATE_ROAD_NODE=${RUN} is not a node version`);
const PRETEND = RUN !== process.version;
const [MAJ, MIN, PAT] = RF.tripleOf(RUN);
// the moved floor + the floor without archive lines: the first patches above the running node the REAL table never pins
const pinned = (v) => Object.prototype.hasOwnProperty.call(RF.ARCHIVES, v);
const unpinned = (p) => { while (pinned(`v${MAJ}.${MIN}.${p}`)) p++; return p; };
const NP = unpinned(PAT + 1), BARE = unpinned(NP + 1);
const AT = `${MAJ}.${MIN}.${PAT}`, NEXT = `${MAJ}.${MIN}.${NP}`, NOROW = `${MAJ}.${MIN}.${BARE}`;
// ⑤'s control: the first floor the REAL table names with a REAL archive line for this platform (v22.23.4 today), judged
// from the patch below it
const PIN = (() => {
  for (const r of Object.values(RF.NODE_FLOORS)) {
    const v = 'v' + r.floor, t = RF.tripleOf(v), a = NR.artifactOf(v, { musl: NR.isMusl() });
    const sha = a ? RF.archiveSha(v, a.file) : null;
    if (sha && t[2] > 0) return { v, file: a.file, sha, base: `v${t[0]}.${t[1]}.${t[2] - 1}` };
  }
  return null;
})();

// ── the stub release of v<NEXT> + the fake mirror
const art = NR.artifactOf('v' + NEXT, { musl: NR.isMusl() });
const build = path.join(ROOT, 'build'); fs.mkdirSync(path.join(build, art.top, 'bin'), { recursive: true });
fs.writeFileSync(path.join(build, art.top, 'bin', 'node'), `#!/bin/sh\nif [ "$1" = "--version" ] || { [ "$1" = "-p" ] && [ "$2" = "process.version" ]; }; then echo v${NEXT}; exit 0; fi\nexec ${JSON.stringify(REAL)} "$@"\n`, { mode: 0o755 });
execFileSync('tar', ['-czf', path.join(build, art.file), '-C', build, art.top]);
const TGZ = fs.readFileSync(path.join(build, art.file));
let sums = `${crypto.createHash('sha256').update(TGZ).digest('hex')}  ${art.file}\n`;
const hits = [];
const mirror = http.createServer((req, res) => {
  hits.push(req.url);
  if (req.url === `/v${NEXT}/SHASUMS256.txt`) return res.end(sums);
  if (req.url === `/v${NEXT}/${art.file}`) return res.end(TGZ);
  // ⑤: the mirror's own bytes under the pinned version's name — its SHASUMS256.txt names THEM, not the repo's line
  if (PIN && req.url === `/${PIN.v}/SHASUMS256.txt`) return res.end(`${crypto.createHash('sha256').update(TGZ).digest('hex')}  ${PIN.file}\n`);
  if (PIN && req.url === `/${PIN.v}/${PIN.file}`) return res.end(TGZ);
  res.statusCode = 404; res.end();
});
await new Promise((r) => mirror.listen(0, '127.0.0.1', r));
const MIRROR = `http://127.0.0.1:${mirror.address().port}`;

// ── the scratch product: the update road's files + a table whose line for this major we move
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
const HOME = path.join(ROOT, 'home'), STUBS = path.join(ROOT, 'stubs');
for (const d of [HOME, STUBS]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(STUBS, 'npm'), '#!/bin/sh\necho "npm (stub) $*"\nexit 0\n', { mode: 0o755 });
fs.writeFileSync(path.join(STUBS, 'systemctl'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });   // no user unit here ⇒ "restart your server"
const ENV = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'maintenance.auto', GIT_CONFIG_VALUE_0: 'false', PATH: `${STUBS}:${path.dirname(REAL)}:/usr/local/bin:/usr/bin:/bin`, HOME, LANG: 'C.UTF-8', GIT_AUTHOR_NAME: 'u', GIT_AUTHOR_EMAIL: 'u@example.invalid', GIT_COMMITTER_NAME: 'u', GIT_COMMITTER_EMAIL: 'u@example.invalid', VIBESPACE_NODE_MIRROR: MIRROR, ...(PRETEND ? { VIBESPACE_RUNTIME_BASE: RUN } : {}) };
const SEED = path.join(ROOT, 'seed'), ORIGIN = path.join(ROOT, 'origin.git'), CHECKOUT = path.join(ROOT, 'checkout');
fs.mkdirSync(SEED, { recursive: true });
// (src/server-root.js: runtime-boot's runtimeCheckArmed asks its tmpRootUnder — B-9dd0)
for (const f of ['scripts/update.sh', 'scripts/runtime-check.mjs', 'src/runtime-floor.js', 'src/node-runtime.js', 'src/server/runtime-boot.js', 'src/server-root.js', 'package.json', 'package-lock.json', 'src/agentd/version.js']) {
  fs.mkdirSync(path.dirname(path.join(SEED, f)), { recursive: true });
  fs.copyFileSync(path.join(REPO, f), path.join(SEED, f));
}
// the REAL first line of server.js (the runtime boot), then what the test reads
const head = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8').split('\n')[0] + '\n';
if (!/runtime-boot\.js'\)\.boot\(/.test(head)) throw new Error('server.js\'s first line is no longer the runtime boot — update this suite');
fs.writeFileSync(path.join(SEED, 'server.js'), head + "const a = require('./src/server/runtime-boot.js').answer();\nprocess.stdout.write(JSON.stringify({ pid: process.pid, base: a.base, node: a.node, mark: process.env.VIBESPACE_RUNTIME_REEXEC || null }) + '\\n');\n");
const TABLE = fs.readFileSync(path.join(REPO, 'src/runtime-floor.js'), 'utf8');
const tableWith = (floor) => {
  const rows = { ...Object.fromEntries(Object.entries(RF.NODE_FLOORS).map(([k, r]) => [k, r.floor])), [MAJ]: floor };
  const body = Object.entries(rows).map(([k, f]) => `  ${k}: Object.freeze({ floor: '${f}', advisory: 'nodejs-2026-10-21' }),`).join('\n');
  const out = TABLE.replace(/const NODE_FLOORS = Object\.freeze\(\{\n[\s\S]*?\n\}\);/, `const NODE_FLOORS = Object.freeze({\n${body}\n});`);
  if (out === TABLE && floor !== RF.NODE_FLOORS[MAJ]?.floor) throw new Error('the table pattern moved — update this suite');
  // the release commit carries its archive's line too (THE HASH LIVES IN THE REPO) — here the stub release of v<NEXT>
  if (floor !== NEXT) return out;
  const line = `${crypto.createHash('sha256').update(TGZ).digest('hex')}  ${art.file}`;
  const withRow = out.replace('const ARCHIVES = Object.freeze({\n', `const ARCHIVES = Object.freeze({\n  'v${NEXT}': Object.freeze(['${line}']),\n`);
  if (withRow === out) throw new Error('the ARCHIVES pattern moved — update this suite');
  // ONE row for v<NEXT>: a second (a real one) would shadow the fixture's sum
  if (withRow.split(`'v${NEXT}':`).length !== 2) throw new Error(`the real table pins v${NEXT} too — the fixture's version must be one it never names`);
  return withRow;
};
fs.writeFileSync(path.join(SEED, 'src/runtime-floor.js'), tableWith(AT));
fs.writeFileSync(path.join(SEED, '.gitignore'), 'data/\nnode_modules/\n');
git(SEED, 'init', '-q', '-b', 'master'); git(SEED, 'add', '-A'); git(SEED, 'commit', '-qm', 'scratch product');
execFileSync('git', ['clone', '-q', '--bare', SEED, ORIGIN], { env: ENV });
execFileSync('git', ['clone', '-q', ORIGIN, CHECKOUT], { env: ENV });
const update = (extra = {}, args = []) => new Promise((resolve) => {
  const c = spawn('bash', ['scripts/update.sh', ...args], { cwd: CHECKOUT, env: { ...ENV, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out }));
});
const link = () => { try { return fs.readlinkSync(path.join(CHECKOUT, 'data', 'runtime', 'current')); } catch { return null; } };

try {
  if (PRETEND) console.log(`(PRETENDING node ${RUN} — VS_UPDATE_ROAD_NODE; the real node ${process.version} runs the scripts, the update's check judges ${RUN})`);
  console.log(`— ① at the floor (the table's v${MAJ} line = this runner's node ${RUN})`);
  const u1 = await update();
  ok(u1.code === 0 && /== runtime/.test(u1.out) && new RegExp(`\\[runtime\\] node ${RUN.replace(/\./g, '\\.')} — at or above the floor v${AT.replace(/\./g, '\\.')}`).test(u1.out), 'scripts/update.sh ends 0 and its runtime step says the node is at the floor', u1.out.split('\n').filter((l) => /runtime|Updated|now at/.test(l)));
  ok(hits.length === 0 && !fs.existsSync(path.join(CHECKOUT, 'data', 'runtime')), '…NOTHING downloaded, no data/runtime', hits);

  console.log(`— ② the advisory lands: ONE commit moves the table to v${NEXT} (the first patch above ${RUN} the real table never pins) and names its archive's sha256`);
  const W = path.join(ROOT, 'work');
  execFileSync('git', ['clone', '-q', ORIGIN, W], { env: ENV });
  fs.writeFileSync(path.join(W, 'src/runtime-floor.js'), tableWith(NEXT));
  git(W, 'commit', '-qam', `runtime floor: v${MAJ} → ${NEXT} (a security release)`); git(W, 'push', '-q', 'origin', 'master');
  const u2 = await update();
  const runtimeLines = u2.out.split('\n').filter((l) => /\[runtime\]/.test(l));
  ok(u2.code === 0 && /Fast-forward|files? changed/.test(u2.out) && runtimeLines.some((l) => l.includes(`below the floor v${NEXT}`)) && runtimeLines.some((l) => l.includes(`provisioned v${NEXT}`)) && runtimeLines.some((l) => l.includes('the restart runs on it')),
    `the update PULLS the moved table, finds ${RUN} below v${NEXT} and provisions v${NEXT} for this instance — the restart runs on it`, runtimeLines);
  ok(link() === `node-v${NEXT}` && hits.join() === `/v${NEXT}/SHASUMS256.txt,/v${NEXT}/${art.file}` && execFileSync(path.join(CHECKOUT, 'data', 'runtime', 'current', 'bin', 'node'), ['--version'], { encoding: 'utf8' }).trim() === `v${NEXT}`,
    'data/runtime/current → node-v' + NEXT + ' (the sums, then the archive — sha-checked), and it answers its version', { link: link(), hits });

  console.log('— ③ the launcher picks it: the REAL first line of server.js');
  if (PRETEND) console.log(`  · not run under VS_UPDATE_ROAD_NODE: the swap compares the REAL binary (${process.version}) with current — this leg runs on the real node`);
  else {
    const s = spawn(REAL, ['--no-warnings', 'server.js'], { cwd: CHECKOUT, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    let sOut = '', sErr = ''; s.stdout.on('data', (d) => { sOut += d; }); s.stderr.on('data', (d) => { sErr += d; });
    await new Promise((r) => s.on('close', r));
    const got = sOut.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((x) => x && x.pid) || null;   // the boot's verdict line prints after it (setImmediate)
    if (typeof process.execve === 'function') {
      ok(!!got && got.pid === s.pid && got.base === process.version && got.mark === null,
        `started by the base node ${process.version}, the server REPLACED itself with data/runtime/current (v${NEXT}) — the SAME pid ${s.pid}, the mark dropped before any child`, { got, sOut, sErr: sErr.slice(0, 300) });
      ok(/\[runtime\] node v[\d.]+ → v[\d.]+ .*replaces itself/.test(sOut + sErr), '…and said so in its log', (sOut + sErr).slice(0, 300));
    } else ok(!!got && got.base === null, `this node (${process.version}) has no process.execve — the server stays on it`, got);
  }

  console.log('— ④ no line in the repo / sums that disagree: never provisioned, never a failed update');
  fs.writeFileSync(path.join(W, 'src/runtime-floor.js'), tableWith(NOROW));
  git(W, 'commit', '-qam', 'runtime floor: one more'); git(W, 'push', '-q', 'origin', 'master');
  const before = hits.length;
  const u3 = await update();
  const l3 = u3.out.split('\n').filter((l) => /\[runtime\]/.test(l));
  ok(u3.code === 0 && l3.some((l) => /not provisioned \(no-table-row\)/.test(l)) && link() === `node-v${NEXT}` && hits.length === before, `a floor commit WITHOUT its archive lines (v${NOROW}): never provisioned — not one request to the mirror — the update still ends 0 and says so, current stays node-v${NEXT}`, l3);
  sums = `${'0'.repeat(64)}  ${art.file}\n`;
  fs.rmSync(path.join(CHECKOUT, 'data', 'runtime'), { recursive: true, force: true });
  fs.writeFileSync(path.join(W, 'src/runtime-floor.js'), tableWith(NEXT));
  git(W, 'commit', '-qam', 'runtime floor: back to ' + NEXT); git(W, 'push', '-q', 'origin', 'master');
  const u4 = await update();
  const l4 = u4.out.split('\n').filter((l) => /\[runtime\]/.test(l));
  ok(u4.code === 0 && l4.some((l) => /not provisioned \(sums-disagree\)/.test(l)) && link() === null, 'a mirror whose SHASUMS256.txt disagrees with the line this repo names: refused (sums-disagree), nothing flipped, the update still ends 0', l4);

  console.log(`— ⑤ CONTROL: the REAL table pins ${PIN ? PIN.v : 'a floor'} with its real sums; a mirror serving other bytes is refused (the 2.369.342 runner's road)`);
  if (!PIN) console.log(`  · not run: the real table names no archive line for ${process.platform}-${process.arch}${NR.isMusl() ? '-musl' : ''}`);
  else {
    fs.writeFileSync(path.join(W, 'src/runtime-floor.js'), TABLE);   // the repo's own table, byte for byte
    git(W, 'commit', '-qam', 'runtime floor: the repo\'s own table'); git(W, 'push', '-q', 'origin', 'master');
    fs.rmSync(path.join(CHECKOUT, 'data', 'runtime'), { recursive: true, force: true });   // no own runtime: the check judges PIN.base alone
    const from = hits.length;
    const u5 = await update({ VIBESPACE_RUNTIME_BASE: PIN.base });
    const l5 = u5.out.split('\n').filter((l) => /\[runtime\]/.test(l));
    ok(u5.code === 0 && l5.some((l) => l.includes(`node ${PIN.base} below the floor ${PIN.v}`)) && l5.some((l) => /not provisioned \(sums-disagree\)/.test(l) && l.includes(`this repo names ${PIN.sha.slice(0, 12)}…`))
      && link() === null && !fs.existsSync(path.join(CHECKOUT, 'data', 'runtime', `node-${PIN.v}`)) && hits.slice(from).join() === `/${PIN.v}/SHASUMS256.txt`,
      `node ${PIN.base} below the real floor ${PIN.v}, whose line this repo pins (${PIN.sha.slice(0, 12)}…): a mirror whose SHASUMS256.txt names other bytes ⇒ refused (sums-disagree) before the download, nothing flipped, the update still ends 0`, { l5, hits: hits.slice(from), link: link() });
  }

  console.log('— ⑥ B-f6fd: the update that ships a step runs it (bash keeps the old script\'s inode after the pull)');
  const us = fs.readFileSync(path.join(W, 'scripts/update.sh'), 'utf8');
  const MARK = 'echo "== npm install"\n';
  ok(us.split(MARK).length === 2, '⑥ the step\'s anchor (the npm install line after the pull) is in scripts/update.sh');
  fs.writeFileSync(path.join(W, 'scripts/update.sh'), us.replace(MARK, 'echo "== a step this release ships (B-f6fd)"\n' + MARK));
  git(W, 'commit', '-qam', 'update.sh: a step after the pull'); git(W, 'push', '-q', 'origin', 'master');
  const u6 = await update();
  ok(u6.code === 0 && /Fast-forward|files? changed/.test(u6.out) && u6.out.includes('== a step this release ships (B-f6fd)') && (u6.out.match(/== VibeSpace update:/g) || []).length === 2 && (u6.out.match(/Fast-forward|Already up to date/g) || []).length === 1,
    '⑥ the update that PULLS a new step runs it — the old script hands over to the new one right after its pull (one pull, the new script\'s step said)', u6.out.split('\n').filter((l) => /^==|Fast-forward|Already/.test(l)));
  const u7 = await update();
  ok(u7.code === 0 && !u7.out.includes('== continuing with the updated script') && u7.out.includes('== a step this release ships (B-f6fd)'), '⑥ …an update that pulls nothing never hands over (one run of the script) — and the step is simply there', u7.out.split('\n').filter((l) => /^==/.test(l)));
  // THE LOCK HOLDS ACROSS THE HAND-OVER: origin's script asks the lock from ANOTHER process right after its fd-9 line (the
  // inherited open file, or a fresh one) and before its own flock — held ⇒ no second update could start in between
  const FD9 = '  { [ -n "$AFTER_PULL" ] && [ /dev/fd/9 -ef data/.update.lock ]; } || exec 9>data/.update.lock\n';
  // (under update.sh's set -e: the probe's own «held» answer must never end the script — `|| r=$?`)
  const PROBE = '  if [ -n "$AFTER_PULL" ]; then r=0; flock -n -E 75 data/.update.lock true || r=$?; case $r in 0) echo "== hand-over: the lock was FREE";; 75) echo "== hand-over: the lock held";; *) echo "== hand-over: the probe failed ($r)";; esac; fi\n';
  const handOver = async (text, msg) => { fs.writeFileSync(path.join(W, 'scripts/update.sh'), text); git(W, 'commit', '-qam', msg); git(W, 'push', '-q', 'origin', 'master'); return update(); };
  const us2 = fs.readFileSync(path.join(W, 'scripts/update.sh'), 'utf8');
  ok(us2.split(FD9).length === 2, '⑥ the lock\'s anchor (the fd-9 line) is in scripts/update.sh once');
  const flockHere = spawnSync('sh', ['-c', 'command -v flock'], { env: ENV }).status === 0;
  if (flockHere) {
    const u8 = await handOver(us2.replace(FD9, FD9 + PROBE), 'update.sh: the lock probe');
    ok(u8.code === 0 && u8.out.includes('== continuing with the updated script') && u8.out.includes('== hand-over: the lock held') && !u8.out.includes('lock was FREE'),
      '⑥ the lock HOLDS across the hand-over: asked from another process between the new script\'s fd-9 line and its flock, it is held (the inherited open file)', u8.out.split('\n').filter((l) => /^==|Another/.test(l)));
    // a hand-typed --after-pull takes the lock ANEW: with the lock held elsewhere it refuses by name — also when the shell
    // that typed it holds fd 9 on ANOTHER file (fd 9 counts only when it IS the update lock)
    // ONE process holds it: a shell takes the lock on its fd 9 (waiting up to 5 s), says so in a marker, and EXECS sleep
    const mark = path.join(ROOT, 'holder-locked');
    const holder = spawn('sh', ['-c', 'exec 9>"$1"; flock -w 5 9 || exit 3; : > "$2"; exec sleep 20', 'sh', path.join(CHECKOUT, 'data', '.update.lock'), mark], { env: ENV, stdio: 'ignore' });
    const holderGone = new Promise((r) => holder.on('exit', r));
    try {
      let held = false; for (let t = 0; t < 100 && !held; t++) { await new Promise((r) => setTimeout(r, 50)); held = fs.existsSync(mark); }
      const u9 = await update({}, ['--after-pull']);
      const u9b = await new Promise((resolve) => {
        const c = spawn('bash', ['-c', 'exec 9>/dev/null; exec bash scripts/update.sh --after-pull'], { cwd: CHECKOUT, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; }); c.on('close', (code) => resolve({ code, out }));
      });
      ok(held && u9.code === 1 && /Another update is already running/.test(u9.out), '⑥ …a hand-typed `--after-pull` takes the lock ANEW: with the lock held elsewhere it refuses — «Another update is already running»', { held, code: u9.code, out: u9.out.slice(-200) });
      ok(held && u9b.code === 1 && /Another update is already running/.test(u9b.out), '⑥ …and refuses the same when the shell that typed it holds fd 9 on ANOTHER file (fd 9 counts only when it IS the update lock)', { code: u9b.code, out: u9b.out.slice(-200) });
    } finally { holder.kill('SIGTERM'); await holderGone; fs.rmSync(mark, { force: true }); }   // ours: the handle does nothing once the child has exited
    // RED CONTROL: the new script re-opening fd 9 unconditionally (the line before B-f6fd) — the lock is FREE in the hand-over
    const u10 = await handOver(us2.replace(FD9, '  exec 9>data/.update.lock\n' + PROBE), 'update.sh: CONTROL — fd 9 re-opened');
    ok(u10.out.includes('== continuing with the updated script') && u10.out.includes('== hand-over: the lock was FREE'), 'RED CONTROL: a new script that re-opens fd 9 unconditionally — the probe finds the lock FREE in the hand-over (a second update could start there)', u10.out.split('\n').filter((l) => /^==/.test(l)));
  } else console.log('  · flock(1) is not on this machine — the lock legs are the Linux road\'s (update.sh skips the guard there too)');
  // safe.directory ONCE: every update above (and the hand-over, and the hand-typed mode) added it at most once
  const sd = spawnSync('git', ['config', '--global', '--get-all', 'safe.directory'], { env: ENV, encoding: 'utf8' }).stdout.split('\n').filter((l) => l === CHECKOUT || l === fs.realpathSync(CHECKOUT));
  ok(sd.length === 1, `⑥ safe.directory is added ONCE over every update of this checkout (${sd.length} entries)`, sd);
  // a pulled tree without scripts/update.sh: the old script — the product's, pushed back first — finishes (no hand-over)
  if (flockHere) { const back = await handOver(us2, 'update.sh: the product script again'); ok(back.code === 0 && back.out.includes('== continuing with the updated script'), '⑥ (the product script is pushed back before the next leg)', back.out.split('\n').filter((l) => /^==/.test(l))); }
  git(W, 'rm', '-q', 'scripts/update.sh'); git(W, 'commit', '-qm', 'no update.sh'); git(W, 'push', '-q', 'origin', 'master');
  const u11 = await update();
  ok(u11.code === 0 && !u11.out.includes('== continuing with the updated script') && u11.out.includes('== npm install') && /== now at /.test(u11.out) && /✓ Updated/.test(u11.out) && !fs.existsSync(path.join(CHECKOUT, 'scripts', 'update.sh')),
    '⑥ a pulled tree WITHOUT scripts/update.sh never hands over: the old script finishes its run (npm install, «== now at», «✓ Updated»)', u11.out.split('\n').filter((l) => /^==/.test(l)));
} finally { mirror.close(); }

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
