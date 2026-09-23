#!/usr/bin/env node
// DESKTOP DISPLAY — machine facts (docs/design-desktop-apps.zh.md §6 row 2,
// P8-1, 2026-09-13): display allocation through -displayfd never collides
// (two back-to-back servers get two numbers, neither guessed), the Xauthority
// cookie file this module WRITES is one X clients and servers READ (a client
// with no entry for the display is refused, one with it is admitted), window
// enumeration on a real display finds a real xmessage/xterm/xlogo window
// with its name, and the xpra version probe parses a fake `xpra` on PATH
// (the real one when installed). Every leg that needs a binary SKIPs with the
// reason when it is absent. No fixed display number, no fixed port, no fixed
// /tmp name (scripts/scratch.mjs). Run: node scripts/test-desktop-display.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const skip = (why) => { skipped++; console.log(`  ⚠ SKIP: ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const run = (bin, args, env) => new Promise((res) => execFile(bin, args, { env, timeout: 5000, encoding: 'utf8' }, (err, stdout, stderr) => res({ err, stdout: String(stdout || ''), stderr: String(stderr || '') })));

const D = require('../src/desktop-display.js');
const ident = require('../src/cli-identity.js');
const dir = scratch('desktop-display');
fs.mkdirSync(dir, { recursive: true });
const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

console.log('§1 no-binary facts');
{
  let threw = null;
  try { D.assertLocal('remote-box', 'test'); } catch (e) { threw = e; }
  ok(threw && threw.code === 'unsupported-host' && /local-only/.test(threw.message), 'a non-local hostId is REFUSED BY NAME (v1), never silently served locally');
  ok((() => { try { D.assertLocal(null); D.assertLocal(''); D.assertLocal('local'); return true; } catch { return false; } })(), 'null / "" / "local" are this machine');
}
{
  const env = { PATH: `${dir}/binA${path.delimiter}${dir}/binB` };
  fs.mkdirSync(`${dir}/binA`); fs.mkdirSync(`${dir}/binB`);
  fs.writeFileSync(`${dir}/binB/tool-x`, '#!/bin/sh\n', { mode: 0o755 });
  fs.writeFileSync(`${dir}/binA/not-exec`, '#!/bin/sh\n', { mode: 0o644 });
  let t = 0; const now = () => t;
  D.resetBinMemo();
  ok(D.binOnPath('tool-x', { env, now }) === `${dir}/binB/tool-x`, 'binOnPath walks PATH and returns the first EXECUTABLE file');
  ok(D.binOnPath('not-exec', { env, now }) === null, 'a non-executable file is not a binary');
  ok(D.binOnPath('absent', { env, now }) === null, 'absent ⇒ null');
  fs.writeFileSync(`${dir}/binA/absent`, '#!/bin/sh\n', { mode: 0o755 });
  ok(D.binOnPath('absent', { env, now }) === null, 'a NO is memoised for the recheck window (no stat storm)');
  t = 61000;
  ok(D.binOnPath('absent', { env, now }) === `${dir}/binA/absent`, 'a NO is re-checked after 60 s — a package install is seen without a restart');
  fs.unlinkSync(`${dir}/binB/tool-x`);
  t = 200000;
  ok(D.binOnPath('tool-x', { env, now }) === `${dir}/binB/tool-x`, 'a YES is remembered for good (a platform fact; hostCanIdentify\'s rule)');
  ok(D.binOnPath('../x', { env, now }) === null && D.binOnPath('a/b', { env, now }) === null && D.binOnPath('', { env, now }) === null, 'a name with a slash or empty is never looked up');
  D.resetBinMemo();
}
{
  const env = D.x11Env({ PATH: '/x', WAYLAND_DISPLAY: 'wayland-0', XDG_SESSION_TYPE: 'wayland', HOME: '/h' }, { display: ':42', authFile: '/a' });
  ok(!('WAYLAND_DISPLAY' in env) && env.XDG_SESSION_TYPE === 'x11' && env.DISPLAY === ':42' && env.XAUTHORITY === '/a' && env.GDK_BACKEND === 'x11' && env.QT_QPA_PLATFORM === 'xcb' && env.HOME === '/h' && env.PATH === '/x', 'x11Env strips the Wayland session (x11vnc 0.9.17 EXITS when WAYLAND_DISPLAY is set — measured) and pins DISPLAY/XAUTHORITY/XDG_SESSION_TYPE/GDK_BACKEND/QT_QPA_PLATFORM, keeping the rest');
}
{
  const cookie = D.newCookie();
  ok(/^[0-9a-f]{32}$/.test(cookie) && D.newCookie() !== cookie, 'a cookie is 16 random bytes hex, fresh each time');
  const e = D.xauthEntry({ display: ':7', cookieHex: cookie, host: 'box' });
  // family(2) addrlen(2) 'box' numlen(2) '7' namelen(2) 'MIT-MAGIC-COOKIE-1' datalen(2) 16
  ok(e.readUInt16BE(0) === 256 && e.readUInt16BE(2) === 3 && e.slice(4, 7).toString() === 'box' && e.readUInt16BE(7) === 1 && e.slice(9, 10).toString() === '7' && e.readUInt16BE(10) === 18 && e.slice(12, 30).toString() === 'MIT-MAGIC-COOKIE-1' && e.readUInt16BE(30) === 16 && e.length === 48, 'xauthEntry is the Xauthority binary layout (FamilyLocal, address, number, name, 16-byte data; big-endian u16 lengths)');
  const f = path.join(dir, 'Xauthority');
  D.writeXauthority(f, [{ display: '0', cookieHex: cookie, host: 'box' }, { display: ':5', cookieHex: cookie, host: 'box' }]);
  const st = fs.statSync(f);
  ok((st.mode & 0o777) === 0o600 && fs.readFileSync(f).length === 48 + 48, 'writeXauthority: mode 0600, one entry per display, replaced atomically (tmp+rename)');
  ok(!fs.existsSync(`${f}.${process.pid}.tmp`), 'no tmp file left behind');
}
{
  const sample = `
xwininfo: Window id: 0x1ff (the root window) (has no name)

  Root window id: 0x1ff (the root window) (has no name)
  Parent window id: 0x0 (none)
     2 children:
     0x200020 "xmessage": ("xmessage" "Xmessage")  300x100+10+10  +10+10
     0x400001 (has no name): ()  10x10+0+0  +0+0
`;
  const rows = D.parseWininfoTree(sample);
  ok(rows.length === 2 && rows[0].id === 0x200020 && rows[0].name === 'xmessage' && rows[0].instance === 'xmessage' && rows[0].cls === 'Xmessage' && rows[0].w === 300 && rows[0].h === 100 && rows[0].x === 10 && rows[0].y === 10 && rows[1].name === null, 'parseWininfoTree reads id / name / instance / class / geometry (captured `xwininfo -root -tree` output)', rows);
}

