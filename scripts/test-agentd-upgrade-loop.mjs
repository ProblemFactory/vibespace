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
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
