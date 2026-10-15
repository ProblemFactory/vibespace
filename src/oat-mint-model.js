'use strict';
// THE LONG-LIVED TOKEN MINT, READ OFF THE CLI'S SCREEN (lane oat-mint-flow,
// owner 2026-10-13: the dialog closed, a terminal ran `claude setup-token`,
// and the person copied the token and reopened the dialog to paste it). PURE:
// imports nothing; src/server/oat-mint.js feeds it the PTY stream.
//
// Measured on CLI 2.1.296 (a scratch CLAUDE_CONFIG_DIR, the URL step only):
//   · spaces are drawn as cursor moves (ESC[nC forward, ESC[nG to a column
//     — "Paste code here" arrives as Paste ESC[8G code …), the URL as an OSC-8 link
//     whose text is the URL again, every line ends \r\r\n;
//   · "Browser didn't open? Use the url below to sign in (c to copy)", a
//     blank line, the URL (redirect_uri = platform.claude.com/oauth/code/
//     callback — the page shows a code), a blank line, then the prompt
//     "Paste code here if prompted > " (the code is `code#state`);
//   · $BROWSER is handed a SECOND URL with the same state whose redirect is
//     http://localhost:<port>/callback — that one completes with no code, but
//     only from a browser on the machine running the CLI;
//   · success: "✓ Long-lived authentication token created successfully!",
//     "Your OAuth token (valid for 1 year):", the token (wrapped at the
//     terminal width), "Store this token securely. …";
//   · a failure: "OAuth error: <message>".
//
// mintStep(state, chunk[, {final}]) → { state, steps }. `state` is the
// parser's own (the screen text so far); steps are { kind: 'url', url } |
// { kind: 'code-prompt' } | { kind: 'token', token } | { kind: 'error', line }.
// The token leaves ONLY as a step — the caller hands it to the store and
// drops the parser; nothing here keeps a public copy.
//
// THE SNAPSHOT'S REVISION (lane heavy3-flake-races, the oat-mint-ui flake of
// int264 / int268 / int274 / rel277): a page learns a mint twice — the HTTP
// answer of its own request (POST …/code answers `minting`) and the WS
// `oat-mint` push of every change (`saved` / `failed` / `confirm` a few ms
// later). The two ride different sockets and the answer's body is read a
// step later, so the push can be drawn FIRST and the late answer then drew
// `minting` back over it — the dialog stuck there with nothing left to move
// it. Every published change bumps `rev` (src/server/oat-mint.js emit), each
// snapshot carries it, and mintShowVerdict(shown, incoming) keeps an older
// snapshot of the SAME run from repainting a newer one ('stale'), beside the
// older run's echo ('older-run').

const MAX_RAW = 256 * 1024;
const TOKEN_RE = /sk-ant-oat\d{2}-[\w-]{20,600}/;
const URL_START_RE = /https:\/\/\S/;
const PROMPT_RE = /paste\s+(?:the\s+)?code\s+here/i;
const ERROR_RE = /^\s*(?:[✗×!]\s*)?(OAuth error:.*|Invalid code\..*|Error: .*)$/m;
const SPINNER_LINE_RE = /^[\s·✢*✶✻✽⠁-⣿]*$/;

/** The screen as text: OSC sequences out (an OSC-8 link keeps its visible
 *  text), ESC[nC → n spaces, ESC[nG → one space, every other CSI / short escape out, CR-LF and
 *  lone CR → newline. */
function cleanPty(raw) {
  return String(raw || '')
    .replace(/\r+$/, '') // a line end still arriving (\r\r … \n) is not yet a blank line
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[(\d*)C/g, (_, n) => ' '.repeat(Math.min(Number(n) || 1, 400)))
    .replace(/\x1b\[\d*G/g, ' ')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[()][0-9A-Za-z]/g, '')
    .replace(/\x1b[78=>DEHMc]/g, '')
    .replace(/\r+\n/g, '\n')
    .replace(/\r/g, '\n');
}

/** The secret never rides out in words: any sk-ant-… run is masked. */
function redact(s) { return String(s || '').replace(/sk-ant-[\w-]*/g, 'sk-ant-…'); }

