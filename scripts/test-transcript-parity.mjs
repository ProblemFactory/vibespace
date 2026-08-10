#!/usr/bin/env node
// R3 step 2 — daemon-hosted transcript.* ops, byte-identical parity
// (docs/design-three-tier.md).
//
// THE CLAIM: the SAME transcript queried through the in-process
// transcript-service and through a REAL device daemon's `transcript-op`
// (esbuild bundle, mux control + count-gated byte channel, JSON round trip)
// yields byte-identical results. This is what makes the later switchover a
// transport swap instead of a behavior change — and it only became provable
// once R0 made message ids content-derived (two independent parser processes
// now mint the SAME ids for the same records).
//
// The ops are DARK: this suite is their only caller until the switchover
// round; production keeps reading through the server-hosted service.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

// ── fixture HOME, set BEFORE any src require (CODEX_SESSIONS_DIR binds at
// module load) — the daemon child inherits it via spawn env ──
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tparity-'));
process.env.HOME = home;
const origHomedir = os.homedir;
os.homedir = () => home;

const SID = 'aaaaaaaa-1111-2222-3333-444444444444';
const CWD = '/tmp/vsproj';
const PROJ = path.join(home, '.claude', 'projects', '-tmp-vsproj');
fs.mkdirSync(PROJ, { recursive: true });
const ts = (i) => new Date(Date.UTC(2026, 7, 10, 12, 0, i)).toISOString();
// Big assistant texts push the page-all JSON well past the mux INITIAL_WINDOW
// (256KB) — the parity then also proves the count-gating (a done-marker
// resolve would truncate to exactly the window, the 2.187.0 class).
const BIG = 'X'.repeat(300000) + ' 大文本结尾марker';
const claudeRecords = [
  { type: 'user', uuid: 'u-1', timestamp: ts(0), sessionId: SID, message: { role: 'user', content: [{ type: 'text', text: 'hello 世界' }] } },
  { type: 'assistant', uuid: 'a-1', timestamp: ts(1), sessionId: SID, requestId: 'req_001', message: { id: 'msg_01', model: 'claude-fable-5', role: 'assistant', content: [{ type: 'text', text: 'looking' }, { type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }], usage: { input_tokens: 10, output_tokens: 5 } } },
  { type: 'user', uuid: 'u-2', timestamp: ts(2), sessionId: SID, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'file1\nfile2' }] } },
  // subagent record — must be invisible on both legs identically
  { type: 'assistant', uuid: 'sub-1', timestamp: ts(3), sessionId: SID, parent_tool_use_id: 'toolu_1', isSidechain: true, message: { id: 'msg_sub', role: 'assistant', content: [{ type: 'text', text: 'sidechain noise' }] } },
  { type: 'assistant', uuid: 'a-2', timestamp: ts(4), sessionId: SID, requestId: 'req_002', message: { id: 'msg_02', model: 'claude-fable-5', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_2', name: 'TodoWrite', input: { todos: [{ content: 'step one', status: 'in_progress', activeForm: 'doing step one' }, { content: 'step two', status: 'pending', activeForm: 'doing step two' }] } }], usage: { input_tokens: 20, output_tokens: 9 } } },
  { type: 'user', uuid: 'u-3', timestamp: ts(5), sessionId: SID, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: 'ok' }] } },
  { type: 'assistant', uuid: 'a-3', timestamp: ts(6), sessionId: SID, requestId: 'req_003', message: { id: 'msg_03', model: 'claude-fable-5', role: 'assistant', content: [{ type: 'text', text: BIG }], usage: { input_tokens: 30, output_tokens: 900 } } },
  { type: 'user', uuid: 'u-4', timestamp: ts(7), sessionId: SID, message: { role: 'user', content: [{ type: 'text', text: '继续 世界' }] } },
  { type: 'assistant', uuid: 'a-4', timestamp: ts(8), sessionId: SID, requestId: 'req_004', message: { id: 'msg_04', model: 'claude-fable-5', role: 'assistant', content: [{ type: 'text', text: BIG + ' second' }], usage: { input_tokens: 40, output_tokens: 901 } } },
];
fs.writeFileSync(path.join(PROJ, SID + '.jsonl'), claudeRecords.map((r) => JSON.stringify(r)).join('\n') + '\n');

