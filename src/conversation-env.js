'use strict';
// THE NAMES THE HUB INJECTS INTO A CONVERSATION (B-ba47's follow-up pick, 主开发 r791, 2026-11-21) — ONE list. Every road that starts
// a conversation's CLI, a remote shell or a job writes some of these into the child's environment: the create (src/ws-create.js),
// the spawn's ssh and dial roads (src/spawn/ssh.js, src/spawn/dial.js), the remote shell (src/remote-shell.js), the jobs
// (src/jobs.js) and the boot's re-adopt (src/server/boot-restore.js), plus the harness families each adapter and wrapper sets.
// They are the conversation's IDENTITY, its ROUTE back to the hub and its CREDENTIAL. A suite started from inside a conversation
// must not carry them: its child would reach the CALLER's hub with the caller's own token (scripts/scratch.mjs removes them at
// import). test-architecture §112 holds this list to the sites BOTH ways: a name a site writes that is not here is red, and a
// name here that no site writes is red.
// PURE: no import, no I/O.

/** The exact names: identity, route, credential. */
const CONVERSATION_ENV = Object.freeze([
  'VIBESPACE_API',              // the hub's own address, as the child reaches it (create, ssh, dial, jobs)
  'VIBESPACE_SESSION_TOKEN',    // the conversation's credential (create, ssh, dial)
  'VIBESPACE_SESSION_CWD',      // the conversation's folder (create, remote shell)
  'VIBESPACE_REMOTE_SID',       // a remote conversation's id on its machine (create)
  'VIBESPACE_REMOTE_RETRY',     // a remote start's retry mark (create)
  'VIBESPACE_CLI_CONFIG',       // the remote CLI's config the ssh and dial roads hand (ssh, dial, the remote hook-register run)
  'VIBESPACE_ACCOUNT_KEY',      // the conversation's account key, fixed at its spawn (create, the local spawn)
  'VIBESPACE_ACCOUNT_LINK',     // a pooled account's link path, the status line's (the local spawn)
  'VIBESPACE_ORIG_STATUSLINE',  // the person's own status-line command the usage wrapper chains to (the local spawn)
  'VIBESPACE_JOB_TOKEN',        // a job's credential (jobs)
  'VIBESPACE_JOB_ID',           // a job's id — also its process mark (jobs)
  'VIBESPACE_JOB_CWD',          // a job's folder (jobs)
  'VIBESPACE_JOB_RUN',          // a job run's id (jobs)
]);
/** The harness families: every `<FAMILY>WEBUI_*` name an adapter or a wrapper sets (CLAUDE_WEBUI_SESSION_ID is the process mark). */
const CONVERSATION_ENV_FAMILIES = Object.freeze(['CLAUDE_WEBUI_', 'CODEX_WEBUI_', 'AGY_WEBUI_', 'ACP_WEBUI_']);
/** What the sites ALSO set that is the person's session, not the conversation: never removed from a suite. */
const GENERIC_SESSION_ENV = Object.freeze(['PATH', 'TERM', 'COLORTERM', 'DISPLAY', 'XAUTHORITY', 'EDITOR']);

const EXACT = new Set(CONVERSATION_ENV), GENERIC = new Set(GENERIC_SESSION_ENV);
/** Is `name` one of the conversation's own names? (The person's session names never are.) */
function isConversationName(name) {
  const n = String(name == null ? '' : name);
  if (GENERIC.has(n)) return false;
  return EXACT.has(n) || CONVERSATION_ENV_FAMILIES.some((p) => n.startsWith(p) && n.length > p.length);
}
/** A copy of `env` without the conversation's names, and the names it held (sorted). */
function withoutConversationNames(env = {}) {
  const out = {}, dropped = [];
  for (const [k, v] of Object.entries(env || {})) { if (isConversationName(k)) dropped.push(k); else out[k] = v; }
  return { env: out, dropped: dropped.sort() };
}

module.exports = { CONVERSATION_ENV, CONVERSATION_ENV_FAMILIES, isConversationName, withoutConversationNames };