/** The CLI's last meaningful line (spinner frames skipped), masked, ≤ 300. */
function lastLine(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter((l) => l && !SPINNER_LINE_RE.test(l));
  return redact(lines.length ? lines[lines.length - 1] : '').slice(0, 300);
}

/** The sign-in URL: from https:// to the first blank line, wrapped pieces
 *  joined (a narrow PTY breaks it mid-query). Complete only once the line
 *  after it has arrived — never a half URL. */
function findUrl(text) {
  const m = URL_START_RE.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index);
  const end = rest.search(/\n[ \t]*\n/);
  if (end < 0) return null;
  const url = rest.slice(0, end).replace(/\s+/g, '');
  return /^https:\/\/[^\s"'<>]+$/.test(url) && url.length <= 4096 ? url : null;
}

/** The token: after "Your OAuth token" (whitespace-joined, the CLI wraps it)
 *  up to "Store this token", or — another CLI's wording — a line holding one
 *  on its own. Only a COMPLETE token: the closing line arrived, or `final`. */
function findToken(text, final) {
  const at = text.search(/your\s+oauth\s+token/i);
  if (at >= 0) {
    const after = text.slice(at).replace(/^[^\n]*\n/, '');
    const stop = after.search(/store\s+this\s+token/i);
    if (stop < 0 && !final) return null;
    const m = TOKEN_RE.exec((stop < 0 ? after : after.slice(0, stop)).replace(/\s+/g, ''));
    return m ? m[0] : null;
  }
  const m = /(?:^|\s)(sk-ant-oat\d{2}-[\w-]{20,600})[ \t]*(?:\n|$)/m.exec(text);
  if (!m) return null;
  return (final || text.slice(m.index + m[0].length - 1).includes('\n')) ? m[1] : null;
}

function initialMintParse() { return { raw: '', seen: { url: false, prompt: false, token: false, error: false } }; }

function mintStep(state, chunk, { final = false } = {}) {
  const s = state && typeof state.raw === 'string' ? state : initialMintParse();
  let raw = s.raw + String(chunk || '');
  if (raw.length > MAX_RAW) raw = raw.slice(raw.length - MAX_RAW);
  const seen = { ...s.seen };
  const text = cleanPty(raw);
  const steps = [];
  if (!seen.url) { const url = findUrl(text); if (url) { seen.url = true; steps.push({ kind: 'url', url }); } }
  if (!seen.prompt && PROMPT_RE.test(text)) { seen.prompt = true; steps.push({ kind: 'code-prompt' }); }
  if (!seen.token) {
    const token = findToken(text, final);
    if (token) { seen.token = true; steps.push({ kind: 'token', token }); }
  }
  if (!seen.token && !seen.error) {
    const e = ERROR_RE.exec(text);
    if (e) { seen.error = true; steps.push({ kind: 'error', line: redact(e[1]).slice(0, 300) }); }
  }
  return { state: { raw: seen.token ? '' : raw, seen }, steps, lastLine: lastLine(text) };
}

// `confirm` (oat-verify F1): the CLI printed a token but nothing PROVED whose it
// is — it waits in hub memory for the person to name the account, never saved
// on its own.
const MINT_PHASES = Object.freeze(['starting', 'url', 'waiting-code', 'minting', 'confirm', 'saved', 'failed', 'cancelled']);
const MINT_DONE = Object.freeze(['saved', 'failed', 'cancelled']);
// why a mint stopped short of a save: the token proved to be ANOTHER account's
// (its sign-in identity, or its /usage window matching another row's) / nothing
// proved whose it is (the `confirm` pick)
const MINT_REASONS = Object.freeze(['identity_mismatch', 'unproven', 'anchor_mismatch']); // anchor_mismatch: a later probe disagrees with the window confirmed for the row's token (lane oat-identity-postcheck)

/** What leaves the server about a mint (GET + the WS `oat-mint` broadcast):
 *  a whitelist — the token is never a field of a mint, and nothing else is
 *  copied by accident. */
