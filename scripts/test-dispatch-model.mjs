#!/usr/bin/env node
// test-dispatch-model — lane worker-dispatch (2026-10-02, the owner: "你的辅助workers似乎是个好方案，可以节约context，
// 不过你得及时让他们compact，不然容易积累太多历史context浪费token"). FAST (in-process, no server, no network).
//   §1 THE VERDICT TABLE — src/dispatch-model.js `dispatchVerdict` over EVERY combination of caller kind × reach ×
//      target kind × target state × compactFirst × the harness's compaction lane × pace × spend, against an
//      INDEPENDENT oracle written here (the brief's rules as a reader states them), + named rows
//   §2 the record (`dispatchRecord`) over every compaction outcome, `targetFacts`, the journal line
//   §3 THE ONE OBSERVER (src/server/compaction-watch.js): notify / await / timeout / no leak; the claude stdout
//      consumer's ONE writer (`endCompaction`) notifies it (pin + census: the one `_streamingKind = null` write)
//   §4 THE REAL-ENGINE LEG — the REAL groups engine + REAL delivery ladder + REAL typing sender + REAL claude stdout
//      consumer (session-stdout) driving a stub chat CLI: `/compact` reaches it FIRST, the brief only after the CLI's
//      compaction-end record, in order; a mid-turn target gets the brief WITHOUT a compaction (said); a terminal target
//      is refused by name with nothing sent; a failed / never-ending compaction is said and the brief still goes; a
//      refused spend probe compacts nothing and wakes nobody; two concurrent dispatches compact once
//   §5 CONTROLS (scripts/mutant-copy.mjs, never src/): four patched copies of the model, each RED against the table
//   §6 PINS: the route, the CLI, the manual, the spend-census primitive, the caps row, the ci tier row
//   §7 THE SHIPPED CLI against a recording stub server: dispatch --file / send --wake --compact-first, local refusals
//   VERIFY r1 (2026-10-02, four findings reproduced on the real engines then fixed): ① a worker whose OWNER typed within
//   10 min is never compacted (user-active) and a dispatched compaction is attributed (label + live record origin);
//   ② a persisted dispatch ledger — a retry of a delivered brief is a REPLAY (nothing re-sent, even across a restart), a
//   retry after a restart mid-wait skips the compaction; ③ a wait that saw no end record says UNKNOWN; ④ only a worker
//   in a Task Group the dispatcher also belongs to is compacted (an opened reach messages, never compacts);
//   ⑤ the compaction is a COUNTED turn (peer-compact, held before the frame, noted once the CLI took it).
// Run: node scripts/test-dispatch-model.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const read = (f) => { try { return fs.readFileSync(path.join(REPO, f), 'utf8'); } catch { return ''; } };
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
const M = require(path.join(REPO, 'src/dispatch-model.js'));

// ── THE ORACLE: the brief's rules, written from the reader's side (never the module's code) ──
function oracle(f) {
  if (f.callerKind !== 'session') return { ok: false, code: 'job-token' };
  if (f.senderReach !== 'messageable' || f.targetKind === 'gone') return { ok: false, code: 'unreachable' };
  if (f.compactFirst && f.targetKind === 'terminal') return { ok: false, code: 'not-chat' };
  if (f.replay === 'delivered') return { ok: true, steps: 'replay', compact: 'skipped' };   // verify r1 ②: nothing re-sent
  if (f.pacer !== true || f.spend !== true) return { ok: true, steps: 'stash', compact: 'skipped' };
  // verify r1: ④ a Task Group both belong to · ① the owner quiet · ② no earlier attempt of this brief asked already
  const compactible = f.compactFirst && f.targetKind === 'chat' && f.compactObserved && f.sharedGroup === true && f.replay !== 'compacted' && f.targetState === 'idle';
  return { ok: true, steps: compactible ? 'compact,wait,wake' : 'wake', compact: compactible ? 'first' : 'skipped' };
}
const ALL = [];
for (const callerKind of [...M.CALLER_KINDS, 'other'])
  for (const senderReach of M.REACH_LEVELS)
    for (const targetKind of M.TARGET_KINDS)
      for (const targetState of M.TARGET_STATES)
        for (const compactFirst of [true, false])
          for (const compactObserved of [true, false])
            for (const sharedGroup of [true, false])
              for (const replay of M.REPLAYS)
                for (const pacer of [true, { reason: 'one wake per (sender, member) per 30 s' }])
                  for (const spend of [true, { why: 'hour-cap', detail: 'hour cap reached' }])
                    ALL.push({ callerKind, senderReach, targetKind, targetState, compactFirst, compactObserved, sharedGroup, replay, pacer, spend });
const tableMisses = (V) => {
  const miss = [];
  for (const f of ALL) {
    const v = V(f), o = oracle(f);
    const got = v.ok ? { ok: true, steps: v.steps.join(','), compact: v.compact } : { ok: false, code: v.code };
    if (JSON.stringify(got) !== JSON.stringify(o) || typeof v.why !== 'string' || !v.why) miss.push({ f, got, want: o });
  }
  return miss;
};

