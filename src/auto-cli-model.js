'use strict';
/**
 * THE AUTO-CLI PANEL PROBE'S ACCOUNT VERDICTS — PURE (imports only src/secret-shapes.js; CJS so the hub, the bundle
 * and a suite share one copy). Lane auto-cli-oat-unprobeable (2026-10-22, the owner: «为什么现在开始出现很多长时间没刷新过
 * 用量信息的账户 因为一直没用到过吗？» — six rows 35–48 h old).
 *
 * MEASURED on the owner's hub (2.369.340): every one of the six was a row whose OAuth login had ended while its
 * long-lived token stayed valid (loginState 'oat-only', the row's 「仅长期 token」). refreshViaCliPanel has refused
 * such a row by name since 2026-10-13 (no spawn — it held that a long-lived token cannot read the panel), but it answered
 * `false`, and the auto-cli loop booked every refusal as a FAILED probe: 11–36 consecutive "failures" in
 * data/auto-cli-state.json, a `failed (stale-idle; …)` journal line naming no reason, the backoff re-asking for
 * ever. Their readings refresh only passively (a session billing on the account) — the owner's guess was right,
 * and nothing said so. A probeable account's real failure was as silent: the line named no reason, the row none.
 *
 * THE ADDENDUM (主开发 2026-10-22, measured on the hub): an oat-only row's long-lived token is NOT profile-less — every
 * one carries `user:profile` (oatShape.scopes) — and `claude -p /usage` WORKS on the token MATERIALIZED in the row's
 * folder (a mint-time probe succeeded 10-20; OAT-in-file is measured PASS per CLI version). So an oat-only row is
 * PROBEABLE through the same door and the same spawn (CLAUDE_SECURESTORAGE_CONFIG_DIR = its folder, which holds the
 * token) when all three facts hold, and otherwise unprobeable WITH the fact that failed:
 *   PROBE_ELIGIBILITY  the closed table: `probeable` (a live OAuth login, or an oat-only row whose token carries
 *                      user:profile, on a CLI measured with the token in its folder, and the token IS there) |
 *                      `unprobeable:oat-no-profile` (the token lacks user:profile — the panel answers «Not logged
 *                      in», the measured oat-file-scopes refusal) | `unprobeable:cli-unmeasured` (the hub's claude CLI
 *                      is not one oatInFile measured — the folder never gets the token) | `unprobeable:oat-not-in-folder`
 *                      (measured, but the token is not written there: a refusal the row's token chip names) |
 *                      `unprobeable:no-login` (nothing to read with)
 *   probeEligibility   an accounts.list() row → one of them, read off the row's OWN facts (`loginState`, `loggedIn`,
 *                      `oatScopes`, `oatCli.measured`, `oatFile.state`, `loginState.oatFile`); null = not a subject of
 *                      the panel rung (not a subscription, a pool — it has no login of its own — or a harness whose
 *                      quota rung is not `cli-usage`). The loop, the probe door and the row read the SAME verdict;
 *                      the checks run in that order (no profile ⇒ nothing else matters; unmeasured ⇒ no file).
 *   notProbedWords     the journal's words for an unprobeable account (said ONCE a day per kind — NOT_PROBED_SAY_MS)
 *   probeFailWhy       a failed spawn's record ({exitCode, rawStdout, rawStderr, why}) → the reason: `exit N: <the
 *                      CLI's first line>` / `no quota lines in its answer: <its first line>` — a `Warning:` line is
 *                      skipped (the CLI's stdin warning rides every probe, the successful ones too)
 *   probeWhyText       THE ONE SCRUB every stored or logged reason passes: control characters out, secret-shapes'
 *                      redactSecrets (R1–R8, key-material runs included — nothing to diagnose in a key), then the
 *                      bound (WHY_MAX); a cut lands after the redaction, so it can only shorten, never reveal
 *   probeRecordOf      an account record's `probe` fact ({at, ok: false, why}) bounded, or null
 */
const { redactSecrets } = require('./secret-shapes.js');

