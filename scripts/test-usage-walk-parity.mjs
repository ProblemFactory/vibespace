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
  // walker v3 (per-message meta work): the 0.153 token_usage_record that
  // PRECEDES a token_count names the vendor response id → `mid`; the
  // turn_context effort → `effort`. rid is UNCHANGED (the dedup key already
  // baked into permanent ledgers — changing it would double-count every
  // scanned rollout). The second response has no record (pre-0.153 shape) —
  // no mid may be invented for it.
  const rollout = [
    { timestamp: cxts(0), type: 'session_meta', payload: { id: TID, cwd: '/tmp/cx', cli_version: '0.153.4' } },
    { timestamp: cxts(0), type: 'turn_context', payload: { turn_id: 't1', model: 'gpt-5.6-sol', cwd: '/tmp/cx', effort: 'high' } },
    { timestamp: cxts(1), type: 'response_item', payload: { type: 'message', id: 'msg_a1', role: 'assistant', content: [{ type: 'output_text', text: 'first reply' }] } },
    { timestamp: cxts(1), type: 'token_usage_record', payload: { thread_id: TID, turn_id: 't1', response_id: 'resp_p1', usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50, total_tokens: 1050 }, thread_token_usage: { total_tokens: 1050 } } },
    { timestamp: cxts(1), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 50, total_tokens: 1050 }, total_token_usage: { total_tokens: 1050 } } } },
    { timestamp: cxts(2), type: 'event_msg', payload: { type: 'token_count', info: null } }, // rate-limit heartbeat — skip
    { timestamp: cxts(3), type: 'response_item', payload: { type: 'message', id: 'msg_a2', role: 'assistant', content: [{ type: 'output_text', text: 'second reply' }] } },
    { timestamp: cxts(3), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 1200, cached_input_tokens: 1100, output_tokens: 80 }, total_token_usage: { total_tokens: 2330 } } } },
  ];
  fs.mkdirSync(cxDir, { recursive: true });
  const rolloutFile = path.join(cxDir, `rollout-2026-08-11T00-00-00-${TID}.jsonl`);
  fs.writeFileSync(rolloutFile, rollout.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const runScanner = (cursorEnv) => execFileSync(process.execPath, [path.join(REPO, 'data/bin/vibespace-usage-scan')], {
    encoding: 'utf8', env: { ...process.env, HOME: home, CODEX_HOME: path.join(home, '.codex'), VIBESPACE_USAGE_CURSOR: cursorEnv }, timeout: 30000,
  });
  const scCursor = path.join(dataDir, 'cx-scan-cursor.json');
  const scOut = runScanner(scCursor);
  const scEvs = scOut.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const scCx = scEvs.filter((e) => e.be === 'codex');
  ok(scCx.length === 2, `scanner emits 2 codex events, heartbeat skipped (${scCx.length})`);
  ok(scCx[0].rid === 'cx:' + TID + ':1050' && scCx[1].rid === 'cx:' + TID + ':2330', 'codex rids = cumulative totals (replay-dedupable) — UNCHANGED by the mid/effort fields');
  ok(scCx[0].model === 'gpt-5.6-sol' && scCx[0].cwd === '/tmp/cx', 'model/cwd carried from the preceding turn_context');
  ok(scCx[0].i === 200 && scCx[0].cr === 800 && scCx[0].o === 50, 'input-minus-cached split (i=fresh, cr=cached)');
  ok(scCx[0].mid === 'resp_p1' && scCx[0].effort === 'high', 'scanner bakes mid = the preceding token_usage_record response_id + effort from turn_context');
  ok(!('mid' in scCx[1]) && scCx[1].effort === 'high', 'a token_count with no token_usage_record (pre-0.153) gets NO invented mid; effort persists');

  const { runUsageWalk: walk2 } = require(path.join(REPO, 'src/usage-walker.js'));
  const prevCodexHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = path.join(home, '.codex');
  const modCursor = path.join(dataDir, 'cx-mod-cursor.json');
  const mod = walk2({ home, cursorFile: modCursor });
  if (prevCodexHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevCodexHome;
  const modCx = mod.events.map((l) => JSON.parse(l)).filter((e) => e.be === 'codex');
  ok(JSON.stringify(modCx) === JSON.stringify(scCx), 'module codex events BYTE-IDENTICAL to the scanner (mid + effort included)');

  process.env.CODEX_HOME = path.join(home, '.codex');
  const uh3 = new UsageHistory({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vs-walkpar-cx2-')), homeDir: home });
  uh3.scan({ force: true });
  if (prevCodexHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevCodexHome;
  const l3 = uh3._loadEvents();
  const localCx = (l3?.events || l3 || []).filter((e) => e.be === 'codex');
  ok(localCx.length === 2 && localCx.every((e, i) => e.rid === scCx[i].rid), 'LOCAL walk counts the same codex rids (three-walker parity)');
  ok(localCx[0].mid === 'resp_p1' && localCx[0].effort === 'high' && !('mid' in localCx[1]), 'LOCAL ledger bakes the same mid/effort (scan enrichment passes them through)');
  // the rid-info route's two lookups (rid first, mid fallback) resolve a codex event
  ok(uh3.eventForRid('cx:' + TID + ':1050')?.mid === 'resp_p1', 'eventForRid finds the codex event by its ledger key');
  ok(uh3.eventForMid('resp_p1')?.rid === 'cx:' + TID + ':1050', 'eventForMid finds the codex event by its response id');

  // THE JOIN the popup depends on: the codex normalizer must derive the SAME
  // requestId the ledger minted for this rollout, and the same msgId.
  const { CodexMessageManager } = require(path.join(REPO, 'src/codex-message-manager.js'));
  const msgs = new CodexMessageManager('cx-join').convertHistory(rollout).filter((m) => m.role === 'assistant');
  ok(msgs.length === 2 && msgs[0].meta?.requestId === scCx[0].rid && msgs[0].meta.msgId === scCx[0].mid && msgs[1].meta?.requestId === scCx[1].rid && msgs[1].meta.msgId === null, `normalizer meta.requestId === ledger rid / meta.msgId === ledger mid for the same rollout (${msgs.map((m) => m.meta?.requestId + '/' + m.meta?.msgId).join(', ')})`);
  ok(msgs[0].meta.usage.input_tokens === scCx[0].i && msgs[0].meta.usage.cache_read_input_tokens === scCx[0].cr && msgs[0].meta.usage.output_tokens === scCx[0].o && msgs[0].meta.effort === scCx[0].effort, 'normalizer usage split + effort equal the ledger fields');

  // SCAN BOUNDARY between the pair: the pending response id is parked in the
  // cursor, so a harvest that lands between token_usage_record and its
  // token_count still yields the mid on the next run (both walkers).
  fs.appendFileSync(rolloutFile, JSON.stringify({ timestamp: cxts(4), type: 'token_usage_record', payload: { thread_id: TID, turn_id: 't1', response_id: 'resp_p3', usage: { input_tokens: 500, cached_input_tokens: 0, output_tokens: 100, total_tokens: 600 } } }) + '\n');
  ok(runScanner(scCursor).split('\n').filter(Boolean).length === 0, 'scanner: a trailing token_usage_record alone emits nothing');
  fs.writeFileSync(modCursor, JSON.stringify(mod.cursors));
  process.env.CODEX_HOME = path.join(home, '.codex');
  const modMid = walk2({ home, cursorFile: modCursor });
  ok(modMid.events.length === 0 && modMid.cursors[rolloutFile]?.pendMid === 'resp_p3', 'module: the pending response id rides the returned cursor (two-phase commit keeps it)');
  fs.writeFileSync(modCursor, JSON.stringify(modMid.cursors));
  fs.appendFileSync(rolloutFile, JSON.stringify({ timestamp: cxts(5), type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 500, cached_input_tokens: 0, output_tokens: 100, total_tokens: 600 }, total_token_usage: { total_tokens: 2930 } } } }) + '\n');
  const scLate = runScanner(scCursor).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const modLate = walk2({ home, cursorFile: modCursor }).events.map((l) => JSON.parse(l));
  if (prevCodexHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = prevCodexHome;
  ok(scLate.length === 1 && scLate[0].rid === 'cx:' + TID + ':2930' && scLate[0].mid === 'resp_p3', 'scanner: the token_count in the NEXT run still pairs with the parked record');
  ok(JSON.stringify(modLate) === JSON.stringify(scLate), 'module: identical late event (parity across the boundary)');
}

// ── ORIGIN, BOTH SPELLINGS (2026-09-10) ──────────────────────────────────
// Every event says WHICH kind of transcript produced it, an agent event is
// attributed to the PARENT project's cwd, and the agent's own directory rides
// along as `wcwd` only when it differs (the git-worktree case, which is what
// made "By project" list a throwaway worktree as its own project). Three file
// kinds, one fixture, both walkers — a one-sided edit fails HERE.
{
  const oHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-walkpar-org-'));
  const OSID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
  const OREPO = '/home/u/repo';
  const OTREE = '/home/u/repo/.claude/worktrees/agent-wt';
  const oProj = path.join(oHome, '.claude', 'projects', OREPO.replace(/[/._]/g, '-'));
  const orec = (rid, cwd) => JSON.stringify({
    type: 'assistant', requestId: rid, timestamp: '2026-08-09T08:00:00.000Z', cwd,
    message: { id: 'msg_' + rid, model: 'claude-fable-5', usage: { input_tokens: 100, output_tokens: 20 } },
  }) + '\n';
  write(path.join(oProj, OSID + '.jsonl'), orec('req_o_main', OREPO));
  write(path.join(oProj, OSID, 'subagents', 'agent-sub1.jsonl'), orec('req_o_sub', OREPO));
  // the workflow agent ran in a git worktree — the whole reason `wcwd` exists
  write(path.join(oProj, OSID, 'subagents', 'workflows', 'wf_run9', 'agent-wt.jsonl'), orec('req_o_wf', OTREE));
  // a SECOND session whose own transcript is gone: the project cwd must still
  // resolve, from a sibling top-level transcript (every transcript in a project
  // dir shares one cwd by construction — the dir name IS the encoded cwd)
  const OSID2 = 'dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb';
  write(path.join(oProj, OSID2, 'subagents', 'agent-orphan.jsonl'), orec('req_o_orphan', OTREE));

  const { runUsageWalk: walkOrg } = require(path.join(REPO, 'src/usage-walker.js'));
  const modOrg = walkOrg({ home: oHome, cursorFile: path.join(dataDir, 'org-mod-cursor.json') }).events.map((l) => JSON.parse(l));
  const scanOrg = execFileSync(process.execPath, [path.join(REPO, 'data/bin/vibespace-usage-scan')], {
    encoding: 'utf8', env: { ...process.env, HOME: oHome, CODEX_HOME: path.join(oHome, '.codex'), VIBESPACE_USAGE_CURSOR: path.join(dataDir, 'org-scan-cursor.json') }, timeout: 30000,
  }).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const byRid = (evs) => Object.fromEntries(evs.map((e) => [e.rid, e]));
  const mo = byRid(modOrg), so = byRid(scanOrg);

  ok(modOrg.length === 4 && scanOrg.length === 4, `both walkers count all four requests (${modOrg.length}/${scanOrg.length})`);
  ok(mo.req_o_main?.origin === 'main' && !('wf' in mo.req_o_main) && !('agent' in mo.req_o_main) && !('wcwd' in mo.req_o_main) && mo.req_o_main.cwd === OREPO,
    'a top-level transcript is origin "main" and carries no agent fields (a main row must not grow four keys for nothing)');
  ok(mo.req_o_sub?.origin === 'subagent' && mo.req_o_sub.agent === 'agent-sub1' && !('wf' in mo.req_o_sub)
    && mo.req_o_sub.cwd === OREPO && !('wcwd' in mo.req_o_sub),
    'a subagent event names its agent file; same cwd as its parent ⇒ NO wcwd (an equal copy is bytes with no information)');
  ok(mo.req_o_wf?.origin === 'workflow' && mo.req_o_wf.wf === 'wf_run9' && mo.req_o_wf.agent === 'agent-wt'
    && mo.req_o_wf.cwd === OREPO && mo.req_o_wf.wcwd === OTREE,
    `a workflow agent in a worktree is attributed to the PARENT project and keeps its own dir as wcwd (${mo.req_o_wf?.cwd} / ${mo.req_o_wf?.wcwd})`);
  ok(mo.req_o_orphan?.cwd === OREPO && mo.req_o_orphan?.wcwd === OTREE,
    'the project cwd resolves from a SIBLING transcript when the parent\'s own file is gone (never decoded from the directory name)');
  ok(JSON.stringify(modOrg) === JSON.stringify(scanOrg),
    'module and shipped scanner events are BYTE-IDENTICAL over all three file kinds (origin/wf/agent/wcwd included)');

  // A CONVERSATION'S cwd IS NOT CONSTANT. Measured on this instance: 3 of 782
  // top-level transcripts state more than one, and one of them is the biggest
  // spender here — a directory rename left its FIRST record saying
  // `…/claude-code-webui` while its latest records and its project directory
  // both say `…/vibespace`, so "the first cwd" filed $7,828 of one
  // conversation's agent spend under a path that no longer exists, in a SECOND
  // "By project" row beside that same conversation's own main spend. The
  // project DIRECTORY NAME is the forward ENCODING of the cwd, so a candidate
  // can be verified; and when nothing matches, the conversation's MOST RECENT
  // cwd wins. Both spellings, one fixture — a one-sided edit fails here.
  {
    const OLD = '/home/u/old-name';
    const RSID = 'eeeeeeee-ffff-4aaa-8bbb-cccccccccccc';
    // (a) both cwds inside the head window ⇒ the encode match decides
    write(path.join(oProj, RSID + '.jsonl'), orec('req_o_ren0', OLD) + orec('req_o_ren1', OREPO));
    write(path.join(oProj, RSID, 'subagents', 'agent-ren.jsonl'), orec('req_o_ren_sub', OTREE));
    // (b) the CURRENT cwd only in the TAIL (the head window is 128 KiB, and a
    //     long conversation's early records are the stale ones)
    const TSID = 'ffffffff-aaaa-4bbb-8ccc-dddddddddddd';
    const filler = JSON.stringify({ type: 'user', cwd: OLD, message: { role: 'user', content: 'x'.repeat(400) } }) + '\n';
    write(path.join(oProj, TSID + '.jsonl'), orec('req_o_tail0', OLD) + filler.repeat(400) + orec('req_o_tail1', OREPO));
    write(path.join(oProj, TSID, 'subagents', 'agent-tail.jsonl'), orec('req_o_tail_sub', OTREE));

    const modR = byRid(walkOrg({ home: oHome, cursorFile: path.join(dataDir, 'org-mod-cursor2.json') }).events.map((l) => JSON.parse(l)));
    const scanR = byRid(execFileSync(process.execPath, [path.join(REPO, 'data/bin/vibespace-usage-scan')], {
      encoding: 'utf8', env: { ...process.env, HOME: oHome, CODEX_HOME: path.join(oHome, '.codex'), VIBESPACE_USAGE_CURSOR: path.join(dataDir, 'org-scan-cursor2.json') }, timeout: 30000,
    }).split('\n').filter(Boolean).map((l) => JSON.parse(l)));

    ok(modR.req_o_ren_sub?.cwd === OREPO && modR.req_o_ren_sub?.wcwd === OTREE,
      `a RENAMED conversation's agent follows the cwd that encodes to the project dir, not the first record's (${modR.req_o_ren_sub?.cwd})`);
    ok(modR.req_o_tail_sub?.cwd === OREPO,
      `…and the head window holding only the stale path is not the end of the ladder — the TAIL answers (${modR.req_o_tail_sub?.cwd})`);
    ok(scanR.req_o_ren_sub?.cwd === OREPO && scanR.req_o_tail_sub?.cwd === OREPO,
      'the shipped scanner resolves both shapes identically (the mirror is behavioural, not textual)');
    ok(modR.req_o_ren0?.cwd === OLD && modR.req_o_ren1?.cwd === OREPO,
      'NEGATIVE CONTROL: a MAIN row still carries its own record\'s cwd — only agent rows are re-attributed');
  }
  ok(scanOrg.every((e) => typeof e.origin === 'string' && e.origin),
    'the shipped scanner stamps an origin on EVERY event (a remote host that runs workflows is exactly where the split matters)');
  ok(so.req_o_wf?.wf === 'wf_run9' && so.req_o_wf?.agent === 'agent-wt' && so.req_o_wf?.wcwd === OTREE,
    'the shipped scanner carries wf/agent/wcwd too — the 2.265.0/2.271.0 one-sided-port class');

  // …and the LOCAL ledger passes them through the scan enrichment unchanged.
  const uhOrg = new UsageHistory({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'vs-walkpar-org-data-')), homeDir: oHome });
  uhOrg.scan({ force: true });
  const lo = byRid([...uhOrg._events(0, Date.now() + 1e9)]);
  ok(lo.req_o_wf?.origin === 'workflow' && lo.req_o_wf.wf === 'wf_run9' && lo.req_o_wf.agent === 'agent-wt'
    && lo.req_o_wf.cwd === OREPO && lo.req_o_wf.wcwd === OTREE && lo.req_o_main?.origin === 'main',
    'the LOCAL ledger bakes origin/wf/agent/wcwd (three-walker parity)');


  fs.rmSync(oHome, { recursive: true, force: true });
}

