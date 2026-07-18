#!/usr/bin/env node
// Big-transfer integrity over the device plane (2.187.0). The mux control
// channel is credit-EXEMPT, so fs-done / stream-exit could OVERTAKE data still
// queued behind the 256KB credit window — fsReadRange resolved with exactly
// INITIAL_WINDOW bytes for any bigger read (real incident: a 45MB remote
// transcript cached as a 256KB prefix and stamped complete → permanently
// ancient chat history), and runStream dropped the queued stdout tail of a
// fast-exiting producer (usage scans, streamed downloads). Both are now
// COUNT-GATED. Run: node scripts/test-agentd-bigread.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-bigread-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(tmp, 'agentd');
process.env.VIBESPACE_NODE_MODULES = path.join(repo, 'node_modules');
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', `--outfile=${bundle}`], { cwd: repo });

const { DeviceManager } = require('../src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
dm.installLocal();
await dm.connect();

try {
  // a 3MB random file — far past the 256KB credit window
  const big = path.join(tmp, 'big.bin');
  const content = crypto.randomBytes(3 * 1024 * 1024);
  fs.writeFileSync(big, content);

  // 1) full-range read must return EVERY byte (old code: exactly 262144)
  const whole = await dm.fsReadRange(big, 0, content.length);
  check('fsReadRange returns the FULL range past the credit window',
    whole.data.length === content.length, `got ${whole.data.length} of ${content.length}`);
  check('full-range bytes are intact', sha(whole.data) === sha(content));

  // 2) mid-file delta (the transcript-slab shape)
  const OFF = 1024 * 1024;
  const delta = await dm.fsReadRange(big, OFF, content.length - OFF);
  check('delta read returns the full remainder', delta.data.length === content.length - OFF, String(delta.data.length));
  check('delta bytes match the slice', sha(delta.data) === sha(content.subarray(OFF)));

  // 3) runStream: `cat` writes 3MB and exits immediately — the exact
  //    stream-exit-overtakes-queued-stdout scenario
  const chunks = [];
  const r = await dm.runStream('cat', [big], { onData: (b) => chunks.push(b) });
  const streamed = Buffer.concat(chunks);
  check('runStream exits 0 without truncation flag', r.code === 0 && !r.truncated, JSON.stringify(r));
  check('runStream delivers ALL stdout of a fast-exiting producer',
    streamed.length === content.length, `got ${streamed.length} of ${content.length}`);
  check('streamed bytes are intact', sha(streamed) === sha(content));

  // 4) small read still fine (the common path)
  const small = await dm.fsReadRange(big, 0, 1000);
  check('small read unchanged', small.data.length === 1000 && small.data.equals(content.subarray(0, 1000)));

  // 5) read-range on a missing file rejects (no hang)
  let errMsg = '';
  try { await dm.fsReadRange(path.join(tmp, 'nope.bin'), 0, 10); } catch (e) { errMsg = e.message; }
  check('missing-file read rejects instead of hanging', !!errMsg, errMsg);
} catch (e) {
  failed++; console.error('  ✗ threw:', e.stack || e.message);
} finally {
  dm.stop();
  try { const pid = Number(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf8')); process.kill(pid, 'SIGTERM'); } catch {}
  await sleep(200);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
console.log(failed ? `\n${failed} FAILED` : '\nagentd big-read integrity test passed');
process.exit(failed ? 1 : 0);