console.log('§2 real X: -displayfd allocation + the cookie + enumeration');
const facts = await D.hostFacts({});
ok(facts.hostId === 'local' && facts.bins && typeof facts.at === 'number', `hostFacts answers for this machine (${Object.entries(facts.bins).filter(([, v]) => v).map(([k]) => k).join(' ') || 'no X binaries'})`);
if (!facts.bins.Xvfb) skip('Xvfb is not on PATH — the real-display legs cannot run on this machine');
else {
  const cookie = D.newCookie();
  const auth = path.join(dir, 'Xauthority-real');
  D.writeXauthority(auth, [{ display: '0', cookieHex: cookie }]);
  const base = { PATH: process.env.PATH, HOME: process.env.HOME, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || 'wayland-0' };
  const xenv0 = D.x11Env(base, { display: ':0', authFile: auth });
  const a = await D.startXServer({ bin: 'Xvfb', binPath: facts.bins.Xvfb, authFile: auth, geometry: '640x480', env: xenv0 });
  const b = await D.startXServer({ bin: 'Xvfb', binPath: facts.bins.Xvfb, authFile: auth, geometry: '640x480', env: xenv0 });
  const kids = [a.child, b.child];
  try {
    ok(/^:\d+$/.test(a.display) && /^:\d+$/.test(b.display) && a.display !== b.display, `two servers back to back get two DIFFERENT displays from -displayfd (${a.display}, ${b.display}) — never a guessed :N`);
    ok(D.pidAlive(a.pid) && D.pidAlive(b.pid) && D.procStart(a.pid) > 0, 'both are alive and carry a starttime (the adoption identity)');
    ok(D.sameProcess(a.pid, D.procStart(a.pid)) && !D.sameProcess(a.pid, 12345) && !D.sameProcess(999999, 1), 'sameProcess = pid AND starttime (a recycled pid says no; a dead pid says no)');
    D.writeXauthority(auth, [{ display: '0', cookieHex: cookie }, { display: a.display, cookieHex: cookie }]);
    if (!facts.bins.xdpyinfo) skip('xdpyinfo not on PATH — the cookie admission legs cannot run');
    else {
      const withB = await run(facts.bins.xdpyinfo, ['-display', b.display], D.x11Env(base, { display: b.display, authFile: auth }));
      ok(!!withB.err, `a client with NO entry for ${b.display} in the cookie file is REFUSED (the server enforces -auth)`);
      const withA = await run(facts.bins.xdpyinfo, ['-display', a.display], D.x11Env(base, { display: a.display, authFile: auth }));
      ok(!withA.err && /name of display/.test(withA.stdout), `a client WITH the ${a.display} entry is admitted — and the server loaded the cookie from a placeholder ':0' entry written BEFORE it knew its number (the server ignores the display field)`);
      const noAuth = await run(facts.bins.xdpyinfo, ['-display', a.display], { PATH: process.env.PATH, DISPLAY: a.display });
      ok(!!noAuth.err, 'a client with no XAUTHORITY at all is refused');
    }
    const appBin = ['xmessage', 'xterm', 'xlogo'].map((n) => [n, D.binOnPath(n, { env: base })]).find(([, p]) => p);
    if (!appBin) skip('none of xmessage/xterm/xlogo on PATH — the enumeration leg cannot run');
    else {
      const [name, bin] = appBin;
      const args = name === 'xmessage' ? ['-geometry', '320x120+5+5', 'vs-display-probe'] : name === 'xterm' ? ['-geometry', '80x24+5+5', '-T', 'vs-display-probe'] : ['-geometry', '100x100+5+5'];
      const app = await D.startApp({ exec: bin, args, env: D.x11Env(base, { display: a.display, authFile: auth }) });
      kids.push(app);
      let found = null;
      for (let i = 0; i < 40 && !found; i++) {
        await sleep(150);
        const e = await D.enumerateWindows({ display: a.display, authFile: auth, env: base });
        found = e.ok ? e.windows.find((w) => w.mapped !== false && (w.name || w.cls || '').toLowerCase().includes(name === 'xlogo' ? 'xlogo' : 'vs-display-probe') || (w.cls || '').toLowerCase() === name) : null;
        if (!e.ok) { ok(false, `enumerateWindows failed: ${e.why}`); break; }
      }
      ok(!!found && found.w > 0 && found.h > 0, `enumerateWindows finds the real ${name} window on ${a.display} with a name/class and geometry (two spawns per call, whatever N)`, found);
      if (found && facts.bins.xdotool) ok(found.mapped === true, 'with xdotool present the window is reported MAPPED (the P9 target shape)');
      D.writeXauthority(auth, [{ display: '0', cookieHex: cookie }, { display: a.display, cookieHex: cookie }, { display: b.display, cookieHex: cookie }]);
      const other = await D.enumerateWindows({ display: b.display, authFile: auth, env: base });
      ok(other.ok && !other.windows.some((w) => (w.name || '').includes('vs-display-probe')), 'the other display does not see it (per-app isolation, DA2)');
      let threw = null;
      try { await D.enumerateWindows({ hostId: 'elsewhere', display: a.display, authFile: auth, env: base }); } catch (e) { threw = e; }
      ok(threw && threw.code === 'unsupported-host', 'enumerateWindows refuses a non-local host by name');
    }
    let bad = null;
    try { await D.startXServer({ bin: 'Xvfb', binPath: path.join(dir, 'no-such-X'), authFile: auth, env: xenv0, deadlineMs: 2000 }); } catch (e) { bad = e; }
    ok(bad && /failed to spawn|exited/.test(bad.message), 'a bogus X binary REJECTS with the reason instead of hanging on the displayfd');
    if (!facts.bins.x11vnc) skip('x11vnc not on PATH — the picture-server leg cannot run');
    else {
      const port = await D.freePort();
      const t0 = Date.now();
      const v = await D.startX11vnc({ binPath: facts.bins.x11vnc, display: a.display, authFile: auth, rfbPort: port, env: D.x11Env(base, { display: a.display, authFile: auth }) });
      kids.push(v);
      const w = await D.waitForRfb(port, { child: v, deadlineMs: 8000 });
      ok(w.ok && /^RFB 003\.\d{3}$/.test(w.banner), `x11vnc answers its RFB banner on a free loopback port (${w.banner}, ${Date.now() - t0} ms) — a READ probe, nothing written`, w);
      ok(D.listenerHeldBy(port, D.sessionCensus([v.pid])) === v.pid, 'and the 127.0.0.1 LISTEN socket on that port is HELD by x11vnc itself (listenerHeldBy over its session) — the identity the banner cannot give');
      const silent = await D.rfbBanner(port, 3000);
      ok(!!silent && /^RFB /.test(silent), 'a second SILENT client also gets the banner (x11vnc\'s ~320 ms websocket sniff is inside the probe\'s patience)');
      ok((await D.rfbBanner(await D.freePort(), 500)) === null, 'a port nobody listens on ⇒ null (no hang)');
      v.kill('SIGTERM'); await sleep(400);
      ok(!D.pidAlive(v.pid), 'x11vnc dies on SIGTERM');
    }
  } finally {
    for (const k of kids) { try { k.kill('SIGTERM'); } catch {} }
    await sleep(400);
    for (const k of kids) { if (D.pidAlive(k.pid)) { try { k.kill('SIGKILL'); } catch {} } }
    await sleep(200);
    ok(kids.every((k) => !D.pidAlive(k.pid)), 'every process this suite started is gone (no orphan X server)');
  }
}

