/**
 * THE SSH SPAWN LADDER (decoupling wave 2b, lane dc-seams-server, 2026-10-05) — one member of the
 * spawn-ladder registry (src/spawn/index.js `spawnFor(host)`; docs/design-cs-unification.md
 * "Remaining 2"). A host record that names no `transport` (ssh hosts predate the field):
 * the agent tools + reverse tunnel (remoteAgentSetup), the account key over ssh stdin
 * (remoteAccountEnv), the `ssh -t … dtach` terminal line and the chat pipe (agentd over
 * `ssh … --stdio`, the keeper as the provisioning fallback).
 * MOVED VERBATIM out of src/ws-create.js's createBody (the lines below keep their indentation there,
 * so `git diff --color-moved` / `git blame -C` show a move): the closures it captured arrive as the
 * ladder context `c` (ws-create `ladderCtx`), the four spawn-line `let`s it assigned are its answer.
 * A ladder ANSWERS {spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd} for ws-create's shared dtach /
 * pipe spawn tail, or undefined once it has answered the socket itself (the old `return;` that
 * ended the create — ws-create returns on it). No `break;` crosses the seam (a stray one would be a
 * SyntaxError here, not a silent change of the do{}while(0) exit).
 */
const { REMOTE_PRELUDE, buildRemoteExec, buildRemoteShellPrelude } = require('../remote-shell');
const { sweepWriters } = require('../writer-sweep');

