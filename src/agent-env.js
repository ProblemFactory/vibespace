'use strict';
/**
 * THE SPAWN-ENV SANITIZER — one rule, every process that can hold a secret
 * (design-communication-panel §14.11.1, made TRUE on the daemon path 2026-09-14).
 *
 * PURE: imports nothing. Bundled into the daemon (src/agentd/agentd.js) AND
 * required by the orchestrator (src/ws-handler.js re-exports `agentEnv`),
 * because the rule has to run in BOTH processes:
 *
 *   · the ORCHESTRATOR strips its own env before it spawns an agent child
 *     (2.227.12 — `NODE_ENV=production` broke the agent's npm installs,
 *     `PORT` leaked into dev servers, and the helm chart injects
 *     VIBESPACE_PASSWORD, storage credentials, the telemetry token and,
 *     since P0b, the cluster integration secrets);
 *   · the DAEMON is a SECOND HOLDER. `DeviceManager._spawnLocal` used to
 *     spawn it with `{ ...process.env }` and `agentd.spawnEnv()` laid the
 *     server's sanitized session env OVER `process.env` — so every child of
 *     the daemon (a pipe-session claude, an `open-session` pty, `run-cmd`)
 *     inherited whatever the daemon had been born with. MEASURED (the round-1
 *     verifier, on a worktree server with `agentd.localPipeSessions: true`):
 *     a `claude` CLI whose /proc/<pid>/environ carried the full 40-char
 *     cluster integration secret (the P0b env family), handed down by a
 *     daemon spawned by a PREVIOUS server life — the daemon survives restarts
 *     by design, so a withdrawn cluster default kept flowing into new
 *     sessions for as long as that daemon lived. "By construction cannot
 *     reach any agent child" was true of the dtach path only.
 *
 * TWO KEEP SETS, ONE FILTER. `AGENT_ENV_KEEP` is what an agent child may see;
 * `DAEMON_ENV_KEEP` adds the three names the daemon tier itself reads
 * (`VIBESPACE_NODE_MODULES` — node-pty's home; `VIBESPACE_AGENTD_VERSION` —
 * the upgrade re-exec's stamp; `VIBESPACE_INPUT_STUB_FILE` — where the Linux
 * input stub records what it would have sent: the suites' witness, unset = no
 * file, lane stream-p1a-transport). The set is DERIVED from the daemon tier's own
 * `process.env.VIBESPACE_*` reads (grep src/agentd + its bundled deps), never
 * typed from memory: a name the daemon reads but this set omits would break
 * the daemon the moment the sanitizer lands, loudly; a name it keeps but
 * nothing reads is a holder for nothing.
 *
 * The daemon's OWN environ is cleaned at the three places a daemon process
 * is born (the server's `_spawnLocal`, the `--stdio` bridge's spawn, the
 * upgrade re-exec) — a running daemon born under an older build keeps its
 * environ until it is next re-exec'd, so `spawnEnv()` sanitizes its BASE on
 * every child spawn regardless (belt and braces: each layer has its own
 * control in scripts/test-agentd-session.mjs).
 *
 * THE THIRD BUILDER, AN ALLOWLIST (lane spawn-env-census, 2026-10-20): a
 * long-lived child that is NOT an agent — the Desktop's Xvnc and its session,
 * the remote agentd ssh bridge (the relay client has its own allowlist,
 * src/relay-token.js relayEnv, from 2.369.329) — gets `serviceEnv()`: a few
 * names from `base` and NOTHING else, never the hub's config and secrets, an
 * agent conversation's tokens, cloud keys or proxies. The family: agentEnv()
 * for agents, daemonEnv() for the device agent (both a denylist over the
 * server's env, as above), serviceEnv() for every other long-lived service.
 * scripts/spawn-env-census.mjs (test-architecture §93) classifies every child
 * the hub, the daemon and data/bin start by the env it passes.
 */

/** Names an agent child may inherit from the server env. Everything the agent
 *  legitimately needs is set EXPLICITLY after the strip (VIBESPACE_API /
 *  _SESSION_TOKEN / _TASK_ID / the remote-transport hints), so this list only
 *  has to cover vars set elsewhere and passed through. */
