#!/usr/bin/env node
// LOCAL ↔ REMOTE usage-walk PARITY (2.275.0, campaign Phase 4).
//
// The remote ledger scanner (data/bin/vibespace-usage-scan, shipped to hosts
// over ssh stdin as ONE self-contained file) is a REIMPLEMENTATION of the
// local UsageHistory walk. It has silently lagged its twin twice:
//   • 2.265.0 taught the LOCAL walk to mine <sid>/subagents/** and
//     subagents/workflows/wf_*/agent-*.jsonl (workflow-agent spend exists
//     ONLY there) — the remote copy kept scanning top-level transcripts only,
//     so every remote machine under-reported its workflow spend for 6 weeks.
//   • The fix was ported by hand in 2.271.0 — which is exactly the mechanism
//     that produced the divergence in the first place.
// The scanner cannot `require` a shared module (it must stay one file on a
// machine that has no VibeSpace checkout), so the structural guard is this
// BEHAVIOURAL parity test: run BOTH walkers over one fixture tree and demand
// the same coverage. Any future one-sided fix fails here immediately.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { UsageHistory } = require(path.join(REPO, 'src/usage-history.js'));

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-walkpar-'));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-walkpar-data-'));
const proj = path.join(home, '.claude', 'projects', '-home-u-work');
const SID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

// One assistant record carrying usage — the only shape either walker counts.
let n = 0;
const rec = (model = 'claude-fable-5') => JSON.stringify({
  type: 'assistant', requestId: 'req_' + (++n), timestamp: new Date().toISOString(),
  message: { id: 'msg_' + n, model, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation: { ephemeral_5m_input_tokens: 7 } } },
}) + '\n';

const write = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
// (a) top-level session transcript — both walkers always covered this
write(path.join(proj, SID + '.jsonl'), rec());
// (b) plain subagent transcript (2.265.0)
write(path.join(proj, SID, 'subagents', 'agent-plain1.jsonl'), rec());
// (c) WORKFLOW agent transcript — the one the remote twin missed for 6 weeks
write(path.join(proj, SID, 'subagents', 'workflows', 'wf_run1', 'agent-wfa.jsonl'), rec());
write(path.join(proj, SID, 'subagents', 'workflows', 'wf_run1', 'agent-wfb.jsonl'), rec());
// (d) noise that NEITHER may count (journal is bookkeeping, not usage)
write(path.join(proj, SID, 'subagents', 'workflows', 'wf_run1', 'journal.jsonl'),
  JSON.stringify({ type: 'result', key: 'x' }) + '\n');

// ── LOCAL walk ──
const uh = new UsageHistory({ dataDir, homeDir: home });
uh.scan({ force: true });
const localEvents = uh._loadEvents ? uh._loadEvents() : null;
const localRids = new Set((localEvents?.events || localEvents || []).map((e) => e.rid).filter(Boolean));

// ── REMOTE walk (the shipped scanner, exactly as a host runs it) ──
const cursor = path.join(dataDir, 'remote-cursor.json');
const stdout = execFileSync(process.execPath, [path.join(REPO, 'data/bin/vibespace-usage-scan')], {
  encoding: 'utf8', env: { ...process.env, HOME: home, VIBESPACE_USAGE_CURSOR: cursor }, timeout: 30000,
});
const remoteRids = new Set(stdout.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).rid; } catch { return null; } }).filter(Boolean));

console.log(`  local rids: ${localRids.size} | remote rids: ${remoteRids.size}`);
ok(localRids.size === 4, 'local walk counts all 4 usage records (top-level + subagent + 2 workflow agents)');
ok(remoteRids.size === 4, 'remote walk counts all 4 — the 2.265.0/2.271.0 workflow lag would fail HERE');
const onlyLocal = [...localRids].filter((r) => !remoteRids.has(r));
const onlyRemote = [...remoteRids].filter((r) => !localRids.has(r));
ok(onlyLocal.length === 0, 'nothing counted locally is missed remotely' + (onlyLocal.length ? ` (missed: ${onlyLocal})` : ''));
ok(onlyRemote.length === 0, 'nothing counted remotely is missed locally' + (onlyRemote.length ? ` (extra: ${onlyRemote})` : ''));

// mid field parity (the 2.267.3 join rule): live stdout records lack a
// requestId, so per-message billing lookups join on message.id — BOTH walkers
// must carry it or remote replies can never attribute in the popup.
const remoteEvs = stdout.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
ok(remoteEvs.every((e) => e.mid && e.mid.startsWith('msg_')), 'remote walker emits the mid join field on every event');
const localEvsAll = (localEvents?.events || localEvents || []);
ok(localEvsAll.every((e) => e.mid && String(e.mid).startsWith('msg_')), 'local walker bakes mid on every event');

// Cursor semantics: a second run must emit NOTHING new (both sides are
// incremental; a re-emitting scanner would double-count on every harvest).
const stdout2 = execFileSync(process.execPath, [path.join(REPO, 'data/bin/vibespace-usage-scan')], {
  encoding: 'utf8', env: { ...process.env, HOME: home, VIBESPACE_USAGE_CURSOR: cursor }, timeout: 30000,
});
ok(stdout2.split('\n').filter(Boolean).length === 0, 'remote cursor is incremental (re-run emits nothing)');

