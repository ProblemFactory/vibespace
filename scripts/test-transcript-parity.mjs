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
ok(big.a.includes('大文本结尾марker'), 'multibyte content survived chunked byte-channel transfer intact');
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
  ok(p1.a !== p0.a && p1.a.includes('done 完成') && !p1.a.includes('sidechain noise') && st1.a !== st0.a && st1.a.includes('"completed"'), 'the appended records are visible on both legs (text, TodoWrite state), the sidechain one is not');
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
ok(hg.gap && hg.gap.totalLines === 18000 && hg.gap.tailStartLine > 0, `huge fixture has a REAL gap (${hg.gap?.gapRecords} gap records, tail from line ${hg.gap?.tailStartLine})`);
await parity('gapInfo (huge file)', Promise.resolve({ gap: hg.gap, hasFile: !!hg.fp }), ['gapInfo', href, {}]);
await parity('gapSlab (seek-read mid-file)', (async () => ({ messages: await svc.gapSlab(href, hg.fp, 40, 190) }))(), ['gapSlab', href, { fromLine: 40, toLine: 190 }]);
await parity('fullTurnmap (streaming scan)', (async () => ({ turns: await svc.fullTurnmap(href, hg.fp), ...(hg.gap || {}) }))(), ['fullTurnmap', href, {}]);

// codex leg — different parser, same contract
const cref = { backend: 'codex', sessionId: TID, cwd: CWD };
await parity('codex page', svc.page(cref, {}), ['page', cref, {}]);
const cg = await svc.gapInfo(cref);
await parity('codex gapInfo', Promise.resolve({ gap: cg.gap, hasFile: !!cg.fp }), ['gapInfo', cref, {}]);

// searchFull op (2.293.0 — the last read the seek family needed to switch)
await parity('searchFull', (async () => { const g2 = await svc.gapInfo(href); return svc.searchFull(href, g2.fp, '问题'); })(), ['searchFull', href, { q: '问题' }]);

// contract hygiene
let unknownErr = null;
try { await dm.transcriptOp('rm-rf', ref, {}); } catch (e) { unknownErr = e; }
ok(unknownErr && /unknown transcript method/.test(unknownErr.message), 'unknown method surfaces as a NAMED error, never hangs');
const missing = await dm.transcriptOp('gapInfo', { backend: 'claude', sessionId: 'ffffffff-0000-0000-0000-000000000000', cwd: CWD }, {});
ok(missing.hasFile === false && missing.gap === null, 'missing transcript answers honestly (hasFile:false), not an error');

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
process.exit(fail ? 1 : 0);