const AGENT_ENV_KEEP = Object.freeze(new Set([
  'VIBESPACE_API', 'VIBESPACE_SESSION_TOKEN', 'VIBESPACE_TASK_ID',
  'VIBESPACE_REMOTE_SID', 'VIBESPACE_REMOTE_RETRY', 'VIBESPACE_KEEPER_DIR',
  'VIBESPACE_INSTANCE_NAME', 'VIBESPACE_DEVICE_ROOT', 'VIBESPACE_AGENTD_ROOT',
]));

/** CLAUDE_CODE_OAUTH_TOKEN has TOP precedence in the CLI's credential getter
 *  (verified 2.1.225) — an ambient copy would silently re-bill every spawn and
 *  leak a subscription token into agent child envs. Deliberate oat spawns
 *  re-add it via spawnAccount.localEnv AFTER the strip. PORT/HOST/NODE_ENV/
 *  NODE_OPTIONS are the server's OPERATIONAL vars (2.227.12). */
const AGENT_ENV_DROP = Object.freeze(new Set(['PORT', 'HOST', 'NODE_ENV', 'NODE_OPTIONS',
  'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR']));

/** The daemon tier's own reads, on top of the agent set (derived — see the header). */
const DAEMON_ENV_KEEP = Object.freeze(new Set([...AGENT_ENV_KEEP, 'VIBESPACE_NODE_MODULES', 'VIBESPACE_AGENTD_VERSION', 'VIBESPACE_INPUT_STUB_FILE', 'VIBESPACE_MIC_HELPER' /* lane stream-mic-road: the suites' fake microphone helper (src/desktop-mic.js), as the input stub */, 'VIBESPACE_SOUND_FFMPEG' /* lane speaker-passthrough-v1: the suites' fake Opus encoder for the sound's road (src/desktop-sound.js) — a box without ffmpeg (the Actions runner) */, 'VIBESPACE_NODE_MIRROR', 'VIBESPACE_RUNTIME_SWITCH', 'VIBESPACE_RUNTIME_REEXEC' /* lane runtime-floor: the agent's own node (src/node-runtime.js) — the mirror the installer named, the switch's off word, the second image's mark (dropped after the switch) */]));

/**
 * The sanitized copy of `base`: every `VIBESPACE_*` not in `keep` is dropped
 * (secrets + server config), so is every `npm_*` (nested-npm hazard), every
 * name in AGENT_ENV_DROP and every name in `drop` — the harness credential
 * names the caller derives from the descriptors (src/harness-env.js
 * agentCredentialEnvNames; this module imports nothing, so the server-side
 * callers hand them in). Pure over its inputs; never mutates `base`.
 */
