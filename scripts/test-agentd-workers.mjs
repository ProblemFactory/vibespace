#!/usr/bin/env node
// R2 — daemon worker isolation (docs/design-three-tier.md).
//
// THE INVARIANT: a hung filesystem path (dead FUSE mount class) may starve a
// WORKER — which the pool then deadlines, terminates and respawns — but can
// never starve the daemon loop that keeps every session pipe alive. This
// drives a REAL daemon: a read on a FIFO with no writer blocks the sync open
// forever; the op must come back as a deadline ERROR while the daemon keeps
// answering other ops THROUGHOUT, and fs ops must work again afterwards
// (worker respawned). Also pins the id-leak regression found while building
// this: the pool job id must never overwrite the mux request id (the two id
// spaces happened to align until unrelated ops skewed them — ops then hung).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-r2w-'));
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir);
process.env.VIBESPACE_AGENTD_ROOT = path.join(tmp, 'agentd');
const { DeviceManager } = require(REPO + '/src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
await dm.connect();

// ── id-skew guard first: burn mux ids with NON-fs ops, then do fs ops ──
const srv = net.createServer((s) => s.pipe(s));
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
await dm.tcpForward(srv.address().port);
try { await dm.tcpForward(1); } catch { }
const p1 = path.join(tmp, 'skew.txt');
await dm.fsWrite(p1, 'post-skew');
const rr1 = await dm.fsReadRange(p1, 0, 64);
ok(rr1.data.toString() === 'post-skew', 'fs ops answer correctly AFTER unrelated ops skewed the id spaces (the id-leak regression)');

// ── the hang: a FIFO with no writer blocks the worker's sync open ──
const fifo = path.join(tmp, 'hang.fifo');
execFileSync('mkfifo', [fifo]);
const t0 = Date.now();
let hangErr = null;
const hungOp = dm.fsReadRange(fifo, 0, 10).catch((e) => { hangErr = e; });

// while the op is stuck, the daemon must keep answering EVERYTHING else
await new Promise((r) => setTimeout(r, 1500));
const mid = await dm.runCmd('echo', ['alive']);
ok(mid.stdout.trim() === 'alive', 'daemon answers run-cmd WHILE an fs op is wedged on the FIFO');
const midProbe = await dm.probeCli();
ok(!!midProbe?.facts, 'daemon answers probe ops mid-hang (session-pipe loop never starved)');
const p2 = path.join(tmp, 'during.txt');
await dm.fsWrite(p2, 'during-hang');
ok(fs.readFileSync(p2, 'utf8') === 'during-hang', 'OTHER fs ops complete mid-hang (second worker serves them)');

await hungOp;
const took = Date.now() - t0;
ok(!!hangErr && /deadline/.test(hangErr.message), `the wedged op surfaces as a DEADLINE error (${hangErr && hangErr.message})`);
ok(took < 25000, `deadline fired in bounded time (${(took / 1000).toFixed(1)}s), not a 30s+ transport timeout`);

// ── self-heal: the terminated worker respawns; fs ops keep working ──
await new Promise((r) => setTimeout(r, 800));
const p3 = path.join(tmp, 'after.txt');
await dm.fsWrite(p3, 'healed');
const rr3 = await dm.fsReadRange(p3, 0, 64);
ok(rr3.data.toString() === 'healed', 'pool self-heals after terminating the wedged worker');

srv.close();
try { const pid = parseInt(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8')); if (pid) process.kill(pid); } catch { }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