console.log('§3 the xpra version probe');
{
  const fakeBin = path.join(dir, 'fakebin');
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, 'xpra'), '#!/bin/sh\necho "xpra v6.5.3"\n', { mode: 0o755 });
  const env = { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` };
  D.resetBinMemo();
  const v = await D.xpraVersion({ env });
  ok(v && v.version === '6.5.3' && v.error === null, 'a fake `xpra --version` on PATH parses to 6.5.3 (the probe leg the real binary will take)', v);
  const f2 = await D.hostFacts({ env });
  ok(f2.bins.xpra === path.join(fakeBin, 'xpra') && f2.xpra && f2.xpra.version === '6.5.3', 'hostFacts carries the xpra path AND its version');
  D.resetBinMemo();
  const real = D.binOnPath('xpra', { env: process.env });
  if (!real) skip('the real xpra is not installed on this box (apt has no candidate here) — the fake-binary leg above stands in; the fleet image adds the package');
  else { const rv = await D.xpraVersion({ binPath: real, env: process.env }); ok(rv && /^\d+\.\d+/.test(rv.version || ''), `the real xpra reports a version (${rv && rv.version})`, rv); }
  D.resetBinMemo(); // the real-binary probe above memoised the real path (a YES is remembered for good) — this leg is env-isolated
  ok((await D.xpraVersion({ env: { PATH: dir } })) === null, 'no xpra anywhere ⇒ null (a rung nobody can run)');
}

console.log('§4 r2 — spawns are awaited, a probe is not a guarantee, a socket has an owner, a session is a set');
{
  // (a) a missing binary is a NAMED rejection, never an uncaught 'error'
  let uncaught = null; const onU = (e) => { uncaught = e; }; process.on('uncaughtException', onU);
  let rejected = null;
  try { await D.startApp({ exec: path.join(dir, 'no-such-app'), args: [], env: { PATH: process.env.PATH } }); } catch (e) { rejected = e; }
  await sleep(50);
  process.off('uncaughtException', onU);
  ok(rejected && rejected.code === 'spawn-failed' && /ENOENT/.test(rejected.message) && uncaught === null, 'startApp on a missing binary REJECTS (spawn-failed, ENOENT named) — no uncaught exception', rejected && rejected.message);
  let rej2 = null;
  try { await D.startX11vnc({ binPath: path.join(dir, 'no-such-x11vnc'), display: ':999', authFile: '/dev/null', rfbPort: 1, env: { PATH: process.env.PATH } }); } catch (e) { rej2 = e; }
  ok(rej2 && rej2.code === 'spawn-failed' && /x11vnc/.test(rej2.message), 'startX11vnc on a missing binary rejects by name too', rej2 && rej2.message);
  let rej3 = null;
  try { await D.startWindowManager({ bins: { xfwm4: path.join(dir, 'no-such-wm') }, env: { PATH: process.env.PATH } }); } catch (e) { rej3 = e; }
  ok(rej3 && rej3.code === 'exec-vanished', 'startWindowManager re-stats the WM path first and refuses a vanished one by name (exec-vanished)', rej3 && rej3.message);
  const { child, spawned } = D.spawnDetached('sleep', ['5'], { env: { PATH: process.env.PATH } });
  const c = await spawned;
  ok(c === child && child.listenerCount('error') >= 1, "a spawned child keeps a permanent 'error' listener (a later error is never an uncaught exception)");
  try { child.kill('SIGKILL'); } catch {}
  // (b) a memoised YES is a PROBE answer: assertExecutable re-stats and forgets a refuted one
  const bin = path.join(dir, 'binC'); fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'vanisher'), '#!/bin/sh\n', { mode: 0o755 });
  D.resetBinMemo();
  const env = { PATH: bin };
  const p = D.binOnPath('vanisher', { env });
  fs.unlinkSync(path.join(bin, 'vanisher'));
  ok(D.binOnPath('vanisher', { env }) === p, 'CONTROL: after the file is gone the memo still answers YES (a platform fact, remembered for good)');
  let threw = null;
  try { D.assertExecutable(p, 'vanisher'); } catch (e) { threw = e; }
  ok(threw && threw.code === 'exec-vanished' && /no longer an executable/.test(threw.message), 'assertExecutable at spawn time refuses it by name', threw && threw.message);
  ok(D.binOnPath('vanisher', { env }) === null, 'and FORGOT the memo, so the next probe answers NO (a package removal is seen)');
  D.resetBinMemo();
  // (c) who holds a listening socket — on the exact address the bridge connects to
  const own = net.createServer(); await new Promise((r) => own.listen(0, '127.0.0.1', r));
  const port = own.address().port;
  ok(Number.isInteger(D.listenerInode(port)) && D.listenerHeldBy(port, [process.pid]) === process.pid, 'listenerHeldBy finds OUR pid holding our 127.0.0.1 listener (inode from /proc/net/tcp ↔ /proc/<pid>/fd)');
  ok(D.listenerHeldBy(port, [1, 999999]) === null, 'a candidate set that does not hold it ⇒ null (a stranger listens)');
  own.close();
  // The [::1]-only port must ALSO be free on IPv4 at assertion time — under the gate's concurrency the
  // kernel happily hands a v6 ephemeral number that some other suite holds on 127.0.0.1 (2.369.156 r4:
  // one such collision made this leg red inside the fast gate while green standalone). The precondition
  // is proved INDEPENDENTLY of the function under test: a 127.0.0.1 bind on the same number must succeed.
  let v6 = null, p6 = 0;
  for (let attempt = 0; attempt < 8 && !v6; attempt++) {
    const cand = net.createServer(); await new Promise((r) => cand.listen(0, '::1', r));
    const port = cand.address().port;
    const v4free = await new Promise((r) => { const probe = net.createServer(); probe.once('error', () => r(false)); probe.listen(port, '127.0.0.1', () => probe.close(() => r(true))); });
    if (v4free) { v6 = cand; p6 = port; } else cand.close();
  }
  ok(!!v6, 'found an [::1] ephemeral port that is free on 127.0.0.1 (precondition, proved by a v4 bind)');
  ok(v6 && D.listenerInode(p6) === null && D.listenerHeldBy(p6, [process.pid]) === null, 'an [::1]-only listener is NOT a 127.0.0.1 listener (the measured x11vnc race shape: same number, wrong family)');
  if (v6) v6.close();
  ok(D.listenerInode(await D.freePort()) === null, 'a port nobody listens on ⇒ null');
  // (d) the session census + marker + sample
  const marker = 'VIBESPACE_DESKTOP_APP=da-display-suite';
  const lead = spawn('sh', ['-c', 'sleep 30 & exec sleep 30'], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH, VIBESPACE_DESKTOP_APP: 'da-display-suite' } });
  lead.unref(); await sleep(200);
  ident.resetProcTables();
  const members = D.sessionMembers(lead.pid);
  ok(ident.readSid(lead.pid) === lead.pid && members.length === 2 && members.includes(lead.pid), `a detached leader is its own session (sid == pid) and the census holds it + the child it forked (${members.join(', ')})`);
  const kid = members.find((m) => m !== lead.pid);
  ok(D.environHas(kid, marker) && !D.environHas(kid, 'VIBESPACE_DESKTOP_APP=other') && !D.environHas(999999, marker), 'the forked child INHERITED the session marker; a different id / a dead pid do not carry it');
  const ss = D.sessionSample(members);
  ok(ss && ss.pids === 2 && ss.rssBytes > 0 && Number.isFinite(ss.cpuTicks), 'sessionSample sums the members (2 pids answered, RSS > 0)');
  ok(D.sessionSample([]) === null && D.sessionSample([999999]) === null, 'no member answers ⇒ null (no evidence, never zero)');
  const plain = spawn('sleep', ['30'], { stdio: 'ignore' });
  ok(D.sessionMembers(plain.pid).length === 0, 'a NON-detached child is not a session leader — its own pid names no session');
  plain.kill('SIGKILL');
  ok(D.sessionCensus([lead.pid, null, lead.pid]).length === 2, 'sessionCensus unions leaders, skips falsy, dedups');
  for (const m of members) { try { process.kill(m, 'SIGKILL'); } catch {} }
  const noproc = path.join(dir, 'noproc'); fs.mkdirSync(noproc, { recursive: true });
  ident.resetProcTables();
  ok(ident.readSid(process.pid, { procRoot: noproc }) === null && ident.sessionMembers(process.pid, { procRoot: noproc }).length === 0, 'BOUNDARY: a root with no procfs answers null / [] = no evidence (no `ps` rung on purpose — desktop apps are a /proc-machine feature in v1)');
  ident.resetProcTables();
  // (d′) r3 — the sample counts REAPED work, an unrecorded identity is not proven, the marker census, refreshSessions
  {
    const comm = (pid) => { try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); return s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')); } catch { return null; } };
    // a parent that runs a ~0.4 s CPU burner in a CHILD, reaps it, then execs into sleep (cutime survives exec)
    const parent = spawn('sh', ['-c', 'sh -c "i=0; while [ \\$i -lt 600000 ]; do i=\\$((i+1)); done"; exec sleep 30'], { detached: true, stdio: 'ignore' }); parent.unref();
    const t0 = Date.now(); while (comm(parent.pid) !== 'sleep' && Date.now() - t0 < 15000) await sleep(50);
    const ps = D.procSample(parent.pid);
    ok(ps && ps.reapedTicks >= 10 && ps.cpuTicks < 5, `procSample carries reapedTicks: a parent that reaped a CPU-burning child reads own ${ps && ps.cpuTicks} / reaped ${ps && ps.reapedTicks} ticks (${Date.now() - t0} ms)`, ps);
    const ss = D.sessionSample([parent.pid]);
    ok(ss && ss.cpuTicks >= (ps ? ps.reapedTicks : 1e9), `sessionSample COUNTS the reaped work (${ss && ss.cpuTicks} ticks); the round-2 live-only sum read ${ps && ps.cpuTicks}`);
    ok(D.sameProcess(parent.pid, null) === false && D.sameProcess(parent.pid, undefined) === false && D.sameProcess(parent.pid, D.procStart(parent.pid)) === true, 'sameProcess: a null/undefined recorded starttime is NOT proven (false for a LIVE pid — round 2 answered liveness); the real starttime is');
    ok(D.sameProcess(parent.pid, D.procStart(parent.pid), { procRoot: noproc }) === false, 'BOUNDARY: with no readable /proc a recorded starttime cannot be checked now ⇒ false (no evidence is not a yes)');
    // the marker census: one walk, only the ids asked
    const mk = (id) => { const c = spawn('sleep', ['30'], { detached: true, stdio: 'ignore', env: { PATH: process.env.PATH, VIBESPACE_DESKTOP_APP: id } }); c.unref(); return c; };
    const a1 = mk('da-census-a'), a2 = mk('da-census-a'), b1 = mk('da-census-b');
    await sleep(200);
    const c1 = D.markerCensus('VIBESPACE_DESKTOP_APP', ['da-census-a']);
    ok(c1.size === 1 && [...(c1.get('da-census-a') || [])].sort((x, y) => x - y).join() === [a1.pid, a2.pid].sort((x, y) => x - y).join(), `markerCensus answers ONLY the ids it was asked: both A pids (${a1.pid}, ${a2.pid}); B — alive and marked — is not in the map`, [...c1]);
    const c2 = D.markerCensus('VIBESPACE_DESKTOP_APP', ['da-census-a', 'da-census-b', 'da-census-none']);
    ok(c2.size === 2 && c2.get('da-census-b').length === 1 && c2.get('da-census-b')[0] === b1.pid && !c2.has('da-census-none'), 'both ids ⇒ both keys with their own pids; an id nobody carries is ABSENT (never an empty array)');
    ok(D.markerCensus('VIBESPACE_DESKTOP_APP', []).size === 0 && D.markerCensus('VIBESPACE_DESKTOP_APP', ['da-census-a'], { procRoot: noproc }).size === 0, 'no ids ⇒ nothing walked; no /proc ⇒ empty (no evidence)');
    const t1 = process.hrtime.bigint(); D.markerCensus('VIBESPACE_DESKTOP_APP', ['da-census-a']); const censusMs = Number(process.hrtime.bigint() - t1) / 1e6;
    console.log(`  (marker census over /proc: ${censusMs.toFixed(1)} ms — paid once, at boot)`);
    // refreshSessions: a leader spawned AFTER the memoised walk is visible only once the table is rebuilt
    ident.resetProcTables(); D.sessionMembers(a1.pid);
    const late = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' }); late.unref(); await sleep(150);
    ok(D.sessionMembers(late.pid).length === 0, 'CONTROL: a leader spawned after the memoised walk is not in the memo');
    D.refreshSessions();
    ok(D.sessionMembers(late.pid).length === 1 && D.sessionMembers(late.pid)[0] === late.pid, 'refreshSessions rebuilds the session table: now it is (the teardown pays this ONCE for all four parts)');
    for (const c of [parent, a1, a2, b1, late]) { try { process.kill(c.pid, 'SIGKILL'); } catch {} }
    ident.resetProcTables();
  }
  // (e) the bring-up table names every recipe the PURE table can ask for
  const M = require('../src/desktop-apps.js');
  for (const b of M.DISPLAY_BACKENDS) for (const g of b.needs) { const via = g.join('+'); const name = M.recipeFor(b.id, via); ok(typeof D.RECIPES[name] === 'function', `${b.id} via ${via} ⇒ recipe ${name} is a function in desktop-display.RECIPES`); }
  ok(Object.isFrozen(D.RECIPES) && Object.isFrozen(D.X_SERVER_ARGS) && typeof D.X_SERVER_ARGS.Xvfb === 'function' && typeof D.X_SERVER_ARGS.Xvnc === 'function', 'RECIPES and X_SERVER_ARGS are frozen tables (a new X server / rung is a row, not a branch)');
  let unknown = null;
  try { await D.startXServer({ bin: 'Xnope', binPath: '/x', authFile: '/a', env: {} }); } catch (e) { unknown = e; }
  ok(unknown && unknown.code === 'unknown-x-server', 'an X server the table does not name is a named rejection (unknown-x-server)');
}

console.log('§5 THE XPRA RUNG (P8-2, 2026-09-21): the argv table, the HTTP listen probe, the www-dir fact, the seamless-window filter, ONE REAL BRING-UP');
{
  // (a) the argv table — every flag chosen against `xpra start --help` on 6.5.3 and pinned by name
  const args = D.XPRA_ARGS({ port: 4321, dir: '/tmp/vs-app-x' });
  const has = (f) => args.includes(f);
  ok(args[0] === 'start' && has('--daemon=no') && has('--displayfd=3') && has('--use-display=no') && has('--html=on') && has(`--bind-tcp=127.0.0.1:4321,${D.XPRA_BIND_REFUSALS}`) && has('--bind=none'), 'xpra start: not daemonised (the keeper owns the pid), the display on fd 3, its OWN Xvfb, the html5 client on ONE loopback socket, no unix socket');
  ok(['stop', 'exit', 'detach', 'run', 'info', 'screenshot', 'print'].every((r) => D.XPRA_BIND_REFUSALS.split(',').includes(`${r}=no`)), `the socket refuses every hello request that acts on (or reads out) the session: ${D.XPRA_BIND_REFUSALS}`);
  ok(has('--socket-dir=/tmp/vs-app-x/xpra') && has('--sessions-dir=/tmp/vs-app-x/xpra') && has('--pidfile=/tmp/vs-app-x/xpra/server.pid'), 'socket/sessions/pid files live under the app dir (never ~/.xpra or $XDG_RUNTIME_DIR/xpra)');
  ok(has('--resize-display=yes') && has('--clipboard=yes') && has('--clipboard-direction=both'), 'the virtual screen follows the client; clipboard both ways');
  for (const f of ['--notifications=no', '--audio=no', '--pulseaudio=no', '--speaker=disabled', '--microphone=disabled', '--printing=no', '--webcam=no', '--file-transfer=no', '--open-files=no', '--open-url=no', '--system-tray=no', '--bell=no', '--mdns=no', '--systemd-run=no', '--dbus=no', '--dbus-launch=no', '--dbus-control=no', '--input-method=none', '--start-new-commands=no', '--shell=no', '--opengl=no', '--splash=no', '--remote-logging=no', '--http-scripts=off', '--sharing=yes', '--lock=no', '--exit-with-children=no', '--terminate-children=no']) ok(has(f), `${f} (off by name)`);
  ok(!args.some((a) => /^--start(-child)?=/.test(a)) && !has('--commands=no'), 'xpra starts NOTHING (the keeper spawns the app as its own leader) and --commands stays on (measured: `no` disables --start too)');
  ok(!has('--mmap=no'), 'NO --mmap=no (measured on 6.5.3: it blocks xpra.net.mmap in sys.modules and every client is then answered "connection error / error accepting new connection")');
  ok(args.some((a) => /^--xvfb=Xvfb -screen 0 4096x2304x24 /.test(a) && /-nolisten tcp/.test(a) && /-auth \$XAUTHORITY/.test(a)) && D.XPRA_GEOMETRY_MAX === '4096x2304', 'the Xvfb framebuffer is capped at 4096x2304 (the RSS: 98 MB vs 192 MB at the 8192x4096 default) with tcp off and the cookie file');
  ok(has('--dpi=96') && D.XPRA_ARGS({ port: 1, dir: '/d', dpi: 144 }).includes('--dpi=144') && D.XPRA_ARGS({ port: 1, dir: '/d', dpi: 'x' }).includes('--dpi=96') && D.XPRA_ARGS({ port: 1, dir: '/d', dpi: 9999 }).includes('--dpi=96'), 'HiDPI: --dpi = the display\'s font dpi (96 × scale / GDK_SCALE), spelled ALWAYS (96 by default; junk ⇒ 96) — never left to a client');
  ok(D.PROBE_BINS.includes('xrdb'), 'xrdb is a probed binary (the keeper merges the scale\'s X resources through it)');
  ok(Object.isFrozen(D.LISTEN_PROBES) && typeof D.LISTEN_PROBES.rfb === 'function' && typeof D.LISTEN_PROBES.http === 'function', 'LISTEN_PROBES is a frozen table: rfb (the banner) and http (xpra) — a recipe names its kind, the keeper never spells it');
  // (b) the HTTP probe + waitForListen against a tiny server, and the unknown kind
  const httpSrv = (await import('node:http')).createServer((req, res) => { res.statusCode = 200; res.end('hi'); });
  const hp = await new Promise((r) => httpSrv.listen(0, '127.0.0.1', () => r(httpSrv.address().port)));
  ok((await D.httpProbe(hp)) === 200 && (await D.portAnswers('http', hp)) === true && (await D.waitForListen('http', hp, { deadlineMs: 2000 })).ok === true, 'httpProbe / portAnswers(http) / waitForListen(http) see a listening HTTP port');
  const closedPort = await D.freePort();
  ok((await D.httpProbe(closedPort, { timeoutMs: 300 })) === null && (await D.portAnswers('http', closedPort, 300)) === false && (await D.portAnswers('rfb', closedPort, 300)) === false && (await D.portAnswers('http', 0)) === false, 'a closed port answers null/false on both kinds; port 0 is never asked');
  const wl = await D.waitForListen('http', closedPort, { deadlineMs: 400, stepMs: 50 });
  ok(wl.ok === false && /did not answer HTTP on 127\.0\.0\.1:\d+ within 400 ms/.test(wl.why), 'waitForListen(http) times out with a named reason', wl);
  const wk = await D.waitForListen('rdp', hp, { deadlineMs: 100 });
  ok(wk.ok === false && /unknown listen probe "rdp"/.test(wk.why), 'an unknown probe kind is a named failure, never a hang');
  await new Promise((r) => httpSrv.close(r));
  // (c) the www-dir fact: an operator override, the prefix beside the binary, the packaging spellings; nothing ⇒ null
  const fakePrefix = path.join(dir, 'xprefix'); fs.mkdirSync(path.join(fakePrefix, 'bin'), { recursive: true }); fs.mkdirSync(path.join(fakePrefix, 'share/xpra/www'), { recursive: true }); fs.writeFileSync(path.join(fakePrefix, 'share/xpra/www/index.html'), '<html>');
  ok(D.xpraWwwDir({ binPath: path.join(fakePrefix, 'bin/xpra'), env: {} }) === path.join(fakePrefix, 'share/xpra/www'), 'xpraWwwDir finds <prefix>/share/xpra/www beside the binary');
  const ovr = path.join(dir, 'ovr'); fs.mkdirSync(ovr); fs.writeFileSync(path.join(ovr, 'index.html'), '<html>');
  ok(D.xpraWwwDir({ binPath: path.join(fakePrefix, 'bin/xpra'), env: { XPRA_WWW_DIR: ovr } }) === ovr && D.xpraWwwDir({ binPath: path.join(fakePrefix, 'bin/xpra'), env: { XPRA_WWW_DIR: path.join(dir, 'nope') } }) === path.join(fakePrefix, 'share/xpra/www'), 'XPRA_WWW_DIR wins when it holds an index.html, is passed over when it does not');
  const realWww = D.xpraWwwDir({ binPath: D.binOnPath('xpra', { env: process.env }) || '/usr/bin/xpra', env: process.env });
  if (realWww) ok(fs.existsSync(path.join(realWww, 'index.html')) && fs.existsSync(path.join(realWww, 'js', 'Client.js')), `this box ships the html5 client at ${realWww}`);
  else skip('no xpra html5 client tree on this box — the hosted-client route answers 503 xpra-ui-unavailable here');
  // (d) the seamless-window filter over the tree xpra REALLY shows (captured 2026-09-21: a Corral wrapper around the app's top-level, 1x1 leaders, xpra's own helper windows)
  const tree = `xwininfo: Window id: 0x2cf (the root window) "Xpra"
     0x200006 "Xpra-CorralWindow-0xa00005": ()  360x616+0+0  +0+0
        0xa00005 "Calculator": ("gnome-calculator" "gnome-calculator")  360x616+0+0  +0+0
     0xa00003 "gnome-calculator": ("gnome-calculator" "gnome-calculator")  1x1+0+0  +0+0
     0x200004 "Xpra": ()  1x1+-1+-1  +-1+-1
     0x200003 (has no name): ()  1x1+-1+-1  +-1+-1
     0x800001 "xdg-desktop-portal-gtk": ("xdg-desktop-portal-gtk" "Xdg-desktop-portal-gtk")  10x10+10+10  +10+10
`;
  const rows = D.parseWininfoTree(tree);
  const app = D.seamlessWindows(rows);
  ok(rows.length === 6 && app.length === 2 && app[0].name === 'Calculator' && app[0].cls === 'gnome-calculator' && app[0].w === 360 && app[1].name === 'xdg-desktop-portal-gtk', 'seamlessWindows keeps the app\'s top-level(s) and drops the Corral wrapper, the 1x1 leaders and xpra\'s own windows', app);
  ok(D.seamlessWindows(null).length === 0 && D.seamlessWindows([{ name: 'Xpra', w: 400, h: 300, cls: 'x' }, { name: null, w: 400, h: 300, cls: null, instance: null }]).length === 0, 'null-safe; "Xpra" itself and a nameless class-less window are not app windows');
  // (e) ONE REAL BRING-UP through the recipe (SKIP with evidence without xpra/xauth): display on fd 3, the port answering HTTP, the cookie in OUR file, an app mapped, every process gone after
  const bins = { xpra: D.binOnPath('xpra', { env: process.env }), xauth: D.binOnPath('xauth', { env: process.env }) };
  const appBin = ['xmessage', 'xterm', 'xlogo'].map((n) => [n, D.binOnPath(n, { env: process.env })]).find(([, p]) => p);
  if (!bins.xpra) skip('xpra is not on PATH — the real xpra bring-up cannot run on this box (apt install xpra; the fleet image adds the package)');
  else if (!bins.xauth) skip('xauth is not on PATH — the recipe refuses by name without it');
  else if (!appBin) skip('none of xmessage/xterm/xlogo on PATH — no X application to map on the xpra display');
  else {
    const adir = path.join(dir, 'xpra-app'); fs.mkdirSync(path.join(adir), { recursive: true });
    const logFd = fs.openSync(path.join(adir, 'app.log'), 'a');
    const authFile = path.join(adir, 'Xauthority');
    const base = { PATH: process.env.PATH, HOME: process.env.HOME, WAYLAND_DISPLAY: 'wayland-0', XDG_SESSION_TYPE: 'wayland', VIBESPACE_DESKTOP_APP: 'da-display-xpra' };
    const parts = [];
    const homeAuth = path.join(process.env.HOME || '', '.Xauthority');
    const homeAuthBefore = fs.existsSync(homeAuth) ? fs.statSync(homeAuth).mtimeMs : null;
    const ctx = { bins, dir: adir, authFile, cookie: D.newCookie(), geometry: '1280x800', base, logFd, dpi: 144, freePort: () => D.freePort(), x11Env: (disp) => D.x11Env(base, { display: disp, authFile }), writeAuth: () => {}, onPart: (part, child, facts) => parts.push({ part, pid: child.pid, facts }), singleton: async () => null };
    let refused = null;
    try { await D.RECIPES['xpra-seamless']({ ...ctx, bins: { xpra: bins.xpra, xauth: null } }); } catch (e) { refused = e; }
    ok(refused && refused.code === 'exec-not-found' && /xauth/.test(refused.message), 'without xauth the recipe refuses BY NAME before anything spawns');
    const t0 = Date.now();
    let up = null, err = null;
    try { up = await D.RECIPES['xpra-seamless'](ctx); } catch (e) { err = e; }
    const tDisp = Date.now() - t0;
    ok(up && /^:\d+$/.test(up.display) && up.port > 0 && up.shared === false && up.wm === false && up.probe === 'http', `the recipe answers { display ${up && up.display}, port ${up && up.port}, wm:false, probe:'http' } — the display number arrived on fd 3 in ${tDisp} ms${err ? ' — ERROR ' + err.message : ''}`, up || err);
    const x = parts.find((p) => p.part === 'x');
    ok(parts.length === 1 && x && x.facts.alsoServer === true && x.facts.display === (up && up.display) && x.facts.port === (up && up.port), 'ONE part handed back: x, marked alsoServer (one pid owns the display AND the picture socket)', parts);
    const xpid = x && x.pid;
    try {
      const w = up ? await D.waitForListen('http', up.port, { deadlineMs: 15000 }) : { ok: false };
      const tHttp = Date.now() - t0;
      ok(w.ok === true && /^HTTP 200$/.test(w.banner), `the port answers HTTP 200 (the html5 client) ${tHttp} ms after spawn`, w);
      ok(D.listenerHeldBy(up.port, D.sessionCensus([xpid], { fresh: true })) === xpid, 'the 127.0.0.1 LISTEN inode is held by the xpra pid');
      const auth = fs.readFileSync(authFile);
      ok(auth.length > 0 && auth.includes(Buffer.from(String(up.display).replace(/^:/, ''))) , `xpra wrote its cookie into OUR Xauthority (${auth.length} bytes, an entry for ${up.display}) — the recipe created the file itself (this leg handed it NO file: xpra treats a missing XAUTHORITY path as none and writes ~/.Xauthority, measured)`);
      if (homeAuthBefore !== null) ok(fs.statSync(homeAuth).mtimeMs === homeAuthBefore, 'the user\'s real ~/.Xauthority was NOT touched (the pinned file existed before xpra looked)');
      const members = D.sessionMembers(xpid, { fresh: true });
      ok(members.length >= 2, `xpra's session holds its own Xvfb (${members.length} members: ${members.join(', ')})`);
      ok(!D.environHas(xpid, 'VIBESPACE_DESKTOP_APP=da-display-xpra'), 'MEASURED: xpra rewrites its own environ — the session marker is NOT readable on the xpra pid (the keeper\'s boot belt reaps its leftovers by pid+starttime instead)');
      // HiDPI (2.369.158): the recipe's ctx.dpi IS the display's font dpi (xpra writes Xft.dpi before any client) and
      // the keeper's X resources merge into THAT display's database (xterm's Xft face at a scale > 1)
      const XRDB = D.binOnPath('xrdb', { env: process.env });
      if (!XRDB) skip('xrdb not on PATH — the display\'s resource database cannot be read here (the keeper then logs that a bitmap-font terminal stays at 1x)');
      else {
        const xq = () => new Promise((r) => execFile(XRDB, ['-query'], { env: { ...ctx.x11Env(up.display) }, timeout: 5000 }, (e, out) => r(e ? '' : String(out))));
        // r2 (the verifier's race): xpra REPLACES the database ~1 s after its display is up — the keeper waits for it
        const w0 = await D.waitForXftDpi({ binPath: XRDB, env: ctx.x11Env(up.display) });
        ok(w0.ok === true && w0.dpi === 144 && w0.why === null, `waitForXftDpi resolves once xpra has written the display's font dpi (${w0.dpi} after ${w0.ms} ms of polling)`, w0);
        const wNo = await D.waitForXftDpi({ binPath: null, env: {} });
        const wDead = await D.waitForXftDpi({ binPath: XRDB, env: { ...ctx.x11Env(':98765') }, deadlineMs: 400, stepMs: 100 });
        ok(wNo.ok === false && wNo.why === 'xrdb not on PATH' && wDead.ok === false && /no Xft\.dpi in the display's resources within 400 ms/.test(wDead.why) && wDead.ms < 3000, `CONTROL: no xrdb, and a display that never answers, are REPORTED by name within the deadline — never thrown, never a hang (${wDead.why})`, { wNo, wDead });
        const q0 = await xq();
        ok(/^Xft\.dpi:\s+144$/m.test(q0), `xpra started with ctx.dpi 144 ⇒ the display's resource database says Xft.dpi 144 before any client (${(q0.match(/^Xft\.dpi:.*$/m) || ['none'])[0]})`);
        const merged = await D.applyXResources({ binPath: XRDB, env: ctx.x11Env(up.display), text: 'XTerm*faceName: Monospace\nXTerm*faceSize: 16\n' });
        const q1 = await xq();
        ok(merged.ok === true && /^XTerm\*faceName:\s+Monospace$/m.test(q1) && /^XTerm\*faceSize:\s+16$/m.test(q1) && /^Xft\.dpi:\s+144$/m.test(q1), 'applyXResources merges into THAT display (xterm\'s Xft face) and keeps xpra\'s Xft.dpi', merged);
        const none = await D.applyXResources({ binPath: null, env: {}, text: 'XTerm*faceSize: 16\n' });
        const empty = await D.applyXResources({ binPath: XRDB, env: {}, text: '' });
        ok(none.ok === false && none.why === 'xrdb not on PATH' && empty.ok === true, 'CONTROL: without xrdb the merge is REPORTED by name (never thrown — the app still starts); nothing to merge is a no-op');
      }
      // an app on that display, admitted by the same cookie file, shows up as the ONE seamless window
      const [appName, appPath] = appBin;
      const appArgs = appName === 'xmessage' ? ['-geometry', '300x100+10+10', 'vs xpra rung'] : appName === 'xterm' ? ['-geometry', '80x24', '-T', 'vs-xpra'] : [];
      const app = await D.startApp({ exec: appPath, args: appArgs, env: ctx.x11Env(up.display), logFd });
      let wins = null;
      for (let i = 0; i < 60 && !wins; i++) { await sleep(250); const e = await D.enumerateWindows({ display: up.display, authFile, env: base }); const s = e.ok ? D.seamlessWindows(e.windows) : []; if (s.length) wins = s; }
      ok(wins && wins.length === 1 && (wins[0].cls || wins[0].instance || wins[0].name) && !/^Xpra/.test(wins[0].name || ''), `the app is the ONE seamless window on the display (${wins && JSON.stringify(wins.map((w) => [w.name, w.cls, w.w + 'x' + w.h]))}) — no root, no wrapper rows`, wins);
      const rss = D.sessionSample([...members, app.pid]);
      console.log(`  (measured: displayfd ${tDisp} ms, HTTP ${tHttp} ms, session RSS ${rss ? (rss.rssBytes / 1048576).toFixed(0) : '?'} MB over ${rss ? rss.pids : 0} pids incl. ${appName})`);
      try { app.kill('SIGTERM'); } catch {}
    } finally {
      // the teardown a keeper would do: the leader's GROUP, then verify the whole session is gone
      if (xpid) { try { process.kill(-xpid, 'SIGTERM'); } catch {} try { process.kill(xpid, 'SIGTERM'); } catch {} }
      await sleep(1500);
      if (xpid) { for (const p of D.sessionCensus([xpid], { fresh: true })) { try { process.kill(p, 'SIGKILL'); } catch {} } }
      await sleep(300);
      ok(!xpid || D.sessionCensus([xpid], { fresh: true }).length === 0, 'after SIGTERM to the leader\'s group nothing of the xpra session is left (no orphan Xvfb)');
      try { fs.closeSync(logFd); } catch {}
    }
    // (f) THE SERVER'S LIFECYCLE IS THE KEEPER'S (round 2 of the P8-2 verify, 2026-09-22): any client that reaches the
    // xpra socket could END the session — a hello carrying `request: stop` / `exit`, or a `shutdown-server` packet
    // (reproduced: xpra dead within ~1 s, the record exited / failed). The recipe closes both on the SERVER: the socket
    // refuses the acting hello requests (XPRA_BIND_REFUSALS) and XPRA_CLIENT_CAN_SHUTDOWN=0 makes xpra ignore
    // `shutdown-server`. (`exit-server` has no server-side switch in 6.5.3 — the bridge drops it: test-desktop-apps §8
    // + test-desktop-app-keeper §14.) Driven DIRECT to the port, the bridge out of the way; CONTROL = a patched copy of
    // this module with the pre-fix argv/env (sibling file, swept by pid) — the same packets end its session.
    const www = realWww && fs.existsSync(path.join(realWww, 'js/lib/rencode.js')) ? realWww : null;
    if (!www) skip('no rencode.js in the installed html5 client — the lifecycle legs speak rencodeplus');
    else {
      (await import('node:vm')).runInThisContext(fs.readFileSync(path.join(www, 'js/lib/rencode.js'), 'utf8'), { filename: 'rencode.js' });
      const P = await import('../src/lib/xpra-proto.js');
      const WebSocket = require('ws');
      const frame = (pk) => { const body = Buffer.from(globalThis.rencode(pk)); const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 16; h.writeUInt32BE(body.length, 4); return Buffer.concat([h, body]); };
      const helloOf = (extra = {}) => ['hello', { ...P.helloCaps({ width: 320, height: 200, dpi: 96, uuid: 'vs-dd-life', layout: 'us' }), lz4: false, brotli: false, compression_level: 0, ...extra }];
      /** one fresh xpra session through `mod`'s recipe; `talk(port)` sends; answers whether xpra outlived it */
      const session = async (mod, tag, talk) => {
        const sdir = path.join(dir, `xpra-life-${tag}`); fs.mkdirSync(sdir, { recursive: true });
        const sAuth = path.join(sdir, 'Xauthority'); const sLog = fs.openSync(path.join(sdir, 'app.log'), 'a');
        const sparts = [];
        const sctx = { ...ctx, dir: sdir, authFile: sAuth, logFd: sLog, cookie: D.newCookie(), x11Env: (disp) => D.x11Env(base, { display: disp, authFile: sAuth }), onPart: (part, child) => sparts.push(child.pid) };
        let pid = null;
        try {
          const u = await mod.RECIPES['xpra-seamless'](sctx);
          pid = sparts[0];
          const w = await D.waitForListen('http', u.port, { deadlineMs: 15000 });
          if (!w.ok) return { error: w.why };
          const ws = new WebSocket(`ws://127.0.0.1:${u.port}/`, ['binary']);
          const back = []; ws.on('message', (m) => back.push(Buffer.from(m)));
          await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
          await talk((pk) => ws.send(frame(pk)), back);
          let t = Date.now() + 3000; while (Date.now() < t && D.pidAlive(pid)) await sleep(100);
          const words = back.map((b) => (b[0] === 0x50 ? b.subarray(8) : b).toString('latin1').replace(/[^\x20-\x7e]+/g, ' ').trim().slice(0, 160));
          try { ws.close(); } catch {}
          return { alive: D.pidAlive(pid), words };
        } finally {
          if (pid) { try { process.kill(-pid, 'SIGKILL'); } catch {} try { process.kill(pid, 'SIGKILL'); } catch {} await sleep(300); for (const q of D.sessionCensus([pid], { fresh: true })) { try { process.kill(q, 'SIGKILL'); } catch {} } }
          try { fs.closeSync(sLog); } catch {}
        }
      };
      const stopReq = (send) => { send(helloOf({ request: 'stop' })); return sleep(200); };
      const exitReq = (send) => { send(helloOf({ request: 'exit' })); return sleep(200); };
      const shutdown = async (send, back) => { send(helloOf()); let t = Date.now() + 8000; while (Date.now() < t && !back.length) await sleep(50); await sleep(300); send(['shutdown-server']); await sleep(200); };
      const a = await session(D, 'stop', stopReq);
      ok(a.alive === true && a.words.some((w) => /'stop' requests are not enabled/.test(w)), `a hello carrying request:'stop' is REFUSED by the socket and xpra lives (${JSON.stringify(a.words[0] || a.error)})`, a);
      const b2 = await session(D, 'exit', exitReq);
      ok(b2.alive === true && b2.words.some((w) => /'exit' requests are not enabled/.test(w)), `a hello carrying request:'exit' is REFUSED by the socket and xpra lives (${JSON.stringify(b2.words[0] || b2.error)})`, b2);
      const c = await session(D, 'shut', shutdown);
      ok(c.alive === true, `a negotiated client's shutdown-server is IGNORED by xpra (XPRA_CLIENT_CAN_SHUTDOWN=0) — xpra lives (${c.words.length} answers)`, c);
      // CONTROL: the pre-fix argv/env on the same three
      const srcD = fs.readFileSync(path.join(repo, 'src/desktop-display.js'), 'utf8');
      const R1 = ["`--bind-tcp=127.0.0.1:${port},${XPRA_BIND_REFUSALS}`", '`--bind-tcp=127.0.0.1:${port}`'];
      const R2 = ["{ env: { ...(env || process.env), XPRA_CLIENT_CAN_SHUTDOWN: '0' }, logFd, extraStdio: 'pipe', name: 'xpra' }", "{ env, logFd, extraStdio: 'pipe', name: 'xpra' }"];
      ok(srcD.split(R1[0]).length === 2 && srcD.split(R2[0]).length === 2, 'the bind refusals and the shutdown switch are each spelled once (the control patches exactly them)');
      for (const f of fs.readdirSync(path.join(repo, 'src'))) { const mm = /^vs-dd-mut-(\d+)-/.exec(f); if (mm && !D.pidAlive(Number(mm[1]))) { try { fs.unlinkSync(path.join(repo, 'src', f)); } catch {} } }
      const mfile = path.join(repo, 'src', `vs-dd-mut-${process.pid}-life.js`);
      fs.writeFileSync(mfile, srcD.replace(R1[0], R1[1]).replace(R2[0], R2[1]));
      try {
        const Dm = require(mfile);
        const ca = await session(Dm, 'c-stop', stopReq), cb = await session(Dm, 'c-exit', exitReq), cc = await session(Dm, 'c-shut', shutdown);
        ok(ca.alive === false && cb.alive === false && cc.alive === false, `CONTROL: the pre-fix recipe's xpra is ENDED by each of the three (stop ${ca.alive}, exit ${cb.alive}, shutdown-server ${cc.alive} alive) — the reproduced session kill`, { ca, cb, cc });
      } finally { try { fs.unlinkSync(mfile); } catch {} }
    }
  }
}

