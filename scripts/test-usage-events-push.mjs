#!/usr/bin/env node
// usage-events PUSH stream (R4 finale) against a REAL daemon: transcript
// growth → walker child → batched chan-0 push → server ack commits the
// device-side cursor (two-phase). Proves: initial drain, incremental (only
// NEW events after a cursor commit), and that an UNACKED batch does NOT
// advance the cursor (the loss-window closure the whole design rests on).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(dir, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-uep-'));
const ROOT = path.join(tmp, 'agentd');
process.env.VIBESPACE_AGENTD_ROOT = ROOT;
const fakeHome = path.join(tmp, 'home');
const proj = path.join(fakeHome, '.claude', 'projects', '-home-u-x');
fs.mkdirSync(proj, { recursive: true });
process.env.HOME = fakeHome;
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });

let failed = 0;
const check = (n, c, e) => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n}${e ? '\n    ' + e : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SID = 'aaaa1111-2222-3333-4444-555566667777';
const jsonl = path.join(proj, SID + '.jsonl');
const rec = (rid) => JSON.stringify({ type: 'assistant', requestId: rid, timestamp: new Date().toISOString(), cwd: '/home/u/x', message: { id: 'msg_' + rid, model: 'claude-fable-5', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 } } }) + '\n';
fs.writeFileSync(jsonl, rec('r1') + rec('r2'));

const version = require('../package.json').version;
fs.writeFileSync(path.join(repo, 'src/agentd/version.js'), `module.exports = { VERSION: ${JSON.stringify(version)} };\n`);
const bundle = path.join(tmp, 'agentd.js');
execFileSync('npx', ['esbuild', 'src/agentd/agentd.js', '--bundle', '--platform=node', `--outfile=${bundle}`], { cwd: repo });

const { DeviceManager } = require('../src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: bundle, version, log: () => {} });
dm.installLocal();
const conn = await dm.connect();
check('hello-ack advertises usage-events', conn.info.capabilities.includes('usage-events'));

try {
  const got = []; // parsed events
  let acking = true;
  await dm.watchUsageEvents((m) => {
    for (const line of m.batch || []) { try { got.push(JSON.parse(line)); } catch { } }
    if (m.seq != null && acking) dm.ackUsageEvents(m.seq);
  });
  // initial drain
  for (let i = 0; i < 40 && got.length < 2; i++) await sleep(250);
  check(`initial drain pushes the existing events (${got.length})`, got.length === 2 && got.some((e) => e.rid === 'r1') && got.some((e) => e.rid === 'r2'));
  const cursorFile = path.join(ROOT, 'state', 'usage-push-cursor.json');
  for (let i = 0; i < 20 && !fs.existsSync(cursorFile); i++) await sleep(250);
  check('ack committed the device-side cursor file', fs.existsSync(cursorFile));
  let cur1 = {}; try { cur1 = JSON.parse(fs.readFileSync(cursorFile, 'utf8')); } catch { }
  check('cursor holds the transcript byte offset', (cur1[jsonl]?.offset || 0) > 0);

  // incremental: append ONE record → exactly one new event
  fs.appendFileSync(jsonl, rec('r3'));
  for (let i = 0; i < 40 && got.length < 3; i++) await sleep(250);
  check(`incremental push carries ONLY the new event (${got.length} total)`, got.length === 3 && got[2].rid === 'r3');

  // TWO-PHASE: with acks suppressed, the batch still arrives but the cursor
  // must NOT advance — an unacked batch would re-emit on the next walk and
  // rid dedup absorbs it. This is the loss-window closure.
  acking = false;
  let before = ''; try { before = fs.readFileSync(cursorFile, 'utf8'); } catch { }
  fs.appendFileSync(jsonl, rec('r4'));
  for (let i = 0; i < 40 && got.length < 4; i++) await sleep(250);
  check('unacked batch still delivers the event', got.length === 4 && got[3].rid === 'r4');
  await sleep(800);
  let after = ''; try { after = fs.readFileSync(cursorFile, 'utf8'); } catch { }
  check('…but the cursor did NOT advance without the ack (two-phase preserved)', after === before);
  if (failed) { try { console.error('--- daemon log tail ---\n' + fs.readFileSync(path.join(ROOT, 'agentd.out'), 'utf8').slice(-1500)); } catch { } }
} finally {
  try { await dm.stop?.(); } catch { }
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `FAIL (${failed})` : 'ALL PASS (7)');
process.exit(failed ? 1 : 0);