console.log('§1 the verdict table');
{
  const miss = tableMisses(M.dispatchVerdict);
  ok(miss.length === 0, `dispatchVerdict agrees with the oracle on all ${ALL.length} combinations (caller × reach × target kind × state × compactFirst × lane × shared group × replay × pace × spend), every answer with a sentence`, miss.slice(0, 3));
  const compactRows = ALL.filter((f) => M.dispatchVerdict(f).steps.includes('compact'));
  ok(compactRows.length > 0 && compactRows.every((f) => f.callerKind === 'session' && f.targetKind === 'chat' && f.targetState === 'idle' && f.compactFirst && f.compactObserved && f.sharedGroup === true && f.replay === null && f.pacer === true && f.spend === true && f.senderReach === 'messageable'),
    `the compact step appears ONLY for a session caller → a messageable, IDLE, observed chat target in a SHARED Task Group, no earlier attempt, with pace + spend granted (${compactRows.length} rows)`);
  const v = (o) => M.dispatchVerdict({ callerKind: 'session', senderReach: 'messageable', targetKind: 'chat', targetState: 'idle', compactFirst: true, compactObserved: true, sharedGroup: true, pacer: true, spend: true, ...o });
  // verify r1 ① ④ ②
  ok(v({ targetState: 'user-active' }).skip === 'user-active' && v({ targetState: 'user-active' }).steps.join() === 'wake' && /sent input OR edited its draft within the last 10 min/.test(v({ targetState: 'user-active' }).why), "①: the owner typed into the worker within USER_QUIET_MS ⇒ the brief alone, said (a person's conversation is never compacted by an agent)");
  ok(v({ sharedGroup: false }).skip === 'not-shared' && /Task Group you both belong to/.test(v({ sharedGroup: false }).why), '④: no shared Task Group (an opened reach) ⇒ the brief alone, said');
  ok(v({ replay: 'delivered' }).steps.join() === 'replay' && v({ replay: 'delivered', pacer: { reason: 'x' } }).steps.join() === 'replay' && /nothing re-sent, nothing re-compacted, nobody woken/.test(v({ replay: 'delivered' }).why), '②: a delivered brief\'s retry ⇒ replay — before the pace, nothing reserved');
  ok(v({ replay: 'compacted' }).skip === 'retry-compacted' && v({ replay: 'compacted' }).steps.join() === 'wake', '②: a retry after an attempt that typed /compact but never posted ⇒ the brief alone, said');
  ok(M.USER_QUIET_MS === 600000 && M.REPLAY_DELIVERED_MS === 600000 && M.REPLAY_COMPACT_MS === 360000, 'USER_QUIET_MS 10 min · REPLAY_DELIVERED_MS 10 min · REPLAY_COMPACT_MS 2 × the wait');
  ok(v({}).steps.join() === 'compact,wait,wake' && v({}).compact === 'first', 'idle chat worker + compactFirst ⇒ compact, wait, wake');
  ok(v({ targetState: 'busy' }).skip === 'mid-turn' && v({ targetState: 'busy' }).steps.join() === 'wake' && /queued behind it WITHOUT a compaction/.test(v({ targetState: 'busy' }).why), 'mid-turn ⇒ the brief alone, and the sentence SAYS no compaction');
  ok(v({ targetState: 'compacting' }).skip === 'compacting' && v({ targetState: 'unknown' }).skip === 'unknown-state', 'already compacting / an unknown state ⇒ never compacted on a guess');
  ok(v({ targetKind: 'terminal' }).ok === false && v({ targetKind: 'terminal' }).code === 'not-chat' && /terminal session/.test(v({ targetKind: 'terminal' }).why) && v({ targetKind: 'terminal', compactFirst: false }).steps.join() === 'wake', 'a terminal target asked to compact is refused BY NAME; without the compaction it is a plain wake');
  ok(v({ callerKind: 'job' }).code === 'job-token' && v({ callerKind: 'job', targetKind: 'gone' }).code === 'job-token', 'a jbt_ caller is refused first (never a reach oracle)');
  ok(v({ compactObserved: false }).skip === 'harness', "a harness whose stream does not say when a compaction ends ⇒ the brief alone, said");
  ok(v({ pacer: { reason: 'rate floor' } }).steps.join() === 'stash' && /rate floor/.test(v({ pacer: { reason: 'rate floor' } }).why) && v({ spend: { why: 'hour-cap', detail: 'hour cap reached' } }).steps.join() === 'stash', 'a refused pace / spend ⇒ no compaction and no wake: the brief rides the next turn, the reason named');
  ok(M.COMPACT_WAIT_MS === 180000, 'COMPACT_WAIT_MS = 180 s');
}

console.log('§2 the record, the facts, the journal line');
{
  const verdict = M.dispatchVerdict({ callerKind: 'session', senderReach: 'messageable', targetKind: 'chat', targetState: 'idle', compactFirst: true, compactObserved: true, sharedGroup: true });
  const rec = (compaction, wake = { woke: true }, charge = null) => M.dispatchRecord({ target: { cid: 'c1', name: 'w' }, verdict, compaction, wake, charge, identity: { key: 'slot-1', name: 'Personal' } });
  const okRec = rec({ ended: true, result: 'success', waitedMs: 50 });
  ok(okRec.compacted === true && okRec.wake.billed === true && okRec.wake.identity.name === 'Personal' && okRec.wake.delivered === 'woken', 'success ⇒ compacted:true, the wake billed on the named slot');
  ok(rec({ ended: true, result: 'error', error: 'Compaction canceled.' }).compacted === false && /Compaction canceled\..*delivered anyway/.test(rec({ ended: true, result: 'error', error: 'Compaction canceled.' }).why), "a failed compaction is SAID (the CLI's words) and the brief still delivered");
  ok(rec({ ended: true, result: null }).compacted === false && /without the CLI reporting success/.test(rec({ ended: true, result: null }).why), 'ended without an outcome is not success');
  ok(rec({ ended: false, timedOut: true, waitedMs: 180000 }).compacted === 'unknown' && /no end of the compaction was observed within 180 s/.test(rec({ ended: false, timedOut: true }).why) && /may have finished/.test(rec({ ended: false, timedOut: true }).why) && !/did not finish/.test(rec({ ended: false, timedOut: true }).why), 'verify r1 ③: past the wait the record says UNKNOWN (no end observed — it may have finished), never "did not finish"');
  const counted = rec({ ended: true, result: 'success' }, { woke: true }, { counted: true, identity: { key: 'slot-1', name: 'Personal' } });
  ok(counted.compactionCounted === true && rec({ ended: true, result: 'success' }).compactionCounted === false && /compacted=true \(compaction counted on Personal\) wake=woken/.test(M.journalLine({ from: 'a', record: counted, charge: { counted: true, identity: { name: 'Personal' } } })), 'verify r1 ⑤: the compaction\'s own count is on the record and in the journal line');
  const rp = M.dispatchRecord({ target: { cid: 'c1' }, verdict: M.dispatchVerdict({ callerKind: 'session', senderReach: 'messageable', targetKind: 'chat', targetState: 'idle', compactFirst: true, compactObserved: true, sharedGroup: true, replay: 'delivered' }), wake: { woke: false, reason: 'delivered 12 s ago' } });
  ok(rp.compacted === 'skipped' && rp.wake.delivered === 'already' && rp.wake.billed === false && rp.wake.reason === 'delivered 12 s ago', 'verify r1 ②: a replay\'s record — already delivered, not billed, the earlier delivery named');
  ok(M.replayVerdict({ deliveredAt: 1000 }, { now: 1000 + 599000 }) === 'delivered' && M.replayVerdict({ deliveredAt: 1000 }, { now: 1000 + 600001 }) === null && M.replayVerdict({ compactAt: 1000 }, { now: 1000 + 359000 }) === 'compacted' && M.replayVerdict({ compactAt: 1000 }, { now: 1000 + 360001 }) === null && M.replayVerdict({ compactAt: 1000, deliveredAt: 2000 }, { now: 3000 }) === 'delivered' && M.replayVerdict(null, { now: 5 }) === null, 'replayVerdict: delivered within 10 min · compacted-only within 6 min · delivered wins · nothing ⇒ null');
  ok(rec({ sent: false, error: 'no live session' }).compacted === false && /not started \(no live session\)/.test(rec({ sent: false, error: 'no live session' }).why), 'a /compact the typing path refused is said');
  const skipped = M.dispatchRecord({ target: { cid: 'c1' }, verdict: M.dispatchVerdict({ callerKind: 'session', senderReach: 'messageable', targetKind: 'chat', targetState: 'busy', compactFirst: true, compactObserved: true, sharedGroup: true }), wake: { woke: true }, identity: { key: 'k' } });
  ok(skipped.compacted === 'skipped' && /mid/.test(skipped.why), "a skipped compaction carries the verdict's sentence");
  // verify r2 T2 FIRST: the record carries HOW the worker's reply reaches the dispatcher (the pair-group notify the hub set)
  const always = M.dispatchRecord({ target: { cid: 'c1' }, verdict, wake: { woke: true }, reply: 'always' });
  const nextT = M.dispatchRecord({ target: { cid: 'c1' }, verdict, wake: { woke: true }, reply: 'next-turn' });
  const noReply = M.dispatchRecord({ target: { cid: 'c1' }, verdict, wake: { woke: true } });
  ok(always.reply && always.reply.notify === 'always' && always.reply.words === 'wakes you (always)' && M.DISPATCH_REPLY_NOTIFY === 'always', 'verify r2 T2 FIRST: a dispatch records reply {notify:"always", words:"wakes you (always)"} — the worker\'s reply wakes the coordinator');
  ok(nextT.reply && nextT.reply.notify === 'next-turn' && /next turn/.test(nextT.reply.words) && !('reply' in noReply) && M.replyWords('mute').includes('muted') && M.replyWords('x') === M.replyWords('next-turn'), 'verify r2 T2 FIRST: a mutant that forgets the setNotify leaves the default ⇒ the record reads next-turn (the control); an unset reply is absent; replyWords covers every mode');
  const nt = rec(null, { woke: false, reason: 'hour cap' });
  ok(nt.wake.billed === false && nt.wake.identity === null && nt.wake.delivered === 'next-turn' && nt.wake.reason === 'hour cap', 'no wake ⇒ not billed, no identity, next-turn + the reason');
  const F = M.targetFacts;
  ok(F({}).targetKind === 'gone' && F({ live: true, mode: 'terminal' }).targetKind === 'terminal' && F({ live: true, mode: 'chat' }).targetKind === 'gone', 'facts: not live ⇒ gone · terminal mode ⇒ terminal · a chat without a pty ⇒ gone');
  ok(F({ live: true, mode: 'chat', hasPty: true }).targetState === 'idle' && F({ live: true, mode: 'chat', hasPty: true, streaming: true }).targetState === 'busy' && F({ live: true, mode: 'chat', hasPty: true, turnState: 'requires_action' }).targetState === 'busy'
    && F({ live: true, mode: 'chat', hasPty: true, streamingKind: 'compacting', streaming: true }).targetState === 'compacting' && F({ live: true, mode: 'chat', hasPty: true, dispatching: true }).targetState === 'compacting' && F({ live: true, mode: 'chat', hasPty: true, turnState: 'weird' }).targetState === 'unknown', 'facts: idle / streaming / requires_action / compacting / a dispatch in flight / an unknown turn state');
  ok(F({ live: true, mode: 'chat', hasPty: true, userInputAt: 1000, now: 1000 + 60000 }).targetState === 'user-active' && F({ live: true, mode: 'chat', hasPty: true, userInputAt: 1000, now: 1000 + 600000 }).targetState === 'idle' && F({ live: true, mode: 'chat', hasPty: true, streaming: true, userInputAt: 1000, now: 1500 }).targetState === 'busy', 'verify r1 ①: the owner\'s input within USER_QUIET_MS ⇒ user-active (10 min later idle; a running turn is busy first)');
  // verify r2 ①: a draft in flight (no send) makes the worker user-active, on the SAME 10-min window as a send
  ok(F({ live: true, mode: 'chat', hasPty: true, draftEditAt: 1000, now: 1000 + 60000 }).targetState === 'user-active'
    && F({ live: true, mode: 'chat', hasPty: true, draftEditAt: 1000, now: 1000 + 600001 }).targetState === 'idle'
    && F({ live: true, mode: 'chat', hasPty: true, userInputAt: 1000, draftEditAt: 1000 + 590000, now: 1000 + 600001 }).targetState === 'user-active'
    && F({ live: true, mode: 'chat', hasPty: true, userInputAt: 1, draftEditAt: 1, now: 1000 + 600001 }).targetState === 'idle',
    'verify r2 ①: a non-empty draft edited within 10 min ⇒ user-active (max of send + draft); a stale draft/send ⇒ idle — a dispatch never compacts a worker whose owner is mid-draft');
  const line = M.journalLine({ from: 'aaaaaaaa-1111', record: okRec });
  ok(/^\[dispatch\] aaaaaaaa → c1: compacted=true wake=woken \(billed on Personal\)/.test(line) && !/brief text/.test(line), 'ONE journal line: ids cut, the outcome, never the words', line);
}

