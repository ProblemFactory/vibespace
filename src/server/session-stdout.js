'use strict';
// SESSION STDOUT ENGINE (decomposition #6 — the largest module).
// setupSessionPty (the claude/codex stdout dispatch: normalizers, side-effect
// consumers, subagent watchers, task/todo capture, death classification,
// implicit-fork adoption) + attachToDtach + the session-meta store
// (read/write/delete + tombstones + owner-conflict guard). Extracted VERBATIM.
// ORCH tier: it consumes the machine handle (hosts) and the usage/pool engine,
// never vendor APIs. Late-created deps arrive lazily — all uses are at runtime.
const { classifyCliDeath } = require('./agent-tool-generators.js');
const { ClaudeCodeAdapter } = require('../adapters/claude-code.js');
const { capsOf } = require('../backend-caps.js'); // streamProtocol picks the parse pipeline — never the backend id (P4)
const fs = require('fs');
const os = require('os');
const path = require('path');
const pty = require('node-pty');
const { spawn } = require('child_process');
const { MessageManager } = require('../message-manager');
const { cwdToProjectDir } = require('../session-store');
const { normalizeCodexSource } = require('../adapters/codex');

const { mk } = require('./lazy.js');

function create({ rootDir, BUFFERS_DIR, META_DIR, DTACH_CMD, USAGE_SCANNER_PATH,
  CLAUDE_STREAM_TYPES, _seenStreamTypes, activeSessions, engine,
  checkClaudeGoalStatus, broadcastToSession, broadcastActiveSessions,
  noteModelSeen, recordUsageAttribution, daemonPtyShim, sbSeenFirst, getDeviceMgr,
  getHosts, getUsageHistory, getTelemetry, getNoConvoRef, getDeliver }) {
  const { _vsuPending, armWorkflowUsageWatcher, kickPoolEval, markLimitBanner,
    maybePoolAutoSwitch, maybeRepinLockedModel, maybeStopOnFallback, notePoolAuthFailure,
    modelsMatch, recordRateLimitEvent, recordCodexQuotaSignal, resolveUsageKey, usageEstimator } = engine;
  const hosts = mk(getHosts);
  const usageHistory = mk(getUsageHistory);
  const telemetry = mk(getTelemetry);
  const noConvoRef = mk(getNoConvoRef);
  const deliverRef = mk(getDeliver);
  const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
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

function setupSessionPty(session, id, ptyProcess, { cleanupOnExit = true } = {}) {
  session.pty = ptyProcess;

  if (session.mode === 'chat') {
    let lineBuf = '';
    // Dispatch by DECLARED protocol (P4): a chat backend without a registered
    // pipeline must fail loudly here, not be silently parsed as stream-json.
    const streamProto = capsOf(session.backend).streamProtocol;
    if (session.mode === 'chat' && !streamProto) {
      console.error(`[session] backend "${session.backend}" has no streamProtocol in src/backend-caps.js — chat output passes through RAW (register a pipeline)`);
      global.__vsEvent?.('chat-backend-no-protocol', String(session.backend));
    }
    if (streamProto === 'codex-events') {
      const stripAnsi = (value) => String(value || '').replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
      ptyProcess.onData((output) => {
        if (session._reattachAttempts) session._reattachAttempts = 0;
        // Append, trim only past 1.5x cap — slicing a fresh 800KB string per
        // delta chunk was hundreds of MB/s of string churn while streaming
        session.buffer += output;
        if (session.buffer.length > 1200000) session.buffer = session.buffer.slice(-800000);
        lineBuf += output;
        let nlIdx;
        while ((nlIdx = lineBuf.indexOf('\n')) !== -1) {
          const line = lineBuf.substring(0, nlIdx).replace(/\r/g, '').trim();
          lineBuf = lineBuf.substring(nlIdx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(stripAnsi(line).trim());
            if (msg.type === '_stdin_ack') { session._stdinAckReceived = true; continue; }
            const payload = msg.payload || {};
            // remote transport state (2.139.0 codex remote chat, B-0588) —
            // rides as an event_msg record from the wrapper; mirror the
            // claude branch's broadcast so the status-bar chip works
            if (msg.type === 'event_msg' && payload.type === '_remote_state') {
              session._remoteState = payload.state === 'connected' ? null : { state: payload.state, attempts: payload.attempts || 0, at: Date.now() };
              broadcastToSession(session, id, { type: 'remote-state', sessionId: id, state: payload.state, attempts: payload.attempts || 0 });
              continue;
            }
            const nextThreadId = msg.type === 'session_meta'
              ? payload.id
              : msg.type === 'wrapper_meta'
                ? payload.threadId
                : null;
            // Name ONLY from meta records: every codex function_call carries
            // payload.name = the TOOL name ('shell'…) — ungated, each tool call
            // renamed the session + 2 sync meta writes + 2 broadcasts, forever
            // (audit round-2, high). Real thread names arrive via
            // session_meta/wrapper_meta only.
            const nextThreadName = (msg.type === 'session_meta' || msg.type === 'wrapper_meta')
              ? (payload.session_name || payload.sessionName || payload.threadName || payload.name || payload.thread?.name || null)
              : null;
            const sourceMeta = payload.source ? normalizeCodexSource(payload.source) : null;
            let changed = false;
            if (nextThreadId && session.backendSessionId !== nextThreadId) {
              if (session.backendSessionId) {
                const prev = session.forkedFrom || [];
                if (!prev.includes(session.backendSessionId)) prev.push(session.backendSessionId);
                session.forkedFrom = prev;
              }
              session.backendSessionId = nextThreadId;
              session.claudeSessionId = null;
              changed = true;
            }
            if (nextThreadName && session.name !== nextThreadName) {
              session.name = nextThreadName;
              changed = true;
            }
            if (payload.cwd && session.cwd !== payload.cwd) {
              session.cwd = payload.cwd;
              changed = true;
            }
            if (sourceMeta) {
              const nextFields = {
                sourceKind: sourceMeta.sourceKind || null,
                agentKind: sourceMeta.agentKind || 'primary',
                agentRole: sourceMeta.agentRole || '',
                agentNickname: sourceMeta.agentNickname || '',
                parentThreadId: sourceMeta.parentThreadId || null,
              };
              for (const [key, value] of Object.entries(nextFields)) {
                if ((session[key] || null) !== (value || null)) {
                  session[key] = value;
                  changed = true;
                }
              }
            }
            if (changed && session.sockName) {
              writeSessionMeta(session.sockName, {
                ...(readSessionMeta(session.sockName) || {}), // preserve keys not re-listed (agentToken/taskId/accountId)
                name: session.name,
                cwd: session.cwd,
                backend: session.backend,
                backendSessionId: session.backendSessionId,
                claudeSessionId: null,
                sourceKind: session.sourceKind || null,
                agentKind: session.agentKind || 'primary',
                agentRole: session.agentRole || '',
                agentNickname: session.agentNickname || '',
                parentThreadId: session.parentThreadId || null,
                forkedFrom: session.forkedFrom || null,
                permissionMode: session._permissionMode || null,
                effort: session._effort || null,
                createdAt: session.createdAt,
                webuiSessionId: id,
                mode: session.mode,
              });
              broadcastActiveSessions();
            }
            // Track turn lifecycle: streaming state + activity label
            {
              let newLabel = null;
              if (msg.type === 'event_msg') {
                const evType = payload.type;
                if (evType === 'task_started' && payload.turn_id) { session._isStreaming = true; newLabel = 'thinking...'; }
                else if (evType === 'task_complete' || evType === 'turn_aborted' || evType === 'task_failed') { session._isStreaming = false; newLabel = ''; }
                else if (evType === 'goal_updated' && payload.goal) {
                  session._goal = payload.goal.objective || null;
                  session._goalElapsed = (payload.goal.timeUsedSeconds || payload.goal.time_used_seconds || 0) * 1000;
                  session._goalStatus = payload.goal.status || null;
                  broadcastToSession(session, id, { type: 'goal-updated', sessionId: id, goal: session._goal, goalElapsed: session._goalElapsed, goalStatus: session._goalStatus });
                } else if (evType === 'goal_cleared') {
                  if (session._goal) session._prevGoal = session._goal;
                  session._goal = null; session._goalElapsed = 0; session._goalStatus = null;
                  broadcastToSession(session, id, { type: 'goal-updated', sessionId: id, goal: null, statusMsg: 'Goal cleared' });
                }
              } else if (msg.type === 'response_item') {
                const itemType = payload.type;
                if (itemType === 'message' && payload.role === 'assistant') newLabel = 'responding';
                else if (itemType === 'function_call') newLabel = `running ${payload.name || 'tool'}`;
                else if (itemType === 'reasoning') newLabel = 'thinking...';
              }
              if (newLabel !== null && session._streamingLabel !== newLabel) {
                session._streamingLabel = newLabel;
                broadcastToSession(session, id, { type: 'streaming-label', sessionId: id, label: newLabel, kind: session._streamingKind || null });
              }
            }
            // Codex quota signals → pool/auto-resume engine (P2): readings +
            // typed exhaustion, relayed by the wrapper (older wrappers simply
            // never emit these — additive, no capability gate needed)
            if (msg.type === 'event_msg' && (msg.payload?.type === 'rate_limits_updated' || msg.payload?.type === 'task_failed' || msg.payload?.type === 'reset_credit_result')) {
              try { recordCodexQuotaSignal?.(session, msg.payload); } catch {}
            }
            // rpc-queue delivery honesty (peerDelivery registry lane): the
            // deliver ladder returned ok on the stdin write, so a wrapper-side
            // failure (queue/add rejected, turn/start error) must RE-STASH the
            // text for next-turn injection — never silently lose a promised
            // message. (ok:true needs no action: the wrapper recorded it.)
            if (msg.type === 'event_msg' && msg.payload?.type === 'peer_message_result' && msg.payload.ok === false && msg.payload.text) {
              const cid = session.backendSessionId || session.claudeSessionId;
              console.log(`[deliver] rpc-queue wrapper delivery failed (${msg.payload.reason || 'unknown'}) — re-stashing for ${cid}`);
              try { if (cid) deliverRef()?.stashFor(cid, { source: 'agent', fromName: null, text: String(msg.payload.text) }); } catch {}
            }
            // Codex plan tool → the session's live TODO summary (board pill)
            if (msg.type === 'event_msg' && msg.payload?.type === 'plan_updated' && Array.isArray(msg.payload.plan)) {
              updateSessionTodos(session, msg.payload.plan.map((p) => ({
                content: p.step || '',
                status: (p.status === 'inProgress' || p.status === 'in_progress') ? 'in_progress' : (p.status === 'completed' ? 'completed' : 'pending'),
              })));
            }
            if (session._normalizer) session._normalizer.processLive(msg);
          } catch {
            broadcastToSession(session, id, { type: 'output', sessionId: id, data: line + '\n' });
          }
        }
      });
    } else if (streamProto === 'stream-json') {
      if (!session.subagentBuffers) session.subagentBuffers = new Map();
      if (!session.subagentEmittedUuids) session.subagentEmittedUuids = new Map(); // toolUseId → Set<uuid>
      if (!session.subagentWatchers) session.subagentWatchers = new Map(); // toolUseId → {watcher, offset}

      // Watch a subagent JSONL file for new messages (fills gap: text/thinking not in stream-json)
      const startSubagentWatcher = (toolUseId, agentId, attempt = 0) => {
        if (session.subagentWatchers.has(toolUseId)) return;
        // Find JSONL path
        const projectsDir = path.join(os.homedir(), '.claude', 'projects');
        const projDir = cwdToProjectDir(session.cwd || '');
        const candidates = [];
        if (session.claudeSessionId) {
          candidates.push(path.join(projectsDir, projDir, session.claudeSessionId, 'subagents', `agent-${agentId}.jsonl`));
          try { for (const dir of fs.readdirSync(projectsDir)) { const fp = path.join(projectsDir, dir, session.claudeSessionId, 'subagents', `agent-${agentId}.jsonl`); if (!candidates.includes(fp)) candidates.push(fp); } } catch {}
        }
        const watchFile = candidates.find(f => { try { return fs.existsSync(f); } catch { return false; } });
        if (!watchFile) {
          // File doesn't exist yet — retry with backoff, capped: an agent that
          // failed before writing its JSONL never gets a task_notification, so
          // an uncapped 1s retry (each with a full projects-dir scan) would
          // spin for the session's lifetime
          if (attempt >= 30) { session.subagentWatchers.delete(toolUseId); return; }
          const delay = Math.min(10000, 1000 * Math.pow(1.3, attempt));
          // Belt-and-braces liveness: a killed session must not keep re-scanning
          // the projects dir through this retry chain (audit round-2)
          const retry = setTimeout(() => { session.subagentWatchers.delete(toolUseId); if (!activeSessions.has(id)) return; startSubagentWatcher(toolUseId, agentId, attempt + 1); }, delay);
          session.subagentWatchers.set(toolUseId, { watcher: null, retry, lastActivity: Date.now() });
          return;
        }
        if (!session.subagentEmittedUuids.has(toolUseId)) session.subagentEmittedUuids.set(toolUseId, new Set());
        const emitted = session.subagentEmittedUuids.get(toolUseId);
        let offset = 0;
        // Read existing content first
        const readNewLines = () => {
          try {
            const stat = fs.statSync(watchFile);
            if (stat.size <= offset) return;
            const buf = Buffer.alloc(stat.size - offset);
            const fd = fs.openSync(watchFile, 'r');
            fs.readSync(fd, buf, 0, buf.length, offset);
            fs.closeSync(fd);
            offset = stat.size;
            for (const line of buf.toString('utf-8').split('\n')) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const msg = JSON.parse(trimmed);
                if (msg.uuid && emitted.has(msg.uuid)) continue; // already sent via stream-json
                if (msg.uuid) emitted.add(msg.uuid);
                if (msg.type !== 'user' && msg.type !== 'assistant' && msg.type !== 'result') continue;
                // Buffer + broadcast
                if (!session.subagentBuffers.has(toolUseId)) session.subagentBuffers.set(toolUseId, []);
                session.subagentBuffers.get(toolUseId).push(msg);
                broadcastToSession(session, id, { type: 'subagent-message', sessionId: id, parentToolUseId: toolUseId, message: msg });
                // Normalize for subagent viewers
                if (!session._subNormalizers) session._subNormalizers = new Map();
                if (!session._subNormalizers.has(toolUseId)) {
                  const subMM = new MessageManager(`sub-${toolUseId}`);
                  subMM.onOp((op) => broadcastToSession(session, id, { type: 'msg', sessionId: `sub-${toolUseId}`, ...op }));
                  session._subNormalizers.set(toolUseId, subMM);
                }
                session._subNormalizers.get(toolUseId).processLive(msg);
              } catch {}
            }
          } catch {}
        };
        readNewLines(); // read any existing content
        const watcher = fs.watch(watchFile, () => { const e = session.subagentWatchers.get(toolUseId); if (e) e.lastActivity = Date.now(); readNewLines(); });
        session.subagentWatchers.set(toolUseId, { watcher, lastActivity: Date.now() });
      };

      const stopSubagentWatcher = (toolUseId) => {
        const entry = session.subagentWatchers.get(toolUseId);
        if (entry) {
          if (entry.watcher) entry.watcher.close();
          if (entry.retry) clearTimeout(entry.retry);
          session.subagentWatchers.delete(toolUseId);
        }
      };
      // restoreSessions re-arms watchers for agents that span a restart via
      // this handle (the wrapper meta's task map carries their ids); the
      // 10-min inactivity sweep bounds any stale entry it re-creates
      session._startSubagentWatcher = startSubagentWatcher;

      ptyProcess.onData((output) => {
        if (session._reattachAttempts) session._reattachAttempts = 0;
        session.buffer += output;
        if (session.buffer.length > 750000) session.buffer = session.buffer.slice(-500000);
        lineBuf += output;
        let nlIdx;
        while ((nlIdx = lineBuf.indexOf('\n')) !== -1) {
          const line = lineBuf.substring(0, nlIdx).replace(/\r/g, '').trim();
          lineBuf = lineBuf.substring(nlIdx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            // BREADCRUMB for CLI evolution (2.227.8): the claude stream gained
            // `tool_progress` and it silently rode the subagent branch for
            // weeks (2.227.7) — the SECOND time a new upstream record type
            // became an invisible product gap (the first was
            // model_refusal_fallback, 2.227.4). Name-only, deduped per
            // process, so the NEXT new top-level type shows up in Diagnostics
            // instead of waiting for a user to notice something odd.
            if (msg.type && !CLAUDE_STREAM_TYPES.has(msg.type) && !_seenStreamTypes.has(msg.type)) {
              _seenStreamTypes.add(msg.type);
              global.__vsEvent?.('cli-unknown-stream-type', String(msg.type).slice(0, 60));
              console.log(`[claude] new stream record type from the CLI: ${msg.type} (unhandled — see Diagnostics)`);
            }
            if (msg.type === '_stdin_ack') { session._stdinAckReceived = true; continue; }
            // Remote transport state from the chat-wrapper (2.125.0): the ssh
            // pipe died and the wrapper is reconnecting to the host-side keeper
            // (the REMOTE session is fine). Surfaced as a status-bar chip; the
            // attach payload carries the current value for refreshes.
            if (msg.type === '_remote_state') {
              const rs = { state: msg.state, attempts: msg.attempts || 0, at: Date.now(), lastError: msg.lastError || null };
              session._remoteState = msg.state === 'connected' ? null : rs;
              broadcastToSession(session, id, { type: 'remote-state', sessionId: id, ...rs });
              broadcastActiveSessions(); // card chip follows the transport state (2.219.1)
              continue;
            }

            // Claude fork: adopt the new session id. --fork-session makes claude
            // mint a fresh id at startup — the very first system/hook_started
            // line already carries it (verified) — and write a separate JSONL.
            // Without adopting it the WebUI keeps tracking the PARENT id, so the
            // forked window shadows the original (same name/history/resume
            // target) and the fork's transcript is orphaned — indistinguishable
            // from a plain resume. One-shot _forkRequested guard (set only when
            // data.fork) so a normal resume, whose id the parser also sees on
            // every line, can never be hijacked.
            // FIRST-capture is UNCONDITIONAL (2.156.1, userL real incident):
            // a session created with claudeSessionId=null could NEVER adopt its
            // id here — the fork guard vetoed the only parser-side capture.
            // Local sessions were silently rescued by lock-first discovery
            // (local locks visible); REMOTE keeper sessions had no rescuer, so
            // meta kept null forever and attach's transcript prefetch died on
            // it. Hijack-safety is preserved: with NO tracked id there is
            // nothing to hijack, and a CHANGED id still requires _forkRequested.
            // IMPLICIT FORK adoption (2.219.0, userL real incident): a
            // `claude --resume <id>` whose conversation is LOCKED by another
            // live claude (an orphaned keeper child) silently forks to a NEW
            // session id — no fork flag from us, claude's own double-writer
            // protection. The 2.156.1 hijack guard vetoed that change, so
            // VibeSpace kept tracking the OLD id while claude wrote the new
            // file: the live stream showed the turns, every restart-rebuilt
            // history lost them ("compact recap 里有, 窗口里不展示"). An id
            // change on the FIRST id-bearing line of a RESUME spawn is claude
            // telling us the real id — adopt it (mid-stream changes without
            // the fork flag stay vetoed).
            const implicitFork = session._resumeSpawn && !session._sawFirstId
              && session.backendSessionId && msg.session_id !== session.backendSessionId;
            if (typeof msg.session_id === 'string' && msg.session_id && !session._sawFirstId) {
              session._sawFirstId = true;
              // persist the disarm for resumes — a restart between first-id and
              // a later id-bearing line must not re-arm implicit-fork adoption
              if (session._resumeSpawn && session.sockName) {
                try { writeSessionMeta(session.sockName, { ...(readSessionMeta(session.sockName) || {}), sawFirstId: true }); } catch {}
              }
            }
            if (typeof msg.session_id === 'string' && msg.session_id
                && (!session.backendSessionId || ((session._forkRequested || implicitFork) && session.backendSessionId !== msg.session_id))) {
              if (session.backendSessionId) {
                const prev = session.forkedFrom || [];
                if (!prev.includes(session.backendSessionId)) prev.push(session.backendSessionId);
                session.forkedFrom = prev;
              }
              session.backendSessionId = msg.session_id;
              session.claudeSessionId = msg.session_id;
              session._forkRequested = false; // adopt once, then stop watching
              if (session.sockName) {
                writeSessionMeta(session.sockName, {
                  ...(readSessionMeta(session.sockName) || {}), // preserve keys not re-listed (agentToken/taskId/accountId)
                  name: session.name,
                  cwd: session.cwd,
                  backend: session.backend,
                  backendSessionId: session.backendSessionId,
                  claudeSessionId: session.claudeSessionId,
                  sourceKind: session.sourceKind || null,
                  agentKind: session.agentKind || 'primary',
                  agentRole: session.agentRole || '',
                  agentNickname: session.agentNickname || '',
                  parentThreadId: session.parentThreadId || null,
                  forkedFrom: session.forkedFrom || null,
                  permissionMode: session._permissionMode || null,
                  effort: session._effort || null,
                  createdAt: session.createdAt,
                  webuiSessionId: id,
                  mode: session.mode,
                });
              }
              broadcastActiveSessions();
            }

            // Billing identity TRUTH: the init record's apiKeySource is the
            // CLI's own statement of what auth it resolved — 'none'=subscription
            // OAuth, '/login managed key'=console login (API billing),
            // 'ANTHROPIC_API_KEY'=env key. Overrides the spawn-time guess.
            if (msg.type === 'system' && msg.subtype === 'init' && typeof msg.apiKeySource === 'string') {
              if (session._apiKeySource !== msg.apiKeySource) {
                session._apiKeySource = msg.apiKeySource;
                if (session.sockName) writeSessionMeta(session.sockName, { ...(readSessionMeta(session.sockName) || {}), apiKeySource: msg.apiKeySource });
                broadcastActiveSessions();
              }
            }

            // get_usage control-response (vsu- ids are OURS): payload nests at
            // response.response (live-verified 2026-08-09); resolve the ⟳
            // probe's promise + persist. Other control_responses untouched.
            if (msg.type === 'control_response' && String(msg.response?.request_id || '').startsWith('vsu-')) {
              const pend = _vsuPending.get(msg.response.request_id);
              if (pend) {
                _vsuPending.delete(msg.response.request_id);
                clearTimeout(pend.timer);
                let parsed = null;
                try { parsed = ClaudeCodeAdapter.parseGetUsageResponse(msg.response.response); } catch {}
                pend.resolve(parsed);
              }
            }
            // Served-model truth for the lock re-pin (assistant records carry
            // the model that actually answered; '<synthetic>' rows excluded).
            // MAIN THREAD ONLY (review-caught): subagents/sidechains run their
            // own models — without the guard a haiku subagent both spuriously
            // triggered repins AND masked a real main-thread reroute when it
            // answered last.
            // STEP 3 record REGISTRATION (first-writer-wins, parse-primary):
            // the parse marks every record it processes; the DEVICE feed runs
            // the side-effect families only for records the parse has NOT yet
            // seen (relay lag, wrapper reconnect windows, a dead relay). The
            // parse keeps full authority when healthy — the device stream
            // fills its gaps and beats its latency, never double-fires. Every
            // family is idempotent by design regardless (stdout re-emits the
            // same msg.id up to 3×), so the gate is belt, not the only guard.
            sbSeenFirst(session, msg);
            if (msg.type === 'assistant' && !msg.parent_tool_use_id && !msg.isSidechain
                && msg.message?.model && !String(msg.message.model).startsWith('<')) {
              session._servedModel = msg.message.model; session._servedModelAt = Date.now();
              try { noteModelSeen(session._servedModel); } catch { }
              // Latch a target-less lock (locked before any model was known —
              // restored sessions, pre-first-reply locks): first main-thread
              // served model becomes the target, else repin no-ops forever.
              if (session._modelLocked && !session._lockedModel) {
                session._lockedModel = session._servedModel;
                try { if (session.sockName) writeSessionMeta(session.sockName, { ...(readSessionMeta(session.sockName) || {}), lockedModel: session._lockedModel }); } catch {}
              }
            }
            // CLI error-class telemetry (2.207.0, names/enums only — no
            // content): usage-limit sightings and silent model fallbacks are
            // exactly what tonight's incidents needed frequency data for.
            // LIVE odometer feed (event-driven estimation): note every usage-
            // carrying record — main thread AND subagent sidechains — the
            // moment it streams (before the transcript flush, long before the
            // ledger scan), then kick a throttled pool re-evaluation. This is
            // what makes burst burns visible between scan ticks (exhaustion #2:
            // half the Fable bucket evaporated inside one polling interval).
            // Bug B (2.297.0, offline-bias audit): a HOST-LOGIN remote session
            // has no local billing identity — resolveUsageKey fell through to
            // '__global__', crediting the LOCAL machine login's live odometer
            // with another machine's spend (then the harvest landed the real
            // event and the estimate visibly dropped back — spend that
            // un-counts itself). Host-login sessions skip the ring; the
            // harvest is their one ledger path. Account-billed remote
            // sessions keep riding it (their identity is real and global).
            if (msg.type === 'assistant' && msg.message?.usage && (msg.requestId || msg.message?.id)
                && !(session.host && !session._accountId)) {
              try {
                const u = msg.message.usage; const cc = u.cache_creation || {};
                const acctKey = resolveUsageKey(session);
                const usd = usageHistory._cost({ acct: acctKey === '__global__' ? null : acctKey, model: msg.message.model, i: u.input_tokens || 0, o: u.output_tokens || 0, cw5: cc.ephemeral_5m_input_tokens || 0, cw1: cc.ephemeral_1h_input_tokens || 0, cr: u.cache_read_input_tokens || 0 });
                const cwUsd = usageHistory._cost({ acct: acctKey === '__global__' ? null : acctKey, model: msg.message.model, i: 0, o: 0, cw5: cc.ephemeral_5m_input_tokens || 0, cw1: cc.ephemeral_1h_input_tokens || 0, cr: 0 });
                const crUsd = usageHistory._cost({ acct: acctKey === '__global__' ? null : acctKey, model: msg.message.model, i: 0, o: 0, cw5: 0, cw1: 0, cr: u.cache_read_input_tokens || 0 });
                usageEstimator.noteLive({ rid: msg.requestId || msg.message.id, accountId: acctKey, model: msg.message.model, usd, cwUsd, crUsd });
                kickPoolEval();
              } catch { }
            }
            // CLI-native quota push (B-e5c9): emitted when rate limit info
            // changes, riding real API responses — zero extra calls; covers
            // chat sessions the statusline never could, local AND remote.
            if (msg.type === 'rate_limit_event') recordRateLimitEvent(session, msg);
            if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
              for (const b of msg.message.content) {
                if (b?.type === 'text' && typeof b.text === 'string' && /You've (?:reached|hit) your .{0,40} limit/.test(b.text)) {
                  global.__vsEvent?.('cli-usage-limit');
                  markLimitBanner(session, b.text); // chat-mode passive exhaustion signal (2.260.0)
                } else if (b?.type === 'fallback') {
                  global.__vsEvent?.('cli-model-fallback', `${b.from?.model || '?'}->${b.to?.model || '?'}`);
                  // main thread only — a SUBAGENT's fallback must not interrupt
                  // the parent turn (same guard class as the served-model capture)
                  if (!msg.parent_tool_use_id && !msg.isSidechain) maybeStopOnFallback(session, id, b.from?.model, b.to?.model);
                }
              }
            }
            // Reactive belt for the CLIENT-lane reroute (system record). The
            // native switchModelsOnFlag=false prevents both lanes for sessions
            // spawned/flipped after the toggle — this belt covers sessions
            // that predate it (their CLI still has fallback armed).
            if (msg.type === 'system' && msg.subtype === 'model_refusal_fallback') {
              maybeStopOnFallback(session, id,
                msg.originalModel || msg.original_model, msg.fallbackModel || msg.fallback_model);
            }

            // Permission-mode TRUTH (2.195.0): 2.1.215 emits a fresh init on
            // EVERY user message carrying the CURRENT effective mode — adopt
            // it so attach/chatStatus/resume never serve the spawn-time value
            // (the old stale _permissionMode is what made a successful
            // mid-session switch look reverted after a restart/reattach).
            if (msg.type === 'system' && msg.subtype === 'init' && typeof msg.permissionMode === 'string' && msg.permissionMode
                && session._permissionMode !== msg.permissionMode) {
              session._permissionMode = msg.permissionMode;
              if (session.sockName) writeSessionMeta(session.sockName, { ...(readSessionMeta(session.sockName) || {}), permissionMode: msg.permissionMode });
            }

            // set_permission_mode verdict (2.195.0): the CLI REFUSES a
            // mid-session switch to bypassPermissions unless the session was
            // launched bypass-capable — a clean error control_response we
            // used to swallow (the optimistic badge then flipped back on the
            // next init and the user read the whole feature as broken).
            // Success → adopt + persist; either way tell the session's
            // clients so the UI can confirm, revert, or offer the
            // restart-with-mode path.
            if (msg.type === 'control_response' && session._pendingModeReqs?.has(msg.response?.request_id)) {
              const pend = session._pendingModeReqs.get(msg.response.request_id);
              session._pendingModeReqs.delete(msg.response.request_id);
              const ok = msg.response?.subtype === 'success';
              if (ok) {
                session._permissionMode = pend.mode;
                if (session.sockName) writeSessionMeta(session.sockName, { ...(readSessionMeta(session.sockName) || {}), permissionMode: pend.mode });
              }
              if (!ok) global.__vsEvent?.('perm-mode-refused', pend.mode);
              broadcastToSession(session, id, {
                type: 'permission-mode-ack', sessionId: id, ok, mode: pend.mode,
                error: ok ? null : String(msg.response?.error || 'permission mode change refused'),
              });
            }

            // TodoWrite / TaskCreate / TaskUpdate → the session's live TODO
            // summary (board pill). TaskCreate's id arrives in the RESULT.
            if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
              for (const b of msg.message.content) {
                if (b?.type !== 'tool_use') continue;
                if (b.name === 'TodoWrite' && Array.isArray(b.input?.todos)) updateSessionTodos(session, b.input.todos);
                else if (b.name === 'TaskCreate') (session._pendingTaskCreates ||= new Map()).set(b.id, b.input || {});
                else if (b.name === 'TaskUpdate' && b.input?.taskId) applyTaskToolUpdate(session, b.input);
              }
            }
            if (msg.type === 'user' && Array.isArray(msg.message?.content) && session._pendingTaskCreates?.size) {
              for (const b of msg.message.content) {
                if (b?.type !== 'tool_result' || !session._pendingTaskCreates.has(b.tool_use_id)) continue;
                const inp = session._pendingTaskCreates.get(b.tool_use_id);
                session._pendingTaskCreates.delete(b.tool_use_id);
                const txt = typeof b.content === 'string' ? b.content : (Array.isArray(b.content) ? b.content.map((c) => c?.text || '').join(' ') : '');
                const m = /Task #(\d+) created/.exec(txt);
                if (m) {
                  (session._taskList ||= new Map()).set(m[1], { content: inp.subject || '', activeForm: inp.activeForm, status: 'pending' });
                  emitTaskListTodos(session);
                }
              }
            }

            // Track turn lifecycle: streaming state + activity label (broadcast to clients)
            {
              let newLabel = null;
              if (msg.type === 'result' || (msg.type === 'system' && msg.subtype === 'compact_boundary')) {
                session._isStreaming = false;
                session._fallbackStopFired = false; // one auto-stop per turn (claude.disableModelFallback belt)
                session._streamingKind = null;
                newLabel = '';
              } else if (msg.type === 'user' && !msg.parent_tool_use_id && !msg.isSidechain) {
                // Local-command echoes (e.g. "<local-command-stdout>Set model
                // to ...") are user records with NO turn behind them — treating
                // them as a turn start left the chat stuck on "thinking..."
                // forever after a model switch.
                const uText = typeof msg.message?.content === 'string'
                  ? msg.message.content
                  : (Array.isArray(msg.message?.content) ? msg.message.content.map(b => b.text || '').join('') : '');
                // A5 (review): "Set model to X (resolved-full-id)" echo is the
                // CLI's authoritative resolution — upgrade a BARE-ALIAS lock
                // target to the full id (alias targets false-match intra-family
                // reroutes via the startsWith rule, e.g. 'opus' vs 'opus-4-8',
                // and the repin never fires).
                if (session._modelLocked && session._lockedModel && !/\d/.test(session._lockedModel)) {
                  const em = /^<local-command-stdout>Set model to \S+ \(([^)]+)\)/.exec(uText.trim());
                  if (em && modelsMatch(session._lockedModel, em[1])) {
                    session._lockedModel = em[1];
                    try { if (session.sockName) writeSessionMeta(session.sockName, { ...(readSessionMeta(session.sockName) || {}), lockedModel: em[1] }); } catch {}
                  }
                }
                if (!/^<local-command-/.test(uText.trim())) {
                  session._isStreaming = true;
                  newLabel = 'thinking...';
                }
              } else if (msg.type === 'assistant' && !msg.parent_tool_use_id && !msg.isSidechain) {
                const blocks = msg.message?.content;
                if (Array.isArray(blocks)) {
                  const last = blocks[blocks.length - 1];
                  if (last?.type === 'thinking') newLabel = 'thinking...';
                  else if (last?.type === 'text') newLabel = 'responding';
                  else if (last?.type === 'tool_use') newLabel = `running ${last.name || 'tool'}`;
                }
              } else if (msg.type === 'system' && msg.subtype === 'api_retry') {
                // Anthropic API erroring + CLI auto-retrying (up to 10× with
                // backoff — minutes of apparent freeze). Silently dropped, the
                // user sees a bare spinner and files "everything is stuck"
                // (real fleet incident: API 500 burst read as a product hang).
                // Say what's actually happening in the spinner text.
                const attempt = msg.attempt || '?', max = msg.max_retries || 10;
                const why = msg.error_status ? `HTTP ${msg.error_status}` : (msg.error && msg.error !== 'unknown' ? msg.error : 'connection error');
                newLabel = `API retrying (${attempt}/${max}, ${why})…`;
                // AUTH-class failure (2.335.0): a pooled session must route
                // AROUND a banned/expired member, not retry into it forever
                try { notePoolAuthFailure?.(session, id, { status: msg.error_status, message: msg.error, attempt: msg.attempt }); } catch { }
              }
              if (newLabel !== null && session._streamingLabel !== newLabel) {
                session._streamingLabel = newLabel;
                broadcastToSession(session, id, { type: 'streaming-label', sessionId: id, label: newLabel, kind: session._streamingKind || null });
              }
            }

            // Track goal state from CLI /goal command (goal_status attachment).
            // Attachments are JSONL-only in current CLI versions — keep the
            // stdout handler in case that changes, but the authoritative sync
            // happens via checkClaudeGoalStatus after each result.
            if (msg.type === 'attachment' && msg.attachment?.type === 'goal_status') {
              const a = msg.attachment;
              const prevGoal = session._goal;
              if (a.durationMs) session._goalElapsed = a.durationMs;
              if (a.tokens) session._goalTokensUsed = a.tokens;
              if (a.met) {
                if (prevGoal) session._prevGoal = prevGoal;
                session._goal = null;
                session._goalStatus = 'complete';
              } else if (a.condition) {
                session._goal = a.condition;
                session._goalStatus = 'active';
              }
              if (session._goal !== prevGoal) {
                broadcastToSession(session, id, { type: 'goal-updated', sessionId: id, goal: session._goal || null, goalStatus: session._goalStatus, goalElapsed: session._goalElapsed || 0,
                  statusMsg: a.met ? `Goal met: ${a.condition}` : (a.sentinel ? `Goal set: ${a.condition}` : null) });
              }
            }

            // After each turn, tail the JSONL for goal_status (native goal sync).
            // Immediate check + one delayed re-check (the Stop hook may write
            // the attachment slightly after the result reaches stdout).
            if (msg.type === 'result') maybePoolAutoSwitch(session);
            // error results carry ban/credit/oauth text the retry path never
            // sees (the CLI gives up without a final api_retry record)
            if (msg.type === 'result' && msg.is_error) { try { notePoolAuthFailure?.(session, id, { message: String(msg.result || msg.error || '') }); } catch { } }
            // Event-driven remote ledger harvest (owner question "为什么15分钟
            // 不实时"): a remote session's turn just ENDED — its usage now
            // exists in the remote transcript, so harvest promptly (60s/host
            // floor) instead of waiting out the idle 15-min cadence. The pool
            // control loop never depended on this (it eats the relayed stdout
            // live via noteLive); this closes the LEDGER/billing-popup lag.
            if (msg.type === 'result' && session.host) {
              try {
                hosts?.harvestUsage(session.host, { minIntervalMs: 60 * 1000, scannerPath: USAGE_SCANNER_PATH })
                  .then((txt) => { if (txt) usageHistory.ingestRemoteEvents(session.host, hosts.get(session.host)?.name, txt); })
                  .catch(() => { });
              } catch { }
            }
            if (msg.type === 'result') maybeRepinLockedModel(session);
            if (msg.type === 'result' && session._goal) {
              checkClaudeGoalStatus(session, id);
              setTimeout(() => { if (activeSessions.has(id)) checkClaudeGoalStatus(session, id); }, 2000);
            }

            // Track subagent lifecycle: start/stop JSONL watchers
            if (msg.type === 'system' && msg.subtype === 'task_started' && msg.task_type === 'local_agent' && msg.task_id && msg.tool_use_id) {
              startSubagentWatcher(msg.tool_use_id, msg.task_id);
            }
            // Completed agents are served from DISK on attach (sub-agent-*),
            // so the live buffers are dead weight once done — a long session
            // driving dozens of agents retained every subagent message twice
            // (raw buffer + normalizer), unbounded (audit round-2). Grace
            // period lets an already-open live viewer finish rendering.
            const gcSubagent = (tuid) => setTimeout(() => {
              if (!activeSessions.has(id)) return;
              session.subagentBuffers?.delete?.(tuid);
              session.subagentEmittedUuids?.delete?.(tuid);
              session._subNormalizers?.delete?.(tuid);
            }, 60000);
            if (msg.type === 'system' && msg.subtype === 'task_notification' && msg.tool_use_id) {
              stopSubagentWatcher(msg.tool_use_id);
              gcSubagent(msg.tool_use_id);
            }
            // The CURRENT harness signals a background agent's completion with
            // the <task-notification> WAKEUP user record instead (2.233.0
            // discovery) — without this the fs.watch handle + double-buffered
            // transcript lingered until the 10-min idle sweep.
            // Workflow launch ack → arm the usage tailer (file-level "wrapper"
            // for in-process workflow agents — see armWorkflowUsageWatcher).
            if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
              try {
                for (const b of msg.message.content) {
                  if (b?.type !== 'tool_result') continue;
                  const txt = typeof b.content === 'string' ? b.content
                    : Array.isArray(b.content) ? b.content.map((x) => x?.text || '').join('\n') : '';
                  const wm = /Run ID: (wf_[\w-]+)/.exec(txt);
                  if (wm) armWorkflowUsageWatcher(session, id, wm[1]);
                }
              } catch { }
            }
            if (msg.type === 'user' && (msg.origin?.kind === 'task-notification' || /^\s*<task-notification>/.test(typeof msg.message?.content === 'string' ? msg.message.content : ''))) {
              const notifText = typeof msg.message?.content === 'string' ? msg.message.content : '';
              const tu = notifText.match(/<tool-use-id>([\s\S]*?)<\/tool-use-id>/);
              if (tu && session.subagentWatchers?.has(tu[1].trim())) {
                stopSubagentWatcher(tu[1].trim());
                gcSubagent(tu[1].trim());
              }
              // Limit banners CARRIED BY workflow/agent failure text (real
              // 2026-08-09 incident: 9 workflow agents died on "You've hit
              // your session limit" — the phrase lives only in the task-
              // notification blob, never as a main-stream assistant banner,
              // so the pool switch waited for full exhaustion).
              const lb = /You've (?:reached|hit) your .{0,40}? ?limit/i.exec(notifText.slice(0, 16384));
              if (lb) { global.__vsEvent?.('cli-usage-limit'); markLimitBanner(session, lb[0]); }
            }
            // Inactivity sweep (audit round-3): an agent whose turn was
            // interrupted / whose CLI died NEVER emits task_notification — its
            // fs.watch handle + double-buffered transcript lived for the
            // session's whole (weeks-long) life. At each turn end, tear down
            // watchers idle >10min; genuinely running background agents keep
            // writing JSONL so their lastActivity stays fresh.
            if (msg.type === 'result' && session.subagentWatchers?.size) {
              const now = Date.now();
              for (const [tuid, entry] of [...session.subagentWatchers]) {
                if (now - (entry.lastActivity || 0) > 10 * 60 * 1000) {
                  stopSubagentWatcher(tuid);
                  gcSubagent(tuid);
                }
              }
            }

            // TOOL PROGRESS ≠ SUBAGENT (2.227.7, real report "为什么一个 Bash
            // 卡片里出现了 messages"): newer CLIs stream
            // {type:'tool_progress', tool_use_id, tool_name, parent_tool_use_id,
            // elapsed_time_seconds, heartbeat} for a long-running tool — and it
            // carries parent_tool_use_id, the SAME field subagent messages use.
            // The type-blind branch below then buffered them as subagent
            // messages, spun a sub-normalizer per Bash call, and painted the
            // agent-style "N messages · View Log" line on a Bash card. Route
            // them to their own channel (the elapsed seconds are genuinely
            // useful on a pending card) and never into the subagent path.
            if (msg.type === 'tool_progress') {
              broadcastToSession(session, id, {
                type: 'tool-progress', sessionId: id,
                parentToolUseId: msg.parent_tool_use_id || null,
                toolName: msg.tool_name || null,
                elapsedSeconds: msg.elapsed_time_seconds ?? null,
                heartbeat: !!msg.heartbeat,
              });
            } else if (msg.parent_tool_use_id || msg.isSidechain) {
              const ptuid = msg.parent_tool_use_id;
              if (ptuid) {
                // Mark uuid as emitted (for dedup with JSONL watcher)
                if (msg.uuid) {
                  if (!session.subagentEmittedUuids.has(ptuid)) session.subagentEmittedUuids.set(ptuid, new Set());
                  session.subagentEmittedUuids.get(ptuid).add(msg.uuid);
                }
                // Buffer
                if (!session.subagentBuffers.has(ptuid)) session.subagentBuffers.set(ptuid, []);
                session.subagentBuffers.get(ptuid).push(msg);
              }
              // Broadcast to parent (for tool card status) + normalize for subagent viewers
              broadcastToSession(session, id, { type: 'subagent-message', sessionId: id, parentToolUseId: ptuid, message: msg });
              if (ptuid) {
                if (!session._subNormalizers) session._subNormalizers = new Map();
                if (!session._subNormalizers.has(ptuid)) {
                  const subMM = new MessageManager(`sub-${ptuid}`);
                  subMM.onOp((op) => broadcastToSession(session, id, { type: 'msg', sessionId: `sub-${ptuid}`, ...op }));
                  session._subNormalizers.set(ptuid, subMM);
                }
                session._subNormalizers.get(ptuid).processLive(msg);
              }
              continue;
            }
            // Feed into MessageManager (emits normalized msg ops to all clients)
            if (session._normalizer) session._normalizer.processLive(msg);
          } catch {
            // Non-JSON line (e.g. dtach noise) — send as raw output
            broadcastToSession(session, id, { type: 'output', sessionId: id, data: line + '\n' });
          }
        }
      });
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
      session.pty = null;
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
    session._isStreaming = false;
    // Child exit code from the wrapper's final meta (2.207.0 — wrappers keep
    // it instead of unlinking; a crash-looping claude previously left zero
    // process-level evidence).
    let childCode = null;
    try { childCode = JSON.parse(fs.readFileSync(path.join(BUFFERS_DIR, id + '.json'), 'utf-8')).childExitCode ?? null; } catch {}
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
    console.log(`[session] exited ${id} "${session.name || ''}" mode=${session.mode} backend=${session.backend || 'claude'}${childCode != null ? ' code=' + childCode : ''}${exitReason ? ' reason=' + exitReason : ''}`);
    global.__vsEvent?.('session-exited', `${session.mode}/${session.backend || 'claude'}${childCode != null ? '/code=' + childCode : ''}${exitReason ? '/' + exitReason : ''}`);
    broadcastToSession(session, id, { type: 'exited', sessionId: id, reason: exitReason, detail: death?.detail });
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
    if (cleanupOnExit) {
      try {
        const bufPath = path.join(BUFFERS_DIR, id + '.buf');
        const st = fs.statSync(bufPath);
        const fd = fs.openSync(bufPath, 'r');
        const take = Math.min(st.size, 65536);
        const tail = Buffer.alloc(take);
        fs.readSync(fd, tail, 0, take, st.size - take);
        fs.closeSync(fd);
        const tombDir = path.join(rootDir, 'data', 'exit-tombs');
        fs.mkdirSync(tombDir, { recursive: true });
        fs.writeFileSync(path.join(tombDir, `${id}.tail`), tail);
        // opportunistic sweep: tombs older than 7 days
        for (const f of fs.readdirSync(tombDir)) {
          try { const s = fs.statSync(path.join(tombDir, f)); if (Date.now() - s.mtimeMs > 7 * 86400e3) fs.unlinkSync(path.join(tombDir, f)); } catch {}
        }
      } catch { /* no buffer / read failed — nothing to keep */ }
      try { fs.unlinkSync(path.join(BUFFERS_DIR, id + '.buf')); } catch {}
      try { fs.unlinkSync(path.join(BUFFERS_DIR, id + '.json')); } catch {}
    }
    broadcastActiveSessions();
  });
}

