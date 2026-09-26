#!/usr/bin/env node
// First-attach history rebuild must not stall the server, and the things a
// stall broke must be robust (2.369.16, userW inc-mtndq0vb "无法打开也没法
// terminate，卡死了"): after a restart every chat session's first attach ran a
// SYNC convertHistory over its whole transcript on the main thread (userW:
// 58 sessions, 1.35GB); a 19-window reconnect storm stalled the loop ~4min,
// the heartbeat blamed the client for the missing pong and terminated it,
// and the kills queued on that socket vanished. Three layers, functional:
//   ① convertHistoryAsync = same output as convertHistory, yields to the loop
//   ② rebuildHistory holds live records back and replays them IN ORDER,
//      single-flight for concurrent attaches, _historyLoaded only after success
//   ③ the heartbeat skips terminating on a stalled tick; the kill handler
//      acknowledges the requester; the client re-sends kills until acked
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };

const { createMessageManager, feedLive, feedPeerCard, rebuildHistory } = require(path.join(REPO, 'src/normalizers.js'));
const { createWsHeartbeat } = require(path.join(REPO, 'src/server/ws-heartbeat.js'));

// ── a realistic transcript: N turns of user → assistant(text+tool_use) → user(tool_result) → assistant → result
function makeRecords(turns) {
  const recs = [];
  let ts = 1788550000000;
  for (let i = 0; i < turns; i++) {
    const tu = `toolu_${i}`;
    recs.push({ type: 'user', uuid: `u${i}`, timestamp: new Date(ts += 1000).toISOString(), message: { role: 'user', content: `question ${i}` } });
    recs.push({ type: 'assistant', uuid: `a${i}`, timestamp: new Date(ts += 1000).toISOString(), message: { id: `msg_${i}`, role: 'assistant', model: 'claude-x', content: [{ type: 'text', text: `thinking about ${i}` }, { type: 'tool_use', id: tu, name: 'Bash', input: { command: `echo ${i}` } }] } });
    recs.push({ type: 'user', uuid: `r${i}`, timestamp: new Date(ts += 1000).toISOString(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tu, content: `out ${i}` }] } });
    recs.push({ type: 'assistant', uuid: `b${i}`, timestamp: new Date(ts += 1000).toISOString(), message: { id: `msg_${i}b`, role: 'assistant', model: 'claude-x', content: [{ type: 'text', text: `answer ${i}` }] } });
    recs.push({ type: 'result', subtype: 'success', timestamp: new Date(ts += 1000).toISOString(), duration_ms: 10, total_cost_usd: 0.01 });
  }
  return recs;
}
const strip = (msgs) => JSON.stringify(msgs.map((m) => ({ ...m, ts: undefined })));

// ── ① parity + yielding ──
{
  const recs = makeRecords(1500);
  const sync = createMessageManager('claude', 'same-id'); sync.convertHistory(recs);
  const asyncMM = createMessageManager('claude', 'same-id'); // ids embed the session id — same id ⇒ byte-comparable
  let ticks = 0; const iv = setInterval(() => ticks++, 1);
  await asyncMM.convertHistoryAsync(recs, { budgetMs: 5 });
  clearInterval(iv);
  ok(sync.total > 1500 && sync.total === asyncMM.total, `async rebuild yields the same message count as sync (${asyncMM.total})`);
  ok(strip(sync.messages) === strip(asyncMM.messages), 'and byte-identical normalized messages (ids, roles, merged tool calls)');
  ok(ticks >= 1, `the loop actually turned during the rebuild (${ticks} timer ticks — the sync path gives 0)`);
  const csync = createMessageManager('codex', 'c1'), casync = createMessageManager('codex', 'c2');
  ok(typeof casync.convertHistoryAsync === 'function' && typeof csync.convertHistory === 'function', 'codex normalizer carries the same async seam (registry parity, no claude-only path)');
}

