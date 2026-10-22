#!/usr/bin/env node
// THE UPDATE ROAD (lane runtime-floor, 2026-10-22): a Node security release = ONE commit that moves the floor table +
// the product's own update. scripts/update.sh (the hub AND a pod; ⚙ Update VibeSpace… runs it) in a SCRATCH checkout
// whose origin is a local bare repo, npm / systemctl stubbed, a FAKE mirror serving a stub «node» release (bin/node
// answers its version, else runs the real node) — no real download:
//   ① at the floor (the table's line for this runner's major = its own node): the update says so, NOTHING downloaded,
//     no data/runtime
//   ② the advisory lands (origin gets a commit moving that line one patch up AND naming its archive's sha256 — the hash lives
//     in the repo): the update PULLS it, the check finds the
//     node below the floor, the product provisions the fixed release for THIS instance (sha-checked) and says the
//     restart runs on it
//   ③ the launcher picks it: the REAL first line of server.js, started by the base node, replaces the process with
//     data/runtime/current (the same pid — the unit / run.sh / a pod's entrypoint keep supervising), the mark dropped
//     before any child sees it
//   ④ a floor commit without its archive lines ⇒ never provisioned (no request); a mirror whose sums disagree with the
//     repo's line ⇒ refused — the update still ends 0 and says so, current unchanged
// Run: node scripts/test-update-road.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
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
const [MAJ, MIN, PAT] = process.version.slice(1).split('.').map(Number);
const AT = `${MAJ}.${MIN}.${PAT}`, NEXT = `${MAJ}.${MIN}.${PAT + 1}`;

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
const ENV = { PATH: `${STUBS}:${path.dirname(REAL)}:/usr/local/bin:/usr/bin:/bin`, HOME, LANG: 'C.UTF-8', GIT_AUTHOR_NAME: 'u', GIT_AUTHOR_EMAIL: 'u@example.invalid', GIT_COMMITTER_NAME: 'u', GIT_COMMITTER_EMAIL: 'u@example.invalid', VIBESPACE_NODE_MIRROR: MIRROR };
const SEED = path.join(ROOT, 'seed'), ORIGIN = path.join(ROOT, 'origin.git'), CHECKOUT = path.join(ROOT, 'checkout');
fs.mkdirSync(SEED, { recursive: true });
for (const f of ['scripts/update.sh', 'scripts/runtime-check.mjs', 'src/runtime-floor.js', 'src/node-runtime.js', 'src/server/runtime-boot.js', 'package.json', 'package-lock.json', 'src/agentd/version.js']) {
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
  return withRow;
};
fs.writeFileSync(path.join(SEED, 'src/runtime-floor.js'), tableWith(AT));
fs.writeFileSync(path.join(SEED, '.gitignore'), 'data/\nnode_modules/\n');
git(SEED, 'init', '-q', '-b', 'master'); git(SEED, 'add', '-A'); git(SEED, 'commit', '-qm', 'scratch product');
execFileSync('git', ['clone', '-q', '--bare', SEED, ORIGIN], { env: ENV });
execFileSync('git', ['clone', '-q', ORIGIN, CHECKOUT], { env: ENV });
const update = () => new Promise((resolve) => {
  const c = spawn('bash', ['scripts/update.sh'], { cwd: CHECKOUT, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => resolve({ code, out }));
});
const link = () => { try { return fs.readlinkSync(path.join(CHECKOUT, 'data', 'runtime', 'current')); } catch { return null; } };

try {
  console.log(`— ① at the floor (the table's v${MAJ} line = this runner's node ${process.version})`);
  const u1 = await update();
  ok(u1.code === 0 && /== runtime/.test(u1.out) && new RegExp(`\\[runtime\\] node ${process.version.replace(/\./g, '\\.')} — at or above the floor v${AT.replace(/\./g, '\\.')}`).test(u1.out), 'scripts/update.sh ends 0 and its runtime step says the node is at the floor', u1.out.split('\n').filter((l) => /runtime|Updated|now at/.test(l)));
  ok(hits.length === 0 && !fs.existsSync(path.join(CHECKOUT, 'data', 'runtime')), '…NOTHING downloaded, no data/runtime', hits);

  console.log('— ② the advisory lands: ONE commit moves the table and names its archive\'s sha256');
  const W = path.join(ROOT, 'work');
  execFileSync('git', ['clone', '-q', ORIGIN, W], { env: ENV });
  fs.writeFileSync(path.join(W, 'src/runtime-floor.js'), tableWith(NEXT));
  git(W, 'commit', '-qam', `runtime floor: v${MAJ} → ${NEXT} (a security release)`); git(W, 'push', '-q', 'origin', 'master');
  const u2 = await update();
  const runtimeLines = u2.out.split('\n').filter((l) => /\[runtime\]/.test(l));
  ok(u2.code === 0 && /Fast-forward|files? changed/.test(u2.out) && runtimeLines.some((l) => l.includes(`below the floor v${NEXT}`)) && runtimeLines.some((l) => l.includes(`provisioned v${NEXT}`)) && runtimeLines.some((l) => l.includes('the restart runs on it')),
    `the update PULLS the moved table, finds ${process.version} below v${NEXT} and provisions v${NEXT} for this instance — the restart runs on it`, runtimeLines);
  ok(link() === `node-v${NEXT}` && hits.join() === `/v${NEXT}/SHASUMS256.txt,/v${NEXT}/${art.file}` && execFileSync(path.join(CHECKOUT, 'data', 'runtime', 'current', 'bin', 'node'), ['--version'], { encoding: 'utf8' }).trim() === `v${NEXT}`,
    'data/runtime/current → node-v' + NEXT + ' (the sums, then the archive — sha-checked), and it answers its version', { link: link(), hits });

  console.log('— ③ the launcher picks it: the REAL first line of server.js');
  const s = spawn(REAL, ['--no-warnings', 'server.js'], { cwd: CHECKOUT, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
  let sOut = '', sErr = ''; s.stdout.on('data', (d) => { sOut += d; }); s.stderr.on('data', (d) => { sErr += d; });
  await new Promise((r) => s.on('close', r));
  const got = sOut.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((x) => x && x.pid) || null;   // the boot's verdict line prints after it (setImmediate)
  if (typeof process.execve === 'function') {
    ok(!!got && got.pid === s.pid && got.base === process.version && got.mark === null,
      `started by the base node ${process.version}, the server REPLACED itself with data/runtime/current (v${NEXT}) — the SAME pid ${s.pid}, the mark dropped before any child`, { got, sOut, sErr: sErr.slice(0, 300) });
    ok(/\[runtime\] node v[\d.]+ → v[\d.]+ .*replaces itself/.test(sOut + sErr), '…and said so in its log', (sOut + sErr).slice(0, 300));
  } else ok(!!got && got.base === null, `this node (${process.version}) has no process.execve — the server stays on it`, got);

  console.log('— ④ no line in the repo / sums that disagree: never provisioned, never a failed update');
  fs.writeFileSync(path.join(W, 'src/runtime-floor.js'), tableWith(`${MAJ}.${MIN}.${PAT + 2}`));
  git(W, 'commit', '-qam', 'runtime floor: one more'); git(W, 'push', '-q', 'origin', 'master');
  const before = hits.length;
  const u3 = await update();
  const l3 = u3.out.split('\n').filter((l) => /\[runtime\]/.test(l));
  ok(u3.code === 0 && l3.some((l) => /not provisioned \(no-table-row\)/.test(l)) && link() === `node-v${NEXT}` && hits.length === before, `a floor commit WITHOUT its archive lines (v${MAJ}.${MIN}.${PAT + 2}): never provisioned — not one request to the mirror — the update still ends 0 and says so, current stays node-v${NEXT}`, l3);
  sums = `${'0'.repeat(64)}  ${art.file}\n`;
  fs.rmSync(path.join(CHECKOUT, 'data', 'runtime'), { recursive: true, force: true });
  fs.writeFileSync(path.join(W, 'src/runtime-floor.js'), tableWith(NEXT));
  git(W, 'commit', '-qam', 'runtime floor: back to ' + NEXT); git(W, 'push', '-q', 'origin', 'master');
  const u4 = await update();
  const l4 = u4.out.split('\n').filter((l) => /\[runtime\]/.test(l));
  ok(u4.code === 0 && l4.some((l) => /not provisioned \(sums-disagree\)/.test(l)) && link() === null, 'a mirror whose SHASUMS256.txt disagrees with the line this repo names: refused (sums-disagree), nothing flipped, the update still ends 0', l4);
} finally { mirror.close(); }

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
