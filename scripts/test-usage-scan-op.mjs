#!/usr/bin/env node
// R4 step 1 — the daemon's `usage-scan` op, end to end against a REAL daemon
// (docs/design-three-tier.md `usage.scan`).
//
// WHAT IT PINS: (1) the op's events match the shipped scanner run directly
// over the same fixture (the walker module is behavior-identical through the
// bundle + child re-exec + count-gated stream); (2) the daemon NEVER persists
// the cursor — the two-phase commit is the server's move after the transfer
// fully landed (the loss-window fix: a link death mid-transfer leaves the
// cursor put, re-emit + rid-dedup absorb); (3) the committed cursor makes the
// next op incremental; (4) an append is picked up.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-uscan-'));
process.env.HOME = home; // the daemon child inherits this
const proj = path.join(home, '.claude', 'projects', '-home-u-work');
const SID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
let n = 0;
const rec = () => JSON.stringify({
  type: 'assistant', requestId: 'req_' + (++n), timestamp: new Date().toISOString(),
  message: { id: 'msg_' + n, model: 'claude-fable-5', usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation: { ephemeral_5m_input_tokens: 7 } } },
}) + '\n';
const write = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
write(path.join(proj, SID + '.jsonl'), rec() + rec());
write(path.join(proj, SID, 'subagents', 'workflows', 'wf_r1', 'agent-a.jsonl'), rec());
// codex rollout (walker v2 — the op must serve it too; dir also exercises the
// daemon's codex fs.watch below)
const TID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const cxDir = path.join(home, '.codex', 'sessions', '2026', '08', '11');
write(path.join(cxDir, `rollout-2026-08-11T00-00-00-${TID}.jsonl`),
  JSON.stringify({ timestamp: new Date().toISOString(), type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: '/tmp/cx' } }) + '\n'
  + JSON.stringify({ timestamp: new Date().toISOString(), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50 }, total_token_usage: { total_tokens: 1050 } } } }) + '\n');

// reference: the shipped scanner, its own throwaway cursor
const refCursor = path.join(home, 'ref-cursor.json');
const refOut = execFileSync(process.execPath, [path.join(REPO, 'data/bin/vibespace-usage-scan')], {
  encoding: 'utf8', env: { ...process.env, HOME: home, VIBESPACE_USAGE_CURSOR: refCursor }, timeout: 30000,
});
const refLines = refOut.split('\n').filter(Boolean);

// real daemon
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-uscan-data-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(home, 'agentd-root');
const { DeviceManager } = require(REPO + '/src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
await dm.connect();

const opCursor = path.join(home, 'op-cursor.json');
const r1 = await dm.usageScan({ cursorFile: opCursor });
const opLines = r1.ndjson.split('\n').filter(Boolean);
ok(opLines.length === 4, `op streamed all 4 events incl. the codex rollout (${opLines.length})`);
ok(opLines.some((l) => { const e = JSON.parse(l); return e.be === 'codex' && e.rid === 'cx:' + TID + ':1050'; }), 'codex event served through the op');
ok(JSON.stringify(opLines) === JSON.stringify(refLines), 'op events BYTE-IDENTICAL to the shipped scanner over the same fixture');
ok(r1.cursors && Object.keys(r1.cursors).length === 3, 'cursor manifest covers all walked files (claude + codex)');
ok(r1.cursorFile === opCursor, 'manifest names the cursor file');
ok(!fs.existsSync(opCursor), 'daemon did NOT persist the cursor (two-phase: commit is the server’s move)');

// server-style commit over the device link, then incremental
await dm.fsWrite(opCursor + '.tmp', JSON.stringify(r1.cursors));
await dm.fsRename(opCursor + '.tmp', opCursor);
ok(fs.existsSync(opCursor), 'commit landed via fsWrite+fsRename');
const r2 = await dm.usageScan({ cursorFile: opCursor });
ok(r2.ndjson === '', 'committed cursor makes the next op incremental (nothing re-emitted)');

// append → only the new event
fs.appendFileSync(path.join(proj, SID + '.jsonl'), rec());
const r3 = await dm.usageScan({ cursorFile: opCursor });
ok(r3.ndjson.split('\n').filter(Boolean).length === 1, 'append picked up past the committed cursor');
// commit r3's cursor too — an UNCOMMITTED cursor re-emits by design (that IS
// the two-phase guarantee), and the next section asserts exact deltas
await dm.fsWrite(opCursor + '.tmp', JSON.stringify(r3.cursors));
await dm.fsRename(opCursor + '.tmp', opCursor);

// ── dirty push (R4): the daemon fs.watches transcript dirs and pushes one
// debounced discovery-dirty per change burst — the server's harvest kick +
// discovery invalidation both ride it. Assert claude AND codex dirs push. ──
let dirtyCount = 0;
await dm.watchDiscovery(() => { dirtyCount++; });
await new Promise((r) => setTimeout(r, 800)); // let any startup churn drain
const dirtyBase = dirtyCount;
fs.appendFileSync(path.join(proj, SID + '.jsonl'), rec());
await new Promise((r) => setTimeout(r, 1800));
ok(dirtyCount > dirtyBase, `claude transcript growth pushes discovery-dirty (${dirtyCount - dirtyBase})`);
const dirtyBase2 = dirtyCount;
fs.appendFileSync(path.join(cxDir, `rollout-2026-08-11T00-00-00-${TID}.jsonl`),
  JSON.stringify({ timestamp: new Date().toISOString(), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 5 }, total_token_usage: { total_tokens: 1155 } } } }) + '\n');
