/**
 * WebSocket connection handler — terminal/chat I/O, session create/attach/kill,
 * state sync, layout sync, tmux attach, permission/interrupt control.
 */

const { MessageManager } = require('./message-manager');
const { createMessageManager } = require('./normalizers');
const { listCodexThreads } = require('./codex-session-store');
const { findCodexSessionJsonlPath, extractCodexThreadMeta } = require('./adapters/codex');
const { cwdToProjectDir } = require('./session-store');
const crypto = require('crypto');

function getSessionKey(session = {}) {
  const backend = session.backend || 'claude'; // fallback needed: called with API data too
  const backendSessionId = session.backendSessionId || session.sessionId || session.claudeSessionId || null;
  return backendSessionId ? `${backend}:${backendSessionId}` : '';
}

function safeJsonParse(text, fallback = null) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function normalizeComparablePath(pathLib, value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { return pathLib.resolve(raw); } catch { return raw; }
}

function pickCodexThreadCandidate({ activeSessions, webuiSessionId, cwd, createdAt, baselineThreadIds, pathLib }) {
  const targetCwd = normalizeComparablePath(pathLib, cwd);
  if (!targetCwd) return null;

  const reservedThreadIds = new Set();
  for (const [otherId, otherSession] of activeSessions || []) {
    if (otherId === webuiSessionId) continue;
    if ((otherSession.backend || 'claude') !== 'codex') continue;
    const reservedId = otherSession.backendSessionId || otherSession.claudeSessionId || otherSession._captureReservedThreadId || null;
    if (reservedId) reservedThreadIds.add(reservedId);
  }

  const candidates = listCodexThreads({ activeSessions })
    .map((entry) => {
      const threadId = entry.backendSessionId || entry.sessionId || null;
      if (!threadId || reservedThreadIds.has(threadId)) return null;
      if (baselineThreadIds instanceof Set && baselineThreadIds.has(threadId)) return null;

      const entryCwd = normalizeComparablePath(pathLib, entry.cwd);
      if (!entryCwd || entryCwd !== targetCwd) return null;

      const startedAt = Number(entry.startedAt) || 0;
      return {
        entry,
        startedAt,
        ageDelta: Math.abs((startedAt || createdAt || Date.now()) - (createdAt || Date.now())),
        recent: startedAt >= ((createdAt || 0) - 5 * 60 * 1000),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.recent !== b.recent) return a.recent ? -1 : 1;
      if (a.ageDelta !== b.ageDelta) return a.ageDelta - b.ageDelta;
      return b.startedAt - a.startedAt;
    });

  return candidates[0]?.entry || null;
}

