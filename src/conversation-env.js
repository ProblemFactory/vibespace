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
// below — and since 主开发 r979 they are only the FLOOR: the names a road hands are COMPUTED where it builds the env (the mark,
// below), so a provider's plan or an account's folder (CODEX_HOME set to a member's folder) is dropped because a road wrote it,
// never because a list remembered it. A homeEnvVar the person's own machine set and no road touched is in no mark and stays.
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
/** THE HUB'S OWN FAMILY on the floor (B-ba47 pick B's re-land, 主开发 r1043 item 3): the VIBESPACE_* names agentEnv keeps from
 *  the hub's own env (src/agent-env.js AGENT_ENV_KEEP, beside the conversation's names above) — the keeper's folder, the
 *  instance's name, the device and daemon roots, the retired task id. Roads on the plain sanitized env (the OpenCode serve and its
 *  terminal, the Desktop start, a multiplexer's attach, the plugin loader) write no mark and hand only these; the floor takes
 *  them, so a suite started from such a shell carries none. §112 holds this list EQUAL to agent-env.js's, both ways. */
const CONVERSATION_HUB_ENV = Object.freeze(['VIBESPACE_AGENTD_ROOT', 'VIBESPACE_DEVICE_ROOT', 'VIBESPACE_INSTANCE_NAME', 'VIBESPACE_KEEPER_DIR', 'VIBESPACE_TASK_ID']);
/** The families: every `<FAMILY>WEBUI_*` name an adapter or a wrapper sets, and the conversation's browser (`AGENT_BROWSER_*`:
 *  its profile, its daemon's socket, a lease's CDP address — the browser env of a session comes from the hub, never inherited). */
const CONVERSATION_ENV_FAMILIES = Object.freeze(['CLAUDE_WEBUI_', 'CODEX_WEBUI_', 'AGY_WEBUI_', 'ACP_WEBUI_', 'AGENT_BROWSER_']);
/** The process marks a suite keeps (ids: no route, no credential) — how a stopped turn's and a stopped job's escapees are found. */
const CONVERSATION_MARKS = Object.freeze(['CLAUDE_WEBUI_SESSION_ID', 'VIBESPACE_JOB_ID', 'VIBESPACE_JOB_RUN']);
/** What the sites ALSO set that is the person's session, not the conversation: never removed from a suite. */
const GENERIC_SESSION_ENV = Object.freeze(['PATH', 'TERM', 'COLORTERM', 'DISPLAY', 'XAUTHORITY', 'EDITOR']);

