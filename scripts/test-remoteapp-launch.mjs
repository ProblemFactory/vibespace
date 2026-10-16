#!/usr/bin/env node
// A REMOTEAPP SESSION ON A REAL XPRA DISPLAY (design q-024 r1 §1.2, lane remoteapp-r1a, 2026-10-16) — heavy: the REAL hub
// keeper brings up a REAL private xpra (the `xpra-seamless` recipe of the `remoteapp` row) and starts the FAKE xfreerdp
// (scripts/fixtures/remoteapp/xfreerdp) on it as the app; the paired Windows machine is a stand-in whose agent's tcpForward
// reaches a loopback server playing its 3389. The real-machine leg (a paired Windows machine, a real RemoteApp) is NOT this suite's.
//   §1 launch through desktop-access.launchRemoteApp: ready on the xpra rung (ONE xpra pid = X + picture server, the fake
//      its own pid), the fake read ONE stdin line = the password, its own XDG_CONFIG_HOME, DISPLAY = the record's display,
//      and reached the "machine" through the forward
//   §2 the fake's RAIL stand-in window (xmessage, instance `xfreerdp`) is an X top-level ON THE RECORD'S OWN DISPLAY:
//      windows() lists exactly it (xpra's wrappers filtered) — every per-window mechanism applies; `--shots <dir>` maps it
//      and saves the display as remoteapp-xpra-display.png
//   §3 the password in no process of the session (cmdline + environ of every member: xpra, its Xvfb, the fake, xmessage)
//   §4 stop: every recorded pid gone, the window gone with xpra, the forward closed
//   §5 the machine's side drops mid-session ⇒ the client exits on its own ⇒ the record ends (rdp_link_lost in its
//      lastError), the display torn down, the forward closed (design §1.5: a disconnect is an exit, never a hang)
// SKIPs with the reason when xpra / xauth / xmessage are absent. Per-pid scratch, free ports, fixtures from shapes.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = require(path.join(repo, 'src/desktop-display.js'));
const K = require(path.join(repo, 'src/server/desktop-app-keeper.js'));
const A = require(path.join(repo, 'src/server/desktop-access.js'));
let pass = 0, fail = 0, skipped = 0;
const ok = (c, name, extra) => { if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 500) : ''}`); } };
const skip = (why) => { skipped++; console.log(`  - SKIP ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;

const need = ['xpra', 'xauth', 'xmessage'].map((n) => [n, D.binOnPath(n, { env: process.env })]);
const missing = need.filter(([, p]) => !p).map(([n]) => n);
if (missing.length) { skip(`${missing.join(', ')} not on PATH — the xpra rung + the fake's window cannot be driven on this box`); console.log(`\nALL PASS (0, ${skipped} skipped)`); process.exit(0); }

const PW = ['Lw', crypto.randomBytes(6).toString('hex'), '%3'].join('');
const FP = crypto.randomBytes(32).toString('hex').match(/../g).join(':');
const HOST = 'dev-' + 'w1n';
const FAKE = path.join(repo, 'scripts/fixtures/remoteapp/xfreerdp');
const root = scratch('ralaunch');
const home = path.join(root, 'home'); const run = path.join(root, 'run');
fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(run, { recursive: true, mode: 0o700 });
const recFile = path.join(root, 'fake-rdp.jsonl');
const fakeSaw = (pid) => fs.existsSync(recFile) ? fs.readFileSync(recFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.pid === pid) : [];

// the stand-in machine (its 3389) + its agent's tcpForward
const conns = new Set();
const machineSrv = net.createServer((s) => { conns.add(s); s.on('close', () => conns.delete(s)); s.on('error', () => { }); s.on('data', (b) => { if (String(b).includes('VS-FAKE-RDP hello')) s.write('VS-FAKE-MACHINE 3389\n'); }); });
await new Promise((r) => machineSrv.listen(0, '127.0.0.1', r));
const dm = {
  status: () => ({ connected: true, info: { platform: 'win32' } }),
  desktopServe: async () => ({ ok: false, code: 'unused', error: 'unused' }),
  tcpForward: async (port) => {
    if (port !== 3389) throw new Error(`nothing listens on ${port}`);
    const s = net.connect(machineSrv.address().port, '127.0.0.1');
    await new Promise((r, j) => { s.once('connect', r); s.once('error', j); });
    const h = { onData: null, onClose: null, write: (b) => s.write(b), close: () => s.destroy() };
    s.on('data', (b) => h.onData && h.onData(b)); s.on('close', () => h.onClose && h.onClose()); s.on('error', () => { });
    return h;
  },
};
const hosts = { deviceBounded: async () => dm, get: (id) => (id === HOST ? { id, name: 'Lab PC' } : null), isLocal: (id) => !id || id === 'local', list: () => [] };
const quiet = { log() { }, warn() { }, error() { }, info() { } };
let keeper = null;
const acc = A.create({ hosts, local: () => keeper.machine, install: false, log: quiet, rdpSetup: async () => ({ user: 'someone', domain: '', certFp: FP, password: () => PW }) });
const env = () => ({ PATH: `${path.dirname(FAKE)}:${process.env.PATH}`, HOME: home, XDG_RUNTIME_DIR: run, VS_FAKE_RDP_RECORD: recFile, VS_FAKE_RDP_SERVER_FP: FP, VS_FAKE_RDP_PASSWORD_SHA256: sha(PW), WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || 'wayland-0', XDG_SESSION_TYPE: 'wayland' });
keeper = K.create({ dataDir: path.join(root, 'data'), env, broadcast: () => { }, access: () => acc, log: quiet, serverSetting: () => undefined });
const pidsOf = (r) => [...new Set(Object.values((r && r.pids) || {}).filter(Boolean))];
const cleanup = () => { try { machineSrv.close(); } catch { /* down */ } for (const r of keeper.machine.listApps()) for (const pid of pidsOf(r)) { try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ } } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

