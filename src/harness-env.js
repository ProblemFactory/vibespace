'use strict';
/**
 * THE HARNESS CREDENTIAL ENV LAW (B-6be2, lane jobenv-strip-census, 2.369.270).
 *
 * PURE: imports nothing; every answer is over the descriptors it is handed
 * (`require('./harnesses').list()` at the callers), so a harness registered
 * later — a plugin's — joins the next call by construction.
 *
 * ONE LIST. `credentialEnvNames(descriptors)` is every environment variable
 * that can carry an agent's login: each descriptor's `creds.*EnvVar` /
 * `creds.*EnvVars` (spawnEnvVar — the account's relocated store; homeEnvVar —
 * the CLI's whole config dir; keyEnvVars — the key/token names the account
 * resolver writes) plus VENDOR_CREDENTIAL_ENV, the names the vendor CLIs read
 * as a login whether or not VibeSpace manages that harness's accounts. The
 * descriptor is the source: a new `creds.fooEnvVar` joins the list with no
 * edit here (scripts/test-harness-contract.mjs plants one and watches both
 * doors drop it).
 *
 * TWO DOORS.
 *   · THE JOB DOOR (src/jobs.js jobEnv) strips the WHOLE list. A Background
 *     Work job holds no agent login of any kind: before this law the strip
 *     was typed by hand (ANTHROPIC_API_KEY + CLAUDE_SECURESTORAGE_CONFIG_DIR)
 *     and codex's CODEX_HOME rode into every job (job-vendor-ban verify r3).
 *     A job's OWN env and secrets are laid on after the strip and win — they
 *     are the owner's deliberate choice, vetted by job-model vetSpec.
 *   · THE AGENT DOOR (src/agent-env.js agentEnv / daemonEnv, handed this
 *     answer by every server-side caller) strips `agentCredentialEnvNames`:
 *     every name a descriptor DECLARES (spawnEnvVar + keyEnvVars — the names
 *     VibeSpace itself writes to pick an account at spawn — and any future
 *     `creds.*EnvVar`), so an ambient copy can never bill a session for an
 *     account it did not pick.
 *     It KEEPS a harness's homeEnvVar: a no-account spawn deliberately runs
 *     on the machine login, and the server reads the same variable as its own
 *     home (codex creds.sharedHome(), agentd's transcript discovery) — a
 *     stripped CODEX_HOME would split the transcripts from their reader. It
 *     keeps the fixed vendor names no descriptor writes (OPENAI_API_KEY,
 *     ANTHROPIC_AUTH_TOKEN, …): an OpenCode or ACP agent may hold its own
 *     login that way, and the agent filter stays a NARROW denylist
 *     (scripts/test-agent-env.mjs).
 */

/** What the vendor CLIs read from the environment as a login, MEASURED in the
 *  binaries (2026-10-14: claude 2.1.296, codex-rs linux-x64 — its own words:
 *  "auth.json, OPENAI_API_KEY, CODEX_API_KEY, CODEX_ACCESS_TOKEN, no Codex
 *  credentials were found"; 2026-10-20: agy 1.4.3). Job door only. */
const VENDOR_CREDENTIAL_ENV = Object.freeze([
  'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR', 'CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR',
  'OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN',
  // the Antigravity CLI (agy 1.4.3, the names in its binary + its docs): the Gemini API-key mode, ADC sign-in, a custom
  // base URL — a job never holds an agent login (lane antigravity-harness; the agent door strips them too, through
  // the antigravity descriptor's creds.keyEnvVars)
  'GEMINI_API_KEY', 'AGY_ADC_AUTH', 'GOOGLE_GEMINI_BASE_URL',
]);

/** A creds key that names environment variables: `fooEnvVar` (one name) or `fooEnvVars` (a list). */
const ENV_FIELD = /EnvVars?$/;
const isEnvName = (v) => typeof v === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(v);

/** Every variable name one descriptor's `creds` declares, by field. */
function declaredEnvOf(desc) {
  const c = desc && desc.creds;
  const out = [];
  if (!c || typeof c !== 'object') return out;
  for (const [field, v] of Object.entries(c)) {
    if (!ENV_FIELD.test(field)) continue;
    for (const name of (Array.isArray(v) ? v : [v])) if (isEnvName(name)) out.push({ field, name });
  }
  return out;
}

const sorted = (set) => Object.freeze([...set].sort());

/** THE ONE LIST: the job door strips every name in it. */
function credentialEnvNames(descriptors) {
  const names = new Set(VENDOR_CREDENTIAL_ENV);
  for (const d of descriptors || []) for (const { name } of declaredEnvOf(d)) names.add(name);
  return sorted(names);
}

/** The agent door's share of the one list: every name a descriptor declares,
 *  minus every homeEnvVar (the machine login a no-account spawn rides). */
function agentCredentialEnvNames(descriptors) {
  const homes = new Set();
  const declared = new Set();
  for (const d of descriptors || []) {
    for (const { field, name } of declaredEnvOf(d)) (field === 'homeEnvVar' ? homes : declared).add(name);
  }
  return sorted([...declared].filter((n) => !homes.has(n)));
}

module.exports = { VENDOR_CREDENTIAL_ENV, declaredEnvOf, credentialEnvNames, agentCredentialEnvNames };
