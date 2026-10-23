'use strict';
// THE HUMANE CLAUDE SIGN-IN, READ OFF THE CLI'S SCREEN (lane door-signin-card,
// owner 2026-10-22: 7 naive fleet testers — naive-cluster-1 (D1/D2/D3/D4/D9)
// and naive-cluster-2 (B1/C2/C3/M1) — ALL stopped at the Claude sign-in. It is
// a terminal TUI: a colour-theme picker with a code sample, "Select login
// method 1/2/3" (subscription / Console API / Bedrock-Vertex), a sign-in link
// cut at the window edge, "Paste code here if prompted > ", then "Security
// notes" and "Do you trust this folder?" defaulting to "No, exit". A silent
// user with no colleague to drive it never gets past it. Owner's ruling: the
// sign-in STAYS per person, made humane.)
//
// The product now drives the official `claude auth login --claudeai` itself, in
// a hub-owned PTY (cols 400, so the URL is never wrapped) over a SEEDED config
// dir — src/harnesses/claude.js seedDir answers theme + trust + onboarding, and
// --claudeai preselects the subscription — so the person meets no terminal, no
// theme picker, no method menu and no trust prompt: ONE card with the sign-in
// link and a paste-the-code box.
//
// PURE: imports only the sibling src/oat-mint-model.js (the OAT mint's proven
// login-screen reader). THE INVARIANT: a harness's login screen is read in ONE
// place — the subscription login prints the SAME screen shape as `claude
// setup-token` up to the code prompt (measured 2.1.296, oat-mint-model header:
// "Browser didn't open? Use the url below to sign in", a blank line, the OAuth
// URL, a blank line, "Paste code here if prompted > "). It ENDS with a login,
// not a printed token: VibeSpace's helper (data/bin/vibespace-claude-
// subscription-login.mjs) prints "VibeSpace: subscription credentials saved."
// on success; a failure is the CLI's "OAuth error: …" / "Invalid code." or the
// helper's own one-line error. The card's own secret road is none — the OAuth
// login prints no token; the credential bytes are the helper's, read in-process
// at finalize and never seen here.

const { cleanPty, redact, lastLine, findUrl, screenUnknown, KNOWN_LINES, codeVerdict } = require('./oat-mint-model.js');

const MAX_RAW = 256 * 1024;
const PROMPT_RE = /paste\s+(?:the\s+)?code\s+here/i;
// success: VibeSpace's helper line, or the CLI's own "logged in" wording
const DONE_RE = /subscription credentials saved|login\s+success(?:ful)?|you\s+are\s+now\s+logged\s+in|logged\s+in\s+as\b/i;
// a failure said in one line (the exit-code path is the ORCH's backstop)
const ERROR_RE = /^\s*(?:[✗×!]\s*)?((?:OAuth|Login|Authentication)\s+(?:error|failed)[:.][^\n]*|Invalid code\.[^\n]*|VibeSpace:[^\n]*(?:could not|no OAuth credential|was not valid)[^\n]*)$/im;

const SIGNIN_PHASES = Object.freeze(['starting', 'url', 'waiting-code', 'connecting', 'connected', 'failed', 'cancelled']);
const SIGNIN_DONE = Object.freeze(['connected', 'failed', 'cancelled']);
const RAW_HINTS = Object.freeze(['stalled', 'unknown']);
// the owner's N (2026-10-23 04:2x, recommended 4 s): no link read this long after the CLI's first output ⇒ the raw screen
const RAW_AFTER_MS = 4000;

// A SECRET TYPED INTO A PTY NEVER RIDES ITS FAILURE TEXT (lane door-signin-fixes,
// the verify's claim 2): the tty echoes the pasted code onto the prompt's line,
// so «the screen's last line» after a code is `Paste code here if prompted >
// <code>`. A run that dies silently AFTER a code was sent says this fixed
// sentence (the ORCH's exit backstop never reads the screen then), and every
// last line it publishes is cut at the prompt.
const ENDED_AFTER_CODE = 'the sign-in ended before Claude confirmed it — try again';
function cutAtPrompt(line) {
  const s = String(line || '');
  const m = PROMPT_RE.exec(s);
  return (m ? s.slice(0, m.index) : s).trim();
}

function initialSigninParse() { return { raw: '', seen: { url: false, prompt: false, done: false, error: false } }; }

