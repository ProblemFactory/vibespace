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
const { execFile } = require('child_process');

function getSessionKey(session = {}) {
  const backend = session.backend || 'claude'; // fallback needed: called with API data too
  const backendSessionId = session.backendSessionId || session.sessionId || session.claudeSessionId || null;
  return backendSessionId ? `${backend}:${backendSessionId}` : '';
}

// Terminal QUERY-RESPONSE sequences xterm.js auto-emits when an app queries the
// terminal: CPR/DECXCPR (\e[n;mR), DA1/DA2 (\e[?…c / \e[>…c), DSR-ok (\e[0n),
// DECRPM (\e[?n;m$y), OSC 4/10/11/12 color reports, DCS replies (XTVERSION/
// XTGETTCAP/DECRQSS/DA3). Used by the 'input' case to arbitrate multi-client
// answers — keep in sync with TERM_QUERY_RESP_RE in src/lib/terminal.js.
const TERM_QUERY_RESP_RE = /\x1b\[\??\d+(?:;\d+){0,2}R|\x1b\[[?>][\d;]*c|\x1b\[0n|\x1b\[\?\d+;\d+\$y|\x1b\](?:4|1[0-2]);[^\x07\x1b]*(?:\x07|\x1b\\)|\x1bP[^\x1b]*\x1b\\/g;

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
    readLayouts, writeLayouts, getSyncStore, serverSetting, integrationEnabled, agentdRemote, dialBridge,
    sessionCounterRef, createSessionMessages,
    SOCKETS_DIR, BUFFERS_DIR, PTY_WRAPPER, CHAT_WRAPPER,
    NODE_CMD, DTACH_CMD, ENV_CMD, CLAUDE_CMD, EDITOR_CMD, PORT, X_ENV,
    adapterRegistry, pty, path, fs, os, execFileSync, ensureDir, hosts,
    accounts, scheduleCtxSync, activeSessionsPayload,
    USAGE_STATUSLINE_CMD, userStatuslineCmd,
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

    // Send current active sessions on connect — THE SAME payload builder as
    // broadcastActiveSessions (a second hardcoded field list here silently
    // dropped every later-added field — auth/account/todo badges were dead
    // after a server-restart reconnect until the next organic broadcast).
    ws.send(JSON.stringify({ type: 'active-sessions', sessions: activeSessionsPayload() }));

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
          // Resume guard (2.179.0, walter's duplicate-session incident): a
          // plain claude --resume REUSES the conversation id — spawning it
          // while the original session is still LIVE puts TWO claude
          // processes on ONE JSONL (transcript double-writer class) and
          // duplicates the sidebar card. Refuse and hand the LIVE session
          // back; the client attaches it instead. Forks mint a new id (skip);
          // codex resume forks a new thread id by design (not affected).
          if (backend === 'claude' && data.resume && data.resumeId && !data.fork) {
            let existing = null;
            for (const [eid, es] of activeSessions) {
              if ((es.backend || 'claude') !== 'claude') continue;
              if ((es.claudeSessionId || es.backendSessionId) !== data.resumeId) continue;
              if ((es.host || null) !== (data.hostId || null)) continue;
              existing = [eid, es]; break;
            }
            if (existing) {
              ws.send(JSON.stringify({
                type: 'error', code: 'resume-already-live', reqId: data.reqId,
                existingId: existing[0], existingName: existing[1].name || '',
                existingCwd: existing[1].cwd || '', existingMode: existing[1].mode || 'chat',
                message: 'This conversation is already running in a live session — opening that instead of starting a second copy.',
              }));
              break;
            }
          }
          const id = 'sess-' + (++sessionCounterRef.value) + '-' + Date.now();
          // cwd default: a REMOTE/DIAL session with no explicit cwd must land
          // in the DEVICE's home, NOT this server's (B-0d70: the pod's
          // /home/xingweil doesn't exist on a Mac → `cd` failed and, on the
          // pipe-session path, a nonexistent spawn cwd crashed the daemon).
          let cwd = data.cwd || '';
          if (!cwd) {
            if (data.hostId && hosts) {
              try { const hh = hosts.get(data.hostId); cwd = (hh && await hosts.homeDir(hh)) || ''; } catch { }
            }
            if (!cwd) cwd = os.homedir();
          }
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

          // Billing identity (Claude: subscription ↔ API/console account; Codex:
          // ChatGPT subscription via an isolated CODEX_HOME). Local sessions get
          // the auth via the spawn process env; REMOTE sessions get an API key
          // via an ssh-stdin-shipped 0600 file + shell prefix assignment (see
          // remoteAccountEnv — subscription accounts stay local-only). Resolved
          // BEFORE the session object so a bad account aborts the create cleanly.
          let spawnAccount = null;
          if ((backend === 'claude' || backend === 'codex') && accounts) {
            try { spawnAccount = accounts.resolveForSpawn(data.accountId, backend); }
            catch (e) {
              ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: 'Account error: ' + e.message }));
              return;
            }
            // REMOTE + the account came from the DEFAULT (nothing specified) +
            // it could only reach the host by shipping subscription creds →
            // fall back to the HOST's own CLI login instead of failing the
            // spawn later with the shipping-disabled error (real report:
            // resuming a remote session with no account picked errored).
            // An EXPLICITLY chosen subscription still errors with guidance,
            // and an opted-in shipSubscriptionToRemote still ships.
            if (spawnAccount?.remoteCreds && data.hostId && !data.accountId) {
              let allowShip = false;
              try { allowShip = !!serverSetting('accounts.shipSubscriptionToRemote'); } catch {}
              if (!allowShip) spawnAccount = null; // = the host's own login
            }
          }

          const session = {
            mode: sessionMode,
            pty: null, clients: new Map([[ws, { cols: data.cols || 120, rows: data.rows || 30 }]]),
            cwd, name: data.sessionName || `Session ${sessionCounterRef.value}`,
            createdAt: Date.now(),
            // Per-session bearer for the agent-facing API (vibespace-status):
            // spawned into the CLI's env, scopes writes to this session only
            agentToken: 'vsst_' + crypto.randomBytes(12).toString('hex'),
            // Task Group this session was spawned INTO (from the New-session
            // dialog). Belonging is otherwise LIVE-derived server-side from the
            // session token; this only covers the window before the async UI
            // bind lands. VALIDATED to the id shape (metachar-free — kept as
            // defense-in-depth even though it's no longer shell-interpolated).
            _initialGroupId: (typeof data.taskId === 'string' && /^T-[\w-]{1,60}$/.test(data.taskId)) ? data.taskId : null,
            // Billing identity badge (the key itself only lives in the spawn env)
            _accountId: spawnAccount?.id || null,
            // Billing intent at spawn: without an env key the CLI follows its
            // GLOBAL login — record what that was RIGHT NOW so the badge can
            // warn about API-billed sessions even after the user re-logins to
            // the subscription. The stream's init record (apiKeySource) later
            // CONFIRMS/overrides this guess (chat sessions).
            _authAtSpawn: (spawnAccount?.kind === 'subscription' || spawnAccount?.kind === 'codex-subscription') ? 'subscription-acct'
              : spawnAccount ? 'env-key'
              : backend !== 'claude' ? null
              : data.hostId ? 'remote-global'
              : (accounts?.subscriptionStatus?.().loggedIn ? 'subscription'
                : (accounts?.cliPrimaryKey?.().present ? 'console' : 'unknown')),
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
          // Integration master switch (agents.vibespaceIntegration, 2.190.0):
          // OFF ⇒ this spawn is PRISTINE — no VIBESPACE_API, no agent tools on
          // PATH, no statusline injection, no remote tools/hook-register/
          // reverse-tunnel. VIBESPACE_SESSION_TOKEN alone is KEPT (Ctrl+G
          // editor auth; inert without the api var — every consumer guards on
          // both). Read per spawn = live.
          let integrationOn = integrationEnabled ? integrationEnabled() : true;
          // Remote agent enablement (P3): a remote session can't reach the local
          // API at 127.0.0.1:<PORT>, and the vibespace-status/-task tools don't
          // exist on the remote box. So for any remote session we (1) open an
          // ssh REVERSE tunnel (remote 127.0.0.1:<rport> → this server) and (2)
          // write the two tools into ~/.vibespace/bin on the remote + prepend
          // PATH. Returns pieces spliced into the ssh inner command. Node's
          // base64 is unwrapped (no newlines) so the blob is a single safe word.
          const remoteAgentSetup = () => {
            // Base PATH/nvm exports — the terminal branch relies on the prelude
            // alone to find node/claude on the host (chat branches re-export
            // inside their inner command), so this part is UNCONDITIONAL even
            // when tool shipping fails below.
            let prelude = `export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; `;
            let tokenAssign = '';
            // ONE ship list, parameterized by the Integration master switch:
            // ON  → all agent tools + hook + keeper + the per-session vsst_
            //       token (over ssh STDIN — 2.126.0, argv is world-readable
            //       via /proc/cmdline on the remote; secrets ride stdin into
            //       0600 files, the inner command references the token via a
            //       `VAR="$(cat …)"` shell prefix so the value never enters
            //       any argv), then hook-register + tools PATH in the prelude.
            // OFF → pristine spawn: ship ONLY the transport keeper, and only
            //       for CHAT (remote chat persistence rides it, invoked by
            //       absolute path — terminal uses remote dtach and needs
            //       nothing); no hook-register, no token, no tools PATH, no
            //       VIBESPACE_API reverse tunnel. A hook a PREVIOUS spawn
            //       registered on the host stays inert (it guards on env we
            //       no longer pass) — Manage Agents → host → Remove strips it.
            const names = integrationOn
              ? require('./hosts').HostManager.AGENT_TOOLS
              : (sessionMode === 'chat' ? ['vibespace-remote-keeper'] : []);
            const toolDir = path.dirname(EDITOR_CMD);
            const present = names.filter((n) => { try { return fs.statSync(path.join(toolDir, n)).isFile(); } catch { return false; } });
            if (present.length) {
              try {
                const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-tok-'));
                try {
                  const tokName = `.tok-${id}`; // id is [\w-] — shell-safe
                  const tokArgs = [];
                  if (integrationOn) {
                    fs.writeFileSync(path.join(tmpDir, tokName), session.agentToken, { mode: 0o600 });
                    tokArgs.push('-C', tmpDir, tokName);
                  }
                  const tar = execFileSync('tar', ['-c', '-C', toolDir, ...present, ...tokArgs], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
                  const h2 = hosts.get(data.hostId);
                  execFileSync('ssh', [...hosts.sshArgs(h2, { multiplex: true }), '--', 'umask 077; mkdir -p "$HOME/.vibespace/bin"; tar -x -C "$HOME/.vibespace/bin"; chmod +x "$HOME/.vibespace/bin"/vibespace-* 2>/dev/null || true'],
                    { input: tar, timeout: 20000 });
                  if (integrationOn) {
                    prelude += `export PATH="$HOME/.vibespace/bin:$PATH"; node "$HOME/.vibespace/bin/vibespace-hook-register.mjs" 2>/dev/null || true; `;
                    tokenAssign = `VIBESPACE_SESSION_TOKEN="$(cat "$HOME/.vibespace/bin/${tokName}")" `;
                  }
                } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
              } catch (e) {
                // tool shipping failed (an unreachable host fails the create
                // later anyway) — session still runs, agent tools just degrade
                console.error('[remote] tool distribution failed:', e.message);
              }
            }
            if (!integrationOn) return { prelude, envPairs: [], tokenAssign: '', reverse: null };
            // Wide range → per-host collision (two sessions picking the same
            // port) is negligible; a collision only degrades the loser's tools
            // (ssh -R bind warns, session still runs), never breaks the session.
            // VIBESPACE_API is not a secret; the token rides tokenAssign only.
            const rport = session._remotePort = 20000 + Math.floor(Math.random() * 40000);
            return { prelude, envPairs: [`VIBESPACE_API=http://127.0.0.1:${rport}`], tokenAssign, reverse: `${rport}:127.0.0.1:${PORT}` };
          };
          // B.3: the same agent prelude for a DIAL device, over the device
          // link (no ssh). Tools + the 0600 token ride fsWrite; VIBESPACE_API
          // is a REVERSE-FORWARD (device binds a loopback port whose bytes
          // tunnel back to our server port — the same NAT-proof primitive
          // host-mounts uses); the hook is registered with runCmd. Returns the
          // same shape as remoteAgentSetup ({envPairs, tokenAssign}) minus the
          // ssh-only prelude/reverse fields. Degrades to bare env on any error
          // (the session still runs; tools just aren't present).
          const deviceAgentSetup = async (h, sid) => {
            // Integration OFF ⇒ tools/token/hook-register/back-tunnel are all
            // skipped — the device pipe/pty session itself is transport (the
            // daemon IS the persistence layer). Only BILLING (an API-key file)
            // still needs device round trips; with no key either, there is
            // nothing to place at all.
            if (!integrationOn && !spawnAccount?.secret) return { envPairs: [], tokenAssign: '' };
            const dm = await hosts.device(h.id); // dial → deviceForDial
            const home = String((await dm.runCmd('sh', ['-c', 'printf %s "$HOME"'], { timeoutMs: 8000 }))?.stdout || '').trim() || '/root';
            const bin = `${home}/.vibespace/bin`;
            const tokName = `.tok-${sid}`;
            let rf = null;
            if (integrationOn) {
              await dm.fsMkdir(bin);
              const toolDir = path.dirname(EDITOR_CMD);
              const names = require('./hosts').HostManager.AGENT_TOOLS;
              for (const n of names) {
                try { const buf = fs.readFileSync(path.join(toolDir, n)); await dm.fsWrite(`${bin}/${n}`, buf); } catch { }
              }
              await dm.fsWrite(`${bin}/${tokName}`, Buffer.from(session.agentToken));
              // chmod: tools executable, token 0600, then register the hook in
              // the device's OWN claude/codex configs (its local CLI fires it)
              await dm.runCmd('sh', ['-c',
                `chmod +x "${bin}"/vibespace-* 2>/dev/null; chmod 600 "${bin}/${tokName}"; `
                + `node "${bin}/vibespace-hook-register.mjs" 2>/dev/null || true`], { timeoutMs: 12000 }).catch(() => {});
              // VIBESPACE_API back-tunnel: a loopback port ON THE DEVICE whose
              // accepts ride the dial link back into our own server port.
              const net = require('net');
              rf = await dm.reverseForward({ port: 0, connectLocal: () => net.connect(PORT, '127.0.0.1') });
              session._dialReversePort = rf.port;
            }
            // Account billing over the device link (B.3 tail, user directive
            // 2026-07-15: "oauth默认禁止搬运，api key可以"). Mirrors
            // remoteAccountEnv: an API KEY value ships via fsWrite into a 0600
            // file on the device, referenced by $(cat …) so the value never
            // enters any argv; a SUBSCRIPTION's OAuth creds are NEVER shipped
            // by default (§ban-safety — a sub token live from a device IP is an
            // impossible-travel/abuse signal), gated behind the SAME setting.
            // API key only (subscriptions are rejected upstream at the dial
            // branch). The value rides fsWrite into a 0600 file; $(cat …) keeps
            // it out of every argv.
            let acctAssign = '';
            if (spawnAccount && spawnAccount.secret) {
              await dm.fsMkdir(`${home}/.vibespace`); // integration-OFF path skipped the bin mkdir
              const kf = `${home}/.vibespace/${spawnAccount.id}.key`;
              await dm.fsWrite(kf, Buffer.from(spawnAccount.secret.value));
              await dm.runCmd('sh', ['-c', `chmod 600 "${kf}"`], { timeoutMs: 6000 }).catch(() => {});
              acctAssign = `${spawnAccount.secret.var}="$(cat "${kf}")" `;
            }
            if (!integrationOn) return { envPairs: [], tokenAssign: acctAssign };
            return {
              envPairs: [`VIBESPACE_API=http://127.0.0.1:${rf.port}`],
              tokenAssign: acctAssign + `VIBESPACE_SESSION_TOKEN="$(cat "${bin}/${tokName}")" `,
            };
          };
          // Remote account key distribution: the env-pair channel is OUT for
          // secrets (the inner command is argv on BOTH sides — local ssh proc +
          // remote sh -lc — and /proc/cmdline is world-readable). Instead ship
          // the key over ssh STDIN into a 0600 file on the remote, and have the
          // inner command reference it via $(cat …) — the command text carries
          // only the PATH, never the value. Returns the raw (pre-quoted) env
          // assignment to splice into the inner command, or '' when no account.
          // Throws on write failure — silently billing the wrong account is
          // worse than failing the create.
          const remoteAccountEnv = (h) => {
            if (!spawnAccount) return '';
            // API key: ship the single value to a 0600 file, reference via a
            // shell prefix assignment (the VALUE never enters any argv). API
            // keys are the SANCTIONED programmatic path — always shippable.
            if (spawnAccount.secret) {
              const kf = `$HOME/.vibespace/${spawnAccount.id}.key`; // id shape acct-/sub-<hex>, metachar-free
              execFileSync('ssh', [...hosts.sshArgs(h), '--', `umask 077; mkdir -p "$HOME/.vibespace"; cat > "${kf}"`],
                { input: spawnAccount.secret.value, timeout: 15000 });
              return `${spawnAccount.secret.var}="$(cat "${kf}")" `;
            }
            // §ban-safety GATE: shipping a SUBSCRIPTION's OAuth creds to a remote
            // host means that subscription token is live from a (likely
            // datacenter) IP different from where you normally use it — an
            // impossible-travel / datacenter-ASN signal that helped get a Max
            // account banned. OFF BY DEFAULT: the user must instead LOG IN ON
            // THE HOST (the host's own login bills there). Opt in via
            // Settings → accounts.shipSubscriptionToRemote only if you accept
            // the risk. API keys (above) are unaffected.
            let allowSubRemote = false;
            try { allowSubRemote = !!serverSetting('accounts.shipSubscriptionToRemote'); } catch {}
            if (!allowSubRemote) {
              throw new Error('shipping a subscription login to a remote host is disabled (it risks the account — a subscription token from a datacenter IP looks like abuse). Log in on the host instead (Manage agents → select the host → "Log in on host…"), or use an API-key account. To override: Settings → "Ship subscription logins to remote hosts".');
            }
            // Subscription (Claude securestorage dir / Codex CODEX_HOME): ship
            // the account's creds DIR to the host over an ssh-stdin tar stream
            // (channel-encrypted, lands in a 0700 dir), symlink the shared
            // subdirs, and point the env var at the remote copy. NEWEST WINS
            // per file (tar --keep-newer-files, GNU; verified exit 0): OAuth
            // refresh tokens ROTATE, so after a remote session refreshes, the
            // HOST copy holds the live token — blindly re-shipping the stale
            // local copy would invalid_grant the account there. No rm -rf
            // either: a concurrent session of the same account on the same
            // host must not have its creds dir yanked mid-run.
            const rc = spawnAccount.remoteCreds;
            if (!rc) throw new Error('this account cannot run on a remote host');
            const files = (rc.files || []).filter(f => { try { return fs.statSync(path.join(rc.srcDir, f)).isFile(); } catch { return false; } });
            if (!files.length) throw new Error('account creds unreadable');
            const tar = execFileSync('tar', ['-c', '-C', rc.srcDir, ...files], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
            const rdir = `$HOME/.vibespace/${rc.dirName}`; // dirName = subs/<id> | codex-subs/<id>, metachar-free
            const links = Object.entries(rc.symlinks || {}).map(([n, tgt]) => `ln -sfn ${tgt} "${rdir}/${n}"`);
            // Poison-heal: a remote primary creds file that LOST its validity
            // marker (a Console /login inside a remote session wipes it to {}
            // with a fresh mtime) would win newest-wins forever — delete it
            // first so the valid local copy restores it. Known residual risk:
            // clock skew between machines can misorder newest-wins when both
            // sides refreshed within the skew window (NTP makes this ~ms).
            const heal = rc.probe
              ? [`if [ -f "${rdir}/${rc.probe.file}" ] && ! grep -qE '${rc.probe.marker}' "${rdir}/${rc.probe.file}"; then rm -f "${rdir}/${rc.probe.file}"; fi`]
              : [];
            // GNU-tar-only flag; no `|| tar -x` fallback — the first tar already
            // consumed the ssh stdin stream, a fallback would extract nothing
            // and silently spawn with missing creds. Non-GNU hosts fail LOUD.
            const script = [`umask 077`, `mkdir -p "${rdir}"`, ...heal, `tar -x --keep-newer-files -C "${rdir}"`, ...(rc.ensureTargets || []), ...links].join('; ');
            execFileSync('ssh', [...hosts.sshArgs(h), '--', script], { input: tar, timeout: 20000 });
            return `${rc.envVar}="${rdir}" `;
          };
          if (data.hostId && hosts && sessionMode === 'terminal') {
            let h;
            try { h = hosts.get(data.hostId); }
            catch { ws.send(JSON.stringify({ type: 'error', message: 'Unknown host: ' + data.hostId })); return; }
            const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
            // TERMINAL-on-dial (B-0d70): the device runs claude/codex in a
            // node-pty via the daemon's open-session, proxied through the
            // DialSessionBridge (pty mode). Locally it's dtach → pty-wrapper →
            // vibespace-agentd-attach (pty/raw mode) — the exact `ssh -t`
            // shape, but over the dialed link. Live pty (no offset/replay);
            // pty-wrapper's REMOTE_RETRY respawns the attach on a link drop.
            if (h.transport === 'dial') {
              if (!dialBridge || !agentdRemote) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, sessionId: id, message: 'dial sessions not wired on this server' })); return; }
              // Account billing on a device: API keys ship (below); a
              // SUBSCRIPTION account can't be honored on a device (OAuth ship
              // is off by default, §ban-safety) — fail LOUD, don't silently
              // bill the device's own login (mirror the chat-dial guard;
              // review: this branch used to ignore an explicit subscription).
              if (spawnAccount && !spawnAccount.secret) {
                let allowSub = false; try { allowSub = !!serverSetting('accounts.shipSubscriptionToRemote'); } catch {}
                ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, sessionId: id, message: allowSub
                  ? 'subscription creds shipping to dial devices is not implemented — use an API-key account, or log in on the device'
                  : 'the selected account is a subscription login — shipping it to a device is disabled (§ban-safety). Use an API-key account, or log in on the device itself.' }));
                return;
              }
              // shell terminal: run the DEVICE user's own login shell, not the
              // basename of OUR spawn command (the pod's $SHELL is bash — a Mac
              // zsh user got bash + Apple's chsh nag, real report). $SHELL may
              // be absent under launchd → fall back to the account's UserShell
              // (macOS dscl) → zsh → bash. S0 is resolved in the shellCmd
              // preamble; rcmd0 just execs it.
              const rcmd0 = backend === 'shell' ? '"$S0"' : (spawnCmd.includes('/') ? path.basename(spawnCmd) : spawnCmd);
              const shellResolve = backend === 'shell'
                ? `S0="\${SHELL:-}"; [ -n "$S0" ] || S0="$(dscl . -read ~/ UserShell 2>/dev/null | awk '{print \$2}')"; [ -n "$S0" ] || S0="$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f7)"; [ -x "$S0" ] || S0="$(command -v zsh || command -v bash || echo sh)"; `
                : '';
              try {
                const bridgePort = await dialBridge.ensure({ sid: id, deviceId: h.deviceId });
                // A tool/tunnel setup error degrades to bare env, EXCEPT when
                // an API key must be placed — a swallowed failure would run the
                // session on the device's own login = wrong billing (review).
                const da = await deviceAgentSetup(h, id).catch((e) => {
                  if (spawnAccount?.secret) throw e;
                  console.warn('[dial] agent setup degraded:', e.message); return { envPairs: [], tokenAssign: '' };
                });
                // tools PATH only while integrated — leftover tools from an
                // earlier ON spawn must not be name-resolvable in a pristine one
                const shellCmd = `cd ${shq(cwd)} 2>/dev/null; export PATH="$HOME/.local/bin:${integrationOn ? '$HOME/.vibespace/bin:' : ''}$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; ${shellResolve}${da.tokenAssign}exec env `
                  + [...da.envPairs.map(shq), ...spawnEnvPairs.map(shq)].join(' ')
                  + ' ' + [rcmd0, ...(backend === 'shell' ? ['-l'] : spawnArgs.map(shq))].join(' ');
                const cfg = {
                  tcp: { port: bridgePort },
                  hostToken: agentdRemote.agentdHostToken('dial-' + h.deviceId),
                  sid: id,
                  version: require('../package.json').version,
                  pty: { cmd: 'sh', args: ['-lc', shellCmd], cwd, env: { TERM: 'xterm-256color', COLORTERM: 'truecolor' }, cols: 120, rows: 30 },
                };
                ensureDir(agentdRemote.agentdDir);
                const cfgFile = path.join(agentdRemote.agentdDir, 'session-' + id + '.json');
                fs.writeFileSync(cfgFile, JSON.stringify(cfg), { mode: 0o600 });
                spawnCmd = NODE_CMD;
                spawnArgs = [agentdRemote.attachBundle, '--config', cfgFile];
                spawnEnvPairs = [];
                spawnCwd = os.homedir();
                session.host = h.id;
                session.hostName = h.name;
                session._agentdSession = true;
                session._dialDeviceId = h.deviceId;
                session._bridgePort = bridgePort;
                session._agentdCfgFile = cfgFile;
              } catch (e) {
                ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, sessionId: id, message: `dial terminal failed: ${e.message} (is the device online?)` })); return;
              }
              // fall through to the shared pty-wrapper/dtach spawn tail
            } else {
            // locally-resolved binary paths mean nothing on the remote
            const rcmd = spawnCmd.includes('/') ? path.basename(spawnCmd) : spawnCmd;
            const ra = remoteAgentSetup();
            let acctEnv = '';
            try { acctEnv = remoteAccountEnv(h); }
            catch (e) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: 'Failed to place the account key on ' + h.name + ': ' + e.message })); return; }
            // acctEnv rides as a SHELL PREFIX ASSIGNMENT before exec — the shell
            // setenvs it internally, so the VALUE never appears in any argv
            // (an `env KEY=$(cat …)` argument would expand into env's argv).
            const inner = ra.prelude + `cd ${shq(cwd)} 2>/dev/null; ` + ra.tokenAssign + acctEnv + `exec env TERM=xterm-256color COLORTERM=truecolor `
              + [...ra.envPairs.map(shq), ...spawnEnvPairs.map(shq), rcmd, ...spawnArgs.map(shq)].join(' ');
            spawnCmd = 'ssh';
            spawnArgs = [...hosts.sshArgs(h, { tty: true, reverse: ra.reverse }), '--', `dtach -A /tmp/vs-${id} -r winch sh -lc ${shq(inner)}`];
            spawnEnvPairs = [];
            spawnCwd = os.homedir(); // remote cwd rides inside the ssh command
            session.host = h.id;
            session.hostName = h.name;
            }
          } else if (data.hostId && hosts && sessionMode === 'chat') {
            // 2.139.0 (B-0588): codex remote chat rides the SAME keeper —
            // it's a content-agnostic byte pipe, so app-server JSON-RPC
            // (bidirectional incl. approvals) replays fine by byte offset.
            // Claude's stream-json flags are claude-only (they killed codex
            // spawns opaquely pre-2.129.1 — keep them gated).
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
            if (backend !== 'codex') {
              for (const fl of [['--output-format', 'stream-json'], ['--input-format', 'stream-json'], ['--verbose'], ['--permission-prompt-tool', 'stdio']]) {
                if (!rargs.includes(fl[0])) rargs.push(...fl);
              }
            }
            if (h.transport === 'dial') {
              // Graduation B.2/B.3: the session runs as a persistent PIPE
              // SESSION in the DIALED-IN device's daemon; the attach child
              // reaches it through the server's loopback mux proxy
              // (DialSessionBridge) — the dial link lives inside this process,
              // unreachable to a child directly. B.3 ports the ssh-coupled
              // agent prelude to DEVICE FS OPS: tools + token via fsWrite, the
              // VIBESPACE_API back-tunnel via reverseForward, hook registration
              // via runCmd — so vibespace-status/task/ask work on the device.
              if (!dialBridge || !agentdRemote) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: 'dial sessions not wired on this server' })); return; }
              // Codex CHAT over a byte pipe is not wired (B-0588, same as the
              // ssh path): the codex-chat-wrapper speaks JSON-RPC to a local
              // codex app-server, not to the pipe-relayed device one. Fail
              // LOUD rather than blank. Codex TERMINAL on dial works (TUI over
              // the pty path); claude chat works.
              if (backend === 'codex') { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, sessionId: id, message: `Codex CHAT on a paired device isn't wired yet — use TERMINAL mode for codex on "${h.name}", or codex chat on an ssh host. Claude chat works on devices.` })); return; }
              // A selected SUBSCRIPTION account can't be honored on a device
              // (OAuth shipping is off by default — §ban-safety) — fail loudly
              // rather than silently billing the device's own login (the ssh
              // path fails the same way). API keys are shippable (below).
              if (spawnAccount && !spawnAccount.secret) {
                let allowSub = false; try { allowSub = !!serverSetting('accounts.shipSubscriptionToRemote'); } catch {}
                ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: allowSub
                  ? 'subscription creds shipping to dial devices is not implemented — use an API-key account, or log in on the device'
                  : 'the selected account is a subscription login — shipping it to a device is disabled (§ban-safety). Use an API-key account, or log in on the device itself.' }));
                return;
              }
              try {
                const bridgePort = await dialBridge.ensure({ sid: id, deviceId: h.deviceId });
                // Tool/token/tunnel setup degrades to bare env on error (session
                // still runs); the API-key ship inside is NOT degradable — a
                // write failure throws out of the try and fails the create.
                const da = await deviceAgentSetup(h, id).catch((e) => {
                  if (spawnAccount?.secret) throw e; // wrong billing must fail, not silently degrade
                  console.warn('[dial] agent setup degraded:', e.message); return { envPairs: [], tokenAssign: '' };
                });
                // tools PATH only while integrated (see the pty branch note)
                const shellCmd = `cd ${shq(cwd)} 2>/dev/null; export PATH="$HOME/.local/bin:${integrationOn ? '$HOME/.vibespace/bin:' : ''}$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; ${da.tokenAssign}exec env `
                  + [...da.envPairs.map(shq), ...spawnEnvPairs.map(shq)].join(' ')
                  + ' ' + [rcmd, ...rargs.map(shq)].join(' ');
                const cfg = {
                  tcp: { port: bridgePort },
                  hostToken: agentdRemote.agentdHostToken('dial-' + h.deviceId),
                  sid: id,
                  version: require('../package.json').version,
                  // cwd runs ON THE DEVICE — send the resolved device cwd, not
                  // this server's homedir (a path absent on the device). The
                  // daemon also falls back to HOME if it still doesn't exist.
                  spawn: { cmd: 'sh', args: ['-lc', shellCmd], cwd },
                };
                ensureDir(agentdRemote.agentdDir);
                const cfgFile = path.join(agentdRemote.agentdDir, 'session-' + id + '.json');
                fs.writeFileSync(cfgFile, JSON.stringify(cfg), { mode: 0o600 });
                spawnCmd = NODE_CMD;
                spawnArgs = [agentdRemote.attachBundle, '--config', cfgFile, '--offset', '__VS_OFFSET__'];
                spawnEnvPairs = [];
                spawnCwd = os.homedir();
                session.host = h.id;
                session.hostName = h.name;
                session._agentdSession = true;
                session._dialDeviceId = h.deviceId;
                session._bridgePort = bridgePort;
                session._agentdCfgFile = cfgFile;
              } catch (e) {
                ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: `dial session failed: ${e.message} (is the device online?)` })); return;
              }
            } else {
            const ra = remoteAgentSetup();
            let acctEnv = '';
            try { acctEnv = remoteAccountEnv(h); }
            catch (e) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: 'Failed to place the account key on ' + h.name + ': ' + e.message })); return; }
            // acctEnv = shell prefix assignment (see the terminal branch note)
            // 2.124.0: claude no longer hangs directly off the ssh pipe — it
            // runs DETACHED on the host under vibespace-remote-keeper (buffer
            // file + unix-socket stdin), so an ssh drop kills only the pipe.
            // __VS_OFFSET__ is substituted by the LOCAL chat-wrapper at every
            // (re)spawn with the byte offset it has consumed — the keeper
            // replays exactly the missed bytes. env pairs precede the keeper
            // so claude (spawned by the keeper daemon) inherits them.
            // ── B-4058 pre-spawn orphan cleanup (resume-with-respawn only) ──
            // A pod rebuild loses local state; a later plain resume used to
            // race a still-alive orphan claude holding the SAME claude session
            // id (double JSONL writers, 'resume did nothing', keeper remnants
            // that fooled diagnosis). Before respawning with --resume: SIGTERM
            // any lock-holding claude for this session id (cmdline-verified)
            // and stop any live keeper session referencing it. Never runs for
            // keeper-ATTACH (data.keeperSid — we adopt, not respawn).
            if (data.resume && data.resumeId && !data.keeperSid && /^[\w-]+$/.test(data.resumeId)) {
              try {
                // ROOT-CAUSE writer sweep (mechanism-agnostic): the ONE thing
                // that must be true before a resume is that NO other process is
                // still writing this conversation's transcript — else we get
                // multiple concurrent writers on one JSONL ("resume did
                // nothing / session ends"; real incident with agentd.remote
                // Sessions, whose setsid-detached claude survives a local pod
                // rebuild that the sidebar-driven cold resume then races). The
                // fd scan kills ANY claude holding <RID>.jsonl open regardless
                // of how it was spawned (bare / keeper / agentd pipe-session) —
                // it subsumes the id-lock grep (a --resumed claude's lock
                // carries a NEW session id, so grepping the lock for RID missed
                // it) and the agentd case the keeper-only stop below never
                // reached. The keeper stop still runs to clean the keeper's own
                // run-file bookkeeping.
                const cleanScript = `RID=${shq(data.resumeId)}
for pdir in /proc/[0-9]*; do
  ls -l "$pdir/fd" 2>/dev/null | grep -q "/$RID.jsonl" || continue
  pid=$(basename "$pdir")
  case "$(tr '\\0' ' ' < "$pdir/cmdline" 2>/dev/null)" in *claude*) kill -TERM "$pid" 2>/dev/null;; esac
done
find "$HOME/.claude/sessions" -maxdepth 1 -name '*.json' 2>/dev/null | while read -r f; do
  pid=$(basename "$f" .json)
  grep -q "\"sessionId\":\"$RID\"" "$f" 2>/dev/null || continue
  kill -0 "$pid" 2>/dev/null || continue
  case "$(tr '\\0' ' ' < /proc/$pid/cmdline 2>/dev/null)" in *claude*) kill -TERM "$pid" 2>/dev/null;; esac
done
find "$HOME/.vibespace/run" -maxdepth 1 -name '*.json' 2>/dev/null | while read -r kf; do
  grep -q "$RID" "$kf" 2>/dev/null || continue
  grep -q '"exited"' "$kf" 2>/dev/null && continue
  node "$HOME/.vibespace/bin/vibespace-remote-keeper" stop "$(basename "$kf" .json)" >/dev/null 2>&1 || true
done`;
                execFileSync('ssh', [...hosts.sshArgs(h, { multiplex: true }), '--', cleanScript], { timeout: 20000, stdio: 'ignore' });
                hosts.invalidateDiscovery(h.id);
              } catch (e) { console.warn('[remote] pre-resume cleanup failed (continuing):', e.message); }
            }
            // keeper-ATTACH (B-4058): the card carried a live keeper sid —
            // reattach to the surviving remote claude from byte 0 (full
            // replay rebuilds the view) instead of killing + respawning.
            // No command after the sid: keeper adopts (takeover if the
            // daemon died) or drains/synthesizes an exit — never spawns.
            const keeperSid = data.keeperSid && /^[\w-]+$/.test(data.keeperSid) ? data.keeperSid : null;
            session.keeperSid = keeperSid || id;
            const runTail = keeperSid
              ? ` node "$HOME/.vibespace/bin/vibespace-remote-keeper" run ${shq(keeperSid)} __VS_OFFSET__`
              : ` node "$HOME/.vibespace/bin/vibespace-remote-keeper" run ${shq(id)} __VS_OFFSET__ -- ` + [rcmd, ...rargs.map(shq)].join(' ');
            // ── The session runs as a persistent PIPE SESSION inside the
            // standing remote device daemon; the local chat-wrapper spawns the
            // agentd-attach bridge (SAME contract as `keeper run`: raw bytes +
            // __VS_OFFSET__ + sentinel), so the wrapper machinery is
            // untouched. GRADUATED (flags removed): keeper survives only as
            // the provisioning-failure fallback + for pre-existing keeper
            // sessions (keeperSid resumes). ──
            let agentdMode = !!agentdRemote;
            if (agentdMode && !keeperSid) {
              try {
                await agentdRemote.ensureAgentdOnHost(h.id);
                // the child claude runs under `sh -lc` on the host so the
                // existing shell-expanded prefixes (token file reads, $HOME
                // account paths) keep their exact semantics
                const shellCmd = ra.prelude + `cd ${shq(cwd)} 2>/dev/null; export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; ` + ra.tokenAssign + acctEnv + `exec env `
                  + [...ra.envPairs.map(shq), ...spawnEnvPairs.map(shq)].join(' ')
                  + ' ' + [rcmd, ...rargs.map(shq)].join(' ');
                const remoteCmd = `export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; exec node "$HOME/.vibespace/agentd/current/agentd.js" --stdio`;
                const cfg = {
                  sshBin: 'ssh',
                  sshArgs: hosts.sshArgs(h, { reverse: ra.reverse }),
                  remoteCmd,
                  hostToken: agentdRemote.agentdHostToken(h.id),
                  sid: id,
                  version: require('../package.json').version,
                  spawn: { cmd: 'sh', args: ['-lc', shellCmd], cwd: os.homedir() },
                };
                ensureDir(agentdRemote.agentdDir);
                const cfgFile = path.join(agentdRemote.agentdDir, 'session-' + id + '.json');
                fs.writeFileSync(cfgFile, JSON.stringify(cfg), { mode: 0o600 });
                spawnCmd = NODE_CMD;
                spawnArgs = [agentdRemote.attachBundle, '--config', cfgFile, '--offset', '__VS_OFFSET__'];
                spawnEnvPairs = [];
                spawnCwd = os.homedir();
                session.host = h.id;
                session.hostName = h.name;
                session._agentdSession = true;
                session._agentdCfgFile = cfgFile;
              } catch (e) {
                console.warn('[device] remote provisioning failed — keeper fallback:', e.message);
                agentdMode = false;
              }
            }
            if (!agentdMode || keeperSid) {
              const inner = ra.prelude + `cd ${shq(cwd)} 2>/dev/null; export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; ` + ra.tokenAssign + acctEnv + `exec env `
                + [...ra.envPairs.map(shq), ...spawnEnvPairs.map(shq)].join(' ')
                + runTail;
              spawnCmd = 'ssh';
              spawnArgs = [...hosts.sshArgs(h, { reverse: ra.reverse }), '-T', '--', inner];
              spawnEnvPairs = [];
              spawnCwd = os.homedir();
              session.host = h.id;
              session.hostName = h.name;
            }
            } // ← end of the non-dial (ssh) path
          }
          // PASSIVE usage capture (§ban-safety): for LOCAL CLAUDE TERMINAL
          // sessions (a statusLine only renders in the TUI — chat/stream-json
          // has none), inject a statusLine command that harvests the CLI's OWN
          // 5h/7d rate_limits into data/usage-cache/. This is why VibeSpace
          // makes NO background /api/oauth/usage calls with subscription
          // tokens. Merged into any existing --settings (e.g. ultracode) so
          // there's ONE flag. The claude gate is load-bearing: only the claude
          // CLI understands --settings — appending it to `zsh -l` (shell
          // terminals, incl. the Manage-Agents update/login helpers) or codex
          // made them exit instantly ("terminated").
          const usageEnvPairs = [];
          if (integrationOn && backend === 'claude' && sessionMode === 'terminal' && !data.hostId && USAGE_STATUSLINE_CMD) {
            try {
              let settingsObj = {};
              const si = spawnArgs.indexOf('--settings');
              if (si >= 0 && spawnArgs[si + 1]) { try { settingsObj = JSON.parse(spawnArgs[si + 1]) || {}; } catch {} }
              settingsObj.statusLine = { type: 'command', command: USAGE_STATUSLINE_CMD, padding: 0 };
              const sjson = JSON.stringify(settingsObj);
              if (si >= 0) spawnArgs[si + 1] = sjson; else spawnArgs = [...spawnArgs, '--settings', sjson];
              const acctKey = spawnAccount?.id || '__global__';
              const orig = (userStatuslineCmd && userStatuslineCmd()) || '';
              usageEnvPairs.push(`VIBESPACE_ACCOUNT_KEY=${acctKey}`);
              if (orig) usageEnvPairs.push(`VIBESPACE_ORIG_STATUSLINE=${orig}`);
            } catch {}
          }
          let createPty;
          try {
            createPty = pty.spawn(DTACH_CMD, ['-c', socketPath, '-E', '-r', 'none',
              NODE_CMD, wrapper,
              bufFile, metaFileW,
              ENV_CMD, `EDITOR=${EDITOR_CMD}`, `CLAUDE_WEBUI_PORT=${PORT}`, `CLAUDE_WEBUI_SESSION_ID=${id}`,
              ...usageEnvPairs,
              // Agent-facing env: the vibespace tools (data/bin on PATH)
              // authenticate with the per-session token; Task Group belonging is
              // resolved server-side from that token (no task id in the env).
              // Integration OFF strips VIBESPACE_API + the data/bin PATH prefix
              // (the sane-PATH fallback itself stays — the systemd-minimal-env
              // incident class); the TOKEN stays deliberately: data/bin/code
              // (Ctrl+G, invoked via the absolute EDITOR path) authenticates
              // with it, it's never model-visible, and every consumer (hook,
              // tools, codex wrapper) guards on api AND token so token-alone is
              // inert. The CLI itself never reads either var.
              ...(integrationOn ? [`VIBESPACE_API=http://127.0.0.1:${PORT}`] : []),
              `PATH=${integrationOn ? path.dirname(EDITOR_CMD) + ':' : ''}${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`,
              `VIBESPACE_SESSION_TOKEN=${session.agentToken}`,
              // Probed working X display (see server.js detectXDisplay) — the CLI
              // reads the clipboard itself on Ctrl+V, so it needs BOTH vars
              `DISPLAY=${X_ENV?.DISPLAY || process.env.DISPLAY || ''}`,
              ...(X_ENV?.XAUTHORITY ? [`XAUTHORITY=${X_ENV.XAUTHORITY}`] : []),
              `TERM=xterm-256color`, `COLORTERM=truecolor`,
              ...spawnEnvPairs,
              spawnCmd, ...spawnArgs,
            ], {
              name: 'xterm-256color', cols: data.cols || 120, rows: data.rows || 30,
              cwd: spawnCwd, env: (() => {
                const env = {
                  ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor',
                  // The WRAPPER (always local, even for remote sessions) needs the
                  // agent API in its OWN env: the codex-chat-wrapper injects task
                  // context via thread/inject_items by calling /api/agent/*. The
                  // spawned CLI gets these separately via the `env VAR=val` argv
                  // prefix; the wrapper doesn't, hence this. Always the LOCAL port.
                  // Integration OFF drops VIBESPACE_API (token kept — see the
                  // argv-prefix note above; wrapper guards require api AND token).
                  ...(integrationOn ? { VIBESPACE_API: `http://127.0.0.1:${PORT}` } : {}),
                  VIBESPACE_SESSION_TOKEN: session.agentToken,
                  ...Object.fromEntries(Object.entries(sessionSpec.env || {}).map(([k, v]) => [k, v == null ? '' : String(v)])),
                  // Remote resilience (2.124.0): tell the wrapper HOW to
                  // survive ssh death — chat reconnects the keeper pipe with
                  // an offset; terminal respawns ssh (remote dtach -A reattaches).
                  ...(session.host ? (sessionMode === 'chat' ? { VIBESPACE_REMOTE_SID: id } : { VIBESPACE_REMOTE_RETRY: '1' }) : {}),
                };
                // Billing identity: the key rides the PROCESS-ENV channel only
                // (dtach → wrapper `env: process.env` → CLI), never argv — argv
                // is world-readable in /proc/cmdline. No account → explicitly
                // strip any ambient key so the CLI uses its global login.
                delete env.ANTHROPIC_API_KEY;
                delete env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
                // Claude API key → ANTHROPIC_API_KEY; Claude subscription → its
                // own CLAUDE_SECURESTORAGE_CONFIG_DIR (relocates ONLY the creds
                // store, transcripts stay shared); Codex subscription → its own
                // CODEX_HOME (auth isolated, sessions/config symlinked shared).
                // All ride process-env, never argv. No account → the CLI's env
                // is left as-is (CODEX_HOME inherited from the server, if any).
                if (spawnAccount?.localEnv) Object.assign(env, spawnAccount.localEnv);
                return env;
              })(),
            });
          } catch (err) {
            ws.send(JSON.stringify({ type: 'error', message: `Failed to spawn session: ${err.message}\ndtach=${DTACH_CMD} node=${NODE_CMD} env=${ENV_CMD} cwd=${cwd}` }));
            return;
          }
          setupSessionPty(session, id, createPty);

          activeSessions.set(id, session);
          attachedSessions.add(id);
          // Remote session: push its groups' context folders to the host now
          // (the 60s timer + prompt-time trigger keep them fresh afterwards);
          // bust the host's discovery cache so the sidebar's remote zone sees
          // the new session on the next poll instead of after the TTL.
          if (session.host) {
            if (integrationOn) scheduleCtxSync?.(session, id); // ctx-folder sync is task-context machinery
            setTimeout(() => { try { hosts?.invalidateDiscovery?.(session.host); } catch {} }, 3000);
          }

          writeSessionMeta(sockName, {
            name: session.name,
            cwd,
            host: session.host || null,
            hostName: session.hostName || null,
            keeperSid: session.keeperSid || null,
            dialDeviceId: session._dialDeviceId || null,
            bridgePort: session._bridgePort || null,
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
            taskId: session._initialGroupId || null, // group spawned into (meta key kept for back-compat)
            accountId: session._accountId || null, // billing identity (badge restore across server restarts)
            authAtSpawn: session._authAtSpawn || null,
            createdAt: session.createdAt,
            webuiSessionId: id,
            mode: sessionMode,
          });

          // Capture claudeSessionId from lock file for new (non-resume) Claude sessions.
          // LOCAL sessions only (2.156.2, trace finding): a REMOTE session's
          // claude runs on the host — scanning the LOCAL lock dir here could
          // FALSE-MATCH a same-cwd local session and adopt the WRONG id.
          // Remote sessions get their id from the stream parser's first-capture
          // (2.156.1), which every stream-json line feeds.
          if (backend === 'claude' && !session.claudeSessionId && !session.host) {
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
                    // MERGE into the existing meta (spread base) — a hardcoded
                    // field list here silently dropped later-added keys
                    // (agentToken, taskId, accountId) on id capture.
                    writeSessionMeta(sockName, {
                      ...(readSessionMeta(sockName) || {}),
                      backendSessionId: session.backendSessionId,
                      claudeSessionId: session.claudeSessionId,
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
                  ...(readSessionMeta(sockName) || {}), // preserve keys not re-listed (agentToken/taskId/accountId)
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
          if (!session?.pty) break;
          // Terminal query-response arbitration: with dtach every attached
          // browser client is a full terminal emulator, so an app's query
          // (\e[6n cursor pos, \e]11;? bg color, DA…) is answered by EVERY
          // client — the app consumes one answer and the tty ECHOES the extras
          // as literal "^[]11;rgb:…^[[3;1R" junk at the prompt (real report,
          // 2 clients attached). Responses are pure well-known sequences that
          // never share a chunk with typed input: forward them only from ONE
          // designated client (the size owner, else the oldest attached).
          // Known collision (accepted): modified-F3 is \e[1;2R = CPR shape —
          // a non-owner client's Shift+F3 in a multi-client session is eaten.
          const chunk = data.data;
          if (typeof chunk === 'string' && session.clients?.size > 1
              && chunk.includes('\x1b') && !chunk.replace(TERM_QUERY_RESP_RE, '')) {
            const owner = (session._sizeOwnerWs && session.clients.has(session._sizeOwnerWs))
              ? session._sizeOwnerWs : session.clients.keys().next().value;
            if (owner && owner !== ws) break;
          }
          session.pty.write(chunk);
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
              ...(readSessionMeta(session.sockName) || {}), // preserve keys not re-listed (agentToken/taskId/accountId)
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
              const subDirs = [path.join(projectsDir, projDir, claudeId, 'subagents')];
              try { for (const dir of fs.readdirSync(projectsDir)) { const fp = path.join(projectsDir, dir, claudeId, 'subagents'); if (!subDirs.includes(fp)) subDirs.push(fp); } } catch {}
              // Direct subagent files first, then workflow-nested ones
              // (subagents/workflows/wf_*/agent-<id>.jsonl) so a workflow phase's
              // agent opens in this same viewer.
              const fileCandidates = [];
              for (const subDir of subDirs) {
                fileCandidates.push(path.join(subDir, `agent-${agentId}.jsonl`));
                let wfRuns = []; try { wfRuns = fs.readdirSync(path.join(subDir, 'workflows')); } catch {}
                for (const wf of wfRuns) fileCandidates.push(path.join(subDir, 'workflows', wf, `agent-${agentId}.jsonl`));
              }
              for (const fp of fileCandidates) {
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
                const opHandlers = [...session._normalizer.listeners]; // carry over ALL subscribers, not just the first
                session._normalizer = createMessageManager(session.backend || 'claude', data.sessionId);
                session._normEpoch = Date.now();
                for (const h of opHandlers) session._normalizer.onOp(h);
                session._normalizer.convertHistory(sm.raw());
                // Flag AFTER the rebuild succeeds — set-before-work turned one
                // throwing record into a permanently truncated session view
                // (the re-attach saw the flag and never rebuilt again).
                session._historyLoaded = true;
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
                remoteState: session._remoteState || (session._bareRemote ? { state: 'unprotected' } : null),
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
          // Stale-serverId robustness (2.179.0): after a server restart the
          // client can hold an OLD webui id — a kill that silently no-ops
          // leaves the session alive, and the follow-up resume (billing
          // switch) then double-writes the same claude id (walter's duplicate
          // incident). Fall back to resolving by the conversation id.
          if (!activeSessions.has(data.sessionId) && data.backendSessionId) {
            for (const [eid, es] of activeSessions) {
              if ((es.claudeSessionId || es.backendSessionId) === data.backendSessionId) { data.sessionId = eid; break; }
            }
          }
          { const ks = activeSessions.get(data.sessionId); if (ks && ks._bridgePort) { try { dialBridge?.close(data.sessionId); } catch { } if (ks._dialDeviceId && ks._dialReversePort) { hosts.device(ks.host).then((dm) => dm.reverseUnforward(ks._dialReversePort)).catch(() => {}); } } }
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
            // Tell every attached client the session ended (windows flip to the
            // read-only view). This must happen HERE, deterministically: we
            // delete the session from activeSessions right below, and the pty's
            // async onExit starts with `if (!activeSessions.has(id)) return`
            // (the 46de4ec stale-PTY guard) — so relying on onExit to emit
            // Teardown watchers/normalizers HERE: onExit early-returns once
            // the session leaves activeSessions (stale-PTY guard), so killed
            // sessions leaked every subagent fs.watch + retry timer +
            // normalizer + buffered subagent messages (audit round-2, high).
            if (session.subagentWatchers) {
              for (const [, entry] of session.subagentWatchers) {
                try { entry.watcher?.close(); } catch {}
                if (entry.retry) clearTimeout(entry.retry);
              }
              session.subagentWatchers.clear();
            }
            session._subNormalizers?.clear?.();
            if (session._normalizer) session._normalizer.listeners.length = 0;
            session.subagentBuffers = null;
            session.subagentEmittedUuids = null;
            // Remote CHAT sessions (2.124.0): claude runs DETACHED on the host
            // under vibespace-remote-keeper — killing the local pipeline no
            // longer kills it. Stop it remotely (best-effort, async) and bust
            // the host's discovery cache so the sidebar updates on next poll.
            if (session.host && hosts) {
              try {
                const h = hosts.get(session.host);
                if (h.transport === 'dial') {
                  // Dial device: the ssh teardown below throws for dial (no ssh
                  // fields) and used to be SWALLOWED — the device-side claude
                  // survived every terminate and a later resume raced it
                  // (double JSONL writers, the B-4058 class). Kill the daemon
                  // pipe session + drop the agent token over the device link.
                  if (session.mode === 'chat') {
                    const sidSafe = String(data.sessionId).replace(/[^\w-]/g, '');
                    hosts.device(session.host).then(async (dm) => {
                      try { await dm.killPipeSession(sidSafe); } catch {}
                      try { await dm.runCmd('sh', ['-c', `rm -f "$HOME/.vibespace/bin/.tok-${sidSafe}"`], { timeoutMs: 10000 }); } catch {}
                      try { hosts.invalidateDiscovery(session.host); } catch {}
                    }).catch(() => {});
                  } else {
                    setTimeout(() => { try { hosts.invalidateDiscovery(session.host); } catch {} }, 2000);
                  }
                } else if (session.mode === 'chat') {
                  execFile('ssh', [...hosts.sshArgs(h), '--', `${session._agentdSession
                    ? `M="$HOME/.vibespace/agentd/state/sessions/${data.sessionId}.json"; P=$(grep -o '"childPid":[0-9]*' "$M" 2>/dev/null | cut -d: -f2); [ -n "$P" ] && kill $P 2>/dev/null; sleep 2; [ -n "$P" ] && kill -9 $P 2>/dev/null`
                    : `node "$HOME/.vibespace/bin/vibespace-remote-keeper" stop ${session.keeperSid || data.sessionId}`} 2>/dev/null || true; rm -f "$HOME/.vibespace/bin/.tok-${data.sessionId}"`],
                    { timeout: 15000 }, () => { try { hosts.invalidateDiscovery(session.host); } catch {} });
                } else {
                  setTimeout(() => { try { hosts.invalidateDiscovery(session.host); } catch {} }, 2000);
                }
              } catch {}
            }
            // 'exited' silently broke terminate-from-sidebar.
            broadcastToSession(session, data.sessionId, { type: 'exited', sessionId: data.sessionId, reason: 'terminated' });
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