// ── THE FIXTURE GUARD, BOTH SPELLINGS (2026-09-09) ───────────────────────
// A suite's SYNTHETIC transcript is not usage. The module requires
// src/fixture-guard.js; the shipped scanner carries an INLINE COPY because a
// checkout-less ssh host cannot require src/ (the same documented exception as
// the walk itself). Two spellings of one rule = the twin class, so both are
// driven over the same table, on the same fixture tree, in one run.
{
  const fxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-walkpar-fx-'));
  const FX_SID = 'e2e00000-0000-4000-8000-000000000001';
  const REAL_SID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
  const rec2 = (mid) => JSON.stringify({
    type: 'assistant', requestId: mid, timestamp: new Date().toISOString(),
    message: { id: mid, model: 'claude-fable-5', usage: { input_tokens: 100, output_tokens: 20 } },
  }) + '\n';
  const enc = (cwd) => cwd.replace(/[/._]/g, '-');
  // (1) a fixture cwd holding a REAL-looking conversation id — the project-dir
  //     rung (this is the wire probe / chat-e2e shape: a real CLI turn in a
  //     throwaway cwd)
  write(path.join(fxHome, '.claude', 'projects', enc('/tmp/vs-chatpage-test-1234'), REAL_SID + '.jsonl'), rec2('req_fx_dir'));
  // (2) the SYNTHETIC sid in an ordinary project dir — the sid rung, which is
  //     the ONLY evidence that survives when the fixture carries no cwd (a
  //     hand-written assistant record has none)
  write(path.join(fxHome, '.claude', 'projects', enc('/home/u/work'), FX_SID + '.jsonl'), rec2('req_fx_sid'));
  // (3) NEGATIVE CONTROL: an ordinary conversation in an ordinary dir. Without
  //     it, "0 events" below could just mean the fixture tree is broken.
  write(path.join(fxHome, '.claude', 'projects', enc('/home/u/work'), REAL_SID + '.jsonl'), rec2('req_real'));

  const { runUsageWalk: walkFx } = require(path.join(REPO, 'src/usage-walker.js'));
  const modEvs = walkFx({ home: fxHome, cursorFile: path.join(dataDir, 'fx-mod-cursor.json') })
    .events.map((l) => JSON.parse(l));
  const scanOut = execFileSync(process.execPath, [path.join(REPO, 'data/bin/vibespace-usage-scan')], {
    encoding: 'utf8', env: { ...process.env, HOME: fxHome, CODEX_HOME: path.join(fxHome, '.codex'), VIBESPACE_USAGE_CURSOR: path.join(dataDir, 'fx-scan-cursor.json') }, timeout: 30000,
  });
  const scanEvs = scanOut.split('\n').filter(Boolean).map((l) => JSON.parse(l));

  ok(modEvs.length === 1 && modEvs[0].rid === 'req_real',
    `module: only the REAL conversation walks — the fixture cwd and the synthetic sid are refused (${modEvs.map((e) => e.rid).join(',') || 'none'})`);
  ok(scanEvs.length === 1 && scanEvs[0].rid === 'req_real',
    `shipped scanner: identical refusal (${scanEvs.map((e) => e.rid).join(',') || 'none'})`);
  ok(JSON.stringify(modEvs) === JSON.stringify(scanEvs), 'module and scanner events are BYTE-IDENTICAL over the fixture tree');

  // The PREDICATES themselves, same table, both spellings. The scanner's copy
  // is extracted from its own SOURCE and evaluated, so a one-sided edit to
  // either fails here rather than at the next incident.
  const G = require(path.join(REPO, 'src/fixture-guard.js'));
  const scanSrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-usage-scan'), 'utf-8');
  const a = scanSrc.indexOf('const FIXTURE_CWD_PREFIX');
  const b = scanSrc.indexOf('const isFixtureSid');
  const bEnd = scanSrc.indexOf('\n', b);
  ok(a > 0 && b > a, 'the scanner carries the inline copy where this test can read it');
  const block = scanSrc.slice(a, bEnd + 1);
  // eslint-disable-next-line no-new-func
  const mirror = new Function(block + '\nreturn { isFixtureProjectDir, isFixtureSid, FIXTURE_SID_PREFIX, FIXTURE_CWD_PREFIX, TMP_ROOTS };')();
  ok(mirror.FIXTURE_SID_PREFIX === G.FIXTURE_SID_PREFIX && mirror.FIXTURE_CWD_PREFIX === G.FIXTURE_CWD_PREFIX
    && JSON.stringify(mirror.TMP_ROOTS) === JSON.stringify(G.TMP_ROOTS),
    'the inline copy declares the SAME constants as src/fixture-guard.js');
  const TABLE_DIRS = [
    '-tmp-vs-chatpage-test-1234', '-tmp-vs-chat-e2e-cwd-Q9oyO8', '-tmp-vs-wire-probe-abc',
    '-var-tmp-vs-mmjump-test-9', '-tmp-vs-', '-tmp-vsv-probe', '-home-u-workspace-vibespace',
    '-tmp-otel-cap-cwd-Q9oyO8', '-tmp', '', 'vs-chatpage-test-1',
  ];
  const TABLE_SIDS = [
    'e2e00000-0000-4000-8000-000000000001', 'E2E00000-0000-4000-8000-00000000000A',
    'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff', 'e2e00000-0000-4000-8000', '', 'agent-plain1',
  ];
  const dirsDiff = TABLE_DIRS.filter((d) => !!G.isFixtureProjectDir(d) !== !!mirror.isFixtureProjectDir(d));
  const sidsDiff = TABLE_SIDS.filter((d) => !!G.isFixtureSid(d) !== !!mirror.isFixtureSid(d));
  ok(dirsDiff.length === 0, `both spellings agree on ${TABLE_DIRS.length} project-dir names`, JSON.stringify(dirsDiff));
  ok(sidsDiff.length === 0, `both spellings agree on ${TABLE_SIDS.length} session ids`, JSON.stringify(sidsDiff));
  // The table must be non-vacuous in BOTH directions, or "they agree" would be
  // satisfied by two predicates that always say no.
  ok(TABLE_DIRS.some((d) => G.isFixtureProjectDir(d)) && TABLE_DIRS.some((d) => !G.isFixtureProjectDir(d))
    && TABLE_SIDS.some((d) => G.isFixtureSid(d)) && TABLE_SIDS.some((d) => !G.isFixtureSid(d)),
    'the parity table exercises both answers (an all-no table would agree vacuously)');

  fs.rmSync(fxHome, { recursive: true, force: true });
}

fs.rmSync(home, { recursive: true, force: true });
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