console.log('§6 P8-2 x4 — the display\'s size, the fit act, depth in the tree, and Xvnc FOLLOWING a client\'s SetDesktopSize (measured)');
{
  // depth from indentation, over a captured `xwininfo -root -tree` (this box, xterm on a bare Xvnc)
  const sample = '\n\nxwininfo: Window id: 0x3ab (the root window) (has no name)\n\n  Root window id: 0x3ab (the root window) (has no name)\n  Parent window id: 0x0 (none)\n     1 child:\n     0x20000c "xterm": ("xterm" "XTerm")  484x316+0+0  +0+0\n        1 child:\n        0x200011 (has no name): ()  484x316+0+0  +1+1\n           1 child:\n           0x200012 "deep": ("a" "B")  10x10+0+0  +2+2\n';
  const rows = D.parseWininfoTree(sample);
  ok(rows.length === 3 && rows[0].depth === 1 && rows[0].cls === 'XTerm' && rows[1].depth === 2 && rows[1].name === null && rows[2].depth === 3 && rows[2].cls === 'B', `depth = 1 for root\'s direct child, 2 for its child, 3 below (${rows.map((r) => r.depth).join(',')}) — the fit plan may move top-levels only`);
  ok(rows[0].x === 0 && rows[1].x === 1 && rows[1].y === 1 && rows[2].w === 10, 'the pre-x4 fields (id/name/instance/cls/x/y/w/h) are unchanged beside depth');
  // THE NAME IS PRINTED UNESCAPED OR NOT AT ALL (measured, xwininfo 1.1.6 on this box, 2026-09-22): a UTF-8 _NET_WM_NAME with
  // quotes verbatim, a COMPOUND_TEXT WM_NAME (xterm with a non-Latin-1 title) as `(name in unsupported encoding …)`, a
  // UTF-8 name under a non-UTF-8 locale as `" (failure in conversion …)"` — the pre-fix regex (kept here as the CONTROL)
  // DROPPED the first two rows, so the app's window vanished from the fit plan and from windows(id)
  const odd = [
    '     0x40000c "计算器 "x" \\ é": ("xterm" "XTerm")  484x316+0+0  +0+0',
    '     0x20000c (name in unsupported encoding COMPOUND_TEXT): ("xterm" "XTerm")  484x316+3+4  +5+6',
    '     0x40000d " (failure in conversion from UTF8_STRING to ANSI_X3.4-1968)": ("xterm" "XTerm")  484x316+0+0  +0+0',
    '        0x40000e "a: ("b" "c")": ("i" "C")  20x10+0+0  +1+1',
  ];
  const oddRows = D.parseWininfoTree(odd.join('\n'));
  ok(oddRows.length === 4 && oddRows[0].name === '计算器 "x" \\ é' && oddRows[0].cls === 'XTerm' && oddRows[1].name === null && oddRows[1].cls === 'XTerm' && oddRows[1].x === 5 && oddRows[1].y === 6 && oddRows[2].name === null && oddRows[3].name === 'a: ("b" "c")' && oddRows[3].cls === 'C' && oddRows[3].depth === 2, 'parseWininfoTree reads every measured name shape FROM THE RIGHT: an unescaped quoted UTF-8 name verbatim, an unsupported encoding / a failed conversion as name null (the row KEPT), a name containing `: ("b" "c")`', oddRows);
  const OLD_TREE_RE = /^(\s*)(0x[0-9a-fA-F]+)\s+(?:"((?:[^"\\]|\\.)*)"|\(has no name\))(?::\s*\((?:"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)")?\))?\s+(\d+)x(\d+)\+(-?\d+)\+(-?\d+)\s+\+(-?\d+)\+(-?\d+)/;
  ok(!OLD_TREE_RE.test(odd[0]) && !OLD_TREE_RE.test(odd[1]), 'CONTROL: the pre-fix regex drops the quoted-UTF-8 and the COMPOUND_TEXT rows (the app window was invisible to the fit)');
  const argv = D.X_SERVER_ARGS.Xvnc({ authFile: '/a', geometry: '1280x800', depth: 24, rfbPort: 5 });
  ok(argv.includes('-AcceptSetDesktopSize') && argv.indexOf('-AcceptSetDesktopSize') < argv.indexOf('-rfbport') && !argv.some((a) => /AcceptSetDesktopSize=0/.test(a)), 'the Xvnc row SPELLS -AcceptSetDesktopSize (the measured lever; the default is on, the invariant lives in the argv)');
  ok(D.X_SERVER_ARGS.Xvfb({ authFile: '/a', geometry: '1280x800', depth: 24 }).every((a) => !/AcceptSetDesktopSize/.test(a)), 'CONTROL: Xvfb knows no such flag and its row does not carry it');
  // the keeper hands the probed `bins` in (a memoised YES is a probe answer; the refusal is judged on what the caller knows)
  const noBins = await D.displaySize({ display: ':999', authFile: '/nonexistent', env: { PATH: '/nonexistent' }, bins: { xdpyinfo: null } });
  ok(noBins.ok === false && /xdpyinfo not on PATH/.test(noBins.why), 'displaySize without xdpyinfo refuses BY NAME, never throws');
  const noPlan = await D.applyWindowPlan({ display: ':999', authFile: '/nonexistent', env: { PATH: '/nonexistent' }, bins: { xdotool: null }, plan: { main: { id: 1 }, resize: { id: 1, w: 1, h: 1 }, moves: [] } });
  ok(noPlan.ok === false && /xdotool not on PATH/.test(noPlan.why), 'applyWindowPlan without xdotool refuses BY NAME, never throws');
  const deadDisplay = await D.displaySize({ display: ':999', authFile: '/nonexistent', env: { PATH: process.env.PATH }, bins: facts.bins });
  // MACHINE-DEPENDENT LEG, judged on the evidence (2.369.156 r3 — the Actions runner has no xdpyinfo, so the
  // probe refuses BY NAME before it can fail; both are the named failure the leg is about, never a throw or a size)
  const deadWhy = facts.bins.xdpyinfo ? /^xdpyinfo failed/ : /^xdpyinfo not on PATH/;
  ok(deadDisplay.ok === false && deadWhy.test(String(deadDisplay.why)) && !(deadDisplay.w > 0),
    `a display that does not answer is a named failure (never a throw, never a size) — ${facts.bins.xdpyinfo ? 'xdpyinfo present: the probe failed' : 'xdpyinfo absent on this box: refused by name'}`);
  ok((await D.applyWindowPlan({ display: ':1', authFile: '/x', bins: { xdotool: '/bin/true' }, plan: { main: { id: 1 }, resize: null, moves: [] } })).acts === 0, 'a settled plan spawns nothing (acts 0)');
  let threw = null; try { await D.displaySize({ hostId: 'h2', display: ':1' }); } catch (e) { threw = e; }
  ok(threw && threw.code === 'unsupported-host', 'a non-local host is refused by name (v1 is local-only)');
  // THE FLEET SHAPE (2026-09-22): a REPARENTING WM. Captured verbatim on this box: the fleet image's own xfwm4 4.18
  // (run from the image against a scratch Xvfb 1280x800) managing `xterm -T xv-wm-title` — every client sits one level
  // down in an UNNAMED depth-1 frame, and xfwm4 keeps CLASSED helpers of its own at depth 1 (a MAPPED 5x5 "Xfwm4" at
  // -1000,-1000). `xdotool search --onlyvisible` of the same moment gives the viewable set.
  const XFWM4_TREE = [
    "",
    "xwininfo: Window id: 0x2cf (the root window) (has no name)",
    "",
    "  Root window id: 0x2cf (the root window) (has no name)",
    "  Parent window id: 0x0 (none)",
    "     10 children:",
    "     0x201cc5 (has no name): ()  494x350+393+225  +393+225",
    "        16 children:",
    "        0x80000c \"xv-wm-title\": (\"xterm\" \"XTerm\")  484x316+5+29  +398+254",
    "           1 child:",
    "           0x800018 (has no name): ()  484x316+0+0  +398+254",
    "        0x201cd4 (has no name): ()  21x29+468+0  +861+225",
    "        0x201cd3 (has no name): ()  21x29+445+0  +838+225",
    "        0x201cd2 (has no name): ()  21x29+422+0  +815+225",
    "        0x201cd1 (has no name): ()  21x29+399+0  +792+225",
    "        0x201cd0 (has no name): ()  1x1+0+0  +393+225",
    "        0x201ccf (has no name): ()  22x29+5+0  +398+225",
    "        0x201cce (has no name): ()  478x5+8+0  +401+225",
    "        0x201ccd (has no name): ()  478x29+8+0  +401+225",
    "        0x201ccc (has no name): ()  8x29+486+0  +879+225",
    "        0x201ccb (has no name): ()  8x29+0+0  +393+225",
    "        0x201cca (has no name): ()  16x16+478+334  +871+559",
    "        0x201cc9 (has no name): ()  16x16+0+334  +393+559",
    "        0x201cc8 (has no name): ()  462x5+16+345  +409+570",
    "        0x201cc7 (has no name): ()  5x305+489+29  +882+254",
    "        0x201cc6 (has no name): ()  5x305+0+29  +393+254",
    "     0x201a3f (has no name): ()  494x350+0+0  +0+0",
    "     0x200122 \"Xfwm4\": (\"xfwm4\" \"Xfwm4\")  5x5+-1000+-1000  +-1000+-1000",
    "        1 child:",
    "        0x200123 (has no name): ()  1x1+-1+-1  +-1001+-1001",
    "     0x200120 (has no name): ()  10x10+-100+-100  +-100+-100",
    "     0x400001 (has no name): ()  10x10+-20+-20  +-20+-20",
    "     0x200001 \"xfwm4\": (\"xfwm4\" \"Xfwm4\")  10x10+10+10  +10+10",
    "     0x200126 (has no name): ()  1x800+-1+0  +-1+0",
    "     0x200127 (has no name): ()  1x800+1280+0  +1280+0",
    "     0x200128 (has no name): ()  1280x1+0+-1  +0+-1",
    "     0x200129 (has no name): ()  1280x1+0+800  +0+800",
    "",
    "",
  ].join('\n');
  const XFWM4_VISIBLE = new Set([719, 2097449, 2097448, 2097447, 2097446, 2097442, 2104517, 2097443, 2104518, 2104519, 2104520, 2104521, 2104522, 2104523, 2104524, 2104525, 2104526, 2104527, 2104529, 2104530, 2104531, 2104532, 8388620, 8388632]);
  const wmRows = D.parseWininfoTree(XFWM4_TREE).map((r) => ({ ...r, mapped: XFWM4_VISIBLE.has(r.id) }));
  const wmFrame = wmRows.find((r) => r.id === 0x201cc5), wmClient = wmRows.find((r) => r.id === 0x80000c), wmHelper = wmRows.find((r) => r.id === 0x200122);
  ok(wmFrame && wmFrame.depth === 1 && !wmFrame.cls && !wmFrame.name && wmClient && wmClient.depth === 2 && wmClient.cls === 'XTerm' && wmClient.name === 'xv-wm-title' && wmHelper && wmHelper.depth === 1 && wmHelper.cls === 'Xfwm4' && wmHelper.mapped, 'the captured xfwm4 tree parses: the frame is depth 1 and nameless, the xterm CLIENT depth 2 inside it, the WM\'s own 5x5 "Xfwm4" helper a MAPPED classed depth-1 row');
  const oldMain = wmRows.filter((w) => w.depth === 1 && w.mapped !== false && w.w > 1 && w.h > 1).filter((w) => w.cls || w.instance || w.name).sort((a, b) => (b.w * b.h - a.w * a.h) || (a.id - b.id))[0];
  ok(oldMain && oldMain.id === 0x200122, 'CONTROL: the pre-fix rule (the largest classed depth-1 row) picks xfwm4\'s own 5x5 helper at -1000,-1000 as the app — and would have resized IT over the framebuffer');
  const M = require('../src/desktop-apps.js');
  const wmPlan = M.appFitPlan(wmRows, { w: 1280, h: 800 });
  ok(wmPlan.main.id === 0x80000c && wmPlan.main.frame && wmPlan.main.frame.id === 0x201cc5 && wmPlan.main.name === 'xv-wm-title' && M.windowTitleOf(wmPlan.main.name) === 'xv-wm-title', 'the plan\'s main is the xterm CLIENT (its own name is the title), carrying its frame — never the frame, never the WM\'s helper');
  ok(same(wmPlan.resize, { id: 0x80000c, w: 1270, h: 766, framed: true }) && wmPlan.moves.length === 0, 'framed: the act names the CLIENT and the client size that makes the 494x350 frame (5 px sides, 29+5 px title/bottom) exactly 1280x800; the WM\'s helpers and the empty frames are never moved', wmPlan.resize);
  const maxRows = wmRows.map((r) => (r.id === 0x201cc5 ? { ...r, x: 0, y: 0, w: 1280, h: 800 } : r.id === 0x80000c ? { ...r, x: 0, y: 24, w: 1280, h: 776 } : r));
  ok(M.appFitPlan(maxRows, { w: 1280, h: 800 }, { applied: { wid: 0x80000c } }).settled, 'MEASURED after `wmctrl -i -r <client> -b add,maximized_*` on that xfwm4: frame 1280x800+0+0, client 1280x776+0+24 under the title ⇒ SETTLED (the frame is the picture)');
  // the act: framed + wmctrl ⇒ ONE wmctrl on the CLIENT; framed without wmctrl ⇒ xdotool on the CLIENT with the frame-sized target; bare ⇒ as before
  const recDir = fs.mkdtempSync(path.join(dir, 'act-'));
  const recLog = path.join(recDir, 'argv.log');
  const recBin = (name) => { const f = path.join(recDir, name); fs.writeFileSync(f, `#!/bin/sh\necho "${name} $*" >> '${recLog}'\n`, { mode: 0o755 }); return f; };
  const fakeBins = { xdotool: recBin('xdotool'), wmctrl: recBin('wmctrl') };
  const readActs = () => { try { const t = fs.readFileSync(recLog, 'utf8').trim().split('\n'); fs.unlinkSync(recLog); return t; } catch { return []; } };
  const a1 = await D.applyWindowPlan({ display: ':1', authFile: '/x', env: { PATH: '/usr/bin:/bin' }, bins: fakeBins, plan: wmPlan });
  ok(a1.ok && a1.via === 'wm' && same(readActs(), [`wmctrl -i -r ${0x80000c} -b add,maximized_vert,maximized_horz`]), 'a framed main with wmctrl ⇒ ONE `wmctrl -i -r <CLIENT id>` maximise, no xdotool resize (the measured act)');
  const a2 = await D.applyWindowPlan({ display: ':1', authFile: '/x', env: { PATH: '/usr/bin:/bin' }, bins: { xdotool: fakeBins.xdotool, wmctrl: null }, plan: wmPlan });
  ok(a2.ok && a2.via === 'xdotool' && same(readActs(), [`xdotool windowmove --sync ${0x80000c} 0 0 windowsize --sync ${0x80000c} 1270 766`]), 'without wmctrl ⇒ xdotool on the CLIENT: moved to 0,0 (the frame lands there, measured) and resized so the frame is the framebuffer');
  const a3 = await D.applyWindowPlan({ display: ':1', authFile: '/x', env: { PATH: '/usr/bin:/bin' }, bins: fakeBins, plan: M.appFitPlan([{ id: 5, depth: 1, mapped: true, w: 484, h: 316, x: 3, y: 4, cls: 'XTerm' }], { w: 1280, h: 800 }) });
  ok(a3.ok && a3.via === 'xdotool' && same(readActs(), ['xdotool windowmove --sync 5 0 0 windowsize --sync 5 1280 800']), 'bare X (no frame) ⇒ xdotool as before, and never wmctrl (nobody manages the window)');
  fs.rmSync(recDir, { recursive: true, force: true });
  const appBin = ['xterm', 'xmessage', 'xlogo'].map((n) => [n, D.binOnPath(n, { env: process.env })]).find(([, p]) => p);
  const base = { PATH: process.env.PATH, HOME: process.env.HOME, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || 'wayland-0' };
  if (!facts.bins.Xvfb || !facts.bins.xdpyinfo || !facts.bins.xdotool || !facts.bins.xwininfo || !appBin) skip(`the real fit act needs Xvfb (${!!facts.bins.Xvfb}) + xdpyinfo (${!!facts.bins.xdpyinfo}) + xdotool (${!!facts.bins.xdotool}) + xwininfo (${!!facts.bins.xwininfo}) + an X app (${appBin ? appBin[0] : 'none'})`);
  else {
    const cookie = D.newCookie(); const auth = path.join(dir, 'Xauthority-fit'); D.writeXauthority(auth, [{ display: '0', cookieHex: cookie }]);
    const x = await D.startXServer({ bin: 'Xvfb', binPath: facts.bins.Xvfb, authFile: auth, geometry: '1024x700', env: D.x11Env(base, { display: ':0', authFile: auth }) });
    let app = null;
    try {
      D.writeXauthority(auth, [{ display: '0', cookieHex: cookie }, { display: x.display, cookieHex: cookie }]);
      const env = D.x11Env(base, { display: x.display, authFile: auth });
      const size = await D.displaySize({ display: x.display, authFile: auth, env, bins: facts.bins });
      ok(size.ok && size.w === 1024 && size.h === 700, `displaySize reads the framebuffer the X server states (${size.w}x${size.h})`);
      const [name, bin] = appBin;
      app = spawn(bin, name === 'xterm' ? ['-geometry', '60x20', '-T', 'vs-fit'] : name === 'xmessage' ? ['-geometry', '300x120+30+40', 'fit me'] : [], { env, stdio: 'ignore', detached: true }); app.unref();
      let en = null; for (let i = 0; i < 40 && !(en && en.windows.some((w) => w.depth === 1 && w.mapped !== false && w.w > 1)); i++) { await sleep(150); en = await D.enumerateWindows({ display: x.display, authFile: auth, env, bins: facts.bins }); }
      const M = require('../src/desktop-apps.js');
      const plan = M.appFitPlan(en.windows, { w: size.w, h: size.h });
      ok(!!plan.main && !!plan.resize && plan.resize.w === 1024, `the plan names ${name}\'s top-level (${plan.main && `${plan.main.w}x${plan.main.h}+${plan.main.x}+${plan.main.y}`}) and asks for 1024x700+0+0`);
      const act = await D.applyWindowPlan({ display: x.display, authFile: auth, env, bins: facts.bins, plan });
      const after = (await D.enumerateWindows({ display: x.display, authFile: auth, env, bins: facts.bins })).windows.find((w) => w.id === plan.main.id);
      ok(act.ok && act.acts === 1 && after && after.w === 1024 && after.h === 700 && after.x === 0 && after.y === 0, `ONE xdotool act (${act.ms} ms) put the bare-X window at 1024x700+0+0 — no WM needed (got ${after && `${after.w}x${after.h}+${after.x}+${after.y}`})`);
      const again = M.appFitPlan((await D.enumerateWindows({ display: x.display, authFile: auth, env, bins: facts.bins })).windows, { w: size.w, h: size.h }, { applied: { wid: plan.main.id } });
      ok(again.settled, 're-planned after the act: SETTLED (the belt would touch nothing)');
      // THE TITLE ON THE REAL DISPLAY: the caller's env has NO locale (C) — enumerateWindows asks xwininfo for UTF-8 itself
      const XPROP = D.binOnPath('xprop', { env: process.env });
      if (!XPROP) skip('xprop is not on PATH — the real title-encoding leg cannot set a window name');
      else {
        const wid = String(plan.main.id);
        const u8env = { ...env, LC_ALL: 'C.UTF-8' };
        const U8 = '计算器 "x" \\ é';
        await run(XPROP, ['-id', wid, '-f', '_NET_WM_NAME', '8u', '-set', '_NET_WM_NAME', U8], u8env);
        const rowU8 = (await D.enumerateWindows({ display: x.display, authFile: auth, env, bins: facts.bins })).windows.find((w) => w.id === plan.main.id);
        ok(!!rowU8 && rowU8.name === U8, `a UTF-8 _NET_WM_NAME reads back VERBATIM through enumerateWindows under a caller with no locale (${JSON.stringify(rowU8 && rowU8.name)})`, rowU8);
        const rawC = await run(facts.bins.xwininfo, ['-root', '-tree'], env);
        ok(/failure in conversion from UTF8_STRING/.test(rawC.stdout), 'CONTROL: the same xwininfo under the caller\'s own (C) locale prints "failure in conversion" — LC_ALL=C.UTF-8 is the lever');
        await run(XPROP, ['-id', wid, '-remove', '_NET_WM_NAME'], u8env);
        await run(XPROP, ['-id', wid, '-f', 'WM_NAME', '8t', '-set', 'WM_NAME', '中文 t'], u8env);
        const rawCt = await run(facts.bins.xwininfo, ['-root', '-tree'], u8env);
        const enCt = await D.enumerateWindows({ display: x.display, authFile: auth, env, bins: facts.bins });
        const rowCt = enCt.windows.find((w) => w.id === plan.main.id);
        ok(/name in unsupported encoding COMPOUND_TEXT/.test(rawCt.stdout) && !!rowCt && rowCt.name === null && rowCt.depth === 1 && rowCt.w === 1024, `a COMPOUND_TEXT WM_NAME (xterm's own encoding for a non-Latin-1 title) is "unsupported" to xwininfo — the window is STILL a row (name null, ${rowCt && `${rowCt.w}x${rowCt.h}`})`, rowCt);
        ok(M.appFitPlan(enCt.windows, { w: size.w, h: size.h }, { applied: { wid: plan.main.id } }).main?.id === plan.main.id && M.windowTitleOf(rowCt && rowCt.name) === null, '…so the fit still names it as the main, and its title is null (the window keeps the label)');
      }
    } finally { try { app?.kill('SIGKILL'); } catch {} try { process.kill(-x.pid, 'SIGKILL'); } catch {} try { x.child.kill('SIGKILL'); } catch {} }
  }
  // THE MEASUREMENT AS A GATE: Xvnc with the keeper's exact argv follows a client's SetDesktopSize; the =0 control refuses it
  if (!facts.bins.Xvnc || !facts.bins.xdpyinfo) skip(`the SetDesktopSize follow needs Xvnc (${!!facts.bins.Xvnc}) + xdpyinfo (${!!facts.bins.xdpyinfo})`);
  else {
    const setDesktopSize = (port, w, h) => new Promise((resolve) => {
      const s = net.connect({ port, host: '127.0.0.1' }); let buf = Buffer.alloc(0), stage = 0; const t0 = Date.now(); let ask = 0;
      const done = (v) => { try { s.destroy(); } catch {} resolve(v); }; const tm = setTimeout(() => done({ timeout: true }), 4000);
      s.on('error', (e) => { clearTimeout(tm); done({ error: e.message }); });
      s.on('data', (d) => { buf = Buffer.concat([buf, d]); for (;;) {
        if (stage === 0) { if (buf.length < 12) return; s.write('RFB 003.008\n'); buf = buf.slice(12); stage = 1; }
        else if (stage === 1) { if (buf.length < 1) return; const n = buf[0]; if (buf.length < 1 + n) return; buf = buf.slice(1 + n); s.write(Buffer.from([1])); stage = 2; }
        else if (stage === 2) { if (buf.length < 4) return; buf = buf.slice(4); s.write(Buffer.from([1])); stage = 3; }
        else if (stage === 3) { if (buf.length < 24) return; const nl = buf.readUInt32BE(20); if (buf.length < 24 + nl) return; buf = buf.slice(24 + nl);
          const enc = [0, -308, -223]; const se = Buffer.alloc(4 + 4 * enc.length); se[0] = 2; se.writeUInt16BE(enc.length, 2); enc.forEach((e, i) => se.writeInt32BE(e, 4 + 4 * i)); s.write(se);
          const fbur = Buffer.alloc(10); fbur[0] = 3; fbur[1] = 1; fbur.writeUInt16BE(w, 6); fbur.writeUInt16BE(h, 8); s.write(fbur);
          const sd = Buffer.alloc(24); sd[0] = 251; sd.writeUInt16BE(w, 2); sd.writeUInt16BE(h, 4); sd[6] = 1; sd.writeUInt16BE(w, 16); sd.writeUInt16BE(h, 18); ask = Date.now(); s.write(sd); stage = 4; }
        else if (stage === 4) { if (buf.length < 16) return; if (buf[0] !== 0) { clearTimeout(tm); return done({ msg: buf[0] }); } const x = buf.readUInt16BE(4), y = buf.readUInt16BE(6), rw = buf.readUInt16BE(8), rh = buf.readUInt16BE(10), et = buf.readInt32BE(12); clearTimeout(tm); return done({ enc: et, reason: x, status: y, w: rw, h: rh, ms: Date.now() - ask, total: Date.now() - t0 }); } } });
    });
    const dims = async (env) => { const r = await run(facts.bins.xdpyinfo, [], env); const m = /dimensions:\s+(\d+)x(\d+)/.exec(r.stdout); return m ? `${m[1]}x${m[2]}` : 'n/a'; };
    const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
    for (const control of [false, true]) {
      const cookie = D.newCookie(); const auth = path.join(dir, `Xauthority-vnc-${control ? 'ctl' : 'real'}`); D.writeXauthority(auth, [{ display: '0', cookieHex: cookie }]);
      const port = await freePort();
      const args = D.X_SERVER_ARGS.Xvnc({ authFile: auth, geometry: '1280x800', depth: 24, rfbPort: port }).concat(control ? ['-AcceptSetDesktopSize=0'] : []);
      const env0 = D.x11Env(base, { display: ':0', authFile: auth });
      const { child, spawned } = D.spawnDetached(facts.bins.Xvnc, args, { env: env0, extraStdio: 'pipe', name: 'Xvnc' });
      await spawned;
      const display = await new Promise((r) => { let b = ''; child.stdio[3].on('data', (d) => { b += d; const m = /^\s*(\d+)\s*\n/.exec(b); if (m) r(`:${m[1]}`); }); setTimeout(() => r(null), 8000); });
      try {
        ok(!!display, `Xvnc (${control ? 'CONTROL: -AcceptSetDesktopSize=0 appended' : 'the keeper\'s exact argv'}) reported ${display}`);
        D.writeXauthority(auth, [{ display: '0', cookieHex: cookie }, { display, cookieHex: cookie }]);
        const env = D.x11Env(base, { display, authFile: auth });
        const before = await dims(env);
        const r = await setDesktopSize(port, 900, 600);
        await sleep(150);
        const after = await dims(env);
        if (!control) ok(before === '1280x800' && r.enc === -308 && r.status === 0 && r.w === 900 && r.h === 600 && after === '900x600' && r.ms < 2000, `SetDesktopSize 900x600 ⇒ an ExtendedDesktopSize rect (status 0) in ${r.ms} ms and xdpyinfo reads 900x600 (was ${before}) — the framebuffer FOLLOWS the client`, r);
        else ok(before === '1280x800' && after === '1280x800' && (r.status === 1 || r.timeout || r.status === undefined), `CONTROL: with -AcceptSetDesktopSize=0 the framebuffer stays 1280x800 (reply ${JSON.stringify({ status: r.status, timeout: r.timeout })}) — that flag is the lever, nothing else in the argv`);
      } finally { try { process.kill(-child.pid, 'SIGKILL'); } catch {} try { child.kill('SIGKILL'); } catch {} await sleep(200); }
    }
  }
}

console.log(`${fail ? `\n${fail} FAILED (${pass} passed` : `\nALL PASS (${pass}`}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