console.log('§3 the one observer');
{
  const W = require(path.join(REPO, 'src/server/compaction-watch.js'));
  const p = W.awaitCompactionEnd('w-1', { timeoutMs: 5000 });
  ok(W.pendingWaiters() === 1 && W.notifyCompactionEnd('w-other', {}) === 0, 'a waiter is keyed by its session (another session ending tells it nothing)');
  ok(W.notifyCompactionEnd('w-1', { result: 'success' }) === 1, 'the end reaches the one waiter');
  const r = await p;
  ok(r.ended === true && r.result === 'success' && W.pendingWaiters() === 0 && W.notifyCompactionEnd('w-1', {}) === 0, 'resolved once with the outcome, nothing left behind (a second end hears nobody)');
  const t = await W.awaitCompactionEnd('w-2', { timeoutMs: 30 });
  ok(t.ended === false && t.timedOut === true && W.pendingWaiters() === 0, 'a wait past its bound resolves timedOut and leaves no waiter');
  const src = read('src/server/stdout/claude-stream-json.js');
  const body = /const endCompaction = \(sess, sid, \{ result = null, error = null, announce = true \} = \{\}\) => \{([\s\S]*?)\n    \};/.exec(src);
  ok(!!body && /notifyCompactionEnd\(sid, \{ result, error \}\)/.test(body[1]), 'PIN: the claude consumer\'s ONE writer of the cleared kind (endCompaction) notifies the observer');
  ok((src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n').match(/_streamingKind = null/g) || []).length === 1, 'CENSUS: still exactly one `_streamingKind = null` write in the consumer (no second inference of "it ended")');
}

// ── §4 THE REAL-ENGINE LEG ─────────────────────────────────────────────────────────────────────────────────────────
console.log('§4 the real engine');
const tmp = fs.mkdtempSync(path.join('/tmp', 'vs-wdisp-' + process.pid + '-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { } });
{
  const BUFFERS_DIR = path.join(tmp, 'buffers'), META_DIR = path.join(tmp, 'meta');
  fs.mkdirSync(BUFFERS_DIR, { recursive: true }); fs.mkdirSync(META_DIR, { recursive: true });
  const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
  const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
  const DELIVER = require(path.join(REPO, 'src/server/conversation-deliver.js'));
  const { createUserInputSender } = require(path.join(REPO, 'src/server/user-input.js'));
  const { createAdapterRegistry } = require(path.join(REPO, 'src/adapters/index.js'));
  const WD = require(path.join(REPO, 'src/server/worker-dispatch.js'));
  const quiet = { info() { }, warn() { }, log() { }, error() { } };
  const origErr = console.error; const errs = [];
  // the consumers' engine: a recursive no-op for every dep (this leg drives the compaction records only)
  const anyFn = () => new Proxy(function () { }, { get: (t, k) => (k === 'then' || typeof k === 'symbol' ? undefined : anyFn()), apply: () => undefined });
  const engine = new Proxy({ _vsuPending: new Map(), modelsMatch: () => false, servedDefinesModel: () => false, rerouteAnnouncedBy: () => null, resolveUsageKey: () => '__global__' }, { get: (t, k) => (k in t ? t[k] : anyFn()), has: () => true });
  const activeSessions = new Map();
  const broadcasts = [];
  const so = require(path.join(REPO, 'src/server/session-stdout.js')).create({
    rootDir: tmp, BUFFERS_DIR, META_DIR, DTACH_CMD: 'dtach', USAGE_SCANNER_PATH: path.join(tmp, 'nonexistent'),
    CLAUDE_STREAM_TYPES: new Set(['system', 'assistant', 'user', 'result', '_stdin_ack', 'tool_progress', 'set_in_progress_tool_use_ids', 'compact_progress', 'tombstone']), _seenStreamTypes: new Set(), activeSessions, engine,
    checkClaudeGoalStatus() { }, broadcastToSession: (s, id, m) => broadcasts.push({ id, ...m }), broadcastActiveSessions: () => { },
    noteModelSeen: () => { }, noteHarnessModels: () => { }, recordUsageAttribution() { }, daemonPtyShim: (h) => h,
    sbSeenFirst: () => true, getDeviceMgr: () => null, getHosts: () => null,
    getUsageHistory: () => ({ _cost: () => 0, ingestRemoteEvents() { } }), getTelemetry: () => null, getNoConvoRef: () => ({ map: new Map() }),
    getDeliver: () => ({ stashFor: () => ({}) }), getBrain: () => anyFn(),
  });
  const SENDER = 'e2e00000-0000-4000-8000-0000000000a1';
  // THE STUB CLI: what reaches it, in order — a typed frame on its stdin, an inbox post (the ladder's rung 1)
  const tape = [];
  const mkWorker = (wid, cid, { mode = 'chat', streaming = false, compaction = 'success', backend = 'claude', groups = ['tg-1'], reach = null, userInputAt = undefined, draftEditAt = undefined } = {}) => {
    const p = { data: null, exit: null, onData(cb) { p.data = cb; }, onExit(cb) { p.exit = cb; } };
    const s = { mode, backend, name: 'worker-' + wid, cwd: tmp, sockName: 'cw-' + wid, buffer: '', createdAt: Date.now(), claudeSessionId: cid, backendSessionId: cid, _isStreaming: streaming, _groups: groups, _reach: reach };
    if (userInputAt) s._userInputAt = userInputAt;
    if (draftEditAt) s._draftEditAt = draftEditAt;
    s.pty = Object.assign(p, {
      write(line) {
        tape.push({ wid, kind: 'stdin', text: line });
        if (mode !== 'chat' || !/\/compact/.test(line)) return;
        const emit = (o) => p.data(JSON.stringify(o) + '\n');
        setTimeout(() => {
          emit({ type: 'system', subtype: 'status', status: 'compacting', session_id: cid });
          if (compaction === 'never') return;
          setTimeout(() => {
            tape.push({ wid, kind: 'cli-end', text: compaction });
            if (compaction === 'success') emit({ type: 'system', subtype: 'status', status: null, compact_result: 'success', session_id: cid });
            else emit({ type: 'system', subtype: 'status', status: null, compact_result: 'error', compact_error: 'Compaction canceled.', session_id: cid });
            emit({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: 900000 }, session_id: cid });
          }, 60);
        }, 20);
      },
    });
    activeSessions.set(wid, s);
    if (mode === 'chat') so.setupSessionPty(s, wid, p);
    return s;
  };
  const SENDER2 = 'e2e00000-0000-4000-8000-0000000000a2';
  const mkSender = (cid, wid) => { const s = { mode: 'chat', backend: 'claude', name: 'coordinator-' + wid, claudeSessionId: cid, backendSessionId: cid, pty: { write() { } } }; activeSessions.set(wid, s); return s; };
  mkSender(SENDER, 'w-sender'); mkSender(SENDER2, 'w-sender2');
  const roster = () => [...activeSessions.values()].filter((s) => s.claudeSessionId).map((s) => ({ cid: s.claudeSessionId, name: s.name, groups: s._groups || ['tg-1'], reachability: s._reach || null }));
  const probes = [], auths = [], posts = [], notes = [], fed = [];
  let spendRefuse = false;
  const deliver = DELIVER.create({
    dataDir: tmp, activeSessions, serverSetting: () => undefined,
    peerMsg: { findPeer: (cid) => ({ name: cid, socketPath: '/dev/null' }), postToPeer: async (peer, text) => { const w = [...activeSessions.entries()].find(([, s]) => s.claudeSessionId === peer.name); tape.push({ wid: w && w[0], kind: 'inbox', text }); posts.push({ cid: peer.name, text }); return { ok: true }; }, postChannelEvent: async () => ({ ok: false }) },
    emitPeerCard: () => { },
    authorizeSpend: (q) => { auths.push({ reason: q.reason, cid: q.cid }); return { ok: true, identity: { key: 'slot-1', name: 'Personal' } }; },
    noteSpend: () => { }, releaseSpend: () => { },
  });
  const store = createChannelStore({ dir: path.join(tmp, 'channels'), log: quiet });
  const ge = GE.create({ store, deliver, roster, groupSetting: () => 'none', log: quiet });
  const sendUserInput = createUserInputSender({ activeSessions, adapterRegistry: createAdapterRegistry({}), BUFFERS_DIR, broadcastToSession: (s, id, m) => broadcasts.push({ id, ...m }), feedLive: (s, m) => fed.push({ sid: s.claudeSessionId, msg: m }), autoResume: { noteRecovered: () => { throw new Error('a dispatch is not the owner'); } }, reattachLocalPty: () => { }, ptyQuietSince: () => false, log: () => { } }).send;
  const journal = [];
  const mkDispatcher = (waitMs = 5000, extra = {}) => WD.create({ activeSessions, getGroups: () => ge, getSendUserInput: () => sendUserInput, authorizeSpend: (q) => { probes.push({ reason: q.reason, held: q.hold !== false, cid: q.cid }); return spendRefuse ? { ok: false, why: 'hour-cap', detail: 'hour cap reached' } : { ok: true, identity: { key: 'slot-1', name: 'Personal' }, hold: 'hD' + probes.length }; }, noteSpend: (c) => notes.push({ reason: c.reason, hold: c.hold }), releaseSpend: (c) => notes.push({ released: c.hold }), log: (l) => journal.push(l), waitMs, ...extra });
  const D = mkDispatcher();
  const BRIEF = 'Lane brief: build the thing, then report.';
  const run = (wid, cid, opts = {}, d = D) => { const from = opts.from || SENDER; return d.dispatch({ from, fromKind: 'session', target: { cid, name: 'worker-' + wid }, text: opts.text || BRIEF, compactFirst: opts.compactFirst !== false, mayWake: ge.pacerFor(from), consent: () => true }); };
  const cidN = (n) => 'e2e00000-0000-4000-8000-00000000' + String(n).padStart(4, '0');
  const of = (wid) => tape.filter((x) => x.wid === wid);
  try {
    // (a) idle worker: /compact first, then the brief, after the CLI's end record
    const wA = 'w-idle'; const sA = mkWorker(wA, cidN(1));
    const rA = await run(wA, cidN(1));
    const tA = of(wA);
    ok(rA.ok && tA.length === 3 && tA[0].kind === 'stdin' && /\/compact/.test(tA[0].text) && tA[1].kind === 'cli-end' && tA[2].kind === 'inbox' && tA[2].text.includes(BRIEF), 'IDLE worker: the stub CLI receives `/compact` FIRST, its compaction ends, THEN the brief (records in order)', tA.map((x) => x.kind + ':' + x.text.slice(0, 40)));
    ok(rA.record.compacted === true && rA.record.compactionCounted === true && rA.record.wake.billed === true && rA.record.wake.identity.name === 'Personal' && rA.record.target.cid === cidN(1), 'the record: compacted:true · the compaction counted · billed on the named slot', rA.record);
    ok(probes.length === 1 && probes[0].held === true && probes[0].reason === 'peer-compact' && notes.length === 1 && notes[0].reason === 'peer-compact' && notes[0].hold === 'hD1' && auths.length === 1 && auths[0].reason === 'peer-message', 'MONEY (verify r1 ⑤): the compaction authorized WITH a hold under peer-compact BEFORE the frame and NOTED once the CLI took it; ONE ladder authorization (peer-message) for the wake; no hold-free probe', { probes, notes, auths });
    ok(broadcasts.some((b) => b.id === wA && b.type === 'streaming-label' && /asked by coordinator-w-sender through vibespace-msg dispatch/.test(b.label)) && fed.some((f) => f.sid === cidN(1) && f.msg.origin && f.msg.origin.kind === 'dispatch' && f.msg.origin.name === 'coordinator-w-sender'), "verify r1 ①: the compaction's label names the dispatcher and the live user record carries origin {kind:'dispatch', name}", { labels: broadcasts.filter((b) => b.type === 'streaming-label').map((b) => b.label), fed: fed.map((f) => f.msg.origin) });
    ok(sA._userInputAt === undefined && Number(sA._machineInputAt) > 0, "the typed `/compact` is a MACHINE turn (origin 'dispatch'): _machineInputAt, never _userInputAt, and the auto-resume breaker untouched");
    ok(sA._streamingKind == null && broadcasts.some((b) => b.id === wA && b.type === 'streaming-label' && b.kind === 'compacting'), 'the compaction was labelled for every client (the Stop two-step) and retired by the consumer');
    ok(journal.length === 1 && /^\[dispatch\] e2e00000 → e2e00000: compacted=true \(compaction counted on Personal\) wake=woken \(billed on Personal\)/.test(journal[0]) && !journal[0].includes(BRIEF), 'ONE journal line per dispatch, without the brief', journal);
    // (b) mid-turn worker: no compaction, the brief queued, said
    const wB = 'w-busy'; mkWorker(wB, cidN(2), { streaming: true });
    const rB = await run(wB, cidN(2));
    const tB = of(wB);
    ok(rB.ok && tB.length === 1 && tB[0].kind === 'inbox' && rB.record.compacted === 'skipped' && /middle of a turn.*WITHOUT a compaction/.test(rB.record.why) && rB.record.wake.billed === true, 'MID-TURN worker: the brief goes WITHOUT a compaction, and the record says so', { tB, rec: rB.record });
    // (c) terminal worker: refused by name, nothing sent
    const wC = 'w-term'; mkWorker(wC, cidN(3), { mode: 'terminal' });
    const nPosts = posts.length;
    const rC = await run(wC, cidN(3));
    ok(!rC.ok && rC.code === 'not-chat' && /terminal session/.test(rC.error) && of(wC).length === 0 && posts.length === nPosts, 'TERMINAL worker: refused BY NAME (not-chat), no frame, no post', rC);
    // (d) a compaction the CLI cancels: said, brief still delivered
    const wD = 'w-cancel'; mkWorker(wD, cidN(4), { compaction: 'error' });
    const rD = await run(wD, cidN(4));
    ok(rD.ok && rD.record.compacted === false && /Compaction canceled\./.test(rD.record.why) && of(wD).map((x) => x.kind).join() === 'stdin,cli-end,inbox', 'a CANCELED compaction is said (the CLI\'s words) and the brief still delivered after it', rD.record);
    // (e) a compaction that never ends: bounded wait, brief delivered, said
    const wE = 'w-slow'; mkWorker(wE, cidN(5), { compaction: 'never' });
    const rE = await run(wE, cidN(5), {}, mkDispatcher(250));
    ok(rE.ok && rE.record.compacted === 'unknown' && /no end of the compaction was observed within 0\.3 s/.test(rE.record.why) && of(wE).map((x) => x.kind).join() === 'stdin,inbox', 'a compaction PAST the wait (verify r1 ③): the brief goes anyway, the outcome UNKNOWN said', rE.record);
    // (f) a refused spend probe: nothing compacted, nobody woken, the brief rides the next turn
    const wF = 'w-broke'; mkWorker(wF, cidN(6));
    spendRefuse = true; const aBefore = auths.length;
    const rF = await run(wF, cidN(6));
    spendRefuse = false;
    ok(rF.ok && of(wF).length === 0 && auths.length === aBefore && rF.record.compacted === 'skipped' && rF.record.compactionCounted === false && /spend ceiling/.test(rF.record.why) && rF.record.wake.billed === false && rF.record.wake.delivered === 'next-turn', 'SPEND refused (the compaction\'s own peer-compact authorization): no /compact, no ladder call, no wake — the brief is in the pair group for the next turn', rF.record);
    const rF2 = await run(wF, cidN(6), { text: BRIEF + ' (again)' });
    ok(rF2.ok && rF2.record.wake.billed === true, '…and the pace slot it reserved was REFUNDED (the next dispatch to that worker within 30 s wakes it)', rF2.record);
    // (g) a job caller
    const rG = await D.dispatch({ fromKind: 'job' });
    ok(!rG.ok && rG.code === 'job-token', 'a jbt_ caller is refused (job-token)');
    // (h) two concurrent dispatches compact ONCE
    const wH = 'w-twice'; mkWorker(wH, cidN(7));
    const [h1, h2] = await Promise.all([run(wH, cidN(7)), (async () => { await new Promise((r) => setTimeout(r, 5)); return run(wH, cidN(7), { text: BRIEF + ' second', from: SENDER2 }); })()]);
    const tH = of(wH);
    ok(tH.filter((x) => /\/compact/.test(x.text)).length === 1 && h1.ok && h2.ok && [h1.record.compacted, h2.record.compacted].sort().join() === 'skipped,true' && /already compacting/.test(h2.record.why), 'TWO dispatches at once (two coordinators): ONE /compact; the second says the worker is already compacting', { tH: tH.map((x) => x.kind), h1: h1.record, h2: h2.record });
    // (i) the pace: a second dispatch to the same worker inside 30 s compacts nothing and wakes nobody
    const rI = await run(wA, cidN(1), { text: BRIEF + ' too soon' });
    ok(rI.ok && rI.record.compacted === 'skipped' && /pace/.test(rI.record.why) && rI.record.wake.billed === false && of(wA).length === 3, 'THE PACE (the same persisted pacer as send --wake): a second dispatch within 30 s — no compaction, no wake, said', rI.record);
    // (j) a harness whose stream does not say when a compaction ends (caps compactEnd null) ⇒ the brief alone
    const wJ = 'w-codex'; mkWorker(wJ, cidN(8), { backend: 'codex' });
    const rJ = await run(wJ, cidN(8));
    ok(rJ.ok && rJ.record.compacted === 'skipped' && /harness/.test(rJ.record.why) && of(wJ).every((x) => !/\/compact/.test(x.text)), "a harness with no compaction lane (caps compactEnd null — codex today) gets the brief without a /compact, said", rJ.record);
    // ── verify r1 legs ──
    // (k) ①: the owner typed into the worker 30 s ago — never compacted
    const wK = 'w-active'; mkWorker(wK, cidN(9), { userInputAt: Date.now() - 30000 });
    const rK = await run(wK, cidN(9));
    ok(rK.ok && of(wK).every((x) => !/\/compact/.test(x.text)) && rK.record.compacted === 'skipped' && /sent input OR edited its draft/.test(rK.record.why) && rK.record.wake.billed === true, "①: a worker whose OWNER typed 30 s ago gets the brief WITHOUT a compaction (said), still woken as send --wake would", rK.record);
    // (l) ④: reachable only through an owner-opened reach (no shared Task Group) — never compacted
    const wL = 'w-opened'; mkWorker(wL, cidN(10), { groups: ['tg-9'], reach: 'messageable' });
    store.pace.set({ v: 1, pairs: {}, senders: {} });   // the sender's 8-per-minute floor is not this leg's subject
    const rL = await run(wL, cidN(10));
    ok(rL.ok && ge.reach(SENDER, cidN(10)) === 'messageable' && ge.sharesGroup(SENDER, cidN(10)) === false && of(wL).every((x) => !/\/compact/.test(x.text)) && rL.record.compacted === 'skipped' && /Task Group you both belong to/.test(rL.record.why) && rL.record.wake.billed === true, '④: an opened reach (messageable, no shared Task Group) ⇒ the brief without a compaction, said; the wake unchanged', rL.record);
    // (m) ②: the coordinator retries the SAME brief after its answer was lost — a replay, nothing re-sent (the ledger, not the pace: cleared)
    store.pace.set({ v: 1, pairs: {}, senders: {} });
    const tapeBefore = tape.length, authsBefore = auths.length;
    const rM = await run(wA, cidN(1));
    ok(rM.ok && rM.replay === true && rM.record.compacted === 'skipped' && rM.record.wake.delivered === 'already' && rM.record.wake.billed === false && /delivered \d+ s ago/.test(rM.record.wake.reason) && tape.length === tapeBefore && auths.length === authsBefore && probes.length === probes.length, '②: a retry of a DELIVERED brief is a REPLAY — no /compact, no post, no wake, no authorization; the earlier delivery named', rM.record);
    // (n) ②: the server died mid-wait (the /compact typed, the brief never posted); the retry skips the compaction and posts the brief
    const wN = 'w-restart'; const sN = mkWorker(wN, cidN(11), { compaction: 150 });
    const dead = mkDispatcher(5000, { awaitEnd: () => new Promise(() => { }) });   // a process that never comes back
    run(wN, cidN(11), {}, dead); await new Promise((r) => setTimeout(r, 40));
    ok(of(wN).filter((x) => /\/compact/.test(x.text)).length === 1 && of(wN).every((x) => x.kind !== 'inbox'), '②: the first attempt typed /compact and died before the post');
    sN._streamingKind = null; sN._isStreaming = false;   // boot-restore re-creates the session object: the claims are not persisted
    store.pace.set({ v: 1, pairs: {}, senders: {} });
    store.dispatch.flush();
    const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'channels', 'dispatch-ledger.json'), 'utf8'));
    ok(Object.values(onDisk.entries || {}).some((e) => e.to === cidN(11) && e.compactAt && !e.deliveredAt), '②: the ledger is ON DISK before the frame — a restart remembers the ask', onDisk);
    const rN = await run(wN, cidN(11));
    ok(rN.ok && of(wN).filter((x) => /\/compact/.test(x.text)).length === 1 && of(wN).filter((x) => x.kind === 'inbox').length === 1 && rN.record.compacted === 'skipped' && /earlier attempt of this same brief already asked/.test(rN.record.why) && rN.record.wake.billed === true, '②: the retry after a restart mid-wait compacts NOTHING (ONE /compact per brief) and posts the brief once, said', rN.record);
    ok(require(path.join(REPO, 'src/server/compaction-watch.js')).pendingWaiters() === 0, 'no waiter left behind after every leg (the dead attempt waited on its own never-resolving stand-in, as a dead process would)');
  } finally { try { deliver.flush(); } catch { } try { store.close(); } catch { } console.error = origErr; }
}

