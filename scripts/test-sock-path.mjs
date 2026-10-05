#!/usr/bin/env node
// test-sock-path — lane-pairing ④ (B-7007; the owner's MacBook 2026-09-27: the installer named the dial device's
// root after the frp host, `…/.vibespace/device@<frp host>/state/agentd.sock` was 106 bytes, macOS's sun_path is
// 104 incl. the NUL — every listen failed EINVAL while the row said "offline"). SHARED src/sock-path.js:
//   · the rung ladder table: a 40-byte root fits on darwin; an 86-byte root (+18 = 104) does NOT on darwin but DOES
//     on linux; a 120-byte root ⇒ runtime-dir on linux, tmpdir on darwin (/var/folders/…), tmp when TMPDIR is /tmp,
//     socket_path_too_long when even /tmp/vs-dev-<uid>/d-<h>.sock cannot fit (a patched base); bytes in UTF-8
//   · the ownership verdict (a patched lstat: symlink / another uid / 0777 ⇒ socket_dir_hijacked) + a real mkdir
//   · the WITNESS reader (a witness naming a live socket wins; one naming a plain file is ignored) — and the hub's
//     reader (src/agentd/client.js `_sock`) is that reader
//   · THE CENSUS of every socket path the tree builds (grep-derived over src/ + data/bin, the bundle excluded): a
//     producer not in the table is red, a table row nothing produces is red; a planted producer in a scratch copy
//     is caught
//   · CONTROL (mutant-copy): a ladder with the platform bound fixed at 108 turns the darwin cell red
// Run: node scripts/test-sock-path.mjs
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const SP = require(path.join(REPO, 'src/sock-path.js'));

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
const eq = (a, b, n) => ok(JSON.stringify(a) === JSON.stringify(b), n, { got: a, want: b });
const rootOf = (bytes) => { const base = '/Users/owner/.vibespace/device@'; return base + 'x'.repeat(bytes - base.length); };

console.log('the rung ladder');
{
  eq([SP.maxBytes('darwin'), SP.maxBytes('linux'), SP.maxBytes('freebsd'), SP.maxBytes('aix')], [103, 107, 103, 103], 'usable bytes per platform (the NUL is not ours; an unknown platform is the tighter bound)');
  const r40 = SP.daemonSocketPath({ root: rootOf(40), platform: 'darwin', uid: 501 });
  eq([r40.via, r40.bytes], ['natural', 58], 'a 40-byte root fits naturally on darwin (58 bytes)');
  const r86d = SP.daemonSocketPath({ root: rootOf(86), platform: 'darwin', tmpdir: '/tmp', uid: 501 });
  const r86l = SP.daemonSocketPath({ root: rootOf(86), platform: 'linux', uid: 1000 });
  eq([r86d.tried[0].bytes, r86d.via, r86l.via], [104, 'tmp', 'natural'], 'an 86-byte root (+18 = 104) does NOT fit on darwin, DOES on linux (108)');
  const r120l = SP.daemonSocketPath({ root: rootOf(120), platform: 'linux', xdgRuntimeDir: '/run/user/1000', uid: 1000 });
  ok(r120l.via === 'runtime-dir' && /^\/run\/user\/1000\/vibespace\/d-[0-9a-f]{12}\.sock$/.test(r120l.path), 'a 120-byte root ⇒ runtime-dir on linux', r120l);
  const r120d = SP.daemonSocketPath({ root: rootOf(120), platform: 'darwin', tmpdir: '/var/folders/zz/abcdefgh_1234567890/T/', uid: 501 });
  ok(r120d.via === 'tmpdir' && r120d.path.startsWith('/var/folders/zz/abcdefgh_1234567890/T/vibespace/d-'), '…tmpdir on darwin with a per-user /var/folders/… TMPDIR', r120d);
  const r120t = SP.daemonSocketPath({ root: rootOf(120), platform: 'darwin', tmpdir: '/tmp', uid: 501 });
  ok(r120t.via === 'tmp' && r120t.path === `/tmp/vs-dev-501/d-${SP.rootHash(rootOf(120))}.sock`, '…tmp when TMPDIR is /tmp (a shared /tmp is not the tmpdir rung)', r120t);
  const r120p = SP.daemonSocketPath({ root: rootOf(120), platform: 'darwin', tmpdir: '/private/var/folders/q/T', uid: 501 });
  eq(r120p.via, 'tmpdir', '/private/var/folders/… is a per-user TMPDIR too');
  const longBase = '/tmp/' + 'b'.repeat(90);
  const none = SP.daemonSocketPath({ root: rootOf(120), platform: 'darwin', tmpdir: '/tmp', uid: 4294967294, tmpBase: longBase });
  ok(none.path === null && none.code === 'socket_path_too_long' && none.tried.length === 2 && none.tried.every((t) => t.bytes > 103), 'socket_path_too_long when even the tmp rung cannot fit (constructed with a patched base)', none);
  ok(/socket_path_too_long — no socket path fits 103 bytes: natural \d+ B/.test(SP.tooLongLine(none)), 'the refusal line names every rung\'s bytes', SP.tooLongLine(none));
  const tenDigit = SP.daemonSocketPath({ root: rootOf(300), platform: 'darwin', tmpdir: '/tmp', uid: 4294967294 });
  ok(tenDigit.via === 'tmp' && tenDigit.bytes === 42 && tenDigit.bytes <= 103, `a 10-digit uid's tmp rung is ${tenDigit.bytes} bytes (/tmp/vs-dev-<10 digits>/d-<12 hex>.sock) — always fits`);
  const cjk = '/home/' + '用户'.repeat(12) + '/.vibespace/agentd';
  const rc = SP.daemonSocketPath({ root: cjk, platform: 'darwin', uid: 501 });
  eq([SP.utf8Bytes('用'), rc.tried[0].bytes > 103, cjk.length + 18 < 103], [3, true, true], 'bytes are counted in UTF-8 (a CJK home that fits in CHARACTERS does not in bytes)');
  eq(SP.rootHash('/a'), SP.rootHash('/a/'.replace(/\/$/, '')), 'the key is sha1(root) — the Windows pipe rule');
  ok(SP.daemonSocketPath({ root: rootOf(120), platform: 'linux', xdgRuntimeDir: 'relative/dir', uid: 1 }).via === 'tmp', 'a relative XDG_RUNTIME_DIR is not a rung');
  eq(SP.socketDirOf(r120t), `/tmp/vs-dev-501`, 'the directory a non-natural rung creates');
  eq(SP.socketDirOf(r40), null, 'the natural rung creates nothing new');
}

