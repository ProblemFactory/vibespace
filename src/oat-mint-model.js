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

/** The secret never rides out in words: any sk-ant-… run is masked, and so is
 *  whatever stands after the code prompt on its line — the PTY echoes a pasted
 *  code there (lane door-signin-fixes: a failed run's text carried it). */
function redact(s) { return String(s || '').replace(/sk-ant-[\w-]*/g, 'sk-ant-…').replace(/(paste\s+(?:the\s+)?code\s+here)[^\n]*/gi, '$1 …'); }

/** The CLI's last meaningful line (spinner frames skipped), masked, ≤ 300. */
function lastLine(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter((l) => l && !SPINNER_LINE_RE.test(l));
  return redact(lines.length ? lines[lines.length - 1] : '').slice(0, 300);
}

/** The sign-in URL (lane signin-card-real-screen: the blank-line rule read only
 *  the 2.1.296 setup-token screen — `claude auth login --claudeai` (2.1.308 /
 *  2.1.309, measured) prints the prompt on the VERY NEXT line, so the card sat
 *  at «starting» for 10 minutes on every fleet pod). Two reads, ONE reader for
 *  both roads:
 *   · the OSC-8 hyperlink's TARGET in the raw stream — the whole URL in one
 *     piece however the visible text wraps, complete once its terminator
 *     arrived (both CLIs wrap the URL in one);
 *   · else the visible text: from https:// to the end of its line, wrapped
 *     pieces (a line of URL characters only) joined, ended by a blank line, a
 *     line of words or the code prompt. Complete only once the line after it
 *     has begun — never a half URL. */
const OSC8_URL_RE = /\x1b\]8;[^;\x07\x1b]*;(https:\/\/[^\x07\x1b\s]+)(?:\x07|\x1b\\)/;
const URL_OK_RE = /^https:\/\/[^\s"'<>]+$/;
const URL_PIECE_RE = /^[^\s"'<>]+$/;
const urlOk = (u) => (URL_OK_RE.test(u) && u.length <= 4096 ? u : null);
function findUrl(text, raw) {
  if (raw) { const o = OSC8_URL_RE.exec(String(raw)); if (o && urlOk(o[1])) return o[1]; }
  const m = URL_START_RE.exec(text);
  if (!m) return null;
  const lines = text.slice(m.index).split('\n');
  const head = lines[0].replace(/\s+$/, '');
  let url = head.match(/^\S+/)[0];
  if (url.length < head.length) return urlOk(url); // words after it on its line: the URL ended there
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (i === lines.length - 1) return l && (PROMPT_RE.test(l) || /\s/.test(l)) ? urlOk(url) : null; // the next line still arriving
    if (!l || /\s/.test(l) || PROMPT_RE.test(l) || !URL_PIECE_RE.test(l)) return urlOk(url); // a blank line, words, the prompt
    url += l; // a wrapped piece
  }
  return null;
}

// THE SCREEN THE READER KNOWS (lane signin-card-real-screen, owner 2026-10-23
// 04:2x: 「其实你应该提供兜底的，如果解析不出来还能切换成旧模式查看」). Every line
// either road's REAL screen prints (the 2.1.296 setup-token captures, the
// 2.1.308 / 2.1.309 auth-login captures) matches a row; a line that matches
// none, standing after everything recognised, flips the card to the raw screen
// until the reader recognises a state again. Spinner frames and blank lines
// are no lines.
const KNOWN_LINES = Object.freeze([
  /^welcome to claude code\b/i, /long-lived|auth token setup|subscription required/i,
  /opening browser/i, /browser didn.t open/i, /https:\/\//, PROMPT_RE,
  /token created successfully|your oauth token|store this token|sk-ant-/i,
  /^(?:[✗×!]\s*)?(?:oauth error|invalid code|error:)/i,
  /^vibespace:/i, /subscription credentials saved|login\s+success|logged\s+in/i,
  /hold shift while selecting/i, // 2.1.296's copy hint under the URL
  /^[^\p{L}\p{N}]+$/u, // a line without a word or a digit: the banner's drawing, a rule
]);
/** Does the screen end on a line the reader cannot place? (the raw-view flip)
 *  `typed` = the code the person pasted: the tty echoes it, on its own line when the prompt ended its line. */
function screenUnknown(text, known = KNOWN_LINES, { typed = null } = {}) {
  const lines = String(text || '').split('\n');
  let unknown = false, inUrl = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const last = i === lines.length - 1;
    if (!l) { inUrl = false; continue; }
    if (SPINNER_LINE_RE.test(l)) continue;
    const isKnown = known.some((re) => re.test(l)) || (inUrl && URL_PIECE_RE.test(l)) || (typeof typed === 'string' && typed.length >= 4 && l.includes(typed));
    if (last && !isKnown) break; // a line still arriving is not yet a verdict
    unknown = !isKnown;
    inUrl = /https:\/\/\S+$/.test(l) || (inUrl && URL_PIECE_RE.test(l));
  }
  return unknown;
}