const PROBEABLE = 'probeable';
const OAT_NO_PROFILE = 'unprobeable:oat-no-profile';
const CLI_UNMEASURED = 'unprobeable:cli-unmeasured';
const OAT_NOT_IN_FOLDER = 'unprobeable:oat-not-in-folder';
const NO_LOGIN = 'unprobeable:no-login';
// THE PANEL SERVES LIVE LOGINS ONLY (lane pool-silent-members R3, inc-mvsjhna7): every probe of a token-in-folder row in
// the owner's log since 10-26 (six rows, 4–14 probes each — on 2.1.308 as well as 2.1.312) answered only «You are currently
// using your subscription to power your Claude Code usage» with no quota line. The 2.369.342 premise («the folder's token IS
// probed») does not hold: such a row is read passively (a session on it) or by the owner's own session, never spawned for.
const OAT_FOLDER_NO_PANEL = 'unprobeable:oat-folder-no-panel';
const PROBE_ELIGIBILITY = Object.freeze([PROBEABLE, OAT_NO_PROFILE, CLI_UNMEASURED, OAT_NOT_IN_FOLDER, OAT_FOLDER_NO_PANEL, NO_LOGIN]);
const OAT_KINDS = Object.freeze([OAT_NO_PROFILE, CLI_UNMEASURED, OAT_NOT_IN_FOLDER, OAT_FOLDER_NO_PANEL]); // the oat-only row's four named facts
const PROFILE_SCOPE = 'user:profile'; // the scope the /usage panel reads the account with (measured: oat-file-scopes)
const VERSION_RE = /^[0-9A-Za-z.+-]{1,40}$/;
const NOT_PROBED_SAY_MS = 24 * 3600e3; // one "not probed" line per account per day
const LINE_MAX = 1024;                 // characters of one output line judged (the redaction runs over this)
const WHY_MAX = 200;                   // characters of a stored / logged reason

/** An accounts.list() row → its panel-probe eligibility; null = not a subject of the `cli-usage` rung. */
function probeEligibility(row, { quotaProbe = 'cli-usage' } = {}) {
  if (!row || typeof row !== 'object' || row.type !== 'subscription' || row.pooled || quotaProbe !== 'cli-usage') return null;
  const ls = row.loginState && typeof row.loginState === 'object' ? row.loginState : null;
  if (ls && ls.state === 'oat-only') { // checked FIRST: an expired login (or our token file) still parses loggedIn
    if (!(Array.isArray(row.oatScopes) && row.oatScopes.includes(PROFILE_SCOPE))) return OAT_NO_PROFILE;
    if (!(row.oatCli && row.oatCli.measured === true)) return CLI_UNMEASURED;
    if (!(ls.oatFile === true && row.oatFile && row.oatFile.state === 'written')) return OAT_NOT_IN_FOLDER;
    return OAT_FOLDER_NO_PANEL; // the folder holds the token the CLI spends — but the panel prints no quota line for it (R3)
  }
  if (!row.loggedIn) return NO_LOGIN;
  return PROBEABLE;
}
const isUnprobeable = (el) => el === NO_LOGIN || OAT_KINDS.includes(el);
/** The journal's words for an unprobeable row (`not probed — <these>`), naming the fact that failed. */
function notProbedWords(el, row = null) {
  const cli = row && row.oatCli && typeof row.oatCli.cli === 'string' && VERSION_RE.test(row.oatCli.cli) ? row.oatCli.cli : '?';
  const why = row && row.oatFile && typeof row.oatFile.reason === 'string' && /^[a-z-]{1,40}$/.test(row.oatFile.reason) ? row.oatFile.reason : '';
  if (el === OAT_NO_PROFILE) return 'long-lived token only, without the user:profile scope the usage panel reads; refreshes when a session uses it';
  if (el === CLI_UNMEASURED) return `long-lived token only, and claude ${cli} is not measured with it in the account's folder; refreshes when a session uses it`;
  if (el === OAT_NOT_IN_FOLDER) return `long-lived token only, not written to the account's folder${why ? ` (${why})` : ''}; refreshes when a session uses it`;
  if (el === OAT_FOLDER_NO_PANEL) return `long-lived token in the account's folder: claude ${cli} prints no quota lines for a folder-token login; refreshes when a session uses it`;
  if (el === NO_LOGIN) return 'not logged in; nothing to read its quota with until it is';
  return '';
}

