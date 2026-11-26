'use strict';
// SESSION STDOUT ENGINE (decomposition #6 — the largest module).
// setupSessionPty (protocol dispatch → the per-protocol stdout consumers under
// src/server/stdout/, harness S5) + the death classification on exit +
// attachToDtach + the session-meta store (read/write/delete + tombstones +
// owner-conflict guard). The three parse pipelines (claude stream-json /
// codex-events / acp-events) were inline branches here until S5 moved them
// VERBATIM into src/server/stdout/<protocol>.js; the registry (stdout/index.js)
// resolves the harness descriptor's caps.streamProtocol to ONE consumer.
// ORCH tier: it consumes the machine handle (hosts) and the usage/pool engine,
// never vendor APIs. Late-created deps arrive lazily — all uses are at runtime.
const { classifyCliDeath } = require('./agent-tool-generators.js');
const { feedLive } = require('../normalizers');
const SEARCH = require('./search-index.js'); // the live door of the search index (no-op until server.js wires it)
const { capsOf } = require('../backend-caps.js'); // streamProtocol picks the parse pipeline — never the backend id (P4)
const { createStdoutRegistry } = require('./stdout/index.js'); // protocol → consumer (S5)
const { exitFacts, tombExpired, awaitsWrapper, WRAPPER_SETTLE_MS, WRAPPER_SETTLE_STEP_MS } = require('../exit-facts.js'); // PURE: the exit record's facts (B-3052)
const fs = require('fs');
const { noteTurnFlight } = require('../turn-state.js'); // PURE: the turn's send instant (lane cache-warmth-tiles r3)
const { timedSync } = require('../timed-sync.js'); // PURE: the store-write clock (design 011 lane 1, store-timing)
const SJ = require('../said-journal.js'); // B-cd4b: the fence's words and its gap (PURE fenceGap) — the restore's last gap
const FENCE_WAIT_MS = 3000, FENCE_HELD_MAX = 4 * 1024 * 1024;   // B-cd4b: the fence's bounds (a wrapper answers within its next stdin read)
const path = require('path');
const pty = require('node-pty');
const { spawn } = require('child_process');

const { mk } = require('./lazy.js');

function create({ rootDir, BUFFERS_DIR, META_DIR, DTACH_CMD, USAGE_SCANNER_PATH,
  CLAUDE_STREAM_TYPES, _seenStreamTypes, activeSessions, engine,
  checkClaudeGoalStatus, broadcastToSession, broadcastActiveSessions,
  noteModelSeen, noteHarnessModels, recordUsageAttribution, daemonPtyShim, sbSeenFirst, getDeviceMgr,
  agentEnv, // the SANITIZED spawn env (spawn-hygiene law) — the ONE local re-attach uses it, as ws-handler's detector always did
  onLocalReattach = null, // lane-dead-bridge: told after EVERY local re-attach (the watch, the broken-stdin detector, the probe) — ends the socket's orphans, counts the catch-up
  getHosts, getUsageHistory, getTelemetry, getNoConvoRef, getDeliver, getPages, getPermissionRules, getBrain = () => null, getExitProxy = () => null,
  serverNotice = null, // r3749: the person's one notice when an owed change's own tries end without a landing (server.js hands its serverNotice)
  patchClock = null, // r3302: a suite's clock for the patch chain ({ linkMs, againMs }); the hub's own: the 10 s bound and the tries below
  getSyncStore = () => null }) {   // lane stop-refills-composer: the drafts store, read at record time (server.js builds it later); every other create() caller relies on the null default
  const hosts = mk(getHosts);
  const exitProxyRef = mk(getExitProxy);                // verify-r2 A3-r2 / ask-a: a dead conversation's exit pairs + waiting asks end with it
  const usageHistory = mk(getUsageHistory);
  const telemetry = mk(getTelemetry);
  const noConvoRef = mk(getNoConvoRef);
  const deliverRef = mk(getDeliver);
  const pagesRef = mk(getPages);
  const permissionRulesRef = mk(getPermissionRules);   // the read-only rule view's answer sink (ruling 10)
  const brainRef = mk(getBrain);                       // session-brain's granular consumers (design-unknown-records; created AFTER this engine — lazy)
  const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
  // S5: ONE consumer per declared stream protocol (src/server/stdout/), built
  // once with the orchestrator deps the inline branches used to close over;
  // this engine's own closures (meta store, todo helpers, broadcasts, the
  // feedLive gate) ride `stdoutHelpers` into every attach.
  const stdoutConsumers = createStdoutRegistry({ activeSessions, engine, CLAUDE_STREAM_TYPES, _seenStreamTypes, USAGE_SCANNER_PATH,
    checkClaudeGoalStatus, noteModelSeen, noteHarnessModels, sbSeenFirst, hosts, usageHistory, deliverRef, pagesRef, permissionRulesRef, brainRef });
  // lane global-search: the ONE live gate every consumer feeds the normalizer through also tells the search index (debounced, never throws)
  const stdoutHelpers = { feedLive: (s, m) => { feedLive(s, m); SEARCH.noteLive(s); }, broadcastToSession, broadcastActiveSessions, readSessionMeta, writeSessionMeta,
    updateSessionTodos, applyTaskToolUpdate, emitTaskListTodos };
  // lane stop-refills-composer: THE ONE WRITER of a Stop put-back (src/server/queue-putback.js) rides that same gate, per
  // attach (it writes the draft of THIS webui id) and BEFORE the normalizer — the draft op precedes the record's meta op
  const putback = require('./queue-putback.js').create({ getSyncStore });
  const helpersFor = (id) => ({ ...stdoutHelpers, feedLive: (s, m) => { putback.onLiveRecord(s, id, m); stdoutHelpers.feedLive(s, m); } });
// ── PTY setup helper (onData + onExit wiring) ──
// Live TODO capture — the agent's own TodoWrite (claude) / plan tool (codex)
// IS the session's (活儿's) checklist; VibeSpace only OBSERVES it (never a
// parallel store the agent must be taught). Summary rides active-sessions for
// the board's progress pill; the full list is fetched on demand (expanded card
// → /api/session-todos, which reads taskState() from the transcript).
// New task-tool family (CLI ≥2.1.2xx: TaskCreate/TaskUpdate — CRUD by id, not
// full-list snapshots like TodoWrite). The created task's id only arrives in
// the paired TOOL RESULT text ("Task #N created…"), so creates are stashed by
// tool_use_id until the result lands. Replayed into a list for the same pill.
function applyTaskToolUpdate(session, input) {
  const list = (session._taskList ||= new Map());
  const key = String(input.taskId);
  if (input.status === 'deleted') list.delete(key);
  else {
    const cur = list.get(key) || { content: '', status: 'pending' };
    if (input.subject) cur.content = input.subject;
    if (input.activeForm) cur.activeForm = input.activeForm;
    if (input.status) cur.status = input.status;
    list.set(key, cur);
  }
  emitTaskListTodos(session);
}
function emitTaskListTodos(session) {
  if (!session._taskList?.size) return;
  const todos = [...session._taskList.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, v]) => v);
  updateSessionTodos(session, todos);
}
let _todoBroadcastTimer = null;
function updateSessionTodos(session, todos) {
  try {
    if (!Array.isArray(todos) || !todos.length) return;
    const done = todos.filter((t) => t?.status === 'completed').length;
    const cur = todos.find((t) => t?.status === 'in_progress');
    session._todos = { done, total: todos.length, current: cur ? String(cur.content || cur.activeForm || cur.step || '').slice(0, 140) : null };
    if (!_todoBroadcastTimer) { // coalesce: TodoWrite can fire several times per turn
      _todoBroadcastTimer = setTimeout(() => { _todoBroadcastTimer = null; broadcastActiveSessions(); }, 500);
    }
  } catch { }
}