// ── ② rebuild gate: live records queue behind the rebuild and replay in order; single-flight ──
{
  const recs = makeRecords(600);
  const ops = [];
  const session = { backend: 'claude', _normalizer: createMessageManager('claude', 's'), _historyLoaded: false };
  session._normalizer.onOp((op) => ops.push(op));
  const p1 = rebuildHistory(session, 's', recs, { budgetMs: 2 });
  const p2 = rebuildHistory(session, 's', recs, { budgetMs: 2 });
  ok(p1 === p2, 'a second attach during the rebuild awaits the SAME promise (single-flight — no double rebuild)');
  ok(Array.isArray(session._rebuildQueue) && session._historyLoaded === false, 'while rebuilding: the queue is armed and _historyLoaded is still false (set only after success)');
  // a live turn arrives mid-rebuild
  const live1 = { type: 'user', uuid: 'live-u', timestamp: new Date(1788560000000).toISOString(), message: { role: 'user', content: 'LIVE question' } };
  const live2 = { type: 'assistant', uuid: 'live-a', timestamp: new Date(1788560001000).toISOString(), message: { id: 'msg_live', role: 'assistant', model: 'claude-x', content: [{ type: 'text', text: 'LIVE answer' }] } };
  feedLive(session, live1); feedLive(session, live2);
  ok(session._rebuildQueue.length === 2 && !session._normalizer.messages.some((m) => JSON.stringify(m.content).includes('LIVE')), 'live records are HELD (queued, not in the normalizer) while history converts');
  await p1;
  ok(session._historyLoaded === true && session._rebuildQueue === null && session._rebuildPromise === null, 'after the rebuild: flag set, queue disarmed, promise cleared');
  const msgs = session._normalizer.messages;
  const iLive = msgs.findIndex((m) => JSON.stringify(m.content).includes('LIVE question'));
  const iLast = msgs.length - 1;
  ok(iLive > 0 && iLive >= msgs.length - 2 && JSON.stringify(msgs[iLast].content).includes('LIVE answer'), `queued live records land AFTER the whole history, in order (live at ${iLive}/${iLast})`);
  ok(ops.some((o) => o.op === 'create' && JSON.stringify(o.message?.content || '').includes('LIVE question')), 'replayed live records EMIT ops (clients see them) — history records do not');
  ok(ops.filter((o) => o.op === 'create').length <= 4, `history conversion stays silent (${ops.filter((o) => o.op === 'create').length} create ops, all from the 2 live records)`);
  // after the gate is down, feedLive is a plain processLive
  const before = session._normalizer.total;
  feedLive(session, { type: 'user', uuid: 'later', timestamp: new Date(1788560002000).toISOString(), message: { role: 'user', content: 'later' } });
  ok(session._normalizer.total === before + 1, 'with no rebuild in flight feedLive processes immediately');
  // peer cards use the same gate
  {
    const s2 = { backend: 'claude', _normalizer: createMessageManager('claude', 'pc') };
    const p = rebuildHistory(s2, 'pc', makeRecords(300), { budgetMs: 1 });
    feedPeerCard(s2, { fromName: 'Background Work', text: 'job done' });
    ok(s2._rebuildQueue.length === 1 && s2._rebuildQueue[0].kind === 'peer', 'a peer card injected mid-rebuild is HELD like a live record');
    await p;
    const last = s2._normalizer.messages[s2._normalizer.messages.length - 1];
    ok(JSON.stringify(last).includes('job done'), 'and lands after the whole history');
  }
  // FIFO: two sessions rebuilding at once finish in order, the first one early
  {
    const sA = { backend: 'claude', _normalizer: createMessageManager('claude', 'A') };
    const sB = { backend: 'claude', _normalizer: createMessageManager('claude', 'B') };
    const order = [];
    const pA = rebuildHistory(sA, 'A', makeRecords(400), { budgetMs: 1 }).then(() => order.push('A'));
    const pB = rebuildHistory(sB, 'B', makeRecords(400), { budgetMs: 1 }).then(() => order.push('B'));
    await Promise.all([pA, pB]);
    ok(order.join('') === 'AB', 'rebuilds are serialized FIFO (the first window opens early instead of every window landing at the total time)');
  }
  // a FAILED rebuild still drains what was held (never lose a live record)
  {
    const sF = { backend: 'claude', _normalizer: createMessageManager('claude', 'F') };
    const boom = { convertHistoryAsync: async () => { throw new Error('boom'); }, processLive(m) { this.got = (this.got || 0) + 1; }, listeners: [], onOp() {}, messages: [], total: 0 };
    const realCreate = createMessageManager;
    // simulate via a normalizer whose convert throws: swap the freshly created mm's method
    const p = rebuildHistory(sF, 'F', makeRecords(50), { budgetMs: 1 });
    sF._normalizer.convertHistoryAsync = boom.convertHistoryAsync; // the promise chain calls it lazily (FIFO turn)
    feedLive(sF, { type: 'user', uuid: 'held', timestamp: new Date(1788560002000).toISOString(), message: { role: 'user', content: 'held during failure' } });
    let threw = false; try { await p; } catch { threw = true; }
    ok(threw === false || sF._historyLoaded !== true, 'a failing rebuild rejects/does not flag loaded');
    ok(sF._rebuildQueue === null && sF._normalizer.messages.some((m) => JSON.stringify(m.content).includes('held during failure')), 'the held record was drained into the normalizer anyway (never dropped)');
    void realCreate;
  }
  // a throwing record mid-history does not amputate the rebuild (2.89.2 rule kept)
  const bad = { backend: 'claude', _normalizer: createMessageManager('claude', 'b') };
  const recs2 = makeRecords(5); recs2.splice(3, 0, { type: 'assistant', message: null, timestamp: 'x' });
  await rebuildHistory(bad, 'b', recs2, { budgetMs: 1 });
  ok(bad._historyLoaded === true && bad._normalizer.total >= 15, 'a malformed record is skipped, not fatal — the flag still lands');
}

