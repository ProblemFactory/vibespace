/**
 * THE DIAL SPAWN LADDER (decoupling wave 2b, lane dc-seams-server, 2026-10-05) — one member of the
 * spawn-ladder registry (src/spawn/index.js `spawnFor(host)`; docs/design-cs-unification.md
 * "Remaining 2"). A paired dial-out device (`transport: 'dial'`, no ssh): the agent tools,
 * token and back-tunnel over the device link (deviceAgentSetup), a host-held subscription
 * (dialAcctAssign), the terminal through the DialSessionBridge (pty mode) and the chat as a
 * persistent pipe session in the device daemon.
 * MOVED VERBATIM out of src/ws-create.js's createBody (the lines below keep their indentation there,
 * so `git diff --color-moved` / `git blame -C` show a move): the closures it captured arrive as the
 * ladder context `c` (ws-create `ladderCtx`), the four spawn-line `let`s it assigned are its answer.
 * A ladder ANSWERS {spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd} for ws-create's shared dtach /
 * pipe spawn tail, or undefined once it has answered the socket itself (the old `return;` that
 * ended the create — ws-create returns on it). No `break;` crosses the seam (a stray one would be a
 * SyntaxError here, not a silent change of the do{}while(0) exit).
 */
const { buildRemoteExec, nodeFinder, buildRemoteShellPrelude } = require('../remote-shell');
const { sweepWriters } = require('../writer-sweep');