function publicMint(m) {
  if (!m) return null;
  const word = (v, n) => (typeof v === 'string' && v ? redact(v).slice(0, n) : null);
  return {
    id: String(m.id), accountId: String(m.accountId), phase: MINT_PHASES.includes(m.phase) ? m.phase : 'failed',
    rev: Number(m.rev) || 0, // lane heavy3-flake-races: the publication this snapshot is (mintShowVerdict)
    url: typeof m.url === 'string' ? m.url : null, localUrl: typeof m.localUrl === 'string' ? m.localUrl : null,
    error: m.error ? redact(m.error).slice(0, 300) : null,
    startedAt: Number(m.startedAt) || 0, endedAt: Number(m.endedAt) || null, mintedAt: Number(m.mintedAt) || null,
    // F1, display forms only — an email, a row's NAME; never a uuid, never a token
    reason: MINT_REASONS.includes(m.verdict) ? m.verdict : null,
    signedInAs: word(m.signedInAs, 120), other: word(m.other, 120),
    choices: m.phase === 'confirm' && Array.isArray(m.choices) ? m.choices.filter((c) => c && c.id).slice(0, 50).map((c) => ({ id: String(c.id), name: word(c.name, 60) || String(c.id) })) : null,
  };
}

/** lane heavy3-flake-races: may a page draw `incoming` over the mint it shows?
 *  'show' | 'older-run' (another run that started before the live one shown —
 *  its echo) | 'stale' (the same run, an earlier publication: a late HTTP
 *  answer after the WS push of a later phase). Equal revisions show (the same
 *  publication, or a fresher read of it). */
function mintShowVerdict(shown, incoming) {
  if (!incoming || !shown) return 'show';
  if (incoming.id !== shown.id) return !MINT_DONE.includes(shown.phase) && Number(incoming.startedAt) < Number(shown.startedAt) ? 'older-run' : 'show';
  return (Number(incoming.rev) || 0) < (Number(shown.rev) || 0) ? 'stale' : 'show';
}

/** A sign-in code as the person pasted it: one line, printable, ≤ 2000. */
function codeVerdict(code) {
  const c = typeof code === 'string' ? code.trim() : '';
  if (!c) return { ok: false, error: 'paste the code the sign-in page showed', code: 'empty_code' };
  if (c.length > 2000 || /[\x00-\x1f\x7f]/.test(c)) return { ok: false, error: 'that does not look like a sign-in code', code: 'bad_code' };
  return { ok: true, code: c };
}

/** WHO SIGNED IN vs WHO THE ROW IS (oat-verify F1). `row` / `signedIn` =
 *  {email, accountUuid, orgUuid} or null: the row's own login vs what the CLI
 *  left in the mint's scratch config. Every key BOTH sides know must agree (an
 *  org alone is not the account: two seats of one Team org share it); one
 *  agreeing shared key proves it; nothing to compare proves nothing.
 *  → 'match' | 'mismatch' | 'none'. */
function identityVerdict(row, signedIn) {
  const low = (v) => (v == null || v === '' ? null : String(v).trim().toLowerCase());
  let agree = 0;
  for (const k of ['accountUuid', 'email', 'orgUuid']) {
    const a = low(row && row[k]), b = low(signedIn && signedIn[k]);
    if (!a || !b) continue;
    if (a !== b) return 'mismatch';
    agree++;
  }
  return agree ? 'match' : 'none';
}

/** THE MINT CHILD'S ENV (oat-verify F2): an ALLOWLIST, never the hub's env minus
 *  a list. The CLI that signs in needs a PATH, a locale, a time zone and the
 *  hub's proxy, plus the five names the mint sets; every other hub name (API
 *  keys, cloud / GitHub / chat credentials, agent and job tokens, SSH / GPG
 *  agents, provider switches, LD_PRELOAD) stays out. */
const MINT_ENV_ALLOW = Object.freeze(['PATH', 'LANG', 'LANGUAGE', 'TZ', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy']);
function mintEnvOf(base, { home, configDir, browser } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(base || {})) if (typeof v === 'string' && (MINT_ENV_ALLOW.includes(k) || /^LC_[A-Z]+$/.test(k))) out[k] = v;
  return Object.assign(out, { HOME: String(home), CLAUDE_CONFIG_DIR: String(configDir), BROWSER: String(browser), TERM: 'xterm-256color', DISABLE_AUTOUPDATER: '1' });
}

module.exports = { cleanPty, redact, lastLine, findUrl, findToken, initialMintParse, mintStep, publicMint, mintShowVerdict, codeVerdict, identityVerdict, mintEnvOf, MINT_ENV_ALLOW, MINT_PHASES, MINT_DONE, MINT_REASONS };