// ── ③ heartbeat: stall-aware ──
{
  let now = 1000000;
  const mk = () => { const c = { _isAlive: true, pings: 0, term: 0, ping() { this.pings++; }, terminate() { this.term++; } }; return c; };
  const a = mk(), b = mk();
  const wss = { clients: new Set([a, b]) };
  const hb = createWsHeartbeat(wss, { intervalMs: 30000, stallGraceMs: 5000, now: () => now, log: { warn() {} } });
  hb.start(); clearInterval(wss._heartbeatTimer); clearInterval(wss._heartbeatPulse);
  // production runs a 1s pulse; the fake clock must feed it too, else every 30s jump reads as a 30s loop gap
  const advance = (ms) => { for (let i = 0; i < ms; i += 1000) { now += Math.min(1000, ms - i); hb.pulse(); } };
  advance(30000); let r = hb.tick();
  ok(!r.stalled && r.terminated === 0 && a._isAlive === false && r.pinged === 2, 'on-time tick: everyone pinged, nobody terminated');
  b._isAlive = true; // b ponged, a did not
  advance(30000); r = hb.tick();
  ok(!r.stalled && r.terminated === 1 && a.term === 1 && b.term === 0, 'on-time tick after a REAL missed pong: that client is terminated (half-open detection kept)');
  wss.clients.delete(a); // a real wss drops a terminated client from the set ('close' fires)
  // now a stall: the tick fires 4 minutes late while b's pong sits unread
  b._isAlive = false;
  now += 30000 + 240000; r = hb.tick();
  ok(r.stalled && r.terminated === 0 && b.term === 0 && b.pings === 3, 'a tick that fires 4min LATE terminates nobody — the missed pong was measured across our own stall — and re-pings');
  b._isAlive = true;
  advance(30000); r = hb.tick();
  ok(!r.stalled && r.terminated === 0, 'the next on-time tick judges normally (client answered → kept)');
  advance(35001); r = hb.tick();
  ok(r.stalled, 'the grace threshold is strict (>5s late = stalled)');
  // ② the blind band the review found: a 32s block right after the ping — the tick is only 2s late but the pong sat unread
  b._isAlive = true; advance(30000); r = hb.tick(); ok(!r.stalled, '(reset) on-time tick');
  b._isAlive = false; // ping sent; pong will not be READ until the loop frees
  now += 1000; hb.pulse(); now += 32000; hb.pulse(); // one pulse gap of 32s = the block
  r = hb.tick(); // fires at +33s → only 3s late
  ok(r.stalled && r.terminated === 0 && b.term === 0 && r.maxGapMs >= 30000, 'a 32s loop gap inside the round taints it even though the tick is only 3s late (pulse detector) — the live client survives');
  // bound: pong-less across MANY tainted rounds → terminated anyway
  let tainted = 0;
  for (let i = 0; i < 8 && b.term === 0; i++) { now += 1000; hb.pulse(); now += 30000; hb.pulse(); r = hb.tick(); if (r.stalled) tainted++; }
  ok(b.term === 1 && tainted >= 6, `a client that never pongs across ${tainted} consecutive tainted rounds is terminated anyway (dead half-open under a chronically stalling server is still reaped)`);
  // ④ perf lane ⑤b: the pulse's longest gap is a TELEMETRY METRIC (`srv-loop-gap-ms`), not only a
  //    warn line past the 5 s taint — the reconnect-storm harness and Diagnostics read it
  {
    let t2 = 5000000; const got = [];
    const w2 = { clients: new Set() };
    const hb2 = createWsHeartbeat(w2, { intervalMs: 30000, stallGraceMs: 5000, now: () => t2, log: { warn() {} }, metric: (name, value) => got.push({ name, value }) });
    hb2.start(); clearInterval(w2._heartbeatTimer); clearInterval(w2._heartbeatPulse);
    const quiet = () => { for (let i = 0; i < 30; i++) { t2 += 1000 + (i % 3); hb2.pulse(); } };
    quiet(); hb2.tick();
    ok(got.length === 0, `a quiet round (timer jitter < the ${'50'} ms floor) records NOTHING — an idle server does not fill the ledger (${JSON.stringify(got)})`);
    for (let i = 0; i < 10; i++) { t2 += 1000; hb2.pulse(); }
    t2 += 1000 + 340; hb2.pulse();          // one 340 ms block inside the round (a sub-stall storm)
    for (let i = 0; i < 19; i++) { t2 += 1000; hb2.pulse(); }
    let r2 = hb2.tick();
    ok(got.length === 1 && got[0].name === 'srv-loop-gap-ms' && got[0].value === 340 && !r2.stalled, `a 340 ms loop gap is recorded as srv-loop-gap-ms = 340 (and does not taint the round): ${JSON.stringify(got)}`);
    quiet(); hb2.tick();
    ok(got.length === 1, 'the next quiet round records nothing (the max is per round, reset at the tick)');
    t2 += 1000; hb2.pulse(); t2 += 32000; hb2.pulse(); r2 = hb2.tick();
    ok(got.length === 2 && got[1].value >= 30000 && r2.stalled, `a 32 s stall is recorded too (${got[1]?.value} ms) — the taint verdict is unchanged`);
    const hbSrc = fs.readFileSync(path.join(REPO, 'src/server/ws-heartbeat.js'), 'utf8');
    ok(/metric = \(name, value\) => global\.__vsMetric\?\.\(name, value\)/.test(hbSrc) && /LOOP_GAP_METRIC = 'srv-loop-gap-ms'/.test(hbSrc), 'production wiring: the default metric sink is the server\'s __vsMetric (the telemetry ledger)');
  }
  const src = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
  ok(/createWsHeartbeat\(wss\)\.start\(\)/.test(src) && !/setInterval\(\(\) => \{\s*for \(const client of wss\.clients\)/.test(src), 'ws-handler runs THIS heartbeat (the inline blind interval is gone)');
}

// ── wiring pins (the 2.331.0 lesson: a fix with an unstaged call site is dead) ──
{
  const wsh = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
  const so = fs.readFileSync(path.join(REPO, 'src/server/session-stdout.js'), 'utf8');
  // S5: the three parse pipelines live in src/server/stdout/<protocol>.js — the live-feed sites moved with them
  const stdoutDir = fs.readdirSync(path.join(REPO, 'src/server/stdout')).filter((f) => f.endsWith('.js')).map((f) => 'src/server/stdout/' + f);
  const consumers = stdoutDir.map((f) => fs.readFileSync(path.join(REPO, f), 'utf8')).join('\n');
  ok(/await rebuildHistory\(session, data\.sessionId, sm\.raw\(\)\)/.test(wsh), 'attach rebuilds through rebuildHistory (time-sliced + gated)');
  ok(!/session\._normalizer\.convertHistory\(/.test(wsh), 'no sync session-normalizer convertHistory left in the ws attach path');
  const serverSide = ['server.js', 'src/ws-handler.js', 'src/ws-create.js', 'src/agent-routes.js', 'src/routes/sessions.js', ...fs.readdirSync(path.join(REPO, 'src/server')).filter((f) => f.endsWith('.js')).map((f) => 'src/server/' + f), ...stdoutDir]
    .map((f) => fs.readFileSync(path.join(REPO, f), 'utf8')).join('\n');
  const direct = (serverSide.match(/_normalizer\??\.processLive\(/g) || []).length;
  const directCards = (serverSide.match(/_normalizer\??\.injectPeerCard\??\(/g) || []).length;
  ok(direct === 0, `every live-feed site across server.js + src/server + ws-handler goes through feedLive (direct _normalizer.processLive calls: ${direct})`);
  ok(directCards === 0, `every peer-card writer (Background Work notify, vibespace-msg, auto-resume notice) goes through feedPeerCard (direct injectPeerCard calls: ${directCards})`);
  const ui = fs.readFileSync(path.join(REPO, 'src/server/user-input.js'), 'utf8'); // THE typing path (design-user-inbox-reply D1.1): the chat-input echo moved here
  // lane J r2 (2.369.180): the permission payload's site moved into THE one answer path, src/server/permission-answer.js —
  // the ws `permission-response` case (and the browser takeover's stale sweep) answer through it, handing it feedLive
  const pa = fs.readFileSync(path.join(REPO, 'src/server/permission-answer.js'), 'utf8');
  ok((wsh.match(/feedLive\(session, /g) || []).length === 0 && /answerPermission\(activeSessions\.get\(data\.sessionId\), [^;]*\{ adapterRegistry, feedLive \}\)/.test(wsh) && (pa.match(/feedLive\(session, /g) || []).length === 1 && (ui.match(/feedLive\(session, /g) || []).length === 1 && (consumers.match(/feedLive\(session, /g) || []).length === 4 && (so.match(/feedLive\(session, /g) || []).length === 0, 'the six known live sites (chat-input echo, permission payload — permission-answer.js, which the ws case calls with feedLive —, stdout consumers ×4: codex / acp non-acp frames / acp records / claude — session-stdout itself feeds nothing since S5) are all gated');
  ok(/type: 'killed', sessionId: requestedKillId, resolvedId: data\.sessionId, ok: true/.test(wsh) && /type: 'killed', sessionId: requestedKillId, resolvedId: data\.sessionId, ok: false, reason: 'not-found'/.test(wsh), "kill replies 'killed' to the REQUESTER in both outcomes, carrying the id the client ASKED for (the 2.179.0 remap must not orphan the request)");
  ok(/const requestedKillId = data\.sessionId;[\s\S]{0,400}data\.sessionId = eid; break;/.test(wsh), 'the requested id is captured BEFORE the stale-id remap');
  ok(/activeSessions\.get\(data\.sessionId\) !== session\) \{[\s\S]{0,200}code: 'ended-during-attach'/.test(wsh), 'attach re-checks liveness after the rebuild — a session killed meanwhile gets an error, never a live-looking attached');
  ok(/type: 'attach-ack', sessionId: data\.sessionId, progress:/.test(wsh) && /clearInterval\(progressTimer\)/.test(wsh), 'the rebuild window re-acks every 10s with progress (and the timer is cleared in finally)');
  ok(!/mm\.convertHistory\(sm\.raw\(\)\)/.test(wsh) && !/subMM\.convertHistory\(rawMsgs\)/.test(wsh), 'view-only and subagent attaches convert async too (boot replay opens N dead-session windows at once)');
  const ts = fs.readFileSync(path.join(REPO, 'src/transcript-service.js'), 'utf8');
  ok(/await session\._rebuildPromise/.test(ts) && /await mm\.convertHistoryAsync\(sm\.raw\(\)\)/.test(ts) && !/mm\.convertHistory\(sm\.raw\(\)\)/.test(ts), 'transcript-service.view joins an in-flight rebuild and never converts a whole transcript synchronously (the HTTP re-entry of the stall)');
  const sl = fs.readFileSync(path.join(REPO, 'src/lib/session-lifecycle.js'), 'utf8');
  ok(/killSession\(webuiId, backendSessionId\) \{[\s\S]{0,900}resend: true/.test(sl), 'client killSession = ws.request with resend:true (re-sent on every reconnect until acknowledged)');
  ok(/const cancel = this\.ws\.request\(msg[\s\S]{0,200}onTimeout: \(\) => cancel\(\)/.test(sl), 'the kill watchdog DISARMS the request (ws.request leaves the handler live on timeout)');
  ok(/if \(backendSessionId\) this\.ws\.send\(\{ type: 'kill', sessionId: webuiId, backendSessionId \}\);/.test(sl) && /const msg = \{ type: 'kill', sessionId: webuiId \};/.test(sl), 'the backendSessionId (stale-id fallback) frame is a ONE-SHOT — only the plain kill rides the resend chase, so a resend can never kill a resumed successor');
  const cvsrc = fs.readFileSync(path.join(REPO, 'src/lib/chat-view.js'), 'utf8');
  ok(/const freshAck = acked && Date\.now\(\) - this\._lastAttachAckAt < 30000/.test(cvsrc) && /if \(!freshAck\) waits\+\+;/.test(cvsrc), 'the re-attach ladder keeps waiting while fresh progress acks arrive (bounded 15min) instead of flipping read-only at 2 minutes');
  const clientKillSends = ['src/lib/session-lifecycle.js', 'src/lib/chat-view.js', 'src/lib/manage-agents.js', 'src/lib/session-card.js', 'src/lib/taskbar.js', 'src/lib/sidebar-workbench.js', 'src/lib/setup-flows.js', 'src/lib/app.js']
    .map((f) => fs.readFileSync(path.join(REPO, f), 'utf8')).join('\n');
  const bareKills = (clientKillSends.match(/ws\.send\(\{ type: 'kill'/g) || []).length;
  ok(bareKills === 1 && /killSession\(webuiId, backendSessionId\) \{[\s\S]{0,400}this\.ws\.send\(\{ type: 'kill', sessionId: webuiId, backendSessionId \}\)/.test(sl), `the ONLY bare kill send is killSession's own one-shot fallback frame (found ${bareKills}) — every other site routes through killSession`);
  const schema = fs.readFileSync(path.join(REPO, 'src/session-schema.js'), 'utf8');
  ok(/_rebuildQueue:/.test(schema) && /_rebuildPromise:/.test(schema) && /_rebuildProgress:/.test(schema), 'the three new session fields are registered with an owner');
  const cmm = fs.readFileSync(path.join(REPO, 'src/codex-message-manager.js'), 'utf8');
  ok(/convertHistoryAsync[\s\S]{0,400}try \{ this\._processRecord\(record, false\); \}/.test(cmm), 'codex convertHistoryAsync isolates per record (one bad rollout record must not reject the rebuild)');
}

// ── ④ attach streaming reconciliation (design-harness-features §2.5) ───────
// The 2.339.2 heal ("the wrapper says the turn ended, the server still thinks
// it is streaming") gained a SECOND, higher rung: the harness's own turn state.
// The decision is PURE and shared with the live consumer, because a twin
// between "what the stream said" and "what attach believes" is the whole
// stuck-thinking family.
{
  const { reconcileAttachStreaming, SIDECAR_SETTLE_MS, AUTHORITATIVE_SETTLE_MS } = require(path.join(REPO, 'src/turn-state.js'));
  // no authority at all — today's behaviour, byte for byte
  ok(reconcileAttachStreaming({ isStreaming: true, sidecar: { streaming: false, ageMs: SIDECAR_SETTLE_MS + 1 } }).action === 'sidecar-heal',
    'no turn-state record: the 3s sidecar heal is unchanged (an old CLI keeps exactly the 2.339.2 behaviour)');
  ok(reconcileAttachStreaming({ isStreaming: true, sidecar: { streaming: false, ageMs: SIDECAR_SETTLE_MS - 1 } }).action === 'none',
    '…and it still refuses to heal inside the settle window (the mid-pipeline race guard)');
  // authority present
  ok(reconcileAttachStreaming({ turnStateSeen: true, turnState: 'running', isStreaming: false }).isStreaming === true,
    'authority: a re-attach mid-turn shows the turn as RUNNING even though nothing in the derived path could say so');
  ok(reconcileAttachStreaming({ turnStateSeen: true, turnState: 'requires_action', isStreaming: false }).isStreaming === true,
    "authority: 'requires_action' is a LIVE turn (paused on the user) — auto-resume must not treat it as idle");
  ok(reconcileAttachStreaming({ turnStateSeen: true, turnState: 'idle', isStreaming: true }).clearLabel === true,
    'authority: idle clears the stale spinner label along with the flag');
  ok(reconcileAttachStreaming({ turnStateSeen: true, turnState: 'running', isStreaming: true, sidecar: { streaming: false, ageMs: AUTHORITATIVE_SETTLE_MS - 1 } }).action === 'none',
    'authority: the sidecar (a derived observer) does not outrank the harness inside the 30s window');
  const stale = reconcileAttachStreaming({ turnStateSeen: true, turnState: 'running', isStreaming: true, sidecar: { streaming: false, ageMs: AUTHORITATIVE_SETTLE_MS + 1 } });
  ok(stale.action === 'sidecar-heal' && stale.staleAuthority === true,
    'authority: past 30s the backstop fires anyway and FLAGS it — a lost `idle` record must never wedge a session on "thinking" forever');
  // wiring: the ws attach path uses this decision and nothing else
  const wsh = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
  ok(/const rec = reconcileAttachStreaming\(\{/.test(wsh) && !/Date\.now\(\) - st\.mtimeMs > 3000/.test(wsh),
    'ws attach reconciles through the pure decision (the inline 3s comparison is gone — no twin)');
  ok(/session\._turnState = 'idle';/.test(wsh),
    'a stale-authority heal also RESETS the remembered state (else the next attach undoes the heal)');
  ok(/turnState: session\._turnStateSeen \? \(session\._turnState \|\| null\) : null,/.test(wsh),
    'the attach payload states the turn state tri-state (null = never reported, which is NOT idle)');
}

// ── ⑤ RESUME BY SEQ (perf lane chunk D — the one wire change) ──────────────
// The REAL normalizer's ops through the REAL broadcast choke point
// (src/server/session-broadcast.js — server.js's broadcastToSession since
// chunk D) into fake ws clients, and the attach reply composed by the SAME
// calls ws-handler makes (resumeFor → attachedFrameText → armResume, pinned
// below). Red on the unfixed tree: no module, no `seq`, no cut, no replay.
{
  let SB = null;
  try { SB = require(path.join(REPO, 'src/server/session-broadcast.js')); } catch { }
  ok(!!SB && typeof SB.createSessionBroadcast === 'function', '⑤ the broadcast choke point is a module the suites can drive (src/server/session-broadcast.js)');
  // On the unfixed tree the legs still RUN — against a VERBATIM copy of the
  // 2.369.160 server.js broadcastToSession and today's attach payload — so
  // each one is red for its own reason, not only for the missing module.
  if (!SB) SB = {
    createSessionBroadcast: () => ({ broadcastToSession(session, id, msg) { const json = JSON.stringify(msg); for (const client of session.clients.keys()) { if (client.readyState === 1) { try { client.send(json); } catch {} } } } }),
    resumeFor: () => ({ held: false }), armResume() { }, clientCaps() { return null; },
    attachedFrameText: (p, r, slabOf) => JSON.stringify({ ...p, ...slabOf() }),
  };
  {
    const { createSessionBroadcast, resumeFor, attachedFrameText, armResume, clientCaps } = SB;
    const events = [];
    const { broadcastToSession } = createSessionBroadcast({ event: (name, detail) => events.push({ name, detail }), log: { warn() { } } });
    const fakeWs = (name) => ({ name, readyState: 1, bufferedAmount: 0, frames: [], send(t) { this.frames.push(t); } });
    const mkSession = (id) => {
      const session = { backend: 'claude', clients: new Map(), _normalizer: createMessageManager('claude', id), _normEpoch: 1788550000000 };
      session._normalizer.onOp((op) => broadcastToSession(session, id, { type: 'msg', sessionId: id, ...op })); // the ws-create / boot-restore wiring, verbatim
      return session;
    };
    // the ws-handler attach, reduced to the calls it makes (pinned below)
    const attach = (session, id, ws, data) => {
      session.clients.set(ws, { cols: 120, rows: 30, caps: clientCaps(data) });
      const resume = resumeFor(session, data);
      ws.send(attachedFrameText({ type: 'attached', sessionId: id, mode: 'chat', totalCount: session._normalizer.total, normEpoch: session._normEpoch || 0 }, resume, () => ({ messages: session._normalizer.tailWindow(), turnMap: session._normalizer.turnMap() })));
      armResume(session, ws);
      return JSON.parse(ws.frames[ws.frames.length - 1]);
    };
    const msgs = (ws) => ws.frames.map((f) => JSON.parse(f)).filter((m) => m.type === 'msg');
    let T = 1788560100000;
    const at = () => new Date(T += 1000).toISOString();
    // seven live records: creates, tool edits (a tool_use then its result), and a tombstone
    const live = [
      { type: 'user', uuid: 'L-u1', timestamp: at(), message: { role: 'user', content: 'resume me' } },
      { type: 'assistant', uuid: 'L-a1', timestamp: at(), message: { id: 'msg_L1', role: 'assistant', model: 'claude-x', content: [{ type: 'text', text: 'first answer' }] } },
      { type: 'assistant', uuid: 'L-a2', timestamp: at(), message: { id: 'msg_L2', role: 'assistant', model: 'claude-x', content: [{ type: 'tool_use', id: 'toolu_L2', name: 'Bash', input: { command: 'ls' } }] } },
      { type: 'user', uuid: 'L-r2', timestamp: at(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_L2', content: 'a\nb' }] } },
      { type: 'assistant', uuid: 'L-a3', timestamp: at(), message: { id: 'msg_L3', role: 'assistant', model: 'claude-x', content: [{ type: 'text', text: 'a doomed answer' }] } },
      { type: 'tombstone', message: { uuid: 'L-a3', message: { id: 'msg_L3' } } },
      { type: 'assistant', uuid: 'L-a4', timestamp: at(), message: { id: 'msg_L4', role: 'assistant', model: 'claude-x', content: [{ type: 'text', text: 'the real answer' }] } },
    ];

    // (a) every msg frame carries seq
    const id = 'sess-seq-a';
    const S = mkSession(id);
    await rebuildHistory(S, id, makeRecords(40), { budgetMs: 2 });
    const A = fakeWs('A'), B = fakeWs('B'), OLD = fakeWs('old');
    attach(S, id, A, { caps: ['op-seq'] });
    const b0 = attach(S, id, B, { caps: ['op-seq'] });
    attach(S, id, OLD, {}); // an old client: no caps
    ok(typeof b0.opSeq === 'number' && Array.isArray(b0.messages) && b0.slab === undefined, `(a) a plain attach carries the capability advert opSeq (${b0.opSeq}) beside today's slab`);
    feedLive(S, live[0]); feedLive(S, live[1]);
    const bSeen = msgs(B);
    const bLast = bSeen[bSeen.length - 1]?.seq;
    S.clients.delete(B); // B's socket drops (ws 'close' removes it from the map)
    for (const r of live.slice(2)) feedLive(S, r);
    const aMsgs = msgs(A);
    ok(aMsgs.length >= 7 && aMsgs.every((m) => Number.isInteger(m.seq)), `(a) every msg frame carries seq (${aMsgs.length} frames, seqs ${aMsgs.map((m) => m.seq).join(',')})`);
    ok(aMsgs.every((m, i) => i === 0 || m.seq === aMsgs[i - 1].seq + 1), '(a) …consecutive, in the order the normalizer emitted them');
    ok(aMsgs.some((m) => m.op === 'edit') && aMsgs.some((m) => m.op === 'meta' && m.subtype === 'rewound'), '(a) the stream holds creates, edits and the tombstone\'s rewound op');
    ok(msgs(OLD).length === aMsgs.length && msgs(OLD).every((m, i) => m.seq === aMsgs[i].seq), '(a) an old client gets the same frames (it ignores the seq it does not read)');

    // (c) a same-epoch resume inside the ring replays EXACTLY the frames A got after B's last, byte for byte
    const B2 = fakeWs('B2');
    const held = attach(S, id, B2, { caps: ['op-seq'], sinceSeq: bLast, sinceEpoch: S._normEpoch });
    const want = A.frames.filter((f) => { const m = JSON.parse(f); return m.type === 'msg' && m.seq > bLast; });
    const rawHeld = B2.frames[B2.frames.length - 1];
    const gotReplay = (held.replay || []).map((x) => JSON.stringify(x));
    ok(held.slab === 'held' && !('messages' in held) && !('turnMap' in held), `(c) the resume is HELD — no slab, no turn map (${Math.round(rawHeld.length / 1024 * 10) / 10} KB vs the slab's ${Math.round(A.frames[0].length / 1024 * 10) / 10} KB)`);
    ok(gotReplay.length === want.length && gotReplay.length >= 5 && gotReplay.join('\n') === want.join('\n'), `(c) the replay is byte-identical to the ${want.length} frames the connected client received after seq ${bLast}`);
    ok(held.opSeq === aMsgs[aMsgs.length - 1].seq, `(c) opSeq names the last frame (${held.opSeq})`);
    ok(want.every((f) => rawHeld.includes(f)), '(c) the frames ride INSIDE the attached text verbatim (spliced, never re-serialized)');
    // replayed into a fresh normalizer-side mirror, the resumed client ends where A is
    const mirror = (frames) => { const m = new Map(); for (const f of frames) { const o = typeof f === 'string' ? JSON.parse(f) : f; if (o.type !== 'msg') continue; if (o.op === 'create') m.set((o.message || o.msg).id, JSON.stringify((o.message || o.msg).content)); if (o.op === 'edit' && m.has(o.id) && o.fields.content) m.set(o.id, JSON.stringify(o.fields.content)); } return [...m].join('|'); };
    ok(mirror([...B.frames, ...(held.replay || [])]) === mirror(A.frames), '(c) B\'s frames before the drop + the replay = A\'s view of every live message (creates and edits)');

    // (b) the cut: a caps client past the limit gets ONE lagged and nothing more; a no-caps client keeps everything
    const C = fakeWs('C'), D = fakeWs('D');
    attach(S, id, C, { caps: ['op-seq'] });
    attach(S, id, D, {});
    C.bufferedAmount = 5 * 1048576; D.bufferedAmount = 5 * 1048576;
    const before = { c: C.frames.length, d: D.frames.length, ev: events.length, seq: (S._opRing?.seq ?? 0) };
    const more = [
      { type: 'user', uuid: 'L-u9', timestamp: at(), message: { role: 'user', content: 'while wedged 1' } },
      { type: 'assistant', uuid: 'L-a9', timestamp: at(), message: { id: 'msg_L9', role: 'assistant', model: 'claude-x', content: [{ type: 'text', text: 'while wedged 2' }] } },
      { type: 'user', uuid: 'L-u10', timestamp: at(), message: { role: 'user', content: 'while wedged 3' } },
    ];
    for (const r of more) feedLive(S, r);
    const emitted = (S._opRing?.seq ?? 0) - before.seq;
    const cNew = C.frames.slice(before.c).map((f) => JSON.parse(f));
    const dNew = D.frames.slice(before.d).map((f) => JSON.parse(f));
    ok(cNew.length === 1 && cNew[0].type === 'lagged' && cNew[0].sessionId === id && cNew[0].normEpoch === S._normEpoch && Number.isInteger(cNew[0].seq), `(b) the capable client past the limit got exactly ONE lagged frame naming {normEpoch, seq} and no msg (${JSON.stringify(cNew.map((m) => m.type))})`);
    ok(emitted >= 3 && dNew.filter((m) => m.type === 'msg').length === emitted, `(b) the no-caps client past the SAME limit still got every frame (${dNew.length} of ${emitted}) — never a silent drop`);
    const lagEv = events.slice(before.ev).filter((e) => e.name === 'ws-lagged');
    ok(lagEv.length === 1 && /5242880 bytes queued/.test(lagEv[0].detail), `(b) telemetry ws-lagged once, with the queue size (${lagEv[0]?.detail})`);
    // the lagged client resumes from the seq it names — the replay covers exactly what it missed
    C.bufferedAmount = 0;
    const cHeld = attach(S, id, C, { caps: ['op-seq'], sinceSeq: cNew[0].seq, sinceEpoch: S._normEpoch });
    ok(cHeld.slab === 'held' && cHeld.replay?.length === emitted && cHeld.replay.map((x) => JSON.stringify(x)).join('\n') === D.frames.slice(-emitted).join('\n'), `(b) its re-attach resumes by seq: the ${emitted} frames it was cut from, byte-identical to what the uncut client got`);
    feedLive(S, { type: 'user', uuid: 'L-u11', timestamp: at(), message: { role: 'user', content: 'after resume' } });
    ok(JSON.parse(C.frames[C.frames.length - 1]).type === 'msg', '(b) after the re-attach its frames flow again');
    // a caps client NOT yet answered by `attached` is never cut (it has no view to answer lagged with)
    {
      const E2 = fakeWs('E2'); E2.bufferedAmount = 9e6;
      S.clients.set(E2, { cols: 120, rows: 30, caps: ['op-seq'] }); // mid-attach: registered, no attached yet
      feedLive(S, { type: 'user', uuid: 'L-u12', timestamp: at(), message: { role: 'user', content: 'mid attach' } });
      ok(E2.frames.length === 1 && JSON.parse(E2.frames[0]).type === 'msg', '(b) a client registered but not yet answered by attached keeps delivery (no lagged before a view exists)');
      S.clients.delete(E2);
    }
    // an entry rewrite that is not an attach (a resize) keeps the caps + arming (seqStateOf, pinned below)
    {
      const wsh = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
      ok(/session\.clients\.set\(ws, \{ \.\.\.seqStateOf\(prev\), cols: data\.cols, rows: data\.rows, real: true \}\)/.test(wsh), '(b) a resize keeps the entry\'s op-seq state (caps / armed / lagged) — only an attach starts it over');
    }

    // (d) sinceSeq older than the ring ⇒ the full attached with messages
    {
      const id2 = 'sess-seq-d';
      const S2 = mkSession(id2);
      try { S2._opRing = require(path.join(REPO, 'src/op-seq.js')).createOpRing({ cap: 3 }); } catch { } // a tiny ring: the same code, a smaller bound
      await rebuildHistory(S2, id2, makeRecords(10), { budgetMs: 2 });
      const X = fakeWs('X');
      attach(S2, id2, X, { caps: ['op-seq'] });
      for (let i = 0; i < 6; i++) feedLive(S2, { type: 'user', uuid: 'D-u' + i, timestamp: at(), message: { role: 'user', content: 'd ' + i } });
      const full = attach(S2, id2, fakeWs('Y'), { caps: ['op-seq'], sinceSeq: 1, sinceEpoch: S2._normEpoch });
      ok(full.slab === undefined && Array.isArray(full.messages) && full.messages.length > 0 && !('replay' in full) && full.opSeq === 6, `(d) sinceSeq 1 fell off a 3-frame ring ⇒ the full attached with messages (${full.messages.length}) and opSeq ${full.opSeq}`);
      // (e) an epoch mismatch ⇒ full attached
      const ep = attach(S2, id2, fakeWs('Z'), { caps: ['op-seq'], sinceSeq: 5, sinceEpoch: S2._normEpoch - 1 });
      ok(ep.slab === undefined && Array.isArray(ep.messages) && !('replay' in ep), '(e) a sinceEpoch that is not the session\'s ⇒ the full attached (the old ids mean nothing)');
      // (f) the ring resets on rebuildHistory (a new epoch)
      const heldBefore = attach(S2, id2, fakeWs('W'), { caps: ['op-seq'], sinceSeq: 5, sinceEpoch: S2._normEpoch });
      ok(heldBefore.slab === 'held' && heldBefore.replay?.length === 1, '(f) (control) before the rebuild the same request is held');
      const epochBefore = S2._normEpoch, seqBefore = (S2._opRing?.seq ?? 0);
      await new Promise((r) => setTimeout(r, 2));
      await rebuildHistory(S2, id2, makeRecords(12), { budgetMs: 2 });
      ok(S2._normEpoch !== epochBefore && (S2._opRing?.size ?? -1) === 0 && (S2._opRing?.seq ?? 0) === seqBefore, `(f) rebuildHistory resets the ring with the epoch (held ${(S2._opRing?.size ?? -1)}, seq stays ${(S2._opRing?.seq ?? 0)} — never reused)`);
      const afterOld = attach(S2, id2, fakeWs('V'), { caps: ['op-seq'], sinceSeq: 5, sinceEpoch: epochBefore });
      const afterNewEpochOldSeq = attach(S2, id2, fakeWs('U'), { caps: ['op-seq'], sinceSeq: 5, sinceEpoch: S2._normEpoch });
      ok(Array.isArray(afterOld.messages) && Array.isArray(afterNewEpochOldSeq.messages), '(f) after it, neither the old epoch nor an old seq under the new epoch is held');
    }
    // ordering: nothing between the verdict and the send awaits (a replay is followed by exactly the later frames)
    {
      const wsh = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
      const i0 = wsh.indexOf('const resume = resumeFor(session, data);');
      const i1 = wsh.indexOf('armResume(session, ws);', i0);
      ok(i0 > 0 && i1 > i0 && !/\bawait\b/.test(wsh.slice(i0, i1).replace(/\/\/.*$/gm, '')), 'wiring: ws-handler\'s live attach runs resumeFor → attachedFrameText → armResume with NO await between the verdict and the send');
      ok(/ws\.send\(attachedFrameText\(livePayload, resume, \(\) => \(\{/.test(wsh) && /session\.clients\.set\(ws, \{ cols: 120, rows: 30, caps: clientCaps\(data\) \}\)/.test(wsh), 'wiring: the attach records the client\'s caps and sends the composed frame');
      const srv = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
      ok(/const \{ broadcastToSession \} = require\('\.\/src\/server\/session-broadcast\.js'\)\.createSessionBroadcast\(\);/.test(srv) && !/function broadcastToSession\(/.test(srv), 'wiring: server.js\'s broadcastToSession IS the module\'s (no second copy)');
      const norm = fs.readFileSync(path.join(REPO, 'src/normalizers.js'), 'utf8');
      ok(/session\._normEpoch = Date\.now\(\);[\s\S]{0,400}if \(session\._opRing\) session\._opRing\.reset\(\);/.test(norm), 'wiring: rebuildHistory resets the ring beside the epoch');
    }
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
