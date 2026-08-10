#!/usr/bin/env node
// Device #0 is REACHABLE (CS separation keystone, 2.276.0 — live proof).
//
// hosts.device(falsy) returning the local DeviceManager is what lets every
// consumer be written once. test-writer-sweep proves the consumer logic with
// fakes; THIS test proves the actual chain — a real daemon on a real unix
// socket, resolved through hosts.deviceBounded(null), running a real command
// — because 2.276.0 routed a destructive SIGTERM sweep through this handle
// and an unverified keystone is how "local never had the sweep" repeats
// with the opposite sign.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

// throwaway root + dataDir (never the user's real ~/.vibespace or data/):
// construct device #0 EXACTLY as server.js does — the DeviceManager's local
// transport provisions and spawns its own daemon under VIBESPACE_AGENTD_ROOT.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dev0-'));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-dev0-data-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(root, 'agentd');
const { DeviceManager } = require(path.join(REPO, 'src/agentd/client.js'));
const dm = new DeviceManager({
  dataDir,
  bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'),
  version: require(path.join(REPO, 'package.json')).version,
  nodeModules: path.join(REPO, 'node_modules'),
  log: () => { },
});
await dm.connect();

// a hosts-like object EXACTLY as server.js wires it (setLocalDevice at boot)
const { HostManager } = require(path.join(REPO, 'src/hosts.js'));
const hosts = Object.create(HostManager.prototype);
hosts._localDevice = null;
hosts.setLocalDevice(dm);

// ── the keystone: falsy hostId resolves device #0 through the SAME API ──
const viaNull = await hosts.device(null);
const viaLocal = await hosts.device('local');
const viaBounded = await hosts.deviceBounded(null, 5000);
ok(viaNull === dm && viaLocal === dm && viaBounded === dm, "device(null) / device('local') / deviceBounded(null) all resolve device #0");

const r = await viaBounded.runCmd('sh', ['-c', 'echo dev0-$((6*7))'], { timeoutMs: 8000 });
ok(String(r?.stdout || '').includes('dev0-42'), 'runCmd over the local unix socket executes for real');

// fs ops — the same op surface every remote consumer uses
const p = path.join(root, 'probe.txt');
await viaBounded.fsWrite(p, Buffer.from('one surface'));
const rd = await viaBounded.fsReadRange(p, 0, 1024);
ok(rd?.data?.toString() === 'one surface', 'fsWrite + fsReadRange round-trip on device #0');

// discovery-snapshot answers too (2.278.0 shared facts run HERE for dial devices)
const snap = await viaBounded.discoverySnapshot();
ok(snap && Array.isArray(snap.locks) && Array.isArray(snap.jsonls), 'discovery-snapshot serves from the same daemon');

// honesty when device #0 is absent: throw, never a silent pretend-machine
hosts.setLocalDevice(null);
let threw = null;
try { await hosts.device(null); } catch (e) { threw = e; }
ok(threw && /local device/.test(threw.message), 'no local daemon ⇒ device(null) throws (callers keep their legacy fallback)');

try { dm.stop?.(); } catch { }
try {
  const pidF = path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid');
  const pid = parseInt(fs.readFileSync(pidF, 'utf-8')); if (pid) process.kill(pid);
} catch { }
fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