// ── §5 CONTROLS ─────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('§5 controls');
{
  const Mut = mutantCopies('wdisp', REPO);
  const src = read('src/dispatch-model.js');
  const mutants = [
    ['compacts a busy worker', "if (targetState === 'busy') return skip('mid-turn', STEPS.wake);", "if (targetState === 'busy') return { ok: true, steps: STEPS.compactFirst, compact: 'first', why: 'mutant' };"],
    ['lets a job dispatch', "if (callerKind !== 'session') {", "if (callerKind === 'nobody') {"],
    ['compacts a terminal', "if (compactFirst === true && targetKind === 'terminal') {", 'if (false) {'],
    ['compacts past a refused spend', "if (spend !== true) return skip('spend'", "if (false) return skip('spend'"],
    // verify r1 — the three new fences and the replay, each a patched copy the table must catch
    ['compacts a worker its owner is using', "if (targetState === 'user-active') return skip('user-active', STEPS.wake);", "if (targetState === 'user-active') return { ok: true, steps: STEPS.compactFirst, compact: 'first', why: 'mutant' };"],
    ['compacts across an opened reach', "if (sharedGroup !== true) return skip('not-shared', STEPS.wake);", "if (false) return skip('not-shared', STEPS.wake);"],
    ['re-sends a delivered brief', "if (replay === 'delivered') return skip('replay', STEPS.replay);", "if (false) return skip('replay', STEPS.replay);"],
    ['re-compacts after a dead attempt', "if (replay === 'compacted') return skip('retry-compacted', STEPS.wake);", "if (false) return skip('retry-compacted', STEPS.wake);"],
  ];
  for (const [name, from, to] of mutants) {
    ok(src.includes(from), `CONTROL precondition: the model still holds the line the "${name}" control patches`);
    const Mm = Mut.load('src/dispatch-model.js', src.replace(from, to), name.replace(/\W+/g, '-'));
    ok(tableMisses(Mm.dispatchVerdict).length > 0, `CONTROL: a model that ${name} is RED against the table`);
  }
  // verify r2 ①: a model whose fence reads only the last SEND (the draft ignored) lets a mid-draft worker be compacted
  {
    const from = 'const last = Math.max(Number.isFinite(a) && a > 0 ? a : 0, Number.isFinite(d) && d > 0 ? d : 0);';
    ok(src.includes(from), 'CONTROL precondition: the model still holds the draft-aware fence line');
    const Md = Mut.load('src/dispatch-model.js', src.replace(from, 'const last = Number.isFinite(a) && a > 0 ? a : 0;'), 'ignores-the-draft');
    const fd = Md.targetFacts({ live: true, mode: 'chat', hasPty: true, draftEditAt: 1000, now: 1000 + 60000 });
    ok(fd.targetState === 'idle' && M.targetFacts({ live: true, mode: 'chat', hasPty: true, draftEditAt: 1000, now: 1000 + 60000 }).targetState === 'user-active', 'CONTROL r2 ①: a model that ignores the draft reads a mid-draft worker as IDLE (compactable); the real one reads user-active');
  }
  for (const c of copiesCensus(Mut.files, Mut.dir, REPO, { minCopies: 9, label: 'CONTROLS: ' })) ok(c.pass, c.name, c.detail);
}

