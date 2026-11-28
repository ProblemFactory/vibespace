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
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } };

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

// THE TEXT WINDOW (perf lane A): a tool-heavy conversation whose last 50
// records hold only 3 text cards — the default page is the text window
// (src/text-window.js), not tail(50), on BOTH legs. Fails on the unfixed code
// (both legs ship 50) and on a ONE-SIDED edit (a server that learned the rule
// while the daemon bundle did not ships two different slabs).
const WSID = 'dddddddd-1111-2222-3333-444444444444';
{
  const recs = [];
  let n = 0;
  for (let t = 0; t < 40; t++) {
    recs.push({ type: 'user', uuid: `wu-${n++}`, timestamp: ts(n % 60), sessionId: WSID, message: { role: 'user', content: [{ type: 'text', text: `turn ${t} 问题` }] } });
    for (let k = 0; k < 14; k++) {
      recs.push({ type: 'assistant', uuid: `wa-${n++}`, timestamp: ts(n % 60), sessionId: WSID, requestId: `req_w${t}_${k}`, message: { id: `msg_w${t}_${k}`, model: 'claude-fable-5', role: 'assistant', content: [{ type: 'tool_use', id: `toolu_w${t}_${k}`, name: 'Bash', input: { command: `ls ${k}` } }], usage: { input_tokens: 1, output_tokens: 1 } } });
      recs.push({ type: 'user', uuid: `wr-${n++}`, timestamp: ts(n % 60), sessionId: WSID, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `toolu_w${t}_${k}`, content: 'ok' }] } });
    }
  }
  fs.writeFileSync(path.join(PROJ, WSID + '.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

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

// B-9a2e part 1 — WHAT VIBESPACE SENT, READ ON THE PAIRED MACHINE: VibeSpace's continue in a stopped codex conversation (X; X2 the
// same records under another id, for the control), a codex native fork of it (Y, Y2: a Referenced fork — its read PREPENDS X's
// records, so X's id is consulted too) and a claude one (C, C2). The rows are the hub's (installed below); the agent has none.
const SR_CONT = 'You can continue now. Continue the task you were working on when the usage limit was reached; do not repeat work that is already complete.';
const SR = { C4: 'eeeeeeee-1111-2222-3333-000000000004', X: 'cccccccc-1111-2222-3333-000000000001', X2: 'cccccccc-1111-2222-3333-000000000002', Y: 'cccccccc-1111-2222-3333-000000000003', Y2: 'cccccccc-1111-2222-3333-000000000004', Y3: 'cccccccc-1111-2222-3333-000000000005', C: 'eeeeeeee-1111-2222-3333-000000000001', C2: 'eeeeeeee-1111-2222-3333-000000000002' };
const srAt = Date.UTC(2026, 7, 10, 12, 0, 30);   // the continue's send; its record lands 2 s later (inside the match window)
const srTs = (s) => new Date(srAt + s * 1000).toISOString();
const srLines = (recs) => recs.map((r) => JSON.stringify(r)).join('\n') + '\n';
for (const id of [SR.X, SR.X2]) fs.writeFileSync(path.join(cxDir, `rollout-2026-08-10T12-00-30-${id}.jsonl`), srLines([
  { timestamp: srTs(0), type: 'session_meta', payload: { id, cwd: CWD } },
  { timestamp: srTs(1), type: 'turn_context', payload: { model: 'gpt-5.6', cwd: CWD } },
  { timestamp: srTs(2), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: SR_CONT }] } },
  { timestamp: srTs(3), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'continuing 继续' }], id: 'item_sr_' + id.slice(-1) } },
]));
for (const id of [SR.Y, SR.Y2, SR.Y3]) fs.writeFileSync(path.join(cxDir, `rollout-2026-08-10T12-01-00-${id}.jsonl`), srLines([
  { timestamp: srTs(30), type: 'session_meta', payload: { id, cwd: CWD, forked_from_id: SR.X, forked_from_ordinal_exclusive: 99 } },
  { timestamp: srTs(31), type: 'turn_context', payload: { model: 'gpt-5.6', cwd: CWD } },
  { timestamp: srTs(32), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'the fork asks 世界' }] } },
  { timestamp: srTs(33), type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'fork reply' }], id: 'item_fk_' + id.slice(-1) } },
]));
// C4: a claude transcript holding a record that carries ANOTHER conversation's id (C) — a claude record is read under its own id
fs.writeFileSync(path.join(PROJ, SR.C4 + '.jsonl'), srLines([
  { type: 'user', uuid: 'sru-c4', timestamp: srTs(2), sessionId: SR.C, promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: SR_CONT }] } },
  { type: 'assistant', uuid: 'sra-c4', timestamp: srTs(3), sessionId: SR.C4, requestId: 'req_src4', message: { id: 'msg_src4', model: 'claude-fable-5', role: 'assistant', content: [{ type: 'text', text: 'continuing 继续' }] } },
]));
for (const id of [SR.C, SR.C2]) fs.writeFileSync(path.join(PROJ, id + '.jsonl'), srLines([
  { type: 'user', uuid: 'sru-' + id.slice(-1), timestamp: srTs(2), sessionId: id, promptSource: 'sdk', message: { role: 'user', content: [{ type: 'text', text: SR_CONT }] } },
  { type: 'assistant', uuid: 'sra-' + id.slice(-1), timestamp: srTs(3), sessionId: id, requestId: 'req_sr' + id.slice(-1), message: { id: 'msg_sr' + id.slice(-1), model: 'claude-fable-5', role: 'assistant', content: [{ type: 'text', text: 'continuing 继续' }] } },
]));