console.log('the ownership verdict');
{
  const st = (x) => ({ isSymbolicLink: () => !!x.link, isDirectory: () => x.dir !== false, uid: x.uid ?? 1000, mode: x.mode ?? 0o40700 });
  eq(SP.socketDirVerdict(st({}), 1000), { ok: true }, 'ours, a directory, 0700 ⇒ ok');
  for (const [x, why] of [[{ link: true }, 'SYMLINK'], [{ uid: 0 }, 'owned by uid 0'], [{ mode: 0o40777 }, 'mode is 777'], [{ mode: 0o40750 }, 'mode is 750'], [{ dir: false }, 'not a directory']]) {
    const v = SP.socketDirVerdict(st(x), 1000);
    ok(!v.ok && v.code === 'socket_dir_hijacked' && v.why.includes(why), `${JSON.stringify(x)} ⇒ socket_dir_hijacked (${why}) — attack 21`, v);
  }
  // the REAL creator with a patched fs: the lstat after mkdir answers a planted symlink
  const fake = { lstatSync: () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }, mkdirSync: () => {} };
  let n = 0;
  fake.lstatSync = () => { if (n++ === 0) { const e = new Error('x'); e.code = 'ENOENT'; throw e; } return st({ link: true }); };
  eq(SP.ensureSocketDir('/tmp/vs-dev-1000', { fs: fake, uid: 1000 }).code, 'socket_dir_hijacked', 'a symlink planted between mkdir and the lstat is refused (a patched lstat)');
  const other = { lstatSync: () => st({ uid: 4242 }), mkdirSync: () => { throw new Error('must not mkdir an existing dir'); } };
  eq(SP.ensureSocketDir('/tmp/vs-dev-1000', { fs: other, uid: 1000 }).code, 'socket_dir_hijacked', 'a pre-planted dir owned by another uid is refused, nothing created');
  const dir = path.join(scratch('sockpath'), 'vs-dev-' + process.getuid());
  try {
    const v = SP.ensureSocketDir(dir, { uid: process.getuid() });
    ok(v.ok && (fs.statSync(dir).mode & 0o777) === 0o700, 'the real creator makes the directory 0700 and accepts it', v);
    fs.chmodSync(dir, 0o777);
    eq(SP.ensureSocketDir(dir, { uid: process.getuid() }).code, 'socket_dir_hijacked', 'the same directory at 0777 is refused (never "fixed" silently)');
  } finally { try { fs.rmSync(path.dirname(dir), { recursive: true, force: true }); } catch { } }
}

