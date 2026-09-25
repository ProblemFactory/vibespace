#!/usr/bin/env node
// DESKTOP APPS ON A PAIRED DEVICE — the real-daemon gate of lane C1
// (docs/design-desktop-apps-seamless.zh.md §3.5, D5 / D8). The test-sysinfo-op
// template: a REAL agentd booted from the BUILT bundle (data/bin/vibespace-
// agentd.js) under a scratch HOME is the fake paired device; the hub side is
// src/server/desktop-access.js with a HostManager stand-in that hands that
// daemon's DeviceManager out for one host id. Legs:
//   §1 the daemon advertises `desktop-serve` in its hello-ack; `facts` answers
//      the DEVICE's own facts through the op
//   §2 launch an xterm on the device (the xpra rung) ⇒ ready; the record is the
//      DEVICE's (~/.vibespace/desktop-apps.json under its HOME — D8), its logs
//      in its own dir
//   §3 forwardPort ⇒ a hub-side loopback port piped over the agentd data plane
//      (tcpForward) ⇒ a REAL xpra hello through it ⇒ "abc" typed lands in a
//      file the app writes; the latencies measured and printed (§8-7)
//   §4 windows / keep-alive / status, then the daemon SIGKILLed and a new one
//      booted on the same HOME ⇒ the live record is ADOPTED at boot (the
//      device-held record outlives its daemon)
//   §5 stop ⇒ exited, nothing carries the session marker, the forward closed
//   §6 THE CAPABILITY GATE: a daemon COPY whose hello-ack lacks the capability
//      ⇒ `host_needs_daemon` within 1 s (never asked); CONTROL = the same copy
//      with the handler removed too answers NOTHING to a raw op (the hang the
//      gate exists for, bounded here at 1.5 s); a handle with no desktopServe
//      (stand-in) and an unknown host are refused by name, never a silent
//      local run (the real ssh rung — a daemon installed over ssh, a failed
//      bootstrap = host_unavailable — is test-desktop-serve §5)
//   §7 LANE C2 — THE HUB SIDE, end to end: the REAL hub keeper (its registry of
//      a paired machine's apps) over desktop-access over the real daemon, and the
//      REAL bridge (src/server/desktop-stream.js) on an http server: a launch with
//      host ⇒ the record re-labelled, followed to ready ⇒ the bridge's upgrade
//      resolves the target to the hub forward (streamEndpointFor) ⇒ a real xpra
//      hello THROUGH THE BRIDGE ⇒ ping→ping_echo RTTs + "abc" typed → the file
//      (the §8-7 numbers, printed) ⇒ the socket's forward reference released ⇒
//      stop through the keeper; the daemon killed ⇒ the record KEPT as
//      unknown-host-offline, the bridge refuses its upgrade (404, never a local
//      connect); a keeper launch on an agent without the capability ⇒
//      host_needs_daemon within 1 s
//   §8 C2 verify: an op IN FLIGHT when the device's link dies answers
//      host_unavailable at once (CONTROL: the pre-fix client waits out the op's
//      own timeout); run-stream's belt is per op; the install run past its
//      deadline is install_timeout with the device's child waited out.
//      verify r2: the install runs DETACHED — the device's facts report it
//      (`installing` from its pidfile, then `lastInstall`); the daemon SIGKILLed
//      mid-install ⇒ the install still reaches its end (F4; CONTROL: the pre-fix
//      rung dies with the daemon); the HUB's side of the link destroyed with a
//      4 MB run-stream producer in flight ⇒ the daemon resumes it into
//      ~/.vibespace/run-stream/<pid>.log and it finishes (F2; CONTROL: the
//      pre-fix bundle leaves it paused for good)
//      verify r3: the same with the child paused AT the cut and <pid>.log a
//      /dev/full symlink ⇒ it still runs to its end (M2; CONTROL: a pre-fix
//      bundle through mutant-copy, frozen at 6 s); a full <pid>.log left by a
//      previous process (pid wrap) takes only this orphan's marker lines (L6;
//      CONTROL: the pre-fix bundle appends up to another 8 MiB)
//      verify r4: the device's detached install holds its lock on LOCAL storage,
//      never in its state dir: `installing.lock` names it while it runs and the
//      lock is held; verify r5 L3: its directory is named by the daemon's UID
//      (/run/user/<uid>, else /tmp/vibespace-<uid>) — the daemons here run with
//      $XDG_RUNTIME_DIR a scratch dir, and the lock is never under it
// SKIPs with evidence without xpra / Xvfb / xauth / xterm (§8 needs none). Zero vendor calls;
// the scratch HOME and every process it started are reaped on exit.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { scratch, scratchHome } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const WebSocket = require('ws');
const P = await import(path.join(REPO, 'src/lib/xpra-proto.js'));
const D = require(path.join(REPO, 'src/desktop-display.js'));
const DS = require(path.join(REPO, 'src/desktop-serve.js'));
const ACC = require(path.join(REPO, 'src/server/desktop-access.js'));
const K = require(path.join(REPO, 'src/server/desktop-app-keeper.js'));
const S = require(path.join(REPO, 'src/server/desktop-stream.js'));
const http = require('http');