function agentEnv(base, { keep = AGENT_ENV_KEEP, drop = [] } = {}) {
  const out = {};
  const dropped = new Set(drop);
  for (const [k, v] of Object.entries(base || {})) {
    if (AGENT_ENV_DROP.has(k) || dropped.has(k)) continue;
    if (k.startsWith('npm_')) continue;
    // AGENT BROWSER (P0): the browser environment of a session comes from
    // VibeSpace (the `env K=v` prefix on the spawn line) or from that machine's
    // own ~/.agent-browser/config.json — NEVER from whatever the SERVER process
    // happened to inherit. An operator with `AGENT_BROWSER_PROFILE` exported in
    // the shell that launched vibespace would otherwise pin every agent on the
    // box to one cookie jar, silently, and precisely on the paths where we set
    // nothing (integration OFF, or the isolation setting turned off).
    if (k.startsWith('AGENT_BROWSER_')) continue;
    if (k.startsWith('VIBESPACE_') && !keep.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/** The env a DAEMON process is born with, and the base every daemon child
 *  spawn is merged over: the agent rule plus the daemon tier's own names. */
function daemonEnv(base, { drop = [] } = {}) { return agentEnv(base, { keep: DAEMON_ENV_KEEP, drop }); }

/** What every service keeps from `base` (+ every LC_*). DISPLAY / XAUTHORITY / DBUS_SESSION_BUS_ADDRESS are NOT here:
 *  the hub's own would point the child at another display or bus — the caller ADDS the ones its child needs. */
const SERVICE_ENV_KEEP = Object.freeze(['PATH', 'HOME', 'LANG', 'TMPDIR', 'XDG_RUNTIME_DIR', 'TERM']);
const SERVICE_ENV_LC = /^LC_[A-Z]+$/;
/** What an EGRESS daemon (its job IS the network: rclone, tailscaled) reads to get out through the operator's network —
 *  MEASURED on the pinned rclone 1.69.3, Go's net/http + crypto/x509 (lane spawn-env-debts): HTTP_PROXY / http_proxy for
 *  http, HTTPS_PROXY / https_proxy for https, NO_PROXY / no_proxy (ALL_PROXY never), and the trust roots of a
 *  TLS-inspecting egress, SSL_CERT_FILE / SSL_CERT_DIR. A proxy URL may carry credentials, so `keep` refuses it;
 *  `egress: true` is the one door, opened by name at the spawn. */
const EGRESS_ENV = Object.freeze(['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'NO_PROXY', 'no_proxy', 'SSL_CERT_FILE', 'SSL_CERT_DIR']);
/** What an rclone child reads beyond the service list + the egress door — MEASURED (lane spawn-env-debts): ssh-agent
 *  for an sftp remote with no key file and no password (SSH_AUTH_SOCK: refused without it), its default cache / config
 *  dirs (XDG_CACHE_HOME / XDG_CONFIG_HOME — the device mount's vfs cache is rclone's default). Its remote rides its own
 *  RCLONE_CONFIG_* (`add`); the hub's RCLONE_* never. */
const RCLONE_ENV_KEEP = Object.freeze(['SSH_AUTH_SOCK', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME']);
/** a name a service must never take from the hub's env (a `keep` naming one is a programming error) */
/** The ONE name an ssh child keeps beyond the service list (lane spawn-env-census, measured on a private sshd): a key held
 *  in ssh-agent is refused without SSH_AUTH_SOCK; a key file logs in on an EMPTY env. Every ssh road passes BatchMode=yes,
 *  so ssh never prompts — SSH_ASKPASS* / DISPLAY are never read (no road forwards X). HostManager.sshEnv() + the agentd
 *  bridge build over it. */
const SSH_ENV_KEEP = Object.freeze(['SSH_AUTH_SOCK']);
const SECRET_SHAPE = /^(VIBESPACE_|CLAUDE_|ANTHROPIC_|OPENAI_|AWS_|GOOGLE_|AZURE_|NPM_)|TOKEN|SECRET|PASSW|CREDENTIAL|_KEY$|PROXY$/i;

/**
 * The env of a long-lived service that is not an agent: SERVICE_ENV_KEEP + LC_* from `base`, + `keep` (the names ONE
 * child measurably needs — the ssh bridge's SSH_AUTH_SOCK), + EGRESS_ENV when `egress` (a child that dials the
 * internet), then `add` (the caller's own names; null/undefined removes). Nothing else from `base`. Pure; never mutates
 * `base`.
 */
function serviceEnv(base, { keep = [], add = {}, egress = false } = {}) {
  for (const k of keep) if (SECRET_SHAPE.test(k)) throw new TypeError(`serviceEnv: '${k}' has a secret's shape — a service never keeps it from the hub's env`);
  const names = new Set([...SERVICE_ENV_KEEP, ...keep, ...(egress ? EGRESS_ENV : [])]);
  const out = {};
  for (const [k, v] of Object.entries(base || {})) if (typeof v === 'string' && (names.has(k) || SERVICE_ENV_LC.test(k))) out[k] = v;
  for (const [k, v] of Object.entries(add || {})) { if (v === undefined || v === null) delete out[k]; else out[k] = String(v); }
  return out;
}

module.exports = { AGENT_ENV_KEEP, AGENT_ENV_DROP, DAEMON_ENV_KEEP, SERVICE_ENV_KEEP, SSH_ENV_KEEP, EGRESS_ENV, RCLONE_ENV_KEEP, agentEnv, daemonEnv, serviceEnv };