const TID = 'bbbbbbbb-5555-6666-7777-888888888888';
const cxDir = path.join(home, '.codex', 'sessions', '2026', '08', '10');
fs.mkdirSync(cxDir, { recursive: true });
const cxRecords = [
  { timestamp: ts(0), type: 'session_meta', payload: { id: TID, cwd: CWD } },
  { timestamp: ts(1), type: 'turn_context', payload: { model: 'gpt-5.6', cwd: CWD } },
  { timestamp: ts(2), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'codex hello 世界' }] } },
  { timestamp: ts(3), type: 'event_msg', payload: { type: 'agent_reasoning', text: 'thinking...', id: 'item_r1' } },
  { timestamp: ts(4), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'codex reply' }], id: 'item_m1' } },
];
fs.writeFileSync(path.join(cxDir, `rollout-2026-08-10T12-00-00-${TID}.jsonl`), cxRecords.map((r) => JSON.stringify(r)).join('\n') + '\n');

// ── in-process service, the DAEMON's exact shape (no live sessions, no
// buffer overlay, no hosts — the overlay stays a server concern by design) ──
const { createTranscriptService } = require(REPO + '/src/transcript-service.js');
const { SessionMessages } = require(REPO + '/src/session-store.js');
const { CodexSessionMessages } = require(REPO + '/src/codex-session-store.js');
const svc = createTranscriptService({
  activeSessions: new Map(),
  createSessionMessages: (s) => (s?.backend === 'codex'
    ? new CodexSessionMessages(s, undefined, {})
    : new SessionMessages(s, undefined, {})),
  hosts: null,
});

// ── real daemon ──
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tparity-data-'));
process.env.VIBESPACE_AGENTD_ROOT = path.join(home, 'agentd-root');
const { DeviceManager } = require(REPO + '/src/agentd/client.js');
const dm = new DeviceManager({ dataDir, bundlePath: path.join(REPO, 'data/bin/vibespace-agentd.js'), version: '0.0.0-t', nodeModules: path.join(REPO, 'node_modules'), log: () => { } });
await dm.connect();

const J = (v) => JSON.stringify(v);
const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `@${i}: …${a.slice(Math.max(0, i - 40), i + 40)}… vs …${b.slice(Math.max(0, i - 40), i + 40)}…`; };
const parity = async (name, inprocPromise, opArgs) => {
  const [inproc, viaOp] = await Promise.all([inprocPromise, dm.transcriptOp(...opArgs)]);
  const a = J(inproc), b = J(viaOp);
  ok(a === b, `${name}: daemon-served result BYTE-IDENTICAL to in-process (${a.length}b)`);
  if (a !== b) console.error('    diff ' + firstDiff(a, b));
  return { a, inproc };
};

const ref = { backend: 'claude', sessionId: SID, cwd: CWD };
await parity('page (tail 50)', svc.page(ref, {}), ['page', ref, {}]);
const big = await parity('page (all, multi-window payload)', svc.page(ref, { offset: 0, limit: 999 }), ['page', ref, { offset: 0, limit: 999 }]);
ok(big.a.length > 512 * 1024, `page-all payload spans >2 mux windows (${(big.a.length / 1024).toFixed(0)}KB) — count-gating actually exercised`);
ok(big.a.includes('大文本结尾марker'), 'multibyte content survived chunked byte-channel transfer intact');
ok(!big.a.includes('sidechain noise'), 'subagent records filtered identically on both legs');
await parity('turnmap', svc.turnmap(ref), ['turnmap', ref, {}]);
await parity('searchIndexed', svc.searchIndexed(ref, '世界'), ['searchIndexed', ref, { q: '世界' }]);
await parity('status (chatStatus+taskState)', svc.status(ref), ['status', ref, {}]);
await parity('taskState (TodoWrite replay)', svc.taskState(ref), ['taskState', ref, {}]);