// ── §6 PINS ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('§6 pins');
{
  const ar = read('src/agent-routes.js');
  ok(/app\.post\('\/api\/agent\/msg\/dispatch'/.test(ar) && /if \(who\.job\) \{ const r = await dispatcher\(\)\.dispatch\(\{ fromKind: 'job' \}\)/.test(ar) && /const tgt = ge\.resolveMember\(to, myCid\)/.test(ar) && /mayWake: wakeFloorFor\(myCid\)/.test(ar), 'PIN: the route — jbt_ refused, reach through the engine\'s resolveMember, THE pace');
  ok(/getSendUserInput: \(\) => sendUserInput/.test(read('server.js')), 'PIN: server.js hands the agent routes THE typing path');
  const cli = read('data/bin/vibespace-msg');
  ok(/'\/api\/agent\/msg\/dispatch'/.test(cli) && /--compact-first/.test(cli) && /--file/.test(cli), 'PIN: the CLI — send --wake --compact-first and dispatch --file');
  ok(/## Dispatch a brief to a worker/.test(read('docs/agent/msg-manual.md')), 'PIN: the manual teaches the verb');
  ok(require(path.join(REPO, 'src/backend-caps.js')).capsOf('claude').compactEnd === 'observed' && require(path.join(REPO, 'src/backend-caps.js')).capsOf('codex').compactEnd == null, 'PIN: the caps rows — claude observed, codex not');
  ok(/id: 'typed-send'/.test(read('scripts/test-spend-paths.mjs')), 'PIN: the money census has the typed-send primitive (the dispatch\'s /compact is a site)');
  // verify r1 pins
  ok(require(path.join(REPO, 'src/spend-authorizer.js')).SPEND_REASONS['peer-compact'] && require(path.join(REPO, 'src/spend-authorizer.js')).SPEND_REASONS['peer-compact'].turn === true && /reason: 'peer-compact', session: s, cid \}\)/.test(read('src/server/worker-dispatch.js')) && !/hold: false/.test(read('src/server/worker-dispatch.js')), 'PIN ⑤: peer-compact is a declared turn reason, the dispatcher authorizes it WITH a hold (no hold-free probe left)');
  ok(/replay: r\.replay === true/.test(ar) && !/identical message within 10min/.test(ar.slice(ar.indexOf("app.post('/api/agent/msg/dispatch'"), ar.indexOf("// ── vibespace-msg groups"))), 'PIN ②: the dispatch route answers a replay and keeps no in-memory identical-text floor');
  ok(/dispatch: \{ live: \(\) => dl, set: dispatchSet, flush: dispatchFlush \}/.test(read('src/channel-store.js')) && /sharesGroup, dispatchLedger/.test(read('src/server/groups-engine.js')), 'PIN ②/④: the store\'s persisted dispatch ledger family + the engine\'s sharesGroup / dispatchLedger');
  ok(/if \(human\) session\._userInputAt = Date\.now\(\)/.test(read('src/server/user-input.js')) && /asked by \$\{\(by && by\.name\) \|\| 'another session'\} through vibespace-msg dispatch/.test(read('src/server/user-input.js')) && /userMsg\.origin = \{ kind: 'dispatch', name/.test(read('src/server/user-input.js')), 'PIN ①: the typing sender names the dispatcher in the label and stamps the live record\'s origin');
  const man = read('docs/agent/msg-manual.md');
  ok(/Whose worker/.test(man) && /10 minutes/.test(man) && /ALREADY\s+delivered/.test(man) && /NOT OBSERVED/.test(man) && /counted too/.test(man), 'PIN: the manual says the four rules (shared Task Group, the owner quiet, the replay, unknown) and the counted compaction');
  ok(/name: 'test-dispatch-model', tier: 'fast'/.test(read('scripts/ci.mjs')), 'PIN: the ci tier row');
  // verify r2 pins
  const wd = read('src/server/worker-dispatch.js');
  ok(/draftEditAt: s && s\._draftEditAt/.test(wd), 'PIN r2 ①: the orchestrator passes the worker\'s _draftEditAt to targetFacts');
  ok(/data\.store === 'drafts'[\s\S]{0,320}?s\._draftEditAt = Date\.now\(\)/.test(read('src/ws-handler.js')), 'PIN r2 ①: ws-handler stamps _draftEditAt on a non-empty chat-draft set');
  ok(/_draftEditAt:\s+\{ owner: 'ws'/.test(read('src/session-schema.js')), 'PIN r2 ①: _draftEditAt is a declared session field');
  ok(/armReplyWake\(ge, from, post\.group\.id\)/.test(wd) && /ge\.setNotify\(\{ by: from, group: groupId, notify: M\.DISPATCH_REPLY_NOTIFY \}\)/.test(wd), 'PIN r2 T2 FIRST: a successful dispatch arms the dispatcher\'s pair-group notify to always');
  ok(/the worker's reply \$\{rec\.reply\.words\}/.test(cli), 'PIN r2 T2 FIRST: the CLI prints how the worker\'s reply reaches the dispatcher');
  ok(/dispatchKey = \(from, to, text, attempt = ''\)/.test(wd) && /again === true \? \(String\(attempt \|\| ''\) \|\| crypto\.randomBytes/.test(wd), 'PIN r2 ②: --again adds a per-attempt nonce to the ledger key');
  ok(/flags\.again = true/.test(cli) && /body\.again = true/.test(cli) && /--again=\$\{r\.attempt\}/.test(cli), 'PIN r2 ②: the CLI --again flag + the printed retry nonce');
  ok(/again, attempt,/.test(ar) && /attempt: r\.attempt \|\| null/.test(ar), 'PIN r2 ②: the route threads again/attempt and echoes the nonce');
  const man2 = read('docs/agent/msg-manual.md');
  ok(/reply wakes you/.test(man2) && /--again/.test(man2) && /edited its draft/.test(man2), 'PIN r2: the manual teaches the reply-wake, --again, and the draft fence');
  // verify r2 ③: membership is the marker (the owner created the group), not the group's objective text
  ok(/Membership IS the marker/.test(man2) && /objective text is not read/.test(man2), 'PIN r2 ③: the manual says membership (not the group\'s objective) is the compaction marker');
  // verify r2 ⑤: the pace slot is RESERVED once (mayWake(cid)) and the post REUSES that grant for the worker — never re-checked after the ≤180 s wait
  ok(/const pace = typeof mayWake === 'function' \? mayWake\(cid\) : true;/.test(wd) && /const reserved = \(m\) => \(m === cid \? pace :/.test(wd) && /mayWake: wakeNow \? reserved : noWake/.test(wd), 'PIN r2 ⑤: the wake pace is reserved before the compaction and the post reuses that grant (held, not re-checked across the wait)');
  // verify r2 ⑥: the brief is the dispatcher's own text — no content fence, but the route caps it at 16 KB (a >1 MiB --file brief is refused there; the peer-text belt runs on arrival)
  ok(/Buffer\.byteLength\(text, 'utf-8'\) > 16 \* 1024\) return res\.status\(400\)\.json\(\{ error: 'brief too large \(16KB cap/.test(ar), 'PIN r2 ⑥: the dispatch route caps the brief at 16 KB (a huge --file brief is refused by name)');
}

// ── §7 THE SHIPPED CLI against a recording stub server (the body it sends, the lines it prints, the local refusals) ──
console.log('§7 the CLI');
{
  const http = await import('node:http');
  const { spawn } = await import('node:child_process');
  const seen = [];
  const answer = { posted: true, dispatched: true, group: { id: 'g-0000abcd', name: '', pair: true }, woke: ['worker'], refused: [], nextTurn: [], record: { target: { cid: 'c1', name: 'worker' }, compacted: true, compactionCounted: true, why: 'compacted, then the brief was delivered', wake: { billed: true, identity: { key: 'slot-1', name: 'Personal' }, delivered: 'woken' } } };
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { seen.push({ url: req.url, auth: req.headers.authorization, body: b ? JSON.parse(b) : null }); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(answer)); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const api = 'http://127.0.0.1:' + srv.address().port;
  const cli = (args, env) => new Promise((resolve) => {
    const c = spawn(process.execPath, [path.join(REPO, 'data/bin/vibespace-msg'), ...args], { env: { PATH: process.env.PATH, HOME: tmp, VIBESPACE_API: api, ...env } });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    c.on('close', (code) => resolve({ code, out, err }));
  });
  const briefFile = path.join(tmp, 'brief.md');
  const LONG = 'Lane brief line\n'.repeat(400);
  fs.writeFileSync(briefFile, LONG);
  const r1 = await cli(['dispatch', 'worker', '--file', briefFile], { VIBESPACE_SESSION_TOKEN: 'vsst_test' });
  ok(r1.code === 0 && seen.length === 1 && seen[0].url === '/api/agent/msg/dispatch' && seen[0].body.text === LONG && seen[0].body.compactFirst === true && seen[0].body.to === 'worker' && seen[0].auth === 'Bearer vsst_test', 'CLI: dispatch --file sends the FILE\'s text (never argv) to /api/agent/msg/dispatch with compactFirst', seen[0] && { url: seen[0].url, to: seen[0].body && seen[0].body.to });
  ok(/dispatched to "worker" — compacted: compacted, then the brief/.test(r1.out) && /the compaction counts as one unattended turn/.test(r1.out) && /woke 1 agent = 1 billed turn \(on Personal\)/.test(r1.out), 'CLI: it prints whether it compacted, that the compaction was counted, and the billed wake with its account', r1.out);
  const r2 = await cli(['send', 'worker', 'short brief', '--wake', '--compact-first'], { VIBESPACE_SESSION_TOKEN: 'vsst_test' });
  ok(r2.code === 0 && seen.length === 2 && seen[1].url === '/api/agent/msg/dispatch' && seen[1].body.text === 'short brief', 'CLI: send --wake --compact-first is the same verb');
  const r3 = await cli(['send', 'worker', 'short brief', '--compact-first'], { VIBESPACE_SESSION_TOKEN: 'vsst_test' });
  ok(r3.code === 1 && seen.length === 2 && /needs --wake/.test(r3.err), 'CLI: --compact-first without --wake is refused locally, nothing sent');
  const r4 = await cli(['dispatch', 'worker', 'x'], { VIBESPACE_JOB_TOKEN: 'jbt_test' });
  ok(r4.code === 1 && seen.length === 2 && /job-token/.test(r4.err), 'CLI: inside a job, dispatch is refused locally, nothing sent');
  const r5 = await cli(['dispatch', 'worker', '--file', path.join(tmp, 'missing.md')], { VIBESPACE_SESSION_TOKEN: 'vsst_test' });
  ok(r5.code === 1 && seen.length === 2 && /cannot read the brief file/.test(r5.err), 'CLI: an unreadable brief file is said, nothing sent');
  answer.replay = true; answer.posted = false; answer.group = null; answer.woke = []; answer.record = { target: { cid: 'c1', name: 'worker' }, compacted: 'skipped', compactionCounted: false, why: 'this same brief already reached this worker', wake: { billed: false, identity: null, delivered: 'already', reason: 'delivered 12 s ago by the earlier attempt' } };
  const r1b = await cli(['dispatch', 'worker', 'again'], { VIBESPACE_SESSION_TOKEN: 'vsst_test' });
  ok(r1b.code === 0 && /ALREADY delivered/.test(r1b.out) && /nothing re-sent, nobody woken \(not billed\) — delivered 12 s ago/.test(r1b.out) && !/posted to your direct group/.test(r1b.out), 'CLI (verify r1 ②): a replay prints ALREADY delivered, nothing re-sent, and no group line', r1b.out);
  answer.replay = false; answer.posted = true; answer.group = { id: 'g-0000abcd', name: '', pair: true }; answer.woke = ['worker']; answer.record = { target: { cid: 'c1', name: 'worker' }, compacted: 'unknown', compactionCounted: true, why: 'no end of the compaction was observed within 180 s', wake: { billed: true, identity: { key: 'slot-1', name: 'Personal' }, delivered: 'woken' } };
  const r1c = await cli(['dispatch', 'worker', 'third'], { VIBESPACE_SESSION_TOKEN: 'vsst_test' });
  ok(r1c.code === 0 && /compaction outcome UNKNOWN: no end of the compaction was observed/.test(r1c.out), 'CLI (verify r1 ③): an unobserved end prints UNKNOWN with the record\'s sentence', r1c.out);
  srv.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
