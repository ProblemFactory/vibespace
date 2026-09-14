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
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);

let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const skip = (why) => { skipped++; console.log(`  ⚠ SKIP: ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const v6 = net.createServer(); await new Promise((r) => v6.listen(0, '::1', r));
  const p6 = v6.address().port;
  ok(D.listenerInode(p6) === null && D.listenerHeldBy(p6, [process.pid]) === null, 'an [::1]-only listener is NOT a 127.0.0.1 listener (the measured x11vnc race shape: same number, wrong family)');
  v6.close();
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
  let notWired = null;
  try { await D.RECIPES['xpra-seamless']({}); } catch (e) { notWired = e; }
  ok(notWired && notWired.code === 'backend-not-wired', 'the xpra recipe exists and refuses BY NAME until P8-2');
}

console.log(`${fail ? `\n${fail} FAILED (${pass} passed` : `\nALL PASS (${pass}`}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