function dialLadder(c) {
  const { ctx, execFileAsync, ws, data, id, SP, sessionMode, session, cwd, spawnAccount, integrationOn,
    spawnBrowserPre, needsClaudeLoginHelper, sweepOpts, h, shq, rcmd, rargs } = c;
  const { hosts, path, fs, os, AGENT_BIN_DIR, EDITOR_CMD, PORT, ownerWriteRefusal, cliConfigPlanB64, serverSetting, ensureDir, NODE_CMD, agentdRemote, dialBridge } = ctx;
  let { spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd } = c;
  const answer = () => ({ spawnCmd, spawnArgs, spawnEnvPairs, spawnCwd });
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
            if (!integrationOn && !spawnAccount?.secret && !needsClaudeLoginHelper) return { envPairs: [], tokenAssign: '' };
            const dm = await hosts.device(h.id); // dial → deviceForDial
            const home = String((await dm.runCmd('sh', ['-c', 'printf %s "$HOME"'], { timeoutMs: 8000 }))?.stdout || '').trim() || '/root';
            const bin = `${home}/.vibespace/bin`;
            const tokName = `.tok-${sid}`;
            let rf = null;
            if (integrationOn || needsClaudeLoginHelper) {
              await dm.fsMkdir(bin);
              const toolDir = AGENT_BIN_DIR;
              const names = integrationOn
                ? require('../hosts').HostManager.agentTools() // static tools + plugin shims (Ph4)
                : ['vibespace-claude-subscription-login.mjs']; // PR #23: the login helper ships alone when Integration is OFF
              for (const n of names) {
                try {
                  const buf = fs.readFileSync(path.join(toolDir, n));
                  await dm.fsWrite(`${bin}/${n}`, buf);
                } catch (e) {
                  if (needsClaudeLoginHelper && n === 'vibespace-claude-subscription-login.mjs') throw e;
                }
              }
            }
            if (integrationOn) {
              // fake `code` editor helper (remote Ctrl+G, B-2de8) — OUTSIDE the
              // PATH dir so it can't shadow a real vscode `code` on the device
              try {
                await dm.fsWrite(`${home}/.vibespace/editor/code`, fs.readFileSync(EDITOR_CMD));
              } catch { }
              try { await dm.placeSecret(`${bin}/${tokName}`, Buffer.from(session.agentToken)); }
              catch { await dm.fsWrite(`${bin}/${tokName}`, Buffer.from(session.agentToken)); }
              // chmod: tools executable, token 0600, then register the hook in
              // the device's OWN claude/codex configs (its local CLI fires it)
              await dm.runCmd('sh', ['-c',
                `chmod +x "${bin}"/vibespace-* "${bin}/agent-browser" "${home}/.vibespace/editor/code" 2>/dev/null; chmod 600 "${bin}/${tokName}"; `
                // same POSIX node finder as the ssh prelude (2.244.4 — a bare
                // `node` is unresolvable in dash/non-login shells on nvm hosts)
                + nodeFinder()
                // the root verdict (src/server-root.js): no register on a refused root
                + (ownerWriteRefusal() ? 'true' : `[ -n "$VS_NODE" ] && "$VS_NODE" "${bin}/vibespace-hook-register.mjs" 2>/dev/null || true`)],
                // VIBESPACE_CLI_CONFIG rides the daemon's run-cmd env merge (no new
                // op, no capability bit — run-cmd predates this): the device's own
                // claude/codex configs get the managed keys too (design §6).
                { env: { VIBESPACE_CLI_CONFIG: cliConfigPlanB64() }, timeoutMs: 12000 }).catch(() => {});
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
            if (spawnAccount && spawnAccount.secret && !spawnAccount._hostSubReady) {
              await dm.fsMkdir(`${home}/.vibespace`); // integration-OFF path skipped the bin mkdir
              const kf = `${home}/.vibespace/${spawnAccount.id}.key`;
              // place-secret op (2.298.0): atomic 0600 at open — the old
              // fsWrite-then-chmod pair left a mode-race window with the key
              // world-readable. Old daemons keep the legacy pair.
              try { await dm.placeSecret(kf, Buffer.from(spawnAccount.secret.value)); }
              catch {
                await dm.fsWrite(kf, Buffer.from(spawnAccount.secret.value));
                await dm.runCmd('sh', ['-c', `chmod 600 "${kf}"`], { timeoutMs: 6000 }).catch(() => {});
              }
              acctAssign = `${spawnAccount.secret.var}="$(cat "${kf}")" `;
            }
            if (!integrationOn) return { envPairs: [], tokenAssign: acctAssign };
            return {
              // home is concrete here, so EDITOR can ride envPairs (shq-safe);
              // CLAUDE_WEBUI_PORT = the device back-tunnel (remote Ctrl+G)
              envPairs: [
                `VIBESPACE_API=http://127.0.0.1:${rf.port}`,
                `CLAUDE_WEBUI_PORT=${rf.port}`,
                `CLAUDE_WEBUI_SESSION_ID=${sid}`,
                `EDITOR=${home}/.vibespace/editor/code`,
              ],
              tokenAssign: acctAssign + `VIBESPACE_SESSION_TOKEN="$(cat "${bin}/${tokName}")" `,
            };
          };
          // Host-held subscription on a DIAL device (2.208.0): the device
          // already holds this account's creds dir (~/.vibespace/subs/<id>,
          // minted by an on-device login — 2.199.0) — a shell prefix
          // assignment points the CLI at it. NOTHING ships, so the §ban-safety
          // dial guards below must not reject it (they used to, with a
          // misleading "shipping not implemented" error). Empty otherwise.
          const dialAcctAssign = (spawnAccount?._hostSubReady && spawnAccount.remoteCreds)
            ? `${spawnAccount.remoteCreds.envVar}="$HOME/.vibespace/${spawnAccount.remoteCreds.dirName}" ` : '';
  async function terminal() {
            // TERMINAL-on-dial (B-0d70): the device runs claude/codex in a
            // node-pty via the daemon's open-session, proxied through the
            // DialSessionBridge (pty mode). Locally it's dtach → pty-wrapper →
            // vibespace-agentd-attach (pty/raw mode) — the exact `ssh -t`
            // shape, but over the dialed link. Live pty (no offset/replay);
            // pty-wrapper's REMOTE_RETRY respawns the attach on a link drop.
              if (!dialBridge || !agentdRemote) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, sessionId: id, message: 'dial sessions not wired on this server' })); return; }
              // Account billing on a device: API keys ship (below); a
              // host-HELD subscription uses the device's own creds dir (no
              // ship — dialAcctAssign); any OTHER subscription can't be
              // honored on a device (OAuth ship is off by default,
              // §ban-safety) — fail LOUD, don't silently bill the device's
              // own login (mirror the chat-dial guard).
              if (spawnAccount && !spawnAccount.secret && !dialAcctAssign) {
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
              const rcmd0 = SP.loginShell ? '"$S0"' : (spawnCmd.includes('/') ? path.basename(spawnCmd) : spawnCmd);
              const shellResolve = SP.loginShell
                ? `S0="\${SHELL:-}"; [ -n "$S0" ] || S0="$(dscl . -read ~/ UserShell 2>/dev/null | awk '{print \$2}')"; [ -n "$S0" ] || S0="$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f7)"; [ -x "$S0" ] || S0="$(command -v zsh || command -v bash || echo sh)"; `
                : '';
              try {
                const bridgePort = await dialBridge.ensure({ sid: id, deviceId: h.deviceId });
                // A tool/tunnel setup error degrades to bare env, EXCEPT when
                // an API key must be placed — a swallowed failure would run the
                // session on the device's own login = wrong billing (review).
                const da = await deviceAgentSetup(h, id).catch((e) => {
                  if ((spawnAccount?.secret && !spawnAccount._hostSubReady) || needsClaudeLoginHelper) throw e; // held billing rides dialAcctAssign — only a real key placement failure (or the required login helper, PR #23) is fatal
                  console.warn('[dial] agent setup degraded:', e.message); return { envPairs: [], tokenAssign: '' };
                });
                // tools PATH only while integrated — leftover tools from an
                // earlier ON spawn must not be name-resolvable in a pristine one
                const shellCmd = buildRemoteExec({
                  cwd, shq,
                  pre: buildRemoteShellPrelude({ toolsOnPath: integrationOn, withNodeFinder: integrationOn }),
                  browser: spawnBrowserPre,
                  resolve: shellResolve, tokenAssign: da.tokenAssign, acctEnv: dialAcctAssign,
                  parts: [...da.envPairs.map(shq), ...spawnEnvPairs.map(shq), rcmd0, ...(SP.loginShell ? ['-l'] : spawnArgs.map(shq))],
                });
                const cfg = {
                  tcp: { port: bridgePort },
                  hostToken: agentdRemote.agentdHostToken('dial-' + h.deviceId),
                  sid: id,
                  version: require('../../package.json').version,
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
    return answer();
  }
  async function chat() {
              // Graduation B.2/B.3: the session runs as a persistent PIPE
              // SESSION in the DIALED-IN device's daemon; the attach child
              // reaches it through the server's loopback mux proxy
              // (DialSessionBridge) — the dial link lives inside this process,
              // unreachable to a child directly. B.3 ports the ssh-coupled
              // agent prelude to DEVICE FS OPS: tools + token via fsWrite, the
              // VIBESPACE_API back-tunnel via reverseForward, hook registration
              // via runCmd — so vibespace-status/task/ask work on the device.
              if (!dialBridge || !agentdRemote) { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: 'dial sessions not wired on this server' })); return; }
              // A harness may declare CHAT over a byte pipe unwired (codex, B-0588, same as the
              // ssh path): the codex-chat-wrapper speaks JSON-RPC to a local
              // codex app-server, not to the pipe-relayed device one. Fail
              // LOUD rather than blank. Codex TERMINAL on dial works (TUI over
              // the pty path); claude chat works.
              if (typeof SP.deviceChatRefusal === 'function') { ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, sessionId: id, message: SP.deviceChatRefusal(h.name) })); return; }
              // A selected SUBSCRIPTION account can't be honored on a device
              // (OAuth shipping is off by default — §ban-safety) — fail loudly
              // rather than silently billing the device's own login (the ssh
              // path fails the same way). API keys are shippable (below);
              // host-HELD logins use the device's own creds dir (dialAcctAssign).
              if (spawnAccount && !spawnAccount.secret && !dialAcctAssign) {
                let allowSub = false; try { allowSub = !!serverSetting('accounts.shipSubscriptionToRemote'); } catch {}
                ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: allowSub
                  ? 'subscription creds shipping to dial devices is not implemented — use an API-key account, or log in on the device'
                  : 'the selected account is a subscription login — shipping it to a device is disabled (§ban-safety). Use an API-key account, or log in on the device itself.' }));
                return;
              }
              // pipe-ATTACH (B-4058 dial edition, audit #11/#47): the card
              // carried a live device pipe sid — reattach to the SURVIVING
              // device-side claude from byte 0 (full replay rebuilds the view)
              // instead of spawning a second writer onto the same JSONL. No
              // spawn spec in the cfg ⇒ attach-pipe-session (never spawns).
              let dialKeeperSid = data.keeperSid && /^[\w-]+$/.test(data.keeperSid) ? data.keeperSid : null;
              // Dial discovery carries no pipe sids, so a plain sidebar resume
              // never arrives with keeperSid — probe the device's pipe-session
              // store directly and ADOPT a surviving claude over respawning.
              if (!dialKeeperSid && data.resume && data.resumeId && !data.accountId && /^[\w-]+$/.test(data.resumeId)) {
                try {
                  const k = await hosts.findKeeperFor(h.id, data.resumeId);
                  if (k?.error) {
                    ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, code: 'keeper-probe-failed',
                      message: `${h.name} isn’t responding — couldn’t verify whether this conversation is still running there. Retry in a moment.` }));
                    return;
                  }
                  if (k?.sid) { dialKeeperSid = k.sid; console.log(`[dial] live pipe session ${k.sid} holds ${data.resumeId.slice(0, 8)} — attaching instead of spawning a second writer`); }
                } catch { }
              }
              // Pre-resume writer sweep over the DEVICE LINK — the ssh-only
              // cleanScript never ran for dial, so a pod-recreation-orphaned
              // pipe-session claude (setsid-detached, survives everything the
              // daemon does) raced every later resume as a second JSONL writer.
              // Never runs for pipe-ATTACH (we adopt, not respawn) and
              // NEVER for a FORK (2.284.4, real incident: forking a LIVE
              // conversation SIGTERMed the parent's claude mid-turn — a fork
              // only READS the parent transcript and writes a NEW id's JSONL,
              // so a live parent writer is legitimate, not a corruption risk;
              // the resume-already-live guard exempts forks for the same
              // reason, which voids the "can only reach external writers"
              // assumption these sweeps were written under).
              if (data.resume && data.resumeId && !data.fork && !dialKeeperSid && /^[\w-]+$/.test(data.resumeId)) {
                try {
                  const r = await sweepWriters(hosts, h.id, data.resumeId, { shq, execFileAsync, ...sweepOpts(h.id) });
                  if (r.swept.length) session._resumeSwept = { host: h.name, pids: r.swept };
                  hosts.invalidateDiscovery(h.id);
                } catch (e) {
                  console.warn('[dial] pre-resume cleanup failed (continuing):', e.message);
                  session._resumeWarning = `Couldn’t verify no other process is writing this conversation on ${h.name} — if it was still running there, the transcript may double-write. Watch for duplicated messages.`;
                }
              }
              try {
                const bridgePort = await dialBridge.ensure({ sid: id, deviceId: h.deviceId });
                // Tool/token/tunnel setup degrades to bare env on error (session
                // still runs); the API-key ship inside is NOT degradable — a
                // write failure throws out of the try and fails the create.
                // Skipped entirely on pipe-ATTACH: the surviving claude keeps
                // its original env, and a fresh reverseForward here would leak
                // an unused device port per attach.
                const da = dialKeeperSid ? { envPairs: [], tokenAssign: '' } : await deviceAgentSetup(h, id).catch((e) => {
                  if ((spawnAccount?.secret && !spawnAccount._hostSubReady) || needsClaudeLoginHelper) throw e; // wrong billing / a required login helper must fail, not silently degrade (held rides dialAcctAssign — placement can't fail)
                  console.warn('[dial] agent setup degraded:', e.message); return { envPairs: [], tokenAssign: '' };
                });
                // tools PATH only while integrated (see the pty branch note)
                const shellCmd = buildRemoteExec({
                  cwd, shq,
                  pre: buildRemoteShellPrelude({ toolsOnPath: integrationOn, withNodeFinder: integrationOn }),
                  browser: spawnBrowserPre,
                  tokenAssign: da.tokenAssign, acctEnv: dialAcctAssign,
                  parts: [...da.envPairs.map(shq), ...spawnEnvPairs.map(shq), rcmd, ...rargs.map(shq)],
                });
                const cfg = {
                  tcp: { port: bridgePort },
                  hostToken: agentdRemote.agentdHostToken('dial-' + h.deviceId),
                  sid: dialKeeperSid || id,
                  version: require('../../package.json').version,
                  // cwd runs ON THE DEVICE — send the resolved device cwd, not
                  // this server's homedir (a path absent on the device). The
                  // daemon also falls back to HOME if it still doesn't exist.
                  ...(dialKeeperSid ? {} : { spawn: { cmd: 'sh', args: ['-lc', shellCmd], cwd } }),
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
                // the pipe sid the kill path must target (attach-adopted
                // sessions keep the SURVIVING sid, not the fresh webui id)
                session.keeperSid = dialKeeperSid || id;
              } catch (e) {
                ws.send(JSON.stringify({ type: 'error', reqId: data.reqId, message: `dial session failed: ${e.message} (is the device online?)` })); return;
              }
    return answer();
  }
  return { terminal, chat };
}

module.exports = {
  id: 'dial',
  terminal: (c) => dialLadder(c).terminal(),
  chat: (c) => dialLadder(c).chat(),
};