// signinStep(state, chunk[, {final}]) → { state, steps, lastLine }. steps are
// { kind: 'url', url } | { kind: 'code-prompt' } | { kind: 'connected' } |
// { kind: 'error', line }. `state` is the parser's own (the screen so far).
function signinStep(state, chunk, { final = false, typed = null } = {}) {
  const s = state && typeof state.raw === 'string' ? state : initialSigninParse();
  let raw = s.raw + String(chunk || '');
  if (raw.length > MAX_RAW) raw = raw.slice(raw.length - MAX_RAW);
  const seen = { ...s.seen };
  const text = cleanPty(raw);
  const steps = [];
  if (!seen.url) { const url = findUrl(text, raw); if (url) { seen.url = true; steps.push({ kind: 'url', url }); } }
  if (!seen.prompt && PROMPT_RE.test(text)) { seen.prompt = true; steps.push({ kind: 'code-prompt' }); }
  if (!seen.done && DONE_RE.test(text)) { seen.done = true; steps.push({ kind: 'connected' }); }
  if (!seen.done && !seen.error) { const e = ERROR_RE.exec(text); if (e) { seen.error = true; steps.push({ kind: 'error', line: redact(e[1]).slice(0, 300) }); } }
  return { state: { raw, seen }, steps, lastLine: cutAtPrompt(lastLine(text)), unknown: screenUnknown(text, KNOWN_LINES, { typed }) };
}

// THE CARD, from the live flow — ONE verdict for all three walls (the chat's
// "not logged in" card, the tour's connect step, Manage agents). `flow` =
// publicSignin's whitelist { phase, url, error, email }; `hasWaiting` = the
// chat has a message waiting to re-send after the sign-in lands. Returns the
// render model the card draws. NO strings are localised here (the client wraps
// each state with its own t()) — PURE stays language-free. States are exactly
// the brief's five: no-login / url-shown / waiting-code / connected / failed+why.
function signinCardView(flow = {}, { hasWaiting = false } = {}) {
  const phase = SIGNIN_PHASES.includes(flow.phase) ? flow.phase : null;
  const url = typeof flow.url === 'string' && /^https:\/\//.test(flow.url) ? flow.url : null;
  // lane signin-card-real-screen: the raw screen's cue — the reader saw no link within RAW_AFTER_MS of the
  // CLI's first output ('stalled') or the screen ends on a line it cannot place ('unknown'); null = the parsed view
  const rawHint = RAW_HINTS.includes(flow.rawHint) && phase && !SIGNIN_DONE.includes(phase) ? flow.rawHint : null;
  switch (phase) {
    case 'connected': return { state: 'connected', email: typeof flow.email === 'string' && flow.email ? flow.email : null, canResend: !!hasWaiting, madeDefault: flow.madeDefault === true };
    case 'failed': return { state: 'failed', why: flow.error ? redact(String(flow.error)).slice(0, 300) : null };
    case 'cancelled': return { state: 'no-login' };
    case 'connecting': return { state: 'waiting-code', url, submitting: true, rawHint };
    case 'waiting-code': return { state: 'waiting-code', url, submitting: false, rawHint };
    // a LIVE run never shows a pressable «Sign in» again (the debris: each press made a row) — it is starting,
    // and says so; a code box opens on the raw screen, where the person reads the prompt themselves
    case 'url': return url ? { state: 'url-shown', url, rawHint } : { state: 'starting', rawHint };
    case 'starting': return { state: 'starting', rawHint };
    default: return { state: 'no-login' };
  }
}

// THE WAITING TURN (lane door-signin-fixes, the verify's claim 5): «Send my
// message again» re-sends ONLY a turn the person typed that nothing answered,
// read AT THE WALL (when the chat's card mounts) by walking back from the
// newest message: an answer (an assistant or tool message that is not the
// CLI's own login refusal) ends the walk — nothing is waiting; a record the
// person did not type (a notification, a peer message, VibeSpace's own
// continue, the CLI's page images) is passed over; the first typed turn is the
// one — its words, an image-attached turn's included. A waiting turn of images
// alone has no words to re-send ⇒ ''. Never an OLDER turn. A history-resumed
// conversation that dies at boot has its last turn answered ⇒ '' (no button).
const LOGIN_REFUSAL_RE = /Not logged in|Please run \/login|OAuth token revoked/; // classifyCliDeath's own line
const textOf = (m) => (Array.isArray(m && m.content) ? m.content : []).filter((b) => b && b.type !== 'image' && typeof b.text === 'string').map((b) => b.text).join('\n').trim();
function answers(m) {
  const meta = m.meta || null;
  const spent = meta && meta.usage && ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].some((k) => Number(meta.usage[k]) > 0);
  const synthetic = !!meta && (meta.model == null || meta.model === '<synthetic>') && !spent; // the CLI's own record: no request was made
  return !(synthetic || (m.role === 'assistant' && LOGIN_REFUSAL_RE.test(textOf(m))));
}
function waitingTurnOf(messages) {
  const msgs = Array.isArray(messages) ? messages : [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m) continue;
    if (m.role === 'assistant' || m.role === 'tool') { if (answers(m)) return ''; continue; }
    if (m.role !== 'user' || m.imageAttachment || m.synthetic || m.originKind || m.typed === false) continue;
    return textOf(m);
  }
  return '';
}

