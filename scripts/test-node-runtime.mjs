#!/usr/bin/env node
// THE PRODUCT'S OWN NODE — the provisioner (lane runtime-floor, 2026-10-22). src/node-runtime.js against a FAKE MIRROR
// (a loopback server serving a stub «node» release: a tar.gz whose bin/node answers its version and otherwise runs the
// real node, + SHASUMS256.txt) in scratch dirs — no real download:
//   ① the names: the archive per platform/arch (.zip on win32), SHASUMS256.txt's line, the release-file list
//   ② a stub whose sha matches ⇒ provisioned under <root>/runtime/node-v<ver>, `current` flipped (a symlink renamed into
//     place), the unpacked binary answered its version; again ⇒ already, nothing downloaded
//   ③ THE HASH LIVES IN THIS REPO: a version the table (src/runtime-floor.js ARCHIVES — here the suite's FIXTURE rows) names no
//     line for ⇒ refused before ANY request (RED: a copy without the table check provisions it); a mirror whose sums
//     disagree with the table ⇒ refused before the download; a mirror that lists the table's sha but serves other bytes ⇒
//     refused, nothing unpacked; a file the sums do not list / a binary that answers another version ⇒ refused
//   ④ bounded: a declared length past the bound, a chunked body past it, a stalled mirror past the time ⇒ refused by name
//   ⑤ a SYSTEM node is never touched: a root elsewhere leaves it byte for byte; a root whose runtime/ is a LINK to the
//     system prefix is refused (nothing written through it)
//   ⑥ the old versions leave (KEEP 2: current + the one before); the event loop is never held while it downloads
//   ⑦ the server's switch (reexecOnOwnRuntime): the provisioned dir's record (.vibespace-runtime.json — version, platform,
//     the sha256 of bin/node); a PLANTED binary (one byte appended) ⇒ 'tampered', a missing record ⇒ 'unverified' — never
//     exec'd, one log line (RED: a copy without the re-check execs it); newer + answers ⇒ execve(its node, the same argv, + the mark); not newer /
//     a broken binary / already switched / no execve ⇒ stays (each said); END TO END a real process.execve keeps the pid
//     — RED: a copy without the newer check switches to an OLDER node
//   ⑦b a device agent: it switches / provisions only on its OWN node, never on win32 (no execve) nor in a scratch root
//   ⑧ ONE downloader: the hub's device mirror route fetches through fetchFile (no second fetch of nodejs.org)
// Run: node scripts/test-node-runtime.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const NR = require(path.join(REPO, 'src/node-runtime.js'));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new Error('ok(cond, name, extra?)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
if (process.platform === 'win32') { console.log('SKIP — the stub release is a POSIX tar.gz (the win32 .zip road is the same code with tar -xf)'); process.exit(0); }
const ROOT = scratchDir('node-runtime');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── the stub releases: bin/node answers `--version` / `-p process.version` with ITS version, else execs the real node
const REAL = process.execPath;
const stubRelease = (version, { answers = version } = {}) => {
  const art = NR.artifactOf(version, { musl: NR.isMusl() });
  const dir = fs.mkdtempSync(path.join(ROOT, 'build-'));
  const bin = path.join(dir, art.top, 'bin'); fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'node'), `#!/bin/sh\nif [ "$1" = "--version" ] || { [ "$1" = "-p" ] && [ "$2" = "process.version" ]; }; then echo ${answers}; exit 0; fi\nexec ${JSON.stringify(REAL)} "$@"\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, art.top, 'stub-release.txt'), `stub ${version}\n`);
  const tgz = path.join(dir, art.file);
  execFileSync('tar', ['-czf', tgz, '-C', dir, art.top]);
  return { art, bytes: fs.readFileSync(tgz) };
};
// ── THE FAKE MIRROR: /<version>/<file>; per-version behaviour (a wrong sha, a huge length, chunks, a stall)
const SLOW_CHUNKS = 20;       // the slow mirror streams an archive in this many writes, 40 ms apart
const releases = new Map();   // version → {art, bytes, sums?, mode}
const hits = [];
const mirror = http.createServer((req, res) => {
  hits.push(req.url);
  const [, v, f] = req.url.split('/');
  const r = releases.get(v);
  if (!r) { res.statusCode = 404; res.end(); return; }
  if (f === 'SHASUMS256.txt') { res.end(r.sums != null ? r.sums : `${crypto.createHash('sha256').update(r.bytes).digest('hex')}  ${r.art.file}\n0000000000000000000000000000000000000000000000000000000000000000  node-${v}-other-x64.tar.gz\n`); return; }
  if (f !== r.art.file) { res.statusCode = 404; res.end(); return; }
  if (r.mode === 'huge') { res.setHeader('content-length', String(500 * 1024 * 1024)); res.write(r.bytes.subarray(0, 10)); setTimeout(() => res.destroy(), 200); return; }
  if (r.mode === 'chunked') { let n = 0; const t = setInterval(() => { res.write(Buffer.alloc(64 * 1024, 7)); if (++n > 40 || res.destroyed) clearInterval(t); }, 1); res.on('close', () => clearInterval(t)); return; }
  if (r.mode === 'stall') { res.write(r.bytes.subarray(0, 10)); return; }   // never ends
  if (r.mode === 'slow') { let i = 0; const step = Math.ceil(r.bytes.length / SLOW_CHUNKS); const t = setInterval(() => { res.write(r.bytes.subarray(i, i + step)); i += step; if (i >= r.bytes.length) { clearInterval(t); res.end(); } }, 40); return; }
  res.end(r.bytes);
});
await new Promise((r) => mirror.listen(0, '127.0.0.1', r));
const MIRROR = `http://127.0.0.1:${mirror.address().port}`;
const add = (version, o = {}) => { const s = stubRelease(version, o); releases.set(version, { ...s, ...o }); return s; };
// THE FIXTURE ROWS: the lines src/runtime-floor.js ARCHIVES would carry for these stub releases (`untabled` = one this repo
// names no line for; `tabled` = the bytes the table names when the mirror serves others)
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const FX = () => Object.fromEntries([...releases].filter(([, r]) => !r.untabled).map(([v, r]) => [v, [`${sha(r.tabled || r.bytes)}  ${r.art.file}`]]));
const leftovers = (root) => { try { return fs.readdirSync(path.join(root, 'runtime')).filter((n) => n.startsWith('.')); } catch { return []; } };
const link = (root) => { try { return fs.readlinkSync(path.join(root, 'runtime', 'current')); } catch { return null; } };