let pass = 0, fail = 0, skipped = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 400) : '')); } };
const skip = (n, why) => { skipped++; console.log(`  - SKIP ${n}: ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 100) => { const t = Date.now() + ms; while (Date.now() < t) { const v = await fn(); if (v) return v; await sleep(step); } return null; };

const BUNDLE = path.join(REPO, 'data/bin/vibespace-agentd.js');
const home = scratchHome('dsremote-home', fs, ['.vibespace']);
const home2 = scratchHome('dsremote-home2', fs, ['.vibespace']);
const home3 = scratchHome('dsremote-home3', fs, ['.vibespace']);
const home4 = scratchHome('dsremote-home4', fs, ['.vibespace']);
const home5 = scratchHome('dsremote-home5', fs, ['.vibespace']); // verify r3 M2 control (the pre-fix bundle)
const home6 = scratchHome('dsremote-home6', fs, ['.vibespace']); // verify r3 L6 control (the pre-fix bundle)
const hubDir = scratch('dsremote-hub'); fs.mkdirSync(hubDir, { recursive: true });
const work = scratch('dsremote-work'); fs.mkdirSync(work, { recursive: true });
// (verify r5 L3) the install lock's directory is named by the UID, never the environment: the daemons this suite boots
// get $XDG_RUNTIME_DIR = a SCRATCH dir and §8 pins that the lock is NOT under it but under LOCKROOT; the lock NAME is the
// sha1 of the scratch state dir's realpath (never production's), removed at cleanup
const XDG = path.join(work, 'xdg'); fs.mkdirSync(XDG, { recursive: true, mode: 0o700 }); process.env.XDG_RUNTIME_DIR = XDG;
const UID = process.getuid();
const LOCKROOT = (() => { const d = `/run/user/${UID}`; try { const st = fs.statSync(d); fs.accessSync(d, fs.constants.W_OK); if (st.isDirectory() && st.uid === UID) return d; } catch { } return `/tmp/vibespace-${UID}`; })();
const lockPathOf = (st) => path.join(LOCKROOT, `${require(path.join(REPO, 'src/desktop-apps.js')).INSTALL_LOCK_PREFIX}${require('crypto').createHash('sha1').update(fs.realpathSync(st)).digest('hex').slice(0, 12)}.lock`);
const copyDir = scratch('dsremote-bundle');
const rootOf = (h) => path.join(h, 'agentd-root');
const started = []; // { home } — every daemon root this suite booted (reaped on exit, by its pidfile)
const ids = new Set();
const orphanPids = new Set(); // producers the F2 leg started (the control's stays paused — reaped on exit)
function killDaemon(h, sig = 'SIGKILL') { try { const pid = Number(fs.readFileSync(path.join(rootOf(h), 'state', 'agentd.pid'), 'utf8')); if (pid > 0) process.kill(pid, sig); return pid; } catch { return null; } }
function markerPids(id) { const out = []; for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; if (D.environHas(Number(d), `${DS.SESSION_ENV}=${id}`)) out.push(Number(d)); } return out; }
const cleanup = () => {
  for (const id of ids) for (const p of markerPids(id)) { try { process.kill(p, 'SIGKILL'); } catch { } } // evidence: OUR ids' marker only
  for (const p of orphanPids) { try { process.kill(p, 'SIGKILL'); } catch { } } // the F2 control's producer, paused for good by construction
  for (const h of [home, home2, home3, home4, home5, home6]) { try { process.kill(Number(fs.readFileSync(path.join(rootOf(h), 'state', 'agentd.pid'), 'utf8')), 'SIGCONT'); } catch { } killDaemon(h); }
  for (const h of [home, home2, home3, home4, home5, home6]) { try { fs.rmSync(lockPathOf(path.join(h, '.vibespace')), { force: true }); } catch { } } // the locks our daemons' installs named (r5 L3)
  for (const d of [home, home2, home3, home4, home5, home6, work, copyDir, hubDir]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(1); });

const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
/** A DeviceManager over a daemon booted from `bundlePath` under `h` (the daemon inherits this process's env). */
function deviceOn(h, bundlePath = BUNDLE) {
  process.env.HOME = h; process.env.VIBESPACE_AGENTD_ROOT = rootOf(h);
  const dataDir = path.join(h, 'hub-data'); fs.mkdirSync(dataDir, { recursive: true });
  started.push(h);
  return new DeviceManager({ dataDir, bundlePath, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
}
const realHome = process.env.HOME;
/** The hub's view of the paired machines: ONE device id, plus an ssh host with no daemon. */
function hostsFor(map) {
  return {
    get: (h) => (map[h] !== undefined ? { id: h } : null),
    isLocal: () => false,
    deviceBounded: async (h) => { const v = map[h]; if (v === undefined) throw new Error('unknown'); return typeof v === 'function' ? v() : v; },
  };
}

console.log('§0 the built bundle carries the op');
const bundleText = fs.existsSync(BUNDLE) ? fs.readFileSync(BUNDLE, 'utf8') : '';
ok(/capabilities: \[[^\]]*["']desktop-serve["'][^\]]*\]/.test(bundleText) && /desktop-serve-result/.test(bundleText) && /runDesktopServeOp/.test(bundleText), 'data/bin/vibespace-agentd.js advertises desktop-serve and bundles runDesktopServeOp (run `npm run build:agentd` when this is red)');
if (!bundleText) { console.log(`\n${fail} FAILED (${pass} passed)`); process.exit(1); }

const dm = deviceOn(home);
const conn = await dm.connect();
const acc = ACC.create({ hosts: hostsFor({ 'dev-a': dm, 'ssh-only': {} }), install: false, log: { log() { }, warn() { } } });

console.log('§1 the capability and the device\'s own facts');
ok(conn.info?.capabilities?.includes?.('desktop-serve'), 'the daemon\'s hello-ack names desktop-serve (the client asks only such a daemon)');
const facts = (await acc.call('dev-a', 'facts', { fresh: true })).facts;
const bins = facts.bins || {};
ok(facts && typeof bins === 'object' && 'xpra' in bins && 'Xvfb' in bins, 'facts answer through the op: the device\'s own binaries (xpra / Xvfb / …)', Object.keys(bins));
const XTERM = D.binOnPath('xterm', { env: process.env });
const WWW = bins.xpra ? D.xpraWwwDir({ binPath: bins.xpra, env: process.env }) : null;
const canRun = !!(bins.xpra && bins.Xvfb && bins.xauth && XTERM && WWW && fs.existsSync(path.join(WWW, 'js/lib/rencode.js')));
const XTERM_ALL = XTERM, WWW_ALL = WWW, canRunAll = () => canRun; // §7 (after §6's scope) reuses the facts
if (!canRun) skip('§2–§5 (the app legs)', `this machine lacks one of xpra (${!!bins.xpra}) / Xvfb (${!!bins.Xvfb}) / xauth (${!!bins.xauth}) / xterm (${!!XTERM}) / the html5 client's rencode.js (${WWW || 'no www'})`);
else {
  vm.runInThisContext(fs.readFileSync(path.join(WWW, 'js/lib/rencode.js'), 'utf8'), { filename: 'rencode.js' });
  const frame = (pk) => { const body = Buffer.from(globalThis.rencode(pk)); const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 16; h.writeUInt32BE(body.length, 4); return Buffer.concat([h, body]); };
  const typeOf = (m) => { try { return P.bytesToString(globalThis.rdecode(new Uint8Array(m.subarray(8)))[0]); } catch { return null; } };
  const settings = { 'desktop.backendPrefs': '', 'desktop.appScale': '1', 'desktop.idleTimeoutMin': 0 };

  console.log('§2 launch on the device');
  const list = await acc.call('dev-a', 'list', { settings });
  ok(list.availability && list.availability.backend === 'xpra' && list.availability.stream === 'xpra', `the device's ladder resolves the xpra rung (${list.availability && list.availability.backend})`, list.availability);
  const out = path.join(work, 'typed.txt');
  const t0 = Date.now();
  const L = await acc.call('dev-a', 'launch', { settings, body: { exec: XTERM, args: ['-geometry', '80x24', '-T', 'vs-remote', '-e', 'sh', '-c', `stty -icanon; cat > ${out}`], label: 'remote xterm' } });
  const app = L.app; ids.add(app.id);
  ok(app && app.state === 'launching' && app.backend === 'xpra' && app.hostId === 'local', 'launch answers a launching record on xpra — hostId "local" is the DEVICE\'s view of itself (the hub re-labels it)', app && { state: app.state, backend: app.backend, hostId: app.hostId });
  const ready = await until(async () => { const s = (await acc.call('dev-a', 'status', { id: app.id })).app; if (s.state === 'failed' || s.state === 'exited') return s; return s.state === 'ready' ? s : null; }, 30000, 250);
  ok(ready && ready.state === 'ready' && ready.port > 0 && ready.pids.app > 0, `ready ${Date.now() - t0} ms after the launch op: port ${ready && ready.port}, display ${ready && ready.display}`, ready && { state: ready.state, lastError: ready.lastError });
  const devStore = path.join(home, '.vibespace', 'desktop-apps.json');
  const onDisk = (() => { try { return JSON.parse(fs.readFileSync(devStore, 'utf8')).apps[app.id]; } catch { return null; } })();
  ok(onDisk && onDisk.state === 'ready' && onDisk.pids.app === ready.pids.app, 'the record is the DEVICE\'s own (~/.vibespace/desktop-apps.json under its HOME — D8: the device holds it, the hub is a registry)');
  ok(fs.existsSync(path.join(home, '.vibespace', 'desktop-apps', app.id, 'app.log')), 'the session\'s logs and Xauthority live in the device\'s own per-app dir');

  if (ready && ready.state === 'ready') {
    console.log('§3 the picture forward + a real xpra hello + typing');
    const fwd = await acc.forwardPort('dev-a', ready.port);
    ok(fwd && fwd.localPort > 0 && !fwd.local && acc.forwards().length === 1, `forwardPort opened a hub loopback listener 127.0.0.1:${fwd.localPort} → dev-a:${ready.port}`, acc.forwards());
    const tHello = Date.now();
    const ws = new WebSocket(`ws://127.0.0.1:${fwd.localPort}/`, ['binary']);
    const back = []; ws.on('message', (m) => back.push(Buffer.from(m)));
    let buf = Buffer.alloc(0); const packets = [];
    ws.on('message', (m) => { buf = Buffer.concat([buf, Buffer.from(m)]); while (buf.length >= 8 && buf[0] === 0x50) { const size = buf.readUInt32BE(4); if (buf.length < 8 + size) break; const one = buf.subarray(0, 8 + size); buf = buf.subarray(8 + size); if (one[3] === 0) packets.push(one); } });
    await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
    ws.send(frame(['hello', { ...P.helloCaps({ width: 800, height: 600, dpi: 96, uuid: `vs-remote-${process.pid}`, layout: 'us' }), lz4: false, brotli: false, compression_level: 0 }]));
    const saw = (t) => packets.some((m) => typeOf(m) === t);
    const helloAt = await until(() => (saw('hello') ? Date.now() : null), 15000, 20);
    const nwAt = await until(() => (saw('new-window') ? Date.now() : null), 15000, 20);
    ok(!!helloAt && !!nwAt, `xpra answered the hello THROUGH the forward in ${helloAt ? helloAt - tHello : '—'} ms and announced the app's window ${nwAt ? nwAt - tHello : '—'} ms after the connect`);
    const nwm = packets.find((m) => typeOf(m) === 'new-window');
    const nw = nwm ? globalThis.rdecode(new Uint8Array(nwm.subarray(8))) : null;
    ws.send(frame(P.keyboardConfigPacket(['keyboard-config'], { layout: 'us' })));
    if (nw) { ws.send(frame(P.mapWindow(nw[1], { x: 0, y: 0, w: nw[4], h: nw[5] }))); ws.send(frame(P.focusPacket(nw[1]))); }
    await until(() => (saw('draw') ? true : null), 10000, 50);
    await sleep(300);
    const tKeys = Date.now();
    for (const kk of new P.ImeKeymap().plan('abc').keys) { ws.send(frame(P.keyAction(nw ? nw[1] : 1, kk, true))); ws.send(frame(P.keyAction(nw ? nw[1] : 1, kk, false))); }
    const typed = await until(() => { try { const t = fs.readFileSync(out, 'utf8'); return t.length >= 3 ? t : null; } catch { return null; } }, 8000, 10);
    const keyMs = Date.now() - tKeys;
    ok(typed === 'abc', `"abc" typed through the forward LANDED in the app's file (${JSON.stringify(typed)}, ${keyMs} ms from the first key-action to the third byte on disk)`);
    console.log(`  latency (§8-7, loopback device): hello ${helloAt - tHello} ms, keystrokes→file ${keyMs} ms — the forward adds the device link's RTT and nothing else (bytes are relayed, never parsed)`);
    ws.close();
    await sleep(200);

    console.log('§4 windows / keep-alive / status, then the daemon dies and a new one adopts');
    const win = await acc.call('dev-a', 'windows', { id: app.id });
    ok(Array.isArray(win.windows) && win.windows.some((w) => /vs-remote/.test(String(w.title || ''))), `windows answers the app's own rows on the device (${win.windows.map((w) => w.title).join(' | ')})`);
    const ka = await acc.call('dev-a', 'keep-alive', { id: app.id });
    ok(ka.app && ka.app.idleTimeoutMs === 0, 'keep-alive sets the record\'s idle timeout to never (the hub\'s policy, held on the device record)');
    const st = await acc.call('dev-a', 'status', {});
    ok(Array.isArray(st.apps) && st.apps.some((a) => a.id === app.id), 'status without an id lists the device\'s records (+ the latest samples the hub judges)');
    const oldPid = killDaemon(home);
    await sleep(500);
    ok(oldPid > 0 && !D.pidAlive(oldPid) && D.pidAlive(ready.pids.app), `the daemon (pid ${oldPid}) is SIGKILLed — the app (pid ${ready.pids.app}) keeps running (sessions never belong to a connection)`);
    dm.stop();
    const dm2 = deviceOn(home);
    await dm2.connect();
    const acc2 = ACC.create({ hosts: hostsFor({ 'dev-a': dm2 }), install: false, log: { log() { }, warn() { } } });
    const adopted = await until(async () => { const s = (await acc2.call('dev-a', 'status', { id: app.id })).app; return s && s.adoptedAt ? s : null; }, 15000, 250);
    ok(adopted && adopted.state === 'ready' && adopted.adoptedAt > 0, 'a NEW daemon on the same HOME adopted the live record at boot (pid + starttime re-proved — the device-held record outlived its daemon)', adopted && { state: adopted.state, adoptedAt: adopted.adoptedAt, lastError: adopted.lastError });

    console.log('§5 stop');
    const s = await acc2.call('dev-a', 'stop', { id: app.id });
    ok(s.app && s.app.state === 'exited' && s.app.stoppedBy === 'user', 'stop answers exited / user, verified on the device', s.app && { state: s.app.state, lastError: s.app.lastError });
    await sleep(500);
    ok(markerPids(app.id).length === 0, `nothing carries VIBESPACE_DESKTOP_APP=${app.id} after the stop`, markerPids(app.id));
    ok(acc.closeForward(`dev-a:${ready.port}`) === true && acc.forwards().length === 0, 'the forward\'s last reference released ⇒ its listener is closed');
    const bad = await acc2.call('dev-a', 'stop', { id: 'da-nope' }).then(() => null, (e) => e);
    ok(bad && bad.code === 'not-found', 'an op on a record the device does not hold is refused by code (not-found), thrown hub-side as ONE shape', bad && bad.message);
    dm2.stop();
  }
}

console.log('§6 the capability gate');
{
  // a daemon COPY whose hello-ack does NOT name the capability (an old agent)
  fs.mkdirSync(copyDir, { recursive: true });
  // BY CONTENT, never by the list's tail (verify r2 F5): the hello-ack list is found by its key, desktop-serve removed
  // from INSIDE it wherever it sits — one capability appended after it must not turn this gate red
  const CAP_LIST = /capabilities: \[([^\]]*)\]/;
  const capsOf = (txt) => { const m = CAP_LIST.exec(txt); return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : null; };
  const dropCap = (txt) => txt.replace(CAP_LIST, (all, inner) => `capabilities: [${inner.split(',').map((x) => x.trim()).filter((x) => x && x !== '"desktop-serve"').join(', ')}]`);
  const capsNow = capsOf(bundleText);
  ok(capsNow && capsNow.includes('"desktop-serve"') && (bundleText.match(/capabilities: \[/g) || []).length === 1, 'the bundle has ONE hello-ack capability list and it names desktop-serve (the copy removes exactly it)', capsNow);
  const oldText = dropCap(bundleText);
  const capsOld = capsOf(oldText);
  ok(capsOld && !capsOld.includes('"desktop-serve"') && capsOld.length === capsNow.length - 1 && capsNow.filter((c) => c !== '"desktop-serve"').join() === capsOld.join(), 'the old-daemon copy\'s list lacks desktop-serve and keeps every other capability in order', capsOld);
  const oldBundle = path.join(copyDir, 'vibespace-agentd.js');
  fs.writeFileSync(oldBundle, oldText);
  const dmOld = deviceOn(home2, oldBundle);
  const connOld = await dmOld.connect();
  ok(!connOld.info?.capabilities?.includes?.('desktop-serve'), 'the old daemon\'s hello-ack lacks desktop-serve');
  const accOld = ACC.create({ hosts: hostsFor({ 'dev-old': dmOld, 'ssh-only': {} }), install: false, log: { log() { }, warn() { } } });
  const t1 = Date.now();
  const e1 = await accOld.call('dev-old', 'facts', {}).then(() => null, (e) => e);
  const ms1 = Date.now() - t1;
  ok(e1 && e1.code === 'host_needs_daemon' && ms1 < 1000, `an old daemon is NEVER asked: host_needs_daemon in ${ms1} ms (< 1 s), never a hang`, e1 && { code: e1.code, message: e1.message });
  // lane C2: the same gate through the HUB keeper's launch (the route's path) — refused by name, nothing registered
  const kOld = K.create({ dataDir: path.join(hubDir, 'k-old'), env: () => ({ PATH: process.env.PATH, HOME: realHome }), broadcast: () => { }, display: D, log: { log() { }, warn() { } }, access: () => accOld });
  const tk = Date.now();
  const ek = await kOld.launch({ exec: 'xterm' }, { host: 'dev-old' }).then(() => null, (e) => e);
  const msk = Date.now() - tk;
  ok(ek && ek.code === 'host_needs_daemon' && msk < 1000 && kOld.listApps().length === 0, `the hub keeper's launch on that agent ⇒ host_needs_daemon in ${msk} ms, nothing registered (C2)`, ek && ek.code);
  kOld.shutdown();
  // CONTROL — why the gate exists: the same old daemon asked anyway (a raw request past the gate) answers nothing
  fs.writeFileSync(oldBundle, oldText.replace('if (msg.op === "desktop-serve") {', 'if (false) {'));
  killDaemon(home2); dmOld.stop();
  const dmOld2 = deviceOn(home2, oldBundle);
  await dmOld2.connect();
  const t2 = Date.now();
  const raw = await dmOld2._request({ op: 'desktop-serve', action: 'facts', params: {}, timeoutMs: 1500 }).then((r) => ({ answered: r }), (e) => ({ error: e.message }));
  ok(!raw.answered && Date.now() - t2 >= 1400, `CONTROL: a daemon that does not know the op answers NOTHING to it (${raw.error || 'answered'} after ${Date.now() - t2} ms) — the hang the capability gate prevents`, raw);
  dmOld2.stop(); killDaemon(home2);
  const e2 = await accOld.call('ssh-only', 'facts', {}).then(() => null, (e) => e);
  ok(e2 && e2.code === 'host_needs_daemon' && /no VibeSpace agent/.test(e2.message), 'a machine handle with no desktopServe (stand-in) is refused BY NAME (host_needs_daemon) — never a silent local run', e2 && e2.message);
  const e3 = await accOld.call('nowhere', 'facts', {}).then(() => null, (e) => e);
  ok(e3 && e3.code === 'unsupported-host', 'an unknown host is refused by name (unsupported-host)', e3 && e3.message);
  const e4 = await accOld.forwardPort('ssh-only', 1234).then(() => null, (e) => e);
  ok(e4 && e4.code === 'host_needs_daemon' && accOld.forwards().length === 0, 'forwardPort to that handle is refused the same way, no listener left', e4 && e4.code);
}

if (canRunAll()) {
  console.log('§7 LANE C2 — the hub side end to end: the hub keeper + the real bridge over the paired daemon');
  if (typeof globalThis.rencode !== 'function') vm.runInThisContext(fs.readFileSync(path.join(WWW_ALL, 'js/lib/rencode.js'), 'utf8'), { filename: 'rencode.js' }); // §2 loaded it already
  const frame = (pk) => { const body = Buffer.from(globalThis.rencode(pk)); const h = Buffer.alloc(8); h[0] = 0x50; h[1] = 16; h.writeUInt32BE(body.length, 4); return Buffer.concat([h, body]); };
  const typeOf = (m) => { try { return P.bytesToString(globalThis.rdecode(new Uint8Array(m.subarray(8)))[0]); } catch { return null; } };
  const dm3 = deviceOn(home);
  await dm3.connect();
  let devUp = true;
  const hosts3 = { get: (h) => (h === 'dev-a' ? { id: h } : null), isLocal: () => false, deviceBounded: async (h) => { if (h !== 'dev-a') throw new Error('unknown'); if (!devUp) throw new Error('device link not responding within 8s'); return dm3; } };
  const acc3 = ACC.create({ hosts: hosts3, install: false, log: { log() { }, warn() { } } });
  const bc = [];
  const settings3 = { 'desktop.backendPrefs': '', 'desktop.appScale': '1', 'desktop.idleTimeoutMin': 0 };
  const hub = K.create({ dataDir: path.join(hubDir, 'data'), env: () => ({ PATH: process.env.PATH, HOME: realHome }), broadcast: (m) => bc.push(m), serverSetting: (k) => settings3[k], display: D, log: { log() { }, warn() { } }, access: () => acc3, hostLabel: (h) => (h === 'dev-a' ? 'Test device' : h), remoteHosts: () => ['dev-a'] });
  const out = path.join(work, 'typed-hub.txt');
  const t0 = Date.now();
  const L = await hub.launch({ exec: XTERM_ALL, args: ['-geometry', '80x24', '-T', 'vs-remote-hub', '-e', 'sh', '-c', `stty -icanon; cat > ${out}`], label: 'hub xterm' }, { host: 'dev-a' });
  ids.add(L.id);
  ok(L && L.hostId === 'dev-a' && L.hostLabel === 'Test device' && L.state === 'launching', 'the hub keeper\'s launch with host runs on the device and answers the record re-labelled (hostId + label)', L && { hostId: L.hostId, state: L.state });
  const ready = await until(() => { const r = hub.get(L.id); return r && (r.state === 'ready' || r.state === 'failed' || r.state === 'exited') ? r : null; }, 30000, 100);
  const readyMs = Date.now() - t0;
  ok(ready && ready.state === 'ready' && ready.hostId === 'dev-a', `the launch is FOLLOWED to ready (${readyMs} ms; the launch dialog's window never waits a whole tick)`, ready && { state: ready.state, lastError: ready.lastError });
  ok(bc.some((m) => m.type === 'desktop-apps-updated' && m.apps.some((a) => a.id === L.id && a.state === 'ready' && a.hostLabel === 'Test device')), 'every client hears it (desktop-apps-updated carries the paired machine\'s record)');
  const st = hub.streamTarget(L.id);
  ok(st && st.kind === 'xpra' && st.hostId === 'dev-a' && st.port === ready.port, 'the bridge\'s target names the DEVICE\'s picture port and its host', st);
  // the REAL bridge, the production resolveTarget + forwardPort wiring (window-live-wiring's two lines)
  const bridge = S.create({ auth: { requestAuthed: () => true }, resolveTarget: (id) => hub.streamTarget(id), forwardPort: (h, p) => acc3.forwardPort(h, p), log: { log() { }, warn() { } } });
  const srv = http.createServer((q, r) => { r.writeHead(404); r.end(); });
  srv.on('upgrade', (req, sock, head) => { const id = S.upgradeId(new URL(req.url, 'http://x').pathname); if (!id) { sock.destroy(); return; } bridge.handleUpgrade(req, sock, head, id); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${srv.address().port}${S.streamPath(L.id)}`;
  const tOpen = Date.now();
  const ws = new WebSocket(url, ['binary']);
  let buf = Buffer.alloc(0); const pk = [];
  ws.on('message', (m) => { buf = Buffer.concat([buf, Buffer.from(m)]); while (buf.length >= 8 && buf[0] === 0x50) { const size = buf.readUInt32BE(4); if (buf.length < 8 + size) break; const one = buf.subarray(0, 8 + size); buf = buf.subarray(8 + size); if (one[3] === 0) pk.push([Date.now(), one]); } });
  const opened = await new Promise((r) => { ws.once('open', () => r(true)); ws.once('error', () => r(false)); ws.once('unexpected-response', () => r(false)); });
  const openMs = Date.now() - tOpen;
  ok(opened && acc3.forwards().length === 1 && acc3.forwards()[0].remotePort === ready.port, `the bridge's upgrade resolved the target through streamEndpointFor to a hub forward (ws open ${openMs} ms, forward 127.0.0.1:${acc3.forwards()[0] && acc3.forwards()[0].localPort} → dev-a:${ready.port})`, acc3.forwards());
  if (opened) {
    const tHello = Date.now();
    ws.send(frame(['hello', { ...P.helloCaps({ width: 800, height: 600, dpi: 96, uuid: `vs-remote-hub-${process.pid}`, layout: 'us' }), lz4: false, brotli: false, compression_level: 0 }]));
    const saw = (t) => pk.find(([, m]) => typeOf(m) === t);
    const h = await until(() => saw('hello'), 15000, 10);
    const nwp = await until(() => saw('new-window'), 15000, 10);
    ok(!!h && !!nwp, `a REAL xpra hello answered THROUGH THE BRIDGE in ${h ? h[0] - tHello : '—'} ms, the app's window announced`);
    const nw = nwp ? globalThis.rdecode(new Uint8Array(nwp[1].subarray(8))) : null;
    ws.send(frame(P.keyboardConfigPacket(['keyboard-config'], { layout: 'us' })));
    if (nw) { ws.send(frame(P.mapWindow(nw[1], { x: 0, y: 0, w: nw[4], h: nw[5] }))); ws.send(frame(P.focusPacket(nw[1]))); }
    await until(() => saw('draw'), 10000, 20);
    const rtts = [];
    for (let i = 0; i < 5; i++) { const n0 = pk.length; const tp = Date.now(); ws.send(frame(P.pingPacket(tp))); const e = await until(() => pk.slice(n0).find(([, m]) => typeOf(m) === 'ping_echo'), 5000, 1); if (e) rtts.push(e[0] - tp); await sleep(50); }
    ok(rtts.length === 5, `xpra ping → ping_echo through the bridge + forward: ${rtts.join(' / ')} ms (the input path's round trip)`, rtts);
    await sleep(200);
    const tKeys = Date.now();
    for (const kk of new P.ImeKeymap().plan('abc').keys) { ws.send(frame(P.keyAction(nw ? nw[1] : 1, kk, true))); ws.send(frame(P.keyAction(nw ? nw[1] : 1, kk, false))); }
    const typed = await until(() => { try { const t = fs.readFileSync(out, 'utf8'); return t.length >= 3 ? t : null; } catch { return null; } }, 8000, 5);
    const keyMs = Date.now() - tKeys;
    ok(typed === 'abc', `"abc" typed through the BRIDGE landed in the app's file on the device (${JSON.stringify(typed)}, ${keyMs} ms first key-action → third byte on disk)`);
    console.log(`  §8-7 (loopback device, through the hub bridge): launch→ready ${readyMs} ms, ws open ${openMs} ms, hello ${h ? h[0] - tHello : '—'} ms, ping RTT ${rtts.join('/')} ms, keystrokes→file ${keyMs} ms`);
    ws.close();
    const released = await until(() => (acc3.forwards().length === 0 ? true : null), 3000, 20);
    ok(released, 'the socket closed ⇒ the bridge released its forward reference (the listener is gone)', acc3.forwards());
  }
  // the machine stops answering ⇒ kept as unknown-host-offline, the bridge refuses (never a local connect)
  devUp = false;
  await hub.syncHost('dev-a');
  const off = hub.get(L.id);
  ok(off && off.state === 'unknown-host-offline' && off.lastKnownState === 'ready', 'the device stops answering ⇒ the record is KEPT as unknown-host-offline (the app runs on)', off && off.state);
  const code = await new Promise((r) => { const w2 = new WebSocket(url, ['binary']); w2.once('unexpected-response', (_q, res) => r(res.statusCode)); w2.once('open', () => { w2.close(); r('open'); }); w2.once('error', () => r('error')); });
  ok(code === 404, `the bridge refuses an offline machine's stream (${code}) — never a connect to the device's port number on THIS machine`);
  devUp = true;
  await hub.syncHost('dev-a');
  ok(hub.get(L.id).state === 'ready', 'the device answers again ⇒ ready (re-asked, never re-launched)');
  const sp = await hub.stop(L.id, { why: 'user' });
  ok(sp && sp.state === 'exited' && sp.stoppedBy === 'user' && sp.hostId === 'dev-a', 'stop through the hub keeper ⇒ exited on the device');
  await sleep(400);
  ok(markerPids(L.id).length === 0, 'nothing carries the session marker after the stop');
  hub.shutdown(); acc3.shutdown(); srv.close(); dm3.stop();
}

console.log('§8 the link dies MID-OP, and a long run past its deadline (C2 verify findings 1 + 3, a real daemon)');
{
  const MUT = mutantCopies('dsremote', REPO);
  const daemonPid = (h) => { try { return Number(fs.readFileSync(path.join(rootOf(h), 'state', 'agentd.pid'), 'utf8')); } catch { return null; } };
  /** An op IN FLIGHT when the daemon dies: SIGSTOP (the request is written, nobody reads it), prove it pending, SIGKILL
   *  (the socket closes ⇒ mux.onDead). → { e, ms, pendingBefore } */
  const midOp = async (dmX, ask) => {
    await dmX.connect();
    const pid = daemonPid(home3);
    process.kill(pid, 'SIGSTOP');
    const t = Date.now();
    const p = ask().then(() => null, (e) => e);
    await sleep(200);
    const pendingBefore = dmX._conn ? dmX._conn.pending.size : -1;
    process.kill(pid, 'SIGKILL');
    const e = await p;
    return { e, ms: Date.now() - t, pendingBefore };
  };
  const dm4 = deviceOn(home3);
  await dm4.connect();
  const acc4 = ACC.create({ hosts: hostsFor({ 'dev-m': dm4 }), install: false, log: { log() { }, warn() { } } });
  const warm = await acc4.call('dev-m', 'facts', {}).then((r) => r.ok, () => false);
  ok(warm, 'a healthy desktop-serve op answers first (the leg starts from a working link)');
  const r1 = await midOp(dm4, () => acc4.call('dev-m', 'windows', { id: 'da-nope' }));
  ok(r1.pendingBefore === 1 && r1.e && r1.e.code === 'host_unavailable' && /device link lost/.test(r1.e.message) && r1.ms < 2000, `a per-click op in flight when the device's link dies ⇒ host_unavailable in ${r1.ms} ms (was: the op's own 60 s timeout), naming the lost link`, r1.e && { code: r1.e.code, message: r1.e.message, pendingBefore: r1.pendingBefore });
  ok(!dm4._conn || dm4._conn.pending.size === 0, 'nothing is left pending on the dead connection');
  dm4.stop();
  // CONTROL: the pre-fix client (mux.onDead left conn.pending alone) waits out the request's own timeout — bounded here
  const clSrc = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf8');
  const fixLine = "              for (const r of pending.values()) { try { r({ error: 'device link lost', linkLost: true }); } catch { } }\n              pending.clear();\n";
  ok(clSrc.split(fixLine).length === 2, 'CONTROL setup: the in-flight reject is spelled once');
  const { DeviceManager: DMpre } = MUT.load('src/agentd/client.js', clSrc.replace(fixLine, '\n\n'), 'nopendingreject');
  process.env.HOME = home3; process.env.VIBESPACE_AGENTD_ROOT = rootOf(home3);
  const dmPre = new DMpre({ dataDir: path.join(home3, 'hub-data'), bundlePath: BUNDLE, version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
  const rc = await midOp(dmPre, () => dmPre._request({ op: 'desktop-serve', action: 'windows', params: { id: 'da-nope' }, timeoutMs: 2500 }));
  ok(rc.pendingBefore === 1 && rc.e && /timeout/.test(rc.e.message) && rc.ms >= 2400, `CONTROL: the pre-fix client answers only at the request's own timeout (${rc.ms} ms for a 2.5 s timeout; the product's is 60 s)`, rc.e && rc.e.message);
  dmPre.stop();
  // the run-stream belt is PER OP now, and the install rung's run outlives its own deadline (findings 3 + 4)
  const dm5 = deviceOn(home3);
  await dm5.connect();
  const tb = Date.now();
  const belt = await dm5.runStream('sh', ['-c', 'exec sleep 3'], { timeoutMs: 700 });
  const beltMs = Date.now() - tb;
  ok(belt && belt.timedOut === true && belt.code == null && beltMs < 2000, `run-stream honours the caller's timeoutMs over the real daemon (settled timedOut after ${beltMs} ms for 700 ms — the 120 s constant is only the default)`, belt);
  const acc5 = ACC.create({ hosts: hostsFor({ 'dev-m': dm5 }), install: false, log: { log() { }, warn() { } }, installMs: 1000, holdMs: 15000 });
  const pidf = path.join(work, 'install-child.pid');
  const got = [];
  const t5 = Date.now();
  const e5 = await acc5.runArgv('dev-m', ['sh', '-c', `echo $$ > '${pidf}'; echo started; exec sleep 3`], { onData: (d) => got.push(String(d)) }).then(() => null, (e) => e);
  const ms5 = Date.now() - t5;
  const cpid = Number(fs.readFileSync(pidf, 'utf8'));
  ok(e5 && e5.code === 'install_timeout' && !/exited/.test(e5.message) && ms5 < 2500 && got.join('').includes('started'), `a paired machine's run past installMs ⇒ install_timeout in ${ms5} ms, the log streamed until then — never "the install exited 1" at 120 s`, e5 && { code: e5.code, message: e5.message });
  ok(D.pidAlive(cpid), 'the child on the device is not killed (apt is waited out, never interrupted)');
  // (verify r2 F3/F4) the DEVICE's facts carry the slot: its state dir (the machine keeper's ~/.vibespace), the
  // detached install `installing` while it lives, its recorded exit once it ended — the real installState over the op
  const fr = (await acc5.call('dev-m', 'facts', { install: true })).install;
  ok(fr && fr.stateDir === path.join(home3, '.vibespace') && fr.installing && fr.installing.pid > 0 && fs.existsSync(path.join(home3, '.vibespace', 'xpra-install.log')), `the device's facts report the install running (installing {pid ${fr && fr.installing && fr.installing.pid}}) from ITS state dir, the log beside it`, fr && { stateDir: fr.stateDir, installing: fr.installing });
  const lockHeld = (K) => { try { require('child_process').execFileSync('flock', ['-n', K, 'true'], { stdio: 'ignore' }); return false; } catch { return true; } };
  ok(fr && fr.installing && typeof fr.installing.lock === 'string' && fr.installing.lock === lockPathOf(path.join(home3, '.vibespace')) && path.dirname(fr.installing.lock) === LOCKROOT && !fr.installing.lock.startsWith(XDG) && !fr.installing.lock.startsWith(home3) && lockHeld(fr.installing.lock), `(verify r4 + r5 L3) the device's install holds its lock on LOCAL storage, in the directory named by the daemon's UID — never under its $XDG_RUNTIME_DIR (a scratch dir here), never its state dir (installing.lock ${fr && fr.installing && fr.installing.lock}), held while it runs`, fr && fr.installing);
  const fe = await until(async () => { const x = (await acc5.call('dev-m', 'facts', { install: true })).install; return x && x.installing === null && x.lastInstall ? x : null; }, 6000, 200);
  ok(fe && fe.lastInstall.code === 0 && !D.pidAlive(cpid), 'it ends on its own; the device\'s facts then say gone, its exit recorded (0) — the evidence a held slot waits for', fe && fe.lastInstall);
  // (verify r2 F4) THE DAEMON DIES MID-INSTALL (its re-exec on every hub update, a machine restart of the agent): the
  // follower on the daemon's pipe goes with it — the install, detached, runs to its end; CONTROL: the pre-fix rung
  const daemonDies = async (accX, tag) => {
    const marker = path.join(work, `f4dev-${tag}.marker`);
    const p6 = accX.runArgv('dev-m', ['sh', '-c', `echo one; sleep 1.5; echo two; echo end > '${marker}'`], {}).then((r) => r, (e) => e);
    await sleep(600);
    killDaemon(home3);
    const r6 = await p6;
    const landed = await until(() => fs.existsSync(marker), tag === 'fix' ? 4000 : 2500, 100);
    return { code: r6 && (r6.code || (r6.message && r6.message.slice(0, 80))), landed: !!landed };
  };
  const d6 = await daemonDies(acc5, 'fix');
  ok(d6.code === 'install_link_lost' && d6.landed, `the device's daemon is SIGKILLed mid-install ⇒ install_link_lost for the follower, and the install runs to its END on the device (its marker landed)`, d6);
  const fd = (await acc5.call('dev-m', 'facts', { install: true })).install; // the reconnect spawned a new daemon
  ok(fd && fd.installing === null && fd.lastInstall && fd.lastInstall.code === 0, 'the NEW daemon\'s facts report the install gone with its exit recorded (0) — what a held slot waits for', fd && { installing: fd.installing, lastInstall: fd.lastInstall });
  const accSrc5 = fs.readFileSync(path.join(REPO, 'src/server/desktop-access.js'), 'utf8');
  const launchLine5 = '    const launch = M.installLauncherArgv(argv, { stateDir, mode });\n';
  ok(accSrc5.split(launchLine5).length === 2, 'CONTROL setup: the launcher wrap is spelled once');
  const AccPre5 = MUT.load('src/server/desktop-access.js', accSrc5.replace(launchLine5, '    const launch = argv;\n'), 'nolauncher5');
  const accPre5 = AccPre5.create({ hosts: hostsFor({ 'dev-m': dm5 }), install: false, log: { log() { }, warn() { } }, installMs: 10000, holdMs: 15000 });
  const d6pre = await daemonDies(accPre5, 'pre');
  ok(!d6pre.landed, 'CONTROL: the pre-fix rung (the install a child on the daemon\'s pipe) dies with the daemon — SIGPIPE at its next line, the marker never lands', d6pre);
  await dm5.connect();
  // THE HUB'S SIDE OF THE LINK DIES WITH A 4 MB PRODUCER IN FLIGHT (verify r2 F2): the daemon lives, its connection is
  // gone — the child's stdout was paused on the dead link's window and wedged for good (~440 KB in, still stuck after a
  // re-dial). Now it is resumed into ~/.vibespace/run-stream/<pid>.log and runs to its end.
  /** `stall` (verify r3 M2): the hub's loop is busy for 400 ms on the first chunk (no credit leaves), THEN the link is
   *  cut — the child is paused on window pressure AT the cut. `plant(logf, dir, pid)` runs just before the cut (the
   *  child's pid is known: it writes it first). A planted log that is not a regular file is never READ (a /dev/full
   *  symlink reads zeros forever). */
  const orphanLeg = async (dmX, h, tag, { stall = false, plant = null, lines = 1000, fast = false, waitMs = null } = {}) => {
    await dmX.connect();
    const prog = path.join(work, `${tag}-progress`), marker = path.join(work, `${tag}-marker`), pidfX = path.join(work, `${tag}-pid`);
    const script = `echo $$ > '${pidfX}'; i=0; line=$(head -c 4095 /dev/zero | tr '\\0' x); while [ $i -lt ${lines} ]; do echo "$line"; i=$((i+1)); ${fast ? '' : '[ $((i % 10)) -eq 0 ] && sleep 0.01; '}echo $i > '${prog}'; done; echo done > '${marker}'`;
    const logDir = path.join(h, '.vibespace', 'run-stream');
    const logOf = (pid) => path.join(logDir, `${pid}.log`);
    const plantNow = () => { if (!plant) return; const pid = Number(fs.readFileSync(pidfX, 'utf8')); fs.mkdirSync(logDir, { recursive: true, mode: 0o700 }); plant(logOf(pid), logDir, pid); };
    let got = 0, tCut = 0;
    const cut = () => { if (tCut) return; plantNow(); tCut = Date.now(); dmX._conn.mux.destroy(); }; // the hub's side only — the daemon is untouched
    const st = dmX.runStream('sh', ['-c', script], { onData: (b) => { got += b.length; if (stall && !tCut) { const t = Date.now(); while (Date.now() - t < 400) { /* the hub's loop is busy: no credit leaves */ } cut(); } }, timeoutMs: 60000 });
    if (!stall) { await until(() => fs.existsSync(pidfX), 3000, 20); await sleep(200); cut(); }
    const settled = await st;
    const gotAtCut = got;
    const landed = await until(() => fs.existsSync(marker), waitMs || (tag.startsWith('pre') ? 3000 : 10000), 100);
    const pid = Number(fs.readFileSync(pidfX, 'utf8')); orphanPids.add(pid);
    const line = (() => { try { return Number(fs.readFileSync(prog, 'utf8').trim()); } catch { return null; } })();
    const logf = logOf(pid);
    const isFile = () => { try { return fs.lstatSync(logf).isFile(); } catch { return false; } };
    if (isFile()) await until(() => { try { return /ended: exit 0/.test(fs.readFileSync(logf, 'utf8')); } catch { return false; } }, tag === 'pre' ? 10 : 3000, 50);
    let logText = null; if (isFile()) { try { logText = fs.readFileSync(logf, 'utf8'); } catch { logText = null; } }
    return { settled, gotAtCut, landed: !!landed, ms: Date.now() - tCut, pid, alive: D.pidAlive(pid), line, logBytes: logText ? Buffer.byteLength(logText) : 0, logText, logEnds: !!(logText && /ended: exit 0\s*$/.test(logText)), logHead: !!(logText && /the hub's link was lost/.test(logText)) };
  };
  const o1 = await orphanLeg(dm5, home3, 'fix');
  ok(o1.settled && o1.settled.error === 'device link lost' && o1.gotAtCut > 0 && o1.gotAtCut < 4096000, `the link died MID-stream (the hub had ${o1.gotAtCut} of 4 096 000 bytes; the stream settled "${o1.settled && o1.settled.error}")`, o1);
  ok(o1.landed && !o1.alive, `the orphaned producer runs to its END: its marker landed ${o1.ms} ms after the cut (≤ 10 s), the process gone`, o1);
  ok(o1.logHead && o1.logEnds && o1.logBytes > 1000000, `the rest of its output is in ~/.vibespace/run-stream/<pid>.log (${o1.logBytes} bytes, a header naming the lost link, the exit at its end)`, { logBytes: o1.logBytes, logHead: o1.logHead, logEnds: o1.logEnds });
  // (verify r3 M2) THE LOG CANNOT BE WRITTEN and the child is PAUSED at the cut (the hub's consumer stalled): a Writable
  // that errors never emits 'drain' — the child paused on it stayed paused for good. <pid>.log planted as a symlink to
  // /dev/full (ENOSPC on the first write): the child must still run to its end.
  const devFull = (logf) => fs.symlinkSync('/dev/full', logf);
  const m2 = await orphanLeg(dm5, home3, 'fix-enospc', { stall: true, plant: devFull, lines: 4000, fast: true });
  ok(m2.landed && !m2.alive && m2.line === 4000 && m2.ms <= 10000, `the log cannot be written (<pid>.log → /dev/full) and the child was paused at the cut ⇒ it still runs to its END: marker ${m2.ms} ms after the cut, line ${m2.line} of 4000, the process gone`, { landed: m2.landed, ms: m2.ms, line: m2.line, alive: m2.alive });
  // (verify r3 L6) THE CAP IS PER FILE: a pid wrap appends to an existing <pid>.log — a full one (8 MiB + its two marker
  // lines, a previous process's) takes only this orphan's marker lines, never another 8 MiB
  const fullLog = (logf) => { fs.writeFileSync(logf, Buffer.alloc(8 * 1024 * 1024, 0x79)); fs.appendFileSync(logf, '\n[vibespace-agentd 2026-09-24T00:00:00.000Z] log capped at 8388608 bytes — output past this point is dropped\n[vibespace-agentd 2026-09-24T00:00:01.000Z] pid 1 ended: exit 0\n'); };
  const plantedBytes = 8 * 1024 * 1024 + Buffer.byteLength('\n[vibespace-agentd 2026-09-24T00:00:00.000Z] log capped at 8388608 bytes — output past this point is dropped\n[vibespace-agentd 2026-09-24T00:00:01.000Z] pid 1 ended: exit 0\n');
  const l6 = await orphanLeg(dm5, home3, 'fix-full', { plant: fullLog, lines: 2000 });
  ok(l6.landed && l6.logBytes > plantedBytes && l6.logBytes - plantedBytes < 1024 && !/x{64}/.test(l6.logText || '') && /this file is at its 8388608-byte cap/.test(l6.logText || '') && l6.logEnds, `a full <pid>.log from a previous process (pid wrap) ⇒ the orphan adds only its marker lines (+${l6.logBytes - plantedBytes} bytes on ${plantedBytes}, none of its output), saying the file is at its cap; the child still ran to its end`, { landed: l6.landed, logBytes: l6.logBytes, plantedBytes });
  dm5.stop(); killDaemon(home3);
  // CONTROL: the pre-fix daemon (the bundle without the orphan resume) leaves the same producer PAUSED for good
  const bText = fs.readFileSync(BUNDLE, 'utf8');
  const orphanLine = 'for (const rec of streamChans.values()) orphanRunStream(rec, reason);';
  ok(bText.split(orphanLine).length === 2, 'CONTROL setup: the bundle spells the orphan resume once');
  fs.mkdirSync(copyDir, { recursive: true });
  const preBundle = path.join(copyDir, 'vibespace-agentd-noorphan.js');
  fs.writeFileSync(preBundle, bText.replace(orphanLine, ''));
  const dmPre2 = deviceOn(home4, preBundle);
  const o2 = await orphanLeg(dmPre2, home4, 'pre');
  const line2 = o2.line; await sleep(600);
  const line3 = (() => { try { return Number(fs.readFileSync(path.join(work, 'pre-progress'), 'utf8').trim()); } catch { return null; } })();
  ok(!o2.landed && o2.alive && line2 != null && line2 < 1000 && line3 === line2 && o2.logBytes === 0, `CONTROL: the pre-fix daemon leaves the producer PAUSED — alive, its marker absent 3 s after the cut, frozen at line ${line2} of 1000 (still ${line3} later), no log`, o2);
  dmPre2.stop(); killDaemon(home4);
  // (verify r3) the two new controls — pre-fix bundles written through scripts/mutant-copy.mjs (`selfPath`: the daemon
  // copy keeps its own __filename; only `require` resolves beside the real bundle)
  const m2Err = '      out.on("error", () => {\n        out = null;\n        resumeChild();\n      });\n';
  const m2Arm = '      w.on("error", go);\n      w.on("close", go);\n';
  const l6Seed = '      try {\n        const st0 = fs.statSync(file);\n        if (st0.isFile()) written = st0.size;\n      } catch {\n      }\n';
  ok([m2Err, m2Arm, l6Seed].every((x) => bText.split(x).length === 2), 'CONTROL setup: the bundle spells the errored-log resume, the drain/error/close arming and the per-file seed once each');
  const preM2 = MUT.write('data/bin/vibespace-agentd.js', bText.replace(m2Err, '      out.on("error", () => {\n        out = null;\n      });\n').replace(m2Arm, ''), 'prem2', { selfPath: true });
  const dmPre5 = deviceOn(home5, preM2);
  const c2 = await orphanLeg(dmPre5, home5, 'pre-enospc', { stall: true, plant: devFull, lines: 4000, fast: true, waitMs: 6000 });
  ok(!c2.landed && c2.alive && c2.line != null && c2.line < 4000, `CONTROL: the pre-fix bundle (resume on 'drain' only, an errored log never resumes) leaves the child FROZEN — alive, marker absent 6 s after the cut, stuck at line ${c2.line} of 4000`, { landed: c2.landed, alive: c2.alive, line: c2.line });
  dmPre5.stop(); killDaemon(home5);
  const preL6 = MUT.write('data/bin/vibespace-agentd.js', bText.replace(l6Seed, ''), 'prel6', { selfPath: true });
  const dmPre6 = deviceOn(home6, preL6);
  const c6 = await orphanLeg(dmPre6, home6, 'pre-full', { plant: fullLog, lines: 2000, waitMs: 10000 });
  ok(c6.landed && c6.logBytes - plantedBytes > 1024 * 1024, `CONTROL: the pre-fix bundle (the cap per orphan event) appends up to another 8 MiB to a full <pid>.log (+${c6.logBytes - plantedBytes} bytes on ${plantedBytes})`, { landed: c6.landed, logBytes: c6.logBytes });
  dmPre6.stop(); killDaemon(home6);
  for (const r of copiesCensus(MUT.files, MUT.dir, REPO, { minCopies: 3 })) ok(r.pass, '§tree ' + r.name + (r.pass ? '' : ' — ' + r.detail));
}
process.env.HOME = realHome;

console.log(fail ? `\n${fail} FAILED (${pass} passed, ${skipped} skipped)` : `\nALL PASS (${pass}${skipped ? `, ${skipped} skipped` : ''})`);
process.exit(fail ? 1 : 0);