console.log('§1 launch on a real xpra display');
const PROGRAM = 'C:\\Windows\\System32\\notepad.exe';
const t0 = Date.now();
const v = await acc.launchRemoteApp(HOST, { program: PROGRAM, name: 'Notepad' }).catch((e) => ({ id: null, error: `${e.code || 'error'}: ${e.message}` }));
const r1 = v.id ? await until(() => { const r = keeper.get(v.id); return r && r.state !== 'launching' ? r : null; }, 40000, 200) : null;
// lane remoteapp-fake-node-path: a launch that failed (master .288: the fake could not say its version) is the cause every
// leg that needs its record names — never a TypeError that hides the legs after it
const why1 = r1 ? null : `the launch made no record — ${v.error || 'it never left launching in 40 s'}`;
ok(r1 && r1.state === 'ready' && r1.backend === 'remoteapp' && r1.via === 'xpra+xfreerdp' && r1.recipe === 'xpra-seamless' && r1.probe === 'http' && /^:\d+$/.test(r1.display), `ready in ${Date.now() - t0} ms on ${r1 && r1.display} (xpra-seamless, probe http) — lastError ${r1 && r1.lastError}`, r1 ? { state: r1.state, lastError: r1.lastError } : why1);
ok(r1 && r1.pids.x > 0 && r1.pids.server === r1.pids.x && r1.pids.app > 0 && r1.pids.app !== r1.pids.x && keeper.streamTarget(v.id) && keeper.streamTarget(v.id).kind === 'xpra', 'ONE xpra pid = X + picture server; the fake xfreerdp is the app; the stream target is xpra', r1 ? r1.pids : why1);
const fakePid = r1 && r1.pids.app;
const saw = fakePid ? await until(() => { const s = fakeSaw(fakePid); return s.some((x) => x.phase === 'window') ? s : null; }, 15000) : null;
const st = saw && saw.find((x) => x.phase === 'stdin'); const start = saw && saw.find((x) => x.phase === 'start');
ok(st && st.lines === 1 && st.domainFromStdin === false && st.password && st.password.sha256 === sha(PW), 'the fake read ONE stdin line, and it is the password (sha256)', st || why1);
ok(start && start.env.DISPLAY === r1.display && start.env.XDG_CONFIG_HOME === path.join(keeper.logRoot, v.id, 'rdp-config') && saw.find((x) => x.phase === 'connected').reply === 'VS-FAKE-MACHINE 3389', 'DISPLAY = the record\'s own xpra display; its own XDG_CONFIG_HOME; it reached the machine through the forward', start ? start.env : why1);

