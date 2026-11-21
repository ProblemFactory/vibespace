'use strict';
// THE NAMES THE HUB INJECTS INTO A CONVERSATION (B-ba47's follow-up pick, 主开发 r791, 2026-11-21) — ONE list. Every road that starts
// a conversation's CLI, a remote shell or a job writes some of these into the child's environment: the create (src/ws-create.js),
// the spawn's ssh and dial roads (src/spawn/ssh.js, src/spawn/dial.js), the remote shell (src/remote-shell.js), the jobs
// (src/jobs.js) and the boot's re-adopt (src/server/boot-restore.js), plus the harness families each adapter and wrapper sets.
// They are the conversation's IDENTITY, its ROUTE back to the hub and its CREDENTIAL. A suite started from inside a conversation
// must not carry them: its child would reach the CALLER's hub with the caller's own token (scripts/scratch.mjs removes them at
// import). test-architecture §112 holds this list to the sites BOTH ways: a name a site writes that is not here is red, and a
// name here that no site writes is red.
// THE CLASS, asked once more (主开发 r863): a route or a credential the hub hands a conversation's child under NEITHER prefix —
// the telemetry pair (the hub's address + the credential it minted for its receiver), the account's sign-in (the names the
// harness descriptors declare for an account pick) and the conversation's browser (the AGENT_BROWSER_ family). Each is a group
// below. NOT in it: a harness's homeEnvVar (CLAUDE_CONFIG_DIR, CODEX_HOME — the machine login's home rides the same name, the
// agent door keeps it, src/harness-env.js), and the person's session names (GENERIC_SESSION_ENV).
// THE PROCESS MARKS (主开发 r863 MUST 2) are conversation names too, but ids, no route and no credential: src/left-behind.js finds
// a stopped turn's escaped processes by CLAUDE_WEBUI_SESSION_ID, src/jobs.js a stopped job's by VIBESPACE_JOB_ID /
// VIBESPACE_JOB_RUN. A suite KEEPS them in its own process (the import says so), so the person's Stop and a job's stop still
// find what a suite left behind; strippedEnv still drops them for a hub under test.
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
/** The telemetry pair (src/server/otel-ingest.js envFor, merged by the create into every LOCAL claude conversation): the hub's
 *  own receiver address and the credential the hub minted for it — a child exporting telemetry would post to the CALLER's hub. */
const CONVERSATION_TELEMETRY_ENV = Object.freeze(['OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_EXPORTER_OTLP_HEADERS']);
/** The account's sign-in: every name the harness descriptors declare for an account pick (src/harness-env.js
 *  agentCredentialEnvNames — spawnEnvVar + keyEnvVars, homes left out), written by the create through spawnAccount.localEnv.
 *  §112 holds this list EQUAL to the descriptors' answer both ways (the writes are computed keys no writer shape sees). */
const CONVERSATION_ACCOUNT_ENV = Object.freeze(['AGY_ADC_AUTH', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_SECURESTORAGE_CONFIG_DIR',
  'GEMINI_API_KEY', 'GOOGLE_GEMINI_BASE_URL', 'VIBESPACE_PROVIDER_KEY']);
/** The families: every `<FAMILY>WEBUI_*` name an adapter or a wrapper sets, and the conversation's browser (`AGENT_BROWSER_*`:
 *  its profile, its daemon's socket, a lease's CDP address — the browser env of a session comes from the hub, never inherited). */
const CONVERSATION_ENV_FAMILIES = Object.freeze(['CLAUDE_WEBUI_', 'CODEX_WEBUI_', 'AGY_WEBUI_', 'ACP_WEBUI_', 'AGENT_BROWSER_']);
/** The process marks a suite keeps (ids: no route, no credential) — how a stopped turn's and a stopped job's escapees are found. */
const CONVERSATION_MARKS = Object.freeze(['CLAUDE_WEBUI_SESSION_ID', 'VIBESPACE_JOB_ID', 'VIBESPACE_JOB_RUN']);
/** What the sites ALSO set that is the person's session, not the conversation: never removed from a suite. */
const GENERIC_SESSION_ENV = Object.freeze(['PATH', 'TERM', 'COLORTERM', 'DISPLAY', 'XAUTHORITY', 'EDITOR']);

const EXACT = new Set([...CONVERSATION_ENV, ...CONVERSATION_TELEMETRY_ENV, ...CONVERSATION_ACCOUNT_ENV]), GENERIC = new Set(GENERIC_SESSION_ENV);
const MARKS = new Set(CONVERSATION_MARKS);
/** Is `name` one of the conversation's own names? (The person's session names never are.) */
function isConversationName(name) {
  const n = String(name == null ? '' : name);
  if (GENERIC.has(n)) return false;
  return EXACT.has(n) || CONVERSATION_ENV_FAMILIES.some((p) => n.startsWith(p) && n.length > p.length);
}
/** A copy of `env` without the conversation's names; `dropped` = the names it removed, `kept` = the marks it kept (with
 *  `keepMarks`: a suite's own process), both sorted. */
function withoutConversationNames(env = {}, { keepMarks = false } = {}) {
  const out = {}, dropped = [], kept = [];
  for (const [k, v] of Object.entries(env || {})) {
    if (!isConversationName(k)) out[k] = v;
    else if (keepMarks && MARKS.has(k)) { out[k] = v; kept.push(k); } else dropped.push(k);
  }
  return { env: out, dropped: dropped.sort(), kept: kept.sort() };
}

module.exports = { CONVERSATION_ENV, CONVERSATION_TELEMETRY_ENV, CONVERSATION_ACCOUNT_ENV, CONVERSATION_ENV_FAMILIES, CONVERSATION_MARKS, isConversationName, withoutConversationNames };