// Read/write session metadata
function readSessionMeta(sockName) {
  try { return JSON.parse(fs.readFileSync(path.join(META_DIR, sockName + '.json'), 'utf-8')); } catch { return {}; }
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
function sessionMetaOwnerConflict(sockName, meta) {
  try {
    const prev = readSessionMeta(sockName);
    const a = prev && prev.webuiSessionId, b = meta && meta.webuiSessionId;
    if (a && b && a !== b) {
      console.error(`[session] META COLLISION on ${sockName}: owned by ${a}, written by ${b} — two sessions share a socket name (identity fields would cross)`);
      try { global.__vsMetric?.('session-meta-collision', 1); } catch {}
      return true;
    }
  } catch {}
  return false;
}
function writeSessionMeta(sockName, meta) {
  if (_metaTombstones.has(sockName)) return;
  sessionMetaOwnerConflict(sockName, meta);
  // SESSION-BRAIN step 1 (design §session-brain campaign): the buffer's OWNER
  // is EXPLICIT in every session record. Today the server writes
  // data/session-buffers/<id>.buf for every session including remote ones
  // (the relayed stdout) — 'server'. When session.open (R6) moves parsing +
  // buffer ownership device-side, those records say 'device' and the attach
  // path routes by THIS FIELD instead of assuming. Both readers work either
  // way; no behavior changes until a record actually says 'device'.
  if (meta && typeof meta === 'object' && !meta.bufferOwner) meta.bufferOwner = 'server';
  ensureDir(META_DIR);
  // tmp+rename (2.219.0): the most frequently written core store was the only
  // non-atomic one — an OOM kill mid-write left truncated JSON that poisoned
  // the next restore.
  const fp = path.join(META_DIR, sockName + '.json');
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(meta));
  fs.renameSync(tmp, fp);
  try { recordUsageAttribution(meta); } catch {} // usage-ledger account-by-time
}
function deleteSessionMeta(sockName) {
  _metaTombstones.set(sockName, Date.now());
  if (_metaTombstones.size > 4096) _metaTombstones.delete(_metaTombstones.keys().next().value);
  try { fs.unlinkSync(path.join(META_DIR, sockName + '.json')); } catch {}
}