console.log('§2 the RAIL stand-in window is an X top-level on the record\'s display');
const w = r1 ? await until(async () => { const r = await keeper.windows(v.id); return r.ok && r.windows.some((x) => /xfreerdp/i.test(`${x.instance || ''} ${x.cls || ''}`) || x.title === 'Notepad') ? r : null; }, 15000, 300) : null;
ok(w && w.windows.length === 1 && (w.windows[0].title === 'Notepad' || /xfreerdp/i.test(`${w.windows[0].instance} ${w.windows[0].cls}`)), `windows(): exactly the RAIL stand-in (${w && JSON.stringify(w.windows.map((x) => [x.title, x.instance, x.cls, x.w, x.h]))}) — xpra's own wrappers filtered`, w || why1);
if (SHOTS && w) {
  // xpra redirects its windows (Composite): a root grab is black — the window's OWN contents are read by its id
  const xenv = { ...process.env, DISPLAY: r1.display, XAUTHORITY: path.join(keeper.logRoot, v.id, 'Xauthority') };
  try {
    const ids = execFileSync('xdotool', ['search', '--name', '^Notepad$'], { env: xenv, encoding: 'utf8', timeout: 5000 }).trim().split('\n').filter(Boolean);
    fs.mkdirSync(SHOTS, { recursive: true });
    const out = path.join(SHOTS, 'remoteapp-xpra-display.png');
    let best = 0;
    for (const id of ids) {
      const tmp = path.join(root, `win-${id}.png`);
      try { execFileSync('import', ['-window', id, tmp], { env: xenv, timeout: 15000 }); const n = fs.statSync(tmp).size; if (n > best) { best = n; fs.copyFileSync(tmp, out); } } catch { /* not drawable */ }
    }
    if (best <= 1000) {
      // no client ⇒ xpra keeps the seamless window unmapped: attach a REAL xpra client to the record's port from a SECOND
      // private Xvfb, and save that display — the window as a person's client draws it
      const xv = D.spawnDetached('Xvfb', ['-displayfd', '3', '-nolisten', 'tcp', '-screen', '0', '640x300x24'], { env: process.env, extraStdio: 'pipe' });
      const xc = await xv.spawned;
      const vdisp = await new Promise((r) => { let b = ''; xc.stdio[3].on('data', (d) => { b += d; if (b.includes('\n')) r(':' + b.trim()); }); setTimeout(() => r(null), 5000); });
      const cenv = { ...process.env, DISPLAY: vdisp, HOME: home, XDG_RUNTIME_DIR: run };
      delete cenv.WAYLAND_DISPLAY;
      const cl = vdisp ? D.spawnDetached('xpra', ['attach', `tcp://127.0.0.1:${r1.port}/`, '--opengl=no', '--tray=no', '--notifications=no', '--speaker=off', '--microphone=off', '--webcam=no', '--splash=no', '--bell=no', '--clipboard=no'], { env: cenv }) : null;
      const cc = cl ? await cl.spawned.catch(() => null) : null;
      await sleep(5000);
      try { execFileSync('import', ['-window', 'root', '-crop', '440x200+0+0', out], { env: cenv, timeout: 15000 }); best = fs.statSync(out).size; } catch { /* below */ }
      for (const c of [cc, xc]) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } }
    }
    if (best > 1000) ok(true, `the RAIL stand-in window saved (a real xpra client attached to the record's port, on a second private Xvfb): ${out} (${best} bytes)`);
    else skip(`no picture of the Notepad window (${ids.length} id(s) on ${r1.display}; an attached client drew nothing) — the window census above stands`);
  } catch (e) { skip(`the screenshot failed (${e.message.split('\n')[0]}) — the window census above stands`); }
}

console.log('§3 the password in no process of the session');
{
  const members = [...new Set(pidsOf(r1).flatMap((p) => { try { return D.sessionMembers(p, { fresh: true }); } catch { return [p]; } }))];
  const xm = (saw || []).find((x) => x.phase === 'window'); if (xm && xm.windowPid) members.push(xm.windowPid);
  const pwb = Buffer.from(PW);
  const hits = members.filter((p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`).includes(pwb) || fs.readFileSync(`/proc/${p}/environ`).includes(pwb); } catch { return false; } });
  ok(members.length >= 3 && hits.length === 0, `cmdline + environ of ${members.length} session processes (xpra, its X, the fake, its window): the password in none`, why1 || { members, hits });
}

console.log('§4 stop');
{
  const xm = ((saw || []).find((x) => x.phase === 'window') || {}).windowPid;
  if (v.id) await keeper.stop(v.id);
  const r = v.id ? await until(() => { const x = keeper.get(v.id); return x && !['launching', 'ready'].includes(x.state) ? x : null; }) : null;
  ok(r && pidsOf(r1).every((p) => !alive(p)) && (!xm || !alive(xm)), `stopped (${r && r.state}): xpra, the fake and its window process are gone`, why1 || { pids: pidsOf(r1).map((p) => [p, alive(p)]), xm: xm && alive(xm) });
  ok(await until(() => acc.forwards().length === 0 && conns.size === 0), 'the forward closed (no listener, the machine-side connection gone)', acc.forwards());
}

console.log('§5 the machine\'s side drops mid-session ⇒ the session ends on its own');
{
  const v2 = await acc.launchRemoteApp(HOST, { program: PROGRAM, name: 'Notepad' }).catch((x) => ({ id: null, error: `${x.code || 'error'}: ${x.message}` }));
  const a = v2.id ? await until(() => { const x = keeper.get(v2.id); return x && x.state === 'ready' ? x : null; }, 40000, 200) : null;
  if (a) await until(() => fakeSaw(a.pids.app).some((x) => x.phase === 'connected'), 10000);
  for (const s of conns) s.destroy(); // the machine went away
  const e = a ? await until(() => { const x = keeper.get(v2.id); return x && !['launching', 'ready'].includes(x.state) ? x : null; }, 15000, 200) : null;
  ok(e && e.rdp && e.rdp.ended === 'rdp_link_lost' && /dropped/.test(e.lastError || ''), `the client exited by itself; the record ended (${e && e.state}) saying why: ${e && e.lastError}`, e ? { state: e.state, rdp: e.rdp, exitCode: e.exitCode } : `the second launch was never ready — ${v2.error || (v2.id && keeper.get(v2.id) ? `${keeper.get(v2.id).state}: ${keeper.get(v2.id).lastError}` : 'no record')}`);
  ok(a && await until(() => pidsOf(a).every((p) => !alive(p))) && await until(() => acc.forwards().length === 0), 'its display torn down and its forward closed', a ? undefined : 'not run: no session to tear down');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed${skipped ? `, ${skipped} skipped` : ''})` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