try {
  console.log('— ① the names');
  ok(NR.artifactOf('v22.23.4', { platform: 'linux', arch: 'x64' }).file === 'node-v22.23.4-linux-x64.tar.gz' && NR.artifactOf('v24.22.1', { platform: 'darwin', arch: 'arm64' }).file === 'node-v24.22.1-darwin-arm64.tar.gz' && NR.artifactOf('v22.23.4', { platform: 'win32', arch: 'x64' }).file === 'node-v22.23.4-win-x64.zip' && NR.artifactOf('v22.23.4', { platform: 'linux', arch: 'x64', musl: true }).file === 'node-v22.23.4-linux-x64-musl.tar.gz',
    'the release archive: node-v<ver>-<os>-<arch>.tar.gz (-musl on Alpine), .zip on win32');
  ok(NR.artifactOf('22.23.4') === null && NR.artifactOf('v22.23.4', { platform: 'aix', arch: 'x64' }) === null && NR.artifactOf('v22.23.4', { platform: 'linux', arch: 'mips' }) === null, '…none for a version without its v, an OS or an arch nodejs.org has no archive for');
  ok(NR.shaOf(`${'a'.repeat(64)}  node-v1.2.3-linux-x64.tar.gz\n${'b'.repeat(64)}  x.zip\n`, 'node-v1.2.3-linux-x64.tar.gz') === 'a'.repeat(64) && NR.shaOf('junk', 'x') === null, 'SHASUMS256.txt → the digest of exactly that file');
  ok(NR.FILE_RE.test('SHASUMS256.txt') && NR.FILE_RE.test('node-v22.23.4-linux-x64.tar.gz') && !NR.FILE_RE.test('../etc/passwd') && !NR.FILE_RE.test('node-v22.23.4-linux-x64.tar.gz.sig'), 'the release-file list (what the downloader may name) refuses a path and an unlisted file');

  console.log('— ② a stub whose sha matches ⇒ provisioned, current flipped');
  const R1 = path.join(ROOT, 'inst1', 'data');
  add('v22.23.4');
  const logs = [];
  const p1 = await NR.provision('v22.23.4', { archives: FX(), root: R1, mirror: MIRROR, log: (l) => logs.push(l) });
  const cur = NR.currentOf(R1);
  ok(p1.ok && !p1.already && link(R1) === 'node-v22.23.4' && cur && cur.version === 'v22.23.4' && cur.node === path.join(R1, 'runtime', 'node-v22.23.4', 'bin', 'node') && execFileSync(cur.node, ['--version'], { encoding: 'utf8' }).trim() === 'v22.23.4',
    'provisioned under <root>/runtime/node-v22.23.4; current → it (a relative symlink); the binary answers v22.23.4', { p1, link: link(R1) });
  ok(p1.sha256 === crypto.createHash('sha256').update(releases.get('v22.23.4').bytes).digest('hex') && hits.filter((h) => h.startsWith('/v22.23.4/')).join() === `/v22.23.4/SHASUMS256.txt,/v22.23.4/${releases.get('v22.23.4').art.file}` && leftovers(R1).length === 0 && logs.some((l) => /provisioned v22\.23\.4/.test(l)),
    'two requests (the sums first, then the archive), its sha the one checked, no tmp left, the line said', { hits, left: leftovers(R1) });
  const before = hits.length;
  const p1b = await NR.provision('v22.23.4', { archives: FX(), root: R1, mirror: MIRROR });
  ok(p1b.ok && p1b.already && hits.length === before, 'again ⇒ already provisioned, NOTHING downloaded');
  const rec = JSON.parse(fs.readFileSync(path.join(R1, 'runtime', 'node-v22.23.4', NR.RECORD), 'utf8'));
  ok(rec.version === 'v22.23.4' && rec.platform === `${process.platform}-${NR.artifactOf('v22.23.4').file.split('-')[3].replace(/\.tar\.gz$|\.zip$/, '')}` && rec.sha256 === sha(fs.readFileSync(cur.node)) && rec.archiveSha256 === p1.sha256 && !Number.isNaN(Date.parse(rec.provisionedAt)),
    'its record beside it (.vibespace-runtime.json): the version, the platform, the sha256 of bin/node (what the switch re-checks), the archive\'s, when', rec);

  console.log('— ③ THE HASH LIVES IN THIS REPO; refused: no table row, sums that disagree, other bytes, an unlisted file, a binary that lies');
  add('v22.23.9', { untabled: true });
  const h0 = hits.length;
  const p0 = await NR.provision('v22.23.9', { archives: FX(), root: R1, mirror: MIRROR });
  ok(!p0.ok && p0.code === 'no-table-row' && hits.length === h0 && link(R1) === 'node-v22.23.4', 'a version THIS repo names no line for ⇒ refused (no-table-row) before ANY request to the mirror', p0);
  const M0 = mutantCopies('noderuntime-table', REPO);
  const NSRC = fs.readFileSync(path.join(REPO, 'src/node-runtime.js'), 'utf8');
  const noTable = NSRC.replace("  const named = RF.archiveSha(wanted, art.file, archives);\n  if (!named) return { ok: false, code: 'no-table-row', error: `src/runtime-floor.js names no sha256 for ${art.file} — never provisioned (the mirror can serve only the bytes this repo names)` };\n", '')
    .replace(/    if \(want !== named\) throw refusal\('sums-disagree'[^\n]*\n/, '').replace('    if (got.sha256 !== named) throw', '    if (got.sha256 !== want) throw');
  const R4 = path.join(ROOT, 'inst4', 'data');
  const redT = await M0.load('src/node-runtime.js', noTable, 'notable').provision('v22.23.9', { archives: FX(), root: R4, mirror: MIRROR });
  ok(noTable !== NSRC && redT.ok && link(R4) === 'node-v22.23.9', 'RED: a copy without the table check provisions the version this repo never named — the rule above can go red', redT);
  add('v22.23.5'); releases.get('v22.23.5').sums = `${'f'.repeat(64)}  ${releases.get('v22.23.5').art.file}\n`;
  const p2 = await NR.provision('v22.23.5', { archives: FX(), root: R1, mirror: MIRROR });
  ok(!p2.ok && p2.code === 'sums-disagree' && !hits.includes(`/v22.23.5/${releases.get('v22.23.5').art.file}`) && link(R1) === 'node-v22.23.4' && !fs.existsSync(path.join(R1, 'runtime', 'node-v22.23.5')) && leftovers(R1).length === 0,
    'a mirror whose SHASUMS256.txt disagrees with the table ⇒ refused (sums-disagree) BEFORE the archive is downloaded; current unchanged, no leftovers', p2);
  const other = stubRelease('v22.23.8', { answers: 'v22.23.8' }).bytes;
  add('v22.23.8'); { const r = releases.get('v22.23.8'); r.tabled = r.bytes; r.bytes = Buffer.concat([other, Buffer.from('x')]); r.sums = `${sha(r.tabled)}  ${r.art.file}\n`; }
  const p2c = await NR.provision('v22.23.8', { archives: FX(), root: R1, mirror: MIRROR });
  ok(!p2c.ok && p2c.code === 'sha-mismatch' && link(R1) === 'node-v22.23.4' && !fs.existsSync(path.join(R1, 'runtime', 'node-v22.23.8')) && leftovers(R1).length === 0,
    'a mirror that LISTS the table\'s sha but serves other bytes ⇒ refused (sha-mismatch against this repo\'s line), nothing unpacked', p2c);
  add('v22.23.6'); releases.get('v22.23.6').sums = `${'a'.repeat(64)}  node-v22.23.6-other.tar.gz\n`;
  const p3 = await NR.provision('v22.23.6', { archives: FX(), root: R1, mirror: MIRROR });
  ok(!p3.ok && p3.code === 'not-listed' && link(R1) === 'node-v22.23.4' && !hits.includes(`/v22.23.6/${releases.get('v22.23.6').art.file}`), 'an archive the sums do not list ⇒ refused before it is even downloaded', p3);
  add('v22.23.7', { answers: 'v18.0.0' });
  const p4 = await NR.provision('v22.23.7', { archives: FX(), root: R1, mirror: MIRROR });
  ok(!p4.ok && p4.code === 'wrong-binary' && link(R1) === 'node-v22.23.4' && !fs.existsSync(path.join(R1, 'runtime', 'node-v22.23.7')), 'an unpacked binary that answers another version ⇒ refused, nothing flipped', p4);
  const p5 = await NR.provision('v99.0.0', { archives: { ...FX(), 'v99.0.0': [`${'b'.repeat(64)}  ${NR.artifactOf('v99.0.0', { musl: NR.isMusl() }).file}`] }, root: R1, mirror: MIRROR });   // a table line, no release at the mirror
  ok(!p5.ok && p5.code === 'upstream' && link(R1) === 'node-v22.23.4', 'a version the mirror does not have ⇒ refused by name (upstream 404)', p5);

  console.log('— ④ bounded: the bytes and the time');
  add('v22.30.0', { mode: 'huge' }); add('v22.30.1', { mode: 'chunked' }); add('v22.30.2', { mode: 'stall' });
  const q1 = await NR.provision('v22.30.0', { archives: FX(), root: R1, mirror: MIRROR });
  const q2 = await NR.provision('v22.30.1', { archives: FX(), root: R1, mirror: MIRROR, maxBytes: 1024 * 1024 });
  const q3 = await NR.provision('v22.30.2', { archives: FX(), root: R1, mirror: MIRROR, timeoutMs: 800 });
  ok(!q1.ok && q1.code === 'too-big' && !q2.ok && q2.code === 'too-big' && !q3.ok && q3.code === 'timeout' && link(R1) === 'node-v22.23.4' && leftovers(R1).length === 0,
    'a declared 500 MiB ⇒ too-big; a chunked body past the bound ⇒ too-big; a stalled mirror ⇒ refused for its reason (timeout — the deadline, not a hang); current unchanged, nothing left', { q1, q2, q3 });

  console.log('— ⑤ a SYSTEM node is never touched');
  const SYS = path.join(ROOT, 'usr', 'local'); fs.mkdirSync(path.join(SYS, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(SYS, 'bin', 'node'), '#!/bin/sh\necho v22.23.1\n', { mode: 0o755 });
  const sysBefore = fs.readFileSync(path.join(SYS, 'bin', 'node')), sysList = fs.readdirSync(SYS).join();
  const R2 = path.join(ROOT, 'inst2', 'data');
  const s1 = await NR.provision('v22.23.4', { archives: FX(), root: R2, mirror: MIRROR });
  ok(s1.ok && fs.readFileSync(path.join(SYS, 'bin', 'node')).equals(sysBefore) && fs.readdirSync(SYS).join() === sysList, 'provisioning another root leaves the system node (an image\'s /usr/local/bin/node) byte for byte, its prefix unchanged');
  const R3 = path.join(ROOT, 'inst3', 'data'); fs.mkdirSync(R3, { recursive: true }); fs.symlinkSync(SYS, path.join(R3, 'runtime'));
  const s2 = await NR.provision('v22.23.4', { archives: FX(), root: R3, mirror: MIRROR });
  ok(!s2.ok && s2.code === 'not-own' && fs.readdirSync(SYS).join() === sysList && fs.readFileSync(path.join(SYS, 'bin', 'node')).equals(sysBefore), 'a root whose runtime/ is a LINK to the system prefix ⇒ refused (not-own), nothing written through it', s2);
  const s3 = await NR.provision('v22.23.4', { archives: FX(), root: 'relative/data', mirror: MIRROR });
  ok(!s3.ok && s3.code === 'bad-request', 'a relative root ⇒ refused');

  console.log('— ⑥ the old versions leave; the loop is never held');
  add('v22.40.0'); add('v22.41.0', { mode: 'slow' });
  await NR.provision('v22.40.0', { archives: FX(), root: R1, mirror: MIRROR });
  let ticks = 0;
  const tick = setInterval(() => { ticks++; }, 10);
  const slow = await NR.provision('v22.41.0', { archives: FX(), root: R1, mirror: MIRROR });
  clearInterval(tick);
  const kept = fs.readdirSync(path.join(R1, 'runtime')).filter((n) => /^node-v/.test(n)).sort();
  ok(slow.ok && link(R1) === 'node-v22.41.0' && kept.join() === 'node-v22.40.0,node-v22.41.0', 'three provisioned in turn ⇒ two kept (current + the one before); the oldest left', kept);
  // THE LOOP IS NEVER HELD — a census of the work, not a clock: the provisioning road holds no blocking child and streams the
  // archive (never read whole), and the loop answered BETWEEN the mirror's writes (a count against the mirror's count)
  const NRS = fs.readFileSync(path.join(REPO, 'src/node-runtime.js'), 'utf8');
  const road = NRS.slice(NRS.indexOf('async function fetchFile('), NRS.indexOf('/** The same major line'));
  ok(!/execFileSync|spawnSync|execSync/.test(road) && /await pipeline\(Readable\.fromWeb\(res\.body\), meter, fs\.createWriteStream\(tmp/.test(road) && /spawn\(cmd, args/.test(road) && !/readFileSync\(archive/.test(road),
    'the provisioning road (fetchFile → provision) holds no blocking child (tar and the version answer are spawned) and streams the archive to disk through the hash');
  ok(ticks >= SLOW_CHUNKS / 2, `while a slow mirror streamed the archive in ${SLOW_CHUNKS} writes, a 10 ms ticker ran ${ticks} times — the loop answered between the writes`);

  console.log('— ⑦ the server\'s switch (reexecOnOwnRuntime)');
  const calls = [];
  const fake = (f, a, e) => { calls.push({ f, a, e }); };
  const base = { root: R1, execPath: '/usr/local/bin/node', version: 'v22.23.1', argv: ['/usr/local/bin/node', '/app/server.js', '--x'], execArgv: ['--max-old-space-size=4096'], env: { PATH: '/bin', KEEP: '1' }, log: () => { } };
  const sw = NR.reexecOnOwnRuntime({ ...base, execve: fake, probe: () => 'v22.41.0\n' });
  const c0 = calls[0];
  ok(sw.state === 'exec-returned' && calls.length === 1 && c0.f === path.join(R1, 'runtime', 'node-v22.41.0', 'bin', 'node') && JSON.stringify(c0.a) === JSON.stringify([c0.f, '--max-old-space-size=4096', '/app/server.js', '--x']) && c0.e.VIBESPACE_RUNTIME_REEXEC === 'v22.23.1' && c0.e.KEEP === '1',
    'current newer (v22.41.0 > v22.23.1) and it answers ⇒ execve(its node, [the flags, server.js, the args], the env + VIBESPACE_RUNTIME_REEXEC)', c0);
  calls.length = 0;
  const states = [
    ['not newer', NR.reexecOnOwnRuntime({ ...base, version: 'v22.41.0', execve: fake, probe: () => 'v22.41.0' })],
    ['a broken binary', NR.reexecOnOwnRuntime({ ...base, execve: fake, probe: () => { throw new Error('ENOEXEC'); } })],
    ['already switched', NR.reexecOnOwnRuntime({ ...base, env: { VIBESPACE_RUNTIME_REEXEC: 'v22.23.1' }, execve: fake })],
    ['no process.execve', NR.reexecOnOwnRuntime({ ...base, execve: null, probe: () => 'v22.41.0' })],   // null, never undefined: undefined is the REAL process.execve's default
    ['switched off', NR.reexecOnOwnRuntime({ ...base, env: { VIBESPACE_RUNTIME_SWITCH: '0' }, execve: fake })],
    ['no runtime here', NR.reexecOnOwnRuntime({ ...base, root: path.join(ROOT, 'nowhere'), execve: fake })],
    ['another major line (a v20 base — node-pty is built for ONE ABI)', NR.reexecOnOwnRuntime({ ...base, version: 'v20.19.0', execve: fake, probe: () => 'v22.41.0' })],
  ];
  ok(calls.length === 0 && states.map(([, s]) => s.state).join() === 'not-newer,broken,already,unsupported,off,none,other-major', 'stays, each said: ' + states.map(([n, s]) => `${n} ⇒ ${s.state}`).join(' · '));
  // RE-VERIFY WHAT IT EXECS: a planted binary (one byte appended) ⇒ tampered; no record ⇒ unverified — never exec'd
  const curDir = path.join(R1, 'runtime', 'node-v22.41.0'), curNode = path.join(curDir, 'bin', 'node'), recFile = path.join(curDir, NR.RECORD);
  const origBin = fs.readFileSync(curNode), origRec = fs.readFileSync(recFile);
  fs.appendFileSync(curNode, '# planted\n');
  const tlog = [];
  const tam = NR.reexecOnOwnRuntime({ ...base, execve: fake, probe: () => 'v22.41.0', log: (l) => tlog.push(l) });
  const MV = mutantCopies('noderuntime-verify', REPO);
  const NSRC2 = fs.readFileSync(path.join(REPO, 'src/node-runtime.js'), 'utf8');
  const noVerify = NSRC2.replace(/  const chk = verifyRuntime\(cur\.dir, cur\.node, cur\.version\);\n  if \(!chk\.ok\) \{[^\n]*\n/, '');
  const redV = [];
  MV.load('src/node-runtime.js', noVerify, 'noverify').reexecOnOwnRuntime({ ...base, execve: (f) => redV.push(f), probe: () => 'v22.41.0' });
  fs.writeFileSync(curNode, origBin); fs.rmSync(recFile);
  const unv = NR.reexecOnOwnRuntime({ ...base, execve: fake, probe: () => 'v22.41.0', log: (l) => tlog.push(l) });
  fs.writeFileSync(recFile, origRec);
  ok(tam.state === 'tampered' && unv.state === 'unverified' && calls.length === 0 && tlog.length === 2 && /NOT switching .*tampered/.test(tlog[0]) && /NOT switching .*unverified/.test(tlog[1]),
    'the switch RE-VERIFIES what it execs: a planted binary (one byte appended) ⇒ tampered, a missing record ⇒ unverified — no execve, one line each, the base node runs', tlog);
  ok(noVerify !== NSRC2 && redV.length === 1 && redV[0] === curNode, 'RED: a copy without the re-check execs the planted binary — the rule above can go red');
  ok(NR.verifyRuntime(curDir, curNode, 'v22.41.0').ok, '…and the restored binary + record verify again (the END TO END below runs on it)');
  // END TO END: a real process.execve keeps the pid
  if (typeof process.execve === 'function') {
    const script = path.join(ROOT, 'switch.cjs');
    fs.writeFileSync(script, `const r = require(${JSON.stringify(path.join(REPO, 'src/node-runtime.js'))}).reexecOnOwnRuntime({ root: ${JSON.stringify(R1)}, version: 'v22.0.0', log: () => {} });\nprocess.stdout.write(JSON.stringify({ pid: process.pid, state: r.state, mark: process.env.VIBESPACE_RUNTIME_REEXEC || null }) + '\\n');\n`);
    const child = spawn(REAL, ['--no-warnings', script], { env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; child.stdout.on('data', (d) => { out += d; });
    await new Promise((r) => child.on('close', r));
    const got = (() => { try { return JSON.parse(out.trim().split('\n').pop()); } catch { return null; } })();
    ok(!!got && got.pid === child.pid && got.state === 'already' && got.mark === 'v22.0.0', `END TO END: a real process.execve onto data/runtime/current — the SAME pid (${child.pid}), the second image marked switched`, { got, out });
  } else ok(true, 'END TO END skipped: this node has no process.execve (< 22.15)');
  // RED: without the newer check it would switch to an OLDER node
  const M = mutantCopies('noderuntime', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/node-runtime.js'), 'utf8');
  const mut = src.replace("  if (RF.compare(cur.version, version) !== 1) return { state: 'not-newer', version: cur.version };\n", '');
  const red = [];
  M.load('src/node-runtime.js', mut, 'nonewer').reexecOnOwnRuntime({ ...base, version: 'v22.50.0', execve: (f) => red.push(f), probe: () => 'v22.41.0' });
  ok(mut !== src && red.length === 1 && NR.reexecOnOwnRuntime({ ...base, version: 'v22.50.0', execve: (f) => red.push(f), probe: () => 'v22.41.0' }).state === 'not-newer' && red.length === 1, 'RED: a copy without the newer check switches a v22.50.0 server DOWN to v22.41.0 (the real one: not-newer) — the rule above can go red');

  console.log('— ⑦b a device agent: its start, its provisioning');
  ok(NR.reexecOnOwnRuntime({ ...base, platform: 'win32', execve: fake, probe: () => 'v22.41.0' }).state === 'unsupported' && calls.length === 0, 'on win32 the switch is never tried (no execve there — a Windows agent\'s road stays the installer\'s re-provision)');
  const AG = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  ok(/if \(nodeOwn\(\)\) \{ RUNTIME\.reexecOnOwnRuntime\(\{ root: ROOT/.test(AG) && /\['node', 'runtime'\]\.some\(/.test(AG) && /const child = spawn\(process\.execPath, argv, \{/.test(AG),
    'the device agent switches at its start ONLY on its own node (a self-upgrade\'s successor, started on the same node, switches the same way) and counts <root>/runtime as its own (the hello\'s nodeOwn)');
  const prov = AG.slice(AG.indexOf('function provisionOwnRuntime()'), AG.indexOf('function provisionOwnRuntime()') + 1600);
  ok(/if \(!nodeOwn\(\) \|\| process\.platform === 'win32' \|\|/.test(prov) && /os\.tmpdir\(\)/.test(prov) && /RUNTIME\.provision\(v\.wanted, \{ root: ROOT, mirror, log \}\)/.test(prov) && /hub \+ '\/vibespace-node'/.test(prov),
    '…and provisions ONLY on its own node (a system node is only said), never on win32 (nothing would switch to it) nor in a scratch root, from nodejs.org then its hub\'s /vibespace-node');
  console.log('— ⑧ ONE downloader');
  const wiring = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const route = wiring.slice(wiring.indexOf("app.get('/vibespace-node/:version/:file'"), wiring.indexOf("app.get('/api/plugins'"));
  ok(/NR\.fetchFile\(\{ mirror: NR\.DEFAULT_MIRROR/.test(route) && !/\bfetch\(/.test(route) && /NR\.VERSION_RE\.test\(v\) \|\| !NR\.FILE_RE\.test\(f\)/.test(route), 'the hub\'s device mirror route (/vibespace-node) downloads through fetchFile and judges names with the same list — no second fetch of nodejs.org');
  const walk = (d) => fs.readdirSync(path.join(REPO, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d + '/' + e.name) : /\.(c|m)?js$/.test(e.name) ? [d + '/' + e.name] : []));
  const code = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
  const fetchers = walk('src').filter((f) => /nodejs\.org\/dist/.test(code(f)));   // code, not comments (the table's header names its source)
  ok(fetchers.join() === 'src/node-runtime.js', 'nodejs.org/dist is named by ONE src file\'s code — the provisioner\'s default mirror', fetchers);
} finally { mirror.close(); }

console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass} passed)`);
process.exit(fail ? 1 : 0);