console.log('the witness reader (the --stdio bridge + the hub\'s local transport)');
{
  const root = path.join(scratch('sockwit'), 'root');
  const state = path.join(root, 'state');
  fs.mkdirSync(state, { recursive: true });
  const live = path.join(scratch('sockwit'), 'live.sock');
  const srv = net.createServer(() => {});
  await new Promise((r) => srv.listen(live, r));
  try {
    const rule = SP.daemonSocketPath({ root, platform: process.platform, tmpdir: os.tmpdir(), xdgRuntimeDir: process.env.XDG_RUNTIME_DIR || '', uid: process.getuid() }).path;
    eq(SP.witnessOrRule({ root, uid: process.getuid() }).path, rule, 'no witness ⇒ the rule');
    fs.writeFileSync(SP.witnessPathOf(root), live + '\n');
    eq(SP.witnessOrRule({ root, uid: process.getuid() }), { path: live, via: 'witness' }, 'a witness naming a live socket wins');
    const plain = path.join(state, 'plain.txt'); fs.writeFileSync(plain, 'x');
    fs.writeFileSync(SP.witnessPathOf(root), plain + '\n');
    eq(SP.witnessOrRule({ root, uid: process.getuid() }).path, rule, 'a witness naming a plain FILE is ignored (the rule)');
    fs.writeFileSync(SP.witnessPathOf(root), 'relative/x.sock\n');
    eq(SP.witnessOrRule({ root, uid: process.getuid() }).path, rule, 'a relative witness is ignored');
    // the hub's reader IS this reader: a DeviceManager over this root connects where the witness says
    fs.writeFileSync(SP.witnessPathOf(root), live + '\n');
    const prev = process.env.VIBESPACE_AGENTD_ROOT;
    process.env.VIBESPACE_AGENTD_ROOT = root;
    try {
      const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
      const dm = new DeviceManager({ dataDir: scratch('sockwit'), bundlePath: '/nonexistent', version: '0' });
      eq(dm._sock, live, 'src/agentd/client.js `_sock` = the witness (the hub reads where the daemon REALLY listens)');
      fs.unlinkSync(SP.witnessPathOf(root));
      eq(dm._sock, rule, '…and the rule when there is none');
      eq(dm.status().socket, rule, 'status() reports the same path');
    } finally { if (prev === undefined) delete process.env.VIBESPACE_AGENTD_ROOT; else process.env.VIBESPACE_AGENTD_ROOT = prev; }
  } finally { srv.close(); try { fs.rmSync(scratch('sockwit'), { recursive: true, force: true }); } catch { } }
}

