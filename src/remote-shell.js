'use strict';
/**
 * ONE source of truth for the remote shell prelude (CS unification, 2.274.0).
 *
 * WHY: every remote command VibeSpace runs — session spawns (ssh terminal /
 * ssh chat / dial terminal / dial chat), capability probes, agentd bootstrap,
 * the usage-scan harvest — has to fix up the same two things first, because a
 * non-login `ssh host cmd` shell inherits almost no PATH:
 *   1. `$HOME/.local/bin` on PATH (where the native claude installer puts the
 *      binary, and where our own tools land)
 *   2. nvm sourced (the #1 cause of "node: not found" on developer machines —
 *      nvm.sh is only loaded by interactive login shells)
 * That string was COPY-PASTED into ~10 call sites, and the copies drifted:
 * the audit found spawn builders whose prelude had fallen behind the others.
 * A divergent prelude is a remote-only bug generator — the exact class the
 * owner asked to eliminate. Change it HERE and every caller gets it.
 *
 * NOTE the POSIX constraint: the spawn shell is often dash (Debian's /bin/sh),
 * where `nvm.sh` sourcing silently does nothing. That is why nodeFinder()
 * exists as well (2.244.4, natural's Novita chicken-and-egg): it locates node
 * without any shell-specific machinery and exports its dir onto PATH.
 */

/** PATH + nvm — the base every remote command needs. */
const REMOTE_PRELUDE = 'export PATH="$HOME/.local/bin:$PATH"; [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; ';

/**
 * POSIX node finder (2.244.4): PATH → newest nvm → common absolute paths.
 * Sets VS_NODE and (when found) prepends its dir to PATH, which also revives
 * every `#!/usr/bin/env node` agent tool on a dash host. Emit this BEFORE any
 * command that needs node when the shell may not be bash.
 */
function nodeFinder() {
  return 'VS_NODE="$(command -v node 2>/dev/null)"; '
    + '[ -z "$VS_NODE" ] && VS_NODE="$(ls -1 "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | sort | tail -1)"; '
    + 'if [ -z "$VS_NODE" ]; then for vs_c in /usr/local/bin/node /usr/bin/node /opt/homebrew/bin/node "$HOME/.local/bin/node"; do [ -x "$vs_c" ] && VS_NODE="$vs_c" && break; done; fi; '
    + '[ -n "$VS_NODE" ] && export PATH="$(dirname "$VS_NODE"):$PATH"; ';
}

/**
 * @param {object} [o]
 * @param {boolean} [o.toolsOnPath]  also put ~/.vibespace/bin on PATH (agent tools)
 * @param {boolean} [o.withNodeFinder] append the POSIX node finder
 * @returns {string} a `;`-terminated shell prefix
 */
function buildRemoteShellPrelude({ toolsOnPath = false, withNodeFinder = false } = {}) {
  let s = REMOTE_PRELUDE;
  if (toolsOnPath) s += 'export PATH="$HOME/.vibespace/bin:$PATH"; ';
  if (withNodeFinder) s += nodeFinder();
  return s;
}

module.exports = { REMOTE_PRELUDE, nodeFinder, buildRemoteShellPrelude };
