#!/usr/bin/env node
// lane browser-tmpdir-socket-length (owner 2026-10-12: EVERY new agent browser died at launch — Chrome FATAL "Socket path
// too long": the daemon's TMPDIR = data/browser-env/tmp on a 51-char data path ⇒ …/org.chromium.Chromium.XXXXXX/
// SingletonSocket = 112 > 108). ① PURE browserTmpDir table (data path while it fits, else a short /var/tmp per-uid root,
// a RAM /var/tmp ⇒ the fallback root) · ② THE OS CONTROL: a Unix socket bound at <dir>/org.chromium.Chromium.XXXXXX/
// SingletonSocket — the verdict's dir binds, the pre-fix data path FAILS (the arithmetic judged by the kernel, not a
// constant), and the 62/63-byte boundary · ③ launchFatalOf names the FATAL, never a profile lock · ④ the maker: 0700,
// a planted symlink refused, the why said once · ⑤ the REAL browser-env + keeper wiring. Scratch dirs only, no browser.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const B = require(path.join(REPO, 'src/browser-profiles.js'));
const F = require(path.join(REPO, 'src/browser-facts.js'));
let fails = 0, n = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { fails++; console.log(`  ✗ ${m}${d ? `\n      ${String(d).slice(0, 400)}` : ''}`); } };
const made = [];
const scratch = (base, tag) => { const d = fs.mkdtempSync(path.join(base, `vs-btd-${tag}-`)); made.push(d); return d; };
const pad = (base, total) => { const d = scratch(base, 'p'); const need = total - Buffer.byteLength(d) - 1; const p = path.join(d, 'x'.repeat(Math.max(1, need))); fs.mkdirSync(p); return p; };
const bindAt = (dir) => new Promise((resolve) => {
  const sock = path.join(dir, 'org.chromium.Chromium.Ab3dE6', 'SingletonSocket');
  try { fs.mkdirSync(path.dirname(sock), { recursive: true, mode: 0o700 }); } catch (e) { resolve({ ok: false, code: e.code, sock }); return; }
  const srv = net.createServer();
  srv.once('error', (e) => resolve({ ok: false, code: e.code, sock }));
  // int256 (the runner shape, node 22.23.3): node 22 LISTENS on a > 108-byte path by binding its first 108 bytes (a socket
  // under a truncated name; node 24 says EINVAL) — so a bind counts only when the socket is AT the path asked for
  srv.listen(sock, () => { let at = false; try { at = fs.lstatSync(sock).isSocket(); } catch { } srv.close(() => resolve(at ? { ok: true, sock } : { ok: false, code: 'TRUNCATED', sock })); });
});
try {
  console.log('① PURE browserTmpDir');
  const d70 = '/home/someone/workspace/AIWorkspace/vibespace-checkout-long/data-dir70'; // 70 chars
  const d40 = '/srv/vibespace/data-forty-chars-long-aa'; // 39 chars
  const v70 = B.browserTmpDir({ dataDir: d70, uid: 1000 });
  ok(v70.short && v70.dir === '/var/tmp/vibespace-1000/browser-tmp' && /86 bytes; Chrome's socket needs ≤ 62/.test(v70.why), `a 70-char dataDir ⇒ the short root (${v70.dir}; why "${v70.why}")`, JSON.stringify(v70));
  const v40 = B.browserTmpDir({ dataDir: d40, uid: 1000 });
  ok(!v40.short && v40.dir === `${d40}/browser-env/tmp` && v40.why === null, 'a 39-char dataDir ⇒ the data path, no why', JSON.stringify(v40));
  const at = (len) => B.browserTmpDir({ dataDir: '/' + 'd'.repeat(len - 1 - 16), uid: 7 });
  ok(!at(62).short && at(63).short, 'boundary: a 62-byte data path is kept, 63 moves (62 + 45 = 107 < 108)');
  const own = '/home/fixture1/workspace/AIWorkspace/vibespace/data';
  ok(B.browserTmpDir({ dataDir: own, uid: 1000 }).short, "the owner's measured data path (67 bytes with /browser-env/tmp) ⇒ the short root");
  const ram = B.browserTmpDir({ dataDir: d70, uid: 1000, shortFsType: 'tmpfs', fallback: '/tmp' });
  ok(ram.dir === '/tmp/vibespace-1000/browser-tmp' && /\/var\/tmp is tmpfs \(RAM\)/.test(ram.why), 'a tmpfs /var/tmp ⇒ the fallback root, the why says RAM', JSON.stringify(ram));
  const none = B.browserTmpDir({ dataDir: d70, uid: 1000, shortBase: '/' + 'z'.repeat(60) });
  ok(none.dir === null && /no short root fits/.test(none.why), 'no root fits ⇒ dir null (the CLI keeps its own)', JSON.stringify(none));
  ok(Buffer.byteLength(B.CHROME_SINGLETON_TAIL) === 45 && B.SUN_PATH_LIMIT === 108, 'tail 45 bytes (29 + 16), limit 108');
  ok(B.browserTmpDir({ dataDir: '/' + 'é'.repeat(30), uid: 1 }).short, 'bytes, not characters (30 é = 60 bytes + 16 ⇒ moves)');

  console.log('② THE OS CONTROL — a Unix socket bound where Chrome binds it');
  const longData = pad('/tmp', 51); // the owner's 51-byte data dir shape
  fs.mkdirSync(path.join(longData, 'browser-env', 'tmp'), { recursive: true });
  const preFix = path.join(longData, 'browser-env', 'tmp'); // the .255 rule: always the data path
  const shortBase = scratch('/var/tmp', 's');
  const v = B.browserTmpDir({ dataDir: longData, uid: process.getuid(), shortBase });
  fs.mkdirSync(v.dir, { recursive: true, mode: 0o700 });
  const rPre = await bindAt(preFix), rNew = await bindAt(v.dir);
  ok(!rPre.ok && /EINVAL|ENAMETOOLONG|TRUNCATED/.test(rPre.code || ''), `CONTROL (red on .255): the pre-fix data path's socket (${Buffer.byteLength(rPre.sock)} bytes) is REFUSED by the OS — ${rPre.code}`, JSON.stringify(rPre));
  ok(v.short && rNew.ok, `the verdict's dir (${v.dir}, socket ${Buffer.byteLength(rNew.sock)} bytes) binds`, JSON.stringify(rNew));
  const tmpAt = (len) => { const d = pad('/tmp', len - 16); fs.mkdirSync(path.join(d, 'browser-env', 'tmp'), { recursive: true }); return d; };
  const [b62, b63, b64] = [tmpAt(62), tmpAt(63), tmpAt(64)];
  const [r62, r63, r64] = [await bindAt(path.join(b62, 'browser-env', 'tmp')), await bindAt(path.join(b63, 'browser-env', 'tmp')), await bindAt(path.join(b64, 'browser-env', 'tmp'))];
  // measured on Linux: the kernel takes a 108-byte sun_path with no NUL (63-byte TMPDIR binds), refuses 109; Chrome's own
  // check is `>= sizeof(sun_path)`, one byte stricter — so the verdict moves at 63, one under the OS's last byte
  ok(r62.ok && r63.ok && !r64.ok && /EINVAL|ENAMETOOLONG|TRUNCATED/.test(r64.code || ''), `the OS boundary: TMPDIR 62 binds (${Buffer.byteLength(r62.sock)} B), 63 binds (108 B, the kernel's last byte), 64 refused (${r64.code})`, JSON.stringify({ r62, r63, r64 }));
  ok(B.browserTmpDir({ dataDir: b62 }).short === false && B.browserTmpDir({ dataDir: b63 }).short === true, "the verdict keeps 62 and moves 63 — Chrome's >= check, one byte inside the OS limit");
  console.log('③ launchFatalOf');
  const owner = 'Chrome stderr: [2997700:2997700:1012/211312.123:FATAL:chrome/browser/process_singleton_posix.cc:313] Socket path too long: /home/fixture1/workspace/AIWorkspace/vibespace/data/browser-env/tmp/org.chromium.Chromium.2QgDc3/SingletonSocket';
  const lf = B.launchFatalOf(owner);
  ok(lf && lf.reason === 'socket_path_too_long' && /temp path is too long for Chrome's singleton socket/.test(lf.error) && /process_singleton_posix\.cc:313\] Socket path too long/.test(lf.error), "the owner's FATAL ⇒ socket_path_too_long with the fix and Chrome's line", lf && lf.error);
  ok(B.launchFatalOf('ERROR: cannot create default profile directory').reason === 'tmp_dir_unwritable', 'cannot create default profile directory ⇒ tmp_dir_unwritable');
  ok(B.launchFatalOf('Failed to create /p/SingletonLock: File exists (17)') === null && B.launchFatalOf('') === null && B.launchFatalOf(null) === null, 'a profile lock / nothing ⇒ null (the lock verdict keeps its own sentence)');

  console.log('④ makeBrowserTmpDir');
  const lines = []; const log = { log: (s) => lines.push(['log', s]), warn: (s) => lines.push(['warn', s]) };
  const shortData = scratch('/tmp', 'd');
  const m1 = F.makeBrowserTmpDir({ dataDir: shortData, log });
  ok(m1 === path.join(shortData, 'browser-env', 'tmp') && (fs.statSync(m1).mode & 0o777) === 0o700 && lines.length === 0, 'a short dataDir ⇒ data/browser-env/tmp made 0700, nothing said', JSON.stringify({ m1, lines }));
  const sb2 = scratch('/var/tmp', 'm');
  const m2 = F.makeBrowserTmpDir({ dataDir: longData, log, shortBase: sb2, mountinfo: '' });
  ok(m2 === path.join(sb2, `vibespace-${process.getuid()}`, 'browser-tmp') && (fs.statSync(path.dirname(m2)).mode & 0o777) === 0o700 && lines.length === 1 && lines[0][0] === 'log' && /browser TMPDIR = .*Chrome's socket needs ≤ 62/.test(lines[0][1]), 'a long dataDir ⇒ the short root made 0700, the why said once', JSON.stringify({ m2, lines }));
  const sb3 = scratch('/var/tmp', 'h'); const elsewhere = scratch('/tmp', 'e');
  fs.symlinkSync(elsewhere, path.join(sb3, `vibespace-${process.getuid()}`));
  lines.length = 0;
  const m3 = F.makeBrowserTmpDir({ dataDir: longData, log, shortBase: sb3, mountinfo: '' });
  ok(m3 === null && lines.length === 1 && /is not this user's own directory/.test(lines[0][1]) && !fs.existsSync(path.join(elsewhere, 'browser-tmp')), 'a planted symlink at the per-uid name ⇒ refused (null + a warn), nothing made through it', JSON.stringify({ m3, lines }));
  lines.length = 0;
  const mi = `30 1 0:5 / ${sb2} rw - tmpfs tmpfs rw\n`;
  const m4 = F.makeBrowserTmpDir({ dataDir: longData, log, shortBase: sb2, mountinfo: mi });
  ok(m4 === path.join(os.tmpdir(), `vibespace-${process.getuid()}`, 'browser-tmp') || m4 === null, 'a tmpfs short base ⇒ the fallback root (or none fits)', JSON.stringify({ m4, lines }));
  ok(lines.length === 1 && lines[0][0] === 'warn' && /\(RAM\)/.test(lines[0][1]), 'the RAM fallback is said as a WARN naming why', JSON.stringify(lines));

  console.log('⑤ the REAL wiring');
  const BE = require(path.join(REPO, 'src/server/browser-env.js'));
  const be = BE.create({ dataDir: shortData, log: { log() {}, warn() {}, error() {} } });
  ok(be.tmpDir() === path.join(shortData, 'browser-env', 'tmp') && be.tmpDir() === be.tmpDir(), 'browser-env.tmpDir() (the /resolve answer → the CLI\'s TMPDIR) = the verdict, memoized');
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  ok(/const daemonTmp = \(\) => \{ if \(daemonTmpMade\) return daemonTmpMade; const d = F\.makeBrowserTmpDir\(\{ dataDir, log \}\);/.test(ksrc) && !/path\.join\(dataDir, 'browser-env', 'tmp'\)/.test(ksrc), "the keeper's daemon TMPDIR = the same maker (no second spelling of the data path)");
  ok((ksrc.match(/B\.launchFatalOf\(r\.stderr \|\| r\.error \|\| r\.stdout\)/g) || []).length === 2, 'both launch-failure sites (ephemeral + named) name a known FATAL');
} finally {
  for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
}
console.log(`\n${fails ? '✗' : '✓'} test-browser-tmpdir: ${n - fails}/${n}`);
process.exit(fails ? 1 : 0);