// Attach a PTY to an existing dtach socket for I/O.
// opts.repaint (the RE-attach path): dtach replays nothing on attach and a
// plain shell never repaints, so after healing the bridge we push the buffer
// FILE tail (clear + replay) to attached clients — a daemon self-upgrade
// re-exec otherwise left visually-blank terminals until a page reload.
function attachToDtach(id, socketPath, session, { repaint = false } = {}) {
  const repaintClients = () => {
    if (!repaint || session.mode === 'chat') return;
    try {
      const buf = fs.readFileSync(path.join(BUFFERS_DIR, id + '.buf'));
      const tail = buf.length > 200000 ? buf.subarray(buf.length - 200000) : buf;
      const data = '\x1b[2J\x1b[3J\x1b[H' + tail.toString('utf-8');
      session.buffer = tail.toString('utf-8').slice(-50000);
      broadcastToSession(session, id, { type: 'output', sessionId: id, data });
    } catch { /* no buffer file — nothing to repaint */ }
  };
  const localAttach = () => {
    const attachPty = pty.spawn(DTACH_CMD, ['-a', socketPath, '-E', '-r', 'winch'], {
      name: 'xterm-256color', cols: 120, rows: 30,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });
    setupSessionPty(session, id, attachPty);
    repaintClients();
  };
  // M1: daemon owns the pty when enabled — the dtach attach runs INSIDE agentd
  // and relays over the mux. On ANY failure fall back to the local pty so a
  // daemon hiccup never loses a session.
  const deviceMgr = getDeviceMgr();
  if (deviceMgr && !session.host) {
    deviceMgr.openSession({ cmd: DTACH_CMD, args: ['-a', socketPath, '-E', '-r', 'winch'], cols: 120, rows: 30 })
      .then((h) => { setupSessionPty(session, id, daemonPtyShim(h)); repaintClients(); })
      .catch((e) => { console.warn('[device] session attach failed — local pty fallback:', e.message); localAttach(); });
    return;
  }
  localAttach();
}

// On startup, reconnect to existing dtach sockets
  return { setupSessionPty, attachToDtach, readSessionMeta, writeSessionMeta,
    deleteSessionMeta, sessionMetaOwnerConflict, _metaTombstones,
    applyTaskToolUpdate, emitTaskListTodos, updateSessionTodos };
}
module.exports = { create };