// WHICH WALL A CHAT'S «not logged in» GETS (lane door-signin-fixes, the
// verify's claim 8): the card makes and finalizes a SUBSCRIPTION account of the
// harness whose subscriptions are OAuth logins in their own dir (the declared
// caps row `oauthUsage` — read by the caller, never an id) and drives that
// login on the LOCAL hub only — any other harness's death, or a remote-host
// one, keeps the terminal road and its words. 'card' | 'terminal'.
function signinWallOf({ oauthSubscription = false, host = null } = {}) { return oauthSubscription === true && !host ? 'card' : 'terminal'; }

// THE CLI'S LIVE LOGIN REFUSAL (lane signin-card-real-screen, measured on the
// real 2.1.308 in stream-json mode with a credential-less config dir — fixture
// scripts/fixtures/claude-signin/cli-2.1.308-not-logged-in.jsonl): the CLI no
// longer DIES not-logged-in. It answers each turn with a synthetic assistant
// record — model `<synthetic>`, zero usage, `error: "authentication_failed"`,
// `is_api_error_message: true`, text «Not logged in · Please run /login» — and
// waits for the next one, so the death classifier (classifyCliDeath, untouched:
// it still names real deaths) never ran and the chat never showed the card.
// A TABLE: each row names a live record that means «this conversation cannot go
// on until someone signs in», read by the claude stream consumer.
const LIVE_WALLS = Object.freeze([
  Object.freeze({ reason: 'not_logged_in', record: 'assistant', error: 'authentication_failed', text: /Not logged in|Please run \/login/ }),
]);
function liveWallOf(rec) {
  if (!rec || typeof rec !== 'object' || rec.parent_tool_use_id) return null;
  const msg = rec.message || {};
  const text = (Array.isArray(msg.content) ? msg.content : []).filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n').trim();
  for (const w of LIVE_WALLS) {
    // the CLI's OWN words on its own record (never a model's text quoting them, never an API 401 a pool routes around)
    if (rec.type !== w.record || msg.model !== '<synthetic>' || !w.text.test(text) || (rec.error != null && rec.error !== w.error)) continue;
    return { reason: w.reason, detail: text.replace(/[\x00-\x1f\x7f]+/g, ' ').slice(0, 200) };
  }
  return null;
}

// THE FIRST SIGN-IN BECOMES THE DEFAULT (lane signin-card-real-screen, 主开发
// 2026-10-23 04:27): a fresh fleet pod has no default Claude account and no
// global login, so a chat started after the card's sign-in still ran on the
// signed-out global login. The card's own row becomes the default ONLY when
// nothing else could serve: no Claude default, the machine's global login
// signed out (read off its file — unknowable where the CLI keeps it in the
// macOS Keychain, so never there), no ANTHROPIC_API_KEY. A default that exists
// is never swapped. → true | false.
function firstSigninDefault({ cardRow = false, loggedIn = false, hasDefault = true, globalLoggedIn = true, platform = '', envKey = false } = {}) {
  return cardRow === true && loggedIn === true && hasDefault === false && globalLoggedIn === false && platform !== 'darwin' && envKey !== true;
}

// What leaves the server about a sign-in (GET + the WS `claude-signin`
// broadcast): a whitelist. No credential, no scratch path — only the URL to
// open, the phase, the account's email on success and a one-line error.
function publicSignin(m) {
  if (!m) return null;
  return {
    id: String(m.id), accountId: String(m.accountId),
    phase: SIGNIN_PHASES.includes(m.phase) ? m.phase : 'failed',
    rev: Number(m.rev) || 0, // the publication this snapshot is (signinShowVerdict)
    url: typeof m.url === 'string' ? m.url : null,
    error: m.error ? redact(m.error).slice(0, 300) : null,
    email: typeof m.email === 'string' && m.email ? redact(m.email).slice(0, 120) : null,
    startedAt: Number(m.startedAt) || 0, endedAt: Number(m.endedAt) || null,
    rawHint: RAW_HINTS.includes(m.rawHint) ? m.rawHint : null, // lane signin-card-real-screen: the raw screen's cue (never the screen itself)
  };
}

// May a page draw `incoming` over the sign-in it shows? (lane heavy3-flake-races,
// borrowed from mintShowVerdict: a late HTTP answer never repaints over a newer
// WS push.) 'show' | 'older-run' | 'stale'.
function signinShowVerdict(shown, incoming) {
  if (!incoming || !shown) return 'show';
  if (incoming.id !== shown.id) return !SIGNIN_DONE.includes(shown.phase) && Number(incoming.startedAt) < Number(shown.startedAt) ? 'older-run' : 'show';
  return (Number(incoming.rev) || 0) < (Number(shown.rev) || 0) ? 'stale' : 'show';
}

module.exports = {
  initialSigninParse, signinStep, signinCardView, publicSignin, signinShowVerdict, codeVerdict,
  cutAtPrompt, waitingTurnOf, signinWallOf, liveWallOf, firstSigninDefault,
  SIGNIN_PHASES, SIGNIN_DONE, RAW_HINTS, RAW_AFTER_MS, LIVE_WALLS, PROMPT_RE, DONE_RE, ERROR_RE, ENDED_AFTER_CODE,
};