// eslint-disable-next-line no-control-regex
const CTRL_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[@-_]|[\x00-\x08\x0b-\x1f\x7f]/g;
/** THE ONE SCRUB (see the header): any text → a bounded, single-line, secret-free reason ('' for nothing). */
function probeWhyText(raw) {
  let s = String(raw == null ? '' : raw).slice(0, LINE_MAX).replace(/\r?\n|\r/g, ' ').replace(CTRL_RE, '');
  s = redactSecrets(s, { runs: true }).text.replace(/\s+/g, ' ').trim();
  return s.length > WHY_MAX ? s.slice(0, WHY_MAX - 1) + '…' : s;
}
/** The first line worth naming in a stream: not blank, not a `Warning:` line. */
function firstLine(text) {
  for (const l of String(text == null ? '' : text).slice(0, 64 * 1024).split(/\r?\n/)) {
    const t = l.replace(CTRL_RE, '').trim();
    if (t && !/^warning\b/i.test(t)) return t;
  }
  return '';
}
// A PANEL ANSWER WITH NO QUOTA LINE, BY WHAT THE CLI SAID (lane pool-silent-members R3, measured in the owner's log 10-28):
//   'no-login'      the CLI's non-subscriber cost summary («Total cost: $0.0000 / Total duration (API) / … / Usage: N
//                   input…») — printed when the folder holds NO credential (the env token is stripped): a missing login,
//                   never a parser drift (85/85 live-login probes parsed the full panel on the same 2.1.312 that day)
//   'folder-token'  only the subscription header («You are currently using your subscription…») from a row whose folder
//                   holds OUR long-lived-token file (`folderToken`) — the CLI prints no quota lines for it (every such probe
//                   since 10-26, on 2.1.308 too); the same header from a live login keeps the generic words
const COST_SUMMARY_RE = /^\s*Total cost:\s*\$\s*\d/m;
const SUB_HEADER_RE = /You are currently using your subscription/;
const QUOTA_LINE_RE = /^\s*Current (?:session|week)\b/m;
function panelAnswerClass({ rawStdout = '', rawStderr = '', folderToken = false } = {}) {
  const out = String(rawStdout == null ? '' : rawStdout).slice(0, 64 * 1024);
  if (QUOTA_LINE_RE.test(out)) return null;
  if (COST_SUMMARY_RE.test(out)) return 'no-login';
  if (folderToken === true && (SUB_HEADER_RE.test(out) || SUB_HEADER_RE.test(String(rawStderr || '').slice(0, 64 * 1024)))) return 'folder-token';
  return null;
}
/** A failed panel spawn's record → its reason (already scrubbed): what the CLI said, not a bare `failed`. `cli` = the hub's
 *  claude version, named in the folder-token class. */
function probeFailWhy({ exitCode = null, rawStdout = '', rawStderr = '', why = null, cli = null, folderToken = false } = {}) {
  const said = firstLine(rawStderr) || firstLine(rawStdout) || firstLine(why);
  const cls = exitCode === 0 ? panelAnswerClass({ rawStdout, rawStderr, folderToken }) : null;
  const v = typeof cli === 'string' && VERSION_RE.test(cli) ? cli : null;
  const head = cls === 'no-login' ? 'no login in the folder — the CLI answered as a non-subscriber'
    : cls === 'folder-token' ? `the CLI prints no quota lines for a folder-token login${v ? ` on ${v}` : ''}`
    : exitCode === 0 ? 'no quota lines in its answer' : exitCode === 'killed' ? 'killed (the 60 s limit)' : `exit ${exitCode == null ? '?' : exitCode}`;
  return probeWhyText(said ? `${head}: ${said}` : head);
}
/** An account record's `probe` fact, bounded — a hand-edited or older file never reaches a row raw. */
function probeRecordOf(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok !== false) return null;
  const at = Number(raw.at);
  if (!(at > 0)) return null;
  const why = probeWhyText(raw.why);
  return why ? { at, ok: false, why } : null;
}

module.exports = { PROBEABLE, OAT_NO_PROFILE, CLI_UNMEASURED, OAT_NOT_IN_FOLDER, OAT_FOLDER_NO_PANEL, NO_LOGIN, PROBE_ELIGIBILITY, OAT_KINDS, PROFILE_SCOPE, NOT_PROBED_SAY_MS, WHY_MAX, probeEligibility, isUnprobeable, notProbedWords, probeWhyText, panelAnswerClass, probeFailWhy, probeRecordOf };