function setupSessionPty(session, id, ptyProcess, { cleanupOnExit = true, catchUp = null, fence = null } = {}) {
  session.pty = ptyProcess;

  // LIVENESS STAMP — the ONE place every pty (local node-pty, daemonPtyShim,
  // the R6 pipePtyShim, the OpenCode serve terminal) is wired, so "did ANY
  // byte arrive from this bridge since T" has ONE answer for every mode and
  // every stream protocol. It is registered FIRST and holds no other duty: the
  // terminal branch SWALLOWS dtach's attach preamble and a chat consumer may
  // not append every byte to session.buffer, so a reader that asks
  // `session.buffer.length` cannot see the bytes that prove the bridge is
  // alive. Every duck therefore holds a listener SET (src/pty-duck.js): with
  // ONE slot the consumer registered second REPLACES this stamp — the consumer
  // keeps streaming and ptyQuietSince reads "silent" for a relaying bridge
  // (B-ae4b; test-pty-duck is the census).
  // B-1217 — A BRIDGE'S LIFE SIGNS ARE ITS OWN: its birth is strictly AFTER its predecessor's last byte (a byte in the birth's own
  // millisecond reads «spoke» by ptyQuietSince's tie), and only the CURRENT bridge stamps — a replaced bridge's late bytes (a killed
  // dtach client's «[detached]» goodbye, landing after the new birth) count for nobody, so the successor that never spoke still reads so;
  // and a current bridge's byte is never dated before its own birth (r1676): a wall clock stepped back inside a heal's window cannot
  // make a bridge that spoke read «never spoke» (its held lines would be replayed: a person's keystrokes twice)
  session._ptyOpenedAt = Math.max(Date.now(), (Number(session._lastPtyDataAt) || 0) + 1); // THIS bridge's birth (verify r1): `ptyQuietSince(session, _ptyOpenedAt)` = "this pty never spoke" — the broken-stdin detector re-sends only then
  ptyProcess.onData(() => { if (session.pty === ptyProcess) session._lastPtyDataAt = Math.max(Date.now(), Number(session._ptyOpenedAt) || 0); });
  if (session._bridgeHeldInputs && session._bridgeHeldInputs.pty === null) replayHeldInputs(session, ptyProcess, session._bridgeHeldInputs.lines);   // the onExit ladder's carry (B-c20d verify r1)

  // B-cd4b (round wzvgb5033): a RESTORE's attach hands what the survivor wrote between the restore's read and this attach
  // (`catchUp` {text, drop} — boot-restore restoreCatchUp, read in THIS turn): fed to this pty's own listeners, in THIS turn,
  // before its first byte — the stream consumer parses it as the records it would have relayed (a permission request, a
  // result, an idle state), whole lines: the read's partial last line (`drop`) leaves the buffer first and comes back once
  const caught = catchUp && catchUp.text ? [] : null;
  // B-cd4b (the wrapper's hold, 主开发 r1132): THE FENCE — what the survivor said between that catch-up's read and this attach's
  // CONNECT, which dtach dropped. A wrapper whose sidecar adverts `caps.fence` (src/said-journal.js) writes every line it says to its
  // file before saying it, and answers `webui_fence` with a record that is in the file at its place: this pty's consumers are held
  // behind ONE listener from the first byte (dtach's preamble: connected, raw — never an echoed ask) until the fence comes back;
  // then the file past the catch-up, up to the fence, minus what the live stream brought since the connect (PURE SJ.fenceGap), is
  // fed FIRST, the held bytes after it, and the fence record never. Bounded (FENCE_WAIT_MS, FENCE_HELD_MAX): past it the held
  // bytes are fed as they came and that is SAID. Chat only; the local road only (a restore's attach takes it).
  // r1266: the held bytes a LIST of chunks (never one growing string searched whole), searched as the previous tail + the new bytes;
  // `fed` = the catch-up's own text (the accepted window: a line it fed that the live stream brings again)
  const gate = fence && fence.rb && typeof fence.read === 'function' && session.mode === 'chat' ? { cbs: [], held: [], size: 0, tail: '', open: false, id: null, timer: null, fed: catchUp && catchUp.text ? String(catchUp.text) : '' } : null;
  const onDataOwn = (caught || gate) ? Object.getOwnPropertyDescriptor(ptyProcess, 'onData') : null;
  const realOn = (caught || gate) ? ptyProcess.onData : null;
  if (caught || gate) Object.defineProperty(ptyProcess, 'onData', { configurable: true, writable: true, value: (cb) => {
    if (caught) caught.push(cb);
    if (gate) { gate.cbs.push(cb); return { dispose() { const i = gate.cbs.indexOf(cb); if (i >= 0) gate.cbs.splice(i, 1); } }; }
    return realOn.call(ptyProcess, cb);
  } });
  if (session.mode === 'chat') {
    // Dispatch by DECLARED protocol (P4 → S5): the harness descriptor's caps
    // row NAMES the stream protocol (capsOf() IS that row — harness-contract
    // pins the identity) and src/server/stdout/ registers ONE consumer per
    // protocol. A chat backend without a protocol, or with a protocol nobody
    // registered, must fail loudly here — never be silently parsed as
    // stream-json. Both cases pass the output through RAW.
    const streamProto = capsOf(session.backend).streamProtocol;
    if (session.mode === 'chat' && !streamProto) {
      console.error(`[session] backend "${session.backend}" has no streamProtocol in src/backend-caps.js — chat output passes through RAW (register a pipeline)`);
      global.__vsEvent?.('chat-backend-no-protocol', String(session.backend));
    }
    const consumer = streamProto ? stdoutConsumers.get(streamProto) : null;
    if (streamProto && !consumer) {
      console.error(`[session] backend "${session.backend}" declares streamProtocol "${streamProto}" but src/server/stdout/index.js registers no consumer for it — chat output passes through RAW (register one)`);
      global.__vsEvent?.('chat-protocol-no-consumer', `${session.backend}/${streamProto}`);
    }
    if (consumer) {
      consumer.attach(session, id, ptyProcess, helpersFor(id));
    } else {
      // Chat backend with NO registered protocol (reported loudly above):
      // raw passthrough — visible garbage beats silently mis-parsed claude.
      ptyProcess.onData((output) => {
        session.buffer += output;
        if (session.buffer.length > 1200000) session.buffer = session.buffer.slice(-800000);
        broadcastToSession(session, id, { type: 'output', sessionId: id, data: output });
      });
    }
  } else {
    // Terminal mode: raw PTY output.
    if (caught) {   // B-cd4b: a terminal's catch-up goes to its buffer and its clients (never through the preamble strip below)
      if (catchUp.drop && session.buffer.endsWith(catchUp.drop)) session.buffer = session.buffer.slice(0, session.buffer.length - catchUp.drop.length);
      session.buffer += catchUp.text;
      if (session.buffer.length > 75000) session.buffer = session.buffer.slice(-50000);
      broadcastToSession(session, id, { type: 'output', sessionId: id, data: catchUp.text.slice(catchUp.drop ? catchUp.drop.length : 0) });
    }
    // dtach sends the attaching client a clear-screen preamble (\e[H\e[J) as
    // its redraw kickoff. A TUI then repaints fully (SIGWINCH), but a plain
    // SHELL repaints NOTHING — the preamble wiped attached clients live AND
    // poisoned session.buffer's tail, so every later attach rendered BLANK
    // (real report: shell terminals blanked on every server restart / daemon
    // re-exec; probe showed the buffer ending in \e[H\e[J). Strip a LEADING
    // clear burst within 2s of attach — later clears are real program output.
    let attachPreambleUntil = Date.now() + 2000;
    ptyProcess.onData((output) => {
      if (session._reattachAttempts) session._reattachAttempts = 0;
      if (attachPreambleUntil) {
        const inWindow = Date.now() < attachPreambleUntil;
        attachPreambleUntil = 0; // only the FIRST chunk is ever a candidate
        if (inWindow) {
          const stripped = output.replace(/^(?:\x1b\[H|\x1b\[[0-3]?J)+/, '');
          if (!stripped) return; // pure clear preamble — swallow entirely
          output = stripped;
        }
      }
      session.buffer += output;
      if (session.buffer.length > 75000) session.buffer = session.buffer.slice(-50000);
      broadcastToSession(session, id, { type: 'output', sessionId: id, data: output });
    });
  }

  if (caught || gate) { if (onDataOwn) Object.defineProperty(ptyProcess, 'onData', onDataOwn); else delete ptyProcess.onData; }
  if (gate) {
    const feedAll = (text) => { for (const cb of gate.cbs.slice()) { try { cb(text); } catch (e) { console.warn(`[${id}] the restore's fence: a consumer threw (${e && e.message})`); } } };
    const openGate = (why) => {
      if (gate.open) return;
      gate.open = true; if (gate.timer) { clearTimeout(gate.timer); gate.timer = null; }
      const held = gate.held.join(''); gate.held = []; gate.size = 0; gate.tail = '';
      if (why) console.warn(`[${id}] the restore's fence: ${why} — what the survivor said between its catch-up and its connect was not read`);
      if (held) feedAll(held);
    };
    realOn.call(ptyProcess, (data) => {
      if (gate.open) { feedAll(data); return; }
      gate.held.push(data); gate.size += data.length;
      if (!gate.id) {   // the first byte: dtach's client is connected and raw — the ask is never echoed
        gate.id = `${process.pid.toString(36)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        try { ptyProcess.write(SJ.fenceAsk(gate.id) + '\n'); } catch (e) { openGate(`its fence could not be asked (${(e && e.message) || e})`); return; }
      }
      const fl = SJ.fenceLine(gate.id), win = gate.tail + data, kw = win.indexOf(fl);   // r1236/r1266: the previous tail + the NEW bytes only
      if (kw < 0) { gate.tail = win.slice(Math.max(0, win.length - fl.length + 1)); if (gate.size > FENCE_HELD_MAX) openGate(`${gate.size} bytes came before its fence`); return; }
      const all = gate.held.join(''), k = gate.size - win.length + kw;   // ONE join, when the fence is found
      gate.held = []; gate.size = 0; gate.tail = '';
      let end = k + fl.length; if (all[end] === '\r') end++; if (all[end] === '\n') end++;
      const before = all.slice(0, k), after = all.slice(end);
      gate.open = true; if (gate.timer) { clearTimeout(gate.timer); gate.timer = null; }
      let gap; try { gap = SJ.fenceGap(fence.read(fence.rb), fl, before, gate.fed); } catch (e) { gap = { skipped: `its file could not be read (${(e && e.message) || e})` }; }
      if (gap.twice) console.warn(`[${id}] the restore's fence: ${gap.twice} line(s) the catch-up fed came live again (the accepted window: drawn twice) — nothing was lost`);
      if (gap.skipped) console.warn(`[${id}] the restore's fence: ${gap.skipped} — what the survivor said between its catch-up and its connect was not read`);
      else if (gap.lost) {
        if (gap.drop && session.buffer.endsWith(gap.drop)) session.buffer = session.buffer.slice(0, session.buffer.length - gap.drop.length);
        const lastAt = session._lastPtyDataAt;
        feedAll(gap.lost);
        session._lastPtyDataAt = lastAt;   // the file's, not a byte of this bridge
      }
      if (before) feedAll(before);
      if (after) feedAll(after);
    });
    gate.timer = setTimeout(() => openGate(`no fence came back in ${FENCE_WAIT_MS} ms`), FENCE_WAIT_MS);
    if (gate.timer.unref) gate.timer.unref();
    try { ptyProcess.onExit(() => openGate(null)); } catch { }
  }
  if (caught) {
    if (session.mode === 'chat') {
      if (catchUp.drop && session.buffer.endsWith(catchUp.drop)) session.buffer = session.buffer.slice(0, session.buffer.length - catchUp.drop.length);
      const lastAt = session._lastPtyDataAt;
      for (const cb of caught) { try { cb(catchUp.text); } catch (e) { console.warn(`[${id}] the restore's catch-up: a consumer threw (${e && e.message})`); } }
      session._lastPtyDataAt = lastAt;   // the catch-up is the FILE's, not a byte of this bridge: the liveness probe judges the bridge alone
    }
  }
  ptyProcess.onExit(() => {
    // Session already torn down (e.g. this is a stale PTY exiting after kill) — nothing to do
    if (!activeSessions.has(id)) return;
    const isCurrent = session.pty === ptyProcess;

    // Detach path: dtach socket still alive → the session survives, only this
    // attach PTY died. Do NOT tear down watchers/normalizer listeners here —
    // the session keeps running and clients stay attached.
    if (cleanupOnExit && session.socketPath && fs.existsSync(session.socketPath)) {
      // Stale PTY (a replacement was already attached, e.g. broken-stdin
      // recovery): must not null the fresh pty or schedule re-attach.
      if (!isCurrent) return;
      const carry = takeHeldInputs(session);   // B-c20d verify r1: a never-spoke pty that EXITS forwarded nothing either — its held inputs ride this ladder's re-attach (setupSessionPty replays them; dropped, the message was lost)
      session.pty = null;
      if (carry.length) session._bridgeHeldInputs = { pty: null, lines: carry, replaying: true };
      // Auto re-attach so the session doesn't become a zombie (LIVE in the
      // sidebar but input-dead). Bounded retries; counter resets on data.
      session._reattachAttempts = (session._reattachAttempts || 0) + 1;
      if (session._reattachAttempts <= 5) {
        setTimeout(() => {
          if (session.pty || !activeSessions.has(id)) return;
          if (!session.socketPath || !fs.existsSync(session.socketPath)) return;
          // repaint: this is a RE-attach — replay the buffer so clients aren't
          // left blank (dtach replays nothing; shells never repaint)
          try { attachToDtach(id, session.socketPath, session, { repaint: true }); } catch {}
        }, 1000 * session._reattachAttempts);
      }
      return;
    }

    // A stale PTY must never tear down a session that has a live replacement
    if (!isCurrent && session.pty) return;

    // Real teardown: clean up subagent file watchers and normalizers
    if (session.subagentWatchers) {
      for (const [, entry] of session.subagentWatchers) {
        if (entry.watcher) entry.watcher.close();
        if (entry.retry) clearTimeout(entry.retry);
      }
      session.subagentWatchers.clear();
    }
    if (session._subNormalizers) { session._subNormalizers.clear(); }
    if (session._normalizer) { session._normalizer.listeners.length = 0; }
    if (session._interruptTimer) { clearTimeout(session._interruptTimer); session._interruptTimer = null; }
    // B-f698: was it WORKING when it died — a turn running, or background tasks the CLI still listed live
    // (the 2026-09-24 three were between turns with Workflows in flight)? Read before this teardown clears it.
    let midTurn = !!session._isStreaming;
    try { midTurn = midTurn || (session._normalizer?.backgroundTasks?.() || []).length > 0; } catch { }
    session._isStreaming = false;
    noteTurnFlight(session, Date.now()); // nothing is in flight from a dead process (lane cache-warmth-tiles r3)
    // lane queued-is-not-woke round 2: the wrapper is GONE (its socket with it) — what it held of ours is handed back BY THE
    // HUB to the next-turn road and its reservations returned (never «waiting for the current turn» on a stopped conversation)
    try { const qc = session.claudeSessionId || session.backendSessionId; if (qc) deliverRef?.noteProcessGone?.(qc); } catch (e) { console.warn(`[deliver] ${id}: queued hand-back failed: ${e.message}`); }
    // THE THIRD EXIT OF THE COMPACTION CLAIM (§2.11, round 7). `_streamingKind
    // === 'compacting'` is a statement about a process that is now gone, and
    // this path clears `_isStreaming` but used to leave the kind set — so a
    // wrapper that died mid-compaction left every attached client holding
    // "Compacting: running <hook> hooks…" and every later "Prompt is too long"
    // card without the rewind-and-retry sentence it exists to give. Retire it
    // through the consumer's OWN named function (bound at attach), BEFORE the
    // `exited` broadcast, so the frame arrives while the client still has a
    // live view — never by clearing the field from here, which would be
    // exactly the silent exit the consumer's census forbids.
    try { session._retireCompaction?.(); } catch { }
    // THE OTHER TURN-LIFECYCLE CLAIM THIS EXIT OWES (2026-09-13 r3 §8). An
    // unscoped weekly rejection defers its BUCKET MARK to the end of the turn
    // (the CLI has no `seven_day_<model>` type, so only the banner or the
    // turn-end evidence rule can name the lane). `settleTurnLane` is reachable
    // only from `noteTurnEnd`, i.e. from claude's `result` record — and a turn
    // that ends by the wrapper DYING never produces one, so the wall was
    // dropped entirely where master's immediate write left a mark. A dropped
    // wall is the money direction: the member reads healthy to every other
    // conversation. Same shape as `_retireCompaction` above — the consumer's
    // own named function, bound at attach, never a reach into engine state.
    try { session._settleTurnLane?.(); } catch (e) { console.warn('[wall] teardown lane settle failed:', e.message); }
    // Child exit code from the wrapper's final meta (2.207.0 — wrappers keep
    // it instead of unlinking; a crash-looping claude previously left zero
    // process-level evidence).
    // B-3052: the SAME read also carries the child's exit SIGNAL and — when
    // the wrapper itself was signalled — which signal (`wrapperSignal`); the
    // socket's fate at this instant is the third fact. ONE pure reader
    // (src/exit-facts.js) builds the line, the event and the tomb.
    // r4: THE READ WAITS FOR THE WRAPPER. When the dtach master dies first
    // (the 2026-09-24 shape) this onExit and the wrapper's SIGHUP record are
    // two consequences of one event; a read at once saw no record (or a
    // half-written one) and printed `wrapper=unfinalized`. settleWrapperMeta
    // polls, bounded (WRAPPER_SETTLE_MS), while the meta names a wrapper that
    // is still running without a finalized record — the common exits
    // (finalized, Terminate's unlinked meta, a SIGKILLed wrapper) read ONCE,
    // synchronously, exactly as before.
    const wrapperMetaPath = path.join(BUFFERS_DIR, id + '.json');
    const finishTeardown = (wrapperMeta, settle) => { // (body at its pre-r4 indentation: the diff is the wait)
    // The wait yielded the loop: a Terminate (the kill path deletes the
    // session and unlinks its files itself) or a replacement owns it now.
    if (activeSessions.get(id) !== session) return;
    let socketExists = false;
    try { socketExists = !!session.socketPath && fs.existsSync(session.socketPath); } catch {}
    const facts = exitFacts({ meta: wrapperMeta, socketPath: session.socketPath || null, socketExists, wrapperRunning: settle.running, asked: session._exitAsked, now: Date.now() });
    const childCode = facts.code;
    // CLI-death classifier (2.226.0, user directive "不要静默失败"): known
    // canned errors become a machine reason + the matched line, which rides
    // the `exited` broadcast so the window shows WHY it died (read-only bar /
    // exited overlay) and lands as a telemetry event the admin collector
    // groups fleet-wide. TAIL-scan only — the buffer rotates and an old error
    // hours back must not label a normal exit.
    const death = classifyCliDeath((session.buffer || '').slice(-4096), childCode);
    const exitReason = death?.reason;
    // Unresumable-conversation stamp (2.207.1): the CLI's canned error means
    // the transcript does not exist on this session's machine — arm the
    // create-side circuit breaker so retries get an explanation, not a loop.
    // Tested INDEPENDENTLY of the classifier's first-match precedence (review
    // finding: another pattern winning must not skip arming the breaker).
    if (exitReason === 'no_conversation' || /No conversation found with session ID/.test((session.buffer || '').slice(-4096))) {
      const cid = session.claudeSessionId || session.backendSessionId;
      if (cid) {
        noConvoRef.map.set(cid, Date.now());
        if (noConvoRef.map.size > 100) noConvoRef.map.delete(noConvoRef.map.keys().next().value);
        console.warn(`[session] unresumable conversation ${cid} — transcript missing on its machine; resumes blocked 10min`);
      }
    }
    if (death) global.__vsEvent?.('cli-death', `${session.backend || 'claude'}/${death.reason}`);
    // Lifecycle line for the ops log (2.206.0) — tonight's black-window
    // forensics found NOTHING in opslog about session deaths; this is the
    // minimum breadcrumb an incident needs.
    console.log(`[session] exited ${id} "${session.name || ''}" mode=${session.mode} backend=${session.backend || 'claude'}${childCode != null ? ' code=' + childCode : ''}${exitReason ? ' reason=' + exitReason : ''}${facts.suffix}`);
    global.__vsEvent?.('session-exited', `${session.mode}/${session.backend || 'claude'}${childCode != null ? '/code=' + childCode : ''}${exitReason ? '/' + exitReason : ''}${facts.eventSuffix}`);
    broadcastToSession(session, id, { type: 'exited', sessionId: id, reason: exitReason, detail: death?.detail, ...(facts.signal ? { signal: facts.signal } : {}) });
    try { require('./helper-asks').forget(session); } catch { } // lane S1 verify r1: a dead parent's helper asks wait for nobody — timers cleared, For-you items resolved
    try { require('./main-asks').forget(session); } catch { } // lane parked-ask-inbox: a dead conversation's own asks wait for nobody
    try { exitProxyRef.onSessionEnd?.(session, id); } catch { } // verify-r2: its exit pairs are dropped with their connections, its waiting asks settled
    activeSessions.delete(id);
    if (cleanupOnExit && session.sockName) deleteSessionMeta(session.sockName);
    // Buffer + wrapper-meta files are only meaningful while the dtach session
    // lives (restore reads them) — on real teardown they're dead weight that
    // used to accumulate forever (129 files / 28MB observed for 8 live
    // sessions; known-backlog item, fixed 2.81.0).
    // FORENSIC TOMBSTONE (2.206.1): keep the buffer TAIL for a week — a
    // crash's stack trace/stderr lives ONLY in the buffer, and deleting it
    // on exit blinded three "why did this session die" investigations in one
    // night (a claude that crash-looped 4× left zero process-level evidence).
    // THE META IS PART OF THE TOMB (B-3052): the wrapper meta is the one file
    // that says whether the wrapper finalized (childExitCode/childExitSignal)
    // or was signalled (wrapperSignal); unlinking it left the .tail without
    // the record that explains it. `<id>.meta.json` = the parsed meta + the
    // teardown's own facts, beside the .tail, under the same 7-day sweep.
    if (cleanupOnExit) {
      const tombDir = path.join(rootDir, 'data', 'exit-tombs');
      try { fs.mkdirSync(tombDir, { recursive: true }); } catch {}
      try {
        const bufPath = path.join(BUFFERS_DIR, id + '.buf');
        const st = fs.statSync(bufPath);
        const fd = fs.openSync(bufPath, 'r');
        const take = Math.min(st.size, 65536);
        const tail = Buffer.alloc(take);
        fs.readSync(fd, tail, 0, take, st.size - take);
        fs.closeSync(fd);
        fs.writeFileSync(path.join(tombDir, `${id}.tail`), tail);
      } catch { /* no buffer / read failed — nothing to keep */ }
      try {
        const tomb = { ...(wrapperMeta && typeof wrapperMeta === 'object' ? wrapperMeta : (settle.torn ? { metaUnreadable: true } : { metaMissing: true })),
          exitedAt: Date.now(), socketFate: facts.socketFate, wrapperFate: facts.wrapperFate, settleMs: settle.waitedMs };
        keepTomb(path.join(tombDir, `${id}.meta.json`), JSON.stringify(tomb), id);   // B-574d: the tomb's META is THE STORE WRITER's (below); the .tail above and the sweep below stay on the loop
      } catch (e) { console.warn(`[session] exit tomb meta for ${id} not written: ${e.message}`); }
      // opportunistic sweep: tombs (.tail AND .meta.json) older than 7 days
      try {
        const now = Date.now();
        for (const f of fs.readdirSync(tombDir)) {
          try { const s = fs.statSync(path.join(tombDir, f)); if (tombExpired(s.mtimeMs, now)) fs.unlinkSync(path.join(tombDir, f)); } catch {}
        }
      } catch {}
      require('./wrapper-files.js').removeWrapperFiles(BUFFERS_DIR, id); // THE ONE LIST (lane human-cli r5): .buf, .json, .receipts (off the loop)
    }
    // B-f698: an UNEXPECTED exit while working is resumed ONCE by itself (no continue, no bill) + one For-you item;
    // a second one only notifies. The rule is PURE (exit-facts unexpectedExitVerdict) over the facts the line printed.
    try { require('./unexpected-exit').onExit(session, id, facts, { midTurn }); } catch (e) { console.warn(`[unexpected-exit] ${id}: not judged — ${e.message}`); }
    broadcastActiveSessions();
    };
    settleWrapperMeta(wrapperMetaPath, WRAPPER_SETTLE_MS, finishTeardown);
  });
}

// Is `pid` still the wrapper that writes `metaPath`? (B-3052 r4) — its argv
// carries the meta path (`node <wrapper> <buf> <meta> …`, the dtach tail), so
// a recycled pid, a zombie (empty cmdline) or a gone process all answer no.
// One sync read of /proc/<pid>/cmdline (procfs, never a mountpoint). Without
// /proc (macOS) the answer degrades to "a process with that pid exists".
const HAS_PROC = (() => { try { return fs.existsSync('/proc/self/cmdline'); } catch { return false; } })();
function wrapperProcessLive(pid, metaPath) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  if (!HAS_PROC) { try { process.kill(pid, 0); return true; } catch { return false; } }
  let argv;
  try { argv = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8').split('\0'); } catch { return false; }
  const base = path.basename(metaPath);
  return argv.some((a) => a === metaPath || path.basename(a) === base);
}
// Read the wrapper meta for the teardown (B-3052 r4): once, synchronously,
// unless the meta names a wrapper still running without a finalized record
// (`awaitsWrapper`) or the read is torn — then re-read every
// WRAPPER_SETTLE_STEP_MS until that wrapper is gone / the read parses, for at
// most `maxMs`. Calls `done(meta, {running, torn, waitedMs})` exactly once.
function settleWrapperMeta(metaPath, maxMs, done) {
  const t0 = Date.now();
  const attempt = () => {
    let meta = null, torn = false;
    try {
      const raw = fs.readFileSync(metaPath, 'utf-8');
      try { meta = JSON.parse(raw); } catch { torn = true; }
    } catch { /* absent: Terminate unlinked it, or it was never written */ }
    const running = !torn && awaitsWrapper(meta) && wrapperProcessLive(meta.pid, metaPath);
    if ((torn || running) && Date.now() - t0 < maxMs) { setTimeout(attempt, WRAPPER_SETTLE_STEP_MS); return; }
    done(meta, { running, torn, waitedMs: Date.now() - t0 });
  };
  attempt();
}

// Read/write session metadata
// lane hub-loop-stalls commit 2: a meta's UPDATES reach the disk through THE STORE WRITER (its own thread; the owner's
// hub held its loop on this rename, 4 holds ≥ 1 s in six hours) — the latest text not yet on disk is kept HERE and
// readSessionMeta answers it (this process reads its own write); a meta's FIRST version (a new socket) is written
// synchronously, so a kill can never leave a live socket without its meta. Directory scanners that read the files
// themselves (browser-env, usage-routes, channels liveness, boot-restore, weekly-lanes-unfold) may see a version up to
// one write old (≤ META_DEBOUNCE_MS + the 500 ms gap + the write) — the census row says so.
const META_DEBOUNCE_MS = 100;
const pendingMeta = new Map();    // file → the latest meta TEXT not yet on disk
const writingMeta = new Map();    // file → the text the writer's thread is writing now
const knownMeta = new Set();      // files whose first version is ON DISK (this process wrote it, or the directory listed it)
const listedMetaDirs = new Set();  // round 3 (law 3): A FILE'S FIRST VERSION IS A FACT OF THE DISK, NOT OF THIS PROCESS — the
                                   // meta directory is listed ONCE per process (one readdir), so after a restart the first
                                   // update of an existing meta takes the writer; only a file that does not exist yet (a
                                   // socket being born) is written here, synchronously
function knownOnDisk(dir, fp) {
  if (knownMeta.has(fp)) return true;
  if (!listedMetaDirs.has(dir)) { listedMetaDirs.add(dir); try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.json')) knownMeta.add(path.join(dir, f)); } catch { } }
  return knownMeta.has(fp);
}
const storeWriter = () => require('../store-writer.js').storeWriter();
/** B-574d (lane bl-jobs, slice «session-and-job-records»; the family's ruling (b)): THE EXIT TOMB's record is made ONCE at a
 *  conversation's END — by every real teardown (a person's close or kill, an agent's end, a crash); at worst a MASS STOP, N tombs in
 *  one turn of the loop. By that rate its META takes THE STORE WRITER: one job each (no debounce), atomic and SYNCED on the writer's
 *  thread, forgotten once it lands — the release wrote it on the hub's loop, unsynced. WHAT IS LEFT on the loop at each teardown
 *  (not this unit's sites): the `.tail`'s read and write, and the 7-day sweep's listing of the tombs folder. Nothing reads the meta right after:
 *  the forensics read it later by name, the 7-day sweep by its age. A write that fails is SAID ONCE for its conversation and stays
 *  the writer's (kept in memory, retried at the writer's pace, as every store's) until it lands */
function keepTomb(tombPath, text, id) {
  const W = storeWriter();
  let said = false;
  W.dirty(tombPath, { name: 'exit-tomb.write', debounceMs: 0, produce: () => text,
    onWritten: (ok, err) => {
      if (ok) { try { if (W.owed(tombPath) === null) W.forget(tombPath); } catch { } return; }   // landed, nothing newer owed: the writer keeps no entry for it
      if (!said) { said = true; console.warn(`[session] exit tomb meta for ${id} not written yet (${(err && (err.code || err.message)) || 'a failed write'}) — kept in memory, the store writer retries it`); }
    } });
}
// r3137 (lane bl-chat-c — SESSION-META UNDER THE STORE-READ LAW): a record whose read FAILED or whose bytes do NOT PARSE is UNREAD
// (src/server/session-meta-verdict.js) — never the empty record «not there» (ENOENT) is. NOTHING is written over it: a writer's
// change WAITS (its fields kept for that record, the newest per field) and is saved MERGED over the record the moment it reads; the
// one delete road keeps it. Its re-read is OFF the loop by the family's helper (src/store-read-hold.js), ONE helper per UNREAD
// record (made at its failed read, stopped at its lift): the helper's ladder, one read in flight with its copy, the family's ceiling
// shared with every store, torn bytes copied aside once per content then lifted EMPTY, and its live list for the one notice.
const SMV = require('./session-meta-verdict.js');
const metaHolds = new Map();     // sockName → its helper while unread (and after a torn lift: listed with its copy until the process ends)
const waitingMeta = new Map();   // file → the fields written while its record was unread (saved merged at the read)
const metaValid = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const metaSeq = new Map();   // fp → writes handed to the store so far (patchSessionMeta's «did one land while I read?»)
const metaPatchChain = new Map();   // fp → the newest patch in flight: the patches of ONE file land in the order they were asked
/** PATCH a session's meta with NO synchronous read on the caller's road (lg-recovery U2 cure, law 2 — the bulk flip; U1's
 *  stop fact): a pending copy is patched in memory; else the file is read OFF the loop (fs.promises) and patched; a write
 *  that landed meanwhile ⇒ read again (bounded — then nothing: a stale copy never overwrites a newer one); the version read
 *  is the owner check's (`prev` — no second read); a socket with no meta of its own gets none (never a stub); the patches
 *  of one file are CHAINED (ON then OFF pressed fast: OFF lands last, whichever read answers first); never rejects.
 *  → Promise<boolean> */
const PATCH_LINK_MS = (patchClock && patchClock.linkMs) || 10 * 1000;   // a link whose read never answers (a hung mount) lets the chain move on after this; its late answer writes nothing
// A PATCH THE STORE GAVE UP ON IS NOT LOST (主开发 10:30Z, «as if a must»: a dropped clear of a stop fact let a restart restore
// the old stop, and the restored-reset arm could continue a finished conversation — a turn nobody typed): it is kept here,
// merged (the newest keys win), and written WITH the next patch of that file; the next patch's own keys win over it
const owedPatch = new Map();   // fp → the owed keys
// r3302 (the money lens: a person's «automatic continue OFF» dropped by a stalled link, a restart before any later patch, the
// conversation back ON and continued — a turn nobody typed): AN OWED PATCH NEVER WAITS FOR SOMEBODY ELSE's WRITE. It is written
// AGAIN BY ITSELF — these tries, off the loop, through the same chain (a newer patch merges it, its own keys winning) — and the
// record's store entry carries it, so ANY write of that record carries it and THE STOP's FLUSH writes it (rank 0: the record read
// then, the owed keys over it); a record unread (r3137), with no record of its own or another live session's gets nothing
const PATCH_AGAIN_MS = (patchClock && Array.isArray(patchClock.againMs) && patchClock.againMs.length && patchClock.againMs) || [2000, 5000, 15000, 30000, 60000];
const owedTries = new Map(), owedOwner = new Map(), writingOwed = new Map();   // fp → {n, timer, said} · the patcher's id · the owed keys a write carries
const STORE_LATER = Symbol.for('vibespace.store-writer.later');   // the store writer's «not ready» (by name: src/store-writer.js LATER)
const stalledMeta = new Set();   // r3749: fp whose last read off the loop gave no answer within its bound, and no read has answered since (the stop's flush reads none of them)
const i18nKey = (s) => s;   // the extraction marker (scripts/i18n-extract.mjs): the client words the notice through t()
const OWED_WORDS = {   // r3749: THE PERSON IS TOLD when an owed change's own tries end without a landing — what the person calls the conversation, that it is not on disk, what a restart does
  off: i18nKey('Automatic continue OFF for “{name}” is not saved on disk yet — its storage did not answer. If VibeSpace restarts before it is written, the conversation comes back with automatic continue ON.'),
  on: i18nKey('Automatic continue ON for “{name}” is not saved on disk yet — its storage did not answer. If VibeSpace restarts before it is written, the conversation comes back with automatic continue OFF.'),
  any: i18nKey('A change to “{name}” is not saved on disk yet — its storage did not answer. If VibeSpace restarts before it is written, the change is lost.'),
};
const OWED_TELL_AGAIN_MS = (patchClock && patchClock.tellAgainMs) || 30000;   // r3920 (1): no page open when it was said ⇒ said again when one is (the hub's own page list, asked no oftener)
const owedTold = new Map();   // fp → { sig, n, timer }: the person-facing change a page has been told of
/** r3749 / r3920: the person is told of an owed change of THEIR OWN (the engine's stop fact is not theirs), ONCE per change and only when a
 *  page received it — else it is said again when a page is there (a later moment, the next try's end); at a stop, to the pages connected
 *  before the exit. → the count of pages that got it (0: not yet) */
function tellOwed(sockName, fp, { atStop = false } = {}) {
  if (typeof serverNotice !== 'function') return 0;
  const owed = owedPatch.get(fp) || {};
  const theirs = Object.fromEntries(Object.entries(owed).filter(([k]) => k !== 'stoppedBy'));
  if (!Object.keys(theirs).length) return 0;
  const sig = JSON.stringify(theirs), t0 = owedTold.get(fp) || {};
  if (t0.sig === sig) return t0.n;   // this change was told: a page got it
  let name = sockName;
  try { for (const x of activeSessions.values()) if (x && x.sockName === sockName) { name = x.name || sockName; break; } } catch { }
  const key = owed.autoResume === false ? OWED_WORDS.off : owed.autoResume === true ? OWED_WORDS.on : OWED_WORDS.any;
  let n = 0; try { n = Number(serverNotice(`meta-owed:${sockName}:${Date.now()}`, key.replace('{name}', name), { level: 2, i18n: { key, params: { name } } })) || 0; } catch { n = 0; }
  if (n > 0) { if (t0.timer) clearTimeout(t0.timer); owedTold.set(fp, { sig, n, timer: null }); return n; }
  if (!atStop && !t0.timer) {   // r3920 (1): SAID MEANS A PAGE GOT IT — none did: said again while the change is still owed
    const tm = setTimeout(() => { const x = owedTold.get(fp); if (x) x.timer = null; if (owedPatch.has(fp)) tellOwed(sockName, fp); }, OWED_TELL_AGAIN_MS);
    if (tm.unref) tm.unref(); owedTold.set(fp, { ...t0, timer: tm });
  }
  return 0;
}
function doneOwing(fp) { const o = owedTries.get(fp); if (o && o.timer) clearTimeout(o.timer); owedTries.delete(fp); owedOwner.delete(fp); const w = owedTold.get(fp); if (w && w.timer) clearTimeout(w.timer); owedTold.delete(fp); }
function oweAgain(sockName, fp, owner, fresh = false) {
  if (owner) owedOwner.set(fp, owner);
  try { storeWriter().dirty(fp, { name: 'session-meta.write', debounceMs: META_DEBOUNCE_MS, rank: 0, produce: (o) => metaBytes(fp, o), onWritten: (ok) => metaWritten(fp, ok) }); } catch { }
  const o = owedTries.get(fp) || { n: 0, timer: null, said: false }; owedTries.set(fp, o);
  if (fresh) { o.n = 0; o.said = false; }   // r3749: a NEW press joining the owed change gets tries of its own (and its own word at their end)
  if (o.timer) return;
  if (o.n >= PATCH_AGAIN_MS.length) {
    if (!o.said) { o.said = true; console.warn(`[session] ${sockName}: a change of its record (${Object.keys(owedPatch.get(fp) || {}).join(', ')}) could not be written in ${o.n} tries of its own — it is kept and written with the next write of that record, or at the hub's stop`); }
    tellOwed(sockName, fp);   // r3749 / r3920: the person is told when the tries end (never while a try is owed); once per change, when a page got it
    return;
  }
  o.timer = setTimeout(() => { o.timer = null; o.n++; patchSessionMeta(sockName, {}, { owner: owedOwner.get(fp) || owner }); }, PATCH_AGAIN_MS[o.n]);
  if (o.timer.unref) o.timer.unref();
}
/** a record's bytes for the store writer: its pending copy as before; an OWED patch over it, and with no pending copy only on a
 *  synchronous flush (the stop's: the record read then) — else not ready yet (its own tries write it off the loop) */
function metaBytes(fp, o) {
  const t = pendingMeta.get(fp), owed = owedPatch.get(fp);
  const plain = () => { if (t === undefined) return null; writingMeta.set(fp, t); return t; };
  if (!owed || SMV.isMarked(path.basename(fp, '.json'))) return plain();   // an unread record: what waits is saved at its read (r3137)
  // r3749 (c): only FLAGS ride another write's bytes (a person's or the engine's: no other writer restates them); any other owed key rides
  // the chain alone, as the release did — no stamp orders it against a later whole write
  if (!Object.keys(owed).every((k) => META_FLAG_KEYS.has(k))) return plain();
  const keys = Object.keys(owed).join(', '), sock = path.basename(fp, '.json');
  let base = null;
  if (t !== undefined) { try { base = JSON.parse(t); } catch { base = null; } }
  else if (o && o.sync) {   // the stop's flush (sync by nature) — r3749: never on a record whose last read off the loop never answered (a storage that may hang the exit)
    if (stalledMeta.has(fp)) { console.warn(`[session] ${sock}: the stop's flush does not read its record (its last read off the loop gave no answer in its bound) — the owed change (${keys}) is NOT written`); tellOwed(sock, fp, { atStop: true }); return plain(); }   // r3920 (2): the pages connected are told before the exit
    try { base = JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch (e) { console.warn(`[session] ${sock}: the stop's flush could not read its record (${(e && (e.code || e.message)) || e}) — the owed change (${keys}) is NOT written`); tellOwed(sock, fp, { atStop: true }); return plain(); }
  }
  else return STORE_LATER;
  const who = owedOwner.get(fp) || null;
  if (!metaValid(base) || !Object.keys(base).length || (who && base.webuiSessionId && base.webuiSessionId !== who && activeSessions && typeof activeSessions.has === 'function' && activeSessions.has(base.webuiSessionId))) return plain();   // never a stub; never into another live session's record
  // r3749 THE MUST: the merged text IS the pending copy — a writer that spreads the record while this write is in flight spreads the
  // person's value (the owed change is then done only when a record carrying it lands)
  const text = JSON.stringify({ ...base, ...owed });
  pendingMeta.set(fp, text); writingMeta.set(fp, text); writingOwed.set(fp, owed);
  return text;
}
function metaWritten(fp, ok) {
  const t = writingMeta.get(fp); writingMeta.delete(fp); if (ok && pendingMeta.get(fp) === t) pendingMeta.delete(fp);
  const ow = writingOwed.get(fp); writingOwed.delete(fp);
  if (ok && ow && owedPatch.get(fp) === ow) { owedPatch.delete(fp); doneOwing(fp); }
}
function patchSessionMeta(sockName, patch, { owner = null } = {}) {
  const fp = path.join(META_DIR, sockName + '.json');
  const link = () => {
    const owed = owedPatch.get(fp) || null;
    if (!owed && !Object.keys(patch || {}).length) return Promise.resolve(true);   // r3302: a try of its own that a newer patch already wrote
    const full = owed ? { ...owed, ...patch } : patch;   // never an older value over a newer one: this patch's keys last
    const tok = { dead: false }; let t = null;
    return Promise.race([patchMetaOnce(sockName, fp, full, 3, owner, tok), new Promise((r) => { t = setTimeout(() => { tok.dead = true; stalledMeta.add(fp); console.warn(`[session] ${sockName}: a meta patch's read gave no answer in ${PATCH_LINK_MS / 1000} s — dropped (its keys are kept: written again by its own tries, by the record's next write, or at the stop)`); r(false); }, PATCH_LINK_MS); if (t.unref) t.unref(); })])
      .finally(() => clearTimeout(t))
      .then((ok) => { if (ok) { if (owedPatch.get(fp) === owed) { owedPatch.delete(fp); doneOwing(fp); } }
    else if (tok.never) owedPatch.set(fp, full);   // r3749: a patch that can never land (no record of its own, another live session's) — kept for the next patch, as the release did: no tries, no word
    else { owedPatch.set(fp, full); oweAgain(sockName, fp, owner, Object.keys(patch || {}).length > 0); }
    return ok; });
  };
  const p = (metaPatchChain.get(fp) || Promise.resolve()).then(link, link);
  metaPatchChain.set(fp, p);
  p.then(() => { if (metaPatchChain.get(fp) === p) metaPatchChain.delete(fp); }, () => { if (metaPatchChain.get(fp) === p) metaPatchChain.delete(fp); });
  return p;
}
// the fields a patch may carry WITHOUT the identity work a meta write does (the usage attribution, the browser binding): a
// flag the person or the engine sets — it changes neither the conversation, the account nor the browser the record names
const META_FLAG_KEYS = new Set(['autoResume', 'stoppedBy']);
function patchMetaOnce(sockName, fp, patch, tries, owner, tok = null) {
  if (tok && tok.dead) return Promise.resolve(false);   // its link timed out: a late answer never writes behind a later patch
  const flagOnly = Object.keys(patch || {}).every((k) => META_FLAG_KEYS.has(k));
  // THE OWNER, by the patcher's own id (the read's should): a file another session owns is never patched with this one's
  // choice — the collision is said, as writeSessionMeta's own check says it
  // refused only when ANOTHER LIVE session owns the file (a restored conversation whose id was derived from its socket's name is
  // still the file's — the readers' should: a plain id comparison refused its own patches)
  const mine = (m) => { if (!owner || !m || !m.webuiSessionId || m.webuiSessionId === owner || !(activeSessions && typeof activeSessions.has === 'function' && activeSessions.has(m.webuiSessionId))) return true; console.error(`[session] META COLLISION on ${sockName}: owned by ${m.webuiSessionId}, patched for ${owner} — not written`); try { global.__vsMetric?.('session-meta-collision', 1); } catch { } return false; };
  const owed = pendingMeta.get(fp);
  if (owed !== undefined) { let m = null; try { m = JSON.parse(owed); } catch { m = null; } return m && typeof m === 'object' && mine(m) ? writeSessionMeta(sockName, { ...m, ...patch }, { prev: m, flagOnly }) : Promise.resolve(false); }
  const seq0 = metaSeq.get(fp) || 0;
  return fs.promises.readFile(fp, 'utf-8').then((t) => { stalledMeta.delete(fp); try { return JSON.parse(t); } catch { return null; } }, (e) => { stalledMeta.delete(fp); if (tok && e && e.code === 'ENOENT') tok.never = true; return null; }).then((m) => {   // (r3920: a MISSING record never lands by trying again — no tries, never «its storage did not answer»)   // (r3749: a read that answers, even with an error, ends the stall)
    if (tok && tok.dead) return false;
    if (pendingMeta.has(fp)) return patchMetaOnce(sockName, fp, patch, tries, owner, tok);   // a newer copy in memory: patch IT (never «gave up» while one is there)
    if ((metaSeq.get(fp) || 0) !== seq0) return tries > 0 ? patchMetaOnce(sockName, fp, patch, tries - 1, owner, tok) : false;
    if (!m || typeof m !== 'object' || !Object.keys(m).length || !mine(m)) { if (tok && m !== null) tok.never = true; return false; }   // (r3749: a record of nobody's or another's — never lands by trying again; a failed read (null) may)
    return writeSessionMeta(sockName, { ...m, ...patch }, { prev: m, flagOnly });
  }).catch(() => false);
}
function readSessionMeta(sockName) {
  const fp = path.join(META_DIR, sockName + '.json');
  const owed = pendingMeta.get(fp);
  if (owed !== undefined) { try { return JSON.parse(owed); } catch { return SMV.unreadMeta({ code: 'its pending copy did not parse' }); } }
  // r3137: THE VERDICT AT THE ONE READ (its own sync read, as before: no second read) — data · «not there» (ENOENT: the empty record,
  // a new conversation's first write) · UNREAD (a failed read, torn bytes: held, re-read off the loop)
  let read;
  try { read = { text: timedSync('session-meta.read', () => fs.readFileSync(fp, 'utf-8')) }; } catch (error) { read = { error }; }
  stalledMeta.delete(fp);   // r3749: the record's synchronous read answered — its storage does not hang the stop's read
  const a = require('../store-read.js').storeAnswer(read, { valid: metaValid });
  // r3199 (the must): a lift on THIS read hands its caller the record WITH the changes that waited (the caller's own write builds on it)
  if (a.state === 'data') return SMV.isMarked(sockName) ? liftMeta(sockName, a.value) : a.value;
  if (a.state === 'missing' && !SMV.isMarked(sockName)) return {};
  // r3199: a torn record whose copy is kept and whose file is now gone (the person removed it) is «not there» again
  if (a.state === 'missing' && (SMV.factsOf(sockName) || {}).torn && (SMV.factsOf(sockName) || {}).copy) return liftMeta(sockName, liveExtrasOf(sockName));   // r3245 (2): what the live conversation knows, as a whole restatement does
  if (a.state !== 'missing') holdMeta(sockName, fp, a, read);   // (a «missing» right after a failed read: the helper reads it once more)
  return SMV.unreadMeta(SMV.factsOf(sockName) || { code: a.code || 'unreadable' });
}
/** r3137: the record could not be read — marked UNREAD, its helper made (once) and started on this read's own answer */
function holdMeta(sockName, fp, a, read = null) {
  if (SMV.isMarked(sockName) && metaHolds.has(sockName)) return;
  let liveName = null; try { for (const s of (activeSessions && typeof activeSessions.values === 'function' ? activeSessions.values() : [])) if (s && s.sockName === sockName) { liveName = s.name || null; break; } } catch { }   // r3199: the notice names the conversation where it is known
  SMV.mark(sockName, { code: String(a.code || a.state), torn: a.state === 'corrupt', ...(liveName ? { name: String(liveName).slice(0, 120) } : {}), ...(a.state === 'corrupt' && read && typeof read.text === 'string' ? { text: read.text.slice(0, 1 << 20) } : {}) });
  let h = metaHolds.get(sockName);
  if (!h) {
    h = require('../store-read-hold.js').create({ file: fp, valid: metaValid, aside: (mark) => fp + '.corrupt-' + mark, code: 'session-meta-unread',
      words: (f) => `this conversation's record could not be read (${(f && f.code) || 'unreadable'}) — nothing is written over it; changes wait until it reads`,
      log: (m) => console.warn('[session] ' + m),
      // r3141: TORN BYTES are copied aside once, and the record STAYS UNREAD (never lifted as an empty record: its account, resume id and
      // folder are in the copy only) until a WHOLE record from the live conversation restates it, or a read answers
      onLift: (value, facts) => { if (value === null && facts && facts.setAside) { const f = SMV.factsOf(sockName); if (f) f.copy = facts.setAside; return; } liftMeta(sockName, value); } });
    metaHolds.set(sockName, h);
  }
  try { h.start(a); } catch (e) { console.warn(`[session] ${sockName}: its record's hold did not start (${e.message}) — it stays unread`); }
}
/** r3137: the record READ again (a sync read that answered, or its helper's lift: `value` null = lifted empty after torn bytes kept
 *  aside) — the changes that waited are saved ONCE, merged over it */
function liftMeta(sockName, value) {
  if (!SMV.isMarked(sockName)) return value || {};
  SMV.clear(sockName);
  const h = metaHolds.get(sockName);
  if (h) { metaHolds.delete(sockName); try { h.stop(); } catch { } }
  const fp = path.join(META_DIR, sockName + '.json'), w = waitingMeta.get(fp);
  waitingMeta.delete(fp);
  // r3199: a removal asked while the record could not be read (a person's delete, a teardown) is done NOW, at its read
  if (metaDeleteOwed.delete(sockName)) { deleteSessionMetaNow(sockName); return {}; }
  if (value && value.webuiSessionId) SMV.liftedId(sockName, value.webuiSessionId);   // (a conversation left un-adopted at its start: its id kept by the sweeps this run)
  const merged = { ...(value || {}), ...(w || {}) };
  if (w && Object.keys(w).length) writeSessionMeta(sockName, { ...merged }, { durable: true, prev: value || {} });   // (the record as read, the changes that waited on it; its owner check reads nothing again)
  return merged;   // r3199 (the must): every road of the lift hands on the MERGED record
}
const metaDeleteOwed = new Set();   // r3199: sockNames whose removal waits for their record's read
/** r3199: what the LIVE conversation holds that the five whole writers do not list (they leaned on the spread): its account, its
 *  machine, its group, its lock, its token, its pool — so a torn record restated whole resumes on its own account. The same names the
 *  record's first write gives them (ws-create); only what the session has */
function liveExtrasOf(sockName) {
  let s = null; try { for (const x of (activeSessions && typeof activeSessions.values === 'function' ? activeSessions.values() : [])) if (x && x.sockName === sockName) { s = x; break; } } catch { }
  if (!s) return {};
  const pick = { host: s.host, hostName: s.hostName, keeperSid: s.keeperSid, dialDeviceId: s._dialDeviceId, bridgePort: s._bridgePort, dialReversePort: s._dialReversePort,
    modelLocked: s._modelLocked || undefined, lockedModel: s._lockedModel, lockedContext: s._lockedContext, spawnContext: s._spawnContext, agentToken: s.agentToken,
    taskId: s._initialGroupId, taskIds: s._initialGroupIds && s._initialGroupIds.length ? s._initialGroupIds : undefined, accountId: s._accountId,
    billingHow: s._billingHow, oatRoad: s._oatRoad, oatGen: s._oatGen, heldPoolMember: s._heldPoolMember, poolPin: s._poolPin, worktree: s._worktree, worktreePath: s._worktreePath };
  return Object.fromEntries(Object.entries(pick).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}
// Tombstones (2.89.1): teardown deletes the meta, but debounced/straggler
// writers (status flush, todo coalesce, attribution) can fire AFTER the delete
// and resurrect the file from a PARTIAL object — observed as metas with
// sessionId/sockName null, which then confuse the next restore (a real
// restart-data-loss chain). sockNames are unique per spawn, so a deleted one
// is never legitimately written again.
const _metaTombstones = new Map(); // sockName → deletedAt
// COLLISION DETECTOR (a fleet user's 2026-08-11 incident, root-fixed in 2.302.0 —
// this is the belt): a session-meta file belongs to ONE webui session. If a
// write would land on a file already owned by a DIFFERENT session, two
// sessions are sharing a sockName and the identity fields are about to
// cross — that is how a session ended up carrying ANOTHER conversation's
// claudeSessionId (and then resuming the wrong, possibly-live conversation:
// the double-writer hazard, not a cosmetic bug). Never silent.
function sessionMetaOwnerConflict(sockName, meta, had = undefined) {
  try {
    const prev = had !== undefined ? had : readSessionMeta(sockName);   // a caller that just read it hands it in (no second read)
    const a = prev && prev.webuiSessionId, b = meta && meta.webuiSessionId;
    if (a && b && a !== b) {
      console.error(`[session] META COLLISION on ${sockName}: owned by ${a}, written by ${b} — two sessions share a socket name (identity fields would cross)`);
      try { global.__vsMetric?.('session-meta-collision', 1); } catch {}
      return true;
    }
  } catch {}
  return false;
}
// AGENT BROWSER (P0 r5): the conversation → browser-key binding lives in a
// store the kill and pty-exit paths never unlink (`deleteSessionMeta` below
// removes the meta FILE, and §3.2.1's resume rung read only that file — so
// the product's own Terminate → Resume minted a new key every time, measured).
// Recorded HERE because every producer of a meta record passes through this
// function, including the ones that learn the conversation id late (the init
// frame, the lock file). Lazy: an instance that never spawns a browser-keyed
// session never touches the store.
let _browserBindings = null;
const browserBindings = () => _browserBindings || (_browserBindings = require('./browser-bindings.js').create({ dataDir: path.dirname(META_DIR) }));
/** r3786 (LAW 5): the conversation a key was decided for, JOINED into its kept folder's note at this same choke point (off the loop, bounded) */
const keptNoteJoin = (key, sid) => { try { require('./browser-kept-note.js').join(path.join(path.dirname(META_DIR), 'browser-profiles'), key, sid); } catch { } };
/** `{durable: true}` — A BINDING OR A PERSON'S ACT (round 2, law B: the conversation's backend session id after a fork /
 *  resume, a model lock, effort, permission mode, response style, a goal, a rename, a reach level, an editor in
 *  flight; a pool pin's durable half is its own record since B-526c unit 2 — src/pool-pin-record.js): the write is the writer's NEXT (off the loop, rank 0 at a stop) and the returned promise resolves when it is
 *  on disk (false: it failed — kept, retried; the caller tells the person) — the caller ANSWERS after it. `{sync: true}`
 *  — a caller that renames / reads the file itself right after (boot-restore's retireDeadSocket): written here, now.
 *  Everything else (stamps, caches, rings re-derived) is paced. Census ⑦ (scripts/test-store-write-census.mjs) pins every
 *  call by scope. */
function writeSessionMeta(sockName, meta, { durable = false, sync = false, prev = undefined, flagOnly = false, whole = false } = {}) {
  if (_metaTombstones.has(sockName)) return Promise.resolve(true);
  // r3141: a WHOLE record from the live conversation (`whole`: the five writers that restate every key the session holds) restates a
  // TORN record — the mark ends, the changes that waited ride under it; keys the live conversation does not list come from nowhere
  // (said once: the torn bytes stay in their copy)
  if (whole && SMV.isMarked(sockName) && (SMV.factsOf(sockName) || {}).torn && (SMV.factsOf(sockName) || {}).copy) {   // r3199: the copy FIRST, always
    const f = SMV.factsOf(sockName), fpw = path.join(META_DIR, sockName + '.json'), w = waitingMeta.get(fpw);
    SMV.clear(sockName); waitingMeta.delete(fpw);
    const h = metaHolds.get(sockName); if (h) { metaHolds.delete(sockName); try { h.stop(); } catch { } }
    console.warn(`[session] ${sockName}: its torn record (kept aside${f && f.copy ? ' as ' + f.copy : ''}) is restated whole from the live conversation — keys it does not list are only in that copy`);
    return writeSessionMeta(sockName, { ...(w || {}), ...liveExtrasOf(sockName), ...Object.fromEntries(Object.entries(meta || {})) }, { durable, sync, flagOnly, prev: {} });   // r3245 (3): `prev` given — the owner check reads the still-torn file NO second time (no second mark)
  }
  // r3137 (1): NO WRITER SAVES OVER A RECORD IT COULD NOT READ — the change WAITS for the record (its fields, the newest per field;
  // the unread mark is a symbol and is not one of them) and is saved merged over it the moment it reads
  if (SMV.isMarked(sockName) || SMV.isUnread(meta)) {
    const fpw = path.join(META_DIR, sockName + '.json');
    waitingMeta.set(fpw, { ...(waitingMeta.get(fpw) || {}), ...Object.fromEntries(Object.entries(meta || {})) });
    if (!SMV.isMarked(sockName)) { const w = waitingMeta.get(fpw); waitingMeta.delete(fpw); return patchSessionMeta(sockName, w || {}); }   // r3199: it read meanwhile — the change is PATCHED off the loop (no second synchronous read)
    return Promise.resolve(false);
  }
  sessionMetaOwnerConflict(sockName, meta, prev);
  // SESSION-BRAIN step 1 (design §session-brain campaign): the buffer's OWNER
  // is EXPLICIT in every session record. Today the server writes
  // data/session-buffers/<id>.buf for every session including remote ones
  // (the relayed stdout) — 'server'. When session.open (R6) moves parsing +
  // buffer ownership device-side, those records say 'device' and the attach
  // path routes by THIS FIELD instead of assuming. Both readers work either
  // way; no behavior changes until a record actually says 'device'.
  if (meta && typeof meta === 'object' && !meta.bufferOwner) meta.bufferOwner = 'server';
  // tmp+rename (2.219.0): the most frequently written core store was the only
  // non-atomic one — an OOM kill mid-write left truncated JSON that poisoned
  // the next restore.
  const fp = path.join(META_DIR, sockName + '.json');
  const tmp = fp + '.tmp';
  const text = JSON.stringify(meta);
  metaSeq.set(fp, (metaSeq.get(fp) || 0) + 1);
  let done = Promise.resolve(true);
  const firstVersion = !sync && !knownOnDisk(META_DIR, fp);
  if (sync || firstVersion) ensureDir(META_DIR);   // ONE call, only where THIS thread writes (a paced write is a file known on disk — no sync call; lg-recovery cure)
  if (firstVersion) {   // its FIRST version (a socket being born — never a live socket without its meta after a kill): here, now   // only where THIS thread writes (a paced write — a file known on disk — makes no sync call)
    timedSync('session-meta.write', () => { fs.writeFileSync(tmp, text); fs.renameSync(tmp, fp); });
    knownMeta.add(fp); pendingMeta.delete(fp);
  } else if (sync) {
    // round 3 (law 3): a caller that renames / reads the file right after (boot-restore's retireDeadSocket) — this version
    // SUPERSEDES a paced one in flight: that write lands first, then this one, on the writer's thread, waited for here
    // (round 2 forgot the flying write, whose landing was then unlinked: the file this write had just made was deleted)
    pendingMeta.set(fp, text);
    storeWriter().dirty(fp, { name: 'session-meta.write', debounceMs: 0,
      produce: (o) => metaBytes(fp, o), onWritten: (ok) => metaWritten(fp, ok) });   // r3302: the owed keys ride it
    const r = storeWriter().flushSync([fp]);
    if (r.left.length) console.warn(`[session] ${sockName}: its meta could not be written before its rename (${r.left[0].why}) — kept in memory, retried`);
    knownMeta.add(fp);
  } else {
    pendingMeta.set(fp, text);
    storeWriter().dirty(fp, { name: 'session-meta.write', debounceMs: META_DEBOUNCE_MS, ...(durable ? { rank: 0 } : {}),
      produce: (o) => metaBytes(fp, o), onWritten: (ok) => metaWritten(fp, ok) });   // r3302: the owed keys ride it
    if (durable) done = storeWriter().durable(fp).then((ok) => { if (!ok) { let wn = null; try { wn = storeWriter().whyNotDurable(fp); } catch { } console.warn(`[session] ${sockName}: a binding / a person's choice is in memory but not on disk yet (${wn && wn.why === 'queued' ? `its write is still queued${wn.ahead > 0 ? ` behind at least ${wn.ahead} other write${wn.ahead === 1 ? '' : 's'}` : ''} — the storage is slow; kept, written in its turn` : 'its write failed — kept, retried'})`); } return ok; });
  }
  // A FLAG PATCH skips the identity work (the U2 cure's read: a pooled hub's attribution scans every session with a sync
  // readlink inside): it changes none of the fields the attribution and the binding read
  if (flagOnly && prev && typeof prev === 'object') return done;
  try { recordUsageAttribution(meta); } catch {} // usage-ledger account-by-time
  // r6: the id a record may BIND is not always the id it NAMES — a claude/codex
  // fork carries the PARENT's conversation id until the harness announces its
  // own, and binding it here moved the parent onto the fork's browser
  // (measured). `bindableIdOf` answers '' while the record says it was forked
  // from the very conversation it names; the store's own belt refuses a move.
  // r7: and it answers '' when the record names a conversation its key was
  // NOT decided for (`browserKeyFor`, an implicit fork adopted by the
  // consumer) — that one is SAID once per (session, id), because the running
  // process keeps the browser it spawned with and nothing else would tell.
  try { if (meta && meta.browserKey) { const b = browserBindings(); const sid = b.bindableIdOf(meta); if (sid) b.record(sid, meta.browserKey); else b.noteUnbound(meta, sockName); if (sid) keptNoteJoin(meta.browserKey, sid); } } catch (e) { console.warn('[browser] binding record failed: ' + (e && e.message)); }
  return done;
}
function deleteSessionMeta(sockName) {
  // r3137 (2): NO REMOVER REMOVES BY AN UNREAD RECORD — the one delete road (a dead socket's retire, a teardown) keeps it
  // r3199: a person's delete or a teardown asked meanwhile is REMEMBERED (no write lands meanwhile: the tombstone) and done at the read
  // r3245 (4): what is TRUE at the delete — remembered in memory only: done when the record reads in this run; a restart before then
  // finds the record again (no debt kept in a new store) — the notice's row says «its removal waits for its read»
  if (SMV.isMarked(sockName)) { metaDeleteOwed.add(sockName); _metaTombstones.set(sockName, Date.now()); const f = SMV.factsOf(sockName); if (f) f.removalOwed = true; console.warn(`[session] ${sockName}: its record could not be read — kept now; its removal is done when it reads in this run (a restart before then finds it again)`); return false; }
  return deleteSessionMetaNow(sockName);
}
function deleteSessionMetaNow(sockName) {
  _metaTombstones.set(sockName, Date.now());
  if (_metaTombstones.size > 4096) _metaTombstones.delete(_metaTombstones.keys().next().value);
  const fp = path.join(META_DIR, sockName + '.json');
  pendingMeta.delete(fp); knownMeta.delete(fp); metaSeq.delete(fp); owedPatch.delete(fp); doneOwing(fp); stalledMeta.delete(fp);   // (the patch's counter, owed keys, own tries, word and stall fact go with the file)
  try { storeWriter().forget(fp); } catch {}   // its pending write dropped; one in flight lands BEFORE the unlink, never after
  try { fs.unlinkSync(fp); } catch {}
}

// ── SESSION LIVENESS (2026-09-09, the restore incident) ────────────────────
// A restored dtach session must STREAM without the user typing — that is the
// whole restart-survival promise. It stopped doing so because the daemon
// attach path FIRE-AND-FORGOT the open: `openSession()` resolves as soon as
// the `open-session` control frame is written, `handle.ready` (the daemon's
// `session-open` reply / `session-error` / pre-ready link death) was never
// awaited, and `setupSessionPty` ran on the shim regardless. An open that the
// daemon never completed is then a SILENTLY dead pty: no journal line, the
// session still LIVE in the sidebar, nothing to re-attach because the shim's
// onExit never fires either. Production (2026-09-08 22:20 PDT, v2.369.77):
// twelve sessions restored, one claude session showed "3 Bash · running…" for
// ~8 minutes while its wrapper kept appending to its buffer FILE, and the only
// thing that healed it was the ws input detector at 22:29:05 — i.e. the user
// typing. HONEST LIMIT: the journal proves neither a `session-error` nor an
// `[agentd] connection lost` in that window, so WHICH of the two silent shapes
// (a reply that never came, or one nobody was listening for) hit those
// sessions is not established; both are the same dead bridge and both are
// covered below.
//
// THE PROBE IS A READ, NOT A WRITE. `dtach -a <sock> -E -r winch` emits its
// redraw kickoff `\x1b[H\x1b[J` to the attaching client immediately even when
// the program inside is silent (MEASURED: 1 ms locally; 2–50 ms through the
// daemon over the mux; the terminal branch already strips it as the "attach
// preamble"). So a healthy attach ALWAYS produces a byte within milliseconds
// and a dead bridge never does — no stdin write, no wrapper cooperation, and
// it works for chat AND terminal sessions. Writing a probe LINE was rejected
// on measurement: chat-wrapper acks any stdin line but then forwards an
// unrecognised JSON line straight to claude's stdin and wraps a NON-JSON line
// as a user message (= a billed turn), and the sessions this probe exists for
// are by construction running the PREVIOUS release's wrapper (the 2.361.1
// version-skew class), so a new no-op verb cannot be assumed.
const ATTACH_PROBE_MS = 4000;     // >> the measured 2–50 ms first byte; see the confirm stage below
const ATTACH_PROBE_CONFIRM_MS = 600;
const ATTACH_PROBE_MAX_HEALS = 2; // a bounded heal, never a loop
const DEVICE_OPEN_READY_MS = 5000; // measured open-session→ready: 8 ms worst of 10 (sh), 2 ms (dtach -a), 11 ms for 12 concurrent

/** Did ANY byte arrive from this session's pty since `since`? (the ONE reader
 *  of the stamp — both liveness triggers ask it).
 *  `>=`, not `>`: the stamp has MILLISECOND granularity and both callers take
 *  `since` immediately before the thing they are timing, so a byte landing in
 *  that same millisecond is the byte they are waiting for. The tie must fall
 *  on "alive" because the healing side of it RESENDS the user's input — the
 *  echo of a local terminal really can come back inside the same ms as the
 *  write, and a duplicated keystroke is a worse answer than a missed heal we
 *  get another chance at 4.6 s later. (The predicate this replaced compared a
 *  monotone byte COUNT and had no tie to lose.) */
function ptyQuietSince(session, since) { return !(Number(session._lastPtyDataAt) >= since); }

/** THE ONE local re-attach — both liveness triggers land here (the attach
 *  probe below, and ws-handler's broken-stdin detector after a user input).
 *  The TRIGGERS differ because the evidence differs (no bytes since attach vs
 *  no ack + no bytes since the write); the HEALING is one implementation.
 *  Deliberately local: the daemon is the thing under suspicion. */
function reattachLocalPty(id, session, why, { kind = 'reattach' } = {}) {
  if (!activeSessions.has(id) || !session.socketPath) return false;
  // B-b675 (belt): a daemon PIPE session (R6, src/pty-duck.js pipePtyShim) has no dtach behind it — this "re-attach"
  // would kill a healthy pipe (the daemon's kill-pipe-session) and spawn a client against a socket that never existed.
  // ws-create nulls an R6 session's socketPath (the braces); this refuses one that keeps it. A daemonPtyShim is NOT
  // refused: it relays a real `dtach -a`, and healing it locally is the attach probe's whole job.
  if (session.pty && session.pty._pipe) { console.warn(`[${id}] ${why} — NOT re-attached: a daemon pipe session has no dtach socket (its pipe is left alone)`); return false; }
  console.log(`[${id}] ${why} — re-attaching dtach locally`);
  try { global.__vsEvent?.('pty-reattach-local', why); } catch { }
  const silentSince = Number(session._lastPtyDataAt) || null;   // the last byte the OLD bridge carried (the catch-up's "lost at" floor)
  const replay = takeHeldInputs(session);                        // B-c20d: read BEFORE the new pty re-stamps _ptyOpenedAt
  if (session.pty) { try { session.pty.kill(); } catch { } }
  const newPty = pty.spawn(DTACH_CMD, ['-a', session.socketPath, '-E', '-r', 'winch'], {
    name: 'xterm-256color', cols: 120, rows: 30,
    env: { ...agentEnv(), TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  });
  setupSessionPty(session, id, newPty);
  repaintFromBuf(id, session);   // B-c20d: a terminal's clients get the .buf tail (the hole the dead client swallowed), as the onExit ladder's re-attach does
  if (replay.length) replayHeldInputs(session, newPty, replay);
  // lane-dead-bridge: a stuck attach client a dead server left (an ORPHAN) is what makes a bridge dead; the new attach is
  // connected now — the watch ends the socket's orphans (attach first, then kill) and counts what the heal releases
  try { onLocalReattach?.(id, session, { why, kind, silentSince }); } catch { }
  return true;
}

/** B-c20d — THE INPUTS A BRIDGE THAT NEVER SPOKE WAS HANDED. A dtach client that never spoke never connected (its
 *  preamble is written right after connect()), so it forwarded nothing: every input written to it is held, in order,
 *  until it speaks (then the client forwards them — verify r1: re-sending doubled the message) or the ONE healer
 *  replaces it (then they are replayed through the new attach, in order). One message re-sent per detector was the
 *  hole: a second message typed inside the first one's 5 s was ended by the ack of the first one's re-send, and a
 *  heal by the attach probe or the dead-bridge watch re-sent nothing at all. `writeSessionInput` is the ONE write of
 *  a typed input (src/server/user-input.js); the hold ends at the first byte, so it lives for one bridge's silence. */
function writeSessionInput(session, line) {
  const held = session._bridgeHeldInputs;
  if (held && held.pty === session.pty && held.replaying) { held.lines.push(line); return; }   // a heal's replay has not run yet: queue behind it (order)
  session.pty.write(line + '\n');
  if (!session.socketPath) return;
  if (!ptyQuietSince(session, Number(session._ptyOpenedAt) || 0)) { if (held) session._bridgeHeldInputs = null; return; }   // this bridge spoke: it forwards what it gets
  if (held && held.pty === session.pty) held.lines.push(line);
  else session._bridgeHeldInputs = { pty: session.pty, lines: [line], replaying: false };
}
/** What a heal must replay: the held lines of the CURRENT bridge, only if it never spoke (or its own replay never ran). */
function takeHeldInputs(session) {
  const held = session._bridgeHeldInputs;
  session._bridgeHeldInputs = null;
  if (!held || held.pty !== session.pty) return [];
  if (held.replaying) return held.lines;   // healed again inside the last heal's 500 ms: none of these was written yet
  return ptyQuietSince(session, Number(session._ptyOpenedAt) || 0) ? held.lines : [];
}
/** Replay through the new attach, after the 500 ms the single re-send always waited (dtach sets its raw mode first).
 *  The lines stay held on the NEW bridge: if it never speaks either, the next heal replays them again. */
function replayHeldInputs(session, newPty, lines) {
  const held = session._bridgeHeldInputs = { pty: newPty, lines: lines.slice(), replaying: true };
  setTimeout(() => {
    if (session._bridgeHeldInputs !== held || session.pty !== newPty) return;   // healed again meanwhile: that heal took the lines
    held.replaying = false;
    for (const l of held.lines) { try { newPty.write(l + '\n'); } catch { } }
    if (!ptyQuietSince(session, Number(session._ptyOpenedAt) || 0)) session._bridgeHeldInputs = null;
  }, 500);
}

/** The terminal RE-attach repaint — both re-attach paths (the onExit ladder's attachToDtach({repaint}) and THE ONE
 *  HEALER): dtach replays nothing on attach and a plain shell never repaints, so the buffer FILE tail (clear +
 *  replay) goes to attached clients — a daemon self-upgrade re-exec, or the output a dead client swallowed before a
 *  heal, otherwise stayed blank / a hole until a page reload. */
function repaintFromBuf(id, session) {
  if (session.mode === 'chat') return;
  try {
    const buf = fs.readFileSync(path.join(BUFFERS_DIR, id + '.buf'));
    const tail = buf.length > 200000 ? buf.subarray(buf.length - 200000) : buf;
    const data = '\x1b[2J\x1b[3J\x1b[H' + tail.toString('utf-8');
    session.buffer = tail.toString('utf-8').slice(-50000);
    broadcastToSession(session, id, { type: 'output', sessionId: id, data });
  } catch { /* no buffer file — nothing to repaint */ }
}

// Attach a PTY to an existing dtach socket for I/O.
// opts.repaint (the RE-attach path): repaintFromBuf above.
function attachToDtach(id, socketPath, session, { repaint = false, restore = false, catchUp = null, fence = null } = {}) {
  const repaintClients = () => { if (repaint) repaintFromBuf(id, session); };
  // Arm the liveness probe for THIS attach: if the bridge produced no byte at
  // all, heal it locally. The confirm stage exists because a blocked event
  // loop runs the timers phase before the poll phase — a 30 s boot stall
  // (measured in the incident journal) would otherwise fire the verdict ahead
  // of bytes that had long since arrived on the socket.
  // `since` is a PARAMETER because the device path stamps bytes it buffered
  // BEFORE the shim existed (see the early-data replay below): the window the
  // probe judges has to start when the BRIDGE was opened, not when the last
  // line of wiring ran, or a preamble we successfully caught reads as silence.
  const armProbe = (ptyProcess, via, since = Date.now()) => {
    const verdict = () => {
      if (!activeSessions.has(id) || session.pty !== ptyProcess) return;   // replaced/torn down — not ours to judge
      // The attach preamble landed: this bridge is alive. Clear the heal
      // counter — the bound below is on CONSECUTIVE silent attaches, the same
      // shape as `_reattachAttempts`, which the terminal branch resets on
      // data. A lifetime cap would spend a long-lived session's two heals on
      // two unrelated daemon hiccups days apart and then leave the third one
      // dark until somebody typed, which is the incident.
      if (!ptyQuietSince(session, since)) { session._attachProbeHeals = 0; return; }
      if (!ptyProcess._daemon) {
        // A local dtach -a that produced nothing means the SOCKET is stale;
        // re-attaching locally again would only repeat it, and the pty's own
        // exit drives the bounded re-attach ladder. Say so once.
        console.warn(`[${id}] local dtach attach produced no output within ${ATTACH_PROBE_MS + ATTACH_PROBE_CONFIRM_MS} ms (${via}) — the dtach socket may be stale`);
        try { global.__vsEvent?.('pty-attach-silent', via); } catch { }
        return;
      }
      session._attachProbeHeals = (session._attachProbeHeals || 0) + 1;
      if (session._attachProbeHeals > ATTACH_PROBE_MAX_HEALS) {
        console.warn(`[${id}] device pty still silent after ${ATTACH_PROBE_MAX_HEALS} local re-attach(es) — giving up on this attach (${via})`);
        return;
      }
      reattachLocalPty(id, session, `no byte from the device pty within ${ATTACH_PROBE_MS + ATTACH_PROBE_CONFIRM_MS} ms of attach (${via})`);
    };
    setTimeout(() => {
      if (!activeSessions.has(id) || session.pty !== ptyProcess) return;
      if (!ptyQuietSince(session, since)) return;
      setTimeout(verdict, ATTACH_PROBE_CONFIRM_MS);
    }, ATTACH_PROBE_MS);
  };
  const localAttach = () => {
    const attachPty = pty.spawn(DTACH_CMD, ['-a', socketPath, '-E', '-r', 'winch'], {
      name: 'xterm-256color', cols: 120, rows: 30,
      env: { ...agentEnv(), TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });
    setupSessionPty(session, id, attachPty, { catchUp, fence });   // B-cd4b: a restore's catch-up and its fence (the local road only: a restore takes them)
    repaintClients();
    armProbe(attachPty, 'local');
  };
  // M1: daemon owns the pty when enabled — the dtach attach runs INSIDE agentd
  // and relays over the mux. On ANY failure fall back to the local pty so a
  // daemon hiccup never loses a session.
  //
  // BOOT ORDERING (the incident's second half): server.js starts
  // `deviceMgr.connect()` and calls restoreSessions() on the very next lines,
  // so on a cold boot the daemon link is still being established — in the
  // production journal the connect was in flight for the WHOLE restore
  // (`spawned local daemon` 22:20:56, `routing ENABLED` 22:21:02, restore
  // 22:20:22–22:20:53) and the link it finally produced had just streamed a
  // new bundle into the old daemon and waited out its re-exec. A restored
  // dtach session relays NOTHING while unattached and dtach replays nothing
  // afterwards, so the continuity-preserving answer is to take the daemon
  // path only when the link is ALREADY live: a local pty is available in the
  // SAME TICK, with no blind window and no migration churn.
  // Of the two options the task named, this one and not "connect first":
  // awaiting the link would put that whole 40 s (spawn + version handshake +
  // bundle upload + re-exec, MEASURED in the journal above) in front of every
  // session's restore, and a daemon that never comes up would stall the boot
  // that exists to bring those sessions back. Migrating a working local pty
  // onto the daemon after 'routing ENABLED' was rejected for the same reason
  // the gate exists: it is a teardown + re-attach on a bridge that is already
  // relaying, i.e. a second blind window bought for nothing.
  // WHAT THIS COSTS, precisely: `attachToDtach` has exactly two callers —
  // boot-restore (gated local by the above) and the re-attach ladder in
  // setupSessionPty's onExit, which fires long after 'routing ENABLED' and
  // still takes the daemon. New sessions never took this path at all:
  // ws-create spawns `dtach -c` under its own node-pty.
  const deviceMgr = getDeviceMgr();
  // B-cd4b: the restore's attaches stay LOCAL (`restore: true`): its bounded batches run over several turns, and a link that
  // comes up mid-drain must not send the later survivors down this road (the gate above: the one-pass restore always ran first)
  if (!restore && deviceMgr && !session.host && deviceMgr.status?.().connected) {
    // OBSERVE THE OPEN. `handle.ready` resolves on the daemon's `session-open`
    // and rejects on `session-error` / pre-ready link death (2.271.0 T1-6) —
    // fire-and-forget made both of those a dead bridge nobody could see.
    let abandoned = false;
    deviceMgr.openSession({
      cmd: DTACH_CMD, args: ['-a', socketPath, '-E', '-r', 'winch'], cols: 120, rows: 30,
      // The daemon merges this over its OWN process env in spawnEnv(), which
      // is the right base here: the local branch's `process.env` reaches
      // NOTHING in attach mode — measured, `/usr/bin/dtach` imports no
      // getenv/secure_getenv and carries no env-var name strings; its only
      // env consumer is execvp, which runs on `-c`/`-n` CREATE only, and the
      // agent CLI lives inside the dtach MASTER with the env it was spawned
      // with. Shipping the whole server env over the mux on every attach
      // would put every secret in it into a control frame for no effect.
      env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    }).then((h) => {
      // CATCH THE BYTES THAT ARRIVE BEFORE THERE IS A LISTENER. The mux
      // dispatches a whole socket read synchronously, so a `session-open`
      // control frame and the dtach preamble that follows it can land in the
      // SAME read; `ready` is a promise, so it settles a microtask later and
      // `handle.onData` is still null when that data frame is dispatched — it
      // would be dropped on the floor. Harmless for a chatty session, fatal
      // for the probe's evidence on a SILENT one (an idle claude waiting on a
      // prompt emits nothing else), which would make a healthy daemon heal on
      // every attach. Buffer here, replay once the shim's listeners exist.
      const early = [];
      h.onData = (buf) => early.push(buf);
      h._earlyData = early;
      // Handle the rejection here too, so a `ready` nobody raced is never an
      // unhandled rejection; and if we already fell back, kill the late open
      // so two dtach clients never relay the same session twice.
      h.ready.then(() => { if (abandoned) { try { h.kill(); } catch { } } }, () => { });
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`device did not answer open-session within ${DEVICE_OPEN_READY_MS} ms`)), DEVICE_OPEN_READY_MS);
        h.ready.then(() => { clearTimeout(t); resolve(h); }, (e) => { clearTimeout(t); reject(e); });
      }).catch((e) => { abandoned = true; try { h.kill(); } catch { } throw e; });
    }).then((h) => {
      const openedAt = Date.now();
      const shim = daemonPtyShim(h);   // reassigns h.onData to its listener SET (one slot would drop the stamp registered first)
      setupSessionPty(session, id, shim);
      for (const buf of (h._earlyData || []).splice(0)) { try { h.onData(buf); } catch { } }
      repaintClients();
      armProbe(shim, 'device', openedAt);
    }).catch((e) => {
      console.warn(`[device] ${id}: session attach failed (${e.message}) — local pty fallback`);
      try { global.__vsEvent?.('pty-device-open-failed', e.message); } catch { }
      localAttach();
    });
    return;
  }
  localAttach();
}

// On startup, reconnect to existing dtach sockets
  return { setupSessionPty, attachToDtach, readSessionMeta, writeSessionMeta, patchSessionMeta,
    deleteSessionMeta, sessionMetaOwnerConflict, _metaTombstones,
    applyTaskToolUpdate, emitTaskListTodos, updateSessionTodos,
    reattachLocalPty, ptyQuietSince, writeSessionInput }; // the ONE healer + the ONE liveness reader (ws-handler's input detector shares both) + the ONE typed-input write (B-c20d)
}
module.exports = { create };