function registerWsHandler(wss, ctx) {
  const {
    activeSessions, WS_OPEN, broadcastActiveSessions, broadcastToSession, resizeSessionToMin,
    setupSessionPty, refreshWebuiPids, deleteSessionMeta, writeSessionMeta, readSessionMeta,
    readLayouts, writeLayouts, getSyncStore,
    sessionCounterRef, createSessionMessages, PERMISSION_MODES,
    SOCKETS_DIR, BUFFERS_DIR, META_DIR, PTY_WRAPPER, CHAT_WRAPPER,
    NODE_CMD, DTACH_CMD, ENV_CMD, CLAUDE_CMD, EDITOR_CMD, PORT, X_ENV,
    adapterRegistry, pty, path, fs, os, execFileSync, ensureDir, hosts,
    sessionStatus, sessionStatusKey,
  } = ctx;

  // Monotonic sequence for layout-sync rebroadcasts (shared across all
  // connections; resets on server restart — clients reset their counter on WS
  // reconnect, which a server restart always forces).
  const layoutSyncSeqRef = { value: 0 };

  // Heartbeat: without ping/pong a half-open WS (network blip, sleep/wake,
  // the OOM-induced unresponsiveness from heavy local jobs) is NOT detected
  // by the server — the dead ws lingers in every session.clients map for the
  // full TCP keepalive window (~2h), and its stale size keeps shrinking the
  // PTY via resizeSessionToMin. Ping every 30s; a client that misses two
  // consecutive pongs is terminated, which fires 'close' and cleans it up.
  if (!wss._heartbeatTimer) {
    wss._heartbeatTimer = setInterval(() => {
      for (const client of wss.clients) {
        if (client._isAlive === false) { try { client.terminate(); } catch {} continue; }
        client._isAlive = false;
        try { client.ping(); } catch {}
      }
    }, 30000);
    wss._heartbeatTimer.unref?.();
  }

  wss.on('connection', (ws) => {
    ws._isAlive = true;
    ws.on('pong', () => { ws._isAlive = true; });
    const attachedSessions = new Set();

    // Send current active sessions on connect.
    // Keep this field list in sync with broadcastActiveSessions (server.js) —
    // a field missing HERE is invisible to every client until the next
    // broadcast (host badges were absent after reconnect for exactly this).
    const activeList = [];
    for (const [id, s] of activeSessions) {
      if (s.isTmuxView) continue; // match broadcastActiveSessions
      activeList.push({
        id,
        name: s.name,
        cwd: s.cwd,
        host: s.host || null,
        hostName: s.hostName || null,
        createdAt: s.createdAt,
        backend: s.backend || 'claude',
        backendSessionId: s.backendSessionId || s.claudeSessionId || null,
        sessionKey: getSessionKey(s),
        claudeSessionId: s.claudeSessionId || null,
        sourceKind: s.sourceKind || null,
        agentKind: s.agentKind || 'primary',
        agentRole: s.agentRole || '',
        agentNickname: s.agentNickname || '',
        parentThreadId: s.parentThreadId || null,
        mode: s.mode || 'terminal',
      });
    }
    ws.send(JSON.stringify({ type: 'active-sessions', sessions: activeList }));

    ws.on('message', async (raw) => {
      let data;
      try { data = JSON.parse(raw); } catch { return; }
      try {
        await handleMessage(data);
      } catch (err) {
        // A malformed/unexpected client message must never crash the server
        // (observed: array extraArgs → .trim() TypeError killed the process).
        console.error('[ws] message handler error:', err.message, '| type:', data?.type);
        try { ws.send(JSON.stringify({ type: 'error', message: 'Internal error handling ' + (data?.type || 'message'), sessionId: data?.sessionId })); } catch {}
      }
    });

    async function handleMessage(data) {
      switch (data.type) {
        case 'create': {
          const backend = data.backend || 'claude';
          const adapter = adapterRegistry?.get?.(backend) || null;
          if (!adapter) {
            ws.send(JSON.stringify({ type: 'error', message: `Unknown backend "${backend}".` }));
            break;
          }
          const id = 'sess-' + (++sessionCounterRef.value) + '-' + Date.now();
          const cwd = data.cwd || os.homedir();
          const sockName = 'cw-' + sessionCounterRef.value + '-' + Date.now();
          const socketPath = path.join(SOCKETS_DIR, sockName);
          const sessionMode = data.mode === 'chat' ? 'chat' : 'terminal';
          // Shell-style tokenization: quoted segments stay one argument
          // (plain split broke e.g. --append-system-prompt "two words")
          const extraArgs = Array.isArray(data.extraArgs) ? data.extraArgs.map(String)
            : data.extraArgs
              ? (String(data.extraArgs).trim().match(/"[^"]*"|'[^']*'|\S+/g) || []).map(t => t.replace(/^(["'])(.*)\1$/, '$2'))
              : [];
          const sessionSpec = adapter.buildSessionArgs({
            cwd,
            model: data.model,
            permissionMode: data.permissionMode,
            resumeId: data.resume && data.resumeId ? data.resumeId : null,
            fork: data.fork || false,
            sessionName: data.sessionName,
            effort: data.effort,
            extraArgs,
            initialPrompt: data.initialPrompt || '',
            mode: sessionMode,
            tuiRenderer: data.tuiRenderer || '',
          });
          // For codex resume: inherit forkedFrom chain from old session's JSONL
          if (backend === 'codex' && data.resumeId && sessionSpec.env) {
            const oldPath = findCodexSessionJsonlPath(data.resumeId);
            const oldChain = oldPath ? (extractCodexThreadMeta(oldPath).forkedFrom || []) : [];
            if (!oldChain.includes(data.resumeId)) oldChain.push(data.resumeId);
            sessionSpec.env.CODEX_WEBUI_FORKED_FROM = oldChain.join(',');
          }
          const codexThreadBaseline = backend === 'codex' && !data.resumeId
            ? new Set(listCodexThreads({ activeSessions }).map((entry) => entry.backendSessionId || entry.sessionId).filter(Boolean))
            : null;

          ensureDir(SOCKETS_DIR);
          ensureDir(BUFFERS_DIR);

          const session = {
            mode: sessionMode,
            pty: null, clients: new Map([[ws, { cols: data.cols || 120, rows: data.rows || 30 }]]),
            cwd, name: data.sessionName || `Session ${sessionCounterRef.value}`,
            createdAt: Date.now(),
            // Per-session bearer for the agent-facing API (vibespace-status):
            // spawned into the CLI's env, scopes writes to this session only
            agentToken: 'vsst_' + crypto.randomBytes(12).toString('hex'),
            // Context task (VIBESPACE_TASK_ID). Delivered natively via the
            // SessionStart/UserPromptSubmit hooks. VALIDATED to the task-id
            // shape: it is interpolated into the remote ssh shell command, so a
            // metachar-bearing value would be a shell-injection vector.
            _taskId: (typeof data.taskId === 'string' && /^T-[\w-]{1,60}$/.test(data.taskId)) ? data.taskId : null,
            backend,
            backendSessionId: data.resumeId || null,
            claudeSessionId: backend === 'claude' ? (data.resumeId || null) : null,
            sourceKind: data.sourceKind || null,
            agentKind: data.agentKind || 'primary',
            agentRole: data.agentRole || '',
            agentNickname: data.agentNickname || '',
            parentThreadId: data.parentThreadId || null,
            // Permission mode is not recoverable from the JSONL (init records
            // are stdout-only) — remember what this session was started with
            // so attach can restore the status bar immediately
            _permissionMode: data.permissionMode || null,
            // Effort is never reported back by claude — remember the commanded
            // value (spawn flag now, set-effort later) for the status bar
            _effort: data.effort || null,
            // Claude --fork-session mints a NEW session id at startup; this arms
            // the stdout parser to adopt it (so the fork becomes its own session
            // instead of shadowing the parent). One-shot, cleared on adoption.
            _forkRequested: backend === 'claude' && !!data.fork,
            sockName, socketPath, buffer: '',
          };
          if (codexThreadBaseline) session._codexThreadBaseline = codexThreadBaseline;
          if (sessionMode === 'chat') {
            session._normalizer = createMessageManager(backend, id);
            session._normEpoch = Date.now();
            session._normalizer.onOp((op) => {
              broadcastToSession(session, id, { type: 'msg', sessionId: id, ...op });
            });
          }

          // Use appropriate wrapper inside dtach:
          // - Terminal: pty-wrapper.js (spawns claude with PTY for TUI mode)
          // - Chat: chat-wrapper.js (spawns claude with --output-format stream-json)
          const bufFile = path.join(BUFFERS_DIR, id + '.buf');
          const metaFileW = path.join(BUFFERS_DIR, id + '.json');
          const wrapper = sessionSpec.wrapper || (sessionMode === 'chat' ? CHAT_WRAPPER : PTY_WRAPPER);
          // Remote session (collaboration P2, terminal mode): the LOCAL dtach+
          // pty-wrapper machinery stays (buffer/restore all work unchanged) but
          // the wrapped command becomes ssh -t … dtach -A on the REMOTE — a
          // network drop doesn't kill the agent; reattach = re-ssh.
          let spawnCmd = sessionSpec.cmd || CLAUDE_CMD;
          let spawnArgs = sessionSpec.args || [];
          let spawnEnvPairs = Object.entries(sessionSpec.env || {}).map(([k, v]) => `${k}=${v == null ? '' : String(v)}`);
          let spawnCwd = cwd;
          // Remote agent enablement (P3): a remote session can't reach the local
          // API at 127.0.0.1:<PORT>, and the vibespace-status/-task tools don't
          // exist on the remote box. So for any remote session we (1) open an
          // ssh REVERSE tunnel (remote 127.0.0.1:<rport> → this server) and (2)
          // write the two tools into ~/.vibespace/bin on the remote + prepend
          // PATH. Returns pieces spliced into the ssh inner command. Node's
          // base64 is unwrapped (no newlines) so the blob is a single safe word.
          const remoteAgentSetup = () => {
            // Wide range → per-host collision (two sessions picking the same
            // port) is negligible; a collision only degrades the loser's tools
            // (ssh -R bind warns, session still runs), never breaks the session.
            const rport = session._remotePort = 20000 + Math.floor(Math.random() * 40000);
            const toolDir = path.dirname(EDITOR_CMD);
            const b64 = (name) => { try { return fs.readFileSync(path.join(toolDir, name)).toString('base64'); } catch { return ''; } };
            // Distribute the agent tools AND the hook + its self-registering
            // installer to the remote box, then register the hook in the
            // remote's own Claude/Codex config so its native SessionStart /
            // UserPromptSubmit hooks deliver task context + status notices
            // (our LOCAL hook never fires on the remote). node available: the
            // remote agent CLIs are node apps, and we source nvm first.
            const files = { 'vibespace-status': b64('vibespace-status'), 'vibespace-task': b64('vibespace-task'), 'vibespace-hook.mjs': b64('vibespace-hook.mjs'), 'vibespace-hook-register.mjs': b64('vibespace-hook-register.mjs') };
            const haveAll = Object.values(files).every(Boolean);
            const writes = Object.entries(files).map(([n, b]) => `printf %s ${b} | base64 -d > "$HOME/.vibespace/bin/${n}";`).join(' ');
            const prelude = haveAll
              ? `export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; mkdir -p "$HOME/.vibespace/bin"; ${writes} chmod +x "$HOME/.vibespace/bin"/vibespace-*; export PATH="$HOME/.vibespace/bin:$PATH"; node "$HOME/.vibespace/bin/vibespace-hook-register.mjs" 2>/dev/null || true; `
              : '';
            // session._taskId is already validated to the task-id shape; url +
            // vsst_ token are metachar-free. The values are shq'd at the use
            // sites (like spawnEnvPairs) as defense-in-depth regardless.
            const envPairs = [
              `VIBESPACE_API=http://127.0.0.1:${rport}`,
              `VIBESPACE_SESSION_TOKEN=${session.agentToken}`,
              ...(session._taskId ? [`VIBESPACE_TASK_ID=${session._taskId}`] : []),
            ];
            return { prelude, envPairs, reverse: `${rport}:127.0.0.1:${PORT}` };
          };
          if (data.hostId && hosts && sessionMode === 'terminal') {
            let h;
            try { h = hosts.get(data.hostId); }
            catch { ws.send(JSON.stringify({ type: 'error', message: 'Unknown host: ' + data.hostId })); return; }
            const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
            // locally-resolved binary paths mean nothing on the remote
            const rcmd = spawnCmd.includes('/') ? path.basename(spawnCmd) : spawnCmd;
            const ra = remoteAgentSetup();
            const inner = ra.prelude + `cd ${shq(cwd)} 2>/dev/null; exec env TERM=xterm-256color COLORTERM=truecolor `
              + [...ra.envPairs.map(shq), ...spawnEnvPairs.map(shq), rcmd, ...spawnArgs.map(shq)].join(' ');
            spawnCmd = 'ssh';
            spawnArgs = [...hosts.sshArgs(h, { tty: true, reverse: ra.reverse }), '--', `dtach -A /tmp/vs-${id} -r winch sh -lc ${shq(inner)}`];
            spawnEnvPairs = [];
            spawnCwd = os.homedir(); // remote cwd rides inside the ssh command
            session.host = h.id;
            session.hostName = h.name;
          } else if (data.hostId && hosts && sessionMode === 'chat') {
            // Remote CHAT (P3): ssh -T gives a CLEAN pipe — stream-json must
            // NOT cross a remote dtach/pty layer (echo + CRLF corrupt JSON).
            // Local dtach still keeps the pipeline across server restarts; an
            // ssh drop ends the remote process (transcript survives remotely,
            // resume-able). Stream flags ride INSIDE the remote string; the
            // wrapper's appended flags land as harmless sh -lc positionals.
            let h;
            try { h = hosts.get(data.hostId); }
            catch { ws.send(JSON.stringify({ type: 'error', message: 'Unknown host: ' + data.hostId })); return; }
            const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
            const rcmd = spawnCmd.includes('/') ? path.basename(spawnCmd) : spawnCmd;
            const rargs = [...spawnArgs];
            for (const fl of [['--output-format', 'stream-json'], ['--input-format', 'stream-json'], ['--verbose'], ['--permission-prompt-tool', 'stdio']]) {
              if (!rargs.includes(fl[0])) rargs.push(...fl);
            }
            const ra = remoteAgentSetup();
            const inner = ra.prelude + `cd ${shq(cwd)} 2>/dev/null; export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; exec env `
              + [...ra.envPairs.map(shq), ...spawnEnvPairs.map(shq), rcmd, ...rargs.map(shq)].join(' ');
            spawnCmd = 'ssh';
            spawnArgs = [...hosts.sshArgs(h, { reverse: ra.reverse }), '-T', '--', inner];
            spawnEnvPairs = [];
            spawnCwd = os.homedir();
            session.host = h.id;
            session.hostName = h.name;
          }
          let createPty;
          try {
            createPty = pty.spawn(DTACH_CMD, ['-c', socketPath, '-E', '-r', 'none',
              NODE_CMD, wrapper,
              bufFile, metaFileW,
              ENV_CMD, `EDITOR=${EDITOR_CMD}`, `CLAUDE_WEBUI_PORT=${PORT}`, `CLAUDE_WEBUI_SESSION_ID=${id}`,
              // Agent-facing env: the vibespace-status tool (data/bin on PATH)
              // authenticates with the per-session token; VIBESPACE_TASK_ID
              // marks the context task when created from the task board.
              `VIBESPACE_API=http://127.0.0.1:${PORT}`,
              `VIBESPACE_SESSION_TOKEN=${session.agentToken}`,
              ...(session._taskId ? [`VIBESPACE_TASK_ID=${session._taskId}`] : []), // validated shape
              `PATH=${path.dirname(EDITOR_CMD)}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`,
              // Probed working X display (see server.js detectXDisplay) — the CLI
              // reads the clipboard itself on Ctrl+V, so it needs BOTH vars
              `DISPLAY=${X_ENV?.DISPLAY || process.env.DISPLAY || ''}`,
              ...(X_ENV?.XAUTHORITY ? [`XAUTHORITY=${X_ENV.XAUTHORITY}`] : []),
              `TERM=xterm-256color`, `COLORTERM=truecolor`,
              ...spawnEnvPairs,
              spawnCmd, ...spawnArgs,
            ], {
              name: 'xterm-256color', cols: data.cols || 120, rows: data.rows || 30,
              cwd: spawnCwd, env: {
                ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor',
                // The WRAPPER (always local, even for remote sessions) needs the
                // agent API in its OWN env: the codex-chat-wrapper injects task
                // context via thread/inject_items by calling /api/agent/*. The
                // spawned CLI gets these separately via the `env VAR=val` argv
                // prefix; the wrapper doesn't, hence this. Always the LOCAL port.
                VIBESPACE_API: `http://127.0.0.1:${PORT}`,
                VIBESPACE_SESSION_TOKEN: session.agentToken,
                ...(session._taskId ? { VIBESPACE_TASK_ID: session._taskId } : {}),
                ...Object.fromEntries(Object.entries(sessionSpec.env || {}).map(([k, v]) => [k, v == null ? '' : String(v)])),
              },
            });
          } catch (err) {
            ws.send(JSON.stringify({ type: 'error', message: `Failed to spawn session: ${err.message}\ndtach=${DTACH_CMD} node=${NODE_CMD} env=${ENV_CMD} cwd=${cwd}` }));
            return;
          }
          setupSessionPty(session, id, createPty);

          activeSessions.set(id, session);
          attachedSessions.add(id);

          writeSessionMeta(sockName, {
            name: session.name,
            cwd,
            host: session.host || null,
            hostName: session.hostName || null,
            backend: session.backend,
            backendSessionId: session.backendSessionId,
            claudeSessionId: session.claudeSessionId,
            sourceKind: session.sourceKind,
            agentKind: session.agentKind,
            agentRole: session.agentRole,
            agentNickname: session.agentNickname,
            parentThreadId: session.parentThreadId,
            permissionMode: session._permissionMode || null,
            effort: session._effort || null,
            agentToken: session.agentToken || null,
            taskId: session._taskId || null,
            createdAt: session.createdAt,
            webuiSessionId: id,
            mode: sessionMode,
          });

          // Capture claudeSessionId from lock file for new (non-resume) Claude sessions
          if (backend === 'claude' && !session.claudeSessionId) {
            const { SESSIONS_DIR } = require('./session-store');
            const tryCapture = (attempts) => {
              if (attempts <= 0 || !activeSessions.has(id)) return;
              try {
                // Exclude lock sessionIds already claimed by other webui
                // sessions — two new same-cwd sessions within the retry window
                // would otherwise both claim the FIRST matching lock
                const claimed = new Set();
                for (const [oid, os] of activeSessions) {
                  if (oid !== id && os.backend === 'claude' && os.claudeSessionId) claimed.add(os.claudeSessionId);
                }
                const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
                for (const f of files) {
                  const lockData = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf-8'));
                  if (claimed.has(lockData.sessionId)) continue;
                  if (lockData.cwd === cwd && lockData.startedAt > session.createdAt - 5000) {
                    session.claudeSessionId = lockData.sessionId;
                    session.backendSessionId = lockData.sessionId;
                    writeSessionMeta(sockName, {
                      name: session.name,
                      cwd,
                      backend: session.backend,
                      backendSessionId: session.backendSessionId,
                      claudeSessionId: session.claudeSessionId,
                      sourceKind: session.sourceKind,
                      agentKind: session.agentKind,
                      agentRole: session.agentRole,
                      agentNickname: session.agentNickname,
                      parentThreadId: session.parentThreadId,
                      permissionMode: session._permissionMode || null,
              effort: session._effort || null,
                  effort: session._effort || null,
                      effort: session._effort || null,
            effort: session._effort || null,
                      createdAt: session.createdAt,
                      webuiSessionId: id,
                      mode: sessionMode,
                    });
                    broadcastActiveSessions();
                    return;
                  }
                }
              } catch {}
              setTimeout(() => tryCapture(attempts - 1), 1000);
            };
            setTimeout(() => tryCapture(15), 2000);
          }

          if (backend === 'codex' && !session.backendSessionId) {
            const tryCapture = (attempts) => {
              if (attempts <= 0 || !activeSessions.has(id)) return;

              const matched = pickCodexThreadCandidate({
                activeSessions,
                webuiSessionId: id,
                cwd: session.cwd,
                createdAt: session.createdAt,
                baselineThreadIds: session._codexThreadBaseline,
                pathLib: path,
              });

              if (matched) {
                session._captureReservedThreadId = matched.backendSessionId || matched.sessionId || null;
                session.backendSessionId = matched.backendSessionId || matched.sessionId || session.backendSessionId;
                session.claudeSessionId = null;
                if (matched.name) session.name = matched.name;
                if (matched.cwd) session.cwd = matched.cwd;
                if (matched.sourceKind) session.sourceKind = matched.sourceKind;
                if (matched.agentKind) session.agentKind = matched.agentKind;
                if (matched.agentRole != null) session.agentRole = matched.agentRole || '';
                if (matched.agentNickname != null) session.agentNickname = matched.agentNickname || '';
                if (matched.parentThreadId !== undefined) session.parentThreadId = matched.parentThreadId || null;

                writeSessionMeta(sockName, {
                  name: session.name,
                  cwd: session.cwd,
                  backend: session.backend,
                  backendSessionId: session.backendSessionId,
                  claudeSessionId: session.claudeSessionId,
                  sourceKind: session.sourceKind,
                  agentKind: session.agentKind,
                  agentRole: session.agentRole,
                  agentNickname: session.agentNickname,
                  parentThreadId: session.parentThreadId,
                  forkedFrom: session.forkedFrom || null,
                  permissionMode: session._permissionMode || null,
              effort: session._effort || null,
                  effort: session._effort || null,
            effort: session._effort || null,
                  createdAt: session.createdAt,
                  webuiSessionId: id,
                  mode: sessionMode,
                });
                delete session._codexThreadBaseline;
                delete session._captureReservedThreadId;
                broadcastActiveSessions();
                return;
              }

              setTimeout(() => tryCapture(attempts - 1), 1500);
            };
            setTimeout(() => tryCapture(40), 1500);
          }

          // Read childPid from wrapper metadata after it has time to spawn
          setTimeout(() => refreshWebuiPids(), 3000);

          ws.send(JSON.stringify({ type: 'created', sessionId: id, name: session.name, cwd, mode: sessionMode, reqId: data.reqId || undefined }));
          broadcastActiveSessions();
          break;
        }

        case 'set-permission-mode': {
          const session = activeSessions.get(data.sessionId);
          if (session?.pty && session.mode === 'chat' && data.mode) {
            const adapter = adapterRegistry.get(session.backend);
            if (adapter) session.pty.write(adapter.formatSetPermissionMode(data.mode) + '\n');
          }
          break;
        }

        case 'set-model': {
          const session = activeSessions.get(data.sessionId);
          if (session?.pty && session.mode === 'chat' && data.model) {
            const adapter = adapterRegistry.get(session.backend);
            if (adapter?.formatSetModel) {
              try { session.pty.write(adapter.formatSetModel(data.model) + '\n'); } catch {}
            }
          }
          break;
        }

        case 'set-effort': {
          const session = activeSessions.get(data.sessionId);
          if (session?.pty && session.mode === 'chat' && data.effort != null) {
            const adapter = adapterRegistry.get(session.backend);
            if (adapter?.formatSetEffort) {
              try {
                session.pty.write(adapter.formatSetEffort(data.effort) + '\n');
                // remembered for attach restore — the CLI never reports effort
                // back (claude), so the last COMMANDED value is what we show.
                // Persisted in session meta so it survives server restarts.
                session._effort = data.effort || null;
                if (session.sockName) {
                  const m = readSessionMeta(session.sockName);
                  writeSessionMeta(session.sockName, { ...m, effort: session._effort });
                }
              } catch {}
            }
          }
          break;
        }

        case 'input': {
          const session = activeSessions.get(data.sessionId);
          if (session?.pty) session.pty.write(data.data);
          break;
        }

        case 'chat-input': {
          const session = activeSessions.get(data.sessionId);
          if (session?.pty && session.mode === 'chat') {
            const adapter = adapterRegistry.get(session.backend);
            if (!adapter) break;
            // New input means prior interrupt succeeded (or user proceeded) —
            // cancel any pending SIGINT fallback to avoid killing mid-stream.
            if (session._interruptTimer) {
              clearTimeout(session._interruptTimer);
              session._interruptTimer = null;
            }
            const msgId = data.msgId || (Date.now() + '-' + Math.random().toString(36).slice(2, 8));
            // NOTE: the user's message text is sent VERBATIM. Task context and
            // status-override notices are delivered through the harness's OWN
            // native hooks (SessionStart / UserPromptSubmit → vibespace-hook.mjs),
            // never by rewriting the user's input — modifying the message stream
            // is unstable and bypasses the CLI's mechanisms (user directive).
            const { stdinPayload, userMsg } = adapter.formatChatInput(data.text, msgId);
            session._isStreaming = true;
            session.pty.write(stdinPayload + '\n');
            if (userMsg) {
              session.buffer = (session.buffer + JSON.stringify(userMsg) + '\n').slice(-500000);
              if (session._normalizer) session._normalizer.processLive(userMsg);
            }
            // Detect broken pty stdin: the wrapper writes _stdin_ack on
            // stdout immediately when it receives stdin input. If no ack
            // AND no buffer growth within 5s, the stdin pipe is dead.
            // Both signals checked for compat with old wrappers that don't
            // send _stdin_ack (wrapper only updates on server restart).
            if (session.socketPath) {
              const inputPayload = stdinPayload;
              const bufLenBefore = (session.buffer || '').length;
              session._stdinAckReceived = false;
              setTimeout(() => {
                if (!activeSessions.has(data.sessionId)) return;
                if (session._stdinAckReceived) return;
                // Fallback: if buffer grew, pty is working (old wrapper without ack)
                if ((session.buffer || '').length > bufLenBefore) return;
                console.log(`[${data.sessionId}] Broken pty stdin detected — re-attaching dtach`);
                if (session.pty) { try { session.pty.kill(); } catch {} }
                const newPty = pty.spawn(DTACH_CMD, ['-a', session.socketPath, '-E', '-r', 'winch'], {
                  name: 'xterm-256color', cols: 120, rows: 30,
                  env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
                });
                setupSessionPty(session, data.sessionId, newPty);
                setTimeout(() => { newPty.write(inputPayload + '\n'); }, 500);
              }, 5000);
            }
          }
          break;
        }

        case 'interrupt': {
          const session = activeSessions.get(data.sessionId);
          if (session?.pty && session.mode === 'chat') {
            const adapter = adapterRegistry.get(session.backend);
            if (adapter) {
              session.pty.write(adapter.formatInterrupt() + '\n');
              adapter.postInterrupt(session, data.sessionId);
            }
          }
          break;
        }

        case 'review-start': {
          const session = activeSessions.get(data.sessionId);
          if (session?.pty && session.mode === 'chat' && session.backend === 'codex' && data.target) {
            session.pty.write(JSON.stringify({
              type: 'review-start',
              target: data.target,
              delivery: data.delivery || undefined,
            }) + '\n');
          }
          break;
        }

        case 'permission-response': {
          const session = activeSessions.get(data.sessionId);
          if (session?.pty && session.mode === 'chat') {
            const adapter = adapterRegistry.get(session.backend);
            if (adapter) {
              const payload = adapter.formatPermissionResponse(data);
              session.pty.write(payload + '\n');
              // Record in buffer so permission state survives refresh/restart
              session.buffer = (session.buffer + payload + '\n').slice(-500000);
              if (session._normalizer) session._normalizer.processLive(JSON.parse(payload));
            }
          }
          break;
        }

        case 'set-goal': {
          const session = activeSessions.get(data.sessionId);
          if (session?.mode === 'chat') {
            if (data.action === 'status') {
              const goal = session._goal;
              const prev = session._prevGoal;
              let msg = goal ? `Goal active: ${goal}\n\`/goal clear\` to remove, \`/goal <new text>\` to replace.` : 'No goal set. Usage: `/goal <condition>`';
              if (!goal && prev) msg += `\nPrevious goal available — \`/goal resume\` to re-activate.`;
              ws.send(JSON.stringify({ type: 'goal-updated', sessionId: data.sessionId, goal: session._goal || null, statusMsg: msg }));
            } else if (data.action === 'resume') {
              const prev = session._prevGoal;
              if (!prev) {
                ws.send(JSON.stringify({ type: 'goal-updated', sessionId: data.sessionId, goal: null, statusMsg: 'No previous goal to resume.' }));
              } else {
                session._goal = prev;
                session._prevGoal = null;
                session._goalStatus = 'active';
                session._lastGoalStatusUuid = null; // fresh native goal → re-sync from JSONL
                if (session.pty) session.pty.write(JSON.stringify({ type: 'set-goal', goal: prev }) + '\n');
                broadcastToSession(session, data.sessionId, { type: 'goal-updated', sessionId: data.sessionId, goal: prev, goalStatus: 'active', statusMsg: `Goal resumed: ${prev}` });
              }
            } else {
              const goalText = data.goal || null;
              // Save the previous goal for /goal resume on BOTH clear and
              // replace (both backends natively replace an active goal:
              // Claude /goal swaps the Stop-hook condition; Codex
              // thread/goal/set updates/replaces, steering a running turn)
              if (session._goal && session._goal !== goalText) session._prevGoal = session._goal;
              if (session.pty) session.pty.write(JSON.stringify({ type: 'set-goal', goal: goalText }) + '\n');
              session._goal = goalText;
              session._goalStatus = goalText ? 'active' : null;
              session._goalElapsed = 0;
              session._lastGoalStatusUuid = null;
              const msg = goalText ? `Goal set: ${goalText}` : `Goal cleared`;
              broadcastToSession(session, data.sessionId, { type: 'goal-updated', sessionId: data.sessionId, goal: goalText, goalStatus: session._goalStatus, goalElapsed: 0, statusMsg: msg });
            }
          }
          break;
        }

        case 'rename-session': {
          const trimmedName = typeof data.name === 'string' ? data.name.trim() : '';
          let targetId = data.webuiId && activeSessions.has(data.webuiId) ? data.webuiId : null;
          if (!targetId) {
            for (const [sessionId, session] of activeSessions) {
              if (data.sessionKey && getSessionKey(session) === data.sessionKey) {
                targetId = sessionId;
                break;
              }
              if (data.backendSessionId && (session.backendSessionId || session.claudeSessionId) === data.backendSessionId) {
                targetId = sessionId;
                break;
              }
            }
          }
          if (!targetId) break;

          const session = activeSessions.get(targetId);
          if (!session) break;

          if (trimmedName) session.name = trimmedName;
          if (session.backend === 'codex' && session.mode === 'chat' && session.pty && trimmedName) {
            session.pty.write(JSON.stringify({ type: 'set-thread-name', name: trimmedName }) + '\n');
          }
          if (session.sockName) {
            writeSessionMeta(session.sockName, {
              name: session.name,
              cwd: session.cwd,
              backend: session.backend,
              backendSessionId: session.backendSessionId,
              claudeSessionId: session.claudeSessionId || null,
              sourceKind: session.sourceKind || null,
              agentKind: session.agentKind || 'primary',
              agentRole: session.agentRole || '',
              agentNickname: session.agentNickname || '',
              parentThreadId: session.parentThreadId || null,
              permissionMode: session._permissionMode || null,
              effort: session._effort || null,
            effort: session._effort || null,
              createdAt: session.createdAt,
              webuiSessionId: targetId,
              mode: session.mode || 'terminal',
            });
          }
          broadcastActiveSessions();
          break;
        }

        case 'resize': {
          const session = activeSessions.get(data.sessionId);
          if (session && data.cols > 0 && data.rows > 0) {
            // real:true marks this as a genuine terminal fit (vs the 120×30
            // placeholder set at attach) — only these drive resizeSessionToMin
            const prev = session.clients.get(ws);
            const firstRealFit = !prev?.real;
            session.clients.set(ws, { cols: data.cols, rows: data.rows, real: true });
            const before = session.pty ? { cols: session.pty.cols, rows: session.pty.rows } : null;
            resizeSessionToMin(session, data.sessionId);
            // Fresh attach (first real fit from this client): if the min-size
            // came out unchanged, the PTY got no SIGWINCH — the TUI never
            // repaints and this client is stuck with whatever partial frame the
            // buffer replay contained. Nudge one column down and back to force
            // a clean repaint (same trick as dtach's `-r winch` refresh mode).
            if (firstRealFit && session.mode !== 'chat' && session.pty && before
                && session.pty.cols === before.cols && session.pty.rows === before.rows) {
              try {
                session.pty.resize(Math.max(1, before.cols - 1), before.rows);
                setTimeout(() => { try { session.pty.resize(before.cols, before.rows); } catch {} }, 60);
              } catch {}
            }
          }
          break;
        }

        case 'size-override': {
          // Take over the PTY size: this client's window size wins over the
          // min-of-all-clients policy (smaller clients show a blocked overlay
          // with a "Resume here" takeover button). release:true → min policy.
          const session = activeSessions.get(data.sessionId);
          if (session) {
            session._sizeOwnerWs = data.release ? null : ws;
            resizeSessionToMin(session, data.sessionId);
          }
          break;
        }

        case 'attach': {
          // Virtual subagent session: sub-{parentToolUseId} or sub-agent-{agentId}
          if (data.sessionId?.startsWith('sub-')) {
            const subId = data.sessionId;
            if (subId.startsWith('sub-agent-')) {
              // Completed agent: load from JSONL
              const agentId = subId.slice('sub-agent-'.length);
              // Find parent session to get claudeSessionId/cwd
              const parentId = data.parentSessionId;
              const parentSession = parentId ? activeSessions.get(parentId) : null;
              const claudeId = parentSession?.backendSessionId || parentSession?.claudeSessionId || data.backendSessionId || data.claudeSessionId || '';
              const cwd = parentSession?.cwd || data.cwd || '';
              const projectsDir = path.join(os.homedir(), '.claude', 'projects');
              const projDir = cwdToProjectDir(cwd);
              let rawMsgs = [], meta = {};
              const candidates = [path.join(projectsDir, projDir, claudeId, 'subagents')];
              try { for (const dir of fs.readdirSync(projectsDir)) { const fp = path.join(projectsDir, dir, claudeId, 'subagents'); if (!candidates.includes(fp)) candidates.push(fp); } } catch {}
              for (const subDir of candidates) {
                const fp = path.join(subDir, `agent-${agentId}.jsonl`);
                try {
                  if (!fs.existsSync(fp)) continue;
                  for (const line of fs.readFileSync(fp, 'utf-8').split('\n')) {
                    try { const m = JSON.parse(line.trim()); if (m.type === 'user' || m.type === 'assistant' || m.type === 'result') rawMsgs.push(m); } catch {}
                  }
                  try { meta = JSON.parse(fs.readFileSync(fp.replace('.jsonl', '.meta.json'), 'utf-8')); } catch {}
                  break;
                } catch {}
              }
              const subMM = new MessageManager(subId);
              subMM.convertHistory(rawMsgs);
              ws.send(JSON.stringify({ type: 'attached', sessionId: subId, mode: 'chat', messages: subMM.messages, totalCount: subMM.total, meta }));
            } else {
              // Live agent: sub-{parentToolUseId} — find parent session and return buffered messages
              const toolUseId = subId.slice('sub-'.length);
              let found = false;
              for (const [sid, sess] of activeSessions) {
                if (sess.subagentBuffers?.has(toolUseId)) {
                  // viewer:true — receive broadcasts but NEVER influence the
                  // parent session's PTY size (this read-only window has no terminal)
                  sess.clients.set(ws, { cols: 120, rows: 30, viewer: true });
                  attachedSessions.add(sid); // so ws close removes us from the parent's clients map
                  const rawMsgs = sess.subagentBuffers.get(toolUseId);
                  // Use existing sub-normalizer if available, or create one
                  if (!sess._subNormalizers) sess._subNormalizers = new Map();
                  let subMM = sess._subNormalizers.get(toolUseId);
                  if (!subMM) {
                    subMM = new MessageManager(subId);
                    subMM.onOp((op) => broadcastToSession(sess, sid, { type: 'msg', sessionId: subId, ...op }));
                    subMM.convertHistory(rawMsgs);
                    sess._subNormalizers.set(toolUseId, subMM);
                  }
                  ws.send(JSON.stringify({ type: 'attached', sessionId: subId, mode: 'chat', messages: subMM.messages, totalCount: subMM.total }));
                  found = true;
                  break;
                }
              }
              if (!found) ws.send(JSON.stringify({ type: 'attached', sessionId: subId, mode: 'chat', messages: [], totalCount: 0 }));
            }
            break;
          }

          const session = activeSessions.get(data.sessionId);
          if (session) {
            session.clients.set(ws, { cols: 120, rows: 30 });
            attachedSessions.add(data.sessionId);
            if (session.mode === 'chat') {
              // Remote session: pull its transcript into the local cache BEFORE
              // the first history load, so pre-resume history renders and the
              // pagination/search machinery has a real file to work on.
              if (session.host && hosts && !session._historyLoaded && (session.claudeSessionId || session.backendSessionId)) {
                try { await hosts.fetchSessionJsonl(session.host, session.claudeSessionId || session.backendSessionId); }
                catch (e) { console.error('remote jsonl fetch failed:', e.message); }
              }
              const sm = createSessionMessages(session, data.sessionId);
              // Initialize normalizer from full JSONL + buffer history on first attach.
              // Can't use total===0: PTY output via processLive may have populated the
              // normalizer with partial buffer data before any client connected.
              if (session._normalizer && !session._historyLoaded) {
                session._historyLoaded = true;
                const opHandlers = [...session._normalizer.listeners]; // carry over ALL subscribers, not just the first
                session._normalizer = createMessageManager(session.backend || 'claude', data.sessionId);
                session._normEpoch = Date.now();
                for (const h of opHandlers) session._normalizer.onOp(h);
                session._normalizer.convertHistory(sm.raw());
              }
              // Recover goal state from wrapper meta (populated by thread/goal/get on startup)
              if (!session._goal) {
                const wMeta = sm.wrapperMeta?.() || {};
                if (wMeta.goal) {
                  session._goal = wMeta.goal;
                  session._goalStatus = wMeta.goalStatus || null;
                  session._goalElapsed = wMeta.goalElapsed || 0;
                  session._goalTokensUsed = wMeta.goalTokensUsed || 0;
                }
                // Claude fallback: goal_status attachments in JSONL
                if (!session._goal && session.backend === 'claude') {
                  const gs = session._normalizer?.goalState?.();
                  if (gs?.condition) {
                    if (!gs.met) session._goal = gs.condition;
                    else session._prevGoal = gs.condition;
                  }
                }
              }
              const messages = session._normalizer ? session._normalizer.tail(50) : [];
              const totalCount = session._normalizer ? session._normalizer.total : 0;

              const turnMap = session._normalizer ? session._normalizer.turnMap() : [];
              const pendingPerms = sm.activePendingPermissions?.() || {};
              // session._isStreaming is tracked explicitly from protocol signals
              // (result/compact_boundary/user for Claude, turn events for Codex).
              // Falls back to wrapper metadata file for sessions not yet tracked.
              const isStreaming = session._isStreaming ?? sm.isStreaming;
              const streamingLabel = isStreaming ? (session._streamingLabel || 'thinking...') : '';
              // Merge session-known permission mode into chatStatus — the JSONL
              // can't provide it (init records are stdout-only), so freshly
              // resumed sessions had an empty mode until the first reply
              const chatStatus = sm.chatStatus() || {};
              if (!chatStatus.permissionMode && session._permissionMode) chatStatus.permissionMode = session._permissionMode;
              if (!chatStatus.effort && session._effort) chatStatus.effort = session._effort;
              ws.send(JSON.stringify({ type: 'attached', sessionId: data.sessionId, name: session.name, cwd: session.cwd, mode: 'chat',
                messages, totalCount, chatStatus, isStreaming, streamingLabel, taskState: sm.taskState(), turnMap, pendingPermissions: pendingPerms,
                normEpoch: session._normEpoch || 0,
                goal: session._goal || null, goalElapsed: session._goalElapsed || 0, goalStatus: session._goalStatus || null }));
            } else {
              ws.send(JSON.stringify({ type: 'attached', sessionId: data.sessionId, name: session.name, cwd: session.cwd, buffer: session.buffer || '' }));
            }
          } else if (data.viewOnly && (data.backendSessionId || data.claudeSessionId)) {
            // View-only: load JSONL history without an active session
            const backendSessionId = data.backendSessionId || data.claudeSessionId;
            // Remote session: pull the transcript over ssh into the local
            // cache first (findSessionJsonlPath scans it) — history then
            // loads through the normal path. Stale cache beats no history.
            if (data.host && hosts) {
              try { await hosts.fetchSessionJsonl(data.host, backendSessionId); }
              catch (e) { console.error('remote jsonl fetch failed:', e.message); }
            }
            const sm = createSessionMessages({
              backend: data.backend || 'claude',
              backendSessionId,
              claudeSessionId: data.claudeSessionId || backendSessionId,
              agentKind: data.agentKind || 'primary',
              agentRole: data.agentRole || '',
              agentNickname: data.agentNickname || '',
              sourceKind: data.sourceKind || '',
              parentThreadId: data.parentThreadId || null,
              cwd: data.cwd || '',
              buffer: '',
            });
            const mm = createMessageManager(data.backend || 'claude', data.sessionId || 'view');
            mm.convertHistory(sm.raw());
            ws.send(JSON.stringify({ type: 'attached', sessionId: data.sessionId, name: data.name || '', cwd: data.cwd || '', mode: 'chat',
              messages: mm.tail(50), totalCount: mm.total, chatStatus: sm.chatStatus(), isStreaming: false, viewOnly: true }));
          } else {
            // Include sessionId so the requesting ChatView can correlate the
            // failure (otherwise it waits forever on a blank window)
            ws.send(JSON.stringify({ type: 'error', sessionId: data.sessionId, message: `Session ${data.sessionId} not found` }));
          }
          break;
        }

        case 'kill': {
          const session = activeSessions.get(data.sessionId);
          if (session) {
            // Cancel any pending delayed-SIGINT from a recent interrupt — after
            // kill, the childPid may be reused by an unrelated process
            if (session._interruptTimer) { clearTimeout(session._interruptTimer); session._interruptTimer = null; }
            // Kill the dtach session process (which kills claude as its child)
            // The dtach process is the parent of our attach PTY's target
            if (session.socketPath) {
              try {
                // Find dtach process by socket path and kill it
                const out = execFileSync('pgrep', ['-f', session.socketPath], { encoding: 'utf-8', timeout: 2000 }).trim();
                for (const line of out.split('\n')) {
                  const dpid = parseInt(line.trim());
                  if (dpid && dpid !== session.pty?.pid) {
                    try { process.kill(dpid, 'SIGTERM'); } catch {}
                  }
                }
              } catch {}
              try { fs.unlinkSync(session.socketPath); } catch {}
            }
            if (session.pty) session.pty.kill();
            if (session.sockName) deleteSessionMeta(session.sockName);
            // Clean up wrapper buffer files
            try { fs.unlinkSync(path.join(BUFFERS_DIR, data.sessionId + '.json')); } catch {}
            try { fs.unlinkSync(path.join(BUFFERS_DIR, data.sessionId + '.buf')); } catch {}
            activeSessions.delete(data.sessionId);
            refreshWebuiPids();
            broadcastActiveSessions();
          }
          break;
        }

        case 'state-set': {
          const store = getSyncStore(data.store);
          if (store && data.key && typeof data.key === 'string') {
            if (data.value == null || data.value === '') store.delete(data.key, ws);
            else store.set(data.key, data.value, ws);
          }
          break;
        }

        case 'state-resync': {
          // Client reconnected — send missed ops or full snapshot per store
          if (data.versions && typeof data.versions === 'object') {
            for (const [name, sinceVersion] of Object.entries(data.versions)) {
              const store = getSyncStore(name);
              if (!store) continue;
              const result = store.getOpsSince(sinceVersion);
              if (result.full) {
                ws.send(JSON.stringify({ type: 'state-snapshot', store: name, data: result.full, version: result.version }));
              } else if (result.ops.length > 0) {
                for (const op of result.ops) {
                  ws.send(JSON.stringify({ type: 'state-sync', store: name, ...op }));
                }
              }
            }
          }
          break;
        }

        case 'layout-sync': {
          // Layout state sync: save to disk + broadcast to other clients.
          // Each rebroadcast carries a monotonically increasing seq — receivers
          // drop anything <= the last seq they applied, so a delayed/stale
          // broadcast can never "undo" a newer one (the ping-pong bug where an
          // operation on one client got reverted and replayed several times).
          const layoutData = readLayouts();
          const desktopId = data.desktopId;
          if (desktopId) {
            // Per-desktop save
            if (!layoutData.desktops) layoutData.desktops = {};
            if (!layoutData.desktops[desktopId]) layoutData.desktops[desktopId] = {};
            layoutData.desktops[desktopId].autoSave = { ...data.state, updatedAt: Date.now() };
          } else {
            // Legacy single-desktop save
            layoutData.autoSave = { ...data.state, updatedAt: Date.now() };
          }
          writeLayouts(layoutData);
          // Broadcast to other clients (sender excluded) — include desktopMeta
          const syncMsg = JSON.stringify({ type: 'layout-sync', seq: ++layoutSyncSeqRef.value, desktopId, state: data.state, desktopMeta: layoutData.desktopMeta || [] });
          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WS_OPEN) { try { client.send(syncMsg); } catch {} }
          });
          break;
        }

        case 'desktop-create': {
          const layoutData = readLayouts();
          if (!layoutData.desktopMeta) layoutData.desktopMeta = [];
          if (!layoutData.desktops) layoutData.desktops = {};
          const newId = data.id || ('desk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5));
          const newName = data.name || `Desktop ${layoutData.desktopMeta.length + 1}`;
          // Avoid duplicates (migration sends id that may already exist)
          if (!layoutData.desktopMeta.find(d => d.id === newId)) {
            layoutData.desktopMeta.push({ id: newId, name: newName });
          }
          if (!layoutData.desktops[newId]) layoutData.desktops[newId] = {};
          writeLayouts(layoutData);
          const broadcast = JSON.stringify({ type: 'desktop-updated', desktops: layoutData.desktopMeta });
          wss.clients.forEach(c => { if (c !== ws && c.readyState === WS_OPEN) try { c.send(broadcast); } catch {} });
          break;
        }

        case 'desktop-delete': {
          const layoutData = readLayouts();
          if (layoutData.desktopMeta) {
            layoutData.desktopMeta = layoutData.desktopMeta.filter(d => d.id !== data.desktopId);
          }
          if (layoutData.desktops) delete layoutData.desktops[data.desktopId];
          writeLayouts(layoutData);
          const broadcast = JSON.stringify({ type: 'desktop-updated', desktops: layoutData.desktopMeta || [] });
          wss.clients.forEach(c => { if (c !== ws && c.readyState === WS_OPEN) try { c.send(broadcast); } catch {} });
          break;
        }

        case 'desktop-rename': {
          const layoutData = readLayouts();
          const meta = (layoutData.desktopMeta || []).find(d => d.id === data.desktopId);
          if (meta) meta.name = data.name;
          writeLayouts(layoutData);
          const broadcast = JSON.stringify({ type: 'desktop-updated', desktops: layoutData.desktopMeta || [] });
          wss.clients.forEach(c => { if (c !== ws && c.readyState === WS_OPEN) try { c.send(broadcast); } catch {} });
          break;
        }

        case 'tmux-attach': {
          // Attach to a running tmux pane (read-only view of external session)
          const tmuxTarget = data.tmuxTarget;
          if (!tmuxTarget) { ws.send(JSON.stringify({ type: 'error', message: 'No tmux target' })); break; }

          const id = 'tmux-' + (++sessionCounterRef.value) + '-' + Date.now();
          const tmuxPty = pty.spawn('tmux', ['attach-session', '-t', tmuxTarget], {
            name: 'xterm-256color', cols: data.cols || 120, rows: data.rows || 30,
            env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
          });

          const session = {
            pty: null, clients: new Map([[ws, { cols: data.cols || 120, rows: data.rows || 30 }]]),
            cwd: data.cwd || '', name: data.name || tmuxTarget,
            createdAt: Date.now(), tmuxTarget, isTmuxView: true,
            backend: 'claude', buffer: '',
          };
          activeSessions.set(id, session);
          attachedSessions.add(id);

          setupSessionPty(session, id, tmuxPty, { cleanupOnExit: false });

          ws.send(JSON.stringify({ type: 'created', sessionId: id, name: session.name, cwd: session.cwd, isTmuxView: true, reqId: data.reqId || undefined }));
          broadcastActiveSessions();
          break;
        }
      }
    }

    ws.on('close', () => {
      for (const sid of attachedSessions) {
        const session = activeSessions.get(sid);
        if (session) {
          session.clients.delete(ws);
          resizeSessionToMin(session, sid);
        }
      }
    });
  });
}

module.exports = { registerWsHandler };