function sshLadder(c) {
  const { ctx, execFileAsync, ws, data, id, sessionMode, session, cwd, spawnAccount, integrationOn,
    spawnBrowserPre, needsClaudeLoginHelper, sweepOpts, h, shq, rcmd, rargs } = c;
  const { hosts, path, fs, os, AGENT_BIN_DIR, EDITOR_CMD, PORT, ownerWriteRefusal, cliConfigPlanB64, serverSetting, ensureDir, NODE_CMD, agentdRemote } = ctx;
  let { spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd } = c;
  const answer = () => ({ spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd });
          // Remote agent enablement (P3): a remote session can't reach the local
          // API at 127.0.0.1:<PORT>, and the vibespace-status/-task tools don't
          // exist on the remote box. So for any remote session we (1) open an
          // ssh REVERSE tunnel (remote 127.0.0.1:<rport> → this server) and (2)
          // write the two tools into ~/.vibespace/bin on the remote + prepend
          // PATH. Returns pieces spliced into the ssh inner command. Node's
          // base64 is unwrapped (no newlines) so the blob is a single safe word.
          const remoteAgentSetup = async () => {
            // Base PATH/nvm exports — the terminal branch relies on the prelude
            // alone to find node/claude on the host (chat branches re-export
            // inside their inner command), so this part is UNCONDITIONAL even
            // when tool shipping fails below.
            let prelude = REMOTE_PRELUDE; // ONE definition (src/remote-shell.js) — copies drifted between builders
            let tokenAssign = '';
            // ONE ship list, parameterized by the Integration master switch:
            // ON  → all agent tools + hook + keeper + the per-session vsst_
            //       token (over ssh STDIN — 2.126.0, argv is world-readable
            //       via /proc/cmdline on the remote; secrets ride stdin into
            //       0600 files, the inner command references the token via a
            //       `VAR="$(cat …)"` shell prefix so the value never enters
            //       any argv), then hook-register + tools PATH in the prelude.
            // OFF → pristine agent spawn: ship only model-invisible transport
            //       utilities as needed — the keeper for CHAT persistence and
            //       the Claude login helper for an explicit Add-subscription
            //       shell. No hook-register, token, tools PATH, or VIBESPACE_API
            //       reverse tunnel. A hook a PREVIOUS spawn registered on the
            //       host stays inert (it guards on env we no longer pass) —
            //       Manage Agents → host → Remove strips it.
            // + the fake `code` editor helper (remote Ctrl+G, B-2de8) — moved
            // OUT of the PATH dir after extract: its basename must be `code`
            // (claude's GUI-editor check) but shadowing a real vscode `code`
            // on the host's PATH would hang any `code …` shell command.
            const names = integrationOn
              ? [...require('../hosts').HostManager.agentTools(), 'code'] // static tools + plugin shims (Ph4)
              : [
                ...(sessionMode === 'chat' ? ['vibespace-remote-keeper'] : []),
                // A remote Add-subscription helper terminal needs this one
                // transport utility even when agent-visible Integration is
                // OFF (PR #23) — it handles the host's own login only.
                ...(needsClaudeLoginHelper ? ['vibespace-claude-subscription-login.mjs'] : []),
              ];
            // tools live in AGENT_BIN_DIR; the fake `code` moved to its own
            // editor/ subdir (B-b87b, local-PATH shadow fix) — tar it from
            // there via a second -C so the remote layout is unchanged
            const toolDir = AGENT_BIN_DIR;
            const dirFor = (n) => (n === 'code' ? path.dirname(EDITOR_CMD) : toolDir);
            const present = names.filter((n) => { try { return fs.statSync(path.join(dirFor(n), n)).isFile(); } catch { return false; } });
            if (needsClaudeLoginHelper && !present.includes('vibespace-claude-subscription-login.mjs')) {
              throw new Error('Claude subscription login helper is unavailable on the VibeSpace server');
            }

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
                  const tarArgs = ['-c', '-C', toolDir, ...present.filter((n) => n !== 'code')];
                  if (present.includes('code')) tarArgs.push('-C', path.dirname(EDITOR_CMD), 'code');
                  const tar = await execFileAsync('tar', [...tarArgs, ...tokArgs], { timeout: 15000 });
                  const h2 = hosts.get(data.hostId);
                  await execFileAsync('ssh', [...hosts.sshArgs(h2, { multiplex: true }), '--', 'umask 077; mkdir -p "$HOME/.vibespace/bin" "$HOME/.vibespace/editor"; tar -x -C "$HOME/.vibespace/bin"; chmod +x "$HOME/.vibespace/bin"/vibespace-* "$HOME/.vibespace/bin/agent-browser" 2>/dev/null; [ -f "$HOME/.vibespace/bin/code" ] && { mv -f "$HOME/.vibespace/bin/code" "$HOME/.vibespace/editor/code"; chmod +x "$HOME/.vibespace/editor/code"; } || true'],
                    { input: tar, timeout: 20000 });
                  if (integrationOn) {
                    // NODE FINDER (2.244.4, userN's Novita — the chicken-and-egg
                    // behind "hook still says node: not found"): the spawn shell is
                    // POSIX sh (dash on Debian), where nvm never loads — a bare
                    // `node` resolves to NOTHING there, so the register (which
                    // rewrites hook entries to an absolute interpreter) could never
                    // run, and every `#!/usr/bin/env node` agent tool was dead too.
                    // Locate node POSIX-portably (PATH → newest nvm → common
                    // locations), EXPORT its dir onto PATH (revives tools + any
                    // old-format hook entries immediately), then run the register
                    // with the absolute path so entries self-heal to execPath.
                    // tools on PATH + the POSIX node finder (ONE definition in
                    // src/remote-shell.js), then self-heal the hook entries.
                    // VIBESPACE_CLI_CONFIG (design-harness-settings §6): the SAME
                    // base64 plan the install site sends — a host only ever
                    // spawned into (never Installed) gets the managed CLI-config
                    // keys at its next session start. base64 is shell-safe bare.
                    // ONE composition (src/remote-shell.js): REMOTE_PRELUDE → node
                    // finder → tools LAST (so ~/.vibespace/bin — the browser shim
                    // included — stays first on PATH over node's own bin dir)
                    // THE ROOT VERDICT (src/server-root.js): a worktree / temp
                    // server ships the tools but never runs the register helper —
                    // the host's CLI config belongs to the owner's instance.
                    prelude = buildRemoteShellPrelude({ toolsOnPath: true, withNodeFinder: true })
                      + (ownerWriteRefusal() ? '' : `[ -n "$VS_NODE" ] && VIBESPACE_CLI_CONFIG=${cliConfigPlanB64()} "$VS_NODE" "$HOME/.vibespace/bin/vibespace-hook-register.mjs" >/dev/null 2>&1; `);
                    // EDITOR needs $HOME expansion → shell prefix assignment
                    // (envPairs are shq'd); PORT/SESSION_ID are static values.
                    tokenAssign = `VIBESPACE_SESSION_TOKEN="$(cat "$HOME/.vibespace/bin/${tokName}")" EDITOR="$HOME/.vibespace/editor/code" `;
                  }
                } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
              } catch (e) {
                // Ordinary agent-tool shipping is best-effort; the explicit
                // login terminal's helper is required and must fail closed.
                console.error('[remote] tool distribution failed:', e.message);
                if (needsClaudeLoginHelper) throw e;
              }
            }
            if (!integrationOn) return { prelude, envPairs: [], tokenAssign: '', reverse: null };
            // Wide range → per-host collision (two sessions picking the same
            // port) is negligible; a collision only degrades the loser's tools
            // (ssh -R bind warns, session still runs), never breaks the session.
            // VIBESPACE_API is not a secret; the token rides tokenAssign only.
            // CLAUDE_WEBUI_PORT = the reverse-tunnel port: the remote `code`
            // helper POSTs /api/editor/open through it (remote Ctrl+G, B-2de8).
            const rport = session._remotePort = 20000 + Math.floor(Math.random() * 40000);
            return {
              prelude,
              envPairs: [`VIBESPACE_API=http://127.0.0.1:${rport}`, `CLAUDE_WEBUI_PORT=${rport}`, `CLAUDE_WEBUI_SESSION_ID=${id}`],
              tokenAssign, reverse: `${rport}:127.0.0.1:${PORT}`,
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
          const remoteAccountEnv = async (h) => {
            if (!spawnAccount) return '';
            // Host-side subscription login (2.199.0): the host already holds
            // this account's creds dir — minted ON the host, never shipped.
            // Point the CLI at it and skip the ship gate entirely (nothing
            // crosses machines; the §ban-safety concern doesn't apply).
            if (spawnAccount._hostSubReady && spawnAccount.remoteCreds) {
              return `${spawnAccount.remoteCreds.envVar}="$HOME/.vibespace/${spawnAccount.remoteCreds.dirName}" `;
            }
            // API key: ship the single value to a 0600 file, reference via a
            // shell prefix assignment (the VALUE never enters any argv). API
            // keys are the SANCTIONED programmatic path — always shippable.
            if (spawnAccount.secret) {
              const kf = `$HOME/.vibespace/${spawnAccount.id}.key`; // id shape acct-/sub-<hex>, metachar-free
              await execFileAsync('ssh', [...hosts.sshArgs(h), '--', `umask 077; mkdir -p "$HOME/.vibespace"; cat > "${kf}"`],
                { input: spawnAccount.secret.value, timeout: 15000 });
              return `${spawnAccount.secret.var}="$(cat "${kf}")" `;
            }
            if (spawnAccount.remoteCreds?.shippable === false) {
              throw new Error('this macOS Keychain-backed subscription login cannot be copied to another machine because OAuth refresh tokens rotate. Log in as this account on the host instead, or use an API-key account.');
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
            const tar = await execFileAsync('tar', ['-c', '-C', rc.srcDir, ...files], { timeout: 15000 });
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
            await execFileAsync('ssh', [...hosts.sshArgs(h), '--', script], { input: tar, timeout: 20000 });
            return `${rc.envVar}="${rdir}" `;
          };
  async function terminal() {
            // locally-resolved binary paths mean nothing on the remote
            const rcmd = spawnCmd.includes('/') ? path.basename(spawnCmd) : spawnCmd;
            const ra = await remoteAgentSetup();
            let acctEnv = '';
            try { acctEnv = await remoteAccountEnv(h); }
            catch (e) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: 'Failed to place the account key on ' + h.name + ': ' + e.message })); return; }
            // acctEnv rides as a SHELL PREFIX ASSIGNMENT before exec — the shell
            // setenvs it internally, so the VALUE never appears in any argv
            // (an `env KEY=$(cat …)` argument would expand into env's argv).
            const inner = buildRemoteExec({
              cwd, shq, pre: ra.prelude, browser: spawnBrowserPre, tokenAssign: ra.tokenAssign, acctEnv,
              parts: ['TERM=xterm-256color', 'COLORTERM=truecolor', ...ra.envPairs.map(shq), ...spawnEnvPairs.map(shq), rcmd, ...spawnArgs.map(shq)],
            });
            spawnCmd = 'ssh';
            spawnArgs = [...hosts.sshArgs(h, { tty: true, reverse: ra.reverse }), '--', `dtach -A /tmp/vs-${id} -r winch sh -lc ${shq(inner)}`];
            spawnEnvPairs = [];
            spawnCwd = os.homedir(); // remote cwd rides inside the ssh command
            session.host = h.id;
            session.hostName = h.name;
    return answer();
  }
  async function chat() {
            const ra = await remoteAgentSetup();
            let acctEnv = '';
            try { acctEnv = await remoteAccountEnv(h); }
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
            // EXPLICIT-host adopt probe (2.247.2, the B-218d completion): the
            // dial branch probes the device's pipe-session store on every
            // sidebar resume (its discovery carries no pipe sids) — the ssh
            // branch never did, so an explicit-host resume ALWAYS swept and
            // respawned even when a healthy surviving claude was one
            // attach-pipe-session away (userL's 12 orphans). Probe first;
            // a hit skips the sweep below and adopts via the attach-cli.
            if (data.resume && data.resumeId && !data.keeperSid && !data.accountId && agentdRemote && /^[\w-]+$/.test(data.resumeId)) {
              try {
                const k = await hosts.findKeeperFor(h.id, data.resumeId);
                if (k?.error) {
                  ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, code: 'keeper-probe-failed',
                    message: `${h.name} isn’t responding — couldn’t verify whether this conversation is still running there. Retry in a moment.` }));
                  return;
                }
                if (k?.sid) { data.keeperSid = k.sid; data.keeperKind = k.kind; console.log(`[remote] live ${k.kind} session ${k.sid} holds ${data.resumeId.slice(0, 8)} — adopting instead of sweep+respawn`); }
              } catch { }
            }
            // !data.fork: a fork's resume target is the LIVE parent's own
            // conversation — sweeping it kills the parent (2.284.4).
            if (data.resume && data.resumeId && !data.fork && !data.keeperSid && /^[\w-]+$/.test(data.resumeId)) {
              try {
                // ROOT-CAUSE writer sweep (mechanism-agnostic): the ONE thing
                // that must be true before a resume is that NO other process is
                // still writing this conversation's transcript — else we get
                // multiple concurrent writers on one JSONL ("resume did
                // nothing / session ends"; real incident with agentd remote
                // sessions, whose setsid-detached claude survives a local pod
                // rebuild that the sidebar-driven cold resume then races). The
                // fd scan kills ANY claude holding <RID>.jsonl open regardless
                // of how it was spawned (bare / keeper / agentd pipe-session) —
                // it subsumes the id-lock grep (a --resumed claude's lock
                // carries a NEW session id, so grepping the lock for RID missed
                // it). The pipe-meta + keeper legs clean their own bookkeeping.
                // Codex sessions get the codex legs (open rollout / argv).
                const r = await sweepWriters(hosts, h.id, data.resumeId, { shq, execFileAsync, ...sweepOpts(h.id) });
                if (r.swept.length) session._resumeSwept = { host: h.name, pids: r.swept };
                hosts.invalidateDiscovery(h.id);
              } catch (e) {
                // The sweep exists to guarantee no other writer holds this
                // transcript; it fails exactly under the host lag that makes
                // a second writer likely (2.271.0 T1-2). Proceed (the user
                // asked to resume) but SURFACE it — the created reply carries
                // a warning so the window can show it, not a silent double-
                // write risk.
                console.warn('[remote] pre-resume cleanup failed (continuing):', e.message);
                session._resumeWarning = `Couldn’t verify no other process is writing this conversation on ${h.name} — if it was still running there, the transcript may double-write. Watch for duplicated messages.`;
              }
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
            // B-218d: an AGENTD pipe sid must be adopted through the attach-cli
            // (no spawn spec ⇒ attach-pipe-session, never spawns — the dial
            // branch's exact contract). Routing it into the legacy keeper
            // runTail below silently failed: the keeper binary only reads
            // ~/.vibespace/run and has never heard of these sids, so the
            // keeper-attach optimization never worked on modern ssh sessions.
            const agentdAttach = !!(agentdMode && keeperSid && data.keeperKind === 'agentd');
            if (agentdMode && (!keeperSid || agentdAttach)) {
              try {
                await agentdRemote.ensureAgentdOnHost(h.id);
                // the child claude runs under `sh -lc` on the host so the
                // existing shell-expanded prefixes (token file reads, $HOME
                // account paths) keep their exact semantics
                const shellCmd = buildRemoteExec({
                  cwd, shq, pre: ra.prelude, browser: spawnBrowserPre, tokenAssign: ra.tokenAssign, acctEnv,
                  parts: [...ra.envPairs.map(shq), ...spawnEnvPairs.map(shq), rcmd, ...rargs.map(shq)],
                });
                const remoteCmd = REMOTE_PRELUDE + 'exec node "$HOME/.vibespace/agentd/current/agentd.js" --stdio';
                const cfg = {
                  sshBin: 'ssh',
                  sshArgs: hosts.sshArgs(h, { reverse: ra.reverse }),
                  remoteCmd,
                  hostToken: agentdRemote.agentdHostToken(h.id),
                  sid: agentdAttach ? keeperSid : id,
                  version: require('../../package.json').version,
                  // adopt (agentdAttach) sends NO spawn spec — the daemon
                  // attach-pipe-sessions the surviving claude from offset 0
                  ...(agentdAttach ? {} : { spawn: { cmd: 'sh', args: ['-lc', shellCmd], cwd: os.homedir() } }),
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
            if (!agentdMode || (keeperSid && !agentdAttach)) {
              const inner = buildRemoteExec({
                cwd, shq, pre: ra.prelude, browser: spawnBrowserPre, tokenAssign: ra.tokenAssign, acctEnv,
                parts: [...ra.envPairs.map(shq), ...spawnEnvPairs.map(shq)],
                tail: runTail,
              });
              spawnCmd = 'ssh';
              spawnArgs = [...hosts.sshArgs(h, { reverse: ra.reverse }), '-T', '--', inner];
              spawnEnvPairs = [];
              spawnCwd = os.homedir();
              session.host = h.id;
              session.hostName = h.name;
            }
    return answer();
  }
  return { terminal, chat };
}

module.exports = {
  id: 'ssh',
  hostDefault: true, // the member for a host record that names no transport
  terminal: (c) => sshLadder(c).terminal(),
  chat: (c) => sshLadder(c).chat(),
};