// THE RAW SCREEN (the owner's fallback): the bytes as the CLI wrote them, in
// hub memory only — answered to the person's own card on request, never
// broadcast, logged or written. `stopRe` freezes it for good before a matching
// chunk lands (the mint road: nothing from the token's success screen on is
// ever kept — the token's one road holds). Offsets count characters appended.
const RAW_MAX = 64 * 1024;
function initialRawScreen() { return { start: 0, data: '', frozen: false }; }
function rawAppend(scr, chunk, { stopRe = null } = {}) {
  const s = scr && typeof scr.data === 'string' ? scr : initialRawScreen();
  if (s.frozen) return s;
  const d = String(chunk || '');
  if (!d) return s;
  if (stopRe && stopRe.test(cleanPty(s.data.slice(-1024) + d))) return { ...s, frozen: true };
  let data = s.data + d, start = s.start;
  if (data.length > RAW_MAX) { start += data.length - RAW_MAX; data = data.slice(data.length - RAW_MAX); }
  return { start, data, frozen: false };
}
/** What a card that has `from` characters lacks: { from, to, data, reset }.
 *  `mask` = the code the person pasted: the tty ECHOES it onto the prompt's
 *  line, and a typed secret never rides out of the hub (the door-signin-fixes
 *  law, test-oat-mint §4) — it reads as • of the same length (offsets kept),
 *  a half-arrived echo at the end too. Nothing else is touched. */
function rawSince(scr, from, { mask = null } = {}) {
  const s = scr && typeof scr.data === 'string' ? scr : initialRawScreen();
  const end = s.start + s.data.length;
  let data = s.data;
  const m = typeof mask === 'string' && mask.length >= 4 ? mask : null;
  if (m) {
    const dots = (n) => '•'.repeat(n);
    data = data.split(m).join(dots(m.length));
    for (let k = Math.min(m.length - 1, data.length); k >= 4; k--) if (data.endsWith(m.slice(0, k))) { data = data.slice(0, data.length - k) + dots(k); break; }
  }
  const f = Number(from);
  if (!Number.isFinite(f) || f < s.start || f > end) return { from: s.start, to: end, data, reset: true };
  return { from: f, to: end, data: data.slice(f - s.start), reset: false };
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

function mintStep(state, chunk, { final = false, typed = null } = {}) {
  const s = state && typeof state.raw === 'string' ? state : initialMintParse();
  let raw = s.raw + String(chunk || '');
  if (raw.length > MAX_RAW) raw = raw.slice(raw.length - MAX_RAW);
  const seen = { ...s.seen };
  const text = cleanPty(raw);
  const steps = [];
  if (!seen.url) { const url = findUrl(text, raw); if (url) { seen.url = true; steps.push({ kind: 'url', url }); } }
  if (!seen.prompt && PROMPT_RE.test(text)) { seen.prompt = true; steps.push({ kind: 'code-prompt' }); }
  if (!seen.token) {
    const token = findToken(text, final);
    if (token) { seen.token = true; steps.push({ kind: 'token', token }); }
  }
  if (!seen.token && !seen.error) {
    const e = ERROR_RE.exec(text);
    if (e) { seen.error = true; steps.push({ kind: 'error', line: redact(e[1]).slice(0, 300) }); }
  }
  // the token's success screen (its wrapped pieces read as unknown lines until «Store this token» lands) is never the
  // raw-screen flip — the mint's raw screen is frozen there, and the token rides only its step
  const tokenScreen = /token created successfully|your\s+oauth\s+token/i.test(text);
  return { state: { raw: seen.token ? '' : raw, seen }, steps, lastLine: lastLine(text), unknown: !seen.token && !tokenScreen && screenUnknown(text, KNOWN_LINES, { typed }) };
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
    rawHint: (m.rawHint === 'stalled' || m.rawHint === 'unknown') && !MINT_DONE.includes(m.phase) ? m.rawHint : null, // lane signin-card-real-screen: the raw screen's cue
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

module.exports = { cleanPty, redact, lastLine, findUrl, screenUnknown, KNOWN_LINES, initialRawScreen, rawAppend, rawSince, RAW_MAX, findToken, initialMintParse, mintStep, publicMint, mintShowVerdict, codeVerdict, identityVerdict, mintEnvOf, MINT_ENV_ALLOW, MINT_PHASES, MINT_DONE, MINT_REASONS };