console.log('THE CENSUS — every socket path the tree builds');
// A socket-path PRODUCER or reader: a `.sock` literal, `sockDir` / `socketDir`, the natural `agentd.sock`, the ssh
// ControlPath, or the rule's own entry points. Comment lines are not code. Files, not lines: each file's class says
// which rule bounds what it builds (or that it only reads).
const TABLE = {
  'src/sock-path.js': 'THE rule (the rung ladder, the ownership verdict, the witness reader)',
  'src/agentd/agentd.js': 'daemon listen socket — daemonSocketPath + the witness; the --stdio bridge reads witnessOrRule',
  'src/agentd/client.js': 'hub local device #0 transport — witnessOrRule (the same function)',
  'src/hosts.js': 'ssh ControlPath masters — os.tmpdir()/vs-cm-<uid>, short by construction (existing)',
  'src/browser-profiles.js': 'agent-browser session sockets — its own socketDirDecision (SOCKET_PATH_MAX = 103, existing)',
  'src/browser-facts.js': 'agent-browser — reads the CLI\'s own socketDir (browser-profiles\' rule)',
  'src/browser-serve.js': 'agent-browser — reports socketDir (browser-profiles\' rule)',
  'src/browser-verbs.js': 'agent-browser — hands socketDirDecision().dir to the CLI (browser-profiles\' rule)',
  'src/routes/browser.js': 'agent-browser — reports socketDir (browser-profiles\' rule)',
  'src/server/browser-env.js': 'agent-browser — creates + verifies the short dir (browser-profiles\' rule)',
  'src/server/browser-keeper.js': 'agent-browser — reads socketDir back (browser-profiles\' rule)',
  'src/plugins/tailscale.js': 'tailscaled plugin socket — socketPathFits asked at start: over ⇒ refused by name',
  'server.js': 'dtach session anchors data/sockets/cw-* — ONE boot line when cw- + 36 exceeds the bound',
  'src/incident.js': 'incident capture — a READER of data/sockets',
  'data/bin/vibespace-remote-keeper': 'remote keeper socket under ~/.vibespace/run on the remote host — short by construction (existing)',
};
const PRODUCER_RE = /\.sock['"`]|\bsockDir\b|\bsocketDir\b|agentd\.sock|ControlPath|\bdaemonSocketPath\b|\bwitnessOrRule\b|socketPathFits|data', 'sockets'|SOCKETS_DIR, 'cw-/;
const codeLines = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, ''));
function census(read, list) {
  const found = list.filter((f) => codeLines(read(f)).some((l) => PRODUCER_RE.test(l)));
  return { found, unlisted: found.filter((f) => !TABLE[f]), ghosts: Object.keys(TABLE).filter((f) => !found.includes(f)) };
}
// TRACKED files only (`git ls-files`), never a directory walk: the production checkout's data/bin also
// holds what the SERVER puts there at boot (the copied vibespace-browser-verbs.js, the rclone binary a
// mount installed) — a walk counted those and the census went red in the pre-push hook while it was
// green in every lane worktree (2.369.197's first push). A census is over the tree git ships.
const tracked = () => {
  const out = execFileSync('git', ['ls-files', '-z', '--', 'server.js', 'src', 'data/bin'], { cwd: REPO, encoding: 'utf8' })
    .split('\0').filter(Boolean)
    .filter((f) => f === 'server.js' || (f.startsWith('src/') ? /\.(js|mjs|cjs)$/.test(f) : !/^data\/bin\/vibespace-agentd/.test(f)));
  return out.filter((f) => !/i18n-(zh|ja)\.js$/.test(f));
};
{
  const files = tracked();
  const readReal = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { return ''; } };
  const c = census(readReal, files);
  ok(files.length > 200, `census scope is src/ + data/bin + server.js (${files.length} files, the daemon bundle excluded)`);
  ok(c.unlisted.length === 0, `every socket-path producer / reader is in the table (${c.found.length} found)`, c.unlisted);
  ok(c.ghosts.length === 0, 'every table row names a file that still builds / reads a socket path (no dead row)', c.ghosts);
  // CONTROL: a planted producer in a scratch copy of a file the table does not name
  const plantedRel = 'src/zz-planted-socket.js';
  const planted = census((f) => (f === plantedRel ? "const s = require('path').join(os.homedir(), 'x', id + '.sock');" : readReal(f)), [...files, plantedRel]);
  eq(planted.unlisted, [plantedRel], 'CONTROL: a planted `.sock` producer in a file the table does not name is caught');
  const commented = census((f) => (f === plantedRel ? "// const s = id + '.sock';" : readReal(f)), [...files, plantedRel]);
  eq(commented.unlisted, [], '…while the same shape in a comment is not code');
  // the wiring each row promises (pins on the named sites)
  // (ws-create's per-session channel socket and its reader in the ladder went with the VibeSpace channel, B-df40 — their rows with them)
  ok(/socketPathFits\(tsSock\(\), process\.platform\)/.test(readReal('src/plugins/tailscale.js')), 'the tailscale plugin asks socketPathFits at start');
  ok(/socketPathFits\(path\.join\(SOCKETS_DIR, 'cw-' \+ 'x'\.repeat\(36\)\)/.test(readReal('server.js')), 'server.js says the dtach anchors\' bound once at boot');
  const ad = readReal('src/agentd/agentd.js');
  ok(/SOCKP\.daemonSocketPath\(\{/.test(ad) && /SOCKP\.witnessOrRule\(\{/.test(ad) && /SOCKP\.ensureSocketDir\(/.test(ad) && /process\.exit\(7\)/.test(ad) && /process\.exit\(8\)/.test(ad) && /SOCKP\.witnessPathOf\(ROOT\)/.test(ad), 'the daemon: the rule at listen, the witness written, the bridge reads witness-or-rule, too-long exits 7, hijacked exits 8');
  ok(/SP\.witnessOrRule\(\{ root: this\._root/.test(readReal('src/agentd/client.js')), 'the hub\'s transport reads witness-or-rule');
}

console.log('control (patched copy)');
{
  const M = mutantCopies('sockpath', REPO);
  const src = fs.readFileSync(path.join(REPO, 'src/sock-path.js'), 'utf8');
  const fixed = src.replace("const m = Object.prototype.hasOwnProperty.call(SUN_PATH_MAX, platform) ? SUN_PATH_MAX[platform] : SUN_PATH_MAX.default;", 'const m = 108;');
  ok(fixed !== src, 'the patch applies');
  const X = M.load('src/sock-path.js', fixed, 'bound108');
  const cell = (m) => m.daemonSocketPath({ root: rootOf(86), platform: 'darwin', uid: 501 }).via;
  ok(cell(X) === 'natural' && cell(SP) === 'tmp', 'CONTROL: a ladder with the bound fixed at 108 puts the 104-byte darwin path on the natural rung (the incident) — the real one moves it');
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 1, label: 'mutant-copy: ' })) ok(r.pass, r.name, r.detail);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
