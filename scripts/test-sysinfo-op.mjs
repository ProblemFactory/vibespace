#!/usr/bin/env node
// The sysinfo device op (2.314.0, CS separation): local and remote machine
// snapshots share ONE implementation (src/sysinfo.js) — the daemon bundles it
// and runs it where the facts live. This was a missed twin-set: the local
// panel and the ssh script each interpreted "used memory" separately, and the
// interpretations DRIFTED (the false-100% incident: raw memory.current vs
// working set). Pins: (1) the op returns the module's own shape byte-
// compatible with the local read; (2) the capability gates an old daemon;
// (3) the ssh-script fallback's parse still yields the same field names.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sysop-'));
process.env.HOME = home;
process.env.VIBESPACE_AGENTD_ROOT = path.join(home, 'agentd-root');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sysop-data-'));

const { DeviceManager } = require(REPO + '/src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
await dm.connect();

// 1. capability advertised + op works against a REAL daemon
const conn = await dm.connect();
ok(conn.info?.capabilities?.includes?.('sysinfo'), 'daemon advertises the sysinfo capability');
const r = await dm.sysinfo();
ok(r && r.mem && Number.isFinite(r.mem.used) && Number.isFinite(r.mem.limit), `op returns mem used/limit (${Math.round((r?.mem?.used || 0) / 1048576)}M / ${Math.round((r?.mem?.limit || 0) / 1073741824)}Gi)`);
ok(Number.isFinite(r.mem.pct), 'mem.pct computed');
ok(Array.isArray(r.load) && r.load.length === 3, 'loadavg triple');
ok(Number.isFinite(r.cpus) && r.cpus > 0, 'cpu count');
ok(Array.isArray(r.procs) && r.procs.length > 0 && r.procs.every((p) => p.pid && Number.isFinite(p.rss)), 'top procs with pid+rss');

// 2. SAME implementation: the op's numbers come from the module the server
// itself runs — mem.limit must agree exactly (same cgroup/host source).
const sysinfo = require(REPO + '/src/sysinfo.js');
const local = await sysinfo.read(process.cwd());
ok(r.mem.limit === local.mem.limit, `op limit === local module limit (one source: ${r.mem.source})`);
ok(r.mem.source === local.mem.source, `same source tag both sides (${r.mem.source})`);

// 3. drift guard: the ssh fallback script must keep producing the SAME field
// names the route serves, or a daemon-less host silently changes shape.
const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf-8');
ok(/REMOTE_SYSINFO_SCRIPT[\s\S]{0,200}FALLBACK RUNG/i.test(srv) || /fallback rung/i.test(srv.slice(srv.indexOf('REMOTE_SYSINFO_SCRIPT') - 800, srv.indexOf('REMOTE_SYSINFO_SCRIPT'))), 'script is documented as the fallback rung');
ok(/dm\.sysinfo\(\)/.test(srv), 'remoteSysinfo tries the device op first');
const cli = fs.readFileSync(path.join(REPO, 'src/agentd/client.js'), 'utf-8');
ok(/daemon lacks sysinfo \(capabilities gate\)/.test(cli), 'client refuses old daemons via the capability gate');

try { await dm.stop?.(); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