// lane chat-attachments-persist (the cut): a conversation whose tool results carry pictures — the main file and a
// sub-agent's (<session>/subagents/agent-<id>.jsonl), as the real 2.1.322 writes them
const PSID = '9a9a9a9a-1111-2222-3333-444444444444', PAG = 'a0b1c2d3e4f50617';   // an id no other leg of this suite writes
const pic = (n, k) => Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(k, n)]);
const picRec = (uuid, pics, extra = {}) => JSON.stringify({ parentUuid: null, isSidechain: false, cwd: CWD, sessionId: PSID, type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu-' + uuid, content: pics.map((p) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: p.toString('base64') } })) }] }, uuid, timestamp: ts(9), ...extra });
fs.writeFileSync(path.join(PROJ, PSID + '.jsonl'), [picRec('pu-1', [pic(1, 900), pic(2, 300000)])].join('\n') + '\n');   // the second past the mux window
fs.mkdirSync(path.join(PROJ, PSID, 'subagents'), { recursive: true });
fs.writeFileSync(path.join(PROJ, PSID, 'subagents', `agent-${PAG}.jsonl`), picRec('pu-2', [pic(3, 700)], { isSidechain: true, agentId: PAG }) + '\n');

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
await parity('page (default = the text window)', svc.page(ref, {}), ['page', ref, {}]);
{
  const wref = { backend: 'claude', sessionId: WSID, cwd: CWD };
  const { inproc } = await parity('page (text window over a tool-heavy tail)', svc.page(wref, {}), ['page', wref, {}]);
  const { isTextCard, jsonSize, TEXT_WINDOW } = require(REPO + '/src/text-window.js');
  const tailText = inproc.messages.slice(-50).filter(isTextCard).length;
  const texts = inproc.messages.filter(isTextCard).length;
  // perf r1: the window reaches minText OR stops at the growth budget (≤ 128 KiB past the floor)
  const growth = inproc.messages.slice(0, -50).reduce((n, m) => n + jsonSize(m), 0);
  ok(inproc.messages.length > 50 && tailText === 3 && (texts === TEXT_WINDOW.minText || texts > tailText) && growth <= TEXT_WINDOW.maxGrowthBytes,
    `the default page is the TEXT window: ${inproc.messages.length} records holding ${texts} text cards (its last 50 hold ${tailText}), ${(growth / 1024).toFixed(0)} KB past the floor ≤ ${TEXT_WINDOW.maxGrowthBytes / 1024} KB — never tail(50)`);
}
const big = await parity('page (all, multi-window payload)', svc.page(ref, { offset: 0, limit: 999 }), ['page', ref, { offset: 0, limit: 999 }]);
ok(big.a.length > 512 * 1024, `page-all payload spans >2 mux windows (${(big.a.length / 1024).toFixed(0)}KB) — count-gating actually exercised`);
ok(verdictOf(big.a.includes('大文本结尾марker')), 'multibyte content survived chunked byte-channel transfer intact');
ok(!big.a.includes('sidechain noise'), 'subagent records filtered identically on both legs');
await parity('turnmap', svc.turnmap(ref), ['turnmap', ref, {}]);
await parity('searchIndexed', svc.searchIndexed(ref, '世界'), ['searchIndexed', ref, { q: '世界' }]);
await parity('status (chatStatus+taskState)', svc.status(ref), ['status', ref, {}]);
await parity('taskState (TodoWrite replay)', svc.taskState(ref), ['taskState', ref, {}]);

// THE INCREMENTAL TAIL CACHE (perf lane C): both legs cache the parse by byte
// span now, and an append between two reads is folded in as an append — the
// transcript grows between two page()/status() calls, then is truncated back.
// Byte-identical on both legs after each, AND the in-process answer equals a
// COLD read of the same file (the cache changes cost, never content).
{
  const fp = path.join(PROJ, SID + '.jsonl');
  const orig = fs.readFileSync(fp);
  const p0 = await parity('page (before an append)', svc.page(ref, {}), ['page', ref, {}]);
  const st0 = await parity('status (before an append)', svc.status(ref), ['status', ref, {}]);
  const more = [
    { type: 'user', uuid: 'u-5', timestamp: ts(9), sessionId: SID, message: { role: 'user', content: [{ type: 'text', text: 'appended 追加 марker' }] } },
    { type: 'assistant', uuid: 'a-5', timestamp: ts(10), sessionId: SID, requestId: 'req_005', message: { id: 'msg_05', model: 'claude-fable-5', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_5', name: 'TodoWrite', input: { todos: [{ content: 'step one', status: 'completed', activeForm: 'doing step one' }, { content: 'step two', status: 'in_progress', activeForm: 'doing step two' }] } }], usage: { input_tokens: 50, output_tokens: 7 } } },
    { type: 'user', uuid: 'u-6', timestamp: ts(11), sessionId: SID, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_5', content: 'ok' }] } },
    { type: 'assistant', uuid: 'sub-2', timestamp: ts(12), sessionId: SID, parent_tool_use_id: 'toolu_5', isSidechain: true, message: { id: 'msg_sub2', role: 'assistant', content: [{ type: 'text', text: 'sidechain noise' }] } },
    { type: 'assistant', uuid: 'a-6', timestamp: ts(13), sessionId: SID, requestId: 'req_006', message: { id: 'msg_06', model: 'claude-fable-5', role: 'assistant', content: [{ type: 'text', text: 'done 完成' }], usage: { input_tokens: 60, output_tokens: 3 } } },
  ];
  fs.appendFileSync(fp, more.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const p1 = await parity('page after an APPEND between two calls', svc.page(ref, {}), ['page', ref, {}]);
  const st1 = await parity('status after an APPEND between two calls', svc.status(ref), ['status', ref, {}]);
  ok(p1.a !== p0.a && gateOf(p1.a.includes('done 完成')) && !p1.a.includes('sidechain noise') && st1.a !== st0.a && verdictOf(st1.a.includes('"completed"')), 'the appended records are visible on both legs (text, TodoWrite state), the sidechain one is not');
  const { jsonlCacheClear } = require(REPO + '/src/session-store.js');
  jsonlCacheClear();
  ok(J(await svc.page(ref, {})) === p1.a && J(await svc.status(ref)) === st1.a, 'the appended page/status equal a COLD read of the same file (in-process cache cleared)');
  fs.truncateSync(fp, orig.length);
  const p2 = await parity('page after a TRUNCATE (back to the original bytes)', svc.page(ref, {}), ['page', ref, {}]);
  await parity('status after a TRUNCATE', svc.status(ref), ['status', ref, {}]);
  ok(p2.a === p0.a, 'after the truncate the page is the original page again (a full re-read, never the cached append)');
}

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
ok(gateOf(hg.gap) && hg.gap.totalLines === 18000 && hg.gap.tailStartLine > 0, `huge fixture has a REAL gap (${hg.gap?.gapRecords} gap records, tail from line ${hg.gap?.tailStartLine})`);
await parity('gapInfo (huge file)', Promise.resolve({ gap: hg.gap, hasFile: !!hg.fp }), ['gapInfo', href, {}]);
await parity('gapSlab (seek-read mid-file)', (async () => ({ messages: await svc.gapSlab(href, hg.fp, 40, 190) }))(), ['gapSlab', href, { fromLine: 40, toLine: 190 }]);
await parity('fullTurnmap (streaming scan)', (async () => ({ turns: await svc.fullTurnmap(href, hg.fp), ...(hg.gap || {}) }))(), ['fullTurnmap', href, {}]);

// codex leg — different parser, same contract
const cref = { backend: 'codex', sessionId: TID, cwd: CWD };
// B-a60e remainder: THE ROLLOUT INDEX, one implementation on both sides — the hub and the agent find a codex rollout by the SAME
// code (src/adapters/codex.js, which the agent bundles; the machine is the walk's root: both read this HOME), never a walk on
// either's thread. The FIRST codex call of each side (a fresh index) answers the rollout, byte-identical; the hub's side by ONE walk
{
  const AD = require(REPO + '/src/adapters/codex.js');
  AD._resetRolloutIndexForTests();
  const { inproc } = await parity('codex status from a FRESH rollout index on both sides (B-a60e remainder)', svc.status(cref), ['status', cref, {}]);
  const st = AD.rolloutIndexStats();
  // the machine is a PARAMETER, never a second implementation (主开发 r1465): the agent this suite runs carries the hub's own
  // index — its one shared walk, the bound an asker waits, the stuck-walk guard — bundled from the same src/adapters/codex.js
  const bundle = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-agentd.js'), 'utf8');
  const carried = { walk: /function requestRolloutWalk\d*\(/.test(bundle), bound: /CODEX_ASK_BOUND_MS\d* = /.test(bundle), stuck: /CODEX_WALKS_OUT\d*\.get\(/.test(bundle), lookup: /function codexRolloutLookup\d*\(/.test(bundle) };
  ok(verdictOf(Object.values(carried).every(Boolean)), `the agent bundle carries the rollout index's own walk, bound and stuck-walk guard (${JSON.stringify(carried)})`);
  ok(!!inproc && !!inproc.chatStatus && inproc.chatStatus.model === 'gpt-5.6' && st.walks === 1 && gateOf(st.last) && verdictOf(st.last.ok),
    `…the hub's side read the rollout (model «${inproc && inproc.chatStatus && inproc.chatStatus.model}») after ONE walk of its index (${st.walks}; ${st.last && st.last.rollouts} rollouts)`);
}
await parity('codex page', svc.page(cref, {}), ['page', cref, {}]);
const cg = await svc.gapInfo(cref);
await parity('codex gapInfo', Promise.resolve({ gap: cg.gap, hasFile: !!cg.fp }), ['gapInfo', cref, {}]);

// searchFull op (2.293.0 — the last read the seek family needed to switch)
await parity('searchFull', (async () => { const g2 = await svc.gapInfo(href); return svc.searchFull(href, g2.fp, '问题'); })(), ['searchFull', href, { q: '问题' }]);

// lane chat-attachments-persist (the cut): A PICTURE FROM ITS RECORD — the hub's reader (its own transcript worker, the
// byte range of the file) and the agent's (transcript-op `picture`: the SAME src/transcript-picture.js in its bundle) give
// the SAME bytes; the agent names the capability the hub asks for; a gone place is gone on both
{
  const caps = (await dm.connect())?.info?.capabilities || [];
  ok(verdictOf(caps.includes('transcript-picture')), 'the agent\'s hello-ack names `transcript-picture` (the hub asks no agent without it)');
  const pref = { backend: 'claude', sessionId: PSID, cwd: CWD };
  for (const [name, params] of [['main file, a picture past the mux window', { key: 'pu-1', n: 1 }], ['main file, the first picture', { key: 'pu-1', n: 0 }], ['a sub-agent\'s file', { key: 'pu-2', n: 0, agent: PAG }]]) {
    const hub = await svc.picture(pref, params);
    const hubBytes = hub && hub.ok ? Buffer.from(fs.readFileSync(hub.fp).toString('latin1', hub.start, hub.end), 'base64') : null;
    const dev = await dm.transcriptOp('picture', pref, params);
    ok(!!hubBytes && gateOf(dev) && gateOf(dev.ok) && dev.mediaType === hub.mediaType && verdictOf(Buffer.from(dev.b64, 'base64').equals(hubBytes)), `picture (${name}): the agent's answer = the hub's, byte for byte (${hubBytes ? hubBytes.length : 0} bytes)`);
  }
  const [hg2, dg2] = [await svc.picture(pref, { key: 'pu-1', n: 5 }), await dm.transcriptOp('picture', pref, { key: 'pu-1', n: 5 })];
  const [hu, du] = [await svc.picture(pref, { key: 'pu-2', n: 0, agent: 'ffffffffffffffff' }), await dm.transcriptOp('picture', pref, { key: 'pu-2', n: 0, agent: 'ffffffffffffffff' })];
  ok(hg2.gone === 'shortened' && dg2.gone === 'shortened' && hu.unknown === true && du.unknown === true, 'a gone place is gone on both (shortened), a sub-agent file that is not the conversation\'s own is unknown on both');
}

// contract hygiene
let unknownErr = null;
try { await dm.transcriptOp('rm-rf', ref, {}); } catch (e) { unknownErr = e; }
ok(gateOf(unknownErr) && verdictOf(/unknown transcript method/.test(unknownErr.message)), 'unknown method surfaces as a NAMED error, never hangs');
const missing = await dm.transcriptOp('gapInfo', { backend: 'claude', sessionId: 'ffffffff-0000-0000-0000-000000000000', cwd: CWD }, {});
ok(missing.hasFile === false && missing.gap === null, 'missing transcript answers honestly (hasFile:false), not an error');

// B-9a2e part 1 — THE HUB'S ROWS ON THE PAIRED MACHINE. The hub's read (its record installed as the PURE module's source) and the
// REAL agent's read handed {id: rows} by THE ONE HELPER (sent-provenance sentFor; held as the op's own table, holdFor) are byte-identical:
// VibeSpace's continue keeps its origin on both. The parity of this suite is the law: the agent runs the same shared module.
{
  const SP = require(REPO + '/src/sent-provenance.js');
  const row = SP.rowOf(SR_CONT, 'auto-resume', srAt);
  const hubRows = Object.fromEntries(Object.values(SR).map((id) => [id, [row]]));
  SP.setSource((conv) => hubRows[conv] || null);
  const sentParity = async (name, ref, method, params, from) => {
    const full = async () => { const g2 = await svc.gapInfo(ref); return { turns: g2.fp ? await svc.fullTurnmap(ref, g2.fp) : [], ...(g2.gap || {}) }; };   // the agent's op shape
    const hub = J(await (method === 'page' ? svc.page(ref, params) : method === 'turnmap' ? svc.turnmap(ref) : full()));
    const dev = J(await dm.transcriptOp(method, ref, { ...params, sent: SP.sentFor(ref.sessionId, from) }));
    ok(dev === hub && verdictOf(hub.includes('auto-resume')), `B-9a2e ${name}: the agent handed the hub's rows answers BYTE-IDENTICAL to the hub's own read — VibeSpace's continue keeps its origin (${hub.length}b)`);
    if (dev !== hub) console.error('    diff ' + firstDiff(hub, dev));
    return hub;
  };
  const bareOf = async (ref, method) => J(await dm.transcriptOp(method, ref, {}));
  try {
    const ref = (id, backend = 'codex') => ({ backend, sessionId: id, cwd: CWD });
    const hubX = await sentParity('codex page', ref(SR.X), 'page', {});
    await sentParity('codex turnmap', ref(SR.X), 'turnmap', {});
    await sentParity('codex fullTurnmap', ref(SR.X), 'fullTurnmap', {});
    const bareX2 = await bareOf(ref(SR.X2), 'page');
    ok(!bareX2.includes('auto-resume') && bareX2.replaceAll(SR.X2, SR.X) !== hubX, 'B-9a2e CONTROL: the same records under another id, the op WITHOUT the rows (the road before this unit) — the agent reads the continue as the person\'s');
    await sentParity('codex FORK page (the parent\'s records prepended: the parent\'s id handed beside the fork\'s)', ref(SR.Y), 'page', {}, [SR.X]);
    const ownOnly = J(await dm.transcriptOp('page', ref(SR.Y2), { sent: SP.sentFor(SR.Y2) }));
    ok(!ownOnly.includes('auto-resume'), 'B-9a2e CONTROL: the fork handed ONLY its own id\'s rows — the parent\'s continue reads as the person\'s on the agent (why the helper hands every id the read consults)');
    // THE HUB'S OWN ROAD to the real agent (src/transcript-service.js tryDevice): a fork the hub cannot name the parent of — the agent's
    // ack names the parent its read consulted with nothing handed, the hub hands it in ONE more ask: the hub's own read, byte for byte
    const asks = [];
    const counted = { connect: () => dm.connect(), transcriptOp: (m, r2, p, info) => { asks.push(Object.keys((p && p.sent) || {}).join('+')); return dm.transcriptOp(m, r2, p, info); } };
    const roadSvc = createTranscriptService({ activeSessions: new Map(), createSessionMessages: (s) => (s?.backend === 'codex' ? new CodexSessionMessages(s, undefined, {}) : new SessionMessages(s, undefined, {})), hosts: { deviceBounded: async () => counted } });
    const viaRoad = J(await roadSvc.page({ ...ref(SR.Y2), host: 'h-paired' }, {}));
    const hubY2 = J(await svc.page(ref(SR.Y2), {}));
    ok(viaRoad === hubY2 && gateOf(hubY2.includes('auto-resume')) && asks.join() === `${SR.Y2},${SR.Y2}+${SR.X}`, `B-9a2e: the hub's road to the paired machine — the fork's parent, named by the agent's ack, handed in one more ask: BYTE-IDENTICAL to the hub's own read (asks: ${asks.join(' | ')})`);
    if (viaRoad !== hubY2) console.error('    diff ' + firstDiff(hubY2, viaRoad));
    await sentParity('claude page', ref(SR.C, 'claude'), 'page', {});
    await sentParity('claude turnmap', ref(SR.C, 'claude'), 'turnmap', {});
    await sentParity('claude fullTurnmap', ref(SR.C, 'claude'), 'fullTurnmap', {});
    const bareC2 = await bareOf(ref(SR.C2, 'claude'), 'page');
    ok(!bareC2.includes('auto-resume') && verdictOf(bareC2.includes('"typed":true')), 'B-9a2e CONTROL (claude): the op without the rows — the continue reads as typed by the person');
  } finally { SP.setSource(null); }
}
// B-9a2e (round w5vyt4hhv's second small) — A CONVERSATION OF ANOTHER MACHINE, ON BOTH ROADS: the fork Y2 consults its parent X. A
// read of Y2 for the paired machine 'h-paired' — through the agent (the one more ask) and on the hub's own fallback (no agent asked:
// the hub converts the copy itself, under the same gate) — gives ONE answer: X noted on ANOTHER machine is handed on neither road
// (the continue is today's on both); X noted on THAT machine is handed on both (VibeSpace's on both). This hub's own read: ungated.
{
  const SP = require(REPO + '/src/sent-provenance.js');
  const row = SP.rowOf(SR_CONT, 'auto-resume', srAt);
  SP.setSource((conv) => (conv === SR.X || conv === SR.Y2 ? [row] : null));
  const make = (hosts, live = null) => createTranscriptService({ activeSessions: new Map(live ? [['w-live', live]] : []), createSessionMessages: (s) => (s?.backend === 'codex' ? new CodexSessionMessages(s, undefined, {}) : new SessionMessages(s, undefined, {})), hosts });
  const yref = { backend: 'codex', sessionId: SR.Y2, cwd: CWD, host: 'h-paired' };
  const roads = (live = null) => {
    const asks = [];
    const agent = make({ deviceBounded: async () => ({ connect: () => dm.connect(), transcriptOp: (m, r2, p, info) => { asks.push(Object.keys((p && p.sent) || {}).join('+')); return dm.transcriptOp(m, r2, p, info); } }) }, live);
    const fallback = make({ fetchTranscript: async () => { } }, live);   // no device: the hub reads the copy here
    return { agent, fallback, asks };
  };
  const both = async (live = null) => {
    const { agent, fallback, asks } = roads(live);
    return { viaAgent: J(await agent.page(yref, {})), viaHub: J(await fallback.page(yref, {})), asks };
  };
  const slabs = async () => {   // a claude SLAB (gapSlab) of C4, whose record carries C's id, on both roads
    const cref = { backend: 'claude', sessionId: SR.C4, cwd: CWD, host: 'h-paired' };
    const { agent, fallback } = roads();
    const viaAgent = J(await agent.gapSlab(cref, '\u0000device:h-paired', 0, 10));
    const g = await fallback.gapInfo(cref);
    const viaHub = J(g.fp ? await fallback.gapSlab(cref, g.fp, 0, 10) : null);
    return { viaAgent, viaHub };
  };
  try {
    SP.setPlaces((id) => (id === SR.X ? 'h-else' : undefined));
    const far = await both();
    const own = J(await svc.page({ backend: 'codex', sessionId: SR.Y2, cwd: CWD }, {}));
    ok(far.viaAgent === far.viaHub && !far.viaHub.includes('auto-resume') && far.asks.join() === SR.Y2 && verdictOf(own.includes('auto-resume')), `B-9a2e: the parent noted on ANOTHER machine — the agent's road and the hub's fallback give ONE answer, the parent's rows handed on neither (asks: ${far.asks.join(' | ')}); this hub's own read stamps it`);
    if (far.viaAgent !== far.viaHub) console.error('    diff ' + firstDiff(far.viaHub, far.viaAgent));
    SP.setPlaces((id) => (id === SR.X ? 'h-paired' : undefined));
    const near = await both();
    ok(near.viaAgent === near.viaHub && gateOf(near.viaHub.includes('auto-resume')) && near.asks.join() === `${SR.Y2},${SR.Y2}+${SR.X}`, `B-9a2e: the parent noted on THAT machine — handed on both roads, ONE answer (VibeSpace's continue) (asks: ${near.asks.join(' | ')})`);
    if (near.viaAgent !== near.viaHub) console.error('    diff ' + firstDiff(near.viaHub, near.viaAgent));
    // THE LIVE CHAIN (the gate's own ids): a live session of the fork, not yet read here, names X in its chain — X is handed on both
    // roads although noted on another machine (the device road hands the chain at its first ask; the fallback's gate holds it)
    SP.setPlaces((id) => (id === SR.X ? 'h-else' : undefined));
    const chain = await both({ backend: 'codex', backendSessionId: SR.Y2, host: 'h-paired', cwd: CWD, forkedFrom: [SR.X] });
    ok(chain.viaAgent === chain.viaHub && gateOf(chain.viaHub.includes('auto-resume')) && chain.asks.join() === `${SR.Y2}+${SR.X}`, `B-9a2e: a live session's own chain names the parent — handed on both roads, ONE answer (asks: ${chain.asks.join(' | ')})`);
    if (chain.viaAgent !== chain.viaHub) console.error('    diff ' + firstDiff(chain.viaHub, chain.viaAgent));
    // A SLAB (gapSlab): C4's record carries C's id — C noted on another machine: handed on neither road; on that machine: on both
    SP.setSource((conv) => (conv === SR.X || conv === SR.Y2 || conv === SR.C ? [row] : null));
    SP.setPlaces((id) => (id === SR.C ? 'h-else' : undefined));
    const slabFar = await slabs();
    SP.setPlaces((id) => (id === SR.C ? 'h-paired' : undefined));
    const slabNear = await slabs();
    ok(slabFar.viaAgent === slabFar.viaHub && !slabFar.viaHub.includes('auto-resume') && slabNear.viaAgent === slabNear.viaHub && verdictOf(slabNear.viaHub.includes('auto-resume')),
      'B-9a2e: a claude SLAB whose record carries another conversation\'s id — of another machine: handed on neither road; of that machine: on both — ONE answer each');
    if (slabNear.viaAgent !== slabNear.viaHub) console.error('    diff ' + firstDiff(slabNear.viaHub, slabNear.viaAgent));
  } finally { SP.setPlaces(null); SP.setSource(null); }
}
// B-9a2e part 2 — THE LINK A FORK'S ADOPTION KEPT: a stopped fork VibeSpace made (Y3, of X), read on the paired machine with only
// its own id given — the hub's real record (src/server/sent-record.js) names the parent through the link the fork's first id report
// kept, so the agent is handed X's rows too: byte-identical to the hub's own read, the parent's continue VibeSpace's on both
{
  const SP = require(REPO + '/src/sent-provenance.js');
  const SRmod = require(REPO + '/src/server/sent-record.js');
  SRmod.install({ dataDir, writer: { dirty: () => { } }, readFile: () => { throw Object.assign(new Error('no record yet'), { code: 'ENOENT' }); }, now: () => srAt });
  try {
    const parent = { backend: 'codex', backendSessionId: SR.X };
    SRmod.adoptFor(parent);   // the parent's id reported, then VibeSpace's continue sent into it
    SRmod.noteFor(parent, { text: SR_CONT, kind: 'auto-resume', at: srAt });
    const fork = { backend: 'codex', backendSessionId: SR.X };   // a fork spawned from the parent's id; its road records where it came from and adopts the new one (codex-events)
    fork.forkedFrom = [SR.X]; fork.backendSessionId = SR.Y3;
    SRmod.adoptFor(fork);
    const yref = { backend: 'codex', sessionId: SR.Y3, cwd: CWD };
    const hub = J(await svc.page(yref, {}));
    const sent = SP.sentFor(SR.Y3);
    const dev = J(await dm.transcriptOp('page', yref, { sent }));
    ok(Object.keys(sent).join() === SR.X && dev === hub && verdictOf(hub.includes('auto-resume')), 'B-9a2e part 2: a stopped fork VibeSpace made, read on its paired machine with only its own id given — the link its adoption kept hands the parent\'s rows: BYTE-IDENTICAL to the hub\'s read, the parent\'s continue VibeSpace\'s on both');
    if (dev !== hub) console.error('    diff ' + firstDiff(hub, dev));
  } finally { SRmod.install(null); }
}

os.homedir = origHomedir;
// Teardown: the daemon keeps writing its state files while it shuts down, so a
// bare rmSync right after SIGTERM raced it (ENOTEMPTY on the scratch home —
// three red fast gates on 2026-09-23 with every assertion green). Wait for the
// pid to be gone first, then remove with retries.
{
  let pid = 0;
  try { pid = parseInt(fs.readFileSync(path.join(process.env.VIBESPACE_AGENTD_ROOT, 'state', 'agentd.pid'), 'utf-8')) || 0; } catch { }
  if (pid) {
    try { process.kill(pid); } catch { }
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      try { process.kill(pid, 0); } catch { break; }
      await new Promise((r) => setTimeout(r, 50));
    }
    try { process.kill(pid, 'SIGKILL'); } catch { }
  }
  for (const d of [home, dataDir]) fs.rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
