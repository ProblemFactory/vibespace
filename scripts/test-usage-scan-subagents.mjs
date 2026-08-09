// 2.265.0: the ledger scan must mine SUBAGENT + WORKFLOW agent transcripts
// (<proj>/<sid>/subagents/**). Workflow agents' API usage exists ONLY there —
// the top-level-only scan under-counted every workflow run (~$205 for one
// 15-agent review, measured), which poisoned dead-reckoning rates (calib
// caught a 3-4× hot 5h rate). Events attribute to the PARENT session id;
// requestId dedup absorbs parent-sidechain overlap.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { UsageHistory } = require(path.resolve('src/usage-history.js'));

let pass = 0, fail = 0;
const ck = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-uh-home-'));
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-uh-data-'));
const SID = '11111111-2222-3333-4444-555555555555';
const proj = path.join(home, '.claude', 'projects', '-tmp-proj');
const subDir = path.join(proj, SID, 'subagents');
const wfDir = path.join(subDir, 'workflows', 'wf_test-1');
fs.mkdirSync(wfDir, { recursive: true });

const rec = (rid, model = 'claude-fable-5') => JSON.stringify({
  type: 'assistant', requestId: rid, timestamp: '2026-08-09T08:00:00.000Z', cwd: '/tmp/x',
  message: { model, usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation: {} } },
}) + '\n';

fs.writeFileSync(path.join(proj, SID + '.jsonl'), rec('req_parent') + rec('req_shared')); // req_shared = sidechain also in the agent file
fs.writeFileSync(path.join(subDir, 'agent-aaa.jsonl'), rec('req_shared') + rec('req_agent1'));
fs.writeFileSync(path.join(wfDir, 'agent-bbb.jsonl'), rec('req_wf1') + rec('req_wf2'));
fs.writeFileSync(path.join(wfDir, 'journal.jsonl'), JSON.stringify({ type: 'started', key: 'x' }) + '\n'); // must be IGNORED
fs.writeFileSync(path.join(proj, SID + '-not-a-dir.txt'), 'noise');

const uh = new UsageHistory({ dataDir, homeDir: home });
uh.scan({ force: true });
const events = [...uh._events(0, Date.now() + 1e9)].filter((e) => e.be === 'claude');
const rids = events.map((e) => e.rid).sort();
ck('workflow agent requests mined (req_wf1/req_wf2)', rids.includes('req_wf1') && rids.includes('req_wf2'));
ck('subagent file requests mined (req_agent1)', rids.includes('req_agent1'));
ck('parent requests still mined', rids.includes('req_parent'));
ck('parent/agent duplicate deduped by requestId', rids.filter((r) => r === 'req_shared').length === 1);
ck('journal.jsonl NOT mined as usage', events.length === 5);
ck('agent events attribute to the PARENT session id', events.filter((e) => e.rid.startsWith('req_wf')).every((e) => e.sid === SID));

// incremental: appending to a workflow file picks up only the delta
fs.appendFileSync(path.join(wfDir, 'agent-bbb.jsonl'), rec('req_wf3'));
uh._lastScan = 0; uh.scan({ force: true });
const events2 = [...uh._events(0, Date.now() + 1e9)].filter((e) => e.be === 'claude');
ck('incremental append picked up (cursor per file)', events2.some((e) => e.rid === 'req_wf3') && events2.length === 6);

fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `${fail} FAILED (${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