const EXACT = new Set([...CONVERSATION_ENV, ...CONVERSATION_TELEMETRY_ENV, ...CONVERSATION_ACCOUNT_ENV, ...CONVERSATION_HUB_ENV]), GENERIC = new Set(GENERIC_SESSION_ENV);
const MARKS = new Set(CONVERSATION_MARKS);
/** Is `name` one of the conversation's own names? (The person's session names never are.) */
function isConversationName(name) {
  const n = String(name == null ? '' : name);
  if (GENERIC.has(n)) return false;
  return EXACT.has(n) || CONVERSATION_ENV_FAMILIES.some((p) => n.startsWith(p) && n.length > p.length);
}
// THE COMPUTED MARK (主开发 r979 — the names are computed where the env is built, not listed where it is read). Each road that
// finishes a conversation's (or a job's) child env writes VIBESPACE_HANDED: the names it ADDED or CHANGED against the sanitized
// base it started from, and every VIBESPACE_* name of the finished env (the hub's own, handed on) — names only, never a value.
// A name nobody ever listed is in it by construction: a provider's plan, an account's folder, whatever the next unit adds. The
// person's session names a road also writes are never in it (PERSON_SESSION_ENV): dropping them breaks the suite, and a
// dropped HOME sends os.homedir() to the passwd home (a HOME set to an account's root is the re-home's to replace).
const HANDED_MARK = 'VIBESPACE_HANDED';
const PERSON_SESSION_ENV = Object.freeze([...GENERIC_SESSION_ENV, 'HOME']);
const PERSON = new Set(PERSON_SESSION_ENV);
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** The names a road hands on: added or changed against `base`, and every VIBESPACE_* name (`familyToo`: the hub's own family
 *  the sanitized base kept unchanged — the keeper's folder, the instance, the device and daemon roots; 主开发 r985), never a
 *  person's session name or the mark. A job's road passes familyToo:false — its base is the owner's own words over an env
 *  with NO VIBESPACE_* left, so every hub name there is added anyway and an owner's own VIBESPACE_* word stays theirs. */
function handedNames(finished = {}, base = {}, { familyToo = true } = {}) {
  const out = [];
  for (const [k, v] of Object.entries(finished || {})) {
    if (!NAME_RE.test(k) || k === HANDED_MARK || PERSON.has(k)) continue;
    if ((familyToo && k.startsWith('VIBESPACE_')) || !Object.prototype.hasOwnProperty.call(base || {}, k) || String(base[k]) !== String(v)) out.push(k);
  }
  return out.sort();
}
/** The mark's value for a list of names (a road that knows the names it writes, not a base: the remote command). */
function markOf(names = []) {
  return [...new Set((names || []).filter((n) => NAME_RE.test(n) && n !== HANDED_MARK && !PERSON.has(n)))].sort().join(',');
}
/** `finished` with its mark written (a copy). */
function withHandedMark(finished = {}, base = {}, opts = {}) {
  return { ...finished, [HANDED_MARK]: markOf(handedNames(finished, base, opts)) };
}
/** The names a mark holds (a malformed entry is dropped, never trusted as a pattern). */
function namesOfMark(value) {
  return String(value == null ? '' : value).split(',').map((x) => x.trim()).filter((x) => NAME_RE.test(x));
}
/** A copy of `env` without the conversation's names. WITH a mark (VIBESPACE_HANDED): exactly the names it holds, and the mark;
 *  WITHOUT one (a parent started before the mark): the list above, the FLOOR, never the proof. `keepMarks` (a suite's own
 *  process) keeps the three process marks; `floorToo` (a hub under test) drops the floor beside a mark. A person's session
 *  name is never dropped. `dropped` / `kept` sorted; `by` = 'mark' | 'floor'. */
function withoutConversationNames(env = {}, { keepMarks = false, floorToo = false } = {}) {
  const has = Object.prototype.hasOwnProperty.call(env || {}, HANDED_MARK);
  const handed = has ? new Set(namesOfMark(env[HANDED_MARK])) : null;
  const out = {}, dropped = [], kept = [];
  for (const [k, v] of Object.entries(env || {})) {
    const named = k === HANDED_MARK || (handed ? handed.has(k) || (floorToo && isConversationName(k)) : isConversationName(k));
    if (!named || PERSON.has(k)) out[k] = v;
    else if (keepMarks && MARKS.has(k)) { out[k] = v; kept.push(k); } else dropped.push(k);
  }
  return { env: out, dropped: dropped.sort(), kept: kept.sort(), by: has ? 'mark' : 'floor' };
}

/** THE FLOOR's MARK (r2607): a road on the plain sanitized env that gives a PERSON a shell (the OpenCode terminal) hands that shell
 *  the hub's floor names its own env holds (CONVERSATION_HUB_ENV: the keeper's folder, the instance name, the device and daemon
 *  roots, the retired task id) — this is their names-only mark, so a hub started there by hand drops them like every other road's
 *  ('' when the env holds none). */
function floorMarkOf(env = {}) { return markOf(CONVERSATION_HUB_ENV.filter((k) => Object.prototype.hasOwnProperty.call(env || {}, k))); }

module.exports = { CONVERSATION_ENV, CONVERSATION_TELEMETRY_ENV, CONVERSATION_ACCOUNT_ENV, CONVERSATION_HUB_ENV, CONVERSATION_ENV_FAMILIES, CONVERSATION_MARKS,
  HANDED_MARK, PERSON_SESSION_ENV, isConversationName, withoutConversationNames, handedNames, markOf, withHandedMark, namesOfMark, floorMarkOf };
