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
 * exists as well (2.244.4, userN's Novita chicken-and-egg): it locates node
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

/** The agent-tool dir onto PATH — spelled ONCE (test-remote-shell's drift
 *  guard fails a hand-written copy in ws-create). */
const TOOLS_ON_PATH = 'export PATH="$HOME/.vibespace/bin:$PATH"; ';

/**
 * THE remote prelude, ONE composition: `REMOTE_PRELUDE → nodeFinder → tools`.
 * The ORDER is load-bearing (design-browser-takeover §4, T2): the node finder
 * PREPENDS node's directory — on an nvm/npm-global host that is exactly the
 * directory holding the real browser CLI — so the tools dir must be prepended
 * LAST to stay first on PATH, or the `agent-browser` shim VibeSpace ships
 * there (the agent's only road is `vibespace-browser`) would be shadowed by
 * the binary it exists to hide. Three ws-create builders once hand-wrote the
 * tools prepend, one of them BEFORE the finder.
 * @param {object} [o]
 * @param {boolean} [o.toolsOnPath]  also put ~/.vibespace/bin on PATH (agent tools) — LAST, so first
 * @param {boolean} [o.withNodeFinder] the POSIX node finder (before the tools)
 * @returns {string} a `;`-terminated shell prefix
 */
function buildRemoteShellPrelude({ toolsOnPath = false, withNodeFinder = false } = {}) {
  let s = REMOTE_PRELUDE;
  if (withNodeFinder) s += nodeFinder();
  if (toolsOnPath) s += TOOLS_ON_PATH;
  return s;
}

/** Ambient long-lived-token strip (B-211a 2.267.0 ⑦): an inherited
 *  CLAUDE_CODE_OAUTH_TOKEN in a host profile has TOP credential precedence
 *  and silently re-bills every remote session. It had to be HAND-ADDED to
 *  all five command builders once — the drift generator buildRemoteExec
 *  exists to kill. Deliberate oat spawns re-add theirs via tokenAssign. */
const AMBIENT_OAT_UNSET = 'unset CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR 2>/dev/null; ';

/**
 * THE remote spawn command line (CS separation, 2.279.0). Five builders in
 * ws-handler assembled `cd + prelude + unset + tokens + exec env …` by hand
 * with drifting copies (two of them included REMOTE_PRELUDE twice; a new
 * security prefix meant editing five sites). One composition now; every
 * difference is a NAMED parameter:
 *  - pre:        transport prelude (ra.prelude / REMOTE_PRELUDE + tools PATH)
 *  - browser:    the agent browser's HOST-DECIDED user-data-dir rung
 *                (browser-profiles.remoteBrowserPrelude, r3): a shell fragment
 *                that reads that machine's own config AFTER the `cd` (so
 *                `./agent-browser.json` is the session's directory) and exports
 *                AGENT_BROWSER_PROFILE only when the config names a profile —
 *                the one shape where the names alone make two browsers collide.
 *                Placed after `pre` because it needs the host's PATH, before
 *                `resolve`/the token reads because it is not one of them.
 *  - resolve:    extra resolution snippet (dial pty's shellResolve)
 *  - tokenAssign/acctEnv: secret-by-$(cat) assignments — NEVER values in argv
 *  - parts:      PRE-QUOTED env pairs + argv tokens (caller owns quoting)
 *  - tail:       verbatim suffix instead of argv (the keeper runTail)
 */
function buildRemoteExec({ cwd, shq, pre = '', browser = '', resolve = '', tokenAssign = '', acctEnv = '', parts = [], tail = '' }) {
  return `cd ${shq(cwd)} 2>/dev/null; ` + sessionCwdExport(cwd, shq) + pre + browser + resolve + AMBIENT_OAT_UNSET + tokenAssign + acctEnv
    + 'exec env ' + parts.join(' ') + tail;
}

/** lane L r5 F3 — THE SESSION'S DIRECTORY, EXPORTED beside the `cd` (the
 *  browser tool's write fence: `vibespace-browser` confines a file write to
 *  VIBESPACE_SESSION_CWD, /tmp and ~/Downloads, and with the variable absent
 *  only to the last two — the invoking shell's cwd is where the agent stands,
 *  never what the session is). The value is the session's OWN cwd field — the
 *  one this line `cd`s into, host label already stripped by ws-create —, spelled
 *  as the `cd` spells it (quoted by the caller's shq; a `cd` that fails leaves a
 *  fence on a directory that does not exist, which admits nothing). Structural:
 *  all five remote builders compose this function, so no transport can omit it
 *  (the local twin rides ws-create's r6Argv — test-architecture §59). */
function sessionCwdExport(cwd, shq) {
  return `VIBESPACE_SESSION_CWD=${shq(cwd)}; export VIBESPACE_SESSION_CWD; `;
}

module.exports = { REMOTE_PRELUDE, TOOLS_ON_PATH, nodeFinder, buildRemoteShellPrelude, buildRemoteExec, AMBIENT_OAT_UNSET, sessionCwdExport };