// Growth is picked up on BOTH sides from the same append.
fs.appendFileSync(path.join(proj, SID, 'subagents', 'workflows', 'wf_run1', 'agent-wfa.jsonl'), rec());
const stdout3 = execFileSync(process.execPath, [path.join(REPO, 'data/bin/vibespace-usage-scan')], {
  encoding: 'utf8', env: { ...process.env, HOME: home, VIBESPACE_USAGE_CURSOR: cursor }, timeout: 30000,
});
ok(stdout3.split('\n').filter(Boolean).length === 1, 'remote walk picks up an append inside a workflow agent file');
uh.scan({ force: true });
const after = uh._loadEvents ? uh._loadEvents() : null;
const afterRids = new Set((after?.events || after || []).map((e) => e.rid).filter(Boolean));
ok(afterRids.size === 5, 'local walk picks up the same append');

// ── THIRD walker (R4, 2.286.0): src/usage-walker.js — the MODULE the device
// daemon bundles and runs as its `usage-scan` op. Same fixture, same events
// as the shipped scanner, byte for byte — plus the module's deliberate
// difference: it NEVER persists the cursor (the caller two-phase-commits). ──
{
  const { runUsageWalk } = require(path.join(REPO, 'src/usage-walker.js'));
  const modCursor = path.join(dataDir, 'module-cursor.json');
  const r1 = runUsageWalk({ home, cursorFile: modCursor });
  const modRids = new Set(r1.events.map((l) => { try { return JSON.parse(l).rid; } catch { return null; } }).filter(Boolean));
  ok(modRids.size === 5, `walker MODULE counts everything the scanner does (${modRids.size}/5)`);
  ok([...afterRids].every((r) => modRids.has(r)), 'module coverage identical to the local walk');
  ok(r1.events.every((l) => { const e = JSON.parse(l); return e.mid && e.mid.startsWith('msg_'); }), 'module emits the mid join field on every event');
  ok(!fs.existsSync(modCursor), 'module NEVER persists the cursor itself (two-phase commit is the caller)');
  // caller-committed cursor → next walk emits nothing (incremental holds)
  fs.writeFileSync(modCursor, JSON.stringify(r1.cursors));
  const r2 = runUsageWalk({ home, cursorFile: modCursor });
  ok(r2.events.length === 0, 'committed cursor makes the module incremental (re-run emits nothing)');
  // an append after commit is picked up
  fs.appendFileSync(path.join(proj, SID + '.jsonl'), rec());
  const r3 = runUsageWalk({ home, cursorFile: modCursor });
  ok(r3.events.length === 1, 'module picks up an append past the committed cursor');
}

// ── CODEX rollouts (walker v2, R4 step 2): all three walkers must count the
// same rollout events — synthetic rid = cumulative total, model/cwd from the
// preceding turn_context, input-minus-cached split, heartbeats skipped. ──
{
  const TID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
  const cxDir = path.join(home, '.codex', 'sessions', '2026', '08', '11');
  const cxts = (i) => new Date(Date.UTC(2026, 7, 11, 0, 0, i)).toISOString();
  const rollout = [
    { timestamp: cxts(0), type: 'turn_context', payload: { model: 'gpt-5.6-sol', cwd: '/tmp/cx' } },
    { timestamp: cxts(1), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50 }, total_token_usage: { total_tokens: 1050 } } } },
    { timestamp: cxts(2), type: 'event_msg', payload: { type: 'token_count', info: null } }, // rate-limit heartbeat — skip
    { timestamp: cxts(3), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 1200, cached_input_tokens: 1100, output_tokens: 80 }, total_token_usage: { total_tokens: 2330 } } } },
  ];
  fs.mkdirSync(cxDir, { recursive: true });
  fs.writeFileSync(path.join(cxDir, `rollout-2026-08-11T00-00-00-${TID}.jsonl`), rollout.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const runScanner = (cursorEnv) => execFileSync(process.execPath, [path.join(REPO, 'data/bin/vibespace-usage-scan')], {
    encoding: 'utf8', env: { ...process.env, HOME: home, CODEX_HOME: path.join(home, '.codex'), VIBESPACE_USAGE_CURSOR: cursorEnv }, timeout: 30000,
  });
  const scOut = runScanner(path.join(dataDir, 'cx-scan-cursor.json'));
  const scEvs = scOut.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const scCx = scEvs.filter((e) => e.be === 'codex');
  ok(scCx.length === 2, `scanner emits 2 codex events, heartbeat skipped (${scCx.length})`);
  ok(scCx[0].rid === 'cx:' + TID + ':1050' && scCx[1].rid === 'cx:' + TID + ':2330', 'codex rids = cumulative totals (replay-dedupable)');
  ok(scCx[0].model === 'gpt-5.6-sol' && scCx[0].cwd === '/tmp/cx', 'model/cwd carried from the preceding turn_context');
  ok(scCx[0].i === 200 && scCx[0].cr === 800 && scCx[0].o === 50, 'input-minus-cached split (i=fresh, cr=cached)');

  const { runUsageWalk: walk2 } = require(path.join(REPO, 'src/usage-walker.js'));
  const prevCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = path.join(home, '.codex');
  const mod = walk2({ home, cursorFile: path.join(dataDir, 'cx-mod-cursor.json') });
  if (prevCodexHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevCodexHome;
  const modCx = mod.events.map((l) => JSON.parse(l)).filter((e) => e.be === 'codex');
  ok(JSON.stringify(modCx) === JSON.stringify(scCx), 'module codex events BYTE-IDENTICAL to the scanner');

  process.env.CODEX_HOME = path.join(home, '.codex');
  const uh3 = new UsageHistory({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vs-walkpar-cx2-')), homeDir: home });
  uh3.scan({ force: true });
  if (prevCodexHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevCodexHome;
  const l3 = uh3._loadEvents();
  const localCx = (l3?.events || l3 || []).filter((e) => e.be === 'codex');
  ok(localCx.length === 2 && localCx.every((e, i) => e.rid === scCx[i].rid), 'LOCAL walk counts the same codex rids (three-walker parity)');
}

fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
