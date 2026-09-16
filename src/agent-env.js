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
 * `DAEMON_ENV_KEEP` adds the two names the daemon tier itself reads
 * (`VIBESPACE_NODE_MODULES` — node-pty's home; `VIBESPACE_AGENTD_VERSION` —
 * the upgrade re-exec's stamp). The set is DERIVED from the daemon tier's own
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
const DAEMON_ENV_KEEP = Object.freeze(new Set([...AGENT_ENV_KEEP, 'VIBESPACE_NODE_MODULES', 'VIBESPACE_AGENTD_VERSION']));

/**
 * The sanitized copy of `base`: every `VIBESPACE_*` not in `keep` is dropped
 * (secrets + server config), so is every `npm_*` (nested-npm hazard) and
 * every name in AGENT_ENV_DROP. Pure over its inputs; never mutates `base`.
 */
function agentEnv(base, { keep = AGENT_ENV_KEEP } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(base || {})) {
    if (AGENT_ENV_DROP.has(k)) continue;
    if (k.startsWith('npm_')) continue;
    if (k.startsWith('VIBESPACE_') && !keep.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/** The env a DAEMON process is born with, and the base every daemon child
 *  spawn is merged over: the agent rule plus the daemon tier's own names. */
function daemonEnv(base) { return agentEnv(base, { keep: DAEMON_ENV_KEEP }); }

module.exports = { AGENT_ENV_KEEP, AGENT_ENV_DROP, DAEMON_ENV_KEEP, agentEnv, daemonEnv };
