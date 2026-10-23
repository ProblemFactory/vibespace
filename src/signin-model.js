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

const { cleanPty, redact, lastLine, findUrl, codeVerdict } = require('./oat-mint-model.js');

const MAX_RAW = 256 * 1024;
const PROMPT_RE = /paste\s+(?:the\s+)?code\s+here/i;
// success: VibeSpace's helper line, or the CLI's own "logged in" wording
const DONE_RE = /subscription credentials saved|login\s+success(?:ful)?|you\s+are\s+now\s+logged\s+in|logged\s+in\s+as\b/i;
// a failure said in one line (the exit-code path is the ORCH's backstop)
const ERROR_RE = /^\s*(?:[✗×!]\s*)?((?:OAuth|Login|Authentication)\s+(?:error|failed)[:.][^\n]*|Invalid code\.[^\n]*|VibeSpace:[^\n]*(?:could not|no OAuth credential|was not valid)[^\n]*)$/im;

const SIGNIN_PHASES = Object.freeze(['starting', 'url', 'waiting-code', 'connecting', 'connected', 'failed', 'cancelled']);
const SIGNIN_DONE = Object.freeze(['connected', 'failed', 'cancelled']);

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
function signinStep(state, chunk, { final = false } = {}) {
  const s = state && typeof state.raw === 'string' ? state : initialSigninParse();
  let raw = s.raw + String(chunk || '');
  if (raw.length > MAX_RAW) raw = raw.slice(raw.length - MAX_RAW);
  const seen = { ...s.seen };
  const text = cleanPty(raw);
  const steps = [];
  if (!seen.url) { const url = findUrl(text); if (url) { seen.url = true; steps.push({ kind: 'url', url }); } }
  if (!seen.prompt && PROMPT_RE.test(text)) { seen.prompt = true; steps.push({ kind: 'code-prompt' }); }
  if (!seen.done && DONE_RE.test(text)) { seen.done = true; steps.push({ kind: 'connected' }); }
  if (!seen.done && !seen.error) { const e = ERROR_RE.exec(text); if (e) { seen.error = true; steps.push({ kind: 'error', line: redact(e[1]).slice(0, 300) }); } }
  return { state: { raw, seen }, steps, lastLine: cutAtPrompt(lastLine(text)) };
}

// THE CARD, from the live flow — ONE verdict for all three walls (the chat's
// "not logged in" card, the tour's connect step, Manage agents). `flow` =
// publicSignin's whitelist { phase, url, error, email }; `hasWaiting` = the
// chat has a message waiting to re-send after the sign-in lands. Returns the
// render model the card draws. NO strings are localised here (the client wraps
// each state with its own t()) — PURE stays language-free. States are exactly
// the brief's five: no-login / url-shown / waiting-code / connected / failed+why.
function signinCardView(flow = {}, { hasWaiting = false } = {}) {
  const phase = SIGNIN_PHASES.includes(flow.phase) ? flow.phase : 'starting';
  const url = typeof flow.url === 'string' && /^https:\/\//.test(flow.url) ? flow.url : null;
  switch (phase) {
    case 'connected': return { state: 'connected', email: typeof flow.email === 'string' && flow.email ? flow.email : null, canResend: !!hasWaiting };
    case 'failed': return { state: 'failed', why: flow.error ? redact(String(flow.error)).slice(0, 300) : null };
    case 'connecting': return { state: 'waiting-code', url, submitting: true };
    case 'waiting-code': return { state: 'waiting-code', url, submitting: false };
    case 'url': return url ? { state: 'url-shown', url } : { state: 'no-login' };
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
  cutAtPrompt, waitingTurnOf, signinWallOf,
  SIGNIN_PHASES, SIGNIN_DONE, PROMPT_RE, DONE_RE, ERROR_RE, ENDED_AFTER_CODE,
};