await new Promise((r) => setTimeout(r, 1800));
ok(dirtyCount > dirtyBase2, `codex rollout growth pushes discovery-dirty too (${dirtyCount - dirtyBase2})`);
const r4 = await dm.usageScan({ cursorFile: opCursor });
const r4l = r4.ndjson.split('\n').filter(Boolean);
ok(r4l.length === 2 && r4l.some((l) => JSON.parse(l).be === 'codex'), 'post-dirty harvest returns exactly the two appended events (claude + codex)');

// capability gate: an old daemon (no usage-scan capability in its hello-ack)
// must throw FAST pre-wire — unknown ops get no reply and would hang the
// request until its timeout. Simulate by masking the live conn's caps.
const conn = await dm.connect();
const realCaps = conn.info.capabilities;
conn.info.capabilities = [];
let gateErr = null;
try { await dm.usageScan(); } catch (e) { gateErr = e; }
conn.info.capabilities = realCaps;
ok(gateErr && /lacks usage-scan/.test(gateErr.message), 'pre-op capability gate throws fast for old daemons (unknown ops would hang)');

// ── R5 step 1: discovery snapshot runs in a CHILD process — pin that the
// child-served snapshot equals the inline computation over the same fixture
// (forceInline = the fallback lane, exercised so it can't rot). ──
// a realistic tail: the resumed-session id mention extractTailIds looks for
fs.appendFileSync(path.join(proj, SID + '.jsonl'),
  JSON.stringify({ type: 'user', sessionId: SID, timestamp: new Date().toISOString(), message: { role: 'user', content: 'tail marker' } }) + '\n');
const snapChild = await dm.discoverySnapshot();
const snapInline = await dm._request({ op: 'discovery-snapshot', forceInline: true });
ok(!snapChild.error && snapChild.jsonls?.length === 1 && snapChild.jsonls[0].file === SID + '.jsonl',
  `snapshot lists exactly the TOP-LEVEL transcript (subagent files are not resumable sessions) (${snapChild.jsonls?.length})`);
ok(Array.isArray(snapChild.codexRollouts) && snapChild.codexRollouts.length === 1, 'snapshot (child) sees the codex rollout');
const strip = (r) => JSON.stringify({ locks: r.locks, jsonls: r.jsonls, codexRollouts: r.codexRollouts });
ok(strip(snapChild) === strip(snapInline), 'child-served snapshot BYTE-IDENTICAL to the inline fallback (same function, two isolation modes)');
ok(snapChild.jsonls[0].tailIds?.includes(SID), 'tail-id enrichment survives the child hop');

// ── R5 step 3: discovery.v2 — the DEVICE interprets its own snapshot into
// session cards. Byte-identical to the server doing it (same three shared
// functions), which is what makes the later switchover a transport swap. ──
{
  const { interpretDiscoveryLines, synthesizeDiscoveryLines } = require(REPO + '/src/discovery-facts.js');
  const { claimJsonls } = require(REPO + '/src/session-store.js');
  const viaDevice = await dm.discoveryClaims({ hostId: 'host-t', hostName: 'BoxT' });
  const serverSide = interpretDiscoveryLines(synthesizeDiscoveryLines(snapChild), { hostId: 'host-t', hostName: 'BoxT', claimJsonls });
  ok(!viaDevice.error && Array.isArray(viaDevice.sessions), 'device answers discovery-claims');
  ok(JSON.stringify(viaDevice.sessions) === JSON.stringify(serverSide),
    `device-computed claims BYTE-IDENTICAL to server-side interpretation (${viaDevice.sessions?.length} cards)`);
  ok(viaDevice.sessions.some((x) => x.sessionId === SID), 'the fixture transcript appears as a card');
  ok(viaDevice.sessions.some((x) => x.backend === 'codex'), 'the codex rollout appears as a card');
  const caps = (await dm.connect()).info.capabilities;
  const saved = caps.slice();
  (await dm.connect()).info.capabilities = [];
  let gate = null;
  try { await dm.discoveryClaims({}); } catch (e) { gate = e; }
  (await dm.connect()).info.capabilities = saved;
  ok(gate && /lacks discovery-claims/.test(gate.message), 'discovery-claims is capability-gated (fast fail on old daemons)');
}

// ── forced-fallback smoke (design law: fallbacks rot unless exercised) —
// the script-SHIP lane hosts.harvestUsage degrades to when the op is
// unavailable: fsWrite the scanner + runStream it, default cursor. ──
{
  const scannerSrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-usage-scan'), 'utf8');
  const scanPath = path.join(home, '.vibespace', 'bin', 'vibespace-usage-scan');
  await dm.fsWrite(scanPath, scannerSrc);
  const chunks2 = [];
  const r5 = await dm.runStream(process.execPath, [scanPath], { onData: (b) => chunks2.push(b) });
  ok(r5.code === 0 && !r5.error, 'ship-lane fallback: scanner runs via fsWrite+runStream');
  const shipEvs = Buffer.concat(chunks2).toString('utf8').split('\n').filter(Boolean);
  ok(shipEvs.length >= 5 && shipEvs.some((l) => JSON.parse(l).be === 'codex'), `ship-lane emits the full fixture incl. codex (${shipEvs.length} events, own default cursor)`);
}

try { const pid = parseInt(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf-8')); if (pid) process.kill(pid); } catch { }
fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
