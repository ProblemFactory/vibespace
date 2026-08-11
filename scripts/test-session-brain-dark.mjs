#!/usr/bin/env node
// SESSION-BRAIN STEP 2 (dark double-feed) against a REAL daemon.
// Pins: (1) the daemon's device-side normalizer stream emits ops for a live
// pipe session's stdout; (2) those ops' CREATE mids are IDENTICAL to what the
// server's own normalizer derives from the same bytes (R0 content-derived
// mids — the whole reason step 3 can ever be trusted); (3) the stream starts
// at NOW (no history replay); (4) codex/exited sessions are skipped.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sb-'));
process.env.HOME = home;
process.env.VIBESPACE_AGENTD_ROOT = path.join(home, 'agentd-root');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-sb-data-'));
const { DeviceManager } = require(REPO + '/src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
await dm.connect();

// live pipe session = a script that emits stream-json records slowly
const SID = 'sb-test-1';
const emitter = path.join(home, 'emit.js');
const rec = (i) => [JSON.stringify({
  type: 'assistant', timestamp: new Date().toISOString(),
  message: { id: 'msg_sb_' + i, model: 'claude-fable-5', role: 'assistant', content: [{ type: 'text', text: 'hello ' + i }], usage: { input_tokens: 10, output_tokens: 5 } },
}), JSON.stringify({ type: 'result', subtype: 'success', timestamp: new Date().toISOString() })].join('\n');
fs.writeFileSync(emitter, `
const recs = ${JSON.stringify([1, 2, 3].map(rec))};
let i = 0;
// wait past the daemon tailer's first tick (1s cadence) so start-at-NOW
// registers BEFORE any record is written — production attaches replay
// history from the transcript, the live stream deliberately does not
setTimeout(() => {
  const t = setInterval(() => { if (i >= recs.length) { clearInterval(t); setTimeout(() => process.exit(0), 8000); return; } console.log(recs[i++]); }, 400);
}, 2500);
`);

const batches = [];
await dm.watchSessionEvents((m) => batches.push(m));
await dm.openPipeSession({ sid: SID, cmd: process.execPath, args: [emitter], cwd: home });
await new Promise((r) => setTimeout(r, 9000));

const events = batches.filter((b) => b.sid === SID).flatMap((b) => b.batch.map((x) => JSON.parse(x)));
console.log('EVENT SAMPLE:', JSON.stringify(events.slice(0, 6).map((e) => ({ op: e.op, id: e.msg?.id || e.id, role: e.msg?.role }))));
const creates = events.filter((e) => e.op === 'create');
ok(batches.length > 0, `device stream delivered batches (${batches.length})`);
ok(creates.length >= 3, `normalized create ops for all 3 records (${creates.length})`);

// PARITY: server-side normalizer over the same bytes → identical mids
const { createMessageManager } = require(REPO + '/src/normalizers.js');
const mm = createMessageManager('claude', SID);
const serverOps = [];
mm.onOp((op) => serverOps.push(op));
for (let i = 1; i <= 3; i++) for (const ln of rec(i).split('\n')) mm.processLive(JSON.parse(ln));
const core = (id) => { const x = String(id); const i2 = x.indexOf(':'); return i2 >= 0 ? x.slice(i2 + 1) : x; };
const devMids = creates.map((e) => core(e.msg?.id)).filter(Boolean).sort();
const srvMids = serverOps.filter((o) => o.op === 'create').map((o) => core(o.msg?.id)).filter(Boolean).sort();
ok(devMids.length >= 3 && devMids.length === srvMids.length && devMids.every((m, i) => m === srvMids[i]),
  `PARITY: device mids === server mids over the same bytes (${devMids.length} each)`);

// dead sessions are dropped from the tail set (no leak): kill and wait a tick
try { await dm.killPipeSession(SID); } catch { }
await new Promise((r) => setTimeout(r, 1500));
const before = batches.length;
await new Promise((r) => setTimeout(r, 1500));
ok(batches.length === before, 'no batches after the session exits');

try { const lg = (await import('node:fs')).readdirSync(process.env.VIBESPACE_AGENTD_ROOT).filter(f=>/log|out/.test(f)); for (const f of lg) console.log('--- daemon ' + f + ' ---\n' + (await import('node:fs')).readFileSync(process.env.VIBESPACE_AGENTD_ROOT + '/' + f, 'utf8').split('\n').slice(-25).join('\n')); } catch (e) { console.log('log read:', e.message); }
try { await dm.stop?.(); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
