#!/usr/bin/env node
// AGENTD UPGRADE CONVERGENCE (2.330.0, after an 8-hour real incident).
// Two independent defenses, both pinned here:
//   1. the version a daemon is expected to report is the one baked into the
//      BUNDLE WE SHIP — comparing against the server's package version makes
//      the check unsatisfiable whenever the repo was rebuilt without a restart
//      (or restarted without a rebuild), which is a normal state during dev
//      AND for a few seconds of every update.sh run;
//   2. a bounded retry: an upgrade that does not move the reported version can
//      never converge, so after 3 attempts the link is KEPT and the failure is
//      announced. Silent infinite retry drove RSS to 20GB with no error line.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DeviceManager } = require('../src/agentd/client.js');
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + JSON.stringify(e) : '')); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-upg-'));
try {
  const bundle = path.join(tmp, 'agentd.js');
  fs.writeFileSync(bundle, 'x'.repeat(500) + '\nmodule.exports = { VERSION: "9.9.9" };\n');
  const dm = new DeviceManager({ dataDir: tmp, bundlePath: bundle, version: '1.1.1', log: () => {} });

  ok(dm._expectedVersion() === '9.9.9', 'expected version comes from the BUNDLE, not package.json', dm._expectedVersion());
  // cache invalidates on a rebuild (mtime+size key)
  fs.writeFileSync(bundle, 'y'.repeat(600) + '\nmodule.exports = { VERSION: "9.9.10" };\n');
  ok(dm._expectedVersion() === '9.9.10', 'a rebuilt bundle is picked up (cache keyed by mtime+size)', dm._expectedVersion());
  // unreadable/marker-less bundle falls back to the package version, never throws
  fs.writeFileSync(bundle, 'no marker here');
  ok(dm._expectedVersion() === '1.1.1', 'marker-less bundle falls back to the package version');
  fs.rmSync(bundle);
  ok(dm._expectedVersion() === '1.1.1', 'missing bundle never throws');

  // the loop breaker is a pure counter decision — model the gate exactly as
  // written in client.js so the bound cannot silently regress
  const gate = (reported, expected, tries) => {
    if (reported !== expected && tries > 2) return 'give-up';
    if (reported !== expected) return 'upgrade';
    return 'ok';
  };
  ok(gate('2.284.3', '2.329.0', 0) === 'upgrade', 'first mismatch upgrades');
  ok(gate('2.284.3', '2.329.0', 2) === 'upgrade', 'attempts 1-3 upgrade');
  ok(gate('2.284.3', '2.329.0', 3) === 'give-up', 'after 3 failed attempts it GIVES UP (bounded, never spins)');
  ok(gate('2.329.0', '2.329.0', 9) === 'ok', 'a matching daemon is accepted regardless of past attempts');

  // the incident's exact shape: bundle 2.329.0 shipped by a 2.322.0 server —
  // with the old comparison this NEVER converges even on a healthy daemon
  const incidentBundle = path.join(tmp, 'b2.js');
  fs.writeFileSync(incidentBundle, 'module.exports = { VERSION: "2.329.0" };\n');
  const dm2 = new DeviceManager({ dataDir: tmp, bundlePath: incidentBundle, version: '2.322.0', log: () => {} });
  ok(gate('2.329.0', dm2._expectedVersion(), 0) === 'ok',
    'INCIDENT SHAPE: a daemon running the shipped bundle is accepted by an older server (was: infinite upgrade loop)');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── verify-r1 C1 (2026-09-28): THE LEDGER — the breaker's count must outlive the DeviceManager instance, because the
// dial path REBUILDS the instance on every fresh stream (measured on a real daemon: 180 upgrades in 45 s once the
// handshake ran on every dial-in). A fake daemon over the REAL Mux that never moves its reported version; four
// "dial-ins", each a fresh DeviceManager the way deviceForDial rebuilds one; ONE ledger shared ⇒ ≤ 3 upgrades and
// the fourth link is KEPT. Control: the same four without a ledger ⇒ four upgrades (the pre-fix shape). ──
console.log('— the ledger across rebuilt instances (a fake never-converging daemon over the real Mux) —');
{
  const net = await import('node:net');
  const { Mux, PROTO_VERSION } = require('../src/agentd/mux.js');
  const { create } = require('../src/server/dial-pairing.js');
  const t2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-upg-ledger-'));
  const bundle = path.join(t2, 'agentd.js');
  // the marker PAST 400 000 bytes — where the real bundle has it (byte 1 076 247 of 1.6 MB); the reader must find it
  fs.writeFileSync(bundle, '/*' + 'x'.repeat(450000) + '*/\nmodule.exports = { VERSION: "9.9.9" };\n');
  let upgrades = 0; const upgradeVersions = [];
  const srv = net.createServer((sock) => {
    let expect = 0, got = 0;
    const mux = new Mux(sock, {
      onControl: (m) => {
        if (m.op === 'hello') mux.control({ op: 'hello-ack', protoVersion: PROTO_VERSION, daemonVersion: '0.0.1', capabilities: [] });
        if (m.op === 'upgrade') { upgrades++; upgradeVersions.push(m.version); expect = m.size; got = 0; }
      },
      onData: (chan, buf) => { got += buf.length; mux.credit(chan, buf.length); if (expect && got >= expect) { mux.control({ op: 'upgrade-done' }); expect = 0; setTimeout(() => sock.destroy(), 50); } },
      onDead: () => {},
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const dialIn = () => new Promise((res, rej) => { const s = net.connect(port, '127.0.0.1'); s.on('connect', () => res(s)); s.on('error', rej); });
  const run = async (ledger, tag) => {
    upgrades = 0; upgradeVersions.length = 0;
    const outcomes = [];
    for (let i = 0; i < 4; i++) {
      const stream = await dialIn();
      let live = stream;
      // an upgrading instance's link ENDS (the fake daemon destroys it after upgrade-done) — `pending` is judged on
      // that close, the 1.5 s cap is only the never-closes guard (a fixed 1.5 s wait × 7 instances was 10.5 s)
      const ended = new Promise((res) => stream.on('close', () => { live = null; setTimeout(() => res('pending'), 30); }));
      const dm = new DeviceManager({ dataDir: t2, bundlePath: bundle, version: '1.1.1', log: () => {}, transport: { kind: 'stream', hostToken: 'vsht_x', getStream: () => live }, ...(ledger ? { upgradeLedger: ledger } : {}) });
      const r = await Promise.race([dm.connect().then(() => 'connected'), ended, new Promise((res) => setTimeout(() => res('pending'), 1500))]);
      outcomes.push(r);
      dm.stop(); // deviceForDial's stale-stream rebuild: the next dial-in gets a NEW instance
      try { stream.destroy(); } catch { }
    }
    return { upgrades, outcomes, versions: [...upgradeVersions] };
  };
  const ledger = create({ rootDir: t2, AGENTD_DIR: t2, agentdHostToken: () => 'x', getHosts: () => null, getMounts: () => null, getMachineMounts: () => null, getPortForwards: () => null, getExitProxy: () => null }).upgradeLedgerFor('devL');
  const withLedger = await run(ledger, 'ledger');
  ok(withLedger.upgrades === 3 && withLedger.outcomes[3] === 'connected', `WITH the per-device ledger four rebuilt instances make 3 upgrade attempts, then the fourth link is KEPT (${JSON.stringify(withLedger)})`);
  ok(withLedger.versions.every((v) => v === '9.9.9'), `the upgrade op names the BUNDLE's version (9.9.9 — what the re-exec'd daemon will report), never the package's 1.1.1 (${JSON.stringify(withLedger.versions)})`);
  const control = await run(null, 'noledger');
  ok(control.upgrades === 4, `CONTROL: the same four instances WITHOUT a ledger upgrade four times — the unbounded pre-fix shape (${control.upgrades})`);
  // the marker past 400 000 bytes is what `expected` reads (the whole file), so 9.9.9 — not the package version
  const dmv = new DeviceManager({ dataDir: t2, bundlePath: bundle, version: '1.1.1', log: () => {} });
  ok(dmv._expectedVersion() === '9.9.9', 'the marker is found wherever esbuild put it (past the first 400 000 bytes)');
  // a given-up device is retried only after the stated window (the ledger's decay), and a rebuilt bundle starts over
  const DP2 = create({ rootDir: t2, AGENTD_DIR: t2, agentdHostToken: () => 'x', getHosts: () => null, getMounts: () => null, getMachineMounts: () => null, getPortForwards: () => null, getExitProxy: () => null });
  let clock = 1000; const L2 = DP2.upgradeLedgerFor('devD', () => clock);
  L2.set('9.9.9', { tries: 3, gaveUp: true });
  ok(L2.get('9.9.9')?.gaveUp === true && L2.get('9.9.10') === null, 'the ledger answers for ITS bundle version only (a rebuilt bundle starts over)');
  clock += DP2.UPGRADE_RETRY_AFTER_MS - 1;
  ok(L2.get('9.9.9')?.gaveUp === true, 'a given-up device stays given up inside the retry window');
  clock += 1;
  ok(L2.get('9.9.9') === null, `after UPGRADE_RETRY_AFTER_MS (${DP2.UPGRADE_RETRY_AFTER_MS / 60000} min) it gets another bounded run`);
  // WIRING PIN (feedback: a pure fix whose call site is not staged is dead for 24 versions): deviceForDial builds
  // its DeviceManager WITH the per-device ledger, and the loop breaker reads through the ledger accessors
  const dpSrc = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../src/server/dial-pairing.js'), 'utf8');
  const clSrc = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../src/agentd/client.js'), 'utf8');
  ok(/upgradeLedger: upgradeLedgerFor\(deviceId\)/.test(dpSrc), 'WIRING: deviceForDial constructs its DeviceManager with upgradeLedgerFor(deviceId)');
  ok(/const led = this\._ledgerRead\(expected\);/.test(clSrc) && /led\.tries \+= 1; this\._ledgerWrite\(expected, led\);/.test(clSrc), 'WIRING: the hello-ack loop breaker counts through _ledgerRead / _ledgerWrite (never the bare instance field)');
  ok(/op: 'upgrade', version: this\._expectedVersion\(\)/.test(clSrc), 'WIRING: the upgrade op carries _expectedVersion() (the bundle\'s), not this._version');
  srv.close();
  fs.rmSync(t2, { recursive: true, force: true });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