// gap family: a small file has NO gap (below the head+tail threshold) — the
// null shape must round-trip honestly…
const g = await svc.gapInfo(ref);
await parity('gapInfo (small file → null gap)', Promise.resolve({ gap: g.gap, hasFile: !!g.fp }), ['gapInfo', ref, {}]);
ok(g.gap === null && !!g.fp, 'small file correctly reports no gap (below the seek threshold)');

// …and a HUGE file (>34MB head+tail budget) exercises the real seek family:
// line-index gapInfo, seek-read slab normalization, streaming full turn scan.
const HSID = 'cccccccc-1111-2222-3333-444444444444';
{
  const filler = 'y'.repeat(2000);
  const fd = fs.openSync(path.join(PROJ, HSID + '.jsonl'), 'w');
  let batch = [];
  for (let i = 0; i < 18000; i++) {
    const t = new Date(Date.UTC(2026, 7, 10, 0, 0, 0, i)).toISOString();
    batch.push(JSON.stringify(i % 50 === 0
      ? { type: 'user', uuid: `hu-${i}`, timestamp: t, sessionId: HSID, message: { role: 'user', content: [{ type: 'text', text: `turn ${i} 问题` }] } }
      : { type: 'assistant', uuid: `ha-${i}`, timestamp: t, sessionId: HSID, message: { id: `msg_h${i}`, model: 'claude-fable-5', role: 'assistant', content: [{ type: 'text', text: `r${i} ` + filler }] } }));
    if (batch.length === 1000) { fs.writeSync(fd, batch.join('\n') + '\n'); batch = []; }
  }
  if (batch.length) fs.writeSync(fd, batch.join('\n') + '\n');
  fs.closeSync(fd);
}
const href = { backend: 'claude', sessionId: HSID, cwd: CWD };
const hg = await svc.gapInfo(href);
ok(hg.gap && hg.gap.totalLines === 18000 && hg.gap.tailStartLine > 0, `huge fixture has a REAL gap (${hg.gap?.gapRecords} gap records, tail from line ${hg.gap?.tailStartLine})`);
await parity('gapInfo (huge file)', Promise.resolve({ gap: hg.gap, hasFile: !!hg.fp }), ['gapInfo', href, {}]);
await parity('gapSlab (seek-read mid-file)', (async () => ({ messages: await svc.gapSlab(href, hg.fp, 40, 190) }))(), ['gapSlab', href, { fromLine: 40, toLine: 190 }]);
await parity('fullTurnmap (streaming scan)', (async () => ({ turns: await svc.fullTurnmap(href, hg.fp), ...(hg.gap || {}) }))(), ['fullTurnmap', href, {}]);

// codex leg — different parser, same contract
const cref = { backend: 'codex', sessionId: TID, cwd: CWD };
await parity('codex page', svc.page(cref, {}), ['page', cref, {}]);
const cg = await svc.gapInfo(cref);
await parity('codex gapInfo', Promise.resolve({ gap: cg.gap, hasFile: !!cg.fp }), ['gapInfo', cref, {}]);

// contract hygiene
let unknownErr = null;
try { await dm.transcriptOp('rm-rf', ref, {}); } catch (e) { unknownErr = e; }
ok(unknownErr && /unknown transcript method/.test(unknownErr.message), 'unknown method surfaces as a NAMED error, never hangs');
const missing = await dm.transcriptOp('gapInfo', { backend: 'claude', sessionId: 'ffffffff-0000-0000-0000-000000000000', cwd: CWD }, {});
ok(missing.hasFile === false && missing.gap === null, 'missing transcript answers honestly (hasFile:false), not an error');

os.homedir = origHomedir;
try { const pid = parseInt(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf-8')); if (pid) process.kill(pid); } catch { }
fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
